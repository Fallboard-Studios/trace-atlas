// ========================================
// IMPORTS
// ========================================
import { DockingState, JobType, RobotState } from '../types/Robot';
import type { JobType as JobTypeValue, Robot } from '../types/Robot';
import useLocaleStore from '../stores/localeStore';
import { handleRobotIdle, pickExitDestination } from './idleSystem';
import { createSwimTimeline } from '../animation/swimAnimation';
import { generateSpawnPosition } from './spawnSystem';
import { getDockCycleCount } from './dockCycles';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { JOB_MAX_ROBOTS_PER_TYPE } from '../constants';

// ========================================
// THE SEAM (Phase 43, docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.1)
// ========================================

/** The lifecycle transitions that have a visual consequence. Undocking is a hold only. */
export type LifecycleVisualChange = 'recalled' | 'active' | 'docked';

/**
 * The only way the lifecycle tick (robotSystems.ts) reaches anything visual. Called after the
 * tick's own docking/audio writes for that transition have landed in the store.
 *
 * This is the **legacy adapter** (plan correction 1): it keeps today's visuals exactly — the exit
 * swim, the job + idle restart, the off-screen dock position — moved verbatim out of
 * robotSystems.ts so J1 ships with the app unchanged on screen. J2 (Task 24) re-points this seam at
 * the work loop and deletes this file.
 */
export function onLifecycleChange(localeId: string, robotId: string, to: LifecycleVisualChange): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;

  if (to === 'recalled') swimOffScreen(localeId, robot);
  else if (to === 'active') resumeWandering(localeId, robotId);
  else parkOffScreen(localeId, robotId);
}

/**
 * Send a just-Recalled robot visibly swimming off-screen — it should head off-screen before it
 * freezes (lands on Docked, muted), not freeze wherever its last idle motion happened to leave it.
 * The swim's own completion is not what governs the actual Docked landing — that stays
 * measure-quantized (dockingHoldUntilMeasure) — so this is a fire-and-forget visual cue, matching
 * how idle wandering itself is already decoupled from any other timing.
 */
function swimOffScreen(localeId: string, robot: Robot): void {
  // pickExitDestination is straight down now (bottom-only exit) — no horizontal
  // component to base a facing flip on, so keep the robot's current direction
  // rather than recomputing one from an x-comparison that would always read 'left'.
  const exitDestination = pickExitDestination(robot.position);
  const direction = robot.direction;

  createSwimTimeline(robot, exitDestination);

  useLocaleStore.getState().updateRobot(localeId, robot.id, {
    state: RobotState.Moving,
    destination: exitDestination,
    direction,
  });
}

/** Assign a job, then restart wandering. */
function resumeWandering(localeId: string, robotId: string): void {
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
 * Reposition a just-Docked robot off-screen, seeded by its dock cycle (already advanced by
 * robotSystems.ts's landOnDocked, so successive dock cycles sample different noise-map rows).
 */
function parkOffScreen(localeId: string, robotId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;
  const dockCycle = getDockCycleCount(robotId);

  const dockPosition = noiseMap
    ? generateSpawnPosition(noiseMap, dockCycle)
    : generateSpawnPosition((_x: number, _y: number) => 0 as number, dockCycle);

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    position: dockPosition,
    // swimOffScreen set state: Moving for the exit swim — settle back to
    // Idle here so a later resumeWandering's handleRobotIdle call (which
    // requires state === Idle) isn't blocked by its own guard.
    state: RobotState.Idle,
    destination: null,
  });
}

// ========================================
// JOB AFFINITY SCORING (legacy — deleted with this file in Task 24)
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
