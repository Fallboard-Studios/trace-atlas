// ========================================
// ORBITER MOTION — SEEDED PLAN (docs/specs/ORBITING_POLYGONS.md §1.2, Phase 40 amendment)
// ========================================
// Everything an orbiter's motion needs that isn't a live dial: its seeded attach order
// (`orbiterPlan`) and the avatar viewBox padding for the attach/detach flight
// (`gemMotionViewBox`). Orbiters no longer orbit or drift (Phase 40 amendment, see
// docs/intent/orbiting-polygons.md) — on spawn they fly into a dock at Top's corner and stay
// there, rigid with the body, until a later session's job animations detach them. A second alea
// stream, `${gemSeed}:orbit`, keeps `orbiterPlan` independent of polygon.ts's geometry stream —
// building a plan never touches `getRobotGem`'s cache or gem.fixture.json.

// ========================================
// IMPORTS
// ========================================
import alea from 'alea';

import { gemWidth, GEM_CANVAS_H, type Rng, type RobotGem } from './polygon';
import { ORBITER_SIZE_MAX } from './orbiterDials';

// ========================================
// TYPES
// ========================================
export interface OrbiterPlan {
  /** TL/TR/BL/BR indices (0-3), permuted; n shown orbiters fill the first n. */
  cornerOrder: [number, number, number, number];
}

// ========================================
// CONSTANTS
// ========================================
/** Attach/detach flight: the orbiter starts this far below its dock (canvas units) and this much
 *  smaller, fading in, then eases into its dock position at rest scale/opacity — a quick "clicks
 *  into place" flourish, not a journey (Phase 40 amendment, Crawford: drift/orbit removed, no dial drives it).
 *  1 s each way (Phase 43 Task 0b, was 0.5): a job's detach and reattach sit inside its jobDuration. */
export const ATTACH_DROP = 10;
export const ATTACH_START_SCALE = 0.4;
export const ATTACH_DURATION = 1;

// ========================================
// HELPERS
// ========================================
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
  return { cornerOrder };
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
// AVATAR FRAME (spec §1.7, Phase 40 amendment)
// ========================================
/**
 * The detail avatar's viewBox: the canvas padded by whatever an orbiter's dock position can reach
 * beyond the canvas edge — at the `size` dial's maximum (`ORBITER_SIZE_MAX`, scaled about the
 * orbiter's own centre, same point `RobotGem`'s `scale(size)` and `useOrbiterMotion`'s GSAP scale
 * both use) and with its attach/detach flight (straight down by `ATTACH_DROP`, size-independent —
 * GSAP's `x`/`y` are canvas-unit offsets, not scaled by the same tween's own `scale`). Docks sit at
 * Top's corners (polygon.ts), already mostly inside the canvas, so this is usually a small or zero
 * pad — unlike the old hoop, the flight never swings wide.
 */
export function gemMotionViewBox(gem: RobotGem): string {
  const width = gemWidth(gem);
  const height = GEM_CANVAS_H;

  let padLeft = 0;
  let padRight = 0;
  let padTop = 0;
  let padBottom = 0;
  for (const part of gem.orbiters) {
    const cx = part.x + part.w / 2;
    const cy = part.y + part.h / 2;
    const halfW = (part.w / 2) * ORBITER_SIZE_MAX;
    const halfH = (part.h / 2) * ORBITER_SIZE_MAX;
    padLeft = Math.max(padLeft, -(cx - halfW));
    padRight = Math.max(padRight, cx + halfW - width);
    padTop = Math.max(padTop, -(cy - halfH));
    padBottom = Math.max(padBottom, cy + halfH + ATTACH_DROP - height);
  }

  const padX = Math.ceil(Math.max(padLeft, padRight, 0));
  const padY = Math.ceil(Math.max(padTop, padBottom, 0));
  return `${-padX} ${-padY} ${width + 2 * padX} ${height + 2 * padY}`;
}
