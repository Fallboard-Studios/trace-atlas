import type { ReactNode } from 'react';
import { FleetParamsScreen } from '../screens/FleetParamsScreen';
import { RobotScreen } from '../screens/RobotScreen';
import { RosterBoard } from '../screens/RosterBoard';
import { SettingsScreen } from '../screens/SettingsScreen';
import { CompanyRenameDeleteForm } from '@/components/company/CompanyCrudControls';
import { CompanyOptionsSection } from '@/components/company/CompanyOptionsSection';
import { IntroPanel } from '@/components/ui/controls/IntroPanel';
import type { HubTile } from '@/types/hub';
import { useUIStore } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { CONTENT, introProps } from '@/content';
import './ConsolePanel.css';

/**
 * The Probes branch (docs/specs/LAYOUT_REWORK.md §1.4–§1.5): a selected robot's screen wins, then the
 * All Probes form, then the roster board. The All Probes form is the old one — its intro over
 * CompanyOptionsSection's broadcast sections — until CompanyScreen's All form replaces it (Task 23).
 */
function ProbesBranch() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);
  if (selectedRobotId) return <RobotScreen />;
  if (allProbesSelected) {
    return (
      <div style={getTraitColorStyle('header')}>
        <IntroPanel {...introProps('probe.all')} trait="header" />
        <CompanyOptionsSection />
      </div>
    );
  }
  return <RosterBoard />;
}

/**
 * The Companies branch: a selected company's form, else the same roster board (it replaced the
 * Companies index, spec §1.5). The company form is the old one — its intro, Rename / Delete, then the
 * broadcast sections — until CompanyScreen replaces it (Task 23).
 */
function CompaniesBranch() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  if (!selectedCompanyId) return <RosterBoard />;
  return (
    <div style={getTraitColorStyle('company')}>
      <IntroPanel {...introProps('company.profile')} trait="company" />
      <CompanyRenameDeleteForm />
      <CompanyOptionsSection />
    </div>
  );
}

/**
 * One entry per HubTile, keyed by a Record so TypeScript itself enforces
 * every tile is covered — a new HubTile value that's missing an entry here
 * is a compile error, not a silent blank render. Adding a future tile is one
 * new entry, not a switch case to remember.
 */
const TILE_CONTENT: Record<HubTile, () => ReactNode> = {
  robots: () => <ProbesBranch />,
  audioRig: () => <FleetParamsScreen />,
  settings: () => <SettingsScreen />,
  companies: () => <CompaniesBranch />,
};

export function ConsolePanel() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);

  // Navigation moved into Header's always-visible row 3 (docs/specs/
  // HEADER_HUB_CONSOLIDATION.md §1.7) — no tile grid to render here anymore.
  // A genuinely empty return, not a wrapper div with nothing in it, so
  // WorldView's robots show through unobstructed.
  if (activeHubTile === null) {
    return null;
  }

  // The nested robot-detail level's own Back button (Console Retreat) was removed — NavBreadcrumb's
  // clickable "Probes" segment now covers the same one-step-back need.
  return (
    <div className="console-panel" role="region" aria-label={CONTENT['ui.consolePanel'].human}>
      <div className="console-panel__content">{TILE_CONTENT[activeHubTile]()}</div>
    </div>
  );
}

export default ConsolePanel;
