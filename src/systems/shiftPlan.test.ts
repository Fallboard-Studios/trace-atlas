// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { paceBars, recallLeadBars, shiftWindow } from './shiftPlan';
import { JOURNEY_TIME_MAX, SHIFT_MIN_BARS } from '../constants';

// ========================================
// HELPERS
// ========================================
const TEMPOS = [20, 40, 60, 100, 200] as const;

// ========================================
// TESTS
// ========================================

// The pace (roadmap 94, spec §1.5): every length written for 60 BPM, scaled by bpm ÷ 60.
describe('shiftWindow and paceBars (spec §1.5)', () => {
  it("gives the spec's ten windows for a group of size 1, row by row", () => {
    const table: Record<(typeof TEMPOS)[number], { out: [number, number]; home: [number, number] }> = {
      20: { out: [8, 24], home: [8, 24] },
      40: { out: [10, 27], home: [13, 33] },
      60: { out: [15, 40], home: [20, 50] },
      100: { out: [25, 67], home: [33, 83] },
      200: { out: [50, 133], home: [67, 167] },
    };
    for (const bpm of TEMPOS) {
      const out = shiftWindow('out', 1, bpm);
      const home = shiftWindow('home', 1, bpm);
      expect([out.least, out.most], `out at ${bpm}`).toEqual(table[bpm].out);
      expect([home.least, home.most], `home at ${bpm}`).toEqual(table[bpm].home);
    }
  });

  it('scales the least by the group size, and leaves the most at its limit', () => {
    expect(shiftWindow('out', 0.67, 60)).toEqual({ least: 10, most: 40 });
    expect(shiftWindow('out', 1.5, 60)).toEqual({ least: 23, most: 40 });
    expect(shiftWindow('home', 0.67, 60)).toEqual({ least: 13, most: 50 });
    expect(shiftWindow('home', 1.5, 60)).toEqual({ least: 30, most: 50 });
    expect(shiftWindow('out', 1.5, 200)).toEqual({ least: 75, most: 133 });
    expect(shiftWindow('home', 1.5, 200)).toEqual({ least: 100, most: 167 });
  });

  it('never gives a least under SHIFT_MIN_BARS, at any size and tempo', () => {
    expect(shiftWindow('out', 0.67, 20).least).toBe(SHIFT_MIN_BARS);
    expect(shiftWindow('home', 0.67, 20).least).toBe(SHIFT_MIN_BARS);
    expect(shiftWindow('home', 0.67, 40).least).toBe(9);
    for (const phase of ['out', 'home'] as const) {
      for (const size of [0.67, 1, 1.5]) {
        for (const bpm of [...TEMPOS, 1, 5, 33]) expect(shiftWindow(phase, size, bpm).least).toBeGreaterThanOrEqual(SHIFT_MIN_BARS);
      }
    }
  });

  it('keeps every most at least JOURNEY_TIME_MAX past its least, so a window always holds a turn', () => {
    // 1.5 at 100 BPM: out least 38, the limit 67 is 29 past it; 1.5 at 20: 8 and 24, exactly 16.
    expect(shiftWindow('out', 1.5, 20)).toEqual({ least: 8, most: 8 + JOURNEY_TIME_MAX });
    expect(shiftWindow('home', 1.5, 40)).toEqual({ least: 20, most: 36 });
    for (const phase of ['out', 'home'] as const) {
      for (const size of [0.67, 1, 1.5, 3]) {
        for (const bpm of TEMPOS) {
          const w = shiftWindow(phase, size, bpm);
          expect(w.most - w.least, `${phase} ${size} ${bpm}`).toBeGreaterThanOrEqual(JOURNEY_TIME_MAX);
        }
      }
    }
    // A size so big its least passes the limit: the most is still 16 past it.
    expect(shiftWindow('out', 3, 60)).toEqual({ least: 45, most: 61 });
  });

  it('paceBars scales a 60 BPM length by bpm / 60 and rounds', () => {
    expect(paceBars(15, 60)).toBe(15);
    expect(paceBars(15, 200)).toBe(50);
    expect(paceBars(40, 100)).toBe(67);
    expect(paceBars(50, 20)).toBe(17);
    expect(paceBars(0, 200)).toBe(0);
  });
});

describe('recallLeadBars (spec §1.11)', () => {
  it('is 24 seconds in bars, rounded up: 2, 4, 6, 10 and 20 at the five tempos', () => {
    expect(TEMPOS.map(recallLeadBars)).toEqual([2, 4, 6, 10, 20]);
  });

  it('rounds up, so the lead is never under 24 seconds: 110 BPM is 11 bars, 25 BPM is 3', () => {
    expect(recallLeadBars(110)).toBe(11);
    expect(recallLeadBars(25)).toBe(3);
    for (const bpm of [20, 25, 47, 61, 110, 199]) expect((recallLeadBars(bpm) * 4 * 60) / bpm).toBeGreaterThanOrEqual(24);
  });
});
