// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.10)
// ========================================

/** Chamfer size: 0.3 × min(w, h). */
const GEM_CHAMFER_FRAC = 0.3;

// ========================================
// API
// ========================================

/**
 * The scenery gem octagon's corner cut — read by GemShape (gemShape.tsx), which draws it, and by
 * the work anchors (sceneryWorkAnchors.ts), which sit robots on it. A plain .ts module so the
 * component file exports only components (react-refresh/only-export-components).
 */
export function gemChamfer(w: number, h: number): number {
  return Math.min(w, h) * GEM_CHAMFER_FRAC;
}
