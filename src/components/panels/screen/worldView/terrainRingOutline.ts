// ========================================
// TERRAIN RING OUTLINE (docs/specs/WORLD_GEM_MATERIAL.md §1.7, roadmap Phase 44 Task 18)
// ========================================
// The terrain ring is a miter inset of the terrain's outline, and an 8 px inset of the polygon as
// drawn (the profile closed to the scene's bottom corners) does not hold on real worlds — measured
// over 400 sampled worlds, it inverts on most of them:
//   - the profile builder stops its last flat run at x = 1920, leaving a run as short as 0.3 px
//     between its last 45 degree step and the right frame, and the bevel cuts straight through it;
//   - it emits a zero-length "step" whenever the step delta is 0 (a duplicate vertex);
//   - its last 45 degree step can overshoot x = 1920 by up to 48 px;
//   - the ground band (1035-1075) leaves only 5 px between the profile and the bottom frame.
// So the ring is built on an outline that has none of those: the profile, extended past the frame on
// the left, the right and the bottom (everything the extension adds lies outside the scene, and its
// facets are dropped), with zero-length edges and collinear vertices removed. The drawn polygon, and
// its `points` string, are unchanged.

// ========================================
// IMPORTS
// ========================================
import type { Step } from '@/systems/terrainProfile';
import type { GemPoint } from '@/components/robot/gem/polygon';
import { WORLD_BEVEL_PX } from '@/components/actors/material/worldGemMaterial';

// ========================================
// CONSTANTS
// ========================================
/** How far the outline reaches past the frame: four ring depths, so no corner of the extension is
 *  anywhere near the scene and the bottom edge stays well clear of the ground's lowest step. */
export const TERRAIN_RING_MARGIN = 4 * WORLD_BEVEL_PX;

/** Cross products under this count as collinear — every edge here is on the 0 / 45 / 90 degree grid. */
const COLLINEAR_EPS = 1e-9;

// ========================================
// OUTLINE
// ========================================
/** Drops repeated points and any vertex whose two edges are collinear and run the same way. */
function simplify(pts: GemPoint[]): GemPoint[] {
  const distinct = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  return distinct.filter((p, i) => {
    const prev = distinct[(i + distinct.length - 1) % distinct.length];
    const next = distinct[(i + 1) % distinct.length];
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    const dot = (p[0] - prev[0]) * (next[0] - p[0]) + (p[1] - prev[1]) * (next[1] - p[1]);
    return !(Math.abs(cross) < COLLINEAR_EPS && dot > 0);
  });
}

/**
 * The terrain's ring outline: the profile from its first point to its last, then out past the right
 * edge, down below the bottom frame and back left, then up to the profile's start. Left of the scene
 * by `margin`, right of whichever is farther, the scene's width or the profile's own overshoot, and
 * below whichever is lower, the scene's height or the profile.
 */
export function terrainRingOutline(steps: readonly Step[], width: number, height: number, margin = TERRAIN_RING_MARGIN): GemPoint[] {
  const first = steps[0];
  const last = steps[steps.length - 1];
  const left = Math.min(0, first.x0) - margin;
  const right = Math.max(width, last.x1) + margin;
  const lowest = Math.max(height, ...steps.flatMap((s) => [s.y0, s.y1]));
  const bottom = lowest + margin;
  return simplify([
    [left, first.y0],
    [first.x0, first.y0],
    ...steps.map((s): GemPoint => [s.x1, s.y1]),
    [right, last.y1],
    [right, bottom],
    [left, bottom],
  ]);
}

/**
 * Which edges of that outline carry no facet: the frame (the extension's left, right and bottom
 * edges) and the extension runs that lie wholly outside the scene, left of x = 0 or right of
 * x = width. Everything in the scene is kept, including a run or a 45 degree step that crosses the
 * scene's edge.
 */
export function terrainRingSkipEdge(width: number, height: number): (a: GemPoint, b: GemPoint) => boolean {
  return (a, b) =>
    (a[0] <= 0 && b[0] <= 0) || (a[0] >= width && b[0] >= width) || (a[1] >= height && b[1] >= height);
}
