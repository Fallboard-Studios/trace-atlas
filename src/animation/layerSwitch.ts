// ========================================
// layerSwitch (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.10, Phase 43 Task 32)
// ========================================
// Where a robot may change robot layer on a leg. The back robot layer sits behind the midground,
// so a robot that changed layer while overlapping a midground building would pop through it. The
// switch happens at the first point along the straight leg — sampled every LAYER_SWITCH_STEP — where
// the robot's box overlaps no midground silhouette; with none, the leg has no switch point and the
// loop skips the site for that decision.

// ========================================
// IMPORTS
// ========================================
import { gemWidth, GEM_CANVAS_H, type RobotGem } from '../components/robot/gem/polygon';
import { LAYER_SWITCH_STEP } from '../constants';
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
 * The first point on the leg `from` → `to` (robot positions) where `robotBox` — the robot's box
 * relative to its position — overlaps none of `midgroundBounds`. Samples `from`, then every
 * LAYER_SWITCH_STEP along the leg, then `to`. A leg already clear returns (a copy of) `from`; one
 * covered end to end returns null. Pure.
 */
export function findLayerSwitchPoint(from: Vec2, to: Vec2, robotBox: Box, midgroundBounds: readonly Box[]): Vec2 | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  for (let d = 0; d < length; d += LAYER_SWITCH_STEP) {
    const at = { x: from.x + (dx * d) / length, y: from.y + (dy * d) / length };
    if (isClear(robotBox, at, midgroundBounds)) return at;
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
