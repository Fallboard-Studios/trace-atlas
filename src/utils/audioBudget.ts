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
import type { LfoTargetId } from '../types/lfo';

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

// ========================================
// ADMISSION — which robots sound when more are eligible than slots
// ========================================

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

function lastIndexWhere(ids: readonly string[], test: (id: string) => boolean): number {
  for (let i = ids.length - 1; i >= 0; i--) if (test(ids[i])) return i;
  return -1;
}

/**
 * The eligible robots in the order they became eligible: robots already queued keep their place, newly
 * eligible ones join the back in roster order, and robots that left drop out (so one that docks and
 * undocks re-queues at the back). This ordering is what makes admission first-come-first-served —
 * `reconcileSounding` only ever sees the result. Returns `previousOrder` itself when nothing changed.
 */
export function orderByArrival(previousOrder: readonly string[], eligibleNow: readonly string[]): readonly string[] {
  const eligible = unique(eligibleNow);
  const eligibleSet = new Set(eligible);
  const kept = previousOrder.filter((id) => eligibleSet.has(id));
  const keptSet = new Set(kept);
  const next = [...kept, ...eligible.filter((id) => !keptSet.has(id))];
  return sameOrder(next, previousOrder) ? previousOrder : next;
}

/**
 * First-come-first-served admission with solo priority (docs/specs/AUDIO_LOAD_BUDGET.md §1.3).
 * `previous` is the current sounding set in admission order; `eligible` is every robot `isRobotAudible`
 * allows, **in arrival order** (see `orderByArrival`); `soloIds` the soloed subset.
 *
 * Still-eligible members keep their slot; if the cap fell, the newest non-solo robots go first (then the
 * newest solo). Each eligible solo is then admitted — into a free slot, or by evicting the newest non-solo
 * robot, never another solo (a solo that finds only solos waits, first-come). Finally the remaining
 * eligible robots fill any free slots in arrival order, so a freed slot goes to the earliest waiter.
 * Returns `previous` itself (same reference) when nothing changed, so the caller can skip the store write.
 * A NaN cap means no cap.
 */
export function reconcileSounding(
  previous: readonly string[],
  eligible: readonly string[],
  soloIds: readonly string[],
  maxAudibleRobots: number,
): readonly string[] {
  const cap = Number.isNaN(maxAudibleRobots) ? Infinity : Math.max(0, Math.floor(maxAudibleRobots));
  const arrival = unique(eligible);
  const eligibleSet = new Set(arrival);
  const solo = new Set(soloIds.filter((id) => eligibleSet.has(id)));
  const isNonSolo = (id: string): boolean => !solo.has(id);

  const next = unique(previous).filter((id) => eligibleSet.has(id));

  while (next.length > cap) {
    const newestNonSolo = lastIndexWhere(next, isNonSolo);
    next.splice(newestNonSolo === -1 ? next.length - 1 : newestNonSolo, 1);
  }

  for (const id of arrival) {
    if (!solo.has(id) || next.includes(id)) continue;
    if (next.length >= cap) {
      const newestNonSolo = lastIndexWhere(next, isNonSolo);
      if (newestNonSolo === -1) continue; // every slot holds a solo — this one waits
      next.splice(newestNonSolo, 1);
    }
    next.push(id);
  }

  for (const id of arrival) {
    if (next.length >= cap) break;
    if (!next.includes(id)) next.push(id);
  }

  return sameOrder(next, previous) ? previous : next;
}

// ========================================
// LFO TIERS
// ========================================

const FILTER_TARGET = /^(lpf|hpf)\./;
const PHASE_TARGET = /^layer\d+\.phase$/;

/**
 * May this LFO be connected right now? EQ-gain global LFOs are always allowed (nearly free); the
 * filter-frequency/Q ones only when the dial enables them; a robot LFO only while fewer than
 * `maxRobotLfos` audio-rate robot LFOs are connected. `connectedRobotLfos` counts those already connected,
 * not including the one being asked about. `layerN.phase` LFOs are never counted or refused — they poll
 * at control rate (lfoEngine's phase fallback), not as an audio-rate connection.
 */
export function lfoAllowed(
  target: LfoTargetId,
  scope: 'global' | 'robot',
  limits: LoadLimits,
  connectedRobotLfos: number,
): boolean {
  if (scope === 'global') return FILTER_TARGET.test(target) ? limits.filterLfosEnabled : true;
  if (PHASE_TARGET.test(target)) return true;
  return connectedRobotLfos < limits.maxRobotLfos;
}
