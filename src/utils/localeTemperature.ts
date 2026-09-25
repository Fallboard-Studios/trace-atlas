// ========================================
// IMPORTS
// ========================================
import { getLocaleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Temperature's own decorative range (°C) — purely for display/world
 * immersion, no gameplay or audio effect. Confirmed via /interview-me,
 * docs/intent/header-hub-consolidation.md.
 */
export const LOCALE_TEMPERATURE_RANGE = { min: -120, max: -30 };

/**
 * Generate the decorative temperature (°C) for a locale at a given in-world
 * hour, sampled from that locale's own noise map (getLocaleNoiseMap —
 * coordinate-derived, no Attenuation Style dependency, same as
 * generateLocaleBpm/localeBpmSeed.ts). Unlike BPM (one static value per
 * locale, sampled at a fixed offset of 0), temperature samples at the LIVE
 * `hour` (a continuous float, 0-24, from computeLocaleHour) so it drifts
 * smoothly as the in-world clock advances — simplex noise is continuous
 * along the axis it's sampled on, so nearby hours produce nearby values.
 * Rounded to the nearest whole degree for display. A pure function: never
 * stored on the Locale object itself, called fresh on every tick
 * (AttenuationStyleView.tsx). docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3.
 *
 * Only used as the initial/reseed value on locale change — subsequent
 * updates are stepLocaleTemperature's random walk (localeTemperatureStep.ts).
 */
export function computeLocaleTemperature(localeId: string, x: number, y: number, hour: number): number {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const raw = getSeededVal(noiseMap, 'locale.temperature', hour, LOCALE_TEMPERATURE_RANGE.min, LOCALE_TEMPERATURE_RANGE.max);
  return Math.round(raw);
}
