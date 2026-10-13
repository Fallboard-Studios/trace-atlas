// ========================================
// surveyDecor (docs/specs/JOB_DECORATION.md §1.4, Task 11)
// ========================================
// Acoustic Survey's decoration: on each fan ping a few small arcs leave the orbiter facing away from
// the mast, widening and thinning to nothing; during the ring the orbiters are wired into a faint
// polygon, bright at the corners and clear at the middle of each chord. The arcs wear the light colour.
// A chord's base line wears the robot's identity and its glow line the light colour, through a gradient
// bright at both ends. Ported from the sketch's `acousticSurvey`.
//
// Pure state, thin builder, as haloWaves.ts: `pingArc`, `chordPairs`, `chordState` and `surveyWindow`
// are the maths; `addSurveyDecor` makes the nodes once and writes them from the decoration's one write
// hook (ctx.run). The arcs are time-anchored (each is centred on its orbiter's fan target, a fixed
// point the orbiter only pulses at); the chords read the orbiters' live centres (ctx.pose), so they
// follow the ring exactly. Everything is in the group's row-local frame, so reach and width scale with
// the back row.
//
// Tier: 'all' only. The spec's tier lists name no survey shape for 'cheap' (it is ticks, valve, sparks
// and flash), so a cheap survey draws nothing and leaves no group.
//
// One window spans the fan start to the ring end, or to the last arc's death if that is later (an arc
// born late in a short fan outlives it, and a window that closed first would remove the group with the
// arc still lit: a pop). The chords fade over the ring's own edges, so they are clear when it ends.
//
// Animation only: no AudioEngine, BeatClock or store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import type { DecorBuilder } from './jobDecor';
import type { MoveEvents } from './events';
import { smooth } from './smooth';
import { svgEl } from './svg';
import type { WorkVariation } from '../variation';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import {
  SURVEY_ARCS,
  SURVEY_ARC_GAP,
  SURVEY_CHORD_OPACITY,
  SURVEY_CHORD_WIDTH,
  SURVEY_PING_LIFE,
  SURVEY_PING_REACH,
  SURVEY_PING_SPAN_DEG,
  SURVEY_RING_FADE,
} from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
type FanEvents = Extract<MoveEvents, { kind: 'fan' }>;
type RingEvents = Extract<MoveEvents, { kind: 'ring' }>;

/** One ping arc: its path data, and the radius, stroke width and opacity that went into it. */
export interface PingArc {
  d: string;
  r: number;
  width: number;
  alpha: number;
}

/** The ring's chords at a time `t`: the window alpha (0 to 1), the base line's opacity, and the
 *  opacity of the bright ends of the glow gradient. */
export interface ChordState {
  win: number;
  base: number;
  ends: number;
}

// ========================================
// CONSTANTS
// ========================================
/** An arc's radius at birth, before it widens (sketch: `3 + reach * smooth(u)`). */
const ARC_MIN_RADIUS = 3;
/** An arc's stroke width at birth and at the end of its life, and its opacity at birth. */
const ARC_WIDTH_START = 1.2;
const ARC_WIDTH_END = 0.3;
const ARC_OPACITY = 0.9;
/** A chord's base line is this fraction of the chord opacity; its glow line is this much wider. */
const CHORD_BASE_FRACTION = 0.35;
const CHORD_GLOW_EXTRA_WIDTH = 0.4;
/** Where the glow gradient's clear middle sits. */
const CHORD_MIDDLE = 0.5;

// ========================================
// STATE
// ========================================
const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The circular arc of radius `r` about `c` from angle `a0` to `a1` (radians), sweeping the positive way.
 *  The large-arc flag is set only past half a turn. */
export function arcPath(c: Vec2, r: number, a0: number, a1: number): string {
  const at = (a: number) => `${round(c.x + r * Math.cos(a))} ${round(c.y + r * Math.sin(a))}`;
  return `M${at(a0)}A${round(r)} ${round(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${at(a1)}`;
}

/**
 * Orbiter `j`'s arc `a` at time `t`, or null until just after it starts and after it dies (at the
 * exact start it is not drawn yet, so a window that opens on the first ping opens clear: the arc shows
 * on the next update, at the same opacity it would have had). Arc `a` starts
 * `a x SURVEY_ARC_GAP` after the orbiter's ping and lives SURVEY_PING_LIFE x `surveyLife`; at age
 * fraction `p` it is the arc of radius `3 + SURVEY_PING_REACH x surveyReach x smooth(p)` about the
 * orbiter's fan target, SURVEY_PING_SPAN_DEG wide and centred on the direction facing away from the
 * mast, its stroke thinning from 1.2 to 0.3 and its opacity from .9 to 0. `ev` is in the row's frame.
 */
export function pingArc(t: number, j: number, a: number, ev: FanEvents, v: WorkVariation): PingArc | null {
  const orb = ev.orbs[j];
  if (!orb) return null;
  const life = SURVEY_PING_LIFE * v.decor.surveyLife;
  const age = t - (orb.start + a * SURVEY_ARC_GAP);
  if (!(life > 0) || !(age > 0 && age <= life)) return null;
  const p = age / life;
  const r = ARC_MIN_RADIUS + SURVEY_PING_REACH * v.decor.surveyReach * smooth(p);
  const face = Math.atan2(orb.dir.y, orb.dir.x);
  const half = (SURVEY_PING_SPAN_DEG * Math.PI) / 360;
  return {
    d: arcPath(orb.target, r, face - half, face + half),
    r,
    width: ARC_WIDTH_START + (ARC_WIDTH_END - ARC_WIDTH_START) * p,
    alpha: ARC_OPACITY * (1 - p),
  };
}

/** The orbiter index pairs the ring's chords join: none for fewer than two orbiters, one for two, and
 *  for three or more `n` consecutive pairs in lock order, the last wrapping to the first. */
export function chordPairs(n: number): Array<[number, number]> {
  if (n < 2) return [];
  return Array.from({ length: n === 2 ? 1 : n }, (_, j) => [j, (j + 1) % n]);
}

/** The chords at `t`: faded in and out over SURVEY_RING_FADE at both ends of the ring. */
export function chordState(t: number, ev: RingEvents): ChordState {
  const win = Math.min(1, Math.max(0, Math.min((t - ev.t0) / SURVEY_RING_FADE, (ev.t1 - t) / SURVEY_RING_FADE)));
  return { win, base: SURVEY_CHORD_OPACITY * CHORD_BASE_FRACTION * win, ends: SURVEY_CHORD_OPACITY * win };
}

/** The decoration's window: the earliest of the moves' starts to the latest of the ring's end, the
 *  fan's end and the last arc's death; null with neither move. */
export function surveyWindow(fan: FanEvents | undefined, ring: RingEvents | undefined, v: WorkVariation): [number, number] | null {
  if (!fan && !ring) return null;
  const starts = [fan?.t0, ring?.t0].filter((t): t is number => t !== undefined);
  const ends = [fan?.t1, ring?.t1].filter((t): t is number => t !== undefined);
  if (fan) {
    const life = SURVEY_PING_LIFE * v.decor.surveyLife;
    for (const orb of fan.orbs) ends.push(orb.start + (SURVEY_ARCS - 1) * SURVEY_ARC_GAP + life);
  }
  return [Math.min(...starts), Math.max(...ends)];
}

// ========================================
// BUILDER
// ========================================
function hide(node: Element): void {
  if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
}

/** Makes, once, SURVEY_ARCS arcs per fanned orbiter and a base line, a glow line and a gradient per
 *  chord of the ring, and writes them from the one write hook over the fan and the ring. */
export const addSurveyDecor: DecorBuilder = (ctx) => {
  if (ctx.tier !== 'all') return;
  const fanEv = ctx.events.find((e): e is FanEvents => e.kind === 'fan' && e.orbs.length > 0);
  // a ring of one orbiter has no chord to draw, so it opens no window of its own
  const ringEv = ctx.events.find((e): e is RingEvents => e.kind === 'ring' && e.orbs.length > 1);
  const v = ctx.variation;
  const window = surveyWindow(fanEv, ringEv, v);
  if (!window) return;

  const row = fanEv ? { ...fanEv, orbs: fanEv.orbs.map((orb) => ({ ...orb, target: ctx.toRow(orb.target) })) } : undefined;
  const arcs = (row?.orbs ?? []).flatMap(() =>
    Array.from({ length: SURVEY_ARCS }, () =>
      ctx.group.appendChild(
        svgEl('path', { class: 'robot__work-arc', fill: 'none', stroke: GEM_LIGHT_COLOR, 'stroke-linecap': 'round', opacity: 0 }),
      ),
    ),
  );

  const pairs = ringEv ? chordPairs(ringEv.orbs.length) : [];
  const wires = pairs.map(([from, to], c) => {
    const id = `work-${ctx.robotId}-survey-${c}`;
    const gradient = ctx.defs.appendChild(svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse' }));
    const stops = [0, CHORD_MIDDLE, 1].map((offset) =>
      gradient.appendChild(svgEl('stop', { offset, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': 0 })),
    );
    const base = ctx.group.appendChild(
      svgEl('line', {
        class: 'robot__work-chord',
        stroke: ctx.identityColor,
        'stroke-width': SURVEY_CHORD_WIDTH,
        'stroke-linecap': 'round',
        opacity: 0,
      }),
    );
    const glow = ctx.group.appendChild(
      svgEl('line', {
        class: 'robot__work-chord-glow',
        stroke: `url(#${id})`,
        'stroke-width': SURVEY_CHORD_WIDTH + CHORD_GLOW_EXTRA_WIDTH,
        'stroke-linecap': 'round',
        opacity: 0,
      }),
    );
    return { from, to, gradient, stops, base, glow };
  });

  ctx.run(window[0], window[1], (t) => {
    arcs.forEach((node, idx) => {
      const arc = row ? pingArc(t, Math.floor(idx / SURVEY_ARCS), idx % SURVEY_ARCS, row, v) : null;
      if (!arc) return hide(node);
      node.setAttribute('d', arc.d);
      node.setAttribute('stroke-width', String(round(arc.width)));
      node.setAttribute('opacity', String(arc.alpha));
    });
    if (!ringEv) return;
    const { win, base, ends } = chordState(t, ringEv);
    if (!(win > 0)) {
      for (const wire of wires) {
        hide(wire.base);
        hide(wire.glow);
      }
      return;
    }
    const poses = ringEv.orbs.map((_, j) => ctx.pose(j));
    for (const wire of wires) {
      const a = poses[wire.from];
      const b = poses[wire.to];
      for (const node of [wire.base, wire.glow, wire.gradient]) {
        node.setAttribute('x1', String(a.x));
        node.setAttribute('y1', String(a.y));
        node.setAttribute('x2', String(b.x));
        node.setAttribute('y2', String(b.y));
      }
      wire.base.setAttribute('opacity', String(base));
      wire.glow.setAttribute('opacity', '1');
      wire.stops[0].setAttribute('stop-opacity', String(ends));
      wire.stops[2].setAttribute('stop-opacity', String(ends));
    }
  });
};
