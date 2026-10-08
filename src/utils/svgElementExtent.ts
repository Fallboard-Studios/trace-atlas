// ========================================
// svgElementExtent (Phase 43 Task 32)
// ========================================
// The box a piece of renderer JSX draws, read straight from its elements' props — no DOM, no
// getBBox — so a derived silhouette is the renderer's own geometry, never a copy of its maths.
// Used for the layer-switch silhouettes (systems/midgroundSilhouettes.ts): a robot must not change
// robot layer while overlapping anything solid drawn between the two layers.
//
// Measures rect, circle, ellipse, polygon, line and M/L/A/Z paths, through `rotate(deg cx cy)`
// groups, widened by half the stroke width when stroked, and expands plain function components.
// Light and water (SILHOUETTE_DECORATION) and `defs` are not silhouette and are skipped. Anything
// it can't measure exactly — another transform, a curve command, text — throws rather than
// under-report.

// ========================================
// IMPORTS
// ========================================
import { Fragment, isValidElement, type ReactNode } from 'react';

import type { Vec2 } from '../types/Vec2';

// ========================================
// TYPES
// ========================================
export interface Extent {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Where a shape's own coordinates land: the composed rotations of its groups. */
interface Frame {
  /** Total rotation, degrees. */
  deg: number;
  map: (p: Vec2) => Vec2;
}

type Props = Record<string, unknown>;

// ========================================
// CONSTANTS
// ========================================
/** Translucent light and water, not silhouette: vent plumes, floodlight beams and ground pools. */
export const SILHOUETTE_DECORATION: readonly (readonly [string, string])[] = [
  ['data-vent', 'plume'],
  ['data-floodlight', 'beam'],
  ['data-floodlight', 'pool'],
];

/** Elements that draw nothing themselves. */
const NOT_DRAWN = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'filter', 'title', 'desc']);

/** Elements whose children draw, in the same place. */
const CONTAINERS = new Set(['g', 'svg']);

const IDENTITY: Frame = { deg: 0, map: (p) => p };

// ========================================
// HELPERS
// ========================================
const num = (v: unknown, fallback = 0): number => (v === undefined || v === null ? fallback : Number(v));

function rotated(frame: Frame, deg: number, cx: number, cy: number): Frame {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return {
    deg: frame.deg + deg,
    map: ({ x, y }) => frame.map({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c }),
  };
}

/** A group's frame: `rotate(deg)` or `rotate(deg cx cy)` only. */
function groupFrame(frame: Frame, transform: unknown): Frame {
  if (transform === undefined || transform === null || transform === '') return frame;
  const m = String(transform).match(/^\s*rotate\(\s*([-\d.e]+)(?:[\s,]+([-\d.e]+)[\s,]+([-\d.e]+))?\s*\)\s*$/);
  if (!m) throw new Error(`svgElementExtent: unsupported transform "${String(transform)}"`);
  return rotated(frame, Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0));
}

function boxOf(points: Vec2[]): Extent {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function union(a: Extent | null, b: Extent | null): Extent | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

function polygonPoints(points: unknown): Vec2[] {
  const n = String(points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

/**
 * An unrotated elliptical arc's extreme points (SVG's endpoint → centre conversion, F.6.5): its
 * two ends plus every axis extreme of its ellipse that the sweep passes.
 */
function arcPoints(p0: Vec2, rxIn: number, ryIn: number, large: boolean, sweep: boolean, p1: Vec2): Vec2[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [p0, p1];
  const hx = (p0.x - p1.x) / 2;
  const hy = (p0.y - p1.y) / 2;
  const grow = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry);
  if (grow > 1) {
    rx *= Math.sqrt(grow);
    ry *= Math.sqrt(grow);
  }
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0,
    (rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx) / (rx * rx * hy * hy + ry * ry * hx * hx)));
  const cxp = (k * rx * hy) / ry;
  const cyp = (-k * ry * hx) / rx;
  const cx = cxp + (p0.x + p1.x) / 2;
  const cy = cyp + (p0.y + p1.y) / 2;
  const t0 = Math.atan2((hy - cyp) / ry, (hx - cxp) / rx);
  let dt = Math.atan2((-hy - cyp) / ry, (-hx - cxp) / rx) - t0;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  if (!sweep && dt > 0) dt -= 2 * Math.PI;

  const points = [p0, p1];
  const [lo, hi] = dt >= 0 ? [t0, t0 + dt] : [t0 + dt, t0];
  for (let q = Math.ceil(lo / (Math.PI / 2)); q * (Math.PI / 2) <= hi; q++) {
    const t = q * (Math.PI / 2);
    points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
  }
  return points;
}

/** An M/L/A/Z path's extreme points (absolute commands only). */
function pathPoints(d: string, frame: Frame): Vec2[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const points: Vec2[] = [];
  let i = 0;
  let cmd = '';
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      points.push({ x: next(), y: next() });
    } else if (cmd === 'A') {
      const rx = next(); const ry = next(); const axis = next(); const large = next() === 1; const sweep = next() === 1;
      const end = { x: next(), y: next() };
      if (axis !== 0 || frame.deg % 360 !== 0) throw new Error(`svgElementExtent: rotated arc in path "${d}"`);
      points.push(...arcPoints(points[points.length - 1], rx, ry, large, sweep, end));
    } else if (cmd !== 'Z' && cmd !== 'z') {
      throw new Error(`svgElementExtent: unsupported path command "${cmd}" in "${d}"`);
    }
  }
  return points;
}

/** One shape's extent in the scene, before its stroke. */
function shapeExtent(type: string, p: Props, frame: Frame): Extent | null {
  switch (type) {
    case 'rect': {
      const x = num(p.x); const y = num(p.y); const w = num(p.width); const h = num(p.height);
      return boxOf([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(frame.map));
    }
    case 'circle': {
      const c = frame.map({ x: num(p.cx), y: num(p.cy) });
      const r = num(p.r);
      return { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r };
    }
    case 'ellipse': {
      // A rotated ellipse's exact box: half-sizes √(rx²cos² + ry²sin²) and √(rx²sin² + ry²cos²).
      const c = frame.map({ x: num(p.cx), y: num(p.cy) });
      const rx = num(p.rx); const ry = num(p.ry);
      const phi = (frame.deg * Math.PI) / 180;
      const hx = Math.hypot(rx * Math.cos(phi), ry * Math.sin(phi));
      const hy = Math.hypot(rx * Math.sin(phi), ry * Math.cos(phi));
      return { x0: c.x - hx, y0: c.y - hy, x1: c.x + hx, y1: c.y + hy };
    }
    case 'polygon': {
      const points = polygonPoints(p.points);
      return points.length ? boxOf(points.map(frame.map)) : null;
    }
    case 'line':
      return boxOf([{ x: num(p.x1), y: num(p.y1) }, { x: num(p.x2), y: num(p.y2) }].map(frame.map));
    case 'path': {
      const points = pathPoints(String(p.d ?? ''), frame);
      return points.length ? boxOf(points.map(frame.map)) : null;
    }
    default:
      throw new Error(`svgElementExtent: cannot measure <${type}>`);
  }
}

/** Half the stroke width outside the shape, when it has a visible stroke. */
function withStroke(e: Extent | null, p: Props): Extent | null {
  if (!e || !p.stroke || p.stroke === 'none') return e;
  const half = num(p.strokeWidth ?? p['stroke-width'], 1) / 2;
  return { x0: e.x0 - half, y0: e.y0 - half, x1: e.x1 + half, y1: e.y1 + half };
}

const isDecoration = (p: Props) => SILHOUETTE_DECORATION.some(([attr, value]) => p[attr] === value);

function walk(node: ReactNode, frame: Frame): Extent | null {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return null;
  if (Array.isArray(node)) return node.reduce<Extent | null>((acc, child) => union(acc, walk(child, frame)), null);
  if (!isValidElement(node)) throw new Error('svgElementExtent: not a React element');

  const props = node.props as Props;
  const { type } = node;
  if (type === Fragment) return walk(props.children as ReactNode, frame);
  if (typeof type === 'function') {
    if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
      throw new Error('svgElementExtent: class components are not expanded');
    }
    return walk((type as (p: Props) => ReactNode)(props), frame);
  }
  if (typeof type !== 'string') throw new Error('svgElementExtent: cannot expand a memo/forwardRef component');
  if (NOT_DRAWN.has(type) || isDecoration(props)) return null;
  if (CONTAINERS.has(type)) return walk(props.children as ReactNode, groupFrame(frame, props.transform));
  return withStroke(shapeExtent(type, props, frame), props);
}

// ========================================
// API
// ========================================
/**
 * The box the JSX `node` draws, in its own coordinates, or null when it draws nothing solid.
 * Pure. Throws on anything it can't measure exactly.
 */
export function svgElementExtent(node: ReactNode): Extent | null {
  return walk(node, IDENTITY);
}
