/**
 * Tempo-sync resolvers and conversions for the Free | Sync toggle (docs/specs/FREE_SYNC_TOGGLE.md
 * §1.3, §1.5, §1.7). Pure: no Tone, no store. These are the ONLY sanctioned readers of a lane's
 * `rate` or the Delay's `delayTime` for audio or on/off decisions — everything else asks a resolver,
 * so the engine keeps receiving plain Hz / seconds and never learns about sync.
 *
 * Every `sync` read goes through isNoteValue: a value that isn't a real note (a hand-edited session,
 * a corrupt share link) resolves as Free rather than being trusted.
 */

// ========================================
// IMPORTS
// ========================================
import {
  NOTE_VALUES,
  allowedNoteValues,
  isNoteValue,
  nearestNoteValue,
  noteValueHz,
  noteValueSeconds,
  type NoteValue,
} from '@/data/noteValues';
import {
  LFO_LANE_IDS,
  LFO_RATE_MAX,
  LFO_RATE_MIN,
  LFO_RATE_STEP,
  type BankLfoSettings,
  type LfoLaneId,
} from '@/types/lfo';
import {
  DELAY_TIME_RANGE_SECONDS,
  DELAY_TIME_STEP_SECONDS,
  type DelaySettings,
} from '@/types/globalAudio';
import { quantizeToStep } from '@/utils/math';

// ========================================
// CONSTANTS
// ========================================

/** Whether a synced lane keeps its Rate Drift. Drift modulates rate by a percentage, which pushes a
 *  synced lane slightly off the grid. When false, resolveLaneForEngine hands the engine rateDrift 0
 *  for a synced lane — the single switch (spec assumption 8) for "drift skips synced lanes". */
export const RATE_DRIFT_APPLIES_TO_SYNCED = true;

// ========================================
// HELPERS
// ========================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** quantizeToStep, then rounded to the step's own decimal places so state never carries
 *  floating-point residue (1.3500000000000001 instead of 1.35). */
function quantizeClean(value: number, min: number, step: number): number {
  const decimals = String(step).split('.')[1]?.length ?? 0;
  return Number(quantizeToStep(value, min, step).toFixed(decimals));
}

// ========================================
// RESOLVERS
// ========================================

/** Hz the lane should run at. Free (or an invalid sync): `rate`. Sync: the note's Hz at `bpm`,
 *  clamped into the lane's full range, so a tempo change past the cap clamps and never stops. */
export function resolveLaneRateHz(lane: BankLfoSettings, bpm: number): number {
  if (!isNoteValue(lane.sync)) return lane.rate;
  return clamp(noteValueHz(lane.sync, bpm), LFO_RATE_MIN, LFO_RATE_MAX);
}

/** True when the lane is moving — replaces `rate > 0` wherever that decided on/off. A synced lane
 *  is always running, whatever its stored Free rate. */
export function isLaneRunning(lane: BankLfoSettings): boolean {
  return isNoteValue(lane.sync) || lane.rate > 0;
}

/** The engine-facing copy: rate resolved to Hz, `sync` stripped, and — iff `driftApplies` is false —
 *  rateDrift zeroed for a synced lane. `driftApplies` defaults to the shipped constant; the
 *  parameter exists so the off branch is testable. */
export function resolveLaneForEngine(
  lane: BankLfoSettings,
  bpm: number,
  driftApplies: boolean = RATE_DRIFT_APPLIES_TO_SYNCED
): BankLfoSettings {
  const { sync, ...rest } = lane;
  const zeroDrift = isNoteValue(sync) && !driftApplies;
  return { ...rest, rate: resolveLaneRateHz(lane, bpm), rateDrift: zeroDrift ? 0 : lane.rateDrift };
}

export function resolveLfoBankForEngine(
  bank: Record<LfoLaneId, BankLfoSettings>,
  bpm: number
): Record<LfoLaneId, BankLfoSettings> {
  return Object.fromEntries(
    LFO_LANE_IDS.map((id) => [id, resolveLaneForEngine(bank[id], bpm)])
  ) as Record<LfoLaneId, BankLfoSettings>;
}

/** Seconds the delay node should use. Free (or an invalid sync): `delayTime`. Sync: the note's
 *  duration at `bpm`, clamped into the node's real range. */
export function resolveDelayTimeSeconds(delay: DelaySettings, bpm: number): number {
  if (!isNoteValue(delay.sync)) return delay.delayTime;
  return clamp(
    noteValueSeconds(delay.sync, bpm),
    DELAY_TIME_RANGE_SECONDS.min,
    DELAY_TIME_RANGE_SECONDS.max
  );
}

// ========================================
// ALLOWED LISTS
// ========================================

/** Notes a lane may sync to at `bpm`, slowest -> fastest in Hz (the Free slider's direction).
 *  NOTE_VALUES is ascending by duration, i.e. fastest first in Hz, hence the reverse. */
export function allowedLaneNoteValues(bpm: number): NoteValue[] {
  return allowedNoteValues(bpm, { min: LFO_RATE_MIN, max: LFO_RATE_MAX }, 'hz').reverse();
}

/** Notes the Delay may sync to at `bpm`, shortest -> longest in seconds. */
export function allowedDelayNoteValues(bpm: number): NoteValue[] {
  return allowedNoteValues(bpm, DELAY_TIME_RANGE_SECONDS, 'seconds');
}

// ========================================
// MODE CONVERSIONS (§1.5) — whole new objects; a Free result carries no `sync` key at all
// ========================================

/** Free -> Sync: snap `rate` to the nearest allowed note (0 Hz lands on the slowest). `rate` is kept
 *  underneath. A lane already on a valid note stays on it — its stored rate is stale, not a request.
 *  If the tempo leaves no allowed note (never reachable from the Tempo slider), snaps over the whole
 *  table instead of throwing; the resolver clamps the result into range. */
export function laneToSync(lane: BankLfoSettings, bpm: number): BankLfoSettings {
  if (isNoteValue(lane.sync)) return { ...lane };
  const allowed = allowedLaneNoteValues(bpm);
  return {
    ...lane,
    sync: nearestNoteValue(lane.rate, bpm, allowed.length > 0 ? allowed : NOTE_VALUES, 'hz'),
  };
}

/** Sync -> Free: keep what the user hears — the resolved Hz, quantised to the slider step and floored
 *  at one step so a slow note at a slow tempo can't round to 0 and stop a running lane. A lane that
 *  wasn't synced keeps its rate exactly (a held 0 Hz stays 0). */
export function laneToFree(lane: BankLfoSettings, bpm: number): BankLfoSettings {
  const { sync, ...rest } = lane;
  if (!isNoteValue(sync)) return rest;
  const hz = quantizeClean(resolveLaneRateHz(lane, bpm), LFO_RATE_MIN, LFO_RATE_STEP);
  return { ...rest, rate: Math.max(LFO_RATE_STEP, hz) };
}

/** Free -> Sync for Delay Time; same shape and fallbacks as laneToSync, in seconds. */
export function delayToSync(delay: DelaySettings, bpm: number): DelaySettings {
  if (isNoteValue(delay.sync)) return { ...delay };
  const allowed = allowedDelayNoteValues(bpm);
  return {
    ...delay,
    sync: nearestNoteValue(
      delay.delayTime,
      bpm,
      allowed.length > 0 ? allowed : NOTE_VALUES,
      'seconds'
    ),
  };
}

/** Sync -> Free for Delay Time: the resolved seconds, quantised to the slider step. */
export function delayToFree(delay: DelaySettings, bpm: number): DelaySettings {
  const { sync, ...rest } = delay;
  if (!isNoteValue(sync)) return rest;
  return {
    ...rest,
    delayTime: quantizeClean(
      resolveDelayTimeSeconds(delay, bpm),
      DELAY_TIME_RANGE_SECONDS.min,
      DELAY_TIME_STEP_SECONDS
    ),
  };
}

// ========================================
// SEEDING (§1.7)
// ========================================

/** A uniform pick over the first non-empty candidate band at `bpm` (candidates in NOTE_VALUES
 *  order), driven by one seeded draw `t` in [0, 1] — out-of-range `t` clamps. `undefined` when every
 *  band is empty, so the caller leaves the target Free. */
export function pickSeedNoteValue(
  t: number,
  bpm: number,
  bands: readonly { min: number; max: number }[],
  unit: 'seconds' | 'hz'
): NoteValue | undefined {
  for (const band of bands) {
    const candidates = allowedNoteValues(bpm, band, unit);
    if (candidates.length === 0) continue;
    const index = Math.floor(clamp(t, 0, 1) * candidates.length);
    return candidates[Math.min(index, candidates.length - 1)];
  }
  return undefined;
}
