// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';

// Spy on getSeededVal while keeping its real behavior (the worldTransition.test.ts
// importOriginal pattern) — Task 6's acceptance criterion needs to see exactly which
// dataId keys generateGlobalLfoLinks queries, without breaking every other test in
// this file that depends on getSeededVal's real seeded output.
vi.mock('./getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./getSeededVal')>();
  return {
    ...actual,
    getSeededVal: vi.fn(actual.getSeededVal),
    // Global Modulation T7: the pedals' four roll draws are uniform world-level choices, so they go through this.
    getUniformSeededVal: vi.fn(actual.getUniformSeededVal),
  };
});

// Same wrapper for pickSeedNoteValue: real behavior by default, so the Sync tests exercise the true
// pick, while one test can force it to `undefined` (every band empty) to prove the fallback.
vi.mock('./tempoSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tempoSync')>();
  return { ...actual, pickSeedNoteValue: vi.fn(actual.pickSeedNoteValue) };
});

import {
  generateGlobalAudioSettings,
  generateLfoBankSettings,
  generateGlobalLfoLinks,
  generatePingVarianceAutomation,
  generateSwellFrequency,
  generateSwellDuration,
  generateHumanize,
  HUMANIZE_SEED_RANGE,
  scaleUnitValue,
  pickColourCharacter,
  COLOUR_CHARACTERS,
  COLOUR_CHARACTER_NODES,
  COLOUR_CHARACTER_BANDS,
  PEDAL_LIT_EDGE,
  PEDAL_SYNC_ODDS,
  MAX_LIT_PEDALS,
  MOTION_PEDALS,
  LFO_BANK_RATE_BANDS,
  LFO_BANK_DRIFT_SEED_RANGE,
  LFO_BANK_SYNC_BAND_ORDER,
  GLOBAL_LFO_COMPANION_EDGE,
} from './globalAudioSeed';
import { evictAttenuationStyleNoiseMap, getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal, getUniformSeededVal } from './getSeededVal';
import { allowedRateNoteValues, pickSeedNoteValue } from './tempoSync';
import { generateAttenuationStyleBpm, BPM_SEED_RANGE } from './bpmSeed';
import { allowedNoteValues, isNoteValue, noteValueHz, noteValueSeconds } from '@/data/noteValues';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { ROBOT_SEND_LOADING_RANGES } from '@/data/robotSendLoadingRanges';
import { type GlobalAudioSeedFieldKey, type LoadingRangeKey } from '@/data/globalAudioSeedRanges';
import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS, LFO_SHAPES, type GlobalLfoTargetId } from '@/types/lfo';
import { PEDAL_RATE_RANGE_HZ } from '@/types/globalAudio';
import { GLOBAL_AUDIO_SEED_RANGES } from '@/data/globalAudioSeedRanges';
import { SWELL_FREQUENCY_STEPS, HUMANIZE_SCHEMA } from '@/data/audioRigConfig';

// ========================================
// TESTS
// ========================================

describe('scaleUnitValue', () => {
  it('maps t=0 to min and t=1 to max, for both scales', () => {
    expect(scaleUnitValue(0, { min: 20, max: 20000, scale: 'log' })).toBe(20);
    expect(scaleUnitValue(1, { min: 20, max: 20000, scale: 'log' })).toBe(20000);
    expect(scaleUnitValue(0, { min: -60, max: 0, scale: 'linear' })).toBe(-60);
    expect(scaleUnitValue(1, { min: -60, max: 0, scale: 'linear' })).toBe(0);
  });

  it('interpolates linear fields arithmetically at t=0.5', () => {
    expect(scaleUnitValue(0.5, { min: -12, max: 12, scale: 'linear' })).toBe(0);
  });

  it('interpolates log fields geometrically at t=0.5, not arithmetically', () => {
    // Geometric mean of 20 and 20000 is sqrt(20 * 20000) ≈ 632.46 — nowhere
    // near the linear midpoint of 10010. This is the concrete proof that log
    // fields are NOT sampled the same way as linear ones.
    const result = scaleUnitValue(0.5, { min: 20, max: 20000, scale: 'log' });
    expect(result).toBeCloseTo(Math.sqrt(20 * 20000), 5);
    expect(result).toBeLessThan(1000); // far below the linear midpoint (10010)
  });

  it('clamps out-of-range t instead of extrapolating', () => {
    expect(scaleUnitValue(-0.5, { min: 0, max: 1, scale: 'linear' })).toBe(0);
    expect(scaleUnitValue(1.5, { min: 0, max: 1, scale: 'linear' })).toBe(1);
  });
});

describe('generateGlobalAudioSettings', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
  });

  it('returns a fully-populated GlobalAudioSettings', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(settings.compressor).toBeDefined();
    expect(settings.eq3).toBeDefined();
    expect(settings.filterLPF).toBeDefined();
    expect(settings.filterHPF).toBeDefined();
    expect(settings.delay).toBeDefined();
    expect(settings.reverb).toBeDefined();
    expect(settings.limiter).toBeDefined();
  });

  // V2 removed the old Chorus; Global Pedals (docs/specs/GLOBAL_PEDALS.md) brings one back as a seeded pedal.
  it('returns the five Global Pedals blocks and no reverb.dampening field', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    for (const key of ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const) {
      expect(key in settings, key).toBe(true);
    }
    expect('dampening' in settings.reverb).toBe(false);
  });

  it('fixes filterLPF/filterHPF type to their identity, not seeded', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(settings.filterLPF.type).toBe('lowpass');
    expect(settings.filterHPF.type).toBe('highpass');
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same settings', () => {
    const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect(second).toEqual(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    const b = generateGlobalAudioSettings('seed-test-planet-b', 'Zenith');
    expect(b).not.toEqual(a);
  });

  it('keeps every sampled field within its narrower LOADING range, not just the wider full range', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    // reverb.wet and delay.wet are absent on purpose: they are the fixed full return now, not sampled, and their
    // loading rows are the per-robot send bands (Robot Sends T6) - the test below pins them to 1.
    const valueByKey: Partial<Record<LoadingRangeKey, number>> = {
      'compressor.threshold': settings.compressor.threshold,
      'compressor.ratio': settings.compressor.ratio,
      'compressor.attack': settings.compressor.attack,
      'compressor.release': settings.compressor.release,
      'compressor.knee': settings.compressor.knee,
      'eq3.low': settings.eq3.low,
      'eq3.mid': settings.eq3.mid,
      'eq3.high': settings.eq3.high,
      'filterLPF.frequency': settings.filterLPF.frequency,
      'filterLPF.Q': settings.filterLPF.Q,
      'filterHPF.frequency': settings.filterHPF.frequency,
      'filterHPF.Q': settings.filterHPF.Q,
      'delay.delayTime': settings.delay.delayTime,
      'delay.feedback': settings.delay.feedback,
      'reverb.decay': settings.reverb.decay,
      'reverb.preDelay': settings.reverb.preDelay,
      'limiter.threshold': settings.limiter.threshold,
      // Global Colour T5: the three shape values are always drawn from their lit band, lit or not.
      'distortion.amount': settings.distortion.amount,
      'chebyshev.order': settings.chebyshev.order,
      'bitCrusher.bits': settings.bitCrusher.bits,
      // Global Modulation T7: the eleven pedal shape values are always drawn from their lit band, lit or not.
      'autoWah.baseFrequency': settings.autoWah.baseFrequency,
      'autoWah.octaves': settings.autoWah.octaves,
      'autoWah.sensitivity': settings.autoWah.sensitivity,
      'autoWah.Q': settings.autoWah.Q,
      'autoWah.gain': settings.autoWah.gain,
      'autoWah.follower': settings.autoWah.follower,
      'phaser.rate': settings.phaser.rate,
      'phaser.octaves': settings.phaser.octaves,
      'phaser.baseFrequency': settings.phaser.baseFrequency,
      'phaser.stages': settings.phaser.stages,
      'phaser.Q': settings.phaser.Q,
      // Global Pedals T8: the eleven pedal shape values and Width are always drawn from their lit band, lit or not.
      'chorus.rate': settings.chorus.rate,
      'chorus.delayTime': settings.chorus.delayTime,
      'chorus.depth': settings.chorus.depth,
      'chorus.spread': settings.chorus.spread,
      'chorus.feedback': settings.chorus.feedback,
      'tremolo.rate': settings.tremolo.rate,
      'tremolo.depth': settings.tremolo.depth,
      'tremolo.spread': settings.tremolo.spread,
      'vibrato.rate': settings.vibrato.rate,
      'vibrato.depth': settings.vibrato.depth,
      'stereoWidener.width': settings.stereoWidener.width,
    };
    const sampledKeys = Object.keys(valueByKey) as LoadingRangeKey[];
    // Sanity: every loading row except the wet rows is checked, so a newly added row cannot slip past. (The Reverb and
    // Delay wet rows left the loading table at Robot Effect Sends T1: those keys are Returns, never seeded.)
    // The three colour wets are absent on purpose too: an unlit node seeds wet 0, which is outside its lit band
    // (they are pinned by the colour tests below).
    const COLOUR_WET_ROWS = 3;
    // Global Modulation: the two pedal Mix rows are absent for the same reason - a dark pedal seeds wet 0 (they are
    // pinned by the pedal tests below). The eleven pedal shape rows are in valueByKey above.
    const PEDAL_WET_ROWS = 2;
    // Global Pedals T2: the four motion-pedal Mix rows are absent for the same reason (a dark pedal seeds wet 0), and
    // the shift row because it is a MAGNITUDE band - the seeded shift is signed, so half of all worlds sit outside it
    // (pinned by the T8 shifter tests instead).
    const MOTION_WET_ROWS = 4;
    const SHIFT_MAGNITUDE_ROW = 1;
    expect(sampledKeys.length).toBe(
      Object.keys(GLOBAL_AUDIO_LOADING_RANGES).length -
        COLOUR_WET_ROWS -
        PEDAL_WET_ROWS -
        MOTION_WET_ROWS -
        SHIFT_MAGNITUDE_ROW,
    );
    for (const key of sampledKeys) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(valueByKey[key], `${key} should be >= ${min}`).toBeGreaterThanOrEqual(min);
      expect(valueByKey[key], `${key} should be <= ${max}`).toBeLessThanOrEqual(max);
    }
  });

  it('no longer carries an enabled field on any effect, or a globalBypass flag — removed, off states are expressed via the params themselves', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect('globalBypass' in settings).toBe(false);
    expect('enabled' in settings.compressor).toBe(false);
    expect('enabled' in settings.eq3).toBe(false);
    expect('enabled' in settings.filterLPF).toBe(false);
    expect('enabled' in settings.filterHPF).toBe(false);
    expect('enabled' in settings.reverb).toBe(false);
    expect('enabled' in settings.limiter).toBe(false);
    expect('enabled' in settings.delay).toBe(false);
  });

  // Robot Sends T6 (docs/specs/ROBOT_SENDS.md §1.2): reverb.wet and delay.wet are the global rooms' RETURN level
  // now - a fixed full return, never sampled. Each robot's own seeded send decides how much echo it throws; the
  // old ~25 % "quiet Delay" roll moved to the robots (robot.send.delay.quiet). These replace the old quiet tests.
  describe('the global rooms are a fixed full return (Robot Sends T6)', () => {
    const SAMPLE_ATTENUATION_STYLES = 40;
    afterEach(() => {
      for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) evictAttenuationStyleNoiseMap(`seed-return-sample-${i}`);
    });

    it('seeds reverb.wet and delay.wet at exactly 1 for every Attenuation Style - never a sampled value, never a quiet 0', () => {
      for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
        const settings = generateGlobalAudioSettings(`seed-return-sample-${i}`, `ReturnSample${i}`);
        expect(settings.reverb.wet, `reverb style ${i}`).toBe(1);
        expect(settings.delay.wet, `delay style ${i}`).toBe(1);
      }
    });

    it('is 1 whatever the style name is, for a style the old quiet roll would have silenced as well as one it would not', () => {
      // The oracle styles: alpha used to seed delay.wet 0.24, theta used to hit the quiet branch (0).
      expect(generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha').delay.wet).toBe(1);
      expect(generateGlobalAudioSettings('oracle-theta', 'oracle-theta').delay.wet).toBe(1);
      evictAttenuationStyleNoiseMap('oracle-alpha');
      evictAttenuationStyleNoiseMap('oracle-theta');
    });

    // Robot Effect Sends T2 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 4): the Colour room's Return is never seeded.
    it('emits the Colour room Return from the defaults (1) for every style, and never draws it', () => {
      vi.mocked(getSeededVal).mockClear();
      vi.mocked(getUniformSeededVal).mockClear();
      for (let i = 0; i < 8; i++) {
        expect(generateGlobalAudioSettings(`colour-room-${i}`, `ColourRoom${i}`).colourRoom, `style ${i}`).toStrictEqual({ wet: 1 });
        evictAttenuationStyleNoiseMap(`colour-room-${i}`);
      }
      const dataIds = [...vi.mocked(getSeededVal).mock.calls, ...vi.mocked(getUniformSeededVal).mock.calls].map(([, dataId]) => dataId);
      expect(dataIds.length).toBeGreaterThan(0);
      expect(dataIds.filter((id) => String(id).includes('colourRoom'))).toEqual([]);
    });

    it('no longer draws the wet fields or the delay quiet roll from the noise map', () => {
      vi.mocked(getSeededVal).mockClear();

      generateGlobalAudioSettings('seed-test-planet', 'Nova');

      const dataIds = vi.mocked(getSeededVal).mock.calls.map(([, dataId]) => dataId);
      expect(dataIds).toContain('globalAudio.reverb.decay'); // sanity: the sampled fields are still drawn
      expect(dataIds).toContain('globalAudio.delay.syncMode'); // and so is Delay's Sync roll
      expect(dataIds).not.toContain('globalAudio.delay.quiet');
      expect(dataIds).not.toContain('globalAudio.delay.wet');
      expect(dataIds).not.toContain('globalAudio.reverb.wet');
    });

    // Robot Effect Sends T1: the per-robot send bands moved to the robot send table; the loading table has no Return row.
    it('keeps the per-robot send bands in the robot send table and no Return row in the loading table', () => {
      expect(ROBOT_SEND_LOADING_RANGES.reverbSend).toEqual({ min: 0.1, max: 0.6, lit: 1 });
      expect(ROBOT_SEND_LOADING_RANGES.delaySend).toEqual({ min: 0, max: 0.3, lit: 0.75 });
      expect(Object.keys(GLOBAL_AUDIO_LOADING_RANGES)).not.toContain('reverb.wet');
      expect(Object.keys(GLOBAL_AUDIO_LOADING_RANGES)).not.toContain('delay.wet');
    });
  });

  describe('quantization (SEEDED_SLIDER_VALUE_QUANTIZATION Task 5)', () => {
    afterEach(() => {
      for (let i = 0; i < 20; i++) evictAttenuationStyleNoiseMap(`seed-quantize-sample-${i}`);
    });

    it('quantizes every field with a declared step (eq3.low, delay.delayTime, compressor.ratio) onto its own min + n*step grid, across many seeds', () => {
      const fieldsWithStep: Array<[GlobalAudioSeedFieldKey, string]> = [
        ['eq3.low', 'eq3'],
        ['delay.delayTime', 'delay'],
        ['compressor.ratio', 'compressor'],
      ];
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        for (const [key, block] of fieldsWithStep) {
          const field = key.split('.')[1] as keyof typeof settings.eq3;
          const value = (settings as unknown as Record<string, Record<string, number>>)[block][field];
          const { min, step } = GLOBAL_AUDIO_SEED_RANGES[key];
          const stepsFromMin = (value - min) / (step as number);
          expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), `${key} attenuationStyle ${i}`).toBeLessThan(1e-9);
        }
      }
    });

    it('leaves a field with no declared step (filterLPF.frequency) byte-for-byte unaffected — regression, not just "still works"', () => {
      const settings = generateGlobalAudioSettings('regression-probe-seed', 'ProbePlanet');
      expect(settings.filterLPF.frequency).toBe(4730.514641816347);
    });

    it('quantizes compressor.threshold and compressor.knee to a whole dB, across many seeds', () => {
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        expect(Number.isInteger(settings.compressor.threshold), `threshold attenuationStyle ${i}`).toBe(true);
        expect(Number.isInteger(settings.compressor.knee), `knee attenuationStyle ${i}`).toBe(true);
      }
    });

    it('quantizes limiter.threshold to a whole dB, across many seeds', () => {
      for (let i = 0; i < 20; i++) {
        const settings = generateGlobalAudioSettings(`seed-quantize-sample-${i}`, `QuantizeSample${i}`);
        expect(Number.isInteger(settings.limiter.threshold), `attenuationStyle ${i}`).toBe(true);
      }
    });

  });

});

// Global Colour T5 (docs/specs/GLOBAL_COLOUR.md section 1.2): one seeded character picks which of the three colour
// nodes a fresh world lights; the six value draws supply the numbers.
describe('the colour character (Global Colour)', () => {
  type ColourNode = 'distortion' | 'chebyshev' | 'bitCrusher';
  const NODE_KEYS: readonly ColourNode[] = ['distortion', 'chebyshev', 'bitCrusher'];
  const litNodes = (s: ReturnType<typeof generateGlobalAudioSettings>): ColourNode[] => NODE_KEYS.filter((k) => s[k].wet > 0);
  const characterOf = (s: ReturnType<typeof generateGlobalAudioSettings>) => {
    const lit = litNodes(s);
    return COLOUR_CHARACTERS.find((c) => {
      const nodes = COLOUR_CHARACTER_NODES[c];
      return nodes.length === lit.length && nodes.every((n) => lit.includes(n));
    });
  };

  afterEach(() => {
    for (let i = 0; i < 300; i++) evictAttenuationStyleNoiseMap(`colour-sample-${i}`);
  });

  describe('COLOUR_CHARACTERS and COLOUR_CHARACTER_NODES', () => {
    // Crawford, T14 (2026-10-15): at most one colour effect is on per world at load. The three pair characters the
    // spec first drew (about 15 % of worlds) are gone; their share went to the singles.
    it('names four characters: clean and one per effect, with no pair', () => {
      expect([...COLOUR_CHARACTERS]).toStrictEqual(['clean', 'drive', 'fold', 'crush']);
    });

    it('lights the node each name says, and never more than one', () => {
      expect(COLOUR_CHARACTER_NODES.clean).toStrictEqual([]);
      expect(COLOUR_CHARACTER_NODES.drive).toStrictEqual(['distortion']);
      expect(COLOUR_CHARACTER_NODES.fold).toStrictEqual(['chebyshev']);
      expect(COLOUR_CHARACTER_NODES.crush).toStrictEqual(['bitCrusher']);
      for (const c of COLOUR_CHARACTERS) expect(COLOUR_CHARACTER_NODES[c].length, c).toBeLessThanOrEqual(1);
    });

    it('has no entry for a pair character (a stale key would let a pair come back unnoticed)', () => {
      expect(Object.keys(COLOUR_CHARACTER_NODES)).toStrictEqual(['clean', 'drive', 'fold', 'crush']);
    });
  });

  describe('COLOUR_CHARACTER_BANDS', () => {
    it('has one cumulative upper edge per character, strictly increasing, ending at exactly 1', () => {
      expect(COLOUR_CHARACTER_BANDS).toHaveLength(COLOUR_CHARACTERS.length);
      for (let i = 1; i < COLOUR_CHARACTER_BANDS.length; i++) {
        expect(COLOUR_CHARACTER_BANDS[i], `edge ${i}`).toBeGreaterThan(COLOUR_CHARACTER_BANDS[i - 1]);
      }
      expect(COLOUR_CHARACTER_BANDS[0]).toBeGreaterThan(0);
      expect(COLOUR_CHARACTER_BANDS.at(-1)).toBe(1);
    });
  });

  describe('pickColourCharacter', () => {
    it('maps a draw in the middle of each band to that bands character', () => {
      COLOUR_CHARACTERS.forEach((character, i) => {
        const lo = i === 0 ? 0 : COLOUR_CHARACTER_BANDS[i - 1];
        const hi = COLOUR_CHARACTER_BANDS[i];
        expect(pickColourCharacter((lo + hi) / 2), character).toBe(character);
      });
    });

    it('puts a draw exactly on an edge in the band above it (edges are exclusive upper bounds)', () => {
      for (let i = 0; i < COLOUR_CHARACTERS.length - 1; i++) {
        expect(pickColourCharacter(COLOUR_CHARACTER_BANDS[i]), `edge ${i}`).toBe(COLOUR_CHARACTERS[i + 1]);
        expect(pickColourCharacter(COLOUR_CHARACTER_BANDS[i] - 1e-9), `just under edge ${i}`).toBe(COLOUR_CHARACTERS[i]);
      }
    });

    it('clamps the extremes: 0 and below is clean, 1 and above is the last character', () => {
      expect(pickColourCharacter(0)).toBe('clean');
      expect(pickColourCharacter(-5)).toBe('clean');
      expect(pickColourCharacter(1)).toBe('crush');
      expect(pickColourCharacter(7)).toBe('crush');
    });

    it('treats a non-finite draw as clean rather than lighting a node by accident', () => {
      expect(pickColourCharacter(Number.NaN)).toBe('clean');
    });
  });

  describe('generateGlobalAudioSettings colour blocks', () => {
    it('is deterministic - the same style gives the same character and values, fresh noise map or cached', () => {
      const first = generateGlobalAudioSettings('colour-sample-1', 'ColourSample1');
      evictAttenuationStyleNoiseMap('colour-sample-1');
      const second = generateGlobalAudioSettings('colour-sample-1', 'ColourSample1');
      expect(second.distortion).toStrictEqual(first.distortion);
      expect(second.chebyshev).toStrictEqual(first.chebyshev);
      expect(second.bitCrusher).toStrictEqual(first.bitCrusher);
    });

    it('draws more than one character across styles, so worlds differ from each other', () => {
      const seen = new Set<string | undefined>();
      for (let i = 0; i < 100; i++) seen.add(characterOf(generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`)));
      expect(seen.size).toBeGreaterThan(3);
    });

    it('seeds order and bits as integers inside their full ranges, on every style', () => {
      for (let i = 0; i < 300; i++) {
        const s = generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`);
        expect(Number.isInteger(s.chebyshev.order), `order style ${i}`).toBe(true);
        expect(Number.isInteger(s.bitCrusher.bits), `bits style ${i}`).toBe(true);
        expect(s.chebyshev.order).toBeGreaterThanOrEqual(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].min);
        expect(s.chebyshev.order).toBeLessThanOrEqual(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].max);
        expect(s.bitCrusher.bits).toBeGreaterThanOrEqual(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits'].min);
        expect(s.bitCrusher.bits).toBeLessThanOrEqual(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits'].max);
      }
    });

    it('keeps every shape value inside its loading band whether the node is lit or not', () => {
      const bands = GLOBAL_AUDIO_LOADING_RANGES;
      for (let i = 0; i < 300; i++) {
        const s = generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`);
        expect(s.distortion.amount, `amount style ${i}`).toBeGreaterThanOrEqual(bands['distortion.amount'].min);
        expect(s.distortion.amount, `amount style ${i}`).toBeLessThanOrEqual(bands['distortion.amount'].max);
        expect(s.chebyshev.order, `order style ${i}`).toBeGreaterThanOrEqual(bands['chebyshev.order'].min);
        expect(s.chebyshev.order, `order style ${i}`).toBeLessThanOrEqual(bands['chebyshev.order'].max);
        expect(s.bitCrusher.bits, `bits style ${i}`).toBeGreaterThanOrEqual(bands['bitCrusher.bits'].min);
        expect(s.bitCrusher.bits, `bits style ${i}`).toBeLessThanOrEqual(bands['bitCrusher.bits'].max);
      }
    });

    it('puts a lit nodes wet inside its loading band and an unlit nodes wet at exactly 0', () => {
      const wetBand = {
        distortion: GLOBAL_AUDIO_LOADING_RANGES['distortion.wet'],
        chebyshev: GLOBAL_AUDIO_LOADING_RANGES['chebyshev.wet'],
        bitCrusher: GLOBAL_AUDIO_LOADING_RANGES['bitCrusher.wet'],
      };
      for (let i = 0; i < 300; i++) {
        const s = generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`);
        const character = characterOf(s);
        expect(character, `style ${i} has a recognisable character`).toBeDefined();
        for (const node of NODE_KEYS) {
          const lit = COLOUR_CHARACTER_NODES[character!].includes(node);
          if (lit) {
            // To within float noise at the top edge: a seed on the 0.35 edge is 35 * 0.01 = 0.35000000000000003.
            expect(s[node].wet, `${node} style ${i}`).toBeGreaterThanOrEqual(wetBand[node].min - 1e-9);
            expect(s[node].wet, `${node} style ${i}`).toBeLessThanOrEqual(wetBand[node].max + 1e-9);
          } else {
            expect(s[node].wet, `${node} style ${i}`).toBe(0);
          }
        }
      }
    });

    // Crawford, T14 (2026-10-15): no colour Mix above 0.25 on load. The property is on the real seeder, not just the
    // table, so a future change to the draw or the quantiser cannot slip a loud Mix past a correct band.
    // These three loops generate 3 000 whole worlds each; Global Pedals T8 doubled a world's draw count (about 1 s -> 2 s
    // alone), which crossed vitest's 5 s default under the parallel full suite, so each carries its own timeout.
    // Classic Band Retune T2 raised the ceiling to 0.35 (Decision 1 = B); Crawford's listen (Checkpoint B, 2026-10-21, "much
    // more subtle") put every colour Mix in one band, 0.1 to 0.2, under the original 0.25 ceiling. Literal numbers: these hold
    // the seeder to that, not to the table.
    it('never seeds a colour Mix above 0.2, and a lit one never below 0.1, over 3000 styles', () => {
      const floors = { distortion: 0.1, chebyshev: 0.1, bitCrusher: 0.1 } as const;
      let litSeen = 0;
      let highest = 0;
      let lowestLit = 1;
      for (let i = 0; i < 3000; i++) {
        const s = generateGlobalAudioSettings(`colour-ceiling-${i}`, `ColourCeiling${i}`);
        for (const node of NODE_KEYS) {
          highest = Math.max(highest, s[node].wet);
          expect(s[node].wet, `${node} style ${i}`).toBeLessThanOrEqual(0.2 + 1e-9);
          if (s[node].wet > 0) {
            litSeen += 1;
            lowestLit = Math.min(lowestLit, s[node].wet);
            expect(s[node].wet, `${node} style ${i} lit floor`).toBeGreaterThanOrEqual(floors[node] - 1e-9);
          }
        }
      }
      expect(litSeen, 'the sample really contained lit nodes').toBeGreaterThan(1000);
      expect(highest, 'the top of the band is reachable, not an accidental cap at zero').toBeGreaterThan(0.18);
      expect(lowestLit, 'the bottom of the band is reachable').toBeLessThan(0.12);
    }, 30000);

    it('lights at most one node in any world, over 3000 styles (never two, never three)', () => {
      let one = 0;
      let none = 0;
      for (let i = 0; i < 3000; i++) {
        const id = `colour-one-${i}`;
        const lit = litNodes(generateGlobalAudioSettings(id, `ColourOne${i}`)).length;
        evictAttenuationStyleNoiseMap(id);
        expect(lit, `style ${i}`).toBeLessThanOrEqual(1);
        if (lit === 1) one++;
        else none++;
      }
      expect(one, 'the sample really contained lit worlds').toBeGreaterThan(1500);
      expect(none, 'and clean ones').toBeGreaterThan(300);
    }, 30000);

    // The raw draw is bell-curved and discrete (see COLOUR_CHARACTER_BANDS), so the nominal edges
    // 0.25 / 0.45 / 0.65 / 0.85 / 0.90 / 0.95 gave 10 / 34 / 18 / 30 / 4 / 4 / 0 %. The edges were fitted on styles
    // named 'ColourCalibration<n>'; this test samples a different set, so it is a hold-out check and not a
    // restatement of the fit.
    it('realises the target shares over 3000 hold-out styles, within 3 points: clean 25 and each single 25', () => {
      const TARGET: Record<(typeof COLOUR_CHARACTERS)[number], number> = {
        clean: 25,
        drive: 25,
        fold: 25,
        crush: 25,
      };
      const N = 3000;
      const counts = new Map<string, number>();
      let threeNode = 0;
      for (let i = 0; i < N; i++) {
        const id = `colour-share-${i}`;
        const s = generateGlobalAudioSettings(id, `ColourShare${i}`);
        evictAttenuationStyleNoiseMap(id);
        if (litNodes(s).length === 3) threeNode++;
        const character = characterOf(s) ?? 'unrecognised';
        counts.set(character, (counts.get(character) ?? 0) + 1);
      }
      expect(counts.get('unrecognised') ?? 0).toBe(0);
      expect(threeNode).toBe(0);
      for (const character of COLOUR_CHARACTERS) {
        const share = ((counts.get(character) ?? 0) / N) * 100;
        expect(Math.abs(share - TARGET[character]), `${character}: realised ${share.toFixed(1)} %`).toBeLessThanOrEqual(3);
      }
    }, 30000);

    it('reads exactly the new colour and pedal seed keys on every style, whatever its character, and renames no existing key', () => {
      const EXISTING = [
        'compressor.threshold', 'compressor.ratio', 'compressor.attack', 'compressor.release', 'compressor.knee',
        'eq3.low', 'eq3.mid', 'eq3.high',
        'filterLPF.frequency', 'filterLPF.Q', 'filterHPF.frequency', 'filterHPF.Q',
        'delay.syncMode', 'delay.syncNote', 'delay.delayTime', 'delay.feedback',
        'reverb.decay', 'reverb.preDelay',
        'limiter.threshold',
      ];
      const NEW = [
        'colour.character',
        'distortion.amount', 'distortion.wet',
        'chebyshev.order', 'chebyshev.wet',
        'bitCrusher.bits', 'bitCrusher.wet',
        // The pedals' seventeen draws (four rolls and thirteen values) are uniform draws: they go through
        // getUniformSeededVal, not this spy, and are pinned by the pedal tests below.
      ];
      const expected = [...EXISTING, ...NEW].map((k) => `globalAudio.${k}`).sort();
      for (let i = 0; i < 40; i++) {
        vi.mocked(getSeededVal).mockClear();
        generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`);
        const keys = vi
          .mocked(getSeededVal)
          .mock.calls.map((call) => call[1])
          // 'globalAudio.bpm' is bpmSeed's own draw, made only when the Delay seeds Anchored - not this seeder's.
          .filter((key) => key.startsWith('globalAudio.') && key !== 'globalAudio.bpm')
          .sort();
        expect(keys, `style ${i}`).toStrictEqual(expected);
      }
    });
  });
});

// Global Modulation T7 (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.2): two independent lit rolls at one third each, a
// sync pair for the Phaser, and thirteen value draws read on every style.
describe('the modulation pedals (Global Modulation)', () => {
  type Seeded = ReturnType<typeof generateGlobalAudioSettings>;
  const PEDAL_SAMPLES = 3000;
  const sampleId = (i: number) => `PedalShare${i}`;
  let samples: Array<{ i: number; s: Seeded }> = [];
  const wahLit = (s: Seeded) => s.autoWah.wet > 0;
  const phaserLit = (s: Seeded) => s.phaser.wet > 0;
  const colourLit = (s: Seeded) => s.distortion.wet > 0 || s.chebyshev.wet > 0 || s.bitCrusher.wet > 0;
  const share = (pick: (s: Seeded) => boolean) => samples.filter(({ s }) => pick(s)).length / samples.length;
  const onGrid = (value: number, key: GlobalAudioSeedFieldKey): boolean => {
    const { min, step } = GLOBAL_AUDIO_SEED_RANGES[key];
    const n = (value - min) / (step as number);
    return Math.abs(n - Math.round(n)) < 1e-9;
  };

  beforeAll(() => {
    // Held out from the sets the shares were measured on ('PedalCalibration<n>', 20 000 styles). Generated once and
    // shared by the tests below: three thousand noise maps per test would be minutes.
    samples = [];
    for (let i = 0; i < PEDAL_SAMPLES; i++) {
      samples.push({ i, s: generateGlobalAudioSettings(sampleId(i), sampleId(i)) });
      evictAttenuationStyleNoiseMap(sampleId(i));
    }
  }, 120000);

  describe('PEDAL_LIT_EDGE and PEDAL_SYNC_ODDS', () => {
    // Measured, not fitted: the lit rolls and the sync roll are uniform draws (getUniformSeededVal), so the nominal edge
    // is the realised share. Over 20 000 styles ('PedalCalibration<n>'): AutoWah lit 33.07 %, Phaser lit 33.30 %, both lit
    // 11.22 % (product 11.01 %), a lit Phaser Sync 50.20 %, and each pedal lit alongside a lit Colour 24.95 % / 25.09 %
    // against products of 24.95 % / 25.12 % - independent of each other and of Colour's character draw. The plain
    // getSeededVal draw was tried first and rejected: it takes 24 distinct values for autoWah.lit across 20 000 styles
    // and put a lit wah in 55.9 % of clean-Colour worlds against 26.8 % of coloured ones.
    it('puts both lit edges at one third', () => {
      // Global Pedals T8 widened the record to six pedals; these two edges are unchanged.
      expect(PEDAL_LIT_EDGE.autoWah).toBe(1 / 3);
      expect(PEDAL_LIT_EDGE.phaser).toBe(1 / 3);
    });

    // Classic Band Retune T3 (row 13): the odds are per pedal. A Free tremolo beats against the 16th grid, so it seeds Sync
    // in three worlds of four; the Phaser, Chorus and Vibrato don't care and stay at half.
    it('keeps the sync odds per pedal: three quarters for the Tremolo, one half for the Phaser, Chorus and Vibrato', () => {
      expect(PEDAL_SYNC_ODDS).toStrictEqual({ phaser: 0.5, chorus: 0.5, tremolo: 0.75, vibrato: 0.5 });
    });
  });

  describe('lit shares and independence (3 000 held-out styles)', () => {
    it('lights the AutoWah in 33 % of worlds, within 3 points', () => {
      expect(Math.abs(share(({ autoWah }) => autoWah.wet > 0) - 0.33) * 100).toBeLessThanOrEqual(3);
    });

    it('lights the Phaser in 33 % of worlds, within 3 points', () => {
      expect(Math.abs(share(({ phaser }) => phaser.wet > 0) - 0.33) * 100).toBeLessThanOrEqual(3);
    });

    it('lights both in the product of the two shares, within 3 points: the rolls are independent', () => {
      const both = share((s) => wahLit(s) && phaserLit(s));
      const product = share(wahLit) * share(phaserLit);
      expect(Math.abs(both - product) * 100, `both ${both}, product ${product}`).toBeLessThanOrEqual(3);
    });

    it('lights neither in the product of the two dark shares, within 3 points', () => {
      const neither = share((s) => !wahLit(s) && !phaserLit(s));
      const product = (1 - share(wahLit)) * (1 - share(phaserLit));
      expect(Math.abs(neither - product) * 100, `neither ${neither}, product ${product}`).toBeLessThanOrEqual(3);
    });

    it('is independent of the Colour character: each pedal lit alongside a lit Colour in the product of the shares, within 3 points', () => {
      for (const [name, lit] of [['autoWah', wahLit], ['phaser', phaserLit]] as const) {
        const joint = share((s) => lit(s) && colourLit(s));
        const product = share(lit) * share(colourLit);
        expect(Math.abs(joint - product) * 100, `${name}: joint ${joint}, product ${product}`).toBeLessThanOrEqual(3);
      }
    });

    it('draws all four combinations of lit and dark, so none of the checks above is vacuous', () => {
      expect(samples.some(({ s }) => wahLit(s) && phaserLit(s))).toBe(true);
      expect(samples.some(({ s }) => wahLit(s) && !phaserLit(s))).toBe(true);
      expect(samples.some(({ s }) => !wahLit(s) && phaserLit(s))).toBe(true);
      expect(samples.some(({ s }) => !wahLit(s) && !phaserLit(s))).toBe(true);
    });
  });

  describe('a dark pedal', () => {
    it('seeds Mix exactly 0 and every other field inside its loading band', () => {
      let darkWah = 0;
      let darkPhaser = 0;
      for (const { i, s } of samples) {
        if (!wahLit(s)) {
          darkWah++;
          expect(s.autoWah.wet, `wah ${i}`).toBe(0);
        }
        if (!phaserLit(s)) {
          darkPhaser++;
          expect(s.phaser.wet, `phaser ${i}`).toBe(0);
        }
      }
      expect(darkWah).toBeGreaterThan(1000);
      expect(darkPhaser).toBeGreaterThan(1000);
    });

    it('never carries a sync key on a dark Phaser', () => {
      for (const { i, s } of samples) {
        if (!phaserLit(s)) expect('sync' in s.phaser, `style ${i}`).toBe(false);
      }
    });
  });

  describe('every pedal field, lit or dark', () => {
    it('stays inside its loading band on every style', () => {
      const fields: Array<[LoadingRangeKey, (s: Seeded) => number]> = [
        ['autoWah.baseFrequency', (s) => s.autoWah.baseFrequency],
        ['autoWah.octaves', (s) => s.autoWah.octaves],
        ['autoWah.sensitivity', (s) => s.autoWah.sensitivity],
        ['autoWah.Q', (s) => s.autoWah.Q],
        ['autoWah.gain', (s) => s.autoWah.gain],
        ['autoWah.follower', (s) => s.autoWah.follower],
        ['phaser.rate', (s) => s.phaser.rate],
        ['phaser.octaves', (s) => s.phaser.octaves],
        ['phaser.baseFrequency', (s) => s.phaser.baseFrequency],
        ['phaser.stages', (s) => s.phaser.stages],
        ['phaser.Q', (s) => s.phaser.Q],
      ];
      for (const { i, s } of samples) {
        for (const [key, read] of fields) {
          const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
          expect(read(s), `${key} style ${i}`).toBeGreaterThanOrEqual(min);
          expect(read(s), `${key} style ${i}`).toBeLessThanOrEqual(max);
        }
      }
    });

    it('lands every stepped field on its own slider grid', () => {
      const stepped: Array<[GlobalAudioSeedFieldKey, (s: Seeded) => number]> = [
        ['autoWah.octaves', (s) => s.autoWah.octaves],
        ['autoWah.sensitivity', (s) => s.autoWah.sensitivity],
        ['autoWah.gain', (s) => s.autoWah.gain],
        ['autoWah.wet', (s) => s.autoWah.wet],
        ['phaser.rate', (s) => s.phaser.rate],
        ['phaser.octaves', (s) => s.phaser.octaves],
        ['phaser.stages', (s) => s.phaser.stages],
        ['phaser.wet', (s) => s.phaser.wet],
      ];
      for (const { i, s } of samples) {
        for (const [key, read] of stepped) expect(onGrid(read(s), key), `${key} = ${read(s)} (style ${i})`).toBe(true);
      }
    });

    it('seeds Stages as a whole number on every style', () => {
      for (const { i, s } of samples) expect(Number.isInteger(s.phaser.stages), `style ${i}`).toBe(true);
    });

    // A single plain draw takes only a few dozen to a few hundred values across all worlds (three, for autoWah.gain and
    // autoWah.wet), which would make every lit wah sound alike. These fields are uniform draws; this holds them to it.
    it('fills every band: each field takes many distinct values and reaches near both ends, so none is stuck at a few points', () => {
      const lit = (pick: (s: Seeded) => boolean) => samples.filter(({ s }) => pick(s));
      const rows: Array<[LoadingRangeKey, number[]]> = [
        ['autoWah.baseFrequency', samples.map(({ s }) => s.autoWah.baseFrequency)],
        ['autoWah.octaves', samples.map(({ s }) => s.autoWah.octaves)],
        ['autoWah.sensitivity', samples.map(({ s }) => s.autoWah.sensitivity)],
        ['autoWah.Q', samples.map(({ s }) => s.autoWah.Q)],
        ['autoWah.gain', samples.map(({ s }) => s.autoWah.gain)],
        ['autoWah.follower', samples.map(({ s }) => s.autoWah.follower)],
        ['autoWah.wet', lit(wahLit).map(({ s }) => s.autoWah.wet)],
        ['phaser.rate', samples.map(({ s }) => s.phaser.rate)],
        ['phaser.octaves', samples.map(({ s }) => s.phaser.octaves)],
        ['phaser.baseFrequency', samples.map(({ s }) => s.phaser.baseFrequency)],
        ['phaser.stages', samples.map(({ s }) => s.phaser.stages)],
        ['phaser.Q', samples.map(({ s }) => s.phaser.Q)],
        ['phaser.wet', lit(phaserLit).map(({ s }) => s.phaser.wet)],
      ];
      for (const [key, values] of rows) {
        const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
        const { step } = GLOBAL_AUDIO_SEED_RANGES[key];
        const gridPoints = step === undefined ? Number.POSITIVE_INFINITY : Math.round((max - min) / step) + 1;
        const distinct = new Set(values).size;
        expect(distinct, `${key}: ${distinct} distinct values`).toBeGreaterThanOrEqual(Math.min(gridPoints, 200) * 0.8);
        const width = max - min;
        expect(Math.min(...values) - min, `${key} bottom`).toBeLessThanOrEqual(width * 0.15);
        expect(max - Math.max(...values), `${key} top`).toBeLessThanOrEqual(width * 0.15);
      }
    });
  });

  describe('a lit pedal', () => {
    it('seeds a Mix inside its own loading band (to within float noise at the top edge)', () => {
      let litWah = 0;
      let litPhaser = 0;
      for (const { i, s } of samples) {
        if (wahLit(s)) {
          litWah++;
          const { min, max } = GLOBAL_AUDIO_LOADING_RANGES['autoWah.wet'];
          expect(s.autoWah.wet, `wah ${i}`).toBeGreaterThanOrEqual(min);
          expect(s.autoWah.wet, `wah ${i}`).toBeLessThanOrEqual(max + 1e-9);
        }
        if (phaserLit(s)) {
          litPhaser++;
          const { min, max } = GLOBAL_AUDIO_LOADING_RANGES['phaser.wet'];
          expect(s.phaser.wet, `phaser ${i}`).toBeGreaterThanOrEqual(min);
          expect(s.phaser.wet, `phaser ${i}`).toBeLessThanOrEqual(max + 1e-9);
        }
      }
      expect(litWah).toBeGreaterThan(500);
      expect(litPhaser).toBeGreaterThan(500);
    });

    it('reaches both the bottom and the top of the Mix band, so the band is not accidentally collapsed', () => {
      const wets = samples.filter(({ s }) => wahLit(s)).map(({ s }) => s.autoWah.wet);
      expect(Math.min(...wets)).toBeLessThan(0.38);
      expect(Math.max(...wets)).toBeGreaterThan(0.47);
    });
  });

  describe('the Phaser Sync roll', () => {
    it('syncs about PEDAL_SYNC_ODDS.phaser (one half) of lit Phasers, within 5 points', () => {
      const lit = samples.filter(({ s }) => phaserLit(s));
      const synced = lit.filter(({ s }) => 'sync' in s.phaser).length;
      expect(lit.length).toBeGreaterThan(500);
      expect(Math.abs(synced / lit.length - PEDAL_SYNC_ODDS.phaser) * 100, `${synced}/${lit.length}`).toBeLessThanOrEqual(5);
      expect(Math.abs(synced / lit.length - 0.5) * 100, 'against the literal one half').toBeLessThanOrEqual(5);
    });

    it('seeds only real notes that sit inside the lit rate band at the style tempo, drawn from the allowed list', () => {
      let synced = 0;
      for (const { i, s } of samples) {
        const { sync } = s.phaser;
        if (sync === undefined) continue;
        synced++;
        const bpm = generateAttenuationStyleBpm(sampleId(i), sampleId(i));
        evictAttenuationStyleNoiseMap(sampleId(i));
        expect(isNoteValue(sync), `style ${i}`).toBe(true);
        const hz = noteValueHz(sync, bpm);
        const band = GLOBAL_AUDIO_LOADING_RANGES['phaser.rate'];
        expect(hz, `style ${i} at ${bpm} BPM`).toBeGreaterThanOrEqual(band.min);
        expect(hz, `style ${i} at ${bpm} BPM`).toBeLessThanOrEqual(band.max);
        expect(allowedRateNoteValues(bpm, PEDAL_RATE_RANGE_HZ).some((v) => v.division === sync.division && v.modifier === sync.modifier), `style ${i}`).toBe(true);
      }
      expect(synced).toBeGreaterThan(200);
    });

    it('keeps the Free rate underneath a synced Phaser, inside the same band', () => {
      for (const { i, s } of samples) {
        if (s.phaser.sync === undefined) continue;
        const { min, max } = GLOBAL_AUDIO_LOADING_RANGES['phaser.rate'];
        expect(s.phaser.rate, `style ${i}`).toBeGreaterThanOrEqual(min);
        expect(s.phaser.rate, `style ${i}`).toBeLessThanOrEqual(max);
      }
    });

    it('carries no sync key on a lit Phaser that rolled Free (never sync: undefined)', () => {
      const freeLit = samples.filter(({ s }) => phaserLit(s) && !('sync' in s.phaser));
      expect(freeLit.length).toBeGreaterThan(200);
      for (const { s } of freeLit) expect(Object.keys(s.phaser)).not.toContain('sync');
    });
  });

  describe('determinism and draw sets', () => {
    afterEach(() => {
      vi.mocked(getSeededVal).mockClear();
      vi.mocked(getUniformSeededVal).mockClear();
      vi.mocked(pickSeedNoteValue).mockImplementation(actualTempoSync.pickSeedNoteValue);
      vi.mocked(pickSeedNoteValue).mockClear();
      for (const id of ['pedal-det-0', 'pedal-det-1', 'pedal-det-2', 'pedal-keys', 'oracle-alpha', 'oracle-theta']) evictAttenuationStyleNoiseMap(id);
    });

    it('gives the same pedal blocks for the same style, including across a fresh noise map', () => {
      for (let i = 0; i < 20; i++) {
        const id = `pedal-det-${i}`;
        const first = generateGlobalAudioSettings(id, `PedalDet${i}`);
        evictAttenuationStyleNoiseMap(id);
        const second = generateGlobalAudioSettings(id, `PedalDet${i}`);
        expect(second.autoWah, `wah ${i}`).toStrictEqual(first.autoWah);
        expect(second.phaser, `phaser ${i}`).toStrictEqual(first.phaser);
        evictAttenuationStyleNoiseMap(id);
      }
    });

    it('reads its seventeen keys, each once, as uniform draws on every style, lit or dark: four rolls and thirteen values', () => {
      const expected = [
        'autoWah.lit', 'phaser.lit', 'phaser.syncMode', 'phaser.syncNote',
        'autoWah.baseFrequency', 'autoWah.octaves', 'autoWah.sensitivity', 'autoWah.Q', 'autoWah.gain', 'autoWah.follower', 'autoWah.wet',
        'phaser.rate', 'phaser.octaves', 'phaser.baseFrequency', 'phaser.stages', 'phaser.Q', 'phaser.wet',
      ].map((k) => `globalAudio.${k}`).sort();
      // oracle-alpha: AutoWah dark, Phaser lit and synced. oracle-theta: AutoWah lit, Phaser dark. A third style
      // for good measure. The draw set must be the same whatever the outcome.
      for (const id of ['oracle-alpha', 'oracle-theta', 'pedal-keys']) {
        vi.mocked(getUniformSeededVal).mockClear();
        generateGlobalAudioSettings(id, id);
        // Global Pedals T8 adds its own uniform draws (pinned in its block below); these are the two 50.4 pedals' only.
        const keys = vi
          .mocked(getUniformSeededVal)
          .mock.calls.map((call) => call[1])
          .filter((k) => k.startsWith('globalAudio.autoWah.') || k.startsWith('globalAudio.phaser.'))
          .sort();
        expect(keys, id).toStrictEqual(expected);
      }
    });

    // Global Pedals T8: the three LFO pedals share the same lazy tempo draw, so they count as synced blocks here too.
    it('draws the style tempo once when the Delay, the Phaser or an LFO pedal syncs (or several), and not at all when none does', () => {
      let neither = 0;
      let one = 0;
      let bothSynced = 0;
      for (let i = 0; i < 300; i++) {
        const id = `pedal-bpm-${i}`;
        vi.mocked(getSeededVal).mockClear();
        const s = generateGlobalAudioSettings(id, id);
        evictAttenuationStyleNoiseMap(id);
        const tempoDraws = vi.mocked(getSeededVal).mock.calls.filter((call) => call[1] === 'globalAudio.bpm').length;
        const synced =
          Number(s.delay.sync !== undefined) +
          Number(s.phaser.sync !== undefined) +
          Number(s.chorus.sync !== undefined) +
          Number(s.tremolo.sync !== undefined) +
          Number(s.vibrato.sync !== undefined);
        expect(tempoDraws, `style ${i}`).toBe(synced === 0 ? 0 : 1);
        if (synced === 0) neither++;
        else if (synced === 1) one++;
        else bothSynced++;
      }
      // All three cases occur, or the check above proves nothing about the shared draw.
      expect(neither).toBeGreaterThan(0);
      expect(one).toBeGreaterThan(0);
      expect(bothSynced).toBeGreaterThan(0);
    });

    it('never reads a pedal key with the plain single draw, so no pedal value is bell-curved or coarse', () => {
      vi.mocked(getSeededVal).mockClear();
      generateGlobalAudioSettings('pedal-keys', 'pedal-keys');
      const plain = vi.mocked(getSeededVal).mock.calls.map((call) => call[1]);
      expect(plain.filter((k) => k.startsWith('globalAudio.autoWah.') || k.startsWith('globalAudio.phaser.'))).toStrictEqual([]);
    });

    it('asks for a Phaser note at the style tempo, over the lit rate band in Hz, only for a lit Phaser that rolled Sync', () => {
      // oracle-alpha: Phaser lit and synced. oracle-theta: Phaser dark.
      // Global Pedals T8: a synced LFO pedal asks for an Hz note too, over its own band, so only the Phaser band's calls count.
      const phaserBand = GLOBAL_AUDIO_LOADING_RANGES['phaser.rate'];
      const phaserCalls = () =>
        vi.mocked(pickSeedNoteValue).mock.calls.filter((call) => call[3] === 'hz' && call[2][0] === phaserBand);
      vi.mocked(pickSeedNoteValue).mockClear();
      generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha');
      const hzCalls = phaserCalls();
      expect(hzCalls).toHaveLength(1);
      expect(hzCalls[0][1]).toBe(generateAttenuationStyleBpm('oracle-alpha', 'oracle-alpha'));
      expect(hzCalls[0][2]).toStrictEqual([phaserBand]);

      vi.mocked(pickSeedNoteValue).mockClear();
      generateGlobalAudioSettings('oracle-theta', 'oracle-theta');
      expect(phaserCalls()).toHaveLength(0);
    });

    it('leaves the lit Phaser Free, with its seeded rate unchanged, when no note sits in the band', () => {
      const real = generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha').phaser;
      expect(real.sync, 'precondition: this style seeds a synced Phaser').toBeDefined();
      evictAttenuationStyleNoiseMap('oracle-alpha');

      vi.mocked(pickSeedNoteValue).mockReturnValue(undefined);
      const forcedFree = generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha').phaser;
      const { sync: _sync, ...rest } = real;
      expect('sync' in forcedFree).toBe(false);
      expect(forcedFree).toStrictEqual(rest);
    });
  });

  describe('the Phaser band covers the seed BPM range', () => {
    it('holds at least one note in 0.1 to 1 Hz at every integer BPM the seeder can draw, so the Free fallback is never reached today', () => {
      for (let bpm = BPM_SEED_RANGE.min; bpm <= BPM_SEED_RANGE.max; bpm++) {
        expect(allowedNoteValues(bpm, GLOBAL_AUDIO_LOADING_RANGES['phaser.rate'], 'hz').length, `${bpm} BPM`).toBeGreaterThan(0);
      }
    });
  });
});

// Global Pedals T8 (docs/specs/GLOBAL_PEDALS.md §1.2): four more lit rolls in chain order under a two-of-six cap, a sync
// pair per LFO pedal, the shifter's sign draw, sixteen value draws, all read on every style.
describe('the Global Pedals (Global Pedals T8)', () => {
  type Seeded = ReturnType<typeof generateGlobalAudioSettings>;
  const SAMPLES = 3000;
  const sampleId = (i: number) => `PedalsShare${i}`;
  let samples: Seeded[] = [];
  const LFO_PEDALS = ['chorus', 'tremolo', 'vibrato'] as const;
  const lit = (s: Seeded) => ({
    autoWah: s.autoWah.wet > 0,
    phaser: s.phaser.wet > 0,
    chorus: s.chorus.wet > 0,
    tremolo: s.tremolo.wet > 0,
    vibrato: s.vibrato.wet > 0,
    frequencyShifter: s.frequencyShifter.wet > 0,
  });
  const litCount = (s: Seeded) => Object.values(lit(s)).filter(Boolean).length;
  const share = (pick: (s: Seeded) => boolean) => samples.filter(pick).length / samples.length;
  const band = (key: LoadingRangeKey) => GLOBAL_AUDIO_LOADING_RANGES[key];
  const inBand = (value: number, key: LoadingRangeKey) =>
    value >= band(key).min - 1e-9 && value <= band(key).max + 1e-9;
  const onGrid = (value: number, key: GlobalAudioSeedFieldKey): boolean => {
    const { min, step } = GLOBAL_AUDIO_SEED_RANGES[key];
    const n = (value - min) / (step as number);
    return Math.abs(n - Math.round(n)) < 1e-9;
  };

  beforeAll(() => {
    // Held out from the calibration set ('PedalsCalibration<n>', 20 000 styles). Generated once and shared.
    samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      samples.push(generateGlobalAudioSettings(sampleId(i), sampleId(i)));
      evictAttenuationStyleNoiseMap(sampleId(i));
    }
  }, 120000);

  describe('the constants', () => {
    it('keeps the AutoWah and Phaser edges, and gives the four motion pedals 0.25 / 0.25 / 0.25 / 0.15 nominal', () => {
      expect(PEDAL_LIT_EDGE).toStrictEqual({
        autoWah: 1 / 3,
        phaser: 1 / 3,
        chorus: 0.25,
        tremolo: 0.25,
        vibrato: 0.25,
        frequencyShifter: 0.15,
      });
    });

    it('caps a world at two lit Modulation pedals and syncs about half of lit LFO pedals', () => {
      expect(MAX_LIT_PEDALS).toBe(2);
      expect(PEDAL_SYNC_ODDS.chorus).toBe(0.5);
      expect(PEDAL_SYNC_ODDS.vibrato).toBe(0.5);
    });

    it('rolls the motion pedals in chain order', () => {
      expect([...MOTION_PEDALS]).toStrictEqual(['chorus', 'tremolo', 'vibrato', 'frequencyShifter']);
    });
  });

  // The rolls are uniform and independent, so the shares follow from the edges and the sequential cap exactly: the 50.4
  // pedals leave 0 / 1 / 2 lit in 4/9 / 4/9 / 1/9 of worlds, and each later pedal lights at its edge times the chance
  // that fewer than two are lit before it. Expected: Chorus 0.25 * 8/9 = 22.2 %, Tremolo 0.25 * 7/9 = 19.4 %, Vibrato
  // 0.25 * 2/3 = 16.7 %, shifter 0.15 * 9/16 = 8.4 %. MEASURED over 20 000 styles ('PedalsCalibration<n>', 2026-10-18):
  // Chorus 22.68, Tremolo 19.33, Vibrato 16.75, shifter 8.20 %, two lit in 49.38 % of worlds and never more; lit LFO
  // pedals synced 49.82 / 50.88 / 49.73 % (re-measured 2026-10-21 after the per-pedal Sync odds: Chorus 49.82, Tremolo 75.14,
  // Vibrato 49.73 %, the Phaser 50.62 %); negative shifts 49.97 %. The held-out set here measured 22.33 / 19.87 / 16.77
  // / 9.63 % and must land within 3 points of the calibration figures.
  const MEASURED = { chorus: 0.2268, tremolo: 0.1933, vibrato: 0.1675, frequencyShifter: 0.082 } as const;

  describe('lit shares under the cap (3 000 held-out styles)', () => {
    it('leaves the AutoWah and Phaser shares at 33 %, within 3 points (their rolls come first and are untouched)', () => {
      expect(Math.abs(share((s) => lit(s).autoWah) - 0.33) * 100).toBeLessThanOrEqual(3);
      expect(Math.abs(share((s) => lit(s).phaser) - 0.33) * 100).toBeLessThanOrEqual(3);
    });

    it.each(MOTION_PEDALS)('lights the %s at its measured share, within 3 points', (pedal) => {
      const realised = share((s) => lit(s)[pedal]);
      expect(Math.abs(realised - MEASURED[pedal]) * 100, `${pedal}: realised ${(realised * 100).toFixed(1)} %`).toBeLessThanOrEqual(3);
    });

    it('never lights more than two Modulation pedals in one world, and reaches the cap in some', () => {
      expect(Math.max(...samples.map(litCount))).toBe(MAX_LIT_PEDALS);
      expect(samples.some((s) => litCount(s) === 2)).toBe(true);
    });

    it('lights the shifter least often of the four motion pedals', () => {
      const shifter = share((s) => lit(s).frequencyShifter);
      for (const pedal of ['chorus', 'tremolo', 'vibrato'] as const) {
        expect(shifter, pedal).toBeLessThan(share((s) => lit(s)[pedal]));
      }
    });

    it('lights a motion pedal alongside both 50.4 pedals never, and alongside none of them in some worlds', () => {
      const both504 = samples.filter((s) => lit(s).autoWah && lit(s).phaser);
      expect(both504.length).toBeGreaterThan(0);
      for (const s of both504) {
        for (const pedal of MOTION_PEDALS) expect(lit(s)[pedal]).toBe(false);
      }
    });
  });

  describe('Mix, sync, shift and width', () => {
    it('seeds a dark pedal at Mix exactly 0 and a lit one inside its Mix band', () => {
      for (const s of samples) {
        for (const pedal of MOTION_PEDALS) {
          const wet = s[pedal].wet;
          if (wet === 0) continue;
          expect(inBand(wet, `${pedal}.wet`), `${pedal}.wet ${wet}`).toBe(true);
        }
      }
    });

    it.each(LFO_PEDALS)('syncs about PEDAL_SYNC_ODDS[%s] of lit worlds, within 5 points, and never a dark one', (pedal) => {
      const litOnes = samples.filter((s) => lit(s)[pedal]);
      const synced = litOnes.filter((s) => s[pedal].sync !== undefined).length / litOnes.length;
      expect(Math.abs(synced - PEDAL_SYNC_ODDS[pedal]) * 100).toBeLessThanOrEqual(5);
      for (const s of samples.filter((x) => !lit(x)[pedal])) expect('sync' in s[pedal]).toBe(false);
    });

    // Literal numbers, so the test holds the seeder to the plan (Classic Band Retune row 13) and not to the constant: a
    // swapped Tremolo entry, or one pedal's odds indexed for another, moves one of these shares by 25 points.
    it.each([
      ['chorus', 0.5],
      ['tremolo', 0.75],
      ['vibrato', 0.5],
    ] as const)('seeds Sync in the planned share of lit %s worlds (%s), within 5 points', (pedal, planned) => {
      const litOnes = samples.filter((s) => lit(s)[pedal]);
      const synced = litOnes.filter((s) => s[pedal].sync !== undefined).length / litOnes.length;
      expect(litOnes.length, `${pedal} lit worlds`).toBeGreaterThan(400);
      expect(Math.abs(synced - planned) * 100, `${pedal}: realised ${(synced * 100).toFixed(1)} %`).toBeLessThanOrEqual(5);
    });

    it('lets the Tremolo sync more often than any other pedal, by at least 15 points', () => {
      const shareOf = (pedal: (typeof LFO_PEDALS)[number]) => {
        const litOnes = samples.filter((s) => lit(s)[pedal]);
        return litOnes.filter((s) => s[pedal].sync !== undefined).length / litOnes.length;
      };
      for (const other of ['chorus', 'vibrato'] as const) {
        expect(shareOf('tremolo') - shareOf(other), `tremolo vs ${other}`).toBeGreaterThanOrEqual(0.15);
      }
    });

    it('seeds only real notes inside the lit rate band at the style tempo', () => {
      for (let i = 0; i < samples.length; i++) {
        for (const pedal of LFO_PEDALS) {
          const sync = samples[i][pedal].sync;
          if (sync === undefined) continue;
          expect(isNoteValue(sync)).toBe(true);
          const hz = noteValueHz(sync, generateAttenuationStyleBpm(sampleId(i), sampleId(i)));
          expect(inBand(hz, `${pedal}.rate`), `${pedal} ${hz} Hz`).toBe(true);
        }
      }
    });

    it('never seeds a shift inside 2 Hz of zero, keeps it within 20 Hz, and seeds both signs', () => {
      const shifts = samples.map((s) => s.frequencyShifter.shift);
      for (const shift of shifts) {
        expect(Math.abs(shift)).toBeGreaterThanOrEqual(2);
        expect(Math.abs(shift)).toBeLessThanOrEqual(20);
        expect(Number.isInteger(shift)).toBe(true);
      }
      const negative = shifts.filter((x) => x < 0).length / shifts.length;
      expect(Math.abs(negative - 0.5) * 100).toBeLessThanOrEqual(5);
    });

    it('seeds Width inside 0.4 - 0.65 on every style, never near the mono fold', () => {
      for (const s of samples) expect(inBand(s.stereoWidener.width, 'stereoWidener.width'), `${s.stereoWidener.width}`).toBe(true);
    });

    // Classic Band Retune T1 (docs/tasks/CLASSIC_BAND_RETUNE.md §2, acceptance criteria). Literal numbers on purpose:
    // these hold the seeder to the plan's figures, not to whatever the table currently says.
    it('seeds every lit Vibrato at Mix 0.85 - 1 and depth 0.03 - 0.12 (a vibrato, not a chorus or a siren), and every dark one at 0', () => {
      const litVibratos = samples.filter((s) => lit(s).vibrato);
      expect(litVibratos.length).toBeGreaterThan(300);
      for (const s of litVibratos) {
        expect(s.vibrato.wet).toBeGreaterThanOrEqual(0.85);
        expect(s.vibrato.wet).toBeLessThanOrEqual(1 + 1e-9);
      }
      for (const s of samples) {
        expect(s.vibrato.depth).toBeGreaterThanOrEqual(0.03 - 1e-9);
        expect(s.vibrato.depth).toBeLessThanOrEqual(0.12 + 1e-9);
        if (!lit(s).vibrato) expect(s.vibrato.wet).toBe(0);
      }
    });

    it('seeds every lit AutoWah Mix at 0.35 or above, every lit Phaser/Chorus at 0.3 or above, every lit Tremolo 0.35 or above, every lit shifter 0.25 or above', () => {
      const floors = { autoWah: 0.35, phaser: 0.3, chorus: 0.3, tremolo: 0.35, frequencyShifter: 0.25 } as const;
      for (const s of samples) {
        for (const pedal of Object.keys(floors) as Array<keyof typeof floors>) {
          if (!lit(s)[pedal]) continue;
          expect(s[pedal].wet, pedal).toBeGreaterThanOrEqual(floors[pedal] - 1e-9);
        }
      }
    });

    // Classic Band Retune T6 (Crawford, 2026-10-21): the Compressor seeds shallow, -36 to -18 dB at 2-6:1, whole numbers.
    it('seeds every Compressor threshold in -36 to -18 dB and every ratio in 2 - 6, on whole numbers, reaching both ends of each', () => {
      for (const s of samples) {
        expect(Number.isInteger(s.compressor.threshold), `threshold ${s.compressor.threshold}`).toBe(true);
        expect(Number.isInteger(s.compressor.ratio), `ratio ${s.compressor.ratio}`).toBe(true);
        expect(s.compressor.threshold).toBeGreaterThanOrEqual(-36);
        expect(s.compressor.threshold).toBeLessThanOrEqual(-18);
        expect(s.compressor.ratio).toBeGreaterThanOrEqual(2);
        expect(s.compressor.ratio).toBeLessThanOrEqual(6);
      }
      const thresholds = samples.map((s) => s.compressor.threshold);
      const ratios = samples.map((s) => s.compressor.ratio);
      expect(Math.min(...thresholds), 'threshold bottom reachable').toBeLessThanOrEqual(-32);
      expect(Math.max(...thresholds), 'threshold top reachable').toBeGreaterThanOrEqual(-22);
      expect(Math.min(...ratios), 'ratio bottom reachable').toBeLessThanOrEqual(3);
      expect(Math.max(...ratios), 'ratio top reachable').toBeGreaterThanOrEqual(5);
    });

    it('seeds every high-pass cutoff at or below 120 Hz, so no robot below octave 5 loses its fundamental', () => {
      for (const s of samples) expect(s.filterHPF.frequency).toBeLessThanOrEqual(120 + 1e-9);
      expect(samples.some((s) => s.filterHPF.frequency < 40), 'the band still reaches its low end').toBe(true);
    });

    it('seeds every AutoWah sensitivity in -20 to -5 dB and every Chorus delay time in 6 - 15 ms', () => {
      for (const s of samples) {
        expect(s.autoWah.sensitivity).toBeGreaterThanOrEqual(-20);
        expect(s.autoWah.sensitivity).toBeLessThanOrEqual(-5);
        expect(s.chorus.delayTime).toBeGreaterThanOrEqual(6);
        expect(s.chorus.delayTime).toBeLessThanOrEqual(15);
      }
    });

    it('keeps every shape field inside its band and on its grid, lit or dark', () => {
      const fields = [
        'chorus.rate', 'chorus.delayTime', 'chorus.depth', 'chorus.spread', 'chorus.feedback',
        'tremolo.rate', 'tremolo.depth', 'tremolo.spread', 'vibrato.rate', 'vibrato.depth', 'stereoWidener.width',
      ] as const;
      for (const s of samples) {
        for (const key of fields) {
          const [block, field] = key.split('.') as [keyof Seeded, string];
          const value = (s[block] as unknown as Record<string, number>)[field];
          expect(inBand(value, key), `${key} ${value}`).toBe(true);
          expect(onGrid(value, key), `${key} ${value}`).toBe(true);
        }
      }
    });

    it('fills the bands: each wide field takes many distinct values', () => {
      for (const key of ['chorus.rate', 'tremolo.rate', 'vibrato.rate', 'chorus.delayTime'] as const) {
        const [block, field] = key.split('.') as ['chorus' | 'tremolo' | 'vibrato', 'rate' | 'delayTime'];
        const distinct = new Set(samples.map((s) => (s[block] as unknown as Record<string, number>)[field])).size;
        expect(distinct, key).toBeGreaterThan(8);
      }
    });
  });

  describe('determinism and draw sets', () => {
    afterEach(() => {
      vi.mocked(getUniformSeededVal).mockClear();
      for (const id of ['pedals-det', 'oracle-alpha', 'oracle-theta', 'pedals-keys']) evictAttenuationStyleNoiseMap(id);
    });

    it('gives the same five blocks for the same style, including across a fresh noise map', () => {
      for (let i = 0; i < 20; i++) {
        const first = generateGlobalAudioSettings('pedals-det', `PedalsDet${i}`);
        evictAttenuationStyleNoiseMap('pedals-det');
        const second = generateGlobalAudioSettings('pedals-det', `PedalsDet${i}`);
        evictAttenuationStyleNoiseMap('pedals-det');
        for (const key of ['chorus', 'tremolo', 'vibrato', 'frequencyShifter', 'stereoWidener'] as const) {
          expect(second[key], `${key} ${i}`).toStrictEqual(first[key]);
        }
      }
    });

    // oracle-alpha: the Chorus lit and the shifter CAPPED; oracle-theta: the Tremolo lit. The draw set must be the same
    // whatever the outcome, so a capped pedal still reads its roll key.
    it('reads its twenty-seven keys, each once, as uniform draws on every style: four lit rolls, three sync pairs, the sign and sixteen values', () => {
      const expected = [
        'chorus.lit', 'tremolo.lit', 'vibrato.lit', 'frequencyShifter.lit',
        'chorus.syncMode', 'chorus.syncNote', 'tremolo.syncMode', 'tremolo.syncNote', 'vibrato.syncMode', 'vibrato.syncNote',
        'frequencyShifter.sign',
        'chorus.rate', 'chorus.delayTime', 'chorus.depth', 'chorus.spread', 'chorus.feedback', 'chorus.wet',
        'tremolo.rate', 'tremolo.depth', 'tremolo.spread', 'tremolo.wet',
        'vibrato.rate', 'vibrato.depth', 'vibrato.wet',
        'frequencyShifter.shift', 'frequencyShifter.wet', 'stereoWidener.width',
      ].map((k) => `globalAudio.${k}`).sort();
      const prefixes = ['chorus.', 'tremolo.', 'vibrato.', 'frequencyShifter.', 'stereoWidener.'].map((p) => `globalAudio.${p}`);
      for (const id of ['oracle-alpha', 'oracle-theta', 'pedals-keys']) {
        vi.mocked(getUniformSeededVal).mockClear();
        generateGlobalAudioSettings(id, id);
        const keys = vi
          .mocked(getUniformSeededVal)
          .mock.calls.map((call) => call[1])
          .filter((k) => prefixes.some((p) => k.startsWith(p)))
          .sort();
        expect(keys, id).toStrictEqual(expected);
      }
    });

    it('never reads a Global Pedals key with the plain single draw', () => {
      vi.mocked(getSeededVal).mockClear();
      generateGlobalAudioSettings('pedals-keys', 'pedals-keys');
      const plain = vi.mocked(getSeededVal).mock.calls.map((call) => call[1]);
      const prefixes = ['chorus.', 'tremolo.', 'vibrato.', 'frequencyShifter.', 'stereoWidener.'].map((p) => `globalAudio.${p}`);
      expect(plain.filter((k) => prefixes.some((p) => k.startsWith(p)))).toStrictEqual([]);
    });
  });
});

describe('generateLfoBankSettings', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('bank-test-planet');
    for (let i = 0; i < 20; i++) {
      evictAttenuationStyleNoiseMap(`bank-rate-sample-${i}`);
      evictAttenuationStyleNoiseMap(`bank-shape-sample-${i}`);
      evictAttenuationStyleNoiseMap(`bank-drift-sample-${i}`);
    }
  });

  it('returns a fully-populated record for all 4 lanes, no extras', () => {
    const settings = generateLfoBankSettings('bank-test-planet', 'Bank');
    expect(Object.keys(settings).sort()).toEqual([...LFO_LANE_IDS].sort());
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same settings', () => {
    const first = generateLfoBankSettings('bank-test-planet', 'Bank');
    const second = generateLfoBankSettings('bank-test-planet', 'Bank');
    expect(second).toEqual(first);
  });

  it('each lane\'s rate lies inside that lane\'s own band (docs/specs/LFO_BANK.md §1.3)', () => {
    const settings = generateLfoBankSettings('bank-test-planet', 'Bank');
    for (const lane of LFO_LANE_IDS) {
      const { min, max } = LFO_BANK_RATE_BANDS[lane];
      expect(settings[lane].rate, `${lane}.rate`).toBeGreaterThanOrEqual(min);
      expect(settings[lane].rate, `${lane}.rate`).toBeLessThanOrEqual(max);
    }
  });

  it('rates ascend a -> d — the bands are adjacent and non-overlapping', () => {
    const settings = generateLfoBankSettings('bank-test-planet', 'Bank');
    expect(settings.a.rate).toBeLessThanOrEqual(settings.b.rate);
    expect(settings.b.rate).toBeLessThanOrEqual(settings.c.rate);
    expect(settings.c.rate).toBeLessThanOrEqual(settings.d.rate);
  });

  it('rates are multiples of 0.05 and never 0, across many Attenuation Styles', () => {
    for (let i = 0; i < 20; i++) {
      const settings = generateLfoBankSettings(`bank-rate-sample-${i}`, `BankRate${i}`);
      for (const lane of LFO_LANE_IDS) {
        const { rate } = settings[lane];
        expect(rate, `${lane}.rate (sample ${i})`).toBeGreaterThan(0);
        const stepsFromZero = rate / 0.05;
        expect(Math.abs(stepsFromZero - Math.round(stepsFromZero)), `${lane}.rate (sample ${i})`).toBeLessThan(1e-9);
      }
    }
  });

  it('shapes are always one of the 4 LfoShape members, across many Attenuation Styles', () => {
    for (let i = 0; i < 20; i++) {
      const settings = generateLfoBankSettings(`bank-shape-sample-${i}`, `BankShape${i}`);
      for (const lane of LFO_LANE_IDS) {
        expect(LFO_SHAPES, `${lane}.shape (sample ${i})`).toContain(settings[lane].shape);
      }
    }
  });

  it('lane a (drawn first, full queue) leans heavily toward sine across many Attenuation Styles', () => {
    let sineCount = 0;
    const samples = 100;
    for (let i = 0; i < samples; i++) {
      const settings = generateLfoBankSettings(`bank-shape-weight-sample-${i}`, `BankShapeWeight${i}`);
      if (settings.a.shape === 'sine') sineCount++;
      evictAttenuationStyleNoiseMap(`bank-shape-weight-sample-${i}`);
    }
    // First-pick odds are sine 53.3% — well above a uniform-4-shape 25% baseline.
    expect(sineCount / samples).toBeGreaterThan(0.35);
  });

  it('rateDrift/depthDrift lie within the documented ±0.7 window, quantized to a 0.01 grid', () => {
    for (let i = 0; i < 20; i++) {
      const settings = generateLfoBankSettings(`bank-drift-sample-${i}`, `BankDrift${i}`);
      for (const lane of LFO_LANE_IDS) {
        for (const v of [settings[lane].rateDrift, settings[lane].depthDrift]) {
          expect(v, `lane ${lane} (sample ${i})`).toBeGreaterThanOrEqual(LFO_BANK_DRIFT_SEED_RANGE.min);
          expect(v, `lane ${lane} (sample ${i})`).toBeLessThanOrEqual(LFO_BANK_DRIFT_SEED_RANGE.max);
          const stepsFromZero = v / 0.01;
          expect(Math.abs(stepsFromZero - Math.round(stepsFromZero)), `lane ${lane} (sample ${i})`).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe('generateGlobalLfoLinks', () => {
  beforeEach(() => {
    vi.mocked(getSeededVal).mockClear();
  });

  afterEach(() => {
    evictAttenuationStyleNoiseMap('links-test-planet');
    for (let i = 0; i < 100; i++) evictAttenuationStyleNoiseMap(`links-sample-${i}`);
  });

  it('returns a fully-populated record for all 7 GlobalLfoTargetIds, no extras', () => {
    const links = generateGlobalLfoLinks('links-test-planet', 'Links');
    expect(Object.keys(links).sort()).toEqual([...GLOBAL_LFO_TARGET_IDS].sort());
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same links', () => {
    const first = generateGlobalLfoLinks('links-test-planet', 'Links');
    const second = generateGlobalLfoLinks('links-test-planet', 'Links');
    expect(second).toEqual(first);
  });

  it('every quiet target is exactly { lane: null, depth: 0 }; every lit target has a real lane and an integer depth within its own group\'s seed range (EQ: [5, 30], filter frequency: [5, 60], filter Q: [5, 40])', () => {
    for (let i = 0; i < 20; i++) {
      const links = generateGlobalLfoLinks(`links-sample-${i}`, `LinksSample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        const link = links[target];
        if (link.lane === null) {
          expect(link.depth, `${target}.depth (sample ${i})`).toBe(0);
          continue;
        }
        expect(LFO_LANE_IDS, `${target}.lane (sample ${i})`).toContain(link.lane);
        expect(Number.isInteger(link.depth), `${target}.depth (sample ${i})`).toBe(true);
        expect(link.depth, `${target}.depth (sample ${i})`).toBeGreaterThanOrEqual(5);
        if (target.startsWith('eq3.')) {
          expect(link.depth, `${target}.depth (sample ${i})`).toBeLessThanOrEqual(30);
        } else if (target.endsWith('.Q')) {
          expect(link.depth, `${target}.depth (sample ${i})`).toBeLessThanOrEqual(40);
        } else {
          expect(link.depth, `${target}.depth (sample ${i})`).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('a lit EQ target\'s depth can land near its own 30% ceiling, not the old shared 50% one', () => {
    let maxDepth = 0;
    for (let i = 0; i < 100; i++) {
      const links = generateGlobalLfoLinks(`links-sample-${i}`, `LinksSample${i}`);
      if (links['eq3.low'].lane !== null) maxDepth = Math.max(maxDepth, links['eq3.low'].depth);
      if (links['eq3.mid'].lane !== null) maxDepth = Math.max(maxDepth, links['eq3.mid'].depth);
      if (links['eq3.high'].lane !== null) maxDepth = Math.max(maxDepth, links['eq3.high'].depth);
    }
    expect(maxDepth).toBeGreaterThan(25);
    expect(maxDepth).toBeLessThanOrEqual(30);
  });

  it('a lit filter frequency target\'s depth can land near its own 60% ceiling, not the old shared 50% one', () => {
    let maxDepth = 0;
    for (let i = 0; i < 100; i++) {
      const links = generateGlobalLfoLinks(`links-sample-${i}`, `LinksSample${i}`);
      if (links['lpf.frequency'].lane !== null) maxDepth = Math.max(maxDepth, links['lpf.frequency'].depth);
      if (links['hpf.frequency'].lane !== null) maxDepth = Math.max(maxDepth, links['hpf.frequency'].depth);
    }
    expect(maxDepth).toBeGreaterThan(50);
    expect(maxDepth).toBeLessThanOrEqual(60);
  });

  it('a lit filter Q target\'s depth can land near its own 40% ceiling, not the old shared 50% one', () => {
    let maxDepth = 0;
    for (let i = 0; i < 100; i++) {
      const links = generateGlobalLfoLinks(`links-sample-${i}`, `LinksSample${i}`);
      if (links['lpf.Q'].lane !== null) maxDepth = Math.max(maxDepth, links['lpf.Q'].depth);
      if (links['hpf.Q'].lane !== null) maxDepth = Math.max(maxDepth, links['hpf.Q'].depth);
    }
    expect(maxDepth).toBeGreaterThan(35);
    expect(maxDepth).toBeLessThanOrEqual(40);
  });

  it('seeds a lit (non-null lane) target for roughly 2-in-3 targets across many Attenuation Styles (the 0.34 quiet threshold, unchanged)', () => {
    const SAMPLE_ATTENUATION_STYLES = 50;
    let litCount = 0;
    let totalCount = 0;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const links = generateGlobalLfoLinks(`links-sample-${i}`, `LinksSample${i}`);
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        totalCount++;
        if (links[target].lane !== null) litCount++;
      }
    }
    const litRate = litCount / totalCount;
    expect(litRate, `${litCount}/${totalCount} lit`).toBeGreaterThanOrEqual(0.55);
    expect(litRate, `${litCount}/${totalCount} lit`).toBeLessThanOrEqual(0.80);
  });

  // Crawford, 2026-10-21: "EQs, LPF, and HPF should only be allowed to access the core or companion LFOs on load (and if an
  // LFO is chosen it should usually be the core one, companion should appear maybe once per session on those attributes)".
  // Core is lane a, Companion lane b. The seven global targets are exactly the EQ, LPF and HPF fields. Literal numbers
  // below hold the seeder to that sentence, not to the constants.
  describe('lane access on load: Core (a) usually, Companion (b) at most once per world', () => {
    const STYLES = 3000;
    let worlds: Array<Record<GlobalLfoTargetId, { lane: string | null; depth: number }>> = [];

    beforeAll(() => {
      worlds = [];
      for (let i = 0; i < STYLES; i++) {
        const id = `lane-access-${i}`;
        worlds.push(generateGlobalLfoLinks(id, `LaneAccess${i}`));
        evictAttenuationStyleNoiseMap(id);
      }
    }, 120000);

    const laneList = (world: (typeof worlds)[number]) => GLOBAL_LFO_TARGET_IDS.map((t) => world[t].lane).filter((l) => l !== null);

    it('only ever links a global target to the Core (a) or Companion (b) lane: never c or d, over 3 000 styles', () => {
      let lit = 0;
      for (const world of worlds) {
        for (const lane of laneList(world)) {
          lit++;
          expect(['a', 'b'], `lane ${lane}`).toContain(lane);
        }
      }
      expect(lit, 'the sample really contained lit links').toBeGreaterThan(8000);
    });

    it('links the Companion at most once in any world, and does so in some worlds (about 0.3 to 0.5 of them)', () => {
      let withCompanion = 0;
      for (const world of worlds) {
        const companions = laneList(world).filter((l) => l === 'b').length;
        expect(companions).toBeLessThanOrEqual(1);
        if (companions === 1) withCompanion++;
      }
      const share = withCompanion / worlds.length;
      expect(share, `${withCompanion}/${worlds.length} worlds`).toBeGreaterThanOrEqual(0.3);
      expect(share, `${withCompanion}/${worlds.length} worlds`).toBeLessThanOrEqual(0.5);
    });

    it('makes the Core the usual choice: at least 88 % of lit links are lane a, and the Companion still appears', () => {
      let core = 0;
      let companion = 0;
      for (const world of worlds) {
        for (const lane of laneList(world)) {
          if (lane === 'a') core++;
          if (lane === 'b') companion++;
        }
      }
      expect(core / (core + companion), `${core} core / ${companion} companion`).toBeGreaterThanOrEqual(0.88);
      expect(companion).toBeGreaterThan(500);
    });

    it('names the Companion edge as 0.1: a lane draw just under it picks the Companion, exactly on it picks the Core', () => {
      expect(GLOBAL_LFO_COMPANION_EDGE).toBe(0.1);
      const forceLane = (t: number) => {
        const original = vi.mocked(getUniformSeededVal).getMockImplementation()!;
        vi.mocked(getUniformSeededVal).mockImplementation((noiseMap, dataId, offset) =>
          dataId.startsWith('globalLfo.') && dataId.endsWith('.lane') ? t : original(noiseMap, dataId, offset));
        try {
          return generateGlobalLfoLinks('lane-forced', 'LaneForced');
        } finally {
          vi.mocked(getUniformSeededVal).mockImplementation(original);
          evictAttenuationStyleNoiseMap('lane-forced');
        }
      };
      const lanes = (links: ReturnType<typeof generateGlobalLfoLinks>) => GLOBAL_LFO_TARGET_IDS.map((t) => links[t].lane).filter((l) => l !== null);
      expect(lanes(forceLane(0.1 - 1e-9)).filter((l) => l === 'b')).toHaveLength(1);
      expect(lanes(forceLane(0.1)).filter((l) => l === 'b')).toHaveLength(0);
      expect(lanes(forceLane(0.999)).filter((l) => l === 'b')).toHaveLength(0);
    });

    it('gives the one Companion to the first lit target when every lane draw asks for it, and the Core to every later one', () => {
      const original = vi.mocked(getUniformSeededVal).getMockImplementation()!;
      vi.mocked(getUniformSeededVal).mockImplementation((noiseMap, dataId, offset) =>
        dataId.startsWith('globalLfo.') && dataId.endsWith('.lane') ? 0 : original(noiseMap, dataId, offset));
      try {
        const links = generateGlobalLfoLinks('lane-first', 'LaneFirst');
        const litTargets = GLOBAL_LFO_TARGET_IDS.filter((t) => links[t].lane !== null);
        expect(litTargets.length).toBeGreaterThan(1);
        expect(links[litTargets[0]].lane).toBe('b');
        for (const t of litTargets.slice(1)) expect(links[t].lane, t).toBe('a');
      } finally {
        vi.mocked(getUniformSeededVal).mockImplementation(original);
        evictAttenuationStyleNoiseMap('lane-first');
      }
    });

    it('leaves the quiet roll and every depth where they were: a target is quiet exactly when its own quiet draw is under 0.34', () => {
      for (let i = 0; i < 200; i++) {
        const id = `lane-quiet-${i}`;
        const noiseMap = getAttenuationStyleNoiseMap(id, `LaneQuiet${i}`);
        const links = generateGlobalLfoLinks(id, `LaneQuiet${i}`);
        for (const target of GLOBAL_LFO_TARGET_IDS) {
          const quiet = getSeededVal(noiseMap, `globalLfo.${target}.quiet`, 0, 0, 1) < 0.34;
          expect(links[target].lane === null, `${target} style ${i}`).toBe(quiet);
          if (quiet) expect(links[target].depth).toBe(0);
        }
        evictAttenuationStyleNoiseMap(id);
      }
    });

    it('never links a quiet target, and is deterministic for a style', () => {
      const first = generateGlobalLfoLinks('lane-determinism', 'LaneDeterminism');
      evictAttenuationStyleNoiseMap('lane-determinism');
      expect(generateGlobalLfoLinks('lane-determinism', 'LaneDeterminism')).toStrictEqual(first);
      evictAttenuationStyleNoiseMap('lane-determinism');
    });
  });

  it('queries getSeededVal only with .quiet/.lane/.depth dataId suffixes under globalLfo.* — no .rate/.shape draws', () => {
    generateGlobalLfoLinks('links-test-planet', 'Links');
    const globalLfoKeys = vi.mocked(getSeededVal).mock.calls
      .map(([, dataId]) => dataId)
      .filter((dataId) => dataId.startsWith('globalLfo.'));
    expect(globalLfoKeys.length).toBeGreaterThan(0);
    for (const dataId of globalLfoKeys) {
      expect(
        dataId.endsWith('.quiet') || dataId.endsWith('.lane') || dataId.endsWith('.depth'),
        `unexpected globalLfo dataId: ${dataId}`,
      ).toBe(true);
    }
  });
});

describe('generatePingVarianceAutomation', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-pva-sample-${i}`);
  });

  it('always returns a value in [0.10, 0.60], across many Attenuation Styles (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.2 — narrowed from [0.33, 0.66])', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generatePingVarianceAutomation(`seed-pva-sample-${i}`, `PvaSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(0.10);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(0.60);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    const second = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generatePingVarianceAutomation('seed-test-planet', 'Nova');
    const b = generatePingVarianceAutomation('seed-test-planet-b', 'Zenith');
    expect(b).not.toBe(a);
  });

  it('always returns a value whose percent (x100) is an integer, across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generatePingVarianceAutomation(`seed-pva-sample-${i}`, `PvaSample${i}`);
      expect(Number.isInteger(value * 100), `attenuationStyle ${i}: ${value}`).toBe(true);
    }
  });

  it('is not a Math.random()-driven value anywhere in this module (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'globalAudioSeed.ts'), 'utf-8');
    expect(source).not.toMatch(/Math\.random/);
  });
});

describe('generateSwellFrequency (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-freq-sample-${i}`);
  });

  it('always returns a value in [2, 8], across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(2);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(8);
    }
  });

  it('always lands exactly on one of SWELL_FREQUENCY_STEPS, never an off-grid raw value', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`);
      expect(SWELL_FREQUENCY_STEPS, `attenuationStyle ${i}`).toContain(value);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generateSwellFrequency('seed-test-planet', 'Nova');
    const second = generateSwellFrequency('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateSwellFrequency('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateSwellFrequency('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  // Snapped onto SWELL_FREQUENCY_STEPS (audioRigConfig.ts), only 4 of which (2, 3, 4, 8) fall
  // inside this function's own [2, 8] seed range -- a fixed pair of seeds can land on the same
  // step by pure chance (found live: 'Nova'/'Zenith' both snapped to 8), so "non-degenerate" is
  // checked the same way this file's other coarse-output tests do: sample many seeds and look
  // for genuine variety, not a single pairwise inequality.
  it('produces more than one distinct (post-snap) value across many Attenuation Styles (non-degenerate)', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    const values = new Set<number>();
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      values.add(generateSwellFrequency(`seed-freq-sample-${i}`, `FreqSample${i}`));
    }
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('generateSwellDuration (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    evictAttenuationStyleNoiseMap('seed-test-planet-b');
    for (let i = 0; i < 30; i++) evictAttenuationStyleNoiseMap(`seed-dur-sample-${i}`);
  });

  it('always returns a value in [2, 8], across many Attenuation Styles', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellDuration(`seed-dur-sample-${i}`, `DurSample${i}`);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(2);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(8);
    }
  });

  it('is deterministic — same attenuationStyleId + attenuationStyleName always produces the same value', () => {
    const first = generateSwellDuration('seed-test-planet', 'Nova');
    const second = generateSwellDuration('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateSwellDuration('seed-test-planet', 'Nova');
    evictAttenuationStyleNoiseMap('seed-test-planet');
    const second = generateSwellDuration('seed-test-planet', 'Nova');
    expect(second).toBe(first);
  });

  it('produces different values for a different Attenuation Style name (non-degenerate)', () => {
    const a = generateSwellDuration('seed-test-planet', 'Nova');
    const b = generateSwellDuration('seed-test-planet-b', 'Zenith');
    expect(b).not.toBe(a);
  });

  it('always lands on a whole number of measures, never an off-grid raw value (SWELL_DURATION_SCHEMA.step = 1)', () => {
    const SAMPLE_ATTENUATION_STYLES = 30;
    for (let i = 0; i < SAMPLE_ATTENUATION_STYLES; i++) {
      const value = generateSwellDuration(`seed-dur-sample-${i}`, `DurSample${i}`);
      expect(Number.isInteger(value), `attenuationStyle ${i}: ${value}`).toBe(true);
    }
  });
});

// docs/specs/ROBOT_PERFORMANCE.md assumption 9 / docs/tasks/ROBOT_PERFORMANCE.md Task 12 — Humanize, a Pacing scalar in whole ms.
describe('generateHumanize (Robot Performance Task 12)', () => {
  const STYLES = 300;
  const sample = () => Array.from({ length: STYLES }, (_, i) => generateHumanize(`seed-hum-sample-${i}`, `HumSample${i}`));

  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-planet');
    for (let i = 0; i < 40; i++) evictAttenuationStyleNoiseMap(`seed-test-planet-${i}`);
    for (let i = 0; i < STYLES; i++) evictAttenuationStyleNoiseMap(`seed-hum-sample-${i}`);
  });

  it('seeds in [2, 6] ms: the constant is the spec range, and sits inside the slider range', () => {
    expect(HUMANIZE_SEED_RANGE).toEqual({ min: 2, max: 6 });
    expect(HUMANIZE_SEED_RANGE.min).toBeGreaterThanOrEqual(HUMANIZE_SCHEMA.min);
    expect(HUMANIZE_SEED_RANGE.max).toBeLessThanOrEqual(HUMANIZE_SCHEMA.max);
  });

  it('always returns a whole number of ms in [2, 6], across many Attenuation Styles', () => {
    sample().forEach((value, i) => {
      expect(Number.isInteger(value), `attenuationStyle ${i}: ${value}`).toBe(true);
      expect(value, `attenuationStyle ${i}`).toBeGreaterThanOrEqual(2);
      expect(value, `attenuationStyle ${i}`).toBeLessThanOrEqual(6);
    });
  });

  it('is not degenerate: at least four distinct values over 300 Attenuation Styles (the bpmSeed guard, cloned)', () => {
    expect(new Set(sample()).size).toBeGreaterThanOrEqual(4);
  });

  it('fills its band: every whole ms from 2 to 6 occurs, and no one value takes more than half the styles', () => {
    const values = sample();
    for (const ms of [2, 3, 4, 5, 6]) expect(values, `${ms} ms`).toContain(ms);
    for (const ms of [2, 3, 4, 5, 6]) expect(values.filter((v) => v === ms).length / STYLES, `${ms} ms share`).toBeLessThan(0.5);
  });

  it('is deterministic, for a cached noise map and for a fresh one', () => {
    const first = generateHumanize('seed-test-planet', 'Nova');
    expect(generateHumanize('seed-test-planet', 'Nova')).toBe(first);
    evictAttenuationStyleNoiseMap('seed-test-planet');
    expect(generateHumanize('seed-test-planet', 'Nova')).toBe(first);
  });

  it('depends on the name: different names reach more than one value', () => {
    // The noise map is cached by id and seeded from the name when first built, so each name needs a fresh map.
    const named = new Set(Array.from({ length: 40 }, (_, i) => {
      evictAttenuationStyleNoiseMap('seed-test-planet');
      return generateHumanize('seed-test-planet', `Name${i}`);
    }));
    expect(named.size).toBeGreaterThan(1);
  });

  it('is seeded by the name alone: the id only keys the cache, so one name under many ids gives one value', () => {
    const ided = new Set(Array.from({ length: 40 }, (_, i) => generateHumanize(`seed-test-planet-${i}`, 'Nova')));
    expect(ided.size).toBe(1);
  });

  it('draws on its own dataId: it does not simply echo the swell duration seed', () => {
    const humanize = sample();
    const duration = Array.from({ length: STYLES }, (_, i) => generateSwellDuration(`seed-hum-sample-${i}`, `HumSample${i}`));
    expect(humanize.filter((h, i) => h === duration[i]).length).toBeLessThan(STYLES);
  });

  it('keeps room above and stays audible: no seeded style reaches the slider top, none falls below 2 ms', () => {
    const values = sample();
    expect(Math.max(...values)).toBeLessThan(HUMANIZE_SCHEMA.max);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(2);
  });
});

// ========================================
// SYNC DRAWS — docs/specs/FREE_SYNC_TOGGLE.md §1.7, docs/tasks/FREE_SYNC_TOGGLE.md Task 13
// ========================================

// The stated odds (spec §1.7), kept here as the TARGETS the measured share is held to. The seeder's
// own constants may be calibrated away from these (simplex draws aren't uniform); these never move.
const LANE_SYNC_TARGETS = { a: 0.75, b: 0.66, c: 0.33, d: 0.25 } as const;
const DELAY_SYNC_TARGET = 0.66;
const SHARE_TOLERANCE = 0.1;
const SHARE_SAMPLES = 200;
const DELAY_BAND = GLOBAL_AUDIO_LOADING_RANGES['delay.delayTime'];
// The unmocked pick, so a test that forces `undefined` can put the real behaviour back afterwards.
const actualTempoSync = await vi.importActual<typeof import('./tempoSync')>('./tempoSync');

describe('Sync draws — lane fallback order', () => {
  it('walks own band, then the next faster, then the next slower, then outward', () => {
    expect(LFO_BANK_SYNC_BAND_ORDER).toEqual({
      a: ['a', 'b', 'c', 'd'],
      b: ['b', 'c', 'a', 'd'],
      c: ['c', 'd', 'b', 'a'],
      d: ['d', 'c', 'b', 'a'],
    });
  });

  it('lists every lane exactly once for every lane', () => {
    for (const lane of LFO_LANE_IDS) {
      expect([...LFO_BANK_SYNC_BAND_ORDER[lane]].sort(), lane).toEqual([...LFO_LANE_IDS].sort());
      expect(LFO_BANK_SYNC_BAND_ORDER[lane][0], lane).toBe(lane);
    }
  });
});

describe('Sync draws — band coverage', () => {
  it('every lane band holds at least one note at every integer BPM in the seed range, so the fallback is never reached today', () => {
    for (let bpm = BPM_SEED_RANGE.min; bpm <= BPM_SEED_RANGE.max; bpm++) {
      for (const lane of LFO_LANE_IDS) {
        expect(allowedNoteValues(bpm, LFO_BANK_RATE_BANDS[lane], 'hz').length, `lane ${lane} @ ${bpm} BPM`).toBeGreaterThan(0);
      }
    }
  });

  it('the Delay loading band holds at least one note at every integer BPM in the seed range', () => {
    for (let bpm = BPM_SEED_RANGE.min; bpm <= BPM_SEED_RANGE.max; bpm++) {
      expect(allowedNoteValues(bpm, DELAY_BAND, 'seconds').length, `${bpm} BPM`).toBeGreaterThan(0);
    }
  });
});

describe('generateLfoBankSettings — Sync draws', () => {
  afterEach(() => {
    vi.mocked(pickSeedNoteValue).mockImplementation(actualTempoSync.pickSeedNoteValue);
    vi.mocked(getSeededVal).mockClear();
    for (let i = 0; i < SHARE_SAMPLES; i++) evictAttenuationStyleNoiseMap(`bank-sync-sample-${i}`);
  });

  it('queries lfoBank.<lane>.syncMode and .syncNote for every lane', () => {
    generateLfoBankSettings('bank-sync-sample-0', 'BankSync0');
    const keys = vi.mocked(getSeededVal).mock.calls.map(([, dataId]) => dataId);
    for (const lane of LFO_LANE_IDS) {
      expect(keys, `${lane}.syncMode`).toContain(`lfoBank.${lane}.syncMode`);
      expect(keys, `${lane}.syncNote`).toContain(`lfoBank.${lane}.syncNote`);
    }
  });

  it('a Free lane carries no `sync` key at all; a Sync lane carries a real note value', () => {
    let free = 0;
    let synced = 0;
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      const bank = generateLfoBankSettings(`bank-sync-sample-${i}`, `BankSync${i}`);
      for (const lane of LFO_LANE_IDS) {
        if ('sync' in bank[lane]) {
          synced++;
          expect(isNoteValue(bank[lane].sync), `${lane} (sample ${i})`).toBe(true);
        } else {
          free++;
        }
      }
    }
    // Both outcomes must actually occur, or the assertions above prove nothing.
    expect(free).toBeGreaterThan(0);
    expect(synced).toBeGreaterThan(0);
  });

  it('every Sync draw lies inside its own lane band at the Attenuation Style\'s seed BPM', () => {
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      const id = `bank-sync-sample-${i}`;
      const name = `BankSync${i}`;
      const bank = generateLfoBankSettings(id, name);
      const bpm = generateAttenuationStyleBpm(id, name);
      for (const lane of LFO_LANE_IDS) {
        const { sync } = bank[lane];
        if (sync === undefined) continue;
        const hz = noteValueHz(sync, bpm);
        const { min, max } = LFO_BANK_RATE_BANDS[lane];
        expect(hz, `${lane} (sample ${i}, ${bpm} BPM)`).toBeGreaterThanOrEqual(min);
        expect(hz, `${lane} (sample ${i}, ${bpm} BPM)`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('is deterministic for a Sync landing, including across a fresh noise map', () => {
    for (let i = 0; i < 20; i++) {
      const id = `bank-sync-sample-${i}`;
      const first = generateLfoBankSettings(id, `BankSync${i}`);
      evictAttenuationStyleNoiseMap(id);
      expect(generateLfoBankSettings(id, `BankSync${i}`), `sample ${i}`).toStrictEqual(first);
    }
  });

  it.each(LFO_LANE_IDS.map((lane) => [lane, LANE_SYNC_TARGETS[lane]] as const))(
    'lane %s seeds Sync for ~%f of Attenuation Styles (±10 points)',
    (lane, target) => {
      let synced = 0;
      for (let i = 0; i < SHARE_SAMPLES; i++) {
        if (generateLfoBankSettings(`bank-sync-sample-${i}`, `BankSync${i}`)[lane].sync !== undefined) synced++;
      }
      const share = synced / SHARE_SAMPLES;
      expect(share, `${lane}: ${synced}/${SHARE_SAMPLES}`).toBeGreaterThanOrEqual(target - SHARE_TOLERANCE);
      expect(share, `${lane}: ${synced}/${SHARE_SAMPLES}`).toBeLessThanOrEqual(target + SHARE_TOLERANCE);
    },
  );

  it('when no band has a note, every lane stays Free and its seeded rate is unchanged — and the pick is asked at the seed BPM', () => {
    const id = 'bank-sync-sample-3';
    const name = 'BankSync3';
    const real = generateLfoBankSettings(id, name);
    expect(LFO_LANE_IDS.some((lane) => real[lane].sync !== undefined), 'precondition: this style seeds some Sync').toBe(true);

    vi.mocked(pickSeedNoteValue).mockClear();
    vi.mocked(pickSeedNoteValue).mockReturnValue(undefined);
    const forcedFree = generateLfoBankSettings(id, name);
    const bpm = generateAttenuationStyleBpm(id, name);
    for (const lane of LFO_LANE_IDS) {
      const { sync: _sync, ...rest } = real[lane];
      expect('sync' in forcedFree[lane], `${lane} stays Free`).toBe(false);
      expect(forcedFree[lane], `${lane} keeps its Free values`).toStrictEqual(rest);
    }
    const calls = vi.mocked(pickSeedNoteValue).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, calledBpm, bands, unit] of calls) {
      expect(calledBpm).toBe(bpm);
      expect(unit).toBe('hz');
      expect(bands).toHaveLength(LFO_LANE_IDS.length);
    }
  });
});

describe('generateGlobalAudioSettings — Delay Sync draw', () => {
  afterEach(() => {
    vi.mocked(pickSeedNoteValue).mockImplementation(actualTempoSync.pickSeedNoteValue);
    vi.mocked(getSeededVal).mockClear();
    for (let i = 0; i < SHARE_SAMPLES; i++) evictAttenuationStyleNoiseMap(`delay-sync-sample-${i}`);
  });

  it('queries globalAudio.delay.syncMode and .syncNote', () => {
    generateGlobalAudioSettings('delay-sync-sample-0', 'DelaySync0');
    const keys = vi.mocked(getSeededVal).mock.calls.map(([, dataId]) => dataId);
    expect(keys).toContain('globalAudio.delay.syncMode');
    expect(keys).toContain('globalAudio.delay.syncNote');
  });

  it('a Free Delay carries no `sync` key at all; a Sync Delay carries a real note value', () => {
    let free = 0;
    let synced = 0;
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      const { delay } = generateGlobalAudioSettings(`delay-sync-sample-${i}`, `DelaySync${i}`);
      if ('sync' in delay) {
        synced++;
        expect(isNoteValue(delay.sync), `sample ${i}`).toBe(true);
      } else {
        free++;
      }
    }
    expect(free).toBeGreaterThan(0);
    expect(synced).toBeGreaterThan(0);
  });

  it('every Sync draw lies inside the Delay loading band (0.05–0.5 s) at the seed BPM', () => {
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      const id = `delay-sync-sample-${i}`;
      const name = `DelaySync${i}`;
      const { delay } = generateGlobalAudioSettings(id, name);
      if (delay.sync === undefined) continue;
      const seconds = noteValueSeconds(delay.sync, generateAttenuationStyleBpm(id, name));
      expect(seconds, `sample ${i}`).toBeGreaterThanOrEqual(DELAY_BAND.min);
      expect(seconds, `sample ${i}`).toBeLessThanOrEqual(DELAY_BAND.max);
    }
  });

  it('seeds Sync for ~66% of Attenuation Styles (±10 points)', () => {
    let synced = 0;
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      if (generateGlobalAudioSettings(`delay-sync-sample-${i}`, `DelaySync${i}`).delay.sync !== undefined) synced++;
    }
    const share = synced / SHARE_SAMPLES;
    expect(share, `${synced}/${SHARE_SAMPLES}`).toBeGreaterThanOrEqual(DELAY_SYNC_TARGET - SHARE_TOLERANCE);
    expect(share, `${synced}/${SHARE_SAMPLES}`).toBeLessThanOrEqual(DELAY_SYNC_TARGET + SHARE_TOLERANCE);
  });

  // Replaces the old "a quiet Delay still rolls its own Sync" test: there is no quiet roll to be independent of
  // any more (Robot Sends T6), so what remains to pin is that Sync lands on a Delay at full return.
  it('a Sync Delay still lands, at its full return (wet 1) - removing the quiet roll did not take Sync with it', () => {
    let synced = 0;
    for (let i = 0; i < SHARE_SAMPLES; i++) {
      const { delay } = generateGlobalAudioSettings(`delay-sync-sample-${i}`, `DelaySync${i}`);
      expect(delay.wet).toBe(1);
      if (delay.sync !== undefined) synced++;
    }
    expect(synced).toBeGreaterThan(0);
  });

  it('when no band has a note, the Delay stays Free with its seeded delayTime unchanged — and the pick is asked at the seed BPM', () => {
    const id = 'delay-sync-sample-1';
    const name = 'DelaySync1';
    const real = generateGlobalAudioSettings(id, name).delay;
    expect(real.sync, 'precondition: this style seeds a Sync Delay').toBeDefined();

    vi.mocked(pickSeedNoteValue).mockClear();
    vi.mocked(pickSeedNoteValue).mockReturnValue(undefined);
    const forcedFree = generateGlobalAudioSettings(id, name).delay;
    const { sync: _sync, ...rest } = real;
    expect('sync' in forcedFree).toBe(false);
    expect(forcedFree).toStrictEqual(rest);
    const [[, calledBpm, bands, unit]] = vi.mocked(pickSeedNoteValue).mock.calls;
    expect(calledBpm).toBe(generateAttenuationStyleBpm(id, name));
    expect(bands).toEqual([DELAY_BAND]);
    expect(unit).toBe('seconds');
  });
});

// ========================================
// SEED ORACLE — docs/specs/FREE_SYNC_TOGGLE.md §1.7 / §5, docs/tasks/FREE_SYNC_TOGGLE.md Task 3
// ========================================

// Complete, byte-exact output of the two seeders for two fixed Attenuation Styles, captured from the
// code as it stood BEFORE the Free | Sync seeding (Task 13) touched it. They prove that adding the
// Sync rolls leaves every Free value — and so every existing world's sound — exactly as it was.
//
// DO NOT REGENERATE THESE EXPECTATIONS. Re-recording them to make a failing test pass is a spec
// violation, not a fix: a mismatch means the seeder's existing keys or draw order changed. Task 13
// may only ADD a `sync` key to a lane or to `delay`, and only to these expectations.
//
// 'oracle-alpha' used to seed an audible Delay (wet 0.24); 'oracle-theta' used to hit the quiet branch (wet
// forced to 0), so both sides of the old quiet-Delay logic were pinned.
//
// AMENDED BY HAND, Robot Sends T6 (docs/specs/ROBOT_SENDS.md §1.2, Crawford's pre-v1 decision that existing
// worlds need not keep their sound): reverb.wet and delay.wet are now the global rooms' fixed full return
// (1), no longer sampled, and the quiet-Delay roll moved to the robots. Exactly four values changed - the
// two wet fields in each of the two global-settings oracles below - and nothing else: every other field in
// every oracle is still the byte-exact pre-Sync value, which is the proof no other draw moved. The edit was
// made by hand to those four values; the oracle was NOT re-recorded, and the rule above still stands for
// everything else in it.
//
// AMENDED BY HAND, Global Colour T1 (docs/specs/GLOBAL_COLOUR.md §1.2): `distortion`, `chebyshev` and
// `bitCrusher` were ADDED to each global-settings oracle (keys only; no existing value touched). At T1 the
// seeder returns the defaults for them as a placeholder; T5 replaces those values with the character draw.
// T5 values were derived by hand, not copied from the seeder: the raw noise draws for 'globalAudio.colour.character'
// and the six colour keys were read for each style (alpha t = 0.906 -> foldCrush; theta t = 0.688 -> crush), each
// shape value was mapped into its loading band and quantised onto the full range's grid (min + n * step), and a
// node outside the character's lit set got wet 0. No pre-existing value in either oracle was touched.
//
// AMENDED BY HAND, Global Colour T14 (2026-10-15, Crawford: no colour Mix above 0.25 on load): the three lit colour
// wets moved because their loading bands moved (all three are now 0.10 to 0.25). Derived by hand from the same raw
// draws, band formula 0.10 + 0.15 * t quantised onto the 0.01 grid: alpha chebyshev t = 0.4810 -> 0.1722 -> 0.17
// (was 0.27); alpha bitCrusher t = 0.8067 -> 0.2210 -> 0.22 (was 0.35); theta bitCrusher t = 0.4971 -> 0.1746 -> 0.17
// (was 0.27). The same formula on the old 0.15 to 0.40 band reproduces the old values, which is the check that the
// draws were read correctly. Every other value, including each shape value and each unlit wet, is untouched.
//
// AMENDED AGAIN, same task (Crawford: "keep those ones lower"): Chebyshev and Bit Crusher return to a band below
// Distortion's, 0.05 to 0.15 (Distortion stays 0.10 to 0.25), so formula 0.05 + 0.10 * t on the same draws: alpha
// chebyshev 0.0981 -> 0.10; alpha bitCrusher 0.1307 -> 0.13; theta bitCrusher 0.0997 -> 0.10. These two lines replace
// the 0.17 / 0.22 / 0.17 above; no distortion value is lit in either oracle.
//
// AMENDED A THIRD TIME, same task (Crawford: at most one effect on per world at load): the three pair characters were
// dropped and the edges refitted to 0.3065 / 0.5 / 0.6935 / 1 (clean, drive, fold, crush at about 25 % each), so the
// two draws that fell in the old pair bands moved band. Derived by hand from the same raw draws: alpha t = 0.9060 is at
// or above 0.6935 -> crush (it was foldCrush), so only BitCrusher is lit: bitCrusher.wet 0.05 + 0.10 * 0.8067 = 0.1307
// -> 0.13, and chebyshev.wet is now 0 (was 0.10). theta t = 0.6879 lies in [0.5, 0.6935) -> fold (it was crush), so only
// Chebyshev is lit: chebyshev.wet 0.05 + 0.10 * 0.2596 = 0.0760 -> 0.08, and bitCrusher.wet is now 0 (was 0.10). Every
// shape value is unchanged: a node outside the lit set still draws its shape.
//
// AMENDED BY HAND, Global Modulation T1 then T7 (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.2): `autoWah` and `phaser`
// were ADDED to each global-settings oracle (keys only; no existing value touched). T1 put the dry defaults in as a
// placeholder; T7 replaced them with values derived by hand from the RAW uniform draws, with arithmetic of the derivation's
// own (no call into the seeder): each of the seventeen keys read with getUniformSeededVal, the thirteen value keys
// mapped through their loading band (log fields min * (max / min)^t, linear fields min + (max - min) * t) and
// quantised onto the full range's grid (min + n * step). Raw draws, alpha: autoWah.lit 0.8995 (not under 1/3: dark),
// phaser.lit 0.0182 (lit), phaser.syncMode 0.3793 (under 0.5: synced), phaser.syncNote 0.2138 picks index
// floor(0.2138 * 8) = 1 of the 8 notes in 0.1 to 1 Hz at the style's 74 BPM = 1/4 dotted; phaser.wet t 0.3222 ->
// 0.10 + 0.15 * 0.3222 = 0.1483 -> 0.15; autoWah.wet t 0.8553 -> 0.2283 -> 0.23 but forced to 0 (dark). Theta:
// autoWah.lit 0.2357 (lit), phaser.lit 0.6222 (dark); autoWah.wet t 0.9720 -> 0.2458 -> 0.25 (the ceiling), and
// phaser.wet t 0.9875 -> 0.2481 -> 0.25 but forced to 0, with no sync key. Every other value in both oracles is
// untouched. Never re-recorded.
//
// AMENDED BY HAND AGAIN, Global Modulation T16 (Crawford, 2026-10-15: his recommended ranges, GLOBAL_CHAIN_GRID.md): the
// pedal loading bands moved, so only the two pedal blocks in each oracle moved, and no other key. Every raw draw is the
// one above; each value is the old one re-read through the new band. Alpha: baseFrequency t 0.6557 -> 50 * 5^t = 143.59;
// Q t 0.2546 -> 2 * 3^t = 2.647; octaves 4.5, sensitivity -19, gain 6 on the new grids; phaser octaves 3.5, stages 10,
// Q t 0.5172 -> 10^t = 3.291, wet t 0.3222 -> 0.25 + 0.35 * 0.3222 = 0.3628 -> 0.36; the synced note index is the same
// but the 0.1 to 2.5 Hz band at 74 BPM holds more notes, and the pick is now 1/8 dotted (1.64 Hz). Theta: baseFrequency
// t 0.5553 -> 122.21; Q t 0.7885 -> 4.752; wet t 0.9720 -> 0.3 + 0.4 * 0.9720 = 0.6888 -> 0.69; phaser stages 8, Q t 0.3762
// -> 2.378, still dark (wet 0, no sync). The new values were read from the seeder once and then checked against these
// derivations; the log-scale ones agree to three significant figures, the stepped ones to their grid.
//
// AMENDED BY HAND ONCE MORE, Global Modulation T16 (Crawford, 2026-10-15: "bring those down a bit"): the pedal Mix bands went from
// 0.3-0.7 and 0.25-0.6 to 0.2-0.5 and 0.15-0.4, so exactly two values moved, each from the raw draw above: alpha phaser.wet t 0.3222
// -> 0.15 + 0.25 * 0.3222 = 0.2306 -> 0.23 (was 0.36); theta autoWah.wet t 0.9720 -> 0.2 + 0.3 * 0.9720 = 0.4916 -> 0.49 (was 0.69).
//
// AMENDED BY HAND, Global Pedals T1 then T8 (docs/specs/GLOBAL_PEDALS.md §1.2): `chorus`, `tremolo`, `vibrato`,
// `frequencyShifter` and `stereoWidener` were ADDED to each global-settings oracle (keys only; no existing value touched).
// T1 put the dry defaults in as a placeholder; T8 replaced them with values derived by hand from the RAW uniform draws
// (each key read with getUniformSeededVal by a throwaway harness), with arithmetic of the derivation's own: each linear
// field min + (max - min) * t over its loading band, quantised onto its full range's grid (fullMin + n * step).
// The lit rolls run in chain order after the AutoWah and Phaser rolls under PEDAL_LIT_EDGE (0.25 / 0.25 / 0.25 / 0.15),
// a pedal forced dark once two Modulation pedals are lit (MAX_LIT_PEDALS). Alpha (AutoWah dark, Phaser lit: one lit):
// chorus.lit 0.1459 (lit, two lit), tremolo.lit 0.8279 (dark), vibrato.lit 0.3849 (dark), frequencyShifter.lit 0.0335
// (under 0.15 but CAPPED dark); chorus.syncMode 0.0441 (synced), syncNote 0.5454 picks index floor(0.5454 * 10) = 5 of the
// 10 notes in 0.2 to 2 Hz at 74 BPM = 1/2 (0.617 Hz); chorus rate t 0.2848 -> 0.7126 -> 0.70, delayTime t 0.7021 -> 6.21
// -> 6, depth t 0.3162 -> 0.4265 -> 0.43, spread t 0.0831 -> 97.48 -> 95, feedback t 0.9274 -> 0.1855 -> 0.19, wet t 0.0362
// -> 0.1591 -> 0.16; tremolo rate t 0.9436 -> 5.69 -> 5.70, depth t 0.1209 -> 0.35, spread t 0.0205 -> 91.84 -> 90; vibrato
// rate t 0.9712 -> 6.86 -> 6.85, depth t 0.1808 -> 0.0952 -> 0.10; shift sign t 0.2710 (under 0.5: negative), magnitude t
// 0.4890 -> 10.80 -> 11, so -11; width t 0.9587 -> 0.6397 -> 0.64. Theta (AutoWah lit, Phaser dark: one lit): chorus.lit
// 0.7093 (dark), tremolo.lit 0.1237 (lit, two lit), vibrato.lit 0.9528 (dark), frequencyShifter.lit 0.3313 (dark);
// tremolo.syncMode 0.0794 (synced), syncNote 0.4535 picks index floor(0.4535 * 11) = 4 of the 11 notes in 0.5 to 6 Hz at 58
// BPM = 1/16 dotted (2.58 Hz); tremolo rate t 0.2309 -> 1.77 -> 1.75, depth t 0.1180 -> 0.35, spread t 0.4432 -> 129.88 ->
// 130, wet t 0.3262 -> 0.2979 -> 0.30; chorus rate t 0.7198 -> 1.4956 -> 1.50, delayTime t 0.7723 -> 6.63 -> 6.5, depth t
// 0.2567 -> 0.40, spread t 0.6312 -> 146.81 -> 145, feedback t 0.4261 -> 0.0852 -> 0.09; vibrato rate t 0.3718 -> 3.86 ->
// 3.85, depth t 0.3046 -> 0.1261 -> 0.13 (its syncMode 0.0153 is under 0.5, but a dark pedal is Free); shift sign t 0.5761
// (positive), magnitude t 0.6487 -> 13.68 -> 14; width t 0.4577 -> 0.5144 -> 0.51. Every dark pedal's wet is 0. The float
// tails (0.7000000000000001 and so on) are fullMin + n * step in IEEE arithmetic, as the Phaser's 1.7500000000000002 is.
//
// AMENDED BY HAND, Classic Band Retune T1 (docs/tasks/CLASSIC_BAND_RETUNE.md §2, 2026-10-21): ten loading bands moved, so
// the values drawn through them moved; the raw draws did not. Derived from the same raw draws (HPF is the plain draw, the
// rest uniform), the band formula (log: 20 * 6^t; linear: min + (max - min) * t) and quantisation onto the full range's
// grid, and checked by running the OLD bands over the same draws, which reproduces every old value above. Alpha: HPF
// t 0.9139 -> 20 * 6^t = 102.85 (was 379.02 on 20-500); AutoWah sensitivity t 0.6903 -> -9.65 -> -10 (band -20 to -5; was
// -19); phaser.wet t 0.3222 -> 0.3 + 0.1 * t = 0.3322 -> 0.33 (was 0.23); chorus delayTime t 0.7021 -> 6 + 9 * t = 12.32 ->
// 12.5 (was 6); chorus.wet t 0.0362 -> 0.3036 -> 0.30 (was 0.16); vibrato depth t 0.1808 -> 0.03 + 0.09 * t = 0.0463 ->
// 0.05 (was 0.10). Theta: HPF t 0.6400 -> 62.96 (was 156.94); sensitivity t 0.1961 -> -17.06 -> -17 (was -34);
// autoWah.wet t 0.9720 -> 0.35 + 0.15 * t = 0.4958 -> 0.50 (was 0.49); chorus delayTime t 0.7723 -> 12.95 -> 13 (was 6.5);
// tremolo.wet t 0.3262 -> 0.35 + 0.15 * t = 0.3989 -> 0.40 (was 0.30); vibrato depth t 0.3046 -> 0.0574 -> 0.06 (was
// 0.13). The vibrato, shifter, wah (alpha) and phaser (theta) wets are dark in these styles and stay 0. Every other value
// is untouched: no roll, sync draw or other band moved.
//
// AMENDED BY HAND, Classic Band Retune T2 (Decision 1 = B, 2026-10-21): the lit colour Mix bands moved (Chebyshev and Bit
// Crusher to 0.25-0.35, Distortion to 0.2-0.3), so the two lit colour wets moved, from the same raw draws (read as above;
// the Distortion wet is dark in both styles): alpha bitCrusher.wet t 0.8067 -> 0.25 + 0.10 * t = 0.3307 -> 0.33 (was 0.13);
// theta chebyshev.wet t 0.2596 -> 0.25 + 0.10 * t = 0.2760 -> 0.28 (was 0.08). The old band 0.05 + 0.10 * t reproduces
// 0.1307 and 0.0760, which is the check. Nothing else moved.
//
// AMENDED BY HAND AGAIN, Classic Band Retune after Crawford's listen (Checkpoint B, 2026-10-21, "much more subtle"): all three
// colour Mix bands became one shared 0.10-0.20, so the same two lit wets moved from the same raw draws: alpha bitCrusher.wet
// t 0.8067 -> 0.10 + 0.10 * t = 0.1807 -> 0.18 (was 0.33); theta chebyshev.wet t 0.2596 -> 0.1260 -> 0.13 (was 0.28).
//
// AMENDED BY HAND, Classic Band Retune T6 (Crawford: "retune as proposed", 2026-10-21): the Compressor's threshold and ratio
// bands moved to -36 to -18 dB and 2 to 6 (plain draws, whole-number grids anchored at the full range's -60 and 1). From the
// same raw draws: alpha threshold t 0.7558 -> -36 + 18 * t = -22.40 -> -22 (was -47), ratio t 0.7303 -> 2 + 4 * t = 4.92 -> 5
// (was 17); theta threshold t 0.4466 -> -27.96 -> -28 (was -51), ratio t 0.4236 -> 3.69 -> 4 (was 14). The old bands
// -55 + 10 * t and 10 + 10 * t reproduce -47, 17, -51 and 14, which is the check. Attack, release and knee did not move.
describe('seed oracle (pre-Sync output, do not regenerate)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('oracle-alpha');
    evictAttenuationStyleNoiseMap('oracle-theta');
  });

  it('generateGlobalAudioSettings("oracle-alpha") — was the audible Delay', () => {
    expect(generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha')).toStrictEqual({
      compressorBeforeDelay: false,
      compressor: {
        threshold: -22,
        ratio: 5,
        attack: 0.02815783553749843,
        release: 0.2207947804737712,
        knee: 10,
      },
      eq3: { low: 3.5, mid: 3.5, high: 4 },
      filterLPF: { type: 'lowpass', frequency: 9399.096577662036, Q: 2.2990614853419933 },
      filterHPF: { type: 'highpass', frequency: 102.8526501063134, Q: 3.033962391581509 },
      // Global Colour T5, amended T14: this style draws the crush character (BitCrusher lit; the others dry).
      distortion: { amount: 0.32, wet: 0 },
      chebyshev: { order: 4, wet: 0 },
      bitCrusher: { bits: 9, wet: 0.18 },
      // Robot Effect Sends T2: the Colour room Return, from the defaults (amended by hand; nothing else moved).
      colourRoom: { wet: 1 },
      // Global Modulation T7: this style leaves the AutoWah dark (wet 0, shape values still drawn) and lights the Phaser, synced.
      autoWah: { baseFrequency: 143.59378317897256, octaves: 4.5, sensitivity: -10, Q: 2.6466924484208345, gain: 6, follower: 0.3708443868326711, wet: 0 },
      phaser: {
        rate: 2.05,
        octaves: 3.5,
        baseFrequency: 692.0599193838607,
        stages: 10,
        Q: 3.291005415199408,
        wet: 0.33,
        sync: { division: '1/8', modifier: 'dotted' },
      },
      // Global Pedals T8: the Phaser is lit, the Chorus lights (synced), so the shifter's lit roll is capped dark.
      chorus: { rate: 0.7000000000000001, delayTime: 12.5, depth: 0.43, spread: 95, feedback: 0.19, wet: 0.3, sync: { division: '1/2', modifier: 'straight' } },
      tremolo: { rate: 5.7, depth: 0.35000000000000003, spread: 90, wet: 0 },
      vibrato: { rate: 6.8500000000000005, depth: 0.05, wet: 0 },
      frequencyShifter: { shift: -11, wet: 0 },
      stereoWidener: { width: 0.64 },
      delay: { delayTime: 0.41300000000000003, feedback: 0.36, wet: 1 },
      reverb: { decay: 2.938135345442085, preDelay: 0.09, wet: 1 },
      limiter: { threshold: -1 },
    });
  });

  it('generateGlobalAudioSettings("oracle-theta") — was the quiet Delay (wet forced to 0)', () => {
    expect(generateGlobalAudioSettings('oracle-theta', 'oracle-theta')).toStrictEqual({
      compressorBeforeDelay: false,
      compressor: {
        threshold: -28,
        ratio: 4,
        attack: 0.005351539547536516,
        release: 0.12726233469418596,
        knee: 6,
      },
      eq3: { low: -3.5, mid: -3.5, high: -3.5 },
      filterLPF: { type: 'lowpass', frequency: 4751.3168173899885, Q: 0.21951212264688055 },
      filterHPF: { type: 'highpass', frequency: 62.95985983853713, Q: 0.893615040856134 },
      // Global Colour T5, amended T14: this style draws the fold character (Chebyshev lit; the others dry, their shape still drawn).
      distortion: { amount: 0.26, wet: 0 },
      chebyshev: { order: 3, wet: 0.13 },
      bitCrusher: { bits: 8, wet: 0 },
      // Robot Effect Sends T2: the Colour room Return, from the defaults (amended by hand; nothing else moved).
      colourRoom: { wet: 1 },
      // Global Modulation T7: this style lights the AutoWah and leaves the Phaser dark (wet 0, no sync, shape values still drawn).
      autoWah: { baseFrequency: 122.21333074133409, octaves: 3.5, sensitivity: -17, Q: 4.752278894146856, gain: 4, follower: 0.10429057048537012, wet: 0.5 },
      phaser: { rate: 1.7500000000000002, octaves: 3, baseFrequency: 461.3838345902475, stages: 8, Q: 2.3776026949624773, wet: 0 },
      // Global Pedals T8: the AutoWah is lit and the Tremolo lights (synced); the other three motion pedals roll dark.
      chorus: { rate: 1.5000000000000002, delayTime: 13, depth: 0.4, spread: 145, feedback: 0.09, wet: 0 },
      tremolo: { rate: 1.7500000000000002, depth: 0.35000000000000003, spread: 130, wet: 0.4, sync: { division: '1/16', modifier: 'dotted' } },
      vibrato: { rate: 3.85, depth: 0.06, wet: 0 },
      frequencyShifter: { shift: 14, wet: 0 },
      stereoWidener: { width: 0.51 },
      // Task 13: the only change to this expectation — a Sync landing adds this key, nothing else moved.
      delay: { delayTime: 0.139, feedback: 0.27, wet: 1, sync: { division: '1/16', modifier: 'straight' } },
      reverb: { decay: 0.9388970155030818, preDelay: 0.05, wet: 1 },
      limiter: { threshold: -2 },
    });
  });

  it('generateLfoBankSettings("oracle-alpha")', () => {
    expect(generateLfoBankSettings('oracle-alpha', 'oracle-alpha')).toStrictEqual({
      a: { shape: 'sawtooth', rate: 0.35000000000000003, rateDrift: 0.59, depthDrift: 0.51 },
      b: { shape: 'square', rate: 1.25, rateDrift: 0.15, depthDrift: 0.5700000000000001 },
      c: { shape: 'sawtooth', rate: 3.4000000000000004, rateDrift: 0.19, depthDrift: 0.04 },
      d: { shape: 'square', rate: 7.25, rateDrift: 0.48, depthDrift: 0.08 },
    });
  });

  it('generateLfoBankSettings("oracle-theta")', () => {
    // Task 13: lanes a and c landed Sync — the added `sync` keys are the only change to this
    // expectation. b and d landed Free and stay byte-identical, with no `sync` key.
    expect(generateLfoBankSettings('oracle-theta', 'oracle-theta')).toStrictEqual({
      a: { shape: 'triangle', rate: 0.25, rateDrift: 0.23, depthDrift: 0.02, sync: { division: '1', modifier: 'dotted' } },
      b: { shape: 'sawtooth', rate: 0.6000000000000001, rateDrift: -0.15, depthDrift: 0.17 },
      c: { shape: 'square', rate: 1.8, rateDrift: -0.19, depthDrift: -0.3, sync: { division: '1/8', modifier: 'triplet' } },
      d: { shape: 'triangle', rate: 5.2, rateDrift: -0.42, depthDrift: -0.08 },
    });
  });

  it('is stable across a fresh noise map too, not just a cached one', () => {
    const first = generateLfoBankSettings('oracle-alpha', 'oracle-alpha');
    evictAttenuationStyleNoiseMap('oracle-alpha');
    expect(generateLfoBankSettings('oracle-alpha', 'oracle-alpha')).toStrictEqual(first);
  });
});
