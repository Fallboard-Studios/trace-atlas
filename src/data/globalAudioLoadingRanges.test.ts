// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { COLOUR_LOAD_MIX_MAX, GLOBAL_AUDIO_LOADING_RANGES } from './globalAudioLoadingRanges';
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
  'distortion.wet': { min: 0.1, max: 0.25 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.05, max: 0.15 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.05, max: 0.15 },
  // Global Modulation T2 (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 6): the lit bands, retuned by Crawford's recommended ranges at T16 (2026-10-15).
  'autoWah.baseFrequency': { min: 50, max: 250 },
  'autoWah.octaves': { min: 2.5, max: 5 },
  'autoWah.sensitivity': { min: -40, max: -10 },
  'autoWah.Q': { min: 2, max: 6 },
  'autoWah.gain': { min: 2, max: 6 },
  'autoWah.follower': { min: 0.1, max: 0.4 },
  'autoWah.wet': { min: 0.3, max: 0.7 },
  'phaser.rate': { min: 0.1, max: 2.5 },
  'phaser.octaves': { min: 2, max: 5 },
  'phaser.baseFrequency': { min: 200, max: 800 },
  'phaser.stages': { min: 4, max: 12 },
  'phaser.Q': { min: 1, max: 10 },
  'phaser.wet': { min: 0.25, max: 0.6 },
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

  // Crawford, T14 (2026-10-15): "don't allow any of the new color mixes to exceed .25 on load". A fresh world
  // seeds the Mix as a slider position, so the ceiling is on the band the seed draws from. Saved sessions and
  // share links carry whatever was hand-set and are not clamped to it.
  it('never lets a seeded colour Mix exceed 0.25: every colour wet band tops out at or below it', () => {
    for (const key of ['distortion.wet', 'chebyshev.wet', 'bitCrusher.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].max, key).toBeLessThanOrEqual(0.25);
    }
  });

  // Crawford, T14 (2026-10-15): "keep those ones lower". Chebyshev and Bit Crusher were always seeded gentler than
  // Distortion, and stay that way under the ceiling: both sit wholly below Distortion's top, and neither starts above
  // Distortion's bottom.
  it('keeps Chebyshev and Bit Crusher seeded gentler than Distortion: lower top, and no higher bottom', () => {
    const distortion = GLOBAL_AUDIO_LOADING_RANGES['distortion.wet'];
    for (const key of ['chebyshev.wet', 'bitCrusher.wet'] as const) {
      const band = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(band.max, `${key} top`).toBeLessThan(distortion.max);
      expect(band.min, `${key} bottom`).toBeLessThanOrEqual(distortion.min);
    }
  });

  it('keeps the colour wet bands off the ceiling check only for the three Mix fields (the ceiling does not leak onto other wet bands)', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['reverb.wet'].max).toBeGreaterThan(0.25);
    expect(GLOBAL_AUDIO_LOADING_RANGES['delay.wet'].max).toBeGreaterThan(0);
  });

  // Global Modulation T16 (Crawford, 2026-10-15): the pedals no longer share Colour's 0.25 Mix ceiling (spec assumption 9 said the bands and the ceiling may rise after the listen). Their own recommended Mix bands stand; Colour's ceiling is untouched.
  it('seeds the pedal Mix from its own bands, above the colour ceiling, which stays at 0.25 for the colour effects', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['autoWah.wet']).toStrictEqual({ min: 0.3, max: 0.7 });
    expect(GLOBAL_AUDIO_LOADING_RANGES['phaser.wet']).toStrictEqual({ min: 0.25, max: 0.6 });
    expect(COLOUR_LOAD_MIX_MAX).toBe(0.25);
  });

  it('keeps both pedal Mix bands above zero, so a lit pedal is always audible', () => {
    for (const key of ['autoWah.wet', 'phaser.wet'] as const) {
      expect(GLOBAL_AUDIO_LOADING_RANGES[key].min, key).toBeGreaterThan(0);
    }
  });

  it('keeps phaser.stages seeded at 4 - 12, the full slider ceiling (the gate ran 12 on the Pixel)', () => {
    expect(GLOBAL_AUDIO_LOADING_RANGES['phaser.stages']).toStrictEqual({ min: 4, max: 12 });
    expect(GLOBAL_AUDIO_SEED_RANGES['phaser.stages']).toMatchObject({ min: 1, max: 12 });
  });

  it('puts both loading edges of every stepped pedal field on its full range grid, so a draw can land on either edge', () => {
    const pedalKeys = (Object.keys(GLOBAL_AUDIO_SEED_RANGES) as GlobalAudioSeedFieldKey[]).filter(
      (key) => key.startsWith('autoWah.') || key.startsWith('phaser.'),
    );
    expect(pedalKeys).toHaveLength(13);
    for (const key of pedalKeys) {
      const { min: fullMin, step } = GLOBAL_AUDIO_SEED_RANGES[key];
      if (step === undefined) continue;
      for (const edge of ['min', 'max'] as const) {
        const stepsFromMin = (GLOBAL_AUDIO_LOADING_RANGES[key][edge] - fullMin) / step;
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), key + ' ' + edge).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps every lit pedal field a real band: the wide fields are never a single point', () => {
    for (const key of ['autoWah.baseFrequency', 'autoWah.Q', 'autoWah.follower', 'phaser.rate', 'phaser.baseFrequency', 'phaser.Q'] as const) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(max / min, key).toBeGreaterThan(1.5);
    }
  });

  it('never has min >= max for any field', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as GlobalAudioSeedFieldKey[]) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(min, `${key}: min should be < max`).toBeLessThan(max);
    }
  });
});
