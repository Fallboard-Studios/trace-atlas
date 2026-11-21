// ========================================
// IMPORTS
// ========================================
import { DockingState } from '../types/Robot';
import type { Robot } from '../types/Robot';
import useLocaleStore from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { AudioEngine } from '../engine/AudioEngine';
import { onLifecycleChange } from './workLoop';
import {
  groupIdOf,
  groupJourneyKey,
  planEntrance,
  planExit,
  recallLeadBars,
  rescaleAim,
  turnAtOrAfter,
  type ShiftEnv,
} from './shiftPlan';
import { journeyTurns, worldKeyOf } from '../engine/melodyJourney';
import {
  BATTERY_DRAIN_ACTIVE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  BATTERY_EASE_SHARE,
  DEFAULT_BATTERY_SIZE,
  JOURNEY_TIME_MAX,
} from '../constants';

// ========================================
// MODULE STATE
// ========================================
let lifecycleUnsubscribe: (() => void) | null = null;

// ========================================
// BATTERY / DOCKING TICK
// ========================================

/**
 * Begin the Recalled hold, until `holdUntil` (the step's: the bar line after the exit turn, roadmap 94). The visual
 * consequence (the work loop sends it home) is the onLifecycleChange seam's — this writes docking state only
 * (Phase 43, spec §1.1).
 */
function beginRecall(localeId: string, robotId: string, holdUntil: number | undefined): void {
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Recalled,
    dockingHoldUntilMeasure: holdUntil,
  });

  onLifecycleChange(localeId, robotId, 'recalled');
}

/** Begin the Undocking hold, until `holdUntil` (the step's: the robot's entrance). */
function beginUndocking(localeId: string, robotId: string, holdUntil: number | undefined): void {
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Undocking,
    dockingHoldUntilMeasure: holdUntil,
  });
}

// ========================================
// PURE LIFECYCLE STEP (World Clock, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md)
// ========================================

/** The subset of Robot fields a lifecycle replay reads or writes -- deliberately narrower than
 *  Robot itself. No job and no job-scoring fields (Phase 43): the job is live visual state the
 *  work loop owns, and nothing the replay computes reads it. No melody either: a docking never
 *  changes one (roadmap 92, docs/specs/MELODY_JOURNEY.md). */
export interface RobotLifecycleSnapshot {
  id: string;
  docking: DockingState;
  batteryLevel: number;
  dockingHoldUntilMeasure?: number;
  /** Divides both the drain and the recharge; absent reads as DEFAULT_BATTERY_SIZE, the flat rates
   *  (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3). */
  batterySize?: number;
}

/** The base drain of one Active measure, before the robot's battery size divides it — injectable so
 *  lifecycleSim.ts can compare candidate rules on the same replay code (Phase 43 Task 2). Pure. */
export type DrainRule = (snapshot: RobotLifecycleSnapshot) => number;

/** The default: a flat BATTERY_DRAIN_ACTIVE base for every Active robot, whatever it is doing. */
export const activeDrain: DrainRule = () => BATTERY_DRAIN_ACTIVE;

/**
 * One measure's worth of battery/docking transition for an entire roster, pure -- mirrors
 * tickRobotLifecycle's per-robot logic (the `drain` rule — default activeDrain —
 * BATTERY_RECHARGE_RATE/BATTERY_CRITICAL_THRESHOLD/BATTERY_FULL_THRESHOLD) exactly, reusing the same constants -- never a second copy of the arithmetic. Mutates a local working array as it iterates, in roster
 * array order, so within-measure ordering matches a real tick bit for bit. The last Active robot stays up
 * (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.2): a robot at or below critical is recalled only while
 * another robot in `working` is Active, so the fleet is never silent. Otherwise it stays Active and drains on
 * to the floor of 0 until one lands; because `working` is mutated in roster order, a robot landing earlier in
 * the roster relieves it in the same measure, one landing later in the next, and of two robots crossing
 * critical together with no third Active the earlier goes and the later stays. The rule reads docking only,
 * never audioMode. Imports neither useLocaleStore nor getCurrentMeasure -- zero side effects, zero store access.
 */
export function stepRobotLifecycle(
  roster: RobotLifecycleSnapshot[],
  measure: number,
  drain: DrainRule = activeDrain,
): RobotLifecycleSnapshot[] {
  const working = roster.map((r) => ({ ...r }));

  for (const robot of working) {
    // One seeded number divides both rates: a big battery is a long shift and a long charge (spec §1.3).
    const size = robot.batterySize ?? DEFAULT_BATTERY_SIZE;
    if (robot.docking === DockingState.Active) {
      robot.batteryLevel = Math.max(0, robot.batteryLevel - drain(robot) / size);
      // The last robot stays up (spec §1.2): recalled only while another robot is Active.
      const anotherActive = working.some((r) => r.id !== robot.id && r.docking === DockingState.Active);
      if (robot.batteryLevel <= BATTERY_CRITICAL_THRESHOLD && anotherActive) {
        robot.docking = DockingState.Recalled;
        robot.dockingHoldUntilMeasure = measure + 1;
      }
    } else if (robot.docking === DockingState.Docked) {
      robot.batteryLevel = Math.min(100, robot.batteryLevel + BATTERY_RECHARGE_RATE / size);
      if (robot.batteryLevel >= BATTERY_FULL_THRESHOLD) {
        robot.docking = DockingState.Undocking;
        robot.dockingHoldUntilMeasure = measure + 1;
      }
    } else if (
      (robot.docking === DockingState.Undocking || robot.docking === DockingState.Recalled) &&
      robot.dockingHoldUntilMeasure !== undefined &&
      measure >= robot.dockingHoldUntilMeasure
    ) {
      if (robot.docking === DockingState.Undocking) {
        robot.docking = DockingState.Active;
        robot.dockingHoldUntilMeasure = undefined;
      } else {
        robot.docking = DockingState.Docked;
        robot.dockingHoldUntilMeasure = undefined;
      }
    }
  }

  return working;
}

/**
 * Replays fromMeasure+1 .. toMeasure inclusive via stepShiftLifecycle (roadmap 94 Task 22), in a tight loop, at one
 * environment for the whole span (spec §7.1 A7: one tempo, as the journey's settings are read as if they had always
 * held) -- zero side effects, zero store access. toMeasure < fromMeasure + 1 is a no-op (returns roster unchanged).
 * Callers choose fromMeasure (the locale's own createdAtMeasure, per the "always replay from creation" decision); this
 * function doesn't enforce it. The one caller-facing entry point for headless lifecycle replay.
 */
export function replayLifecycle(
  roster: ShiftLifecycleSnapshot[],
  fromMeasure: number,
  toMeasure: number,
  env: ShiftEnv,
): ShiftLifecycleSnapshot[] {
  let working = roster;
  for (let measure = fromMeasure + 1; measure <= toMeasure; measure++) {
    working = stepShiftLifecycle(working, measure, env);
  }
  return working;
}

// ========================================
// THE SHIFT STEP (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §1.8)
// ========================================

/** What the shift step reads and writes of a robot: today's snapshot, the robot's next moves, the tempo they were
 *  scaled at and where they aim (spec §4), and what finds its group (`companyId`, `compositionSeed`). */
export interface ShiftLifecycleSnapshot extends RobotLifecycleSnapshot {
  companyId?: string;
  compositionSeed: number;
  entersAtMeasure?: number;
  exitsAtMeasure?: number;
  shiftBpm?: number;
  entersAim?: number;
  exitsAim?: number;
}

/** Write a robot's entrance and the aim it came from (absent: the entrance itself, as drawn or taken). Every write of
 *  an entrance goes through here, so an aim never outlives its move. */
function setEntrance(robot: ShiftLifecycleSnapshot, move: number | undefined, aim?: number): void {
  robot.entersAtMeasure = move;
  robot.entersAim = aim;
}

/** Write a robot's exit turn and its aim, as setEntrance. */
function setExit(robot: ShiftLifecycleSnapshot, move: number | undefined, aim?: number): void {
  robot.exitsAtMeasure = move;
  robot.exitsAim = aim;
}

/** Out: Active or Recalled, so heard in the world (spec §1.8). */
const isOut = (r: Pick<ShiftLifecycleSnapshot, 'docking'>): boolean =>
  r.docking === DockingState.Active || r.docking === DockingState.Recalled;

/** Home: Docked. An Undocking robot is neither out nor home: it lands Active on its hold, whatever its group does, so
 *  a group's entrance waits for it to come back in (review 2026-11-21). */
const isHome = (r: Pick<ShiftLifecycleSnapshot, 'docking'>): boolean => r.docking === DockingState.Docked;

/** One measure of a straight line from `level` to `target`, arriving on measure `at` (spec §1.10). */
function stepToward(level: number, target: number, at: number, measure: number): number {
  const remaining = at - measure + 1;
  return remaining <= 1 ? target : level + (target - level) / remaining;
}

/**
 * The gauge's next level (spec §1.10). Out (the robot's docking at the top of the tick, so Recalled counts until it
 * has landed): a straight line to BATTERY_CRITICAL_THRESHOLD on the bar line after its exit turn; with no exit turn
 * (a stay), or once at or under that level (it has stayed), it loses BATTERY_EASE_SHARE of its level. Home (Undocking
 * included): a straight line to BATTERY_FULL_THRESHOLD on its entrance; with none yet, it gains BATTERY_EASE_SHARE of
 * what is missing. So the level falls every measure out and rises every measure home, and never reaches 0.
 */
function gaugeLevel(level: number, out: boolean, exit: number | undefined, enter: number | undefined, measure: number): number {
  if (out) {
    return exit !== undefined && level > BATTERY_CRITICAL_THRESHOLD && exit + 1 >= measure
      ? stepToward(level, BATTERY_CRITICAL_THRESHOLD, exit + 1, measure)
      : level * (1 - BATTERY_EASE_SHARE);
  }
  return enter !== undefined && enter >= measure
    ? stepToward(level, BATTERY_FULL_THRESHOLD, enter, measure)
    : level + (BATTERY_FULL_THRESHOLD - level) * BATTERY_EASE_SHARE;
}

/**
 * How the step groups a roster's robots: by company, a freelancer alone (groupIdOf), except when one company holds
 * every robot. Then no robot outside the group could ever relieve its stay, so it would stay out for ever; each member
 * comes and goes as its own group instead, and the last Active robot stays, today's rule (review 2026-11-21, Crawford:
 * "last robot stays"). Its journey and draws stay the company's.
 */
function lifecycleGroupOf(roster: readonly ShiftLifecycleSnapshot[]): (robot: ShiftLifecycleSnapshot) => string {
  const companyId = roster[0]?.companyId;
  const wholeRoster = companyId !== undefined && roster.every((r) => r.companyId === companyId);
  return wholeRoster ? (robot) => robot.id : groupIdOf;
}

/** One tick of the shift step: the working copy of the roster (written in place, in roster order), the measure, the
 *  world and its tempo, the recall lead in bars at that tempo, and how the roster's robots group. */
interface ShiftPass {
  working: ShiftLifecycleSnapshot[];
  measure: number;
  env: ShiftEnv;
  lead: number;
  groupOf: (robot: ShiftLifecycleSnapshot) => string;
}

/** `robot`'s group in the working copy, itself included, in roster order. */
function matesOf(pass: ShiftPass, robot: ShiftLifecycleSnapshot): ShiftLifecycleSnapshot[] {
  return pass.working.filter((m) => pass.groupOf(m) === pass.groupOf(robot));
}

/** `robot`'s mates, itself left out. */
function othersOf(pass: ShiftPass, robot: ShiftLifecycleSnapshot): ShiftLifecycleSnapshot[] {
  return matesOf(pass, robot).filter((m) => m !== robot);
}

/** Whether a robot outside `robot`'s group is Active right now, on the working copy (spec §1.9). */
function outsideActive(pass: ShiftPass, robot: ShiftLifecycleSnapshot): boolean {
  return pass.working.some((m) => m.docking === DockingState.Active && pass.groupOf(m) !== pass.groupOf(robot));
}

/** An exit turn a robot brought from another group (spec §1.14): no mate shares it, it is no turn of the group's
 *  journey, and a mate is out on an exit turn of its own. Every exit the plan draws is a turn of the group's journey,
 *  a drifting member's included, so a planned exit is never stray. */
function isStrayExit(pass: ShiftPass, robot: ShiftLifecycleSnapshot, exit: number): boolean {
  const others = othersOf(pass, robot);
  return (
    others.some((m) => isOut(m) && m.exitsAtMeasure !== undefined) &&
    !others.some((m) => m.exitsAtMeasure === exit) &&
    journeyTurns(groupJourneyKey(pass.env.worldKey, robot), exit, exit).length === 0
  );
}

/**
 * A tempo change (spec §1.12): a move scaled at another tempo keeps its seconds to go and snaps to a turn, never so
 * near that it fires on this tick. The aim is scaled, not the turn, so a run of changes snaps once (review
 * 2026-11-21). A Recalled or Undocking robot keeps its hold.
 */
function rescaleForTempo({ measure, env, lead }: ShiftPass, robot: ShiftLifecycleSnapshot): void {
  if (robot.shiftBpm === undefined || robot.shiftBpm === env.bpm) return;
  const fromBpm = robot.shiftBpm;
  const rescale = (move: number, aim: number | undefined, least: number, set: typeof setExit) => {
    const next = rescaleAim({ aim: aim ?? move, measure, fromBpm, toBpm: env.bpm, least });
    set(robot, turnAtOrAfter(env.worldKey, robot, next), next);
  };
  if (robot.exitsAtMeasure !== undefined && robot.docking !== DockingState.Recalled) {
    rescale(robot.exitsAtMeasure, robot.exitsAim, lead + 1, setExit);
  }
  if (robot.entersAtMeasure !== undefined && robot.docking === DockingState.Docked) {
    rescale(robot.entersAtMeasure, robot.entersAim, 2, setEntrance);
  }
  robot.shiftBpm = env.bpm;
}

/** The group's exit, drawn from this measure for every member, those still home included (spec §1.6). */
function drawExit({ measure, env }: ShiftPass, members: ShiftLifecycleSnapshot[]): void {
  const exits = planExit({ worldKey: env.worldKey, members, from: measure, bpm: env.bpm });
  members.forEach((m, i) => {
    setExit(m, exits[i]);
    m.shiftBpm = env.bpm;
  });
}

/** The group's entrance, drawn from this measure for every member, all home; the exits are spent (spec §1.7). */
function drawEntrance({ measure, env }: ShiftPass, members: ShiftLifecycleSnapshot[]): void {
  const entrances = planEntrance({ worldKey: env.worldKey, members, from: measure, bpm: env.bpm });
  members.forEach((m, i) => {
    setEntrance(m, entrances[i]);
    setExit(m, undefined);
    m.shiftBpm = env.bpm;
  });
}

/** Docked: begins Undocking one measure before its entrance, holding until it. Out of step (spec §1.14), it first
 *  drops another group's entrance, or takes its group's. */
function stepDocked(pass: ShiftPass, robot: ShiftLifecycleSnapshot): void {
  const { measure, env } = pass;
  // An entrance while its group is out, and no exit drawn with the group's, is another group's: dropped, so the robot
  // waits for its company's next entrance.
  if (robot.entersAtMeasure !== undefined && robot.exitsAtMeasure === undefined && othersOf(pass, robot).some(isOut)) {
    setEntrance(robot, undefined);
  }
  if (robot.entersAtMeasure === undefined && othersOf(pass, robot).every(isHome)) {
    // Home with none, and the whole group home: a mate's entrance (and its aim), or with none, the group's drawn now.
    const mate = othersOf(pass, robot).find((m) => m.entersAtMeasure !== undefined);
    if (mate) {
      setEntrance(robot, mate.entersAtMeasure, mate.entersAim);
      robot.shiftBpm = env.bpm;
    } else {
      drawEntrance(pass, matesOf(pass, robot));
    }
  }
  if (robot.entersAtMeasure !== undefined && measure >= robot.entersAtMeasure - 1) {
    robot.docking = DockingState.Undocking;
    robot.dockingHoldUntilMeasure = Math.max(robot.entersAtMeasure, measure + 1);
  }
}

/** Undocking: lands Active on its hold, its entrance spent. The group's first member out draws the exit. */
function stepUndocking(pass: ShiftPass, robot: ShiftLifecycleSnapshot): void {
  if (robot.dockingHoldUntilMeasure !== undefined && pass.measure < robot.dockingHoldUntilMeasure) return;
  robot.docking = DockingState.Active;
  robot.dockingHoldUntilMeasure = undefined;
  setEntrance(robot, undefined);
  const members = matesOf(pass, robot);
  if (!members.some((m) => m.exitsAtMeasure !== undefined)) drawExit(pass, members);
}

/** Active: recalled with its group the lead before its exit turn, held to the bar line after it, while a robot outside
 *  the group is Active; otherwise the group stays (spec §1.9). Out of step, it drops a stray exit and takes its
 *  group's (spec §1.14). */
function stepActive(pass: ShiftPass, robot: ShiftLifecycleSnapshot): void {
  const { measure, env, lead } = pass;
  if (robot.exitsAtMeasure !== undefined && isStrayExit(pass, robot, robot.exitsAtMeasure)) setExit(robot, undefined);
  if (robot.exitsAtMeasure === undefined) {
    // A mate's exit turn it can still make, the earliest, and its aim.
    const reachable = othersOf(pass, robot)
      .filter((m) => m.exitsAtMeasure !== undefined && m.exitsAtMeasure - lead > measure)
      .sort((a, b) => a.exitsAtMeasure! - b.exitsAtMeasure!)[0];
    if (reachable) {
      setExit(robot, reachable.exitsAtMeasure, reachable.exitsAim);
      robot.shiftBpm = env.bpm;
    } else if (outsideActive(pass, robot)) {
      // Staying: once a robot outside the group is Active, every staying member takes the first turn of the group's
      // journey the lead allows, together.
      const from = measure + lead + 1;
      const turn = journeyTurns(groupJourneyKey(env.worldKey, robot), from, from + JOURNEY_TIME_MAX)[0];
      for (const m of matesOf(pass, robot)) {
        if (m.docking !== DockingState.Active || m.exitsAtMeasure !== undefined) continue;
        setExit(m, turn.measure);
        m.shiftBpm = env.bpm;
      }
    }
    return;
  }
  if (measure < robot.exitsAtMeasure - lead) return;
  if (outsideActive(pass, robot)) {
    // The group goes: every Active member due now is recalled on this tick, held to its exit turn's bar line.
    for (const m of matesOf(pass, robot)) {
      if (m.docking !== DockingState.Active || m.exitsAtMeasure === undefined || measure < m.exitsAtMeasure - lead) continue;
      m.docking = DockingState.Recalled;
      m.dockingHoldUntilMeasure = Math.max(m.exitsAtMeasure + 1, measure + 1);
    }
  } else {
    // Never silent: nobody outside is out, so the whole group stays, losing its exit turns.
    for (const m of matesOf(pass, robot)) if (m.docking === DockingState.Active) setExit(m, undefined);
  }
}

/** Recalled: lands Docked on its hold. The group's last member home draws the entrance; a member still Undocking (the
 *  last of a stagger) is not home, so it keeps the group's exit and goes in on it first. */
function stepRecalled(pass: ShiftPass, robot: ShiftLifecycleSnapshot): void {
  if (robot.dockingHoldUntilMeasure !== undefined && pass.measure < robot.dockingHoldUntilMeasure) return;
  robot.docking = DockingState.Docked;
  robot.dockingHoldUntilMeasure = undefined;
  const members = matesOf(pass, robot);
  if (members.every(isHome)) drawEntrance(pass, members);
}

/**
 * One measure of the docking machine for a whole roster when a group's plan on its journey's turns decides when a
 * robot comes and goes (spec §1.8). Pure: one pass over a working copy in roster order, so within-measure ordering
 * matches a real tick; imports no store and no clock. First every robot's moves follow a tempo change
 * (rescaleForTempo); then each robot steps from its docking (stepDocked, stepUndocking, stepActive, stepRecalled), a
 * group's draws written to every member as the first or last of them lands; then each battery steps its gauge. A robot
 * moves at most one state a tick, so a hold is never nearer than the next measure.
 */
export function stepShiftLifecycle(
  roster: readonly ShiftLifecycleSnapshot[],
  measure: number,
  env: ShiftEnv,
): ShiftLifecycleSnapshot[] {
  const working = roster.map((r) => ({ ...r }));
  const pass: ShiftPass = { working, measure, env, lead: recallLeadBars(env.bpm), groupOf: lifecycleGroupOf(working) };

  for (const robot of working) rescaleForTempo(pass, robot);
  // The gauge reads each robot as it stood at the top of the tick: a robot landing this tick is still finishing the
  // phase it was in, so it lands on its target exactly (spec §1.10).
  const start = working.map((r) => ({ out: isOut(r), exit: r.exitsAtMeasure, enter: r.entersAtMeasure }));

  for (const robot of working) {
    switch (robot.docking) {
      case DockingState.Docked:
        stepDocked(pass, robot);
        break;
      case DockingState.Undocking:
        stepUndocking(pass, robot);
        break;
      case DockingState.Active:
        stepActive(pass, robot);
        break;
      case DockingState.Recalled:
        stepRecalled(pass, robot);
        break;
    }
  }

  working.forEach((robot, i) => {
    const s = start[i];
    robot.batteryLevel = gaugeLevel(robot.batteryLevel, s.out, s.exit ?? robot.exitsAtMeasure, s.enter ?? robot.entersAtMeasure, measure);
  });
  return working;
}

/** Builds this robot's ShiftLifecycleSnapshot from live store state: every field the shift step reads or writes. */
export function toLifecycleSnapshot(robot: Robot): ShiftLifecycleSnapshot {
  return {
    id: robot.id,
    docking: robot.docking,
    batteryLevel: robot.batteryLevel,
    dockingHoldUntilMeasure: robot.dockingHoldUntilMeasure,
    batterySize: robot.batterySize,
    companyId: robot.companyId,
    compositionSeed: robot.compositionSeed,
    entersAtMeasure: robot.entersAtMeasure,
    exitsAtMeasure: robot.exitsAtMeasure,
    shiftBpm: robot.shiftBpm,
    entersAim: robot.entersAim,
    exitsAim: robot.exitsAim,
  };
}

/**
 * One measure's worth of Battery/Docking evaluation for every robot in a locale. Pure with
 * respect to its inputs (measure is passed in, not read from BeatClock directly) so tests can
 * drive it without a real transport — see startRobotLifecycle for the BeatClock-wired entry
 * point.
 *
 * Delegates the docking arithmetic to stepShiftLifecycle (roadmap 94: the group's plan on its journey's turns), handed
 * the live tempo (useAudioStore, as the work loop reads it) and the world's key (worldKeyOf on the locale's
 * coordinates). This function's own job is writing each robot's battery and its next moves, then comparing pre/post
 * snapshots and firing the landing effects (beginRecall/beginUndocking/landOnActive/landOnDocked) exactly where a
 * transition happened. Those write docking + audio only; anything visual goes through the onLifecycleChange seam
 * (Phase 43). The job never enters the comparison: it is live visual state the seam writes, and the replay never
 * reads it.
 */
export function tickRobotLifecycle(localeId: string, measure: number): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const robots = locale.robots;
  const env: ShiftEnv = { bpm: useAudioStore.getState().bpm, worldKey: worldKeyOf(locale.coordinates) };

  const before = robots.map(toLifecycleSnapshot);
  const after = stepShiftLifecycle(before, measure, env);

  robots.forEach((robot, i) => {
    const preState = before[i];
    const postState = after[i];

    // The gauge moves every measure (spec §1.10), and the step may have written the robot's next moves.
    useLocaleStore.getState().updateRobot(localeId, robot.id, {
      batteryLevel: postState.batteryLevel,
      entersAtMeasure: postState.entersAtMeasure,
      exitsAtMeasure: postState.exitsAtMeasure,
      shiftBpm: postState.shiftBpm,
      entersAim: postState.entersAim,
      exitsAim: postState.exitsAim,
    });

    if (preState.docking === postState.docking) return;

    if (preState.docking === DockingState.Active && postState.docking === DockingState.Recalled) {
      beginRecall(localeId, robot.id, postState.dockingHoldUntilMeasure);
    } else if (preState.docking === DockingState.Docked && postState.docking === DockingState.Undocking) {
      beginUndocking(localeId, robot.id, postState.dockingHoldUntilMeasure);
    } else if (preState.docking === DockingState.Undocking && postState.docking === DockingState.Active) {
      landOnActive(localeId, robot.id);
    } else if (preState.docking === DockingState.Recalled && postState.docking === DockingState.Docked) {
      landOnDocked(localeId, robot.id);
    }
  });
}

/** Start the per-measure lifecycle tick for a locale. Idempotent — safe to call
 *  multiple times; only one subscription is active at a time. Mirrors
 *  spawnSystem.ts's former startSpawnScheduler singleton pattern.
 *
 *  Stays on "now" by decision: subscribeToMeasure hands the measure and no
 *  Transport time, because the lifecycle's audio consequences come out of store
 *  subscriptions (audioBudgetSystem.ts) reacting to a semantic state change,
 *  not out of a scheduling call this tick makes. Threading an audio time
 *  through a store `set` would blur that line (docs/specs/BEATCLOCK_TRANSPORT_TIME.md
 *  §1, and the intent docs/intent/beatclock-transport-time.md). */
export function startRobotLifecycle(localeId: string): void {
  if (lifecycleUnsubscribe !== null) {
    return;
  }
  // dockingHoldUntilMeasure arithmetic needs the monotonic measure count — a
  // wrapped one would leave a hold set near the wrap permanently unreachable.
  // BeatClock passes listeners that same real count; read it from getCurrentMeasure()
  // so the tick keeps one source for it.
  lifecycleUnsubscribe = subscribeToMeasure(() => tickRobotLifecycle(localeId, getCurrentMeasure()));
}

/** Stop the per-measure lifecycle tick. Idempotent — safe to call when not running. */
export function stopRobotLifecycle(): void {
  if (lifecycleUnsubscribe === null) {
    return;
  }
  lifecycleUnsubscribe();
  lifecycleUnsubscribe = null;
}

// ========================================
// LANDING EFFECTS
// ========================================

/**
 * Land on Active, which unmutes the robot by itself: the dock's mute is the docking state
 * (robotAudibility.ts's isDockMuted), never `audioMode`, which is the user's Solo/Mute/Highlight
 * and survives the landing (Crawford, 2026-11-11). Then hand the visual side (the work loop: out
 * of the station, or a turn-back) to the onLifecycleChange seam.
 *
 * Voice reservation and melody registration are NOT done here — every robot
 * gets both once, at spawn (spawnSystem.ts's spawnRobot), regardless of
 * docking state. The melody stays put across dock cycles; the voice does not:
 * the Audio Load budget stands a muted robot by, releasing its voice once its
 * last note rings out, and rebuilds it when the robot leaves the station (here)
 * or the user unmutes it, and admits it (docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md G1).
 */
export function landOnActive(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Active,
    dockingHoldUntilMeasure: undefined,
  });

  // An Active robot sounds at its regular volume: its station fade, if one is live, ramps back
  // (docs/specs/PLAY_UNTIL_IN_THE_STATION.md §1.2 step 5, §1.5). A no-op with no fade.
  AudioEngine.cancelStationFade(robotId);

  onLifecycleChange(localeId, robotId, 'active');
}

/**
 * Land on Docked, which mutes the robot by itself (see landOnActive's comment —
 * the docking state is the dock's mute; `audioMode` stays the user's). A robot
 * soloed in the station is still heard (Solo beats the dock). The melody is
 * untouched: a docking never changes it (roadmap 92, docs/specs/MELODY_JOURNEY.md),
 * so nothing is re-registered with AudioEngine. No position write — the visual
 * side (nothing: the entry ends in charging by itself) is the onLifecycleChange
 * seam's, called last.
 */
export function landOnDocked(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Docked,
    dockingHoldUntilMeasure: undefined,
  });

  onLifecycleChange(localeId, robotId, 'docked');
}

