import { useNavTree } from './useNavTree';
import { useIsNavPanelSlideAway } from './useNavPanelSlideAway';
import './NavBreadcrumb.css';

/**
 * A passive "where am I" readout, outside NavTree itself (Crawford's own request — with 12
 * probes/companies plus 4 deep branches, it's easy to lose track of location without opening the
 * tree). Read-only, no click-to-navigate (a deliberate choice — NavPanel's own "Home" button
 * already covers jumping back to the top).
 *
 * Reads useNavTree()'s own selectedPath (the root-to-node ancestor chain of whichever node
 * currently satisfies isSelected — see that file's own findSelectedPath) rather than re-deriving
 * anything from raw uiStore fields itself, keeping id-parsing centralized in useNavTree.ts per its
 * own stated boundary. Renders nothing at the true blank/landing state (selectedPath === []) —
 * nothing to be lost in yet, and nothing here to say.
 *
 * Positioned via CSS: full-width along the bottom on mobile (NavPanel's own off-canvas
 * breakpoint), bottom-left once the nav is docked (desktop/tablet) — same breakpoint NavPanel
 * itself already uses (useIsNavPanelSlideAway), not a new one.
 */
export function NavBreadcrumb() {
  const { selectedPath } = useNavTree();
  const isMobile = useIsNavPanelSlideAway();

  if (selectedPath.length === 0) return null;

  const text = [...selectedPath.map((node) => node.humanLabel)].join(' / ');

  return (
    <div className={isMobile ? 'nav-breadcrumb nav-breadcrumb--mobile' : 'nav-breadcrumb nav-breadcrumb--desktop'} role="status">
      <span className="nav-breadcrumb__text">{text}</span>
    </div>
  );
}

export default NavBreadcrumb;
