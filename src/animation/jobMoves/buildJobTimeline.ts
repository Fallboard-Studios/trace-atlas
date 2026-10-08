// ========================================
// buildJobTimeline (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================
// One paused timeline per job run, keyed `work-${robotId}`, lasting exactly jobDuration(bpm):
// the robot bobs in whole cycles; the locked orbiters detach to the first move's targets
// (ATTACH_DURATION), run the job's moves (JOB_MOVES, each in its moveWindows slice, flying to the
// next move's first targets between them), and reattach to their docks (ATTACH_DURATION), all
// inside the duration. Each robot does its moves its own way (variation.ts: turn order, phase,
// ring direction and radius, trace direction, sparks).
//
// The orbiters sit inside the `.robot` group, so the bob would carry them off their targets. Each
// orbiter's `.gem__orbiter` copy group (which useOrbiterMotion only shows and hides) gets the same
// bob, inverted and divided by the gem scale, so a detached orbiter holds still in the scene.
// The bob is zero at both ends, so the docked orbiters still ride with the body.
//
// Animation only: callbacks are the caller's `onComplete`, never AudioEngine (Strict Separation).
// The caller locks the orbiters before and unlocks them in `onComplete`.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import { jobDuration } from './jobDuration';
import { JOB_MOVES, moveWindows, stepPath, stepPoint, type MoveStep } from './jobMoveTable';
import { addHoverPulse, hoverPulseTargets } from './hoverPulse';
import { addTrace, traceRoute } from './trace';
import { addRing, addSparkFlicker, ringRadius, ringRoute, ringStartAngles, sparkChords } from './ring';
import { addCarry, carryTargets } from './carry';
import { addFan, fanTargets } from './fan';
import { turnRanks, workVariation, type WorkVariation } from './variation';
import { sceneToOrbiterLocal, type OrbiterCorner } from './sceneToOrbiterLocal';
import { setTimeline } from '../timelineMap';
import { getRobotGem } from '../../components/robot/gem/polygon';
import { orbiterPlan, ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { BOB_CYCLE_SECONDS, BOB_PX } from '../../constants';
import type { JobType, Robot } from '../../types/Robot';
import type { Vec2 } from '../../types/Vec2';
import type { WorkSite } from '../../systems/workSites';

// ========================================
// TYPES
// ========================================
export interface JobTimelineInput {
  robot: Pick<Robot, 'id' | 'position' | 'gemSeed'>;
  /** The robot's `.robot` group (`getRef(\`robot-${id}\`)`), at `robot.position`. */
  robotEl: Element;
  site: Pick<WorkSite, 'points' | 'paths'>;
  /** Picks the moves (`JOB_MOVES`). */
  job: JobType;
  /** `getOrbiterWork(id).lock()` — the shown `.gem__orbiter-local` groups, at rest, in cornerOrder. */
  orbiters: readonly Element[];
  /** The live transport tempo at job start. */
  bpm: number;
  bodyScale: number;
  layerScale: number;
  reducedMotion: boolean;
  onComplete: () => void;
}

// ========================================
// CONSTANTS
// ========================================
/** Reduced motion: the robot's opacity dips to this and back once per bob cycle (spec §1.9). */
const REDUCED_PULSE_OPACITY = 0.8;

// ========================================
// HELPERS
// ========================================
/** Each orbiter's route for one step, in scene units, in slot order; its first vertex is where
 *  the step's approach (the detach, for the first step) flies it. */
function sceneRoutes(step: MoveStep, site: JobTimelineInput['site'], count: number, v: WorkVariation): Vec2[][] {
  switch (step.move) {
    case 'hoverPulse':
      return hoverPulseTargets(stepPoint(site, step.point), count, v.phase).map((target) => [target]);
    case 'fan':
      return fanTargets(stepPoint(site, step.point), count).map((target) => [target]);
    case 'trace': {
      const route = traceRoute(stepPath(site, step.path), v.traceReversed);
      return Array.from({ length: count }, () => route);
    }
    case 'ring': {
      const radius = ringRadius(v.radiusScale);
      const centre = stepPoint(site, step.point);
      return ringStartAngles(count, v.phase).map((a) => ringRoute(centre, radius, a, v.ringDirection));
    }
    case 'carry':
      return carryTargets(stepPoint(site, step.from), stepPoint(site, step.to), count).map((p) => [p.from, p.to]);
  }
}

/** One sine cycle on `y` about `base` (up by `amp`, down by `amp`, back), repeated `cycles` times. */
function bob(el: Element, base: number, amp: number, cycle: number, cycles: number): gsap.core.Timeline {
  const q = cycle / 4;
  return gsap
    .timeline({ repeat: cycles - 1 })
    .to(el, { y: base - amp, duration: q, ease: 'sine.out' })
    .to(el, { y: base + amp, duration: 2 * q, ease: 'sine.inOut' })
    .to(el, { y: base, duration: q, ease: 'sine.in' });
}

// ========================================
// EXPORTS
// ========================================
export function buildJobTimeline(input: JobTimelineInput): gsap.core.Timeline {
  const duration = jobDuration(input.bpm);
  const cycles = Math.round(duration / BOB_CYCLE_SECONDS); // ≥ 5: jobs last 6–10 s
  const cycle = duration / cycles;
  const tl = gsap.timeline({ paused: true, onComplete: input.onComplete });

  if (input.reducedMotion) addReducedPulse(tl, input.robotEl, cycle, cycles);
  else addWork(tl, input, duration, cycle, cycles);

  setTimeline(`work-${input.robot.id}`, tl);
  return tl;
}

// ========================================
// STAGES
// ========================================
/** Reduced motion: the robot's opacity dips to REDUCED_PULSE_OPACITY and back once per cycle,
 *  in place. No bob, and the orbiters stay docked. */
function addReducedPulse(tl: gsap.core.Timeline, robotEl: Element, cycle: number, cycles: number): void {
  tl.add(
    gsap.timeline({ repeat: cycles - 1 })
      .to(robotEl, { opacity: REDUCED_PULSE_OPACITY, duration: cycle / 2, ease: 'sine.inOut' })
      .to(robotEl, { opacity: 1, duration: cycle / 2, ease: 'sine.inOut' }),
    0,
  );
}

/** The bob, the detach, the job's moves and the reattach. Every move ends each orbiter at its
 *  rest scale and opacity, so the reattach only flies it home. */
function addWork(
  tl: gsap.core.Timeline,
  { robot, robotEl, site, job, orbiters, bodyScale, layerScale }: JobTimelineInput,
  duration: number,
  cycle: number,
  cycles: number,
): void {
  const gem = getRobotGem(robot.gemSeed);
  const shown = orbiterPlan(robot.gemSeed).cornerOrder.slice(0, orbiters.length) as OrbiterCorner[];
  const variation = workVariation(robot.gemSeed);
  const ranks = turnRanks(variation.order, shown);
  const restScales = orbiters.map((el) => Number(gsap.getProperty(el, 'scale')));
  const restOpacities = orbiters.map((el) => Number(gsap.getProperty(el, 'opacity')));
  const s = bodyScale * layerScale;
  const toLocal = (route: Vec2[], j: number) =>
    route.map((p) => sceneToOrbiterLocal(p, { robotPos: robot.position, gem, bodyScale, layerScale, corner: shown[j] }));

  tl.add(bob(robotEl, robot.position.y, BOB_PX, cycle, cycles), 0);
  orbiters.forEach((el) => tl.add(bob(el.parentElement!, 0, -BOB_PX / s, cycle, cycles), 0));

  const steps = JOB_MOVES[job];
  const windows = moveWindows(steps.length, duration);
  steps.forEach((step, k) => {
    const { approach, start, end } = windows[k];
    const localRoutes = sceneRoutes(step, site, orbiters.length, variation).map(toLocal);

    // The approach: from the dock (the detach) or from where the last move left the orbiter.
    orbiters.forEach((el, j) => {
      const first = localRoutes[j][0];
      tl.to(el, { x: first.x, y: first.y, duration: start - approach, ease: 'sine.inOut' }, approach);
    });

    switch (step.move) {
      case 'hoverPulse':
        addHoverPulse(tl, orbiters, restScales, start, end, ranks);
        break;
      case 'fan':
        addFan(tl, orbiters, restScales, start, end, ranks);
        break;
      case 'trace':
        addTrace(tl, orbiters, localRoutes, ranks, start, end);
        break;
      case 'ring':
        addRing(tl, orbiters, localRoutes, start, end);
        if (step.flicker && orbiters.length > 0) {
          const segments = localRoutes[0].length - 1;
          const chords = shown.map((corner) => sparkChords(variation.sparks[corner], segments));
          addSparkFlicker(tl, orbiters, chords, restOpacities, start, end, segments);
        }
        break;
      case 'carry':
        addCarry(tl, orbiters, localRoutes, restScales, start, end);
        break;
    }
  });

  orbiters.forEach((el) => {
    tl.to(el, { x: 0, y: 0, duration: ATTACH_DURATION, ease: 'sine.inOut' }, duration - ATTACH_DURATION);
  });
}
