// ========================================
// ORBITER DIALS (docs/specs/ORBITING_POLYGONS.md §1.1)
// ========================================
// Pure mapping from a robot's composition settings to the four dials that drive its orbiters:
// count, size, line width and strip opacity (Phase 40 amendment: orbiters dock on the hull and no
// longer orbit, so the two orbit-timing dials are gone). Nothing here reads LFOs, BPM or
// AudioEngine — composition settings only (docs/intent/orbiting-polygons.md).

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
 *  `RobotBody`'s audio memo already use. No octave-range field (Phase 40 amendment: the two
 *  orbit-timing dials that read it are gone — docking doesn't have a speed). */
export type OrbiterDialsInput = Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat'>;

export interface OrbiterDials {
  count: 1 | 2 | 3 | 4;
  size: number;
  lineWidth: number;
  stripOpacity: number;
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

  return {
    count: orbiterCount(density),
    size: ORBITER_SIZE_MIN + (ORBITER_SIZE_MAX - ORBITER_SIZE_MIN) * (motifValue / RHYTHMIC_MOTIF_LENGTH_MAX),
    lineWidth: (ORBITER_LINE_BASE + varianceValue) / 10,
    stripOpacity: ORBITER_STRIP_OPACITY_MIN + (1 - ORBITER_STRIP_OPACITY_MIN) * (pitchRepeat / PITCH_REPEAT_MAX),
  };
}
