/**
 * Logarithmic-scale mapping for SliderLog, resolving docs/tasks/
 * ARCHITECTURE_AND_COMPONENTS_PLAN.md Task 10. A pure `value = min *
 * (max/min)^t` exponential is undefined at `min = 0` (Attack/Decay/Release
 * all start at 0s), so this uses an epsilon-floor curve instead: t = 0 maps
 * to exactly min (including min = 0), otherwise the value follows a genuine
 * log curve from a small floor up to max.
 */

export const LOG_EPSILON = 0.001;

function getFloor(min: number): number {
  return Math.max(min, LOG_EPSILON);
}

/** value -> t. value <= min maps to exactly t = 0. */
export function sliderLogValueToT(value: number, min: number, max: number): number {
  if (value <= min) return 0;
  const floor = getFloor(min);
  return Math.log(value / floor) / Math.log(max / floor);
}

/** t -> value. t <= 0 maps to exactly min (including the min = 0 case). */
export function sliderLogTToValue(t: number, min: number, max: number): number {
  if (t <= 0) return min;
  const floor = getFloor(min);
  return floor * Math.pow(max / floor, t);
}

/**
 * Discrete-stops variant (a SliderLog schema's own `steps` list, e.g. Automation Rate's fixed set
 * of allowed frequencies) — used in place of the continuous log curve above whenever a schema
 * provides one. Evenly spaced by INDEX, not by numeric ratio: two adjacent steps that happen to be
 * numerically close (e.g. 1/16 and 1/12) get exactly the same slice of track as any other adjacent
 * pair, so every stop is equally easy to land on regardless of the underlying value spacing.
 */

/** value -> t. Snaps to the index of the NEAREST entry in `steps` (never interpolates between
 *  two), so an off-list value (old stored data, a payload from before a `steps` list changed)
 *  degrades to its closest real stop instead of drifting off the end of the track. */
export function stepsValueToT(value: number, steps: readonly number[]): number {
  if (steps.length <= 1) return 0;
  let nearestIndex = 0;
  let nearestDistance = Math.abs(value - steps[0]);
  for (let i = 1; i < steps.length; i++) {
    const distance = Math.abs(value - steps[i]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  return nearestIndex / (steps.length - 1);
}

/** t -> value. Rounds to the nearest step INDEX (not an interpolated value between two steps),
 *  clamped to the list's own bounds — Radix's continuous [0, 1] drag range always lands on a real
 *  step this way, never a value `steps` never listed. */
export function stepsTToValue(t: number, steps: readonly number[]): number {
  if (steps.length <= 1) return steps[0];
  const index = Math.min(steps.length - 1, Math.max(0, Math.round(t * (steps.length - 1))));
  return steps[index];
}

/**
 * Signed-log variant, for a zero-centred slider whose useful values crowd near zero (the Frequency Shifter's Shift:
 * +-1000 Hz, seeded in +-2-20 Hz; branch review item 7). Track position t runs -1..1 with 0 at the centre, and each
 * half maps |value| = knee * ((bound / knee + 1)^|t| - 1) against its own bound (`max` above zero, `-min` below), so
 * t = 0 is exactly 0, t = +-1 is exactly the bound, the curve is near linear below about `knee` and logarithmic above
 * it.
 */

function signedLogBound(sign: number, min: number, max: number): number {
  return sign > 0 ? max : -min;
}

/** value -> t (-1..1). A value past a bound maps to that end. */
export function signedLogValueToT(value: number, min: number, max: number, knee: number): number {
  if (value === 0) return 0;
  const sign = Math.sign(value);
  const bound = signedLogBound(sign, min, max);
  const magnitude = Math.min(Math.abs(value), bound);
  return (sign * Math.log1p(magnitude / knee)) / Math.log1p(bound / knee);
}

/** t (-1..1) -> value. A t past +-1 maps to the bound. */
export function signedLogTToValue(t: number, min: number, max: number, knee: number): number {
  if (t === 0) return 0;
  const sign = Math.sign(t);
  const bound = signedLogBound(sign, min, max);
  const magnitude = knee * Math.expm1(Math.min(Math.abs(t), 1) * Math.log1p(bound / knee));
  return sign * Math.min(magnitude, bound);
}

/** `value` on the `step` grid, inside the bounds, with -0 written as 0. */
export function signedLogSnap(value: number, min: number, max: number, step: number): number {
  return Math.min(max, Math.max(min, Math.round(value / step) * step)) + 0;
}

/** A keyboard step on the signed-log track: a hundredth of the track (`page`: a tenth), but never less than one `step`
 *  of value, so an arrow press near zero still moves, snapped to `step` and clamped to the bounds. `direction` is +1 or
 *  -1. */
export function signedLogKeyStep(
  value: number,
  direction: 1 | -1,
  page: boolean,
  min: number,
  max: number,
  knee: number,
  step: number,
): number {
  const units = page ? 10 : 1;
  const byTrack = signedLogTToValue(signedLogValueToT(value, min, max, knee) + direction * 0.01 * units, min, max, knee);
  const byValue = value + direction * step * units;
  const next = direction > 0 ? Math.max(byTrack, byValue) : Math.min(byTrack, byValue);
  return signedLogSnap(next, min, max, step);
}

/** A pointer position on the signed-log track (t, -1..1) as the value it sets: on the `step` grid, inside the bounds. */
export function signedLogTrackValue(t: number, min: number, max: number, knee: number, step: number): number {
  return signedLogSnap(signedLogTToValue(t, min, max, knee), min, max, step);
}
