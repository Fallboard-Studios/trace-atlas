// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import alea from 'alea';
import gsap from 'gsap';

vi.mock('../engine/beatClock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/beatClock')>();
  return { ...actual, subscribeToMeasure: vi.fn(actual.subscribeToMeasure), getCurrentMeasure: vi.fn(actual.getCurrentMeasure) };
});

import {
  SIM_SEED_COORDS,
  SIM_MEASURES,
  simNoiseMap,
  buildShiftSimRoster,
  percentile,
  SIM_LOOP_SECONDS,
  SIM_LOOP_BPMS,
  COOLDOWN_CANDIDATES,
  clampedCooldown,
  buildLoopWorld,
  runLoopSim,
  runReadinessSim,
  formatReadinessReport,
  formatDoorReport,
  createCoverTally,
  createGroupTally,
  type GroupSnapshot,
  type GroupTallyResult,
  type TurnReader,
  formatShiftCoverReport,
  runShiftCoverSim,
  type CoverSnapshot,
  type CoverTallyResult,
  type LifecycleStep,
  type LoopSimEvent,
  type LoopSimOptions,
  type LoopSimResult,
  type LoopSimWorld,
  type ReadinessRow,
  type ReadinessSeedRow,
} from './lifecycleSim';
import { stepShiftLifecycle, type RobotLifecycleSnapshot, type ShiftLifecycleSnapshot } from './robotSystems';
import {
  generateCompanyId,
  generateCompanyMembership,
  generateRosterStart,
  spawnInitialCompanies,
  spawnInitialRoster,
} from './spawnSystem';
import { placeDistrict } from './districts';
import { getWorkSite } from './workSites';
import { isWorkSiteEligible } from './jobHosts';
import { deriveStations, hostObstacles, type Station } from './stations';
import { siteCooldown } from './siteChoice';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { useLocaleStore } from '../stores/localeStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { DockingState, JobType, type Robot } from '../types/Robot';
import type { Actor } from '../types/Actor';
import {
  MAX_ROBOTS,
  SWIM_SPEED,
  STATION_ARC_SECONDS,
  WAIT_RETRY_SECONDS,
  BEATS_PER_MEASURE,
  BACK_HOSTS_ENABLED,
  BATTERY_CRITICAL_THRESHOLD,
} from '../constants';

// ========================================
// HELPERS
// ========================================

/** A few real seeds — enough to exercise the whole pipeline without the full grid's cost. */
const FEW_COORDS = SIM_SEED_COORDS.slice(0, 4);

function registerLocale(id: string, x: number, y: number): void {
  useLocaleStore.getState().addLocale('pelagos', {
    id,
    attenuationStyleId: 'pelagos',
    name: id,
    coordinates: { x, y },
    dayStartTimestamp: Date.now(),
    createdAtMeasure: 0,
    robots: [],
    actors: [],
    companies: [],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ========================================
// TESTS
// ========================================

describe('lifecycleSim', () => {
  describe('the seed grid', () => {
    it('is the districts 121-coordinate grid: x and y each over -200..200 in steps of 40', () => {
      expect(SIM_SEED_COORDS).toHaveLength(121);
      const axis = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
      expect(new Set(SIM_SEED_COORDS.map((c) => c.x))).toEqual(new Set(axis));
      expect(new Set(SIM_SEED_COORDS.map((c) => c.y))).toEqual(new Set(axis));
      expect(new Set(SIM_SEED_COORDS.map((c) => `${c.x}:${c.y}`)).size).toBe(121);
    });

    it('runs 2000 measures by default', () => {
      expect(SIM_MEASURES).toBe(2000);
    });
  });

  describe('the sim roster against the real spawn', () => {
    // Roadmap 94 Task 23: spawn starts by groups, and buildShiftSimRoster matches it.
    it('the shift sim roster matches the real spawn path robot for robot — spawnInitialRoster, same coordinates', () => {
      const x = 40;
      const y = -80;
      const localeId = 'lifecycle-sim-parity';
      registerLocale(localeId, x, y);
      spawnInitialRoster(localeId);
      const real = useLocaleStore.getState().getLocaleById(localeId)!.robots;

      const sim = buildShiftSimRoster(simNoiseMap(x, y), { bpm: 60, worldKey: `${x}:${y}` });
      const fields = (s: ShiftLifecycleSnapshot | Robot) => ({
        docking: s.docking,
        batteryLevel: s.batteryLevel,
        batterySize: s.batterySize,
        entersAtMeasure: s.entersAtMeasure,
        exitsAtMeasure: s.exitsAtMeasure,
        shiftBpm: s.shiftBpm,
      });
      expect(sim.map(fields)).toEqual(real.map(fields));

      // Guard against a coincidental pass on defaults: this seed must actually vary, and carry real sizes.
      expect(new Set(real.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel)).size).toBeGreaterThan(1);
      expect(real.every((r) => r.batterySize !== undefined && r.batterySize !== 1)).toBe(true);
      expect(new Set(real.map((r) => r.batterySize)).size).toBe(MAX_ROBOTS);
    });

    // Even World Draws T3 (docs/specs/EVEN_WORLD_DRAWS.md §1.1), re-pinned at roadmap 94 Task 23: spawn starts by
    // groups, so it agrees with the shift sim roster. (The old roster-index start's two draws went with Task 27.)
    describe('the roster draws (Even World Draws T3)', () => {
      it('spawn and the shift sim make the same draws: docking, battery and moves agree index for index on 30 grid worlds', () => {
        const fields = (s: ShiftLifecycleSnapshot | Robot) => ({
          docking: s.docking,
          batteryLevel: s.batteryLevel,
          entersAtMeasure: s.entersAtMeasure,
          exitsAtMeasure: s.exitsAtMeasure,
        });
        const activeCounts = new Set<number>();
        for (const [i, { x, y }] of SIM_SEED_COORDS.slice(0, 30).entries()) {
          const localeId = `even-world-roster-parity-${i}`;
          registerLocale(localeId, x, y);
          spawnInitialRoster(localeId);
          const real = useLocaleStore.getState().getLocaleById(localeId)!.robots;
          expect(buildShiftSimRoster(simNoiseMap(x, y), { bpm: 60, worldKey: `${x}:${y}` }).map(fields), `${x}:${y}`).toEqual(real.map(fields));
          activeCounts.add(real.filter((r) => r.docking === DockingState.Active).length);
        }
        // Not vacuous: the worlds compared start with several different numbers of robots out.
        expect(activeCounts.size).toBeGreaterThan(3);
      });
    });

    it('uses the same noise map the live locale would (no attenuation-style override)', () => {
      const live = getLocaleNoiseMap('lifecycle-sim-noise-check', 120, 160);
      const sim = simNoiseMap(120, 160);
      for (const [a, b] of [[0, 0], [3.7, -12.1], [100, 42]]) expect(sim(a, b)).toBe(live(a, b));
    });

    // Roadmap 94 Task 15: the sim robots carry their groups.
    it("carries each robot's company and composition seed as the real spawn seeds them", () => {
      for (const [i, { x, y }] of [{ x: 40, y: -80 }, { x: -200, y: 80 }, { x: 160, y: 0 }].entries()) {
        const localeId = `lifecycle-sim-groups-${i}`;
        registerLocale(localeId, x, y);
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const real = useLocaleStore.getState().getLocaleById(localeId)!.robots;
        const sim = buildShiftSimRoster(simNoiseMap(x, y), { bpm: 60, worldKey: `${x}:${y}` });
        const group =(r: { companyId?: string; compositionSeed: number }) => ({ companyId: r.companyId, compositionSeed: r.compositionSeed });
        expect(sim.map(group), `${x}:${y}`).toEqual(real.map(group));
        // Not vacuous: the world has companies and freelancers.
        expect(sim.some((r) => r.companyId !== undefined)).toBe(true);
        expect(sim.some((r) => r.companyId === undefined)).toBe(true);
        // generateCompanyMembership's indices, company by company.
        const noiseMap = simNoiseMap(x, y);
        generateCompanyMembership(noiseMap, MAX_ROBOTS).forEach((members, c) => {
          for (const m of members) expect(sim[m].companyId).toBe(generateCompanyId(noiseMap, c));
        });
      }
    });
  });

  describe('buildShiftSimRoster (roadmap 94 Task 15)', () => {
    it('is generateRosterStart, robot for robot, as snapshots for the new step', () => {
      for (const { x, y } of FEW_COORDS) {
        for (const bpm of [20, 60, 200]) {
          const env = { bpm, worldKey: `${x}:${y}` };
          const roster = buildShiftSimRoster(simNoiseMap(x, y), env);
          const start = generateRosterStart(simNoiseMap(x, y), { ...env, startMeasure: 0 });
          expect(roster).toHaveLength(MAX_ROBOTS);
          roster.forEach((r, i) => {
            expect(r.id).toBe(`sim-${i}`);
            const { id: _id, ...rest } = r;
            expect(rest).toEqual(start[i]);
          });
        }
      }
    });
  });

  describe('percentile (nearest-rank)', () => {
    it('picks the nearest-rank value from an unsorted list', () => {
      const xs = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
      expect(percentile(xs, 10)).toBe(1);
      expect(percentile(xs, 50)).toBe(5);
      expect(percentile(xs, 90)).toBe(9);
      expect(percentile(xs, 100)).toBe(10);
    });

    it('handles a single value and leaves its input unsorted', () => {
      expect(percentile([4], 10)).toBe(4);
      const xs = [3, 1, 2];
      percentile(xs, 50);
      expect(xs).toEqual([3, 1, 2]);
    });

    it('throws on an empty list rather than returning undefined as a number', () => {
      expect(() => percentile([], 50)).toThrow();
    });
  });
});

// ========================================
// COVER TALLY (no-silence Task 1 — spec §1.1's three terms, §1.5)
// ========================================

const A = DockingState.Active;
const R = DockingState.Recalled;
const D = DockingState.Docked;
const U = DockingState.Undocking;

/** A roster for the tally: only id, docking and battery matter to it. */
const cover = (...robots: [string, DockingState, number][]): CoverSnapshot[] =>
  robots.map(([id, docking, batteryLevel]) => ({ id, docking, batteryLevel }));

/** Feed a start roster and a series of post-tick rosters (measure 1, 2, …) and read the result. */
function tallyOf(start: CoverSnapshot[], series: CoverSnapshot[][]): CoverTallyResult {
  const tally = createCoverTally(start);
  for (const roster of series) tally.observe(roster);
  return tally.result();
}

describe('createCoverTally (no-silence Task 1)', () => {
  describe('silence', () => {
    it('two measures with nobody sounding are two silent measures', () => {
      const result = tallyOf(cover(['a', A, 100]), [
        cover(['a', R, 10]),
        cover(['a', D, 15]),
        cover(['a', D, 20]),
        cover(['a', A, 100]),
      ]);
      expect(result.measures).toBe(4);
      expect(result.silentMeasures).toBe(2);
    });

    it('a measure whose only sounding robot is Recalled is not silent; Docked and Undocking are not sounding', () => {
      const result = tallyOf(cover(['a', A, 12], ['b', D, 95]), [cover(['a', R, 6], ['b', U, 100])]);
      expect(result.silentMeasures).toBe(0);
      expect(result.soundingHistogram).toEqual([0, 1]);
    });

    it('counts robots sounding per measure as a histogram indexed by the count', () => {
      const result = tallyOf(cover(['a', A, 100], ['b', A, 100], ['c', D, 50]), [
        cover(['a', A, 94], ['b', A, 94], ['c', D, 55]),
        cover(['a', A, 88], ['b', R, 8], ['c', U, 100]),
        cover(['a', R, 9], ['b', D, 13], ['c', A, 100]),
        cover(['a', D, 14], ['b', D, 18], ['c', D, 90]),
      ]);
      expect(result.soundingHistogram).toEqual([1, 0, 3]);
    });
  });

  describe('stays', () => {
    it(`a robot Active at ${BATTERY_CRITICAL_THRESHOLD}, then 4, then 0, then Recalled is one stay of length 3`, () => {
      const result = tallyOf(cover(['a', A, 16], ['b', D, 50]), [
        cover(['a', A, BATTERY_CRITICAL_THRESHOLD], ['b', D, 55]),
        cover(['a', A, 4], ['b', D, 60]),
        cover(['a', A, 0], ['b', D, 65]),
        cover(['a', R, 0], ['b', D, 70]),
      ]);
      expect(result.stays).toEqual([3]);
      expect(result.stayMeasures).toBe(3);
    });

    it('an Active robot just above critical is in no stay, and neither is a Recalled one at or below it', () => {
      const result = tallyOf(cover(['a', A, 17]), [cover(['a', A, BATTERY_CRITICAL_THRESHOLD + 1]), cover(['a', R, 5])]);
      expect(result.stays).toEqual([]);
      expect(result.stayMeasures).toBe(0);
    });

    it('two robots in a stay at once are two stays, and the measures they share count once', () => {
      const result = tallyOf(cover(['a', A, 14], ['b', A, 20]), [
        cover(['a', A, 8], ['b', A, 14]),
        cover(['a', A, 2], ['b', A, 8]),
        cover(['a', R, 0], ['b', A, 2]),
        cover(['a', D, 5], ['b', R, 0]),
      ]);
      expect(result.stays).toEqual([2, 2]);
      expect(result.stayMeasures).toBe(3);
    });

    it('one robot with two separate stays has two; a stay still open at the end counts at its length so far', () => {
      const result = tallyOf(cover(['a', A, 12]), [
        cover(['a', A, 6]),
        cover(['a', R, 0]),
        cover(['a', D, 5]),
        cover(['a', A, 100]),
        cover(['a', A, 9]),
        cover(['a', A, 3]),
      ]);
      expect(result.stays).toEqual([1, 2]);
    });
  });

  describe('cycles and heard share', () => {
    /** One robot: Active over the given inclusive measure spans, Docked otherwise, over `measures`. */
    const shifts = (measures: number, spans: [number, number][]): CoverSnapshot[][] =>
      Array.from({ length: measures }, (_, i) => {
        const m = i + 1;
        const on = spans.some(([from, to]) => m >= from && m <= to);
        return cover(['a', on ? A : D, 50]);
      });

    it('a robot landing on Active at measures 3, 38 and 73 has cycle 35', () => {
      const result = tallyOf(cover(['a', D, 50]), shifts(75, [[3, 10], [38, 45], [73, 75]]));
      const [a] = result.robots;
      expect(a.id).toBe('a');
      expect(a.landings).toEqual([3, 38, 73]);
      expect(a.cycle).toBe(35);
    });

    it('one landing gives no cycle, and a robot Active in the start roster has not landed at measure 1', () => {
      expect(tallyOf(cover(['a', D, 50]), shifts(40, [[3, 10]])).robots[0].cycle).toBeUndefined();
      const fromStart = tallyOf(cover(['a', A, 100]), shifts(40, [[1, 10], [30, 40]])).robots[0];
      expect(fromStart.landings).toEqual([30]);
      expect(fromStart.cycle).toBeUndefined();
    });

    it('the cycle is the commonest gap; on a tie, the shorter', () => {
      const commonest = tallyOf(cover(['a', D, 50]), shifts(110, [[1, 2], [36, 37], [71, 72], [102, 103]])).robots[0];
      expect(commonest.landings).toEqual([1, 36, 71, 102]);
      expect(commonest.cycle).toBe(35);
      const tie = tallyOf(cover(['a', D, 50]), shifts(80, [[1, 2], [36, 37], [67, 68]])).robots[0];
      expect(tie.cycle).toBe(31);
    });

    it('heard share is the measures a robot is Active or Recalled over the measures observed', () => {
      const result = tallyOf(cover(['a', A, 100], ['b', D, 50]), [
        cover(['a', A, 94], ['b', D, 55]),
        cover(['a', R, 8], ['b', D, 60]),
        cover(['a', D, 13], ['b', U, 100]),
        cover(['a', D, 18], ['b', A, 100]),
      ]);
      expect(result.robots.map((r) => [r.id, r.heardShare])).toEqual([['a', 0.5], ['b', 0.25]]);
    });

    it('reports robots in start-roster order', () => {
      const result = tallyOf(cover(['z', D, 50], ['m', D, 50], ['a', D, 50]), [cover(['z', D, 55], ['m', D, 55], ['a', D, 55])]);
      expect(result.robots.map((r) => r.id)).toEqual(['z', 'm', 'a']);
    });
  });

  describe('purity', () => {
    const start = cover(['a', A, 16], ['b', D, 90]);
    const series = [
      cover(['a', A, 10], ['b', D, 95]),
      cover(['a', R, 4], ['b', U, 100]),
      cover(['a', D, 9], ['b', A, 100]),
      cover(['a', D, 14], ['b', A, 94]),
    ];

    it('the same series gives the same result twice', () => {
      expect(tallyOf(start, series)).toEqual(tallyOf(start, series));
    });

    it('does not mutate the rosters it is handed', () => {
      const before = structuredClone([start, ...series]);
      tallyOf(start, series);
      expect([start, ...series]).toEqual(before);
    });

    it('with nothing observed, reports zero measures and no silence, stay or cycle', () => {
      const result = createCoverTally(start).result();
      expect(result).toMatchObject({ measures: 0, silentMeasures: 0, soundingHistogram: [], stays: [], stayMeasures: 0 });
      expect(result.robots.map((r) => [r.id, r.landings, r.cycle, r.heardShare])).toEqual([
        ['a', [], undefined, 0],
        ['b', [], undefined, 0],
      ]);
    });
  });
});

// Roadmap 94 Task 16 (spec §5.3): the group tally, on hand-built series.
describe('createGroupTally (roadmap 94 Task 16)', () => {
  /** A roster for the group tally: id, docking and company. */
  const grp = (...robots: [string, DockingState, string?][]): GroupSnapshot[] =>
    robots.map(([id, docking, companyId]) => ({ id, docking, ...(companyId ? { companyId } : {}) }));
  const noTurns = () => false;
  const run = (start: GroupSnapshot[], series: GroupSnapshot[][], isTurn: TurnReader = noTurns): GroupTallyResult => {
    const tally = createGroupTally(start, isTurn);
    for (const roster of series) tally.observe(roster);
    return tally.result();
  };

  it('a company of three with one member home for 4 of its 10 sounding measures is 40 % apart', () => {
    const series: GroupSnapshot[][] = [];
    for (let m = 1; m <= 10; m++) series.push(grp(['a', A, 'co'], ['b', m <= 4 ? D : A, 'co'], ['c', R, 'co'], ['f', A]));
    // Then two measures with the whole company home: not sounding, so neither apart nor together.
    series.push(grp(['a', D, 'co'], ['b', D, 'co'], ['c', D, 'co'], ['f', A]));
    series.push(grp(['a', D, 'co'], ['b', D, 'co'], ['c', D, 'co'], ['f', A]));
    const result = run(grp(['a', A, 'co'], ['b', A, 'co'], ['c', A, 'co'], ['f', A]), series);
    expect(result.companySounding).toBe(10);
    expect(result.companyApart).toBe(4);
  });

  it('three members docking on one measure are one group exit; on two measures, one exit that is not', () => {
    const together = run(grp(['a', R, 'co'], ['b', R, 'co'], ['c', R, 'co'], ['f', A]), [
      grp(['a', D, 'co'], ['b', D, 'co'], ['c', D, 'co'], ['f', A]),
    ]);
    expect(together.companyExits).toBe(1);
    expect(together.groupExits).toBe(1);
    const apart = run(grp(['a', R, 'co'], ['b', R, 'co'], ['c', A, 'co'], ['f', A]), [
      grp(['a', D, 'co'], ['b', D, 'co'], ['c', R, 'co'], ['f', A]),
      grp(['a', D, 'co'], ['b', D, 'co'], ['c', D, 'co'], ['f', A]),
    ]);
    expect(apart.companyExits).toBe(1);
    expect(apart.groupExits).toBe(0);
  });

  it("an exit on a turning measure counts as on a turn and one a bar off does not: a robot docks on the bar line after its exit turn", () => {
    // Turns at 3 and 9 for every group.
    const isTurn: TurnReader = (_robot, measure) => measure === 3 || measure === 9;
    const series = [
      grp(['a', R], ['f', A]), // 1
      grp(['a', R], ['f', A]), // 2
      grp(['a', R], ['f', A]), // 3
      grp(['a', D], ['f', R]), // 4: a docks after its exit turn 3, on a turn
      grp(['a', D], ['f', R]), // 5
      grp(['a', D], ['f', D]), // 6: f docks after 5, no turn
    ];
    const result = run(grp(['a', A], ['f', A]), series, isTurn);
    expect(result.exits).toBe(2);
    expect(result.exitsOnTurn).toBe(1);
  });

  it("a group's first entrance counts on a turn; a staggered member's later landing is not another entrance", () => {
    const isTurn: TurnReader = (_robot, measure) => measure === 2;
    const result = run(grp(['a', D, 'co'], ['b', D, 'co']), [
      grp(['a', U, 'co'], ['b', D, 'co']), // 1
      grp(['a', A, 'co'], ['b', U, 'co']), // 2: the company comes out on a turn
      grp(['a', A, 'co'], ['b', U, 'co']), // 3
      grp(['a', A, 'co'], ['b', A, 'co']), // 4: the second member, staggered
    ], isTurn);
    expect(result.entrances).toBe(1);
    expect(result.entrancesOnTurn).toBe(1);
    // A company landing together is one entrance too.
    const together = run(grp(['a', U, 'co'], ['b', U, 'co']), [grp(['a', A, 'co'], ['b', A, 'co'])], isTurn);
    expect(together.entrances).toBe(1);
  });

  it('measures each group span out and home, counting only spans that began after the start', () => {
    const series = [
      grp(['a', A], ['b', D]), // 1
      grp(['a', R], ['b', U]), // 2
      grp(['a', D], ['b', A]), // 3: a home; b out from 3
      grp(['a', D], ['b', A]), // 4
      grp(['a', U], ['b', R]), // 5
      grp(['a', A], ['b', D]), // 6: a out from 6 (home 3 -> 6 = 3); b home from 6 (out 3 -> 6 = 3)
      grp(['a', A], ['b', D]), // 7
      grp(['a', R], ['b', D]), // 8
      grp(['a', D], ['b', D]), // 9: a home from 9 (out 6 -> 9 = 3)
      grp(['a', D], ['b', U]), // 10
      grp(['a', D], ['b', A]), // 11: b out from 11 (home 6 -> 11 = 5)
    ];
    const result = run(grp(['a', A], ['b', D]), series);
    expect([...result.timesOut].sort((x, y) => x - y)).toEqual([3, 3]);
    expect([...result.timesHome].sort((x, y) => x - y)).toEqual([3, 5]);
  });

  it('reads a company as one group: a span out runs from its first member out to its last member home', () => {
    const series = [
      grp(['a', A, 'co'], ['b', D, 'co'], ['f', A]), // 1: co out from 1
      grp(['a', A, 'co'], ['b', A, 'co'], ['f', A]), // 2
      grp(['a', D, 'co'], ['b', A, 'co'], ['f', A]), // 3
      grp(['a', D, 'co'], ['b', D, 'co'], ['f', A]), // 4: co home from 4 (out 1 -> 4 = 3)
    ];
    const result = run(grp(['a', D, 'co'], ['b', D, 'co'], ['f', A]), series);
    expect(result.timesOut).toEqual([3]);
  });

  it('does not mutate what it is handed, and gives the same result twice', () => {
    const start = grp(['a', A, 'co'], ['b', A, 'co'], ['f', D]);
    const series = [grp(['a', R, 'co'], ['b', A, 'co'], ['f', U]), grp(['a', D, 'co'], ['b', R, 'co'], ['f', A])];
    const copy = structuredClone([start, series]);
    const tally = createGroupTally(start, noTurns);
    for (const r of series) tally.observe(r);
    expect(tally.result()).toEqual(tally.result());
    expect([start, series]).toEqual(copy);
  });
});

// Roadmap 94 Task 17 (spec §5.3, §5.5): the cover sim on the shift step, at a tempo.
describe('runShiftCoverSim (roadmap 94 Task 17)', () => {
  const ONE = [{ x: 40, y: -80 }];
  const SHIFT_TEMPOS = [20, 40, 60, 100, 200] as const;
  /** A world's key, as the sim reads it. */
  const keyOf = ({ x, y }: { x: number; y: number }) => `${x}:${y}`;

  it('one world: the row equals the counts the test makes itself', () => {
    const measures = 400;
    const env = { bpm: 60, worldKey: keyOf(ONE[0]) };
    const noiseMap = simNoiseMap(ONE[0].x, ONE[0].y);
    let roster: ShiftLifecycleSnapshot[] = buildShiftSimRoster(noiseMap, env);
    let silent = 0;
    let sounding = 0;
    let companySounding = 0;
    let companyApart = 0;
    for (let m = 1; m <= measures; m++) {
      roster = stepShiftLifecycle(roster, m, env);
      const out = roster.filter((r) => r.docking === A || r.docking === R);
      sounding += out.length;
      if (out.length === 0) silent++;
      const companies = new Set(roster.map((r) => r.companyId).filter(Boolean));
      for (const c of companies) {
        const members = roster.filter((r) => r.companyId === c);
        const n = members.filter((r) => r.docking === A || r.docking === R).length;
        if (n > 0) companySounding++;
        if (n > 0 && n < members.length) companyApart++;
      }
    }
    const [row] = runShiftCoverSim({ coords: ONE, measures, bpms: [60] });
    expect(row.bpm).toBe(60);
    expect(row.silentShare).toBe(silent / measures);
    expect(row.sounding.mean).toBeCloseTo(sounding / measures, 12);
    expect(row.apartShare).toBeCloseTo(companyApart / companySounding, 12);
  });

  it('the shift step is never silent over the grid at 60 BPM for 2,000 measures, and every exit and group entrance lands on a turn', () => {
    const [row] = runShiftCoverSim({ measures: SIM_MEASURES, bpms: [60] });
    expect(row.worlds).toBe(SIM_SEED_COORDS.length);
    expect(row.silentShare).toBe(0);
    expect(row.exits).toBeGreaterThan(1000);
    expect(row.exitsOnTurnShare).toBe(1);
    expect(row.entrancesOnTurnShare).toBe(1);
    expect(row.plannedOffTurn).toBe(0);
  }, 120_000);

  it('the shift step is never silent, and lands on turns, over a few worlds at 20, 40, 100 and 200 BPM', () => {
    const rows = runShiftCoverSim({ coords: SIM_SEED_COORDS.slice(0, 121).filter((_, i) => i % 20 === 0), measures: SIM_MEASURES, bpms: [20, 40, 100, 200] });
    expect(rows.map((r) => r.bpm)).toEqual([20, 40, 100, 200]);
    for (const r of rows) {
      expect(r.silentShare, `${r.bpm}`).toBe(0);
      expect(r.exitsOnTurnShare, `${r.bpm}`).toBe(1);
      expect(r.entrancesOnTurnShare, `${r.bpm}`).toBe(1);
      expect(r.plannedOffTurn, `${r.bpm}`).toBe(0);
    }
  }, 120_000);

  it('is deterministic, and reads no store and no clock', () => {
    const a = runShiftCoverSim({ coords: ONE, measures: 300, bpms: [97] });
    const b = runShiftCoverSim({ coords: ONE, measures: 300, bpms: [97] });
    expect(a).toEqual(b);
    expect(subscribeToMeasure).not.toHaveBeenCalled();
    expect(getCurrentMeasure).not.toHaveBeenCalled();
  });

  it('formatShiftCoverReport renders one line per row, under a header', () => {
    const rows = runShiftCoverSim({ coords: ONE, measures: 200, bpms: [60, 200] });
    const lines = formatShiftCoverReport(rows).split('\n');
    expect(lines).toHaveLength(2 + rows.length);
    expect(lines[2].startsWith('| 60 |')).toBe(true);
    expect(lines[3].startsWith('| 200 |')).toBe(true);
  });

  it.runIf(!!process.env.LIFECYCLE_SIM_REPORT)('the report: the grid at 20, 40, 60, 100 and 200 BPM, 2,000 measures a world', () => {
    const rows = runShiftCoverSim({ measures: SIM_MEASURES, bpms: SHIFT_TEMPOS });
    console.log(`\n${formatShiftCoverReport(rows)}`);
  }, 600_000);
});

// ========================================
// LOOP SIM (Phase 43 Task 15 — readiness and handoff, spec §5.2)
// ========================================

const VENT = JobType.VentExtraction;
const SURVEY = JobType.AcousticSurvey;

/** A station stub. */
const station = (id: string, x: number, y: number, capacity = 6): Station => ({ id, center: { x, y }, port: { x, y }, capacity, gemSeed: 0 });

/** A lifecycle snapshot stub. */
function snap(id: string, docking: DockingState): RobotLifecycleSnapshot {
  return { id, docking, batteryLevel: docking === DockingState.Active ? 100 : 50 };
}

/** A lifecycle that only changes docking where the script says, at that measure. */
function scripted(plan: Record<number, Record<string, DockingState>> = {}): LifecycleStep {
  return (roster, measure) => roster.map((r) => (plan[measure]?.[r.id] ? { ...r, docking: plan[measure][r.id] } : r));
}

/** 240 BPM → one measure per second, so measure m lands at t = m. */
const ONE_SECOND_MEASURES = 240;

function runScenario(opts: Partial<LoopSimOptions> & Pick<LoopSimOptions, 'world' | 'roster'>): { result: LoopSimResult; trace: LoopSimEvent[] } {
  const trace: LoopSimEvent[] = [];
  const result = runLoopSim({
    bpm: ONE_SECOND_MEASURES,
    seconds: 12,
    rand: alea('scenario'),
    step: scripted(),
    cooldown: () => 3,
    trace: (e) => trace.push(e),
    ...opts,
  });
  return { result, trace };
}

const eventsOf = (trace: LoopSimEvent[], robotId: string) => trace.filter((e) => e.robotId === robotId);

/** Every [start, end) interval during which a robot held each site (transit or working). */
function siteHolds(trace: LoopSimEvent[], end: number): { siteId: string; robotId: string; from: number; to: number }[] {
  const open = new Map<string, { siteId: string; from: number }>();
  const holds: { siteId: string; robotId: string; from: number; to: number }[] = [];
  for (const e of trace) {
    const cur = open.get(e.robotId);
    const holding = (e.activity === 'transit' || e.activity === 'working') && e.siteId !== undefined;
    if (cur && (!holding || cur.siteId !== e.siteId)) {
      holds.push({ siteId: cur.siteId, robotId: e.robotId, from: cur.from, to: e.t });
      open.delete(e.robotId);
    }
    if (holding && !open.has(e.robotId)) open.set(e.robotId, { siteId: e.siteId!, from: e.t });
  }
  for (const [robotId, cur] of open) holds.push({ siteId: cur.siteId, robotId, from: cur.from, to: end });
  return holds;
}

/** One placed world off the real placer, for the world-building tests. */
function placedWorld(x: number, y: number): { actors: Actor[]; noiseMap: ReturnType<typeof simNoiseMap> } {
  const id = `loop-sim-${x}-${y}`;
  registerLocale(id, x, y);
  return { actors: placeDistrict(id), noiseMap: simNoiseMap(x, y) };
}

describe('loop sim (Phase 43 Task 15 — readiness and handoff, spec §5.2)', () => {
  it('pins the loop constants it runs on', () => {
    expect(SWIM_SPEED).toBe(120);
    expect(STATION_ARC_SECONDS).toBe(1);
    expect(WAIT_RETRY_SECONDS).toBe(2);
    expect(BEATS_PER_MEASURE).toBe(4);
    expect(SIM_LOOP_SECONDS).toBe(600);
    expect(SIM_LOOP_BPMS).toEqual([20, 110, 200]);
  });

  describe('buildLoopWorld', () => {
    it('is every eligible host as a site (its work site jobs and park) and the world\'s seeded stations', () => {
      const { actors, noiseMap } = placedWorld(-120, 40);
      const world = buildLoopWorld(actors, noiseMap);
      const eligible = actors.filter((a) => isWorkSiteEligible(a, { backHosts: BACK_HOSTS_ENABLED }));
      expect(world.sites).toHaveLength(eligible.length);
      expect(world.sites.length).toBeGreaterThan(0);
      eligible.forEach((a, i) => {
        const ws = getWorkSite(a)!;
        expect(world.sites[i].jobs).toEqual(ws.jobs);
        expect(world.sites[i].park).toEqual(ws.park);
      });
      // Actor ids collide across locales and may repeat; sim site ids must be unique within a world.
      expect(new Set(world.sites.map((s) => s.id)).size).toBe(world.sites.length);
      expect(world.stations).toEqual(deriveStations(noiseMap, hostObstacles(actors)));
    });
  });

  describe('runLoopSim — one robot, one site (hand-worked timeline)', () => {
    const world: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 120, y: 0 } }] };
    const d = jobDuration(ONE_SECOND_MEASURES);

    it('exits, swims at SWIM_SPEED, works for jobDuration, then waits out the cooldown in WAIT_RETRY_SECONDS bobs', () => {
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)] });
      const r0 = eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)]);
      const workEnd = STATION_ARC_SECONDS + 1 + d; // exit STATION_ARC_SECONDS + swim 120 px / 120 px/s
      // Cooldown 3 > one retry, so two bobs before the site is ready again; the swim back is zero-length.
      expect(r0).toEqual([
        ['exiting', 0],
        ['transit', STATION_ARC_SECONDS],
        ['working', STATION_ARC_SECONDS + 1],
        ['waiting', +workEnd.toFixed(3)],
        ['transit', +(workEnd + 4).toFixed(3)],
        ['working', +(workEnd + 4).toFixed(3)],
      ]);
      expect(result.waitingSeconds).toBeCloseTo(4);
      expect(result.waits.map((w) => +w.toFixed(3))).toEqual([4]);
      expect(result.activeSeconds).toBeCloseTo(12);
      expect(result.stints).toBe(1);
      expect(result.switches).toBe(0);
      expect(result.turnBacks).toBe(0);
      expect(result.chargingWhileVisible).toBe(0);
    });

    it('a job runs for jobDuration at the sim tempo — 6 s at 240 BPM (clamped from 200)', () => {
      expect(d).toBe(6);
    });

    it('slower tempo, longer jobs: 10 s at 20 BPM, 8 s at 110, 6 s at 200 (orbiter count no longer matters)', () => {
      const firstWaitAt = (bpm: number) =>
        runScenario({ world, roster: [snap('r0', DockingState.Active)], bpm, seconds: 14 }).trace.find((e) => e.activity === 'waiting')!.t;
      expect(firstWaitAt(20)).toBeCloseTo(STATION_ARC_SECONDS + 1 + 10);
      expect(firstWaitAt(110)).toBeCloseTo(STATION_ARC_SECONDS + 1 + 8);
      expect(firstWaitAt(200)).toBeCloseTo(STATION_ARC_SECONDS + 1 + 6);
    });

    it('with no sites at all, waits the whole shift as one unbroken wait', () => {
      const { result } = runScenario({ world: { stations: world.stations, sites: [] }, roster: [snap('r0', DockingState.Active)] });
      expect(result.waits).toHaveLength(1);
      expect(result.waits[0]).toBeCloseTo(12 - STATION_ARC_SECONDS);
      expect(result.waitingSeconds / result.activeSeconds).toBeCloseTo((12 - STATION_ARC_SECONDS) / 12);
    });

    it('a Docked robot stays hidden at its station and is never active time', () => {
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Docked)] });
      expect(eventsOf(trace, 'r1')).toEqual([{ t: 0, robotId: 'r1', activity: 'charging', stationId: 's0', visible: false }]);
      expect(result.activeSeconds).toBeCloseTo(12);
      expect(result.stints).toBe(1);
    });
  });

  describe('runLoopSim — sites and jobs', () => {
    it('one robot per site: two robots, one site, never both holding it', () => {
      const world: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 120, y: 0 } }] };
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Active)], seconds: 30 });
      const holds = siteHolds(trace, 30);
      expect(holds.length).toBeGreaterThan(2);
      for (const a of holds) for (const b of holds) {
        if (a === b || a.siteId !== b.siteId) continue;
        expect(a.to <= b.from + 1e-9 || b.to <= a.from + 1e-9).toBe(true);
      }
      expect(result.waitingSeconds).toBeGreaterThan(0);
    });

    it('the variety rule: the second robot out takes the job the first does not hold, even with a second site for it free', () => {
      // Two VENT sites, so a held site alone can't force the difference — only heldJobs can.
      const world: LoopSimWorld = {
        stations: [station('s0', 0, 0)],
        sites: [
          { id: 'a', jobs: [VENT], park: { x: 120, y: 0 } },
          { id: 'a2', jobs: [VENT], park: { x: 130, y: 0 } },
          { id: 'b', jobs: [SURVEY], park: { x: -120, y: 0 } },
        ],
      };
      const firstJobs = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { trace } = runScenario({ world, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Active)], rand: alea(`v${i}`) });
        const first = (id: string) => eventsOf(trace, id).find((e) => e.activity === 'transit')!.job;
        expect(first('r0')).not.toBe(first('r1'));
        firstJobs.add(first('r0')!);
      }
      // Guard: r0 really picked VENT in some runs (the case where the rule matters).
      expect(firstJobs.has(VENT)).toBe(true);
    });

    it('counts a job switch when the robot\'s own job has no ready site', () => {
      const world: LoopSimWorld = {
        stations: [station('s0', 0, 0)],
        sites: [
          { id: 'a', jobs: [VENT], park: { x: 120, y: 0 } },
          { id: 'b', jobs: [SURVEY], park: { x: 240, y: 0 } },
        ],
      };
      // Long cooldown: after one job at each site, nothing is ready, so exactly one switch.
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], cooldown: () => 100, seconds: 20 });
      expect(new Set(eventsOf(trace, 'r0').filter((e) => e.activity === 'working').map((e) => e.siteId))).toEqual(new Set(['a', 'b']));
      expect(result.switches).toBe(1);
      expect(result.stints).toBe(1);
    });

    it('a site freed by an abandoned transit is ready at once (no cooldown) for the next robot', () => {
      const world: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 1200, y: 0 } }] };
      // r0 is recalled 1.1 s into a 10 s swim; r1 undocks at t = 3 and must find 'a' ready.
      const step = scripted({ 2: { r0: DockingState.Recalled }, 3: { r1: DockingState.Active } });
      const { trace } = runScenario({ world, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Docked)], step });
      const r1 = eventsOf(trace, 'r1').map((e) => [e.activity, +e.t.toFixed(3), e.siteId]);
      expect(r1.slice(1, 3)).toEqual([['exiting', 3, undefined], ['transit', 3 + STATION_ARC_SECONDS, 'a']]);
    });
  });

  // Roadmap 94 Task 19 (spec §1.11): with the door on, a Recalled robot at its port waits for its hold's last bar and
  // goes in on the hold's bar line; one arriving with under half a measure left, or Docked already, is late.
  describe('runLoopSim — the wait at the door (roadmap 94 Task 19)', () => {
    const port: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [] };
    const far: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 1200, y: 0 } }] };
    /** A member of 'co', Active. */
    const member = (id: string): RobotLifecycleSnapshot => ({ ...snap(id, DockingState.Active), companyId: 'co' } as RobotLifecycleSnapshot);
    /** A lifecycle that sets docking and the hold where the script says, at that measure. */
    const holds = (plan: Record<number, Record<string, [DockingState, number?]>>): LifecycleStep => (roster, measure) =>
      roster.map((r) => {
        const s = plan[measure]?.[r.id];
        return s ? { ...r, docking: s[0], dockingHoldUntilMeasure: s[1] } : r;
      });
    const entering = (trace: LoopSimEvent[]) => eventsOf(trace, 'r0').filter((e) => e.activity === 'entering' || e.activity === 'charging').map((e) => [e.activity, +e.t.toFixed(3)]);

    it('an early arrival waits at the door, visible, until the last bar of its hold, and goes in on the bar line', () => {
      // 240 BPM, a measure a second. Recalled at 3 with its hold at 6 (its exit turn 5), at its port already: it
      // enters at 3, waits to 5, fades over the last bar and is charging at 6, as the hold lands.
      const step = holds({ 3: { r0: [DockingState.Recalled, 6] }, 6: { r0: [DockingState.Docked] } });
      const { result, trace } = runScenario({ world: port, roster: [member('r0')], step, door: true });
      expect(entering(trace)).toEqual([['entering', 3], ['charging', 6]]);
      expect(result.doorWaits.map((w) => +w.toFixed(3))).toEqual([2]);
      expect(result.memberExits).toBe(1);
      expect(result.lateMembers).toBe(0);
      expect(result.chargingWhileVisible).toBe(0);
      expect(result.longestDockedVisible).toBe(0);
    });

    it('an arrival inside the first half of the last bar fades over what is left and goes in on the bar line', () => {
      // 192 BPM, a measure 1.25 s. Recalled at measure 2 (2.5 s) 180 px out: home at 4.0, inside the last bar
      // 3.75 to 5.0 with 1.0 s left (over half). Its hold is 4: charging at 5.0, no wait.
      const step = holds({ 2: { r0: [DockingState.Recalled, 4] }, 4: { r0: [DockingState.Docked] } });
      const { result, trace } = runScenario({ world: far, roster: [member('r0')], step, bpm: 192, door: true });
      expect(entering(trace)).toEqual([['entering', 4], ['charging', 5]]);
      expect(result.doorWaits).toEqual([0]);
      expect(result.lateMembers).toBe(0);
    });

    it('a late arrival, Docked already, takes the next bar line: at once with half a measure or more left', () => {
      // As above with its hold at 3 (3.75 s): home at 4.0, Docked already; 1.0 s to the next bar line, so at once.
      const step = holds({ 2: { r0: [DockingState.Recalled, 3] }, 3: { r0: [DockingState.Docked] } });
      const { result, trace } = runScenario({ world: far, roster: [member('r0')], step, bpm: 192, door: true });
      expect(entering(trace)).toEqual([['entering', 4], ['charging', 5]]);
      expect(result.doorWaits).toEqual([0]);
      expect(result.memberExits).toBe(1);
      expect(result.lateMembers).toBe(1);
    });

    it('a late arrival with under half a measure left before its hold holds to that bar line, then fades over the next measure', () => {
      // 300 BPM, a measure 0.8 s. Recalled at measure 2 (1.6 s) 72 px out with its hold at 3 (2.4 s): home at 2.2,
      // 0.2 s before the hold's bar line (under 0.4), so it is late: it holds to 2.4 and goes in on 3.2.
      const step = holds({ 2: { r0: [DockingState.Recalled, 3] }, 3: { r0: [DockingState.Docked] } });
      const { result, trace } = runScenario({ world: far, roster: [member('r0')], step, bpm: 300, door: true });
      expect(entering(trace)).toEqual([['entering', 2.2], ['charging', 3.2]]);
      expect(result.doorWaits.map((w) => +w.toFixed(3))).toEqual([0.2]);
      expect(result.lateMembers).toBe(1);
    });

    it('counts a freelancer arrival, but not as a member exit', () => {
      const step = holds({ 3: { r0: [DockingState.Recalled, 6] }, 6: { r0: [DockingState.Docked] } });
      const { result } = runScenario({ world: port, roster: [snap('r0', DockingState.Active)], step, door: true });
      expect(result.arrivals).toBe(1);
      expect(result.memberExits).toBe(0);
      expect(result.doorWaits).toHaveLength(1);
    });

    it('with the door off, nothing changes: the entry is the arc, and no door is counted', () => {
      const step = holds({ 3: { r0: [DockingState.Recalled, 6] }, 6: { r0: [DockingState.Docked] } });
      const { result, trace } = runScenario({ world: port, roster: [member('r0')], step });
      expect(entering(trace)).toEqual([['entering', 3], ['charging', 3 + STATION_ARC_SECONDS]]);
      expect(result.doorWaits).toEqual([]);
      expect(result.arrivals).toBe(0);
    });
  });

  describe('runLoopSim — recall and handoff', () => {
    const world: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 120, y: 0 } }] };
    const d = jobDuration(ONE_SECOND_MEASURES);

    it('recalled mid-job: finishes the job, then returns, enters and is hidden — Docked while still visible is measured', () => {
      const step = scripted({ 3: { r0: DockingState.Recalled }, 4: { r0: DockingState.Docked } });
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], step });
      const workEnd = STATION_ARC_SECONDS + 1 + d;
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3), e.visible])).toEqual([
        ['exiting', 0, true],
        ['transit', STATION_ARC_SECONDS, true],
        ['working', STATION_ARC_SECONDS + 1, true],
        ['returning', +workEnd.toFixed(3), true],
        ['entering', +(workEnd + 1).toFixed(3), true],
        ['charging', +(workEnd + 1 + STATION_ARC_SECONDS).toFixed(3), false],
      ]);
      expect(result.waitingSeconds).toBe(0);
      expect(result.turnBacks).toBe(0);
      expect(result.chargingWhileVisible).toBe(0);
      // Docked at t = 4, hidden at workEnd + 1 + STATION_ARC_SECONDS.
      expect(result.longestDockedVisible).toBeCloseTo(workEnd + 1 + STATION_ARC_SECONDS - 4);
      expect(result.dockedVisibleSeconds).toBeCloseTo(result.longestDockedVisible);
    });

    it('recalled in transit: abandons the swim and returns from where it is', () => {
      const far: LoopSimWorld = { stations: world.stations, sites: [{ id: 'a', jobs: [VENT], park: { x: 1200, y: 0 } }] };
      const { trace } = runScenario({ world: far, roster: [snap('r0', DockingState.Active)], step: scripted({ 2: { r0: DockingState.Recalled } }) });
      // At t = 2 it is (2 − STATION_ARC_SECONDS) × 120 = 120 px out; 1 s home.
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)])).toEqual([
        ['exiting', 0],
        ['transit', STATION_ARC_SECONDS],
        ['returning', 2],
        ['entering', 3],
        ['charging', 3 + STATION_ARC_SECONDS],
      ]);
    });

    it('recalled while waiting: stops waiting and returns now', () => {
      const { result, trace } = runScenario({ world: { stations: world.stations, sites: [] }, roster: [snap('r0', DockingState.Active)], step: scripted({ 3: { r0: DockingState.Recalled } }) });
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)])).toEqual([
        ['exiting', 0],
        ['waiting', STATION_ARC_SECONDS],
        ['returning', 3],
        ['entering', 3],
        ['charging', 3 + STATION_ARC_SECONDS],
      ]);
      expect(result.waits.map((w) => +w.toFixed(3))).toEqual([3 - STATION_ARC_SECONDS]);
    });

    it('recalled while exiting: finishes the exit, then turns straight round', () => {
      const { trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], bpm: 480, step: scripted({ 1: { r0: DockingState.Recalled } }) });
      // 480 BPM → measure 1 at t = 0.5, mid-exit.
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)]).slice(0, 3)).toEqual([
        ['exiting', 0],
        ['returning', STATION_ARC_SECONDS],
        ['entering', STATION_ARC_SECONDS],
      ]);
    });

    it('turn-back while returning: Active again before it gets home → back to work, never charging', () => {
      const mid: LoopSimWorld = { stations: world.stations, sites: [{ id: 'a', jobs: [VENT], park: { x: 240, y: 0 } }] };
      // Work 3 → 3 + d (d = 6: 9); recalled at 4 (finishes), returning 2 s (9 … 11); Active at 10 → turn-back mid-swim.
      // (Recalled at 4, not 3: with the 1 s arc the robot arrives at exactly t = 3.)
      const step = scripted({ 4: { r0: DockingState.Recalled }, 10: { r0: DockingState.Active } });
      const { result, trace } = runScenario({ world: mid, roster: [snap('r0', DockingState.Active)], step });
      const r0 = eventsOf(trace, 'r0');
      const back = r0.findIndex((e) => e.activity === 'returning');
      expect(r0[back + 1].t).toBeCloseTo(10);
      expect(r0[back + 1].activity).not.toBe('entering');
      expect(r0.some((e) => e.activity === 'charging')).toBe(false);
      expect(result.turnBacks).toBe(1);
      expect(result.stints).toBe(1);
    });

    it('turn-back mid-entry: Active lands during the entry arc → it comes straight back out to work, never charging', () => {
      // Park 150 px out (a 1.25 s swim), so the entry arc straddles a whole measure: work 2.25 →
      // 2.25 + d; recalled at 3 (finishes); home 1.25 s; entering 3.5 + d … 4.5 + d (d = 6: 9.5 … 10.5).
      const near: LoopSimWorld = { stations: world.stations, sites: [{ id: 'a', jobs: [VENT], park: { x: 150, y: 0 } }] };
      const step = scripted({ 3: { r0: DockingState.Recalled }, 10: { r0: DockingState.Active } });
      const { result, trace } = runScenario({ world: near, roster: [snap('r0', DockingState.Active)], step });
      const r0 = eventsOf(trace, 'r0');
      const entering = r0.findIndex((e) => e.activity === 'entering');
      expect(r0[entering].t).toBeCloseTo(3.5 + d);
      expect(r0[entering + 1].t).toBeCloseTo(10);
      expect(r0[entering + 1].activity).toBe('waiting'); // 'a' is still resting (cooldown 3 from 2.25 + d)
      expect(r0.some((e) => e.activity === 'charging')).toBe(false);
      expect(result.turnBacks).toBe(1);
    });

    it('turn-back at the end of entry: Active again while it finished a recalled job → enters, then exits at once', () => {
      // Recalled at 3 while working (pending), Active again at 5, still working: it still goes home.
      const step = scripted({ 3: { r0: DockingState.Recalled }, 5: { r0: DockingState.Active } });
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], step });
      const r0 = eventsOf(trace, 'r0');
      const entered = r0.findIndex((e) => e.activity === 'charging');
      expect(r0[entered].visible).toBe(false);
      expect(r0[entered + 1].activity).toBe('exiting');
      expect(r0[entered + 1].t).toBe(r0[entered].t);
      expect(result.turnBacks).toBe(1);
      expect(result.stints).toBe(2);
      expect(result.chargingWhileVisible).toBe(0);
    });

    it('a charging robot that turns Active exits and starts a stint', () => {
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Docked)], step: scripted({ 5: { r1: DockingState.Active } }) });
      expect(eventsOf(trace, 'r1')[1]).toEqual({ t: 5, robotId: 'r1', activity: 'exiting', stationId: 's0', visible: true });
      expect(result.stints).toBe(2);
    });

    it('returning robots take the nearest station with a free slot — a full one is skipped', () => {
      // r0 leaves s0 (far) and works beside s1, which the Docked r1 fills (capacity 1).
      const twoStations: LoopSimWorld = {
        stations: [station('s0', 0, 0, 1), station('s1', 200, 0, 1)],
        sites: [{ id: 'a', jobs: [VENT], park: { x: 150, y: 0 } }],
      };
      const step = scripted({ 3: { r0: DockingState.Recalled } });
      const { trace } = runScenario({ world: twoStations, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Docked)], step });
      expect(eventsOf(trace, 'r1')).toHaveLength(1); // charging at s1 throughout
      expect(eventsOf(trace, 'r0').find((e) => e.activity === 'returning')!.stationId).toBe('s0');
      expect(eventsOf(trace, 'r0').find((e) => e.activity === 'charging')!.stationId).toBe('s0');
    });

    it('…and the nearest station wins when it has room', () => {
      const twoStations: LoopSimWorld = {
        stations: [station('s0', 0, 0, 2), station('s1', 200, 0, 2)],
        sites: [{ id: 'a', jobs: [VENT], park: { x: 150, y: 0 } }],
      };
      const step = scripted({ 3: { r0: DockingState.Recalled } });
      const { trace } = runScenario({ world: twoStations, roster: [snap('r0', DockingState.Active), snap('r1', DockingState.Docked)], step });
      expect(eventsOf(trace, 'r0').find((e) => e.activity === 'charging')!.stationId).toBe('s1');
    });
  });

  describe('runLoopSim — purity', () => {
    const world: LoopSimWorld = {
      stations: [station('s0', 0, 0), station('s1', 900, 300)],
      sites: [
        { id: 'a', jobs: [VENT], park: { x: 300, y: 200 } },
        { id: 'b', jobs: [SURVEY, VENT], park: { x: 700, y: 400 } },
      ],
    };
    const roster = ['r0', 'r1', 'r2'].map((id, i) => snap(id, i < 2 ? DockingState.Active : DockingState.Docked));

    it('is deterministic for the same rand seed', () => {
      const run = () => runScenario({ world, roster, rand: alea('det'), seconds: 120, step: scripted({ 10: { r0: DockingState.Recalled }, 20: { r2: DockingState.Active } }) });
      expect(run()).toEqual(run());
    });

    it('touches no store, no BeatClock and no GSAP', () => {
      const getState = vi.spyOn(useLocaleStore, 'getState');
      const to = vi.spyOn(gsap, 'to');
      const timeline = vi.spyOn(gsap, 'timeline');
      vi.mocked(subscribeToMeasure).mockClear();
      vi.mocked(getCurrentMeasure).mockClear();
      runScenario({ world, roster, seconds: 120 });
      expect(getState).not.toHaveBeenCalled();
      expect(to).not.toHaveBeenCalled();
      expect(timeline).not.toHaveBeenCalled();
      expect(subscribeToMeasure).not.toHaveBeenCalled();
      expect(getCurrentMeasure).not.toHaveBeenCalled();
    });
  });

  describe('COOLDOWN_CANDIDATES', () => {
    it('leads with the shipped siteCooldown, then clamped alternatives labelled per/min/max', () => {
      const [shipped, ...rest] = COOLDOWN_CANDIDATES;
      for (const n of [0, 5, 9, 14, 24, 60]) expect(shipped.cooldown(n)).toBe(siteCooldown(n));
      expect(rest.length).toBeGreaterThan(0);
      const c = clampedCooldown(0.3, 2, 30);
      expect(c.label).toBe('0.3/2/30');
      expect(c.cooldown(1)).toBe(2);
      expect(c.cooldown(14)).toBeCloseTo(4.2);
      expect(c.cooldown(200)).toBe(30);
    });

    it('has no duplicate rows: every label is unique, and the previous pick 0.4/3/30 is kept for comparison (Task 16b)', () => {
      const labels = COOLDOWN_CANDIDATES.map((c) => c.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels).toEqual(['0.3/2/30', '0.4/3/30', '0.6/4/30', '0.2/2/30', '0/0/0']);
    });
  });

  describe('runReadinessSim', () => {
    const worlds = FEW_COORDS.map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));

    it('returns one row per candidate × tempo, shares in [0, 1], and one seed row per world per row', () => {
      const { rows, seeds } = runReadinessSim({ worlds, seconds: 120 });
      expect(rows.map((r) => [r.label, r.bpm])).toEqual(COOLDOWN_CANDIDATES.flatMap((c) => SIM_LOOP_BPMS.map((bpm) => [c.label, bpm])));
      for (const r of rows) {
        expect(r.meanWaitingShare).toBeGreaterThanOrEqual(0);
        expect(r.p95WaitingShare).toBeLessThanOrEqual(1);
        expect(r.meanWaitingShare).toBeLessThanOrEqual(r.p95WaitingShare + 1e-9);
        expect(r.longestWait).toBeGreaterThanOrEqual(0);
        expect(r.chargingWhileVisible).toBe(0);
      }
      expect(seeds).toHaveLength(rows.length * worlds.length);
    });

    it('is deterministic and store-free once the worlds are placed', () => {
      const a = runReadinessSim({ worlds, seconds: 60 });
      const getState = vi.spyOn(useLocaleStore, 'getState');
      const b = runReadinessSim({ worlds, seconds: 60 });
      expect(getState).not.toHaveBeenCalled();
      expect(b).toEqual(a);
    });

    it('over the full grid at 20, 110 and 200 BPM for 10 minutes: zero robots charging while visible (the report is printed with LIFECYCLE_SIM_REPORT)', () => {
      const grid = SIM_SEED_COORDS.map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));
      const { rows, seeds } = runReadinessSim({ worlds: grid });
      for (const r of rows) expect(r.chargingWhileVisible).toBe(0);
      if (process.env.LIFECYCLE_SIM_REPORT) console.log(`\n${formatReadinessReport(rows, seeds)}`);
    }, 120_000);

    // Roadmap 94 Task 19: the shift step with the door on.
    it('a few worlds at 110 BPM: members reach their ports, nobody charges while visible', () => {
      const few = SIM_SEED_COORDS.slice(0, 121).filter((_, i) => i % 30 === 0).map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));
      const { rows } = runReadinessSim({ worlds: few, bpms: [110], candidates: COOLDOWN_CANDIDATES.slice(0, 1) });
      expect(rows).toHaveLength(1);
      expect(rows[0].memberExits).toBeGreaterThan(0);
      expect(rows[0].chargingWhileVisible).toBe(0);
      expect(rows[0].doorWait.longest).toBeGreaterThan(0);
      expect(formatDoorReport(rows).split('\n')).toHaveLength(3);
    }, 120_000);

    it.runIf(!!process.env.LIFECYCLE_SIM_REPORT)('the door report: the full grid at 20, 110 and 200 BPM for 10 minutes', () => {
      const grid = SIM_SEED_COORDS.map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));
      const { rows } = runReadinessSim({ worlds: grid, candidates: COOLDOWN_CANDIDATES.slice(0, 1) });
      console.log(`\n${formatDoorReport(rows)}\n\n${formatReadinessReport(rows, [])}`);
    }, 600_000);
  });

  describe('formatReadinessReport', () => {
    it('renders the overall table, then the worst seeds by waiting share', () => {
      const rows: ReadinessRow[] = [
        { label: 'c', bpm: 20, meanWaitingShare: 0.05, p95WaitingShare: 0.12, longestWait: 14, p95Wait: 6, switchesPerStint: 1.5, turnBacks: 0, chargingWhileVisible: 0, longestDockedVisible: 0, memberExits: 0, lateMembers: 0, doorWait: { median: 0, p90: 0, longest: 0 } },
      ];
      const seeds: ReadinessSeedRow[] = [
        { label: 'c', bpm: 20, x: 0, y: 0, sites: 9, waitingShare: 0.01, longestWait: 2, switchesPerStint: 1, turnBacks: 0 },
        { label: 'c', bpm: 20, x: 40, y: -80, sites: 5, waitingShare: 0.2, longestWait: 14, switchesPerStint: 2, turnBacks: 0 },
      ];
      const lines = formatReadinessReport(rows, seeds).trim().split('\n');
      expect(lines[0]).toMatch(/^\| Cooldown \| BPM \|/);
      expect(lines[2]).toBe('| c | 20 | 5.0 % | 12.0 % | 14.0 s | 6.0 s | 1.50 | 0 | 0 | 0.0 s |');
      const worst = lines.findIndex((l) => l.includes('| 40 | -80 |'));
      const best = lines.findIndex((l) => l.includes('| 0 | 0 | 9 |'));
      expect(worst).toBeGreaterThan(2);
      expect(worst).toBeLessThan(best);
    });
  });
});
