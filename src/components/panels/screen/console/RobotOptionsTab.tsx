import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSectionObserver } from '../nav/useSectionObserver';
import { useAccordionOpenState } from '../nav/useAccordionOpenState';
import { RobotSectionAccordionStack } from '../nav/RobotSectionAccordionStack';
import { RobotDisplaySection } from '@/components/robot/RobotDisplaySection';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsCompositionSection, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayLayer, RobotDriftPanel, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { hasPendingNavTargetFor } from '@/utils/accordionSync';
import { setViewFadeRoot } from '@/utils/viewFade';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { useUIStore, type RobotSection, type RobotSubsection } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE } from '@/engine/melodyGenerator';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { VOLUME_LFO_TARGET, SIGNATURE_ARRAY_CONFIG, type SignatureArrayParamSchema } from '@/data/robotOptionsConfig';
import {
  SOURCE_OSCILLATOR_SUBSECTIONS, subsectionIds as computeSubsectionIds, accordionIds as computeAccordionIds,
  type RobotOptionsTrait,
} from '@/data/robotSubsectionConfig';
import {
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo,
  applyAudioMode, applyVolume, applyVolumeLfo,
} from '@/systems/robotOptionsActions';
import type { LfoValue } from '@/types/controls';
import { ROBOT_LFO_TARGET_IDS, type RobotLfoTargetId } from '@/types/lfo';
import type { Robot, ADSREnvelope, WaveformType } from '@/types/Robot';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';

import './RobotOptionsTab.css';

// Module-level (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6) — 'output'/'composition'/
// 'timeSpace'/'spectral' are literal constants, not derived from any prop/state, so these never
// need to be recomputed per-render or per-instance.
const OUTPUT_STYLE = getTraitColorStyle('output');
const COMPOSITION_STYLE = getTraitColorStyle('composition');
const TIME_SPACE_STYLE = getTraitColorStyle('timeSpace');
const SPECTRAL_STYLE = getTraitColorStyle('spectral');

// Record<RobotOptionsTrait, ...>, not a switch with a default — RobotOptionsTrait is exactly the
// 4 values ROBOT_SECTIONS_CONFIG can produce, so this object literal is compiler-checked exhaustive:
// a future section added there with a trait missing here fails npm run build:types, rather than
// silently rendering an unstyled accordion at runtime (found in code review, 2026-09-27).
const TRAIT_STYLES: Record<RobotOptionsTrait, CSSProperties> = {
  output: OUTPUT_STYLE,
  composition: COMPOSITION_STYLE,
  timeSpace: TIME_SPACE_STYLE,
  spectral: SPECTRAL_STYLE,
};
function resolveRobotOptionsStyle(trait: RobotOptionsTrait): CSSProperties {
  return TRAIT_STYLES[trait];
}

function sectionAnchorRef(id: string) {
  return (el: HTMLDivElement | null) => {
    if (el) setSectionRef(id, el);
    else clearSectionRef(id);
  };
}

/**
 * Robot Options screen (Roadmap Phase 9) — reached by selecting a robot from the Robot Selection
 * hub tile (Phase 8), scoped entirely to that robot.
 *
 * This is the "robot mode" call site for AudioSettingSection/PingControlsRhythmSection/
 * PingControlsFrequencySection/PingContourDrawer/SignatureArrayLayer/RobotDriftPanel (Roadmap
 * Phase 10; docs/tasks/NAV_PANEL_VIEWS_AND_CONTENT.md Task 11) — each component's `value` is
 * derived directly from `robot`, and each callback is wired to the matching robotOptionsActions
 * function. The company-broadcast call site, CompanyOptionsSection, wires the same components to a
 * company's resolved snapshot instead.
 */
export function RobotOptionsTab() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);

  // Localize the active locale id and look up the selected robot safely.
  // Call hooks unconditionally to satisfy the rules-of-hooks linter.
  const localeId = getActiveLocaleId();
  const robot = useLocaleStore((s) => {
    if (!localeId || !selectedRobotId) return undefined;
    return s.locales[localeId]?.robots?.find((r) => r.id === selectedRobotId);
  });

  // ConsolePanel only mounts this component once a robot is selected; this
  // stays as a defensive fallback, not the primary guard.
  if (!selectedRobotId) {
    return (
      <div className="robot-options-empty">
        Select a robot from the list, or use Robots to spawn one.
      </div>
    );
  }

  if (!robot) {
    return <div className="robot-options-empty">Robot not found</div>;
  }

  return <RobotOptionsPanel robot={robot} localeId={localeId} />;
}

interface RobotOptionsPanelProps {
  robot: Robot;
  localeId: string;
}

/**
 * Split out from RobotOptionsTab (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6) so every
 * useMemo/useCallback below can be called unconditionally against a guaranteed-defined `robot`.
 *
 * Stacked view (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1/§2, Task 11) — replaces the old
 * `switch (section)` (one leaf rendered) with RobotDisplaySection at top (unwrapped), followed by
 * all 4 sections' worth of subsections stacked, each wrapped in an accordion, via
 * RobotSectionAccordionStack (docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md) — this component
 * owns only value derivation, action wiring, and dispatching each subsection id to its own content
 * component (renderSubsection below); the accordion/anchor/nesting shell itself lives in that
 * shared component, alongside CompanyOptionsSection's own "company mode" call site. Each
 * accordion's open/closed state is manual and independent (`useAccordionOpenState`) — a nav click
 * only scrolls to a section, and scrollspy only updates `selectedSection`/`selectedSubsection` for
 * tree highlighting; neither opens or closes an accordion (Crawford's own follow-up call,
 * 2026-09-24, reversing this pass's original derived-single-open-accordion design). Output's Audio
 * Settings opens by default on mount, and again whenever `robot.id` changes — switching to a
 * different robot doesn't carry over which accordions were left open on the last one. Each
 * subsection's real content only mounts once its own anchor has been scrolled near
 * (useSectionObserver's lazy-mount gate) — unaffected by any of the above.
 */
function RobotOptionsPanel({ robot, localeId }: RobotOptionsPanelProps) {
  const latestRobot = useRef(robot);
  useEffect(() => {
    latestRobot.current = robot;
  });

  const setSelectedSection = useUIStore((s) => s.setSelectedSection);
  const setSelectedSubsection = useUIStore((s) => s.setSelectedSubsection);

  const robotColorStyle = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);

  // Audio Load Budget: which of THIS robot's LFOs the dial is holding off, as plain props for the store-free sections. Selected as
  // booleans (a shallow-compared record of this robot's own 13 targets), never the whole list, so another robot's LFO entering or
  // leaving it re-renders nothing here; the record keeps its reference until one of THESE flags flips.
  const volumeLfoHeldOff = useAudioStore((s) => s.heldOffLfoKeys.includes(`${robot.id}:${VOLUME_LFO_TARGET}`));
  const heldOffTargets = useAudioStore(
    useShallow((s) => Object.fromEntries(ROBOT_LFO_TARGET_IDS.map((target) => [target, s.heldOffLfoKeys.includes(`${robot.id}:${target}`)]))),
  );

  const audioSettingValue: AudioSettingValue = useMemo(() => ({
    audioMode: robot.audioMode ?? 'none',
    masterVolume: robot.masterVolume,
    volumeLfo: robot.lfoSettings?.[VOLUME_LFO_TARGET] as LfoValue
      ?? { ...DEFAULT_LFO_SETTINGS[VOLUME_LFO_TARGET] },
  }), [robot.audioMode, robot.masterVolume, robot.lfoSettings]);

  const pingControlsValue: PingControlsValue = useMemo(() => ({
    rhythmicDensity: robot.rhythmicDensity ?? 50,
    rhythmicMotifLength: robot.rhythmicMotifLength?.value ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH.value,
    noteVariance: robot.noteVariance?.value ?? DEFAULT_NOTE_VARIANCE.value,
    pitchRepeat: robot.pitchRepeat ?? 0,
    octaveRange: robot.octaveRange,
    clickTrackActive: robot.clickTrackActive ?? false,
  }), [
    robot.rhythmicDensity, robot.rhythmicMotifLength, robot.noteVariance, robot.pitchRepeat,
    robot.octaveRange, robot.clickTrackActive,
  ]);

  const signatureArrayValue: SignatureArrayValue = useMemo(() => ({
    layers: robot.audioAttributes.layers ?? [],
    lfoSettings: robot.lfoSettings,
  }), [robot.audioAttributes.layers, robot.lfoSettings]);

  const handleAudioModeChange = useCallback((mode: Robot['audioMode']) => applyAudioMode(latestRobot.current, localeId, mode), [localeId]);
  const handleVolumeChange = useCallback((pct: number) => applyVolume(latestRobot.current, localeId, pct), [localeId]);
  const handleVolumeLfoChange = useCallback((value: LfoValue) => applyVolumeLfo(latestRobot.current, localeId, value), [localeId]);

  const handleDensityChange = useCallback((v: number) => applyDensity(latestRobot.current, localeId, v), [localeId]);
  const handleMotifLengthChange = useCallback((v: number) => applyMotifLength(latestRobot.current, localeId, v), [localeId]);
  const handlePitchRepeatChange = useCallback((v: number) => applyPitchRepeat(latestRobot.current, localeId, v), [localeId]);
  const handleOctaveMinChange = useCallback((v: number) => applyOctaveMin(latestRobot.current, localeId, v), [localeId]);
  const handleOctaveMaxChange = useCallback((v: number) => applyOctaveMax(latestRobot.current, localeId, v), [localeId]);
  const handleNoteVarianceChange = useCallback((v: number) => applyNoteVariance(latestRobot.current, localeId, v), [localeId]);

  const handleAdsrChange = useCallback((adsr: ADSREnvelope) => applyAdsr(latestRobot.current, localeId, adsr), [localeId]);

  const handleLayerTypeChange = useCallback((idx: number, type: WaveformType) => {
    const layers = latestRobot.current.audioAttributes.layers ?? [];
    applyLayersStructural(latestRobot.current, localeId, layers.map((l, i) => (i === idx ? { ...l, type } : l)));
  }, [localeId]);
  const handleLayerParamChange = useCallback((idx: number, field: SignatureArrayParamSchema['field'], v: number) => {
    const layers = latestRobot.current.audioAttributes.layers ?? [];
    applyLayersContinuous(latestRobot.current, localeId, layers.map((l, i) => (i === idx ? { ...l, [field]: v } : l)));
  }, [localeId]);
  const handleLayerLfoFieldChange = useCallback(
    (_idx: number, target: RobotLfoTargetId, value: LfoValue) => applyLayerLfo(latestRobot.current, localeId, target, value),
    [localeId],
  );

  const prefix = `probes.${robot.id}`;
  const subsectionIdList = useMemo(() => computeSubsectionIds(prefix), [prefix]);

  const { hasApproached } = useSectionObserver(subsectionIdList, (id) => {
    const segments = id.split('.'); // ['probes', robotId, section, subsection]
    const sec = segments[2] as RobotSection;
    const sub = segments[3] as RobotSubsection;
    setSelectedSection(sec);
    setSelectedSubsection(sub);
  });

  const accordionIdList = useMemo(() => computeAccordionIds(prefix), [prefix]);
  const { isOpen, setOpen } = useAccordionOpenState(accordionIdList, `${prefix}.volume.audioSettings`, robot.id);

  // Starts hidden only when a nav click was already mid-flight targeting one of this view's own
  // accordions at the moment of this component's OWN first mount — i.e. arriving here from a
  // genuinely different view. Evaluated once (lazy useState initializer), never re-evaluated on
  // later re-renders, so switching robots (the same mounted instance, reset via resetKey above)
  // never re-hides an already-visible view. NavTreeNode's own onSettled callback (scroll, then
  // fadeInView) is what reveals it again once the target accordion(s) have actually finished
  // opening — see src/utils/viewFade.ts.
  const [startHidden] = useState(() => hasPendingNavTargetFor(accordionIdList));

  // useCallback, not an inline arrow function — an inline ref callback's identity changes every
  // render, which makes React re-invoke it (null, then the element again) on every single
  // re-render, not just mount/unmount. That would re-run the imperative `opacity = '0'` set below
  // on every re-render too, fighting GSAP's own inline-style tween once fadeInView() starts
  // animating opacity back up and making the fade look instant (found live). Keyed on `prefix` (it
  // changes when switching robots, the one case this ref genuinely needs to re-run for) — startHidden
  // never changes after mount, so it doesn't need to be a dependency.
  const rootRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      setSectionRef(prefix, el);
      if (startHidden) el.style.opacity = '0';
    } else {
      clearSectionRef(prefix);
    }
    setViewFadeRoot(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startHidden is intentionally excluded, see comment above
  }, [prefix]);

  // Dispatches each subsection id to its own content component, exactly as the pre-consolidation
  // JSX did per accordion — RobotSectionAccordionStack calls this only once a subsection's own id
  // hasApproached (its lazy-mount gate), so no hasApproached check is needed here.
  const renderSubsection = useCallback((subsectionId: RobotSubsection): ReactNode => {
    switch (subsectionId) {
      case 'audioSettings':
        return (
          <AudioSettingSection
            value={audioSettingValue}
            onAudioModeChange={handleAudioModeChange}
            onVolumeChange={handleVolumeChange}
            onVolumeLfoChange={handleVolumeLfoChange}
            volumeLfoHeldOff={volumeLfoHeldOff}
          />
        );
      case 'rhythm':
        // Rhythm/Pitches merged into one "Composition" accordion, 3 two-field rows
        // (docs/reference/layout-updates.md) — reuses the old '.rhythm' id (no new tree/scrollspy
        // id introduced); the nav tree's separate "Pitches" leaf has no accordion or top-level
        // anchor of its own anymore, but PingControlsCompositionSection registers a real anchor
        // around its own Note Variance slider under that id (`.melody.frequency`), so a nav click
        // on "Pitches" opens this Composition accordion (accordionSync's own sole-immediate-child/
        // sibling fallback) and scrolls to that slider specifically.
        return (
          <PingControlsCompositionSection
            value={pingControlsValue}
            onDensityChange={handleDensityChange}
            onMotifLengthChange={handleMotifLengthChange}
            onPitchRepeatChange={handlePitchRepeatChange}
            onOctaveMinChange={handleOctaveMinChange}
            onOctaveMaxChange={handleOctaveMaxChange}
            onNoteVarianceChange={handleNoteVarianceChange}
            noteVarianceAnchorId={`${prefix}.melody.frequency`}
          />
        );
      case 'pingContour':
        return <PingContourDrawer value={robot.audioAttributes.adsr} onChange={handleAdsrChange} />;
      case 'baselineOscillator':
      case 'coaxialOscillator':
      case 'harmonicOscillator': {
        const idx = SOURCE_OSCILLATOR_SUBSECTIONS.indexOf(subsectionId);
        const layer = signatureArrayValue.layers[idx];
        return layer ? (
          <SignatureArrayLayer
            block={SIGNATURE_ARRAY_CONFIG[idx]}
            idx={idx}
            layer={layer}
            lfoSettings={signatureArrayValue.lfoSettings}
            heldOffTargets={heldOffTargets}
            onTypeChange={handleLayerTypeChange}
            onParamChange={handleLayerParamChange}
            onLfoFieldChange={handleLayerLfoFieldChange}
          />
        ) : null;
      }
      case 'probeDrift':
        return <RobotDriftPanel />;
      default:
        return null;
    }
  }, [
    audioSettingValue, handleAudioModeChange, handleVolumeChange, handleVolumeLfoChange, volumeLfoHeldOff,
    pingControlsValue, handleDensityChange, handleMotifLengthChange, handlePitchRepeatChange,
    handleOctaveMinChange, handleOctaveMaxChange, handleNoteVarianceChange, prefix,
    robot.audioAttributes.adsr, handleAdsrChange,
    signatureArrayValue, heldOffTargets, handleLayerTypeChange, handleLayerParamChange, handleLayerLfoFieldChange,
  ]);

  return (
    <div className="robot-options" style={robotColorStyle} ref={rootRef}>
      <RobotDisplaySection robot={robot} />
      <RobotSectionAccordionStack
        prefix={prefix}
        isOpen={isOpen}
        setOpen={setOpen}
        hasApproached={hasApproached}
        sectionAnchorRef={sectionAnchorRef}
        resolveStyle={resolveRobotOptionsStyle}
        renderSubsection={renderSubsection}
      />
    </div>
  );
}

export default RobotOptionsTab;
