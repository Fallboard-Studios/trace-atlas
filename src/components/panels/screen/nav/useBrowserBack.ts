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

/** True while a press runs back(): the trail changes on the entry behind the guard, and no entry may be pushed from
 *  a popstate (spec §7.1 C2); the forward() that follows returns to the guard. */
let handlingPress = false;

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
  handlingPress = true;
  try {
    back();
  } finally {
    handlingPress = false;
  }
  tryHistory(() => window.history.forward());
}

/** The guard rule (spec §7.1 C1, C3): while the power is on and the trail is not empty, the current entry is a guard.
 *  When it is not, one entry is pushed with the marker merged into the existing state and the URL unchanged. Called
 *  synchronously from the store subscription, so the push runs inside the click or key press that made the step. */
function ensureGuard(): void {
  if (handlingPress) return;
  const { isPoweredOn, navTrail } = useUIStore.getState();
  if (!isPoweredOn || navTrail.length === 0) return;
  const current: unknown = window.history.state;
  if (isGuard(current)) return;
  const base = typeof current === 'object' && current !== null ? current : {};
  tryHistory(() => window.history.pushState({ ...base, [NAV_MARK]: 'guard' }, '', window.location.href));
}

/** Mounted once, in ScreenViewport, in both power states, so a press on the off screen reaches the handler. A no-op
 *  outside a browser. The guard is checked only when the trail or the power changes: those come from a gesture (a
 *  nav pick, the rocker), while other store writes (the clock) come from timers, and a push without a user
 *  activation makes Chrome skip the entry. */
export function useBrowserBack(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', onPopState);
    const unsubscribe = useUIStore.subscribe((state, prev) => {
      if (state.navTrail !== prev.navTrail || state.isPoweredOn !== prev.isPoweredOn) ensureGuard();
    });
    return () => {
      window.removeEventListener('popstate', onPopState);
      unsubscribe();
    };
  }, []);
}
