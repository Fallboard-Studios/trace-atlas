import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AudioSettingValue } from '@/components/robot/AudioSettingSection';
import type { PingControlsValue } from '@/components/robot/PingControlsDrawer';
import type { SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { resolveCompanyOptions, diffCompoundField } from '@/systems/companyOptions';
import {
  applyAudioMode, applyVolume,
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfoLink,
} from '@/systems/robotOptionsActions';
import { cancelSwellForRobotAttribute, isRobotAttributeSwelling } from '@/systems/audioSwells';
import { useAdsrSwellingFlags, useLayerSwellingFlags } from '@/components/robot/useSwellingFlags';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import type { SignatureArrayParamSchema } from '@/data/robotOptionsConfig';
import type { ADSREnvelope, Robot, WaveformType } from '@/types/Robot';
import type { SwellRobotAttributeId } from '@/types/audioSwell';
import type { Company, CompanyOptionsSnapshot } from '@/types/Company';
import type { RobotLfoTargetId } from '@/types/lfo';
import type { LfoLinkValue } from '@/types/controls';

/** The target that bulk-edits the whole fleet: every robot, Freelance included. Otherwise a company id. */
export const ALL_TARGET = 'all';

// Placeholder values shown when there's nothing to derive real ones from — a selected company
// with zero members (nothing to broadcast to, nothing to resolve a baseline from). Kept structurally complete (e.g. 3 layer slots, not an empty array) so the panel's
// layout doesn't jump between the disabled and enabled states.
const DISABLED_AUDIO_SETTING: AudioSettingValue = {
  audioMode: 'none',
  masterVolume: 0,
  pan: 0,
  panAuto: true,
};

const DISABLED_PING_CONTROLS: PingControlsValue = {
  rhythmicDensity: 0,
  rhythmicMotifLength: 0,
  noteVariance: 0,
  pitchRepeat: 0,
  octaveRange: [1, 7],
  clickTrackActive: false,
};

const DISABLED_ADSR: ADSREnvelope = { attack: 0, decay: 0, sustain: 0, release: 0 };

const DISABLED_LAYER = { type: 'sine' as const, gain: 0, detune: 0, phase: 0 };
const DISABLED_SIGNATURE_ARRAY: SignatureArrayValue = {
  layers: [DISABLED_LAYER, DISABLED_LAYER, DISABLED_LAYER],
  lfoLinks: {},
};

const NO_ROBOTS: Robot[] = [];
const NO_COMPANIES: Company[] = [];

/** One layer's four swelling flags, for the layer panel's sliders. */
export interface LayerSwelling {
  gain: boolean;
  detune: boolean;
  phase: boolean;
  pulseWidth: boolean;
}

/** An envelope's four swelling flags. */
export interface AdsrSwelling {
  attack: boolean;
  decay: boolean;
  sustain: boolean;
  release: boolean;
}

/**
 * Everything the four section panels need to edit a company (or the whole fleet): the values they show,
 * the handlers that broadcast an edit, and the disabled state. One memoized object, so a consumer that
 * reads it re-derives only when a value in it changed (see the stability notes on `useCompanyOptions`).
 */
export interface CompanyOptions {
  /** False when there is nothing to edit: no members, or a company id that names no company. */
  active: boolean;
  audioSettingValue: AudioSettingValue;
  pingControlsValue: PingControlsValue;
  adsrValue: ADSREnvelope;
  signatureArrayValue: SignatureArrayValue;
  volumeSwelling: boolean;
  adsrSwelling: AdsrSwelling | undefined;
  layerSwelling: readonly [LayerSwelling | undefined, LayerSwelling | undefined, LayerSwelling | undefined];
  onAudioModeChange: (mode: Robot['audioMode']) => void;
  onVolumeChange: (pct: number) => void;
  onPanChange: (display: number) => void;
  onPanAutoChange: (auto: boolean) => void;
  onDensityChange: (v: number) => void;
  onMotifLengthChange: (v: number) => void;
  onPitchRepeatChange: (v: number) => void;
  onOctaveMinChange: (v: number) => void;
  onOctaveMaxChange: (v: number) => void;
  onNoteVarianceChange: (v: number) => void;
  onAdsrChange: (adsr: ADSREnvelope) => void;
  onLayerTypeChange: (idx: number, type: WaveformType) => void;
  onLayerParamChange: (idx: number, field: SignatureArrayParamSchema['field'], v: number) => void;
  onLayerLfoFieldChange: (idx: number, target: RobotLfoTargetId, value: LfoLinkValue) => void;
}

export interface CompanyOptionsResult {
  /** The company, when `target` names one; undefined for 'all' and for an id naming no company. */
  company: Company | undefined;
  /** Every robot the edits reach: the company's members, or every robot in the locale for 'all'. */
  members: readonly Robot[];
  options: CompanyOptions;
}

/**
 * The company screen's logic, moved out of CompanyOptionsSection (docs/tasks/LAYOUT_REWORK.md Task 23;
 * Roadmap Phase 10): the "company mode" counterpart to the robot screen's per-robot values and handlers.
 *
 * `target` is a company id, or `ALL_TARGET` — a third mode, mutually exclusive with a company: `members`
 * becomes every robot in the locale regardless of company (Freelance included), fed
 * `locale.allRobotsLastEditedOptions` instead of a Company's own snapshot.
 *
 * With a missing company, or one with zero members (nothing to derive a baseline from, nothing to
 * broadcast to), `options.active` is false and every value is a placeholder. Otherwise each value comes
 * from resolveCompanyOptions(lastEditedOptions, members[0]), and every edit broadcasts through the exact
 * same robotOptionsActions functions the robot screen uses — once per member — then patches only the
 * touched field into the snapshot (COMPANIES.md: broadcast, not link). The layer panels report *which*
 * field or layer changed directly, so only the genuinely compound values (an ADSR, an LfoLink) still
 * go through diffCompoundField.
 *
 * Stability: `options` keeps its identity unless a value in it changes, so an edit to a robot outside
 * the company, or to a member that is not first, re-renders nothing that reads it. The handlers read the
 * latest roster from a ref and are stable across every edit.
 */
export function useCompanyOptions(target: string): CompanyOptionsResult {
  const localeId = getActiveLocaleId();
  const all = target === ALL_TARGET;
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? NO_COMPANIES);
  // Subscribe to the raw robots array (a stable reference — Zustand's default equality check is
  // by reference, and this only changes when the store's own robots array does) and filter
  // outside the selector. Filtering *inside* a Zustand selector returns a brand-new array every
  // call, which useSyncExternalStore sees as "always changed" and loops forever re-rendering.
  const robots = useLocaleStore((s) => s.locales[localeId]?.robots ?? NO_ROBOTS);
  const allRobotsLastEditedOptions = useLocaleStore((s) => s.locales[localeId]?.allRobotsLastEditedOptions);

  const members = useMemo(
    () => (all ? robots : robots.filter((r) => r.companyId === target)),
    [robots, all, target],
  );

  // `.find()` returns an existing array element, never a new object, so `company` is already a
  // stable reference whenever `companies`/`target` haven't changed — no memo needed.
  const company = all ? undefined : companies.find((c) => c.id === target);
  const active = all ? members.length > 0 : Boolean(company) && members.length > 0;
  const lastEditedOptions = all ? allRobotsLastEditedOptions : company?.lastEditedOptions;

  // Keyed on firstMember specifically, not the wrapping `members` array — `members` itself gets a
  // new array reference on ANY robots-array change (even one that doesn't touch this company at
  // all, since `.filter()` above always returns a fresh array), but resolveCompanyOptions only
  // ever reads members[0] (the "first member" baseline) — an edit to a DIFFERENT member, or to
  // any robot outside this company, leaves firstMember's own reference untouched, so keying on it
  // directly (not on `members`) is what actually keeps `resolved` stable for those cases.
  const firstMember = members[0];
  const resolved = useMemo(
    () => (active ? resolveCompanyOptions(lastEditedOptions, firstMember) : undefined),
    [active, lastEditedOptions, firstMember],
  );

  // Audio Swells: per-field swelling flags (see the robot screen's matching block for the full
  // reasoning) — checked against firstMember specifically, matching `resolved` itself, which
  // only ever derives its displayed value from members[0]. A company-wide swell shares one
  // ActiveSwell across every member in lockstep (isRobotAttributeSwelling is true for all of them
  // together), so firstMember's own flag is already correct for that case; a single-robot swell
  // that happens to target some OTHER member never shows here, same as its value wouldn't either.
  const firstMemberId = firstMember?.id;
  const volumeSwelling = firstMemberId !== undefined && isRobotAttributeSwelling(firstMemberId, 'volume');
  // The flags recompute when the field a swell tick writes changes (useSwellingFlags).
  const adsrSwelling = useAdsrSwellingFlags(firstMemberId, resolved?.adsr);
  const layer0Swelling = useLayerSwellingFlags(firstMemberId, 0, resolved?.layers[0]);
  const layer1Swelling = useLayerSwellingFlags(firstMemberId, 1, resolved?.layers[1]);
  const layer2Swelling = useLayerSwellingFlags(firstMemberId, 2, resolved?.layers[2]);

  // `resolved` bundles every field into one shared snapshot object, so handing it whole to every
  // section would make ANY field edit on members[0] invalidate all of them at once — the identical
  // whole-object cascade the robot screen's fix already solved for `robot`. Each section instead
  // gets its own narrowly-`useMemo`'d value, keyed only on the specific sub-fields it actually uses.
  //
  // Each field is destructured to its own local *before* the memo, rather than read as
  // `resolved.field` inside the memo callback — React Compiler statically infers a `useMemo`
  // callback's dependencies from what it reads in its body, and infers the *whole* `resolved`
  // object if the callback reads `resolved.field` directly, rejecting a manually-narrower
  // dependency array as a mismatch. Reading pre-extracted locals instead makes the compiler's own
  // inference match these narrower dependencies exactly, since `resolved` itself is never
  // referenced inside any of these callbacks.
  const resolvedAudioMode = resolved?.audioMode;
  const resolvedMasterVolume = resolved?.masterVolume;
  const audioSettingValue: AudioSettingValue = useMemo(() => (
    active
      // Robot Pan Task 8 bridge: pan/panAuto are resolved from the snapshot and first member in Task 10.
      ? { audioMode: resolvedAudioMode!, masterVolume: resolvedMasterVolume!, pan: 0, panAuto: true }
      : DISABLED_AUDIO_SETTING
  ), [active, resolvedAudioMode, resolvedMasterVolume]);

  // PingControlsValue's rhythmicMotifLength/noteVariance are plain numbers (docs/specs/
  // STEPPER_TO_SLIDER.md §7.3) but resolved/CompanyOptionsSnapshot still carry the {active, value}
  // shape — flatten to .value here, the one place this derives PingControls' value.
  const resolvedRhythmicDensity = resolved?.rhythmicDensity;
  const resolvedRhythmicMotifLength = resolved?.rhythmicMotifLength;
  const resolvedNoteVariance = resolved?.noteVariance;
  const resolvedPitchRepeat = resolved?.pitchRepeat;
  const resolvedOctaveRange = resolved?.octaveRange;
  const resolvedClickTrackActive = resolved?.clickTrackActive;
  const pingControlsValue: PingControlsValue = useMemo(() => (
    active
      ? {
        rhythmicDensity: resolvedRhythmicDensity!,
        rhythmicMotifLength: resolvedRhythmicMotifLength!.value,
        noteVariance: resolvedNoteVariance!.value,
        pitchRepeat: resolvedPitchRepeat!,
        octaveRange: resolvedOctaveRange!,
        clickTrackActive: resolvedClickTrackActive!,
      }
      : DISABLED_PING_CONTROLS
  ), [
    active, resolvedRhythmicDensity, resolvedRhythmicMotifLength, resolvedNoteVariance, resolvedPitchRepeat,
    resolvedOctaveRange, resolvedClickTrackActive,
  ]);

  const resolvedAdsr = resolved?.adsr;
  const adsrValue: ADSREnvelope = useMemo(() => resolvedAdsr ?? DISABLED_ADSR, [resolvedAdsr]);

  const resolvedLayers = resolved?.layers;
  const resolvedLfoLinks = resolved?.lfoLinks;
  const signatureArrayValue: SignatureArrayValue = useMemo(
    () => (active ? { layers: resolvedLayers!, lfoLinks: resolvedLfoLinks! } : DISABLED_SIGNATURE_ARRAY),
    [active, resolvedLayers, resolvedLfoLinks],
  );

  // Every handler below reads from this ref instead of closing over `members`/`resolved`/
  // `company`/`all`/`allRobotsLastEditedOptions` directly — those change reference
  // on edits unrelated to any single handler's own concern (see the doc comment above), so
  // closing over them directly would make every handler unstable on every edit, defeating the
  // sections' own memoization regardless of which field the user actually touched.
  const latest = useRef({ members, resolved, company, all, allRobotsLastEditedOptions });
  useEffect(() => {
    latest.current = { members, resolved, company, all, allRobotsLastEditedOptions };
  });

  const patchSnapshot = useCallback((partial: Partial<CompanyOptionsSnapshot>) => {
    const { company, all, allRobotsLastEditedOptions } = latest.current;
    if (all) {
      useLocaleStore.getState().setLocaleData(localeId, {
        allRobotsLastEditedOptions: { ...allRobotsLastEditedOptions, ...partial },
      });
      return;
    }
    if (!company) return;
    useLocaleStore.getState().updateCompany(localeId, company.id, {
      lastEditedOptions: { ...company.lastEditedOptions, ...partial },
    });
  }, [localeId]);

  const onAudioModeChange = useCallback((mode: Robot['audioMode']) => {
    latest.current.members.forEach((m) => applyAudioMode(m, localeId, mode));
    patchSnapshot({ audioMode: mode });
  }, [localeId, patchSnapshot]);

  const onVolumeChange = useCallback((pct: number) => {
    latest.current.members.forEach((m) => {
      cancelSwellForRobotAttribute(m.id, 'volume');
      applyVolume(m, localeId, pct);
    });
    patchSnapshot({ masterVolume: pct / 100 });
  }, [localeId, patchSnapshot]);

  // Robot Pan Task 8 bridge: both are placeholders until Task 10 broadcasts them to the members.
  const onPanChange = useCallback((_display: number) => {}, []);
  const onPanAutoChange = useCallback((_auto: boolean) => {}, []);

  const onDensityChange = useCallback((v: number) => {
    latest.current.members.forEach((m) => applyDensity(m, localeId, v));
    patchSnapshot({ rhythmicDensity: v });
  }, [localeId, patchSnapshot]);

  const onMotifLengthChange = useCallback((v: number) => {
    // Plain-number pattern, matching onDensityChange/onPitchRepeatChange — not diffCompoundField,
    // whose single-changed-key assumption breaks once one edit can change both active and value
    // at once (e.g. crossing 0). applyMotifLength reconstructs each member's own {active, value}
    // internally; the snapshot patch does the same.
    latest.current.members.forEach((m) => applyMotifLength(m, localeId, v));
    patchSnapshot({ rhythmicMotifLength: { active: v > 0, value: v } });
  }, [localeId, patchSnapshot]);

  const onOctaveMinChange = useCallback((v: number) => {
    const { members, resolved } = latest.current;
    members.forEach((m) => applyOctaveMin(m, localeId, v));
    patchSnapshot({ octaveRange: [v, resolved?.octaveRange[1] ?? v] });
  }, [localeId, patchSnapshot]);

  const onOctaveMaxChange = useCallback((v: number) => {
    const { members, resolved } = latest.current;
    members.forEach((m) => applyOctaveMax(m, localeId, v));
    patchSnapshot({ octaveRange: [resolved?.octaveRange[0] ?? v, v] });
  }, [localeId, patchSnapshot]);

  const onNoteVarianceChange = useCallback((v: number) => {
    // Same plain-number pattern as onMotifLengthChange above.
    latest.current.members.forEach((m) => applyNoteVariance(m, localeId, v));
    patchSnapshot({ noteVariance: { active: v > 0, value: v } });
  }, [localeId, patchSnapshot]);

  const onPitchRepeatChange = useCallback((v: number) => {
    latest.current.members.forEach((m) => applyPitchRepeat(m, localeId, v));
    patchSnapshot({ pitchRepeat: v });
  }, [localeId, patchSnapshot]);

  const onAdsrChange = useCallback((adsr: ADSREnvelope) => {
    const { members, resolved } = latest.current;
    const patch = resolved ? diffCompoundField(resolved.adsr, adsr) : adsr;
    const changedFields = Object.keys(patch) as (keyof ADSREnvelope)[];
    members.forEach((m) => {
      changedFields.forEach((field) => cancelSwellForRobotAttribute(m.id, `adsr.${field}`));
      const memberOwn = resolveCompanyOptions(undefined, m).adsr;
      applyAdsr(m, localeId, { ...memberOwn, ...patch });
    });
    patchSnapshot({ adsr });
  }, [localeId, patchSnapshot]);

  // Layer edits arrive already-narrowed to one idx/field (SignatureArrayLayer's own onParamChange/
  // onTypeChange, Task 10) — no more diffLayerField reverse-engineering which layer/field changed
  // from a whole-array comparison; each member's own OTHER layers/fields are preserved simply by
  // reading that member's own current layers before patching the one touched index.
  const onLayerTypeChange = useCallback((idx: number, type: WaveformType) => {
    latest.current.members.forEach((m) => {
      const memberLayers = resolveCompanyOptions(undefined, m).layers;
      applyLayersStructural(m, localeId, memberLayers.map((l, i) => (i === idx ? { ...l, type } : l)));
    });
    const { resolved } = latest.current;
    const baseline = resolved?.layers ?? DISABLED_SIGNATURE_ARRAY.layers;
    patchSnapshot({ layers: baseline.map((l, i) => (i === idx ? { ...l, type } : l)) });
  }, [localeId, patchSnapshot]);

  const onLayerParamChange = useCallback((idx: number, field: SignatureArrayParamSchema['field'], v: number) => {
    latest.current.members.forEach((m) => {
      cancelSwellForRobotAttribute(m.id, `layer${idx}.${field}` as SwellRobotAttributeId);
      const memberLayers = resolveCompanyOptions(undefined, m).layers;
      applyLayersContinuous(m, localeId, memberLayers.map((l, i) => (i === idx ? { ...l, [field]: v } : l)));
    });
    const { resolved } = latest.current;
    const baseline = resolved?.layers ?? DISABLED_SIGNATURE_ARRAY.layers;
    patchSnapshot({ layers: baseline.map((l, i) => (i === idx ? { ...l, [field]: v } : l)) });
  }, [localeId, patchSnapshot]);

  const onLayerLfoFieldChange = useCallback((_idx: number, target: RobotLfoTargetId, value: LfoLinkValue) => {
    const { members, resolved } = latest.current;
    const oldValue = resolved?.lfoLinks?.[target] ?? { ...DEFAULT_LFO_LINK[target] };
    const patch = diffCompoundField(oldValue, value);
    members.forEach((m) => {
      const memberOwn = m.lfoLinks?.[target] ?? { ...DEFAULT_LFO_LINK[target] };
      applyLayerLfoLink(m, localeId, target, { ...memberOwn, ...patch });
    });
    patchSnapshot({ lfoLinks: { ...resolved?.lfoLinks, [target]: value } });
  }, [localeId, patchSnapshot]);

  // Memoized on exactly the fields it holds, so the object keeps its identity through every edit that
  // changes none of them: the stable bag a consumer's render callback is keyed on.
  const options = useMemo<CompanyOptions>(() => ({
    active,
    audioSettingValue,
    pingControlsValue,
    adsrValue,
    signatureArrayValue,
    volumeSwelling,
    adsrSwelling,
    layerSwelling: [layer0Swelling, layer1Swelling, layer2Swelling],
    onAudioModeChange,
    onVolumeChange,
    onPanChange,
    onPanAutoChange,
    onDensityChange,
    onMotifLengthChange,
    onPitchRepeatChange,
    onOctaveMinChange,
    onOctaveMaxChange,
    onNoteVarianceChange,
    onAdsrChange,
    onLayerTypeChange,
    onLayerParamChange,
    onLayerLfoFieldChange,
  }), [
    active, audioSettingValue, pingControlsValue, adsrValue, signatureArrayValue,
    volumeSwelling, adsrSwelling, layer0Swelling, layer1Swelling, layer2Swelling,
    onAudioModeChange, onVolumeChange, onPanChange, onPanAutoChange, onDensityChange, onMotifLengthChange, onPitchRepeatChange,
    onOctaveMinChange, onOctaveMaxChange, onNoteVarianceChange, onAdsrChange,
    onLayerTypeChange, onLayerParamChange, onLayerLfoFieldChange,
  ]);

  return { company, members, options };
}
