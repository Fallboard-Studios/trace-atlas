/**
 * The LFO Bank engine (docs/specs/LFO_BANK.md §1.2): four world-level, app-
 * lifetime LFOs ("lanes") replace one private Tone.LFO per modulation
 * target. A target no longer owns an oscillator — it links to a lane and
 * stores a depth; this module hangs a single Gain off that lane per link.
 *
 * Renamed from lfoBank.ts over the old per-target src/engine/lfoEngine.ts
 * (docs/tasks/LFO_BANK.md Task 16, which deleted that old file along with
 * lfoDrift.ts and robotLfoPriming.ts). `resolveLfoOutputRange`/
 * `ROBOT_LFO_FIELD_RANGE`/`globalSeedRangeKey` below are this module's own —
 * nothing outside it shares them.
 */

// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

import { AudioEngine } from './AudioEngine';
import { clamp, isAudioContextRunning, centeredSwingFromRange, connectAdditively } from './lfoShared';
import { DEFAULT_BANK_LFO } from '../data/lfoConfig';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from '../data/globalAudioSeedRanges';
import {
  LFO_LANE_IDS,
  LFO_RATE_MIN,
  LFO_RATE_MAX,
  LFO_DEPTH_MIN,
  LFO_DEPTH_MAX,
  ROBOT_LFO_TARGET_IDS,
  type LfoLaneId,
  type BankLfoSettings,
  type LfoLink,
  type LfoShape,
  type LfoTargetId,
  type RobotLfoTargetId,
  type GlobalLfoTargetId,
} from '../types/lfo';
import { devWarn } from '../utils/helpers';
import { MIN_LEAD } from '../constants';

// ========================================
// STATE (module-scoped, runtime-only — never put these in Zustand)
// ========================================

interface LaneNodes {
  lfo: Tone.LFO;
  trunk: Tone.Gain;
  drift: Tone.LFO;
  rateDriftGain: Tone.Gain;
  depthDriftGain: Tone.Gain;
}

/** One entry per lane, built once by primeLfoBank — never rebuilt or disposed (app-lifetime, spec §1.2 Lifecycle). */
const bank = new Map<LfoLaneId, LaneNodes>();

/** Each lane's current settings — readable via getBankSettings before primeLfoBank has run, same
 *  DEFAULT_* fallback pattern the old per-target engine's getLfoSettings used. */
const bankSettings = new Map<LfoLaneId, BankLfoSettings>();

/** True once primeLfoBank has successfully built the bank — makes every later call a no-op
 *  (Task 7's own scope; re-priming across a power cycle is Task 10's wiring, not this module's). */
let primed = false;

interface LinkRecord {
  target: LfoTargetId;
  robotId?: string;
  lane: LfoLaneId;
  depth: number;
  linkGain: Tone.Gain;
  /** The exact Signal/Param object this link is wired to — lets a rebuilt voice's new Signal be detected and re-wired. */
  signal: unknown;
  /** True while this link's Gain has been pulled out of the graph by setFilterLinksEnabled(false) — the record itself survives. */
  suspended: boolean;
}

/** Every live link, keyed by instanceKey(target, robotId) — the same keying scheme the old lfoEngine.ts used. */
const links = new Map<string, LinkRecord>();

/** Whether the four lanes' drift secondaries are currently wired in — the Audio Load Budget's drift tier (setDriftEnabled). */
let driftEnabled = true;

/** Whether lpf./hpf. link Gains may be connected right now — the Audio Load Budget's filter tier (setFilterLinksEnabled). */
let filterLinksEnabled = true;

/** ~33-second cycle for each lane's drift secondary — the same fixed rate the old per-group drift pools used
 *  (lfoDrift.ts's DRIFT_RATE_HZ), never exposed in the UI (only the drift AMOUNT is user-facing). */
const DRIFT_RATE_HZ = 0.03;

// ========================================
// INTERNAL HELPERS
// ========================================

function instanceKey(target: LfoTargetId, robotId?: string): string {
  return robotId ? `${robotId}:${target}` : target;
}

function isRobotTarget(target: LfoTargetId): boolean {
  return (ROBOT_LFO_TARGET_IDS as readonly string[]).includes(target);
}

/** Global filter (frequency/Q) targets — the only links setFilterLinksEnabled can suspend. */
function isFilterTarget(target: LfoTargetId): boolean {
  return /^(lpf|hpf)\./.test(target);
}

/** Real value range per robot field — copied from lfoEngine.ts (see this file's header comment). */
const ROBOT_LFO_FIELD_RANGE: Record<string, { min: number; max: number }> = {
  gain: { min: 0, max: 2 },
  detune: { min: -50, max: 50 },
};

/** Translates a GlobalLfoTargetId's 'lpf.'/'hpf.' short form to the 'filterLPF.'/'filterHPF.' keys
 *  GLOBAL_AUDIO_SEED_RANGES uses — copied from lfoEngine.ts (see this file's header comment). */
function globalSeedRangeKey(target: GlobalLfoTargetId): GlobalAudioSeedFieldKey {
  if (target.startsWith('lpf.')) return `filterLPF.${target.slice(4)}` as GlobalAudioSeedFieldKey;
  if (target.startsWith('hpf.')) return `filterHPF.${target.slice(4)}` as GlobalAudioSeedFieldKey;
  return target as GlobalAudioSeedFieldKey;
}

/** The field's own absolute range — NOT what gets applied directly to a Gain's value; see
 *  centeredSwingFromRange (lfoShared.ts) for why. Copied from lfoEngine.ts (see this file's header comment). */
function resolveLfoOutputRange(target: LfoTargetId): { min: number; max: number } | null {
  const robotFieldMatch = /^layer\d+\.(gain|detune)$/.exec(target);
  if (robotFieldMatch) return ROBOT_LFO_FIELD_RANGE[robotFieldMatch[1]];
  if (!isRobotTarget(target)) {
    const range = GLOBAL_AUDIO_SEED_RANGES[globalSeedRangeKey(target as GlobalLfoTargetId)];
    return range ? { min: range.min, max: range.max } : null;
  }
  return null;
}

/** Recompute one lane's two drift Gains from its current rate and drift amounts — called after primeLfoBank,
 *  setBankRate and both drift setters (spec §1.2's refreshLaneDrift). A no-op if the lane hasn't been primed. */
function refreshLaneDrift(lane: LfoLaneId): void {
  const nodes = bank.get(lane);
  if (!nodes) return;
  const settings = getBankSettings(lane);
  const rateSwing = centeredSwingFromRange({ min: LFO_RATE_MIN, max: LFO_RATE_MAX }, nodes.lfo.frequency.value as number);
  nodes.rateDriftGain.gain.value = settings.rateDrift * rateSwing.max;
  // The bank LFO's own amplitude is pinned at 1 and never moves — depthDrift wobbles the TRUNK's gain instead
  // (spec assumption 4), so its swing is fixed at centeredSwingFromRange({0, 2}, 1).max === 1, not read from the node.
  const depthSwing = centeredSwingFromRange({ min: 0, max: 2 }, 1);
  nodes.depthDriftGain.gain.value = settings.depthDrift * depthSwing.max;
}

/** Pull a link's Gain out of the graph without forgetting it — setFilterLinksEnabled's suspend side. */
function suspendLink(key: string): void {
  const record = links.get(key);
  if (!record || record.suspended) return;
  try {
    record.linkGain.disconnect();
  } catch (err) {
    devWarn('[lfoBank] suspendLink: disconnect failed', err);
  }
  record.suspended = true;
}

/** Reverse suspendLink — reconnects trunk -> gain -> signal at the link's existing gain value. */
function restoreLink(key: string): void {
  const record = links.get(key);
  if (!record || !record.suspended) return;
  const lane = bank.get(record.lane);
  if (!lane) return;
  lane.trunk.connect(record.linkGain);
  try {
    connectAdditively(record.linkGain, record.signal);
  } catch (err) {
    devWarn('[lfoBank] restoreLink: connect failed', err);
    return;
  }
  record.suspended = false;
}

/** Full, one-way teardown of a link's Gain — disconnect both edges then dispose. Never leaves a
 *  record behind; callers (unlinkTarget, disposeRobotLinks, a lane change inside linkTarget)
 *  delete the map entry themselves. */
function teardownLink(record: LinkRecord): void {
  // Disconnect the trunk's OWN edge to this gain first — Web Audio's disconnect() only clears a
  // node's own outgoing connections, never edges where it's the destination. record.linkGain's
  // own .disconnect()/.dispose() below only ever clear its outgoing edge (to the target Signal/
  // Param); without this, the lane's app-lifetime trunk keeps a live connection to a gain that's
  // "disposed" everywhere else, leaking one dead node per unlink/lane-change/robot-dispose for
  // the rest of the session.
  const lane = bank.get(record.lane);
  if (lane) {
    try {
      lane.trunk.disconnect(record.linkGain);
    } catch (err) {
      devWarn('[lfoBank] teardownLink: trunk disconnect failed', err);
    }
  }
  try {
    record.linkGain.disconnect();
  } catch (err) {
    devWarn('[lfoBank] teardownLink: disconnect failed', err);
  }
  try {
    record.linkGain.dispose();
  } catch (err) {
    devWarn('[lfoBank] teardownLink: dispose failed', err);
  }
}

// ========================================
// PUBLIC API — BANK
// ========================================

/**
 * Build the four lanes (if not already built) and start them at Tone.now() + MIN_LEAD — the same
 * CLAUDE.md MIN_LEAD rule every audio-scheduling call site applies, here so a roster of links
 * connecting in the same synchronous burst doesn't click the lanes into existence mid-render.
 * No-ops before the AudioContext is running and on every call after the first successful one
 * (re-priming across a power cycle is Task 10's AudioEngine.start() wiring, not this function's job).
 */
function primeLfoBank(settings: Record<LfoLaneId, BankLfoSettings>): void {
  if (primed) return;
  if (!isAudioContextRunning()) return;

  const startAt = Tone.now() + MIN_LEAD;
  LFO_LANE_IDS.forEach((lane, index) => {
    const laneSettings = settings[lane];
    const lfo = new Tone.LFO({ frequency: laneSettings.rate, type: laneSettings.shape, min: -1, max: 1 });
    lfo.amplitude.value = 1; // every link sees the same unit signal — depth lives entirely in the link Gain
    const trunk = new Tone.Gain(1); // rests at 1; depth-drift wobbles this, not the lfo's own amplitude (spec assumption 4)
    lfo.connect(trunk);

    const drift = new Tone.LFO({ frequency: DRIFT_RATE_HZ, type: 'sine', phase: (360 / LFO_LANE_IDS.length) * index });
    const rateDriftGain = new Tone.Gain(0);
    const depthDriftGain = new Tone.Gain(0);
    drift.connect(rateDriftGain);
    connectAdditively(rateDriftGain, lfo.frequency);
    drift.connect(depthDriftGain);
    connectAdditively(depthDriftGain, trunk.gain);

    bank.set(lane, { lfo, trunk, drift, rateDriftGain, depthDriftGain });
    bankSettings.set(lane, { ...laneSettings });
    refreshLaneDrift(lane);

    lfo.start(startAt);
    drift.start(startAt);
  });
  primed = true;
}

/** Current settings for a lane — DEFAULT_BANK_LFO until primeLfoBank has run, mirroring the old
 *  per-target engine's getLfoSettings fallback. Always a fresh copy — callers never mutate the engine's own. */
function getBankSettings(lane: LfoLaneId): BankLfoSettings {
  return { ...(bankSettings.get(lane) ?? DEFAULT_BANK_LFO) };
}

function setBankShape(lane: LfoLaneId, shape: LfoShape): void {
  bankSettings.set(lane, { ...getBankSettings(lane), shape });
  const nodes = bank.get(lane);
  if (nodes) nodes.lfo.type = shape;
}

function setBankRate(lane: LfoLaneId, hz: number): void {
  const clamped = clamp(hz, LFO_RATE_MIN, LFO_RATE_MAX);
  bankSettings.set(lane, { ...getBankSettings(lane), rate: clamped });
  const nodes = bank.get(lane);
  if (nodes) nodes.lfo.frequency.value = clamped;
  refreshLaneDrift(lane);
}

function setBankRateDrift(lane: LfoLaneId, value: number): void {
  bankSettings.set(lane, { ...getBankSettings(lane), rateDrift: clamp(value, -1, 1) });
  refreshLaneDrift(lane);
}

function setBankDepthDrift(lane: LfoLaneId, value: number): void {
  bankSettings.set(lane, { ...getBankSettings(lane), depthDrift: clamp(value, -1, 1) });
  refreshLaneDrift(lane);
}

// ========================================
// PUBLIC API — LINKS
// ========================================

/**
 * Link (or unlink) a modulation target to a lane. Returns false — never throws — when: a robot-
 * scoped target is called without a robotId, AudioEngine has no live Signal for the target, or the
 * named lane hasn't been primed yet (every real caller is downstream of AudioEngine.start(), so
 * this is a "primeLfoBank hasn't run" guard, not an expected runtime path). A depth-only edit on an
 * already-connected lane/signal pair updates the Gain's value in place — no reconnect, no click.
 */
function linkTarget(target: LfoTargetId, link: LfoLink, robotId?: string): boolean {
  const key = instanceKey(target, robotId);

  if (link.lane === null) {
    unlinkTarget(target, robotId);
    return true;
  }
  if (isRobotTarget(target) && !robotId) return false;

  const signal = isRobotTarget(target)
    ? AudioEngine.getRobotModulationTarget(robotId!, target as RobotLfoTargetId)
    : AudioEngine.getGlobalModulationTarget(target as GlobalLfoTargetId);
  if (!signal) return false;

  const lane = bank.get(link.lane);
  if (!lane) return false;

  const range = resolveLfoOutputRange(target);
  const swing = range
    ? centeredSwingFromRange(range, (signal as { value: number }).value)
    : { min: 0, max: 0 };
  const gainValue = (clamp(link.depth, LFO_DEPTH_MIN, LFO_DEPTH_MAX) / 100) * swing.max;

  const existing = links.get(key);
  if (existing && existing.signal === signal && existing.lane === link.lane) {
    existing.depth = link.depth;
    existing.linkGain.gain.value = gainValue;
    return true;
  }
  if (existing) {
    teardownLink(existing); // lane change or a rebuilt voice's new Signal — never leave two live
  }

  const linkGain = new Tone.Gain(gainValue);
  lane.trunk.connect(linkGain);
  try {
    connectAdditively(linkGain, signal);
  } catch (err) {
    devWarn('[lfoBank] linkTarget: connect failed', err);
    linkGain.dispose();
    return false;
  }
  links.set(key, { target, robotId, lane: link.lane, depth: link.depth, linkGain, signal, suspended: false });
  if (isFilterTarget(target) && !filterLinksEnabled) suspendLink(key); // connected above, then immediately pulled — a filter link made while the dial is off is created suspended
  return true;
}

/** Reverse linkTarget: disconnects and disposes the link's Gain. Safe/no-op if nothing was linked. */
function unlinkTarget(target: LfoTargetId, robotId?: string): void {
  const key = instanceKey(target, robotId);
  const existing = links.get(key);
  if (!existing) return;
  teardownLink(existing);
  links.delete(key);
}

/** Full teardown of every link belonging to one robot — the "this robot is gone for good" counterpart
 *  to unlinkTarget, called from the same localeStore sites the old disposeRobotLfos was. */
function disposeRobotLinks(robotId: string): void {
  for (const [key, record] of links) {
    if (record.robotId === robotId) {
      teardownLink(record);
      links.delete(key);
    }
  }
}

// ========================================
// PUBLIC API — LOAD DIAL
// ========================================

/** Detach/re-attach every lane's drift secondary (the Audio Load Budget's drift tier). Idempotent;
 *  the seeded/edited drift amounts themselves are never touched — only the links are suspended. */
function setDriftEnabled(enabled: boolean): void {
  if (enabled === driftEnabled) return;
  driftEnabled = enabled;
  for (const [lane, nodes] of bank) {
    if (!enabled) {
      try {
        nodes.rateDriftGain.disconnect();
      } catch (err) {
        devWarn('[lfoBank] setDriftEnabled: rate-drift disconnect failed', err);
      }
      try {
        nodes.depthDriftGain.disconnect();
      } catch (err) {
        devWarn('[lfoBank] setDriftEnabled: depth-drift disconnect failed', err);
      }
    } else {
      connectAdditively(nodes.rateDriftGain, nodes.lfo.frequency);
      connectAdditively(nodes.depthDriftGain, nodes.trunk.gain);
      refreshLaneDrift(lane);
    }
  }
}

/** Suspend/restore every lpf./hpf. link's Gain (the Audio Load Budget's filter tier). EQ-gain
 *  links and every robot link are never affected. Idempotent; link records are always kept. */
function setFilterLinksEnabled(enabled: boolean): void {
  if (enabled === filterLinksEnabled) return;
  filterLinksEnabled = enabled;
  for (const [key, record] of links) {
    if (!isFilterTarget(record.target)) continue;
    if (enabled) restoreLink(key);
    else suspendLink(key);
  }
}

// ========================================
// EXPORT
// ========================================

export const lfoEngine = {
  primeLfoBank,
  setBankShape,
  setBankRate,
  setBankRateDrift,
  setBankDepthDrift,
  getBankSettings,
  linkTarget,
  unlinkTarget,
  disposeRobotLinks,
  setDriftEnabled,
  setFilterLinksEnabled,
};
