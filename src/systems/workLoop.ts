// ========================================
// workLoop (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.7, Phase 43)
// ========================================
// The visual side of a robot's working life, on wall-clock time. Task 22 is the site cycle for an
// Active robot: next() → chooseNextSite → 'transit' (swim to the park, site held) → 'working'
// (buildJobTimeline: lock → run → unlock) → release with a cooldown → next(). No ready site →
// 'waiting' (one finite bob of WAIT_RETRY_SECONDS) → next(). Stations, recall and mounts are
// Task 23; until Task 24 nothing calls this module outside its tests.
//
// Module state is runtime only, never Zustand: an Actor write would re-render every factory layer
// (spec §1.7). Site ids are actor ids — unique within a world (checked over the 121-seed grid),
// and the state is cleared on every stop, so ids from two worlds never meet.
//
// Every callback calls only work-loop functions or store writes — never AudioEngine (Strict
// Separation) — and drops itself if the loop was stopped or restarted since it was scheduled.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import Alea from 'alea';

import { chooseNextSite, heldJobs, siteCooldown } from './siteChoice';
import { isWorkSiteEligible } from './jobHosts';
import { getWorkSite, type WorkSite } from './workSites';
import { createSwimTimeline } from '../animation/swimAnimation';
import { getTimeline, killTimeline, setTimeline, timelineMap } from '../animation/timelineMap';
import { getOrbiterWork } from '../animation/robotMotionRegistry';
import { buildJobTimeline } from '../animation/jobMoves/buildJobTimeline';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { getRobotGem } from '../components/robot/gem/polygon';
import { bodyShapeFromAdsr, calculateBodyScale } from '../components/robot/robotVisualHelpers';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { getRef } from '../utils/refs';
import { prefersReducedMotion } from '../utils/reducedMotion';
import { BACK_HOSTS_ENABLED, BOB_PX, SWIM_SPEED, WAIT_RETRY_SECONDS } from '../constants';
import { DockingState, type Robot } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';

// ========================================
// TYPES
// ========================================
export interface WorkLoopOptions {
  /** Wall-clock seconds. Default `gsap.ticker.time`. */
  now?: () => number;
  /** A uniform [0, 1) draw for job switches. Default: seeded from the locale id. */
  rand?: () => number;
}

/** A site's runtime state: who holds it, and when its rest runs out. */
export interface SiteSlot {
  heldBy?: string;
  readyAt: number;
}

interface LoopRun {
  localeId: string;
  /** Every eligible work site in the world, by actor id. Fixed for the run. */
  sites: Map<string, WorkSite>;
  siteState: Map<string, SiteSlot>;
  now: () => number;
  rand: () => number;
}

// ========================================
// CONSTANTS
// ========================================
/** The timeline keys this loop owns, per robot. */
const LOOP_KEY_PREFIXES = ['work-', 'swim-', 'bob-wait-'] as const;

// ========================================
// STATE
// ========================================
let run: LoopRun | null = null;

// ========================================
// HELPERS
// ========================================
function robotOf(loop: LoopRun, robotId: string): Robot | undefined {
  return useLocaleStore.getState().getRobotById(loop.localeId, robotId);
}

function write(loop: LoopRun, robotId: string, updates: Partial<Robot>): void {
  useLocaleStore.getState().updateRobot(loop.localeId, robotId, updates);
}

/** A callback that runs only if `loop` is still the live run. */
function live<A extends unknown[]>(loop: LoopRun, fn: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    if (run === loop) fn(...args);
  };
}

function isReady(loop: LoopRun, siteId: string, t: number): boolean {
  const slot = loop.siteState.get(siteId);
  return !slot || (!slot.heldBy && t >= slot.readyAt);
}

/** The world's eligible work sites (spec §1.3/§1.5), by actor id. */
function eligibleSites(localeId: string): Map<string, WorkSite> {
  const actors = useLocaleStore.getState().getLocaleById(localeId)?.actors ?? [];
  const sites = new Map<string, WorkSite>();
  for (const actor of actors) {
    if (!isWorkSiteEligible(actor, { backHosts: BACK_HOSTS_ENABLED })) continue;
    const site = getWorkSite(actor);
    if (site) sites.set(site.id, site);
  }
  return sites;
}

/** The body-scale dial RobotBody's audio memo computes, read at job start. */
function bodyScaleOf(robot: Robot): number {
  const octaveRange = robot.audioAttributes.octaveRange ?? robot.octaveRange;
  return calculateBodyScale(octaveRange, bodyShapeFromAdsr(robot.audioAttributes.adsr).scale);
}

/** A timeline with no target that lasts `duration` — for a robot with no mounted body. */
function timed(duration: number, onComplete: () => void): gsap.core.Timeline {
  return gsap.timeline({ paused: true, onComplete }).to({}, { duration });
}

// ========================================
// LEGS
// ========================================
/** Swim to `destination` (a robot position), write it on arrival, then `onArrive`. */
function swimTo(loop: LoopRun, robot: Robot, destination: Vec2, onArrive: () => void): void {
  const arrive = live(loop, () => {
    write(loop, robot.id, { position: destination });
    onArrive();
  });
  if (getRef(`robot-${robot.id}`)) {
    createSwimTimeline(robot, destination, arrive);
    return;
  }
  // No body to swim (createSwimTimeline would fall back to an unkeyed delayedCall that stop
  // can't kill): the same travel time, keyed like a swim.
  const distance = Math.hypot(destination.x - robot.position.x, destination.y - robot.position.y);
  const tl = timed(distance / SWIM_SPEED, arrive);
  setTimeline(`swim-${robot.id}`, tl);
  tl.play();
}

function transit(loop: LoopRun, robot: Robot, site: WorkSite, job: Robot['job']): void {
  loop.siteState.set(site.id, { heldBy: robot.id, readyAt: 0 }); // readyAt is set on release
  write(loop, robot.id, { activity: 'transit', siteId: site.id, job });
  const park = positionForCentre(site.park, getRobotGem(robot.gemSeed));
  swimTo(loop, robot, park, () => work(loop, robot.id, site));
}

function work(loop: LoopRun, robotId: string, site: WorkSite): void {
  const robot = robotOf(loop, robotId);
  if (!robot) return;
  write(loop, robotId, { activity: 'working' });
  const bpm = useAudioStore.getState().bpm;
  const done = live(loop, () => {
    getOrbiterWork(robotId)?.unlock();
    release(loop, robotId, site.id);
    next(robotId);
  });

  const robotEl = getRef(`robot-${robotId}`);
  if (!robotEl) {
    const tl = timed(jobDuration(bpm), done);
    setTimeline(`work-${robotId}`, tl);
    tl.play();
    return;
  }
  buildJobTimeline({
    robot,
    robotEl,
    site,
    job: robot.job!,
    orbiters: getOrbiterWork(robotId)?.lock() ?? [],
    bpm,
    bodyScale: bodyScaleOf(robot),
    layerScale: 1, // the back row's scale arrives with J4
    reducedMotion: prefersReducedMotion(),
    onComplete: done,
  }).play();
}

/** Leave a site: it rests for siteCooldown(eligible site count) before anyone takes it again. */
function release(loop: LoopRun, robotId: string, siteId: string): void {
  loop.siteState.set(siteId, { heldBy: undefined, readyAt: loop.now() + siteCooldown(loop.sites.size) });
  write(loop, robotId, { siteId: undefined });
}

/** No ready site: one finite bob in place (a pause under reduced motion), then ask again. */
function wait(loop: LoopRun, robot: Robot): void {
  write(loop, robot.id, { activity: 'waiting', siteId: undefined });
  const again = live(loop, () => next(robot.id));
  const el = getRef(`robot-${robot.id}`);
  const tl = el && !prefersReducedMotion()
    ? gsap.timeline({ paused: true, onComplete: again }).to(el, {
      y: robot.position.y - BOB_PX,
      duration: WAIT_RETRY_SECONDS / 2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: 1,
    })
    : timed(WAIT_RETRY_SECONDS, again);
  setTimeline(`bob-wait-${robot.id}`, tl);
  tl.play();
}

// ========================================
// EXPORTS
// ========================================
/** Start the loop for `localeId`. Idempotent — a no-op while a loop is running. */
export function startWorkLoop(localeId: string, options: WorkLoopOptions = {}): void {
  if (run) return;
  run = {
    localeId,
    sites: eligibleSites(localeId),
    siteState: new Map(),
    now: options.now ?? (() => gsap.ticker.time),
    rand: options.rand ?? Alea(`${localeId}:work`),
  };
}

/**
 * Stop the loop: every `work-*`, `swim-*` and `bob-wait-*` timeline is killed and the site state
 * cleared. A job in progress is first run to its end without its callback, so the orbiters are
 * back on their docks and the bob at rest before they're unlocked. Idempotent.
 */
export function stopWorkLoop(): void {
  if (!run) return;
  run = null;
  for (const key of [...timelineMap.keys()]) {
    if (!LOOP_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (key.startsWith('work-')) {
      getTimeline(key)!.progress(1, true);
      getOrbiterWork(key.slice('work-'.length))?.unlock();
    }
    killTimeline(key);
  }
}

/**
 * The loop's one decision point for a robot. Active: take a ready site (`chooseNextSite`) and
 * swim to it, or wait. Anything else is Task 23's (stations and recall) and is left alone.
 */
export function next(robotId: string): void {
  const loop = run;
  if (!loop) return;
  const robot = robotOf(loop, robotId);
  if (!robot || robot.docking !== DockingState.Active) return;

  const t = loop.now();
  const choice = chooseNextSite({
    robot: { id: robot.id, job: robot.job, centre: robotCentre(robot, getRobotGem(robot.gemSeed)) },
    sites: [...loop.sites.values()].map((s) => ({ id: s.id, jobs: s.jobs, park: s.park, ready: isReady(loop, s.id, t) })),
    heldJobs: heldJobs(useLocaleStore.getState().getLocaleById(loop.localeId)?.robots ?? [], robot.id),
    rand: loop.rand,
  });
  if (!choice) {
    wait(loop, robot);
    return;
  }
  transit(loop, robot, loop.sites.get(choice.siteId)!, choice.job);
}

/** A site's runtime state, for tests and diagnostics. Undefined if never taken this run. */
export function getSiteState(siteId: string): Readonly<SiteSlot> | undefined {
  return run?.siteState.get(siteId);
}
