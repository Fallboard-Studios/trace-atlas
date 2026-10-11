import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps keyboard focus on the page when the element that had it is taken away. A pick can unmount its own
 * button (the entity list collapses, a breadcrumb ancestor turns into the current segment, a deleted
 * company's form goes with its screen), and the browser then drops focus on <body>, so a keyboard user
 * restarts from the top of the document (docs/specs/LAYOUT_REWORK.md §1.2).
 *
 * After each commit in which `trigger` changed, if the last element to take focus has left the document
 * and nothing else holds focus, the first element under `root` that matches one of `selectors` (tried in
 * order) takes it instead. Focus that is still on a live element, or that was never on one the page owns,
 * is left alone. `enabled` is false where another widget already hands focus back (the phone sheet's dialog).
 */
export function useRescueLostFocus(
  enabled: boolean,
  root: RefObject<HTMLElement | null>,
  selectors: readonly string[],
  trigger: string,
): void {
  const lastFocused = useRef<EventTarget | null>(null);

  useEffect(() => {
    const note = (event: FocusEvent) => {
      lastFocused.current = event.target;
    };
    document.addEventListener('focusin', note);
    return () => document.removeEventListener('focusin', note);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    const last = lastFocused.current;
    const removed = last instanceof Node && !last.isConnected;
    const active = document.activeElement;
    if (!removed || (active && active !== document.body)) return;
    lastFocused.current = null;
    for (const selector of selectors) {
      const target = root.current?.querySelector<HTMLElement>(selector);
      if (target) {
        target.focus();
        return;
      }
    }
    // `selectors` is a module constant at the call site; `trigger` is what says "something changed".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, trigger]);
}
