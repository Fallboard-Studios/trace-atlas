// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  LFO_SHAPES,
  ROBOT_LFO_TARGET_IDS,
  GLOBAL_LFO_TARGET_IDS,
  LFO_RATE_MIN,
  LFO_RATE_MAX,
  LFO_DEPTH_MIN,
  LFO_DEPTH_MAX,
  DRIFT_GROUP_IDS,
  type LfoSettings,
  type DriftGroupId,
} from './lfo';

// ========================================
// TESTS
// ========================================

describe('LFO_SHAPES', () => {
  it('matches ROBOT_DATA_GRID.md\'s LFO Shape options exactly', () => {
    // Grid displays TRIANGLE, SINE, SQUARE, SAWTOOTH as lore labels; values
    // follow the lowercase Tone.js-style convention WaveformType already uses.
    expect([...LFO_SHAPES].sort()).toEqual(['sawtooth', 'sine', 'square', 'triangle']);
  });

  it('has no duplicate shapes', () => {
    expect(new Set(LFO_SHAPES).size).toBe(LFO_SHAPES.length);
  });
});

describe('ROBOT_LFO_TARGET_IDS', () => {
  it('matches ROBOT_DATA_GRID.md\'s 13 Has-LFO-flagged targets exactly', () => {
    expect([...ROBOT_LFO_TARGET_IDS].sort()).toEqual(
      [
        'volume',
        'layer0.gain', 'layer0.detune', 'layer0.phase', 'layer0.pulseWidth',
        'layer1.gain', 'layer1.detune', 'layer1.phase', 'layer1.pulseWidth',
        'layer2.gain', 'layer2.detune', 'layer2.phase', 'layer2.pulseWidth',
      ].sort()
    );
  });

  it('has exactly 13 members, no duplicates', () => {
    expect(ROBOT_LFO_TARGET_IDS).toHaveLength(13);
    expect(new Set(ROBOT_LFO_TARGET_IDS).size).toBe(13);
  });
});

describe('GLOBAL_LFO_TARGET_IDS', () => {
  it('matches GLOBAL_CHAIN_GRID.md\'s 7 LFO-flagged targets exactly (delay.delayTime removed)', () => {
    expect([...GLOBAL_LFO_TARGET_IDS].sort()).toEqual(
      [
        'eq3.low', 'eq3.mid', 'eq3.high',
        'lpf.frequency', 'lpf.Q',
        'hpf.frequency', 'hpf.Q',
      ].sort()
    );
  });

  it('has exactly 7 members, no duplicates', () => {
    expect(GLOBAL_LFO_TARGET_IDS).toHaveLength(7);
    expect(new Set(GLOBAL_LFO_TARGET_IDS).size).toBe(7);
  });

  it('does not include chorus.delayTime — Chorus was removed in V2', () => {
    expect(GLOBAL_LFO_TARGET_IDS).not.toContain('chorus.delayTime');
  });

  it('does not include delay.delayTime — LFO removed from Delay\'s delayTime', () => {
    expect(GLOBAL_LFO_TARGET_IDS).not.toContain('delay.delayTime');
  });

  it('does not overlap with ROBOT_LFO_TARGET_IDS', () => {
    const overlap = GLOBAL_LFO_TARGET_IDS.filter((id) => (ROBOT_LFO_TARGET_IDS as readonly string[]).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe('LfoSettings bounds', () => {
  it('rate bounds are 0-20 Hz — 0 is the removed OSCILLATION STATE toggle\'s replacement "off" value', () => {
    expect(LFO_RATE_MIN).toBe(0);
    expect(LFO_RATE_MAX).toBe(20);
  });

  it('depth bounds match ROBOT_DATA_GRID.md\'s LFO Depth row (0-100%)', () => {
    expect(LFO_DEPTH_MIN).toBe(0);
    expect(LFO_DEPTH_MAX).toBe(100);
  });

  it('min is always less than max for both bounds', () => {
    expect(LFO_RATE_MIN).toBeLessThan(LFO_RATE_MAX);
    expect(LFO_DEPTH_MIN).toBeLessThan(LFO_DEPTH_MAX);
  });

  it('accepts a valid LfoSettings shape (compile-time check via build:types)', () => {
    const settings: LfoSettings = { shape: 'sine', rate: 1.5, depth: 50 };
    expect(settings.shape).toBe('sine');
    expect(settings.rate).toBe(1.5);
    expect(settings.depth).toBe(50);
  });
});

describe('DRIFT_GROUP_IDS', () => {
  it('has exactly the 2 documented drift groups (docs/specs/FLEET_DRIFT_CONSOLIDATION.md — eq3/filterLPF/filterHPF merged into globalFx)', () => {
    expect([...DRIFT_GROUP_IDS].sort()).toEqual(['globalFx', 'robots'].sort());
  });

  it('has exactly 2 members, no duplicates', () => {
    expect(DRIFT_GROUP_IDS).toHaveLength(2);
    expect(new Set(DRIFT_GROUP_IDS).size).toBe(2);
  });

  it('no longer contains the old eq3/filterLPF/filterHPF group ids', () => {
    expect(DRIFT_GROUP_IDS).not.toContain('eq3');
    expect(DRIFT_GROUP_IDS).not.toContain('filterLPF');
    expect(DRIFT_GROUP_IDS).not.toContain('filterHPF');
  });

  it('accepts a valid DriftGroupId value (compile-time check via build:types)', () => {
    const group: DriftGroupId = 'robots';
    expect(DRIFT_GROUP_IDS).toContain(group);
  });
});
