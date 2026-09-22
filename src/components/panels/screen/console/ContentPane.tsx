import { ConsolePanel } from './ConsolePanel';
import { useUIStore } from '@/stores/uiStore';
import './ContentPane.css';

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
      <button type="button" className="content-pane__close" onClick={handleClose}>
        Close
      </button>
      <ConsolePanel />
    </div>
  );
}

export default ContentPane;
