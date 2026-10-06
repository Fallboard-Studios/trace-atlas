// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';

import {
  generateRobotGem,
  getRobotGem,
  gemWidth,
  gemViewBox,
  inset,
  bevelDepth,
  isSymmetric,
  GEM_CANVAS_H,
  ORBITER_W,
  ORBITER_H,
  WIDTH_FACTORS,
  type GemPart,
  type GemPoint,
  type RobotGem,
} from './polygon';
import fixture from './gem.fixture.json';

// ========================================
// HELPERS (independent of the generator)
// ========================================
const EPS = 1e-6;
const SEEDS = 2000;
const FIXTURE_SEED = 20261004;

function signedArea(pts: GemPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function concaveCount(pts: GemPoint[]): number {
  const orient = Math.sign(signedArea(pts));
  return pts.filter((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const next = pts[(i + 1) % pts.length];
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    return Math.sign(cross) === -orient;
  }).length;
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

function segmentsTouch(a: GemPoint, b: GemPoint, c: GemPoint, d: GemPoint): boolean {
  const o = (p: GemPoint, q: GemPoint, r: GemPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

function parts(gem: RobotGem): Array<[string, GemPart]> {
  return [
    ['backing', gem.backing],
    ['orbiterTL', gem.orbiters[0]],
    ['orbiterTR', gem.orbiters[1]],
    ['orbiterBL', gem.orbiters[2]],
    ['orbiterBR', gem.orbiters[3]],
    ['midLeft', gem.midLeft],
    ['midRight', gem.midRight],
    ['top', gem.top],
  ];
}

function box(p: GemPart): [number, number, number, number] {
  return [p.x, p.y, p.x + p.w, p.y + p.h];
}

const gems: RobotGem[] = Array.from({ length: SEEDS }, (_, s) => generateRobotGem(alea(`robot-gem-sweep:${s}`)));

/** First few violations across the sweep, so a failure names the seed and part. */
function collect(check: (part: GemPart, name: string, gem: RobotGem) => string | null): string[] {
  const out: string[] = [];
  gems.forEach((gem, s) => {
    for (const [name, part] of parts(gem)) {
      if (out.length >= 5) return;
      const msg = check(part, name, gem);
      if (msg) out.push(`seed ${s} ${name}: ${msg}`);
    }
  });
  return out;
}

// ========================================
// LAYOUT
// ========================================
describe('generateRobotGem — layout (docs/specs/GEM_POLYGON_ROBOTS.md §1.1, Gate 1 amendments)', () => {
  it('gemViewBox frames exactly the unscaled canvas — the card/avatar viewBox (Task 8)', () => {
    gems.slice(0, 50).forEach((g) => expect(gemViewBox(g)).toBe(`0 0 ${80 * g.widthFactor} 80`));
  });

  it('canvas is GEM_CANVAS_H (80) tall and 80 × one of the five width factors wide', () => {
    expect(GEM_CANVAS_H).toBe(80);
    expect([...WIDTH_FACTORS]).toEqual([1, 1.25, 1.5, 1.75, 2]);
    const seen = new Set(gems.map((g) => g.widthFactor));
    expect([...seen].sort()).toEqual([1, 1.25, 1.5, 1.75, 2]);
    gems.forEach((g) => expect(gemWidth(g)).toBe(80 * g.widthFactor));
  });

  it('part sizes: backing 25k×25, top 32k×32, mids 20–24k × 34–36, orbiters always 24×16', () => {
    expect([ORBITER_W, ORBITER_H]).toEqual([24, 16]);
    expect(collect((p, name, g) => {
      const k = g.widthFactor;
      const ok =
        name === 'backing' ? Math.abs(p.w - 25 * k) < EPS && p.h === 25
        : name === 'top' ? Math.abs(p.w - 32 * k) < EPS && p.h === 32
        : name.startsWith('mid') ? p.w >= 20 * k - EPS && p.w <= 24 * k + EPS && p.h >= 34 && p.h <= 36
        : p.w === 24 && p.h === 16;
      return ok ? null : `${p.w}×${p.h} at k=${k}`;
    })).toEqual([]);
  });

  it('places backing and top centred, mids flush to the centre line and centred vertically, orbiters docked at Top\'s four corners (Phase 40 amendment)', () => {
    expect(collect((p, name, g) => {
      const W = gemWidth(g);
      const H = GEM_CANVAS_H;
      const centred = (q: GemPart) => Math.abs(q.x + q.w / 2 - W / 2) < EPS && Math.abs(q.y + q.h / 2 - H / 2) < EPS;
      const top = g.top;
      const ok =
        name === 'backing' || name === 'top' ? centred(p)
        : name === 'midLeft' ? Math.abs(p.x + p.w - W / 2) < EPS && Math.abs(p.y + p.h / 2 - H / 2) < EPS
        : name === 'midRight' ? Math.abs(p.x - W / 2) < EPS && Math.abs(p.y + p.h / 2 - H / 2) < EPS
        : name === 'orbiterTL' ? Math.abs(p.x - (top.x - 24 / 2)) < EPS && Math.abs(p.y - top.y) < EPS
        : name === 'orbiterTR' ? Math.abs(p.x - (top.x + top.w - 24 / 2)) < EPS && Math.abs(p.y - top.y) < EPS
        : name === 'orbiterBL' ? Math.abs(p.x - (top.x - 24 / 2)) < EPS && Math.abs(p.y - (top.y + top.h - 16)) < EPS
        : Math.abs(p.x - (top.x + top.w - 24 / 2)) < EPS && Math.abs(p.y - (top.y + top.h - 16)) < EPS;
      return ok ? null : `at ${p.x},${p.y}`;
    })).toEqual([]);
  });

  it("orbiters straddle Top's corners, half tucked under it (Phase 40 amendment: docked, not clear of the body)", () => {
    expect(collect((p, name, g) => {
      if (!name.startsWith('orbiter')) return null;
      const [ax0, ay0, ax1, ay1] = box(p);
      const [tx0, ty0, tx1, ty1] = box(g.top);
      const overlapsTop = ax0 < tx1 && tx0 < ax1 && ay0 < ty1 && ty0 < ay1;
      return overlapsTop ? null : 'does not overlap Top — not nestled';
    })).toEqual([]);
  });

  it('applies the right rule set per role: backing convex, top and mids never symmetric', () => {
    expect(collect((p, name) => {
      if (name === 'backing') return concaveCount(p.pts) === 0 ? null : 'concave backing';
      if (name === 'top' || name.startsWith('mid')) {
        return isSymmetric(p.pts, p.w, p.h, 'h') || isSymmetric(p.pts, p.w, p.h, 'v') ? 'symmetric' : null;
      }
      return null;
    })).toEqual([]);
  });

  it('inner is the bevel inset of the outline; the backing has no bevel (inner = outline)', () => {
    expect(collect((p, name) => {
      const expected = name === 'backing' ? p.pts : inset(p.pts, bevelDepth(p.w, p.h));
      return JSON.stringify(p.inner) === JSON.stringify(expected) ? null : 'inner mismatch';
    })).toEqual([]);
  });
});

// ========================================
// BOUNDARY LINES
// ========================================
describe('boundary lines', () => {
  it('counts: top 4, each mid 2, each orbiter 1, backing 0', () => {
    expect(collect((p, name) => {
      const want = name === 'top' ? 4 : name.startsWith('mid') ? 2 : name.startsWith('orbiter') ? 1 : 0;
      return p.lines.length === want ? null : `${p.lines.length} lines`;
    })).toEqual([]);
  });

  it('every line is 2–3 points with no zero-length segment, every segment at a multiple of 45°', () => {
    expect(collect((p) => {
      for (const line of p.lines) {
        if (line.length < 2 || line.length > 3) return `${line.length}-point line`;
        for (let i = 0; i < line.length - 1; i++) {
          const dx = line[i + 1][0] - line[i][0];
          const dy = line[i + 1][1] - line[i][1];
          if (Math.hypot(dx, dy) < EPS) return 'zero-length segment';
          const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          const r = ((deg % 45) + 45) % 45;
          if (Math.min(r, 45 - r) > 1e-6) return `segment at ${deg}°`;
        }
      }
      return null;
    })).toEqual([]);
  });

  it('keeps ≥ 0.35 clearance from every facet edge — half the 0.8 stroke, so the drawn line never touches the bevel', () => {
    const ptSeg = (p: GemPoint, a: GemPoint, b: GemPoint) => {
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)));
      return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
    };
    const segSeg = (a: GemPoint, b: GemPoint, c: GemPoint, d: GemPoint) =>
      segmentsTouch(a, b, c, d) ? 0 : Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
    expect(collect((p) => {
      for (const line of p.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          for (let e = 0; e < p.inner.length; e++) {
            const gap = segSeg(line[i], line[i + 1], p.inner[e], p.inner[(e + 1) % p.inner.length]);
            if (gap < 0.35) return `line ${gap.toFixed(3)} from inner edge ${e}`;
          }
        }
      }
      return null;
    })).toEqual([]);
  });

  it('never touches the bevel: every point strictly inside the inner polygon, no segment touches an inner edge', () => {
    expect(collect((p) => {
      for (const line of p.lines) {
        if (!line.every((pt) => strictlyInside(pt, p.inner))) return 'point outside inner';
        for (let i = 0; i < line.length - 1; i++) {
          for (let e = 0; e < p.inner.length; e++) {
            if (segmentsTouch(line[i], line[i + 1], p.inner[e], p.inner[(e + 1) % p.inner.length])) return 'touches an inner edge';
          }
        }
      }
      return null;
    })).toEqual([]);
  });
});

// ========================================
// LIGHTS
// ========================================
describe('lights', () => {
  it('only the top has lights — exactly two', () => {
    expect(collect((p, name) => {
      const want = name === 'top' ? 2 : 0;
      return p.lights.length === want ? null : `${p.lights.length} lights`;
    })).toEqual([]);
  });

  it('each light is a distinct, non-adjacent inner vertex pulled 30% toward the vertex mean, inside the face', () => {
    expect(collect((p, name) => {
      if (name !== 'top') return null;
      const n = p.inner.length;
      const c: GemPoint = [p.inner.reduce((s, v) => s + v[0], 0) / n, p.inner.reduce((s, v) => s + v[1], 0) / n];
      const indices = p.lights.map((L) => {
        const v: GemPoint = [(L[0] - 0.3 * c[0]) / 0.7, (L[1] - 0.3 * c[1]) / 0.7];
        return p.inner.findIndex((q) => Math.abs(q[0] - v[0]) < 1e-6 && Math.abs(q[1] - v[1]) < 1e-6);
      });
      if (indices.some((i) => i < 0)) return 'light not derived from an inner vertex';
      const gap = Math.abs(indices[0] - indices[1]);
      if (Math.min(gap, n - gap) < 2) return `adjacent vertices ${indices}`;
      if (!p.lights.every((L) => strictlyInside(L, p.inner))) return 'light outside the face';
      return null;
    })).toEqual([]);
  });
});

// ========================================
// SEED → GEM
// ========================================
describe('getRobotGem — the seed cache (geometry is derived, never stored)', () => {
  it('is deterministic: the same stream seed yields deep-equal gems', () => {
    expect(generateRobotGem(alea('x'))).toEqual(generateRobotGem(alea('x')));
  });

  it('returns the same object for the same seed (cache hit) and equals a fresh generation', () => {
    const a = getRobotGem(123456);
    expect(getRobotGem(123456)).toBe(a);
    expect(a).toEqual(generateRobotGem(alea('123456')));
  });

  it('different seeds give different robots', () => {
    expect(getRobotGem(1)).not.toEqual(getRobotGem(2));
  });

  it(`pins seed ${FIXTURE_SEED} to gem.fixture.json (a change here changes every world's robots)`, () => {
    expect(JSON.parse(JSON.stringify(getRobotGem(FIXTURE_SEED)))).toEqual(fixture);
  });
});
