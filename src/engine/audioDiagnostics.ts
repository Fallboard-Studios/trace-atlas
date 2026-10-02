// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import * as Tone from 'tone';

import { AudioEngine } from './AudioEngine';
import { attachOutputTaps, detachOutputTaps, getMasterVolume, readOutputTaps } from './audioEngine/globalFx';
import { useAudioStore } from '../stores/audioStore';
import { useLocaleStore } from '../stores/localeStore';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { robotLoadToLimits } from '../utils/audioBudget';
import { isRobotAudible } from '../utils/robotAudibility';
import { GLOBAL_LFO_TARGET_IDS, ROBOT_LFO_TARGET_IDS } from '../types/lfo';
import {
  SAMPLE_INTERVAL_MS,
  initDiagState,
  measureLevel,
  noteDiagEvent,
  stepDiag,
  type DiagState,
  type LevelReading,
  type PlaybackReading,
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
  /** docs/tasks/LFO_BANK.md Task 8: links (global-chain + every active robot's) whose lane is non-null,
   *  out of every linkable target. */
  linksOn: number;
  linksTotal: number;
  /** Count of the four LFO Bank lanes currently running (rate > 0), 0-4. */
  bankRunning: number;
  /** Robots in the active locale that `isRobotAudible` lets sound right now (not muted / not solo-excluded). */
  audibleRobots: number;
  /** Size of the active locale's roster. 0 until robots have spawned. */
  totalRobots: number;
  /** The Robot Load slider, 0–1 (docs/specs/AUDIO_LOAD_BUDGET.md). NaN until the first sample. */
  robotLoad: number;
  /** The Effects Load slider, 0–1. NaN until the first sample. */
  effectsLoad: number;
  /** Robots the budget currently lets sound (`soundingRobotIds`). */
  soundingRobots: number;
  /** The robot cap robotLoad allows (`robotLoadToLimits(robotLoad).maxAudibleRobots`). */
  maxAudibleRobots: number;
  /** Level of what the voices hand the FX chain (EQ3's output) in the last sample; null when that tap is not attached or has nothing to read. */
  outputPre?: LevelReading | null;
  /** Level of what the destination receives (masterGain's output) in the last sample; null likewise. */
  outputMaster?: LevelReading | null;
  /** The browser's playback statistics (`AudioContext.playbackStats`); null when the API is absent or unreadable. */
  playback?: PlaybackReading | null;
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

/** The output-tap readings from the latest sampler tick. Read once per tick (in `sample`), not per publish, so an
 *  AudioContext statechange never triggers a second read of a ~128 KB buffer. */
let outputLevels: { pre: LevelReading | null; master: LevelReading | null } = { pre: null, master: null };

/** The playback statistics from the latest sampler tick (null when the API is absent or unreadable). */
let playbackReading: PlaybackReading | null = null;

function emptyInfo(): DiagInfo {
  return {
    latencyHint: '?',
    lookAheadMs: 0,
    baseLatencyMs: null,
    voices: 0,
    maxVoices: 0,
    transport: '?',
    linksOn: 0,
    linksTotal: 0,
    bankRunning: 0,
    audibleRobots: 0,
    totalRobots: 0,
    robotLoad: NaN,
    effectsLoad: NaN,
    soundingRobots: NaN,
    maxAudibleRobots: NaN,
    outputPre: null,
    outputMaster: null,
    playback: null,
  };
}

// ========================================
// FUNCTIONS
// ========================================

type RawContext = {
  currentTime: number;
  state: string;
  baseLatency?: number;
  /** `AudioContext.playbackStats` — Chrome 146+; anything else may be absent, so it is read defensively. */
  playbackStats?: unknown;
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

/** Count of non-null-lane links in an LFO Bank link record (global or robot) — docs/tasks/LFO_BANK.md Task 8. */
function countLinkedTargets(links: Record<string, { lane: unknown }> | undefined): number {
  if (!links) return 0;
  return Object.values(links).filter((link) => link.lane !== null).length;
}

/**
 * linksOn/linksTotal across globalLfoLinks and every active robot's lfoLinks (docs/tasks/LFO_BANK.md
 * Task 8). Robot.lfoLinks itself arrives in Task 9 — the cast below reads undefined until then, so
 * every robot contributes its full ROBOT_LFO_TARGET_IDS slot count to linksTotal (those target slots
 * exist on every robot regardless of whether the bank has linked them yet) but nothing to linksOn.
 */
function readLfoLinkCounts(globalLfoLinks: Record<string, { lane: unknown }>): { linksOn: number; linksTotal: number } {
  const robots = useLocaleStore.getState().locales[getActiveLocaleId()]?.robots ?? [];
  let linksOn = countLinkedTargets(globalLfoLinks);
  let linksTotal = GLOBAL_LFO_TARGET_IDS.length;
  for (const robot of robots) {
    const lfoLinks = (robot as unknown as { lfoLinks?: Record<string, { lane: unknown }> }).lfoLinks;
    linksOn += countLinkedTargets(lfoLinks);
    linksTotal += ROBOT_LFO_TARGET_IDS.length;
  }
  return { linksOn, linksTotal };
}

/** Count of the four LFO Bank lanes currently running (rate > 0), 0-4. */
function readBankRunning(lfoBank: Record<string, { rate: number }>): number {
  return Object.values(lfoBank).filter((lane) => lane.rate > 0).length;
}

function readInfo(): DiagInfo {
  const context = Tone.getContext();
  const raw = readRawContext();
  const poly = AudioEngine.getPolyphonyStats();
  const audio = useAudioStore.getState();
  return {
    latencyHint: String(context.latencyHint ?? '?'),
    lookAheadMs: Math.round(context.lookAhead * 1000),
    baseLatencyMs: toMs(raw.baseLatency),
    voices: poly.voices,
    maxVoices: poly.maxVoices,
    transport: Tone.getTransport().state,
    ...readLfoLinkCounts(audio.globalLfoLinks),
    bankRunning: readBankRunning(audio.lfoBank),
    ...readRobotAudibility(),
    robotLoad: audio.robotLoad,
    effectsLoad: audio.effectsLoad,
    soundingRobots: audio.soundingRobotIds.length,
    maxAudibleRobots: robotLoadToLimits(audio.robotLoad).maxAudibleRobots,
    outputPre: outputLevels.pre,
    outputMaster: outputLevels.master,
    playback: playbackReading,
  };
}

function publish(): void {
  snapshot = { timing, info: readInfo() };
  for (const listener of listeners) listener();
}

/**
 * Tone's `rawContext` is a `standardized-audio-context` wrapper, not the browser's own AudioContext, and it does not
 * forward `playbackStats` (found in the real browser: the overlay read `underruns n/a` on Chrome 153). The wrapper
 * keeps the native context in TypeScript-private fields, so look there too — reading a private field of a
 * dependency is fragile, which is why every step is defensive and the worst case is `n/a`.
 */
const NATIVE_CONTEXT_FIELDS = ['_nativeAudioContext', '_nativeContext'] as const;

/** The first `playbackStats` object found on the context itself (a later wrapper may forward it) or on its native context. */
function findPlaybackStats(raw: RawContext): Record<string, unknown> | null {
  const holders: unknown[] = [raw, ...NATIVE_CONTEXT_FIELDS.map((key) => (raw as unknown as Record<string, unknown>)[key])];
  for (const holder of holders) {
    try {
      if (!holder || typeof holder !== 'object') continue;
      const stats = (holder as { playbackStats?: unknown }).playbackStats;
      if (stats && typeof stats === 'object') return stats as Record<string, unknown>;
    } catch {
      // A holder whose playbackStats cannot be read is skipped; the next one may still answer.
    }
  }
  return null;
}

/**
 * Read `AudioContext.playbackStats` without ever writing to it: null when the API is absent, the getter throws, or the
 * underrun count is not a finite number; any other unreadable field becomes NaN (the overlay shows a dash).
 * `resetLatency()` is deliberately never called — it would move the browser's own measurement interval.
 */
function readPlaybackStats(raw: RawContext): PlaybackReading | null {
  try {
    const stats = findPlaybackStats(raw);
    if (!stats) return null;
    const field = (key: string): number => {
      const value = stats[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
    };
    const underrunEvents = field('underrunEvents');
    if (Number.isNaN(underrunEvents)) return null;
    return {
      underrunEvents,
      underrunDuration: field('underrunDuration'),
      totalDuration: field('totalDuration'),
      averageLatency: field('averageLatency'),
      minimumLatency: field('minimumLatency'),
      maximumLatency: field('maximumLatency'),
    };
  } catch {
    return null;
  }
}

/**
 * Would silence be a fault right now, gaps between notes aside? Only when the master is not muted (its volume is
 * above 0), the transport is started and the context is running. Any one false and a silent master is expected.
 * Whether notes are in flight is reported separately (`notesSounding`), because a gap between notes must pause the
 * silent count, not restart it. Known false positive: a sounding robot whose own volume is 0 is genuine silence with
 * notes in flight — accepted for a debug tool.
 */
function expectSound(raw: RawContext): boolean {
  return getMasterVolume() > 0 && Tone.getTransport().state === 'started' && raw.state === 'running';
}

/** Reduce one tap's buffer to a reading; null when the tap gave nothing or the buffer is empty. */
function measureTap(buffer: Float32Array | null): LevelReading | null {
  return buffer ? measureLevel(buffer) : null;
}

function sample(): void {
  const taps = readOutputTaps();
  outputLevels = { pre: measureTap(taps.pre), master: measureTap(taps.master) };

  const raw = readRawContext();
  playbackReading = readPlaybackStats(raw);
  timing = stepDiag(timing, {
    wallMs: performance.now(),
    ctxTime: raw.currentTime,
    ctxState: raw.state,
    frames,
    hidden: typeof document !== 'undefined' && document.hidden,
    playback: playbackReading,
    master: outputLevels.master,
    pre: outputLevels.pre,
    expectSound: expectSound(raw),
    notesSounding: AudioEngine.getPolyphonyStats().voices > 0,
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
    outputLevels = { pre: null, master: null };
    playbackReading = null;
    attachOutputTaps();

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
    detachOutputTaps();
    outputLevels = { pre: null, master: null };
    playbackReading = null;
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
