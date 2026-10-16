import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App';

const debug = vi.hoisted(() => ({ enabled: false }));

vi.mock('@/utils/debugParams', () => ({ isDebugEnabled: () => debug.enabled }));
vi.mock('./components/tablet/Tablet', () => ({ default: () => <div data-testid="tablet" /> }));
vi.mock('./components/debug/AudioDebugHud', () => ({ default: () => <div data-testid="hud" /> }));

// The ?debug HUD is fixed over the bottom-left of the viewport and covers the tablet's lowest controls, so
// with it on the app root becomes a scroller with clearance below the tablet (App.css .app-root--debug).
describe('App with the ?debug HUD', () => {
  beforeEach(() => {
    debug.enabled = false;
  });

  it('adds scrollable clearance below the tablet when debug is on', () => {
    debug.enabled = true;
    const { container, getByTestId } = render(<App />);
    const root = container.querySelector('.app-root') as HTMLElement;
    expect(root.classList.contains('app-root--debug')).toBe(true);
    expect(getByTestId('hud')).not.toBeNull();
    const spacer = root.querySelector('.app-root__debug-clearance');
    expect(spacer).not.toBeNull();
    // After the tablet's backdrop in document order, so scrolling reaches it last.
    expect(root.querySelector('.real-world')?.nextElementSibling).toBe(spacer);
  });

  it('changes nothing when debug is off', () => {
    const { container, queryByTestId } = render(<App />);
    const root = container.querySelector('.app-root') as HTMLElement;
    expect(root.classList.contains('app-root--debug')).toBe(false);
    expect(root.querySelector('.app-root__debug-clearance')).toBeNull();
    expect(queryByTestId('hud')).toBeNull();
    expect(queryByTestId('tablet')).not.toBeNull();
  });
});
