// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { startWorkLoop, stopWorkLoop, next, getSiteState } from './workLoop';
import { siteCooldown } from './siteChoice';
import { placeDistrict } from './districts';
import { isWorkSiteEligible } from './jobHosts';
import { getWorkSite, type WorkSite } from './workSites';
import { getTimeline, killAllTimelines, timelineMap } from '../animation/timelineMap';
import { registerOrbiterWork, clearRobotMotionRegistry } from '../animation/robotMotionRegistry';
import { positionForCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { getRobotGem } from '../components/robot/gem/polygon';
import { setRef, clearRefs } from '../utils/refs';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { AudioEngine } from '../engine/AudioEngine';
import { BACK_HOSTS_ENABLED, BOB_PX, SWIM_SPEED, WAIT_RETRY_SECONDS } from '../constants';
import type { Actor } from '../types/Actor';
import type { JobType, Robot } from '../types/Robot';
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
  gsap.set(el, { x: r.position.x, y: r.position.y });
  setRef(`robot-${id}`, el);
  const locals = [0, 1].map(() => {
    const copy = el.appendChild(document.createElementNS(SVG_NS, 'g'));
    const local = copy.appendChild(document.createElementNS(SVG_NS, 'g'));
    gsap.set(local, { x: 0, y: 0, scale: 1 });
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
    mount('r1');
    startWorkLoop(LOCALE, { now });
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
    const { el, control } = mount('r1');
    startWorkLoop(LOCALE, { now });
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
    const { control } = mount('r1');
    startWorkLoop(LOCALE, { now });
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
    mount('r1');
    startWorkLoop(LOCALE, { now });
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
    const { el } = mount('r1');
    startWorkLoop(LOCALE, { now });
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
    mount('r1');
    startWorkLoop(LOCALE, { now });
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
    mount('r1');
    mount('r2');
    startWorkLoop(LOCALE, { now });
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
    mount('r1');
    startWorkLoop(LOCALE, { now, rand: () => 0 });

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
    mount('r1');
    mount('r2');
    startWorkLoop(LOCALE, { now, rand: () => 0 });
    next('r2');
    expect(get('r2').job).toBe(job);
    next('r1');
    expect(get('r1').job).toBe(other);
    expect(get('r1').siteId).toBe(b.id);
  });

  it('a job that ends after the robot stopped being Active still releases the site and clears siteId', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    const { control } = mount('r1');
    startWorkLoop(LOCALE, { now });
    next('r1');
    finish('swim-r1');
    useLocaleStore.getState().updateRobot(LOCALE, 'r1', { docking: 'recalled' });
    finish('work-r1');
    expect(control.unlock).toHaveBeenCalledTimes(1);
    expect(getSiteState(a.id)).toEqual({ heldBy: undefined, readyAt: 100 + siteCooldown(1) });
    expect(get('r1').siteId).toBeUndefined();
    // next() leaves a non-Active robot to Task 23: no new leg.
    expect(getTimeline('bob-wait-r1')).toBeUndefined();
  });

  it('a robot that is not Active is left alone (recall and stations arrive in Task 23)', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park, { docking: 'docked', activity: 'charging' })]);
    mount('r1');
    startWorkLoop(LOCALE, { now });
    next('r1');
    expect(get('r1').activity).toBe('charging');
    expect(getSiteState(a.id)?.heldBy).toBeUndefined();
    expect(timelineMap.size).toBe(0);
  });

  it('next() before start, or for an unknown robot, does nothing and does not throw', () => {
    const { a } = sitesForSwitch();
    registerLocale([a], [robot('r1', siteOf(a).park)]);
    mount('r1');
    expect(() => next('r1')).not.toThrow();
    expect(get('r1').activity).toBe('exiting');
    startWorkLoop(LOCALE, { now });
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
      const { el } = mount('r1');
      startWorkLoop(LOCALE, { now });
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
      mount('r1');
      mount('r2');
      mount('r3');
      startWorkLoop(LOCALE, { now });
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
      const { el, locals, control } = mount('r1');
      startWorkLoop(LOCALE, { now });
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
      mount('r1');
      startWorkLoop(LOCALE, { now });
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
      mount('r1');
      expect(() => stopWorkLoop()).not.toThrow();
      startWorkLoop(LOCALE, { now });
      next('r1');
      startWorkLoop(LOCALE, { now });
      expect(getSiteState(a.id)?.heldBy).toBe('r1');
      stopWorkLoop();
      stopWorkLoop();
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
    mount('r1');
    startWorkLoop(LOCALE, { now });
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
