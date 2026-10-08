// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';
import { getSeededVal } from '../utils/getSeededVal';
import { WORLD_BOUNDS } from '../constants/sceneDepth';

// ========================================
// TYPES
// ========================================

/**
 * One segment of a terrain profile: horizontal (`y0 === y1`) or exactly
 * 45 degrees (`x1 - x0 === |y1 - y0|`). Never anything else — a clamped
 * step shortens its run to match the clamped rise/fall instead of breaking
 * the 45-degree invariant.
 */
export interface Step {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TerrainProfile {
  ridge: Step[];
  ground: Step[];
}

// ========================================
// CONSTANTS
// ========================================

// World viewBox width — WORLD_BOUNDS.width (constants/sceneDepth.ts, Task 6's single source of
// truth for the scene's fixed bounds; districts.ts/factoryPlacementSystem.ts already import it
// the same way). Aliased locally so every WORLD_WIDTH reference below stays unchanged.
const WORLD_WIDTH = WORLD_BOUNDS.width;

// Seabed ridge (spec WORLD_VIEW_DISTRICTS.md §1.3): starts at y 860, stays in
// 640-900, flat runs of 80-260, then a step of one of these deltas.
const RIDGE_START_Y = 860;
const RIDGE_BAND: [number, number] = [640, 900];
const RIDGE_RUN: [number, number] = [80, 260];
const RIDGE_STEPS = [-60, -40, 0, 0, 40, 60];

// Stepped ground line: starts at y 1050, stays in 1035-1075 — raised above
// every midground row's floorY (which tops out at 1030, Task 2) so a
// midground item's base is always buried under the ground polygon rather
// than floating above it.
const GROUND_START_Y = 1050;
const GROUND_BAND: [number, number] = [1035, 1075];
const GROUND_RUN: [number, number] = [120, 400];
const GROUND_STEPS = [-20, 0, 0, 0, 20];

// ========================================
// INTERNAL HELPERS
// ========================================

/**
 * Builds one stepped profile from 0..WORLD_WIDTH as alternating flat runs
 * and 45-degree steps, clamped into `band`. Each iteration draws from two
 * dataIds at the same offset: the flat run's length, then the step's delta.
 */
function buildProfile(
  noiseMap: NoiseFunction2D,
  runId: string,
  stepId: string,
  startY: number,
  band: [number, number],
  runRange: [number, number],
  stepValues: number[],
): Step[] {
  const steps: Step[] = [];
  let x = 0;
  let y = startY;
  let i = 0;

  while (x < WORLD_WIDTH) {
    const runLen = getSeededVal(noiseMap, runId, i, runRange[0], runRange[1]);

    if (x + runLen >= WORLD_WIDTH) {
      steps.push({ x0: x, y0: y, x1: WORLD_WIDTH, y1: y });
      x = WORLD_WIDTH;
      break;
    }

    const runEndX = x + runLen;
    steps.push({ x0: x, y0: y, x1: runEndX, y1: y });
    x = runEndX;

    const stepIdx = Math.min(stepValues.length - 1, Math.floor(getSeededVal(noiseMap, stepId, i, 0, stepValues.length)));
    let dy = stepValues[stepIdx];
    let newY = y + dy;
    if (newY < band[0]) newY = band[0];
    if (newY > band[1]) newY = band[1];
    dy = newY - y; // re-derive from the clamped y so dx === |dy| still holds

    const dx = Math.abs(dy);
    steps.push({ x0: x, y0: y, x1: x + dx, y1: newY });
    x += dx;
    y = newY;
    i++;
  }

  return steps;
}

/** Linear interpolation of a profile's y at a given x. */
function yAt(steps: Step[], x: number): number {
  const clampedX = Math.max(steps[0].x0, Math.min(steps[steps.length - 1].x1, x));
  const step = steps.find((s) => clampedX >= s.x0 && clampedX <= s.x1) ?? steps[steps.length - 1];
  const dx = step.x1 - step.x0;
  if (dx === 0) return step.y0;
  const t = (clampedX - step.x0) / dx;
  return step.y0 + (step.y1 - step.y0) * t;
}

// ========================================
// CACHE
// ========================================

const profileCache = new Map<string, TerrainProfile>();

/** Test-only: clears the per-locale cache so each test starts fresh. */
export function __clearTerrainProfileCache(): void {
  profileCache.clear();
}

// ========================================
// PUBLIC API
// ========================================

/**
 * Returns the seabed ridge and stepped ground profiles for a locale,
 * building them once from the locale noise map and caching per locale id
 * (like the noise maps themselves) so repeated calls are identical.
 */
export function getTerrainProfile(localeId: string, noiseMap: NoiseFunction2D): TerrainProfile {
  const cached = profileCache.get(localeId);
  if (cached) return cached;

  const profile: TerrainProfile = {
    ridge: buildProfile(noiseMap, 'terrain.ridge.run', 'terrain.ridge.step', RIDGE_START_Y, RIDGE_BAND, RIDGE_RUN, RIDGE_STEPS),
    ground: buildProfile(noiseMap, 'terrain.ground.run', 'terrain.ground.step', GROUND_START_Y, GROUND_BAND, GROUND_RUN, GROUND_STEPS),
  };
  profileCache.set(localeId, profile);
  return profile;
}

/** The ridge profile's y at a given x; linear on slopes, flat on runs. */
export function ridgeYAt(ridge: Step[], x: number): number {
  return yAt(ridge, x);
}

/** The ground profile's y at a given x; linear on slopes, flat on runs. */
export function groundYAt(ground: Step[], x: number): number {
  return yAt(ground, x);
}
