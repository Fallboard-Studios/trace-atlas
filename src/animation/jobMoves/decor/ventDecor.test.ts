// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { moteAt, pulseAmount, ventWindowAlpha, wireGlowAlpha } from './ventDecor';
import type { MoveEvents } from './events';
import { sceneToRowLocal } from './frames';
import { buildJobTimeline, type JobTimelineInput } from '../buildJobTimeline';
import { jobDuration } from '../jobDuration';
import { workVariation, type WorkVariation } from '../variation';
import { killAllTimelines } from '../../timelineMap';
import { getRobotGem } from '../../../components/robot/gem/polygon';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import { HOVER_PULSE_SCALE } from '../../../constants';
import { JobType } from '../../../types/Robot';
import type { Vec2 } from '../../../types/Vec2';

// vitest.setup.ts mocks gsap for every file; the GSAP half of these tests reads real tween values.
vi.unmock('gsap');

type PulseEvents = Extract<MoveEvents, { kind: 'pulse' }>;

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261004;
const IDENTITY = '#3fa7c9';
const MOUTH: Vec2 = { x: 50, y: 60 };

/** A variation with known mote drift (corner 1: .5, 1, 0, .25) and the two vent factors. */
function variation(over: { ventRise?: number; ventLife?: number } = {}): WorkVariation {
  const base = workVariation(GEM_SEED);
  return {
    ...base,
    moteDrift: [[0.5, 0.5, 0.5, 0.5], [0.5, 1, 0, 0.25], [0, 0, 0, 0], [1, 1, 1, 1]],
    decor: { ...base.decor, ventRise: over.ventRise ?? 1, ventLife: over.ventLife ?? 1 },
  };
}

/** Two orbiters (corners 1 and 3) pulsing from t0 = 1 to t1 = 4: a 1.5 s slot each, starting at 1 and 2.5. */
const PULSE: PulseEvents = {
  kind: 'pulse',
  point: MOUTH,
  t0: 1,
  t1: 4,
  slot: 1.5,
  orbs: [
    { corner: 1, start: 1, target: { x: 60, y: 50 } },
    { corner: 3, start: 2.5, target: { x: 40, y: 50 } },
  ],
};

// ========================================
// MOTES
// ========================================
describe('moteAt (docs/specs/JOB_DECORATION.md §1.3, Task 8)', () => {
  const v = variation();

  it('reproduces the spec formula at four ages: mote 1 of orbiter 0 is born at start + 1 × slot / 3 = 1.5', () => {
    const born = moteAt(1.5, 0, 1, PULSE, v, MOUTH)!;
    expect([born.x, born.y, born.r, born.alpha]).toEqual([50, 60, 3.4, 0.9]);

    // a = .25: drift (1 - .5) × 10 × .25, rise 40 × smooth(.25) = 40 × .15625
    const quarter = moteAt(1.5 + 0.45, 0, 1, PULSE, v, MOUTH)!;
    expect(quarter.x).toBeCloseTo(51.25, 6);
    expect(quarter.y).toBeCloseTo(60 - 6.25, 6);
    expect(quarter.r).toBeCloseTo(3.4 * 0.75, 6);
    expect(quarter.alpha).toBeCloseTo(0.9 * 0.75, 6);

    const half = moteAt(1.5 + 0.9, 0, 1, PULSE, v, MOUTH)!;
    expect(half.x).toBeCloseTo(52.5, 6);
    expect(half.y).toBeCloseTo(40, 6);
    expect(half.r).toBeCloseTo(1.7, 6);
    expect(half.alpha).toBeCloseTo(0.45, 6);

    const end = moteAt(1.5 + 1.8 - 1e-9, 0, 1, PULSE, v, MOUTH)!;
    expect(end.y).toBeCloseTo(20, 6);
    expect(end.r).toBeCloseTo(0, 6);
    expect(end.alpha).toBeCloseTo(0, 6);
  });

  it('is null before it is born and after it dies', () => {
    expect(moteAt(1.499, 0, 1, PULSE, v, MOUTH)).toBeNull();
    expect(moteAt(1.5, 0, 1, PULSE, v, MOUTH)).not.toBeNull();
    expect(moteAt(1.5 + 1.8 + 0.001, 0, 1, PULSE, v, MOUTH)).toBeNull();
  });

  it('is born a third of a slot after the last: motes 0, 1, 2 of orbiter 0 at 1, 1.5, 2', () => {
    expect(moteAt(1 - 0.001, 0, 0, PULSE, v, MOUTH)).toBeNull();
    expect(moteAt(1, 0, 0, PULSE, v, MOUTH)).not.toBeNull();
    expect(moteAt(1.5 - 0.001, 0, 1, PULSE, v, MOUTH)).toBeNull();
    expect(moteAt(2 - 0.001, 0, 2, PULSE, v, MOUTH)).toBeNull();
    expect(moteAt(2, 0, 2, PULSE, v, MOUTH)).not.toBeNull();
  });

  it('follows its own orbiter: orbiter 1 starts at 2.5, and drifts by its corner row of moteDrift', () => {
    expect(moteAt(1.5, 1, 1, PULSE, v, MOUTH)).toBeNull();
    // corner 3's drift is 1 for every mote, so +.5 × 10 × a to the right
    const m = moteAt(2.5 + 0.5 + 0.9, 1, 1, PULSE, v, MOUTH)!;
    expect(m.x).toBeCloseTo(50 + 0.5 * 10 * 0.5, 6);
  });

  it('drifts left for a draw under .5: mote 2 of corner 1 has draw 0', () => {
    const m = moteAt(2 + 0.9, 0, 2, PULSE, v, MOUTH)!;
    expect(m.x).toBeCloseTo(50 - 0.5 * 10 * 0.5, 6);
  });

  it('rises from wherever the mouth is', () => {
    const m = moteAt(1.5 + 0.9, 0, 1, PULSE, v, { x: 200, y: 300 })!;
    expect(m.x).toBeCloseTo(202.5, 6);
    expect(m.y).toBeCloseTo(280, 6);
  });

  it('the ventRise factor scales the rise by exactly the factor, and only the rise', () => {
    const base = moteAt(2.4, 0, 1, PULSE, v, MOUTH)!;
    const high = moteAt(2.4, 0, 1, PULSE, variation({ ventRise: 1.15 }), MOUTH)!;
    expect(60 - high.y).toBeCloseTo((60 - base.y) * 1.15, 6);
    expect(high.x).toBe(base.x);
    expect(high.r).toBe(base.r);
    expect(high.alpha).toBe(base.alpha);
  });

  it('the ventLife factor stretches the life by exactly the factor', () => {
    const long = variation({ ventLife: 1.15 });
    expect(moteAt(1.5 + 1.9, 0, 1, PULSE, v, MOUTH)).toBeNull();
    const m = moteAt(1.5 + 1.9, 0, 1, PULSE, long, MOUTH)!;
    expect(m.alpha).toBeCloseTo(0.9 * (1 - 1.9 / (1.8 * 1.15)), 6);
    expect(moteAt(1.5 + 1.8 * 1.15 + 0.001, 0, 1, PULSE, long, MOUTH)).toBeNull();
  });
});

// ========================================
// PULSE AMOUNT AND WINDOW
// ========================================
describe('pulseAmount (§1.3)', () => {
  it('is 0 at rest and 1 at rest × HOVER_PULSE_SCALE, for any rest scale', () => {
    for (const rest of [0.735, 1, 1.69]) {
      expect(pulseAmount(rest, rest)).toBe(0);
      expect(pulseAmount(rest * HOVER_PULSE_SCALE, rest)).toBeCloseTo(1, 9);
      expect(pulseAmount(rest * (1 + (HOVER_PULSE_SCALE - 1) / 2), rest)).toBeCloseTo(0.5, 9);
    }
  });

  it('is clamped: under rest is 0, over the peak is 1', () => {
    expect(pulseAmount(0.5, 1)).toBe(0);
    expect(pulseAmount(2, 1)).toBe(1);
  });
});

describe('ventWindowAlpha (§1.3: VENT_FADE = .5 s at both ends of [t0 - .5, t1 + .5])', () => {
  it('ramps 0 → 1 over the half second before t0, holds 1, and ramps 1 → 0 over the half second after t1', () => {
    expect(ventWindowAlpha(0.5, PULSE)).toBe(0);
    expect(ventWindowAlpha(0.75, PULSE)).toBeCloseTo(0.5, 9);
    expect(ventWindowAlpha(1, PULSE)).toBe(1);
    expect(ventWindowAlpha(2.5, PULSE)).toBe(1);
    expect(ventWindowAlpha(4, PULSE)).toBe(1);
    expect(ventWindowAlpha(4.25, PULSE)).toBeCloseTo(0.5, 9);
    expect(ventWindowAlpha(4.5, PULSE)).toBe(0);
  });

  it('is 0 outside the window', () => {
    expect(ventWindowAlpha(0, PULSE)).toBe(0);
    expect(ventWindowAlpha(9, PULSE)).toBe(0);
  });
});

describe('wireGlowAlpha (§1.3: the pulse amount × the window alpha)', () => {
  it('multiplies the two', () => {
    expect(wireGlowAlpha(1.3, 1, 1)).toBeCloseTo(1, 9);
    expect(wireGlowAlpha(1.3, 1, 0.5)).toBeCloseTo(0.5, 9);
    expect(wireGlowAlpha(1.15, 1, 1)).toBeCloseTo(0.5, 9);
    expect(wireGlowAlpha(1, 1, 1)).toBe(0);
    expect(wireGlowAlpha(1.3, 1, 0)).toBe(0);
  });
});

// ========================================
// THE TIMELINE (real GSAP)
// ========================================
function mount(count: number, restScale: number, gemSeed: number) {
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
    gsap.set(local, { x: 0, y: 0, scale: restScale, opacity: 1 });
    return local;
  });
  return { robot, robotEl, rowEl, orbiters };
}

function input(count = 3, over: Partial<Omit<JobTimelineInput, 'robot' | 'robotEl' | 'orbiters'>> = {}, restScale = 1, gemSeed = GEM_SEED) {
  const i: JobTimelineInput & ReturnType<typeof mount> = {
    ...mount(count, restScale, gemSeed),
    site: { points: [{ x: 470, y: 420 }], paths: { outline: [{ x: 380, y: 430 }, { x: 520, y: 430 }] } },
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

const group = (i: { robotEl: Element }) => i.robotEl.querySelector('.robot__work');
const pulseOf = (tl: gsap.core.Timeline) => (tl.data as { events: MoveEvents[] }).events[0] as PulseEvents;
const num = (el: Element, name: string) => Number(el.getAttribute(name));
const opacityOf = (el: Element) => num(el, 'opacity');
const toRowFor = (i: { robot: { position: Vec2 } }, layerScale: number) => (p: Vec2) =>
  sceneToRowLocal(p, { robotPos: i.robot.position, gem: getRobotGem(GEM_SEED), layerScale });

afterEach(() => {
  killAllTimelines();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('addVentDecor on a Vent Extraction job (Task 8)', () => {
  it.each([1, 2, 3, 4])('makes a base wire, a glow wire and three motes per orbiter, and one gradient each (%d orbiters)', (n) => {
    const i = input(n);
    buildJobTimeline(i);
    const g = group(i)!;
    expect(g.getAttribute('data-job')).toBe(JobType.VentExtraction);
    expect(g.querySelectorAll('.robot__work-wire')).toHaveLength(n);
    expect(g.querySelectorAll('.robot__work-glow')).toHaveLength(n);
    expect(g.querySelectorAll('.robot__work-mote')).toHaveLength(n * 3);
    expect(g.querySelectorAll('line, circle')).toHaveLength(n * (2 + 3));
    expect(g.querySelectorAll('defs > linearGradient')).toHaveLength(n);
  });

  it('draws each orbiter in turn as wire, glow, then its motes, and starts every node invisible', () => {
    const i = input(2);
    buildJobTimeline(i);
    const nodes = [...group(i)!.querySelectorAll('line, circle')];
    expect(nodes.map((n) => n.getAttribute('class'))).toEqual([
      'robot__work-wire', 'robot__work-glow', 'robot__work-mote', 'robot__work-mote', 'robot__work-mote',
      'robot__work-wire', 'robot__work-glow', 'robot__work-mote', 'robot__work-mote', 'robot__work-mote',
    ]);
    nodes.forEach((n) => expect(opacityOf(n)).toBe(0));
  });

  it('wires in the identity colour at width 1.8; the glow is 2.4 wide and strokes its own gradient; motes are the light colour', () => {
    const i = input(2);
    buildJobTimeline(i);
    const g = group(i)!;
    g.querySelectorAll('.robot__work-wire').forEach((w) => {
      expect(w.getAttribute('stroke')).toBe(IDENTITY);
      expect(w.getAttribute('stroke-width')).toBe('1.8');
    });
    [...g.querySelectorAll('.robot__work-glow')].forEach((w, j) => {
      expect(w.getAttribute('stroke')).toBe(`url(#work-r7-vent-${j})`);
      expect(num(w, 'stroke-width')).toBeCloseTo(2.4, 9);
    });
    g.querySelectorAll('.robot__work-mote').forEach((m) => expect(m.getAttribute('fill')).toBe(GEM_LIGHT_COLOR));
  });

  it('gives each glow a user-space gradient in the light colour: its start opacity to 0 by 60 percent', () => {
    const i = input(3);
    buildJobTimeline(i);
    const gradients = [...group(i)!.querySelectorAll('defs > linearGradient')];
    gradients.forEach((gr, j) => {
      expect(gr.id).toBe(`work-r7-vent-${j}`);
      expect(gr.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
      const stops = [...gr.querySelectorAll('stop')];
      expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0', '0.6']);
      expect(stops.map((s) => s.getAttribute('stop-color'))).toEqual([GEM_LIGHT_COLOR, GEM_LIGHT_COLOR]);
      expect(stops[0].getAttribute('stop-opacity')).toBe('0');
      expect(stops[1].getAttribute('stop-opacity')).toBe('0');
    });
  });

  it.each([1, 0.75])('mid-pulse each wire runs from the mouth to its orbiter and the gradient tracks both ends (layer scale %s)', (layerScale) => {
    const i = input(3, { layerScale });
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const toRow = toRowFor(i, layerScale);
    const mouth = toRow(ev.point);
    const g = group(i)!;
    const wires = [...g.querySelectorAll('.robot__work-wire')];
    const glows = [...g.querySelectorAll('.robot__work-glow')];
    const grads = [...g.querySelectorAll('defs > linearGradient')];
    ev.orbs.forEach((orb, j) => {
      tl.time(orb.start + ev.slot / 2);
      const orbiter = toRow(orb.target);
      for (const w of [wires[j], glows[j]]) {
        expect(num(w, 'x1')).toBeCloseTo(mouth.x, 2);
        expect(num(w, 'y1')).toBeCloseTo(mouth.y, 2);
        expect(num(w, 'x2')).toBeCloseTo(orbiter.x, 2);
        expect(num(w, 'y2')).toBeCloseTo(orbiter.y, 2);
      }
      expect(num(grads[j], 'x1')).toBeCloseTo(mouth.x, 2);
      expect(num(grads[j], 'y1')).toBeCloseTo(mouth.y, 2);
      expect(num(grads[j], 'x2')).toBeCloseTo(orbiter.x, 2);
      expect(num(grads[j], 'y2')).toBeCloseTo(orbiter.y, 2);
    });
  });

  it('the base wire is .5 opaque inside the window and fades over the half second at each end', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const wire = group(i)!.querySelector('.robot__work-wire')!;
    tl.time(ev.t0 - 0.5);
    expect(opacityOf(wire)).toBe(0);
    tl.time(ev.t0 - 0.25);
    expect(opacityOf(wire)).toBeCloseTo(0.25, 6);
    tl.time(ev.t0);
    expect(opacityOf(wire)).toBeCloseTo(0.5, 6);
    tl.time((ev.t0 + ev.t1) / 2);
    expect(opacityOf(wire)).toBeCloseTo(0.5, 6);
    tl.time(ev.t1 + 0.25);
    expect(opacityOf(wire)).toBeCloseTo(0.25, 6);
    tl.time(ev.t1 + 0.5 - 1e-6);
    expect(opacityOf(wire)).toBeCloseTo(0, 4);
  });

  it('every node is invisible at both ends of the window', () => {
    const i = input(4);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const nodes = [...group(i)!.querySelectorAll('line, circle')];
    for (const t of [ev.t0 - 0.5, ev.t1 + 0.5 - 1e-9]) {
      tl.time(t);
      nodes.forEach((n) => expect(opacityOf(n)).toBeCloseTo(0, 6));
    }
  });

  it('the glow lights only on its own orbiter\'s pulse slot, at its slot middle and not at rest', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const grads = [...group(i)!.querySelectorAll('defs > linearGradient')];
    const start = (g: Element) => num(g.querySelector('stop')!, 'stop-opacity');
    const startOf = (j: number) => start(grads[j]);

    tl.time(ev.t0 - 0.25);
    grads.forEach((_, j) => expect(startOf(j)).toBe(0));
    ev.orbs.forEach((orb, j) => {
      tl.time(orb.start + ev.slot / 2);
      grads.forEach((_, k) => (k === j ? expect(startOf(k)).toBeCloseTo(1, 3) : expect(startOf(k)).toBeCloseTo(0, 6)));
    });
    tl.time(ev.t1 + 0.25);
    grads.forEach((_, j) => expect(startOf(j)).toBe(0));
  });

  it('the glow wire is drawn only while it glows, so a resting wire is just the one line', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const glows = [...group(i)!.querySelectorAll('.robot__work-glow')];
    tl.time(ev.t0 - 0.25);
    glows.forEach((w) => expect(opacityOf(w)).toBe(0));
    tl.time(ev.orbs[0].start + ev.slot / 2);
    expect(opacityOf(glows[0])).toBe(1);
    expect(opacityOf(glows[1])).toBe(0);
  });

  it('measures the pulse from each orbiter\'s own rest scale: an orbiter resting at .8 peaks at 1.04 and still glows fully', () => {
    const i = input(3, {}, 0.8);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const grads = [...group(i)!.querySelectorAll('defs > linearGradient')];
    tl.time(ev.t0 - 0.25);
    grads.forEach((g) => expect(num(g.querySelector('stop')!, 'stop-opacity')).toBe(0));
    tl.time(ev.orbs[0].start + ev.slot / 2);
    expect(num(grads[0].querySelector('stop')!, 'stop-opacity')).toBeCloseTo(1, 3);
    tl.time(ev.orbs[2].start + ev.slot / 2);
    expect(num(grads[0].querySelector('stop')!, 'stop-opacity')).toBeCloseTo(0, 6);
  });

  it('rises motes from the mouth as the pure state says, and puts them out when they die', () => {
    const i = input(3, { layerScale: 0.75 });
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const v = workVariation(GEM_SEED);
    const mouth = toRowFor(i, 0.75)(ev.point);
    const motes = [...group(i)!.querySelectorAll('.robot__work-mote')];
    ev.orbs.forEach((orb, j) => {
      for (let k = 0; k < 3; k++) {
        const born = orb.start + (k * ev.slot) / 3;
        tl.time(born + 0.5);
        const want = moteAt(tl.time(), j, k, ev, v, mouth)!;
        const node = motes[j * 3 + k];
        const win = ventWindowAlpha(tl.time(), ev);
        expect(num(node, 'cx')).toBeCloseTo(want.x, 2);
        expect(num(node, 'cy')).toBeCloseTo(want.y, 2);
        expect(num(node, 'r')).toBeCloseTo(want.r, 2);
        expect(opacityOf(node)).toBeCloseTo(want.alpha * win, 2);
        expect(opacityOf(node)).toBeGreaterThan(0);
        tl.time(born + 1.8 * v.decor.ventLife + 0.05);
        if (tl.time() < ev.t1 + 0.5) expect(opacityOf(node)).toBe(0);
        tl.time(Math.max(0, born - 0.05));
        expect(opacityOf(node)).toBe(0);
      }
    });
  });

  it('keeps the motes off the screen as the window closes: every mote fades with the window, so none pops at the end', () => {
    const i = input(3);
    const tl = buildJobTimeline(i);
    const ev = pulseOf(tl);
    const motes = [...group(i)!.querySelectorAll('.robot__work-mote')];
    tl.time(ev.t1 + 0.25);
    const mid = motes.map(opacityOf);
    tl.time(ev.t1 + 0.5 - 1e-6);
    const end = motes.map(opacityOf);
    end.forEach((o, idx) => {
      expect(o).toBeCloseTo(0, 4);
      expect(o).toBeLessThanOrEqual(mid[idx] + 1e-9);
    });
  });

  it('cheap draws only the motes: time-anchored, no live orbiter reads, no wires or gradients', () => {
    const i = input(3, { decorTier: 'cheap' });
    const tl = buildJobTimeline(i);
    const g = group(i)!;
    expect(g.querySelectorAll('.robot__work-mote')).toHaveLength(9);
    expect(g.querySelectorAll('.robot__work-wire, .robot__work-glow')).toHaveLength(0);
    expect(g.querySelectorAll('defs > linearGradient')).toHaveLength(0);
    const ev = pulseOf(tl);
    tl.time(ev.orbs[0].start + 0.6);
    expect(opacityOf(g.querySelector('.robot__work-mote')!)).toBeGreaterThan(0);
  });

  it('draws nothing with no orbiters, and nothing at tier none', () => {
    const none = input(0);
    buildJobTimeline(none);
    expect(group(none)).toBeNull();
    const off = input(3, { decorTier: 'none' });
    buildJobTimeline(off);
    expect(group(off)).toBeNull();
  });

  it('plays out inside the job at every tempo, lengthens nothing, and removes its group', () => {
    for (const bpm of [20, 110, 200]) {
      const i = input(3, { bpm });
      const tl = buildJobTimeline(i);
      expect(tl.duration()).toBeCloseTo(jobDuration(bpm), 6);
      const ev = pulseOf(tl);
      expect(ev.t0 - 0.5).toBeGreaterThanOrEqual(0);
      expect(ev.t1 + 0.5).toBeLessThanOrEqual(tl.duration() + 1e-9);
      expect(group(i)).not.toBeNull();
      tl.progress(1);
      expect(group(i)).toBeNull();
      killAllTimelines();
    }
  });

  it('leaves the orbiters, the body and the bob exactly where they are without it', () => {
    const a = input(3);
    const ta = buildJobTimeline(a);
    const num2 = (el: Element, p: string) => Number(gsap.getProperty(el, p));
    const sample = (i: typeof a, tl: gsap.core.Timeline) =>
      [0.5, 2.2, 4.1, 5.5].map((t) => {
        tl.time(t);
        return [num2(i.robotEl, 'y'), ...i.orbiters.flatMap((o) => [num2(o, 'x'), num2(o, 'y'), num2(o, 'scale')])];
      });
    const withDecor = sample(a, ta);
    killAllTimelines();
    document.body.innerHTML = '';
    const b = input(3, { decorTier: 'none' });
    const without = sample(b, buildJobTimeline(b));
    withDecor.forEach((row, r) => row.forEach((x, c) => expect(x).toBeCloseTo(without[r][c], 9)));
  });
});
