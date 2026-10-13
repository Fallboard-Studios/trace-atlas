// ========================================
// events (docs/specs/JOB_DECORATION.md §1.2, Task 4)
// ========================================
// What each move of a job run does, as plain data: `planStep` (buildJobTimeline.ts) fills one of
// these per step from the windows, targets, ranks and routes it already computes, so a decoration
// reads the plan instead of re-deriving a tweened position. Everything is in timeline seconds and
// scene units, and JSON-serialisable (no elements, no GSAP). Types only.

// ========================================
// IMPORTS
// ========================================
import type { OrbiterCorner } from '../sceneToOrbiterLocal';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
/** hoverPulse: each orbiter gathers at `target` and pulses in its slot, from `start`. */
export interface PulseOrb {
  corner: OrbiterCorner;
  start: number;
  target: Vec2;
}

/** fan: as a pulse, plus `dir`, the unit vector from the move's point to `target`. */
export interface FanOrb extends PulseOrb {
  dir: Vec2;
}

/** trace: each orbiter starts its run along the route at `start`. */
export interface TraceOrb {
  corner: OrbiterCorner;
  start: number;
}

/** ring: where on the circle the orbiter starts (radians), and the ring chords it sparks on
 *  (Maintenance's flicker; empty for a ring that does not flicker). */
export interface RingOrb {
  corner: OrbiterCorner;
  startAngle: number;
  sparkChords: number[];
}

/** carry: the orbiter's x spacing from the pick-up and from the drop (`carryTargets`). */
export interface CarryOrb {
  corner: OrbiterCorner;
  offset: number;
}

/** One move's events over its work window [t0, t1] (`moveWindows`' start and end). `orbs` is in lock
 *  (slot) order, one per shown orbiter. */
export type MoveEvents =
  | { kind: 'pulse'; point: Vec2; t0: number; t1: number; slot: number; orbs: PulseOrb[] }
  | { kind: 'fan'; point: Vec2; t0: number; t1: number; slot: number; orbs: FanOrb[] }
  | { kind: 'trace'; route: Vec2[]; t0: number; t1: number; run: number; orbs: TraceOrb[] }
  | { kind: 'ring'; centre: Vec2; radius: number; direction: 1 | -1; t0: number; t1: number; orbs: RingOrb[] }
  | { kind: 'carry'; a: Vec2; b: Vec2; t0: number; t1: number; orbs: CarryOrb[] };

/** What `buildJobTimeline` keeps on the timeline's `data`: one entry per move, in step order (empty
 *  under reduced motion, which plans no moves). */
export interface JobTimelineData {
  events: MoveEvents[];
}
