/**
 * A fixed-precision readout for a log slider's value, like the marking on a pedal: `decimals` places
 * with trailing zeros kept, `unit` appended, the value multiplied by `scale` first (1000 for a
 * seconds value shown in milliseconds). Plain `toFixed`, so no thousands separator and no unit
 * that changes with the value: the label never loses a decimal or flips its unit mid-drag.
 *
 * Display-only, like formatDisplayValue: the value handed to onChange and the store is never
 * touched. See docs/specs/LOG_SLIDER_READOUTS.md.
 */
export function fixedReadout(decimals: number, unit = '', scale = 1): (value: number) => string {
  return (value) => `${(value * scale).toFixed(decimals)}${unit}`;
}
