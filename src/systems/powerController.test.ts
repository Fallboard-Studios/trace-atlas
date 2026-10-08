import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/AudioEngine', () => ({ AudioEngine: { start: vi.fn(), killAll: vi.fn(), setBPM: vi.fn() } }));
vi.mock('../engine/harmonySystem', () => ({ resetHarmony: vi.fn() }));
vi.mock('../stores/audioStore', () => ({ useAudioStore: { getState: () => ({ bpm: 60 }) } }));
vi.mock('./spawnSystem', () => ({ reRegisterAllRobotsAudio: vi.fn() }));
vi.mock('./robotSystems', () => ({ stopRobotLifecycle: vi.fn() }));
vi.mock('./workLoop', () => ({ stopWorkLoop: vi.fn() }));
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

  it('shutdown halts systems and clears state', async () => {
    // shutdown returns after running its small timeline; call and await
    const p = powerController.shutdown();
    await p;
    expect(stopRobotLifecycle).toHaveBeenCalled();
    expect(stopWorkLoop).toHaveBeenCalledTimes(1); // Phase 43 Task 23
    expect(AudioEngine.killAll).toHaveBeenCalled();
    // locale actors cleared and ui setPowerOff should be called
    expect(useLocaleStore.getState().setLocaleData).toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOff).toHaveBeenCalled();
  });

  it('powerOnSequence starts systems then flips power state on', async () => {
    await powerController.powerOnSequence();
    expect(AudioEngine.start).toHaveBeenCalled();
    expect(reRegisterAllRobotsAudio).toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOn).toHaveBeenCalled();
  });

  it('shutdownWithAnimation halts systems and flips power state off, without touching locale actors', async () => {
    await powerController.shutdownWithAnimation();
    expect(stopRobotLifecycle).toHaveBeenCalled();
    expect(stopWorkLoop).toHaveBeenCalledTimes(1); // Phase 43 Task 23
    expect(AudioEngine.killAll).toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOff).toHaveBeenCalled();
    expect(useLocaleStore.getState().setLocaleData).not.toHaveBeenCalled();
  });
});
