import type { HSL } from '../../../utils/colorUtils';
import { applyColorShift } from '../../../utils/colorUtils';
import { lerp } from '../../../utils/math';
import { quantizeShade } from '../../robot/gem/gemShading';
import colorTheme from '../../../constants/colorTheme.json';
import { NO_SHIFT } from './sceneryColor';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.10)
// ========================================

/** Chamfer size: 0.3 × min(w, h). */
const GEM_CHAMFER_FRAC = 0.3;
/** Outline stroke width. */
const GEM_OUTLINE_STROKE_WIDTH = 2;
/** The outline stroke's own lightness fraction of `body.shadow` — a material edge, not a lit
 *  face, so it ignores `glow`/`cap` entirely. */
const GEM_OUTLINE_L_MULTIPLIER = 0.8;
/** The base/body polygon's tone beneath the three facets. */
const GEM_BODY_MULTIPLIER = 0.75;
/** Discrete facet tone levels — reuses robot gem facets' tone count (gemShading.ts's
 *  GEM_FACET_TONES) so a rock or beacon head steps through the same number of shades. */
const GEM_FACET_TONES = 3;
/** Raw shade (−1..1) per facet, quantized through GEM_FACET_TONES before its §1.10 multiplier is
 *  looked up — at 3 tones these land exactly on −1 / 0 / 1 (quantizeShade's reuse, not a no-op:
 *  any seed-driven shade would snap to the same three levels). */
const FACET_RAW_SHADE = { upper: 1, lower: -1, side: 1 / 3 } as const;
/** §1.10's named facet multipliers, keyed by quantized shade level. */
const FACET_MULTIPLIER: Record<number, number> = { [-1]: 0.5, 0: 1.1, 1: 1.25 };

function facetMultiplier(rawShade: number): number {
  const quantized = quantizeShade(rawShade, GEM_FACET_TONES);
  return FACET_MULTIPLIER[quantized] ?? 1;
}

/** Lit-gem base colour (§1.10): `hsl(primary, 55, 42)`. */
export function accentBase(hue: number): HSL {
  return { h: hue, s: 55, l: 42 };
}

/** The octagon's corner cut, shared with the work anchors. */
export function gemChamfer(w: number, h: number): number {
  return Math.min(w, h) * GEM_CHAMFER_FRAC;
}

export interface GemShapeProps {
  cx: number;
  cy: number;
  w: number;
  h: number;
  base: HSL;
  lit: boolean;
  eastL: number;
  westL: number;
  nightDepth: number;
  /** Ambient depth cap (§1.7) — only meaningful when `lit` is false; a lit gem is never capped. */
  cap?: number;
}

/**
 * A chamfered gem polygon in the Phase 39 facet vocabulary (docs/specs/WORLD_VIEW_DISTRICTS.md
 * §1.10): a base octagon plus upper/lower/side facets — quantized through `quantizeShade` to the
 * same discrete tone steps as robot gem facets — and a stroked outline. Reuses `gemShading.ts`'s
 * tone quantisation, not `getRobotGem`: a rock or a beacon head is one polygon, not a body.
 *
 * Every facet is built from the octagon's own chamfer vertices (horizontal/vertical/45° only —
 * docs/specs/WORLD_VIEW_DISTRICTS.md §3's grid rule binds this shape too), unlike the sketch's
 * free-angle bevel lines.
 */
export function GemShape({ cx, cy, w, h, base, lit, eastL, westL, nightDepth, cap = 1 }: GemShapeProps) {
  const c = gemChamfer(w, h);
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const glow = lit ? lerp(0.9, 1.6, nightDepth) : ((eastL + westL) / 2) * cap;

  const outlinePoints = `${x0 + c},${y0} ${x0 + w - c},${y0} ${x0 + w},${y0 + c} ${x0 + w},${y0 + h - c} ${x0 + w - c},${y0 + h} ${x0 + c},${y0 + h} ${x0},${y0 + h - c} ${x0},${y0 + c}`;
  const upperPoints = `${x0 + c},${y0} ${x0 + w - c},${y0} ${x0 + w},${y0 + c} ${x0},${y0 + c}`;
  const lowerPoints = `${x0 + c},${y0 + h} ${x0 + w - c},${y0 + h} ${x0 + w},${y0 + h - c} ${x0},${y0 + h - c}`;

  const eastSide = eastL >= westL;
  const sidePoints = eastSide
    ? `${x0 + w},${y0 + c} ${x0 + w},${y0 + h - c} ${x0 + w - c},${y0 + h - c} ${x0 + w - c},${y0 + c}`
    : `${x0},${y0 + c} ${x0},${y0 + h - c} ${x0 + c},${y0 + h - c} ${x0 + c},${y0 + c}`;

  const bodyFill = applyColorShift(base, NO_SHIFT, glow * GEM_BODY_MULTIPLIER);
  const upperFill = applyColorShift(base, NO_SHIFT, glow * facetMultiplier(FACET_RAW_SHADE.upper));
  const lowerFill = applyColorShift(base, NO_SHIFT, glow * facetMultiplier(FACET_RAW_SHADE.lower));
  const sideFill = applyColorShift(base, NO_SHIFT, glow * facetMultiplier(FACET_RAW_SHADE.side));
  const outlineStroke = applyColorShift(colorTheme.body.shadow, NO_SHIFT, GEM_OUTLINE_L_MULTIPLIER);

  return (
    <g data-shape="gem">
      <polygon points={outlinePoints} fill={bodyFill} />
      <polygon points={upperPoints} fill={upperFill} />
      <polygon points={lowerPoints} fill={lowerFill} />
      <polygon points={sidePoints} fill={sideFill} />
      <polygon points={outlinePoints} fill="none" stroke={outlineStroke} strokeWidth={GEM_OUTLINE_STROKE_WIDTH} />
    </g>
  );
}
