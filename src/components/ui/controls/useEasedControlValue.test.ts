import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Local gsap mock exposing just enough of quickTo's real shape to drive deterministically:
// calling the returned retarget function invokes vars.onComplete synchronously (the shared
// project mock in vitest.setup.ts defers it to a microtask instead, which is realistic but
// awkward for these tests — a local override, same technique every other slider/LFO test file
// already uses for its own gsap mock).
let lastQuickToVars: { onUpdate?: () => void; onComplete?: () => void; duration?: number } | undefined;
const killTweensOf = vi.fn();
vi.mock('gsap', () => ({
  default: {
    quickTo: vi.fn((target: Record<string, number>, prop: string, vars?: { onUpdate?: () => void; onComplete?: () => void; duration?: number }) => {
      lastQuickToVars = vars;
      // Mimics real quickTo's eventual effect (mutating the target's own property) before
      // firing onComplete — the mock has no real animation loop, so this happens synchronously
      // rather than over `duration`.
      return vi.fn((value: number) => {
        target[prop] = value;
        vars?.onComplete?.();
      });
    }),
    killTweensOf: (...args: unknown[]) => killTweensOf(...args),
  },
}));

import gsap from 'gsap';
import { useEasedControlValue } from './useEasedControlValue';

describe('useEasedControlValue', () => {
  beforeEach(() => {
    lastQuickToVars = undefined;
    killTweensOf.mockClear();
    (gsap.quickTo as ReturnType<typeof vi.fn>).mockClear();
  });

  it('starts with displayValue equal to the initial value — no ease on mount', () => {
    const { result } = renderHook(() => useEasedControlValue(5));
    expect(result.current.displayValue).toBe(5);
    expect(gsap.quickTo).not.toHaveBeenCalled();
  });

  it('a drag/keyboard step (handleValueChange) applies instantly — no quickTo call, no ease', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEasedControlValue(5));

    act(() => result.current.handleValueChange(8, onChange));

    expect(result.current.displayValue).toBe(8);
    expect(onChange).toHaveBeenCalledWith(8);
    expect(gsap.quickTo).not.toHaveBeenCalled();
  });

  it('killTweensOf is called on a drag/keyboard step — interrupts any in-flight ease', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useEasedControlValue(5));

    act(() => result.current.handleValueChange(8, onChange));

    expect(killTweensOf).toHaveBeenCalledTimes(1);
  });

  it('a prop-driven (non-drag) value change eases via quickTo, not the instant handleValueChange path', () => {
    const { rerender } = renderHook(({ value }) => useEasedControlValue(value), {
      initialProps: { value: 5 },
    });

    rerender({ value: 20 });

    expect(gsap.quickTo).toHaveBeenCalledTimes(1);
    // The retarget call, not a fresh quickTo/tween per change — this mock's own retarget
    // function is what's exercised, confirmed by the "settles to the exact target value" test
    // below actually reaching 20 through it.
    expect((gsap.quickTo as ReturnType<typeof vi.fn>).mock.results[0].value).toHaveBeenCalledWith(20);
  });

  it('settles to the exact target value once the ease completes', () => {
    const { result, rerender } = renderHook(({ value }) => useEasedControlValue(value), {
      initialProps: { value: 5 },
    });

    rerender({ value: 20 });
    act(() => {
      // Fire the retarget function quickTo returned — simulates the tween reaching its target.
      (gsap.quickTo as ReturnType<typeof vi.fn>).mock.results[0].value(20);
    });

    expect(result.current.displayValue).toBe(20);
  });

  it('creates quickTo only once — a SECOND external change retargets the SAME tween rather than creating a new one (the whole point: no per-change timeline churn)', () => {
    const { rerender } = renderHook(({ value }) => useEasedControlValue(value), {
      initialProps: { value: 5 },
    });

    rerender({ value: 20 });
    rerender({ value: 35 });

    expect(gsap.quickTo).toHaveBeenCalledTimes(1);
  });

  it('re-rendering with the SAME value never calls quickTo (a genuine no-op)', () => {
    const { rerender } = renderHook(({ value }) => useEasedControlValue(value), {
      initialProps: { value: 5 },
    });

    rerender({ value: 5 });

    expect(gsap.quickTo).not.toHaveBeenCalled();
  });

  it('uses a 0 duration when the user prefers reduced motion', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    });

    const { rerender } = renderHook(({ value }) => useEasedControlValue(value), {
      initialProps: { value: 5 },
    });
    rerender({ value: 20 });

    expect(lastQuickToVars?.duration).toBe(0);

    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('kills the tween on unmount', () => {
    const { unmount } = renderHook(() => useEasedControlValue(5));
    unmount();
    expect(killTweensOf).toHaveBeenCalledTimes(1);
  });

  describe('swelling', () => {
    it('a prop-driven value change applies instantly (no quickTo call) when swelling is true', () => {
      const { result, rerender } = renderHook(
        ({ value, swelling }) => useEasedControlValue(value, swelling),
        { initialProps: { value: 5, swelling: true } },
      );

      rerender({ value: 20, swelling: true });

      expect(result.current.displayValue).toBe(20);
      expect(gsap.quickTo).not.toHaveBeenCalled();
    });

    it('kills any in-flight ease when a swelling change interrupts it', () => {
      const { rerender } = renderHook(
        ({ value, swelling }) => useEasedControlValue(value, swelling),
        { initialProps: { value: 5, swelling: false } },
      );

      rerender({ value: 20, swelling: false }); // starts an ease
      killTweensOf.mockClear();
      rerender({ value: 35, swelling: true }); // interrupts it, applies instantly instead

      expect(killTweensOf).toHaveBeenCalledTimes(1);
    });

    it('a later non-swelling change still eases normally after a swelling change', () => {
      const { rerender } = renderHook(
        ({ value, swelling }) => useEasedControlValue(value, swelling),
        { initialProps: { value: 5, swelling: true } },
      );

      rerender({ value: 20, swelling: true }); // instant, no quickTo
      rerender({ value: 35, swelling: false }); // swell ended — back to eased

      expect(gsap.quickTo).toHaveBeenCalledTimes(1);
      expect((gsap.quickTo as ReturnType<typeof vi.fn>).mock.results[0].value).toHaveBeenCalledWith(35);
    });
  });
});
