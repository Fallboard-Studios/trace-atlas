// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { LFO_LANE_SEED_BIAS, pickLane, tallyLanes } from './lfoLaneDraw';
import { LFO_LANE_IDS, type LfoLaneId, type LfoLink } from '../types/lfo';

// ========================================
// HELPERS
// ========================================

const ZERO_COUNTS: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
const GRID_SIZE = 10_000;

/** Samples pickLane over a GRID_SIZE-point grid of t in [0, 1) and returns each lane's share. */
function sampleShares(counts: Readonly<Record<LfoLaneId, number>>): Record<LfoLaneId, number> {
  const tallies: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
  for (let i = 0; i < GRID_SIZE; i++) {
    tallies[pickLane(i / GRID_SIZE, counts)]++;
  }
  const shares = {} as Record<LfoLaneId, number>;
  for (const lane of LFO_LANE_IDS) shares[lane] = tallies[lane] / GRID_SIZE;
  return shares;
}

// ========================================
// TESTS
// ========================================

describe('LFO_LANE_SEED_BIAS', () => {
  it('leans a > b > c > d (docs/specs/LFO_BANK.md §1.3)', () => {
    expect(LFO_LANE_SEED_BIAS).toEqual({ a: 1, b: 0.85, c: 0.7, d: 0.55 });
  });
});

describe('pickLane', () => {
  it('at zero counts, partitions [0, 1) into strictly decreasing shares a > b > c > d summing to 1', () => {
    const shares = sampleShares(ZERO_COUNTS);
    expect(shares.a).toBeGreaterThan(shares.b);
    expect(shares.b).toBeGreaterThan(shares.c);
    expect(shares.c).toBeGreaterThan(shares.d);
    expect(shares.a + shares.b + shares.c + shares.d).toBeCloseTo(1, 5);
  });

  it('a prior count of 3 on lane a quarters lane a\'s raw weight, shrinking its normalized share accordingly', () => {
    // weight[l] = bias[l] / (1 + count[l]); share = weight[l] / sum(weights) — spec §4. A count of 3
    // divides a's own weight by 4, but b/c/d's weights are untouched, so the total shrinks too and a's
    // post-normalization share falls by less than a straight quarter (partial self-offsetting).
    const biasSum = 1 + 0.85 + 0.7 + 0.55; // LFO_LANE_SEED_BIAS a+b+c+d
    const expectedZeroShareA = 1 / biasSum;
    const expectedWithCountsShareA = 0.25 / (0.25 + 0.85 + 0.7 + 0.55);

    const zeroShareA = sampleShares(ZERO_COUNTS).a;
    const withCountsShareA = sampleShares({ a: 3, b: 0, c: 0, d: 0 }).a;

    expect(zeroShareA).toBeCloseTo(expectedZeroShareA, 2);
    expect(withCountsShareA).toBeCloseTo(expectedWithCountsShareA, 2);
  });

  it('t just below 1 returns the last lane, d (rounding at the top of the cumulative sum)', () => {
    expect(pickLane(0.999999, ZERO_COUNTS)).toBe('d');
  });
});

describe('tallyLanes', () => {
  it('counts each linked lane, ignoring lane: null and undefined entries', () => {
    const links: Array<LfoLink | undefined> = [
      { lane: 'a', depth: 10 },
      { lane: null, depth: 0 },
      undefined,
      { lane: 'b', depth: 5 },
      { lane: 'a', depth: 20 },
    ];
    expect(tallyLanes(links)).toEqual({ a: 2, b: 1, c: 0, d: 0 });
  });

  it('returns all-zero counts for an empty iterable', () => {
    expect(tallyLanes([])).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});
