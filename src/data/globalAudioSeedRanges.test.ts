// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { GLOBAL_AUDIO_SEED_RANGES } from './globalAudioSeedRanges';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';

// ========================================
// TESTS
// ========================================

// Every seedable field across all 7 global effects (V2: Compressor, EQ3, LPF,
// HPF, Delay, Reverb, Limiter — Chorus removed, Limiter added), plus the 2
// independent lfoDrift group pairs (docs/specs/FLEET_DRIFT_CONSOLIDATION.md —
// 2 keys per group, one group per DriftGroupId; eq3/filterLPF/filterHPF's own
// 3 groups merged into 'globalFx', restructured from docs/specs/archive/
// LFO_DRIFT_GROUPS.md's 4-group shape). `type` and `compressorBeforeDelay`
// are excluded — not seeded as continuous ranges (see docs/specs/
// AUDIO_RIG_V2.md §3). The old `enabled`/`globalBypass` booleans are gone
// entirely (off states are expressed via the params themselves), so there's
// nothing left to exclude for them.
const EXPECTED_KEYS = [
  'compressor.threshold', 'compressor.ratio', 'compressor.attack', 'compressor.release', 'compressor.knee',
  'eq3.low', 'eq3.mid', 'eq3.high',
  'filterLPF.frequency', 'filterLPF.Q',
  'filterHPF.frequency', 'filterHPF.Q',
  'delay.delayTime', 'delay.feedback', 'delay.wet',
  'reverb.decay', 'reverb.preDelay', 'reverb.wet',
  'limiter.threshold',
  'lfoDrift.globalFx.rateDrift', 'lfoDrift.globalFx.depthDrift',
  'lfoDrift.robots.rateDrift', 'lfoDrift.robots.depthDrift',
] as const;

// Fields that GLOBAL_CHAIN_GRID.md's UI column marks "SLIDER (Logarithmic)" —
// everything else (including EQ's center-zero sliders and Limiter's linear
// dB slider) is linear.
const EXPECTED_LOG_KEYS = new Set([
  'compressor.attack', 'compressor.release',
  'filterLPF.frequency', 'filterLPF.Q',
  'filterHPF.frequency', 'filterHPF.Q',
  'reverb.decay',
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
    expect(GLOBAL_AUDIO_SEED_RANGES['lfoDrift.globalFx.rateDrift']).toMatchObject({ min: -1, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['lfoDrift.globalFx.depthDrift']).toMatchObject({ min: -1, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['lfoDrift.robots.rateDrift']).toMatchObject({ min: -1, max: 1 });
    expect(GLOBAL_AUDIO_SEED_RANGES['lfoDrift.robots.depthDrift']).toMatchObject({ min: -1, max: 1 });
  });

  it('marks every lfoDrift field linear, across both groups — bipolar amount, not a frequency-style range', () => {
    for (const key of EXPECTED_KEYS) {
      if (key.startsWith('lfoDrift.')) {
        expect(GLOBAL_AUDIO_SEED_RANGES[key].scale, key).toBe('linear');
      }
    }
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

  it('declares a 0.01 step (whole-percent, in fraction-space) on every lfoDrift field, both groups', () => {
    for (const key of EXPECTED_KEYS) {
      if (key.startsWith('lfoDrift.')) {
        expect(GLOBAL_AUDIO_SEED_RANGES[key].step, key).toBe(0.01);
      }
    }
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
      'limiter.threshold': defaults.limiter.threshold,
      'lfoDrift.globalFx.rateDrift': defaults.lfoDrift.globalFx.rateDrift,
      'lfoDrift.globalFx.depthDrift': defaults.lfoDrift.globalFx.depthDrift,
      'lfoDrift.robots.rateDrift': defaults.lfoDrift.robots.rateDrift,
      'lfoDrift.robots.depthDrift': defaults.lfoDrift.robots.depthDrift,
    };
    for (const key of EXPECTED_KEYS) {
      const { min, max } = GLOBAL_AUDIO_SEED_RANGES[key];
      const value = valueByKey[key];
      expect(value, `${key} default should be >= its range min`).toBeGreaterThanOrEqual(min);
      expect(value, `${key} default should be <= its range max`).toBeLessThanOrEqual(max);
    }
  });
});
