// ========================================
// IMPORTS
// ========================================
import type { AudioAttributes, WaveformType, ADSREnvelope } from '../../types/Robot';
import type { OscillatorLayer } from '../../types/layeredAudio';
import { hexToHsl, hslToString } from '../../utils/colorUtils';
import { RobotSleek } from './RobotSleek';
import { RobotAngular } from './RobotAngular';
import { RobotOrganic } from './RobotOrganic';
import { RobotIndustrial } from './RobotIndustrial';
import { BATTERY_DIM_THRESHOLD_LOW, BATTERY_DIM_THRESHOLD_MID, BATTERY_DIM_THRESHOLD_CRITICAL } from '../../constants';

// ========================================
// TYPES
// ========================================
export interface RobotColors {
  primary: string;
  secondary: string;
  accent: string;
  highlight: string; // secondary hue, lightness +25 (cap 95) — replaces the fixed #a9adb0
  shadow: string; // accent hue, lightness -25 (floor 5) — replaces the fixed #000000
}

export type RobotSVGComponent = typeof RobotSleek | typeof RobotAngular | typeof RobotOrganic | typeof RobotIndustrial;

// ========================================
// CONSTANTS
// ========================================
// ADSR thresholds for color mapping
const FAST_ATTACK_THRESHOLD = 0.1;   // seconds

// Base hue per waveform (degrees)
const BASE_HUE: Record<WaveformType, number> = {
  sine: 210,
  square: 24,
  triangle: 280,
  sawtooth: 140,
  pulse: 60,
};

// Safety guard to avoid divide-by-zero
const MIN_DENOMINATOR = 1e-4;

// ========================================
// EXPORTS
// ========================================

/**
 * Select robot shape component based on waveform.
 */
export function selectRobotShape(waveform: WaveformType): RobotSVGComponent {
  switch (waveform) {
    case 'sine':
      return RobotSleek;
    case 'square':
      return RobotAngular;
    case 'triangle':
      return RobotOrganic;
    case 'sawtooth':
      return RobotIndustrial;
    default:
      return RobotSleek;
  }
}

/**
 * Compute a hue offset (degrees) from ADSR components.
 * Uses decay/release and attack/sustain ratios to produce a small deterministic offset.
 */
export function hueOffset(adsr: AudioAttributes['adsr']): number {
  const { attack, decay, sustain, release } = adsr;
  const denomDR = Math.max(MIN_DENOMINATOR, decay + release);
  const denomAS = Math.max(MIN_DENOMINATOR, attack + sustain);

  const drComponent = (decay / denomDR - release / denomDR) * 18; // ±18°
  const asComponent = (attack / denomAS - sustain / denomAS) * 9; // ±9°

  return drComponent + asComponent;
}

export function toSaturation(attack: number): number {
  const MIN_ATTACK = 0.01;
  const MAX_ATTACK = 1.0;
  const MIN_SAT = 30;
  const MAX_SAT = 100;

  const norm = clamp01((attack - MIN_ATTACK) / (MAX_ATTACK - MIN_ATTACK));
  // Fast attack (small value) -> higher saturation
  return Math.round(MIN_SAT + (1 - norm) * (MAX_SAT - MIN_SAT));
}

export function toLuminance(sustain: number): number {
  const MIN_L = 20;
  const MAX_L = 72;
  const norm = clamp01(sustain); // sustain expected in 0..1
  return Math.round(MIN_L + norm * (MAX_L - MIN_L));
}

/**
 * Generate colors from full AudioAttributes
 */
export function generateColors(attrs: AudioAttributes): RobotColors {
  const { adsr, waveform } = attrs;

  const baseHue = BASE_HUE[waveform] ?? 200;
  const offset = hueOffset(adsr);
  const primaryHue = ((baseHue + offset) % 360 + 360) % 360; // normalized
  const secondaryHue = ((primaryHue + 14) % 360 + 360) % 360;
  const accentHue = ((primaryHue - 22) % 360 + 360) % 360;

  const sat = toSaturation(adsr.attack);
  const lum = toLuminance(adsr.sustain);

  const secondarySat = Math.round(sat * 0.9);
  const secondaryLum = Math.max(8, Math.round(lum * 0.9));
  const accentSat = Math.round(Math.min(100, sat * 1.1));
  const accentLum = Math.max(6, Math.round(lum * 0.95));

  return {
    primary: `hsl(${Math.round(primaryHue)}, ${sat}%, ${lum}%)`,
    secondary: `hsl(${Math.round(secondaryHue)}, ${secondarySat}%, ${secondaryLum}%)`,
    accent: `hsl(${Math.round(accentHue)}, ${accentSat}%, ${accentLum}%)`,
    highlight: `hsl(${Math.round(secondaryHue)}, ${secondarySat}%, ${Math.min(95, secondaryLum + 25)}%)`,
    shadow: `hsl(${Math.round(accentHue)}, ${accentSat}%, ${Math.max(5, accentLum - 25)}%)`,
  };
}

// ========================================
// Live body shape (replaces the spawn-time snapshot)
// ========================================

/** Normalises the shared envelope into 0..1 body params. Matches the seeded generation range
 *  (spawnSystem's ATTACK_RANGE/RELEASE_RANGE max 5s); edits past it clamp. */
export const BODY_NORMALISER = { attack: 5, sustain: 1, release: 5 } as const;

export interface BodyShape {
  scale: number; // 0..1 — snappier attack → bigger body
  roundness: number; // 0..1 — sustain → torso aspect
  detail: number; // 0..1 — release → detail cliff
}

/**
 * Live replacement for the old spawn-time snapshot: scale/roundness/detail from the current
 * ADSR envelope, so Robot Options edits reach the body.
 */
export function bodyShapeFromAdsr(adsr: ADSREnvelope): BodyShape {
  const attackRatio = clamp01(adsr.attack / BODY_NORMALISER.attack);
  return {
    scale: 0.25 + (1 - attackRatio) * 0.75,
    roundness: clamp01(adsr.sustain / BODY_NORMALISER.sustain),
    detail: clamp01(adsr.release / BODY_NORMALISER.release),
  };
}

export const BODY_SCALE_MIN = 0.735; // 1.5x the pre-Phase-36 floor of 0.49 (Crawford, 2026-10-03)

/** Final body scale: register step x attack-driven bias, floored. */
export function calculateBodyScale(octaveRange: [number, number], bodyScale01: number): number {
  const bias = Math.max(-0.4, Math.min(0.4, (bodyScale01 - 0.5) * 0.6));
  return Math.max(BODY_SCALE_MIN, calculateScale(octaveRange) * (1 + bias));
}

export const LAMP_MIN = 0.4;

/** Averaged audible-layer gain (gain !== 0; 1 if none — spawnSystem's own rule) blended with
 *  detail. Gains are seeded 0.2..1.2, so the blend is clamped. */
export function calculateLampIntensity(layers: OscillatorLayer[] | undefined, detail: number): number {
  const audible = (layers ?? []).filter((l) => l.gain !== 0);
  const averagedGain = audible.length > 0 ? audible.reduce((s, l) => s + l.gain, 0) / audible.length : 1;
  return clamp01(averagedGain * 0.6 + detail * 0.4);
}

// ========================================
// Shape params
// ========================================

export interface ShapeParams {
  torsoAspect: number; // horizontal stretch (0.7..1.3)
}

export interface MicroVariants {
  stripes?: boolean;
  smooth?: boolean;
  spikes?: boolean;
}

/**
 * Deterministically derive visual shape parameters from AudioAttributes.
 * Keeps values clamped to safe visual ranges.
 */
export function shapeParamsFromAudio(attrs: AudioAttributes & { octaveOffset?: number }, octaveRange?: [number, number]) {
  const { waveform, adsr } = attrs;

  // Prefer caller-supplied octaveRange, then audioAttributes.octaveRange, then mid-register fallback
  const register: [number, number] = octaveRange ?? attrs.octaveRange ?? [2, 4];
  const mid = (register[0] + register[1]) / 2; // 2=bass, 3=mid, 4=treble

  // torsoAspect: lower register -> wider (1.15), higher register -> narrower (0.85)
  const pitchNorm = clamp01((mid - 1) / 4); // map [1..5] midpoints to 0..1
  const torsoAspect = 1.15 - pitchNorm * 0.3; // 1.15 -> 0.85

  const micro: MicroVariants = {};
  if (waveform === 'square') micro.stripes = true;
  if (waveform === 'sine') micro.smooth = true;
  if (waveform === 'triangle' || waveform === 'sawtooth') micro.spikes = true;
  if (adsr.attack < FAST_ATTACK_THRESHOLD) micro.stripes = true;

  const clamped: ShapeParams = {
    torsoAspect: Math.max(0.7, Math.min(1.3, torsoAspect)),
  };

  return { shapeParams: clamped, microVariants: micro };
}

/**
 * Calculate scale from pitch range
 * High pitch → smaller (0.7x)
 * Mid pitch → normal (1.0x)
 * Low pitch → larger (1.3x)
 */
export function calculateScale(octaveRange: [number, number]): number {
  const mid = (octaveRange[0] + octaveRange[1]) / 2;
  if (mid <= 2) return 1.3;  // bass register [1,3]
  if (mid >= 4) return 0.7;  // treble register [3,5]
  return 1.0;                 // mid register [2,4]
}

/**
 * Adjust RobotColors by applying a lightness multiplier to each color.
 * Multiplier scales the L component of HSL (0..1) and clamps results.
 */
export function applyLightnessMultiplier(colors: RobotColors, multiplier: number): RobotColors {
  return {
    primary: adjustHslLightness(colors.primary, multiplier),
    secondary: adjustHslLightness(colors.secondary, multiplier),
    accent: adjustHslLightness(colors.accent, multiplier),
    highlight: adjustHslLightness(colors.highlight, multiplier),
    shadow: adjustHslLightness(colors.shadow, multiplier),
  };
}

/**
 * Derive the robot's window-glass fill and its lighter sheen from the identity colour.
 * Reuses the identity hex as the glass fill; the sheen is the same hue/saturation lightened.
 */
export function identityGlass(hex: string): { glass: string; sheen: string } {
  const hsl = hexToHsl(hex);
  return {
    glass: hex,
    sheen: hslToString({ ...hsl, l: Math.min(95, hsl.l + 20) }),
  };
}

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

// Phase 38 names, kept only until the sockets are deleted (Phase 39 Task 10).
export const SOCKET_DARK = MID_DARK_LEVEL;
export const SOCKET_MIN = MID_LIT_MIN;
export const SOCKET_GAIN_MAX = MID_GAIN_MAX;
export const socketLitOpacity = layerLitLevel;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Opacity multiplier (1 = full brightness) for a robot's window/viewport and
 * status-light SVG elements, driven by battery level — the lower the
 * battery, the dimmer those specific elements get. A step function, not
 * additive: the deepest applicable tier alone applies, since a critical
 * battery level implies the shallower thresholds too.
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

/**
 * Parse an HSL string `hsl(h, s%, l%)` into components.
 */
function parseHslString(hsl: string) {
  const m = /hsl\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(hsl);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/**
 * Adjust an HSL string's lightness, returning an HSL string.
 */
function adjustHslLightness(input: string, multiplier: number) {
  const parsed = parseHslString(input);
  if (!parsed) return input;
  const { h, s, l } = parsed;
  const newL = Math.round(clamp01((l / 100) * multiplier) * 100);
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${newL}%)`;
}

