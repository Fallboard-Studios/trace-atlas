// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { DistrictName } from '../types/Actor';
import { getSeededVal } from '../utils/getSeededVal';

// ========================================
// CONSTANTS
// ========================================

/**
 * The nine seeded districts, in spec order (docs/specs/WORLD_VIEW_DISTRICTS.md
 * §1.1). No `legacy` — every locale now draws one of these nine.
 */
export const DISTRICT_NAMES: DistrictName[] = [
  'dense',
  'outskirts',
  'towers',
  'yard',
  'derelict',
  'habitat',
  'wreckfield',
  'ventfield',
  'construction',
];

// Three arbitrary non-integer, mutually-prime-ish offsets for the three
// 'locale.district' draws pickDistrict combines (see its doc comment for why
// three draws, not one).
const DISTRICT_SAMPLE_OFFSETS = [0, 137.42, 911.77] as const;

// ========================================
// FUNCTIONS
// ========================================

/**
 * Pick a locale's district from its noise map, keyed only on `'locale.district'`
 * so the pick is independent of every other draw on that map.
 *
 * Measured against the real `simplex-noise` library this project uses:
 * `noiseMap(x, y)` is NOT uniformly distributed over [-1, 1] — it's
 * bell-curved, concentrated near 0 and sparse at the extremes (confirmed by
 * sampling one map at 20k random points: ~1,350 hits per middle decile vs.
 * ~70 at each edge decile). A single `getSeededVal` draw fed straight into
 * `floor(v * 9)` therefore starves the two edge districts (`dense` and
 * `construction`) across many different locales, however the offset is
 * chosen — swept ~500 offsets and none reliably cleared the spec's own
 * "every district >= 8 of 121 real locale coordinates" bar. Even re-hashing
 * one draw through `alea()` wasn't enough entropy to flatten it (measured
 * ~7-17% range over 72k locales, vs. the uniform ~11.1% target).
 *
 * Combining three draws at different offsets before hashing fixes it
 * (measured ~10.9-11.3% over 72k locales; the real 121-coordinate grid
 * clears the >= 8 bar with room to spare). This is a correction to the
 * spec's literal "one draw" text — see the plan-time note to fold into
 * docs/specs/WORLD_VIEW_DISTRICTS.md §1.1.
 */
export function pickDistrict(noiseMap: NoiseFunction2D): DistrictName {
  const samples = DISTRICT_SAMPLE_OFFSETS.map((offset) => getSeededVal(noiseMap, 'locale.district', offset, 0, 1));
  const flattened = alea(samples.join(':'))();
  const index = Math.min(DISTRICT_NAMES.length - 1, Math.floor(flattened * DISTRICT_NAMES.length));
  return DISTRICT_NAMES[index];
}
