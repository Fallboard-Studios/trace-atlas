import { SEND_MIN, SEND_MAX } from '../constants';

/** Clamp a 0..1 send fraction into [SEND_MIN, SEND_MAX]. A NaN has no sensible clamp and comes back as
 *  SEND_MIN, so callers that must not zero a send on a bad value check for NaN first. The one clamp every
 *  send path shares (docs/specs/ROBOT_SENDS.md §1.5): the actions, the store, the engine and the company snapshot. */
export function clampSend(fraction: number): number {
  if (Number.isNaN(fraction)) return SEND_MIN;
  return Math.max(SEND_MIN, Math.min(SEND_MAX, fraction));
}
