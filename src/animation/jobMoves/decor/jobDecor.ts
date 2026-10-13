// ========================================
// jobDecor (docs/specs/JOB_DECORATION.md §1.1, Task 6)
// ========================================
// The run of a job's decoration: one `<g class="robot__work">` appended to the robot's `.robot__row`
// after `g.gem` (so it draws over the body and the orbiters, scales with the back row for free and
// unmounts with the robot), created when a job starts and removed when it ends or is killed. Idle
// robots carry none.
//
// This file owns the container only: the group, its `<defs>`, the counter-bob that holds a wire
// anchored to a site point still while the body bobs, the row-local frame, and the cleanup. What is
// drawn inside is a per-job builder (DECOR_BUILDERS), each a pure state function plus an `add…` that
// creates its nodes once and calls `ctx.run` for its one proxy tween.
//
// Animation only: nothing here touches AudioEngine, BeatClock or a store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import { bob } from '../bob';
import type { JobTimelineInput } from '../buildJobTimeline';
import type { OrbiterCorner } from '../sceneToOrbiterLocal';
import type { WorkVariation } from '../variation';
import type { DecorTier } from './decorTier';
import type { MoveEvents } from './events';
import { sceneToRowLocal } from './frames';
import { addMaintenanceDecor } from './maintenanceDecor';
import { svgEl } from './svg';
import type { RobotGem } from '../../../components/robot/gem/polygon';
import { BOB_PX } from '../../../constants';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
/** What `addWork` already knows about the run when the moves and the reattach are on the timeline. */
export interface DecorRun {
  input: JobTimelineInput;
  gem: RobotGem;
  /** Each locked orbiter's corner, by slot. */
  shown: readonly OrbiterCorner[];
  variation: WorkVariation;
  /** One entry per move, in table order. */
  events: readonly MoveEvents[];
  /** The job's length, seconds: jobDuration(bpm). */
  duration: number;
  /** The bob: whole cycles of `cycle` seconds fitting the job. */
  cycle: number;
  cycles: number;
}

/** What a job's builder draws with. */
export interface DecorContext {
  /** The run's group, already in the document; the builder appends its nodes once. */
  group: SVGGElement;
  /** The group's own `<defs>` (gradients, ids `work-${robotId}-…`). */
  defs: SVGDefsElement;
  /** `'cheap'` or `'all'`; a `'none'` run never reaches a builder. */
  tier: DecorTier;
  job: JobType;
  robotId: string;
  /** The robot's `identityColor`; the other colour a decoration wears is `GEM_LIGHT_COLOR`. */
  identityColor: string;
  variation: WorkVariation;
  shown: readonly OrbiterCorner[];
  events: readonly MoveEvents[];
  duration: number;
  /** A scene point in the group's frame (frames.ts `sceneToRowLocal`). */
  toRow(p: Vec2): Vec2;
  /**
   * The decoration's one proxy tween: `write(t)` runs with the timeline time on every update from
   * `t0` to `t1`, `ease: 'none'`. The window is clamped to the job, so a fade that would start
   * before 0 or end after the reattach never lengthens the timeline. May be called once.
   */
  run(t0: number, t1: number, write: (t: number) => void): void;
}

export type DecorBuilder = (ctx: DecorContext) => void;

// ========================================
// CONSTANTS
// ========================================
/** The builders by job. A job without an entry draws nothing. Each decoration slice registers here;
 *  removing a slice removes one entry and its files. Mutable so tests can substitute a stub. */
export const DECOR_BUILDERS: Partial<Record<JobType, DecorBuilder>> = {
  [JobType.Maintenance]: addMaintenanceDecor,
};

// ========================================
// EXPORTS
// ========================================
/**
 * Adds the job's decoration to its timeline, when its tier is not 'none', the robot has a
 * `.robot__row` and the job has a builder. (Reduced motion never gets here: buildJobTimeline plans
 * no moves for it, so `addWork` is not called.) The group is removed when the proxy tween
 * completes and when the timeline is killed (whatever its progress).
 */
export function addJobDecor(tl: gsap.core.Timeline, run: DecorRun): void {
  const { input, gem, shown, variation, events, duration, cycle, cycles } = run;
  const build = DECOR_BUILDERS[input.job];
  const row = input.robotEl.querySelector('.robot__row');
  if (input.decorTier === 'none' || !build || !row) return;

  const group = svgEl('g', { class: 'robot__work', 'data-job': input.job });
  const defs = group.appendChild(svgEl('defs'));
  row.appendChild(group);
  const remove = () => group.remove();

  const frame = { robotPos: input.robot.position, gem, layerScale: input.layerScale };
  let ran = false;
  let tweened = false;
  build({
    group,
    defs,
    tier: input.decorTier,
    job: input.job,
    robotId: input.robot.id,
    identityColor: input.robot.identityColor,
    variation,
    shown,
    events,
    duration,
    toRow: (p) => sceneToRowLocal(p, frame),
    run(t0, t1, write) {
      if (ran) throw new Error('addJobDecor: a decoration runs one proxy tween only');
      ran = true;
      const from = Math.max(0, t0);
      const to = Math.min(duration, t1);
      if (!(to > from)) return;
      tweened = true;
      const proxy = { t: from };
      tl.to(proxy, { t: to, duration: to - from, ease: 'none', onUpdate: () => write(proxy.t), onComplete: remove }, from);
    },
  });

  if (!tweened) {
    remove();
    return;
  }
  // The tween's onComplete covers a run that plays out. A killed run is every other end: a world
  // transition (killAllTimelines) and the work loop's silent finish, which runs `progress(1, true)`
  // (callbacks muted) and then kills. GSAP's `onInterrupt` fires only below progress 1, so it would
  // miss that second case; every path ends in `kill()`, so the group goes with it.
  const kill = tl.kill.bind(tl);
  tl.kill = () => {
    remove();
    return kill();
  };
  // The group sits outside g.gem's scale, so the counter is the body's bob over the layer scale only.
  tl.add(bob(group, 0, -BOB_PX / input.layerScale, cycle, cycles), 0);
}
