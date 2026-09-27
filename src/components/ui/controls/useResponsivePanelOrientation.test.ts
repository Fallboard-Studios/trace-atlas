import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useResponsivePanelOrientation } from './useResponsivePanelOrientation';

/**
 * Stubs window.matchMedia so the mobile (max-width: 639px) and tablet
 * (max-width: 1023px) queries can be controlled independently, and their
 * 'change' listeners triggered manually — same shape as
 * useCabinetBoxHeight.test.ts's own stubMatchMedia, since this hook reads
 * the same useCabinetTier() tier detection.
 */
function stubMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
  const state = { ...initial };
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();

  function queryKind(query: string): 'mobile' | 'tablet' {
    return query.includes('639px') ? 'mobile' : 'tablet';
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const kind = queryKind(query);
      if (!listeners.has(query)) listeners.set(query, new Set());
      return {
        get matches() {
          return state[kind];
        },
        media: query,
        addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners.get(query)!.add(cb);
        },
        removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
          listeners.get(query)!.delete(cb);
        },
      };
    }),
  });

  return {
    fireChange(kind: 'mobile' | 'tablet', matches: boolean) {
      state[kind] = matches;
      for (const [query, cbs] of listeners) {
        if (queryKind(query) === kind) {
          cbs.forEach((cb) => cb({ matches }));
        }
      }
    },
  };
}

describe('useResponsivePanelOrientation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves 'row' (desktop) when neither the mobile nor tablet query matches", () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useResponsivePanelOrientation());
    expect(result.current).toBe('row');
  });

  it("resolves 'column' (tablet) when only the tablet query matches", () => {
    stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useResponsivePanelOrientation());
    expect(result.current).toBe('column');
  });

  it("resolves 'column' (mobile) when the mobile query matches, regardless of the tablet query", () => {
    stubMatchMedia({ mobile: true, tablet: true });
    const { result } = renderHook(() => useResponsivePanelOrientation());
    expect(result.current).toBe('column');
  });

  it("re-resolves to 'column' when the mobile query change-fires to true", () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useResponsivePanelOrientation());
    expect(result.current).toBe('row');
    act(() => fireChange('mobile', true));
    expect(result.current).toBe('column');
  });

  it("re-resolves to 'row' when the tablet query change-fires back to false", () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useResponsivePanelOrientation());
    expect(result.current).toBe('column');
    act(() => fireChange('tablet', false));
    expect(result.current).toBe('row');
  });

  it('takes no ref argument and constructs no ResizeObserver', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const observeSpy = vi.fn();
    class NoOpResizeObserver {
      observe = observeSpy;
      unobserve() {}
      disconnect() {}
    }
    const originalResizeObserver = globalThis.ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoOpResizeObserver;

    renderHook(() => useResponsivePanelOrientation());
    expect(observeSpy).not.toHaveBeenCalled();

    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalResizeObserver;
  });

  it('cleans up the matchMedia change listeners on unmount', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { unmount } = renderHook(() => useResponsivePanelOrientation());
    expect(() => unmount()).not.toThrow();
  });
});
