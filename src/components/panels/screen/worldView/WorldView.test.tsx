// ========================================
// MOCKS
// ========================================
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('@/components/robot/Robot', () => ({ Robot: () => null }));
vi.mock('@/components/actors/Factory', () => ({ Factory: () => null, default: () => null }));
// The surface's own tests cover what is inside it (ContentPane.test.tsx, ConsolePanel.test.tsx).
vi.mock('@/components/panels/screen/console/ConsolePanel', () => ({
  ConsolePanel: () => <div data-testid="console-panel-stub" />,
  default: () => <div data-testid="console-panel-stub" />,
}));
// Mobile Deck Camera (Task 8): deckCamera.test.ts already covers registerDeckScroller's own
// behaviour; this file only needs to see that WorldView calls it, not what it does.
vi.mock('@/animation/deckCamera', () => ({
  registerDeckScroller: vi.fn(),
  // OceanScene's followed-robot marker reads these; the camera follows nobody here.
  getFollowedRobotId: () => null,
  subscribeFollowedRobot: () => () => {},
}));

// ========================================
// IMPORTS
// ========================================
import WorldView from './WorldView';
import ContentPane from '@/components/panels/screen/console/ContentPane';
import { registerDeckScroller } from '@/animation/deckCamera';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '@/stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { retransmitWorld } from '@/systems/worldTransition';
import { stopRobotLifecycle } from '@/systems/robotSystems';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import type { HubTile } from '@/types/hub';

const UI_INITIAL_STATE = useUIStore.getState();
const TILES: HubTile[] = ['robots', 'audioRig', 'settings', 'companies'];

// ========================================
// TESTS
// ========================================

describe('WorldView — survives retransmitting to a new Attenuation Style', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
  });

  afterEach(() => {
    stopRobotLifecycle();
  });

  it('still renders an attenuation-style-view after retransmitting a brand-new Attenuation Style name', () => {
    render(<WorldView />);
    expect(document.querySelector('.attenuation-style-view')).toBeTruthy();

    act(() => {
      retransmitWorld({ attenuationStyleName: 'Kryndara' });
    });

    expect(document.querySelector('.attenuation-style-view')).toBeTruthy();
    expect(document.querySelector('.locale-view')).toBeTruthy();
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 7 (spec §1.3): the world dims under the opaque content surface,
// which shows while a branch is open; the Deck has no surface and a bright world.
describe('WorldView — dims while the content surface is showing', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  const worldView = () => document.querySelector('.world-view')!;

  it('is bright on the Deck: no data-dimmed', () => {
    render(<WorldView />);
    expect(worldView().hasAttribute('data-dimmed')).toBe(false);
  });

  it.each(TILES)('carries data-dimmed while %s is open', (tile) => {
    useUIStore.getState().setActiveHubTile(tile);
    render(<WorldView />);
    expect(worldView().hasAttribute('data-dimmed')).toBe(true);
  });

  it('follows the view: dims on opening a branch, brightens again on going back to the Deck', () => {
    render(<WorldView />);
    act(() => useUIStore.getState().setActiveHubTile('audioRig'));
    expect(worldView().hasAttribute('data-dimmed')).toBe(true);
    act(() => useUIStore.getState().setActiveHubTile('settings'));
    expect(worldView().hasAttribute('data-dimmed')).toBe(true);
    act(() => useUIStore.getState().setActiveHubTile(null));
    expect(worldView().hasAttribute('data-dimmed')).toBe(false);
  });

  it.each([null, ...TILES])('agrees with ContentPane: dimmed exactly when the surface renders (tile %s)', (tile) => {
    useUIStore.getState().setActiveHubTile(tile);
    const { container } = render(
      <>
        <WorldView />
        <ContentPane />
      </>,
    );
    const surfaceShowing = container.querySelector('.content-pane') !== null;
    expect(worldView().hasAttribute('data-dimmed')).toBe(surfaceShowing);
    expect(surfaceShowing).toBe(tile !== null);
  });
});

// Task 8 (spec §1.7): the meta box is the world's own readout, bottom-left of the Deck.
describe('WorldView — carries the meta box', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState(UI_INITIAL_STATE, true);
    // The desk shell: useShell's one min-width query matches.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: !query.includes('reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
  });

  it('on the Deck, inside the world view', () => {
    render(<WorldView />);
    expect(document.querySelector('.world-view > .meta-box')).not.toBeNull();
  });

  it('not while a branch is open', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<WorldView />);
    expect(document.querySelector('.meta-box')).toBeNull();
  });
});

// Mobile Deck Camera (spec §1.1, assumptions 1, 3): the scroller wraps AttenuationStyleView
// alone — MetaBox stays pinned, a direct sibling of .world-view — and centres itself once, on
// mount, so an unpanned phone sees the same middle slice it always has.
describe('WorldView — the deck scroller (Mobile Deck Camera)', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState(UI_INITIAL_STATE, true);
    // MetaBox reads useShell(), which reads matchMedia — the desk shell's query.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: !query.includes('reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
  });

  it('wraps the attenuation-style view in .world-view__scroller, and keeps the meta box out of it', () => {
    render(<WorldView />);
    const scroller = document.querySelector('.world-view__scroller');
    expect(scroller).not.toBeNull();
    expect(scroller!.querySelector('.attenuation-style-view')).not.toBeNull();
    expect(scroller!.querySelector('.meta-box')).toBeNull();
    expect(document.querySelector('.world-view > .meta-box')).not.toBeNull();
  });

  it('centres scrollLeft on mount: (scrollWidth − clientWidth) / 2, seeded with non-default sizes', () => {
    // jsdom lays nothing out (scrollWidth/clientWidth are always 0 there), so the sizes are
    // stubbed on the element's own prototype before mount — the ref callback reads them
    // synchronously while the node is attached, before the test gets control back, so there is
    // no later point at which stubbing the found element itself would still run in time.
    const scrollWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockReturnValue(2000);
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(500);
    try {
      render(<WorldView />);
      const scroller = document.querySelector('.world-view__scroller') as HTMLDivElement;
      expect(scroller.scrollLeft).toBe(750);
    } finally {
      scrollWidthSpy.mockRestore();
      clientWidthSpy.mockRestore();
    }
  });
});

// Mobile Deck Camera (Task 8, spec §1.1): the scroller hands itself to the camera module on
// mount and unmount, and only then — a re-render in between must not re-register it.
describe('WorldView — hands the scroller to the camera module', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState(UI_INITIAL_STATE, true);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({ matches: !query.includes('reduced-motion'), media: query, addEventListener: () => {}, removeEventListener: () => {} }),
    });
    vi.mocked(registerDeckScroller).mockClear();
  });
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: realMatchMedia });
  });

  it('calls registerDeckScroller once with the scroller element on mount', () => {
    render(<WorldView />);
    const scroller = document.querySelector('.world-view__scroller');
    expect(registerDeckScroller).toHaveBeenCalledTimes(1);
    expect(registerDeckScroller).toHaveBeenCalledWith(scroller);
  });

  it('calls registerDeckScroller(null) on unmount', () => {
    const { unmount } = render(<WorldView />);
    vi.mocked(registerDeckScroller).mockClear();

    unmount();

    expect(registerDeckScroller).toHaveBeenCalledTimes(1);
    expect(registerDeckScroller).toHaveBeenCalledWith(null);
  });

  it('calls neither again on a re-render in between', () => {
    const { rerender } = render(<WorldView />);
    vi.mocked(registerDeckScroller).mockClear();

    rerender(<WorldView />);

    expect(registerDeckScroller).not.toHaveBeenCalled();
  });
});

describe('WorldView.css — the dim', () => {
  const css = readFileSync(resolve(__dirname, 'WorldView.css'), 'utf8');

  it('dims and blurs the static sheets by the sketch’s values', () => {
    const body = getCssRuleBody(css, '.world-view[data-dimmed] .ocean-scene__sheet');
    expect(body).not.toBeNull();
    expect(body).toContain('filter: brightness(0.42) blur(2px);');
  });

  // Roadmap 53 Task 19: no sheet moves any more, so there is no moving-sheet dim rule to keep.
  it('has no dim rule for a moving sheet, because no sheet moves', () => {
    expect(css).not.toContain('ocean-scene__sheet--moving');
  });

  // Phase 53 (spec §1.3): a mover repaints in its own patch every frame, so it dims by brightness
  // alone and never takes the blur.
  it('dims every mover by the same brightness, without a per-frame blur', () => {
    const body = getCssRuleBody(css, '.world-view[data-dimmed] .mover');
    expect(body).not.toBeNull();
    expect(body).toContain('filter: brightness(0.42);');
    expect(body).not.toContain('blur');
  });

  it('keeps no trace of the old layer class', () => {
    expect(css).not.toContain('ocean-scene__layer');
  });

  it('leaves the world unfiltered when not dimmed', () => {
    expect(getCssRuleBody(css, '.world-view')).not.toMatch(/filter\s*:/);
  });
});
