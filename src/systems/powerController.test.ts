import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../engine/AudioEngine', () => ({ AudioEngine: { start: vi.fn(), killAll: vi.fn(), setBPM: vi.fn(), pause: vi.fn(), resume: vi.fn() } }));
vi.mock('../engine/harmonySystem', () => ({ resetHarmony: vi.fn() }));
vi.mock('../stores/audioStore', () => ({ useAudioStore: { getState: () => ({ bpm: 60 }) } }));
vi.mock('./spawnSystem', () => ({ reRegisterAllRobotsAudio: vi.fn() }));
vi.mock('./robotSystems', () => ({ stopRobotLifecycle: vi.fn() }));
vi.mock('./workLoop', () => ({ stopWorkLoop: vi.fn(), pauseWorkLoop: vi.fn(), resumeWorkLoop: vi.fn() }));
vi.mock('./worldTransition', () => ({ startLocaleSystems: vi.fn() }));
vi.mock('../animation/timelineMap', () => ({ pauseWorldTimelines: vi.fn(), resumeWorldTimelines: vi.fn() }));
vi.mock('../utils/deviceFlags', () => ({ hasHeardWorld: vi.fn(() => false), markHeardWorld: vi.fn() }));
vi.mock('../animation/offScreenTheatre', () => ({ fadeOffScreen: vi.fn(() => Promise.resolve()), restoreOffScreen: vi.fn() }));
const setPowerOnSpy = vi.fn();
const setPowerOffSpy = vi.fn();
vi.mock('../stores/uiStore', () => ({ useUIStore: { getState: () => ({ setPowerOn: setPowerOnSpy, setPowerOff: setPowerOffSpy }) } }));
const setLocaleDataSpy = vi.fn();
vi.mock('../stores/localeStore', () => ({ useLocaleStore: { getState: () => ({ setLocaleData: setLocaleDataSpy }) } }));
vi.mock('../utils/localeHelpers', () => ({ getActiveLocaleId: () => 'pelagos-default' }));

import { powerController, __resetPowerControllerForTest } from './powerController';
import { AudioEngine } from '../engine/AudioEngine';
import { resetHarmony } from '../engine/harmonySystem';
import { reRegisterAllRobotsAudio } from './spawnSystem';
import { stopRobotLifecycle } from './robotSystems';
import { stopWorkLoop, pauseWorkLoop, resumeWorkLoop } from './workLoop';
import { startLocaleSystems } from './worldTransition';
import { pauseWorldTimelines, resumeWorldTimelines } from '../animation/timelineMap';
import { hasHeardWorld, markHeardWorld } from '../utils/deviceFlags';
import { fadeOffScreen, restoreOffScreen } from '../animation/offScreenTheatre';
import { useUIStore } from '../stores/uiStore';
import { useLocaleStore } from '../stores/localeStore';

const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0];

describe('powerController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasHeardWorld).mockReturnValue(false);
    __resetPowerControllerForTest();
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

  // Power is a pause (docs/specs/OFF_SCREEN.md assumption 5, docs/tasks/OFF_SCREEN.md Task 6): the rocker freezes the
  // world in place and brings it back from where it stopped; nothing is torn down until a different world is loaded.
  describe('pause()', () => {
    it('freezes the loop clock, the world timelines and the audio context, then flips power off — in that order', async () => {
      await powerController.powerOnSequence();
      powerController.pause();

      expect(pauseWorkLoop).toHaveBeenCalledTimes(1);
      expect(pauseWorldTimelines).toHaveBeenCalledTimes(1);
      expect(AudioEngine.pause).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().setPowerOff).toHaveBeenCalledTimes(1);
      expect(order(pauseWorkLoop)).toBeLessThan(order(pauseWorldTimelines));
      expect(order(pauseWorldTimelines)).toBeLessThan(order(AudioEngine.pause));
      expect(order(AudioEngine.pause)).toBeLessThan(order(useUIStore.getState().setPowerOff));
      expect(powerController.getWorldState()).toBe('paused');
    });

    it('tears nothing down: no killAll, no lifecycle stop, no work-loop stop, and the world stays standing', async () => {
      await powerController.powerOnSequence();
      powerController.pause();

      expect(AudioEngine.killAll).not.toHaveBeenCalled();
      expect(stopRobotLifecycle).not.toHaveBeenCalled();
      expect(stopWorkLoop).not.toHaveBeenCalled();
      expect(useLocaleStore.getState().setLocaleData).not.toHaveBeenCalled();
    });

    it('is a no-op unless the world is running (cold, or already paused)', async () => {
      powerController.pause(); // cold
      await powerController.powerOnSequence();
      powerController.pause();
      powerController.pause(); // already paused

      expect(pauseWorkLoop).toHaveBeenCalledTimes(1);
      expect(AudioEngine.pause).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().setPowerOff).toHaveBeenCalledTimes(1);
    });
  });

  describe('powerOnSequence() from a pause', () => {
    it('resumes — audio context, world timelines, loop clock, then power on — and starts nothing', async () => {
      await powerController.powerOnSequence();
      powerController.pause();
      vi.clearAllMocks();

      await powerController.powerOnSequence();

      expect(AudioEngine.resume).toHaveBeenCalledTimes(1);
      expect(resumeWorldTimelines).toHaveBeenCalledTimes(1);
      expect(resumeWorkLoop).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().setPowerOn).toHaveBeenCalledTimes(1);
      expect(order(AudioEngine.resume)).toBeLessThan(order(resumeWorldTimelines));
      expect(order(resumeWorldTimelines)).toBeLessThan(order(resumeWorkLoop));
      expect(order(resumeWorkLoop)).toBeLessThan(order(useUIStore.getState().setPowerOn));
      expect(AudioEngine.start).not.toHaveBeenCalled();
      expect(startLocaleSystems).not.toHaveBeenCalled();
      expect(resetHarmony).not.toHaveBeenCalled();
      expect(powerController.getWorldState()).toBe('running');
    });

    it('starts cold instead when the world was replaced during the pause (noteWorldReplaced)', async () => {
      await powerController.powerOnSequence();
      powerController.pause();
      powerController.noteWorldReplaced();
      expect(powerController.getWorldState()).toBe('cold');
      vi.clearAllMocks();

      await powerController.powerOnSequence();

      expect(AudioEngine.start).toHaveBeenCalledTimes(1);
      expect(startLocaleSystems).toHaveBeenCalledTimes(1);
      // The world change tore the paused world down (worldTransition's killAll, docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md
      // R1), so start() runs in full and its Tone.start() wakes the suspended context: the cold path resumes nothing.
      expect(AudioEngine.resume).not.toHaveBeenCalled();
      expect(resumeWorldTimelines).not.toHaveBeenCalled();
      expect(resumeWorkLoop).not.toHaveBeenCalled();
      expect(powerController.getWorldState()).toBe('running');
    });
  });

  it('a fresh page\'s first start wakes nothing itself: start() does, through Tone.start()', async () => {
    await powerController.powerOnSequence();
    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(AudioEngine.resume).not.toHaveBeenCalled();
  });

  describe('the heard-a-world flag (the off screen\'s gate)', () => {
    it('is written by the first cold start, when the device has not heard a world', async () => {
      await powerController.powerOnSequence();
      expect(markHeardWorld).toHaveBeenCalledTimes(1);
    });

    it('is not written again once the device has heard one, nor by a resume', async () => {
      vi.mocked(hasHeardWorld).mockReturnValue(true);
      await powerController.powerOnSequence();
      powerController.pause();
      await powerController.powerOnSequence();
      expect(markHeardWorld).not.toHaveBeenCalled();
    });
  });

  // The veil fades before the chrome appears (docs/specs/OFF_SCREEN.md assumption 18, docs/tasks/OFF_SCREEN.md Task 16b):
  // powerOnSequence awaits the off screen's fade first — before anything wakes, so a flip during the fade finds the
  // world still paused or cold and the states never cross — and only then flips the power flag that unmounts the screen.
  describe('the off screen fade', () => {
    it('is awaited once, before the power flag flips, on the cold path — and before the audio starts', async () => {
      await powerController.powerOnSequence();
      expect(fadeOffScreen).toHaveBeenCalledTimes(1);
      expect(order(fadeOffScreen)).toBeLessThan(order(AudioEngine.start));
      expect(order(fadeOffScreen)).toBeLessThan(order(useUIStore.getState().setPowerOn));
    });

    it('is awaited once, before the power flag flips, on the resume path — and before the context wakes', async () => {
      await powerController.powerOnSequence();
      powerController.pause();
      vi.clearAllMocks();
      await powerController.powerOnSequence();
      expect(fadeOffScreen).toHaveBeenCalledTimes(1);
      expect(order(fadeOffScreen)).toBeLessThan(order(AudioEngine.resume));
      expect(order(fadeOffScreen)).toBeLessThan(order(useUIStore.getState().setPowerOn));
    });

    it('the power flag does not flip until the fade has resolved', async () => {
      let finish: () => void = () => {};
      vi.mocked(fadeOffScreen).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
      const sequence = powerController.powerOnSequence();
      await Promise.resolve();
      expect(useUIStore.getState().setPowerOn).not.toHaveBeenCalled();
      expect(AudioEngine.start).not.toHaveBeenCalled();
      finish();
      await sequence;
      expect(useUIStore.getState().setPowerOn).toHaveBeenCalledTimes(1);
      expect(powerController.getWorldState()).toBe('running');
    });

    it('pause() fades nothing: the screen appears over the paused world, it does not disappear', async () => {
      await powerController.powerOnSequence();
      vi.clearAllMocks();
      powerController.pause();
      expect(fadeOffScreen).not.toHaveBeenCalled();
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R19: a start that fails after the fade gives the screen back - opaque,
    // taking input - instead of leaving it invisible and mounted over the glass. The failure still reaches the caller.
    it('a rejected start restores the screen after its fade, and the world stays cold with the power off', async () => {
      vi.mocked(AudioEngine.start).mockRejectedValueOnce(new Error('no audio context'));
      await expect(powerController.powerOnSequence()).rejects.toThrow('no audio context');
      expect(restoreOffScreen).toHaveBeenCalledTimes(1);
      expect(order(fadeOffScreen)).toBeLessThan(order(restoreOffScreen));
      expect(powerController.getWorldState()).toBe('cold');
      expect(useUIStore.getState().setPowerOn).not.toHaveBeenCalled();
    });

    it('a start that succeeds, and a resume, never restore the screen: it goes with the power flag', async () => {
      await powerController.powerOnSequence();
      powerController.pause();
      await powerController.powerOnSequence();
      expect(restoreOffScreen).not.toHaveBeenCalled();
    });
  });

  it('has no shutdown() any more — the rocker pauses (docs/tasks/OFF_SCREEN.md Task 7)', () => {
    expect((powerController as unknown as Record<string, unknown>).shutdown).toBeUndefined();
  });

  it('getWorldState() is cold on a fresh page, running after a start', async () => {
    expect(powerController.getWorldState()).toBe('cold');
    await powerController.powerOnSequence();
    expect(powerController.getWorldState()).toBe('running');
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

  it('a power-on after a pause does not start the locale systems a second time — it resumes them', async () => {
    await powerController.powerOnSequence();
    powerController.pause();
    await powerController.powerOnSequence();
    expect(startLocaleSystems).toHaveBeenCalledTimes(1);
    expect(AudioEngine.killAll).not.toHaveBeenCalled();
  });

  it('powerOnSequence does not start the systems if audio fails to start', async () => {
    vi.mocked(AudioEngine.start).mockRejectedValueOnce(new Error('no audio context'));
    await expect(powerController.powerOnSequence()).rejects.toThrow('no audio context');
    expect(startLocaleSystems).not.toHaveBeenCalled();
    expect(useUIStore.getState().setPowerOn).not.toHaveBeenCalled();
  });

});
