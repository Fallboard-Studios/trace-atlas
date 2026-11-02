// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';
import type { AudioAttributes, WaveformType, EnvelopeCurveName, RobotFilterType } from '../types/Robot';
import { ENVELOPE_CURVE_NAMES } from '../types/Robot';
import type { ToggleValue } from '../engine/melodyGenerator';
import type { OscillatorLayer } from '../types/layeredAudio';
import { ROBOT_BUS_FILTER_Q, SEND_STEP_PERCENT } from '../constants';
import {
  EXCLUSIVE_SEND_FIELDS,
  SEND_FIELD_ROOM,
  type ExclusiveSendField,
} from '../data/robotSendLoadingRanges';
import type { RobotSendField } from '../data/robotSends';
import { getBand } from '../data/bands/loadingContext';
import type { BandTable, PickBand, ToggleBand } from '../data/bands/bandKeys';
import type { EnvelopeBandKey, MelodyBandKey, VoiceBandKey } from '../data/bands/aspects';
import type { RobotAudioBaseline } from './spawnSystem';
import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';

/*
 * A robot's seeded fields, family by family (docs/specs/OFF_SCREEN.md assumption 22; docs/tasks/OFF_SCREEN_REVISIONS.md
 * Tasks 8 and 10): each family's one derivation from a robot's own index under the bands it is handed - the loaded
 * world's at spawn (spawnSystem.ts, through the current...Bands readers), an aspect's in the deal (aspectDeal.ts) - so a
 * dealt robot is exactly what it would have been had it spawned under the aspect. Moved out of spawnSystem.ts unchanged
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R13); the articulation shares behind the envelope curves and the accent
 * filter are explained at spawnSystem.ts's ROBOT ARTICULATION note.
 */

// ========================================
// CONSTANTS AND DERIVATIONS
// ========================================
// Signature Array is a fixed 3-slot layer array (Roadmap Phase 9) — Baseline/Coaxial/Harmonic,
// replacing the old variable 1..MAX_LAYERS count.
const LAYER_COUNT = 3;
/** Mirrors the Signature Array Gain slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const LAYER_GAIN_STEP = 0.01;

/** Rounds each oscillator layer's Detune to a whole cent (SEEDED_SLIDER_VALUE_QUANTIZATION follow-up). */
const DETUNE_STEP = 1;

/** Share of accent robots that are bandpass rather than lowpass (never highpass: it would thin a robot out of the mix).
 *  A plain coin over the accent robots, not a band. */
const ACCENT_BANDPASS_SHARE = 0.4;
/** Mirrors the Resonance slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const FILTER_Q_STEP = 0.1;

/**
 * An envelope-curve draw: 'linear' (today's sound) for most robots, otherwise one of the six
 * non-linear names. Two draws — whether this robot shapes the stage at all, then which curve —
 * so the shaped share is set by `shapedThreshold` alone, not by the number of curves.
 */
function seedCurve(noiseMap: NoiseFunction2D, dataId: string, offset: number, shapedThreshold: number): EnvelopeCurveName {
  if (getUniformSeededVal(noiseMap, `${dataId}.shaped`, offset, 0, 1) >= shapedThreshold) return 'linear';
  const shapes = ENVELOPE_CURVE_NAMES.filter((name) => name !== 'linear');
  // Its own row (offset * 10 + 1, the layers' trick) dates from the bunched plain draw, whose neighbouring samples
  // came out low together and left half the curves unreachable. The even draw is independent at any offset; the row
  // stays because a draw keeps its dataId and offset (docs/specs/EVEN_SEEDED_DRAWS.md §3).
  const pick = Math.floor(getUniformSeededVal(noiseMap, `${dataId}.which`, offset * 10 + 1, 0, shapes.length));
  return shapes[Math.min(shapes.length - 1, pick)];
}

/**
 * Seed a Motif Length/Note Variance-shaped { active, value } field from one consolidated [0, 1) draw
 * (docs/specs/archive/STEPPER_TO_SLIDER.md) — replaces the old two-draw (separate active/value) scheme. `raw <
 * band.offShare` lands the field off (value: 0); the remaining `1 - offShare` span maps uniformly onto the whole
 * numbers band.min..band.max (1-8 under Classic: robot.rhythmicMotifLength and robot.noteVariance in the band table,
 * each its own row so the two fields stay independently tunable even though they currently agree). `active` is always
 * derived from the resulting `value > 0`, never drawn independently. The deal pass (Task 27) hands an aspect's band in.
 */
export function seedToggleValue(raw: number, band: ToggleBand): ToggleValue {
  if (raw < band.offShare) return { active: false, value: 0 };
  const fraction = (raw - band.offShare) / (1 - band.offShare); // 0..1 across the "on" span
  const span = band.max - band.min + 1; // the whole numbers min..max
  const value = band.min + Math.min(span - 1, Math.floor(fraction * span));
  return { active: true, value };
}

/** The four Melody fields a robot draws (docs/specs/MELODY_SYSTEM.md) - the Melody family's share of the deal. */
export type MelodyFields = Pick<RobotAudioBaseline, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat'>;

/** The theme's Melody bands as the loading context holds them now (getBand at the draw, band-table T21). */
export function currentMelodyBands(): Pick<BandTable, MelodyBandKey> {
  return {
    'robot.rhythmicDensity': getBand('robot.rhythmicDensity'),
    'robot.noteVariance': getBand('robot.noteVariance'),
    'robot.rhythmicMotifLength': getBand('robot.rhythmicMotifLength'),
    'robot.pitchRepeat': getBand('robot.pitchRepeat'),
  };
}

/**
 * The four Melody fields from a robot's own spawn index under `bands` - the theme's at spawn (currentMelodyBands), an
 * aspect's when the deal re-derives them (applyDealToBaselines: resolveBands(theme, { melody: aspect })). The same
 * noise, dataIds and formulas either way, so a dealt robot is exactly what it would have been had it spawned under the
 * aspect (docs/specs/OFF_SCREEN.md assumption 22). The toggle fields keep the old '.active' dataIds (the '.value' ones
 * are retired: value is derived from this same draw). Every draw is even (docs/specs/EVEN_SEEDED_DRAWS.md), so a
 * toggle's offShare is the share of robots with it off.
 */
export function deriveMelodyFields(noiseMap: NoiseFunction2D, spawnIndex: number, bands: Pick<BandTable, MelodyBandKey>): MelodyFields {
  const density = bands['robot.rhythmicDensity'];
  const rhythmicDensity = Math.round(getUniformSeededVal(noiseMap, 'robot.rhythmicDensity', spawnIndex, density.min, density.max));
  const motifRaw = getUniformSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', spawnIndex, 0, 1);
  const rhythmicMotifLength = seedToggleValue(motifRaw, bands['robot.rhythmicMotifLength']);
  const noteVarianceRaw = getUniformSeededVal(noiseMap, 'robot.noteVariance.active', spawnIndex, 0, 1);
  const noteVariance = seedToggleValue(noteVarianceRaw, bands['robot.noteVariance']);
  const repeat = bands['robot.pitchRepeat'];
  const pitchRepeat = Math.round(getUniformSeededVal(noiseMap, 'robot.pitchRepeat', spawnIndex, repeat.min, repeat.max));
  return { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat };
}

// Waveform types, in the pick's order (robot.waveform's PickBand: Classic's equal weights give ~20 % each, pulse included)
const WAVEFORMS: WaveformType[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];

/**
 * A waveform from a PickBand (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): one draw over [0, total weight] at `dataId` /
 * `offset`, landing on the first waveform in WAVEFORMS order whose cumulative weight it falls under. Classic's five unit
 * weights make this the same getSeededVal call the old pick made - [0, 5] - and its integer edges 1-5 the exact index
 * Math.floor gave, so no Classic robot changes waveform. A zero weight is never drawn; a draw at the very top of the
 * range (the simplex sample at its maximum) lands on the last waveform with a weight, as the old base draw's clamp
 * did, where the old layer draw would have indexed past the end.
 */
function pickWaveform(noiseMap: NoiseFunction2D, dataId: string, offset: number, band: PickBand): WaveformType {
  const total = WAVEFORMS.reduce((sum, wave) => sum + band.weights[wave], 0);
  const draw = getSeededVal(noiseMap, dataId, offset, 0, total);
  let edge = 0;
  for (const wave of WAVEFORMS) {
    edge += band.weights[wave];
    if (draw < edge) return wave;
  }
  return [...WAVEFORMS].reverse().find((wave) => band.weights[wave] > 0) ?? WAVEFORMS[WAVEFORMS.length - 1];
}

/** The theme's Envelope bands as the loading context holds them now (getBand at the draw, band-table T21). */
export function currentEnvelopeBands(): Pick<BandTable, EnvelopeBandKey> {
  return {
    'robot.attack': getBand('robot.attack'),
    'robot.decay': getBand('robot.decay'),
    'robot.sustain': getBand('robot.sustain'),
    'robot.release': getBand('robot.release'),
    'robot.shapedAttack': getBand('robot.shapedAttack'),
    'robot.shapedRelease': getBand('robot.shapedRelease'),
  };
}

/**
 * A robot's seeded ADSR envelope at `offset` under `bands` - the theme's at spawn (currentEnvelopeBands), an Envelope
 * aspect's when the deal re-derives it (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8: resolveBands(theme, { envelope })).
 * Extracted from generateAudioAttributes with its dataIds and offsets unchanged, so a dealt robot is exactly what it
 * would have been had it spawned under the aspect, and Classic parity holds. The curves are drawn first: a shaped stage
 * is seeded short, from its own band, whose `lit` is the shaped share (robot.shapedAttack, robot.shapedRelease).
 */
export function deriveEnvelopeFields(
  noiseMap: NoiseFunction2D,
  offset: number,
  bands: Pick<BandTable, EnvelopeBandKey>,
): AudioAttributes['adsr'] {
  const shapedAttack = bands['robot.shapedAttack'];
  const shapedRelease = bands['robot.shapedRelease'];
  const attackCurve = seedCurve(noiseMap, 'robot.audio.attackCurve', offset, shapedAttack.lit);
  const releaseCurve = seedCurve(noiseMap, 'robot.audio.releaseCurve', offset, shapedRelease.lit);
  const attackRange = attackCurve === 'linear' ? bands['robot.attack'] : shapedAttack;
  const releaseRange = releaseCurve === 'linear' ? bands['robot.release'] : shapedRelease;
  const decayRange = bands['robot.decay'];
  const sustainRange = bands['robot.sustain'];
  return {
    attack: getUniformSeededVal(noiseMap, 'robot.audio.attack', offset, attackRange.min, attackRange.max),
    decay: getUniformSeededVal(noiseMap, 'robot.audio.decay', offset, decayRange.min, decayRange.max),
    sustain: getUniformSeededVal(noiseMap, 'robot.audio.sustain', offset, sustainRange.min, sustainRange.max),
    release: getUniformSeededVal(noiseMap, 'robot.audio.release', offset, releaseRange.min, releaseRange.max),
    attackCurve,
    releaseCurve,
  };
}

/** The theme's Voice bands as the loading context holds them now (getBand at the draw, band-table T21). */
export function currentVoiceBands(): Pick<BandTable, VoiceBandKey> {
  return {
    'robot.waveform': getBand('robot.waveform'),
    'robot.filterFreq': getBand('robot.filterFreq'),
    'robot.accentFilterFreq': getBand('robot.accentFilterFreq'),
    'robot.accentFilterQ': getBand('robot.accentFilterQ'),
    'robot.layerGain': getBand('robot.layerGain'),
  };
}

/** The voice a robot draws: its bus filter, its base waveform and its fixed 3-layer Signature Array. */
type VoiceFields = Pick<AudioAttributes, 'filterFreq' | 'filterQ' | 'filterType' | 'waveform' | 'layers'>;

/**
 * A robot's seeded voice at `offset` under `bands` - the theme's at spawn (currentVoiceBands), a Voice aspect's when the
 * deal re-derives it (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10: resolveBands(theme, { voice })). Extracted from
 * generateAudioAttributes with its dataIds and offsets unchanged: the bus filter (an accent robot a darker, resonant one,
 * lowpass or bandpass; the cutoff keeps its own dataId in both tiers), the base waveform and the three layers (type, gain,
 * detune, phase), the waveforms now picked through the robot.waveform PickBand (pickWaveform). The layers' detune and
 * phase follow no band and re-derive unchanged.
 */
export function deriveVoiceFields(noiseMap: NoiseFunction2D, offset: number, bands: Pick<BandTable, VoiceBandKey>): VoiceFields {
  // Seeded bus filter (determines detail level): a common robot is an open lowpass, an accent robot
  // a darker, resonant one (lowpass or bandpass). The cutoff keeps its own dataId in both tiers.
  // The accent band's `lit` is the accent share (robot.accentFilterFreq); the open cutoff and the accent Q are bands too.
  const accentFilter = bands['robot.accentFilterFreq'];
  const accent = getSeededVal(noiseMap, 'robot.audio.filter.accent', offset, 0, 1) < accentFilter.lit;
  const filterRange = accent ? accentFilter : bands['robot.filterFreq'];
  const filterFreq = getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, filterRange.min, filterRange.max);
  const accentQ = bands['robot.accentFilterQ'];
  const filterQ = accent
    ? quantizeToStep(getSeededVal(noiseMap, 'robot.audio.filterQ', offset, accentQ.min, accentQ.max), 0, FILTER_Q_STEP)
    : ROBOT_BUS_FILTER_Q;
  const filterType: RobotFilterType = accent && getSeededVal(noiseMap, 'robot.audio.filter.type', offset, 0, 1) < ACCENT_BANDPASS_SHARE
    ? 'bandpass'
    : 'lowpass';

  // Seeded waveform, through the pick (~20 % each under Classic)
  const waveform = pickWaveform(noiseMap, 'robot.audio.waveform', offset, bands['robot.waveform']);

  // Generate the fixed 3-layer Signature Array (Baseline/Coaxial/Harmonic, Roadmap Phase 9).
  // There is no per-layer ADSR anymore — every layer shares the one `adsr` envelope.
  const layers: OscillatorLayer[] = [];
  const layerGain = bands['robot.layerGain'];
  for (let i = 0; i < LAYER_COUNT; i++) {
    const layerOffset = offset * 10 + i;
    // Baseline (layers[0]) always seeds a real, audible gain from the band; Coaxial/Harmonic (layers[1]/[2]) each go
    // quiet on a draw under 1 - the band's `lit` (a plain 50/50 under Classic), forcing gain to 0 instead of sampling
    // one — muting doesn't discard the rest of the layer's configuration (see AudioEngine.ts's filterAudibleLayers),
    // so a muted layer still gets a full, ready-to-resume config here.
    const quiet = i !== 0 && getSeededVal(noiseMap, 'robot.audio.layer.quiet', layerOffset, 0, 1) < 1 - layerGain.lit;
    const layerWave: OscillatorLayer = {
      type: pickWaveform(noiseMap, 'robot.audio.layer.waveform', layerOffset, bands['robot.waveform']),
      gain: quiet ? 0 : quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.gain', layerOffset, layerGain.min, layerGain.max), 0, LAYER_GAIN_STEP),
      detune: quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.detune', layerOffset, -2, 2), 0, DETUNE_STEP),
      phase: Math.floor(getSeededVal(noiseMap, 'robot.audio.layer.phase', layerOffset, 0, 361)) || 0,
    };
    layers.push(layerWave);
  }
  return { filterFreq, filterQ, filterType, waveform, layers };
}

/** A send fraction quantized in percent space (the Volume shape), so the stored value sits on the slider's
 *  1 % grid and never on a sub-percent one. */
function quantizeSend(raw: number): number {
  return quantizeToStep(raw * 100, 0, SEND_STEP_PERCENT) / 100;
}

/** The five send bands as the loading context holds them now (getBand at the draw, band-table T22). */
export function currentSendBands(): Pick<BandTable, RobotSendField> {
  return {
    reverbSend: getBand('reverbSend'),
    delaySend: getBand('delaySend'),
    gritSend: getBand('gritSend'),
    shimmerSend: getBand('shimmerSend'),
    doubleSend: getBand('doubleSend'),
  };
}

/** Turn the four raw draws into the two stored sends: a quiet roll under 1 - the row's `lit` leaves the robot without
 *  that send at all - the Delay row's 0.25 under Classic; the Reverb row's lit of 1 is never quiet, so its roll, added at
 *  band-table T22 so a theme's Reverb share is honoured like every other row's, moves no Classic robot. The bands are the
 *  caller's: the loaded world's (currentSendBands) at spawn, a Distance aspect's in the deal. Shared by the noise-map draw
 *  and spawnRobot's alea fallback. */
export function composeSends(
  reverbRaw: number,
  delayRaw: number,
  reverbQuietRoll: number,
  delayQuietRoll: number,
  bands: Pick<BandTable, RobotSendField>,
): { reverbSend: number; delaySend: number } {
  return {
    reverbSend: reverbQuietRoll < 1 - bands.reverbSend.lit ? 0 : quantizeSend(reverbRaw),
    delaySend: delayQuietRoll < 1 - bands.delaySend.lit ? 0 : quantizeSend(delayRaw),
  };
}

/**
 * The three effect room sends from their uniform draws (docs/specs/ROBOT_EFFECT_SENDS.md assumption 7): in the order
 * Grit -> Shimmer -> Double, a send lands when its roll is under its row's `lit`, unless an earlier one of the three
 * already landed; a landed send is its value draw mapped into its band, on the 1 % grid. The rest are exactly 0. Both
 * draws of every send are taken by the caller before this runs, so the draw set never depends on what lands. The bands
 * are the caller's, as composeSends' are.
 */
export function composeExclusiveSends(
  draw: Record<ExclusiveSendField, { roll: number; t: number }>,
  bands: Pick<BandTable, RobotSendField>,
): Record<ExclusiveSendField, number> {
  const sends = { gritSend: 0, shimmerSend: 0, doubleSend: 0 };
  let taken = false;
  for (const field of EXCLUSIVE_SEND_FIELDS) {
    const band = bands[field];
    if (draw[field].roll < band.lit && !taken) {
      sends[field] = quantizeSend(band.min + draw[field].t * (band.max - band.min));
      taken = true;
    }
  }
  return sends;
}

/**
 * A robot's five seeded sends at `offset` under `bands` - the loaded world's at spawn (generateRobotSends), a Distance
 * aspect's when the deal re-derives them (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8: resolveBands(theme, { distance })).
 * Extracted from generateRobotSends with its dataIds, offsets and draw order unchanged, so a dealt robot is exactly what
 * it would have been had it spawned under the aspect. The three effect room sends are re-derived too and come out as
 * they were: a Distance column cannot name them (DISTANCE_BAND_KEYS).
 */
export function deriveSendFields(
  noiseMap: NoiseFunction2D,
  offset: number,
  bands: Pick<BandTable, RobotSendField>,
): Record<RobotSendField, number> {
  const reverb = bands.reverbSend;
  const delay = bands.delaySend;
  const firstTwo = composeSends(
    getSeededVal(noiseMap, 'robot.send.reverb', offset, reverb.min, reverb.max),
    getSeededVal(noiseMap, 'robot.send.delay', offset, delay.min, delay.max),
    getSeededVal(noiseMap, 'robot.send.reverb.quiet', offset, 0, 1),
    getSeededVal(noiseMap, 'robot.send.delay.quiet', offset, 0, 1),
    bands,
  );
  const draw = (field: ExclusiveSendField) => {
    const room = SEND_FIELD_ROOM[field];
    return {
      roll: getUniformSeededVal(noiseMap, `robot.send.${room}.lit`, offset),
      t: getUniformSeededVal(noiseMap, `robot.send.${room}`, offset),
    };
  };
  return {
    ...firstTwo,
    ...composeExclusiveSends({ gritSend: draw('gritSend'), shimmerSend: draw('shimmerSend'), doubleSend: draw('doubleSend') }, bands),
  };
}
