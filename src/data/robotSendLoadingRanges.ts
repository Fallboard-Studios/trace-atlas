import type { SendRoomKey } from './robotSends';

/**
 * The exclusive sends' seeding rules (docs/specs/ROBOT_EFFECT_SENDS.md assumption 7). The per-robot send bands themselves
 * live in the band table (src/data/bands/classic.ts, the `reverbSend`..`doubleSend` rows, with their history), and the
 * generator reads the loaded world's band through getBand(field) (src/data/bands/loadingContext.ts, generateRobotSends),
 * so a theme overrides a send row and nothing else about the sends.
 *
 * The send field list and its order are wiring, and live in robotSends.ts (docs/specs/ROBOT_SEND_TABLE.md assumption 1).
 */

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
