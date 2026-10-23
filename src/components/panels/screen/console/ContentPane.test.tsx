import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import ContentPane from './ContentPane';
import { useUIStore } from '@/stores/uiStore';

// This test is about ContentPane's own blank-state/active-tile dispatch (spec §7 Q6 —
// repurposed from Console.tsx, docs/tasks/archive/NAV_LAYOUT_REWRITE.md Task 8), not about ConsolePanel's
// content — same boundary ConsolePanel.test.tsx already draws around
// RobotsTab/RobotOptionsTab/AudioRigDrawer/SectorSettingsDrawer. Its former close button now
// lives in NavPanel as "Home" — see NavPanel.test.tsx.
vi.mock('./ConsolePanel', () => ({
  ConsolePanel: () => <div data-testid="console-panel-stub" />,
  default: () => <div data-testid="console-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('ContentPane — the Deck renders nothing, an active tile renders the pane', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders nothing on the Deck (activeHubTile is null)', () => {
    const { container } = render(<ContentPane />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render ConsolePanel in the blank/landing state', () => {
    render(<ContentPane />);
    expect(screen.queryByTestId('console-panel-stub')).toBeNull();
  });

  it('renders .content-pane wrapping ConsolePanel when a tile is active', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    const { container, getByTestId } = render(<ContentPane />);
    expect(container.querySelector('.content-pane')).toBeTruthy();
    expect(getByTestId('console-panel-stub')).toBeTruthy();
  });

  it('renders .content-pane when the robots tile is active', () => {
    useUIStore.getState().setActiveHubTile('robots');
    const { container } = render(<ContentPane />);
    expect(container.querySelector('.content-pane')).toBeTruthy();
  });
});

describe('ContentPane — ConsolePanel back-button behavior is unaffected (Task 8 AC3)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders ConsolePanel unchanged — this task does not touch its own dispatch logic', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    render(<ContentPane />);
    expect(screen.getByTestId('console-panel-stub')).toBeTruthy();
  });
});
