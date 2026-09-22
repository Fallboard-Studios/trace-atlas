// ========================================
// IMPORTS
// ========================================
import { AudioEngine } from '../engine/AudioEngine';
import { lfoEngine } from '../engine/lfoEngine';
import { useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import { useAudioStore } from '../stores/audioStore';
import { useLocaleStore } from '../stores/localeStore';
import { MAX_POLYPHONY } from '../constants';
import type { LoadLimits } from '../utils/audioBudget';
import {
  detectCoarsePointer,
  detectDefaultAudioLoad,
  effectsLoadToLimits,
  lfoAllowed,
  loadToSearchParam,
  orderByArrival,
  parseLoadParam,
  reconcileSounding,
  robotLoadToLimits,
  withParam,
} from '../utils/audioBudget';
import { getActiveLocaleId } from '../utils/localeHelpers';
import { isRobotAudible } from '../utils/robotAudibility';

// ========================================
// MODULE STATE (runtime-only — never in Zustand)
// ========================================
// Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §4.4). Module-singleton start/stop pair, the same
// shape as startRobotLifecycle/stopRobotLifecycle. Nothing here depends on the transport, so a power
// cycle (AudioEngine.killAll) neither tears it down nor clears what it has pushed.

let unsubscribers: Array<() => void> | null = null;
/** id:audioMode:docking of every robot in the active locale — the only thing the locale subscription reacts to. */
let lastSignature = '';
/** Eligible robots in the order they became eligible (drives first-come-first-served). */
let arrivalOrder: readonly string[] = [];
/** The set currently pushed to the engine and the store. */
let sounding: readonly string[] = [];
let pushedPolyphony: number | null = null;
/** URL mirror (decision H), one pair per axis: the load the device would default to, and whether a valid
 *  ?load=/?fxLoad= was in the URL at boot. */
let defaultRobotLoad = 1;
let bootHadLoadParam = false;
let defaultEffectsLoad = 1;
let bootHadFxLoadParam = false;
/** The tier-relevant part of the limits last applied to lfoEngine, so roster churn and irrelevant dial nudges do nothing. */
let appliedTierKey = '';

// ========================================
// INTERNAL FUNCTIONS
// ========================================

function activeRobots() {
  return useLocaleStore.getState().locales[getActiveLocaleId()]?.robots ?? [];
}

/**
 * The active locale plus `id:audioMode:docking` per robot. `updateRobot` rewrites the locale on every
 * battery tick and swell write (backlog items 21–27), so subscribing to the robots themselves would run
 * this 12×/measure; the signature only changes when a robot's audibility can.
 */
function signature(): string {
  const localeId = getActiveLocaleId();
  const robots = useLocaleStore.getState().locales[localeId]?.robots ?? [];
  return `${localeId}|${robots.map((r) => `${r.id}:${r.audioMode ?? ''}:${r.docking}`).join(',')}`;
}

function applySet(next: readonly string[]): void {
  sounding = next;
  AudioEngine.setSoundingRobots(next);
  useAudioStore.getState().setSoundingRobotIds(next);
}

/** Recompute the sounding set and the ceiling from the current roster and dial; push only what changed. */
function reconcile(force = false): void {
  const robots = activeRobots();
  const anySolo = robots.some((r) => r.audioMode === 'solo');
  const eligible = robots.filter((r) => isRobotAudible(r.audioMode, anySolo)).map((r) => r.id);
  const soloIds = robots.filter((r) => r.audioMode === 'solo').map((r) => r.id);
  const { robotLoad, effectsLoad } = useAudioStore.getState();
  const limits: LoadLimits = { ...robotLoadToLimits(robotLoad), ...effectsLoadToLimits(effectsLoad) };

  arrivalOrder = orderByArrival(arrivalOrder, eligible);
  const next = reconcileSounding(sounding, arrivalOrder, soloIds, limits.maxAudibleRobots);
  if (force || next !== sounding) applySet(next);

  if (limits.maxPolyphony !== pushedPolyphony) {
    pushedPolyphony = limits.maxPolyphony;
    AudioEngine.setPolyphonyCap(limits.maxPolyphony);
  }

  applyLfoTiers(limits, force);
}

function syncHeldOff(): void {
  useAudioStore.getState().setHeldOffLfoKeys(lfoEngine.getHeldOffLfoKeys());
}

/**
 * The LFO tiers (docs/specs/AUDIO_LOAD_BUDGET.md §1.4): install the policy lfoEngine consults (EQ-gain LFOs always, filter
 * frequency/Q only above the filter threshold, audio-rate robot LFOs up to the cap, phase LFOs never counted), turn drift
 * on or off, reconcile every connection, and publish the held-off state the UI greys out from. Only when a tier limit has
 * actually changed (or on force) — the roster changing, or a dial nudge inside one tier, changes none of it.
 */
function applyLfoTiers(limits: LoadLimits, force = false): void {
  const key = [limits.driftEnabled, limits.filterLfosEnabled, limits.maxRobotLfos].join('|');
  if (!force && key === appliedTierKey) return;
  appliedTierKey = key;
  lfoEngine.setLfoPolicy((target, robotId, connectedRobotLfos) =>
    lfoAllowed(target, robotId ? 'robot' : 'global', limits, connectedRobotLfos),
  );
  lfoEngine.setDriftEnabled(limits.driftEnabled);
  lfoEngine.reconcileLfos();
  useAudioStore.getState().setDriftHeldOff(!limits.driftEnabled);
  syncHeldOff();
}

/**
 * One axis's mirrored search-param value: omitted when the value equals what a reload would default to
 * anyway AND the param was absent at boot — so Full on a desktop drops it, while Full on a phone (whose
 * auto-default is Light) stays explicit.
 */
function mirroredParamValue(load: number, defaultForAxis: number, hadParamAtBoot: boolean): string | null {
  const isDefault = Math.round(load * 100) === Math.round(defaultForAxis * 100);
  return isDefault && !hadParamAtBoot ? null : loadToSearchParam(load);
}

/**
 * Mirror both sliders into the address bar with history.replaceState (no history entries), so a reload keeps
 * them and a link can carry them. Every other param is preserved. `?load=` (robotLoad) and `?fxLoad=`
 * (effectsLoad) are mirrored independently, each against its own axis's default/boot-param state — the same
 * rule `?load=` already used alone, now applied twice. A no-op outside a browser; a throwing replaceState
 * (sandboxed frame) is ignored.
 */
function mirrorLoadToUrl(robotLoad: number, effectsLoad: number): void {
  if (typeof window === 'undefined') return;
  let search = withParam(window.location.search, 'load', mirroredParamValue(robotLoad, defaultRobotLoad, bootHadLoadParam));
  search = withParam(search, 'fxLoad', mirroredParamValue(effectsLoad, defaultEffectsLoad, bootHadFxLoadParam));
  if (search === window.location.search) return;
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
  } catch {
    // Not fatal: the dial still works, it just is not mirrored.
  }
}

function onPossibleRosterChange(): void {
  const next = signature();
  if (next === lastSignature) return;
  lastSignature = next;
  reconcile();
}

// ========================================
// PUBLIC API
// ========================================

/**
 * Start budgeting: subscribe to the active locale's robots (through a signature) and to `robotLoad`/`effectsLoad`,
 * and push the sounding set and polyphony ceiling to the engine, writing `soundingRobotIds` only when the
 * set really changes. Idempotent. Started once from main.tsx before first power-on.
 */
export function startAudioBudget(): void {
  if (unsubscribers !== null) return;
  arrivalOrder = [];
  sounding = [];
  pushedPolyphony = null;
  lastSignature = signature();
  if (typeof window !== 'undefined') {
    const defaultLoad = detectDefaultAudioLoad({ coarsePointer: detectCoarsePointer() });
    defaultRobotLoad = defaultLoad;
    defaultEffectsLoad = defaultLoad;
    const params = new URLSearchParams(window.location.search);
    bootHadLoadParam = parseLoadParam(params.get('load')) !== null;
    bootHadFxLoadParam = parseLoadParam(params.get('fxLoad')) !== null;
  }
  reconcile(true); // always establish the engine's set, even when it is empty

  unsubscribers = [
    // A robot LFO the user enables over the cap is held off inside lfoEngine, not through this system — mirror it at once.
    lfoEngine.subscribeHeldOff(syncHeldOff),
    useLocaleStore.subscribe(onPossibleRosterChange),
    // The active locale id lives in the Attenuation Style store, so a locale switch needs its own listener.
    useAttenuationStyleStore.subscribe(onPossibleRosterChange),
    useAudioStore.subscribe((state, prev) => {
      if (state.robotLoad !== prev.robotLoad || state.effectsLoad !== prev.effectsLoad) {
        reconcile();
        mirrorLoadToUrl(state.robotLoad, state.effectsLoad);
      }
    }),
  ];
}

/**
 * Stop budgeting: unsubscribe everything and release the restrictions (engine set back to "no budget",
 * ceiling back to MAX_POLYPHONY, `soundingRobotIds` cleared), so a stopped system can never leave robots
 * silenced. Idempotent; a no-op when never started.
 */
export function stopAudioBudget(): void {
  if (unsubscribers === null) return;
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = null;
  arrivalOrder = [];
  sounding = [];
  pushedPolyphony = null;
  appliedTierKey = '';
  lastSignature = '';
  AudioEngine.setSoundingRobots(null);
  AudioEngine.setPolyphonyCap(MAX_POLYPHONY);
  useAudioStore.getState().setSoundingRobotIds([]);
  // Lift every LFO tier too: no policy, drift back on, everything that was suspended reconnected.
  lfoEngine.setLfoPolicy(null);
  lfoEngine.setDriftEnabled(true);
  lfoEngine.reconcileLfos();
  useAudioStore.getState().setDriftHeldOff(false);
  useAudioStore.getState().setHeldOffLfoKeys([]);
}
