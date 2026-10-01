import type { ReactNode } from 'react';
import { ProbesContent } from '../nav/content/ProbesContent';
import { FleetParamsContent } from '../nav/content/FleetParamsContent';
import { SettingsContent } from '../nav/content/SettingsContent';
import { CompaniesContent } from '../nav/content/CompaniesContent';
import type { HubTile } from '@/types/hub';
import { useUIStore } from '@/stores/uiStore';
import { CONTENT } from '@/content';
import './ConsolePanel.css';

/**
 * One entry per HubTile, keyed by a Record so TypeScript itself enforces
 * every tile is covered — a new HubTile value that's missing an entry here
 * is a compile error, not a silent blank render. Adding a future tile is one
 * new entry, not a switch case to remember. `robots`' own list/detail (and,
 * since Task 19, All Probes bulk-edit) switch lives inside ProbesContent
 * itself now, reading selectedRobotId/allProbesSelected straight from
 * uiStore — no passthrough parameter needed here anymore.
 */
const TILE_CONTENT: Record<HubTile, () => ReactNode> = {
  robots: () => <ProbesContent />,
  audioRig: () => <FleetParamsContent />,
  settings: () => <SettingsContent />,
  companies: () => <CompaniesContent />,
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
