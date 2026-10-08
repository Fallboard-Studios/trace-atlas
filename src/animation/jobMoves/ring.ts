// ========================================
// ring (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 28)
// ========================================
// The orbiters circle a point, evenly phased, at the robot's radius (RING_RADIUS × its radius
// scale) and in its direction, for RING_REVOLUTIONS turns over the move. Ported from
// docs/sketches/robot-jobs-and-stations.html.
//
// The circle is a polyline of RING_SEGMENTS_PER_TURN chords per turn, run at constant speed by
// trace.ts's addPolylineRun: plain x/y tweens, so a seek or a silent finish lands exactly, with no
// onUpdate writes. At 15° a chord sags 0.24 u at the widest ring (27.6 u), inside the ±1 u the spec
// allows.

// ========================================
// IMPORTS
// ========================================
import { addPolylineRun } from './trace';
import { RING_RADIUS, RING_REVOLUTIONS } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// CONSTANTS
// ========================================
/** Chords per turn of the ring (15° each, the sketch's 36 per 1.5 turns). */
const RING_SEGMENTS_PER_TURN = 24;

// ========================================
// TARGETS
// ========================================
/** The robot's ring radius, scene units. */
export function ringRadius(radiusScale: number): number {
  return RING_RADIUS * radiusScale;
}

/** Each orbiter's start angle, by slot: evenly spaced, the first directly above at phase 0. */
export function ringStartAngles(count: number, phase: number): number[] {
  return Array.from({ length: count }, (_, j) => phase - Math.PI / 2 + (j * 2 * Math.PI) / count);
}

/** One orbiter's ring: RING_REVOLUTIONS turns round `centre` from `startAngle`, as chord vertices. */
export function ringRoute(centre: Vec2, radius: number, startAngle: number, direction: 1 | -1): Vec2[] {
  const segments = Math.ceil(RING_REVOLUTIONS * RING_SEGMENTS_PER_TURN);
  return Array.from({ length: segments + 1 }, (_, k) => {
    const a = startAngle + direction * 2 * Math.PI * RING_REVOLUTIONS * (k / segments);
    return { x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) };
  });
}

// ========================================
// TWEENS
// ========================================
/** Each orbiter runs its own (local) ring route over exactly [t0, t1], all together. */
export function addRing(
  tl: gsap.core.Timeline,
  orbiters: readonly Element[],
  localRoutes: readonly (readonly Vec2[])[],
  t0: number,
  t1: number,
): void {
  orbiters.forEach((el, j) => addPolylineRun(tl, el, localRoutes[j], t0, t1 - t0));
}
