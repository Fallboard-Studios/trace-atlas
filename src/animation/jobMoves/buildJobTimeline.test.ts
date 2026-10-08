// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { buildJobTimeline, type JobTimelineInput } from './buildJobTimeline';
import { hoverPulseTargets } from './hoverPulse';
import { jobDuration } from './jobDuration';
import { getTimeline, killTimeline, killAllTimelines } from '../timelineMap';
import { AudioEngine } from '../../engine/AudioEngine';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../../components/robot/gem/polygon';
import { orbiterPlan, ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { BOB_PX, BOB_CYCLE_SECONDS, HOVER_PULSE_SCALE } from '../../constants';
import { JobType } from '../../types/Robot';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const gem = getRobotGem(GEM_SEED);
const FRAME = 1 / 60;

/** A world robot as the loop sees it: the `.robot` group at its position (Robot.tsx's gsap.set),
 *  and the shown orbiters' `.gem__orbiter > .gem__orbiter-local` pairs, locals at rest. */
function mount(count: number, restScale = 1) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  const robotEl = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const robot = { id: 'r7', position: { x: 400, y: 300 }, gemSeed: GEM_SEED };
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

function input(count: number, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, restScale = 1): JobTimelineInput & ReturnType<typeof mount> {
  const m = mount(count, restScale);
  return {
    ...m,
    site: { points: [{ x: 470, y: 420 }, { x: 380, y: 420 }] },
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

/** Where orbiter j's centre is in the scene right now, through the whole chain: the `.robot`
 *  x/y, g.gem's scale about the canvas centre, the copy's y (the counter-bob) and the local x/y. */
function sceneCentre(i: ReturnType<typeof input>, j: number) {
  const s = i.bodyScale * i.layerScale;
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  const part = gem.orbiters[orbiterPlan(GEM_SEED).cornerOrder[j]];
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

  it('detaches each orbiter to its hoverPulse target round points[0] and holds it still in the scene while the body bobs', () => {
    for (const layerScale of [1, 0.75]) {
      const i = input(4, { layerScale });
      const tl = buildJobTimeline(i);
      const targets = hoverPulseTargets(i.site.points[0], 4);
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

  it('pulses the orbiters in turn above their rest scale during the work', () => {
    const i = input(3, {}, 0.8);
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const slot = (D - 2 * ATTACH_DURATION) / 3;
    for (let j = 0; j < 3; j++) {
      tl.time(ATTACH_DURATION + (j + 0.5) * slot);
      i.orbiters.forEach((local, k) => expect(num(local, 'scale')).toBeCloseTo(k === j ? 0.8 * HOVER_PULSE_SCALE : 0.8, 6));
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
