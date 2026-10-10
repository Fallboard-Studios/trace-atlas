import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useShell, NAV_PANEL_DOCK_MIN_WIDTH, SHELL_MIN_WIDTH } from './useShell';
import { useCabinetTier } from '@/components/ui/controls/useCabinetBoxHeight';

/**
 * A window.matchMedia that evaluates the query against a simulated viewport width, so the tests pin
 * the real boundary (the hook's own query string) rather than a canned `matches`. Supports the
 * `(min-width: Npx)` / `(max-width: Npx)` forms the app uses; a width change fires `change` only on
 * the lists whose result flipped, as a browser does.
 */
function stubViewport(initialWidth: number) {
  let width = initialWidth;
  const lists: { query: string; listeners: Set<() => void>; last: boolean }[] = [];

  function evaluate(query: string): boolean {
    const m = /\((min|max)-width:\s*(\d+)px\)/.exec(query);
    if (!m) throw new Error(`stubViewport: unsupported query ${query}`);
    const n = Number(m[2]);
    return m[1] === 'min' ? width >= n : width <= n;
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const entry = { query, listeners: new Set<() => void>(), last: evaluate(query) };
      lists.push(entry);
      return {
        get matches() {
          return evaluate(query);
        },
        media: query,
        addEventListener: (_: string, cb: () => void) => entry.listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => entry.listeners.delete(cb),
      };
    },
  });

  return {
    resize(next: number) {
      width = next;
      for (const entry of lists) {
        const now = evaluate(entry.query);
        if (now !== entry.last) {
          entry.last = now;
          entry.listeners.forEach((cb) => cb());
        }
      }
    },
    listenerCount: () => lists.reduce((sum, e) => sum + e.listeners.size, 0),
  };
}

const realMatchMedia = window.matchMedia;

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
});

describe('useShell', () => {
  it.each([
    [1600, 'desk'],
    [1024, 'desk'],
    [768, 'desk'],
    [767, 'phone'],
    [640, 'phone'],
    [375, 'phone'],
    [320, 'phone'],
  ] as const)('at %i px resolves %s', (width, shell) => {
    stubViewport(width);
    const { result } = renderHook(() => useShell());
    expect(result.current).toBe(shell);
  });

  it('splits at 768 px, the old nav dock width, and holds the phone shell down to 320 px', () => {
    expect(NAV_PANEL_DOCK_MIN_WIDTH).toBe(768);
    expect(SHELL_MIN_WIDTH).toBe(320);
  });

  it('updates on a change event, both ways across the boundary', () => {
    const viewport = stubViewport(1280);
    const { result } = renderHook(() => useShell());
    expect(result.current).toBe('desk');

    act(() => viewport.resize(NAV_PANEL_DOCK_MIN_WIDTH - 1));
    expect(result.current).toBe('phone');

    act(() => viewport.resize(NAV_PANEL_DOCK_MIN_WIDTH));
    expect(result.current).toBe('desk');
  });

  it('removes its listener on unmount', () => {
    const viewport = stubViewport(1280);
    const { unmount } = renderHook(() => useShell());
    expect(viewport.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(viewport.listenerCount()).toBe(0);
  });

  it("returns 'phone' when matchMedia is absent (tests, SSR)", () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: undefined });
    const { result } = renderHook(() => useShell());
    expect(result.current).toBe('phone');
  });

  it.each([
    [1600, 'desk', 'desktop'],
    [800, 'desk', 'tablet'],
    [700, 'phone', 'tablet'],
    [600, 'phone', 'mobile'],
  ] as const)('leaves the cabinet tier alone: at %i px the shell is %s and the tier %s', (width, shell, tier) => {
    stubViewport(width);
    const { result } = renderHook(() => ({ shell: useShell(), tier: useCabinetTier() }));
    expect(result.current).toEqual({ shell, tier });
  });
});
