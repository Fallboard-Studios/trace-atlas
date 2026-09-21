// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

import { AudioEngine } from './AudioEngine';
import { scheduleRepeat, cancelSchedule } from './beatClock';
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

import type { OscillatorLayer } from '../types/layeredAudio';
import type { LfoSettings, LfoShape, RobotLfoTargetId, GlobalLfoTargetId, LfoTargetId } from '../types/lfo';
import { LFO_RATE_MIN, LFO_RATE_MAX, LFO_DEPTH_MIN, LFO_DEPTH_MAX, ROBOT_LFO_TARGET_IDS } from '../types/lfo';
import { devWarn } from '../utils/helpers';

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
 * Manual-polling fallback state for 'layerN.phase' targets — Tone.js has no
 * connectable Signal for oscillator phase (verified against the real synth
 * construction code in AudioEngine.ts, not assumed; see spec §7.1). Keyed
 * the same as activeLfos/settingsByKey.
 */
interface PhaseFallback {
  scheduleId: string;
  robotId: string;
  layerIndex: number;
  startTime: number;
}
const phaseFallbacks = new Map<string, PhaseFallback>();

/**
 * The specific Signal/Param object each instance key is currently connected
 * to (Signal-based targets only — phase's fallback tracks its own state via
 * phaseFallbacks). Makes repeated connectLfoTarget calls idempotent by our
 * own bookkeeping rather than leaning on the Web Audio spec's connect()
 * dedup guarantee (real, but not something a unit test against a mocked
 * Tone.LFO can verify) — and lets a changed signal (e.g. a rebuilt composite
 * voice) be detected and re-wired instead of silently left stale.
 */
const connectedSignals = new Map<string, unknown>();

/**
 * Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §1.4): an optional predicate the budget system installs saying
 * whether an LFO may be connected right now — `(target, robotId, connectedRobotLfos)`, where the count is the audio-rate
 * robot LFOs already connected, not including the one being asked about. `null` (the default) allows everything.
 * A tier only SUSPENDS: it never edits an LFO's stored settings, it just declines to connect it.
 */
type LfoPolicy = (target: LfoTargetId, robotId: string | undefined, connectedRobotLfos: number) => boolean;
let policy: LfoPolicy | null = null;

/** Every LFO a caller asked to connect, so a policy change can restore the ones it had suspended. Cleared by an explicit disconnect. */
const requested = new Map<string, { target: LfoTargetId; robotId?: string }>();

/** "Held off": requested (rate > 0) but not connected because of the policy. An LFO at rate 0 is never held off. */
const heldOff = new Set<string>();

/** Phase modulates around this center (degrees) — the midpoint of the 0-360 range
 * ROBOT_DATA_GRID.md's Phase field documents. Depth scales how far it swings from
 * there, not around the layer's own current phase value (that would require
 * lfoEngine to read robot state directly, which stays AudioEngine/store territory —
 * a deliberate Phase-0 scope choice, revisit once UI/testing calls for it). */
const PHASE_CENTER_DEGREES = 180;
/** Polling granularity for the phase fallback — matches BeatClock's own internal tick. */
const PHASE_POLL_INTERVAL = '16n';

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

/**
 * Real value range per robot field, per docs/reference/ROBOT_DATA_GRID.md —
 * shared across all 3 layers, since the range depends on the field (gain,
 * detune, pulseWidth), not which layer index it's on. 'phase' is
 * deliberately absent — the phase-polling fallback computes its own range
 * independently (PHASE_CENTER_DEGREES), it never reaches this lookup.
 *
 * 'volume' is deliberately 0-2, NOT the 0-1 domain ROBOT_DATA_GRID.md
 * documents for the Volume slider itself. getRobotModulationTarget resolves
 * 'volume' to the composite voice's own `output` Gain node (compositeVoice.ts)
 * — an internal mix-stage node constructed at a fixed 1 and never written to
 * in production, entirely separate from the robot's masterVolume/bus-gain
 * fader. A 0-1 range put that permanent value of 1 exactly on the range's own
 * max edge, so centeredSwingFromRange's min(distanceToMin, distanceToMax) was
 * unconditionally 0 — the Volume LFO connected and took rate/depth/shape, but
 * could never produce any audible swing, for any setting. 0-2 matches 'gain'
 * (the other field backed by an identical Tone.Gain(1) node), putting 1 at
 * the midpoint instead of the edge.
 */
const ROBOT_LFO_FIELD_RANGE: Record<string, { min: number; max: number }> = {
  volume: { min: 0, max: 2 },
  gain: { min: 0, max: 2 },
  detune: { min: -50, max: 50 },
  pulseWidth: { min: 0, max: 1 },
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
 * maintaining a second range table. Returns null for targets with no
 * meaningful output range here (phase, handled entirely separately).
 *
 * This is the field's own absolute range — NOT what gets applied directly to
 * lfo.min/lfo.max. See centeredSwingFromRange() (lfoShared.ts) for why.
 */
function resolveLfoOutputRange(target: LfoTargetId): { min: number; max: number } | null {
  if (target === 'volume') return ROBOT_LFO_FIELD_RANGE.volume;
  const robotFieldMatch = /^layer\d+\.(gain|detune|pulseWidth)$/.exec(target);
  if (robotFieldMatch) return ROBOT_LFO_FIELD_RANGE[robotFieldMatch[1]];
  if (!isRobotTarget(target)) {
    // Anything that isn't a robot target and isn't 'volume' is a global-chain target.
    const range = GLOBAL_AUDIO_SEED_RANGES[globalSeedRangeKey(target as GlobalLfoTargetId)];
    return range ? { min: range.min, max: range.max } : null;
  }
  return null;
}

/** Unit-amplitude waveform value in [-1, 1] for a given shape at a given phase angle (radians). */
function waveformUnit(shape: LfoShape, phaseRadians: number): number {
  const twoPi = Math.PI * 2;
  const t = ((phaseRadians % twoPi) + twoPi) % twoPi;
  switch (shape) {
    case 'sine':
      return Math.sin(t);
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(t));
    case 'square':
      return t < Math.PI ? 1 : -1;
    case 'sawtooth':
      return t / Math.PI - 1;
    default:
      return 0;
  }
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
 * start() itself never lazily constructs a node.
 */
function start(target: LfoTargetId, robotId?: string): void {
  const lfo = activeLfos.get(instanceKey(target, robotId));
  if (!lfo) return;
  if (!isAudioContextRunning()) return;
  lfo.start();
}

/** Stop an LFO if one exists. Always allowed, regardless of transport state — safe/idempotent if already stopped or never created. */
function stop(target: LfoTargetId, robotId?: string): void {
  activeLfos.get(instanceKey(target, robotId))?.stop();
}

/**
 * Start the manual-polling fallback for a 'layerN.phase' target: recomputes
 * a waveform value each tick from the target's current LfoSettings and
 * reapplies it via AudioEngine.updateVoiceLayerParams — a periodic re-.set(),
 * not a native .connect(). Uses beatClock's Transport-driven scheduleRepeat
 * (never a raw JS timer, per CLAUDE.md), matching the same transport-gated
 * spirit as start()/stop() above.
 */
function startPhaseFallback(key: string, target: RobotLfoTargetId, robotId: string, layerIndex: number): void {
  const startTime = Tone.now();
  const scheduleId = scheduleRepeat(PHASE_POLL_INTERVAL, () => {
    const settings = getLfoSettings(target, robotId);
    const elapsed = Tone.now() - startTime;
    const angle = 2 * Math.PI * settings.rate * elapsed;
    const unit = waveformUnit(settings.shape, angle);
    const swing = (settings.depth / 100) * PHASE_CENTER_DEGREES;
    const phase = clamp(PHASE_CENTER_DEGREES + unit * swing, 0, 360);

    const layers: Partial<OscillatorLayer>[] = [];
    layers[layerIndex] = { phase };
    AudioEngine.updateVoiceLayerParams(robotId, layers as OscillatorLayer[]);
  });
  phaseFallbacks.set(key, { scheduleId, robotId, layerIndex, startTime });
}

function stopPhaseFallback(key: string): void {
  const entry = phaseFallbacks.get(key);
  if (!entry) return;
  cancelSchedule(entry.scheduleId);
  phaseFallbacks.delete(key);
}

/** Audio-rate robot LFOs currently connected (phase LFOs poll at control rate and are not in connectedSignals), excluding `exceptKey`. */
function connectedRobotLfoCount(exceptKey?: string): number {
  let count = 0;
  for (const key of connectedSignals.keys()) {
    if (key !== exceptKey && requested.get(key)?.robotId) count++;
  }
  return count;
}

function isAllowed(target: LfoTargetId, robotId: string | undefined, key: string): boolean {
  return policy === null || policy(target, robotId, connectedRobotLfoCount(key));
}

/** Take an LFO out of the audio graph (disconnect, drop drift, stop the oscillator) WITHOUT forgetting it was requested. */
function suspendConnection(key: string): void {
  if (phaseFallbacks.has(key)) {
    stopPhaseFallback(key);
  } else if (connectedSignals.has(key)) {
    connectedSignals.delete(key);
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
    const request = requested.get(key);
    if (lfo && request) attachDrift(key, lfo, driftGroupForTarget(request.target));
  }
}

/** Install (or with `null` remove) the Audio Load policy. Does not itself change any connection — call reconcileLfos(). */
function setLfoPolicy(next: LfoPolicy | null): void {
  policy = next;
}

/**
 * Re-apply the policy to every LFO that was requested: connect and start the ones it now allows (rate > 0 only — an LFO
 * at rate 0 is never connected here and never held off), suspend the ones it now refuses. Stored settings are never
 * touched. Idempotent.
 */
function reconcileLfos(): void {
  // Pass 1 — suspend. Robot LFOs go newest-CONNECTED first, so a falling cap drops the most recent ones (LIFO, matching
  // robot admission) and stops as soon as the newest is allowed again (allowed = fewer than the cap are connected).
  // connectedSignals is a Map, and delete-then-set moves a key to the end, so its order IS connection order.
  const newestConnectedRobotKey = (): string | undefined =>
    [...connectedSignals.keys()].filter((key) => requested.get(key)?.robotId).at(-1);
  for (let key = newestConnectedRobotKey(); key !== undefined; key = newestConnectedRobotKey()) {
    const { target, robotId } = requested.get(key)!;
    if (isAllowed(target, robotId, key)) break;
    suspendConnection(key);
    heldOff.add(key);
  }
  // Anything else connected that the policy now refuses (global filter LFOs, or a robot LFO refused for another reason).
  for (const key of [...connectedSignals.keys(), ...phaseFallbacks.keys()]) {
    const request = requested.get(key);
    if (request && !isAllowed(request.target, request.robotId, key)) {
      suspendConnection(key);
      if (getLfoSettings(request.target, request.robotId).rate > 0) heldOff.add(key);
    }
  }

  // Pass 2 — connect, in REQUEST order, everything requested (rate > 0) that is not connected and is now allowed. An LFO at
  // rate 0 is never connected here and never held off.
  for (const [key, { target, robotId }] of [...requested]) {
    if (getLfoSettings(target, robotId).rate <= 0) {
      heldOff.delete(key);
      continue;
    }
    if (connectedSignals.has(key) || phaseFallbacks.has(key)) {
      heldOff.delete(key);
      continue;
    }
    if (isAllowed(target, robotId, key)) {
      heldOff.delete(key);
      if (connectLfoTarget(target, robotId)) start(target, robotId);
    } else {
      heldOff.add(key);
    }
  }
}

/** Instance keys (e.g. `lpf.Q`, `robot-3:layer0.detune`) of LFOs requested but held off by the policy. */
function getHeldOffLfoKeys(): string[] {
  return [...heldOff];
}

/**
 * Connect this target's LFO to its live modulation destination. Returns
 * false — never throws — when: a robot-scoped target is called without a
 * robotId (nothing to resolve against), or AudioEngine has no live Signal
 * for the target (pulseWidth on a non-'pulse' layer — a structural Tone.js
 * limitation documented at the AudioEngine layer, Tasks 9/10). 'layerN.phase'
 * is handled entirely separately via the manual-polling fallback above,
 * since no live Signal exists for it at all.
 */
function connectLfoTarget(target: LfoTargetId, robotId?: string): boolean {
  const key = instanceKey(target, robotId);

  // A robot-scoped target needs a robotId to resolve against — nothing to record or connect without one.
  if (isRobotTarget(target) && !robotId) return false;

  // Audio Load policy: remember the request, then decline (and mark held off) if the budget says no.
  requested.set(key, { target, robotId });
  if (!isAllowed(target, robotId, key)) {
    suspendConnection(key);
    if (getLfoSettings(target, robotId).rate > 0) heldOff.add(key);
    else heldOff.delete(key);
    return false;
  }
  heldOff.delete(key);

  const phaseMatch = /^layer(\d+)\.phase$/.exec(target);
  if (phaseMatch) {
    if (!robotId) return false;
    getOrCreateLfo(key, target, robotId); // keep rate/depth/shape bookkeeping consistent with every other target
    if (phaseFallbacks.has(key)) return true; // already connected — idempotent
    startPhaseFallback(key, target as RobotLfoTargetId, robotId, Number(phaseMatch[1]));
    return true;
  }

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
  attachDrift(key, lfo, driftGroupForTarget(target));
  return true;
}

/** Reverse connectLfoTarget: disconnects the live node, or cancels the phase-polling schedule. Safe/no-op if nothing was connected. */
function disconnectLfoTarget(target: LfoTargetId, robotId?: string): void {
  const key = instanceKey(target, robotId);
  // An explicit disconnect (the user set the rate to 0, or the robot is gone) withdraws the request too,
  // so a later reconcile never brings it back. The budget's own suspensions use suspendConnection instead.
  requested.delete(key);
  heldOff.delete(key);
  if (phaseFallbacks.has(key)) {
    stopPhaseFallback(key);
    return;
  }
  const wasConnectedRobotLfo = connectedSignals.has(key) && robotId !== undefined;
  connectedSignals.delete(key);
  detachDrift(key);
  try {
    activeLfos.get(key)?.disconnect();
  } catch (err) {
    devWarn('[lfoEngine] disconnectLfoTarget: disconnect failed', err);
  }
  // A freed robot-LFO slot goes to the oldest held-off LFO now, not at the next dial change.
  if (wasConnectedRobotLfo && heldOff.size > 0) reconcileLfos();
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
  setLfoPolicy,
  setDriftEnabled,
  reconcileLfos,
  getHeldOffLfoKeys,
  setGlobalRateDrift,
  setGlobalDepthDrift,
};
