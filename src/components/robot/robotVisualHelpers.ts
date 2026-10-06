// ========================================
// ROBOT VISUAL HELPERS — audio → numbers
// ========================================
// The three continuous dials audio drives on a gem polygon robot (docs/specs/GEM_POLYGON_ROBOTS.md
// §1.5): body scale (octave register × attack), light intensity (layer gains × release) and each
// Mid's lit level (its layer's gain), plus the battery dim. Colour lives in gem/gemPalette.ts.
// The hand-drawn robots' colour, shape and socket helpers were deleted in Phase 39 Task 10.

// ========================================
// IMPORTS
// ========================================
import type { ADSREnvelope } from '../../types/Robot';
import type { OscillatorLayer } from '../../types/layeredAudio';
import { BATTERY_DIM_THRESHOLD_LOW, BATTERY_DIM_THRESHOLD_MID, BATTERY_DIM_THRESHOLD_CRITICAL } from '../../constants';

// ========================================
// BODY SCALE
// ========================================

/** Normalises the shared envelope into 0..1 body params. Matches the seeded generation range
 *  (spawnSystem's ATTACK_RANGE/RELEASE_RANGE max 5s); edits past it clamp. */
export const BODY_NORMALISER = { attack: 5, sustain: 1, release: 5 } as const;

export interface BodyShape {
  scale: number; // 0..1 — snappier attack → bigger body
  roundness: number; // 0..1 — sustain
  detail: number; // 0..1 — release (feeds light intensity)
}

/** scale/roundness/detail from the current ADSR envelope, so Robot Options edits reach the body. */
export function bodyShapeFromAdsr(adsr: ADSREnvelope): BodyShape {
  const attackRatio = clamp01(adsr.attack / BODY_NORMALISER.attack);
  return {
    scale: 0.25 + (1 - attackRatio) * 0.75,
    roundness: clamp01(adsr.sustain / BODY_NORMALISER.sustain),
    detail: clamp01(adsr.release / BODY_NORMALISER.release),
  };
}

export const BODY_SCALE_MIN = 0.735; // 1.5x the pre-Phase-36 floor of 0.49 (Crawford, 2026-10-03)

/** Final body scale: register step x attack-driven bias, floored. Range 0.735–1.69. */
export function calculateBodyScale(octaveRange: [number, number], bodyScale01: number): number {
  const bias = Math.max(-0.4, Math.min(0.4, (bodyScale01 - 0.5) * 0.6));
  return Math.max(BODY_SCALE_MIN, calculateScale(octaveRange) * (1 + bias));
}

/**
 * Register step of the body scale:
 * High pitch → smaller (0.7x), mid → normal (1.0x), low → larger (1.3x).
 */
export function calculateScale(octaveRange: [number, number]): number {
  const mid = (octaveRange[0] + octaveRange[1]) / 2;
  if (mid <= 2) return 1.3; // bass register [1,3]
  if (mid >= 4) return 0.7; // treble register [3,5]
  return 1.0; // mid register [2,4]
}

// ========================================
// LIGHTS
// ========================================

export const LAMP_MIN = 0.4;

/** Averaged audible-layer gain (gain !== 0; 1 if none — spawnSystem's own rule) blended with
 *  detail. Gains are seeded 0.2..1.2, so the blend is clamped. */
export function calculateLampIntensity(layers: OscillatorLayer[] | undefined, detail: number): number {
  const audible = (layers ?? []).filter((l) => l.gain !== 0);
  const averagedGain = audible.length > 0 ? audible.reduce((s, l) => s + l.gain, 0) / audible.length : 1;
  return clamp01(averagedGain * 0.6 + detail * 0.4);
}

// ========================================
// MID LIT LEVEL
// ========================================

/** A muted (gain 0) or missing layer's Mid polygon lit level (docs/specs/GEM_POLYGON_ROBOTS.md §1.4). */
export const MID_DARK_LEVEL = 0.15;
/** Lit level of the quietest audible layer — the same floor as the lights. */
export const MID_LIT_MIN = LAMP_MIN;
/** Seeded max layer gain; at or above it a Mid is fully lit. */
export const MID_GAIN_MAX = 1.2;

/** How lit a layer's Mid polygon is, before battery dim. gain 0/undefined → MID_DARK_LEVEL;
 *  interpolates MID_LIT_MIN..1 up to the seeded max gain, clamped above it. Continuous, so a gain
 *  drag slides the Mid's tone rather than popping it (Phase 38's socket curve, renamed). */
export function layerLitLevel(gain: number | undefined): number {
  if (!gain) return MID_DARK_LEVEL;
  return MID_LIT_MIN + (1 - MID_LIT_MIN) * clamp01(gain / MID_GAIN_MAX);
}

// ========================================
// BATTERY
// ========================================

/**
 * Opacity multiplier (1 = full brightness) for a robot's lights, driven by battery level — the
 * lower the battery, the dimmer they get (it also flattens facet contrast: gemShading.ts
 * batteryFacetContrast). A step function, not additive: the deepest applicable tier alone
 * applies, since a critical battery level implies the shallower thresholds too.
 *
 * ≤ BATTERY_DIM_THRESHOLD_CRITICAL (12%): 0.1 (90% dim)
 * <  BATTERY_DIM_THRESHOLD_MID (25%):     0.5 (50% dim)
 * ≤  BATTERY_DIM_THRESHOLD_LOW (50%):     0.75 (25% dim)
 * otherwise:                              1 (no dim)
 */
export function computeBatteryDimOpacity(batteryLevel: number): number {
  if (batteryLevel <= BATTERY_DIM_THRESHOLD_CRITICAL) return 0.1;
  if (batteryLevel < BATTERY_DIM_THRESHOLD_MID) return 0.5;
  if (batteryLevel <= BATTERY_DIM_THRESHOLD_LOW) return 0.75;
  return 1;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
