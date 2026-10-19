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
import { GEM_CANVAS_H, gemWidth, getRobotGem } from './gem/polygon';
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
  return { robot, ...render(<Robot robotId={robot.id} />) };
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

  // Code review 2026-10-11 (spec §1.2): a pick from the world collapses the nav list like one from the list.
  it('with the Probes list open, a world pick is a nav pick: it selects the robot and collapses the list', () => {
    useUIStore.setState({ activeHubTile: 'robots', expandedTopLevelBranch: 'probes' });
    const { container } = renderRobot({ id: 'r1' });
    fireEvent.click(container.querySelector('.robot') as Element);

    expect(useUIStore.getState().selectedRobotId).toBe('r1');
    expect(useUIStore.getState().activeHubTile).toBe('robots');
    expect(useUIStore.getState().expandedTopLevelBranch).not.toBe('probes');
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

  // Phase 53 Task 13 (spec §1.4): the position is the mover's, not the group's. The wrapper is what
  // the swim, the bob, the station arc and the camera read and write, so it is what gets placed.
  it('the mount gsap.set targets the mover wrapper, never the .robot group', () => {
    const setSpy = vi.spyOn(gsap, 'set');
    const { container } = renderRobot({ id: 'r1' });
    const call = setSpy.mock.calls.find(([, vars]) => vars !== null && typeof vars === 'object' && 'x' in (vars as object));
    expect(call![0]).toBe(container.querySelector('.mover--robot'));
    expect(call![0]).not.toBe(container.querySelector('g.robot'));
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
    expect(refAtCall).toBe(container.querySelector('.mover--robot'));
  });

  it('a re-render does not call it again', () => {
    const { rerender } = renderRobot({ id: 'r1' });
    rerender(<Robot robotId="r1" />);
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
      <>
        {(['a', 'b'] as const).map((id) => {
          useLocaleStore.getState().addRobot(localeId, makeRobot({ id }));
          return <Robot key={id} robotId={id} />;
        })}
      </>,
    );
    expect([...container.querySelectorAll('g.robot')].map((g) => g.id)).toEqual(['world-robot-a', 'world-robot-b']);
  });
});

// Phase 53 Task 13 (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.3, §1.4): a robot is a mover — a small
// positioned wrapper that is its own compositor layer — holding an svg the size of its gem canvas,
// holding the unchanged robot group. The wrapper is what GSAP moves and what the registry hands out.
describe('Robot — the mover (Phase 53 Task 13)', () => {
  /** Two seeds whose gems have different canvas widths, so a hard-coded width cannot pass. */
  const seeds = (() => {
    const first = 101;
    const other = Array.from({ length: 400 }, (_, i) => i + 102).find(
      (s) => getRobotGem(s).widthFactor !== getRobotGem(first).widthFactor,
    )!;
    return [first, other] as const;
  })();

  beforeEach(() => {
    vi.mocked(onRobotMounted).mockReset();
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
  });

  it('is div.mover.mover--robot[data-robot-id] › svg.mover__svg › g#world-robot-{id}.robot', () => {
    const { container } = renderRobot({ id: 'r1', gemSeed: seeds[0] });
    const mover = container.firstElementChild!;
    expect(mover.tagName).toBe('DIV');
    expect(mover.classList.contains('mover')).toBe(true);
    expect(mover.classList.contains('mover--robot')).toBe(true);
    expect(mover.getAttribute('data-robot-id')).toBe('r1');
    expect(container.children).toHaveLength(1);
    expect(mover.children).toHaveLength(1);
    const svg = mover.firstElementChild!;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('class')).toBe('mover__svg');
    expect(svg.children).toHaveLength(1);
    expect(svg.firstElementChild).toBe(container.querySelector('g.robot'));
    expect(svg.firstElementChild!.id).toBe('world-robot-r1');
  });

  it.each(seeds)('the svg is the gem canvas of seed %s, and its overflow shows (halo, orbiters, decorations)', (gemSeed) => {
    const { container } = renderRobot({ id: 'r1', gemSeed });
    const gem = getRobotGem(gemSeed);
    const svg = container.querySelector('.mover--robot > svg')!;
    expect(svg.getAttribute('width')).toBe(String(gemWidth(gem)));
    expect(svg.getAttribute('height')).toBe(String(GEM_CANVAS_H));
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${gemWidth(gem)} ${GEM_CANVAS_H}`);
    expect(svg.getAttribute('overflow')).toBe('visible');
  });

  it('the two seeds really do differ in width', () => {
    expect(gemWidth(getRobotGem(seeds[0]))).not.toBe(gemWidth(getRobotGem(seeds[1])));
  });

  it('the slot is the row: background → robots-back; foreground and unset → robots', () => {
    const slotOf = (layer?: RobotType['layer']) => {
      useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
      const { container, unmount } = renderRobot({ id: 'r1', layer });
      const slot = container.querySelector('.mover--robot')!.getAttribute('data-scene-slot');
      unmount();
      return slot;
    };
    expect(slotOf('background')).toBe('robots-back');
    expect(slotOf('foreground')).toBe('robots');
    expect(slotOf(undefined)).toBe('robots');
  });

  it('a layer write changes the slot on the very same mover — it is not re-mounted', () => {
    const { container } = renderRobot({ id: 'r1' });
    const mover = container.querySelector('.mover--robot')!;
    const group = container.querySelector('g.robot')!;
    expect(mover.getAttribute('data-scene-slot')).toBe('robots');

    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { layer: 'background' }));
    expect(container.querySelector('.mover--robot')).toBe(mover);
    expect(container.querySelector('g.robot')).toBe(group);
    expect(mover.getAttribute('data-scene-slot')).toBe('robots-back');

    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { layer: 'foreground' }));
    expect(mover.getAttribute('data-scene-slot')).toBe('robots');
    expect(onRobotMounted).toHaveBeenCalledTimes(1);
  });

  it('registers the wrapper as robot-{id}, and drops the registration on unmount', () => {
    const { container, unmount } = renderRobot({ id: 'r1' });
    expect(getRef('robot-r1')).toBe(container.querySelector('.mover--robot'));
    unmount();
    expect(getRef('robot-r1')).toBeUndefined();
  });

  // The global gsap mock (vitest.setup.ts) records calls and renders nothing, so the placement is
  // read off the set call; the real transform is workLoop.test.ts's, which unmocks gsap.
  it('places the wrapper at the robot\'s position at mount, once, and the robot group carries no transform', () => {
    const setSpy = vi.spyOn(gsap, 'set');
    const { container } = renderRobot({ id: 'r1', position: { x: 33, y: 44 } });
    const placements = setSpy.mock.calls.filter(([, vars]) => vars !== null && typeof vars === 'object' && 'x' in (vars as object));
    expect(placements).toHaveLength(1);
    expect(placements[0][0]).toBe(container.querySelector('.mover--robot'));
    expect(placements[0][1]).toMatchObject({ x: 33, y: 44 });
    const group = container.querySelector('g.robot')!;
    expect(group.getAttribute('transform')).toBeNull();
    expect((group as SVGGElement).style.transform).toBe('');
    setSpy.mockRestore();
  });

  it('a re-render (a battery write, a layer write) never places it again — the animation owns the position', () => {
    const { container } = renderRobot({ id: 'r1', position: { x: 33, y: 44 } });
    const setSpy = vi.spyOn(gsap, 'set');
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { batteryLevel: 10 }));
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { layer: 'background' }));
    expect(container.querySelector('.mover--robot')!.getAttribute('data-scene-slot')).toBe('robots-back');
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
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
