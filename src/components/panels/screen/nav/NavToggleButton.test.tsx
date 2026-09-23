import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavToggleButton } from './NavToggleButton';
import { useUIStore } from '@/stores/uiStore';

/** Same matchMedia stub convention as useCabinetBoxHeight.test.ts/NavPanel.test.tsx —
 *  mobile query is the 640px Cabinet breakpoint. */
function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('640px') ? mobile : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

const UI_INITIAL_STATE = useUIStore.getState();

describe('NavToggleButton — persistent mobile reopen affordance (docs/tasks/NAV_LAYOUT_REWRITE.md Task 7)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders on mobile', () => {
    stubMatchMedia(true);
    render(<NavToggleButton />);
    expect(screen.queryByRole('switch')).toBeTruthy();
  });

  it('does not render above the mobile breakpoint', () => {
    stubMatchMedia(false);
    render(<NavToggleButton />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('clicking it toggles isNavPanelOpen', () => {
    stubMatchMedia(true);
    useUIStore.getState().setNavPanelOpen(false);
    render(<NavToggleButton />);

    fireEvent.click(screen.getByRole('switch'));
    expect(useUIStore.getState().isNavPanelOpen).toBe(true);

    fireEvent.click(screen.getByRole('switch'));
    expect(useUIStore.getState().isNavPanelOpen).toBe(false);
  });

  it("aria-checked reflects the panel's current open/closed state (Toggle/Radix Switch, not aria-expanded)", () => {
    stubMatchMedia(true);
    useUIStore.getState().setNavPanelOpen(false);
    render(<NavToggleButton />);

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
});
