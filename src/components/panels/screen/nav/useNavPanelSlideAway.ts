import { useSyncExternalStore } from 'react';

/**
 * NavPanel's own dock breakpoint — deliberately independent of the shared Cabinet tier
 * (useCabinetTier, useCabinetBoxHeight.ts, 639px) even though NavPanel originally reused that
 * value. That tier also sizes CabinetBox height and voxel-track gap everywhere else in the app,
 * so widening it just to keep the nav panel's slide-off behavior longer would widen those too.
 * A single min-width query (mobile-first, matching this codebase's CSS convention — see
 * Header.css/NavPanel.css's own `@media (min-width: ...)` tiers) rather than a max-width
 * counterpart: two numbers a pixel apart (e.g. 767/768) invite an off-by-one gap or overlap
 * between "still slid-away" and "now docked". One threshold, inverted for the slide-away read,
 * can't drift out of sync with itself. See docs/specs/NAV_LAYOUT_REWRITE.md.
 */
export const NAV_PANEL_DOCK_MIN_WIDTH = 768;

function resolveIsDocked(): boolean {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(`(min-width: ${NAV_PANEL_DOCK_MIN_WIDTH}px)`).matches;
}

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(`(min-width: ${NAV_PANEL_DOCK_MIN_WIDTH}px)`);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Live: true below NavPanel's own dock breakpoint (NAV_PANEL_DOCK_MIN_WIDTH). */
export function useIsNavPanelSlideAway(): boolean {
  return !useSyncExternalStore(subscribe, resolveIsDocked);
}
