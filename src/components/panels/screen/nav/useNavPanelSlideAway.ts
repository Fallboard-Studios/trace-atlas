import { useSyncExternalStore } from 'react';
import { NAV_PANEL_DOCK_MIN_WIDTH } from '../useShell';

/*
 * NavPanel's own dock breakpoint, NAV_PANEL_DOCK_MIN_WIDTH, now lives in useShell.ts (the layout
 * rework's one shell switch splits at the same width); this file goes with the tree in Task 9 of
 * docs/tasks/LAYOUT_REWORK.md. See docs/specs/NAV_LAYOUT_REWRITE.md for why it is a single
 * min-width query, independent of the cabinet tier.
 */

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
