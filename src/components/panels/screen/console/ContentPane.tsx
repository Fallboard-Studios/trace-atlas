import { ConsolePanel } from './ConsolePanel';
import { ScreenExitRow } from '../nav/ScreenExitRow';
import { useUIStore } from '@/stores/uiStore';
import './ContentPane.css';

/**
 * The single content area the nav opens into (repurposed from Console.tsx, spec §7 Q6,
 * docs/specs/archive/NAV_LAYOUT_REWRITE.md Task 8; the opaque content surface is docs/specs/LAYOUT_REWORK.md §1.3).
 * activeHubTile === null is the Deck, the landing state (nothing picked in the nav yet): it renders
 * nothing, so the world stays bright and clickable — Robot.tsx's own click handler relies on nothing
 * blocking WorldView at this state. (The Welcome accordion and intro card that used to sit here were
 * removed.) Once a tile is active, it renders the Back / Close row (ScreenExitRow,
 * docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.5) and, under it, the existing ConsolePanel/TILE_CONTENT dispatch. The
 * row is the screen's way out: Back to the screen before, Close to the deck. It sits outside ConsolePanel's
 * scroller, so it stays put while the screen scrolls under it.
 */
export function ContentPane() {
  const activeHubTile = useUIStore((s) => s.activeHubTile);

  if (activeHubTile === null) return null;

  return (
    <div className="content-pane">
      <ScreenExitRow />
      <ConsolePanel />
    </div>
  );
}

export default ContentPane;
