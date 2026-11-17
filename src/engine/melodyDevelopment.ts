// ========================================
// THE MELODY JOURNEY: THE CHANGES (docs/specs/MELODY_JOURNEY.md §1.4–§1.8)
// ========================================
// The home melody at a position: busier changes above 0, calmer below it, home at 0. Pure: everything it reads is an
// argument, as composeRobotMelody's is.
import { ATTACK_REACH_SHARE } from '../constants';
import type { MelodyEvent, NoteDuration } from '../types/Robot';

// ========================================
// LENGTHS
// ========================================

/** Sixteenths per note name. Home events are 16n to 2n; anything a bar or longer is the whole bar, and a thirty-second
 *  (never generated) counts as the one sixteenth it sounds within. */
const NOTE_NAME_SIXTEENTHS: Record<NoteDuration, number> = {
  '32n': 1,
  '16n': 1,
  '8n': 2,
  '4n': 4,
  '2n': 8,
  '1n': 16,
  '2m': 16,
  '4m': 16,
};

/** An event's length in sixteenths (§1.4): its `sixteenths` when present, else its note name's. */
export function eventSixteenths(event: MelodyEvent): number {
  return event.sixteenths ?? NOTE_NAME_SIXTEENTHS[event.length];
}

// ========================================
// THE FLOOR
// ========================================

/** Absorbs float error in the floor's division, so an attack that reaches a whole number of sixteenths exactly is not
 *  rounded up past it. */
const FLOOR_EPSILON = 1e-9;

/**
 * The shortest note development may make, in sixteenths (§1.8): the attack rail's arithmetic (audibleDensityBand), so
 * a slow attack is never split into notes too short for it to climb. `ceil(ATTACK_REACH_SHARE × attack ÷ one
 * sixteenth at bpmTop)`, never below 1. `bpmTop` is the top of the theme's bpm band, handed in by the caller so this
 * module stays free of the loading context.
 */
export function developmentFloor(attackSeconds: number, bpmTop: number): number {
  if (!(attackSeconds > 0) || !(bpmTop > 0)) return 1;
  const sixteenthSeconds = 15 / bpmTop;
  return Math.max(1, Math.ceil((ATTACK_REACH_SHARE * attackSeconds) / sixteenthSeconds - FLOOR_EPSILON));
}
