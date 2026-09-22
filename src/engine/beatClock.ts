// ========================================
// IMPORTS
// ========================================
import { devWarn } from '../utils/helpers';
import { DAY_CYCLE_MEASURES } from '../constants';
import { generateUUID } from '../utils/randomId';

// Minimal transport-like interface to avoid importing Tone.js here.
interface TransportLike {
  // Tone.Transport.position can be a Tone.Time (string/number-like), accept unknown
  position?: unknown;
  scheduleRepeat(callback: (time?: unknown) => void, interval: string, startTime?: unknown): string | number;
  clear(id: string | number): void;
}

// Transport instance is provided by AudioEngine to avoid importing Tone here.
let transportInstance: TransportLike | null = null;

// ========================================
// CONSTANTS
// ========================================
const BEATS_PER_MEASURE = 4;
const MEASURES_PER_HOUR = 4;

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
const scheduleMap = new Map<string, { transportId?: string | number; interval: string; callback: () => void }>();
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
      const wrappedMeasure = currentMeasure % DAY_CYCLE_MEASURES;
      measureListeners.forEach(fn => {
        try {
          fn(wrappedMeasure);
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
        const transportId = transportLocal.scheduleRepeat((_time: unknown) => {
          entry.callback();
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
 * The callback receives the wrapped measure (0–95).
 * Safe to call before or after initialization.
 *
 * @param callback - Called with the new wrapped measure on each measure tick.
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
 * `getCurrentBeat()` the same way `getCurrentHour()` derives from
 * `getCurrentMeasure()`. For callers needing finer-than-once-per-measure
 * resolution (e.g. audioSwells.ts's 16n advance tick) without re-deriving
 * BEATS_PER_MEASURE themselves. Unwrapped like `getCurrentMeasure()` — never
 * the `% DAY_CYCLE_MEASURES`-wrapped value `subscribeToMeasure`'s own
 * callback argument carries.
 */
export function getCurrentMeasurePrecise(): number {
  return currentBeat / BEATS_PER_MEASURE;
}

/**
 * Returns the derived hour (0-23) from current measure position.
 * 96 measures = 1 full day cycle, 4 measures = 1 hour equivalent.
 */
export function getCurrentHour(): number {
  const derivedHour = Math.floor((currentMeasure % DAY_CYCLE_MEASURES) / MEASURES_PER_HOUR);
  return Math.max(0, Math.min(23, derivedHour));
}

/**
 * Schedule a callback to repeat at the given musical interval.
 * Registers with Tone.Transport and stores the event ID for later cancellation via cancelSchedule.
 * @param interval - Tone.js time notation, e.g. '4m', '8n', '60m'
 * @param callback - Called on each interval tick
 * @returns A schedule ID that can be passed to cancelSchedule
 */
export function scheduleRepeat(interval: string, callback: () => void): string {
  const scheduleId = `schedule-${generateUUID()}`;

  // If transport isn't ready, persist the requested interval+callback so it
  // can be registered once initBeatClock provides the transport instance.
  if (!transportInstance) {
    scheduleMap.set(scheduleId, { interval, callback });
    return scheduleId;
  }

  // Pass interval as startTime so the first tick fires after one full interval,
  // not at T=0 when Transport starts.
  const transportId = transportInstance.scheduleRepeat((_time: unknown) => {
    callback();
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
