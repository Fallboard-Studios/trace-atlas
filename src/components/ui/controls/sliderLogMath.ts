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
