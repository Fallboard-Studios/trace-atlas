// ========================================
// IMPORTS
// ========================================
// (none — pure string/math utilities)

// ========================================
// FUNCTIONS
// ========================================

/**
 * Derive a stable Attenuation Style seed string from its display name.
 * Lowercases, strips any character that is not a-z or 0-9.
 * E.g. "Pelagos 7!" → "pelagos7"
 */
export function deriveAttenuationStyleSeed(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generate a fresh random alphanumeric Attenuation Style name (lowercase
 * a-z0-9, 8 chars). No lore/flavor generation yet — nothing in the UI
 * displays the raw name today; a lore-style generator can replace this
 * later (Sector Settings, roadmap Phase 5) without changing this function's
 * callers.
 */
export function generateRandomAttenuationStyleName(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * A random integer coordinate — one axis of a locale coordinate pair. Used by
 * Sector Settings' "Random" coordinate button and for any axis a world link
 * does not pin (docs/specs/SHORT_WORLD_LINK.md). Range is arbitrary but
 * generous enough to feel like "a different plot," not a variation on the
 * current one.
 */
export function randomCoordinate(): number {
  return Math.round((Math.random() - 0.5) * 400);
}
