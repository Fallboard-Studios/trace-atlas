// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach, type MockInstance } from 'vitest';

import { startWorkLoop, stopWorkLoop, next, getSiteState, onLifecycleChange, onRobotMounted } from './workLoop';
import { siteCooldown } from './siteChoice';
import { placeDistrict } from './districts';
import { isWorkSiteEligible } from './jobHosts';
import { getWorkSite, type WorkSite } from './workSites';
import { getStations, type Station } from './stations';
import { getMidgroundSilhouettes } from './midgroundSilhouettes';
import * as stationsModule from './stations';
import { getTimeline, killAllTimelines, timelineMap } from '../animation/timelineMap';
import { registerOrbiterWork, registerArcDecorator, clearRobotMotionRegistry } from '../animation/robotMotionRegistry';
import { stationRippleKey } from '../animation/stationRipple';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { robotBoxAt } from '../animation/layerSwitch';
import * as layerSwitchModule from '../animation/layerSwitch';
import { getRobotGem } from '../components/robot/gem/polygon';
import { bodyShapeFromAdsr, calculateBodyScale } from '../components/robot/robotVisualHelpers';
import { chargingColorsKey } from '../components/stations/stationOccupancy';
import { setRef, clearRefs } from '../utils/refs';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { AudioEngine } from '../engine/AudioEngine';
import {
  BACK_HOSTS_ENABLED, BOB_PX, STATION_ARC_SECONDS, STATION_PORT_SCALE, STATION_REDUCED_ARC_SECONDS, SWIM_SPEED, WAIT_RETRY_SECONDS,
} from '../constants';
import type { Actor } from '../types/Actor';
import type { DockingState, JobType, Robot } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';

// vitest.setup.ts mocks gsap and fires every timeline's onComplete on a microtask, which would
// spin the wait → next → wait cycle forever. Real GSAP with the global timeline paused: nothing
// advances on its own, and each test finishes a leg with progress(1).
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const LOCALE = 'work-loop-test';
const GEM_SEED = 20261004;
const gem = getRobotGem(GEM_SEED);
const BPM = 110;

/** One real placed world, built once; its eligible work-site actors. */
let WORLD: Actor[] = [];
let SITES: { actor: Actor; site: WorkSite }[] = [];

function registerLocale(actors: Actor[], robots: Robot[]): void {
  useLocaleStore.setState({
    locales: {
      [LOCALE]: {
        id: LOCALE, attenuationStyleId: 'pelagos', name: LOCALE, coordinates: { x: 3, y: 7 },
        dayStartTimestamp: 0, createdAtMeasure: 0, robots, actors, companies: [], currentMeasure: 0,
      },
    },
  });
}

/** Single-job sites only, so a site's job is unambiguous. */
const singleJob = () => SITES.filter((s) => s.site.jobs.length === 1);

/** Two single-job sites sharing a job, and one single-job site with a different job. */
function sitesForSwitch(): { a: Actor; c: Actor; b: Actor; job: JobType; other: JobType } {
  const byJob = new Map<JobType, Actor[]>();
  for (const s of singleJob()) byJob.set(s.site.jobs[0], [...(byJob.get(s.site.jobs[0]) ?? []), s.actor]);
  const [job, [a, c]] = [...byJob].find(([, v]) => v.length >= 2)!;
  const [other, [b]] = [...byJob].find(([j]) => j !== job)!;
  return { a, c, b, job, other };
}

const siteOf = (actor: Actor) => getWorkSite(actor)!;

function robot(id: string, centre: Vec2, over: Partial<Robot> = {}): Robot {
  return {
    id,
    gemSeed: GEM_SEED,
    identityColor: '#88ccff',
    position: positionForCentre(centre, gem),
    docking: 'active',
    activity: 'exiting',
    batteryLevel: 100,
    octaveRange: [2, 4],
    audioAttributes: { adsr: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.6 }, filterFreq: 0, waveform: 'sine' },
    ...over,
  } as Robot;
}

/** Mount a robot's `.robot` group and two orbiters, and register its orbiter control. */
function mount(id: string) {
  const svg = document.body.appendChild(document.createElementNS(SVG_NS, 'svg'));
  const el = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const r = get(id);
  gsap.set(el, { x: r.position.x, y: r.position.y, immediateRender: true }); // renders even with the global timeline paused
  setRef(`robot-${id}`, el);
  const locals = [0, 1].map(() => {
    const copy = el.appendChild(document.createElementNS(SVG_NS, 'g'));
    const local = copy.appendChild(document.createElementNS(SVG_NS, 'g'));
    gsap.set(local, { x: 0, y: 0, scale: 1, immediateRender: true });
    return local;
  });
  const control = { lock: vi.fn(() => locals), unlock: vi.fn() };
  registerOrbiterWork(id, control);
  return { el, locals, control };
}

const get = (id: string) => useLocaleStore.getState().getLocaleById(LOCALE)!.robots.find((r) => r.id === id)!;

/** Finish a leg: run its timeline to the end, firing its onComplete. */
function finish(key: string): void {
  const tl = getTimeline(key);
  if (!tl) throw new Error(`no timeline ${key}; have ${[...timelineMap.keys()].join(', ')}`);
  tl.progress(1);
}

let clock = 0;
const now = () => clock;

// ========================================
// SETUP
// ========================================
beforeAll(() => {
  gsap.globalTimeline.pause();
  useLocaleStore.getState().addLocale('pelagos', {
    id: 'work-loop-world', attenuationStyleId: 'pelagos', name: 'w', coordinates: { x: 3, y: 7 },
    dayStartTimestamp: 0, createdAtMeasure: 0, robots: [], actors: [], companies: [], currentMeasure: 0,
  });
  WORLD = placeDistrict('work-loop-world');
  SITES = WORLD.filter((a) => isWorkSiteEligible(a, { backHosts: BACK_HOSTS_ENABLED }))
    .map((actor) => ({ actor, site: getWorkSite(actor)! }))
    .filter((s) => s.site);
});

afterAll(() => {
  gsap.globalTimeline.resume();
});

beforeEach(() => {
  clock = 100;
  useAudioStore.setState({ bpm: BPM });
});

afterEach(() => {
  stopWorkLoop();
  killAllTimelines();
  clearRefs();
  clearRobotMotionRegistry();
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('workLoop — the site cycle (Phase 43 Task 22, spec §1.7)', () => {
  it('the fixture world has the sites these tests need', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(7);
    expect(() => sitesForSwitch()).not.toThrow();
  });

  it("next(): an Active robot takes a ready site — 'transit', the site held, the job set, a swim to the park", () => {
    const { a, job } = sitesForSwitch();
    registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');

    const r = get('r1');
    expect(r.activity).toBe('transit');
    expect(r.siteId).toBe(a.id);
    expect(r.job).toBe(job);
    expect(getSiteState(a.id)?.heldBy).toBe('r1');
    expect(getTimeline('swim-r1')).toBeDefined();
  });

  it("arrival writes the park position and starts 'working' with the orbiters locked", () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
    startWorkLoop(LOCALE, { now });
    const { el, control } = mount('r1');
    next('r1');
    finish('swim-r1');

    const park = positionForCentre(siteOf(a).park, gem);
    const r = get('r1');
    expect(r.position).toEqual(park);
    expect(r.activity).toBe('working');
    expect(r.siteId).toBe(a.id);
    expect(control.lock).toHaveBeenCalledTimes(1);
    expect(control.unlock).not.toHaveBeenCalled();
    expect(Number(gsap.getProperty(el, 'x'))).toBeCloseTo(park.x, 3); // GSAP rounds transforms to 4 places
    expect(getTimeline('work-r1')).toBeDefined();
    expect(getTimeline('work-r1')!.duration()).toBeCloseTo(jobDuration(BPM), 6);
  });

  it('finishing the job unlocks the orbiters and releases the site with readyAt = now + siteCooldown(n)', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now });
    const { control } = mount('r1');
    next('r1');
    finish('swim-r1');
    clock = 250;
    finish('work-r1');

    expect(control.unlock).toHaveBeenCalledTimes(1);
    expect(getSiteState(a.id)).toEqual({ heldBy: undefined, readyAt: 250 + siteCooldown(1) });
    expect(get('r1').siteId).toBeUndefined();
  });

  it('the cooldown counts every eligible site in the world, not just the ones in use', () => {
    registerLocale(WORLD, [robot('r1', SITES[0].site.park)]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');
    const held = get('r1').siteId!;
    finish('swim-r1');
    finish('work-r1');
    // n large enough that the clamp doesn't hide it (COOLDOWN_MIN binds below ~7 sites).
    expect(siteCooldown(SITES.length)).toBeGreaterThan(siteCooldown(1));
    expect(getSiteState(held)!.readyAt).toBe(100 + siteCooldown(SITES.length));
  });

  it("no ready site → 'waiting' with a finite bob of WAIT_RETRY_SECONDS, then it asks again", () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now });
    const { el } = mount('r1');
    next('r1');
    finish('swim-r1');
    finish('work-r1');

    expect(get('r1').activity).toBe('waiting');
    expect(get('r1').siteId).toBeUndefined();
    const bob = getTimeline('bob-wait-r1')!;
    expect(bob.duration()).toBeCloseTo(WAIT_RETRY_SECONDS, 6);
    const y0 = get('r1').position.y;
    bob.progress(0.5); // the yoyo's peak
    expect(Number(gsap.getProperty(el, 'y'))).toBeCloseTo(y0 - BOB_PX, 3);
    bob.progress(1);
    // It asked again: still cooling, so it waits again, back where it started.
    expect(Number(gsap.getProperty(el, 'y'))).toBeCloseTo(y0, 3);
    expect(get('r1').activity).toBe('waiting');
    expect(getTimeline('bob-wait-r1')).not.toBe(bob);
  });

  it('a site is not chosen again before its readyAt — and is at exactly readyAt', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');
    finish('swim-r1');
    finish('work-r1');
    const readyAt = getSiteState(a.id)!.readyAt;

    clock = readyAt - 0.001;
    finish('bob-wait-r1');
    expect(get('r1').activity).toBe('waiting');

    clock = readyAt;
    finish('bob-wait-r1');
    // Taken. It's already on the park, so the zero-length swim lands at once: 'working'.
    expect(get('r1').siteId).toBe(a.id);
    expect(getSiteState(a.id)!.heldBy).toBe('r1');
    expect(get('r1').activity).toBe('working');
  });

  it('one robot per site: a second robot does not take a held site', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park), robot('r2', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    mount('r2');
    next('r1');
    next('r2');
    expect(get('r1').siteId).toBe(a.id);
    expect(get('r2').activity).toBe('waiting');
    expect(get('r2').siteId).toBeUndefined();
    // Still held while working.
    finish('swim-r1');
    finish('bob-wait-r2');
    expect(get('r2').activity).toBe('waiting');
  });

  it('the job sticks across sites until no ready site hosts it, then switches', () => {
    const { a, c, b, job, other } = sitesForSwitch();
    // b first, so a loop that ignored the held job would switch to it at rand 0.
    registerLocale([b, a, c], [robot('r1', siteOf(a).park, { job })]);
    startWorkLoop(LOCALE, { now, rand: () => 0 });
    mount('r1');

    next('r1');
    expect(get('r1').siteId).toBe(a.id);
    finish('swim-r1');
    finish('work-r1');
    expect(get('r1').siteId).toBe(c.id); // a is cooling; c hosts the same job
    expect(get('r1').job).toBe(job);
    finish('swim-r1');
    finish('work-r1');
    expect(get('r1').siteId).toBe(b.id); // a and c cooling: switch
    expect(get('r1').job).toBe(other);
  });

  it("a switch prefers a job no other robot holds — read from the robots' live activity", () => {
    const { a, b, c, job, other } = sitesForSwitch();
    // r2 is working `job` at a; r1 has no job; c (job) comes before b (other), so without the
    // held rule rand 0 would send r1 to c.
    registerLocale([a, c, b], [robot('r1', { x: 900, y: 300 }), robot('r2', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now, rand: () => 0 });
    mount('r1');
    mount('r2');
    next('r2');
    expect(get('r2').job).toBe(job);
    next('r1');
    expect(get('r1').job).toBe(other);
    expect(get('r1').siteId).toBe(b.id);
  });

  it('a job that ends after the robot stopped being Active still releases the site and clears siteId', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    startWorkLoop(LOCALE, { now });
    const { control } = mount('r1');
    next('r1');
    finish('swim-r1');
    useLocaleStore.getState().updateRobot(LOCALE, 'r1', { docking: 'recalled' });
    finish('work-r1');
    expect(control.unlock).toHaveBeenCalledTimes(1);
    expect(getSiteState(a.id)).toEqual({ heldBy: undefined, readyAt: 100 + siteCooldown(1) });
    expect(get('r1').siteId).toBeUndefined();
    // Task 23: next() sends a non-Active robot home rather than to another site.
    expect(getTimeline('bob-wait-r1')).toBeUndefined();
    expect(get('r1').activity).toBe('returning');
  });

  it('a charging robot that is not Active is left alone by next()', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park, { docking: 'docked', activity: 'charging' })]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('charging');
    expect(getSiteState(a.id)?.heldBy).toBeUndefined();
    expect(timelineMap.size).toBe(0);
  });

  it('next() before start, or for an unknown robot, does nothing and does not throw', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    expect(() => next('r1')).not.toThrow();
    expect(get('r1').activity).toBe('exiting');
    startWorkLoop(LOCALE, { now }); // nothing mounted, so nothing to adopt
    expect(() => next('ghost')).not.toThrow();
    expect(timelineMap.size).toBe(0);
  });

  it('a robot with no mounted body still swims for the travel time, works for jobDuration and releases', () => {
    const { a } = sitesForSwitch();
    const start = { x: 200, y: 200 };
    registerLocale([a], [robot('r1', start)]);
    startWorkLoop(LOCALE, { now });
    next('r1');
    // createSwimTimeline has no ref to animate; the loop still needs an arrival it can finish.
    const from = positionForCentre(start, gem);
    const to = positionForCentre(siteOf(a).park, gem);
    expect(getTimeline('swim-r1')!.duration()).toBeCloseTo(Math.hypot(to.x - from.x, to.y - from.y) / SWIM_SPEED, 6);
    expect(get('r1').activity).toBe('transit');
    finish('swim-r1');
    expect(get('r1').position).toEqual(to);
    expect(get('r1').activity).toBe('working');
    expect(getTimeline('work-r1')!.duration()).toBeCloseTo(jobDuration(BPM), 6);
    finish('work-r1');
    expect(getSiteState(a.id)!.heldBy).toBeUndefined();
  });

  it('reduced motion: the wait holds still', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', siteOf(a).park)]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      next('r1');
      finish('swim-r1');
      finish('work-r1');
      const y0 = Number(gsap.getProperty(el, 'y'));
      getTimeline('bob-wait-r1')!.progress(0.25);
      expect(Number(gsap.getProperty(el, 'y'))).toBe(y0);
      expect(getTimeline('bob-wait-r1')!.duration()).toBeCloseTo(WAIT_RETRY_SECONDS, 6);
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  describe('startWorkLoop / stopWorkLoop', () => {
    it('stop kills every work-, swim- and bob-wait- timeline and clears the site state', () => {
      const { a, b, c } = sitesForSwitch();
      registerLocale([a, b], [robot('r1', siteOf(a).park), robot('r2', siteOf(b).park), robot('r3', siteOf(c).park)]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      mount('r2');
      mount('r3');
      next('r1');
      finish('swim-r1'); // r1 working
      next('r2'); // r2 in transit
      next('r3'); // r3 waiting (a and b held)
      expect(getTimeline('work-r1')).toBeDefined();
      expect(getTimeline('swim-r2')).toBeDefined();
      expect(getTimeline('bob-wait-r3')).toBeDefined();
      const unrelated = gsap.timeline();
      timelineMap.set('robot-halo-r1', unrelated);

      stopWorkLoop();
      expect(getTimeline('work-r1')).toBeUndefined();
      expect(getTimeline('swim-r2')).toBeUndefined();
      expect(getTimeline('bob-wait-r3')).toBeUndefined();
      expect(getTimeline('robot-halo-r1')).toBe(unrelated);
      expect(getSiteState(a.id)).toBeUndefined();
      expect(getSiteState(b.id)).toBeUndefined();
    });

    it('stop mid-job finishes the job visually (orbiters docked, bob at rest) and unlocks, without next()', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', siteOf(a).park)]);
      startWorkLoop(LOCALE, { now });
      const { el, locals, control } = mount('r1');
      next('r1');
      finish('swim-r1');
      getTimeline('work-r1')!.progress(0.5);
      const parkY = get('r1').position.y;

      stopWorkLoop();
      expect(control.unlock).toHaveBeenCalledTimes(1);
      for (const l of locals) {
        expect(Number(gsap.getProperty(l, 'x'))).toBeCloseTo(0, 6);
        expect(Number(gsap.getProperty(l, 'y'))).toBeCloseTo(0, 6);
      }
      expect(Number(gsap.getProperty(el, 'y'))).toBeCloseTo(parkY, 3);
      expect(get('r1').activity).toBe('working'); // T23's restart decides what happens next
    });

    it('a leg finishing after stop changes nothing', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      next('r1');
      const swim = getTimeline('swim-r1')!;
      stopWorkLoop();
      const before = get('r1');
      swim.progress(1);
      expect(get('r1')).toBe(before);
      expect(timelineMap.size).toBe(0);
    });

    it('start is idempotent; stop is safe when not running; a restart starts clean', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', siteOf(a).park)]);
      expect(() => stopWorkLoop()).not.toThrow();
      startWorkLoop(LOCALE, { now });
      mount('r1');
      next('r1');
      startWorkLoop(LOCALE, { now });
      expect(getSiteState(a.id)?.heldBy).toBe('r1');
      stopWorkLoop();
      stopWorkLoop();
      clearRefs(); // a mounted robot would be adopted by the restart (tested under Task 23)
      startWorkLoop(LOCALE, { now });
      expect(getSiteState(a.id)).toBeUndefined();
    });
  });

  it('never touches AudioEngine through a full cycle (Strict Separation)', () => {
    const spies = Object.entries(AudioEngine)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => vi.spyOn(AudioEngine, k as keyof typeof AudioEngine));
    expect(spies.length).toBeGreaterThan(10);
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');
    finish('swim-r1');
    finish('work-r1');
    finish('bob-wait-r1');
    clock = 1e6;
    finish('bob-wait-r1');
    finish('swim-r1');
    stopWorkLoop();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

// ========================================
// TASK 23 — STATIONS, RECALL AND MOUNTS
// ========================================
const stations = () => getStations(LOCALE);
const portPos = (s: Station) => positionForCentre(s.port, gem);
const setRobots = (robots: Robot[]) => useLocaleStore.getState().setLocaleData(LOCALE, { robots });
const robots = () => useLocaleStore.getState().getLocaleById(LOCALE)!.robots;
const xy = (el: Element) => ({ x: Number(gsap.getProperty(el, 'x')), y: Number(gsap.getProperty(el, 'y')) });
const opacity = (el: Element) => Number(gsap.getProperty(el, 'opacity'));
const scale = (el: Element) => Number(gsap.getProperty(el, 'scaleX'));
const isHidden = (el: SVGGElement) => el.style.visibility === 'hidden' && opacity(el) === 0;
const isShown = (el: SVGGElement) => el.style.visibility !== 'hidden' && opacity(el) === 1;
const distance = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y);

function nearestStation(centre: Vec2, among = stations()): Station {
  return [...among].sort((p, q) => distance(p.center, centre) - distance(q.center, centre))[0];
}

/** Register a spy as the robot's arc decorator (RobotBody's halo ripple). */
function decorate(id: string) {
  const fn = vi.fn();
  registerArcDecorator(id, fn);
  return fn;
}

/** The lifecycle tick's write, then its seam call — the order robotSystems.ts uses. */
function land(id: string, docking: DockingState, to: 'recalled' | 'active' | 'docked') {
  useLocaleStore.getState().updateRobot(LOCALE, id, { docking });
  onLifecycleChange(LOCALE, id, to);
}

/** A station's front fragment with its ripple circle and gradient, as ChargingStation draws it. */
function mountFront(stationId: string) {
  const svg = document.body.appendChild(document.createElementNS(SVG_NS, 'svg'));
  const front = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const gradient = front.appendChild(document.createElementNS(SVG_NS, 'radialGradient'));
  gradient.setAttribute('id', `station-ripple-${stationId}`);
  const stops = Array.from({ length: 5 }, () => gradient.appendChild(document.createElementNS(SVG_NS, 'stop')));
  const circle = front.appendChild(document.createElementNS(SVG_NS, 'circle'));
  circle.setAttribute('class', 'station__ripple');
  setRef(`station-front-${stationId}`, front);
  return { stops };
}

function withReducedMotion(fn: () => void) {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  try {
    fn();
  } finally {
    window.matchMedia = matchMedia;
  }
}

/** One site; r1 Active, working at it, mounted, the loop running. */
function workingAtA() {
  const { a } = sitesForSwitch();
  registerLocale([a], [robot('r1', siteOf(a).park)]);
  startWorkLoop(LOCALE, { now });
  const m = mount('r1');
  next('r1');
  finish('swim-r1');
  expect(get('r1').activity).toBe('working');
  return { a, ...m };
}

/** One site; r1 Active at a station port, 'exiting', mounted with a decorator, the loop running. */
function exitingAt(stationIndex = 0) {
  const { a } = sitesForSwitch();
  registerLocale([a], []);
  const s = stations()[stationIndex];
  setRobots([robot('r1', s.port, { activity: 'exiting', stationId: s.id })]);
  startWorkLoop(LOCALE, { now });
  const m = mount('r1');
  const deco = decorate('r1');
  return { a, s, deco, ...m };
}

describe('workLoop — stations, recall and mounts (Phase 43 Task 23, spec §1.6/§1.7)', () => {
  it('the fixture world has at least two stations', () => {
    registerLocale([sitesForSwitch().a], []);
    expect(stations().length).toBeGreaterThanOrEqual(2);
  });

  describe('onRobotMounted', () => {
    it.each(['docked', 'undocking'] as const)('a %s robot is hidden at its station port, charging, its slot lit, with no timeline', (docking) => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[1];
      setRobots([robot('r1', { x: 200, y: 200 }, { docking, activity: 'returning', stationId: s.id })]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      onRobotMounted(LOCALE, 'r1');

      expect(get('r1').activity).toBe('charging');
      expect(get('r1').position).toEqual(portPos(s));
      expect(xy(el).x).toBeCloseTo(portPos(s).x, 3);
      expect(xy(el).y).toBeCloseTo(portPos(s).y, 3);
      expect(isHidden(el)).toBe(true);
      expect(chargingColorsKey(robots(), s.id)).toBe('#88ccff');
      expect(timelineMap.size).toBe(0);
    });

    it('a Docked robot with no station takes the nearest one with a free slot', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const far = { x: 1900, y: 100 };
      setRobots([robot('r1', far, { docking: 'docked' })]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      onRobotMounted(LOCALE, 'r1');
      const s = nearestStation(far);
      expect(get('r1').stationId).toBe(s.id);
      expect(get('r1').position).toEqual(portPos(s));
    });

    it("an Active 'exiting' robot appears at the port over STATION_ARC_SECONDS (from STATION_PORT_SCALE, fading up), then goes to work", () => {
      const { a, s, el, deco } = exitingAt();
      onRobotMounted(LOCALE, 'r1');

      const arc = getTimeline('station-r1')!;
      expect(arc).toBeDefined();
      expect(arc.duration()).toBeCloseTo(STATION_ARC_SECONDS, 6);
      expect(deco).toHaveBeenCalledTimes(1);
      expect(deco).toHaveBeenCalledWith('spawn', STATION_ARC_SECONDS, arc);
      expect(get('r1').activity).toBe('exiting');
      expect(chargingColorsKey(robots(), s.id)).toBe(''); // the slot frees as the robot appears

      arc.progress(0);
      expect(isHidden(el)).toBe(true);
      expect(scale(el)).toBeCloseTo(STATION_PORT_SCALE, 3);
      arc.progress(0.25);
      expect(opacity(el)).toBeCloseTo(0.25, 2); // opacity is linear
      expect(scale(el)).toBeCloseTo(STATION_PORT_SCALE + (1 - STATION_PORT_SCALE) * Math.sqrt(0.25), 3); // scale on √v (the sketch)
      arc.progress(1);
      expect(isShown(el)).toBe(true);
      expect(scale(el)).toBeCloseTo(1, 6);
      expect(get('r1').activity).toBe('transit');
      expect(get('r1').siteId).toBe(a.id);
    });

    it('mounted before the loop runs (a power-on): Docked and exiting robots are hidden, and startWorkLoop adopts them', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const [s0, s1] = stations();
      setRobots([
        robot('r1', s0.port, { activity: 'exiting', stationId: s0.id }),
        robot('r2', s1.port, { docking: 'docked', activity: 'charging', stationId: s1.id }),
      ]);
      const m1 = mount('r1');
      const m2 = mount('r2');
      onRobotMounted(LOCALE, 'r1');
      onRobotMounted(LOCALE, 'r2');
      expect(isHidden(m1.el)).toBe(true);
      expect(isHidden(m2.el)).toBe(true);
      expect(timelineMap.size).toBe(0);

      startWorkLoop(LOCALE, { now });
      expect(getTimeline('station-r1')).toBeDefined();
      expect(getTimeline('station-r2')).toBeUndefined();
      expect(get('r2').activity).toBe('charging');
      expect(isHidden(m2.el)).toBe(true);
    });

    it('a restart adopts a robot that was mid-job: it is shown at full size and takes a site again', () => {
      const { a, el } = workingAtA();
      stopWorkLoop();
      gsap.set(el, { autoAlpha: 0.4, scale: 0.6, immediateRender: true }); // as if a stop caught it mid-arc
      startWorkLoop(LOCALE, { now });
      expect(isShown(el)).toBe(true);
      expect(scale(el)).toBe(1);
      expect(get('r1').siteId).toBe(a.id);
      expect(getSiteState(a.id)!.heldBy).toBe('r1');
      expect(get('r1').activity).toBe('working'); // already on the park: the swim lands at once
    });

    it('a remount mid-transit releases the held site (no cooldown) and starts over', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      next('r1');
      const oldSwim = getTimeline('swim-r1');
      onRobotMounted(LOCALE, 'r1');
      // Without the release, its own hold would leave a not ready and it would wait.
      expect(get('r1').activity).toBe('transit');
      expect(getSiteState(a.id)!.heldBy).toBe('r1');
      expect(getTimeline('swim-r1')).not.toBe(oldSwim);
    });

    it('for another locale, it does nothing', () => {
      const { s, el } = exitingAt();
      onRobotMounted('elsewhere', 'r1');
      expect(getTimeline('station-r1')).toBeUndefined();
      expect(get('r1').activity).toBe('exiting');
      expect(xy(el)).toEqual({ x: portPos(s).x, y: portPos(s).y });
    });
  });

  describe("recall ('recalled')", () => {
    it('while working: the job completes, then the robot returns to the nearest station', () => {
      const { a } = workingAtA();
      const job = getTimeline('work-r1');
      land('r1', 'recalled', 'recalled');
      expect(get('r1').activity).toBe('working');
      expect(getTimeline('work-r1')).toBe(job);

      clock = 140;
      finish('work-r1');
      expect(getSiteState(a.id)).toEqual({ heldBy: undefined, readyAt: 140 + siteCooldown(1) });
      const s = nearestStation(siteOf(a).park);
      expect(get('r1').activity).toBe('returning');
      expect(get('r1').stationId).toBe(s.id);
      expect(get('r1').siteId).toBeUndefined();
      finish('swim-r1');
      expect(get('r1').position).toEqual(portPos(s));
      expect(get('r1').activity).toBe('entering');
    });

    it('in transit: it turns for home at once from where it is, and the site is released with no cooldown', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      next('r1');
      const swim = getTimeline('swim-r1')!;
      swim.progress(0.5);
      const mid = xy(el);

      land('r1', 'recalled', 'recalled');
      expect(get('r1').activity).toBe('returning');
      expect(get('r1').siteId).toBeUndefined();
      expect(getSiteState(a.id)!.heldBy).toBeUndefined();
      expect(getSiteState(a.id)!.readyAt).toBeLessThanOrEqual(clock);
      expect(get('r1').position.x).toBeCloseTo(mid.x, 6);
      expect(get('r1').position.y).toBeCloseTo(mid.y, 6);
      const home = getTimeline('swim-r1')!;
      expect(home).not.toBe(swim);
      const port = portPos(nearestStation(robotCentre(get('r1'), gem)));
      expect(home.duration()).toBeCloseTo(distance(port, mid) / SWIM_SPEED, 3);
    });

    it('while waiting: the bob stops and it returns at once', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', siteOf(a).park), robot('r2', siteOf(a).park)]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      mount('r2');
      next('r1');
      next('r2');
      expect(get('r2').activity).toBe('waiting');
      land('r2', 'recalled', 'recalled');
      expect(getTimeline('bob-wait-r2')).toBeUndefined();
      expect(get('r2').activity).toBe('returning');
      expect(getTimeline('swim-r2')).toBeDefined();
    });

    it('while exiting: the arc finishes, then it goes back in instead of to work', () => {
      const { a, s, deco } = exitingAt();
      onRobotMounted(LOCALE, 'r1');
      const arc = getTimeline('station-r1');
      land('r1', 'recalled', 'recalled');
      expect(getTimeline('station-r1')).toBe(arc);
      finish('station-r1');
      // Still on the port, so the swim home is zero-length and lands at once: straight into the entry.
      expect(get('r1').activity).toBe('entering');
      expect(get('r1').stationId).toBe(s.id);
      expect(deco).toHaveBeenLastCalledWith('despawn', STATION_ARC_SECONDS, getTimeline('station-r1'));
      expect(getSiteState(a.id)).toBeUndefined();
    });

    it('a returning robot takes the nearest station with a free slot, not a full one', () => {
      const { a } = workingAtA();
      const near = nearestStation(siteOf(a).park);
      const other = nearestStation(siteOf(a).park, stations().filter((s) => s !== near));
      const full = Array.from({ length: near.capacity }, (_, i) =>
        robot(`c${i}`, near.port, { docking: 'docked', activity: i % 2 ? 'charging' : 'entering', stationId: near.id }));
      setRobots([...robots(), ...full]);
      land('r1', 'recalled', 'recalled');
      finish('work-r1');
      expect(get('r1').stationId).toBe(other.id);
    });
  });

  describe('entering and charging', () => {
    it('at the port it shrinks to STATION_PORT_SCALE and fades out over the arc, then charges hidden with its slot lit', () => {
      const { a, el } = workingAtA();
      const deco = decorate('r1');
      land('r1', 'recalled', 'recalled');
      finish('work-r1');
      finish('swim-r1');
      const s = nearestStation(siteOf(a).park);

      const arc = getTimeline('station-r1')!;
      expect(arc.duration()).toBeCloseTo(STATION_ARC_SECONDS, 6);
      expect(deco).toHaveBeenCalledWith('despawn', STATION_ARC_SECONDS, arc);
      expect(chargingColorsKey(robots(), s.id)).toBe(''); // lit only once inside
      arc.progress(0.5);
      expect(opacity(el)).toBeCloseTo(0.5, 2); // opacity is linear
      expect(scale(el)).toBeCloseTo(1 + (STATION_PORT_SCALE - 1) * 0.25, 3); // scale on v² (the sketch)

      land('r1', 'docked', 'docked'); // no visual change
      expect(getTimeline('station-r1')).toBe(arc);
      arc.progress(1);
      expect(get('r1').activity).toBe('charging');
      expect(get('r1').position).toEqual(portPos(s));
      expect(isHidden(el)).toBe(true);
      expect(scale(el)).toBeCloseTo(STATION_PORT_SCALE, 3);
      expect(chargingColorsKey(robots(), s.id)).toBe('#88ccff');
    });

    it("'active' while charging: it exits the station", () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[0];
      setRobots([robot('r1', s.port, { docking: 'undocking', activity: 'charging', stationId: s.id })]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      const deco = decorate('r1');
      onRobotMounted(LOCALE, 'r1');
      land('r1', 'active', 'active');
      expect(get('r1').activity).toBe('exiting');
      expect(deco).toHaveBeenCalledWith('spawn', STATION_ARC_SECONDS, getTimeline('station-r1'));
    });

    it('next() leaves a returning or entering robot alone; the leg in flight decides', () => {
      workingAtA();
      land('r1', 'recalled', 'recalled');
      finish('work-r1');
      const swim = getTimeline('swim-r1');
      next('r1');
      expect(getTimeline('swim-r1')).toBe(swim);
      finish('swim-r1');
      const arc = getTimeline('station-r1');
      next('r1');
      expect(getTimeline('station-r1')).toBe(arc);
      expect(get('r1').activity).toBe('entering');
    });
  });

  describe("turn-back ('active' before it is inside)", () => {
    it('while returning: the swim home stops, the slot is released and it goes back to work', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      next('r1');
      land('r1', 'recalled', 'recalled');
      const home = getTimeline('swim-r1');
      const s = get('r1').stationId!;

      land('r1', 'active', 'active');
      expect(get('r1').activity).toBe('transit');
      expect(get('r1').siteId).toBe(a.id); // released with no cooldown, so it's ready again
      expect(getTimeline('swim-r1')).not.toBe(home);
      // The slot no longer counts it: returning, entering and charging are the occupants.
      const occupants = robots().filter((r) => r.stationId === s && ['returning', 'entering', 'charging'].includes(r.activity!));
      expect(occupants).toHaveLength(0);
    });

    it('while entering: the arc finishes, then it exits again without ever charging', () => {
      const { el } = workingAtA();
      const deco = decorate('r1');
      land('r1', 'recalled', 'recalled');
      finish('work-r1');
      finish('swim-r1');
      const enter = getTimeline('station-r1')!;
      enter.progress(0.5);

      land('r1', 'active', 'active');
      expect(getTimeline('station-r1')).toBe(enter);
      expect(get('r1').activity).toBe('entering');
      enter.progress(1);
      expect(get('r1').activity).toBe('exiting');
      const exit = getTimeline('station-r1')!;
      expect(exit).not.toBe(enter);
      expect(deco).toHaveBeenLastCalledWith('spawn', STATION_ARC_SECONDS, exit);
      exit.progress(0);
      expect(scale(el)).toBeCloseTo(STATION_PORT_SCALE, 3); // picks up where the entry left it: no pop
      clock = 1e6; // past a's cooldown from the job
      exit.progress(1);
      expect(get('r1').activity).toBe('transit');
    });
  });

  describe('the station ripple (spec §1.6)', () => {
    it("an exit plays the station's ripple in the robot's colour; a second exit while it runs is skipped", () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[0];
      const { stops } = mountFront(s.id);
      setRobots([
        robot('r1', s.port, { activity: 'exiting', stationId: s.id, identityColor: '#ff8800' }),
        robot('r2', s.port, { activity: 'exiting', stationId: s.id, identityColor: '#00ff00' }),
      ]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      mount('r2');
      onRobotMounted(LOCALE, 'r1');
      const ripple = getTimeline(stationRippleKey(s.id))!;
      expect(ripple).toBeDefined();
      onRobotMounted(LOCALE, 'r2');
      expect(getTimeline(stationRippleKey(s.id))).toBe(ripple);
      ripple.progress(0.5);
      expect(stops[2].getAttribute('stop-color')).toBe('#ff8800');
    });

    it('an entry plays it too', () => {
      const { a } = workingAtA();
      const s = nearestStation(siteOf(a).park);
      mountFront(s.id);
      land('r1', 'recalled', 'recalled');
      finish('work-r1');
      expect(getTimeline(stationRippleKey(s.id))).toBeUndefined();
      finish('swim-r1');
      expect(getTimeline(stationRippleKey(s.id))).toBeDefined();
    });
  });

  it('reduced motion: the arcs are STATION_REDUCED_ARC_SECONDS fades in place at full size, with no station ripple', () => {
    withReducedMotion(() => {
      const { s, el } = exitingAt();
      mountFront(s.id);
      onRobotMounted(LOCALE, 'r1');
      const exit = getTimeline('station-r1')!;
      expect(exit.duration()).toBeCloseTo(STATION_REDUCED_ARC_SECONDS, 6);
      exit.progress(0);
      expect(isHidden(el)).toBe(true);
      expect(scale(el)).toBe(1);
      exit.progress(0.5);
      expect(scale(el)).toBe(1);
      expect(getTimeline(stationRippleKey(s.id))).toBeUndefined();
      exit.progress(1);
      land('r1', 'recalled', 'recalled');
      finish('swim-r1');
      const enter = getTimeline('station-r1')!;
      expect(enter.duration()).toBeCloseTo(STATION_REDUCED_ARC_SECONDS, 6);
      enter.progress(0.5);
      expect(scale(el)).toBe(1);
      enter.progress(1);
      expect(isHidden(el)).toBe(true);
      expect(get('r1').activity).toBe('charging');
    });
  });

  it('a robot with no mounted body still takes the arc time at the station', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], []);
    const s = stations()[0];
    setRobots([robot('r1', s.port, { activity: 'charging', stationId: s.id })]);
    startWorkLoop(LOCALE, { now });
    next('r1'); // Active and charging: exit
    expect(get('r1').activity).toBe('exiting');
    expect(getTimeline('station-r1')!.duration()).toBeCloseTo(STATION_ARC_SECONDS, 6);
    finish('station-r1');
    expect(get('r1').activity).toBe('transit');
  });

  it('onLifecycleChange with no loop running, or for another locale, does nothing', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park, { activity: 'waiting' })]);
    expect(() => onLifecycleChange(LOCALE, 'r1', 'recalled')).not.toThrow();
    expect(get('r1').activity).toBe('waiting');
    startWorkLoop(LOCALE, { now });
    onLifecycleChange('elsewhere', 'r1', 'recalled');
    expect(get('r1').activity).toBe('waiting');
    expect(timelineMap.size).toBe(0);
    land('r1', 'recalled', 'recalled');
    expect(get('r1').activity).toBe('returning'); // control: its own locale reacts
  });

  it('stop kills the station arcs and ripples too', () => {
    const { s } = exitingAt();
    mountFront(s.id);
    onRobotMounted(LOCALE, 'r1');
    expect(getTimeline('station-r1')).toBeDefined();
    expect(getTimeline(stationRippleKey(s.id))).toBeDefined();
    stopWorkLoop();
    expect(timelineMap.size).toBe(0);
  });

  it('never touches AudioEngine through exit, work, recall, return, enter, charge and exit again (Strict Separation)', () => {
    const spies = Object.entries(AudioEngine)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => vi.spyOn(AudioEngine, k as keyof typeof AudioEngine));
    const { s } = exitingAt();
    mountFront(s.id);
    onRobotMounted(LOCALE, 'r1');
    finish('station-r1');
    finish('swim-r1');
    land('r1', 'recalled', 'recalled');
    finish('work-r1');
    finish('swim-r1');
    finish('station-r1');
    expect(get('r1').activity).toBe('charging');
    land('r1', 'docked', 'docked');
    land('r1', 'active', 'active');
    clock = 1e6; // past the cooldown from the first job
    finish('station-r1');
    expect(get('r1').activity).toBe('transit');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  describe('edges (each pinned by a mutant that survived the first pass)', () => {
    /** `capacity` robots charging at every station: nowhere to go home to. */
    const fillEveryStation = () => stations().flatMap((s) =>
      Array.from({ length: s.capacity }, (_, i) => robot(`${s.id}-c${i}`, s.port, { docking: 'docked', activity: 'charging', stationId: s.id })));

    it('every station full: a recalled robot waits (its abandoned swim gone) and goes home once a slot frees', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const chargers = fillEveryStation();
      setRobots([robot('r1', { x: 200, y: 200 }), ...chargers]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      next('r1');
      land('r1', 'recalled', 'recalled');
      expect(get('r1').activity).toBe('waiting');
      expect(getTimeline('swim-r1')).toBeUndefined();

      useLocaleStore.getState().updateRobot(LOCALE, chargers[0].id, { activity: 'exiting' });
      finish('bob-wait-r1');
      expect(get('r1').activity).toBe('returning');
      expect(get('r1').stationId).toBe(chargers[0].stationId);
    });

    it('turn-back with no ready site: it waits, and the swim home is gone (it never enters)', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 }), robot('r2', siteOf(a).park)]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      mount('r2');
      next('r2'); // r2 holds a
      next('r1'); // r1 waits
      land('r1', 'recalled', 'recalled');
      expect(get('r1').activity).toBe('returning');
      land('r1', 'active', 'active');
      expect(get('r1').activity).toBe('waiting');
      expect(getTimeline('swim-r1')).toBeUndefined();
    });

    it('a returning robot does not count itself against its own station (a remount mid-return)', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[0];
      const others = Array.from({ length: s.capacity - 1 }, (_, i) => robot(`c${i}`, s.port, { docking: 'docked', activity: 'charging', stationId: s.id }));
      setRobots([robot('r1', s.port, { docking: 'recalled', activity: 'returning', stationId: s.id }), ...others]);
      startWorkLoop(LOCALE, { now });
      mount('r1');
      onRobotMounted(LOCALE, 'r1');
      expect(get('r1').stationId).toBe(s.id); // 5 others + itself still fits
    });

    it('a remount after the robot went Docked mid-transit: hidden at its station, and the old swim is gone', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      next('r1');
      // A hidden tab: the tick ran on to Docked while the swim was still going.
      useLocaleStore.getState().updateRobot(LOCALE, 'r1', { docking: 'docked' });
      onRobotMounted(LOCALE, 'r1');
      expect(getTimeline('swim-r1')).toBeUndefined();
      expect(get('r1').activity).toBe('charging');
      expect(get('r1').siteId).toBeUndefined();
      expect(isHidden(el)).toBe(true);
      expect(getSiteState(a.id)!.heldBy).toBeUndefined();
    });

    it("an Active robot still 'charging' when adopted exits its station rather than popping into view", () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[0];
      setRobots([robot('r1', s.port, { activity: 'charging', stationId: s.id })]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      onRobotMounted(LOCALE, 'r1');
      expect(get('r1').activity).toBe('exiting');
      expect(getTimeline('station-r1')).toBeDefined();
      expect(isHidden(el)).toBe(true); // the arc's start
    });

    it('a restart mid-transit picks up from where the body is, not the last leg it finished', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', { x: 200, y: 200 })]);
      startWorkLoop(LOCALE, { now });
      const { el } = mount('r1');
      next('r1');
      getTimeline('swim-r1')!.progress(0.5);
      const mid = xy(el);
      stopWorkLoop();
      startWorkLoop(LOCALE, { now });
      expect(get('r1').position.x).toBeCloseTo(mid.x, 6);
      expect(get('r1').position.y).toBeCloseTo(mid.y, 6);
      const park = positionForCentre(siteOf(a).park, gem);
      expect(getTimeline('swim-r1')!.duration()).toBeCloseTo(distance(park, mid) / SWIM_SPEED, 3);
    });

    it('a Docked robot adopted at start drops a stale siteId', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      setRobots([robot('r1', stations()[0].port, { docking: 'docked', activity: 'returning', siteId: a.id })]);
      mount('r1');
      startWorkLoop(LOCALE, { now });
      expect(get('r1').activity).toBe('charging');
      expect(get('r1').siteId).toBeUndefined();
    });

    it('a mount in another locale leaves this run alone, even when the robot ids match (same-coordinate retransmit)', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], [robot('r1', siteOf(a).park, { activity: 'waiting' })]);
      const here = useLocaleStore.getState().locales[LOCALE];
      useLocaleStore.setState({ locales: { [LOCALE]: here, other: { ...here, id: 'other', robots: [robot('r1', { x: 9, y: 9 }, { activity: 'exiting' })] } } });
      startWorkLoop(LOCALE, { now });
      mount('r1');
      onRobotMounted('other', 'r1');
      expect(get('r1').activity).toBe('waiting');
      expect(timelineMap.size).toBe(0);
    });

    it('mounted before the loop runs, a Docked robot is moved to its port and set charging, not just hidden', () => {
      const { a } = sitesForSwitch();
      registerLocale([a], []);
      const s = stations()[0];
      setRobots([robot('r1', { x: 300, y: 600 }, { docking: 'docked', activity: 'returning', stationId: s.id })]);
      const { el } = mount('r1');
      onRobotMounted(LOCALE, 'r1');
      expect(get('r1').activity).toBe('charging');
      expect(get('r1').position).toEqual(portPos(s));
      expect(xy(el).x).toBeCloseTo(portPos(s).x, 3);
      expect(isHidden(el)).toBe(true);
    });

    it('robots use the port, not the centre, when the two differ', () => {
      const offset: Station[] = [
        { id: 'station-0', center: { x: 600, y: 320 }, port: { x: 640, y: 300 }, capacity: 6, gemSeed: 1 },
        { id: 'station-1', center: { x: 1500, y: 420 }, port: { x: 1460, y: 450 }, capacity: 6, gemSeed: 2 },
      ];
      const spy = vi.spyOn(stationsModule, 'getStations').mockReturnValue(offset);
      try {
        const { a } = sitesForSwitch();
        registerLocale([a], [robot('r1', siteOf(a).park), robot('r2', { x: 0, y: 0 }, { docking: 'docked', stationId: 'station-1' })]);
        startWorkLoop(LOCALE, { now });
        mount('r1');
        mount('r2');
        onRobotMounted(LOCALE, 'r2');
        expect(get('r2').position).toEqual(portPos(offset[1]));
        next('r1');
        finish('swim-r1');
        land('r1', 'recalled', 'recalled');
        finish('work-r1');
        finish('swim-r1');
        expect(get('r1').position).toEqual(portPos(offset.find((s) => s.id === get('r1').stationId)!));
      } finally {
        spy.mockRestore();
      }
    });
  });
});

describe('workLoop — back hosts and layer switch points (Phase 43 Task 32, spec §1.10)', () => {
  /** Every site in the fixture world with back hosts on, background ones included. */
  const allSites = () => WORLD.map((actor) => ({ actor, site: getWorkSite(actor) }))
    .filter((s): s is { actor: Actor; site: WorkSite } => !!s.site && isWorkSiteEligible(s.actor, { backHosts: true }));
  const backSites = () => allSites().filter((s) => s.site.depth === 'background');
  const frontSite = () => allSites().find((s) => s.site.depth !== 'background')!;
  /** Everything solid between the robot layers in the fixture world — hosts or not, bridges, ground. */
  const midgroundBounds = () => {
    registerLocale(WORLD, []);
    return getMidgroundSilhouettes(LOCALE);
  };
  /** Open water high above every building: a clear start for any leg. */
  const OPEN_WATER: Vec2 = { x: 960, y: 120 };

  let spy: MockInstance<typeof layerSwitchModule.findLayerSwitchPoint>;
  beforeEach(() => {
    spy = vi.spyOn(layerSwitchModule, 'findLayerSwitchPoint');
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('the fixture world has background hosts and midground silhouettes — more than its midground hosts', () => {
    expect(backSites().length).toBeGreaterThanOrEqual(1);
    const hostBounds = allSites().filter((s) => s.site.depth === 'midground').length;
    expect(midgroundBounds().length).toBeGreaterThan(hostBounds);
  });

  it('backHosts defaults to BACK_HOSTS_ENABLED (false): a background host is never offered', () => {
    expect(BACK_HOSTS_ENABLED).toBe(false);
    registerLocale([backSites()[0].actor], [robot('r1', OPEN_WATER)]);
    startWorkLoop(LOCALE, { now });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('waiting');
    expect(spy).not.toHaveBeenCalled();
  });

  it('backHosts: true — a background site with a clear switch point is taken', () => {
    const { actor, site } = backSites()[0];
    registerLocale([actor], [robot('r1', OPEN_WATER)]);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('transit');
    expect(get('r1').siteId).toBe(site.id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.results[0].value).not.toBeNull();
  });

  it("asks with the robot's position, the park position, its body-scaled box and every midground silhouette", () => {
    const { site } = backSites()[0];
    const r1 = robot('r1', OPEN_WATER);
    registerLocale(WORLD, [r1]);
    spy.mockReturnValue(null); // only foreground sites remain; the call is what's under test
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');

    const toPark = positionForCentre(site.park, gem);
    const call = spy.mock.calls.find(([, to]) => to.x === toPark.x && to.y === toPark.y);
    expect(call).toBeDefined();
    const [from, , box, bounds] = call!;
    expect(from).toEqual(r1.position);
    const scale = calculateBodyScale(r1.octaveRange, bodyShapeFromAdsr(r1.audioAttributes.adsr).scale);
    expect(box).toEqual(robotBoxAt(gem, scale));
    expect(bounds).toEqual(getMidgroundSilhouettes(LOCALE)); // the locale is the whole fixture world
  });

  it('no switch point: the background site is skipped for this decision and stays free', () => {
    const { actor, site } = backSites()[0];
    registerLocale([actor], [robot('r1', OPEN_WATER)]);
    spy.mockReturnValue(null);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('waiting');
    expect(get('r1').siteId).toBeUndefined();
    expect(getSiteState(site.id)).toBeUndefined();
  });

  it('a skipped background site leaves the rest offered — even over the job-keep rule', () => {
    const back = backSites()[0];
    const front = frontSite();
    registerLocale([back.actor, front.actor], [robot('r1', OPEN_WATER, { job: back.site.jobs[0] })]);
    spy.mockReturnValue(null);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').siteId).toBe(front.site.id);
  });

  it('the next decision asks again: a skipped site is taken once its leg clears', () => {
    const { actor, site } = backSites()[0];
    registerLocale([actor], [robot('r1', OPEN_WATER)]);
    spy.mockReturnValueOnce(null);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('waiting');
    finish('bob-wait-r1');
    expect(get('r1').siteId).toBe(site.id);
  });

  it('a front-layer robot asks for no switch point to a midground or foreground site', () => {
    registerLocale([frontSite().actor], [robot('r1', OPEN_WATER)]);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('transit');
    expect(spy).not.toHaveBeenCalled();
  });

  it("a back-layer robot asks for none to a background site, and needs one back to a front site", () => {
    registerLocale([backSites()[0].actor], [robot('r1', OPEN_WATER, { layer: 'background' })]);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    next('r1');
    expect(get('r1').activity).toBe('transit');
    expect(spy).not.toHaveBeenCalled();
    stopWorkLoop();
    killAllTimelines();

    registerLocale([frontSite().actor], [robot('r2', OPEN_WATER, { layer: 'background' })]);
    spy.mockReturnValue(null);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r2');
    next('r2');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(get('r2').activity).toBe('waiting');
  });

  it('a site that isn\'t ready is never asked about', () => {
    const { actor, site } = backSites()[0];
    registerLocale([actor], [robot('r1', OPEN_WATER), robot('r2', OPEN_WATER)]);
    startWorkLoop(LOCALE, { now, backHosts: true });
    mount('r1');
    mount('r2');
    next('r1');
    expect(getSiteState(site.id)?.heldBy).toBe('r1');
    spy.mockClear();
    next('r2');
    expect(spy).not.toHaveBeenCalled();
    expect(get('r2').activity).toBe('waiting');
  });
});
