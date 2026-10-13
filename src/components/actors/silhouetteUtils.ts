import type { Actor } from '../../types/Actor';
import { lerp } from '../../utils/math';

// ========================================
// TYPES
// ========================================

/**
 * Min/max bounds used to map a noise value in [0,1] to a concrete
 * pixel width and height via linear interpolation.
 */
export interface SizeRange {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

// ========================================
// EXPORTS
// ========================================

/**
 * Maps a noise value in [0,1] to a concrete pixel {width, height}
 * by linearly interpolating between the supplied min/max bounds.
 *
 * @param noiseValue - Normalised value in [0,1].
 * @param range - Min/max width and height bounds.
 * @returns Object with `width` and `height` in pixels.
 */
export function calcSilhouetteSize(
  noiseValue: number,
  range: SizeRange,
): { width: number; height: number } {
  const width = lerp(range.minWidth, range.maxWidth, noiseValue);
  const height = lerp(range.minHeight, range.maxHeight, noiseValue);
  return { width, height };
}

/**
 * Builds an SVG `translate(x, y)` transform string that anchors the bottom
 * of a building silhouette to `actor.position.y`, accounting for `scaleY`.
 *
 * @param actor - The factory actor supplying position and optional scale.
 * @param height - Unscaled pixel height of the silhouette.
 * @returns SVG transform string, e.g. `"translate(400, 540)"`.
 */
export function bottomAnchorTransform(actor: Actor, height: number): string {
  const x = actor.position.x;
  const sy = actor.scaleY ?? 1;
  const y = Math.round(actor.position.y - height * sy);
  return `translate(${x}, ${y})`;
}

