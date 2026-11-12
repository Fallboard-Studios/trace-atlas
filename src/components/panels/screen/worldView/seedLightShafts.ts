import type { NoiseFunction2D } from 'simplex-noise';
import { getUniformSeededVal } from '@/utils/getSeededVal';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.12)
// ========================================

// "3-5 polygons" — one even draw mapped into the 3 buckets 3/4/5, a third each, the same even
// draw and clamp as districts.ts's pickDistrict (`min(bucketCount - 1, floor(v * bucketCount))`).
const SHAFT_COUNT_MIN = 3;
const SHAFT_COUNT_BUCKETS = 3;

// "each x -200..1920, width 50-160, depth 420-760".
const SHAFT_X_MIN = -200;
const SHAFT_X_MAX = 1920;
const SHAFT_WIDTH_MIN = 50;
const SHAFT_WIDTH_MAX = 160;
const SHAFT_DEPTH_MIN = 420;
const SHAFT_DEPTH_MAX = 760;

// ========================================
// SEEDING
// ========================================

/** One shaft's seeded geometry: its top-left x, its width and its depth. */
export interface SeededShaft {
  x: number;
  w: number;
  depth: number;
}

/**
 * A locale's light shafts (`LightShafts.tsx`), seeded from its noise map: their shared rake
 * direction (-1 or 1) and 3-5 shafts. Every draw is even (docs/specs/EVEN_WORLD_DRAWS.md). Pure,
 * so the component and the distribution tests read the same draws.
 */
export function seedLightShafts(noiseMap: NoiseFunction2D): { dir: -1 | 1; shafts: SeededShaft[] } {
  const countBucket = Math.min(
    SHAFT_COUNT_BUCKETS - 1,
    Math.floor(getUniformSeededVal(noiseMap, 'atmos.shaft.count', 0, 0, 1) * SHAFT_COUNT_BUCKETS),
  );
  const count = SHAFT_COUNT_MIN + countBucket;
  const dir = getUniformSeededVal(noiseMap, 'atmos.shaft.dir', 0, 0, 1) < 0.5 ? -1 : 1;
  const shafts = Array.from({ length: count }, (_, i) => ({
    x: getUniformSeededVal(noiseMap, 'atmos.shaft.x', i, SHAFT_X_MIN, SHAFT_X_MAX),
    w: getUniformSeededVal(noiseMap, 'atmos.shaft.w', i, SHAFT_WIDTH_MIN, SHAFT_WIDTH_MAX),
    depth: getUniformSeededVal(noiseMap, 'atmos.shaft.depth', i, SHAFT_DEPTH_MIN, SHAFT_DEPTH_MAX),
  }));
  return { dir, shafts };
}
