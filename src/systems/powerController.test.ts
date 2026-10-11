import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/AudioEngine', () => ({ AudioEngine: { start: vi.fn(), killAll: vi.fn(), setBPM: vi.fn() } }));
vi.mock('../engine/harmonySystem', () => ({ resetHarmony: vi.fn() }));
vi.mock('../stores/audioStore', () => ({ useAudioStore: { getState: () => ({ bpm: 60 }) } }));
vi.mock('./spawnSystem', () => ({ reRegisterAllRobotsAudio: vi.fn() }));
vi.mock('./robotSystems', () => ({ stopRobotLifecycle: vi.fn() }));
vi.mock('./workLoop', () => ({ stopWorkLoop: vi.fn() }));
vi.mock('./worldTransition', () => ({ startLocaleSystems: vi.fn() }));
const setPowerOnSpy = vi.fn();
const setPowerOffSpy = vi.fn();
vi.mock('../stores/uiStore', () => ({ useUIStore: { getState: () => ({ setPowerOn: setPowerOnSpy, setPowerOff: setPowerOffSpy }) } }));
const setLocaleDataSpy = vi.fn();
vi.mock('../stores/localeStore', () => ({ useLocaleStore: { getState: () => ({ setLocaleData: setLocaleDataSpy }) } }));
vi.mock('../utils/localeHelpers', () => ({ getActiveLocaleId: () => 'pelagos-default' }));

import { powerController } from './powerController';
import { AudioEngine } from '../engine/AudioEngine';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopWorkLoop } from './workLoop';
import { startLocaleSystems } from './worldTransition';
import { useUIStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';

describe('powerController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('start calls audio start, resetHarmony and reRegisterAllRobotsAudio', async () => {
    await powerController.start();
    expect(AudioEngine.start).toHaveBeenCalled();
    expect(AudioEngine.setBPM).toHaveBeenCalledWith(60);
    expect(resetHarmony).toHaveBeenCalled();
    expect(reRegisterAllRobotsAudio).toHaveBeenCalled();
  });

  it('start does not start the locale systems itself (only powerOnSequence does)', async () => {
    await powerController.start();
    expect(startLocaleSystems).not.toHaveBeenCalled();
  });

  it('shutdown halts systems and flips power off, leaving the world standing (Task 26: the off screen\'s backdrop)', async () => {
    await powerController.shutdown();
    expect(stopRobotLifecycle).toHaveBeenCalled();
    expect(stopWorkLoop).toHaveBeenCalledTimes(1); // Phase 43 Task 23
    expect(AudioEngine.killAll).toHaveBeenCalled();
    // actors are no longer emptied: the world stays as the off screen's still backdrop
    expect(useLocaleStore.getState().setLocaleData).not.toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOff).toHaveBeenCalled();
  });

  it('shutdown stops the lifecycle before AudioEngine.killAll clears the beat clock listeners', async () => {
    await powerController.shutdown();
    const lifecycleOrder = vi.mocked(stopRobotLifecycle).mock.invocationCallOrder[0];
    const killAllOrder = vi.mocked(AudioEngine.killAll).mock.invocationCallOrder[0];
    expect(lifecycleOrder).toBeLessThan(killAllOrder);
  });

  it('powerOnSequence starts audio, registers every robot, then starts the locale\'s systems once, then flips power on', async () => {
    await powerController.powerOnSequence();
    expect(AudioEngine.start).toHaveBeenCalled();
    expect(reRegisterAllRobotsAudio).toHaveBeenCalled();
    expect(startLocaleSystems).toHaveBeenCalledTimes(1);
    expect(startLocaleSystems).toHaveBeenCalledWith('pelagos-default');
    expect(useUIStore.getState().setPowerOn).toHaveBeenCalled();

    const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0];
    expect(order(AudioEngine.start)).toBeLessThan(order(reRegisterAllRobotsAudio));
    expect(order(reRegisterAllRobotsAudio)).toBeLessThan(order(startLocaleSystems));
    expect(order(startLocaleSystems)).toBeLessThan(order(useUIStore.getState().setPowerOn));
  });

  it('powerOnSequence starts the locale systems again on a second power-on (the stop-then-start pairs inside hold the line)', async () => {
    await powerController.powerOnSequence();
    await powerController.shutdown();
    await powerController.powerOnSequence();
    expect(startLocaleSystems).toHaveBeenCalledTimes(2);
    expect(AudioEngine.killAll).toHaveBeenCalledTimes(1);
  });

  it('powerOnSequence does not start the systems if audio fails to start', async () => {
    vi.mocked(AudioEngine.start).mockRejectedValueOnce(new Error('no audio context'));
    await expect(powerController.powerOnSequence()).rejects.toThrow('no audio context');
    expect(startLocaleSystems).not.toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOn).not.toHaveBeenCalled();
  });

});
