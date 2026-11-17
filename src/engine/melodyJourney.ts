// ========================================
// THE MELODY JOURNEY: THE WALK (docs/specs/MELODY_JOURNEY.md §1.3)
// ========================================
// A journey is a seeded walk around home, in changes: turning points on alternating sides, each a whole number of
// changes from home, the walk moving one change per count towards the current one, then the next. Pure: the walk is a
// function of its key, and the memo below only saves redrawing it.
import alea from 'alea';
import { DEFAULT_DEVELOPMENT, DEFAULT_JOURNEY, JOURNEY_SWING_MAX, JOURNEY_SWING_MIN } from '../constants';
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
