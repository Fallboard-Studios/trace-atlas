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
// Background buildings host only with `backHosts` (BACK_HOSTS_ENABLED, J4). A site in the other
// robot layer from the robot's own is offered only when the leg to it has a layer switch point
// clear of every midground silhouette (layerSwitch.ts, spec §1.10); with none it sits out that
// decision.
//
// Layer-aware legs (Task 34, spec §1.10): a leg that ends in the other robot row splits at its
// switch point — two swims, each from rest. In both directions the back-row robot stays opaque and
// a front-row copy (an SVG `<use>` in OceanScene's #robot-dissolve-layer) is what fades, over
// LAYER_DISSOLVE_SECONDS from the switch point, so the haze between the rows blends in. Front →
// back: at the switch point the robot is marked layerSwitching and written to the back row; React
// re-mounts it there, onRobotMounted continues the leg, and the copy fades 1 → 0 over it. Back →
// front: the robot stays in the back row while the copy fades 0 → 1; once the swim and the fade
// are both done it is re-mounted in front at rest, under an identical opaque copy, which then goes.
// Either way `.robot__row` eases to the destination row's scale (BACK_LAYER_SCALE or 1) over the
// second swim. A station leg with no switch point switches where the robot is.
//
// Every decision reads the robot's `docking`, so the visuals converge on the lifecycle however far
// the Transport ran ahead (a hidden tab). The lifecycle tick (robotSystems.ts) reaches this module
// only through onLifecycleChange; React reaches it through onRobotMounted (Robot.tsx); the start
// and stop pairs are initializeLocale's and the power-off paths'.
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
import { getStations, nearestFreeStation, type Box, type Station } from './stations';
import { getMidgroundSilhouettes } from './midgroundSilhouettes';
import { createSwimTimeline } from '../animation/swimAnimation';
import { getTimeline, killTimeline, setTimeline, timelineMap } from '../animation/timelineMap';
import { clearLayerSwitching, getArcDecorator, getOrbiterWork, markLayerSwitching } from '../animation/robotMotionRegistry';
import { playStationRipple } from '../animation/stationRipple';
import { findLayerSwitchPoint, robotBoxAt } from '../animation/layerSwitch';
import { buildJobTimeline } from '../animation/jobMoves/buildJobTimeline';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { GEM_CANVAS_H, gemWidth, getRobotGem } from '../components/robot/gem/polygon';
import type { ArcKind } from '../components/robot/gem/useHaloMotion';
import { bodyShapeFromAdsr, calculateBodyScale } from '../components/robot/robotVisualHelpers';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { getRef } from '../utils/refs';
import { prefersReducedMotion } from '../utils/reducedMotion';
import {
  BACK_HOSTS_ENABLED,
  BACK_LAYER_SCALE,
  BOB_PX,
  LAYER_DISSOLVE_SECONDS,
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
  /** Whether background buildings host work sites. Default `BACK_HOSTS_ENABLED`. */
  backHosts?: boolean;
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
  /** Everything solid between the robot layers (midgroundSilhouettes.ts) — what a layer switch
   *  must stay clear of. Fixed for the run. */
  midground: Box[];
  siteState: Map<string, SiteSlot>;
  stations: Station[];
  now: () => number;
  rand: () => number;
  /** A layer switch's continuation per robot, waiting for React's re-mount (onRobotMounted). */
  remounts: Map<string, () => void>;
}

type RobotLayer = NonNullable<Robot['layer']>;

// ========================================
// CONSTANTS
// ========================================
/** The timeline keys this loop owns. `station-` covers each robot's arcs and each station's ripple;
 *  `dissolve-` a layer switch's copy fade. */
const LOOP_KEY_PREFIXES = ['work-', 'swim-', 'bob-wait-', 'station-', 'dissolve-'] as const;

/** A robot's own legs other than its job and its dissolve, by key prefix. */
const LEG_KEY_PREFIXES = ['swim-', 'bob-wait-', 'station-'] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

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

const actorsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)?.actors ?? [];

/** The world's eligible work sites (spec §1.3/§1.5), by actor id. */
function eligibleSites(localeId: string, backHosts: boolean): Map<string, WorkSite> {
  const sites = new Map<string, WorkSite>();
  for (const actor of actorsOf(localeId)) {
    if (!isWorkSiteEligible(actor, { backHosts })) continue;
    const site = getWorkSite(actor);
    if (site) sites.set(site.id, site);
  }
  return sites;
}

/** The robot layer a site is worked from: background sites from the back row, the rest the front. */
const layerOf = (site: WorkSite): RobotLayer => (site.depth === 'background' ? 'background' : 'foreground');

/** The robot row a robot is drawn in (OceanScene), unset meaning the front. */
const rowOfRobot = (robot: Robot): RobotLayer => robot.layer ?? 'foreground';

/** A robot row's scale: the back row is drawn BACK_LAYER_SCALE smaller. */
const rowScale = (layer: RobotLayer) => (layer === 'background' ? BACK_LAYER_SCALE : 1);

/** The robot's switch point toward `destination` (a robot position), or null (layerSwitch.ts). */
function switchPointFor(loop: LoopRun, robot: Robot, destination: Vec2): Vec2 | null {
  const gem = getRobotGem(robot.gemSeed);
  return findLayerSwitchPoint(robot.position, destination, robotBoxAt(gem, bodyScaleOf(robot)), loop.midground);
}

/**
 * Whether the robot can reach the site: in its own layer always; in the other only when the leg
 * to its park has a layer switch point (spec §1.10) — none, and the site is skipped this decision.
 * A found point goes in `points`, so the leg uses the decision's answer.
 */
function reachable(loop: LoopRun, robot: Robot, site: WorkSite, points: Map<string, Vec2>): boolean {
  if (layerOf(site) === rowOfRobot(robot)) return true;
  const point = switchPointFor(loop, robot, positionForCentre(site.park, getRobotGem(robot.gemSeed)));
  if (point) points.set(site.id, point);
  return point !== null;
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

// ----------------------------------------
// The back row's scale and the dissolve copy (spec §1.10)
// ----------------------------------------
/** Robot.tsx's `.robot__row` — what carries the row scale. */
const rowGroupOf = (robotId: string) => bodyOf(robotId)?.querySelector<SVGGElement>('.robot__row') ?? null;

/** The gem canvas centre, in `.robot__row`'s parent space — the point `g.gem` scales about too,
 *  so body and row scale compose the way sceneToOrbiterLocal assumes. */
function rowOrigin(robot: Robot): string {
  const gem = getRobotGem(robot.gemSeed);
  return `${gemWidth(gem) / 2} ${GEM_CANVAS_H / 2}`;
}

/** The row at `scale` now (an adoption, or a body that mounted mid-ease). */
function placeRow(robot: Robot, scale: number): void {
  const row = rowGroupOf(robot.id);
  if (row) place(row, { scale, svgOrigin: rowOrigin(robot) });
}

/** Ease the row to `scale` over the whole of `tl` (a swim), if it isn't there already. */
function easeRowWith(tl: gsap.core.Timeline, robot: Robot, scale: number): void {
  const row = rowGroupOf(robot.id);
  if (!row) return;
  const from = Number(gsap.getProperty(row, 'scaleX'));
  if (from === scale) return;
  const svgOrigin = rowOrigin(robot);
  tl.fromTo(row, { scale: from, svgOrigin }, { scale, svgOrigin, duration: tl.duration(), ease: 'sine.inOut', immediateRender: false }, 0);
}

const dissolveLayer = () => getRef('robot-dissolve-layer');

/** Take the robot's dissolve copy away (if any). */
function removeCopy(robotId: string): void {
  dissolveLayer()?.querySelectorAll(`use[data-dissolve-copy="${robotId}"]`).forEach((use) => use.remove());
}

/** A dissolve, ended: its fade killed and its copy gone. */
function endDissolve(robotId: string): void {
  killTimeline(`dissolve-${robotId}`);
  removeCopy(robotId);
}

/**
 * The layer switch's dissolve, keyed `dissolve-${robotId}`: a front-row `<use>` of the robot's
 * group fades `'out'` (1 → 0, then goes — front → back) or `'in'` (0 → 1, and stays until the
 * front re-mount takes over — back → front) over LAYER_DISSOLVE_SECONDS. With no body or no copy
 * layer there is nothing to see: `onDone` at once.
 */
function dissolve(loop: LoopRun, robot: Robot, kind: 'out' | 'in', onDone: () => void): void {
  const layer = dissolveLayer();
  endDissolve(robot.id);
  if (!bodyOf(robot.id) || !layer) {
    onDone();
    return;
  }
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#world-robot-${robot.id}`);
  use.setAttribute('data-dissolve-copy', robot.id);
  layer.appendChild(use);
  const out = kind === 'out';
  const tl = gsap.timeline({
    paused: true,
    // Its own copy only — never a newer dissolve's for the same robot.
    onComplete: live(loop, () => {
      if (out) use.remove();
      onDone();
    }),
  });
  tl.fromTo(use, { opacity: out ? 1 : 0 }, { opacity: out ? 0 : 1, duration: LAYER_DISSOLVE_SECONDS, ease: 'none' }, 0);
  setTimeline(`dissolve-${robot.id}`, tl);
  tl.play();
}

/** Every leg the robot has in flight, gone (its job finished silently first), its dissolve ended
 *  and any layer switch still waiting for a re-mount forgotten. */
function killLegs(robotId: string): void {
  finishJobSilently(robotId);
  for (const prefix of LEG_KEY_PREFIXES) killTimeline(`${prefix}${robotId}`);
  endDissolve(robotId);
  run?.remounts.delete(robotId);
}

/** A leg cut short (recall, turn-back): the swim, the bob and the dissolve go, and a pending
 *  re-mount continues nothing — it adopts the robot instead. */
function dropLeg(loop: LoopRun, robotId: string): void {
  killTimeline(`swim-${robotId}`);
  killTimeline(`bob-wait-${robotId}`);
  endDissolve(robotId);
  loop.remounts.delete(robotId);
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
/** Swim to `destination` (a robot position), the row easing to `scale` on the way; write the
 *  position on arrival, then `onArrive`. */
function swimTo(loop: LoopRun, robot: Robot, destination: Vec2, scale: number, onArrive: () => void): void {
  const arrive = live(loop, () => {
    write(loop, robot.id, { position: destination });
    onArrive();
  });
  if (bodyOf(robot.id)) {
    easeRowWith(createSwimTimeline(robot, destination, arrive), robot, scale);
    return;
  }
  // No body to swim (createSwimTimeline would fall back to an unkeyed delayedCall that stop
  // can't kill): the same travel time, keyed like a swim.
  const distance = Math.hypot(destination.x - robot.position.x, destination.y - robot.position.y);
  const tl = timed(distance / SWIM_SPEED, arrive);
  setTimeline(`swim-${robot.id}`, tl);
  tl.play();
}

/**
 * Write the robot into robot row `layer`. With a body, React re-mounts it in that row: it is
 * marked layerSwitching first (its hooks skip the mount flourish) and `then` waits for
 * onRobotMounted. With none there is nothing to re-mount: `then` at once.
 */
function moveToRow(loop: LoopRun, robot: Robot, layer: RobotLayer, then: () => void): void {
  if (!bodyOf(robot.id)) {
    write(loop, robot.id, { layer });
    then();
    return;
  }
  markLayerSwitching(robot.id);
  loop.remounts.set(robot.id, then);
  write(loop, robot.id, { layer });
}

/**
 * A leg to `destination` (a robot position) in robot row `layer`, then `onArrive`. In the robot's
 * own row, one swim. Into the other, it splits at the switch point (`point`, else the robot's
 * answer from findLayerSwitchPoint, else where it is): see the header for the two directions.
 */
function legTo(
  loop: LoopRun,
  robot: Robot,
  destination: Vec2,
  layer: RobotLayer,
  onArrive: () => void,
  point?: Vec2,
): void {
  const from = rowOfRobot(robot);
  if (from === layer) {
    swimTo(loop, robot, destination, rowScale(layer), onArrive);
    return;
  }
  const at = point ?? switchPointFor(loop, robot, destination) ?? { ...robot.position };
  swimTo(loop, robot, at, rowScale(from), () => {
    const here = robotOf(loop, robot.id);
    if (!here) return;
    if (layer === 'background') intoBackRow(loop, here, destination, onArrive);
    else intoFrontRow(loop, here, destination, onArrive);
  });
}

/** Front → back, at the switch point: re-mount in the back row, then swim on easing to the back
 *  row's scale while the front copy fades out over it. */
function intoBackRow(loop: LoopRun, robot: Robot, destination: Vec2, onArrive: () => void): void {
  moveToRow(loop, robot, 'background', () => {
    const here = robotOf(loop, robot.id);
    if (!here) return;
    dissolve(loop, here, 'out', () => {});
    swimTo(loop, here, destination, BACK_LAYER_SCALE, onArrive);
  });
}

/** Back → front, at the switch point: swim on in the back row easing to 1 while the front copy
 *  fades in over it; when both are done, re-mount in front at rest and let the copy go. */
function intoFrontRow(loop: LoopRun, robot: Robot, destination: Vec2, onArrive: () => void): void {
  let waiting = 2;
  const settled = () => {
    if (--waiting > 0) return;
    const here = robotOf(loop, robot.id);
    if (!here) return;
    moveToRow(loop, here, 'foreground', () => {
      removeCopy(robot.id);
      onArrive();
    });
  };
  dissolve(loop, robot, 'in', settled);
  swimTo(loop, robot, destination, 1, settled);
}

function transit(loop: LoopRun, robot: Robot, site: WorkSite, job: Robot['job'], point?: Vec2): void {
  loop.siteState.set(site.id, { heldBy: robot.id, readyAt: 0 }); // readyAt is set on release
  write(loop, robot.id, { activity: 'transit', siteId: site.id, job });
  const park = positionForCentre(site.park, getRobotGem(robot.gemSeed));
  legTo(loop, robot, park, layerOf(site), () => work(loop, robot.id, site), point);
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
    layerScale: rowScale(rowOfRobot(robot)),
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

/**
 * Out of the station: the slot frees as the robot appears, then it goes to work. It leaves from the
 * back row (Task 34b, spec §1.6) — between the station's L4 and L3 — so a robot not already there is
 * hidden and moved first; the arc plays on the re-mounted body, at the back row's scale.
 */
function exitStation(loop: LoopRun, robot: Robot): void {
  write(loop, robot.id, { activity: 'exiting' });
  const station = loop.stations.find((s) => s.id === robot.stationId);
  const arc = () => {
    const here = robotOf(loop, robot.id);
    if (!here) return;
    placeRow(here, BACK_LAYER_SCALE);
    stationArc(loop, here, 'spawn', station, () => next(robot.id));
  };
  if (rowOfRobot(robot) === 'background') {
    arc();
    return;
  }
  const el = bodyOf(robot.id);
  if (el) place(el, { autoAlpha: 0 }); // nothing shows in the front row while it moves
  moveToRow(loop, robot, 'background', arc);
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
  // Stations are in the front row: a back-row robot switches on the way.
  legTo(loop, robot, portPosition(station, robot), 'foreground', () => enter(loop, robot.id, station));
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
  placeRow(robot, 1);
  // Stations are in the front row. Hidden, so a re-mount there (it adopts again) shows nothing.
  const layer = rowOfRobot(robot) === 'background' ? { layer: 'foreground' as const } : {};
  writeTo(localeId, robot.id, { activity: 'charging', position, ...layer, ...(station ? { stationId: station.id } : {}) });
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
  const points = new Map<string, Vec2>();
  const choice = chooseNextSite({
    robot: { id: robot.id, job: robot.job, centre: robotCentre(robot, getRobotGem(robot.gemSeed)) },
    sites: [...loop.sites.values()].map((s) => ({
      id: s.id,
      jobs: s.jobs,
      park: s.park,
      ready: isReady(loop, s.id, t) && reachable(loop, robot, s, points),
    })),
    heldJobs: heldJobs(robotsOf(loop.localeId), robot.id),
    rand: loop.rand,
  });
  if (!choice) {
    wait(loop, robot);
    return;
  }
  transit(loop, robot, loop.sites.get(choice.siteId)!, choice.job, points.get(choice.siteId));
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
  // Its row's scale, whatever a cut-off leg left it at (the station paths are front-row: 1).
  placeRow(current, rowScale(rowOfRobot(current)));
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
    sites: eligibleSites(localeId, options.backHosts ?? BACK_HOSTS_ENABLED),
    midground: getMidgroundSilhouettes(localeId),
    siteState: new Map(),
    stations: getStations(localeId),
    now: options.now ?? (() => gsap.ticker.time),
    rand: options.rand ?? Alea(`${localeId}:work`),
    remounts: new Map(),
  };
  run = loop;
  for (const robot of robotsOf(localeId)) {
    if (bodyOf(robot.id)) adopt(loop, robot);
  }
}

/**
 * Stop the loop: every `work-*`, `swim-*`, `bob-wait-*`, `station-*` and `dissolve-*` timeline is
 * killed and the site state cleared. A job in progress is first run to its end without its
 * callback, so the orbiters are back on their docks and the bob at rest before they're unlocked.
 * Every dissolve copy goes, and a layer switch still waiting for its re-mount is forgotten (its
 * mark cleared — the late mount is an ordinary one). Idempotent.
 */
export function stopWorkLoop(): void {
  if (!run) return;
  const loop = run;
  run = null;
  for (const key of [...timelineMap.keys()]) {
    if (!LOOP_KEY_PREFIXES.some((p) => key.startsWith(p))) continue;
    if (key.startsWith('work-')) finishJobSilently(key.slice('work-'.length));
    else killTimeline(key);
  }
  dissolveLayer()?.querySelectorAll('use[data-dissolve-copy]').forEach((use) => use.remove());
  for (const robotId of loop.remounts.keys()) clearLayerSwitching(robotId);
  loop.remounts.clear();
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
    dropLeg(loop, robotId);
    abandonSites(loop, robotId);
    returnToStation(loop, settle(loop, robotOf(loop, robotId)!));
  } else if (to === 'active') {
    if (robot.activity === 'charging') {
      exitStation(loop, robot);
    } else if (robot.activity === 'returning') {
      dropLeg(loop, robotId);
      resume(loop, settle(loop, robot));
    }
  }
}

/**
 * A world-context robot body has mounted (Robot.tsx). A layer switch's re-mount continues its leg
 * (spec §1.10); the layerSwitching mark ends here either way, its hooks having read it. Otherwise,
 * with the loop running for its locale, the loop adopts it. With none yet (a power-on), Docked and
 * Undocking robots are hidden at their station and exiting or charging ones hidden in place, so
 * nothing shows for a frame before startWorkLoop adopts them.
 */
export function onRobotMounted(localeId: string, robotId: string): void {
  clearLayerSwitching(robotId);
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;
  if (run) {
    if (run.localeId !== localeId) return;
    const continueLeg = run.remounts.get(robotId);
    run.remounts.delete(robotId);
    if (continueLeg) continueLeg();
    else adopt(run, robot);
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
