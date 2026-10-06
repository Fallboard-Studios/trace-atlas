// ========================================
// BODY LINE DIALS (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.2)
// ========================================
// Pure mapping from a robot's LFO links to the stroke width of its Top and Mid boundary lines:
// each line follows the depth of its own layer's gain-LFO link (Top ← layer0, Mid left/Coaxial ←
// layer1, Mid right/Harmonic ← layer2). Nothing here reads the lane's live phase, BPM or
// AudioEngine — the link's stored depth only (docs/intent/robot-halo-and-lit-lines.md).

// ========================================
// IMPORTS
// ========================================
import { LFO_DEPTH_MIN, LFO_DEPTH_MAX, type LfoLink, type RobotLfoTargetId } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

// ========================================
// TYPES
// ========================================
/** Stroke widths, in gem units, of the three body boundary-line sets. */
export interface BodyLineDials {
  top: number;
  midLeft: number;
  midRight: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Width range on the layer's gain-LFO depth (intent table row "Top/Mid line width"): 0.3 at
 *  depth 0 (or no link), 0.7 at depth 100. The 0.7 ceiling is where a stroke still clears the
 *  bevel at the generator's 0.35 line clearance (half of 0.7) — the generator is not touched. */
export const BODY_LINE_MIN = 0.3;
export const BODY_LINE_MAX = 0.7;

/** Fixed strip opacity on the Top and Mid lines (interview verdict: not lit level, not gain). */
export const BODY_STRIP_OPACITY = 0.6;

/** Which gain-LFO target each line reads. */
const LINE_TARGETS: Record<keyof BodyLineDials, RobotLfoTargetId> = {
  top: 'layer0.gain',
  midLeft: 'layer1.gain',
  midRight: 'layer2.gain',
};

// ========================================
// HELPERS
// ========================================
function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A link's effective depth: `lane: null` (not in the graph) or a missing link reads as 0. */
function linkDepth(link: LfoLink | undefined): number {
  if (!link || link.lane === null) return 0;
  return clampTo(link.depth, LFO_DEPTH_MIN, LFO_DEPTH_MAX);
}

function widthOf(depth: number): number {
  return BODY_LINE_MIN + (BODY_LINE_MAX - BODY_LINE_MIN) * (depth / LFO_DEPTH_MAX);
}

// ========================================
// DIALS
// ========================================
export function bodyLineDials(lfoLinks: Robot['lfoLinks']): BodyLineDials {
  return {
    top: widthOf(linkDepth(lfoLinks?.[LINE_TARGETS.top])),
    midLeft: widthOf(linkDepth(lfoLinks?.[LINE_TARGETS.midLeft])),
    midRight: widthOf(linkDepth(lfoLinks?.[LINE_TARGETS.midRight])),
  };
}
