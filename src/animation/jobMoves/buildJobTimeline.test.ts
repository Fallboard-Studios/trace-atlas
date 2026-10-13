// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildJobTimeline, type JobTimelineInput } from './buildJobTimeline';
import { hoverPulseTargets } from './hoverPulse';
import { fanTargets } from './fan';
import { carryTargets } from './carry';
import { JOB_MOVES, moveWindows, type MoveStep } from './jobMoveTable';
import type { JobTimelineData, MoveEvents } from './decor/events';
import { jobDuration } from './jobDuration';
import { traceRoute, traceTimes } from './trace';
import { RING_SEGMENTS, ringRadius, ringRoute, ringStartAngles, sparkChords } from './ring';
import { workVariation, turnRanks } from './variation';
import type { OrbiterCorner } from './sceneToOrbiterLocal';
import { getTimeline, killTimeline, killAllTimelines } from '../timelineMap';
import { AudioEngine } from '../../engine/AudioEngine';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../../components/robot/gem/polygon';
import { orbiterPlan, ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import {
  BOB_PX,
  BOB_CYCLE_SECONDS,
  CARRY_SHRINK,
  FAN_PING_SCALE,
  FAN_RADIUS,
  FLICKER_OPACITY,
  HOVER_PULSE_SCALE,
  RING_REVOLUTIONS,
} from '../../constants';
import { JobType } from '../../types/Robot';
import type { Vec2 } from '../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const FRAME = 1 / 60;
/** A roof outline with unequal legs: west end, the face split, east end, a step down. */
const SITE_PATH = [{ x: 380, y: 430 }, { x: 440, y: 430 }, { x: 520, y: 430 }, { x: 520, y: 450 }];

/** A world robot as the loop sees it: the `.robot` group at its position (Robot.tsx's gsap.set),
 *  and the shown orbiters' `.gem__orbiter > .gem__orbiter-local` pairs, locals at rest. */
function mount(count: number, restScale = 1, gemSeed = GEM_SEED) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  const robotEl = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const robot = { id: 'r7', position: { x: 400, y: 300 }, gemSeed };
  gsap.set(robotEl, { x: robot.position.x, y: robot.position.y });
  const orbiters = Array.from({ length: count }, () => {
    const copy = robotEl.appendChild(document.createElementNS(SVG_NS, 'g'));
    copy.setAttribute('class', 'gem__orbiter');
    const local = copy.appendChild(document.createElementNS(SVG_NS, 'g'));
    local.setAttribute('class', 'gem__orbiter-local');
    gsap.set(local, { x: 0, y: 0, scale: restScale, opacity: 1 });
    return local;
  });
  return { robot, robotEl, orbiters };
}

function input(count: number, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, restScale = 1, gemSeed = GEM_SEED): JobTimelineInput & ReturnType<typeof mount> {
  const m = mount(count, restScale, gemSeed);
  return {
    ...m,
    site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }], paths: { outline: SITE_PATH } },
    job: JobType.VentExtraction,
    bpm: 110,
    decorTier: 'all',
    bodyScale: 1.2,
    layerScale: 1,
    reducedMotion: false,
    onComplete: vi.fn(),
    ...over,
  };
}

const num = (el: Element, prop: string) => Number(gsap.getProperty(el, prop));

/** The corners a robot shows at this count, in lock (cornerOrder) order. */
const shownCorners = (gemSeed: number, n: number) => orbiterPlan(gemSeed).cornerOrder.slice(0, n) as OrbiterCorner[];

/** Where orbiter j's centre is in the scene right now, through the whole chain: the `.robot`
 *  x/y, g.gem's scale about the canvas centre, the copy's y (the counter-bob) and the local x/y. */
function sceneCentre(i: ReturnType<typeof input>, j: number) {
  const s = i.bodyScale * i.layerScale;
  const g = getRobotGem(i.robot.gemSeed);
  const cx = gemWidth(g) / 2;
  const cy = GEM_CANVAS_H / 2;
  const part = g.orbiters[orbiterPlan(i.robot.gemSeed).cornerOrder[j]];
  const local = i.orbiters[j];
  const copy = local.parentElement!;
  const canvasX = part.x + part.w / 2 + num(copy, 'x') + num(local, 'x');
  const canvasY = part.y + part.h / 2 + num(copy, 'y') + num(local, 'y');
  return {
    x: num(i.robotEl, 'x') + cx + s * (canvasX - cx),
    y: num(i.robotEl, 'y') + cy + s * (canvasY - cy),
  };
}

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('job timeline constants (spec §1.9, Task 0b)', () => {
  it('bobs ±6 u on a ≈1.2 s cycle', () => {
    expect(BOB_PX).toBe(6);
    expect(BOB_CYCLE_SECONDS).toBe(1.2);
  });
});

describe('buildJobTimeline (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, Task 19)', () => {
  it('lasts jobDuration(bpm) at 20, 110 and 200 BPM (± one frame), with or without reduced motion', () => {
    for (const bpm of [20, 110, 200]) {
      for (const reducedMotion of [false, true]) {
        const tl = buildJobTimeline(input(3, { bpm, reducedMotion }));
        expect(Math.abs(tl.duration() - jobDuration(bpm))).toBeLessThanOrEqual(FRAME);
      }
    }
  });

  it('orbiter count 0–4 changes which orbiters move, never the duration', () => {
    for (let n = 0; n <= 4; n++) {
      const i = input(n);
      const tl = buildJobTimeline(i);
      expect(Math.abs(tl.duration() - jobDuration(110))).toBeLessThanOrEqual(FRAME);
      tl.time(tl.duration() / 2);
      for (const local of i.orbiters) expect(Math.hypot(num(local, 'x'), num(local, 'y'))).toBeGreaterThan(1);
    }
  });

  it('is registered in timelineMap as work-${robotId}, paused, with nothing moved yet', () => {
    const i = input(2);
    const tl = buildJobTimeline(i);
    expect(getTimeline('work-r7')).toBe(tl);
    expect(tl.paused()).toBe(true);
    expect(num(i.robotEl, 'y')).toBe(300);
    for (const local of i.orbiters) expect([num(local, 'x'), num(local, 'y')]).toEqual([0, 0]);
  });

  it('detaches each orbiter to its hoverPulse target round points[0], turned by the robot\'s phase, and holds it still in the scene while the body bobs', () => {
    for (const layerScale of [1, 0.75]) {
      const i = input(4, { layerScale });
      const tl = buildJobTimeline(i);
      const targets = hoverPulseTargets(i.site.points[0], 4, workVariation(GEM_SEED).phase);
      const D = tl.duration();
      for (let t = ATTACH_DURATION; t <= D - ATTACH_DURATION + 1e-9; t += 0.37) {
        tl.time(t);
        i.orbiters.forEach((_, j) => {
          const at = sceneCentre(i, j);
          expect(Math.abs(at.x - targets[j].x)).toBeLessThan(0.01);
          expect(Math.abs(at.y - targets[j].y)).toBeLessThan(0.01);
        });
      }
    }
  });

  it('each flight takes the whole ATTACH_DURATION: halfway through the detach and the reattach, every orbiter is between dock and target', () => {
    const i = input(4, { bpm: 20 });
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    tl.time(ATTACH_DURATION);
    const atTarget = i.orbiters.map((local) => ({ x: num(local, 'x'), y: num(local, 'y') }));
    for (const t of [ATTACH_DURATION / 2, D - ATTACH_DURATION / 2]) {
      tl.time(t);
      i.orbiters.forEach((local, j) => {
        const fromDock = Math.hypot(num(local, 'x'), num(local, 'y'));
        const toTarget = Math.hypot(num(local, 'x') - atTarget[j].x, num(local, 'y') - atTarget[j].y);
        const span = Math.hypot(atTarget[j].x, atTarget[j].y);
        expect(fromDock).toBeGreaterThan(0.25 * span);
        expect(toTarget).toBeGreaterThan(0.25 * span);
      });
    }
  });

  it('bobs the robot ±BOB_PX in whole cycles and ends the bob where it started', () => {
    const i = input(2);
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const cycles = Math.round(D / BOB_CYCLE_SECONDS);
    const ys: number[] = [];
    for (let k = 0; k <= 400; k++) {
      tl.time((k / 400) * D);
      ys.push(num(i.robotEl, 'y'));
    }
    expect(Math.max(...ys)).toBeCloseTo(300 + BOB_PX, 1);
    expect(Math.min(...ys)).toBeCloseTo(300 - BOB_PX, 1);
    // Back at rest at every whole cycle, the last of them the timeline's end.
    for (let c = 1; c <= cycles; c++) {
      tl.time((c / cycles) * D);
      expect(num(i.robotEl, 'y')).toBeCloseTo(300, 6);
    }
    expect(num(i.robotEl, 'x')).toBe(400);
  });

  it('pulses the orbiters in the robot\'s turn order above their rest scale during the work', () => {
    const i = input(3, {}, 0.8);
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const slot = (D - 2 * ATTACH_DURATION) / 3;
    const ranks = turnRanks(workVariation(GEM_SEED).order, shownCorners(GEM_SEED, 3));
    expect(ranks).not.toEqual([0, 1, 2]); // the fixture's order differs from lock order, so this test can tell
    for (let turn = 0; turn < 3; turn++) {
      tl.time(ATTACH_DURATION + (turn + 0.5) * slot);
      i.orbiters.forEach((local, k) => expect(num(local, 'scale')).toBeCloseTo(ranks[k] === turn ? 0.8 * HOVER_PULSE_SCALE : 0.8, 6));
    }
  });

  it('ends with every orbiter docked (x 0, y 0), its rest scale and opacity back, the copies and the robot at rest', () => {
    const i = input(4, { bpm: 200 }, 1.15);
    const tl = buildJobTimeline(i);
    tl.progress(1);
    for (const local of i.orbiters) {
      expect(num(local, 'x')).toBeCloseTo(0, 9);
      expect(num(local, 'y')).toBeCloseTo(0, 9);
      expect(num(local, 'scale')).toBeCloseTo(1.15, 9);
      expect(num(local, 'opacity')).toBeCloseTo(1, 9);
      expect(num(local.parentElement!, 'y')).toBeCloseTo(0, 9);
    }
    expect(num(i.robotEl, 'y')).toBeCloseTo(300, 9);
  });

  it('calls onComplete once, when the run finishes', () => {
    const i = input(2);
    const tl = buildJobTimeline(i);
    tl.progress(0.99);
    expect(i.onComplete).not.toHaveBeenCalled();
    tl.progress(1);
    expect(i.onComplete).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: an in-place opacity pulse 1 → 0.8 on the robot, no bob, orbiters never touched', () => {
    const i = input(3, { reducedMotion: true });
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const opacities: number[] = [];
    for (let k = 0; k <= 200; k++) {
      tl.time((k / 200) * D);
      opacities.push(num(i.robotEl, 'opacity'));
      expect(num(i.robotEl, 'y')).toBe(300);
      for (const local of i.orbiters) expect([num(local, 'x'), num(local, 'y'), num(local, 'scale')]).toEqual([0, 0, 1]);
    }
    expect(Math.min(...opacities)).toBeCloseTo(0.8, 2);
    expect(Math.max(...opacities)).toBeCloseTo(1, 9);
    tl.progress(1);
    expect(num(i.robotEl, 'opacity')).toBe(1);
    expect(i.onComplete).toHaveBeenCalledTimes(1);
  });

  it('never touches AudioEngine, start to finish', () => {
    const spies = Object.entries(AudioEngine)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => vi.spyOn(AudioEngine, k as keyof typeof AudioEngine));
    expect(spies.length).toBeGreaterThan(10);
    for (const reducedMotion of [false, true]) {
      const tl = buildJobTimeline(input(4, { reducedMotion }));
      for (let k = 0; k <= 20; k++) tl.progress(k / 20);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('killing the key leaves no live tweens on the robot, the copies or the orbiters', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    tl.play();
    const targets = [i.robotEl, ...i.orbiters, ...i.orbiters.map((l) => l.parentElement!)];
    expect(gsap.getTweensOf(targets).length).toBeGreaterThan(0);
    killTimeline('work-r7');
    expect(getTimeline('work-r7')).toBeUndefined();
    expect(gsap.getTweensOf(targets)).toHaveLength(0);
  });

  it('a second run for the same robot replaces (kills) the first', () => {
    const a = input(1);
    buildJobTimeline(a);
    const firstTargets = [a.robotEl, ...a.orbiters];
    expect(gsap.getTweensOf(firstTargets).length).toBeGreaterThan(0);
    const second = buildJobTimeline(input(1));
    expect(getTimeline('work-r7')).toBe(second);
    expect(gsap.getTweensOf(firstTargets)).toHaveLength(0);
  });
});

describe('buildJobTimeline — trace, ring and per-robot variation (Task 28)', () => {
  /** The first gem seed from GEM_SEED up whose variation passes `pred`. */
  function seedWhere(pred: (v: ReturnType<typeof workVariation>) => boolean): number {
    for (let s = GEM_SEED; s < GEM_SEED + 1000; s++) if (pred(workVariation(s))) return s;
    throw new Error('no seed found');
  }

  const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

  /** When a polyline run reaches each vertex: start + its share of the length × run. */
  function vertexTimes(route: readonly Vec2[], start: number, run: number): number[] {
    const lengths = route.slice(1).map((p, k) => dist(route[k], p));
    const total = lengths.reduce((a, b) => a + b, 0);
    let acc = 0;
    return route.map((_, k) => {
      if (k > 0) acc += lengths[k - 1];
      return start + (acc / total) * run;
    });
  }

  it('structuralInspection: every orbiter visits every vertex of the site path in order, inside the work window, in the robot\'s direction', () => {
    for (const reversed of [false, true]) {
      const seed = seedWhere((v) => v.traceReversed === reversed);
      for (const n of [1, 4]) {
        for (const layerScale of [1, 0.75]) {
          const i = input(n, { job: JobType.StructuralInspection, layerScale }, 1, seed);
          const tl = buildJobTimeline(i);
          const D = tl.duration();
          const route = traceRoute(SITE_PATH, reversed);
          expect(route[0]).toEqual(reversed ? SITE_PATH[SITE_PATH.length - 1] : SITE_PATH[0]);
          const ranks = turnRanks(workVariation(seed).order, shownCorners(seed, n));
          const { starts, run } = traceTimes(ranks, ATTACH_DURATION, D - ATTACH_DURATION);
          i.orbiters.forEach((_, j) => {
            const times = vertexTimes(route, starts[j], run);
            for (let k = 1; k < times.length; k++) expect(times[k]).toBeGreaterThan(times[k - 1]);
            expect(times[0]).toBeGreaterThanOrEqual(ATTACH_DURATION - 1e-9);
            expect(times[times.length - 1]).toBeLessThanOrEqual(D - ATTACH_DURATION + 1e-9);
            route.forEach((p, k) => {
              tl.time(times[k]);
              expect(dist(sceneCentre(i, j), p)).toBeLessThan(0.01);
            });
          });
        }
      }
    }
  });

  it('structuralInspection: the detach gathers every orbiter on the first vertex, and each holds the last until the reattach', () => {
    const i = input(4, { job: JobType.StructuralInspection });
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const route = traceRoute(SITE_PATH, workVariation(GEM_SEED).traceReversed);
    tl.time(ATTACH_DURATION);
    i.orbiters.forEach((_, j) => expect(dist(sceneCentre(i, j), route[0])).toBeLessThan(0.01));
    tl.time(D - ATTACH_DURATION);
    i.orbiters.forEach((_, j) => expect(dist(sceneCentre(i, j), route[route.length - 1])).toBeLessThan(0.01));
  });

  it('acousticSurvey\'s ring (its second move): every orbiter circles points[0] at the robot\'s radius ±1 u, evenly phased, in its direction, for RING_REVOLUTIONS turns', () => {
    for (const direction of [1, -1] as const) {
      const seed = seedWhere((v) => v.ringDirection === direction);
      const v = workVariation(seed);
      const r = ringRadius(v.radiusScale);
      for (const layerScale of [1, 0.75]) {
        const n = 3;
        const i = input(n, { job: JobType.AcousticSurvey, layerScale, bpm: 200 }, 1, seed);
        const centre = i.site.points[0];
        const tl = buildJobTimeline(i);
        const ringWindow = moveWindows(2, tl.duration())[1];
        const angleOf = (j: number) => {
          const p = sceneCentre(i, j);
          return Math.atan2(p.y - centre.y, p.x - centre.x);
        };

        tl.time(ringWindow.start);
        expect(Math.cos(angleOf(0) - (v.phase - Math.PI / 2))).toBeCloseTo(1, 6);

        let swept = 0;
        let last = angleOf(0);
        for (let t = ringWindow.start; t <= ringWindow.end + 1e-9; t += 0.05) {
          tl.time(t);
          for (let j = 0; j < n; j++) {
            expect(Math.abs(dist(sceneCentre(i, j), centre) - r)).toBeLessThanOrEqual(1);
            if (j > 0) {
              const gap = (angleOf(j) - angleOf(j - 1) + 4 * Math.PI) % (2 * Math.PI);
              expect(gap).toBeCloseTo((2 * Math.PI) / n, 2);
            }
          }
          const now = angleOf(0);
          const step = Math.atan2(Math.sin(now - last), Math.cos(now - last));
          if (Math.abs(step) > 1e-9) expect(Math.sign(step)).toBe(direction);
          swept += step;
          last = now;
        }
        tl.time(ringWindow.end);
        const now = angleOf(0);
        swept += Math.atan2(Math.sin(now - last), Math.cos(now - last));
        expect(swept).toBeCloseTo(direction * 2 * Math.PI * RING_REVOLUTIONS, 2);
      }
    }
  });

  it('every job lasts jobDuration(bpm) with 0–4 orbiters and ends with them docked (scale and opacity restored), the robot at rest', () => {
    for (const job of Object.values(JobType)) {
      for (const n of [0, 1, 4]) {
        for (const bpm of [20, 200]) {
          const i = input(n, { job, bpm }, 1.1);
          const tl = buildJobTimeline(i);
          expect(Math.abs(tl.duration() - jobDuration(bpm))).toBeLessThanOrEqual(FRAME);
          tl.progress(1);
          for (const local of i.orbiters) {
            expect(num(local, 'x')).toBeCloseTo(0, 9);
            expect(num(local, 'y')).toBeCloseTo(0, 9);
            expect(num(local, 'scale')).toBeCloseTo(1.1, 9);
            expect(num(local, 'opacity')).toBeCloseTo(1, 9);
            expect(num(local.parentElement!, 'y')).toBeCloseTo(0, 9);
          }
          expect(num(i.robotEl, 'y')).toBeCloseTo(300, 9);
        }
      }
    }
  });

  it('reduced motion is the same in-place pulse for every job: no orbiter moves, scales or flickers', () => {
    for (const job of Object.values(JobType)) {
      const i = input(3, { job, reducedMotion: true });
      const tl = buildJobTimeline(i);
      for (let k = 0; k <= 20; k++) {
        tl.progress(k / 20);
        for (const local of i.orbiters) {
          expect([num(local, 'x'), num(local, 'y'), num(local, 'scale'), num(local, 'opacity')]).toEqual([0, 0, 1, 1]);
        }
      }
    }
  });
});

describe('buildJobTimeline — the six-job table (Task 29)', () => {
  const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
  const PIPE: Vec2[] = [{ x: 400, y: 440 }, { x: 500, y: 440 }];

  /** Every orbiter's scene centre is within 0.01 u of its target at time t. */
  function expectAt(i: ReturnType<typeof input>, tl: gsap.core.Timeline, t: number, targets: readonly Vec2[], label: string) {
    tl.time(t);
    i.orbiters.forEach((_, j) => expect(dist(sceneCentre(i, j), targets[j]), `${label}, orbiter ${j}`).toBeLessThan(0.01));
  }

  it('each job\'s timeline runs its moves in the table\'s windows and totals jobDuration', () => {
    for (const job of Object.values(JobType)) {
      for (const bpm of [20, 110, 200]) {
        const tl = buildJobTimeline(input(2, { job, bpm }));
        expect(Math.abs(tl.duration() - jobDuration(bpm)), `${job} ${bpm}`).toBeLessThanOrEqual(FRAME);
        expect(moveWindows(JOB_MOVES[job].length, tl.duration()).at(-1)!.end).toBeCloseTo(tl.duration() - ATTACH_DURATION, 9);
      }
    }
  });

  it('acousticSurvey: fans out over points[0] and pings in the robot\'s turn order, then flies to the ring\'s start', () => {
    const n = 4;
    const i = input(n, { job: JobType.AcousticSurvey }, 0.9);
    const tl = buildJobTimeline(i);
    const [fanWin, ringWin] = moveWindows(2, tl.duration());
    const fan = fanTargets(i.site.points[0], n);
    const ranks = turnRanks(workVariation(GEM_SEED).order, shownCorners(GEM_SEED, n));
    expectAt(i, tl, fanWin.start, fan, 'fanned');
    const slot = (fanWin.end - fanWin.start) / n;
    for (let turn = 0; turn < n; turn++) {
      tl.time(fanWin.start + (turn + 0.5) * slot);
      i.orbiters.forEach((local, j) => expect(num(local, 'scale')).toBeCloseTo(ranks[j] === turn ? 0.9 * FAN_PING_SCALE : 0.9, 6));
    }
    expectAt(i, tl, fanWin.end, fan, 'still fanned at the fan\'s end');
    const v = workVariation(GEM_SEED);
    const ringStarts = ringStartAngles(n, v.phase).map((a) => ringRoute(i.site.points[0], ringRadius(v.radiusScale), a, v.ringDirection)[0]);
    expectAt(i, tl, ringWin.start, ringStarts, 'at the ring\'s start');
    // Mid-approach, every orbiter is on its way: neither at its fan slot nor at its ring start.
    tl.time((ringWin.approach + ringWin.start) / 2);
    i.orbiters.forEach((_, j) => {
      expect(dist(sceneCentre(i, j), fan[j])).toBeGreaterThan(0.5);
      expect(dist(sceneCentre(i, j), ringStarts[j])).toBeGreaterThan(0.5);
    });
  });

  it('fluidMonitoring: traces the pipe where the site has one, then gathers and pulses round points[1] (the valve)', () => {
    const n = 3;
    const v = workVariation(GEM_SEED);
    const i = input(n, { job: JobType.FluidMonitoring, site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }], paths: { outline: SITE_PATH, pipe: PIPE } } }, 0.8);
    const tl = buildJobTimeline(i);
    const [traceWin, pulseWin] = moveWindows(2, tl.duration());
    const route = traceRoute(PIPE, v.traceReversed);
    expectAt(i, tl, traceWin.start, i.orbiters.map(() => route[0]), 'on the pipe\'s first vertex');
    expectAt(i, tl, traceWin.end, i.orbiters.map(() => route[route.length - 1]), 'on the pipe\'s last vertex');
    const gather = hoverPulseTargets(i.site.points[1], n, v.phase);
    expectAt(i, tl, pulseWin.start, gather, 'gathered round the valve');
    expectAt(i, tl, pulseWin.end, gather, 'still gathered at the move\'s end');
    const ranks = turnRanks(v.order, shownCorners(GEM_SEED, n));
    const slot = (pulseWin.end - pulseWin.start) / n;
    for (let turn = 0; turn < n; turn++) {
      tl.time(pulseWin.start + (turn + 0.5) * slot);
      i.orbiters.forEach((local, j) => expect(num(local, 'scale')).toBeCloseTo(ranks[j] === turn ? 0.8 * HOVER_PULSE_SCALE : 0.8, 6));
    }
  });

  it('fluidMonitoring on a site without a pipe traces the outline instead', () => {
    const i = input(2, { job: JobType.FluidMonitoring });
    const tl = buildJobTimeline(i);
    const [traceWin] = moveWindows(2, tl.duration());
    const route = traceRoute(SITE_PATH, workVariation(GEM_SEED).traceReversed);
    expectAt(i, tl, traceWin.start, i.orbiters.map(() => route[0]), 'on the outline\'s first vertex');
    expectAt(i, tl, traceWin.end, i.orbiters.map(() => route[route.length - 1]), 'on the outline\'s last vertex');
  });

  it('salvage: carries from points[0] to points[1] shrunk, drops, and returns, side by side', () => {
    const n = 3;
    const i = input(n, { job: JobType.Salvage }, 1.1);
    const tl = buildJobTimeline(i);
    const [win] = moveWindows(1, tl.duration());
    const pairs = carryTargets(i.site.points[0], i.site.points[1], n);
    const L = win.end - win.start;
    expectAt(i, tl, win.start, pairs.map((p) => p.from), 'on the pick-up');
    tl.time(win.start + 0.1 * L);
    for (const local of i.orbiters) expect(num(local, 'scale')).toBeCloseTo(1.1 * CARRY_SHRINK, 6);
    expectAt(i, tl, win.start + 0.45 * L, pairs.map((p) => p.to), 'carried to the drop');
    for (const local of i.orbiters) expect(num(local, 'scale')).toBeCloseTo(1.1 * CARRY_SHRINK, 6);
    tl.time(win.start + 0.55 * L);
    for (const local of i.orbiters) expect(num(local, 'scale')).toBeCloseTo(1.1, 6);
    expectAt(i, tl, win.end, pairs.map((p) => p.from), 'back on the pick-up');
  });

  it('maintenance: rings points[0] and each orbiter flickers to FLICKER_OPACITY on its own sparks, back to full by the end', () => {
    const n = 4;
    const v = workVariation(GEM_SEED);
    const i = input(n, { job: JobType.Maintenance });
    const tl = buildJobTimeline(i);
    const [win] = moveWindows(1, tl.duration());
    const r = ringRadius(v.radiusScale);
    const lows = i.orbiters.map(() => 1);
    const dips: number[][] = i.orbiters.map(() => []);
    for (let t = win.start; t <= win.end + 1e-9; t += 0.01) {
      tl.time(t);
      i.orbiters.forEach((local, j) => {
        expect(Math.abs(dist(sceneCentre(i, j), i.site.points[0]) - r)).toBeLessThanOrEqual(1);
        const op = num(local, 'opacity');
        if (op < 0.3 && lows[j] >= 0.3) dips[j].push(t);
        lows[j] = op;
      });
    }
    const shown = shownCorners(GEM_SEED, n);
    i.orbiters.forEach((local, j) => {
      // One dip per distinct spark chord, each reaching FLICKER_OPACITY at the chord's middle.
      const chords = sparkChords(v.sparks[shown[j]], RING_SEGMENTS);
      expect(chords.length).toBeGreaterThan(0);
      const c = (win.end - win.start) / RING_SEGMENTS;
      expect(dips[j].length, `orbiter ${j}`).toBe(chords.length);
      for (const k of chords) {
        tl.time(win.start + (k + 0.5) * c);
        expect(num(local, 'opacity'), `orbiter ${j}, chord ${k}`).toBeCloseTo(FLICKER_OPACITY, 6);
      }
    });
    tl.time(win.end);
    for (const local of i.orbiters) expect(num(local, 'opacity')).toBe(1);
  });

  it('only maintenance flickers: no other job touches orbiter opacity', () => {
    for (const job of Object.values(JobType).filter((j) => j !== JobType.Maintenance)) {
      const i = input(4, { job });
      const tl = buildJobTimeline(i);
      for (let k = 0; k <= 200; k++) {
        tl.progress(k / 200);
        for (const local of i.orbiters) expect(num(local, 'opacity'), job).toBe(1);
      }
    }
  });
});

describe('buildJobTimeline — typed plan events (Job decorations Task 4)', () => {
  const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
  const PIPE: Vec2[] = [{ x: 400, y: 440 }, { x: 500, y: 440 }];
  const KIND: Record<MoveStep['move'], MoveEvents['kind']> = { hoverPulse: 'pulse', fan: 'fan', trace: 'trace', ring: 'ring', carry: 'carry' };

  const eventsOf = (tl: gsap.core.Timeline) => (tl.data as JobTimelineData).events;

  /** One run, planned: its events plus everything the events must agree with. */
  function plan(job: JobType, n: number, bpm = 110, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, seed = GEM_SEED) {
    const i = input(n, { job, bpm, ...over }, 1, seed);
    const tl = buildJobTimeline(i);
    const v = workVariation(seed);
    const shown = shownCorners(seed, n);
    return {
      i,
      tl,
      v,
      shown,
      ranks: turnRanks(v.order, shown),
      events: eventsOf(tl),
      windows: moveWindows(JOB_MOVES[job].length, jobDuration(bpm)),
    };
  }

  /** The first gem seed from GEM_SEED up whose variation passes `pred`. */
  function seedWhere(pred: (v: ReturnType<typeof workVariation>) => boolean): number {
    for (let s = GEM_SEED; s < GEM_SEED + 1000; s++) if (pred(workVariation(s))) return s;
    throw new Error('no seed found');
  }

  it('keeps one event per move on the timeline data, in the job table order, of the move kind', () => {
    for (const job of Object.values(JobType)) {
      for (const n of [0, 1, 4]) {
        const { events } = plan(job, n);
        expect(events.map((e) => e.kind), `${job} ${n}`).toEqual(JOB_MOVES[job].map((s) => KIND[s.move]));
      }
    }
  });

  it('every event spans exactly its move window (t0 = start, t1 = end) at 20 and 200 BPM', () => {
    for (const job of Object.values(JobType)) {
      for (const bpm of [20, 200]) {
        const { events, windows } = plan(job, 3, bpm);
        events.forEach((e, k) => {
          expect(e.t0, `${job} ${bpm} move ${k}`).toBe(windows[k].start);
          expect(e.t1, `${job} ${bpm} move ${k}`).toBe(windows[k].end);
        });
      }
    }
  });

  it('pulse: the point, the slot, and each orbiter\'s start, target and corner in the robot\'s turn order', () => {
    for (const n of [1, 3, 4]) {
      const { i, events, windows, v, shown, ranks } = plan(JobType.VentExtraction, n);
      const e = events[0];
      if (e.kind !== 'pulse') throw new Error('expected a pulse');
      const slot = (windows[0].end - windows[0].start) / n;
      expect(e.point).toEqual(i.site.points[0]);
      expect(e.slot).toBeCloseTo(slot, 12);
      const targets = hoverPulseTargets(i.site.points[0], n, v.phase);
      expect(e.orbs).toHaveLength(n);
      e.orbs.forEach((orb, j) => {
        expect(orb.corner).toBe(shown[j]);
        expect(orb.start).toBeCloseTo(windows[0].start + ranks[j] * slot, 12);
        expect(orb.target).toEqual(targets[j]);
      });
      // Every slot is taken exactly once, the last ending where the move does.
      const starts = e.orbs.map((o) => o.start).sort((a, b) => a - b);
      expect(starts[n - 1] + e.slot).toBeCloseTo(windows[0].end, 12);
    }
  });

  it('pulse of fluidMonitoring is round points[1], after its trace', () => {
    const { i, events } = plan(JobType.FluidMonitoring, 3);
    const e = events[1];
    if (e.kind !== 'pulse') throw new Error('expected a pulse');
    expect(e.point).toEqual(i.site.points[1]);
    expect(e.t0).toBeGreaterThan(events[0].t1 - 1e-9);
  });

  it('fan: targets are fanTargets, dir is the unit vector from the point to each target', () => {
    for (const n of [1, 2, 4]) {
      const { i, events, windows, shown, ranks } = plan(JobType.AcousticSurvey, n);
      const e = events[0];
      if (e.kind !== 'fan') throw new Error('expected a fan');
      const point = i.site.points[0];
      const targets = fanTargets(point, n);
      const slot = (windows[0].end - windows[0].start) / n;
      expect(e.point).toEqual(point);
      expect(e.orbs).toHaveLength(n);
      e.orbs.forEach((orb, j) => {
        expect(orb.corner).toBe(shown[j]);
        expect(orb.start).toBeCloseTo(windows[0].start + ranks[j] * slot, 12);
        expect(orb.target).toEqual(targets[j]);
        expect(Math.hypot(orb.dir.x, orb.dir.y)).toBeCloseTo(1, 12);
        expect(dist({ x: point.x + orb.dir.x * FAN_RADIUS, y: point.y + orb.dir.y * FAN_RADIUS }, targets[j])).toBeLessThan(1e-9);
      });
    }
  });

  it('trace: the route in scene units (reversed when the robot traces backwards), starts and run from traceTimes', () => {
    for (const reversed of [false, true]) {
      const seed = seedWhere((v) => v.traceReversed === reversed);
      for (const n of [1, 4]) {
        const { events, windows, shown, ranks } = plan(JobType.StructuralInspection, n, 110, {}, seed);
        const e = events[0];
        if (e.kind !== 'trace') throw new Error('expected a trace');
        const { starts, run } = traceTimes(ranks, windows[0].start, windows[0].end);
        expect(e.route).toEqual(traceRoute(SITE_PATH, reversed));
        expect(e.route[0]).toEqual(reversed ? SITE_PATH[SITE_PATH.length - 1] : SITE_PATH[0]);
        expect(e.run).toBeCloseTo(run, 12);
        expect(e.orbs).toHaveLength(n);
        e.orbs.forEach((orb, j) => {
          expect(orb.corner).toBe(shown[j]);
          expect(orb.start).toBeCloseTo(starts[j], 12);
        });
        // The last to start ends with the move.
        expect(Math.max(...e.orbs.map((o) => o.start)) + e.run).toBeCloseTo(windows[0].end, 9);
      }
    }
  });

  it('trace: drops repeated vertices like the move does; fluidMonitoring traces its pipe, or the outline on a site without one', () => {
    const doubled = [SITE_PATH[0], SITE_PATH[1], SITE_PATH[1], SITE_PATH[2], SITE_PATH[3]];
    const a = plan(JobType.StructuralInspection, 2, 110, { site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }], paths: { outline: doubled } } });
    const ea = a.events[0];
    if (ea.kind !== 'trace') throw new Error('expected a trace');
    expect(ea.route).toHaveLength(SITE_PATH.length);
    expect(ea.route).toEqual(traceRoute(doubled, a.v.traceReversed));

    const withPipe = plan(JobType.FluidMonitoring, 2, 110, { site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }], paths: { outline: SITE_PATH, pipe: PIPE } } });
    const ep = withPipe.events[0];
    if (ep.kind !== 'trace') throw new Error('expected a trace');
    expect(ep.route).toEqual(traceRoute(PIPE, withPipe.v.traceReversed));

    const noPipe = plan(JobType.FluidMonitoring, 2);
    const en = noPipe.events[0];
    if (en.kind !== 'trace') throw new Error('expected a trace');
    expect(en.route).toEqual(traceRoute(SITE_PATH, noPipe.v.traceReversed));
  });

  it('ring (maintenance): centre, radius, direction, start angles and the spark chords of each orbiter', () => {
    for (const direction of [1, -1] as const) {
      const seed = seedWhere((v) => v.ringDirection === direction);
      const n = 4;
      const { i, events, v, shown } = plan(JobType.Maintenance, n, 110, {}, seed);
      const e = events[0];
      if (e.kind !== 'ring') throw new Error('expected a ring');
      const angles = ringStartAngles(n, v.phase);
      expect(e.centre).toEqual(i.site.points[0]);
      expect(e.radius).toBeCloseTo(ringRadius(v.radiusScale), 12);
      expect(e.direction).toBe(direction);
      expect(e.orbs).toHaveLength(n);
      e.orbs.forEach((orb, j) => {
        expect(orb.corner).toBe(shown[j]);
        expect(orb.startAngle).toBeCloseTo(angles[j], 12);
        expect(orb.sparkChords).toEqual(sparkChords(v.sparks[shown[j]], RING_SEGMENTS));
        expect(orb.sparkChords.length).toBeGreaterThan(0);
      });
    }
  });

  it('ring: the start angle is where the ring route begins, and acousticSurvey\'s ring carries no spark chords (it does not flicker)', () => {
    const { i, events, v } = plan(JobType.AcousticSurvey, 3);
    const e = events[1];
    if (e.kind !== 'ring') throw new Error('expected a ring');
    e.orbs.forEach((orb) => {
      expect(orb.sparkChords).toEqual([]);
    });
    e.orbs.forEach((orb, j) => {
      const first = ringRoute(e.centre, e.radius, orb.startAngle, e.direction)[0];
      const expected = ringRoute(i.site.points[0], ringRadius(v.radiusScale), ringStartAngles(3, v.phase)[j], v.ringDirection)[0];
      expect(dist(first, expected)).toBeLessThan(1e-9);
    });
  });

  it('carry: a and b are the pick-up and drop, offset is each orbiter\'s x spacing from carryTargets', () => {
    for (const n of [1, 2, 3, 4]) {
      const { i, events, shown } = plan(JobType.Salvage, n);
      const e = events[0];
      if (e.kind !== 'carry') throw new Error('expected a carry');
      const pairs = carryTargets(i.site.points[0], i.site.points[1], n);
      expect(e.a).toEqual(i.site.points[0]);
      expect(e.b).toEqual(i.site.points[1]);
      expect(e.orbs).toHaveLength(n);
      e.orbs.forEach((orb, j) => {
        expect(orb.corner).toBe(shown[j]);
        expect(orb.offset).toBeCloseTo(pairs[j].from.x - e.a.x, 12);
        expect(orb.offset).toBeCloseTo(pairs[j].to.x - e.b.x, 12);
      });
    }
  });

  it('a site with a single point falls back to it, as the moves do', () => {
    const site = { points: [{ x: 470, y: 420 }], paths: { outline: SITE_PATH } };
    const pulse = plan(JobType.FluidMonitoring, 2, 110, { site }).events[1];
    if (pulse.kind !== 'pulse') throw new Error('expected a pulse');
    expect(pulse.point).toEqual(site.points[0]);
    const carry = plan(JobType.Salvage, 2, 110, { site }).events[0];
    if (carry.kind !== 'carry') throw new Error('expected a carry');
    expect(carry.b).toEqual(site.points[0]);
  });

  it('with no orbiters every event still exists, with empty orbs and finite numbers', () => {
    for (const job of Object.values(JobType)) {
      const { events } = plan(job, 0);
      expect(events.length).toBe(JOB_MOVES[job].length);
      for (const e of events) {
        expect(e.orbs).toEqual([]);
        expect(Number.isFinite(e.t0) && Number.isFinite(e.t1)).toBe(true);
        if (e.kind === 'pulse' || e.kind === 'fan') expect(Number.isFinite(e.slot)).toBe(true);
        if (e.kind === 'trace') expect(Number.isFinite(e.run)).toBe(true);
      }
    }
  });

  it('events are plain JSON: they survive a round trip unchanged (no elements, no NaN or Infinity)', () => {
    for (const job of Object.values(JobType)) {
      for (const n of [0, 1, 4]) {
        const { events } = plan(job, n);
        expect(JSON.parse(JSON.stringify(events)), `${job} ${n}`).toEqual(events);
      }
    }
  });

  it('events are in scene units: the layer scale and body scale do not change them', () => {
    for (const job of Object.values(JobType)) {
      const a = plan(job, 3, 110, { layerScale: 1, bodyScale: 1.2 }).events;
      const b = plan(job, 3, 110, { layerScale: 0.75, bodyScale: 1.69 }).events;
      expect(b, job).toEqual(a);
    }
  });

  it('reduced motion plans nothing: the data holds an empty events list', () => {
    for (const job of Object.values(JobType)) {
      expect(plan(job, 3, 110, { reducedMotion: true }).events, job).toEqual([]);
    }
  });
});
