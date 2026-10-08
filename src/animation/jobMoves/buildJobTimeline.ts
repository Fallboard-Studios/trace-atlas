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
import { RING_SEGMENTS, addRing, addSparkFlicker, ringRadius, ringRoute, ringStartAngles, sparkChords } from './ring';
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

/** What every move of one job run reads: the site, the locked orbiters (slot order) and how this
 *  robot works (variation.ts). */
interface WorkContext {
  site: JobTimelineInput['site'];
  orbiters: readonly Element[];
  /** Each orbiter's corner, by slot. */
  shown: readonly OrbiterCorner[];
  /** Each orbiter's turn, by slot (`turnRanks`). */
  ranks: readonly number[];
  variation: WorkVariation;
  restScales: readonly number[];
  restOpacities: readonly number[];
}

/** One step, planned: each orbiter's route in scene units, in slot order (its first vertex is
 *  where the step's approach flies it), and the move's tweens over [start, end], given those
 *  routes mapped into each orbiter's local frame. */
interface PlannedStep {
  routes: Vec2[][];
  add(tl: gsap.core.Timeline, localRoutes: readonly (readonly Vec2[])[], start: number, end: number): void;
}

// ========================================
// CONSTANTS
// ========================================
/** Reduced motion: the robot's opacity dips to this and back once per bob cycle (spec §1.9). */
const REDUCED_PULSE_OPACITY = 0.8;

// ========================================
// HELPERS
// ========================================
/** The one place a move's targets and tweens are picked. The return type makes it exhaustive:
 *  a move missing here is a type error. */
function planStep(step: MoveStep, w: WorkContext): PlannedStep {
  const count = w.orbiters.length;
  const v = w.variation;
  switch (step.move) {
    case 'hoverPulse':
      return {
        routes: hoverPulseTargets(stepPoint(w.site, step.point), count, v.phase).map((target) => [target]),
        add: (tl, _local, start, end) => addHoverPulse(tl, w.orbiters, w.restScales, start, end, w.ranks),
      };
    case 'fan':
      return {
        routes: fanTargets(stepPoint(w.site, step.point), count).map((target) => [target]),
        add: (tl, _local, start, end) => addFan(tl, w.orbiters, w.restScales, start, end, w.ranks),
      };
    case 'trace': {
      const route = traceRoute(stepPath(w.site, step.path), v.traceReversed);
      return {
        routes: w.orbiters.map(() => route),
        add: (tl, local, start, end) => addTrace(tl, w.orbiters, local, w.ranks, start, end),
      };
    }
    case 'ring': {
      const radius = ringRadius(v.radiusScale);
      const centre = stepPoint(w.site, step.point);
      return {
        routes: ringStartAngles(count, v.phase).map((a) => ringRoute(centre, radius, a, v.ringDirection)),
        add: (tl, local, start, end) => {
          addRing(tl, w.orbiters, local, start, end);
          if (!step.flicker) return;
          const chords = w.shown.map((corner) => sparkChords(v.sparks[corner], RING_SEGMENTS));
          addSparkFlicker(tl, w.orbiters, chords, w.restOpacities, start, end, RING_SEGMENTS);
        },
      };
    }
    case 'carry':
      return {
        routes: carryTargets(stepPoint(w.site, step.from), stepPoint(w.site, step.to), count).map((p) => [p.from, p.to]),
        add: (tl, local, start, end) => addCarry(tl, w.orbiters, local, w.restScales, start, end),
      };
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
  const work: WorkContext = {
    site,
    orbiters,
    shown,
    ranks: turnRanks(variation.order, shown),
    variation,
    restScales: orbiters.map((el) => Number(gsap.getProperty(el, 'scale'))),
    restOpacities: orbiters.map((el) => Number(gsap.getProperty(el, 'opacity'))),
  };
  const s = bodyScale * layerScale;
  const toLocal = (route: Vec2[], j: number) =>
    route.map((p) => sceneToOrbiterLocal(p, { robotPos: robot.position, gem, bodyScale, layerScale, corner: shown[j] }));

  tl.add(bob(robotEl, robot.position.y, BOB_PX, cycle, cycles), 0);
  orbiters.forEach((el) => tl.add(bob(el.parentElement!, 0, -BOB_PX / s, cycle, cycles), 0));

  const steps = JOB_MOVES[job];
  const windows = moveWindows(steps.length, duration);
  steps.forEach((step, k) => {
    const { approach, start, end } = windows[k];
    const planned = planStep(step, work);
    const localRoutes = planned.routes.map(toLocal);

    // The approach: from the dock (the detach) or from where the last move left the orbiter.
    orbiters.forEach((el, j) => {
      const first = localRoutes[j][0];
      tl.to(el, { x: first.x, y: first.y, duration: start - approach, ease: 'sine.inOut' }, approach);
    });

    planned.add(tl, localRoutes, start, end);
  });

  orbiters.forEach((el) => {
    tl.to(el, { x: 0, y: 0, duration: ATTACH_DURATION, ease: 'sine.inOut' }, duration - ATTACH_DURATION);
  });
}
