// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// Spy on getSeededVal while keeping its real behavior (the worldTransition.test.ts
// importOriginal pattern) — Task 6's acceptance criterion needs to see exactly which
// dataId keys generateGlobalLfoLinks queries, without breaking every other test in
// this file that depends on getSeededVal's real seeded output.
vi.mock('./getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./getSeededVal')>();
  return { ...actual, getSeededVal: vi.fn(actual.getSeededVal) };
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
  scaleUnitValue,
  pickColourCharacter,
  COLOUR_CHARACTERS,
  COLOUR_CHARACTER_NODES,
  COLOUR_CHARACTER_BANDS,
  LFO_BANK_RATE_BANDS,
  LFO_BANK_DRIFT_SEED_RANGE,
  LFO_BANK_SYNC_BAND_ORDER,
} from './globalAudioSeed';
import { evictAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';
import { pickSeedNoteValue } from './tempoSync';
import { generateAttenuationStyleBpm, BPM_SEED_RANGE } from './bpmSeed';
import { allowedNoteValues, isNoteValue, noteValueHz, noteValueSeconds } from '@/data/noteValues';
import { GLOBAL_AUDIO_LOADING_RANGES } from '@/data/globalAudioLoadingRanges';
import { type GlobalAudioSeedFieldKey } from '@/data/globalAudioSeedRanges';
import { GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS, LFO_SHAPES } from '@/types/lfo';
import { GLOBAL_AUDIO_SEED_RANGES } from '@/data/globalAudioSeedRanges';
import { SWELL_FREQUENCY_STEPS } from '@/data/audioRigConfig';

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

  it('returns no chorus field and no reverb.dampening field', () => {
    const settings = generateGlobalAudioSettings('seed-test-planet', 'Nova');
    expect('chorus' in settings).toBe(false);
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
    const valueByKey: Partial<Record<GlobalAudioSeedFieldKey, number>> = {
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
    };
    const sampledKeys = Object.keys(valueByKey) as GlobalAudioSeedFieldKey[];
    // Sanity: every loading row except the five wet rows is checked, so a newly added row cannot slip past.
    // The three colour wets are absent on purpose too: an unlit node seeds wet 0, which is outside its lit band
    // (they are pinned by the colour tests below).
    const COLOUR_WET_ROWS = 3;
    expect(sampledKeys.length).toBe(Object.keys(GLOBAL_AUDIO_LOADING_RANGES).length - 2 - COLOUR_WET_ROWS);
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

    it('keeps the two wet loading rows at the per-robot send bands, untouched by the seeder', () => {
      expect(GLOBAL_AUDIO_LOADING_RANGES['reverb.wet']).toEqual({ min: 0.1, max: 0.4 });
      expect(GLOBAL_AUDIO_LOADING_RANGES['delay.wet']).toEqual({ min: 0, max: 0.3 });
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
    it('names seven characters: clean, three singles and three pairs', () => {
      expect([...COLOUR_CHARACTERS]).toStrictEqual(['clean', 'drive', 'fold', 'crush', 'driveFold', 'driveCrush', 'foldCrush']);
    });

    it('lights the nodes each name says, and never all three', () => {
      expect(COLOUR_CHARACTER_NODES.clean).toStrictEqual([]);
      expect(COLOUR_CHARACTER_NODES.drive).toStrictEqual(['distortion']);
      expect(COLOUR_CHARACTER_NODES.fold).toStrictEqual(['chebyshev']);
      expect(COLOUR_CHARACTER_NODES.crush).toStrictEqual(['bitCrusher']);
      expect(COLOUR_CHARACTER_NODES.driveFold).toStrictEqual(['distortion', 'chebyshev']);
      expect(COLOUR_CHARACTER_NODES.driveCrush).toStrictEqual(['distortion', 'bitCrusher']);
      expect(COLOUR_CHARACTER_NODES.foldCrush).toStrictEqual(['chebyshev', 'bitCrusher']);
      for (const c of COLOUR_CHARACTERS) expect(COLOUR_CHARACTER_NODES[c].length, c).toBeLessThan(3);
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
      expect(pickColourCharacter(1)).toBe('foldCrush');
      expect(pickColourCharacter(7)).toBe('foldCrush');
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
            expect(s[node].wet, `${node} style ${i}`).toBeGreaterThanOrEqual(wetBand[node].min);
            expect(s[node].wet, `${node} style ${i}`).toBeLessThanOrEqual(wetBand[node].max);
          } else {
            expect(s[node].wet, `${node} style ${i}`).toBe(0);
          }
        }
      }
    });

    it('never lights all three nodes', () => {
      for (let i = 0; i < 300; i++) {
        expect(litNodes(generateGlobalAudioSettings(`colour-sample-${i}`, `ColourSample${i}`)).length, `style ${i}`).toBeLessThan(3);
      }
    });

    // The raw draw is bell-curved and discrete (see COLOUR_CHARACTER_BANDS), so the nominal edges
    // 0.25 / 0.45 / 0.65 / 0.85 / 0.90 / 0.95 gave 10 / 34 / 18 / 30 / 4 / 4 / 0 %. The edges were fitted on styles
    // named 'ColourCalibration<n>'; this test samples a different set, so it is a hold-out check and not a
    // restatement of the fit.
    it('realises the target shares over 3000 hold-out styles, within 3 points: clean 25, each single 20, each pair 5', () => {
      const TARGET: Record<(typeof COLOUR_CHARACTERS)[number], number> = {
        clean: 25,
        drive: 20,
        fold: 20,
        crush: 20,
        driveFold: 5,
        driveCrush: 5,
        foldCrush: 5,
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
    });

    it('reads exactly the seven new seed keys on every style, whatever its character, and renames no existing key', () => {
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
describe('seed oracle (pre-Sync output, do not regenerate)', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('oracle-alpha');
    evictAttenuationStyleNoiseMap('oracle-theta');
  });

  it('generateGlobalAudioSettings("oracle-alpha") — was the audible Delay', () => {
    expect(generateGlobalAudioSettings('oracle-alpha', 'oracle-alpha')).toStrictEqual({
      compressorBeforeDelay: false,
      compressor: {
        threshold: -47,
        ratio: 17,
        attack: 0.02815783553749843,
        release: 0.2207947804737712,
        knee: 10,
      },
      eq3: { low: 3.5, mid: 3.5, high: 4 },
      filterLPF: { type: 'lowpass', frequency: 9399.096577662036, Q: 2.2990614853419933 },
      filterHPF: { type: 'highpass', frequency: 379.02404888390515, Q: 3.033962391581509 },
      // Global Colour T5: this style draws the foldCrush character (Chebyshev + BitCrusher lit, Distortion dry).
      distortion: { amount: 0.32, wet: 0 },
      chebyshev: { order: 4, wet: 0.27 },
      bitCrusher: { bits: 9, wet: 0.35000000000000003 },
      delay: { delayTime: 0.41300000000000003, feedback: 0.36, wet: 1 },
      reverb: { decay: 2.938135345442085, preDelay: 0.09, wet: 1 },
      limiter: { threshold: -1 },
    });
  });

  it('generateGlobalAudioSettings("oracle-theta") — was the quiet Delay (wet forced to 0)', () => {
    expect(generateGlobalAudioSettings('oracle-theta', 'oracle-theta')).toStrictEqual({
      compressorBeforeDelay: false,
      compressor: {
        threshold: -51,
        ratio: 14,
        attack: 0.005351539547536516,
        release: 0.12726233469418596,
        knee: 6,
      },
      eq3: { low: -3.5, mid: -3.5, high: -3.5 },
      filterLPF: { type: 'lowpass', frequency: 4751.3168173899885, Q: 0.21951212264688055 },
      filterHPF: { type: 'highpass', frequency: 156.94304105044972, Q: 0.893615040856134 },
      // Global Colour T5: this style draws the crush character (BitCrusher lit; the others dry, their shape still drawn).
      distortion: { amount: 0.26, wet: 0 },
      chebyshev: { order: 3, wet: 0 },
      bitCrusher: { bits: 8, wet: 0.27 },
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
