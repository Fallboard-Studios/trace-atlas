// ========================================
// HALO DIALS (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.1)
// ========================================
// Pure mapping from a robot's volume, envelope and company to the halo behind its Mids: one
// radial gradient whose stops are the ADSR laid out along the radius, sized by volume and coloured
// by company (identity when freelance). Nothing here reads LFOs, BPM or AudioEngine. Ported from
// docs/sketches/robot-halo-and-lit-lines.html's haloParams/haloStops — a constant change lands in
// the sketch first (docs/intent/robot-halo-and-lit-lines.md).

// ========================================
// IMPORTS
// ========================================
import type { ADSREnvelope, Robot } from '@/types/Robot';

// ========================================
// TYPES
// ========================================
/** The fields `haloDials` reads. `identityColor` is optional here only so fixtures that omit it
 *  get the same fallback `RobotBody` applies. */
export type HaloDialsInput = Pick<Robot, 'masterVolume' | 'audioAttributes'> & Partial<Pick<Robot, 'identityColor'>>;

/** One gradient stop; `offset` is 0..1 of the radius. */
export interface HaloStop {
  offset: number;
  opacity: number;
}

export interface HaloDials {
  /** Company colour, else identityColor (intent table row "Halo colour"). */
  color: string;
  /** HALO_RADIUS_MIN + (HALO_RADIUS_MAX − MIN) × volume → 20…40 units (row "Halo size"). */
  radius: number;
  /** Exactly six (`haloStops`). */
  stops: HaloStop[];
}

// ========================================
// CONSTANTS
// ========================================
/** Units of radius that stay invisible inside the halo (intent table row "Halo hole"): the body sits there. */
export const HALO_HOLE = 10;

/** Radius range on masterVolume (intent table row "Halo size"): 20 at volume 0, 40 at volume 1.
 *  At k = 2 the largest rx is 80 on a 160-wide canvas — inside it, so cards clip nothing. */
export const HALO_RADIUS_MIN = 20;
export const HALO_RADIUS_MAX = 40;

/** Peak stop opacity at the end of the attack (intent table row "Halo shape"): the cap against the lit Mids. */
export const HALO_PEAK = 0.55;

/** Seconds-equivalent hold between decay and release (row "Halo shape"): the envelope has no hold
 *  field, so the sustain plateau gets this fixed share of the radius. */
export const HALO_HOLD = 1;

/** Dial tween length in seconds, `power2.out` (row "Halo size": "a volume drag resizes it smoothly"). */
export const HALO_TWEEN = 0.5;

/** How much the base halo dims while a ripple runs (row "Ripple": "the base halo dims by 0.25"). */
export const HALO_RIPPLE_DIM = 0.25;

/** Spawn ranges (spawnSystem.ts ATTACK/DECAY/RELEASE_RANGE max): inputs are clamped here first. */
const ADSR_MAX_SECONDS = 5;

/** Same default the hand-drawn shapes applied when a fixture omitted identityColor (RobotBody). */
const FALLBACK_IDENTITY = '#78cce2';

// ========================================
// HELPERS
// ========================================
function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ========================================
// STOPS
// ========================================
/** The envelope laid out along the halo's radius; six stops, offsets non-decreasing. With
 *  `total = attack + decay + HALO_HOLD + release` and `f(t) = hole + (1 − hole) × t / total`:
 *  centre 0 → hole edge → end of attack (peak) → end of decay (peak × sustain) → end of hold → 1.
 *  An all-zero envelope falls back to four equal shares. Coincident offsets are legal SVG and draw
 *  the instant step the envelope would; the stop *count* never changes, so a tween is stop-to-stop. */
export function haloStops(adsr: ADSREnvelope, radius: number): HaloStop[] {
  const a = clampTo(adsr.attack, 0, ADSR_MAX_SECONDS);
  const d = clampTo(adsr.decay, 0, ADSR_MAX_SECONDS);
  const r = clampTo(adsr.release, 0, ADSR_MAX_SECONDS);
  const s = clampTo(adsr.sustain, 0, 1);
  const total = a + d + HALO_HOLD + r;
  // All-zero envelope → an even ring (four equal shares). Tested on a + d + r, not `total`: with
  // HALO_HOLD fixed at 1 the total is never 0 (the sketch's hold was a slider; spec §1.1 says
  // "total 0", the acceptance criterion says 25/50/75 % — the latter is what is built).
  const [ta, td, th] = a + d + r > 0 ? [a, a + d, a + d + HALO_HOLD].map((t) => t / total) : [0.25, 0.5, 0.75];
  const hole = HALO_HOLE / radius;
  const f = (t: number) => hole + (1 - hole) * t;
  return [
    { offset: 0, opacity: 0 },
    { offset: hole, opacity: 0 },
    { offset: f(ta), opacity: HALO_PEAK },
    { offset: f(td), opacity: HALO_PEAK * s },
    { offset: f(th), opacity: HALO_PEAK * s },
    { offset: 1, opacity: 0 },
  ];
}

// ========================================
// DIALS
// ========================================
export function haloDials(robot: HaloDialsInput, companyColor: string | undefined): HaloDials {
  const volume = clampTo(robot.masterVolume, 0, 1);
  const radius = HALO_RADIUS_MIN + (HALO_RADIUS_MAX - HALO_RADIUS_MIN) * volume;
  return {
    color: companyColor ?? (robot.identityColor || FALLBACK_IDENTITY),
    radius,
    stops: haloStops(robot.audioAttributes.adsr, radius),
  };
}
