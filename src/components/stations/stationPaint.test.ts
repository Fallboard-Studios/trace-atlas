import { describe, it, expect } from 'vitest';

import { STATION_LAYER_KEYS, stationPaint, stationShapeCount, type StationPaint, type StationShape } from './stationPaint';
import { STATION_REFERENCE_DIALS, getStationRoll, stationGeometry, type StationGeometry } from './stationGem';
import { GEM_BACKING, GEM_LIGHT_COLOR, GEM_MID_DARK, gemPalette } from '../robot/gem/gemPalette';
import { GEM_FACET_CONTRAST } from '../robot/gem/gemShading';
import { getRobotGem } from '../robot/gem/polygon';
import { ACCENT_COLORS } from '@/constants/accentColors';
import { STATION_SHAPE_BUDGET } from '@/constants';
import { hexToHsl } from '@/utils/colorUtils';

// ========================================
// HELPERS
// ========================================
const SEEDS = Array.from({ length: 40 }, (_, i) => 31 + i * 104729);
const ROSTER = [ACCENT_COLORS.red, ACCENT_COLORS.teal, ACCENT_COLORS.lime, ACCENT_COLORS.indigo, ACCENT_COLORS.beige, ACCENT_COLORS.orange];

const geometryOf = (seed: number): StationGeometry => stationGeometry(getStationRoll(seed), STATION_REFERENCE_DIALS);
const paintOf = (seed: number, lit: readonly string[]): StationPaint => stationPaint(geometryOf(seed), getStationRoll(seed).accent, lit);

const allShapes = (p: StationPaint): StationShape[] => [...p.l4, ...p.l3, ...p.l2, ...p.l1];
const byRole = (shapes: StationShape[], role: StationShape['role']) => shapes.filter((s) => s.role === role);
/** The robot's own fully lit Mid face — the colour a stored robot's slot must match. */
const robotLitMid = (hex: string) => gemPalette(getRobotGem(1), hex, 1, [1, 1], GEM_FACET_CONTRAST).midLeft.face;
/** Lightness of an `hsl(h, s%, l%)` string. */
const lightness = (css: string) => Number(/,\s*([\d.]+)%\)$/.exec(css)![1]);

// ========================================
// TESTS
// ========================================
describe('stationPaint — Task 0a design, shaded by overlay (Crawford, 2026-10-07)', () => {
  it('the layer keys are back to front in the agreed interleave', () => {
    expect(STATION_LAYER_KEYS).toEqual(['l4', 'l3', 'l2', 'l1']);
  });

  it('L4 is one solid backing piece', () => {
    for (const s of SEEDS) {
      const { l4 } = paintOf(s, []);
      expect(l4).toHaveLength(1);
      expect(l4[0]).toMatchObject({ role: 'base', fill: GEM_BACKING });
    }
  });

  it('unlit pieces are one flat base path per layer: MID_DARK on L2–L3, the station accent on L1', () => {
    for (const s of SEEDS) {
      const p = paintOf(s, []);
      const accent = getStationRoll(s).accent;
      expect(byRole(p.l3, 'base').map((b) => b.fill)).toEqual([GEM_MID_DARK]);
      expect(byRole(p.l2, 'base').map((b) => b.fill)).toEqual([GEM_MID_DARK]);
      expect(byRole(p.l1, 'base').map((b) => b.fill)).toEqual([accent]);
      // One subpath per piece, all three pieces in the base when nothing is lit.
      for (const layer of [p.l3, p.l2, p.l1]) expect(byRole(layer, 'base')[0].d.match(/M/g)).toHaveLength(3);
    }
  });

  it("a lit slot is its own path in the stored robot's fully lit Mid colour, and leaves the base path", () => {
    const p = paintOf(SEEDS[0], ROSTER.slice(0, 1));
    const lit = byRole(p.l3, 'slot');
    expect(lit).toHaveLength(1);
    expect(lit[0].fill).toBe(robotLitMid(ROSTER[0]));
    expect(byRole(p.l3, 'base')[0].d.match(/M/g)).toHaveLength(2);
  });

  it('slots fill back to front: L3 first, then L2, then L1, each in its robot’s colour, in order', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const g = geometryOf(s);
      for (let n = 0; n <= 6; n++) {
        const p = stationPaint(g, getStationRoll(s).accent, ROSTER.slice(0, n));
        const lit = (layer: StationShape[]) => byRole(layer, 'slot').map((x) => x.slot);
        expect([...lit(p.l3), ...lit(p.l2), ...lit(p.l1)].sort()).toEqual([0, 1, 2, 3, 4, 5].slice(0, n));
        for (const shape of allShapes(p).filter((x) => x.role === 'slot')) expect(shape.fill).toBe(robotLitMid(ROSTER[shape.slot!]));
        // The slot path is that piece's own outline.
        for (const [i, layer] of [p.l1, p.l2, p.l3].entries()) {
          for (const shape of byRole(layer, 'slot')) {
            const piece = g.layers[i].pieces.find((x) => x.slot === shape.slot)!;
            expect(shape.d.startsWith(`M${Number(piece.pts[0][0].toFixed(2))},${Number(piece.pts[0][1].toFixed(2))}L`)).toBe(true);
          }
        }
      }
    }
  });

  it('more than six charging robots never light more than the six slots, nor push the port and halo past full', () => {
    const over = paintOf(SEEDS[1], [...ROSTER, ACCENT_COLORS.pink, ACCENT_COLORS.green]);
    const full = paintOf(SEEDS[1], ROSTER);
    expect(allShapes(over).filter((x) => x.role === 'slot')).toHaveLength(6);
    expect(over.haloOpacity).toBe(full.haloOpacity);
    expect(byRole(over.l1, 'port')[0].fill).toBe(byRole(full.l1, 'port')[0].fill);
  });

  it('facet shading is two overlay paths per broken layer — light on the lit-facing facets, dark on the far ones', () => {
    for (const s of SEEDS) {
      const p = paintOf(s, ROSTER.slice(0, 3));
      for (const layer of [p.l3, p.l2, p.l1]) {
        const light = byRole(layer, 'facetLight');
        const dark = byRole(layer, 'facetDark');
        expect(light).toHaveLength(1);
        expect(dark).toHaveLength(1);
        expect(light[0].fill).toBe('#ffffff');
        expect(dark[0].fill).toBe('#000000');
        expect(light[0].fillOpacity).toBeGreaterThan(0);
        expect(dark[0].fillOpacity).toBeGreaterThan(0);
      }
    }
  });

  it('every piece’s bevel ring is split across light, dark and none by the robots’ 3-tone quantised light', () => {
    // Facet quads: a piece of n edges contributes each facet to light, dark or neither, never both.
    const g = geometryOf(SEEDS[2]);
    const p = stationPaint(g, getStationRoll(SEEDS[2]).accent, []);
    const facets = (layer: StationShape[], role: StationShape['role']) => (byRole(layer, role)[0]?.d.match(/M/g) ?? []).length;
    const edges = g.layers[2].pieces.reduce((n, x) => n + x.pts.length, 0);
    const shaded = facets(p.l3, 'facetLight') + facets(p.l3, 'facetDark');
    expect(shaded).toBeGreaterThan(0);
    expect(shaded).toBeLessThan(edges);
  });

  it('boundary lines are one dark stroke path per broken layer', () => {
    for (const s of SEEDS) {
      const p = paintOf(s, []);
      for (const layer of [p.l3, p.l2, p.l1]) {
        const lines = byRole(layer, 'lines');
        expect(lines.length).toBeLessThanOrEqual(1);
        for (const l of lines) expect(l).toMatchObject({ fill: 'none', stroke: '#000000' });
      }
    }
  });

  it('slot dots: one per slot, on for a stored robot and off otherwise, as at most two paths per layer', () => {
    for (let n = 0; n <= 6; n++) {
      const p = paintOf(SEEDS[3], ROSTER.slice(0, n));
      let on = 0;
      let off = 0;
      for (const layer of [p.l3, p.l2, p.l1]) {
        const dots = [...byRole(layer, 'dotsOn'), ...byRole(layer, 'dotsOff')];
        expect(dots.length).toBeGreaterThanOrEqual(1);
        expect(dots.length).toBeLessThanOrEqual(2);
        for (const d of byRole(layer, 'dotsOn')) on += d.d.match(/M/g)!.length;
        for (const d of byRole(layer, 'dotsOff')) off += d.d.match(/M/g)!.length;
        for (const d of dots) expect(d.fill).toBe(GEM_LIGHT_COLOR);
      }
      expect([on, off]).toEqual([n, 6 - n]);
      const anyOn = [p.l3, p.l2, p.l1].flatMap((l) => byRole(l, 'dotsOn'))[0];
      const anyOff = [p.l3, p.l2, p.l1].flatMap((l) => byRole(l, 'dotsOff'))[0];
      if (anyOn && anyOff) expect(anyOn.fillOpacity!).toBeGreaterThan(anyOff.fillOpacity!);
    }
  });

  it('the port gem on L1 brightens with occupancy', () => {
    const port = (n: number) => byRole(paintOf(SEEDS[4], ROSTER.slice(0, n)).l1, 'port');
    for (let n = 0; n <= 6; n++) expect(port(n)).toHaveLength(1);
    const ls = [0, 1, 2, 3, 4, 5, 6].map((n) => lightness(port(n)[0].fill!));
    for (let n = 1; n <= 6; n++) expect(ls[n]).toBeGreaterThan(ls[n - 1]);
    expect(hexToHsl(getStationRoll(SEEDS[4]).accent).h).toBeCloseTo(Number(/hsl\(([\d.]+)/.exec(port(6)[0].fill!)![1]), 0);
  });

  it('the static halo brightens with occupancy, from 0.12 to 0.42 at the gradient peak', () => {
    const halo = (n: number) => paintOf(SEEDS[5], ROSTER.slice(0, n)).haloOpacity;
    expect(halo(0) * 0.42).toBeCloseTo(0.12, 9);
    expect(halo(6) * 0.42).toBeCloseTo(0.42, 9);
    expect(halo(3)).toBeGreaterThan(halo(2));
  });

  it(`stays within STATION_SHAPE_BUDGET (${STATION_SHAPE_BUDGET}) at every occupancy, and the budget is the measured ceiling`, () => {
    let max = 0;
    for (const s of SEEDS) {
      for (let n = 0; n <= 6; n++) {
        const count = stationShapeCount(paintOf(s, ROSTER.slice(0, n)));
        expect(count, `${s} @${n}`).toBeLessThanOrEqual(STATION_SHAPE_BUDGET);
        max = Math.max(max, count);
      }
    }
    expect(max).toBe(STATION_SHAPE_BUDGET);
  });

  it('stationShapeCount counts every path plus the halo and the ripple circles', () => {
    const p = paintOf(SEEDS[6], ROSTER.slice(0, 2));
    expect(stationShapeCount(p)).toBe(allShapes(p).length + 2);
  });

  it('every shape has a key unique within its layer (React keys)', () => {
    const p = paintOf(SEEDS[7], ROSTER.slice(0, 4));
    for (const layer of [p.l4, p.l3, p.l2, p.l1]) expect(new Set(layer.map((x) => x.key)).size).toBe(layer.length);
  });
});
