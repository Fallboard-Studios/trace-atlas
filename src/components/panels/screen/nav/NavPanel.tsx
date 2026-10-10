import { useEffect, useRef } from 'react';
import gsap from 'gsap';

import { NavBox } from './NavBox';
import { NavEntityList } from './NavEntityList';
import { pressBranchBox, branchOfTile, branchContent, expandsInPlace, type NavBranch } from './navActions';
import { useShell } from '../useShell';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { useUIStore } from '@/stores/uiStore';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import { getScreenViewportDomNode } from '@/utils/helpers';
import { prefersReducedMotion } from '@/utils/reducedMotion';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';
import { labels } from '@/content';
import './NavPanel.css';

const WIDTH_TIMELINE_KEY = 'nav-panel-width';
/** The 0–1 factor NavPanel.css turns into --nav-panel-width on #screen-viewport. */
const EXPAND_PROPERTY = '--nav-panel-expand';
const WIDEN_DURATION = 0.25;

const NAV_LABEL = labels('nav.toggle').humanLabel;

/** The five parent boxes in the sketch's order, each in its branch's trait (the tree's, the Deck in
 *  the header's teal as the sketch draws it). */
const PARENT_BOXES = (
  [
    ['deck', 'header'],
    ['fleetParams', 'spectral'],
    ['probes', 'output'],
    ['companies', 'company'],
    ['settings', 'seed'],
  ] as const satisfies readonly (readonly [NavBranch, Trait])[]
).map(([branch, trait]) => ({ branch, ...labels(branchContent(branch)), accentStyle: getTraitColorStyle(trait) }));

/**
 * Widens the panel while its branch lists entities. The width lives in NavPanel.css as
 * `--nav-panel-width` on #screen-viewport, derived from the rest / wide sizes and an expand factor;
 * this tweens the factor in a timelineMap timeline, so the panel and the content edge (ContentPane,
 * Task 7) move together. The first value is set at once — nothing slides open on mount — and so is
 * every change under reduced motion.
 */
function useNavPanelWidth(wide: boolean): void {
  const appliedRef = useRef<boolean | null>(null);

  useEffect(() => {
    const viewport = getScreenViewportDomNode();
    if (!viewport) return;
    const previous = appliedRef.current;
    if (previous === wide) return;
    appliedRef.current = wide;
    const value = wide ? 1 : 0;
    killTimeline(WIDTH_TIMELINE_KEY);
    if (previous === null || prefersReducedMotion()) {
      gsap.set(viewport, { [EXPAND_PROPERTY]: value });
      return;
    }
    const tl = gsap.timeline();
    tl.to(viewport, { [EXPAND_PROPERTY]: value, duration: WIDEN_DURATION, ease: 'power2.out' });
    setTimeline(WIDTH_TIMELINE_KEY, tl);
  }, [wide]);

  useEffect(
    () => () => {
      killTimeline(WIDTH_TIMELINE_KEY);
      getScreenViewportDomNode()?.style.removeProperty(EXPAND_PROPERTY);
      appliedRef.current = null;
    },
    [],
  );
}

/**
 * The one nav panel (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 4): five parent
 * boxes in the panel's static popped facade, the open branch's box out. Probes and Companies expand in
 * place — their entities list under the box and the panel widens — while `expandedTopLevelBranch` is
 * that branch; pressing the box on its own page collapses or reopens the list (navActions.pressBranchBox).
 * Every pick goes through navActions.
 *
 * Phone shell, until the sheet (Task 5): the same panel, shown only while `isNavPanelOpen`.
 */
export function NavPanel() {
  const shell = useShell();
  const isNavPanelOpen = useUIStore((s) => s.isNavPanelOpen);
  const active = branchOfTile(useUIStore((s) => s.activeHubTile));
  const expandedBranch = useUIStore((s) => s.expandedTopLevelBranch);
  useNavPanelWidth(expandsInPlace(active) && expandedBranch === active);

  if (shell === 'phone' && !isNavPanelOpen) return null;

  return (
    <nav className="nav-panel" aria-label={NAV_LABEL}>
      <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-nav-panel-facade">
        <ul className="nav-panel__boxes">
          {PARENT_BOXES.map(({ branch, loreLabel, humanLabel, accentStyle }) => {
            const listOpen = branch === active && expandedBranch === branch;
            return (
              <li key={branch} style={accentStyle}>
                <NavBox
                  id={branch}
                  loreLabel={loreLabel}
                  humanLabel={humanLabel}
                  current={branch === active}
                  expanded={expandsInPlace(branch) ? listOpen : undefined}
                  onClick={() => pressBranchBox(branch)}
                />
                {listOpen && expandsInPlace(branch) && <NavEntityList branch={branch} />}
              </li>
            );
          })}
        </ul>
      </CabinetBox>
    </nav>
  );
}

export default NavPanel;
