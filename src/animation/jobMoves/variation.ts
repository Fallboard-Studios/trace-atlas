// ========================================
// variation (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 28)
// ========================================
// How one robot does its moves, from `Alea(gemSeed + ':work')`, so company members that look alike
// still work differently. Ported from docs/sketches/robot-jobs-and-stations.html's `variation`,
// same draw order: the turn-order shuffle, ring direction, radius scale, trace direction, phase.
// Task 29's spark flicker appended its draws after these, so none of Task 28's moved. The job
// decorations (docs/specs/JOB_DECORATION.md Assumption 7) append theirs after the sparks the same
// way: sparkDirs, moteDrift, swingPhase, loadSeed, then the twelve decor factors. Never insert
// a draw ahead of an existing one — every robot's look is fixed by this stream.
//
// Pure and cheap, so it's computed at job start rather than cached.

// ========================================
// IMPORTS
// ========================================
import Alea from 'alea';

import { DECOR_JITTER, FLICKER_SPARKS, RING_RADIUS_JITTER } from '../../constants';
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
  /** Maintenance's spark directions: per corner, per spark chord (FLICKER_SPARKS), three draws in
   *  [0, 1) that offset a spark's angle. A chord shows more than three sparks, so spark `s` reads
   *  `[s % 3]`, as the sketch does (decor/maintenanceDecor.ts). */
  sparkDirs: readonly (readonly (readonly number[])[])[];
  /** Vent Extraction's mote drift: per corner, four draws in [0, 1), one per mote (decor/ventDecor.ts). */
  moteDrift: readonly (readonly number[])[];
  /** Where Salvage's load starts its swing, radians in [0, 2π). */
  swingPhase: number;
  /** Salvage's load shape: a diamond below 0.5, a hexagon from it. */
  loadSeed: number;
  /** This robot's twelve decoration factors, each within ±DECOR_JITTER of 1. */
  decor: DecorFactors;
}

/** Sizes and timings only — counts and opacities never vary. Declared in draw order. */
export interface DecorFactors {
  ventRise: number;
  ventLife: number;
  surveyReach: number;
  surveyLife: number;
  trailLength: number;
  tickLife: number;
  dropLag: number;
  valveSize: number;
  hang: number;
  loadSize: number;
  sparkReach: number;
  sparkLife: number;
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
  // Object literal properties evaluate in source order, so this IS the draw order. Append only.
  const factor = () => 1 - DECOR_JITTER + rand() * 2 * DECOR_JITTER;
  return {
    order,
    ringDirection: rand() < 0.5 ? 1 : -1,
    radiusScale: 1 - RING_RADIUS_JITTER + rand() * 2 * RING_RADIUS_JITTER,
    traceReversed: rand() < 0.5,
    phase: rand() * 2 * Math.PI,
    sparks: [0, 1, 2, 3].map(() => Array.from({ length: FLICKER_SPARKS }, () => rand())),
    sparkDirs: [0, 1, 2, 3].map(() => Array.from({ length: FLICKER_SPARKS }, () => [rand(), rand(), rand()])),
    moteDrift: [0, 1, 2, 3].map(() => [rand(), rand(), rand(), rand()]),
    swingPhase: rand() * 2 * Math.PI,
    loadSeed: rand(),
    decor: {
      ventRise: factor(),
      ventLife: factor(),
      surveyReach: factor(),
      surveyLife: factor(),
      trailLength: factor(),
      tickLife: factor(),
      dropLag: factor(),
      valveSize: factor(),
      hang: factor(),
      loadSize: factor(),
      sparkReach: factor(),
      sparkLife: factor(),
    },
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
