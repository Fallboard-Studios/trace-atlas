import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import gsap from 'gsap';

import { NavBox } from './NavBox';
import { NavEntityList } from './NavEntityList';
import { useRescueLostFocus } from './useRescueLostFocus';
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
/** Where focus goes when a pick takes its own button away: the box for where you now are, else the first. */
const FOCUS_RESCUE_TARGETS = ['.nav-box[aria-current="true"]', '.nav-box'] as const;

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
 * Phone shell (Task 5): the same panel in a sheet — a modal Radix Dialog whose open flag is
 * `isNavPanelOpen`, opened by PhoneBar's menu, with a scrim, a focus trap and Escape. It is not in the
 * DOM while shut. A pick closes it (navActions); collapsing a list or opening + New Company's form does
 * not. No Dialog.Portal: the sheet renders in place, inside ScreenViewport, never out on <body> (the
 * UI Shell guardrail, CLAUDE.md), and Radix's focus scope hands focus back to the menu on close.
 */
export function NavPanel() {
  const shell = useShell();
  const isNavPanelOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);
  /** What had focus when the sheet opened — PhoneBar's menu, as a rule. */
  const openerRef = useRef<HTMLElement | null>(null);
  const active = branchOfTile(useUIStore((s) => s.activeHubTile));
  const expandedBranch = useUIStore((s) => s.expandedTopLevelBranch);
  const selectionKey = useUIStore((s) => `${s.selectedRobotId}|${s.selectedCompanyId}|${s.allProbesSelected}`);
  const panelRef = useRef<HTMLElement>(null);
  // Desk only: the phone sheet's dialog already hands focus back to its opener.
  useRescueLostFocus(shell === 'desk', panelRef, FOCUS_RESCUE_TARGETS, `${active}|${expandedBranch}|${selectionKey}`);
  useNavPanelWidth(expandsInPlace(active) && expandedBranch === active);

  const panel = (
    <nav ref={panelRef} className="nav-panel" aria-label={NAV_LABEL}>
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

  if (shell === 'desk') return panel;

  return (
    <Dialog.Root open={isNavPanelOpen} onOpenChange={setNavPanelOpen}>
      <Dialog.Overlay className="nav-sheet__scrim" />
      {/* No description: the sheet is the nav itself, its boxes say what they are. A modal Radix
          Dialog hands focus back only to its own Dialog.Trigger, and the menu is PhoneBar's, so the
          sheet notes what had focus as it opens and returns it on close. */}
      <Dialog.Content
        className="nav-sheet"
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // An opener that has left the document (the shell switched to desk) takes no focus.
          openerRef.current?.focus();
          openerRef.current = null;
        }}
      >
        <VisuallyHidden asChild>
          <Dialog.Title>{NAV_LABEL}</Dialog.Title>
        </VisuallyHidden>
        {panel}
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default NavPanel;
