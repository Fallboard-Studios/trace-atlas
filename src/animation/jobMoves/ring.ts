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
//
// Maintenance's ring adds a spark flicker (Task 29): each orbiter dips in opacity on a few seeded
// chords, plain opacity tweens laid on the same chord timing.

// ========================================
// IMPORTS
// ========================================
import { addPolylineRun } from './trace';
import { FLICKER_OPACITY, RING_RADIUS, RING_REVOLUTIONS } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// CONSTANTS
// ========================================
/** Chords per turn of the ring (15° each, the sketch's 36 per 1.5 turns). */
const RING_SEGMENTS_PER_TURN = 24;

/** Chords in one ring move (36): `ringRoute` has this many + 1 vertices, and the spark flicker
 *  slices the move into this many equal parts. */
export const RING_SEGMENTS = Math.ceil(RING_REVOLUTIONS * RING_SEGMENTS_PER_TURN);

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
  return Array.from({ length: RING_SEGMENTS + 1 }, (_, k) => {
    const a = startAngle + direction * 2 * Math.PI * RING_REVOLUTIONS * (k / RING_SEGMENTS);
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

// ========================================
// SPARK FLICKER (Maintenance, Task 29)
// ========================================
/**
 * The ring chords one orbiter sparks on: each spark draw (variation.ts `sparks`, in [0, 1)) at
 * chord floor(u × segments). Two draws on one chord spark once; run order.
 */
export function sparkChords(sparks: readonly number[], segments: number): number[] {
  return [...new Set(sparks.map((u) => Math.floor(u * segments)))].sort((a, b) => a - b);
}

/**
 * On each of orbiter j's spark chords, its opacity dips to FLICKER_OPACITY at the chord's middle
 * and is back at `restOpacities[j]` by the chord's end. The ring runs at constant speed with
 * equal chords, so chord k is the k-th of `segments` equal slices of [t0, t1]; every dip ends
 * inside the ring, so the reattach finds the orbiter at rest.
 */
export function addSparkFlicker(
  tl: gsap.core.Timeline,
  orbiters: readonly Element[],
  chords: readonly (readonly number[])[],
  restOpacities: readonly number[],
  t0: number,
  t1: number,
  segments: number,
): void {
  const c = (t1 - t0) / segments;
  orbiters.forEach((el, j) => {
    for (const k of chords[j]) {
      tl.to(el, { opacity: FLICKER_OPACITY, duration: c / 2, ease: 'sine.inOut' }, t0 + k * c);
      tl.to(el, { opacity: restOpacities[j], duration: c / 2, ease: 'sine.inOut' }, t0 + (k + 0.5) * c);
    }
  });
}
