// ========================================
// IMPORTS
// ========================================
import type { Actor } from '../types/Actor';
import { JobType } from '../types/Robot';
import type { CoverageTopUp } from './districtRecipes';
import { eligibleHostJobs } from './jobHosts';

// ========================================
// CONSTANTS
// ========================================

/** A world needs at least this many job types… (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.4) */
export const COVERAGE_MIN_JOBS = 3;
/** …each with at least this many eligible hosts. */
export const COVERAGE_MIN_HOSTS = 4;

// ========================================
// API
// ========================================

/**
 * Eligible hosts per job: midground and foreground hosts (background waits for J4,
 * `BACK_HOSTS_ENABLED`), each counted once for every job it hosts. Every job is present.
 */
export function jobHostCounts(actors: readonly Actor[]): Record<JobType, number> {
  const counts = Object.fromEntries(Object.values(JobType).map((j) => [j, 0])) as Record<JobType, number>;
  for (const actor of actors) addHost(counts, actor);
  return counts;
}

/** Counts one actor into `counts` (in place) — once per job it hosts, if it's eligible. */
function addHost(counts: Record<JobType, number>, actor: Actor): void {
  for (const job of eligibleHostJobs(actor, { backHosts: false })) counts[job]++;
}

/** Whether ≥ COVERAGE_MIN_JOBS jobs have ≥ COVERAGE_MIN_HOSTS hosts. */
export function meetsCoverage(counts: Record<JobType, number>): boolean {
  return Object.values(counts).filter((n) => n >= COVERAGE_MIN_HOSTS).length >= COVERAGE_MIN_JOBS;
}

/**
 * Tops a placed world up to the coverage rule (spec §1.4): while it falls short, places the next
 * item of `topUps` through `place` (the district placer's own row machinery; it returns null for
 * an item it can't place, such as a gem-gated beacon, and the walk moves on). Stops as soon as the
 * rule holds or the list runs out. Returns only the actors it added; `actors` is not touched.
 * Counts the world once and each placed top-up once: it runs on every world switch.
 */
export function ensureJobCoverage(
  actors: readonly Actor[],
  topUps: readonly CoverageTopUp[],
  place: (topUp: CoverageTopUp, index: number) => Actor | null,
): Actor[] {
  const counts = jobHostCounts(actors);
  const added: Actor[] = [];
  for (let i = 0; i < topUps.length && !meetsCoverage(counts); i++) {
    const actor = place(topUps[i], i);
    if (!actor) continue;
    added.push(actor);
    addHost(counts, actor);
  }
  return added;
}
