// ========================================
// RIPPLE ENVELOPE (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.3)
// ========================================
// What is left of the robot halo's ripple ring (the robot's own ring was replaced by the triangular waves,
// haloWaves.ts, 2026-10-12): the arc kind, the ring's peak opacity and the fade-in / fade-out envelope, which the
// charging station's ripple (animation/stationRipple.ts) still shares. Pure maths; nothing here touches GSAP, the
// DOM or AudioEngine.

// ========================================
// TYPES
// ========================================
export type RippleKind = 'spawn' | 'despawn';

// ========================================
// CONSTANTS
// ========================================
/** Ring peak stop-opacity (intent "Ripple" row). */
export const RIPPLE_OPACITY = 0.9;

/** The ring fades in over the arc's first 10 % and out over its last 10 %. */
export const RIPPLE_EDGE = 0.1;

// ========================================
// MATHS
// ========================================
/** Fade-in / fade-out multiplier over the arc: min(1, u / EDGE, (1 − u) / EDGE), floored at 0. */
export function rippleEnvelope(u: number): number {
  return Math.max(0, Math.min(1, u / RIPPLE_EDGE, (1 - u) / RIPPLE_EDGE));
}
