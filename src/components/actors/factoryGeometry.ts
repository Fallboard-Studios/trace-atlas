// ========================================
// IMPORTS
// ========================================
import type { Actor } from '../../types/Actor';
import { selectVariantFromSeed, VARIANT_CONF, type FactoryVariant } from './factoryVariants';
import { calcSilhouetteSize } from './silhouetteUtils';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from '../../systems/factoryPlacementSystem';

// ========================================
// TYPES
// ========================================

export interface FactoryGeometry {
  variant: FactoryVariant;
  /** Unscaled silhouette size; the body is drawn as a 100×100 box scaled to width·sx × height·sy. */
  width: number;
  height: number;
  /** The east/west face split, 0–100 across the body. */
  frontCornerX: number;
  /** The rendered body in scene units: x … x + w·sx, bottom-anchored at y (top rounded, as drawn). */
  box: { x0: number; y0: number; x1: number; y1: number };
}

// ========================================
// API
// ========================================

/**
 * A factory's variant, size and on-screen box — the one derivation `Factory.tsx` renders from and
 * the work sites (Phase 43) read, so the two can't drift. Pure: reads only the actor.
 */
export function factoryGeometry(actor: Actor): FactoryGeometry {
  const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
  const district = actor.config?.district ?? 'dense';
  const available = getRecipeRow(district, row)?.variants;
  const { variant, noiseValue, frontCornerX } = selectVariantFromSeed(actor.id, actor.position.x, row, available);
  const { width, height } = calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange);

  const sx = actor.scaleX ?? 1;
  const sy = actor.scaleY ?? 1;
  const x0 = actor.position.x;
  // Rounded exactly as silhouetteUtils' bottomAnchorTransform rounds the rendered translate.
  const y0 = Math.round(actor.position.y - height * sy);

  return {
    variant,
    width,
    height,
    frontCornerX,
    box: { x0, y0, x1: x0 + width * sx, y1: y0 + height * sy },
  };
}
