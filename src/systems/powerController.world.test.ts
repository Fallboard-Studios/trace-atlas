// docs/tasks/LAYOUT_REWORK.md Task 26: the real chain, with only the audio context faked. A world built
// while the tablet is off (the way WorldView's mount builds it) is a still frame; powerOnSequence()
// brings it alive exactly once; shutdown() leaves it standing; a second power-on does not double-start.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 0),
  scheduleRepeat: vi.fn(() => 'schedule-id'),
  cancelSchedule: vi.fn(),
  getCurrentMeasurePrecise: vi.fn(() => 0),
}));

// The real AudioEngine, minus the three calls that need a live AudioContext.
vi.mock('../engine/AudioEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/AudioEngine')>();
  return {
    ...actual,
    AudioEngine: Object.assign(Object.create(actual.AudioEngine), {
      start: vi.fn(async () => {}),
      killAll: vi.fn(),
      setBPM: vi.fn(),
    }),
  };
});

import { powerController } from './powerController';
import { initializeLocale } from './worldTransition';
import * as spawnSystemModule from './spawnSystem';
import * as robotSystemsModule from './robotSystems';
import * as workLoopModule from './workLoop';
import * as audioSwellsModule from './audioSwells';
import { AudioEngine } from '../engine/AudioEngine';
import { subscribeToMeasure, scheduleRepeat } from '../engine/beatClock';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../stores/localeStore';
import { useAttenuationStyleStore, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useUIStore } from '../stores/uiStore';
import { MAX_ROBOTS } from '../constants';

function locale() {
  return useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
}

describe('power cycle over a world built while off', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState({ isPoweredOn: false });
    vi.clearAllMocks();
  });

  afterEach(() => {
    robotSystemsModule.stopRobotLifecycle();
    audioSwellsModule.stopAudioSwells();
    workLoopModule.stopWorkLoop();
    vi.restoreAllMocks();
  });

  it('the off world has twelve robots and its actors, with no system started and no audio started', () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    expect(locale().robots).toHaveLength(MAX_ROBOTS);
    expect(locale().actors.length).toBeGreaterThan(0);
    expect(subscribeToMeasure).not.toHaveBeenCalled();
    expect(scheduleRepeat).not.toHaveBeenCalled();
    expect(AudioEngine.start).not.toHaveBeenCalled();
    expect(useUIStore.getState().isPoweredOn).toBe(false);
  });

  it('powerOnSequence starts the three systems once and registers the robots\' audio once, for the world built while off', async () => {
    const reRegister = vi.spyOn(spawnSystemModule, 'reRegisterAllRobotsAudio').mockImplementation(() => {});
    const lifecycleStart = vi.spyOn(robotSystemsModule, 'startRobotLifecycle');
    const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
    const swellsStart = vi.spyOn(audioSwellsModule, 'startAudioSwells');
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    const robotsBefore = locale().robots;
    const actorsBefore = locale().actors;

    await powerController.powerOnSequence();

    expect(reRegister).toHaveBeenCalledTimes(1);
    expect(reRegister).toHaveBeenCalledWith(DEFAULT_LOCALE_ID);
    expect(lifecycleStart).toHaveBeenCalledTimes(1);
    expect(workStart).toHaveBeenCalledTimes(1);
    expect(swellsStart).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().isPoweredOn).toBe(true);
    // The same world: powering on builds nothing new.
    expect(locale().actors).toBe(actorsBefore);
    expect(locale().robots).toHaveLength(MAX_ROBOTS);
    expect(robotsBefore).toHaveLength(MAX_ROBOTS);
  });

  it('shutdown leaves the actors and the roster populated, and powers off', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    const actorCount = locale().actors.length;

    await powerController.shutdown();

    expect(locale().actors).toHaveLength(actorCount);
    expect(actorCount).toBeGreaterThan(0);
    expect(locale().robots).toHaveLength(MAX_ROBOTS);
    expect(useUIStore.getState().isPoweredOn).toBe(false);
  });

  it('shutdownWithAnimation leaves the world standing too', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    const actorCount = locale().actors.length;

    await powerController.shutdownWithAnimation();

    expect(locale().actors).toHaveLength(actorCount);
    expect(useUIStore.getState().isPoweredOn).toBe(false);
  });

  it('a second power-on after a shutdown restarts the systems without leaving two ticks running', async () => {
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(subscribeToMeasure).mockImplementation(() => {
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    await powerController.powerOnSequence();
    await powerController.shutdown();
    await powerController.powerOnSequence();

    // shutdown stopped tick one; power-on two subscribed tick two; only the second is live.
    expect(unsubscribes).toHaveLength(2);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribes[1]).not.toHaveBeenCalled();
    expect(locale().robots).toHaveLength(MAX_ROBOTS);
  });

  it('a power-on with no shutdown in between (a double press) does not double-start', async () => {
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(subscribeToMeasure).mockImplementation(() => {
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    await powerController.powerOnSequence();
    await powerController.powerOnSequence();

    expect(unsubscribes).toHaveLength(2);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribes[1]).not.toHaveBeenCalled();
  });
});
