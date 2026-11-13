// ========================================
// noteStrength (docs/specs/ROBOT_NOTE_CLOUD.md §1.7)
// ========================================
// How strongly a robot's whole cloud shows: the opacity useNoteCloud eases its two layers to. Pure.

import { NOTE_BATTERY_FULL, NOTE_PEAK_STRENGTH } from '../../../constants';

/**
 * The cloud's strength (§1.7): NOTE_PEAK_STRENGTH down to NOTE_BATTERY_FULL, then a straight line to 0 at a flat
 * battery, so a robot recalled at 10% heads home at a fifth of the peak. The peak whenever the robot is woken
 * (pointed at or selected since it last left its station). Always inside 0 to the peak; a level that is not a
 * number counts as flat.
 */
export function noteStrength(batteryLevel: number, woken: boolean): number {
  if (woken) return NOTE_PEAK_STRENGTH;
  if (!Number.isFinite(batteryLevel)) return 0;
  return NOTE_PEAK_STRENGTH * Math.min(1, Math.max(0, batteryLevel / NOTE_BATTERY_FULL));
}
