// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  gemPalette,
  GEM_BACKING,
  GEM_BACKING_STROKE,
  GEM_MID_DARK,
  GEM_LIGHT_COLOR,
  type GemPalette,
  type GemPartPaint,
} from './gemPalette';
import { getRobotGem, type GemPart } from './polygon';
import { partFacetShades } from './gemShading';
// layerLitLevel stays beside calculateLampIntensity (audio → number helpers), per spec §1.7; a
// home in gemPalette.ts would cycle with robotVisualHelpers' LAMP_MIN.
import {
  LAMP_MIN,
  layerLitLevel,
  MID_DARK_LEVEL,
  MID_LIT_MIN,
  MID_GAIN_MAX,
} from '../robotVisualHelpers';
import { hexToHsl } from '../../../utils/colorUtils';

// ========================================
// HELPERS
// ========================================
function hsl(css: string): { h: number; s: number; l: number } {
  const m = /^hsl\((-?[\d.]+), ([\d.]+)%, ([\d.]+)%\)$/.exec(css);
  if (!m) throw new Error(`not an hsl() string: ${css}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function rounded(hex: string) {
  const { h, s, l } = hexToHsl(hex);
  return { h: Math.round(h), s: Math.round(s), l: Math.round(l) };
}

function bevelledParts(p: GemPalette): GemPartPaint[] {
  return [...p.orbiters, p.midLeft, p.midRight, p.top];
}

const TEAL = '#41ad9f';
const gem = getRobotGem(20261004);
const parts: GemPart[] = [...gem.orbiters, gem.midLeft, gem.midRight, gem.top];
const lit = gemPalette(gem, TEAL, 1, [1, 1], 20);

// ========================================
// layerLitLevel (robotVisualHelpers.ts; Phase 38's socket curve, renamed in place)
// ========================================
describe('layerLitLevel — a Mid\'s lit level from its layer gain', () => {
  it('keeps the socket constants: dark 0.15, lit floor = LAMP_MIN, full at the seeded max gain 1.2', () => {
    expect(MID_DARK_LEVEL).toBe(0.15);
    expect(MID_LIT_MIN).toBe(LAMP_MIN);
    expect(MID_GAIN_MAX).toBe(1.2);
  });

  it('is dark for gain 0 and for a missing layer', () => {
    expect(layerLitLevel(0)).toBe(MID_DARK_LEVEL);
    expect(layerLitLevel(undefined)).toBe(MID_DARK_LEVEL);
  });

  it('is fully lit at 1.2 and clamps above it', () => {
    expect(layerLitLevel(1.2)).toBe(1);
    expect(layerLitLevel(2)).toBe(1);
  });

  it('interpolates MID_LIT_MIN..1 for a partial gain', () => {
    expect(layerLitLevel(0.2)).toBeCloseTo(0.4 + 0.6 * (0.2 / 1.2), 12);
  });

  it('is monotonic non-decreasing across the gain range', () => {
    let prev = layerLitLevel(0.01);
    for (let g = 0.02; g <= 1.201; g += 0.01) {
      expect(layerLitLevel(g)).toBeGreaterThanOrEqual(prev);
      prev = layerLitLevel(g);
    }
  });
});

// ========================================
// gemPalette
// ========================================
describe('gemPalette — every colour RobotGem draws, as strings', () => {
  it('top and orbiter faces are the identity colour exactly (at daylight 1)', () => {
    expect(hsl(lit.top.face)).toEqual(rounded(TEAL));
    lit.orbiters.forEach((o) => expect(o.face).toBe(lit.top.face));
  });

  it('gives each bevelled part one facet fill per outline edge, toned by that edge\'s light (tones = 0, unquantized)', () => {
    bevelledParts(gemPalette(gem, TEAL, 1, [1, 1], 20, 0)).forEach((paint, i) => {
      const shades = partFacetShades(parts[i].pts);
      expect(paint.facets).toHaveLength(parts[i].pts.length);
      const face = hsl(paint.face).l;
      paint.facets.forEach((f, k) => {
        // face and facet are each rounded to an integer, so they may differ by up to 1
        expect(Math.abs(hsl(f).l - Math.min(100, Math.max(0, face + shades[k] * 20)))).toBeLessThanOrEqual(1);
      });
    });
  });

  it('facet stroke is the fully-shaded tone; the line is darker than its face', () => {
    bevelledParts(lit).forEach((paint) => {
      expect(hsl(paint.stroke).l).toBeLessThanOrEqual(Math.min(...paint.facets.map((f) => hsl(f).l)));
      expect(hsl(paint.line).l).toBeLessThan(hsl(paint.face).l);
    });
  });

  it('tones = 3 gives each part at most 3 distinct facet fills, including the full lit and shaded extremes', () => {
    const q = gemPalette(gem, TEAL, 1, [1, 1], 20, 3);
    bevelledParts(q).forEach((paint, i) => {
      expect(new Set(paint.facets).size).toBeLessThanOrEqual(3);
      const ls = paint.facets.map((f) => hsl(f).l);
      const face = hsl(paint.face).l;
      const shades = partFacetShades(parts[i].pts);
      // a facet squarely facing the light keeps the full +20; one facing away the full -20
      shades.forEach((s, k) => {
        if (s > 2 / 3) expect(ls[k]).toBe(Math.min(100, face + 20));
        if (s < -2 / 3) expect(ls[k]).toBe(Math.max(0, face - 20));
      });
    });
  });

  it('tones defaults to GEM_FACET_TONES — the shipped palette is 3-tone', () => {
    expect(gemPalette(gem, TEAL, 1, [1, 1], 20)).toEqual(gemPalette(gem, TEAL, 1, [1, 1], 20, 3));
    expect(gemPalette(gem, TEAL, 1, [1, 1], 20)).not.toEqual(gemPalette(gem, TEAL, 1, [1, 1], 20, 0));
  });

  it('contrast 0 flattens every facet to its face', () => {
    const flat = gemPalette(gem, TEAL, 1, [1, 1], 0);
    bevelledParts(flat).forEach((paint) => paint.facets.forEach((f) => expect(f).toBe(paint.face)));
  });

  it('a fully lit Mid is the identity tone darkened 16 and desaturated 18', () => {
    const t = rounded(TEAL);
    const want = { h: t.h, s: Math.round(hexToHsl(TEAL).s - 18), l: Math.round(hexToHsl(TEAL).l - 16) };
    expect(hsl(lit.midLeft.face)).toEqual(want);
    expect(hsl(lit.midRight.face)).toEqual(want);
  });

  it('a dark Mid (t = 0) has GEM_MID_DARK\'s saturation and lightness; t = 0.5 sits between', () => {
    const dark = gemPalette(gem, TEAL, 1, [0, 0], 20);
    const d = hexToHsl(GEM_MID_DARK);
    expect(hsl(dark.midLeft.face).s).toBe(Math.round(d.s));
    expect(hsl(dark.midLeft.face).l).toBe(Math.round(d.l));
    const half = hsl(gemPalette(gem, TEAL, 1, [0.5, 0.5], 20).midLeft.face).l;
    expect(half).toBeGreaterThan(Math.round(d.l));
    expect(half).toBeLessThan(hsl(lit.midLeft.face).l);
  });

  it('lights each Mid from its own level only', () => {
    const p = gemPalette(gem, TEAL, 1, [0.15, 1], 20);
    expect(p.midRight.face).toBe(lit.midRight.face);
    expect(p.midLeft.face).not.toBe(lit.midLeft.face);
  });

  it('daylight multiplies every lightness (backing, faces, facets, lines, strokes); hue and saturation untouched', () => {
    const dusk = gemPalette(gem, TEAL, 0.5, [1, 1], 20);
    const pairs: Array<[string, string]> = [
      [lit.backing.face, dusk.backing.face],
      [lit.backing.stroke, dusk.backing.stroke],
      ...bevelledParts(lit).flatMap((paint, i): Array<[string, string]> => {
        const d = bevelledParts(dusk)[i];
        return [[paint.face, d.face], [paint.line, d.line], [paint.stroke, d.stroke], ...paint.facets.map((f, k): [string, string] => [f, d.facets[k]])];
      }),
    ];
    pairs.forEach(([day, night]) => {
      expect(Math.abs(hsl(night).l - hsl(day).l / 2)).toBeLessThanOrEqual(1);
      expect(hsl(night).h).toBe(hsl(day).h);
      expect(hsl(night).s).toBe(hsl(day).s);
    });
  });

  it('the backing is the near-black GEM_BACKING with its stroke; the light colour ignores daylight', () => {
    expect(hsl(lit.backing.face)).toEqual(rounded(GEM_BACKING));
    expect(hsl(lit.backing.stroke)).toEqual(rounded(GEM_BACKING_STROKE));
    expect(lit.light).toBe(GEM_LIGHT_COLOR);
    expect(gemPalette(gem, TEAL, 0, [1, 1], 20).light).toBe(GEM_LIGHT_COLOR);
  });

  it('different identity colours change top/orbiter hue, nothing else structural', () => {
    const orange = gemPalette(gem, '#da7e1b', 1, [1, 1], 20);
    expect(hsl(orange.top.face).h).toBe(rounded('#da7e1b').h);
    expect(orange.backing).toEqual(lit.backing);
  });
});
