// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { carryTargets, addCarry, CARRY_SPACING } from './carry';
import { CARRY_SHRINK } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// HELPERS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Groups already on their pick-up (the detach leaves them there), at their rest scales. */
function groups(from: readonly Vec2[], restScales: readonly number[]): SVGGElement[] {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  return from.map((p, j) => {
    const g = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
    gsap.set(g, { x: p.x, y: p.y, scale: restScales[j] });
    return g;
  });
}

/** GSAP keeps transforms to about four decimals. */
const GSAP_EPS = 1e-3;
const at = (el: Element): Vec2 => ({ x: Number(gsap.getProperty(el, 'x')), y: Number(gsap.getProperty(el, 'y')) });
const scaleOf = (el: Element) => Number(gsap.getProperty(el, 'scale'));
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const A: Vec2 = { x: 200, y: 300 };
const B: Vec2 = { x: 320, y: 280 };

afterEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('carry constants (spec §1.9, Task 0b — kept as sketched)', () => {
  it('shrinks to ×0.7 while loaded, side by side 8 u apart', () => {
    expect(CARRY_SHRINK).toBe(0.7);
    expect(CARRY_SPACING).toBe(8);
  });
});

describe('carryTargets (pure)', () => {
  it('one orbiter carries from a to b exactly', () => {
    expect(carryTargets(A, B, 1)).toEqual([{ from: A, to: B }]);
  });

  it('several carry side by side, CARRY_SPACING apart in x, centred on a and on b', () => {
    const pairs = carryTargets(A, B, 4);
    expect(pairs.map((p) => p.from.x - A.x)).toEqual([-12, -4, 4, 12]);
    expect(pairs.map((p) => p.to.x - B.x)).toEqual([-12, -4, 4, 12]);
    for (const p of pairs) {
      expect(p.from.y).toBe(A.y);
      expect(p.to.y).toBe(B.y);
    }
  });

  it('no orbiters, no targets; a and b are never mutated', () => {
    const a = { ...A };
    const b = { ...B };
    expect(carryTargets(a, b, 0)).toEqual([]);
    carryTargets(a, b, 3);
    expect([a, b]).toEqual([A, B]);
  });
});

describe('addCarry (tweens on the job timeline)', () => {
  const T0 = 1;
  const T1 = 9;
  const L = T1 - T0;
  const atFraction = (f: number) => T0 + f * L;

  function run(n: number, restScales: number[]) {
    const pairs = carryTargets(A, B, n);
    const routes = pairs.map((p) => [p.from, p.to]);
    const els = groups(pairs.map((p) => p.from), restScales);
    const tl = gsap.timeline({ paused: true });
    addCarry(tl, els, routes, restScales, T0, T1);
    return { els, routes, tl };
  }

  it('loads (shrinks) on a, carries to b shrunk, drops (back to rest) on b, returns to a, all together', () => {
    const rest = [1, 0.9];
    const { els, routes, tl } = run(2, rest);
    const expectAll = (f: number, where: 0 | 1, shrunk: boolean) => {
      tl.time(atFraction(f));
      els.forEach((el, j) => {
        expect(dist(at(el), routes[j][where]), `f ${f}, orbiter ${j}`).toBeLessThan(GSAP_EPS);
        expect(scaleOf(el), `f ${f}, orbiter ${j}`).toBeCloseTo(rest[j] * (shrunk ? CARRY_SHRINK : 1), 6);
      });
    };
    expectAll(0, 0, false);
    expectAll(0.1, 0, true); // loaded
    expectAll(0.45, 1, true); // carried
    expectAll(0.55, 1, false); // dropped
    expectAll(0.9, 0, false); // returned
    expectAll(1, 0, false); // held until the move ends
  });

  it('moves toward b without turning back while loaded, and toward a on the return', () => {
    const { els, routes, tl } = run(1, [1]);
    let last = Infinity;
    for (let f = 0.1; f <= 0.45 + 1e-9; f += 0.035) {
      tl.time(atFraction(f));
      const d = dist(at(els[0]), routes[0][1]);
      expect(d).toBeLessThanOrEqual(last + GSAP_EPS);
      last = d;
    }
    last = Infinity;
    for (let f = 0.55; f <= 0.9 + 1e-9; f += 0.035) {
      tl.time(atFraction(f));
      const d = dist(at(els[0]), routes[0][0]);
      expect(d).toBeLessThanOrEqual(last + GSAP_EPS);
      last = d;
    }
  });

  it('adds nothing past t1', () => {
    const { tl } = run(3, [1, 1, 1]);
    expect(tl.duration()).toBeLessThanOrEqual(T1 + 1e-9);
  });

  it('adds no tweens for no orbiters', () => {
    const tl = gsap.timeline({ paused: true });
    addCarry(tl, [], [], [], 0, 6);
    expect(tl.getChildren()).toHaveLength(0);
  });
});
