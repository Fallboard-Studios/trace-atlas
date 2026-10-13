// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { addSurveyDecor, arcPath, chordPairs, chordState, pingArc, surveyWindow } from './surveyDecor';
import type { MoveEvents } from './events';
import type { DecorContext } from './jobDecor';
import { orbiterLocalToRowLocal, sceneToRowLocal } from './frames';
import { smooth } from './smooth';
import { buildJobTimeline, type JobTimelineInput } from '../buildJobTimeline';
import { jobDuration } from '../jobDuration';
import { workVariation, type WorkVariation } from '../variation';
import { killAllTimelines } from '../../timelineMap';
import { getRobotGem } from '../../../components/robot/gem/polygon';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; the GSAP half of these tests reads real tween values.
vi.unmock('gsap');

type FanEvents = Extract<MoveEvents, { kind: 'fan' }>;
type RingEvents = Extract<MoveEvents, { kind: 'ring' }>;

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';
const DEG = Math.PI / 180;

/** A variation with the two survey factors set (1 = the sketch's numbers). */
function variation(over: { surveyReach?: number; surveyLife?: number } = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  return { ...base, decor: { ...base.decor, surveyReach: over.surveyReach ?? 1, surveyLife: over.surveyLife ?? 1 } };
}

/** Three orbiters ping in turn over [1, 4]: slots of 1 s from 1, 2 and 3. Orbiter 0 fans left, 1 up, 2 right. */
function fan(over: Partial<FanEvents> = {}): FanEvents {
  return {
    kind: 'fan',
    point: { x: 100, y: 100 },
    t0: 1,
    t1: 4,
    slot: 1,
    orbs: [
      { corner: 1, start: 1, target: { x: 60, y: 80 }, dir: { x: -1, y: 0 } },
      { corner: 3, start: 2, target: { x: 100, y: 60 }, dir: { x: 0, y: -1 } },
      { corner: 0, start: 3, target: { x: 140, y: 80 }, dir: { x: 1, y: 0 } },
    ],
    ...over,
  };
}

/** The orbiters ride a ring over [6, 12]. */
function ring(count = 3, over: Partial<RingEvents> = {}): RingEvents {
  const corners = [1, 3, 0, 2] as const;
  return {
    kind: 'ring',
    centre: { x: 100, y: 100 },
    radius: 24,
    direction: 1,
    t0: 6,
    t1: 12,
    orbs: Array.from({ length: count }, (_, j) => ({ corner: corners[j], startAngle: (j * 2 * Math.PI) / count, sparkChords: [] })),
    ...over,
  };
}

/** Pulls the numbers out of an arc path: `M sx sy A r r 0 large 1 ex ey`. */
function parseArc(d: string) {
  const m = /^M(\S+) (\S+)A(\S+) (\S+) 0 (\d) 1 (\S+) (\S+)$/.exec(d);
  if (!m) throw new Error('not an arc path: ' + d);
  const [sx, sy, rx, ry, large, ex, ey] = m.slice(1).map(Number);
  return { sx, sy, rx, ry, large, ex, ey };
}

// ========================================
// ARC PATH
// ========================================
describe('arcPath (a circular arc about a centre, from angle a0 to a1)', () => {
  const c = { x: 10, y: 20 };

  it('starts and ends on the circle at the two angles, sweeping the positive way', () => {
    const p = parseArc(arcPath(c, 5, 0, 90 * DEG));
    expect(p.sx).toBeCloseTo(15, 2);
    expect(p.sy).toBeCloseTo(20, 2);
    expect(p.ex).toBeCloseTo(10, 2);
    expect(p.ey).toBeCloseTo(25, 2);
    expect([p.rx, p.ry]).toEqual([5, 5]);
  });

  it('sets the large-arc flag only past half a turn, so 80 and 180 degrees are small and 200 is large', () => {
    expect(parseArc(arcPath(c, 5, 0, 80 * DEG)).large).toBe(0);
    expect(parseArc(arcPath(c, 5, 0, Math.PI)).large).toBe(0);
    expect(parseArc(arcPath(c, 5, 0, 200 * DEG)).large).toBe(1);
    expect(parseArc(arcPath(c, 5, 0, 359 * DEG)).large).toBe(1);
  });

  it('never writes NaN or Infinity for a zero radius or a zero span', () => {
    expect(arcPath(c, 0, 0, 1)).not.toMatch(/NaN|Infinity/);
    expect(arcPath(c, 5, 1, 1)).not.toMatch(/NaN|Infinity/);
  });
});

// ========================================
// PING ARCS
// ========================================
describe('pingArc (docs/specs/JOB_DECORATION.md §1.4, Task 11)', () => {
  const v = variation();
  const ev = fan();

  it('is hidden until just after its ping starts: at the exact start it is not drawn yet, so a window that opens on a ping opens clear', () => {
    // orbiter 1 starts at 2; its arcs start at 2, 2.15 and 2.3
    expect(pingArc(1.999, 1, 0, ev, v)).toBeNull();
    expect(pingArc(2, 1, 0, ev, v)).toBeNull();
    expect(pingArc(2.001, 1, 0, ev, v)).not.toBeNull();
    expect(pingArc(2.15, 1, 1, ev, v)).toBeNull();
    expect(pingArc(2.151, 1, 1, ev, v)).not.toBeNull();
    expect(pingArc(2.3, 1, 2, ev, v)).toBeNull();
    expect(pingArc(2.301, 1, 2, ev, v)).not.toBeNull();
  });

  it('lives 1.4 s: still there at the end of its life (already invisible) and gone just after', () => {
    expect(pingArc(2 + 1.4, 1, 0, ev, v)).not.toBeNull();
    expect(pingArc(2 + 1.4 + 0.001, 1, 0, ev, v)).toBeNull();
  });

  it('is born, a frame after its ping, at radius 3, width 1.2 and opacity .9', () => {
    const a = pingArc(2 + 1e-9, 1, 0, ev, v)!;
    expect(a.r).toBeCloseTo(3, 9);
    expect(a.width).toBeCloseTo(1.2, 6);
    expect(a.alpha).toBeCloseTo(0.9, 6);
  });

  it('ends at radius 39, width .3 and opacity 0', () => {
    const a = pingArc(2 + 1.4, 1, 0, ev, v)!;
    expect(a.r).toBeCloseTo(3 + 36, 9);
    expect(a.width).toBeCloseTo(0.3, 9);
    expect(a.alpha).toBeCloseTo(0, 9);
  });

  it('follows radius 3 + 36 x smooth(p), width 1.2 to .3, opacity .9 x (1 - p) at three sampled ages', () => {
    for (const p of [0.25, 0.5, 0.8]) {
      const a = pingArc(2 + p * 1.4, 1, 0, ev, v)!;
      expect(a.r).toBeCloseTo(3 + 36 * smooth(p), 9);
      expect(a.width).toBeCloseTo(1.2 + (0.3 - 1.2) * p, 9);
      expect(a.alpha).toBeCloseTo(0.9 * (1 - p), 9);
    }
  });

  it('staggers the three arcs of one orbiter by 0.15 s: arc a at age x is arc 0 at age x + 0.15 a', () => {
    const t = 3.1;
    const zero = pingArc(t - 0.3, 1, 0, ev, v)!;
    const two = pingArc(t, 1, 2, ev, v)!;
    expect(two.r).toBeCloseTo(zero.r, 9);
    expect(two.alpha).toBeCloseTo(zero.alpha, 9);
  });

  it('is centred on the orbiter fan target and spans 80 degrees about the direction facing away from the mast', () => {
    for (const [j, face] of [[0, Math.PI], [1, -Math.PI / 2], [2, 0]] as const) {
      const orb = ev.orbs[j];
      const a = pingArc(orb.start + 0.7, j, 0, ev, v)!;
      const p = parseArc(a.d);
      const angle = (x: number, y: number) => Math.atan2(y - orb.target.y, x - orb.target.x);
      const wrap = (r: number) => Math.atan2(Math.sin(r), Math.cos(r));
      expect(Math.hypot(p.sx - orb.target.x, p.sy - orb.target.y)).toBeCloseTo(a.r, 2);
      expect(Math.hypot(p.ex - orb.target.x, p.ey - orb.target.y)).toBeCloseTo(a.r, 2);
      expect(wrap(angle(p.sx, p.sy) - (face - 40 * DEG))).toBeCloseTo(0, 2);
      expect(wrap(angle(p.ex, p.ey) - (face + 40 * DEG))).toBeCloseTo(0, 2);
      expect(p.large).toBe(0);
    }
  });

  it('faces along a direction that is not on an axis', () => {
    const s = Math.SQRT1_2;
    const diagonal = fan({ orbs: [{ corner: 1, start: 1, target: { x: 0, y: 0 }, dir: { x: s, y: s } }] });
    const p = parseArc(pingArc(1.5, 0, 0, diagonal, v)!.d);
    const mid = Math.atan2((p.sy + p.ey) / 2, (p.sx + p.ex) / 2);
    expect(mid).toBeCloseTo(45 * DEG, 2);
  });

  it('the surveyReach factor scales the 36 part of the radius by exactly the factor and leaves the 3', () => {
    const big = variation({ surveyReach: 1.15 });
    const small = variation({ surveyReach: 0.85 });
    const t = 2 + 0.5 * 1.4;
    expect(pingArc(t, 1, 0, ev, big)!.r).toBeCloseTo(3 + 36 * 1.15 * smooth(0.5), 9);
    expect(pingArc(t, 1, 0, ev, small)!.r).toBeCloseTo(3 + 36 * 0.85 * smooth(0.5), 9);
    expect(pingArc(2 + 1e-9, 1, 0, ev, big)!.r).toBeCloseTo(3, 6);
  });

  it('the surveyLife factor stretches the life by exactly the factor and nothing else', () => {
    const slow = variation({ surveyLife: 1.15 });
    expect(pingArc(2 + 1.4 * 1.15, 1, 0, ev, slow)).not.toBeNull();
    expect(pingArc(2 + 1.4 * 1.15 + 0.001, 1, 0, ev, slow)).toBeNull();
    // half way through its longer life it is where the base arc is half way through its own
    const half = pingArc(2 + 0.5 * 1.4 * 1.15, 1, 0, ev, slow)!;
    const base = pingArc(2 + 0.5 * 1.4, 1, 0, ev, v)!;
    expect(half.r).toBeCloseTo(base.r, 9);
    expect(half.alpha).toBeCloseTo(base.alpha, 9);
    // the stagger between a orbiter arcs is not stretched
    expect(pingArc(2.15, 1, 1, ev, slow)).toBeNull();
    expect(pingArc(2.151, 1, 1, ev, slow)).not.toBeNull();
  });

  it('returns null for an orbiter that is not in the fan and never NaN', () => {
    expect(pingArc(2, 3, 0, ev, v)).toBeNull();
    expect(pingArc(2, -1, 0, ev, v)).toBeNull();
    for (let t = 0; t < 8; t += 0.07) {
      for (let j = 0; j < 3; j++) {
        const a = pingArc(t, j, 1, ev, v);
        if (a) expect([a.r, a.width, a.alpha].every(Number.isFinite)).toBe(true);
      }
    }
  });

  it('a lone orbiter pings the same way', () => {
    const one = fan({ orbs: [ev.orbs[1]] });
    expect(pingArc(2.5, 0, 0, one, v)).not.toBeNull();
  });
});

// ========================================
// CHORDS
// ========================================
describe('chordPairs (which orbiters each chord joins)', () => {
  it('has no chord for none or one orbiter and one chord for two', () => {
    expect(chordPairs(0)).toEqual([]);
    expect(chordPairs(1)).toEqual([]);
    expect(chordPairs(2)).toEqual([[0, 1]]);
  });

  it('closes the polygon for three or more: n consecutive pairs in lock order, the last wrapping to the first', () => {
    expect(chordPairs(3)).toEqual([[0, 1], [1, 2], [2, 0]]);
    expect(chordPairs(4)).toEqual([[0, 1], [1, 2], [2, 3], [3, 0]]);
  });
});

describe('chordState (docs/specs/JOB_DECORATION.md §1.4: 0.35 s edges inside the ring window)', () => {
  const ev = ring();

  it('is invisible at the ring t0 and t1 and outside the window', () => {
    for (const t of [ev.t0, ev.t1, 0, 100]) {
      const s = chordState(t, ev);
      expect([s.win, s.base, s.ends]).toEqual([0, 0, 0]);
    }
  });

  it('is half at 0.175 s in, full from 0.35 s in, and half again 0.175 s before the end', () => {
    expect(chordState(ev.t0 + 0.175, ev).win).toBeCloseTo(0.5, 9);
    expect(chordState(ev.t0 + 0.35, ev).win).toBeCloseTo(1, 9);
    expect(chordState((ev.t0 + ev.t1) / 2, ev).win).toBe(1);
    expect(chordState(ev.t1 - 0.35, ev).win).toBeCloseTo(1, 9);
    expect(chordState(ev.t1 - 0.175, ev).win).toBeCloseTo(0.5, 9);
  });

  it('the base chord is .35 of the opacity and the bright ends the whole opacity, both times the window', () => {
    const full = chordState(ev.t0 + 3, ev);
    expect(full.base).toBeCloseTo(0.35, 9);
    expect(full.ends).toBeCloseTo(1, 9);
    const half = chordState(ev.t0 + 0.175, ev);
    expect(half.base).toBeCloseTo(0.175, 9);
    expect(half.ends).toBeCloseTo(0.5, 9);
  });

  it('never reaches more than half when the window is shorter than the two edges', () => {
    const short = ring(3, { t0: 6, t1: 6.35 });
    for (let t = 6; t <= 6.35; t += 0.01) expect(chordState(t, short).win).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('is invisible for a window with no length', () => {
    expect(chordState(6, ring(3, { t0: 6, t1: 6 })).win).toBe(0);
  });
});

// ========================================
// WINDOW
// ========================================
describe('surveyWindow (the fan start to the ring end, or to the last arc if that is later)', () => {
  const v = variation();

  it('runs from the fan t0 to the ring t1 when the last arc dies before the ring ends', () => {
    expect(surveyWindow(fan(), ring(), v)).toEqual([1, 12]);
  });

  it('runs on past the ring end for an arc that outlives it, so none is cut', () => {
    // the last orbiter starts at 3; its third arc starts at 3.3 and lives to 4.7
    expect(surveyWindow(fan(), ring(3, { t0: 3, t1: 4 }), v)![1]).toBeCloseTo(3 + 0.3 + 1.4, 9);
  });

  it('uses the surveyLife factor for the last arc', () => {
    expect(surveyWindow(fan(), undefined, variation({ surveyLife: 1.15 }))![1]).toBeCloseTo(3 + 0.3 + 1.4 * 1.15, 9);
  });

  it('with a fan only runs from the fan start to the last arc death, which is past the fan end', () => {
    const w = surveyWindow(fan(), undefined, v)!;
    expect(w[0]).toBe(1);
    expect(w[1]).toBeGreaterThan(fan().t1);
  });

  it('with a ring only runs over the ring', () => {
    expect(surveyWindow(undefined, ring(), v)).toEqual([6, 12]);
  });

  it('is null with neither move', () => {
    expect(surveyWindow(undefined, undefined, v)).toBeNull();
  });
});

// ========================================
// THE BUILDER ON ITS OWN (a stub context)
// ========================================
function stubContext(events: MoveEvents[], tier: 'cheap' | 'all' = 'all') {
  const group = document.createElementNS(SVG_NS, 'g');
  const defs = group.appendChild(document.createElementNS(SVG_NS, 'defs'));
  const run = vi.fn();
  const ctx = {
    group,
    defs,
    tier,
    job: JobType.AcousticSurvey,
    robotId: 'r7',
    identityColor: IDENTITY,
    variation: variation(),
    shown: [],
    events,
    orbiters: [],
    restScales: [],
    duration: 20,
    toRow: (p: Vec2) => p,
    pose: () => ({ x: 0, y: 0, scale: 1 }),
    run,
  } as unknown as DecorContext;
  return { ctx, group, run };
}

describe('addSurveyDecor with a stub context', () => {
  it('draws three arcs per orbiter and a chord per pair, and opens one window over both', () => {
    const { ctx, group, run } = stubContext([fan(), ring(3)]);
    addSurveyDecor(ctx);
    expect(group.querySelectorAll('path.robot__work-arc')).toHaveLength(9);
    expect(group.querySelectorAll('line.robot__work-chord')).toHaveLength(3);
    expect(group.querySelectorAll('line.robot__work-chord-glow')).toHaveLength(3);
    expect(group.querySelectorAll('defs > linearGradient')).toHaveLength(3);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([1, 12]);
  });

  it('two orbiters draw one chord', () => {
    const { ctx, group } = stubContext([fan({ orbs: fan().orbs.slice(0, 2) }), ring(2)]);
    addSurveyDecor(ctx);
    expect(group.querySelectorAll('path.robot__work-arc')).toHaveLength(6);
    expect(group.querySelectorAll('line.robot__work-chord')).toHaveLength(1);
    expect(group.querySelectorAll('defs > linearGradient')).toHaveLength(1);
  });

  it('one orbiter draws its arcs and no chord at all', () => {
    const { ctx, group } = stubContext([fan({ orbs: fan().orbs.slice(0, 1) }), ring(1)]);
    addSurveyDecor(ctx);
    expect(group.querySelectorAll('path.robot__work-arc')).toHaveLength(3);
    expect(group.querySelectorAll('line')).toHaveLength(0);
    expect(group.querySelectorAll('linearGradient')).toHaveLength(0);
  });

  it('with no ring draws arcs only, with no fan draws chords only', () => {
    const arcsOnly = stubContext([fan()]);
    addSurveyDecor(arcsOnly.ctx);
    expect(arcsOnly.group.querySelectorAll('path')).toHaveLength(9);
    expect(arcsOnly.group.querySelectorAll('line')).toHaveLength(0);

    const chordsOnly = stubContext([ring(4)]);
    addSurveyDecor(chordsOnly.ctx);
    expect(chordsOnly.group.querySelectorAll('path')).toHaveLength(0);
    expect(chordsOnly.group.querySelectorAll('line.robot__work-chord')).toHaveLength(4);
    expect(chordsOnly.run.mock.calls[0].slice(0, 2)).toEqual([6, 12]);
  });

  it('draws nothing, and does not ask for a window, with no moves, no orbiters, or a lone ring orbiter', () => {
    for (const events of [[], [fan({ orbs: [] }), ring(0)], [ring(1)]] as MoveEvents[][]) {
      const { ctx, group, run } = stubContext(events);
      addSurveyDecor(ctx);
      expect(group.querySelectorAll('path, line, linearGradient')).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('cheap draws nothing: arcs and wires are the all tier', () => {
    const { ctx, group, run } = stubContext([fan(), ring(3)], 'cheap');
    addSurveyDecor(ctx);
    expect(group.querySelectorAll('path, line, linearGradient')).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });
});

// ========================================
// THE TIMELINE (real GSAP)
// ========================================
function mount(count: number, gemSeed: number) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  document.body.appendChild(svg);
  const robotEl = svg.appendChild(document.createElementNS(SVG_NS, 'g'));
  const robot = { id: 'r7', position: { x: 400, y: 300 }, gemSeed, identityColor: IDENTITY };
  gsap.set(robotEl, { x: robot.position.x, y: robot.position.y });
  const rowEl = robotEl.appendChild(document.createElementNS(SVG_NS, 'g'));
  rowEl.setAttribute('class', 'robot__row');
  const host = rowEl.appendChild(document.createElementNS(SVG_NS, 'g'));
  host.setAttribute('class', 'gem');
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

const MAST: Vec2 = { x: 520, y: 380 };

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, GEM_SEED),
    site: { points: [MAST], paths: { outline: [{ x: 480, y: 430 }, { x: 560, y: 430 }] } },
    job: JobType.AcousticSurvey,
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

const group = (i: { robotEl: Element }) => i.robotEl.querySelector('.robot__work');
const eventsOf = (tl: gsap.core.Timeline) => {
  const events = (tl.data as { events: MoveEvents[] }).events;
  return { fan: events[0] as FanEvents, ring: events[1] as RingEvents };
};
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const opacityOf = (el: Element) => num(el, 'opacity');
const frameFor = (layerScale: number, i: { robot: { position: Vec2 } }) => ({
  robotPos: i.robot.position,
  gem: getRobotGem(GEM_SEED),
  layerScale,
});
const toRowFor = (i: { robot: { position: Vec2 } }, layerScale: number) => (p: Vec2) => sceneToRowLocal(p, frameFor(layerScale, i));
const arcs = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-arc')];
const chords = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-chord')];
const glows = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-chord-glow')];
const gradients = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('defs > linearGradient')];
/** Orbiter j's live centre in the group's frame, read from its GSAP x and y. */
const liveCentre = (i: ReturnType<typeof input>, corner: 0 | 1 | 2 | 3, j: number) =>
  orbiterLocalToRowLocal(
    { x: Number(gsap.getProperty(i.orbiters[j], 'x')), y: Number(gsap.getProperty(i.orbiters[j], 'y')) },
    { gem: getRobotGem(GEM_SEED), bodyScale: i.bodyScale, corner },
  );

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addSurveyDecor on an Acoustic Survey job (Task 11)', () => {
  it.each([1, 2, 3, 4])('makes three arcs per orbiter and the chords, glows and gradients the polygon needs (%d orbiters)', (n) => {
    const i = input(n);
    buildJobTimeline(i);
    const g = group(i)!;
    const chordCount = n < 2 ? 0 : n === 2 ? 1 : n;
    expect(g.getAttribute('data-job')).toBe(JobType.AcousticSurvey);
    expect(arcs(i)).toHaveLength(n * 3);
    expect(chords(i)).toHaveLength(chordCount);
    expect(glows(i)).toHaveLength(chordCount);
    expect(gradients(i)).toHaveLength(chordCount);
    expect(g.querySelectorAll('path, line')).toHaveLength(n * 3 + chordCount * 2);
  });

  it('draws the arcs first, then each chord as its base line and its glow line, and starts every node invisible', () => {
    const i = input(3);
    buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('path, line')];
    expect(nodes.map((n) => n.getAttribute('class'))).toEqual([
      ...Array(9).fill('robot__work-arc'),
      ...Array(3).fill(['robot__work-chord', 'robot__work-chord-glow']).flat(),
    ]);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('arcs are light, unfilled round strokes; chords are identity at .6, their glows .4 wider and stroking their own gradient', () => {
    const i = input(3);
    buildJobTimeline(i);
    arcs(i).forEach((a) => {
      expect(a.getAttribute('stroke')).toBe(GEM_LIGHT_COLOR);
      expect(a.getAttribute('fill')).toBe('none');
      expect(a.getAttribute('stroke-linecap')).toBe('round');
    });
    chords(i).forEach((c) => {
      expect(c.getAttribute('stroke')).toBe(IDENTITY);
      expect(num(c, 'stroke-width')).toBeCloseTo(0.6, 9);
    });
    glows(i).forEach((gl, j) => {
      expect(gl.getAttribute('stroke')).toBe(`url(#work-r7-survey-${j})`);
      expect(num(gl, 'stroke-width')).toBeCloseTo(1.0, 9);
    });
  });

  it('gives each glow a user-space gradient in the light colour that is bright at both ends and clear in the middle', () => {
    const i = input(3);
    buildJobTimeline(i);
    gradients(i).forEach((gr, j) => {
      expect(gr.id).toBe(`work-r7-survey-${j}`);
      expect(gr.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
      const stops = [...gr.querySelectorAll('stop')];
      expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0', '0.5', '1']);
      stops.forEach((s) => expect(s.getAttribute('stop-color')).toBe(GEM_LIGHT_COLOR));
      expect(stops[1].getAttribute('stop-opacity')).toBe('0');
    });
  });

  it.each([1, 0.75])('writes the pure arc state onto every arc, hidden ones at opacity 0 (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const { fan: ev } = eventsOf(tl);
    const v = workVariation(GEM_SEED);
    const toRow = toRowFor(i, layerScale);
    const row = { ...ev, orbs: ev.orbs.map((o) => ({ ...o, target: toRow(o.target) })) };
    const nodes = arcs(i);
    let shown = 0;
    const last = Math.max(...ev.orbs.map((o) => o.start));
    for (const t of [ev.t0 + 0.05, ev.orbs[1].start + 0.4, ev.orbs[1].start + 1.1, last + 0.9, last + 1.6]) {
      tl.time(t);
      nodes.forEach((node, idx) => {
        const want = pingArc(tl.time(), Math.floor(idx / 3), idx % 3, row, v);
        if (!want) return expect(opacityOf(node)).toBe(0);
        shown++;
        expect(node.getAttribute('d')).toBe(want.d);
        expect(num(node, 'stroke-width')).toBeCloseTo(want.width, 2);
        expect(opacityOf(node)).toBeCloseTo(want.alpha, 2);
      });
    }
    expect(shown).toBeGreaterThan(10);
  });

  it('an arc is centred on its orbiter target in the robot frame, so the back row shrinks the ring of arcs with it', () => {
    for (const layerScale of [1, 0.75]) {
      const i = input(3, { layerScale });
      const tl = buildJobTimeline(i);
      const { fan: ev } = eventsOf(tl);
      const toRow = toRowFor(i, layerScale);
      ev.orbs.forEach((orb, j) => {
        tl.time(orb.start + 0.7);
        const p = parseArc(arcs(i)[j * 3].getAttribute('d')!);
        const centre = toRow(orb.target);
        const r = Math.hypot(p.sx - centre.x, p.sy - centre.y);
        expect(p.rx).toBeCloseTo(r, 2);
        // a radius the sketch never exceeds, whatever the layer
        expect(r).toBeGreaterThan(3);
        expect(r).toBeLessThan(3 + 36 * 1.15 + 1e-6);
      });
      killAllTimelines();
      document.body.innerHTML = '';
    }
  });

  it.each([1, 0.75])('mid-ring each chord runs between consecutive orbiters live centres and its gradient tracks both ends (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const { ring: ev } = eventsOf(tl);
    for (const t of [(ev.t0 + ev.t1) / 2, ev.t0 + 0.8 * (ev.t1 - ev.t0)]) {
      tl.time(t);
      const pts = ev.orbs.map((orb, j) => liveCentre(i, orb.corner, j));
      pts.forEach((a, c) => {
        const b = pts[(c + 1) % pts.length];
        for (const node of [chords(i)[c], glows(i)[c], gradients(i)[c]]) {
          expect(num(node, 'x1')).toBeCloseTo(a.x, 2);
          expect(num(node, 'y1')).toBeCloseTo(a.y, 2);
          expect(num(node, 'x2')).toBeCloseTo(b.x, 2);
          expect(num(node, 'y2')).toBeCloseTo(b.y, 2);
        }
      });
    }
  });

  it('two orbiters are joined by one chord whose ends are those two orbiters', () => {
    const i = input(2);
    const tl = buildJobTimeline(i);
    const { ring: ev } = eventsOf(tl);
    tl.time((ev.t0 + ev.t1) / 2);
    const [a, b] = ev.orbs.map((orb, j) => liveCentre(i, orb.corner, j));
    expect(num(chords(i)[0], 'x1')).toBeCloseTo(a.x, 2);
    expect(num(chords(i)[0], 'x2')).toBeCloseTo(b.x, 2);
    expect(num(chords(i)[0], 'y1')).toBeCloseTo(a.y, 2);
    expect(num(chords(i)[0], 'y2')).toBeCloseTo(b.y, 2);
  });

  it('fades the chords in over 0.35 s from the ring start and out over 0.35 s to its end', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { ring: ev } = eventsOf(tl);
    const base = chords(i)[0];
    const glow = glows(i)[0];
    const ends = () => [...gradients(i)[0].querySelectorAll('stop')].map((s) => num(s, 'stop-opacity'));
    tl.time(ev.t0);
    expect(opacityOf(base)).toBe(0);
    expect(opacityOf(glow)).toBe(0);
    tl.time(ev.t0 + 0.175);
    expect(opacityOf(base)).toBeCloseTo(0.175, 6);
    expect(opacityOf(glow)).toBe(1);
    expect(ends()[0]).toBeCloseTo(0.5, 6);
    expect(ends()[1]).toBe(0);
    expect(ends()[2]).toBeCloseTo(0.5, 6);
    tl.time((ev.t0 + ev.t1) / 2);
    expect(opacityOf(base)).toBeCloseTo(0.35, 6);
    expect(ends()).toEqual([1, 0, 1]);
    tl.time(ev.t1 - 0.175);
    expect(opacityOf(base)).toBeCloseTo(0.175, 6);
    // the group goes with the window, so ask the nodes we already hold
    tl.time(ev.t1);
    expect(opacityOf(base)).toBe(0);
    expect(opacityOf(glow)).toBe(0);
  });

  it('keeps the chords out of sight during the fan and the arcs out of sight once they have all died', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { fan: ev, ring: rg } = eventsOf(tl);
    tl.time(ev.t0 + 0.5);
    [...chords(i), ...glows(i)].forEach((n) => expect(opacityOf(n)).toBe(0));
    const lastDeath = Math.max(...ev.orbs.map((o) => o.start)) + 0.3 + 1.4 * 1.15;
    tl.time(Math.max(lastDeath + 0.01, (rg.t0 + rg.t1) / 2));
    arcs(i).forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('every node is invisible when the window opens, and seeking back puts them out again', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    const { fan: ev, ring: rg } = eventsOf(tl);
    const nodes = [...group(i)!.querySelectorAll('path, line')];
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    tl.time(ev.orbs[1].start + 0.4);
    expect(nodes.some((n) => opacityOf(n) > 0)).toBe(true);
    tl.time((rg.t0 + rg.t1) / 2);
    expect(nodes.some((n) => opacityOf(n) > 0)).toBe(true);
    tl.time(ev.t0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('keeps the group until the window ends, then removes it', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const { ring: rg } = eventsOf(tl);
    tl.time(rg.t1 - 0.01);
    expect(group(i)).not.toBeNull();
    tl.progress(1);
    expect(group(i)).toBeNull();
  });

  it('cheap and none draw nothing, and neither does a job with no orbiters', () => {
    for (const over of [{ decorTier: 'cheap' as const }, { decorTier: 'none' as const }]) {
      const i = input(3, over);
      buildJobTimeline(i);
      expect(group(i)).toBeNull();
    }
    const empty = input(0);
    buildJobTimeline(empty);
    expect(group(empty)).toBeNull();
  });

  it('plays out inside the job at every tempo, lengthens nothing, and no arc is cut while still bright', () => {
    for (const bpm of [20, 110, 200]) {
      for (const n of [1, 4]) {
        const i = input(n, { bpm });
        const tl = buildJobTimeline(i);
        const { fan: ev } = eventsOf(tl);
        expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
        expect(group(i)).not.toBeNull();
        // just before the job ends every node is clear or the window has already closed
        const nodes = [...group(i)!.querySelectorAll('path, line')];
        tl.time(tl.duration() - 1e-6);
        if (group(i)) nodes.forEach((node) => expect(opacityOf(node)).toBeLessThanOrEqual(0.3));
        expect(ev.t0).toBeGreaterThanOrEqual(0);
        tl.progress(1);
        expect(group(i)).toBeNull();
        killAllTimelines();
        document.body.innerHTML = '';
      }
    }
  });

  it('leaves the orbiters, the body and the bob exactly where they are without it', () => {
    const a = input(3);
    const ta = buildJobTimeline(a);
    const read = (el: Element, p: string) => Number(gsap.getProperty(el, p));
    const sample = (i: typeof a, tl: gsap.core.Timeline) =>
      [0.5, 2.2, 4.1, 7.5].map((t) => {
        tl.time(t);
        return [read(i.robotEl, 'y'), ...i.orbiters.flatMap((o) => [read(o, 'x'), read(o, 'y'), read(o, 'scale')])];
      });
    const withDecor = sample(a, ta);
    killAllTimelines();
    document.body.innerHTML = '';
    const b = input(3, { decorTier: 'none' });
    const without = sample(b, buildJobTimeline(b));
    withDecor.forEach((row, r) => row.forEach((x, c) => expect(x).toBeCloseTo(without[r][c], 9)));
  });
});
