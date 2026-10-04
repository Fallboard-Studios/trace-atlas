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

// Filter thresholds for detail level mapping
const HIGH_FILTER_THRESHOLD = 2000;  // Hz
const LOW_FILTER_THRESHOLD = 500;    // Hz

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
  torsoAspect: number;      // horizontal stretch (0.7..1.3)
  appendageLength: number;  // multiplier for propeller/strut lengths (0.6..1.4)
  scaleBias: number;        // additive bias applied to overall scale (-0.3..0.3)
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
  const { filterFreq, waveform, adsr, octaveOffset } = attrs;

  // Prefer caller-supplied octaveRange, then audioAttributes.octaveRange, then mid-register fallback
  const register: [number, number] = octaveRange ?? attrs.octaveRange ?? [2, 4];
  const mid = (register[0] + register[1]) / 2; // 2=bass, 3=mid, 4=treble

  // torsoAspect: lower register -> wider (1.15), higher register -> narrower (0.85)
  const pitchNorm = clamp01((mid - 1) / 4); // map [1..5] midpoints to 0..1
  const torsoAspect = 1.15 - pitchNorm * 0.3; // 1.15 -> 0.85

  // appendageLength: use filterFreq (more detail -> longer appendages)
  const detailNorm = calculateDetailLevel(filterFreq); // 0..1
  const appendageLength = 0.7 + detailNorm * 0.8; // 0.7..1.5

  // scaleBias: derived from register (reuse calculateScale as anchor)
  const baseScale = calculateScale(register); // 0.7|1|1.3
  const scaleBias = Math.round((baseScale - 1) * 100) / 100; // -0.3|0|0.3

  // octaveOffset nudges scale if provided (0 = fastest/smallest -> slight negative bias)
  let octaveBias = 0;
  if (typeof octaveOffset === 'number') {
    // map 0->-0.06, 1->0, 2->+0.06
    octaveBias = (octaveOffset - 1) * 0.06;
  }

  const finalScaleBias = clamp01(0.5 + (scaleBias + octaveBias)) - 0.5; // keep within roughly -0.5..0.5 then recentre

  const micro: MicroVariants = {};
  if (waveform === 'square') micro.stripes = true;
  if (waveform === 'sine') micro.smooth = true;
  if (waveform === 'triangle' || waveform === 'sawtooth') micro.spikes = true;
  if (adsr.attack < FAST_ATTACK_THRESHOLD) micro.stripes = true;

  const clamped: ShapeParams = {
    torsoAspect: Math.max(0.7, Math.min(1.3, torsoAspect)),
    appendageLength: Math.max(0.6, Math.min(1.4, appendageLength)),
    scaleBias: Math.max(-0.4, Math.min(0.4, finalScaleBias)),
  };

  return { shapeParams: clamped, microVariants: micro };
}

// ========================================
// Greeble calculations
// ========================================

/**
 * Deterministic greeble count driven by filterFreq, detailLevel, waveform, and ADSR
 * Caps at 16 and returns an integer >= 0
 */
export function calculateGreebleCount(
  filterFreq: number,
  detailLevel: number,
  waveform: AudioAttributes['waveform'],
  adsr: AudioAttributes['adsr']
): number {
  const freqDetail = calculateDetailLevel(filterFreq); // 0..1
  const sustainFactor = clamp01(adsr.sustain); // 0..1

  // Weighted combination: favor filter freq and explicit detailLevel
  const base = freqDetail * 0.6 + clamp01(detailLevel) * 0.25 + sustainFactor * 0.15;

  const waveformBias = waveform === 'sawtooth' || waveform === 'square' ? 1 : 0;

  const raw = Math.round(base * 15) + waveformBias; // 0..15 + bias -> up to 16
  return Math.max(0, Math.min(16, raw));
}

/**
 * Map sustain (0..1) to greeble visual size (px)
 */
export function calculateGreebleSize(sustain: number): number {
  const s = clamp01(sustain);
  // 1px (staccato) -> 6px (sustained)
  return Math.max(1, Math.round(1 + s * 5));
}

/**
 * Map release (seconds) to greeble persistence (seconds), clamped
 */
export function calculateGreeblePersistence(release: number): number {
  const clamped = Math.max(0.05, Math.min(3.0, release));
  // Visual safety clamp to 0.1..3.0
  return Math.max(0.1, Math.min(3.0, clamped));
}

/**
 * Placement bias derived from decay/release ratio (0..1)
 * Higher decay relative to release biases placement toward front (value closer to 1)
 */
export function calculateGreeblePlacementBias(decay: number, release: number): number {
  const denom = Math.max(MIN_DENOMINATOR, decay + release);
  const ratio = decay / denom; // 0..1
  return clamp01(ratio);
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
 * Calculate detail level from filter frequency
 * Low filter → minimal details (0.0)
 * High filter → maximum details (1.0)
 * Linear interpolation between thresholds
 */
export function calculateDetailLevel(filterFreq: number): number {
  if (filterFreq <= LOW_FILTER_THRESHOLD) {
    return 0.0;
  } else if (filterFreq >= HIGH_FILTER_THRESHOLD) {
    return 1.0;
  } else {
    return (filterFreq - LOW_FILTER_THRESHOLD) / (HIGH_FILTER_THRESHOLD - LOW_FILTER_THRESHOLD);
  }
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

