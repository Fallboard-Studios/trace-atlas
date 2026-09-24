import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsRhythmSection, PingControlsFrequencySection, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayLayer, RobotDriftPanel, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { useSectionObserver } from '@/components/panels/screen/nav/useSectionObserver';
import { useAccordionOpenState } from '@/components/panels/screen/nav/useAccordionOpenState';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore, type RobotSection, type RobotSubsection } from '@/stores/uiStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { resolveCompanyOptions, diffCompoundField } from '@/systems/companyOptions';
import {
  applyAudioMode, applyVolume, applyVolumeLfo,
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo, applyClickTrackActive,
} from '@/systems/robotOptionsActions';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { VOLUME_LFO_TARGET, SIGNATURE_ARRAY_CONFIG, type SignatureArrayParamSchema } from '@/data/robotOptionsConfig';
import { SOURCE_OSCILLATOR_SUBSECTIONS, OSCILLATOR_LABELS } from '@/data/robotSubsectionConfig';
import { LFO_RATE_MIN, LFO_DEPTH_MIN } from '@/types/lfo';
import { getTraitColorStyle, getDisabledTraitColorStyle } from '@/utils/traitColors';
import type { ADSREnvelope, Robot, WaveformType } from '@/types/Robot';
import type { CompanyOptionsSnapshot } from '@/types/Company';
import type { RobotLfoTargetId } from '@/types/lfo';
import type { LfoValue, AccordionSchema } from '@/types/controls';

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

function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

/**
 * "Company mode" call site for AudioSettingSection/PingControlsRhythmSection/
 * PingControlsFrequencySection/PingContourDrawer/SignatureArrayLayer/RobotDriftPanel (Roadmap
 * Phase 10) — the counterpart to RobotOptionsTab's "robot mode." Stacked view (docs/specs/
 * NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 13) mirrors RobotOptionsTab's own Task 11 pattern
 * directly: all 4 sections' worth of subsections stacked, each in its own accordion with manual,
 * independent open/closed state (`useAccordionOpenState`) — a nav click only scrolls to a section,
 * and scrollspy only updates `selectedSection`/`selectedSubsection` for tree highlighting; neither
 * opens or closes an accordion (Crawford's own follow-up call, 2026-09-24, reversing this pass's
 * original derived-single-open-accordion design). Audio Settings opens by default on mount, and
 * again whenever `prefix` changes (switching between All Probes/a different company). No top
 * metadata block here (unlike RobotDisplaySection) — CompanyRenameDeleteForm plays that role,
 * rendered by CompaniesContent.tsx above this component, not inside it; the bare "All Probes" call
 * site (ProbesContent.tsx) has no equivalent at all.
 *
 * Reads `allRobotsSelected`/`selectedCompanyId` directly from uiStore (no more `section` prop —
 * both real call sites, ProbesContent and CompaniesContent, now render this prop-less and let it
 * derive its own node-id prefix: `probes.all.*` under All Probes, `companies.<id>.*` under a
 * selected company) — CompanyButtonRow's "All" option is a third mode, mutually exclusive with
 * selectedCompanyId: `members` becomes every robot in the locale regardless of company (Freelance
 * included), fed `locale.allRobotsLastEditedOptions` instead of a Company's own snapshot.
 *
 * With no company selected, or a selected company with zero members (nothing to derive a baseline
 * from, nothing to broadcast to), every section renders disabled with a placeholder value — and its
 * own accordion gets getDisabledTraitColorStyle (the trait's own 2 tones, desaturated rather than
 * replaced) instead of the full-saturation style. With a non-empty company selected, each section's
 * value comes from resolveCompanyOptions(company.lastEditedOptions, members[0]), and every edit
 * broadcasts through the exact same robotOptionsActions functions RobotOptionsTab uses — once per
 * member — then patches only the touched field into the company's own lastEditedOptions snapshot.
 * Since SignatureArrayLayer/PingControlsRhythmSection/FrequencySection (Tasks 9/10) already report
 * *which* field/layer-index changed directly, rather than a whole compound object, layer edits no
 * longer need companyOptions.ts's diffLayerField to reverse-engineer that from an old/new
 * comparison — only genuinely-compound single-control values (ADSR, an LfoValue) still go through
 * diffCompoundField, unchanged from before this split.
 */
export const CompanyOptionsSection = memo(function CompanyOptionsSection() {
  const localeId = getActiveLocaleId();
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const allRobotsSelected = useUIStore((s) => s.allRobotsSelected);
  const setSelectedSection = useUIStore((s) => s.setSelectedSection);
  const setSelectedSubsection = useUIStore((s) => s.setSelectedSubsection);
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

  // The tree-node-id prefix this instance's subsections live under — 'probes.all' broadcasting to
  // every robot, or 'companies.<id>' for a specific company. Never both at once (mutually
  // exclusive store fields, uiStore.ts's own selectCompany/selectAllRobots).
  const prefix = allRobotsSelected ? 'probes.all' : `companies.${selectedCompanyId ?? ''}`;

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
  // sections would make ANY field edit on members[0] invalidate all of them at once — the identical
  // whole-object cascade RobotOptionsTab's own fix already solved for `robot`. Each section instead
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
  const resolvedVolumeLfo = resolved?.volumeLfo;
  const audioSettingValue: AudioSettingValue = useMemo(() => (
    active
      ? { audioMode: resolvedAudioMode!, masterVolume: resolvedMasterVolume!, volumeLfo: resolvedVolumeLfo! }
      : DISABLED_AUDIO_SETTING
  ), [active, resolvedAudioMode, resolvedMasterVolume, resolvedVolumeLfo]);

  // PingControlsValue's rhythmicMotifLength/noteVariance are plain numbers (docs/specs/
  // STEPPER_TO_SLIDER.md §7.3) but resolved/CompanyOptionsSnapshot still carry the {active, value}
  // shape — flatten to .value here, the one place this section derives PingControls' value.
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
  // sections' own memoization regardless of which field the user actually touched.
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

  // Layer edits arrive already-narrowed to one idx/field (SignatureArrayLayer's own onParamChange/
  // onTypeChange, Task 10) — no more diffLayerField reverse-engineering which layer/field changed
  // from a whole-array comparison; each member's own OTHER layers/fields are preserved simply by
  // reading that member's own current layers before patching the one touched index.
  const handleLayerTypeChange = useCallback((idx: number, type: WaveformType) => {
    latest.current.members.forEach((m) => {
      const memberLayers = resolveCompanyOptions(undefined, m).layers;
      applyLayersStructural(m, localeId, memberLayers.map((l, i) => (i === idx ? { ...l, type } : l)));
    });
    const { resolved } = latest.current;
    const baseline = resolved?.layers ?? DISABLED_SIGNATURE_ARRAY.layers;
    patchSnapshot({ layers: baseline.map((l, i) => (i === idx ? { ...l, type } : l)) });
  }, [localeId, patchSnapshot]);

  const handleLayerParamChange = useCallback((idx: number, field: SignatureArrayParamSchema['field'], v: number) => {
    latest.current.members.forEach((m) => {
      const memberLayers = resolveCompanyOptions(undefined, m).layers;
      applyLayersContinuous(m, localeId, memberLayers.map((l, i) => (i === idx ? { ...l, [field]: v } : l)));
    });
    const { resolved } = latest.current;
    const baseline = resolved?.layers ?? DISABLED_SIGNATURE_ARRAY.layers;
    patchSnapshot({ layers: baseline.map((l, i) => (i === idx ? { ...l, [field]: v } : l)) });
  }, [localeId, patchSnapshot]);

  const handleLayerLfoFieldChange = useCallback((target: RobotLfoTargetId, value: LfoValue) => {
    const { members, resolved } = latest.current;
    const oldValue = resolved?.lfoSettings?.[target] ?? { ...DEFAULT_LFO_SETTINGS[target] };
    const patch = diffCompoundField(oldValue, value);
    members.forEach((m) => {
      const memberOwn = m.lfoSettings?.[target] ?? { ...DEFAULT_LFO_SETTINGS[target] };
      applyLayerLfo(m, localeId, target, { ...memberOwn, ...patch });
    });
    patchSnapshot({ lfoSettings: { ...resolved?.lfoSettings, [target]: value } });
  }, [localeId, patchSnapshot]);

  const subsectionIds = useMemo(() => [
    `${prefix}.volume.audioSettings`,
    `${prefix}.melody.rhythm`,
    `${prefix}.melody.frequency`,
    `${prefix}.envelope.pingContour`,
    `${prefix}.source.baselineOscillator`,
    `${prefix}.source.coaxialOscillator`,
    `${prefix}.source.harmonicOscillator`,
    `${prefix}.source.probeDrift`,
  ], [prefix]);

  const { hasApproached } = useSectionObserver(subsectionIds, (id) => {
    const segments = id.split('.'); // [branch, entityId, section, subsection]
    const sec = segments[2] as RobotSection;
    const sub = segments[3] as RobotSubsection;
    setSelectedSection(sec);
    setSelectedSubsection(sub);
  });

  const { isOpen, setOpen } = useAccordionOpenState(`${prefix}.volume.audioSettings`, prefix);

  return (
    <div className="company-options-section">
      <div ref={sectionAnchorRef(`${prefix}.volume`)}>
        <div ref={sectionAnchorRef(`${prefix}.volume.audioSettings`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.volume.audioSettings`, type: 'accordion', humanLabel: 'Audio Settings' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.volume.audioSettings`)}
            onOpenChange={(open) => setOpen(`${prefix}.volume.audioSettings`, open)}
            style={active ? OUTPUT_ACTIVE_STYLE : OUTPUT_DISABLED_STYLE}
          >
            {hasApproached(`${prefix}.volume.audioSettings`) ? (
              <AudioSettingSection
                value={audioSettingValue}
                disabled={!active}
                onAudioModeChange={handleAudioModeChange}
                onVolumeChange={handleVolumeChange}
                onVolumeLfoChange={handleVolumeLfoChange}
              />
            ) : null}
          </AccordionContainer>
        </div>
      </div>

      <div ref={sectionAnchorRef(`${prefix}.melody`)}>
        <div ref={sectionAnchorRef(`${prefix}.melody.rhythm`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.melody.rhythm`, type: 'accordion', humanLabel: 'Rhythm' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.melody.rhythm`)}
            onOpenChange={(open) => setOpen(`${prefix}.melody.rhythm`, open)}
            style={active ? COMPOSITION_ACTIVE_STYLE : COMPOSITION_DISABLED_STYLE}
          >
            {hasApproached(`${prefix}.melody.rhythm`) ? (
              <PingControlsRhythmSection
                value={pingControlsValue}
                disabled={!active}
                onDensityChange={handleDensityChange}
                onMotifLengthChange={handleMotifLengthChange}
                onPitchRepeatChange={handlePitchRepeatChange}
                onClickTrackActiveChange={handleClickTrackActiveChange}
                // No onResetMelody — omitted entirely in company mode, it has no company-scoped meaning.
              />
            ) : null}
          </AccordionContainer>
        </div>
        <div ref={sectionAnchorRef(`${prefix}.melody.frequency`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.melody.frequency`, type: 'accordion', humanLabel: 'Frequency' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.melody.frequency`)}
            onOpenChange={(open) => setOpen(`${prefix}.melody.frequency`, open)}
            style={active ? COMPOSITION_ACTIVE_STYLE : COMPOSITION_DISABLED_STYLE}
          >
            {hasApproached(`${prefix}.melody.frequency`) ? (
              <PingControlsFrequencySection
                value={pingControlsValue}
                disabled={!active}
                onOctaveMinChange={handleOctaveMinChange}
                onOctaveMaxChange={handleOctaveMaxChange}
                onNoteVarianceChange={handleNoteVarianceChange}
              />
            ) : null}
          </AccordionContainer>
        </div>
      </div>

      <div ref={sectionAnchorRef(`${prefix}.envelope`)}>
        <div ref={sectionAnchorRef(`${prefix}.envelope.pingContour`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.envelope.pingContour`, type: 'accordion', humanLabel: 'Ping Contour' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.envelope.pingContour`)}
            onOpenChange={(open) => setOpen(`${prefix}.envelope.pingContour`, open)}
            style={active ? TIME_SPACE_ACTIVE_STYLE : TIME_SPACE_DISABLED_STYLE}
          >
            {hasApproached(`${prefix}.envelope.pingContour`) ? (
              <PingContourDrawer value={adsrValue} disabled={!active} onChange={handleAdsrChange} />
            ) : null}
          </AccordionContainer>
        </div>
      </div>

      <div ref={sectionAnchorRef(`${prefix}.source`)}>
        {SOURCE_OSCILLATOR_SUBSECTIONS.map((sub, idx) => {
          const layer = signatureArrayValue.layers[idx];
          const id = `${prefix}.source.${sub}`;
          return (
            <div key={sub} ref={sectionAnchorRef(id)}>
              <AccordionContainer
                schema={{ id, type: 'accordion', humanLabel: OSCILLATOR_LABELS[sub] } satisfies AccordionSchema}
                open={isOpen(id)}
                onOpenChange={(open) => setOpen(id, open)}
                style={active ? SPECTRAL_ACTIVE_STYLE : SPECTRAL_DISABLED_STYLE}
              >
                {hasApproached(id) && layer ? (
                  <SignatureArrayLayer
                    block={SIGNATURE_ARRAY_CONFIG[idx]}
                    idx={idx}
                    layer={layer}
                    lfoSettings={signatureArrayValue.lfoSettings}
                    disabled={!active}
                    onTypeChange={handleLayerTypeChange}
                    onParamChange={handleLayerParamChange}
                    onLfoFieldChange={(_idx, target, value) => handleLayerLfoFieldChange(target, value)}
                  />
                ) : null}
              </AccordionContainer>
            </div>
          );
        })}
        <div ref={sectionAnchorRef(`${prefix}.source.probeDrift`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.source.probeDrift`, type: 'accordion', humanLabel: 'Probe Drift' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.source.probeDrift`)}
            onOpenChange={(open) => setOpen(`${prefix}.source.probeDrift`, open)}
            style={active ? SPECTRAL_ACTIVE_STYLE : SPECTRAL_DISABLED_STYLE}
          >
            {hasApproached(`${prefix}.source.probeDrift`) ? <RobotDriftPanel /> : null}
          </AccordionContainer>
        </div>
      </div>
    </div>
  );
});

export default CompanyOptionsSection;
