// ========================================
// IMPORTS
// ========================================
import Alea from 'alea';
import { describe, it, expect } from 'vitest';

import { workVariation, turnRanks, type WorkVariation } from './variation';
import { FLICKER_SPARKS, RING_RADIUS_JITTER } from '../../constants';

// ========================================
// HELPERS
// ========================================
const GEM_SEED = 20261004;
const SEEDS = Array.from({ length: 500 }, (_, k) => 1000 + k * 7919);

// ========================================
// TESTS
// ========================================
describe('workVariation (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Task 28)', () => {
  it('is deterministic per gemSeed', () => {
    for (const seed of SEEDS.slice(0, 20)) expect(workVariation(seed)).toEqual(workVariation(seed));
  });

  it('two gem seeds differ in at least one parameter — every pair over 500 seeds', () => {
    const keys = new Set(SEEDS.map((s) => JSON.stringify(workVariation(s))));
    expect(keys.size).toBe(SEEDS.length);
  });

  it('order is a permutation of the four corners', () => {
    for (const seed of SEEDS) expect([...workVariation(seed).order].sort()).toEqual([0, 1, 2, 3]);
  });

  it('ring direction is ±1, and both directions occur', () => {
    const dirs = SEEDS.map((s) => workVariation(s).ringDirection);
    for (const d of dirs) expect([1, -1]).toContain(d);
    expect(new Set(dirs).size).toBe(2);
  });

  it('radius scale is within ±RING_RADIUS_JITTER (15 %) and spreads across it', () => {
    expect(RING_RADIUS_JITTER).toBe(0.15);
    const ks = SEEDS.map((s) => workVariation(s).radiusScale);
    for (const k of ks) {
      expect(k).toBeGreaterThanOrEqual(1 - RING_RADIUS_JITTER);
      expect(k).toBeLessThan(1 + RING_RADIUS_JITTER);
    }
    expect(Math.min(...ks)).toBeLessThan(0.9);
    expect(Math.max(...ks)).toBeGreaterThan(1.1);
  });

  it('trace direction is a boolean, and both occur', () => {
    expect(new Set(SEEDS.map((s) => workVariation(s).traceReversed))).toEqual(new Set([true, false]));
  });

  it('phase is in [0, 2π)', () => {
    for (const seed of SEEDS) {
      const { phase } = workVariation(seed);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(2 * Math.PI);
    }
  });

  it('sparks: FLICKER_SPARKS draws in [0, 1) for each of the four corners, differing between corners', () => {
    expect(FLICKER_SPARKS).toBe(3);
    for (const seed of SEEDS) {
      const { sparks } = workVariation(seed);
      expect(sparks).toHaveLength(4);
      for (const corner of sparks) {
        expect(corner).toHaveLength(FLICKER_SPARKS);
        for (const u of corner) {
          expect(u).toBeGreaterThanOrEqual(0);
          expect(u).toBeLessThan(1);
        }
      }
      expect(new Set(sparks.map((c) => JSON.stringify(c))).size).toBe(4);
    }
  });

  it('draws from Alea(`${gemSeed}:work`) in the sketch\'s order: shuffle, ring direction, radius, trace direction, phase, then Task 29\'s sparks', () => {
    // Zero, negative and fractional seeds are valid stream keys too.
    for (const seed of [GEM_SEED, 0, -42, 0.5, 123456.789]) {
      const R = Alea(`${seed}:work`);
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const expected: WorkVariation = {
        order: order as WorkVariation['order'],
        ringDirection: R() < 0.5 ? 1 : -1,
        radiusScale: 1 - RING_RADIUS_JITTER + R() * 2 * RING_RADIUS_JITTER,
        traceReversed: R() < 0.5,
        phase: R() * 2 * Math.PI,
        // Appended after Task 28's draws, so none of those moved.
        sparks: [0, 1, 2, 3].map(() => Array.from({ length: FLICKER_SPARKS }, () => R())),
      };
      expect(workVariation(seed)).toEqual(expected);
    }
  });
});

describe('turnRanks (pure)', () => {
  it('ranks the shown corners by their place in the order, skipping hidden ones', () => {
    // order 3,0,2,1; shown corners (slot order) 0,1,3 → by order: 3 first, then 0, then 1.
    expect(turnRanks([3, 0, 2, 1], [0, 1, 3])).toEqual([1, 2, 0]);
  });

  it('is a permutation of 0..n−1 for every shown count', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const { order } = workVariation(seed);
      for (let n = 0; n <= 4; n++) {
        const shown = ([2, 0, 3, 1] as const).slice(0, n);
        expect([...turnRanks(order, shown)].sort()).toEqual(Array.from({ length: n }, (_, k) => k));
      }
    }
  });

  it('returns no ranks for no orbiters', () => {
    expect(turnRanks([0, 1, 2, 3], [])).toEqual([]);
  });
});
