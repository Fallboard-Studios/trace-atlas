/**
 * The weighted LFO Bank shape draw, pure and shared across one Attenuation
 * Style's 4 lane seeds (docs/specs/LFO_BANK.md §1.3) — Crawford's "send the
 * picked one to the back of the array" scheme, same shape as the melody
 * system's weighted-slice note picking. Scoped to shape only: rate/rateDrift/
 * depthDrift stay keyed to lane (LFO_BANK_RATE_BANDS / LFO_BANK_DRIFT_SEED_RANGE
 * in globalAudioSeed.ts), untouched by this draw.
 */

import type { LfoShape } from '../types/lfo';

// ========================================
// SEED ORDER + BIAS
// ========================================

/** Starting queue order for a fresh Attenuation Style seed — front is most likely. */
export const LFO_SHAPE_SEED_ORDER: readonly LfoShape[] = ['sine', 'triangle', 'sawtooth', 'square'];

/** Positional weight by current queue index — each step half as likely as the last. */
export const LFO_SHAPE_SEED_BIAS: readonly number[] = [1, 0.5, 0.25, 0.125];

// ========================================
// PICK
// ========================================

/**
 * Weighted pick by position in `queue` (front-biased via LFO_SHAPE_SEED_BIAS), then
 * returns the picked shape sent to the back of the queue for the next draw — so a
 * second pick of the same shape stays possible, just less likely each time it's
 * reused. `t` is one seeded draw in [0, 1).
 */
export function pickShape(t: number, queue: readonly LfoShape[]): { shape: LfoShape; queue: LfoShape[] } {
  const weights = queue.map((_, i) => LFO_SHAPE_SEED_BIAS[i]);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  let index = queue.length - 1;
  for (let i = 0; i < queue.length; i++) {
    acc += weights[i] / total;
    if (t < acc) {
      index = i;
      break;
    }
  }
  const shape = queue[index];
  const nextQueue = [...queue.slice(0, index), ...queue.slice(index + 1), shape];
  return { shape, queue: nextQueue };
}
