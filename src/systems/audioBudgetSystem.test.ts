// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startAudioBudget, stopAudioBudget } from './audioBudgetSystem';
import { tickRobotLifecycle } from './robotSystems';
import { AudioEngine } from '../engine/AudioEngine';
import { lfoEngine } from '../engine/lfoEngine';
import { useAudioStore } from '../stores/audioStore';
import { DEFAULT_LOCALE_ID, useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DockingState } from '../types/Robot';
import type { LfoTargetId } from '../types/lfo';
import type { Robot } from '../types/Robot';
import { MAX_POLYPHONY } from '../constants';
import { resolveInitialAudioLoad } from '../utils/audioBudget';
import { isRobotAudible } from '../utils/robotAudibility';

// ========================================
// MOCKS
// ========================================

// Same mocks robotSystems.test.ts uses, so the real lifecycle tick can run without GSAP/SVG side effects.
vi.mock('./idleSystem', () => ({
  handleRobotIdle: vi.fn(),
  pickExitDestination: vi.fn(() => ({ x: -150, y: 300 })),
}));
vi.mock('../animation/swimAnimation', () => ({ createSwimTimeline: vi.fn() }));
vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 42),
  resetBeatClock: vi.fn(),
}));

// Call-through spy: counts how often the system re-evaluates eligibility, without changing what it does.
vi.mock('../utils/robotAudibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/robotAudibility')>();
  return { ...actual, isRobotAudible: vi.fn(actual.isRobotAudible) };
});

// ========================================
// HELPERS
// ========================================

function makeRobot(id: string, overrides: Partial<Robot> = {}): Robot {
  return {
    id,
    name: id,
    identityColor: '#428d95',
    state: 'idle',
    position: { x: 100, y: 100 },
    destination: null,
    direction: 'right',
    melody: [{ id: `${id}-e1`, startStep: 1, length: '16n', noteIndex: 0, octave: 4 }],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
      filterFreq: 800,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 4],
    createdAt: 0,
    masterVolume: 0.7,
    docking: DockingState.Active,
    batteryLevel: 100,
    audioMode: 'none',
    ...overrides,
  };
}

/** r1..rN, all audible, in roster order. */
const roster = (n: number): Robot[] => Array.from({ length: n }, (_, i) => makeRobot(`r${i + 1}`));

const setRoster = (robots: Robot[]): void =>
  useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots } } });

const update = (id: string, patch: Partial<Robot>): void =>
  useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, id, patch);

const sounding = (): string[] => useAudioStore.getState().soundingRobotIds;

const engineSet = vi.spyOn(AudioEngine, 'setSoundingRobots');
const enginePoly = vi.spyOn(AudioEngine, 'setPolyphonyCap');

// ========================================
// TESTS
// ========================================

describe('audioBudgetSystem', () => {
  beforeEach(() => {
    stopAudioBudget();
    useAudioStore.setState({ audioLoad: 1, soundingRobotIds: [], heldOffLfoKeys: [], driftHeldOff: false });
    setRoster([]);
    AudioEngine.setSoundingRobots(null);
    AudioEngine.setPolyphonyCap(MAX_POLYPHONY);
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopAudioBudget();
    AudioEngine.setSoundingRobots(null);
    AudioEngine.setPolyphonyCap(MAX_POLYPHONY);
  });

  describe('admission under a budget (Light: 4 robots, 8 notes)', () => {
    beforeEach(() => {
      useAudioStore.setState({ audioLoad: 0.2 });
    });

    it('lets exactly 4 of 6 eligible robots sound, the other 2 waiting in arrival order', () => {
      setRoster(roster(6));
      startAudioBudget();

      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4']);
      expect(engineSet).toHaveBeenLastCalledWith(['r1', 'r2', 'r3', 'r4']);
    });

    it('applies the budget to robots as they arrive, first come first served', () => {
      startAudioBudget();
      for (let i = 1; i <= 6; i++) setRoster(roster(i));

      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4']);
    });

    it('gives a departing robot’s slot to the earliest waiter (a robot docking goes muted)', () => {
      setRoster(roster(6));
      startAudioBudget();

      update('r1', { audioMode: 'mute', docking: DockingState.Docked });

      expect(sounding()).toEqual(['r2', 'r3', 'r4', 'r5']); // r5 waited longest; r6 still waits
    });

    it('does not let an explicit unmute jump the queue (decision B)', () => {
      setRoster(roster(6));
      startAudioBudget();
      update('r1', { audioMode: 'mute' }); // slot goes to r5
      update('r1', { audioMode: 'none' }); // r1 is back, but the set is full: it queues behind r6

      expect(sounding()).toEqual(['r2', 'r3', 'r4', 'r5']);

      update('r2', { audioMode: 'mute' });
      expect(sounding()).toEqual(['r3', 'r4', 'r5', 'r6']); // r6 arrived before r1's return

      update('r3', { audioMode: 'mute' });
      expect(sounding()).toEqual(['r4', 'r5', 'r6', 'r1']);
    });

    it('lets a soloed robot sound immediately, even though it was standing by (decision A)', () => {
      setRoster(roster(6));
      startAudioBudget();
      expect(sounding()).not.toContain('r6');

      update('r6', { audioMode: 'solo' });

      expect(sounding()).toEqual(['r6']);
    });

    it('re-queues everyone behind the soloed robot when solo ends, still within the budget', () => {
      setRoster(roster(6));
      startAudioBudget();
      update('r6', { audioMode: 'solo' });
      update('r6', { audioMode: 'none' });

      expect(sounding()).toEqual(['r6', 'r1', 'r2', 'r3']);
    });

    it('treats an unset audioMode as audible and highlight as audible, muted as not', () => {
      setRoster([
        makeRobot('a', { audioMode: undefined }),
        makeRobot('b', { audioMode: 'highlight' }),
        makeRobot('c', { audioMode: 'mute' }),
        makeRobot('d'),
      ]);
      startAudioBudget();

      expect(sounding()).toEqual(['a', 'b', 'd']);
    });
  });

  describe('changing the dial', () => {
    it('lowering audioLoad evicts the newest robots first and raising it admits waiters in order', () => {
      setRoster(roster(6));
      startAudioBudget();
      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']); // Full: everyone sounds

      useAudioStore.getState().setAudioLoad(0.2);
      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4']);

      useAudioStore.getState().setAudioLoad(0.6); // 8 robots
      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    });

    it('pushes the dial’s polyphony ceiling to the engine and keeps it in step', () => {
      startAudioBudget();
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(16);

      useAudioStore.getState().setAudioLoad(0.2);
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(8);

      useAudioStore.getState().setAudioLoad(0.6);
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(12);

      useAudioStore.getState().setAudioLoad(1);
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(16);
    });

    it('only tells the engine about the ceiling when it actually changes', () => {
      startAudioBudget();
      enginePoly.mockClear();

      useAudioStore.getState().setAudioLoad(0.2);
      useAudioStore.getState().setAudioLoad(0.21); // still 8 notes
      useAudioStore.getState().setAudioLoad(0.19); // still 8 notes

      expect(enginePoly).toHaveBeenCalledTimes(1);
    });
  });

  describe('Full (audioLoad = 1) is unchanged behavior', () => {
    it('lets every eligible robot sound and the ceiling stay at MAX_POLYPHONY', () => {
      setRoster(roster(12));
      startAudioBudget();

      expect(sounding()).toEqual(roster(12).map((r) => r.id));
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
    });

    it('still leaves muted robots out and follows mute changes', () => {
      setRoster(roster(12));
      startAudioBudget();

      update('r3', { audioMode: 'mute' });

      expect(sounding()).toHaveLength(11);
      expect(sounding()).not.toContain('r3');
    });
  });

  describe('roster and locale changes', () => {
    it('follows a brand-new roster (a world transition) and drops robots that no longer exist', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      setRoster(roster(6));
      startAudioBudget();

      setRoster([makeRobot('x1'), makeRobot('x2')]);

      expect(sounding()).toEqual(['x1', 'x2']);
    });

    it('ignores robots in locales other than the active one', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: roster(2) },
          elsewhere: { ...DEFAULT_LOCALE, id: 'elsewhere', robots: [makeRobot('far1'), makeRobot('far2')] },
        },
      });
      startAudioBudget();

      expect(sounding()).toEqual(['r1', 'r2']);
    });

    it('follows a change of the active locale itself, which the locale store never sees', () => {
      useLocaleStore.setState({
        locales: {
          [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: roster(2) },
          elsewhere: { ...DEFAULT_LOCALE, id: 'elsewhere', robots: [makeRobot('far1'), makeRobot('far2'), makeRobot('far3')] },
        },
      });
      startAudioBudget();
      expect(sounding()).toEqual(['r1', 'r2']);

      const styleId = useAttenuationStyleStore.getState().currentAttenuationStyleId;
      try {
        useAttenuationStyleStore.getState().setCurrentLocale(styleId, 'elsewhere');
        expect(sounding()).toEqual(['far1', 'far2', 'far3']);
      } finally {
        useAttenuationStyleStore.getState().setCurrentLocale(styleId, DEFAULT_LOCALE_ID);
      }
      expect(sounding()).toEqual(['r1', 'r2']);
    });

    it('does nothing (and nothing throws) when the active locale has no robots yet', () => {
      startAudioBudget();
      expect(sounding()).toEqual([]);
      expect(engineSet).toHaveBeenLastCalledWith([]);
    });
  });

  describe('no re-render storm', () => {
    it('does not even re-evaluate eligibility for churn that cannot change it (battery, position, melody)', () => {
      setRoster(roster(6));
      startAudioBudget();
      vi.mocked(isRobotAudible).mockClear();
      engineSet.mockClear();
      const listener = vi.fn();
      const unsubscribe = useAudioStore.subscribe(listener);

      for (let i = 0; i < 100; i++) {
        update('r1', { batteryLevel: 100 - i, position: { x: i, y: i } });
        update('r2', { masterVolume: 0.5 });
      }

      expect(isRobotAudible).not.toHaveBeenCalled();
      expect(engineSet).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('writes the store only for real set changes across a simulated 200-measure lifecycle run', () => {
      useAudioStore.setState({ audioLoad: 0.2 }); // Light: at most 4 sound
      vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

      // A mixed roster with staggered batteries so robots depart, dock and land across the run.
      const batteries = [95, 80, 60, 45, 20, 35, 50, 65, 80, 90, 25, 70];
      setRoster(
        batteries.map((batteryLevel, i) =>
          i < 4
            ? makeRobot(`r${i + 1}`, { batteryLevel })
            : makeRobot(`r${i + 1}`, { batteryLevel, docking: DockingState.Docked, audioMode: 'mute' }),
        ),
      );
      startAudioBudget();

      const writes: string[][] = [];
      let localeNotifications = 0;
      const unsubscribeAudio = useAudioStore.subscribe((state, prev) => {
        if (state.soundingRobotIds !== prev.soundingRobotIds) writes.push(state.soundingRobotIds);
      });
      const unsubscribeLocale = useLocaleStore.subscribe(() => localeNotifications++);
      engineSet.mockClear();

      for (let measure = 1; measure <= 200; measure++) tickRobotLifecycle(DEFAULT_LOCALE_ID, measure);

      unsubscribeAudio();
      unsubscribeLocale();

      expect(writes.length).toBeGreaterThan(3); // the run really did move robots around
      // Every write is a genuine change: none repeats the one before it, and the engine heard exactly the same number.
      writes.forEach((set, i) => {
        if (i > 0) expect(set).not.toEqual(writes[i - 1]);
        expect(set.length).toBeLessThanOrEqual(4); // never over the budget
      });
      expect(engineSet).toHaveBeenCalledTimes(writes.length);
      // …while the locale store was written far more often (battery, docking, position…): the subscription is not 1:1.
      expect(localeNotifications).toBeGreaterThan(writes.length * 5);
      // The final set is exactly what a from-scratch evaluation would give: only audible robots, within budget.
      const finalRobots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      sounding().forEach((id) => {
        const robot = finalRobots.find((r) => r.id === id)!;
        expect(isRobotAudible(robot.audioMode, false)).toBe(true);
      });
    });
  });

  describe('lifecycle of the system itself', () => {
    it('is idempotent to start twice: one roster change is handled once', () => {
      setRoster(roster(2));
      startAudioBudget();
      startAudioBudget();
      engineSet.mockClear();

      setRoster(roster(3));

      expect(engineSet).toHaveBeenCalledTimes(1);
    });

    it('stopAudioBudget unsubscribes everything and releases the restrictions', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      setRoster(roster(6));
      startAudioBudget();
      expect(sounding()).toHaveLength(4);

      stopAudioBudget();

      expect(sounding()).toEqual([]);
      expect(engineSet).toHaveBeenLastCalledWith(null);
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(MAX_POLYPHONY);
      engineSet.mockClear();
      enginePoly.mockClear();
      setRoster(roster(8)); // roster change after stop
      useAudioStore.getState().setAudioLoad(0.5); // dial change after stop
      expect(engineSet).not.toHaveBeenCalled();
      expect(enginePoly).not.toHaveBeenCalled();
      expect(sounding()).toEqual([]);
    });

    it('is harmless to stop when never started, or twice', () => {
      expect(() => {
        stopAudioBudget();
        stopAudioBudget();
      }).not.toThrow();
    });

    it('can be started again after a stop', () => {
      setRoster(roster(2));
      startAudioBudget();
      stopAudioBudget();
      startAudioBudget();

      expect(sounding()).toEqual(['r1', 'r2']);
      setRoster(roster(3));
      expect(sounding()).toEqual(['r1', 'r2', 'r3']);
    });

    it('is not torn down by a power cycle: AudioEngine.killAll() leaves the set and the ceiling alone', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      setRoster(roster(6));
      startAudioBudget();
      const before = sounding();

      AudioEngine.killAll();

      expect(sounding()).toBe(before);
      expect(AudioEngine.getPolyphonyStats().maxVoices).toBe(8);
      setRoster(roster(7)); // and it keeps reacting afterwards
      expect(sounding()).toEqual(['r1', 'r2', 'r3', 'r4']);
    });
  });

  // Plan task 20: the dial also drives the LFO tiers — the policy lfoEngine consults, drift on/off, and the held-off state
  // the UI greys out from. Real lfoEngine, spied call-through: nothing here connects an LFO, so no Tone context is needed.
  describe('LFO tiers', () => {
    const setPolicy = vi.spyOn(lfoEngine, 'setLfoPolicy');
    const setDrift = vi.spyOn(lfoEngine, 'setDriftEnabled');
    const reconcileLfos = vi.spyOn(lfoEngine, 'reconcileLfos');
    const getHeldOff = vi.spyOn(lfoEngine, 'getHeldOffLfoKeys');
    const subscribeHeldOff = vi.spyOn(lfoEngine, 'subscribeHeldOff');

    type Policy = (target: LfoTargetId, robotId: string | undefined, connectedRobotLfos: number) => boolean;
    const policy = (): Policy => setPolicy.mock.calls.filter((c) => c[0] !== null).at(-1)![0] as Policy;
    const store = () => useAudioStore.getState();

    afterEach(() => {
      // Vitest 3: mockReset() on a spy restores the original (call-through) implementation, keeping the spy in place.
      getHeldOff.mockReset();
      subscribeHeldOff.mockReset();
    });

    it('installs the policy for the dial in force at start, before anything can connect (boot at ?load=light)', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      startAudioBudget();

      expect(policy()('lpf.Q', undefined, 0)).toBe(false); // filter LFOs off on Light
      expect(policy()('lpf.frequency', undefined, 0)).toBe(false);
      expect(policy()('eq3.low', undefined, 0)).toBe(true); // EQ-gain LFOs stay
      expect(policy()('volume', 'r1', 3)).toBe(true); // Light allows 4 audio-rate robot LFOs
      expect(policy()('volume', 'r1', 4)).toBe(false);
      expect(policy()('layer0.phase', 'r1', 99)).toBe(true); // phase LFOs are never counted
      expect(setDrift).toHaveBeenLastCalledWith(false);
    });

    it('at Full nothing is restricted: every LFO allowed, drift on, nothing held off', () => {
      startAudioBudget();

      expect(policy()('lpf.Q', undefined, 0)).toBe(true);
      expect(policy()('volume', 'r1', 5000)).toBe(true);
      expect(setDrift).toHaveBeenLastCalledWith(true);
      expect(store().driftHeldOff).toBe(false);
      expect(store().heldOffLfoKeys).toEqual([]);
    });

    it('moving the dial across each threshold flips exactly that tier', () => {
      startAudioBudget();
      const set = (load: number) => useAudioStore.getState().setAudioLoad(load);

      set(0.6); // Standard
      expect(policy()('lpf.Q', undefined, 0)).toBe(true);
      expect(setDrift).toHaveBeenLastCalledWith(false);

      set(0.39); // just under the filter threshold
      expect(policy()('lpf.Q', undefined, 0)).toBe(false);

      set(0.79); // just under the drift threshold
      expect(policy()('lpf.Q', undefined, 0)).toBe(true);
      expect(setDrift).toHaveBeenLastCalledWith(false);

      set(0.8);
      expect(setDrift).toHaveBeenLastCalledWith(true);
    });

    it('re-installs the policy, then sets drift, then reconciles — in that order — on every tier change', () => {
      startAudioBudget();
      vi.clearAllMocks();

      useAudioStore.getState().setAudioLoad(0.2);

      const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
      expect(setPolicy).toHaveBeenCalled();
      expect(order(setPolicy)).toBeLessThan(order(setDrift));
      expect(order(setDrift)).toBeLessThan(order(reconcileLfos));
    });

    it('does not re-run the tiers for a dial change that leaves every tier limit where it was', () => {
      useAudioStore.setState({ audioLoad: 0.5 });
      startAudioBudget();
      vi.clearAllMocks();

      useAudioStore.getState().setAudioLoad(0.51); // same filter/drift state, same robot-LFO cap
      useAudioStore.getState().setAudioLoad(0.52);

      expect(setPolicy).not.toHaveBeenCalled();
      expect(reconcileLfos).not.toHaveBeenCalled();
    });

    it('does not re-run the tiers for roster churn (only the dial changes them)', () => {
      setRoster(roster(4));
      startAudioBudget();
      vi.clearAllMocks();

      update('r1', { audioMode: 'mute' });
      update('r1', { audioMode: 'none' });

      expect(setPolicy).not.toHaveBeenCalled();
      expect(reconcileLfos).not.toHaveBeenCalled();
    });

    it('marks drift held off exactly while the dial keeps it off, writing the flag only on a real change', () => {
      startAudioBudget();
      // Count real value transitions. (The system sets driftHeldOff from inside the audioLoad notification, so Zustand hands an
      // outside observer the same change twice — once with the nested `prev`, once with the outer one — hence tracking the last value seen.)
      let writes = 0;
      let last = store().driftHeldOff;
      const unsubscribe = useAudioStore.subscribe((state) => {
        if (state.driftHeldOff !== last) {
          writes++;
          last = state.driftHeldOff;
        }
      });

      for (let percent = 100; percent >= 0; percent--) useAudioStore.getState().setAudioLoad(percent / 100);
      expect(store().driftHeldOff).toBe(true);
      expect(writes).toBe(1);

      for (let percent = 0; percent <= 100; percent++) useAudioStore.getState().setAudioLoad(percent / 100);
      expect(store().driftHeldOff).toBe(false);
      expect(writes).toBe(2);
      unsubscribe();
    });

    describe('held-off LFOs mirrored into the store', () => {
      it('writes the engine’s held-off keys whenever the engine reports a change — e.g. a robot LFO enabled over the cap', () => {
        useAudioStore.setState({ audioLoad: 0.2 });
        startAudioBudget();
        const onChange = subscribeHeldOff.mock.calls.at(-1)![0];

        getHeldOff.mockReturnValue(['robot-3:layer0.detune']);
        onChange();

        expect(store().heldOffLfoKeys).toEqual(['robot-3:layer0.detune']);
      });

      it('does not write when the same LFOs are held off, and clears when none are', () => {
        startAudioBudget();
        const onChange = subscribeHeldOff.mock.calls.at(-1)![0];
        getHeldOff.mockReturnValue(['lpf.Q']);
        onChange();
        const stored = store().heldOffLfoKeys;
        const listener = vi.fn();
        const unsubscribe = useAudioStore.subscribe(listener);

        onChange();
        expect(listener).not.toHaveBeenCalled();
        expect(store().heldOffLfoKeys).toBe(stored);

        getHeldOff.mockReturnValue([]);
        onChange();
        expect(store().heldOffLfoKeys).toEqual([]);
        unsubscribe();
      });

      it('picks up LFOs that were already held off when the system starts, and after a dial change re-reconciles', () => {
        getHeldOff.mockReturnValue(['lpf.Q']);
        startAudioBudget();
        expect(store().heldOffLfoKeys).toEqual(['lpf.Q']);

        getHeldOff.mockReturnValue([]);
        useAudioStore.getState().setAudioLoad(0.7); // any tier change re-syncs
        useAudioStore.getState().setAudioLoad(1);
        expect(store().heldOffLfoKeys).toEqual([]);
      });
    });

    it('stopAudioBudget lifts every tier: policy removed, drift back on, reconciled, held-off state cleared, listener released', () => {
      useAudioStore.setState({ audioLoad: 0.2 });
      const unsubscribeEngine = vi.fn();
      subscribeHeldOff.mockImplementation(() => unsubscribeEngine);
      getHeldOff.mockReturnValue(['lpf.Q']);
      startAudioBudget();
      expect(store().driftHeldOff).toBe(true);
      vi.clearAllMocks();

      stopAudioBudget();

      expect(setPolicy).toHaveBeenLastCalledWith(null);
      expect(setDrift).toHaveBeenLastCalledWith(true);
      expect(reconcileLfos).toHaveBeenCalled();
      expect(store().heldOffLfoKeys).toEqual([]);
      expect(store().driftHeldOff).toBe(false);
      expect(unsubscribeEngine).toHaveBeenCalledTimes(1);
    });
  });

  // Decision H: the chosen preset is mirrored into the URL (replaceState, other params kept) so a reload keeps it.
  describe('URL mirror', () => {
    const originalMatchMedia = window.matchMedia;
    const setUrl = (search: string, hash = '') => window.history.replaceState({}, '', `/trace-atlas/${search}${hash}`);
    const phone = () => {
      window.matchMedia = vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' })) as unknown as typeof window.matchMedia;
    };

    beforeEach(() => {
      setUrl('');
    });

    afterEach(() => {
      window.history.replaceState({}, '', '/');
      window.matchMedia = originalMatchMedia;
    });

    it('writes ?load= when the dial changes, leaving seed, x, y, debug and latency intact', () => {
      setUrl('?debug&seed=bravo&x=-150&y=90&latency=playback');
      startAudioBudget();

      useAudioStore.getState().setAudioLoad(0.2);

      expect(window.location.search).toBe('?debug&seed=bravo&x=-150&y=90&latency=playback&load=light');
    });

    it('keeps the path and the hash, and adds no history entries', () => {
      setUrl('?debug', '#section');
      startAudioBudget();
      const entries = window.history.length;
      const push = vi.spyOn(window.history, 'pushState');

      useAudioStore.getState().setAudioLoad(0.6);
      useAudioStore.getState().setAudioLoad(0.45);

      expect(window.location.pathname).toBe('/trace-atlas/');
      expect(window.location.hash).toBe('#section');
      expect(window.location.search).toBe('?debug&load=45');
      expect(window.history.length).toBe(entries);
      expect(push).not.toHaveBeenCalled();
      push.mockRestore();
    });

    it('writes the preset name at a preset and a whole percent between presets', () => {
      startAudioBudget();
      const at = (load: number) => {
        useAudioStore.getState().setAudioLoad(load);
        return window.location.search;
      };
      expect(at(0.2)).toBe('?load=light');
      expect(at(0.6)).toBe('?load=standard');
      expect(at(0.37)).toBe('?load=37');
      expect(at(1)).toBe(''); // Full is the desktop default and ?load= was absent at boot, so it is removed
    });

    it('removes ?load= when set back to Full on a desktop, if it was absent at boot', () => {
      startAudioBudget();
      useAudioStore.getState().setAudioLoad(0.2);
      expect(window.location.search).toBe('?load=light');

      useAudioStore.getState().setAudioLoad(1);

      expect(window.location.search).toBe('');
    });

    it('keeps ?load=full explicit when ?load= was present at boot', () => {
      setUrl('?load=light');
      useAudioStore.setState({ audioLoad: 0.2 });
      startAudioBudget();

      useAudioStore.getState().setAudioLoad(1);

      expect(window.location.search).toBe('?load=full');
    });

    it('on a phone (auto-default Light), Full is NOT the default so it stays explicit, and Light is removed', () => {
      phone();
      useAudioStore.setState({ audioLoad: 0.2 });
      startAudioBudget();

      useAudioStore.getState().setAudioLoad(1);
      expect(window.location.search).toBe('?load=full');

      useAudioStore.getState().setAudioLoad(0.2);
      expect(window.location.search).toBe(''); // a reload gives Light again, so no param is needed
    });

    it('does not touch the URL merely by starting', () => {
      setUrl('?debug&load=standard');
      const replace = vi.spyOn(window.history, 'replaceState');
      startAudioBudget();
      expect(replace).not.toHaveBeenCalled();
      replace.mockRestore();
    });

    it('does not rewrite the URL when the value it would write is already there', () => {
      setUrl('?load=light');
      useAudioStore.setState({ audioLoad: 0.2 });
      startAudioBudget();
      const replace = vi.spyOn(window.history, 'replaceState');

      useAudioStore.getState().setAudioLoad(0.2004); // still "light" at whole-percent resolution
      useAudioStore.getState().setAudioLoad(0.2);

      expect(replace).not.toHaveBeenCalled();
      replace.mockRestore();
    });

    it('a reload reads back exactly the dial that was left, for every whole percent, on desktop and phone', () => {
      for (const isPhone of [false, true]) {
        window.matchMedia = originalMatchMedia;
        if (isPhone) phone();
        setUrl('?debug');
        startAudioBudget();
        for (let percent = 0; percent <= 100; percent++) {
          useAudioStore.getState().setAudioLoad(percent / 100);
          expect(
            resolveInitialAudioLoad({ search: window.location.search, coarsePointer: isPhone }),
            `${isPhone ? 'phone' : 'desktop'} ${percent}%`,
          ).toBe(percent / 100);
        }
        stopAudioBudget();
      }
    });

    it('stops mirroring after stopAudioBudget', () => {
      startAudioBudget();
      stopAudioBudget();
      useAudioStore.getState().setAudioLoad(0.2);
      expect(window.location.search).toBe('');
    });

    it('survives replaceState throwing (a sandboxed frame): the dial and the budget still update', () => {
      const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      setRoster(roster(6));
      startAudioBudget();

      expect(() => useAudioStore.getState().setAudioLoad(0.2)).not.toThrow();

      expect(useAudioStore.getState().audioLoad).toBe(0.2);
      expect(sounding()).toHaveLength(4);
      replace.mockRestore();
    });
  });
});
