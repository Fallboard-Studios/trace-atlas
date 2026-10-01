import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavToggleButton } from './NavToggleButton';
import { useUIStore } from '@/stores/uiStore';

/** Stubs window.matchMedia for NavPanel's own dock breakpoint (useNavPanelSlideAway.ts,
 *  min-width query, NAV_PANEL_DOCK_MIN_WIDTH = 768px) — independent of the shared Cabinet
 *  breakpoint. `mobile: true` means below the dock breakpoint, i.e. the min-width query
 *  doesn't match. */
function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('768px') ? !mobile : false,
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

describe('NavToggleButton reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 15)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'NavToggleButton.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]/);
    expect(source).not.toMatch(/>\s*(Cancel|Link copied|Unable to copy)\s*</);
    expect(source).not.toMatch(/`(Saved|Collapse|Expand) $\{|failed to save\.|'CORRUPT NAME'|'NO TEMP'|Probes active\.|Viewing \{/);
  });
});
