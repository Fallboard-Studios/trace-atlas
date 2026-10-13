// ========================================
// inspectionDecor (docs/specs/JOB_DECORATION.md §1.5, Task 9)
// ========================================
// Structural Inspection's decoration: a short bright trail behind each orbiter as it runs the site's
// outline (INSPECT_TRAIL_SEGMENTS line segments that thin and fade toward the tail, the halo waves'
// tail laid along a path), and at each interior vertex of the outline a small tick, square to the
// path, left by the lead as it passes and fading over INSPECT_TICK_LIFE seconds. The first two trail
// segments wear the light colour, the rest the robot's identity; ticks wear the light colour.
// Ported from the sketch's `structuralInspection`.
//
// Pure state, thin builder, as haloWaves.ts: `trailSegments` and `tickAt` are the maths on a route and
// a time; `addInspectionDecor` makes the nodes once and writes them from the decoration's one write
// hook (ctx.run). Both are time-anchored: an orbiter runs its route at constant speed from the start
// the plan gives it, so its place is `polyAt(route, (t - start) / run)` without reading it back. The
// route is mapped into the group's row-local frame once, so the trail's length and the ticks' size
// scale with the back row like the rest of the robot.
//
// Tier: 'all' draws the trails and the ticks. 'cheap' draws the ticks only (few, no per-orbiter work).
//
// The window outlives the trace by a tick life (inspectionWindow), clamped to the job, so the last
// ticks play out instead of being cut when the trace ends (the spec's window was the trace alone;
// the same fix as maintenanceDecor's). A trail ends the way the sketch's does: it is drawn while its
// orbiter's u is in (0, 1] and gone after.
//
// Animation only: no AudioEngine, BeatClock or store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import type { DecorBuilder } from './jobDecor';
import type { MoveEvents } from './events';
import { polyAt, polyLen, polyVertices, type PolyVertex } from './polyline';
import { svgEl } from './svg';
import type { WorkVariation } from '../variation';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import {
  INSPECT_TICK_LENGTH,
  INSPECT_TICK_LIFE,
  INSPECT_TRAIL_LENGTH,
  INSPECT_TRAIL_OPACITY,
  INSPECT_TRAIL_SEGMENTS,
  INSPECT_TRAIL_WIDTH,
} from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
type TraceEvents = Extract<MoveEvents, { kind: 'trace' }>;

/** One trail segment, in the route's own frame. */
export interface TrailSegment {
  from: Vec2;
  to: Vec2;
  width: number;
  alpha: number;
  /** The first two segments wear the light colour. */
  light: boolean;
}

/** One tick: its two ends, in the route's own frame. */
export interface Tick {
  a: Vec2;
  b: Vec2;
  alpha: number;
}

// ========================================
// CONSTANTS
// ========================================
/** How many leading trail segments wear the light colour (sketch: `k <= 2`). */
const LIGHT_SEGMENTS = 2;
/** A tick's opacity at birth (sketch: `0.9`). */
const TICK_OPACITY = 0.9;
/** A tick grows to its full length over this many seconds (sketch: `age / 0.1`). */
const TICK_GROW = 0.1;
/** A tick's stroke width (sketch: `1`). */
const TICK_WIDTH = 1;

// ========================================
// STATE
// ========================================
/** The orbiter that starts first (rank 0): the one that leaves the ticks. */
function leadStart(ev: TraceEvents): number | null {
  return ev.orbs.length === 0 ? null : Math.min(...ev.orbs.map((orb) => orb.start));
}

/**
 * Orbiter `orbIndex`'s trail at time `t`: INSPECT_TRAIL_SEGMENTS entries, segment k (1-based) running
 * from `u - back (k - 1) / N` to `u - back k / N` along the route, `back` being the trail's length as
 * a fraction of the route. An entry is null once its tail would be behind the route's start. All null
 * unless the orbiter's `u` is in (0, 1], and for a route or a run with no length.
 */
export function trailSegments(t: number, orbIndex: number, ev: TraceEvents, v: WorkVariation): (TrailSegment | null)[] {
  const n = INSPECT_TRAIL_SEGMENTS;
  const segments: (TrailSegment | null)[] = [];
  const orb = ev.orbs[orbIndex];
  const total = polyLen(ev.route);
  const u = orb && ev.run > 0 ? (t - orb.start) / ev.run : 0;
  if (u > 0 && u <= 1 && total > 0) {
    const back = (INSPECT_TRAIL_LENGTH * v.decor.trailLength) / total;
    let from = polyAt(ev.route, u);
    for (let k = 1; k <= n; k++) {
      const tail = u - (back * k) / n;
      if (tail < 0) break;
      const to = polyAt(ev.route, tail);
      const fade = 1 - (k - 1) / n;
      segments.push({ from, to, width: INSPECT_TRAIL_WIDTH * fade, alpha: INSPECT_TRAIL_OPACITY * fade, light: k <= LIGHT_SEGMENTS });
      from = to;
    }
  }
  while (segments.length < n) segments.push(null);
  return segments;
}

/**
 * The tick at `vertex` at time `t`, or null before the lead passes the vertex and after the tick has
 * lived INSPECT_TICK_LIFE seconds (x the tickLife factor). Centred on the vertex and square to its
 * direction, growing to INSPECT_TICK_LENGTH over TICK_GROW seconds and fading linearly from TICK_OPACITY.
 */
export function tickAt(t: number, vertex: PolyVertex, ev: TraceEvents, v: WorkVariation): Tick | null {
  const start = leadStart(ev);
  if (start === null || !(ev.run > 0)) return null;
  const age = t - (start + vertex.u * ev.run);
  const life = INSPECT_TICK_LIFE * v.decor.tickLife;
  if (age < 0 || age > life) return null;
  const half = (INSPECT_TICK_LENGTH * Math.min(1, age / TICK_GROW)) / 2;
  const nx = -vertex.dir.y * half;
  const ny = vertex.dir.x * half;
  return {
    a: { x: vertex.p.x - nx, y: vertex.p.y - ny },
    b: { x: vertex.p.x + nx, y: vertex.p.y + ny },
    alpha: TICK_OPACITY * (1 - age / life),
  };
}

/** The decoration's window: the trace, plus one tick life for the last ticks to play out, clamped to
 *  the job so it never lengthens the timeline. */
export function inspectionWindow(ev: TraceEvents, v: WorkVariation, duration: number): [number, number] {
  return [ev.t0, Math.min(duration, ev.t1 + INSPECT_TICK_LIFE * v.decor.tickLife)];
}

// ========================================
// BUILDER
// ========================================
function hide(node: Element): void {
  if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
}

function place(node: Element, a: Vec2, b: Vec2): void {
  node.setAttribute('x1', String(a.x));
  node.setAttribute('y1', String(a.y));
  node.setAttribute('x2', String(b.x));
  node.setAttribute('y2', String(b.y));
}

/** Makes, per orbiter, INSPECT_TRAIL_SEGMENTS trail lines (tier 'all') and, per interior vertex of the
 *  route, one tick line, once, and writes them from the one write hook over the trace and a tick life. */
export const addInspectionDecor: DecorBuilder = (ctx) => {
  const ev = ctx.events.find((e): e is TraceEvents => e.kind === 'trace');
  if (!ev || ev.orbs.length === 0) return;
  const v = ctx.variation;
  const route = ev.route.map(ctx.toRow);
  if (!(ev.run > 0) || !(polyLen(route) > 0)) return;
  const row: TraceEvents = { ...ev, route };

  const trails =
    ctx.tier === 'all'
      ? ev.orbs.map(() =>
          Array.from({ length: INSPECT_TRAIL_SEGMENTS }, (_, i) =>
            ctx.group.appendChild(
              svgEl('line', {
                class: 'robot__work-trail',
                stroke: i < LIGHT_SEGMENTS ? GEM_LIGHT_COLOR : ctx.identityColor,
                'stroke-linecap': 'round',
                opacity: 0,
              }),
            ),
          ),
        )
      : [];
  const ticks = polyVertices(route)
    .slice(1, -1)
    .map((vertex) => ({
      vertex,
      node: ctx.group.appendChild(
        svgEl('line', { class: 'robot__work-tick', stroke: GEM_LIGHT_COLOR, 'stroke-width': TICK_WIDTH, 'stroke-linecap': 'round', opacity: 0 }),
      ),
    }));
  if (trails.length === 0 && ticks.length === 0) return;

  const [t0, t1] = inspectionWindow(ev, v, ctx.duration);
  ctx.run(t0, t1, (t) => {
    trails.forEach((nodes, j) => {
      trailSegments(t, j, row, v).forEach((seg, k) => {
        const node = nodes[k];
        if (!seg) return hide(node);
        place(node, seg.from, seg.to);
        node.setAttribute('stroke-width', String(seg.width));
        node.setAttribute('opacity', String(seg.alpha));
      });
    });
    ticks.forEach(({ vertex, node }) => {
      const tick = tickAt(t, vertex, row, v);
      if (!tick) return hide(node);
      place(node, tick.a, tick.b);
      node.setAttribute('opacity', String(tick.alpha));
    });
  });
};
