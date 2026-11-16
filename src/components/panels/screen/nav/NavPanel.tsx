import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { NavBox } from './NavBox';
import { useRescueLostFocus } from './useRescueLostFocus';
import { selectBranch, branchOfTile, branchContent, type NavBranch } from './navActions';
import { useShell } from '../useShell';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { useUIStore } from '@/stores/uiStore';
import { getTraitColorStyle } from '@/utils/traitColors';
import type { Trait } from '@/types/traits';
import { labels } from '@/content';
import './NavPanel.css';

const NAV_LABEL = labels('nav.toggle').humanLabel;
/** Where focus goes when a pick takes its own button away: the box for where you now are, else the first. */
const FOCUS_RESCUE_TARGETS = ['.nav-box[aria-current="true"]', '.nav-box'] as const;

/** The three parent boxes in the sketch's order, each in its branch's trait (the tree's, the Deck in
 *  the header's teal as the sketch draws it). Settings left in docs/tasks/OFF_SCREEN_CONSOLE.md Task 14,
 *  Companies in Task 18. */
const PARENT_BOXES = (
  [
    ['deck', 'header'],
    ['fleetParams', 'spectral'],
    ['probes', 'output'],
  ] as const satisfies readonly (readonly [NavBranch, Trait])[]
).map(([branch, trait]) => ({ branch, ...labels(branchContent(branch)), accentStyle: getTraitColorStyle(trait) }));

/**
 * The one nav panel (docs/specs/LAYOUT_REWORK.md §1.2; docs/tasks/LAYOUT_REWORK.md Task 4): three parent
 * boxes in the panel's static popped facade, the open branch's box out. Each box is selectBranch, so it opens
 * its branch's own page and does nothing on that page. The rail has one width and lists no entities
 * (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.7): the Probes page's roster is where a robot or company is
 * picked. Every pick goes through navActions.
 *
 * Phone shell (Task 5): the same panel in a sheet — a modal Radix Dialog whose open flag is
 * `isNavPanelOpen`, opened by PhoneBar's menu, with a scrim, a focus trap and Escape. It is not in the
 * DOM while shut. A pick closes it (navActions). No Dialog.Portal: the sheet renders in place, inside ScreenViewport, never out on <body> (the
 * UI Shell guardrail, CLAUDE.md), and Radix's focus scope hands focus back to the menu on close.
 */
export function NavPanel() {
  const shell = useShell();
  const isNavPanelOpen = useUIStore((s) => s.isNavPanelOpen);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);
  /** What had focus when the sheet opened — PhoneBar's menu, as a rule. */
  const openerRef = useRef<HTMLElement | null>(null);
  const active = branchOfTile(useUIStore((s) => s.activeHubTile));
  const selectionKey = useUIStore((s) => `${s.selectedRobotId}|${s.selectedCompanyId}|${s.allProbesSelected}`);
  const panelRef = useRef<HTMLElement>(null);
  // Desk only: the phone sheet's dialog already hands focus back to its opener.
  useRescueLostFocus(shell === 'desk', panelRef, FOCUS_RESCUE_TARGETS, `${active}|${selectionKey}`);
  // The sheet's flag is the phone's; a rotation to the desk shell must not leave it set, or rotating back
  // reopens the modal sheet unprompted.
  useEffect(() => {
    if (shell === 'desk' && isNavPanelOpen) setNavPanelOpen(false);
  }, [shell, isNavPanelOpen, setNavPanelOpen]);

  const panel = (
    <nav ref={panelRef} className="nav-panel" aria-label={NAV_LABEL}>
      <CabinetBox popped skipMountAnimation autoHeight timelineKey="cabinet-nav-panel-facade">
        <ul className="nav-panel__boxes">
          {PARENT_BOXES.map(({ branch, loreLabel, humanLabel, accentStyle }) => (
            <li key={branch} style={accentStyle}>
              <NavBox
                id={branch}
                loreLabel={loreLabel}
                humanLabel={humanLabel}
                current={branch === active}
                onClick={() => selectBranch(branch)}
              />
            </li>
          ))}
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
