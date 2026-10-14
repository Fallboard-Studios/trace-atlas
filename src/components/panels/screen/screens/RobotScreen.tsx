import { memo, useCallback, useEffect, useMemo, useRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { useShell } from '../useShell';
import { useRobotMeta, type RobotMetaField } from './useRobotMeta';
import { RobotBody } from '@/components/robot/RobotBody';
import { getRobotGem } from '@/components/robot/gem/polygon';
import { gemMotionViewBox } from '@/components/robot/gem/orbiterMotion';
import { AudioSettingSection, type AudioSettingValue } from '@/components/robot/AudioSettingSection';
import { PingControlsCompositionSection, type PingControlsValue } from '@/components/robot/PingControlsDrawer';
import { PingContourDrawer } from '@/components/robot/PingContourDrawer';
import { SignatureArrayLayer, type SignatureArrayValue } from '@/components/robot/SignatureArrayDrawer';
import { BusFilterDrawer, type BusFilterPatch, type BusFilterValue } from '@/components/robot/BusFilterDrawer';
import { DualLabel } from '@/components/ui/controls/DualLabel';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { RadioButton } from '@/components/ui/controls/RadioButton';
import { SectionTabs, type SectionTabItem } from '@/components/ui/controls/SectionTabs';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { useUIStore, type RobotSection, type RobotSubsection } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { useRobotPanReadoutStore } from '@/stores/robotPanReadoutStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle, getTraitColorStyle } from '@/utils/traitColors';
import { DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE } from '@/engine/melodyGenerator';
import { SIGNATURE_ARRAY_CONFIG, BUS_FILTER_LFO_TARGET, type SignatureArrayParamSchema } from '@/data/robotOptionsConfig';
import { DEFAULT_LFO_LINK } from '@/data/lfoConfig';
import { resolveBusFilterCutoff, resolveBusFilterQ, resolveBusFilterType } from '@/engine/audioEngine/busFilter';
import {
  ROBOT_SECTIONS_CONFIG, SOURCE_OSCILLATOR_SUBSECTIONS,
  activeRobotSection, activeRobotSubsection, sectionSubTabs, sectionTabContent,
  type RobotOptionsTrait,
} from '@/data/robotSubsectionConfig';
import {
  ROBOT_SELECTION_ROW_SCHEMAS, BATTERY_READOUT_SCHEMA, BATTERY_READOUT_BOX_SIZE, BATTERY_READOUT_GAP_SIZE,
} from '@/data/robotSelectionConfig';
import { FREELANCE_VALUE, buildCompanyAssignmentSchema } from '@/data/companyConfig';
import {
  applyDensity, applyMotifLength, applyNoteVariance, applyPitchRepeat, applyOctaveMin, applyOctaveMax,
  applyAdsr, applyPortamento, applyBusFilter, applyLayersContinuous, applyLayersStructural, applyLayerLfoLink,
  applyAudioMode, applyVolume, applyPan, applyPanAuto, applyReverbSend, applyDelaySend,
} from '@/systems/robotOptionsActions';
import { cancelSwellForRobotAttribute, isRobotAttributeSwelling } from '@/systems/audioSwells';
import { useAdsrSwellingFlags, useLayerSwellingFlags } from '@/components/robot/useSwellingFlags';
import { CONTENT, fill, introProps, labels } from '@/content';
import type { DualLabelSchema, LfoLinkValue } from '@/types/controls';
import type { SwellRobotAttributeId } from '@/types/audioSwell';
import type { RobotLfoTargetId } from '@/types/lfo';
import type { Company } from '@/types/Company';
import type { Robot, ADSREnvelope, WaveformType } from '@/types/Robot';
import './RobotScreen.css';

// Record<RobotOptionsTrait, ...>, not a switch with a default: a new section in ROBOT_SECTIONS_CONFIG
// with a trait missing here fails build:types instead of rendering an unstyled panel.
const TRAIT_STYLES: Record<RobotOptionsTrait, CSSProperties> = {
  output: getTraitColorStyle('output'),
  composition: getTraitColorStyle('composition'),
  timeSpace: getTraitColorStyle('timeSpace'),
  spectral: getTraitColorStyle('spectral'),
};

const NO_COMPANIES: Company[] = [];
const NO_CHANGE = () => { };

// Module-level, so each is one stable function (SectionTabs is React.memo'd). A section pick clears the
// sub-tab, which belonged to the old section: Source / Accent → Envelope → Source opens Core again.
const setSection = (section: RobotSection) => {
  const s = useUIStore.getState();
  s.setSelectedSection(section);
  s.setSelectedSubsection(null);
};
const setSubsection = (sub: RobotSubsection) => useUIStore.getState().setSelectedSubsection(sub);

/**
 * The robot screen (docs/specs/LAYOUT_REWORK.md §1.4; docs/tasks/LAYOUT_REWORK.md Task 16), from
 * RobotOptionsTab and RobotDisplaySection: on the desk shell a fixed avatar column (the gem in the avatar
 * render context, the name, the read-only meta as wells in two columns, the battery and the company
 * radio) beside the controls; on the phone shell the column's small band, sticky above the controls.
 * The controls are SectionTabs over ROBOT_SECTIONS_CONFIG, Source with a sub-tab per oscillator; one
 * section and one panel are in the DOM at a time. The open tab is `selectedSection` /
 * `selectedSubsection`, resolved by robotSubsectionConfig's helpers (Source, Core Oscillator, when
 * none is stored), which the breadcrumb reads too.
 */
export function RobotScreen() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const localeId = getActiveLocaleId();
  // The robot's own object, so another robot's battery tick does not re-render this screen.
  const robot = useLocaleStore((s) => (selectedRobotId ? s.locales[localeId]?.robots?.find((r) => r.id === selectedRobotId) : undefined));

  // ProbesContent only routes here with a robot selected; this stays as a defensive fallback.
  if (!selectedRobotId) return <div className="robot-screen__empty">{CONTENT['probe.selectPrompt'].human}</div>;
  if (!robot) return <div className="robot-screen__empty">{CONTENT['probe.notFound'].human}</div>;
  return <RobotScreenPanel robot={robot} localeId={localeId} />;
}

interface RobotPanelProps {
  robot: Robot;
  localeId: string;
}

function RobotScreenPanel({ robot, localeId }: RobotPanelProps) {
  const shell = useShell();
  const robotColorStyle = useMemo(() => getRobotColorStyle(robot.identityColor), [robot.identityColor]);
  const renderSubsection = useRobotSubsectionRenderer(robot, localeId);
  return (
    <div className={`robot-screen robot-screen--${shell}`} style={robotColorStyle}>
      {shell === 'desk' ? <RobotAvatarColumn robot={robot} localeId={localeId} /> : <RobotAvatarBand robot={robot} localeId={localeId} />}
      <div className="robot-screen__controls">
        <RobotSectionTabs label={robot.name || robot.id} renderSubsection={renderSubsection} />
      </div>
    </div>
  );
}

// ========================================
// THE TABS
// ========================================

const fullTraitStyle = (trait: RobotOptionsTrait): CSSProperties => TRAIT_STYLES[trait];

interface RobotSectionTabsProps {
  /** The section row's accessible name: the robot's (the company's, on the company screen). */
  label: string;
  renderSubsection: (subsectionId: RobotSubsection) => ReactNode;
  /** A panel's trait colours. The robot screen's are the full-saturation pair; the company screen passes
   *  a function that mutes them while it has nothing to edit. Keep it stable (memoize), or the tabs rebuild. */
  traitStyle?: (trait: RobotOptionsTrait) => CSSProperties;
}

/** The section row, and Source's sub-tab row nested in its panel. Each section's panel sits in its trait,
 *  the colour its accordion gave it, and opens with the section's intro as an expander (Crawford,
 *  2026-10-10, spec §1.3) — above Source's sub-tabs, so it stays while the oscillator changes. Shared with
 *  the company screen, which hands its own accessible name, renderer and trait colours. */
export function RobotSectionTabs({ label, renderSubsection, traitStyle = fullTraitStyle }: RobotSectionTabsProps) {
  const storedSection = useUIStore((s) => s.selectedSection);
  const storedSubsection = useUIStore((s) => s.selectedSubsection);

  const items = useMemo<readonly SectionTabItem<RobotSection>[]>(() => ROBOT_SECTIONS_CONFIG.map((entry) => {
    const subTabs = sectionSubTabs(entry);
    const open = activeRobotSubsection(entry.id, storedSubsection);
    const subItems: readonly SectionTabItem<RobotSubsection>[] = subTabs.map((sub) => ({
      id: sub.id,
      content: sub.accordion ?? sub.content,
      trait: entry.trait,
      render: () => renderSubsection(sub.id),
    }));
    return {
      id: entry.id,
      content: sectionTabContent(entry),
      trait: entry.trait,
      render: () => (
        <div className="robot-screen__section" style={traitStyle(entry.trait)}>
          <IntroPanel
            {...introProps(sectionTabContent(entry))}
            name={labels(sectionTabContent(entry)).humanLabel}
            trait={entry.trait}
            collapsible
          />
          {subTabs.length > 0 ? (
            <SectionTabs
              variant="sub"
              label={labels(sectionTabContent(entry)).humanLabel}
              items={subItems}
              value={open}
              onValueChange={setSubsection}
            />
          ) : renderSubsection(open)}
        </div>
      ),
    };
  }), [renderSubsection, storedSubsection, traitStyle]);

  return <SectionTabs label={label} items={items} value={activeRobotSection(storedSection)} onValueChange={setSection} />;
}

/**
 * The Levels section with the Pan slider's live readout (docs/specs/ROBOT_PAN.md §1.4). The readout
 * subscription lives in this memoised child, not in useRobotSubsectionRenderer: that hook runs in
 * RobotScreenPanel, so subscribing there would re-render the whole screen (avatar column, tabs) on every
 * readout write. Here a write re-renders only this wrapper and, through it, the one section. The selector
 * returns undefined for a manual robot, so a manual robot's section never re-renders on anyone's tick.
 */
const RobotAudioSettingSection = memo(function RobotAudioSettingSection({
  robotId, ...props
}: ComponentProps<typeof AudioSettingSection> & { robotId: string }) {
  const livePan = useRobotPanReadoutStore((s) => (props.value.panAuto ? s.pan[robotId] : undefined));
  return <AudioSettingSection {...props} livePan={livePan} />;
});

/**
 * Each panel's value and handlers, moved from RobotOptionsTab: `value`s derived from `robot`, each
 * callback wired to its robotOptionsActions function, each memoized on the field it reads so the
 * React.memo'd section components bail on an unrelated robot change (a battery tick). The company
 * screen's call site, CompanyOptionsSection, wires the same components to a company's snapshot.
 */
function useRobotSubsectionRenderer(robot: Robot, localeId: string) {
  const latestRobot = useRef(robot);
  useEffect(() => {
    latestRobot.current = robot;
  });

  // Audio Swells: per-field swelling flags for each slider's own `swelling` prop (useEasedControlValue),
  // so a swell's already-smooth ramp is not eased a second time. isRobotAttributeSwelling reads
  // audioSwells.ts's module-scope Map, which React does not track: each memo's deps are the robot field
  // a swell tick writes, so it recomputes at that moment even though the body never reads them.
  const volumeSwelling = isRobotAttributeSwelling(robot.id, 'volume');
  // Absent means no glide, today's sound (docs/specs/ROBOT_ARTICULATION.md assumption 1). A number, so the memo deps compare by value.
  const portamento = robot.audioAttributes.portamento ?? 0;
  const adsrSwelling = useAdsrSwellingFlags(robot.id, robot.audioAttributes.adsr);
  const layer0Swelling = useLayerSwellingFlags(robot.id, 0, robot.audioAttributes.layers?.[0]);
  const layer1Swelling = useLayerSwellingFlags(robot.id, 1, robot.audioAttributes.layers?.[1]);
  const layer2Swelling = useLayerSwellingFlags(robot.id, 2, robot.audioAttributes.layers?.[2]);

  const audioSettingValue: AudioSettingValue = useMemo(() => ({
    audioMode: robot.audioMode ?? 'none',
    masterVolume: robot.masterVolume,
    pan: robot.pan,
    panAuto: robot.panAuto,
    reverbSend: robot.reverbSend,
    delaySend: robot.delaySend,
  }), [robot.audioMode, robot.masterVolume, robot.pan, robot.panAuto, robot.reverbSend, robot.delaySend]);

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
    lfoLinks: robot.lfoLinks,
  }), [robot.audioAttributes.layers, robot.lfoLinks]);

  // The filter drawer shows what the engine plays: absence resolves through the engine's own resolvers (a robot
  // with none of the fields reads Q 1, lowpass; filterFreq 0, "no filter", reads as the open top of the band).
  // The link falls back to the stable default object, so an unlinked Cutoff keeps one reference across edits.
  const busLink = robot.lfoLinks?.[BUS_FILTER_LFO_TARGET] ?? DEFAULT_LFO_LINK[BUS_FILTER_LFO_TARGET];
  const busFilterValue: BusFilterValue = useMemo(() => ({
    filterFreq: resolveBusFilterCutoff(robot.audioAttributes.filterFreq),
    filterQ: resolveBusFilterQ(robot.audioAttributes.filterQ),
    filterType: resolveBusFilterType(robot.audioAttributes.filterType),
    lfoLink: busLink,
  }), [robot.audioAttributes.filterFreq, robot.audioAttributes.filterQ, robot.audioAttributes.filterType, busLink]);
  // The Audio Load dial's hold on the robot bus-filter links (the Audio Rig's global filter panels read filterLinksHeldOff instead).
  const busFilterLinksHeldOff = useAudioStore((s) => s.busFilterLinksHeldOff);

  const handleAudioModeChange = useCallback((mode: Robot['audioMode']) => applyAudioMode(latestRobot.current, localeId, mode), [localeId]);
  const handleVolumeChange = useCallback((pct: number) => {
    cancelSwellForRobotAttribute(latestRobot.current.id, 'volume');
    applyVolume(latestRobot.current, localeId, pct);
  }, [localeId]);

  // The sends are not swell attributes yet (Task 12), so neither handler cancels one; Task 13 adds the cancel.
  const handleReverbSendChange = useCallback((pct: number) => applyReverbSend(latestRobot.current, localeId, pct), [localeId]);
  const handleDelaySendChange = useCallback((pct: number) => applyDelaySend(latestRobot.current, localeId, pct), [localeId]);

  // Pan is not a swell attribute, so neither handler cancels one. Both read the latest robot, so the
  // action sees the live pan/panAuto, not the render's (applyPanAuto copies the engine's live value).
  const handlePanChange = useCallback((display: number) => applyPan(latestRobot.current, localeId, display), [localeId]);
  const handlePanAutoChange = useCallback((auto: boolean) => applyPanAuto(latestRobot.current, localeId, auto), [localeId]);

  const handleDensityChange = useCallback((v: number) => applyDensity(latestRobot.current, localeId, v), [localeId]);
  const handleMotifLengthChange = useCallback((v: number) => applyMotifLength(latestRobot.current, localeId, v), [localeId]);
  const handlePitchRepeatChange = useCallback((v: number) => applyPitchRepeat(latestRobot.current, localeId, v), [localeId]);
  const handleOctaveMinChange = useCallback((v: number) => applyOctaveMin(latestRobot.current, localeId, v), [localeId]);
  const handleOctaveMaxChange = useCallback((v: number) => applyOctaveMax(latestRobot.current, localeId, v), [localeId]);
  const handleNoteVarianceChange = useCallback((v: number) => applyNoteVariance(latestRobot.current, localeId, v), [localeId]);

  const handleAdsrChange = useCallback((adsr: ADSREnvelope) => {
    const prevAdsr = latestRobot.current.audioAttributes.adsr;
    (Object.keys(adsr) as (keyof ADSREnvelope)[]).forEach((field) => {
      // The curve names are not swell attributes: only a/d/s/r swell.
      if (field === 'attackCurve' || field === 'releaseCurve') return;
      if (adsr[field] !== prevAdsr[field]) cancelSwellForRobotAttribute(latestRobot.current.id, `adsr.${field}`);
    });
    applyAdsr(latestRobot.current, localeId, adsr);
  }, [localeId]);

  // Portamento is not a swell attribute, so nothing to cancel; the action reads the live robot like every other handler.
  const handlePortamentoChange = useCallback((seconds: number) => applyPortamento(latestRobot.current, localeId, seconds), [localeId]);

  // The filter has no swell attribute, so nothing to cancel; both handlers read the live robot like every other one.
  const handleBusFilterChange = useCallback((patch: BusFilterPatch) => applyBusFilter(latestRobot.current, localeId, patch), [localeId]);
  const handleBusLinkChange = useCallback(
    (link: LfoLinkValue) => applyLayerLfoLink(latestRobot.current, localeId, BUS_FILTER_LFO_TARGET, link),
    [localeId],
  );

  const handleLayerTypeChange = useCallback((idx: number, type: WaveformType) => {
    const layers = latestRobot.current.audioAttributes.layers ?? [];
    applyLayersStructural(latestRobot.current, localeId, layers.map((l, i) => (i === idx ? { ...l, type } : l)));
  }, [localeId]);
  const handleLayerParamChange = useCallback((idx: number, field: SignatureArrayParamSchema['field'], v: number) => {
    cancelSwellForRobotAttribute(latestRobot.current.id, `layer${idx}.${field}` as SwellRobotAttributeId);
    const layers = latestRobot.current.audioAttributes.layers ?? [];
    applyLayersContinuous(latestRobot.current, localeId, layers.map((l, i) => (i === idx ? { ...l, [field]: v } : l)));
  }, [localeId]);
  const handleLayerLfoFieldChange = useCallback(
    (_idx: number, target: RobotLfoTargetId, value: LfoLinkValue) => applyLayerLfoLink(latestRobot.current, localeId, target, value),
    [localeId],
  );

  return useCallback((subsectionId: RobotSubsection): ReactNode => {
    switch (subsectionId) {
      case 'audioSettings':
        return (
          <RobotAudioSettingSection
            robotId={robot.id}
            value={audioSettingValue}
            onAudioModeChange={handleAudioModeChange}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onPanAutoChange={handlePanAutoChange}
            onReverbSendChange={handleReverbSendChange}
            onDelaySendChange={handleDelaySendChange}
            volumeSwelling={volumeSwelling}
          />
        );
      case 'rhythm':
        // Rhythm and Pitches are one Composition panel (docs/reference/layout-updates.md). Its Note
        // Variance scroll anchor served the nav tree's "Pitches" row, which is gone.
        return (
          <PingControlsCompositionSection
            value={pingControlsValue}
            onDensityChange={handleDensityChange}
            onMotifLengthChange={handleMotifLengthChange}
            onPitchRepeatChange={handlePitchRepeatChange}
            onOctaveMinChange={handleOctaveMinChange}
            onOctaveMaxChange={handleOctaveMaxChange}
            onNoteVarianceChange={handleNoteVarianceChange}
          />
        );
      case 'pingContour':
        return (
          <PingContourDrawer
            value={robot.audioAttributes.adsr}
            onChange={handleAdsrChange}
            portamento={portamento}
            onPortamentoChange={handlePortamentoChange}
            swelling={adsrSwelling}
          />
        );
      case 'baselineOscillator':
      case 'coaxialOscillator':
      case 'harmonicOscillator': {
        const idx = SOURCE_OSCILLATOR_SUBSECTIONS.indexOf(subsectionId);
        const layer = signatureArrayValue.layers[idx];
        const layerSwelling = idx === 0 ? layer0Swelling : idx === 1 ? layer1Swelling : layer2Swelling;
        return layer ? (
          <SignatureArrayLayer
            block={SIGNATURE_ARRAY_CONFIG[idx]}
            idx={idx}
            layer={layer}
            lfoLinks={signatureArrayValue.lfoLinks}
            swelling={layerSwelling}
            onTypeChange={handleLayerTypeChange}
            onParamChange={handleLayerParamChange}
            onLfoFieldChange={handleLayerLfoFieldChange}
          />
        ) : null;
      }
      case 'busFilter':
        return (
          <BusFilterDrawer
            value={busFilterValue}
            onChange={handleBusFilterChange}
            onLfoLinkChange={handleBusLinkChange}
            heldOff={busFilterLinksHeldOff}
          />
        );
      default:
        return null;
    }
  }, [
    robot.id, audioSettingValue, handleAudioModeChange, handleVolumeChange, handlePanChange, handlePanAutoChange, volumeSwelling,
    handleReverbSendChange, handleDelaySendChange,
    pingControlsValue, handleDensityChange, handleMotifLengthChange, handlePitchRepeatChange,
    handleOctaveMinChange, handleOctaveMaxChange, handleNoteVarianceChange,
    robot.audioAttributes.adsr, handleAdsrChange, portamento, handlePortamentoChange, adsrSwelling,
    signatureArrayValue, layer0Swelling, layer1Swelling, layer2Swelling,
    handleLayerTypeChange, handleLayerParamChange, handleLayerLfoFieldChange,
    busFilterValue, handleBusFilterChange, handleBusLinkChange, busFilterLinksHeldOff,
  ]);
}

// ========================================
// THE AVATAR COLUMN AND BAND
// ========================================

const META_FIELDS: readonly (readonly [RobotMetaField, DualLabelSchema])[] = [
  ['job', ROBOT_SELECTION_ROW_SCHEMAS.job],
  ['dockingState', ROBOT_SELECTION_ROW_SCHEMAS.docking],
  ['activity', ROBOT_SELECTION_ROW_SCHEMAS.activity],
  ['status', ROBOT_SELECTION_ROW_SCHEMAS.status],
];

/** The gem in the avatar render context: day/night-invariant, at scale 1, framed to its motion canvas. */
function AvatarGem({ robot }: { robot: Robot }) {
  return (
    <svg className="robot-screen__gem" viewBox={gemMotionViewBox(getRobotGem(robot.gemSeed))} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <RobotBody robot={robot} ignoreDaylight ignoreScale motion="avatar" />
    </svg>
  );
}

/** Desk: the gem, the name, the meta as wells (in = read), the battery readout and the company radio. No
 *  job reassignment and no docking override: both stay system-driven. */
const RobotAvatarColumn = memo(function RobotAvatarColumn({ robot, localeId }: RobotPanelProps) {
  const meta = useRobotMeta(robot, localeId);
  const companies = useLocaleStore((s) => s.locales[localeId]?.companies ?? NO_COMPANIES);
  const companyAssignmentSchema = useMemo(() => buildCompanyAssignmentSchema(companies), [companies]);
  const handleCompanyChange = useCallback((value: string) => {
    useLocaleStore.getState().assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value);
  }, [localeId, robot.id]);

  return (
    <div className="robot-screen__avatar-column">
      <AvatarGem robot={robot} />
      <h2 className="robot-screen__name">{robot.name || robot.id}</h2>
      <div className="robot-screen__meta">
        {META_FIELDS.map(([field, schema]) => (
          <div key={field} className="robot-screen__well">
            <DualLabel {...schema} />
            <span className="robot-screen__meta-value">{meta[field]}</span>
          </div>
        ))}
      </div>
      <SliderLinear
        schema={BATTERY_READOUT_SCHEMA}
        value={Math.round(robot.batteryLevel)}
        onChange={NO_CHANGE}
        readOnly
        boxSize={BATTERY_READOUT_BOX_SIZE}
        gapSize={BATTERY_READOUT_GAP_SIZE}
      />
      <RadioButton schema={companyAssignmentSchema} value={robot.companyId ?? FREELANCE_VALUE} onChange={handleCompanyChange} />
    </div>
  );
});

/** Phone: the small band only (spec §1.4; the expanded band was rejected): the gem, the name and one
 *  status line carrying the meta and the battery. Reassignment on the phone is the roster's Move sheet. */
function RobotAvatarBand({ robot, localeId }: RobotPanelProps) {
  const meta = useRobotMeta(robot, localeId);
  const battery = `${Math.round(robot.batteryLevel)}${BATTERY_READOUT_SCHEMA.unit ?? ''}`;
  return (
    <div className="robot-screen__band">
      <AvatarGem robot={robot} />
      <div className="robot-screen__band-text">
        <h2 className="robot-screen__name">{robot.name || robot.id}</h2>
        <span className="robot-screen__status-line">{fill('probe.band.statusLine', { ...meta, battery })}</span>
      </div>
    </div>
  );
}
