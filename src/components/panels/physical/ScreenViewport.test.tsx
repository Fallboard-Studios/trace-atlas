import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScreenViewport from './ScreenViewport';

// Child components pull in real Tone.js/AudioEngine and GSAP, both of which
// throw in this jsdom test environment (no real AudioContext, and the
// project's GSAP mock in vitest.setup.ts doesn't cover every method other
// components call). Stubbing them is the sane boundary here — this test is
// about ScreenViewport's own composition logic (what it renders, and when),
// not about re-testing TransportBar/WorldView/ContentPane themselves.
vi.mock('@/components/panels/screen/Header', () => ({
  default: () => <div data-testid="header-stub" />,
}));
vi.mock('@/components/panels/screen/worldView/WorldView', () => ({
  default: () => <div data-testid="world-view-stub" />,
}));
vi.mock('@/components/panels/screen/console/ContentPane', () => ({
  default: () => <div data-testid="content-pane-stub" />,
}));
vi.mock('@/components/panels/screen/nav/NavPanel', () => ({
  default: () => <div data-testid="nav-panel-stub" />,
}));
vi.mock('@/components/panels/screen/nav/NavToggleButton', () => ({
  default: () => <div data-testid="nav-toggle-button-stub" />,
}));
vi.mock('@/components/panels/screen/nav/NavBreadcrumb', () => ({
  default: () => <div data-testid="nav-breadcrumb-stub" />,
}));
vi.mock('@/components/panels/screen/PhoneBar', () => ({
  default: () => <div data-testid="phone-bar-stub" />,
}));

describe('ScreenViewport', () => {
  it('renders Header, WorldView, NavPanel, ContentPane, NavBreadcrumb and PhoneBar when powered on', () => {
    render(<ScreenViewport isPoweredOn={true} />);
    expect(screen.getByTestId('header-stub')).toBeTruthy();
    expect(screen.getByTestId('world-view-stub')).toBeTruthy();
    expect(screen.getByTestId('nav-panel-stub')).toBeTruthy();
    expect(screen.getByTestId('content-pane-stub')).toBeTruthy();
    expect(screen.getByTestId('nav-breadcrumb-stub')).toBeTruthy();
    expect(screen.getByTestId('phone-bar-stub')).toBeTruthy();
  });

  // docs/tasks/LAYOUT_REWORK.md Task 5: the phone bar's menu replaces the floating hamburger (deleted in Task 9).
  it('no longer renders the floating NavToggleButton', () => {
    render(<ScreenViewport isPoweredOn={true} />);
    expect(screen.queryByTestId('nav-toggle-button-stub')).toBeNull();
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

  it('renders none of them when powered off', () => {
    render(<ScreenViewport isPoweredOn={false} />);
    expect(screen.queryByTestId('header-stub')).toBeNull();
    expect(screen.queryByTestId('world-view-stub')).toBeNull();
    expect(screen.queryByTestId('nav-panel-stub')).toBeNull();
    expect(screen.queryByTestId('content-pane-stub')).toBeNull();
    expect(screen.queryByTestId('nav-breadcrumb-stub')).toBeNull();
    expect(screen.queryByTestId('phone-bar-stub')).toBeNull();
  });
});
