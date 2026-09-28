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
  stepRobotLifecycle,
  replayLifecycle,
} from './robotSystems';
import type { RobotLifecycleSnapshot } from './robotSystems';
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
  DOCKED_PITCH_DRIFT_RATIO,
  MAX_ROBOTS,
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
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { reRollMelodyPitches } from '../engine/melodyGenerator';

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

  describe('tickRobotLifecycle — multi-measure integration (Task 6 refactor regression guard)', () => {
    it('drives a full Active -> Departing -> Docked cycle across several real ticks with expected battery values at each step', () => {
      // BATTERY_DRAIN_BASE=2 per measure (see constants), so 3 ticks from 16 lands exactly on
      // BATTERY_CRITICAL_THRESHOLD=10: 16 -> 14 -> 12 -> 10 (critical, departs).
      const robot = makeRobot({ id: 'integration-robot', batteryLevel: 16, job: undefined });
      const companion = makeRobot({ id: 'integration-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 1);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.batteryLevel).toBe(14);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.docking).toBe(DockingState.Active);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 2);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.batteryLevel).toBe(12);
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)?.docking).toBe(DockingState.Active);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 3);
      const afterCritical = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(afterCritical?.batteryLevel).toBe(10);
      expect(afterCritical?.docking).toBe(DockingState.Departing);
      expect(afterCritical?.dockingHoldUntilMeasure).toBe(4);
      expect(createSwimTimeline).toHaveBeenCalledTimes(1);

      // Hold elapses at measure 4 -> lands on Docked, drifted melody registered with AudioEngine.
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 4);
      const afterDocked = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(afterDocked.docking).toBe(DockingState.Docked);
      expect(afterDocked.dockingHoldUntilMeasure).toBeUndefined();
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(afterDocked.melody);

      // The companion, meanwhile, only ever drained -- 4 ticks * 2 = 8 -- never touched by any
      // of the landing effects above.
      expect(useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, companion.id)?.batteryLevel).toBe(92);
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
    // World Clock (docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 6): landOnDocked
    // no longer computes melody drift itself -- that moved to stepRobotLifecycle. Its own tests
    // below pass an explicit melody and verify pass-through/wiring (position, audioMode, state,
    // AudioEngine registration), not drift computation. The drift-computation tests that used to
    // live here (re-roll ratio, Pitch Repeat locking, cross-dock-cycle variation) moved to the
    // 'stepRobotLifecycle' describe block below, where that logic now actually lives.
    it('sets docking to Docked and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 5 });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('sets audioMode to mute — the toggle Robot Options exposes, not a voice release', () => {
      const robot = makeRobot({ docking: DockingState.Departing, audioMode: 'none' });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

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

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.state).toBe(RobotState.Idle);
      expect(updated?.destination).toBeNull();
    });

    it('does not release the voice or unregister the melody — a user can still override mute in Robot Options and hear it', () => {
      const robot = makeRobot({ id: 'docked-voice-kept', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      expect(AudioEngine.getVoiceForRobot(robot.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id).length).toBeGreaterThan(0);
    });

    it('registers whatever melody it is given with AudioEngine, replacing a stale one — pure pass-through, no computation of its own', () => {
      const robot = makeRobot({ id: 'docked-melody-refreshed', docking: DockingState.Departing });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody); // stale (pre-drift) melody

      const givenMelody = robot.melody.map((e) => ({ ...e, noteIndex: (e.noteIndex + 1) % 8 }));
      landOnDocked(DEFAULT_LOCALE_ID, robot.id, givenMelody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.melody).toEqual(givenMelody);
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(givenMelody);
    });

    it('keeps playing the click track through a dock cycle, even though the stored melody still updates to whatever it\'s given', () => {
      // Regression: landOnDocked unconditionally re-registers whatever melody it's given with
      // AudioEngine, which used to silently replace whatever was actually playing — including an
      // active click-track override — while the Ping Controls toggle kept showing it as on.
      const robot = makeRobot({ id: 'docked-click-track', docking: DockingState.Departing, clickTrackActive: true });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      // The toggle itself is untouched by the dock cycle, and what's actually registered with
      // AudioEngine is still the click track, never the passed-in real melody.
      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.clickTrackActive).toBe(true);
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(buildClickTrackMelody(robot.octaveRange[0]));
    });

    it('repositions the robot off-screen (outside the world bounds)', () => {
      const robot = makeRobot({ docking: DockingState.Departing, position: { x: 500, y: 500 } });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      const outsideX = (updated?.position.x ?? 0) < 0 || (updated?.position.x ?? 0) > 1920;
      const outsideY = (updated?.position.y ?? 0) < 0 || (updated?.position.y ?? 0) > 1080;
      expect(outsideX || outsideY).toBe(true);
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

  describe('stepRobotLifecycle (pure, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 3+4)', () => {
    const TEST_NOISE_MAP = getLocaleNoiseMap('robot-lifecycle-step-test-locale', 42, 42);

    function makeSnapshot(overrides: Partial<RobotLifecycleSnapshot> = {}): RobotLifecycleSnapshot {
      return {
        id: overrides.id ?? 'robot-1',
        docking: DockingState.Active,
        batteryLevel: 100,
        octaveRange: [3, 4],
        melody: overrides.melody ?? makeRobot().melody,
        dockCycleCount: overrides.dockCycleCount ?? 0,
        ...overrides,
      };
    }

    /** Reproduces landOnDocked's own pitch-drift seed formula exactly, for tests to compute an
     *  independent expected result against -- never calling stepRobotLifecycle to check itself. */
    function expectedDriftedMelody(melody: RobotLifecycleSnapshot['melody'], newDockCycleCount: number, noteVariance?: RobotLifecycleSnapshot['noteVariance']) {
      let callIndex = 0;
      const rand = () => getSeededVal(TEST_NOISE_MAP, 'robot.pitchDrift', newDockCycleCount * 100 + callIndex++, 0, 1);
      return reRollMelodyPitches(melody, DOCKED_PITCH_DRIFT_RATIO, { noteVariance, rand });
    }

    it('drains an Active robot by BATTERY_DRAIN_BASE with no job assigned', () => {
      const snap = makeSnapshot({ batteryLevel: 50, job: undefined });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_BASE);
    });

    it.each(Object.values(JobType))('drains by base + surcharge for job type %s', (jobType) => {
      const snap = makeSnapshot({ batteryLevel: 80, job: { type: jobType, assignedAtMeasure: 0 } });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(80 - (BATTERY_DRAIN_BASE + JOB_BATTERY_DRAIN_SURCHARGE[jobType]));
    });

    it('floors battery at 0, never negative', () => {
      const snap = makeSnapshot({ batteryLevel: 1, job: { type: JobType.FluidMonitoring, assignedAtMeasure: 0 } });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(0);
    });

    it('recharges a Docked robot by BATTERY_RECHARGE_RATE', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 + BATTERY_RECHARGE_RATE);
    });

    it('caps recharge at 100, never above', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: 98 });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(100);
    });

    it('an Active robot crossing the critical threshold begins Departing with a hold, not immediate Docked', () => {
      const robot = makeSnapshot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      const companion = makeSnapshot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      const [result] = stepRobotLifecycle([robot, companion], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Departing);
      expect(result.dockingHoldUntilMeasure).toBe(11);
    });

    it('the only Active robot stays Active at/under critical battery -- never zero Active robots', () => {
      const onlyActive = makeSnapshot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      const dockedOther = makeSnapshot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 50 });
      const [result] = stepRobotLifecycle([onlyActive, dockedOther], 10, TEST_NOISE_MAP);
      expect(result.docking).toBe(DockingState.Active);
      expect(result.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
    });

    it('re-reads the in-progress working roster, not a stale pre-step snapshot -- an earlier departure this same step is already visible to a later check', () => {
      // Two Active robots, BOTH at critical, no other Active robot anywhere. Processed in array
      // order: A departs first (B is still marked Active at that moment, so A is not "the last
      // one"). When B is then evaluated, A has already transitioned away from Active in the
      // WORKING array -- so B must find itself alone and stay Active, even though B's own
      // pre-step snapshot showed two Active robots.
      const a = makeSnapshot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      const b = makeSnapshot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined });
      const [resultA, resultB] = stepRobotLifecycle([a, b], 10, TEST_NOISE_MAP);
      expect(resultA.docking).toBe(DockingState.Departing);
      expect(resultB.docking).toBe(DockingState.Active);
    });

    it('a Docked robot reaching full battery begins Docking with a hold, not immediate Active', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Docking);
      expect(result.dockingHoldUntilMeasure).toBe(21);
    });

    it('a Docking robot whose hold has elapsed lands on Active with a job assigned', () => {
      const snap = makeSnapshot({ docking: DockingState.Docking, dockingHoldUntilMeasure: 20, batteryLevel: 100 });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
      expect(result.docking).toBe(DockingState.Active);
      expect(result.dockingHoldUntilMeasure).toBeUndefined();
      expect(result.job).toBeDefined();
    });

    it('job assignment respects JOB_MAX_ROBOTS_PER_TYPE balancing among other Active robots landing in the same roster', () => {
      // JOB_MAX_ROBOTS_PER_TYPE already-Active robots of every type the landing robot would
      // otherwise score highest for -- forces the balancer to skip to a less-saturated type.
      // scoreJobAffinities is deterministic from octaveRange/rhythmicDensity/etc; a robot with no
      // special attributes at all scores VentExtraction highest by the formula's own weighting, so
      // pre-fill VentExtraction to its cap and confirm the landing robot gets something else.
      const landing = makeSnapshot({ id: 'landing', docking: DockingState.Docking, dockingHoldUntilMeasure: 5, batteryLevel: 100, octaveRange: [1, 1], rhythmicDensity: 100 });
      const saturated = Array.from({ length: JOB_MAX_ROBOTS_PER_TYPE }, (_, i) =>
        makeSnapshot({ id: `saturated-${i}`, docking: DockingState.Active, job: { type: JobType.VentExtraction, assignedAtMeasure: 0 } }),
      );
      const [result] = stepRobotLifecycle([landing, ...saturated], 5, TEST_NOISE_MAP);
      expect(result.job?.type).not.toBe(JobType.VentExtraction);
    });

    it('a Departing robot whose hold has elapsed lands on Docked, job and hold cleared', () => {
      const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, job: { type: JobType.AcousticSurvey, assignedAtMeasure: 0 } });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
      expect(result.docking).toBe(DockingState.Docked);
      expect(result.dockingHoldUntilMeasure).toBeUndefined();
      expect(result.job).toBeUndefined();
    });

    it('a Docking/Departing robot whose hold has NOT yet elapsed stays put', () => {
      const docking = makeSnapshot({ docking: DockingState.Docking, dockingHoldUntilMeasure: 20, batteryLevel: 50 });
      const departing = makeSnapshot({ id: 'robot-2', docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [resultDocking, resultDeparting] = stepRobotLifecycle([docking, departing], 19, TEST_NOISE_MAP);
      expect(resultDocking.docking).toBe(DockingState.Docking);
      expect(resultDeparting.docking).toBe(DockingState.Departing);
    });

    it('is a pure function of its own arguments -- unaffected by whatever is in the live store', () => {
      // Deliberately leaves the store at its default (no robots matching this snapshot's id at
      // all) to prove stepRobotLifecycle reads nothing from useLocaleStore.
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50, job: undefined });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_BASE);
    });

    describe('melody drift on Departing -> Docked landings (Task 4)', () => {
      it('a Departing->Docked landing increments dockCycleCount by exactly 1', () => {
        const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0 });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.dockCycleCount).toBe(1);
      });

      it('a Docking->Active landing does NOT touch dockCycleCount or melody', () => {
        const originalMelody = makeRobot().melody;
        const snap = makeSnapshot({ docking: DockingState.Docking, dockingHoldUntilMeasure: 20, batteryLevel: 100, dockCycleCount: 3, melody: originalMelody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.docking).toBe(DockingState.Active);
        expect(result.dockCycleCount).toBe(3);
        expect(result.melody).toEqual(originalMelody);
      });

      it('the drifted melody matches the same seed formula landOnDocked uses live', () => {
        const melody = makeRobot().melody;
        const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.melody).toEqual(expectedDriftedMelody(melody, 1, snap.noteVariance));
      });

      it('two different robots that each dock once end up with different drifted melodies -- no seed collision', () => {
        const melody = makeRobot().melody;
        const robotA = makeSnapshot({ id: 'robot-a', docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody });
        const robotB = makeSnapshot({ id: 'robot-b', docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 5, melody });
        const [resultA, resultB] = stepRobotLifecycle([robotA, robotB], 20, TEST_NOISE_MAP);
        expect(resultA.melody).not.toEqual(resultB.melody);
      });

      it('a robot that docks twice applies its second drift on top of the first drift\'s result, not the original melody', () => {
        const originalMelody = makeRobot().melody;
        const afterFirstDock = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody: originalMelody });
        const [firstResult] = stepRobotLifecycle([afterFirstDock], 20, TEST_NOISE_MAP);
        expect(firstResult.dockCycleCount).toBe(1);

        // Simulate the robot going Active again, then Departing again, landing on Docked a second time.
        const beforeSecondDock = { ...firstResult, docking: DockingState.Departing, dockingHoldUntilMeasure: 40 };
        const [secondResult] = stepRobotLifecycle([beforeSecondDock], 40, TEST_NOISE_MAP);

        expect(secondResult.dockCycleCount).toBe(2);
        expect(secondResult.melody).toEqual(expectedDriftedMelody(firstResult.melody, 2, beforeSecondDock.noteVariance));
        expect(secondResult.melody).not.toEqual(originalMelody);
      });

      // Relocated from the old 'landOnDocked' describe block (Task 6) -- these test drift
      // computation itself, which now lives here, not in landOnDocked (pure pass-through since
      // Task 6).
      it('re-rolls ~25% of melody noteIndex values, leaving startStep/length/octave unchanged', () => {
        const originalMelody = makeRobot().melody;
        const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);

        expect(result.melody).toHaveLength(originalMelody.length);
        expect(result.melody.map((e) => e.startStep)).toEqual(originalMelody.map((e) => e.startStep));
        expect(result.melody.map((e) => e.length)).toEqual(originalMelody.map((e) => e.length));
        expect(result.melody.map((e) => e.octave)).toEqual(originalMelody.map((e) => e.octave));
        const changedCount = result.melody.filter((e, i) => e.noteIndex !== originalMelody[i].noteIndex).length;
        expect(changedCount).toBeGreaterThanOrEqual(1); // round(4 * 0.25) = 1
      });

      it('a fully Pitch-Repeat-locked robot (pitchLocked on every event) changes zero notes on re-roll', () => {
        const originalMelody = [
          { id: 'e1', startStep: 1, length: '16n' as const, noteIndex: 0, octave: 4 }, // base cell, never locked itself
          { id: 'e2', startStep: 5, length: '16n' as const, noteIndex: 0, octave: 4, pitchLocked: true },
          { id: 'e3', startStep: 9, length: '16n' as const, noteIndex: 0, octave: 4, pitchLocked: true },
          { id: 'e4', startStep: 13, length: '16n' as const, noteIndex: 0, octave: 4, pitchLocked: true },
        ];
        const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);

        // Only e1 (unlocked) is eligible, so the "always changes at least 1" floor could still
        // pick it — but every pitchLocked event must stay byte-identical regardless.
        expect(result.melody.filter((e) => e.pitchLocked).every((e) => e.noteIndex === 0)).toBe(true);
        const lockedChangedCount = result.melody.filter((e, i) => e.pitchLocked && e.noteIndex !== originalMelody[i].noteIndex).length;
        expect(lockedChangedCount).toBe(0);
      });

      it('re-rolls a different subset of pitches on successive dock cycles for the same robot', () => {
        const originalMelody = makeRobot().melody;
        const snap = makeSnapshot({ id: 'drift-robot', docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
        const [afterFirst] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);

        const beforeSecond = { ...afterFirst, docking: DockingState.Departing, dockingHoldUntilMeasure: 40 };
        const [afterSecond] = stepRobotLifecycle([beforeSecond], 40, TEST_NOISE_MAP);

        // Not a strict guarantee for any single seed, but across two independent dock cycles the
        // noteIndex arrays should not always be identical.
        const identical = JSON.stringify(afterFirst.melody.map((e) => e.noteIndex)) ===
          JSON.stringify(afterSecond.melody.map((e) => e.noteIndex));
        expect(identical).toBe(false);
      });

      it('a landing transition never sets position/audioMode/state/destination/direction -- RobotLifecycleSnapshot has no such fields to set', () => {
        const snap = makeSnapshot({ docking: DockingState.Departing, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        for (const field of ['position', 'audioMode', 'state', 'destination', 'direction']) {
          expect(field in result).toBe(false);
        }
      });
    });
  });

  describe('replayLifecycle (pure, docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 5)', () => {
    const TEST_NOISE_MAP = getLocaleNoiseMap('robot-lifecycle-replay-test-locale', 7, 7);

    function makeSnapshot(overrides: Partial<RobotLifecycleSnapshot> = {}): RobotLifecycleSnapshot {
      return {
        id: overrides.id ?? 'robot-1',
        docking: DockingState.Active,
        batteryLevel: 100,
        octaveRange: [3, 4],
        melody: overrides.melody ?? makeRobot().melody,
        dockCycleCount: overrides.dockCycleCount ?? 0,
        ...overrides,
      };
    }

    it('toMeasure < fromMeasure + 1 is a no-op -- returns the roster unchanged', () => {
      const snap = makeSnapshot({ batteryLevel: 50, job: undefined });
      const result = replayLifecycle([snap], 10, 10, TEST_NOISE_MAP);
      expect(result).toEqual([snap]);

      const resultBackwards = replayLifecycle([snap], 10, 5, TEST_NOISE_MAP);
      expect(resultBackwards).toEqual([snap]);
    });

    it('replaying N measures matches calling stepRobotLifecycle N times in a hand-written loop', () => {
      const snap = makeSnapshot({ batteryLevel: 50, job: undefined });

      let handRolled = [snap];
      for (let m = 1; m <= 5; m++) handRolled = stepRobotLifecycle(handRolled, m, TEST_NOISE_MAP);

      const replayed = replayLifecycle([snap], 0, 5, TEST_NOISE_MAP);
      expect(replayed).toEqual(handRolled);
    });

    it('replays measures fromMeasure+1 .. toMeasure inclusive, not fromMeasure itself', () => {
      // Starting exactly at the critical threshold: if measure `10` (fromMeasure) were replayed,
      // one extra drain would apply that shouldn't. Replaying only 11..15 (5 steps) should match
      // 5 hand-rolled steps starting from measure 11.
      const snap = makeSnapshot({ batteryLevel: 90, job: undefined });
      let handRolled = [snap];
      for (let m = 11; m <= 15; m++) handRolled = stepRobotLifecycle(handRolled, m, TEST_NOISE_MAP);

      const replayed = replayLifecycle([snap], 10, 15, TEST_NOISE_MAP);
      expect(replayed).toEqual(handRolled);
    });

    it('imports neither useLocaleStore nor getCurrentMeasure -- unaffected by whatever is in the live store', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50, job: undefined });
      const [result] = replayLifecycle([snap], 0, 3, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_BASE * 3);
    });
  });

  describe('prove-it: replay matches realtime (docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 7)', () => {
    it('N real ticks and one replayLifecycle call converge on identical docking/batteryLevel/dockingHoldUntilMeasure/job/melody for all 12 robots, exercising both the "never zero Active" invariant and a dock-triggered melody drift', () => {
      // Contrived starting state, not left to chance: robot 0 is the ONLY Active robot, already
      // at the critical threshold plus one measure's drain -- guarantees the invariant fires (it
      // must stay Active, there's no one else). Robot 1 is already Departing with its hold
      // elapsing on the very first tick -- guarantees a dock-triggered melody drift happens
      // within the test's window. Robots 2-11 are Docked, mid-battery, far from any threshold, so
      // they contribute realistic "nothing special happens" noise without triggering their own
      // transitions and complicating what's being proven.
      const robots: Robot[] = [
        makeRobot({ id: 'prove-it-0', docking: DockingState.Active, batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_BASE, job: undefined }),
        makeRobot({ id: 'prove-it-1', docking: DockingState.Departing, dockingHoldUntilMeasure: 1, batteryLevel: 5, job: undefined }),
        ...Array.from({ length: MAX_ROBOTS - 2 }, (_, i) =>
          makeRobot({ id: `prove-it-${i + 2}`, docking: DockingState.Docked, batteryLevel: 40 + i, job: undefined }),
        ),
      ];
      expect(robots).toHaveLength(MAX_ROBOTS);

      // Assert the preconditions actually hold before running anything -- not left to chance.
      expect(robots.filter((r) => r.docking === DockingState.Active)).toHaveLength(1);
      expect(robots.find((r) => r.docking === DockingState.Departing)?.dockingHoldUntilMeasure).toBe(1);

      setupLocaleWithRobots(robots);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      const noiseMap = getLocaleNoiseMap(DEFAULT_LOCALE_ID, locale.coordinates.x, locale.coordinates.y);

      const initialSnapshots: RobotLifecycleSnapshot[] = robots.map((r) => ({
        id: r.id,
        docking: r.docking,
        batteryLevel: r.batteryLevel,
        dockingHoldUntilMeasure: r.dockingHoldUntilMeasure,
        job: r.job,
        melody: r.melody,
        dockCycleCount: 0, // fresh ids, never docked before in this test file
        octaveRange: r.octaveRange,
        rhythmicDensity: r.rhythmicDensity,
        rhythmicMotifLength: r.rhythmicMotifLength,
        noteVariance: r.noteVariance,
      }));

      const REPLAY_MEASURES = 5;
      for (let m = 1; m <= REPLAY_MEASURES; m++) tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
      const realtimeResult = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;

      const replayResult = replayLifecycle(initialSnapshots, 0, REPLAY_MEASURES, noiseMap);

      // The invariant actually fired: robot 0 stayed Active despite crossing critical battery.
      const realtimeRobot0 = realtimeResult.find((r) => r.id === 'prove-it-0')!;
      expect(realtimeRobot0.docking).toBe(DockingState.Active);
      // The drift actually fired: robot 1 landed on Docked with a melody different from its start.
      const realtimeRobot1 = realtimeResult.find((r) => r.id === 'prove-it-1')!;
      expect(realtimeRobot1.docking).toBe(DockingState.Docked);
      expect(realtimeRobot1.melody).not.toEqual(robots[1].melody);

      for (const robot of robots) {
        const real = realtimeResult.find((r) => r.id === robot.id)!;
        const replayed = replayResult.find((r) => r.id === robot.id)!;
        expect(replayed.docking).toBe(real.docking);
        expect(replayed.batteryLevel).toBe(real.batteryLevel);
        expect(replayed.dockingHoldUntilMeasure).toBe(real.dockingHoldUntilMeasure);
        expect(replayed.job).toEqual(real.job);
        expect(replayed.melody).toEqual(real.melody);
      }
    });
  });
});
