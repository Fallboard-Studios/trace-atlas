import { ConsolePanel } from './ConsolePanel';
import { useUIStore } from '@/stores/uiStore';
import './ContentPane.css';

/**
 * The single content area the nav opens into (repurposed from Console.tsx, spec §7 Q6,
 * docs/specs/archive/NAV_LAYOUT_REWRITE.md Task 8; the opaque content surface is docs/specs/LAYOUT_REWORK.md §1.3).
 * activeHubTile === null is the Deck, the landing state (nothing picked in the nav yet): it renders
 * nothing, so the world stays bright and clickable — Robot.tsx's own click handler relies on nothing
 * blocking WorldView at this state. (The Welcome accordion and intro card that used to sit here were
 * removed.) Once a tile is active, it renders through the existing ConsolePanel/TILE_CONTENT
 * dispatch. The close control is NavPanel's "Deck" box (navActions.goHome).
 */
export function ContentPane() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);

  if (activeHubTile === null) return null;

  return (
    <div className="content-pane">
      <ConsolePanel />
    </div>
  );
}

export default ContentPane;
