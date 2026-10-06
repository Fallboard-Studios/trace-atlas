import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import gsap from 'gsap';

// This test is about Robot.tsx's own click/navigation behavior (Roadmap Phase 8, Task 11), not
// about RobotBody's rendering or idleSystem's real wander behavior — same boundary
// ConsolePanel.test.tsx already draws around components that pull in real Tone.js/AudioEngine
// machinery this test doesn't need to exercise.
vi.mock('@/components/robot/RobotBody', () => ({
  RobotBody: () => <g data-testid="robot-body-stub" />,
}));
vi.mock('@/systems/idleSystem', () => ({
  handleRobotIdle: vi.fn(),
}));

import { Robot } from './Robot';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot as RobotType } from '@/types/Robot';
import type { Locale } from '@/types/locale';

function makeRobot(overrides: Partial<RobotType> = {}): RobotType {
  return {
    id: 'r1',
    state: 'idle',
    position: { x: 10, y: 20 },
    destination: null,
    direction: 'right',
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
      filterFreq: 0,
      waveform: 'sine',
    },
    octaveRange: [3, 4],
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: 'active',
    batteryLevel: 80,
    ...overrides,
  } as RobotType;
}

const localeId = getActiveLocaleId();

/** Seeds the store with the given robot and renders <Robot> by id — the component now looks its
 *  own robot up from the store rather than receiving it as a prop (docs/todo/backlog.md #27
 *  follow-up, 2026-09-15), so every test needs a real robot in the store first. */
function renderRobot(overrides: Partial<RobotType> = {}) {
  const robot = makeRobot(overrides);
  useLocaleStore.getState().addRobot(localeId, robot);
  return { robot, ...render(<svg><Robot robotId={robot.id} /></svg>) };
}

describe('Robot click routing (Roadmap Phase 8)', () => {
  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it('selects the robot and opens the robots tile when clicked from the main hub grid', () => {
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });

  it('selects the robot but does not change the active tile when a tile is already open', () => {
    useUIStore.getState().setActiveHubTile('audioRig');
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('audioRig');
  });

  it('does not change the active tile when the robots tile (with a different robot selected) is already open', () => {
    useUIStore.getState().setActiveHubTile('robots');
    useUIStore.getState().selectRobot('some-other-robot');
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
  });
});

describe('Robot company-member glow (Roadmap Phase 10)', () => {
  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
    useUIStore.getState().selectAllRobots();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it('applies isCompanyMember when the robot belongs to the selected company', () => {
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c1' });

    expect(container.querySelector('.robot.isCompanyMember')).toBeTruthy();
  });

  it('does not apply isCompanyMember when the robot belongs to a different company', () => {
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c2' });

    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
  });

  it('does not apply isCompanyMember by default (All selected), even for a robot with a companyId', () => {
    const { container } = renderRobot({ id: 'r1', companyId: 'c1' });

    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
  });

  it('does not apply isCompanyMember to a Freelance robot even when some company is selected', () => {
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: undefined });

    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
  });

  it('leaves isSelected (selectedRobotId-driven) completely unaffected by company selection', () => {
    useUIStore.getState().selectRobot('r1');
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c2' });

    const el = container.querySelector('.robot')!;
    expect(el.classList.contains('selected')).toBe(true);
    expect(el.classList.contains('isCompanyMember')).toBe(false);
  });

  it('applies both selected and isCompanyMember together when both conditions hold', () => {
    useUIStore.getState().selectRobot('r1');
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c1' });

    const el = container.querySelector('.robot')!;
    expect(el.classList.contains('selected')).toBe(true);
    expect(el.classList.contains('isCompanyMember')).toBe(true);
  });

  // "All" is the default selection now, so it must NOT glow every robot — the glow is what marks a
  // specific company's members apart from the rest (2026-09-18).
  it('does not apply isCompanyMember to any robot when "All" is selected, regardless of its company', () => {
    useUIStore.getState().selectAllRobots();
    const { container } = renderRobot({ id: 'r1', companyId: 'c2' });

    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
  });

  it('does not apply isCompanyMember to a Freelance robot (no companyId) when "All" is selected', () => {
    useUIStore.getState().selectAllRobots();
    const { container } = renderRobot({ id: 'r1', companyId: undefined });

    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
  });
});

describe('Robot mount transform (Phase 40 Task 7b — no flip)', () => {
  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it.each(['left', 'right'] as const)("the mount gsap.set has no scaleX, regardless of direction (%s)", (direction) => {
    const setSpy = vi.spyOn(gsap, 'set');
    renderRobot({ id: 'r1', direction });
    const call = setSpy.mock.calls.find(([, vars]) => vars !== null && typeof vars === 'object' && 'x' in (vars as object));
    expect(call).toBeDefined();
    expect(call![1]).not.toHaveProperty('scaleX');
    expect(call![1]).toMatchObject({ x: 10, y: 20, transformOrigin: '50% 50%' });
    setSpy.mockRestore();
  });
});
