// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import { journeyKey, journeyPosition } from './melodyJourney';
import { JOURNEY_SWING_MAX, JOURNEY_SWING_MIN } from '../constants';

// ========================================
// HELPERS
// ========================================
const RUN = 5000;

/** The walk at counts 0..RUN, read at rate 1 so the count is the measure. */
function walk(key: string, count = RUN): number[] {
  return Array.from({ length: count + 1 }, (_, m) => journeyPosition(key, 1, m));
}

/** The turning points: every place the walk changes direction, as values. */
function turningPoints(positions: number[]): number[] {
  const turns: number[] = [];
  for (let i = 1; i < positions.length - 1; i++) {
    const before = positions[i] - positions[i - 1];
    const after = positions[i + 1] - positions[i];
    if (Math.sign(before) !== Math.sign(after)) turns.push(positions[i]);
  }
  return turns;
}

const WORLD = '21:-188';
const OWN = journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 });

// ========================================
// TESTS
// ========================================
describe('journeyKey (spec §1.3)', () => {
  it('builds the Own, Company and Fleet keys of the spec', () => {
    expect(journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 })).toBe('21:-188:0.4375:journey');
    expect(journeyKey(WORLD, { kind: 'company', companyId: 'co-7' })).toBe('21:-188:co-7:journey');
    expect(journeyKey(WORLD, { kind: 'fleet' })).toBe('21:-188:fleet:journey');
  });

  it('gives three different keys, and three different walks, for one world', () => {
    const keys = [
      journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 }),
      journeyKey(WORLD, { kind: 'company', companyId: 'co-7' }),
      journeyKey(WORLD, { kind: 'fleet' }),
    ];
    expect(new Set(keys).size).toBe(3);
    const walks = keys.map((k) => walk(k, 300).join(','));
    expect(new Set(walks).size).toBe(3);
  });

  it('gives one key, so one walk, to any two robots on Fleet in one world, and another in another world', () => {
    expect(journeyKey(WORLD, { kind: 'fleet' })).toBe(journeyKey(WORLD, { kind: 'fleet' }));
    expect(journeyKey('0:0', { kind: 'fleet' })).not.toBe(journeyKey(WORLD, { kind: 'fleet' }));
  });
});

describe('journeyPosition (spec §1.3)', () => {
  it('is 0 at measure 0 for any key and rate', () => {
    for (const rate of [0, 0.125, 1, 2]) {
      for (const key of [OWN, 'a', 'b:journey', '']) expect(journeyPosition(key, rate, 0)).toBe(0);
    }
  });

  it('is 0 at every measure when the rate is 0', () => {
    for (let m = 0; m < 500; m++) expect(journeyPosition(OWN, 0, m)).toBe(0);
  });

  it('is 0 for a negative or non-finite count', () => {
    expect(journeyPosition(OWN, 1, -5)).toBe(0);
    expect(journeyPosition(OWN, Number.NaN, 12)).toBe(0);
    expect(journeyPosition(OWN, 1, Number.NaN)).toBe(0);
  });

  it('gives the same position for the same key, rate and measure', () => {
    const first = walk(OWN, 1000);
    expect(walk(OWN, 1000)).toEqual(first);
  });

  it('gives a different walk for a different key', () => {
    expect(walk('one:journey', 300)).not.toEqual(walk('two:journey', 300));
  });

  it('reads the walk at floor(rate x measure)', () => {
    for (let m = 0; m < 400; m++) {
      expect(journeyPosition(OWN, 0.5, m)).toBe(journeyPosition(OWN, 1, Math.floor(m / 2)));
      expect(journeyPosition(OWN, 2, m)).toBe(journeyPosition(OWN, 1, 2 * m));
      expect(journeyPosition(OWN, 0.125, m)).toBe(journeyPosition(OWN, 1, Math.floor(m / 8)));
    }
  });

  it('moves by exactly one change between consecutive counts, over 5,000 counts', () => {
    const positions = walk(OWN);
    for (let i = 1; i < positions.length; i++) expect(Math.abs(positions[i] - positions[i - 1])).toBe(1);
  });

  it('never passes the swing either side, visits both sides, and returns to 0 between them', () => {
    const positions = walk(OWN);
    expect(Math.max(...positions)).toBeLessThanOrEqual(JOURNEY_SWING_MAX);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(-JOURNEY_SWING_MAX);
    expect(positions.some((p) => p > 0)).toBe(true);
    expect(positions.some((p) => p < 0)).toBe(true);
    let lastSide = 0;
    for (let i = 0; i < positions.length; i++) {
      const side = Math.sign(positions[i]);
      if (side !== 0 && lastSide !== 0 && side !== lastSide) expect(positions[i - 1]).toBe(0);
      if (side !== 0) lastSide = side;
    }
  });

  it('turns on alternating sides, each turning point a whole swing from home', () => {
    for (const key of [OWN, 'x:journey', 'y:journey', 'z:journey']) {
      const turns = turningPoints(walk(key, 2000));
      expect(turns.length).toBeGreaterThan(50);
      turns.forEach((t, i) => {
        expect(Math.abs(t)).toBeGreaterThanOrEqual(JOURNEY_SWING_MIN);
        expect(Math.abs(t)).toBeLessThanOrEqual(JOURNEY_SWING_MAX);
        if (i > 0) expect(Math.sign(t)).toBe(-Math.sign(turns[i - 1]));
      });
    }
  });

  it('draws every swing from MIN to MAX, and starts on either side across keys', () => {
    const sizes = new Set<number>();
    const firstSides = new Set<number>();
    for (let k = 0; k < 40; k++) {
      const positions = walk(`world-${k}:journey`, 400);
      turningPoints(positions).forEach((t) => sizes.add(Math.abs(t)));
      firstSides.add(Math.sign(positions[1]));
    }
    for (let d = JOURNEY_SWING_MIN; d <= JOURNEY_SWING_MAX; d++) expect(sizes.has(d)).toBe(true);
    expect([...firstSides].sort()).toEqual([-1, 1]);
  });

  it('gives the same walk whichever order the counts are asked in', async () => {
    const inOrder = walk('order:journey', 600);
    vi.resetModules();
    const fresh = await import('./melodyJourney');
    const backwards: number[] = [];
    for (let m = 600; m >= 0; m--) backwards[m] = fresh.journeyPosition('order:journey', 1, m);
    expect(backwards).toEqual(inOrder);
  });

  it('agrees for two robots with one key and one rate at every measure of a long run', () => {
    const fleet = journeyKey(WORLD, { kind: 'fleet' });
    for (let m = 0; m < 2000; m++) {
      expect(journeyPosition(fleet, 0.375, m)).toBe(journeyPosition(journeyKey(WORLD, { kind: 'fleet' }), 0.375, m));
    }
  });
});
