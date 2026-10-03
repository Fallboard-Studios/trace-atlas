// ========================================
// TYPES
// ========================================

/**
 * Hue/Saturation/Lightness representation used throughout the app.
 * All values are percentages except hue which is 0..360.
 */
export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

/**
 * Per-instance color shift values applied to base colors.
 * Generated deterministically at spawn time using variant's colorRanges.
 */
export interface ColorShift {
  hueShift: number;   // Degrees to shift hue (-180 to +180 typical)
  satShift: number;   // Percentage points to shift saturation (-100 to +100)
}

// ========================================
// HELPERS
// ========================================

/**
 * Convert an HSL object into a CSS `hsl()`/`hsla()` string.
 *
 * @param hsl - the HSL value to serialize
 * @param alpha - optional opacity (0..1). Omitted entirely (not just falsy) keeps the existing
 *   `hsl()` format byte-identical for every existing caller — only a supplied alpha switches to
 *   `hsla()`. Useful for glow/box-shadow colors that need transparency.
 * @returns a string suitable for use as a fill/style value e.g. `"hsl(180, 50%, 20%)"` or
 *   `"hsla(180, 50%, 20%, 0.6)"`
 */
export function hslToString(hsl: HSL, alpha?: number): string {
  const { h, s, l } = hsl;
  return alpha === undefined ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

/**
 * Convert a 6-digit `#rrggbb` hex color to HSL (h in [0, 360), s/l in 0..100). Raw, unrounded
 * values — callers round if they need to. The one hex→HSL conversion in the app
 * (docs/specs/WORLD_PALETTE_PULL.md §1.1): traitColors.ts's `desaturateHex` delegates here, and
 * accentLean.ts builds its 18-entry accent-hue table from it. 3-digit shorthand (`#fff`) is not
 * supported — no caller passes one (ACCENT_COLORS.white is excluded from ROBOT_IDENTITY_COLOR_NAMES).
 */
export function hexToHsl(hex: string): HSL {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Clamp a number to the inclusive range [min, max]. Useful when
 * adjusting saturation/brightness so values never escape 0..100.
 *
 * @param value - input value
 * @param min - minimum allowed
 * @param max - maximum allowed
 * @returns the clamped result
 */
export function clamp(value: number, min: number, max: number): number {
  // support inverted bounds by swapping them so the caller doesn't have
  // to check order manually.  This makes clamp(5,10,0) behave like
  // clamp(5,0,10).
  if (min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply hue and saturation shift to an HSL color, returning a new HSL object.
 * Lightness is untouched — callers apply lightness multipliers separately.
 *
 * @param base - Base HSL color to shift
 * @param shift - Hue and saturation deltas
 * @returns A new HSL with shifted h and s values
 */
export function shiftHSL(base: HSL, shift: ColorShift): HSL {
  return {
    h: (base.h + shift.hueShift + 360) % 360,
    s: clamp(base.s + shift.satShift, 0, 100),
    l: base.l,
  };
}

/**
 * Apply color shift and lightness multiplier to a base HSL color.
 * Used for per-instance factory color variation and day/night lighting.
 *
 * @param base - Base HSL color from variant config
 * @param shift - Hue and saturation shifts (deterministic per actor)
 * @param lMultiplier - Lightness multiplier (0-1 for darkening, >1 for brightening)
 * @returns CSS hsl() string ready for use in SVG fill/stroke
 */
export function applyColorShift(
  base: HSL,
  shift: ColorShift,
  lMultiplier: number,
): string {
  const h = (base.h + shift.hueShift + 360) % 360;

  const s = clamp(base.s + shift.satShift, 0, 100);

  // Apply lightness multiplier (e.g., 0.8 for darkening, 1.2 for brightening).
  // Rounded to a whole number — `lMultiplier` is a continuous, never-repeating float when
  // driven by a sine-based day/night cycle (Factory.tsx, rooftopGreebles.tsx), so an
  // unrounded product would produce a genuinely different string on every call, forcing a
  // real DOM write on every tick even when the visual change is imperceptible. Whole-percent
  // granularity (100 distinct levels) is visually indistinguishable from full float precision.
  const l = Math.round(base.l * lMultiplier);

  return hslToString({ h, s, l });
}
