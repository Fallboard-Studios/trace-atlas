import { DECK_CAMERA_STATION_CHANCE } from '../constants/deckCamera';

/** chooseDeckCameraCutTarget's input — pure, `rand` injected (same shape as siteChoice.ts's
 *  SiteChoiceInput). */
export interface DeckCameraCutTargetInput {
  /** The robot whose lifecycle change ('active') is what makes this a "time to cut" moment —
   *  its own position is a station (departing or returning there). */
  triggerRobotId: string;
  /** Every other robot in the locale currently `activity === 'working'` a site, in any order. */
  workingRobotIds: readonly string[];
  /** A uniform [0, 1) draw. */
  rand: () => number;
}

/**
 * Which robot the deck camera cuts to on a lifecycle 'active' change: a station-departure moment
 * shows an empty port, so prefer a robot actually at work when one exists. Draws `rand` once for
 * the station/worker choice, and — only when workers exist and the station draw loses — once more
 * to pick among them. Station chosen `DECK_CAMERA_STATION_CHANCE` of the time even when workers
 * exist, and always when none do (never draws a wasted second time in that case).
 */
export function chooseDeckCameraCutTarget({ triggerRobotId, workingRobotIds, rand }: DeckCameraCutTargetInput): string {
  if (workingRobotIds.length === 0) return triggerRobotId;
  if (rand() < DECK_CAMERA_STATION_CHANCE) return triggerRobotId;
  return workingRobotIds[Math.floor(rand() * workingRobotIds.length)];
}
