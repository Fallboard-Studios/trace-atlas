/**
 * LFO modulation types, resolving docs/tasks/LFO_INTEGRATION_PLAN.md Task 7.
 * Target ids and bounds trace to the reference grids — see each export's
 * comment for its source row.
 */

// ========================================
// SHAPE
// ========================================

/**
 * LFO oscillator shapes. Per docs/reference/ROBOT_DATA_GRID.md's "LFO Shape"
 * row (OSCILLATION SHAPE, Radio Button): TRIANGLE, SINE, SQUARE, SAWTOOTH.
 * Lowercase, matching the Tone.js-style convention Robot.ts's WaveformType
 * already uses.
 */
export type LfoShape = 'triangle' | 'sine' | 'square' | 'sawtooth';

export const LFO_SHAPES: readonly LfoShape[] = ['triangle', 'sine', 'square', 'sawtooth'];

// ========================================
// ROBOT-LEVEL TARGETS
// ========================================

/**
 * Per-robot LFO modulation targets — the 6 targets
 * docs/reference/ROBOT_DATA_GRID.md flags `Has LFO: Yes`: each of the 3
 * oscillator layers' Gain (Saturation) and Detune (Drift). Was 13 until
 * 2026-09-30: 'volume' (Transducer Pressure Index) and the three
 * 'layerN.pulseWidth' targets were removed outright (docs/specs/
 * LFO_LOAD_FIX.md assumption 9 / §1.4 — volume wasn't impactful, pulse
 * width was the ≈7× cost outlier and only live on pulse-type layers). Was 9
 * until 2026-10-01: the three 'layerN.phase' targets were cut (docs/specs/
 * LFO_BANK.md Task 1) — Phase never had a live Signal to modulate (it ran a
 * control-rate polling fallback, the one target of the 9 that wasn't an
 * audio-rate connection); Phase stays a plain, non-modulatable slider. Every
 * removed id can still arrive as a string from an old session or share
 * link; the loaders drop them (sessionDiff.ts / sessionShareUtils.ts) and
 * the engine resolves them to null.
 */
export type RobotLfoTargetId =
  | 'layer0.gain'
  | 'layer0.detune'
  | 'layer1.gain'
  | 'layer1.detune'
  | 'layer2.gain'
  | 'layer2.detune';

export const ROBOT_LFO_TARGET_IDS: readonly RobotLfoTargetId[] = [
  'layer0.gain', 'layer0.detune',
  'layer1.gain', 'layer1.detune',
  'layer2.gain', 'layer2.detune',
];

// ========================================
// GLOBAL-CHAIN TARGETS
// ========================================

/**
 * Global-chain LFO modulation targets — the 7 targets
 * docs/reference/GLOBAL_CHAIN_GRID.md flags `LFO?: X`: EQ3 low/mid/high,
 * LPF frequency/Q, HPF frequency/Q. (Was 9, then 8 in V2 — Chorus and
 * 'chorus.delayTime' were removed entirely, the effect didn't suit this
 * music; 'delay.delayTime' was removed after that, LFO judged unwanted on
 * Delay's own time parameter. Delay itself is unaffected — its delayTime
 * still seeds/edits normally via GlobalAudioSeedFieldKey, an unrelated type;
 * only the LFO-modulation capability on that one param is gone.)
 *
 * Uses the 'lpf'/'hpf' short-form AudioEngine.setEffectBypass already uses
 * for its effect keys — not GlobalAudioSettings' filterLPF/filterHPF field
 * names — so target ids line up directly with the AudioEngine surface
 * Task 10 (getGlobalModulationTarget) will call into.
 */
export type GlobalLfoTargetId =
  | 'eq3.low'
  | 'eq3.mid'
  | 'eq3.high'
  | 'lpf.frequency'
  | 'lpf.Q'
  | 'hpf.frequency'
  | 'hpf.Q';

export const GLOBAL_LFO_TARGET_IDS: readonly GlobalLfoTargetId[] = [
  'eq3.low', 'eq3.mid', 'eq3.high',
  'lpf.frequency', 'lpf.Q',
  'hpf.frequency', 'hpf.Q',
];

// ========================================
// COMBINED TARGET ID
// ========================================

/**
 * Every target an LFO can connect to, robot-scoped or global-chain. Shared
 * between lfoEngine.ts (the primary-LFO registry) and lfoDrift.ts (the drift
 * subsystem attached to it) — defined here so neither has to import it from
 * the other.
 */
export type LfoTargetId = RobotLfoTargetId | GlobalLfoTargetId;

// ========================================
// DRIFT GROUPS
// ========================================

/**
 * The 2 independent LFO drift groups (docs/specs/FLEET_DRIFT_CONSOLIDATION.md
 * — restructured from the 4-group docs/specs/archive/LFO_DRIFT_GROUPS.md) —
 * every connected primary LFO belongs to exactly one, determined by its own
 * target id (see lfoDrift.ts's driftGroupForTarget). Every GlobalLfoTargetId
 * (eq3/lpf/hpf — the only three AudioRigEffectKey blocks that ever carry an
 * lfoTarget at all, see audioRigConfig.ts's AUDIO_RIG_CONFIG) shares the one
 * 'globalFx' group; every RobotLfoTargetId, regardless of field or which
 * robot, shares the one 'robots' group — robot fields have no "effect block"
 * concept to split by further.
 */
export type DriftGroupId = 'globalFx' | 'robots';

export const DRIFT_GROUP_IDS: readonly DriftGroupId[] = ['globalFx', 'robots'];

// ========================================
// SETTINGS
// ========================================

/** Hz — docs/reference/ROBOT_DATA_GRID.md's "LFO Rate" row (OSCILLATION RATE).
 *  0 is a real, meaningful value: it's the new "off" state, replacing the
 *  removed OSCILLATION STATE toggle — rate=0 fully disconnects the LFO from
 *  its target (see lfoEngine.ts's connect/disconnect callers). */
export const LFO_RATE_MIN = 0;
export const LFO_RATE_MAX = 20;

/** Percent — docs/reference/ROBOT_DATA_GRID.md's "LFO Depth" row (OSCILLATION DEPTH). */
export const LFO_DEPTH_MIN = 0;
export const LFO_DEPTH_MAX = 100;

/**
 * An LFO's tunable settings, per docs/reference/ROBOT_DATA_GRID.md's LFO
 * MODULE rows:
 * - shape: OSCILLATION SHAPE (Radio Button) — see LfoShape
 * - rate: OSCILLATION RATE (Slider - linear), LFO_RATE_MIN–LFO_RATE_MAX Hz
 * - depth: OSCILLATION DEPTH (Slider - linear), LFO_DEPTH_MIN–LFO_DEPTH_MAX %
 */
export interface LfoSettings {
  shape: LfoShape;
  rate: number;
  depth: number;
}

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.1)
// ========================================

/** The four world-level LFO lanes — order-carrying (seed bias leans a > b > c > d);
 *  user-facing names live in src/content/, not here. */
export type LfoLaneId = 'a' | 'b' | 'c' | 'd';

export const LFO_LANE_IDS: readonly LfoLaneId[] = ['a', 'b', 'c', 'd'];

/** One bank LFO — world-level, app-lifetime; the only place shape/rate live now. */
export interface BankLfoSettings {
  shape: LfoShape;
  /** Hz, LFO_RATE_MIN..LFO_RATE_MAX. 0 is a legal user value (the lane holds still); the seed never emits it. */
  rate: number;
  /** -1..1, step 0.01 — the former lfoDrift[group].rateDrift, now per lane. */
  rateDrift: number;
  /** -1..1, step 0.01 — the former lfoDrift[group].depthDrift, now per lane. */
  depthDrift: number;
}

/** What a modulation target stores. `lane: null` = not in the graph at all. */
export interface LfoLink {
  lane: LfoLaneId | null;
  /** Percent, LFO_DEPTH_MIN..LFO_DEPTH_MAX. A user may set 0 with a lane; the seed never does. */
  depth: number;
}
