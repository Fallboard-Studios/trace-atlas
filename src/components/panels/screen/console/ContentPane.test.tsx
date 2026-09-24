import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ContentPane from './ContentPane';
import { useUIStore } from '@/stores/uiStore';

// This test is about ContentPane's own render-nothing-when-blank gate and its close button
// (spec §7 Q6 — repurposed from Console.tsx, docs/tasks/NAV_LAYOUT_REWRITE.md Task 8), not about
// ConsolePanel's content — same boundary ConsolePanel.test.tsx already draws around
// RobotsTab/RobotOptionsTab/AudioRigDrawer/SectorSettingsDrawer.
vi.mock('./ConsolePanel', () => ({
  ConsolePanel: () => <div data-testid="console-panel-stub" />,
  default: () => <div data-testid="console-panel-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('ContentPane — render-nothing-when-blank gate, ported from Console.test.tsx', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('renders nothing when activeHubTile is null — the old console--grid pointer-events mechanism stays retired', () => {
    const { container } = render(<ContentPane />);
    expect(container.firstChild).toBeNull();
    expect(container.querySelector('.content-pane')).toBeNull();
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

describe('ContentPane — always-present close button (Task 8)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('shows no close button when nothing is selected', () => {
    render(<ContentPane />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('shows a close button whenever a tile is active', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<ContentPane />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('clicking close clears activeHubTile back to the blank hub', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<ContentPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(useUIStore.getState().activeHubTile).toBeNull();
  });

  it('clicking close also clears selectedRobotId/selectedSection back to the blank/landing state', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    useUIStore.getState().setSelectedSection('volume');
    render(<ContentPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().selectedSection).toBeNull();
  });

  it('clicking close resets company selection back to "All" (allRobotsSelected)', () => {
    useUIStore.getState().setActiveHubTile('companies');
    useUIStore.getState().selectCompany('c1');
    render(<ContentPane />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(useUIStore.getState().selectedCompanyId).toBeNull();
    expect(useUIStore.getState().allRobotsSelected).toBe(true);
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
