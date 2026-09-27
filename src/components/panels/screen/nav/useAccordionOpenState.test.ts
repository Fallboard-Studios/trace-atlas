import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccordionOpenState } from './useAccordionOpenState';
import { isAccordionOpen, unregisterAccordion, openAccordionFromNav, clearPendingNavTarget } from '@/utils/accordionSync';
import { useUIStore } from '@/stores/uiStore';

describe('useAccordionOpenState (manual, independent accordion open state — no auto-open/close from nav clicks or scrollspy)', () => {
  it('defaults to nothing open when no defaultOpenId is given', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a', 'b'], null));
    expect(result.current.isOpen('a')).toBe(false);
    expect(result.current.isOpen('b')).toBe(false);
  });

  it('opens the given defaultOpenId on mount, and only that one', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a', 'b'], 'a'));
    expect(result.current.isOpen('a')).toBe(true);
    expect(result.current.isOpen('b')).toBe(false);
  });

  it('setOpen(id, true) opens exactly that id, independent of any other', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a', 'b'], null));

    act(() => result.current.setOpen('b', true));

    expect(result.current.isOpen('b')).toBe(true);
    expect(result.current.isOpen('a')).toBe(false);
  });

  it('opening a second id does NOT close a previously-open one — multiple can be open at once', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a', 'b'], 'a'));

    act(() => result.current.setOpen('b', true));

    expect(result.current.isOpen('a')).toBe(true);
    expect(result.current.isOpen('b')).toBe(true);
  });

  it('setOpen(id, false) closes exactly that id, leaving others untouched', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a', 'b'], 'a'));
    act(() => result.current.setOpen('b', true));

    act(() => result.current.setOpen('a', false));

    expect(result.current.isOpen('a')).toBe(false);
    expect(result.current.isOpen('b')).toBe(true);
  });

  it('closing every open id leaves the view with nothing open — "all closed" is a legal state now', () => {
    const { result } = renderHook(() => useAccordionOpenState(['a'], 'a'));

    act(() => result.current.setOpen('a', false));

    expect(result.current.isOpen('a')).toBe(false);
  });

  describe('resetKey — used when the same component instance switches entities (e.g. a different robot)', () => {
    it('resets back to the default-open id when resetKey changes', () => {
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) => useAccordionOpenState(['a', 'b'], 'a', resetKey),
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
        ({ resetKey }: { resetKey: string }) => useAccordionOpenState(['a', 'b'], 'a', resetKey),
        { initialProps: { resetKey: 'robot-1' } },
      );
      act(() => result.current.setOpen('b', true));

      rerender({ resetKey: 'robot-1' });

      expect(result.current.isOpen('b')).toBe(true);
    });

    it('with no resetKey provided, state is never reset by re-renders', () => {
      const { result, rerender } = renderHook(() => useAccordionOpenState(['a', 'b'], 'a'));
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
    renderHook(() => useAccordionOpenState(['probes.r1.volume.audioSettings'], 'probes.r1.volume.audioSettings'));

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });

  it('registers a previously-unregistered id when setOpen(id, true) is called', () => {
    const { result } = renderHook(() => useAccordionOpenState(['probes.r1.melody.rhythm'], null));

    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(true);
  });

  it('setOpen(id, false) is reflected in accordionSync', () => {
    const { result } = renderHook(() => useAccordionOpenState(['probes.r1.volume.audioSettings'], 'probes.r1.volume.audioSettings'));

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', false));

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
  });

  it('unmounting unregisters every id this instance registered', () => {
    const { result, unmount } = renderHook(() => useAccordionOpenState(
      ['probes.r1.volume.audioSettings', 'probes.r1.melody.rhythm'],
      'probes.r1.volume.audioSettings',
    ));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    unmount();

    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(false);
    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(false);
  });

  it('setOpen(id, true) expands nav ancestors for that id via expandNavAncestorsForId', () => {
    const { result } = renderHook(() => useAccordionOpenState(['probes.r1.volume.audioSettings'], null));

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', true));

    expect(useUIStore.getState().expandedTopLevelBranch).toBe('probes');
    expect(useUIStore.getState().expandedProbeId).toBe('r1');
  });

  it('setOpen(id, false) does NOT touch nav ancestor expansion', () => {
    const { result } = renderHook(() => useAccordionOpenState(['probes.r1.volume.audioSettings'], 'probes.r1.volume.audioSettings'));
    useUIStore.setState({ expandedTopLevelBranch: null, expandedProbeId: null });

    act(() => result.current.setOpen('probes.r1.volume.audioSettings', false));

    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(useUIStore.getState().expandedProbeId).toBeNull();
  });
});

describe('useAccordionOpenState — every managed id registers up front, not just defaultOpenId (bug: clicking a nav row for a never-toggled accordion silently did nothing)', () => {
  afterEach(() => {
    unregisterAccordion('fleetParams.pacing');
    unregisterAccordion('fleetParams.eqFilters');
    unregisterAccordion('fleetParams.timeSpace');
    unregisterAccordion('fleetParams.output');
  });

  it('registers every id in the ids list on mount, not only defaultOpenId', () => {
    renderHook(() => useAccordionOpenState(
      ['fleetParams.pacing', 'fleetParams.eqFilters', 'fleetParams.timeSpace', 'fleetParams.output'],
      'fleetParams.pacing',
    ));

    // The bug: only 'fleetParams.pacing' (defaultOpenId) used to be registered, so a nav click on
    // any of these other 3 (never manually toggled) silently no-op'd via accordionSync's own
    // no-op-on-unregistered-id contract.
    expect(isAccordionOpen('fleetParams.pacing')).toBe(true);
    expect(isAccordionOpen('fleetParams.eqFilters')).toBe(false);
    expect(isAccordionOpen('fleetParams.timeSpace')).toBe(false);
    expect(isAccordionOpen('fleetParams.output')).toBe(false);
  });

  it('a never-toggled id registered up front can be opened via the registry (simulating a nav click), proving it is a real entry, not just a false default', () => {
    const { result } = renderHook(() => useAccordionOpenState(
      ['fleetParams.pacing', 'fleetParams.eqFilters'],
      'fleetParams.pacing',
    ));

    act(() => {
      // openAccordionFromNav's own code path — resolved via the registry's `open` callback, the
      // same one a real nav click invokes.
      result.current.setOpen('fleetParams.eqFilters', true);
    });

    expect(isAccordionOpen('fleetParams.eqFilters')).toBe(true);
    expect(result.current.isOpen('fleetParams.eqFilters')).toBe(true);
  });
});

describe('useAccordionOpenState — suppresses its own default-open when a pending nav target is about to be fulfilled (bug: switching into a fresh view opened BOTH the clicked target and the view\'s usual default at once)', () => {
  afterEach(() => {
    unregisterAccordion('fleetParams.pacing');
    unregisterAccordion('fleetParams.eqFilters');
    clearPendingNavTarget();
  });

  it('opens defaultOpenId normally when nothing is pending', () => {
    renderHook(() => useAccordionOpenState(['fleetParams.pacing', 'fleetParams.eqFilters'], 'fleetParams.pacing'));

    expect(isAccordionOpen('fleetParams.pacing')).toBe(true);
  });

  it('does NOT open defaultOpenId when a pending nav target matches one of this instance\'s ids', () => {
    // Simulates a nav click into this not-yet-mounted view, queued before mount.
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    renderHook(() => useAccordionOpenState(['fleetParams.pacing', 'fleetParams.eqFilters'], 'fleetParams.pacing'));

    expect(isAccordionOpen('fleetParams.pacing')).toBe(false);
  });

  it('the pending target itself opens instead, exactly once — not alongside the default', () => {
    openAccordionFromNav('fleetParams.eqFilters.eq', { closeSiblings: false });

    renderHook(() => useAccordionOpenState(['fleetParams.pacing', 'fleetParams.eqFilters'], 'fleetParams.pacing'));

    expect(isAccordionOpen('fleetParams.eqFilters')).toBe(true);
    expect(isAccordionOpen('fleetParams.pacing')).toBe(false);
  });
});

describe('useAccordionOpenState — openExclusive (docs/tasks/NAV_ACCORDION_SYNC.md Task 3)', () => {
  afterEach(() => {
    unregisterAccordion('probes.r1.volume.audioSettings');
    unregisterAccordion('probes.r1.melody.rhythm');
    useUIStore.setState({ expandedTopLevelBranch: null, expandedProbeId: null, expandedCompanyId: null });
  });

  it('with closeSiblings=false, behaves like setOpen(id, true) — no sibling closing', () => {
    const { result } = renderHook(() => useAccordionOpenState(
      ['probes.r1.volume.audioSettings', 'probes.r1.melody.rhythm'],
      'probes.r1.volume.audioSettings',
    ));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    act(() => result.current.openExclusive('probes.r1.volume.audioSettings', false));

    expect(result.current.isOpen('probes.r1.volume.audioSettings')).toBe(true);
    expect(result.current.isOpen('probes.r1.melody.rhythm')).toBe(true);
  });

  it('with closeSiblings=true, closes every other currently-open id and opens the target, in one state update', () => {
    const { result } = renderHook(() => useAccordionOpenState(
      ['probes.r1.volume.audioSettings', 'probes.r1.melody.rhythm'],
      'probes.r1.volume.audioSettings',
    ));
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));

    act(() => result.current.openExclusive('probes.r1.volume.audioSettings', true));

    expect(result.current.isOpen('probes.r1.volume.audioSettings')).toBe(true);
    expect(result.current.isOpen('probes.r1.melody.rhythm')).toBe(false);
  });

  it('openExclusive also expands nav ancestors for the target id', () => {
    const { result } = renderHook(() => useAccordionOpenState(['probes.r1.volume.audioSettings'], null));

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
      ({ resetKey }: { resetKey: string }) => useAccordionOpenState(
        ['probes.r1.volume.audioSettings', 'probes.r1.melody.rhythm'],
        'probes.r1.volume.audioSettings',
        resetKey,
      ),
      { initialProps: { resetKey: 'r1' } },
    );
    act(() => result.current.setOpen('probes.r1.melody.rhythm', true));
    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(true);

    rerender({ resetKey: 'r2' });

    expect(isAccordionOpen('probes.r1.melody.rhythm')).toBe(false);
    expect(isAccordionOpen('probes.r1.volume.audioSettings')).toBe(true);
  });
});
