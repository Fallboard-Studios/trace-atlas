import { useShell } from './useShell';
import { NavBreadcrumb } from './nav/NavBreadcrumb';
import { WorldLine } from './worldView/MetaBox';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { Toggle, CABINET_TOGGLE_BOX_SIZE } from '@/components/ui/controls/Toggle';
import { ToggleFacade } from '@/components/ui/controls/ToggleFacade';
import { useUIStore } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { ToggleSchema } from '@/types/controls';
import { labels } from '@/content';
import './PhoneBar.css';

// NavToggleButton's control, moved into the bar: one fixed name from content, the open state in the
// switch's own aria-checked.
const MENU_SCHEMA: ToggleSchema = { id: 'phoneBarMenu', type: 'toggle', ...labels('nav.toggle') };
const MENU_OPEN_HINT = labels('ui.phoneBar.menuOpen').humanLabel;
// The sketch draws the bar in the Deck's colour, the header trait.
const BAR_ACCENT = getTraitColorStyle('header');

/**
 * The phone shell's bottom bar (docs/specs/LAYOUT_REWORK.md §1.1; docs/tasks/LAYOUT_REWORK.md Task 5):
 * the menu that opens the nav sheet (NavPanel's Dialog, open flag `isNavPanelOpen`) and a well beside
 * it. It replaces NavToggleButton's floating hamburger. The well says how to close the sheet while it
 * is open; shut, it is the phone's meta box on the Deck (the world line) and its breadcrumb on every
 * other view, whose ancestors work from here as on the desk (Task 8). The bar owns its band
 * (`--phone-bar-height`, PhoneBar.css): the sheet stops above it. While the sheet is open the bar is
 * outside the modal, so a tap on it, the menu's ✕ included, is a tap outside and closes the sheet.
 *
 * Renders nothing on the desk shell.
 */
export function PhoneBar() {
  const shell = useShell();
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);
  // The breadcrumb's path is empty exactly on the Deck (navActions.breadcrumbTrail).
  const onDeck = useUIStore((s) => s.activeHubTile === null);

  if (shell !== 'phone') return null;

  return (
    <div className="phone-bar" style={BAR_ACCENT}>
      {/* The static popped facade every panel keeps (popped + skipMountAnimation + autoHeight). */}
      <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-phone-bar-facade">
        <div className="phone-bar__row">
          <div className="phone-bar__menu">
            <Toggle schema={MENU_SCHEMA} value={isOpen} onChange={setNavPanelOpen} boxSize={CABINET_TOGGLE_BOX_SIZE}>
              {/* ☰ and ✕ differ in width; the facade holds the larger, so the box never resizes. */}
              <ToggleFacade value={isOpen} off="☰" on="✕" />
            </Toggle>
          </div>
          <div className="phone-bar__well">{isOpen ? MENU_OPEN_HINT : onDeck ? <WorldLine /> : <NavBreadcrumb inBar />}</div>
        </div>
      </CabinetBox>
    </div>
  );
}

export default PhoneBar;
