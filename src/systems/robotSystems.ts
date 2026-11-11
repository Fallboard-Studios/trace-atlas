// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { DockingState } from '../types/Robot';
import type { Robot } from '../types/Robot';
import useLocaleStore from '../stores/localeStore';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { AudioEngine } from '../engine/AudioEngine';
import { reRollMelodyPitches } from '../engine/melodyGenerator';
import { onLifecycleChange } from './workLoop';
import { getDockCycleCount, recordDockLanding } from './dockCycles';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getUniformSeededVal } from '../utils/getSeededVal';
import {
  BATTERY_DRAIN_ACTIVE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  DEFAULT_BATTERY_SIZE,
  DOCKED_PITCH_DRIFT_RATIO,
} from '../constants';

// ========================================
// MODULE STATE
// ========================================
let lifecycleUnsubscribe: (() => void) | null = null;

// ========================================
// BATTERY / DOCKING TICK
// ========================================

/**
 * Begin the Recalled hold. The visual consequence (the work loop sends it home) is the
 * onLifecycleChange seam's — this writes docking state only (Phase 43, spec §1.1).
 */
function beginRecall(localeId: string, robotId: string, measure: number): void {
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Recalled,
    dockingHoldUntilMeasure: measure + 1,
  });

  onLifecycleChange(localeId, robotId, 'recalled');
}

function beginUndocking(localeId: string, robotId: string, measure: number): void {
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Undocking,
    dockingHoldUntilMeasure: measure + 1,
  });
}

// ========================================
// PURE LIFECYCLE STEP (World Clock, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md)
// ========================================

/** The subset of Robot fields a lifecycle replay reads or writes -- deliberately narrower than
 *  Robot itself. No job and no job-scoring fields (Phase 43): the job is live visual state the
 *  work loop owns, and nothing the replay computes reads it. `noteVariance` stays for pitch drift. */
export interface RobotLifecycleSnapshot {
  id: string;
  docking: DockingState;
  batteryLevel: number;
  dockingHoldUntilMeasure?: number;
  melody: Robot['melody'];
  /** How many times this robot has landed on Docked so far -- the replay-derived equivalent of
   *  the live dockCycleCounters module map below, threaded as part of the snapshot itself (not a
   *  side channel) so stepRobotLifecycle stays a pure function of its own input. Starts at 0. */
  dockCycleCount: number;
  noteVariance?: Robot['noteVariance'];
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
 *
 * A Recalled -> Docked landing also drifts `melody` via the same reRollMelodyPitches/
 * DOCKED_PITCH_DRIFT_RATIO rule landOnDocked applies live, seeded identically
 * (getUniformSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1) using the
 * POST-increment dockCycleCount, matching landOnDocked's own `(counter ?? 0) + 1` before seeding).
 * `noiseMap` is required, not optional -- no alea(...) fallback is ported from landOnDocked's live
 * defensive branch (spec §7 item 2 -- replay only ever runs against an already-spawned locale).
 */
export function stepRobotLifecycle(
  roster: RobotLifecycleSnapshot[],
  measure: number,
  noiseMap: NoiseFunction2D,
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
        robot.dockCycleCount += 1;
        let pitchCallIndex = 0;
        const pitchRand = () => getUniformSeededVal(noiseMap, 'robot.pitchDrift', robot.dockCycleCount * 100 + pitchCallIndex++, 0, 1);
        robot.melody = reRollMelodyPitches(robot.melody, DOCKED_PITCH_DRIFT_RATIO, {
          noteVariance: robot.noteVariance,
          rand: pitchRand,
        });
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
  noiseMap: NoiseFunction2D,
  drain: DrainRule = activeDrain,
): RobotLifecycleSnapshot[] {
  let working = roster;
  for (let measure = fromMeasure + 1; measure <= toMeasure; measure++) {
    working = stepRobotLifecycle(working, measure, noiseMap, drain);
  }
  return working;
}

/** Builds this robot's RobotLifecycleSnapshot from live store state, reading dockCycleCount from
 *  dockCycles.ts (the live path's own source of truth -- not removed by this refactor, see
 *  docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md §7 item 4). */
function toLifecycleSnapshot(robot: Robot): RobotLifecycleSnapshot {
  return {
    id: robot.id,
    docking: robot.docking,
    batteryLevel: robot.batteryLevel,
    dockingHoldUntilMeasure: robot.dockingHoldUntilMeasure,
    melody: robot.melody,
    dockCycleCount: getDockCycleCount(robot.id),
    noteVariance: robot.noteVariance,
    batterySize: robot.batterySize,
  };
}

/**
 * One measure's worth of Battery/Docking evaluation for every robot in a locale. Pure with
 * respect to its inputs (measure is passed in, not read from BeatClock directly) so tests can
 * drive it without a real transport — see startRobotLifecycle for the BeatClock-wired entry
 * point.
 *
 * Delegates the actual battery/docking/melody-drift arithmetic to stepRobotLifecycle (World
 * Clock, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md) — this function's own job is
 * comparing pre/post snapshots and firing the landing effects (beginRecall/beginUndocking/
 * landOnActive/landOnDocked) exactly where a transition happened. Those write docking + audio
 * only; anything visual goes through the onLifecycleChange seam (Phase 43). The job never enters
 * the comparison: it is live visual state the seam writes, and the replay never reads it.
 */
export function tickRobotLifecycle(localeId: string, measure: number): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const robots = locale.robots;

  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const before = robots.map(toLifecycleSnapshot);
  const after = stepRobotLifecycle(before, measure, noiseMap);

  robots.forEach((robot, i) => {
    const preState = before[i];
    const postState = after[i];

    if (preState.docking === DockingState.Active || preState.docking === DockingState.Docked) {
      useLocaleStore.getState().updateRobot(localeId, robot.id, { batteryLevel: postState.batteryLevel });
    }

    if (preState.docking === postState.docking) return;

    if (preState.docking === DockingState.Active && postState.docking === DockingState.Recalled) {
      beginRecall(localeId, robot.id, measure);
    } else if (preState.docking === DockingState.Docked && postState.docking === DockingState.Undocking) {
      beginUndocking(localeId, robot.id, measure);
    } else if (preState.docking === DockingState.Undocking && postState.docking === DockingState.Active) {
      landOnActive(localeId, robot.id);
    } else if (preState.docking === DockingState.Recalled && postState.docking === DockingState.Docked) {
      landOnDocked(localeId, robot.id, postState.melody);
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

  onLifecycleChange(localeId, robotId, 'active');
}

/**
 * Land on Docked, which mutes the robot by itself (see landOnActive's comment —
 * the docking state is the dock's mute; `audioMode` stays the user's). A robot
 * soloed in the station is still heard (Solo beats the dock). The melody is
 * re-registered with AudioEngine after the drift so a soloed docked robot
 * plays the drifted pitches, not the stale pre-drift ones. No
 * position write — the visual side (nothing: the entry ends in charging by itself) is
 * the onLifecycleChange seam's, called last.
 *
 * `driftedMelody` is computed by the caller (tickRobotLifecycle, via
 * stepRobotLifecycle -- World Clock, docs/specs/
 * WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md) rather than here -- this
 * function no longer calls reRollMelodyPitches itself. The dock-cycle count
 * still advances here: it seeds the next pitch drift, and the seam reads the
 * advanced count to seed the dock position.
 */
export function landOnDocked(localeId: string, robotId: string, driftedMelody: Robot['melody']): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  recordDockLanding(robotId);

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Docked,
    dockingHoldUntilMeasure: undefined,
    melody: driftedMelody,
  });

  // registerRobotMelody purges this robot's prior entries before adding the
  // new ones (see its own doc comment) — safe to call again without an
  // explicit unregister first.
  AudioEngine.registerRobotMelody(robotId, driftedMelody);

  onLifecycleChange(localeId, robotId, 'docked');
}

