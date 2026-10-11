import { describe, it, expect } from 'vitest';

import { getLighting } from '../../../utils/lightingUtils';
import { bevelHolds, edgeNormals, inset, type GemPoint } from '../../robot/gem/polygon';
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
  ringFacets,
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

// ========================================
// ringFacets
// ========================================
describe('ringFacets', () => {
  const BODY = { h: 200, s: 50, l: 40 };
  /** The body's colour at lightness multiplier m, as the ring must write it. */
  const tone = (m: number) => `hsl(200, 50%, ${Math.round(40 * m)}%)`;
  const NINE_AM = worldLightVector(1.05, 0.346);
  const NOON = worldLightVector(0.9, 0.9);
  const FLAT = () => 1;

  const rect = (x: number, y: number, w: number, h: number): GemPoint[] => [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];

  interface Quad {
    fill: string;
    stroke: string;
    /** [outer a, outer b, inner of b, inner of a] */
    pts: GemPoint[];
  }

  /** Every facet quad in the result, with the (fill, stroke) of the path it was merged into. */
  function quads(facets: Array<{ fill: string; stroke: string; d: string }>): Quad[] {
    return facets.flatMap((f) =>
      f.d
        .split('M')
        .filter(Boolean)
        .map((sub) => ({
          fill: f.fill,
          stroke: f.stroke,
          pts: Array.from(sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)).map((m): GemPoint => [Number(m[1]), Number(m[2])]),
        })),
    );
  }

  const same = (p: GemPoint, q: GemPoint) => Math.abs(p[0] - q[0]) < 0.011 && Math.abs(p[1] - q[1]) < 0.011;
  /** The facet whose outer edge runs a to b. */
  const facetOn = (qs: Quad[], a: GemPoint, b: GemPoint) => qs.find((q) => same(q.pts[0], a) && same(q.pts[1], b));

  describe('on a rectangle', () => {
    const R = rect(0, 0, 100, 50);

    it('yields four facets, one per edge, each a quad with its edge as the outer side', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY));
      expect(qs).toHaveLength(4);
      for (const q of qs) expect(q.pts).toHaveLength(4);
      for (let i = 0; i < 4; i++) expect(facetOn(qs, R[i], R[(i + 1) % 4])).toBeDefined();
    });

    it('takes the inner side from the robots inset, a clean 8 px in', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY));
      const top = facetOn(qs, [0, 0], [100, 0])!;
      expect(top.pts[2]).toEqual([92, 8]);
      expect(top.pts[3]).toEqual([8, 8]);
    });

    it('at 9 am lights the top and east facets (1.25x) and shades the bottom and west (0.5x)', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY));
      expect(facetOn(qs, [0, 0], [100, 0])!.fill).toBe(tone(1.25));
      expect(facetOn(qs, [100, 0], [100, 50])!.fill).toBe(tone(1.25));
      expect(facetOn(qs, [100, 50], [0, 50])!.fill).toBe(tone(0.5));
      expect(facetOn(qs, [0, 50], [0, 0])!.fill).toBe(tone(0.5));
    });

    it('at noon the east and west facets are neutral (1.1x), the top lit and the bottom shaded', () => {
      const qs = quads(ringFacets(R, 8, NOON, FLAT, BODY));
      expect(facetOn(qs, [100, 0], [100, 50])!.fill).toBe(tone(1.1));
      expect(facetOn(qs, [0, 50], [0, 0])!.fill).toBe(tone(1.1));
      expect(facetOn(qs, [0, 0], [100, 0])!.fill).toBe(tone(1.25));
      expect(facetOn(qs, [100, 50], [0, 50])!.fill).toBe(tone(0.5));
    });

    it('at 3 pm the sun is in the west: the west facet is lit and the east shaded', () => {
      const qs = quads(ringFacets(R, 8, worldLightVector(0.346, 1.05), FLAT, BODY));
      expect(facetOn(qs, [0, 50], [0, 0])!.fill).toBe(tone(1.25));
      expect(facetOn(qs, [100, 0], [100, 50])!.fill).toBe(tone(0.5));
    });

    it('strokes every facet in the fully shaded tone of its own face (0.5x), whatever its fill', () => {
      for (const q of quads(ringFacets(R, 8, NINE_AM, FLAT, BODY))) expect(q.stroke).toBe(tone(0.5));
    });

    it('folds the face lightness (depth cap, derelict dimming) into every tone', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, () => 0.7, BODY));
      expect(facetOn(qs, [0, 0], [100, 0])!.fill).toBe(tone(0.7 * 1.25));
      expect(facetOn(qs, [0, 0], [100, 0])!.stroke).toBe(tone(0.7 * 0.5));
    });

    it('does not care which way the polygon winds', () => {
      const reversed = [...R].reverse();
      const a = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY));
      const b = quads(ringFacets(reversed, 8, NINE_AM, FLAT, BODY));
      expect(b).toHaveLength(4);
      // the same side of the rectangle takes the same tone, its edge walked the other way
      expect(facetOn(b, [100, 0], [0, 0])!.fill).toBe(facetOn(a, [0, 0], [100, 0])!.fill);
      expect(facetOn(b, [0, 0], [0, 50])!.fill).toBe(facetOn(a, [0, 50], [0, 0])!.fill);
    });

    it('merges equal (fill, stroke) facets: 9 am gives two paths, every facet in exactly one', () => {
      const facets = ringFacets(R, 8, NINE_AM, FLAT, BODY);
      expect(facets).toHaveLength(2);
      expect(quads(facets)).toHaveLength(4);
    });

    it('orders the merged paths by first appearance (the top facet comes first)', () => {
      const facets = ringFacets(R, 8, NINE_AM, FLAT, BODY);
      expect(facets[0].fill).toBe(tone(1.25));
      expect(facets[1].fill).toBe(tone(0.5));
    });

    it('returns plain {fill, stroke, d} records with a closed subpath per facet', () => {
      for (const f of ringFacets(R, 8, NINE_AM, FLAT, BODY)) {
        expect(Object.keys(f).sort()).toEqual(['d', 'fill', 'stroke']);
        expect(f.d).toMatch(/^M/);
        expect(f.d.match(/Z/g)).toHaveLength(f.d.match(/M/g)!.length);
        expect(f.d).not.toMatch(/NaN|undefined/);
      }
    });

    // A coordinate is canonical when it has at most two decimals, no trailing zero and is never "-0".
    const CANONICAL = /^-?(0|[1-9]\d*)(\.\d?[1-9])?$/;
    const numbersIn = (d: string) => d.match(/-?[\d.]+/g)!;

    it('writes coordinates to at most two decimals, even where a 45 degree miter lands on irrational ones', () => {
      const hex: GemPoint[] = [[0, 40], [0, 10], [10, 0], [90, 0], [100, 10], [100, 40]];
      const raw = inset(hex, 3).flat();
      expect(raw.some((v) => Math.abs(v * 100 - Math.round(v * 100)) > 1e-6)).toBe(true); // the fixture is irrational
      for (const f of ringFacets(hex, 3, NINE_AM, FLAT, BODY)) {
        for (const num of numbersIn(f.d)) expect(num).toMatch(CANONICAL);
      }
    });

    it('writes whole numbers bare and never a negative zero, even for a vertex a hair below 0', () => {
      for (const f of ringFacets(rect(-1e-12, 0, 100, 50), 8, NINE_AM, FLAT, BODY)) {
        for (const num of numbersIn(f.d)) {
          expect(num).not.toBe('-0');
          expect(num).toMatch(CANONICAL);
        }
      }
    });

    it('draws nothing at depth 0 or below', () => {
      expect(ringFacets(R, 0, NINE_AM, FLAT, BODY)).toEqual([]);
      expect(ringFacets(R, -3, NINE_AM, FLAT, BODY)).toEqual([]);
    });

    it('draws nothing for a polygon with fewer than three points', () => {
      expect(ringFacets([], 8, NINE_AM, FLAT, BODY)).toEqual([]);
      expect(ringFacets([[0, 0], [10, 0]], 8, NINE_AM, FLAT, BODY)).toEqual([]);
    });

    it('is pure: the input is not mutated and the same call gives the same answer', () => {
      const frozen = Object.freeze(R.map((p) => Object.freeze([...p]) as unknown as GemPoint));
      const a = ringFacets(frozen, 8, NINE_AM, FLAT, BODY, { splitX: 40 });
      const b = ringFacets(frozen, 8, NINE_AM, FLAT, BODY, { splitX: 40 });
      expect(a).toEqual(b);
      expect(frozen).toEqual(R);
    });
  });

  describe('splitX, the front-corner split of a two-faced body', () => {
    const R = rect(0, 0, 100, 50);

    it('splits the top and bottom edges: six facets', () => {
      expect(quads(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX: 40 }))).toHaveLength(6);
    });

    it('hands each half of a split edge to faceLightAt at its own midpoint', () => {
      const seen: number[] = [];
      ringFacets(R, 8, NINE_AM, (midX) => (seen.push(midX), 1), BODY, { splitX: 40 });
      expect(seen.sort((a, b) => a - b)).toEqual([0, 20, 20, 70, 70, 100]);
    });

    it('lets the two top halves take different fills when the face light is a step at the split', () => {
      const step = (midX: number) => (midX < 40 ? 0.5 : 1);
      const qs = quads(ringFacets(R, 8, NINE_AM, step, BODY, { splitX: 40 }));
      const west = facetOn(qs, [0, 0], [40, 0])!;
      const east = facetOn(qs, [40, 0], [100, 0])!;
      expect(west.fill).toBe(tone(0.5 * 1.25));
      expect(east.fill).toBe(tone(1 * 1.25));
      expect(west.fill).not.toBe(east.fill);
    });

    it('puts the inner vertex directly beneath the inserted one', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX: 40 }));
      const west = facetOn(qs, [0, 0], [40, 0])!;
      const east = facetOn(qs, [40, 0], [100, 0])!;
      expect(west.pts[2]).toEqual([40, 8]);
      expect(east.pts[3]).toEqual([40, 8]);
    });

    it('does the same on the bottom edge, whose inner vertex is above the split', () => {
      const qs = quads(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX: 40 }));
      const bottomEast = facetOn(qs, [100, 50], [40, 50])!;
      expect(bottomEast.pts[2]).toEqual([40, 42]);
    });

    it('inserts nothing when splitX is on an edge endpoint or outside the polygon', () => {
      for (const splitX of [0, 100, -5, 250]) {
        expect(quads(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX }))).toHaveLength(4);
      }
    });

    it('never splits a slanted edge, only horizontal ones', () => {
      const hex: GemPoint[] = [[0, 40], [0, 10], [10, 0], [90, 0], [100, 10], [100, 40]];
      // x = 5 crosses the 45 degree shoulder (0,10)-(10,0) and the bottom edge, but only the bottom splits
      expect(quads(ringFacets(hex, 3, NINE_AM, FLAT, BODY))).toHaveLength(6);
      expect(quads(ringFacets(hex, 3, NINE_AM, FLAT, BODY, { splitX: 5 }))).toHaveLength(7);
    });

    it('a split that changes no tone still keeps every facet: the halves merge, they are not dropped', () => {
      expect(quads(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX: 40 }))).toHaveLength(6);
      expect(ringFacets(R, 8, NINE_AM, FLAT, BODY, { splitX: 40 })).toHaveLength(2);
    });
  });

  describe('merging on the (fill, stroke) pair', () => {
    // 40% x 0.8 x 1.25 and 40% x (1.25 x 0.8 / 1.1) x 1.1 both write 40%; their strokes are 16% and 18%.
    const faceL = (midX: number) => (midX < 40 ? 0.8 : (1.25 * 0.8) / 1.1);

    it('keeps two facets apart when their fills round alike but their strokes do not', () => {
      const facets = ringFacets(rect(0, 0, 100, 50), 8, NOON, faceL, BODY, { splitX: 40 });
      const fill40 = facets.filter((f) => f.fill === 'hsl(200, 50%, 40%)');
      expect(fill40.map((f) => f.stroke).sort()).toEqual(['hsl(200, 50%, 16%)', 'hsl(200, 50%, 18%)']);
    });

    it('never emits two paths with the same (fill, stroke), and still holds all six facets', () => {
      const facets = ringFacets(rect(0, 0, 100, 50), 8, NOON, faceL, BODY, { splitX: 40 });
      const keys = facets.map((f) => `${f.fill}|${f.stroke}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(quads(facets)).toHaveLength(6);
    });
  });

  describe('skipEdge, for frame edges that must not carry a facet', () => {
    // A terrain-like closed profile: a stepped ridge over a frame of x = 0, x = 100 and y = 100.
    const TERRAIN: GemPoint[] = [[0, 100], [0, 60], [30, 60], [50, 40], [80, 40], [100, 20], [100, 100]];
    const onFrame = (a: GemPoint, b: GemPoint) =>
      (a[0] === 0 && b[0] === 0) || (a[0] === 100 && b[0] === 100) || (a[1] === 100 && b[1] === 100);

    it('the fixture is a valid bevel at this depth', () => {
      expect(bevelHolds(TERRAIN, 4)).toBe(true);
    });

    it('drops exactly the frame edges and nothing else', () => {
      const qs = quads(ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY, { skipEdge: onFrame }));
      expect(qs).toHaveLength(4);
      for (let i = 0; i < TERRAIN.length; i++) {
        const a = TERRAIN[i];
        const b = TERRAIN[(i + 1) % TERRAIN.length];
        expect(facetOn(qs, a, b) !== undefined).toBe(!onFrame(a, b));
      }
    });

    it('insets the whole outline, so a kept facet is the same with or without the skip', () => {
      const all = quads(ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY));
      const some = quads(ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY, { skipEdge: onFrame }));
      for (const q of some) expect(facetOn(all, q.pts[0], q.pts[1])!.pts).toEqual(q.pts);
    });

    it('with a skip that drops everything returns no facets', () => {
      expect(ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY, { skipEdge: () => true })).toEqual([]);
    });

    it('with a skip that drops nothing matches no skip at all', () => {
      expect(ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY, { skipEdge: () => false })).toEqual(
        ringFacets(TERRAIN, 4, NINE_AM, FLAT, BODY),
      );
    });

    it('sees the edges after the split, so half a split edge can be dropped alone', () => {
      const dropEastTop = (a: GemPoint, b: GemPoint) => a[1] === 0 && b[1] === 0 && a[0] >= 40 && b[0] >= 40;
      const qs = quads(ringFacets(rect(0, 0, 100, 50), 8, NINE_AM, FLAT, BODY, { splitX: 40, skipEdge: dropEastTop }));
      expect(qs).toHaveLength(5);
      expect(facetOn(qs, [40, 0], [100, 0])).toBeUndefined();
      expect(facetOn(qs, [0, 0], [40, 0])).toBeDefined();
    });
  });

  describe('the miter keeps every facet edge on the polygon grid', () => {
    /** Outer edge a to b and inner edge (inner of a to inner of b) point the same way, on parallel lines. */
    function expectParallel(q: Quad) {
      const [a, b, ib, ia] = q.pts;
      const ox = b[0] - a[0];
      const oy = b[1] - a[1];
      const ix = ib[0] - ia[0];
      const iy = ib[1] - ia[1];
      const scale = Math.hypot(ox, oy) * Math.hypot(ix, iy);
      expect(Math.abs(ox * iy - oy * ix) / scale).toBeLessThan(2e-3);
      expect(ox * ix + oy * iy).toBeGreaterThan(0);
    }

    const SHAPES: Array<[string, GemPoint[], number]> = [
      ['a rectangle', rect(0, 0, 100, 50), 8],
      ['a 45 degree shouldered hexagon', [[0, 40], [0, 10], [10, 0], [90, 0], [100, 10], [100, 40]], 4],
      ['a stepped profile', [[0, 100], [0, 60], [30, 60], [50, 40], [80, 40], [100, 20], [100, 100]], 4],
    ];

    for (const [name, pts, depth] of SHAPES) {
      it(`${name}: every facet's outer edge is parallel to its inner edge`, () => {
        expect(bevelHolds(pts, depth)).toBe(true);
        const qs = quads(ringFacets(pts, depth, NINE_AM, FLAT, BODY));
        expect(qs).toHaveLength(pts.length);
        qs.forEach(expectParallel);
      });
    }
  });

  describe('every facet is a real quad of the inset ring', () => {
    const HEX: GemPoint[] = [[0, 40], [0, 10], [10, 0], [90, 0], [100, 10], [100, 40]];

    it('uses the polygon inset at the requested depth for its inner corners', () => {
      const inner = inset(HEX, 3);
      const qs = quads(ringFacets(HEX, 3, NINE_AM, FLAT, BODY));
      for (let i = 0; i < HEX.length; i++) {
        const q = facetOn(qs, HEX[i], HEX[(i + 1) % HEX.length])!;
        expect(same(q.pts[3], inner[i])).toBe(true);
        expect(same(q.pts[2], inner[(i + 1) % HEX.length])).toBe(true);
      }
    });

    it('shades each edge by its own outward normal dotted with the light', () => {
      const N = edgeNormals(HEX);
      const qs = quads(ringFacets(HEX, 3, NINE_AM, FLAT, BODY));
      for (let i = 0; i < HEX.length; i++) {
        const shade = N[i][0] * NINE_AM[0] + N[i][1] * NINE_AM[1];
        const level = shade > 0.5 ? 1.25 : shade < -0.5 ? 0.5 : 1.1;
        expect(facetOn(qs, HEX[i], HEX[(i + 1) % HEX.length])!.fill).toBe(tone(level));
      }
    });
  });
});
