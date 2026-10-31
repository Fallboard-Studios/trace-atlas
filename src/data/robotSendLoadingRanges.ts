import { CLASSIC } from './bands/classic';
import { ROBOT_SEND_FIELDS, type RobotSendField, type SendRoomKey } from './robotSends';

/**
 * Classic's per-robot send bands, by name (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6, §1.1; docs/specs/OFF_SCREEN.md
 * assumption 15, band-table T22): what a FRESH robot may seed for each of its five sends, never what the slider exposes
 * (that is SEND_MIN..SEND_MAX). The rows live in the band table (src/data/bands/classic.ts), with their history; this
 * file projects them for the grid and the tests. The generators read the loaded world's band through getBand(field)
 * (src/data/bands/loadingContext.ts, generateRobotSends), so a theme overrides a send row and nothing else about the sends.
 *
 * The Reverb and Delay rows are the old `reverb.wet` / `delay.wet` rows of the global loading table (as merged by the
 * Classic Band Retune at 2dc5b4a2); they moved here at Robot Effect Sends T1 without moving a single seeded value. Each
 * row's `lit` is rolled against 1 - lit: the Delay's is the old quiet roll (a roll under 0.25, the deleted
 * SEND_DELAY_QUIET_THRESHOLD, seeds 0); the Reverb's 1 never goes quiet.
 *
 * The send field list and its order are wiring, and live in robotSends.ts (docs/specs/ROBOT_SEND_TABLE.md assumption 1).
 */

export interface SendLoadingRange {
  min: number;
  max: number;
  /** The nominal share of fresh robots that carry this send at all; the rest seed exactly 0. 1 = everyone. */
  lit: number;
}

export const ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, SendLoadingRange> = Object.fromEntries(
  ROBOT_SEND_FIELDS.map((field) => [field, CLASSIC[field]]),
) as Record<RobotSendField, SendLoadingRange>;

/** The three sends a fresh robot may carry at most one of, in the order they roll (spec assumption 7). */
export const EXCLUSIVE_SEND_FIELDS = ['gritSend', 'shimmerSend', 'doubleSend'] as const;
export type ExclusiveSendField = (typeof EXCLUSIVE_SEND_FIELDS)[number];

/** The room each exclusive send feeds (SendRoomKey, robotSends.ts). These are the seeder's dataId segment
 *  (`robot.send.<room>`). */
export const SEND_FIELD_ROOM: Record<ExclusiveSendField, SendRoomKey> = {
  gritSend: 'grit',
  shimmerSend: 'shimmer',
  doubleSend: 'double',
};
