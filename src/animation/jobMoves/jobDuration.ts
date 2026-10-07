// ========================================
// IMPORTS
// ========================================
import type { JobType } from '../../types/Robot';
import { JOB_BASE_SECONDS, JOB_MIN_SECONDS, JOB_WORK_RATE } from '../../constants';

// ========================================
// JOB DURATION (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================

/**
 * How long one job run lasts, in seconds, for `orbiterCount` orbiters (orbiterDials().count, 1–4):
 * more orbiters, faster work, floored at JOB_MIN_SECONDS. Pure — the loop sim (Task 15) and the job
 * timeline (Task 19) both read it.
 */
export function jobDuration(job: JobType, orbiterCount: number): number {
  return Math.max(JOB_MIN_SECONDS, JOB_BASE_SECONDS - JOB_WORK_RATE[job] * orbiterCount);
}
