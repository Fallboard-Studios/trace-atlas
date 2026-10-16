import { AudioRigDrawer, AudioRigEffectPanel } from '../console/AudioRigDrawer';
import { LfoBankLanePanel } from '../console/LfoBankLanePanel';
import { useShell, type Shell } from '../useShell';
import { FLEET_PARAMS_GROUP_CONTENT, FLEET_PARAMS_SUBSECTIONS, activeFleetParamsSubsection } from '../nav/navActions';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { SectionTabs, type SectionTabItem } from '@/components/ui/controls/SectionTabs';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { BPM_SCHEMA, HUMANIZE_SCHEMA, SWELL_FREQUENCY_SCHEMA, SWELL_DURATION_SCHEMA, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { laneTitle } from '@/data/lfoConfig';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { introProps, labels } from '@/content';
import type { DirectionalPanelSchema } from '@/types/controls';
import type { LfoLaneId } from '@/types/lfo';
import type { Trait } from '@/types/traits';
import './FleetParamsScreen.css';

/** The seven sections in the sketch's order (Colour, Global Colour T9, then Modulation, Global Modulation T10,
 *  sit on the chain side of Output), each in the trait its group accordion wore. Modulation wears Spectral:
 *  no new trait (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 11). */
const SECTIONS: readonly (readonly [FleetParamsGroup, Trait])[] = [
  ['pacing', 'composition'],
  ['lfoBank', 'timeSpace'],
  ['eqFilters', 'spectral'],
  ['timeSpace', 'timeSpace'],
  ['colour', 'colour'],
  ['modulation', 'spectral'],
  ['output', 'output'],
];
const SECTION_TRAIT = Object.fromEntries(SECTIONS) as Record<FleetParamsGroup, Trait>;

/** LFO Bank's four sub-tabs are the store's lanes. */
const LANE_OF: Partial<Record<SelectedFleetParamsEffect, LfoLaneId>> = { laneA: 'a', laneB: 'b', laneC: 'c', laneD: 'd' };

// The screen's intro, in Fleet Params' own colour (the nav box's), and each section's own at the top of
// its panel — every one an expander (IntroPanel `collapsible`; Crawford, 2026-10-10, spec §1.3).
const INTRO = introProps('fleet.root');
const INTRO_NAME = labels('fleet.root').humanLabel;

/** Pacing's five leaves as two rows (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md): Tempo, Humanize
 *  (docs/specs/ROBOT_PERFORMANCE.md §1.6) and Automation Rate across the top, Automation Length beside the
 *  intensity drawer below. 'responsive' rows, side by side on desktop and stacked below it, as the
 *  Compressor rows. */
const PACING_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.topRow', type: 'directionalPanel', orientation: 'responsive' };
const PACING_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

// Module-level, so each is one stable function (the sliders are React.memo'd), and each reads the
// store's action at call time.
const setBPM = (v: number) => useAudioStore.getState().setBPM(v);
// The store's setHumanize also pushes the value to the playback engine; this screen never touches the engine itself.
const setHumanize = (v: number) => useAudioStore.getState().setHumanize(v);
const setSwellFrequency = (v: number) => useAudioStore.getState().setSwellFrequency(v);
const setSwellDuration = (v: number) => useAudioStore.getState().setSwellDuration(v);
const setSection = (section: FleetParamsGroup) => useUIStore.getState().setFleetParamsSection(section);
const setSubsection = (sub: SelectedFleetParamsEffect) => useUIStore.getState().setFleetParamsSubsection(sub);

/** Subscribes to its own four values, so a tempo change re-renders Pacing only, and nothing at all
 *  while another section is open. */
function PacingPanel() {
  const bpm = useAudioStore((s) => s.bpm);
  const humanize = useAudioStore((s) => s.humanize);
  const swellFrequency = useAudioStore((s) => s.swellFrequency);
  const swellDuration = useAudioStore((s) => s.swellDuration);
  return (
    <>
      <DirectionalPanel schema={PACING_TOP_ROW_SCHEMA}>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={setBPM} />
        </div>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={HUMANIZE_SCHEMA} value={humanize} onChange={setHumanize} />
        </div>
        <div className="audio-rig-drawer__param-row">
          <SliderLog schema={SWELL_FREQUENCY_SCHEMA} value={swellFrequency} onChange={setSwellFrequency} />
        </div>
      </DirectionalPanel>
      <DirectionalPanel schema={PACING_BOTTOM_ROW_SCHEMA}>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={SWELL_DURATION_SCHEMA} value={swellDuration} onChange={setSwellDuration} />
        </div>
        <AudioRigDrawer />
      </DirectionalPanel>
    </>
  );
}

type SubTabbedSection = Exclude<FleetParamsGroup, 'pacing'>;

/** A section's sub-tab items for one shell — built once per shell at load, so SectionTabs' memo holds.
 *  A lane's tab reads laneTitle(); every other sub-tab its panel's entry. */
function subTabItems(section: SubTabbedSection, shell: Shell): readonly SectionTabItem<SelectedFleetParamsEffect>[] {
  return FLEET_PARAMS_SUBSECTIONS[section].map(({ id, content }) => {
    const lane = LANE_OF[id];
    return {
      id,
      content,
      trait: SECTION_TRAIT[section],
      label: lane ? laneTitle(lane, shell) : undefined,
      render: lane ? () => <LfoBankLanePanel lane={lane} /> : () => <AudioRigEffectPanel effectKey={id as AudioRigEffectKey} />,
    };
  });
}

const SUB_TABBED: readonly SubTabbedSection[] = ['lfoBank', 'eqFilters', 'timeSpace', 'colour', 'modulation', 'output'];
const SUB_TAB_ITEMS = Object.fromEntries(
  (['desk', 'phone'] as const).map((shell) => [shell, Object.fromEntries(SUB_TABBED.map((section) => [section, subTabItems(section, shell)]))]),
) as Record<Shell, Record<SubTabbedSection, readonly SectionTabItem<SelectedFleetParamsEffect>[]>>;

/** The sub-tab row, nested in its section's panel; it alone reads the stored sub-tab. */
function SubTabs({ section }: { section: SubTabbedSection }) {
  const shell = useShell();
  const stored = useUIStore((s) => s.fleetParamsSubsection);
  return (
    <SectionTabs
      variant="sub"
      label={labels(FLEET_PARAMS_GROUP_CONTENT[section]).humanLabel}
      items={SUB_TAB_ITEMS[shell][section]}
      value={activeFleetParamsSubsection(section, stored)!}
      onValueChange={setSubsection}
    />
  );
}

/** One section's panel, in its group's trait so the panels inside keep the colour they had. */
function SectionPanel({ section }: { section: FleetParamsGroup }) {
  const key = FLEET_PARAMS_GROUP_CONTENT[section];
  return (
    <div className="fleet-params-screen__section" style={getTraitColorStyle(SECTION_TRAIT[section])}>
      <IntroPanel {...introProps(key)} name={labels(key).humanLabel} trait={SECTION_TRAIT[section]} collapsible />
      {section === 'pacing' ? <PacingPanel /> : <SubTabs section={section} />}
    </div>
  );
}

const SECTION_ITEMS: readonly SectionTabItem<FleetParamsGroup>[] = SECTIONS.map(([id, trait]) => ({
  id,
  content: FLEET_PARAMS_GROUP_CONTENT[id],
  trait,
  render: () => <SectionPanel section={id} />,
}));
const SECTIONS_LABEL = labels('fleet.root').humanLabel;

/**
 * Fleet Params (docs/specs/LAYOUT_REWORK.md §1.3–§1.4; docs/tasks/LAYOUT_REWORK.md Task 15): the
 * screen's intro, then the seven sections as tabs — Pacing, LFO Bank, EQ & Filters, Time & Space,
 * Colour, Modulation, Output — with a nested sub-tab row for the four lanes and the effect leaves. One section and one
 * sub-tab are in the DOM at a time (SectionTabs, no forceMount), which carries roadmap 17.2.2's
 * lazy-mount forward. The open tab is `fleetParamsSection` / `fleetParamsSubsection` in uiStore, read
 * by the breadcrumb through navActions' same table. The panels are the existing ones, unchanged. Each
 * section's panel opens with its group's intro; every intro is an expander that starts collapsed, its
 * headline showing (Crawford, 2026-10-10, spec §1.3 amended — Task 15 had kept one intro per screen).
 */
export function FleetParamsScreen() {
  const section = useUIStore((s) => s.fleetParamsSection);
  return (
    <div className="fleet-params-screen">
      <IntroPanel {...INTRO} name={INTRO_NAME} trait="spectral" collapsible />
      <SectionTabs label={SECTIONS_LABEL} items={SECTION_ITEMS} value={section} onValueChange={setSection} />
    </div>
  );
}
