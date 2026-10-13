// ========================================
// ventDecor (docs/specs/JOB_DECORATION.md §1.3, Task 8)
// ========================================
// Vent Extraction's decoration: a thin wire from each orbiter to the vent mouth, and on an orbiter's
// pulse its wire brightens from the mouth outward (a gradient in the light colour) while a few motes
// rise off the mouth, shrinking as they go. Ported from the sketch's `ventExtraction`.
//
// Pure state, thin builder, as haloWaves.ts: `moteAt`, `pulseAmount`, `ventWindowAlpha` and
// `wireGlowAlpha` are the maths; `addVentDecor` makes the nodes once and writes them from the
// decoration's one write hook (ctx.run). The wires read the orbiters' live position and scale (ctx.pose), so
// they follow the detach, the gather and the pulse exactly. Everything is in the group's row-local
// frame, so reach and size scale with the back row.
//
// Tier: 'all' draws the wires and the motes. 'cheap' draws the motes only: they are time-anchored
// (no live orbiter reads) and few. (The spec's tier lists name no vent shape for 'cheap'; this is the
// reading that leaves vent something to draw.)
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
  HOVER_PULSE_SCALE,
  VENT_FADE,
  VENT_MOTES,
  VENT_MOTE_LIFE,
  VENT_MOTE_RADIUS,
  VENT_MOTE_RISE,
  VENT_WIRE_OPACITY,
  VENT_WIRE_WIDTH,
} from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
type PulseEvents = Extract<MoveEvents, { kind: 'pulse' }>;

/** One mote, row-local. `alpha` is before the window's fade. */
export interface Mote {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

// ========================================
// CONSTANTS
// ========================================
/** A mote's opacity at birth (sketch: `0.9`). */
const MOTE_OPACITY = 0.9;
/** How far a mote drifts sideways over its life, per unit of its draw's distance from .5 (sketch: `* 10`). */
const MOTE_DRIFT = 10;
/** The glow wire is this much wider than the base wire (sketch: `wireW + 0.6`). */
const GLOW_EXTRA_WIDTH = 0.6;
/** The glow gradient fades to nothing this far along the wire, mouth to orbiter (sketch: `fade = 0.6`). */
const GLOW_FADE_OFFSET = 0.6;

// ========================================
// STATE
// ========================================
/** Orbiter `j`'s mote `k` at time `t`, or null before it is born and after it dies. Mote `k` is born
 *  `k / VENT_MOTES` of a slot after the orbiter's pulse starts. Sketch: ventExtraction. */
export function moteAt(t: number, j: number, k: number, ev: PulseEvents, v: WorkVariation, mouth: Vec2): Mote | null {
  const born = ev.orbs[j].start + (k * ev.slot) / VENT_MOTES;
  const life = VENT_MOTE_LIFE * v.decor.ventLife;
  const a = (t - born) / life;
  if (a < 0 || a > 1) return null;
  const drift = v.moteDrift[ev.orbs[j].corner][k] - 0.5;
  return {
    x: mouth.x + drift * MOTE_DRIFT * a,
    y: mouth.y - VENT_MOTE_RISE * v.decor.ventRise * smooth(a),
    r: VENT_MOTE_RADIUS * (1 - a),
    alpha: MOTE_OPACITY * (1 - a),
  };
}

/** How far through its pulse an orbiter is, 0 at its rest scale to 1 at `rest × HOVER_PULSE_SCALE`. */
export function pulseAmount(scale: number, rest: number): number {
  return Math.min(1, Math.max(0, (scale - rest) / (rest * (HOVER_PULSE_SCALE - 1))));
}

/** The whole decoration's fade: 0 at `t0 - VENT_FADE`, up to 1 by `t0`, held, then down to 0 at `t1 + VENT_FADE`. */
export function ventWindowAlpha(t: number, ev: PulseEvents): number {
  return Math.min(1, Math.max(0, Math.min((t - (ev.t0 - VENT_FADE)) / VENT_FADE, (ev.t1 + VENT_FADE - t) / VENT_FADE)));
}

/** The glow wire's brightness at its mouth end: the pulse amount, faded with the window. */
export function wireGlowAlpha(scale: number, rest: number, windowAlpha: number): number {
  return pulseAmount(scale, rest) * windowAlpha;
}

// ========================================
// BUILDER
// ========================================
/** Makes, per orbiter, a base wire, a glow wire with its gradient (tier 'all') and VENT_MOTES motes,
 *  once, and writes them from the one write hook over the pulse and a fade either side. */
export const addVentDecor: DecorBuilder = (ctx) => {
  const ev = ctx.events.find((e): e is PulseEvents => e.kind === 'pulse');
  if (!ev || ev.orbs.length === 0) return;
  const v = ctx.variation;
  const mouth = ctx.toRow(ev.point);
  const wired = ctx.tier === 'all';

  const orbs = ev.orbs.map((_, j) => {
    let wires: { base: SVGLineElement; glow: SVGLineElement; gradient: SVGLinearGradientElement; head: SVGStopElement } | null = null;
    if (wired) {
      const id = `work-${ctx.robotId}-vent-${j}`;
      const gradient = ctx.defs.appendChild(svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse' }));
      const head = gradient.appendChild(svgEl('stop', { offset: 0, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': 0 }));
      gradient.appendChild(svgEl('stop', { offset: GLOW_FADE_OFFSET, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': 0 }));
      wires = {
        base: ctx.group.appendChild(
          svgEl('line', { class: 'robot__work-wire', stroke: ctx.identityColor, 'stroke-width': VENT_WIRE_WIDTH, 'stroke-linecap': 'round', opacity: 0 }),
        ),
        glow: ctx.group.appendChild(
          svgEl('line', { class: 'robot__work-glow', stroke: `url(#${id})`, 'stroke-width': VENT_WIRE_WIDTH + GLOW_EXTRA_WIDTH, 'stroke-linecap': 'round', opacity: 0 }),
        ),
        gradient,
        head,
      };
    }
    const motes = Array.from({ length: VENT_MOTES }, () =>
      ctx.group.appendChild(svgEl('circle', { class: 'robot__work-mote', fill: GEM_LIGHT_COLOR, r: 0, opacity: 0 })),
    );
    return { wires, motes };
  });

  ctx.run(ev.t0 - VENT_FADE, ev.t1 + VENT_FADE, (t) => {
    const win = ventWindowAlpha(t, ev);
    orbs.forEach(({ wires, motes }, j) => {
      if (wires) {
        const pose = ctx.pose(j);
        for (const node of [wires.base, wires.glow, wires.gradient]) {
          node.setAttribute('x1', String(mouth.x));
          node.setAttribute('y1', String(mouth.y));
          node.setAttribute('x2', String(pose.x));
          node.setAttribute('y2', String(pose.y));
        }
        wires.base.setAttribute('opacity', String(VENT_WIRE_OPACITY * win));
        const glow = wireGlowAlpha(pose.scale, ctx.restScales[j], win);
        wires.head.setAttribute('stop-opacity', String(glow));
        wires.glow.setAttribute('opacity', glow > 0 ? '1' : '0');
      }
      motes.forEach((node, k) => {
        const mote = moteAt(t, j, k, ev, v, mouth);
        if (!mote) {
          if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
          return;
        }
        node.setAttribute('cx', String(mote.x));
        node.setAttribute('cy', String(mote.y));
        node.setAttribute('r', String(mote.r));
        node.setAttribute('opacity', String(mote.alpha * win));
      });
    });
  });
};
