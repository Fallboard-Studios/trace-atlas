// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { GLOBAL_AUDIO_LOADING_RANGES } from './globalAudioLoadingRanges';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from './globalAudioSeedRanges';

// ========================================
// TESTS
// ========================================

// Direct transcription of docs/reference/GLOBAL_CHAIN_GRID.md's "Loading
// Range" column — confirmed with the user effect-by-effect. The grid is the
// source of truth; this table (and this test) mirror it.
const EXPECTED: Record<GlobalAudioSeedFieldKey, { min: number; max: number }> = {
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },
  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  'filterHPF.frequency': { min: 20, max: 500 },
  'filterHPF.Q': { min: 0.1, max: 5 },
  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'delay.wet': { min: 0, max: 0.3 },
  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  'reverb.wet': { min: 0.1, max: 0.4 },
  'compressor.threshold': { min: -55, max: -45 },
  'compressor.ratio': { min: 10, max: 20 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.05, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },
  'limiter.threshold': { min: -3, max: -1 },
  // Global Colour T2 (docs/specs/GLOBAL_COLOUR.md assumption 7): the lit bands, placeholders tuned by ear in T14.
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.25, max: 0.5 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.15, max: 0.4 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.15, max: 0.4 },
};

describe('GLOBAL_AUDIO_LOADING_RANGES', () => {
  it('has exactly the same key set as GLOBAL_AUDIO_SEED_RANGES — no more, no fewer', () => {
    expect(Object.keys(GLOBAL_AUDIO_LOADING_RANGES).sort()).toEqual(
      Object.keys(GLOBAL_AUDIO_SEED_RANGES).sort()
    );
  });

  it('matches docs/reference/GLOBAL_CHAIN_GRID.md\'s "Loading Range" column exactly, field by field', () => {
    for (const key of Object.keys(EXPECTED) as GlobalAudioSeedFieldKey[]) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key], key).toEqual(EXPECTED[key]);
    }
  });

  it('every loading range is a genuine subset of its field\'s full range', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_SEED_RANGES) as GlobalAudioSeedFieldKey[]) {
      const full = GLOBAL_AUDIO_SEED_RANGES[key];
      const loading = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(loading.min, `${key}: loading min should be >= full min`).toBeGreaterThanOrEqual(full.min);
      expect(loading.max, `${key}: loading max should be <= full max`).toBeLessThanOrEqual(full.max);
    }
  });

  it('keeps the loading band of each integer field on whole numbers, so a lit draw can land on both edges', () => {
    for (const key of ['chebyshev.order', 'bitCrusher.bits'] as const) {
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].min), key + ' min').toBe(true);
      expect(Number.isInteger(GLOBAL_AUDIO_LOADING_RANGES[key].max), key + ' max').toBe(true);
    }
  });

  it('keeps every lit colour wet band above zero, so a lit node is always audible', () => {
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].min, key).toBeGreaterThan(0);
    }
  });

  it('never has min >= max for any field', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as GlobalAudioSeedFieldKey[]) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(min, `${key}: min should be < max`).toBeLessThan(max);
    }
  });
});
