// ========================================
// buildJobTimeline (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================
// One paused timeline per job run, keyed `work-${robotId}`, lasting exactly jobDuration(bpm):
// the robot bobs in whole cycles; the locked orbiters detach to the move's targets
// (ATTACH_DURATION), work, and reattach to their docks (ATTACH_DURATION), all inside the duration.
// J2 ships one move, so every job runs hoverPulse on the site's first point. J3 adds the rest.
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
import { addHoverPulse, hoverPulseTargets } from './hoverPulse';
import { sceneToOrbiterLocal, type OrbiterCorner } from './sceneToOrbiterLocal';
import { setTimeline } from '../timelineMap';
import { getRobotGem } from '../../components/robot/gem/polygon';
import { orbiterPlan, ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { BOB_CYCLE_SECONDS, BOB_PX } from '../../constants';
import type { JobType, Robot } from '../../types/Robot';
import type { WorkSite } from '../../systems/workSites';

// ========================================
// TYPES
// ========================================
export interface JobTimelineInput {
  robot: Pick<Robot, 'id' | 'position' | 'gemSeed'>;
  /** The robot's `.robot` group (`getRef(\`robot-${id}\`)`), at `robot.position`. */
  robotEl: Element;
  site: Pick<WorkSite, 'points'>;
  /** Picks the moves. J2: every job falls back to hoverPulse. */
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

/** The bob, the detach, the move and the reattach. The move ends every orbiter at its rest
 *  scale, so the reattach only flies it home. */
function addWork(
  tl: gsap.core.Timeline,
  { robot, robotEl, site, orbiters, bodyScale, layerScale }: JobTimelineInput,
  duration: number,
  cycle: number,
  cycles: number,
): void {
  const gem = getRobotGem(robot.gemSeed);
  const { cornerOrder } = orbiterPlan(robot.gemSeed);
  const s = bodyScale * layerScale;
  const workStart = ATTACH_DURATION;
  const workEnd = duration - ATTACH_DURATION;

  tl.add(bob(robotEl, robot.position.y, BOB_PX, cycle, cycles), 0);

  const targets = hoverPulseTargets(site.points[0], orbiters.length);
  orbiters.forEach((el, j) => {
    const corner = cornerOrder[j] as OrbiterCorner;
    const local = sceneToOrbiterLocal(targets[j], { robotPos: robot.position, gem, bodyScale, layerScale, corner });
    tl.add(bob(el.parentElement!, 0, -BOB_PX / s, cycle, cycles), 0);
    tl.to(el, { x: local.x, y: local.y, duration: ATTACH_DURATION, ease: 'sine.inOut' }, 0);
    tl.to(el, { x: 0, y: 0, duration: ATTACH_DURATION, ease: 'sine.inOut' }, workEnd);
  });
  const restScales = orbiters.map((el) => Number(gsap.getProperty(el, 'scale')));
  addHoverPulse(tl, orbiters, restScales, workStart, workEnd);
}
