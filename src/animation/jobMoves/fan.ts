// ========================================
// fan (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 29)
// ========================================
// The orbiters spread into a fan above a work point, then ping in turn (scale up and back). Acoustic
// Survey's first move, before its ring. Ported from docs/sketches/robot-jobs-and-stations.html.
//
// Targets are pure scene maths; the flight to them is the move's approach (buildJobTimeline.ts),
// so `addFan` only adds the pings. The fan doesn't turn with the robot's phase: it always opens
// upward, over the site. The ping order is the robot's turn order (variation.ts).

// ========================================
// IMPORTS
// ========================================
import { addPulsesInTurn } from './hoverPulse';
import { FAN_PING_SCALE, FAN_RADIUS, FAN_SPREAD_DEG } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// TARGETS
// ========================================
/**
 * Where `count` orbiters fan out: FAN_RADIUS from `point`, evenly over FAN_SPREAD_DEG centred on
 * straight up, left to right by slot. One orbiter goes straight up.
 */
export function fanTargets(point: Vec2, count: number): Vec2[] {
  const step = count > 1 ? FAN_SPREAD_DEG / (count - 1) : 0;
  return Array.from({ length: count }, (_, j) => {
    const a = ((-90 + (j - (count - 1) / 2) * step) * Math.PI) / 180;
    return { x: point.x + FAN_RADIUS * Math.cos(a), y: point.y + FAN_RADIUS * Math.sin(a) };
  });
}

// ========================================
// TWEENS
// ========================================
/** Pings each orbiter in turn over [t0, t1] to FAN_PING_SCALE × its rest scale (addPulsesInTurn). */
export function addFan(
  tl: gsap.core.Timeline,
  orbiters: readonly Element[],
  restScales: readonly number[],
  t0: number,
  t1: number,
  ranks?: readonly number[],
): void {
  addPulsesInTurn(tl, orbiters, restScales, FAN_PING_SCALE, t0, t1, ranks);
}
