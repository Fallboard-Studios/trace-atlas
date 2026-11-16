import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

import ContentPane from './ContentPane';
import { useUIStore, type UIStore } from '@/stores/uiStore';
import { labels } from '@/content';

// This test is about ContentPane's own blank-state/active-tile dispatch (spec §7 Q6 —
// repurposed from Console.tsx, docs/tasks/archive/NAV_LAYOUT_REWRITE.md Task 8), not about ConsolePanel's
// content — same boundary ConsolePanel.test.tsx already draws around
// RobotsTab/RobotOptionsTab/AudioRigDrawer. Its former close button now
// lives in NavPanel as "Home" — see NavPanel.test.tsx.
// The stub keeps ConsolePanel's two classes, so "the row is outside the scroller" reads against the real class names.
vi.mock('./ConsolePanel', () => {
  const Stub = () => (
    <div data-testid="console-panel-stub" className="console-panel">
      <div className="console-panel__content" />
    </div>
  );
  return { ConsolePanel: Stub, default: Stub };
});
vi.mock('@/components/ui/controls/CabinetBox', () => ({
  CabinetBox: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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

/** The five open screens (docs/tasks/NAVIGATION_CLOSE_AND_BACK.md Task 8), each as the nav fields that pick it. */
const OPEN_SCREENS: [string, Partial<UIStore>][] = [
  ['the Probes list', { activeHubTile: 'robots' }],
  ['a robot', { activeHubTile: 'robots', selectedRobotId: 'r1' }],
  ['a company', { activeHubTile: 'robots', selectedCompanyId: 'c1', allRobotsSelected: false }],
  ['All Probes', { activeHubTile: 'robots', allProbesSelected: true }],
  ['Fleet Params', { activeHubTile: 'audioRig' }],
];

const exitRow = (container: HTMLElement) => container.querySelector('.screen-exit-row');

describe('ContentPane — the Back / Close row on every open screen (backlog 75 Task 8)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it.each(OPEN_SCREENS)('renders the row with Back and Close on %s', (_name, nav) => {
    useUIStore.setState(nav);
    const { container } = render(<ContentPane />);
    const row = exitRow(container);
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('button', { name: labels('nav.back').humanLabel })).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('button', { name: labels('nav.close').humanLabel })).toBeTruthy();
  });

  it('renders no row on the deck', () => {
    render(<ContentPane />);
    expect(screen.queryByRole('button', { name: labels('nav.close').humanLabel })).toBeNull();
  });

  it('puts the row first in the plate, above ConsolePanel and outside its scroller', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    const { container } = render(<ContentPane />);
    const pane = container.querySelector('.content-pane')!;
    const row = exitRow(container)!;
    expect(row.parentElement).toBe(pane);
    expect(pane.firstElementChild).toBe(row);
    expect(row.nextElementSibling).toBe(screen.getByTestId('console-panel-stub'));
    expect(row.closest('.console-panel, .console-panel__content')).toBeNull();
  });

  it('a press on the row navigates: Close from a robot leaves the deck, and the plate goes', () => {
    useUIStore.setState({ activeHubTile: 'robots', selectedRobotId: 'r1' });
    const { container } = render(<ContentPane />);
    fireEvent.click(screen.getByRole('button', { name: labels('nav.close').humanLabel }));
    expect(useUIStore.getState().activeHubTile).toBeNull();
    expect(container.querySelector('.content-pane')).toBeNull();
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
