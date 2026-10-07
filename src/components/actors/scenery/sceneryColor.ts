import { applyColorShift, type ColorShift, type HSL } from '../../../utils/colorUtils';
import { lerp } from '../../../utils/math';

/**
 * A no-op hue/sat shift, for structural scenery families that store no shift
 * (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8) but still go through `applyColorShift` for its
 * lightness-multiplier rounding. Shared so pylon/beacon/boulder/gemShape don't each redeclare the
 * same literal (project memory: duplicate-value audit).
 */
export const NO_SHIFT: ColorShift = { hueShift: 0, satShift: 0 };

/**
 * A lit indicator's fill (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 header): "'lit' means
 * `lamp(colour, nightDepth)` = lightness × lerp(0.5, 1, nd)". Never capped (§1.7 — a light is a
 * light at any depth), so callers never pass a depth cap here.
 */
export function lamp(base: HSL, nightDepth: number, lo = 0.5): string {
  return applyColorShift(base, NO_SHIFT, lerp(lo, 1, nightDepth));
}
