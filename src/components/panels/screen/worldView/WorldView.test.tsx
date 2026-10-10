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

// ========================================
// IMPORTS
// ========================================
import WorldView from './WorldView';
import ContentPane from '@/components/panels/screen/console/ContentPane';
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

describe('WorldView.css — the dim', () => {
  const css = readFileSync(resolve(__dirname, 'WorldView.css'), 'utf8');

  it('dims and blurs the static layers by the sketch’s values', () => {
    const body = getCssRuleBody(css, '.world-view[data-dimmed] .ocean-scene__layer');
    expect(body).not.toBeNull();
    expect(body).toContain('filter: brightness(0.42) blur(2px);');
  });

  it('dims the moving layers to match, without a per-frame blur', () => {
    const body = getCssRuleBody(css, '.world-view[data-dimmed] .ocean-scene__layer--moving');
    expect(body).not.toBeNull();
    expect(body).toContain('filter: brightness(0.42);');
    expect(body).not.toContain('blur');
  });

  it('leaves the world unfiltered when not dimmed', () => {
    expect(getCssRuleBody(css, '.world-view')).not.toMatch(/filter\s*:/);
  });
});
