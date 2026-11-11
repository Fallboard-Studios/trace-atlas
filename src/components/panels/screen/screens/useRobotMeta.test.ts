import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/*
 * docs/tasks/MONITOR_MODE_TRUSTWORTHY.md Task 7a (spec §1.5, §4): useRobotMeta's status is the robot's own Monitor
 * Mode word, and it returns the mode key (the light's colour) and `lit` (the light's brightness: heard right now).
 */

import { useRobotMeta } from './useRobotMeta';
import { useLocaleStore } from '@/stores/localeStore';
import { useAudioStore } from '@/stores/audioStore';
import { getActiveLocaleId } from '@/utils/localeHelpers';
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

/** Puts the robots in the locale and reads the first one's meta. */
function metaOf(...robots: Robot[]) {
  useLocaleStore.getState().setLocaleData(localeId, { robots, companies: [] } as unknown as Partial<Locale>);
  return renderHook(() => useRobotMeta(robots[0], localeId)).result.current;
}

beforeEach(() => {
  useLocaleStore.getState().setLocaleData(localeId, { robots: [], companies: [] } as unknown as Partial<Locale>);
  useAudioStore.setState({ soundingRobotIds: [] });
});

afterEach(() => {
  useAudioStore.setState({ soundingRobotIds: [] });
});

describe('useRobotMeta — the mode', () => {
  it.each([
    ['none', 'Auto'],
    ['mute', 'Mute'],
    ['solo', 'Solo'],
    ['highlight', 'Highlight'],
  ] as const)('returns mode %s and the status word %s', (audioMode, word) => {
    const meta = metaOf(makeRobot('r0', { audioMode }));
    expect(meta.mode).toBe(audioMode);
    expect(meta.status).toBe(word);
  });

  it('reads an unset audioMode as none / Auto', () => {
    const meta = metaOf(makeRobot('r0', { audioMode: undefined }));
    expect(meta.mode).toBe('none');
    expect(meta.status).toBe('Auto');
  });

  it('keeps the mode and word of an Auto robot silenced by another robot Solo', () => {
    const meta = metaOf(makeRobot('r0', { audioMode: 'none' }), makeRobot('r1', { audioMode: 'solo' }));
    expect(meta.mode).toBe('none');
    expect(meta.status).toBe('Auto');
  });
});

describe('useRobotMeta — lit', () => {
  it('is lit for an audible robot the budget lets sound', () => {
    expect(metaOf(makeRobot('r0')).lit).toBe(true);
    useAudioStore.setState({ soundingRobotIds: ['r0'] });
    expect(metaOf(makeRobot('r0', { audioMode: 'highlight' })).lit).toBe(true);
  });

  it('is dim for a muted robot', () => {
    expect(metaOf(makeRobot('r0', { audioMode: 'mute' })).lit).toBe(false);
  });

  it('is dim for a robot silenced by another robot Solo, lit for the soloed one', () => {
    const silenced = makeRobot('r0');
    const soloed = makeRobot('r1', { audioMode: 'solo' });
    expect(metaOf(silenced, soloed).lit).toBe(false);
    expect(metaOf(soloed, silenced).lit).toBe(true);
  });

  it('is dim in the station, lit for a soloed robot in it', () => {
    expect(metaOf(makeRobot('r0', { docking: 'docked', activity: 'charging' })).lit).toBe(false);
    expect(metaOf(makeRobot('r0', { docking: 'undocking', activity: 'exiting', audioMode: 'highlight' })).lit).toBe(false);
    expect(metaOf(makeRobot('r0', { docking: 'docked', activity: 'charging', audioMode: 'solo' })).lit).toBe(true);
  });

  it('is dim while the budget holds the robot standing by', () => {
    useAudioStore.setState({ soundingRobotIds: ['r1'] });
    expect(metaOf(makeRobot('r0'), makeRobot('r1')).lit).toBe(false);
  });
});
