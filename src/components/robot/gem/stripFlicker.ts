// ========================================
// STRIP FLICKER (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.3)
// ========================================
// Pure maths for the two-second out-of-step flicker a lit strip plays when the attribute its line
// is tied to changes (intent: "the flicker reads as a reaction, not a fault"). `useStripFlicker`
// turns a pattern into a GSAP timeline; nothing here touches GSAP, the DOM or AudioEngine. Ported
// from docs/sketches/robot-halo-and-lit-lines.html's startFlicker/flickerK.
//
// Seed-stream convention (the hook's job, documented here so the pattern is reproducible):
//   alea(`${gemSeed}:flicker:${line}:${run}`)
// where `line` ∈ top / midLeft / midRight / orbiters and `run` is a per-line counter starting at 1,
// so successive edits of one line draw different patterns and two lines never share one.

// ========================================
// IMPORTS
// ========================================
import type { Rng } from './polygon';

// ========================================
// TYPES
// ========================================
/** One dip to FLICKER_LOW: from `at` for `len` seconds, both measured from the window's start. */
export interface Blink {
  at: number;
  len: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Length of a flicker in seconds (intent "Flicker" row: "a two-second out-of-step flicker"). */
export const FLICKER_WINDOW = 2;

/** Inclusive blink-count range per flicker (sketch defaults blinksMin 3 / blinksMax 5). */
export const FLICKER_BLINKS: readonly [number, number] = [3, 5];

/** Nominal blink length in seconds (sketch default blinkLen 0.1). */
export const FLICKER_BLINK = 0.1;

/** Per-blink length jitter, multiplying FLICKER_BLINK (sketch: `len * range(R, 0.7, 1.3)`). */
export const FLICKER_BLINK_JITTER: readonly [number, number] = [0.7, 1.3];

/** Strip opacity multiplier inside a blink (sketch default blinkLow 0: the strip goes fully dark). */
export const FLICKER_LOW = 0;

// ========================================
// HELPERS
// ========================================
function range(R: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * R();
}

// ========================================
// PATTERN
// ========================================
/** 3–5 blinks, sorted by `at`, every one wholly inside [0, FLICKER_WINDOW]. The jittered length is
 *  drawn first so `at` can be placed in [0, WINDOW − len] and the blink never overruns the window. */
export function flickerPattern(R: Rng): Blink[] {
  const [minBlinks, maxBlinks] = FLICKER_BLINKS;
  const [jitterLo, jitterHi] = FLICKER_BLINK_JITTER;
  const count = Math.round(range(R, minBlinks, maxBlinks));
  const pattern: Blink[] = [];
  for (let i = 0; i < count; i++) {
    const len = FLICKER_BLINK * range(R, jitterLo, jitterHi);
    pattern.push({ at: range(R, 0, FLICKER_WINDOW - len), len });
  }
  return pattern.sort((a, b) => a.at - b.at);
}

/** Opacity multiplier at `t` seconds into the window: FLICKER_LOW inside a blink (half-open
 *  [at, at + len)), else 1; always 1 at and after FLICKER_WINDOW and before 0. */
export function flickerGain(pattern: readonly Blink[], t: number): number {
  if (t < 0 || t >= FLICKER_WINDOW) return 1;
  return pattern.some((b) => t >= b.at && t < b.at + b.len) ? FLICKER_LOW : 1;
}
