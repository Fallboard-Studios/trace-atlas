// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { traceRoute, traceTimes, addPolylineRun, addTrace } from './trace';
import { TRACE_STAGGER } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// HELPERS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

function groups(n: number): SVGGElement[] {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  return Array.from({ length: n }, () => {
    const g = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
    gsap.set(g, { x: 0, y: 0 });
    return g;
  });
}

/** GSAP keeps transforms to about four decimals. */
const GSAP_EPS = 1e-3;
const at = (el: Element): Vec2 => ({ x: Number(gsap.getProperty(el, 'x')), y: Number(gsap.getProperty(el, 'y')) });
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

// An L with unequal legs (60 then 20), so a length-blind split would show.
const PATH: Vec2[] = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }];

afterEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('trace constants (spec §1.9, Task 0b — kept as sketched)', () => {
  it('staggers by 0.12 of the move', () => {
    expect(TRACE_STAGGER).toBe(0.12);
  });
});

describe('traceRoute (pure)', () => {
  it('is the path forward, or reversed when the robot traces backwards', () => {
    expect(traceRoute(PATH, false)).toEqual(PATH);
    expect(traceRoute(PATH, true)).toEqual([...PATH].reverse());
  });

  it('never touches its input', () => {
    const path = PATH.map((p) => ({ ...p }));
    traceRoute(path, true);
    expect(path).toEqual(PATH);
  });

  it('drops repeated vertices, so no segment has zero length', () => {
    const route = traceRoute([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }], false);
    expect(route).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('a path that never moves is one vertex (the trace holds there)', () => {
    expect(traceRoute([{ x: 5, y: 5 }, { x: 5, y: 5 }], true)).toEqual([{ x: 5, y: 5 }]);
  });
});

describe('traceTimes (pure)', () => {
  it('one orbiter runs the whole window', () => {
    expect(traceTimes([0], 1, 7)).toEqual({ starts: [1], run: 6 });
  });

  it('staggers by rank, TRACE_STAGGER of the window apart, and the last to start ends exactly at t1', () => {
    const { starts, run } = traceTimes([2, 0, 3, 1], 1, 9);
    const stag = TRACE_STAGGER * 8;
    expect(starts[0]).toBeCloseTo(1 + 2 * stag, 9);
    expect(starts[1]).toBeCloseTo(1, 9);
    expect(starts[2]).toBeCloseTo(1 + 3 * stag, 9);
    expect(starts[3]).toBeCloseTo(1 + stag, 9);
    expect(Math.max(...starts) + run).toBeCloseTo(9, 9);
  });

  it('no orbiters, no starts', () => {
    expect(traceTimes([], 0, 4).starts).toEqual([]);
  });
});

describe('addPolylineRun (tweens)', () => {
  it('reaches each vertex at its share of the length, at constant speed', () => {
    const [el] = groups(1);
    const tl = gsap.timeline({ paused: true });
    addPolylineRun(tl, el, PATH, 2, 4); // 80 u over 4 s: the corner at 2 + 3 s
    const times = vertexTimes(PATH, 2, 4);
    expect(times).toEqual([2, 5, 6]);
    PATH.forEach((p, k) => {
      tl.time(times[k]);
      expect(dist(at(el), p)).toBeLessThan(GSAP_EPS);
    });
    tl.time(3.5); // half-way along the first leg
    expect(dist(at(el), { x: 30, y: 0 })).toBeLessThan(GSAP_EPS);
  });

  it('adds nothing before start and ends at the last vertex', () => {
    const [el] = groups(1);
    const tl = gsap.timeline({ paused: true });
    addPolylineRun(tl, el, PATH, 2, 4);
    expect(Math.min(...tl.getChildren().map((c) => c.startTime()))).toBeCloseTo(2, 9);
    expect(tl.duration()).toBeCloseTo(6, 9);
    tl.time(6);
    expect(dist(at(el), PATH[2])).toBeLessThan(1e-9);
  });

  it('a one-vertex route adds no tweens', () => {
    const [el] = groups(1);
    const tl = gsap.timeline({ paused: true });
    addPolylineRun(tl, el, [{ x: 3, y: 3 }], 0, 4);
    expect(tl.getChildren()).toHaveLength(0);
  });
});

describe('addTrace (tweens on the job timeline)', () => {
  it('every orbiter visits every vertex in order, staggered by rank, all inside [t0, t1]', () => {
    const els = groups(3);
    const ranks = [1, 2, 0];
    const tl = gsap.timeline({ paused: true });
    // Each orbiter has its own local route (its corner's dock offset), the same shape.
    const routes = els.map((_, j) => PATH.map((p) => ({ x: p.x - 10 * j, y: p.y + 5 * j })));
    els.forEach((el, j) => gsap.set(el, routes[j][0])); // where the detach leaves them
    addTrace(tl, els, routes, ranks, 1, 9);
    expect(tl.duration()).toBeLessThanOrEqual(9 + 1e-9);

    const { starts, run } = traceTimes(ranks, 1, 9);
    els.forEach((el, j) => {
      const times = vertexTimes(routes[j], starts[j], run);
      for (let k = 1; k < times.length; k++) expect(times[k]).toBeGreaterThan(times[k - 1]);
      expect(times[0]).toBeGreaterThanOrEqual(1);
      expect(times[times.length - 1]).toBeLessThanOrEqual(9 + 1e-9);
      routes[j].forEach((p, k) => {
        tl.time(times[k]);
        expect(dist(at(el), p)).toBeLessThan(GSAP_EPS);
      });
    });
  });

  it('the lead orbiter (rank 0) starts at t0; the others wait at the first vertex until their turn', () => {
    const els = groups(2);
    const tl = gsap.timeline({ paused: true });
    const routes = [PATH, PATH];
    gsap.set(els, { x: PATH[0].x, y: PATH[0].y }); // where the detach leaves them
    addTrace(tl, els, routes, [1, 0], 0, 10);
    tl.time(TRACE_STAGGER * 10 * 0.5); // the lead is moving, the other hasn't started
    expect(at(els[1]).x).toBeGreaterThan(0);
    expect(at(els[0])).toEqual(PATH[0]);
  });

  it('adds no tweens for no orbiters', () => {
    const tl = gsap.timeline({ paused: true });
    addTrace(tl, [], [], [], 1, 7);
    expect(tl.getChildren()).toHaveLength(0);
  });
});
