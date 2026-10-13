import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 21 (spec §1.5): one roster row-tile — the gem in the card render
 * context, the name, one status line and a thin battery strip. A click opens the robot.
 * Task 22: the Move chip beside the face — a popover on the desk, a sheet on the phone.
 */

// A subscribing mock, as the real hook is (useSyncExternalStore over matchMedia): jsdom has no
// matchMedia, which would make every test the phone shell.
const shell = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    current: 'desk' as 'desk' | 'phone',
    set(next: 'desk' | 'phone') {
      this.current = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('@/components/panels/screen/useShell', async (importOriginal) => {
  const { useSyncExternalStore } = await import('react');
  return {
    ...(await importOriginal<typeof import('@/components/panels/screen/useShell')>()),
    useShell: () => useSyncExternalStore((listener) => shell.subscribe(listener), () => shell.current),
  };
});

// Radix's Popover.Content is wrapped (still the real one) only to record the collision boundary it is
// handed, which jsdom cannot place anything against (HelpPopover.test.tsx's pattern).
const seen = vi.hoisted(() => ({ collisionBoundary: undefined as unknown }));
vi.mock('@radix-ui/react-popover', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@radix-ui/react-popover')>();
  const { forwardRef, createElement } = await import('react');
  const Content = forwardRef<HTMLDivElement, Parameters<typeof actual.Content>[0]>((props, ref) => {
    seen.collisionBoundary = props.collisionBoundary;
    return createElement(actual.Content, { ...props, ref });
  });
  return { ...actual, Content };
});

import { RosterTile, ROSTER_BATTERY_BOX_COUNT, ROSTER_BATTERY_BOX_SIZE, ROSTER_BATTERY_BOX_GAP, MOVE_LONG_PRESS_MS, MOVE_CHIP_HEIGHT } from './RosterTile';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import { CONTENT, fill } from '@/content';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle } from '@/utils/traitColors';
import { getRobotGem, gemViewBox } from '@/components/robot/gem/polygon';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL, DOCKING_STATE_LABELS, ACTIVITY_LABELS, AUDIBILITY_LABELS } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';
import type { Company } from '@/types/Company';

const localeId = getActiveLocaleId();

function makeRobot(id: string, overrides: Partial<Robot> = {}): Robot {
  return {
    id,
    name: `Unit ${id}`,
    identityColor: '#ae5378',
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: { adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 }, filterFreq: 0, waveform: 'sine' },
    octaveRange: [3, 4],
    masterVolume: 0.7,
    docking: 'active',
    activity: 'working',
    batteryLevel: 85,
    audioMode: 'none',
    job: 'acousticSurvey',
    gemSeed: 20261004,
    ...overrides,
  } as Robot;
}

function addRobots(...robots: Robot[]) {
  for (const robot of robots) useLocaleStore.getState().addRobot(localeId, robot);
}

const onMove = vi.fn();
const renderTile = (robotId: string) => render(<ul><RosterTile robotId={robotId} onMove={onMove} /></ul>);
const face = (name: string) => screen.getByRole('button', { name });
/** Where the battery strip's partly-filled box sits: every box before it is full. */
const straddleIndex = (container: HTMLElement) => {
  const track = container.querySelector('.roster-tile__battery .sc-voxel-track')!;
  return [...track.children].findIndex((box) => box.classList.contains('sc-voxel-track__straddle'));
};

beforeEach(() => {
  shell.set('desk');
  onMove.mockClear();
  useUIStore.setState(useUIStore.getInitialState(), true);
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
});

afterEach(() => {
  useAudioStore.setState({ soundingRobotIds: [] });
});

describe('RosterTile — what it shows', () => {
  it('names the robot, on the face and as the face button\'s accessible name', () => {
    addRobots(makeRobot('r0', { name: 'Tidal Wisp' }));
    renderTile('r0');
    expect(face('Tidal Wisp').querySelector('.roster-tile__name')?.textContent).toBe('Tidal Wisp');
  });

  it.each([['no name', undefined], ['a blank name', '']])('falls back to the id for %s', (_, name) => {
    addRobots(makeRobot('r7', { name }));
    renderTile('r7');
    expect(face('r7')).toBeTruthy();
  });

  it('draws the gem in the card render context, framed to its own viewBox', () => {
    addRobots(makeRobot('r0', { gemSeed: 777 }));
    const { container } = renderTile('r0');
    const gem = container.querySelector('svg.roster-tile__gem')!;
    expect(gem.getAttribute('viewBox')).toBe(gemViewBox(getRobotGem(777)));
    expect(gem.getAttribute('aria-hidden')).toBe('true');
    expect(gem.children.length).toBeGreaterThan(0);
  });

  it('carries one status line: the job, then the docking, activity and emission states', () => {
    addRobots(makeRobot('r0', { job: 'acousticSurvey', docking: 'active', activity: 'working', audioMode: 'none' }));
    const { container } = renderTile('r0');
    expect(container.querySelector('.roster-tile__status')?.textContent).toBe(fill('probe.roster.statusLine', {
      job: JOB_TYPE_LABELS.acousticSurvey.humanLabel,
      dockingState: DOCKING_STATE_LABELS.active.humanLabel,
      activity: ACTIVITY_LABELS.working.humanLabel,
      status: AUDIBILITY_LABELS.emitting.humanLabel,
    }));
  });

  // Code review 2026-10-11: the face button's aria-label replaces its content for assistive tech, so the
  // status line and battery were never announced; the status describes the button.
  it('describes the face button by its status line, so assistive tech hears more than the name', () => {
    addRobots(makeRobot('r0', { name: 'Tidal Wisp' }));
    const { container } = renderTile('r0');
    const button = face('Tidal Wisp');
    const status = container.querySelector('.roster-tile__status') as HTMLElement;
    expect(button.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.id).not.toBe('');
  });

  it('reads the unassigned job for a robot with no job yet', () => {
    addRobots(makeRobot('r0', { job: undefined }));
    const { container } = renderTile('r0');
    expect(container.querySelector('.roster-tile__status')?.textContent?.startsWith(UNASSIGNED_JOB_LABEL.humanLabel)).toBe(true);
  });

  it('reads the Audio Load budget and another robot\'s solo: standing by, then disabled', () => {
    addRobots(makeRobot('r0'), makeRobot('r1'));
    useAudioStore.setState({ soundingRobotIds: ['r1'] });
    const { container } = renderTile('r0');
    const status = () => container.querySelector('.roster-tile__status')!.textContent!;
    expect(status().endsWith(AUDIBILITY_LABELS.limited.humanLabel)).toBe(true);
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { audioMode: 'solo' }));
    expect(status().endsWith(AUDIBILITY_LABELS.disabled.humanLabel)).toBe(true);
  });

  it.each([
    [85, 8],
    [0, 0],
    [100, ROSTER_BATTERY_BOX_COUNT - 1],
    [84.6, 8],
  ])('fills the battery strip to the charge: %s%% puts the part-filled box at %s', (batteryLevel, index) => {
    addRobots(makeRobot('r0', { batteryLevel }));
    const { container } = renderTile('r0');
    const track = container.querySelector('.roster-tile__battery .sc-voxel-track')!;
    expect(track.children).toHaveLength(ROSTER_BATTERY_BOX_COUNT);
    expect(straddleIndex(container)).toBe(index);
  });

  it('rounds the charge to a whole percent, as the robot screen\'s readout does: 84.6% draws as 85%', () => {
    addRobots(makeRobot('r0', { batteryLevel: 84.6 }), makeRobot('r1', { batteryLevel: 85 }), makeRobot('r2', { batteryLevel: 84.4 }));
    const track = (id: string) => {
      const { container, unmount } = renderTile(id);
      const html = container.querySelector('.roster-tile__battery .sc-voxel-track')!.innerHTML.replace(/cabinet-voxel-roster-r\d-[^"]*/g, '');
      unmount();
      return html;
    };
    expect(track('r0')).toBe(track('r1'));
    expect(track('r2')).not.toBe(track('r1'));
  });

  // Found in Chrome: VoxelTrack is an absolutely-positioned overlay (it lies over a slider's track), so
  // without a positioned, sized box of its own it covered the whole tile.
  it('holds the battery strip in a positioned box of the track\'s own size, not over the tile', () => {
    addRobots(makeRobot('r0'));
    const { container } = renderTile('r0');
    const box = container.querySelector('.roster-tile__battery') as HTMLElement;
    const length = computeVoxelTrackLength(ROSTER_BATTERY_BOX_COUNT, ROSTER_BATTERY_BOX_SIZE, ROSTER_BATTERY_BOX_GAP) + computeVoxelTrackTrailingReserve('horizontal');
    expect(box.style.width).toBe(`${length}px`);
    expect(box.style.height).toBe(`${ROSTER_BATTERY_BOX_SIZE}px`);
    const css = readFileSync(resolve(__dirname, 'RosterTile.css'), 'utf8');
    expect(getCssRuleBody(css, '.roster-tile__battery')).toMatch(/position:\s*relative/);
  });

  it('follows the battery as it drains', () => {
    addRobots(makeRobot('r0', { batteryLevel: 85 }));
    const { container } = renderTile('r0');
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r0', { batteryLevel: 25 }));
    expect(straddleIndex(container)).toBe(2);
  });

  it('sits in the robot\'s identity colour', () => {
    addRobots(makeRobot('r0', { identityColor: '#428d95' }));
    const { container } = renderTile('r0');
    const tile = container.querySelector('li.roster-tile') as HTMLElement;
    for (const [property, value] of Object.entries(getRobotColorStyle('#428d95'))) {
      expect(tile.style.getPropertyValue(property), property).toBe(String(value));
    }
  });

  it('renders nothing for an id the locale does not hold', () => {
    const { container } = renderTile('gone');
    expect(container.querySelector('.roster-tile')).toBeNull();
  });
});

describe('RosterTile — a click opens the robot', () => {
  it('selects the robot through navActions: the robot screen, the Probes branch, the list collapsed', () => {
    addRobots(makeRobot('r0', { name: 'Tidal Wisp' }));
    useUIStore.getState().setAllProbesSelected(true);
    renderTile('r0');
    fireEvent.click(face('Tidal Wisp'));
    const s = useUIStore.getState();
    expect(s.selectedRobotId).toBe('r0');
    expect(s.allProbesSelected).toBe(false);
    expect(s.activeHubTile).toBe('robots');
    expect(s.expandedTopLevelBranch).toBeNull();
  });

  it('is a native button, so Enter and Space need no handler of their own', () => {
    addRobots(makeRobot('r0', { name: 'Tidal Wisp' }));
    renderTile('r0');
    expect(face('Tidal Wisp').tagName).toBe('BUTTON');
    expect(face('Tidal Wisp').getAttribute('type')).toBe('button');
  });
});

describe('RosterTile — re-render discipline', () => {
  it('does not re-render when another robot changes', () => {
    addRobots(makeRobot('r0'), makeRobot('r1'));
    let renders = 0;
    render(<ul><Profiler id="tile" onRender={() => { renders += 1; }}><RosterTile robotId="r0" onMove={onMove} /></Profiler></ul>);
    const before = renders;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { masterVolume: 0.2, batteryLevel: 10 }));
    expect(renders).toBe(before);
  });
});

// ---------------------------------------------------------------------------------- Task 22: Move

const IRON: Company = { id: 'iron', name: 'Iron Crew', color: '#428d95', robotIds: [] };
const RUST: Company = { id: 'rust', name: 'Rust Syndicate', color: '#b7410e', robotIds: [] };
const FREELANCE = CONTENT['company.assign'].options.freelance.human;

function seedCompanies(...companies: Company[]) {
  useLocaleStore.getState().setLocaleData(localeId, { companies } as unknown as Partial<Locale>);
}

const chipName = (name: string) => fill('probe.roster.move', { name });
const chip = (name = 'Tidal Wisp') => screen.getByRole('button', { name: chipName(name) });
const moveTitle = (name = 'Tidal Wisp') => fill('company.assign', { name });
const movePanel = (name = 'Tidal Wisp') => screen.getByRole('group', { name: moveTitle(name) });
const queryMovePanel = (name = 'Tidal Wisp') => screen.queryByRole('group', { name: moveTitle(name) });
/** Radix arms its outside-press listener, and hands focus back, a tick after open / close. */
const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('RosterTile — the Move chip (Task 22)', () => {
  beforeEach(() => {
    seedCompanies(IRON, RUST);
    addRobots(makeRobot('r0', { name: 'Tidal Wisp', companyId: 'rust' }), makeRobot('r1', { name: 'Brine Moth' }));
  });

  it('sits in the tile beside the face button, never inside it, named for its robot', () => {
    const { container } = renderTile('r0');
    const tile = container.querySelector('li.roster-tile')!;
    expect(tile.contains(chip())).toBe(true);
    expect(face('Tidal Wisp').contains(chip())).toBe(false);
    expect(chip().tagName).toBe('BUTTON');
    expect(chip().getAttribute('type')).toBe('button');
    expect(chip().getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip().getAttribute('aria-expanded')).toBe('false');
  });

  it('carries the robot id for the board glide (Flip matches the remounted tile by it)', () => {
    const { container } = renderTile('r0');
    expect(container.querySelector('li.roster-tile')?.getAttribute('data-flip-id')).toBe('r0');
  });

  it('reads "⇄ Move" on the desk', () => {
    renderTile('r0');
    expect(chip().textContent).toBe(CONTENT['probe.roster.move'].human);
  });

  it('opens the Move panel: the open tile is movePanelRobotId, the radio is titled "Move <name> to"', () => {
    renderTile('r0');
    // Held: an open modal aria-hides everything outside it, its own trigger included.
    const trigger = chip();
    fireEvent.click(trigger);
    expect(useUIStore.getState().movePanelRobotId).toBe('r0');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = movePanel();
    expect(within(panel).getAllByRole('radio').map((option) => option.getAttribute('aria-label'))).toEqual([FREELANCE, 'Iron Crew', 'Rust Syndicate']);
    expect(within(panel).getByRole('radio', { name: 'Rust Syndicate' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(moveTitle())).toBeTruthy();
  });

  it('checks Freelance for a robot in no company', () => {
    renderTile('r1');
    fireEvent.click(chip('Brine Moth'));
    expect(within(movePanel('Brine Moth')).getByRole('radio', { name: FREELANCE }).getAttribute('aria-checked')).toBe('true');
  });

  it('carries no help "?" of its own: the robot screen company radio has it, and a popover in a popover is one too many', () => {
    renderTile('r0');
    fireEvent.click(chip());
    expect(movePanel().closest('.roster-move__panel')).toBeTruthy();
    expect(document.querySelector('.roster-move__panel .sc-help__trigger')).toBeNull();
  });

  it('does not open the robot: the face click never fires for the chip', () => {
    renderTile('r0');
    fireEvent.click(chip());
    const s = useUIStore.getState();
    expect(s.selectedRobotId).toBeNull();
    expect(s.activeHubTile).toBeNull();
  });

  it('stops the press at the chip: nothing around the tile hears its click', () => {
    const outer = vi.fn();
    render(<ul onClick={outer}><RosterTile robotId="r0" onMove={onMove} /></ul>);
    fireEvent.click(chip());
    expect(outer).not.toHaveBeenCalled();
    expect(useUIStore.getState().movePanelRobotId).toBe('r0');
  });

  it('follows movePanelRobotId: the store opens it, and another tile opening closes it', () => {
    render(<ul><RosterTile robotId="r0" onMove={onMove} /><RosterTile robotId="r1" onMove={onMove} /></ul>);
    act(() => useUIStore.getState().openMovePanel('r0'));
    expect(movePanel()).toBeTruthy();
    act(() => useUIStore.getState().openMovePanel('r1'));
    expect(queryMovePanel()).toBeNull();
    expect(movePanel('Brine Moth')).toBeTruthy();
  });

  it('picking a company hands the move to the board once and closes the panel', () => {
    renderTile('r0');
    fireEvent.click(chip());
    fireEvent.click(within(movePanel()).getByRole('radio', { name: 'Iron Crew' }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('r0', 'iron');
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    expect(queryMovePanel()).toBeNull();
  });

  it('picking Freelance passes null', () => {
    renderTile('r0');
    fireEvent.click(chip());
    fireEvent.click(within(movePanel()).getByRole('radio', { name: FREELANCE }));
    expect(onMove).toHaveBeenCalledWith('r0', null);
  });

  it('re-picking the current company closes the panel without a move', () => {
    renderTile('r0');
    fireEvent.click(chip());
    fireEvent.click(within(movePanel()).getByRole('radio', { name: 'Rust Syndicate' }));
    expect(onMove).not.toHaveBeenCalled();
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
  });

  it('Escape closes without a move and hands focus back to the chip', async () => {
    renderTile('r0');
    fireEvent.click(chip());
    await tick();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await tick();
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    expect(queryMovePanel()).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(chip());
  });

  it('a press outside closes without a move', async () => {
    renderTile('r0');
    fireEvent.click(chip());
    await tick();
    fireEvent.pointerDown(document.body);
    await tick();
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('another tile panel opening and closing does not re-render this tile', () => {
    let renders = 0;
    render(<ul><Profiler id="tile" onRender={() => { renders += 1; }}><RosterTile robotId="r0" onMove={onMove} /></Profiler><RosterTile robotId="r1" onMove={onMove} /></ul>);
    const before = renders;
    act(() => useUIStore.getState().openMovePanel('r1'));
    act(() => useUIStore.getState().closeMovePanel());
    expect(renders).toBe(before);
  });

  it('a long press on the desk is only a press: no panel, and the click opens the robot', () => {
    vi.useFakeTimers();
    try {
      renderTile('r0');
      fireEvent.pointerDown(face('Tidal Wisp'));
      act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS * 2); });
      fireEvent.pointerUp(face('Tidal Wisp'));
      fireEvent.click(face('Tidal Wisp'));
      expect(useUIStore.getState().movePanelRobotId).toBeNull();
      expect(useUIStore.getState().selectedRobotId).toBe('r0');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RosterTile — the Move sheet on the phone (Task 22)', () => {
  beforeEach(() => {
    shell.set('phone');
    seedCompanies(IRON, RUST);
    addRobots(makeRobot('r0', { name: 'Tidal Wisp', companyId: 'rust' }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('carries the robot id for the board glide here too', () => {
    const { container } = renderTile('r0');
    expect(container.querySelector('li.roster-tile')?.getAttribute('data-flip-id')).toBe('r0');
  });

  it('a long press that ends off the tile (no click follows) leaves the next tap an ordinary tap', () => {
    vi.useFakeTimers();
    renderTile('r0');
    const tile = face('Tidal Wisp');
    fireEvent.pointerDown(tile);
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS); });
    fireEvent.pointerLeave(tile);
    act(() => useUIStore.getState().closeMovePanel());
    fireEvent.pointerDown(tile);
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(useUIStore.getState().selectedRobotId).toBe('r0');
  });

  it('the chip is the glyph alone, still named for its robot', () => {
    renderTile('r0');
    expect(chip().textContent).toBe(CONTENT['probe.roster.move'].short);
    expect(chip().getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('opens a modal sheet titled "Move <name> to" over the company radio', () => {
    renderTile('r0');
    fireEvent.click(chip());
    expect(useUIStore.getState().movePanelRobotId).toBe('r0');
    const sheet = screen.getByRole('dialog', { name: moveTitle() });
    expect(within(sheet).getAllByRole('radio')).toHaveLength(3);
    expect(within(sheet).getByRole('radio', { name: 'Rust Syndicate' }).getAttribute('aria-checked')).toBe('true');
  });

  it('picking in the sheet hands the move to the board and closes it', () => {
    renderTile('r0');
    fireEvent.click(chip());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Iron Crew' }));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('r0', 'iron');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
  });

  it('Escape closes the sheet without a move', async () => {
    renderTile('r0');
    fireEvent.click(chip());
    await tick();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('a 500 ms press on the tile opens the sheet, and the click that ends the press does not open the robot', () => {
    expect(MOVE_LONG_PRESS_MS).toBe(500);
    vi.useFakeTimers();
    renderTile('r0');
    // Held: once the sheet opens, the modal aria-hides the tile.
    const tile = face('Tidal Wisp');
    fireEvent.pointerDown(tile);
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS - 1); });
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(useUIStore.getState().movePanelRobotId).toBe('r0');
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(useUIStore.getState().selectedRobotId).toBeNull();
  });

  it('the press after a long press is an ordinary tap again: it opens the robot', () => {
    vi.useFakeTimers();
    renderTile('r0');
    const tile = face('Tidal Wisp');
    fireEvent.pointerDown(tile);
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS); });
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    act(() => useUIStore.getState().closeMovePanel());
    fireEvent.pointerDown(tile);
    fireEvent.pointerUp(tile);
    fireEvent.click(tile);
    expect(useUIStore.getState().selectedRobotId).toBe('r0');
  });

  it.each([
    ['released', (el: HTMLElement) => fireEvent.pointerUp(el)],
    ['cancelled (a scroll took the touch)', (el: HTMLElement) => fireEvent.pointerCancel(el)],
    ['dragged off the tile', (el: HTMLElement) => fireEvent.pointerLeave(el)],
  ])('a press %s before 500 ms opens nothing, and a tap still opens the robot', (_, end) => {
    vi.useFakeTimers();
    renderTile('r0');
    fireEvent.pointerDown(face('Tidal Wisp'));
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS - 100); });
    end(face('Tidal Wisp'));
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS); });
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
    fireEvent.click(face('Tidal Wisp'));
    expect(useUIStore.getState().selectedRobotId).toBe('r0');
  });

  it('a tile unmounted mid-press opens nothing', () => {
    vi.useFakeTimers();
    const { unmount } = renderTile('r0');
    fireEvent.pointerDown(face('Tidal Wisp'));
    unmount();
    act(() => { vi.advanceTimersByTime(MOVE_LONG_PRESS_MS); });
    expect(useUIStore.getState().movePanelRobotId).toBeNull();
  });

  it('the long press keeps the browser touch menu away', () => {
    renderTile('r0');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    face('Tidal Wisp').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('RosterTile — the Move panel opens in ScreenViewport (Task 22)', () => {
  beforeEach(() => {
    seedCompanies(IRON, RUST);
    addRobots(makeRobot('r0', { name: 'Tidal Wisp', companyId: 'rust' }));
  });

  const renderInScreen = () => render(
    <div id="screen-viewport">
      <ul data-testid="row"><RosterTile robotId="r0" onMove={onMove} /></ul>
    </div>,
  );

  it('desk: the panel portals into the screen, out of the tile and its row, and keeps to the screen edges', () => {
    renderInScreen();
    fireEvent.click(chip());
    const panel = document.querySelector('.roster-move__panel')!;
    expect(document.getElementById('screen-viewport')?.contains(panel)).toBe(true);
    expect(screen.getByTestId('row').contains(panel)).toBe(false);
    // Measured in Chrome at 800 px: without it the rightmost tile's panel ran 8 px into the sleeve.
    expect(seen.collisionBoundary).toBe(document.getElementById('screen-viewport'));
  });

  it('phone: the sheet and its scrim portal into the screen too', () => {
    shell.set('phone');
    renderInScreen();
    fireEvent.click(chip());
    const sheet = screen.getByRole('dialog');
    expect(document.getElementById('screen-viewport')?.contains(sheet)).toBe(true);
    expect(screen.getByTestId('row').contains(sheet)).toBe(false);
    expect(screen.getByTestId('row').querySelector('.roster-move__scrim')).toBeNull();
    expect(document.querySelector('#screen-viewport .roster-move__scrim')).toBeTruthy();
  });

  it('never document.body (the UI Shell guardrail): with no screen it opens in place, in the tile', () => {
    const { container } = renderTile('r0');
    fireEvent.click(chip());
    expect(container.querySelector('li.roster-tile .roster-move__panel')).toBeTruthy();
  });
});

describe('RosterTile — the Move chip (CSS contract, Task 22)', () => {
  const css = readFileSync(resolve(__dirname, 'RosterTile.css'), 'utf8');
  const opacityOf = (selector: string) => getCssRuleBody(css, selector)?.match(/opacity:\s*([\d.]+)/)?.[1];

  it('on the desk the chip is invisible at rest', () => {
    expect(opacityOf('.roster-tile__move')).toBe('0');
  });

  it.each([
    '.roster-tile:hover .roster-tile__move',
    '.roster-tile:focus-within .roster-tile__move',
    ".roster-tile__move[data-state='open']",
  ])('it shows under %s', (selector) => {
    expect(Number(opacityOf(selector))).toBeGreaterThan(0);
  });

  it('on the phone the glyph is always on, and its press area is a full touch target', () => {
    expect(Number(opacityOf('.roster-tile--phone .roster-tile__move'))).toBeGreaterThan(0);
    const phone = getCssRuleBody(css, '.roster-tile--phone .roster-tile__move')!;
    expect(phone).toMatch(/min-width:\s*var\(--touch-target-size\)/);
    expect(phone).toMatch(/min-height:\s*var\(--touch-target-size\)/);
  });

  // Found in Chrome: RadioButton is an inline-size container with no width of its own, so a
  // shrink-to-fit popover folded to 26 px around it.
  it('the desk panel has a set width, capped by the window; the phone sheet spans the screen', () => {
    expect(getCssRuleBody(css, '.roster-move__panel:not(.roster-move__sheet)')).toMatch(/width:\s*min\(var\(--move-panel-width\)/);
    expect(getCssRuleBody(css, '.roster-move__panel')).toMatch(/--move-panel-width:\s*\d+px/);
    const sheet = getCssRuleBody(css, '.roster-move__sheet')!;
    expect(sheet).toMatch(/left:\s*0/);
    expect(sheet).toMatch(/right:\s*0/);
    expect(sheet).toMatch(/bottom:\s*var\(--phone-bar-clearance\)/);
  });

  // One source: CabinetBox draws its walls from a number, so the height is MOVE_CHIP_HEIGHT and the CSS
  // reads it back through --move-chip-height, set inline on the tile (the --header-volume-width way).
  it('the chip is 22 px tall (the sketch), one value shared by the cabinet and the CSS', () => {
    expect(MOVE_CHIP_HEIGHT).toBe(22);
    expect(css).not.toMatch(/--move-chip-height:\s*\d/);
    expect(getCssRuleBody(css, '.roster-tile__move .sc-cabinet-box__front')).toMatch(/height:\s*var\(--move-chip-height\)/);
  });
});

describe('RosterTile — the chip height reaches the CSS (Task 22)', () => {
  it('the tile sets --move-chip-height from MOVE_CHIP_HEIGHT', () => {
    addRobots(makeRobot('r0'));
    const { container } = renderTile('r0');
    const tile = container.querySelector('li.roster-tile') as HTMLElement;
    expect(tile.style.getPropertyValue('--move-chip-height')).toBe(`${MOVE_CHIP_HEIGHT}px`);
  });
});
