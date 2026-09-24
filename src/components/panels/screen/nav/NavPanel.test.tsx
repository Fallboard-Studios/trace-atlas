import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NavPanel } from './NavPanel';
import { useUIStore } from '@/stores/uiStore';
import { setTimeline, killTimeline } from '@/animation/timelineMap';

vi.mock('./NavTree', () => ({ NavTree: () => <div data-testid="nav-tree-stub" /> }));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

// Local gsap mock (overrides vitest.setup.ts's shared one, same pattern other
// GSAP-timeline tests in this codebase use) — captures each .to() call's vars so the
// prefers-reduced-motion duration assertion below can inspect it directly.
let lastToVars: Record<string, unknown> | undefined;
vi.mock('gsap', () => {
  const chainable = {
    to: (_target: unknown, vars: Record<string, unknown>) => {
      lastToVars = vars;
      return chainable;
    },
    set: () => chainable,
    kill: () => {},
  };
  // gsap.set() is also called directly on the top-level module (not only via a timeline
  // instance) when NavPanel resets a stale mobile transform on returning to desktop/tablet.
  return { default: { timeline: vi.fn(() => chainable), set: vi.fn() } };
});

/** Stubs window.matchMedia for NavPanel's own dock breakpoint (useNavPanelSlideAway.ts,
 *  min-width query, NAV_PANEL_DOCK_MIN_WIDTH = 768px, independent of the shared Cabinet tier)
 *  plus prefers-reduced-motion, independently controllable. `mobile: true` means below the dock
 *  breakpoint, i.e. the min-width query doesn't match. */
function stubMatchMedia(initial: { mobile: boolean; reducedMotion: boolean }) {
  const state = { ...initial };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const matches = query.includes('reduced-motion') ? state.reducedMotion : !state.mobile;
      return {
        matches,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  });
}

const UI_INITIAL_STATE = useUIStore.getState();

function resetUIStore() {
  useUIStore.setState(UI_INITIAL_STATE, true);
}

describe('NavPanel — docked (desktop/tablet) vs. slide-off (mobile) (docs/tasks/NAV_LAYOUT_REWRITE.md Task 6)', () => {
  beforeEach(() => {
    resetUIStore();
    lastToVars = undefined;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('above the breakpoint, renders open regardless of isNavPanelOpen — desktop/tablet ignores it entirely', () => {
    stubMatchMedia({ mobile: false, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(false);

    render(<NavPanel />);

    expect(screen.getByTestId('nav-panel').getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('nav-panel').getAttribute('inert')).toBeNull();
  });

  it('below the breakpoint with isNavPanelOpen false, renders closed and inert', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(false);

    render(<NavPanel />);

    expect(screen.getByTestId('nav-panel').getAttribute('data-open')).toBe('false');
    expect(screen.getByTestId('nav-panel').getAttribute('inert')).not.toBeNull();
  });

  it('below the breakpoint with isNavPanelOpen true, renders open and not inert', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(true);

    render(<NavPanel />);

    expect(screen.getByTestId('nav-panel').getAttribute('data-open')).toBe('true');
    expect(screen.getByTestId('nav-panel').getAttribute('inert')).toBeNull();
  });
});

describe('NavPanel — selecting a node auto-closes the panel on mobile only (Task 6)', () => {
  beforeEach(() => {
    resetUIStore();
    lastToVars = undefined;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('on mobile, a selection change (selectedRobotId) closes the panel', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(true);
    render(<NavPanel />);

    act(() => {
      useUIStore.getState().selectRobot('r1');
    });

    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
  });

  it('on desktop/tablet, a selection change leaves isNavPanelOpen untouched', () => {
    stubMatchMedia({ mobile: false, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(true);
    render(<NavPanel />);

    act(() => {
      useUIStore.getState().selectRobot('r1');
    });

    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
  });

  it('does not close on mount, only on a real subsequent selection change', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(true);

    render(<NavPanel />);

    expect(useUIStore.getState().isNavPanelOpen).toBe(true);
  });
});

describe('NavPanel — GSAP timeline lifecycle (Task 6)', () => {
  beforeEach(() => {
    resetUIStore();
    lastToVars = undefined;
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a timeline in timelineMap when isNavPanelOpen changes on mobile', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(false);
    render(<NavPanel />);

    act(() => {
      useUIStore.getState().setNavPanelOpen(true);
    });

    expect(setTimeline).toHaveBeenCalled();
  });

  it('kills its timeline on unmount — no orphaned GSAP instance', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    const { unmount } = render(<NavPanel />);

    unmount();

    expect(killTimeline).toHaveBeenCalled();
  });

  it('respects prefers-reduced-motion — the slide tween gets duration 0', () => {
    stubMatchMedia({ mobile: true, reducedMotion: true });
    useUIStore.getState().setNavPanelOpen(false);
    render(<NavPanel />);

    act(() => {
      useUIStore.getState().setNavPanelOpen(true);
    });

    expect(lastToVars?.duration).toBe(0);
  });

  it('animates with a nonzero duration when reduced motion is not requested', () => {
    stubMatchMedia({ mobile: true, reducedMotion: false });
    useUIStore.getState().setNavPanelOpen(false);
    render(<NavPanel />);

    act(() => {
      useUIStore.getState().setNavPanelOpen(true);
    });

    expect(lastToVars?.duration).toBeGreaterThan(0);
  });
});
