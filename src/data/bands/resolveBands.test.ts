// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';

import {
  ENVELOPE_ATTACK_MIN_SECONDS,
  ENVELOPE_RELEASE_MIN_SECONDS,
  ENVELOPE_TIME_MAX_SECONDS,
  HUMANIZE_MAX_MS,
  HUMANIZE_MIN_MS,
  PERFORMANCE_MAX,
  PERFORMANCE_MIN,
  PORTAMENTO_MAX,
  PORTAMENTO_MIN,
  SEND_MAX,
  SEND_MIN,
} from '../../constants';
import { GLOBAL_AUDIO_SEED_RANGES, type LoadingRangeKey } from '../globalAudioSeedRanges';
import { ROBOT_SEND_FIELDS } from '../robotSends';
import { LFO_DEPTH_MAX, LFO_DEPTH_MIN } from '../../types/lfo';
import { overlayBands, resolveBands } from './resolveBands';
import { CLASSIC } from './classic';
import {
  ROBOT_LIT_KEYS,
  ROBOT_PICK_KEYS,
  ROBOT_RANGE_KEYS,
  ROBOT_TOGGLE_KEYS,
  WORLD_LIT_KEYS,
  WORLD_RANGE_KEYS,
  type BandKey,
  type BandTable,
  type RangeBand,
  type RobotPickKey,
  type SendBand,
  type ToggleBand,
} from './bandKeys';
import { THEME_IDS, THEMES, isThemeId, themeLights, type ThemeColumn, type ThemeId } from './themes';
import { ASPECT_FAMILIES, ASPECT_FAMILY_IDS, ASPECT_IDS_BY_FAMILY, type AspectFamilyId, type AspectId, type AspectIdOf } from './aspects';
import type { RobotAspects } from './dealAspects';
import type { LoadingIdentity } from './loadingIdentity';
import type { Robot } from '../../types/Robot';

// ========================================
// MOCKS
// ========================================

// The overlay direction is proved on injected columns, whatever the real columns hold (docs/tasks/
// THEME_AND_ASPECTS_REFINEMENT.md T8 writes them, the listens tune them): Float moves bpm, Hypnotic moves noteVariance,
// and an injected EMPTY column (Anchor, Wandering) proves silence. Tide is injected with a global row and a robot lit
// key (T5: a theme column is any part of the band table), typed as a column so a narrower ThemeColumn fails to compile.
// The originals are spread, so every other export is the real one; the real columns are read below through
// vi.importActual.
const injected = vi.hoisted(() => ({
  float: { bpm: { min: 150, max: 160 } },
  tide: {
    'reverb.decay': { min: 6, max: 8 },
    'robot.portamento': { min: 0.3, max: 0.6, lit: 0.8 },
  } satisfies ThemeColumn,
  hypnotic: { 'robot.noteVariance': { offShare: 0, min: 1, max: 2 } },
  gliding: { 'robot.portamento': { min: 0.5, max: 0.9, lit: 0.9 } },
  dramatic: { 'robot.dynamics': { min: 85, max: 100 }, 'robot.accents': { min: 70, max: 90 } },
}));

vi.mock('./themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./themes')>();
  return { ...actual, THEMES: { ...actual.THEMES, float: injected.float, anchor: {}, tide: injected.tide } };
});

vi.mock('./aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./aspects')>();
  const { melody, motion, performance } = actual.ASPECT_FAMILIES;
  return {
    ...actual,
    ASPECT_FAMILIES: {
      ...actual.ASPECT_FAMILIES,
      melody: { ...melody, options: { ...melody.options, hypnotic: injected.hypnotic, wandering: {} } },
      // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b: the two new families' options are `{}` until T9.
      motion: { ...motion, options: { ...motion.options, gliding: injected.gliding } },
      performance: { ...performance, options: { ...performance.options, dramatic: injected.dramatic } },
    },
  };
});

// The real columns, unmocked, for the placeholder checks (plan Task 34) at the end of this file.
const realThemes = await vi.importActual<typeof import('./themes')>('./themes');
const realAspects = await vi.importActual<typeof import('./aspects')>('./aspects');

// ========================================
// FIXTURES
// ========================================

// Classic parity (docs/specs/OFF_SCREEN.md §5.2): every band a fresh world seeds from, typed in here from the constants
// as they stood on main at cc9a01f2 (the spec's survey, 2026-10-30), NOT read from the table under test. A lift that
// moves a value, drops a key or adds one fails here. Global rows: GLOBAL_AUDIO_LOADING_RANGES (the GLOBAL_CHAIN_GRID.md
// Loading Range column); tempo: BPM_SEED_RANGE; robots: spawnSystem.ts's module constants; sends: ROBOT_SEND_LOADING_RANGES.
const EXPECTED: BandTable = {
  // Tempo (bpmSeed.ts BPM_SEED_RANGE).
  bpm: { min: 40, max: 100 },

  // The global chain (GLOBAL_AUDIO_LOADING_RANGES).
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },
  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  'filterHPF.frequency': { min: 20, max: 120 },
  'filterHPF.Q': { min: 0.1, max: 5 },
  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  'compressor.threshold': { min: -36, max: -18 },
  'compressor.ratio': { min: 2, max: 6 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.25, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },
  'limiter.threshold': { min: -3, max: -1 },
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.1, max: 0.2 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.1, max: 0.2 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.1, max: 0.2 },
  'autoWah.baseFrequency': { min: 50, max: 250 },
  'autoWah.octaves': { min: 2.5, max: 5 },
  'autoWah.sensitivity': { min: -20, max: -5 },
  'autoWah.Q': { min: 2, max: 6 },
  'autoWah.gain': { min: 2, max: 6 },
  'autoWah.follower': { min: 0.1, max: 0.4 },
  'autoWah.wet': { min: 0.35, max: 0.5 },
  'phaser.rate': { min: 0.1, max: 2.5 },
  'phaser.octaves': { min: 2, max: 5 },
  'phaser.baseFrequency': { min: 200, max: 800 },
  'phaser.stages': { min: 4, max: 12 },
  'phaser.Q': { min: 1, max: 10 },
  'phaser.wet': { min: 0.3, max: 0.4 },
  'chorus.rate': { min: 0.2, max: 2 },
  'chorus.delayTime': { min: 6, max: 15 },
  'chorus.depth': { min: 0.3, max: 0.7 },
  'chorus.spread': { min: 90, max: 180 },
  'chorus.feedback': { min: 0, max: 0.2 },
  'tremolo.rate': { min: 0.5, max: 6 },
  'tremolo.depth': { min: 0.3, max: 0.7 },
  'tremolo.spread': { min: 90, max: 180 },
  'tremolo.wet': { min: 0.35, max: 0.5 },
  'vibrato.rate': { min: 2, max: 7 },
  'vibrato.depth': { min: 0.03, max: 0.12 },
  'vibrato.wet': { min: 0.85, max: 1 },
  'frequencyShifter.shift': { min: 2, max: 20 },
  'stereoWidener.width': { min: 0.4, max: 0.65 },

  // Two world keys new at docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6, each its draw as it stood (main at 3c188fec):
  // humanize HUMANIZE_SEED_RANGE; the master low-pass cutoff's global LFO link GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE
  // with 1 - LFO_QUIET_THRESHOLD (0.34) as its lit share.
  humanize: { min: 2, max: 6 },
  'lfoLink.lpf.frequency': { min: 5, max: 60, lit: 0.66 },

  // Robots (spawnSystem.ts). ATTACK/DECAY/SUSTAIN/RELEASE_RANGE (to ENVELOPE_TIME_MAX_SECONDS, 0-1); Attack and Release
  // start at their sliders' floors (15 ms, 20 ms: shorter edges click).
  'robot.attack': { min: 0.015, max: 2 },
  'robot.decay': { min: 0, max: 2 },
  'robot.sustain': { min: 0, max: 1 },
  'robot.release': { min: 0.02, max: 2 },
  // SHAPED_ATTACK/RELEASE_RANGE with the shaped share as the lit share (Even Seeded Draws T4: the edge is the share).
  'robot.shapedAttack': { min: 0.03, max: 0.25, lit: 0.155 },
  'robot.shapedRelease': { min: 0.15, max: 0.8, lit: 0.15 },
  // PORTAMENTO_SEED_RANGE with GLIDER_THRESHOLD as the lit share.
  'robot.portamento': { min: 0.05, max: 0.2, lit: 0.125 },
  // OPEN_FILTER_FREQ_RANGE; ACCENT_FILTER_FREQ_RANGE with FILTER_ACCENT_THRESHOLD; ACCENT_FILTER_Q_RANGE.
  'robot.filterFreq': { min: 2000, max: 8000 },
  'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.2 },
  'robot.accentFilterQ': { min: 3, max: 8 },
  // The Coaxial/Harmonic gain draw (0.2-1.2) with LAYER_QUIET_THRESHOLD 0.5: a lit share of 1 - 0.5.
  'robot.layerGain': { min: 0.2, max: 1.2, lit: 0.5 },
  // The layers' detune, cents: the centred -2..2 draw robotFieldDerivation.ts made outside the table (T6).
  'robot.detune': { min: -2, max: 2 },
  // MASTER_VOLUME_MIN/MAX.
  'robot.masterVolume': { min: 0.65, max: 0.85 },
  // ROBOT_LFO_GAIN/DETUNE/BUS_DEPTH_SEED_RANGE with LFO_QUIET_THRESHOLD 0.7 and LFO_BUS_QUIET_THRESHOLD 0.8 as lit shares
  // of 1 - 0.7 and 1 - 0.8.
  'robot.lfoGainDepth': { min: 1, max: 60, lit: 0.25 },
  'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0.25 },
  'robot.lfoBusDepth': { min: 1, max: 40, lit: 0.135 },
  // The plain 0-100 draws.
  'robot.rhythmicDensity': { min: 0, max: 100 },
  'robot.pitchRepeat': { min: 0, max: 100 },
  // The two 1-8 toggle fields: RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD and NOTE_VARIANCE_OFF_THRESHOLD, then 1-8.
  'robot.rhythmicMotifLength': { offShare: 0.15, min: 1, max: 8 },
  'robot.noteVariance': { offShare: 0.15, min: 1, max: 8 },
  // DYNAMICS/RESTS/ACCENTS_SEED_RANGE.
  'robot.dynamics': { min: 25, max: 75 },
  'robot.rests': { min: 10, max: 60 },
  'robot.accents': { min: 20, max: 80 },
  // The waveform pick (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): WAVEFORMS' even ~20 % each, as five equal weights.
  'robot.waveform': { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, pulse: 1 } },
  // The octave register (T6): spawnSystem.ts's even pick over its five OCTAVE_REGISTERS, as five equal weights.
  'robot.octaveRegister': { weights: { bass: 1, low: 1, mid: 1, high: 1, treble: 1 } },

  // The sends (ROBOT_SEND_LOADING_RANGES).
  reverbSend: { min: 0.1, max: 0.6, lit: 1 },
  delaySend: { min: 0, max: 0.3, lit: 0.75 },
  gritSend: { min: 0.4, max: 0.8, lit: 0.21 },
  shimmerSend: { min: 0.2, max: 0.5, lit: 0.16 },
  doubleSend: { min: 0.3, max: 0.6, lit: 0.19 },
};

// ========================================
// TESTS
// ========================================

describe('resolveBands - Classic parity (docs/specs/OFF_SCREEN.md §5.2, plan Task 18)', () => {
  it('resolves Classic with no aspects to every band as it stood before the lift, byte for byte, no key more or fewer', () => {
    expect(resolveBands('classic', {})).toStrictEqual(EXPECTED);
  });

  it('the CLASSIC table itself is that literal', () => {
    expect(CLASSIC).toStrictEqual(EXPECTED);
  });

  it('holds 83 bands: one tempo, fifty global rows, two world keys, twenty-five robot bands and five sends', () => {
    expect(Object.keys(CLASSIC)).toHaveLength(83);
    expect(ROBOT_RANGE_KEYS.length + ROBOT_LIT_KEYS.length + ROBOT_TOGGLE_KEYS.length + ROBOT_PICK_KEYS.length).toBe(25);
    expect(WORLD_RANGE_KEYS.length + WORLD_LIT_KEYS.length).toBe(2);
  });

  it('keeps every lit share and off share a real share in (0, 1], every band min <= max, and every pick a real weighting', () => {
    for (const [key, band] of Object.entries(CLASSIC)) {
      if ('weights' in band) {
        const weights = Object.values(band.weights);
        expect(weights.every((w) => w >= 0), `${key} weights`).toBe(true);
        expect(weights.reduce((a, b) => a + b, 0), `${key} total`).toBeGreaterThan(0);
        continue;
      }
      expect(band.min, `${key} min <= max`).toBeLessThanOrEqual(band.max);
      if ('lit' in band) {
        expect(band.lit, `${key} lit`).toBeGreaterThan(0);
        expect(band.lit, `${key} lit`).toBeLessThanOrEqual(1);
      }
      if ('offShare' in band) {
        expect(band.offShare, `${key} offShare`).toBeGreaterThan(0);
        expect(band.offShare, `${key} offShare`).toBeLessThan(1);
      }
    }
  });

  it('shapes the four robot kinds by key: a toggle key has offShare, a lit key has lit, a pick key has weights, a range key has min and max alone', () => {
    for (const key of ROBOT_TOGGLE_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['max', 'min', 'offShare']);
    for (const key of ROBOT_LIT_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['lit', 'max', 'min']);
    for (const key of ROBOT_PICK_KEYS) expect(Object.keys(CLASSIC[key]), key).toEqual(['weights']);
    for (const key of ROBOT_RANGE_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['max', 'min']);
  });

  it('Classic weights the five waveforms equally, in WAVEFORMS order', () => {
    expect(Object.keys(CLASSIC['robot.waveform'].weights)).toEqual(['sine', 'square', 'triangle', 'sawtooth', 'pulse']);
    expect(new Set(Object.values(CLASSIC['robot.waveform'].weights))).toEqual(new Set([1]));
  });

  it('types each key to its kind, so a range band has no lit share and a toggle band is not a range', () => {
    expect(CLASSIC['robot.noteVariance'].offShare).toBe(0.15);
    expect(CLASSIC.reverbSend.lit).toBe(1);
    // @ts-expect-error - a pick band has weights, not a range
    expect(CLASSIC['robot.waveform'].min).toBeUndefined();
    // @ts-expect-error - a pick's weights name the waveforms and nothing else
    const unknownWave: BandTable['robot.waveform'] = { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, pulse: 1, noise: 1 } };
    expect(unknownWave).toBeDefined();
    // @ts-expect-error - a range band carries no lit share
    expect(CLASSIC.bpm.lit).toBeUndefined();
    // @ts-expect-error - a column cannot name a key outside the table
    const foreign: Partial<BandTable> = { 'robot.nope': { min: 0, max: 1 } };
    expect(foreign).toBeDefined();
  });
});

describe('overlayBands - replace, never widen (spec §1.5)', () => {
  it('an overlay replaces exactly the keys it names and leaves every other key Classic\'s', () => {
    const out = overlayBands(CLASSIC, { bpm: { min: 150, max: 160 } });
    expect(out.bpm).toStrictEqual({ min: 150, max: 160 });
    const { bpm: _outBpm, ...restOut } = out;
    const { bpm: _classicBpm, ...restClassic } = CLASSIC;
    expect(restOut).toStrictEqual(restClassic);
  });

  it('a narrower band replaces the base band rather than widening it to the union', () => {
    const out = overlayBands(CLASSIC, { 'robot.rhythmicDensity': { min: 90, max: 100 } });
    expect(out['robot.rhythmicDensity']).toStrictEqual({ min: 90, max: 100 });
  });

  it('replaces a lit band whole, lit share included, with no field-wise merge', () => {
    const out = overlayBands(CLASSIC, { reverbSend: { min: 0.1, max: 0.6, lit: 0 } });
    expect(out.reverbSend).toStrictEqual({ min: 0.1, max: 0.6, lit: 0 });
    // @ts-expect-error - a column names a whole band, never one of its fields
    const partial: Partial<BandTable> = { reverbSend: { lit: 0 } };
    expect(partial).toBeDefined();
  });

  it('several keys in one column each replace their own band and nothing else', () => {
    const out = overlayBands(CLASSIC, {
      'robot.rests': { min: 0, max: 10 },
      'robot.noteVariance': { offShare: 0.5, min: 1, max: 2 },
    });
    expect(out['robot.rests']).toStrictEqual({ min: 0, max: 10 });
    expect(out['robot.noteVariance']).toStrictEqual({ offShare: 0.5, min: 1, max: 2 });
    expect(out['robot.rhythmicMotifLength']).toStrictEqual(CLASSIC['robot.rhythmicMotifLength']);
    expect(Object.keys(out)).toHaveLength(Object.keys(CLASSIC).length);
  });

  it('an empty column is the base, value for value', () => {
    expect(overlayBands(CLASSIC, {})).toStrictEqual(CLASSIC);
  });

  it('never mutates the base table', () => {
    overlayBands(CLASSIC, { bpm: { min: 1, max: 2 }, 'robot.attack': { min: 1, max: 1 } });
    expect(CLASSIC.bpm).toStrictEqual({ min: 40, max: 100 });
    expect(CLASSIC['robot.attack']).toStrictEqual({ min: 0.015, max: 2 });
  });

  it('a later column wins over an earlier one for the same key, so a theme then an aspect resolves to the aspect', () => {
    const themed = overlayBands(CLASSIC, { 'robot.rhythmicDensity': { min: 40, max: 60 } });
    const aspected = overlayBands(themed, { 'robot.rhythmicDensity': { min: 70, max: 95 } });
    expect(aspected['robot.rhythmicDensity']).toStrictEqual({ min: 70, max: 95 });
  });
});

describe('resolveBands - themes and aspects (spec assumptions 15-17, plan Task 19)', () => {
  // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T8: the cut's fourteen, ids following the names (open question 5), in
  // the sheets' row order - Classic, the four renamed, then the nine candidates kept.
  it('names the fourteen survivor themes, Classic first, and every theme has a column; Classic\'s is empty', () => {
    expect(THEME_IDS).toEqual([
      'classic',
      'float',
      'anchor',
      'shatter',
      'tide',
      'trench',
      'tidepool',
      'floe',
      'thicket',
      'wreck',
      'openWater',
      'ventField',
      'beacon',
      'squall',
    ]);
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(THEMES.classic).toStrictEqual({});
  });

  it('themeLights: any row of a pedal or a colour node lights it, whichever row; the rooms, the master chain and the sends light nothing', () => {
    expect([...themeLights({})]).toEqual([]);
    expect([...themeLights({ 'distortion.amount': { min: 0.5, max: 0.6 } })]).toEqual(['distortion']);
    expect([...themeLights({ 'chebyshev.wet': { min: 0.3, max: 0.4 } })]).toEqual(['chebyshev']);
    expect([...themeLights({ 'bitCrusher.bits': { min: 3, max: 4 } })]).toEqual(['bitCrusher']);
    expect([...themeLights({ 'autoWah.Q': { min: 5, max: 6 } })]).toEqual(['autoWah']);
    expect([...themeLights({ 'phaser.rate': { min: 1, max: 2 } })]).toEqual(['phaser']);
    expect([...themeLights({ 'tremolo.rate': { min: 1, max: 2 }, 'vibrato.wet': { min: 0.9, max: 1 } })].sort()).toEqual([
      'tremolo',
      'vibrato',
    ]);
    // Two rows of one unit light it once.
    expect([...themeLights({ 'autoWah.Q': { min: 5, max: 6 }, 'autoWah.wet': { min: 0.4, max: 0.5 } })]).toEqual(['autoWah']);
    expect([
      ...themeLights({
        'chorus.depth': { min: 0.1, max: 0.2 },
        'frequencyShifter.shift': { min: 2, max: 4 },
        'reverb.decay': { min: 1, max: 2 },
        'delay.feedback': { min: 0.5, max: 0.6 },
        'stereoWidener.width': { min: 0.7, max: 0.8 },
        gritSend: { min: 0.5, max: 0.8, lit: 0.9 },
        'robot.attack': { min: 0, max: 0.1 },
        'lfoLink.lpf.frequency': { min: 10, max: 20, lit: 1 },
      }),
    ]).toEqual([]);
  });

  it('a cut or renamed theme id is no theme: calm, bold, adventurous and perilous fail isThemeId', () => {
    for (const id of ['calm', 'bold', 'adventurous', 'perilous', 'current', 'Float', '']) expect(isThemeId(id), id).toBe(false);
    for (const id of THEME_IDS) expect(isThemeId(id), id).toBe(true);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Tasks 7 and 10 (Crawford's note 3; Space renamed Distance, his answer 6; Voice
  // through the fourth band kind, his answer 3): four families; Motion and Performance last since
  // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7b (the cut's default order).
  it('names six families in order - melody, envelope, distance, voice, motion, performance - each with its options in canonical order and its key set', () => {
    expect(ASPECT_FAMILY_IDS).toEqual(['melody', 'envelope', 'distance', 'voice', 'motion', 'performance']);
    // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T9: the cut's twenty-seven, current options first, then the candidates
    // kept, in the sheets' order; Far and Remote are cut.
    expect(ASPECT_IDS_BY_FAMILY).toEqual({
      melody: ['hypnotic', 'mechanical', 'wandering', 'chanting', 'tumbling', 'telegraph'],
      envelope: ['plucked', 'swelling', 'held', 'bowed', 'hammered', 'breathing'],
      distance: ['near', 'echoing', 'halfHeard'],
      voice: ['glassy', 'woody', 'hollow', 'brassy', 'muted', 'chiming'],
      motion: ['gliding', 'trembling', 'sweeping'],
      performance: ['steady', 'dramatic', 'halting'],
    });
    expect(ASPECT_FAMILIES.motion.keys).toEqual(['robot.portamento', 'robot.lfoGainDepth', 'robot.lfoDetuneDepth', 'robot.lfoBusDepth']);
    expect(ASPECT_FAMILIES.performance.keys).toEqual(['robot.dynamics', 'robot.rests', 'robot.accents']);
    expect(ASPECT_FAMILIES.voice.keys).toEqual([
      'robot.waveform',
      'robot.filterFreq',
      'robot.accentFilterFreq',
      'robot.accentFilterQ',
      'robot.layerGain',
    ]);
    expect(ASPECT_FAMILIES.melody.keys).toEqual([
      'robot.rhythmicDensity',
      'robot.noteVariance',
      'robot.rhythmicMotifLength',
      'robot.pitchRepeat',
    ]);
    expect(ASPECT_FAMILIES.envelope.keys).toEqual([
      'robot.attack',
      'robot.decay',
      'robot.sustain',
      'robot.release',
      'robot.shapedAttack',
      'robot.shapedRelease',
    ]);
    expect(ASPECT_FAMILIES.distance.keys).toEqual(['reverbSend', 'delaySend']);
    for (const family of ASPECT_FAMILY_IDS) {
      expect(Object.keys(ASPECT_FAMILIES[family].options).sort()).toEqual([...ASPECT_IDS_BY_FAMILY[family]].sort());
    }
  });

  it('no key belongs to two families, and every key is robot-side: a robot band or a send, never the tempo or a global row', () => {
    const keys = ASPECT_FAMILY_IDS.flatMap((family) => [...ASPECT_FAMILIES[family].keys] as string[]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('robot.') || key.endsWith('Send'), key).toBe(true);
  });

  it('an id from another family resolves to nothing in this one: melody given plucked is no aspect', () => {
    // @ts-expect-error the type rejects it since review R15; the run-time check stays for untrusted input (a stale save)
    expect(resolveBands('classic', { melody: 'plucked' })).toStrictEqual(CLASSIC);
  });

  it('a theme column with one key replaces only it: Float (injected) differs from Classic at bpm and nowhere else', () => {
    const float = resolveBands('float', {});
    expect(float.bpm).toStrictEqual({ min: 150, max: 160 });
    const { bpm: _floatBpm, ...restFloat } = float;
    const { bpm: _classicBpm, ...restClassic } = CLASSIC;
    expect(restFloat).toStrictEqual(restClassic);
  });

  it('a widened theme column replaces a global row and a robot lit band alike: Tide (injected) differs from Classic at reverb.decay and robot.portamento and nowhere else', () => {
    const tide = resolveBands('tide', {});
    expect(tide['reverb.decay']).toStrictEqual({ min: 6, max: 8 });
    expect(tide['robot.portamento']).toStrictEqual({ min: 0.3, max: 0.6, lit: 0.8 });
    const { 'reverb.decay': _a, 'robot.portamento': _b, ...restTide } = tide;
    const { 'reverb.decay': _c, 'robot.portamento': _d, ...restClassic } = CLASSIC;
    expect(restTide).toStrictEqual(restClassic);
  });

  it('a widened theme key under an aspect that does not name it survives the aspect: Tide plus Hypnotic keeps the glide band', () => {
    const both = resolveBands('tide', { melody: 'hypnotic' });
    expect(both['robot.portamento']).toStrictEqual({ min: 0.3, max: 0.6, lit: 0.8 });
    expect(both['robot.noteVariance']).toStrictEqual({ offShare: 0, min: 1, max: 2 });
  });

  it('a theme with an empty column (Anchor, injected empty) resolves to Classic exactly', () => {
    expect(resolveBands('anchor', {})).toStrictEqual(CLASSIC);
  });

  it('an aspect option replaces only its family keys: Hypnotic differs from Classic at noteVariance and nowhere else', () => {
    const hypnotic = resolveBands('classic', { melody: 'hypnotic' });
    expect(hypnotic['robot.noteVariance']).toStrictEqual({ offShare: 0, min: 1, max: 2 });
    const { 'robot.noteVariance': _a, ...restHypnotic } = hypnotic;
    const { 'robot.noteVariance': _b, ...restClassic } = CLASSIC;
    expect(restHypnotic).toStrictEqual(restClassic);
  });

  it('a theme and an aspect compose: Float plus Hypnotic carries both moves, the aspect over the theme', () => {
    const both = resolveBands('float', { melody: 'hypnotic' });
    expect(both.bpm).toStrictEqual({ min: 150, max: 160 });
    expect(both['robot.noteVariance']).toStrictEqual({ offShare: 0, min: 1, max: 2 });
    expect(Object.keys(both)).toHaveLength(Object.keys(CLASSIC).length);
  });

  it('a Motion option replaces only its family keys: Gliding (injected) differs from Classic at the glide and nowhere else', () => {
    const gliding = resolveBands('classic', { motion: 'gliding' });
    expect(gliding['robot.portamento']).toStrictEqual({ min: 0.5, max: 0.9, lit: 0.9 });
    const { 'robot.portamento': _a, ...rest } = gliding;
    const { 'robot.portamento': _b, ...restClassic } = CLASSIC;
    expect(rest).toStrictEqual(restClassic);
  });

  it('a Performance option replaces only its family keys, and wins over the theme on its own keys: Dramatic (injected) under Float', () => {
    const dramatic = resolveBands('float', { performance: 'dramatic' });
    expect(dramatic['robot.dynamics']).toStrictEqual({ min: 85, max: 100 });
    expect(dramatic['robot.accents']).toStrictEqual({ min: 70, max: 90 });
    expect(dramatic['robot.rests']).toStrictEqual(CLASSIC['robot.rests']);
    expect(dramatic.bpm).toStrictEqual({ min: 150, max: 160 });
  });

  it('a Motion and a Performance option together each move their own family, no more', () => {
    const both = resolveBands('classic', { motion: 'gliding', performance: 'dramatic' });
    expect(both['robot.portamento']).toStrictEqual({ min: 0.5, max: 0.9, lit: 0.9 });
    expect(both['robot.dynamics']).toStrictEqual({ min: 85, max: 100 });
    expect(both['robot.lfoGainDepth']).toStrictEqual(CLASSIC['robot.lfoGainDepth']);
  });

  it('an aspect with an empty option column (Wandering, injected empty) leaves the theme\'s table as it was', () => {
    expect(resolveBands('float', { melody: 'wandering' })).toStrictEqual(resolveBands('float', {}));
  });

  it('a family given undefined is no aspect at all', () => {
    expect(resolveBands('classic', { melody: undefined })).toStrictEqual(CLASSIC);
  });

  it('returns a fresh table each time, never the Classic constant itself', () => {
    expect(resolveBands('classic', {})).not.toBe(CLASSIC);
  });

  it('types: an aspect option cannot name a key outside its family; a theme column names any band of its own kind and nothing outside the table', () => {
    type MelodyOption = (typeof ASPECT_FAMILIES)['melody']['options']['hypnotic'];
    const inFamily: MelodyOption = { 'robot.pitchRepeat': { min: 0, max: 10 } };
    expect(inFamily).toBeDefined();
    // @ts-expect-error - bpm is a world band, not a Melody key (spec §3: themes world-wide, aspects robot-side)
    const foreign: MelodyOption = { bpm: { min: 1, max: 2 } };
    expect(foreign).toBeDefined();
    // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T5: the ten-key list went with the interview; every kind is allowed.
    const allowed: ThemeColumn = {
      'robot.rests': { min: 0, max: 10 },
      'filterLPF.frequency': { min: 500, max: 1000 },
      'robot.dynamics': { min: 0, max: 10 },
      'reverb.decay': { min: 1, max: 2 },
      'robot.portamento': { min: 0.1, max: 0.2, lit: 0.5 },
      gritSend: { min: 0, max: 0.1, lit: 0.1 },
      'robot.noteVariance': { offShare: 0.5, min: 1, max: 3 },
      'robot.waveform': { weights: { sine: 1, square: 0, triangle: 0, sawtooth: 0, pulse: 0 } },
    };
    expect(allowed).toBeDefined();
    // @ts-expect-error - a theme column cannot name a key outside the table
    const outside: ThemeColumn = { 'robot.nope': { min: 0, max: 10 } };
    expect(outside).toBeDefined();
    // @ts-expect-error - a lit key takes a lit band, never a plain range
    const litAsRange: ThemeColumn = { 'robot.portamento': { min: 0.1, max: 0.2 } };
    expect(litAsRange).toBeDefined();
    // @ts-expect-error - a send takes a lit band, never a plain range
    const sendAsRange: ThemeColumn = { gritSend: { min: 0, max: 0.1 } };
    expect(sendAsRange).toBeDefined();
    // @ts-expect-error - a return level is no band (a room's Mix is never seeded)
    const returnRow: ThemeColumn = { 'reverb.wet': { min: 0, max: 1 } };
    expect(returnRow).toBeDefined();
    // @ts-expect-error - an unknown theme id
    const unknownTheme: ThemeId = 'moody';
    expect(unknownTheme).toBe('moody');
    // @ts-expect-error - there is no as-theme pick (docs/tasks/OFF_SCREEN_REVISIONS.md Task 6, Crawford's note 4)
    const asTheme: AspectId = 'theme';
    expect(asTheme).toBe('theme');
  });

  it('types: an Envelope or Distance option cannot name a key outside its family (revisions Task 7)', () => {
    type DistanceOption = (typeof ASPECT_FAMILIES)['distance']['options']['near'];
    type EnvelopeOption = (typeof ASPECT_FAMILIES)['envelope']['options']['plucked'];
    const near: DistanceOption = { reverbSend: { min: 0, max: 0.1, lit: 0.5 } };
    expect(near).toBeDefined();
    // @ts-expect-error - bpm is a world band, not a Distance key (spec §3: themes world-wide, aspects robot-side)
    const tempo: DistanceOption = { bpm: { min: 1, max: 2 } };
    expect(tempo).toBeDefined();
    // @ts-expect-error - a room's size is the theme's (reverb.decay is a global band), never an aspect's
    const room: DistanceOption = { 'reverb.decay': { min: 1, max: 2 } };
    expect(room).toBeDefined();
    // @ts-expect-error - reverbSend is a Distance key, not an Envelope one
    const crossed: EnvelopeOption = { reverbSend: { min: 0, max: 0.1, lit: 0.5 } };
    expect(crossed).toBeDefined();
    // @ts-expect-error - an Envelope id is not a Melody option
    const wrongFamily: AspectIdOf<'melody'> = 'plucked';
    expect(wrongFamily).toBe('plucked');
  });

  it('types: a Motion or a Performance option names its own keys and nothing else (themes-58 T7b)', () => {
    type MotionOption = (typeof ASPECT_FAMILIES)['motion']['options']['gliding'];
    type PerformanceOption = (typeof ASPECT_FAMILIES)['performance']['options']['steady'];
    const glide: MotionOption = { 'robot.lfoBusDepth': { min: 1, max: 5, lit: 0.5 } };
    const steady: PerformanceOption = { 'robot.rests': { min: 0, max: 5 } };
    expect([glide, steady]).toHaveLength(2);
    // @ts-expect-error - robot.dynamics is a Performance key, not a Motion one
    const crossed: MotionOption = { 'robot.dynamics': { min: 0, max: 10 } };
    // @ts-expect-error - the room sends stay with the theme (the Motion sheet): no family owns gritSend
    const room: MotionOption = { gritSend: { min: 0, max: 0.1, lit: 0.1 } };
    // @ts-expect-error - a Melody id is not a Performance option
    const wrong: AspectIdOf<'performance'> = 'hypnotic';
    expect([crossed, room, wrong]).toHaveLength(3);
  });

  it('types: a Voice option names its own keys, the waveform pick among them, and nothing else (revisions Task 10)', () => {
    type VoiceOption = (typeof ASPECT_FAMILIES)['voice']['options']['glassy'];
    const own: VoiceOption = { 'robot.waveform': { weights: { sine: 1, square: 0, triangle: 1, sawtooth: 0, pulse: 0 } } };
    expect(own).toBeDefined();
    // @ts-expect-error - robot.attack is an Envelope key, not a Voice one
    const envelopeKey: VoiceOption = { 'robot.attack': { min: 0, max: 0.1 } };
    expect(envelopeKey).toBeDefined();
    // @ts-expect-error - a waveform band is a pick, never a range
    const rangeWave: VoiceOption = { 'robot.waveform': { min: 0, max: 4 } };
    expect(rangeWave).toBeDefined();
  });
});

// ========================================
// THE PLACEHOLDER COLUMNS (plan Task 34)
// ========================================

describe('the placeholder columns (docs/tasks/OFF_SCREEN.md Task 34; spec assumption 16)', () => {
  // The real modules (the mocks above hide Calm, Bold, Hypnotic and Wandering), overlaid by the real resolver's own pure
  // step, so each check is on the columns as shipped. Task 35 replaces the numbers; these pin the shape and the intent.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const movedKeys = (table: BandTable) => (Object.keys(table) as (keyof BandTable)[]).filter((key) => !same(table[key], CLASSIC[key]));
  const themeColumn = (theme: ThemeId) => realThemes.THEMES[theme];
  const melodyColumn = (option: AspectIdOf<'melody'>) => realAspects.ASPECT_FAMILIES.melody.options[option];
  const envelopeColumn = (option: AspectIdOf<'envelope'>) => realAspects.ASPECT_FAMILIES.envelope.options[option];
  const distanceColumn = (option: AspectIdOf<'distance'>) => realAspects.ASPECT_FAMILIES.distance.options[option];
  const voiceColumn = (option: AspectIdOf<'voice'>) => realAspects.ASPECT_FAMILIES.voice.options[option];
  /** A waveform pick's share for the named waveforms, of the band's whole weight. */
  const shareOf = (band: BandTable['robot.waveform'], waves: (keyof BandTable['robot.waveform']['weights'])[]) => {
    const total = Object.values(band.weights).reduce((a, b) => a + b, 0);
    return waves.reduce((sum, wave) => sum + band.weights[wave], 0) / total;
  };

  // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T8: the importance test as code. Each theme's "Keys owned" list, typed in
  // here from docs/reference/THEME_AND_ASPECT_SHEETS.md (not read from the column under test): a column naming a key its
  // sheet does not own, or leaving out one it does, fails.
  const SHEET_KEYS: Record<Exclude<ThemeId, 'classic'>, readonly BandKey[]> = {
    float: [
      'bpm',
      'robot.rhythmicDensity',
      'robot.rests',
      'robot.rhythmicMotifLength',
      'robot.accents',
      'robot.waveform',
      'robot.attack',
      'robot.release',
      'robot.filterFreq',
      'filterLPF.frequency',
      'gritSend',
      'reverb.decay',
      'reverb.preDelay',
      'reverbSend',
    ],
    anchor: [
      'robot.attack',
      'robot.decay',
      'robot.portamento',
      'robot.lfoDetuneDepth',
      'robot.detune',
      'robot.waveform',
      'robot.layerGain',
      'reverbSend',
      'delaySend',
      'eq3.low',
      'eq3.high',
      'eq3.mid',
      'limiter.threshold',
    ],
    shatter: [
      'gritSend',
      'distortion.amount',
      'chebyshev.order',
      'bitCrusher.bits',
      'distortion.wet',
      'chebyshev.wet',
      'bitCrusher.wet',
      'eq3.high',
      'filterLPF.frequency',
      'robot.waveform',
      'robot.octaveRegister',
      'robot.detune',
      'robot.attack',
      'robot.decay',
      'robot.sustain',
      'robot.release',
      'robot.rhythmicDensity',
      'robot.rests',
      'bpm',
      'robot.accentFilterFreq',
      'robot.lfoBusDepth',
      'delay.delayTime',
      'delay.feedback',
      'delaySend',
      'reverbSend',
    ],
    tide: [
      'robot.portamento',
      'robot.lfoBusDepth',
      'robot.attack',
      'robot.rests',
      'robot.release',
      'robot.waveform',
      'doubleSend',
      'chorus.depth',
      'chorus.rate',
      'chorus.delayTime',
      'vibrato.wet',
      'vibrato.depth',
      'vibrato.rate',
      'lfoLink.lpf.frequency',
      'delay.feedback',
      'delaySend',
    ],
    trench: [
      'filterLPF.frequency',
      'eq3.high',
      'eq3.low',
      'bpm',
      'reverb.decay',
      'reverb.preDelay',
      'reverbSend',
      'robot.rhythmicDensity',
      'robot.rests',
      'robot.portamento',
      'robot.release',
      'robot.waveform',
      'robot.octaveRegister',
    ],
    tidepool: [
      'reverb.decay',
      'reverb.preDelay',
      'reverbSend',
      'delaySend',
      'filterLPF.frequency',
      'eq3.high',
      'bpm',
      'robot.attack',
      'robot.decay',
      'robot.sustain',
      'robot.release',
      'robot.shapedAttack',
      'robot.shapedRelease',
      'robot.waveform',
      'robot.layerGain',
      'robot.accentFilterFreq',
      'robot.rhythmicDensity',
    ],
    floe: [
      'shimmerSend',
      'frequencyShifter.shift',
      'robot.waveform',
      'robot.attack',
      'robot.sustain',
      'robot.release',
      'robot.shapedAttack',
      'robot.shapedRelease',
      'bpm',
      'robot.rhythmicDensity',
      'eq3.high',
      'filterHPF.frequency',
      'reverb.decay',
      'reverbSend',
    ],
    thicket: [
      'doubleSend',
      'chorus.depth',
      'chorus.rate',
      'chorus.delayTime',
      'robot.layerGain',
      'robot.waveform',
      'robot.filterFreq',
      'eq3.mid',
      'filterLPF.frequency',
      'bpm',
      'robot.rhythmicDensity',
      'robot.sustain',
      'robot.release',
      'reverbSend',
    ],
    wreck: [
      'gritSend',
      'distortion.amount',
      'bitCrusher.bits',
      'delay.delayTime',
      'delay.feedback',
      'delaySend',
      'eq3.high',
      'filterLPF.frequency',
      'bpm',
      'robot.rhythmicMotifLength',
      'robot.pitchRepeat',
      'robot.waveform',
      'robot.accentFilterFreq',
    ],
    openWater: [
      'reverb.decay',
      'reverb.preDelay',
      'delay.delayTime',
      'reverbSend',
      'delaySend',
      'robot.rhythmicDensity',
      'robot.rests',
      'robot.masterVolume',
      'robot.release',
      'stereoWidener.width',
      'filterLPF.frequency',
      'bpm',
    ],
    ventField: [
      'robot.accentFilterFreq',
      'robot.accentFilterQ',
      'robot.lfoBusDepth',
      'robot.waveform',
      'robot.rhythmicDensity',
      'robot.attack',
      'robot.decay',
      'robot.sustain',
      'robot.noteVariance',
      'eq3.low',
      'eq3.mid',
      'filterLPF.frequency',
      'bpm',
      'autoWah.wet',
      'autoWah.baseFrequency',
      'autoWah.Q',
    ],
    beacon: [
      'robot.rhythmicMotifLength',
      'robot.noteVariance',
      'robot.pitchRepeat',
      'robot.dynamics',
      'robot.accents',
      'robot.rests',
      'delaySend',
      'delay.feedback',
      'delay.delayTime',
      'reverbSend',
      'bpm',
      'robot.rhythmicDensity',
      'humanize',
    ],
    squall: [
      'robot.dynamics',
      'robot.accents',
      'robot.rests',
      'compressor.threshold',
      'compressor.ratio',
      'bpm',
      'robot.rhythmicDensity',
      'robot.noteVariance',
      'robot.attack',
      'robot.release',
      'gritSend',
      'robot.masterVolume',
      'eq3.low',
      'stereoWidener.width',
      'tremolo.wet',
      'tremolo.depth',
      'tremolo.rate',
    ],
  };
  const SURVIVORS = Object.keys(SHEET_KEYS) as (keyof typeof SHEET_KEYS)[];

  it('the sheet literal covers every theme but Classic, and no sheet lists a key twice', () => {
    expect([...SURVIVORS].sort()).toEqual(THEME_IDS.filter((id) => id !== 'classic').sort());
    for (const theme of SURVIVORS) expect(new Set(SHEET_KEYS[theme]).size, theme).toBe(SHEET_KEYS[theme].length);
  });

  it.each(SURVIVORS)('%s names exactly the keys its sheet owns, each band of its kind and inside its field', (theme) => {
    const column = themeColumn(theme);
    expect(Object.keys(column).sort()).toEqual([...SHEET_KEYS[theme]].sort());
    for (const [key, band] of Object.entries(column)) {
      expect(Object.keys(CLASSIC), `${theme} ${key}`).toContain(key);
      expect(bandProblems(key as BandKey, band), `${theme} ${key}`).toEqual([]);
    }
  });

  it.each(SURVIVORS)('%s moves every band it names: no band equal to Classic\'s (a key moved for nothing)', (theme) => {
    const column = themeColumn(theme);
    const moved = movedKeys(overlayBands(CLASSIC, column));
    expect([...moved].sort()).toEqual(Object.keys(column).sort());
  });

  // The lit rule (Crawford, 2026-11-03; the sheets' rules): a theme naming a pedal's or a colour node's rows lights it
  // in every world. Under the real columns: Shatter all three nodes, Wreck the drive and the crush, Tide the Vibrato,
  // Vent Field the Auto-Wah, Squall the Tremolo, and no other theme any.
  it('the real columns light what their sheets say and nothing else', () => {
    const lights = (theme: ThemeId) => [...realThemes.themeLights(realThemes.THEMES[theme])].sort();
    const expected: Partial<Record<ThemeId, string[]>> = {
      shatter: ['bitCrusher', 'chebyshev', 'distortion'],
      wreck: ['bitCrusher', 'distortion'],
      tide: ['vibrato'],
      ventField: ['autoWah'],
      squall: ['tremolo'],
    };
    for (const theme of THEME_IDS) expect(lights(theme), theme).toEqual(expected[theme] ?? []);
  });

  it('Classic\'s column stays empty: Classic is the lifted table', () => {
    expect(realThemes.THEMES.classic).toStrictEqual({});
  });

  it('no two themes share a column: each is its own loading', () => {
    const columns = SURVIVORS.map((theme) => JSON.stringify(themeColumn(theme)));
    expect(new Set(columns).size).toBe(SURVIVORS.length);
  });

  // docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T9: each option's "Keys owned", typed in from the sheets file (not read
  // from the column under test). An option band equal to Classic's is allowed - it still overrides a theme that moves
  // the key - but an option must differ from the theme-less table somewhere.
  const D = 'robot.rhythmicDensity';
  const V = 'robot.noteVariance';
  const M = 'robot.rhythmicMotifLength';
  const P = 'robot.pitchRepeat';
  const ENVELOPE_ALL = ['robot.attack', 'robot.decay', 'robot.sustain', 'robot.release', 'robot.shapedAttack', 'robot.shapedRelease'];
  const SENDS = ['reverbSend', 'delaySend'];
  const VOICE_FOUR = ['robot.waveform', 'robot.filterFreq', 'robot.layerGain', 'robot.accentFilterFreq'];
  const MOTION_ALL = ['robot.portamento', 'robot.lfoDetuneDepth', 'robot.lfoGainDepth', 'robot.lfoBusDepth'];
  const PERFORMANCE_ALL = ['robot.dynamics', 'robot.accents', 'robot.rests'];
  const OPTION_SHEET_KEYS: { [F in AspectFamilyId]: Record<AspectIdOf<F>, readonly string[]> } = {
    melody: {
      hypnotic: [D, V, P],
      mechanical: [D, M, V, P],
      wandering: [D, V, M, P],
      chanting: [M, V, P, D],
      tumbling: [D, V, M, P],
      telegraph: [D, M, V, P],
    },
    envelope: {
      plucked: ENVELOPE_ALL,
      swelling: ['robot.attack', 'robot.shapedAttack', 'robot.sustain'],
      held: ['robot.attack', 'robot.sustain', 'robot.release', 'robot.shapedRelease'],
      bowed: ['robot.attack', 'robot.sustain', 'robot.release', 'robot.shapedAttack', 'robot.shapedRelease'],
      hammered: ['robot.attack', 'robot.sustain', 'robot.release', 'robot.shapedAttack', 'robot.shapedRelease'],
      breathing: ENVELOPE_ALL,
    },
    distance: { near: SENDS, echoing: SENDS, halfHeard: SENDS },
    voice: {
      glassy: VOICE_FOUR,
      woody: ['robot.waveform', 'robot.filterFreq', 'robot.layerGain'],
      hollow: ['robot.waveform', 'robot.filterFreq', 'robot.accentFilterFreq', 'robot.accentFilterQ'],
      brassy: VOICE_FOUR,
      muted: VOICE_FOUR,
      chiming: VOICE_FOUR,
    },
    motion: { gliding: MOTION_ALL, trembling: MOTION_ALL, sweeping: MOTION_ALL },
    performance: { steady: PERFORMANCE_ALL, dramatic: PERFORMANCE_ALL, halting: PERFORMANCE_ALL },
  };
  const OPTIONS = ASPECT_FAMILY_IDS.flatMap((family) =>
    (Object.keys(OPTION_SHEET_KEYS[family]) as AspectId[]).map((option) => [family, option] as const),
  );
  const optionColumn = (family: AspectFamilyId, option: AspectId): Partial<BandTable> =>
    (realAspects.ASPECT_FAMILIES[family].options as Record<string, Partial<BandTable>>)[option];

  it('the option literal covers every family\'s options in its row order', () => {
    for (const family of ASPECT_FAMILY_IDS) {
      expect(Object.keys(OPTION_SHEET_KEYS[family]), family).toEqual([...realAspects.ASPECT_IDS_BY_FAMILY[family]]);
    }
    expect(OPTIONS).toHaveLength(27);
  });

  it.each(OPTIONS)('%s %s names exactly the keys its sheet owns, each of its kind and inside its field, and differs from Classic somewhere', (family, option) => {
    const column = optionColumn(family, option);
    expect(Object.keys(column).sort()).toEqual([...(OPTION_SHEET_KEYS[family] as Record<string, readonly string[]>)[option]].sort());
    for (const [key, band] of Object.entries(column)) expect(bandProblems(key as BandKey, band), key).toEqual([]);
    expect(movedKeys(overlayBands(CLASSIC, column)).length).toBeGreaterThan(0);
  });

  it.each(ASPECT_FAMILY_IDS)('%s: no two options are equal column for column, and the key set is the union its sheets own', (family) => {
    const options = Object.values(realAspects.ASPECT_FAMILIES[family].options).map((column) => JSON.stringify(column));
    expect(new Set(options).size).toBe(options.length);
    const union = new Set(Object.values(OPTION_SHEET_KEYS[family] as Record<string, readonly string[]>).flat());
    expect([...realAspects.ASPECT_FAMILIES[family].keys].sort()).toEqual([...union].sort());
  });

  it('Hypnotic is low variance: its noteVariance toggle is always on, with a value band inside 1-2', () => {
    const band = melodyColumn('hypnotic')['robot.noteVariance']!;
    expect(band.offShare).toBe(0);
    expect(band.min).toBeGreaterThanOrEqual(1);
    expect(band.max).toBeLessThanOrEqual(2);
    expect(band.min).toBeLessThanOrEqual(band.max);
  });

  it('Mechanical is dense: its rhythmicDensity band starts at 70 or above', () => {
    const band = melodyColumn('mechanical')['robot.rhythmicDensity']!;
    expect(band.min).toBeGreaterThanOrEqual(70);
    expect(band.max).toBeLessThanOrEqual(100);
  });

  it('Wandering roams: high variance (6-8), low to medium density (at most 50), the motif mostly off', () => {
    const wandering = melodyColumn('wandering');
    expect(wandering['robot.noteVariance']!.min).toBeGreaterThanOrEqual(6);
    expect(wandering['robot.noteVariance']!.max).toBeLessThanOrEqual(8);
    expect(wandering['robot.rhythmicDensity']!.max).toBeLessThanOrEqual(50);
    expect(wandering['robot.rhythmicMotifLength']!.offShare).toBeGreaterThanOrEqual(0.5);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 7's intent checks, which fail a wrong-way edit.
  it('Plucked is a pluck: a near-instant attack (shaped or not) and a low sustain', () => {
    const plucked = envelopeColumn('plucked');
    expect(plucked['robot.attack']!.max).toBeLessThanOrEqual(0.05);
    expect(plucked['robot.sustain']!.max).toBeLessThanOrEqual(0.3);
    // A shaped attack is drawn from its own band (generateAudioAttributes), so a long one there would undo the pluck.
    expect(plucked['robot.shapedAttack']?.max ?? CLASSIC['robot.shapedAttack'].max).toBeLessThanOrEqual(0.05);
  });

  it('Swelling swells: a long attack, shaped or not, and a high sustain', () => {
    const swelling = envelopeColumn('swelling');
    expect(swelling['robot.attack']!.min).toBeGreaterThanOrEqual(0.2);
    expect(swelling['robot.shapedAttack']?.min ?? CLASSIC['robot.shapedAttack'].min).toBeGreaterThanOrEqual(0.2);
    expect(swelling['robot.sustain']!.min).toBeGreaterThanOrEqual(0.6);
  });

  it('Held holds: a full sustain and a long release, shaped or not', () => {
    const held = envelopeColumn('held');
    expect(held['robot.sustain']!.min).toBeGreaterThanOrEqual(0.85);
    expect(held['robot.release']!.min).toBeGreaterThanOrEqual(0.5);
    expect(held['robot.shapedRelease']?.min ?? CLASSIC['robot.shapedRelease'].min).toBeGreaterThanOrEqual(0.5);
  });

  it('Near is close: both sends low and mostly unlit', () => {
    const near = distanceColumn('near');
    expect(near.reverbSend!.max).toBeLessThanOrEqual(0.15);
    expect(near.reverbSend!.lit).toBeLessThan(0.5);
    expect(near.delaySend!.max).toBeLessThanOrEqual(0.1);
    expect(near.delaySend!.lit).toBeLessThan(0.5);
  });

  // T9: Far and Remote are cut (rungs); Echoing and Half-heard are two kinds of distance.
  it('Echoing is deep in the delay on every probe and only lightly in the reverb', () => {
    const echoing = distanceColumn('echoing');
    expect(echoing.delaySend!.lit).toBe(1);
    expect(echoing.delaySend!.min).toBeGreaterThanOrEqual(0.3);
    expect(echoing.reverbSend!.max).toBeLessThanOrEqual(0.2);
  });

  it('Half-heard puts about half the fleet far off in the reverb and an echo on about half', () => {
    const half = distanceColumn('halfHeard');
    expect(half.reverbSend!.lit).toBeGreaterThanOrEqual(0.4);
    expect(half.reverbSend!.lit).toBeLessThanOrEqual(0.6);
    expect(half.reverbSend!.min).toBeGreaterThanOrEqual(0.5);
    expect(half.delaySend!.lit).toBeGreaterThanOrEqual(0.4);
    expect(half.delaySend!.lit).toBeLessThanOrEqual(0.6);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 10: the Voice family, its waveform through the fourth band kind (PickBand).
  it.each(['glassy', 'woody', 'hollow', 'brassy', 'muted', 'chiming'] as const)('Voice %s moves its waveform pick', (option) => {
    expect(movedKeys(overlayBands(CLASSIC, voiceColumn(option)))).toContain('robot.waveform');
  });

  it('Glassy leans sine and triangle (at least 0.7 of the weight), with the cutoff opened above Classic\'s floor', () => {
    const glassy = voiceColumn('glassy');
    expect(shareOf(glassy['robot.waveform']!, ['sine', 'triangle'])).toBeGreaterThanOrEqual(0.7);
    expect(glassy['robot.filterFreq']!.min).toBeGreaterThan(CLASSIC['robot.filterFreq'].min);
  });

  it('Woody leans triangle and square (at least 0.6), under a lower cutoff than Classic\'s', () => {
    const woody = voiceColumn('woody');
    expect(shareOf(woody['robot.waveform']!, ['triangle', 'square'])).toBeGreaterThanOrEqual(0.6);
    expect(woody['robot.filterFreq']!.max).toBeLessThan(CLASSIC['robot.filterFreq'].max);
  });

  it('Hollow leans square and pulse (at least 0.6), its filter max below Classic\'s and more robots taking the resonant accent', () => {
    const hollow = voiceColumn('hollow');
    expect(shareOf(hollow['robot.waveform']!, ['square', 'pulse'])).toBeGreaterThanOrEqual(0.6);
    expect(hollow['robot.filterFreq']!.max).toBeLessThan(CLASSIC['robot.filterFreq'].max);
    expect(hollow['robot.accentFilterFreq']!.lit).toBeGreaterThan(CLASSIC['robot.accentFilterFreq'].lit);
  });

  it('every placeholder band, theme and aspect alike, is of its key\'s kind and inside what its field can hold', () => {
    const columns: Partial<BandTable>[] = [
      ...Object.values(realThemes.THEMES),
      ...ASPECT_FAMILY_IDS.flatMap((family) => Object.values(realAspects.ASPECT_FAMILIES[family].options) as Partial<BandTable>[]),
    ];
    expect(columns.length).toBe(41);
    for (const column of columns) {
      for (const [key, band] of Object.entries(column)) expect(bandProblems(key as BandKey, band), key).toEqual([]);
    }
  });
});

// ========================================
// THE KIND-AND-BOUNDS CHECK (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T5)
// ========================================

/**
 * Each robot band's and the tempo's full field range: the slider or clamp the field already has, never the narrower
 * loading band. A complete record, so a key added to the table without a bound here fails to compile. The global rows'
 * full ranges are GLOBAL_AUDIO_SEED_RANGES (the GLOBAL_CHAIN_GRID.md Unit / Range column). The waveform pick has none.
 */
const ROBOT_BOUNDS: Record<Exclude<BandKey, LoadingRangeKey | RobotPickKey>, readonly [number, number]> = {
  bpm: [20, 200], // the tempo the clock runs (src/constants/index.ts)
  // Attack and Release start at their sliders' floors, curved or not: a shorter edge clicks.
  'robot.attack': [ENVELOPE_ATTACK_MIN_SECONDS, ENVELOPE_TIME_MAX_SECONDS],
  'robot.decay': [0, ENVELOPE_TIME_MAX_SECONDS],
  'robot.sustain': [0, 1],
  'robot.release': [ENVELOPE_RELEASE_MIN_SECONDS, ENVELOPE_TIME_MAX_SECONDS],
  'robot.shapedAttack': [ENVELOPE_ATTACK_MIN_SECONDS, ENVELOPE_TIME_MAX_SECONDS],
  'robot.shapedRelease': [ENVELOPE_RELEASE_MIN_SECONDS, ENVELOPE_TIME_MAX_SECONDS],
  'robot.portamento': [PORTAMENTO_MIN, PORTAMENTO_MAX],
  // The bus filter's own slider ranges (ROBOT_BUS_FILTER_FREQ_RANGE, ROBOT_BUS_FILTER_Q_RANGE) and the Signature
  // Array's Gain slider (0-2).
  'robot.filterFreq': [20, 20000],
  'robot.accentFilterFreq': [20, 20000],
  'robot.accentFilterQ': [0.1, 20],
  'robot.layerGain': [0, 2],
  'robot.detune': [-50, 50], // each layer's Detune slider (ROBOT_SWELL_FIELD_RANGE's layer<i>.detune)
  'robot.masterVolume': [0, 1], // Robot.masterVolume, stored 0-1 (VOLUME_SCHEMA displays 0-100)
  'robot.lfoGainDepth': [LFO_DEPTH_MIN, LFO_DEPTH_MAX],
  'robot.lfoDetuneDepth': [LFO_DEPTH_MIN, LFO_DEPTH_MAX],
  'robot.lfoBusDepth': [LFO_DEPTH_MIN, LFO_DEPTH_MAX],
  'robot.rhythmicDensity': [0, 100],
  'robot.pitchRepeat': [0, 100],
  'robot.noteVariance': [1, 8],
  'robot.rhythmicMotifLength': [1, 8],
  'robot.dynamics': [PERFORMANCE_MIN, PERFORMANCE_MAX],
  'robot.rests': [PERFORMANCE_MIN, PERFORMANCE_MAX],
  'robot.accents': [PERFORMANCE_MIN, PERFORMANCE_MAX],
  reverbSend: [SEND_MIN, SEND_MAX],
  delaySend: [SEND_MIN, SEND_MAX],
  gritSend: [SEND_MIN, SEND_MAX],
  shimmerSend: [SEND_MIN, SEND_MAX],
  doubleSend: [SEND_MIN, SEND_MAX],
  // The world keys (T6): the Humanize slider's [0, 20] ms, and a global link's Depth slider.
  humanize: [HUMANIZE_MIN_MS, HUMANIZE_MAX_MS],
  'lfoLink.lpf.frequency': [LFO_DEPTH_MIN, LFO_DEPTH_MAX],
};

/** The names a pick's weights must carry, per pick key: the waveforms, or the octave registers. */
const PICK_NAMES: Record<RobotPickKey, readonly string[]> = {
  'robot.waveform': ['sine', 'square', 'triangle', 'sawtooth', 'pulse'],
  'robot.octaveRegister': ['bass', 'low', 'mid', 'high', 'treble'],
};

/** A key's full field range: its robot bound, or its global row's seed range. */
function boundsOf(key: Exclude<BandKey, RobotPickKey>): readonly [number, number] {
  if (key in ROBOT_BOUNDS) return ROBOT_BOUNDS[key as keyof typeof ROBOT_BOUNDS];
  const range = GLOBAL_AUDIO_SEED_RANGES[key as LoadingRangeKey];
  return [range.min, range.max];
}

/** The fields a band of this key's kind carries, sorted: a lit share on a lit key or a send, an off share on a toggle,
 *  weights on the pick, a plain range otherwise. */
function kindFieldsOf(key: BandKey): string[] {
  if ((ROBOT_PICK_KEYS as readonly string[]).includes(key)) return ['weights'];
  if ((ROBOT_TOGGLE_KEYS as readonly string[]).includes(key)) return ['max', 'min', 'offShare'];
  const litKeys: readonly string[] = [...ROBOT_LIT_KEYS, ...ROBOT_SEND_FIELDS, ...WORLD_LIT_KEYS];
  if (litKeys.includes(key)) return ['lit', 'max', 'min'];
  return ['max', 'min'];
}

/** Everything wrong with a column's band for this key: empty when the band is of its key's kind and inside its field. */
function bandProblems(key: BandKey, band: object): string[] {
  const problems: string[] = [];
  const fields = Object.keys(band).sort();
  // A band of the wrong kind has nothing further to check against its field.
  if (JSON.stringify(fields) !== JSON.stringify(kindFieldsOf(key))) return [`kind: ${fields.join(',')}`];
  if ('weights' in band) {
    // A pick: every weight a non-negative number, at least one above zero, and exactly its own names weighed.
    const weights = band.weights as Record<string, number>;
    const names = [...PICK_NAMES[key as RobotPickKey]].sort();
    if (JSON.stringify(Object.keys(weights).sort()) !== JSON.stringify(names)) problems.push('weights: not its own names');
    if (!Object.values(weights).every((w) => Number.isFinite(w) && w >= 0)) problems.push('weights: a negative weight');
    if (!Object.values(weights).some((w) => w > 0)) problems.push('weights: nothing to draw');
    return problems;
  }
  const { min, max } = band as RangeBand;
  const [low, high] = boundsOf(key as Exclude<BandKey, RobotPickKey>);
  if (!(min <= max)) problems.push(`min ${min} > max ${max}`);
  if (min < low || max > high) problems.push(`outside the field's ${low}-${high}`);
  // A lit share of 0 is a column's "none" (T8: Float's Grit send, Anchor's glide and rooms): no robot carries the trait.
  // Classic's own shares stay in (0, 1] (the parity block above).
  if ('lit' in band && !((band as SendBand).lit >= 0 && (band as SendBand).lit <= 1)) problems.push('lit: not in [0, 1]');
  if ('offShare' in band) {
    // A toggle always on (offShare 0) or always off (offShare 1: T9's Tumbling, "never tiles a figure") is a legitimate aspect.
    const { offShare } = band as ToggleBand;
    if (!(offShare >= 0 && offShare <= 1)) problems.push('offShare: not in [0, 1]');
    if (!Number.isInteger(min) || !Number.isInteger(max)) problems.push('toggle: a fractional value');
  }
  return problems;
}

describe('the kind-and-bounds check itself (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T5)', () => {
  it('passes every Classic band: the lifted table is of its kinds and inside its fields', () => {
    for (const [key, band] of Object.entries(CLASSIC)) expect(bandProblems(key as BandKey, band), key).toEqual([]);
  });

  it('fails a plain range on a send key and on a robot lit key, and a lit band on a range key', () => {
    expect(bandProblems('gritSend', { min: 0, max: 0.5 })).not.toEqual([]);
    expect(bandProblems('reverbSend', { min: 0, max: 0.5 })).not.toEqual([]);
    expect(bandProblems('robot.portamento', { min: 0.1, max: 0.2 })).not.toEqual([]);
    expect(bandProblems('robot.dynamics', { min: 0, max: 50, lit: 0.5 })).not.toEqual([]);
  });

  it('fails a toggle band without its off share, a pick given a range, and a range given weights', () => {
    expect(bandProblems('robot.noteVariance', { min: 1, max: 8 })).not.toEqual([]);
    expect(bandProblems('robot.waveform', { min: 0, max: 4 })).not.toEqual([]);
    expect(bandProblems('bpm', { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, pulse: 1 } })).not.toEqual([]);
  });

  it('fails a band outside its field on a global row, a robot band, a send and the tempo, at either end', () => {
    expect(bandProblems('reverb.decay', { min: 0.5, max: 12 })).not.toEqual([]);
    expect(bandProblems('compressor.threshold', { min: -70, max: -20 })).not.toEqual([]);
    expect(bandProblems('robot.masterVolume', { min: 0.5, max: 1.2 })).not.toEqual([]);
    expect(bandProblems('doubleSend', { min: -0.1, max: 0.5, lit: 0.5 })).not.toEqual([]);
    expect(bandProblems('bpm', { min: 10, max: 100 })).not.toEqual([]);
  });

  it('passes a lit share of 0, a column\'s none (T8), on a send and a robot lit key', () => {
    expect(bandProblems('gritSend', { min: 0.4, max: 0.8, lit: 0 })).toEqual([]);
    expect(bandProblems('robot.portamento', { min: 0.05, max: 0.2, lit: 0 })).toEqual([]);
  });

  it('passes a band that fills its field exactly, edge to edge', () => {
    expect(bandProblems('reverb.decay', { min: 0.1, max: 10 })).toEqual([]);
    expect(bandProblems('robot.portamento', { min: PORTAMENTO_MIN, max: PORTAMENTO_MAX, lit: 1 })).toEqual([]);
  });

  it('fails min above max, a lit share below 0 or past 1, an off share past 1, and a fractional toggle', () => {
    expect(bandProblems('reverb.decay', { min: 3, max: 2 })).not.toEqual([]);
    expect(bandProblems('reverbSend', { min: 0, max: 0.5, lit: -0.1 })).not.toEqual([]);
    expect(bandProblems('reverbSend', { min: 0, max: 0.5, lit: 1.1 })).not.toEqual([]);
    expect(bandProblems('robot.noteVariance', { offShare: 1.1, min: 1, max: 8 })).not.toEqual([]);
    expect(bandProblems('robot.noteVariance', { offShare: 0.2, min: 1.5, max: 8 })).not.toEqual([]);
  });

  it('knows the four keys new at T6: a lit band on the low-pass tie, a range on humanize and detune, the registers on the register pick', () => {
    expect(bandProblems('lfoLink.lpf.frequency', { min: 5, max: 60 })).not.toEqual([]);
    expect(bandProblems('lfoLink.lpf.frequency', { min: 5, max: 120, lit: 1 })).not.toEqual([]);
    expect(bandProblems('humanize', { min: 0, max: 30 })).not.toEqual([]);
    expect(bandProblems('robot.detune', { min: -60, max: 0 })).not.toEqual([]);
    expect(bandProblems('robot.detune', { min: -50, max: 50 })).toEqual([]);
    expect(bandProblems('robot.octaveRegister', { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, pulse: 1 } })).not.toEqual([]);
    expect(bandProblems('robot.waveform', { weights: { bass: 1, low: 1, mid: 1, high: 1, treble: 1 } })).not.toEqual([]);
    expect(bandProblems('robot.octaveRegister', { weights: { bass: 1, low: 0, mid: 0, high: 0, treble: 0 } })).toEqual([]);
  });

  it('fails a pick that names a stranger, weighs one below zero, or weighs nothing', () => {
    expect(bandProblems('robot.waveform', { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, noise: 1 } })).not.toEqual([]);
    expect(bandProblems('robot.waveform', { weights: { sine: 1, square: -1, triangle: 1, sawtooth: 1, pulse: 1 } })).not.toEqual([]);
    expect(bandProblems('robot.waveform', { weights: { sine: 0, square: 0, triangle: 0, sawtooth: 0, pulse: 0 } })).not.toEqual([]);
  });
});

// docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R15: a family-keyed record holds only that family's ids in its type, not
// only at run time, so another family's id is a compile error. Type-checked by `npm run build:types` (vitest itself does
// not type-check: an unused @ts-expect-error fails the build). The run-time membership checks stay, since a payload or a
// link is untrusted input. Each record also takes a full set of right ids, so a type made too tight fails here too.
describe('a pick is typed by its own family (review R15)', () => {
  it("rejects another family's id for a robot's aspects, a world's pick lists, a robot's loadedUnder and the bands", () => {
    // @ts-expect-error 'plucked' is an Envelope aspect, not a Melody one
    const dealt: RobotAspects = { melody: 'plucked' };
    // @ts-expect-error the same for a world's pick list
    const lists: LoadingIdentity['aspects'] = { melody: ['plucked'] };
    // @ts-expect-error and for what a robot was loaded under
    const loadedUnder: Robot['loadedUnder'] = { voice: 'near' };
    // @ts-expect-error and for the aspects a robot's bands resolve under
    const resolve = () => resolveBands('classic', { distance: 'woody' });

    const rightDealt: RobotAspects = { melody: 'hypnotic', envelope: 'plucked', distance: 'near', voice: 'woody' };
    const rightLists: LoadingIdentity['aspects'] = {
      melody: ['hypnotic', 'wandering'],
      envelope: ['plucked'],
      distance: ['echoing', 'halfHeard'],
      voice: ['glassy'],
    };
    const rightLoadedUnder: Robot['loadedUnder'] = { voice: 'hollow' };
    expect(resolveBands('classic', rightDealt)).toBeDefined();
    expect([dealt, lists, loadedUnder, resolve, rightLists, rightLoadedUnder].every((x) => x !== null)).toBe(true);
  });
});
