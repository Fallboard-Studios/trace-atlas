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
  // If a global override is set, prefer that (sanitised at set time).
  if (GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE) return GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE;
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Module-level override that, when set, causes `deriveAttenuationStyleSeed`
// to return the override for every Attenuation Style. This is intentionally
// simple so existing callers don't need to change imports.
//
// No longer initialized from a `?seed=` URL param or boot-time global (roadmap
// Phase 21) -- the shareable-link `?session=` param (sessionShareUtils.ts) is a
// strictly better reproducibility tool than a pinned-but-sanitized seed, and
// having both read the URL at boot risked exactly the kind of persistent,
// session-wide hijack docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md §7 item 1
// found. The setter/getter below stay as general-purpose primitives -- still
// used by tests, AudioDebugHud.tsx (read-only display), and
// getSeededVal.ts/noiseMaps.ts (which mix this override into their own seed
// formulas whenever something sets it directly) -- only the URL entry point
// is gone.
let GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE: string | null = null;

/**
 * Set or clear the global Attenuation Style seed override.
 * Pass `null` to clear the override.
 */
export function setGlobalAttenuationStyleSeedOverride(seed: string | null): void {
  GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE = seed
    ? seed.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
}

/**
 * Return the current global Attenuation Style seed override, or `null` if none.
 */
export function getGlobalAttenuationStyleSeedOverride(): string | null {
  return GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE;
}

/**
 * Parse a `?x=` / `?y=` coordinate URL param. Coordinates are integers
 * system-wide (docs/specs/SECTOR_SETTINGS.md), so only a plain optionally
 * negative integer string is accepted — anything else (empty, decimal,
 * exponent, trailing text) returns `null`, i.e. "not overridden".
 */
export function parseCoordinateParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

export interface LocaleCoordinateOverride {
  x: number | null;
  y: number | null;
}

// Module-level override for the default locale's starting coordinates. Each
// axis is independent: an unset axis (null) stays random. No longer
// initialized from `?x=`/`?y=` URL params (roadmap Phase 21 — see
// GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE's comment above); the setter/getter
// stay as general-purpose primitives.
let LOCALE_COORDINATE_OVERRIDE: LocaleCoordinateOverride = { x: null, y: null };

/**
 * Set or clear the default locale's coordinate override. Only affects a
 * default locale built AFTER the call (localeStore reads it once at module
 * load), so it is mainly useful before that module is imported, and in tests.
 */
export function setLocaleCoordinateOverride(override: LocaleCoordinateOverride): void {
  LOCALE_COORDINATE_OVERRIDE = { x: override.x, y: override.y };
}

/** Return the current coordinate override; an axis is `null` when not overridden. */
export function getLocaleCoordinateOverride(): LocaleCoordinateOverride {
  return { ...LOCALE_COORDINATE_OVERRIDE };
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
 * A random integer coordinate — one axis of a locale coordinate pair. No
 * seed/reproducibility contract applies to locale coordinates the way
 * `resolveDefaultAttenuationStyleName`'s override does for the Attenuation
 * Style name: coordinates are already a freely user-driven axis everywhere
 * else in the app (Sector Settings' own "Random" coordinate button has
 * always called exactly this, ungated by any seed override), so the
 * default locale's own starting coordinates follow the same rule. Range is
 * arbitrary but generous enough to feel like "a different plot," not a
 * variation on the current one.
 */
export function randomCoordinate(): number {
  return Math.round((Math.random() - 0.5) * 400);
}

/**
 * Resolve the name to use for the app's default Attenuation Style on load.
 *
 * If a global seed override is active (`?seed=`,
 * `window.__GLOBAL_ATTENUATION_STYLE_SEED__`, or
 * `setGlobalAttenuationStyleSeedOverride`), returns that override
 * deterministically — preserving the override's documented purpose of
 * reproducible bug reports/screenshots end-to-end, not just for downstream
 * data-key hashing. Otherwise returns a fresh random name each call.
 */
export function resolveDefaultAttenuationStyleName(): string {
  const override = getGlobalAttenuationStyleSeedOverride();
  return override ?? generateRandomAttenuationStyleName();
}
