// ========================================
// IMPORTS
// ========================================
import Alea from 'alea';
import { describe, it, expect } from 'vitest';

import { workVariation, turnRanks, type WorkVariation } from './variation';
import { DECOR_JITTER, FLICKER_SPARKS, RING_RADIUS_JITTER } from '../../constants';

// ========================================
// HELPERS
// ========================================
const GEM_SEED = 20261004;
const SEEDS = Array.from({ length: 500 }, (_, k) => 1000 + k * 7919);

/** The twelve decoration factors, in draw order (docs/specs/JOB_DECORATION.md §1.9). */
const DECOR_KEYS = [
  'ventRise',
  'ventLife',
  'surveyReach',
  'surveyLife',
  'trailLength',
  'tickLife',
  'dropLag',
  'valveSize',
  'hang',
  'loadSize',
  'sparkReach',
  'sparkLife',
] as const;

/** The draws that shipped before the decorations (Phase 43 Tasks 28 and 29), captured from the
 *  unmodified code. If any decoration draw is inserted ahead of `sparks`, these move. */
const PINNED: Record<number, Pick<WorkVariation, 'order' | 'ringDirection' | 'radiusScale' | 'traceReversed' | 'phase' | 'sparks'>> = {
  20261004: {
    order: [0, 1, 2, 3],
    ringDirection: 1,
    radiusScale: 0.8511366008082405,
    traceReversed: true,
    phase: 1.1756006744525556,
    sparks: [
      [0.5287664150819182, 0.23559115291573107, 0.2175244700629264],
      [0.4557666468899697, 0.6437510147225112, 0.6651526815257967],
      [0.2936402230989188, 0.7289051357656717, 0.2899474408477545],
      [0.3429263271391392, 0.4094107758719474, 0.37558233132585883],
    ],
  },
  1000: {
    order: [1, 0, 3, 2],
    ringDirection: -1,
    radiusScale: 0.9572213611099869,
    traceReversed: true,
    phase: 2.879609518403494,
    sparks: [
      [0.268915951019153, 0.8852305123582482, 0.7065715121570975],
      [0.09109694301150739, 0.6637694553937763, 0.5315478642005473],
      [0.9191277448553592, 0.07995474664494395, 0.24345182278193533],
      [0.43738038116134703, 0.46676529687829316, 0.3271907221060246],
    ],
  },
};

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

  it('draws from Alea(`${gemSeed}:work`) in the sketch\'s order: shuffle, ring direction, radius, trace direction, phase, then Task 29\'s sparks, then the decoration draws', () => {
    // Zero, negative and fractional seeds are valid stream keys too.
    for (const seed of [GEM_SEED, 0, -42, 0.5, 123456.789]) {
      const R = Alea(`${seed}:work`);
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const factor = () => 1 - DECOR_JITTER + R() * 2 * DECOR_JITTER;
      const expected: WorkVariation = {
        order: order as WorkVariation['order'],
        ringDirection: R() < 0.5 ? 1 : -1,
        radiusScale: 1 - RING_RADIUS_JITTER + R() * 2 * RING_RADIUS_JITTER,
        traceReversed: R() < 0.5,
        phase: R() * 2 * Math.PI,
        // Appended after Task 28's draws, so none of those moved.
        sparks: [0, 1, 2, 3].map(() => Array.from({ length: FLICKER_SPARKS }, () => R())),
        // Appended after Task 29's sparks (docs/specs/JOB_DECORATION.md Assumption 7), in this order.
        sparkDirs: [0, 1, 2, 3].map(() => [0, 1, 2].map(() => [R(), R(), R()])),
        moteDrift: [0, 1, 2, 3].map(() => [R(), R(), R(), R()]),
        swingPhase: R() * 2 * Math.PI,
        loadSeed: R(),
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
      expect(workVariation(seed)).toEqual(expected);
    }
  });

  it('keeps every pre-existing draw at the value it had before the decorations were appended (pinned seeds)', () => {
    for (const [seed, pinned] of Object.entries(PINNED)) {
      const { order, ringDirection, radiusScale, traceReversed, phase, sparks } = workVariation(Number(seed));
      expect({ order, ringDirection, radiusScale, traceReversed, phase, sparks }).toEqual(pinned);
    }
  });
});

describe('workVariation — the decoration draws (docs/specs/JOB_DECORATION.md §1.9, Task 3)', () => {
  it('DECOR_JITTER is 0.15, like the ring radius jitter', () => {
    expect(DECOR_JITTER).toBe(0.15);
  });

  it('sparkDirs is 4 corners x 3 chords x 3 spark offsets, each in [0, 1)', () => {
    for (const seed of SEEDS) {
      const { sparkDirs } = workVariation(seed);
      expect(sparkDirs).toHaveLength(4);
      for (const corner of sparkDirs) {
        expect(corner).toHaveLength(3);
        for (const chord of corner) {
          expect(chord).toHaveLength(3);
          for (const u of chord) {
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
          }
        }
      }
    }
  });

  it('sparkDirs differ between corners and between chords (36 independent draws)', () => {
    const { sparkDirs } = workVariation(GEM_SEED);
    expect(new Set(sparkDirs.flat(2)).size).toBe(36);
  });

  it('moteDrift is 4 corners x 4 motes, each in [0, 1), all 16 distinct', () => {
    for (const seed of SEEDS) {
      const { moteDrift } = workVariation(seed);
      expect(moteDrift).toHaveLength(4);
      for (const corner of moteDrift) {
        expect(corner).toHaveLength(4);
        for (const u of corner) {
          expect(u).toBeGreaterThanOrEqual(0);
          expect(u).toBeLessThan(1);
        }
      }
    }
    expect(new Set(workVariation(GEM_SEED).moteDrift.flat()).size).toBe(16);
  });

  it('swingPhase is in [0, 2π) and spreads across it', () => {
    const phases = SEEDS.map((s) => workVariation(s).swingPhase);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(2 * Math.PI);
    }
    expect(Math.min(...phases)).toBeLessThan(0.5);
    expect(Math.max(...phases)).toBeGreaterThan(2 * Math.PI - 0.5);
  });

  it('loadSeed is in [0, 1) and both sides of 0.5 occur (diamond and hexagon)', () => {
    const seeds = SEEDS.map((s) => workVariation(s).loadSeed);
    for (const u of seeds) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
    expect(seeds.some((u) => u < 0.5)).toBe(true);
    expect(seeds.some((u) => u >= 0.5)).toBe(true);
  });

  it('decor has exactly the twelve factor keys — counts and opacities never vary', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(Object.keys(workVariation(seed).decor)).toEqual([...DECOR_KEYS]);
    }
  });

  it('every decor factor stays in [0.85, 1.15] over 500 seeds and spreads across it', () => {
    const all = SEEDS.map((s) => workVariation(s).decor);
    for (const key of DECOR_KEYS) {
      const values = all.map((d) => d[key]);
      for (const f of values) {
        expect(f).toBeGreaterThanOrEqual(1 - DECOR_JITTER);
        expect(f).toBeLessThan(1 + DECOR_JITTER);
      }
      expect(Math.min(...values)).toBeLessThan(0.9);
      expect(Math.max(...values)).toBeGreaterThan(1.1);
    }
  });

  it('the twelve factors of one robot are independent draws, not one number repeated', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(new Set(Object.values(workVariation(seed).decor)).size).toBe(12);
    }
  });

  it('is deterministic per gemSeed, appended draws included', () => {
    for (const seed of SEEDS.slice(0, 20)) expect(workVariation(seed)).toEqual(workVariation(seed));
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
