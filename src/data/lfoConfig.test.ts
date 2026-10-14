// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DEFAULT_LFO_LINK, DEFAULT_BANK_LFO, LFO_BANK_LANE_CONTENT, laneTitle } from './lfoConfig';
import { ROBOT_LFO_TARGET_IDS, GLOBAL_LFO_TARGET_IDS, LFO_LANE_IDS } from '../types/lfo';
import { CONTENT, labels } from '@/content';

// ========================================
// TESTS
// ========================================

const ALL_TARGET_IDS = [...ROBOT_LFO_TARGET_IDS, ...GLOBAL_LFO_TARGET_IDS];

describe('DEFAULT_LFO_LINK', () => {
  it('has exactly one entry per target — all 7 robot + 7 global ids (14), no extras', () => {
    expect(Object.keys(DEFAULT_LFO_LINK).sort()).toEqual([...ALL_TARGET_IDS].sort());
    expect(Object.keys(DEFAULT_LFO_LINK)).toHaveLength(14);
  });

  it('every entry is { lane: null, depth: 0 } (docs/specs/LFO_BANK.md §1.1)', () => {
    for (const id of ALL_TARGET_IDS) {
      expect(DEFAULT_LFO_LINK[id]).toEqual({ lane: null, depth: 0 });
    }
  });

  it('gives every target its own object — mutating one target\'s default does not affect another\'s', () => {
    DEFAULT_LFO_LINK['layer0.gain'].depth = 9999;
    expect(DEFAULT_LFO_LINK['layer1.gain'].depth).toBe(0);
    // restore, since DEFAULT_LFO_LINK is a shared module-level object
    DEFAULT_LFO_LINK['layer0.gain'].depth = 0;
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(DEFAULT_LFO_LINK)).not.toThrow();
  });
});

describe('DEFAULT_BANK_LFO', () => {
  it('is { shape: sine, rate: 0, rateDrift: 0, depthDrift: 0 } (docs/specs/LFO_BANK.md §1.1)', () => {
    expect(DEFAULT_BANK_LFO).toEqual({ shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 });
  });

  it('remains JSON-serializable', () => {
    expect(() => JSON.stringify(DEFAULT_BANK_LFO)).not.toThrow();
  });
});

// docs/specs/LAYOUT_REWORK.md §1.4 — full lane names wherever the desk shell has room, the
// letter form on the phone.
describe('laneTitle', () => {
  it.each([
    ['a', 'Core LFO (LFO A)', 'LFO A'],
    ['b', 'Companion LFO (LFO B)', 'LFO B'],
    ['c', 'Accent LFO (LFO C)', 'LFO C'],
    ['d', 'Overtone LFO (LFO D)', 'LFO D'],
  ] as const)('lane %s reads %j on desk and %j on phone', (lane, desk, phone) => {
    expect(laneTitle(lane, 'desk')).toBe(desk);
    expect(laneTitle(lane, 'phone')).toBe(phone);
  });

  it('composes from the lane entry, so a renamed lane renames its title on both shells', () => {
    for (const lane of LFO_LANE_IDS) {
      const entry = CONTENT[LFO_BANK_LANE_CONTENT[lane]];
      expect(laneTitle(lane, 'desk')).toContain(entry.human);
      expect(laneTitle(lane, 'desk')).toContain(entry.short);
      expect(laneTitle(lane, 'phone')).toBe(entry.short);
    }
  });

  it('every lane has its own short form — no two lanes share a phone title', () => {
    const phone = LFO_LANE_IDS.map((lane) => laneTitle(lane, 'phone'));
    expect(new Set(phone).size).toBe(LFO_LANE_IDS.length);
  });

  it('the lane panel keeps the bare lane name — short is never spread into a schema', () => {
    expect(labels(LFO_BANK_LANE_CONTENT.a)).not.toHaveProperty('short');
  });
});

// The lane names are written twice on purpose (the content model has no cross-key lookup): fleet.lfoBank.laneA-D
// for the lane panels and tabs, ui.lfoLane's a-d options for LfoLink's lane row. Nothing else keeps them
// equal, so this does (the duplicate-value audit's class of bug).
describe('the lane names written in fleet and in ui.lfoLane', () => {
  it.each(LFO_LANE_IDS)('lane %s has the same name and lore in both places, and its letter ends the fleet short form', (lane) => {
    const fleet = CONTENT[LFO_BANK_LANE_CONTENT[lane]];
    const option = CONTENT['ui.lfoLane'].options[lane];
    expect(option.human).toBe(fleet.human);
    expect(option.lore).toBe(fleet.lore);
    expect(fleet.short).toBe(`LFO ${option.short}`);
  });
});
