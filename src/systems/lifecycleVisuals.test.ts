// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { onLifecycleChange, scoreJobAffinities, assignJob } from './lifecycleVisuals';
import { tickRobotLifecycle } from './robotSystems';
import { getDockCycleCount, recordDockLanding } from './dockCycles';
import { generateSpawnPosition } from './spawnSystem';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { DockingState, JobType, RobotState } from '../types/Robot';
import type { Robot } from '../types/Robot';
import { BATTERY_CRITICAL_THRESHOLD, BATTERY_DRAIN_ACTIVE, JOB_MAX_ROBOTS_PER_TYPE } from '../constants';

// ========================================
// MOCKS
// ========================================

// handleRobotIdle has real GSAP/SVG-ref side effects (createSwimTimeline) that
// are already covered by idleSystem's own tests — mock it here so the adapter's
// tests assert only "was it invoked", not idleSystem's internals.
vi.mock('./idleSystem', () => ({
  handleRobotIdle: vi.fn(),
  pickExitDestination: vi.fn(() => ({ x: -150, y: 300 })),
}));
import { handleRobotIdle, pickExitDestination } from './idleSystem';

// createSwimTimeline has real GSAP/SVG-ref side effects — mock it here so these
// tests assert only "was an exit swim started, toward what", not GSAP internals.
vi.mock('../animation/swimAnimation', () => ({
  createSwimTimeline: vi.fn(),
}));
import { createSwimTimeline } from '../animation/swimAnimation';

vi.mock('../engine/beatClock', () => ({
  subscribeToMeasure: vi.fn(() => vi.fn()),
  getCurrentMeasure: vi.fn(() => 42),
}));

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

function getRobot(id: string): Robot | undefined {
  return useLocaleStore.getState().getRobotById(DEFAULT_LOCALE_ID, id);
}

function localeNoiseMap() {
  const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
  return getLocaleNoiseMap(DEFAULT_LOCALE_ID, locale.coordinates.x, locale.coordinates.y);
}

const VENT_PROFILE = {
  octaveRange: [1, 2] as [number, number],
  rhythmicDensity: 90,
  rhythmicMotifLength: { active: true, value: 2 },
  noteVariance: { active: true, value: 2 },
};

// ========================================
// TESTS
// ========================================

describe('lifecycleVisuals — the legacy adapter behind onLifecycleChange (Phase 43 Task 5)', () => {
  beforeEach(() => {
    useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    vi.clearAllMocks();
  });

  describe("'recalled' — the exit swim", () => {
    it('begins swimming the robot off-screen from where it stands, rather than freezing in place', () => {
      const robot = makeRobot({ id: 'swimmer', position: { x: 960, y: 540 }, docking: DockingState.Recalled });
      setupLocaleWithRobots([robot]);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'recalled');

      expect(pickExitDestination).toHaveBeenCalledWith(robot.position);
      expect(createSwimTimeline).toHaveBeenCalledTimes(1);
      const [swimRobotArg, destinationArg] = (createSwimTimeline as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(swimRobotArg.id).toBe(robot.id);
      expect(swimRobotArg.position).toEqual({ x: 960, y: 540 });
      expect(destinationArg).toEqual({ x: -150, y: 300 }); // mocked pickExitDestination's fixed return

      const updated = getRobot(robot.id);
      expect(updated?.state).toBe(RobotState.Moving);
      expect(updated?.destination).toEqual({ x: -150, y: 300 });
    });

    it('keeps the robot facing its current direction on exit — a bottom-only exit has no horizontal component to flip toward', () => {
      const robot = makeRobot({ direction: 'left', docking: DockingState.Recalled });
      setupLocaleWithRobots([robot]);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'recalled');

      expect(getRobot(robot.id)?.direction).toBe('left');
    });

    it('writes visuals only — docking, hold and battery are the tick\'s, left untouched', () => {
      const robot = makeRobot({ docking: DockingState.Recalled, dockingHoldUntilMeasure: 11, batteryLevel: 9 });
      setupLocaleWithRobots([robot]);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'recalled');

      const updated = getRobot(robot.id);
      expect(updated?.docking).toBe(DockingState.Recalled);
      expect(updated?.dockingHoldUntilMeasure).toBe(11);
      expect(updated?.batteryLevel).toBe(9);
    });
  });

  describe("'active' — job + idle restart", () => {
    it('assigns a job', () => {
      const robot = makeRobot({ job: undefined });
      setupLocaleWithRobots([robot]);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'active');

      expect(Object.values(JobType)).toContain(getRobot(robot.id)?.job);
    });

    it('restarts idle wandering via handleRobotIdle, flagged as a return so the first destination stays in the bottom half', () => {
      const robot = makeRobot({ job: undefined });
      setupLocaleWithRobots([robot]);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'active');

      expect(handleRobotIdle).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, robot.id, { isReturning: true });
    });

    it('assigns the job before restarting wandering (today\'s order)', () => {
      const robot = makeRobot({ job: undefined });
      setupLocaleWithRobots([robot]);
      let jobAtIdleRestart: Robot['job'] = undefined;
      (handleRobotIdle as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        jobAtIdleRestart = getRobot(robot.id)?.job;
      });

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'active');

      expect(jobAtIdleRestart).toBeDefined();
    });
  });

  describe("'docked' — the off-screen dock position", () => {
    it('repositions the robot off-screen (outside the world bounds)', () => {
      const robot = makeRobot({ id: 'dock-offscreen', docking: DockingState.Docked, position: { x: 500, y: 500 } });
      setupLocaleWithRobots([robot]);
      recordDockLanding(robot.id);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'docked');

      const updated = getRobot(robot.id);
      const outsideX = (updated?.position.x ?? 0) < 0 || (updated?.position.x ?? 0) > 1920;
      const outsideY = (updated?.position.y ?? 0) < 0 || (updated?.position.y ?? 0) > 1080;
      expect(outsideX || outsideY).toBe(true);
    });

    it('seeds the position from the robot\'s current dock cycle — exactly the formula landOnDocked used before the move', () => {
      const robot = makeRobot({ id: 'dock-seeded', docking: DockingState.Docked });
      setupLocaleWithRobots([robot]);
      const noiseMap = localeNoiseMap();

      recordDockLanding(robot.id);
      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'docked');
      const first = getRobot(robot.id)!.position;
      expect(first).toEqual(generateSpawnPosition(noiseMap, getDockCycleCount(robot.id)));

      recordDockLanding(robot.id);
      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'docked');
      const second = getRobot(robot.id)!.position;
      expect(second).toEqual(generateSpawnPosition(noiseMap, getDockCycleCount(robot.id)));
      expect(second).not.toEqual(first); // successive dock cycles sample different noise rows
    });

    it('settles state back to Idle and clears destination — the exit swim left it Moving, and a later handleRobotIdle would otherwise be blocked by its own state===Idle guard', () => {
      const robot = makeRobot({ docking: DockingState.Docked, state: RobotState.Moving, destination: { x: -150, y: 300 } });
      setupLocaleWithRobots([robot]);
      recordDockLanding(robot.id);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'docked');

      const updated = getRobot(robot.id);
      expect(updated?.state).toBe(RobotState.Idle);
      expect(updated?.destination).toBeNull();
    });

    it('does not advance the dock cycle itself — robotSystems owns the counter (it seeds pitch drift)', () => {
      const robot = makeRobot({ id: 'dock-counter-owner', docking: DockingState.Docked });
      setupLocaleWithRobots([robot]);
      recordDockLanding(robot.id);

      onLifecycleChange(DEFAULT_LOCALE_ID, robot.id, 'docked');

      expect(getDockCycleCount(robot.id)).toBe(1);
    });
  });

  describe('a robot that is not in the locale', () => {
    it.each(['recalled', 'active', 'docked'] as const)("'%s' is a silent no-op", (to) => {
      setupLocaleWithRobots([]);

      expect(() => onLifecycleChange(DEFAULT_LOCALE_ID, 'ghost', to)).not.toThrow();
      expect(createSwimTimeline).not.toHaveBeenCalled();
      expect(handleRobotIdle).not.toHaveBeenCalled();
      expect(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots).toEqual([]);
    });

    it('an unknown locale is a silent no-op too', () => {
      expect(() => onLifecycleChange('no-such-locale', 'ghost', 'docked')).not.toThrow();
      expect(() => onLifecycleChange('no-such-locale', 'ghost', 'active')).not.toThrow();
      expect(handleRobotIdle).not.toHaveBeenCalled();
    });
  });

  describe('end to end through the real tick (behaviour parity with the pre-seam landing effects)', () => {
    it('a full Active → Recalled → Docked → Undocking → Active cycle swims out, docks off-screen at the dock-cycle position, then reassigns a job and wanders again', () => {
      const robot = makeRobot({ id: 'parity-robot', position: { x: 700, y: 400 }, batteryLevel: BATTERY_CRITICAL_THRESHOLD + BATTERY_DRAIN_ACTIVE, job: undefined });
      const companion = makeRobot({ id: 'parity-companion', batteryLevel: 100, job: undefined });
      setupLocaleWithRobots([robot, companion]);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 10); // crosses critical → Recalled
      expect(getRobot(robot.id)?.docking).toBe(DockingState.Recalled);
      expect(createSwimTimeline).toHaveBeenCalledTimes(1);
      expect(getRobot(robot.id)?.state).toBe(RobotState.Moving);

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 11); // hold elapses → Docked
      const docked = getRobot(robot.id)!;
      expect(docked.docking).toBe(DockingState.Docked);
      expect(docked.state).toBe(RobotState.Idle);
      expect(docked.position).toEqual(generateSpawnPosition(localeNoiseMap(), getDockCycleCount(robot.id)));
      expect(getDockCycleCount(robot.id)).toBe(1);

      useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robot.id, { batteryLevel: 100 });
      tickRobotLifecycle(DEFAULT_LOCALE_ID, 12); // full → Undocking (no visual)
      expect(getRobot(robot.id)?.docking).toBe(DockingState.Undocking);
      expect(handleRobotIdle).not.toHaveBeenCalled();

      tickRobotLifecycle(DEFAULT_LOCALE_ID, 13); // hold elapses → Active
      expect(getRobot(robot.id)?.docking).toBe(DockingState.Active);
      expect(Object.values(JobType)).toContain(getRobot(robot.id)?.job);
      expect(handleRobotIdle).toHaveBeenCalledWith(DEFAULT_LOCALE_ID, robot.id, { isReturning: true });
    });
  });

  describe('scoreJobAffinities (moved from robotSystems)', () => {
    function highest(robot: Robot) {
      const scores = scoreJobAffinities(robot);
      return (Object.keys(scores) as (keyof typeof scores)[]).sort((a, b) => scores[b] - scores[a])[0];
    }

    it('scores Vent Extraction highest for a low-register, dense, low-variance robot', () => {
      expect(highest(makeRobot(VENT_PROFILE))).toBe(JobType.VentExtraction);
    });

    it('scores Acoustic Survey highest for a high-register, sparse, unrestricted-variance robot', () => {
      const robot = makeRobot({
        octaveRange: [6, 7],
        rhythmicDensity: 20,
        rhythmicMotifLength: { active: false, value: 0 },
        noteVariance: { active: false, value: 0 },
      });
      expect(highest(robot)).toBe(JobType.AcousticSurvey);
    });

    it('scores Structural Inspection highest for a wide-span robot with a mid-length motif', () => {
      const robot = makeRobot({
        octaveRange: [1, 7],
        rhythmicDensity: 70,
        rhythmicMotifLength: { active: true, value: 6 },
        noteVariance: { active: false, value: 0 },
      });
      expect(highest(robot)).toBe(JobType.StructuralInspection);
    });

    it('scores Fluid Monitoring highest for a mid-register, default-density robot', () => {
      const robot = makeRobot({
        rhythmicDensity: 50,
        rhythmicMotifLength: { active: true, value: 8 },
        noteVariance: { active: false, value: 0 },
      });
      expect(highest(robot)).toBe(JobType.FluidMonitoring);
    });

    it('Fluid Monitoring score is higher for a robot with default (inactive) noteVariance than an otherwise-identical robot with highly active, narrow variance', () => {
      const base = { octaveRange: [3, 4] as [number, number], rhythmicDensity: 50, rhythmicMotifLength: { active: true, value: 8 } };
      const defaultScore = scoreJobAffinities(makeRobot({ ...base, noteVariance: { active: false, value: 0 } }))[JobType.FluidMonitoring];
      const narrowScore = scoreJobAffinities(makeRobot({ ...base, noteVariance: { active: true, value: 2 } }))[JobType.FluidMonitoring];
      expect(defaultScore).toBeGreaterThan(narrowScore);
    });

    it('Fluid Monitoring does not tie with Structural Inspection for a wide-octave-span robot whose average happens to be mid-register', () => {
      // octaveRange [1,7] averages to a "mid" 4 — Fluid Monitoring's register check alone would
      // wrongly reward this even though the wide span is exactly Structural Inspection's profile.
      const scores = scoreJobAffinities(makeRobot({
        octaveRange: [1, 7],
        rhythmicDensity: 70,
        rhythmicMotifLength: { active: true, value: 6 },
        noteVariance: { active: false, value: 0 },
      }));
      expect(scores[JobType.StructuralInspection]).toBeGreaterThan(scores[JobType.FluidMonitoring]);
    });

    it('is deterministic — same robot attributes in, same scores out', () => {
      const robot = makeRobot({ octaveRange: [2, 5], rhythmicDensity: 65 });
      expect(scoreJobAffinities(robot)).toEqual(scoreJobAffinities(robot));
    });

    it('scores only the four legacy job types — Salvage and Maintenance wait for the work loop (Phase 43 Task 4)', () => {
      const scores = scoreJobAffinities(makeRobot());
      expect(Object.keys(scores).sort()).toEqual(
        [JobType.VentExtraction, JobType.AcousticSurvey, JobType.StructuralInspection, JobType.FluidMonitoring].sort(),
      );
      for (const score of Object.values(scores)) expect(Number.isFinite(score)).toBe(true);
    });
  });

  describe('assignJob (moved from robotSystems)', () => {
    it('assigns the highest-scoring job type when no cap is in play — the bare type', () => {
      const robot = makeRobot({ id: 'vent-robot', ...VENT_PROFILE, job: undefined });
      setupLocaleWithRobots([robot]);

      assignJob(DEFAULT_LOCALE_ID, robot.id);

      expect(getRobot(robot.id)?.job).toBe(JobType.VentExtraction);
    });

    it('respects JOB_MAX_ROBOTS_PER_TYPE — a 4th same-profile robot gets its next-best available type', () => {
      const alreadyAssigned = Array.from({ length: JOB_MAX_ROBOTS_PER_TYPE }, (_, i) =>
        makeRobot({ id: `vent-${i}`, ...VENT_PROFILE, job: JobType.VentExtraction }),
      );
      const newcomer = makeRobot({ id: 'vent-overflow', ...VENT_PROFILE, job: undefined });
      setupLocaleWithRobots([...alreadyAssigned, newcomer]);

      assignJob(DEFAULT_LOCALE_ID, newcomer.id);

      const job = getRobot(newcomer.id)?.job;
      expect(job).not.toBe(JobType.VentExtraction);
      expect([JobType.AcousticSurvey, JobType.StructuralInspection, JobType.FluidMonitoring]).toContain(job);
    });

    it('never picks Salvage or Maintenance, even with every scored type at the cap — falls back to the top-scoring of the four', () => {
      const scored = [JobType.VentExtraction, JobType.AcousticSurvey, JobType.StructuralInspection, JobType.FluidMonitoring];
      const capped = scored.flatMap((type) =>
        Array.from({ length: JOB_MAX_ROBOTS_PER_TYPE }, (_, i) => makeRobot({ id: `${type}-${i}`, docking: DockingState.Active, job: type })),
      );
      const newcomer = makeRobot({ id: 'overflow', ...VENT_PROFILE, job: undefined });
      setupLocaleWithRobots([...capped, newcomer]);

      assignJob(DEFAULT_LOCALE_ID, newcomer.id);

      expect(getRobot(newcomer.id)?.job).toBe(JobType.VentExtraction);
    });

    it('counts only Active robots toward the cap — a Docked robot holding a stale job does not block it', () => {
      const stale = Array.from({ length: JOB_MAX_ROBOTS_PER_TYPE }, (_, i) =>
        makeRobot({ id: `stale-${i}`, docking: DockingState.Docked, job: JobType.VentExtraction }),
      );
      const newcomer = makeRobot({ id: 'vent-fresh', ...VENT_PROFILE, job: undefined });
      setupLocaleWithRobots([...stale, newcomer]);

      assignJob(DEFAULT_LOCALE_ID, newcomer.id);

      expect(getRobot(newcomer.id)?.job).toBe(JobType.VentExtraction);
    });
  });
});
