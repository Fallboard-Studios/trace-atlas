import gsap from 'gsap';
import { setTimeline, killTimeline } from '@/animation/timelineMap';

/**
 * Coordinates "hide the view until nav-driven accordion opening + scrolling has settled, then fade
 * it in" (docs/specs/NAV_ACCORDION_SYNC.md follow-up) — switching into a different view via a nav
 * click masks its own accordion-pop/scroll jank behind an opacity-0 root, faded to 1 over 250ms only
 * once everything has visibly settled. Scoped to arriving from a genuinely different view: each
 * branch content component decides once, at its own first mount, whether to start hidden (a nav
 * click was already mid-flight targeting it — `accordionSync.hasPendingNavTargetFor`) — switching
 * robots/companies within an already-mounted view, or any other same-view accordion click, never
 * re-evaluates that decision and never re-hides an already-visible view.
 *
 * Single-slot, not a Map, mirroring `sectionRefs.ts`'s registry shape but scoped to one active view
 * at a time — only one branch content component is ever visible at once (ContentPane's own "render
 * nothing when nothing's selected" contract).
 */

const VIEW_FADE_TIMELINE_KEY = 'nav-view-fade-in';
const VIEW_FADE_DURATION = 0.25;

let viewRoot: HTMLElement | null = null;

/** Registers (or clears, with `null`) the current view's own root element. Called by each branch
 *  content component's own ref callback on mount/unmount. */
export function setViewFadeRoot(el: HTMLElement | null): void {
  viewRoot = el;
}

/** Fades the current view's root to opacity 1 over 250ms (instant under prefers-reduced-motion) —
 *  a safe no-op if nothing is registered, e.g. the view that requested this already unmounted
 *  before its own settle callback fired. Idempotent: fading an already-visible root is a harmless
 *  1→1 tween. */
export function fadeInView(): void {
  if (!viewRoot) return;
  killTimeline(VIEW_FADE_TIMELINE_KEY);
  const prefersReducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tl = gsap.timeline();
  tl.to(viewRoot, { opacity: 1, duration: prefersReducedMotion ? 0 : VIEW_FADE_DURATION, ease: 'power1.out' });
  setTimeline(VIEW_FADE_TIMELINE_KEY, tl);
}
