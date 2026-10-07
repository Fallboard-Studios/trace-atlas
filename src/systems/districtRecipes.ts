// ========================================
// IMPORTS
// ========================================
import type { FactoryVariant } from '../components/actors/factoryVariants';
import type { DistrictName, SceneryKind } from '../types/Actor';

// ========================================
// TYPES
// ========================================

/**
 * One row of a district recipe (docs/specs/WORLD_VIEW_DISTRICTS.md §1.2).
 * Rows say *where* an item stands (`anchor`), never a literal y — the
 * placer resolves the base from the terrain profile at placement time.
 */
export interface DistrictRow {
  depth: 'background' | 'midground' | 'foreground';
  anchor: 'ridge' | 'floor' | 'ground' | 'offscreen';
  /** `anchor === 'floor'` only: 980-1000 (background) or 1015-1030 (midground). */
  floorY?: number;
  spread: 'full' | 'center' | 'edges';
  count: number;
  /** `spread === 'center'` only: fraction of WORLD_BOUNDS.width. */
  centerWidth?: number;
  /** `spread === 'edges'` only: fraction per side. */
  edgeWidth?: number;
  kind: 'factory' | SceneryKind;
  /** `kind === 'factory'` only. */
  variants?: FactoryVariant[];
  /** Per-row override of DERELICT_RATIO. */
  derelict?: number;
}

/**
 * One coverage top-up (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.4): a host kind placed at a
 * depth coverage counts, only when the district's own rows leave the world short of jobs.
 */
export interface CoverageTopUp {
  kind: SceneryKind;
  depth: 'midground' | 'foreground';
}

// ========================================
// CONSTANTS
// ========================================

/** Default derelict odds for a derelict-capable row with no per-row override. */
export const DERELICT_RATIO = 0.25;

/**
 * Per-scene ceiling on scenery shapes (spec §7 Q1), derived from the D1 perf gate
 * (docs/PERFORMANCE.md, "Districts — the Task 9 D1 perf gate"): adding TerrainLayer + WaterColumn
 * (two new static layers) on the `dense` and `ventfield` pinned worlds moved idle busy/Paint by
 * nothing measurable against the pre-D1 base — `dense`'s existing static factory layers alone
 * already carry ~2,500 shapes at that same zero-measured-cost, because static (non-moving) SVG
 * content only repaints on the lighting tick, not per frame (Phase 39's "cost is per moving
 * element" finding doesn't apply here). 700 keeps D2 well under that proven-safe footprint —
 * districtRecipes.test.ts confirms it comfortably covers even `outskirts` (the busiest
 * non-factory row count) at the simplest shipped body (GemShape's 5 shapes) — while T18's D2 perf
 * gate is the empirical backstop once real renderers exist to measure against.
 */
export const SCENERY_SHAPE_BUDGET = 700;

// Background 'floor' rows sit behind the ridge body, within 980-1000.
const BG_FLOOR = 990;
// Midground 'floor' rows sit under the ground polygon, within 1015-1030.
const MG_FLOOR = 1020;

/** Top-ups stand within the middle 70 % of the world (x 15 %–85 %), clear of the edges. */
export const COVERAGE_CENTER_WIDTH = 0.7;

// ========================================
// RECIPES
// ========================================

/**
 * The nine seeded district recipes (docs/specs/WORLD_VIEW_DISTRICTS.md §1.2).
 * Tables ship complete here — rows whose `kind` is a scenery family not yet
 * registered in `SHIPPED_SCENERY` (districts.ts) place nothing until D2
 * lands that family; nothing is re-authored between branches.
 */
export const RECIPES: Record<DistrictName, DistrictRow[]> = {
  dense: [
    // background
    { depth: 'background', anchor: 'ridge', spread: 'center', count: 3, centerWidth: 0.3, kind: 'factory', variants: ['Skyscraper'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 5, centerWidth: 0.5, kind: 'factory', variants: ['Skyscraper'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 24, kind: 'factory', variants: ['Monolith'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 6, kind: 'pylon' },
    // midground
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 5, kind: 'factory', variants: ['Refinery', 'Stacks'] },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 4, kind: 'factory', variants: ['Refinery', 'Stacks', 'Warehouse'] },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 3, kind: 'tank' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.6, kind: 'pipeline' },
    // foreground
    { depth: 'foreground', anchor: 'offscreen', spread: 'center', count: 8, centerWidth: 0.5, kind: 'factory', variants: ['Refinery'] },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 4, edgeWidth: 0.05, kind: 'factory', variants: ['Warehouse'] },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 3, edgeWidth: 0.2, kind: 'factory', variants: ['Warehouse', 'Monolith'] },
    { depth: 'foreground', anchor: 'offscreen', spread: 'edges', count: 8, edgeWidth: 0.3, kind: 'factory', variants: ['Warehouse'] },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.25, kind: 'crane' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.12, kind: 'floodlight' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.3, kind: 'containers' },
  ],

  outskirts: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 2, centerWidth: 0.35, kind: 'factory', variants: ['Skyscraper'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 5, kind: 'pylon' },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 4, kind: 'boulder' },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.3, kind: 'turbine' },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.15, kind: 'factory', variants: ['Refinery', 'Warehouse'] },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 2, centerWidth: 0.3, kind: 'tank' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.2, kind: 'dish' },

    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 6, kind: 'wall' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.1, kind: 'factory', variants: ['Warehouse'] },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 2, centerWidth: 0.5, kind: 'beacon' },
    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 2, kind: 'tether' },
  ],

  towers: [
    { depth: 'background', anchor: 'ridge', spread: 'center', count: 5, centerWidth: 0.35, kind: 'factory', variants: ['Skyscraper'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 4, centerWidth: 0.5, kind: 'factory', variants: ['Skyscraper'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.25, kind: 'dish' },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 4, edgeWidth: 0.2, kind: 'factory', variants: ['Monolith'] },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.08, kind: 'pylon' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.35, kind: 'dome' },

    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 4, edgeWidth: 0.2, kind: 'factory', variants: ['Warehouse'] },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 4, centerWidth: 0.4, kind: 'wall' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.05, kind: 'tether' },
  ],

  yard: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 10, kind: 'factory', variants: ['Monolith'] },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 6, kind: 'tank' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.2, kind: 'factory', variants: ['Stacks'] },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 4, kind: 'containers' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.7, kind: 'pipeline' },

    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 3, kind: 'crane' },
    { depth: 'foreground', anchor: 'offscreen', spread: 'edges', count: 6, edgeWidth: 0.3, kind: 'factory', variants: ['Warehouse'] },
    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 8, kind: 'wall' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.08, kind: 'beacon' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.18, kind: 'floodlight' },
  ],

  derelict: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 3, kind: 'factory', variants: ['Skyscraper'], derelict: 0.8 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 12, kind: 'factory', variants: ['Monolith'], derelict: 0.8 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.2, kind: 'vent' },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 4, kind: 'factory', variants: ['Refinery', 'Stacks'], derelict: 0.6 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.1, kind: 'tank', derelict: 0.6 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 3, centerWidth: 0.4, kind: 'pylon' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.3, kind: 'scaffold', derelict: 1 },

    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 4, edgeWidth: 0.25, kind: 'factory', variants: ['Warehouse'], derelict: 0.6 },
    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 5, kind: 'wall' },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 1, centerWidth: 0.3, kind: 'wreck' },
    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 3, kind: 'boulder' },
  ],

  habitat: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 2, centerWidth: 0.3, kind: 'factory', variants: ['Skyscraper'], derelict: 0 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 4, kind: 'pylon', derelict: 0 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.2, kind: 'turbine', derelict: 0 },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 3, kind: 'dome', derelict: 0 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.1, kind: 'dish', derelict: 0 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.5, kind: 'pipeline', derelict: 0 },

    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 1, centerWidth: 0.25, kind: 'dome', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.15, kind: 'floodlight', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 3, kind: 'tether', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 3, edgeWidth: 0.25, kind: 'wall', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.06, kind: 'beacon', derelict: 0 },
  ],

  wreckfield: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 6, kind: 'factory', variants: ['Monolith'], derelict: 0.9 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 5, kind: 'boulder' },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 2, centerWidth: 0.4, kind: 'vent' },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.3, kind: 'wreck' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 4, kind: 'boulder' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.2, kind: 'pylon' },

    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 1, centerWidth: 0.4, kind: 'wreck' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 4, edgeWidth: 0.25, kind: 'boulder' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.08, kind: 'tether' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.12, kind: 'factory', variants: ['Warehouse'], derelict: 0.7 },
  ],

  ventfield: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 6, kind: 'vent' },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 2, centerWidth: 0.3, kind: 'factory', variants: ['Refinery'] },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.2, kind: 'boulder' },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 2, kind: 'pipeline' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 2, edgeWidth: 0.15, kind: 'tank' },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 3, centerWidth: 0.5, kind: 'vent' },

    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 3, edgeWidth: 0.25, kind: 'boulder' },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 1, centerWidth: 0.4, kind: 'pipeline' },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 1, centerWidth: 0.15, kind: 'floodlight' },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.1, kind: 'factory', variants: ['Refinery', 'Stacks'] },
  ],

  construction: [
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'center', count: 2, centerWidth: 0.4, kind: 'factory', variants: ['Skyscraper'], derelict: 0 },
    { depth: 'background', anchor: 'floor', floorY: BG_FLOOR, spread: 'full', count: 6, kind: 'factory', variants: ['Monolith'], derelict: 0 },

    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'full', count: 3, kind: 'scaffold', derelict: 0 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'edges', count: 3, edgeWidth: 0.3, kind: 'containers', derelict: 0 },
    { depth: 'midground', anchor: 'floor', floorY: MG_FLOOR, spread: 'center', count: 1, centerWidth: 0.4, kind: 'pipeline', derelict: 0 },

    { depth: 'foreground', anchor: 'ground', spread: 'full', count: 3, kind: 'crane', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 4, edgeWidth: 0.3, kind: 'containers', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'edges', count: 2, edgeWidth: 0.1, kind: 'floodlight', derelict: 0 },
    { depth: 'foreground', anchor: 'ground', spread: 'center', count: 2, centerWidth: 0.4, kind: 'wall', derelict: 0 },
  ],
};

// ========================================
// COVERAGE TOP-UPS
// ========================================

const mg = (kind: SceneryKind): CoverageTopUp => ({ kind, depth: 'midground' });
const fg = (kind: SceneryKind): CoverageTopUp => ({ kind, depth: 'foreground' });

/**
 * Each district's ordered coverage top-ups (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.4):
 * `ensureJobCoverage` places them one at a time, in order, until the world has ≥ 3 jobs with
 * ≥ 4 hosts, or the list runs out. Written against the 121-seed grid (Phase 43 Task 12), where
 * every ventfield, derelict, wreckfield and outskirts world and 9 of 15 towers worlds fell short.
 * The missing third job is usually acoustic survey or maintenance, so lists lead with pylons,
 * which host both. Pylons, cranes, floodlights and beacons can't roll derelict, so a top-up never
 * loses its jobs. Dense, yard, habitat and construction never fall short on the grid; theirs are
 * safety nets for other worlds.
 */
export const COVERAGE_TOP_UP: Record<DistrictName, CoverageTopUp[]> = {
  dense: [mg('pylon'), fg('crane'), fg('containers')],
  // acoustic 3, maintenance 2: two pylons, then whichever of vent/fluid/salvage is closest.
  outskirts: [mg('pylon'), mg('pylon'), mg('tank'), fg('containers'), fg('containers'), fg('crane')],
  // acoustic 2, maintenance 2-3.
  towers: [mg('pylon'), mg('pylon'), fg('beacon')],
  yard: [mg('pylon'), fg('crane'), mg('dome')],
  // acoustic 3, maintenance 3: one pylon does it.
  derelict: [mg('pylon'), mg('pylon'), fg('beacon')],
  habitat: [mg('pylon'), fg('crane'), fg('containers')],
  // acoustic 1, maintenance 1, structural 3-5: three pylons, then structure.
  wreckfield: [mg('pylon'), mg('pylon'), mg('pylon'), fg('crane'), fg('wreck')],
  // vent and fluid plenty; maintenance 1.
  ventfield: [fg('floodlight'), mg('pylon'), fg('crane'), fg('floodlight')],
  construction: [mg('pylon'), mg('dome'), mg('tank')],
};

/**
 * The recipe row a top-up stands on: ground-locked in the foreground, on the midground floor
 * otherwise; one item, never derelict (a derelict roll would swap its jobs out). Readers reach it
 * through `getRecipeRow(district, recipe.length + topUpIndex)`.
 */
export function coverageTopUpRow({ kind, depth }: CoverageTopUp): DistrictRow {
  return {
    depth,
    ...(depth === 'foreground' ? { anchor: 'ground' as const } : { anchor: 'floor' as const, floorY: MG_FLOOR }),
    spread: 'center',
    centerWidth: COVERAGE_CENTER_WIDTH,
    count: 1,
    kind,
    derelict: 0,
  };
}
