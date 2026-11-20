// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';

import {
  groupDraws,
  groupIdOf,
  groupJourneyKey,
  groupSize,
  paceBars,
  recallLeadBars,
  shiftWindow,
  type ShiftRobot,
} from './shiftPlan';
import { journeyKey } from '../engine/melodyJourney';
import { DEFAULT_BATTERY_SIZE, JOURNEY_TIME_MAX, SHIFT_MIN_BARS } from '../constants';

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

// Groups (spec §1.3): a company, or one freelancer, with the company's journey and its own draws.
describe('a robot group: its id, journey key, size and draws (spec §1.3)', () => {
  const WORLD = '7:-3';
  const member = (id: string, extra: Partial<ShiftRobot> = {}): ShiftRobot => ({
    id,
    companyId: 'co-a',
    compositionSeed: 0.25,
    ...extra,
  });

  it('a company member is in its company group; a freelancer is a group of one', () => {
    expect(groupIdOf(member('r1'))).toBe('co-a');
    expect(groupIdOf(member('r2', { companyId: 'co-b' }))).toBe('co-b');
    expect(groupIdOf({ id: 'r3' })).toBe('r3');
  });

  it("gives a member its company's journey key whatever its Journey setting, and a freelancer the fleet's", () => {
    const company = journeyKey(WORLD, { kind: 'company', companyId: 'co-a' });
    const fleet = journeyKey(WORLD, { kind: 'fleet' });
    for (const journey of ['own', 'company', 'fleet', undefined] as const) {
      expect(groupJourneyKey(WORLD, { ...member('r1'), journey } as ShiftRobot)).toBe(company);
      expect(groupJourneyKey(WORLD, { id: 'f', compositionSeed: 0.5, journey } as ShiftRobot)).toBe(fleet);
    }
  });

  it('reads the size of the member earliest in the roster; an absent size reads as DEFAULT_BATTERY_SIZE', () => {
    expect(groupSize([member('a', { batterySize: 0.8 }), member('b', { batterySize: 1.4 })])).toBe(0.8);
    expect(groupSize([member('b', { batterySize: 1.4 }), member('a', { batterySize: 0.8 })])).toBe(1.4);
    expect(groupSize([member('a'), member('b', { batterySize: 1.4 })])).toBe(DEFAULT_BATTERY_SIZE);
    expect(groupSize([])).toBe(DEFAULT_BATTERY_SIZE);
  });

  it('gives four draws a turn, each from 0 to 1', () => {
    const draws = groupDraws(WORLD, member('r1'), 0);
    expect(draws).toHaveLength(4);
    for (let i = 0; i < 50; i++) {
      for (const d of groupDraws(WORLD, member('r1'), i)) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThan(1);
      }
    }
  });

  it("gives two members of one company the same draws, whatever their own seeds, and the stream is the company's", () => {
    const a = groupDraws(WORLD, member('r1', { compositionSeed: 0.1 }), 7);
    const b = groupDraws(WORLD, member('r2', { compositionSeed: 0.9 }), 7);
    expect(a).toEqual(b);
    const rand = alea(`${WORLD}:co-a:shifts`);
    for (let i = 0; i < 7 * 4; i++) rand();
    expect(a).toEqual([rand(), rand(), rand(), rand()]);
  });

  it('gives two freelancers on the fleet turns different draws for the same turn, each from its own stream', () => {
    const a = groupDraws(WORLD, { compositionSeed: 0.125 }, 3);
    const b = groupDraws(WORLD, { compositionSeed: 0.375 }, 3);
    expect(a).not.toEqual(b);
    const rand = alea(`${WORLD}:0.125:shifts`);
    for (let i = 0; i < 3 * 4; i++) rand();
    expect(a).toEqual([rand(), rand(), rand(), rand()]);
  });

  it('gives two worlds different draws for one company', () => {
    expect(groupDraws('1:1', member('r1'), 0)).not.toEqual(groupDraws('1:2', member('r1'), 0));
  });

  it("gives turn i's draws whether turn i or a later turn is asked first", async () => {
    const inOrder = Array.from({ length: 30 }, (_, i) => groupDraws(WORLD, member('r1', { companyId: 'co-order' }), i));
    vi.resetModules();
    const fresh = await import('./shiftPlan');
    const r = member('r1', { companyId: 'co-order' });
    expect(fresh.groupDraws(WORLD, r, 29)).toEqual(inOrder[29]);
    expect(fresh.groupDraws(WORLD, r, 4)).toEqual(inOrder[4]);
    for (let i = 29; i >= 0; i--) expect(fresh.groupDraws(WORLD, r, i)).toEqual(inOrder[i]);
  });

  it('hands out a copy: changing what it returns changes no later read', () => {
    const first = groupDraws(WORLD, member('r1'), 2);
    const want = [...first];
    first[0] = 5;
    expect(groupDraws(WORLD, member('r1'), 2)).toEqual(want);
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
