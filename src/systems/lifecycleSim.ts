// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { DockingState, type JobType, type RobotActivity } from '../types/Robot';
import type { Actor } from '../types/Actor';
import type { Vec2 } from '../types/Vec2';
import { getSeededVal } from '../utils/getSeededVal';
import { generateRobotRosterBaseline } from './spawnSystem';
import { stepRobotLifecycle } from './robotSystems';
import type { DrainRule, RobotLifecycleSnapshot } from './robotSystems';
import { isWorkSiteEligible } from './jobHosts';
import { getWorkSite } from './workSites';
import { assignStationsAtLoad, deriveStations, hostObstacles, nearestFreeStation, type Station } from './stations';
import { chooseNextSite, heldJobs, siteCooldown } from './siteChoice';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import {
  MAX_ROBOTS,
  INITIAL_ACTIVE_ROBOTS_MIN,
  INITIAL_ACTIVE_ROBOTS_MAX,
  BACK_HOSTS_ENABLED,
  BEATS_PER_MEASURE,
  COOLDOWN_MAX,
  COOLDOWN_MIN,
  COOLDOWN_PER_SITE,
  STATION_ARC_SECONDS,
  SWIM_SPEED,
  WAIT_RETRY_SECONDS,
} from '../constants';

/**
 * Headless lifecycle sims (docs/specs/ROBOT_JOBS_AND_STATIONS.md §5.2). Pure: real seeded rosters,
 * the real stepRobotLifecycle, no store, no BeatClock, no GSAP.
 *
 * - Drain (Task 2): picked BATTERY_DRAIN_ACTIVE = 6 — its mean Active count (5.14) was closest to
 *   the retired per-job surcharge rule's (5.05) over the 121-seed grid × 2000 measures (commit
 *   5bbbff3f has the table).
 * - Loop (Task 15): the work loop's decisions (spec §1.7) in seconds against the lifecycle in
 *   measures at a given BPM — readiness (waiting, switches) and handoff (turn-backs, a robot
 *   charging while visible). Pins the COOLDOWN_* constants.
 */

// ========================================
// SEED GRID
// ========================================

const GRID_AXIS = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];

/** The districts tests' 121 real locale coordinates (src/systems/districts.test.ts). */
export const SIM_SEED_COORDS: ReadonlyArray<{ x: number; y: number }> = GRID_AXIS.flatMap((x) => GRID_AXIS.map((y) => ({ x, y })));

/** Measures per seed per candidate. */
export const SIM_MEASURES = 2000;

/** The noise map a live locale at (x, y) gets (noiseMaps.ts's getLocaleNoiseMap with no
 *  attenuation-style override) — built directly, so the sim never reads or fills that cache. */
export function simNoiseMap(x: number, y: number): NoiseFunction2D {
  return createNoise2D(alea(`${x}:${y}`));
}

// ========================================
// ROSTER
// ========================================

/**
 * The roster a fresh locale on this noise map starts with, as lifecycle snapshots: spawnInitialRoster's
 * seeded Active count and Docked batteries, with generateRobotRosterBaseline's note variance. Melody
 * is empty — it only feeds pitch drift, which never touches battery or docking.
 */
export function buildSimRoster(noiseMap: NoiseFunction2D): RobotLifecycleSnapshot[] {
  const activeCount = INITIAL_ACTIVE_ROBOTS_MIN + Math.floor(
    getSeededVal(noiseMap, 'roster.activeCount', 0, 0, INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1),
  );
  return generateRobotRosterBaseline(noiseMap, MAX_ROBOTS).map((b, i) => {
    const active = i < activeCount;
    return {
      id: `sim-${i}`,
      docking: active ? DockingState.Active : DockingState.Docked,
      batteryLevel: active ? 100 : Math.floor(getSeededVal(noiseMap, 'roster.dockedBattery', i, 0, 100)),
      melody: [],
      dockCycleCount: 0,
      noteVariance: b.noteVariance,
    };
  });
}

// ========================================
// DRAIN CANDIDATES
// ========================================

/** A drain rule that ignores the robot entirely. */
export function flatDrain(perMeasure: number): DrainRule {
  return () => perMeasure;
}

export interface DrainCandidate {
  label: string;
  drain: DrainRule;
}

/** The flat values Task 2 compared; flat 6 shipped as BATTERY_DRAIN_ACTIVE. */
export const DRAIN_CANDIDATES: readonly DrainCandidate[] = [
  { label: 'flat 5', drain: flatDrain(5) },
  { label: 'flat 6', drain: flatDrain(6) },
  { label: 'flat 7', drain: flatDrain(7) },
];

// ========================================
// SIMULATION
// ========================================

/** Active-robot count after each of measures 1..`measures` (stepRobotLifecycle, the step
 *  replayLifecycle loops over, run one measure at a time so every count is observed). */
export function activeCountsOverTime(roster: RobotLifecycleSnapshot[], noiseMap: NoiseFunction2D, drain: DrainRule, measures: number): number[] {
  const counts: number[] = [];
  let working = roster;
  for (let measure = 1; measure <= measures; measure++) {
    working = stepRobotLifecycle(working, measure, noiseMap, drain);
    counts.push(working.filter((r) => r.docking === DockingState.Active).length);
  }
  return counts;
}

/** Nearest-rank percentile (p in 0..100). Does not mutate `values`. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export interface DrainSimRow {
  label: string;
  /** Mean Active count over every (seed, measure) sample. */
  mean: number;
  p10: number;
  p90: number;
}

/** Runs every candidate over every seed, pooling the per-measure Active counts. */
export function runDrainSim(options: {
  coords?: ReadonlyArray<{ x: number; y: number }>;
  measures?: number;
  candidates?: readonly DrainCandidate[];
} = {}): DrainSimRow[] {
  const { coords = SIM_SEED_COORDS, measures = SIM_MEASURES, candidates = DRAIN_CANDIDATES } = options;
  const seeds = coords.map(({ x, y }) => {
    const noiseMap = simNoiseMap(x, y);
    return { noiseMap, roster: buildSimRoster(noiseMap) };
  });

  return candidates.map(({ label, drain }) => {
    const samples: number[] = [];
    for (const { noiseMap, roster } of seeds) {
      for (const n of activeCountsOverTime(roster, noiseMap, drain, measures)) samples.push(n);
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    return { label, mean, p10: percentile(samples, 10), p90: percentile(samples, 90) };
  });
}

/** A markdown table of the rows, for the stop-and-report and docs/ROBOT_LIFECYCLE.md. */
export function formatDrainReport(rows: readonly DrainSimRow[]): string {
  const lines = ['| Drain | Mean Active | p10 | p90 |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.label} | ${r.mean.toFixed(2)} | ${r.p10} | ${r.p90} |`);
  return lines.join('\n');
}

// ========================================
// LOOP SIM — WORLD AND ROSTER (Phase 43 Task 15)
// ========================================

/** Simulated seconds per seed (spec §5.2: 10 minutes). */
export const SIM_LOOP_SECONDS = 600;

/** The handoff tempos: the slowest and fastest measures the lifecycle runs at, and the midpoint (jobDuration 10 / 8 / 6 s). */
export const SIM_LOOP_BPMS: readonly number[] = [20, 110, 200];

/** A work site as the loop sees it. `id` is the actor's index — actor ids can repeat. */
export interface LoopSimSite {
  id: string;
  jobs: readonly JobType[];
  /** Robot centre while working. */
  park: Vec2;
}

export interface LoopSimWorld {
  sites: LoopSimSite[];
  stations: Station[];
}

/** A placed world's eligible work sites (getWorkSite) and its seeded stations (deriveStations). */
export function buildLoopWorld(actors: Actor[], noiseMap: NoiseFunction2D): LoopSimWorld {
  const sites: LoopSimSite[] = [];
  actors.forEach((actor, i) => {
    if (!isWorkSiteEligible(actor, { backHosts: BACK_HOSTS_ENABLED })) return;
    const site = getWorkSite(actor);
    if (site) sites.push({ id: `site-${i}`, jobs: site.jobs, park: site.park });
  });
  return { sites, stations: deriveStations(noiseMap, hostObstacles(actors)) };
}

// ========================================
// LOOP SIM — ONE WORLD
// ========================================

/** One lifecycle measure over the roster — stepRobotLifecycle in the grid sim; scripted in tests. */
export type LifecycleStep = (roster: RobotLifecycleSnapshot[], measure: number) => RobotLifecycleSnapshot[];

export interface LoopSimOptions {
  world: LoopSimWorld;
  roster: RobotLifecycleSnapshot[];
  bpm: number;
  seconds: number;
  /** chooseNextSite's uniform draw. */
  rand: () => number;
  step: LifecycleStep;
  /** A site's rest for n eligible sites. Default siteCooldown. */
  cooldown?: (eligibleSiteCount: number) => number;
  /** Called on every activity change. */
  trace?: (event: LoopSimEvent) => void;
}

export interface LoopSimEvent {
  t: number;
  robotId: string;
  activity: RobotActivity;
  visible: boolean;
  /** transit / working only. */
  siteId?: string;
  job?: JobType;
  /** charging / exiting / returning / entering only. */
  stationId?: string;
}

export interface LoopSimResult {
  /** Seconds robots spent out on shift: exiting, transit, working or waiting. */
  activeSeconds: number;
  waitingSeconds: number;
  /** Every unbroken wait, in seconds (back-to-back retries are one wait). */
  waits: number[];
  /** Station exits. */
  stints: number;
  /** Site choices whose job differs from the robot's previous one. */
  switches: number;
  /** Active again before the robot was in: mid-return, mid-entry, or at the end of entry. */
  turnBacks: number;
  /** Observations of a robot whose activity is 'charging' while it is visible. Must stay 0. */
  chargingWhileVisible: number;
  /** Seconds a robot was still visible while the lifecycle had it Docked or Undocking. */
  dockedVisibleSeconds: number;
  longestDockedVisible: number;
}

/** Activities that count as out on shift (they hold a job — plan correction 4). */
const ON_SHIFT: ReadonlySet<RobotActivity> = new Set<RobotActivity>(['exiting', 'transit', 'working', 'waiting']);

/** Activities that take a station slot (spec §1.6). */
const IN_STATION: ReadonlySet<RobotActivity> = new Set<RobotActivity>(['returning', 'entering', 'charging']);

interface SimRobot {
  id: string;
  activity: RobotActivity;
  visible: boolean;
  job?: JobType;
  siteId?: string;
  stationId: string;
  pos: Vec2;
  leg?: { from: Vec2; to: Vec2; start: number; end: number };
  /** When the current activity ends; Infinity while charging. */
  until: number;
  recallPending: boolean;
  /** When the current activity's time was last accounted. */
  since: number;
  waitStart?: number;
  dockedVisibleFrom?: number;
}

/**
 * The work loop (spec §1.7) run headless for one world: an event loop in seconds — station arcs,
 * swims at SWIM_SPEED, jobs of jobDuration, WAIT_RETRY_SECONDS bobs — interleaved with lifecycle
 * measures of BEATS_PER_MEASURE × 60 / bpm seconds. Lifecycle changes reach it the way the tick's
 * onLifecycleChange will: Active → Recalled is 'recalled', anything → Active is 'active'. Ties go to
 * the measure, then to roster order. Pure: no store, no BeatClock, no GSAP.
 */
export function runLoopSim(options: LoopSimOptions): LoopSimResult {
  const { world, roster, bpm, seconds, rand, step, cooldown = siteCooldown, trace } = options;
  const measureSeconds = (BEATS_PER_MEASURE * 60) / bpm;
  const rest = cooldown(world.sites.length);
  const siteState = new Map(world.sites.map((s) => [s.id, { heldBy: undefined as string | undefined, readyAt: 0 }]));
  const stationById = new Map(world.stations.map((s) => [s.id, s]));
  const assigned = assignStationsAtLoad(roster.map((r) => r.id), world.stations);

  const result: LoopSimResult = {
    activeSeconds: 0,
    waitingSeconds: 0,
    waits: [],
    stints: 0,
    switches: 0,
    turnBacks: 0,
    chargingWhileVisible: 0,
    dockedVisibleSeconds: 0,
    longestDockedVisible: 0,
  };

  let lifecycle = roster;
  const robots: SimRobot[] = roster.map((r) => ({
    id: r.id,
    activity: 'charging',
    visible: false,
    stationId: assigned[r.id],
    pos: { ...stationById.get(assigned[r.id])!.port },
    until: Infinity,
    recallPending: false,
    since: 0,
  }));
  const docking = (r: SimRobot) => lifecycle[robots.indexOf(r)].docking;

  // ---- bookkeeping ----

  const emit = (r: SimRobot, t: number) => {
    if (!trace) return;
    const event: LoopSimEvent = { t, robotId: r.id, activity: r.activity, visible: r.visible };
    if (r.activity === 'transit' || r.activity === 'working') {
      event.siteId = r.siteId;
      event.job = r.job;
    } else if (r.activity !== 'waiting') {
      event.stationId = r.stationId;
    }
    trace(event);
  };

  const account = (r: SimRobot, t: number) => {
    const dt = t - r.since;
    if (ON_SHIFT.has(r.activity)) result.activeSeconds += dt;
    if (r.activity === 'waiting') result.waitingSeconds += dt;
    r.since = t;
  };

  const setActivity = (r: SimRobot, activity: RobotActivity, t: number) => {
    account(r, t);
    if (r.activity === 'waiting' && activity !== 'waiting') result.waits.push(t - r.waitStart!);
    if (activity === 'waiting' && r.activity !== 'waiting') r.waitStart = t;
    const changed = r.activity !== activity;
    r.activity = activity;
    if (changed) emit(r, t);
  };

  const closeDockedVisible = (r: SimRobot, t: number) => {
    const span = t - r.dockedVisibleFrom!;
    result.dockedVisibleSeconds += span;
    result.longestDockedVisible = Math.max(result.longestDockedVisible, span);
    r.dockedVisibleFrom = undefined;
  };

  /** After every event or measure: the invariant, and how long the visuals lag a Docked robot. */
  const observe = (t: number) => {
    robots.forEach((r, i) => {
      if (r.activity === 'charging' && r.visible) result.chargingWhileVisible++;
      const d = lifecycle[i].docking;
      const lagging = r.visible && (d === DockingState.Docked || d === DockingState.Undocking);
      if (lagging && r.dockedVisibleFrom === undefined) r.dockedVisibleFrom = t;
      else if (!lagging && r.dockedVisibleFrom !== undefined) closeDockedVisible(r, t);
    });
  };

  // ---- motion ----

  const posAt = (r: SimRobot, t: number): Vec2 => {
    const leg = r.leg;
    if (!leg) return r.pos;
    const k = leg.end > leg.start ? Math.min(1, (t - leg.start) / (leg.end - leg.start)) : 1;
    return { x: leg.from.x + (leg.to.x - leg.from.x) * k, y: leg.from.y + (leg.to.y - leg.from.y) * k };
  };

  /** Kill the swim where it is. */
  const stopAt = (r: SimRobot, t: number) => {
    r.pos = posAt(r, t);
    r.leg = undefined;
  };

  const swimTo = (r: SimRobot, to: Vec2, t: number) => {
    const end = t + Math.hypot(to.x - r.pos.x, to.y - r.pos.y) / SWIM_SPEED;
    r.leg = { from: r.pos, to: { ...to }, start: t, end };
    r.until = end;
  };

  const land = (r: SimRobot) => {
    r.pos = r.leg!.to;
    r.leg = undefined;
  };

  // ---- the loop (spec §1.7) ----

  const releaseSite = (r: SimRobot, t: number, withCooldown: boolean) => {
    if (!r.siteId) return;
    const s = siteState.get(r.siteId)!;
    if (s.heldBy === r.id) {
      s.heldBy = undefined;
      if (withCooldown) s.readyAt = t + rest;
    }
    r.siteId = undefined;
  };

  const exitStation = (r: SimRobot, t: number) => {
    r.pos = { ...stationById.get(r.stationId)!.port };
    r.visible = true;
    result.stints++;
    setActivity(r, 'exiting', t);
    r.until = t + STATION_ARC_SECONDS;
  };

  const returnToStation = (r: SimRobot, t: number) => {
    r.recallPending = false;
    const occupancy: Record<string, number> = {};
    for (const o of robots) if (IN_STATION.has(o.activity)) occupancy[o.stationId] = (occupancy[o.stationId] ?? 0) + 1;
    const target = nearestFreeStation(r.pos, world.stations, occupancy) ?? stationById.get(r.stationId)!;
    r.stationId = target.id;
    swimTo(r, target.port, t);
    setActivity(r, 'returning', t);
  };

  const next = (r: SimRobot, t: number) => {
    if (r.recallPending || docking(r) !== DockingState.Active) {
      returnToStation(r, t);
      return;
    }
    const sites = world.sites.map((s) => {
      const st = siteState.get(s.id)!;
      return { ...s, ready: st.heldBy === undefined && t >= st.readyAt };
    });
    const held = heldJobs(
      robots.map((o, i) => ({ id: o.id, docking: lifecycle[i].docking, job: o.job, activity: o.activity })),
      r.id,
    );
    const choice = chooseNextSite({ robot: { id: r.id, job: r.job, centre: r.pos }, sites, heldJobs: held, rand });
    if (!choice) {
      setActivity(r, 'waiting', t);
      r.until = t + WAIT_RETRY_SECONDS;
      return;
    }
    if (r.job && choice.job !== r.job) result.switches++;
    r.job = choice.job;
    r.siteId = choice.siteId;
    siteState.get(choice.siteId)!.heldBy = r.id;
    swimTo(r, world.sites.find((s) => s.id === choice.siteId)!.park, t);
    setActivity(r, 'transit', t);
  };

  /** The current activity ran out. */
  const finish = (r: SimRobot, t: number) => {
    r.until = Infinity;
    switch (r.activity) {
      case 'exiting':
      case 'waiting':
        next(r, t);
        break;
      case 'transit':
        land(r);
        setActivity(r, 'working', t);
        r.until = t + jobDuration(bpm);
        break;
      case 'working':
        releaseSite(r, t, true);
        next(r, t);
        break;
      case 'returning':
        land(r);
        setActivity(r, 'entering', t);
        r.until = t + STATION_ARC_SECONDS;
        break;
      case 'entering':
        r.visible = false;
        setActivity(r, 'charging', t);
        if (docking(r) === DockingState.Active) {
          result.turnBacks++;
          exitStation(r, t);
        }
        break;
      case 'charging':
        break;
    }
  };

  const onRecalled = (r: SimRobot, t: number) => {
    r.recallPending = true;
    if (r.activity === 'transit') {
      stopAt(r, t);
      releaseSite(r, t, false);
      returnToStation(r, t);
    } else if (r.activity === 'waiting') {
      returnToStation(r, t);
    }
    // working: the job finishes, then next() sees the flag. exiting: the arc ends, then the same.
  };

  const onActive = (r: SimRobot, t: number) => {
    if (r.activity === 'charging') {
      exitStation(r, t);
    } else if (r.activity === 'returning' || r.activity === 'entering') {
      result.turnBacks++;
      stopAt(r, t);
      r.recallPending = false;
      r.until = Infinity;
      next(r, t);
    }
  };

  // ---- run ----

  robots.forEach((r, i) => {
    if (lifecycle[i].docking === DockingState.Active) exitStation(r, 0);
    else emit(r, 0);
  });
  observe(0);

  let measure = 1;
  for (;;) {
    let due: SimRobot | null = null;
    for (const r of robots) if (r.until < (due?.until ?? Infinity)) due = r;
    const nextMeasureAt = measure * measureSeconds;
    if (nextMeasureAt <= seconds && nextMeasureAt <= (due?.until ?? Infinity)) {
      const before = lifecycle;
      lifecycle = step(lifecycle, measure);
      robots.forEach((r, i) => {
        const was = before[i].docking;
        const now = lifecycle[i].docking;
        if (was === DockingState.Active && now === DockingState.Recalled) onRecalled(r, nextMeasureAt);
        else if (was !== DockingState.Active && now === DockingState.Active) onActive(r, nextMeasureAt);
      });
      observe(nextMeasureAt);
      measure++;
      continue;
    }
    if (!due || due.until > seconds) break;
    const t = due.until; // finish() reschedules `until`
    finish(due, t);
    observe(t);
  }

  for (const r of robots) {
    account(r, seconds);
    if (r.activity === 'waiting') result.waits.push(seconds - r.waitStart!);
    if (r.dockedVisibleFrom !== undefined) closeDockedVisible(r, seconds);
  }
  return result;
}

// ========================================
// LOOP SIM — THE GRID
// ========================================

export interface CooldownCandidate {
  label: string;
  cooldown: (eligibleSiteCount: number) => number;
}

/** siteCooldown's clamp with other constants, labelled per/min/max. */
export function clampedCooldown(perSite: number, min: number, max: number): CooldownCandidate {
  return { label: `${perSite}/${min}/${max}`, cooldown: (n) => Math.min(Math.max(n * perSite, min), max) };
}

/**
 * The shipped siteCooldown (0.4/3/30, Crawford's pick) first, then the 0.6/4/30 first guess and
 * shorter rests for comparison. `0/0/0` (no rest) is a reference, not a candidate: robots camp on
 * one site forever.
 */
export const COOLDOWN_CANDIDATES: readonly CooldownCandidate[] = [
  { label: `${COOLDOWN_PER_SITE}/${COOLDOWN_MIN}/${COOLDOWN_MAX}`, cooldown: siteCooldown },
  clampedCooldown(0.6, 4, 30),
  clampedCooldown(0.3, 2, 30),
  clampedCooldown(0.2, 2, 30),
  clampedCooldown(0, 0, 0),
];

export interface ReadinessRow {
  label: string;
  bpm: number;
  /** Mean over seeds of waiting ÷ active time. */
  meanWaitingShare: number;
  p95WaitingShare: number;
  /** Longest unbroken wait anywhere, seconds. */
  longestWait: number;
  p95Wait: number;
  switchesPerStint: number;
  turnBacks: number;
  chargingWhileVisible: number;
  longestDockedVisible: number;
}

export interface ReadinessSeedRow {
  label: string;
  bpm: number;
  x: number;
  y: number;
  sites: number;
  waitingShare: number;
  longestWait: number;
  switchesPerStint: number;
  turnBacks: number;
}

/**
 * Every candidate × tempo over every placed world, `seconds` each, on the real roster, lifecycle,
 * sites and stations. Each world's rand is seeded by coordinates and tempo, so candidates are
 * compared on the same draws. Store-free once the worlds are placed.
 */
export function runReadinessSim(options: {
  worlds: ReadonlyArray<{ x: number; y: number; actors: Actor[] }>;
  seconds?: number;
  bpms?: readonly number[];
  candidates?: readonly CooldownCandidate[];
}): { rows: ReadinessRow[]; seeds: ReadinessSeedRow[] } {
  const { worlds, seconds = SIM_LOOP_SECONDS, bpms = SIM_LOOP_BPMS, candidates = COOLDOWN_CANDIDATES } = options;
  const prepared = worlds.map(({ x, y, actors }) => {
    const noiseMap = simNoiseMap(x, y);
    return { x, y, noiseMap, world: buildLoopWorld(actors, noiseMap), roster: buildSimRoster(noiseMap) };
  });

  const rows: ReadinessRow[] = [];
  const seeds: ReadinessSeedRow[] = [];
  for (const { label, cooldown } of candidates) {
    for (const bpm of bpms) {
      const shares: number[] = [];
      const waits: number[] = [];
      let switches = 0;
      let stints = 0;
      let turnBacks = 0;
      let chargingWhileVisible = 0;
      let longestDockedVisible = 0;
      for (const w of prepared) {
        const r = runLoopSim({
          world: w.world,
          roster: w.roster,
          bpm,
          seconds,
          rand: alea(`loop-sim:${w.x}:${w.y}:${bpm}`),
          step: (roster, measure) => stepRobotLifecycle(roster, measure, w.noiseMap),
          cooldown,
        });
        const share = r.activeSeconds > 0 ? r.waitingSeconds / r.activeSeconds : 0;
        shares.push(share);
        waits.push(...r.waits);
        switches += r.switches;
        stints += r.stints;
        turnBacks += r.turnBacks;
        chargingWhileVisible += r.chargingWhileVisible;
        longestDockedVisible = Math.max(longestDockedVisible, r.longestDockedVisible);
        seeds.push({
          label,
          bpm,
          x: w.x,
          y: w.y,
          sites: w.world.sites.length,
          waitingShare: share,
          longestWait: Math.max(0, ...r.waits),
          switchesPerStint: r.stints > 0 ? r.switches / r.stints : 0,
          turnBacks: r.turnBacks,
        });
      }
      rows.push({
        label,
        bpm,
        meanWaitingShare: shares.length > 0 ? shares.reduce((s, v) => s + v, 0) / shares.length : 0,
        p95WaitingShare: shares.length > 0 ? percentile(shares, 95) : 0,
        longestWait: Math.max(0, ...waits),
        p95Wait: waits.length > 0 ? percentile(waits, 95) : 0,
        switchesPerStint: stints > 0 ? switches / stints : 0,
        turnBacks,
        chargingWhileVisible,
        longestDockedVisible,
      });
    }
  }
  return { rows, seeds };
}

/** Seeds listed per candidate × tempo in the report. */
const WORST_SEEDS_LISTED = 10;

/** Spec §5.2's targets: mean waiting under 10 % of active time, no wait over 15 s. */
const TARGET_WAITING_SHARE = 0.1;
const TARGET_LONGEST_WAIT = 15;

/** The overall table, then per candidate × tempo the seeds that miss a target and the worst ones. */
export function formatReadinessReport(rows: readonly ReadinessRow[], seeds: readonly ReadinessSeedRow[]): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
  const sec = (v: number) => `${v.toFixed(1)} s`;
  const lines = [
    '| Cooldown | BPM | Mean waiting | p95 waiting | Longest wait | p95 wait | Switches / stint | Turn-backs | Charging visible | Longest Docked visible |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.label} | ${r.bpm} | ${pct(r.meanWaitingShare)} | ${pct(r.p95WaitingShare)} | ${sec(r.longestWait)} | ${sec(r.p95Wait)} | ${r.switchesPerStint.toFixed(2)} | ${r.turnBacks} | ${r.chargingWhileVisible} | ${sec(r.longestDockedVisible)} |`,
    );
  }
  for (const r of rows) {
    const group = seeds.filter((s) => s.label === r.label && s.bpm === r.bpm);
    const missing = group.filter((s) => s.waitingShare >= TARGET_WAITING_SHARE || s.longestWait > TARGET_LONGEST_WAIT).length;
    lines.push('', `${r.label} at ${r.bpm} BPM — seeds missing a target: ${missing} / ${group.length}. Worst by waiting:`, '');
    lines.push('| Cooldown | BPM | x | y | Sites | Waiting | Longest wait | Switches / stint | Turn-backs |', '|---|---|---|---|---|---|---|---|---|');
    for (const s of [...group].sort((a, b) => b.waitingShare - a.waitingShare).slice(0, WORST_SEEDS_LISTED)) {
      lines.push(`| ${s.label} | ${s.bpm} | ${s.x} | ${s.y} | ${s.sites} | ${pct(s.waitingShare)} | ${sec(s.longestWait)} | ${s.switchesPerStint.toFixed(2)} | ${s.turnBacks} |`);
    }
  }
  return lines.join('\n');
}
