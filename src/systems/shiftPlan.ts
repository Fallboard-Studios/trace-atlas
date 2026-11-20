// ========================================
// THE SHIFT PLAN (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md)
// ========================================
// When a group (a company, or one freelancer) comes and goes is planned ahead on its journey's turns. This file owns
// the arithmetic: the pace at a tempo, a group's journey and draws, the exit and the entrance, the rescale after a
// tempo change. It knows no roster shape beyond what it is handed, and the lifecycle step owns the transitions. Pure.

// ========================================
// IMPORTS
// ========================================
import alea from 'alea';

import { journeyKey } from '../engine/melodyJourney';
import {
  BEATS_PER_MEASURE,
  DEFAULT_BATTERY_SIZE,
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

// ========================================
// GROUPS (§1.3)
// ========================================

/** What the plan reads from a robot to find its group, its journey, its size and its draws. */
export interface ShiftRobot {
  id: string;
  companyId?: string;
  compositionSeed: number;
  batterySize?: number;
}

/** A robot's group (spec §1.3): its company, or itself alone. */
export function groupIdOf(robot: Pick<ShiftRobot, 'id' | 'companyId'>): string {
  return robot.companyId ?? robot.id;
}

/** The key of the journey a robot's group comes and goes on (spec §1.3): the company's for a member, whatever the
 *  member's own Journey setting says (Crawford, 2026-11-20), and the fleet's for a freelancer. */
export function groupJourneyKey(worldKey: string, robot: Pick<ShiftRobot, 'companyId'>): string {
  return journeyKey(worldKey, robot.companyId ? { kind: 'company', companyId: robot.companyId } : { kind: 'fleet' });
}

/** A group's battery size (spec §1.3): its member earliest in the roster's (`members` in roster order), an absent
 *  size reading as DEFAULT_BATTERY_SIZE. */
export function groupSize(members: readonly Pick<ShiftRobot, 'batterySize'>[]): number {
  return members[0]?.batterySize ?? DEFAULT_BATTERY_SIZE;
}

/** How many draws a group takes per turn of its journey, used or not (spec §1.3). */
const DRAWS_PER_TURN = 4;

/** Each stream's draws so far, four per turn. */
const drawsByStream = new Map<string, { rand: () => number; list: number[] }>();

/**
 * Turn `turnIndex`'s four draws for `robot`'s group (spec §1.3): from `${worldKey}:${companyId}:shifts` for a company
 * and `${worldKey}:${compositionSeed}:shifts` for a freelancer, four per turn of the group's journey whether used or
 * not, memoised per stream, so a turn's draws are the same whenever they are asked. The order of use: the leave (or
 * enter) draw, the together draw, the order draw, and one spare. A copy, so a caller cannot change the memo.
 */
export function groupDraws(worldKey: string, robot: Pick<ShiftRobot, 'companyId' | 'compositionSeed'>, turnIndex: number): number[] {
  const stream = `${worldKey}:${robot.companyId ?? robot.compositionSeed}:shifts`;
  let draws = drawsByStream.get(stream);
  if (!draws) {
    draws = { rand: alea(stream), list: [] };
    drawsByStream.set(stream, draws);
  }
  const end = (turnIndex + 1) * DRAWS_PER_TURN;
  while (draws.list.length < end) draws.list.push(draws.rand());
  return draws.list.slice(end - DRAWS_PER_TURN, end);
}
