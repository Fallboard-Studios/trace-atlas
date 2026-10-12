import { NavBreadcrumb } from './nav/NavBreadcrumb';
import { WorldLine } from './worldView/MetaBox';
import { Toggle, CABINET_TOGGLE_BOX_SIZE } from '@/components/ui/controls/Toggle';
import { ToggleFacade } from '@/components/ui/controls/ToggleFacade';
import { useUIStore } from '@/stores/uiStore';
import type { ToggleSchema } from '@/types/controls';
import { labels } from '@/content';
import './PhoneBar.css';

// NavToggleButton's control, moved into the bar: one fixed name from content, the open state in the
// switch's own aria-checked.
const MENU_SCHEMA: ToggleSchema = { id: 'phoneBarMenu', type: 'toggle', ...labels('nav.toggle') };
const MENU_OPEN_HINT = labels('ui.phoneBar.menuOpen').humanLabel;

/**
 * The phone shell's menu (docs/specs/LAYOUT_REWORK.md §1.1; docs/tasks/LAYOUT_REWORK.md Task 5): the
 * Toggle that opens the nav sheet (NavPanel's Dialog, open flag `isNavPanelOpen`). It began as the left
 * half of a 56 px bottom bar; on 2026-10-11 the bar moved up into the header's band (Header.tsx), where
 * this is the first box of the controls row, left of mute. While the sheet is open the menu is outside
 * the modal, so a tap on it, its ✕ included, is a tap outside and closes the sheet.
 *
 * Header mounts it on the phone shell only; this component does not check the shell itself.
 */
export function PhoneMenu() {
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);

  return (
    <Toggle schema={MENU_SCHEMA} value={isOpen} onChange={setNavPanelOpen} boxSize={CABINET_TOGGLE_BOX_SIZE}>
      {/* ☰ and ✕ differ in width; the facade holds the larger, so the box never resizes. */}
      <ToggleFacade value={isOpen} off="☰" on="✕" />
    </Toggle>
  );
}

/**
 * The phone shell's well, the header band's second line: it says how to close the sheet while it is
 * open; shut, it is the phone's meta box on the Deck (the world line) and its breadcrumb on every other
 * view, whose ancestors work from here as on the desk (Task 8). The well's look is Header.css's
 * (`.header__well`); Header mounts it on the phone shell only.
 */
export function PhoneWell() {
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  // The breadcrumb's path is empty exactly on the Deck (navActions.breadcrumbTrail).
  const onDeck = useUIStore((s) => s.activeHubTile === null);

  return <div className="header__well">{isOpen ? MENU_OPEN_HINT : onDeck ? <WorldLine /> : <NavBreadcrumb inBar />}</div>;
}
