// ========================================
// WORLD GEM MATERIAL (docs/specs/WORLD_GEM_MATERIAL.md §1, roadmap Phase 44)
// ========================================
// Every solid in the world reads as one carved material with the gem robots. Mass gets the
// robots' bevel ring; everything else solid gets a hairline. This module is pure: it computes
// points and colour strings and never touches the DOM — GemRing.tsx draws them, so no renderer
// computes a tone itself. A constant changes in docs/sketches/gem-factories.html first, then here.

// ========================================
// IMPORTS
// ========================================
import { applyColorShift, type HSL } from '../../../utils/colorUtils';
import { bevelDepth, edgeNormals, inset, type GemPoint } from '../../robot/gem/polygon';
import { facetMultiplier, gemOutlineStroke } from '../scenery/gemShape';
import { NO_SHIFT } from '../scenery/sceneryColor';

// ========================================
// CONSTANTS
// ========================================
/** Ring depth in scene pixels at scale 1 — the sketch's "bevel px" slider, ruled at 8. */
export const WORLD_BEVEL_PX = 8;
/** A roof box's ring is this share of the building's — the sketch's `d * 0.6` for roof boxes. */
export const ROOF_BOX_BEVEL_FACTOR = 0.6;
/** A ring under this many px is not drawn at all (spec assumption 6) — below it a ring is three
 *  invisible facets. Mass scenery and factories never hit it; only the rooftop boxes do. */
export const RING_MIN_PX = 1;
/** Each facet's own stroke, round-joined so neighbouring facets close without a seam — the
 *  sketch's `0.6 * s` on every ring facet. */
export const RING_FACET_STROKE_PX = 0.6;
/** The hairline on everything solid that is not mass — tuned by eye in the sketch (1 vanished at
 *  half size, 2 passed over), Crawford's final call. The lever if it is lost is colour, not weight. */
export const HAIRLINE_PX = 1.5;
/** The lighting curve's widest east/west gap (`getLighting`: eastL 1.05 vs westL 0.346 at 9 am) —
 *  the sketch's `/ 0.7` in `lightVec`, at its ruled lateral strength of 1.0. */
export const LIGHT_LATERAL_SPAN = 0.7;

/**
 * Code constants only — no setting, no UI. Each piece is one idle-paint ablation for the perf gate
 * (spec §5) and one mock target for the "bevel 0 is byte-identical" tests. A piece that is off
 * renders exactly as today: its ring depth is 0, or its `hairline()` is spread as undefined.
 */
export const WORLD_GEM = {
  factories: true,
  massScenery: true,
  roofBoxes: true,
  terrain: true,
  members: true,
  others: true,
} as const;

// ========================================
// LIGHT
// ========================================
/**
 * Unit vector toward the light (y down): sideways by the hour's east/west gap, always from above.
 * Never the robots' fixed top-left `GEM_LIGHT` — a building takes the sun of the hour.
 */
export function worldLightVector(eastL: number, westL: number): GemPoint {
  const sx = (eastL - westL) / LIGHT_LATERAL_SPAN;
  const k = Math.hypot(sx, 1);
  return [sx / k, -1 / k];
}

// ========================================
// DEPTH
// ========================================
/**
 * Ring depth for a w×h item: the world's 8 px × the item's scale through `bevelDepth`'s one 18 %
 * short-side cap, floored to 0 under `RING_MIN_PX`. Roof boxes pass their own `depthPx`.
 */
export function worldBevel(w: number, h: number, scale = 1, depthPx = WORLD_BEVEL_PX): number {
  const d = bevelDepth(w, h, depthPx * scale);
  return d < RING_MIN_PX ? 0 : d;
}

// ========================================
// RING
// ========================================
export interface RingOptions {
  /** Split every horizontal edge that strictly crosses this x first, so each half takes its own
   *  face's light — the facade's west/east split (two-faced bodies). */
  splitX?: number;
  /** Drop the facets of edges that lie on the frame (terrain: x = 0, x = W, the bottom). The inner
   *  polygon is still the inset of the whole outline, so the facets that remain are unchanged. */
  skipEdge?: (a: GemPoint, b: GemPoint) => boolean;
}

/** One merged `<path>`: every facet of this fill and stroke, as closed quads. */
export interface RingFacet {
  fill: string;
  stroke: string;
  d: string;
}

/** Two decimals (0.01 px, invisible) keeps markup compact and stable; Number() drops trailing zeros. */
const fmt = (n: number): string => String(Number(n.toFixed(2)));
const pt = ([x, y]: GemPoint): string => `${fmt(x)},${fmt(y)}`;

/** `pts` with a vertex inserted on every horizontal edge that strictly crosses `splitX`. */
function splitHorizontalEdges(pts: readonly GemPoint[], splitX: number): GemPoint[] {
  const out: GemPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    const horizontal = Math.abs(a[1] - b[1]) < 1e-9;
    if (horizontal && Math.min(a[0], b[0]) < splitX && splitX < Math.max(a[0], b[0])) out.push([splitX, a[1]]);
  }
  return out;
}

/**
 * The bevel ring of a polygon, built from the robot generator's own `inset` and `edgeNormals`: one
 * facet per outline edge, each the quad `[a, b, inner of b, inner of a]`. A facet's shade is its
 * outward normal dotted with `light`, quantized to three levels and looked up in the shared 0.5 /
 * 1.1 / 1.25 table (`facetMultiplier`). Its fill is `body` at `faceLightAt(edge midpoint)` × that
 * multiplier; its stroke is the same lightness at the fully shaded tone, so the ring has no
 * outline of its own colour. Facets sharing a (fill, stroke) pair merge into one path, in
 * first-appearance order. Depth 0 or below, or fewer than three points, draws nothing.
 *
 * `faceLightAt` is the face's own lightness multiplier with its depth cap and any derelict dimming
 * already folded in; `body` is the face's own colour. Both come from the caller — this module never
 * derives a tone from the scene.
 */
export function ringFacets(
  pts: readonly GemPoint[],
  depth: number,
  light: GemPoint,
  faceLightAt: (midX: number) => number,
  body: HSL,
  opts: RingOptions = {},
): RingFacet[] {
  if (depth <= 0 || pts.length < 3) return [];

  const outline = opts.splitX === undefined ? pts : splitHorizontalEdges(pts, opts.splitX);
  const inner = inset(outline, depth);
  const normals = edgeNormals(outline);
  const n = outline.length;
  const merged = new Map<string, RingFacet>();

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = outline[i];
    const b = outline[j];
    if (opts.skipEdge?.(a, b)) continue;

    const shade = normals[i][0] * light[0] + normals[i][1] * light[1];
    const faceL = faceLightAt((a[0] + b[0]) / 2);
    const fill = applyColorShift(body, NO_SHIFT, faceL * facetMultiplier(shade));
    const stroke = applyColorShift(body, NO_SHIFT, faceL * facetMultiplier(-1));
    const quad = `M${pt(a)}L${pt(b)}L${pt(inner[j])}L${pt(inner[i])}Z`;

    const key = `${fill}|${stroke}`;
    const group = merged.get(key);
    if (group) group.d += quad;
    else merged.set(key, { fill, stroke, d: quad });
  }

  return [...merged.values()];
}

// ========================================
// HAIRLINE
// ========================================
/**
 * Stroke props for a non-mass solid, or undefined when the weight is 0 — spread it onto the
 * element: `<rect {...hairline()} />`. The colour is the scenery gem outline's (`gemOutlineStroke`,
 * one copy): never lit, never capped.
 */
export function hairline(scale = 1): { stroke: string; strokeWidth: number } | undefined {
  const strokeWidth = HAIRLINE_PX * scale;
  return strokeWidth > 0 ? { stroke: gemOutlineStroke(), strokeWidth } : undefined;
}
