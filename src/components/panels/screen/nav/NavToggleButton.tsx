import { useIsNavPanelSlideAway } from './useNavPanelSlideAway';
import { Toggle } from '@/components/ui/controls/Toggle';
import { ToggleFacade } from '@/components/ui/controls/ToggleFacade';
import { useUIStore } from '@/stores/uiStore';
import type { ToggleSchema } from '@/types/controls';
import { labels } from '@/content';
import './NavToggleButton.css';

// Static label ("Navigation"), not "Open navigation"/"Close navigation" —
// state is conveyed via the switch's own aria-checked, same precedent as
// Header's Mute Toggle (one fixed human label from content, never a Mute/Unmute pair).
const NAV_TOGGLE_SCHEMA: ToggleSchema = { id: 'navToggle', type: 'toggle', ...labels('nav.toggle') };

/**
 * Persistent hamburger/reopen affordance for NavPanel's slide-off state (docs/specs/
 * NAV_LAYOUT_REWRITE.md Task 7) — renders only below NAV_PANEL_DOCK_MIN_WIDTH
 * (useNavPanelSlideAway.ts, NavPanel's own breakpoint); the permanently-docked NavPanel at or
 * above it needs no reopen trigger at all, so this renders nothing there rather than an inert
 * button.
 * Lives inside ScreenViewport as NavPanel's sibling (never SleeveContainer, CLAUDE.md), reachable
 * regardless of what ContentPane shows.
 *
 * Renders through the shared `Toggle` primitive (an icon facade, ☰/✕ via ToggleFacade, which holds
 * the larger glyph's size — same `children`-replaces-DualLabel pattern Header's Mute Toggle uses)
 * rather than a bare `<button>`, so this control shares the same Oblique
 * Cabinetry facade, accessible-name resolution, and disabled/engaged
 * handling every other binary control in the app already gets.
 */
export function NavToggleButton() {
  const isSlideAway = useIsNavPanelSlideAway();
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);

  if (!isSlideAway) return null;

  return (
    <div className="nav-toggle-button">
      <Toggle schema={NAV_TOGGLE_SCHEMA} value={isOpen} onChange={setNavPanelOpen}>
        {/* ToggleFacade, not a bare glyph swap: ☰ and ✕ differ in width, and a control whose content
            changes holds the size of its largest content, so the button never resizes on a flip. */}
        <ToggleFacade value={isOpen} off="☰" on="✕" />
      </Toggle>
    </div>
  );
}

export default NavToggleButton;
