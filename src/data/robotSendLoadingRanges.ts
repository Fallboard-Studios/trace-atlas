import type { RobotSendField } from './robotSends';

/**
 * The per-robot send bands (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6, §1.1): what a FRESH robot may seed for each
 * of its five sends, never what the slider exposes (that is SEND_MIN..SEND_MAX). One table for all five, so a theme
 * overrides it and nothing else about the sends.
 *
 * The Reverb and Delay rows are the old `reverb.wet` / `delay.wet` rows of GLOBAL_AUDIO_LOADING_RANGES (as merged by the
 * Classic Band Retune at 2dc5b4a2); they moved here at Robot Effect Sends T1 without moving a single seeded value. The
 * Delay's `lit` is the old quiet roll: a roll under 1 - lit (0.25, the deleted SEND_DELAY_QUIET_THRESHOLD) seeds 0.
 *
 * The send field list and its order are wiring, and live in robotSends.ts (docs/specs/ROBOT_SEND_TABLE.md assumption 1).
 */

export interface SendLoadingRange {
  min: number;
  max: number;
  /** The nominal share of fresh robots that carry this send at all; the rest seed exactly 0. 1 = everyone. */
  lit: number;
}

export const ROBOT_SEND_LOADING_RANGES: Record<RobotSendField, SendLoadingRange> = {
  // The old GLOBAL_AUDIO_LOADING_RANGES['reverb.wet'] row (widened from 0.1-0.4 by the Classic Band Retune, row 15).
  reverbSend: { min: 0.1, max: 0.6, lit: 1 },
  // The old 'delay.wet' row; 1 - lit is the old quiet threshold (0.25).
  delaySend: { min: 0, max: 0.3, lit: 0.75 },
  // Placeholders (spec assumption 6), tuned at the listen task (plan T20).
  gritSend: { min: 0.4, max: 0.8, lit: 0.21 },
  shimmerSend: { min: 0.2, max: 0.5, lit: 0.16 },
  doubleSend: { min: 0.3, max: 0.6, lit: 0.19 },
};

/** The three sends a fresh robot may carry at most one of, in the order they roll (spec assumption 7). */
export const EXCLUSIVE_SEND_FIELDS = ['gritSend', 'shimmerSend', 'doubleSend'] as const;
export type ExclusiveSendField = (typeof EXCLUSIVE_SEND_FIELDS)[number];

/** The room each exclusive send feeds: the Colour room (Grit), the Frequency Shifter (Shimmer), the Chorus (Double). These
 *  are the seeder's dataId segment (`robot.send.<room>`), and the engine's RoomKey is this type (bypassCell.ts). */
export type SendRoomKey = 'grit' | 'shimmer' | 'double';
export const SEND_FIELD_ROOM: Record<ExclusiveSendField, SendRoomKey> = {
  gritSend: 'grit',
  shimmerSend: 'shimmer',
  doubleSend: 'double',
};
