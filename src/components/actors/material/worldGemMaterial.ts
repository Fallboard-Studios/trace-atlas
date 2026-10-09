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
import { bevelDepth, type GemPoint } from '../../robot/gem/polygon';
import { gemOutlineStroke } from '../scenery/gemShape';

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
