import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// Robot.test.tsx mocks RobotBody away to test click routing in isolation. This file renders the
// real body end to end (Phase 40 Task 12), so it only needs idleSystem stubbed — real wander
// behavior is unrelated to what's under test here (the orbiter motion hook actually mounting).
vi.mock('@/systems/idleSystem', () => ({
  handleRobotIdle: vi.fn(),
}));

import { Robot } from './Robot';
import { useUIStore } from '@/stores/uiStore';
import { useLocaleStore } from '@/stores/localeStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
import { timelineMap, killAllTimelines } from '@/animation/timelineMap';
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
    gemSeed: 20261004,
    ...overrides,
  } as RobotType;
}

const localeId = getActiveLocaleId();

describe('Robot — real body end to end (Phase 40 Task 12: motion="world" wiring)', () => {
  beforeEach(() => {
    useUIStore.getState().selectRobot(null);
    useUIStore.getState().setActiveHubTile(null);
    useLocaleStore.getState().setLocaleData(localeId, { robots: [] } as unknown as Partial<Locale>);
    killAllTimelines();
  });

  it('registers orbiters-world-<id> on mount and kills it on unmount', () => {
    const robot = makeRobot({ id: 'r-integration' });
    useLocaleStore.getState().addRobot(localeId, robot);
    const { unmount } = render(<svg><Robot robotId={robot.id} /></svg>);

    expect(timelineMap.has('orbiters-world-r-integration')).toBe(true);
    unmount();
    expect(timelineMap.has('orbiters-world-r-integration')).toBe(false);
    cleanup();
  });
});
