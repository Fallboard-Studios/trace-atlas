// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import type { NoiseFunction2D } from 'simplex-noise';
import type { GlobalAudioSettings } from '../types/globalAudio';
import { LFO_LANE_IDS, LFO_RATE_MIN, type BankLfoSettings, type LfoLaneId, type LfoShape } from '../types/lfo';
import { getBand } from '../data/bands/loadingContext';
import { GLOBAL_AUDIO_SEED_RANGES, type LoadingRangeKey } from '../data/globalAudioSeedRanges';
import { correlation, outerTenths } from '../testUtils/spread';
import { getCentredSeededVal, getUniformSeededVal } from './getSeededVal';
import { quantizeToStep } from './math';
import { evictAttenuationStyleNoiseMap, getAttenuationStyleNoiseMap } from './noiseMaps';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { pickSeedNoteValue } from './tempoSync';
import { LFO_SHAPE_SEED_ORDER, pickShape } from './lfoShapeDraw';
import {
  COLOUR_CHARACTERS,
  COLOUR_CHARACTER_NODES,
  LFO_BANK_DRIFT_SEED_RANGE,
  LFO_BANK_RATE_BANDS,
  LFO_BANK_SYNC_BAND_ORDER,
  generateGlobalAudioSettings,
  generateLfoBankSettings,
  pickColourCharacter,
  scaleUnitValue,
  type ColourCharacter,
} from './globalAudioSeed';

// ========================================
// THE SAMPLE
// ========================================
// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): the real seeder over 3,000 style maps under Classic, the
// harness's global sample. This file mocks nothing, unlike globalAudioSeed.test.ts, whose spies and forced picks could
// leak into a distribution.
const STYLE_COUNT = 3000;
const STYLES = Array.from({ length: STYLE_COUNT }, (_, i) => {
  const id = `even-global-${i}`;
  const name = `EvenGlobal${i}`;
  const noiseMap = getAttenuationStyleNoiseMap(id, name);
  const settings = generateGlobalAudioSettings(id, name);
  evictAttenuationStyleNoiseMap(id);
  return { id, name, noiseMap, settings };
});

/** The value a style seeded for `key` ('block.field'). */
function fieldOf(settings: GlobalAudioSettings, key: LoadingRangeKey): number {
  const [block, field] = key.split('.');
  return (settings as unknown as Record<string, Record<string, number>>)[block][field];
}

const valuesOf = (key: LoadingRangeKey) => STYLES.map(({ settings }) => fieldOf(settings, key));

/** A draw `t` in [0, 1] through the key's loading band and scale, then onto its full range's grid: sampleField's map. */
function expectedField(key: LoadingRangeKey, t: number): number {
  const { scale, min, step } = GLOBAL_AUDIO_SEED_RANGES[key];
  const value = scaleUnitValue(t, { ...getBand(key), scale });
  return step === undefined ? value : quantizeToStep(value, min, step);
}

/** Where a log field's value sits in its band, as the draw [0, 1] that made it. */
function logPosition(value: number, { min, max }: { min: number; max: number }): number {
  return Math.log(value / min) / Math.log(max / min);
}

// The keys sampleField drew plain until T10. The colour wets are seeded only when lit, so they are pinned, not spread.
const EQ_KEYS = ['eq3.low', 'eq3.mid', 'eq3.high'] as const satisfies readonly LoadingRangeKey[];
const UNSTEPPED_KEYS = [
  'compressor.attack',
  'compressor.release',
  'filterLPF.frequency',
  'filterLPF.Q',
  'filterHPF.frequency',
  'filterHPF.Q',
  'reverb.decay',
] as const satisfies readonly LoadingRangeKey[];
const STEPPED_KEYS = [
  'compressor.threshold',
  'compressor.ratio',
  'compressor.knee',
  'delay.feedback',
  'reverb.preDelay',
  'distortion.amount',
  'chebyshev.order',
  'bitCrusher.bits',
  'limiter.threshold',
] as const satisfies readonly LoadingRangeKey[];
const COLOUR_WET_KEYS = ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const satisfies readonly LoadingRangeKey[];
const MOVED_KEYS: readonly LoadingRangeKey[] = [...EQ_KEYS, ...UNSTEPPED_KEYS, ...STEPPED_KEYS, 'delay.delayTime'];

// The modulation pedals' value keys, already even before T10. Their wets are seeded only when lit, and the shift carries
// a sign draw, so the guard reads the rest.
const PEDAL_KEYS = [
  'autoWah.baseFrequency',
  'autoWah.octaves',
  'autoWah.sensitivity',
  'autoWah.Q',
  'autoWah.gain',
  'autoWah.follower',
  'phaser.rate',
  'phaser.octaves',
  'phaser.baseFrequency',
  'phaser.stages',
  'phaser.Q',
  'chorus.rate',
  'chorus.delayTime',
  'chorus.depth',
  'chorus.spread',
  'chorus.feedback',
  'tremolo.rate',
  'tremolo.depth',
  'tremolo.spread',
  'vibrato.rate',
  'vibrato.depth',
  'stereoWidener.width',
] as const satisfies readonly LoadingRangeKey[];

// ========================================
// TESTS
// ========================================

describe('generateGlobalAudioSettings — every loading key even, the EQ centred (Even Seeded Draws T10)', () => {
  it('each unstepped key fills its band: more than 2,500 distinct values, and 8-12 % of styles in each outer tenth of its scale', () => {
    for (const key of UNSTEPPED_KEYS) {
      const values = valuesOf(key);
      expect(new Set(values).size, `${key} distinct`).toBeGreaterThan(2500);
      // Every unstepped key is a log field, so its tenths are tenths of the draw, not of the value.
      expect(GLOBAL_AUDIO_SEED_RANGES[key].scale).toBe('log');
      const { bottom, top } = outerTenths(values.map((v) => logPosition(v, getBand(key))), { min: 0, max: 1 });
      expect(bottom, `${key} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${key} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${key} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${key} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  // The stepped keys sit on grids of 3 to 41 values, too coarse for a value-tenth to hold 10 % (the limiter's -3 dB is
  // a quarter of the band). So each grid value is held to its own even share: the width of the band that rounds to it,
  // over the band's width. 4 standard deviations, because about 150 grid values are tested at once.
  it('each stepped key holds every grid value at its even share (+/-4 standard deviations over 3,000 styles)', () => {
    for (const key of STEPPED_KEYS) {
      const { min, max } = getBand(key);
      const { min: fullMin, step } = GLOBAL_AUDIO_SEED_RANGES[key];
      const counts = new Map<number, number>();
      for (const value of valuesOf(key)) counts.set(value, (counts.get(value) ?? 0) + 1);
      const grid = [...new Set(Array.from({ length: 10_001 }, (_, j) => quantizeToStep(min + ((max - min) * j) / 10_000, fullMin, step!)))];
      for (const g of grid) {
        const expected = (Math.min(max, g + step! / 2) - Math.max(min, g - step! / 2)) / (max - min);
        const sd = Math.sqrt((expected * (1 - expected)) / STYLE_COUNT);
        const share = (counts.get(g) ?? 0) / STYLE_COUNT;
        expect(Math.abs(share - expected), `${key} = ${g}: ${share} against ${expected}`).toBeLessThanOrEqual(4 * sd);
      }
      expect([...counts.keys()].every((value) => grid.includes(value)), `${key} stays on its grid`).toBe(true);
    }
  });

  it('the delay time, on its fine 1 ms grid, puts 8-12 % of styles in each outer tenth of its band', () => {
    const { bottom, top } = outerTenths(valuesOf('delay.delayTime'), getBand('delay.delayTime'));
    expect(bottom, 'bottom tenth').toBeGreaterThanOrEqual(0.08);
    expect(bottom, 'bottom tenth').toBeLessThanOrEqual(0.12);
    expect(top, 'top tenth').toBeGreaterThanOrEqual(0.08);
    expect(top, 'top tenth').toBeLessThanOrEqual(0.12);
  });

  it('each EQ band is centred on 0 dB: median within 0.2 dB of 0, and 1-3.5 % of styles in each outer tenth', () => {
    for (const key of EQ_KEYS) {
      const values = valuesOf(key).sort((a, b) => a - b);
      expect(Math.abs(values[Math.floor(values.length / 2)]), `${key} median`).toBeLessThanOrEqual(0.2);
      const { bottom, top } = outerTenths(values, getBand(key));
      expect(bottom, `${key} bottom tenth`).toBeGreaterThanOrEqual(0.01);
      expect(bottom, `${key} bottom tenth`).toBeLessThanOrEqual(0.035);
      expect(top, `${key} top tenth`).toBeGreaterThanOrEqual(0.01);
      expect(top, `${key} top tenth`).toBeLessThanOrEqual(0.035);
    }
  });

  it('the welded set moves apart: the three EQ bands, both filter Qs, the delay time and the compressor attack correlate under 0.1 pairwise', () => {
    const welded: readonly LoadingRangeKey[] = [...EQ_KEYS, 'filterLPF.Q', 'filterHPF.Q', 'delay.delayTime', 'compressor.attack'];
    for (let i = 0; i < welded.length; i++) {
      for (let j = i + 1; j < welded.length; j++) {
        const r = correlation(valuesOf(welded[i]), valuesOf(welded[j]));
        expect(Math.abs(r), `${welded[i]} with ${welded[j]}: r = ${r.toFixed(3)}`).toBeLessThan(0.1);
      }
    }
  });

  it('each moved key is the even draw at its own dataId (the EQ the centred draw), through its band and onto its grid', () => {
    for (const { noiseMap, settings } of STYLES.slice(0, 200)) {
      for (const key of MOVED_KEYS) {
        const draw = (EQ_KEYS as readonly string[]).includes(key) ? getCentredSeededVal : getUniformSeededVal;
        expect(fieldOf(settings, key), key).toBe(expectedField(key, draw(noiseMap, `globalAudio.${key}`)));
      }
    }
  });

  it('a lit colour node seeds its Mix from the even draw at its own dataId', () => {
    let lit = 0;
    for (const { noiseMap, settings } of STYLES.slice(0, 400)) {
      for (const key of COLOUR_WET_KEYS) {
        const wet = fieldOf(settings, key);
        if (wet === 0) continue;
        lit += 1;
        expect(wet, key).toBe(expectedField(key, getUniformSeededVal(noiseMap, `globalAudio.${key}`)));
      }
    }
    expect(lit, 'lit colour nodes in the sample').toBeGreaterThan(100);
  });

  it('guard: every modulation pedal value is still the even draw at its own dataId (they already were)', () => {
    for (const { noiseMap, settings } of STYLES.slice(0, 20)) {
      for (const key of PEDAL_KEYS) {
        expect(fieldOf(settings, key), key).toBe(expectedField(key, getUniformSeededVal(noiseMap, `globalAudio.${key}`)));
      }
      const shift = expectedField('frequencyShifter.shift', getUniformSeededVal(noiseMap, 'globalAudio.frequencyShifter.shift'));
      expect(Math.abs(settings.frequencyShifter.shift), 'frequencyShifter.shift magnitude').toBe(shift);
    }
  });
});

describe('generateGlobalAudioSettings — the colour character and the Delay Sync draw even (Even Seeded Draws T11)', () => {
  const NODES = ['distortion', 'chebyshev', 'bitCrusher'] as const;
  const litNodes = (settings: GlobalAudioSettings) => NODES.filter((node) => settings[node].wet > 0);
  const characterOf = (settings: GlobalAudioSettings): ColourCharacter | undefined => {
    const lit = litNodes(settings);
    return COLOUR_CHARACTERS.find((c) => COLOUR_CHARACTER_NODES[c].length === lit.length && COLOUR_CHARACTER_NODES[c].every((n) => lit.includes(n)));
  };
  /** The style's seed tempo, read without leaving its map cached. */
  const tempoOf = (id: string, name: string) => {
    const bpm = generateAttenuationStyleBpm(id, name);
    evictAttenuationStyleNoiseMap(id);
    return bpm;
  };

  it('the colour character is the even draw at its own dataId', () => {
    for (const { noiseMap, settings } of STYLES.slice(0, 400)) {
      expect(characterOf(settings)).toBe(pickColourCharacter(getUniformSeededVal(noiseMap, 'globalAudio.colour.character')));
    }
  });

  it('the Delay seeds Sync when its even mode draw is under 0.66, on the note its even note draw picks from the Delay band', () => {
    let anchored = 0;
    for (const { id, name, noiseMap, settings } of STYLES.slice(0, 300)) {
      const wanted = getUniformSeededVal(noiseMap, 'globalAudio.delay.syncMode') < 0.66;
      const expected = wanted
        ? pickSeedNoteValue(getUniformSeededVal(noiseMap, 'globalAudio.delay.syncNote'), tempoOf(id, name), [getBand('delay.delayTime')], 'seconds')
        : undefined;
      expect(settings.delay.sync, id).toEqual(expected);
      if (expected !== undefined) anchored += 1;
    }
    expect(anchored, 'Anchored styles in the sample').toBeGreaterThan(150);
  });

  it('guard: each colour character is 25 % of styles (+/-3 points), and no style lights two nodes', () => {
    const counts = new Map<string, number>();
    for (const { settings } of STYLES) {
      expect(litNodes(settings).length).toBeLessThanOrEqual(1);
      const character = characterOf(settings) ?? 'unrecognised';
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
    for (const character of COLOUR_CHARACTERS) {
      const share = (counts.get(character) ?? 0) / STYLE_COUNT;
      expect(Math.abs(share - 0.25), `${character}: ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.03);
    }
  });

  it('guard: the Delay seeds Sync in 66 % of styles (+/-3 points)', () => {
    const share = STYLES.filter(({ settings }) => settings.delay.sync !== undefined).length / STYLE_COUNT;
    expect(Math.abs(share - 0.66), `${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.03);
  });
});

describe('generateLfoBankSettings — every lane draw even, the Sync shares as targeted (Even Seeded Draws T13)', () => {
  /** FREE_SYNC_TOGGLE's targets (docs/specs/EVEN_SEEDED_DRAWS.md §1.4): the share of styles each lane seeds Sync in. */
  const SYNC_TARGET: Record<LfoLaneId, number> = { a: 0.75, b: 0.66, c: 0.33, d: 0.25 };
  const BANKS = STYLES.map(({ id, name, noiseMap }) => {
    const bank = generateLfoBankSettings(id, name);
    const bpm = generateAttenuationStyleBpm(id, name);
    evictAttenuationStyleNoiseMap(id);
    return { noiseMap, bank, bpm };
  });

  /** The bank the even draws give: each lane's draws at their own dataIds, through the bands, grids and pickers. */
  function expectedBank(noiseMap: NoiseFunction2D, bpm: number): Record<LfoLaneId, BankLfoSettings> {
    let queue: readonly LfoShape[] = LFO_SHAPE_SEED_ORDER;
    const bank = {} as Record<LfoLaneId, BankLfoSettings>;
    for (const lane of LFO_LANE_IDS) {
      const even = (field: string) => getUniformSeededVal(noiseMap, `lfoBank.${lane}.${field}`);
      const drift = (field: string) => quantizeToStep(scaleUnitValue(even(field), { ...LFO_BANK_DRIFT_SEED_RANGE, scale: 'linear' }), 0, 0.01);
      const picked = pickShape(even('shape'), queue);
      queue = picked.queue;
      const bands = LFO_BANK_SYNC_BAND_ORDER[lane].map((id) => LFO_BANK_RATE_BANDS[id]);
      const sync = even('syncMode') < SYNC_TARGET[lane] ? pickSeedNoteValue(even('syncNote'), bpm, bands, 'hz') : undefined;
      bank[lane] = {
        shape: picked.shape,
        rate: quantizeToStep(scaleUnitValue(even('rate'), { ...LFO_BANK_RATE_BANDS[lane], scale: 'log' }), LFO_RATE_MIN, 0.05),
        rateDrift: drift('rateDrift'),
        depthDrift: drift('depthDrift'),
        ...(sync !== undefined && { sync }),
      };
    }
    return bank;
  }

  it('each lane is the even draws at its own dataIds: shape, rate, both drifts, Sync mode and note', () => {
    for (const { noiseMap, bank, bpm } of BANKS.slice(0, 300)) expect(bank).toStrictEqual(expectedBank(noiseMap, bpm));
  });

  // A rate is a log draw over its lane's band on a 0.05 grid (7 to 81 values), so each grid value is held to its even
  // share: the stretch of the log band that rounds to it. 4 standard deviations, about 140 values at once.
  it('each lane\'s rate holds every grid value at its even share on the log band (+/-4 standard deviations)', () => {
    for (const lane of LFO_LANE_IDS) {
      const { min, max } = LFO_BANK_RATE_BANDS[lane];
      const position = (v: number) => Math.log(Math.min(max, Math.max(min, v)) / min) / Math.log(max / min);
      const counts = new Map<number, number>();
      for (const { bank } of BANKS) counts.set(bank[lane].rate, (counts.get(bank[lane].rate) ?? 0) + 1);
      for (let g = Math.round(min / 0.05) * 0.05; g <= max + 1e-9; g += 0.05) {
        const value = quantizeToStep(g, 0, 0.05);
        const expected = position(value + 0.025) - position(value - 0.025);
        const sd = Math.sqrt((expected * (1 - expected)) / STYLE_COUNT);
        const share = (counts.get(value) ?? 0) / STYLE_COUNT;
        expect(Math.abs(share - expected), `${lane}.rate = ${value}: ${share} against ${expected.toFixed(4)}`).toBeLessThanOrEqual(4 * sd);
      }
    }
  });

  // On the 0.01 grid the bottom tenth of +/-0.7 (-0.70 to -0.57) holds the draws from -0.7 to -0.565, 9.64 % of an even
  // draw, and the top tenth (0.56 to 0.70) those from 0.555, 10.36 %. Each is held within 3 standard deviations.
  it('each lane\'s two drifts fill +/-0.7: each outer tenth at its even share', () => {
    const within = (share: number, expected: number) => Math.abs(share - expected) <= 3 * Math.sqrt((expected * (1 - expected)) / STYLE_COUNT);
    for (const lane of LFO_LANE_IDS) {
      for (const field of ['rateDrift', 'depthDrift'] as const) {
        const { bottom, top } = outerTenths(BANKS.map(({ bank }) => bank[lane][field]), LFO_BANK_DRIFT_SEED_RANGE);
        expect(within(bottom, 0.135 / 1.4), `${lane}.${field} bottom tenth ${(bottom * 100).toFixed(2)} %`).toBe(true);
        expect(within(top, 0.145 / 1.4), `${lane}.${field} top tenth ${(top * 100).toFixed(2)} %`).toBe(true);
      }
    }
  });

  it('lane a\'s shape takes sine at its first-pick odds, 53.3 % (+/-3 points)', () => {
    const share = BANKS.filter(({ bank }) => bank.a.shape === 'sine').length / STYLE_COUNT;
    expect(Math.abs(share - 1 / 1.875), `${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.03);
  });

  it('guard: lanes a / b / c / d seed Sync in 75 / 66 / 33 / 25 % of styles (+/-3 points)', () => {
    for (const lane of LFO_LANE_IDS) {
      const share = BANKS.filter(({ bank }) => bank[lane].sync !== undefined).length / STYLE_COUNT;
      expect(Math.abs(share - SYNC_TARGET[lane]), `${lane}: ${(share * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.03);
    }
  });
});
