/**
 * Expand/collapse timing for AccordionContainer, resolving docs/tasks/
 * ARCHITECTURE_AND_COMPONENTS_PLAN.md Task 13. Respects
 * `prefers-reduced-motion` the same way PowerRockerSwitch.css does — the
 * section still opens/closes, but the transition snaps instead of animating.
 */

export const ACCORDION_DURATION = 0.25;

/** Content fade duration — deliberately shorter than ACCORDION_DURATION and
 * sequenced (never simultaneous) with the height tween in
 * AccordionContainer.tsx's animateTo(): height first then fade in on open,
 * fade out then height on close, so the content is never visible while it's
 * still overlapping a sibling section that hasn't finished making room (or
 * losing room) for it. */
export const ACCORDION_FADE_DURATION = 0.15;

/** How many GSAP ticks a first open will wait for the freshly-mounted content to stop changing height before it
 * animates anyway (AccordionContainer.tsx's first-open start). The controls inside a just-mounted section do a second
 * wave of work after their first paint (ResizeObservers measure, box counts re-fit), so its height is still growing for a
 * few frames; starting the height tween before that lets its clock burn through the heavy frames. A cap, not a target —
 * it only matters if a section never settles. docs/specs/ACCORDION_LAZY_MOUNT.md, smoothness pass. */
export const FIRST_OPEN_MAX_SETTLE_TICKS = 8;

export function getAccordionDuration(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : ACCORDION_DURATION;
}

export function getAccordionFadeDuration(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 0 : ACCORDION_FADE_DURATION;
}
