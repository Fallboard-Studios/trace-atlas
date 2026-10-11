import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import gsap from 'gsap';

// This test is about Robot.tsx's own click/navigation behavior (Roadmap Phase 8, Task 11), not
// about RobotBody's rendering or the work loop's real motion — same boundary
// ConsolePanel.test.tsx already draws around components that pull in real Tone.js/AudioEngine
// machinery this test doesn't need to exercise.
vi.mock('@/components/robot/RobotBody', () => ({
  RobotBody: () => <g data-testid="robot-body-stub" />,
}));
vi.mock('@/systems/workLoop', () => ({
  onRobotMounted: vi.fn(),
}));

import { Robot } from './Robot';
import { onRobotMounted } from '@/systems/workLoop';
import { getRef } from '@/utils/refs';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '@/stores/attenuationStyleStore';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import type { Robot as RobotType } from '@/types/Robot';
import type { Locale } from '@/types/locale';

function makeRobot(overrides: Partial<RobotType> = {}): RobotType {
  return {
    id: 'r1',
    position: { x: 10, y: 20 },
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

  // docs/tasks/LAYOUT_REWORK.md Task 4: opening Probes from the Deck goes through navActions like any
  // other pick. Crawford, 2026-10-10: an entity pick collapses the list, so the robot opens with the
  // nav panel at rest.
  it('from the Deck, opens the robot through navActions, with the nav list collapsed', () => {
    useUIStore.setState({ expandedTopLevelBranch: 'probes', allProbesSelected: true });
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState()).toMatchObject({
      activeHubTile: 'robots',
      expandedTopLevelBranch: null,
      selectedRobotId: 'r1',
      allProbesSelected: false,
    });
  });

  it('with a tile open, leaves the nav list as it was (a halo, not a navigation)', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: null });
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState().expandedTopLevelBranch).toBeNull();
    expect(useUIStore.getState().selectedRobotId).toBe('r1');
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

  it('the mount gsap.set places the robot at its position with no scaleX', () => {
    const setSpy = vi.spyOn(gsap, 'set');
    renderRobot({ id: 'r1' });
    const call = setSpy.mock.calls.find(([, vars]) => vars !== null && typeof vars === 'object' && 'x' in (vars as object));
    expect(call).toBeDefined();
    expect(call![1]).not.toHaveProperty('scaleX');
    expect(call![1]).toMatchObject({ x: 10, y: 20, transformOrigin: '50% 50%' });
    setSpy.mockRestore();
  });
});

describe('Robot mount hands the robot to the work loop (Phase 43 Task 23)', () => {
  beforeEach(() => {
    vi.mocked(onRobotMounted).mockReset();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it('calls onRobotMounted(localeId, robotId) once, with its body already registered', () => {
    let refAtCall: unknown;
    vi.mocked(onRobotMounted).mockImplementation((_l, id) => {
      refAtCall = getRef(`robot-${id}`);
    });
    const { container } = renderRobot({ id: 'r1' });
    const currentLocaleId = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())?.currentLocaleId ?? '';
    expect(onRobotMounted).toHaveBeenCalledTimes(1);
    expect(onRobotMounted).toHaveBeenCalledWith(currentLocaleId, 'r1');
    expect(refAtCall).toBe(container.querySelector('g.robot'));
  });

  it('a re-render does not call it again', () => {
    const { rerender } = renderRobot({ id: 'r1' });
    rerender(<svg><Robot robotId="r1" /></svg>);
    useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 40 });
    expect(onRobotMounted).toHaveBeenCalledTimes(1);
  });
});

// Phase 43 Task 34 (spec §1.10): the layer-switch dissolve draws a copy of the robot as an SVG
// `<use>` in the other robot row, which needs the group's DOM id; the back row's 0.75 scale is a
// wrapper's, about the gem canvas centre, so it never fights the swim's own transform on `.robot`.
describe('Robot — the dissolve id and the row wrapper (Phase 43 Task 34)', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it('the robot group carries world-robot-${id}, the `<use>` target', () => {
    const { container } = renderRobot({ id: 'r1' });
    expect(container.querySelector('g.robot')!.id).toBe('world-robot-r1');
  });

  it('the body sits in one .robot__row wrapper, the robot group\'s only child', () => {
    const { container } = renderRobot({ id: 'r1' });
    const robotEl = container.querySelector('g.robot')!;
    expect(robotEl.children).toHaveLength(1);
    const row = robotEl.children[0];
    expect(row.tagName.toLowerCase()).toBe('g');
    expect(row.classList.contains('robot__row')).toBe(true);
    expect(row.querySelector('[data-testid="robot-body-stub"]')).not.toBeNull();
  });

  it('two robots get two ids', () => {
    const { container } = render(
      <svg>
        {(['a', 'b'] as const).map((id) => {
          useLocaleStore.getState().addRobot(localeId, makeRobot({ id }));
          return <Robot key={id} robotId={id} />;
        })}
      </svg>,
    );
    expect([...container.querySelectorAll('g.robot')].map((g) => g.id)).toEqual(['world-robot-a', 'world-robot-b']);
  });
});

// docs/tasks/LAYOUT_REWORK.md Task 24 (spec §1.7): selection is a halo only. The group carries --halo, which
// OceanScene.css reads for its drop-shadows: the robot's identityColor when it is selected, the company's
// colour when it is a member of the selected company.
describe('Robot halo colour (--halo)', () => {
  const IDENTITY = '#428d95';
  const RUST = '#b5502a';
  const halo = (container: HTMLElement) => (container.querySelector('g.robot') as SVGGElement).style.getPropertyValue('--halo');
  const addCompany = (id: string, color: string) =>
    useLocaleStore.getState().addCompany(localeId, { id, name: id, color, robotIds: [] });

  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
    useUIStore.getState().selectAllRobots();
    useUIStore.getState().setAllProbesSelected(false);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  });

  it('a selected robot carries its own identityColor', () => {
    useUIStore.getState().selectRobot('r1');
    const { container } = renderRobot({ id: 'r1', identityColor: IDENTITY });
    expect(halo(container)).toBe(IDENTITY);
  });

  it("a member of the selected company carries the company's colour, not its own", () => {
    addCompany('c1', RUST);
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c1', identityColor: IDENTITY });
    expect(halo(container)).toBe(RUST);
  });

  it('a robot that is selected and a member keeps its own colour (the selection is the more specific)', () => {
    addCompany('c1', RUST);
    useUIStore.getState().selectCompany('c1');
    useUIStore.getState().selectRobot('r1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c1', identityColor: IDENTITY });
    expect(halo(container)).toBe(IDENTITY);
  });

  it('a robot that is neither selected nor a member carries no halo colour', () => {
    addCompany('c1', RUST);
    addCompany('c2', '#112233');
    useUIStore.getState().selectCompany('c1');
    useUIStore.getState().selectRobot('someone-else');
    const { container } = renderRobot({ id: 'r1', companyId: 'c2', identityColor: IDENTITY });
    expect(halo(container)).toBe('');
  });

  it('a Freelance robot carries none when a company is selected', () => {
    addCompany('c1', RUST);
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: undefined, identityColor: IDENTITY });
    expect(halo(container)).toBe('');
  });

  it('under All Probes nobody carries one: no company is selected, so no one is a member', () => {
    addCompany('c1', RUST);
    useUIStore.getState().setAllProbesSelected(true);
    const { container } = renderRobot({ id: 'r1', companyId: 'c1', identityColor: IDENTITY });
    expect(container.querySelector('.robot.isCompanyMember')).toBeNull();
    expect(halo(container)).toBe('');
  });

  it('a member of a company the roster no longer has carries none (the CSS falls back), but keeps its class', () => {
    useUIStore.getState().selectCompany('gone');
    const { container } = renderRobot({ id: 'r1', companyId: 'gone', identityColor: IDENTITY });
    expect(container.querySelector('.robot.isCompanyMember')).toBeTruthy();
    expect(halo(container)).toBe('');
  });

  it('a selected robot with no identityColor carries none rather than the string undefined', () => {
    useUIStore.getState().selectRobot('r1');
    const { container } = renderRobot({ id: 'r1' });
    expect(halo(container)).toBe('');
  });

  it('follows the selection: picking another company repaints the members, and clearing it removes the halo', () => {
    addCompany('c1', RUST);
    addCompany('c2', '#112233');
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c2', identityColor: IDENTITY });
    expect(halo(container)).toBe('');

    act(() => useUIStore.getState().selectCompany('c2'));
    expect(halo(container)).toBe('#112233');

    act(() => useUIStore.getState().selectAllRobots());
    expect(halo(container)).toBe('');
  });

  it("follows the company's colour when it changes", () => {
    addCompany('c1', RUST);
    useUIStore.getState().selectCompany('c1');
    const { container } = renderRobot({ id: 'r1', companyId: 'c1', identityColor: IDENTITY });

    act(() => useLocaleStore.getState().updateCompany(localeId, 'c1', { color: '#00aa00' }));

    expect(halo(container)).toBe('#00aa00');
  });

  it("keeps the click handler's cursor style", () => {
    useUIStore.getState().selectRobot('r1');
    const { container } = renderRobot({ id: 'r1', identityColor: IDENTITY });
    expect((container.querySelector('g.robot') as SVGGElement).style.cursor).toBe('pointer');
  });
});
