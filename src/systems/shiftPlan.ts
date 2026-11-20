// ========================================
// THE SHIFT PLAN (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md)
// ========================================
// When a group (a company, or one freelancer) comes and goes is planned ahead on its journey's turns. This file owns
// the arithmetic: the pace at a tempo, a group's journey and draws, the exit and the entrance, the rescale after a
// tempo change. It knows no roster shape beyond what it is handed, and the lifecycle step owns the transitions. Pure.

// ========================================
// IMPORTS
// ========================================
import {
  BEATS_PER_MEASURE,
  JOURNEY_TIME_MAX,
  RECALL_LEAD_SECONDS,
  SHIFT_HOME_BASE_BARS,
  SHIFT_HOME_MAX_BARS,
  SHIFT_MIN_BARS,
  SHIFT_OUT_BASE_BARS,
  SHIFT_OUT_MAX_BARS,
  SHIFT_REFERENCE_BPM,
} from '../constants';

// ========================================
// THE PACE (§1.5, §1.11)
// ========================================

/** Out (from landing Active to the exit turn) or home (from docking to the entrance). */
export type ShiftPhase = 'out' | 'home';

/** A group's window for one phase, in measures from where it starts counting, both ends included. */
export interface ShiftWindow {
  least: number;
  most: number;
}

/** A length written for SHIFT_REFERENCE_BPM, in bars at `bpm`, rounded (spec §1.5). */
export function paceBars(barsAtReference: number, bpm: number): number {
  return Math.round((barsAtReference * bpm) / SHIFT_REFERENCE_BPM);
}

/**
 * A group's window for `phase` at `bpm` (spec §1.5's table): the least is the base times the group's battery size,
 * never under SHIFT_MIN_BARS; the most is the phase's limit, never under JOURNEY_TIME_MAX past the least, so a window
 * always holds a turn.
 */
export function shiftWindow(phase: ShiftPhase, size: number, bpm: number): ShiftWindow {
  const base = phase === 'out' ? SHIFT_OUT_BASE_BARS : SHIFT_HOME_BASE_BARS;
  const limit = phase === 'out' ? SHIFT_OUT_MAX_BARS : SHIFT_HOME_MAX_BARS;
  const least = Math.max(SHIFT_MIN_BARS, paceBars(base * size, bpm));
  return { least, most: Math.max(least + JOURNEY_TIME_MAX, paceBars(limit, bpm)) };
}

/** How many measures before its exit turn a robot is recalled (spec §1.11): RECALL_LEAD_SECONDS in bars at `bpm`,
 *  rounded up, so the lead is never shorter than the seconds. */
export function recallLeadBars(bpm: number): number {
  return Math.ceil((RECALL_LEAD_SECONDS * bpm) / (BEATS_PER_MEASURE * 60));
}
