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
  DRAIN_CANDIDATES,
  simNoiseMap,
  buildSimRoster,
  flatDrain,
  activeCountsOverTime,
  percentile,
  runDrainSim,
  formatDrainReport,
  SIM_LOOP_SECONDS,
  SIM_LOOP_BPMS,
  COOLDOWN_CANDIDATES,
  clampedCooldown,
  buildLoopWorld,
  runLoopSim,
  runReadinessSim,
  formatReadinessReport,
  createCoverTally,
  runCoverSim,
  formatCoverReport,
  type CoverSimRow,
  type CoverSnapshot,
  type CoverTallyResult,
  type LifecycleStep,
  type LoopSimEvent,
  type LoopSimOptions,
  type LoopSimResult,
  type LoopSimWorld,
  type ReadinessRow,
  type ReadinessSeedRow,
  type SimBand,
} from './lifecycleSim';
import { activeDrain, stepRobotLifecycle, type RobotLifecycleSnapshot } from './robotSystems';
import { generateBatterySize, spawnInitialRoster } from './spawnSystem';
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
  INITIAL_ACTIVE_ROBOTS_MIN,
  INITIAL_ACTIVE_ROBOTS_MAX,
  SWIM_SPEED,
  STATION_ARC_SECONDS,
  WAIT_RETRY_SECONDS,
  BEATS_PER_MEASURE,
  BACK_HOSTS_ENABLED,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_SIZE_MIN,
  BATTERY_SIZE_MAX,
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

describe('lifecycleSim (Phase 43 Task 2 — measure the drain before flattening it)', () => {
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

  describe('buildSimRoster', () => {
    it(`builds ${MAX_ROBOTS} robots, a seeded ${INITIAL_ACTIVE_ROBOTS_MIN}-${INITIAL_ACTIVE_ROBOTS_MAX} of them Active at full battery, the rest Docked below 100 — no job anywhere (Task 3)`, () => {
      for (const { x, y } of FEW_COORDS) {
        const roster = buildSimRoster(simNoiseMap(x, y));
        expect(roster).toHaveLength(MAX_ROBOTS);
        const active = roster.filter((r) => r.docking === DockingState.Active);
        expect(active.length).toBeGreaterThanOrEqual(INITIAL_ACTIVE_ROBOTS_MIN);
        expect(active.length).toBeLessThanOrEqual(INITIAL_ACTIVE_ROBOTS_MAX);
        for (const r of active) expect(r.batteryLevel).toBe(100);
        for (const r of roster.filter((s) => s.docking === DockingState.Docked)) {
          expect(r.batteryLevel).toBeGreaterThanOrEqual(0);
          expect(r.batteryLevel).toBeLessThan(100);
        }
        for (const r of roster) expect('job' in r).toBe(false);
        expect(new Set(roster.map((r) => r.id)).size).toBe(MAX_ROBOTS);
      }
    });

    it('matches the real spawn path robot for robot — spawnInitialRoster, same coordinates', () => {
      const x = 40;
      const y = -80;
      const localeId = 'lifecycle-sim-parity';
      registerLocale(localeId, x, y);
      spawnInitialRoster(localeId);
      const real = useLocaleStore.getState().getLocaleById(localeId)!.robots;

      const sim = buildSimRoster(simNoiseMap(x, y));
      const fields = (s: RobotLifecycleSnapshot | Robot) => ({ docking: s.docking, batteryLevel: s.batteryLevel, noteVariance: s.noteVariance, batterySize: s.batterySize });
      expect(sim.map(fields)).toEqual(real.map(fields));

      // Guard against a coincidental pass on defaults: this seed must actually vary, and carry real sizes.
      expect(new Set(real.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel)).size).toBeGreaterThan(1);
      expect(real.every((r) => r.batterySize !== undefined && r.batterySize !== 1)).toBe(true);
      expect(new Set(real.map((r) => r.batterySize)).size).toBe(MAX_ROBOTS);
    });

    it('draws every size on the band it is given, from the same even draw (no-silence Task 8)', () => {
      for (const { x, y } of FEW_COORDS) {
        const noiseMap = simNoiseMap(x, y);
        const banded = buildSimRoster(noiseMap, [0.67, 1.5]);
        banded.forEach((r, i) => {
          expect(r.batterySize).toBe(generateBatterySize(noiseMap, i, 0.67, 1.5));
          expect(r.batterySize).toBeGreaterThanOrEqual(0.67);
          expect(r.batterySize).toBeLessThan(1.5);
        });
        // The band changes the sizes only: docking, battery and note variance are the default roster's.
        const strip = ({ batterySize: _size, ...rest }: RobotLifecycleSnapshot) => rest;
        expect(banded.map(strip)).toEqual(buildSimRoster(noiseMap).map(strip));
      }
    });

    it("'flat' builds today's fleet: the same roster with no size on any robot", () => {
      const noiseMap = simNoiseMap(-40, 80);
      const flat = buildSimRoster(noiseMap, 'flat');
      for (const r of flat) expect('batterySize' in r).toBe(false);
      expect(flat).toEqual(buildSimRoster(noiseMap).map(({ batterySize: _size, ...rest }) => rest));
    });

    it('uses the same noise map the live locale would (no attenuation-style override)', () => {
      const live = getLocaleNoiseMap('lifecycle-sim-noise-check', 120, 160);
      const sim = simNoiseMap(120, 160);
      for (const [a, b] of [[0, 0], [3.7, -12.1], [100, 42]]) expect(sim(a, b)).toBe(live(a, b));
    });
  });

  describe('flatDrain', () => {
    it('returns the same number for every snapshot, whatever its battery or docking', () => {
      const [a, b] = buildSimRoster(simNoiseMap(0, 0));
      expect(flatDrain(6)(a)).toBe(6);
      expect(flatDrain(6)({ ...b, batteryLevel: 1, docking: DockingState.Docked })).toBe(6);
    });
  });

  describe('DRAIN_CANDIDATES', () => {
    it('is flat 5, 6 and 7, in that order — today\'s per-job rule is gone (Task 3), and flat 6 is the shipped default', () => {
      expect(DRAIN_CANDIDATES.map((c) => c.label)).toEqual(['flat 5', 'flat 6', 'flat 7']);
      const [r] = buildSimRoster(simNoiseMap(0, 0));
      expect(DRAIN_CANDIDATES.map((c) => c.drain(r))).toEqual([5, 6, 7]);
      expect(activeDrain(r)).toBe(DRAIN_CANDIDATES[1].drain(r));
    });  });

  describe('activeCountsOverTime', () => {
    it('returns one Active count per measure, never above the roster', () => {
      const noiseMap = simNoiseMap(-40, 80);
      const counts = activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, flatDrain(6), 300);
      expect(counts).toHaveLength(300);
      for (const n of counts) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(MAX_ROBOTS);
      }
    });

    // The last Active robot stays up (no-silence Task 12, spec §5.1 case 7): over real seeded rosters, the shipped
    // drain and band, the Active count never reaches zero — in 100 of 121 worlds it did before the rule.
    it('over every world of the grid at SIM_MEASURES, the Active count never reaches zero (case 7)', () => {
      const zeroWorlds = SIM_SEED_COORDS.filter(({ x, y }) => {
        const noiseMap = simNoiseMap(x, y);
        return activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, activeDrain, SIM_MEASURES).some((n) => n === 0);
      });
      expect(zeroWorlds).toEqual([]);
    }, 60_000);

    it('a heavier drain keeps fewer robots Active on average', () => {
      const noiseMap = simNoiseMap(-40, 80);
      const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
      const light = mean(activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, flatDrain(3), 600));
      const heavy = mean(activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, flatDrain(9), 600));
      expect(heavy).toBeLessThan(light);
    });

    it('zero measures is an empty series', () => {
      const noiseMap = simNoiseMap(0, 0);
      expect(activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, flatDrain(6), 0)).toEqual([]);
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

  describe('runDrainSim', () => {
    it('returns one row per candidate, in order, with p10 <= mean <= p90 inside [1, MAX_ROBOTS]', () => {
      const rows = runDrainSim({ coords: FEW_COORDS, measures: 300 });
      expect(rows.map((r) => r.label)).toEqual(DRAIN_CANDIDATES.map((c) => c.label));
      for (const r of rows) {
        expect(r.p10).toBeLessThanOrEqual(r.mean);
        expect(r.mean).toBeLessThanOrEqual(r.p90);
        expect(r.p10).toBeGreaterThanOrEqual(1);
        expect(r.p90).toBeLessThanOrEqual(MAX_ROBOTS);
      }
    });

    it('is deterministic — the same table twice', () => {
      expect(runDrainSim({ coords: FEW_COORDS, measures: 200 })).toEqual(runDrainSim({ coords: FEW_COORDS, measures: 200 }));
    });

    it('touches no store and no BeatClock', () => {
      const getState = vi.spyOn(useLocaleStore, 'getState');
      vi.mocked(subscribeToMeasure).mockClear();
      vi.mocked(getCurrentMeasure).mockClear();
      runDrainSim({ coords: FEW_COORDS, measures: 100 });
      expect(getState).not.toHaveBeenCalled();
      expect(subscribeToMeasure).not.toHaveBeenCalled();
      expect(getCurrentMeasure).not.toHaveBeenCalled();
    });

    it('over the full grid and 2000 measures, reports every candidate — flat 6 at 5.10 mean Active on sized robots', () => {
      const rows = runDrainSim();
      expect(rows.map((r) => r.label)).toEqual(['flat 5', 'flat 6', 'flat 7']);
      for (const r of rows) expect(Number.isFinite(r.mean)).toBe(true);
      // Flat drains are ordered: more drain, fewer robots out.
      expect(rows[0].mean).toBeGreaterThan(rows[1].mean);
      expect(rows[1].mean).toBeGreaterThan(rows[2].mean);
      // The base drains Crawford chose from were 5.70, 5.14 and 4.60 (commit 5bbbff3f) on unsized robots. Each robot's
      // battery size now divides its drain and its charge (no-silence Task 8, the 0.8-1.25 band): 5.71, 5.10, 4.65.
      // The stay-up rule (Task 12) moves them only in the fourth decimal: 5.7070 → 5.7069, 5.1030 → 5.1035, 4.6500 → 4.6512.
      expect(rows.map((r) => r.mean.toFixed(2))).toEqual(['5.71', '5.10', '4.65']);
      if (process.env.LIFECYCLE_SIM_REPORT) console.log(`\n${formatDrainReport(rows)}`);
    }, 60_000);
  });

  describe('formatDrainReport', () => {
    it('renders a markdown table — header, separator, one row per candidate with two-decimal mean', () => {
      const text = formatDrainReport([
        { label: 'today', mean: 4.123, p10: 3, p90: 5 },
        { label: 'flat 6', mean: 4.2, p10: 3, p90: 6 },
      ]);
      const lines = text.trim().split('\n');
      expect(lines[0]).toMatch(/^\| Drain \| Mean Active \| p10 \| p90 \|$/);
      expect(lines[1]).toMatch(/^\|[-| ]+\|$/);
      expect(lines[2]).toBe('| today | 4.12 | 3 | 5 |');
      expect(lines[3]).toBe('| flat 6 | 4.20 | 3 | 6 |');
      expect(lines).toHaveLength(4);
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
    it('two measures with nobody sounding are two silent measures, one silence of length 2 at the measure it begins', () => {
      const result = tallyOf(cover(['a', A, 100]), [
        cover(['a', R, 10]),
        cover(['a', D, 15]),
        cover(['a', D, 20]),
        cover(['a', A, 100]),
      ]);
      expect(result.measures).toBe(4);
      expect(result.silentMeasures).toBe(2);
      expect(result.longestSilence).toEqual({ start: 2, length: 2 });
    });

    it('a measure whose only sounding robot is Recalled is not silent; Docked and Undocking are not sounding', () => {
      const result = tallyOf(cover(['a', A, 12], ['b', D, 95]), [cover(['a', R, 6], ['b', U, 100])]);
      expect(result.silentMeasures).toBe(0);
      expect(result.longestSilence).toBeUndefined();
      expect(result.soundingHistogram).toEqual([0, 1]);
    });

    it('the longest silence wins, and the earlier of two equal ones', () => {
      const silent = cover(['a', D, 50]);
      const heard = cover(['a', A, 50]);
      expect(tallyOf(silent, [silent, heard, silent, silent, silent, heard]).longestSilence).toEqual({ start: 3, length: 3 });
      expect(tallyOf(silent, [heard, silent, silent, heard, silent, silent, heard]).longestSilence).toEqual({ start: 2, length: 2 });
      expect(tallyOf(silent, [heard, silent, silent, heard, silent, silent]).longestSilence).toEqual({ start: 2, length: 2 });
    });

    it('a silence still open at the end of the series counts at its length so far', () => {
      const result = tallyOf(cover(['a', A, 50]), [cover(['a', A, 44]), cover(['a', D, 10]), cover(['a', D, 15])]);
      expect(result.longestSilence).toEqual({ start: 2, length: 2 });
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
      expect(result.longestSilence).toBeUndefined();
      expect(result.robots.map((r) => [r.id, r.landings, r.cycle, r.heardShare])).toEqual([
        ['a', [], undefined, 0],
        ['b', [], undefined, 0],
      ]);
    });
  });
});

// ========================================
// COVER SIM (no-silence Task 2 — spec §1.5)
// ========================================

/** The cover report's run length (spec §5.3): 6,000 measures a world, under LIFECYCLE_SIM_REPORT only. */
const COVER_REPORT_MEASURES = 6000;

/** The rows the reports print (plan Tasks 10 and 13): today's flat fleet and the three candidate bands. */
const REPORT_BANDS: ReadonlyArray<{ label: string; band: SimBand }> = [
  { label: 'flat', band: 'flat' },
  { label: '0.9–1.1', band: [0.9, 1.1] },
  { label: '0.8–1.25', band: [0.8, 1.25] },
  { label: '0.67–1.5', band: [0.67, 1.5] },
];

describe('runCoverSim (no-silence Task 2)', () => {
  it('one row with every field finite, shares inside 0-1, p10 <= mean <= p90, and stays counted with their lengths in order', () => {
    // The whole grid, but short. Since the rule (Task 12) no world goes silent, so the worst-world list is empty;
    // the stays are what this case exercises now: enough of them, of more than one length, to order.
    const [row] = runCoverSim({ measures: 300 });
    expect(row.worldsWithSilence).toBe(0);
    expect(row.worstWorlds).toEqual([]);
    expect(row.worldsWithStay).toBeGreaterThan(5);
    expect(row.stayLength.median).toBeLessThanOrEqual(row.stayLength.p90);
    expect(row.stayLength.p90).toBeLessThanOrEqual(row.stayLength.longest);
    expect(row.stayLength.longest).toBeGreaterThan(row.stayLength.median);
    expect(row.staysPer1000).toBeGreaterThan(0);
    expect(row.stayShare).toBeGreaterThan(0);
    expect(row.worlds).toBe(SIM_SEED_COORDS.length);
    expect(row.measures).toBe(300);
    const numbers = [
      row.silentShare, row.worldsWithSilence, row.worldsWithStay, row.staysPer1000, row.stayShare,
      row.stayLength.median, row.stayLength.p90, row.stayLength.longest,
      row.sounding.mean, row.sounding.p10, row.sounding.p90,
      row.cycles.shortest, row.cycles.longest, row.cycles.distinct,
      row.sharing.median, row.sharing.max, row.heardShare.lowest, row.heardShare.highest,
    ];
    for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
    for (const share of [row.silentShare, row.stayShare, row.heardShare.lowest, row.heardShare.highest]) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect(row.sounding.p10).toBeLessThanOrEqual(row.sounding.mean);
    expect(row.sounding.mean).toBeLessThanOrEqual(row.sounding.p90);
    expect(row.heardShare.lowest).toBeLessThanOrEqual(row.heardShare.highest);
    expect(row.cycles.shortest).toBeLessThanOrEqual(row.cycles.longest);
    expect(row.worldsWithSilence).toBeLessThanOrEqual(row.worlds);
    expect(row.worstWorlds.length).toBeLessThanOrEqual(5);
    expect(row.worstWorlds.length).toBe(Math.min(5, row.worldsWithSilence));
    const lengths = row.worstWorlds.map((w) => w.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });

  it('agrees with its own count, world by world: silent measures, stays, measures in a stay and robots sounding off the real step', () => {
    const SOUNDING = new Set<DockingState>([DockingState.Active, DockingState.Recalled]);
    let stayWorlds = 0;
    for (const { x, y } of SIM_SEED_COORDS) {
      const noiseMap = simNoiseMap(x, y);
      let roster = buildSimRoster(noiseMap);
      let silent = 0;
      let soundingTotal = 0;
      let stays = 0;
      let stayMeasures = 0;
      let inStay = new Set<string>();
      for (let measure = 1; measure <= 300; measure++) {
        roster = stepRobotLifecycle(roster, measure, noiseMap);
        const sounding = roster.filter((r) => SOUNDING.has(r.docking)).length;
        soundingTotal += sounding;
        if (sounding === 0) silent++;
        // A stay: a robot Active at or below critical after a tick; consecutive measures are one stay.
        const staying = new Set(roster.filter((r) => r.docking === DockingState.Active && r.batteryLevel <= BATTERY_CRITICAL_THRESHOLD).map((r) => r.id));
        for (const id of staying) if (!inStay.has(id)) stays++;
        if (staying.size > 0) stayMeasures++;
        inStay = staying;
      }
      const [row] = runCoverSim({ coords: [{ x, y }], measures: 300 });
      expect(row.silentShare * 300).toBeCloseTo(silent, 9);
      expect(row.worldsWithSilence).toBe(silent > 0 ? 1 : 0);
      expect(row.sounding.mean).toBeCloseTo(soundingTotal / 300, 9);
      expect((row.staysPer1000 * 300) / 1000).toBeCloseTo(stays, 9);
      expect(row.stayShare * 300).toBeCloseTo(stayMeasures, 9);
      expect(row.worldsWithStay).toBe(stays > 0 ? 1 : 0);
      if (stays > 0) stayWorlds++;
    }
    // Guard against a coincidental pass on all-zero counts: some of these worlds must hold a stay.
    expect(stayWorlds).toBeGreaterThan(0);
  }, 30_000);

  // The last Active robot stays up (no-silence Task 12, spec §5.1 case 17): the always-on grid pass.
  it('over the grid at SIM_MEASURES on the shipped band, no world has a silent measure (case 17)', () => {
    const [row] = runCoverSim();
    expect(row.measures).toBe(SIM_MEASURES);
    expect(row.worlds).toBe(SIM_SEED_COORDS.length);
    expect(row.worldsWithSilence).toBe(0);
    expect(row.silentShare).toBe(0);
  }, 60_000);

  it('pools the tally over worlds: staysPer1000 and the shares are per measure per world', () => {
    const [one] = runCoverSim({ coords: [FEW_COORDS[0]], measures: 300 });
    const [two] = runCoverSim({ coords: [FEW_COORDS[0], FEW_COORDS[0]], measures: 300 });
    expect(two.silentShare).toBeCloseTo(one.silentShare, 12);
    expect(two.staysPer1000).toBeCloseTo(one.staysPer1000, 12);
    expect(two.stayShare).toBeCloseTo(one.stayShare, 12);
    expect(two.sounding.mean).toBeCloseTo(one.sounding.mean, 12);
    expect(two.worldsWithSilence).toBe(2 * one.worldsWithSilence);
  });

  it('is deterministic — the same rows twice', () => {
    const rows = [{ label: 'flat', band: 'flat' as const }, { label: 'wide', band: [0.67, 1.5] as const }];
    expect(runCoverSim({ coords: FEW_COORDS, measures: 200, rows })).toEqual(runCoverSim({ coords: FEW_COORDS, measures: 200, rows }));
  });

  describe('rows on a band each (no-silence Task 9)', () => {
    const rows = [
      { label: 'flat', band: 'flat' as const },
      { label: '0.9-1.1', band: [0.9, 1.1] as const },
      { label: '0.67-1.5', band: [0.67, 1.5] as const },
    ];

    it('come back in the order asked, labelled, each built on its own band', () => {
      const result = runCoverSim({ coords: FEW_COORDS, measures: 300, rows });
      expect(result.map((r) => r.label)).toEqual(['flat', '0.9-1.1', '0.67-1.5']);
      rows.forEach((spec, i) => expect(result[i]).toEqual(runCoverSim({ coords: FEW_COORDS, measures: 300, rows: [spec] })[0]));
      expect(result[1]).not.toEqual({ ...result[2], label: result[1].label });
    });

    it('with no rows asked, one row labelled shipped on the shipped band', () => {
      const result = runCoverSim({ coords: FEW_COORDS, measures: 300 });
      expect(result).toHaveLength(1);
      const shipped = runCoverSim({ coords: FEW_COORDS, measures: 300, rows: [{ label: 'shipped', band: [BATTERY_SIZE_MIN, BATTERY_SIZE_MAX] }] });
      expect(result).toEqual(shipped);
    });

    it("the 'flat' row has one cycle length, every robot's 35 measures; a banded row has several", () => {
      const [flat, narrow, wide] = runCoverSim({ coords: FEW_COORDS, measures: 300, rows });
      expect(flat.cycles).toEqual({ shortest: 35, longest: 35, distinct: 1 });
      expect(narrow.cycles.distinct).toBeGreaterThan(1);
      expect(wide.cycles.distinct).toBeGreaterThan(narrow.cycles.distinct);
      expect(wide.cycles.shortest).toBeLessThan(35);
      expect(wide.cycles.longest).toBeGreaterThan(35);
    });
  });

  it('touches no store and no BeatClock', () => {
    const getState = vi.spyOn(useLocaleStore, 'getState');
    vi.mocked(subscribeToMeasure).mockClear();
    vi.mocked(getCurrentMeasure).mockClear();
    runCoverSim({ coords: FEW_COORDS, measures: 100 });
    expect(getState).not.toHaveBeenCalled();
    expect(subscribeToMeasure).not.toHaveBeenCalled();
    expect(getCurrentMeasure).not.toHaveBeenCalled();
  });

  it.runIf(!!process.env.LIFECYCLE_SIM_REPORT)(`the report: the full grid at ${COVER_REPORT_MEASURES} measures a world`, () => {
    const rows = runCoverSim({ measures: COVER_REPORT_MEASURES, rows: REPORT_BANDS });
    console.log(`\n${formatCoverReport(rows)}`);
  }, 300_000);
});

describe('formatCoverReport', () => {
  const row: CoverSimRow = {
    label: 'today',
    worlds: 121,
    measures: 6000,
    silentShare: 0.034,
    worldsWithSilence: 79,
    worldsWithStay: 0,
    staysPer1000: 0,
    stayLength: { median: 0, p90: 0, longest: 0 },
    stayShare: 0,
    sounding: { mean: 5.5, p10: 2, p90: 9 },
    cycles: { shortest: 35, longest: 35, distinct: 1 },
    sharing: { median: 12, max: 12 },
    heardShare: { lowest: 0.457, highest: 0.458 },
    worstWorlds: [
      { x: 40, y: -80, start: 31, length: 8 },
      { x: -200, y: 0, start: 12, length: 6 },
    ],
  };

  it('renders a header, a separator, one line per row, then each row\'s worst worlds longest first', () => {
    const lines = formatCoverReport([row, { ...row, label: 'size only', worstWorlds: [] }]).trim().split('\n');
    expect(lines[0]).toMatch(/^\| Row \| Silent measures \|/);
    expect(lines[1]).toMatch(/^\|[-| ]+\|$/);
    expect(lines[2]).toMatch(/^\| today \| 3\.40 % \| 79 \/ 121 \|/);
    expect(lines[3]).toMatch(/^\| size only \|/);
    const worst = lines.findIndex((l) => l === '| 40 | -80 | 31 | 8 |');
    const next = lines.findIndex((l) => l === '| -200 | 0 | 12 | 6 |');
    expect(worst).toBeGreaterThan(3);
    expect(next).toBe(worst + 1);
    expect(lines.some((l) => /size only/.test(l) && /no silence/.test(l))).toBe(true);
  });
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
  return { id, docking, batteryLevel: docking === DockingState.Active ? 100 : 50, melody: [], dockCycleCount: 0 };
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

    it('runs on the band it is given, and with none on the shipped one (no-silence Task 9)', () => {
      const candidates = COOLDOWN_CANDIDATES.slice(0, 1);
      const run = (band?: SimBand) => runReadinessSim({ worlds, seconds: 600, bpms: [200], candidates, band });
      const byDefault = run();
      expect(byDefault).toEqual(run([BATTERY_SIZE_MIN, BATTERY_SIZE_MAX]));
      // A different roster moves the loop: 'flat' and a wide band each differ from the shipped band and from each other.
      const flat = run('flat');
      const wide = run([0.67, 1.5]);
      expect(flat.seeds).not.toEqual(byDefault.seeds);
      expect(wide.seeds).not.toEqual(byDefault.seeds);
      expect(wide.seeds).not.toEqual(flat.seeds);
    }, 30_000);

    it('at 200 BPM the lifecycle docks a recalled robot sooner, so it is visible-while-Docked longer than at 20 BPM', () => {
      // Turn-backs are not compared: with recharge 5/measure the shortest Docked stay (~20 measures,
      // 24 s at 200 BPM) outlasts the longest walk home, so both tempos measure 0 (Task 15 report).
      const { rows } = runReadinessSim({ worlds, seconds: 600 });
      const at = (bpm: number) => rows.find((r) => r.bpm === bpm)!;
      expect(Number.isFinite(at(200).longestDockedVisible)).toBe(true);
      expect(at(200).longestDockedVisible).toBeGreaterThan(at(20).longestDockedVisible);
    }, 30_000);

    it('over the full grid at 20, 110 and 200 BPM for 10 minutes: zero robots charging while visible (the report is printed with LIFECYCLE_SIM_REPORT)', () => {
      const grid = SIM_SEED_COORDS.map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));
      const { rows, seeds } = runReadinessSim({ worlds: grid });
      for (const r of rows) expect(r.chargingWhileVisible).toBe(0);
      if (process.env.LIFECYCLE_SIM_REPORT) console.log(`\n${formatReadinessReport(rows, seeds)}`);
    }, 120_000);

    it.runIf(!!process.env.LIFECYCLE_SIM_REPORT)('the report: the full grid at 20, 110 and 200 BPM for 10 minutes on each band', () => {
      const grid = SIM_SEED_COORDS.map(({ x, y }) => ({ x, y, actors: placedWorld(x, y).actors }));
      const candidates = COOLDOWN_CANDIDATES.slice(0, 1);
      for (const { label, band } of REPORT_BANDS) {
        const { rows, seeds } = runReadinessSim({ worlds: grid, candidates, band });
        console.log(`\n### Band ${label}\n\n${formatReadinessReport(rows, seeds)}`);
      }
    }, 600_000);
  });

  describe('formatReadinessReport', () => {
    it('renders the overall table, then the worst seeds by waiting share', () => {
      const rows: ReadinessRow[] = [
        { label: 'c', bpm: 20, meanWaitingShare: 0.05, p95WaitingShare: 0.12, longestWait: 14, p95Wait: 6, switchesPerStint: 1.5, turnBacks: 0, chargingWhileVisible: 0, longestDockedVisible: 0 },
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
