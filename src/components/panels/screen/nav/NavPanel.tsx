import { useEffect, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { NavTree } from './NavTree';
import { useCabinetTier } from '@/components/ui/controls/useCabinetBoxHeight';
import { useUIStore } from '@/stores/uiStore';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import './NavPanel.css';

const TIMELINE_KEY = 'nav-panel-slide';
// Matches ACCORDION_DURATION (accordionAnimation.ts) — no dedicated constant of its own since
// this is the only consumer so far; split out if a second one needs the same value.
const SLIDE_DURATION = 0.25;

/**
 * Docked (desktop/tablet) vs. slide-off (mobile) shell around NavTree (docs/specs/
 * NAV_LAYOUT_REWRITE.md §Task 6). Reuses the existing Oblique Cabinetry breakpoint tiers
 * (useCabinetTier, useCabinetBoxHeight.ts) rather than inventing a new breakpoint — 'mobile' is
 * the slide-off tier, 'tablet'/'desktop' are permanently docked and ignore isNavPanelOpen
 * entirely. The slide animates via a timelineMap-registered GSAP timeline, respecting
 * prefers-reduced-motion the same way AccordionContainer's getAccordionDuration does. Selecting
 * any node (a change to activeHubTile/selectedRobotId/selectedCompanyId/selectedSection) closes
 * the panel again, but only on mobile — desktop/tablet's docked panel stays open regardless.
 */
export function NavPanel() {
  const tier = useCabinetTier();
  const isMobile = tier === 'mobile';
  const isOpen = useUIStore((s) => s.isNavPanelOpen);
  const activeHubTile = useUIStore((s) => s.activeHubTile);
  const selectedRobotId = useUIStore((s) => s.selectedRobotId);
  const selectedCompanyId = useUIStore((s) => s.selectedCompanyId);
  const selectedSection = useUIStore((s) => s.selectedSection);
  const setNavPanelOpen = useUIStore((s) => s.setNavPanelOpen);

  const panelRef = useRef<HTMLDivElement>(null);
  const isFirstSelectionEffect = useRef(true);

  const { contextSafe } = useGSAP({ dependencies: [] });

  useEffect(() => () => killTimeline(TIMELINE_KEY), []);

  // Closes the panel on a real selection change, mobile only — never on mount (that would close
  // an already-open panel the instant it renders, before the user did anything).
  useEffect(() => {
    if (isFirstSelectionEffect.current) {
      isFirstSelectionEffect.current = false;
      return;
    }
    if (isMobile) setNavPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHubTile, selectedRobotId, selectedCompanyId, selectedSection]);

  const animateTo = contextSafe((open: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    killTimeline(TIMELINE_KEY);
    const prefersReducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReducedMotion ? 0 : SLIDE_DURATION;
    const tl = gsap.timeline();
    tl.to(el, { xPercent: open ? 0 : -100, duration, ease: 'power2.out' });
    setTimeline(TIMELINE_KEY, tl);
  });

  // Desktop/tablet ignores isNavPanelOpen and never animates — resets any transform a prior
  // mobile session left behind so the panel is unconditionally visible once docked.
  useEffect(() => {
    if (!isMobile) {
      const el = panelRef.current;
      killTimeline(TIMELINE_KEY);
      if (el) gsap.set(el, { xPercent: 0 });
      return;
    }
    animateTo(isOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMobile]);

  const open = !isMobile || isOpen;

  return (
    <div className="nav-panel" data-testid="nav-panel" data-open={open} ref={panelRef} inert={isMobile && !isOpen ? true : undefined}>
      <NavTree />
    </div>
  );
}

export default NavPanel;
