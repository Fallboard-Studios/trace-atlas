// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { ringRadius, ringStartAngles, ringRoute, addRing } from './ring';
import { RING_RADIUS, RING_RADIUS_JITTER, RING_REVOLUTIONS } from '../../constants';
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
const CENTRE: Vec2 = { x: 300, y: 200 };
/** The widest ring a robot can draw. */
const R_MAX = RING_RADIUS * (1 + RING_RADIUS_JITTER);

afterEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('ring constants (spec §1.9, Task 0b — kept as sketched)', () => {
  it('radius 24 u ±15 %, 1.5 revolutions per move', () => {
    expect(RING_RADIUS).toBe(24);
    expect(RING_RADIUS_JITTER).toBe(0.15);
    expect(RING_REVOLUTIONS).toBe(1.5);
  });
});

describe('ringRadius / ringStartAngles (pure)', () => {
  it('scales RING_RADIUS by the robot\'s radius scale', () => {
    expect(ringRadius(1)).toBe(RING_RADIUS);
    expect(ringRadius(0.85)).toBeCloseTo(RING_RADIUS * 0.85, 12);
  });

  it('spaces the orbiters evenly from the robot\'s phase, the first directly above at phase 0', () => {
    expect(ringStartAngles(1, 0)).toEqual([-Math.PI / 2]);
    for (let n = 2; n <= 4; n++) {
      const a = ringStartAngles(n, 1.3);
      expect(a[0]).toBeCloseTo(1.3 - Math.PI / 2, 12);
      for (let j = 1; j < n; j++) expect(a[j] - a[j - 1]).toBeCloseTo((2 * Math.PI) / n, 12);
    }
  });

  it('no orbiters, no angles', () => {
    expect(ringStartAngles(0, 2)).toEqual([]);
  });
});

describe('ringRoute (pure)', () => {
  it('every vertex is on the circle, starting at the start angle', () => {
    const route = ringRoute(CENTRE, 20, 0.7, 1);
    for (const p of route) expect(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y)).toBeCloseTo(20, 9);
    expect(route[0].x).toBeCloseTo(CENTRE.x + 20 * Math.cos(0.7), 9);
    expect(route[0].y).toBeCloseTo(CENTRE.y + 20 * Math.sin(0.7), 9);
  });

  it('sweeps RING_REVOLUTIONS turns in the given direction', () => {
    for (const direction of [1, -1] as const) {
      const route = ringRoute(CENTRE, 20, 0, direction);
      let swept = 0;
      for (let k = 1; k < route.length; k++) {
        const a0 = Math.atan2(route[k - 1].y - CENTRE.y, route[k - 1].x - CENTRE.x);
        const a1 = Math.atan2(route[k].y - CENTRE.y, route[k].x - CENTRE.x);
        const step = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
        expect(Math.sign(step)).toBe(direction);
        swept += step;
      }
      expect(swept).toBeCloseTo(direction * 2 * Math.PI * RING_REVOLUTIONS, 9);
    }
  });

  it('is fine enough that the chords between vertices stay within 1 u of the widest ring', () => {
    const route = ringRoute(CENTRE, R_MAX, 0, 1);
    for (let k = 1; k < route.length; k++) {
      const mid = { x: (route[k - 1].x + route[k].x) / 2, y: (route[k - 1].y + route[k].y) / 2 };
      expect(R_MAX - Math.hypot(mid.x - CENTRE.x, mid.y - CENTRE.y)).toBeLessThan(1);
    }
  });
});

describe('addRing (tweens on the job timeline)', () => {
  it('runs each orbiter round its own route over exactly [t0, t1]', () => {
    const els = groups(3);
    const routes = ringStartAngles(3, 0.4).map((a) => ringRoute(CENTRE, 22, a, -1));
    const tl = gsap.timeline({ paused: true });
    addRing(tl, els, routes, 1.5, 7.5);
    expect(Math.min(...tl.getChildren().map((c) => c.startTime()))).toBeCloseTo(1.5, 9);
    expect(tl.duration()).toBeCloseTo(7.5, 9);
    tl.time(7.5);
    els.forEach((el, j) => {
      const end = routes[j][routes[j].length - 1];
      expect(Math.hypot(at(el).x - end.x, at(el).y - end.y)).toBeLessThan(GSAP_EPS);
    });
  });

  it('stays within ±1 u of the radius and evenly phased throughout', () => {
    const els = groups(4);
    const routes = ringStartAngles(4, 2.1).map((a) => ringRoute(CENTRE, R_MAX, a, 1));
    const tl = gsap.timeline({ paused: true });
    els.forEach((el, j) => gsap.set(el, { x: routes[j][0].x, y: routes[j][0].y }));
    addRing(tl, els, routes, 0, 6);
    for (let t = 0; t <= 6; t += 0.0731) {
      tl.time(t);
      const angles = els.map((el) => {
        const p = at(el);
        expect(Math.abs(Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y) - R_MAX)).toBeLessThanOrEqual(1);
        return Math.atan2(p.y - CENTRE.y, p.x - CENTRE.x);
      });
      for (let j = 1; j < 4; j++) {
        const gap = (angles[j] - angles[j - 1] + 4 * Math.PI) % (2 * Math.PI);
        expect(gap).toBeCloseTo(Math.PI / 2, 6);
      }
    }
  });

  it('adds no tweens for no orbiters', () => {
    const tl = gsap.timeline({ paused: true });
    addRing(tl, [], [], 0, 4);
    expect(tl.getChildren()).toHaveLength(0);
  });
});
