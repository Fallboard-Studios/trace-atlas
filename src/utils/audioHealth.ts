// ========================================
// IMPORTS
// ========================================
// (none — pure functions, no Tone/GSAP/DOM access; the runtime shell is src/engine/audioDiagnostics.ts)

// ========================================
// CONSTANTS
// ========================================

/** How often the diagnostics sampler runs. A diagnostic cadence, not musical timing. */
export const SAMPLE_INTERVAL_MS = 500;

/** Audio-clock seconds per wall second below which the clock counts as stalled (healthy is ~1.0). */
export const STALL_RATE_THRESHOLD = 0.5;

/** A sampler tick this many ms later than scheduled is logged as a main-thread stall. */
export const LAG_EVENT_THRESHOLD_MS = 500;

/** Events kept in the on-screen log (oldest dropped first). */
export const MAX_EVENTS = 8;

// ========================================
// TYPES
// ========================================

/** One reading taken by the sampler. `frames` is a cumulative count of GSAP ticker ticks. */
export interface DiagSample {
  wallMs: number;
  ctxTime: number;
  ctxState: string;
  frames: number;
  hidden: boolean;
}

/** One analyser buffer, reduced. `peak` and `rms` are linear (0–1) and exclude non-finite samples. */
export interface LevelReading {
  peak: number;
  rms: number;
  /** How many NaN / ±Infinity samples the buffer held. */
  nonFinite: number;
}

export interface DiagEvent {
  /** Milliseconds since the diagnostics started. */
  atMs: number;
  text: string;
}

/** Plain, JSON-serialisable diagnostics state — no runtime objects. */
export interface DiagState {
  startWallMs: number;
  last: DiagSample | null;
  ctxState: string;
  /** Audio-clock seconds advanced per wall second over the last interval (null until two samples exist). */
  clockRate: number | null;
  /** GSAP ticker ticks per second over the last interval — 0 means the UI's animation loop stopped. */
  fps: number | null;
  /** How late the last sampler tick ran versus its schedule — a main-thread stall meter. */
  lagMs: number;
  maxLagMs: number;
  clockStalledSinceMs: number | null;
  framesStoppedSinceMs: number | null;
  events: DiagEvent[];
}

// ========================================
// FUNCTIONS
// ========================================

export function initDiagState(startWallMs: number): DiagState {
  return {
    startWallMs,
    last: null,
    ctxState: 'unknown',
    clockRate: null,
    fps: null,
    lagMs: 0,
    maxLagMs: 0,
    clockStalledSinceMs: null,
    framesStoppedSinceMs: null,
    events: [],
  };
}

/** Append an event, stamped relative to `startWallMs`, keeping only the newest MAX_EVENTS. */
export function noteDiagEvent(state: DiagState, wallMs: number, text: string): DiagState {
  const events = [...state.events, { atMs: wallMs - state.startWallMs, text }].slice(-MAX_EVENTS);
  return { ...state, events };
}

/**
 * Fold one sample into the state. Continuous readouts (clock rate, fps, lag) are recomputed every
 * sample; events are edge-triggered (one on entering a bad condition, one on leaving it) so a long
 * dropout produces two lines, not one per sample.
 *
 * AudioContext state *changes* are deliberately not logged here — the runtime shell logs those from
 * the context's own `statechange` event, which catches transient states a 500 ms poll would miss.
 */
export function stepDiag(state: DiagState, sample: DiagSample): DiagState {
  const previous = state.last;
  if (!previous) {
    return { ...state, last: sample, ctxState: sample.ctxState };
  }

  const dtMs = sample.wallMs - previous.wallMs;
  const dtSec = dtMs / 1000;
  const clockRate = dtSec > 0 ? (sample.ctxTime - previous.ctxTime) / dtSec : null;
  const fps = dtSec > 0 ? (sample.frames - previous.frames) / dtSec : null;
  const lagMs = Math.max(0, dtMs - SAMPLE_INTERVAL_MS);

  let next: DiagState = {
    ...state,
    last: sample,
    ctxState: sample.ctxState,
    clockRate,
    fps,
    lagMs,
    maxLagMs: Math.max(state.maxLagMs, lagMs),
  };

  // Audio clock stall: only meaningful while the context claims to be running — a suspended
  // context has a frozen clock by definition, and its state is already shown on its own.
  const clockStalled = sample.ctxState === 'running' && clockRate !== null && clockRate < STALL_RATE_THRESHOLD;
  if (clockStalled && next.clockStalledSinceMs === null) {
    next = noteDiagEvent(next, sample.wallMs, `audio clock stalled (x${(clockRate ?? 0).toFixed(2)})`);
    next.clockStalledSinceMs = previous.wallMs;
  } else if (!clockStalled && next.clockStalledSinceMs !== null) {
    const seconds = (previous.wallMs - next.clockStalledSinceMs) / 1000;
    next = noteDiagEvent(next, sample.wallMs, `audio clock recovered after ${seconds.toFixed(1)}s`);
    next.clockStalledSinceMs = null;
  }

  // A hidden tab has its timers and animation frames throttled by the browser — that is not a
  // stall of the app, so lag and frame events are suppressed while hidden.
  if (!sample.hidden) {
    if (lagMs >= LAG_EVENT_THRESHOLD_MS) {
      next = noteDiagEvent(next, sample.wallMs, `main thread stalled ~${Math.round(lagMs)} ms`);
    }

    const framesStopped = fps !== null && fps === 0;
    if (framesStopped && next.framesStoppedSinceMs === null) {
      next = noteDiagEvent(next, sample.wallMs, 'UI frames stopped');
      next.framesStoppedSinceMs = previous.wallMs;
    } else if (!framesStopped && next.framesStoppedSinceMs !== null) {
      next = noteDiagEvent(next, sample.wallMs, 'UI frames resumed');
      next.framesStoppedSinceMs = null;
    }
  }

  return next;
}

/** Milliseconds as `m:ss`. */
export function formatUptime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Peak, RMS and non-finite count of one analyser buffer (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md §4).
 * NaN and ±Infinity are counted but kept out of peak and RMS — one bad sample must not turn the
 * whole reading into NaN, because the point is to say *that* it went non-finite, not to lose the
 * level. RMS is over the finite samples only. An empty buffer has nothing to measure: `null`.
 */
export function measureLevel(samples: ArrayLike<number>): LevelReading | null {
  if (samples.length === 0) return null;

  let peak = 0;
  let sumSquares = 0;
  let finite = 0;
  let nonFinite = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (!Number.isFinite(value)) {
      nonFinite++;
      continue;
    }
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
    sumSquares += value * value;
    finite++;
  }
  return { peak, rms: finite > 0 ? Math.sqrt(sumSquares / finite) : 0, nonFinite };
}

/** A linear peak as dBFS; a zero peak is `-Infinity` (never NaN). */
export function peakToDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
