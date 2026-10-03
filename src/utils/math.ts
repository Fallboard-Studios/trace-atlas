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
