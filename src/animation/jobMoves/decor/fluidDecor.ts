// ========================================
// fluidDecor (docs/specs/JOB_DECORATION.md §1.6, Task 10)
// ========================================
// Fluid Monitoring's decoration: FLUID_DROPS droplets that flow along the pipe behind the lead
// orbiter, each a beat behind the one before and fainter and smaller down the line, and at the valve
// a small square that spins while the orbiters pulse, its spin stepping up with every pulse, and
// fades out as the move ends. The drops, the glow and the valve's outline wear the light colour; the
// valve's inner square wears the robot's identity. Ported from the sketch's `fluidMonitoring`.
//
// Pure state, thin builder, as haloWaves.ts: `dropAt`, `valveAngle`, `valveState` and `fluidWindow`
// are the maths; `addFluidDecor` makes the nodes once and writes them from the decoration's one write
// hook (ctx.run). Both halves are time-anchored (the lead runs the pipe at constant speed from the
// start the plan gives it, and the valve sits at a fixed point), so nothing reads a live orbiter. The
// pipe and the valve point are mapped into the group's row-local frame once, so size and reach scale
// with the back row.
//
// Tier: 'all' draws the drops and the valve. 'cheap' draws the valve only (three nodes).
//
// One window spans the trace start to the pulse end, so the drops that are still on the pipe when
// the pulse begins keep flowing under the valve. A drop is drawn while its u is in (0, 1], as in the
// sketch: it appears at the pipe's start and vanishes at its end.
//
// Animation only: no AudioEngine, BeatClock or store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import type { DecorBuilder } from './jobDecor';
import type { MoveEvents } from './events';
import { polyAt, polyLen } from './polyline';
import { svgEl } from './svg';
import type { WorkVariation } from '../variation';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import {
  FLUID_DROPS,
  FLUID_DROP_LAG,
  FLUID_DROP_RADIUS,
  FLUID_SPIN_BASE,
  FLUID_SPIN_STEP,
  FLUID_VALVE_FADE,
  FLUID_VALVE_SIZE,
} from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
type TraceEvents = Extract<MoveEvents, { kind: 'trace' }>;
type PulseEvents = Extract<MoveEvents, { kind: 'pulse' }>;

/** One droplet, in the route's own frame. `alpha` is the drop's own opacity. */
export interface Drop {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** The valve at a time `t`: its window alpha (0 to 1), its size across, and its angle in degrees. */
export interface ValveState {
  win: number;
  size: number;
  angle: number;
}

// ========================================
// CONSTANTS
// ========================================
/** A drop's opacity at the head of the line (sketch: `0.85 * fade`). */
const DROP_OPACITY = 0.85;
/** How far a drop wobbles off the pipe, and how fast (sketch: `sin(t * 9 + k) * 0.8`). */
const DROP_WOBBLE = 0.8;
const DROP_WOBBLE_RATE = 9;
/** The glow behind the valve: its radius as a multiple of the valve's size, and its opacity. */
const GLOW_RADIUS = 1.4;
const GLOW_OPACITY = 0.5;
/** The outer outline: its stroke width and opacity. The inner square: its side as a fraction of the
 *  valve's size, and its opacity (sketch: `h * 0.9` of a half-side `h`). */
const OUTLINE_WIDTH = 1;
const OUTLINE_OPACITY = 0.9;
const CORE_FRACTION = 0.45;
const CORE_OPACITY = 0.8;

// ========================================
// STATE
// ========================================
/** The orbiter that starts first (rank 0): the one the drops follow. */
function leadStart(ev: TraceEvents): number | null {
  return ev.orbs.length === 0 ? null : Math.min(...ev.orbs.map((orb) => orb.start));
}

/**
 * Droplet `k` (1-based) at time `t`, or null before it leaves the start of the pipe and after it
 * reaches the end. It follows the lead by `k x FLUID_DROP_LAG x dropLag` seconds along the route, wobbling
 * a little off it, and shrinks and fades down the line (`fade = 1 - (k - 1) / FLUID_DROPS`).
 */
export function dropAt(t: number, k: number, ev: TraceEvents, v: WorkVariation): Drop | null {
  const start = leadStart(ev);
  if (start === null || !(ev.run > 0) || ev.route.length === 0) return null;
  const u = (t - start - k * FLUID_DROP_LAG * v.decor.dropLag) / ev.run;
  if (!(u > 0 && u <= 1)) return null;
  const at = polyAt(ev.route, u);
  const fade = 1 - (k - 1) / FLUID_DROPS;
  return {
    x: at.x,
    y: at.y + Math.sin(t * DROP_WOBBLE_RATE + k) * DROP_WOBBLE,
    r: FLUID_DROP_RADIUS * (0.6 + 0.4 * fade),
    alpha: DROP_OPACITY * fade,
  };
}

/**
 * The valve's angle in degrees at `t`: zero at `t0`, turning at `base` degrees a second and gaining
 * `step` at each pulse start (the starts in any order). The integral is piecewise linear, so it is
 * continuous across every start. The plan starts the first pulse at the move's own `t0`, so in a real
 * run the base rate only applies to a zero-length stretch and the first pulse already turns at
 * `base + step`; a `t0` before the first start gives the base rate its stretch.
 */
export function valveAngle(t: number, t0: number, starts: readonly number[], base: number, step: number): number {
  if (!(t > t0)) return 0;
  let angle = 0;
  let rate = base;
  let last = t0;
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (s > t) break;
    const at = Math.max(s, last);
    angle += rate * (at - last);
    last = at;
    rate += step;
  }
  return angle + rate * (t - last);
}

/** The valve at `t`: faded in and out over FLUID_VALVE_FADE at both ends of the pulse window, sized
 *  FLUID_VALVE_SIZE x its factor x that fade, turning by `valveAngle` over the orbiters' start times. */
export function valveState(t: number, ev: PulseEvents, v: WorkVariation): ValveState {
  const win = Math.min(1, Math.max(0, Math.min((t - ev.t0) / FLUID_VALVE_FADE, (ev.t1 - t) / FLUID_VALVE_FADE)));
  return {
    win,
    size: FLUID_VALVE_SIZE * v.decor.valveSize * win,
    angle: valveAngle(t, ev.t0, ev.orbs.map((orb) => orb.start), FLUID_SPIN_BASE, FLUID_SPIN_STEP),
  };
}

/** The decoration's window: the earliest of the moves' starts to the latest of their ends; null with
 *  neither move. */
export function fluidWindow(trace: TraceEvents | undefined, pulse: PulseEvents | undefined): [number, number] | null {
  const moves = [trace, pulse].filter((m): m is TraceEvents | PulseEvents => m !== undefined);
  if (moves.length === 0) return null;
  return [Math.min(...moves.map((m) => m.t0)), Math.max(...moves.map((m) => m.t1))];
}

// ========================================
// BUILDER
// ========================================
function hide(node: Element): void {
  if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
}

/** Makes, once, FLUID_DROPS drops (tier 'all', when there is a pipe to run) and the valve's glow,
 *  outline and inner square (when there is a pulse), and writes them from the one write hook. */
export const addFluidDecor: DecorBuilder = (ctx) => {
  const traceEv = ctx.events.find((e): e is TraceEvents => e.kind === 'trace' && e.orbs.length > 0);
  const pulseEv = ctx.events.find((e): e is PulseEvents => e.kind === 'pulse' && e.orbs.length > 0);
  const v = ctx.variation;

  const route = traceEv ? traceEv.route.map(ctx.toRow) : [];
  const row = traceEv ? { ...traceEv, route } : undefined;
  const flows = ctx.tier === 'all' && row !== undefined && row.run > 0 && polyLen(route) > 0;
  const valved = pulseEv !== undefined;
  const window = fluidWindow(flows ? traceEv : undefined, pulseEv);
  if (!window || (!flows && !valved)) return;

  const dropNodes = flows
    ? Array.from({ length: FLUID_DROPS }, () =>
        ctx.group.appendChild(svgEl('circle', { class: 'robot__work-drop', fill: GEM_LIGHT_COLOR, r: 0, opacity: 0 })),
      )
    : [];

  let valve: { glow: SVGCircleElement; outer: SVGRectElement; core: SVGRectElement; centre: Vec2 } | null = null;
  if (pulseEv) {
    const centre = ctx.toRow(pulseEv.point);
    const gradientId = `work-${ctx.robotId}-fluid-glow`;
    const gradient = ctx.defs.appendChild(svgEl('radialGradient', { id: gradientId }));
    for (const [offset, opacity] of [[0, 0.9], [0.5, 0.25], [1, 0]]) {
      gradient.appendChild(svgEl('stop', { offset, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': opacity }));
    }
    valve = {
      centre,
      glow: ctx.group.appendChild(
        svgEl('circle', { class: 'robot__work-valve-glow', fill: `url(#${gradientId})`, cx: centre.x, cy: centre.y, r: 0, opacity: 0 }),
      ),
      outer: ctx.group.appendChild(
        svgEl('rect', {
          class: 'robot__work-valve',
          fill: 'none',
          stroke: GEM_LIGHT_COLOR,
          'stroke-width': OUTLINE_WIDTH,
          opacity: 0,
        }),
      ),
      core: ctx.group.appendChild(svgEl('rect', { class: 'robot__work-valve-core', fill: ctx.identityColor, opacity: 0 })),
    };
  }

  ctx.run(window[0], window[1], (t) => {
    dropNodes.forEach((node, idx) => {
      const drop = row ? dropAt(t, idx + 1, row, v) : null;
      if (!drop) return hide(node);
      node.setAttribute('cx', String(drop.x));
      node.setAttribute('cy', String(drop.y));
      node.setAttribute('r', String(drop.r));
      node.setAttribute('opacity', String(drop.alpha));
    });
    if (!valve || !pulseEv) return;
    const { win, size, angle } = valveState(t, pulseEv, v);
    if (!(win > 0)) {
      hide(valve.glow);
      hide(valve.outer);
      hide(valve.core);
      return;
    }
    const { x, y } = valve.centre;
    valve.glow.setAttribute('r', String(size * GLOW_RADIUS));
    valve.glow.setAttribute('opacity', String(GLOW_OPACITY));
    const square = (node: SVGRectElement, side: number, turn: number, opacity: number) => {
      node.setAttribute('x', String(x - side / 2));
      node.setAttribute('y', String(y - side / 2));
      node.setAttribute('width', String(side));
      node.setAttribute('height', String(side));
      node.setAttribute('transform', `rotate(${turn} ${x} ${y})`);
      node.setAttribute('opacity', String(opacity));
    };
    square(valve.outer, size, angle, OUTLINE_OPACITY * win);
    square(valve.core, size * CORE_FRACTION, -angle, CORE_OPACITY * win);
  });
};
