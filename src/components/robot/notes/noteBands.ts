// ========================================
// noteBands (docs/specs/ROBOT_NOTE_CLOUD.md §1.7)
// ========================================
// Whether a robot's world cloud places notes: the battery's bands, or attention's wake. Pure.

import { NOTE_BATTERY_BAND } from '../../../constants';

/** The battery's highest level; a full battery counts as the top band. */
const FULL = 100;

/**
 * Whether the cloud places notes (§1.7, Crawford 2026-11-13): always while the robot is woken (pointed at or
 * selected since it last left its station); otherwise only while its battery is in an odd band of NOTE_BATTERY_BAND,
 * 10–20%, 30–40%, 50–60%, 70–80% and 90–100%, each from its lower edge up to, not including, its upper one. A full
 * battery (or above) counts as the top band; a level below 0 or not a number places none.
 */
export function notesShown(batteryLevel: number, woken: boolean): boolean {
  if (woken) return true;
  // A negative level gives a negative band and NaN gives NaN; neither leaves a remainder of 1, so both place none.
  const band = Math.floor(Math.min(batteryLevel, FULL - NOTE_BATTERY_BAND / 2) / NOTE_BATTERY_BAND);
  return band % 2 === 1;
}
