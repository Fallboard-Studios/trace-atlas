import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccordionOpenState } from './useAccordionOpenState';
import { isAccordionOpen, unregisterAccordion } from '@/utils/accordionSync';
import { useUIStore } from '@/stores/uiStore';

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

describe('useAccordionOpenState — accordionSync registration (docs/tasks/NAV_ACCORDION_SYNC.md Task 3)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    unregisterAccordion('probes.r1.melody.rhythm');
    useUIStore.setState({ expandedTopLevelBranch: null, expandedProbeId: null, expandedCompanyId: null });
  });

  it('registers defaultOpenId with accordionSync on mount', () => {
    renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });

  it('registers a previously-unregistered id when setOpen(id, true) is called', () => {
    const { result } = renderHook(() => useAccordionOpenState(null));

    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(true);
  });

  it('setOpen(id, false) is reflected in accordionSync', () => {
    const { result } = renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', false));

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
  });

  it('unmounting unregisters every id this instance registered', () => {
    const { result, unmount } = renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    unmount();

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(false);
  });

  it('setOpen(id, true) expands nav ancestors for that id via expandNavAncestorsForId', () => {
    const { result } = renderHook(() => useAccordionOpenState(null));

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', true));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
  });

  it('setOpen(id, false) does NOT touch nav ancestor expansion', () => {
    const { result } = renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));
    useUIStore.setState({ expandedTopLevelBranch: null, expandedProbeId: null });

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', false));

    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(useUIStore.getState().expandedProbeId).toBeNull();
  });
});

describe('useAccordionOpenState — openExclusive (docs/tasks/NAV_ACCORDION_SYNC.md Task 3)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    unregisterAccordion('probes.r1.melody.rhythm');
    useUIStore.setState({ expandedTopLevelBranch: null, expandedProbeId: null, expandedCompanyId: null });
  });

  it('with closeSiblings=false, behaves like setOpen(id, true) — no sibling closing', () => {
    const { result } = renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    act(() => result.current.openExclusive('probes.r1.volume.audioSettings', false));

    expect(result.current.isOpen('probes.r1.volume.audioSettings')).toBe(true);
    expect(result.current.isOpen('probes.r1.melody.rhythm')).toBe(true);
  });

  it('with closeSiblings=true, closes every other currently-open id and opens the target, in one state update', () => {
    const { result } = renderHook(() => useAccordionOpenState('probes.r1.volume.audioSettings'));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    act(() => result.current.openExclusive('probes.r1.volume.audioSettings', true));

    expect(result.current.isOpen('probes.r1.volume.audioSettings')).toBe(true);
    expect(result.current.isOpen('probes.r1.melody.rhythm')).toBe(false);
  });

  it('openExclusive also expands nav ancestors for the target id', () => {
    const { result } = renderHook(() => useAccordionOpenState(null));

    act(() => result.current.openExclusive('probes.r1.volume.audioSettings', true));

    expect(useUIStore.getState().expandedProbeId).toBe('r1');
  });
});

describe("useAccordionOpenState — resetKey leaves accordionSync reflecting only the current key's ids (docs/tasks/NAV_ACCORDION_SYNC.md Task 3)", () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    unregisterAccordion('probes.r1.melody.rhythm');
  });

  it('unregisters ids opened under the previous resetKey when it changes, while the default id re-registers under the new key', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) => useAccordionOpenState('probes.r1.volume.audioSettings', resetKey),
      { initialProps: { resetKey: 'r1' } },
    );
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));
    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(true);

    rerender({ resetKey: 'r2' });

    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(false);
    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });
});
