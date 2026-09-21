// ========================================
// IMPORTS
// ========================================
// Constants only — no Tone, no stores — so audioContextSetup can use this before any Tone node exists.
import {
  AUDIO_LOAD_PRESETS,
  LOAD_AUDIBLE_ROBOTS_MIN,
  LOAD_DRIFT_MIN,
  LOAD_FILTER_LFOS_MIN,
  LOAD_PLAYBACK_BELOW,
  LOAD_POLYPHONY_MIN,
  MAX_POLYPHONY,
  MAX_ROBOTS,
  ROBOT_LFO_CAP_CEILING,
  ROBOT_LFO_CAP_LIGHT,
  ROBOT_LFO_CAP_STANDARD,
} from '../constants';

// ========================================
// TYPES
// ========================================

/** The two Web Audio latency categories the budget chooses between. */
export type LoadLatencyHint = 'playback' | 'interactive';

/** Every cap the Audio Load dial sets (docs/specs/AUDIO_LOAD_BUDGET.md §4.1). */
export interface LoadLimits {
  /** How many robots may sound at once (LOAD_AUDIBLE_ROBOTS_MIN..MAX_ROBOTS). */
  maxAudibleRobots: number;
  /** Simultaneous-note ceiling (LOAD_POLYPHONY_MIN..MAX_POLYPHONY). */
  maxPolyphony: number;
  /** Drift ("stacked" LFOs). */
  driftEnabled: boolean;
  /** Global lpf/hpf frequency + Q LFOs (EQ-gain LFOs are always allowed). */
  filterLfosEnabled: boolean;
  /** Audio-rate robot LFOs connected at once; Infinity only at exactly Full. */
  maxRobotLfos: number;
  /** Only meaningful at page load — a context's latencyHint is fixed at creation. */
  latencyHint: LoadLatencyHint;
}

// ========================================
// HELPERS
// ========================================

/** Clamp to the dial's 0–1 range; NaN is Full, the safe "today's behavior" default. */
function clampLoad(audioLoad: number): number {
  if (Number.isNaN(audioLoad)) return AUDIO_LOAD_PRESETS.full;
  return Math.min(1, Math.max(0, audioLoad));
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/**
 * Robot-LFO cap: flat at Light's below Light, 4 → 12 between Light and Standard, then climbing to a finite
 * ceiling just short of Full — Infinity only at exactly Full, so anything short of Full is still bounded.
 */
function robotLfoCap(load: number): number {
  const { light, standard, full } = AUDIO_LOAD_PRESETS;
  if (load >= full) return Infinity;
  if (load <= light) return ROBOT_LFO_CAP_LIGHT;
  if (load <= standard) {
    return Math.round(lerp(ROBOT_LFO_CAP_LIGHT, ROBOT_LFO_CAP_STANDARD, (load - light) / (standard - light)));
  }
  return Math.round(lerp(ROBOT_LFO_CAP_STANDARD, ROBOT_LFO_CAP_CEILING, (load - standard) / (full - standard)));
}

// ========================================
// FUNCTIONS
// ========================================

/** One dial in, every cap out — linear for the counts, thresholds for the booleans. */
export function loadToLimits(audioLoad: number): LoadLimits {
  const load = clampLoad(audioLoad);
  return {
    maxAudibleRobots: Math.round(lerp(LOAD_AUDIBLE_ROBOTS_MIN, MAX_ROBOTS, load)),
    maxPolyphony: Math.round(lerp(LOAD_POLYPHONY_MIN, MAX_POLYPHONY, load)),
    driftEnabled: load >= LOAD_DRIFT_MIN,
    filterLfosEnabled: load >= LOAD_FILTER_LFOS_MIN,
    maxRobotLfos: robotLfoCap(load),
    latencyHint: load < LOAD_PLAYBACK_BELOW ? 'playback' : 'interactive',
  };
}

/** The latency hint for a dial position (used at page load, before any Tone node exists). */
export function latencyForLoad(audioLoad: number): LoadLatencyHint {
  return loadToLimits(audioLoad).latencyHint;
}

const PRESET_NAMES = Object.keys(AUDIO_LOAD_PRESETS) as Array<keyof typeof AUDIO_LOAD_PRESETS>;
const PERCENT = /^\d+(\.\d+)?$/;

/**
 * Parse a `?load=` URL param: a preset name (light|standard|full, case-insensitive) or a percent from
 * 0 to 100. Anything else — including an empty value — returns `null`, i.e. "not pinned".
 */
export function parseLoadParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  const preset = PRESET_NAMES.find((name) => name === value);
  if (preset) return AUDIO_LOAD_PRESETS[preset];
  if (!PERCENT.test(value)) return null;
  const percent = Number(value);
  return percent <= 100 ? percent / 100 : null;
}

/**
 * The `?load=` value for a dial position: a preset's name when the value rounds to that preset's
 * percent, otherwise a whole percent. `parseLoadParam(loadToSearchParam(x))` gives back x to the percent.
 */
export function loadToSearchParam(audioLoad: number): string {
  const percent = Math.round(clampLoad(audioLoad) * 100);
  const preset = PRESET_NAMES.find((name) => Math.round(AUDIO_LOAD_PRESETS[name] * 100) === percent);
  return preset ?? String(percent);
}

/** Phone-like devices (a coarse primary pointer) default to Light; everything else to Full (decision D). */
export function detectDefaultAudioLoad(env: { coarsePointer: boolean }): number {
  return env.coarsePointer ? AUDIO_LOAD_PRESETS.light : AUDIO_LOAD_PRESETS.full;
}

/** The dial position at page load: a valid `?load=` wins, otherwise device detection. */
export function resolveInitialAudioLoad(env: { search: string; coarsePointer: boolean }): number {
  const pinned = parseLoadParam(new URLSearchParams(env.search).get('load'));
  return pinned ?? detectDefaultAudioLoad(env);
}
