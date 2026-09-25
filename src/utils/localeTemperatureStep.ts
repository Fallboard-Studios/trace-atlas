// ========================================
// IMPORTS
// ========================================
import { getLocaleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';
import { LOCALE_TEMPERATURE_RANGE } from './localeTemperature';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Step magnitude weights, indexed by (magnitude - 1): a 1-degree move is 5x
 * as likely as a 5-degree move, decreasing in between. Used by
 * stepLocaleTemperature's walk (AttenuationStyleView.tsx, stepped once per
 * in-world half-hour boundary crossed).
 */
const STEP_WEIGHTS = [5, 4, 3, 2, 1];
const STEP_WEIGHT_TOTAL = STEP_WEIGHTS.reduce((sum, w) => sum + w, 0);

function magnitudeFromFraction(fraction: number): number {
  let cumulative = 0;
  for (let i = 0; i < STEP_WEIGHTS.length; i++) {
    cumulative += STEP_WEIGHTS[i];
    if (fraction < cumulative / STEP_WEIGHT_TOTAL) return i + 1;
  }
  return STEP_WEIGHTS.length;
}

/**
 * Advance a locale's decorative temperature by one walk step: at most 5
 * degrees, weighted toward smaller moves (1 most likely ... 5 least
 * likely), clamped to LOCALE_TEMPERATURE_RANGE.
 *
 * Seeded off the same locale noise map as computeLocaleTemperature
 * (localeTemperature.ts) — same coordinate-derived source, so identical
 * (x, y) always produce the identical sequence of steps, and different
 * coordinates produce a different sequence, same as every other
 * coordinate-derived per-locale value. `slot` is the half-hour index driving
 * the walk (AttenuationStyleView.tsx's Math.floor(hour * 2)) — a stable,
 * ever-advancing offset, not the wall-clock, so the "graph" of steps is
 * fixed per locale rather than re-rolled on every render.
 */
export function stepLocaleTemperature(localeId: string, x: number, y: number, slot: number, current: number): number {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const raw = getSeededVal(noiseMap, 'locale.temperatureStep', slot, -1, 1); // simplex noise in [-1, 1]
  const magnitude = magnitudeFromFraction(Math.abs(raw));
  const delta = raw >= 0 ? magnitude : -magnitude;
  const next = current + delta;
  return Math.min(LOCALE_TEMPERATURE_RANGE.max, Math.max(LOCALE_TEMPERATURE_RANGE.min, next));
}
