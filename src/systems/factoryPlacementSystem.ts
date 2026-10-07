// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';
import type { Actor } from '../types/Actor';
import { ActorType } from '../types/Actor';
import useLocaleStore from '../stores/localeStore';
import type { FactoryVariant } from '../components/actors/factoryVariants';
import { VARIANT_CONF, selectVariantFromSeed } from '../components/actors/factoryVariants';
import { calcSilhouetteSize } from '../components/actors/silhouetteUtils';
import { getAttenuationStyleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { generateUUID } from '../utils/randomId';
import { shiftHSL, type ColorShift, type HSL } from '../utils/colorUtils';
import { computeAccentLean, secondaryFor, ACCENT_HUES, type AccentPair } from '../utils/accentLean';
import { ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import { RECIPES, COVERAGE_TOP_UP, coverageTopUpRow, type DistrictRow } from './districtRecipes';
import type { DistrictName, SceneryKind } from '../types/Actor';
import { WORLD_BOUNDS } from '../constants/sceneDepth';
import { BODY_BEARING_BASE, deriveSceneryParams } from '../components/actors/scenery/sceneryParams';

// Re-exported so districts.ts's existing `import { WORLD_BOUNDS } from
// './factoryPlacementSystem'` (roadmap Phase 42 Task 4) keeps working after
// Task 6 moved the real declaration to constants/sceneDepth.ts (spec §7 Q3).
export { WORLD_BOUNDS };

// ========================================
// CONSTANTS
// ========================================

const DEFAULT_ROW_EDGE_WIDTH = 0.3; // 30% of screen width on each edge
const DEFAULT_CENTER_WIDTH = 0.4; // 40% of screen width for center spread

/** Fallback row index used when reading back an already-created factory
 *  Actor whose config.row is missing — a defensive default, not a real
 *  spawn-time path (createFactory always writes config.row explicitly, so
 *  every real factory has one). Shared by Factory.tsx's own render-time
 *  fallback and recolorActorsForAttenuationStyle's row lookup so the two
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

/** Same magnitude as the factory AS ranges above, own dataId namespace (roadmap Phase 42
 *  Task 13) — body-bearing scenery (wall, tank, …) gets its own AS-seeded delta rather than
 *  sharing the factory draw, matching the project's one-dataId-per-family convention
 *  ('scenery.id' vs 'factory.id', 'actor.derelict', …). */
const AS_SCENERY_HUE_SHIFT_RANGE: [number, number] = [-30, 30];
const AS_SCENERY_SAT_SHIFT_RANGE: [number, number] = [-20, 20];

/** Fixed non-zero, non-integer offset for the Attenuation-Style-level accent-pair draw — a
 *  single-value dataId sampled at offset 0 can collapse to 3–4 values across every seed if its
 *  hash lands near a simplex lattice point (PROCEDURAL_GENERATION.md "Gotchas", the cut
 *  consoleTheme.ts). The test suite's spread guard measures this; if it ever trips, change this
 *  number, never the threshold. docs/specs/WORLD_PALETTE_PULL.md §1.2. */
const ACCENT_PAIR_OFFSET = 0.37;

// ========================================
// EXPORTS
// ========================================

/** Deterministic factory Actor ID — mirrors generateRobotId/generateCompanyId's shape
 *  (spawnSystem.ts): own dataId, own counter namespace, no crypto.randomUUID(). Exported
 *  for districts.ts's placeDistrict (roadmap Phase 42 Task 4), which reuses this exact
 *  seeding so factory ids stay stable under the recipe-driven placement path. */
export function generateFactoryId(noiseMap: NoiseFunction2D, index: number): string {
  const idSeed = getSeededVal(noiseMap, 'factory.id', index, 0, 1);
  return `factory-${index}-${idSeed.toString(36).slice(2, 10)}`;
}

/** AS-seeded color delta for one factory, additive on top of its existing
 *  locale-seeded hueShift/satShift — never a replacement. Sampled from the
 *  active Attenuation Style's own noise map, keyed by the factory's position in
 *  the locale's actor array (the same getSeededVal(noiseMap, dataId, offset,
 *  min, max) pattern every other seeded field in this file already uses).
 *  See docs/specs/ATTENUATION_STYLE.md §1.2. */
export function deriveAsColorShift(noiseMap: NoiseFunction2D, index: number): ColorShift {
  return {
    hueShift: getSeededVal(noiseMap, 'factory.as.hueShift', index, ...AS_FACTORY_HUE_SHIFT_RANGE),
    satShift: getSeededVal(noiseMap, 'factory.as.satShift', index, ...AS_FACTORY_SAT_SHIFT_RANGE),
  };
}

/**
 * The Attenuation Style's two accent-lean targets (docs/specs/WORLD_PALETTE_PULL.md §1.2): a
 * seeded primary out of the 18 console accent hues plus its nearest other accent on the wheel
 * (analogous by construction). Per STYLE, not per locale — every locale under one style shares
 * the pair, and a style retransmit moves the whole skyline (spec §7 item 2, Crawford's call).
 * Exported only so tests can assert "target ∈ pair", the same way spawnSystem.ts exports
 * generateCompanyIdentityColor; placeDistrict/recolor are the only real callers.
 */
export function deriveAsAccentPair(asNoiseMap: NoiseFunction2D): AccentPair {
  // Clamped index, mirroring generateRobotIdentityColor's own guard in spawnSystem.ts.
  const raw = Math.floor(getSeededVal(asNoiseMap, 'factory.as.accentPrimary', ACCENT_PAIR_OFFSET, 0, ROBOT_IDENTITY_COLOR_NAMES.length));
  const primaryIndex = Math.max(0, Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, raw));
  return { primary: ACCENT_HUES[primaryIndex], secondary: ACCENT_HUES[secondaryFor(primaryIndex)] };
}

/** Which of the style's pair this factory leans toward — a seeded coin keyed by the factory's
 *  index in the locale's actor array, the same offset convention deriveAsColorShift uses. */
export function pickAccentTarget(asNoiseMap: NoiseFunction2D, pair: AccentPair, index: number): number {
  return getSeededVal(asNoiseMap, 'factory.as.accentPick', index, 0, 1) < 0.5 ? pair.primary : pair.secondary;
}

/** `deriveAsColorShift`'s scenery counterpart (roadmap Phase 42 Task 13) — same shape, own
 *  dataId namespace, keyed by the scenery actor's index in the locale's scenery counter
 *  (`districts.ts`'s `sceneryIndex`), not the factory one. */
export function deriveSceneryAsColorShift(noiseMap: NoiseFunction2D, index: number): ColorShift {
  return {
    hueShift: getSeededVal(noiseMap, 'scenery.as.hueShift', index, ...AS_SCENERY_HUE_SHIFT_RANGE),
    satShift: getSeededVal(noiseMap, 'scenery.as.satShift', index, ...AS_SCENERY_SAT_SHIFT_RANGE),
  };
}

/** `pickAccentTarget`'s scenery counterpart — own dataId, same seeded-coin shape. */
export function pickSceneryAccentTarget(asNoiseMap: NoiseFunction2D, pair: AccentPair, index: number): number {
  return getSeededVal(asNoiseMap, 'scenery.as.accentPick', index, 0, 1) < 0.5 ? pair.primary : pair.secondary;
}

/**
 * The pure fold every body-bearing actor's final stored `hueShift`/`satShift` goes through
 * (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8) — extracted from `createFactory` (roadmap Phase 42
 * Task 13) so scenery's body-bearing families (wall, tank, …) can share the exact same math
 * instead of re-deriving it: local shift (variant-style or scenery-kind range) + AS shift,
 * additively, then an optional Phase 35 accent lean computed from the body colour that
 * combined shift actually produces on `baseBody`. `undefined` accentTarget means no lean —
 * byte-identical to summing local + AS alone.
 */
export function foldBodyShift(baseBody: HSL, localShift: ColorShift, asShift: ColorShift, accentTarget?: number): ColorShift {
  const combined = { hueShift: localShift.hueShift + asShift.hueShift, satShift: localShift.satShift + asShift.satShift };
  const lean = accentTarget === undefined
    ? { hueShift: 0, satShift: 0 }
    : computeAccentLean(shiftHSL(baseBody, combined), accentTarget);
  return { hueShift: combined.hueShift + lean.hueShift, satShift: combined.satShift + lean.satShift };
}

/**
 * Create a single factory actor with position and scale.
 *
 * `scale` and `id` are deterministic when `placeDistrict` (districts.ts) supplies them (seeded from the
 * locale's noise map, per PROCEDURAL_GENERATION.md) — this is the actual generation path used
 * at spawn time. The `Math.random()`/`crypto.randomUUID()` defaults only apply when calling
 * `createFactory` directly with no locale context (e.g. tests), the same fallback pattern
 * `generateMelodyForRobot`'s `rand` parameter uses.
 *
 * `accentTarget` (degrees, optional — docs/specs/WORLD_PALETTE_PULL.md §1.3): when present, the
 * FINAL pre-lean body colour (variant base + local + AS shift) is pulled toward it and its
 * saturation lifted, with both deltas folded into the stored hueShift/satShift so no renderer
 * changes. `undefined` means no lean — byte-identical to the pre-Phase-35 output.
 *
 * `availableTypes` (roadmap Phase 42 Task 5): the variant filter for this row, supplied by the
 * caller rather than looked up internally — `placeDistrict` (districts.ts) passes a district
 * recipe row's own `variants`, so the same `(id, x, row)` seed resolves the same variant
 * `Factory.tsx`'s render-time `getRecipeRow(district, row)` lookup will see.
 */
export function createFactory(
  position: { x: number; y: number },
  row = 0,
  scale: number = 0.9 + Math.random() * 0.2, // 0.9–1.1
  id: string = generateUUID(),
  asShift: ColorShift = { hueShift: 0, satShift: 0 },
  accentTarget?: number,
  availableTypes?: FactoryVariant[],
): Actor {
  const { variant, hueShift: localHue, satShift: localSat, rooftopGreeble, facadeGreeble, beltCourseCount, purpose } = selectVariantFromSeed(id, position.x, row, availableTypes);

  // Additive: locale-seeded local shift + AS-seeded shift + Phase 35 accent lean, never a
  // replacement. See docs/specs/ATTENUATION_STYLE.md §1.2; foldBodyShift (roadmap Phase 42
  // Task 13) is this exact fold, shared with scenery's body-bearing families.
  const { hueShift, satShift } = foldBodyShift(VARIANT_CONF[variant].colors.body, { hueShift: localHue, satShift: localSat }, asShift, accentTarget);

  return {
    id,
    type: ActorType.FACTORY,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
    isActive: true,
    config: {
      row,
      hueShift,
      satShift,
      rooftopGreeble,
      facadeGreeble,
      beltCourseCount,
      purpose,
    },
  };
}

/**
 * Recolor an existing locale's factories AND body-bearing scenery (wall, tank, … —
 * `BODY_BEARING_BASE`, roadmap Phase 42 Task 13) in place for a new Attenuation Style —
 * position/count/id/variant/scale/greebles/purpose are all untouched; only each actor's
 * stored hueShift/satShift change. Re-derives each actor's locale-seeded LOCAL shift from
 * scratch (same inputs the render path already recomputes) rather than trying to subtract
 * out the previous AS delta, so repeated AS changes never accumulate drift. Called only from
 * retransmitAttenuationStyleOnly (worldTransition.ts) — never from placeDistrict's own
 * fresh-spawn path, which folds the current AS's shift in at creation time instead. See
 * docs/specs/ATTENUATION_STYLE.md §1.2, docs/specs/WORLD_VIEW_DISTRICTS.md §1.8.
 *
 * Structural scenery (crane, pylon, boulder, …) stores no shift and is left untouched —
 * `BODY_BEARING_BASE[kind]` is `undefined` for every one of them, so the scenery branch below
 * is a no-op for them without a separate check.
 *
 * District/row (roadmap Phase 42 Task 5): a factory's variant filter is now its own district
 * recipe row's `variants`, read via `getRecipeRow(district, row)` — `district` falls back to
 * `'dense'` and `row` to `DEFAULT_FACTORY_ROW` (matching `Factory.tsx`'s own render-time
 * fallback) only for a hand-built actor missing one; every real factory has both.
 */
export function recolorActorsForAttenuationStyle(localeId: string, attenuationStyleId: string, attenuationStyleName: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const asNoiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  // Phase 35: the NEW style's accent pair — a retransmit moves the whole skyline onto it
  // (docs/specs/WORLD_PALETTE_PULL.md §1.3, last paragraph). Same per-actor computation as
  // placeDistrict → createFactory/body-bearing scenery, so the two write sites always agree.
  const accentPair = deriveAsAccentPair(asNoiseMap);

  // Two independent counters, mirroring placeDistrict's own factoryIndex/sceneryIndex split
  // (districts.ts) — each increments once per actor of its type, in locale.actors' array
  // order, which is the exact order placeDistrict built it in.
  let factoryIndex = 0;
  let sceneryIndex = 0;
  const nextActors = locale.actors.map((actor) => {
    if (actor.type === ActorType.FACTORY) {
      const index = factoryIndex++;
      const district = actor.config?.district ?? 'dense';
      // DEFAULT_FACTORY_ROW matches Factory.tsx's own render-time fallback —
      // shared constant, not createFactory's separate `row = 0` spawn-time
      // default — this must reproduce what's actually rendered.
      const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
      const availableTypes = getRecipeRow(district, row)?.variants;
      const { variant, hueShift: localHue, satShift: localSat } = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
      const asShift = deriveAsColorShift(asNoiseMap, index);
      const accentTarget = pickAccentTarget(asNoiseMap, accentPair, index);
      const { hueShift, satShift } = foldBodyShift(VARIANT_CONF[variant].colors.body, { hueShift: localHue, satShift: localSat }, asShift, accentTarget);
      return { ...actor, config: { ...actor.config, hueShift, satShift } };
    }

    if (actor.type === ActorType.SCENERY) {
      const index = sceneryIndex++;
      const kind = actor.config?.kind as SceneryKind | undefined;
      const baseBody = kind ? BODY_BEARING_BASE[kind] : undefined;
      if (!baseBody) return actor; // structural scenery stores no shift — untouched
      const local = deriveSceneryParams(actor)[kind!] as { hueShift: number; satShift: number };
      const asShift = deriveSceneryAsColorShift(asNoiseMap, index);
      const accentTarget = pickSceneryAccentTarget(asNoiseMap, accentPair, index);
      const { hueShift, satShift } = foldBodyShift(baseBody, { hueShift: local.hueShift, satShift: local.satShift }, asShift, accentTarget);
      return { ...actor, config: { ...actor.config, hueShift, satShift } };
    }

    return actor;
  });

  useLocaleStore.getState().setLocaleData(localeId, { actors: nextActors });
}

/**
 * Get one row of a district's recipe (districtRecipes.ts) — a factory's variant filter and
 * depth group now come from here (roadmap Phase 42 Task 4; Task 5 migrated every reader off
 * the legacy fixed-table lookup and deleted it). Rows past the recipe are its coverage top-ups,
 * in list order (Phase 43 Task 12). Out-of-range → `null`.
 */
export function getRecipeRow(district: DistrictName, row: number): DistrictRow | null {
  const recipe = RECIPES[district];
  if (row < 0) return null;
  if (row < recipe.length) return recipe[row];
  const topUp = COVERAGE_TOP_UP[district][row - recipe.length];
  return topUp ? coverageTopUpRow(topUp) : null;
}

/**
 * The width of the factory variant that `createFactory`/`selectVariantFromSeed`
 * would pick for this exact (id, x, row, availableTypes) — used by `spreadXs`
 * callers to advance spacing before the next item's x is chosen.
 */
export function factoryWidthAt(factoryId: string, x: number, row: number, availableTypes?: FactoryVariant[]): number {
  const { variant, noiseValue } = selectVariantFromSeed(factoryId, x, row, availableTypes);
  const range = VARIANT_CONF[variant].sizeRange;
  return calcSilhouetteSize(noiseValue, range).width;
}

/**
 * The edges/full/center spread logic `districts.ts`'s `placeDistrict` (roadmap
 * Phase 42 Task 4) uses to place a district recipe's rows.
 *
 * `nextWidth(x)` is called once per position this function picks; it must
 * place the actor as a side effect (so every spread type still creates an
 * actor at `x`, even 'full', which doesn't need the returned width) and
 * return that actor's width so 'edges'/'center' can advance `x` past it.
 */
export function spreadXs(
  row: Pick<DistrictRow, 'spread' | 'count' | 'edgeWidth' | 'centerWidth'>,
  nextWidth: (x: number) => number,
  noiseMap: NoiseFunction2D | null,
  rowIndex: number,
): void {
  if (row.spread === 'edges') {
    const edgeWidth = row.edgeWidth ?? DEFAULT_ROW_EDGE_WIDTH;
    const leftLimit = WORLD_BOUNDS.width * edgeWidth;
    const rightMin = WORLD_BOUNDS.width * (1 - edgeWidth);
    const rightLimit = WORLD_BOUNDS.width + 100;

    let currX = -20;
    let placedLeft = 0;
    const half = Math.ceil(row.count / 2);
    while (currX < leftLimit && placedLeft < half) {
      const w = nextWidth(currX);
      placedLeft++;
      currX += w - 20;
    }

    currX = rightMin;
    let placedRight = 0;
    const halfRight = Math.floor(row.count / 2);
    while (currX < rightLimit && placedRight < halfRight) {
      const w = nextWidth(currX);
      placedRight++;
      currX += w - 20;
    }
  } else if (row.spread === 'full') {
    let currX = -20;
    const rightBoundary = WORLD_BOUNDS.width;
    let placed = 0;
    while (currX < rightBoundary && placed < row.count) {
      nextWidth(currX);
      placed++;
      currX = (WORLD_BOUNDS.width / row.count) * placed; // ideal even spacing
    }
  } else if (row.spread === 'center') {
    const centerWidth = row.centerWidth ?? DEFAULT_CENTER_WIDTH;
    let currX = (WORLD_BOUNDS.width * (1 - centerWidth)) / 2 - 20;
    const rightBoundary = (WORLD_BOUNDS.width * (1 + centerWidth)) / 2 + 20;
    let placedCenter = 0;
    while (currX < rightBoundary && placedCenter < row.count) {
      const w = nextWidth(currX);
      placedCenter++;
      // Own dataId/offset namespace (rowIndex*1000 + placedCenter) — distinct from
      // the factory's own id/scale seed offset, but just as seeded for the same
      // reload-determinism reason.
      const spacingOffset = rowIndex * 1000 + placedCenter;
      const mult = noiseMap
        ? getSeededVal(noiseMap, 'factory.spacing', spacingOffset, 0.8, 1.2)
        : 0.8 + Math.random() * 0.4;
      currX += (w - 20) * mult;
    }
  }
}
