/**
 * Global audio settings types.
 * All fields are JSON-serializable primitives suitable for Zustand storage.
 */

import type { NoteValue } from '@/data/noteValues';

export interface ReverbSettings {
  /** seconds (0.1 - 10) */
  decay: number;
  /** seconds (0 - 1) */
  preDelay: number;
  /** 0 - 1 */
  wet: number;
}

/** The Delay Time control's full range, which is also the delay node's real cap: globalFx.ts builds
 *  the node with `maxDelay: 10`, so the two must move together. */
export const DELAY_TIME_RANGE_SECONDS = { min: 0, max: 10 } as const;
/** The Delay Time slider's draggable step; also the grid a Sync -> Free conversion quantises onto. */
export const DELAY_TIME_STEP_SECONDS = 0.001;

export interface DelaySettings {
  /** seconds, DELAY_TIME_RANGE_SECONDS. The Free value — read the effective time through
   *  resolveDelayTimeSeconds() (utils/tempoSync.ts), never directly. */
  delayTime: number;
  /** 0 - 0.95 */
  feedback: number;
  /** 0 - 1 */
  wet: number;
  /** Present = Sync (Anchored): `delayTime` is ignored and the delay runs at this note value's
   *  duration at the current tempo. Absent = Free (Float). Docs/specs/FREE_SYNC_TOGGLE.md §1.1. */
  sync?: NoteValue;
}

export interface CompressorSettings {
  /** dB (-60 - 0) */
  threshold: number;
  /** 1 - 20 */
  ratio: number;
  /** seconds (0.001 - 0.2) */
  attack: number;
  /** seconds (0.01 - 1) */
  release: number;
  /** dB (0 - 40) */
  knee: number;
}

export interface EQ3Settings {
  /** dB (-12 - 12) */
  low: number;
  /** dB (-12 - 12) */
  mid: number;
  /** dB (-12 - 12) */
  high: number;
}

export type FilterType = 'lowpass' | 'highpass';

export interface FilterSettings {
  type: FilterType;
  /** Hz (20 - 20000) */
  frequency: number;
  /** Q (0.1 - 20) */
  Q: number;
}

export interface LimiterSettings {
  /** dB (-20 - 0) — Tone.Limiter's only controllable param; wraps a fixed ratio=20/attack=0.003/release=0.01 Compressor internally. */
  threshold: number;
}

/**
 * Top-level global audio settings: single source of truth for FX state.
 */
export interface GlobalAudioSettings {
  /** false = Natural Decay (Compressor after Delay+Reverb, tails ring out uncompressed).
   *  true = Controlled Decay (Compressor moved before both Delay and Reverb). Not seeded —
   *  always starts false; only a direct user toggle changes it. */
  compressorBeforeDelay: boolean;
  reverb: ReverbSettings;
  delay: DelaySettings;
  compressor: CompressorSettings;
  eq3: EQ3Settings;
  /** Low-pass filter — AudioEngine builds this as its own Tone.Filter node (`_globalLPF`), independent of filterHPF. */
  filterLPF: FilterSettings;
  /** High-pass filter — AudioEngine builds this as its own Tone.Filter node (`_globalHPF`), independent of filterLPF. */
  filterHPF: FilterSettings;
  limiter: LimiterSettings;
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  compressorBeforeDelay: false,
  reverb: { decay: 1.5, preDelay: 0.02, wet: 0.3 },
  delay: { delayTime: 0.25, feedback: 0.2, wet: 0.15 },
  compressor: { threshold: -24, ratio: 2, attack: 0.003, release: 0.25, knee: 6 },
  eq3: { low: 0, mid: 0, high: 0 },
  filterLPF: { type: 'lowpass', frequency: 20000, Q: 1 },
  filterHPF: { type: 'highpass', frequency: 20, Q: 1 },
  limiter: { threshold: -12 },
};
