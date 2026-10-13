// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { addSalvageDecor, loadPose, loadScale, slackWire, swingAngle } from './salvageDecor';
import { ARRIVED, DROPPED, LOADED, RETURNED } from '../carry';
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
import { hexToHsl, hslToString } from '../../../utils/colorUtils';

// vitest.setup.ts mocks gsap for every file; the GSAP half of these tests reads real tween values.
vi.unmock('gsap');

type CarryEvents = Extract<MoveEvents, { kind: 'carry' }>;

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';
const DEG = Math.PI / 180;

interface Over {
  hang?: number;
  loadSize?: number;
  swingPhase?: number;
  loadSeed?: number;
}

/** A variation with the salvage knobs set (factors 1 = the sketch's numbers, phase 0, a diamond). */
function variation(over: Over = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  return {
    ...base,
    swingPhase: over.swingPhase ?? 0,
    loadSeed: over.loadSeed ?? 0.25,
    decor: { ...base.decor, hang: over.hang ?? 1, loadSize: over.loadSize ?? 1 },
  };
}

/** Three orbiters carry from a = (50, 100) to b = (150, 100) over [2, 12]. */
function carry(over: Partial<CarryEvents> = {}): CarryEvents {
  return {
    kind: 'carry',
    a: { x: 50, y: 100 },
    b: { x: 150, y: 100 },
    t0: 2,
    t1: 12,
    orbs: [{ corner: 1, offset: -8 }, { corner: 3, offset: 0 }, { corner: 0, offset: 8 }],
    ...over,
  };
}

/** Three live centres whose centroid is (5, 5). */
const CENTRES: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 15 }];

/** Pulls the numbers out of a slack wire's path: `M fx fy Q cx cy dx dy`. */
function parseSlack(d: string) {
  const m = /^M(\S+) (\S+)Q(\S+) (\S+) (\S+) (\S+)$/.exec(d);
  if (!m) throw new Error('not a slack path: ' + d);
  const [fx, fy, cx, cy, dx, dy] = m.slice(1).map(Number);
  return { fx, fy, cx, cy, dx, dy };
}

// ========================================
// LOAD SCALE
// ========================================
describe('loadScale (docs/specs/JOB_DECORATION.md §1.7, Task 12)', () => {
  it('is 0 at the start, 1 from LOADED to ARRIVED, and 0 from DROPPED on', () => {
    expect(loadScale(0)).toBe(0);
    for (const f of [LOADED, 0.2, 0.3, 0.4, 0.42, 0.44, 0.4499, ARRIVED]) expect(loadScale(f)).toBeCloseTo(1, 9);
    for (const f of [DROPPED, 0.6, 0.9, 1]) expect(loadScale(f)).toBe(0);
  });

  it('grows with smooth(f / LOADED) over the first tenth', () => {
    expect(loadScale(0.05)).toBeCloseTo(0.5, 9);
    expect(loadScale(0.025)).toBeCloseTo(smooth(0.25), 9);
    expect(loadScale(0.075)).toBeCloseTo(smooth(0.75), 9);
  });

  it('shrinks with 1 - smooth((f - ARRIVED) / (DROPPED - ARRIVED)) between arrival and the drop', () => {
    expect(loadScale(0.5)).toBeCloseTo(0.5, 9);
    expect(loadScale(0.475)).toBeCloseTo(1 - smooth(0.25), 9);
    expect(loadScale(0.525)).toBeCloseTo(1 - smooth(0.75), 9);
  });

  it('is continuous at every phase boundary', () => {
    for (const f of [LOADED, ARRIVED, DROPPED]) {
      expect(loadScale(f + 1e-9)).toBeCloseTo(loadScale(f - 1e-9), 6);
    }
  });

  it('rises then falls and never leaves [0, 1]', () => {
    let last = 0;
    for (let f = 0; f <= LOADED; f += 0.005) {
      expect(loadScale(f)).toBeGreaterThanOrEqual(last - 1e-12);
      last = loadScale(f);
    }
    last = 1;
    for (let f = ARRIVED; f <= DROPPED; f += 0.005) {
      expect(loadScale(f)).toBeLessThanOrEqual(last + 1e-12);
      last = loadScale(f);
    }
    for (let f = -0.5; f <= 1.5; f += 0.013) {
      expect(loadScale(f)).toBeGreaterThanOrEqual(0);
      expect(loadScale(f)).toBeLessThanOrEqual(1);
    }
  });

  it('is 0 outside the move, before and after', () => {
    expect(loadScale(-0.1)).toBe(0);
    expect(loadScale(1.2)).toBe(0);
  });
});

// ========================================
// SWING
// ========================================
describe('swingAngle (§1.7: sin(phi x 3 pi + phase) x 10 deg x sin(phi pi), phi = (f - LOADED) / (ARRIVED - LOADED))', () => {
  it('is 0 outside the carry, at its two ends, and for the whole of the drop and return', () => {
    const v = variation({ swingPhase: 1.3 });
    for (const f of [-0.2, 0, 0.05, LOADED, ARRIVED, 0.5, DROPPED, 0.7, RETURNED, 1, 1.4]) expect(swingAngle(f, v)).toBe(0);
    expect(Math.abs(swingAngle(LOADED + 1e-9, v))).toBeLessThan(1e-6);
    expect(Math.abs(swingAngle(ARRIVED - 1e-9, v))).toBeLessThan(1e-6);
  });

  it('matches the formula at three sampled points', () => {
    const v = variation({ swingPhase: 0.7 });
    for (const phi of [0.2, 0.5, 0.85]) {
      const f = LOADED + phi * (ARRIVED - LOADED);
      expect(swingAngle(f, v)).toBeCloseTo(Math.sin(phi * Math.PI * 3 + 0.7) * 10 * Math.sin(phi * Math.PI), 9);
    }
  });

  it('is -10 half way through the carry at phase 0, where sin(1.5 pi) is -1', () => {
    expect(swingAngle(LOADED + 0.5 * (ARRIVED - LOADED), variation({ swingPhase: 0 }))).toBeCloseTo(-10, 9);
  });

  it('is bounded by 10 degrees for every phase', () => {
    for (let k = 0; k < 40; k++) {
      const v = variation({ swingPhase: (k / 40) * 2 * Math.PI });
      for (let f = 0; f <= 1; f += 0.003) expect(Math.abs(swingAngle(f, v))).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('is shifted by the phase: a half-turn flips its sign everywhere, and different phases differ', () => {
    const a = variation({ swingPhase: 0.4 });
    const b = variation({ swingPhase: 0.4 + Math.PI });
    const c = variation({ swingPhase: 2.4 });
    const f = 0.22;
    expect(swingAngle(f, b)).toBeCloseTo(-swingAngle(f, a), 9);
    expect(swingAngle(f, c)).not.toBeCloseTo(swingAngle(f, a), 3);
  });
});

// ========================================
// LOAD POSE
// ========================================
describe('loadPose (§1.7: where the load hangs, how big, which shape)', () => {
  const v = variation();

  it('is null while the load has no size, and with nothing to hang from', () => {
    expect(loadPose(0, CENTRES, v)).toBeNull();
    expect(loadPose(DROPPED, CENTRES, v)).toBeNull();
    expect(loadPose(0.8, CENTRES, v)).toBeNull();
    expect(loadPose(0.3, [], v)).toBeNull();
  });

  it('hangs 24 straight below the centroid of the live centres when there is no swing', () => {
    const p = loadPose(LOADED, CENTRES, v)!;
    expect(p.centre.x).toBeCloseTo(5, 9);
    expect(p.centre.y).toBeCloseTo(5 + 24, 9);
    expect(p.swing).toBe(0);
    expect(p.rotation).toBe(0);
  });

  it('swings the hang about the centroid by the swing angle and turns the shape by 1.5 times it', () => {
    const f = LOADED + 0.5 * (ARRIVED - LOADED);
    const p = loadPose(f, CENTRES, v)!;
    const sw = -10 * DEG;
    expect(p.swing).toBeCloseTo(-10, 9);
    expect(p.centre.x).toBeCloseTo(5 + Math.sin(sw) * 24, 9);
    expect(p.centre.y).toBeCloseTo(5 + Math.cos(sw) * 24, 9);
    expect(p.rotation).toBeCloseTo(-15, 9);
    // still 24 from the centroid
    expect(Math.hypot(p.centre.x - 5, p.centre.y - 5)).toBeCloseTo(24, 9);
  });

  it('the hang factor scales the hang depth by exactly the factor', () => {
    expect(loadPose(0.2, CENTRES, variation({ hang: 1.15 }))!.centre.y).toBeCloseTo(5 + 24 * 1.15 * Math.cos(swingAngle(0.2, v) * DEG), 9);
    const up = loadPose(LOADED, CENTRES, variation({ hang: 1.15 }))!;
    const down = loadPose(LOADED, CENTRES, variation({ hang: 0.85 }))!;
    expect(up.centre.y - 5).toBeCloseTo(24 * 1.15, 9);
    expect(down.centre.y - 5).toBeCloseTo(24 * 0.85, 9);
  });

  it('is 12 across at full, scaled by the load factor and by the load scale, with the glow 1.8 times that', () => {
    const full = loadPose(0.3, CENTRES, v)!;
    expect(full.size).toBeCloseTo(12, 9);
    expect(full.glowRadius).toBeCloseTo(12 * 1.8, 9);
    expect(loadPose(0.3, CENTRES, variation({ loadSize: 1.15 }))!.size).toBeCloseTo(12 * 1.15, 9);
    expect(loadPose(0.3, CENTRES, variation({ loadSize: 0.85 }))!.size).toBeCloseTo(12 * 0.85, 9);
    const half = loadPose(0.05, CENTRES, v)!;
    expect(half.size).toBeCloseTo(6, 9);
    expect(half.glowRadius).toBeCloseTo(6 * 1.8, 9);
  });

  it('opacity is .95, the glow .45 and the wires 1, each times the load scale', () => {
    const full = loadPose(0.3, CENTRES, v)!;
    expect([full.alpha, full.glowAlpha, full.wireAlpha]).toEqual([0.95, 0.45, 1]);
    const half = loadPose(0.05, CENTRES, v)!;
    expect(half.alpha).toBeCloseTo(0.475, 9);
    expect(half.glowAlpha).toBeCloseTo(0.225, 9);
    expect(half.wireAlpha).toBeCloseTo(0.5, 9);
  });

  it('is a diamond for a load seed under .5 and a hexagon from .5 up', () => {
    const diamond = loadPose(0.3, CENTRES, variation({ loadSeed: 0.4999 }))!;
    const hex = loadPose(0.3, CENTRES, variation({ loadSeed: 0.5 }))!;
    expect(diamond.shape).toBe('diamond');
    expect(hex.shape).toBe('hex');
    expect(diamond.points).toHaveLength(4);
    expect(hex.points).toHaveLength(6);
    expect(loadPose(0.3, CENTRES, variation({ loadSeed: 0 }))!.shape).toBe('diamond');
    expect(loadPose(0.3, CENTRES, variation({ loadSeed: 0.9999 }))!.shape).toBe('hex');
  });

  it('draws the diamond 0.7 wide and the hexagon 0.85 wide of its size, both about their own origin', () => {
    const s = 12;
    const d = loadPose(0.3, CENTRES, variation({ loadSeed: 0.1 }))!.points;
    expect(d).toEqual([{ x: 0, y: -s }, { x: 0.7 * s, y: 0 }, { x: 0, y: s }, { x: -0.7 * s, y: 0 }]);
    const h = loadPose(0.3, CENTRES, variation({ loadSeed: 0.9 }))!.points;
    expect(h).toEqual([
      { x: 0, y: -s },
      { x: 0.85 * s, y: -0.5 * s },
      { x: 0.85 * s, y: 0.5 * s },
      { x: 0, y: s },
      { x: -0.85 * s, y: 0.5 * s },
      { x: -0.85 * s, y: -0.5 * s },
    ]);
  });

  it('hangs from a single orbiter directly, and from four by their centroid', () => {
    const one = loadPose(LOADED, [{ x: 7, y: 9 }], v)!;
    expect([one.centre.x, one.centre.y]).toEqual([7, 9 + 24]);
    const four = loadPose(LOADED, [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }], v)!;
    expect(four.centre.x).toBeCloseTo(4, 9);
    expect(four.centre.y).toBeCloseTo(4 + 24, 9);
  });

  it('never returns NaN across the move', () => {
    for (let f = 0; f <= 1; f += 0.007) {
      const p = loadPose(f, CENTRES, variation({ swingPhase: 5 }));
      if (p) expect([p.centre.x, p.centre.y, p.size, p.rotation, p.alpha].every(Number.isFinite)).toBe(true);
    }
  });
});

// ========================================
// SLACK WIRES
// ========================================
describe('slackWire (§1.7: from an orbiter back up to the drop, sagging and fading on the return)', () => {
  const v = variation();
  const from = { x: 20, y: 60 };
  const b = { x: 100, y: 70 };

  it('exists only from DROPPED up to but not including RETURNED', () => {
    expect(slackWire(DROPPED - 1e-6, from, b, v)).toBeNull();
    expect(slackWire(DROPPED, from, b, v)).not.toBeNull();
    expect(slackWire(0.8, from, b, v)).not.toBeNull();
    expect(slackWire(RETURNED - 1e-6, from, b, v)).not.toBeNull();
    expect(slackWire(RETURNED, from, b, v)).toBeNull();
    expect(slackWire(0.3, from, b, v)).toBeNull();
    expect(slackWire(1, from, b, v)).toBeNull();
    expect(slackWire(-1, from, b, v)).toBeNull();
  });

  it('runs from the orbiter to the drop point 24 below b, and bows below the lower end by 16 x smooth(q)', () => {
    // f = .55 + .35 q; q = .5 at f = .725
    const w = slackWire(0.725, from, b, v)!;
    const p = parseSlack(w.d);
    expect([p.fx, p.fy]).toEqual([20, 60]);
    expect([p.dx, p.dy]).toEqual([100, 70 + 24]);
    expect(p.cx).toBeCloseTo(60, 3);
    expect(p.cy).toBeCloseTo(Math.max(60, 94) + 16 * smooth(0.5), 3);
  });

  it('eases the bow in with smooth, not linearly: a quarter of the way through it is 16 x smooth(.25), not 4', () => {
    // f = .55 + .35 x .25
    const quarter = parseSlack(slackWire(DROPPED + 0.25 * (RETURNED - DROPPED), from, b, v)!.d);
    expect(quarter.cy).toBeCloseTo(94 + 16 * smooth(0.25), 3);
    expect(quarter.cy).not.toBeCloseTo(94 + 4, 1);
    const threeQuarters = parseSlack(slackWire(DROPPED + 0.75 * (RETURNED - DROPPED), from, b, v)!.d);
    expect(threeQuarters.cy).toBeCloseTo(94 + 16 * smooth(0.75), 3);
  });

  it('bows below the orbiter when the orbiter is the lower end', () => {
    const w = slackWire(0.725, { x: 20, y: 200 }, b, v)!;
    expect(parseSlack(w.d).cy).toBeCloseTo(200 + 8, 3);
  });

  it('is full at the start of the return and fades linearly to nothing at its end', () => {
    expect(slackWire(DROPPED, from, b, v)!.alpha).toBeCloseTo(1, 9);
    expect(slackWire(0.725, from, b, v)!.alpha).toBeCloseTo(0.5, 9);
    expect(slackWire(RETURNED - 1e-9, from, b, v)!.alpha).toBeCloseTo(0, 6);
    expect(parseSlack(slackWire(DROPPED, from, b, v)!.d).cy).toBeCloseTo(94, 3);
  });

  it('the hang factor moves the drop point and nothing else about the ends', () => {
    const p = parseSlack(slackWire(0.725, from, b, variation({ hang: 1.15 }))!.d);
    expect(p.dy).toBeCloseTo(70 + 24 * 1.15, 3);
    expect(p.dx).toBe(100);
    expect([p.fx, p.fy]).toEqual([20, 60]);
  });

  it('never writes NaN', () => {
    for (let f = 0.55; f < 0.9; f += 0.01) expect(slackWire(f, from, b, v)!.d).not.toMatch(/NaN|Infinity/);
  });
});

// ========================================
// THE BUILDER ON ITS OWN (a stub context)
// ========================================
function stubContext(events: MoveEvents[], tier: 'cheap' | 'all' = 'all', over: Over = {}) {
  const group = document.createElementNS(SVG_NS, 'g');
  const defs = group.appendChild(document.createElementNS(SVG_NS, 'defs'));
  const run = vi.fn();
  const ctx = {
    group,
    defs,
    tier,
    job: JobType.Salvage,
    robotId: 'r7',
    identityColor: IDENTITY,
    variation: variation(over),
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

describe('addSalvageDecor with a stub context', () => {
  it('draws a wire and a slack path per orbiter, a glow and the load, and opens one window over the carry', () => {
    const { ctx, group, run } = stubContext([carry()]);
    addSalvageDecor(ctx);
    expect(group.querySelectorAll('line.robot__work-wire')).toHaveLength(3);
    expect(group.querySelectorAll('path.robot__work-slack')).toHaveLength(3);
    expect(group.querySelectorAll('circle.robot__work-load-glow')).toHaveLength(1);
    expect(group.querySelectorAll('polygon.robot__work-load')).toHaveLength(1);
    expect(group.querySelectorAll('defs > radialGradient')).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([2, 12]);
  });

  it.each([1, 2, 3, 4])('draws 2 + 2n nodes whatever the orbiter count (%d)', (n) => {
    const orbs = Array.from({ length: n }, (_, j) => ({ corner: ([1, 3, 0, 2] as const)[j], offset: j * 8 }));
    const { ctx, group } = stubContext([carry({ orbs })]);
    addSalvageDecor(ctx);
    expect(group.querySelectorAll('line, path, circle, polygon')).toHaveLength(2 + 2 * n);
  });

  it('draws nothing, and does not ask for a window, with no carry, no orbiters, or a carry with no time', () => {
    for (const events of [[], [carry({ orbs: [] })], [carry({ t0: 5, t1: 5 })], [carry({ t0: 6, t1: 5 })]] as MoveEvents[][]) {
      const { ctx, group, run } = stubContext(events);
      addSalvageDecor(ctx);
      expect(group.querySelectorAll('line, path, circle, polygon, radialGradient')).toHaveLength(0);
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('reads no live orbiter when there is nothing to draw: before the pick-up, and after the slack wires have gone', () => {
    const { ctx, run } = stubContext([carry()]);
    const pose = vi.fn(() => ({ x: 0, y: 0, scale: 1 }));
    (ctx as unknown as { pose: typeof pose }).pose = pose;
    addSalvageDecor(ctx);
    const write = run.mock.calls[0][2] as (t: number) => void;
    const at = (f: number) => write(2 + f * 10);
    for (const f of [0, 0.9, 0.95, 1]) {
      pose.mockClear();
      at(f);
      expect(pose).not.toHaveBeenCalled();
    }
    for (const f of [0.02, 0.3, 0.5, 0.55, 0.56, 0.85]) {
      pose.mockClear();
      at(f);
      expect(pose).toHaveBeenCalledTimes(3);
    }
  });

  it('cheap draws nothing: the load and its wires are the all tier', () => {
    const { ctx, group, run } = stubContext([carry()], 'cheap');
    addSalvageDecor(ctx);
    expect(group.querySelectorAll('line, path, circle, polygon, radialGradient')).toHaveLength(0);
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

/** Pick up at the first site point, drop at the second. */
const PICK: Vec2 = { x: 440, y: 420 };
const DROP: Vec2 = { x: 560, y: 410 };

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, gemSeed = GEM_SEED) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, gemSeed),
    site: { points: [PICK, DROP], paths: { outline: [PICK, DROP] } },
    job: JobType.Salvage,
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
const carryOf = (tl: gsap.core.Timeline) => (tl.data as { events: MoveEvents[] }).events[0] as CarryEvents;
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const opacityOf = (el: Element) => num(el, 'opacity');
const wires = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-wire')];
const slacks = (i: { robotEl: Element }) => [...group(i)!.querySelectorAll('.robot__work-slack')];
const glow = (i: { robotEl: Element }) => group(i)!.querySelector('.robot__work-load-glow')!;
const load = (i: { robotEl: Element }) => group(i)!.querySelector('.robot__work-load')!;
const toRowFor = (i: { robot: { position: Vec2 } }, layerScale: number) => (p: Vec2) =>
  sceneToRowLocal(p, { robotPos: i.robot.position, gem: getRobotGem(GEM_SEED), layerScale });
/** Orbiter j's live centre in the group's frame, read from its GSAP x and y. */
const liveCentre = (i: ReturnType<typeof input>, corner: 0 | 1 | 2 | 3, j: number) =>
  orbiterLocalToRowLocal(
    { x: Number(gsap.getProperty(i.orbiters[j], 'x')), y: Number(gsap.getProperty(i.orbiters[j], 'y')) },
    { gem: getRobotGem(GEM_SEED), bodyScale: i.bodyScale, corner },
  );
const atFraction = (tl: gsap.core.Timeline, f: number) => {
  const ev = carryOf(tl);
  tl.time(ev.t0 + f * (ev.t1 - ev.t0));
};
const transform = (el: Element) => {
  const m = /translate\((\S+) (\S+)\) rotate\((\S+)\)/.exec(el.getAttribute('transform') ?? '');
  return m ? { x: Number(m[1]), y: Number(m[2]), rotation: Number(m[3]) } : null;
};

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addSalvageDecor on a Salvage job (Task 12)', () => {
  it.each([1, 2, 3, 4])('makes a wire and a slack path per orbiter, a glow and the load (%d orbiters)', (n) => {
    const i = input(n);
    buildJobTimeline(i);
    const g = group(i)!;
    expect(g.getAttribute('data-job')).toBe(JobType.Salvage);
    expect(wires(i)).toHaveLength(n);
    expect(slacks(i)).toHaveLength(n);
    expect(g.querySelectorAll('line, path, circle, polygon')).toHaveLength(2 + 2 * n);
    expect(g.querySelectorAll('defs > radialGradient')).toHaveLength(1);
  });

  it('draws the wires, then the glow, the load and the slack wires, and starts every node invisible', () => {
    const i = input(2);
    buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('line, path, circle, polygon')];
    expect(nodes.map((n) => n.getAttribute('class'))).toEqual([
      'robot__work-wire',
      'robot__work-wire',
      'robot__work-load-glow',
      'robot__work-load',
      'robot__work-slack',
      'robot__work-slack',
    ]);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('wears identity on the wires and slack wires at .7 wide, the light colour on the load outline, and its identity fill 8 lightness darker', () => {
    const i = input(3);
    buildJobTimeline(i);
    [...wires(i), ...slacks(i)].forEach((w) => {
      expect(w.getAttribute('stroke')).toBe(IDENTITY);
      expect(num(w, 'stroke-width')).toBeCloseTo(0.7, 9);
    });
    slacks(i).forEach((s) => expect(s.getAttribute('fill')).toBe('none'));
    const hsl = hexToHsl(IDENTITY);
    expect(load(i).getAttribute('fill')).toBe(hslToString({ ...hsl, l: hsl.l - 8 }));
    expect(load(i).getAttribute('stroke')).toBe(GEM_LIGHT_COLOR);
    expect(num(load(i), 'stroke-width')).toBeCloseTo(0.8, 9);
  });

  it('gives the glow a radial gradient in the light colour that fades from .9 through .25 to nothing', () => {
    const i = input(3);
    buildJobTimeline(i);
    const gradient = group(i)!.querySelector('defs > radialGradient')!;
    expect(gradient.id).toBe('work-r7-salvage-glow');
    expect(glow(i).getAttribute('fill')).toBe(`url(#${gradient.id})`);
    const stops = [...gradient.querySelectorAll('stop')];
    expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0', '0.5', '1']);
    expect(stops.map((s) => s.getAttribute('stop-opacity'))).toEqual(['0.9', '0.25', '0']);
    stops.forEach((s) => expect(s.getAttribute('stop-color')).toBe(GEM_LIGHT_COLOR));
  });

  it.each([1, 0.75])('mid-carry each wire runs from its orbiter live centre to the load, which hangs below the centroid (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ev = carryOf(tl);
    const v = workVariation(GEM_SEED);
    for (const f of [0.2, 0.3, 0.4]) {
      atFraction(tl, f);
      const pts = ev.orbs.map((orb, j) => liveCentre(i, orb.corner, j));
      const want = loadPose(f, pts, v)!;
      wires(i).forEach((w, j) => {
        expect(num(w, 'x1')).toBeCloseTo(pts[j].x, 2);
        expect(num(w, 'y1')).toBeCloseTo(pts[j].y, 2);
        expect(num(w, 'x2')).toBeCloseTo(want.centre.x, 2);
        expect(num(w, 'y2')).toBeCloseTo(want.centre.y, 2);
        expect(opacityOf(w)).toBeCloseTo(want.wireAlpha, 2);
      });
      const t = transform(load(i))!;
      expect(t.x).toBeCloseTo(want.centre.x, 2);
      expect(t.y).toBeCloseTo(want.centre.y, 2);
      expect(t.rotation).toBeCloseTo(want.rotation, 1);
      expect(num(glow(i), 'cx')).toBeCloseTo(want.centre.x, 2);
      expect(num(glow(i), 'cy')).toBeCloseTo(want.centre.y, 2);
      expect(num(glow(i), 'r')).toBeCloseTo(want.glowRadius, 2);
      expect(opacityOf(glow(i))).toBeCloseTo(want.glowAlpha, 2);
      expect(opacityOf(load(i))).toBeCloseTo(want.alpha, 2);
      // the load sits below the centroid, which is not the carry point in a mirrored layer
      expect(want.centre.y).toBeGreaterThan(pts.reduce((s, p) => s + p.y, 0) / pts.length);
    }
  });

  it('while carrying, the slack wires are out of sight', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    atFraction(tl, 0.3);
    slacks(i).forEach((s) => expect(opacityOf(s)).toBe(0));
  });

  it.each([1, 0.75])('on the return each slack wire runs from its orbiter to the drop hung 24 below it and fades (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ev = carryOf(tl);
    const v = workVariation(GEM_SEED);
    const drop = toRowFor(i, layerScale)(ev.b);
    for (const f of [0.6, 0.725, 0.85]) {
      atFraction(tl, f);
      const q = (f - DROPPED) / (RETURNED - DROPPED);
      slacks(i).forEach((s, j) => {
        const p = parseSlack(s.getAttribute('d')!);
        const from = liveCentre(i, ev.orbs[j].corner, j);
        expect(p.fx).toBeCloseTo(from.x, 2);
        expect(p.fy).toBeCloseTo(from.y, 2);
        expect(p.dx).toBeCloseTo(drop.x, 2);
        expect(p.dy).toBeCloseTo(drop.y + 24 * v.decor.hang, 2);
        expect(opacityOf(s)).toBeCloseTo(1 - q, 2);
      });
    }
  });

  it('the load, its glow and the wires are gone once the drop is made', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    atFraction(tl, 0.6);
    [...wires(i), glow(i), load(i)].forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('every node is invisible at f = 0 and f = .95, and also at the very end', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('line, path, circle, polygon')];
    atFraction(tl, 0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    atFraction(tl, 0.95);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    atFraction(tl, 0.3);
    expect(nodes.some((n) => opacityOf(n) > 0)).toBe(true);
    // seeking back puts them out again
    atFraction(tl, 0);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('grows the load from nothing at the pick-up while the orbiters shrink', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const sizeAt = (f: number) => {
      atFraction(tl, f);
      return load(i).getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    };
    const early = sizeAt(0.02);
    const later = sizeAt(0.08);
    const full = sizeAt(0.3);
    expect(Math.max(...early)).toBeLessThan(Math.max(...later));
    expect(Math.max(...later)).toBeLessThan(Math.max(...full));
    expect(Math.max(...full)).toBeCloseTo(12 * workVariation(GEM_SEED).decor.loadSize, 2);
  });

  it('draws a diamond or a hexagon by the robot load seed', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 400 && seen.size < 2; seed++) {
      const i = input(2, {}, seed);
      const tl = buildJobTimeline(i);
      atFraction(tl, 0.3);
      const points = load(i).getAttribute('points')!.split(' ').length;
      expect(points).toBe(workVariation(seed).loadSeed < 0.5 ? 4 : 6);
      seen.add(points);
      killAllTimelines();
      document.body.innerHTML = '';
    }
    expect([...seen].sort()).toEqual([4, 6]);
  });

  it('keeps the group until the move ends, then removes it, at every tempo, without lengthening the job', () => {
    for (const bpm of [20, 110, 200]) {
      for (const n of [1, 4]) {
        const i = input(n, { bpm });
        const tl = buildJobTimeline(i);
        const ev = carryOf(tl);
        expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
        expect(ev.t1).toBeLessThanOrEqual(tl.duration() + 1e-9);
        tl.time(ev.t1 - 0.01);
        expect(group(i)).not.toBeNull();
        tl.progress(1);
        expect(group(i)).toBeNull();
        killAllTimelines();
        document.body.innerHTML = '';
      }
    }
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
