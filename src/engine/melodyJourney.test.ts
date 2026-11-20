// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import {
  journeyAt,
  journeyKey,
  journeyShares,
  journeyTurns,
  positionInPairs,
  robotJourney,
  robotPairs,
  worldKeyOf,
} from './melodyJourney';
import type { JourneyBounds, JourneyPair, JourneyShare } from './melodyJourney';
import { developmentFloor } from './melodyDevelopment';
import {
  DEFAULT_JOURNEY_MAX_INTENSITY,
  JOURNEY_DROP_MIN_MOVE,
  JOURNEY_DROP_ODDS,
  JOURNEY_HOME_ODDS,
  JOURNEY_MIN_MOVE,
  JOURNEY_TIME_LEAN,
  JOURNEY_TIME_MAX,
} from '../constants';

// ========================================
// HELPERS
// ========================================
const WORLD = '21:-188';
/** A robot's position on `key`'s journey at `measure` (journeyAt). */
const positionOn = (key: string, b: JourneyBounds, measure: number) => journeyAt(key, b, measure).position;
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

  it('gives three different keys, and three different journeys, for one world', () => {
    const keys = [
      journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 }),
      journeyKey(WORLD, { kind: 'company', companyId: 'co-7' }),
      journeyKey(WORLD, { kind: 'fleet' }),
    ];
    expect(new Set(keys).size).toBe(3);
    const journeys = keys.map((k) => JSON.stringify(journeyShares(k, 40)));
    expect(new Set(journeys).size).toBe(3);
  });

  it('gives one key, so one journey, to any two robots on Fleet in one world, and another in another world', () => {
    expect(journeyKey(WORLD, { kind: 'fleet' })).toBe(journeyKey(WORLD, { kind: 'fleet' }));
    expect(journeyKey('0:0', { kind: 'fleet' })).not.toBe(journeyKey(WORLD, { kind: 'fleet' }));
  });
});

// The engine's read of a robot's journey (spec §1.3, §1.7; roadmap 92 Task 28): a key, two bounds and a calm limit
// give a position at any measure. The oracle is the three pure pieces of Tasks 24 to 26, read over enough shares.
describe('journeyAt: the position (spec §1.3)', () => {
  const RUN = 2000;
  const KEYS = [OWN, 'x:journey', 'y:journey', journeyKey(WORLD, { kind: 'fleet' })];
  const bounds = (maxIntensity: number, maxTime: number, calmLimit: number): JourneyBounds => ({
    maxIntensity,
    maxTime,
    calmLimit,
  });
  /** Every bound and calm limit the acceptance names. */
  const CASES: JourneyBounds[] = [];
  for (const [n, t] of [[16, 16], [16, 2], [1, 16], [5, 8]]) {
    for (const c of [0, 3, 15]) CASES.push(bounds(n, t, c));
  }
  /** A robot's pairs over enough shares to cover `measures` (every time is at least 1, and a pair reads the share
   *  after it to see a drop). */
  const pairsOf = (key: string, b: JourneyBounds, measures = RUN): JourneyPair[] =>
    robotPairs(journeyShares(key, measures + 2), b);
  /** The turning measures: the running sum of the pairs' times, up to `measures`. */
  const turningMeasures = (pairs: JourneyPair[], measures = RUN): number[] => {
    const out: number[] = [];
    let at = 0;
    for (const p of pairs) {
      at += p.time;
      if (at > measures) break;
      out.push(at);
    }
    return out;
  };
  const positions = (key: string, b: JourneyBounds, measures = RUN) =>
    Array.from({ length: measures + 1 }, (_, m) => positionOn(key, b, m));

  it('is 0 at measure 0 for any key and bounds', () => {
    for (const b of CASES) for (const key of [...KEYS, 'a', '']) expect(positionOn(key, b, 0)).toBe(0);
  });

  it('is 0 at every measure at a max intensity of 0, whatever the max time and calm limit', () => {
    for (const key of KEYS) {
      for (const b of [bounds(0, 16, 15), bounds(0, 2, 0), bounds(0, 8, 3)]) {
        for (let m = 0; m <= 500; m++) expect(positionOn(key, b, m)).toBe(0);
      }
    }
  });

  it('is 0 at a negative or non-finite measure', () => {
    const b = bounds(16, 16, 15);
    for (const m of [-1, -5, Number.NaN, Infinity, -Infinity]) expect(positionOn(OWN, b, m)).toBe(0);
  });

  it('is the position inside the robot pairs at every measure of a long run, for every key and bounds', () => {
    const misses: string[] = [];
    for (const key of KEYS) {
      for (const b of CASES) {
        const pairs = pairsOf(key, b);
        for (let m = 0; m <= RUN; m++) {
          const want = positionInPairs(pairs, m);
          if (positionOn(key, b, m) !== want) misses.push(`${key} ${JSON.stringify(b)} m${m}`);
        }
      }
    }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('never passes max intensity or the calm limit, and heads both ways where both are open', () => {
    for (const key of KEYS) {
      for (const b of CASES) {
        const all = positions(key, b);
        expect(Math.max(...all), `${key} ${JSON.stringify(b)}`).toBeLessThanOrEqual(b.maxIntensity);
        expect(Math.min(...all), `${key} ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(-b.calmLimit);
        expect(all.some((p) => p > 0), `${key} ${JSON.stringify(b)} busy`).toBe(true);
        if (b.calmLimit > 0) expect(all.some((p) => p < 0), `${key} ${JSON.stringify(b)} calm`).toBe(true);
      }
    }
  });

  it('plays each pair intensity on its turning measure; every turning measure is even but the one before a drop', () => {
    const misses: string[] = [];
    let drops = 0;
    for (const key of KEYS) {
      const shares = journeyShares(key, RUN + 2);
      for (const b of CASES) {
        const pairs = pairsOf(key, b);
        turningMeasures(pairs).forEach((at, i) => {
          const where = `${key} ${JSON.stringify(b)} pair ${i} at ${at}`;
          if (positionOn(key, b, at) !== pairs[i].intensity) misses.push(`${where}: not there`);
          const beforeDrop = shares[i + 1].drop;
          if (beforeDrop) drops++;
          if (beforeDrop ? at % 2 !== 1 : at % 2 !== 0) misses.push(`${where}: ${beforeDrop ? 'even before a drop' : 'odd'}`);
        });
      }
    }
    expect(misses.slice(0, 5)).toEqual([]);
    expect(drops).toBeGreaterThan(100); // precondition: the odd case is exercised
  });

  it('gives the same positions whichever order the measures are read in', async () => {
    const b = bounds(16, 6, 3);
    const inOrder = positions('order:journey', b, 600);
    vi.resetModules();
    const fresh = await import('./melodyJourney');
    const backwards: number[] = [];
    for (let m = 600; m >= 0; m--) backwards[m] = fresh.journeyAt('order:journey', b, m).position;
    expect(backwards).toEqual(inOrder);
    vi.resetModules();
    const jumping = await import('./melodyJourney');
    for (const m of [600, 3, 451, 0, 99, 600, 17]) expect(jumping.journeyAt('order:journey', b, m).position).toBe(inOrder[m]);
  });

  it('reads one key at several max times in turn, each its own: no max time borrows another turning measures', () => {
    const key = 'times:journey';
    for (const t of [16, 2, 8, 16, 4, 2]) {
      const b = bounds(16, t, 15);
      const pairs = pairsOf(key, b, 400);
      for (let m = 0; m <= 400; m++) expect(positionOn(key, b, m), `max time ${t} m${m}`).toBe(positionInPairs(pairs, m));
    }
  });

  it('two robots on one key with one max time turn on the same measures whatever their max intensity; with different max times they do not', () => {
    for (const key of KEYS) {
      const deep = bounds(16, 8, 15);
      const shallow = bounds(5, 8, 3);
      const long = bounds(16, 16, 15);
      const turns = turningMeasures(pairsOf(key, deep));
      expect(turningMeasures(pairsOf(key, shallow))).toEqual(turns);
      expect(turningMeasures(pairsOf(key, long))).not.toEqual(turns);
      // Each arrives at its own depth on those measures.
      pairsOf(key, shallow).slice(0, turns.length).forEach((pair, i) => {
        expect(positionOn(key, shallow, turns[i])).toBe(pair.intensity);
      });
    }
  });

  it('reads measure 10,000 straight off, and as the run up to it would', () => {
    const b = bounds(16, 16, 15);
    const far = positionOn('far:journey', b, 10_000);
    expect(far).toBe(positionInPairs(robotPairs(journeyShares('far:journey', 10_002), b), 10_000));
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
  const RUN = 5000;

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

  // Only pairs that could head home (from JOURNEY_MIN_MOVE out) are counted: a pair at home never heads home, so
  // counting those would hide flat odds (Checkpoint F's mutant 1b).
  it('heads home from within 0.25 of home at under JOURNEY_HOME_ODDS x 0.25', () => {
    const near = allPairs().filter(({ before }) => {
      const from = Math.abs(startOf(before));
      return from >= JOURNEY_MIN_MOVE && from < 0.25;
    });
    expect(near.length).toBeGreaterThan(200);
    const home = near.filter(({ share }) => share.intensity === 0).length / near.length;
    expect(home).toBeLessThan(JOURNEY_HOME_ODDS * 0.25);
  });

  it('heads home from halfway out at JOURNEY_HOME_ODDS x 0.5, within five points: the odds rise in a straight line', () => {
    const mid = allPairs().filter(({ before }) => Math.abs(Math.abs(startOf(before)) - 0.5) <= 0.05);
    expect(mid.length).toBeGreaterThan(500);
    const home = mid.filter(({ share }) => share.intensity === 0).length / mid.length;
    expect(Math.abs(home - JOURNEY_HOME_ODDS * 0.5)).toBeLessThan(0.05);
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

// Where a robot is inside its own pairs (spec §1.3, "Where a robot is"; roadmap 92 Task 25), on pairs written by hand.
describe('positionInPairs (spec §1.3)', () => {
  const pairs = (list: [number, number][]): JourneyPair[] => list.map(([intensity, time]) => ({ intensity, time }));
  const positions = (list: JourneyPair[], last: number) =>
    Array.from({ length: last + 1 }, (_, m) => positionInPairs(list, m));

  /** Each pair's start measure, the intensity it starts from and its turning measure. */
  const spans = (list: JourneyPair[]) => {
    let start = 0;
    let from = 0;
    return list.map((pair) => {
      const span = { start, from, to: pair.intensity, turn: start + pair.time };
      start = span.turn;
      from = pair.intensity;
      return span;
    });
  };

  const HAND_WRITTEN = [
    pairs([[3, 4], [-2, 2], [-2, 6], [5, 1], [0, 8]]),
    pairs([[16, 2], [0, 16]]),
    pairs([[-1, 10], [1, 1], [1, 4]]),
    pairs([[16, 15], [-8, 1], [0, 16]]),
  ];

  it('plays the worked example, Crawford pairs, for a calm limit of 8 or more, at every measure from 0 to 32', () => {
    expect(positions(pairs([[16, 15], [-8, 1], [0, 16]]), 32)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16,
      -8, -8, -7, -7, -6, -6, -5, -5, -4, -4, -3, -3, -2, -2, -1, -1, 0,
    ]);
  });

  it('plays the worked example for a calm limit of 4, its drop brought in to -4, at every measure from 0 to 32', () => {
    expect(positions(pairs([[16, 15], [-4, 1], [0, 16]]), 32)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16,
      -4, -4, -4, -4, -3, -3, -3, -3, -2, -2, -2, -2, -1, -1, -1, -1, 0,
    ]);
  });

  it('is 0 at measure 0, at a negative or non-finite measure, and everywhere on an empty list', () => {
    const list = pairs([[16, 15], [-8, 1], [0, 16]]);
    for (const m of [0, -1, -16, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(positionInPairs(list, m)).toBe(0);
    }
    for (const m of [0, 1, 5, 100]) expect(positionInPairs([], m)).toBe(0);
  });

  it('is a plain 0, not -0, while a calm pair has not yet left home', () => {
    expect(positionInPairs(pairs([[-8, 16]]), 1)).toBe(0);
  });

  it('plays the last intensity past the last pair', () => {
    expect(positionInPairs(pairs([[16, 15], [-8, 1], [0, 16]]), 500)).toBe(0);
    expect(positionInPairs(pairs([[3, 4], [-2, 2]]), 7)).toBe(-2);
    expect(positionInPairs(pairs([[3, 4], [-2, 2]]), 7000)).toBe(-2);
  });

  it('plays a pair intensity on its turning measure and on no earlier measure of that pair', () => {
    for (const list of HAND_WRITTEN) {
      for (const { start, from, to, turn } of spans(list)) {
        expect(positionInPairs(list, turn)).toBe(to);
        if (from === to) continue;
        for (let m = start + 1; m < turn; m++) expect(positionInPairs(list, m)).not.toBe(to);
      }
    }
  });

  it('never moves away from a pair intensity inside the pair, nor outside the stretch from where it started', () => {
    for (const list of HAND_WRITTEN) {
      for (const { start, from, to, turn } of spans(list)) {
        let distance = Math.abs(to - from);
        for (let m = start + 1; m <= turn; m++) {
          const position = positionInPairs(list, m);
          expect(Math.abs(to - position)).toBeLessThanOrEqual(distance);
          expect(position).toBeGreaterThanOrEqual(Math.min(from, to));
          expect(position).toBeLessThanOrEqual(Math.max(from, to));
          distance = Math.abs(to - position);
        }
      }
    }
  });

  it('plays a pair with a time of 1 on the very next measure', () => {
    const list = pairs([[6, 4], [-5, 1], [2, 2]]);
    expect(positionInPairs(list, 4)).toBe(6);
    expect(positionInPairs(list, 5)).toBe(-5);
    expect(positionInPairs(pairs([[9, 1]]), 1)).toBe(9);
  });

  it('holds through a pair that does not move', () => {
    const list = pairs([[3, 4], [3, 6], [0, 2]]);
    for (let m = 4; m <= 10; m++) expect(positionInPairs(list, m)).toBe(3);
    expect(positionInPairs(list, 11)).toBe(2);
  });
});

// A robot's scaling of the shares by its own bounds (spec §1.3, "A robot's pairs"; roadmap 92 Task 26).
describe('robotPairs (spec §1.3)', () => {
  const share = (intensity: number, time = 0.5, drop = false): JourneyShare => ({ intensity, time, drop });
  const bounds = (maxIntensity: number, maxTime = 16, limit = 99): JourneyBounds => ({
    maxIntensity,
    maxTime,
    calmLimit: limit,
  });
  const intensities = (shares: JourneyShare[], b: JourneyBounds) => robotPairs(shares, b).map((p) => p.intensity);
  const times = (shares: JourneyShare[], b: JourneyBounds) => robotPairs(shares, b).map((p) => p.time);

  it('scales intensity to the nearest whole change: at 16, 0.5 and -0.5 give 8 and -8', () => {
    expect(intensities([share(0.5), share(-0.5)], bounds(16))).toEqual([8, -8]);
  });

  it('rounds the same way on both sides of home: at 1, 0.4, 0.6 and -0.6 give 0, 1 and -1; at 3, 0.5 and -0.5 give 2 and -2', () => {
    expect(intensities([share(0.4), share(0.6), share(-0.6)], bounds(1))).toEqual([0, 1, -1]);
    expect(intensities([share(0.5), share(-0.5)], bounds(3))).toEqual([2, -2]);
    expect(intensities([share(0.5), share(-0.5)], bounds(1))).toEqual([1, -1]);
  });

  it('gives a plain 0 for every pair at a max intensity of 0, and for a calm pair at a calm limit of 0', () => {
    expect(intensities([share(0.9), share(-0.7), share(0)], bounds(0))).toEqual([0, 0, 0]);
    expect(intensities([share(-0.7), share(0.5)], bounds(16, 16, 0))).toEqual([0, 8]);
  });

  it('scales a calm share across the calm range, the smaller of max intensity and the calm limit, and a busy one across max intensity', () => {
    // A calm limit of 4 under a max intensity of 16: the whole calm side is spread over the four changes there are.
    expect(intensities([share(-1)], bounds(16, 16, 4))).toEqual([-4]);
    expect(intensities([share(-0.75)], bounds(16, 16, 4))).toEqual([-3]);
    expect(intensities([share(-0.5)], bounds(16, 16, 4))).toEqual([-2]);
    expect(intensities([share(-0.25)], bounds(16, 16, 4))).toEqual([-1]);
    // A max intensity under the calm limit bounds the calm side as it does the busy one.
    expect(intensities([share(-1), share(-0.5)], bounds(6, 16, 15))).toEqual([-6, -3]);
    // The busy side is never brought in.
    expect(intensities([share(0.75)], bounds(16, 16, 4))).toEqual([12]);
    expect(intensities([share(1)], bounds(16, 16, 0))).toEqual([16]);
  });

  it('reaches the calm floor only on a full calm share: a robot does not wait on its floor through a ramp', () => {
    const shares = [-0.9, -0.8, -0.7, -0.6].map((s) => share(s));
    expect(intensities(shares, bounds(16, 16, 4))).toEqual([-4, -3, -3, -2]);
  });

  it('scales time to the nearest even number of measures, never under 2: at 16, 0, 0.1, 0.5 and 1 give 2, 2, 8 and 16', () => {
    const shares = [share(0.2, 0), share(0.4, 0.1), share(0.6, 0.5), share(0.8, 1)];
    expect(times(shares, bounds(16, 16))).toEqual([2, 2, 8, 16]);
  });

  it('gives a time of 2 for every share at a max time of 2', () => {
    const shares = [share(0.2, 0), share(0.4, 0.1), share(0.6, 0.5), share(0.8, 1)];
    expect(times(shares, bounds(16, 2))).toEqual([2, 2, 2, 2]);
  });

  it('gives a drop a time of 1 and the pair before it one less: 16 becomes 15, 2 becomes 1', () => {
    expect(times([share(1, 1), share(-0.5, 0.7, true), share(0, 0.3)], bounds(16, 16))).toEqual([15, 1, 4]);
    expect(times([share(1, 1), share(-0.5, 0.7, true)], bounds(16, 2))).toEqual([1, 1]);
  });

  it('gives Crawford example from shares that scale to it: [[16, 15], [-8, 1], [0, 16]]', () => {
    const pairs = robotPairs([share(1, 1), share(-0.5, 0.25, true), share(0, 1)], bounds(16, 16, 16));
    expect(pairs.map((p) => [p.intensity, p.time])).toEqual([
      [16, 15],
      [-8, 1],
      [0, 16],
    ]);
  });

  it('over long runs at several bounds: within the bounds, times even but at drops, and even through every drop', () => {
    const cases: JourneyBounds[] = [bounds(16, 16, 15), bounds(16, 2, 3), bounds(1, 16, 0), bounds(5, 8, 3), bounds(16, 6, 0)];
    const misses: string[] = [];
    for (const key of [OWN, 'x:journey', 'y:journey']) {
      const shares = journeyShares(key, 2000);
      for (const b of cases) {
        const pairs = robotPairs(shares, b);
        pairs.forEach((pair, i) => {
          const where = `${key} ${JSON.stringify(b)} pair ${i}`;
          if (pair.intensity > b.maxIntensity || pair.intensity < -b.calmLimit) misses.push(`${where}: intensity`);
          if (pair.time > b.maxTime || pair.time < 1) misses.push(`${where}: time`);
          const beforeDrop = shares[i + 1]?.drop === true;
          if (shares[i].drop && pair.time !== 1) misses.push(`${where}: drop time`);
          if (!shares[i].drop && !beforeDrop && pair.time % 2 !== 0) misses.push(`${where}: odd time`);
          if (beforeDrop && (pair.time + pairs[i + 1].time) % 2 !== 0) misses.push(`${where}: odd through a drop`);
        });
      }
    }
    expect(misses).toEqual([]);
  });
});

// A trip (journey dynamics, 2026-11-18): one stretch away from home on one side. The changes take a different path
// each trip, so the engine reads the trip beside the position. It is counted on the shares, so robots on one journey
// count alike.
describe('journeyAt: the position and the trip', () => {
  const RUN = 2000;
  const KEYS = [OWN, 'x:journey', 'y:journey', journeyKey(WORLD, { kind: 'fleet' })];
  const b = (maxIntensity: number, calmLimit: number): JourneyBounds => ({ maxIntensity, maxTime: 16, calmLimit });
  const CASES = [b(16, 15), b(16, 4), b(3, 2), b(8, 0)];


  it('is trip 0 at measure 0 and through the first pair', () => {
    for (const key of KEYS) {
      const first = robotPairs(journeyShares(key, 2), b(16, 15))[0].time;
      for (let m = 0; m < first; m++) expect(journeyAt(key, b(16, 15), m).trip).toBe(0);
    }
  });

  it('is trip 0 at a max intensity of 0, and at a negative or non-finite measure', () => {
    for (let m = 0; m <= 200; m++) expect(journeyAt(OWN, b(0, 15), m)).toEqual({ position: 0, trip: 0, level: 0 });
    for (const m of [-1, Number.NaN, Infinity]) expect(journeyAt(OWN, b(16, 15), m)).toEqual({ position: 0, trip: 0, level: 0 });
    expect(journeyAt(OWN, b(16, 15), 0)).toEqual({ position: 0, trip: 0, level: 0 });
  });

  // The level (journey dynamics, 2026-11-18): how far out the journey is, unrounded, for the performance to follow.
  describe('the level', () => {
    /** Each pair's start measure, turning measure and the shares it runs between, for `key` at a max time of 16. */
    const spans = (key: string) => {
      const shares = journeyShares(key, RUN + 2);
      const times = robotPairs(shares, b(16, 15)).map((p) => p.time);
      const out: { start: number; turn: number; from: number; to: number }[] = [];
      let start = 0;
      for (let i = 0; start + times[i] <= RUN; i++) {
        out.push({ start, turn: start + times[i], from: i === 0 ? 0 : shares[i - 1].intensity, to: shares[i].intensity });
        start += times[i];
      }
      return out;
    };

    it('is the share the pair heads for on its turning measure, at a max intensity of 16', () => {
      for (const key of KEYS) {
        for (const { turn, to } of spans(key)) expect(journeyAt(key, b(16, 15), turn).level).toBeCloseTo(to, 10);
      }
    });

    it('runs in a straight line from one share to the next across the pair, every measure a step', () => {
      for (const key of KEYS) {
        for (const { start, turn, from, to } of spans(key)) {
          for (let m = start; m <= turn; m++) {
            const want = from + ((to - from) * (m - start)) / (turn - start);
            expect(journeyAt(key, b(16, 15), m).level, `${key} m${m}`).toBeCloseTo(want, 10);
          }
        }
      }
    });

    it('does not read max intensity (Crawford, 2026-11-19): at 8, 4 and 1 it is what it is at 16; at 0 it is 0', () => {
      for (const key of KEYS) {
        for (let m = 0; m <= 400; m++) {
          const full = journeyAt(key, b(16, 15), m).level;
          for (const max of [8, 4, 1]) expect(journeyAt(key, b(max, 15), m).level, `${key} m${m} at ${max}`).toBe(full);
          expect(journeyAt(key, b(0, 15), m).level).toBe(0);
        }
      }
    });

    it('stays from -1 to 1, and goes both ways', () => {
      for (const key of KEYS) {
        const levels = Array.from({ length: RUN + 1 }, (_, m) => journeyAt(key, b(16, 15), m).level);
        expect(Math.max(...levels)).toBeLessThanOrEqual(1);
        expect(Math.min(...levels)).toBeGreaterThanOrEqual(-1);
        expect(levels.some((l) => l > 0.5)).toBe(true);
        expect(levels.some((l) => l < -0.5)).toBe(true);
      }
    });

    it('does not read the calm limit: a robot with no calm change still has a calm level', () => {
      let calmAtHome = 0;
      for (let m = 0; m <= RUN; m++) {
        const one = journeyAt(OWN, b(16, 0), m);
        expect(one.level).toBe(journeyAt(OWN, b(16, 15), m).level);
        if (one.position === 0 && one.level < -0.25) calmAtHome++;
      }
      expect(calmAtHome).toBeGreaterThan(0);
    });
  });

  it('follows the shares: a new trip when a pair heads for a side the pair before did not, the old one until the robot has crossed', () => {
    const misses: string[] = [];
    for (const key of KEYS) {
      const shares = journeyShares(key, RUN + 2);
      // The trip of each pair, from the shares alone.
      const tripOf: number[] = [0];
      for (let i = 1; i < shares.length; i++) {
        const heads = Math.sign(shares[i].intensity);
        tripOf.push(tripOf[i - 1] + (heads !== 0 && heads !== Math.sign(shares[i - 1].intensity) ? 1 : 0));
      }
      for (const bounds of CASES) {
        const pairs = robotPairs(shares, bounds);
        let i = 0;
        let turn = pairs[0].time;
        for (let m = 1; m <= RUN; m++) {
          while (m >= turn) turn += pairs[++i].time;
          const { position, trip } = journeyAt(key, bounds, m);
          const crossed = position === 0 || i === 0 || Math.sign(position) === Math.sign(shares[i].intensity);
          const want = crossed ? tripOf[i] : tripOf[i - 1];
          if (trip !== want) misses.push(`${key} ${JSON.stringify(bounds)} m${m}: ${trip}, not ${want}`);
        }
      }
    }
    expect(misses.slice(0, 5)).toEqual([]);
  });

  it('never goes back, and holds while a robot stays on one side of home', () => {
    for (const key of KEYS) {
      for (const bounds of CASES) {
        let before = journeyAt(key, bounds, 0);
        for (let m = 1; m <= RUN; m++) {
          const now = journeyAt(key, bounds, m);
          expect(now.trip, `${key} m${m}`).toBeGreaterThanOrEqual(before.trip);
          if (now.position !== 0 && Math.sign(now.position) === Math.sign(before.position)) {
            expect(now.trip, `${key} ${JSON.stringify(bounds)} m${m}`).toBe(before.trip);
          }
          before = now;
        }
      }
    }
  });

  it('gives two robots on one journey one trip wherever both are away from home on one side, whatever their bounds', () => {
    let together = 0;
    for (const key of KEYS) {
      for (let m = 0; m <= RUN; m++) {
        const deep = journeyAt(key, b(16, 15), m);
        const shallow = journeyAt(key, b(5, 3), m);
        if (deep.position === 0 || Math.sign(deep.position) !== Math.sign(shallow.position)) continue;
        together++;
        expect(shallow.trip, `${key} m${m}`).toBe(deep.trip);
      }
    }
    expect(together).toBeGreaterThan(1000);
  });

  it('takes many trips over a long run', () => {
    for (const key of KEYS) expect(journeyAt(key, b(16, 15), RUN).trip).toBeGreaterThan(20);
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

  it('a freelancer on Company gets the key it would have on Fleet (Crawford, 2026-11-19)', () => {
    expect(keyOf({ journey: 'company' })).toBe(keyOf({ journey: 'fleet' }));
    expect(keyOf({ compositionSeed: 0.1, journey: 'company' })).toBe(journeyKey(WORLD, { kind: 'fleet' }));
  });

  it('a robot with none of the fields reads as max intensity 0, at the journey max time of 16, on its Own key', () => {
    const j = robotJourney(robot() as never, WORLD, BPM_TOP);
    expect(j.maxIntensity).toBe(DEFAULT_JOURNEY_MAX_INTENSITY);
    expect(j.maxTime).toBe(JOURNEY_TIME_MAX);
    expect([j.maxIntensity, j.maxTime]).toEqual([0, 16]);
    expect(j.key).toBe(journeyKey(WORLD, { kind: 'own', compositionSeed: 0.4375 }));
  });

  it('max intensity is the stored one', () => {
    expect(robotJourney(robot({ journeyMaxIntensity: 11 }) as never, WORLD, BPM_TOP).maxIntensity).toBe(11);
    expect(robotJourney(robot({ journeyMaxIntensity: 3 }) as never, WORLD, BPM_TOP).maxIntensity).toBe(3);
  });

  it('max time is the journey max time for every robot, whatever the robot carries (spec 7.4)', () => {
    // A leftover journeyMaxTime (a save made while the field existed) is not read.
    for (const stray of [2, 4, 14, 16]) {
      const j = robotJourney(robot({ journeyMaxIntensity: 9, journeyMaxTime: stray }) as never, WORLD, BPM_TOP);
      expect(j.maxTime).toBe(JOURNEY_TIME_MAX);
    }
    for (const journey of ['own', 'company', 'fleet']) {
      expect(robotJourney(robot({ journey, companyId: 'co-1' }) as never, WORLD, BPM_TOP).maxTime).toBe(16);
    }
  });

  it('the seed is the composition seed', () => {
    expect(robotJourney(robot({ compositionSeed: 0.8125 }) as never, WORLD, BPM_TOP).seed).toBe(0.8125);
  });

  it('the octave range is the stored one, for the octave jumps to stay inside; a robot with none hands on none', () => {
    expect(robotJourney(robot({ octaveRange: [2, 5] }) as never, WORLD, BPM_TOP).octaveRange).toEqual([2, 5]);
    expect(robotJourney(robot({ octaveRange: [4, 4] }) as never, WORLD, BPM_TOP).octaveRange).toEqual([4, 4]);
    expect(robotJourney(robot() as never, WORLD, BPM_TOP).octaveRange).toBeUndefined();
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

// The turns of a key (roadmap 94, spec §1.4): the lifecycle's read of a journey. The oracle is the running sum of the
// pairs' times at JOURNEY_TIME_MAX, the measures journeyAt's pair changes on, and the shares themselves.
describe('journeyTurns (roadmap 94, spec §1.4)', () => {
  const TURN_KEYS = [OWN, journeyKey(WORLD, { kind: 'fleet' }), journeyKey('0:0', { kind: 'company', companyId: 'co-1' })];
  const FULL: JourneyBounds = { maxIntensity: 16, maxTime: JOURNEY_TIME_MAX, calmLimit: 16 };
  /** Every turning measure up to `to`, with its pair index, from the robot pairs' times. */
  const oracle = (key: string, to: number): { measure: number; index: number }[] => {
    const out: { measure: number; index: number }[] = [];
    let at = 0;
    robotPairs(journeyShares(key, to + 2), FULL).forEach((pair, index) => {
      at += pair.time;
      if (at <= to) out.push({ measure: at, index });
    });
    return out;
  };
  /** A key whose journey has a drop before measure 400. */
  const keyWithDrop = (): string => {
    for (let n = 0; n < 200; n++) {
      const key = `drop-${n}:journey`;
      if (journeyShares(key, 40).some((s) => s.drop)) return key;
    }
    throw new Error('no key with a drop');
  };

  it('returns exactly the turning measures in the range, in order, for ranges that start and end mid-pair', () => {
    for (const key of TURN_KEYS) {
      const all = oracle(key, 600);
      for (const [from, to] of [[0, 600], [5, 97], [13, 14], [101, 333], [1, 1]]) {
        const want = all.filter((t) => t.measure >= from && t.measure <= to);
        const got = journeyTurns(key, from, to);
        expect(got.map((t) => t.measure), `${key} ${from}..${to}`).toEqual(want.map((t) => t.measure));
        expect(got.map((t) => t.index)).toEqual(want.map((t) => t.index));
      }
    }
  });

  it('includes a turn on either end of the range, and is empty for a range with no turn, or one back to front', () => {
    const [first, second] = oracle(OWN, 100);
    expect(journeyTurns(OWN, first.measure, first.measure).map((t) => t.measure)).toEqual([first.measure]);
    expect(journeyTurns(OWN, first.measure, second.measure).map((t) => t.measure)).toEqual([first.measure, second.measure]);
    expect(journeyTurns(OWN, first.measure + 1, second.measure - 1)).toEqual([]);
    expect(journeyTurns(OWN, 0, 0)).toEqual([]);
    expect(journeyTurns(OWN, 50, 10)).toEqual([]);
  });

  it('turns on the measures where journeyAt arrives at each pair intensity', () => {
    for (const turn of journeyTurns(OWN, 0, 300)) {
      const pair = robotPairs(journeyShares(OWN, turn.index + 2), FULL)[turn.index];
      expect(journeyAt(OWN, FULL, turn.measure).position).toBe(pair.intensity);
    }
  });

  it('gives each turn the move of its shares, the first from home, unscaled by any robot', () => {
    for (const key of TURN_KEYS) {
      const turns = journeyTurns(key, 0, 400);
      const shares = journeyShares(key, turns.length + 1);
      turns.forEach((turn) => {
        const before = turn.index === 0 ? 0 : shares[turn.index - 1].intensity;
        expect(turn.move).toBe(Math.abs(shares[turn.index].intensity - before));
      });
      expect(turns.some((t) => !Number.isInteger(t.move))).toBe(true);
      expect(turns.every((t) => t.move >= 0 && t.move <= 2)).toBe(true);
    }
  });

  it('flags a drop on the drop pair itself, one measure after the turn before it, and no other pair', () => {
    const key = keyWithDrop();
    const turns = journeyTurns(key, 0, 400);
    const shares = journeyShares(key, turns.length + 1);
    let drops = 0;
    turns.forEach((turn, n) => {
      expect(turn.drop).toBe(shares[turn.index].drop);
      if (turn.drop) {
        drops++;
        expect(turn.measure - (n === 0 ? 0 : turns[n - 1].measure)).toBe(1);
      }
    });
    expect(drops).toBeGreaterThan(0);
  });

  it('gives the same turns for a key whichever range is asked first', async () => {
    const want = journeyTurns('turns-order:journey', 0, 500);
    vi.resetModules();
    const fresh = await import('./melodyJourney');
    const late = fresh.journeyTurns('turns-order:journey', 300, 500);
    const early = fresh.journeyTurns('turns-order:journey', 0, 299);
    expect([...early, ...late]).toEqual(want);
  });
});
