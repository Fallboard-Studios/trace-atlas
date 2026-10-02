// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { AudioEngine } from '../engine/AudioEngine';
import { wireGlobalFxChain } from '../engine/audioEngine/globalFx';
import { volumePositionToGain } from '../engine/audioEngine/volumeTaper';
import { lfoEngine } from '../engine/lfoEngine';
import {
  generateGlobalAudioSettings,
  generateLfoBankSettings,
  generateGlobalLfoLinks,
  generatePingVarianceAutomation,
  generateSwellFrequency,
  generateSwellDuration,
} from '../utils/globalAudioSeed';
import { AUDIO_LOAD_PRESETS } from '../constants';
import { clampAudioLoad, detectCoarsePointer, resolveInitialAudioLoad, resolveInitialEffectsLoad } from '../utils/audioBudget';
import { generateAttenuationStyleBpm } from '../utils/bpmSeed';
import {
  delayToFree,
  delayToSync,
  laneToFree,
  laneToSync,
  resolveDelayTimeSeconds,
  resolveLaneForEngine,
  resolveLaneRateHz,
} from '../utils/tempoSync';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from './attenuationStyleStore';
import { DEFAULT_LFO_LINK, DEFAULT_BANK_LFO } from '../data/lfoConfig';
import { isNoteValue } from '../data/noteValues';

import type { DelaySettings, GlobalAudioSettings } from '../types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import {
  GLOBAL_LFO_TARGET_IDS,
  LFO_LANE_IDS,
  type GlobalLfoTargetId,
  type LfoLaneId,
  type BankLfoSettings,
  type LfoLink,
} from '../types/lfo';

// ========================================
// TYPES
// ========================================

/** Keys of GlobalAudioSettings that are effect-param objects (excludes the one top-level flag). */
type EffectKey = Exclude<keyof GlobalAudioSettings, 'compressorBeforeDelay'>;

/**
 * The engine is seconds-only (docs/specs/FREE_SYNC_TOGGLE.md §1.3): a Delay partial that carries
 * `delayTime` or `sync` is pushed with its time RESOLVED from the stored Delay at `bpm`, and `sync`
 * never reaches the engine. Anything else — an Audio Swell's `{ wet }`, a `{ feedback }` edit — is
 * forwarded exactly as given, so a synced Delay's time isn't re-pushed on every swell tick. Reads the
 * store lazily (it runs only from inside setGlobalAudio, after the merge), so GLOBAL_SETTER below
 * still builds at module scope without touching useAudioStore during import.
 */
function setGlobalDelayResolved(params: Partial<DelaySettings>): void {
  if (!('delayTime' in params) && !('sync' in params)) {
    AudioEngine.setGlobalDelay(params);
    return;
  }
  const { sync: _sync, ...rest } = params;
  const { globalAudio, bpm } = useAudioStore.getState();
  AudioEngine.setGlobalDelay({ ...rest, delayTime: resolveDelayTimeSeconds(globalAudio.delay, bpm) });
}

/** Routes a setGlobalAudio(effect, partial) call to its matching AudioEngine setter. */
const GLOBAL_SETTER: { [K in EffectKey]: (params: Partial<GlobalAudioSettings[K]>) => void } = {
  compressor: AudioEngine.setGlobalCompressor,
  eq3: AudioEngine.setGlobalEQ,
  filterLPF: AudioEngine.setGlobalFilterLPF,
  filterHPF: AudioEngine.setGlobalFilterHPF,
  limiter: AudioEngine.setGlobalLimiter,
  delay: setGlobalDelayResolved,
  reverb: AudioEngine.setGlobalReverb,
};

/**
 * Push every effect's current param values onto AudioEngine's live Tone FX
 * chain. Used both by regenerateGlobalAudioFromSeed (fresh seed values, right
 * after generating them) and by AudioEngine.start() (right after
 * buildGlobalFxChain() constructs fresh nodes — which start on globalFx.ts's
 * own hardcoded construction literals, not whatever's already seeded in the
 * store; regenerateGlobalAudioFromSeed's own push runs at module load, long
 * before those nodes exist, so it lands as a no-op on every one of these
 * setters and needs re-applying once real nodes exist).
 *
 * `bpm` is the tempo a synced Delay resolves at (docs/specs/FREE_SYNC_TOGGLE.md §1.3). It is a
 * parameter, not read from the store, so a caller that is about to change the tempo can pass the
 * one that will actually be in force.
 */
export function applyGlobalAudioToEngine(globalAudio: GlobalAudioSettings, bpm: number): void {
  const { sync: _sync, ...delay } = globalAudio.delay;
  AudioEngine.setGlobalCompressor(globalAudio.compressor);
  AudioEngine.setGlobalEQ(globalAudio.eq3);
  AudioEngine.setGlobalFilterLPF(globalAudio.filterLPF);
  AudioEngine.setGlobalFilterHPF(globalAudio.filterHPF);
  AudioEngine.setGlobalLimiter(globalAudio.limiter);
  AudioEngine.setGlobalDelay({ ...delay, delayTime: resolveDelayTimeSeconds(globalAudio.delay, bpm) });
  AudioEngine.setGlobalReverb(globalAudio.reverb);
}

/**
 * Re-push every tempo-synced value's resolved float after a tempo change (docs/specs/FREE_SYNC_TOGGLE.md
 * §1.6). Free values never move with tempo, so they are never touched. Synchronous and safe before audio
 * starts — lfoEngine.setBankRate just records the value until the lanes are primed, and the delay
 * setter no-ops without a node.
 */
function reapplyTempoSyncedValues(state: Pick<AudioStore, 'bpm' | 'lfoBank' | 'globalAudio'>): void {
  for (const lane of LFO_LANE_IDS) {
    const settings = state.lfoBank[lane];
    if (isNoteValue(settings.sync)) lfoEngine.setBankRate(lane, resolveLaneRateHz(settings, state.bpm));
  }
  const { delay } = state.globalAudio;
  if (isNoteValue(delay.sync)) AudioEngine.setGlobalDelay({ delayTime: resolveDelayTimeSeconds(delay, state.bpm) });
}

/** Initial lfoBank — DEFAULT_BANK_LFO per lane (inert: rate 0, no drift) until the AS-sync below seeds real values. */
function buildDefaultLfoBank(): Record<LfoLaneId, BankLfoSettings> {
  const result = {} as Record<LfoLaneId, BankLfoSettings>;
  for (const lane of LFO_LANE_IDS) {
    result[lane] = { ...DEFAULT_BANK_LFO };
  }
  return result;
}

/** Initial globalLfoLinks — DEFAULT_LFO_LINK's 7 global entries (lane: null, depth: 0) until the
 *  AS-sync below seeds real values. */
function buildDefaultGlobalLfoLinks(): Record<GlobalLfoTargetId, LfoLink> {
  const result = {} as Record<GlobalLfoTargetId, LfoLink>;
  for (const target of GLOBAL_LFO_TARGET_IDS) {
    result[target] = { ...DEFAULT_LFO_LINK[target] };
  }
  return result;
}

/** Sentinel for "not yet seeded this session" — outside [0, 1], the domain of
 *  every real value (seeded or hand-dragged). regenerateGlobalAudioFromSeed
 *  uses this to seed pingVarianceAutomation exactly once per session and
 *  carry it forward across every later Attenuation Style switch
 *  (docs/specs/PING-VARIANCE-AUTOMATION.md §1.2) — the field-level
 *  equivalent of how compressorBeforeDelay already survives regeneration via
 *  the current-value spread a few lines below, except that field never needs
 *  a "have I seeded yet" check because its generator always returns the
 *  same static default, never a genuinely-seeded value. */
const PING_VARIANCE_AUTOMATION_UNSEEDED = -1;

/** Same shape as PING_VARIANCE_AUTOMATION_UNSEEDED, for the two new Pacing
 *  fields (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5) — outside
 *  each field's real [2, 8] domain. */
const SWELL_FREQUENCY_UNSEEDED = -1;
const SWELL_DURATION_UNSEEDED = -1;

/**
 * The Robot Load slider's position at page load (docs/specs/AUDIO_LOAD_BUDGET.md §4.2): a valid `?load=`
 * wins, otherwise Light on a coarse-pointer (phone-like) device and Full elsewhere. Browser-only, read
 * once at module load like seedUtils' URL params; anything without a window is Full (today's behavior).
 */
function readInitialRobotLoad(): number {
  if (typeof window === 'undefined') return AUDIO_LOAD_PRESETS.full;
  return resolveInitialAudioLoad({ search: window.location.search, coarsePointer: detectCoarsePointer() });
}

/**
 * The Effects Load slider's position at page load: a valid `?fxLoad=` wins, then `?load=` (so an
 * existing `?load=` link keeps pinning both sliders together), then device detection.
 */
function readInitialEffectsLoad(): number {
  if (typeof window === 'undefined') return AUDIO_LOAD_PRESETS.full;
  return resolveInitialEffectsLoad({ search: window.location.search, coarsePointer: detectCoarsePointer() });
}

export interface AudioStore {
  bpm: number;
  globalAudio: GlobalAudioSettings;
  /** The four LFO Bank lanes — world-level, seeded per Attenuation Style (docs/tasks/LFO_BANK.md Task 8). */
  lfoBank: Record<LfoLaneId, BankLfoSettings>;
  /** One LFO Bank link per global-chain target — seeded per Attenuation Style alongside lfoBank. Additive,
   *  same as lfoBank above. */
  globalLfoLinks: Record<GlobalLfoTargetId, LfoLink>;
  isMuted: boolean;
  /** Live master-volume slider position, [0, 1] — Header's volume slider's single source
   *  of truth. Default 1 (100%), never persisted across sessions. The engine's actual live gain
   *  is `isMuted ? 0 : volumePositionToGain(volume)` — see setVolume/setMuted below.
   *  docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3. */
  volume: number;
  /** Continuous automation-amount fraction, [0, 1] — the Audio Rig's "Ping
   *  Variance Automation" slider, replacing the former audioSwellsEnabled
   *  boolean (docs/specs/PING-VARIANCE-AUTOMATION.md). Read directly by
   *  audioSwells.ts's own tick: a plain UI-adjacent value, not tied to
   *  AudioEngine. Seeded once per session (regenerateGlobalAudioFromSeed's
   *  first call), then carried forward across every future Attenuation Style
   *  switch — freely draggable via the Audio Rig slider at any time. */
  pingVarianceAutomation: number;
  /** Swells per measure ([0, 24], sliderLog) — the Audio Rig's Pacing
   *  "Frequency" slider (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md
   *  §1.3). 0 is the sole on/off switch for the whole Audio Swells system
   *  (replacing pingVarianceAutomation's former on/off role). Seeded once
   *  per session, then carried forward across every future Attenuation
   *  Style switch, same as pingVarianceAutomation. */
  swellFrequency: number;
  /** Total swell length in measures ([1, 24], sliderLinear) — the Audio
   *  Rig's Pacing "Duration" slider. Replaces the former per-swell-randomized
   *  independent rising/falling picks with one shared total; the rising/
   *  falling split within that total still varies per swell. Seeded once
   *  per session, carried forward like swellFrequency/pingVarianceAutomation. */
  swellDuration: number;
  /** The Robot Load slider, [0, 1] — 1 (Full) is today's behavior exactly; lower values cap audible
   *  robots, polyphony and (at load time) latency. Initialised at boot from `?load=` / device detection,
   *  changed only through `setRobotLoad`. docs/specs/AUDIO_LOAD_BUDGET.md. */
  robotLoad: number;
  /** The Effects Load slider, [0, 1] — 1 (Full) is today's behavior exactly; lower values cap drift,
   *  filter LFOs and the robot-LFO count. Initialised at boot from `?fxLoad=` / `?load=` / device
   *  detection, changed only through `setEffectsLoad`. docs/specs/AUDIO_LOAD_BUDGET.md. */
  effectsLoad: number;
  /** Robots currently allowed to sound under the Audio Load budget, in admission order. Derived, and
   *  written only by audioBudgetSystem (via `setSoundingRobotIds`) — never edited by hand. */
  soundingRobotIds: string[];
  /** Whether the dial currently holds the filter (LPF/HPF) LFO links off — their pickers grey out while it does; EQ-gain
   *  links are never affected. Derived; written only by audioBudgetSystem. docs/tasks/LFO_BANK.md Task 3. */
  filterLinksHeldOff: boolean;
  /** Whether the dial currently holds drift ("stacked" LFOs) off — the drift sliders grey out while it does. Derived. */
  driftHeldOff: boolean;
  setBPM: (bpm: number) => void;
  /**
   * Reseed `bpm` for the given Attenuation Style — draws a fresh value via
   * generateAttenuationStyleBpm and pushes it through the existing setBPM
   * action (state write + AudioEngine.setBPM). Called from the module-scope
   * Attenuation Style sync below, FIRST, so everything it reseeds afterwards
   * resolves against the new tempo (docs/specs/FREE_SYNC_TOGGLE.md §1.7).
   * A coordinates-only retransmit never reaches it.
   */
  regenerateBpmFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
  setGlobalAudio: <K extends EffectKey>(
    effect: K,
    partial: Partial<GlobalAudioSettings[K]>
  ) => void;
  /**
   * Flips Delay Time between Free (Float) and Sync (Anchored) (docs/specs/FREE_SYNC_TOGGLE.md §1.5):
   * Free -> Sync snaps delayTime to the nearest allowed note at the current tempo, Sync -> Free keeps
   * the seconds the user was hearing. A whole-object replacement of `globalAudio.delay`, so the Free
   * result carries no `sync` key; pushes the resolved delayTime to the engine.
   */
  setDelaySyncMode: (synced: boolean) => void;
  /** Sets isMuted and pushes the resulting gain to AudioEngine — 0 when muted,
   *  volumePositionToGain(volume) (the live slider position) when not. Owns its own
   *  AudioEngine call, matching every other audioStore setter's shape (setBPM, etc.) —
   *  Header.tsx doesn't call AudioEngine directly for mute either.
   *  docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3, §1.5. */
  setMuted: (muted: boolean) => void;
  /** Sets the master-volume slider position and pushes the tapered gain to AudioEngine.
   *  Always also clears isMuted — dragging the slider while muted un-mutes as a side
   *  effect, jumping straight to the dragged-to level. docs/specs/GLOBAL_VOLUME_CONTROL.md §1.3. */
  setVolume: (volume: number) => void;
  /** Sets the Audio Rig "Ping Variance Automation" slider — a plain state
   *  write, no AudioEngine call; audioSwells.ts reads this fraction fresh
   *  on its own next tick (both for scaling a newly-created swell's peak
   *  and for the 0%-forced-return check). */
  setPingVarianceAutomation: (value: number) => void;
  /** Sets the Audio Rig "Frequency" slider — a plain state write, no AudioEngine call. */
  setSwellFrequency: (value: number) => void;
  /** Sets the Audio Rig "Duration" slider — a plain state write, no AudioEngine call. */
  setSwellDuration: (value: number) => void;
  /** Sets the Robot Load slider, clamped to [0, 1] (NaN → Full). A plain state write — the budget
   *  system reacts to it; nothing here touches the engine. Leaves effectsLoad untouched. */
  setRobotLoad: (robotLoad: number) => void;
  /** Sets the Effects Load slider, clamped to [0, 1] (NaN → Full). A plain state write — the budget
   *  system reacts to it; nothing here touches the engine. Leaves robotLoad untouched. */
  setEffectsLoad: (effectsLoad: number) => void;
  /** Writes the derived sounding set. Skips the write entirely — no new state, no subscriber
   *  notification — when the ids (and their order) are unchanged. */
  setSoundingRobotIds: (ids: readonly string[]) => void;
  /** Writes whether filter (LPF/HPF) LFO links are held off; skips the write when unchanged. */
  setFilterLinksHeldOff: (heldOff: boolean) => void;
  /** Writes whether drift is held off; skips the write when unchanged. */
  setDriftHeldOff: (heldOff: boolean) => void;
  /**
   * Swap the compressor's chain position — false (default) = "Natural Decay"
   * (compressor after Delay+Reverb), true = "Controlled Decay" (compressor
   * before both). Updates state and rewires the live Tone FX chain via
   * globalFx.ts's wireGlobalFxChain().
   */
  setCompressorBeforeDelay: (value: boolean) => void;
  /**
   * Regenerate `globalAudio` for the given Attenuation Style from the seed
   * (generateGlobalAudioSettings, src/utils/globalAudioSeed.ts) and push the
   * result into AudioEngine's live Tone FX chain.
   */
  regenerateGlobalAudioFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
  /**
   * Sets one LFO Bank lane's settings (docs/tasks/LFO_BANK.md Task 8) — updates state, then calls
   * the matching lfoEngine setter (setBankShape/Rate/RateDrift/DepthDrift) ONLY for the field(s)
   * actually given in `partial`. The engine only ever sees Hz: a `rate` or `sync` in the partial
   * pushes the lane's RESOLVED rate (docs/specs/FREE_SYNC_TOGGLE.md §1.3), so a Free-rate edit on a
   * synced lane re-sends the synced Hz rather than the number just typed.
   *
   * A merge can never delete a key, so this cannot turn a synced lane Free — that is
   * setLfoBankLaneSyncMode / replaceLfoBankLane.
   */
  setLfoBank: (lane: LfoLaneId, partial: Partial<BankLfoSettings>) => void;
  /**
   * Writes one lane WHOLE (no merge) and pushes all of it to lfoEngine — shape, the resolved Hz, both
   * drifts. The only way to drop a lane's `sync` key (docs/specs/FREE_SYNC_TOGGLE.md assumption 6);
   * also what a session restore uses, so a Free lane in a loaded session cannot inherit the live
   * lane's stale `sync`.
   */
  replaceLfoBankLane: (lane: LfoLaneId, settings: BankLfoSettings) => void;
  /**
   * Flips one lane between Free (Float) and Sync (Anchored) (docs/specs/FREE_SYNC_TOGGLE.md §1.5):
   * Free -> Sync snaps the rate to the nearest allowed note at the current tempo, Sync -> Free keeps
   * the Hz the user was hearing. A whole-object replacement, so the Free result carries no `sync` key.
   */
  setLfoBankLaneSyncMode: (lane: LfoLaneId, synced: boolean) => void;
  /** Sets one global-chain target's LFO Bank link — updates state and calls lfoEngine.linkTarget
   *  (no robotId — global-chain targets are never robot-scoped). */
  setGlobalLfoLink: (target: GlobalLfoTargetId, link: LfoLink) => void;
  /**
   * Regenerate `lfoBank` for the given Attenuation Style from the seed (generateLfoBankSettings).
   * Data-only — does NOT touch lfoEngine ("no real Tone node before AudioContext exists");
   * AudioEngine.start() (Task 10) primes the bank.
   */
  regenerateLfoBankFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
  /** Regenerate `globalLfoLinks` for the given Attenuation Style from the seed
   *  (generateGlobalLfoLinks). Data-only, same reasoning as regenerateLfoBankFromSeed above. */
  regenerateGlobalLfoLinksFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
}

// ========================================
// STORE
// ========================================
export const useAudioStore = create<AudioStore>((set, get) => ({
  bpm: 60,
  globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS },
  lfoBank: buildDefaultLfoBank(),
  globalLfoLinks: buildDefaultGlobalLfoLinks(),
  isMuted: false,
  volume: 1,
  pingVarianceAutomation: PING_VARIANCE_AUTOMATION_UNSEEDED, // real value assigned by the first regenerateGlobalAudioFromSeed call below (module-load AS-sync)
  swellFrequency: SWELL_FREQUENCY_UNSEEDED, // real value assigned by the first regenerateGlobalAudioFromSeed call below (module-load AS-sync)
  swellDuration: SWELL_DURATION_UNSEEDED, // real value assigned by the first regenerateGlobalAudioFromSeed call below (module-load AS-sync)
  robotLoad: readInitialRobotLoad(),
  effectsLoad: readInitialEffectsLoad(),
  soundingRobotIds: [],
  filterLinksHeldOff: false,
  driftHeldOff: false,

  setBPM: (bpm) => {
    set({ bpm });
    // Delegate to AudioEngine — the only module allowed to call Tone.js directly.
    // AudioEngine.setBPM guards against calling Transport before audio is started.
    AudioEngine.setBPM(bpm);
    reapplyTempoSyncedValues(get());
  },

  regenerateBpmFromSeed: (attenuationStyleId, attenuationStyleName) => {
    get().setBPM(generateAttenuationStyleBpm(attenuationStyleId, attenuationStyleName));
  },

  setGlobalAudio: (effect, partial) => {
    set((state) => ({
      globalAudio: {
        ...state.globalAudio,
        [effect]: {
          ...(state.globalAudio[effect] as object),
          ...partial,
        },
      },
    }));
    // GLOBAL_SETTER's per-key parameter types are correct individually; TS can't
    // narrow the union across the generic K at the call site without this cast,
    // the same shape AudioEngine.ts's own ModulationTarget alias resolves for its
    // own unavoidable union return type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (GLOBAL_SETTER[effect] as (params: any) => void)(partial);
  },

  setDelaySyncMode: (synced) => {
    const { globalAudio, bpm } = get();
    const delay = synced ? delayToSync(globalAudio.delay, bpm) : delayToFree(globalAudio.delay, bpm);
    set({ globalAudio: { ...globalAudio, delay } });
    AudioEngine.setGlobalDelay({ delayTime: resolveDelayTimeSeconds(delay, bpm) });
  },

  setCompressorBeforeDelay: (value) => {
    set((state) => ({ globalAudio: { ...state.globalAudio, compressorBeforeDelay: value } }));
    wireGlobalFxChain(value);
  },

  setMuted: (muted) => {
    set({ isMuted: muted });
    AudioEngine.setMasterVolume(muted ? 0 : volumePositionToGain(get().volume));
  },
  setVolume: (volume) => {
    set({ volume, isMuted: false });
    AudioEngine.setMasterVolume(volumePositionToGain(volume));
  },
  setPingVarianceAutomation: (value) => {
    set({ pingVarianceAutomation: value });
  },
  setSwellFrequency: (value) => {
    set({ swellFrequency: value });
  },
  setSwellDuration: (value) => {
    set({ swellDuration: value });
  },
  setRobotLoad: (robotLoad) => {
    set({ robotLoad: clampAudioLoad(robotLoad) });
  },
  setEffectsLoad: (effectsLoad) => {
    set({ effectsLoad: clampAudioLoad(effectsLoad) });
  },
  setSoundingRobotIds: (ids) => {
    const current = get().soundingRobotIds;
    if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
    set({ soundingRobotIds: [...ids] });
  },
  setFilterLinksHeldOff: (heldOff) => {
    if (get().filterLinksHeldOff !== heldOff) set({ filterLinksHeldOff: heldOff });
  },
  setDriftHeldOff: (heldOff) => {
    if (get().driftHeldOff !== heldOff) set({ driftHeldOff: heldOff });
  },

  regenerateGlobalAudioFromSeed: (attenuationStyleId, attenuationStyleName) => {
    // compressorBeforeDelay is NOT seeded — generateGlobalAudioSettings
    // always returns DEFAULT_GLOBAL_AUDIO_SETTINGS' value for it, which is
    // correct for the very first call (module load, state is still the
    // fresh default) but wrong for every later one (an Attenuation Style
    // switch after the user has already flipped it): overwriting a live user
    // choice back to default here, with nothing to push that reset to the
    // engine, would silently desync the UI from the actual live audio graph.
    // Carry the CURRENT value forward instead — same effect on first call,
    // correct on every later one.
    const generated = generateGlobalAudioSettings(attenuationStyleId, attenuationStyleName);
    const current = get().globalAudio;
    const globalAudio: GlobalAudioSettings = {
      ...generated,
      compressorBeforeDelay: current.compressorBeforeDelay,
    };
    // pingVarianceAutomation seeds once per session, then carries forward
    // across every later switch — deliberately NOT spread from `current`
    // like compressorBeforeDelay above; that field always regenerates to the
    // same static default so overwriting with `current` is safe on every
    // call. pingVarianceAutomation's generator returns a genuinely different
    // value each time, so "already seeded" is tracked
    // via the PING_VARIANCE_AUTOMATION_UNSEEDED sentinel instead — this key
    // is simply omitted from the set() call below on every later switch,
    // and Zustand's default merge leaves the current value untouched
    // (docs/specs/PING-VARIANCE-AUTOMATION.md §1.2).
    const pingVarianceAutomation = get().pingVarianceAutomation === PING_VARIANCE_AUTOMATION_UNSEEDED
      ? generatePingVarianceAutomation(attenuationStyleId, attenuationStyleName)
      : undefined;
    // swellFrequency/swellDuration join the same seed-once/carry-forward
    // group as pingVarianceAutomation above (docs/specs/
    // AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.5) — same sentinel-gated
    // mechanism, duplicated for each field.
    const swellFrequency = get().swellFrequency === SWELL_FREQUENCY_UNSEEDED
      ? generateSwellFrequency(attenuationStyleId, attenuationStyleName)
      : undefined;
    const swellDuration = get().swellDuration === SWELL_DURATION_UNSEEDED
      ? generateSwellDuration(attenuationStyleId, attenuationStyleName)
      : undefined;
    set({
      globalAudio,
      ...(pingVarianceAutomation !== undefined ? { pingVarianceAutomation } : {}),
      ...(swellFrequency !== undefined ? { swellFrequency } : {}),
      ...(swellDuration !== undefined ? { swellDuration } : {}),
    });
    // bpm is already the new Attenuation Style's tempo: the AS-sync reseeds it before globalAudio.
    applyGlobalAudioToEngine(globalAudio, get().bpm);
  },

  setLfoBank: (lane, partial) => {
    // Defense in depth against a hole left by malformed/untrusted data (a hand-trimmed session
    // share link, a corrupted localStorage blob) reaching this far — the decode boundary
    // (sessionShareUtils.ts) is supposed to backfill every lane, but a caller passing `undefined`
    // here should never throw regardless.
    if (!partial) return;
    set((state) => ({ lfoBank: { ...state.lfoBank, [lane]: { ...state.lfoBank[lane], ...partial } } }));
    // Read the MERGED lane back: what the engine should hear depends on the whole lane, not the
    // partial (a `rate` edit on a synced lane must not reach the engine as that rate).
    const { lfoBank, bpm } = get();
    const next = lfoBank[lane];
    if (partial.shape !== undefined) lfoEngine.setBankShape(lane, partial.shape);
    if (partial.rate !== undefined || 'sync' in partial) lfoEngine.setBankRate(lane, resolveLaneRateHz(next, bpm));
    if (partial.rateDrift !== undefined) lfoEngine.setBankRateDrift(lane, resolveLaneForEngine(next, bpm).rateDrift);
    if (partial.depthDrift !== undefined) lfoEngine.setBankDepthDrift(lane, partial.depthDrift);
  },

  replaceLfoBankLane: (lane, settings) => {
    // Same defense-in-depth as setLfoBank above.
    if (!settings) return;
    set((state) => ({ lfoBank: { ...state.lfoBank, [lane]: settings } }));
    const engineLane = resolveLaneForEngine(settings, get().bpm);
    lfoEngine.setBankShape(lane, engineLane.shape);
    lfoEngine.setBankRate(lane, engineLane.rate);
    lfoEngine.setBankRateDrift(lane, engineLane.rateDrift);
    lfoEngine.setBankDepthDrift(lane, engineLane.depthDrift);
  },

  setLfoBankLaneSyncMode: (lane, synced) => {
    const { lfoBank, bpm } = get();
    const next = synced ? laneToSync(lfoBank[lane], bpm) : laneToFree(lfoBank[lane], bpm);
    get().replaceLfoBankLane(lane, next);
  },

  setGlobalLfoLink: (target, link) => {
    // Same defense-in-depth as setLfoBank above.
    if (!link) return;
    set((state) => ({ globalLfoLinks: { ...state.globalLfoLinks, [target]: link } }));
    lfoEngine.linkTarget(target, link);
  },

  // Data-only, deliberately: this runs at module load / on every Attenuation
  // Style switch, long before any user gesture — pushing to lfoEngine here
  // would construct a real Tone.LFO before an AudioContext exists, violating
  // "initialize audio only from an explicit user gesture" (CLAUDE.md) and
  // throwing outright in headless/test environments. AudioEngine.start()
  // (Task 10) is the only safe point to prime the bank and its links, since
  // it runs after Tone.start()/transport.start() succeed.
  regenerateLfoBankFromSeed: (attenuationStyleId, attenuationStyleName) => {
    const lfoBank = generateLfoBankSettings(attenuationStyleId, attenuationStyleName);
    set({ lfoBank });
  },

  regenerateGlobalLfoLinksFromSeed: (attenuationStyleId, attenuationStyleName) => {
    const globalLfoLinks = generateGlobalLfoLinks(attenuationStyleId, attenuationStyleName);
    set({ globalLfoLinks });
  },
}));

// ========================================
// ATTENUATION STYLE SYNC
// ========================================
// Keep bpm, globalAudio, lfoBank and globalLfoLinks seeded from whichever
// Attenuation Style is active — seeds immediately for the one active at load
// (satisfies "app init"), then re-seeds on every future
// currentAttenuationStyleId change (satisfies "any future Attenuation Style
// switch") without requiring every future call site of
// setCurrentAttenuationStyleId to remember to also call each regenerate*.
// Mirrors attenuationStyleStore.ts's own module-scope noise-map priming
// (`getAttenuationStyleNoiseMap('pelagos', 'Pelagos')`).
//
// bpm reseeds FIRST: the tempo is an Attenuation Style property now
// (docs/specs/FREE_SYNC_TOGGLE.md §1.7, inverting BPM_CONTROL.md §1.3's
// locale seeding), and the globalAudio push right after it must resolve
// against the new tempo. A coordinates-only retransmit never changes the
// Attenuation Style, so it never reaches this and a hand-dragged tempo
// survives a coordinate move.
function syncGlobalAudioToCurrentAttenuationStyle(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!attenuationStyle) return;
  useAudioStore.getState().regenerateBpmFromSeed(attenuationStyle.id, attenuationStyle.name);
  useAudioStore.getState().regenerateGlobalAudioFromSeed(attenuationStyle.id, attenuationStyle.name);
  useAudioStore.getState().regenerateLfoBankFromSeed(attenuationStyle.id, attenuationStyle.name);
  useAudioStore.getState().regenerateGlobalLfoLinksFromSeed(attenuationStyle.id, attenuationStyle.name);
}

syncGlobalAudioToCurrentAttenuationStyle();
useAttenuationStyleStore.subscribe((state, prevState) => {
  if (state.currentAttenuationStyleId !== prevState.currentAttenuationStyleId) {
    syncGlobalAudioToCurrentAttenuationStyle();
  }
});
