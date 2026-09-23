import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsDrawer, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayDrawer, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { resolveCompanyOptions, diffCompoundField, diffLayerField } from '@/systems/companyOptions';
import {
  applyAudioMode, applyVolume, applyVolumeLfo,
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo, applyClickTrackActive,
} from '@/systems/robotOptionsActions';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { VOLUME_LFO_TARGET } from '@/data/robotOptionsConfig';
import { LFO_RATE_MIN, LFO_DEPTH_MIN } from '@/types/lfo';
import { getTraitColorStyle, getDisabledTraitColorStyle } from '@/utils/traitColors';
import type { RobotSection } from '@/stores/uiStore';
import type { ADSREnvelope, Robot } from '@/types/Robot';
import type { CompanyOptionsSnapshot } from '@/types/Company';
import type { RobotLfoTargetId } from '@/types/lfo';
import type { LfoValue } from '@/types/controls';
import type { OscillatorLayer } from '@/types/layeredAudio';

import './CompanyOptionsSection.css';

// Module-level (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up, 2026-09-15) — 'output'/
// 'composition'/'timeSpace'/'spectral' are literal constants, and `active` is a plain boolean, so
// picking between a fixed active/disabled pair per trait needs no memoization at all — the ternary
// below just selects one of these 2 already-stable references, never constructs anything new.
const OUTPUT_ACTIVE_STYLE = getTraitColorStyle('output');
const OUTPUT_DISABLED_STYLE = getDisabledTraitColorStyle('output');
const COMPOSITION_ACTIVE_STYLE = getTraitColorStyle('composition');
const COMPOSITION_DISABLED_STYLE = getDisabledTraitColorStyle('composition');
const TIME_SPACE_ACTIVE_STYLE = getTraitColorStyle('timeSpace');
const TIME_SPACE_DISABLED_STYLE = getDisabledTraitColorStyle('timeSpace');
const SPECTRAL_ACTIVE_STYLE = getTraitColorStyle('spectral');
const SPECTRAL_DISABLED_STYLE = getDisabledTraitColorStyle('spectral');

// Placeholder values shown when there's nothing to derive real ones from — a selected company
// with zero members (nothing to broadcast to, nothing to resolve a baseline from). Kept structurally complete (e.g. 3 layer slots, not an empty array) so the panel's
// layout doesn't jump between the disabled and enabled states.
const DISABLED_AUDIO_SETTING: AudioSettingValue = {
  audioMode: 'none',
  masterVolume: 0,
  volumeLfo: { shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN },
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
  lfoSettings: {},
};

/**
 * "Company mode" call site for AudioSettingSection/PingControlsDrawer/PingContourDrawer/
 * SignatureArrayDrawer (Roadmap Phase 10) — the counterpart to RobotOptionsTab's "robot mode."
 * Each of the 4 gets the identical trait style RobotOptionsTab passes it when active
 * (output/composition/timeSpace/spectral, Roadmap Phase 14) — a Volume/Melody/Envelope/Source
 * accordion always renders in its own domain trait regardless of whether it's editing one robot
 * or a company's bulk baseline, matching the robot detail page rather than CompanyManager's own
 * Company blue/plum (which stays reserved for CompanyManager's own chrome — the button row and
 * CRUD controls — see CompanyManager.tsx's own root style).
 * With no company selected, or a selected company with zero members (nothing to derive a
 * baseline from, nothing to broadcast to), every section renders disabled with a placeholder
 * value — and, since 2026-09-13, its own accordion facade switches to
 * getDisabledTraitColorStyle (the trait's own 2 tones, desaturated rather than replaced —
 * traitColors.ts) instead of the full-saturation style, so a section reading as inert visually
 * matches its own placeholder content rather than showing full color for controls that can't
 * actually be edited. With a non-empty company selected, each section's value comes from
 * resolveCompanyOptions(company.lastEditedOptions, members[0]), and every edit broadcasts
 * through the exact same robotOptionsActions functions RobotOptionsTab uses — once per member —
 * then patches only the touched field into the company's own lastEditedOptions snapshot. A
 * company edit is a one-time broadcast, never a standing link: editing a member robot
 * individually afterward (even via its own Robot Options screen) never touches lastEditedOptions
 * and is never reverted by this panel.
 *
 * CompanyButtonRow's "All" option (uiStore.allRobotsSelected) is a third mode, mutually
 * exclusive with selectedCompanyId: `members` becomes every robot in the locale regardless of
 * company (Freelance included), and the broadcast/snapshot machinery reruns identically against
 * that wider set — same resolveCompanyOptions call, same per-member applyXxx loop — just fed
 * `locale.allRobotsLastEditedOptions` instead of a Company's own snapshot, since there is no
 * Company object for "All" to bind to. Deliberately never touches any individual company's
 * lastEditedOptions, and vice versa — the two snapshots are independent.
 *
 * Every compound value (volumeLfo, rhythmicMotifLength, noteVariance, adsr, layers, per-layer
 * lfoSettings) arrives from its drawer as a *whole* replacement object/array built by spreading
 * `resolved` — the panel's own shared baseline — with just the one touched field set (e.g. Ping
 * Contour's Attack slider fires `{ ...adsr, attack: v }`). Broadcasting that whole object to every
 * member would silently overwrite each member's own untouched sub-fields (their own Decay/
 * Sustain/Release, their own other 2 signature layers, etc.) with whatever `resolved` held. Each
 * such handler instead diffs the old vs. new value (diffCompoundField/diffLayerField, both in
 * systems/companyOptions.ts) to find the single field that changed, then merges just that field
 * onto each member's own current value before calling the matching applyXxx — so a broadcast edit
 * only ever touches the one attribute the user actually changed, member by member.
 *
 * **Memoization (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md follow-up, 2026-09-15):** found live
 * (React DevTools "highlight updates") still cascading heavily even after RobotOptionsTab's own
 * fix — `members`/`resolved`/`pingControlsValue` were rebuilt fresh every render, and every
 * `onXChange` handler was a fresh inline closure, same shape as RobotOptionsTab's own bug. Worse
 * here: `robots` (this component's own store subscription) is the *whole locale's* robot array,
 * which gets a new reference on *any* robot edit anywhere in the locale — not just an edit to a
 * member of the currently-selected company — so without memoization this component re-rendered,
 * and re-cascaded into all 4 (already-memoized) sections, on every single field edit happening
 * anywhere in the app. `members`/`resolved`/`pingControlsValue` are now `useMemo`'d against their
 * own real inputs, and every handler reads the latest `members`/`resolved`/`company`/
 * `allRobotsSelected`/`allRobotsLastEditedOptions` from a ref (updated in an effect, never mutated
 * during render) rather than closing over them directly — the same "stable callback identity,
 * fresh values read at call time" pattern `RobotOptionsTab.tsx`/`Lfo.tsx` already use, needed here
 * because every one of those values can change on an edit this component's own concern has nothing
 * to do with.
 *
 * Also wrapped in `React.memo` (docs/todo/backlog.md #27 follow-up), matching `CompanyManager.tsx`
 * — this component takes zero props, rendered directly by `RobotsTab`, so an empty prop list can
 * never differ. **Known limitation, documented rather than silently claimed as fixed:** this does
 * NOT stop this component's own top-level body from re-executing on every robots-array change —
 * its own `useLocaleStore` subscription to the whole locale's `robots` array (needed to compute
 * `members`) triggers independently of any parent-driven memo bail, on every robot edit anywhere
 * in the locale (`CompanyManager.tsx`'s own doc comment: audioSwells ticks, ~8-9x/sec). The memo
 * wrap here is still correct — it stops *this* component from being forced to re-render by
 * `RobotsTab`'s own churn for no reason of its own — but the fix above (narrowly-`useMemo`'d
 * per-section values) is what actually stops the CASCADE into its 4 children; genuinely reducing
 * this component's own re-execution rate would need a deeper store restructuring (e.g. per-robot
 * selectors instead of one whole-locale array), out of scope here.
 *
 * `section` prop (Task 19, docs/tasks/NAV_LAYOUT_REWRITE.md): optional, additive to the original
 * zero-prop shape RobotsTab.tsx's own call site still uses unchanged. Omitted or null renders all
 * 4 sections (today's behavior, unchanged); one of the 4 RobotSection values narrows rendering to
 * that single section — the "Probes -> All Probes -> Volume/Melody/Envelope/Source" leaf content
 * ProbesContent.tsx binds to, reusing this component's existing allRobotsSelected-driven
 * "broadcast to every robot in the locale" mode rather than any new bulk-edit wiring.
 */
interface CompanyOptionsSectionProps {
  section?: RobotSection | null;
}

export const CompanyOptionsSection = memo(function CompanyOptionsSection({ section = null }: CompanyOptionsSectionProps = {}) {
  const localeId = getActiveLocaleId();
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const allRobotsSelected = useUIStore((s) => s.allRobotsSelected);
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? []);
  // Subscribe to the raw robots array (a stable reference — Zustand's default equality check is
  // by reference, and this only changes when the store's own robots array does) and filter
  // outside the selector. Filtering *inside* a Zustand selector returns a brand-new array every
  // call, which useSyncExternalStore sees as "always changed" and loops forever re-rendering.
  const robots = useLocaleStore((s) => s.locales[localeId]?.robots ?? []);
  const allRobotsLastEditedOptions = useLocaleStore((s) => s.locales[localeId]?.allRobotsLastEditedOptions);

  const members = useMemo(
    () => (allRobotsSelected ? robots : robots.filter((r) => r.companyId === selectedCompanyId)),
    [robots, allRobotsSelected, selectedCompanyId],
  );

  // `.find()` returns an existing array element, never a new object, so `company` is already a
  // stable reference whenever `companies`/`selectedCompanyId` haven't changed — no memo needed.
  const company = companies.find((c) => c.id === selectedCompanyId);
  const active = allRobotsSelected ? members.length > 0 : Boolean(company) && members.length > 0;
  const lastEditedOptions = allRobotsSelected ? allRobotsLastEditedOptions : company?.lastEditedOptions;

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

  // `resolved` bundles every field into one shared snapshot object, so passing it directly to all
  // 4 sections would make ANY field edit on members[0] invalidate all 4 at once — the identical
  // whole-object cascade RobotOptionsTab's own fix already solved for `robot`. Each section instead
  // gets its own narrowly-`useMemo`'d value, keyed only on the specific sub-fields it actually
  // uses, so an edit to (say) `resolved.adsr` alone doesn't also produce new-reference `audioMode`/
  // `masterVolume`/`volumeLfo` for `AudioSettingSection`. Confirmed live via this same cascade
  // regression test going RED for exactly this reason before this split.
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
  const resolvedVolumeLfo = resolved?.volumeLfo;
  const audioSettingValue: AudioSettingValue = useMemo(() => (
    active
      ? { audioMode: resolvedAudioMode!, masterVolume: resolvedMasterVolume!, volumeLfo: resolvedVolumeLfo! }
      : DISABLED_AUDIO_SETTING
  ), [active, resolvedAudioMode, resolvedMasterVolume, resolvedVolumeLfo]);

  // PingControlsValue's rhythmicMotifLength/noteVariance are plain numbers (docs/specs/
  // STEPPER_TO_SLIDER.md §7.3) but resolved/CompanyOptionsSnapshot still carry the {active, value}
  // shape — flatten to .value here, the one place this section derives PingControlsDrawer's value.
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
  const resolvedLfoSettings = resolved?.lfoSettings;
  const signatureArrayValue: SignatureArrayValue = useMemo(
    () => (active ? { layers: resolvedLayers!, lfoSettings: resolvedLfoSettings! } : DISABLED_SIGNATURE_ARRAY),
    [active, resolvedLayers, resolvedLfoSettings],
  );

  // Every handler below reads from this ref instead of closing over `members`/`resolved`/
  // `company`/`allRobotsSelected`/`allRobotsLastEditedOptions` directly — those change reference
  // on edits unrelated to any single handler's own concern (see the doc comment above), so
  // closing over them directly would make every handler unstable on every edit, defeating the
  // 4 sections' own memoization regardless of which field the user actually touched.
  const latest = useRef({ members, resolved, company, allRobotsSelected, allRobotsLastEditedOptions });
  useEffect(() => {
    latest.current = { members, resolved, company, allRobotsSelected, allRobotsLastEditedOptions };
  });

  const patchSnapshot = useCallback((partial: Partial<CompanyOptionsSnapshot>) => {
    const { company, allRobotsSelected, allRobotsLastEditedOptions } = latest.current;
    if (allRobotsSelected) {
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

  const handleAudioModeChange = useCallback((mode: Robot['audioMode']) => {
    latest.current.members.forEach((m) => applyAudioMode(m, localeId, mode));
    patchSnapshot({ audioMode: mode });
  }, [localeId, patchSnapshot]);

  const handleVolumeChange = useCallback((pct: number) => {
    latest.current.members.forEach((m) => applyVolume(m, localeId, pct));
    patchSnapshot({ masterVolume: pct / 100 });
  }, [localeId, patchSnapshot]);

  const handleVolumeLfoChange = useCallback((value: LfoValue) => {
    const { members, resolved } = latest.current;
    const patch = resolved ? diffCompoundField(resolved.volumeLfo, value) : value;
    members.forEach((m) => {
      const memberOwn = m.lfoSettings?.[VOLUME_LFO_TARGET] ?? { ...DEFAULT_LFO_SETTINGS[VOLUME_LFO_TARGET] };
      applyVolumeLfo(m, localeId, { ...memberOwn, ...patch });
    });
    patchSnapshot({ volumeLfo: value });
  }, [localeId, patchSnapshot]);

  const handleDensityChange = useCallback((v: number) => {
    latest.current.members.forEach((m) => applyDensity(m, localeId, v));
    patchSnapshot({ rhythmicDensity: v });
  }, [localeId, patchSnapshot]);

  const handleMotifLengthChange = useCallback((v: number) => {
    // Plain-number pattern, matching onDensityChange/onPitchRepeatChange — not diffCompoundField,
    // whose single-changed-key assumption breaks once one edit can change both active and value
    // at once (e.g. crossing 0). applyMotifLength reconstructs each member's own {active, value}
    // internally; the snapshot patch does the same.
    latest.current.members.forEach((m) => applyMotifLength(m, localeId, v));
    patchSnapshot({ rhythmicMotifLength: { active: v > 0, value: v } });
  }, [localeId, patchSnapshot]);

  const handleOctaveMinChange = useCallback((v: number) => {
    const { members, resolved } = latest.current;
    members.forEach((m) => applyOctaveMin(m, localeId, v));
    patchSnapshot({ octaveRange: [v, resolved?.octaveRange[1] ?? v] });
  }, [localeId, patchSnapshot]);

  const handleOctaveMaxChange = useCallback((v: number) => {
    const { members, resolved } = latest.current;
    members.forEach((m) => applyOctaveMax(m, localeId, v));
    patchSnapshot({ octaveRange: [resolved?.octaveRange[0] ?? v, v] });
  }, [localeId, patchSnapshot]);

  const handleNoteVarianceChange = useCallback((v: number) => {
    // Same plain-number pattern as handleMotifLengthChange above.
    latest.current.members.forEach((m) => applyNoteVariance(m, localeId, v));
    patchSnapshot({ noteVariance: { active: v > 0, value: v } });
  }, [localeId, patchSnapshot]);

  const handlePitchRepeatChange = useCallback((v: number) => {
    latest.current.members.forEach((m) => applyPitchRepeat(m, localeId, v));
    patchSnapshot({ pitchRepeat: v });
  }, [localeId, patchSnapshot]);

  const handleClickTrackActiveChange = useCallback((clickTrackActive: boolean) => {
    latest.current.members.forEach((m) => applyClickTrackActive(m, localeId, clickTrackActive));
    patchSnapshot({ clickTrackActive });
  }, [localeId, patchSnapshot]);

  const handleAdsrChange = useCallback((adsr: ADSREnvelope) => {
    const { members, resolved } = latest.current;
    const patch = resolved ? diffCompoundField(resolved.adsr, adsr) : adsr;
    members.forEach((m) => {
      const memberOwn = resolveCompanyOptions(undefined, m).adsr;
      applyAdsr(m, localeId, { ...memberOwn, ...patch });
    });
    patchSnapshot({ adsr });
  }, [localeId, patchSnapshot]);

  const handleLayersContinuousChange = useCallback((layers: OscillatorLayer[]) => {
    const { members, resolved } = latest.current;
    const diff = resolved ? diffLayerField(resolved.layers, layers) : null;
    members.forEach((m) => {
      const memberOwn = resolveCompanyOptions(undefined, m).layers;
      const memberLayers = diff
        ? memberOwn.map((l, i) => (i === diff.idx ? { ...l, ...diff.patch } : l))
        : layers;
      applyLayersContinuous(m, localeId, memberLayers);
    });
    patchSnapshot({ layers });
  }, [localeId, patchSnapshot]);

  const handleLayersStructuralChange = useCallback((layers: OscillatorLayer[]) => {
    const { members, resolved } = latest.current;
    const diff = resolved ? diffLayerField(resolved.layers, layers) : null;
    members.forEach((m) => {
      const memberOwn = resolveCompanyOptions(undefined, m).layers;
      const memberLayers = diff
        ? memberOwn.map((l, i) => (i === diff.idx ? { ...l, ...diff.patch } : l))
        : layers;
      applyLayersStructural(m, localeId, memberLayers);
    });
    patchSnapshot({ layers });
  }, [localeId, patchSnapshot]);

  const handleLayerLfoChange = useCallback((target: RobotLfoTargetId, value: LfoValue) => {
    const { members, resolved } = latest.current;
    const oldValue = resolved?.lfoSettings?.[target] ?? { ...DEFAULT_LFO_SETTINGS[target] };
    const patch = diffCompoundField(oldValue, value);
    members.forEach((m) => {
      const memberOwn = m.lfoSettings?.[target] ?? { ...DEFAULT_LFO_SETTINGS[target] };
      applyLayerLfo(m, localeId, target, { ...memberOwn, ...patch });
    });
    patchSnapshot({ lfoSettings: { ...resolved?.lfoSettings, [target]: value } });
  }, [localeId, patchSnapshot]);

  const audioSetting = (
    <AudioSettingSection
      value={audioSettingValue}
      disabled={!active}
      style={active ? OUTPUT_ACTIVE_STYLE : OUTPUT_DISABLED_STYLE}
      onAudioModeChange={handleAudioModeChange}
      onVolumeChange={handleVolumeChange}
      onVolumeLfoChange={handleVolumeLfoChange}
    />
  );

  const pingControls = (
    <PingControlsDrawer
      value={pingControlsValue}
      disabled={!active}
      style={active ? COMPOSITION_ACTIVE_STYLE : COMPOSITION_DISABLED_STYLE}
      onDensityChange={handleDensityChange}
      onMotifLengthChange={handleMotifLengthChange}
      onOctaveMinChange={handleOctaveMinChange}
      onOctaveMaxChange={handleOctaveMaxChange}
      onNoteVarianceChange={handleNoteVarianceChange}
      onPitchRepeatChange={handlePitchRepeatChange}
      onClickTrackActiveChange={handleClickTrackActiveChange}
      // No onResetMelody — omitted entirely in company mode, it has no company-scoped meaning.
    />
  );

  const pingContour = (
    <PingContourDrawer
      value={adsrValue}
      disabled={!active}
      style={active ? TIME_SPACE_ACTIVE_STYLE : TIME_SPACE_DISABLED_STYLE}
      onChange={handleAdsrChange}
    />
  );

  const signatureArray = (
    <SignatureArrayDrawer
      value={signatureArrayValue}
      disabled={!active}
      style={active ? SPECTRAL_ACTIVE_STYLE : SPECTRAL_DISABLED_STYLE}
      onContinuousChange={handleLayersContinuousChange}
      onStructuralChange={handleLayersStructuralChange}
      onLfoChange={handleLayerLfoChange}
    />
  );

  let content;
  switch (section) {
    case 'volume':
      content = audioSetting;
      break;
    case 'melody':
      content = pingControls;
      break;
    case 'envelope':
      content = pingContour;
      break;
    case 'source':
      content = signatureArray;
      break;
    default:
      content = (
        <>
          {audioSetting}
          {pingControls}
          {pingContour}
          {signatureArray}
        </>
      );
  }

  return <div className="company-options-section">{content}</div>;
});

export default CompanyOptionsSection;
