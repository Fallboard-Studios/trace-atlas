// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { describe, it, expect } from 'vitest';

import { polyLen, polyAt, polyVertices } from './polyline';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// FIXTURES
// ========================================
const pt = (x: number, y: number): Vec2 => ({ x, y });

/** Two unequal segments: 10 long, then 2 long. Total 12; the midpoint by length is on the first. */
const L_ROUTE = [pt(0, 0), pt(10, 0), pt(10, 2)];

/** A route with a right angle between equal legs. */
const CORNER = [pt(0, 0), pt(10, 0), pt(10, 10)];

const norm = (v: Vec2) => Math.hypot(v.x, v.y);

// ========================================
// TESTS
// ========================================
describe('polyLen (docs/specs/JOB_DECORATION.md §1.5, Task 2)', () => {
  it('is 0 for an empty route and for a single vertex', () => {
    expect(polyLen([])).toBe(0);
    expect(polyLen([pt(3, 4)])).toBe(0);
  });

  it('is the straight-line distance for two vertices', () => {
    expect(polyLen([pt(0, 0), pt(3, 4)])).toBeCloseTo(5, 12);
  });

  it('sums every segment of a longer route', () => {
    expect(polyLen(L_ROUTE)).toBeCloseTo(12, 12);
    expect(polyLen(CORNER)).toBeCloseTo(20, 12);
  });

  it('counts every segment of a closed-looking route (first = last)', () => {
    const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10), pt(0, 0)];
    expect(polyLen(square)).toBeCloseTo(40, 12);
  });

  it('adds nothing for a repeated vertex', () => {
    expect(polyLen([pt(0, 0), pt(0, 0), pt(6, 8), pt(6, 8)])).toBeCloseTo(10, 12);
  });
});

describe('polyAt', () => {
  it('returns the ends at u = 0 and u = 1', () => {
    expect(polyAt(L_ROUTE, 0)).toEqual(pt(0, 0));
    expect(polyAt(L_ROUTE, 1)).toEqual(pt(10, 2));
  });

  it('returns the end vertex bit-for-bit at u = 1, with no interpolation residue — 200 seeded random routes', () => {
    const R = alea('job-decor-t2-exact-end');
    for (let n = 0; n < 200; n++) {
      const route = Array.from({ length: 2 + Math.floor(R() * 6) }, () => pt(R() * 300 + 0.1, R() * 200 + 0.3));
      expect(polyAt(route, 1)).toEqual(route[route.length - 1]);
      expect(polyAt(route, 0)).toEqual(route[0]);
    }
  });

  it('clamps u outside [0, 1], infinities included', () => {
    expect(polyAt(L_ROUTE, -0.5)).toEqual(pt(0, 0));
    expect(polyAt(L_ROUTE, 7)).toEqual(pt(10, 2));
    expect(polyAt(L_ROUTE, Number.NEGATIVE_INFINITY)).toEqual(pt(0, 0));
    expect(polyAt(L_ROUTE, Number.POSITIVE_INFINITY)).toEqual(pt(10, 2));
  });

  it('treats a NaN u as the start rather than returning NaN', () => {
    expect(polyAt(L_ROUTE, Number.NaN)).toEqual(pt(0, 0));
  });

  it('lands by length, not by vertex count: u = 0.5 on 10 + 2 is 6 along the first segment', () => {
    const mid = polyAt(L_ROUTE, 0.5);
    expect(mid.x).toBeCloseTo(6, 12);
    expect(mid.y).toBeCloseTo(0, 12);
  });

  it('turns the corner at the right u and keeps going on the second segment', () => {
    const atCorner = polyAt(L_ROUTE, 10 / 12);
    expect(atCorner.x).toBeCloseTo(10, 9);
    expect(atCorner.y).toBeCloseTo(0, 9);
    const past = polyAt(L_ROUTE, 11 / 12);
    expect(past.x).toBeCloseTo(10, 9);
    expect(past.y).toBeCloseTo(1, 9);
  });

  it('moves at constant speed across unequal collinear segments (x = 10 u on 1 + 9)', () => {
    const route = [pt(0, 0), pt(1, 0), pt(10, 0)];
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      expect(polyAt(route, u).x).toBeCloseTo(10 * u, 9);
    }
  });

  it('returns the one vertex of a one-vertex route at every u', () => {
    for (const u of [-1, 0, 0.5, 1, 2]) expect(polyAt([pt(7, 9)], u)).toEqual(pt(7, 9));
  });

  it('returns the first vertex when every vertex is the same point (zero length)', () => {
    expect(polyAt([pt(2, 3), pt(2, 3), pt(2, 3)], 0.4)).toEqual(pt(2, 3));
  });

  it('steps over zero-length segments without NaN', () => {
    const route = [pt(0, 0), pt(0, 0), pt(10, 0), pt(10, 0)];
    for (const u of [0, 0.25, 0.5, 0.999, 1]) {
      const p = polyAt(route, u);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeCloseTo(10 * u, 9);
    }
    expect(polyAt(route, 1)).toEqual(pt(10, 0));
  });

  it('throws RangeError on an empty route (there is no point to return)', () => {
    expect(() => polyAt([], 0.5)).toThrow(RangeError);
  });

  it('returns fresh objects, never the route\'s own vertices', () => {
    const route = [pt(0, 0), pt(4, 0)];
    expect(polyAt(route, 0)).not.toBe(route[0]);
    expect(polyAt(route, 1)).not.toBe(route[1]);
    expect(polyAt([pt(1, 1)], 0.5)).not.toBe(polyAt([pt(1, 1)], 0.5));
  });

  it('does not mutate a frozen route', () => {
    const route = Object.freeze([Object.freeze(pt(0, 0)), Object.freeze(pt(5, 5))]);
    expect(() => polyAt(route, 0.3)).not.toThrow();
  });
});

describe('polyVertices', () => {
  it('is empty for an empty route', () => {
    expect(polyVertices([])).toEqual([]);
  });

  it('gives u = 0 and a unit direction for a single vertex (no NaN, no zero vector)', () => {
    const [v] = polyVertices([pt(5, 5)]);
    expect(v.p).toEqual(pt(5, 5));
    expect(v.u).toBe(0);
    expect(norm(v.dir)).toBeCloseTo(1, 12);
  });

  it('has u non-decreasing from exactly 0 to exactly 1', () => {
    const route = [pt(0, 0), pt(3, 4), pt(3, 9), pt(10, 9), pt(12, 1)];
    const vs = polyVertices(route);
    expect(vs).toHaveLength(route.length);
    expect(vs[0].u).toBe(0);
    expect(vs[vs.length - 1].u).toBe(1);
    for (let k = 1; k < vs.length; k++) expect(vs[k].u).toBeGreaterThanOrEqual(vs[k - 1].u);
  });

  it('puts each vertex at the u where polyAt lands on it — 100 seeded random routes', () => {
    const R = alea('job-decor-t2-vertices');
    for (let n = 0; n < 100; n++) {
      const route = Array.from({ length: 2 + Math.floor(R() * 6) }, () => pt(R() * 300, R() * 200));
      for (const v of polyVertices(route)) {
        const at = polyAt(route, v.u);
        expect(at.x).toBeCloseTo(v.p.x, 6);
        expect(at.y).toBeCloseTo(v.p.y, 6);
      }
    }
  });

  it('returns unit directions everywhere — 100 seeded random routes', () => {
    const R = alea('job-decor-t2-unit');
    for (let n = 0; n < 100; n++) {
      const route = Array.from({ length: 1 + Math.floor(R() * 7) }, () => pt(R() * 300, R() * 200));
      for (const v of polyVertices(route)) expect(norm(v.dir)).toBeCloseTo(1, 9);
    }
  });

  it('is one-sided at the ends: the first and last segment\'s direction', () => {
    const vs = polyVertices(L_ROUTE);
    expect(vs[0].dir.x).toBeCloseTo(1, 12);
    expect(vs[0].dir.y).toBeCloseTo(0, 12);
    expect(vs[2].dir.x).toBeCloseTo(0, 12);
    expect(vs[2].dir.y).toBeCloseTo(1, 12);
  });

  it('averages incoming and outgoing at an interior corner: a right angle of equal legs points diagonally', () => {
    const corner = polyVertices(CORNER)[1];
    expect(corner.dir.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(corner.dir.y).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('weights the average by segment length, as the sketch does (the chord from previous to next vertex)', () => {
    const corner = polyVertices(L_ROUTE)[1];
    const chord = norm(pt(10, 2));
    expect(corner.dir.x).toBeCloseTo(10 / chord, 12);
    expect(corner.dir.y).toBeCloseTo(2 / chord, 12);
  });

  it('gives a repeated vertex the neighbouring segment\'s direction, never NaN', () => {
    const mid = polyVertices([pt(0, 0), pt(10, 0), pt(10, 0), pt(10, 10)]);
    expect(mid[1].dir.x).toBeCloseTo(1, 12);
    expect(mid[1].dir.y).toBeCloseTo(0, 12);
    expect(mid[2].dir.x).toBeCloseTo(0, 12);
    expect(mid[2].dir.y).toBeCloseTo(1, 12);
    expect(mid[1].u).toBe(mid[2].u);
  });

  it('gives a repeated first vertex the outgoing direction and a repeated last vertex the incoming one', () => {
    const start = polyVertices([pt(0, 0), pt(0, 0), pt(0, 5)]);
    for (const v of start.slice(0, 2)) {
      expect(v.dir.x).toBeCloseTo(0, 12);
      expect(v.dir.y).toBeCloseTo(1, 12);
    }
    const end = polyVertices([pt(0, 0), pt(5, 0), pt(5, 0)]);
    for (const v of end.slice(1)) {
      expect(v.dir.x).toBeCloseTo(1, 12);
      expect(v.dir.y).toBeCloseTo(0, 12);
    }
  });

  it('keeps a unit direction where the route doubles back on itself (previous and next coincide)', () => {
    const back = polyVertices([pt(0, 0), pt(10, 0), pt(0, 0)]);
    expect(back[1].dir.x).toBeCloseTo(1, 12);
    expect(back[1].dir.y).toBeCloseTo(0, 12);
  });

  it('gives a zero-length route u = 0 everywhere and unit directions', () => {
    const vs = polyVertices([pt(2, 2), pt(2, 2), pt(2, 2)]);
    for (const v of vs) {
      expect(v.u).toBe(0);
      expect(norm(v.dir)).toBeCloseTo(1, 12);
    }
  });

  it('handles a closed-looking route: first u = 0, last u = 1, every corner diagonal', () => {
    const square = [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10), pt(0, 0)];
    const vs = polyVertices(square);
    expect(vs[0].u).toBe(0);
    expect(vs[4].u).toBe(1);
    expect(vs[2].u).toBeCloseTo(0.5, 12);
    expect(vs[1].dir.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(vs[1].dir.y).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('returns fresh points and does not alias or mutate the route', () => {
    const route = Object.freeze([Object.freeze(pt(0, 0)), Object.freeze(pt(4, 3))]);
    const vs = polyVertices(route);
    expect(vs[0].p).toEqual(pt(0, 0));
    expect(vs[0].p).not.toBe(route[0]);
    expect(vs[1].p).not.toBe(route[1]);
  });
});
