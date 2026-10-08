// ========================================
// jobMoveTable (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Phase 43 Task 29)
// ========================================
// Which moves each job runs, in order, on which of its site's targets, and how a job's time splits
// between them. Pure data and maths; buildJobTimeline.ts turns a job's steps into tweens.
//
// Sites name their points only by index (workSites.ts), so the table does too:
//   - points[0] is the site's main point: the stack or vent mouth, the mast or dish centre, the
//     gauge, the head. Vent Extraction, Acoustic Survey and Maintenance work there.
//   - Fluid Monitoring's valve is points[1]: the Refinery's valve, and the riser top directly
//     above the pipeline's valve.
//   - Salvage carries points[0] → points[1]: the Warehouse's and the containers' pick-up and drop.
// Every site has at least two points, and `stepPoint` falls back to the last one regardless.

// ========================================
// IMPORTS
// ========================================
import { ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { MOVE_APPROACH_FRACTION, MOVE_APPROACH_MAX_SECONDS } from '../../constants';
import { JobType } from '../../types/Robot';
import type { Vec2 } from '../../types/Vec2';
import type { WorkPaths, WorkSite } from '../../systems/workSites';

// ========================================
// TYPES
// ========================================
/** One move of a job, and the site targets it works on (indices into `WorkSite.points`). */
export type MoveStep =
  | { move: 'hoverPulse'; point: number }
  | { move: 'trace'; path: keyof WorkPaths }
  | { move: 'ring'; point: number; flicker?: true }
  | { move: 'carry'; from: number; to: number }
  | { move: 'fan'; point: number };

/** One move's slice of the job: it flies to its first targets over [approach, start], works over
 *  [start, end]. */
export interface MoveWindow {
  approach: number;
  start: number;
  end: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Spec §1.9's job table. */
export const JOB_MOVES: Readonly<Record<JobType, readonly MoveStep[]>> = {
  [JobType.VentExtraction]: [{ move: 'hoverPulse', point: 0 }],
  [JobType.AcousticSurvey]: [{ move: 'fan', point: 0 }, { move: 'ring', point: 0 }],
  [JobType.StructuralInspection]: [{ move: 'trace', path: 'outline' }],
  [JobType.FluidMonitoring]: [{ move: 'trace', path: 'pipe' }, { move: 'hoverPulse', point: 1 }],
  [JobType.Salvage]: [{ move: 'carry', from: 0, to: 1 }],
  [JobType.Maintenance]: [{ move: 'ring', point: 0, flicker: true }],
};

/** The detach never takes more than this fraction of the first move's share (the sketch's cap;
 *  with today's 6–10 s jobs and ≤ 2 moves it never binds, so the detach is ATTACH_DURATION). */
const DETACH_MAX_FRACTION = 0.4;

// ========================================
// TARGETS
// ========================================
/** The site point a step names, or the site's last point when it has fewer. */
export function stepPoint(site: Pick<WorkSite, 'points'>, index: number): Vec2 {
  return site.points[Math.min(index, site.points.length - 1)];
}

/** The site path a step names; a site without a pipe traces its outline (spec §1.5). */
export function stepPath(site: Pick<WorkSite, 'paths'>, path: keyof WorkPaths): Vec2[] {
  return site.paths[path] ?? site.paths.outline;
}

// ========================================
// TIMING
// ========================================
/**
 * Each of `count` moves' windows in a job of `duration` seconds (spec §1.9): the time before the
 * reattach (the last ATTACH_DURATION) splits equally. The first move's approach is the detach
 * (ATTACH_DURATION, at most DETACH_MAX_FRACTION of its share); each later move gets
 * min(MOVE_APPROACH_MAX_SECONDS, MOVE_APPROACH_FRACTION × its share) to reach its first targets.
 */
export function moveWindows(count: number, duration: number): MoveWindow[] {
  const share = (duration - ATTACH_DURATION) / count;
  return Array.from({ length: count }, (_, k) => {
    const approach = k * share;
    const flight = k === 0
      ? Math.min(ATTACH_DURATION, DETACH_MAX_FRACTION * share)
      : Math.min(MOVE_APPROACH_MAX_SECONDS, MOVE_APPROACH_FRACTION * share);
    return { approach, start: approach + flight, end: (k + 1) * share };
  });
}
