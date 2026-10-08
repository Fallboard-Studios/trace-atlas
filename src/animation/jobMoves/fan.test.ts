// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { fanTargets, addFan } from './fan';
import { FAN_RADIUS, FAN_SPREAD_DEG, FAN_PING_SCALE } from '../../constants';
import type { Vec2 } from '../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// HELPERS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

function groups(n: number, restScale = 1): SVGGElement[] {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  return Array.from({ length: n }, () => {
    const g = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
    gsap.set(g, { scale: restScale });
    return g;
  });
}

const scaleOf = (el: Element) => Number(gsap.getProperty(el, 'scale'));
const POINT: Vec2 = { x: 300, y: 200 };
/** Each target's angle round the point, degrees (screen: −90 is straight up). */
const degreesOf = (targets: Vec2[]) => targets.map((p) => (Math.atan2(p.y - POINT.y, p.x - POINT.x) * 180) / Math.PI);

afterEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('fan constants (spec §1.9, Task 0b — kept as sketched)', () => {
  it('fans 40 u out over 120°, pinging ×1.5', () => {
    expect(FAN_RADIUS).toBe(40);
    expect(FAN_SPREAD_DEG).toBe(120);
    expect(FAN_PING_SCALE).toBe(1.5);
  });
});

describe('fanTargets (pure)', () => {
  it('one orbiter goes straight up, FAN_RADIUS above the point', () => {
    const [t] = fanTargets(POINT, 1);
    expect(t.x).toBeCloseTo(POINT.x, 9);
    expect(t.y).toBeCloseTo(POINT.y - FAN_RADIUS, 9);
  });

  it('spreads 2–4 orbiters evenly over FAN_SPREAD_DEG, centred on straight up, left to right by slot', () => {
    const expected: Record<number, number[]> = {
      2: [-150, -30],
      3: [-150, -90, -30],
      4: [-150, -110, -70, -30],
    };
    for (const n of [2, 3, 4]) {
      const targets = fanTargets(POINT, n);
      degreesOf(targets).forEach((deg, j) => expect(deg, `${n}/${j}`).toBeCloseTo(expected[n][j], 6));
      for (const p of targets) expect(Math.hypot(p.x - POINT.x, p.y - POINT.y)).toBeCloseTo(FAN_RADIUS, 9);
      for (let j = 1; j < n; j++) expect(targets[j].x).toBeGreaterThan(targets[j - 1].x);
    }
  });

  it('every target is above the point (the fan opens over the site)', () => {
    for (const n of [1, 2, 3, 4]) for (const p of fanTargets(POINT, n)) expect(p.y).toBeLessThan(POINT.y);
  });

  it('no orbiters, no targets', () => {
    expect(fanTargets(POINT, 0)).toEqual([]);
  });
});

describe('addFan (tweens on the job timeline)', () => {
  it('pings each orbiter to FAN_PING_SCALE × its rest scale in the robot\'s turn order, one equal slot each', () => {
    const els = groups(3, 0.8);
    const ranks = [2, 0, 1];
    const tl = gsap.timeline({ paused: true });
    addFan(tl, els, [0.8, 0.8, 0.8], 1, 7, ranks);
    const slot = 2;
    for (let turn = 0; turn < 3; turn++) {
      tl.time(1 + (turn + 0.5) * slot);
      els.forEach((el, j) => expect(scaleOf(el), `turn ${turn}, orbiter ${j}`).toBeCloseTo(ranks[j] === turn ? 0.8 * FAN_PING_SCALE : 0.8, 6));
      tl.time(1 + turn * slot);
      for (const el of els) expect(scaleOf(el)).toBeCloseTo(0.8, 6);
    }
  });

  it('pings in slot order without ranks, and ends every orbiter at its own rest scale by t1', () => {
    const els = groups(2);
    gsap.set(els[1], { scale: 1.2 });
    const tl = gsap.timeline({ paused: true });
    addFan(tl, els, [1, 1.2], 0, 4);
    tl.time(1);
    expect([scaleOf(els[0]), scaleOf(els[1])]).toEqual([FAN_PING_SCALE, 1.2]);
    tl.time(3);
    expect(scaleOf(els[1])).toBeCloseTo(1.2 * FAN_PING_SCALE, 6);
    expect(tl.duration()).toBeCloseTo(4, 9);
    tl.time(4);
    expect([scaleOf(els[0]), scaleOf(els[1])]).toEqual([1, 1.2]);
  });

  it('never writes position', () => {
    const els = groups(2);
    const tl = gsap.timeline({ paused: true });
    addFan(tl, els, [1, 1], 0, 4);
    tl.progress(0.3);
    for (const el of els) expect([gsap.getProperty(el, 'x'), gsap.getProperty(el, 'y')]).toEqual([0, 0]);
  });

  it('adds no tweens for no orbiters', () => {
    const tl = gsap.timeline({ paused: true });
    addFan(tl, [], [], 0, 4);
    expect(tl.getChildren()).toHaveLength(0);
  });
});
