// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DEFAULT_LFO_SETTINGS } from './lfoConfig';
import {
  ROBOT_LFO_TARGET_IDS,
  GLOBAL_LFO_TARGET_IDS,
  LFO_SHAPES,
  LFO_RATE_MIN,
  LFO_RATE_MAX,
  LFO_DEPTH_MIN,
  LFO_DEPTH_MAX,
} from '../types/lfo';

// ========================================
// TESTS
// ========================================

const ALL_TARGET_IDS = [...ROBOT_LFO_TARGET_IDS, ...GLOBAL_LFO_TARGET_IDS];

describe('DEFAULT_LFO_SETTINGS', () => {
  it('has exactly one entry per target — all 9 robot + 7 global ids (16), no extras', () => {
    expect(Object.keys(DEFAULT_LFO_SETTINGS).sort()).toEqual([...ALL_TARGET_IDS].sort());
    expect(Object.keys(DEFAULT_LFO_SETTINGS)).toHaveLength(16);
  });

  it('every entry has a valid shape from LFO_SHAPES', () => {
    for (const id of ALL_TARGET_IDS) {
      expect(LFO_SHAPES, `${id}'s shape should be one of LFO_SHAPES`).toContain(DEFAULT_LFO_SETTINGS[id].shape);
    }
  });

  it('every entry\'s rate is exactly LFO_RATE_MIN — no magic numbers, no arbitrary "typical" value', () => {
    for (const id of ALL_TARGET_IDS) {
      expect(DEFAULT_LFO_SETTINGS[id].rate).toBe(LFO_RATE_MIN);
    }
  });

  it('every entry\'s depth is exactly LFO_DEPTH_MIN — inert until explicitly configured', () => {
    for (const id of ALL_TARGET_IDS) {
      expect(DEFAULT_LFO_SETTINGS[id].depth).toBe(LFO_DEPTH_MIN);
    }
  });

  it('every entry falls within the documented rate/depth bounds', () => {
    for (const id of ALL_TARGET_IDS) {
      const { rate, depth } = DEFAULT_LFO_SETTINGS[id];
      expect(rate).toBeGreaterThanOrEqual(LFO_RATE_MIN);
      expect(rate).toBeLessThanOrEqual(LFO_RATE_MAX);
      expect(depth).toBeGreaterThanOrEqual(LFO_DEPTH_MIN);
      expect(depth).toBeLessThanOrEqual(LFO_DEPTH_MAX);
    }
  });

  it('gives every target its own object — mutating one target\'s default does not affect another\'s', () => {
    const before = DEFAULT_LFO_SETTINGS['layer1.gain'].rate;
    DEFAULT_LFO_SETTINGS['layer0.gain'].rate = 9999;
    expect(DEFAULT_LFO_SETTINGS['layer1.gain'].rate).toBe(before);
    // restore, since DEFAULT_LFO_SETTINGS is a shared module-level object
    DEFAULT_LFO_SETTINGS['layer0.gain'].rate = LFO_RATE_MIN;
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(DEFAULT_LFO_SETTINGS)).not.toThrow();
  });
});
