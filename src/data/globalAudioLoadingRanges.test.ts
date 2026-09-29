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
  // Not GLOBAL_CHAIN_GRID.md-sourced like every entry above — the grid
  // predates lfoDrift entirely. Widened from a -0.4..0.4 first-pass default
  // to -0.7..0.7 after the Phase 4 manual/audible check on
  // docs/tasks/archive/LFO_DRIFT_GROUPS.md found the original window read as
  // too subtle by default — confirmed with the user directly, not re-guessed.
  // eq3/filterLPF/filterHPF's own 3 keys merged into one 'globalFx' key
  // (docs/specs/FLEET_DRIFT_CONSOLIDATION.md), same -0.7..0.7 window carried
  // forward unchanged.
  'lfoDrift.globalFx.rateDrift': { min: -0.7, max: 0.7 },
  'lfoDrift.globalFx.depthDrift': { min: -0.7, max: 0.7 },
  'lfoDrift.robots.rateDrift': { min: -0.7, max: 0.7 },
  'lfoDrift.robots.depthDrift': { min: -0.7, max: 0.7 },
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

  it('never has min >= max for any field', () => {
    for (const key of Object.keys(GLOBAL_AUDIO_LOADING_RANGES) as GlobalAudioSeedFieldKey[]) {
      const { min, max } = GLOBAL_AUDIO_LOADING_RANGES[key];
      expect(min, `${key}: min should be < max`).toBeLessThan(max);
    }
  });
});
