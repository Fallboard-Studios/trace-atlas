// ========================================
// STATION GEM GEOMETRY (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 20)
// ========================================
// Ported from docs/sketches/robot-charging-station.html (Task 0a, 2026-10-07). Four loosely
// triangular gem layers, each rotated against the next: L4 (back) one solid piece, L1–L3 rings cut
// into three pieces, six of the nine pieces slots. Pure — the component draws, this computes.
//
// The seeded part (`rollStation`) is drawn once per station and never again; the four geometry
// dials (`stationDials`, from the world's global rig) only feed `stationGeometry`, which draws
// nothing from any stream. So a rig drag deforms the station continuously and can never re-roll
// it — the robots' dial rule applied to the station (spec §1.6).

// ========================================
// IMPORTS
// ========================================
import alea from 'alea';

import { genLine, pick, type GemPoint, type Rng } from '../robot/gem/polygon';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '@/constants/accentColors';
import { STATION_BOX_H, STATION_BOX_W } from '@/constants';

// ========================================
// CONSTANTS (Task 0a verdicts)
// ========================================
/** Bevel ring depth on the station's pieces — twice a robot's (sketch verdict: 5, was 2.5). */
export const STATION_BEVEL_DEPTH = 5;

/** Each dial's range, [at rig value 0, at rig value 1] (spec §1.6). */
export const STATION_DIAL_RANGES = {
  /** Air between a ring's pieces, units ← HPF cutoff. */
  gap: [10, 25],
  /** Ring width, units ← LPF cutoff. */
  band: [8, 16],
  /** Twist between one layer and the next, degrees ← EQ3 mid. */
  spread: [30, 60],
  /** Each layer forward is this share of the back layer's radius smaller ← EQ3 tilt. */
  falloff: [0.03, 0.12],
} as const;

/** The back layer's radius as a share of the box's half short side. */
const RADIUS_SHARE = 0.95;
/** The port gem's radius, units. */
const PORT_RADIUS = 10;
/** The port's bevel is capped lower than the pieces' — it is a fifth of their size. */
const PORT_BEVEL_DEPTH = 2;
/**
 * Each boundary-line run is carried through the dials as this many straight sub-runs. A ring bends
 * round its corners, so one straight run mapped end to end would cut a corner off a thin band (up
 * to ~2 units outside its piece at band 8); sampled, the line bends with the ring.
 */
const LINE_SAMPLES_PER_RUN = 6;
/** The ring's band may take at most this share of its outer polygon's inradius, so the inner
 *  ring still encloses the centre. */
const BAND_INRADIUS_SHARE = 0.7;
/** A cut's half-angle is asin(half gap / radius), its sine capped here for a tiny radius… */
const CUT_SIN_CAP = 0.9;
/**
 * …and the angle itself at this share of the piece's span. At gap 25 with a heavy falloff the front
 * ring's inner edge is ~15 units out, where asin(12.5 / r) is wider than half a piece: uncapped, the
 * inner walk wraps the wrong way round the ring (the sketch has the same flaw at that corner). The
 * break tapers on such a ring instead; the cap is continuous, so a dial drag still never pops.
 */
const CUT_SPAN_CAP = 0.4;
/**
 * A piece's bevel is this share of its ring's band, capped at STATION_BEVEL_DEPTH. The sketch took
 * 0.3 × the piece's shortest edge, which is usually a cut face (one band long), but that collapses
 * to nothing when a cut lands next to a corner and jumps back as the dial moves on.
 */
const BEVEL_BAND_SHARE = 0.3;

const DEG = Math.PI / 180;
const TAU = 2 * Math.PI;

// ========================================
// TYPES
// ========================================
export interface StationDials {
  gap: number;
  band: number;
  spread: number;
  falloff: number;
}

/** The global rig values the dials read — GlobalAudioSettings' HPF/LPF cutoffs and EQ3 bands. */
export interface StationRig {
  hpfHz: number;
  lpfHz: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

type CutStyle = 'corners' | 'edges' | 'mixed';

interface TriRoll {
  /** Per corner: angle jitter (degrees) and radius factor. */
  corners: Array<{ jitter: number; radius: number }>;
  /** Per corner: how far along each edge its chamfer cuts. */
  chamfers: number[];
}

interface LayerRoll extends TriRoll {
  rotJitter: number;
  /** 0 = cut at the corners, 60 = mid-edge. */
  cutBase: number;
  cutJitters: number[];
  /** Slot number per piece, -1 for a plain piece (L4: empty). */
  slots: number[];
}

/** A point on a ring piece in its own frame: u along the piece (0..1 between its cut faces at
 *  mid-band), v across the band (0 inner edge, 1 outer edge). */
interface RingPoint {
  u: number;
  v: number;
}

/** The seeded part of one station. Runtime-only, never in state; derived from Station.gemSeed. */
export interface StationRoll {
  /** Hex, one of the robot identity hues. */
  accent: string;
  /** Base rotation, degrees. */
  rot0: number;
  /** Which way the layers twist: 1 or -1. */
  dir: 1 | -1;
  cutStyle: CutStyle;
  /** Front (L1) to back (L4). */
  layers: LayerRoll[];
  port: TriRoll & { rot: number };
  /** Per broken layer, per piece: its boundary line in ring coordinates (null if none fit). */
  lines: Array<Array<RingPoint[] | null>>;
}

export interface StationPiece {
  /** Outline, station-local (origin = the station centre). */
  pts: GemPoint[];
  /** Bevel depth of this piece. */
  bevel: number;
  /** The bevelled face, one point per outline vertex (`offsetPolygon(pts, bevel)`). */
  face: GemPoint[];
  /** 0–5 for a slot piece, -1 otherwise. */
  slot: number;
  /** Boundary line, station-local, or null. */
  line: GemPoint[] | null;
}

export interface StationLayer {
  /** Rotation, degrees. */
  rot: number;
  radius: number;
  outer: GemPoint[];
  /** Ring width and the ring's inner polygon (broken layers only). */
  band?: number;
  inner?: GemPoint[];
  /** Three for L1–L3, none for the solid L4. */
  pieces: StationPiece[];
}

export interface StationGeometry {
  /** Front (L1) to back (L4). */
  layers: StationLayer[];
  /** The small gem at the centre of L1. */
  port: GemPoint[];
  portBevel: number;
  portFace: GemPoint[];
}

// ========================================
// HELPERS
// ========================================
const range = (R: Rng, lo: number, hi: number) => lo + R() * (hi - lo);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const cross = (a: GemPoint, b: GemPoint) => a[0] * b[1] - a[1] * b[0];
const mod = (a: number, n: number) => ((a % n) + n) % n;

function rollTri(R: Rng): TriRoll {
  const corners = [0, 1, 2].map(() => ({ jitter: range(R, -12, 12), radius: range(R, 0.9, 1) }));
  const chamfers = [0, 1, 2].map(() => range(R, 0.1, 0.24));
  return { corners, chamfers };
}

/** A loosely triangular convex hexagon, vertices in increasing angle, recentred on its vertex mean. */
function triGem(tri: TriRoll, radius: number, rotDeg: number): GemPoint[] {
  const corners: GemPoint[] = tri.corners.map((c, k) => {
    const a = (rotDeg + k * 120 + c.jitter) * DEG;
    return [Math.cos(a) * radius * c.radius, Math.sin(a) * radius * c.radius];
  });
  const pts: GemPoint[] = [];
  for (let k = 0; k < 3; k++) {
    const P = corners[k];
    const Pa = corners[(k + 2) % 3];
    const Pb = corners[(k + 1) % 3];
    const c = tri.chamfers[k];
    pts.push([P[0] + (Pa[0] - P[0]) * c, P[1] + (Pa[1] - P[1]) * c], [P[0] + (Pb[0] - P[0]) * c, P[1] + (Pb[1] - P[1]) * c]);
  }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => [x - cx, y - cy]);
}

/** Distance from the origin to the nearest edge line of a convex polygon around it. */
function inradius(pts: readonly GemPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const e: GemPoint = [q[0] - p[0], q[1] - p[1]];
    best = Math.min(best, Math.abs(cross(p, e)) / Math.hypot(e[0], e[1]));
  }
  return best;
}

/**
 * Inward offset of a simple polygon by d, one face point per outline vertex (facet i is
 * pts[i] → pts[i+1] → face[i+1] → face[i]). Where a plain miter inset would invert a short edge —
 * a small chamfer at band 16, or a cut landing next to a corner — that edge is dropped and its
 * neighbours meet instead, so its facet narrows to a triangle. The result moves continuously with
 * d and the outline: an edge shrinking to nothing hands over smoothly instead of popping.
 */
export function offsetPolygon(pts: readonly GemPoint[], d: number): GemPoint[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += cross(pts[i], pts[(i + 1) % n]);
  // The interior is to the left of each edge for a positive (maths-axes CCW) winding.
  const side = area > 0 ? 1 : -1;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (side * -dy) / len;
    const ny = (side * dx) / len;
    return { p: [p[0] + nx * d, p[1] + ny * d] as GemPoint, dir: [dx / len, dy / len] as GemPoint };
  });
  const meet = (a: (typeof lines)[number], b: (typeof lines)[number]): GemPoint => {
    const den = cross(a.dir, b.dir);
    if (Math.abs(den) < 1e-12) return b.p;
    const t = cross([b.p[0] - a.p[0], b.p[1] - a.p[1]], b.dir) / den;
    return [a.p[0] + a.dir[0] * t, a.p[1] + a.dir[1] * t];
  };
  // Drop the most inverted edge until none is, keeping at least a triangle.
  let alive = lines.map((_, i) => i);
  for (let guard = 0; guard < n && alive.length > 3; guard++) {
    const m = alive.length;
    const verts = alive.map((id, k) => meet(lines[alive[(k - 1 + m) % m]], lines[id]));
    let worst = -1;
    let worstDot = 0;
    alive.forEach((id, k) => {
      const a = verts[k];
      const b = verts[(k + 1) % m];
      const dot = (b[0] - a[0]) * lines[id].dir[0] + (b[1] - a[1]) * lines[id].dir[1];
      if (dot < worstDot) {
        worstDot = dot;
        worst = k;
      }
    });
    if (worst < 0) break;
    alive = alive.filter((_, k) => k !== worst);
  }
  // Outline vertex i sits between edges i-1 and i: it takes the meet of the nearest surviving
  // edge at or before i-1 and the nearest at or after i.
  const survives = new Set(alive);
  return pts.map((_, i) => {
    let prev = (i - 1 + n) % n;
    while (!survives.has(prev)) prev = (prev - 1 + n) % n;
    let next = i;
    while (!survives.has(next)) next = (next + 1) % n;
    return meet(lines[prev], lines[next]);
  });
}

/** Drop consecutive points closer than 1e-6 — a cut landing exactly on a vertex, or a dropped edge. */
function dedupe(pts: readonly GemPoint[]): GemPoint[] {
  return pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6;
  });
}

interface RayHit {
  pt: GemPoint;
  /** Edge index. */
  i: number;
  /** Parameter along the edge. */
  s: number;
  /** Distance from the origin. */
  r: number;
}

/** A ray from the origin at `ang` against a convex polygon around the origin. */
function rayHit(pts: readonly GemPoint[], ang: number): RayHit {
  const d: GemPoint = [Math.cos(ang), Math.sin(ang)];
  let best: RayHit | null = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const e: GemPoint = [q[0] - p[0], q[1] - p[1]];
    const den = cross(d, e);
    if (Math.abs(den) < 1e-12) continue;
    const t = cross(p, e) / den;
    const s = cross(p, d) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9 && (!best || t < best.r)) best = { pt: [d[0] * t, d[1] * t], i, s, r: t };
  }
  if (!best) throw new Error('stationGem: ray missed a polygon that should enclose the origin');
  return best;
}

/** Walk an increasing-angle convex polygon forward from hit A to hit B. */
function walk(pts: readonly GemPoint[], a: RayHit, b: RayHit): GemPoint[] {
  const n = pts.length;
  const out: GemPoint[] = [a.pt];
  if (a.i === b.i && b.s >= a.s) return [...out, b.pt];
  for (let i = (a.i + 1) % n, guard = 0; guard <= n; i = (i + 1) % n, guard++) {
    out.push(pts[i]);
    if (i === b.i) break;
  }
  out.push(b.pt);
  return out;
}

/** A polyline with every run split into LINE_SAMPLES_PER_RUN equal sub-runs (same route). */
function resample(line: readonly GemPoint[]): GemPoint[] {
  const out: GemPoint[] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    for (let k = 1; k <= LINE_SAMPLES_PER_RUN; k++) {
      const t = k / LINE_SAMPLES_PER_RUN;
      out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return out;
}

/** Half the angle a `half`-unit half-gap takes at radius r, on a piece spanning `span` radians. */
function cutHalfAngle(half: number, r: number, span: number): number {
  return Math.min(Math.asin(Math.min(CUT_SIN_CAP, half / r)), CUT_SPAN_CAP * span);
}

/**
 * A ring piece's own frame: a point's v is its place across the band (0 inner edge, 1 outer) on
 * the ray through it, and its u its place between the piece's two cut faces at that v. Each face
 * runs from its inner hit to its outer hit (ringPiece), so its angle is taken as the lerp of the
 * two hits' half-angles by v. Carries a boundary line through any dial setting.
 */
interface PieceFrame {
  a: number;
  b: number;
  /** Half-angles of the cut at a and at b, on the inner and the outer polygon. */
  aIn: number;
  aOut: number;
  bIn: number;
  bOut: number;
  outer: readonly GemPoint[];
  inner: readonly GemPoint[];
}

function pieceFrame(outer: readonly GemPoint[], inner: readonly GemPoint[], a: number, b: number, gap: number): PieceFrame {
  const half = gap / 2;
  const at = (pts: readonly GemPoint[], ang: number) => cutHalfAngle(half, rayHit(pts, ang).r, b - a);
  return { a, b, aIn: at(inner, a), aOut: at(outer, a), bIn: at(inner, b), bOut: at(outer, b), outer, inner };
}

const frameLo = (f: PieceFrame, v: number) => f.a + lerp(f.aIn, f.aOut, v);
const frameHi = (f: PieceFrame, v: number) => f.b - lerp(f.bIn, f.bOut, v);

function toRing(f: PieceFrame, p: GemPoint): RingPoint {
  const theta = f.a + mod(Math.atan2(p[1], p[0]) - f.a, TAU);
  const rIn = rayHit(f.inner, theta).r;
  const rOut = rayHit(f.outer, theta).r;
  const v = (Math.hypot(p[0], p[1]) - rIn) / (rOut - rIn);
  const lo = frameLo(f, v);
  return { u: (theta - lo) / (frameHi(f, v) - lo), v };
}

function fromRing(f: PieceFrame, q: RingPoint): GemPoint {
  const lo = frameLo(f, q.v);
  const theta = lo + q.u * (frameHi(f, q.v) - lo);
  const rIn = rayHit(f.inner, theta).r;
  const rOut = rayHit(f.outer, theta).r;
  const r = rIn + q.v * (rOut - rIn);
  return [Math.cos(theta) * r, Math.sin(theta) * r];
}

/** One ring piece between cut angles a → b (b > a), with a `gap`-unit break at each cut. */
function ringPiece(outer: readonly GemPoint[], inner: readonly GemPoint[], a: number, b: number, gap: number): GemPoint[] {
  const half = gap / 2;
  const hit = (pts: readonly GemPoint[], ang: number, sign: number) => {
    const r0 = rayHit(pts, ang).r;
    return rayHit(pts, ang + sign * cutHalfAngle(half, r0, b - a));
  };
  return walk(outer, hit(outer, a, 1), hit(outer, b, -1)).concat(walk(inner, hit(inner, a, 1), hit(inner, b, -1)).reverse());
}

/** Cut angles (radians, increasing) for a broken layer at rotation `rot`. */
function cutAngles(layer: LayerRoll, rot: number): number[] {
  return layer.cutJitters.map((j, k) => (rot + layer.cutBase + k * 120 + j) * DEG);
}

interface Built {
  geometry: StationGeometry;
  frames: PieceFrame[][];
}

function build(roll: Omit<StationRoll, 'lines'>, dials: StationDials): Built {
  const R = stationRadius();
  const frames: PieceFrame[][] = [];
  const layers = roll.layers.map((layer, i): StationLayer => {
    const radius = R * (1 - dials.falloff * (3 - i));
    const rot = roll.rot0 + roll.dir * i * dials.spread + layer.rotJitter;
    const outer = triGem(layer, radius, rot);
    if (i === 3) {
      frames.push([]);
      return { rot, radius, outer, pieces: [] };
    }
    const band = Math.min(dials.band, inradius(outer) * BAND_INRADIUS_SHARE);
    const inner = dedupe(offsetPolygon(outer, band));
    const cuts = cutAngles(layer, rot);
    const layerFrames: PieceFrame[] = [];
    const pieces = [0, 1, 2].map((k): StationPiece => {
      const a = cuts[k];
      const b = cuts[(k + 1) % 3] + (k === 2 ? TAU : 0);
      layerFrames.push(pieceFrame(outer, inner, a, b, dials.gap));
      const pts = dedupe(ringPiece(outer, inner, a, b, dials.gap));
      const bevel = Math.min(STATION_BEVEL_DEPTH, BEVEL_BAND_SHARE * band);
      return { pts, bevel, face: offsetPolygon(pts, bevel), slot: layer.slots[k], line: null };
    });
    frames.push(layerFrames);
    return { rot, radius, outer, band, inner, pieces };
  });
  const port = triGem(roll.port, PORT_RADIUS, roll.port.rot);
  return { geometry: { layers, port, portBevel: PORT_BEVEL_DEPTH, portFace: offsetPolygon(port, PORT_BEVEL_DEPTH) }, frames };
}

// ========================================
// API
// ========================================
/** The back layer's radius: 0.95 × half the station box's short side. */
export function stationRadius(): number {
  return (Math.min(STATION_BOX_W, STATION_BOX_H) / 2) * RADIUS_SHARE;
}

/**
 * The four geometry dials from the world's rig (spec §1.6). Each is linear in its dial's natural
 * space — log Hz for the filters, dB for the EQ — and clamped to its range. Filter Q is unused.
 */
export function stationDials(rig: StationRig): StationDials {
  const logHz = (hz: number) => clamp01(Math.log(Math.max(hz, 1e-9) / 20) / Math.log(1000));
  const at = (key: keyof typeof STATION_DIAL_RANGES, t: number) => lerp(STATION_DIAL_RANGES[key][0], STATION_DIAL_RANGES[key][1], clamp01(t));
  return {
    gap: at('gap', logHz(rig.hpfHz)),
    band: at('band', logHz(rig.lpfHz)),
    spread: at('spread', (rig.eqMid + 12) / 24),
    falloff: at('falloff', (rig.eqLow - rig.eqHigh + 24) / 48),
  };
}

/** The dials at flat EQ and open filters — the shipped default rig. Lines are routed here. */
export const STATION_REFERENCE_DIALS: StationDials = stationDials({ hpfHz: 20, lpfHz: 20000, eqLow: 0, eqMid: 0, eqHigh: 0 });

/**
 * Everything seeded about one station. Draws a fixed number of values from R whatever the seed;
 * boundary lines are routed once, on their own stream, at the reference dials, and kept in each
 * piece's ring coordinates so `stationGeometry` can carry them through any dial setting.
 */
export function rollStation(R: Rng): StationRoll {
  const accent = ACCENT_COLORS[pick(R, ROBOT_IDENTITY_COLOR_NAMES)];
  const rot0 = range(R, 0, 360);
  const dir: 1 | -1 = R() < 0.5 ? 1 : -1;
  const cutStyle = pick(R, ['corners', 'edges', 'mixed'] as const);
  const layers = [0, 1, 2, 3].map((): LayerRoll => {
    const tri = rollTri(R);
    const rotJitter = range(R, -8, 8);
    const mixedEdge = R() < 0.5;
    const cutBase = cutStyle === 'corners' ? 0 : cutStyle === 'edges' ? 60 : mixedEdge ? 60 : 0;
    const cutJitters = [0, 1, 2].map(() => range(R, -15, 15));
    // Fisher–Yates over the three pieces; the first two become slots.
    const order = [0, 1, 2];
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(R() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    return { ...tri, rotJitter, cutBase, cutJitters, slots: order };
  });
  // Slots fill back to front: L3 (index 2) holds 0–1, L2 2–3, L1 4–5; L4 has no pieces.
  layers.forEach((layer, i) => {
    const order = layer.slots;
    const slots = [-1, -1, -1];
    if (i < 3) {
      const first = (2 - i) * 2;
      slots[order[0]] = first;
      slots[order[1]] = first + 1;
    }
    layer.slots = i < 3 ? slots : [];
  });
  const portJitter = range(R, -20, 20);
  const port = { ...rollTri(R), rot: rot0 + 180 + portJitter };
  const lineSeed = Math.floor(R() * 2 ** 31);

  const seeded = { accent, rot0, dir, cutStyle, layers, port };
  const { geometry, frames } = build(seeded, STATION_REFERENCE_DIALS);
  const lines = geometry.layers.slice(0, 3).map((layer, i) =>
    layer.pieces.map((piece, k) => {
      const line = genLine(alea(`${lineSeed}:${i}:${k}`), piece.face);
      return line ? resample(line).map((p) => toRing(frames[i][k], p)) : null;
    }),
  );
  return { ...seeded, lines };
}

const rollCache = new Map<number, StationRoll>();

/** A station's roll for its gemSeed — generated once, then a Map hit. Never stored in state. */
export function getStationRoll(seed: number): StationRoll {
  let roll = rollCache.get(seed);
  if (!roll) {
    roll = rollStation(alea(String(seed)));
    rollCache.set(seed, roll);
  }
  return roll;
}

/** The station's shapes at these dials. Pure, draws nothing from any stream. */
export function stationGeometry(roll: StationRoll, dials: StationDials): StationGeometry {
  const { geometry, frames } = build(roll, dials);
  geometry.layers.slice(0, 3).forEach((layer, i) =>
    layer.pieces.forEach((piece, k) => {
      const line = roll.lines[i][k];
      piece.line = line ? line.map((q) => fromRing(frames[i][k], q)) : null;
    }),
  );
  return geometry;
}
