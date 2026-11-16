import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScreenViewport from './ScreenViewport';
import { selectEntity } from '@/components/panels/screen/nav/navActions';
import { useUIStore, DEFAULT_FLEET_PARAMS_SECTION, type NavStop } from '@/stores/uiStore';

// Child components pull in real Tone.js/AudioEngine and GSAP, both of which
// throw in this jsdom test environment (no real AudioContext, and the
// project's GSAP mock in vitest.setup.ts doesn't cover every method other
// components call). Stubbing them is the sane boundary here — this test is
// about ScreenViewport's own composition logic (what it renders, and when),
// not about re-testing the pieces themselves.
vi.mock('@/components/panels/screen/Header', () => ({
  default: () => <div data-testid="header-stub" />,
}));
vi.mock('@/components/panels/screen/worldView/WorldView', () => ({
  default: () => <div data-testid="world-view-stub" />,
}));
vi.mock('@/components/panels/screen/screens/OffScreen', () => ({
  OffScreen: () => <div data-testid="off-screen-stub" />,
}));
vi.mock('@/components/panels/screen/console/ContentPane', () => ({
  default: () => <div data-testid="content-pane-stub" />,
}));
vi.mock('@/components/panels/screen/nav/NavPanel', () => ({
  default: () => <div data-testid="nav-panel-stub" />,
}));
vi.mock('@/components/panels/screen/nav/NavBreadcrumb', () => ({
  default: () => <div data-testid="nav-breadcrumb-stub" />,
}));

/*
 * docs/tasks/LAYOUT_REWORK.md Task 9 (spec §1.1): the shell after the tree — Header, WorldView (which
 * carries the meta box), the one nav panel (the phone's sheet inside it), the content surface, the
 * and the breadcrumb (desk). The phone menu and well ride in Header (2026-10-11). The nav tree is deleted.
 */

const COMPOSITION = ['header-stub', 'world-view-stub', 'nav-panel-stub', 'content-pane-stub', 'nav-breadcrumb-stub'];

describe('ScreenViewport', () => {
  it('renders Header, WorldView, NavPanel, ContentPane, and NavBreadcrumb when powered on, and nothing else', () => {
    const { container } = render(<ScreenViewport isPoweredOn={true} />);
    const children = Array.from(container.querySelector('.screen-content')!.children);
    expect(children.map((child) => child.getAttribute('data-testid'))).toEqual(COMPOSITION);
  });

  // Task 26 (spec §1.9): the world is built before power-on and is the off screen's backdrop, so
  // WorldView is the one child that renders in both power states; the chrome waits for power.
  // Task 27: the off screen goes over it (OffScreen), and only while the power is off.
  it('renders only WorldView and the off screen when powered off', () => {
    const { container } = render(<ScreenViewport isPoweredOn={false} />);
    for (const id of COMPOSITION.filter((id) => id !== 'world-view-stub')) expect(screen.queryByTestId(id)).toBeNull();
    const children = Array.from(container.querySelector('.screen-content')!.children);
    expect(children.map((child) => child.getAttribute('data-testid'))).toEqual(['world-view-stub', 'off-screen-stub']);
  });

  it('does not render the off screen while powered on', () => {
    render(<ScreenViewport isPoweredOn={true} />);
    expect(screen.queryByTestId('off-screen-stub')).toBeNull();
  });

  it('mounts and unmounts the off screen across a power cycle', () => {
    const { rerender } = render(<ScreenViewport isPoweredOn={false} />);
    expect(screen.getByTestId('off-screen-stub')).toBeTruthy();
    rerender(<ScreenViewport isPoweredOn={true} />);
    expect(screen.queryByTestId('off-screen-stub')).toBeNull();
    rerender(<ScreenViewport isPoweredOn={false} />);
    expect(screen.getByTestId('off-screen-stub')).toBeTruthy();
  });

  it('keeps the same WorldView instance across a power cycle: it never unmounts, so it never rebuilds the world', () => {
    const { container, rerender } = render(<ScreenViewport isPoweredOn={false} />);
    const worldBefore = container.querySelector('[data-testid="world-view-stub"]');
    rerender(<ScreenViewport isPoweredOn={true} />);
    expect(container.querySelector('[data-testid="world-view-stub"]')).toBe(worldBefore);
    rerender(<ScreenViewport isPoweredOn={false} />);
    expect(container.querySelector('[data-testid="world-view-stub"]')).toBe(worldBefore);
  });

  // The shell reaches CSS here, from the one switch (useShell), so a stylesheet never needs a media query
  // of its own to tell the phone from the desk .
  it.each([
    [true, 'desk'],
    [false, 'phone'],
  ])('marks the viewport with the shell (desk query matching: %s -> %s), powered or not', (desk, shell) => {
    const realMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: desk, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    try {
      const { container, rerender } = render(<ScreenViewport isPoweredOn={true} />);
      expect(container.querySelector('#screen-viewport')!.getAttribute('data-shell')).toBe(shell);
      rerender(<ScreenViewport isPoweredOn={false} />);
      expect(container.querySelector('#screen-viewport')!.getAttribute('data-shell')).toBe(shell);
    } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
    }
  });
});

/*
 * docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 12 (spec §1.6): the browser's Back is wired here, in both power
 * states, so a press on the off screen reaches the handler and passes on.
 */
describe('ScreenViewport — the browser Back', () => {
  const deckStop: NavStop = {
    tile: null,
    robotId: null,
    companyId: null,
    allProbes: false,
    section: null,
    subsection: null,
    fleetSection: DEFAULT_FLEET_PARAMS_SECTION,
    fleetSubsection: null,
  };
  const press = () => window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  let historyBack: ReturnType<typeof vi.spyOn>;
  let historyForward: ReturnType<typeof vi.spyOn>;
  let pushState: ReturnType<typeof vi.spyOn>;
  const startUrl = window.location.href;

  beforeEach(() => {
    useUIStore.getState().resetNav();
    window.history.replaceState(null, '', startUrl);
    historyBack = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    historyForward = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
    pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useUIStore.setState({ isPoweredOn: false });
    useUIStore.getState().resetNav();
  });

  it('powered on with a one-stop trail, a press empties the trail and returns to the guard', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [deckStop] });
    render(<ScreenViewport isPoweredOn={true} />);

    press();

    expect(useUIStore.getState().navTrail).toEqual([]);
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(historyForward).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
  });

  it('powered off with steps on the trail, a press passes on and the trail stands', () => {
    useUIStore.setState({ isPoweredOn: false, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [deckStop, deckStop] });
    const trail = useUIStore.getState().navTrail;
    render(<ScreenViewport isPoweredOn={false} />);

    press();

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(historyForward).not.toHaveBeenCalled();
    expect(useUIStore.getState().navTrail).toBe(trail);
  });

  it('powered on, the first step pushes the guard', () => {
    useUIStore.setState({ isPoweredOn: true });
    render(<ScreenViewport isPoweredOn={true} />);

    selectEntity({ robotId: 'r1' });

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('stays wired across a power cycle (one listener, not one per power state)', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [deckStop] });
    const { rerender } = render(<ScreenViewport isPoweredOn={true} />);
    rerender(<ScreenViewport isPoweredOn={false} />);
    rerender(<ScreenViewport isPoweredOn={true} />);

    press();

    expect(useUIStore.getState().navTrail).toEqual([]);
    expect(historyForward).toHaveBeenCalledTimes(1);
  });

  it('unmounting removes the listener and the subscription', () => {
    useUIStore.setState({ isPoweredOn: true, activeHubTile: 'robots', selectedRobotId: 'r1', navTrail: [deckStop] });
    const trail = useUIStore.getState().navTrail;
    const { unmount } = render(<ScreenViewport isPoweredOn={true} />);
    unmount();

    press();
    expect(useUIStore.getState().navTrail).toBe(trail);
    expect(historyForward).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();

    useUIStore.setState({ navTrail: [] });
    selectEntity({ robotId: 'r2' });
    expect(pushState).not.toHaveBeenCalled();
  });
});
