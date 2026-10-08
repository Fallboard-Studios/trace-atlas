// ========================================
// carry (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 29)
// ========================================
// Salvage: the orbiters load up at one work point (shrink, as if loaded), carry side by side to a
// second, drop (back to rest scale) and return. Ported from docs/sketches/robot-jobs-and-
// stations.html, with its timing: load by 10 % of the move, arrive by 45 %, drop by 55 %, back by
// 90 %, then hold on the pick-up until the move ends.
//
// Targets are pure (scene units); the tweens take each orbiter's [pick-up, drop] already mapped
// into its local frame. The flight to the pick-up is the move's approach (buildJobTimeline.ts).

// ========================================
// IMPORTS
// ========================================
import { CARRY_SHRINK } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// CONSTANTS
// ========================================
/** Orbiters carry side by side, this far apart in x (scene units, the sketch's). */
export const CARRY_SPACING = 8;

/** Fractions of the move: loaded, arrived at the drop, dropped, back on the pick-up. */
const LOADED = 0.1;
const ARRIVED = 0.45;
const DROPPED = 0.55;
const RETURNED = 0.9;

// ========================================
// TARGETS
// ========================================
/** Each orbiter's pick-up and drop: `a` and `b`, offset CARRY_SPACING apart in x, centred. */
export function carryTargets(a: Vec2, b: Vec2, count: number): { from: Vec2; to: Vec2 }[] {
  return Array.from({ length: count }, (_, j) => {
    const dx = (j - (count - 1) / 2) * CARRY_SPACING;
    return { from: { x: a.x + dx, y: a.y }, to: { x: b.x + dx, y: b.y } };
  });
}

// ========================================
// TWEENS
// ========================================
/**
 * Every orbiter together over [t0, t1], starting on its pick-up (`localRoutes[j][0]`) at its rest
 * scale: shrink to CARRY_SHRINK × rest, carry to the drop (`localRoutes[j][1]`), grow back to rest,
 * return, and hold. Ends at rest scale, so the reattach only flies it home.
 */
export function addCarry(
  tl: gsap.core.Timeline,
  orbiters: readonly Element[],
  localRoutes: readonly (readonly Vec2[])[],
  restScales: readonly number[],
  t0: number,
  t1: number,
): void {
  const L = t1 - t0;
  const at = (f: number) => t0 + f * L;
  const ease = 'sine.inOut';
  orbiters.forEach((el, j) => {
    const [from, to] = localRoutes[j];
    tl.to(el, { scale: restScales[j] * CARRY_SHRINK, duration: LOADED * L, ease }, t0);
    tl.to(el, { x: to.x, y: to.y, duration: (ARRIVED - LOADED) * L, ease }, at(LOADED));
    tl.to(el, { scale: restScales[j], duration: (DROPPED - ARRIVED) * L, ease }, at(ARRIVED));
    tl.to(el, { x: from.x, y: from.y, duration: (RETURNED - DROPPED) * L, ease }, at(DROPPED));
  });
}
