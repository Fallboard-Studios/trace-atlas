// ========================================
// STATION OCCUPANCY (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 20)
// ========================================
// Which robots a station's slot lights show. One primitive string per station, so a Zustand
// selector over the whole roster only re-renders the station when its own lit set changes —
// never on another robot's battery tick or position write (spec §1.12).

// ========================================
// IMPORTS
// ========================================
import type { Robot, RobotActivity } from '@/types/Robot';

// ========================================
// TYPES
// ========================================
/** `stationId` and `activity` arrive on Robot with their writer (Task 21); read optionally here. */
type MaybeStationed = Pick<Robot, 'identityColor'> & { stationId?: string; activity?: RobotActivity };

// ========================================
// API
// ========================================
/**
 * The identity colours of the robots charging at `stationId` (activity 'charging'), in roster
 * order, comma-joined — '' when none. Slots light back to front in this order.
 */
export function chargingColorsKey(robots: readonly MaybeStationed[] | undefined, stationId: string): string {
  if (!robots) return '';
  return robots
    .filter((r) => r.stationId === stationId && r.activity === 'charging')
    .map((r) => r.identityColor)
    .join(',');
}

/** The colour list back out of a key. */
export function parseColorsKey(key: string): string[] {
  return key ? key.split(',') : [];
}
