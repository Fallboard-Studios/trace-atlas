// ========================================
// hoverPulse (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================
// The orbiters gather round one work point and pulse in turn. The targets are pure scene maths;
// `addHoverPulse` only adds the pulses. The flight to the targets is the job's detach
// (buildJobTimeline.ts), so the move never writes position.

// ========================================
// IMPORTS
// ========================================

import { HOVER_GATHER_RADIUS, HOVER_PULSE_SCALE } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// TARGETS
// ========================================
/**
 * Where `count` orbiters gather: evenly round `point` at HOVER_GATHER_RADIUS, the first directly
 * above it. Spaced by slot, not by corner, so any count spreads evenly. J3's per-robot variation
 * adds a seeded phase.
 */
export function hoverPulseTargets(point: Vec2, count: number): Vec2[] {
  return Array.from({ length: count }, (_, j) => {
    const a = -Math.PI / 2 + (j * 2 * Math.PI) / count;
    return { x: point.x + HOVER_GATHER_RADIUS * Math.cos(a), y: point.y + HOVER_GATHER_RADIUS * Math.sin(a) };
  });
}

// ========================================
// TWEENS
// ========================================
/**
 * Pulses each orbiter in turn over [t0, t1]: equal slots in the given order, each going to
 * `restScales[j] × HOVER_PULSE_SCALE` at its middle and back to rest by its end.
 */
export function addHoverPulse(tl: gsap.core.Timeline, orbiters: readonly Element[], restScales: readonly number[], t0: number, t1: number): void {
  const slot = (t1 - t0) / orbiters.length;
  orbiters.forEach((el, j) => {
    const start = t0 + j * slot;
    tl.to(el, { scale: restScales[j] * HOVER_PULSE_SCALE, duration: slot / 2, ease: 'sine.inOut' }, start);
    tl.to(el, { scale: restScales[j], duration: slot / 2, ease: 'sine.inOut' }, start + slot / 2);
  });
}
