// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { hoverPulseTargets, addHoverPulse } from './hoverPulse';
import { HOVER_GATHER_RADIUS, HOVER_PULSE_SCALE } from '../../constants';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// HELPERS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

function groups(n: number): SVGGElement[] {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  return Array.from({ length: n }, () => svg.appendChild(document.createElementNS(SVG_NS, 'g')));
}

const scaleOf = (el: Element) => Number(gsap.getProperty(el, 'scale'));

afterEach(() => {
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('hoverPulse constants (spec §1.9, Task 0b — kept as sketched)', () => {
  it('gathers at 14 u and pulses ×1.3', () => {
    expect(HOVER_GATHER_RADIUS).toBe(14);
    expect(HOVER_PULSE_SCALE).toBe(1.3);
  });
});

describe('hoverPulseTargets (pure)', () => {
  const point = { x: 520, y: 260 };

  it('puts every target HOVER_GATHER_RADIUS from the point, for 1–4 orbiters', () => {
    for (let n = 1; n <= 4; n++) {
      const targets = hoverPulseTargets(point, n);
      expect(targets).toHaveLength(n);
      for (const t of targets) expect(Math.hypot(t.x - point.x, t.y - point.y)).toBeCloseTo(HOVER_GATHER_RADIUS, 9);
    }
  });

  it('spaces them evenly round the point, so no two coincide', () => {
    for (let n = 2; n <= 4; n++) {
      const angles = hoverPulseTargets(point, n).map((t) => Math.atan2(t.y - point.y, t.x - point.x));
      for (let j = 1; j < n; j++) {
        const gap = (angles[j] - angles[j - 1] + 4 * Math.PI) % (2 * Math.PI);
        expect(gap).toBeCloseTo((2 * Math.PI) / n, 9);
      }
    }
  });

  it('starts directly above the point (a lone orbiter hovers over the mouth)', () => {
    const [only] = hoverPulseTargets(point, 1);
    expect(only.x).toBeCloseTo(point.x, 9);
    expect(only.y).toBeCloseTo(point.y - HOVER_GATHER_RADIUS, 9);
  });

  it('returns no targets for no orbiters', () => {
    expect(hoverPulseTargets(point, 0)).toEqual([]);
  });

  it('is pure — same input, same output, input untouched', () => {
    const p = { x: 1, y: 2 };
    expect(hoverPulseTargets(p, 3)).toEqual(hoverPulseTargets(p, 3));
    expect(p).toEqual({ x: 1, y: 2 });
  });
});

describe('addHoverPulse (tweens on the job timeline)', () => {
  it('pulses each orbiter in turn to rest × HOVER_PULSE_SCALE and back, one equal slot each', () => {
    const els = groups(3);
    const rest = [1, 0.8, 1.2];
    els.forEach((el, j) => gsap.set(el, { scale: rest[j] }));
    const tl = gsap.timeline({ paused: true });
    addHoverPulse(tl, els, rest, 1, 7); // slots of 2 s: [1,3] [3,5] [5,7]

    for (let j = 0; j < 3; j++) {
      tl.time(1 + 2 * j + 1); // the middle of slot j
      els.forEach((el, k) => expect(scaleOf(el)).toBeCloseTo(k === j ? rest[k] * HOVER_PULSE_SCALE : rest[k], 6));
    }
  });

  it('adds nothing before t0 and ends every orbiter at its rest scale by t1', () => {
    const els = groups(4);
    const rest = [1, 1, 0.9, 1.1];
    els.forEach((el, j) => gsap.set(el, { scale: rest[j] }));
    const tl = gsap.timeline({ paused: true });
    addHoverPulse(tl, els, rest, 2.5, 6.5);

    expect(tl.duration()).toBeCloseTo(6.5, 9);
    expect(Math.min(...tl.getChildren().map((c) => c.startTime()))).toBeCloseTo(2.5, 9);
    tl.time(6.5);
    els.forEach((el, j) => expect(scaleOf(el)).toBeCloseTo(rest[j], 9));
  });

  it('moves nothing — position is the detach\'s, never the pulse\'s', () => {
    const els = groups(2);
    const tl = gsap.timeline({ paused: true });
    addHoverPulse(tl, els, [1, 1], 0, 4);
    for (const child of tl.getChildren()) {
      const vars = (child as gsap.core.Tween).vars;
      expect(vars).not.toHaveProperty('x');
      expect(vars).not.toHaveProperty('y');
    }
  });

  it('adds no tweens for no orbiters', () => {
    const tl = gsap.timeline({ paused: true });
    addHoverPulse(tl, [], [], 1, 7);
    expect(tl.getChildren()).toHaveLength(0);
  });
});
