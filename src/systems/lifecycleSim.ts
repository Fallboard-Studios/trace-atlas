// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { DockingState } from '../types/Robot';
import { getSeededVal } from '../utils/getSeededVal';
import { generateRobotRosterBaseline } from './spawnSystem';
import { stepRobotLifecycle, chooseJobForSnapshot, surchargeDrain } from './robotSystems';
import type { DrainRule, RobotLifecycleSnapshot } from './robotSystems';
import { MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX } from '../constants';

/**
 * Headless lifecycle sims (docs/specs/ROBOT_JOBS_AND_STATIONS.md §5.2, Phase 43 Task 2). Pure: real
 * seeded rosters, the real stepRobotLifecycle, no store, no BeatClock, no GSAP. Answers one
 * question before the flat drain ships — which flat per-measure drain keeps as many robots out
 * (Active) as today's per-job surcharge rule does, over the same seeds and the same replay code.
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
 * seeded Active count and Docked batteries, generateRobotRosterBaseline's job-scoring attributes, then
 * initializeLocale's assignJob pass over the Active robots in spawn order. Melody is empty — it only
 * feeds pitch drift, which never touches battery or docking.
 */
export function buildSimRoster(noiseMap: NoiseFunction2D): RobotLifecycleSnapshot[] {
  const activeCount = INITIAL_ACTIVE_ROBOTS_MIN + Math.floor(
    getSeededVal(noiseMap, 'roster.activeCount', 0, 0, INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1),
  );
  const baselines = generateRobotRosterBaseline(noiseMap, MAX_ROBOTS);

  const roster: RobotLifecycleSnapshot[] = baselines.map((b, i) => {
    const active = i < activeCount;
    return {
      id: `sim-${i}`,
      docking: active ? DockingState.Active : DockingState.Docked,
      batteryLevel: active ? 100 : Math.floor(getSeededVal(noiseMap, 'roster.dockedBattery', i, 0, 100)),
      melody: [],
      dockCycleCount: 0,
      octaveRange: b.octaveRange,
      rhythmicDensity: b.rhythmicDensity,
      rhythmicMotifLength: b.rhythmicMotifLength,
      noteVariance: b.noteVariance,
    };
  });

  for (const robot of roster) {
    if (robot.docking === DockingState.Active) robot.job = chooseJobForSnapshot(robot, roster, 0);
  }
  return roster;
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

/** Today's per-job surcharge rule, then the flat values the spec brackets around its mean of 6. */
export const DRAIN_CANDIDATES: readonly DrainCandidate[] = [
  { label: 'today', drain: surchargeDrain },
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

/** The flat candidate whose mean Active count is closest to today's; an exact tie goes to the
 *  earlier (lower-drain) row. */
export function closestFlatToToday(rows: readonly DrainSimRow[]): string {
  const today = rows.find((r) => r.label === 'today');
  const flats = rows.filter((r) => r.label !== 'today');
  if (!today || flats.length === 0) throw new Error('closestFlatToToday needs a today row and at least one flat row');
  let best = flats[0];
  for (const r of flats.slice(1)) {
    if (Math.abs(r.mean - today.mean) < Math.abs(best.mean - today.mean)) best = r;
  }
  return best.label;
}

/** A markdown table of the rows, for the stop-and-report and docs/ROBOT_LIFECYCLE.md. */
export function formatDrainReport(rows: readonly DrainSimRow[]): string {
  const lines = ['| Drain | Mean Active | p10 | p90 |', '|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.label} | ${r.mean.toFixed(2)} | ${r.p10} | ${r.p90} |`);
  return lines.join('\n');
}
