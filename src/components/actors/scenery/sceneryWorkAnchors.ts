// ========================================
// IMPORTS
// ========================================
import type { Actor, SceneryKind } from '../../../types/Actor';
import type { Vec2 } from '../../../types/Vec2';
import {
  deriveSceneryParams,
  ventSteps,
  type SceneryParams,
  type TankParams,
  type DomeParams,
  type ScaffoldParams,
  type ContainersParams,
  type WreckParams,
  type VentParams,
} from './sceneryParams';
import { TANK_SHOULDER_FRACTION, TANK_GAUGE_Y_FRAC } from './renderers/tank';
import { DOME_MAST_H, DOME_HATCH_H, domePortholeCentres } from './renderers/dome';
import { SCAFFOLD_LEVEL_OVERHANG, scaffoldBraces } from './renderers/scaffold';
import { containerRows } from './renderers/containers';
import { wreckLayout } from './renderers/wreck';
import { VENT_PLUME_INNER_OFFSET } from './renderers/vent';

// ========================================
// TYPES
// ========================================

/**
 * Where robots work on one scenery actor, in scene units (docs/specs/ROBOT_JOBS_AND_STATIONS.md
 * §1.5). Read only from `deriveSceneryParams` and the renderers' own geometry, so the anchors sit
 * on what's drawn.
 */
export interface SceneryAnchors {
  /** The silhouette's box (masts, lights and plumes may rise up to ANCHOR_RISE_MAX above it). */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** The silhouette's top edge, x-monotonic, left to right — what "on or above" is measured to. */
  outline: Vec2[];
  /** 2–4 work points. */
  points: Vec2[];
  /** A polyline of ≥ 2 vertices. */
  path: Vec2[];
}

export interface AnchorOptions {
  /**
   * Foreground scenery draws over the robots layer, so its points stay on or above the outline
   * (worked from outside). Midground and background may use facade points.
   */
  foreground: boolean;
  /** The site's seeded stream (`Alea(actor.id + ':work')`). */
  rand: () => number;
}

// ========================================
// CONSTANTS
// ========================================

/** How far above the silhouette's box a mouth, mast head or light anchor may sit. */
export const ANCHOR_RISE_MAX = 40;

/** The dome arc's outline is sampled in this many straight segments. */
const DOME_ARC_SEGMENTS = 12;

/** The scenery kinds with anchors so far (group A, Phase 43 Task 10). */
export const ANCHORED_KINDS: ReadonlySet<SceneryKind> = new Set<SceneryKind>([
  'tank',
  'dome',
  'scaffold',
  'containers',
  'wreck',
  'vent',
]);

// ========================================
// OUTLINE HELPERS
// ========================================

/** A uniform draw in [lo, hi). */
const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

/**
 * The outline's y at x — the highest (smallest y) of the segments covering x, so a vertical step
 * reads as its upper side. Null outside the outline's x range.
 */
export function outlineYAt(outline: Vec2[], x: number): number | null {
  if (outline.length < 2 || x < outline[0].x || x > outline[outline.length - 1].x) return null;
  let best = Infinity;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1];
    const b = outline[i];
    if (x < a.x || x > b.x) continue;
    const y = a.x === b.x ? Math.min(a.y, b.y) : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    best = Math.min(best, y);
  }
  return best === Infinity ? null : best;
}

/** The point on the outline at fraction t of its width. */
function outlinePointAt(outline: Vec2[], t: number): Vec2 {
  const x = outline[0].x + t * (outline[outline.length - 1].x - outline[0].x);
  return { x, y: outlineYAt(outline, x)! };
}

/** The top edge of a stack of flat-topped spans (each `x0 … x1` at height `y`), left to right. */
function spansTopOutline(spans: { x0: number; x1: number; y: number }[]): Vec2[] {
  const xs = [...new Set(spans.flatMap((s) => [s.x0, s.x1]))].sort((a, b) => a - b);
  const pts: Vec2[] = [];
  for (let k = 0; k < xs.length - 1; k++) {
    const mid = (xs[k] + xs[k + 1]) / 2;
    const covering = spans.filter((s) => s.x0 <= mid && mid <= s.x1);
    if (covering.length === 0) continue;
    const y = Math.min(...covering.map((s) => s.y));
    pts.push({ x: xs[k], y }, { x: xs[k + 1], y });
  }
  // Drop repeated vertices and the inner vertices of flat runs.
  const deduped = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  return deduped.filter((p, i) => {
    if (i === 0 || i === deduped.length - 1) return true;
    const a = deduped[i - 1];
    const b = deduped[i + 1];
    return !(a.y === p.y && p.y === b.y);
  });
}

// ========================================
// PER-KIND ANCHORS
// ========================================

/** Tank: the shoulder line on top; midground adds the pressure gauge. */
function tankAnchors(actor: Actor, p: TankParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const top = y - p.h;
  const shoulder = p.w * TANK_SHOULDER_FRACTION;
  const left = x - p.w / 2;
  const right = x + p.w / 2;
  const outline = [
    { x: left, y: top + shoulder },
    { x: left + shoulder, y: top },
    { x: right - shoulder, y: top },
    { x: right, y: top + shoulder },
  ];
  const topPoint = { x: left + shoulder + between(rand, 0.2, 0.8) * (p.w - 2 * shoulder), y: top };
  const gauge = { x, y: top + TANK_GAUGE_Y_FRAC * p.h };
  return {
    bounds: { x0: left, y0: top, x1: right, y1: y },
    outline,
    points: foreground ? [topPoint, outline[1], outline[2]] : [gauge, topPoint, outline[1]],
    path: outline,
  };
}

/** Dome: the arc as path; mast head and portholes; midground adds the hatch. */
function domeAnchors(actor: Actor, p: DomeParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const rx = p.w / 2;
  const top = y - p.bh;
  const apex = top - p.ry;
  const outline = Array.from({ length: DOME_ARC_SEGMENTS + 1 }, (_, i) => {
    const theta = Math.PI * (i / DOME_ARC_SEGMENTS - 0.5);
    return { x: x + rx * Math.sin(theta), y: top - p.ry * Math.cos(theta) };
  });
  const portholes = domePortholeCentres(x, top, rx, p.ry, p.portholes);
  const i = Math.floor(rand() * portholes.length);
  const j = (i + Math.ceil(portholes.length / 2)) % portholes.length;
  const mast = { x, y: apex - DOME_MAST_H };
  const hatch = { x, y: y - DOME_HATCH_H / 2 };
  return {
    bounds: { x0: x - rx, y0: apex, x1: x + rx, y1: y },
    outline,
    points: foreground ? [mast, portholes[i], portholes[j]] : [mast, portholes[i], hatch],
    path: outline,
  };
}

/** Scaffold: the top frame's post heads; midground adds a brace. */
function scaffoldAnchors(actor: Actor, p: ScaffoldParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const half = p.w / 2;
  const top = y - p.h;
  const postTops = Array.from({ length: p.bays + 1 }, (_, i) => ({ x: x - half + (i * p.w) / p.bays, y: top }));
  const braces = scaffoldBraces(x, y, p.w, p.h, p.bays).map((b) => ({ x: b.x0 + b.d / 2, y: b.y0 - b.d / 2 }));
  const brace = braces[Math.floor(rand() * braces.length)];
  const post = postTops[Math.floor(rand() * postTops.length)];
  const light = { x: x + half, y: top };
  return {
    bounds: { x0: x - half - SCAFFOLD_LEVEL_OVERHANG, y0: top, x1: x + half + SCAFFOLD_LEVEL_OVERHANG, y1: y },
    outline: [postTops[0], postTops[postTops.length - 1]],
    points: foreground ? [light, post] : [light, brace, post],
    path: postTops,
  };
}

/** Containers: the stepped stack top; a pick-up left of a drop (labels when not foreground). */
function containersAnchors(actor: Actor, p: ContainersParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const rows = containerRows(x, y, p);
  const spans = rows.map((r) => ({ x0: r.startX, x1: r.startX + r.count * p.boxW, y: r.topY }));
  const outline = spansTopOutline(spans);
  const topRow = rows[rows.length - 1];
  const stackTop = { x: topRow.startX + (topRow.count * p.boxW) / 2, y: topRow.topY };

  let a: Vec2;
  let b: Vec2;
  if (foreground) {
    a = outlinePointAt(outline, between(rand, 0.05, 0.3));
    b = outlinePointAt(outline, between(rand, 0.7, 0.95));
  } else {
    // A label in the bottom row's left half, one in its right half (the bottom row has ≥ 2 boxes).
    const bottom = rows[0];
    const leftCount = Math.floor(bottom.count / 2);
    const rightStart = Math.ceil(bottom.count / 2);
    const label = (k: number) => ({ x: bottom.startX + k * p.boxW + p.boxW / 2, y: bottom.topY + p.boxH / 2 });
    a = label(Math.floor(rand() * leftCount));
    b = label(rightStart + Math.floor(rand() * (bottom.count - rightStart)));
  }

  return {
    bounds: {
      x0: Math.min(...spans.map((s) => s.x0)),
      y0: Math.min(...spans.map((s) => s.y)),
      x1: Math.max(...spans.map((s) => s.x1)),
      y1: y,
    },
    outline,
    points: [a, b, stackTop],
    path: outline,
  };
}

/** Wreck: the hull line over deckhouse and funnel; stern deck, funnel top and bow, left to right. */
function wreckAnchors(actor: Actor, p: WreckParams, { rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const left = x - p.w / 2;
  const l = wreckLayout(x, y, p);
  const outline = [
    ...spansTopOutline([
      { x0: left, x1: l.splitX, y: l.deckY },
      { x0: l.deckhouseX, x1: l.deckhouseX + l.deckhouseW, y: l.deckhouseTop },
      { x0: l.funnelX, x1: l.funnelX + l.funnelW, y: l.funnelTop },
    ]),
    { x: l.splitX, y: l.top },
    { x: l.x1, y },
  ];
  // Every point is on the outline, so one set serves every depth.
  const stern = { x: left + between(rand, 0.2, 0.8) * (l.deckhouseX - left), y: l.deckY };
  const funnelTop = { x: l.funnelX + l.funnelW / 2, y: l.funnelTop };
  const t = between(rand, 0.2, 0.6);
  const bow = { x: l.splitX + t * p.h, y: l.top + t * p.h };
  return {
    bounds: { x0: left, y0: l.funnelTop, x1: l.x1, y1: y },
    outline,
    points: [stern, funnelTop, bow],
    path: outline,
  };
}

/** Vent: the stepped cone; its mouth (where the bubbles leave) and the plume above it. */
function ventAnchors(actor: Actor, p: VentParams): SceneryAnchors {
  const { x, y } = actor.position;
  let top = y;
  const spans = ventSteps(p).map((step) => {
    top -= step.height;
    return { x0: x - step.width / 2, x1: x + step.width / 2, y: top };
  });
  const outline = spansTopOutline(spans);
  return {
    bounds: { x0: x - p.w / 2, y0: top, x1: x + p.w / 2, y1: y },
    outline,
    points: [{ x, y: top }, { x, y: top - VENT_PLUME_INNER_OFFSET }],
    path: outline,
  };
}

// ========================================
// API
// ========================================

/**
 * The work anchors for a scenery actor, or null for a kind without anchors (yet) or an actor
 * with no kind. Pure; `params` defaults to `deriveSceneryParams(actor)` — the renderer's own.
 */
export function sceneryWorkAnchors(
  actor: Actor,
  opts: AnchorOptions,
  params: SceneryParams = deriveSceneryParams(actor),
): SceneryAnchors | null {
  switch (actor.config?.kind) {
    case 'tank':
      return params.tank ? tankAnchors(actor, params.tank, opts) : null;
    case 'dome':
      return params.dome ? domeAnchors(actor, params.dome, opts) : null;
    case 'scaffold':
      return params.scaffold ? scaffoldAnchors(actor, params.scaffold, opts) : null;
    case 'containers':
      return params.containers ? containersAnchors(actor, params.containers, opts) : null;
    case 'wreck':
      return params.wreck ? wreckAnchors(actor, params.wreck, opts) : null;
    case 'vent':
      return params.vent ? ventAnchors(actor, params.vent) : null;
    default:
      return null;
  }
}
