// ========================================
// IMPORTS
// ========================================
import { getLighting, getNightDepth } from './lightingUtils';
import { lerp } from './math';

// ========================================
// FUNCTIONS
// ========================================

/**
 * The sea's colours at `localTime` (docs/specs/WORLD_VIEW_DISTRICTS.md §1.5): `d = 1 - nightDepth` (0 at deepest night, 1
 * at noon) and the water column's two gradient stops, their lightness rounded to whole percent so they step once every
 * ~2 s like the facades instead of churning on every sub-percent change in the lighting curve. WaterColumn paints the
 * sea with them; the scene wash (animation/sceneWash.ts, docs/tasks/OFF_SCREEN_REVISIONS.md Task 13) covers a world
 * change in the same sea - "an ocean colour from the existing world", Crawford's answer, 2026-10-31.
 */
export function waterColumnColors(localTime: number): { d: number; top: string; bottom: string } {
  const { eastL, westL } = getLighting(localTime);
  const d = 1 - getNightDepth(eastL, westL);
  const topL = Math.round(lerp(8, 30, d));
  const bottomL = Math.round(lerp(4, 12, d));
  return { d, top: `hsl(200, 45%, ${topL}%)`, bottom: `hsl(230, 45%, ${bottomL}%)` };
}
