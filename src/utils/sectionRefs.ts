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
