// ========================================
// THE MELODY JOURNEY (docs/specs/MELODY_JOURNEY.md §1.3)
// ========================================
// A journey is a seeded list of pairs, each an intensity and a time, drawn as shares that each robot scales by its own
// bounds. Pure: a journey is a function of its key, and the memos below only save redrawing it.
import alea from 'alea';
import {
  DEFAULT_JOURNEY,
  DEFAULT_JOURNEY_MAX_INTENSITY,
  JOURNEY_DROP_MIN_MOVE,
  JOURNEY_DROP_ODDS,
  JOURNEY_HOME_ODDS,
  JOURNEY_MIN_MOVE,
  JOURNEY_TIME_LEAN,
  JOURNEY_TIME_MAX,
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

/** The string a journey is drawn from (§1.3's table). `worldKey` is the locale's coordinates, as the rhythm
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
// THE SHARES (§1.3)
// ========================================

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
  return sharesOf(key, count).slice(0, count);
}

/** The memo's own list for `key`, drawn to at least `count` pairs; not copied, so never handed out. */
function sharesOf(key: string, count: number): readonly JourneyShare[] {
  let shares = sharesByKey.get(key);
  if (!shares) {
    shares = { rand: alea(key), list: [] };
    sharesByKey.set(key, shares);
  }
  while (shares.list.length < count) {
    shares.list.push(drawShare(shares.rand, shares.list[shares.list.length - 1]));
  }
  return shares.list;
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

/** What a robot scales its journey's shares by (§1.3): its max intensity, the journey's max time (JOURNEY_TIME_MAX for
 *  every robot, §7.4; an argument here so the shape at other max times can be read) and its calm limit (calmLimit, from
 *  its home melody). */
export interface JourneyBounds {
  maxIntensity: number;
  maxTime: number;
  calmLimit: number;
}

/**
 * A robot's own pairs from its journey's shares (§1.3, "A robot's pairs"). Intensity: a busy share times max
 * intensity, a calm share times the calm range (the smaller of max intensity and the calm limit), each rounded to the
 * nearest whole change the same way on both sides of home. So the calm side is never past the calm limit, and is
 * spread over the calm changes the robot has. Time: the share times max time, rounded to the nearest even number of measures, never
 * under 2. A drop's time is 1, and the pair before a drop is one measure shorter, so the times through a drop sum to
 * an even number. A drop is seen only in the shares handed in: a caller reading pair i hands in share i + 1. Pure.
 */
export function robotPairs(shares: readonly JourneyShare[], bounds: JourneyBounds): JourneyPair[] {
  return shares.map((share, i) => ({
    intensity: pairIntensity(share, bounds),
    time: pairTime(share, shares[i + 1], bounds.maxTime),
  }));
}

/** A share's intensity in a robot's whole changes (robotPairs' rule). */
function pairIntensity(share: JourneyShare, bounds: JourneyBounds): number {
  // The calm side is as deep as the robot has calm changes, so a calm share is spread over those: a full calm share
  // is the floor, and nothing short of one waits there.
  const range = share.intensity < 0 ? Math.min(bounds.maxIntensity, bounds.calmLimit) : bounds.maxIntensity;
  const scaled = share.intensity * range;
  const intensity = Math.sign(scaled) * Math.round(Math.abs(scaled));
  // `intensity === 0` is true of −0 as well: hand back a plain 0.
  return intensity === 0 ? 0 : intensity;
}

/** A share's time in a robot's measures (robotPairs' rule); `next` is the share after it, to see a drop. */
function pairTime(share: JourneyShare, next: JourneyShare | undefined, maxTime: number): number {
  const time = share.drop ? 1 : Math.max(2, 2 * Math.round((share.time * maxTime) / 2));
  return next?.drop ? time - 1 : time;
}

/** Measure `k` of a pair that runs from `from` to `to` over `time` measures (positionInPairs' rule). */
function insidePair(from: number, to: number, k: number, time: number): number {
  return from + Math.sign(to - from) * Math.floor((Math.abs(to - from) * k) / time);
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
    if (measure < start + time) return insidePair(from, intensity, measure - start, time);
    start += time;
    from = intensity;
  }
  return from;
}

// ========================================
// THE ENGINE'S READ (§1.3, §1.7)
// ========================================

/** One key's turning measures at one max time, drawn as far as asked: `ends[i]` is pair i's turning measure. They
 *  depend on the key and max time alone (never on max intensity or the calm limit), so that pair is the memo's key. */
const turnsByKeyAndTime = new Map<string, number[]>();

/** The index of the pair `measure` falls in (the first whose turning measure is after it), drawing as needed, and the
 *  turning measures it was found in. */
function pairAt(key: string, maxTime: number, measure: number): { i: number; ends: readonly number[] } {
  const memoKey = `${maxTime}|${key}`;
  let ends = turnsByKeyAndTime.get(memoKey);
  if (!ends) {
    ends = [];
    turnsByKeyAndTime.set(memoKey, ends);
  }
  while (ends.length === 0 || ends[ends.length - 1] <= measure) {
    const i = ends.length;
    // Pair i reads the share after it to see a drop.
    const shares = sharesOf(key, i + 2);
    ends.push((i === 0 ? 0 : ends[i - 1]) + pairTime(shares[i], shares[i + 1], maxTime));
  }
  // Binary search: turning measures rise strictly.
  let lo = 0;
  let hi = ends.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ends[mid] <= measure) lo = mid + 1;
    else hi = mid;
  }
  return { i: lo, ends };
}

/**
 * How many changes from home a robot is at `measure` on `key`'s journey, scaled by its bounds (§1.3, §1.7):
 * positionInPairs over robotPairs, read without walking there. 0 at a max intensity of 0, at measure 0 and at a
 * negative or non-finite measure, so every world starts at home. Pure.
 */
export function journeyPosition(key: string, bounds: JourneyBounds, measure: number): number {
  if (!(bounds.maxIntensity > 0) || !Number.isFinite(measure) || measure <= 0) return 0;
  const { i, ends } = pairAt(key, bounds.maxTime, measure);
  const shares = sharesOf(key, i + 1);
  const start = i === 0 ? 0 : ends[i - 1];
  const from = i === 0 ? 0 : pairIntensity(shares[i - 1], bounds);
  return insidePair(from, pairIntensity(shares[i], bounds), measure - start, ends[i] - start);
}

// ========================================
// THE ROBOT'S JOURNEY (§1.7, §1.9)
// ========================================

/** A world's key: its coordinates, `${x}:${y}`, the same input its noise map hashes, so a world reloaded from a save
 *  or a link keys its rhythms and journeys as it did (melodyWorldKey). */
export function worldKeyOf(coordinates: { x: number; y: number }): string {
  return `${coordinates.x}:${coordinates.y}`;
}

/** What robotJourney reads from a stored robot; the settings absent read as their defaults. */
export type RobotJourneyInputs = Pick<Robot, 'compositionSeed' | 'companyId' | 'journeyMaxIntensity' | 'journey'> & {
  audioAttributes?: { adsr?: { attack?: number } };
  octaveRange?: Robot['octaveRange'];
};

/** A robot's journey as the engine plays it: the journey's key, the robot's max intensity, the journey's max time, and
 *  the things the changes read (developMelody's options): the floor, the seed and the octave range. The calm limit is
 *  the home melody's (calmLimit). */
export interface RobotJourney extends DevelopmentOptions {
  key: string;
  maxIntensity: number;
  maxTime: number;
}

/**
 * The stored robot's journey (§1.7, §1.9): the key its Journey setting names (a robot on Company with no company
 * travels as Own), its max intensity, the journey's max time (JOURNEY_TIME_MAX for every robot, so robots on one
 * journey turn together, §7.4), its attack's floor at `bpmTop` (the top of the theme's bpm band, handed in by the
 * caller), its composition seed and its octave range (absent when the robot has none). Absent settings read as
 * DEFAULT_JOURNEY_MAX_INTENSITY and DEFAULT_JOURNEY. Pure.
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
    maxIntensity: robot.journeyMaxIntensity ?? DEFAULT_JOURNEY_MAX_INTENSITY,
    maxTime: JOURNEY_TIME_MAX,
    floor: developmentFloor(robot.audioAttributes?.adsr?.attack ?? 0, bpmTop),
    seed: robot.compositionSeed,
    ...(robot.octaveRange ? { octaveRange: robot.octaveRange } : {}),
  };
}
