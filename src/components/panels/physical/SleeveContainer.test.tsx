import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// SleeveContainer renders the real PowerRockerSwitch — so it needs the same
// dependency mocks PowerRockerSwitch.test.tsx already uses to keep it from
// touching real power/audio/animation systems.
vi.mock('@/systems/powerController', () => ({
  powerController: { start: vi.fn() },
}));
vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));
vi.mock('@/stores/uiStore', () => {
  const useUIStore = (selector: unknown) =>
    typeof selector === 'function'
      ? (selector as (s: { isPoweredOn: boolean }) => unknown)({ isPoweredOn: false })
      : { isPoweredOn: false };
  (useUIStore as unknown as { getState: () => unknown }).getState = () => ({
    setPowerOn: vi.fn(),
    setPowerOff: vi.fn(),
  });
  return { useUIStore };
});

import SleeveContainer from './SleeveContainer';

// Any element a user could interact with — used by the guardrail check below.
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

describe('SleeveContainer', () => {
  it('renders a power corner containing PowerRockerSwitch', () => {
    const { container } = render(<SleeveContainer />);
    const corner = container.querySelector('.sleeve-container__power-corner');
    expect(corner).toBeTruthy();
    expect(corner?.querySelector('button')).toBeTruthy();
  });

  it('carries the --cutaway modifier on its own root element', () => {
    // The root is taken out of flex flow (position: absolute) so
    // ScreenViewport can become flush with the top of .tablet — see the
    // architecture comment in SleeveContainer.css.
    const { container } = render(<SleeveContainer />);
    const root = container.querySelector('.sleeve-container');
    expect(root?.classList.contains('sleeve-container--cutaway')).toBe(true);
  });

  it('has no interactive element other than PowerRockerSwitch’s own button (guardrail check)', () => {
    const { container } = render(<SleeveContainer />);
    const interactive = container.querySelectorAll(INTERACTIVE_SELECTOR);
    expect(interactive.length).toBe(1);
  });
});
