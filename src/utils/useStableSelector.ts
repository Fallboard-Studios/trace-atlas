import { useRef } from 'react';

/**
 * A store selector that hands back the previous value while `equal` says nothing changed. Zustand 5 takes
 * no equality argument, and a selector that builds a new array or object every call (a narrow projection
 * of the robots, say) would re-render its reader on every write to the store — `updateRobot` replaces
 * the robots array on each battery tick and swell. Returning the previous reference makes the reader
 * re-render only when the projection actually differs.
 *
 * `useStore` is the bound store hook (`useLocaleStore`); `select` may close over render-time values.
 */
export function useStableSelector<S, T>(
  useStore: <U>(selector: (state: S) => U) => U,
  select: (state: S) => T,
  equal: (previous: T, next: T) => boolean,
): T {
  const previous = useRef<{ value: T } | null>(null);
  return useStore((state) => {
    const next = select(state);
    if (previous.current && equal(previous.current.value, next)) return previous.current.value;
    previous.current = { value: next };
    return next;
  });
}
