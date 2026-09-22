import { useCabinetTier } from '@/components/ui/controls/useCabinetBoxHeight';
import { useUIStore } from '@/stores/uiStore';
import './NavToggleButton.css';

/**
 * Persistent hamburger/reopen affordance for NavPanel's mobile slide-off (docs/specs/
 * NAV_LAYOUT_REWRITE.md Task 7) — renders only on the mobile Cabinet breakpoint tier;
 * tablet/desktop's permanently-docked NavPanel needs no reopen trigger at all, so this renders
 * nothing there rather than an inert button. Lives inside ScreenViewport as NavPanel's sibling
 * (never SleeveContainer, CLAUDE.md), reachable regardless of what ContentPane shows.
 */
export function NavToggleButton() {
  const tier = useCabinetTier();
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);

  if (tier !== 'mobile') return null;

  return (
    <button
      type="button"
      className="nav-toggle-button"
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
      onClick={() => setNavPanelOpen(!isOpen)}
    >
      <span aria-hidden="true">{isOpen ? '✕' : '☰'}</span>
    </button>
  );
}

export default NavToggleButton;
