// ========================================
// IMPORTS
// ========================================
import { devWarn } from '../utils/helpers';
import { BEATS_PER_MEASURE } from '../constants';
import { generateUUID } from '../utils/randomId';

// Minimal transport-like interface to avoid importing Tone.js here.
interface TransportLike {
  // Tone.Transport.position can be a Tone.Time (string/number-like), accept unknown
  position?: unknown;
  /** Tone hands each callback the audio-clock time (seconds) the tick is FOR, about `lookAhead` ahead of now. */
  scheduleRepeat(callback: (time: number) => void, interval: string, startTime?: unknown): string | number;
  clear(id: string | number): void;
  /** Tone's Transport converts a musical time ('16n') to seconds at the live tempo. */
  toSeconds?(time: string): number;
}

// Transport instance is provided by AudioEngine to avoid importing Tone here.
let transportInstance: TransportLike | null = null;

// ========================================
// INTERNAL STATE
// ========================================
let currentBeat = 0;
let currentMeasure = 0;
let lastNotifiedMeasure = -1;
let initialized = false;
// Internal transport tick id for the 16n scheduler so we can clear it on reset
let internalTickId: string | number | null = null;
/** Map of scheduleId -> schedule entry. Stores pending schedules when transport is not yet available. */
const scheduleMap = new Map<string, { transportId?: string | number; interval: string; callback: (time: number) => void }>();
const measureListeners: Array<(measure: number) => void> = [];

// ========================================
// BEATCLOCK API
// ========================================

/**
 * Initializes beat tracking. Should be called after Transport starts.
 */
export function initBeatClock(transport?: TransportLike): void {
  if (initialized) return;
  if (!transport) {
    throw new Error('initBeatClock requires a transport instance. Call initBeatClock(transport) from AudioEngine or tests.');
  }
  transportInstance = transport;
  const transportLocal = transportInstance as TransportLike;
  // Register a 16n tick and remember its id so we can clear it on reset
  internalTickId = transportLocal.scheduleRepeat(() => {
    const { measure, beat, sixteenths } = parseTransportPosition(transportLocal.position);
    currentBeat = measure * BEATS_PER_MEASURE + beat + sixteenths / 4;
    currentMeasure = measure;
    if (currentMeasure !== lastNotifiedMeasure) {
      lastNotifiedMeasure = currentMeasure;
      measureListeners.forEach(fn => {
        try {
          fn(currentMeasure);
        } catch (err) {
          devWarn('[BeatClock] measure listener threw', err);
        }
      });
    }
  }, '16n');
  initialized = true;
  // Register any schedules that were requested before transport initialization
  scheduleMap.forEach((entry, scheduleId) => {
    if (entry.transportId === undefined) {
      try {
        const transportId = transportLocal.scheduleRepeat((time) => {
          entry.callback(time);
        }, entry.interval, entry.interval);
        entry.transportId = transportId;
      } catch (err) {
        devWarn('[BeatClock] Failed to register pending schedule:', scheduleId, err);
      }
    }
  });
}

// exported for testing
export function parseTransportPosition(rawPosition: unknown): { measure: number; beat: number; sixteenths: number } {
  const pos = String(rawPosition).split(':');
  return {
    measure: parseInt(pos[0], 10) || 0,
    beat: parseInt(pos[1], 10) || 0,
    sixteenths: parseInt(pos[2], 10) || 0,
  };
}

/**
 * Register a callback to be fired once per measure change.
 * The callback receives the real, monotonic measure count (the same value as
 * `getCurrentMeasure()`); it never wraps.
 * Safe to call before or after initialization.
 *
 * @param callback - Called with the new measure on each measure tick.
 */
export function subscribeToMeasure(callback: (measure: number) => void): () => void {
  measureListeners.push(callback);
  return () => {
    const idx = measureListeners.indexOf(callback);
    if (idx !== -1) measureListeners.splice(idx, 1);
  };
}

/**
 * Returns the current beat (float, 0-based)
 */
export function getCurrentBeat(): number {
  return currentBeat;
}

/**
 * Returns the current measure (integer, 0-based)
 */
export function getCurrentMeasure(): number {
  return currentMeasure;
}

/**
 * Returns the current measure as a continuous float (unwrapped, sub-measure
 * precision) — e.g. 12.75 is three-quarters through measure 12. Derived from
 * `getCurrentBeat()`. For callers needing finer-than-once-per-measure
 * resolution (e.g. audioSwells.ts's 16n advance tick) without re-deriving
 * BEATS_PER_MEASURE themselves. Monotonic like `getCurrentMeasure()` — nothing
 * wraps it.
 */
export function getCurrentMeasurePrecise(): number {
  return currentBeat / BEATS_PER_MEASURE;
}

/**
 * One tick's length in seconds: a `16n` at the live tempo, read on every call so a tempo change reaches the next
 * write. A timed per-tick write glides over it into the next tick (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2).
 * Undefined with no transport, a transport that cannot convert, or a length that is not finite and positive.
 */
export function getTickSeconds(): number | undefined {
  const seconds = transportInstance?.toSeconds?.('16n');
  return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/**
 * Schedule a callback to repeat at the given musical interval.
 * Registers with Tone.Transport and stores the event ID for later cancellation via cancelSchedule.
 * @param interval - Tone.js time notation, e.g. '4m', '8n', '60m'
 * @param callback - Called on each interval tick with the Transport's `time` for that tick, in seconds on the audio
 *   clock (docs/specs/BEATCLOCK_TRANSPORT_TIME.md). A consumer that reaches Tone places its writes at it; reaching
 *   Tone with no time from inside the callback lands "now", up to `lookAhead` early, and Tone warns.
 * @returns A schedule ID that can be passed to cancelSchedule
 */
export function scheduleRepeat(interval: string, callback: (time: number) => void): string {
  const scheduleId = `schedule-${generateUUID()}`;

  // If transport isn't ready, persist the requested interval+callback so it
  // can be registered once initBeatClock provides the transport instance.
  if (!transportInstance) {
    scheduleMap.set(scheduleId, { interval, callback });
    return scheduleId;
  }

  // Pass interval as startTime so the first tick fires after one full interval,
  // not at T=0 when Transport starts.
  const transportId = transportInstance.scheduleRepeat((time) => {
    callback(time);
  }, interval, interval);

  scheduleMap.set(scheduleId, { transportId, interval, callback });

  return scheduleId;
}

/**
 * Cancel a previously scheduled repeating event.
 * Clears the event from Tone.Transport and removes it from the internal schedule map.
 * @param scheduleId - ID returned by scheduleRepeat
 */
export function cancelSchedule(scheduleId: string): void {
  const entry = scheduleMap.get(scheduleId);
  if (entry === undefined) {
    return;
  }

  // If transport isn't initialized or this entry was never registered with the
  // transport, just remove it from the map.
  if (!transportInstance || entry.transportId === undefined) {
    scheduleMap.delete(scheduleId);
    return;
  }

  try {
    transportInstance.clear(entry.transportId);
  } catch (err) {
    devWarn('[BeatClock] cancelSchedule: failed to clear transport id', entry.transportId, err);
  }
  scheduleMap.delete(scheduleId);
}

/**
 * Reset BeatClock state so initBeatClock() will re-register the internal
 * 16n tick on the next AudioEngine.start() call.
 * Call from AudioEngine.killAll() after transport.cancel() has cleared
 * the old tick events.
 */
export function resetBeatClock(): void {
  initialized = false;

  if (internalTickId !== null) {
    try {
      transportInstance?.clear(internalTickId);
    } catch (err) {
      devWarn('[BeatClock] reset: failed to clear internal tick', err);
    }
    internalTickId = null;
  }

  // Attempt to clear any transport-registered schedules owned by this module
  scheduleMap.forEach((entry) => {
    if (entry.transportId !== undefined) {
      try {
        transportInstance?.clear(entry.transportId);
      } catch (err) {
        devWarn('[BeatClock] reset: failed to clear schedule', err);
      }
    }
  });
  scheduleMap.clear();

  // Null the transport reference so scheduleRepeat() doesn't register events
  // against a stale/cancelled transport between reset and the next initBeatClock().
  transportInstance = null;

  // Reset position counters so getters don't return stale values before the
  // first 16n tick fires after re-initialization.
  currentBeat = 0;
  currentMeasure = 0;
  lastNotifiedMeasure = -1;

  // Clear listeners — stale subscribers from a previous session would otherwise
  // fire on the new session's measure ticks.
  measureListeners.length = 0;
}
