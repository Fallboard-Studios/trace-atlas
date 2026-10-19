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
  /** 0 - 1. The room's RETURN level, not a wet/dry mix: the room itself is always fully wet and each
   *  robot's own send decides how much of that robot goes into it (docs/specs/ROBOT_SENDS.md §1.3). */
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
  /** 0 - 1. The echo's RETURN level, not a wet/dry mix - see ReverbSettings.wet. */
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

/** Drive: Tone.Distortion's waveshaper. Docs/specs/GLOBAL_COLOUR.md §1.1. */
export interface DistortionSettings {
  /** 0 - 1 (Tone's `distortion`) */
  amount: number;
  /** 0 - 1. A true wet/dry mix of this node (it sits in the dry chain, not on a send). */
  wet: number;
}

/** Harmonics: Tone.Chebyshev's polynomial waveshaper. */
export interface ChebyshevSettings {
  /** integer 1 - 8; 1 passes the signal unchanged */
  order: number;
  /** 0 - 1 */
  wet: number;
}

/** Bit Crush: Tone.BitCrusher (an AudioWorklet). */
export interface BitCrusherSettings {
  /** integer 1 - 16 */
  bits: number;
  /** 0 - 1 */
  wet: number;
}

/** The Phaser Rate control's full range (Hz), which is also the Free | Sync clamp. Zero is excluded: a
 *  stopped phaser is a fixed notch, not "off" - Mix 0 is off. Docs/specs/GLOBAL_MODULATION_COLOUR.md §1.1. */
export const PHASER_RATE_RANGE_HZ = { min: 0.05, max: 10 } as const;
/** The Phaser Rate slider's draggable step; also the grid a Sync -> Free conversion quantises onto. */
export const PHASER_RATE_STEP_HZ = 0.05;

/** Auto Wah: Tone.AutoWah, an envelope follower sweeping a bandpass. Docs/specs/GLOBAL_MODULATION_COLOUR.md §1.1. */
export interface AutoWahSettings {
  /** Hz (50 - 1000) - the filter at the bottom of the sweep */
  baseFrequency: number;
  /** 1 - 8 - how far above baseFrequency a loud note opens the filter */
  octaves: number;
  /** dB (-40 - 0) - lower = more sensitive (Tone boosts the follower's input) */
  sensitivity: number;
  /** 0.5 - 10 */
  Q: number;
  /** dB (0 - 20) - the peaking filter's boost */
  gain: number;
  /** seconds (0.01 - 1) - the envelope follower's smoothing */
  follower: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet), not wet itself. */
  wet: number;
}

/** Phaser: Tone.Phaser, a stack of allpass notches swept by its own wall-clock LFO. */
export interface PhaserSettings {
  /** Hz, PHASER_RATE_RANGE_HZ. Tone's `frequency`. The Free value - read the effective rate through
   *  resolvePhaserRateHz() (utils/tempoSync.ts), never directly. */
  rate: number;
  /** 0.5 - 6 */
  octaves: number;
  /** Hz (50 - 2000) */
  baseFrequency: number;
  /** integer 1 - 12. Constructor-only in Tone: a change rebuilds the node (spec §1.3). */
  stages: number;
  /** 0.5 - 20 */
  Q: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet), not wet itself. */
  wet: number;
  /** Present = Sync: `rate` is ignored and the LFO runs at this note value's Hz at the current tempo.
   *  Absent = Free. Never `sync: undefined`. Docs/specs/FREE_SYNC_TOGGLE.md §1.1. */
  sync?: NoteValue;
}

/** The Rate range every synced pedal (Phaser, Chorus, Tremolo, Vibrato) shares, which is also each one's Free | Sync
 *  clamp. The Phaser's constants under a generic name, re-exported rather than duplicated (docs/specs/GLOBAL_PEDALS.md
 *  assumption 5). */
export const PEDAL_RATE_RANGE_HZ = PHASER_RATE_RANGE_HZ;
/** The pedal Rate sliders' draggable step; also the grid a Sync -> Free conversion quantises onto. */
export const PEDAL_RATE_STEP_HZ = PHASER_RATE_STEP_HZ;

/** Chorus: Tone.Chorus, two LFO-swept delay lines (a flanger with feedback). Docs/specs/GLOBAL_PEDALS.md §1.1. */
export interface ChorusSettings {
  /** Hz, PEDAL_RATE_RANGE_HZ. Tone's `frequency`. The Free value - read the effective rate through
   *  resolveSyncedRateHz() (utils/tempoSync.ts), never directly. */
  rate: number;
  /** ms (1 - 20) - the delay lines' centre */
  delayTime: number;
  /** 0 - 1 - how far the LFOs move the delay */
  depth: number;
  /** degrees (0 - 180) - the right LFO's phase offset from the left */
  spread: number;
  /** 0 - 0.9 - Tone's `feedback` Signal; above 0 the chorus is a flanger */
  feedback: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet), not wet itself. */
  wet: number;
  /** Present = Sync, absent = Free. Never `sync: undefined`. Docs/specs/FREE_SYNC_TOGGLE.md §1.1. */
  sync?: NoteValue;
}

/** Tremolo: Tone.Tremolo, LFO-swept amplitude inverted per channel. */
export interface TremoloSettings {
  /** Hz, PEDAL_RATE_RANGE_HZ. Tone's `frequency`; the Free value, read through resolveSyncedRateHz(). */
  rate: number;
  /** 0 - 1 */
  depth: number;
  /** degrees (0 - 180) */
  spread: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet). */
  wet: number;
  /** Present = Sync, absent = Free. Never `sync: undefined`. */
  sync?: NoteValue;
}

/** Vibrato: Tone.Vibrato, an LFO-swept short delay (pitch wobble). Mono: it sums the stereo chain. */
export interface VibratoSettings {
  /** Hz, PEDAL_RATE_RANGE_HZ. Tone's `frequency`; the Free value, read through resolveSyncedRateHz(). */
  rate: number;
  /** 0 - 1, of Tone's default maxDelay (0.005 s) */
  depth: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet). */
  wet: number;
  /** Present = Sync, absent = Free. Never `sync: undefined`. */
  sync?: NoteValue;
}

/** Frequency Shifter: Tone.FrequencyShifter, single-sideband ring modulation. Mono. */
export interface FrequencyShifterSettings {
  /** Hz (-1000 - 1000), signed. Tone's `frequency`: every partial moves by the same Hz. */
  shift: number;
  /** 0 - 1, a slider position: the node is given colourWetGain(wet). */
  wet: number;
}

/** Width: Tone.StereoWidener, a mid/side stage between the Compressor and the Limiter. */
export interface StereoWidenerSettings {
  /** 0 - 1. Tone's `width` Signal: 0.5 is unity (as recorded), 0 is mono, 1 is all side. Never tapered. */
  width: number;
}

export interface LimiterSettings {
  /** dB (-20 - 0) — Tone.Limiter's only controllable param; wraps a fixed ratio=20/attack=0.003/release=0.01 Compressor internally. */
  threshold: number;
}

/**
 * Top-level global audio settings: single source of truth for FX state.
 */
export interface GlobalAudioSettings {
  /** false = Natural Decay (the Reverb and Delay returns rejoin at the Compressor's input, so their echoes are compressed).
   *  true = Controlled Decay (the returns rejoin at the Limiter's input, so their echoes skip the Compressor). Not seeded —
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
  /** Colour slot, in chain order between the High-Pass Filter and the Compressor (docs/specs/GLOBAL_COLOUR.md §1.3). */
  distortion: DistortionSettings;
  chebyshev: ChebyshevSettings;
  bitCrusher: BitCrusherSettings;
  /** Modulation slot, in chain order after Colour (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.3). */
  autoWah: AutoWahSettings;
  phaser: PhaserSettings;
  /** Motion pedals, in chain order after the Phaser (docs/specs/GLOBAL_PEDALS.md §1.3). */
  chorus: ChorusSettings;
  tremolo: TremoloSettings;
  vibrato: VibratoSettings;
  frequencyShifter: FrequencyShifterSettings;
  /** Width stage between the Compressor and the Limiter, after the rooms' join (docs/specs/GLOBAL_PEDALS.md §1.3). */
  stereoWidener: StereoWidenerSettings;
  limiter: LimiterSettings;
}

export const DEFAULT_GLOBAL_AUDIO_SETTINGS: GlobalAudioSettings = {
  compressorBeforeDelay: false,
  // `wet` is each room's return level and defaults to full (1): a robot's own send sets how much goes in.
  reverb: { decay: 1.5, preDelay: 0.02, wet: 1 },
  delay: { delayTime: 0.25, feedback: 0.2, wet: 1 },
  compressor: { threshold: -24, ratio: 2, attack: 0.003, release: 0.25, knee: 6 },
  eq3: { low: 0, mid: 0, high: 0 },
  filterLPF: { type: 'lowpass', frequency: 20000, Q: 1 },
  filterHPF: { type: 'highpass', frequency: 20, Q: 1 },
  // Colour is dry by default (every `wet` 0); a fresh world's seed lights at most a couple of nodes.
  distortion: { amount: 0.3, wet: 0 },
  chebyshev: { order: 2, wet: 0 },
  bitCrusher: { bits: 8, wet: 0 },
  // Modulation is dry by default too, at Tone's own parameter defaults (spec assumption 10). No `sync` key: Free.
  autoWah: { baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.2, wet: 0 },
  phaser: { rate: 0.5, octaves: 3, baseFrequency: 350, stages: 10, Q: 10, wet: 0 },
  // Global Pedals: Tone's defaults, every Mix 0 and Width at unity, so a default world is unchanged
  // (docs/specs/GLOBAL_PEDALS.md assumption 10). No `sync` key: Free.
  chorus: { rate: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, feedback: 0, wet: 0 },
  tremolo: { rate: 10, depth: 0.5, spread: 180, wet: 0 },
  vibrato: { rate: 5, depth: 0.1, wet: 0 },
  frequencyShifter: { shift: 0, wet: 0 },
  stereoWidener: { width: 0.5 },
  limiter: { threshold: -12 },
};

/**
 * Fills any effect block a payload lacks from DEFAULT_GLOBAL_AUDIO_SETTINGS and drops keys it does not
 * know. A session or share link saved before a block existed therefore loads with that block at its
 * default (dry, for colour) instead of crashing `applyGlobalAudioToEngine`. Blocks are whole: a block that
 * is present is kept as given and never deep-merged (docs/specs/GLOBAL_COLOUR.md §1.1, assumption 11).
 */
export function withGlobalAudioDefaults(partial: Partial<GlobalAudioSettings>): GlobalAudioSettings {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_GLOBAL_AUDIO_SETTINGS) as (keyof GlobalAudioSettings)[]) {
    result[key] = partial[key] ?? structuredClone(DEFAULT_GLOBAL_AUDIO_SETTINGS[key]);
  }
  return result as unknown as GlobalAudioSettings;
}
