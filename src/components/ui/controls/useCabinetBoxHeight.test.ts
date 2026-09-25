import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';

/**
 * Stubs window.matchMedia so the mobile (max-width: 640px) and tablet
 * (max-width: 1024px) queries can be controlled independently, and their
 * 'change' listeners triggered manually — generalizes AccordionContainer.
 * test.tsx's own single-query stubMatchMedia to 2 independent queries.
 */
function stubMatchMedia(initial: { mobile: boolean; tablet: boolean }) {
  const state = { ...initial };
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();

  function queryKind(query: string): 'mobile' | 'tablet' {
    return query.includes('640px') ? 'mobile' : 'tablet';
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

describe('useCabinetBoxHeight', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves 48 (desktop) when neither the mobile nor tablet query matches', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useCabinetBoxHeight());
    expect(result.current).toBe(48);
  });

  it('resolves 40 (tablet) when only the tablet query matches', () => {
    stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useCabinetBoxHeight());
    expect(result.current).toBe(40);
  });

  it('resolves 32 (mobile) when the mobile query matches, regardless of the tablet query', () => {
    stubMatchMedia({ mobile: true, tablet: true });
    const { result } = renderHook(() => useCabinetBoxHeight());
    expect(result.current).toBe(32);
  });

  it('re-resolves when the mobile query change-fires to true', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useCabinetBoxHeight());
    expect(result.current).toBe(48);
    act(() => fireChange('mobile', true));
    expect(result.current).toBe(32);
  });

  it('re-resolves when the tablet query change-fires back to false', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useCabinetBoxHeight());
    expect(result.current).toBe(40);
    act(() => fireChange('tablet', false));
    expect(result.current).toBe(48);
  });

  it('cleans up both change listeners on unmount', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { unmount } = renderHook(() => useCabinetBoxHeight());
    expect(() => unmount()).not.toThrow();
  });
});

describe('useVoxelTrackGap', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves 12 (desktop) when neither the mobile nor tablet query matches', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useVoxelTrackGap());
    expect(result.current).toBe(12);
  });

  it('resolves 10 (tablet) when only the tablet query matches', () => {
    stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useVoxelTrackGap());
    expect(result.current).toBe(10);
  });

  it('resolves 8 (mobile) when the mobile query matches, regardless of the tablet query', () => {
    stubMatchMedia({ mobile: true, tablet: true });
    const { result } = renderHook(() => useVoxelTrackGap());
    expect(result.current).toBe(8);
  });

  it('re-resolves when the mobile query change-fires to true', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => useVoxelTrackGap());
    expect(result.current).toBe(12);
    act(() => fireChange('mobile', true));
    expect(result.current).toBe(8);
  });

  it('re-resolves when the tablet query change-fires back to false', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: true });
    const { result } = renderHook(() => useVoxelTrackGap());
    expect(result.current).toBe(10);
    act(() => fireChange('tablet', false));
    expect(result.current).toBe(12);
  });

  it('cleans up both change listeners on unmount', () => {
    stubMatchMedia({ mobile: false, tablet: false });
    const { unmount } = renderHook(() => useVoxelTrackGap());
    expect(() => unmount()).not.toThrow();
  });
});

describe('useCabinetBoxHeight and useVoxelTrackGap share tier resolution', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('cross from desktop to mobile at the exact same stubbed condition', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => ({
      height: useCabinetBoxHeight(),
      gap: useVoxelTrackGap(),
    }));
    expect(result.current).toEqual({ height: 48, gap: 12 });
    act(() => fireChange('mobile', true));
    expect(result.current).toEqual({ height: 32, gap: 8 });
  });

  it('cross from desktop to tablet at the exact same stubbed condition', () => {
    const { fireChange } = stubMatchMedia({ mobile: false, tablet: false });
    const { result } = renderHook(() => ({
      height: useCabinetBoxHeight(),
      gap: useVoxelTrackGap(),
    }));
    expect(result.current).toEqual({ height: 48, gap: 12 });
    act(() => fireChange('tablet', true));
    expect(result.current).toEqual({ height: 40, gap: 10 });
  });

  it('cross back from mobile to desktop at the exact same stubbed condition', () => {
    const { fireChange } = stubMatchMedia({ mobile: true, tablet: true });
    const { result } = renderHook(() => ({
      height: useCabinetBoxHeight(),
      gap: useVoxelTrackGap(),
    }));
    expect(result.current).toEqual({ height: 32, gap: 8 });
    act(() => fireChange('mobile', false));
    expect(result.current).toEqual({ height: 40, gap: 10 });
  });
});
