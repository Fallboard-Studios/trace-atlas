import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ConsolePanel } from './ConsolePanel';
import { useUIStore } from '@/stores/uiStore';

// RobotsTab/RobotOptionsTab pull in real Tone.js/AudioEngine and GSAP, both of
// which throw in this jsdom test environment — the same boundary
// ScreenViewport.test.tsx draws around its Tone/GSAP-touching children. This
// test is about ConsolePanel's own grid/tile/nested-detail switch, not about
// re-testing those components.
vi.mock('./RobotsTab', () => ({
  RobotsTab: () => <div data-testid="robots-list-stub" />,
  default: () => <div data-testid="robots-list-stub" />,
}));
vi.mock('./RobotOptionsTab', () => ({
  RobotOptionsTab: () => <div data-testid="robot-options-stub" />,
  default: () => <div data-testid="robot-options-stub" />,
}));
// FleetParamsContent has its own full test suite (FleetParamsContent.test.tsx,
// docs/tasks/NAV_LAYOUT_REWRITE.md Task 14) — this file is about ConsolePanel's own tile
// switch, not re-testing its content.
vi.mock('../nav/content/FleetParamsContent', () => ({
  FleetParamsContent: () => <div data-testid="fleet-params-content-stub" />,
  default: () => <div data-testid="fleet-params-content-stub" />,
}));
// SettingsContent has its own full test suite (SettingsContent.test.tsx,
// docs/tasks/NAV_LAYOUT_REWRITE.md Task 11) — this file is about ConsolePanel's own tile
// switch, not re-testing its content.
vi.mock('../nav/content/SettingsContent', () => ({
  SettingsContent: () => <div data-testid="settings-content-stub" />,
  default: () => <div data-testid="settings-content-stub" />,
}));
// CompanyManager has its own full test suite (CompanyManager.test.tsx) — this
// is Task 1's placeholder 'companies' tile entry (docs/tasks/NAV_LAYOUT_REWRITE.md),
// unchanged content, just a new HubTile value routed to it.
vi.mock('@/components/company/CompanyManager', () => ({
  CompanyManager: () => <div data-testid="company-manager-stub" />,
  default: () => <div data-testid="company-manager-stub" />,
}));

describe('ConsolePanel', () => {
  // Explicit reset before each test, not relying on declaration order — runs
  // after RTL's own afterEach cleanup has already unmounted the previous
  // test's component, so mutating the store here doesn't trigger the
  // "update not wrapped in act()" warning an afterEach-based reset would
  // (that ordering bit us once already; see HubNav.test.tsx's history).
  beforeEach(() => {
    useUIStore.getState().setActiveHubTile(null);
    useUIStore.getState().selectRobot(null);
  });

  it('renders nothing when activeHubTile is null — navigation now lives in Header, not a tile-grid inside the console (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.7)', () => {
    const { container } = render(<ConsolePanel />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('region', { name: 'Hub Navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders RobotsTab (the list) when robots is active and no robot is selected, with no Back button — Header\'s nav already gets back to the blank hub from here', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot(null);
    render(<ConsolePanel />);
    expect(screen.getByTestId('robots-list-stub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders RobotOptionsTab (the robot detail view) with a Back button when robots is active and a robot is selected — the one nesting level Header\'s nav has no direct equivalent for', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    render(<ConsolePanel />);
    expect(screen.getByTestId('robot-options-stub')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('renders FleetParamsContent when audioRig is active, with no Back button', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<ConsolePanel />);
    expect(screen.getByTestId('fleet-params-content-stub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders SettingsContent when settings is active, with no Back button', () => {
    useUIStore.getState().setActiveHubTile('settings');
    render(<ConsolePanel />);
    expect(screen.getByTestId('settings-content-stub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders CompanyManager when companies is active, with no Back button — Task 1 placeholder entry, real relocation is a later task', () => {
    useUIStore.getState().setActiveHubTile('companies');
    render(<ConsolePanel />);
    expect(screen.getByTestId('company-manager-stub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('back from a selected robot\'s editor clears selectedRobotId but stays on the robots tile', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    render(<ConsolePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(useUIStore.getState().selectedRobotId).toBeNull();
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });
});
