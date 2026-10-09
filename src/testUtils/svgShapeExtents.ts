// ========================================
// svgShapeExtents — test helper (render parity)
// ========================================
// The drawn extent of every solid shape in a rendered SVG container, so a test can hold a derived
// box (work-site bounds, layer-switch silhouettes) against what the renderer really draws. jsdom
// has no getBBox, so each element's geometry is read from its attributes, through a `rotate(deg cx
// cy)` on its nearest transformed ancestor. Moved out of sceneryWorkAnchors.test.tsx (Phase 43);
// arc paths added for the layer-switch silhouettes.

import type { Vec2 } from '../types/Vec2';

export interface ShapeExtent {
  el: Element;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Translucent light and water, not silhouette: plumes, the floodlight's beam and ground pool. */
export const DECORATION = '[data-vent="plume"], [data-floodlight="beam"], [data-floodlight="pool"]';

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

/** The `rotate(deg cx cy)` on the element's nearest transformed ancestor, as a point mapper. */
export function rotationOf(el: Element): (p: Vec2) => Vec2 {
  const g = el.closest('g[transform]');
  const m = g?.getAttribute('transform')?.match(/rotate\(\s*([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)\s*\)/);
  if (!m) return (p) => p;
  const [deg, cx, cy] = m.slice(1).map(Number);
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  return ({ x, y }) => ({ x: cx + (x - cx) * c - (y - cy) * s, y: cy + (x - cx) * s + (y - cy) * c });
}

function extentOf(el: Element, pts: Vec2[]): ShapeExtent {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { el, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/**
 * Points along an unrotated SVG elliptical arc from `p0` to `p1` (the spec's endpoint → centre
 * conversion, F.6.5), sampled finely enough for a 1e-3 extent at scene sizes.
 */
function arcPoints(p0: Vec2, rxIn: number, ryIn: number, large: boolean, sweep: boolean, p1: Vec2): Vec2[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const hx = (p0.x - p1.x) / 2;
  const hy = (p0.y - p1.y) / 2;
  const scale = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const num2 = rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx;
  const den = rx * rx * hy * hy + ry * ry * hx * hx;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / den));
  const cxp = (k * rx * hy) / ry;
  const cyp = (-k * ry * hx) / rx;
  const cx = cxp + (p0.x + p1.x) / 2;
  const cy = cyp + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number) => Math.atan2(uy, ux);
  const t0 = angle((hx - cxp) / rx, (hy - cyp) / ry);
  let dt = angle((-hx - cxp) / rx, (-hy - cyp) / ry) - t0;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  const n = 2048;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + (dt * i) / n;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });
}

/** Every vertex of an M/L/A/Z path (absolute commands only — anything else throws). */
function pathPoints(d: string): Vec2[] {
  const tokens = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
  const pts: Vec2[] = [];
  let i = 0;
  let cmd = '';
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M' || cmd === 'L') {
      pts.push({ x: n(), y: n() });
    } else if (cmd === 'A') {
      const rx = n(); const ry = n(); const rot = n(); const large = n() === 1; const sweep = n() === 1;
      const p1 = { x: n(), y: n() };
      if (rot !== 0) throw new Error(`svgShapeExtents: rotated arc in "${d}"`);
      pts.push(...arcPoints(pts[pts.length - 1], rx, ry, large, sweep, p1));
    } else if (cmd === 'Z' || cmd === 'z') {
      // closes back to a point already counted
    } else {
      throw new Error(`svgShapeExtents: unsupported path command "${cmd}" in "${d}"`);
    }
  }
  return pts;
}

/**
 * Every drawn rect/polygon/circle/ellipse/path's extent, through any `rotate` on its group
 * (turbine blades, the dish), widened by half its stroke width when stroked. Decoration is skipped; a
 * `polyline` throws, so a renderer that starts drawing one can't slip past a parity test unmeasured.
 */
export function shapeExtents(container: Element): ShapeExtent[] {
  const out: ShapeExtent[] = [];
  const drawn = (sel: string) => [...container.querySelectorAll(sel)].filter((el) => !el.matches(DECORATION) && !el.closest('defs'));
  if (drawn('polyline').length > 0) throw new Error('svgShapeExtents: polyline not measured');
  for (const el of drawn('rect')) {
    const x = num(el, 'x'); const y = num(el, 'y'); const w = num(el, 'width'); const h = num(el, 'height');
    const rot = rotationOf(el);
    out.push(extentOf(el, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(rot)));
  }
  for (const el of drawn('circle')) {
    const cx = num(el, 'cx'); const cy = num(el, 'cy'); const r = num(el, 'r');
    const c = rotationOf(el)({ x: cx, y: cy });
    out.push({ el, x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r });
  }
  for (const el of drawn('ellipse')) {
    // A rotated ellipse's exact box: half-sizes √(rx²cos² + ry²sin²) and √(rx²sin² + ry²cos²).
    const rx = num(el, 'rx'); const ry = num(el, 'ry');
    const m = el.closest('g[transform]')?.getAttribute('transform')?.match(/rotate\(\s*([-\d.e]+)/);
    const phi = ((m ? Number(m[1]) : 0) * Math.PI) / 180;
    const c = rotationOf(el)({ x: num(el, 'cx'), y: num(el, 'cy') });
    const hx = Math.hypot(rx * Math.cos(phi), ry * Math.sin(phi));
    const hy = Math.hypot(rx * Math.sin(phi), ry * Math.cos(phi));
    out.push({ el, x0: c.x - hx, y0: c.y - hy, x1: c.x + hx, y1: c.y + hy });
  }
  for (const el of drawn('polygon')) {
    const pts = (el.getAttribute('points') ?? '').trim().split(/[\s]+/).map((p) => p.split(',').map(Number));
    out.push(extentOf(el, pts.map(([x, y]) => rotationOf(el)({ x, y }))));
  }
  for (const el of drawn('path')) {
    out.push(extentOf(el, pathPoints(el.getAttribute('d') ?? '').map(rotationOf(el))));
  }
  for (const el of drawn('line')) {
    const rot = rotationOf(el);
    out.push(extentOf(el, [{ x: num(el, 'x1'), y: num(el, 'y1') }, { x: num(el, 'x2'), y: num(el, 'y2') }].map(rot)));
  }
  return out.map(withStroke);
}

/** An extent widened by half the element's stroke width, when it has a visible stroke. */
function withStroke(e: ShapeExtent): ShapeExtent {
  const stroke = e.el.getAttribute('stroke');
  const w = Number(e.el.getAttribute('stroke-width') ?? 1);
  if (!stroke || stroke === 'none' || !(w > 0)) return e;
  return { ...e, x0: e.x0 - w / 2, y0: e.y0 - w / 2, x1: e.x1 + w / 2, y1: e.y1 + w / 2 };
}

/** The union of extents (null for none). */
export function unionExtent(extents: readonly { x0: number; y0: number; x1: number; y1: number }[]) {
  if (extents.length === 0) return null;
  return {
    x0: Math.min(...extents.map((e) => e.x0)),
    y0: Math.min(...extents.map((e) => e.y0)),
    x1: Math.max(...extents.map((e) => e.x1)),
    y1: Math.max(...extents.map((e) => e.y1)),
  };
}
