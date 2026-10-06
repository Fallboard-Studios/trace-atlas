// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  GEM_LIGHT,
  GEM_FACET_CONTRAST,
  GEM_BEVEL_DEPTH,
  bevelDepth,
  facetShade,
  facetTone,
  partFacetShades,
  quantizeShade,
  GEM_FACET_TONES,
} from './gemShading';
import * as polygon from './polygon';
import type { GemPoint } from './polygon';

// ========================================
// TESTS
// ========================================
describe('GEM_LIGHT — one light direction for every robot', () => {
  it('is a unit vector pointing up and to the left (top-left light)', () => {
    expect(Math.hypot(GEM_LIGHT[0], GEM_LIGHT[1])).toBeCloseTo(1, 12);
    expect(GEM_LIGHT[0]).toBeLessThan(0);
    expect(GEM_LIGHT[1]).toBeLessThan(0);
  });

  it('defaults facet contrast to the sketch value Crawford judged (20)', () => {
    expect(GEM_FACET_CONTRAST).toBe(20);
  });
});

describe('facetShade', () => {
  it('lights top and left facets, shades bottom and right ones', () => {
    expect(facetShade([0, -1])).toBeGreaterThan(0);
    expect(facetShade([-1, 0])).toBeGreaterThan(0);
    expect(facetShade([0, 1])).toBeLessThan(0);
    expect(facetShade([1, 0])).toBeLessThan(0);
  });

  it('is 1 facing the light, -1 facing away, within [-1, 1] all the way round', () => {
    expect(facetShade(GEM_LIGHT)).toBeCloseTo(1, 12);
    expect(facetShade([-GEM_LIGHT[0], -GEM_LIGHT[1]])).toBeCloseTo(-1, 12);
    for (let deg = 0; deg < 360; deg += 15) {
      const r = (deg * Math.PI) / 180;
      const s = facetShade([Math.cos(r), Math.sin(r)]);
      expect(s).toBeGreaterThanOrEqual(-1 - 1e-12);
      expect(s).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('facetTone', () => {
  const base = { h: 170, s: 45, l: 47 };

  it('shifts only lightness, by shade × contrast', () => {
    expect(facetTone(base, 0.5, 20)).toEqual({ h: 170, s: 45, l: 57 });
    expect(facetTone(base, -1, 20)).toEqual({ h: 170, s: 45, l: 27 });
  });

  it('returns the base unchanged at contrast 0 or shade 0', () => {
    expect(facetTone(base, 0.8, 0)).toEqual(base);
    expect(facetTone(base, 0, 20)).toEqual(base);
  });

  it('is monotonic in shade', () => {
    let prev = -Infinity;
    for (let s = -1; s <= 1; s += 0.05) {
      const l = facetTone(base, s, 20).l;
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });

  it('clamps lightness to 0..100 (beige at full light, near-black backing at full shade)', () => {
    expect(facetTone({ h: 55, s: 70, l: 90 }, 1, 20).l).toBe(100);
    expect(facetTone({ h: 210, s: 10, l: 6 }, -1, 20).l).toBe(0);
  });
});

describe('quantizeShade — fewer facet tones, so merged facet paths collapse (Task 9b)', () => {
  it('snaps to k evenly spaced levels including both extremes', () => {
    expect([-1, -0.4, -0.2, 0.2, 0.4, 1].map((s) => quantizeShade(s, 3))).toEqual([-1, 0, 0, 0, 0, 1]);
    expect(quantizeShade(0.6, 3)).toBe(1);
    expect(quantizeShade(-0.6, 3)).toBe(-1);
    expect([-1, -0.5, 0.2, 0.5, 1].map((s) => quantizeShade(s, 4))).toEqual([-1, -1 / 3, 1 / 3, 1 / 3, 1]);
  });

  it('never yields more than k distinct values over the whole shade range', () => {
    for (const k of [2, 3, 4, 5]) {
      const seen = new Set<number>();
      for (let s = -1; s <= 1.0001; s += 0.01) seen.add(quantizeShade(Math.min(1, s), k));
      expect(seen.size).toBe(k);
    }
  });

  it('is monotonic, and the identity for tones = 0 (off) — today\'s look', () => {
    let prev = -Infinity;
    for (let s = -1; s <= 1; s += 0.05) {
      expect(quantizeShade(s, 3)).toBeGreaterThanOrEqual(prev);
      prev = quantizeShade(s, 3);
      expect(quantizeShade(s, 0)).toBe(s);
    }
  });

  it('ships at 3 tones (Crawford, 2026-10-05: +6 % busy / +34 % paint over main, accepted)', () => {
    expect(GEM_FACET_TONES).toBe(3);
  });
});

describe('partFacetShades', () => {
  it('gives one shade per outline edge, from that edge\'s outward normal', () => {
    const square: GemPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const shades = partFacetShades(square);
    expect(shades).toHaveLength(4);
    // clockwise from top-left: top, right, bottom, left
    expect(shades[0]).toBeGreaterThan(0);
    expect(shades[1]).toBeLessThan(0);
    expect(shades[2]).toBeLessThan(0);
    expect(shades[3]).toBeGreaterThan(0);
    expect(shades[0]).toBeCloseTo(-GEM_LIGHT[1], 12);
  });

  it('is winding-independent: a reversed outline shades the same physical edges the same way', () => {
    const cw: GemPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const ccw: GemPoint[] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    // ccw edge 0 is the left edge, edge 3 the top edge
    expect(partFacetShades(ccw)[0]).toBeCloseTo(partFacetShades(cw)[3], 12);
    expect(partFacetShades(ccw)[3]).toBeCloseTo(partFacetShades(cw)[0], 12);
  });
});

describe('bevel depth is re-exported from polygon.ts, not redefined (one source of truth)', () => {
  it('is the same binding', () => {
    expect(bevelDepth).toBe(polygon.bevelDepth);
    expect(GEM_BEVEL_DEPTH).toBe(polygon.GEM_BEVEL_DEPTH);
  });
});
