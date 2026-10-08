// ========================================
// workLoop (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6/§1.7, Phase 43)
// ========================================
// The visual side of a robot's working life, on wall-clock time.
//
// The site cycle (Task 22), for an Active robot: next() → chooseNextSite → 'transit' (swim to the
// park, site held) → 'working' (buildJobTimeline: lock → run → unlock) → release with a cooldown →
// next(). No ready site → 'waiting' (one finite bob of WAIT_RETRY_SECONDS) → next().
//
// Stations (Task 23): a robot that isn't Active goes home — 'returning' (the nearest station with a
// free slot, reserved on decision, swim to its port) → 'entering' (the arc: scale down to
// STATION_PORT_SCALE and fade out) → 'charging' (hidden at the port, its slot lit). Going Active
// again, it exits — 'exiting' (the arc reversed) → next(). Each arc carries the robot's halo
// ripple (its registered decorateArc) and the station's own ripple (stationRipple.ts).
//
// Every decision reads the robot's `docking`, so the visuals converge on the lifecycle however far
// the Transport ran ahead (a hidden tab). The lifecycle reaches this module through
// onLifecycleChange; React reaches it through onRobotMounted. Until Task 24 re-points the tick's
// seam here, only Robot.tsx's mount, initializeLocale and the power-off paths call in.
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
import { getStations, nearestFreeStation, type Station } from './stations';
import { createSwimTimeline } from '../animation/swimAnimation';
import { getTimeline, killTimeline, setTimeline, timelineMap } from '../animation/timelineMap';
import { getArcDecorator, getOrbiterWork } from '../animation/robotMotionRegistry';
import { playStationRipple } from '../animation/stationRipple';
import { buildJobTimeline } from '../animation/jobMoves/buildJobTimeline';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { getRobotGem } from '../components/robot/gem/polygon';
import type { ArcKind } from '../components/robot/gem/useHaloMotion';
import { bodyShapeFromAdsr, calculateBodyScale } from '../components/robot/robotVisualHelpers';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { getRef } from '../utils/refs';
import { prefersReducedMotion } from '../utils/reducedMotion';
import {
  BACK_HOSTS_ENABLED,
  BOB_PX,
  STATION_ARC_SECONDS,
  STATION_PORT_SCALE,
  STATION_REDUCED_ARC_SECONDS,
  SWIM_SPEED,
  WAIT_RETRY_SECONDS,
} from '../constants';
import { DockingState, type Robot, type RobotActivity } from '../types/Robot';
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

/** The lifecycle transitions with a visual consequence (spec §1.1). Undocking is a hold only. */
export type LifecycleChange = 'recalled' | 'active' | 'docked';

interface LoopRun {
  localeId: string;
  /** Every eligible work site in the world, by actor id. Fixed for the run. */
  sites: Map<string, WorkSite>;
  siteState: Map<string, SiteSlot>;
  stations: Station[];
  now: () => number;
  rand: () => number;
}

// ========================================
// CONSTANTS
// ========================================
/** The timeline keys this loop owns. `station-` covers each robot's arcs and each station's ripple. */
const LOOP_KEY_PREFIXES = ['work-', 'swim-', 'bob-wait-', 'station-'] as const;

/** A robot's own legs other than its job, by key prefix. */
const LEG_KEY_PREFIXES = ['swim-', 'bob-wait-', 'station-'] as const;

/** A station's occupants (spec §1.6): robots heading in, entering or charging there. */
const OCCUPYING: ReadonlySet<RobotActivity> = new Set(['returning', 'entering', 'charging']);

/** The exit arc's scale ease — the station sketch's √v, so the robot blooms out of the port. */
const sqrtEase = (t: number) => Math.sqrt(t);

/** How far the body may sit from the store's position and still count as there. GSAP keeps
 *  transforms to about four decimals, so a body at rest reads a hair off a fractional position. */
const SETTLE_EPSILON = 0.01;

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

function robotsOf(localeId: string): Robot[] {
  return useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
}

function writeTo(localeId: string, robotId: string, updates: Partial<Robot>): void {
  useLocaleStore.getState().updateRobot(localeId, robotId, updates);
}

function write(loop: LoopRun, robotId: string, updates: Partial<Robot>): void {
  writeTo(loop.localeId, robotId, updates);
}

const bodyOf = (robotId: string) => getRef(`robot-${robotId}`);

/** An instant set on a body. `immediateRender` makes it land now even while the global timeline
 *  is paused, which a plain gsap.set does not. */
function place(el: SVGGElement, vars: gsap.TweenVars): void {
  gsap.set(el, { ...vars, immediateRender: true });
}

const isDockedOrUndocking = (robot: Robot) =>
  robot.docking === DockingState.Docked || robot.docking === DockingState.Undocking;

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

/** Robots per station among its occupants, leaving `selfId` out. */
function occupancy(robots: Robot[], selfId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of robots) {
    if (r.id === selfId || !r.stationId || !r.activity || !OCCUPYING.has(r.activity)) continue;
    counts[r.stationId] = (counts[r.stationId] ?? 0) + 1;
  }
  return counts;
}

/** The port position (a robot `position`, not a centre) for this robot's gem. */
const portPosition = (station: Station, robot: Robot) => positionForCentre(station.port, getRobotGem(robot.gemSeed));

/** The body-scale dial RobotBody's audio memo computes, read at job start. */
function bodyScaleOf(robot: Robot): number {
  const octaveRange = robot.audioAttributes.octaveRange ?? robot.octaveRange;
  return calculateBodyScale(octaveRange, bodyShapeFromAdsr(robot.audioAttributes.adsr).scale);
}

/** A timeline with no target that lasts `duration` — for a robot with no mounted body. */
function timed(duration: number, onComplete: () => void): gsap.core.Timeline {
  return gsap.timeline({ paused: true, onComplete }).to({}, { duration });
}

/** Run a job timeline to its end without its callback, so the orbiters dock and the bob rests. */
function finishJobSilently(robotId: string): void {
  const job = getTimeline(`work-${robotId}`);
  if (!job) return;
  job.progress(1, true);
  getOrbiterWork(robotId)?.unlock();
  killTimeline(`work-${robotId}`);
}

/** Every leg the robot has in flight, gone (its job finished silently first). */
function killLegs(robotId: string): void {
  finishJobSilently(robotId);
  for (const prefix of LEG_KEY_PREFIXES) killTimeline(`${prefix}${robotId}`);
}

/**
 * Where the body really is. The store's position is the last leg's destination, so a leg cut off
 * mid-swim (or mid-bob) leaves the body ahead of it; the next leg must start from the body.
 */
function settle(loop: LoopRun, robot: Robot): Robot {
  const el = bodyOf(robot.id);
  if (!el) return robot;
  const position = { x: Number(gsap.getProperty(el, 'x')), y: Number(gsap.getProperty(el, 'y')) };
  if (Math.hypot(position.x - robot.position.x, position.y - robot.position.y) < SETTLE_EPSILON) return robot;
  write(loop, robot.id, { position });
  return robotOf(loop, robot.id) ?? robot;
}

/** Give up any site the robot holds with no cooldown — it never worked there (J1 readiness sim). */
function abandonSites(loop: LoopRun, robotId: string): void {
  for (const [siteId, slot] of loop.siteState) {
    if (slot.heldBy === robotId) loop.siteState.set(siteId, { heldBy: undefined, readyAt: loop.now() });
  }
  if (robotOf(loop, robotId)?.siteId !== undefined) write(loop, robotId, { siteId: undefined });
}

// ========================================
// LEGS — SITES
// ========================================
/** Swim to `destination` (a robot position), write it on arrival, then `onArrive`. */
function swimTo(loop: LoopRun, robot: Robot, destination: Vec2, onArrive: () => void): void {
  const arrive = live(loop, () => {
    write(loop, robot.id, { position: destination });
    onArrive();
  });
  if (bodyOf(robot.id)) {
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

  const robotEl = bodyOf(robotId);
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
  const el = bodyOf(robot.id);
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
// LEGS — STATIONS
// ========================================
/**
 * The station arc, keyed `station-${robotId}`: `'spawn'` appears at the port (scale
 * STATION_PORT_SCALE → 1 on √v, autoAlpha 0 → 1), `'despawn'` vanishes into it (scale 1 →
 * STATION_PORT_SCALE on v², autoAlpha 1 → 0), both over STATION_ARC_SECONDS. The robot's halo
 * ripple rides on the arc and the station's ripple plays beside it. Reduced motion: a
 * STATION_REDUCED_ARC_SECONDS fade in place, no scale and no station ripple.
 */
function stationArc(loop: LoopRun, robot: Robot, kind: ArcKind, station: Station | undefined, onDone: () => void): void {
  const key = `station-${robot.id}`;
  const done = live(loop, onDone);
  const reduced = prefersReducedMotion();
  const duration = reduced ? STATION_REDUCED_ARC_SECONDS : STATION_ARC_SECONDS;
  const el = bodyOf(robot.id);
  if (!el) {
    const tl = timed(duration, done);
    setTimeline(key, tl);
    tl.play();
    return;
  }

  const appear = kind === 'spawn';
  const tl = gsap.timeline({ paused: true, onComplete: done });
  tl.fromTo(el, { autoAlpha: appear ? 0 : 1 }, { autoAlpha: appear ? 1 : 0, duration, ease: 'none' }, 0);
  if (reduced) {
    tl.set(el, { scale: 1 }, 0);
  } else {
    tl.fromTo(
      el,
      { scale: appear ? STATION_PORT_SCALE : 1 },
      { scale: appear ? 1 : STATION_PORT_SCALE, duration, ease: appear ? sqrtEase : 'power1.in' },
      0,
    );
  }
  getArcDecorator(robot.id)?.(kind, duration, tl);
  if (!reduced && station) playStationRipple(station.id, kind, robot.identityColor, duration);
  setTimeline(key, tl);
  tl.play();
}

/** Out of the station: the slot frees as the robot appears, then it goes to work. */
function exitStation(loop: LoopRun, robot: Robot): void {
  write(loop, robot.id, { activity: 'exiting' });
  const station = loop.stations.find((s) => s.id === robot.stationId);
  stationArc(loop, robot, 'spawn', station, () => next(robot.id));
}

/** Home: reserve a slot at the nearest station with room, swim to its port, enter. */
function returnToStation(loop: LoopRun, robot: Robot): void {
  const station = nearestFreeStation(
    robotCentre(robot, getRobotGem(robot.gemSeed)),
    loop.stations,
    occupancy(robotsOf(loop.localeId), robot.id),
  );
  if (!station) {
    wait(loop, robot); // every station full (can't happen at 12 robots): ask again after a bob
    return;
  }
  write(loop, robot.id, { activity: 'returning', stationId: station.id, siteId: undefined });
  swimTo(loop, robot, portPosition(station, robot), () => enter(loop, robot.id, station));
}

/** Into the station. If the robot went Active again on the way in, it turns back at the port. */
function enter(loop: LoopRun, robotId: string, station: Station): void {
  const robot = robotOf(loop, robotId);
  if (!robot) return;
  write(loop, robotId, { activity: 'entering' });
  stationArc(loop, robot, 'despawn', station, () => {
    const inside = robotOf(loop, robotId);
    if (!inside) return;
    if (inside.docking === DockingState.Active) exitStation(loop, inside);
    else write(loop, robotId, { activity: 'charging' });
  });
}

/** Docked or Undocking: hidden at its station's port (the nearest free one if it has none), charging. */
function hideAtStation(localeId: string, robot: Robot, stations: Station[]): void {
  const station = stations.find((s) => s.id === robot.stationId)
    ?? nearestFreeStation(robotCentre(robot, getRobotGem(robot.gemSeed)), stations, occupancy(robotsOf(localeId), robot.id));
  const position = station ? portPosition(station, robot) : robot.position;
  const el = bodyOf(robot.id);
  if (el) place(el, { x: position.x, y: position.y, autoAlpha: 0 });
  writeTo(localeId, robot.id, { activity: 'charging', position, ...(station ? { stationId: station.id } : {}) });
}

// ========================================
// DECISIONS
// ========================================
/** The decision, from wherever the robot is: home if it isn't Active, else a site or a wait. */
function resume(loop: LoopRun, robot: Robot): void {
  if (robot.docking !== DockingState.Active) {
    returnToStation(loop, robot);
    return;
  }
  const t = loop.now();
  const choice = chooseNextSite({
    robot: { id: robot.id, job: robot.job, centre: robotCentre(robot, getRobotGem(robot.gemSeed)) },
    sites: [...loop.sites.values()].map((s) => ({ id: s.id, jobs: s.jobs, park: s.park, ready: isReady(loop, s.id, t) })),
    heldJobs: heldJobs(robotsOf(loop.localeId), robot.id),
    rand: loop.rand,
  });
  if (!choice) {
    wait(loop, robot);
    return;
  }
  transit(loop, robot, loop.sites.get(choice.siteId)!, choice.job);
}

/**
 * Take over a mounted robot from scratch: its legs are dropped and its site given up, then it is
 * hidden in its station (Docked/Undocking), exits it ('exiting', or 'charging' but Active), or is
 * shown at full size and decides from where its body is.
 */
function adopt(loop: LoopRun, robot: Robot): void {
  killLegs(robot.id);
  abandonSites(loop, robot.id);
  const current = robotOf(loop, robot.id) ?? robot;
  if (isDockedOrUndocking(current)) {
    hideAtStation(loop.localeId, current, loop.stations);
    return;
  }
  if (current.activity === 'exiting' || current.activity === 'charging') {
    exitStation(loop, current);
    return;
  }
  const el = bodyOf(current.id);
  if (el) place(el, { autoAlpha: 1, scale: 1 });
  resume(loop, settle(loop, current));
}

// ========================================
// EXPORTS
// ========================================
/**
 * Start the loop for `localeId`, adopting every robot already mounted (a power-on mounts the
 * scene before initializeLocale starts the loop). Idempotent — a no-op while a loop is running.
 */
export function startWorkLoop(localeId: string, options: WorkLoopOptions = {}): void {
  if (run) return;
  const loop: LoopRun = {
    localeId,
    sites: eligibleSites(localeId),
    siteState: new Map(),
    stations: getStations(localeId),
    now: options.now ?? (() => gsap.ticker.time),
    rand: options.rand ?? Alea(`${localeId}:work`),
  };
  run = loop;
  for (const robot of robotsOf(localeId)) {
    if (bodyOf(robot.id)) adopt(loop, robot);
  }
}

/**
 * Stop the loop: every `work-*`, `swim-*`, `bob-wait-*` and `station-*` timeline is killed and the
 * site state cleared. A job in progress is first run to its end without its callback, so the
 * orbiters are back on their docks and the bob at rest before they're unlocked. Idempotent.
 */
export function stopWorkLoop(): void {
  if (!run) return;
  run = null;
  for (const key of [...timelineMap.keys()]) {
    if (!LOOP_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (key.startsWith('work-')) finishJobSilently(key.slice('work-'.length));
    else killTimeline(key);
  }
}

/**
 * The loop's decision point for a robot, called as each leg ends. Returning or entering: the leg
 * in flight decides, so nothing. Charging: exit if it's Active again. Otherwise home if it isn't
 * Active, else a ready site (`chooseNextSite`) or a wait.
 */
export function next(robotId: string): void {
  const loop = run;
  if (!loop) return;
  const robot = robotOf(loop, robotId);
  if (!robot) return;
  if (robot.activity === 'returning' || robot.activity === 'entering') return;
  if (robot.activity === 'charging') {
    if (robot.docking === DockingState.Active) exitStation(loop, robot);
    return;
  }
  resume(loop, robot);
}

/**
 * The lifecycle tick's visual seam (spec §1.7), called after the tick's own store writes.
 * `'recalled'`: in transit, the swim is dropped and the site released with no cooldown; waiting,
 * the bob is dropped — either way it heads home now. Working or exiting, the leg finishes first
 * and its next() sends it home. `'active'`: charging, it exits; returning, it turns back (the slot
 * frees with the activity) and goes to work; entering, the arc finishes and turns it back at the
 * port. `'docked'`: nothing — the entry ends in 'charging' on its own.
 */
export function onLifecycleChange(localeId: string, robotId: string, to: LifecycleChange): void {
  const loop = run;
  if (!loop || loop.localeId !== localeId) return;
  const robot = robotOf(loop, robotId);
  if (!robot) return;

  if (to === 'recalled') {
    if (robot.activity !== 'transit' && robot.activity !== 'waiting') return;
    killTimeline(`swim-${robotId}`);
    killTimeline(`bob-wait-${robotId}`);
    abandonSites(loop, robotId);
    returnToStation(loop, settle(loop, robotOf(loop, robotId)!));
  } else if (to === 'active') {
    if (robot.activity === 'charging') {
      exitStation(loop, robot);
    } else if (robot.activity === 'returning') {
      killTimeline(`swim-${robotId}`);
      resume(loop, settle(loop, robot));
    }
  }
}

/**
 * A world-context robot body has mounted (Robot.tsx). With the loop running for its locale, the
 * loop adopts it. With none yet (a power-on), Docked and Undocking robots are hidden at their
 * station and exiting or charging ones hidden in place, so nothing shows for a frame before
 * startWorkLoop adopts them.
 */
export function onRobotMounted(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;
  if (run) {
    if (run.localeId === localeId) adopt(run, robot);
    return;
  }
  if (isDockedOrUndocking(robot)) {
    hideAtStation(localeId, robot, getStations(localeId));
  } else if (robot.activity === 'exiting' || robot.activity === 'charging') {
    const el = bodyOf(robotId);
    if (el) place(el, { autoAlpha: 0 });
  }
}

/** A site's runtime state, for tests and diagnostics. Undefined if never taken this run. */
export function getSiteState(siteId: string): Readonly<SiteSlot> | undefined {
  return run?.siteState.get(siteId);
}
