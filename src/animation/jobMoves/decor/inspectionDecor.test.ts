// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { inspectionWindow, tickAt, trailSegments } from './inspectionDecor';
import type { MoveEvents } from './events';
import { orbiterLocalToRowLocal, sceneToRowLocal } from './frames';
import { polyAt, polyLen, polyVertices } from './polyline';
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

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';

/** A variation with the two inspection factors set (1 = the sketch's numbers). */
function variation(over: { trailLength?: number; tickLife?: number } = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  return { ...base, decor: { ...base.decor, trailLength: over.trailLength ?? 1, tickLife: over.tickLife ?? 1 } };
}

/** A straight 200-unit route along x, so a point's x is 200 × its u. */
const STRAIGHT: Vec2[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
/** An L: 100 across, 60 down, 100 back. Length 260; interior vertices at (100, 0) and (100, 60). */
const ROUTE: Vec2[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];

/** Three orbiters running `route` from t = 1, 2.5 and 4, each for 5 s (the last ends at 9). */
function trace(route: Vec2[], over: Partial<TraceEvents> = {}): TraceEvents {
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

const len = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y);

// ========================================
// TRAIL
// ========================================
describe('trailSegments (docs/specs/JOB_DECORATION.md §1.5, Task 9)', () => {
  const v = variation();
  const ev = trace(STRAIGHT);

  it('makes eight segments and chains them back from the orbiter: segment k runs u - back(k-1)/8 to u - back k/8', () => {
    // the lead is half way along at t = 1 + 2.5; back = 20 / 200 = .1 of the route
    const segs = trailSegments(3.5, 0, ev, v);
    expect(segs).toHaveLength(8);
    segs.forEach((s, i) => {
      const k = i + 1;
      expect(s).not.toBeNull();
      expect(s!.from.x).toBeCloseTo(100 - 2.5 * (k - 1), 6);
      expect(s!.to.x).toBeCloseTo(100 - 2.5 * k, 6);
      expect(s!.from.y).toBe(0);
    });
  });

  it('is 20 units long end to end when fully extended on a straight route', () => {
    const segs = trailSegments(3.5, 0, ev, v);
    const total = segs.reduce((sum, s) => sum + len(s!.from, s!.to), 0);
    expect(total).toBeCloseTo(20, 3);
  });

  it('fades back along the trail: width 4 x fade, opacity 1 x fade, fade = 1 - (k - 1) / 8', () => {
    const segs = trailSegments(3.5, 0, ev, v);
    segs.forEach((s, i) => {
      const fade = 1 - i / 8;
      expect(s!.width).toBeCloseTo(4 * fade, 9);
      expect(s!.alpha).toBeCloseTo(1 * fade, 9);
    });
    expect(segs[0]!.width).toBe(4);
    expect(segs[0]!.alpha).toBe(1);
    expect(segs[7]!.width).toBeCloseTo(0.5, 9);
  });

  it('wears the light colour on the first two segments and the identity colour on the rest', () => {
    const segs = trailSegments(3.5, 0, ev, v);
    expect(segs.map((s) => s!.light)).toEqual([true, true, false, false, false, false, false, false]);
  });

  it('the trailLength factor scales the trail by exactly the factor, and only the length', () => {
    const long = trailSegments(3.5, 0, ev, variation({ trailLength: 1.15 }));
    expect(long.reduce((sum, s) => sum + len(s!.from, s!.to), 0)).toBeCloseTo(23, 3);
    const short = trailSegments(3.5, 0, ev, variation({ trailLength: 0.85 }));
    expect(short.reduce((sum, s) => sum + len(s!.from, s!.to), 0)).toBeCloseTo(17, 3);
    long.forEach((s, i) => {
      expect(s!.width).toBe(trailSegments(3.5, 0, ev, v)[i]!.width);
      expect(s!.alpha).toBe(trailSegments(3.5, 0, ev, v)[i]!.alpha);
    });
  });

  it('hides a segment whose tail would be behind the start: at u = .04 only the first three show', () => {
    // u = .04 (t = 1 + .2): k = 3 reaches .04 - .0375 = .0025, k = 4 would be -.01
    const segs = trailSegments(1.2, 0, ev, v);
    expect(segs.map((s) => s !== null)).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('keeps a segment whose tail lands exactly on the start of the route: at u = .1 all eight show, the last ending at x = 0', () => {
    // t = 1.5 is u = .5 / 5 = .1 = back, so segment 8 ends at u - back = 0
    const segs = trailSegments(1.5, 0, ev, v);
    expect(segs.every((s) => s !== null)).toBe(true);
    expect(segs[7]!.to.x).toBeCloseTo(0, 9);
  });

  it('hides everything before the orbiter starts and at the start itself (u not above 0)', () => {
    expect(trailSegments(0, 0, ev, v).every((s) => s === null)).toBe(true);
    expect(trailSegments(0.999, 0, ev, v).every((s) => s === null)).toBe(true);
    expect(trailSegments(1, 0, ev, v).every((s) => s === null)).toBe(true);
  });

  it('shows at u = 1 (the orbiter has arrived) and hides after it', () => {
    const arrived = trailSegments(6, 0, ev, v);
    expect(arrived.every((s) => s !== null)).toBe(true);
    expect(arrived[0]!.from.x).toBeCloseTo(200, 6);
    expect(trailSegments(6.001, 0, ev, v).every((s) => s === null)).toBe(true);
  });

  it('follows the route round a corner by length, not by vertex: the head and the last tail are polyAt of u and u - back', () => {
    const lroute = trace(ROUTE);
    // u = .42 puts the head 109.2 along, past the first corner at 100
    const t = 1 + 0.42 * 5;
    const segs = trailSegments(t, 0, lroute, v);
    const back = 20 / polyLen(ROUTE);
    const head = polyAt(ROUTE, 0.42);
    const tail = polyAt(ROUTE, 0.42 - back);
    expect(segs[0]!.from.x).toBeCloseTo(head.x, 9);
    expect(segs[0]!.from.y).toBeCloseTo(head.y, 9);
    expect(segs[7]!.to.x).toBeCloseTo(tail.x, 9);
    expect(segs[7]!.to.y).toBeCloseTo(tail.y, 9);
    expect(head.y).toBeGreaterThan(0);
    expect(tail.y).toBe(0);
  });

  it('gives each orbiter its own trail from its own start: orbiter 1 starts at 2.5', () => {
    expect(trailSegments(2, 1, ev, v).every((s) => s === null)).toBe(true);
    const segs = trailSegments(5, 1, ev, v);
    expect(segs.every((s) => s !== null)).toBe(true);
    expect(segs[0]!.from.x).toBeCloseTo(100, 6);
  });

  it('measures the trail along whatever frame the route is in: a route twice as long gets a half-length back', () => {
    const doubled = trailSegments(3.5, 0, trace([{ x: 0, y: 0 }, { x: 400, y: 0 }]), v);
    expect(doubled.reduce((sum, s) => sum + len(s!.from, s!.to), 0)).toBeCloseTo(20, 3);
    expect(doubled[0]!.from.x).toBeCloseTo(200, 6);
  });

  it('draws nothing for a route with no length, no run, or no vertices, and never returns NaN', () => {
    const none = (e: TraceEvents) => trailSegments(3.5, 0, e, v).every((s) => s === null);
    expect(none(trace([{ x: 5, y: 5 }]))).toBe(true);
    expect(none(trace([{ x: 5, y: 5 }, { x: 5, y: 5 }]))).toBe(true);
    expect(none(trace([]))).toBe(true);
    expect(none(trace(STRAIGHT, { run: 0 }))).toBe(true);
    expect(none(trace(STRAIGHT, { run: -1 }))).toBe(true);
  });

  it('draws nothing for an orbiter that is not in the plan', () => {
    expect(trailSegments(3.5, 7, ev, v).every((s) => s === null)).toBe(true);
  });
});

// ========================================
// TICKS
// ========================================
describe('tickAt (§1.5)', () => {
  const v = variation();
  const ev = trace(ROUTE);
  const vertices = polyVertices(ROUTE);
  const corner = vertices[1]; // (100, 0), u = 100 / 260
  const pass = 1 + (100 / 260) * 5;

  it('is null before the lead passes the vertex and after the tick has lived 3 seconds', () => {
    expect(tickAt(pass - 0.001, corner, ev, v)).toBeNull();
    expect(tickAt(pass, corner, ev, v)).not.toBeNull();
    expect(tickAt(pass + 3, corner, ev, v)).not.toBeNull();
    expect(tickAt(pass + 3.001, corner, ev, v)).toBeNull();
  });

  it('is timed by the lead, which is the orbiter that starts first, wherever it sits in the list', () => {
    const shuffled = trace(ROUTE, { orbs: [{ corner: 3, start: 2.5 }, { corner: 0, start: 4 }, { corner: 1, start: 1 }] });
    expect(tickAt(pass - 0.001, corner, shuffled, v)).toBeNull();
    expect(tickAt(pass + 0.001, corner, shuffled, v)).not.toBeNull();
  });

  it('is centred on the vertex and square to its direction', () => {
    const tick = tickAt(pass + 1, corner, ev, v)!;
    const mid = { x: (tick.a.x + tick.b.x) / 2, y: (tick.a.y + tick.b.y) / 2 };
    expect(mid.x).toBeCloseTo(corner.p.x, 9);
    expect(mid.y).toBeCloseTo(corner.p.y, 9);
    const dot = (tick.b.x - tick.a.x) * corner.dir.x + (tick.b.y - tick.a.y) * corner.dir.y;
    expect(dot).toBeCloseTo(0, 9);
    expect(len(tick.a, tick.b)).toBeGreaterThan(0);
  });

  it('grows to 6 long over its first tenth of a second: half length 6 x min(1, age / .1) / 2', () => {
    expect(len(...ends(tickAt(pass, corner, ev, v)!))).toBeCloseTo(0, 9);
    expect(len(...ends(tickAt(pass + 0.05, corner, ev, v)!))).toBeCloseTo(3, 9);
    expect(len(...ends(tickAt(pass + 0.1, corner, ev, v)!))).toBeCloseTo(6, 9);
    expect(len(...ends(tickAt(pass + 2.9, corner, ev, v)!))).toBeCloseTo(6, 9);
  });

  it('fades linearly from .9 to 0 over its life', () => {
    expect(tickAt(pass, corner, ev, v)!.alpha).toBeCloseTo(0.9, 9);
    expect(tickAt(pass + 1.5, corner, ev, v)!.alpha).toBeCloseTo(0.45, 9);
    expect(tickAt(pass + 3, corner, ev, v)!.alpha).toBeCloseTo(0, 9);
  });

  it('the tickLife factor stretches the life by exactly the factor', () => {
    const long = variation({ tickLife: 1.15 });
    expect(tickAt(pass + 3.2, corner, ev, v)).toBeNull();
    const late = tickAt(pass + 3.2, corner, ev, long)!;
    expect(late.alpha).toBeCloseTo(0.9 * (1 - 3.2 / 3.45), 9);
    expect(tickAt(pass + 3.45 + 0.001, corner, ev, long)).toBeNull();
  });

  it('is square to a vertex on a sloped route too', () => {
    const slope: Vec2[] = [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 40, y: 90 }];
    const vx = polyVertices(slope)[1];
    const tick = tickAt(1 + vx.u * 5 + 1, vx, trace(slope), v)!;
    const dot = (tick.b.x - tick.a.x) * vx.dir.x + (tick.b.y - tick.a.y) * vx.dir.y;
    expect(dot).toBeCloseTo(0, 9);
  });

  it('is null when the plan has no orbiter to lead', () => {
    expect(tickAt(pass + 1, corner, trace(ROUTE, { orbs: [] }), v)).toBeNull();
  });

  it('is null for a run with no length of time', () => {
    expect(tickAt(pass + 1, corner, trace(ROUTE, { run: 0 }), v)).toBeNull();
  });
});

function ends(tick: { a: Vec2; b: Vec2 }): [Vec2, Vec2] {
  return [tick.a, tick.b];
}

// ========================================
// WINDOW
// ========================================
describe('inspectionWindow (as built: the trace plus one tick life, clamped to the job)', () => {
  it('runs from the trace start to its end plus 3 s x the tickLife factor', () => {
    expect(inspectionWindow(trace(ROUTE), variation(), 99)).toEqual([1, 12]);
    expect(inspectionWindow(trace(ROUTE), variation({ tickLife: 1.15 }), 99)[1]).toBeCloseTo(9 + 3.45, 9);
  });

  it('never runs past the end of the job', () => {
    expect(inspectionWindow(trace(ROUTE), variation(), 10)).toEqual([1, 10]);
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

/** A four-vertex outline: 140 across, 50 down, 140 back, so two interior vertices. */
const OUTLINE: Vec2[] = [{ x: 380, y: 430 }, { x: 520, y: 430 }, { x: 520, y: 380 }, { x: 380, y: 380 }];

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, GEM_SEED),
    site: { points: [{ x: 470, y: 420 }], paths: { outline: OUTLINE } },
    job: JobType.StructuralInspection,
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
const traceOf = (tl: gsap.core.Timeline) => (tl.data as { events: MoveEvents[] }).events[0] as TraceEvents;
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const opacityOf = (el: Element) => num(el, 'opacity');
const frameFor = (i: { robot: { position: Vec2 } }, layerScale: number) => ({
  robotPos: i.robot.position,
  gem: getRobotGem(GEM_SEED),
  layerScale,
});
const rowRoute = (i: { robot: { position: Vec2 } }, ev: TraceEvents, layerScale: number) =>
  ev.route.map((p) => sceneToRowLocal(p, frameFor(i, layerScale)));
const trails = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-trail')];
const ticks = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-tick')];

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addInspectionDecor on a Structural Inspection job (Task 9)', () => {
  it.each([1, 2, 3, 4])('makes eight trail lines per orbiter and a tick per interior vertex (%d orbiters)', (n) => {
    const i = input(n);
    buildJobTimeline(i);
    const g = group(i)!;
    expect(g.getAttribute('data-job')).toBe(JobType.StructuralInspection);
    expect(trails(i)).toHaveLength(n * 8);
    expect(ticks(i)).toHaveLength(2);
    expect(g.querySelectorAll('line')).toHaveLength(n * 8 + 2);
  });

  it('draws the trails orbiter by orbiter, then the ticks, and starts every node invisible', () => {
    const i = input(2);
    buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('line')];
    expect(nodes.map((n) => n.getAttribute('class'))).toEqual([
      ...Array(16).fill('robot__work-trail'),
      'robot__work-tick',
      'robot__work-tick',
    ]);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('wears the light colour on the first two segments of each trail, the identity colour on the rest, and the light colour on ticks', () => {
    const i = input(2);
    buildJobTimeline(i);
    trails(i).forEach((node, idx) => {
      expect(node.getAttribute('stroke')).toBe(idx % 8 < 2 ? GEM_LIGHT_COLOR : IDENTITY);
      expect(node.getAttribute('stroke-linecap')).toBe('round');
    });
    ticks(i).forEach((node) => {
      expect(node.getAttribute('stroke')).toBe(GEM_LIGHT_COLOR);
      expect(node.getAttribute('stroke-width')).toBe('1');
    });
  });

  it.each([1, 0.75])('mid-run the lead first segment starts on the lead orbiter live centre (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    const lead = ev.orbs.reduce((best, orb, j) => (orb.start < ev.orbs[best].start ? j : best), 0);
    tl.time(ev.orbs[lead].start + ev.run / 2);
    const el = i.orbiters[lead];
    const centre = orbiterLocalToRowLocal(
      { x: Number(gsap.getProperty(el, 'x')), y: Number(gsap.getProperty(el, 'y')) },
      { gem: getRobotGem(GEM_SEED), bodyScale: i.bodyScale, corner: ev.orbs[lead].corner },
    );
    const first = trails(i)[lead * 8];
    expect(num(first, 'x1')).toBeCloseTo(centre.x, 3);
    expect(num(first, 'y1')).toBeCloseTo(centre.y, 3);
  });

  it.each([1, 0.75])('writes the pure state onto every trail line, hidden ones at opacity 0 (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    const v = workVariation(GEM_SEED);
    const row = { ...ev, route: rowRoute(i, ev, layerScale) };
    const nodes = trails(i);
    for (const frac of [0.04, 0.5, 0.99]) {
      ev.orbs.forEach((orb, j) => {
        const t = orb.start + frac * ev.run;
        tl.time(t);
        trailSegments(tl.time(), j, row, v).forEach((seg, k) => {
          const node = nodes[j * 8 + k];
          if (!seg) return expect(opacityOf(node)).toBe(0);
          expect(num(node, 'x1')).toBeCloseTo(seg.from.x, 2);
          expect(num(node, 'y1')).toBeCloseTo(seg.from.y, 2);
          expect(num(node, 'x2')).toBeCloseTo(seg.to.x, 2);
          expect(num(node, 'y2')).toBeCloseTo(seg.to.y, 2);
          expect(num(node, 'stroke-width')).toBeCloseTo(seg.width, 2);
          expect(opacityOf(node)).toBeCloseTo(seg.alpha, 2);
        });
      });
    }
  });

  it('the trail is 20 long in the robot frame, so on the back row it is 15 scene units', () => {
    const i = input(1, { layerScale: 0.75 });
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    tl.time(ev.orbs[0].start + ev.run / 2);
    const v = workVariation(GEM_SEED);
    // the middle of the first 140-unit run, so the whole trail is straight
    const drawn = trails(i).reduce(
      (sum, n) => sum + Math.hypot(num(n, 'x2') - num(n, 'x1'), num(n, 'y2') - num(n, 'y1')),
      0,
    );
    expect(drawn).toBeCloseTo(20 * v.decor.trailLength, 2);
  });

  it('puts a tick on each interior vertex, as the pure state says, and lights it from the lead pass', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    const v = workVariation(GEM_SEED);
    const row = rowRoute(i, ev, 1);
    const verts = polyVertices(row);
    const lead = ev.orbs.reduce((a, b) => (b.start < a.start ? b : a));
    const nodes = ticks(i);
    [1, 2].forEach((k, idx) => {
      const pass = lead.start + verts[k].u * ev.run;
      tl.time(pass - 0.05);
      expect(opacityOf(nodes[idx])).toBe(0);
      tl.time(pass + 1);
      const want = tickAt(tl.time(), verts[k], { ...ev, route: row }, v)!;
      expect(num(nodes[idx], 'x1')).toBeCloseTo(want.a.x, 2);
      expect(num(nodes[idx], 'y1')).toBeCloseTo(want.a.y, 2);
      expect(num(nodes[idx], 'x2')).toBeCloseTo(want.b.x, 2);
      expect(num(nodes[idx], 'y2')).toBeCloseTo(want.b.y, 2);
      expect(opacityOf(nodes[idx])).toBeCloseTo(want.alpha, 2);
      expect(opacityOf(nodes[idx])).toBeGreaterThan(0);
    });
  });

  it('every node is invisible when the trace opens, and seeking back to the start puts them out again', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    const nodes = [...group(i)!.querySelectorAll('line')];
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    tl.time(ev.t1 - 0.5);
    expect(nodes.some((n) => opacityOf(n) > 0)).toBe(true);
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('cheap draws only the ticks: no trail lines', () => {
    const i = input(3, { decorTier: 'cheap' });
    const tl = buildJobTimeline(i);
    expect(trails(i)).toHaveLength(0);
    expect(ticks(i)).toHaveLength(2);
    const ev = traceOf(tl);
    tl.time(ev.orbs[0].start + ev.run * 0.8);
    expect(ticks(i).some((n) => opacityOf(n) > 0)).toBe(true);
  });

  it('draws nothing at tier none, with no orbiters, or on a route with no corner and no trail to draw', () => {
    const off = input(3, { decorTier: 'none' });
    buildJobTimeline(off);
    expect(group(off)).toBeNull();

    const empty = input(0);
    buildJobTimeline(empty);
    expect(group(empty)).toBeNull();

    // cheap on a two-vertex route has no interior vertex, so nothing at all
    const flat = input(3, { decorTier: 'cheap', site: { points: [{ x: 470, y: 420 }], paths: { outline: [OUTLINE[0], OUTLINE[1]] } } });
    buildJobTimeline(flat);
    expect(group(flat)).toBeNull();
  });

  it('on a two-vertex route draws trails and no ticks', () => {
    const i = input(2, { site: { points: [{ x: 470, y: 420 }], paths: { outline: [OUTLINE[0], OUTLINE[1]] } } });
    buildJobTimeline(i);
    expect(trails(i)).toHaveLength(16);
    expect(ticks(i)).toHaveLength(0);
  });

  it('draws nothing on a route that is a single point', () => {
    const i = input(2, { site: { points: [{ x: 470, y: 420 }], paths: { outline: [OUTLINE[0], OUTLINE[0]] } } });
    buildJobTimeline(i);
    expect(group(i)).toBeNull();
  });

  it('plays out inside the job at every tempo, lengthens nothing, and removes its group', () => {
    for (const bpm of [20, 110, 200]) {
      for (const n of [1, 4]) {
        const i = input(n, { bpm });
        const tl = buildJobTimeline(i);
        expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
        expect(group(i)).not.toBeNull();
        tl.progress(1);
        expect(group(i)).toBeNull();
        killAllTimelines();
        document.body.innerHTML = '';
      }
    }
  });

  it('keeps the ticks lit past the end of the trace instead of cutting them there', () => {
    const i = input(1);
    const tl = buildJobTimeline(i);
    const ev = traceOf(tl);
    tl.time(ev.t1 + 0.01);
    expect(group(i)).not.toBeNull();
    expect(ticks(i).some((n) => opacityOf(n) > 0)).toBe(true);
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
