/**
 * Audio Swell types, resolving docs/tasks/AUDIO_SWELLS.md Task 1.
 * A "swell" is a rare, self-reversing ramp event — deliberately NOT an
 * extension of lfoEngine.ts/lfoDrift.ts (docs/specs/AUDIO_SWELLS.md §1.1):
 * no Tone.LFO, no Signal/Param connection. Two independent pools, each with
 * its own eligible-target set (see docs/specs/AUDIO_SWELLS.md §1.2).
 */

import type { GlobalLfoTargetId } from './lfo';

// ========================================
// GLOBAL POOL TARGETS
// ========================================

/**
 * The 9 global-chain swell targets: every GlobalLfoTargetId (7) plus two new
 * ones — delay.wet and reverb.wet never got an lfoTarget (docs/AUDIO_SYSTEM.md's
 * LFO Modulation section, commit 508bd93) and still don't; this type is
 * intentionally NOT GlobalLfoTargetId itself, to keep that union's own
 * meaning ("has a real lfoEngine target") unchanged.
 */
export type SwellGlobalTargetId = GlobalLfoTargetId | 'delay.wet' | 'reverb.wet';

export const SWELL_GLOBAL_TARGET_IDS: readonly SwellGlobalTargetId[] = [
  'eq3.low', 'eq3.mid', 'eq3.high',
  'lpf.frequency', 'lpf.Q',
  'hpf.frequency', 'hpf.Q',
  'delay.wet', 'reverb.wet',
];

// ========================================
// ROBOT POOL ATTRIBUTES
// ========================================

/**
 * The 17 robot-scoped swell attributes: volume, every oscillator layer's
 * gain/detune/phase/pulseWidth (layerN.phase included — see
 * docs/specs/AUDIO_SWELLS.md §1.3 for why phase is fine here even though it's
 * excluded from LFO/Drift) plus the 4 ADSR sub-fields, independently
 * eligible (confirmed via /interview-me — never one atomic "envelope" move).
 *
 * Spelled out as its own union since 2026-09-30, no longer derived from
 * RobotLfoTargetId: that union dropped 'volume' and 'layerN.pulseWidth' as
 * LFO targets (docs/specs/LFO_LOAD_FIX.md assumption 9), but Audio Swells is
 * a separate system and keeps swelling both — a swell is a scheduled ramp of
 * the stored attribute, not an audio-rate LFO connection, so none of the
 * LFO-cost reasoning applies here. Every RobotLfoTargetId is still a member.
 */
export type SwellRobotAttributeId =
  | 'volume'
  | 'layer0.gain' | 'layer0.detune' | 'layer0.phase' | 'layer0.pulseWidth'
  | 'layer1.gain' | 'layer1.detune' | 'layer1.phase' | 'layer1.pulseWidth'
  | 'layer2.gain' | 'layer2.detune' | 'layer2.phase' | 'layer2.pulseWidth'
  | 'adsr.attack' | 'adsr.decay' | 'adsr.sustain' | 'adsr.release';

export const SWELL_ROBOT_ATTRIBUTE_IDS: readonly SwellRobotAttributeId[] = [
  'volume',
  'layer0.gain', 'layer0.detune', 'layer0.phase', 'layer0.pulseWidth',
  'layer1.gain', 'layer1.detune', 'layer1.phase', 'layer1.pulseWidth',
  'layer2.gain', 'layer2.detune', 'layer2.phase', 'layer2.pulseWidth',
  'adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release',
];

// ========================================
// RUNTIME STATE
// ========================================

/** Which of the two independent pools a swell belongs to — each has its own
 *  eligible-target set and its own 5-concurrent-swell cap. */
export type SwellPool = 'global' | 'robot';

/** Two phases only — no hold/plateau (docs/specs/AUDIO_SWELLS.md §1.5, confirmed via interview). */
export type SwellPhase = 'rising' | 'falling';

/**
 * One participating robot's own share of a 'robot'-pool swell — a
 * single-robot swell has exactly one entry; a company-wide swell
 * (docs/specs/AUDIO_SWELLS.md §1.5) has one per eligible robot in the
 * company. Every member shares the parent ActiveSwell's phase/timing, but
 * keeps its own base/peak — a company-wide swell is lock-step in *time*, not
 * in magnitude.
 */
export interface SwellMember {
  robotId: string;
  /** The field's live value at swell start — what this member must land back on exactly. */
  baseValue: number;
  /** Signed offset from baseValue at the swell's peak (base + peakDelta = the top of the swell). */
  peakDelta: number;
}

/**
 * One in-flight swell's complete runtime state — lives in a plain
 * module-scope Map in audioSwells.ts, never in Zustand (CLAUDE.md:
 * runtime-only state stays out of state; only each tick's resulting field
 * value reaches the store, via the normal apply-function/setGlobalAudio
 * call, same as any other edit).
 */
export interface ActiveSwell {
  pool: SwellPool;
  /** SwellGlobalTargetId for pool 'global'; undefined for pool 'robot'. */
  globalTarget?: SwellGlobalTargetId;
  /** pool 'global' only — the field's live value at swell start / peak offset. Mirrors
   *  SwellMember's baseValue/peakDelta shape but singular, since a global swell has
   *  exactly one target and no per-robot concept. */
  baseValue?: number;
  peakDelta?: number;
  /** pool 'robot' only — the attribute every member shares. */
  robotAttribute?: SwellRobotAttributeId;
  /** pool 'robot' only. Exactly one entry for a single-robot swell; 2+ for a
   *  company-wide swell (docs/specs/AUDIO_SWELLS.md §1.5). */
  members?: SwellMember[];
  /** Set only for a company-wide swell — which Company this pick came from, for
   *  bookkeeping/tests; not used for further lookups once `members` is built. */
  companyId?: string;
  phase: SwellPhase;
  /** Measure this swell started on (getCurrentMeasure(), unwrapped) — elapsed = current - startMeasure. */
  startMeasure: number;
  risingMeasures: number;
  fallingMeasures: number;
}
