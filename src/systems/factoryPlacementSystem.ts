// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { Actor } from '../types/Actor';
import { ActorType } from '../types/Actor';
import useLocaleStore from '../stores/localeStore';
import { useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import type { FactoryVariant } from '../components/actors/factoryVariants';
import { VARIANT_CONF, selectVariantFromSeed } from '../components/actors/factoryVariants';
import { calcSilhouetteSize } from '../components/actors/silhouetteUtils';
import { getLocaleNoiseMap, getAttenuationStyleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { generateUUID } from '../utils/randomId';
import type { ColorShift } from '../utils/colorUtils';

// ========================================
// CONSTANTS
// ========================================
const WORLD_BOUNDS = { width: 1920, height: 1080 };
interface FactoryRowConfig {
  y: number;
  spreadType?: 'edges' | 'full' | 'center'; // How to spread factories across row width (default: full)
  availableFactoryTypes?: FactoryVariant[]; // Optional filter for which factory variants can be placed in this row
  factoriesPerRow: number; // Maximum number of factories in this row
  edgeWidth?: number; // For 'edges' spreadType, width of each edge segment (default: 20% of screen width)
  centerWidth?: number; // For 'center' spreadType, width of center segment (default: 40% of screen width)
  row?: 'background' | 'midground' | 'foreground'; // Optional label for rendering order and floor layering
}
// Factory placement rows (3 depth layers)
const FACTORY_ROWS: FactoryRowConfig[] = [
  // BACKGROUND
  { y: 700, spreadType: 'center', factoriesPerRow: 3, centerWidth: 0.3, availableFactoryTypes: ['Skyscraper'], row: 'background' },
  { y: 1000, spreadType: 'center', factoriesPerRow: 5, centerWidth: 0.5, availableFactoryTypes: ['Skyscraper'], row: 'background' },
  { y: 980, spreadType: 'full', factoriesPerRow: 24, centerWidth: 0.7, availableFactoryTypes: ['Monolith'], row: 'background' },
  // MIDGROUND
  { y: 1019, spreadType: 'full', factoriesPerRow: 5, availableFactoryTypes: ['Refinery', 'Stacks'], row: 'midground' },
  { y: 1030, spreadType: 'full', factoriesPerRow: 4, availableFactoryTypes: ['Refinery', 'Stacks', 'Warehouse'], row: 'midground' },
  // FOREGROUND
  { y: 1180, spreadType: 'center', factoriesPerRow: 8, centerWidth: 0.5, availableFactoryTypes: ['Refinery'], row: 'foreground' },
  { y: 900, spreadType: 'edges', factoriesPerRow: 4, edgeWidth: 0.05, availableFactoryTypes: ['Warehouse'], row: 'foreground' },
  { y: 1000, spreadType: 'edges', factoriesPerRow: 3, edgeWidth: 0.2, availableFactoryTypes: ['Warehouse', 'Monolith'], row: 'foreground' },
  { y: 1200, spreadType: 'edges', factoriesPerRow: 8, edgeWidth: 0.3, availableFactoryTypes: ['Warehouse'], row: 'foreground' },
];

const PRODUCTION_INTERVAL = 60; // measures

const DEFAULT_ROW_EDGE_WIDTH = 0.3; // 30% of screen width on each edge
const DEFAULT_CENTER_WIDTH = 0.4; // 40% of screen width for center spread

/** Fallback row index used when reading back an already-created factory
 *  Actor whose config.row is missing — a defensive default, not a real
 *  spawn-time path (createFactory always writes config.row explicitly, so
 *  every real factory has one). Shared by Factory.tsx's own render-time
 *  fallback and recolorFactoriesForAttenuationStyle's row lookup so the two
 *  can't silently drift apart — previously two independent `?? 1` literals
 *  kept in sync only by a comment. Distinct from createFactory's own `row = 0`
 *  parameter default below, which is a different thing for a different
 *  moment: constructing a brand-new factory without specifying a row (a
 *  real, tested, load-bearing default), not reading one back. */
export const DEFAULT_FACTORY_ROW = 1;

/** Moderate, bounded range for the AS-seeded color component — same order of
 *  magnitude as the widest per-variant colorRanges (Skyscraper's ±120 hue is
 *  an outlier; most variants sit in the ±15-60 range) so a fresh AS visibly
 *  recolors the skyline without a single roll being able to wash it out
 *  entirely. First-pass default, not spec-mandated — see
 *  docs/specs/ATTENUATION_STYLE.md §7 item 2; tune here if a manual check
 *  finds it reads as invisible or overwhelming. */
const AS_FACTORY_HUE_SHIFT_RANGE: [number, number] = [-30, 30];
const AS_FACTORY_SAT_SHIFT_RANGE: [number, number] = [-20, 20];

// ========================================
// EXPORTS
// ========================================

/** Deterministic factory Actor ID — mirrors generateRobotId/generateCompanyId's shape
 *  (spawnSystem.ts): own dataId, own counter namespace, no crypto.randomUUID(). Private
 *  to this file, like its two siblings. */
function generateFactoryId(noiseMap: NoiseFunction2D, index: number): string {
  const idSeed = getSeededVal(noiseMap, 'factory.id', index, 0, 1);
  return `factory-${index}-${idSeed.toString(36).slice(2, 10)}`;
}

/** AS-seeded color delta for one factory, additive on top of its existing
 *  locale-seeded hueShift/satShift — never a replacement. Sampled from the
 *  active Attenuation Style's own noise map, keyed by the factory's position in
 *  the locale's actor array (the same getSeededVal(noiseMap, dataId, offset,
 *  min, max) pattern every other seeded field in this file already uses).
 *  See docs/specs/ATTENUATION_STYLE.md §1.2. */
function deriveAsColorShift(noiseMap: NoiseFunction2D, index: number): ColorShift {
  return {
    hueShift: getSeededVal(noiseMap, 'factory.as.hueShift', index, ...AS_FACTORY_HUE_SHIFT_RANGE),
    satShift: getSeededVal(noiseMap, 'factory.as.satShift', index, ...AS_FACTORY_SAT_SHIFT_RANGE),
  };
}

/**
 * Create a single factory actor with position and scale.
 *
 * `scale` and `id` are deterministic when `placeFactories` supplies them (seeded from the
 * locale's noise map, per PROCEDURAL_GENERATION.md) — this is the actual generation path used
 * at spawn time. The `Math.random()`/`crypto.randomUUID()` defaults only apply when calling
 * `createFactory` directly with no locale context (e.g. tests), the same fallback pattern
 * `generateMelodyForRobot`'s `rand` parameter uses.
 */
export function createFactory(
  position: { x: number; y: number },
  row = 0,
  scale: number = 0.9 + Math.random() * 0.2, // 0.9–1.1
  id: string = generateUUID(),
  asShift: ColorShift = { hueShift: 0, satShift: 0 },
): Actor {
  // Use the same availableTypes that Factory.tsx will use, so the variant —
  // and therefore greeble pools — are consistent between spawn and render.
  const availableTypes = getRowConfig(row)?.availableFactoryTypes;

  const { hueShift, satShift, rooftopGreeble, facadeGreeble, beltCourseCount, purpose } = selectVariantFromSeed(id, position.x, row, availableTypes);

  return {
    id,
    type: ActorType.FACTORY,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
    isActive: true,
    cooldownRemaining: PRODUCTION_INTERVAL,
    config: {
      productionInterval: PRODUCTION_INTERVAL,
      row,
      // Additive: locale-seeded local shift + AS-seeded shift, never a
      // replacement. See docs/specs/ATTENUATION_STYLE.md §1.2.
      hueShift: hueShift + asShift.hueShift,
      satShift: satShift + asShift.satShift,
      rooftopGreeble,
      facadeGreeble,
      beltCourseCount,
      purpose,
    },
  };
}

/**
 * Place factories along the ocean floor using the `FACTORY_ROWS` config (9 rows
 * across background/midground/foreground depth groups, each with its own y position,
 * factory type filter, and spread type — 'edges', 'full', or 'center').
 * Scale variation (0.9–1.1) is seeded from the locale's noise map, same as every other
 * spawn-time attribute — the same locale (same coordinates) always regenerates the exact
 * same factory backdrop, required for Session Storage's reload/shared-link replay
 * (docs/SESSION_STORAGE.md) same as robots and companies.
 * Returns array of actors (factories only; floor rects rendered in OceanScene)
 */
export function placeFactories(localeId: string): Actor[] {
  const actors: Actor[] = [];
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;
  // Resolve the locale's own Attenuation Style internally, mirroring the locale noise
  // map lookup immediately above — placeFactories' exported signature is
  // unchanged; this is a new useAttenuationStyleStore dependency, not a new parameter.
  // Falls back to a zero asShift (never a crash) if the locale's attenuationStyleId
  // doesn't resolve to any Attenuation Style currently in the store.
  const attenuationStyle = locale ? useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === locale.attenuationStyleId) : undefined;
  const asNoiseMap = attenuationStyle ? getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name) : null;
  // Monotonic counter across every factory this call places, embedded in each factory's own
  // id/scale seed offset — mirrors spawnSystem.ts's spawnCount pattern.
  let factoryIndex = 0;

  /** Seeded createFactory wrapper — id and scale both keyed by factoryIndex, falling back to
   *  `alea` (still deterministic, just not noise-map-based) if the locale isn't registered. */
  function nextFactory(position: { x: number; y: number }, row: number): Actor {
    const index = factoryIndex++;
    const id = noiseMap
      ? generateFactoryId(noiseMap, index)
      : `factory-${index}-${alea(`${localeId}:factory:${index}:id`)().toString(36).slice(2, 10)}`;
    const scale = noiseMap
      ? getSeededVal(noiseMap, 'factory.scale', index, 0.9, 1.1)
      : 0.9 + alea(`${localeId}:factory:${index}:scale`)() * 0.2;
    const asShift = asNoiseMap ? deriveAsColorShift(asNoiseMap, index) : { hueShift: 0, satShift: 0 };
    return createFactory(position, row, scale, id, asShift);
  }

  function computeFactoryWidth(
    factory: Actor,
    rowIndex: number,
    rowConfig: FactoryRowConfig,
    currX: number,
  ): number {
    const { variant, noiseValue } = selectVariantFromSeed(
      factory.id,
      currX,
      rowIndex,
      rowConfig.availableFactoryTypes
    );
    const range = VARIANT_CONF[variant].sizeRange;
    return calcSilhouetteSize(noiseValue, range).width;
  }

  FACTORY_ROWS.forEach((rowConfig, rowIndex) => {
    const y = rowConfig.y;

    if (rowConfig.spreadType === 'edges') {
      const FRONT_ROW_LEFT_MAX = WORLD_BOUNDS.width * (rowConfig.edgeWidth ?? DEFAULT_ROW_EDGE_WIDTH);
      const FRONT_ROW_RIGHT_MIN = WORLD_BOUNDS.width * (1 - (rowConfig.edgeWidth ?? DEFAULT_ROW_EDGE_WIDTH));
      let currX = -20;
      const leftLimit = FRONT_ROW_LEFT_MAX;
      let placedLeft = 0;
      const half = Math.ceil(rowConfig.factoriesPerRow / 2);
      while (currX < leftLimit && placedLeft < half) {
        const factory = nextFactory({ x: currX, y }, rowIndex);
        actors.push(factory);
        placedLeft++;
        const w = computeFactoryWidth(factory, rowIndex, rowConfig, currX);
        currX += w - 20;
      }

      // fill right edge, currX increasing rightward from FRONT_ROW_RIGHT_MIN toward rightLimit
      currX = FRONT_ROW_RIGHT_MIN;
      const rightLimit = WORLD_BOUNDS.width + 100; // account for max factory width to prevent overflow
      let placedRight = 0;
      const halfRight = Math.floor(rowConfig.factoriesPerRow / 2);
      while (currX < rightLimit && placedRight < halfRight) {
        const factory = nextFactory({ x: currX, y }, rowIndex);
        actors.push(factory);
        placedRight++;
        const w = computeFactoryWidth(factory, rowIndex, rowConfig, currX);
        currX += w - 20;
      }
    } else if (rowConfig.spreadType === 'full') {
      let currX = -20;
      const rightBoundary = WORLD_BOUNDS.width;
      let placed = 0;
      while (currX < rightBoundary && placed < rowConfig.factoriesPerRow) {
        const factory = nextFactory({ x: currX, y }, rowIndex);
        actors.push(factory);
        placed++;
        currX = WORLD_BOUNDS.width / rowConfig.factoriesPerRow * placed; // ideal even spacing
      }
    } else if (rowConfig.spreadType === 'center') {
      let currX = (WORLD_BOUNDS.width * (1 - (rowConfig.centerWidth ?? DEFAULT_CENTER_WIDTH)) / 2) - 20; // start at left edge of center segment
      const rightBoundary = (WORLD_BOUNDS.width * (1 + (rowConfig.centerWidth ?? DEFAULT_CENTER_WIDTH)) / 2) + 20; // end at right edge of center segment, account for max factory width
      let placedCenter = 0;
      while (currX < rightBoundary && placedCenter < rowConfig.factoriesPerRow) {
        const factory = nextFactory({ x: currX, y }, rowIndex);
        actors.push(factory);
        placedCenter++;
        const w = computeFactoryWidth(factory, rowIndex, rowConfig, currX);
        // Own dataId/offset namespace (rowIndex*1000 + placedCenter) — distinct from
        // factoryIndex, since this jitters *spacing between* factories, not a factory's
        // own attribute, but must stay just as seeded for the same reload-determinism reason.
        const spacingOffset = rowIndex * 1000 + placedCenter;
        const mult = noiseMap
          ? getSeededVal(noiseMap, 'factory.spacing', spacingOffset, 0.8, 1.2)
          : 0.8 + alea(`${localeId}:factory:spacing:${spacingOffset}`)() * 0.4;
        currX += (w - 20) * mult;
      }
    } else {
      // default fallback: no spread type defined
    }
  });



  useLocaleStore.getState().setLocaleData(localeId, { actors });
  return actors;
}

/**
 * Recolor an existing locale's factories in place for a new Attenuation
 * Style — position/count/id/variant/scale/greebles/purpose are all
 * untouched; only each factory's stored hueShift/satShift change. Re-derives
 * each factory's locale-seeded LOCAL shift from scratch (same inputs
 * Factory.tsx's own render already recomputes) rather than trying to
 * subtract out the previous AS delta, so repeated AS changes never
 * accumulate drift. Called only from retransmitAttenuationStyleOnly (worldTransition.ts)
 * — never from placeFactories' own fresh-spawn path, which folds the current
 * AS's shift in at creation time instead. See docs/specs/ATTENUATION_STYLE.md §1.2.
 */
export function recolorFactoriesForAttenuationStyle(localeId: string, attenuationStyleId: string, attenuationStyleName: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const asNoiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);

  let factoryIndex = 0;
  const nextActors = locale.actors.map((actor) => {
    if (actor.type !== ActorType.FACTORY) return actor;
    const index = factoryIndex++;
    // DEFAULT_FACTORY_ROW matches Factory.tsx's own render-time fallback —
    // shared constant, not createFactory's separate `row = 0` spawn-time
    // default — this must reproduce what's actually rendered.
    const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
    const availableTypes = getRowConfig(row)?.availableFactoryTypes;
    const { hueShift: localHue, satShift: localSat } = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
    const asShift = deriveAsColorShift(asNoiseMap, index);
    return {
      ...actor,
      config: {
        ...actor.config,
        hueShift: localHue + asShift.hueShift,
        satShift: localSat + asShift.satShift,
      },
    };
  });

  useLocaleStore.getState().setLocaleData(localeId, { actors: nextActors });
}

/**
 * Get factory row metadata (y position, scale, floor height)
 */
export function getRowConfig(rowIndex: number) {
  if (rowIndex < 0 || rowIndex >= FACTORY_ROWS.length) {
    return null;
  }
  return FACTORY_ROWS[rowIndex];
}

/**
 * Get all factory rows for rendering floor and gradient layers
 */
export function getAllRowConfigs() {
  return FACTORY_ROWS;
}
