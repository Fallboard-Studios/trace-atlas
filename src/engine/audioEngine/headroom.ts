/**
 * Roadmap 54 Output Headroom (docs/specs/OUTPUT_HEADROOM.md): two fixed pieces that keep the master output under
 * full scale out of the box. A trim on every robot's bus gain brings the fleet's sum down before the chain, and a
 * soft ceiling at the chain's end bounds what leaves it. Neither is stored, seeded, saved, shared or shown; the
 * seeded Compressor and Limiter stay the user's and stop being the last line.
 */
import { volumePositionToGain } from './volumeTaper';

/** Fixed trim on every robot bus, so twelve robots at the seeded Volumes sum below 0 dBFS with room for the EQ. It is
 *  folded into the bus gain rather than placed at the chain entry because the five room sends tap off the bus: a trim
 *  there scales each robot's dry and wet alike, so every balance the seed and the user set stays put and only the
 *  level moves. Tuned once by `npm run perf:level` (docs/specs/OUTPUT_HEADROOM.md §5.2); not seeded, not a setting. */
export const HEADROOM_TRIM_DB = -12;
export const HEADROOM_TRIM_GAIN = 10 ** (HEADROOM_TRIM_DB / 20);

/** A robot's live bus gain for a Volume slider position: the shared taper, then the trim. The master slider uses
 *  the taper alone and keeps unity at 1. */
export function robotBusGain(position: number): number {
  return volumePositionToGain(position) * HEADROOM_TRIM_GAIN;
}

/** Where the output ceiling stops being the identity (about −3 dBFS). Below it the ceiling passes the signal
 *  bit-exact; above it a tanh approaches, and never reaches, full scale: an input of 1.0 leaves at 0.93
 *  (−0.65 dBFS), and the WaveShaper node clamps any larger input to that end of the curve. Checkpoint A's ear may
 *  move it (spec §5.5). */
export const CEILING_KNEE = 0.7;

/** Entries in the ceiling's WaveShaper curve, spread evenly over the input range [−1, 1]. Odd, so index (n−1)/2 is
 *  exactly x = 0 and silence stays silence; the linear region is exact under the node's interpolation at any length. */
export const CEILING_CURVE_LENGTH = 4097;

/** Below the knee the ceiling is the identity; above it a tanh that approaches, and never reaches, full scale. Odd and
 *  smooth at the knee (the tanh leaves it at slope 1), so it adds no DC and no kink. */
export function softCeiling(x: number, knee: number = CEILING_KNEE): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const room = 1 - knee;
  return Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
}

/** `softCeiling` sampled for a WaveShaper: entry i is the output for input `2i / (length − 1) − 1`. */
export function softCeilingCurve(
  length: number = CEILING_CURVE_LENGTH,
  knee: number = CEILING_KNEE
): Float32Array {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) curve[i] = softCeiling((2 * i) / (length - 1) - 1, knee);
  return curve;
}
