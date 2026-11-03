// ========================================
// IMPORTS
// ========================================
import type { LoadingRangeKey } from '../globalAudioSeedRanges';
import type { RobotSendField } from '../robotSends';
import type { WaveformType } from '../../types/Robot';
import type { OctaveRegisterId } from '../octaveRegisters';

// ========================================
// TYPES
// ========================================

/*
 * The band table under the themes (docs/specs/OFF_SCREEN.md assumption 15, §1.3): every value a FRESH world or robot may
 * seed, keyed by what it seeds. A band bounds a draw - getSeededVal maps the same noise into [min, max] - never what a
 * slider exposes or what the app can do; a theme or an aspect moves a band, never the draw. Four kinds: the three the
 * spec named, and the waveform pick (PickBand), the "ask first" of spec §3 that Crawford answered for the Voice family
 * on 2026-10-31 (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10).
 */

/** A plain band: a fresh draw lands in [min, max]. */
export interface RangeBand {
  min: number;
  max: number;
}

/**
 * A band a share of fresh robots carry: `lit` is the nominal share that draw from [min, max]; the rest seed the field's
 * plain value (a send of 0, a linear curve, the open filter, a quiet layer, no link). The send rows' shape, and the
 * shape of every minority trait spawnSystem.ts paired a threshold with a range: a glider's portamento, a shaped
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
 * the draw maps uniformly onto the whole numbers [min, max] (seedToggleValue, robotFieldDerivation.ts).
 */
export interface ToggleBand {
  offShare: number;
  min: number;
  max: number;
}

/**
 * A weighted pick (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): a fresh draw lands on option o with a share of
 * weights[o] / the total. The draw spans [0, total] and picks the first option, in the pick's own order, whose cumulative
 * weight it falls under (robotFieldDerivation.ts's pickWeighted), so five equal unit weights - cumulative edges 1 to 5 -
 * give exactly the index Math.floor of an even [0, 5] draw gave. A zero weight is never drawn. Two picks: the waveform,
 * and the octave register since docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6.
 */
export interface PickBand<O extends string = WaveformType> {
  weights: Record<O, number>;
}

/** The robot bands that are plain ranges, named for the robot field each seeds. */
export const ROBOT_RANGE_KEYS = [
  'robot.attack',
  'robot.decay',
  'robot.sustain',
  'robot.release',
  'robot.filterFreq',
  'robot.accentFilterQ',
  'robot.detune',
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

/** The weighted picks (PickBand): the waveform the base and the three Signature Array layers draw, and the octave
 *  register a robot's Octave Min and Max are dealt from (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6). */
export const ROBOT_PICK_KEYS = ['robot.waveform', 'robot.octaveRegister'] as const;

/**
 * The world keys outside the global chain's loading rows (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6): Humanize, the
 * timing scatter on every note, a plain range in ms; and the master low-pass cutoff's tie to the global LFO bank, a lit
 * band - the share of worlds whose tie is live, and its depth window in percent.
 */
export const WORLD_RANGE_KEYS = ['humanize'] as const;
export const WORLD_LIT_KEYS = ['lfoLink.lpf.frequency'] as const;

export type RobotRangeKey = (typeof ROBOT_RANGE_KEYS)[number];
export type RobotLitKey = (typeof ROBOT_LIT_KEYS)[number];
export type RobotToggleKey = (typeof ROBOT_TOGGLE_KEYS)[number];
export type RobotPickKey = (typeof ROBOT_PICK_KEYS)[number];
export type RobotBandKey = RobotRangeKey | RobotLitKey | RobotToggleKey | RobotPickKey;
export type WorldRangeKey = (typeof WORLD_RANGE_KEYS)[number];
export type WorldLitKey = (typeof WORLD_LIT_KEYS)[number];

/** Every key in the table: the tempo, the global chain's loading rows, the two world keys, the robot bands and the five
 *  sends. */
export type BandKey = 'bpm' | LoadingRangeKey | WorldRangeKey | WorldLitKey | RobotBandKey | RobotSendField;

/** The kind of band a key holds. */
export type BandFor<K extends BandKey> = K extends RobotToggleKey
  ? ToggleBand
  : K extends 'robot.octaveRegister'
    ? PickBand<OctaveRegisterId>
    : K extends RobotPickKey
      ? PickBand
      : K extends RobotLitKey | RobotSendField | WorldLitKey
        ? SendBand
        : RangeBand;

/** The whole table: one band per key, each of its key's kind. */
export type BandTable = { [K in BandKey]: BandFor<K> };
