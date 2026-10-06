// ========================================
// GEM PALETTE (docs/specs/GEM_POLYGON_ROBOTS.md §1.4)
// ========================================
// Resolves every colour a gem robot draws into a string, so RobotGem.tsx computes none. The
// identity colour is the body (the Phase 39 guardrail rewrite); audio reaches colour only through
// each Mid's lit level `t`. Daylight multiplies every lightness, as applyLightnessMultiplier did
// for the hand-drawn robots — no floor, rounded to integers so strings stay stable tick to tick.

// ========================================
// IMPORTS
// ========================================
import { clamp, hexToHsl, hslToString, type HSL } from '../../../utils/colorUtils';
import { facetTone, partFacetShades, quantizeShade, GEM_FACET_TONES } from './gemShading';
import type { GemPart, RobotGem } from './polygon';

// ========================================
// CONSTANTS (sketch values, Gate 1)
// ========================================
/** The connecting backing polygon — near-black, mostly hidden. */
export const GEM_BACKING = '#0e1013';
export const GEM_BACKING_STROKE = '#1c2026';
/** A Mid's tone at lit level 0 (its layer muted). */
export const GEM_MID_DARK = '#262a31';
/** The two Top lights — emissive, so daylight does not touch them; battery dims their opacity. */
export const GEM_LIGHT_COLOR = '#fff3c4';

/** Lit-Mid tone relative to identity: darker and greyer, so it reads as the same robot, one step back. */
const MID_LIT_DL = -16;
const MID_LIT_DS = -18;
/** Boundary-line tones relative to their host face. */
const TOP_LINE_DL = -26;
const MID_LIT_LINE_DL = -32;
const MID_DARK_LINE_DL = -8;

// ========================================
// TYPES
// ========================================
export interface GemPartPaint {
  /** One fill per outline edge (facet i sits on edge i). */
  facets: string[];
  face: string;
  line: string;
  /** Facet outline — the fully shaded tone. */
  stroke: string;
}

export interface GemPalette {
  backing: { face: string; stroke: string };
  orbiters: [GemPartPaint, GemPartPaint, GemPartPaint, GemPartPaint];
  midLeft: GemPartPaint;
  midRight: GemPartPaint;
  top: GemPartPaint;
  light: string;
}

// ========================================
// HELPERS
// ========================================
function shift(base: HSL, dl: number, ds = 0): HSL {
  return { h: base.h, s: clamp(base.s + ds, 0, 100), l: clamp(base.l + dl, 0, 100) };
}

/**
 * From a near-neutral dark tone toward a lit one by t, keeping the lit tone's hue throughout.
 * Interpolating hue from a grey would sweep through unrelated hues mid-blend; the dark end is
 * desaturated enough that borrowing the identity hue for it is indistinguishable.
 */
function toward(dark: HSL, lit: HSL, t: number): HSL {
  return { h: lit.h, s: dark.s + (lit.s - dark.s) * t, l: dark.l + (lit.l - dark.l) * t };
}

/** Daylight, then integer rounding — the same arithmetic as the old adjustHslLightness. */
function css(tone: HSL, daylight: number): string {
  return hslToString({
    h: Math.round(tone.h),
    s: Math.round(tone.s),
    l: Math.round(clamp((tone.l / 100) * daylight, 0, 1) * 100),
  });
}

function paintPart(part: GemPart, face: HSL, line: HSL, contrast: number, daylight: number, tones: number): GemPartPaint {
  return {
    facets: partFacetShades(part.pts).map((s) => css(facetTone(face, quantizeShade(s, tones), contrast), daylight)),
    face: css(face, daylight),
    line: css(line, daylight),
    stroke: css(facetTone(face, -1, contrast), daylight),
  };
}

// ========================================
// PALETTE
// ========================================
/**
 * @param gem         the robot's geometry (facet tones depend on each edge's normal)
 * @param identityHex Robot.identityColor — the body colour
 * @param daylight    0..1 lightness multiplier (1 = neutral)
 * @param midLit      [midLeft, midRight] lit levels (layerLitLevel of layers[1] / layers[2])
 * @param contrast    facet contrast (GEM_FACET_CONTRAST, lowered by battery)
 * @param tones       facet tone levels per part (quantizeShade); 0 = one tone per edge direction
 */
export function gemPalette(
  gem: RobotGem,
  identityHex: string,
  daylight: number,
  midLit: [number, number],
  contrast: number,
  tones: number = GEM_FACET_TONES,
): GemPalette {
  const identity = hexToHsl(identityHex);
  const topLine = shift(identity, TOP_LINE_DL);
  const midDark = hexToHsl(GEM_MID_DARK);
  const midLitFace = shift(identity, MID_LIT_DL, MID_LIT_DS);
  const midDarkLine = shift(midDark, MID_DARK_LINE_DL);
  const midLitLine = shift(identity, MID_LIT_LINE_DL, MID_LIT_DS);

  const mid = (part: GemPart, t: number) =>
    paintPart(part, toward(midDark, midLitFace, t), toward(midDarkLine, midLitLine, t), contrast, daylight, tones);
  const body = (part: GemPart) => paintPart(part, identity, topLine, contrast, daylight, tones);
  const [tl, tr, bl, br] = gem.orbiters;

  return {
    backing: { face: css(hexToHsl(GEM_BACKING), daylight), stroke: css(hexToHsl(GEM_BACKING_STROKE), daylight) },
    orbiters: [body(tl), body(tr), body(bl), body(br)],
    midLeft: mid(gem.midLeft, midLit[0]),
    midRight: mid(gem.midRight, midLit[1]),
    top: body(gem.top),
    light: GEM_LIGHT_COLOR,
  };
}
