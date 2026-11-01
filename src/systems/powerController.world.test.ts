// docs/tasks/LAYOUT_REWORK.md Task 26: the real chain, with only the audio context faked. A world built
// while the tablet is off (the way WorldView's mount builds it) is a still frame; powerOnSequence()
// brings it alive exactly once; pause() leaves it standing (docs/specs/OFF_SCREEN.md assumption 5); a
// power-on after a pause resumes rather than starting again; a double press does not double-start; a
// world change while paused tears the paused world down first (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R1).
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

// The real noise map, wrapped so the swell case can force one draw (audioSwells.test.ts's convention): a
// mockReturnValueOnce is spent by the next call and every other draw stays real.
vi.mock('../utils/noiseMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/noiseMaps')>();
  return { ...actual, getAttenuationStyleNoiseMap: vi.fn(actual.getAttenuationStyleNoiseMap) };
});

import gsap from 'gsap';
import { powerController, __resetPowerControllerForTest } from './powerController';
import { initializeLocale, retransmitWorld } from './worldTransition';
import { getWorldState } from './worldState';
import * as spawnSystemModule from './spawnSystem';
import * as robotSystemsModule from './robotSystems';
import * as workLoopModule from './workLoop';
import * as audioSwellsModule from './audioSwells';
import * as offScreenTheatreModule from '../animation/offScreenTheatre';
import * as timelineMapModule from '../animation/timelineMap';
import * as worldTransitionModule from './worldTransition';
import { AudioEngine } from '../engine/AudioEngine';
import { subscribeToMeasure, scheduleRepeat } from '../engine/beatClock';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '../stores/localeStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle, DEFAULT_PELAGOS } from '../stores/attenuationStyleStore';
import { useUIStore } from '../stores/uiStore';
import { useAudioStore } from '../stores/audioStore';
import { useLoadingStore, DEFAULT_LOADING } from '../stores/loadingStore';
import { setTimeline, getTimeline, killAllTimelines } from '../animation/timelineMap';
import { getAttenuationStyleNoiseMap } from '../utils/noiseMaps';
import { clearRefs, setRef } from '../utils/refs';
import { MAX_ROBOTS } from '../constants';

function locale() {
  return useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
}

describe('power cycle over a world built while off', () => {
  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState({ isPoweredOn: false });
    __resetPowerControllerForTest();
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

  it('pause leaves the actors and the roster populated, and powers off', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    const actorCount = locale().actors.length;

    powerController.pause();

    expect(locale().actors).toHaveLength(actorCount);
    expect(actorCount).toBeGreaterThan(0);
    expect(locale().robots).toHaveLength(MAX_ROBOTS);
    expect(useUIStore.getState().isPoweredOn).toBe(false);
  });

  it('a power-on after a pause resumes: the one lifecycle tick stays subscribed, none is added, and the roster stands', async () => {
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(subscribeToMeasure).mockImplementation(() => {
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    await powerController.powerOnSequence();
    powerController.pause();
    await powerController.powerOnSequence();

    // The pause froze tick one with the audio context (the subscription is left standing); the resume
    // subscribed nothing new and the measure tick is the same one — no second tick to double-drain batteries.
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    expect(useUIStore.getState().isPoweredOn).toBe(true);
    expect(locale().robots).toHaveLength(MAX_ROBOTS);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R18: the rocker stays clickable through its sequence, so a second "on"
  // press can land after the first has started the world. It finds the world running and does nothing: no voice is
  // released and rebuilt mid-music, the harmony is not reset, the loop and the lifecycle tick are not restarted.
  it('a power-on with the world already running (a double press) starts nothing more', async () => {
    const unsubscribes: ReturnType<typeof vi.fn>[] = [];
    vi.mocked(subscribeToMeasure).mockImplementation(() => {
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
    const reRegister = vi.spyOn(spawnSystemModule, 'reRegisterAllRobotsAudio');
    const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');
    const swellsStart = vi.spyOn(audioSwellsModule, 'startAudioSwells');
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    await powerController.powerOnSequence();
    await powerController.powerOnSequence();

    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(reRegister).toHaveBeenCalledTimes(1);
    expect(workStart).toHaveBeenCalledTimes(1);
    expect(swellsStart).toHaveBeenCalledTimes(1);
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    expect(getWorldState()).toBe('running');
    expect(useUIStore.getState().isPoweredOn).toBe(true);
  });

  it('the check follows the fade: a press whose fade ends after the first press has started the world finds it running', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    const reRegister = vi.spyOn(spawnSystemModule, 'reRegisterAllRobotsAudio');
    let endSecondFade!: () => void;
    vi.spyOn(offScreenTheatreModule, 'fadeOffScreen')
      .mockImplementationOnce(() => Promise.resolve('done' as const))
      .mockImplementationOnce(() => new Promise((resolve) => { endSecondFade = () => resolve('done'); }));

    const first = powerController.powerOnSequence();
    const second = powerController.powerOnSequence(); // pressed while the world is still cold
    await first;
    expect(getWorldState()).toBe('running');
    endSecondFade();
    await second;

    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(reRegister).toHaveBeenCalledTimes(1);
  });

  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F1: on a slow phone both presses' fades can end while the first press's
  // start is still under way, so both pass the running check. The second joins the start rather than starting again.
  describe('a second press whose fade ends during the first press\'s start', () => {
    /** AudioEngine.start held open until the returned settle function is called. */
    function holdStart() {
      let settle!: (err?: Error) => void;
      vi.mocked(AudioEngine.start).mockImplementationOnce(
        () => new Promise<void>((resolve, reject) => { settle = (err) => (err ? reject(err) : resolve()); }),
      );
      return (err?: Error) => settle(err);
    }

    it('joins it: one start, one re-registration, one set of systems, and both presses resolve over a running world', async () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const reRegister = vi.spyOn(spawnSystemModule, 'reRegisterAllRobotsAudio');
      const systemsStart = vi.spyOn(worldTransitionModule, 'startLocaleSystems');
      const settle = holdStart();

      const first = powerController.powerOnSequence();
      const second = powerController.powerOnSequence();
      await vi.waitFor(() => expect(AudioEngine.start).toHaveBeenCalled());
      await Promise.resolve(); await Promise.resolve(); // the second press's fade ends too, the start still open
      expect(getWorldState()).toBe('cold');
      settle();
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

      expect(AudioEngine.start).toHaveBeenCalledTimes(1);
      expect(reRegister).toHaveBeenCalledTimes(1);
      expect(systemsStart).toHaveBeenCalledTimes(1);
      expect(useUIStore.getState().isPoweredOn).toBe(true);
      expect(getWorldState()).toBe('running');
    });

    it('a rejected start rejects both presses, restores the screen once and leaves the world cold, so a third press starts again', async () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const restore = vi.spyOn(offScreenTheatreModule, 'restoreOffScreen');
      const settle = holdStart();
      const failure = new Error('no audio');

      const first = powerController.powerOnSequence();
      const second = powerController.powerOnSequence();
      await vi.waitFor(() => expect(AudioEngine.start).toHaveBeenCalled());
      await Promise.resolve(); await Promise.resolve();
      settle(failure);

      await expect(first).rejects.toBe(failure);
      await expect(second).rejects.toBe(failure);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(getWorldState()).toBe('cold');
      expect(useUIStore.getState().isPoweredOn).toBe(false);

      await powerController.powerOnSequence();

      expect(AudioEngine.start).toHaveBeenCalledTimes(2);
      expect(getWorldState()).toBe('running');
    });

    it('after a joined start, a pause and a power-on resume as before', async () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const settle = holdStart();
      const first = powerController.powerOnSequence();
      const second = powerController.powerOnSequence();
      await vi.waitFor(() => expect(AudioEngine.start).toHaveBeenCalled());
      settle();
      await Promise.all([first, second]);
      const resume = vi.spyOn(AudioEngine, 'resume');

      powerController.pause();
      await powerController.powerOnSequence();

      expect(resume).toHaveBeenCalledTimes(1);
      expect(AudioEngine.start).toHaveBeenCalledTimes(1);
      expect(getWorldState()).toBe('running');
    });
  });

  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F13 (second review, the nit): no press is left waiting on a killed fade. The
  // screen is mounted (its ref set) and the fades are held: each timeline keeps its onComplete for the test to fire.
  describe('presses during a fade (final fixes F13)', () => {
    let held: { complete: () => void }[];
    beforeEach(() => {
      held = [];
      vi.spyOn(gsap, 'timeline').mockImplementation(((config?: { onComplete?: () => void }) => {
        held.push({ complete: () => config?.onComplete?.() });
        const tl = { to: () => tl, kill: vi.fn(), paused: () => false, pause: () => tl, play: () => tl };
        return tl;
      }) as unknown as typeof gsap.timeline);
      setRef(offScreenTheatreModule.OFF_SCREEN_REF_KEY, document.createElement('div'));
    });
    afterEach(() => {
      killAllTimelines();
      clearRefs();
    });
    const tracked = (promise: Promise<void>) => {
      const state = { settled: false, rejected: false };
      promise.then(() => { state.settled = true; }, () => { state.settled = true; state.rejected = true; });
      return state;
    };

    it('two presses during one fade: both settle, and one start runs', async () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const first = tracked(powerController.powerOnSequence());
      const second = tracked(powerController.powerOnSequence());
      held.at(-1)!.complete();
      await vi.waitFor(() => expect(first.settled && second.settled).toBe(true));
      expect(first.rejected || second.rejected).toBe(false);
      expect(AudioEngine.start).toHaveBeenCalledTimes(1);
      expect(getWorldState()).toBe('running');
    });

    it('a press made during a failing start: it settles without a second start, and the screen is restored once', async () => {
      initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
      const restore = vi.spyOn(offScreenTheatreModule, 'restoreOffScreen');
      let fail!: (err: Error) => void;
      vi.mocked(AudioEngine.start).mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
      const failure = new Error('no audio');

      const first = powerController.powerOnSequence();
      held[0].complete();
      await vi.waitFor(() => expect(AudioEngine.start).toHaveBeenCalled());
      const second = tracked(powerController.powerOnSequence()); // its fade starts while the start is open
      expect(held).toHaveLength(2);
      fail(failure);

      await expect(first).rejects.toBe(failure);
      await vi.waitFor(() => expect(second.settled).toBe(true));
      expect(second.rejected).toBe(false); // its fade was cancelled: the screen is back and taking input
      expect(AudioEngine.start).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
      expect(getWorldState()).toBe('cold');
    });
  });

  it('a second power-on after a resume does nothing either: the world is resumed once', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    powerController.pause();
    const resume = vi.spyOn(AudioEngine, 'resume');
    const reRegister = vi.spyOn(spawnSystemModule, 'reRegisterAllRobotsAudio');

    await powerController.powerOnSequence();
    await powerController.powerOnSequence();

    expect(resume).toHaveBeenCalledTimes(1);
    expect(reRegister).not.toHaveBeenCalled();
    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(getWorldState()).toBe('running');
  });
});

// docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R1 (docs/specs/OFF_SCREEN.md §1.2): a world change that replaces a paused
// world tears it down first. The lifecycle tick, the work loop and the swells stop, killAll rewinds the transport and
// resets the BeatClock, and the paused span ends, so the new world is cold the way a fresh page's is and the next
// power-on is a full start. A live change, a cold world's change, an Attenuation-Style-only change and a theme alone tear
// nothing down.
describe('a world change while paused', () => {
  /** Every input that rebuilds the locale: the three modes the teardown covers. A theme alone re-derives in place
   *  (docs/tasks/OFF_SCREEN_FINAL_FIXES.md F7), so it is a case below with the Attenuation-Style-only one. */
  const REBUILDS = [
    ['coordinates only', { coordinates: { x: 3, y: 4 } }],
    ['Attenuation Style and coordinates (Roll)', { attenuationStyleName: 'Brinemouth', coordinates: { x: 3, y: 4 } }],
    ['Attenuation Style with a loading', { attenuationStyleName: 'Brinemouth', theme: 'calm' }],
  ] as const;

  const order = (fn: unknown) => vi.mocked(fn as () => void).mock.invocationCallOrder[0];
  const currentLocaleId = () => selectCurrentAttenuationStyle(useAttenuationStyleStore.getState())!.currentLocaleId!;

  beforeEach(() => {
    useAttenuationStyleStore.setState({ attenuationStyles: [{ ...DEFAULT_PELAGOS }], currentAttenuationStyleId: DEFAULT_PELAGOS.id });
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [], actors: [] } } });
    useUIStore.setState({ isPoweredOn: false });
    __resetPowerControllerForTest();
    killAllTimelines(); // the real timelineMap: no paused span or timeline carried in from another case
    vi.clearAllMocks();
  });

  afterEach(() => {
    robotSystemsModule.stopRobotLifecycle();
    audioSwellsModule.stopAudioSwells();
    workLoopModule.stopWorkLoop();
    killAllTimelines();
    useLoadingStore.getState().setLoading(DEFAULT_LOADING);
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  /** A world built while off, powered on, then paused by the rocker; every mock's calls cleared after. */
  async function pausedWorld() {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    powerController.pause();
    vi.clearAllMocks();
  }

  it.each(REBUILDS)('%s: tears the paused world down once, before the new roster spawns, and leaves it cold', async (_label, input) => {
    await pausedWorld();
    const lifecycleStop = vi.spyOn(robotSystemsModule, 'stopRobotLifecycle');
    const workStop = vi.spyOn(workLoopModule, 'stopWorkLoop');
    const swellsStop = vi.spyOn(audioSwellsModule, 'stopAudioSwells');
    const rosterSpawn = vi.spyOn(spawnSystemModule, 'spawnInitialRoster');

    retransmitWorld(input);

    expect(AudioEngine.killAll).toHaveBeenCalledTimes(1);
    // Each stop comes before killAll: its resetBeatClock drops every measure listener, so the lifecycle lets go first.
    for (const stop of [lifecycleStop, workStop, swellsStop]) {
      expect(stop).toHaveBeenCalledTimes(1);
      expect(order(stop)).toBeLessThan(order(AudioEngine.killAll));
    }
    expect(order(AudioEngine.killAll)).toBeLessThan(order(rosterSpawn));
    expect(getWorldState()).toBe('cold');
  });

  it('ends the paused span: a timeline the pause held plays again, and the new world registers playing', async () => {
    await pausedWorld();
    setTimeline('held', gsap.timeline(), 'world');
    expect(getTimeline('held')!.paused()).toBe(true); // registered inside the span: paused on arrival

    retransmitWorld({ coordinates: { x: 3, y: 4 } });

    expect(getTimeline('held')!.paused()).toBe(false);
    setTimeline('probe', gsap.timeline(), 'world');
    expect(getTimeline('probe')!.paused()).toBe(false);
  });

  it('clears the paused world swells: none survives into the new world', async () => {
    useAudioStore.setState({ swellFrequency: 4, swellDuration: 15, pingVarianceAutomation: 1 });
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    vi.mocked(getAttenuationStyleNoiseMap).mockReturnValueOnce(() => -1); // every draw at its minimum: a swell starts
    audioSwellsModule.tickAudioSwells(DEFAULT_LOCALE_ID, 0);
    powerController.pause();
    expect(audioSwellsModule.getActiveSwellSnapshot('global').length).toBeGreaterThan(0); // the pause froze it, no more

    retransmitWorld({ coordinates: { x: 3, y: 4 } });

    expect(audioSwellsModule.getActiveSwellSnapshot('global')).toEqual([]);
  });

  it('the next power-on is a full start: start() runs after the teardown killAll, then the new world systems', async () => {
    await pausedWorld();
    retransmitWorld({ coordinates: { x: 3, y: 4 } });
    const workStart = vi.spyOn(workLoopModule, 'startWorkLoop');

    await powerController.powerOnSequence();

    expect(AudioEngine.killAll).toHaveBeenCalledTimes(1);
    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(order(AudioEngine.killAll)).toBeLessThan(order(AudioEngine.start));
    expect(workStart).toHaveBeenCalledWith(currentLocaleId());
    expect(getWorldState()).toBe('running');
  });

  // Moved here from powerController.test.ts's noteWorldReplaced case (R31): the teardown left the world cold, so the
  // power-on takes the cold path and resumes nothing; start() wakes the suspended context through Tone.start().
  it('the power-on after the teardown resumes nothing: not the context, the world timelines or the loop clock', async () => {
    await pausedWorld();
    retransmitWorld({ coordinates: { x: 3, y: 4 } });
    const contextResume = vi.spyOn(AudioEngine, 'resume');
    const timelinesResume = vi.spyOn(timelineMapModule, 'resumeWorldTimelines');
    const clockResume = vi.spyOn(workLoopModule, 'resumeWorkLoop');

    await powerController.powerOnSequence();

    expect(AudioEngine.start).toHaveBeenCalledTimes(1);
    expect(contextResume).not.toHaveBeenCalled();
    expect(timelinesResume).not.toHaveBeenCalled();
    expect(clockResume).not.toHaveBeenCalled();
    expect(getWorldState()).toBe('running');
  });

  it('a replaced paused world is cold: a second world change before the power-on tears nothing down again', async () => {
    await pausedWorld();

    retransmitWorld({ coordinates: { x: 3, y: 4 } });
    retransmitWorld({ coordinates: { x: 5, y: 6 } });

    expect(AudioEngine.killAll).toHaveBeenCalledTimes(1);
    expect(getWorldState()).toBe('cold');
  });

  it('a world change while running (Foundry Retransmit) tears nothing down and stays running', async () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });
    await powerController.powerOnSequence();
    vi.clearAllMocks();

    retransmitWorld({ coordinates: { x: 3, y: 4 } });

    expect(AudioEngine.killAll).not.toHaveBeenCalled();
    expect(getWorldState()).toBe('running');
  });

  it.each([
    ['an Attenuation-Style-only change', { attenuationStyleName: 'Saltwhistle' }],
    ['a theme alone (final fixes F7)', { theme: 'calm' }],
  ] as const)('%s while paused rebuilds nothing, tears nothing down and stays paused', async (_label, input) => {
    await pausedWorld();
    const workStop = vi.spyOn(workLoopModule, 'stopWorkLoop');

    retransmitWorld(input);

    expect(AudioEngine.killAll).not.toHaveBeenCalled();
    expect(workStop).not.toHaveBeenCalled();
    setTimeline('probe', gsap.timeline(), 'world');
    expect(getTimeline('probe')!.paused()).toBe(true); // the span stands: the world is still paused
    expect(getWorldState()).toBe('paused');
  });

  it('a cold world tears nothing down at its first world change or its second (the check is paused, not held)', () => {
    initializeLocale(DEFAULT_LOCALE_ID, { startSystems: false });

    retransmitWorld({ coordinates: { x: 3, y: 4 } });
    retransmitWorld({ coordinates: { x: 5, y: 6 } });

    expect(AudioEngine.killAll).not.toHaveBeenCalled();
    expect(getWorldState()).toBe('cold');
  });
});
