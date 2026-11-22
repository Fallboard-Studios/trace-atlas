// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { DockingState, type JobType, type RobotActivity } from '../types/Robot';
import type { Actor } from '../types/Actor';
import type { Vec2 } from '../types/Vec2';
import { generateRosterStart } from './spawnSystem';
import { stepShiftLifecycle } from './robotSystems';
import type { RobotLifecycleSnapshot, ShiftLifecycleSnapshot } from './robotSystems';
import { groupIdOf, groupJourneyKey, type ShiftEnv } from './shiftPlan';
import { journeyTurns } from '../engine/melodyJourney';
import { isWorkSiteEligible } from './jobHosts';
import { getWorkSite } from './workSites';
import { assignStationsAtLoad, deriveStations, hostObstacles, nearestFreeStation, type Station } from './stations';
import { chooseNextSite, heldJobs, siteCooldown } from './siteChoice';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import {
  BACK_HOSTS_ENABLED,
  BEATS_PER_MEASURE,
  COOLDOWN_MAX,
  COOLDOWN_MIN,
  COOLDOWN_PER_SITE,
  STATION_ARC_SECONDS,
  SWIM_SPEED,
  WAIT_RETRY_SECONDS,
  BATTERY_CRITICAL_THRESHOLD,
} from '../constants';

/**
 * Headless lifecycle sims (docs/specs/ROBOT_JOBS_AND_STATIONS.md §5.2). Pure: real seeded rosters,
 * the real stepShiftLifecycle, no store, no BeatClock, no GSAP.
 *
 * - Shift cover (roadmap 94 Task 17): silence, groups and turns over the grid at a tempo.
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
 * The roster a fresh locale on this noise map starts with under the shift plan (roadmap 94 Task 15, spec §1.13):
 * generateRosterStart's start at `env`'s tempo and world from measure 0, as snapshots for stepShiftLifecycle.
 */
export function buildShiftSimRoster(noiseMap: NoiseFunction2D, env: ShiftEnv): ShiftLifecycleSnapshot[] {
  return generateRosterStart(noiseMap, { ...env, startMeasure: 0 }).map((start, i) => ({ id: `sim-${i}`, ...start }));
}

// ========================================
// SIMULATION
// ========================================

/** Nearest-rank percentile (p in 0..100). Does not mutate `values`. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of an empty list');
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

// ========================================
// COVER TALLY (no-silence Task 1)
// ========================================

/** What the cover tally reads off a roster — nothing else. */
export type CoverSnapshot = Pick<RobotLifecycleSnapshot, 'id' | 'docking' | 'batteryLevel'>;

export interface CoverTallyRobot {
  id: string;
  /** Measures on which the robot became Active (it was not Active the measure before). */
  landings: number[];
  /** The commonest gap between landings, the shorter on a tie; undefined with fewer than two landings. */
  cycle?: number;
  /** Measures sounding (Active or Recalled) over measures observed; 0 when none were. */
  heardShare: number;
}

export interface CoverTallyResult {
  measures: number;
  /** soundingHistogram[n]: the measures after which n robots were sounding. */
  soundingHistogram: number[];
  silentMeasures: number;
  /** Every stay's length in measures, in the order they ended; one still open at the end counts at its length so far. */
  stays: number[];
  /** Measures after which at least one robot was in a stay. */
  stayMeasures: number;
  /** In start-roster order. */
  robots: CoverTallyRobot[];
}

export interface CoverTally {
  /** One post-tick roster: measure 1 first, then 2, and so on. */
  observe(roster: readonly CoverSnapshot[]): void;
  result(): CoverTallyResult;
}

/** Spec §1.1: a robot is sounding while Active or Recalled. Since backlog 84 a Docked robot still on its way home also
 *  sounds (the silence begins at 'charging'), and this docking-only sim cannot see that, so it under-counts sounding
 *  robots: its "never silent" result is a floor and still holds (docs/specs/PLAY_UNTIL_IN_THE_STATION.md §7.1 A6). */
const isSounding = (r: CoverSnapshot) => r.docking === DockingState.Active || r.docking === DockingState.Recalled;

/** Spec §1.1: a stay is a robot still Active at or below critical after a tick. */
const isStaying = (r: CoverSnapshot) => r.docking === DockingState.Active && r.batteryLevel <= BATTERY_CRITICAL_THRESHOLD;

/** The commonest value, the smaller on a tie; undefined for an empty list. */
function commonest(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  for (const [v, n] of counts) {
    const bestCount = best === undefined ? 0 : counts.get(best)!;
    if (n > bestCount || (n === bestCount && v < best!)) best = v;
  }
  return best;
}

/**
 * The cover sim's accumulator (spec §1.5): fed one post-tick roster per measure, it counts silent
 * measures, stays, robots sounding and each robot's landings on Active. Seeded with the starting
 * roster so the first measure's landings are known. Reads id, docking and battery only; keeps its own
 * copies, so the rosters it is handed are never touched.
 */
export function createCoverTally(
  startRoster: readonly CoverSnapshot[],
  /** What counts as a stay; the battery rule (Active at or under critical) unless handed another (the shift step's:
   *  Active with no exit turn, roadmap 94). */
  staying: (r: CoverSnapshot) => boolean = isStaying,
): CoverTally {
  let measures = 0;
  const soundingHistogram: number[] = [];
  let silentMeasures = 0;
  const stays: number[] = [];
  let stayMeasures = 0;
  const robots = new Map(
    startRoster.map((r) => [r.id, { wasActive: r.docking === DockingState.Active, landings: [] as number[], sounding: 0, stay: 0 }]),
  );

  return {
    observe(roster) {
      measures++;
      let sounding = 0;
      let anyStaying = false;
      for (const r of roster) {
        let robot = robots.get(r.id);
        if (!robot) {
          robot = { wasActive: false, landings: [], sounding: 0, stay: 0 };
          robots.set(r.id, robot);
        }
        const active = r.docking === DockingState.Active;
        if (active && !robot.wasActive) robot.landings.push(measures);
        robot.wasActive = active;
        if (isSounding(r)) {
          sounding++;
          robot.sounding++;
        }
        if (staying(r)) {
          robot.stay++;
          anyStaying = true;
        } else if (robot.stay > 0) {
          stays.push(robot.stay);
          robot.stay = 0;
        }
      }
      while (soundingHistogram.length <= sounding) soundingHistogram.push(0);
      soundingHistogram[sounding]++;
      if (anyStaying) stayMeasures++;
      if (sounding === 0) silentMeasures++;
    },

    result() {
      // Read open stays without closing them, so result() can be called again.
      const openStays = [...robots.values()].filter((r) => r.stay > 0).map((r) => r.stay);
      return {
        measures,
        soundingHistogram: [...soundingHistogram],
        silentMeasures,
        stays: [...stays, ...openStays],
        stayMeasures,
        robots: [...robots].map(([id, r]) => {
          const gaps = r.landings.slice(1).map((m, i) => m - r.landings[i]);
          return { id, landings: [...r.landings], cycle: commonest(gaps), heardShare: measures > 0 ? r.sounding / measures : 0 };
        }),
      };
    },
  };
}

// ========================================
// GROUP TALLY (roadmap 94 Task 16, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §5.3)
// ========================================

/** What the group tally reads off a roster: id, docking and the group. */
export type GroupSnapshot = Pick<ShiftLifecycleSnapshot, 'id' | 'docking' | 'companyId'>;

/** Whether `measure` is a turning measure of `robot`'s group's journey. */
export type TurnReader = (robot: Pick<GroupSnapshot, 'companyId'>, measure: number) => boolean;

export interface GroupTallyResult {
  /** Measures, summed over companies, with any member sounding (Active or Recalled). */
  companySounding: number;
  /** Of those, the measures with not every member sounding. */
  companyApart: number;
  /** A company going from out (any member sounding) to home (none). */
  companyExits: number;
  /** Of those, the ones whose members all docked on one measure. */
  groupExits: number;
  /** Every robot docking from out. */
  exits: number;
  /** Of those, the ones whose exit turn, the bar before the landing, is a turning measure of the group's journey. */
  exitsOnTurn: number;
  /** Every group coming out (its first member sounding after none was). */
  entrances: number;
  /** Of those, the ones landing on a turning measure. */
  entrancesOnTurn: number;
  /** Every group span out, from coming out to the measure it is all home, in bars; spans begun before the start are
   *  not counted, nor one still open at the end. */
  timesOut: number[];
  /** Every group span home, from all home to coming out again, in bars; counted as timesOut is. */
  timesHome: number[];
}

export interface GroupTally {
  /** One post-tick roster: measure 1 first, then 2, and so on. */
  observe(roster: readonly GroupSnapshot[]): void;
  result(): GroupTallyResult;
}

const isOutDocking = (d: DockingState) => d === DockingState.Active || d === DockingState.Recalled;

/**
 * The group tally (spec §5.3), beside the cover tally: fed one post-tick roster per measure and a turn reader, it
 * counts each company's apart share and group exits, each exit's and group entrance's landing on a turn, and every
 * group's spans out and home. A group is a company (`companyId`) or one robot alone. Reads id, docking and the group
 * only, so it runs on either step; keeps its own state, so the rosters it is handed are never touched.
 */
export function createGroupTally(startRoster: readonly GroupSnapshot[], isTurn: TurnReader): GroupTally {
  const groupOf = (r: GroupSnapshot) => r.companyId ?? r.id;
  let measure = 0;
  const wasOut = new Map(startRoster.map((r) => [r.id, isOutDocking(r.docking)]));
  /** Per group: out now, the measure its current span began (undefined if before the start), the first member docking
   *  in its current span out. */
  const groups = new Map<string, { out: boolean; since?: number; firstDock?: number }>();
  for (const r of startRoster) {
    const g = groups.get(groupOf(r)) ?? { out: false };
    g.out = g.out || isOutDocking(r.docking);
    groups.set(groupOf(r), g);
  }
  const totals = {
    companySounding: 0,
    companyApart: 0,
    companyExits: 0,
    groupExits: 0,
    exits: 0,
    exitsOnTurn: 0,
    entrances: 0,
    entrancesOnTurn: 0,
  };
  const timesOut: number[] = [];
  const timesHome: number[] = [];

  return {
    observe(roster) {
      measure++;
      const members = new Map<string, GroupSnapshot[]>();
      for (const r of roster) {
        const list = members.get(groupOf(r)) ?? [];
        list.push(r);
        members.set(groupOf(r), list);
        const out = isOutDocking(r.docking);
        if (wasOut.get(r.id) && !out) {
          totals.exits++;
          if (isTurn(r, measure - 1)) totals.exitsOnTurn++;
          const g = groups.get(groupOf(r));
          if (g && g.firstDock === undefined) g.firstDock = measure;
        }
        wasOut.set(r.id, out);
      }
      for (const [id, list] of members) {
        const g = groups.get(id) ?? { out: false };
        groups.set(id, g);
        const sounding = list.filter((r) => isOutDocking(r.docking)).length;
        const out = sounding > 0;
        if (list[0].companyId !== undefined && out) {
          totals.companySounding++;
          if (sounding < list.length) totals.companyApart++;
        }
        if (out && !g.out) {
          totals.entrances++;
          if (isTurn(list[0], measure)) totals.entrancesOnTurn++;
          if (g.since !== undefined) timesHome.push(measure - g.since);
          g.since = measure;
          g.firstDock = undefined;
        } else if (!out && g.out) {
          if (list[0].companyId !== undefined) {
            totals.companyExits++;
            if (g.firstDock === undefined || g.firstDock === measure) totals.groupExits++;
          }
          if (g.since !== undefined) timesOut.push(measure - g.since);
          g.since = measure;
          g.firstDock = undefined;
        }
        g.out = out;
      }
    },

    result() {
      return { ...totals, timesOut: [...timesOut], timesHome: [...timesHome] };
    },
  };
}

// ========================================
// THE SHIFT COVER SIM (roadmap 94 Task 17, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §5.3)
// ========================================

/** Median, p90 and longest of a list, all 0 for an empty one. */
export interface Spread {
  median: number;
  p90: number;
  longest: number;
}

export interface ShiftCoverRow {
  bpm: number;
  worlds: number;
  /** Per world. */
  measures: number;
  /** Silent measures over every (world, measure). */
  silentShare: number;
  worldsWithSilence: number;
  /** Robots sounding (Active or Recalled) over every (world, measure). */
  sounding: { mean: number; p10: number; p90: number };
  /** Of the measures a company has any member sounding, the share where not all do. */
  apartShare: number;
  companyExits: number;
  /** Company exits where every member docked on one measure, over all company exits. */
  groupExitShare: number;
  exits: number;
  /** Robot exits whose exit turn (the bar before the landing) is a turn of the group's journey. */
  exitsOnTurnShare: number;
  entrances: number;
  /** Group entrances (the first member out) landing on a turn of the group's journey. */
  entrancesOnTurnShare: number;
  /** Distinct exit turns written that are no turn of the group's journey. */
  plannedOffTurn: number;
  /** Group spans out and home, in bars and in seconds at the row's tempo. */
  timeOut: Spread;
  timeHome: Spread;
  timeOutSeconds: Spread;
  timeHomeSeconds: Spread;
  /** Stays per 1,000 measures per world, and their lengths in measures: an Active robot with no exit turn. */
  staysPer1000: number;
  stayLength: Spread;
  /** Each robot's heard share, lowest and highest across the grid. */
  heardShare: { lowest: number; highest: number };
}

/** The shift step's stay (spec §1.9): Active with no exit turn. */
const isShiftStaying = (r: CoverSnapshot & { exitsAtMeasure?: number }) => r.docking === DockingState.Active && r.exitsAtMeasure === undefined;

/** Whether `measure` is a turn of `robot`'s group's journey in `worldKey`. */
const turnReaderFor =
  (worldKey: string): TurnReader =>
  (robot, measure) =>
    journeyTurns(groupJourneyKey(worldKey, robot), measure, measure).length === 1;

/**
 * The cover sim on the shift step at each tempo (spec §5.3): every world's roster stepped `measures` times, fed to a
 * cover tally and a group tally, pooled into one row per tempo. Pure: no store, no BeatClock.
 */
export function runShiftCoverSim(options: {
  coords?: ReadonlyArray<{ x: number; y: number }>;
  measures?: number;
  bpms?: readonly number[];
} = {}): ShiftCoverRow[] {
  const { coords = SIM_SEED_COORDS, measures = SIM_MEASURES, bpms = [60] } = options;
  return bpms.map((bpm) => shiftCoverRow(coords, measures, bpm));
}

/** A row's two spans in seconds at its own tempo. */
function withSeconds(row: ShiftCoverRow): ShiftCoverRow {
  const toSeconds = (s: Spread): Spread => {
    const k = (BEATS_PER_MEASURE * 60) / row.bpm;
    return { median: s.median * k, p90: s.p90 * k, longest: s.longest * k };
  };
  return { ...row, timeOutSeconds: toSeconds(row.timeOut), timeHomeSeconds: toSeconds(row.timeHome) };
}

function shiftCoverRow(coords: ReadonlyArray<{ x: number; y: number }>, measures: number, bpm: number): ShiftCoverRow {
  const sounding: number[] = [];
  const stays: number[] = [];
  const heard: number[] = [];
  const timesOut: number[] = [];
  const timesHome: number[] = [];
  const counts = { companySounding: 0, companyApart: 0, companyExits: 0, groupExits: 0, exits: 0, exitsOnTurn: 0, entrances: 0, entrancesOnTurn: 0 };
  let silentMeasures = 0;
  let worldsWithSilence = 0;
  let plannedOffTurn = 0;

  for (const { x, y } of coords) {
    const worldKey = `${x}:${y}`;
    const env = { bpm, worldKey };
    const noiseMap = simNoiseMap(x, y);
    const isTurn = turnReaderFor(worldKey);
    let roster = buildShiftSimRoster(noiseMap, env);
    const cover = createCoverTally(roster, isShiftStaying);
    const groups = createGroupTally(roster, isTurn);
    const planned = new Set<string>();
    for (let measure = 1; measure <= measures; measure++) {
      roster = stepShiftLifecycle(roster, measure, env);
      cover.observe(roster);
      groups.observe(roster);
      for (const r of roster) {
        if (r.exitsAtMeasure === undefined) continue;
        const key = `${groupIdOf(r)}@${r.exitsAtMeasure}`;
        if (planned.has(key)) continue;
        planned.add(key);
        if (!isTurn(r, r.exitsAtMeasure)) plannedOffTurn++;
      }
    }
    const c = cover.result();
    c.soundingHistogram.forEach((count, n) => {
      for (let i = 0; i < count; i++) sounding.push(n);
    });
    silentMeasures += c.silentMeasures;
    if (c.silentMeasures > 0) worldsWithSilence++;
    stays.push(...c.stays);
    for (const r of c.robots) heard.push(r.heardShare);
    const g = groups.result();
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] += g[k];
    timesOut.push(...g.timesOut);
    timesHome.push(...g.timesHome);
  }

  const samples = coords.length * measures;
  const spread = (values: readonly number[]): Spread =>
    values.length > 0 ? { median: percentile(values, 50), p90: percentile(values, 90), longest: percentile(values, 100) } : { median: 0, p90: 0, longest: 0 };
  const share = (n: number, of: number) => (of > 0 ? n / of : 0);
  return withSeconds({
    bpm,
    worlds: coords.length,
    measures,
    silentShare: share(silentMeasures, samples),
    worldsWithSilence,
    sounding: {
      mean: sounding.length > 0 ? sounding.reduce((s, v) => s + v, 0) / sounding.length : 0,
      p10: sounding.length > 0 ? percentile(sounding, 10) : 0,
      p90: sounding.length > 0 ? percentile(sounding, 90) : 0,
    },
    apartShare: share(counts.companyApart, counts.companySounding),
    companyExits: counts.companyExits,
    groupExitShare: share(counts.groupExits, counts.companyExits),
    exits: counts.exits,
    exitsOnTurnShare: share(counts.exitsOnTurn, counts.exits),
    entrances: counts.entrances,
    entrancesOnTurnShare: share(counts.entrancesOnTurn, counts.entrances),
    plannedOffTurn,
    timeOut: spread(timesOut),
    timeHome: spread(timesHome),
    timeOutSeconds: spread([]),
    timeHomeSeconds: spread([]),
    staysPer1000: share(stays.length, samples) * 1000,
    stayLength: spread(stays),
    heardShare: { lowest: heard.length > 0 ? Math.min(...heard) : 0, highest: Math.max(0, ...heard) },
  });
}

/** The shift cover rows as a markdown table — for Results. Seconds at the row's tempo. */
export function formatShiftCoverReport(rows: readonly ShiftCoverRow[]): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`;
  const bars = (s: Spread) => `${s.median}, ${s.p90}, ${s.longest}`;
  const secs = (s: Spread) => `${Math.round(s.median)}, ${Math.round(s.p90)}, ${Math.round(s.longest)}`;
  const lines = [
    '| BPM | Silent | Sounding (mean, p10–p90) | Apart | Group exits | Exits on a turn | Entrances on a turn | Time out, bars (median, p90, longest) | Time out, s | Time home, bars | Time home, s | Stays / 1,000 | Stay length | Heard share (lowest–highest) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.bpm} | ${pct(r.silentShare)} | ${r.sounding.mean.toFixed(2)}, ${r.sounding.p10}–${r.sounding.p90} | ${pct(r.apartShare)} | ${pct(r.groupExitShare)} of ${r.companyExits} | ${pct(r.exitsOnTurnShare)} | ${pct(r.entrancesOnTurnShare)} | ${bars(r.timeOut)} | ${secs(r.timeOutSeconds)} | ${bars(r.timeHome)} | ${secs(r.timeHomeSeconds)} | ${r.staysPer1000.toFixed(2)} | ${bars(r.stayLength)} | ${pct(r.heardShare.lowest)}–${pct(r.heardShare.highest)} |`,
    );
  }
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

/** One lifecycle measure over the roster — stepShiftLifecycle in the grid sim; scripted in tests. */
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
  /** The wait at the door (roadmap 94 Task 19, spec §1.11): a robot reaching its port while Recalled waits there,
   *  'entering' and visible, until the last bar of its hold and goes in on the hold's bar line; one arriving with under
   *  half a measure left, or Docked already, is late and takes today's rule, the next bar line (at once with half a
   *  measure or more left, after a hold to it otherwise). Off: the entry is STATION_ARC_SECONDS from arrival. */
  door?: boolean;
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
  /** With the door on: every robot reaching its port on the way in. */
  arrivals: number;
  /** Of those, the company members (a robot with a companyId). */
  memberExits: number;
  /** Of the members, the late ones: under half a measure before the hold's bar line, or Docked already. */
  lateMembers: number;
  /** Every arrival's wait at the door before its fade begins, in seconds. */
  doorWaits: number[];
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
  const { world, roster, bpm, seconds, rand, step, cooldown = siteCooldown, trace, door = false } = options;
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
    arrivals: 0,
    memberExits: 0,
    lateMembers: 0,
    doorWaits: [],
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

  /** The door (roadmap 94 Task 19): when a robot reaching its port at `t` goes in, counting its wait and whether it is
   *  late. On time: the bar line of its hold, its fade over the hold's last bar (or what is left of it). Late: the next
   *  bar line with half a measure or more left, else the one after. */
  const atTheDoor = (r: SimRobot, t: number): number => {
    const snapshot = lifecycle[robots.indexOf(r)] as ShiftLifecycleSnapshot;
    const member = snapshot.companyId !== undefined;
    const half = measureSeconds / 2;
    result.arrivals++;
    if (member) result.memberExits++;
    const hold = snapshot.dockingHoldUntilMeasure;
    if (snapshot.docking === DockingState.Recalled && hold !== undefined && hold * measureSeconds - t >= half - 1e-9) {
      const end = hold * measureSeconds;
      result.doorWaits.push(Math.max(0, end - measureSeconds - t));
      return end;
    }
    if (member) result.lateMembers++;
    const nextBar = (Math.floor(t / measureSeconds + 1e-9) + 1) * measureSeconds;
    const atOnce = nextBar - t >= half - 1e-9;
    result.doorWaits.push(atOnce ? 0 : nextBar - t);
    return atOnce ? nextBar : nextBar + measureSeconds;
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
        r.until = door ? atTheDoor(r, t) : t + STATION_ARC_SECONDS;
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
 * The shipped siteCooldown (0.3/2/30, Crawford's Task 16b pick) first, then the previous pick
 * 0.4/3/30 (Task 15), the 0.6/4/30 first guess and a shorter rest for comparison. `0/0/0` (no rest)
 * is a reference, not a candidate: robots camp on one site forever.
 */
export const COOLDOWN_CANDIDATES: readonly CooldownCandidate[] = [
  { label: `${COOLDOWN_PER_SITE}/${COOLDOWN_MIN}/${COOLDOWN_MAX}`, cooldown: siteCooldown },
  clampedCooldown(0.4, 3, 30),
  clampedCooldown(0.6, 4, 30),
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
  /** The door (roadmap 94 Task 19): company members reaching their port, the late ones, and every arrival's wait at
   *  the door in seconds. */
  memberExits: number;
  lateMembers: number;
  doorWait: Spread;
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
 * sites and stations: buildShiftSimRoster at each tempo, stepShiftLifecycle, and the door on (roadmap 94). Each
 * world's rand is seeded by coordinates and tempo, so candidates are compared on the same draws. Store-free once the
 * worlds are placed.
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
    return { x, y, noiseMap, world: buildLoopWorld(actors, noiseMap) };
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
      let memberExits = 0;
      let lateMembers = 0;
      const doorWaits: number[] = [];
      for (const w of prepared) {
        const env = { bpm, worldKey: `${w.x}:${w.y}` };
        const r = runLoopSim({
          world: w.world,
          roster: buildShiftSimRoster(w.noiseMap, env),
          bpm,
          seconds,
          rand: alea(`loop-sim:${w.x}:${w.y}:${bpm}`),
          step: (roster, measure) => stepShiftLifecycle(roster as ShiftLifecycleSnapshot[], measure, env),
          cooldown,
          door: true,
        });
        memberExits += r.memberExits;
        lateMembers += r.lateMembers;
        doorWaits.push(...r.doorWaits);
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
        memberExits,
        lateMembers,
        doorWait:
          doorWaits.length > 0
            ? { median: percentile(doorWaits, 50), p90: percentile(doorWaits, 90), longest: percentile(doorWaits, 100) }
            : { median: 0, p90: 0, longest: 0 },
      });
    }
  }
  return { rows, seeds };
}

/** The door rows (roadmap 94 Task 19) as a markdown table — for Results. */
export function formatDoorReport(rows: readonly ReadinessRow[]): string {
  const sec = (v: number) => `${v.toFixed(1)} s`;
  const lines = [
    '| BPM | Member exits | Late members | Door wait (median, p90, longest) | Turn-backs | Charging visible | Longest Docked visible |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const late = r.memberExits > 0 ? `${r.lateMembers} (${((r.lateMembers / r.memberExits) * 100).toFixed(1)} %)` : '0';
    lines.push(
      `| ${r.bpm} | ${r.memberExits} | ${late} | ${sec(r.doorWait.median)}, ${sec(r.doorWait.p90)}, ${sec(r.doorWait.longest)} | ${r.turnBacks} | ${r.chargingWhileVisible} | ${sec(r.longestDockedVisible)} |`,
    );
  }
  return lines.join('\n');
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
