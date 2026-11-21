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
  rescaleMove,
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
 * Replays fromMeasure+1 .. toMeasure inclusive via stepRobotLifecycle, in a tight loop -- zero
 * side effects, zero store access. toMeasure < fromMeasure + 1 is a no-op (returns roster
 * unchanged). Always called with fromMeasure = the locale's own createdAtMeasure in practice (per
 * the "always replay from creation" decision) -- this function itself doesn't enforce that,
 * callers do. The one caller-facing entry point for headless lifecycle replay.
 */
export function replayLifecycle(
  roster: RobotLifecycleSnapshot[],
  fromMeasure: number,
  toMeasure: number,
  drain: DrainRule = activeDrain,
): RobotLifecycleSnapshot[] {
  let working = roster;
  for (let measure = fromMeasure + 1; measure <= toMeasure; measure++) {
    working = stepRobotLifecycle(working, measure, drain);
  }
  return working;
}

// ========================================
// THE SHIFT STEP (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §1.8)
// ========================================

/** What the shift step reads and writes of a robot: today's snapshot, the robot's next moves and the tempo they were
 *  scaled at (spec §4), and what finds its group (`companyId`, `compositionSeed`). */
export interface ShiftLifecycleSnapshot extends RobotLifecycleSnapshot {
  companyId?: string;
  compositionSeed: number;
  entersAtMeasure?: number;
  exitsAtMeasure?: number;
  shiftBpm?: number;
}

/** Out: Active or Recalled, so heard in the world (spec §1.8). */
const isOut = (r: Pick<ShiftLifecycleSnapshot, 'docking'>): boolean =>
  r.docking === DockingState.Active || r.docking === DockingState.Recalled;

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
 * One measure of the docking machine for a whole roster when a group's plan on its journey's turns decides when a
 * robot comes and goes (spec §1.8). Pure: one pass over a working copy in roster order, so within-measure ordering
 * matches a real tick; imports no store and no clock. Per robot, with the recall lead in bars at `env.bpm`
 * (recallLeadBars): a Docked robot begins Undocking one measure before its entrance, holding until it; an Undocking
 * robot lands Active on its hold; an Active robot is Recalled the lead before its exit turn, holding until the bar line
 * after the turn; a Recalled robot lands Docked on its hold. A robot moves at most one state a tick, so a hold is never
 * nearer than the next measure.
 */
export function stepShiftLifecycle(
  roster: readonly ShiftLifecycleSnapshot[],
  measure: number,
  env: ShiftEnv,
): ShiftLifecycleSnapshot[] {
  const working = roster.map((r) => ({ ...r }));
  const lead = recallLeadBars(env.bpm);
  /** `robot`'s group in `working`, itself included, in roster order. */
  const mates = (robot: ShiftLifecycleSnapshot) => working.filter((m) => groupIdOf(m) === groupIdOf(robot));
  /** Whether a robot outside `robot`'s group is Active right now, on the working array. */
  const outsideActive = (robot: ShiftLifecycleSnapshot) =>
    working.some((m) => m.docking === DockingState.Active && groupIdOf(m) !== groupIdOf(robot));
  /** `robot`'s mates, itself left out. */
  const othersOf = (robot: ShiftLifecycleSnapshot) => mates(robot).filter((m) => m !== robot);
  /** An exit turn a robot brought from another group (spec §1.14): no mate shares it, it is no turn of the group's
   *  journey, and a mate is out on an exit turn of its own. Every exit the plan draws is a turn of the group's journey,
   *  a drifting member's included, so a planned exit is never stray. */
  const isStrayExit = (robot: ShiftLifecycleSnapshot) => {
    const exit = robot.exitsAtMeasure!;
    const others = othersOf(robot);
    return (
      others.some((m) => isOut(m) && m.exitsAtMeasure !== undefined) &&
      !others.some((m) => m.exitsAtMeasure === exit) &&
      journeyTurns(groupJourneyKey(env.worldKey, robot), exit, exit).length === 0
    );
  };
  // A tempo change (spec §1.12): a move scaled at another tempo keeps its seconds to go and snaps to a turn, never so
  // near that it fires on this tick. A Recalled or Undocking robot keeps its hold.
  for (const robot of working) {
    if (robot.shiftBpm === undefined || robot.shiftBpm === env.bpm) continue;
    const rescale = (move: number, least: number) =>
      rescaleMove({ worldKey: env.worldKey, robot, move, measure, fromBpm: robot.shiftBpm!, toBpm: env.bpm, least });
    if (robot.exitsAtMeasure !== undefined && robot.docking !== DockingState.Recalled) {
      robot.exitsAtMeasure = rescale(robot.exitsAtMeasure, lead + 1);
    }
    if (robot.entersAtMeasure !== undefined && robot.docking === DockingState.Docked) {
      robot.entersAtMeasure = rescale(robot.entersAtMeasure, 2);
    }
    robot.shiftBpm = env.bpm;
  }
  // The gauge reads each robot as it stood at the top of the tick: a robot landing this tick is still finishing the
  // phase it was in, so it lands on its target exactly (spec §1.10).
  const start = working.map((r) => ({ out: isOut(r), exit: r.exitsAtMeasure, enter: r.entersAtMeasure }));

  for (const robot of working) {
    switch (robot.docking) {
      case DockingState.Docked:
        // Out of step (spec §1.14). An entrance while its group is out, and no exit drawn with the group's, is another
        // group's: dropped, so the robot waits for its company's next entrance.
        if (robot.entersAtMeasure !== undefined && robot.exitsAtMeasure === undefined && othersOf(robot).some(isOut)) {
          robot.entersAtMeasure = undefined;
        }
        if (robot.entersAtMeasure === undefined && !othersOf(robot).some(isOut)) {
          // Home with none: a home mate's entrance, or with none, the group's drawn now.
          const mateEnters = othersOf(robot).find((m) => m.entersAtMeasure !== undefined)?.entersAtMeasure;
          if (mateEnters !== undefined) {
            robot.entersAtMeasure = mateEnters;
            robot.shiftBpm = env.bpm;
          } else {
            const members = mates(robot);
            const entrances = planEntrance({ worldKey: env.worldKey, members, from: measure, bpm: env.bpm });
            members.forEach((m, i) => {
              if (m.docking !== DockingState.Docked) return;
              m.entersAtMeasure = entrances[i];
              m.exitsAtMeasure = undefined;
              m.shiftBpm = env.bpm;
            });
          }
        }
        if (robot.entersAtMeasure !== undefined && measure >= robot.entersAtMeasure - 1) {
          robot.docking = DockingState.Undocking;
          robot.dockingHoldUntilMeasure = Math.max(robot.entersAtMeasure, measure + 1);
        }
        break;
      case DockingState.Undocking:
        if (robot.dockingHoldUntilMeasure === undefined || measure >= robot.dockingHoldUntilMeasure) {
          robot.docking = DockingState.Active;
          robot.dockingHoldUntilMeasure = undefined;
          robot.entersAtMeasure = undefined;
          // The group's first member out draws the exit for every member, those still home included (spec §1.6).
          const members = mates(robot);
          if (!members.some((m) => m.exitsAtMeasure !== undefined)) {
            const exits = planExit({ worldKey: env.worldKey, members, from: measure, bpm: env.bpm });
            members.forEach((m, i) => {
              m.exitsAtMeasure = exits[i];
              m.shiftBpm = env.bpm;
            });
          }
        }
        break;
      case DockingState.Active:
        // Out of step (spec §1.14): an exit turn no mate shares, that is no turn of the group's journey, while a mate
        // is out on one of its own, is another group's: dropped.
        if (robot.exitsAtMeasure !== undefined && isStrayExit(robot)) robot.exitsAtMeasure = undefined;
        if (robot.exitsAtMeasure === undefined) {
          // A mate's exit turn it can still make, the earliest.
          const reachable = othersOf(robot)
            .map((m) => m.exitsAtMeasure)
            .filter((x): x is number => x !== undefined && x - lead > measure);
          if (reachable.length > 0) {
            robot.exitsAtMeasure = Math.min(...reachable);
            robot.shiftBpm = env.bpm;
          } else if (outsideActive(robot)) {
            // Staying (spec §1.9): once a robot outside the group is Active, every staying member takes the first turn
            // of the group's journey the lead allows, together.
            const turn = journeyTurns(groupJourneyKey(env.worldKey, robot), measure + lead + 1, measure + lead + 1 + JOURNEY_TIME_MAX)[0];
            for (const m of mates(robot)) {
              if (m.docking !== DockingState.Active || m.exitsAtMeasure !== undefined) continue;
              m.exitsAtMeasure = turn.measure;
              m.shiftBpm = env.bpm;
            }
          }
        } else if (measure >= robot.exitsAtMeasure - lead) {
          if (outsideActive(robot)) {
            // The group goes: every Active member due now is recalled on this tick, held to its exit turn's bar line.
            for (const m of mates(robot)) {
              if (m.docking !== DockingState.Active || m.exitsAtMeasure === undefined || measure < m.exitsAtMeasure - lead) continue;
              m.docking = DockingState.Recalled;
              m.dockingHoldUntilMeasure = Math.max(m.exitsAtMeasure + 1, measure + 1);
            }
          } else {
            // Never silent (spec §1.9): nobody outside is out, so the whole group stays, losing its exit turns.
            for (const m of mates(robot)) if (m.docking === DockingState.Active) m.exitsAtMeasure = undefined;
          }
        }
        break;
      case DockingState.Recalled:
        if (robot.dockingHoldUntilMeasure === undefined || measure >= robot.dockingHoldUntilMeasure) {
          robot.docking = DockingState.Docked;
          robot.dockingHoldUntilMeasure = undefined;
          // The group's last member home draws the entrance for every member, and the exits are spent (spec §1.7).
          const members = mates(robot);
          if (!members.some(isOut)) {
            const entrances = planEntrance({ worldKey: env.worldKey, members, from: measure, bpm: env.bpm });
            members.forEach((m, i) => {
              m.entersAtMeasure = entrances[i];
              m.exitsAtMeasure = undefined;
              m.shiftBpm = env.bpm;
            });
          }
        }
        break;
    }
  }

  working.forEach((robot, i) => {
    const s = start[i];
    robot.batteryLevel = gaugeLevel(
      robot.batteryLevel,
      s.out,
      s.exit ?? robot.exitsAtMeasure,
      s.enter ?? robot.entersAtMeasure,
      measure,
    );
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
  const env: ShiftEnv = { bpm: useAudioStore.getState().bpm, worldKey: worldKeyOf(locale.coordinates ?? { x: 0, y: 0 }) };

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

