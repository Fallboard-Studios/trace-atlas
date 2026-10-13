// ========================================
// CONSTANTS
// ========================================

/** In-world hours between a building's window flicker re-rolls. */
export const FLICKER_PERIOD = 2;

/** How many evenly spaced phase offsets buildings are spread over inside one flicker period. */
const FLICKER_PHASE_SLOTS = 8;

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
 * Computes east/west lightness multipliers for a given hour of the in-world day.
 *
 * Cycle landmarks (hour of day):
 *  - 0   → midnight  (both faces dark)
 *  - 9   → 9 am      (east face at peak)
 *  - 12  → noon      (both faces equal, bright)
 *  - 15  → 3 pm      (west face at peak)
 *  - 24  → midnight  (wraps to 0)
 *
 * **East face** = right side of building (x ≥ frontCornerX).
 * **West face** = left side of building  (x < frontCornerX).
 *
 * The raw sine values are gamma-corrected with {@link GAMMA} = 2.2 before
 * scaling into the [{@link NIGHT_L}, {@link PEAK_L}] output range.
 *
 * @param hour - Hour of the in-world day, a 0..24 float (`computeLocaleHour`); wraps at 24.
 * @returns `{ eastL, westL }` — lightness multipliers for east and west faces.
 */
export function getLighting(hour: number): { eastL: number; westL: number } {
  const θ = ((hour % 24) / 24) * 2 * Math.PI;

  // Base formula: (sin(θ - π/2) + 1) / 2 → 0 at hour 0 (midnight), 1 at hour 12 (noon)
  // East face: phase-advance by π/4  → peaks at θ = 3π/4 → hour 9
  // West face: phase-delay  by π/4  → peaks at θ = 5π/4 → hour 15
  const eastRaw = (Math.sin(θ - Math.PI / 2 + Math.PI / 4) + 1) / 2;
  const westRaw = (Math.sin(θ - Math.PI / 2 - Math.PI / 4) + 1) / 2;

  const eastL = NIGHT_L + (PEAK_L - NIGHT_L) * Math.pow(eastRaw, GAMMA);
  const westL = NIGHT_L + (PEAK_L - NIGHT_L) * Math.pow(westRaw, GAMMA);

  return { eastL, westL };
}

/**
 * A building's flicker phase offset in in-world hours, 0..FLICKER_PERIOD (exclusive), stepped in
 * `FLICKER_PERIOD / FLICKER_PHASE_SLOTS` hours (a quarter hour). It staggers window re-rolls so no
 * two buildings re-render on the same tick at an epoch boundary.
 *
 * @param buildingSeed - The building's stable id hash.
 */
export function flickerPhase(buildingSeed: number): number {
  return (buildingSeed % FLICKER_PHASE_SLOTS) * (FLICKER_PERIOD / FLICKER_PHASE_SLOTS);
}

/**
 * The window-flicker epoch for a building: increments every {@link FLICKER_PERIOD} hours, shifted
 * by the building's {@link flickerPhase}. Feeds the seeded window re-roll.
 *
 * @param hour - Hour of the in-world day, a 0..24 float.
 * @param phase - The building's {@link flickerPhase}.
 */
export function getFlickerEpoch(hour: number, phase: number): number {
  return Math.floor((hour + phase) / FLICKER_PERIOD);
}
