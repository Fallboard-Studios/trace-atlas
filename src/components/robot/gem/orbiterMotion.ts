// ========================================
// ORBITER MOTION — SEEDED PLAN (docs/specs/ORBITING_POLYGONS.md §1.2)
// ========================================
// Everything an orbiter's motion needs that isn't a live dial: its seeded corner order and drift
// parameters (`orbiterPlan`), and the draw of its next orbit (`nextOrbit`). A second alea stream,
// `${gemSeed}:orbit`, keeps this independent of polygon.ts's geometry stream — building a plan
// never touches `getRobotGem`'s cache or gem.fixture.json.

// ========================================
// IMPORTS
// ========================================
import alea from 'alea';

import { gemWidth, GEM_CANVAS_H, ORBITER_W, ORBITER_H, type Rng, type RobotGem } from './polygon';
import type { OrbiterDials } from './orbiterDials';

// ========================================
// TYPES
// ========================================
export interface OrbiterDrift {
  /** Drift half-amplitude in canvas units, x and y. */
  ax: number;
  ay: number;
  /** One full sine cycle, in seconds, x and y. */
  px: number;
  py: number;
  /** Starting progress [0, 1) for the x and y drift tweens. */
  phase: number;
  phase2: number;
}

export interface OrbiterPlan {
  /** TL/TR/BL/BR indices (0-3), permuted; n shown orbiters fill the first n. */
  cornerOrder: [number, number, number, number];
  /** Per corner (indexed 0-3, not by cornerOrder), its drift parameters. */
  drift: OrbiterDrift[];
  /** Per diagonal pair (indexed by ORBIT_PAIRS), the fraction of its gap to wait before its first orbit. */
  initialWait: [number, number];
}

export interface OrbitDraw {
  dir: 1 | -1;
  open: number;
  wait: number;
}

/** Rest centre, unit vector toward the canvas centre, and its length, for one orbiter corner. */
export interface CornerFrame {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  r: number;
}

/** Offset from the corner's rest position at hoop angle θ; θ = 0 is at rest. */
export interface RingPose {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  depth: 'front' | 'rest' | 'behind';
}

/** The quarter hoop a spawn or despawn plays, with no seeded freedom (open 0 always — Gate 1: any
 *  offset let the orbiter be seen appearing/disappearing). */
export interface ArcSpec {
  dir: 1 | -1;
  from: number;
  to: number;
}

// ========================================
// CONSTANTS
// ========================================
/** The two diagonal pairs — the only orbit unit (Gate 1: a solo orbit's far point clipped its
 *  stationary partner at the far corner, so orbits run in pairs instead). */
export const ORBIT_PAIRS: readonly [readonly [number, number], readonly [number, number]] = [
  [0, 3],
  [1, 2],
];

/** Corner i's diagonal partner. */
export function partnerOf(corner: number): number {
  return 3 - corner;
}

/** Drift half-amplitude range, canvas units (intent table row "Drift"). */
export const DRIFT_AMPLITUDE: readonly [number, number] = [2, 3];
/** Drift cycle range, seconds (Gate 1 correction: the intent's 3-6 s read "too fast" at the sketch). */
export const DRIFT_PERIOD: readonly [number, number] = [6, 10];
/** Hoop openness ceiling — 0 is the edge-on centre line; up to this fattens it into a thin ellipse
 *  seen at an angle (Gate 1: variety comes from openness and direction, never a line tilt). */
export const ORBIT_OPEN_MAX = 0.3;

/** Front-half peak scale over rest, at the centre crossing (sketch default, Gate 1: "front half ~1.15x"). */
export const ORBIT_FRONT_SCALE = 0.15;
/** Behind-half trough scale under rest, at the centre crossing. */
export const ORBIT_BEHIND_SCALE = 0.2;
/** Behind-half opacity dip under 1, at the centre crossing (Q4, kept at Gate 1). */
export const ORBIT_BEHIND_DIM = 0.2;

/** Despawn: the exact centre line (open 0), rest to behind at the canvas centre. */
export const DESPAWN_ARC: ArcSpec = { dir: -1, from: 0, to: Math.PI / 2 };
/** Spawn: the reverse — behind at the canvas centre to rest. */
export const SPAWN_ARC: ArcSpec = { dir: 1, from: (3 * Math.PI) / 2, to: 2 * Math.PI };

// ========================================
// HELPERS
// ========================================
function range(R: Rng, lo: number, hi: number): number {
  return lo + R() * (hi - lo);
}

/** Fisher-Yates using the seeded stream. */
function shuffle<T>(R: Rng, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ========================================
// PLAN
// ========================================
function buildOrbiterPlan(R: Rng): OrbiterPlan {
  const cornerOrder = shuffle(R, [0, 1, 2, 3]) as [number, number, number, number];
  const drift: OrbiterDrift[] = [0, 1, 2, 3].map(() => ({
    ax: range(R, DRIFT_AMPLITUDE[0], DRIFT_AMPLITUDE[1]),
    ay: range(R, DRIFT_AMPLITUDE[0], DRIFT_AMPLITUDE[1]),
    px: range(R, DRIFT_PERIOD[0], DRIFT_PERIOD[1]),
    py: range(R, DRIFT_PERIOD[0], DRIFT_PERIOD[1]),
    phase: R(),
    phase2: R(),
  }));
  const initialWait: [number, number] = [R(), R()];
  return { cornerOrder, drift, initialWait };
}

const orbiterPlanCache = new Map<number, OrbiterPlan>();

/** The seeded motion plan for a robot — built once per `gemSeed`, then a Map hit. */
export function orbiterPlan(gemSeed: number): OrbiterPlan {
  let plan = orbiterPlanCache.get(gemSeed);
  if (!plan) {
    plan = buildOrbiterPlan(alea(`${gemSeed}:orbit`));
    orbiterPlanCache.set(gemSeed, plan);
  }
  return plan;
}

// ========================================
// ORBIT DRAWS
// ========================================
/** The next orbit for a pair: direction, hoop openness, and the wait before it starts — at most
 *  one orbit per gap per pair (spec §1.2). */
export function nextOrbit(R: Rng, dials: OrbiterDials): OrbitDraw {
  return {
    dir: R() < 0.5 ? 1 : -1,
    open: R() * ORBIT_OPEN_MAX,
    wait: dials.orbitGap * (1 + R()),
  };
}

// ========================================
// RING GEOMETRY (spec §1.2, §4)
// ========================================
/** A corner's rest centre, the unit vector toward the canvas centre and the distance between
 *  them. The ring and every arc run along this line, through the body, to the far side. */
export function cornerFrame(gem: RobotGem, corner: number): CornerFrame {
  const part = gem.orbiters[corner];
  const cx = part.x + part.w / 2;
  const cy = part.y + part.h / 2;
  const canvasCx = gemWidth(gem) / 2;
  const canvasCy = GEM_CANVAS_H / 2;
  const dx = canvasCx - cx;
  const dy = canvasCy - cy;
  const r = Math.hypot(dx, dy);
  return { cx, cy, ux: r === 0 ? 0 : dx / r, uy: r === 0 ? 0 : dy / r, r };
}

/**
 * Offset from the corner's rest position at hoop angle θ; θ = 0 is at rest. Ported from the
 * sketch's ringPose (Gate 1 reference — a constant change lands there first).
 */
export function ringPose(gem: RobotGem, corner: number, dir: 1 | -1, theta: number, open: number): RingPose {
  const { ux, uy, r } = cornerFrame(gem, corner);
  const along = r * (1 - Math.cos(theta));
  const across = open * r * Math.sin(theta);
  const d = dir * Math.sin(theta);
  return {
    x: along * ux - across * uy,
    y: along * uy + across * ux,
    scale: d >= 0 ? 1 + ORBIT_FRONT_SCALE * d : 1 - ORBIT_BEHIND_SCALE * -d,
    opacity: d >= 0 ? 1 : 1 - ORBIT_BEHIND_DIM * -d,
    depth: Math.abs(d) < 1e-9 ? 'rest' : d > 0 ? 'front' : 'behind',
  };
}

// ========================================
// AVATAR FRAME (spec §1.7)
// ========================================
/** Degree step for sampling the hoop's reach — fine enough that the pad never under-covers it. */
const VIEWBOX_SAMPLE_STEP_DEG = 1;

/**
 * The detail avatar's viewBox: the canvas padded by the largest excursion any orbiter can make —
 * the openness bulge at `ORBIT_OPEN_MAX`, half an orbiter at the 1.15 front scale, and drift —
 * rounded up to whole units, symmetric, so the robot stays centred. The hoop itself never leaves
 * the canvas (its far point is the partner's corner), so an `open: 0` hoop needs no pad beyond the
 * orbiter's own half-size and drift.
 */
export function gemMotionViewBox(gem: RobotGem): string {
  const width = gemWidth(gem);
  const height = GEM_CANVAS_H;
  const halfW = (ORBITER_W / 2) * (1 + ORBIT_FRONT_SCALE);
  const halfH = (ORBITER_H / 2) * (1 + ORBIT_FRONT_SCALE);
  const driftMax = DRIFT_AMPLITUDE[1];

  let padLeft = 0;
  let padRight = 0;
  let padTop = 0;
  let padBottom = 0;
  for (let corner = 0; corner < 4; corner++) {
    const { cx, cy } = cornerFrame(gem, corner);
    for (let deg = 0; deg <= 360; deg += VIEWBOX_SAMPLE_STEP_DEG) {
      const theta = (deg * Math.PI) / 180;
      for (const dir of [1, -1] as const) {
        const { x, y } = ringPose(gem, corner, dir, theta, ORBIT_OPEN_MAX);
        const px = cx + x;
        const py = cy + y;
        padLeft = Math.max(padLeft, -(px - halfW - driftMax));
        padRight = Math.max(padRight, px + halfW + driftMax - width);
        padTop = Math.max(padTop, -(py - halfH - driftMax));
        padBottom = Math.max(padBottom, py + halfH + driftMax - height);
      }
    }
  }

  const padX = Math.ceil(Math.max(padLeft, padRight, 0));
  const padY = Math.ceil(Math.max(padTop, padBottom, 0));
  return `${-padX} ${-padY} ${width + 2 * padX} ${height + 2 * padY}`;
}
