// ========================================
// IMPORTS
// ========================================
import type { LoadingRangeKey } from '../globalAudioSeedRanges';
import type { RobotSendField } from '../robotSends';
import type { WaveformType } from '../../types/Robot';

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
 * A weighted pick among the waveforms (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): a fresh draw lands on waveform w with
 * a share of weights[w] / the total. The draw spans [0, total] and picks the first waveform, in WAVEFORMS order, whose
 * cumulative weight it falls under (robotFieldDerivation.ts's pickWaveform), so Classic's five equal unit weights - cumulative
 * edges 1 to 5 - give exactly the index Math.floor of the old [0, 5] draw gave. A zero weight is never drawn.
 */
export interface PickBand {
  weights: Record<WaveformType, number>;
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

/** The weighted picks (PickBand): the waveform the base and the three Signature Array layers draw. */
export const ROBOT_PICK_KEYS = ['robot.waveform'] as const;

export type RobotRangeKey = (typeof ROBOT_RANGE_KEYS)[number];
export type RobotLitKey = (typeof ROBOT_LIT_KEYS)[number];
export type RobotToggleKey = (typeof ROBOT_TOGGLE_KEYS)[number];
export type RobotPickKey = (typeof ROBOT_PICK_KEYS)[number];
export type RobotBandKey = RobotRangeKey | RobotLitKey | RobotToggleKey | RobotPickKey;

/** Every key in the table: the tempo, the global chain's loading rows, the robot bands and the five sends. */
export type BandKey = 'bpm' | LoadingRangeKey | RobotBandKey | RobotSendField;

/** The kind of band a key holds. */
export type BandFor<K extends BandKey> = K extends RobotToggleKey
  ? ToggleBand
  : K extends RobotPickKey
    ? PickBand
    : K extends RobotLitKey | RobotSendField
      ? SendBand
      : RangeBand;

/** The whole table: one band per key, each of its key's kind. */
export type BandTable = { [K in BandKey]: BandFor<K> };
