import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ConsolePanel } from './ConsolePanel';
import { useUIStore } from '@/stores/uiStore';

// ProbesContent has its own full test suite (ProbesContent.test.tsx,
// docs/tasks/NAV_LAYOUT_REWRITE.md Task 19) — this file is about ConsolePanel's own tile
// switch, not re-testing its content.
vi.mock('../nav/content/ProbesContent', () => ({
  ProbesContent: () => <div data-testid="probes-content-stub" />,
  default: () => <div data-testid="probes-content-stub" />,
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
// CompaniesContent has its own full test suite (CompaniesContent.test.tsx,
// docs/tasks/NAV_LAYOUT_REWRITE.md Task 20) — this file is about ConsolePanel's own tile
// switch, not re-testing its content.
vi.mock('../nav/content/CompaniesContent', () => ({
  CompaniesContent: () => <div data-testid="companies-content-stub" />,
  default: () => <div data-testid="companies-content-stub" />,
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
  });

  it('renders ProbesContent when robots is active and no robot is selected', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot(null);
    render(<ConsolePanel />);
    expect(screen.getByTestId('probes-content-stub')).toBeTruthy();
  });

  // The nested robot-detail level's own Back button (Console Retreat) was removed —
  // NavBreadcrumb's clickable "Probes" segment covers the same one-step-back need now
  // (NavBreadcrumb.test.tsx covers that click); ConsolePanel itself no longer renders anything
  // back-button-related regardless of whether a robot is selected.
  it('renders ProbesContent with no Back button when robots is active and a robot is selected — ProbesContent itself decides what to show for a selected robot (Task 19)', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('r1');
    render(<ConsolePanel />);
    expect(screen.getByTestId('probes-content-stub')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('renders FleetParamsContent when audioRig is active', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<ConsolePanel />);
    expect(screen.getByTestId('fleet-params-content-stub')).toBeTruthy();
  });

  it('renders SettingsContent when settings is active', () => {
    useUIStore.getState().setActiveHubTile('settings');
    render(<ConsolePanel />);
    expect(screen.getByTestId('settings-content-stub')).toBeTruthy();
  });

  it('renders CompaniesContent when companies is active', () => {
    useUIStore.getState().setActiveHubTile('companies');
    render(<ConsolePanel />);
    expect(screen.getByTestId('companies-content-stub')).toBeTruthy();
  });
});
