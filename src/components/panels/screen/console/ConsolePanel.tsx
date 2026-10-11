import type { ReactNode } from 'react';
import { CompanyScreen } from '../screens/CompanyScreen';
import { FleetParamsScreen } from '../screens/FleetParamsScreen';
import { RobotScreen } from '../screens/RobotScreen';
import { RosterBoard } from '../screens/RosterBoard';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { HubTile } from '@/types/hub';
import { useUIStore } from '@/stores/uiStore';
import { CONTENT } from '@/content';
import './ConsolePanel.css';

/**
 * The Probes branch (docs/specs/LAYOUT_REWORK.md §1.4–§1.6): a selected robot's screen wins, then the
 * All Probes form (the company screen for the whole fleet), then the roster board.
 */
function ProbesBranch() {
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);
  if (selectedRobotId) return <RobotScreen />;
  if (allProbesSelected) return <CompanyScreen />;
  return <RosterBoard />;
}

/**
 * The Companies branch: a selected company's screen, else the same roster board (it replaced the
 * Companies index, spec §1.5).
 */
function CompaniesBranch() {
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  return selectedCompanyId ? <CompanyScreen /> : <RosterBoard />;
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
