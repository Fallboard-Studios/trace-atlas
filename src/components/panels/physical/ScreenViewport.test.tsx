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

describe('ScreenViewport', () => {
  it('renders Header, WorldView, NavPanel, NavToggleButton, and ContentPane when powered on', () => {
    render(<ScreenViewport isPoweredOn={true} />);
    expect(screen.getByTestId('header-stub')).toBeTruthy();
    expect(screen.getByTestId('world-view-stub')).toBeTruthy();
    expect(screen.getByTestId('nav-panel-stub')).toBeTruthy();
    expect(screen.getByTestId('nav-toggle-button-stub')).toBeTruthy();
    expect(screen.getByTestId('content-pane-stub')).toBeTruthy();
  });

  it('renders none of them when powered off', () => {
    render(<ScreenViewport isPoweredOn={false} />);
    expect(screen.queryByTestId('header-stub')).toBeNull();
    expect(screen.queryByTestId('world-view-stub')).toBeNull();
    expect(screen.queryByTestId('nav-panel-stub')).toBeNull();
    expect(screen.queryByTestId('nav-toggle-button-stub')).toBeNull();
    expect(screen.queryByTestId('content-pane-stub')).toBeNull();
  });
});
