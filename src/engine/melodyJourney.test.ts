// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import { journeyKey, journeyPosition, journeyShares, robotJourney, worldKeyOf } from './melodyJourney';
import type { JourneyShare } from './melodyJourney';
import { developmentFloor } from './melodyDevelopment';
import {
  JOURNEY_DROP_MIN_MOVE,
  JOURNEY_DROP_ODDS,
  JOURNEY_HOME_ODDS,
  JOURNEY_MIN_MOVE,
  JOURNEY_SWING_MAX,
  JOURNEY_SWING_MIN,
  JOURNEY_TIME_LEAN,
} from '../constants';

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

// The journey as shares (spec §1.3's table; roadmap 92 Task 24). Every expected share is worked out from the
// constants, which are Crawford's to move at Gate A.
describe('journeyShares (spec §1.3)', () => {
  const SHARE_KEYS = [
    OWN,
    journeyKey(WORLD, { kind: 'company', companyId: 'co-7' }),
    journeyKey(WORLD, { kind: 'fleet' }),
    journeyKey('0:0', { kind: 'own', compositionSeed: 0.8125 }),
  ];
  const EPS = 1e-9;

  /** Every pair of every key, each with the intensity share of the pair before it (0 before the first). */
  function allPairs(): { share: JourneyShare; before: JourneyShare | undefined; index: number }[] {
    return SHARE_KEYS.flatMap((key) => {
      const shares = journeyShares(key, RUN);
      return shares.map((share, index) => ({ share, before: shares[index - 1], index }));
    });
  }
  const startOf = (before: JourneyShare | undefined) => before?.intensity ?? 0;

  it('hands back as many pairs as asked for', () => {
    expect(journeyShares(OWN, 0)).toEqual([]);
    expect(journeyShares(OWN, 7)).toHaveLength(7);
    expect(journeyShares(OWN, RUN)).toHaveLength(RUN);
  });

  it('gives the same shares for the same key whichever count is asked for first', async () => {
    const long = journeyShares('order:journey', 600);
    vi.resetModules();
    const fresh = await import('./melodyJourney');
    const short = fresh.journeyShares('order:journey', 5);
    expect(fresh.journeyShares('order:journey', 600)).toEqual(long);
    expect(short).toEqual(long.slice(0, 5));
  });

  it('gives different shares for keys that differ only in scope', () => {
    const [own, company, fleet] = SHARE_KEYS.map((k) => JSON.stringify(journeyShares(k, 50)));
    expect(new Set([own, company, fleet]).size).toBe(3);
  });

  it('keeps every intensity share from -1 to 1 and every time share from 0 to 1', () => {
    const outside = allPairs().filter(
      ({ share }) => share.intensity < -1 || share.intensity > 1 || share.time < 0 || share.time > 1,
    );
    expect(outside).toEqual([]);
  });

  it('never draws a pair within JOURNEY_MIN_MOVE of the one before it, the first counted from home', () => {
    const close = allPairs().filter(
      ({ share, before }) => Math.abs(share.intensity - startOf(before)) < JOURNEY_MIN_MOVE - EPS,
    );
    expect(close).toEqual([]);
  });

  it('both stays on a side and crosses home', () => {
    let stays = 0;
    let crosses = 0;
    for (const { share, before } of allPairs()) {
      const product = share.intensity * startOf(before);
      if (product > 0) stays++;
      if (product < 0) crosses++;
    }
    expect(stays).toBeGreaterThan(RUN / 10);
    expect(crosses).toBeGreaterThan(RUN / 10);
  });

  it('heads home only from at least JOURNEY_MIN_MOVE away', () => {
    for (const { share, before } of allPairs()) {
      if (share.intensity === 0) expect(Math.abs(startOf(before))).toBeGreaterThanOrEqual(JOURNEY_MIN_MOVE);
    }
  });

  it('heads home from near max intensity at JOURNEY_HOME_ODDS x 0.95, within five points', () => {
    const far = allPairs().filter(({ before }) => Math.abs(startOf(before)) >= 0.9);
    expect(far.length).toBeGreaterThan(500);
    const home = far.filter(({ share }) => share.intensity === 0).length / far.length;
    expect(Math.abs(home - JOURNEY_HOME_ODDS * 0.95)).toBeLessThan(0.05);
  });

  it('heads home from within 0.25 of home at under JOURNEY_HOME_ODDS x 0.25', () => {
    const near = allPairs().filter(({ before }) => Math.abs(startOf(before)) < 0.25);
    expect(near.length).toBeGreaterThan(500);
    const home = near.filter(({ share }) => share.intensity === 0).length / near.length;
    expect(home).toBeLessThan(JOURNEY_HOME_ODDS * 0.25);
  });

  it('leans each time share on how far out its pair heads: from JOURNEY_TIME_LEAN x (1 - |v|), over 1 - JOURNEY_TIME_LEAN', () => {
    let below = 0;
    let above = 0;
    const outside: JourneyShare[] = [];
    for (const { share } of allPairs()) {
      const least = JOURNEY_TIME_LEAN * (1 - Math.abs(share.intensity));
      if (share.time < least - EPS || share.time > least + (1 - JOURNEY_TIME_LEAN) + EPS) outside.push(share);
      if (share.time < least + (1 - JOURNEY_TIME_LEAN) / 2) below++;
      else above++;
    }
    expect(outside).toEqual([]);
    // The draw half spreads over its whole stretch, not stuck at one end.
    expect(below).toBeGreaterThan(RUN);
    expect(above).toBeGreaterThan(RUN);
  });

  it('never makes the first pair a drop, a drop after a drop, or a drop of a move under JOURNEY_DROP_MIN_MOVE', () => {
    for (const { share, before, index } of allPairs()) {
      if (!share.drop) continue;
      expect(index).toBeGreaterThan(0);
      expect(before?.drop).toBe(false);
      expect(Math.abs(share.intensity - startOf(before))).toBeGreaterThanOrEqual(JOURNEY_DROP_MIN_MOVE);
    }
  });

  it('makes JOURNEY_DROP_ODDS of the pairs that could be a drop one, within five points', () => {
    const could = allPairs().filter(
      ({ share, before, index }) =>
        index > 0 && !before?.drop && Math.abs(share.intensity - startOf(before)) >= JOURNEY_DROP_MIN_MOVE,
    );
    expect(could.length).toBeGreaterThan(1000);
    const drops = could.filter(({ share }) => share.drop).length / could.length;
    expect(Math.abs(drops - JOURNEY_DROP_ODDS)).toBeLessThan(0.05);
  });
});

describe('worldKeyOf (spec §1.3)', () => {
  it('is the coordinates as x:y', () => {
    expect(worldKeyOf({ x: 21, y: -188 })).toBe('21:-188');
    expect(worldKeyOf({ x: 0, y: 0 })).toBe('0:0');
  });
});

// The stored robot as the engine reads it when it plays (spec §1.7, §1.9; roadmap 92 Task 12).
describe('robotJourney (spec §1.7, §1.9)', () => {
  const BPM_TOP = 100;
  const robot = (extra: Record<string, unknown> = {}) => ({
    compositionSeed: 0.4375,
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 } },
    ...extra,
  });
  const keyOf = (extra: Record<string, unknown>) => robotJourney(robot(extra) as never, WORLD, BPM_TOP).key;

  it('two members of one company on Company share one key, the company key', () => {
    const a = keyOf({ compositionSeed: 0.1, companyId: 'co-1', journey: 'company' });
    const b = keyOf({ compositionSeed: 0.9, companyId: 'co-1', journey: 'company' });
    expect(a).toBe(b);
    expect(a).toBe(journeyKey(WORLD, { kind: 'company', companyId: 'co-1' }));
  });

  it('the same two on Own get two keys, each its own', () => {
    const a = keyOf({ compositionSeed: 0.1, companyId: 'co-1', journey: 'own' });
    const b = keyOf({ compositionSeed: 0.9, companyId: 'co-1', journey: 'own' });
    expect(a).not.toBe(b);
    expect(a).toBe(journeyKey(WORLD, { kind: 'own', compositionSeed: 0.1 }));
  });

  it('members of two companies on Company get two keys', () => {
    expect(keyOf({ companyId: 'co-1', journey: 'company' })).not.toBe(keyOf({ companyId: 'co-2', journey: 'company' }));
  });

  it('any two robots on Fleet get one key, in a company or not', () => {
    const a = keyOf({ compositionSeed: 0.1, companyId: 'co-1', journey: 'fleet' });
    const b = keyOf({ compositionSeed: 0.9, journey: 'fleet' });
    expect(a).toBe(b);
    expect(a).toBe(journeyKey(WORLD, { kind: 'fleet' }));
  });

  it('a freelancer on Company gets the key it would have on Own', () => {
    expect(keyOf({ journey: 'company' })).toBe(keyOf({ journey: 'own' }));
    expect(keyOf({ journey: 'company' })).toBe(journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 }));
  });

  it('a robot with neither field reads as rate 0 on its Own key', () => {
    const j = robotJourney(robot() as never, WORLD, BPM_TOP);
    expect(j.rate).toBe(0);
    expect(j.key).toBe(journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 }));
  });

  it('the rate is the stored development', () => {
    expect(robotJourney(robot({ development: 0.625 }) as never, WORLD, BPM_TOP).rate).toBe(0.625);
    expect(robotJourney(robot({ development: 2 }) as never, WORLD, BPM_TOP).rate).toBe(2);
  });

  it('the seed is the composition seed', () => {
    expect(robotJourney(robot({ compositionSeed: 0.8125 }) as never, WORLD, BPM_TOP).seed).toBe(0.8125);
  });

  it('the floor follows the attack and the bpm top: 1.14 s at 100 is 4, 0.01 s is 1, 1.14 s at 50 is 2', () => {
    const floorAt = (attack: number, bpmTop: number) =>
      robotJourney(robot({ audioAttributes: { adsr: { attack, decay: 0.1, sustain: 0.8, release: 0.5 } } }) as never, WORLD, bpmTop).floor;
    expect(floorAt(1.14, 100)).toBe(4);
    expect(floorAt(0.01, 100)).toBe(1);
    expect(floorAt(1.14, 50)).toBe(2);
    expect(floorAt(0.6, 100)).toBe(developmentFloor(0.6, 100));
  });
});
