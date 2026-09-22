// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { AudioEngine } from '../engine/AudioEngine';
import { wireGlobalFxChain } from '../engine/audioEngine/globalFx';
import { volumePositionToGain } from '../engine/audioEngine/volumeTaper';
import { lfoEngine } from '../engine/lfoEngine';
import { generateGlobalAudioSettings, generateGlobalLfoSettings, generatePingVarianceAutomation } from '../utils/globalAudioSeed';
import { AUDIO_LOAD_PRESETS } from '../constants';
import { clampAudioLoad, detectCoarsePointer, resolveInitialAudioLoad, resolveInitialEffectsLoad } from '../utils/audioBudget';
import { generateLocaleBpm } from '../utils/localeBpmSeed';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from './attenuationStyleStore';
import { useLocaleStore } from './localeStore';
import { DEFAULT_LFO_SETTINGS } from '../data/lfoConfig';

import type { GlobalAudioSettings } from '../types/globalAudio';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import { GLOBAL_LFO_TARGET_IDS, DRIFT_GROUP_IDS, type GlobalLfoTargetId, type LfoSettings, type DriftGroupId } from '../types/lfo';

// ========================================
// TYPES
// ========================================

/** Keys of GlobalAudioSettings that are effect-param objects (excludes the two top-level flags). */
type EffectKey = Exclude<keyof GlobalAudioSettings, 'compressorBeforeDelay' | 'lfoDrift'>;

/** Routes a setGlobalAudio(effect, partial) call to its matching AudioEngine setter. */
const GLOBAL_SETTER: { [K in EffectKey]: (params: Partial<GlobalAudioSettings[K]>) => void } = {
  compressor: AudioEngine.setGlobalCompressor,
  eq3: AudioEngine.setGlobalEQ,
  filterLPF: AudioEngine.setGlobalFilterLPF,
  filterHPF: AudioEngine.setGlobalFilterHPF,
  limiter: AudioEngine.setGlobalLimiter,
  delay: AudioEngine.setGlobalDelay,
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
 */
export function applyGlobalAudioToEngine(globalAudio: GlobalAudioSettings): void {
  AudioEngine.setGlobalCompressor(globalAudio.compressor);
  AudioEngine.setGlobalEQ(globalAudio.eq3);
  AudioEngine.setGlobalFilterLPF(globalAudio.filterLPF);
  AudioEngine.setGlobalFilterHPF(globalAudio.filterHPF);
  AudioEngine.setGlobalLimiter(globalAudio.limiter);
  AudioEngine.setGlobalDelay(globalAudio.delay);
  AudioEngine.setGlobalReverb(globalAudio.reverb);
  for (const group of DRIFT_GROUP_IDS) {
    lfoEngine.setGlobalRateDrift(group, globalAudio.lfoDrift[group].rateDrift);
    lfoEngine.setGlobalDepthDrift(group, globalAudio.lfoDrift[group].depthDrift);
  }
}

/** Initial globalLfo — DEFAULT_LFO_SETTINGS' 7 global entries, each starting inert
 *  (rate 0, not connected) until the AS-sync below seeds real values. */
function buildDefaultGlobalLfo(): Record<GlobalLfoTargetId, LfoSettings> {
  const result = {} as Record<GlobalLfoTargetId, LfoSettings>;
  for (const target of GLOBAL_LFO_TARGET_IDS) {
    result[target] = { ...DEFAULT_LFO_SETTINGS[target] };
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
  /** Global-chain LFO settings, one entry per GlobalLfoTargetId — seeded per Attenuation Style, see regenerateGlobalLfoFromSeed. */
  globalLfo: Record<GlobalLfoTargetId, LfoSettings>;
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
  /** Instance keys (`lpf.Q`, `robot-3:layer0.detune`) of LFOs the user (or the seed) asked for but the Audio Load dial is holding off.
   *  Derived; written only by audioBudgetSystem, which mirrors lfoEngine's held-off set. */
  heldOffLfoKeys: string[];
  /** Whether the dial currently holds drift ("stacked" LFOs) off — the drift sliders grey out while it does. Derived. */
  driftHeldOff: boolean;
  setBPM: (bpm: number) => void;
  /**
   * Reseed `bpm` for the given (newly built) locale — draws a fresh value
   * via generateLocaleBpm and pushes it through the existing setBPM action
   * (state write + AudioEngine.setBPM). Called only from worldTransition.ts's
   * retransmitCoordsOnly/retransmitBoth (docs/specs/BPM_CONTROL.md §1.3) —
   * NOT from retransmitAttenuationStyleOnly, and NOT a subscription.
   */
  regenerateBpmFromSeed: (localeId: string, coordinates: { x: number; y: number }) => void;
  setGlobalAudio: <K extends EffectKey>(
    effect: K,
    partial: Partial<GlobalAudioSettings[K]>
  ) => void;
  /**
   * Sets one global LFO target's settings — updates state, always pushes
   * shape/rate/depth to lfoEngine, and connects+starts (rate > 0) or
   * disconnects+stops (rate === 0) the live node.
   */
  setGlobalLfo: (target: GlobalLfoTargetId, value: LfoSettings) => void;
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
  /** Sets the Robot Load slider, clamped to [0, 1] (NaN → Full). A plain state write — the budget
   *  system reacts to it; nothing here touches the engine. Leaves effectsLoad untouched. */
  setRobotLoad: (robotLoad: number) => void;
  /** Sets the Effects Load slider, clamped to [0, 1] (NaN → Full). A plain state write — the budget
   *  system reacts to it; nothing here touches the engine. Leaves robotLoad untouched. */
  setEffectsLoad: (effectsLoad: number) => void;
  /** Writes the derived sounding set. Skips the write entirely — no new state, no subscriber
   *  notification — when the ids (and their order) are unchanged. */
  setSoundingRobotIds: (ids: readonly string[]) => void;
  /** Writes the held-off LFO keys; skips the write when the same LFOs are held off (in any order). */
  setHeldOffLfoKeys: (keys: readonly string[]) => void;
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
   * Sets one drift group's LFO drift amount(s) (docs/specs/LFO_DRIFT_GROUPS.md)
   * — updates globalAudio.lfoDrift[group] and pushes only the field(s)
   * actually provided to lfoEngine's matching setGlobalRateDrift/
   * setGlobalDepthDrift for that same group; every other group is untouched.
   * A bespoke action (not routed through setGlobalAudio/GLOBAL_SETTER),
   * shaped like setCompressorBeforeDelay above — lfoDrift is a top-level
   * flag, not a per-effect object with its own AudioEngine.setGlobal*
   * counterpart.
   */
  setGlobalLfoDrift: (group: DriftGroupId, partial: Partial<GlobalAudioSettings['lfoDrift'][DriftGroupId]>) => void;
  /**
   * Regenerate `globalAudio` for the given Attenuation Style from the seed
   * (generateGlobalAudioSettings, src/utils/globalAudioSeed.ts) and push the
   * result into AudioEngine's live Tone FX chain.
   */
  regenerateGlobalAudioFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
  /**
   * Regenerate `globalLfo` state for the given Attenuation Style from the
   * seed (generateGlobalLfoSettings). Data-only — does NOT touch lfoEngine.
   * Runs at module load / on every Attenuation Style switch, before any user
   * gesture, so it must never construct a real Tone.LFO node.
   * AudioEngine.start() (Task 9) is what primes lfoEngine from this state and
   * connects/starts already-seeded-active targets, since that's the only
   * point guaranteed to run after an AudioContext actually exists.
   */
  regenerateGlobalLfoFromSeed: (attenuationStyleId: string, attenuationStyleName: string) => void;
}

// ========================================
// STORE
// ========================================
export const useAudioStore = create<AudioStore>((set, get) => ({
  bpm: 60,
  globalAudio: { ...DEFAULT_GLOBAL_AUDIO_SETTINGS },
  globalLfo: buildDefaultGlobalLfo(),
  isMuted: false,
  volume: 1,
  pingVarianceAutomation: PING_VARIANCE_AUTOMATION_UNSEEDED, // real value assigned by the first regenerateGlobalAudioFromSeed call below (module-load AS-sync)
  robotLoad: readInitialRobotLoad(),
  effectsLoad: readInitialEffectsLoad(),
  soundingRobotIds: [],
  heldOffLfoKeys: [],
  driftHeldOff: false,

  setBPM: (bpm) => {
    set({ bpm });
    // Delegate to AudioEngine — the only module allowed to call Tone.js directly.
    // AudioEngine.setBPM guards against calling Transport before audio is started.
    AudioEngine.setBPM(bpm);
  },

  regenerateBpmFromSeed: (localeId, coordinates) => {
    get().setBPM(generateLocaleBpm(localeId, coordinates.x, coordinates.y));
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

  setCompressorBeforeDelay: (value) => {
    set((state) => ({ globalAudio: { ...state.globalAudio, compressorBeforeDelay: value } }));
    wireGlobalFxChain(value);
  },

  setGlobalLfoDrift: (group, partial) => {
    set((state) => ({
      globalAudio: {
        ...state.globalAudio,
        lfoDrift: { ...state.globalAudio.lfoDrift, [group]: { ...state.globalAudio.lfoDrift[group], ...partial } },
      },
    }));
    if (partial.rateDrift !== undefined) lfoEngine.setGlobalRateDrift(group, partial.rateDrift);
    if (partial.depthDrift !== undefined) lfoEngine.setGlobalDepthDrift(group, partial.depthDrift);
  },

  setGlobalLfo: (target, value) => {
    set((state) => ({ globalLfo: { ...state.globalLfo, [target]: value } }));
    lfoEngine.setLfoShape(target, value.shape);
    lfoEngine.setLfoRate(target, value.rate);
    lfoEngine.setLfoDepth(target, value.depth);
    if (value.rate > 0) {
      if (lfoEngine.connectLfoTarget(target)) lfoEngine.start(target);
    } else {
      lfoEngine.disconnectLfoTarget(target);
      lfoEngine.stop(target);
    }
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
  setHeldOffLfoKeys: (keys) => {
    const current = get().heldOffLfoKeys;
    const sameSet = keys.length === current.length && keys.every((key) => current.includes(key));
    if (!sameSet) set({ heldOffLfoKeys: [...keys] });
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
    set({ globalAudio, ...(pingVarianceAutomation !== undefined ? { pingVarianceAutomation } : {}) });
    applyGlobalAudioToEngine(globalAudio);
  },

  // Data-only, deliberately: this runs at module load / on every Attenuation
  // Style switch, long before any user gesture — pushing to lfoEngine here
  // would construct a real Tone.LFO (getOrCreateLfo -> new Tone.LFO(...))
  // before an AudioContext exists, violating "initialize audio only from an
  // explicit user gesture" (CLAUDE.md) and throwing outright in headless/test
  // environments (found via the Phase 2 checkpoint's full suite run —
  // TransportBar.test.tsx, which imports the real audioStore module, threw
  // "param must be an AudioParam"). AudioEngine.start() (Task 9) is the only
  // safe point to prime lfoEngine and connect/start already-seeded-active
  // targets, since it runs after Tone.start()/transport.start() succeed.
  regenerateGlobalLfoFromSeed: (attenuationStyleId, attenuationStyleName) => {
    const globalLfo = generateGlobalLfoSettings(attenuationStyleId, attenuationStyleName);
    set({ globalLfo });
  },
}));

// ========================================
// ATTENUATION STYLE SYNC
// ========================================
// Keep globalAudio seeded from whichever Attenuation Style is active — seeds
// immediately for the one active at load (satisfies "app init"), then
// re-seeds on every future currentAttenuationStyleId change (satisfies "any
// future Attenuation Style switch") without requiring every future call site
// of setCurrentAttenuationStyleId to remember to also call
// regenerateGlobalAudioFromSeed. Mirrors attenuationStyleStore.ts's own
// module-scope noise-map priming (`getAttenuationStyleNoiseMap('pelagos', 'Pelagos')`).
function syncGlobalAudioToCurrentAttenuationStyle(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!attenuationStyle) return;
  useAudioStore.getState().regenerateGlobalAudioFromSeed(attenuationStyle.id, attenuationStyle.name);
  useAudioStore.getState().regenerateGlobalLfoFromSeed(attenuationStyle.id, attenuationStyle.name);
}

syncGlobalAudioToCurrentAttenuationStyle();
useAttenuationStyleStore.subscribe((state, prevState) => {
  if (state.currentAttenuationStyleId !== prevState.currentAttenuationStyleId) {
    syncGlobalAudioToCurrentAttenuationStyle();
  }
});

// ========================================
// LOCALE BPM SYNC (module load only — see docs/specs/BPM_CONTROL.md §1.3)
// ========================================
// Seeds audioStore.bpm for whichever locale is current at app boot. Every
// LATER reseed is triggered explicitly by worldTransition.ts's
// retransmitCoordsOnly/retransmitBoth, not by a subscription here — unlike
// syncGlobalAudioToCurrentAttenuationStyle above, this deliberately does NOT
// re-run on every currentAttenuationStyleId change, since
// retransmitAttenuationStyleOnly must leave bpm untouched.
function syncBpmToCurrentLocale(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const localeId = attenuationStyle?.currentLocaleId;
  const locale = localeId ? useLocaleStore.getState().getLocaleById(localeId) : undefined;
  if (!locale) return;
  useAudioStore.getState().regenerateBpmFromSeed(locale.id, locale.coordinates);
}

syncBpmToCurrentLocale();
