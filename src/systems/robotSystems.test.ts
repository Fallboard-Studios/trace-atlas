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
} from './robotSystems';
import type { RobotLifecycleSnapshot } from './robotSystems';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { AudioEngine } from '../engine/AudioEngine';
import { buildClickTrackMelody } from '../engine/clickTrack';
import { DockingState, JobType } from '../types/Robot';
import type { Robot } from '../types/Robot';
import { getDockCycleCount } from './dockCycles';
import {
  BATTERY_DRAIN_ACTIVE,
  BATTERY_RECHARGE_RATE,
  BATTERY_CRITICAL_THRESHOLD,
  BATTERY_FULL_THRESHOLD,
  DOCKED_PITCH_DRIFT_RATIO,
  MAX_ROBOTS,
} from '../constants';

// ========================================
// MOCKS
// ========================================

// The tick reaches anything visual only through the onLifecycleChange seam (Phase 43 Task 5).
// Mock it so these tests assert "was the seam called, with which `to`, after which writes" —
// the adapter behind it (exit swim, dock position, job, idle restart) has its own tests in
// lifecycleVisuals.test.ts, including an end-to-end run through the real tick.
vi.mock('./lifecycleVisuals', () => ({
  onLifecycleChange: vi.fn(),
}));
import { onLifecycleChange } from './lifecycleVisuals';
const seam = onLifecycleChange as ReturnType<typeof vi.fn>;

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
    gemSeed: 1,
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
    it('Active robot crossing the critical threshold begins Recalled with a hold, not immediate Docked', () => {
      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, // will land exactly at critical after drain
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Recalled);
      expect(updated?.dockingHoldUntilMeasure).toBe(11);
    });

    it('calls the seam with \'recalled\' the instant a robot is Recalled — once, for that robot only, after the Recalled write', () => {
      const robot = makeRobot({
        position: { x: 960, y: 540 },
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);
      let dockingAtSeam: DockingState | undefined;
      seam.mockImplementationOnce((_l: string, id: string) => {
        dockingAtSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id)?.docking;
      });

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      expect(seam).toHaveBeenCalledTimes(1);
      expect(seam).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, robot.id, 'recalled');
      expect(dockingAtSeam).toBe(DockingState.Recalled);
    });

    it('beginRecall writes no visual state itself — no swim, state, destination, direction or position', () => {
      const robot = makeRobot({
        position: { x: 960, y: 540 },
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.state).toBe(robot.state);
      expect(updated.destination).toBe(robot.destination);
      expect(updated.direction).toBe(robot.direction);
      expect(updated.position).toEqual(robot.position);
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

    it('the sole Active robot stays Active at/below critical battery instead of being recalled, so the roster is never fully Docked', () => {
      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      const dockedCompanion = makeRobot({ id: 'robot-docked', docking: DockingState.Docked, batteryLevel: 40 });
      setupLocaleWithRobots([robot, dockedCompanion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(updated?.docking).toBe(DockingState.Active); // held, not Recalled
      expect(seam).not.toHaveBeenCalled();
    });

    it('the sole Active robot floors at 0 battery and keeps being held rather than being recalled', () => {
      const robot = makeRobot({ batteryLevel: BATTERY_DRAIN_ACTIVE, job: undefined }); // drains to exactly 0
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
      expect(updated?.docking).toBe(DockingState.Recalled);
      expect(updated?.dockingHoldUntilMeasure).toBe(21);
    });

    it('when two robots cross critical in the same tick, only one departs — the other is held to protect the invariant', () => {
      const robotA = makeRobot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
      const robotB = makeRobot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
      setupLocaleWithRobots([robotA, robotB]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10);

      const updatedA = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robotA.id);
      const updatedB = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robotB.id);
      const dockingStates = [updatedA?.docking, updatedB?.docking];
      expect(dockingStates).toContain(DockingState.Recalled);
      expect(dockingStates).toContain(DockingState.Active); // held — otherwise both would leave and the roster would empty
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

      // Hold elapses at measure 4 -> lands on Docked, drifted melody registered with AudioEngine.
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 4);
      const afterDocked = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(afterDocked.docking).toBe(DockingState.Docked);
      expect(afterDocked.dockingHoldUntilMeasure).toBeUndefined();
      expect(AudioEngine.getRegisteredMelody(robot.id)).toEqual(afterDocked.melody);
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

    it('sets audioMode to none — unmutes via the same toggle Robot Options exposes', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, job: undefined, audioMode: 'mute' });
      setupLocaleWithRobots([robot]);

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.audioMode).toBe('none');
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

    it('calls the seam with \'active\' once, after the Active + unmute write', () => {
      const robot = makeRobot({ docking: DockingState.Undocking, job: undefined, audioMode: 'mute' });
      setupLocaleWithRobots([robot]);
      let atSeam: Robot | undefined;
      seam.mockImplementationOnce((_l: string, id: string) => {
        atSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id);
      });

      landOnActive(DEFAULT_LOCALE_ID, robot.id);

      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'active']]);
      expect(atSeam?.docking).toBe(DockingState.Active);
      expect(atSeam?.audioMode).toBe('none');
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
  });

  describe('landOnDocked', () => {
    // World Clock (docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 6): landOnDocked
    // no longer computes melody drift itself -- that moved to stepRobotLifecycle. Its own tests
    // below pass an explicit melody and verify pass-through/wiring (position, audioMode, state,
    // AudioEngine registration), not drift computation. The drift-computation tests that used to
    // live here (re-roll ratio, Pitch Repeat locking, cross-dock-cycle variation) moved to the
    // 'stepRobotLifecycle' describe block below, where that logic now actually lives.
    it('sets docking to Docked and clears the hold', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 5 });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Docked);
      expect(updated?.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('sets audioMode to mute — the toggle Robot Options exposes, not a voice release', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, audioMode: 'none' });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.audioMode).toBe('mute');
    });

    it('does not release the voice or unregister the melody — a user can still override mute in Robot Options and hear it', () => {
      const robot = makeRobot({ id: 'docked-voice-kept', docking: DockingState.Recalled });
      setupLocaleWithRobots([robot]);
      AudioEngine.reserveVoice(robot.id, robot.audioAttributes.layers!, robot.audioAttributes.adsr);
      AudioEngine.registerRobotMelody(robot.id, robot.melody);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      expect(AudioEngine.getVoiceForRobot(robot.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(robot.id).length).toBeGreaterThan(0);
    });

    it('registers whatever melody it is given with AudioEngine, replacing a stale one — pure pass-through, no computation of its own', () => {
      const robot = makeRobot({ id: 'docked-melody-refreshed', docking: DockingState.Recalled });
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
      const robot = makeRobot({ id: 'docked-click-track', docking: DockingState.Recalled, clickTrackActive: true });
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

    it('calls the seam with \'docked\' once, after the Docked/mute/melody write, with the dock cycle already advanced', () => {
      const robot = makeRobot({ id: 'docked-seam', docking: DockingState.Recalled, audioMode: 'none' });
      setupLocaleWithRobots([robot]);
      const givenMelody = robot.melody.map((e) => ({ ...e, noteIndex: (e.noteIndex + 1) % 8 }));
      let atSeam: Robot | undefined;
      let cycleAtSeam = -1;
      seam.mockImplementationOnce((_l: string, id: string) => {
        atSeam = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id);
        cycleAtSeam = getDockCycleCount(id);
      });

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, givenMelody);

      expect(seam.mock.calls).toEqual([[DEFAULT_LOCALE_ID, robot.id, 'docked']]);
      expect(atSeam?.docking).toBe(DockingState.Docked);
      expect(atSeam?.audioMode).toBe('mute');
      expect(atSeam?.melody).toEqual(givenMelody);
      expect(cycleAtSeam).toBe(1);
    });

    it('advances the dock cycle once per landing — it seeds the next pitch drift', () => {
      const robot = makeRobot({ id: 'docked-cycle-count', docking: DockingState.Recalled });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);
      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      expect(getDockCycleCount(robot.id)).toBe(2);
    });

    it('writes no position, state or destination itself — the dock position is the seam\'s', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, position: { x: 500, y: 500 }, state: 'moving', destination: { x: -150, y: 300 } });
      setupLocaleWithRobots([robot]);

      landOnDocked(DEFAULT_LOCALE_ID, robot.id, robot.melody);

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id)!;
      expect(updated.position).toEqual({ x: 500, y: 500 });
      expect(updated.state).toBe('moving');
      expect(updated.destination).toEqual({ x: -150, y: 300 });
    });

    it('is a silent no-op for a robot that is not in the locale — no seam call, no dock cycle', () => {
      setupLocaleWithRobots([]);

      landOnDocked(DEFAULT_LOCALE_ID, 'ghost-docked', []);

      expect(seam).not.toHaveBeenCalled();
      expect(getDockCycleCount('ghost-docked')).toBe(0);
    });
  });

  describe('module boundary (Phase 43 Task 5)', () => {
    it('robotSystems.ts imports nothing visual — no idleSystem, swimAnimation or spawnSystem', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const src = readFileSync(resolve(__dirname, 'robotSystems.ts'), 'utf8');
      // Every module specifier, including the closing line of a multi-line import.
      const specifiers = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      expect(specifiers).not.toContain('./idleSystem');
      expect(specifiers).not.toContain('../animation/swimAnimation');
      expect(specifiers).not.toContain('./spawnSystem');
      expect(specifiers).toContain('./lifecycleVisuals');
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

    it('drives the tick with getCurrentMeasure() (unwrapped), not the wrapped 0-95 value subscribeToMeasure hands its callback — the wrapped value is what would strand a robot at the day-cycle boundary', () => {
      // getCurrentMeasure() is the real, monotonic (never-wrapped) measure count;
      // subscribeToMeasure's own callback argument is wrapped to 0-95 by BeatClock
      // itself (see beatClock.ts) and must never be used for hold arithmetic.
      // Simulate the exact scenario that broke: BeatClock wraps 95 back to 0 for
      // the callback argument, while the true unwrapped count keeps climbing.
      (getCurrentMeasure as ReturnType<typeof vi.fn>).mockReturnValueOnce(1247);

      const robot = makeRobot({
        batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE,
        job: undefined,
      });
      // A second Active robot so the "never leave zero Active" guard doesn't hold this one back.
      const companion = makeRobot({ id: 'robot-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      startRobotLifecycle(DEFAULT_LOCALE_ID);
      const tickCallback = (subscribeToMeasure as ReturnType<typeof vi.fn>).mock.calls[0][0];
      tickCallback(0); // the wrapped argument BeatClock would actually pass at this instant

      const updated = useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, robot.id);
      expect(updated?.docking).toBe(DockingState.Recalled);
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

    it('drains an Active robot by BATTERY_DRAIN_ACTIVE with no job assigned', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE);
    });

    it('drains every Active robot the same, whatever its melody or note variance (the snapshot carries no job)', () => {
      const a = makeSnapshot({ id: 'a', batteryLevel: 80 });
      const b = makeSnapshot({ id: 'b', batteryLevel: 80, melody: [], noteVariance: { active: true, value: 2 } });
      const [ra, rb] = stepRobotLifecycle([a, b], 10, TEST_NOISE_MAP);
      expect(ra.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
      expect(rb.batteryLevel).toBe(80 - BATTERY_DRAIN_ACTIVE);
    });

    it('floors battery at 0, never negative', () => {
      const snap = makeSnapshot({ batteryLevel: 1 });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(0);
    });

    describe('injectable drain (Phase 43 Tasks 2–3)', () => {
      it('activeDrain, the default, returns BATTERY_DRAIN_ACTIVE for any snapshot', () => {
        expect(activeDrain(makeSnapshot())).toBe(BATTERY_DRAIN_ACTIVE);
        expect(activeDrain(makeSnapshot({ batteryLevel: 3, melody: [] }))).toBe(BATTERY_DRAIN_ACTIVE);
      });

      it('omitting drain is identical to passing activeDrain explicitly', () => {
        const roster = [
          makeSnapshot({ id: 'a', batteryLevel: 40 }),
          makeSnapshot({ id: 'b', batteryLevel: 13 }),
          makeSnapshot({ id: 'c', docking: DockingState.Docked, batteryLevel: 97 }),
        ];
        expect(stepRobotLifecycle(roster, 10, TEST_NOISE_MAP)).toEqual(stepRobotLifecycle(roster, 10, TEST_NOISE_MAP, activeDrain));
      });

      it('an Active robot drains by whatever the injected rule returns', () => {
        const snap = makeSnapshot({ batteryLevel: 80 });
        const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP, () => 3);
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
        stepRobotLifecycle([active, docked, held], 10, TEST_NOISE_MAP, drain);
        expect(seen).toEqual([{ id: 'active', batteryLevel: 80 }]);
      });

      it('still floors at 0 when the rule drains more than the robot has', () => {
        const [result] = stepRobotLifecycle([makeSnapshot({ batteryLevel: 4 })], 10, TEST_NOISE_MAP, () => 6);
        expect(result.batteryLevel).toBe(0);
      });

      it('a smaller drain reaches the critical threshold later — the rule drives recall timing, not just the number', () => {
        const robot = makeSnapshot({ id: 'r', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
        const companion = makeSnapshot({ id: 'companion', batteryLevel: 100 });
        const [byDefault] = stepRobotLifecycle([robot, companion], 10, TEST_NOISE_MAP);
        const [lighter] = stepRobotLifecycle([robot, companion], 10, TEST_NOISE_MAP, () => 2);
        expect(byDefault.docking).toBe(DockingState.Recalled);
        expect(lighter.docking).toBe(DockingState.Active);
      });
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

    it('an Active robot crossing the critical threshold begins Recalled with a hold, not immediate Docked', () => {
      const robot = makeSnapshot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
      const companion = makeSnapshot({ id: 'robot-companion', batteryLevel: 100 });
      const [result] = stepRobotLifecycle([robot, companion], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBeLessThanOrEqual(BATTERY_CRITICAL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Recalled);
      expect(result.dockingHoldUntilMeasure).toBe(11);
    });

    it('the only Active robot stays Active at/under critical battery -- never zero Active robots', () => {
      const onlyActive = makeSnapshot({ batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
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
      const a = makeSnapshot({ id: 'robot-a', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
      const b = makeSnapshot({ id: 'robot-b', batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE });
      const [resultA, resultB] = stepRobotLifecycle([a, b], 10, TEST_NOISE_MAP);
      expect(resultA.docking).toBe(DockingState.Recalled);
      expect(resultB.docking).toBe(DockingState.Active);
    });

    it('a Docked robot reaching full battery begins Undocking with a hold, not immediate Active', () => {
      const snap = makeSnapshot({ docking: DockingState.Docked, batteryLevel: BATTERY_FULL_THRESHOLD - BATTERY_RECHARGE_RATE });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(BATTERY_FULL_THRESHOLD);
      expect(result.docking).toBe(DockingState.Undocking);
      expect(result.dockingHoldUntilMeasure).toBe(21);
    });

    it('an Undocking robot whose hold has elapsed lands on Active, and the replay picks no job (Phase 43: the job is live state)', () => {
      const snap = makeSnapshot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 100 });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
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
      for (const result of stepRobotLifecycle(roster, 5, TEST_NOISE_MAP)) {
        for (const field of ['job', 'octaveRange', 'rhythmicDensity', 'rhythmicMotifLength']) {
          expect(field in result).toBe(false);
        }
      }
    });

    it('a Recalled robot whose hold has elapsed lands on Docked, hold cleared', () => {
      const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
      expect(result.docking).toBe(DockingState.Docked);
      expect(result.dockingHoldUntilMeasure).toBeUndefined();
    });

    it('an Undocking/Recalled robot whose hold has NOT yet elapsed stays put', () => {
      const undocking = makeSnapshot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 50 });
      const recalled = makeSnapshot({ id: 'robot-2', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
      const [resultUndocking, resultRecalled] = stepRobotLifecycle([undocking, recalled], 19, TEST_NOISE_MAP);
      expect(resultUndocking.docking).toBe(DockingState.Undocking);
      expect(resultRecalled.docking).toBe(DockingState.Recalled);
    });

    it('is a pure function of its own arguments -- unaffected by whatever is in the live store', () => {
      // Deliberately leaves the store at its default (no robots matching this snapshot's id at
      // all) to prove stepRobotLifecycle reads nothing from useLocaleStore.
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = stepRobotLifecycle([snap], 10, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE);
    });

    describe('melody drift on Recalled -> Docked landings (Task 4)', () => {
      it('a Recalled -> Docked landing increments dockCycleCount by exactly 1', () => {
        const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0 });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.dockCycleCount).toBe(1);
      });

      it('an Undocking -> Active landing does NOT touch dockCycleCount or melody', () => {
        const originalMelody = makeRobot().melody;
        const snap = makeSnapshot({ docking: DockingState.Undocking, dockingHoldUntilMeasure: 20, batteryLevel: 100, dockCycleCount: 3, melody: originalMelody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.docking).toBe(DockingState.Active);
        expect(result.dockCycleCount).toBe(3);
        expect(result.melody).toEqual(originalMelody);
      });

      it('the drifted melody matches the same seed formula landOnDocked uses live', () => {
        const melody = makeRobot().melody;
        const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);
        expect(result.melody).toEqual(expectedDriftedMelody(melody, 1, snap.noteVariance));
      });

      it('two different robots that each dock once end up with different drifted melodies -- no seed collision', () => {
        const melody = makeRobot().melody;
        const robotA = makeSnapshot({ id: 'robot-a', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody });
        const robotB = makeSnapshot({ id: 'robot-b', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 5, melody });
        const [resultA, resultB] = stepRobotLifecycle([robotA, robotB], 20, TEST_NOISE_MAP);
        expect(resultA.melody).not.toEqual(resultB.melody);
      });

      it('a robot that docks twice applies its second drift on top of the first drift\'s result, not the original melody', () => {
        const originalMelody = makeRobot().melody;
        const afterFirstDock = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, dockCycleCount: 0, melody: originalMelody });
        const [firstResult] = stepRobotLifecycle([afterFirstDock], 20, TEST_NOISE_MAP);
        expect(firstResult.dockCycleCount).toBe(1);

        // Simulate the robot going Active again, then Recalled again, landing on Docked a second time.
        const beforeSecondDock = { ...firstResult, docking: DockingState.Recalled, dockingHoldUntilMeasure: 40 };
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
        const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
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
        const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
        const [result] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);

        // Only e1 (unlocked) is eligible, so the "always changes at least 1" floor could still
        // pick it — but every pitchLocked event must stay byte-identical regardless.
        expect(result.melody.filter((e) => e.pitchLocked).every((e) => e.noteIndex === 0)).toBe(true);
        const lockedChangedCount = result.melody.filter((e, i) => e.pitchLocked && e.noteIndex !== originalMelody[i].noteIndex).length;
        expect(lockedChangedCount).toBe(0);
      });

      it('re-rolls a different subset of pitches on successive dock cycles for the same robot', () => {
        const originalMelody = makeRobot().melody;
        const snap = makeSnapshot({ id: 'drift-robot', docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5, melody: originalMelody });
        const [afterFirst] = stepRobotLifecycle([snap], 20, TEST_NOISE_MAP);

        const beforeSecond = { ...afterFirst, docking: DockingState.Recalled, dockingHoldUntilMeasure: 40 };
        const [afterSecond] = stepRobotLifecycle([beforeSecond], 40, TEST_NOISE_MAP);

        // Not a strict guarantee for any single seed, but across two independent dock cycles the
        // noteIndex arrays should not always be identical.
        const identical = JSON.stringify(afterFirst.melody.map((e) => e.noteIndex)) ===
          JSON.stringify(afterSecond.melody.map((e) => e.noteIndex));
        expect(identical).toBe(false);
      });

      it('a landing transition never sets position/audioMode/state/destination/direction -- RobotLifecycleSnapshot has no such fields to set', () => {
        const snap = makeSnapshot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 20, batteryLevel: 5 });
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
        melody: overrides.melody ?? makeRobot().melody,
        dockCycleCount: overrides.dockCycleCount ?? 0,
        ...overrides,
      };
    }

    it('toMeasure < fromMeasure + 1 is a no-op -- returns the roster unchanged', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const result = replayLifecycle([snap], 10, 10, TEST_NOISE_MAP);
      expect(result).toEqual([snap]);

      const resultBackwards = replayLifecycle([snap], 10, 5, TEST_NOISE_MAP);
      expect(resultBackwards).toEqual([snap]);
    });

    it('replaying N measures matches calling stepRobotLifecycle N times in a hand-written loop', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });

      let handRolled = [snap];
      for (let m = 1; m <= 5; m++) handRolled = stepRobotLifecycle(handRolled, m, TEST_NOISE_MAP);

      const replayed = replayLifecycle([snap], 0, 5, TEST_NOISE_MAP);
      expect(replayed).toEqual(handRolled);
    });

    it('replays measures fromMeasure+1 .. toMeasure inclusive, not fromMeasure itself', () => {
      // Starting exactly at the critical threshold: if measure `10` (fromMeasure) were replayed,
      // one extra drain would apply that shouldn't. Replaying only 11..15 (5 steps) should match
      // 5 hand-rolled steps starting from measure 11.
      const snap = makeSnapshot({ batteryLevel: 90 });
      let handRolled = [snap];
      for (let m = 11; m <= 15; m++) handRolled = stepRobotLifecycle(handRolled, m, TEST_NOISE_MAP);

      const replayed = replayLifecycle([snap], 10, 15, TEST_NOISE_MAP);
      expect(replayed).toEqual(handRolled);
    });

    it('imports neither useLocaleStore nor getCurrentMeasure -- unaffected by whatever is in the live store', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: { ...DEFAULT_LOCALE, robots: [makeRobot({ id: 'unrelated-robot', batteryLevel: 1 })] } } });
      const snap = makeSnapshot({ batteryLevel: 50 });
      const [result] = replayLifecycle([snap], 0, 3, TEST_NOISE_MAP);
      expect(result.batteryLevel).toBe(50 - BATTERY_DRAIN_ACTIVE * 3);
    });

    it('forwards an injected drain to every replayed step (Phase 43 Task 2)', () => {
      const snap = makeSnapshot({ batteryLevel: 50 });
      const flat3 = () => 3;
      let handRolled = [snap];
      for (let m = 1; m <= 4; m++) handRolled = stepRobotLifecycle(handRolled, m, TEST_NOISE_MAP, flat3);

      const replayed = replayLifecycle([snap], 0, 4, TEST_NOISE_MAP, flat3);
      expect(replayed).toEqual(handRolled);
      expect(replayed[0].batteryLevel).toBe(50 - 3 * 4);
    });
  });

  describe('prove-it: replay matches realtime (docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md Task 7)', () => {
    it('N real ticks and one replayLifecycle call converge on identical docking/batteryLevel/dockingHoldUntilMeasure/melody for all 12 robots, exercising both the "never zero Active" invariant and a dock-triggered melody drift', () => {
      // Contrived starting state, not left to chance: robot 0 is the ONLY Active robot, reaching
      // the critical threshold on the last tick -- guarantees the invariant fires (it must stay
      // Active, there's no one else). Robot 1 is already Recalled, still holding the
      // job it was assigned before it was recalled (the real landOnDocked path never clears
      // job -- see docs/ROBOT_LIFECYCLE.md), with its hold elapsing on the very first tick --
      // guarantees both a dock-triggered melody drift AND a non-undefined job survive the landing
      // within the test's window, so an undefined-vs-undefined job comparison can't hide a
      // regression here again. Robots 2-11 are Docked, mid-battery, far from any threshold, so
      // they contribute realistic "nothing special happens" noise without triggering their own
      // transitions and complicating what's being proven.
      // Robot 0 holds a job (Phase 43 Task 3): the replay snapshot no longer carries one, so a job
      // surcharge creeping back into the live tick would make its real battery diverge from replay.
      // It starts exactly REPLAY_MEASURES drains above critical, so it reaches critical on the last
      // tick (invariant fires) without ever flooring at 0 -- a floor would let a surcharged live run
      // and the flat replay converge on 0 and hide the surcharge (found by Task 3's mutation check).
      const REPLAY_MEASURES = 5;
      const robots: Robot[] = [
        makeRobot({
          id: 'prove-it-0',
          docking: DockingState.Active,
          batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE * REPLAY_MEASURES,
          job: JobType.FluidMonitoring,
        }),
        makeRobot({
          id: 'prove-it-1',
          docking: DockingState.Recalled,
          dockingHoldUntilMeasure: 1,
          batteryLevel: 5,
          job: JobType.AcousticSurvey,
        }),
        ...Array.from({ length: MAX_ROBOTS - 2 }, (_, i) =>
          makeRobot({ id: `prove-it-${i + 2}`, docking: DockingState.Docked, batteryLevel: 40 + i, job: undefined }),
        ),
      ];
      expect(robots).toHaveLength(MAX_ROBOTS);

      // Assert the preconditions actually hold before running anything -- not left to chance.
      expect(robots.filter((r) => r.docking === DockingState.Active)).toHaveLength(1);
      expect(robots.find((r) => r.docking === DockingState.Recalled)?.dockingHoldUntilMeasure).toBe(1);

      setupLocaleWithRobots(robots);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      const noiseMap = getLocaleNoiseMap(DEFAULT_LOCALE_ID, locale.coordinates.x, locale.coordinates.y);

      const initialSnapshots: RobotLifecycleSnapshot[] = robots.map((r) => ({
        id: r.id,
        docking: r.docking,
        batteryLevel: r.batteryLevel,
        dockingHoldUntilMeasure: r.dockingHoldUntilMeasure,
        melody: r.melody,
        dockCycleCount: 0, // fresh ids, never docked before in this test file
        noteVariance: r.noteVariance,
      }));

      for (let m = 1; m <= REPLAY_MEASURES; m++) tickRobotLifecycle(DEFAULT_LOCALE_ID, m);
      const realtimeResult = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;

      const replayResult = replayLifecycle(initialSnapshots, 0, REPLAY_MEASURES, noiseMap);

      // The invariant actually fired: robot 0 stayed Active despite reaching critical battery
      // (exactly critical -- above the 0 floor, so the battery comparison below is meaningful).
      const realtimeRobot0 = realtimeResult.find((r) => r.id === 'prove-it-0')!;
      expect(realtimeRobot0.docking).toBe(DockingState.Active);
      expect(realtimeRobot0.batteryLevel).toBe(BATTERY_CRITICAL_THRESHOLD);
      // The drift actually fired: robot 1 landed on Docked with a melody different from its start.
      // Its job survives the landing untouched -- the real landOnDocked path never clears it.
      const realtimeRobot1 = realtimeResult.find((r) => r.id === 'prove-it-1')!;
      expect(realtimeRobot1.docking).toBe(DockingState.Docked);
      expect(realtimeRobot1.melody).not.toEqual(robots[1].melody);
      expect(realtimeRobot1.job).toEqual(robots[1].job);

      for (const robot of robots) {
        const real = realtimeResult.find((r) => r.id === robot.id)!;
        const replayed = replayResult.find((r) => r.id === robot.id)!;
        expect(replayed.docking).toBe(real.docking);
        expect(replayed.batteryLevel).toBe(real.batteryLevel);
        expect(replayed.dockingHoldUntilMeasure).toBe(real.dockingHoldUntilMeasure);
        expect(replayed.melody).toEqual(real.melody);
      }
    });
  });
});
