import type { Robot } from '../types/Robot';

/**
 * The per-robot send wiring table (docs/specs/ROBOT_SEND_TABLE.md §1.1): one row per send, naming the robot field, the
 * key AudioEngine.updateRobotSends takes, the share-link code and the content key of its slider's words. Every consumer
 * that once spelled the five out iterates this. The seeding bands are tuning, not wiring, and stay in
 * robotSendLoadingRanges.ts (spec assumption 1). Nothing Tone-shaped lives here.
 */

/** The five per-robot sends in the one order every consumer uses: the prime, the engine write, the screen rows, the share
 *  codec's keys and the swell pool's tail (spec assumption 2). A sixth send is a new row of ROBOT_SENDS. */
export const ROBOT_SEND_FIELDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
export type RobotSendField = (typeof ROBOT_SEND_FIELDS)[number];

/** The three effect rooms a send can feed: the Colour room (Grit), the Frequency Shifter (Shimmer), the Chorus (Double).
 *  The engine's RoomKey is this type (bypassCell.ts), and the seeder's dataId segment (`robot.send.<room>`,
 *  robotSendLoadingRanges.ts) reads it from here, so the bands depend on the table and never the reverse. */
export type SendRoomKey = 'grit' | 'shimmer' | 'double';

/** The key AudioEngine.updateRobotSends takes for a send: the two fixed rooms by name, the three effect rooms by RoomKey.
 *  The engine speaks these; robots, screens, the store and the swell tick speak RobotSendField (spec assumption 3). */
export type SendEngineKey = 'reverb' | 'delay' | SendRoomKey;

/** Whether a send feeds one of the three effect rooms (each lit only while some robot feeds it), rather than the fixed
 *  Reverb or Delay room. */
export function isRoomSendKey(key: SendEngineKey): key is SendRoomKey {
  return key !== 'reverb' && key !== 'delay';
}
/** The send's key in a share link's CompactRobotOverrideDiff (docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md). */
export type SendShareCode = 'rs' | 'ds' | 'gr' | 'sm' | 'db';

export interface RobotSendSpec {
  readonly field: RobotSendField;
  readonly engineKey: SendEngineKey;
  readonly shareCode: SendShareCode;
  /** Written as a literal, never built from `field`: the content guard finds a key by its quoted text in source. */
  readonly contentKey: `probe.${RobotSendField}`;
}

export const ROBOT_SENDS: readonly RobotSendSpec[] = [
  { field: 'reverbSend', engineKey: 'reverb', shareCode: 'rs', contentKey: 'probe.reverbSend' },
  { field: 'delaySend', engineKey: 'delay', shareCode: 'ds', contentKey: 'probe.delaySend' },
  { field: 'gritSend', engineKey: 'grit', shareCode: 'gr', contentKey: 'probe.gritSend' },
  { field: 'shimmerSend', engineKey: 'shimmer', shareCode: 'sm', contentKey: 'probe.shimmerSend' },
  { field: 'doubleSend', engineKey: 'double', shareCode: 'db', contentKey: 'probe.doubleSend' },
];

export const ROBOT_SEND_BY_FIELD = Object.fromEntries(
  ROBOT_SENDS.map((spec) => [spec.field, spec])
) as Readonly<Record<RobotSendField, RobotSendSpec>>;

/** The one translation from the robot's keys to the engine's. Nothing maps back: the engine never names a field. */
export function engineKeyOf(field: RobotSendField): SendEngineKey {
  return ROBOT_SEND_BY_FIELD[field].engineKey;
}

/** The prime every reservation site hands updateRobotSends: all five, in table order, straight off the robot. No clamp and
 *  no NaN filter here; updateRobotSends does both. */
export function robotSendLevels(robot: Pick<Robot, RobotSendField>): Record<SendEngineKey, number> {
  const levels = {} as Record<SendEngineKey, number>;
  for (const spec of ROBOT_SENDS) levels[spec.engineKey] = robot[spec.field];
  return levels;
}
