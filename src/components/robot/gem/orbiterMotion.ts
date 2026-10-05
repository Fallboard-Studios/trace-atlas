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

import type { Rng } from './polygon';
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
