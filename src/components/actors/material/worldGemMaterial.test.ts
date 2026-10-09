import { describe, it, expect } from 'vitest';

import { getLighting } from '../../../utils/lightingUtils';
import { gemOutlineStroke } from '../scenery/gemShape';
import {
  HAIRLINE_PX,
  LIGHT_LATERAL_SPAN,
  RING_FACET_STROKE_PX,
  RING_MIN_PX,
  ROOF_BOX_BEVEL_FACTOR,
  WORLD_BEVEL_PX,
  WORLD_GEM,
  hairline,
  worldBevel,
  worldLightVector,
} from './worldGemMaterial';

/** Sideways component of the light before normalisation (x / -y of the unit vector), i.e. the
 *  hour's east/west gap in units of LIGHT_LATERAL_SPAN. */
function lateral(v: [number, number]): number {
  return v[0] / -v[1];
}

describe('constants (docs/specs/WORLD_GEM_MATERIAL.md §1.8)', () => {
  it('carry the sketch values', () => {
    expect(WORLD_BEVEL_PX).toBe(8);
    expect(ROOF_BOX_BEVEL_FACTOR).toBe(0.6);
    expect(RING_MIN_PX).toBe(1);
    expect(RING_FACET_STROKE_PX).toBe(0.6);
    expect(HAIRLINE_PX).toBe(1.5);
    expect(LIGHT_LATERAL_SPAN).toBe(0.7);
  });
});

describe('WORLD_GEM — the A/B switches', () => {
  it('has exactly the six pieces, every one on', () => {
    expect(WORLD_GEM).toEqual({
      factories: true,
      massScenery: true,
      roofBoxes: true,
      terrain: true,
      members: true,
      others: true,
    });
  });
});

describe('worldLightVector', () => {
  const PAIRS: Array<[number, number]> = [
    [1.05, 0.346],
    [0.346, 1.05],
    [0.9, 0.9],
    [0.15, 0.15],
    [1.05, 0.15],
    [0.15, 1.05],
    [5, 0],
    [0, 5],
  ];

  it('is a unit vector for every east/west pair, including extreme gaps', () => {
    for (const [e, w] of PAIRS) {
      const [x, y] = worldLightVector(e, w);
      expect(Math.hypot(x, y)).toBeCloseTo(1, 12);
    }
  });

  it('is straight up, [0, -1], when east and west are equally lit', () => {
    expect(worldLightVector(0.9, 0.9)).toEqual([0, -1]);
    expect(worldLightVector(0.15, 0.15)).toEqual([0, -1]);
  });

  it('leans east (x > 0) when the east face is brighter and west (x < 0) when the west is', () => {
    expect(worldLightVector(1.05, 0.346)[0]).toBeGreaterThan(0);
    expect(worldLightVector(0.346, 1.05)[0]).toBeLessThan(0);
  });

  it('swapping east and west mirrors the vector: x negates, y is unchanged', () => {
    const a = worldLightVector(1.05, 0.346);
    const b = worldLightVector(0.346, 1.05);
    expect(b[0]).toBeCloseTo(-a[0], 12);
    expect(b[1]).toBeCloseTo(a[1], 12);
  });

  it('always comes from above (y < 0), however lopsided the hour', () => {
    for (const [e, w] of PAIRS) {
      expect(worldLightVector(e, w)[1]).toBeLessThan(0);
    }
  });

  it('is a function of the east/west gap alone, not of their level', () => {
    const a = worldLightVector(1.0, 0.5);
    const b = worldLightVector(0.6, 0.1);
    expect(b[0]).toBeCloseTo(a[0], 12);
    expect(b[1]).toBeCloseTo(a[1], 12);
  });

  it('x grows monotonically with the east-minus-west gap', () => {
    const xs = [0, 0.1, 0.3, 0.5, 0.7, 1].map((gap) => worldLightVector(0.5 + gap, 0.5)[0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  describe('LIGHT_LATERAL_SPAN is pinned to the lighting curve', () => {
    const measures = Array.from({ length: 96 }, (_, m) => m);
    const laterals = measures.map((m) => {
      const { eastL, westL } = getLighting(m);
      return lateral(worldLightVector(eastL, westL));
    });

    // The vector is normalised, so |x| < 1 whatever the span and cannot pin it; the unnormalised
    // sideways component (x / -y) can. On the real curve it peaks at ~1.093 (measures 31-32 and
    // 64-65, about 8 am / 4 pm) and is 1.006 at 9 am (the spec's quoted gap of 0.704 / 0.7).
    it('the unnormalised sideways component never exceeds 1.1 over a whole day', () => {
      // A span that is too small (0.5) lifts the peak to ~1.53 and fails here.
      for (const l of laterals) expect(Math.abs(l)).toBeLessThanOrEqual(1.1);
    });

    it('and reaches at least 1.0 at its widest, so the span is not too generous either', () => {
      // A span that is too large (0.8) drops the peak to ~0.96 and fails here.
      expect(Math.max(...laterals.map(Math.abs))).toBeGreaterThanOrEqual(1.0);
    });

    it('is 1.006 at 9 am, the gap the spec quotes (eastL 1.05, westL 0.346)', () => {
      expect(lateral(worldLightVector(1.05, 0.346))).toBeCloseTo(1.006, 2);
      expect(laterals[36]).toBeCloseTo(1.006, 2);
    });

    it('is east-leaning in the morning, west-leaning in the afternoon, and level at noon', () => {
      const at = (m: number) => {
        const { eastL, westL } = getLighting(m);
        return worldLightVector(eastL, westL)[0];
      };
      expect(at(36)).toBeGreaterThan(0);
      expect(at(60)).toBeLessThan(0);
      expect(Math.abs(at(48))).toBeLessThan(1e-9);
    });
  });
});

describe('worldBevel', () => {
  it('is the world depth, 8 px, on a big item at scale 1', () => {
    expect(worldBevel(200, 300)).toBe(8);
  });

  it('scales with the item scale', () => {
    expect(worldBevel(200, 300, 1.1)).toBeCloseTo(8.8, 9);
    expect(worldBevel(200, 300, 0.9)).toBeCloseTo(7.2, 9);
  });

  it('is capped at 18% of the short side on a small item', () => {
    expect(worldBevel(30, 300)).toBeCloseTo(5.4, 9);
    expect(worldBevel(300, 30)).toBeCloseTo(5.4, 9);
  });

  it('is 0 when the capped depth would be under the 1 px floor', () => {
    expect(worldBevel(5, 300)).toBe(0);
  });

  it('keeps a depth of exactly the floor and drops one just under it', () => {
    expect(worldBevel(100, 100, 1, 1)).toBe(1);
    expect(worldBevel(100, 100, 1, 0.99)).toBe(0);
  });

  it('floors on the capped depth, not the requested one', () => {
    // requested 8 is far above the floor, but 18% of 5.5 is 0.99
    expect(worldBevel(5.5, 300)).toBe(0);
    expect(worldBevel(5.6, 300)).toBeCloseTo(1.008, 9);
  });

  it('is 0 for a depth of 0, a scale of 0 or a negative scale', () => {
    expect(worldBevel(200, 300, 1, 0)).toBe(0);
    expect(worldBevel(200, 300, 0)).toBe(0);
    expect(worldBevel(200, 300, -1)).toBe(0);
  });

  it('is 0 for a degenerate item with a zero side', () => {
    expect(worldBevel(0, 300)).toBe(0);
    expect(worldBevel(200, 0)).toBe(0);
  });

  it('takes a roof-box depth: 0.6 × 8 on a 60 × 40 box is 4.8, under its 7.2 cap', () => {
    expect(worldBevel(60, 40, 1, WORLD_BEVEL_PX * ROOF_BOX_BEVEL_FACTOR)).toBeCloseTo(4.8, 9);
  });

  it('a roof box under 6 px tall grows no ring (the floor bites the 0.6× depth first)', () => {
    expect(worldBevel(40, 5, 1, WORLD_BEVEL_PX * ROOF_BOX_BEVEL_FACTOR)).toBe(0);
    expect(worldBevel(40, 6, 1, WORLD_BEVEL_PX * ROOF_BOX_BEVEL_FACTOR)).toBeCloseTo(1.08, 9);
  });
});

describe('hairline', () => {
  it('is the scenery gem outline colour at 1.5 px', () => {
    expect(hairline()).toEqual({ stroke: gemOutlineStroke(), strokeWidth: 1.5 });
  });

  it('scales its weight with the item scale but never its colour', () => {
    expect(hairline(0.5)).toEqual({ stroke: gemOutlineStroke(), strokeWidth: 0.75 });
    expect(hairline(2)?.strokeWidth).toBe(3);
    expect(hairline(2)?.stroke).toBe(hairline(0.5)?.stroke);
  });

  it('is undefined when the weight is 0 or negative, so a spread adds nothing', () => {
    expect(hairline(0)).toBeUndefined();
    expect(hairline(-1)).toBeUndefined();
  });

  it('spreads cleanly: undefined contributes no attributes', () => {
    expect({ fill: 'red', ...hairline(0) }).toEqual({ fill: 'red' });
    expect({ fill: 'red', ...hairline() }).toEqual({ fill: 'red', stroke: gemOutlineStroke(), strokeWidth: 1.5 });
  });
});
