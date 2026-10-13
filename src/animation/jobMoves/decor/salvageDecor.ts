// ========================================
// salvageDecor (docs/specs/JOB_DECORATION.md §1.7, Task 12)
// ========================================
// Salvage's decoration: a small gem load hangs on wires below the carrying orbiters. It grows at the
// pick-up as they shrink, swings a little on the carry, and shrinks away at the drop as they grow back;
// on the return the wires go slack, still tied to the drop point, sagging and fading. The wires wear
// the robot's identity, the load's fill that identity eight lightness points darker, and its outline
// and glow the light colour. Ported from the sketch's `salvage`.
//
// Pure state, thin builder, as haloWaves.ts: `loadScale`, `swingAngle`, `loadPose` and `slackWire` are
// the maths; `addSalvageDecor` makes the nodes once and writes them from the decoration's one write
// hook (ctx.run). The wires and the load follow the orbiters' live centres (ctx.pose), so they track
// the shrink, the carry and the return exactly; the drop point is a fixed scene point. Everything is in
// the group's row-local frame, so hang, size and sag scale with the back row. The phases are the carry
// move's own (carry.ts), so the load is full exactly while the orbiters are loaded.
//
// Tier: 'all' only. The spec's tier lists name no salvage shape for 'cheap' (the load and its wires are
// the 'all' additions), so a cheap salvage draws nothing and leaves no group.
//
// The load is gone by DROPPED and the slack wires by RETURNED, so every shape is invisible at both
// ends of the carry window and nothing outlives it.
//
// Animation only: no AudioEngine, BeatClock or store (Strict Separation).

// ========================================
// IMPORTS
// ========================================
import { ARRIVED, DROPPED, LOADED, RETURNED } from '../carry';
import type { DecorBuilder } from './jobDecor';
import type { MoveEvents } from './events';
import { smooth } from './smooth';
import { svgEl } from './svg';
import type { WorkVariation } from '../variation';
import { GEM_LIGHT_COLOR } from '../../../components/robot/gem/gemPalette';
import { SALVAGE_HANG, SALVAGE_LOAD_SIZE, SALVAGE_SAG, SALVAGE_SWING_DEG, SALVAGE_WIRE_OPACITY } from '../../../constants';
import type { Vec2 } from '../../../types/Vec2';
import { hexToHsl, hslToString } from '../../../utils/colorUtils';

// ========================================
// TYPES
// ========================================
type CarryEvents = Extract<MoveEvents, { kind: 'carry' }>;

/** The load at a time `f` through the carry. Positions and sizes are row-local. */
export interface LoadPose {
  /** Where the load hangs. */
  centre: Vec2;
  /** The swing, degrees; the shape turns by `rotation`, 1.5 times it. */
  swing: number;
  rotation: number;
  shape: 'diamond' | 'hex';
  /** The outline about its own origin; the node is translated to `centre` and rotated. */
  points: Vec2[];
  size: number;
  glowRadius: number;
  alpha: number;
  glowAlpha: number;
  wireAlpha: number;
}

/** A slack wire: its path data and its opacity. */
export interface SlackWire {
  d: string;
  alpha: number;
}

// ========================================
// CONSTANTS
// ========================================
/** The load's opacity, its glow's radius as a multiple of its size, and the glow's opacity. */
const LOAD_OPACITY = 0.95;
const GLOW_RADIUS = 1.8;
const GLOW_OPACITY = 0.45;
/** The shape turns by this multiple of the swing angle. */
const ROTATION_PER_SWING = 1.5;
/** Half-widths of the two shapes as a fraction of the size: the diamond's, and the hexagon's (whose
 *  side vertices also sit at half the size up and down). */
const DIAMOND_WIDTH = 0.7;
const HEX_WIDTH = 0.85;
const HEX_SHOULDER = 0.5;
/** A load seed under this draws a diamond; from it up, a hexagon. */
const DIAMOND_BELOW = 0.5;
/** The load's fill is the identity this many lightness points darker; its outline is this wide. */
const FILL_LIGHTNESS_DROP = 8;
const LOAD_OUTLINE_WIDTH = 0.8;
/** The wires and the slack wires are this wide. */
const WIRE_WIDTH = 0.7;
/** Where the swing sits in the carry: it turns three half-waves, enveloped by one. */
const SWING_HALF_WAVES = 3;

// ========================================
// STATE
// ========================================
const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The load's scale at `f` through the carry: it grows over the first LOADED, holds until ARRIVED,
 *  shrinks to nothing by DROPPED, and is 0 outside the move. */
export function loadScale(f: number): number {
  if (!(f > 0) || f >= DROPPED) return 0;
  if (f < LOADED) return smooth(f / LOADED);
  if (f <= ARRIVED) return 1;
  return 1 - smooth((f - ARRIVED) / (DROPPED - ARRIVED));
}

/** The load's swing in degrees at `f`: 0 except while carrying (between LOADED and ARRIVED), then
 *  `sin(phi x 3 pi + swingPhase) x SALVAGE_SWING_DEG x sin(phi pi)` for `phi` the fraction of the
 *  carry, so it starts and ends still. */
export function swingAngle(f: number, v: WorkVariation): number {
  if (!(f > LOADED && f < ARRIVED)) return 0;
  const phi = (f - LOADED) / (ARRIVED - LOADED);
  return Math.sin(phi * Math.PI * SWING_HALF_WAVES + v.swingPhase) * SALVAGE_SWING_DEG * Math.sin(phi * Math.PI);
}

/**
 * The load at `f` through the carry, hung from the centroid of the orbiters' live `centres`: SALVAGE_HANG
 * x `hang` below it along the swung direction, SALVAGE_LOAD_SIZE x `loadSize` x its scale across, a
 * diamond for a load seed under .5 and a hexagon from it. Null while it has no scale or nothing to hang from.
 */
export function loadPose(f: number, centres: readonly Vec2[], v: WorkVariation): LoadPose | null {
  const scale = loadScale(f);
  if (!(scale > 0) || centres.length === 0) return null;
  const mid = {
    x: centres.reduce((s, p) => s + p.x, 0) / centres.length,
    y: centres.reduce((s, p) => s + p.y, 0) / centres.length,
  };
  const swing = swingAngle(f, v);
  const hang = SALVAGE_HANG * v.decor.hang;
  const size = SALVAGE_LOAD_SIZE * v.decor.loadSize * scale;
  const diamond = v.loadSeed < DIAMOND_BELOW;
  const s = size;
  return {
    centre: { x: mid.x + Math.sin((swing * Math.PI) / 180) * hang, y: mid.y + Math.cos((swing * Math.PI) / 180) * hang },
    swing,
    rotation: swing * ROTATION_PER_SWING,
    shape: diamond ? 'diamond' : 'hex',
    points: diamond
      ? [{ x: 0, y: -s }, { x: s * DIAMOND_WIDTH, y: 0 }, { x: 0, y: s }, { x: -s * DIAMOND_WIDTH, y: 0 }]
      : [
          { x: 0, y: -s },
          { x: s * HEX_WIDTH, y: -s * HEX_SHOULDER },
          { x: s * HEX_WIDTH, y: s * HEX_SHOULDER },
          { x: 0, y: s },
          { x: -s * HEX_WIDTH, y: s * HEX_SHOULDER },
          { x: -s * HEX_WIDTH, y: -s * HEX_SHOULDER },
        ],
    size,
    glowRadius: size * GLOW_RADIUS,
    alpha: LOAD_OPACITY * scale,
    glowAlpha: GLOW_OPACITY * scale,
    wireAlpha: SALVAGE_WIRE_OPACITY * scale,
  };
}

/**
 * The slack wire from an orbiter at `from` back up to the drop (the carry's drop point `b`, SALVAGE_HANG
 * x `hang` below it), for `f` from DROPPED up to RETURNED: a quadratic that bows SALVAGE_SAG x
 * smooth(q) below the lower end and fades linearly with `q`, the fraction of the return. Null otherwise.
 */
export function slackWire(f: number, from: Vec2, b: Vec2, v: WorkVariation): SlackWire | null {
  if (!(f >= DROPPED && f < RETURNED)) return null;
  const q = (f - DROPPED) / (RETURNED - DROPPED);
  const drop = { x: b.x, y: b.y + SALVAGE_HANG * v.decor.hang };
  const cx = (from.x + drop.x) / 2;
  const cy = Math.max(from.y, drop.y) + SALVAGE_SAG * smooth(q);
  return {
    d: `M${round(from.x)} ${round(from.y)}Q${round(cx)} ${round(cy)} ${round(drop.x)} ${round(drop.y)}`,
    alpha: SALVAGE_WIRE_OPACITY * (1 - q),
  };
}

// ========================================
// BUILDER
// ========================================
function hide(node: Element): void {
  if (node.getAttribute('opacity') !== '0') node.setAttribute('opacity', '0');
}

/** Makes, once, a wire and a slack wire per orbiter, the load's glow and the load itself (tier 'all',
 *  when there are orbiters and the carry has some length), and writes them from the one write hook
 *  over the carry. */
export const addSalvageDecor: DecorBuilder = (ctx) => {
  const ev = ctx.events.find((e): e is CarryEvents => e.kind === 'carry' && e.orbs.length > 0);
  if (ctx.tier !== 'all' || !ev || !(ev.t1 > ev.t0)) return;
  const v = ctx.variation;
  const drop = ctx.toRow(ev.b);
  const hsl = hexToHsl(ctx.identityColor);

  const gradientId = `work-${ctx.robotId}-salvage-glow`;
  const gradient = ctx.defs.appendChild(svgEl('radialGradient', { id: gradientId }));
  for (const [offset, opacity] of [[0, 0.9], [0.5, 0.25], [1, 0]]) {
    gradient.appendChild(svgEl('stop', { offset, 'stop-color': GEM_LIGHT_COLOR, 'stop-opacity': opacity }));
  }

  const wireNodes = ev.orbs.map(() =>
    ctx.group.appendChild(
      svgEl('line', { class: 'robot__work-wire', stroke: ctx.identityColor, 'stroke-width': WIRE_WIDTH, 'stroke-linecap': 'round', opacity: 0 }),
    ),
  );
  const glowNode = ctx.group.appendChild(
    svgEl('circle', { class: 'robot__work-load-glow', fill: `url(#${gradientId})`, r: 0, opacity: 0 }),
  );
  const loadNode = ctx.group.appendChild(
    svgEl('polygon', {
      class: 'robot__work-load',
      fill: hslToString({ ...hsl, l: Math.max(0, hsl.l - FILL_LIGHTNESS_DROP) }),
      stroke: GEM_LIGHT_COLOR,
      'stroke-width': LOAD_OUTLINE_WIDTH,
      opacity: 0,
    }),
  );
  const slackNodes = ev.orbs.map(() =>
    ctx.group.appendChild(
      svgEl('path', { class: 'robot__work-slack', fill: 'none', stroke: ctx.identityColor, 'stroke-width': WIRE_WIDTH, opacity: 0 }),
    ),
  );

  const length = ev.t1 - ev.t0;
  ctx.run(ev.t0, ev.t1, (t) => {
    const f = (t - ev.t0) / length;
    const carrying = loadScale(f) > 0;
    const slack = f >= DROPPED && f < RETURNED;
    if (!carrying && !slack) {
      for (const node of [...wireNodes, glowNode, loadNode, ...slackNodes]) hide(node);
      return;
    }
    const poses = ev.orbs.map((_, j) => ctx.pose(j));

    const pose = carrying ? loadPose(f, poses, v) : null;
    if (pose) {
      wireNodes.forEach((node, j) => {
        node.setAttribute('x1', String(poses[j].x));
        node.setAttribute('y1', String(poses[j].y));
        node.setAttribute('x2', String(pose.centre.x));
        node.setAttribute('y2', String(pose.centre.y));
        node.setAttribute('opacity', String(pose.wireAlpha));
      });
      glowNode.setAttribute('cx', String(pose.centre.x));
      glowNode.setAttribute('cy', String(pose.centre.y));
      glowNode.setAttribute('r', String(pose.glowRadius));
      glowNode.setAttribute('opacity', String(pose.glowAlpha));
      loadNode.setAttribute('points', pose.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' '));
      loadNode.setAttribute('transform', `translate(${pose.centre.x} ${pose.centre.y}) rotate(${pose.rotation})`);
      loadNode.setAttribute('opacity', String(pose.alpha));
    } else {
      for (const node of [...wireNodes, glowNode, loadNode]) hide(node);
    }

    slackNodes.forEach((node, j) => {
      const wire = slack ? slackWire(f, poses[j], drop, v) : null;
      if (!wire) return hide(node);
      node.setAttribute('d', wire.d);
      node.setAttribute('opacity', String(wire.alpha));
    });
  });
};
