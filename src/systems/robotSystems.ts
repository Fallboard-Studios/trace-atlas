// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { DockingState, JobType, RobotState } from '../types/Robot';
import type { JobType as JobTypeValue } from '../types/Robot';
import type { Robot } from '../types/Robot';
import useLocaleStore from '../stores/localeStore';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { AudioEngine } from '../engine/AudioEngine';
import { reRollMelodyPitches } from '../engine/melodyGenerator';
import { handleRobotIdle, pickExitDestination } from './idleSystem';
import { createSwimTimeline } from '../animation/swimAnimation';
import { generateSpawnPosition } from './spawnSystem';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import {
  BATTERY_DRAIN_ACTIVE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  DOCKED_PITCH_DRIFT_RATIO,
  JOB_MAX_ROBOTS_PER_TYPE,
} from '../constants';

// ========================================
// MODULE STATE
// ========================================
let lifecycleUnsubscribe: (() => void) | null = null;

/** Per-robot count of Docked landings — seeds dock position and pitch-drift rolls so
 *  successive dock cycles for the same robot sample different noise-map rows. */
const dockCycleCounters = new Map<string, number>();

// ========================================
// BATTERY / DOCKING TICK
// ========================================

/**
 * Begin the Recalled hold and, in the same instant, send the robot visibly
 * swimming off-screen — it should head off-screen before it freezes (lands
 * on Docked, muted), not freeze wherever its last idle motion happened to
 * leave it. The swim's own completion is not what governs the actual
 * Docked landing — that stays measure-quantized (dockingHoldUntilMeasure)
 * — so this is a fire-and-forget visual cue, matching how idle wandering
 * itself is already decoupled from any other timing.
 */
function beginRecall(localeId: string, robot: Robot, measure: number): void {
  // pickExitDestination is straight down now (bottom-only exit) — no horizontal
  // component to base a facing flip on, so keep the robot's current direction
  // rather than recomputing one from an x-comparison that would always read 'left'.
  const exitDestination = pickExitDestination(robot.position);
  const direction = robot.direction;

  createSwimTimeline(robot, exitDestination);

  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    docking: DockingState.Recalled,
    dockingHoldUntilMeasure: measure + 1,
    state: RobotState.Moving,
    destination: exitDestination,
    direction,
  });
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
}

/** How much one Active measure drains a robot's battery — injectable so lifecycleSim.ts can compare
 *  candidate rules on the same replay code (Phase 43 Task 2). Pure. */
export type DrainRule = (snapshot: RobotLifecycleSnapshot) => number;

/** The default: a flat BATTERY_DRAIN_ACTIVE for every Active robot, whatever it is doing. */
export const activeDrain: DrainRule = () => BATTERY_DRAIN_ACTIVE;

/**
 * One measure's worth of battery/docking transition for an entire roster, pure -- mirrors
 * tickRobotLifecycle's per-robot logic (the `drain` rule — default activeDrain —
 * BATTERY_RECHARGE_RATE/BATTERY_CRITICAL_THRESHOLD/BATTERY_FULL_THRESHOLD, the "never zero
 * Active" invariant) exactly, reusing the same constants -- never a second copy of the arithmetic. Mutates a local working array as it iterates (matching
 * tickRobotLifecycle's own "re-read fresh, not the stale snapshot" invariant check), in roster
 * array order, so within-measure ordering effects match a real tick bit for bit. Imports neither
 * useLocaleStore nor getCurrentMeasure -- zero side effects, zero store access.
 *
 * A Recalled -> Docked landing also drifts `melody` via the same reRollMelodyPitches/
 * DOCKED_PITCH_DRIFT_RATIO rule landOnDocked applies live, seeded identically
 * (getSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1) using the
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
    if (robot.docking === DockingState.Active) {
      robot.batteryLevel = Math.max(0, robot.batteryLevel - drain(robot));
      if (robot.batteryLevel <= BATTERY_CRITICAL_THRESHOLD) {
        const stillActiveElsewhere = working.some((r) => r.id !== robot.id && r.docking === DockingState.Active);
        if (stillActiveElsewhere) {
          robot.docking = DockingState.Recalled;
          robot.dockingHoldUntilMeasure = measure + 1;
        }
      }
    } else if (robot.docking === DockingState.Docked) {
      robot.batteryLevel = Math.min(100, robot.batteryLevel + BATTERY_RECHARGE_RATE);
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
        const pitchRand = () => getSeededVal(noiseMap, 'robot.pitchDrift', robot.dockCycleCount * 100 + pitchCallIndex++, 0, 1);
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
 *  the module-level dockCycleCounters map (the live path's own source of truth -- not removed by
 *  this refactor, see docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md §7 item 4). */
function toLifecycleSnapshot(robot: Robot): RobotLifecycleSnapshot {
  return {
    id: robot.id,
    docking: robot.docking,
    batteryLevel: robot.batteryLevel,
    dockingHoldUntilMeasure: robot.dockingHoldUntilMeasure,
    melody: robot.melody,
    dockCycleCount: dockCycleCounters.get(robot.id) ?? 0,
    noteVariance: robot.noteVariance,
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
 * comparing pre/post snapshots and firing the existing landing effects (beginRecall/
 * beginUndocking/landOnActive/landOnDocked, GSAP/AudioEngine/idle-wandering side effects included)
 * exactly where a transition happened. The job never enters the comparison: landOnActive's
 * assignJob writes it to the store only (live visual state, Phase 43), and the replay never reads it.
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
      beginRecall(localeId, robot, measure);
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
 *  spawnSystem.ts's former startSpawnScheduler singleton pattern. */
export function startRobotLifecycle(localeId: string): void {
  if (lifecycleUnsubscribe !== null) {
    return;
  }
  // Deliberately ignore the callback's own `measure` argument — BeatClock
  // wraps it to 0-95 for listeners (see beatClock.ts), but dockingHoldUntilMeasure
  // arithmetic needs a monotonic count that never wraps, or a hold set right
  // before the day-cycle boundary becomes permanently unreachable. getCurrentMeasure()
  // is the real, unwrapped counter — use that instead.
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
 * Land on Active: unmute via `audioMode` (the same toggle Robot Options
 * exposes — RobotAudioTab's Audio Mode control — so a user can independently
 * override it), assign a job, restart wandering.
 *
 * Voice reservation and melody registration are NOT done here — every robot
 * gets both once, at spawn (spawnSystem.ts's spawnRobot), regardless of
 * docking state, and they stay put across dock cycles. That's what makes
 * `audioMode` an effective, user-overridable mute in the first place: if a
 * Docked robot's synth/melody weren't already live, flipping audioMode back
 * to 'none' in Robot Options would still produce silence.
 */
export function landOnActive(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Active,
    dockingHoldUntilMeasure: undefined,
    audioMode: 'none',
  });

  assignJob(localeId, robotId);

  // Robot.tsx only calls handleRobotIdle on mount — a robot already mounted
  // (docked robots stay mounted, just off-screen and idle-guarded) needs this
  // explicit restart to resume wandering now that it's Active again.
  // isReturning: true keeps its first on-screen destination in the bottom
  // half — it's surfacing from its south-only dock spot, same as a
  // locale-load mount (see idleSystem.ts's handleRobotIdle).
  handleRobotIdle(localeId, robotId, { isReturning: true });
}

/**
 * Land on Docked: mute via `audioMode: 'mute'` (see landOnActive's comment —
 * the voice/melody stay reserved/registered; only the toggle changes, so a
 * user can flip it back in Robot Options and hear the robot anyway),
 * reposition off-screen. The melody is re-registered with AudioEngine after
 * the drift so a manual mute override plays the drifted pitches, not the
 * stale pre-drift ones.
 *
 * `driftedMelody` is computed by the caller (tickRobotLifecycle, via
 * stepRobotLifecycle -- World Clock, docs/specs/
 * WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md) rather than here -- this
 * function no longer calls reRollMelodyPitches itself. dockCycleCounters
 * bookkeeping and dock position (still position-only, not melody-seeding)
 * stay exactly as they were.
 */
export function landOnDocked(localeId: string, robotId: string, driftedMelody: Robot['melody']): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;

  const dockCycle = (dockCycleCounters.get(robotId) ?? 0) + 1;
  dockCycleCounters.set(robotId, dockCycle);

  const dockPosition = noiseMap
    ? generateSpawnPosition(noiseMap, dockCycle)
    : generateSpawnPosition((_x: number, _y: number) => 0 as number, dockCycle);

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Docked,
    dockingHoldUntilMeasure: undefined,
    position: dockPosition,
    melody: driftedMelody,
    audioMode: 'mute',
    // beginRecall set state: Moving for the exit swim — settle back to
    // Idle here so a later landOnActive's handleRobotIdle call (which
    // requires state === Idle) isn't blocked by its own guard.
    state: RobotState.Idle,
    destination: null,
  });

  // registerRobotMelody purges this robot's prior entries before adding the
  // new ones (see its own doc comment) — safe to call again without an
  // explicit unregister first.
  AudioEngine.registerRobotMelody(robotId, driftedMelody);
}

// ========================================
// JOB AFFINITY SCORING
// ========================================

/** The four job types the legacy scorer knows. Salvage and Maintenance are never scored — they
 *  are only chosen once the work loop replaces this scorer (Phase 43, deleted in Task 24). */
type ScoredJobType =
  | typeof JobType.VentExtraction
  | typeof JobType.AcousticSurvey
  | typeof JobType.StructuralInspection
  | typeof JobType.FluidMonitoring;

/**
 * Deterministic affinity score (higher = better fit) for each of the four legacy
 * job profiles, purely from a robot's already-seeded melodic attributes. No new
 * randomness — the inputs were seeded at spawn; this is plain arithmetic.
 */
export function scoreJobAffinities(robot: Robot): Record<ScoredJobType, number> {
  const [octMin, octMax] = robot.octaveRange;
  const avgOctave = (octMin + octMax) / 2; // ~1-7
  const octaveSpan = octMax - octMin; // 0-6
  const density = (robot.rhythmicDensity ?? 50) / 100; // 0-1

  const motif = robot.rhythmicMotifLength;
  const motifShort = !!motif?.active && motif.value <= 4;
  const motifSpacious = !motif?.active || motif.value >= 6;
  const motifMidLength = !!motif?.active && motif.value >= 4 && motif.value <= 8;

  const variance = robot.noteVariance;
  const varianceLow = !!variance?.active && variance.value <= 3;
  const varianceHigh = !variance?.active || variance.value === 8;
  // DEFAULT_NOTE_VARIANCE is inactive — "near its default" means inactive, not
  // some specific active value.
  const varianceDefault = !variance?.active;

  const ventExtraction =
    (1 - avgOctave / 7) * 0.4 +
    density * 0.3 +
    (motifShort ? 0.2 : 0) +
    (varianceLow ? 0.1 : 0);

  const acousticSurvey =
    (avgOctave / 7) * 0.4 +
    (1 - density) * 0.3 +
    (motifSpacious ? 0.2 : 0) +
    (varianceHigh ? 0.1 : 0);

  const structuralInspection =
    (octaveSpan / 6) * 0.6 +
    (motifMidLength ? 0.2 : 0) +
    (density >= 0.5 && density <= 0.9 ? 0.2 : 0);

  // Register bonus is gated on a narrow span — a wide-span robot (Structural
  // Inspection's own signal) can average out to a "mid" register by
  // coincidence without actually being a steady mid-register hum.
  const fluidMonitoring =
    0.2 +
    (Math.abs(avgOctave - 4) <= 1 && octaveSpan <= 3 ? 0.3 : 0) +
    (Math.abs(density - 0.5) <= 0.2 ? 0.2 : 0) +
    (varianceDefault ? 0.3 : 0);

  return {
    [JobType.VentExtraction]: ventExtraction,
    [JobType.AcousticSurvey]: acousticSurvey,
    [JobType.StructuralInspection]: structuralInspection,
    [JobType.FluidMonitoring]: fluidMonitoring,
  };
}

/**
 * Assign the best-scoring job type to a robot, skipping any type already at
 * JOB_MAX_ROBOTS_PER_TYPE active assignments in this locale (roster balancing
 * — see spec §1). Falls back to the top-scoring type if every type is
 * somehow capped (can't happen at the fixed 12-robot / 4-type / cap-3 roster,
 * but avoids leaving `job` unset in a future roster-size change).
 */
export function assignJob(localeId: string, robotId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const robot = locale?.robots.find((r) => r.id === robotId);
  if (!locale || !robot) return;

  const scores = scoreJobAffinities(robot);
  const sortedTypes = (Object.keys(scores) as ScoredJobType[]).sort((a, b) => scores[b] - scores[a]);

  const countByType = new Map<JobTypeValue, number>();
  for (const r of locale.robots) {
    if (r.id !== robotId && r.docking === DockingState.Active && r.job) {
      countByType.set(r.job, (countByType.get(r.job) ?? 0) + 1);
    }
  }

  const chosen = sortedTypes.find((t) => (countByType.get(t) ?? 0) < JOB_MAX_ROBOTS_PER_TYPE) ?? sortedTypes[0];

  useLocaleStore.getState().updateRobot(localeId, robotId, { job: chosen });
}
