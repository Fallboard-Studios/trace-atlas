// ========================================
// variation (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 28)
// ========================================
// How one robot does its moves, from `Alea(gemSeed + ':work')`, so company members that look alike
// still work differently. Ported from docs/sketches/robot-jobs-and-stations.html's `variation`,
// same draw order: the turn-order shuffle, ring direction, radius scale, trace direction, phase.
// Task 29's spark flicker appended its draws after these, so none of Task 28's moved.
//
// Pure and cheap, so it's computed at job start rather than cached.

// ========================================
// IMPORTS
// ========================================
import Alea from 'alea';

import { FLICKER_SPARKS, RING_RADIUS_JITTER } from '../../constants';
import type { OrbiterCorner } from './sceneToOrbiterLocal';

// ========================================
// TYPES
// ========================================
export interface WorkVariation {
  /** The corners' turn order — who pulses first, who leads a trace. A permutation of 0–3. */
  order: readonly OrbiterCorner[];
  /** Which way the ring turns: 1 or −1. */
  ringDirection: 1 | -1;
  /** The ring radius as a multiple of RING_RADIUS, within ±RING_RADIUS_JITTER. */
  radiusScale: number;
  /** Whether the trace runs the path from its last vertex to its first. */
  traceReversed: boolean;
  /** Where the gather and the ring start round their point, radians in [0, 2π). */
  phase: number;
  /** Maintenance's flicker: FLICKER_SPARKS draws in [0, 1) per corner (indexed by corner), each a
   *  place along the ring where that orbiter sparks (ring.ts `sparkChords`). */
  sparks: readonly (readonly number[])[];
}

// ========================================
// EXPORTS
// ========================================
/** The robot's work variation. Deterministic per gemSeed. */
export function workVariation(gemSeed: number): WorkVariation {
  const rand = Alea(`${gemSeed}:work`);
  const order: OrbiterCorner[] = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    order,
    ringDirection: rand() < 0.5 ? 1 : -1,
    radiusScale: 1 - RING_RADIUS_JITTER + rand() * 2 * RING_RADIUS_JITTER,
    traceReversed: rand() < 0.5,
    phase: rand() * 2 * Math.PI,
    sparks: [0, 1, 2, 3].map(() => Array.from({ length: FLICKER_SPARKS }, () => rand())),
  };
}

/**
 * Each shown orbiter's turn (0 first), by slot: its corner's place in `order` among the shown
 * corners only. `shown` is the locked orbiters' corners in lock order.
 */
export function turnRanks(order: readonly OrbiterCorner[], shown: readonly OrbiterCorner[]): number[] {
  const turns = order.filter((corner) => shown.includes(corner));
  return shown.map((corner) => turns.indexOf(corner));
}
