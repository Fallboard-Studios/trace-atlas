import { useEffect } from 'react';

import { back } from './navActions';
import { useUIStore } from '@/stores/uiStore';

/**
 * The browser's Back button walks the trail (docs/specs/NAVIGATION_CLOSE_AND_BACK.md §1.6, §4, §7.1 C1–C3). The app
 * rests on one guard history entry, marked `{ traceAtlasNav: 'guard' }`; a press lands on the entry behind it.
 */

/** The marker's key in `history.state`. Only the guard carries it. */
const NAV_MARK = 'traceAtlasNav';

function isGuard(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[NAV_MARK] === 'guard';
}

/** A history call, with a throw (a sandboxed frame) ignored, as the two address writers do. */
function tryHistory(call: () => void): void {
  try {
    call();
  } catch {
    // Not fatal: the on-screen Back still works.
  }
}

/** A press (spec §4). On the guard (our own forward(), or the Forward button): nothing. With nothing to step (the
 *  power off, §7.2 Q1, or the trail empty): history.back() passes the press on, and it leaves the app. Else one
 *  back() step, and history.forward() returns to the guard, where the live address is. */
function onPopState(event: PopStateEvent): void {
  if (isGuard(event.state)) return;
  const { isPoweredOn, navTrail } = useUIStore.getState();
  if (!isPoweredOn || navTrail.length === 0) {
    tryHistory(() => window.history.back());
    return;
  }
  back();
  tryHistory(() => window.history.forward());
}

/** Mounted once, in ScreenViewport, in both power states, so a press on the off screen reaches the handler. A no-op
 *  outside a browser. */
export function useBrowserBack(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
