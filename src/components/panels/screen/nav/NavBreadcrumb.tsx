import { useNavTree, goHome } from './useNavTree';
import { useIsNavPanelSlideAway } from './useNavPanelSlideAway';
import { CONTENT } from '@/content';
import './NavBreadcrumb.css';

/**
 * A "where am I" readout, outside NavTree itself (Crawford's own request — with 12
 * probes/companies plus 4 deep branches, it's easy to lose track of location without opening the
 * tree). "Root" and, when present, the branch segment (Probes/Companies only — see below) are
 * real navigation links; every other segment is plain text.
 *
 * Reads useNavTree()'s own selectedPath (the root-to-node ancestor chain of whichever node
 * currently satisfies isSelected, already capped to breadcrumb depth — see that file's own
 * trimToBreadcrumbDepth) rather than re-deriving anything from raw uiStore fields itself, keeping
 * id-parsing centralized in useNavTree.ts per its own stated boundary. Renders nothing at the true
 * blank/landing state (selectedPath === []) — nothing to be lost in yet, and nothing here to say.
 *
 * Only the Probes/Companies branch segment is ever a link, not Fleet Params/Settings' own (the
 * only segment they ever show, per trimToBreadcrumbDepth) — those two are each one single
 * scrollable view no matter which group/leaf is open within them, so their own breadcrumb segment
 * already names "where you are," not somewhere else to go. A probe/company's own entity segment
 * (the deepest one shown) is likewise plain text for the same reason — it's the current view too.
 *
 * Positioned via CSS: full-width along the bottom on mobile (NavPanel's own off-canvas
 * breakpoint), bottom-left once the nav is docked (desktop/tablet) — same breakpoint NavPanel
 * itself already uses (useIsNavPanelSlideAway), not a new one.
 */
export function NavBreadcrumb() {
  const { selectedPath, select } = useNavTree();
  const isMobile = useIsNavPanelSlideAway();

  if (selectedPath.length === 0) return null;

  const branchId = selectedPath[0].id;
  const branchIsLink = branchId === 'probes' || branchId === 'companies';

  return (
    <div
      className={isMobile ? 'nav-breadcrumb nav-breadcrumb--mobile' : 'nav-breadcrumb nav-breadcrumb--desktop'}
      role="navigation"
      aria-label={CONTENT['nav.breadcrumb'].human}
    >
      {/* Inner wrapper carries the end-truncation ellipsis (nav-breadcrumb__inner) — the outer
         element stays a flex row purely to center/position this one line as a whole (mobile's
         justify-content: center), which doesn't compose with truncating a row of several
         separate button/span children directly. */}
      <div className="nav-breadcrumb__inner">
        <button type="button" className="nav-breadcrumb__segment nav-breadcrumb__segment--link" onClick={goHome}>
          Root
        </button>
        {selectedPath.map((node, i) => (
          <span key={node.id} className="nav-breadcrumb__crumb">
            <span className="nav-breadcrumb__sep" aria-hidden="true"> / </span>
            {i === 0 && branchIsLink ? (
              <button type="button" className="nav-breadcrumb__segment nav-breadcrumb__segment--link" onClick={() => select(node.id)}>
                {node.humanLabel}
              </button>
            ) : (
              <span className="nav-breadcrumb__segment">{node.humanLabel}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default NavBreadcrumb;
