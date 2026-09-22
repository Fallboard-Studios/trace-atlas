import type { ReactNode } from 'react';
import { RobotsTab } from './RobotsTab';
import { RobotOptionsTab } from './RobotOptionsTab';
import { AudioRigDrawer } from './AudioRigDrawer';
import { SectorSettingsDrawer } from './SectorSettingsDrawer';
import { CompanyManager } from '@/components/company/CompanyManager';
import { Button } from '@/components/ui/controls/Button';
import type { ButtonSchema } from '@/types/controls';
import type { HubTile } from '@/types/hub';
import { useUIStore } from '@/stores/uiStore';
import './ConsolePanel.css';

const BACK_SCHEMA: ButtonSchema = { id: 'hubNavBack', type: 'button', loreLabel: 'CONSOLE RETREAT [c]', humanLabel: 'Back' };

/**
 * One entry per HubTile, keyed by a Record so TypeScript itself enforces
 * every tile is covered — a new HubTile value that's missing an entry here
 * is a compile error, not a silent blank render. Adding a future tile is one
 * new entry, not a switch case to remember. `selectedRobotId` is threaded
 * through for `robots`, which nests a list/detail switch of its own; other
 * tiles ignore it.
 */
const TILE_CONTENT: Record<HubTile, (selectedRobotId: string | null) => ReactNode> = {
  robots: (selectedRobotId) => (selectedRobotId ? <RobotOptionsTab /> : <RobotsTab />),
  audioRig: () => <AudioRigDrawer />,
  settings: () => <SectorSettingsDrawer />,
  // Placeholder entry (Nav & Layout Rewrite Task 1, docs/tasks/NAV_LAYOUT_REWRITE.md)
  // — keeps the build green now that HubTile has a 4th value. Real relocation
  // of Companies CRUD into per-node tree interactions is Task 20.
  companies: () => <CompanyManager />,
};

export function ConsolePanel() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectRobot = useUIStore((s) => s.selectRobot);

  // Navigation moved into Header's always-visible row 3 (docs/specs/
  // HEADER_HUB_CONSOLIDATION.md §1.7) — no tile grid to render here anymore.
  // A genuinely empty return, not a wrapper div with nothing in it, so
  // WorldView's robots show through unobstructed.
  if (activeHubTile === null) {
    return null;
  }

  // Header's nav RadioButton already gets you back to the blank hub from
  // every top-level tile (Robots list, Audio Rig, Sector Settings) — a
  // second, redundant Back button on those was removed. Only the nested
  // robot-detail level (a robot selected within the robots tile) still
  // needs its own: Header's nav has no equivalent one-step-back for it —
  // re-selecting "Robots" from there drops straight to the list, per its
  // own documented behavior, not back to the detail view it came from.
  const showBack = activeHubTile === 'robots' && selectedRobotId !== null;

  return (
    <div className="console-panel" role="region" aria-label="Console Panel">
      {showBack && (
        <div className="console-panel__back">
          <Button schema={BACK_SCHEMA} onClick={() => selectRobot(null)} />
        </div>
      )}
      <div className="console-panel__content">{TILE_CONTENT[activeHubTile](selectedRobotId)}</div>
    </div>
  );
}

export default ConsolePanel;
