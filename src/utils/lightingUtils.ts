// ========================================
// IMPORTS
// ========================================
import { DAY_CYCLE_MEASURES } from '../constants';

// ========================================
// CONSTANTS
// ========================================

/**
 * Total measures in one full day/night cycle. Re-exported from
 * constants/index.ts (the single source of truth shared with
 * beatClock.ts — see docs/DUPLICATE_VALUE_AUDIT.md item 2) rather than
 * declared locally, so existing `from './lightingUtils'` imports
 * (Factory.tsx, lightingUtils.test.ts) don't need to change.
 */
export { DAY_CYCLE_MEASURES };

/**
 * How many measures elapse between window flicker re-rolls.
 * At 96 measures/day this is roughly every 2 "hours".
 */
export const FLICKER_PERIOD = 8;

/**
 * Minimum lightness multiplier applied at the darkest point of night.
 * Buildings are never fully black — ambient scatter keeps them visible.
 */
const NIGHT_L = 0.15;

/**
 * Maximum lightness multiplier at peak sun exposure.
 * Slightly above 1.0 to allow a subtle over-bright "glinting" effect.
 */
const PEAK_L = 1.05;

/**
 * Perceptual gamma exponent applied to raw sine values.
 * pow(x, 2.2) compresses midtones so the bright phase is short and punchy
 * while night lingers longer — matching how human vision perceives daylight.
 */
const GAMMA = 2.2;

// ========================================
// EXPORTS
// ========================================

// There is deliberately no CSS `transition` for lighting-driven fills any more (roadmap 17.2.5,
// 2026-10-02). The old `FILL_TRANSITION = 'fill 4.8s ease-in-out'` was written for a 4-measure
// quantise step that no longer exists: lighting now follows the per-second local-time tick with
// whole-number lightness rounding (colorUtils.ts), so a fill steps by ~1 % every ~2 s — and a
// running `fill` transition style-invalidates its element on every frame, which kept the whole
// ocean scene repainting at idle (scripts/perf/idle-paint.mjs). Steps that small need no easing.

/**
 * Computes how "dark" the scene currently is as a 0–1 scalar.
 * 0 = full noon brightness (no windows lit), 1 = deepest night (all windows eligible).
 * Derived from the average of the east and west lightness multipliers.
 *
 * @param eastL - East face lightness multiplier from `getLighting`.
 * @param westL - West face lightness multiplier from `getLighting`.
 * @returns A 0–1 night-depth value suitable for use as a window-lit threshold.
 */
export function getNightDepth(eastL: number, westL: number): number {
  const avgL = (eastL + westL) / 2;
  // Normalise: PEAK_L → 0, NIGHT_L → 1
  return Math.max(0, Math.min(1, 1 - (avgL - NIGHT_L) / (PEAK_L - NIGHT_L)));
}

/**
 * Computes east/west lightness multipliers for a given measure in the
 * 96-measure day/night cycle.
 *
 * Cycle landmarks (measure → time-of-day equivalent):
 *  - m = 0   → midnight  (both faces dark)
 *  - m = 36  → 9 am      (east face at peak)
 *  - m = 48  → noon      (both faces equal, bright)
 *  - m = 60  → 3 pm      (west face at peak)
 *  - m = 96  → midnight  (wraps to 0)
 *
 * **East face** = right side of building (x ≥ frontCornerX).
 * **West face** = left side of building  (x < frontCornerX).
 *
 * The raw sine values are gamma-corrected with {@link GAMMA} = 2.2 before
 * scaling into the [{@link NIGHT_L}, {@link PEAK_L}] output range.
 *
 * @param measure - Current measure count; wraps automatically at 96.
 * @returns `{ eastL, westL }` — lightness multipliers for east and west faces.
 */
export function getLighting(measure: number): { eastL: number; westL: number } {
  const θ = ((measure % DAY_CYCLE_MEASURES) / DAY_CYCLE_MEASURES) * 2 * Math.PI;

  // Base formula: (sin(θ - π/2) + 1) / 2 → 0 at m=0 (midnight), 1 at m=48 (noon)
  // East face: phase-advance by π/4  → peaks at θ = 3π/4 → m = 36 (9 am)
  // West face: phase-delay  by π/4  → peaks at θ = 5π/4 → m = 60 (3 pm)
  const eastRaw = (Math.sin(θ - Math.PI / 2 + Math.PI / 4) + 1) / 2;
  const westRaw = (Math.sin(θ - Math.PI / 2 - Math.PI / 4) + 1) / 2;

  const eastL = NIGHT_L + (PEAK_L - NIGHT_L) * Math.pow(eastRaw, GAMMA);
  const westL = NIGHT_L + (PEAK_L - NIGHT_L) * Math.pow(westRaw, GAMMA);

  return { eastL, westL };
}
