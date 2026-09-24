import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSectionObserver } from '../nav/useSectionObserver';
import { useAccordionOpenState } from '../nav/useAccordionOpenState';
import { RobotDisplaySection } from '@/components/robot/RobotDisplaySection';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsRhythmSection, PingControlsFrequencySection, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayLayer, RobotDriftPanel, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { setSectionRef, clearSectionRef } from '@/utils/sectionRefs';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { useUIStore, type RobotSection, type RobotSubsection } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { regenerateMelody } from '@/engine/regenerateMelody';
import { DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE } from '@/engine/melodyGenerator';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { VOLUME_LFO_TARGET, SIGNATURE_ARRAY_CONFIG, type SignatureArrayParamSchema } from '@/data/robotOptionsConfig';
import { SOURCE_OSCILLATOR_SUBSECTIONS, OSCILLATOR_LABELS } from '@/data/robotSubsectionConfig';
import {
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo, applyClickTrackActive,
  applyAudioMode, applyVolume, applyVolumeLfo,
} from '@/systems/robotOptionsActions';
import type { LfoValue, AccordionSchema } from '@/types/controls';
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
 * all 4 sections' worth of subsections stacked, each wrapped in an accordion. Each accordion's
 * open/closed state is manual and independent (`useAccordionOpenState`) — a nav click only
 * scrolls to a section, and scrollspy only updates `selectedSection`/`selectedSubsection` for tree
 * highlighting; neither opens or closes an accordion (Crawford's own follow-up call, 2026-09-24,
 * reversing this pass's original derived-single-open-accordion design). Output's Audio Settings
 * opens by default on mount, and again whenever `robot.id` changes — switching to a different
 * robot doesn't carry over which accordions were left open on the last one. Each subsection's real
 * content only mounts once its own anchor has been scrolled near (useSectionObserver's lazy-mount
 * gate) — unaffected by any of the above.
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
  const handleResetMelody = useCallback(() => regenerateMelody(latestRobot.current, localeId), [localeId]);
  const handleClickTrackActiveChange = useCallback((v: boolean) => applyClickTrackActive(latestRobot.current, localeId, v), [localeId]);

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
    const segments = id.split('.'); // ['probes', robotId, section, subsection]
    const sec = segments[2] as RobotSection;
    const sub = segments[3] as RobotSubsection;
    setSelectedSection(sec);
    setSelectedSubsection(sub);
  });

  const { isOpen, setOpen } = useAccordionOpenState(`${prefix}.volume.audioSettings`, robot.id);

  return (
    <div className="robot-options" style={robotColorStyle} ref={sectionAnchorRef(prefix)}>
      <RobotDisplaySection robot={robot} />

      <div ref={sectionAnchorRef(`${prefix}.volume`)}>
        <div ref={sectionAnchorRef(`${prefix}.volume.audioSettings`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.volume.audioSettings`, type: 'accordion', humanLabel: 'Audio Settings' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.volume.audioSettings`)}
            onOpenChange={(open) => setOpen(`${prefix}.volume.audioSettings`, open)}
            style={OUTPUT_STYLE}
          >
            {hasApproached(`${prefix}.volume.audioSettings`) ? (
              <AudioSettingSection
                value={audioSettingValue}
                onAudioModeChange={handleAudioModeChange}
                onVolumeChange={handleVolumeChange}
                onVolumeLfoChange={handleVolumeLfoChange}
                volumeLfoHeldOff={volumeLfoHeldOff}
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
            style={COMPOSITION_STYLE}
          >
            {hasApproached(`${prefix}.melody.rhythm`) ? (
              <PingControlsRhythmSection
                value={pingControlsValue}
                onDensityChange={handleDensityChange}
                onMotifLengthChange={handleMotifLengthChange}
                onPitchRepeatChange={handlePitchRepeatChange}
                onClickTrackActiveChange={handleClickTrackActiveChange}
                onResetMelody={handleResetMelody}
              />
            ) : null}
          </AccordionContainer>
        </div>
        <div ref={sectionAnchorRef(`${prefix}.melody.frequency`)}>
          <AccordionContainer
            schema={{ id: `${prefix}.melody.frequency`, type: 'accordion', humanLabel: 'Frequency' } satisfies AccordionSchema}
            open={isOpen(`${prefix}.melody.frequency`)}
            onOpenChange={(open) => setOpen(`${prefix}.melody.frequency`, open)}
            style={COMPOSITION_STYLE}
          >
            {hasApproached(`${prefix}.melody.frequency`) ? (
              <PingControlsFrequencySection
                value={pingControlsValue}
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
            style={TIME_SPACE_STYLE}
          >
            {hasApproached(`${prefix}.envelope.pingContour`) ? (
              <PingContourDrawer value={robot.audioAttributes.adsr} onChange={handleAdsrChange} />
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
                style={SPECTRAL_STYLE}
              >
                {hasApproached(id) && layer ? (
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
            style={SPECTRAL_STYLE}
          >
            {hasApproached(`${prefix}.source.probeDrift`) ? <RobotDriftPanel /> : null}
          </AccordionContainer>
        </div>
      </div>
    </div>
  );
}

export default RobotOptionsTab;
