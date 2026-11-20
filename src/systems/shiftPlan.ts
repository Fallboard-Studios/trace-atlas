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

import { journeyKey, journeyTurns, type JourneyTurn } from '../engine/melodyJourney';
import {
  BEATS_PER_MEASURE,
  DEFAULT_BATTERY_SIZE,
  ENTRANCE_STAGGER_BARS,
  ENTRANCE_TOGETHER_ODDS,
  GROUP_EXIT_ODDS_MAX,
  GROUP_EXIT_ODDS_MIN,
  JOURNEY_TIME_MAX,
  RECALL_LEAD_SECONDS,
  SHIFT_ENTER_ODDS,
  SHIFT_LEAVE_ODDS_MAX,
  SHIFT_LEAVE_ODDS_MIN,
  SHIFT_HOME_BASE_BARS,
  SHIFT_HOME_MAX_BARS,
  SHIFT_MIN_BARS,
  SHIFT_OUT_BASE_BARS,
  SHIFT_OUT_MAX_BARS,
  SHIFT_REFERENCE_BPM,
} from '../constants';

// ========================================
// THE ENVIRONMENT (§1.8)
// ========================================

/** What a lifecycle step is told about the world (spec §1.8). */
export interface ShiftEnv {
  bpm: number;
  /** worldKeyOf(coordinates): the key the journeys are drawn from. */
  worldKey: string;
}

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

/** Which of a turn's four draws decides what (groupDraws). */
const LEAVE_DRAW = 0;
const TOGETHER_DRAW = 1;
const ORDER_DRAW = 2;

/** `count` positions in an order picked by one even draw from 0 to 1: the draw read as an index into the count's
 *  permutations, in the factorial number system. */
function drawnOrder(count: number, draw: number): number[] {
  const left = Array.from({ length: count }, (_, i) => i);
  let permutations = 1;
  for (let i = 2; i <= count; i++) permutations *= i;
  let index = Math.min(permutations - 1, Math.floor(draw * permutations));
  const order: number[] = [];
  for (let n = count; n > 0; n--) {
    permutations /= n;
    const pick = Math.floor(index / permutations);
    index -= pick * permutations;
    order.push(left.splice(pick, 1)[0]);
  }
  return order;
}

/** The first `count` turns of `key` from `measure` on, `measure` included. Turns are at most JOURNEY_TIME_MAX apart,
 *  so that many measures a turn always holds them. */
function turnsFrom(key: string, measure: number, count: number): JourneyTurn[] {
  return journeyTurns(key, measure, measure + JOURNEY_TIME_MAX * Math.max(1, count)).slice(0, count);
}

// ========================================
// THE EXIT (§1.6)
// ========================================

/** What planExit and planEntrance are handed: a group's members in roster order (all of one group), the measure the
 *  window counts from, and the tempo. */
export interface ShiftPlanInput {
  worldKey: string;
  members: readonly ShiftRobot[];
  /** The measure the group's first member landed Active (an exit) or its last landed Docked (an entrance). */
  from: number;
  bpm: number;
}

/** A turn's weight (spec §1.4): 1 for a drop, else its move, at most 1. */
export function turnWeight(turn: JourneyTurn): number {
  return turn.drop ? 1 : Math.min(1, turn.move);
}

/**
 * Each member's exit turn, in `members`' order (spec §1.6). The group's turns in its out window from `from` are walked
 * in order: it leaves on one when that turn's leave draw is under SHIFT_LEAVE_ODDS_MIN + (MAX − MIN) × the turn's
 * weight (always on a drop), and on the last if on none before. At the chosen turn the exit is a group exit, every
 * member on that turn, when the together draw is under GROUP_EXIT_ODDS_MIN + (MAX − MIN) × the weight (always on a
 * drop); otherwise the members, in an order drawn on that turn, take the turns from it on, one each. A group of one
 * takes the turn. Pure.
 */
export function planExit({ worldKey, members, from, bpm }: ShiftPlanInput): number[] {
  if (members.length === 0) return [];
  const lead = members[0];
  const key = groupJourneyKey(worldKey, lead);
  const window = shiftWindow('out', groupSize(members), bpm);
  const candidates = journeyTurns(key, from + window.least, from + window.most);
  if (candidates.length === 0) candidates.push(...turnsFrom(key, from + window.least, 1));

  let chosen = candidates[candidates.length - 1];
  for (const turn of candidates) {
    const odds = SHIFT_LEAVE_ODDS_MIN + (SHIFT_LEAVE_ODDS_MAX - SHIFT_LEAVE_ODDS_MIN) * turnWeight(turn);
    if (turn.drop || groupDraws(worldKey, lead, turn.index)[LEAVE_DRAW] < odds) {
      chosen = turn;
      break;
    }
  }

  const draws = groupDraws(worldKey, lead, chosen.index);
  const togetherOdds = GROUP_EXIT_ODDS_MIN + (GROUP_EXIT_ODDS_MAX - GROUP_EXIT_ODDS_MIN) * turnWeight(chosen);
  if (members.length === 1 || chosen.drop || draws[TOGETHER_DRAW] < togetherOdds) {
    return members.map(() => chosen.measure);
  }
  const turns = turnsFrom(key, chosen.measure, members.length);
  const exits = new Array<number>(members.length);
  drawnOrder(members.length, draws[ORDER_DRAW]).forEach((member, n) => {
    exits[member] = turns[n].measure;
  });
  return exits;
}

// ========================================
// A TEMPO CHANGE (§1.12)
// ========================================

/** What rescaleMove is handed: the group's robot (for its journey), its next move, the measure now, the tempo the move
 *  was scaled at and the live one, and how near the result may be (the lead, for an exit). */
export interface RescaleInput {
  worldKey: string;
  robot: Pick<ShiftRobot, 'companyId'>;
  move: number;
  measure: number;
  fromBpm: number;
  toBpm: number;
  least: number;
}

/**
 * A move after a tempo change (spec §1.12): the bars still to go times `toBpm ÷ fromBpm`, rounded, never under `least`,
 * then the first turn of the group's journey at or after that. So the seconds still to go are kept and the move lands
 * on a turn; members with one move get one move. Equal tempos return the move unchanged. Pure.
 */
export function rescaleMove({ worldKey, robot, move, measure, fromBpm, toBpm, least }: RescaleInput): number {
  if (fromBpm === toBpm) return move;
  const toGo = Math.max(least, Math.round(((move - measure) * toBpm) / fromBpm));
  return turnsFrom(groupJourneyKey(worldKey, robot), measure + toGo, 1)[0].measure;
}

// ========================================
// THE ENTRANCE (§1.7)
// ========================================

/**
 * Each member's entrance, the measure it lands Active on, in `members`' order (spec §1.7). The group's turns in its
 * home window from `from` are walked in order: it comes out on one when that turn's enter draw is under
 * SHIFT_ENTER_ODDS, whatever the move, and on the last if on none before. Together when the together draw is under
 * ENTRANCE_TOGETHER_ODDS; otherwise the members, in an order drawn on that turn, land ENTRANCE_STAGGER_BARS apart from
 * the turn on. A group of one takes the turn. Pure.
 */
export function planEntrance({ worldKey, members, from, bpm }: ShiftPlanInput): number[] {
  if (members.length === 0) return [];
  const lead = members[0];
  const key = groupJourneyKey(worldKey, lead);
  const window = shiftWindow('home', groupSize(members), bpm);
  const candidates = journeyTurns(key, from + window.least, from + window.most);
  if (candidates.length === 0) candidates.push(...turnsFrom(key, from + window.least, 1));

  const chosen =
    candidates.find((turn) => groupDraws(worldKey, lead, turn.index)[LEAVE_DRAW] < SHIFT_ENTER_ODDS) ??
    candidates[candidates.length - 1];
  const draws = groupDraws(worldKey, lead, chosen.index);
  if (members.length === 1 || draws[TOGETHER_DRAW] < ENTRANCE_TOGETHER_ODDS) return members.map(() => chosen.measure);
  const entrances = new Array<number>(members.length);
  drawnOrder(members.length, draws[ORDER_DRAW]).forEach((member, n) => {
    entrances[member] = chosen.measure + n * ENTRANCE_STAGGER_BARS;
  });
  return entrances;
}
