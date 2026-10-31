// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';

import { ENVELOPE_TIME_MAX_SECONDS } from '../../constants';
import { overlayBands, resolveBands } from './resolveBands';
import { CLASSIC } from './classic';
import { ROBOT_LIT_KEYS, ROBOT_PICK_KEYS, ROBOT_RANGE_KEYS, ROBOT_TOGGLE_KEYS, type BandTable } from './bandKeys';
import { THEME_IDS, THEMES, type ThemeColumn, type ThemeId } from './themes';
import { ASPECT_FAMILIES, ASPECT_FAMILY_IDS, ASPECT_IDS_BY_FAMILY, type AspectId, type AspectIdOf } from './aspects';

// ========================================
// MOCKS
// ========================================

// The overlay direction is proved on injected columns, whatever the real placeholders hold (plan Task 34 fills them,
// Task 35 tunes them): Calm moves bpm, Hypnotic moves noteVariance, and an injected EMPTY column (Bold, Wandering)
// proves silence. The originals are spread, so every other export is the real one; the real columns are read below
// through vi.importActual.
const injected = vi.hoisted(() => ({
  calm: { bpm: { min: 150, max: 160 } },
  hypnotic: { 'robot.noteVariance': { offShare: 0, min: 1, max: 2 } },
}));

vi.mock('./themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./themes')>();
  return { ...actual, THEMES: { ...actual.THEMES, calm: injected.calm, bold: {} } };
});

vi.mock('./aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./aspects')>();
  const melody = actual.ASPECT_FAMILIES.melody;
  return {
    ...actual,
    ASPECT_FAMILIES: {
      ...actual.ASPECT_FAMILIES,
      melody: { ...melody, options: { ...melody.options, hypnotic: injected.hypnotic, wandering: {} } },
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

  // Robots (spawnSystem.ts). ATTACK/DECAY/SUSTAIN/RELEASE_RANGE (0-ENVELOPE_TIME_MAX_SECONDS, 0-1).
  'robot.attack': { min: 0, max: 2 },
  'robot.decay': { min: 0, max: 2 },
  'robot.sustain': { min: 0, max: 1 },
  'robot.release': { min: 0, max: 2 },
  // SHAPED_ATTACK/RELEASE_RANGE with ATTACK/RELEASE_CURVE_SHAPED_THRESHOLD as the lit share.
  'robot.shapedAttack': { min: 0.03, max: 0.25, lit: 0.21 },
  'robot.shapedRelease': { min: 0.15, max: 0.8, lit: 0.275 },
  // PORTAMENTO_SEED_RANGE with GLIDER_THRESHOLD as the lit share.
  'robot.portamento': { min: 0.05, max: 0.2, lit: 0.23 },
  // OPEN_FILTER_FREQ_RANGE; ACCENT_FILTER_FREQ_RANGE with FILTER_ACCENT_THRESHOLD; ACCENT_FILTER_Q_RANGE.
  'robot.filterFreq': { min: 2000, max: 8000 },
  'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.27 },
  'robot.accentFilterQ': { min: 3, max: 8 },
  // The Coaxial/Harmonic gain draw (0.2-1.2) with LAYER_QUIET_THRESHOLD 0.5: a lit share of 1 - 0.5.
  'robot.layerGain': { min: 0.2, max: 1.2, lit: 0.5 },
  // MASTER_VOLUME_MIN/MAX.
  'robot.masterVolume': { min: 0.65, max: 0.85 },
  // ROBOT_LFO_GAIN/DETUNE/BUS_DEPTH_SEED_RANGE with LFO_QUIET_THRESHOLD 0.7 and LFO_BUS_QUIET_THRESHOLD 0.8 as lit shares
  // of 1 - 0.7 and 1 - 0.8.
  'robot.lfoGainDepth': { min: 1, max: 60, lit: 0.3 },
  'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0.3 },
  'robot.lfoBusDepth': { min: 1, max: 40, lit: 0.2 },
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

  it('holds 79 bands: one tempo, fifty global rows, twenty-three robot bands (the waveform pick since revisions Task 10) and five sends', () => {
    expect(Object.keys(CLASSIC)).toHaveLength(79);
    expect(ROBOT_RANGE_KEYS.length + ROBOT_LIT_KEYS.length + ROBOT_TOGGLE_KEYS.length + ROBOT_PICK_KEYS.length).toBe(23);
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
    expect(CLASSIC['robot.attack']).toStrictEqual({ min: 0, max: 2 });
  });

  it('a later column wins over an earlier one for the same key, so a theme then an aspect resolves to the aspect', () => {
    const themed = overlayBands(CLASSIC, { 'robot.rhythmicDensity': { min: 40, max: 60 } });
    const aspected = overlayBands(themed, { 'robot.rhythmicDensity': { min: 70, max: 95 } });
    expect(aspected['robot.rhythmicDensity']).toStrictEqual({ min: 70, max: 95 });
  });
});

describe('resolveBands - themes and aspects (spec assumptions 15-17, plan Task 19)', () => {
  it('names five themes, Classic first, and every theme has a column; Classic\'s is empty', () => {
    expect(THEME_IDS).toEqual(['classic', 'calm', 'bold', 'adventurous', 'perilous']);
    expect(Object.keys(THEMES).sort()).toEqual([...THEME_IDS].sort());
    expect(THEMES.classic).toStrictEqual({});
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Tasks 7 and 10 (Crawford's note 3; Space renamed Distance, his answer 6; Voice
  // through the fourth band kind, his answer 3): four families.
  it('names four families in order - melody, envelope, distance, voice - each with three options in canonical order and its key set', () => {
    expect(ASPECT_FAMILY_IDS).toEqual(['melody', 'envelope', 'distance', 'voice']);
    expect(ASPECT_IDS_BY_FAMILY).toEqual({
      melody: ['hypnotic', 'mechanical', 'wandering'],
      envelope: ['plucked', 'swelling', 'held'],
      distance: ['near', 'far', 'remote'],
      voice: ['glassy', 'woody', 'hollow'],
    });
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
    expect(resolveBands('classic', { melody: 'plucked' })).toStrictEqual(CLASSIC);
  });

  it('a theme column with one key replaces only it: Calm differs from Classic at bpm and nowhere else', () => {
    const calm = resolveBands('calm', {});
    expect(calm.bpm).toStrictEqual({ min: 150, max: 160 });
    const { bpm: _calmBpm, ...restCalm } = calm;
    const { bpm: _classicBpm, ...restClassic } = CLASSIC;
    expect(restCalm).toStrictEqual(restClassic);
  });

  it('a theme with an empty column (Bold, injected empty) resolves to Classic exactly', () => {
    expect(resolveBands('bold', {})).toStrictEqual(CLASSIC);
  });

  it('an aspect option replaces only its family keys: Hypnotic differs from Classic at noteVariance and nowhere else', () => {
    const hypnotic = resolveBands('classic', { melody: 'hypnotic' });
    expect(hypnotic['robot.noteVariance']).toStrictEqual({ offShare: 0, min: 1, max: 2 });
    const { 'robot.noteVariance': _a, ...restHypnotic } = hypnotic;
    const { 'robot.noteVariance': _b, ...restClassic } = CLASSIC;
    expect(restHypnotic).toStrictEqual(restClassic);
  });

  it('a theme and an aspect compose: Calm plus Hypnotic carries both moves, the aspect over the theme', () => {
    const both = resolveBands('calm', { melody: 'hypnotic' });
    expect(both.bpm).toStrictEqual({ min: 150, max: 160 });
    expect(both['robot.noteVariance']).toStrictEqual({ offShare: 0, min: 1, max: 2 });
    expect(Object.keys(both)).toHaveLength(Object.keys(CLASSIC).length);
  });

  it('an aspect with an empty option column (Wandering, injected empty) leaves the theme\'s table as it was', () => {
    expect(resolveBands('calm', { melody: 'wandering' })).toStrictEqual(resolveBands('calm', {}));
  });

  it('a family given undefined is no aspect at all', () => {
    expect(resolveBands('classic', { melody: undefined })).toStrictEqual(CLASSIC);
  });

  it('returns a fresh table each time, never the Classic constant itself', () => {
    expect(resolveBands('classic', {})).not.toBe(CLASSIC);
  });

  it('types: an aspect option cannot name a key outside its family, and a theme column cannot leave the v1 key list', () => {
    type MelodyOption = (typeof ASPECT_FAMILIES)['melody']['options']['hypnotic'];
    const inFamily: MelodyOption = { 'robot.pitchRepeat': { min: 0, max: 10 } };
    expect(inFamily).toBeDefined();
    // @ts-expect-error - bpm is a world band, not a Melody key (spec §3: themes world-wide, aspects robot-side)
    const foreign: MelodyOption = { bpm: { min: 1, max: 2 } };
    expect(foreign).toBeDefined();
    const allowed: ThemeColumn = { 'robot.rests': { min: 0, max: 10 }, 'filterLPF.frequency': { min: 500, max: 1000 } };
    expect(allowed).toBeDefined();
    // @ts-expect-error - robot.dynamics is outside the v1 theme key list (spec assumption 16)
    const outside: ThemeColumn = { 'robot.dynamics': { min: 0, max: 10 } };
    expect(outside).toBeDefined();
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

  it.each(['calm', 'bold', 'adventurous', 'perilous'] as const)(
    '%s differs from Classic on a non-empty subset of the v1 key list and nowhere else',
    (theme) => {
      const column = themeColumn(theme);
      const moved = movedKeys(overlayBands(CLASSIC, column));
      expect(moved.length).toBeGreaterThan(0);
      for (const key of moved) expect(realThemes.THEME_BAND_KEYS as readonly string[]).toContain(key);
      // Every key the column names moves the band: a column entry equal to Classic's would be a no-op worth deleting.
      expect([...moved].sort()).toEqual(Object.keys(column).sort());
    },
  );

  it('Classic\'s column stays empty: Classic is the lifted table', () => {
    expect(realThemes.THEMES.classic).toStrictEqual({});
  });

  it('no two themes share a column: each is its own loading', () => {
    const columns = (['calm', 'bold', 'adventurous', 'perilous'] as const).map((theme) => JSON.stringify(themeColumn(theme)));
    expect(new Set(columns).size).toBe(4);
  });

  it.each(['hypnotic', 'mechanical', 'wandering'] as const)(
    'Melody %s differs from Classic on a non-empty subset of the four Melody keys and nowhere else',
    (option) => {
      const column = melodyColumn(option);
      const moved = movedKeys(overlayBands(CLASSIC, column));
      expect(moved.length).toBeGreaterThan(0);
      for (const key of moved) expect(realAspects.MELODY_BAND_KEYS as readonly string[]).toContain(key);
      expect([...moved].sort()).toEqual(Object.keys(column).sort());
    },
  );

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

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 7: the two new families' placeholder columns, until the listen (Task 11). Each
  // option moves only its family's keys, and the intent checks fail a wrong-way edit.
  it.each(['plucked', 'swelling', 'held'] as const)(
    'Envelope %s differs from Classic on a non-empty subset of the six Envelope keys and nowhere else',
    (option) => {
      const column = envelopeColumn(option);
      const moved = movedKeys(overlayBands(CLASSIC, column));
      expect(moved.length).toBeGreaterThan(0);
      for (const key of moved) expect(realAspects.ENVELOPE_BAND_KEYS as readonly string[]).toContain(key);
      expect([...moved].sort()).toEqual(Object.keys(column).sort());
    },
  );

  it.each(['near', 'far', 'remote'] as const)(
    'Distance %s differs from Classic on a non-empty subset of the two Distance keys and nowhere else',
    (option) => {
      const column = distanceColumn(option);
      const moved = movedKeys(overlayBands(CLASSIC, column));
      expect(moved.length).toBeGreaterThan(0);
      for (const key of moved) expect(realAspects.DISTANCE_BAND_KEYS as readonly string[]).toContain(key);
      expect([...moved].sort()).toEqual(Object.keys(column).sort());
    },
  );

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

  it('Far is deep in the reverb with little delay', () => {
    const far = distanceColumn('far');
    expect(far.reverbSend!.min).toBeGreaterThanOrEqual(0.4);
    expect(far.reverbSend!.lit).toBe(1);
    expect(far.delaySend!.max).toBeLessThanOrEqual(0.15);
  });

  it('Remote is deep in both rooms: reverb from 0.6 up, and a deep delay', () => {
    const remote = distanceColumn('remote');
    expect(remote.reverbSend!.min).toBeGreaterThanOrEqual(0.6);
    expect(remote.reverbSend!.lit).toBe(1);
    expect(remote.delaySend!.min).toBeGreaterThanOrEqual(0.3);
    expect(remote.delaySend!.lit).toBe(1);
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 10: the Voice family, its waveform through the fourth band kind (PickBand).
  it.each(['glassy', 'woody', 'hollow'] as const)(
    'Voice %s differs from Classic on a non-empty subset of the five Voice keys and nowhere else, its waveform pick moved',
    (option) => {
      const column = voiceColumn(option);
      const moved = movedKeys(overlayBands(CLASSIC, column));
      expect(moved.length).toBeGreaterThan(0);
      for (const key of moved) expect(realAspects.VOICE_BAND_KEYS as readonly string[]).toContain(key);
      expect([...moved].sort()).toEqual(Object.keys(column).sort());
      expect(moved).toContain('robot.waveform');
    },
  );

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

  it('every placeholder band is well formed and inside what its field can hold', () => {
    // The field's own bounds, per key the v1 list and the Melody family allow (spec assumption 16); a key missing here
    // is a key the list did not have when this was written, so it fails loudly rather than passing unbounded.
    const BOUNDS: Partial<Record<keyof BandTable, readonly [number, number]>> = {
      bpm: [20, 200], // the tempo the clock runs (src/constants/index.ts)
      'filterLPF.frequency': [20, 20000],
      'robot.attack': [0, ENVELOPE_TIME_MAX_SECONDS],
      'robot.decay': [0, ENVELOPE_TIME_MAX_SECONDS],
      'robot.sustain': [0, 1],
      'robot.release': [0, ENVELOPE_TIME_MAX_SECONDS],
      'robot.shapedAttack': [0, ENVELOPE_TIME_MAX_SECONDS],
      'robot.shapedRelease': [0, ENVELOPE_TIME_MAX_SECONDS],
      'robot.rhythmicDensity': [0, 100],
      'robot.rests': [0, 100],
      'robot.pitchRepeat': [0, 100],
      'robot.noteVariance': [1, 8],
      'robot.rhythmicMotifLength': [1, 8],
      reverbSend: [0, 1],
      delaySend: [0, 1],
      // The Voice keys (revisions Task 10): the bus filter's own slider ranges (ROBOT_BUS_FILTER_FREQ_RANGE,
      // ROBOT_BUS_FILTER_Q_RANGE) and the Signature Array's Gain slider (0-2).
      'robot.filterFreq': [20, 20000],
      'robot.accentFilterFreq': [20, 20000],
      'robot.accentFilterQ': [0.1, 20],
      'robot.layerGain': [0, 2],
    };
    const columns: Partial<BandTable>[] = [
      ...Object.values(realThemes.THEMES),
      ...Object.values(realAspects.ASPECT_FAMILIES.melody.options),
      ...Object.values(realAspects.ASPECT_FAMILIES.envelope.options),
      ...Object.values(realAspects.ASPECT_FAMILIES.distance.options),
      ...Object.values(realAspects.ASPECT_FAMILIES.voice.options),
    ];
    expect(columns.length).toBe(17);
    for (const column of columns) {
      for (const [key, band] of Object.entries(column) as [keyof BandTable, BandTable[keyof BandTable]][]) {
        if ('weights' in band) {
          // A pick: every weight a non-negative number, at least one above zero, and only the five waveforms named.
          expect(Object.keys(band.weights).sort(), key).toEqual(['pulse', 'sawtooth', 'sine', 'square', 'triangle']);
          expect(Object.values(band.weights).every((w) => Number.isFinite(w) && w >= 0), key).toBe(true);
          expect(Object.values(band.weights).some((w) => w > 0), key).toBe(true);
          continue;
        }
        const bounds = BOUNDS[key];
        expect(bounds, `${key} has no bound here`).toBeDefined();
        expect(band.min, key).toBeLessThanOrEqual(band.max);
        expect(band.min, key).toBeGreaterThanOrEqual(bounds![0]);
        expect(band.max, key).toBeLessThanOrEqual(bounds![1]);
        if ('lit' in band) {
          expect(band.lit, key).toBeGreaterThan(0);
          expect(band.lit, key).toBeLessThanOrEqual(1);
        }
        if ('offShare' in band) {
          // A toggle always on (offShare 0) is a legitimate aspect; one never on is not.
          expect(band.offShare, key).toBeGreaterThanOrEqual(0);
          expect(band.offShare, key).toBeLessThan(1);
          expect(Number.isInteger(band.min) && Number.isInteger(band.max), key).toBe(true);
        }
      }
    }
  });
});
