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
  planExit,
  recallLeadBars,
  shiftWindow,
  type ShiftRobot,
} from './shiftPlan';
import { journeyKey, journeyTurns, type JourneyTurn } from '../engine/melodyJourney';
import {
  DEFAULT_BATTERY_SIZE,
  GROUP_EXIT_ODDS_MAX,
  GROUP_EXIT_ODDS_MIN,
  JOURNEY_TIME_MAX,
  SHIFT_LEAVE_ODDS_MAX,
  SHIFT_LEAVE_ODDS_MIN,
  SHIFT_MIN_BARS,
} from '../constants';

// ========================================
// HELPERS
// ========================================
const TEMPOS = [20, 40, 60, 100, 200] as const;

/** A company of `n` members in roster order, the first of battery size `size`. */
const company = (companyId: string, n: number, size = 1): ShiftRobot[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${companyId}-r${i}`,
    companyId,
    compositionSeed: (i + 1) / 16,
    ...(i === 0 ? { batterySize: size } : { batterySize: 1.4 }),
  }));

/** Many real groups: a world key and a company of three, or a freelancer, per case. */
const CASES = Array.from({ length: 400 }, (_, n) => {
  const worldKey = `${(n % 23) - 11}:${Math.floor(n / 23) - 9}`;
  const members =
    n % 4 === 3 ? [{ id: `f${n}`, compositionSeed: ((n * 7) % 97) / 97 }] : company(`co-${n % 5}`, 3, [0.67, 1, 1.5][n % 3]);
  return { worldKey, members, from: (n * 13) % 300, bpm: TEMPOS[n % TEMPOS.length] as number };
});

/** A turn's weight (spec §1.4): 1 for a drop, else min(1, move). */
const weightOf = (t: JourneyTurn) => (t.drop ? 1 : Math.min(1, t.move));

/** The out window's candidates for a case, by the pure reads. */
const exitCandidates = (c: (typeof CASES)[number]): JourneyTurn[] => {
  const size = c.members[0].batterySize ?? DEFAULT_BATTERY_SIZE;
  const w = shiftWindow('out', size, c.bpm);
  return journeyTurns(groupJourneyKey(c.worldKey, c.members[0]), c.from + w.least, c.from + w.most);
};

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

// The exit (spec §1.6): the walk over the out window's turns, then together or drifting.
describe('planExit (spec §1.6)', () => {
  /** The walk by hand: the first candidate whose leave draw is under its odds (a drop always), else the last. */
  const walked = (c: (typeof CASES)[number]): JourneyTurn => {
    const candidates = exitCandidates(c);
    for (const t of candidates) {
      const odds = SHIFT_LEAVE_ODDS_MIN + (SHIFT_LEAVE_ODDS_MAX - SHIFT_LEAVE_ODDS_MIN) * weightOf(t);
      if (t.drop || groupDraws(c.worldKey, c.members[0], t.index)[0] < odds) return t;
    }
    return candidates[candidates.length - 1];
  };
  const together = (c: (typeof CASES)[number], t: JourneyTurn): boolean =>
    t.drop || groupDraws(c.worldKey, c.members[0], t.index)[1] < GROUP_EXIT_ODDS_MIN + (GROUP_EXIT_ODDS_MAX - GROUP_EXIT_ODDS_MIN) * weightOf(t);

  it('gives one exit per member, the first on a turning measure inside the out window', () => {
    for (const c of CASES) {
      const exits = planExit(c);
      expect(exits).toHaveLength(c.members.length);
      const first = Math.min(...exits);
      expect(exitCandidates(c).map((t) => t.measure)).toContain(first);
    }
  });

  it('exits on the first candidate whose leave draw is under its odds, and on the last when none is', () => {
    let noneLeft = 0;
    let firstLeft = 0;
    for (const c of CASES) {
      const want = walked(c);
      expect(Math.min(...planExit(c)), `${c.worldKey} ${c.members[0].id}`).toBe(want.measure);
      const candidates = exitCandidates(c);
      if (want.measure === candidates[0].measure) firstLeft++;
      const anyLeft = candidates.some(
        (t) => t.drop || groupDraws(c.worldKey, c.members[0], t.index)[0] < SHIFT_LEAVE_ODDS_MIN + (SHIFT_LEAVE_ODDS_MAX - SHIFT_LEAVE_ODDS_MIN) * weightOf(t),
      );
      if (!anyLeft) noneLeft++;
    }
    // Both ends of the walk happen among the cases.
    expect(firstLeft).toBeGreaterThan(20);
    expect(noneLeft).toBeGreaterThan(0);
  });

  it('a drop always leaves, and always leaves together', () => {
    let drops = 0;
    for (const c of CASES) {
      const candidates = exitCandidates(c);
      const firstDrop = candidates.findIndex((t) => t.drop);
      if (firstDrop < 0) continue;
      const exits = planExit(c);
      // Nothing after the first drop is ever taken.
      expect(Math.min(...exits)).toBeLessThanOrEqual(candidates[firstDrop].measure);
      if (Math.min(...exits) === candidates[firstDrop].measure) {
        drops++;
        expect(new Set(exits).size).toBe(1);
      }
    }
    expect(drops).toBeGreaterThan(10);
  });

  it('a group exit gives every member one turn; a drifting exit gives the turns from the chosen one on, one each', () => {
    let groupExits = 0;
    let drifts = 0;
    for (const c of CASES.filter((k) => k.members.length > 1)) {
      const t = walked(c);
      const exits = planExit(c);
      if (together(c, t)) {
        groupExits++;
        expect(exits).toEqual(c.members.map(() => t.measure));
      } else {
        drifts++;
        const key = groupJourneyKey(c.worldKey, c.members[0]);
        const next = journeyTurns(key, t.measure, t.measure + JOURNEY_TIME_MAX * c.members.length).slice(0, c.members.length);
        expect([...exits].sort((a, b) => a - b)).toEqual(next.map((n) => n.measure));
      }
    }
    expect(groupExits).toBeGreaterThan(20);
    expect(drifts).toBeGreaterThan(5);
  });

  it('a drifting exit hands the turns out in a drawn order, not the roster order', () => {
    const firsts = new Set<number>();
    for (const c of CASES.filter((k) => k.members.length > 1)) {
      const exits = planExit(c);
      if (new Set(exits).size > 1) firsts.add(exits.indexOf(Math.min(...exits)));
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('gives a group of one a single turn', () => {
    for (const c of CASES.filter((k) => k.members.length === 1)) expect(planExit(c)).toEqual([walked(c).measure]);
  });

  it('leaves together at the odds of the weight: near 95 % after a move weighing 1, near a coin flip after the smallest', () => {
    let bigCount = 0;
    let bigTogether = 0;
    let smallCount = 0;
    let smallTogether = 0;
    let smallOdds = 0;
    for (let n = 0; n < 3000; n++) {
      const c = { worldKey: `${n}:odds`, members: company('co-odds', 3), from: 0, bpm: 60 };
      const t = walked(c);
      const exits = planExit(c);
      const all = new Set(exits).size === 1;
      if (!t.drop && t.move >= 1) {
        bigCount++;
        if (all) bigTogether++;
      } else if (!t.drop && t.move < 0.25) {
        smallCount++;
        smallOdds += GROUP_EXIT_ODDS_MIN + (GROUP_EXIT_ODDS_MAX - GROUP_EXIT_ODDS_MIN) * t.move;
        if (all) smallTogether++;
      }
    }
    expect(bigCount).toBeGreaterThan(200);
    expect(smallCount).toBeGreaterThan(100);
    expect(Math.abs(bigTogether / bigCount - GROUP_EXIT_ODDS_MAX)).toBeLessThan(0.04);
    expect(Math.abs(smallTogether / smallCount - smallOdds / smallCount)).toBeLessThan(0.08);
    expect(smallTogether / smallCount).toBeLessThan(0.7);
  });

  it('is the same for the same inputs, whatever was planned before', () => {
    const c = CASES[17];
    const first = planExit(c);
    for (const other of CASES.slice(0, 50)) planExit(other);
    expect(planExit(c)).toEqual(first);
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
