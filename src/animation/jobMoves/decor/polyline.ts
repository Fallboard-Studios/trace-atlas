// ========================================
// polyline (docs/specs/JOB_DECORATION.md §1.5, Task 2)
// ========================================
// Pure route maths for the decorations that ride a site path: the inspection trail and ticks, the
// fluid droplets. Ported from docs/sketches/job-decorations.html (`polyLen`, `polyAt`,
// `polyVertices`), on `Vec2` points. Nothing here touches GSAP or the DOM.

// ========================================
// IMPORTS
// ========================================
import { lerp } from '../../../utils/math';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
export interface PolyVertex {
  /** A copy of the route's vertex. */
  p: Vec2;
  /** How far along the route's length the vertex sits, 0 at the first vertex and exactly 1 at the last. */
  u: number;
  /** Unit direction of travel through the vertex. */
  dir: Vec2;
}

// ========================================
// LENGTH
// ========================================
function segmentLengths(route: readonly Vec2[]): number[] {
  return route.slice(1).map((p, k) => Math.hypot(p.x - route[k].x, p.y - route[k].y));
}

/** The summed length of every segment — a closed-looking route (first = last) counts them all. */
export function polyLen(route: readonly Vec2[]): number {
  return segmentLengths(route).reduce((a, b) => a + b, 0);
}

// ========================================
// POINT AT u
// ========================================
/**
 * The point `u` of the way along the route's length, at constant speed (so by length, not by vertex
 * count). `u` is clamped to [0, 1]; a NaN `u` reads as the start, so a 0/0 in a caller's maths can
 * never put NaN on an attribute. A route with no length (one vertex, or every vertex the same
 * point) returns its first vertex. Throws on an empty route.
 */
export function polyAt(route: readonly Vec2[], u: number): Vec2 {
  if (route.length === 0) throw new RangeError('polyAt: an empty route has no point');
  const lengths = segmentLengths(route);
  const total = lengths.reduce((a, b) => a + b, 0);
  const last = route[route.length - 1];
  if (!(total > 0) || !(u > 0)) return { x: route[0].x, y: route[0].y };
  if (u >= 1) return { x: last.x, y: last.y };
  let remaining = u * total;
  for (let k = 0; k < lengths.length; k++) {
    if (remaining <= lengths[k] || k === lengths.length - 1) {
      const t = lengths[k] > 0 ? remaining / lengths[k] : 0;
      return { x: lerp(route[k].x, route[k + 1].x, t), y: lerp(route[k].y, route[k + 1].y, t) };
    }
    remaining -= lengths[k];
  }
  return { x: last.x, y: last.y };
}

// ========================================
// VERTICES
// ========================================
const FALLBACK_DIR: Vec2 = { x: 1, y: 0 };

function unit(dx: number, dy: number): Vec2 | null {
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : null;
}

/** The direction of the nearest segment that has length, searching away from vertex `k` in `step` (±1). */
function nearestSegmentDir(route: readonly Vec2[], k: number, step: 1 | -1): Vec2 | null {
  // Walking backward the segment ending at k - 1 → k is route[k - 1] → route[k]; forward it is route[k] → route[k + 1].
  for (let i = k; i >= 0 && i < route.length; i += step) {
    const from = step === 1 ? route[i] : route[i - 1];
    const to = step === 1 ? route[i + 1] : route[i];
    if (!from || !to) break;
    const dir = unit(to.x - from.x, to.y - from.y);
    if (dir) return dir;
  }
  return null;
}

/**
 * Every vertex with its `u` and a unit direction. Interior vertices point along the chord from the
 * previous to the next vertex — the incoming and outgoing segments averaged, weighted by their
 * length, as the sketch does — and the ends use their one segment. Where that chord has no length
 * (a repeated vertex at the ends, or a route that doubles back on itself) the vertex takes the
 * nearest segment's direction, incoming first; a route with no length at all gets `{ x: 1, y: 0 }`.
 * The direction is never zero or NaN.
 */
export function polyVertices(route: readonly Vec2[]): PolyVertex[] {
  const lengths = segmentLengths(route);
  const total = lengths.reduce((a, b) => a + b, 0);
  let along = 0;
  return route.map((p, k) => {
    if (k > 0) along += lengths[k - 1];
    const prev = route[Math.max(0, k - 1)];
    const next = route[Math.min(route.length - 1, k + 1)];
    const dir =
      unit(next.x - prev.x, next.y - prev.y) ??
      nearestSegmentDir(route, k, -1) ??
      nearestSegmentDir(route, k, 1) ??
      FALLBACK_DIR;
    return { p: { x: p.x, y: p.y }, u: total > 0 ? along / total : 0, dir: { x: dir.x, y: dir.y } };
  });
}
