// ========================================
// workLoop × lifecycle tick — the full cycle on simulated time (Phase 43 Task 24)
// ========================================
// The real measure tick (tickRobotLifecycle) drives the real work loop through the
// onLifecycleChange seam, on a real placed world. Time is simulated: GSAP's global timeline is
// paused and stepped a frame at a time, and the tick fires at every measure boundary of the
// Transport. A hidden tab is the Transport running ahead of GSAP (spec §1.7): `rate` is
// Transport seconds per GSAP second.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { startWorkLoop, stopWorkLoop, onRobotMounted } from './workLoop';
import { tickRobotLifecycle } from './robotSystems';
import { placeDistrict } from './districts';
import { getStations } from './stations';
import { getTimeline, killAllTimelines } from '../animation/timelineMap';
import { registerArcDecorator, registerOrbiterWork, clearRobotMotionRegistry } from '../animation/robotMotionRegistry';
import { positionForCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { jobDuration } from '../animation/jobMoves/jobDuration';
import { getRobotGem } from '../components/robot/gem/polygon';
import { chargingColorsKey } from '../components/stations/stationOccupancy';
import { setRef, clearRefs } from '../utils/refs';
import { useLocaleStore } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { BATTERY_CRITICAL_THRESHOLD, BATTERY_DRAIN_ACTIVE, BATTERY_FULL_THRESHOLD, BATTERY_RECHARGE_RATE } from '../constants';
import type { Actor } from '../types/Actor';
import type { Locale } from '../types/locale';
import type { DockingState, Robot, RobotActivity } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';

// Real tween values and callbacks; the global timeline is stepped by hand.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const LOCALE = 'work-loop-integration';
const GEM_SEED = 20261004;
const gem = getRobotGem(GEM_SEED);
const COLOR = '#88ccff';
/** One frame of GSAP time. */
const DT = 1 / 30;
/** Measures from a critical recall back to Active: the Recalled hold, the recharge, the Undocking hold. */
const MEASURES_TO_ACTIVE = 1 + Math.ceil((BATTERY_FULL_THRESHOLD - BATTERY_CRITICAL_THRESHOLD) / BATTERY_RECHARGE_RATE) + 1;

let WORLD: Actor[] = [];
/** The placed world's locale record, kept so each test can rebuild LOCALE from it. */
let WORLD_LOCALE: Locale;

function robot(id: string, centre: Vec2, over: Partial<Robot> = {}): Robot {
  return {
    id,
    compositionSeed: 0.5,
    name: id,
    identityColor: COLOR,
    gemSeed: GEM_SEED,
    position: positionForCentre(centre, gem),
    melody: [
      { id: 'e1', startStep: 1, length: '16n', noteIndex: 0, octave: 4 },
      { id: 'e2', startStep: 5, length: '16n', noteIndex: 1, octave: 4 },
    ],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
      filterFreq: 800,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 4],
    createdAt: 0,
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 100,
    ...over,
  } as Robot;
}

/** r1's activity and docking, each time either changes. */
interface Event {
  t: number;
  activity?: RobotActivity;
  docking: DockingState;
}

/** What a 'charging' landing looked like at the moment it was written. */
interface ChargingSeen {
  hidden: boolean;
  lit: string;
}

const get = (id: string) => useLocaleStore.getState().getRobotById(LOCALE, id)!;

/**
 * The world with r1 (mounted, exiting its station) and two body-less companions that keep the
 * never-zero-Active rule from blocking r1's recall. Returns the stepping controls and r1's trace.
 */
function simulate(bpm: number) {
  useAudioStore.setState({ bpm });
  const locale = WORLD_LOCALE;
  useLocaleStore.setState({ locales: { [LOCALE]: { ...locale, id: LOCALE, name: LOCALE, actors: WORLD, robots: [] } } });
  const [s0, s1] = getStations(LOCALE);
  useLocaleStore.getState().setLocaleData(LOCALE, {
    robots: [
      robot('r1', s0.port, { activity: 'exiting', stationId: s0.id }),
      robot('r2', s1.port, { activity: 'exiting', stationId: s1.id }),
      robot('r3', s1.port, { activity: 'exiting', stationId: s1.id }),
    ],
  });

  let gsapT = 0;
  let transportT = 0;
  let measure = 0;
  const t0 = gsap.globalTimeline.time();
  startWorkLoop(LOCALE, { now: () => gsapT, rand: () => 0.5 });

  // r1's body: a `.robot` group with two orbiters, as in workLoop.test.ts.
  const svg = document.body.appendChild(document.createElementNS(SVG_NS, 'svg'));
  const el = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  gsap.set(el, { x: get('r1').position.x, y: get('r1').position.y, immediateRender: true });
  setRef('robot-r1', el);
  const locals = [0, 1].map(() => el.appendChild(document.createElementNS(SVG_NS, 'g')).appendChild(document.createElementNS(SVG_NS, 'g')));
  registerOrbiterWork('r1', { lock: () => locals, unlock: () => {} });
  const decorate = vi.fn();
  registerArcDecorator('r1', decorate);

  const trace: Event[] = [];
  const charging: ChargingSeen[] = [];
  const record = () => {
    const r = get('r1');
    const last = trace[trace.length - 1];
    if (last && last.activity === r.activity && last.docking === r.docking) return;
    trace.push({ t: gsapT, activity: r.activity, docking: r.docking });
    if (r.activity === 'charging' && last?.activity !== 'charging') {
      charging.push({
        hidden: el.style.visibility === 'hidden' && Number(gsap.getProperty(el, 'opacity')) === 0,
        lit: chargingColorsKey(useLocaleStore.getState().getLocaleById(LOCALE)!.robots, r.stationId!),
      });
    }
  };
  const unsubscribe = useLocaleStore.subscribe(record);
  onRobotMounted(LOCALE, 'r1');
  record();

  const measureSeconds = (4 * 60) / bpm;
  /** One GSAP frame; the Transport moves `rate` times as far, ticking each measure it crosses. */
  const step = (rate = 1) => {
    gsapT += DT;
    gsap.globalTimeline.time(t0 + gsapT);
    transportT += DT * rate;
    while (transportT >= (measure + 1) * measureSeconds) {
      measure += 1;
      tickRobotLifecycle(LOCALE, measure);
    }
  };
  /** Step until `done()` (true) or `maxSeconds` of GSAP time pass (false). */
  const runUntil = (done: () => boolean, maxSeconds: number, rate = 1) => {
    for (let s = 0; s < maxSeconds / DT; s++) {
      if (done()) return true;
      step(rate);
    }
    return done();
  };
  const activity = () => get('r1').activity;

  return { el, trace, charging, decorate, runUntil, activity, measureSeconds, unsubscribe };
}

/** `wanted` appears in order (not necessarily adjacent) among the trace's activities. */
function hasSubsequence(trace: Event[], wanted: RobotActivity[]): boolean {
  let i = 0;
  for (const e of trace) if (e.activity === wanted[i]) i++;
  return i === wanted.length;
}

/** Each finished 'working' stretch: when it started and how long it lasted. */
function workStretches(trace: Event[]): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  let start: number | null = null;
  for (const e of trace) {
    if (e.activity === 'working' && start === null) start = e.t;
    else if (e.activity !== 'working' && start !== null) {
      out.push({ start, length: e.t - start });
      start = null;
    }
  }
  return out;
}

const activitiesAfter = (trace: Event[], from: number) => trace.slice(from).map((e) => e.activity);

// ========================================
// SETUP
// ========================================
beforeAll(() => {
  gsap.globalTimeline.pause();
  useLocaleStore.getState().addLocale('pelagos', {
    id: 'work-loop-integration-world', attenuationStyleId: 'pelagos', name: 'w', coordinates: { x: 3, y: 7 },
    dayStartTimestamp: 0, createdAtMeasure: 0, robots: [], actors: [], companies: [], currentMeasure: 0,
  });
  WORLD = placeDistrict('work-loop-integration-world');
  WORLD_LOCALE = useLocaleStore.getState().getLocaleById('work-loop-integration-world')!;
});

afterAll(() => {
  gsap.globalTimeline.resume();
});

let sim: ReturnType<typeof simulate> | null = null;

beforeEach(() => {
  sim = null;
});

afterEach(() => {
  sim?.unsubscribe();
  stopWorkLoop();
  killAllTimelines();
  clearRefs();
  clearRobotMotionRegistry();
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('the work loop under the real lifecycle tick (Phase 43 Task 24)', () => {
  it('the fixture world has at least two stations', () => {
    sim = simulate(110);
    expect(getStations(LOCALE).length).toBeGreaterThanOrEqual(2);
  });

  it.each([20, 110, 200])(
    'at %i BPM: works → recalled → finishes → enters → charges (hidden, slot lit) → undocks → exits → works',
    (bpm) => {
      sim = simulate(bpm);
      expect(sim.runUntil(() => sim!.activity() === 'working', 120)).toBe(true);
      // The next measure crosses critical: a recall, with r2 and r3 still Active.
      useLocaleStore.getState().updateRobot(LOCALE, 'r1', { batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
      const recalledFrom = sim.trace.length;
      expect(sim.runUntil(() => sim!.activity() === 'charging', 120)).toBe(true);
      expect(sim.runUntil(() => sim!.activity() === 'working', (MEASURES_TO_ACTIVE + 4) * sim!.measureSeconds + 60)).toBe(true);

      expect(hasSubsequence(sim.trace, ['exiting', 'transit', 'working', 'returning', 'entering', 'charging', 'exiting', 'transit', 'working'])).toBe(true);
      // It goes home only once the tick has recalled it.
      const firstReturn = sim.trace.find((e) => e.activity === 'returning')!;
      expect(firstReturn.docking).not.toBe('active');
      // Inside: hidden, its slot lit in its colour.
      expect(sim.charging).toEqual([{ hidden: true, lit: COLOR }]);
      // Every job ran its full length — a recall mid-job lets it finish.
      for (const w of workStretches(sim.trace)) expect(w.length).toBeGreaterThanOrEqual(jobDuration(bpm) - 2 * DT);
      // The decorator saw the exit, the entry and the exit again.
      expect(sim.decorate.mock.calls.map(([kind]) => kind)).toEqual(['spawn', 'despawn', 'spawn']);
      if (bpm >= 110) {
        // A measure is shorter than a job here, so the recall lands mid-job.
        const recall = sim.trace.slice(recalledFrom).find((e) => e.docking === 'recalled')!;
        expect(recall.activity).toBe('working');
      }
    },
    30_000,
  );

  it('200 BPM, a hidden tab on the swim home: Active lands before it gets there, and it turns back to work without entering', () => {
    sim = simulate(200);
    expect(sim.runUntil(() => sim!.activity() === 'working', 120)).toBe(true);
    useLocaleStore.getState().updateRobot(LOCALE, 'r1', { batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
    expect(sim.runUntil(() => sim!.activity() === 'returning', 60)).toBe(true);
    const home = getTimeline('swim-r1')!.duration();
    expect(home).toBeGreaterThan(0.5); // a real swim, so there's time to turn back in
    const from = sim.trace.length - 1;

    // Throttled until it lands Active: the whole recharge passes in the first half of the swim.
    const rate = Math.ceil((MEASURES_TO_ACTIVE + 1) * sim.measureSeconds / (home / 2));
    expect(sim.runUntil(() => get('r1').docking === 'active', home * 0.9, rate)).toBe(true);
    expect(sim.activity()).not.toBe('returning'); // turned back on the spot
    expect(sim.runUntil(() => sim!.activity() === 'working', 60)).toBe(true);

    const after = activitiesAfter(sim.trace, from);
    expect(after).not.toContain('entering');
    expect(after).not.toContain('charging');
    expect(sim.charging).toEqual([]);
  }, 30_000);

  it('200 BPM, a hidden tab during the entry: the arc finishes, then it exits again without charging', () => {
    sim = simulate(200);
    expect(sim.runUntil(() => sim!.activity() === 'working', 120)).toBe(true);
    useLocaleStore.getState().updateRobot(LOCALE, 'r1', { batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
    expect(sim.runUntil(() => sim!.activity() === 'entering', 120)).toBe(true);
    const from = sim.trace.length - 1;

    // Throttled only until it lands Active (inside the first half of the arc) — any longer and the
    // fast Transport would drain it into a second recall before the arc ends.
    const rate = Math.ceil((MEASURES_TO_ACTIVE + 1) * sim.measureSeconds / 0.5);
    expect(sim.runUntil(() => get('r1').docking === 'active', 0.9, rate)).toBe(true);
    expect(sim.activity()).toBe('entering');
    expect(sim.runUntil(() => sim!.activity() !== 'entering', 2)).toBe(true);
    expect(sim.activity()).toBe('exiting');
    expect(sim.runUntil(() => sim!.activity() === 'working', 60)).toBe(true);
    expect(activitiesAfter(sim.trace, from)).not.toContain('charging');
    expect(sim.charging).toEqual([]);
  }, 30_000);
});
