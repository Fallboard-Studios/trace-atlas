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

// ========================================
// CONSTANTS
// ========================================

/** Default derelict odds for a derelict-capable row with no per-row override. */
export const DERELICT_RATIO = 0.25;

// Background 'floor' rows sit behind the ridge body, within 980-1000.
const BG_FLOOR = 990;
// Midground 'floor' rows sit under the ground polygon, within 1015-1030.
const MG_FLOOR = 1020;

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
