import { useSyncExternalStore } from 'react';

import type { Shell } from '@/types/shell';

/**
 * The one shell switch (docs/specs/LAYOUT_REWORK.md Assumption 1): the desk shell — side panel, slim
 * header, breadcrumb well — from this width up; the phone shell — top bar, bottom bar, sheets — below.
 * The 640–767 band takes the phone shell with the larger cabinet tier. Moved here from
 * useNavPanelSlideAway.ts, whose slide-off panel was the first thing to split at this width.
 *
 * Deliberately independent of the cabinet tier (useCabinetTier, 639 px), which keeps sizing controls
 * and is not a shell switch. One min-width query, mobile-first, so there is no 767/768 pair to drift.
 */
export const NAV_PANEL_DOCK_MIN_WIDTH = 768;

/** The narrowest viewport the phone shell must hold (Crawford: "I do want to handle down to 320"). */
export const SHELL_MIN_WIDTH = 320;

export type { Shell } from '@/types/shell';

const DESK_QUERY = `(min-width: ${NAV_PANEL_DOCK_MIN_WIDTH}px)`;

function resolveShell(): Shell {
  if (typeof window.matchMedia !== 'function') return 'phone';
  return window.matchMedia(DESK_QUERY).matches ? 'desk' : 'phone';
}

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DESK_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/** Live: which shell the viewport is in. Everything that differs by shell reads this and nothing else. */
export function useShell(): Shell {
  return useSyncExternalStore(subscribe, resolveShell);
}
