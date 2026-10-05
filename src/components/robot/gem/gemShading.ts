// ========================================
// GEM FACET SHADING (docs/specs/GEM_POLYGON_ROBOTS.md §1.3)
// ========================================
// One light for every robot; a bevel facet's tone is its host colour lightened or darkened by
// how squarely its edge faces that light. Pure HSL math — gemPalette.ts turns it into strings,
// so RobotGem.tsx never computes a colour.

// ========================================
// IMPORTS
// ========================================
import { clamp, type HSL } from '../../../utils/colorUtils';
import { edgeNormals, type GemPoint } from './polygon';

// Bevel depth lives beside the generator (a polygon is only valid if its own bevel holds —
// polygon.ts `bevelHolds`); re-exported so shading callers have one import.
export { GEM_BEVEL_DEPTH, bevelDepth } from './polygon';

// ========================================
// CONSTANTS
// ========================================
/** Unit vector toward the light, top-left (y down). Sketch value (-0.55, -0.83), normalised. */
export const GEM_LIGHT: GemPoint = (() => {
  const x = -0.55;
  const y = -0.83;
  const len = Math.hypot(x, y);
  return [x / len, y / len];
})();

/** Lightness points a facet gains facing the light / loses facing away (sketch slider, Gate 1). */
export const GEM_FACET_CONTRAST = 20;

/** A low battery flattens the facets (contrast × battery dim), floored here so the bevel never
 *  vanishes entirely (spec assumption 5, Crawford 2026-10-04; tune by eye at Gate 2). */
export const GEM_BATTERY_CONTRAST_FLOOR = 0.25;

/** Facet contrast for a robot's battery dim (computeBatteryDimOpacity, 0.1..1). */
export function batteryFacetContrast(dimOpacity: number): number {
  return GEM_FACET_CONTRAST * Math.max(dimOpacity, GEM_BATTERY_CONTRAST_FLOOR);
}

// ========================================
// SHADING
// ========================================
/** How squarely an outward normal faces the light: 1 facing it, -1 facing away. */
export function facetShade(normal: GemPoint): number {
  return normal[0] * GEM_LIGHT[0] + normal[1] * GEM_LIGHT[1];
}

/** The host colour with its lightness moved by shade × contrast, clamped to 0..100. */
export function facetTone(base: HSL, shade: number, contrast: number): HSL {
  return { h: base.h, s: base.s, l: clamp(base.l + shade * contrast, 0, 100) };
}

/**
 * Facet tone levels per part (Task 9b). Quantizing makes facets share fills, so RobotGem's merged
 * facet paths collapse to ≤ k per part — the moving robot layer's paint cost tracks element count
 * (docs/PERFORMANCE.md, Phase 39 Task 9). 0 = off (one tone per edge direction, the Gate 1/2 look);
 * switched on only after Crawford's sketch check.
 */
export const GEM_FACET_TONES = 0;

/** Snap a shade (−1..1) to k evenly spaced levels including both extremes; k < 2 → unchanged.
 *  Written as (2·level − (k−1)) / (k−1) so levels are exact (±1/3, not ±0.33333333333333337). */
export function quantizeShade(shade: number, tones: number): number {
  if (tones < 2) return shade;
  const steps = tones - 1;
  const level = Math.round(((shade + 1) / 2) * steps);
  return (2 * level - steps) / steps;
}

/** One shade per outline edge (facet i sits on edge pts[i] → pts[i+1]). */
export function partFacetShades(pts: readonly GemPoint[]): number[] {
  return edgeNormals(pts).map(facetShade);
}
