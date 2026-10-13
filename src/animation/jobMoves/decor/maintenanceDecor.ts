// ========================================
// maintenanceDecor (docs/specs/JOB_DECORATION.md §1.8, Task 7)
// ========================================
// Maintenance's decoration: on each flicker chord (the shipped opacity dip, ring.ts) the orbiter
// throws MAINT_SPARKS line sparks outward from its place on the ring that shrink and fade, with a
// brief flash in the light colour. Spark 0 wears the light colour, the rest the robot's identity.
//
// Pure state, thin builder, as haloWaves.ts: `sparkEvents` turns the ring's plan events into one
// event per chord (its time, its fixed place on the ring, its angle); `sparkAt` and `flashAt` are the
// shapes at a time `t`; `addMaintenanceDecor` makes the nodes once and writes those shapes from the
// decoration's one write hook (ctx.run). Everything is in the group's row-local frame, so reach and length
// scale with the back row like the rest of the robot. Ported from the sketch's `maintenance`.
//
// The tween outlives the ring by a spark life (maintenanceWindow): the last chords' sparks play out
// instead of being cut when the ring ends (the spec's window was the ring alone).
//
// Animation only: no AudioEngine, BeatClock or store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import type { DecorBuilder } from './jobDecor';
import type { MoveEvents } from './events';
import { smooth } from './smooth';
import { svgEl } from './svg';
import { RING_SEGMENTS } from '../ring';
import type { OrbiterCorner } from '../sceneToOrbiterLocal';
import type { WorkVariation } from '../variation';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import {
  MAINT_FLASH_RADIUS,
  MAINT_SPARKS,
  MAINT_SPARK_LENGTH,
  MAINT_SPARK_LIFE,
  MAINT_SPARK_REACH,
  MAINT_SPREAD_DEG,
  RING_REVOLUTIONS,
} from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';

// ========================================
// TYPES
// ========================================
type RingEvents = Extract<MoveEvents, { kind: 'ring' }>;

/** One spark chord of one orbiter: when it fires, where on the ring (row-local) and which way is
 *  outward (the ring angle there). */
export interface SparkEvent {
  /** The orbiter's slot in the ring's `orbs`. */
  j: number;
  corner: OrbiterCorner;
  /** The chord's place among this orbiter's spark chords (indexes `sparkDirs`). */
  chordIndex: number;
  /** The ring chord (0 to RING_SEGMENTS - 1). */
  chord: number;
  /** Timeline seconds. */
  time: number;
  /** Radians: the ring angle at the chord's middle. */
  angle: number;
  x: number;
  y: number;
}

/** One spark line, row-local, and whether it wears the light colour. */
export interface SparkShape {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  light: boolean;
}

export interface FlashShape {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

// ========================================
// CONSTANTS
// ========================================
/** The flash lives this fraction of a spark's life (sketch: `u < 0.5`). */
const FLASH_LIFE_FRACTION = 0.5;
const FLASH_OPACITY = 0.8;
const SPARK_WIDTH = 1;
/** `sparkDirs` holds three draws per chord, so spark `s` reads draw `s % SPARK_DRAWS`. */
const SPARK_DRAWS = 3;
const SPREAD_RAD = (MAINT_SPREAD_DEG * Math.PI) / 180;

// ========================================
// STATE
// ========================================
/** Where and when each spark chord fires, orbiters in slot order and chords in run order. `toRow` maps
 *  a scene point into the group's frame (an isotropic map, so the angle is unchanged). The place is
 *  the ring point at the chord's middle angle: the orbiter's chord midpoint is within the ring's
 *  sag (0.2 u at the widest ring) of it. */
export function sparkEvents(ring: RingEvents, toRow: (p: Vec2) => Vec2): SparkEvent[] {
  const events: SparkEvent[] = [];
  ring.orbs.forEach((orb, j) => {
    orb.sparkChords.forEach((chord, chordIndex) => {
      const f = (chord + 0.5) / RING_SEGMENTS;
      const angle = orb.startAngle + ring.direction * 2 * Math.PI * RING_REVOLUTIONS * f;
      const at = toRow({ x: ring.centre.x + ring.radius * Math.cos(angle), y: ring.centre.y + ring.radius * Math.sin(angle) });
      events.push({ j, corner: orb.corner, chordIndex, chord, time: ring.t0 + f * (ring.t1 - ring.t0), angle, x: at.x, y: at.y });
    });
  });
  return events;
}

/** How far through its life the event is at `t`, 0 to 1, or null before it fires and after it dies. */
function ageAt(t: number, e: SparkEvent, v: WorkVariation): number | null {
  const life = MAINT_SPARK_LIFE * v.decor.sparkLife;
  const age = t - e.time;
  return age < 0 || age > life ? null : age / life;
}

/** Spark `s` of the event at time `t`, or null when the event is not alive. */
export function sparkAt(t: number, e: SparkEvent, s: number, v: WorkVariation): SparkShape | null {
  const u = ageAt(t, e, v);
  if (u === null) return null;
  const dir = e.angle + (v.sparkDirs[e.corner][e.chordIndex][s % SPARK_DRAWS] - 0.5) * SPREAD_RAD;
  const reach = MAINT_SPARK_REACH * v.decor.sparkReach * smooth(u);
  const length = MAINT_SPARK_LENGTH * (1 - u);
  const x1 = e.x + Math.cos(dir) * reach;
  const y1 = e.y + Math.sin(dir) * reach;
  return { x1, y1, x2: x1 + Math.cos(dir) * length, y2: y1 + Math.sin(dir) * length, alpha: 1 - u, light: s === 0 };
}

/** The event's flash at time `t`: it shrinks to nothing over the first half of the life. */
export function flashAt(t: number, e: SparkEvent, v: WorkVariation): FlashShape | null {
  const u = ageAt(t, e, v);
  if (u === null || u >= FLASH_LIFE_FRACTION) return null;
  return { x: e.x, y: e.y, r: MAINT_FLASH_RADIUS * (1 - u / FLASH_LIFE_FRACTION), alpha: FLASH_OPACITY };
}

/** The decoration's tween window: the ring, plus one spark life so the last chords play out, never
 *  past the job (the reattach). */
export function maintenanceWindow(ring: RingEvents, v: WorkVariation, duration: number): [number, number] {
  return [ring.t0, Math.min(duration, ring.t1 + MAINT_SPARK_LIFE * v.decor.sparkLife)];
}

// ========================================
// BUILDER
// ========================================
/** Makes the six nodes per spark chord (a flash and MAINT_SPARKS sparks), once, and writes them from
 *  the one write hook. 'cheap' and 'all' draw the same: sparks and the flash are the cheap tier. */
export const addMaintenanceDecor: DecorBuilder = (ctx) => {
  const ring = ctx.events.find((e): e is RingEvents => e.kind === 'ring');
  if (!ring) return;
  const events = sparkEvents(ring, ctx.toRow);
  if (events.length === 0) return;
  const v = ctx.variation;

  const gradientId = `work-${ctx.robotId}-flash`;
  const gradient = ctx.defs.appendChild(svgEl('radialGradient', { id: gradientId }));
  for (const [offset, opacity] of [[0, 0.9], [0.5, 0.25], [1, 0]]) {
    gradient.appendChild(svgEl('stop', { offset, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': opacity }));
  }

  const nodes = events.map(() => ({
    flash: ctx.group.appendChild(svgEl('circle', { class: 'robot__work-flash', fill: `url(#${gradientId})`, r: 0, opacity: 0 })),
    sparks: Array.from({ length: MAINT_SPARKS }, (_, s) =>
      ctx.group.appendChild(
        svgEl('line', {
          class: 'robot__work-spark',
          stroke: s === 0 ? GEM_LIGHT_COLOR : ctx.identityColor,
          'stroke-width': SPARK_WIDTH,
          'stroke-linecap': 'round',
          opacity: 0,
        }),
      ),
    ),
  }));

  const [from, to] = maintenanceWindow(ring, v, ctx.duration);
  ctx.run(from, to, (t) => {
    events.forEach((e, i) => {
      const flash = flashAt(t, e, v);
      const node = nodes[i].flash;
      if (flash) {
        node.setAttribute('cx', String(flash.x));
        node.setAttribute('cy', String(flash.y));
        node.setAttribute('r', String(flash.r));
        node.setAttribute('opacity', String(flash.alpha));
      } else hide(node);

      nodes[i].sparks.forEach((line, s) => {
        const spark = sparkAt(t, e, s, v);
        if (!spark) return hide(line);
        line.setAttribute('x1', String(spark.x1));
        line.setAttribute('y1', String(spark.y1));
        line.setAttribute('x2', String(spark.x2));
        line.setAttribute('y2', String(spark.y2));
        line.setAttribute('opacity', String(spark.alpha));
      });
    });
  });
};

/** Writes opacity 0 once; a node already hidden is left alone. */
function hide(node: Element): void {
  if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
}
