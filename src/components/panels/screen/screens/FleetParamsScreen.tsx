import { useState } from 'react';
import { AudioRigDrawer, AudioRigEffectPanel } from '../console/AudioRigDrawer';
import { LfoBankLanePanel } from '../console/LfoBankLanePanel';
import { useShell, type Shell } from '../useShell';
import { FLEET_PARAMS_GROUP_CONTENT, FLEET_PARAMS_SUBSECTIONS, activeFleetParamsSubsection } from '../nav/navActions';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { DirectionalPanel } from '@/components/ui/controls/DirectionalPanel';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { SectionTabs, type SectionTabItem } from '@/components/ui/controls/SectionTabs';
import { SliderLinear } from '@/components/ui/controls/SliderLinear';
import { SliderLog } from '@/components/ui/controls/SliderLog';
import { BPM_SCHEMA, SWELL_FREQUENCY_SCHEMA, SWELL_DURATION_SCHEMA, type AudioRigEffectKey } from '@/data/audioRigConfig';
import { laneTitle } from '@/data/lfoConfig';
import { useUIStore, type FleetParamsGroup, type SelectedFleetParamsEffect } from '@/stores/uiStore';
import { useAudioStore } from '@/stores/audioStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { introProps, labels } from '@/content';
import type { AccordionSchema, DirectionalPanelSchema } from '@/types/controls';
import type { LfoLaneId } from '@/types/lfo';
import type { Trait } from '@/types/traits';
import './FleetParamsScreen.css';

/** The five sections in the sketch's order, each in the trait its group accordion wore. */
const SECTIONS: readonly (readonly [FleetParamsGroup, Trait])[] = [
  ['pacing', 'composition'],
  ['lfoBank', 'timeSpace'],
  ['eqFilters', 'spectral'],
  ['timeSpace', 'timeSpace'],
  ['output', 'output'],
];
const SECTION_TRAIT = Object.fromEntries(SECTIONS) as Record<FleetParamsGroup, Trait>;

/** LFO Bank's four sub-tabs are the store's lanes. */
const LANE_OF: Partial<Record<SelectedFleetParamsEffect, LfoLaneId>> = { laneA: 'a', laneB: 'b', laneC: 'c', laneD: 'd' };

// Fleet Params' own colour (the nav box's), as the old screen's outer panel wore it.
const INTRO_SCHEMA: AccordionSchema = { id: 'fleetParams.intro', type: 'accordion', ...labels('fleet.root') };
const INTRO = introProps('fleet.root');
const INTRO_STYLE = getTraitColorStyle('spectral');

/** Pacing's four leaves as two rows of two (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md): Tempo
 *  beside Automation Rate, Automation Length beside the intensity drawer. 'responsive' rows, side by
 *  side on desktop and stacked below it, as the Compressor rows. */
const PACING_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.topRow', type: 'directionalPanel', orientation: 'responsive' };
const PACING_BOTTOM_ROW_SCHEMA: DirectionalPanelSchema = { id: 'fleetParams.pacing.bottomRow', type: 'directionalPanel', orientation: 'responsive' };

// Module-level, so each is one stable function (the sliders are React.memo'd), and each reads the
// store's action at call time.
const setBPM = (v: number) => useAudioStore.getState().setBPM(v);
const setSwellFrequency = (v: number) => useAudioStore.getState().setSwellFrequency(v);
const setSwellDuration = (v: number) => useAudioStore.getState().setSwellDuration(v);
const setSection = (section: FleetParamsGroup) => useUIStore.getState().setFleetParamsSection(section);
const setSubsection = (sub: SelectedFleetParamsEffect) => useUIStore.getState().setFleetParamsSubsection(sub);

/** Subscribes to its own three values, so a tempo change re-renders Pacing only, and nothing at all
 *  while another section is open. */
function PacingPanel() {
  const bpm = useAudioStore((s) => s.bpm);
  const swellFrequency = useAudioStore((s) => s.swellFrequency);
  const swellDuration = useAudioStore((s) => s.swellDuration);
  return (
    <>
      <DirectionalPanel schema={PACING_TOP_ROW_SCHEMA}>
        <div className="audio-rig-drawer__param-row">
          <SliderLinear schema={BPM_SCHEMA} value={bpm} onChange={setBPM} />
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

const SUB_TABBED: readonly SubTabbedSection[] = ['lfoBank', 'eqFilters', 'timeSpace', 'output'];
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
  return (
    <div className="fleet-params-screen__section" style={getTraitColorStyle(SECTION_TRAIT[section])}>
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
 * Fleet Params (docs/specs/LAYOUT_REWORK.md §1.3–§1.4; docs/tasks/LAYOUT_REWORK.md Task 15): one
 * collapsible intro, then the five sections as tabs — Pacing, LFO Bank, EQ & Filters, Time & Space,
 * Output — with a nested sub-tab row for the four lanes and the effect leaves. One section and one
 * sub-tab are in the DOM at a time (SectionTabs, no forceMount), which carries roadmap 17.2.2's
 * lazy-mount forward. The open tab is `fleetParamsSection` / `fleetParamsSubsection` in uiStore, read
 * by the breadcrumb through navActions' same table. The panels are the existing ones, unchanged. The
 * intro opens collapsed, as the approved sketch draws it, and the groups' own intros are gone (spec
 * §1.3: one intro per screen).
 */
export function FleetParamsScreen() {
  const section = useUIStore((s) => s.fleetParamsSection);
  const [introOpen, setIntroOpen] = useState(false);
  return (
    <div className="fleet-params-screen">
      <AccordionContainer schema={INTRO_SCHEMA} open={introOpen} onOpenChange={setIntroOpen} style={INTRO_STYLE}>
        <IntroPanel {...INTRO} trait="spectral" />
      </AccordionContainer>
      <SectionTabs label={SECTIONS_LABEL} items={SECTION_ITEMS} value={section} onValueChange={setSection} />
    </div>
  );
}
