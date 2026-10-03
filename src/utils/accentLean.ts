// ========================================
// IMPORTS
// ========================================
import { hexToHsl, type HSL, type ColorShift } from './colorUtils';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '@/constants/accentColors';

// ========================================
// CONSTANTS
// ========================================

/**
 * Fraction of the shortest hue arc a factory's body travels toward its target accent hue.
 * 0 = off, 1 = snap. Crawford's call (docs/intent/world-palette-pull.md): HALF — the console's
 * 25%-transparent panels (NavPanel/ContentPane/Header, `--color-surface: rgba(26,26,26,0.75)`)
 * sit over the world view, so whatever hue the world carries bleeds into the UI; a full snap
 * oversaturates them. Tune by eye at the plan's Checkpoint B, never store, never expose.
 * See docs/specs/WORLD_PALETTE_PULL.md §1.1.
 */
export const ACCENT_PULL_FRACTION = 0.5;

/**
 * Percentage points added to a factory body's saturation. Every variant's body starts from the
 * graphite base in src/constants/colorTheme.json (15% saturation at 19% lightness), where a hue
 * pull alone is invisible — "very gray" is a saturation problem first. Same glass-overlay
 * ceiling as the pull fraction above; lightness is deliberately NOT touched (spec §7 item 1,
 * closed: some buildings staying grey is accepted). Tune by eye at Checkpoint B.
 */
export const ACCENT_SAT_LIFT = 15;

/**
 * Warm-band saturation cap (Checkpoint B tuning, Crawford 2026-10-02 — spec §1.1 amendment).
 * Warm seeds came out "like candy": six of the 18 accents sit in the red→orange band, a warm
 * primary's nearest neighbour is warm too, and the 24-building Monolith row already carries a
 * +40..60 variant saturation range — so lift + variant made a wall of hot red. Cool seeds read
 * right, so the lift is tempered for warm hues only: when the POST-pull body hue lands inside
 * [ACCENT_WARM_BAND_START, ACCENT_WARM_BAND_END] (wrapping through 0), the saturation delta is
 * min(lift, cap − body.s) — it can go negative to pull an already-hot Monolith down to the cap.
 * Tune by eye; never store.
 */
export const ACCENT_WARM_BAND_START = 330;
export const ACCENT_WARM_BAND_END = 45;
export const ACCENT_WARM_SAT_CAP = 45;

/**
 * The 18 accent hues (degrees), in ROBOT_IDENTITY_COLOR_NAMES order so an index here is the same
 * index spawnSystem.ts's seeded robot-color draw uses. Computed once at import via the app's one
 * hex→HSL conversion. Raw, unrounded.
 */
export const ACCENT_HUES: readonly number[] = ROBOT_IDENTITY_COLOR_NAMES.map((name) => hexToHsl(ACCENT_COLORS[name]).h);

// ========================================
// TYPES
// ========================================

/** A style's two lean targets (degrees): a seeded primary plus its nearest other accent hue. */
export interface AccentPair {
  primary: number;
  secondary: number;
}

// ========================================
// EXPORTS
// ========================================

/** Shortest signed arc from `from` to `to`, in degrees, in (−180, 180]. An exact half-turn is +180. */
export function hueArc(from: number, to: number): number {
  const raw = (((to - from) % 360) + 540) % 360 - 180; // → [-180, 180)
  return raw === -180 ? 180 : raw;
}

/** Index into ROBOT_IDENTITY_COLOR_NAMES / ACCENT_HUES of the accent hue nearest `hue` by shortest arc. */
export function nearestAccentIndex(hue: number): number {
  return nearestIndexExcluding(hue, -1);
}

/** Index of the nearest accent hue to the primary at `primaryIndex`, never the primary itself. */
export function secondaryFor(primaryIndex: number): number {
  return nearestIndexExcluding(ACCENT_HUES[primaryIndex], primaryIndex);
}

/**
 * The additive delta that moves `body` — the FINAL pre-lean body colour, variant base + local +
 * Attenuation Style shift already applied — `fraction` of the way to `targetHue` and lifts its
 * saturation by `lift`. Returned as a ColorShift so the caller adds it straight onto the
 * hueShift/satShift it already stores (spec §1.3). Never clamps: saturation is clamped where it
 * always was, in shiftHSL at render, so this composes additively like the AS shift does.
 */
export function computeAccentLeanWith(body: HSL, targetHue: number, fraction: number, lift: number): ColorShift {
  // `+ 0` folds the -0 a negative arc × 0 produces into +0, so a zero lean is Object.is-equal
  // to a literal 0 in every stored-shift parity test.
  const hueShift = hueArc(body.h, targetHue) * fraction + 0;
  const landedHue = (((body.h + hueShift) % 360) + 360) % 360;
  const satShift = isWarmHue(landedHue) ? Math.min(lift, ACCENT_WARM_SAT_CAP - body.s) : lift;
  return { hueShift, satShift };
}

/** True when `hue` (degrees, any real) falls inside the warm red→orange band, inclusive at both
 *  ends, wrapping through 0 (330 → 360 → 45). */
export function isWarmHue(hue: number): boolean {
  const h = ((hue % 360) + 360) % 360;
  return h >= ACCENT_WARM_BAND_START || h <= ACCENT_WARM_BAND_END;
}

/** computeAccentLeanWith bound to the module constants — the one the placement system calls. */
export function computeAccentLean(body: HSL, targetHue: number): ColorShift {
  return computeAccentLeanWith(body, targetHue, ACCENT_PULL_FRACTION, ACCENT_SAT_LIFT);
}

// ========================================
// HELPERS
// ========================================

function nearestIndexExcluding(hue: number, exclude: number): number {
  let best = -1;
  let bestArc = Infinity;
  for (let i = 0; i < ACCENT_HUES.length; i++) {
    if (i === exclude) continue;
    const arc = Math.abs(hueArc(hue, ACCENT_HUES[i]));
    if (arc < bestArc) {
      bestArc = arc;
      best = i;
    }
  }
  return best;
}
