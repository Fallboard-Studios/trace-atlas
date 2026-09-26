/**
 * Scroll-anchor registry for the nav panel's view/accordion/scroll model
 * (docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md §1.6/§7 Q3) — mirrors
 * src/utils/refs.ts's setRef/getRef shape, but scoped to content-pane
 * section anchors (HTMLElement) instead of top-level SVG refs, and to
 * animation/timelineMap.ts's Map-keyed-by-id precedent. A section registers
 * itself here via a ref callback and deregisters on unmount; a nav click
 * looks the anchor up to scroll to it.
 */

// ========================================
// STATE
// ========================================
const sectionRefs = new Map<string, HTMLElement>();

// ========================================
// EXPORTS
// ========================================

/** Store a section's scroll anchor, replacing any stale entry under the same id. */
export function setSectionRef(id: string, element: HTMLElement): void {
  sectionRefs.set(id, element);
}

/** Retrieve a section's scroll anchor. Returns undefined if not registered. */
export function getSectionRef(id: string): HTMLElement | undefined {
  return sectionRefs.get(id);
}

/** Remove a section's own entry — a ref callback's cleanup, so an unmounted section never leaks
 *  a stale element across a robot/company switch. Safe to call for an id that was never registered. */
export function clearSectionRef(id: string): void {
  sectionRefs.delete(id);
}

/** Instant jump to a section's anchor — never a GSAP tween (spec §1.6: this isn't animation, so
 *  CLAUDE.md's GSAP-for-animation rule doesn't apply). A no-op, not a throw, when the section
 *  hasn't lazy-mounted its anchor yet, so a click on unmounted content never crashes. */
export function scrollToSection(id: string): void {
  const el = sectionRefs.get(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'auto', block: 'start' });
}

/** `scrollToSection`, plus a corrective re-scroll once layout has actually settled, then `onDone`
 *  (found live: the initial scroll routinely landed short of the target, or drifted away from it
 *  entirely). Root cause — the section a nav click scrolls to is very often un-approached at that
 *  exact moment (`useSectionObserver`'s lazy-mount gate never had a reason to fire before the
 *  target was ever scrolled near), so the FIRST scroll positions the page against a still-mostly-
 *  empty placeholder. The real content mounts only once the IntersectionObserver's own callback
 *  fires — asynchronously, on the browser's own schedule, not synchronously with the scroll call —
 *  growing/shrinking the page around the target afterward and leaving the initial scroll stale.
 *
 * Two nested `requestAnimationFrame` calls (not a loop, not musical timing — CLAUDE.md's
 * timer/rAF guardrail doesn't apply here) wait through at least one full layout+paint cycle, which
 * is reliably enough time for that intersection callback and the resulting React re-render to have
 * already happened, before re-measuring and correcting the scroll position. `onDone` (typically
 * `fadeInView`) is called only after this correction, not before — otherwise the view would reveal
 * itself mid-shift instead of after it. */
export function scrollToSectionSettled(id: string, onDone?: () => void): void {
  scrollToSection(id);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToSection(id);
      onDone?.();
    });
  });
}
