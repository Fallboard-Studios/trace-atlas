// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';

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
} from './lifecycleSim';
import { activeDrain } from './robotSystems';
import { spawnInitialRoster } from './spawnSystem';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { useLocaleStore } from '../stores/localeStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { DockingState } from '../types/Robot';
import { MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX } from '../constants';

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
    currentMeasure: 0,
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
      expect(sim.map((s) => ({ docking: s.docking, batteryLevel: s.batteryLevel, noteVariance: s.noteVariance }))).toEqual(
        real.map((r) => ({ docking: r.docking, batteryLevel: r.batteryLevel, noteVariance: r.noteVariance })),
      );

      // Guard against a coincidental pass on defaults: this seed must actually vary.
      expect(new Set(real.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel)).size).toBeGreaterThan(1);
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
    it('returns one Active count per measure, never zero (the never-zero-Active invariant) and never above the roster', () => {
      const noiseMap = simNoiseMap(-40, 80);
      const counts = activeCountsOverTime(buildSimRoster(noiseMap), noiseMap, flatDrain(6), 300);
      expect(counts).toHaveLength(300);
      for (const n of counts) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(MAX_ROBOTS);
      }
    });

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

    it('over the full grid and 2000 measures, reports every candidate — flat 6 reproduces Task 2\'s 5.14 mean Active', () => {
      const rows = runDrainSim();
      expect(rows.map((r) => r.label)).toEqual(['flat 5', 'flat 6', 'flat 7']);
      for (const r of rows) expect(Number.isFinite(r.mean)).toBe(true);
      // Flat drains are ordered: more drain, fewer robots out.
      expect(rows[0].mean).toBeGreaterThan(rows[1].mean);
      expect(rows[1].mean).toBeGreaterThan(rows[2].mean);
      // Narrowing the snapshot (no job, no scoring fields) must not move the flat numbers Crawford
      // chose from (commit 5bbbff3f: flat 5 5.70, flat 6 5.14, flat 7 4.60).
      expect(rows.map((r) => r.mean.toFixed(2))).toEqual(['5.70', '5.14', '4.60']);
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
