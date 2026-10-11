import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ConsolePanel } from './ConsolePanel';
import { useUIStore } from '@/stores/uiStore';

// Each screen has its own full test suite — this file is about ConsolePanel's own routing, not
// re-testing their content.
vi.mock('../screens/RosterBoard', () => ({
  RosterBoard: () => <div data-testid="roster-board-stub" />,
}));
vi.mock('../screens/RobotScreen', () => ({
  RobotScreen: () => <div data-testid="robot-screen-stub" />,
}));
vi.mock('../screens/FleetParamsScreen', () => ({
  FleetParamsScreen: () => <div data-testid="fleet-params-screen-stub" />,
}));
vi.mock('../screens/SettingsScreen', () => ({
  SettingsScreen: () => <div data-testid="settings-screen-stub" />,
}));
vi.mock('../screens/CompanyScreen', () => ({
  CompanyScreen: () => <div data-testid="company-screen-stub" />,
}));

const ROUTED = ['roster-board-stub', 'robot-screen-stub', 'company-screen-stub', 'fleet-params-screen-stub', 'settings-screen-stub'];
/** Every routed screen in the DOM, by its stub's test id. */
const shown = () => ROUTED.filter((id) => screen.queryByTestId(id));

describe('ConsolePanel', () => {
  // Explicit reset before each test, not relying on declaration order — runs
  // after RTL's own afterEach cleanup has already unmounted the previous
  // test's component, so mutating the store here doesn't trigger the
  // "update not wrapped in act()" warning an afterEach-based reset would
  // (that ordering bit us once already; see HubNav.test.tsx's history).
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('renders nothing when activeHubTile is null — navigation now lives in Header, not a tile-grid inside the console (docs/specs/HEADER_HUB_CONSOLIDATION.md §1.7)', () => {
    const { container } = render(<ConsolePanel />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('region', { name: 'Hub Navigation' })).toBeNull();
  });

  it('renders FleetParamsScreen when audioRig is active', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    render(<ConsolePanel />);
    expect(shown()).toEqual(['fleet-params-screen-stub']);
  });

  it('renders SettingsScreen when settings is active', () => {
    useUIStore.getState().setActiveHubTile('settings');
    render(<ConsolePanel />);
    expect(shown()).toEqual(['settings-screen-stub']);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 21 (spec §1.5): the roster board replaces the Probes list and the
// Companies index, so both branches show it when no entity is selected.
describe('ConsolePanel — the Probes branch', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.getState().setActiveHubTile('robots');
  });

  it('shows the roster board when no robot and not All Probes is selected', () => {
    render(<ConsolePanel />);
    expect(shown()).toEqual(['roster-board-stub']);
  });

  it('shows the robot screen when a robot is selected', () => {
    useUIStore.getState().selectRobot('r1');
    render(<ConsolePanel />);
    expect(shown()).toEqual(['robot-screen-stub']);
  });

  it('shows the company screen, as its All form, when All Probes is selected', () => {
    useUIStore.getState().setAllProbesSelected(true);
    render(<ConsolePanel />);
    expect(shown()).toEqual(['company-screen-stub']);
  });

  it('prefers a selected robot over All Probes', () => {
    useUIStore.getState().setAllProbesSelected(true);
    useUIStore.getState().selectRobot('r1');
    render(<ConsolePanel />);
    expect(shown()).toEqual(['robot-screen-stub']);
  });
});

describe('ConsolePanel — the Companies branch', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
    useUIStore.getState().setActiveHubTile('companies');
  });

  it('shows the roster board when no company is selected — no separate Companies index', () => {
    render(<ConsolePanel />);
    expect(shown()).toEqual(['roster-board-stub']);
    expect(screen.queryByTestId('company-create-form-stub')).toBeNull();
  });

  it('shows the company screen when a company is selected', () => {
    useUIStore.getState().selectCompany('c1');
    render(<ConsolePanel />);
    expect(shown()).toEqual(['company-screen-stub']);
  });

  it("keeps the roster board for the Companies page even if All Probes was left selected (that form belongs to the Probes branch)", () => {
    useUIStore.getState().setAllProbesSelected(true);
    render(<ConsolePanel />);
    expect(shown()).toEqual(['roster-board-stub']);
  });
});

describe('ConsolePanel reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 16)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'ConsolePanel.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|placeholder)\s*:\s*['"`]/);
    expect(source).not.toMatch(/aria-label="[A-Za-z]|'Power (on|off)'|'Mutation'|`(Increment|Decrement) \$\{|Held off by Audio Load|>Power off\?<|All audio will stop\./);
    expect(source).not.toMatch(/^\s+(triangle|sine|square|sawtooth): '[A-Z]/m);
  });
});
