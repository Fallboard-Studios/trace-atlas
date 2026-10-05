// ========================================
// ORBITER DIALS (docs/specs/ORBITING_POLYGONS.md §1.1)
// ========================================
// Pure mapping from a robot's composition settings to the six dials that drive its orbiters:
// count, size, line width, strip opacity and the two orbit timings. Nothing here reads LFOs, BPM
// or AudioEngine — composition settings only (docs/intent/orbiting-polygons.md).

// ========================================
// IMPORTS
// ========================================
import {
  RHYTHMIC_DENSITY_MIN,
  RHYTHMIC_DENSITY_MAX,
  RHYTHMIC_MOTIF_LENGTH_MIN,
  RHYTHMIC_MOTIF_LENGTH_MAX,
  NOTE_VARIANCE_MIN,
  NOTE_VARIANCE_MAX,
  OCTAVE_RANGE_MIN,
  OCTAVE_RANGE_MAX,
  PITCH_REPEAT_MIN,
  PITCH_REPEAT_MAX,
} from '@/constants';
import {
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  DEFAULT_PITCH_REPEAT,
} from '@/engine/melodyGenerator';
import type { Robot } from '@/types/Robot';

// ========================================
// TYPES
// ========================================
/** The composition fields `orbiterDials` reads — the same resolution `regenerateMelody.ts` and
 *  `RobotBody`'s audio memo already use. */
export type OrbiterDialsInput = Pick<
  Robot,
  'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat' | 'octaveRange' | 'audioAttributes'
>;

export interface OrbiterDials {
  count: 1 | 2 | 3 | 4;
  size: number;
  lineWidth: number;
  stripOpacity: number;
  /** Seconds between the end of one orbit and the earliest draw of the next, per diagonal pair. */
  orbitGap: number;
  /** Seconds for one full hoop cycle (θ: 0 → 2π). */
  orbitDuration: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Count breakpoints on rhythmicDensity (intent table row "Count"): <25 → 1, ≤50 → 2, ≤75 → 3, else 4. */
export const ORBITER_COUNT_BREAKS = [25, 50, 75] as const;

/** Size range on Phrase Length / rhythmicMotifLength.value (intent table row "Size"): 0.75× at
 *  value 0, 1.0× at value 4, 1.25× at value 8. */
export const ORBITER_SIZE_MIN = 0.75;
export const ORBITER_SIZE_MAX = 1.25;

/** Line width base on Note Variance's value (intent table row "Boundary-line width"):
 *  (3 + value) / 10 → 0.3..1.1. Today's fixed 0.8 sits inside that range. */
export const ORBITER_LINE_BASE = 3;

/** Strip opacity floor on Pitch Repeat (intent table row "Line light strip"): 0.35 keeps the
 *  emissive centre stroke visible at night; it is never battery-dimmed. */
export const ORBITER_STRIP_OPACITY_MIN = 0.35;

/** Orbit gap on the robot's min octave (intent table row "Gap between orbits"), per diagonal pair:
 *  15 + 2 × minOctave → 17..29 s. */
export const ORBIT_GAP_BASE = 15;
export const ORBIT_GAP_PER_OCTAVE = 2;

/** Orbit duration on the robot's max octave (Gate 1 correction: intent's 2–5 s was "too fast, down
 *  by at least 50 %", then "top speed fine, bottom range up 20 %" → 4 + (maxOctave - 1) × 2/3 → 4..8 s). */
export const ORBIT_DURATION_BASE = 4;
export const ORBIT_DURATION_PER_OCTAVE = 2 / 3;

// ========================================
// HELPERS
// ========================================
function clampTo(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function orbiterCount(density: number): 1 | 2 | 3 | 4 {
  const [low, mid, high] = ORBITER_COUNT_BREAKS;
  if (density < low) return 1;
  if (density <= mid) return 2;
  if (density <= high) return 3;
  return 4;
}

// ========================================
// DIALS
// ========================================
export function orbiterDials(robot: OrbiterDialsInput): OrbiterDials {
  const density = clampTo(robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY, RHYTHMIC_DENSITY_MIN, RHYTHMIC_DENSITY_MAX);
  const motifValue = clampTo(
    robot.rhythmicMotifLength?.value ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH.value,
    RHYTHMIC_MOTIF_LENGTH_MIN,
    RHYTHMIC_MOTIF_LENGTH_MAX
  );
  const varianceValue = clampTo(
    robot.noteVariance?.value ?? DEFAULT_NOTE_VARIANCE.value,
    NOTE_VARIANCE_MIN,
    NOTE_VARIANCE_MAX
  );
  const pitchRepeat = clampTo(robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT, PITCH_REPEAT_MIN, PITCH_REPEAT_MAX);

  const [rangeLo, rangeHi] = robot.audioAttributes.octaveRange ?? robot.octaveRange;
  const minOctave = clampTo(Math.min(rangeLo, rangeHi), OCTAVE_RANGE_MIN, OCTAVE_RANGE_MAX);
  const maxOctave = clampTo(Math.max(rangeLo, rangeHi), OCTAVE_RANGE_MIN, OCTAVE_RANGE_MAX);

  return {
    count: orbiterCount(density),
    size: ORBITER_SIZE_MIN + (ORBITER_SIZE_MAX - ORBITER_SIZE_MIN) * (motifValue / RHYTHMIC_MOTIF_LENGTH_MAX),
    lineWidth: (ORBITER_LINE_BASE + varianceValue) / 10,
    stripOpacity: ORBITER_STRIP_OPACITY_MIN + (1 - ORBITER_STRIP_OPACITY_MIN) * (pitchRepeat / PITCH_REPEAT_MAX),
    orbitGap: ORBIT_GAP_BASE + ORBIT_GAP_PER_OCTAVE * minOctave,
    orbitDuration: ORBIT_DURATION_BASE + (maxOctave - 1) * ORBIT_DURATION_PER_OCTAVE,
  };
}
