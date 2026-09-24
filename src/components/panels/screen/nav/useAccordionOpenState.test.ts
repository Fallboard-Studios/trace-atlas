import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccordionOpenState } from './useAccordionOpenState';

describe('useAccordionOpenState (manual, independent accordion open state — no auto-open/close from nav clicks or scrollspy)', () => {
  it('defaults to nothing open when no defaultOpenId is given', () => {
    const { result } = renderHook(() => useAccordionOpenState(null));
    expect(result.current.isOpen('a')).toBe(false);
    expect(result.current.isOpen('b')).toBe(false);
  });

  it('opens the given defaultOpenId on mount, and only that one', () => {
    const { result } = renderHook(() => useAccordionOpenState('a'));
    expect(result.current.isOpen('a')).toBe(true);
    expect(result.current.isOpen('b')).toBe(false);
  });

  it('setOpen(id, true) opens exactly that id, independent of any other', () => {
    const { result } = renderHook(() => useAccordionOpenState(null));

    act(() => result.current.setOpen('b', true));

    expect(result.current.isOpen('b')).toBe(true);
    expect(result.current.isOpen('a')).toBe(false);
  });

  it('opening a second id does NOT close a previously-open one — multiple can be open at once', () => {
    const { result } = renderHook(() => useAccordionOpenState('a'));

    act(() => result.current.setOpen('b', true));

    expect(result.current.isOpen('a')).toBe(true);
    expect(result.current.isOpen('b')).toBe(true);
  });

  it('setOpen(id, false) closes exactly that id, leaving others untouched', () => {
    const { result } = renderHook(() => useAccordionOpenState('a'));
    act(() => result.current.setOpen('b', true));

    act(() => result.current.setOpen('a', false));

    expect(result.current.isOpen('a')).toBe(false);
    expect(result.current.isOpen('b')).toBe(true);
  });

  it('closing every open id leaves the view with nothing open — "all closed" is a legal state now', () => {
    const { result } = renderHook(() => useAccordionOpenState('a'));

    act(() => result.current.setOpen('a', false));

    expect(result.current.isOpen('a')).toBe(false);
  });

  describe('resetKey — used when the same component instance switches entities (e.g. a different robot)', () => {
    it('resets back to the default-open id when resetKey changes', () => {
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) => useAccordionOpenState('a', resetKey),
        { initialProps: { resetKey: 'robot-1' } },
      );
      act(() => result.current.setOpen('b', true));
      expect(result.current.isOpen('b')).toBe(true);

      rerender({ resetKey: 'robot-2' });

      expect(result.current.isOpen('b')).toBe(false);
      expect(result.current.isOpen('a')).toBe(true);
    });

    it('does not reset on a re-render with the same resetKey', () => {
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) => useAccordionOpenState('a', resetKey),
        { initialProps: { resetKey: 'robot-1' } },
      );
      act(() => result.current.setOpen('b', true));

      rerender({ resetKey: 'robot-1' });

      expect(result.current.isOpen('b')).toBe(true);
    });

    it('with no resetKey provided, state is never reset by re-renders', () => {
      const { result, rerender } = renderHook(() => useAccordionOpenState('a'));
      act(() => result.current.setOpen('b', true));

      rerender();

      expect(result.current.isOpen('b')).toBe(true);
    });
  });
});
