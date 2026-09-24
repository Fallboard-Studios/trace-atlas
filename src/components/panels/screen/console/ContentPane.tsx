import { ConsolePanel } from './ConsolePanel';
import { Button } from '@/components/ui/controls/Button';
import { useUIStore } from '@/stores/uiStore';
import type { ButtonSchema } from '@/types/controls';
import './ContentPane.css';

// Same schema-driven Button primitive ConsolePanel.tsx's own Back button
// uses (BACK_SCHEMA there) — this control gets the identical Oblique
// Cabinetry facade/accessible-name/disabled handling instead of a bare
// `<button>`.
const CLOSE_SCHEMA: ButtonSchema = { id: 'contentPaneClose', type: 'button', humanLabel: 'Close' };

/**
 * Repurposed from Console.tsx (spec §7 Q6, docs/specs/NAV_LAYOUT_REWRITE.md Task 8) — the single
 * content area the new nav tree opens into. activeHubTile === null is still the blank state
 * (nothing selected in the tree yet); rendering nothing here, not an empty div, lets clicks reach
 * WorldView's robots underneath, unchanged from Console.tsx's own behavior. New in this task: an
 * always-present close button that clears the selection back to the blank/landing state —
 * activeHubTile plus every entity/section field a branch could have set, so the next tile opened
 * never inherits stale selection from a previous one. Still renders through the existing,
 * unmigrated ConsolePanel/TILE_CONTENT dispatch — no content component changes yet (Task 20
 * relocates Companies CRUD, Tasks 11-19 relocate everything else).
 */
export function ContentPane() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const setActiveHubTile = useUIStore((s) => s.setActiveHubTile);
  const selectRobot = useUIStore((s) => s.selectRobot);
  const selectAllRobots = useUIStore((s) => s.selectAllRobots);
  const setSelectedSection = useUIStore((s) => s.setSelectedSection);

  if (activeHubTile === null) return null;

  function handleClose() {
    setActiveHubTile(null);
    selectRobot(null);
    selectAllRobots();
    setSelectedSection(null);
  }

  return (
    <div className="content-pane">
      <div className="content-pane__close">
        <Button schema={CLOSE_SCHEMA} onClick={handleClose} />
      </div>
      <ConsolePanel />
    </div>
  );
}

export default ContentPane;
