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
  type LifecycleStep,
  type LoopSimEvent,
  type LoopSimOptions,
  type LoopSimResult,
  type LoopSimWorld,
  type ReadinessRow,
  type ReadinessSeedRow,
} from './lifecycleSim';
import { activeDrain, type RobotLifecycleSnapshot } from './robotSystems';
import { spawnInitialRoster } from './spawnSystem';
import { placeDistrict } from './districts';
import { getWorkSite } from './workSites';
import { isWorkSiteEligible } from './jobHosts';
import { deriveStations, hostObstacles, type Station } from './stations';
import { siteCooldown } from './siteChoice';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';
import { useLocaleStore } from '../stores/localeStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { DockingState, JobType } from '../types/Robot';
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

// ========================================
// LOOP SIM (Phase 43 Task 15 — readiness and handoff, spec §5.2)
// ========================================

const VENT = JobType.VentExtraction;
const SURVEY = JobType.AcousticSurvey;

/** A station stub. */
const station = (id: string, x: number, y: number, capacity = 6): Station => ({ id, center: { x, y }, port: { x, y }, capacity });

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
    expect(STATION_ARC_SECONDS).toBe(0.9);
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
      const workEnd = 1.9 + d; // exit 0.9 + swim 120 px / 120 px/s
      // Cooldown 3 > one retry, so two bobs before the site is ready again; the swim back is zero-length.
      expect(r0).toEqual([
        ['exiting', 0],
        ['transit', 0.9],
        ['working', 1.9],
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
      expect(firstWaitAt(20)).toBeCloseTo(1.9 + 10);
      expect(firstWaitAt(110)).toBeCloseTo(1.9 + 8);
      expect(firstWaitAt(200)).toBeCloseTo(1.9 + 6);
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
      expect(r1.slice(1, 3)).toEqual([['exiting', 3, undefined], ['transit', 3.9, 'a']]);
    });
  });

  describe('runLoopSim — recall and handoff', () => {
    const world: LoopSimWorld = { stations: [station('s0', 0, 0)], sites: [{ id: 'a', jobs: [VENT], park: { x: 120, y: 0 } }] };
    const d = jobDuration(ONE_SECOND_MEASURES);

    it('recalled mid-job: finishes the job, then returns, enters and is hidden — Docked while still visible is measured', () => {
      const step = scripted({ 3: { r0: DockingState.Recalled }, 4: { r0: DockingState.Docked } });
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], step });
      const workEnd = 1.9 + d;
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3), e.visible])).toEqual([
        ['exiting', 0, true],
        ['transit', 0.9, true],
        ['working', 1.9, true],
        ['returning', +workEnd.toFixed(3), true],
        ['entering', +(workEnd + 1).toFixed(3), true],
        ['charging', +(workEnd + 1 + STATION_ARC_SECONDS).toFixed(3), false],
      ]);
      expect(result.waitingSeconds).toBe(0);
      expect(result.turnBacks).toBe(0);
      expect(result.chargingWhileVisible).toBe(0);
      // Docked at t = 4, hidden at workEnd + 1.9.
      expect(result.longestDockedVisible).toBeCloseTo(workEnd + 1 + STATION_ARC_SECONDS - 4);
      expect(result.dockedVisibleSeconds).toBeCloseTo(result.longestDockedVisible);
    });

    it('recalled in transit: abandons the swim and returns from where it is', () => {
      const far: LoopSimWorld = { stations: world.stations, sites: [{ id: 'a', jobs: [VENT], park: { x: 1200, y: 0 } }] };
      const { trace } = runScenario({ world: far, roster: [snap('r0', DockingState.Active)], step: scripted({ 2: { r0: DockingState.Recalled } }) });
      // At t = 2 it is (2 − 0.9) × 120 = 132 px out; 1.1 s home.
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)])).toEqual([
        ['exiting', 0],
        ['transit', 0.9],
        ['returning', 2],
        ['entering', 3.1],
        ['charging', 4],
      ]);
    });

    it('recalled while waiting: stops waiting and returns now', () => {
      const { result, trace } = runScenario({ world: { stations: world.stations, sites: [] }, roster: [snap('r0', DockingState.Active)], step: scripted({ 3: { r0: DockingState.Recalled } }) });
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)])).toEqual([
        ['exiting', 0],
        ['waiting', 0.9],
        ['returning', 3],
        ['entering', 3],
        ['charging', 3.9],
      ]);
      expect(result.waits.map((w) => +w.toFixed(3))).toEqual([2.1]);
    });

    it('recalled while exiting: finishes the exit, then turns straight round', () => {
      const { trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], bpm: 480, step: scripted({ 1: { r0: DockingState.Recalled } }) });
      // 480 BPM → measure 1 at t = 0.5, mid-exit.
      expect(eventsOf(trace, 'r0').map((e) => [e.activity, +e.t.toFixed(3)]).slice(0, 3)).toEqual([
        ['exiting', 0],
        ['returning', 0.9],
        ['entering', 0.9],
      ]);
    });

    it('turn-back while returning: Active again before it gets home → back to work, never charging', () => {
      const mid: LoopSimWorld = { stations: world.stations, sites: [{ id: 'a', jobs: [VENT], park: { x: 240, y: 0 } }] };
      // Work 2.9 → 2.9 + d (d = 6: 8.9); recalled at 3 (finishes), returning 2 s (8.9 … 10.9); Active at 10 → turn-back mid-swim.
      const step = scripted({ 3: { r0: DockingState.Recalled }, 10: { r0: DockingState.Active } });
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
      // Work 1.9 → 1.9 + d; recalled at 3 (finishes); home 1 s; entering 2.9 + d … 3.8 + d (d = 6: 8.9 … 9.8).
      const step = scripted({ 3: { r0: DockingState.Recalled }, 9: { r0: DockingState.Active } });
      const { result, trace } = runScenario({ world, roster: [snap('r0', DockingState.Active)], step });
      const r0 = eventsOf(trace, 'r0');
      const entering = r0.findIndex((e) => e.activity === 'entering');
      expect(r0[entering].t).toBeLessThan(9);
      expect(r0[entering + 1].t).toBeCloseTo(9);
      expect(r0[entering + 1].activity).toBe('waiting'); // 'a' is still resting (cooldown 3 from 1.9 + d)
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
