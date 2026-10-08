// ========================================
// IMPORTS
// ========================================
import { JOB_BASE_MAX_SECONDS, JOB_BASE_MIN_SECONDS } from '../../constants';

// ========================================
// JOB DURATION (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================

/** The tempo range jobDuration spans; outside it the duration clamps. */
const SLOWEST_BPM = 20;
const FASTEST_BPM = 200;

/**
 * How long one job run lasts, in seconds, at `bpm`: JOB_BASE_MAX_SECONDS at 20 BPM down to
 * JOB_BASE_MIN_SECONDS at 200 BPM, linear, clamped outside that range. The detach and reattach
 * flights sit inside it (Task 0b). Orbiter count no longer plays a part. Pure — the loop sim and the
 * job timeline (Task 19) both read it.
 */
export function jobDuration(bpm: number): number {
  const t = Math.min(1, Math.max(0, (bpm - SLOWEST_BPM) / (FASTEST_BPM - SLOWEST_BPM)));
  return JOB_BASE_MAX_SECONDS + (JOB_BASE_MIN_SECONDS - JOB_BASE_MAX_SECONDS) * t;
}
