// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { buildJobTimeline, type JobTimelineInput } from '../buildJobTimeline';
import { DECOR_BUILDERS, type DecorBuilder, type DecorContext } from './jobDecor';
import { sceneToRowLocal } from './frames';
import { jobDuration } from '../jobDuration';
import { workVariation } from '../variation';
import type { OrbiterCorner } from '../sceneToOrbiterLocal';
import { killAllTimelines } from '../../timelineMap';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../../../components/robot/gem/polygon';
import { orbiterPlan } from '../../../components/robot/gem/orbiterMotion';
import { BOB_PX } from '../../../constants';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; these tests read real tween values.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
/** A scene point near the vent site, the one the counter-bob test pins a wire end to. */
const ANCHOR: Vec2 = { x: 470, y: 420 };

/** A world robot as the loop sees it: `.robot` at its position, a `.robot__row` holding `g.gem` with
 *  the shown orbiters' `.gem__orbiter > .gem__orbiter-local` pairs. `row: false` is a fixture with no
 *  `.robot__row` at all (the other jobMoves tests). */
function mount(count: number, row = true) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  const robotEl = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const robot = { id: 'r7', position: { x: 400, y: 300 }, gemSeed: GEM_SEED };
  gsap.set(robotEl, { x: robot.position.x, y: robot.position.y });
  let rowEl: Element | null = null;
  let host: Element = robotEl;
  if (row) {
    rowEl = robotEl.appendChild(document.createElementNS(SVG_NS, 'g'));
    rowEl.setAttribute('class', 'robot__row');
    host = rowEl.appendChild(document.createElementNS(SVG_NS, 'g'));
    host.setAttribute('class', 'gem');
  }
  const orbiters = Array.from({ length: count }, () => {
    const copy = host.appendChild(document.createElementNS(SVG_NS, 'g'));
    copy.setAttribute('class', 'gem__orbiter');
    const local = copy.appendChild(document.createElementNS(SVG_NS, 'g'));
    local.setAttribute('class', 'gem__orbiter-local');
    gsap.set(local, { x: 0, y: 0, scale: 1, opacity: 1 });
    return local;
  });
  return { robot, robotEl, rowEl, orbiters };
}

function input(over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, row = true) {
  const m = mount(3, row);
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...m,
    site: { points: [ANCHOR, { x: 380, y: 420 }], paths: { outline: [{ x: 380, y: 430 }, { x: 520, y: 430 }] } },
    job: JobType.VentExtraction,
    bpm: 110,
    decorTier: 'all',
    bodyScale: 1.2,
    layerScale: 1,
    reducedMotion: false,
    onComplete: vi.fn(),
    ...over,
  };
  return i;
}

/** A builder that draws one wire (`line`) whose end sits on `ANCHOR` and runs its one proxy tween
 *  over [from, to] (default: the whole job). */
function stub(from?: number, to?: number) {
  return vi.fn<DecorBuilder>((ctx: DecorContext) => {
    const line = ctx.group.appendChild(document.createElementNS(SVG_NS, 'line'));
    line.setAttribute('class', 'robot__work-wire');
    const end = ctx.toRow(ANCHOR);
    line.setAttribute('x2', String(end.x));
    line.setAttribute('y2', String(end.y));
    ctx.run(from ?? 0, to ?? ctx.duration, (t) => line.setAttribute('opacity', String(t)));
  });
}

const num = (el: Element, prop: string) => Number(gsap.getProperty(el, prop));
const works = (i: { robotEl: Element }) => [...i.robotEl.querySelectorAll('.robot__work')];

/** Where a row-local point is drawn in the scene right now: the `.robot` x/y, then the group's own
 *  x/y (the counter-bob), then the row's scale about the gem canvas centre. */
function sceneOf(i: ReturnType<typeof input>, group: Element, p: Vec2): Vec2 {
  const g = getRobotGem(i.robot.gemSeed);
  const cx = gemWidth(g) / 2;
  const cy = GEM_CANVAS_H / 2;
  return {
    x: num(i.robotEl, 'x') + cx + i.layerScale * (p.x + num(group, 'x') - cx),
    y: num(i.robotEl, 'y') + cy + i.layerScale * (p.y + num(group, 'y') - cy),
  };
}

beforeEach(() => {
  DECOR_BUILDERS[JobType.VentExtraction] = stub();
});

afterEach(() => {
  killAllTimelines();
  delete DECOR_BUILDERS[JobType.VentExtraction];
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

// ========================================
// TESTS
// ========================================
describe('addJobDecor — the group (docs/specs/JOB_DECORATION.md §1.1, Task 6)', () => {
  it('appends exactly one .robot__work to .robot__row, last child, after g.gem, carrying the job and a <defs>', () => {
    const i = input();
    buildJobTimeline(i);
    const row = i.rowEl!;
    expect(works(i)).toHaveLength(1);
    const group = row.lastElementChild!;
    expect(group.classList.contains('robot__work')).toBe(true);
    expect(group.getAttribute('data-job')).toBe(JobType.VentExtraction);
    expect(group.querySelectorAll(':scope > defs')).toHaveLength(1);
    expect(row.firstElementChild!.classList.contains('gem')).toBe(true);
  });

  it('a job with no builder in the table gets no group', () => {
    const i = input({ job: JobType.Salvage });
    buildJobTimeline(i);
    expect(works(i)).toHaveLength(0);
  });

  it('a second run for the same robot, after the first is killed, leaves one group', () => {
    const i = input();
    const first = buildJobTimeline(i);
    first.progress(0.4);
    first.kill();
    expect(works(i)).toHaveLength(0);
    buildJobTimeline(i);
    expect(works(i)).toHaveLength(1);
  });

  it('hands the builder the plan: tier, job, variation, shown corners, events, duration, and a scene to row-local map', () => {
    const builder = stub();
    DECOR_BUILDERS[JobType.VentExtraction] = builder;
    const i = input({ decorTier: 'cheap', layerScale: 0.75 });
    const tl = buildJobTimeline(i);
    expect(builder).toHaveBeenCalledTimes(1);
    const ctx = builder.mock.calls[0][0];
    expect(ctx.tier).toBe('cheap');
    expect(ctx.job).toBe(JobType.VentExtraction);
    expect(ctx.robotId).toBe('r7');
    expect(ctx.variation).toEqual(workVariation(GEM_SEED));
    expect(ctx.shown).toEqual(orbiterPlan(GEM_SEED).cornerOrder.slice(0, 3) as OrbiterCorner[]);
    expect(ctx.events).toEqual((tl.data as { events: unknown[] }).events);
    expect(ctx.duration).toBeCloseTo(jobDuration(110), 9);
    const p = { x: 433, y: 391 };
    expect(ctx.toRow(p)).toEqual(sceneToRowLocal(p, { robotPos: i.robot.position, gem: getRobotGem(GEM_SEED), layerScale: 0.75 }));
  });
});

describe('addJobDecor — the run ends (Assumption 5, Q4)', () => {
  it('progress(1) removes the group', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    tl.progress(0.5);
    expect(works(i)).toHaveLength(1);
    tl.progress(1);
    expect(works(i)).toHaveLength(0);
  });

  it('kill() at progress 0.4 removes the group', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    tl.progress(0.4);
    expect(works(i)).toHaveLength(1);
    tl.kill();
    expect(works(i)).toHaveLength(0);
  });

  it('killAllTimelines (a world transition) removes the group', () => {
    const i = input();
    buildJobTimeline(i).progress(0.4);
    killAllTimelines();
    expect(works(i)).toHaveLength(0);
  });

  it('the silent finish (progress(1, true), then kill) leaves no group: GSAP fires neither onComplete (muted) nor onInterrupt (progress is 1) there', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    tl.progress(1, true);
    tl.kill();
    expect(works(i)).toHaveLength(0);
    expect(i.onComplete).not.toHaveBeenCalled();
  });

  it('a kill before the run ever played still removes the group', () => {
    const i = input();
    buildJobTimeline(i).kill();
    expect(works(i)).toHaveLength(0);
  });

  it('a decoration that ends before the job removes its group when its tween completes, not at the end of the job', () => {
    DECOR_BUILDERS[JobType.VentExtraction] = stub(1, 2);
    const i = input();
    const tl = buildJobTimeline(i);
    tl.time(1.5);
    expect(works(i)).toHaveLength(1);
    tl.time(2.5);
    expect(works(i)).toHaveLength(0);
  });

  it('the proxy tween writes (the builder callback runs with timeline time) while the group lives', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    tl.time(3);
    expect(Number(works(i)[0].querySelector('line')!.getAttribute('opacity'))).toBeCloseTo(3, 6);
  });

  it('a builder that draws nothing (no tween) leaves no group behind', () => {
    DECOR_BUILDERS[JobType.VentExtraction] = vi.fn();
    const i = input();
    buildJobTimeline(i);
    expect(works(i)).toHaveLength(0);
  });

  it('a window that is empty after clamping to the job (starts at or past its end) draws no tween and leaves no group', () => {
    const i = input();
    const d = jobDuration(110);
    DECOR_BUILDERS[JobType.VentExtraction] = stub(d + 1, d + 2);
    buildJobTimeline(i);
    expect(works(i)).toHaveLength(0);
  });

  it('a builder may run one proxy tween only (spec: one tween per decoration)', () => {
    DECOR_BUILDERS[JobType.VentExtraction] = vi.fn((ctx: DecorContext) => {
      ctx.run(0, 1, () => {});
      ctx.run(1, 2, () => {});
    });
    expect(() => buildJobTimeline(input())).toThrow(/one proxy tween/);
  });
});

describe('addJobDecor — when nothing is drawn', () => {
  it('reducedMotion adds no group and never calls the builder', () => {
    const builder = stub();
    DECOR_BUILDERS[JobType.VentExtraction] = builder;
    const i = input({ reducedMotion: true });
    buildJobTimeline(i);
    expect(works(i)).toHaveLength(0);
    expect(builder).not.toHaveBeenCalled();
  });

  it('decorTier none adds no group, no extra tweens and never calls the builder', () => {
    const builder = stub();
    DECOR_BUILDERS[JobType.VentExtraction] = builder;
    const withTier = buildJobTimeline(input({ decorTier: 'none' }));
    expect(builder).not.toHaveBeenCalled();
    killAllTimelines();
    delete DECOR_BUILDERS[JobType.VentExtraction];
    const without = buildJobTimeline(input({ decorTier: 'all' }));
    expect(withTier.getChildren(true, true, true).length).toBe(without.getChildren(true, true, true).length);
    expect(document.querySelectorAll('.robot__work')).toHaveLength(0);
  });

  it('a fixture with no .robot__row gets no group, no throw, and the builder is not called', () => {
    const builder = stub();
    DECOR_BUILDERS[JobType.VentExtraction] = builder;
    const i = input({}, false);
    expect(() => buildJobTimeline(i)).not.toThrow();
    expect(works(i)).toHaveLength(0);
    expect(builder).not.toHaveBeenCalled();
  });

  it('the job still lasts exactly jobDuration(bpm) when a decoration asks for a window past either end', () => {
    for (const bpm of [20, 110, 200]) {
      DECOR_BUILDERS[JobType.VentExtraction] = stub(-2, jobDuration(bpm) + 5);
      const tl = buildJobTimeline(input({ bpm }));
      expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
      killAllTimelines();
    }
  });

  it('the decoration adds nothing but the group: the orbiters, the body and their bob are the same with and without it', () => {
    const a = input();
    const b = input({ decorTier: 'none' });
    const ta = buildJobTimeline(a);
    const tb = buildJobTimeline(b);
    for (const t of [0.4, 2.2, 5.1]) {
      ta.time(t);
      tb.time(t);
      expect(num(a.robotEl, 'y')).toBeCloseTo(num(b.robotEl, 'y'), 9);
      a.orbiters.forEach((el, j) => {
        expect(num(el, 'x')).toBeCloseTo(num(b.orbiters[j], 'x'), 9);
        expect(num(el, 'y')).toBeCloseTo(num(b.orbiters[j], 'y'), 9);
      });
    }
  });
});

describe('addJobDecor — the counter-bob (Assumption 3)', () => {
  it.each([1, 0.75])('at layer scale %s a wire end set to a scene point holds still while the body bobs', (layerScale) => {
    const i = input({ layerScale });
    const tl = buildJobTimeline(i);
    const D = tl.duration();
    const bobbed: number[] = [];
    for (const f of [0.07, 0.19, 0.31, 0.5, 0.83]) {
      tl.time(f * D);
      const group = works(i)[0];
      const line = group.querySelector('line')!;
      const end = { x: Number(line.getAttribute('x2')), y: Number(line.getAttribute('y2')) };
      const at = sceneOf(i, group, end);
      expect(at.x).toBeCloseTo(ANCHOR.x, 3);
      expect(at.y).toBeCloseTo(ANCHOR.y, 3);
      bobbed.push(num(i.robotEl, 'y'));
    }
    // the body really did bob over those samples, so the test can fail
    expect(Math.max(...bobbed) - Math.min(...bobbed)).toBeGreaterThan(BOB_PX / 2);
  });

  it('the group sits at rest at both ends of the job, so nothing moves at the reattach', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    const group = works(i)[0];
    tl.time(0);
    expect(num(group, 'y')).toBeCloseTo(0, 9);
    tl.time(tl.duration());
    expect(num(group, 'y')).toBeCloseTo(0, 3);
  });

  it('the group bobs by the inverse of the body, divided by the layer scale', () => {
    for (const layerScale of [1, 0.75]) {
      const i = input({ layerScale });
      const tl = buildJobTimeline(i);
      const group = works(i)[0];
      for (const f of [0.1, 0.3, 0.6]) {
        tl.time(f * tl.duration());
        const bodyDy = num(i.robotEl, 'y') - i.robot.position.y;
        // gsap.getProperty rounds a transform to 1e-4, so compare at 1e-3 (the spec's tolerance)
        expect(num(group, 'y')).toBeCloseTo(-bodyDy / layerScale, 3);
      }
      killAllTimelines();
      document.body.innerHTML = '';
    }
  });
});
