// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildJobTimeline, type JobTimelineInput } from './buildJobTimeline';
import { hoverPulseTargets } from './hoverPulse';
import { jobDuration } from './jobDuration';
import { traceRoute, traceTimes } from './trace';
import { ringRadius } from './ring';
import { workVariation, turnRanks } from './variation';
import type { OrbiterCorner } from './sceneToOrbiterLocal';
import { getTimeline, killTimeline, killAllTimelines } from '../timelineMap';
import { AudioEngine } from '../../engine/AudioEngine';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../../components/robot/gem/polygon';
import { orbiterPlan, ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { BOB_PX, BOB_CYCLE_SECONDS, HOVER_PULSE_SCALE, RING_REVOLUTIONS } from '../../constants';
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
    site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }], path: SITE_PATH },
    job: JobType.VentExtraction,
    bpm: 110,
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

  it('acousticSurvey: every orbiter circles points[0] at the robot\'s radius ±1 u, evenly phased, in its direction, for RING_REVOLUTIONS turns', () => {
    for (const direction of [1, -1] as const) {
      const seed = seedWhere((v) => v.ringDirection === direction);
      const v = workVariation(seed);
      const r = ringRadius(v.radiusScale);
      for (const layerScale of [1, 0.75]) {
        const n = 3;
        const i = input(n, { job: JobType.AcousticSurvey, layerScale, bpm: 200 }, 1, seed);
        const centre = i.site.points[0];
        const tl = buildJobTimeline(i);
        const D = tl.duration();
        const angleOf = (j: number) => {
          const p = sceneCentre(i, j);
          return Math.atan2(p.y - centre.y, p.x - centre.x);
        };

        tl.time(ATTACH_DURATION);
        expect(Math.cos(angleOf(0) - (v.phase - Math.PI / 2))).toBeCloseTo(1, 6);

        let swept = 0;
        let last = angleOf(0);
        for (let t = ATTACH_DURATION; t <= D - ATTACH_DURATION + 1e-9; t += 0.05) {
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
        tl.time(D - ATTACH_DURATION);
        const now = angleOf(0);
        swept += Math.atan2(Math.sin(now - last), Math.cos(now - last));
        expect(swept).toBeCloseTo(direction * 2 * Math.PI * RING_REVOLUTIONS, 2);
      }
    }
  });

  it('fluidMonitoring, salvage and maintenance still fall back to hoverPulse (their moves land in Task 29)', () => {
    for (const job of [JobType.FluidMonitoring, JobType.Salvage, JobType.Maintenance]) {
      const i = input(3, { job });
      const tl = buildJobTimeline(i);
      const targets = hoverPulseTargets(i.site.points[0], 3, workVariation(GEM_SEED).phase);
      tl.time(tl.duration() / 2);
      i.orbiters.forEach((_, j) => expect(dist(sceneCentre(i, j), targets[j])).toBeLessThan(0.01));
    }
  });

  it('every job lasts jobDuration(bpm) with 0–4 orbiters and ends with them docked, the robot at rest', () => {
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
            expect(num(local.parentElement!, 'y')).toBeCloseTo(0, 9);
          }
          expect(num(i.robotEl, 'y')).toBeCloseTo(300, 9);
        }
      }
    }
  });

  it('reduced motion is the same in-place pulse for every job: no orbiter moves', () => {
    for (const job of Object.values(JobType)) {
      const i = input(3, { job, reducedMotion: true });
      const tl = buildJobTimeline(i);
      for (let k = 0; k <= 20; k++) {
        tl.progress(k / 20);
        for (const local of i.orbiters) expect([num(local, 'x'), num(local, 'y'), num(local, 'scale')]).toEqual([0, 0, 1]);
      }
    }
  });
});
