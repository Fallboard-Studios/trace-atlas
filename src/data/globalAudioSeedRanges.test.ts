// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { GLOBAL_AUDIO_SEED_RANGES } from './globalAudioSeedRanges';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS, PHASER_RATE_RANGE_HZ } from '@/types/globalAudio';

// ========================================
// TESTS
// ========================================

// Every seedable field across all 7 global effects (V2: Compressor, EQ3, LPF,
// HPF, Delay, Reverb, Limiter — Chorus removed, Limiter added). `type` and
// `compressorBeforeDelay` are excluded — not seeded as continuous ranges
// (see docs/specs/AUDIO_RIG_V2.md §3). The old `enabled`/`globalBypass`
// booleans are gone entirely (off states are expressed via the params
// themselves), so there's nothing left to exclude for them.
const EXPECTED_KEYS = [
  'compressor.threshold', 'compressor.ratio', 'compressor.attack', 'compressor.release', 'compressor.knee',
  'eq3.low', 'eq3.mid', 'eq3.high',
  'filterLPF.frequency', 'filterLPF.Q',
  'filterHPF.frequency', 'filterHPF.Q',
  'delay.delayTime', 'delay.feedback', 'delay.wet',
  'reverb.decay', 'reverb.preDelay', 'reverb.wet',
  'distortion.amount', 'distortion.wet',
  'chebyshev.order', 'chebyshev.wet',
  'bitCrusher.bits', 'bitCrusher.wet',
  'autoWah.baseFrequency', 'autoWah.octaves', 'autoWah.sensitivity', 'autoWah.Q', 'autoWah.gain', 'autoWah.follower', 'autoWah.wet',
  'phaser.rate', 'phaser.octaves', 'phaser.baseFrequency', 'phaser.stages', 'phaser.Q', 'phaser.wet',
  'limiter.threshold',
] as const;

// Fields that GLOBAL_CHAIN_GRID.md's UI column marks "SLIDER (Logarithmic)" —
// everything else (including EQ's center-zero sliders and Limiter's linear
// dB slider) is linear.
const EXPECTED_LOG_KEYS = new Set([
  'compressor.attack', 'compressor.release',
  'filterLPF.frequency', 'filterLPF.Q',
  'filterHPF.frequency', 'filterHPF.Q',
  'reverb.decay',
  // Global Modulation T2: the wide frequency, Q and time-constant fields.
  'autoWah.baseFrequency', 'autoWah.Q', 'autoWah.follower',
  'phaser.baseFrequency', 'phaser.Q',
]);

describe('GLOBAL_AUDIO_SEED_RANGES', () => {
  it('has an entry for every seedable field, and no extras', () => {
    expect(Object.keys(GLOBAL_AUDIO_SEED_RANGES).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('has no chorus.* key and no reverb.dampening key', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_SEED_RANGES)) {
      expect(key.startsWith('chorus.')).toBe(false);
    }
    expect('reverb.dampening' in GLOBAL_AUDIO_SEED_RANGES).toBe(false);
  });

  it('matches the documented ranges in src/types/globalAudio.ts and GLOBAL_CHAIN_GRID.md', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.threshold']).toMatchObject({ min: -60, max: 0 });
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.ratio']).toMatchObject({ min: 1, max: 20 });
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.attack']).toMatchObject({ min: 0.001, max: 0.2 });
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.release']).toMatchObject({ min: 0.01, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.knee']).toMatchObject({ min: 0, max: 40 });
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.low']).toMatchObject({ min: -12, max: 12 });
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.mid']).toMatchObject({ min: -12, max: 12 });
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.high']).toMatchObject({ min: -12, max: 12 });
    expect(GLOBAL_AUDIO_SEED_RANGES['filterLPF.frequency']).toMatchObject({ min: 20, max: 20000 });
    expect(GLOBAL_AUDIO_SEED_RANGES['filterLPF.Q']).toMatchObject({ min: 0.1, max: 20 });
    expect(GLOBAL_AUDIO_SEED_RANGES['filterHPF.frequency']).toMatchObject({ min: 20, max: 20000 });
    expect(GLOBAL_AUDIO_SEED_RANGES['filterHPF.Q']).toMatchObject({ min: 0.1, max: 20 });
    expect(GLOBAL_AUDIO_SEED_RANGES['delay.delayTime']).toMatchObject({ min: 0, max: 10 });
    expect(GLOBAL_AUDIO_SEED_RANGES['delay.feedback']).toMatchObject({ min: 0, max: 0.95 });
    expect(GLOBAL_AUDIO_SEED_RANGES['delay.wet']).toMatchObject({ min: 0, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['reverb.decay']).toMatchObject({ min: 0.1, max: 10 });
    expect(GLOBAL_AUDIO_SEED_RANGES['reverb.preDelay']).toMatchObject({ min: 0, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['reverb.wet']).toMatchObject({ min: 0, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['limiter.threshold']).toMatchObject({ min: -20, max: 0 });
  });

  it('marks only the GLOBAL_CHAIN_GRID.md-flagged fields as log-scaled', () => {
    for (const key of EXPECTED_KEYS) {
      const expectedScale = EXPECTED_LOG_KEYS.has(key) ? 'log' : 'linear';
      expect(GLOBAL_AUDIO_SEED_RANGES[key].scale, `${key} should be ${expectedScale}`).toBe(expectedScale);
    }
  });

  it('marks EQ3 bands linear despite being center-zero sliders', () => {
    // Center-zero is a UI presentation detail (0 in the middle), not a log/linear
    // sampling concern — worth asserting explicitly since it's the one field group
    // that could plausibly be miscategorized as log by analogy to frequency fields.
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.low'].scale).toBe('linear');
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.mid'].scale).toBe('linear');
    expect(GLOBAL_AUDIO_SEED_RANGES['eq3.high'].scale).toBe('linear');
  });

  it('marks limiter.threshold linear, matching compressor.threshold\'s own dB-slider convention', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['limiter.threshold'].scale).toBe('linear');
  });

  it('declares an integer step (1) on compressor.threshold, compressor.knee, and limiter.threshold — whole-dB rounding', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.threshold'].step).toBe(1);
    expect(GLOBAL_AUDIO_SEED_RANGES['compressor.knee'].step).toBe(1);
    expect(GLOBAL_AUDIO_SEED_RANGES['limiter.threshold'].step).toBe(1);
  });

  // Global Colour T2 (docs/specs/GLOBAL_COLOUR.md assumption 6): the full / UI ranges of the colour fields.
  it('declares the colour fields at their spec ranges, all linear', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['distortion.amount']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
    expect(GLOBAL_AUDIO_SEED_RANGES['distortion.wet']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
    expect(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order']).toStrictEqual({ min: 1, max: 8, scale: 'linear', step: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['chebyshev.wet']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
    expect(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits']).toStrictEqual({ min: 1, max: 16, scale: 'linear', step: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.wet']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
  });

  it('steps order and bits by whole integers, since a harmonic order and a bit depth are integers by concept', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].step).toBe(1);
    expect(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits'].step).toBe(1);
    expect(Number.isInteger(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].min)).toBe(true);
    expect(Number.isInteger(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].max)).toBe(true);
    expect(Number.isInteger(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits'].min)).toBe(true);
    expect(Number.isInteger(GLOBAL_AUDIO_SEED_RANGES['bitCrusher.bits'].max)).toBe(true);
  });

  // Global Modulation T2 (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 5): the full / UI ranges of the pedals.
  it('declares the AutoWah fields at their spec ranges', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.baseFrequency']).toStrictEqual({ min: 50, max: 1000, scale: 'log' });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.octaves']).toStrictEqual({ min: 1, max: 8, scale: 'linear', step: 0.5 });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.sensitivity']).toStrictEqual({ min: -40, max: 0, scale: 'linear', step: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.Q']).toStrictEqual({ min: 0.5, max: 10, scale: 'log' });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.gain']).toStrictEqual({ min: 0, max: 20, scale: 'linear', step: 0.5 });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.follower']).toStrictEqual({ min: 0.01, max: 1, scale: 'log' });
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.wet']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
  });

  it('declares the Phaser fields at their spec ranges', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.rate']).toStrictEqual({ min: 0.05, max: 10, scale: 'linear', step: 0.05 });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.octaves']).toStrictEqual({ min: 0.5, max: 6, scale: 'linear', step: 0.5 });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.baseFrequency']).toStrictEqual({ min: 50, max: 2000, scale: 'log' });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.stages']).toStrictEqual({ min: 1, max: 12, scale: 'linear', step: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.Q']).toStrictEqual({ min: 0.5, max: 20, scale: 'log' });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.wet']).toStrictEqual({ min: 0, max: 1, scale: 'linear', step: 0.01 });
  });

  it('keeps the Phaser rate range equal to PHASER_RATE_RANGE_HZ, so the Free slider and the Sync clamp agree', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.rate'].min).toBe(PHASER_RATE_RANGE_HZ.min);
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.rate'].max).toBe(PHASER_RATE_RANGE_HZ.max);
  });

  it('keeps phaser.stages a whole-number field: Tone builds that many allpass stages', () => {
    const { min, max, step } = GLOBAL_AUDIO_SEED_RANGES['phaser.stages'];
    expect([Number.isInteger(min), Number.isInteger(max), step]).toStrictEqual([true, true, 1]);
  });

  it('caps the Phaser at 12 stages (the phone gate may lower the ceiling later)', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.stages'].max).toBe(12);
  });

  it('caps AutoWah sensitivity at 0 dB, the least sensitive end and the default', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['autoWah.sensitivity'].max).toBe(0);
  });

  it('caps Chebyshev order at 8 although Tone allows 100 (higher orders are noise, not colour)', () => {
    expect(GLOBAL_AUDIO_SEED_RANGES['chebyshev.order'].max).toBe(8);
  });

  it('never has min >= max for any field', () => {
    for (const key of EXPECTED_KEYS) {
      const { min, max } = GLOBAL_AUDIO_SEED_RANGES[key];
      expect(min, `${key}: min should be < max`).toBeLessThan(max);
    }
  });

  it('bounds every DEFAULT_GLOBAL_AUDIO_SETTINGS numeric value within its own range, inclusive', () => {
    // Cross-checks the two data sources against each other — catches drift if
    // either the defaults or the ranges are edited without the other. Inclusive
    // because filterLPF.frequency's default (20000) sits exactly at its own max.
    const defaults = DEFAULT_GLOBAL_AUDIO_SETTINGS;
    const valueByKey: Record<string, number> = {
      'compressor.threshold': defaults.compressor.threshold,
      'compressor.ratio': defaults.compressor.ratio,
      'compressor.attack': defaults.compressor.attack,
      'compressor.release': defaults.compressor.release,
      'compressor.knee': defaults.compressor.knee,
      'eq3.low': defaults.eq3.low,
      'eq3.mid': defaults.eq3.mid,
      'eq3.high': defaults.eq3.high,
      'filterLPF.frequency': defaults.filterLPF.frequency,
      'filterLPF.Q': defaults.filterLPF.Q,
      'filterHPF.frequency': defaults.filterHPF.frequency,
      'filterHPF.Q': defaults.filterHPF.Q,
      'delay.delayTime': defaults.delay.delayTime,
      'delay.feedback': defaults.delay.feedback,
      'delay.wet': defaults.delay.wet,
      'reverb.decay': defaults.reverb.decay,
      'reverb.preDelay': defaults.reverb.preDelay,
      'reverb.wet': defaults.reverb.wet,
      'distortion.amount': defaults.distortion.amount,
      'distortion.wet': defaults.distortion.wet,
      'chebyshev.order': defaults.chebyshev.order,
      'chebyshev.wet': defaults.chebyshev.wet,
      'bitCrusher.bits': defaults.bitCrusher.bits,
      'bitCrusher.wet': defaults.bitCrusher.wet,
      'autoWah.baseFrequency': defaults.autoWah.baseFrequency,
      'autoWah.octaves': defaults.autoWah.octaves,
      'autoWah.sensitivity': defaults.autoWah.sensitivity,
      'autoWah.Q': defaults.autoWah.Q,
      'autoWah.gain': defaults.autoWah.gain,
      'autoWah.follower': defaults.autoWah.follower,
      'autoWah.wet': defaults.autoWah.wet,
      'phaser.rate': defaults.phaser.rate,
      'phaser.octaves': defaults.phaser.octaves,
      'phaser.baseFrequency': defaults.phaser.baseFrequency,
      'phaser.stages': defaults.phaser.stages,
      'phaser.Q': defaults.phaser.Q,
      'phaser.wet': defaults.phaser.wet,
      'limiter.threshold': defaults.limiter.threshold,
    };
    for (const key of EXPECTED_KEYS) {
      const { min, max } = GLOBAL_AUDIO_SEED_RANGES[key];
      const value = valueByKey[key];
      expect(value, `${key} default should be >= its range min`).toBeGreaterThanOrEqual(min);
      expect(value, `${key} default should be <= its range max`).toBeLessThanOrEqual(max);
    }
  });
});
