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
} from './robotSystems';
import type { RobotLifecycleSnapshot, ShiftLifecycleSnapshot } from './robotSystems';
import { planEntrance, planExit, type ShiftEnv } from './shiftPlan';
import { journeyKey, journeyTurns } from '../engine/melodyJourney';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
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
      [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots },
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

  describe('tickRobotLifecycle — battery drain (Active)', () => {
    it('drains by BATTERY_DRAIN_ACTIVE with no job assigned', () => {
      const robot = makeRobot({ batteryLevel: 50, job: undefined });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE);
    });

    it('BATTERY_DRAIN_ACTIVE is the flat 6 the Phase 43 drain sim picked', () => {
      expect(BATTERY_DRAIN_ACTIVE).toBe(6);
    });

    it('the battery-size band is Gate A\'s pick, 0.67-1.5 (Crawford, 2026-11-11)', () => {
      expect([BATTERY_SIZE_MIN, BATTERY_SIZE_MAX]).toEqual([0.67, 1.5]);
    });

    it.each(Object.values(JobType))('drains the same flat BATTERY_DRAIN_ACTIVE for job type %s — the job no longer costs battery', (jobType) => {
      const robot = makeRobot({ batteryLevel: 80, job: jobType });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
    });

    it('a mixed roster with every job drains every Active robot by the same amount in one tick', () => {
      const robots = Object.values(JobType).map((type, i) => makeRobot({ id: `mixed-${i}`, batteryLevel: 70, job: type }));
      setupLocaleWithRobots([...robots, makeRobot({ id: 'mixed-none', batteryLevel: 70, job: undefined })]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const levels = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots.map((r) => r.batteryLevel);
      expect(new Set(levels)).toEqual(new Set([70 - BATTERY_DRAIN_ACTIVE]));
    });

    it('floors battery at 0, never negative', () => {
      const robot = makeRobot({ batteryLevel: 1, job: JobType.FluidMonitoring });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(0);
    });

    it('drains a robot by its own battery size (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3, case 12)', () => {
      const robot = makeRobot({ batteryLevel: 50, batterySize: 1.25 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE / 1.25);
    });
  });

  describe('tickRobotLifecycle — battery recharge (Docked)', () => {
    it('charges a robot by its own battery size (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3, case 12)', () => {
      const robot = makeRobot({ docking: DockingState.Docked, batteryLevel: 50, batterySize: 0.8 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(50 + BATTERY_RECHARGE_RATE / 0.8);
    });

    it('recharges by BATTERY_RECHARGE_RATE', () => {
      const robot = makeRobot({ docking: DockingState.Docked, batteryLevel: 50 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(50 + BATTERY_RECHARGE_RATE);
    });

    it('caps recharge at 100, never above', () => {
      const robot = makeRobot({ docking: DockingState.Docked, batteryLevel: 98 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(100);
    });
  });

  describe('tickRobotLifecycle — threshold-triggered transitions', () => {
    // A healthy second Active robot (no-silence Task 11): a robot crossing critical is recalled only while another
    // robot is Active, so every case about a recall keeps one beside it. At 100 it drains without a transition.
    const activeCompanion = () => makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });

    it('Active robot crossing the critical threshold begins Recalled with a hold, not immediate Docked', () => {
      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, // will land exactly at critical after drain
        job: undefined,
      });
      setupLocaleWithRobots([robot, activeCompanion()]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Recalled);
      expect(updated?.dockingHoldUntilMeasure).toBe(11);
    });

    it('calls the seam with \'recalled\' the instant a robot is Recalled — once, for that robot only, after the Recalled write', () => {
      const robot = makeRobot({
        position: { x: 960, y: 540 },
        activity: 'working',
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      setupLocaleWithRobots([robot, activeCompanion()]);
      let dockingAtSeam: DockingState | undefined;
      seam.mockImplementationOnce((_l: string, id: string) => {
        dockingAtSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id)?.docking;
      });

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      expect(seam).toHaveBeenCalledTimes(1);
      expect(seam).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, robot.id, 'recalled');
      expect(dockingAtSeam).toBe(DockingState.Recalled);
    });

    it('beginRecall writes no visual state itself — no position or activity (the seam tells the loop)', () => {
      const robot = makeRobot({
        position: { x: 960, y: 540 },
        activity: 'working',
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      setupLocaleWithRobots([robot, activeCompanion()]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.docking).toBe(DockingState.Recalled); // the recall happened, so the case is about beginRecall
      expect(updated.position).toEqual(robot.position);
      expect(updated.activity).toBe(robot.activity);
    });

    it('Docked robot reaching full battery begins Undocking with a hold, not immediate Active', () => {
      const robot = makeRobot({
        docking: DockingState.Docked,
        batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE,
      });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 20);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Undocking);
      expect(updated?.dockingHoldUntilMeasure).toBe(21);
      // Undocking is a hold only — nothing visual happens until the robot lands on Active.
      expect(seam).not.toHaveBeenCalled();
    });

    it('a Recalled robot does not drain further while held', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 15, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(5);
    });

    // The last Active robot stays up (no-silence Task 12, docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.2): a robot
    // at or below critical is recalled only while another robot is Active. Case numbers are the spec's §5.1.
    describe('the last Active robot stays up (no-silence Task 12)', () => {
      const docking = (id: string) => useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id)?.docking;
      const battery = (id: string) => useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id)?.batteryLevel;

      it('the sole Active robot at critical stays Active: no hold set, no recall at the seam (case 1)', () => {
        const robot = makeRobot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
        const dockedCompanion = makeRobot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 40 });
        setupLocaleWithRobots([robot, dockedCompanion]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
        expect(updated?.docking).toBe(DockingState.Active);
        expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
        expect(updated?.batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
        expect(seam).not.toHaveBeenCalled();
      });

      it('while it stays it drains every measure and floors at 0, still Active (case 2)', () => {
        const robot = makeRobot({ batteryLevel: BATTERY_DRAIN_ACTIVE + 4, job: undefined }); // 10, then 4, then 0, 0
        setupLocaleWithRobots([robot]);
        const seen: Array<[DockingState | undefined, number | undefined]> = [];

        for (let m = 10; m <= 12; m++) {
          tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
          seen.push([docking(robot.id), battery(robot.id)]);
        }

        expect(seen).toEqual([[DockingState.Active, 4], [DockingState.Active, 0], [DockingState.Active, 0]]);
        expect(seam).not.toHaveBeenCalled();
      });

      it('it is recalled the same tick a robot earlier in the roster lands on Active (case 3)', () => {
        const lander = makeRobot({ id: 'robot-lander', docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, batteryLevel: 100 });
        const staying = makeRobot({ id: 'robot-staying', batteryLevel: 5, job: undefined });
        setupLocaleWithRobots([lander, staying]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(docking(lander.id)).toBe(DockingState.Active);
        expect(docking(staying.id)).toBe(DockingState.Recalled);
        expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, lander.id, 'active'], [DEFAULT_LOCALE_ID, staying.id, 'recalled']]);
      });

      it('it is recalled the next tick when the robot landing on Active is later in the roster (case 3)', () => {
        const staying = makeRobot({ id: 'robot-staying', batteryLevel: 5, job: undefined });
        const lander = makeRobot({ id: 'robot-lander', docking: DockingState.Undocking, dockingHoldUntilMeasure: 10, batteryLevel: 100 });
        setupLocaleWithRobots([staying, lander]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);
        expect([docking(staying.id), docking(lander.id)]).toEqual([DockingState.Active, DockingState.Active]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 11);
        expect(docking(staying.id)).toBe(DockingState.Recalled);
        expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, staying.id)?.dockingHoldUntilMeasure).toBe(12);
      });

      it('two robots crossing critical in one tick with no third Active: the earlier departs, the later stays (case 4)', () => {
        const robotA = makeRobot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
        const robotB = makeRobot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
        setupLocaleWithRobots([robotA, robotB]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect([docking(robotA.id), docking(robotB.id)]).toEqual([DockingState.Recalled, DockingState.Active]);
        expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robotA.id, 'recalled']]);
      });

      it('with a third robot Active, two robots crossing critical together both depart (case 4)', () => {
        const robotA = makeRobot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
        const robotB = makeRobot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
        setupLocaleWithRobots([robotA, robotB, activeCompanion()]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect([docking(robotA.id), docking(robotB.id)]).toEqual([DockingState.Recalled, DockingState.Recalled]);
      });

      it('a muted last robot still stays — the rule reads docking, not audioMode (case 6)', () => {
        const robot = makeRobot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined, audioMode: 'mute' });
        setupLocaleWithRobots([robot, makeRobot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 40 })]);

        tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

        expect(docking(robot.id)).toBe(DockingState.Active);
        expect(seam).not.toHaveBeenCalled();
      });
    });
  });

  describe('tickRobotLifecycle — hold-elapsed landing', () => {
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
      const companion = makeRobot({ id: 'companion', batteryLevel: 100 });
      const home = robot.melody.map((e) => ({ ...e }));
      setupLocaleWithRobots([robot, companion]);
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');
      try {
        let docked = 0;
        for (let measure = 1; measure <= 80 && docked < 2; measure++) {
          const before = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!.docking;
          // Keep the companion up so the robot is always free to go (the last robot stays up).
          useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, companion.id, { batteryLevel: 100 });
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

  describe('tickRobotLifecycle — multi-measure integration (Task 6 refactor regression guard)', () => {
    it('drives a full Active -> Recalled -> Docked cycle across several real ticks with expected battery values at each step', () => {
      // BATTERY_DRAIN_ACTIVE=6 per measure (see constants), so 3 ticks from 28 lands exactly on
      // BATTERY_CRITICAL_THRESHOLD=10: 28 -> 22 -> 16 -> 10 (critical, departs).
      const robot = makeRobot({ id: 'integration-robot', batteryLevel: 28, job: undefined });
      const companion = makeRobot({ id: 'integration-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 1);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.batteryLevel).toBe(22);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.docking).toBe(DockingState.Active);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 2);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.batteryLevel).toBe(16);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.docking).toBe(DockingState.Active);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 3);
      const afterCritical = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(afterCritical?.batteryLevel).toBe(10);
      expect(afterCritical?.docking).toBe(DockingState.Recalled);
      expect(afterCritical?.dockingHoldUntilMeasure).toBe(4);
      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'recalled']]);

      // Hold elapses at measure 4 -> lands on Docked.
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 4);
      const afterDocked = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(afterDocked.docking).toBe(DockingState.Docked);
      expect(afterDocked.dockingHoldUntilMeasure).toBeUndefined();
      expect(seam.mock.calls).toEqual([
        [DEFAULT_LOCALE_ID, robot.id, 'recalled'],
        [DEFAULT_LOCALE_ID, robot.id, 'docked'],
      ]);

      // The companion, meanwhile, only ever drained -- 4 ticks * 6 = 24 -- never touched by any
      // of the landing effects above.
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, companion.id)?.batteryLevel).toBe(76);
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

      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      // A healthy second Active robot, so the robot crossing critical is recalled (no-silence Task 11).
      setupLocaleWithRobots([robot, makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined })]);

      startRobotLifecycle(DEFAULT_LOCALE_ID);
      const tickCallback = (subscribeToMeasure as ReturnType<typeof vi.fn>).mock.calls[0][0];
      tickCallback(0); // an argument that disagrees with the true count; the tick must ignore it

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Recalled);
      // Must be derived from getCurrentMeasure() (1247 + 1), not the
      // callback argument (0 + 1 = 1) — the old bug would produce 1 here.
      expect(updated?.dockingHoldUntilMeasure).toBe(1248);

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

  describe('replayLifecycle (pure, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 5)', () => {
    function makeSnapshot(overrides: Partial<RobotLifecycleSnapshot> = {}): RobotLifecycleSnapshot {
      return {
        id: overrides.id ?? 'robot-1',
        docking: DockingState.Active,
        batteryLevel: 100,
        ...overrides,
      };
    }

    it('toMeasure < fromMeasure + 1 is a no-op -- returns the roster unchanged', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const result = replayLifecycle([snap], 10, 10);
      expect(result).toEqual([snap]);

      const resultBackwards = replayLifecycle([snap], 10, 5);
      expect(resultBackwards).toEqual([snap]);
    });

    it('replaying N measures matches calling stepRobotLifecycle N times in a hand-written loop', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });

      let handRolled = [snap];
      for (let m = 1; m <= 5; m++) handRolled = stepRobotLifecycle(handRolled, m);

      const replayed = replayLifecycle([snap], 0, 5);
      expect(replayed).toEqual(handRolled);
    });

    it('replays measures fromMeasure+1 .. toMeasure inclusive, not fromMeasure itself', () => {
      // Starting exactly at the critical threshold: if measure `10` (fromMeasure) were replayed,
      // one extra drain would apply that shouldn't. Replaying only 11..15 (5 steps) should match
      // 5 hand-rolled steps starting from measure 11.
      const snap = makeSnapshot({ batteryLevel: 90 });
      let handRolled = [snap];
      for (let m = 11; m <= 15; m++) handRolled = stepRobotLifecycle(handRolled, m);

      const replayed = replayLifecycle([snap], 10, 15);
      expect(replayed).toEqual(handRolled);
    });

    it('imports neither useLocaleStore nor getCurrentMeasure -- unaffected by whatever is in the live store', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = replayLifecycle([snap], 0, 3);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE * 3);
    });

    it('forwards an injected drain to every replayed step (Phase 43 Task 2)', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const flat3 = () => 3;
      let handRolled = [snap];
      for (let m = 1; m <= 4; m++) handRolled = stepRobotLifecycle(handRolled, m, flat3);

      const replayed = replayLifecycle([snap], 0, 4, flat3);
      expect(replayed).toEqual(handRolled);
      expect(replayed[0].batteryLevel).toBe(50 - 3 * 4);
    });
  });

  describe('prove-it: replay matches realtime (docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 7)', () => {
    it('N real ticks and one replayLifecycle call converge on identical docking/batteryLevel/dockingHoldUntilMeasure for all 12 robots, exercising a stay, its relief and a docking', () => {
      // Contrived starting state, not left to chance: robot 0 is the ONLY Active robot.
      // Robot 1 is already Recalled, still holding the
      // job it was assigned before it was recalled (the real landOnDocked path never clears
      // job -- see docs/ROBOT_LIFECYCLE.md), with its hold elapsing on the very first tick --
      // guarantees both a docking AND a non-undefined job survive the landing
      // within the test's window, so an undefined-vs-undefined job comparison can't hide a
      // regression here again. Robots 3-11 are Docked, mid-battery, far from any threshold, so
      // they contribute realistic "nothing special happens" noise without triggering their own
      // transitions and complicating what's being proven.
      // The run holds a stay (no-silence Task 12): robot 0, the only Active robot, crosses critical on
      // the first tick and stays up, draining on to the 0 floor, until robot 2 (Undocking, hold 3,
      // later in the roster) lands on Active on tick 3; robot 0 is recalled on tick 4 and lands on
      // Docked on tick 5.
      // Robots 0 and 2 hold a job (Phase 43 Task 3): the replay snapshot no longer carries one, so a job
      // surcharge creeping back into the live tick would make a real battery diverge from replay.
      // Robot 2 drains for two ticks after landing without ever flooring at 0 -- a floor would let a
      // surcharged live run and the flat replay converge on 0 and hide the surcharge (found by Task 3's
      // mutation check); robot 0's own drain ends on the floor, so robot 2 is the unfloored one.
      // Every robot has its own battery size, all different and none 1 (no-silence Task 6), so a live
      // tick that ignores the size, or a store that truncates the fractions it makes, diverges from the
      // replay; parity cannot pass on the default. Robot 0's size 1.2 drains it 5 a measure: 9, 4, 0.
      // The Docked robots charge 4-6 a measure from 41-49, so after five ticks every one is above its
      // start and below the 100 cap.
      const REPLAY_MEASURES = 5;
      const SIZES = [1.2, 0.85, 0.82, 0.88, 0.91, 0.97, 1.03, 1.07, 1.11, 1.16, 1.21, 1.24];
      const robots: Robot[] = [
        makeRobot({
          id: 'prove-it-0',
          docking: DockingState.Active,
          batteryLevel: 14,
          batterySize: SIZES[0],
          job: JobType.FluidMonitoring,
        }),
        makeRobot({
          id: 'prove-it-1',
          docking: DockingState.Recalled,
          dockingHoldUntilMeasure: 1,
          batteryLevel: 5,
          batterySize: SIZES[1],
          job: JobType.AcousticSurvey,
        }),
        makeRobot({
          id: 'prove-it-2',
          docking: DockingState.Undocking,
          dockingHoldUntilMeasure: 3,
          batteryLevel: 100,
          batterySize: SIZES[2],
          job: JobType.FluidMonitoring,
        }),
        ...Array.from({ length: MAX_ROBOTS - 3 }, (_, i) =>
          makeRobot({ id: `prove-it-${i + 3}`, docking: DockingState.Docked, batteryLevel: 41 + i, batterySize: SIZES[i + 3], job: undefined }),
        ),
      ];
      expect(robots).toHaveLength(MAX_ROBOTS);

      // Assert the preconditions actually hold before running anything -- not left to chance.
      expect(robots.filter((r) => r.docking === DockingState.Active)).toHaveLength(1);
      expect(robots.find((r) => r.docking === DockingState.Recalled)?.dockingHoldUntilMeasure).toBe(1);
      expect(robots.find((r) => r.docking === DockingState.Undocking)?.dockingHoldUntilMeasure).toBe(3);
      expect(new Set(robots.map((r) => r.batterySize)).size).toBe(MAX_ROBOTS);
      expect(robots.every((r) => r.batterySize !== undefined && r.batterySize !== 1)).toBe(true);

      setupLocaleWithRobots(robots);

      const initialSnapshots: RobotLifecycleSnapshot[] = robots.map((r) => ({
        id: r.id,
        docking: r.docking,
        batteryLevel: r.batteryLevel,
        dockingHoldUntilMeasure: r.dockingHoldUntilMeasure,
        batterySize: r.batterySize,
      }));

      const robot0Timeline: Array<[DockingState, number]> = [];
      for (let m = 1; m <= REPLAY_MEASURES; m++) {
        tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
        const r0 = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, 'prove-it-0')!;
        robot0Timeline.push([r0.docking, r0.batteryLevel]);
      }
      const realtimeResult = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;

      const replayResult = replayLifecycle(initialSnapshots, 0, REPLAY_MEASURES);

      // The stay: robot 0 crossed critical on tick 1 and stayed Active, draining to the floor, while it was
      // the only Active robot; robot 2 landed on tick 3, so robot 0 was recalled on tick 4 and docked on 5.
      expect(robot0Timeline.map(([d]) => d)).toEqual([
        DockingState.Active, DockingState.Active, DockingState.Active, DockingState.Recalled, DockingState.Docked,
      ]);
      expect(robot0Timeline[0][1]).toBeCloseTo(9, 9);
      expect(robot0Timeline[1][1]).toBeCloseTo(4, 9);
      expect(robot0Timeline.slice(2).map(([, b]) => b)).toEqual([0, 0, 0]);
      // Drained and never floored: robot 2 landed on tick 3 and drained on ticks 4 and 5 at its own size.
      const realtimeRobot2 = realtimeResult.find((r) => r.id === 'prove-it-2')!;
      expect(realtimeRobot2.docking).toBe(DockingState.Active);
      expect(realtimeRobot2.batteryLevel).toBeCloseTo(100 - 2 * (BATTERY_DRAIN_ACTIVE / SIZES[2]), 9);
      // Charged and never capped: every Docked robot rose from its start and stayed under 100.
      for (const robot of robots.slice(3)) {
        const real = realtimeResult.find((r) => r.id === robot.id)!;
        expect(real.batteryLevel).toBeGreaterThan(robot.batteryLevel);
        expect(real.batteryLevel).toBeLessThan(100);
      }
      // The sized rates made fractions, and the store kept them.
      expect(realtimeResult.some((r) => !Number.isInteger(r.batteryLevel))).toBe(true);
      // Robot 1 landed on Docked with its melody and its job untouched -- the real landOnDocked path clears
      // neither, and a docking no longer changes a melody (roadmap 92 Task 8).
      const realtimeRobot1 = realtimeResult.find((r) => r.id === 'prove-it-1')!;
      expect(realtimeRobot1.docking).toBe(DockingState.Docked);
      expect(realtimeRobot1.melody).toBe(robots[1].melody);
      expect(realtimeRobot1.job).toEqual(robots[1].job);

      for (const robot of robots) {
        const real = realtimeResult.find((r) => r.id === robot.id)!;
        const replayed = replayResult.find((r) => r.id === robot.id)!;
        expect(replayed.docking).toBe(real.docking);
        expect(replayed.batteryLevel).toBe(real.batteryLevel);
        expect(replayed.dockingHoldUntilMeasure).toBe(real.dockingHoldUntilMeasure);
      }
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
      let roster: ShiftLifecycleSnapshot[] = [
        member('a', { exitsAtMeasure: 50 }),
        member('bb', { exitsAtMeasure: 58 }),
        member('ccc', { exitsAtMeasure: 66 }),
        keeper,
      ];
      const plan = roster.slice(0, 3).map(asPlan);
      for (let m = 40; m <= 66; m++) {
        roster = stepShiftLifecycle(roster, m, ENV_60);
        expect(roster.slice(0, 3).every((r) => r.entersAtMeasure === undefined), `measure ${m}`).toBe(true);
      }
      expect(roster.slice(0, 3).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked, DockingState.Recalled]);
      roster = stepShiftLifecycle(roster, 67, ENV_60);
      expect(roster.slice(0, 3).map((r) => r.docking)).toEqual([DockingState.Docked, DockingState.Docked, DockingState.Docked]);
      expect(roster.slice(0, 3).map((r) => r.entersAtMeasure)).toEqual(planEntrance({ worldKey: '0:0', members: plan, from: 67, bpm: 60 }));
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

    it('a lone group due for recall stays whole: no member is recalled, and every member loses its exit turn', () => {
      const roster = [co('a', 'co-1', { exitsAtMeasure: 50 }), home('h1'), co('bb', 'co-1', { exitsAtMeasure: 58 })];
      const after = stepShiftLifecycle(roster, 44, ENV_60);
      expect(after.map((r) => r.docking)).toEqual([DockingState.Active, DockingState.Docked, DockingState.Active]);
      expect(after[0].exitsAtMeasure).toBeUndefined();
      expect(after[2].exitsAtMeasure).toBeUndefined();
      // Staying, it is never recalled while alone.
      let r = after;
      for (let m = 45; m <= 200; m++) {
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
      const roster = [co('a', 'co-d', { exitsAtMeasure: 50 }), co('bb', 'co-d', { exitsAtMeasure: 58 }), shift({ id: 'other', compositionSeed: 0.2, exitsAtMeasure: 900 })];
      const after = stepShiftLifecycle(roster, 44, ENV_60);
      expect(after.map((r) => r.docking)).toEqual([DockingState.Recalled, DockingState.Active, DockingState.Active]);
      expect(after[1].exitsAtMeasure).toBe(58);
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

    it('a home robot with no entrance gains an eighth of what is missing each measure', () => {
      const r = shift({ id: 'h', compositionSeed: 0.2, docking: DockingState.Docked, batteryLevel: 20 });
      const after = stepShiftLifecycle([r, keeper], 9, ENV_60)[0];
      expect(after.batteryLevel).toBeCloseTo(20 + 80 * BATTERY_EASE_SHARE, 12);
    });
  });
});
