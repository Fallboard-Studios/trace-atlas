// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import { ActorType, type Actor, type DistrictName, type SceneryKind } from '../types/Actor';
import { getSeededVal } from '../utils/getSeededVal';
import { useLocaleStore } from '../stores/localeStore';
import { useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import { getLocaleNoiseMap, getAttenuationStyleNoiseMap } from '../utils/noiseMaps';
import { getTerrainProfile, ridgeYAt, groundYAt } from './terrainProfile';
import { RECIPES, DERELICT_RATIO, type DistrictRow } from './districtRecipes';
import {
  createFactory,
  generateFactoryId,
  deriveAsColorShift,
  deriveAsAccentPair,
  pickAccentTarget,
  deriveSceneryAsColorShift,
  pickSceneryAccentTarget,
  foldBodyShift,
  factoryWidthAt,
  spreadXs,
  WORLD_BOUNDS,
} from './factoryPlacementSystem';
import { SCENERY_RENDERERS, SCENERY_GEM_ACCENTS } from '../components/actors/scenery/Scenery';
import { deriveSceneryParams, BODY_BEARING_BASE } from '../components/actors/scenery/sceneryParams';

// ========================================
// CONSTANTS
// ========================================

/**
 * The nine seeded districts, in spec order (docs/specs/WORLD_VIEW_DISTRICTS.md
 * §1.1). No `legacy` — every locale now draws one of these nine.
 */
export const DISTRICT_NAMES: DistrictName[] = [
  'dense',
  'outskirts',
  'towers',
  'yard',
  'derelict',
  'habitat',
  'wreckfield',
  'ventfield',
  'construction',
];

// Three arbitrary non-integer, mutually-prime-ish offsets for the three
// 'locale.district' draws pickDistrict combines (see its doc comment for why
// three draws, not one).
const DISTRICT_SAMPLE_OFFSETS = [0, 137.42, 911.77] as const;

// ========================================
// FUNCTIONS
// ========================================

/**
 * Pick a locale's district from its noise map, keyed only on `'locale.district'`
 * so the pick is independent of every other draw on that map.
 *
 * Measured against the real `simplex-noise` library this project uses:
 * `noiseMap(x, y)` is NOT uniformly distributed over [-1, 1] — it's
 * bell-curved, concentrated near 0 and sparse at the extremes (confirmed by
 * sampling one map at 20k random points: ~1,350 hits per middle decile vs.
 * ~70 at each edge decile). A single `getSeededVal` draw fed straight into
 * `floor(v * 9)` therefore starves the two edge districts (`dense` and
 * `construction`) across many different locales, however the offset is
 * chosen — swept ~500 offsets and none reliably cleared the spec's own
 * "every district >= 8 of 121 real locale coordinates" bar. Even re-hashing
 * one draw through `alea()` wasn't enough entropy to flatten it (measured
 * ~7-17% range over 72k locales, vs. the uniform ~11.1% target).
 *
 * Combining three draws at different offsets before hashing fixes it
 * (measured ~10.9-11.3% over 72k locales; the real 121-coordinate grid
 * clears the >= 8 bar with room to spare). This is a correction to the
 * spec's literal "one draw" text — see the plan-time note to fold into
 * docs/specs/WORLD_VIEW_DISTRICTS.md §1.1.
 */
export function pickDistrict(noiseMap: NoiseFunction2D): DistrictName {
  const samples = DISTRICT_SAMPLE_OFFSETS.map((offset) => getSeededVal(noiseMap, 'locale.district', offset, 0, 1));
  const flattened = alea(samples.join(':'))();
  const index = Math.min(DISTRICT_NAMES.length - 1, Math.floor(flattened * DISTRICT_NAMES.length));
  return DISTRICT_NAMES[index];
}

/**
 * Scenery families currently lit up for placement (docs/specs/WORLD_VIEW_DISTRICTS.md
 * §1.2) — every kind with a registered renderer (`SCENERY_RENDERERS`, Scenery.tsx).
 * `placeDistrict` skips any row whose `kind` isn't `'factory'` and isn't in this set,
 * so a recipe table can ship a row for a family before its renderer exists (D1 did
 * this for all sixteen; D2, roadmap Phase 42 Task 11+, lights them up one at a time).
 */
export const SHIPPED_SCENERY: Set<SceneryKind> = new Set(Object.keys(SCENERY_RENDERERS) as SceneryKind[]);

/** Beacon is gems-only (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): "placed nothing when gems
 *  off". Pulled out of `placeDistrict` as its own pure predicate so the gating logic is testable
 *  without flipping the real `SCENERY_GEM_ACCENTS` build flag. */
export function isGemGatedRow(kind: DistrictRow['kind'], gemsOn: boolean): boolean {
  return kind === 'beacon' && !gemsOn;
}

/** Families that can roll `config.derelict` at placement — docs/specs/WORLD_VIEW_DISTRICTS.md
 *  §1.6. Wrecks are always derelict and carry no flag, so they're deliberately absent here. */
const DERELICT_CAPABLE_KINDS = new Set<DistrictRow['kind']>(['factory', 'tank', 'dome', 'scaffold']);

/** This row's base y for an item at `x`, resolved from its anchor (§1.4). `floorY` is
 *  guaranteed present when `anchor === 'floor'` by Task 2's own `districtRecipes.test.ts`. */
function resolveBaseY(row: DistrictRow, profile: ReturnType<typeof getTerrainProfile>, x: number): number {
  switch (row.anchor) {
    case 'ridge':
      return ridgeYAt(profile.ridge, x);
    case 'ground':
      return groundYAt(profile.ground, x);
    case 'floor':
      return row.floorY!;
    case 'offscreen':
      return WORLD_BOUNDS.height + 100;
  }
}

/**
 * Picks a locale's district, builds its terrain profile, and places every
 * row of its recipe (docs/specs/WORLD_VIEW_DISTRICTS.md §1.1-1.2, §1.4, §1.6)
 * — the sole factory/scenery placement path (roadmap Phase 42 Task 4; Task 5
 * deleted the legacy fixed-table placement path and every reader of it).
 *
 * Rows whose `kind` is not `'factory'` and not in `SHIPPED_SCENERY` place
 * nothing (D1 ships every table but no scenery renderer yet). Factory rows
 * call the existing `createFactory` (same `factory.id`/`factory.scale`/
 * AS-shift/accent-lean draws Factory.tsx's render path expects).
 */
export function placeDistrict(localeId: string): Actor[] {
  const actors: Actor[] = [];
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) {
    useLocaleStore.getState().setLocaleData(localeId, { actors });
    return actors;
  }

  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const district = pickDistrict(noiseMap);
  const profile = getTerrainProfile(localeId, noiseMap);
  const recipe = RECIPES[district];

  const attenuationStyle = useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === locale.attenuationStyleId);
  const asNoiseMap = attenuationStyle ? getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name) : null;
  const accentPair = asNoiseMap ? deriveAsAccentPair(asNoiseMap) : null;

  // Two independent counters: one for factory id/scale/AS seeding, one for the
  // per-actor 'actor.derelict' draw (§1.6 — "offset = actorIndex"), so neither
  // shifts if the other's draw count ever changes. A third counts scenery ids
  // in their own dataId/offset namespace, independent of both.
  let factoryIndex = 0;
  let actorIndex = 0;
  let sceneryIndex = 0;

  // Shared by both branches below: rolls this actor's derelict flag (§1.6),
  // re-hashed through alea() before the threshold compare — same fix as
  // pickDistrict's bucket split (see its doc comment). Raw simplex output
  // is bell-curved, not uniform, so `rawRoll < ratio` alone under-fires
  // for any ratio off-center from 0.5 (measured: a nominal 0.25 ratio
  // fired ~0.15 of the time with the raw value, ~0.25 once re-hashed).
  const rollDerelict = (row: DistrictRow): boolean => {
    const actorIdx = actorIndex++;
    const ratio = row.derelict ?? DERELICT_RATIO;
    const rawRoll = getSeededVal(noiseMap, 'actor.derelict', actorIdx, 0, 1);
    const roll = alea(String(rawRoll))();
    return DERELICT_CAPABLE_KINDS.has(row.kind) && roll < ratio;
  };

  recipe.forEach((row, rowIndex) => {
    if (row.kind === 'factory') {
      const nextWidth = (x: number): number => {
        const index = factoryIndex++;
        const id = generateFactoryId(noiseMap, index);
        const scale = getSeededVal(noiseMap, 'factory.scale', index, 0.9, 1.1);
        const asShift = asNoiseMap ? deriveAsColorShift(asNoiseMap, index) : { hueShift: 0, satShift: 0 };
        const accentTarget = asNoiseMap && accentPair ? pickAccentTarget(asNoiseMap, accentPair, index) : undefined;

        const px = Math.round(x);
        const y = Math.round(resolveBaseY(row, profile, px));
        const actor = createFactory({ x: px, y }, rowIndex, scale, id, asShift, accentTarget, row.variants);

        const isDerelict = rollDerelict(row);
        actor.config = {
          ...actor.config,
          district,
          ...(isDerelict ? { derelict: true as const } : {}),
        };
        actors.push(actor);

        return factoryWidthAt(id, x, rowIndex, row.variants);
      };

      spreadXs(row, nextWidth, noiseMap, rowIndex);
      return;
    }

    if (!SHIPPED_SCENERY.has(row.kind as SceneryKind)) return;
    if (isGemGatedRow(row.kind, SCENERY_GEM_ACCENTS)) return;

    const nextSceneryWidth = (x: number): number => {
      const index = sceneryIndex++;
      const idSeed = getSeededVal(noiseMap, 'scenery.id', index, 0, 1);
      const id = `scenery-${index}-${idSeed.toString(36).slice(2, 10)}`;
      const kind = row.kind as SceneryKind;

      const px = Math.round(x);
      const y = Math.round(resolveBaseY(row, profile, px));
      const isDerelict = rollDerelict(row);

      const actor: Actor = {
        id,
        type: ActorType.SCENERY,
        position: { x: px, y },
        isActive: false,
        cooldownRemaining: 0,
        config: {
          kind,
          row: rowIndex,
          district,
          ...(isDerelict ? { derelict: true as const } : {}),
        },
      };

      // Body-bearing families (wall, tank, …; §1.8) fold a shift exactly like a factory's —
      // local range + AS shift + Phase 35 lean, via the shared foldBodyShift — so
      // recolorActorsForAttenuationStyle can recolor them on retransmit. Structural families
      // have no entry in BODY_BEARING_BASE and are left without a shift (none is rendered).
      const params = deriveSceneryParams(actor)[kind] as ({ w: number } & Partial<{ hueShift: number; satShift: number }>) | undefined;
      const baseBody = BODY_BEARING_BASE[kind];
      if (baseBody && params && params.hueShift !== undefined && params.satShift !== undefined) {
        const asShift = asNoiseMap ? deriveSceneryAsColorShift(asNoiseMap, index) : { hueShift: 0, satShift: 0 };
        const accentTarget = asNoiseMap && accentPair ? pickSceneryAccentTarget(asNoiseMap, accentPair, index) : undefined;
        const { hueShift, satShift } = foldBodyShift(baseBody, { hueShift: params.hueShift, satShift: params.satShift }, asShift, accentTarget);
        actor.config = { ...actor.config, hueShift, satShift };
      }

      actors.push(actor);

      return params?.w ?? 0;
    };

    spreadXs(row, nextSceneryWidth, noiseMap, rowIndex);
  });

  useLocaleStore.getState().setLocaleData(localeId, { actors });
  return actors;
}
