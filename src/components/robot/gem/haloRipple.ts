// ========================================
// HALO RIPPLE (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.3)
// ========================================
// Pure maths for the ripple: a narrow bright ring on a second ellipse over the halo, travelling
// hole → edge during a Phase 40 spawn arc and 95 % → hole during a despawn arc, a whole number of
// cycles per arc so the last ring lands with the orbiter. `useHaloMotion.decorateArc` feeds these
// to a proxy tween; nothing here touches GSAP, the DOM or AudioEngine. Ported from
// docs/sketches/robot-halo-and-lit-lines.html's startRipple/rippleStops.

// ========================================
// IMPORTS
// ========================================
import type { HaloStop } from './haloDials';

// ========================================
// TYPES
// ========================================
export type RippleKind = 'spawn' | 'despawn';

// ========================================
// CONSTANTS
// ========================================
/** Seconds per ring (intent "Ripple" row; interview: "the most important thing was keeping the
 *  ripple slow"). Phase 40's arcs are 2–4 s, so most robots get a single slow ring. */
export const RIPPLE_PERIOD = 2.5;

/** Ring half-width as a fraction of the radius, each side of the ring (intent "Ripple" row). */
export const RIPPLE_WIDTH = 0.08;

/** Ring peak stop-opacity (intent "Ripple" row). */
export const RIPPLE_OPACITY = 0.9;

/** Where the inward (despawn) ring starts — leaves the last 5 % of the base fade visible. */
export const RIPPLE_DESPAWN_FROM = 0.95;

/** The ring fades in over the arc's first 10 % and out over its last 10 %. */
export const RIPPLE_EDGE = 0.1;

// ========================================
// HELPERS
// ========================================
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ========================================
// MATHS
// ========================================
/** Whole cycles per arc: max(1, round(arcDuration / RIPPLE_PERIOD)). */
export function rippleCycles(arcDuration: number): number {
  return Math.max(1, Math.round(arcDuration / RIPPLE_PERIOD));
}

/** Ring centre (0..1 of the radius) at arc progress `u` (0..1). Spawn: hole → 1; despawn:
 *  RIPPLE_DESPAWN_FROM → hole; each restarts every 1 / cycles of the arc. */
export function ripplePosition(kind: RippleKind, u: number, cycles: number, holeOffset: number): number {
  const f = (u * cycles) % 1;
  return kind === 'spawn' ? lerp(holeOffset, 1, f) : lerp(RIPPLE_DESPAWN_FROM, holeOffset, f);
}

/** Fade-in / fade-out multiplier over the arc: min(1, u / EDGE, (1 − u) / EDGE), floored at 0. */
export function rippleEnvelope(u: number): number {
  return Math.max(0, Math.min(1, u / RIPPLE_EDGE, (1 - u) / RIPPLE_EDGE));
}

/** Five gradient stops — 0, lo, position, hi, 1 — with the ring clamped inside [hole, 1] and its
 *  opacity RIPPLE_OPACITY × envelope. */
export function rippleStops(position: number, holeOffset: number, envelope: number): HaloStop[] {
  const lo = Math.max(holeOffset, position - RIPPLE_WIDTH);
  const hi = Math.min(1, position + RIPPLE_WIDTH);
  return [
    { offset: 0, opacity: 0 },
    { offset: lo, opacity: 0 },
    { offset: position, opacity: RIPPLE_OPACITY * envelope },
    { offset: hi, opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}
