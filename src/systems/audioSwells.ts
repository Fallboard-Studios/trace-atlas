/**
 * Audio Swells — a rare, self-reversing ramp event on one global-chain or
 * robot-scoped parameter, resolving docs/tasks/AUDIO_SWELLS.md Task 3.
 * Deliberately NOT built on lfoEngine.ts/lfoDrift.ts (docs/specs/AUDIO_SWELLS.md
 * §1.1) — no Tone.LFO, no Signal/Param connection. Every write flows through
 * the same store-backed path a human editing a control by hand would use
 * (setGlobalAudio here; robotOptionsActions.ts's apply* functions once the
 * robot pool lands in Task 4), so the relevant slider visibly moves.
 *
 * Mirrors robotSystems.ts's startRobotLifecycle/stopRobotLifecycle/tick
 * lifecycle shape. Runtime state (activeSwells) lives in a plain module-scope
 * Map, never in Zustand (CLAUDE.md: runtime-only state stays out of state).
 *
 * The global pool (Task 3) is the first complete, independently testable
 * vertical slice (trigger -> select -> ramp -> write -> exact return-to-base
 * -> disabled-effect eligibility). The robot pool (Task 4, this revision)
 * reuses pickSwellPeakDelta unchanged and generalizes tickAudioSwells/
 * advanceActiveSwells to a second pool — single-robot swells only; the
 * company-wide variant lands in Task 5.
 */

// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import { applyVolume, applyLayersContinuous, applyAdsr } from './robotOptionsActions';
import { scheduleRepeat, cancelSchedule, getCurrentMeasurePrecise } from '@/engine/beatClock';
import { getSeededVal } from '@/utils/getSeededVal';
import { getAttenuationStyleNoiseMap } from '@/utils/noiseMaps';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useAudioStore } from '@/stores/audioStore';
import { useLocaleStore } from '@/stores/localeStore';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from '@/data/globalAudioSeedRanges';
import { ROBOT_SWELL_FIELD_RANGE } from '@/data/audioSwellRanges';
import {
  SWELL_GLOBAL_TARGET_IDS,
  SWELL_ROBOT_ATTRIBUTE_IDS,
  type ActiveSwell,
  type SwellGlobalTargetId,
  type SwellRobotAttributeId,
  type SwellMember,
  type SwellPool,
} from '@/types/audioSwell';
import type { Robot } from '@/types/Robot';
import type { Company } from '@/types/Company';

// ========================================
// CONSTANTS
// ========================================

/** Each pool (global, robot) is capped independently — never a shared budget. */
export const MAX_CONCURRENT_SWELLS_PER_POOL = 5;

/** Ticks per whole measure — the 16n scheduleRepeat cadence startAudioSwells
 *  already runs tickAudioSwells at (docs/specs/
 *  AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3). Not re-derived from
 *  BeatClock at runtime — a fixed subdivision this file's own scheduling
 *  cadence depends on. */
const TICKS_PER_MEASURE = 16;

/**
 * Frequency's per-tick trigger probability, replacing the old fixed,
 * once-per-whole-measure trigger roll (docs/specs/
 * AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3). frequency is swells/measure
 * directly — over TICKS_PER_MEASURE independent per-tick trials with
 * probability p, the expected number of successes per measure is
 * TICKS_PER_MEASURE * p, so solving for p gives frequency / TICKS_PER_MEASURE.
 * An approximation (an expected rate, not a guarantee of exactly `frequency`
 * triggers every single measure), same "average gap" framing the old
 * per-measure chance's own comment used. frequency values above
 * TICKS_PER_MEASURE are clamped to 1 — a per-tick probability can't exceed 1,
 * so "24 times a measure" and "16 times a measure" are behaviorally identical
 * (at most one trigger per tick) — an accepted, documented ceiling, not a bug.
 */
export function frequencyToPerTickChance(frequency: number): number {
  return Math.min(1, frequency / TICKS_PER_MEASURE);
}

/** Second, small chance — evaluated only when the robot pool's own trigger
 *  above already succeeded — that this pick becomes company-wide (§1.5)
 *  instead of single-robot. Unconfirmed exact value, same first-pass caveat
 *  every other placeholder probability in this file has (§7). */
export const SWELL_COMPANY_CHANCE = 0.15; // placeholder — needs a manual audible pass

/** Rising-phase and falling-phase measure counts are drawn INDEPENDENTLY from
 *  each other (never mirrored) — every global target except delay.wet/
 *  reverb.wet uses this range. 1 measure is a hard floor on any phase for any
 *  attribute, full stop (docs/specs/AUDIO_SWELLS.md §1.5). */
export const DEFAULT_SWELL_DURATION_RANGE = { min: 3, max: 6 };
/** delay.wet / reverb.wet only — both min and max widen. */
export const MIX_SWELL_DURATION_RANGE = { min: 6, max: 12 };

const MIX_SWELL_TARGETS: readonly SwellGlobalTargetId[] = ['delay.wet', 'reverb.wet'];

/** Every direction/magnitude draw covers AT LEAST 50% of the attribute's full
 *  range and AT MOST the true edge (§1.5) — the shared floor fraction every
 *  attribute uses. */
const SWELL_MIN_RANGE_FRACTION = 0.5;

/** Robot volume's own downward-swell floor — a pure clamp on the final peak,
 *  never a gate on direction-picking (§1.5). Expressed in volume's own 0-1
 *  domain (ROBOT_SWELL_FIELD_RANGE.volume), matching applyVolume's pct/100
 *  convention. */
export const VOLUME_SWELL_DOWNWARD_FLOOR = 0.5;

/** Robot detune's own swing cap: a maximum, not the usual minimum — every
 *  layerN.detune swell's magnitude is capped to this fraction of detune's
 *  full range (25% of the -50..50 range = 25 cents either direction),
 *  overriding the default "at least 50% of range" rule entirely for this
 *  one attribute. Direction-picking is unaffected; only the magnitude draw
 *  uses peakDeltaCappedByFraction instead of peakDeltaForDirection. */
export const DETUNE_SWELL_MAX_SWING_FRACTION = 0.25;

/** HPF's own upward-swell ceiling — a pure clamp on the final peak, never a
 *  gate on direction-picking, mirroring VOLUME_SWELL_DOWNWARD_FLOOR's shape.
 *  A high-pass filter swelling past this in this ambient soundscape reads as
 *  a harsh, un-musical thinning of the mix. */
export const HPF_SWELL_UPWARD_CEILING_HZ = 4000;

/** LPF's own downward-swell floor — same shape as HPF_SWELL_UPWARD_CEILING_HZ,
 *  the opposite direction. A low-pass filter swelling below this reads as an
 *  overly muffled, un-musical dulling of the mix. */
export const LPF_SWELL_DOWNWARD_FLOOR_HZ = 100;

// ========================================
// GLOBAL TARGET -> EFFECT/FIELD MAPPING
// ========================================

type GlobalSwellEffectKey = 'eq3' | 'filterLPF' | 'filterHPF' | 'delay' | 'reverb';

interface GlobalTargetMeta {
  effect: GlobalSwellEffectKey;
  field: string;
  /** Key into GLOBAL_AUDIO_SEED_RANGES — translates the 'lpf.'/'hpf.' short
   *  form (matching AudioEngine.setEffectBypass's effect keys) to the
   *  'filterLPF.'/'filterHPF.' keys that table actually uses, same
   *  translation lfoEngine.ts's own (private) globalSeedRangeKey performs. */
  rangeKey: GlobalAudioSeedFieldKey;
}

const GLOBAL_TARGET_META: Record<SwellGlobalTargetId, GlobalTargetMeta> = {
  'eq3.low': { effect: 'eq3', field: 'low', rangeKey: 'eq3.low' },
  'eq3.mid': { effect: 'eq3', field: 'mid', rangeKey: 'eq3.mid' },
  'eq3.high': { effect: 'eq3', field: 'high', rangeKey: 'eq3.high' },
  'lpf.frequency': { effect: 'filterLPF', field: 'frequency', rangeKey: 'filterLPF.frequency' },
  'lpf.Q': { effect: 'filterLPF', field: 'Q', rangeKey: 'filterLPF.Q' },
  'hpf.frequency': { effect: 'filterHPF', field: 'frequency', rangeKey: 'filterHPF.frequency' },
  'hpf.Q': { effect: 'filterHPF', field: 'Q', rangeKey: 'filterHPF.Q' },
  'delay.wet': { effect: 'delay', field: 'wet', rangeKey: 'delay.wet' },
  'reverb.wet': { effect: 'reverb', field: 'wet', rangeKey: 'reverb.wet' },
};

function readGlobalValue(target: SwellGlobalTargetId): number {
  const meta = GLOBAL_TARGET_META[target];
  const effectSettings = useAudioStore.getState().globalAudio[meta.effect];
  // Same generic-narrowing limitation audioStore.ts's own setGlobalAudio hits —
  // meta.field's type is only known at the per-target literal, not across the union.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (effectSettings as any)[meta.field] as number;
}

function writeGlobalValue(target: SwellGlobalTargetId, value: number): void {
  const meta = GLOBAL_TARGET_META[target];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAudioStore.getState().setGlobalAudio(meta.effect, { [meta.field]: value } as any);
}

// ========================================
// ROBOT ATTRIBUTE READ/WRITE
// ========================================

const LAYER_FIELD_PATTERN = /^layer(\d)\.(gain|detune|phase|pulseWidth)$/;
const ADSR_FIELD_PATTERN = /^adsr\.(attack|decay|sustain|release)$/;

/** A robot attribute's own parent-mute check (§1.5, §3): layerN.* requires
 *  that layer's own gain to be nonzero (the removed OscillatorLayer.active
 *  flag's replacement — see its own doc comment); volume and the 4 ADSR
 *  fields have no such parent and are always structurally available. */
function isRobotAttributeStructurallyLive(robot: Robot, attribute: SwellRobotAttributeId): boolean {
  const layerMatch = LAYER_FIELD_PATTERN.exec(attribute);
  if (!layerMatch) return true; // volume, adsr.* — no parent mute
  const layerIndex = Number(layerMatch[1]);
  // Nullish, not `!== 0` alone — a layer slot that doesn't exist at all (fewer than 3
  // configured) must read as muted/ineligible, matching the old `=== true` check's
  // behavior for a missing layer, not fall through to "eligible" the way `undefined !== 0` would.
  return (robot.audioAttributes.layers?.[layerIndex]?.gain ?? 0) !== 0;
}

function readRobotValue(robot: Robot, attribute: SwellRobotAttributeId): number {
  if (attribute === 'volume') return robot.masterVolume;
  const layerMatch = LAYER_FIELD_PATTERN.exec(attribute);
  if (layerMatch) {
    const layer = robot.audioAttributes.layers![Number(layerMatch[1])];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (layer as any)[layerMatch[2]] as number;
  }
  const adsrMatch = ADSR_FIELD_PATTERN.exec(attribute);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (robot.audioAttributes.adsr as any)[adsrMatch![1]] as number;
}

/**
 * Writes through the exact same apply* function a human editing that
 * control by hand would call (docs/specs/AUDIO_SWELLS.md §3) — never a bare
 * updateRobot/AudioEngine.updateVoice* pairing. `robot` must be freshly read
 * from the store (not a stale creation-time reference) so a concurrent edit
 * to a different field on the same robot isn't clobbered.
 */
function writeRobotValue(robot: Robot, localeId: string, attribute: SwellRobotAttributeId, value: number): void {
  if (attribute === 'volume') {
    // ROBOT_SWELL_FIELD_RANGE.volume is the store's 0-1 masterVolume fraction;
    // applyVolume's own parameter is the UI's 0-100 display percent.
    applyVolume(robot, localeId, value * 100);
    return;
  }
  const layerMatch = LAYER_FIELD_PATTERN.exec(attribute);
  if (layerMatch) {
    const layerIndex = Number(layerMatch[1]);
    const field = layerMatch[2];
    const nextLayers = robot.audioAttributes.layers!.map((layer, i) =>
      i === layerIndex ? { ...layer, [field]: value } : layer
    );
    applyLayersContinuous(robot, localeId, nextLayers);
    return;
  }
  const adsrMatch = ADSR_FIELD_PATTERN.exec(attribute)!;
  applyAdsr(robot, localeId, { ...robot.audioAttributes.adsr, [adsrMatch[1]]: value });
}

function robotSwellKey(robotId: string, attribute: SwellRobotAttributeId): string {
  return `${robotId}:${attribute}`;
}

// ========================================
// SHARED DIRECTION + MAGNITUDE HELPER
// ========================================

/**
 * Attribute-agnostic direction+magnitude draw (docs/specs/AUDIO_SWELLS.md
 * §1.5) — reused unchanged by the robot pool (Task 4). Direction is picked so
 * the swell can cover AT LEAST 50% of the field's full range: up if `current`
 * is at or below the range's midpoint, down if at or above it, a seeded
 * coin-flip tie-break exactly at the midpoint. The peak is then drawn between
 * that 50%-of-range floor (relative to `current`, not the range's own
 * midpoint — e.g. a field at 33% of range swells up into [83%, 100%]) and the
 * true edge. Returns the SIGNED peakDelta — `current + peakDelta` is the
 * swell's peak — matching ActiveSwell/SwellMember's own baseValue/peakDelta
 * shape. This is a new, from-scratch formula, deliberately not
 * centeredSwingFromRange (symmetric/bounded, no directionality or
 * minimum-swing guarantee — the wrong shape here).
 */
export function pickSwellPeakDelta(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
  currentValue: number,
): number {
  const goingUp = pickSwellDirection(noiseMap, dataId, offset, range, currentValue);
  return peakDeltaForDirection(noiseMap, dataId, offset, range, currentValue, goingUp);
}

/**
 * The direction half of pickSwellPeakDelta, split out so a caller can decide
 * which magnitude function to use (the default 50%-of-range one, or a
 * capped-swing variant like robot detune's — see robotPeakDeltaForDirection)
 * without duplicating the direction/tie-break logic itself.
 */
function pickSwellDirection(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
  currentValue: number,
): boolean {
  const { min, max } = range;
  const midpoint = (min + max) / 2;
  if (currentValue < midpoint) return true;
  if (currentValue > midpoint) return false;
  return getSeededVal(noiseMap, `${dataId}.tiebreak`, offset, 0, 1) < 0.5;
}

/**
 * The magnitude half of pickSwellPeakDelta, given an ALREADY-DECIDED
 * direction — split out for the company-wide variant (Task 5), where
 * direction is shared/drawn once for the whole company rather than derived
 * from each member's own current value (docs/specs/AUDIO_SWELLS.md §1.5:
 * "Magnitude is still per-robot... independently of every other robot",
 * but direction is lock-step). pickSwellPeakDelta itself is just this
 * function with `goingUp` derived from `currentValue`'s own midpoint check.
 */
function peakDeltaForDirection(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
  currentValue: number,
  goingUp: boolean,
): number {
  const { min, max } = range;
  const halfSpan = (max - min) * SWELL_MIN_RANGE_FRACTION;
  if (goingUp) {
    const floor = Math.min(currentValue + halfSpan, max);
    const peak = getSeededVal(noiseMap, dataId, offset, floor, max);
    return peak - currentValue;
  } else {
    const floor = Math.max(currentValue - halfSpan, min);
    const peak = getSeededVal(noiseMap, dataId, offset, min, floor);
    return peak - currentValue;
  }
}

/**
 * A gentler, capped-swing alternative to peakDeltaForDirection — used for
 * robot detune specifically (see DETUNE_SWELL_MAX_SWING_FRACTION). Same
 * direction, but the magnitude is a seeded draw somewhere between 0 and
 * `maxSwingFraction` of the field's full range (clamped to the real edge if
 * `currentValue` is already close to it), never the default's "at least 50%
 * of range" guarantee — deliberately the opposite shape: a MAXIMUM swing,
 * not a minimum one.
 */
function peakDeltaCappedByFraction(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
  currentValue: number,
  goingUp: boolean,
  maxSwingFraction: number,
): number {
  const { min, max } = range;
  const cap = (max - min) * maxSwingFraction;
  if (goingUp) {
    const cappedEdge = Math.min(currentValue + cap, max);
    const peak = getSeededVal(noiseMap, dataId, offset, currentValue, cappedEdge);
    return peak - currentValue;
  } else {
    const cappedEdge = Math.max(currentValue - cap, min);
    const peak = getSeededVal(noiseMap, dataId, offset, cappedEdge, currentValue);
    return peak - currentValue;
  }
}

/**
 * The literal last step of every swell's peak calculation
 * (docs/specs/PING-VARIANCE-AUTOMATION.md §1.3) — multiplies an
 * already-clamped, already-direction-picked delta by the Intensity fraction
 * (renamed from `automation` in docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
 * §1.2, now that it's magnitude-only — on/off moved to swellFrequency).
 * Safe by construction: peakDelta and (peakDelta * intensity) always share a
 * sign (or intensity collapses it to exactly 0), and |peakDelta * intensity|
 * <= |peakDelta|, so this can only ever shrink a swell toward its base value,
 * never push it past a bound an earlier clamp already enforced. Called at
 * every swell-creation call site (global, single-robot, and once per member
 * for company-wide), always after that site's own attribute-specific clamp —
 * never before, never instead of one.
 */
function scaleSwellPeakByAutomation(peakDelta: number, intensity: number): number {
  return peakDelta * intensity;
}

function pickPhaseMeasures(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
): number {
  const raw = getSeededVal(noiseMap, dataId, offset, range.min, range.max);
  return Math.max(1, Math.round(raw)); // 1-measure hard floor, full stop
}

// ========================================
// LIFECYCLE
// ========================================

let swellScheduleId: string | null = null;

/** Keyed by a stable target identity: the bare global target id for pool
 *  'global'; `${robotId}:${attribute}` per member for pool 'robot' (Task 4) —
 *  a company-wide swell's members all key off this same Map, one entry per
 *  participating robot, deduplicated by object identity (not key count) when
 *  iterating, since a company-wide ActiveSwell is stored under multiple keys. */
const activeSwells = new Map<string, ActiveSwell>();

export function startAudioSwells(localeId: string): void {
  if (swellScheduleId !== null) return; // already running — same idempotent guard startRobotLifecycle uses
  // 16n: tickAudioSwells's advance step needs sub-measure resolution for a
  // smooth ramp (16 updates/measure), and trigger/selection now also rolls on
  // every one of those same ticks (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
  // §1.3 — frequencyToPerTickChance derives its per-tick probability from
  // this exact TICKS_PER_MEASURE cadence).
  swellScheduleId = scheduleRepeat('16n', () => tickAudioSwells(localeId, getCurrentMeasurePrecise()));
}

export function stopAudioSwells(): void {
  if (swellScheduleId !== null) {
    cancelSchedule(swellScheduleId);
    swellScheduleId = null;
  }
  activeSwells.clear(); // no partial swells survive a locale/AS change
}

/**
 * Read-only snapshot of every in-flight swell in one pool, deduplicated by
 * object identity — a company-wide swell (Task 5) is stored under multiple
 * Map keys but must count/appear once. Exists for tests/future debug UI;
 * `activeSwells` itself deliberately stays module-private (CLAUDE.md:
 * runtime-only state stays out of Zustand, and out of any public API that
 * could tempt a caller into treating it as reactive state).
 */
export function getActiveSwellSnapshot(pool: SwellPool): ActiveSwell[] {
  const seen = new Set<ActiveSwell>();
  const result: ActiveSwell[] = [];
  for (const swell of activeSwells.values()) {
    if (swell.pool === pool && !seen.has(swell)) {
      seen.add(swell);
      result.push({ ...swell });
    }
  }
  return result;
}

function activeSwellCount(pool: SwellPool): number {
  return getActiveSwellSnapshot(pool).length;
}

/** One 16n tick's worth of Audio Swell evaluation — `measure` may be
 *  fractional (sub-measure precision) for a smooth ramp. Pure with respect to
 *  its `measure` input (not read from BeatClock directly) so tests can drive
 *  it without a real transport — see startAudioSwells for the BeatClock-wired
 *  entry point. Mirrors tickRobotLifecycle's own shape (robotSystems.ts).
 *  Trigger/selection now rolls on every tick, not just once per whole measure
 *  (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3) — frequencyToPerTickChance
 *  derives a per-tick probability from swellFrequency so the long-run rate
 *  still matches "swells per measure", without needing a once-per-measure gate. */
export function tickAudioSwells(localeId: string, measure: number): void {
  const as = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!as) return;
  const noiseMap = getAttenuationStyleNoiseMap(as.id, as.name);

  // Intensity is read once per tick and threaded only to the magnitude-
  // scaling call sites below (§1.2) — it no longer has any gating role.
  // frequency is threaded to advanceActiveSwells (the 0-forced-return check,
  // re-keyed from Intensity in docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
  // §1.3) and to both pools' swell-creation call sites' own trigger roll.
  // Advance runs every tick regardless of frequency's value: a still-rising
  // swell gets force-converted at exactly 0 (see maybeForceGlobalSwellReturn/
  // maybeForceRobotSwellReturn), but a swell already falling always keeps
  // riding its own ramp to base either way — frequency never cancels a swell
  // outright the way a disabled effect does. Smooth, sub-measure
  // interpolation from whatever fractional `measure` this tick carries (16n
  // resolution in production; tests may pass any real number).
  const intensity = useAudioStore.getState().pingVarianceAutomation;
  const frequency = useAudioStore.getState().swellFrequency;
  advanceActiveSwells(localeId, measure, frequency);

  // frequency is the sole on/off switch for new-swell starts (docs/specs/
  // AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3) — Intensity no longer gates
  // this at all, only scales magnitude once a swell is already starting.
  // Every tick gets its own independent trigger roll now (below), using this
  // same fractional `measure` as the noise offset so successive ticks within
  // one whole measure diverge from each other.
  if (frequency > 0) {
    maybeStartGlobalSwell(noiseMap, measure, intensity, frequency);
    maybeStartRobotSwell(localeId, noiseMap, measure, intensity, frequency);
  }
}

// ========================================
// GLOBAL POOL — TRIGGER & SELECTION
// ========================================

/**
 * Whether a global target's own current value sits at its "off" position.
 * Only delay.wet/reverb.wet get a real answer here: wet=0 unambiguously
 * means "no audible contribution" for a mix parameter, matching the removed
 * per-effect enabled/bypass toggle's own old wet=0 bypass behavior. Every
 * other target (eq3 bands, filter frequency/Q) has no such unambiguous off
 * value — 0dB EQ and a wide-open filter passthrough frequency are common,
 * legitimate resting positions a user reaches by simply not touching the
 * slider, not signals of "this effect is off" (unlike wet, which nothing
 * else ever sets to exactly 0 by coincidence) — so they're always eligible,
 * same as the robot pool's attributes. Governs both new-swell eligibility
 * (isGlobalTargetEligible) and mid-swell cancellation (advanceGlobalSwell)
 * for the global pool.
 */
function isGlobalTargetAtOffEquivalent(target: SwellGlobalTargetId): boolean {
  const globalAudio = useAudioStore.getState().globalAudio;
  switch (target) {
    case 'delay.wet': return globalAudio.delay.wet === 0;
    case 'reverb.wet': return globalAudio.reverb.wet === 0;
    default: return false;
  }
}

function isGlobalTargetEligible(target: SwellGlobalTargetId): boolean {
  if (activeSwells.has(target)) return false;
  return !isGlobalTargetAtOffEquivalent(target);
}

/** HPF/LPF each get one clamp on their own frequency swell — same shape as
 *  clampVolumeDownward, a pure post-hoc clamp on the final peak that never
 *  gates direction-picking. */
function clampGlobalPeak(target: SwellGlobalTargetId, currentValue: number, peakDelta: number): number {
  if (target === 'hpf.frequency') return clampSwellCeiling(currentValue, peakDelta, HPF_SWELL_UPWARD_CEILING_HZ);
  if (target === 'lpf.frequency') return clampSwellFloor(currentValue, peakDelta, LPF_SWELL_DOWNWARD_FLOOR_HZ);
  return peakDelta;
}

function maybeStartGlobalSwell(noiseMap: NoiseFunction2D, measure: number, intensity: number, frequency: number): void {
  if (activeSwellCount('global') >= MAX_CONCURRENT_SWELLS_PER_POOL) return;

  const triggerRoll = getSeededVal(noiseMap, 'audioSwell.trigger.global', measure, 0, 1);
  if (triggerRoll >= frequencyToPerTickChance(frequency)) return;

  const eligible = SWELL_GLOBAL_TARGET_IDS.filter(isGlobalTargetEligible);
  if (eligible.length === 0) return;

  const rawIndex = getSeededVal(noiseMap, 'audioSwell.target.global', measure, 0, eligible.length);
  const target = eligible[Math.min(eligible.length - 1, Math.floor(rawIndex))];

  const meta = GLOBAL_TARGET_META[target];
  const range = GLOBAL_AUDIO_SEED_RANGES[meta.rangeKey];
  const currentValue = readGlobalValue(target);
  const peakDelta = scaleSwellPeakByAutomation(
    clampGlobalPeak(
      target, currentValue, pickSwellPeakDelta(noiseMap, `audioSwell.peak.${target}`, measure, range, currentValue)
    ),
    intensity,
  );

  const durationRange = MIX_SWELL_TARGETS.includes(target) ? MIX_SWELL_DURATION_RANGE : DEFAULT_SWELL_DURATION_RANGE;
  const risingMeasures = pickPhaseMeasures(noiseMap, `audioSwell.rising.${target}`, measure, durationRange);
  const fallingMeasures = pickPhaseMeasures(noiseMap, `audioSwell.falling.${target}`, measure, durationRange);

  activeSwells.set(target, {
    pool: 'global',
    globalTarget: target,
    baseValue: currentValue,
    peakDelta,
    phase: 'rising',
    startMeasure: measure,
    risingMeasures,
    fallingMeasures,
  });
}

// ========================================
// ROBOT POOL — TRIGGER & SELECTION
// ========================================

function isRobotAttributeEligible(robot: Robot, attribute: SwellRobotAttributeId): boolean {
  if (activeSwells.has(robotSwellKey(robot.id, attribute))) return false;
  return isRobotAttributeStructurallyLive(robot, attribute);
}

/**
 * The robot pool's own trigger, shared by both the single-robot and
 * company-wide paths. A second seeded draw (SWELL_COMPANY_CHANCE) decides
 * which path this pick takes — but only when the locale actually HAS a
 * company to pick: with zero companies, "company-wide" was never really an
 * option this tick regardless of the roll, so it falls straight through to
 * the single-robot path instead of aborting the tick (docs/specs/AUDIO_SWELLS.md
 * §7 item 6 leaves the exact company-selection mechanics for
 * Plan/Tasks to settle — this is that settling).
 */
function maybeStartRobotSwell(localeId: string, noiseMap: NoiseFunction2D, measure: number, intensity: number, frequency: number): void {
  if (activeSwellCount('robot') >= MAX_CONCURRENT_SWELLS_PER_POOL) return;

  const triggerRoll = getSeededVal(noiseMap, 'audioSwell.trigger.robot', measure, 0, 1);
  if (triggerRoll >= frequencyToPerTickChance(frequency)) return;

  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
  const companies = useLocaleStore.getState().getLocaleById(localeId)?.companies ?? [];

  const companyRoll = getSeededVal(noiseMap, 'audioSwell.company.chance', measure, 0, 1);
  if (companyRoll < SWELL_COMPANY_CHANCE && companies.length > 0) {
    startCompanyWideSwell(companies, robots, noiseMap, measure, intensity);
    return;
  }

  startSingleRobotSwell(robots, noiseMap, measure, intensity);
}

function startSingleRobotSwell(robots: Robot[], noiseMap: NoiseFunction2D, measure: number, intensity: number): void {
  // Robot selection spans the whole roster (docs/specs/AUDIO_SWELLS.md §3) —
  // the 17x12 pool, never scoped to one robot.
  const eligiblePairs: { robot: Robot; attribute: SwellRobotAttributeId }[] = [];
  for (const robot of robots) {
    for (const attribute of SWELL_ROBOT_ATTRIBUTE_IDS) {
      if (isRobotAttributeEligible(robot, attribute)) eligiblePairs.push({ robot, attribute });
    }
  }
  if (eligiblePairs.length === 0) return;

  const rawIndex = getSeededVal(noiseMap, 'audioSwell.target.robot', measure, 0, eligiblePairs.length);
  const { robot, attribute } = eligiblePairs[Math.min(eligiblePairs.length - 1, Math.floor(rawIndex))];

  const range = ROBOT_SWELL_FIELD_RANGE[attribute];
  const currentValue = readRobotValue(robot, attribute);
  const dataId = `audioSwell.peak.${robot.id}.${attribute}`;
  const goingUp = pickSwellDirection(noiseMap, dataId, measure, range, currentValue);
  const peakDelta = scaleSwellPeakByAutomation(
    clampVolumeDownward(
      attribute, currentValue, robotPeakDeltaForDirection(attribute, noiseMap, dataId, measure, range, currentValue, goingUp)
    ),
    intensity,
  );

  // Robot attributes have no mix-style duration exception — always the default range.
  const risingMeasures = pickPhaseMeasures(
    noiseMap, `audioSwell.rising.${robot.id}.${attribute}`, measure, DEFAULT_SWELL_DURATION_RANGE
  );
  const fallingMeasures = pickPhaseMeasures(
    noiseMap, `audioSwell.falling.${robot.id}.${attribute}`, measure, DEFAULT_SWELL_DURATION_RANGE
  );

  const member: SwellMember = { robotId: robot.id, baseValue: currentValue, peakDelta };
  activeSwells.set(robotSwellKey(robot.id, attribute), {
    pool: 'robot',
    robotAttribute: attribute,
    members: [member],
    phase: 'rising',
    startMeasure: measure,
    risingMeasures,
    fallingMeasures,
  });
}

/**
 * A variant outcome of the robot pool's own roll (§1.5) — not a separate
 * pool, cadence, or cap. One Company and one attribute are each picked via
 * a seeded draw (unfiltered — eligibility is applied per-member next, after
 * the attribute is already chosen); every eligible member shares direction
 * and timing, drawn once, but computes its own peakDelta from its own
 * current value. If the picked company has zero eligible members for the
 * picked attribute, no swell starts this tick at all — not a re-roll, not a
 * fallback to a different company/attribute or to the single-robot path.
 */
function startCompanyWideSwell(companies: Company[], robots: Robot[], noiseMap: NoiseFunction2D, measure: number, intensity: number): void {
  const companyIndex = Math.min(
    companies.length - 1,
    Math.floor(getSeededVal(noiseMap, 'audioSwell.company.pick', measure, 0, companies.length))
  );
  const company = companies[companyIndex];

  const attributeIndex = Math.min(
    SWELL_ROBOT_ATTRIBUTE_IDS.length - 1,
    Math.floor(getSeededVal(noiseMap, 'audioSwell.company.attribute', measure, 0, SWELL_ROBOT_ATTRIBUTE_IDS.length))
  );
  const attribute = SWELL_ROBOT_ATTRIBUTE_IDS[attributeIndex];

  const memberRobots = company.robotIds
    .map((id) => robots.find((r) => r.id === id))
    .filter((r): r is Robot => r !== undefined && isRobotAttributeEligible(r, attribute));
  if (memberRobots.length === 0) return; // no swell starts this tick (§1.5)

  const goingUp = getSeededVal(noiseMap, 'audioSwell.company.direction', measure, 0, 1) < 0.5;
  const risingMeasures = pickPhaseMeasures(noiseMap, 'audioSwell.company.rising', measure, DEFAULT_SWELL_DURATION_RANGE);
  const fallingMeasures = pickPhaseMeasures(noiseMap, 'audioSwell.company.falling', measure, DEFAULT_SWELL_DURATION_RANGE);

  const range = ROBOT_SWELL_FIELD_RANGE[attribute];
  const members: SwellMember[] = memberRobots.map((robot) => {
    const currentValue = readRobotValue(robot, attribute);
    const dataId = `audioSwell.peak.company.${robot.id}.${attribute}`;
    const peakDelta = scaleSwellPeakByAutomation(
      clampVolumeDownward(
        attribute, currentValue,
        robotPeakDeltaForDirection(attribute, noiseMap, dataId, measure, range, currentValue, goingUp)
      ),
      intensity,
    );
    return { robotId: robot.id, baseValue: currentValue, peakDelta };
  });

  const swell: ActiveSwell = {
    pool: 'robot',
    robotAttribute: attribute,
    members,
    companyId: company.id,
    phase: 'rising',
    startMeasure: measure,
    risingMeasures,
    fallingMeasures,
  };
  for (const member of members) activeSwells.set(robotSwellKey(member.robotId, attribute), swell);
}

/** Robot volume's downward clamp: a pure post-hoc clamp on the final peak,
 *  never a gate on direction-picking (§1.5) — an upward pick is never
 *  touched. Shared by the single-robot and company-wide paths. */
/** Clamps a downward-only swell's peak so it never drops below `floor` —
 *  never a gate on direction-picking. If `currentValue` is already at or
 *  below `floor`, collapses to no movement rather than flipping to an
 *  upward delta. */
function clampSwellFloor(currentValue: number, peakDelta: number, floor: number): number {
  if (peakDelta >= 0) return peakDelta;
  return Math.min(0, Math.max(currentValue + peakDelta, floor) - currentValue);
}

/** Clamps an upward-only swell's peak so it never exceeds `ceiling` — never
 *  a gate on direction-picking. If `currentValue` is already at or above
 *  `ceiling`, collapses to no movement rather than flipping to a downward
 *  delta. */
function clampSwellCeiling(currentValue: number, peakDelta: number, ceiling: number): number {
  if (peakDelta <= 0) return peakDelta;
  return Math.max(0, Math.min(currentValue + peakDelta, ceiling) - currentValue);
}

function clampVolumeDownward(attribute: SwellRobotAttributeId, currentValue: number, peakDelta: number): number {
  if (attribute !== 'volume') return peakDelta;
  return clampSwellFloor(currentValue, peakDelta, VOLUME_SWELL_DOWNWARD_FLOOR);
}

const DETUNE_ATTRIBUTE_PATTERN = /\.detune$/;

/**
 * Chooses between the default 50%-of-range magnitude draw and detune's own
 * capped-swing variant, for a single already-decided direction — shared by
 * both the single-robot and company-wide paths so neither has to know about
 * this per-attribute exception separately.
 */
function robotPeakDeltaForDirection(
  attribute: SwellRobotAttributeId,
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset: number,
  range: { min: number; max: number },
  currentValue: number,
  goingUp: boolean,
): number {
  if (DETUNE_ATTRIBUTE_PATTERN.test(attribute)) {
    return peakDeltaCappedByFraction(noiseMap, dataId, offset, range, currentValue, goingUp, DETUNE_SWELL_MAX_SWING_FRACTION);
  }
  return peakDeltaForDirection(noiseMap, dataId, offset, range, currentValue, goingUp);
}

// ========================================
// ADVANCE / WRITE-BACK
// ========================================

function advanceActiveSwells(localeId: string, measure: number, frequency: number): void {
  const processed = new Set<ActiveSwell>();
  for (const swell of activeSwells.values()) {
    if (processed.has(swell)) continue;
    processed.add(swell);
    if (swell.pool === 'global') advanceGlobalSwell(swell.globalTarget!, swell, measure, frequency);
    else advanceRobotSwell(swell, localeId, measure, frequency);
  }
}

/**
 * 0-forced-return (docs/specs/PING-VARIANCE-AUTOMATION.md §1.4, re-keyed from
 * automation to frequency in docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
 * §1.3): a swell still in its rising phase when frequency is exactly 0 is
 * converted in place to ride its own already-drawn fallingMeasures back to
 * base, reusing
 * the falling-phase formula below completely unchanged rather than a new
 * snap/curve. Setting risingMeasures to 0 and startMeasure to `measure` (now)
 * makes this tick's elapsed time 0, so the falling formula evaluates to
 * exactly `currentValue` — no audible jump on the forcing tick itself.
 *
 * Guarded to `phase === 'rising'` only, which doubles as the "already
 * forced" marker with no new ActiveSwell field: forcing flips phase to
 * 'falling' immediately, so this can never re-fire for the same swell on a
 * later tick (re-deriving peakDelta from currentValue every tick would
 * otherwise freeze the swell in place instead of ever reaching base). A
 * swell already falling — naturally or because it was forced earlier — is
 * correctly left untouched: it's already walking to base.
 */
function maybeForceGlobalSwellReturn(swell: ActiveSwell, target: SwellGlobalTargetId, measure: number, frequency: number): void {
  if (frequency !== 0 || swell.phase !== 'rising') return;
  const currentValue = readGlobalValue(target);
  swell.peakDelta = currentValue - swell.baseValue!;
  swell.risingMeasures = 0;
  swell.startMeasure = measure;
  swell.phase = 'falling';
}

/** Same mechanism as maybeForceGlobalSwellReturn, generalized to the robot
 *  pool's per-member baseValue/peakDelta shape — phase/timing are mutated
 *  once at the swell level (shared, lock-step), each member's own peakDelta
 *  is re-derived from its own current live value. A member whose robot no
 *  longer exists is simply skipped here; the main advance loop below already
 *  skips writing/reading such a member too, so a stale peakDelta on it is
 *  never observed. */
function maybeForceRobotSwellReturn(swell: ActiveSwell, localeId: string, measure: number, frequency: number): void {
  if (frequency !== 0 || swell.phase !== 'rising') return;
  const attribute = swell.robotAttribute!;
  for (const member of swell.members!) {
    const robot = useLocaleStore.getState().getRobotById(localeId, member.robotId);
    if (!robot) continue;
    const currentValue = readRobotValue(robot, attribute);
    member.peakDelta = currentValue - member.baseValue;
  }
  swell.risingMeasures = 0;
  swell.startMeasure = measure;
  swell.phase = 'falling';
}

function advanceGlobalSwell(key: string, swell: ActiveSwell, measure: number, frequency: number): void {
  const target = swell.globalTarget!;

  maybeForceGlobalSwellReturn(swell, target, measure, frequency);

  const baseValue = swell.baseValue!;
  const peakDelta = swell.peakDelta!;

  if (isGlobalTargetAtOffEquivalent(target)) {
    // The target got manually driven to its own off-equivalent value
    // mid-swell (e.g. wet dragged to 0) — cancel immediately, snapping back
    // to its captured base value in the same tick, rather than silently
    // continuing to write into a now-irrelevant param (docs/specs/
    // AUDIO_SWELLS.md §3).
    writeGlobalValue(target, baseValue);
    activeSwells.delete(key);
    return;
  }

  const elapsed = measure - swell.startMeasure;
  const total = swell.risingMeasures + swell.fallingMeasures;

  if (elapsed >= total) {
    writeGlobalValue(target, baseValue); // exact return-to-base, never approximate
    activeSwells.delete(key);
    return;
  }

  swell.phase = elapsed < swell.risingMeasures ? 'rising' : 'falling';

  let value: number;
  if (swell.phase === 'rising') {
    const progress = elapsed / swell.risingMeasures;
    value = baseValue + peakDelta * progress;
  } else {
    const fallElapsed = elapsed - swell.risingMeasures;
    const progress = fallElapsed / swell.fallingMeasures;
    value = baseValue + peakDelta * (1 - progress);
  }

  writeGlobalValue(target, value);
}

/**
 * One SwellMember for a single-robot swell (Task 4); 2+ for a company-wide
 * swell (Task 5), sharing this same elapsed/phase timing but each computing
 * its own interpolated value from its own baseValue/peakDelta — lock-step in
 * time, not in magnitude. Every key this swell is stored under is derived
 * and removed together on completion, per the Map's own doc comment. Unlike
 * the global pool, a robot attribute's structural parent going inactive
 * mid-swell is NOT re-checked here — eligibility is evaluated at selection
 * time only (docs/specs/AUDIO_SWELLS.md §7, an explicitly deferred open
 * question, not addressed this task).
 */
function advanceRobotSwell(swell: ActiveSwell, localeId: string, measure: number, frequency: number): void {
  const attribute = swell.robotAttribute!;
  const members = swell.members!;

  maybeForceRobotSwellReturn(swell, localeId, measure, frequency);

  const elapsed = measure - swell.startMeasure;
  const total = swell.risingMeasures + swell.fallingMeasures;
  const complete = elapsed >= total;
  swell.phase = elapsed < swell.risingMeasures ? 'rising' : 'falling';

  for (const member of members) {
    const robot = useLocaleStore.getState().getRobotById(localeId, member.robotId);
    if (!robot) continue; // this member's robot no longer exists — defensive, skip just this one

    if (complete) {
      writeRobotValue(robot, localeId, attribute, member.baseValue); // exact return-to-base
      continue;
    }

    let value: number;
    if (swell.phase === 'rising') {
      value = member.baseValue + member.peakDelta * (elapsed / swell.risingMeasures);
    } else {
      const fallElapsed = elapsed - swell.risingMeasures;
      value = member.baseValue + member.peakDelta * (1 - fallElapsed / swell.fallingMeasures);
    }
    writeRobotValue(robot, localeId, attribute, value);
  }

  if (complete) {
    for (const member of members) activeSwells.delete(robotSwellKey(member.robotId, attribute));
  }
}
