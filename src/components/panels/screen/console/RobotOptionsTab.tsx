import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { RobotDisplaySection } from '@/components/robot/RobotDisplaySection';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsDrawer, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayDrawer, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { useUIStore, type RobotSection } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { regenerateMelody } from '@/engine/regenerateMelody';
import { DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE } from '@/engine/melodyGenerator';
import { DEFAULT_LFO_SETTINGS } from '@/data/lfoConfig';
import { VOLUME_LFO_TARGET } from '@/data/robotOptionsConfig';
import {
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyLayersContinuous, applyLayersStructural, applyLayerLfo, applyClickTrackActive,
  applyAudioMode, applyVolume, applyVolumeLfo,
} from '@/systems/robotOptionsActions';
import type { LfoValue } from '@/types/controls';
import { ROBOT_LFO_TARGET_IDS } from '@/types/lfo';
import type { Robot, ADSREnvelope } from '@/types/Robot';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';

import './RobotOptionsTab.css';

// Module-level (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6) — 'output'/'composition'/
// 'timeSpace'/'spectral' are literal constants, not derived from any prop/state, so these never
// need to be recomputed per-render or per-instance.
const OUTPUT_STYLE = getTraitColorStyle('output');
const COMPOSITION_STYLE = getTraitColorStyle('composition');
const TIME_SPACE_STYLE = getTraitColorStyle('timeSpace');
const SPECTRAL_STYLE = getTraitColorStyle('spectral');

/**
 * Robot Options screen (Roadmap Phase 9) — reached by selecting a robot from the Robot Selection
 * hub tile (Phase 8), scoped entirely to that robot. Replaces the old Tabs.Root shell
 * (RobotMetaTab/RobotAudioTab/RobotOscillatorsTab, all removed) with RobotDisplaySection followed
 * by AudioSettingSection and the 3 schema-driven drawers, stacked. Renamed from
 * RobotEditorTab.tsx — it stopped being a tabbed "editor" and became the Robot Options screen
 * (confirmed via /interview-me).
 *
 * This is the "robot mode" call site for AudioSettingSection/PingControlsDrawer/
 * PingContourDrawer/SignatureArrayDrawer (Roadmap Phase 10, Task 17) — each component's `value`
 * is derived directly from `robot`, and each callback is wired to the matching
 * robotOptionsActions function. The company-broadcast call site, CompanyOptionsSection, wires the
 * same components to a company's resolved snapshot instead.
 *
 * AudioSettingSection was previously rendered inside RobotDisplaySection (mixed into its avatar/
 * meta-data card); docs/tasks/DIRECTIONAL_PANEL_WIRING.md Task 5 extracted it out to render here
 * as its own top-level Output panel, directly after RobotDisplaySection and before Melody
 * (PingControlsDrawer) — same derived value/handlers as before, just rendered one level up.
 */
export function RobotOptionsTab() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectedSection = useUIStore((s) => s.selectedSection);

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

  return <RobotOptionsPanel robot={robot} localeId={localeId} section={selectedSection} />;
}

interface RobotOptionsPanelProps {
  robot: Robot;
  localeId: string;
  /** Which of the robot's 4 leaf sections to show — null shows RobotDisplaySection alone (the
   *  bare "Probe N" tree node). Added Task 19 (docs/tasks/NAV_LAYOUT_REWRITE.md), spec §2's
   *  Node → Content Mapping table: exactly one of the 5 sections renders at a time now, not all
   *  5 stacked. */
  section: RobotSection | null;
}

/**
 * Split out from RobotOptionsTab (docs/tasks/ROBOT_OPTIONS_TAB_MEMOIZATION.md Task 6) so every
 * useMemo/useCallback below can be called unconditionally against a guaranteed-defined `robot` —
 * RobotOptionsTab's own early returns (no robot selected / not found) happen before this ever
 * mounts, so there's no `robot`-possibly-undefined case to guard against here. Re-renders on
 * every robot field edit just like RobotOptionsTab itself did (its own `robot` prop is, by
 * construction, always a new reference whenever anything about the robot changes) — the point of
 * the memoization below isn't to stop THIS component's own body from re-executing, but to keep
 * the 3 derived value objects and every onChange handed to the 4 accordion-wrapped sections
 * referentially stable across an edit to an *unrelated* field, so those already-`React.memo`'d
 * sections (AudioSettingSection/PingControlsDrawer/PingContourDrawer/SignatureArrayDrawer) can
 * actually bail.
 *
 * Every `applyXxx(robot, localeId, ...)` handler needs the CURRENT robot at call time, but can't
 * simply close over `robot` directly and depend on it in `useCallback` — `robot` is a new
 * reference on every edit, including edits to fields a given handler has nothing to do with, so
 * `useCallback([robot, localeId])` would make literally every handler unstable on every edit,
 * defeating every section's own memo regardless of which field actually changed (found live
 * while writing this task's own cascade test — AudioSettingSection kept re-rendering on a
 * Density-only edit for exactly this reason). Fixed the same way `Lfo.tsx` stabilizes its own
 * per-field handlers (item 26 round 1): a ref holds the latest `robot`, updated in an effect (not
 * mutated during render — react-hooks/refs), and every handler reads `latestRobot.current`
 * instead of closing over `robot`, keyed only on `[robot.id, localeId]` — stable for the life of
 * this component instance.
 */
function RobotOptionsPanel({ robot, localeId, section }: RobotOptionsPanelProps) {
  const latestRobot = useRef(robot);
  useEffect(() => {
    latestRobot.current = robot;
  });

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

  const handleLayersContinuousChange = useCallback((layers: SignatureArrayValue['layers']) => applyLayersContinuous(latestRobot.current, localeId, layers), [localeId]);
  const handleLayersStructuralChange = useCallback((layers: SignatureArrayValue['layers']) => applyLayersStructural(latestRobot.current, localeId, layers), [localeId]);
  const handleLayerLfoChange = useCallback((target: Parameters<typeof applyLayerLfo>[2], value: LfoValue) => applyLayerLfo(latestRobot.current, localeId, target, value), [localeId]);

  let content;
  switch (section) {
    case 'volume':
      content = (
        <AudioSettingSection
          value={audioSettingValue}
          onAudioModeChange={handleAudioModeChange}
          onVolumeChange={handleVolumeChange}
          onVolumeLfoChange={handleVolumeLfoChange}
          volumeLfoHeldOff={volumeLfoHeldOff}
          style={OUTPUT_STYLE}
        />
      );
      break;
    case 'melody':
      content = (
        <PingControlsDrawer
          value={pingControlsValue}
          onDensityChange={handleDensityChange}
          onMotifLengthChange={handleMotifLengthChange}
          onPitchRepeatChange={handlePitchRepeatChange}
          onOctaveMinChange={handleOctaveMinChange}
          onOctaveMaxChange={handleOctaveMaxChange}
          onNoteVarianceChange={handleNoteVarianceChange}
          onResetMelody={handleResetMelody}
          onClickTrackActiveChange={handleClickTrackActiveChange}
          style={COMPOSITION_STYLE}
        />
      );
      break;
    case 'envelope':
      content = (
        <PingContourDrawer
          value={robot.audioAttributes.adsr}
          onChange={handleAdsrChange}
          style={TIME_SPACE_STYLE}
        />
      );
      break;
    case 'source':
      content = (
        <SignatureArrayDrawer
          value={signatureArrayValue}
          onContinuousChange={handleLayersContinuousChange}
          onStructuralChange={handleLayersStructuralChange}
          onLfoChange={handleLayerLfoChange}
          heldOffTargets={heldOffTargets}
          style={SPECTRAL_STYLE}
        />
      );
      break;
    default:
      content = <RobotDisplaySection robot={robot} />;
  }

  return (
    <div className="robot-options" style={robotColorStyle}>
      {content}
    </div>
  );
}

export default RobotOptionsTab;
