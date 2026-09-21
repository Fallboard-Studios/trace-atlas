// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import * as Tone from 'tone';

import { AudioEngine } from './AudioEngine';
import { useAudioStore } from '../stores/audioStore';
import { useLocaleStore } from '../stores/localeStore';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { loadToLimits } from '../utils/audioBudget';
import { isRobotAudible } from '../utils/robotAudibility';
import {
  SAMPLE_INTERVAL_MS,
  initDiagState,
  noteDiagEvent,
  stepDiag,
  type DiagState,
} from '../utils/audioHealth';

// ========================================
// TYPES
// ========================================

/** Live readouts gathered fresh on every sample (as opposed to the rate/event history in DiagState). */
export interface DiagInfo {
  latencyHint: string;
  lookAheadMs: number;
  baseLatencyMs: number | null;
  voices: number;
  maxVoices: number;
  transport: string;
  globalLfosOn: number;
  globalLfosTotal: number;
  /** Robots in the active locale that `isRobotAudible` lets sound right now (not muted / not solo-excluded). */
  audibleRobots: number;
  /** Size of the active locale's roster. 0 until robots have spawned. */
  totalRobots: number;
  /** The Audio Load dial, 0–1 (docs/specs/AUDIO_LOAD_BUDGET.md). NaN until the first sample. */
  audioLoad: number;
  /** Robots the budget currently lets sound (`soundingRobotIds`). */
  soundingRobots: number;
  /** The robot cap the dial allows (`loadToLimits(audioLoad).maxAudibleRobots`). */
  maxAudibleRobots: number;
}

export interface DiagSnapshot {
  timing: DiagState;
  info: DiagInfo;
}

// ========================================
// MODULE STATE (runtime-only — never in Zustand)
// ========================================
// Read-only diagnostics for `?debug` (docs/PERFORMANCE.md). Opt-in: nothing here runs, and nothing
// is constructed, unless the HUD calls startAudioDiagnostics(). It never writes to the audio graph.

const listeners = new Set<() => void>();
let refCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let statechangeTarget: { removeEventListener: (name: string, cb: () => void) => void } | null = null;
let onStatechange: (() => void) | null = null;
let frames = 0;
let onTick: (() => void) | null = null;

let timing: DiagState = initDiagState(0);
let snapshot: DiagSnapshot = { timing, info: emptyInfo() };

function emptyInfo(): DiagInfo {
  return {
    latencyHint: '?',
    lookAheadMs: 0,
    baseLatencyMs: null,
    voices: 0,
    maxVoices: 0,
    transport: '?',
    globalLfosOn: 0,
    globalLfosTotal: 0,
    audibleRobots: 0,
    totalRobots: 0,
    audioLoad: NaN,
    soundingRobots: NaN,
    maxAudibleRobots: NaN,
  };
}

// ========================================
// FUNCTIONS
// ========================================

type RawContext = {
  currentTime: number;
  state: string;
  baseLatency?: number;
  addEventListener?: (name: string, cb: () => void) => void;
  removeEventListener?: (name: string, cb: () => void) => void;
};

function readRawContext(): RawContext {
  return Tone.getContext().rawContext as unknown as RawContext;
}

const toMs = (seconds: number | undefined): number | null =>
  typeof seconds === 'number' && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;

/**
 * Audible robots in the active locale, read straight off the store at the sample tick (no
 * subscription, so the overlay's render cadence is unchanged). Same rule as the engine's
 * `triggerWithCap` gate: not muted, and not excluded by another robot's solo.
 */
function readRobotAudibility(): { audibleRobots: number; totalRobots: number } {
  const robots = useLocaleStore.getState().locales[getActiveLocaleId()]?.robots ?? [];
  const anySolo = robots.some((r) => r.audioMode === 'solo');
  return {
    audibleRobots: robots.filter((r) => isRobotAudible(r.audioMode, anySolo)).length,
    totalRobots: robots.length,
  };
}

function readInfo(): DiagInfo {
  const context = Tone.getContext();
  const raw = readRawContext();
  const poly = AudioEngine.getPolyphonyStats();
  const audio = useAudioStore.getState();
  const globalLfo = Object.values(audio.globalLfo) as Array<{ rate: number }>;
  return {
    latencyHint: String(context.latencyHint ?? '?'),
    lookAheadMs: Math.round(context.lookAhead * 1000),
    baseLatencyMs: toMs(raw.baseLatency),
    voices: poly.voices,
    maxVoices: poly.maxVoices,
    transport: Tone.getTransport().state,
    globalLfosOn: globalLfo.filter((l) => l.rate > 0).length,
    globalLfosTotal: globalLfo.length,
    ...readRobotAudibility(),
    audioLoad: audio.audioLoad,
    soundingRobots: audio.soundingRobotIds.length,
    maxAudibleRobots: loadToLimits(audio.audioLoad).maxAudibleRobots,
  };
}

function publish(): void {
  snapshot = { timing, info: readInfo() };
  for (const listener of listeners) listener();
}

function sample(): void {
  const raw = readRawContext();
  timing = stepDiag(timing, {
    wallMs: performance.now(),
    ctxTime: raw.currentTime,
    ctxState: raw.state,
    frames,
    hidden: typeof document !== 'undefined' && document.hidden,
  });
  publish();
}

/**
 * Start sampling. Ref-counted and idempotent: each call returns its own stop handle, and the
 * sampler tears down (interval, GSAP ticker callback, statechange listener) when the last one stops.
 *
 * The 500 ms `setInterval` is a diagnostic sampler, not musical timing — its *lateness* is the
 * main-thread-stall measurement. Frames are counted on GSAP's own ticker (no rAF loop of ours).
 */
export function startAudioDiagnostics(): () => void {
  refCount++;
  if (refCount === 1) {
    const raw = readRawContext();
    const startedAt = performance.now();
    frames = 0;
    timing = initDiagState(startedAt);

    onTick = () => { frames++; };
    gsap.ticker.add(onTick);

    // The context's own event catches transient states (e.g. 'interrupted') a 500 ms poll would miss.
    let previousState = raw.state;
    onStatechange = () => {
      const current = readRawContext().state;
      timing = noteDiagEvent(timing, performance.now(), `context ${previousState} → ${current}`);
      previousState = current;
      publish();
    };
    raw.addEventListener?.('statechange', onStatechange);
    statechangeTarget = raw as typeof statechangeTarget;

    intervalId = setInterval(sample, SAMPLE_INTERVAL_MS);
    sample();
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    refCount = Math.max(0, refCount - 1);
    if (refCount > 0) return;

    if (intervalId !== null) clearInterval(intervalId);
    intervalId = null;
    if (onTick) gsap.ticker.remove(onTick);
    onTick = null;
    if (onStatechange) statechangeTarget?.removeEventListener('statechange', onStatechange);
    onStatechange = null;
    statechangeTarget = null;
  };
}

/** The latest published snapshot. Reference-stable between samples (safe for useSyncExternalStore). */
export function getDiagnosticsSnapshot(): DiagSnapshot {
  return snapshot;
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
