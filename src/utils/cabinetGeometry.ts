/**
 * Pure oblique-projection math for a single cabinet box's front-face offset
 * — no DOM, no GSAP. Both wall parallelograms (Top Face, Left Face) are,
 * geometrically, a plain rectangle skewed by a FIXED angle (independent of
 * pop progress t) and scaled along one axis by t itself — CabinetBox.tsx
 * renders them as two CSS-transformed <div>s (skew set once via gsap.set()
 * on mount, never animated; only scaleY/scaleX, equal to t directly, tween)
 * instead of SVG <polygon>s tweening a `points` attribute string. This file
 * no longer computes wall geometry at all, only the front face's own
 * translate offset, which never depended on box width/height in the first
 * place. See docs/specs/archive/OBLIQUE_CABINETRY_WALL_RENDERING.md §1.2/§1.3 for
 * the full derivation, and docs/specs/archive/OBLIQUE_CABINETRY_FOUNDATION.md §1.2
 * for the original oblique-projection vector this re-expresses.
 */

/**
 * How far the front face slides at full pop, for Button/Toggle — the two
 * single-box consumers. Deliberately NOT scaled by box height: a small
 * fixed magnitude, identical across every breakpoint's box height.
 * CabinetBox.tsx applies the resolved distance (this constant, unless a
 * consumer overrides it via CabinetBoxProps.popDistance) directly as an
 * inline --cabinet-pop-distance custom property.
 *
 * VoxelTrack (roadmap 11.1.3) is a different visual context — a row of many
 * boxes read together, not one box in isolation — and reads better at a
 * deeper protrusion than Button/Toggle's own value; see
 * VOXEL_TRACK_POP_DISTANCE below. Tuned by feel after a real visual pass;
 * expect these numbers to keep moving.
 */
export const CABINET_POP_DISTANCE = 2;

/**
 * VoxelTrack's own MAXIMUM pop distance (roadmap 11.1.3) — deeper than
 * Button/Toggle's CABINET_POP_DISTANCE because a row of many boxes read
 * together benefits from a more visible protrusion than a single isolated
 * box does. Every other CabinetBox consumer keeps using the
 * CABINET_POP_DISTANCE default. Tuned by feel against the real running app,
 * 2026-09-08.
 *
 * Not applied flat to every box: only the box nearest the slider's maximum
 * ever reaches this distance. `voxelTrackMath.ts`'s `computeVoxelBoxPopDistance`
 * interpolates each box's own ceiling between `VOXEL_TRACK_POP_DISTANCE_MIN_RATIO`
 * of this value (box 0, nearest min) and this value itself (the last box,
 * nearest max), by fixed row position — independent of the slider's current
 * value.
 */
export const VOXEL_TRACK_POP_DISTANCE = 8;

/**
 * The floor `computeVoxelBoxPopDistance` interpolates from, as a fraction of
 * VOXEL_TRACK_POP_DISTANCE — box 0 (nearest min) never protrudes past this
 * fraction of the full distance, regardless of `popT`. Expressed as a ratio
 * (not a literal px value) so it tracks VOXEL_TRACK_POP_DISTANCE automatically
 * if that constant is retuned again. 0.125 = 1px at the current 8px value —
 * "the lowest box should only protrude ~1px," confirmed by feel, 2026-09-08.
 */
export const VOXEL_TRACK_POP_DISTANCE_MIN_RATIO = 0.125;

/**
 * Resting-state pop fraction for Button/RadioButton/Toggle's own "inactive"
 * items (Crawford's own request, 2026-09-13 — replaces an earlier
 * gradient-border-on-the-front-face attempt he didn't like). 0.5 of
 * CABINET_POP_DISTANCE's own default (2px) is exactly 1px: a shallow,
 * permanent protrusion that gives every inactive item a visible hint of its
 * trait/robot color (the walls' own glow/backing peek-through already renders
 * correctly at any fractional t — see VOXEL_TRACK_POP_DISTANCE_MIN_RATIO
 * above for the identical technique already shipped for VoxelTrack's own
 * lowest box) instead of a dedicated border rule. Only the previously-flat
 * (t=0) resting value changes — the fully hovered/selected/checked ceiling
 * stays at 1 (the original, unchanged 2px), so "popping further" still reads
 * as the same size jump it always has.
 */
export const CABINET_REST_POP = 0.5;

/**
 * Fixed skew angles (degrees) for the top/left wall divs, derived directly
 * from the 2:1 oblique projection vector — independent of t or popDistance,
 * set exactly once per CabinetBox instance (via gsap.set(), on mount) and
 * never animated. Their sum is 90°: the top face's stationary edge
 * (horizontal) and the left face's (vertical) are perpendicular, sharing
 * one projection vector. See
 * docs/specs/archive/OBLIQUE_CABINETRY_WALL_RENDERING.md §1.2 for the derivation.
 */
export const CABINET_TOP_FACE_SKEW_DEG = Math.atan(2) * (180 / Math.PI);
export const CABINET_LEFT_FACE_SKEW_DEG = Math.atan(0.5) * (180 / Math.PI);

export interface CabinetFrontFaceOffset {
  frontFaceOffsetX: number;
  frontFaceOffsetY: number;
}

/**
 * The front face's translate offset at pop progress t. Never depended on
 * box width/height — only the now-retired wall-polygon math did. Still the
 * same fixed 2:1 oblique vector direction regardless of magnitude:
 * `2 * popDistance` right, `popDistance` down at t=1. `popDistance` defaults
 * to CABINET_POP_DISTANCE (Button/Toggle's own value) when omitted; pass
 * VOXEL_TRACK_POP_DISTANCE (or a computeVoxelBoxPopDistance result) for a
 * different visual context.
 */
export function computeCabinetFrontFaceOffset(
  t: number,
  popDistance: number = CABINET_POP_DISTANCE,
): CabinetFrontFaceOffset {
  return {
    frontFaceOffsetX: 2 * popDistance * t,
    frontFaceOffsetY: popDistance * t,
  };
}
