// ========================================
// GEM POLYGON GENERATOR (docs/specs/GEM_POLYGON_ROBOTS.md §1.2)
// ========================================
// Ported from docs/sketches/gem-polygon-robots.html (Gate 1, 2026-10-04). A rule change lands in
// the sketch first, then here. Pure: every function takes its randomness as a stream, never
// Math.random(), so a seed reproduces a robot exactly.

// ========================================
// IMPORTS
// ========================================
import alea from 'alea';

/** Box-local point in canvas units. */
export type GemPoint = [number, number];

/** A seeded uniform [0, 1) stream — `alea(seed)` in production and tests. */
export type Rng = () => number;

export interface PolygonRules {
  /** Corners may only be cut convexly (no `step`). */
  convex: boolean;
  /** Mirror-symmetric outlines are allowed. */
  allowSymmetric: boolean;
  maxConcave: number;
  maxRight: number;
}

/** Backing polygon: convex, may be symmetric, no angle under 90°. */
export const BASE_RULES: PolygonRules = { convex: true, allowSymmetric: true, maxConcave: 0, maxRight: 4 };
/** Top and Mid polygons: at most two concave corners, never symmetric. */
export const MAIN_RULES: PolygonRules = { convex: false, allowSymmetric: false, maxConcave: 2, maxRight: 4 };
/** Orbiters: at most four concave corners, may be symmetric. */
export const ORBIT_RULES: PolygonRules = { convex: false, allowSymmetric: true, maxConcave: 4, maxRight: 4 };

const MIN_SIDES = 8;
const MAX_SIDES = 12;
/** A corner cut may reach at most this share of each edge it touches, so the two cuts sharing an
 *  edge never meet and the outline can't fold back on itself (sketch fix, 2026-10-04). */
const EDGE_CAP = 0.45;
/** A step's inner wall must be at least this share of the box's short side — above the bevel
 *  cap (0.18) so the inset never self-intersects (sketch fix, 2026-10-04). */
const STEP_WALL_MIN = 0.2;
/** Rejection-sampling bound. The sweep in polygon.test.ts proves it is never reached. */
const MAX_TRIES = 1000;
/** Shortest an inner (bevelled) edge may be — below this its facet is a sliver. */
const MIN_INNER_EDGE = 0.25;

/** Bevel ring depth in canvas units (sketch default, Gate 1). */
export const GEM_BEVEL_DEPTH = 2.5;
/** Share of the box's short side the bevel may take on small parts. */
const BEVEL_SHORT_SIDE_SHARE = 0.18;

/** Bevel depth for a w×h part — lives beside the generator because a polygon is only valid if
 *  its own bevel doesn't invert any edge (see `bevelHolds`). */
export function bevelDepth(w: number, h: number): number {
  return Math.min(GEM_BEVEL_DEPTH, BEVEL_SHORT_SIDE_SHARE * Math.min(w, h));
}

const TAN: Record<number, number> = {
  15: Math.tan(Math.PI / 12),
  30: Math.tan(Math.PI / 6),
  45: 1,
  60: Math.tan(Math.PI / 3),
  75: Math.tan((5 * Math.PI) / 12),
};

/** Corner-local axes, clockwise from top-left (y down): `a` runs back along the incoming edge,
 *  `b` along the outgoing edge. */
const CORNERS: ReadonlyArray<{ at: (w: number, h: number) => GemPoint; a: GemPoint; b: GemPoint }> = [
  { at: () => [0, 0], a: [0, 1], b: [1, 0] },
  { at: (w) => [w, 0], a: [-1, 0], b: [0, 1] },
  { at: (w, h) => [w, h], a: [0, -1], b: [-1, 0] },
  { at: (_w, h) => [0, h], a: [1, 0], b: [0, -1] },
];

type CornerKind = 'none' | 'chamfer' | 'double' | 'step';

// ========================================
// HELPERS
// ========================================
export function pick<T>(R: Rng, items: readonly T[]): T {
  return items[Math.floor(R() * items.length)];
}

function range(R: Rng, lo: number, hi: number): number {
  return lo + R() * (hi - lo);
}

/** p + a·ka + b·kb */
function along(p: GemPoint, a: GemPoint, ka: number, b: GemPoint, kb: number): GemPoint {
  return [p[0] + a[0] * ka + b[0] * kb, p[1] + a[1] * ka + b[1] * kb];
}

function signedArea(pts: readonly GemPoint[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return area / 2;
}

export function isSymmetric(pts: readonly GemPoint[], w: number, h: number, axis: 'h' | 'v'): boolean {
  const mirror = pts.map(([x, y]): GemPoint => (axis === 'h' ? [w - x, y] : [x, h - y]));
  return mirror.every((q) => pts.some((p) => Math.abs(p[0] - q[0]) < 0.3 && Math.abs(p[1] - q[1]) < 0.3));
}

export function pointInPolygon(pt: GemPoint, pts: readonly GemPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ========================================
// GENERATOR
// ========================================
/**
 * A chamfered rectangle filling its w×h box: each corner is left square (`none`), cut once
 * (`chamfer`), cut twice at complementary angles (`double`) or stepped with a slanted inner wall
 * (`step`, one concave corner + one right angle). Rejection-sampled until the rule set holds.
 */
export function genPolygon(R: Rng, w: number, h: number, rules: PolygonRules): GemPoint[] {
  const minDim = Math.min(w, h);
  const kinds: readonly CornerKind[] = rules.convex
    ? ['none', 'chamfer', 'chamfer', 'double']
    : ['none', 'chamfer', 'chamfer', 'double', 'step'];

  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const pts: GemPoint[] = [];
    let sides = 4;
    let right = 0;
    let concave = 0;

    for (let i = 0; i < 4; i++) {
      const { at, a, b } = CORNERS[i];
      const P = at(w, h);
      // TL/BR corners run `a` vertically; TR/BL run it horizontally.
      const capA = EDGE_CAP * (i % 2 === 0 ? h : w);
      const capB = EDGE_CAP * (i % 2 === 0 ? w : h);
      const cut = range(R, 0.22, 0.42) * minDim;
      let kind = pick(R, kinds);

      if (kind === 'step') {
        const t = TAN[pick(R, [45, 60])];
        const B = Math.min(minDim * range(R, 0.25, 0.34), capB, (capA - 1) / t);
        if (B >= STEP_WALL_MIN * minDim) {
          const A = Math.min(B * t + cut * range(R, 0.3, 0.6), capA);
          pts.push(along(P, a, A, b, 0), along(P, a, A - B * t, b, B), along(P, a, 0, b, B));
          sides += 2;
          right += 1;
          concave += 1;
          continue;
        }
        kind = 'chamfer';
      }

      if (kind === 'none') {
        pts.push(P);
        right += 1;
        continue;
      }

      if (kind === 'chamfer') {
        const t = TAN[pick(R, [15, 30, 45, 60, 75])];
        let La = t >= 1 ? cut : cut * t;
        let Lb = t >= 1 ? cut / t : cut;
        const k = Math.min(1, capA / La, capB / Lb);
        La *= k;
        Lb *= k;
        pts.push(along(P, a, La, b, 0), along(P, a, 0, b, Lb));
        sides += 1;
        continue;
      }

      // double: from S = A along `a`, a steep edge (slope T1) meets a shallow edge (slope T2)
      // that ends at E = B along `b`. Solving both lines in corner-local (x along b, y along a)
      // keeps every edge on the 15° grid for any A/B in (T2, T1) — the sketch's version assumed
      // A = B and drifted off-grid otherwise.
      const [p1, p2] = pick(R, [[75, 15], [60, 30]] as const);
      const T1 = TAN[p1];
      const T2 = TAN[p2];
      const A = Math.min(cut, capA);
      const B = Math.min(cut * range(R, 0.8, 1.25), capB);
      const x = (A - T2 * B) / (T1 - T2);
      const y = T2 * (B - x);
      pts.push(along(P, a, A, b, 0), along(P, a, y, b, x), along(P, a, 0, b, B));
      sides += 2;
    }

    if (sides < MIN_SIDES || sides > MAX_SIDES) continue;
    if (right > rules.maxRight || concave > rules.maxConcave) continue;
    if (!rules.allowSymmetric && (isSymmetric(pts, w, h, 'h') || isSymmetric(pts, w, h, 'v'))) continue;
    if (!bevelHolds(pts, bevelDepth(w, h))) continue;
    return pts;
  }
  throw new Error(`genPolygon: no valid ${w}x${h} polygon in ${MAX_TRIES} tries`);
}

// ========================================
// BEVEL
// ========================================
/** Unit outward normal per edge (edge i runs pts[i] → pts[i+1]). Outward is taken from the
 *  winding, not the centroid — the centroid test picks the wrong side on a short step wall next
 *  to a concave corner (sketch fix, 2026-10-04). */
export function edgeNormals(pts: readonly GemPoint[]): GemPoint[] {
  const s = signedArea(pts) > 0 ? -1 : 1;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    return [(s * -dy) / len, (s * dx) / len];
  });
}

/**
 * True when insetting by d keeps every edge pointing the same way and at least MIN_INNER_EDGE
 * long. A miter inset shortens an edge by about d·(cot(α/2) + cot(β/2)), so short edges — a step's
 * inner wall, the leftover of a box edge between two cuts — invert and their facet draws as a
 * bow-tie. Rejecting here covers every corner kind with one rule instead of a formula per kind.
 */
export function bevelHolds(pts: readonly GemPoint[], d: number): boolean {
  const inner = inset(pts, d);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const a = inner[i];
    const b = inner[(i + 1) % n];
    const ix = b[0] - a[0];
    const iy = b[1] - a[1];
    if ((q[0] - p[0]) * ix + (q[1] - p[1]) * iy <= 0) return false;
    if (Math.hypot(ix, iy) < MIN_INNER_EDGE) return false;
  }
  return true;
}

/** Miter offset of every edge inward by d — the inner polygon of the bevel ring. */
export function inset(pts: readonly GemPoint[], d: number): GemPoint[] {
  const N = edgeNormals(pts);
  const n = pts.length;
  return pts.map((p, i) => {
    const iPrev = (i - 1 + n) % n;
    const p0 = along(pts[iPrev], N[iPrev], -d, [0, 0], 0);
    const p1 = along(p, N[iPrev], -d, [0, 0], 0);
    const q0 = along(p, N[i], -d, [0, 0], 0);
    const q1 = along(pts[(i + 1) % n], N[i], -d, [0, 0], 0);
    const r: GemPoint = [p1[0] - p0[0], p1[1] - p0[1]];
    const s: GemPoint = [q1[0] - q0[0], q1[1] - q0[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return q0;
    const t = ((q0[0] - p0[0]) * s[1] - (q0[1] - p0[1]) * s[0]) / den;
    return [p0[0] + r[0] * t, p0[1] + r[1] * t];
  });
}

// ========================================
// BOUNDARY LINES & LIGHTS
// ========================================
/** Line endpoints sit this far inside the inner polygon, so a line never touches a facet. */
const LINE_INSET = 0.4;
/** Every line segment keeps at least this from every facet edge — about half the 0.8 stroke, so
 *  the drawn line never touches the bevel, including where it bends past a concave corner. */
const LINE_CLEARANCE = 0.35;
/** Shortest straight-line span a boundary line may cover. */
const LINE_MIN_SPAN = 4;
const LINE_TRIES = 60;
/** Lights sit this share of the way from an inner vertex to the vertex mean. */
const LIGHT_PULL = 0.3;

function segmentsTouch(a: GemPoint, b: GemPoint, c: GemPoint, d: GemPoint): boolean {
  const o = (p: GemPoint, q: GemPoint, r: GemPoint) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(c, d, a) * o(c, d, b) <= 0 && o(a, b, c) * o(a, b, d) <= 0;
}

function lerpPoint(p: GemPoint, q: GemPoint, t: number): GemPoint {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

function pointSegmentDistance(p: GemPoint, a: GemPoint, b: GemPoint): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function segmentDistance(a: GemPoint, b: GemPoint, c: GemPoint, d: GemPoint): number {
  if (segmentsTouch(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Inside `poly` with at least LINE_CLEARANCE between every segment and every edge of `poly`. */
function pathInside(path: readonly GemPoint[], poly: readonly GemPoint[]): boolean {
  if (!path.every((pt) => pointInPolygon(pt, poly))) return false;
  for (let i = 0; i < path.length - 1; i++) {
    for (let e = 0; e < poly.length; e++) {
      if (segmentDistance(path[i], path[i + 1], poly[e], poly[(e + 1) % poly.length]) < LINE_CLEARANCE) return false;
    }
  }
  return true;
}

/**
 * A boundary line from one inner edge to another: a 45° run plus an axis-aligned run (order
 * seeded), endpoints LINE_INSET inside the inner polygon. Null when no route fits in LINE_TRIES.
 */
export function genLine(R: Rng, inner: readonly GemPoint[]): GemPoint[] | null {
  const n = inner.length;
  const safe = inset(inner, LINE_INSET);
  for (let tries = 0; tries < LINE_TRIES; tries++) {
    const e1 = Math.floor(R() * n);
    const e2 = Math.floor(R() * n);
    const t1 = range(R, 0.2, 0.8);
    const t2 = range(R, 0.2, 0.8);
    const diagFirst = R() < 0.5;
    if (e1 === e2) continue;
    const s = lerpPoint(safe[e1], safe[(e1 + 1) % n], t1);
    const f = lerpPoint(safe[e2], safe[(e2 + 1) % n], t2);
    const dx = f[0] - s[0];
    const dy = f[1] - s[1];
    if (Math.hypot(dx, dy) < LINE_MIN_SPAN) continue;
    const m = Math.min(Math.abs(dx), Math.abs(dy));
    const diag: GemPoint = [Math.sign(dx) * m, Math.sign(dy) * m];
    const bend: GemPoint = diagFirst ? [s[0] + diag[0], s[1] + diag[1]] : [f[0] - diag[0], f[1] - diag[1]];
    // A purely axis-aligned or purely diagonal route has no bend — drop the duplicate point.
    const path = [s, bend, f].filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-6);
    if (pathInside(path, inner)) return path;
  }
  return null;
}

/** Two lights at non-adjacent inner vertices, each pulled LIGHT_PULL toward the vertex mean. */
export function genLights(R: Rng, inner: readonly GemPoint[]): GemPoint[] {
  const n = inner.length;
  const c: GemPoint = [inner.reduce((s, v) => s + v[0], 0) / n, inner.reduce((s, v) => s + v[1], 0) / n];
  const i = Math.floor(R() * n);
  const others = inner.map((_, j) => j).filter((j) => Math.min(Math.abs(i - j), n - Math.abs(i - j)) >= 2);
  const j = pick(R, others);
  return [i, j].map((k) => lerpPoint(inner[k], c, LIGHT_PULL));
}

// ========================================
// ROBOT
// ========================================
/** Canvas height; width is GEM_CANVAS_H × widthFactor (Gate 1 amendment: 80 tall so orbiters
 *  clear the body at rest). */
export const GEM_CANVAS_H = 80;
export const WIDTH_FACTORS = [1, 1.25, 1.5, 1.75, 2] as const;
export type WidthFactor = (typeof WIDTH_FACTORS)[number];
/** Orbiters ignore the width factor — always "somewhat square" (Crawford, 2026-10-04). */
export const ORBITER_W = 24;
export const ORBITER_H = 16;
const PART_TRIES = 50;

export interface GemPart {
  /** Top-left of the part's box in canvas units. */
  x: number;
  y: number;
  /** Box the outline fills (touches all four edges). */
  w: number;
  h: number;
  /** Outline, box-local, 8–12 vertices on the 15° grid. */
  pts: GemPoint[];
  /** Bevel inset of `pts` (the face); equals `pts` on the unbevelled backing. */
  inner: GemPoint[];
  /** Boundary lines, box-local, 2–3 points each, 0°/45°/90° runs. */
  lines: GemPoint[][];
  /** Light positions, box-local — two on the top, none elsewhere. */
  lights: GemPoint[];
}

/** Runtime-only (never in Zustand): derived from Robot.gemSeed by getRobotGem. */
export interface RobotGem {
  widthFactor: WidthFactor;
  backing: GemPart;
  /** TL, TR, BL, BR — docked at Top's four corners (Phase 40 amendment), drawn between midRight and top. */
  orbiters: [GemPart, GemPart, GemPart, GemPart];
  /** Right edge on the canvas centre line; drawn below midRight. */
  midLeft: GemPart;
  /** Left edge on the canvas centre line; drawn above midLeft. */
  midRight: GemPart;
  top: GemPart;
}

interface PartSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  rules: PolygonRules;
  bevel: boolean;
  lines: number;
  lights: number;
}

/** One part; retries its outline until every line (and light) fits, so counts are guaranteed. */
function makePart(R: Rng, spec: PartSpec): GemPart {
  const { x, y, w, h, rules, bevel } = spec;
  for (let tries = 0; tries < PART_TRIES; tries++) {
    const pts = genPolygon(R, w, h, rules);
    const inner = bevel ? inset(pts, bevelDepth(w, h)) : pts;
    const lines: GemPoint[][] = [];
    for (let k = 0; k < spec.lines; k++) {
      const line = genLine(R, inner);
      if (!line) break;
      lines.push(line);
    }
    if (lines.length < spec.lines) continue;
    const lights = spec.lights > 0 ? genLights(R, inner) : [];
    if (!lights.every((L) => pointInPolygon(L, inner))) continue;
    return { x, y, w, h, pts, inner, lines, lights };
  }
  throw new Error(`makePart: no ${w}x${h} part fit its lines/lights in ${PART_TRIES} tries`);
}

/** Every part of one robot. Draw (z) order (RobotGem.tsx): backing, midLeft, midRight, orbiters,
 *  top — orbiters dock at Top's corners (Phase 40 amendment) and are drawn just under it. */
export function generateRobotGem(R: Rng): RobotGem {
  const widthFactor = pick(R, WIDTH_FACTORS);
  const k = widthFactor;
  const W = GEM_CANVAS_H * k;
  const H = GEM_CANVAS_H;

  const backing = makePart(R, { x: (W - 25 * k) / 2, y: (H - 25) / 2, w: 25 * k, h: 25, rules: BASE_RULES, bevel: false, lines: 0, lights: 0 });

  // Dock corners (Phase 40 amendment: orbiters attach to the hull — docs/intent/orbiting-polygons.md
  // amendment): straddling Top's four corners, half tucked under it, so each one reads as
  // nestled between Top and Mid once drawn between mid--right and top (RobotGem.tsx's DOM
  // order). `topX/topY/topW` mirror `top`'s own formula below exactly, computed early (no RNG
  // draw — pure k/constant arithmetic) so this doesn't shift the seeded draw order any other
  // part relies on (orbiterPlan's own stream, gem.fixture.json's byte-identical pts/lines/lights).
  const topX = (W - 32 * k) / 2;
  const topY = (H - 32) / 2;
  const topW = 32 * k;
  const topH = 32;
  const corners: GemPoint[] = [
    [topX - ORBITER_W / 2, topY], // tl
    [topX + topW - ORBITER_W / 2, topY], // tr
    [topX - ORBITER_W / 2, topY + topH - ORBITER_H], // bl
    [topX + topW - ORBITER_W / 2, topY + topH - ORBITER_H], // br
  ];
  const [tl, tr, bl, br] = corners.map(([x, y]) =>
    makePart(R, { x, y, w: ORBITER_W, h: ORBITER_H, rules: ORBIT_RULES, bevel: true, lines: 1, lights: 0 }),
  );
  const leftW = range(R, 20, 24) * k;
  const leftH = range(R, 34, 36);
  const midLeft = makePart(R, { x: W / 2 - leftW, y: (H - leftH) / 2, w: leftW, h: leftH, rules: MAIN_RULES, bevel: true, lines: 2, lights: 0 });
  const rightW = range(R, 20, 24) * k;
  const rightH = range(R, 34, 36);
  const midRight = makePart(R, { x: W / 2, y: (H - rightH) / 2, w: rightW, h: rightH, rules: MAIN_RULES, bevel: true, lines: 2, lights: 0 });
  const top = makePart(R, { x: topX, y: topY, w: topW, h: topH, rules: MAIN_RULES, bevel: true, lines: 4, lights: 2 });

  return { widthFactor, backing, orbiters: [tl, tr, bl, br], midLeft, midRight, top };
}

/** Canvas width of a robot, in canvas units. */
export function gemWidth(gem: RobotGem): number {
  return GEM_CANVAS_H * gem.widthFactor;
}

/** The card/avatar viewBox: exactly the unscaled canvas, letterboxed by the caller's
 *  preserveAspectRatio. Pair with RobotBody's ignoreScale, so a body scale > 1 can't push the
 *  corner orbiters out of frame (Crawford, 2026-10-04: fit each robot to its tile). */
export function gemViewBox(gem: RobotGem): string {
  return `0 0 ${gemWidth(gem)} ${GEM_CANVAS_H}`;
}

const gemCache = new Map<number, RobotGem>();

/** The geometry for a seed — generated once, then a Map hit. Never stored in state:
 *  Robot.gemSeed is the only persisted value (Crawford, 2026-10-04). */
export function getRobotGem(seed: number): RobotGem {
  let gem = gemCache.get(seed);
  if (!gem) {
    gem = generateRobotGem(alea(String(seed)));
    gemCache.set(seed, gem);
  }
  return gem;
}
