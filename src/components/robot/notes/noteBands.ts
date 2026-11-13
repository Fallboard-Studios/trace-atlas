// ========================================
// noteBands (docs/specs/ROBOT_NOTE_CLOUD.md §1.7)
// ========================================
// Whether a robot's world cloud places notes: the battery's bands, or attention's wake. Pure.

import { NOTE_BATTERY_BANDS } from '../../../constants';

/** The battery's highest level: the band that ends here has no upper edge, so a full battery (or above) is in it. */
const FULL = 100;

/**
 * Whether the cloud places notes (§1.7, Crawford 2026-11-13): always while the robot is woken (pointed at or
 * selected since it last left its station); otherwise only while its battery is in one of NOTE_BATTERY_BANDS
 * (10–28%, 38–55%, 65–73%, 83–100%), each from its lower edge up to, not including, its upper one. A full battery (or
 * above) counts as the top band. A level below 0, or not a number, is in no band (every comparison with NaN is false).
 */
export function notesShown(batteryLevel: number, woken: boolean): boolean {
  if (woken) return true;
  return NOTE_BATTERY_BANDS.some(([low, high]) => batteryLevel >= low && (batteryLevel < high || high === FULL));
}
