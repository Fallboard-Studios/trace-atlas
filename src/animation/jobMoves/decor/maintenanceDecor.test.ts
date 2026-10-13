// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  flashAt,
  maintenanceWindow,
  sparkAt,
  sparkEvents,
  type SparkEvent,
} from './maintenanceDecor';
import { sceneToRowLocal } from './frames';
import type { MoveEvents } from './events';
import { buildJobTimeline, type JobTimelineInput } from '../buildJobTimeline';
import { jobDuration } from '../jobDuration';
import { RING_SEGMENTS, ringRoute, sparkChords } from '../ring';
import { workVariation, type WorkVariation } from '../variation';
import { killAllTimelines } from '../../timelineMap';
import { getRobotGem } from '../../../components/robot/gem/polygon';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; the GSAP half of these tests reads real tween values.
vi.unmock('gsap');

type RingEvents = Extract<MoveEvents, { kind: 'ring' }>;

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';
const toRowIdentity = (p: Vec2): Vec2 => p;

/** A variation with known spark directions (every chord reads `dirs`) and the two spark factors. */
function variation(over: { dirs?: number[]; sparkReach?: number; sparkLife?: number } = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  const dirs = over.dirs ?? [0.5, 0.5, 0.5];
  return {
    ...base,
    sparkDirs: [0, 1, 2, 3].map(() => [0, 1, 2].map(() => dirs)),
    decor: { ...base.decor, sparkReach: over.sparkReach ?? 1, sparkLife: over.sparkLife ?? 1 },
  };
}

/** A spark event at (100, 200), time 2, pointing along +x. */
const EV: SparkEvent = { j: 0, corner: 0, chordIndex: 0, chord: 4, time: 2, angle: 0, x: 100, y: 200 };

const RING: RingEvents = {
  kind: 'ring',
  centre: { x: 300, y: 150 },
  radius: 24,
  direction: 1,
  t0: 1,
  t1: 7,
  orbs: [
    { corner: 0, startAngle: 0, sparkChords: [4, 20] },
    { corner: 2, startAngle: Math.PI, sparkChords: [35] },
    { corner: 3, startAngle: 1, sparkChords: [] },
  ],
};

const angleOf = (s: { x1: number; y1: number }, e: SparkEvent) => Math.atan2(s.y1 - e.y, s.x1 - e.x);
const lengthOf = (s: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

// ========================================
// SPARK EVENTS
// ========================================
describe('sparkEvents (docs/specs/JOB_DECORATION.md §1.8, Task 7)', () => {
  it('makes one event per orbiter per spark chord, orbiters in slot order and chords in run order', () => {
    const events = sparkEvents(RING, toRowIdentity);
    expect(events.map((e) => [e.j, e.corner, e.chordIndex, e.chord])).toEqual([
      [0, 0, 0, 4],
      [0, 0, 1, 20],
      [1, 2, 0, 35],
    ]);
  });

  it('times each event at the middle of its chord: t0 + (k + .5) / 36 × (t1 - t0)', () => {
    const times = sparkEvents(RING, toRowIdentity).map((e) => e.time);
    expect(times[0]).toBeCloseTo(1 + (4.5 / 36) * 6, 9);
    expect(times[1]).toBeCloseTo(1 + (20.5 / 36) * 6, 9);
    expect(times[2]).toBeCloseTo(1 + (35.5 / 36) * 6, 9);
  });

  it.each([1, -1] as const)('puts each event on the ring at the chord middle angle, direction %d', (direction) => {
    const ring: RingEvents = { ...RING, direction };
    sparkEvents(ring, toRowIdentity).forEach((e) => {
      const start = ring.orbs[e.j].startAngle;
      const a = start + direction * 3 * Math.PI * ((e.chord + 0.5) / 36);
      expect(e.angle).toBeCloseTo(a, 9);
      expect(e.x).toBeCloseTo(300 + 24 * Math.cos(a), 9);
      expect(e.y).toBeCloseTo(150 + 24 * Math.sin(a), 9);
    });
  });

  it('sits within the chord sag of where the orbiter is on its polyline ring (the midpoint of the chord k to k+1)', () => {
    const e = sparkEvents(RING, toRowIdentity)[0];
    const route = ringRoute(RING.centre, RING.radius, RING.orbs[0].startAngle, RING.direction);
    const mid = { x: (route[4].x + route[5].x) / 2, y: (route[4].y + route[5].y) / 2 };
    expect(RING_SEGMENTS).toBe(36);
    expect(Math.hypot(e.x - mid.x, e.y - mid.y)).toBeLessThan(0.25);
  });

  it('maps the position through toRow and leaves the angle alone', () => {
    const plain = sparkEvents(RING, toRowIdentity);
    const mapped = sparkEvents(RING, (p) => ({ x: p.x * 2 + 5, y: p.y * 2 - 7 }));
    mapped.forEach((e, i) => {
      expect(e.x).toBeCloseTo(plain[i].x * 2 + 5, 9);
      expect(e.y).toBeCloseTo(plain[i].y * 2 - 7, 9);
      expect(e.angle).toBe(plain[i].angle);
      expect(e.time).toBe(plain[i].time);
    });
  });

  it('makes none for a ring that does not flicker, or one with no orbiters', () => {
    expect(sparkEvents({ ...RING, orbs: RING.orbs.map((o) => ({ ...o, sparkChords: [] })) }, toRowIdentity)).toEqual([]);
    expect(sparkEvents({ ...RING, orbs: [] }, toRowIdentity)).toEqual([]);
  });

  it('follows the shipped chords: a robot with a draw on chord k sparks there', () => {
    const v = workVariation(GEM_SEED);
    const orbs = [0, 1, 2, 3].map((corner) => ({ corner: corner as 0 | 1 | 2 | 3, startAngle: 0, sparkChords: sparkChords(v.sparks[corner], RING_SEGMENTS) }));
    const events = sparkEvents({ ...RING, orbs }, toRowIdentity);
    expect(events.map((e) => e.chord)).toEqual(orbs.flatMap((o) => o.sparkChords));
  });
});

// ========================================
// SPARKS
// ========================================
describe('sparkAt (§1.8)', () => {
  const v = variation();

  it('at defaults reproduces the sketch at four ages: reach 30 × smooth(a), length 8 × (1 - a), alpha 1 - a', () => {
    const at0 = sparkAt(2, EV, 0, v)!;
    expect([at0.x1, at0.y1, at0.x2, at0.y2, at0.alpha]).toEqual([100, 200, 108, 200, 1]);

    const quarter = sparkAt(2.3, EV, 0, v)!;
    expect(quarter.x1).toBeCloseTo(100 + 30 * 0.15625, 6);
    expect(quarter.x2).toBeCloseTo(100 + 30 * 0.15625 + 6, 6);
    expect(quarter.y1).toBeCloseTo(200, 9);
    expect(quarter.alpha).toBeCloseTo(0.75, 6);

    const half = sparkAt(2.6, EV, 0, v)!;
    expect(half.x1).toBeCloseTo(115, 6);
    expect(half.x2).toBeCloseTo(119, 6);
    expect(half.alpha).toBeCloseTo(0.5, 6);

    // a hair before the end (the exact end is a floating-point coin toss, and its alpha is 0 anyway)
    const end = sparkAt(3.2 - 1e-9, EV, 0, v)!;
    expect(end.x1).toBeCloseTo(130, 6);
    expect(end.x2).toBeCloseTo(130, 6);
    expect(end.alpha).toBeCloseTo(0, 6);
  });

  it('is hidden before the event and after its life, shown from the first instant to the last', () => {
    expect(sparkAt(1.999, EV, 0, v)).toBeNull();
    expect(sparkAt(2, EV, 0, v)).not.toBeNull();
    expect(sparkAt(3.199, EV, 0, v)).not.toBeNull();
    expect(sparkAt(3.2001, EV, 0, v)).toBeNull();
  });

  it('fires along the chord angle plus (draw - .5) × 120°: a draw of 0 is -60°, 1 is +60°', () => {
    const e: SparkEvent = { ...EV, angle: Math.PI / 2 };
    const vd = variation({ dirs: [0, 0.5, 1] });
    const lo = sparkAt(2.6, e, 0, vd)!;
    const mid = sparkAt(2.6, e, 1, vd)!;
    const hi = sparkAt(2.6, e, 2, vd)!;
    expect(angleOf(lo, e)).toBeCloseTo(Math.PI / 2 - Math.PI / 3, 6);
    expect(angleOf(mid, e)).toBeCloseTo(Math.PI / 2, 6);
    expect(angleOf(hi, e)).toBeCloseTo(Math.PI / 2 + Math.PI / 3, 6);
    expect(Math.hypot(lo.x1 - e.x, lo.y1 - e.y)).toBeCloseTo(15, 6);
    expect(lengthOf(lo)).toBeCloseTo(4, 6);
  });

  it('wraps the three draws over five sparks: spark s reads draw s % 3', () => {
    const vd = variation({ dirs: [0, 0.5, 1] });
    const dirs = [0, 1, 2, 3, 4].map((s) => angleOf(sparkAt(2.6, EV, s, vd)!, EV));
    expect(dirs[3]).toBeCloseTo(dirs[0], 9);
    expect(dirs[4]).toBeCloseTo(dirs[1], 9);
    expect(new Set(dirs.slice(0, 3).map((d) => d.toFixed(6))).size).toBe(3);
  });

  it('reads the draws of its own corner and chord index', () => {
    const base = workVariation(GEM_SEED);
    const vd: WorkVariation = {
      ...base,
      sparkDirs: [0, 1, 2, 3].map((c) => [0, 1, 2].map((k) => [(c * 3 + k) / 12, 0.5, 0.5])),
    };
    const a = angleOf(sparkAt(2.6, { ...EV, corner: 2, chordIndex: 1 }, 0, vd)!, EV);
    expect(a).toBeCloseTo(((7 / 12) - 0.5) * (2 * Math.PI) / 3, 6);
  });

  it('light colour on spark 0 only', () => {
    expect([0, 1, 2, 3, 4].map((s) => sparkAt(2.6, EV, s, v)!.light)).toEqual([true, false, false, false, false]);
  });

  it('the sparkReach factor scales the reach by exactly the factor', () => {
    const base = sparkAt(2.6, EV, 0, variation())!;
    const far = sparkAt(2.6, EV, 0, variation({ sparkReach: 1.15 }))!;
    expect(far.x1 - EV.x).toBeCloseTo((base.x1 - EV.x) * 1.15, 6);
    expect(far.alpha).toBe(base.alpha);
    expect(lengthOf(far)).toBeCloseTo(lengthOf(base), 9);
  });

  it('the sparkLife factor stretches the life by exactly the factor: later death, slower fade', () => {
    expect(sparkAt(3.3, EV, 0, variation())).toBeNull();
    const slow = sparkAt(3.3, EV, 0, variation({ sparkLife: 1.15 }))!;
    expect(slow.alpha).toBeCloseTo(1 - 1.3 / (1.2 * 1.15), 6);
    expect(sparkAt(2 + 1.2 * 1.15 + 0.001, EV, 0, variation({ sparkLife: 1.15 }))).toBeNull();
  });
});

// ========================================
// FLASH
// ========================================
describe('flashAt (§1.8)', () => {
  const v = variation();

  it('is radius 12 × (1 - a / .5) at opacity .8 while a < .5, centred on the event', () => {
    const start = flashAt(2, EV, v)!;
    expect([start.x, start.y, start.r, start.alpha]).toEqual([100, 200, 12, 0.8]);
    expect(flashAt(2.3, EV, v)!.r).toBeCloseTo(6, 6);
    expect(flashAt(2.59, EV, v)!.r).toBeCloseTo(12 * (1 - 0.59 / 1.2 / 0.5), 6);
  });

  it('is gone from half the life on, and before the event', () => {
    expect(flashAt(2.6, EV, v)).toBeNull();
    expect(flashAt(3, EV, v)).toBeNull();
    expect(flashAt(1.99, EV, v)).toBeNull();
  });

  it('takes the life factor: half of a longer life is later', () => {
    expect(flashAt(2.65, EV, variation({ sparkLife: 1.15 }))).not.toBeNull();
    expect(flashAt(2 + 0.5 * 1.2 * 1.15 + 0.001, EV, variation({ sparkLife: 1.15 }))).toBeNull();
  });
});

// ========================================
// WINDOW
// ========================================
describe('maintenanceWindow (§1.8: the ring, plus the last sparks life)', () => {
  const v = variation();

  it('runs from the ring start to the ring end plus a spark life, so the last chord sparks play out', () => {
    expect(maintenanceWindow(RING, v, 20)).toEqual([1, 7 + 1.2]);
    expect(maintenanceWindow(RING, variation({ sparkLife: 1.15 }), 20)[1]).toBeCloseTo(7 + 1.2 * 1.15, 9);
  });

  it('never runs past the job, and never before the ring', () => {
    expect(maintenanceWindow(RING, v, 7.5)).toEqual([1, 7.5]);
  });

  it('every shape is gone before the window ends when the job leaves room, and none shows at the ring start', () => {
    const [from, to] = maintenanceWindow(RING, v, 20);
    for (const e of sparkEvents(RING, toRowIdentity)) {
      for (let s = 0; s < 5; s++) {
        expect(sparkAt(from, e, s, v)).toBeNull();
        const last = sparkAt(to, e, s, v);
        expect(last === null || last.alpha < 1e-9).toBe(true);
      }
      expect(flashAt(from, e, v)).toBeNull();
      expect(flashAt(to, e, v)).toBeNull();
    }
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

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, gemSeed = GEM_SEED) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, gemSeed),
    site: { points: [{ x: 470, y: 420 }], paths: { outline: [{ x: 380, y: 430 }, { x: 520, y: 430 }] } },
    job: JobType.Maintenance,
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
const ringOf = (tl: gsap.core.Timeline) => (tl.data as { events: MoveEvents[] }).events[0] as RingEvents;
const opacityOf = (el: Element) => Number(el.getAttribute('opacity'));

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addMaintenanceDecor on a Maintenance job (Task 7)', () => {
  it.each([20261004, 7, 123456, 99])('creates six nodes per spark chord: one flash and five sparks (seed %d, 1 to 4 orbiters)', (seed) => {
    for (let n = 1; n <= 4; n++) {
      const i = input(n, {}, seed);
      const tl = buildJobTimeline(i);
      const chords = ringOf(tl).orbs.reduce((sum, o) => sum + o.sparkChords.length, 0);
      expect(chords).toBeGreaterThan(0);
      expect(chords).toBeLessThanOrEqual(n * 3);
      const g = group(i)!;
      expect(g.querySelectorAll('.robot__work-flash')).toHaveLength(chords);
      expect(g.querySelectorAll('.robot__work-spark')).toHaveLength(chords * 5);
      expect(g.querySelectorAll('circle, line')).toHaveLength(chords * 6);
      expect(g.getAttribute('data-job')).toBe(JobType.Maintenance);
      killAllTimelines();
      document.body.innerHTML = '';
    }
  });

  it('starts every node invisible', () => {
    const i = input();
    buildJobTimeline(i);
    group(i)!.querySelectorAll('circle, line').forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('colours spark 0 of each chord with the gem light colour and the other four with the robot identity colour', () => {
    const i = input();
    buildJobTimeline(i);
    const sparks = [...group(i)!.querySelectorAll('.robot__work-spark')];
    sparks.forEach((s, idx) => expect(s.getAttribute('stroke')).toBe(idx % 5 === 0 ? GEM_LIGHT_COLOR : IDENTITY));
    sparks.forEach((s) => {
      expect(s.getAttribute('stroke-width')).toBe('1');
      expect(s.getAttribute('stroke-linecap')).toBe('round');
    });
  });

  it('fills every flash with one light radial gradient in the group defs: .9, .25, 0 at 0, .5, 1', () => {
    const i = input();
    buildJobTimeline(i);
    const g = group(i)!;
    const gradient = g.querySelector('defs > radialGradient')!;
    expect(gradient.id).toBe('work-r7-flash');
    const stops = [...gradient.querySelectorAll('stop')];
    expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0', '0.5', '1']);
    expect(stops.map((s) => s.getAttribute('stop-opacity'))).toEqual(['0.9', '0.25', '0']);
    stops.forEach((s) => expect(s.getAttribute('stop-color')).toBe(GEM_LIGHT_COLOR));
    g.querySelectorAll('.robot__work-flash').forEach((f) => expect(f.getAttribute('fill')).toBe('url(#work-r7-flash)'));
  });

  it.each([1, 0.75])('writes each chord at its event, as the pure state says (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ring = ringOf(tl);
    const toRow = (p: Vec2) => sceneToRowLocal(p, { robotPos: i.robot.position, gem: getRobotGem(GEM_SEED), layerScale });
    const events = sparkEvents(ring, toRow);
    const v = workVariation(GEM_SEED);
    const g = group(i)!;
    const flashes = [...g.querySelectorAll('.robot__work-flash')];
    const sparks = [...g.querySelectorAll('.robot__work-spark')];

    events.forEach((e, idx) => {
      tl.time(e.time + 0.3 * v.decor.sparkLife);
      const flash = flashAt(tl.time(), e, v)!;
      expect(flash).not.toBeNull();
      expect(Number(flashes[idx].getAttribute('cx'))).toBeCloseTo(flash.x, 2);
      expect(Number(flashes[idx].getAttribute('cy'))).toBeCloseTo(flash.y, 2);
      expect(Number(flashes[idx].getAttribute('r'))).toBeCloseTo(flash.r, 2);
      expect(opacityOf(flashes[idx])).toBeCloseTo(flash.alpha, 2);
      for (let s = 0; s < 5; s++) {
        const state = sparkAt(tl.time(), e, s, v)!;
        const node = sparks[idx * 5 + s];
        expect(Number(node.getAttribute('x1'))).toBeCloseTo(state.x1, 2);
        expect(Number(node.getAttribute('y1'))).toBeCloseTo(state.y1, 2);
        expect(Number(node.getAttribute('x2'))).toBeCloseTo(state.x2, 2);
        expect(Number(node.getAttribute('y2'))).toBeCloseTo(state.y2, 2);
        expect(opacityOf(node)).toBeCloseTo(state.alpha, 2);
        expect(opacityOf(node)).toBeGreaterThan(0);
      }
    });
  });

  it('hides a chord whose sparks are not alive: only the chords within a life of the playhead show', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    const ring = ringOf(tl);
    const events = sparkEvents(ring, toRowIdentity);
    const v = workVariation(GEM_SEED);
    const life = 1.2 * v.decor.sparkLife;
    const sparks = [...group(i)!.querySelectorAll('.robot__work-spark')];
    const t = events[0].time + 0.4;
    tl.time(t);
    events.forEach((e, idx) => {
      const alive = t >= e.time && t <= e.time + life;
      for (let s = 0; s < 5; s++) expect(opacityOf(sparks[idx * 5 + s]) > 0).toBe(alive);
    });
  });

  it('puts a chord out again once its life is over, and when the playhead goes back before it', () => {
    const i = input();
    const tl = buildJobTimeline(i);
    const e = sparkEvents(ringOf(tl), toRowIdentity)[0];
    const life = 1.2 * workVariation(GEM_SEED).decor.sparkLife;
    const nodes = [...group(i)!.querySelectorAll('.robot__work-flash, .robot__work-spark')].slice(0, 6);
    expect(nodes).toHaveLength(6);

    tl.time(e.time + 0.2);
    nodes.forEach((n) => expect(opacityOf(n)).toBeGreaterThan(0));
    tl.time(e.time + life + 0.05);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
    tl.time(e.time + 0.2);
    nodes.forEach((n) => expect(opacityOf(n)).toBeGreaterThan(0));
    tl.time(e.time - 0.05);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('shows nothing at the ring start, and the spark reach is the same row-local distance on the back row', () => {
    const front = input(3, { layerScale: 1 });
    const tf = buildJobTimeline(front);
    group(front)!.querySelectorAll('circle, line').forEach((n) => expect(opacityOf(n)).toBe(0));
    tf.time(ringOf(tf).t0);
    group(front)!.querySelectorAll('circle, line').forEach((n) => expect(opacityOf(n)).toBe(0));

    const reach = (layerScale: number) => {
      const i = input(3, { layerScale });
      const tl = buildJobTimeline(i);
      const e = sparkEvents(ringOf(tl), toRowIdentity)[0];
      const ev = sparkEvents(ringOf(tl), (p) => sceneToRowLocal(p, { robotPos: i.robot.position, gem: getRobotGem(GEM_SEED), layerScale }))[0];
      tl.time(e.time + 0.6 * workVariation(GEM_SEED).decor.sparkLife);
      const n = group(i)!.querySelector('.robot__work-spark')!;
      const d = Math.hypot(Number(n.getAttribute('x1')) - ev.x, Number(n.getAttribute('y1')) - ev.y);
      killAllTimelines();
      document.body.innerHTML = '';
      return d;
    };
    expect(reach(0.75)).toBeCloseTo(reach(1), 2);
  });

  it('cheap draws the same as all: sparks and the flash are the cheap tier', () => {
    // one robot id, so the second build replaces (and kills) the first: count them one after the other
    const all = input(3, { decorTier: 'all' });
    buildJobTimeline(all);
    const allCount = group(all)!.querySelectorAll('circle, line').length;
    const cheap = input(3, { decorTier: 'cheap' });
    buildJobTimeline(cheap);
    expect(allCount).toBeGreaterThan(0);
    expect(group(cheap)!.querySelectorAll('circle, line')).toHaveLength(allCount);
  });

  it('draws nothing with no orbiters, or at tier none', () => {
    const none = input(0);
    buildJobTimeline(none);
    expect(group(none)).toBeNull();
    const off = input(3, { decorTier: 'none' });
    buildJobTimeline(off);
    expect(group(off)).toBeNull();
  });

  it('plays out and removes its group, and leaves the job exactly as long as before', () => {
    for (const bpm of [20, 110, 200]) {
      const i = input(3, { bpm });
      const tl = buildJobTimeline(i);
      expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
      expect(group(i)).not.toBeNull();
      tl.progress(1);
      expect(group(i)).toBeNull();
      killAllTimelines();
    }
  });

  it('keeps its sparks while the job runs on past the ring: the last chord plays out before the reattach', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ring = ringOf(tl);
    const v = workVariation(GEM_SEED);
    const last = sparkEvents(ring, toRowIdentity).reduce((a, b) => (b.time > a.time ? b : a));
    tl.time(Math.min(tl.duration() - 1e-3, last.time + 0.2));
    expect(group(i)).not.toBeNull();
    expect(v.decor.sparkLife).toBeGreaterThan(0);
  });
});
