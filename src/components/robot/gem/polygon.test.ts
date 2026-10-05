// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';

import {
  genPolygon,
  inset,
  edgeNormals,
  bevelDepth,
  bevelHolds,
  GEM_BEVEL_DEPTH,
  BASE_RULES,
  MAIN_RULES,
  ORBIT_RULES,
  type GemPoint,
  type PolygonRules,
} from './polygon';

// ========================================
// INDEPENDENT GEOMETRY MEASUREMENTS
// ========================================
// Everything below re-derives the rulebook from the points alone, so a generator that miscounts
// its own corners still fails (docs/specs/GEM_POLYGON_ROBOTS.md §1.2).

const EPS = 1e-6;

function signedArea(pts: GemPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

interface Corner {
  concave: boolean;
  right: boolean;
}

function corners(pts: GemPoint[]): Corner[] {
  const orient = Math.sign(signedArea(pts));
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const ux = p[0] - prev[0];
    const uy = p[1] - prev[1];
    const vx = next[0] - p[0];
    const vy = next[1] - p[1];
    const cross = ux * vy - uy * vx;
    const dot = ux * vx + uy * vy;
    const concave = Math.sign(cross) === -orient;
    const right = !concave && Math.abs(dot) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) < 1e-6;
    return { concave, right };
  });
}

function edgeAnglesDeg(pts: GemPoint[]): number[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
  });
}

function segmentsCross(a: GemPoint, b: GemPoint, c: GemPoint, d: GemPoint): boolean {
  const o = (p: GemPoint, q: GemPoint, r: GemPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

function selfIntersects(pts: GemPoint[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

function strictlyInside(pt: GemPoint, pts: GemPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function mirrored(pts: GemPoint[], w: number, h: number, axis: 'h' | 'v'): boolean {
  const m = pts.map(([x, y]): GemPoint => (axis === 'h' ? [w - x, y] : [x, h - y]));
  return m.every((q) => pts.some((p) => Math.abs(p[0] - q[0]) < 0.3 && Math.abs(p[1] - q[1]) < 0.3));
}

// ========================================
// SWEEP
// ========================================
const SEEDS = 2000;
const BOXES: Array<[number, number]> = [
  [25, 25],
  [32, 32],
  [24, 36],
  [48, 36],
  [24, 16],
  [64, 32],
];
const RULE_SETS: Array<[string, PolygonRules]> = [
  ['BASE', BASE_RULES],
  ['MAIN', MAIN_RULES],
  ['ORBIT', ORBIT_RULES],
];

function sweep(visit: (pts: GemPoint[], w: number, h: number, name: string, rules: PolygonRules) => void) {
  for (const [name, rules] of RULE_SETS) {
    for (const [w, h] of BOXES) {
      const R = alea(`polygon-sweep:${name}:${w}x${h}`);
      for (let s = 0; s < SEEDS; s++) visit(genPolygon(R, w, h, rules), w, h, name, rules);
    }
  }
}

/** Collects the first few violations so a failure says which seed/box broke, not just "false". */
function collect(check: (pts: GemPoint[], w: number, h: number, name: string, rules: PolygonRules) => string | null): string[] {
  const out: string[] = [];
  sweep((pts, w, h, name, rules) => {
    if (out.length >= 5) return;
    const msg = check(pts, w, h, name, rules);
    if (msg) out.push(`${name} ${w}x${h}: ${msg}`);
  });
  return out;
}

// ========================================
// TESTS
// ========================================
describe('genPolygon — the rulebook, over 2 000 seeds × 6 boxes × 3 rule sets', () => {
  it('has 8 to 12 sides', () => {
    expect(collect((pts) => (pts.length < 8 || pts.length > 12 ? `${pts.length} sides` : null))).toEqual([]);
  });

  it('has at most 4 right angles', () => {
    expect(collect((pts) => {
      const n = corners(pts).filter((c) => c.right).length;
      return n > 4 ? `${n} right angles` : null;
    })).toEqual([]);
  });

  it('has no more concave corners than its rule set allows (BASE convex, MAIN ≤ 2, ORBIT ≤ 4)', () => {
    expect(collect((pts, _w, _h, _n, rules) => {
      const n = corners(pts).filter((c) => c.concave).length;
      return n > rules.maxConcave ? `${n} concave` : null;
    })).toEqual([]);
    expect(BASE_RULES.maxConcave).toBe(0);
    expect(MAIN_RULES.maxConcave).toBe(2);
    expect(ORBIT_RULES.maxConcave).toBe(4);
  });

  it('every edge runs at a multiple of 15°', () => {
    expect(collect((pts) => {
      const bad = edgeAnglesDeg(pts).find((a) => {
        const r = ((a % 15) + 15) % 15;
        return Math.min(r, 15 - r) > 1e-6;
      });
      return bad === undefined ? null : `edge at ${bad}°`;
    })).toEqual([]);
  });

  it('touches all four edges of its own box and never leaves it', () => {
    expect(collect((pts, w, h) => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const ok = Math.abs(minX) < EPS && Math.abs(maxX - w) < EPS && Math.abs(minY) < EPS && Math.abs(maxY - h) < EPS;
      return ok ? null : `bbox ${minX},${minY}..${maxX},${maxY}`;
    })).toEqual([]);
  });

  it('never self-intersects and has no degenerate (sub-0.25-unit) edges', () => {
    expect(collect((pts) => {
      if (selfIntersects(pts)) return 'self-intersects';
      const short = pts.findIndex((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.25;
      });
      return short === -1 ? null : `degenerate edge ${short}`;
    })).toEqual([]);
  });

  it('MAIN polygons are never mirror-symmetric on either axis', () => {
    expect(collect((pts, w, h, name) => {
      if (name !== 'MAIN') return null;
      return mirrored(pts, w, h, 'h') || mirrored(pts, w, h, 'v') ? 'symmetric' : null;
    })).toEqual([]);
  });

  it('is deterministic for the same stream seed', () => {
    const a = genPolygon(alea('same'), 32, 32, MAIN_RULES);
    const b = genPolygon(alea('same'), 32, 32, MAIN_RULES);
    expect(a).toEqual(b);
  });
});

describe('edgeNormals', () => {
  const cw: GemPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const ccw: GemPoint[] = [...cw].reverse();

  it.each([['clockwise', cw], ['counter-clockwise', ccw]] as const)('points outward on a %s square', (_label, square) => {
    const pts = square as GemPoint[];
    edgeNormals(pts).forEach((n, i) => {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const mid: GemPoint = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      expect(n[0] * (mid[0] - 5) + n[1] * (mid[1] - 5)).toBeGreaterThan(0);
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9);
    });
  });
});

describe('inset — the bevel ring', () => {
  it('puts every inset vertex strictly inside its outline, same winding, for the real bevel depth', () => {
    expect(collect((pts, w, h) => {
      const d = bevelDepth(w, h);
      const inner = inset(pts, d);
      if (inner.length !== pts.length) return 'vertex count changed';
      if (!inner.every((v) => strictlyInside(v, pts))) return 'inset vertex outside';
      if (Math.sign(signedArea(inner)) !== Math.sign(signedArea(pts))) return 'inset flipped';
      if (selfIntersects(inner)) return 'inset self-intersects';
      return null;
    })).toEqual([]);
  });

  it('insets a square by exactly d on every side', () => {
    const inner = inset([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
    expect(inner.map(([x, y]) => [Number(x.toFixed(9)), Number(y.toFixed(9))])).toEqual([[2, 2], [8, 2], [8, 8], [2, 8]]);
  });
});

describe('bevelDepth', () => {
  it('is GEM_BEVEL_DEPTH (2.5) once the short side is big enough, 18% of the short side below that', () => {
    expect(GEM_BEVEL_DEPTH).toBe(2.5);
    expect(bevelDepth(24, 16)).toBe(2.5);
    expect(bevelDepth(10, 10)).toBeCloseTo(1.8, 9);
    expect(bevelDepth(10, 40)).toBeCloseTo(1.8, 9);
  });
});

describe('bevelHolds — the rejection rule that keeps facets from bow-tying', () => {
  it('accepts a plain square', () => {
    expect(bevelHolds([[0, 0], [10, 0], [10, 10], [0, 10]], 2)).toBe(true);
  });

  it('rejects an outline whose 1-unit step wall inverts under a 2.5 bevel (the case found in the sweep)', () => {
    const stepped: GemPoint[] = [[0, 7.2], [3.58, 1], [3.58, 0], [18.12, 0], [22.84, 1.26], [24, 5.6], [24, 10.32], [20.72, 16], [4.43, 16], [2.26, 14.75], [0, 10.83]];
    expect(bevelHolds(stepped, 2.5)).toBe(false);
    expect(bevelHolds(stepped, 0.5)).toBe(true);
  });

  it('rejects a bevel that leaves an inner edge shorter than 0.25', () => {
    expect(bevelHolds([[0, 0], [5, 0], [5, 5], [0, 5]], 2.45)).toBe(false);
  });
});
