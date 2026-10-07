// ========================================
// SCENE DEPTH CONSTANTS
// docs/specs/WORLD_VIEW_DISTRICTS.md §1.6-1.7 (roadmap Phase 42, Task 6)
// ========================================

/**
 * Lightness multiplier cap per district recipe row depth (districtRecipes.ts's
 * `DistrictRow.depth`), multiplied into the east/west lighting multipliers before
 * `applyColorShift` — background buildings read hazier/dimmer than foreground ones at the
 * same hour. `foreground: 1.0` is a no-op, so an actor whose row can't be resolved (a
 * defensive fallback, not a real spawn-time path) is safe to default to it.
 */
export const ROW_L_CAP: Record<'background' | 'midground' | 'foreground', number> = {
  background: 0.7,
  midground: 0.85,
  foreground: 1.0,
};

/** Derelict actors (§1.6) additionally compound the depth cap by this factor. */
export const DERELICT_L_CAP = 0.55;

/** Derelict actors' body saturation is multiplied by this factor (§1.6). */
export const DERELICT_SAT = 0.4;

/**
 * The scene's fixed viewBox bounds. Moved here from `systems/factoryPlacementSystem.ts`
 * (roadmap Phase 42, Task 6 — spec §7 Q3); re-exported there so existing importers
 * (`districts.ts`) don't need to change their import path.
 */
export const WORLD_BOUNDS = { width: 1920, height: 1080 };
