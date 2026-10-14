import { ROBOT_BUS_FILTER_Q } from '@/constants';
import { ROBOT_FILTER_TYPES, type RobotFilterType } from '@/types/Robot';

/**
 * Per-robot bus low-pass cutoff used when a caller passes no `filterFreq` — the value every bus
 * filter was hardcoded to from the composite-voice rewrite until the robot's own seeded
 * `audioAttributes.filterFreq` was wired through (it drove body detail/greeble count the whole
 * time, but never the sound). Sits inside spawnSystem's ACCENT_FILTER_FREQ_RANGE (400–2500 Hz).
 */
const ROBOT_BUS_FILTER_DEFAULT_HZ = 1200;
/** `filterFreq: 0` means "no filter" (Robot.ts) — open the low-pass to the top of the audible band. */
const ROBOT_BUS_FILTER_OPEN_HZ = 20000;

/** Resolve a robot's bus-filter cutoff from its `filterFreq`, honouring the two special cases above. */
export function resolveBusFilterCutoff(filterFreq: number | undefined): number {
  if (filterFreq === undefined || Number.isNaN(filterFreq)) return ROBOT_BUS_FILTER_DEFAULT_HZ;
  if (filterFreq <= 0) return ROBOT_BUS_FILTER_OPEN_HZ;
  return filterFreq;
}

/** Resolve a robot's bus-filter resonance from its `filterQ`; absent or NaN keeps today's fixed Q. */
export function resolveBusFilterQ(filterQ: number | undefined): number {
  if (filterQ === undefined || Number.isNaN(filterQ)) return ROBOT_BUS_FILTER_Q;
  return filterQ;
}

/** Resolve a robot's bus-filter type from its `filterType`; absent or unrecognised (a stale payload) stays lowpass. */
export function resolveBusFilterType(filterType: RobotFilterType | undefined): RobotFilterType {
  return filterType !== undefined && ROBOT_FILTER_TYPES.includes(filterType) ? filterType : 'lowpass';
}
