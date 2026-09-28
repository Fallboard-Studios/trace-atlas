// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  tickRobotLifecycle,
  startRobotLifecycle,
  stopRobotLifecycle,
  scoreJobAffinities,
  assignJob,
  landOnActive,
  landOnDocked,
} from './robotSystems';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { AudioEngine } from '../engine/AudioEngine';
import { buildClickTrackMelody } from '../engine/clickTrack';
import { DockingState, JobType, RobotState } from '../types/Robot';
import type { Robot } from '../types/Robot';
import {
  BATTERY_DRAIN_BASE,
  JOB_BATTERY_DRAIN_SURCHARGE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  JOB_MAX_ROBOTS_PER_TYPE,
} from '../constants';

// ========================================
// MOCKS
// ========================================

// handleRobotIdle has real GSAP/SVG-ref side effects (createSwimTimeline) that
// are already covered by idleSystem's own tests — mock it here so
// robotSystems tests assert only "was it invoked", not idleSystem's internals.
vi.mock('./idleSystem', () => ({
  handleRobotIdle: vi.fn(),
  pickExitDestination: vi.fn(() => ({ x: -150, y: 300 })),
}));
import { handleRobotIdle, pickExitDestination } from './idleSystem';

// createSwimTimeline has real GSAP/SVG-ref side effects, already covered by
// its own module's usage elsewhere — mock it here so these tests assert only
// "was an exit swim started, toward what, in what direction", not GSAP internals.
vi.mock('../animation/swimAnimation', () => ({
  createSwimTimeline: vi.fn(),
}));
import { createSwimTimeline } from '../animation/swimAnimation';

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
    state: 'idle',
    position: { x: 100, y: 100 },
    destination: null,
    direction: 'right',
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
    createdAt: Date.now(),
    masterVolume: 0.7,
    docking: DockingState.Active,
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
    it('drains by BATTERY_DRAIN_BASE with no job assigned', () => {
      const robot = makeRobot({ batteryLevel: 50, job: undefined });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(50 - BATTERY_DRAIN_BASE);
    });

    it.each(Object.values(JobType))('drains by base + surcharge for job type %s', (jobType) => {
      const robot = makeRobot({ batteryLevel: 80, job: { type: jobType, assignedAtMeasure: 0 } });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(80 - (BATTERY_DRAIN_BASE + JOB_BATTERY_DRAIN_SURCHARGE[jobType]));
    });

    it('floors battery at 0, never negative', () => {
      const robot = makeRobot({ batteryLevel: 1, job: { type: JobType.FluidMonitoring, assignedAtMeasure: 0 } });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(0);
    });
  });

  describe('tickRobotLifecycle — battery recharge (Docked)', () => {
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
    it('Active robot crossing the critical threshold begins Departing with a hold, not immediate Docked', () => {
      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, // will land exactly at critical after drain
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Departing);
      expect(updated?.dockingHoldUntilMeasure).toBe(11);
    });

    it('begins swimming a robot off-screen the instant it starts Departing, rather than freezing in place', () => {
      const robot = makeRobot({
        position: { x: 960, y: 540 },
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE,
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      expect(pickExitDestination).toHaveBeenCalledWith(robot.position);
      expect(createSwimTimeline).toHaveBeenCalledTimes(1);
      const [swimRobotArg, destinationArg] = (createSwimTimeline as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(swimRobotArg.id).toBe(robot.id);
      expect(destinationArg).toEqual({ x: -150, y: 300 }); // mocked pickExitDestination's fixed return

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.state).toBe(RobotState.Moving);
      expect(updated?.destination).toEqual({ x: -150, y: 300 });
    });

    it('keeps the robot facing its current direction on exit — a bottom-only exit has no horizontal component to flip toward', () => {
      const robot = makeRobot({
        direction: 'right',
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE,
        job: undefined,
      });
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.direction).toBe('right');
    });

    it('Docked robot reaching full battery begins Docking with a hold, not immediate Active', () => {
      const robot = makeRobot({
        docking: DockingState.Docked,
        batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE,
      });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 20);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Docking);
      expect(updated?.dockingHoldUntilMeasure).toBe(21);
    });

    it('a Departing robot does not drain further while held', () => {
      const robot = makeRobot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 15, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(5);
    });

    it('the sole Active robot stays Active at/below critical battery instead of departing, so the roster is never fully Docked', () => {
      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE,
        job: undefined,
      });
      const dockedCompanion = makeRobot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 40 });
      setupLocaleWithRobots([robot, dockedCompanion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Active); // held, not Departing
      expect(createSwimTimeline).not.toHaveBeenCalled();
    });

    it('the sole Active robot floors at 0 battery and keeps being held rather than departing', () => {
      const robot = makeRobot({ batteryLevel: BATTERY_DRAIN_BASE, job: undefined }); // drains to exactly 0
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBe(0);
      expect(updated?.docking).toBe(DockingState.Active);
    });

    it('a held-back robot departs on a later tick once another robot has landed back on Active', () => {
      const robot = makeRobot({ batteryLevel: 0, job: undefined }); // already floored, held Active
      const revivedCompanion = makeRobot({ id: 'robot-revived', batteryLevel: 100, job: undefined }); // now Active
      setupLocaleWithRobots([robot, revivedCompanion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 20);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Departing);
      expect(updated?.dockingHoldUntilMeasure).toBe(21);
    });

    it('when two robots cross critical in the same tick, only one departs — the other is held to protect the invariant', () => {
      const robotA = makeRobot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      const robotB = makeRobot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      setupLocaleWithRobots([robotA, robotB]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updatedA = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robotA.id);
      const updatedB = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robotB.id);
      const dockingStates = [updatedA?.docking, updatedB?.docking];
      expect(dockingStates).toContain(DockingState.Departing);
      expect(dockingStates).toContain(DockingState.Active); // held — otherwise both would leave and the roster would empty
    });
  });

  describe('tickRobotLifecycle — hold-elapsed landing', () => {
    it('a Docking robot whose hold has elapsed lands on Active', () => {
      const robot = makeRobot({
        docking: DockingState.Docking,
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

    it('a Docking robot whose hold has NOT elapsed stays Docking', () => {
      const robot = makeRobot({ docking: DockingState.Docking, dockingHoldUntilMeasure: 15, batteryLevel: 100 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docking);
    });

    it('a Departing robot whose hold has elapsed lands on Docked', () => {
      const robot = makeRobot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 10, batteryLevel: 5 });
      setupLocaleWithRobots([robot]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });
  });

  describe('landOnActive', () => {
    it('sets docking to Active and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Docking, dockingHoldUntilMeasure: 5, job: undefined });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Active);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('sets audioMode to none — unmutes via the same toggle Robot Options exposes', () => {
      const robot = makeRobot({ docking: DockingState.Docking, job: undefined, audioMode: 'mute' });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.audioMode).toBe('none');
    });

    it('does not touch AudioEngine voice/melody registration — those are set once at spawn and stay put', () => {
      const robot = makeRobot({ id: 'active-no-voice-touch', docking: DockingState.Docking, job: undefined });
      setupLocaleWithRobots([robot]);
      // Deliberately NOT reserved/registered here — landOnActive must not be the thing that does it.
      expect(AudioEngine.getVoiceForRobot(robot.id)).toBeNull();

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(AudioEngine.getVoiceForRobot(robot.id)).toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual([]);
    });

    it('assigns a job', () => {
      const robot = makeRobot({ docking: DockingState.Docking, job: undefined });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.job).toBeDefined();
      expect(Object.values(JobType)).toContain(updated?.job?.type);
    });

    it('restarts idle wandering via handleRobotIdle, flagged as a return so the first destination stays in the bottom half', () => {
      const robot = makeRobot({ docking: DockingState.Docking, job: undefined });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(handleRobotIdle).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, robot.id, { isReturning: true });
    });
  });

  describe('landOnDocked', () => {
    it('sets docking to Docked and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 5 });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('sets audioMode to mute — the toggle Robot Options exposes, not a voice release', () => {
      const robot = makeRobot({ docking: DockingState.Departing, audioMode: 'none' });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.audioMode).toBe('mute');
    });

    it('settles state back to Idle and clears destination — beginDeparting leaves it Moving for the exit swim, and a later landOnActive would otherwise be blocked by handleRobotIdle\'s own state===Idle guard', () => {
      const robot = makeRobot({
        docking: DockingState.Departing,
        state: RobotState.Moving,
        destination: { x: -150, y: 300 },
      });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.state).toBe(RobotState.Idle);
      expect(updated?.destination).toBeNull();
    });

    it('does not release the voice or unregister the melody — a user can still override mute in Robot Options and hear it', () => {
      const robot = makeRobot({ id: 'docked-voice-kept', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      expect(AudioEngine.getVoiceForRobot(robot.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id).length).toBeGreaterThan(0);
    });

    it('re-registers the melody with AudioEngine so a manual mute override plays the drifted pitches, not the stale ones', () => {
      const robot = makeRobot({ id: 'docked-melody-refreshed', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody); // stale (pre-drift) melody

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(updated.melody);
    });

    it('keeps playing the click track through a dock cycle\'s pitch-drift reroll, even though the stored melody itself still drifts', () => {
      // Regression: landOnDocked unconditionally re-registers its freshly-drifted melody with
      // AudioEngine, which used to silently replace whatever was actually playing — including an
      // active click-track override — while the Ping Controls toggle kept showing it as on.
      const robot = makeRobot({ id: 'docked-click-track', docking: DockingState.Departing, clickTrackActive: true });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      // The store's own pitch-drift bookkeeping happens exactly as it would for any other robot
      // (covered by the "re-rolls ~25%..." test above) — the toggle itself is untouched by the
      // dock cycle, and what's actually registered with AudioEngine is still the click track,
      // never the freshly-drifted real melody.
      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.clickTrackActive).toBe(true);
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(buildClickTrackMelody(robot.octaveRange[0]));
    });

    it('repositions the robot off-screen (outside the world bounds)', () => {
      const robot = makeRobot({ docking: DockingState.Departing, position: { x: 500, y: 500 } });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      const outsideX = (updated?.position.x ?? 0) < 0 || (updated?.position.x ?? 0) > 1920;
      const outsideY = (updated?.position.y ?? 0) < 0 || (updated?.position.y ?? 0) > 1080;
      expect(outsideX || outsideY).toBe(true);
    });

    it('re-rolls ~25% of melody noteIndex values, leaving startStep/length/octave unchanged', () => {
      const robot = makeRobot({ id: 'pitch-drift-25pct', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.melody).toHaveLength(robot.melody.length);
      expect(updated?.melody.map((e) => e.startStep)).toEqual(robot.melody.map((e) => e.startStep));
      expect(updated?.melody.map((e) => e.length)).toEqual(robot.melody.map((e) => e.length));
      expect(updated?.melody.map((e) => e.octave)).toEqual(robot.melody.map((e) => e.octave));
      const changedCount = updated!.melody.filter((e, i) => e.noteIndex !== robot.melody[i].noteIndex).length;
      expect(changedCount).toBeGreaterThanOrEqual(1); // round(4 * 0.25) = 1
    });

    it('a fully Pitch-Repeat-locked robot (pitchLocked on every event) changes zero notes on re-roll', () => {
      // Task 11 (docs/tasks/PITCH_REPEAT.md): landOnDocked's own code is unchanged (it already
      // passes the full melody to reRollMelodyPitches, which now excludes pitchLocked events
      // internally — Task 7). This is end-to-end coverage through the real dock transition.
      const robot = makeRobot({
        id: 'pitch-repeat-fully-locked',
        docking: DockingState.Departing,
        melody: [
          { id: 'e1', startStep: 1, length: '16n', noteIndex: 0, octave: 4 }, // base cell, never locked itself
          { id: 'e2', startStep: 5, length: '16n', noteIndex: 0, octave: 4, pitchLocked: true },
          { id: 'e3', startStep: 9, length: '16n', noteIndex: 0, octave: 4, pitchLocked: true },
          { id: 'e4', startStep: 13, length: '16n', noteIndex: 0, octave: 4, pitchLocked: true },
        ],
      });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      // Only e1 (unlocked) is eligible, so the "always changes at least 1" floor could still pick
      // it — but every pitchLocked event must stay byte-identical regardless.
      expect(updated.melody.filter((e) => e.pitchLocked).every((e) => e.noteIndex === 0)).toBe(true);
      const lockedChangedCount = updated.melody.filter((e, i) => e.pitchLocked && e.noteIndex !== robot.melody[i].noteIndex).length;
      expect(lockedChangedCount).toBe(0);
    });

    it('docking a robot with no pitchLocked events behaves exactly as before Pitch Repeat (regression guard)', () => {
      // Same scenario/assertions as the pre-existing 're-rolls ~25%...' test above — explicit
      // regression guard per Task 11's acceptance criteria, not just "still passes incidentally".
      const robot = makeRobot({ id: 'pitch-repeat-unlocked-regression', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      const changedCount = updated!.melody.filter((e, i) => e.noteIndex !== robot.melody[i].noteIndex).length;
      expect(changedCount).toBeGreaterThanOrEqual(1); // round(4 * 0.25) = 1, same as the existing test
    });

    it('re-rolls a different subset of pitches on successive dock cycles for the same robot', () => {
      const robot = makeRobot({ docking: DockingState.Departing, id: 'drift-robot' });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id);
      const afterFirst = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;

      useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robot.id, { docking: DockingState.Departing });
      landOnDocked(DEFAULT_LOCALE_ID, robot.id);
      const afterSecond = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;

      // Not a strict guarantee for any single seed, but across two independent
      // dock cycles the noteIndex arrays should not always be identical.
      const identical = JSON.stringify(afterFirst.melody.map((e) => e.noteIndex)) ===
        JSON.stringify(afterSecond.melody.map((e) => e.noteIndex));
      expect(identical).toBe(false);
    });
  });

  describe('scoreJobAffinities', () => {
    it('scores Vent Extraction highest for a low-register, dense, low-variance robot', () => {
      const robot = makeRobot({
        octaveRange: [1, 2],
        rhythmicDensity: 90,
        rhythmicMotifLength: { active: true, value: 2 },
        noteVariance: { active: true, value: 2 },
      });
      const scores = scoreJobAffinities(robot);
      const highest = (Object.keys(scores) as JobType[]).sort((a, b) => scores[b] - scores[a])[0];
      expect(highest).toBe(JobType.VentExtraction);
    });

    it('scores Acoustic Survey highest for a high-register, sparse, unrestricted-variance robot', () => {
      const robot = makeRobot({
        octaveRange: [6, 7],
        rhythmicDensity: 20,
        rhythmicMotifLength: { active: false, value: 0 },
        noteVariance: { active: false, value: 0 },
      });
      const scores = scoreJobAffinities(robot);
      const highest = (Object.keys(scores) as JobType[]).sort((a, b) => scores[b] - scores[a])[0];
      expect(highest).toBe(JobType.AcousticSurvey);
    });

    it('scores Structural Inspection highest for a wide-span robot with a mid-length motif', () => {
      const robot = makeRobot({
        octaveRange: [1, 7],
        rhythmicDensity: 70,
        rhythmicMotifLength: { active: true, value: 6 },
        noteVariance: { active: false, value: 0 },
      });
      const scores = scoreJobAffinities(robot);
      const highest = (Object.keys(scores) as JobType[]).sort((a, b) => scores[b] - scores[a])[0];
      expect(highest).toBe(JobType.StructuralInspection);
    });

    it('scores Fluid Monitoring highest for a mid-register, default-density robot', () => {
      const robot = makeRobot({
        octaveRange: [3, 4],
        rhythmicDensity: 50,
        rhythmicMotifLength: { active: true, value: 8 },
        noteVariance: { active: false, value: 0 },
      });
      const scores = scoreJobAffinities(robot);
      const highest = (Object.keys(scores) as JobType[]).sort((a, b) => scores[b] - scores[a])[0];
      expect(highest).toBe(JobType.FluidMonitoring);
    });

    it('Fluid Monitoring score is higher for a robot with default (inactive) noteVariance than an otherwise-identical robot with highly active, narrow variance', () => {
      const base = { octaveRange: [3, 4] as [number, number], rhythmicDensity: 50, rhythmicMotifLength: { active: true, value: 8 } };
      const defaultVarianceRobot = makeRobot({ ...base, noteVariance: { active: false, value: 0 } });
      const narrowVarianceRobot = makeRobot({ ...base, noteVariance: { active: true, value: 2 } });

      const defaultScore = scoreJobAffinities(defaultVarianceRobot)[JobType.FluidMonitoring];
      const narrowScore = scoreJobAffinities(narrowVarianceRobot)[JobType.FluidMonitoring];

      expect(defaultScore).toBeGreaterThan(narrowScore);
    });

    it('Fluid Monitoring does not tie with Structural Inspection for a wide-octave-span robot whose average happens to be mid-register', () => {
      // octaveRange [1,7] averages to a "mid" 4 — Fluid Monitoring's register
      // check alone would wrongly reward this even though the wide span is
      // exactly what Structural Inspection's profile describes, not a steady
      // mid-register hum.
      const robot = makeRobot({
        octaveRange: [1, 7],
        rhythmicDensity: 70,
        rhythmicMotifLength: { active: true, value: 6 },
        noteVariance: { active: false, value: 0 },
      });
      const scores = scoreJobAffinities(robot);
      expect(scores[JobType.StructuralInspection]).toBeGreaterThan(scores[JobType.FluidMonitoring]);
    });

    it('is deterministic — same robot attributes in, same scores out', () => {
      const robot = makeRobot({ octaveRange: [2, 5], rhythmicDensity: 65 });
      expect(scoreJobAffinities(robot)).toEqual(scoreJobAffinities(robot));
    });
  });

  describe('assignJob', () => {
    it('assigns the highest-scoring job type when no cap is in play', () => {
      const robot = makeRobot({
        id: 'vent-robot',
        octaveRange: [1, 2],
        rhythmicDensity: 90,
        rhythmicMotifLength: { active: true, value: 2 },
        noteVariance: { active: true, value: 2 },
        job: undefined,
      });
      setupLocaleWithRobots([robot]);

      assignJob(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.job?.type).toBe(JobType.VentExtraction);
      expect(updated?.job?.assignedAtMeasure).toBe(42); // mocked getCurrentMeasure
    });

    it('respects JOB_MAX_ROBOTS_PER_TYPE — a 4th same-profile robot gets its next-best available type', () => {
      const ventProfile = {
        octaveRange: [1, 2] as [number, number],
        rhythmicDensity: 90,
        rhythmicMotifLength: { active: true, value: 2 },
        noteVariance: { active: true, value: 2 },
      };
      const alreadyAssigned = Array.from({ length: JOB_MAX_ROBOTS_PER_TYPE }, (_, i) =>
        makeRobot({ id: `vent-${i}`, ...ventProfile, job: { type: JobType.VentExtraction, assignedAtMeasure: 0 } })
      );
      const newcomer = makeRobot({ id: 'vent-overflow', ...ventProfile, job: undefined });
      setupLocaleWithRobots([...alreadyAssigned, newcomer]);

      assignJob(DEFAULT_LOCALE_ID, newcomer.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, newcomer.id);
      expect(updated?.job?.type).not.toBe(JobType.VentExtraction);
      expect(Object.values(JobType)).toContain(updated?.job?.type);
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

    it('drives the tick with getCurrentMeasure() (unwrapped), not the wrapped 0-95 value subscribeToMeasure hands its callback — the wrapped value is what would strand a robot at the day-cycle boundary', () => {
      // getCurrentMeasure() is the real, monotonic (never-wrapped) measure count;
      // subscribeToMeasure's own callback argument is wrapped to 0-95 by BeatClock
      // itself (see beatClock.ts) and must never be used for hold arithmetic.
      // Simulate the exact scenario that broke: BeatClock wraps 95 back to 0 for
      // the callback argument, while the true unwrapped count keeps climbing.
      (getCurrentMeasure as ReturnType<typeof vi.fn>).mockReturnValueOnce(1247);

      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE,
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      startRobotLifecycle(DEFAULT_LOCALE_ID);
      const tickCallback = (subscribeToMeasure as ReturnType<typeof vi.fn>).mock.calls[0][0];
      tickCallback(0); // the wrapped argument BeatClock would actually pass at this instant

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Departing);
      // Must be derived from getCurrentMeasure() (1247 + 1), not the wrapped
      // callback argument (0 + 1 = 1) — the old bug would produce 1 here.
      expect(updated?.dockingHoldUntilMeasure).toBe(1248);

      stopRobotLifecycle();
    });
  });
});
