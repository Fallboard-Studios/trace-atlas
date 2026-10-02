/**
 * Small, general-purpose helpers used by lfoEngine.ts — split out of that
 * file so it doesn't carry pure-math/connection utilities alongside its own
 * feature-specific exports.
 */

// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

// ========================================
// FUNCTIONS
// ========================================

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Whether it's safe to actually start an oscillator right now. Gates on the
 * AudioContext itself, not Transport state — Transport can still be mid-
 * startup (instrument loading, waiting on reverb) well after Tone.start()
 * has already made the context running, and gating on Transport left a real
 * window where an LFO could connect to a live target but never actually
 * start oscillating: Tone.LFO outputs a raw, undepth-scaled "stopped" value
 * (its waveform's value at its resting phase — not necessarily 0, e.g. for
 * square/sawtooth/triangle shapes) for as long as it never starts, which
 * gets summed straight into whatever it's connected to indefinitely.
 */
export function isAudioContextRunning(): boolean {
  try {
    return Tone.getContext().state === 'running';
  } catch {
    return false;
  }
}

/**
 * Convert a field's absolute range AND its current base value into the
 * ADDITIVE delta lfo.min/lfo.max should actually be set to.
 *
 * Tone.LFO.connect() sums onto the destination Param's existing value —
 * native Web Audio AudioParam behavior: connecting an input signal ADDS to
 * whatever the param's own intrinsic value already is, it never overrides
 * it. Using a field's raw absolute range (e.g. LPF frequency, 20-20000)
 * directly as lfo.min/lfo.max was a real bug: that adds up to +20000 Hz on
 * top of whatever the slider is already at, trivially pushing the actual
 * cutoff past Nyquist (filter wide open — an audible burst of unfiltered
 * harmonics) the instant the LFO connects.
 *
 * A first fix used a FIXED zero-centered swing (half the field's own total
 * span) — better, but still a constant, independent of where the base value
 * actually sits. That reintroduced the same bug from the other direction:
 * for a base value anywhere off-center (e.g. left low, as a workaround for
 * the original crash), a fixed swing still large enough to swing the OTHER
 * way pushed the combined value below the field's own minimum for roughly
 * half of every cycle — heard as the mix muting for half the time.
 *
 * The real fix: bound the swing by the base value's own distance to
 * whichever edge of the range is nearer — min(value - rangeMin, rangeMax -
 * value). Added to the base value, this can never leave [rangeMin, rangeMax]
 * in either direction, for any starting position. A value sitting exactly at
 * the range's own midpoint (both distances equal) still gets the same "half
 * the total span" swing as the simpler fixed version — no regression for
 * fields whose typical resting value already is the midpoint (EQ dB bands,
 * robot detune both default to 0, the center of a symmetric range).
 *
 * Reused unchanged for two swings in lfoEngine.ts: a link's lane-to-target
 * swing, and each lane's drift oscillator swing around its own current
 * rate/depth — same math, different base value and range.
 */
export function centeredSwingFromRange(
  range: { min: number; max: number },
  currentValue: number
): { min: number; max: number } {
  // A non-finite currentValue (NaN/Infinity — e.g. the resolved Signal not
  // actually initialized yet) must never reach lfo.min/lfo.max: connecting
  // an LFO whose output is NaN poisons the live Web Audio graph downstream
  // of whatever it's connected to, not just this one target. Fall back to
  // zero swing (the LFO contributes nothing) rather than propagate it.
  if (!Number.isFinite(currentValue)) return { min: 0, max: 0 };
  const distanceToMin = currentValue - range.min;
  const distanceToMax = range.max - currentValue;
  const halfSpan = Math.max(0, Math.min(distanceToMin, distanceToMax));
  return { min: -halfSpan, max: halfSpan };
}

/**
 * Connect `source` into a Signal/Param `destination` the additive-safe way:
 * disable the destination's Signal.override (a harmless no-op for a Param,
 * which has no override concept at all) before connecting, then restore its
 * pre-connect value afterward. Undoes the reset Tone's own connectSignal()
 * forces on ANY connect into a Signal/Param destination — verified directly
 * against Tone.js's own source (signal/Signal.ts); see
 * docs/AUDIO_SYSTEM.md's LFO Modulation section ("the worst LFO bug found
 * here") and connectLfoTarget's own longer comment in lfoEngine.ts for the
 * full story. The restore is a genuine fix for a Param destination (always
 * resets, unconditionally, no override escape hatch); a harmless no-op for
 * a Signal destination once override is disabled (its value was never
 * touched in the first place). Guards against a non-finite pre-connect
 * value the same way every caller already had to — never write NaN into a
 * live Web Audio graph.
 *
 * Deliberately does not catch a failed `.connect()` — a caller that needs to
 * handle that (e.g. linkTarget, whose target is resolved externally by
 * AudioEngine) wraps this call in its own try/catch; lfoEngine.ts's own
 * purely-internal drift connections don't.
 */
export function connectAdditively(source: unknown, destination: unknown): void {
  const dest = destination as { value: number; override?: boolean };
  dest.override = false;
  const currentValue = dest.value;
  (source as { connect: (d: unknown) => void }).connect(destination);
  if (Number.isFinite(currentValue)) dest.value = currentValue;
}
