// ========================================
// trace (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 28)
// ========================================
// The orbiters run a site's path in a staggered line: each starts TRACE_STAGGER of the move after
// the one before it (in the robot's turn order) and runs the whole path at constant speed, the
// last to start ending as the move does. Ported from docs/sketches/robot-jobs-and-stations.html.
//
// Targets are pure (scene units, in route order); the tweens take routes already mapped into each
// orbiter's local frame. That map is a translate and a uniform scale, so a straight segment stays
// straight and a constant speed stays constant. `addPolylineRun` is shared with ring.ts.

// ========================================
// IMPORTS
// ========================================
import { TRACE_STAGGER } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// TARGETS
// ========================================
/**
 * The vertices the orbiters visit, in order: the path, reversed when the robot traces backwards,
 * with repeated vertices dropped so no segment has zero length. Never mutates `path`.
 */
export function traceRoute(path: readonly Vec2[], reversed: boolean): Vec2[] {
  const ordered = reversed ? [...path].reverse() : [...path];
  return ordered.filter((p, k) => k === 0 || p.x !== ordered[k - 1].x || p.y !== ordered[k - 1].y);
}

/**
 * When each orbiter starts over [t0, t1], by its turn rank, and how long its run lasts. Starts are
 * TRACE_STAGGER of the window apart; the last to start ends exactly at t1.
 */
export function traceTimes(ranks: readonly number[], t0: number, t1: number): { starts: number[]; run: number } {
  const span = t1 - t0;
  const stagger = TRACE_STAGGER * span;
  const run = span - Math.max(0, ranks.length - 1) * stagger;
  return { starts: ranks.map((rank) => t0 + rank * stagger), run };
}

// ========================================
// TWEENS
// ========================================
/**
 * One element along `route` (its local x/y), vertex to vertex at constant speed: starting at
 * `start` from wherever it is (the first vertex), ending at the last at `start + run`. A
 * one-vertex route adds nothing.
 */
export function addPolylineRun(tl: gsap.core.Timeline, el: Element, route: readonly Vec2[], start: number, run: number): void {
  const lengths = route.slice(1).map((p, k) => Math.hypot(p.x - route[k].x, p.y - route[k].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return;
  let t = start;
  lengths.forEach((length, k) => {
    const duration = (length / total) * run;
    tl.to(el, { x: route[k + 1].x, y: route[k + 1].y, duration, ease: 'none' }, t);
    t += duration;
  });
}

/** Each orbiter runs its own (local) route over [t0, t1], staggered by turn rank (`traceTimes`). */
export function addTrace(
  tl: gsap.core.Timeline,
  orbiters: readonly Element[],
  localRoutes: readonly (readonly Vec2[])[],
  ranks: readonly number[],
  t0: number,
  t1: number,
): void {
  const { starts, run } = traceTimes(ranks, t0, t1);
  orbiters.forEach((el, j) => addPolylineRun(tl, el, localRoutes[j], starts[j], run));
}
