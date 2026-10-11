import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Profiler } from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/*
 * docs/tasks/LAYOUT_REWORK.md Task 21 (spec §1.5): one roster row-tile — the gem in the card render
 * context, the name, one status line and a thin battery strip. A click opens the robot.
 */

import { RosterTile, ROSTER_BATTERY_BOX_COUNT, ROSTER_BATTERY_BOX_SIZE, ROSTER_BATTERY_BOX_GAP } from './RosterTile';
import { getCssRuleBody } from '@/testUtils/cssRuleBody';
import { computeVoxelTrackLength, computeVoxelTrackTrailingReserve } from '@/utils/voxelTrackMath';
import { fill } from '@/content';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { getRobotColorStyle } from '@/utils/traitColors';
import { getRobotGem, gemViewBox } from '@/components/robot/gem/polygon';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL, DOCKING_STATE_LABELS, ACTIVITY_LABELS, AUDIBILITY_LABELS } from '@/data/robotSelectionConfig';
import type { Robot } from '@/types/Robot';
import type { Locale } from '@/types/locale';

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
    createdAt: 0,
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

const renderTile = (robotId: string) => render(<ul><RosterTile robotId={robotId} /></ul>);
const face = (name: string) => screen.getByRole('button', { name });
/** Where the battery strip's partly-filled box sits: every box before it is full. */
const straddleIndex = (container: HTMLElement) => {
  const track = container.querySelector('.roster-tile__battery .sc-voxel-track')!;
  return [...track.children].findIndex((box) => box.classList.contains('sc-voxel-track__straddle'));
};

beforeEach(() => {
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
    render(<ul><Profiler id="tile" onRender={() => { renders += 1; }}><RosterTile robotId="r0" /></Profiler></ul>);
    const before = renders;
    act(() => useLocaleStore.getState().updateRobot(localeId, 'r1', { masterVolume: 0.2, batteryLevel: 10 }));
    expect(renders).toBe(before);
  });
});
