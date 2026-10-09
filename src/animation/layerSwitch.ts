// ========================================
// layerSwitch (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.10, Phase 43 Tasks 32 and 32b)
// ========================================
// Where a robot may change robot layer on a leg. The back robot layer sits behind the midground,
// so a robot that changed layer while overlapping a midground silhouette would pop through it.
// The change is a dissolve (LAYER_DISSOLVE_SECONDS, the robot drawn in both rows), so the robot
// must stay clear for all of it: the switch point is the first point along the straight leg —
// sampled every LAYER_SWITCH_STEP — that starts a clear run, the stretch the second swim covers
// during the dissolve. With none, the leg has no switch point and the loop skips the site for that
// decision.

// ========================================
// IMPORTS
// ========================================
import { gemWidth, GEM_CANVAS_H, type RobotGem } from '../components/robot/gem/polygon';
import { LAYER_DISSOLVE_SECONDS, LAYER_SWITCH_STEP, SWIM_SPEED } from '../constants';
import type { Box } from '../systems/stations';
import type { Vec2 } from '../types/Vec2';

// ========================================
// HELPERS
// ========================================
/** Whether `box`, placed at `at`, overlaps `other`. Touching edges don't overlap. */
function overlapsAt(box: Box, at: Vec2, other: Box): boolean {
  return at.x + box.x0 < other.x1 && other.x0 < at.x + box.x1 && at.y + box.y0 < other.y1 && other.y0 < at.y + box.y1;
}

const isClear = (box: Box, at: Vec2, silhouettes: readonly Box[]) => !silhouettes.some((s) => overlapsAt(box, at, s));

// ========================================
// API
// ========================================
/**
 * How far the second swim carries the robot during the dissolve, scene units: a sine.inOut swim
 * from rest over `remaining` at SWIM_SPEED (swimAnimation.ts's duration rule), LAYER_DISSOLVE_SECONDS
 * in — or all of `remaining` when the swim ends sooner. Pure.
 */
export function dissolveRunLength(remaining: number): number {
  if (!(remaining > 0)) return 0;
  const u = Math.min(1, (LAYER_DISSOLVE_SECONDS * SWIM_SPEED) / remaining);
  return (remaining * (1 - Math.cos(Math.PI * u))) / 2;
}

/**
 * The first point on the leg `from` → `to` (robot positions) that starts a clear run: `robotBox` —
 * the robot's box relative to its position — overlaps none of `midgroundBounds` from there to
 * `dissolveRunLength` further on (to the leg's end, at most). Candidates are `from`, every
 * LAYER_SWITCH_STEP along the leg, then `to`; each run is checked at the same step and at its end.
 * A leg clear end to end returns (a copy of) `from`; null when no candidate's run is clear. Pure.
 */
export function findLayerSwitchPoint(from: Vec2, to: Vec2, robotBox: Box, midgroundBounds: readonly Box[]): Vec2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const pointAt = (d: number): Vec2 => (d >= length ? { ...to } : { x: from.x + (dx * d) / length, y: from.y + (dy * d) / length });

  const runIsClear = (d: number): boolean => {
    const end = d + dissolveRunLength(length - d);
    for (let s = d; s < end; s += LAYER_SWITCH_STEP) {
      if (!isClear(robotBox, pointAt(s), midgroundBounds)) return false;
    }
    return isClear(robotBox, pointAt(end), midgroundBounds);
  };

  for (let d = 0; d < length; d += LAYER_SWITCH_STEP) {
    if (runIsClear(d)) return pointAt(d);
  }
  return isClear(robotBox, to, midgroundBounds) ? { ...to } : null;
}

/**
 * The robot's drawn box relative to its position: the gem canvas, scaled by `bodyScale` about its
 * centre the way `g.gem` is. The orbiters dock inside the canvas.
 */
export function robotBoxAt(gem: RobotGem, bodyScale: number): Box {
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  return { x0: cx - cx * bodyScale, y0: cy - cy * bodyScale, x1: cx + cx * bodyScale, y1: cy + cy * bodyScale };
}
