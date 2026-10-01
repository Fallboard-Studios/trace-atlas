/**
 * The weighted LFO lane draw, pure and shared by both seeders
 * (globalAudioSeed.ts's generateGlobalLfoLinks, spawnSystem.ts's
 * generateRobotLfoLinks) — docs/specs/LFO_BANK.md §1.3/§4.
 */

import { LFO_LANE_IDS, type LfoLaneId, type LfoLink } from '../types/lfo';

// ========================================
// SEED BIAS
// ========================================

/** Seed-only lane order bias (spec §1.3): a > b > c > d on load, a little each step. */
export const LFO_LANE_SEED_BIAS: Readonly<Record<LfoLaneId, number>> = { a: 1, b: 0.85, c: 0.7, d: 0.55 };

// ========================================
// PICK
// ========================================

/** Weighted pick: order bias / (1 + count) — leans toward earlier AND less-used lanes.
 *  `t` is one seeded draw in [0, 1). */
export function pickLane(t: number, counts: Readonly<Record<LfoLaneId, number>>): LfoLaneId {
  const weights = LFO_LANE_IDS.map((lane) => LFO_LANE_SEED_BIAS[lane] / (1 + counts[lane]));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < LFO_LANE_IDS.length; i++) {
    acc += weights[i] / total;
    if (t < acc) return LFO_LANE_IDS[i];
  }
  return LFO_LANE_IDS[LFO_LANE_IDS.length - 1]; // t === 1 - ε rounding
}

// ========================================
// TALLY
// ========================================

/** Counts linked lanes across a robot's/world's targets, ignoring `lane: null` and
 *  absent entries — the running tally pickLane's `counts` argument wants. */
export function tallyLanes(links: Iterable<LfoLink | undefined>): Record<LfoLaneId, number> {
  const counts: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
  for (const link of links) {
    if (link?.lane) counts[link.lane]++;
  }
  return counts;
}
