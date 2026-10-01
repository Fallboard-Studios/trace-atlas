// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

import { AudioEngine } from './AudioEngine';
import { DEFAULT_LFO_SETTINGS } from '../data/lfoConfig';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from '../data/globalAudioSeedRanges';
import { clamp, isAudioContextRunning, centeredSwingFromRange, connectAdditively } from './lfoShared';
import {
  driftGroupForTarget,
  attachDrift,
  detachDrift,
  refreshRateDriftGain,
  refreshDepthDriftGain,
  setGlobalRateDrift,
  setGlobalDepthDrift,
  isDriftSuppressed,
  setDriftSuppressed,
} from './lfoDrift';

import type { LfoSettings, RobotLfoTargetId, GlobalLfoTargetId, LfoTargetId } from '../types/lfo';
import { LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX, ROBOT_LFO_TARGET_IDS } from '../types/lfo';
import { devWarn } from '../utils/helpers';
import { MIN_LEAD } from '../constants';

// ========================================
// STATE (module-scoped, runtime-only — never put these in Zustand)
// ========================================

/**
 * Live Tone.LFO nodes, keyed by instanceKey(target, robotId). Lazily
 * populated — no entry exists until the first setter or connect call for
 * that (target, robotId) pair (connect is Task 12's job, not this file's).
 */
const activeLfos = new Map<string, Tone.LFO>();

/** Persisted LfoSettings per instance key, independent of whether a live node exists yet. */
const settingsByKey = new Map<string, LfoSettings>();

/**
 * The specific Signal/Param object each instance key is currently connected
 * to. Makes repeated connectLfoTarget calls idempotent by our
 * own bookkeeping rather than leaning on the Web Audio spec's connect()
 * dedup guarantee (real, but not something a unit test against a mocked
 * Tone.LFO can verify) — and lets a changed signal (e.g. a rebuilt composite
 * voice) be detected and re-wired instead of silently left stale.
 */
const connectedSignals = new Map<string, unknown>();

/** The target each currently-connected instance key resolves to — set/cleared in lockstep with
 *  connectedSignals. Only needed for driftGroupForTarget (setDriftEnabled's own re-attach loop);
 *  robotId never matters there, so unlike the old policy-era `requested` map this carries just
 *  the target, not the robotId too. */
const connectedTargets = new Map<string, LfoTargetId>();

/**
 * Audio Load Budget (docs/tasks/LFO_BANK.md Task 4): whether filter (LPF/HPF frequency/Q) LFO links may be
 * connected right now. EQ-gain links and every robot LFO are always allowed — the engine owns this one rule
 * directly now, moved in from audioBudget.ts along with the old filter-target regex.
 */
let filterLfosEnabled = true;

/**
 * Filter-target instance keys currently suspended by the flag above — connected normally otherwise. A key here
 * always equals its own target string: filter targets are global-chain only, never robot-scoped, so no separate
 * robotId needs tracking to reconnect them later.
 */
const suspendedFilterLinks = new Set<string>();

// ========================================
// INTERNAL FUNCTIONS
// ========================================

/**
 * Robot-scoped targets need one live LFO per robot, not one shared across
 * all robots — 'robotId:target' disambiguates; global-chain targets (no
 * robotId) use the bare target id.
 */
function instanceKey(target: LfoTargetId, robotId?: string): string {
  return robotId ? `${robotId}:${target}` : target;
}

/** Whether a target belongs to the per-robot set (needs a robotId) vs. the global-chain set (doesn't). */
function isRobotTarget(target: LfoTargetId): boolean {
  return (ROBOT_LFO_TARGET_IDS as readonly string[]).includes(target);
}

/** Global filter (frequency/Q) LFO targets — the only ones setFilterLfosEnabled can suspend. */
function isFilterTarget(target: LfoTargetId): boolean {
  return /^(lpf|hpf)\./.test(target);
}

/**
 * Real value range per robot field, per docs/reference/ROBOT_DATA_GRID.md —
 * shared across all 3 layers, since the range depends on the field (gain,
 * detune), not which layer index it's on. Only gain/detune have a row — no
 * other field was ever an LFO target: 'volume' and 'pulseWidth' were
 * removed (docs/specs/LFO_LOAD_FIX.md assumption 9), and docs/specs/
 * LFO_BANK.md Task 1 cut the third oscillator-alignment target, which never
 * had a row here (see resolveLfoOutputRange's own comment below). 'gain' is
 * 0-2 because the per-layer Tone.Gain node rests at 1, so a 0-1 range would
 * pin its swing to 0.
 */
const ROBOT_LFO_FIELD_RANGE: Record<string, { min: number; max: number }> = {
  gain: { min: 0, max: 2 },
  detune: { min: -50, max: 50 },
};

/** Translates a GlobalLfoTargetId's 'lpf.'/'hpf.' short form (matching AudioEngine.setEffectBypass's
 * effect keys) to the 'filterLPF.'/'filterHPF.' keys GLOBAL_AUDIO_SEED_RANGES actually uses. */
function globalSeedRangeKey(target: GlobalLfoTargetId): GlobalAudioSeedFieldKey {
  if (target.startsWith('lpf.')) return `filterLPF.${target.slice(4)}` as GlobalAudioSeedFieldKey;
  if (target.startsWith('hpf.')) return `filterHPF.${target.slice(4)}` as GlobalAudioSeedFieldKey;
  return target as GlobalAudioSeedFieldKey; // eq3.* already matches directly
}

/**
 * Resolve the real min/max a target's Signal actually operates in. Reuses
 * GLOBAL_AUDIO_SEED_RANGES (Task 4/5) for global targets rather than
 * maintaining a second range table. Returns null for any id with no entry
 * in ROBOT_LFO_FIELD_RANGE or GLOBAL_AUDIO_SEED_RANGES — including an
 * oscillator-alignment target id removed by docs/specs/LFO_BANK.md Task 1,
 * which can still arrive as a stale string from an old session or share link.
 *
 * This is the field's own absolute range — NOT what gets applied directly to
 * lfo.min/lfo.max. See centeredSwingFromRange() (lfoShared.ts) for why.
 */
function resolveLfoOutputRange(target: LfoTargetId): { min: number; max: number } | null {
  const robotFieldMatch = /^layer\d+\.(gain|detune)$/.exec(target);
  if (robotFieldMatch) return ROBOT_LFO_FIELD_RANGE[robotFieldMatch[1]];
  if (!isRobotTarget(target)) {
    // Anything that isn't a robot target is a global-chain target.
    const range = GLOBAL_AUDIO_SEED_RANGES[globalSeedRangeKey(target as GlobalLfoTargetId)];
    return range ? { min: range.min, max: range.max } : null;
  }
  return null;
}

/** Apply a full LfoSettings object onto a live node (used at creation and by each setter). */
function applySettingsToNode(lfo: Tone.LFO, settings: LfoSettings): void {
  lfo.frequency.value = settings.rate;
  lfo.amplitude.value = settings.depth / 100;
  lfo.type = settings.shape;
}

/**
 * Lazily construct (or return the existing) Tone.LFO for an instance key.
 * This is the only place `new Tone.LFO(...)` is called — the sole trigger
 * for construction is a setter reaching this via getOrCreateLfo; getters and
 * start()/stop() on an unset target never call it (see their own bodies).
 */
function getOrCreateLfo(key: string, target: LfoTargetId, robotId?: string): Tone.LFO {
  let lfo = activeLfos.get(key);
  if (!lfo) {
    const settings = getLfoSettings(target, robotId);
    lfo = new Tone.LFO(settings.rate);
    applySettingsToNode(lfo, settings);
    activeLfos.set(key, lfo);
  }
  return lfo;
}

// ========================================
// PUBLIC API
// ========================================

/** Current settings for a target — DEFAULT_LFO_SETTINGS until a setter has been called. Never constructs a node. */
function getLfoSettings(target: LfoTargetId, robotId?: string): LfoSettings {
  return settingsByKey.get(instanceKey(target, robotId)) ?? DEFAULT_LFO_SETTINGS[target];
}

/**
 * Set the LFO's rate in Hz — a plain float, clamped to [LFO_RATE_MIN,
 * LFO_RATE_MAX]. Never a Time-string/note-division; no BeatClock or
 * Transport involvement in the value itself (spec §3 — rate stays free-
 * running, only start/stop are transport-gated, see start() below).
 */
function setLfoRate(target: LfoTargetId, hz: number, robotId?: string): void {
  const key = instanceKey(target, robotId);
  const clamped = clamp(hz, LFO_RATE_MIN, LFO_RATE_MAX);
  const updated: LfoSettings = { ...getLfoSettings(target, robotId), rate: clamped };
  settingsByKey.set(key, updated);
  getOrCreateLfo(key, target, robotId).frequency.value = clamped;
  refreshRateDriftGain(key); // no-op if this target has no drift link yet
}

/**
 * Set the LFO's depth as a percent (0-100), clamped to [LFO_DEPTH_MIN,
 * LFO_DEPTH_MAX]. Maps onto Tone.LFO's amplitude Param, which is a
 * 0-1 normalRange — Tone.LFO has no `depth` property of its own.
 */
function setLfoDepth(target: LfoTargetId, percent: number, robotId?: string): void {
  const key = instanceKey(target, robotId);
  const clamped = clamp(percent, LFO_DEPTH_MIN, LFO_DEPTH_MAX);
  const updated: LfoSettings = { ...getLfoSettings(target, robotId), depth: clamped };
  settingsByKey.set(key, updated);
  getOrCreateLfo(key, target, robotId).amplitude.value = clamped / 100;
  refreshDepthDriftGain(key); // no-op if this target has no drift link yet
}

/** Set the LFO's oscillator shape. */
function setLfoShape(target: LfoTargetId, shape: LfoSettings['shape'], robotId?: string): void {
  const key = instanceKey(target, robotId);
  const updated: LfoSettings = { ...getLfoSettings(target, robotId), shape };
  settingsByKey.set(key, updated);
  getOrCreateLfo(key, target, robotId).type = shape;
}

/**
 * Start an already-created LFO, gated by the AudioContext: no-ops (does not
 * call the underlying node's start()) unless Tone.getContext().state is
 * 'running' (not Transport state — see isAudioContextRunning() in
 * lfoShared.ts). Deliberately does NOT call Tone.LFO.sync() — per its own
 * doc comment, sync() ties frequency to the transport's BPM as well as
 * start/stop, which would tempo-couple the rate and violate the confirmed
 * intent that rate stays a free-running Hz value. If no node has been
 * created yet for this target (no setter/connect called), this is a no-op —
 * start() itself never lazily constructs a node. Starts at Tone.now() + MIN_LEAD,
 * never immediately: a roster-wide priming pass (robotLfoPriming.ts) can start a
 * dozen-plus LFOs in one synchronous burst, and starting them all at the
 * zero-lead "now" gives the audio thread no slack to finish building/connecting
 * that many nodes before the next render quantum needs them — audible as clicks
 * on load. The same CLAUDE.md MIN_LEAD rule AudioEngine.ts already applies to
 * note scheduling.
 */
function start(target: LfoTargetId, robotId?: string): void {
  const lfo = activeLfos.get(instanceKey(target, robotId));
  if (!lfo) return;
  if (!isAudioContextRunning()) return;
  lfo.start(Tone.now() + MIN_LEAD);
}

/** Stop an LFO if one exists. Always allowed, regardless of transport state — safe/idempotent if already stopped or never created. */
function stop(target: LfoTargetId, robotId?: string): void {
  activeLfos.get(instanceKey(target, robotId))?.stop();
}

/** Take an LFO out of the audio graph (disconnect, drop drift, stop the oscillator) without forgetting what it was connected to. */
function suspendConnection(key: string): void {
  if (connectedSignals.has(key)) {
    connectedSignals.delete(key);
    connectedTargets.delete(key);
    detachDrift(key);
    try {
      activeLfos.get(key)?.disconnect();
    } catch (err) {
      devWarn('[lfoEngine] suspendConnection: disconnect failed', err);
    }
  }
  activeLfos.get(key)?.stop();
}

/**
 * Turn drift ("stacked" LFOs) off or back on for the Audio Load budget. Off: every drift link is torn down and new
 * connections get none. On: drift is re-attached to every LFO that is connected right now, at the current drift amounts.
 * Idempotent; stored LFO settings and drift amounts are never touched.
 */
function setDriftEnabled(enabled: boolean): void {
  if (enabled !== isDriftSuppressed()) return;
  setDriftSuppressed(!enabled);
  if (!enabled) return;
  for (const key of connectedSignals.keys()) {
    const lfo = activeLfos.get(key);
    const target = connectedTargets.get(key);
    if (lfo && target) attachDrift(key, lfo, driftGroupForTarget(target));
  }
}

/**
 * Audio Load Budget (docs/tasks/LFO_BANK.md Task 4): turn filter (LPF/HPF frequency/Q) LFO links off or back on.
 * Off: every currently-connected filter key is suspended (disconnected, stopped, kept in suspendedFilterLinks so
 * it can be found again) and a filter key asked for while off is recorded suspended by connectOne without ever
 * being wired at all. On: every suspended filter key is connected (and started) for real, exactly once each.
 * EQ-gain links and every robot LFO are never affected. Idempotent; stored LFO settings are never touched.
 */
function setFilterLfosEnabled(enabled: boolean): void {
  if (enabled === filterLfosEnabled) return;
  filterLfosEnabled = enabled;
  if (!enabled) {
    for (const key of [...connectedSignals.keys()]) {
      if (isFilterTarget(key as LfoTargetId)) {
        suspendConnection(key);
        suspendedFilterLinks.add(key);
      }
    }
    return;
  }
  for (const key of [...suspendedFilterLinks]) {
    suspendedFilterLinks.delete(key);
    if (connectOne(key as LfoTargetId)) start(key as LfoTargetId);
  }
}

function connectLfoTarget(target: LfoTargetId, robotId?: string): boolean {
  return connectOne(target, robotId);
}

function disconnectLfoTarget(target: LfoTargetId, robotId?: string): void {
  disconnectOne(target, robotId);
}

/**
 * Connect this target's LFO to its live modulation destination. Returns
 * false — never throws — when: a robot-scoped target is called without a
 * robotId (nothing to resolve against), or AudioEngine has no live Signal
 * for the target (an unreserved robot, or an id outside the current target
 * set — including a stale oscillator-alignment target id from before
 * docs/specs/LFO_BANK.md Task 1, which never resolves a Signal).
 */
function connectOne(target: LfoTargetId, robotId?: string): boolean {
  const key = instanceKey(target, robotId);

  // A robot-scoped target needs a robotId to resolve against — nothing to connect without one.
  if (isRobotTarget(target) && !robotId) return false;

  // Audio Load Budget (docs/tasks/LFO_BANK.md Task 4): a filter target asked for while the dial holds filter
  // LFOs off is recorded as suspended and declared connected, but never actually resolved or wired —
  // setFilterLfosEnabled(true) is what calls connectOne again for real.
  if (!filterLfosEnabled && isFilterTarget(target)) {
    suspendedFilterLinks.add(key);
    return true;
  }
  suspendedFilterLinks.delete(key);

  // signal's type is inferred from AudioEngine's own return types (Tasks 9/10) —
  // no local `any` needed here even though that union isn't re-exported by name.
  const signal = isRobotTarget(target)
    ? AudioEngine.getRobotModulationTarget(robotId!, target as RobotLfoTargetId)
    : AudioEngine.getGlobalModulationTarget(target as GlobalLfoTargetId);
  if (!signal) return false;

  const lfo = getOrCreateLfo(key, target, robotId);
  // Read the target's CURRENT base value (both Signal and Param expose a
  // plain numeric .value getter) — used to bound the swing below.
  // connectAdditively (further down) re-reads this same value itself right
  // before connecting, to restore it afterward — nothing mutates it in
  // between, so the two reads are guaranteed identical.
  const currentValue = (signal as unknown as { value: number }).value;
  const range = resolveLfoOutputRange(target);
  if (range) {
    const swing = centeredSwingFromRange(range, currentValue);
    lfo.min = swing.min;
    lfo.max = swing.max;
  }

  if (connectedSignals.get(key) === signal) {
    attachDrift(key, lfo, driftGroupForTarget(target)); // already connected to this exact signal — no-op, never a second .connect() — but drift still needs to be (idempotently) attached
    return true;
  }

  if (connectedSignals.has(key)) {
    // Connected to a different (stale) signal — e.g. a rebuilt composite
    // voice resolved a new Gain node for the same target — reverse the old
    // connection before wiring the new one, rather than leaving both live.
    try {
      lfo.disconnect();
    } catch (err) {
      devWarn('[lfoEngine] connectLfoTarget: disconnect of stale signal failed', err);
    }
  }

  // Tone.Signal defaults `override: true`, which makes Tone's own
  // connectSignal() (invoked internally by the connect below) immediately
  // cancelScheduledValues + setValueAtTime(0, 0) on the destination and
  // permanently mark it "overridden" — the INSTANT .connect() runs, before
  // the LFO has even started oscillating, and regardless of what lfo.min/
  // lfo.max are set to. For a filter's frequency Signal, that's a step
  // change to an invalid 0 Hz cutoff every single time an LFO connects —
  // verified directly against Tone.js's own source (signal/Signal.ts). It
  // also silently discards whatever the target's own value was, which is
  // exactly the "additive on top of the current value" assumption
  // centeredSwingFromRange() above depends on. For a Tone.Param destination
  // (e.g. robot Gain targets — Tone.Gain.gain), there's no `override` escape
  // hatch at all — connecting ALWAYS resets its value to 0 regardless
  // (connectSignal()'s `destination instanceof Param` branch is
  // unconditional, unlike Signal's) — but a Param also never gets marked
  // permanently "overridden" the way a Signal does, so a plain write
  // afterward is enough to undo it. connectAdditively (lfoShared.ts) handles
  // both cases with the same disable-then-restore sequence.
  try {
    connectAdditively(lfo, signal);
  } catch (err) {
    devWarn('[lfoEngine] connectLfoTarget: connect failed', err);
    return false;
  }

  connectedSignals.set(key, signal);
  connectedTargets.set(key, target);
  attachDrift(key, lfo, driftGroupForTarget(target));
  return true;
}

/** Reverse connectLfoTarget: disconnects the live node. Safe/no-op if nothing was connected. */
function disconnectOne(target: LfoTargetId, robotId?: string): void {
  const key = instanceKey(target, robotId);
  // An explicit disconnect (the user set the rate to 0, or the robot is gone) withdraws it for good — unlike
  // the budget's own suspensions (suspendConnection/setFilterLfosEnabled), this is never reconnected later.
  suspendedFilterLinks.delete(key);
  connectedSignals.delete(key);
  connectedTargets.delete(key);
  detachDrift(key);
  try {
    activeLfos.get(key)?.disconnect();
  } catch (err) {
    devWarn('[lfoEngine] disconnectLfoTarget: disconnect failed', err);
  }
}

/**
 * Full, one-way teardown of every robot-scoped LFO instance for one robot —
 * the "this robot is gone for good" counterpart to disconnectLfoTarget
 * (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 1), called only from a robot's
 * real removal (localeStore.ts's removeRobot/removeLocale), never from the
 * release-then-reserve power-cycle path (spawnSystem.ts's
 * reRegisterAllRobotsAudio) — that path still expects a robot's LFO state to
 * survive, and this function permanently discards it. Unlike
 * disconnectLfoTarget (reversible — a user can drag rate back up and expect
 * the same settings/node to still exist), this also disposes the underlying
 * Tone.LFO and removes it from activeLfos, and removes the persisted
 * LfoSettings from settingsByKey, so nothing about this robot's LFO state
 * lingers in module-scoped state forever.
 */
function disposeRobotLfos(robotId: string): void {
  for (const target of ROBOT_LFO_TARGET_IDS) {
    const key = instanceKey(target, robotId);
    disconnectLfoTarget(target, robotId);
    const lfo = activeLfos.get(key);
    if (lfo) {
      try {
        lfo.dispose();
      } catch (err) {
        devWarn('[lfoEngine] disposeRobotLfos: dispose failed', err);
      }
      activeLfos.delete(key);
    }
    settingsByKey.delete(key);
  }
}

export const lfoEngine = {
  getLfoSettings,
  setLfoRate,
  setLfoDepth,
  setLfoShape,
  start,
  stop,
  connectLfoTarget,
  disconnectLfoTarget,
  disposeRobotLfos,
  setDriftEnabled,
  setFilterLfosEnabled,
  setGlobalRateDrift,
  setGlobalDepthDrift,
};
