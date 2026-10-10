import { breadcrumbTrail } from './navActions';
import { useEntityRoster } from './useEntityRoster';
import { useShell } from '../useShell';
import { useUIStore } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import { CONTENT } from '@/content';
import './NavBreadcrumb.css';

// The Deck's colour, the header trait, as the meta box and the phone bar wear it.
const CRUMB_ACCENT = getTraitColorStyle('header');

interface NavBreadcrumbProps {
  /** PhoneBar's well: inline text inside the bar's own well, on the phone shell. */
  inBar?: boolean;
}

/**
 * A "where am I" readout (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 8):
 * `Root / <branch> / <entity> / <section>`, from navActions.breadcrumbTrail — the one place the path is
 * derived. Every ancestor is a button calling the navActions the trail names (Root → goHome, the branch
 * → selectBranch, the entity → selectEntity); the last segment is the current view, plain text. Renders
 * nothing on the Deck: nothing to be lost in yet.
 *
 * Desk: a well at the content surface's bottom-left corner, in the band the surface keeps free for it
 * (NavBreadcrumb.css). Phone: PhoneBar's well carries it (`inBar`); on its own it renders nothing there.
 *
 * Entity names come from useEntityRoster's narrow slice, so a battery tick does not re-render it.
 */
export function NavBreadcrumb({ inBar = false }: NavBreadcrumbProps) {
  const shell = useShell();
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const allProbesSelected = useUIStore((s) => s.allProbesSelected);
  const selectedSection = useUIStore((s) => s.selectedSection);
  const fleetParamsSection = useUIStore((s) => s.fleetParamsSection);
  const fleetParamsSubsection = useUIStore((s) => s.fleetParamsSubsection);
  const selectedSettingsLeaf = useUIStore((s) => s.selectedSettingsLeaf);
  const robots = useEntityRoster('robots');
  const companies = useEntityRoster('companies');

  if (!inBar && shell !== 'desk') return null;

  const trail = breadcrumbTrail(
    { activeHubTile, selectedRobotId, selectedCompanyId, allProbesSelected, selectedSection, fleetParamsSection, fleetParamsSubsection, selectedSettingsLeaf },
    { robots, companies },
  );
  if (trail.length === 0) return null;

  return (
    <div className={inBar ? 'nav-breadcrumb nav-breadcrumb--bar' : 'nav-breadcrumb'} style={CRUMB_ACCENT} role="navigation" aria-label={CONTENT['nav.breadcrumb'].human}>
      {trail.map((segment, i) => {
        const current = i === trail.length - 1;
        return (
          <span key={i} className="nav-breadcrumb__crumb">
            {i > 0 && <span className="nav-breadcrumb__sep" aria-hidden="true"> / </span>}
            {!current && segment.go ? (
              <button type="button" className="nav-breadcrumb__segment nav-breadcrumb__segment--link" onClick={segment.go}>
                {segment.label}
              </button>
            ) : (
              <span className="nav-breadcrumb__segment" aria-current={current ? 'page' : undefined}>
                {segment.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default NavBreadcrumb;
