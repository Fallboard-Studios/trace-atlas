/**
 * The terrain's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.7, plan Task 18): the ridge and
 * the ground each get a ring along their stepped top, so every 45 degree step and flat run takes the
 * sun like a facet. The frame (the scene's left, right and bottom edges) carries none. The drawn
 * polygon and its `points` string are unchanged; the ring is built on an extended, simplified
 * outline (terrainRingOutline.ts) because the polygon as drawn cannot hold an 8 px bevel.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { TerrainLayer } from './TerrainLayer';
import { getTerrainProfile, __clearTerrainProfileCache, type Step } from '@/systems/terrainProfile';
import { getLocaleNoiseMap, evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { applyColorShift } from '@/utils/colorUtils';
import colorTheme from '@/constants/colorTheme.json';
import type { Locale } from '@/types/locale';
import { facetOn, facetsOfRing, ringsIn, withSwitch, type Pt, type RingFacet } from '@/components/actors/material/ringTestHelpers';

const W = 1920;
const H = 1080;
const NO_SHIFT = { hueShift: 0, satShift: 0 };

const localeOf = (i: number): Locale => ({ ...DEFAULT_LOCALE, id: `terrain-ring-${i}`, coordinates: { x: ((i * 13) % 211) - 100, y: ((i * 7) % 61) - 30 } });
const ids = (n: number) => Array.from({ length: n }, (_, i) => localeOf(i));

function install(locales: Locale[]) {
  __clearTerrainProfileCache();
  for (const l of locales) evictLocaleNoiseMap(l.id);
  useLocaleStore.setState({ locales: Object.fromEntries(locales.map((l) => [l.id, l])) });
}

const setHour = (h: number | null) => act(() => useUIStore.getState().setActiveLocaleLocalTime(h));
const stepsOf = (l: Locale, part: 'ridge' | 'ground'): Step[] =>
  getTerrainProfile(l.id, getLocaleNoiseMap(l.id, l.coordinates.x, l.coordinates.y))[part];
const draw = (l: Locale, part: 'ridge' | 'ground', w = W, h = H) =>
  render(<svg><TerrainLayer localeId={l.id} part={part} width={w} height={h} /></svg>).container;
const ringOf = (c: HTMLElement) => ringsIn(c)[0];

/** The profile's height at x, flat beyond its ends. */
function yAt(steps: Step[], x: number): number {
  if (x <= steps[0].x0) return steps[0].y0;
  const s = steps.find((st) => x >= st.x0 && x <= st.x1);
  if (!s) return steps[steps.length - 1].y1;
  return s.x1 === s.x0 ? s.y0 : s.y0 + ((s.y1 - s.y0) * (x - s.x0)) / (s.x1 - s.x0);
}

/** The ridge's and the ground's own fill multiplier and base colour (spec §1.3). */
function material(part: 'ridge' | 'ground', hour: number) {
  const { eastL, westL } = getLighting(((hour / 24) * DAY_CYCLE_MEASURES) % DAY_CYCLE_MEASURES);
  const m = (eastL + westL) / 2;
  return part === 'ridge'
    ? { base: colorTheme.shadowDepth, mult: 1 + m * 1.2 }
    : { base: colorTheme.body.shadow, mult: m * 0.9 };
}
const tone = (part: 'ridge' | 'ground', hour: number, facet: number) => {
  const { base, mult } = material(part, hour);
  return applyColorShift(base, NO_SHIFT, mult * facet);
};

const LOCALES = ids(8);
beforeEach(() => install(LOCALES));
afterEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
  cleanup();
});

describe('terrain ring: placement', () => {
  it.each(['ridge', 'ground'] as const)('%s: draws one ring, straight after its polygon', (part) => {
    setHour(9);
    const c = draw(LOCALES[0], part);
    expect(ringsIn(c)).toHaveLength(1);
    const polygon = c.querySelector(`polygon[data-terrain="${part}"]`)!;
    expect(polygon.nextElementSibling).toBe(ringOf(c));
  });

  it('leaves the polygon and its points string exactly as they were', () => {
    setHour(9);
    const l = LOCALES[0];
    for (const part of ['ridge', 'ground'] as const) {
      const steps = stepsOf(l, part);
      const expected = [`${steps[0].x0},${steps[0].y0}`, ...steps.map((s) => `${s.x1},${s.y1}`), `${W},${H}`, `0,${H}`].join(' ');
      expect(draw(l, part).querySelector(`polygon[data-terrain="${part}"]`)!.getAttribute('points')).toBe(expected);
    }
  });

  it('draws nothing for a locale the store does not have', () => {
    const c = render(<svg><TerrainLayer localeId="no-such-locale" part="ridge" width={W} height={H} /></svg>).container;
    expect(c.querySelectorAll('polygon, g')).toHaveLength(0);
  });

  it('with the terrain switch off there is no ring and the polygon is untouched', () => {
    setHour(9);
    withSwitch('terrain', false, () => {
      const c = draw(LOCALES[0], 'ridge');
      expect(ringsIn(c)).toHaveLength(0);
      expect(c.querySelectorAll('polygon[data-terrain="ridge"]')).toHaveLength(1);
    });
  });

  it('the other switches do not remove it', () => {
    setHour(9);
    withSwitch('massScenery', false, () => {
      withSwitch('members', false, () => {
        expect(ringsIn(draw(LOCALES[0], 'ground'))).toHaveLength(1);
      });
    });
  });

  it('carries no style attribute, so nothing can transition (roadmap 17.2.5)', () => {
    setHour(9);
    expect(ringOf(draw(LOCALES[0], 'ridge')).querySelectorAll('[style]')).toHaveLength(0);
  });
});

describe('terrain ring: geometry', () => {
  it.each(['ridge', 'ground'] as const)('%s: carries no facet on the frame (left, right or bottom edge of the scene)', (part) => {
    setHour(9);
    for (const l of LOCALES) {
      const facets = facetsOfRing(ringOf(draw(l, part)));
      expect(facets.length).toBeGreaterThan(0);
      for (const f of facets) {
        const [a, b] = f.pts;
        expect(a[0] <= 0 && b[0] <= 0, `${l.id} left`).toBe(false);
        expect(a[0] >= W && b[0] >= W, `${l.id} right`).toBe(false);
        expect(a[1] >= H && b[1] >= H, `${l.id} bottom`).toBe(false);
      }
    }
  });

  it.each(['ridge', 'ground'] as const)('%s: every facet\'s outer edge lies on the profile and is flat or exactly 45 degrees', (part) => {
    setHour(9);
    for (const l of LOCALES) {
      const steps = stepsOf(l, part);
      for (const f of facetsOfRing(ringOf(draw(l, part)))) {
        const [a, b] = f.pts;
        expect(Math.abs(a[1] - yAt(steps, a[0])), `${l.id} a ${a}`).toBeLessThan(0.02);
        expect(Math.abs(b[1] - yAt(steps, b[0])), `${l.id} b ${b}`).toBeLessThan(0.02);
        const dx = Math.abs(b[0] - a[0]);
        const dy = Math.abs(b[1] - a[1]);
        expect(dy < 0.02 || Math.abs(dx - dy) < 0.03, `${l.id} ${a} to ${b}`).toBe(true);
      }
    }
  });

  it('covers every part of the profile that is in the scene: the facets\' outer edges run end to end', () => {
    setHour(9);
    const l = LOCALES[1];
    const facets = facetsOfRing(ringOf(draw(l, 'ridge'))).slice().sort((p, q) => p.pts[0][0] - q.pts[0][0]);
    expect(facets[0].pts[0][0]).toBeLessThanOrEqual(0.011);
    expect(facets[facets.length - 1].pts[1][0]).toBeGreaterThanOrEqual(W - 0.011);
    for (let i = 1; i < facets.length; i++) expect(Math.abs(facets[i].pts[0][0] - facets[i - 1].pts[1][0])).toBeLessThan(0.02);
  });

  it('is 8 px deep: a flat run\'s inner edge is 8 px below it, and a 45 degree step\'s is 8 px from it', () => {
    setHour(9);
    for (const part of ['ridge', 'ground'] as const) {
      const facets = facetsOfRing(ringOf(draw(LOCALES[0], part)));
      const flats = facets.filter((f) => Math.abs(f.pts[1][1] - f.pts[0][1]) < 0.02);
      const diags = facets.filter((f) => Math.abs(f.pts[1][1] - f.pts[0][1]) >= 0.02);
      expect(flats.length).toBeGreaterThan(0);
      expect(diags.length).toBeGreaterThan(0);
      for (const f of flats) {
        expect(f.pts[3][1] - f.pts[0][1]).toBeCloseTo(8, 1);
        expect(f.pts[2][1] - f.pts[1][1]).toBeCloseTo(8, 1);
      }
      for (const f of diags) {
        const [a, b, ib] = f.pts;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dist = Math.abs((b[0] - a[0]) * (a[1] - ib[1]) - (a[0] - ib[0]) * (b[1] - a[1])) / len;
        expect(dist).toBeCloseTo(8, 1);
      }
    }
  });

  it('copes with a scene size that is not the world\'s: no NaN, no throw', () => {
    setHour(9);
    for (const [w, h] of [[800, 400], [1920, 1200], [100, 1080]]) {
      const c = draw(LOCALES[0], 'ground', w, h);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });

  it.each(['ridge', 'ground'] as const)('%s: over 200 sampled worlds, every ring is whole: facets, no NaN, none on the frame', (part) => {
    const many = ids(200);
    install(many);
    setHour(9);
    for (const l of many) {
      const c = draw(l, part);
      expect(c.innerHTML, l.id).not.toMatch(/NaN|undefined/);
      const facets = facetsOfRing(ringOf(c));
      // a ground can be one flat run (60 % of its steps are zero), which is one facet
      expect(facets.length, l.id).toBeGreaterThan(0);
      for (const f of facets) {
        expect(f.pts, l.id).toHaveLength(4);
        const [a, b, ib, ia] = f.pts;
        // an inverted facet would run its inner edge against its outer edge
        expect((b[0] - a[0]) * (ib[0] - ia[0]) + (b[1] - a[1]) * (ib[1] - ia[1]), `${l.id} ${f.pts}`).toBeGreaterThan(0);
        expect(a[0] <= 0 && b[0] <= 0).toBe(false);
        expect(a[1] >= H && b[1] >= H).toBe(false);
      }
    }
  });
});

describe('terrain ring: the sun', () => {
  /** Facets of the ring by what the surface does: flat, or running down or up to the right. */
  function byKind(facets: RingFacet[]) {
    const flat: RingFacet[] = [];
    const down: RingFacet[] = []; // y grows with x: the surface falls away to the right, its normal leans east
    const up: RingFacet[] = []; // y shrinks with x: the surface rises to the right, its normal leans west
    for (const f of facets) {
      const dy = f.pts[1][1] - f.pts[0][1];
      if (Math.abs(dy) < 0.02) flat.push(f);
      else if (dy > 0) down.push(f);
      else up.push(f);
    }
    return { flat, down, up };
  }

  it.each(['ridge', 'ground'] as const)('%s at 9 am: flat runs and east-facing steps are lit (1.25x), west-facing steps neutral (1.1x)', (part) => {
    setHour(9);
    let seenDown = 0;
    let seenUp = 0;
    for (const l of LOCALES) {
      const { flat, down, up } = byKind(facetsOfRing(ringOf(draw(l, part))));
      for (const f of flat) expect(f.fill).toBe(tone(part, 9, 1.25));
      for (const f of down) expect(f.fill).toBe(tone(part, 9, 1.25));
      for (const f of up) expect(f.fill).toBe(tone(part, 9, 1.1));
      seenDown += down.length;
      seenUp += up.length;
    }
    expect(seenDown).toBeGreaterThan(0);
    expect(seenUp).toBeGreaterThan(0);
  });

  it.each(['ridge', 'ground'] as const)('%s at 3 pm: the sun is in the west, so the west-facing steps are lit and the east-facing ones neutral', (part) => {
    setHour(15);
    for (const l of LOCALES) {
      const { flat, down, up } = byKind(facetsOfRing(ringOf(draw(l, part))));
      for (const f of flat) expect(f.fill).toBe(tone(part, 15, 1.25));
      for (const f of up) expect(f.fill).toBe(tone(part, 15, 1.25));
      for (const f of down) expect(f.fill).toBe(tone(part, 15, 1.1));
    }
  });

  it('shades nothing at noon but the faces that look away from the overhead sun: flat and both steps neutral or lit, never shaded', () => {
    setHour(12);
    for (const l of LOCALES) {
      for (const f of facetsOfRing(ringOf(draw(l, 'ridge')))) expect([tone('ridge', 12, 1.25), tone('ridge', 12, 1.1)]).toContain(f.fill);
    }
  });

  it('strokes every facet in the fully shaded tone of its own surface (0.5x)', () => {
    setHour(9);
    for (const f of facetsOfRing(ringOf(draw(LOCALES[0], 'ridge')))) expect(f.stroke).toBe(tone('ridge', 9, 0.5));
  });

  it('re-lights across the hour: the ring changes between 9 am and 10 pm', () => {
    setHour(9);
    const morning = facetsOfRing(ringOf(draw(LOCALES[0], 'ground'))).map((f) => f.fill);
    cleanup();
    setHour(22);
    const night = facetsOfRing(ringOf(draw(LOCALES[0], 'ground'))).map((f) => f.fill);
    expect(night).toHaveLength(morning.length);
    expect(night).not.toEqual(morning);
  });

  it('updates in place on the lighting tick, with the same path elements', () => {
    setHour(9);
    const c = draw(LOCALES[0], 'ridge');
    const before = Array.from(c.querySelectorAll('g[data-gem="ring"] path'));
    const fills = before.map((p) => p.getAttribute('fill'));
    setHour(22);
    const after = Array.from(c.querySelectorAll('g[data-gem="ring"] path'));
    expect(after.length).toBeGreaterThan(0);
    after.slice(0, Math.min(before.length, after.length)).forEach((p, i) => expect(p).toBe(before[i]));
    expect(after.map((p) => p.getAttribute('fill'))).not.toEqual(fills);
  });

  it('the ridge and the ground take their own materials: their rings are different colours', () => {
    setHour(9);
    const ridge = facetsOfRing(ringOf(draw(LOCALES[0], 'ridge')))[0].fill;
    const ground = facetsOfRing(ringOf(draw(LOCALES[0], 'ground')))[0].fill;
    expect(ridge).not.toBe(ground);
  });

  it('a flat run is one lit facet however the profile was cut: merged runs make no seam', () => {
    setHour(9);
    const facets = facetsOfRing(ringOf(draw(LOCALES[2], 'ridge')));
    const flats = facets.filter((f) => Math.abs(f.pts[1][1] - f.pts[0][1]) < 0.02);
    for (let i = 0; i < flats.length; i++) {
      for (let j = i + 1; j < flats.length; j++) {
        const touching = near(flats[i].pts[1], flats[j].pts[0]) || near(flats[j].pts[1], flats[i].pts[0]);
        expect(touching && Math.abs(flats[i].pts[0][1] - flats[j].pts[0][1]) < 0.02).toBe(false);
      }
    }
    expect(facetOn(facets, flats[0].pts[0] as Pt, flats[0].pts[1] as Pt)).toBeDefined();
  });
});

const near = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.02 && Math.abs(p[1] - q[1]) < 0.02;
