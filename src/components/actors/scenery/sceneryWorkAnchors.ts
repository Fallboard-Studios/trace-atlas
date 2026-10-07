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
  type CraneParams,
  type PylonParams,
  type BeaconParams,
  type PipelineParams,
  type TurbineParams,
  type FloodlightParams,
  type DishParams,
} from './sceneryParams';
import { TANK_SHOULDER_FRACTION, TANK_GAUGE_Y_FRAC } from './renderers/tank';
import { DOME_MAST_H, DOME_HATCH_H, domePortholeCentres } from './renderers/dome';
import { SCAFFOLD_LEVEL_OVERHANG, scaffoldBraces } from './renderers/scaffold';
import { containerRows } from './renderers/containers';
import { wreckLayout } from './renderers/wreck';
import { VENT_PLUME_INNER_OFFSET } from './renderers/vent';
import { CRANE_BEAM_END_LIGHT_R, craneLayout } from './renderers/crane';
import { pylonArms, pylonTowerTop, pylonHeadCentre } from './renderers/pylon';
import { BEACON_FOOT_HEIGHT, beaconGem } from './renderers/beacon';
import { pipelineLayout } from './renderers/pipeline';
import { TURBINE_ROTOR_DEG, turbineLayout } from './renderers/turbine';
import { floodlightLayout } from './renderers/floodlight';
import { dishLayout } from './renderers/dish';
import { gemChamfer } from './gemGeometry';
import { SCENERY_GEM_ACCENTS } from './Scenery';

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

/**
 * The scenery kinds with anchors — every host kind (group A, Phase 43 Task 10; group B, Task 11).
 * Wall, boulder and tether host nothing, so have none.
 */
export const ANCHORED_KINDS: ReadonlySet<SceneryKind> = new Set<SceneryKind>([
  'tank',
  'dome',
  'scaffold',
  'containers',
  'wreck',
  'vent',
  'crane',
  'pylon',
  'beacon',
  'pipeline',
  'turbine',
  'floodlight',
  'dish',
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

/** SVG's `rotate(deg cx cy)`: p turned `deg` (clockwise on screen) about `centre`. */
function rotateAbout(p: Vec2, centre: Vec2, deg: number): Vec2 {
  const c = Math.cos((deg * Math.PI) / 180);
  const s = Math.sin((deg * Math.PI) / 180);
  const dx = p.x - centre.x;
  const dy = p.y - centre.y;
  return { x: centre.x + dx * c - dy * s, y: centre.y + dx * s + dy * c };
}

/** The point at fraction t along the segment a → b. */
const along = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });

/** Python-style modulo into [0, 2π). */
const wrap = (t: number) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

/**
 * The upper half of an ellipse (centre c, radii rx/ry) turned `deg` about its centre: leftmost
 * point → topmost → rightmost, the three extremes exact, `perHalf` segments either side of the top.
 */
function rotatedEllipseTop(c: Vec2, rx: number, ry: number, deg: number, perHalf: number): Vec2[] {
  const phi = (deg * Math.PI) / 180;
  const at = (t: number) => rotateAbout({ x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) }, c, deg);
  // dx/dt = 0 and dy/dt = 0 of the rotated rim, each at t and t + π.
  const tx = Math.atan2(-ry * Math.sin(phi), rx * Math.cos(phi));
  const ty = Math.atan2(ry * Math.cos(phi), rx * Math.sin(phi));
  const tLeft = at(tx).x < at(tx + Math.PI).x ? tx : tx + Math.PI;
  const tTop = at(ty).y < at(ty + Math.PI).y ? ty : ty + Math.PI;
  const tRight = tLeft + Math.PI;
  // Walk left → top → right the way round that passes the top (left and right are π apart).
  const dir = wrap(tTop - tLeft) < Math.PI ? 1 : -1;
  const d1 = dir * wrap(dir * (tTop - tLeft));
  const d2 = dir * wrap(dir * (tRight - tTop));
  const pts: Vec2[] = [];
  for (let k = 0; k <= perHalf; k++) pts.push(at(tLeft + (d1 * k) / perHalf));
  for (let k = 1; k <= perHalf; k++) pts.push(at(tTop + (d2 * k) / perHalf));
  return pts;
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

/**
 * Crane: the beam's top from end to end; foreground works the hanger's head on the beam,
 * midground the load and the beam-end light. (The knee brace draws as a zero-area polygon on one
 * diagonal, so it adds nothing to the silhouette.)
 */
function craneAnchors(actor: Actor, p: CraneParams, { foreground }: AnchorOptions): SceneryAnchors {
  const { y } = actor.position;
  const l = craneLayout(actor.position.x, y, p);
  const left = { x: l.beamLeft, y: l.beamTop };
  const right = { x: l.beamRight, y: l.beamTop };
  const outline = [left, right];
  return {
    bounds: { x0: l.beamLeft, y0: l.beamTop, x1: l.beamRight + CRANE_BEAM_END_LIGHT_R, y1: y },
    outline,
    points: foreground
      ? [left, { x: l.hangerX, y: l.beamTop }, right]
      : [left, { x: l.load.x + l.load.w / 2, y: l.load.y + l.load.h / 2 }, { x: l.beamRight, y: (l.beamTop + l.beamBottom) / 2 }],
    path: outline,
  };
}

/** Pylon: the head over the tower's narrow top; midground works both ends of one seeded cross-arm. */
function pylonAnchors(actor: Actor, p: PylonParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const outline = pylonTowerTop(x, y, p.w, p.h);
  const arms = pylonArms(x, y, p.w, p.h);
  const head = pylonHeadCentre(x, y, p.h, SCENERY_GEM_ACCENTS);
  const arm = arms[Math.floor(rand() * arms.length)];
  return {
    bounds: {
      x0: Math.min(x - p.w / 2, ...arms.map((a) => a.x0)),
      y0: y - p.h,
      x1: Math.max(x + p.w / 2, ...arms.map((a) => a.x1)),
      y1: y,
    },
    outline,
    points: foreground ? [head, outline[1], outline[2]] : [head, { x: arm.x0, y: arm.y }, { x: arm.x1, y: arm.y }],
    path: outline,
  };
}

/** Beacon: the gem's top edge; midground adds the gem's face and a point on the foot. */
function beaconAnchors(actor: Actor, p: BeaconParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const gem = beaconGem(x, y, p);
  const c = gemChamfer(gem.w, gem.h);
  const gx0 = gem.cx - gem.w / 2;
  const gy0 = gem.cy - gem.h / 2;
  const outline = [
    { x: gx0, y: gy0 + c },
    { x: gx0 + c, y: gy0 },
    { x: gx0 + gem.w - c, y: gy0 },
    { x: gx0 + gem.w, y: gy0 + c },
  ];
  const topPoint = along(outline[1], outline[2], between(rand, 0.2, 0.8));
  const side = rand() < 0.5 ? -1 : 1;
  const foot = { x: x + side * between(rand, 0.3, 0.9) * (p.w / 2), y: y - BEACON_FOOT_HEIGHT };
  const half = Math.max(p.w, gem.w) / 2;
  return {
    bounds: { x0: x - half, y0: gy0, x1: x + half, y1: y },
    outline,
    points: foreground ? [outline[1], topPoint, outline[2]] : [{ x: gem.cx, y: gem.cy }, topPoint, foot],
    path: outline,
  };
}

/** Pipeline: the valve, the riser's top, and the pipe run beside the riser (the path). */
function pipelineAnchors(actor: Actor, p: PipelineParams, { rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const l = pipelineLayout(x, y, p);
  const pipe = { x0: x - p.w / 2, x1: x + p.w / 2 };
  const flange = { x0: l.flange.x, x1: l.flange.x + l.flange.w };
  const outline = spansTopOutline([
    { ...pipe, y: l.pipeTop },
    { x0: l.riserX, x1: l.riserX + p.d, y: l.riserTop },
    { ...flange, y: l.flange.y },
  ]);
  // The run: from the flange's inner edge to the pipe's far end, never under the riser.
  const run = p.riserRight ? { a: pipe.x0, b: flange.x0 } : { a: flange.x1, b: pipe.x1 };
  const path = [{ x: run.a, y: l.pipeTop }, { x: run.b, y: l.pipeTop }];
  // Every point is on or above the outline, so one set serves every depth.
  return {
    bounds: { x0: Math.min(pipe.x0, flange.x0), y0: l.flange.y, x1: Math.max(pipe.x1, flange.x1), y1: y },
    outline,
    points: [
      { x: l.valve.cx, y: l.valve.cy },
      { x: l.valve.cx, y: l.flange.y },
      along(path[0], path[1], between(rand, 0.2, 0.8)),
    ],
    path,
  };
}

/** Turbine: the rotor's upper edge; midground works the hub and both blade tips. */
function turbineAnchors(actor: Actor, p: TurbineParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const l = turbineLayout(x, y, p);
  const turn = (q: Vec2) => rotateAbout(q, l.hub, TURBINE_ROTOR_DEG);
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => turn({ x: l.hub.x + sx * l.bladeHalfW, y: l.hub.y + sy * l.bladeR })));
  const leftmost = corners.reduce((a, b) => (b.x < a.x ? b : a));
  const rightmost = corners.reduce((a, b) => (b.x > a.x ? b : a));
  const topmost = corners.reduce((a, b) => (b.y < a.y ? b : a));
  const outline = [leftmost, topmost, rightmost];
  return {
    bounds: {
      x0: Math.min(leftmost.x, l.nacelle.x0, l.hub.x - l.hubR),
      y0: topmost.y,
      x1: Math.max(rightmost.x, l.nacelle.x1, l.hub.x + l.hubR),
      y1: y,
    },
    outline,
    points: foreground
      ? [along(leftmost, topmost, between(rand, 0.3, 0.8)), topmost, rightmost]
      : [l.hub, turn({ x: l.hub.x, y: l.hub.y - l.bladeR }), turn({ x: l.hub.x, y: l.hub.y + l.bladeR })],
    path: outline,
  };
}

/** Floodlight: the head's top; midground adds the lit bar on its face. */
function floodlightAnchors(actor: Actor, p: FloodlightParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { y } = actor.position;
  const { mast, head, litBar } = floodlightLayout(actor.position.x, y, p);
  const outline = spansTopOutline([{ x0: head.x0, x1: head.x1, y: head.y }, mast]);
  const headTop = (t: number) => ({ x: head.x0 + t * (head.x1 - head.x0), y: head.y });
  return {
    bounds: { x0: Math.min(head.x0, mast.x0), y0: head.y, x1: Math.max(head.x1, mast.x1), y1: y },
    outline,
    points: foreground
      ? [headTop(between(rand, 0.1, 0.4)), headTop(between(rand, 0.6, 0.9))]
      : [{ x: litBar.cx, y: litBar.cy }, headTop(between(rand, 0.1, 0.9))],
    path: [headTop(0), headTop(1)],
  };
}

/** Dish: the tilted reflector's upper rim; midground works its centre and the feed's tip. */
function dishAnchors(actor: Actor, p: DishParams, { foreground, rand }: AnchorOptions): SceneryAnchors {
  const { x, y } = actor.position;
  const l = dishLayout(x, y, p);
  const outline = rotatedEllipseTop(l.centre, l.rx, l.ry, l.deg, DOME_ARC_SEGMENTS / 2);
  const turn = (q: Vec2) => rotateAbout(q, l.centre, l.deg);
  const feed = [-1, 1].flatMap((sx) => [l.feed.y0, l.feed.y1].map((fy) => turn({ x: x + sx * l.feed.halfW, y: fy })));
  const top = outline.reduce((a, b) => (b.y < a.y ? b : a));
  const xs = [...outline, ...feed].map((q) => q.x);
  return {
    // The feed may rise past the rim like a mast; the box's top is the reflector's.
    bounds: { x0: Math.min(...xs, x - l.postHalfW), y0: top.y, x1: Math.max(...xs, x + l.postHalfW), y1: y },
    outline,
    points: foreground
      ? [outlinePointAt(outline, between(rand, 0.1, 0.35)), top, outlinePointAt(outline, between(rand, 0.65, 0.9))]
      : [l.centre, turn({ x, y: l.feed.y0 }), outlinePointAt(outline, between(rand, 0.2, 0.8))],
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
    case 'crane':
      return params.crane ? craneAnchors(actor, params.crane, opts) : null;
    case 'pylon':
      return params.pylon ? pylonAnchors(actor, params.pylon, opts) : null;
    case 'beacon':
      return params.beacon ? beaconAnchors(actor, params.beacon, opts) : null;
    case 'pipeline':
      return params.pipeline ? pipelineAnchors(actor, params.pipeline, opts) : null;
    case 'turbine':
      return params.turbine ? turbineAnchors(actor, params.turbine, opts) : null;
    case 'floodlight':
      return params.floodlight ? floodlightAnchors(actor, params.floodlight, opts) : null;
    case 'dish':
      return params.dish ? dishAnchors(actor, params.dish, opts) : null;
    default:
      return null;
  }
}
