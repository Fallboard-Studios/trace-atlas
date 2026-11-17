// ========================================
// THE MELODY JOURNEY: THE WALK (docs/specs/MELODY_JOURNEY.md §1.3)
// ========================================
// A journey is a seeded walk around home, in changes: turning points on alternating sides, each a whole number of
// changes from home, the walk moving one change per count towards the current one, then the next. Pure: the walk is a
// function of its key, and the memo below only saves redrawing it.
import alea from 'alea';
import {
  DEFAULT_DEVELOPMENT,
  DEFAULT_JOURNEY,
  JOURNEY_DROP_MIN_MOVE,
  JOURNEY_DROP_ODDS,
  JOURNEY_HOME_ODDS,
  JOURNEY_MIN_MOVE,
  JOURNEY_SWING_MAX,
  JOURNEY_SWING_MIN,
  JOURNEY_TIME_LEAN,
} from '../constants';
import { developmentFloor, type DevelopmentOptions } from './melodyDevelopment';
import type { Robot } from '../types/Robot';

// ========================================
// TYPES
// ========================================

/** Who travels together (§1.3): a robot alone, every member of one company on Company, or every robot on Fleet. */
export type JourneyScope =
  | { kind: 'own'; compositionSeed: number }
  | { kind: 'company'; companyId: string }
  | { kind: 'fleet' };

// ========================================
// THE KEY
// ========================================

/** The string a journey's walk is drawn from (§1.3's table). `worldKey` is the locale's coordinates, as the rhythm
 *  stream's (melodyWorldKey), so a reloaded world travels the same journeys. */
export function journeyKey(worldKey: string, scope: JourneyScope): string {
  switch (scope.kind) {
    case 'own':
      return `${worldKey}:${scope.compositionSeed}:journey`;
    case 'company':
      return `${worldKey}:${scope.companyId}:journey`;
    case 'fleet':
      return `${worldKey}:fleet:journey`;
  }
}

// ========================================
// THE WALK
// ========================================

/** One key's walk, drawn as far as it has been asked. `values[i]` is turning point i's position and `counts[i]` the
 *  count the walk reaches it at; the walk starts at position 0 on count 0, before turning point 0. */
interface Walk {
  rand: () => number;
  side: number;
  values: number[];
  counts: number[];
}

const walks = new Map<string, Walk>();

function walkFor(key: string): Walk {
  let w = walks.get(key);
  if (!w) {
    const rand = alea(key);
    // The first draw is the first turning point's side; each draw after it is one turning point's distance.
    w = { rand, side: rand() < 0.5 ? 1 : -1, values: [], counts: [] };
    walks.set(key, w);
  }
  return w;
}

/** Draws turning points until the walk reaches `count`. */
function extendTo(w: Walk, count: number): void {
  while (w.counts.length === 0 || w.counts[w.counts.length - 1] < count) {
    const i = w.values.length;
    const distance = JOURNEY_SWING_MIN + Math.floor(w.rand() * (JOURNEY_SWING_MAX - JOURNEY_SWING_MIN + 1));
    const value = (i % 2 === 0 ? w.side : -w.side) * distance;
    const from = i === 0 ? 0 : w.values[i - 1];
    const startCount = i === 0 ? 0 : w.counts[i - 1];
    w.values.push(value);
    w.counts.push(startCount + Math.abs(value - from));
  }
}

/** The walk at `count` changes made. */
function walkAt(key: string, count: number): number {
  if (!(count > 0)) return 0;
  const w = walkFor(key);
  extendTo(w, count);
  // The first turning point reached at or after `count` (binary search: counts rise strictly).
  let lo = 0;
  let hi = w.counts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (w.counts[mid] < count) lo = mid + 1;
    else hi = mid;
  }
  const target = w.values[lo];
  const remaining = w.counts[lo] - count;
  return target - Math.sign(target - (lo === 0 ? 0 : w.values[lo - 1])) * remaining;
}

/** How many changes from home `key`'s journey is at `measure`, travelling at `rate` changes a measure: the walk at
 *  `floor(rate × measure)`. 0 at measure 0 and at rate 0, so every world starts at home. Pure. */
export function journeyPosition(key: string, rate: number, measure: number): number {
  return walkAt(key, Math.floor(rate * measure));
}

// ========================================
// THE SHARES (§1.3)
// ========================================
// The revised journey: a list of pairs, each an intensity and a time, drawn as shares that each robot scales by its
// own bounds. Built beside the walk above, which the engine still reads until roadmap 92 Task 28.

/** One pair of a journey as drawn: `intensity` from −1 to 1 (a share of max intensity, signed: + busier, − calmer),
 *  `time` from 0 to 1 (a share of max time), and whether it is a drop (it lands in one measure, §1.3). */
export interface JourneyShare {
  intensity: number;
  time: number;
  drop: boolean;
}

const sharesByKey = new Map<string, { rand: () => number; list: JourneyShare[] }>();

/** The pair after `before` (undefined for the first), by §1.3's table. Takes four draws whatever it uses, so pair i
 *  always reads draws 4i to 4i + 3. */
function drawShare(rand: () => number, before: JourneyShare | undefined): JourneyShare {
  const homeRoll = rand();
  const intensityDraw = rand();
  const timeDraw = rand();
  const dropRoll = rand();
  const p = before?.intensity ?? 0;

  let intensity: number;
  if (Math.abs(p) >= JOURNEY_MIN_MOVE && homeRoll < JOURNEY_HOME_ODDS * Math.abs(p)) {
    intensity = 0;
  } else {
    // An even draw over −1 to 1 less the stretch within the least move of p.
    const lo = Math.max(-1, p - JOURNEY_MIN_MOVE);
    const hi = Math.min(1, p + JOURNEY_MIN_MOVE);
    const x = -1 + intensityDraw * (2 - (hi - lo));
    intensity = x < lo ? x : x + (hi - lo);
  }

  const time = JOURNEY_TIME_LEAN * (1 - Math.abs(intensity)) + (1 - JOURNEY_TIME_LEAN) * timeDraw;
  const drop =
    before !== undefined &&
    !before.drop &&
    dropRoll < JOURNEY_DROP_ODDS &&
    Math.abs(intensity - p) >= JOURNEY_DROP_MIN_MOVE;
  return { intensity, time, drop };
}

/** The first `count` pairs of `key`'s journey, as shares (§1.3). Drawn as far as asked and memoised per key, so the
 *  same key gives the same pairs whichever count is asked for first. Pure. */
export function journeyShares(key: string, count: number): JourneyShare[] {
  let shares = sharesByKey.get(key);
  if (!shares) {
    shares = { rand: alea(key), list: [] };
    sharesByKey.set(key, shares);
  }
  while (shares.list.length < count) {
    shares.list.push(drawShare(shares.rand, shares.list[shares.list.length - 1]));
  }
  return shares.list.slice(0, count);
}

// ========================================
// THE POSITION IN A LIST OF PAIRS (§1.3)
// ========================================

/** One pair of a robot's own journey: the intensity it heads for, in whole changes from home, and the measures it
 *  takes to get there. */
export interface JourneyPair {
  intensity: number;
  time: number;
}

/**
 * How many changes from home a robot is at `measure`, on its own pairs (§1.3, "Where a robot is"). The first pair
 * starts at home on measure 0. In a pair from `a` on measure `s` to `b` on `s + T`, measure `s + k` plays
 * `a + sign(b − a) × floor(|b − a| × k ÷ T)`: the floor leaves a turning measure late and arrives on the next one
 * exactly, never early. Past the last pair, the last intensity. 0 at measure 0, at a negative or non-finite measure,
 * and on an empty list. Pure.
 */
export function positionInPairs(pairs: readonly JourneyPair[], measure: number): number {
  if (!Number.isFinite(measure) || measure <= 0) return 0;
  let start = 0;
  let from = 0;
  for (const { intensity, time } of pairs) {
    if (measure < start + time) {
      const k = measure - start;
      return from + Math.sign(intensity - from) * Math.floor((Math.abs(intensity - from) * k) / time);
    }
    start += time;
    from = intensity;
  }
  return from;
}

// ========================================
// THE ROBOT'S JOURNEY (§1.7, §1.9)
// ========================================

/** A world's key: its coordinates, `${x}:${y}`, the same input its noise map hashes, so a world reloaded from a save
 *  or a link keys its rhythms and journeys as it did (melodyWorldKey). */
export function worldKeyOf(coordinates: { x: number; y: number }): string {
  return `${coordinates.x}:${coordinates.y}`;
}

/** What robotJourney reads from a stored robot; the two settings absent read as their defaults. */
export type RobotJourneyInputs = Pick<Robot, 'compositionSeed' | 'companyId' | 'development' | 'journey'> & {
  audioAttributes?: { adsr?: { attack?: number } };
};

/** A robot's journey as the engine plays it: the walk's key, the rate in changes a measure, and the two things the
 *  changes read (developMelody's options): the floor and the seed. */
export interface RobotJourney extends DevelopmentOptions {
  key: string;
  rate: number;
}

/**
 * The stored robot's journey (§1.7, §1.9): the key its Journey setting names (a robot on Company with no company
 * travels as Own), its Development as the rate, its attack's floor at `bpmTop` (the top of the theme's bpm band, handed
 * in by the caller) and its composition seed. Absent settings read as DEFAULT_DEVELOPMENT and DEFAULT_JOURNEY. Pure.
 */
export function robotJourney(robot: RobotJourneyInputs, worldKey: string, bpmTop: number): RobotJourney {
  const setting = robot.journey ?? DEFAULT_JOURNEY;
  const scope: JourneyScope =
    setting === 'fleet'
      ? { kind: 'fleet' }
      : setting === 'company' && robot.companyId
        ? { kind: 'company', companyId: robot.companyId }
        : { kind: 'own', compositionSeed: robot.compositionSeed };
  return {
    key: journeyKey(worldKey, scope),
    rate: robot.development ?? DEFAULT_DEVELOPMENT,
    floor: developmentFloor(robot.audioAttributes?.adsr?.attack ?? 0, bpmTop),
    seed: robot.compositionSeed,
  };
}
