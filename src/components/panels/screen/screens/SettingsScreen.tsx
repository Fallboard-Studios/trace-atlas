import type { ReactNode } from 'react';
import { AudioLoadPanel } from '../console/AudioLoadPanel';
import { SectorSettingsDrawer } from '../console/SectorSettingsDrawer';
import { SessionsPanel } from '../console/SessionsPanel';
import { SETTINGS_LEAVES, SETTINGS_LEAF_CONTENT, activeSettingsLeaf } from '../nav/navActions';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import { SectionTabs, type SectionTabItem } from '@/components/ui/controls/SectionTabs';
import { useUIStore, type SettingsLeaf } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { introProps, labels } from '@/content';
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
      <IntroPanel {...introProps(SETTINGS_LEAF_CONTENT[leaf])} name={labels(SETTINGS_LEAF_CONTENT[leaf]).humanLabel} trait="seed" collapsible />
      {PANELS[leaf]()}
    </div>
  ),
}));
const SECTIONS_LABEL = labels('settings.root').humanLabel;

// The screen's intro and each tab's own, every one an expander (IntroPanel `collapsible`; Crawford,
// 2026-10-10, spec §1.3).
const INTRO = introProps('settings.root');

// Module-level, so it is one stable function (SectionTabs is React.memo'd).
const setLeaf = (leaf: SettingsLeaf) => useUIStore.getState().setSelectedSettingsLeaf(leaf);

/**
 * Settings (docs/specs/LAYOUT_REWORK.md §1.3, §1.8; docs/tasks/LAYOUT_REWORK.md Task 17): the screen's
 * intro, then the three leaves as tabs — Audio Quality, Seeds, Save & Share — over today's
 * AudioLoadPanel, SectorSettingsDrawer and SessionsPanel. One panel is in the DOM at a time
 * (SectionTabs, no forceMount), which carries the stacked screen's lazy-mount forward. The open tab is
 * `selectedSettingsLeaf`, resolved by navActions' activeSettingsLeaf (Audio Quality when none is
 * stored), which the breadcrumb reads too. Each tab's panel opens with its leaf's intro; every intro is
 * an expander that starts collapsed, its headline showing (Crawford, 2026-10-10, spec §1.3 amended).
 */
export function SettingsScreen() {
  const stored = useUIStore((s) => s.selectedSettingsLeaf);
  return (
    <div className="settings-screen">
      <IntroPanel {...INTRO} name={SECTIONS_LABEL} trait="seed" collapsible />
      <SectionTabs label={SECTIONS_LABEL} items={SECTION_ITEMS} value={activeSettingsLeaf(stored)} onValueChange={setLeaf} />
    </div>
  );
}
