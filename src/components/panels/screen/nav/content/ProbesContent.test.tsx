import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProbesContent } from './ProbesContent';
import { CONTENT } from '@/content';
import { useUIStore } from '@/stores/uiStore';

// RobotsTab/RobotOptionsTab/CompanyOptionsSection each have their own full test suite — this
// file is about ProbesContent's own routing between the 3, not re-testing their content.
vi.mock('../../console/RobotsTab', () => ({
  RobotsTab: () => <div data-testid="robots-tab-stub" />,
}));
vi.mock('../../console/RobotOptionsTab', () => ({
  RobotOptionsTab: () => <div data-testid="robot-options-tab-stub" />,
}));
vi.mock('@/components/company/CompanyOptionsSection', () => ({
  CompanyOptionsSection: () => <div data-testid="company-options-section-stub" />,
}));

const UI_INITIAL_STATE = useUIStore.getState();

describe('ProbesContent — routes the Probes branch to the browse list, a single robot, or the All Probes bulk-edit target (docs/tasks/NAV_LAYOUT_REWRITE.md Task 19)', () => {
  beforeEach(() => {
    useUIStore.setState(UI_INITIAL_STATE, true);
  });

  it('shows RobotsTab (the browse list) for the bare "Probes" node — no robot selected, All Probes not selected', () => {
    render(<ProbesContent />);

    expect(screen.getByTestId('robots-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('robot-options-tab-stub')).toBeNull();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('shows RobotOptionsTab when a specific robot is selected — "Probes -> Probe N"', () => {
    useUIStore.getState().selectRobot('r1');

    render(<ProbesContent />);

    expect(screen.getByTestId('robot-options-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('robots-tab-stub')).toBeNull();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('shows CompanyOptionsSection (broadcast target) when allProbesSelected is true — "Probes -> All Probes"', () => {
    useUIStore.getState().setAllProbesSelected(true);

    render(<ProbesContent />);

    expect(screen.getByTestId('company-options-section-stub')).toBeTruthy();
    expect(screen.queryByTestId('robots-tab-stub')).toBeNull();
    expect(screen.queryByTestId('robot-options-tab-stub')).toBeNull();
  });

  it('prefers a specific selected robot over allProbesSelected — selecting Probe N after All Probes leaves All Probes', () => {
    useUIStore.getState().setAllProbesSelected(true);
    useUIStore.getState().selectRobot('r1');

    render(<ProbesContent />);

    expect(screen.getByTestId('robot-options-tab-stub')).toBeTruthy();
    expect(screen.queryByTestId('company-options-section-stub')).toBeNull();
  });

  it('wraps the browse list (RobotsTab) in a "Probes" section IntroPanel — not shown for a selected robot or All Probes', () => {
    render(<ProbesContent />);
    expect(screen.getByText(CONTENT['probe.root'].intro.lore)).toBeTruthy();
  });

  it('wraps All Probes (CompanyOptionsSection) in its own "All Probes" IntroPanel', () => {
    useUIStore.getState().setAllProbesSelected(true);
    render(<ProbesContent />);
    expect(screen.getByText(CONTENT['probe.all'].intro.lore)).toBeTruthy();
  });

  it('renders no section-level IntroPanel for a selected robot (Individual Probes)', () => {
    useUIStore.getState().selectRobot('r1');
    render(<ProbesContent />);
    expect(screen.queryByText(CONTENT['probe.root'].intro.lore)).toBeNull();
    expect(screen.queryByText(CONTENT['probe.all'].intro.lore)).toBeNull();
  });
});

describe('ProbesContent reads its copy from src/content (docs/specs/CONTENT_LAYER.md, Task 13)', () => {
  it('carries no copy literal of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(__dirname, 'ProbesContent.tsx'), 'utf8');
    expect(source).not.toMatch(/(loreLabel|humanLabel|loreDescription|humanDescription)\s*:\s*['"`]/);
    expect(source).not.toMatch(/<h2>[A-Za-z]|>Robot not found</);
  });
});
