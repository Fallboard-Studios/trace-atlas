import { useState, type ReactNode } from 'react';
import { AudioLoadPanel } from '../console/AudioLoadPanel';
import { SectorSettingsDrawer } from '../console/SectorSettingsDrawer';
import { SessionsPanel } from '../console/SessionsPanel';
import { SETTINGS_LEAVES, SETTINGS_LEAF_CONTENT, activeSettingsLeaf } from '../nav/navActions';
import { AccordionContainer } from '@/components/ui/controls/AccordionContainer';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { SectionTabs, type SectionTabItem } from '@/components/ui/controls/SectionTabs';
import { useUIStore, type SettingsLeaf } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { introProps, labels } from '@/content';
import type { AccordionSchema } from '@/types/controls';
import './SettingsScreen.css';

/** Settings' colour (the nav box's), on the intro, every tab and the open panel, as the old screen wore it. */
const SEED_STYLE = getTraitColorStyle('seed');

// Each panel as the stacked screen rendered it: prop-less, self-subscribing, unchanged inside.
const PANELS: Record<SettingsLeaf, () => ReactNode> = {
  quality: () => <AudioLoadPanel />,
  sectorSettings: () => <SectorSettingsDrawer />,
  sessions: () => <SessionsPanel />,
};

const SECTION_ITEMS: readonly SectionTabItem<SettingsLeaf>[] = SETTINGS_LEAVES.map((leaf) => ({
  id: leaf,
  content: SETTINGS_LEAF_CONTENT[leaf],
  trait: 'seed',
  render: () => (
    <div className="settings-screen__section" style={SEED_STYLE}>
      {PANELS[leaf]()}
    </div>
  ),
}));
const SECTIONS_LABEL = labels('settings.root').humanLabel;

const INTRO_SCHEMA: AccordionSchema = { id: 'settings.intro', type: 'accordion', ...labels('settings.root') };
const INTRO = introProps('settings.root');

// Module-level, so it is one stable function (SectionTabs is React.memo'd).
const setLeaf = (leaf: SettingsLeaf) => useUIStore.getState().setSelectedSettingsLeaf(leaf);

/**
 * Settings (docs/specs/LAYOUT_REWORK.md §1.3, §1.8; docs/tasks/LAYOUT_REWORK.md Task 17): one collapsible
 * intro, then the three leaves as tabs — Audio Quality, Seeds, Save & Share — over today's
 * AudioLoadPanel, SectorSettingsDrawer and SessionsPanel. One panel is in the DOM at a time
 * (SectionTabs, no forceMount), which carries the stacked screen's lazy-mount forward. The open tab is
 * `selectedSettingsLeaf`, resolved by navActions' activeSettingsLeaf (Audio Quality when none is
 * stored), which the breadcrumb reads too. The intro opens collapsed, as Fleet Params' does, and the
 * leaves' own intros are gone (spec §1.3: one intro per screen).
 */
export function SettingsScreen() {
  const stored = useUIStore((s) => s.selectedSettingsLeaf);
  const [introOpen, setIntroOpen] = useState(false);
  return (
    <div className="settings-screen">
      <AccordionContainer schema={INTRO_SCHEMA} open={introOpen} onOpenChange={setIntroOpen} style={SEED_STYLE}>
        <IntroPanel {...INTRO} trait="seed" />
      </AccordionContainer>
      <SectionTabs label={SECTIONS_LABEL} items={SECTION_ITEMS} value={activeSettingsLeaf(stored)} onValueChange={setLeaf} />
    </div>
  );
}
