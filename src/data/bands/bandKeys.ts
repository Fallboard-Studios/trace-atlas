// ========================================
// IMPORTS
// ========================================
import type { LoadingRangeKey } from '../globalAudioSeedRanges';
import type { RobotSendField } from '../robotSends';

// ========================================
// TYPES
// ========================================

/*
 * The band table under the themes (docs/specs/OFF_SCREEN.md assumption 15, §1.3): every value a FRESH world or robot may
 * seed, keyed by what it seeds. A band bounds a draw - getSeededVal maps the same noise into [min, max] - never what a
 * slider exposes or what the app can do; a theme or an aspect moves a band, never the draw. Three kinds, no more
 * (a fourth is an "ask first", spec §3).
 */

/** A plain band: a fresh draw lands in [min, max]. */
export interface RangeBand {
  min: number;
  max: number;
}

/**
 * A band a share of fresh robots carry: `lit` is the nominal share that draw from [min, max]; the rest seed the field's
 * plain value (a send of 0, a linear curve, the open filter, a quiet layer, no link). ROBOT_SEND_LOADING_RANGES's shape,
 * and the shape of every minority trait spawnSystem.ts paired a threshold with a range: a glider's portamento, a shaped
 * stage's short range, the accent cutoff, the Coaxial/Harmonic gain, the three LFO depth windows. The generator keeps
 * its own comparison - a trait lands on a draw under `lit`, a layer or a link goes quiet on a draw under 1 - `lit` - so
 * the share reads the same way in every row. Nominal, because the robot draws are bell-curved simplex samples, not
 * coins; spawnSystem.ts's threshold comments record the measured rates.
 */
export interface SendBand {
  min: number;
  max: number;
  lit: number;
}

/**
 * A 1-8 toggle field (Motif Length, Note Variance): a draw under `offShare` lands the field off (value 0); the rest of
 * the draw maps uniformly onto the whole numbers [min, max] (seedToggleValue, spawnSystem.ts).
 */
export interface ToggleBand {
  offShare: number;
  min: number;
  max: number;
}

/** The robot bands that are plain ranges, named for the robot field each seeds. */
export const ROBOT_RANGE_KEYS = [
  'robot.attack',
  'robot.decay',
  'robot.sustain',
  'robot.release',
  'robot.filterFreq',
  'robot.accentFilterQ',
  'robot.masterVolume',
  'robot.rhythmicDensity',
  'robot.pitchRepeat',
  'robot.dynamics',
  'robot.rests',
  'robot.accents',
] as const;

/** The robot bands a share of robots carry (SendBand): the minority traits and the LFO depth windows. */
export const ROBOT_LIT_KEYS = [
  'robot.shapedAttack',
  'robot.shapedRelease',
  'robot.portamento',
  'robot.accentFilterFreq',
  'robot.layerGain',
  'robot.lfoGainDepth',
  'robot.lfoDetuneDepth',
  'robot.lfoBusDepth',
] as const;

/** The two 1-8 toggle fields (ToggleBand). */
export const ROBOT_TOGGLE_KEYS = ['robot.rhythmicMotifLength', 'robot.noteVariance'] as const;

export type RobotRangeKey = (typeof ROBOT_RANGE_KEYS)[number];
export type RobotLitKey = (typeof ROBOT_LIT_KEYS)[number];
export type RobotToggleKey = (typeof ROBOT_TOGGLE_KEYS)[number];
export type RobotBandKey = RobotRangeKey | RobotLitKey | RobotToggleKey;

/** Every key in the table: the tempo, the global chain's loading rows, the robot bands and the five sends. */
export type BandKey = 'bpm' | LoadingRangeKey | RobotBandKey | RobotSendField;

/** The kind of band a key holds. */
export type BandFor<K extends BandKey> = K extends RobotToggleKey
  ? ToggleBand
  : K extends RobotLitKey | RobotSendField
    ? SendBand
    : RangeBand;

/** The whole table: one band per key, each of its key's kind. */
export type BandTable = { [K in BandKey]: BandFor<K> };
