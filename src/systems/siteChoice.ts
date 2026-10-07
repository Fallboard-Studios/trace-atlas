// ========================================
// IMPORTS
// ========================================
import { DockingState, type JobType, type Robot, type RobotActivity } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';
import { COOLDOWN_MAX, COOLDOWN_MIN, COOLDOWN_PER_SITE } from '../constants';

// ========================================
// TYPES
// ========================================

/** chooseNextSite's input — pure, `rand` injected (docs/specs/ROBOT_JOBS_AND_STATIONS.md §4). */
export interface SiteChoiceInput {
  robot: { id: string; job?: JobType; centre: Vec2 };
  /** Each eligible site; `ready` = not held and its cooldown has run out (the loop decides). */
  sites: readonly { id: string; jobs: readonly JobType[]; park: Vec2; ready: boolean }[];
  /** Jobs held right now by other Active robots — the variety rule's input (`heldJobs`). */
  heldJobs: ReadonlySet<JobType>;
  /** A uniform [0, 1) draw. */
  rand: () => number;
}

/** What heldJobs reads from a robot. `activity` is optional until `Robot.activity` lands (Task 21). */
export interface HeldJobsRobot {
  id: Robot['id'];
  docking: DockingState;
  job?: JobType;
  activity?: RobotActivity;
}

// ========================================
// CONSTANTS
// ========================================

/** The activities that hold a job (plan correction 4). Charging, returning and entering hold nothing. */
const HOLDING_ACTIVITIES: ReadonlySet<RobotActivity> = new Set<RobotActivity>(['exiting', 'transit', 'working', 'waiting']);

// ========================================
// HELPERS
// ========================================

type Site = SiteChoiceInput['sites'][number];

/** The site whose park is nearest `centre`; ties go to the earlier site. Null for none. */
function nearest(centre: Vec2, sites: readonly Site[]): Site | null {
  let best: Site | null = null;
  let bestDistance = Infinity;
  for (const s of sites) {
    const d = Math.hypot(s.park.x - centre.x, s.park.y - centre.y);
    if (d < bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

/** Ready sites per job, in first-seen order. A multi-job site counts once for each of its jobs. */
function readySiteCountsByJob(ready: readonly Site[]): Map<JobType, number> {
  const counts = new Map<JobType, number>();
  for (const s of ready) for (const j of s.jobs) counts.set(j, (counts.get(j) ?? 0) + 1);
  return counts;
}

/** One draw: a job from `jobs`, weighted by its count. `jobs` is never empty. */
function weightedPick(jobs: readonly JobType[], counts: ReadonlyMap<JobType, number>, rand: () => number): JobType {
  const total = jobs.reduce((sum, j) => sum + counts.get(j)!, 0);
  let r = rand() * total;
  for (const j of jobs) {
    r -= counts.get(j)!;
    if (r < 0) return j;
  }
  return jobs[jobs.length - 1]; // float round-off at r ≈ total
}

// ========================================
// SITE CHOICE (pure — docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.7)
// ========================================

/**
 * Where a robot works next. Keeps its job at the nearest ready site hosting it; otherwise picks a
 * job among those with a ready site — preferring jobs no other robot holds (all of them, if every
 * one is held) — weighted by ready-site count, then that job's nearest ready site. Null when
 * nothing is ready. Draws `rand` once on a switch, never on a keep.
 */
export function chooseNextSite({ robot, sites, heldJobs, rand }: SiteChoiceInput): { siteId: string; job: JobType } | null {
  const ready = sites.filter((s) => s.ready);
  if (ready.length === 0) return null;

  if (robot.job) {
    const keep = nearest(robot.centre, ready.filter((s) => s.jobs.includes(robot.job!)));
    if (keep) return { siteId: keep.id, job: robot.job };
  }

  const counts = readySiteCountsByJob(ready);
  const unheld = [...counts.keys()].filter((j) => !heldJobs.has(j));
  const job = weightedPick(unheld.length > 0 ? unheld : [...counts.keys()], counts, rand);
  const site = nearest(robot.centre, ready.filter((s) => s.jobs.includes(job)))!;
  return { siteId: site.id, job };
}

/**
 * A site's rest after a robot leaves it, in seconds, for `eligibleSiteCount` sites: more
 * buildings, longer rest, so work spreads; few, shorter, so robots don't starve.
 */
export function siteCooldown(eligibleSiteCount: number): number {
  return Math.min(Math.max(eligibleSiteCount * COOLDOWN_PER_SITE, COOLDOWN_MIN), COOLDOWN_MAX);
}

/**
 * The jobs other robots hold right now (plan correction 4): every other Active robot whose
 * activity is exiting, transit, working or waiting. Charging, returning and entering robots
 * hold nothing — their `job` is stale.
 */
export function heldJobs(robots: readonly HeldJobsRobot[], selfId: string): Set<JobType> {
  const held = new Set<JobType>();
  for (const r of robots) {
    if (r.id === selfId || r.docking !== DockingState.Active || !r.job) continue;
    if (r.activity && HOLDING_ACTIVITIES.has(r.activity)) held.add(r.job);
  }
  return held;
}
