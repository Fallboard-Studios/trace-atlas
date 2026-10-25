// ========================================
// LINEAR INTERPOLATION
// ========================================

/**
 * Linear interpolation between two values.
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value between a and b
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ========================================
// STEP QUANTIZATION
// ========================================

/**
 * Rounds a value to the nearest point on the min + n*step grid.
 * @param value - Value to quantize
 * @param min - Grid origin
 * @param step - Grid spacing
 * @returns Nearest value on the grid
 */
export function quantizeToStep(value: number, min: number, step: number): number {
  return min + Math.round((value - min) / step) * step;
}

// ========================================
// FLOATING-POINT CLEANUP
// ========================================

/**
 * Rounds to `decimalPlaces`, removing floating-point representation residue so a value that
 * should be on a decimal grid IS that decimal (-0.42000000000000004 → -0.42, and
 * quantizeToStep's 1.3500000000000001 → 1.35). Shift, round, shift back. Used wherever a number
 * is about to be stored or serialised (sessionDiff's capture normalisation, tempoSync's
 * Sync → Free conversions).
 * @param value - Value to clean
 * @param decimalPlaces - Places to keep (0 gives an integer)
 */
export function roundToDecimals(value: number, decimalPlaces: number): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(value * factor) / factor;
}

// ========================================
// STRUCTURAL EQUALITY
// ========================================

/** Structural equality over plain JSON-shaped values (numbers, strings, booleans, arrays, plain
 *  objects) — every field this module compares is one of those. Not a general-purpose deep-equal
 *  (no Date/Map/Set handling), since nothing in Robot/RobotAudioBaseline's audio-relevant fields
 *  needs it (CLAUDE.md requires state stay JSON-serializable in the first place). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}
