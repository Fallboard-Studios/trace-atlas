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
  LFO_LANE_IDS,
  type LfoLaneId,
  type BankLfoSettings,
  type LfoLink,
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
  // 13 → 9 on 2026-09-30: 'volume' and the three 'layerN.pulseWidth' targets were removed
  // (docs/specs/LFO_LOAD_FIX.md assumption 9 / §1.4). 9 → 6 on 2026-10-01 (docs/specs/LFO_BANK.md
  // Task 1): the three 'layerN.phase' targets were cut — Phase stays a plain slider, just no
  // longer LFO-modulatable (no live Signal ever backed it; it was a control-rate polling fallback).
  it('matches ROBOT_DATA_GRID.md\'s 6 Has-LFO-flagged targets exactly — gain/detune on each of 3 layers', () => {
    expect([...ROBOT_LFO_TARGET_IDS].sort()).toEqual(
      [
        'layer0.gain', 'layer0.detune',
        'layer1.gain', 'layer1.detune',
        'layer2.gain', 'layer2.detune',
      ].sort()
    );
  });

  it('has exactly 6 members, no duplicates', () => {
    expect(ROBOT_LFO_TARGET_IDS).toHaveLength(6);
    expect(new Set(ROBOT_LFO_TARGET_IDS).size).toBe(6);
  });

  it('never carries the removed volume or pulseWidth targets', () => {
    const ids = ROBOT_LFO_TARGET_IDS as readonly string[];
    expect(ids).not.toContain('volume');
    expect(ids.some((id) => id.endsWith('.pulseWidth'))).toBe(false);
  });

  it('never carries the removed phase targets (docs/specs/LFO_BANK.md Task 1)', () => {
    const ids = ROBOT_LFO_TARGET_IDS as readonly string[];
    expect(ids.some((id) => id.endsWith('.phase'))).toBe(false);
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

describe('LFO rate/depth bounds', () => {
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
});

describe('LFO_LANE_IDS', () => {
  it('is exactly a, b, c, d in order (docs/specs/LFO_BANK.md §1.1)', () => {
    expect(LFO_LANE_IDS).toEqual(['a', 'b', 'c', 'd']);
  });

  it('has exactly 4 members, no duplicates', () => {
    expect(LFO_LANE_IDS).toHaveLength(4);
    expect(new Set(LFO_LANE_IDS).size).toBe(4);
  });

  it('accepts a valid LfoLaneId value (compile-time check via build:types)', () => {
    const lane: LfoLaneId = 'c';
    expect(LFO_LANE_IDS).toContain(lane);
  });
});

describe('BankLfoSettings', () => {
  it('accepts a valid shape (compile-time check via build:types)', () => {
    const settings: BankLfoSettings = { shape: 'sine', rate: 1.5, rateDrift: 0.2, depthDrift: -0.3 };
    expect(settings.shape).toBe('sine');
    expect(settings.rate).toBe(1.5);
    expect(settings.rateDrift).toBe(0.2);
    expect(settings.depthDrift).toBe(-0.3);
  });
});

describe('LfoLink', () => {
  it('accepts a linked value (compile-time check via build:types)', () => {
    const link: LfoLink = { lane: 'b', depth: 40 };
    expect(link.lane).toBe('b');
    expect(link.depth).toBe(40);
  });

  it('accepts lane: null for an unlinked target', () => {
    const link: LfoLink = { lane: null, depth: 0 };
    expect(link.lane).toBeNull();
  });
});
