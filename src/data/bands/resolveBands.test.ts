// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { overlayBands, resolveBands } from './resolveBands';
import { CLASSIC } from './classic';
import { ROBOT_LIT_KEYS, ROBOT_RANGE_KEYS, ROBOT_TOGGLE_KEYS, type BandTable } from './bandKeys';

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

  it('holds 78 bands: one tempo, fifty global rows, twenty-two robot bands and five sends', () => {
    expect(Object.keys(CLASSIC)).toHaveLength(78);
    expect(ROBOT_RANGE_KEYS.length + ROBOT_LIT_KEYS.length + ROBOT_TOGGLE_KEYS.length).toBe(22);
  });

  it('keeps every lit share and off share a real share in (0, 1], and every band min <= max', () => {
    for (const [key, band] of Object.entries(CLASSIC)) {
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

  it('shapes the three robot kinds by key: a toggle key has offShare, a lit key has lit, a range key has neither', () => {
    for (const key of ROBOT_TOGGLE_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['max', 'min', 'offShare']);
    for (const key of ROBOT_LIT_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['lit', 'max', 'min']);
    for (const key of ROBOT_RANGE_KEYS) expect(Object.keys(CLASSIC[key]).sort(), key).toEqual(['max', 'min']);
  });

  it('types each key to its kind, so a range band has no lit share and a toggle band is not a range', () => {
    expect(CLASSIC['robot.noteVariance'].offShare).toBe(0.15);
    expect(CLASSIC.reverbSend.lit).toBe(1);
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
    expect(Object.keys(out)).toHaveLength(78);
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
