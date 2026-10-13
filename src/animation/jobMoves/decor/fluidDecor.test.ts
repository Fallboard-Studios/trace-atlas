// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { addFluidDecor, dropAt, fluidWindow, valveAngle, valveState } from './fluidDecor';
import type { MoveEvents } from './events';
import type { DecorContext } from './jobDecor';
import { sceneToRowLocal } from './frames';
import { polyAt } from './polyline';
import { buildJobTimeline, type JobTimelineInput } from '../buildJobTimeline';
import { jobDuration } from '../jobDuration';
import { workVariation, type WorkVariation } from '../variation';
import { killAllTimelines } from '../../timelineMap';
import { getRobotGem } from '../../../components/robot/gem/polygon';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; the GSAP half of these tests reads real tween values.
vi.unmock('gsap');

type TraceEvents = Extract<MoveEvents, { kind: 'trace' }>;
type PulseEvents = Extract<MoveEvents, { kind: 'pulse' }>;

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';

/** A variation with the two fluid factors set (1 = the sketch's numbers). */
function variation(over: { dropLag?: number; valveSize?: number } = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  return { ...base, decor: { ...base.decor, dropLag: over.dropLag ?? 1, valveSize: over.valveSize ?? 1 } };
}

/** A straight 200-unit pipe along x at y = 10, so a point's x is 200 × its u. */
const PIPE: Vec2[] = [{ x: 0, y: 10 }, { x: 200, y: 10 }];

/** Three orbiters trace the pipe from t = 1, 2.5 and 4, each for 5 s. */
function trace(route: Vec2[] = PIPE, over: Partial<TraceEvents> = {}): TraceEvents {
  return {
    kind: 'trace',
    route,
    t0: 1,
    t1: 9,
    run: 5,
    orbs: [{ corner: 1, start: 1 }, { corner: 3, start: 2.5 }, { corner: 0, start: 4 }],
    ...over,
  };
}

/** Three orbiters pulse at the valve over [10, 14]: slots of 4/3 s from 10, 11.33 and 12.67. */
function pulse(over: Partial<PulseEvents> = {}): PulseEvents {
  return {
    kind: 'pulse',
    point: { x: 50, y: 60 },
    t0: 10,
    t1: 14,
    slot: 4 / 3,
    orbs: [
      { corner: 1, start: 10, target: { x: 55, y: 60 } },
      { corner: 3, start: 10 + 4 / 3, target: { x: 45, y: 60 } },
      { corner: 0, start: 10 + 8 / 3, target: { x: 50, y: 55 } },
    ],
    ...over,
  };
}

// ========================================
// DROPLETS
// ========================================
describe('dropAt (docs/specs/JOB_DECORATION.md §1.6, Task 10)', () => {
  const v = variation();
  const ev = trace();

  it('trails the lead by k x 0.33 s: drop k is at polyAt(route, (t - lead.start - k x lag) / run)', () => {
    // t = 4: drop 1 is (4 - 1 - .33) / 5 = .534 along, drop 3 is (4 - 1 - .99) / 5 = .402
    const one = dropAt(4, 1, ev, v)!;
    expect(one.x).toBeCloseTo(200 * 0.534, 6);
    const three = dropAt(4, 3, ev, v)!;
    expect(three.x).toBeCloseTo(200 * 0.402, 6);
  });

  it('wobbles y by 0.8 x sin(9t + k) about the pipe', () => {
    const one = dropAt(4, 1, ev, v)!;
    expect(one.y).toBeCloseTo(10 + 0.8 * Math.sin(9 * 4 + 1), 9);
    const seven = dropAt(4.1, 7, ev, v)!;
    expect(seven.y).toBeCloseTo(10 + 0.8 * Math.sin(9 * 4.1 + 7), 9);
  });

  it('never strays more than 0.8 from the pipe', () => {
    for (let t = 1.5; t < 6; t += 0.037) {
      const d = dropAt(t, 1, ev, v);
      if (d) expect(Math.abs(d.y - 10)).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });

  it('is hidden before its u passes 0 and after it passes 1, and shown just inside both', () => {
    // drop 2 starts at 1 + .66 and finishes at 1 + .66 + 5
    expect(dropAt(1.66 - 0.001, 2, ev, v)).toBeNull();
    expect(dropAt(1.66 + 0.001, 2, ev, v)).not.toBeNull();
    expect(dropAt(6.66 - 0.001, 2, ev, v)).not.toBeNull();
    expect(dropAt(6.66 + 0.001, 2, ev, v)).toBeNull();
  });

  it('is still there at exactly the end of the pipe and not yet out at exactly its start (no lag, so u is exact)', () => {
    const exact = trace(PIPE, { orbs: [{ corner: 1, start: 0 }], run: 4 });
    const noLag = variation({ dropLag: 0 });
    expect(dropAt(0, 1, exact, noLag)).toBeNull();
    expect(dropAt(4, 1, exact, noLag)).not.toBeNull();
    expect(dropAt(4, 1, exact, noLag)!.x).toBeCloseTo(200, 9);
    expect(dropAt(4.000001, 1, exact, noLag)).toBeNull();
  });

  it('fades down the line: radius 3 x (.6 + .4 fade), opacity .85 x fade, fade = 1 - (k - 1) / 10', () => {
    const at = (k: number) => dropAt(1 + k * 0.33 + 1, k, ev, v)!;
    expect([at(1).r, at(1).alpha]).toEqual([3, 0.85]);
    expect(at(6).r).toBeCloseTo(3 * (0.6 + 0.4 * 0.5), 9);
    expect(at(6).alpha).toBeCloseTo(0.85 * 0.5, 9);
    expect(at(10).r).toBeCloseTo(3 * (0.6 + 0.4 * 0.1), 9);
    expect(at(10).alpha).toBeCloseTo(0.85 * 0.1, 9);
  });

  it('the dropLag factor stretches the gap between drops by exactly the factor, and only the gap', () => {
    const slow = variation({ dropLag: 1.15 });
    // drop 4 at lag 1.15 is where drop 4 would be at the base lag, 4 x .33 x .15 s later
    const shift = 4 * 0.33 * 0.15;
    const base = dropAt(3, 4, ev, v)!;
    const stretched = dropAt(3 + shift, 4, ev, slow)!;
    expect(stretched.x).toBeCloseTo(base.x, 6);
    expect(stretched.r).toBe(base.r);
    expect(stretched.alpha).toBe(base.alpha);
    // the first drop leaves the start 1 x .33 x 1.15 s after the lead
    expect(dropAt(1 + 0.33 * 1.15 - 0.001, 1, ev, slow)).toBeNull();
    expect(dropAt(1 + 0.33 * 1.15 + 0.001, 1, ev, slow)).not.toBeNull();
  });

  it('is timed by the lead, which is the orbiter that starts first, wherever it sits in the list', () => {
    const shuffled = trace(PIPE, { orbs: [{ corner: 3, start: 2.5 }, { corner: 0, start: 4 }, { corner: 1, start: 1 }] });
    expect(dropAt(1.33 - 0.001, 1, shuffled, v)).toBeNull();
    expect(dropAt(1.33 + 0.001, 1, shuffled, v)).not.toBeNull();
  });

  it('follows a bent pipe by length: at u = .75 on an L of 100 + 100 the drop is half way down the second leg', () => {
    const bent = trace([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const d = dropAt(1 + 0.33 + 0.75 * 5, 1, bent, v)!;
    expect(d.x).toBeCloseTo(100, 6);
    expect(d.y).toBeCloseTo(50 + 0.8 * Math.sin(9 * (1 + 0.33 + 0.75 * 5) + 1), 6);
  });

  it('shows nothing when there is no lead, no run, or no route, and never returns NaN', () => {
    expect(dropAt(4, 1, trace(PIPE, { orbs: [] }), v)).toBeNull();
    expect(dropAt(4, 1, trace(PIPE, { run: 0 }), v)).toBeNull();
    expect(dropAt(4, 1, trace(PIPE, { run: -2 }), v)).toBeNull();
    expect(dropAt(4, 1, trace([]), v)).toBeNull();
  });

  it('puts every drop of a one-point route on that point', () => {
    const d = dropAt(4, 1, trace([{ x: 5, y: 5 }]), v);
    if (d) {
      expect(d.x).toBe(5);
      expect(Number.isFinite(d.y)).toBe(true);
    }
  });
});

// ========================================
// VALVE ANGLE
// ========================================
describe('valveAngle (§1.6: a rate that starts at 90 deg/s and gains 90 at each pulse start)', () => {
  // the plan starts the first pulse at t0, so the base rate only runs before a first start that is later
  const starts = [2, 4, 7];

  it('is 0 at t0 and turns at the base rate until the first start', () => {
    expect(valveAngle(1, 1, starts, 90, 90)).toBe(0);
    expect(valveAngle(1.5, 1, starts, 90, 90)).toBeCloseTo(45, 9);
    expect(valveAngle(2, 1, starts, 90, 90)).toBeCloseTo(90, 9);
  });

  it('has slope base + n x step after n pulse starts, exact at three sampled times', () => {
    // 1 -> 2 at 90, 2 -> 4 at 180, 4 -> 7 at 270, then 360
    expect(valveAngle(3, 1, starts, 90, 90)).toBeCloseTo(90 + 180, 9);
    expect(valveAngle(5, 1, starts, 90, 90)).toBeCloseTo(90 + 360 + 270, 9);
    expect(valveAngle(8, 1, starts, 90, 90)).toBeCloseTo(90 + 360 + 810 + 360, 9);
  });

  it('is continuous across every start', () => {
    for (const s of starts) {
      // 2e-9 s at the fastest rate here (360 deg/s) is under 1e-6 degrees
      expect(valveAngle(s + 1e-9, 1, starts, 90, 90)).toBeCloseTo(valveAngle(s - 1e-9, 1, starts, 90, 90), 5);
    }
  });

  it('never goes backwards', () => {
    let last = -1;
    for (let t = 1; t < 10; t += 0.05) {
      const a = valveAngle(t, 1, starts, 90, 90);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });

  it('counts a start at t0 straight away: the first pulse already turns at base + step', () => {
    expect(valveAngle(2, 1, [1, 2], 90, 90)).toBeCloseTo(180, 9);
    expect(valveAngle(3, 1, [1, 2], 90, 90)).toBeCloseTo(180 + 270, 9);
  });

  it('counts a start before t0 as happening at t0, never turning backwards for it', () => {
    // the start at 1 is before t0 = 2, so from t0 the rate is already base + step
    expect(valveAngle(3, 2, [1], 90, 90)).toBeCloseTo(180, 9);
    expect(valveAngle(2.5, 2, [1], 90, 90)).toBeCloseTo(90, 9);
  });

  it('does not care what order the starts come in', () => {
    expect(valveAngle(5, 1, [7, 2, 4], 90, 90)).toBe(valveAngle(5, 1, [2, 4, 7], 90, 90));
  });

  it('turns at the base rate alone with no pulses, and by the given base and step', () => {
    expect(valveAngle(3, 1, [], 90, 90)).toBeCloseTo(180, 9);
    expect(valveAngle(3, 1, [2], 10, 30)).toBeCloseTo(10 + 40 * 1, 9);
    expect(valveAngle(3, 1, [2], 0, 0)).toBe(0);
  });

  it('is 0 before t0 rather than turning backwards', () => {
    expect(valveAngle(0, 1, starts, 90, 90)).toBe(0);
  });

  it('does not mutate the starts it is given', () => {
    const given = [7, 2, 4];
    valveAngle(5, 1, given, 90, 90);
    expect(given).toEqual([7, 2, 4]);
  });
});

// ========================================
// VALVE STATE
// ========================================
describe('valveState (§1.6: 0.3 s edges on the pulse window, size 14 x factor x window)', () => {
  const v = variation();
  const ev = pulse();

  it('is invisible at the pulse t0 and t1, half at 0.15 s in, and full between', () => {
    expect(valveState(10, ev, v).win).toBe(0);
    expect(valveState(10.15, ev, v).win).toBeCloseTo(0.5, 9);
    expect(valveState(10.3, ev, v).win).toBeCloseTo(1, 9);
    expect(valveState(12, ev, v).win).toBe(1);
    expect(valveState(13.7, ev, v).win).toBeCloseTo(1, 9);
    expect(valveState(13.85, ev, v).win).toBeCloseTo(0.5, 9);
    expect(valveState(14, ev, v).win).toBe(0);
  });

  it('is invisible outside the pulse window', () => {
    expect(valveState(5, ev, v).win).toBe(0);
    expect(valveState(20, ev, v).win).toBe(0);
  });

  it('is 14 across at full, scaled by the window, and by the valveSize factor exactly', () => {
    expect(valveState(12, ev, v).size).toBe(14);
    expect(valveState(10.15, ev, v).size).toBeCloseTo(7, 9);
    expect(valveState(12, ev, variation({ valveSize: 1.15 })).size).toBeCloseTo(14 * 1.15, 9);
    expect(valveState(12, ev, variation({ valveSize: 0.85 })).size).toBeCloseTo(14 * 0.85, 9);
  });

  it('turns by the piecewise angle from the pulse t0 over the orbiters start times', () => {
    const t = 12;
    expect(valveState(t, ev, v).angle).toBeCloseTo(valveAngle(t, 10, ev.orbs.map((o) => o.start), 90, 90), 9);
    // the first start is t0, so the first pulse already turns at 180 deg/s
    expect(valveState(10.5, ev, v).angle).toBeCloseTo(90, 9);
  });

  it('never exceeds half when the window is shorter than the two edges', () => {
    const short = pulse({ t0: 10, t1: 10.3 });
    for (let t = 10; t <= 10.3; t += 0.01) expect(valveState(t, short, v).win).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('is invisible for a window with no length', () => {
    const none = pulse({ t0: 10, t1: 10 });
    expect(valveState(10, none, v).win).toBe(0);
    expect(Number.isFinite(valveState(10, none, v).angle)).toBe(true);
  });
});

// ========================================
// WINDOW
// ========================================
describe('fluidWindow (the trace start to the pulse end)', () => {
  it('runs from the earliest move start to the latest move end', () => {
    expect(fluidWindow(trace(), pulse())).toEqual([1, 14]);
    expect(fluidWindow(trace(), undefined)).toEqual([1, 9]);
    expect(fluidWindow(undefined, pulse())).toEqual([10, 14]);
  });

  it('is null with neither move', () => {
    expect(fluidWindow(undefined, undefined)).toBeNull();
  });
});

// ========================================
// THE BUILDER ON ITS OWN (a stub context)
// ========================================
function stubContext(events: MoveEvents[], tier: 'cheap' | 'all' = 'all') {
  const group = document.createElementNS(SVG_NS, 'g');
  const defs = group.appendChild(document.createElementNS(SVG_NS, 'defs'));
  const run = vi.fn();
  const ctx = {
    group,
    defs,
    tier,
    job: JobType.FluidMonitoring,
    robotId: 'r7',
    identityColor: IDENTITY,
    variation: variation(),
    shown: [],
    events,
    orbiters: [],
    restScales: [],
    duration: 20,
    toRow: (p: Vec2) => p,
    pose: () => ({ x: 0, y: 0, scale: 1 }),
    run,
  } as unknown as DecorContext;
  return { ctx, group, run };
}

describe('addFluidDecor with a stub context', () => {
  it('draws the drops and the valve for a trace and a pulse, and opens one window over both', () => {
    const { ctx, group, run } = stubContext([trace(), pulse()]);
    addFluidDecor(ctx);
    expect(group.querySelectorAll('.robot__work-drop')).toHaveLength(10);
    expect(group.querySelectorAll('.robot__work-valve-glow, .robot__work-valve, .robot__work-valve-core')).toHaveLength(3);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([1, 14]);
  });

  it('with no pulse draws drops only, over the trace', () => {
    const { ctx, group, run } = stubContext([trace()]);
    addFluidDecor(ctx);
    expect(group.querySelectorAll('.robot__work-drop')).toHaveLength(10);
    expect(group.querySelectorAll('.robot__work-valve')).toHaveLength(0);
    expect(group.querySelectorAll('radialGradient')).toHaveLength(0);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([1, 9]);
  });

  it('with no trace draws the valve only, over the pulse', () => {
    const { ctx, group, run } = stubContext([pulse()]);
    addFluidDecor(ctx);
    expect(group.querySelectorAll('.robot__work-drop')).toHaveLength(0);
    expect(group.querySelectorAll('.robot__work-valve')).toHaveLength(1);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([10, 14]);
  });

  it('draws nothing, and does not ask for a window, with neither move or no orbiters', () => {
    for (const events of [[], [trace(PIPE, { orbs: [] }), pulse({ orbs: [] })]] as MoveEvents[][]) {
      const { ctx, group, run } = stubContext(events);
      addFluidDecor(ctx);
      expect(group.querySelectorAll('line, circle, rect')).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('draws no drops for a pipe with no length or a run with no time, and still draws the valve', () => {
    for (const bad of [trace([{ x: 5, y: 5 }]), trace(PIPE, { run: 0 })]) {
      const { ctx, group } = stubContext([bad, pulse()]);
      addFluidDecor(ctx);
      expect(group.querySelectorAll('.robot__work-drop')).toHaveLength(0);
      expect(group.querySelectorAll('.robot__work-valve')).toHaveLength(1);
    }
  });

  it('cheap draws the valve only, whatever the moves', () => {
    const { ctx, group } = stubContext([trace(), pulse()], 'cheap');
    addFluidDecor(ctx);
    expect(group.querySelectorAll('.robot__work-drop')).toHaveLength(0);
    expect(group.querySelectorAll('.robot__work-valve')).toHaveLength(1);
  });

  it('cheap with no pulse draws nothing at all', () => {
    const { ctx, group, run } = stubContext([trace()], 'cheap');
    addFluidDecor(ctx);
    expect(group.querySelectorAll('line, circle, rect')).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });
});

// ========================================
// THE TIMELINE (real GSAP)
// ========================================
function mount(count: number, gemSeed: number) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  const robotEl = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const robot = { id: 'r7', position: { x: 400, y: 300 }, gemSeed, identityColor: IDENTITY };
  gsap.set(robotEl, { x: robot.position.x, y: robot.position.y });
  const rowEl = robotEl.appendChild(document.createElementNS(SVG_NS, 'g'));
  rowEl.setAttribute('class', 'robot__row');
  const host = rowEl.appendChild(document.createElementNS(SVG_NS, 'g'));
  host.setAttribute('class', 'gem');
  const orbiters = Array.from({ length: count }, () => {
    const copy = host.appendChild(document.createElementNS(SVG_NS, 'g'));
    copy.setAttribute('class', 'gem__orbiter');
    const local = copy.appendChild(document.createElementNS(SVG_NS, 'g'));
    local.setAttribute('class', 'gem__orbiter-local');
    gsap.set(local, { x: 0, y: 0, scale: 1, opacity: 1 });
    return local;
  });
  return { robot, robotEl, rowEl, orbiters };
}

/** A pipe 140 across then 50 up, ending at the valve (the site's second point). */
const SITE_PIPE: Vec2[] = [{ x: 380, y: 430 }, { x: 520, y: 430 }, { x: 520, y: 380 }];
const VALVE_POINT: Vec2 = { x: 520, y: 380 };

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, GEM_SEED),
    site: { points: [{ x: 470, y: 420 }, VALVE_POINT], paths: { outline: SITE_PIPE, pipe: SITE_PIPE } },
    job: JobType.FluidMonitoring,
    bpm: 110,
    decorTier: 'all',
    bodyScale: 1.2,
    layerScale: 1,
    reducedMotion: false,
    onComplete: vi.fn(),
    ...over,
  };
  return i;
}

const group = (i: { robotEl: Element }) => i.robotEl.querySelector('.robot__work');
const eventsOf = (tl: gsap.core.Timeline) => {
  const events = (tl.data as { events: MoveEvents[] }).events;
  return { trace: events[0] as TraceEvents, pulse: events[1] as PulseEvents };
};
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const opacityOf = (el: Element) => num(el, 'opacity');
const frame = (i: { robot: { position: Vec2 } }, layerScale: number) => ({
  robotPos: i.robot.position,
  gem: getRobotGem(GEM_SEED),
  layerScale,
});
const toRowFor = (i: { robot: { position: Vec2 } }, layerScale: number) => (p: Vec2) => sceneToRowLocal(p, frame(i, layerScale));
const drops = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-drop')];
const outer = (i: { robotEl: Element }) => group(i)!.querySelector('.robot__work-valve')!;
const core = (i: { robotEl: Element }) => group(i)!.querySelector('.robot__work-valve-core')!;
const glow = (i: { robotEl: Element }) => group(i)!.querySelector('.robot__work-valve-glow')!;
const rotation = (el: Element) => {
  const m = /rotate\((\S+) (\S+) (\S+)\)/.exec(el.getAttribute('transform') ?? '');
  return m ? { angle: Number(m[1]), cx: Number(m[2]), cy: Number(m[3]) } : null;
};

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addFluidDecor on a Fluid Monitoring job (Task 10)', () => {
  it.each([1, 2, 3, 4])('makes ten drops, a glow and two rects whatever the orbiter count (%d orbiters)', (n) => {
    const i = input(n);
    buildJobTimeline(i);
    const g = group(i)!;
    expect(g.getAttribute('data-job')).toBe(JobType.FluidMonitoring);
    expect(drops(i)).toHaveLength(10);
    expect(g.querySelectorAll('circle')).toHaveLength(11);
    expect(g.querySelectorAll('rect')).toHaveLength(2);
    expect(g.querySelectorAll('defs > radialGradient')).toHaveLength(1);
  });

  it('draws the drops, then the glow, the outer rect and the inner rect, and starts every node invisible', () => {
    const i = input(2);
    buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('circle, rect')];
    expect(nodes.map((n) => n.getAttribute('class'))).toEqual([
      ...Array(10).fill('robot__work-drop'),
      'robot__work-valve-glow',
      'robot__work-valve',
      'robot__work-valve-core',
    ]);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('wears the light colour on drops, glow gradient and outline, and the identity colour on the inner rect', () => {
    const i = input(2);
    buildJobTimeline(i);
    drops(i).forEach((d) => expect(d.getAttribute('fill')).toBe(GEM_LIGHT_COLOR));
    expect(outer(i).getAttribute('stroke')).toBe(GEM_LIGHT_COLOR);
    expect(outer(i).getAttribute('fill')).toBe('none');
    expect(outer(i).getAttribute('stroke-width')).toBe('1');
    expect(core(i).getAttribute('fill')).toBe(IDENTITY);
    const gradient = group(i)!.querySelector('defs > radialGradient')!;
    expect(glow(i).getAttribute('fill')).toBe(`url(#${gradient.id})`);
    expect(gradient.id).toBe('work-r7-fluid-glow');
    const stops = [...gradient.querySelectorAll('stop')];
    expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0', '0.5', '1']);
    expect(stops.map((s) => s.getAttribute('stop-opacity'))).toEqual(['0.9', '0.25', '0']);
    stops.forEach((s) => expect(s.getAttribute('stop-color')).toBe(GEM_LIGHT_COLOR));
  });

  it.each([1, 0.75])('writes the pure drop state onto every drop, hidden ones at opacity 0 (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const { trace: ev } = eventsOf(tl);
    const v = workVariation(GEM_SEED);
    const toRow = toRowFor(i, layerScale);
    const row = { ...ev, route: ev.route.map(toRow) };
    const nodes = drops(i);
    const lead = Math.min(...ev.orbs.map((o) => o.start));
    let shown = 0;
    for (const t of [lead + 0.5, lead + 1.5, lead + ev.run / 2, lead + ev.run, lead + ev.run + 1.5]) {
      tl.time(t);
      nodes.forEach((node, idx) => {
        const want = dropAt(tl.time(), idx + 1, row, v);
        if (!want) return expect(opacityOf(node)).toBe(0);
        shown++;
        expect(num(node, 'cx')).toBeCloseTo(want.x, 2);
        expect(num(node, 'cy')).toBeCloseTo(want.y, 2);
        expect(num(node, 'r')).toBeCloseTo(want.r, 2);
        expect(opacityOf(node)).toBeCloseTo(want.alpha, 2);
      });
    }
    expect(shown).toBeGreaterThan(10);
  });

  it('the first drop sits on the lead orbiter route a lag behind it, in the robot frame', () => {
    const i = input(1);
    const tl = buildJobTimeline(i);
    const { trace: ev } = eventsOf(tl);
    const toRow = toRowFor(i, 1);
    const route = ev.route.map(toRow);
    const v = workVariation(GEM_SEED);
    const t = ev.orbs[0].start + ev.run / 2;
    tl.time(t);
    const u = (t - ev.orbs[0].start - 0.33 * v.decor.dropLag) / ev.run;
    const at = polyAt(route, u);
    expect(num(drops(i)[0], 'cx')).toBeCloseTo(at.x, 2);
    expect(Math.abs(num(drops(i)[0], 'cy') - at.y)).toBeLessThanOrEqual(0.8 + 1e-2);
  });

  it.each([1, 0.75])('the valve turns with the pure angle, outer one way and inner the other, about the valve (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const { pulse: ev } = eventsOf(tl);
    const centre = toRowFor(i, layerScale)(ev.point);
    const starts = ev.orbs.map((o) => o.start);
    for (const t of [ev.t0 + 0.5, ev.orbs[1].start + 0.3, ev.orbs[2].start + 0.6, ev.t1 - 0.4]) {
      tl.time(t);
      const angle = valveAngle(tl.time(), ev.t0, starts, 90, 90);
      const a = rotation(outer(i))!;
      const b = rotation(core(i))!;
      expect(a.angle).toBeCloseTo(angle, 1);
      expect(b.angle).toBeCloseTo(-angle, 1);
      for (const r of [a, b]) {
        expect(r.cx).toBeCloseTo(centre.x, 2);
        expect(r.cy).toBeCloseTo(centre.y, 2);
      }
    }
  });

  it('sizes the valve 14 across at full, the inner rect .45 of that, and centres both and the glow on the valve', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { pulse: ev } = eventsOf(tl);
    const v = workVariation(GEM_SEED);
    const centre = toRowFor(i, 1)(ev.point);
    tl.time((ev.t0 + ev.t1) / 2);
    const size = 14 * v.decor.valveSize;
    expect(num(outer(i), 'width')).toBeCloseTo(size, 6);
    expect(num(outer(i), 'height')).toBeCloseTo(size, 6);
    expect(num(outer(i), 'x') + num(outer(i), 'width') / 2).toBeCloseTo(centre.x, 6);
    expect(num(outer(i), 'y') + num(outer(i), 'height') / 2).toBeCloseTo(centre.y, 6);
    expect(num(core(i), 'width')).toBeCloseTo(size * 0.45, 6);
    expect(num(core(i), 'x') + num(core(i), 'width') / 2).toBeCloseTo(centre.x, 6);
    expect(num(glow(i), 'cx')).toBeCloseTo(centre.x, 6);
    expect(num(glow(i), 'cy')).toBeCloseTo(centre.y, 6);
    expect(num(glow(i), 'r')).toBeCloseTo(size * 1.4, 6);
    expect(opacityOf(glow(i))).toBeCloseTo(0.5, 9);
    expect(opacityOf(outer(i))).toBeCloseTo(0.9, 9);
    expect(opacityOf(core(i))).toBeCloseTo(0.8, 9);
  });

  it('fades the valve in over 0.3 s from the pulse start and out over 0.3 s to its end', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { pulse: ev } = eventsOf(tl);
    // held now: the group is removed when the playhead reaches the end of the window
    const [o, c, gl] = [outer(i), core(i), glow(i)];
    tl.time(ev.t0);
    expect(opacityOf(o)).toBe(0);
    expect(opacityOf(c)).toBe(0);
    tl.time(ev.t0 + 0.15);
    expect(opacityOf(o)).toBeCloseTo(0.45, 6);
    expect(opacityOf(c)).toBeCloseTo(0.4, 6);
    expect(num(o, 'width')).toBeCloseTo(7 * workVariation(GEM_SEED).decor.valveSize, 6);
    tl.time(ev.t1 - 0.15);
    expect(opacityOf(o)).toBeCloseTo(0.45, 6);
    expect(opacityOf(c)).toBeCloseTo(0.4, 6);
    tl.time(ev.t1);
    expect(opacityOf(o)).toBe(0);
    expect(opacityOf(c)).toBe(0);
    expect(opacityOf(gl)).toBe(0);
  });

  it('keeps the valve out of sight during the trace', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { trace: ev } = eventsOf(tl);
    tl.time(ev.t0 + 1);
    [glow(i), outer(i), core(i)].forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('every node is invisible when the window opens, and seeking back puts them out again', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    const { trace: ev, pulse: pu } = eventsOf(tl);
    const nodes = [...group(i)!.querySelectorAll('circle, rect')];
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    tl.time((pu.t0 + pu.t1) / 2);
    expect(nodes.some((n) => opacityOf(n) > 0)).toBe(true);
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('opens its window at the trace start and closes it at the pulse end', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { trace: ev, pulse: pu } = eventsOf(tl);
    tl.time(pu.t1 - 0.01);
    expect(group(i)).not.toBeNull();
    tl.time(pu.t1 + 0.01);
    expect(group(i)).toBeNull();
    expect(ev.t0).toBeLessThan(pu.t0);
  });

  it('the first pulse start is the pulse t0, so the valve spins at base + step from the moment it appears', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { pulse: ev } = eventsOf(tl);
    expect(Math.min(...ev.orbs.map((o) => o.start))).toBeCloseTo(ev.t0, 9);
    tl.time(ev.t0 + 0.4);
    expect(rotation(outer(i))!.angle).toBeCloseTo(0.4 * 180, 1);
  });

  it('cheap draws the valve only: no drops', () => {
    const i = input(3, { decorTier: 'cheap' });
    const tl = buildJobTimeline(i);
    expect(drops(i)).toHaveLength(0);
    expect(group(i)!.querySelectorAll('rect')).toHaveLength(2);
    const { pulse: ev } = eventsOf(tl);
    tl.time((ev.t0 + ev.t1) / 2);
    expect(opacityOf(outer(i))).toBeGreaterThan(0);
  });

  it('draws nothing at tier none or with no orbiters', () => {
    const off = input(3, { decorTier: 'none' });
    buildJobTimeline(off);
    expect(group(off)).toBeNull();
    const empty = input(0);
    buildJobTimeline(empty);
    expect(group(empty)).toBeNull();
  });

  it('a site without a pipe traces its outline and still draws', () => {
    const i = input(3, { site: { points: [{ x: 470, y: 420 }, VALVE_POINT], paths: { outline: SITE_PIPE } } });
    buildJobTimeline(i);
    expect(drops(i)).toHaveLength(10);
  });

  it('shows every one of the ten drops at some point at every tempo, including 200 BPM (spec Q5 expected the last ones never to start)', () => {
    for (const bpm of [20, 110, 200]) {
      for (const n of [1, 4]) {
        const i = input(n, { bpm });
        const tl = buildJobTimeline(i);
        const { trace: ev, pulse: pu } = eventsOf(tl);
        const nodes = drops(i);
        const seen = new Set<number>();
        for (let t = ev.t0; t <= pu.t1; t += 0.02) {
          tl.time(t);
          nodes.forEach((node, idx) => {
            if (opacityOf(node) > 0) seen.add(idx);
          });
        }
        expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
        killAllTimelines();
        document.body.innerHTML = '';
      }
    }
  });

  it('plays out inside the job at every tempo, lengthens nothing, and removes its group', () => {
    for (const bpm of [20, 110, 200]) {
      for (const n of [1, 4]) {
        const i = input(n, { bpm });
        const tl = buildJobTimeline(i);
        const { pulse: ev } = eventsOf(tl);
        expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
        expect(ev.t1).toBeLessThanOrEqual(tl.duration() + 1e-9);
        expect(group(i)).not.toBeNull();
        tl.progress(1);
        expect(group(i)).toBeNull();
        killAllTimelines();
        document.body.innerHTML = '';
      }
    }
  });

  it('leaves the orbiters, the body and the bob exactly where they are without it', () => {
    const a = input(3);
    const ta = buildJobTimeline(a);
    const read = (el: Element, p: string) => Number(gsap.getProperty(el, p));
    const sample = (i: typeof a, tl: gsap.core.Timeline) =>
      [0.5, 2.2, 4.1, 5.5].map((t) => {
        tl.time(t);
        return [read(i.robotEl, 'y'), ...i.orbiters.flatMap((o) => [read(o, 'x'), read(o, 'y'), read(o, 'scale')])];
      });
    const withDecor = sample(a, ta);
    killAllTimelines();
    document.body.innerHTML = '';
    const b = input(3, { decorTier: 'none' });
    const without = sample(b, buildJobTimeline(b));
    withDecor.forEach((row, r) => row.forEach((x, c) => expect(x).toBeCloseTo(without[r][c], 9)));
  });
});
