// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  tickRobotLifecycle,
  startRobotLifecycle,
  stopRobotLifecycle,
  landOnActive,
  landOnDocked,
  stepRobotLifecycle,
  replayLifecycle,
  activeDrain,
  stepShiftLifecycle,
  toLifecycleSnapshot,
} from './robotSystems';
import type { RobotLifecycleSnapshot, ShiftLifecycleSnapshot } from './robotSystems';
import { planEntrance, planExit, rescaleMove, shiftWindow, type ShiftEnv } from './shiftPlan';
import { journeyKey, journeyTurns } from '../engine/melodyJourney';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { useAudioStore } from '../stores/audioStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { AudioEngine } from '../engine/AudioEngine';
import { buildClickTrackMelody } from '../engine/clickTrack';
import { DockingState, JobType } from '../types/Robot';
import type { Robot } from '../types/Robot';
import {
  BATTERY_DRAIN_ACTIVE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  BATTERY_SIZE_MIN,
  BATTERY_SIZE_MAX,
  BATTERY_EASE_SHARE,
  MAX_ROBOTS,
} from '../constants';

// ========================================
// MOCKS
// ========================================

// The tick reaches anything visual only through the onLifecycleChange seam (Phase 43 Task 5).
// Mock it so these tests assert "was the seam called, with which `to`, after which writes" —
// the work loop behind it (Task 24) has its own tests in workLoop.test.ts, and
// workLoop.integration.test.ts runs it end to end under the real tick.
vi.mock('./workLoop', () => ({
  onLifecycleChange: vi.fn(),
}));
import { onLifecycleChange } from './workLoop';
const seam = onLifecycleChange as ReturnType<typeof vi.fn>;

vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 42),
}));
import { subscribeToMeasure, getCurrentMeasure } from '../engine/beatClock';

// ========================================
// HELPERS
// ========================================

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: overrides.id ?? 'robot-1',
    compositionSeed: 0.5,
    name: 'Test Robot',
    identityColor: '#428d95',
    gemSeed: 1,
    position: { x: 100, y: 100 },
    melody: [
      { id: 'e1', startStep: 1, length: '16n', noteIndex: 0, octave: 4 },
      { id: 'e2', startStep: 5, length: '16n', noteIndex: 1, octave: 4 },
      { id: 'e3', startStep: 9, length: '16n', noteIndex: 2, octave: 4 },
      { id: 'e4', startStep: 13, length: '16n', noteIndex: 3, octave: 4 },
    ],
    audioAttributes: {
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
      filterFreq: 800,
      waveform: 'sine',
      layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0 }],
    },
    octaveRange: [3, 4],
    masterVolume: 0.7,
    pan: 0,
    panAuto: true,
    reverbSend: 0,
    delaySend: 0,
    gritSend: 0,
    shimmerSend: 0,
    doubleSend: 0,
    docking: DockingState.Active,
    activity: 'exiting',
    batteryLevel: 100,
    ...overrides,
  };
}

function setupLocaleWithRobots(robots: Robot[]): void {
  useLocaleStore.setState({
    locales: {
      // Pinned coordinates (the default locale's are random per process): the tick keys the journeys on them.
      [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: { x: 0, y: 0 }, robots },
    },
  });
}

// ========================================
// TESTS
// ========================================

describe('robotSystems', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    vi.clearAllMocks();
  });

  // The battery's two retired rates and its size band stay pinned until the removals (roadmap 94 Task 27).
  describe('battery constants', () => {
    it('BATTERY_DRAIN_ACTIVE is the flat 6 the Phase 43 drain sim picked', () => {
      expect(BATTERY_DRAIN_ACTIVE).toBe(6);
    });

    it('the battery-size band is Gate A\'s pick, 0.67-1.5 (Crawford, 2026-11-11)', () => {
      expect([BATTERY_SIZE_MIN, BATTERY_SIZE_MAX]).toEqual([0.67, 1.5]);
    });
  });

  // Roadmap 94 Task 21 (docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §1.8): the tick runs the shift step. The
  // battery-driven cases that stood here were re-aimed at moves: a robot carries its exit turn or its entrance, and the
  // battery is the gauge. The locale is pinned to (0, 0), so its journeys are the same on every run.
  describe('tickRobotLifecycle — the shift step (roadmap 94 Task 21)', () => {
    const ENV: ShiftEnv = { bpm: 60, worldKey: '0:0' };
    const robotIn = (id: string) => useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id)!;
    const docking = (id: string) => robotIn(id).docking;
    /** A freelancer out for good, so a recall is never a stay. */
    const keeper = () => makeRobot({ id: 'robot-keeper', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 60 });
    const snapshotOf = (r: Robot): ShiftLifecycleSnapshot => ({
      id: r.id,
      docking: r.docking,
      batteryLevel: r.batteryLevel,
      dockingHoldUntilMeasure: r.dockingHoldUntilMeasure,
      batterySize: r.batterySize,
      companyId: r.companyId,
      compositionSeed: r.compositionSeed,
      entersAtMeasure: r.entersAtMeasure,
      exitsAtMeasure: r.exitsAtMeasure,
      shiftBpm: r.shiftBpm,
    });
    const member = (id: string, o: Partial<Robot> = {}) => makeRobot({ id, companyId: 'co-t', compositionSeed: id.length / 16, ...o });

    beforeEach(() => {
      useAudioStore.setState({ bpm: 60 });
    });

    it("writes each robot's docking, hold, battery and moves as stepShiftLifecycle gives them, at the store tempo and the locale key", () => {
      const robots = [
        makeRobot({ id: 'a', compositionSeed: 0.1, exitsAtMeasure: 40, shiftBpm: 60, batteryLevel: 70 }),
        makeRobot({ id: 'b', compositionSeed: 0.2, docking: DockingState.Docked, entersAtMeasure: 30, shiftBpm: 60, batteryLevel: 20 }),
        makeRobot({ id: 'c', compositionSeed: 0.3, docking: DockingState.Recalled, dockingHoldUntilMeasure: 12, exitsAtMeasure: 11, shiftBpm: 60, batteryLevel: 14 }),
        makeRobot({ id: 'd', compositionSeed: 0.4, docking: DockingState.Undocking, dockingHoldUntilMeasure: 11, entersAtMeasure: 11, shiftBpm: 60, batteryLevel: 95 }),
        makeRobot({ id: 'e', compositionSeed: 0.5, docking: DockingState.Docked, batteryLevel: 50 }),
      ];
      setupLocaleWithRobots(robots);
      const want = stepShiftLifecycle(robots.map(snapshotOf), 10, ENV);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      for (const w of want) {
        const got = robotIn(w.id);
        expect(snapshotOf(got), w.id).toEqual(w);
      }
      // Not vacuous: the battery moved for every robot, and the freelancer with none drew an entrance.
      robots.forEach((r) => expect(robotIn(r.id).batteryLevel).not.toBe(r.batteryLevel));
      expect(robotIn('e').entersAtMeasure).toBeDefined();
    });

    it('reads the tempo from the audio store: at 200 BPM the same exit turn recalls 20 measures ahead, not 6', () => {
      useAudioStore.setState({ bpm: 200 });
      setupLocaleWithRobots([makeRobot({ id: 'a', exitsAtMeasure: 100, shiftBpm: 200 }), makeRobot({ id: 'k', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 200 })]);
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 79);
      expect(docking('a')).toBe(DockingState.Active);
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 80);
      expect(docking('a')).toBe(DockingState.Recalled);
      expect(robotIn('a').dockingHoldUntilMeasure).toBe(101);
    });

    it("recalls a company on one tick from its exit turn: the seam once per member, each after that member's Recalled write", () => {
      setupLocaleWithRobots([member('m1', { exitsAtMeasure: 50, shiftBpm: 60 }), member('m22', { exitsAtMeasure: 50, shiftBpm: 60 }), member('m333', { exitsAtMeasure: 50, shiftBpm: 60 }), keeper()]);
      const dockingAtSeam: Record<string, DockingState | undefined> = {};
      seam.mockImplementation((_l: string, id: string) => {
        dockingAtSeam[id] = robotIn(id).docking;
      });

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 43);
      expect(seam).not.toHaveBeenCalled();
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 44);

      expect(seam.mock.calls).toEqual([
        [DEFAULT_LOCALE_ID, 'm1', 'recalled'],
        [DEFAULT_LOCALE_ID, 'm22', 'recalled'],
        [DEFAULT_LOCALE_ID, 'm333', 'recalled'],
      ]);
      expect(dockingAtSeam).toEqual({ m1: DockingState.Recalled, m22: DockingState.Recalled, m333: DockingState.Recalled });
      for (const id of ['m1', 'm22', 'm333']) expect(robotIn(id).dockingHoldUntilMeasure).toBe(51);
      seam.mockReset();
    });

    it('beginRecall writes no visual state itself: no position or activity (the seam tells the loop)', () => {
      const robot = makeRobot({ position: { x: 960, y: 540 }, activity: 'working', exitsAtMeasure: 16, shiftBpm: 60 });
      setupLocaleWithRobots([robot, keeper()]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = robotIn(robot.id);
      expect(updated.docking).toBe(DockingState.Recalled);
      expect(updated.position).toEqual(robot.position);
      expect(updated.activity).toBe(robot.activity);
    });

    it('a Docked robot begins Undocking the measure before its entrance, holding until it; the seam is not called', () => {
      setupLocaleWithRobots([makeRobot({ docking: DockingState.Docked, entersAtMeasure: 21, shiftBpm: 60, batteryLevel: 40 }), keeper()]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 19);
      expect(docking('robot-1')).toBe(DockingState.Docked);
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 20);

      expect(docking('robot-1')).toBe(DockingState.Undocking);
      expect(robotIn('robot-1').dockingHoldUntilMeasure).toBe(21);
      expect(seam).not.toHaveBeenCalled();
    });

    it('moves the battery through the holds: a Recalled robot falls to 10 on its hold, an Undocking one rises to 100', () => {
      setupLocaleWithRobots([
        makeRobot({ id: 'in', docking: DockingState.Recalled, dockingHoldUntilMeasure: 12, exitsAtMeasure: 11, shiftBpm: 60, batteryLevel: 30 }),
        makeRobot({ id: 'out', compositionSeed: 0.2, docking: DockingState.Undocking, dockingHoldUntilMeasure: 12, entersAtMeasure: 12, shiftBpm: 60, batteryLevel: 80 }),
        keeper(),
      ]);
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 11);
      expect(robotIn('in').batteryLevel).toBe(20);
      expect(robotIn('out').batteryLevel).toBe(90);
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 12);
      expect(robotIn('in').batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      expect(robotIn('in').docking).toBe(DockingState.Docked);
      expect(robotIn('out').batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(robotIn('out').docking).toBe(DockingState.Active);
    });

    it('writes nothing new but the battery, the docking and the moves, and never audioMode', () => {
      setupLocaleWithRobots([
        makeRobot({ id: 'a', exitsAtMeasure: 16, shiftBpm: 60, audioMode: 'solo' }),
        makeRobot({ id: 'b', compositionSeed: 0.2, docking: DockingState.Docked, audioMode: 'mute' }),
        makeRobot({ id: 'c', compositionSeed: 0.3, docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, entersAtMeasure: 10, shiftBpm: 60 }),
        keeper(),
      ]);
      const update = vi.spyOn(useLocaleStore.getState(), 'updateRobot');
      try {
        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);
        const allowed = new Set(['batteryLevel', 'entersAtMeasure', 'exitsAtMeasure', 'shiftBpm', 'docking', 'dockingHoldUntilMeasure']);
        expect(update).toHaveBeenCalled();
        for (const [, , patch] of update.mock.calls) for (const key of Object.keys(patch)) expect(allowed.has(key), key).toBe(true);
      } finally {
        update.mockRestore();
      }
      expect(robotIn('a').audioMode).toBe('solo');
      expect(robotIn('b').audioMode).toBe('mute');
    });

    it('does not throw for a locale with no coordinates, nor for robots with no moves at all', () => {
      useLocaleStore.setState({
        locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, coordinates: undefined as never, robots: [makeRobot({ id: 'a' }), makeRobot({ id: 'b', compositionSeed: 0.3, docking: DockingState.Docked })] } },
      });
      expect(() => {
        for (let m = 1; m <= 30; m++) tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
      }).not.toThrow();
      expect(robotIn('b').entersAtMeasure).toBeDefined();
    });

    // The stay (spec §1.9), the no-silence cases re-aimed: a group due for recall goes only while a robot outside it
    // is Active.
    describe('the stay', () => {
      it('the sole Active robot due for recall stays Active: no hold set, its exit turn dropped, no seam (case 1)', () => {
        setupLocaleWithRobots([makeRobot({ exitsAtMeasure: 16, shiftBpm: 60 }), makeRobot({ id: 'robot-docked', compositionSeed: 0.2, docking: DockingState.Docked, entersAtMeasure: 500, shiftBpm: 60 })]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(docking('robot-1')).toBe(DockingState.Active);
        expect(robotIn('robot-1').dockingHoldUntilMeasure).toBeUndefined();
        expect(robotIn('robot-1').exitsAtMeasure).toBeUndefined();
        expect(seam).not.toHaveBeenCalled();
      });

      it('while it stays its battery falls every measure and never reaches 0, still Active (case 2)', () => {
        setupLocaleWithRobots([makeRobot({ exitsAtMeasure: 16, shiftBpm: 60, batteryLevel: 30 })]);
        let last = 30;
        for (let m = 10; m <= 60; m++) {
          tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
          expect(docking('robot-1')).toBe(DockingState.Active);
          expect(robotIn('robot-1').batteryLevel).toBeLessThan(last);
          expect(robotIn('robot-1').batteryLevel).toBeGreaterThan(0);
          last = robotIn('robot-1').batteryLevel;
        }
        expect(seam).not.toHaveBeenCalled();
      });

      it('relief landing earlier in the roster gives the staying robot its exit turn the same tick (case 3)', () => {
        const lander = makeRobot({ id: 'robot-lander', compositionSeed: 0.2, docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, entersAtMeasure: 10, shiftBpm: 60 });
        const staying = makeRobot({ id: 'robot-staying', compositionSeed: 0.3 });
        setupLocaleWithRobots([lander, staying]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(docking(lander.id)).toBe(DockingState.Active);
        expect(robotIn(staying.id).exitsAtMeasure).toBeGreaterThan(10 + 6);
        expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, lander.id, 'active']]);
      });

      it('relief landing later in the roster gives it the next tick (case 3)', () => {
        const staying = makeRobot({ id: 'robot-staying', compositionSeed: 0.3 });
        const lander = makeRobot({ id: 'robot-lander', compositionSeed: 0.2, docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, entersAtMeasure: 10, shiftBpm: 60 });
        setupLocaleWithRobots([staying, lander]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);
        expect(robotIn(staying.id).exitsAtMeasure).toBeUndefined();
        tickRobotLifecycle(DEFAULT_LOCALE_ID, 11);
        expect(robotIn(staying.id).exitsAtMeasure).toBeGreaterThan(11 + 6);
      });

      it('two groups due on one tick with no third Active: the earlier departs, the later stays (case 4)', () => {
        setupLocaleWithRobots([makeRobot({ id: 'robot-a', compositionSeed: 0.2, exitsAtMeasure: 16, shiftBpm: 60 }), makeRobot({ id: 'robot-b', compositionSeed: 0.3, exitsAtMeasure: 16, shiftBpm: 60 })]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect([docking('robot-a'), docking('robot-b')]).toEqual([DockingState.Recalled, DockingState.Active]);
        expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, 'robot-a', 'recalled']]);
      });

      it('with a third robot Active, two groups due together both depart (case 4)', () => {
        setupLocaleWithRobots([makeRobot({ id: 'robot-a', compositionSeed: 0.2, exitsAtMeasure: 16, shiftBpm: 60 }), makeRobot({ id: 'robot-b', compositionSeed: 0.3, exitsAtMeasure: 16, shiftBpm: 60 }), keeper()]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect([docking('robot-a'), docking('robot-b')]).toEqual([DockingState.Recalled, DockingState.Recalled]);
      });

      it('a muted last robot still stays: the rule reads docking, not audioMode (case 6)', () => {
        setupLocaleWithRobots([makeRobot({ exitsAtMeasure: 16, shiftBpm: 60, audioMode: 'mute' }), makeRobot({ id: 'robot-docked', compositionSeed: 0.2, docking: DockingState.Docked, entersAtMeasure: 500, shiftBpm: 60 })]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(docking('robot-1')).toBe(DockingState.Active);
        expect(seam).not.toHaveBeenCalled();
      });
    });
  });

  describe('tickRobotLifecycle — hold-elapsed landing', () => {
    beforeEach(() => {
      useAudioStore.setState({ bpm: 60 });
    });

    it('an Undocking robot whose hold has elapsed lands on Active', () => {
      const robot = makeRobot({
        docking: DockingState.Undocking,
        dockingHoldUntilMeasure: 10,
        batteryLevel: 100,
        job: undefined,
      });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Active);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('an Undocking robot whose hold has NOT elapsed stays Undocking', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 15, batteryLevel: 100 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Undocking);
    });

    it('a Recalled robot whose hold has elapsed lands on Docked', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 10, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    // Roadmap 92 Task 8 (docs/specs/MELODY_JOURNEY.md): docking pitch drift is gone, so the home melody holds still.
    it('a Recalled robot landing on Docked keeps the same melody array and registers no melody', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 10, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');
      try {
        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
        expect(updated.docking).toBe(DockingState.Docked);
        expect(updated.melody).toBe(robot.melody);
        expect(register).not.toHaveBeenCalled();
      } finally {
        register.mockRestore();
      }
    });

    it('a robot taken through two whole dock cycles still holds its spawn melody', () => {
      const robot = makeRobot({ batteryLevel: 10 });
      // Out for good, so the robot is always free to go (the stay).
      const companion = makeRobot({ id: 'companion', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 60 });
      const home = robot.melody.map((e) => ({ ...e }));
      setupLocaleWithRobots([robot, companion]);
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');
      try {
        let docked = 0;
        for (let measure = 1; measure <= 600 && docked < 2; measure++) {
          const before = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!.docking;
          tickRobotLifecycle(DEFAULT_LOCALE_ID, measure);
          const after = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!.docking;
          if (before === DockingState.Recalled && after === DockingState.Docked) docked++;
        }

        expect(docked).toBe(2);
        expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!.melody).toEqual(home);
        expect(register).not.toHaveBeenCalled();
      } finally {
        register.mockRestore();
      }
    });
  });

  describe('tickRobotLifecycle — multi-measure integration (re-aimed at an exit turn, roadmap 94 Task 21)', () => {
    it('drives a full Active -> Recalled -> Docked cycle across real ticks, the gauge landing on 10 as it docks', () => {
      useAudioStore.setState({ bpm: 60 });
      // Exit turn 10 at 60 BPM: recalled at 4 (the lead is 6), held to 11, Docked on 11 with the battery at 10.
      const robot = makeRobot({ id: 'integration-robot', batteryLevel: 28, job: undefined, exitsAtMeasure: 10, shiftBpm: 60 });
      const companion = makeRobot({ id: 'integration-companion', compositionSeed: 0.9, batteryLevel: 100, job: undefined, exitsAtMeasure: 100_000, shiftBpm: 60 });
      setupLocaleWithRobots([robot, companion]);
      const at = () => useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 1);
      expect(at().batteryLevel).toBeCloseTo(28 - 18 / 11, 12);
      expect(at().docking).toBe(DockingState.Active);

      for (let m = 2; m <= 3; m++) tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
      expect(at().docking).toBe(DockingState.Active);
      expect(seam).not.toHaveBeenCalled();

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 4);
      expect(at().docking).toBe(DockingState.Recalled);
      expect(at().dockingHoldUntilMeasure).toBe(11);
      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'recalled']]);

      for (let m = 5; m <= 10; m++) tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
      expect(at().docking).toBe(DockingState.Recalled);
      expect(at().batteryLevel).toBeGreaterThan(BATTERY_CRITICAL_THRESHOLD);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 11);
      expect(at().docking).toBe(DockingState.Docked);
      expect(at().dockingHoldUntilMeasure).toBeUndefined();
      expect(at().batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      expect(seam.mock.calls).toEqual([
        [DEFAULT_LOCALE_ID, robot.id, 'recalled'],
        [DEFAULT_LOCALE_ID, robot.id, 'docked'],
      ]);
      // Alone home, it drew its entrance on the landing.
      expect(at().entersAtMeasure).toBeGreaterThan(11);
    });
  });

  describe('landOnActive', () => {
    it('sets docking to Active and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 5, job: undefined });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Active);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    // The dock mutes through the docking state itself (robotAudibility.isDockMuted); audioMode is the user's alone, so
    // a Solo, Mute or Highlight set on the robot survives the landing (Crawford, 2026-11-11).
    it.each(['solo', 'mute', 'highlight', 'none'] as const)('leaves the user\'s audioMode %s as it was', (audioMode) => {
      const robot = makeRobot({ docking: DockingState.Undocking, job: undefined, audioMode });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Active);
      expect(updated?.audioMode).toBe(audioMode);
    });

    it('does not touch AudioEngine voice/melody registration — those are set once at spawn and stay put', () => {
      const robot = makeRobot({ id: 'active-no-voice-touch', docking: DockingState.Undocking, job: undefined });
      setupLocaleWithRobots([robot]);
      // Deliberately NOT reserved/registered here — landOnActive must not be the thing that does it.
      expect(AudioEngine.getVoiceForRobot(robot.id)).toBeNull();

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(AudioEngine.getVoiceForRobot(robot.id)).toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual([]);
    });

    it('calls the seam with \'active\' once, after the Active write', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, job: undefined, audioMode: 'solo' });
      setupLocaleWithRobots([robot]);
      let atSeam: Robot | undefined;
      seam.mockImplementationOnce((_l: string, id: string) => {
        atSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id);
      });

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'active']]);
      expect(atSeam?.docking).toBe(DockingState.Active);
      expect(atSeam?.audioMode).toBe('solo');
    });

    it('writes no job itself — the job is the seam\'s (legacy adapter now, work loop in J2)', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, job: undefined });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.job).toBeUndefined();
    });

    it('is a silent no-op for a robot that is not in the locale — no seam call', () => {
      setupLocaleWithRobots([]);

      landOnActive(DEFAULT_LOCALE_ID, 'ghost');

      expect(seam).not.toHaveBeenCalled();
    });

    // Play until in the Station T9 (docs/specs/PLAY_UNTIL_IN_THE_STATION.md §1.2 step 5, §1.5): every Active landing
    // cancels the robot's station fade, so a robot exiting its station or turning back mid-fade sounds at its regular
    // volume. The cancel is a no-op with no fade live, so it is called unconditionally.
    describe('the station fade', () => {
      it('cancels the robot\'s fade once, with its id, before the seam', () => {
        const robot = makeRobot({ id: 'homebound', docking: DockingState.Undocking, job: undefined });
        setupLocaleWithRobots([robot]);
        const order: string[] = [];
        const cancel = vi.spyOn(AudioEngine, 'cancelStationFade').mockImplementation(() => { order.push('cancel'); });
        seam.mockImplementationOnce(() => { order.push('seam'); });
        try {
          landOnActive(DEFAULT_LOCALE_ID, robot.id);

          expect(cancel.mock.calls).toEqual([['homebound']]);
          expect(order).toEqual(['cancel', 'seam']);
        } finally {
          cancel.mockRestore();
        }
      });

      it('the tick\'s Active landing cancels the fade', () => {
        const robot = makeRobot({ id: 'exiting', docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, job: undefined });
        setupLocaleWithRobots([robot]);
        const cancel = vi.spyOn(AudioEngine, 'cancelStationFade');
        try {
          tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

          expect(cancel.mock.calls).toEqual([['exiting']]);
        } finally {
          cancel.mockRestore();
        }
      });

      it('a robot not in the locale cancels nothing', () => {
        setupLocaleWithRobots([]);
        const cancel = vi.spyOn(AudioEngine, 'cancelStationFade');
        try {
          landOnActive(DEFAULT_LOCALE_ID, 'ghost');

          expect(cancel).not.toHaveBeenCalled();
        } finally {
          cancel.mockRestore();
        }
      });
    });
  });

  describe('landOnDocked', () => {
    // Roadmap 92 Task 8 (docs/specs/MELODY_JOURNEY.md): docking pitch drift is gone, so a landing writes the
    // docking state only and leaves the melody, stored and registered, as it was.
    it('sets docking to Docked and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 5 });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    // The Docked state itself mutes the robot; a Solo set on it still lets it be heard (Crawford, 2026-11-11).
    it.each(['solo', 'mute', 'highlight', 'none'] as const)('leaves the user\'s audioMode %s as it was', (audioMode) => {
      const robot = makeRobot({ docking: DockingState.Recalled, audioMode });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.audioMode).toBe(audioMode);
    });

    it('does not release the voice or unregister the melody — a Solo set on a docked robot still lets it be heard', () => {
      const robot = makeRobot({ id: 'docked-voice-kept', docking: DockingState.Recalled });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      expect(AudioEngine.getVoiceForRobot(robot.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id).length).toBeGreaterThan(0);
    });

    it('keeps playing the click track through a dock cycle', () => {
      // Regression: landOnDocked once re-registered a melody with AudioEngine, which silently replaced
      // an active click-track override while the Ping Controls toggle kept showing it as on.
      const robot = makeRobot({ id: 'docked-click-track', docking: DockingState.Recalled, clickTrackActive: true });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      // The toggle itself is untouched by the dock cycle, and what's actually registered with
      // AudioEngine is still the click track, never the real melody.
      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.clickTrackActive).toBe(true);
      // In step order: the registry lists events by the order its steps were first used, not by step.
      const registered = [...AudioEngine.getRegisteredMelody(robot.id)].sort((a, b) => a.startStep - b.startStep);
      expect(registered).toEqual(buildClickTrackMelody(robot.octaveRange[0]));
    });

    it('calls the seam with \'docked\' once, after the Docked write', () => {
      const robot = makeRobot({ id: 'docked-seam', docking: DockingState.Recalled, audioMode: 'highlight' });
      setupLocaleWithRobots([robot]);
      let atSeam: Robot | undefined;
      seam.mockImplementationOnce((_l: string, id: string) => {
        atSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id);
      });

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'docked']]);
      expect(atSeam?.docking).toBe(DockingState.Docked);
      expect(atSeam?.audioMode).toBe('highlight');
      expect(atSeam?.melody).toBe(robot.melody);
    });

    it('writes no position or activity itself — the work loop owns both, through the seam', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, position: { x: 500, y: 500 }, activity: 'entering' });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.position).toEqual({ x: 500, y: 500 });
      expect(updated.activity).toBe('entering');
    });

    it('is a silent no-op for a robot that is not in the locale — no seam call', () => {
      setupLocaleWithRobots([]);

      landOnDocked(DEFAULT_LOCALE_ID, 'ghost-docked');

      expect(seam).not.toHaveBeenCalled();
    });

    // Play until in the Station T9 (§1.5): the Docked landing leaves the fade alone (the fade is the homebound robot's
    // way into the station); nor does the tick's Docked landing cancel one.
    it('never cancels a station fade, directly or from the tick', () => {
      const robot = makeRobot({ id: 'landing', docking: DockingState.Recalled, dockingHoldUntilMeasure: 10, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);
      const cancel = vi.spyOn(AudioEngine, 'cancelStationFade');
      try {
        landOnDocked(DEFAULT_LOCALE_ID, robot.id);
        setupLocaleWithRobots([robot]);
        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.docking).toBe(DockingState.Docked);
        expect(cancel).not.toHaveBeenCalled();
      } finally {
        cancel.mockRestore();
      }
    });
  });

  describe('JobType', () => {
    it('has six members — the four legacy profiles plus salvage and maintenance (Phase 43 Task 4)', () => {
      expect(Object.values(JobType).sort()).toEqual(
        ['acousticSurvey', 'fluidMonitoring', 'maintenance', 'salvage', 'structuralInspection', 'ventExtraction'],
      );
    });
  });

  describe('startRobotLifecycle / stopRobotLifecycle', () => {
    it('subscribes to measure ticks on start', () => {
      startRobotLifecycle(DEFAULT_LOCALE_ID);
      expect(subscribeToMeasure).toHaveBeenCalledTimes(1);
      stopRobotLifecycle();
    });

    it('is idempotent — a second start before stop does not subscribe again', () => {
      startRobotLifecycle(DEFAULT_LOCALE_ID);
      startRobotLifecycle(DEFAULT_LOCALE_ID);
      expect(subscribeToMeasure).toHaveBeenCalledTimes(1);
      stopRobotLifecycle();
    });

    it('unsubscribes on stop, and a repeated stop is a safe no-op', () => {
      const unsubscribe = vi.fn();
      (subscribeToMeasure as ReturnType<typeof vi.fn>).mockReturnValueOnce(unsubscribe);

      startRobotLifecycle(DEFAULT_LOCALE_ID);
      stopRobotLifecycle();
      expect(unsubscribe).toHaveBeenCalledTimes(1);

      stopRobotLifecycle(); // second stop — must not throw, must not call unsubscribe again
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('starting again after a stop subscribes a new listener', () => {
      startRobotLifecycle(DEFAULT_LOCALE_ID);
      stopRobotLifecycle();
      startRobotLifecycle(DEFAULT_LOCALE_ID);
      expect(subscribeToMeasure).toHaveBeenCalledTimes(2);
      stopRobotLifecycle();
    });

    it('drives the tick with getCurrentMeasure() (monotonic), whatever value subscribeToMeasure hands its callback', () => {
      // getCurrentMeasure() is the real, monotonic measure count that
      // dockingHoldUntilMeasure arithmetic needs. A wrapped count once stranded a
      // robot at the boundary (BeatClock used to wrap the callback argument at 96;
      // it no longer does). The tick must not depend on the argument either way:
      // here it is deliberately 0 while the true count is 1247.
      (getCurrentMeasure as ReturnType<typeof vi.fn>).mockReturnValueOnce(1247);

      // Re-aimed at an exit turn (roadmap 94 Task 21): at 60 BPM the lead is 6, so an exit turn of 1253 is due on 1247
      // and nowhere near on 0.
      useAudioStore.setState({ bpm: 60 });
      const robot = makeRobot({ exitsAtMeasure: 1253, shiftBpm: 60, job: undefined });
      // A second Active robot outside its group, so the robot due is recalled, not staying.
      setupLocaleWithRobots([robot, makeRobot({ id: 'robot-companion', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 60, job: undefined })]);

      startRobotLifecycle(DEFAULT_LOCALE_ID);
      const tickCallback = (subscribeToMeasure as ReturnType<typeof vi.fn>).mock.calls[0][0];
      tickCallback(0); // an argument that disagrees with the true count; the tick must ignore it

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      // Must be derived from getCurrentMeasure() (1247), not the callback argument (0): on 0 it would still be Active.
      expect(updated?.docking).toBe(DockingState.Recalled);
      expect(updated?.dockingHoldUntilMeasure).toBe(1254);

      stopRobotLifecycle();
    });
  });

  describe('stepRobotLifecycle (pure, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 3+4)', () => {
    function makeSnapshot(overrides: Partial<RobotLifecycleSnapshot> = {}): RobotLifecycleSnapshot {
      return {
        id: overrides.id ?? 'robot-1',
        docking: DockingState.Active,
        batteryLevel: 100,
        ...overrides,
      };
    }

    it('drains an Active robot by BATTERY_DRAIN_ACTIVE with no job assigned', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE);
    });

    it('drains every Active robot the same (the snapshot carries no job)', () => {
      const a = makeSnapshot({ id: 'a', batteryLevel: 80 });
      const b = makeSnapshot({ id: 'b', batteryLevel: 80 });
      const [ra, rb] = stepRobotLifecycle([a, b], 10);
      expect(ra.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
      expect(rb.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
    });

    it('floors battery at 0, never negative', () => {
      const snap = makeSnapshot({ batteryLevel: 1 });
      const [result] = stepRobotLifecycle([snap], 10);
      expect(result.batteryLevel).toBe(0);
    });

    describe('injectable drain (Phase 43 Tasks 2–3)', () => {
      it('activeDrain, the default, returns BATTERY_DRAIN_ACTIVE for any snapshot', () => {
        expect(activeDrain(makeSnapshot())).toBe(BATTERY_DRAIN_ACTIVE);
        expect(activeDrain(makeSnapshot({ batteryLevel: 3 }))).toBe(BATTERY_DRAIN_ACTIVE);
      });

      it('omitting drain is identical to passing activeDrain explicitly', () => {
        const roster = [
          makeSnapshot({ id: 'a', batteryLevel: 40 }),
          makeSnapshot({ id: 'b', batteryLevel: 13 }),
          makeSnapshot({ id: 'c', docking: DockingState.Docked, batteryLevel: 97 }),
        ];
        expect(stepRobotLifecycle(roster, 10)).toEqual(stepRobotLifecycle(roster, 10, activeDrain));
      });

      it('an Active robot drains by whatever the injected rule returns', () => {
        const snap = makeSnapshot({ batteryLevel: 80 });
        const [result] = stepRobotLifecycle([snap], 10, () => 3);
        expect(result.batteryLevel).toBe(77);
      });

      it('calls the rule only for Active robots, once each, with that robot\'s own snapshot', () => {
        // Record at call time — the step mutates its working copy after the rule returns.
        const seen: Array<{ id: string; batteryLevel: number }> = [];
        const drain = (s: RobotLifecycleSnapshot) => {
          seen.push({ id: s.id, batteryLevel: s.batteryLevel });
          return 6;
        };
        const active = makeSnapshot({ id: 'active', batteryLevel: 80 });
        const docked = makeSnapshot({ id: 'docked', docking: DockingState.Docked, batteryLevel: 50 });
        const held = makeSnapshot({ id: 'held', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
        stepRobotLifecycle([active, docked, held], 10, drain);
        expect(seen).toEqual([{ id: 'active', batteryLevel: 80 }]);
      });

      it('still floors at 0 when the rule drains more than the robot has', () => {
        const [result] = stepRobotLifecycle([makeSnapshot({ batteryLevel: 4 })], 10, () => 6);
        expect(result.batteryLevel).toBe(0);
      });

      it('a smaller drain reaches the critical threshold later — the rule drives recall timing, not just the number', () => {
        const robot = makeSnapshot({ id: 'r', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
        const companion = makeSnapshot({ id: 'companion', batteryLevel: 100 });
        const [byDefault] = stepRobotLifecycle([robot, companion], 10);
        const [lighter] = stepRobotLifecycle([robot, companion], 10, () => 2);
        expect(byDefault.docking).toBe(DockingState.Recalled);
        expect(lighter.docking).toBe(DockingState.Active);
      });
    });

    it('recharges a Docked robot by BATTERY_RECHARGE_RATE', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10);
      expect(result.batteryLevel).toBe(50 + BATTERY_RECHARGE_RATE);
    });

    it('caps recharge at 100, never above', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: 98 });
      const [result] = stepRobotLifecycle([snap], 10);
      expect(result.batteryLevel).toBe(100);
    });

    describe('battery size divides both rates (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3)', () => {
      it.each([0.85, 1.15, 1.25])('size %s drains an Active robot by BATTERY_DRAIN_ACTIVE / size', (size) => {
        const [result] = stepRobotLifecycle([makeSnapshot({ batteryLevel: 80, batterySize: size })], 10);
        expect(result.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE / size);
      });

      it.each([0.85, 1.15, 0.8])('size %s charges a Docked robot by BATTERY_RECHARGE_RATE / size', (size) => {
        const [result] = stepRobotLifecycle([makeSnapshot({ docking: DockingState.Docked, batteryLevel: 40, batterySize: size })], 10);
        expect(result.batteryLevel).toBe(40 + BATTERY_RECHARGE_RATE / size);
      });

      it('a snapshot with no size drains and charges at the flat rates', () => {
        const active = makeSnapshot({ id: 'active', batteryLevel: 80 });
        const docked = makeSnapshot({ id: 'docked', docking: DockingState.Docked, batteryLevel: 40 });
        expect('batterySize' in active).toBe(false);
        const [ra, rd] = stepRobotLifecycle([active, docked], 10);
        expect(ra.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
        expect(rd.batteryLevel).toBe(40 + BATTERY_RECHARGE_RATE);
      });

      it('an injected drain rule returns the base drain, and the size divides it too', () => {
        const [result] = stepRobotLifecycle([makeSnapshot({ batteryLevel: 80, batterySize: 1.25 })], 10, () => 3);
        expect(result.batteryLevel).toBe(80 - 3 / 1.25);
      });

      it('leaves the thresholds, the floor and the cap alone', () => {
        const [floored] = stepRobotLifecycle([makeSnapshot({ batteryLevel: 2, batterySize: 0.8 })], 10);
        expect(floored.batteryLevel).toBe(0);
        const [capped] = stepRobotLifecycle([makeSnapshot({ docking: DockingState.Docked, batteryLevel: 97, batterySize: 0.8 })], 10);
        expect(capped.batteryLevel).toBe(100);
        expect(capped.docking).toBe(DockingState.Undocking);
      });

      /** Steps one sized robot from a full battery through a shift and a charge, beside a companion re-fed at 100
       *  each measure so the recall is never the last Active robot's. Returns the Active measure it is recalled on
       *  and the Docked measure it starts Undocking on, counted from 1. */
      function shiftAndCharge(size: number): { recalledOn: number; undockingOn: number } {
        let robot = makeSnapshot({ id: 'sized', batteryLevel: 100, batterySize: size });
        const counts = { [DockingState.Active]: 0, [DockingState.Docked]: 0 } as Record<DockingState, number>;
        let recalledOn = 0;
        for (let measure = 1; measure <= 200; measure++) {
          const before = robot.docking;
          if (before === DockingState.Active || before === DockingState.Docked) counts[before] += 1;
          [robot] = stepRobotLifecycle([robot, makeSnapshot({ id: 'companion', batteryLevel: 100 })], measure);
          if (before === DockingState.Active && robot.docking === DockingState.Recalled) recalledOn = counts[DockingState.Active];
          if (before === DockingState.Docked && robot.docking === DockingState.Undocking) {
            return { recalledOn, undockingOn: counts[DockingState.Docked] };
          }
        }
        throw new Error(`size ${size} never finished a cycle`);
      }

      it('size 0.85 is recalled on its 13th Active measure and starts Undocking on its 16th Docked one', () => {
        expect(shiftAndCharge(0.85)).toEqual({ recalledOn: 13, undockingOn: 16 });
      });

      it('size 1.15 is recalled on its 18th Active measure and starts Undocking on its 22nd Docked one', () => {
        expect(shiftAndCharge(1.15)).toEqual({ recalledOn: 18, undockingOn: 22 });
      });

      it('size 1 keeps the flat cycle: recalled on its 15th Active measure, Undocking on its 18th Docked one', () => {
        expect(shiftAndCharge(1)).toEqual({ recalledOn: 15, undockingOn: 18 });
      });
    });

    it('an Active robot crossing the critical threshold begins Recalled with a hold, not immediate Docked', () => {
      const robot = makeSnapshot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
      // A healthy second Active robot, so the crossing is a recall and not a stay (no-silence Task 11).
      const [result] = stepRobotLifecycle([robot, makeSnapshot({ id: 'companion', batteryLevel: 100 })], 10);
      expect(result.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Recalled);
      expect(result.dockingHoldUntilMeasure).toBe(11);
    });

    // The last Active robot stays up (no-silence Task 12, docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.2, §4).
    describe('the last Active robot stays up (no-silence Task 12)', () => {
      const critical = (id: string) => makeSnapshot({ id, batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });

      it('the only Active robot at/under critical stays Active, no hold set (case 1)', () => {
        const dockedOther = makeSnapshot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 50 });
        const [result] = stepRobotLifecycle([critical('robot-only'), dockedOther], 10);
        expect(result.docking).toBe(DockingState.Active);
        expect(result.dockingHoldUntilMeasure).toBeUndefined();
        expect(result.batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      });

      it('a lone robot alone in the roster stays too, and drains on to the floor of 0 (cases 1 and 2)', () => {
        let roster = [makeSnapshot({ batteryLevel: 7, batterySize: 1.2 })]; // 5 a measure: 2, then 0, then 0
        const seen: number[] = [];
        for (let m = 10; m <= 12; m++) {
          roster = stepRobotLifecycle(roster, m);
          expect(roster[0].docking).toBe(DockingState.Active);
          seen.push(roster[0].batteryLevel);
        }
        expect(seen[0]).toBeCloseTo(2, 9);
        expect(seen.slice(1)).toEqual([0, 0]);
      });

      it('two robots at critical in one step with no third Active: the earlier departs, the later stays (case 4)', () => {
        const [resultA, resultB] = stepRobotLifecycle([critical('robot-a'), critical('robot-b')], 10);
        expect(resultA.docking).toBe(DockingState.Recalled);
        expect(resultB.docking).toBe(DockingState.Active);
        expect(resultB.dockingHoldUntilMeasure).toBeUndefined();
      });

      it('with a third robot Active, two robots at critical in one step both depart (case 4)', () => {
        const third = makeSnapshot({ id: 'robot-c', batteryLevel: 100 });
        const [resultA, resultB] = stepRobotLifecycle([critical('robot-a'), critical('robot-b'), third], 10);
        expect([resultA.docking, resultB.docking]).toEqual([DockingState.Recalled, DockingState.Recalled]);
      });

      it('beside only a Recalled robot, or only an Undocking one still in its hold, it stays (case 5)', () => {
        const recalled = makeSnapshot({ id: 'robot-recalled', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
        const undocking = makeSnapshot({ id: 'robot-undocking', docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 100 });
        expect(stepRobotLifecycle([critical('robot-x'), recalled], 10)[0].docking).toBe(DockingState.Active);
        expect(stepRobotLifecycle([recalled, critical('robot-x')], 10)[1].docking).toBe(DockingState.Active);
        expect(stepRobotLifecycle([critical('robot-x'), undocking], 10)[0].docking).toBe(DockingState.Active);
        expect(stepRobotLifecycle([undocking, critical('robot-x')], 10)[1].docking).toBe(DockingState.Active);
      });

      it('it is recalled in the step a robot earlier in the roster lands on Active, the next step when later (case 3)', () => {
        const lander = makeSnapshot({ id: 'robot-lander', docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, batteryLevel: 100 });
        const staying = makeSnapshot({ id: 'robot-staying', batteryLevel: 5 });

        const [landerFirst, stayingSecond] = stepRobotLifecycle([lander, staying], 10);
        expect([landerFirst.docking, stayingSecond.docking]).toEqual([DockingState.Active, DockingState.Recalled]);

        const afterOne = stepRobotLifecycle([staying, lander], 10);
        expect(afterOne.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Active]);
        const afterTwo = stepRobotLifecycle(afterOne, 11);
        expect(afterTwo[0].docking).toBe(DockingState.Recalled);
        expect(afterTwo[0].dockingHoldUntilMeasure).toBe(12);
      });
    });

    it('a Docked robot reaching full battery begins Undocking with a hold, not immediate Active', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE });
      const [result] = stepRobotLifecycle([snap], 20);
      expect(result.batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Undocking);
      expect(result.dockingHoldUntilMeasure).toBe(21);
    });

    it('an Undocking robot whose hold has elapsed lands on Active, and the replay picks no job (Phase 43: the job is live state)', () => {
      const snap = makeSnapshot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 100 });
      const [result] = stepRobotLifecycle([snap], 20);
      expect(result.docking).toBe(DockingState.Active);
      expect(result.dockingHoldUntilMeasure).toBeUndefined();
      expect('job' in result).toBe(false);
    });

    it('no transition ever adds a job, octaveRange, rhythmicDensity or rhythmicMotifLength to a snapshot', () => {
      const roster = [
        makeSnapshot({ id: 'landing-active', docking: DockingState.Undocking, dockingHoldUntilMeasure: 5, batteryLevel: 100 }),
        makeSnapshot({ id: 'landing-docked', docking: DockingState.Recalled, dockingHoldUntilMeasure: 5, batteryLevel: 5 }),
        makeSnapshot({ id: 'recalled-now', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE }),
        makeSnapshot({ id: 'undocking-now', docking: DockingState.Docked, batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE }),
      ];
      for (const result of stepRobotLifecycle(roster, 5)) {
        for (const field of ['job', 'octaveRange', 'rhythmicDensity', 'rhythmicMotifLength']) {
          expect(field in result).toBe(false);
        }
      }
    });

    it('a Recalled robot whose hold has elapsed lands on Docked, hold cleared', () => {
      const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [result] = stepRobotLifecycle([snap], 20);
      expect(result.docking).toBe(DockingState.Docked);
      expect(result.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('an Undocking/Recalled robot whose hold has NOT yet elapsed stays put', () => {
      const undocking = makeSnapshot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 50 });
      const recalled = makeSnapshot({ id: 'robot-2', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [resultUndocking, resultRecalled] = stepRobotLifecycle([undocking, recalled], 19);
      expect(resultUndocking.docking).toBe(DockingState.Undocking);
      expect(resultRecalled.docking).toBe(DockingState.Recalled);
    });

    it('is a pure function of its own arguments -- unaffected by whatever is in the live store', () => {
      // Deliberately leaves the store at its default (no robots matching this snapshot's id at
      // all) to prove stepRobotLifecycle reads nothing from useLocaleStore.
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE);
    });

    it('a landing transition never sets position/audioMode/state/destination/direction/melody -- RobotLifecycleSnapshot has no such fields to set', () => {
      const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [result] = stepRobotLifecycle([snap], 20);
      for (const field of ['position', 'audioMode', 'state', 'destination', 'direction', 'melody']) {
        expect(field in result).toBe(false);
      }
    });
  });

  // Roadmap 94 Task 22: replayLifecycle loops the shift step (it took a drain rule for today's step before).
  describe('replayLifecycle (pure; the shift step since roadmap 94 Task 22)', () => {
    const ENV: ShiftEnv = { bpm: 60, worldKey: '0:0' };
    function makeSnapshot(overrides: Partial<ShiftLifecycleSnapshot> = {}): ShiftLifecycleSnapshot {
      return {
        id: overrides.id ?? 'robot-1',
        docking: DockingState.Active,
        batteryLevel: 100,
        compositionSeed: 0.5,
        exitsAtMeasure: 30,
        shiftBpm: 60,
        ...overrides,
      };
    }
    const keeper = makeSnapshot({ id: 'keeper', compositionSeed: 0.9, exitsAtMeasure: 100_000 });

    it('toMeasure < fromMeasure + 1 is a no-op -- returns the roster unchanged', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      expect(replayLifecycle([snap], 10, 10, ENV)).toEqual([snap]);
      expect(replayLifecycle([snap], 10, 5, ENV)).toEqual([snap]);
    });

    it('replaying N measures matches calling stepShiftLifecycle N times in a hand-written loop', () => {
      const roster = [makeSnapshot({ batteryLevel: 50 }), keeper];
      let handRolled = roster;
      for (let m = 1; m <= 40; m++) handRolled = stepShiftLifecycle(handRolled, m, ENV);

      const replayed = replayLifecycle(roster, 0, 40, ENV);
      expect(replayed).toEqual(handRolled);
      // Not vacuous: the robot went in and came back with a plan.
      expect(replayed[0].docking).toBe(DockingState.Docked);
      expect(replayed[0].entersAtMeasure).toBeDefined();
    });

    it('replays measures fromMeasure+1 .. toMeasure inclusive, not fromMeasure itself', () => {
      // Due for recall from 24 on (exit 30, lead 6): replaying from 23 to 24 steps 24 alone and recalls it; from 22 to 23
      // steps 23 alone and does not.
      const roster = [makeSnapshot(), keeper];
      let handRolled = roster;
      for (let m = 24; m <= 28; m++) handRolled = stepShiftLifecycle(handRolled, m, ENV);
      expect(replayLifecycle(roster, 23, 28, ENV)).toEqual(handRolled);
      expect(replayLifecycle(roster, 23, 24, ENV)[0].docking).toBe(DockingState.Recalled);
      expect(replayLifecycle(roster, 22, 23, ENV)[0].docking).toBe(DockingState.Active);
    });

    it('imports neither useLocaleStore nor getCurrentMeasure -- unaffected by whatever is in the live store', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const roster = [makeSnapshot({ batteryLevel: 50 }), keeper];
      let handRolled = roster;
      for (let m = 1; m <= 3; m++) handRolled = stepShiftLifecycle(handRolled, m, ENV);
      expect(replayLifecycle(roster, 0, 3, ENV)).toEqual(handRolled);
      expect(getCurrentMeasure).not.toHaveBeenCalled();
    });

    it('hands its environment to every replayed step: the tempo and the world change the run', () => {
      const roster = [makeSnapshot({ exitsAtMeasure: 100 }), keeper];
      const fast = { bpm: 200, worldKey: '0:0' };
      let handRolled = roster;
      for (let m = 1; m <= 82; m++) handRolled = stepShiftLifecycle(handRolled, m, fast);
      const replayed = replayLifecycle(roster, 0, 82, fast);
      expect(replayed).toEqual(handRolled);
      expect(replayed).not.toEqual(replayLifecycle(roster, 0, 82, ENV));
    });
  });

  // The prove-it (roadmap 94 Task 22, spec §5.1): the live tick and the replay give the same roster, field for field,
  // the moves included, through a stay and its relief, a group exit and a drifting exit, each checked in the run.
  describe('prove-it: replay matches realtime on the shift step (roadmap 94 Task 22)', () => {
    it('N real ticks of a 12-robot roster with two companies and one replay converge, through all four events', () => {
      const BPM = 60;
      useAudioStore.setState({ bpm: BPM });
      const env: ShiftEnv = { bpm: BPM, worldKey: '0:0' };
      const turns = (companyId: string, from: number) =>
        journeyTurns(journeyKey('0:0', { kind: 'company', companyId }), from, from + 200).map((t) => t.measure);
      // Company A is the only group out, so it stays when it is due (exit tA, due tA - 6). Freelancer K lands four
      // measures later, the relief; A then leaves together on the first turn the lead allows. Company B comes out after
      // K, carrying exits on three successive turns of its journey: it drifts home. Everyone else stays home.
      const tA = turns('co-a', 12)[0];
      const relief = tA - 6 + 4;
      const [b0, b1, b2] = turns('co-b', relief + 30);
      const SIZES = [0.71, 1.12, 0.93, 1.31, 0.84, 1.07, 1.44, 0.68, 1.19, 0.97, 1.26, 0.79];
      // A's founder's size decides A's entrance window when A docks after its relief exit: pick one whose entrance a
      // size-1 robot would not draw, so a tick that dropped the size would part from the replay.
      const reliefExit = turns('co-a', relief + 1 + 7)[0];
      const aEntrance = (size: number) =>
        planEntrance({
          worldKey: '0:0',
          members: [0, 1, 2].map((i) => ({ id: `a${i}`, companyId: 'co-a', compositionSeed: (i + 1) / 17, ...(i === 0 ? { batterySize: size } : {}) })),
          from: reliefExit + 1,
          bpm: BPM,
        })[0];
      SIZES[0] = [1.5, 0.67, 1.4, 0.75, 1.3, 0.8].find((s) => aEntrance(s) !== aEntrance(1))!;
      expect(SIZES[0]).toBeDefined();
      const robots: Robot[] = [
        ...[0, 1, 2].map((i) => makeRobot({ id: `a${i}`, companyId: 'co-a', compositionSeed: (i + 1) / 17, exitsAtMeasure: tA, shiftBpm: BPM, batteryLevel: 100, batterySize: SIZES[i] })),
        makeRobot({ id: 'k', compositionSeed: 0.61, docking: DockingState.Undocking, dockingHoldUntilMeasure: relief, entersAtMeasure: relief, exitsAtMeasure: 100_000, shiftBpm: BPM, batteryLevel: 90, batterySize: SIZES[3] }),
        ...[0, 1, 2].map((i) =>
          makeRobot({ id: `b${i}`, companyId: 'co-b', compositionSeed: (i + 5) / 17, docking: DockingState.Docked, entersAtMeasure: relief + 3, exitsAtMeasure: [b0, b1, b2][i], shiftBpm: BPM, batteryLevel: 30 + i, batterySize: SIZES[4 + i] }),
        ),
        ...[0, 1, 2, 3, 4].map((i) => makeRobot({ id: `f${i}`, compositionSeed: (i + 10) / 17, docking: DockingState.Docked, entersAtMeasure: 5_000, shiftBpm: BPM, batteryLevel: 20 + i, batterySize: SIZES[7 + i] })),
      ];
      expect(robots).toHaveLength(MAX_ROBOTS);
      setupLocaleWithRobots(robots);
      const initial = robots.map(toLifecycleSnapshot);

      const N = b2 + 4;
      const timeline: Robot[][] = [];
      for (let m = 1; m <= N; m++) {
        tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
        timeline.push(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots);
      }
      const live = timeline[N - 1];
      const replayed = replayLifecycle(initial, 0, N, env);

      // Field for field, the moves and the battery included.
      expect(live.map(toLifecycleSnapshot)).toEqual(replayed);

      // The four events happened, read off the live run.
      const at = (m: number, id: string) => timeline[m - 1].find((r) => r.id === id)!;
      const dockedOn = (id: string) => {
        for (let m = 2; m <= N; m++) if (at(m - 1, id).docking === DockingState.Recalled && at(m, id).docking === DockingState.Docked) return m;
        return -1;
      };
      // The stay: A was due on tA - 6 and Active with no exit turn after it, all three.
      for (const id of ['a0', 'a1', 'a2']) {
        expect(at(tA - 6, id).docking).toBe(DockingState.Active);
        expect(at(tA - 6, id).exitsAtMeasure).toBeUndefined();
      }
      // Its relief: K landed on `relief`; it is later in the roster, so A took one new exit turn the tick after.
      expect(at(relief, 'k').docking).toBe(DockingState.Active);
      expect(at(relief, 'a0').exitsAtMeasure).toBeUndefined();
      const newExit = at(relief + 1, 'a0').exitsAtMeasure!;
      expect(newExit).toBeGreaterThan(relief + 1 + 6);
      expect(['a1', 'a2'].map((id) => at(relief + 1, id).exitsAtMeasure)).toEqual([newExit, newExit]);
      // A group exit: all three docked on one measure, the bar line after the new exit turn.
      expect(['a0', 'a1', 'a2'].map(dockedOn)).toEqual([newExit + 1, newExit + 1, newExit + 1]);
      expect(newExit).toBe(reliefExit);
      // Its entrance, drawn as it docked, on the founder's size.
      expect(at(newExit + 1, 'a0').entersAtMeasure).toBe(aEntrance(SIZES[0]));
      // A drifting exit: B's three docked on three measures, after their three turns.
      expect(['b0', 'b1', 'b2'].map(dockedOn)).toEqual([b0 + 1, b1 + 1, b2 + 1]);
    });
  });
});

// ========================================
// THE SHIFT STEP (roadmap 94, docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md §1.8 to §1.14)
// ========================================
describe('stepShiftLifecycle (roadmap 94)', () => {
  const ENV_60: ShiftEnv = { bpm: 60, worldKey: '0:0' };
  const ENV_200: ShiftEnv = { bpm: 200, worldKey: '0:0' };
  function shift(overrides: Partial<ShiftLifecycleSnapshot> = {}): ShiftLifecycleSnapshot {
    return {
      id: overrides.id ?? 'robot-1',
      docking: DockingState.Active,
      batteryLevel: 50,
      compositionSeed: 0.5,
      ...overrides,
    };
  }
  beforeEach(() => {
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    vi.clearAllMocks();
  });

  describe('the four transitions on robots that carry moves (Task 7, spec §1.8)', () => {
    // An outside robot is out on every case below, so the recall is the table row and not a stay.
    const outside = shift({ id: 'outside', exitsAtMeasure: 10_000, shiftBpm: 60 });
    const step2 = (r: ShiftLifecycleSnapshot, measure: number, env = ENV_60) => stepShiftLifecycle([r, outside], measure, env)[0];

    it('a Docked robot begins Undocking one measure before its entrance, holding until the entrance', () => {
      const r = shift({ docking: DockingState.Docked, entersAtMeasure: 40, shiftBpm: 60 });
      expect(step2(r, 38).docking).toBe(DockingState.Docked);
      const begun = step2(r, 39);
      expect(begun.docking).toBe(DockingState.Undocking);
      expect(begun.dockingHoldUntilMeasure).toBe(40);
    });

    it('an Undocking robot lands Active on its hold, the entrance, and its entrance is spent', () => {
      const r = shift({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 40, entersAtMeasure: 40, exitsAtMeasure: 70, shiftBpm: 60 });
      expect(step2(r, 39).docking).toBe(DockingState.Undocking);
      const landed = step2(r, 40);
      expect(landed.docking).toBe(DockingState.Active);
      expect(landed.dockingHoldUntilMeasure).toBeUndefined();
      expect(landed.entersAtMeasure).toBeUndefined();
    });

    it('an Active robot is Recalled the lead before its exit turn, holding until the bar line after the turn', () => {
      // 60 BPM: the lead is 6 measures.
      const r = shift({ exitsAtMeasure: 80, shiftBpm: 60 });
      expect(step2(r, 73).docking).toBe(DockingState.Active);
      const recalled = step2(r, 74);
      expect(recalled.docking).toBe(DockingState.Recalled);
      expect(recalled.dockingHoldUntilMeasure).toBe(81);
      expect(recalled.exitsAtMeasure).toBe(80);
    });

    it('the lead follows the tempo: the same exit turn recalls 6 measures ahead at 60 BPM and 20 at 200', () => {
      const r60 = shift({ exitsAtMeasure: 200, shiftBpm: 60 });
      expect(step2(r60, 193).docking).toBe(DockingState.Active);
      expect(step2(r60, 194).docking).toBe(DockingState.Recalled);
      const r200 = shift({ exitsAtMeasure: 200, shiftBpm: 200 });
      const outside200 = { ...outside, shiftBpm: 200 };
      expect(stepShiftLifecycle([r200, outside200], 179, ENV_200)[0].docking).toBe(DockingState.Active);
      const recalled = stepShiftLifecycle([r200, outside200], 180, ENV_200)[0];
      expect(recalled.docking).toBe(DockingState.Recalled);
      expect(recalled.dockingHoldUntilMeasure).toBe(201);
    });

    it('a Recalled robot lands Docked on its hold', () => {
      const r = shift({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 81, exitsAtMeasure: 80, shiftBpm: 60 });
      expect(step2(r, 80).docking).toBe(DockingState.Recalled);
      const landed = step2(r, 81);
      expect(landed.docking).toBe(DockingState.Docked);
      expect(landed.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('fires each transition once: a robot moves one state a tick', () => {
      // Due to undock long ago: it begins Undocking this tick and lands on the next bar line, never in one tick.
      const late = shift({ docking: DockingState.Docked, entersAtMeasure: 10, shiftBpm: 60 });
      const begun = step2(late, 50);
      expect(begun.docking).toBe(DockingState.Undocking);
      expect(begun.dockingHoldUntilMeasure).toBe(51);
      // Due to recall long ago: Recalled now, Docked on the next bar line.
      const overdue = step2(shift({ exitsAtMeasure: 10, shiftBpm: 60 }), 50);
      expect(overdue.docking).toBe(DockingState.Recalled);
      expect(overdue.dockingHoldUntilMeasure).toBe(51);
    });

    it('does not mutate the roster it is handed', () => {
      const roster = [
        shift({ id: 'a', docking: DockingState.Docked, entersAtMeasure: 5, shiftBpm: 60 }),
        shift({ id: 'b', exitsAtMeasure: 10, shiftBpm: 60 }),
        shift({ id: 'c', docking: DockingState.Recalled, dockingHoldUntilMeasure: 4 }),
        outside,
      ];
      const copy = structuredClone(roster);
      stepShiftLifecycle(roster, 4, ENV_60);
      expect(roster).toEqual(copy);
    });

    it('the exit draw (Task 8) leaves a robot that already carries an exit alone', () => {
      const r = shift({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 40, exitsAtMeasure: 70, shiftBpm: 60 });
      expect(step2(r, 40).exitsAtMeasure).toBe(70);
    });

    it('reads no store and no clock: the live store and the beat clock leave it unchanged', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'x', batteryLevel: 1 })] } } });
      const r = shift({ exitsAtMeasure: 80, shiftBpm: 60 });
      const result = step2(r, 74);
      expect(result.docking).toBe(DockingState.Recalled);
      expect(getCurrentMeasure).not.toHaveBeenCalled();
    });
  });

  describe("the exit is drawn when a group's first member lands Active (Task 8, spec §1.6)", () => {
    const member = (id: string, companyId: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, companyId, compositionSeed: id.length / 16, batterySize: 1, ...o });
    const undocking = (id: string, companyId: string, hold: number, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      member(id, companyId, { docking: DockingState.Undocking, dockingHoldUntilMeasure: hold, entersAtMeasure: hold, shiftBpm: 60, ...o });
    const asPlan = (r: ShiftLifecycleSnapshot) => ({ id: r.id, companyId: r.companyId, compositionSeed: r.compositionSeed, batterySize: r.batterySize });

    it('a company landing together gets the exit turns planExit gives for the same inputs, on that tick', () => {
      for (const worldKey of ['0:0', '4:-2', '-9:13']) {
        const env = { bpm: 60, worldKey };
        const roster = [undocking('a', 'co-x', 40, { batterySize: 1.3 }), undocking('bb', 'co-x', 40), undocking('ccc', 'co-x', 40)];
        const after = stepShiftLifecycle(roster, 40, env);
        const want = planExit({ worldKey, members: roster.map(asPlan), from: 40, bpm: 60 });
        expect(after.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Active, DockingState.Active]);
        expect(after.map((r) => r.exitsAtMeasure)).toEqual(want);
        expect(after.every((r) => r.shiftBpm === 60)).toBe(true);
      }
    });

    it('draws nothing on the tick before the landing', () => {
      const after = stepShiftLifecycle([undocking('a', 'co-x', 40), undocking('bb', 'co-x', 40)], 39, ENV_60);
      expect(after.map((r) => r.exitsAtMeasure)).toEqual([undefined, undefined]);
    });

    it("a staggered company's later members get the exit with the first, and land on it without a second draw", () => {
      // A world where an exit drawn from measure 42 would differ from one drawn from 40, so a second draw shows.
      const worldKey = ['0:0', '1:0', '2:0', '3:0', '4:0', '5:0', '6:0'].find((k) => {
        const m = [asPlan(member('a', 'co-s')), asPlan(member('bb', 'co-s')), asPlan(member('ccc', 'co-s'))];
        return JSON.stringify(planExit({ worldKey: k, members: m, from: 40, bpm: 60 })) !== JSON.stringify(planExit({ worldKey: k, members: m, from: 42, bpm: 60 }));
      })!;
      const env = { bpm: 60, worldKey };
      let roster: ShiftLifecycleSnapshot[] = [
        undocking('a', 'co-s', 40),
        member('bb', 'co-s', { docking: DockingState.Docked, entersAtMeasure: 42, shiftBpm: 60 }),
        member('ccc', 'co-s', { docking: DockingState.Docked, entersAtMeasure: 44, shiftBpm: 60 }),
      ];
      const want = planExit({ worldKey, members: roster.map(asPlan), from: 40, bpm: 60 });
      roster = stepShiftLifecycle(roster, 40, env);
      expect(roster.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Docked, DockingState.Docked]);
      expect(roster.map((r) => r.exitsAtMeasure)).toEqual(want);
      for (let m = 41; m <= 44; m++) roster = stepShiftLifecycle(roster, m, env);
      expect(roster.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Active, DockingState.Active]);
      expect(roster.map((r) => r.exitsAtMeasure)).toEqual(want);
    });

    it("a freelancer landing draws on the fleet turns with its own draws; another company's exit is not its own", () => {
      const env = { bpm: 100, worldKey: '3:7' };
      const free = shift({ id: 'free', compositionSeed: 0.3125, docking: DockingState.Undocking, dockingHoldUntilMeasure: 12, shiftBpm: 100 });
      const busy = member('m1', 'co-busy', { exitsAtMeasure: 400, shiftBpm: 100 });
      const [landed] = stepShiftLifecycle([free, busy], 12, env);
      const want = planExit({ worldKey: '3:7', members: [asPlan(free)], from: 12, bpm: 100 });
      expect(landed.exitsAtMeasure).toBe(want[0]);
      expect(journeyTurns(journeyKey('3:7', { kind: 'fleet' }), want[0], want[0])).toHaveLength(1);
      // Two freelancers landing together draw for themselves.
      const other = { ...free, id: 'free-2', compositionSeed: 0.6875 };
      const both = stepShiftLifecycle([free, other], 12, env);
      expect(both[1].exitsAtMeasure).toBe(planExit({ worldKey: '3:7', members: [asPlan(other)], from: 12, bpm: 100 })[0]);
    });

    it('a member landing while a mate carries an exit draws nothing', () => {
      const roster = [member('a', 'co-y', { exitsAtMeasure: 90, shiftBpm: 60 }), undocking('bb', 'co-y', 50, { exitsAtMeasure: 96 })];
      const after = stepShiftLifecycle(roster, 50, ENV_60);
      expect(after.map((r) => r.exitsAtMeasure)).toEqual([90, 96]);
    });
  });

  describe("the entrance is drawn when a group's last member lands Docked (Task 9, spec §1.7)", () => {
    const member = (id: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, companyId: 'co-d', compositionSeed: id.length / 16, batterySize: 1, shiftBpm: 60, ...o });
    const asPlan = (r: ShiftLifecycleSnapshot) => ({ id: r.id, companyId: r.companyId, compositionSeed: r.compositionSeed, batterySize: r.batterySize });
    /** A freelancer out for good, so a recall is never a stay. */
    const keeper = shift({ id: 'keeper', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 60 });

    it("a drifting company's first members to dock get no entrance until the last docks; then all get theirs on that tick", () => {
      // Three successive turns of the company's journey, as a drifting exit gives them.
      const [t0, t1, t2] = journeyTurns(journeyKey('0:0', { kind: 'company', companyId: 'co-d' }), 50, 120).map((t) => t.measure);
      let roster: ShiftLifecycleSnapshot[] = [
        member('a', { exitsAtMeasure: t0 }),
        member('bb', { exitsAtMeasure: t1 }),
        member('ccc', { exitsAtMeasure: t2 }),
        keeper,
      ];
      const plan = roster.slice(0, 3).map(asPlan);
      for (let m = 40; m <= t2; m++) {
        roster = stepShiftLifecycle(roster, m, ENV_60);
        expect(roster.slice(0, 3).every((r) => r.entersAtMeasure === undefined), `measure ${m}`).toBe(true);
      }
      expect(roster.slice(0, 3).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked, DockingState.Recalled]);
      roster = stepShiftLifecycle(roster, t2 + 1, ENV_60);
      expect(roster.slice(0, 3).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked, DockingState.Docked]);
      expect(roster.slice(0, 3).map((r) => r.entersAtMeasure)).toEqual(planEntrance({ worldKey: '0:0', members: plan, from: t2 + 1, bpm: 60 }));
      expect(roster.slice(0, 3).map((r) => r.exitsAtMeasure)).toEqual([undefined, undefined, undefined]);
      expect(roster.slice(0, 3).every((r) => r.shiftBpm === 60)).toBe(true);
      // The keeper is another group: its exit is untouched.
      expect(roster[3].exitsAtMeasure).toBe(100_000);
    });

    it('a member docking while a mate is still Recalled draws nothing: a Recalled robot is still out', () => {
      let roster: ShiftLifecycleSnapshot[] = [
        member('a', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 30, exitsAtMeasure: 29 }),
        member('bb', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 33, exitsAtMeasure: 32 }),
        keeper,
      ];
      roster = stepShiftLifecycle(roster, 30, ENV_60);
      expect(roster[0].docking).toBe(DockingState.Docked);
      expect(roster.slice(0, 2).map((r) => r.entersAtMeasure)).toEqual([undefined, undefined]);
      for (let m = 31; m <= 33; m++) roster = stepShiftLifecycle(roster, m, ENV_60);
      const want = planEntrance({ worldKey: '0:0', members: roster.slice(0, 2).map(asPlan), from: 33, bpm: 60 });
      expect(roster.slice(0, 2).map((r) => r.entersAtMeasure)).toEqual(want);
    });

    it('two members docking on one measure draw once, from the later in the roster', () => {
      let roster: ShiftLifecycleSnapshot[] = [
        member('a', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 30, exitsAtMeasure: 29 }),
        member('bb', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 30, exitsAtMeasure: 29 }),
        keeper,
      ];
      roster = stepShiftLifecycle(roster, 30, ENV_60);
      const want = planEntrance({ worldKey: '0:0', members: roster.slice(0, 2).map(asPlan), from: 30, bpm: 60 });
      expect(roster.slice(0, 2).map((r) => r.entersAtMeasure)).toEqual(want);
    });

    it('a straggler still Undocking when its mates dock keeps the group exit, goes in on it, and the entrance waits for it', () => {
      // Mates a and bb go in on exit 29's bar line (30); ccc, the last of a stagger, is still Undocking until 31 and
      // carries the group's exit, drawn when a landed. 60 BPM: the lead is 6.
      let roster: ShiftLifecycleSnapshot[] = [
        member('a', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 30, exitsAtMeasure: 29 }),
        member('bb', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 30, exitsAtMeasure: 29 }),
        member('ccc', { docking: DockingState.Undocking, dockingHoldUntilMeasure: 31, entersAtMeasure: 31, exitsAtMeasure: 29 }),
        keeper,
      ];
      roster = stepShiftLifecycle(roster, 30, ENV_60);
      expect(roster.slice(0, 2).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked]);
      // ccc is not home yet: no entrance for anyone, and its exit stands.
      expect(roster.slice(0, 3).map((r) => r.entersAtMeasure)).toEqual([undefined, undefined, 31]);
      expect(roster[2].exitsAtMeasure).toBe(29);
      roster = stepShiftLifecycle(roster, 31, ENV_60);
      expect(roster[2].docking).toBe(DockingState.Active);
      expect(roster.slice(0, 3).map((r) => r.exitsAtMeasure)).toEqual([29, 29, 29]); // spent, and no second draw
      expect(roster.slice(0, 2).map((r) => r.entersAtMeasure)).toEqual([undefined, undefined]);
      // Its exit is past: recalled on the next tick, in on the bar line after.
      roster = stepShiftLifecycle(roster, 32, ENV_60);
      expect(roster[2].docking).toBe(DockingState.Recalled);
      expect(roster[2].dockingHoldUntilMeasure).toBe(33);
      roster = stepShiftLifecycle(roster, 33, ENV_60);
      expect(roster.slice(0, 3).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked, DockingState.Docked]);
      // Then one entrance draw for all three, from the measure the last went in.
      const want = planEntrance({ worldKey: '0:0', members: roster.slice(0, 3).map(asPlan), from: 33, bpm: 60 });
      expect(roster.slice(0, 3).map((r) => r.entersAtMeasure)).toEqual(want);
    });

    it('a whole shift runs from hand-set starting moves through exit, entrance and the next exit, nothing set by hand after', () => {
      for (const env of [ENV_60, { bpm: 140, worldKey: '-4:4' }]) {
        let roster: ShiftLifecycleSnapshot[] = [
          member('a', { docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, entersAtMeasure: 10, shiftBpm: env.bpm }),
          member('bb', { docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, entersAtMeasure: 10, shiftBpm: env.bpm }),
          { ...keeper, shiftBpm: env.bpm },
        ];
        const seen: string[] = [];
        let last = '';
        for (let m = 10; m <= 600 && seen.length < 12; m++) {
          roster = stepShiftLifecycle(roster, m, env);
          const now = roster.slice(0, 2).map((r) => r.docking).join(',');
          if (now !== last) seen.push(now);
          last = now;
        }
        // Out, recalled, home, undocking, out again: every docking of both members came from the plan.
        expect(seen).toContain([DockingState.Active, DockingState.Active].join(','));
        expect(seen.some((s) => s.includes(DockingState.Recalled))).toBe(true);
        expect(seen).toContain([DockingState.Docked, DockingState.Docked].join(','));
        expect(seen.some((s) => s.includes(DockingState.Undocking))).toBe(true);
        expect(seen.filter((s) => s === [DockingState.Active, DockingState.Active].join(',')).length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('the stay: a group is recalled only while a robot outside it is Active (Task 10, spec §1.9)', () => {
    const co = (id: string, companyId: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, companyId, compositionSeed: id.length / 16, shiftBpm: 60, ...o });
    const home = (id: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, compositionSeed: 0.75, docking: DockingState.Docked, entersAtMeasure: 5_000, shiftBpm: 60, ...o });
    /** The first turn of `companyId`'s journey whose recall is after `measure`, at 60 BPM's lead of 6. */
    const firstTurnAfter = (companyId: string, measure: number, lead = 6) =>
      journeyTurns(journeyKey('0:0', { kind: 'company', companyId }), measure + lead + 1, measure + lead + 40)[0].measure;

    /** Two successive turns of `companyId`'s journey from `from`, as a drifting exit gives them. */
    const twoTurns = (companyId: string, from: number) =>
      journeyTurns(journeyKey('0:0', { kind: 'company', companyId }), from, from + 60).slice(0, 2).map((t) => t.measure);

    it('a lone group due for recall stays whole: no member is recalled, and every member loses its exit turn', () => {
      const [t0, t1] = twoTurns('co-1', 50);
      const roster = [co('a', 'co-1', { exitsAtMeasure: t0 }), home('h1'), co('bb', 'co-1', { exitsAtMeasure: t1 })];
      const after = stepShiftLifecycle(roster, t0 - 6, ENV_60);
      expect(after.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Docked, DockingState.Active]);
      expect(after[0].exitsAtMeasure).toBeUndefined();
      expect(after[2].exitsAtMeasure).toBeUndefined();
      // Staying, it is never recalled while alone.
      let r = after;
      for (let m = t0 - 5; m <= 200; m++) {
        r = stepShiftLifecycle(r, m, ENV_60);
        expect(r[0].docking).toBe(DockingState.Active);
        expect(r[2].docking).toBe(DockingState.Active);
      }
    });

    it('relief landing earlier in the roster gives the staying group its new exit the same tick, one turn for all', () => {
      const roster = [
        shift({ id: 'relief', compositionSeed: 0.1, docking: DockingState.Undocking, dockingHoldUntilMeasure: 70, shiftBpm: 60 }),
        co('a', 'co-1'),
        co('bb', 'co-1'),
      ];
      const after = stepShiftLifecycle(roster, 70, ENV_60);
      expect(after[0].docking).toBe(DockingState.Active);
      const t = firstTurnAfter('co-1', 70);
      expect(after[1].exitsAtMeasure).toBe(t);
      expect(after[2].exitsAtMeasure).toBe(t);
      expect(after[1].shiftBpm).toBe(60);
      expect(after.slice(1).every((r) => r.docking === DockingState.Active)).toBe(true);
    });

    it('relief landing between two members in the roster gives both one turn on that tick', () => {
      const roster = [
        co('a', 'co-1'),
        shift({ id: 'relief', compositionSeed: 0.1, docking: DockingState.Undocking, dockingHoldUntilMeasure: 70, shiftBpm: 60 }),
        co('bb', 'co-1'),
      ];
      const after = stepShiftLifecycle(roster, 70, ENV_60);
      const t = firstTurnAfter('co-1', 70);
      expect(after[0].exitsAtMeasure).toBe(t);
      expect(after[2].exitsAtMeasure).toBe(t);
    });

    it('relief landing later in the roster gives it the next tick', () => {
      const roster = [
        co('a', 'co-1'),
        co('bb', 'co-1'),
        shift({ id: 'relief', compositionSeed: 0.1, docking: DockingState.Undocking, dockingHoldUntilMeasure: 70, shiftBpm: 60 }),
      ];
      const first = stepShiftLifecycle(roster, 70, ENV_60);
      expect(first[2].docking).toBe(DockingState.Active);
      expect(first[0].exitsAtMeasure).toBeUndefined();
      const second = stepShiftLifecycle(first, 71, ENV_60);
      const t = firstTurnAfter('co-1', 71);
      expect(second[0].exitsAtMeasure).toBe(t);
      expect(second[1].exitsAtMeasure).toBe(t);
    });

    it('two groups due on one measure with no third: the earlier in the roster is recalled whole, the later stays whole', () => {
      // Interleaved, so a robot-by-robot rule would split both groups.
      const roster = [
        co('a1', 'co-a', { exitsAtMeasure: 50 }),
        co('b1', 'co-b', { exitsAtMeasure: 50 }),
        co('a2', 'co-a', { exitsAtMeasure: 50 }),
        co('b2', 'co-b', { exitsAtMeasure: 50 }),
      ];
      const after = stepShiftLifecycle(roster, 44, ENV_60);
      expect(after.map((r) => r.docking)).toEqual([DockingState.Recalled, DockingState.Active, DockingState.Recalled, DockingState.Active]);
      expect(after.map((r) => r.dockingHoldUntilMeasure)).toEqual([51, undefined, 51, undefined]);
      expect(after[1].exitsAtMeasure).toBeUndefined();
      expect(after[3].exitsAtMeasure).toBeUndefined();
    });

    it('a drifting group: the due member is recalled with the members due with it, and the rest keep their turns', () => {
      const [t0, t1] = twoTurns('co-d', 50);
      const roster = [co('a', 'co-d', { exitsAtMeasure: t0 }), co('bb', 'co-d', { exitsAtMeasure: t1 }), shift({ id: 'other', compositionSeed: 0.2, exitsAtMeasure: 900 })];
      const after = stepShiftLifecycle(roster, t0 - 6, ENV_60);
      expect(after.map((r) => r.docking)).toEqual([DockingState.Recalled, DockingState.Active, DockingState.Active]);
      expect(after[1].exitsAtMeasure).toBe(t1);
    });

    it('a group beside only a Recalled robot stays', () => {
      const roster = [
        shift({ id: 'going', compositionSeed: 0.2, docking: DockingState.Recalled, dockingHoldUntilMeasure: 60, exitsAtMeasure: 59 }),
        co('a', 'co-1', { exitsAtMeasure: 50 }),
      ];
      const after = stepShiftLifecycle(roster, 44, ENV_60);
      expect(after[1].docking).toBe(DockingState.Active);
      expect(after[1].exitsAtMeasure).toBeUndefined();
    });

    it('over hand-built worlds stepped 500 measures, the Active count never reaches zero', () => {
      for (const env of [ENV_60, { bpm: 20, worldKey: '9:-9' }, { bpm: 200, worldKey: '-3:12' }, { bpm: 97, worldKey: '1:1' }]) {
        let roster: ShiftLifecycleSnapshot[] = [
          co('a1', 'co-a', { exitsAtMeasure: 30, shiftBpm: env.bpm, batterySize: 0.7 }),
          co('a2', 'co-a', { exitsAtMeasure: 30, shiftBpm: env.bpm }),
          co('b1', 'co-b', { docking: DockingState.Docked, entersAtMeasure: 20, shiftBpm: env.bpm, batterySize: 1.4 }),
          co('b2', 'co-b', { docking: DockingState.Docked, entersAtMeasure: 22, shiftBpm: env.bpm }),
          co('b3', 'co-b', { docking: DockingState.Docked, entersAtMeasure: 24, shiftBpm: env.bpm }),
          shift({ id: 'f1', compositionSeed: 0.3, docking: DockingState.Docked, entersAtMeasure: 9, shiftBpm: env.bpm }),
          shift({ id: 'f2', compositionSeed: 0.6, docking: DockingState.Docked, entersAtMeasure: 40, shiftBpm: env.bpm }),
        ];
        let moves = 0;
        for (let m = 1; m <= 500; m++) {
          const before = roster.map((r) => r.docking).join();
          roster = stepShiftLifecycle(roster, m, env);
          if (roster.map((r) => r.docking).join() !== before) moves++;
          expect(roster.filter((r) => r.docking === DockingState.Active).length, `${env.worldKey} m${m}`).toBeGreaterThan(0);
        }
        expect(moves).toBeGreaterThan(10);
      }
    });
  });

  describe('the battery is a gauge (Task 11, spec §1.10)', () => {
    const keeper = shift({ id: 'keeper', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: 60, batteryLevel: 100 });
    /** Steps `roster` from `from` to `to`, recording each robot's docking before each step and level after it. */
    const run = (roster: ShiftLifecycleSnapshot[], from: number, to: number, env = ENV_60) => {
      const rows: { measure: number; before: DockingState[]; after: ShiftLifecycleSnapshot[] }[] = [];
      let r = roster;
      for (let m = from; m <= to; m++) {
        const before = r.map((x) => x.docking);
        r = stepShiftLifecycle(r, m, env);
        rows.push({ measure: m, before, after: r });
      }
      return rows;
    };

    it('lands exactly on 10 on the bar line after the exit turn, and is above it before', () => {
      const rows = run([shift({ id: 'a', compositionSeed: 0.2, exitsAtMeasure: 50, shiftBpm: 60, batteryLevel: 100 }), keeper], 1, 51);
      expect(rows.find((x) => x.measure === 51)!.after[0].batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      expect(rows.find((x) => x.measure === 50)!.after[0].batteryLevel).toBeGreaterThan(BATTERY_CRITICAL_THRESHOLD);
      expect(rows.find((x) => x.measure === 51)!.after[0].docking).toBe(DockingState.Docked);
    });

    it('lands exactly on 100 on the entrance', () => {
      const rows = run([shift({ id: 'a', compositionSeed: 0.2, docking: DockingState.Docked, entersAtMeasure: 30, shiftBpm: 60, batteryLevel: 12 }), keeper], 1, 30);
      expect(rows.find((x) => x.measure === 30)!.after[0].batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(rows.find((x) => x.measure === 29)!.after[0].batteryLevel).toBeLessThan(BATTERY_FULL_THRESHOLD);
      expect(rows.find((x) => x.measure === 30)!.after[0].docking).toBe(DockingState.Active);
    });

    it('falls on every measure a robot is out, Recalled included, and rises on every measure it is home, Undocking included', () => {
      for (const env of [ENV_60, { bpm: 30, worldKey: '2:5' }, { bpm: 180, worldKey: '-7:1' }]) {
        const roster = [
          shift({ id: 'a1', companyId: 'co-g', compositionSeed: 0.1, docking: DockingState.Undocking, dockingHoldUntilMeasure: 3, entersAtMeasure: 3, shiftBpm: env.bpm, batteryLevel: 97 }),
          shift({ id: 'a2', companyId: 'co-g', compositionSeed: 0.2, docking: DockingState.Docked, entersAtMeasure: 5, shiftBpm: env.bpm, batteryLevel: 60 }),
          shift({ id: 'b1', companyId: 'co-h', compositionSeed: 0.3, exitsAtMeasure: 40, shiftBpm: env.bpm, batteryLevel: 80 }),
          shift({ id: 'f1', compositionSeed: 0.4, docking: DockingState.Docked, entersAtMeasure: 20, shiftBpm: env.bpm, batteryLevel: 30 }),
        ];
        const seen = new Set<DockingState>();
        let prev = roster.map((x) => x.batteryLevel);
        for (const row of run(roster, 1, 600, env)) {
          row.after.forEach((r, i) => {
            const out = row.before[i] === DockingState.Active || row.before[i] === DockingState.Recalled;
            seen.add(row.before[i]);
            if (out) expect(r.batteryLevel, `${r.id} m${row.measure} ${row.before[i]}`).toBeLessThan(prev[i]);
            else expect(r.batteryLevel, `${r.id} m${row.measure} ${row.before[i]}`).toBeGreaterThan(prev[i]);
            expect(r.batteryLevel).toBeGreaterThan(0);
            expect(r.batteryLevel).toBeLessThanOrEqual(100);
          });
          prev = row.after.map((x) => x.batteryLevel);
        }
        expect(seen.size).toBe(4);
      }
    });

    it('in a stay the level keeps falling and never reaches 0', () => {
      const rows = run([shift({ id: 'alone', companyId: 'co-s', compositionSeed: 0.2, exitsAtMeasure: 20, shiftBpm: 60, batteryLevel: 100 })], 1, 400);
      let prev = 100;
      for (const row of rows) {
        expect(row.after[0].docking).toBe(DockingState.Active);
        expect(row.after[0].batteryLevel).toBeLessThan(prev);
        expect(row.after[0].batteryLevel).toBeGreaterThan(0);
        prev = row.after[0].batteryLevel;
      }
      // It eased: an eighth of what was left each measure, once it stayed.
      const late = rows[rows.length - 1].after[0].batteryLevel;
      const before = rows[rows.length - 2].after[0].batteryLevel;
      expect(late).toBeCloseTo(before * (1 - BATTERY_EASE_SHARE), 12);
    });

    it('a home robot with no entrance (its company still out) gains an eighth of what is missing each measure', () => {
      const r = shift({ id: 'h', companyId: 'co-e', compositionSeed: 0.2, docking: DockingState.Docked, batteryLevel: 20 });
      const mate = shift({ id: 'm', companyId: 'co-e', compositionSeed: 0.3, exitsAtMeasure: 100_000, shiftBpm: 60 });
      const after = stepShiftLifecycle([r, mate, keeper], 9, ENV_60)[0];
      expect(after.entersAtMeasure).toBeUndefined();
      expect(after.batteryLevel).toBeCloseTo(20 + 80 * BATTERY_EASE_SHARE, 12);
    });
  });

  describe('a tempo change rescales the moves (Task 12, spec §1.12)', () => {
    const WORLD = '6:-6';
    const companyKey = journeyKey(WORLD, { kind: 'company', companyId: 'co-t' });
    const turnFrom = (m: number) => journeyTurns(companyKey, m, m + 40)[0].measure;
    const member = (id: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, companyId: 'co-t', compositionSeed: id.length / 16, shiftBpm: 60, ...o });
    const keeper = (bpm: number) => shift({ id: 'keeper', compositionSeed: 0.9, exitsAtMeasure: 100_000, shiftBpm: bpm, batteryLevel: 100 });

    it('a company planned at 60 BPM and stepped at 200 keeps one exit turn, on a turn, further off; nothing changes state on the tick', () => {
      const exit = turnFrom(130);
      const roster = [member('a', { exitsAtMeasure: exit }), member('bb', { exitsAtMeasure: exit }), keeper(60)];
      const after = stepShiftLifecycle(roster, 100, { bpm: 200, worldKey: WORLD });
      expect(after.map((r) => r.docking)).toEqual(roster.map((r) => r.docking));
      expect(after[0].exitsAtMeasure).toBe(after[1].exitsAtMeasure);
      const moved = after[0].exitsAtMeasure!;
      expect(moved).toBe(rescaleMove({ worldKey: WORLD, robot: { companyId: 'co-t' }, move: exit, measure: 100, fromBpm: 60, toBpm: 200, least: 21 }));
      expect(moved - 100).toBeGreaterThan(exit - 100);
      expect(journeyTurns(companyKey, moved, moved)).toHaveLength(1);
      expect(after.every((r) => r.shiftBpm === 200)).toBe(true);
    });

    it('never recalls on the tick of the change, even when the new lead reaches past the old exit turn', () => {
      // 20 BPM, lead 2: an exit 3 measures off. At 200 the lead is 20.
      const exit = turnFrom(53);
      const r = member('a', { exitsAtMeasure: exit, shiftBpm: 20 });
      const [after] = stepShiftLifecycle([r, keeper(20)], exit - 3, { bpm: 200, worldKey: WORLD });
      expect(after.docking).toBe(DockingState.Active);
      expect(after.exitsAtMeasure! - 20).toBeGreaterThan(exit - 3);
    });

    it('never recalls on the tick of the change when the rescaled turn would fall exactly the lead away', () => {
      // 200 -> 20 BPM: 10 bars to go become 1, so the least the lead allows decides. At 20 BPM the lead is 2, and a
      // turn sits exactly 2 measures off: it would be due now, so the next turn is taken.
      const t = turnFrom(70);
      const measure = t - 2;
      const r = member('a', { exitsAtMeasure: measure + 10, shiftBpm: 200 });
      const [after] = stepShiftLifecycle([r, keeper(200)], measure, { bpm: 20, worldKey: WORLD });
      expect(after.docking).toBe(DockingState.Active);
      expect(after.exitsAtMeasure).toBeGreaterThan(t);
    });

    it('a Docked robot does not begin Undocking on the tick of the change, and its entrance lands on a turn', () => {
      const enter = turnFrom(60);
      for (const toGo of [2, 30]) {
        const r = member('a', { docking: DockingState.Docked, entersAtMeasure: enter, shiftBpm: 200, batteryLevel: 50 });
        const [after] = stepShiftLifecycle([r, keeper(200)], enter - toGo, { bpm: 20, worldKey: WORLD });
        expect(after.docking).toBe(DockingState.Docked);
        expect(after.entersAtMeasure).toBe(
          rescaleMove({ worldKey: WORLD, robot: { companyId: 'co-t' }, move: enter, measure: enter - toGo, fromBpm: 200, toBpm: 20, least: 2 }),
        );
        expect(after.entersAtMeasure! - (enter - toGo)).toBeGreaterThanOrEqual(2);
        expect(journeyTurns(companyKey, after.entersAtMeasure!, after.entersAtMeasure!)).toHaveLength(1);
        expect(after.shiftBpm).toBe(20);
      }
    });

    it('a Recalled or Undocking robot keeps its hold, and a Recalled one its exit turn', () => {
      const recalled = member('a', { docking: DockingState.Recalled, dockingHoldUntilMeasure: 90, exitsAtMeasure: 89 });
      const undocking = member('bb', { docking: DockingState.Undocking, dockingHoldUntilMeasure: 88, entersAtMeasure: 88 });
      const after = stepShiftLifecycle([recalled, undocking, keeper(60)], 85, { bpm: 170, worldKey: WORLD });
      expect(after[0].dockingHoldUntilMeasure).toBe(90);
      expect(after[0].exitsAtMeasure).toBe(89);
      expect(after[1].dockingHoldUntilMeasure).toBe(88);
      expect(after[1].entersAtMeasure).toBe(88);
    });

    it('equal tempos leave the moves alone, on a turn or not', () => {
      const r = member('a', { exitsAtMeasure: 333 });
      expect(stepShiftLifecycle([r, keeper(60)], 100, { bpm: 60, worldKey: WORLD })[0].exitsAtMeasure).toBe(333);
    });

    it('the gauge reaches its target on the rescaled measure, with no jump on the tick of the change', () => {
      const exit = turnFrom(140);
      let roster = [member('a', { exitsAtMeasure: exit, batteryLevel: 100 }), keeper(60)];
      const levels: number[] = [100];
      for (let m = 100; m <= 109; m++) {
        roster = stepShiftLifecycle(roster, m, { bpm: 60, worldKey: WORLD });
        levels.push(roster[0].batteryLevel);
      }
      const before = levels[levels.length - 2] - levels[levels.length - 1];
      roster = stepShiftLifecycle(roster, 110, { bpm: 200, worldKey: WORLD });
      const moved = roster[0].exitsAtMeasure!;
      expect(moved).toBeGreaterThan(exit);
      const atChange = levels[levels.length - 1] - roster[0].batteryLevel;
      // Still falling, by no more than it fell the measure before: the line bends, it does not jump.
      expect(atChange).toBeGreaterThan(0);
      expect(atChange).toBeLessThanOrEqual(before);
      for (let m = 111; m <= moved + 1; m++) roster = stepShiftLifecycle(roster, m, { bpm: 200, worldKey: WORLD });
      expect(roster[0].batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      expect(roster[0].docking).toBe(DockingState.Docked);
    });
  });

  describe("a robot out of step takes its group's move (Task 13, spec §1.14)", () => {
    const WORLD = '2:2';
    const env = { bpm: 60, worldKey: WORLD };
    const keyOf = (companyId?: string) => journeyKey(WORLD, companyId ? { kind: 'company', companyId } : { kind: 'fleet' });
    const isTurn = (companyId: string | undefined, m: number) => journeyTurns(keyOf(companyId), m, m).length === 1;
    const bare = (id: string, docking: DockingState, companyId?: string, o: Partial<ShiftLifecycleSnapshot> = {}) =>
      shift({ id, docking, companyId, compositionSeed: (id.charCodeAt(0) % 16) / 16, batteryLevel: 60, ...o });

    it('a hand-built Active robot with no fields is recalled on a turn once another group is out, and docks', () => {
      let roster = [bare('x', DockingState.Active), bare('y', DockingState.Active, 'co-y', { exitsAtMeasure: 100_000, shiftBpm: 60 })];
      const docking: DockingState[] = [];
      let recalledAt = -1;
      for (let m = 1; m <= 80; m++) {
        const before = roster[0].docking;
        roster = stepShiftLifecycle(roster, m, env);
        if (before === DockingState.Active && roster[0].docking === DockingState.Recalled) recalledAt = m;
        docking.push(roster[0].docking);
      }
      expect(recalledAt).toBeGreaterThan(0);
      // Recalled the lead (6) before a turn of the fleet journey, and Docked on the bar line after it.
      expect(isTurn(undefined, recalledAt + 6)).toBe(true);
      expect(docking).toContain(DockingState.Docked);
    });

    it('an Active robot alone with no fields stays while nobody else is out, and is never left out once someone is', () => {
      let roster = [bare('x', DockingState.Active), bare('y', DockingState.Docked, 'co-y', { entersAtMeasure: 50, shiftBpm: 60 })];
      for (let m = 1; m <= 48; m++) {
        roster = stepShiftLifecycle(roster, m, env);
        expect(roster[0].docking).toBe(DockingState.Active);
        expect(roster[0].exitsAtMeasure).toBeUndefined();
      }
      let docked = false;
      for (let m = 49; m <= 200; m++) {
        roster = stepShiftLifecycle(roster, m, env);
        if (roster[0].docking === DockingState.Docked) docked = true;
      }
      expect(docked).toBe(true);
    });

    it("an Active member with no exit turn takes a mate's it can still make, and is recalled with it", () => {
      const turn = journeyTurns(keyOf('co-m'), 40, 60)[0].measure;
      const roster = [
        bare('a', DockingState.Active, 'co-m', { exitsAtMeasure: turn, shiftBpm: 60 }),
        bare('b', DockingState.Active, 'co-m'),
        bare('k', DockingState.Active, undefined, { exitsAtMeasure: 100_000, shiftBpm: 60 }),
      ];
      const after = stepShiftLifecycle(roster, 10, env);
      expect(after[1].exitsAtMeasure).toBe(turn);
      expect(after[1].shiftBpm).toBe(60);
      let r = after;
      for (let m = 11; m <= turn - 6; m++) r = stepShiftLifecycle(r, m, env);
      expect(r.slice(0, 2).map((x) => x.docking)).toEqual([DockingState.Recalled, DockingState.Recalled]);
    });

    it("a mate's turn it can no longer make is not taken", () => {
      const turn = journeyTurns(keyOf('co-m'), 40, 60)[0].measure;
      const roster = [
        bare('a', DockingState.Recalled, 'co-m', { dockingHoldUntilMeasure: turn + 1, exitsAtMeasure: turn, shiftBpm: 60 }),
        bare('b', DockingState.Active, 'co-m'),
        bare('k', DockingState.Active, undefined, { exitsAtMeasure: 100_000, shiftBpm: 60 }),
      ];
      const [, b] = stepShiftLifecycle(roster, turn - 3, env);
      expect(b.exitsAtMeasure).not.toBe(turn);
      expect(b.exitsAtMeasure! - 6).toBeGreaterThan(turn - 3);
    });

    it('a robot moved into a company that is out, while it is home, stays home and comes out at the company next entrance', () => {
      const exit = journeyTurns(keyOf('co-o'), 30, 50)[0].measure;
      let roster = [
        bare('a', DockingState.Active, 'co-o', { exitsAtMeasure: exit, shiftBpm: 60 }),
        bare('b', DockingState.Active, 'co-o', { exitsAtMeasure: exit, shiftBpm: 60 }),
        // Moved in from elsewhere: home, with the entrance of its old group, which comes before the company is back.
        bare('n', DockingState.Docked, 'co-o', { entersAtMeasure: 20, shiftBpm: 60 }),
        bare('k', DockingState.Active, undefined, { exitsAtMeasure: 100_000, shiftBpm: 60 }),
      ];
      roster = stepShiftLifecycle(roster, 10, env);
      expect(roster[2].entersAtMeasure).toBeUndefined();
      let companyIn = -1;
      for (let m = 11; m <= 400 && companyIn < 0; m++) {
        roster = stepShiftLifecycle(roster, m, env);
        if (m <= exit + 1) expect(roster[2].docking, `m${m}`).toBe(DockingState.Docked);
        if (roster[0].entersAtMeasure !== undefined && companyIn < 0 && roster[0].docking === DockingState.Docked) {
          companyIn = m;
          // All three share the draw, the newcomer included.
          expect(roster[2].entersAtMeasure).toBeDefined();
        }
      }
      expect(companyIn).toBe(exit + 1);
      const want = planEntrance({ worldKey: WORLD, members: roster.slice(0, 3), from: exit + 1, bpm: 60 });
      // Drawn on the tick the last member docked, for all three (members as handed to the plan, in roster order).
      expect([roster[0].entersAtMeasure, roster[1].entersAtMeasure, roster[2].entersAtMeasure]).toEqual(want);
    });

    it('a Docked robot with no entrance takes a home mate entrance; with its whole group home and none, the entrance is drawn now', () => {
      const roster = [
        bare('a', DockingState.Docked, 'co-h', { entersAtMeasure: 77, shiftBpm: 60 }),
        bare('b', DockingState.Docked, 'co-h'),
        bare('c', DockingState.Docked, 'co-g'),
        bare('d', DockingState.Docked, 'co-g'),
        bare('k', DockingState.Active, undefined, { exitsAtMeasure: 100_000, shiftBpm: 60 }),
      ];
      const after = stepShiftLifecycle(roster, 5, env);
      expect(after[1].entersAtMeasure).toBe(77);
      const want = planEntrance({ worldKey: WORLD, members: roster.slice(2, 4), from: 5, bpm: 60 });
      expect([after[2].entersAtMeasure, after[3].entersAtMeasure]).toEqual(want);
      expect(after[2].shiftBpm).toBe(60);
    });

    it('a Docked robot with no entrance waits while its group is out', () => {
      const roster = [
        bare('a', DockingState.Active, 'co-w', { exitsAtMeasure: 100_000, shiftBpm: 60 }),
        bare('b', DockingState.Docked, 'co-w'),
      ];
      const after = stepShiftLifecycle(roster, 5, env);
      expect(after[1].entersAtMeasure).toBeUndefined();
      expect(after[1].docking).toBe(DockingState.Docked);
    });

    it('an Active robot whose exit turn no mate shares and is no turn of its new group journey takes the group move', () => {
      const exit = journeyTurns(keyOf('co-n'), 60, 80)[0].measure;
      // Find a measure that is not a turn of co-n's journey for the newcomer's old exit.
      let stale = 70;
      while (isTurn('co-n', stale)) stale++;
      const roster = [
        bare('a', DockingState.Active, 'co-n', { exitsAtMeasure: exit, shiftBpm: 60 }),
        bare('n', DockingState.Active, 'co-n', { exitsAtMeasure: stale, shiftBpm: 60 }),
        bare('k', DockingState.Active, undefined, { exitsAtMeasure: 100_000, shiftBpm: 60 }),
      ];
      const after = stepShiftLifecycle(roster, 10, env);
      expect(after[1].exitsAtMeasure).toBe(exit);
      // A drifting member on a turn of its own journey keeps its own.
      const later = journeyTurns(keyOf('co-n'), exit + 1, exit + 40)[0].measure;
      const drifting = stepShiftLifecycle([roster[0], { ...roster[1], exitsAtMeasure: later }, roster[2]], 10, env);
      expect(drifting[1].exitsAtMeasure).toBe(later);
    });

    it('twelve robots with no fields at all each carry a move within one home window, and the Active count is never zero', () => {
      for (const e of [env, { bpm: 200, worldKey: '-5:5' }, { bpm: 20, worldKey: '8:1' }]) {
        const companies = ['co-1', 'co-1', 'co-1', 'co-2', 'co-2', undefined, 'co-3', 'co-3', 'co-3', 'co-3', undefined, undefined];
        let roster = companies.map((c, i) =>
          shift({ id: `r${i}`, companyId: c, compositionSeed: (i + 1) / 13, docking: i < 3 ? DockingState.Active : DockingState.Docked, batteryLevel: 50 }),
        );
        const window = 2 + Math.max(...[0.67, 1, 1.5].map((s) => shiftWindow('home', s, e.bpm).most));
        let allCarry = -1;
        for (let m = 1; m <= 2 * window; m++) {
          roster = stepShiftLifecycle(roster, m, e);
          expect(roster.some((r) => r.docking === DockingState.Active), `${e.worldKey} m${m}`).toBe(true);
          const carries = roster.every((r) => r.exitsAtMeasure !== undefined || r.entersAtMeasure !== undefined || r.dockingHoldUntilMeasure !== undefined);
          if (carries && allCarry < 0) allCarry = m;
        }
        expect(allCarry).toBeGreaterThan(0);
        expect(allCarry).toBeLessThanOrEqual(window);
      }
    });
  });
});
