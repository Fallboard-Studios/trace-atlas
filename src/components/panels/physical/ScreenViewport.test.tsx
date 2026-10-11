import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScreenViewport from './ScreenViewport';

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
vi.mock('@/components/panels/screen/PhoneBar', () => ({
  default: () => <div data-testid="phone-bar-stub" />,
}));

/*
 * docs/tasks/LAYOUT_REWORK.md Task 9 (spec §1.1): the shell after the tree — Header, WorldView (which
 * carries the meta box), the one nav panel (the phone's sheet inside it), the content surface, the
 * breadcrumb (desk) and the phone bar (each renders only on its shell). The nav tree is deleted.
 */

const COMPOSITION = ['header-stub', 'world-view-stub', 'nav-panel-stub', 'content-pane-stub', 'nav-breadcrumb-stub', 'phone-bar-stub'];

describe('ScreenViewport', () => {
  it('renders Header, WorldView, NavPanel, ContentPane, NavBreadcrumb and PhoneBar when powered on, and nothing else', () => {
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
  // of its own to tell the phone from the desk (ContentPane.css stops above PhoneBar on the phone).
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

// The grep gate, kept as a test: the tree's modules are gone and nothing under src/ imports one
// (spec §1.11). The stacked scroll's gate (Task 18) is screens/stackedScrollRetired.test.ts.
describe('ScreenViewport — the nav tree is deleted', () => {
  const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const DELETED = [
    'components/panels/screen/nav/NavTree',
    'components/panels/screen/nav/NavTreeNode',
    'components/panels/screen/nav/NavCabinetRow',
    'components/panels/screen/nav/NavStatusBlock',
    'components/panels/screen/nav/NavToggleButton',
    'components/panels/screen/nav/useNavTree',
    'components/panels/screen/nav/useNavPanelSlideAway',
    'components/panels/screen/nav/navPanelViewsAndContent.integration',
    'data/navTreeConfig',
  ];

  it.each(DELETED)('%s is gone, with its stylesheet and tests', (module) => {
    for (const ext of ['.ts', '.tsx', '.css', '.test.ts', '.test.tsx']) {
      expect(existsSync(join(srcRoot, module + ext)), module + ext).toBe(false);
    }
  });

  it('nothing under src/ imports one of them', () => {
    const names = DELETED.map((module) => module.split('/').pop()!).join('|');
    const importOf = new RegExp(`(from|import|vi\\.mock\\()\\s*['"][^'"]*/(${names})(\\.css)?['"]`);
    const importers = (readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file) && file !== join('components', 'panels', 'physical', 'ScreenViewport.test.tsx'))
      .filter((file) => importOf.test(readFileSync(join(srcRoot, file), 'utf8')));
    expect(importers).toEqual([]);
  });
});
