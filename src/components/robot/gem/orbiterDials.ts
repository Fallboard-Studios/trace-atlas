// ========================================
// ORBITER DIALS (docs/specs/ORBITING_POLYGONS.md §1.1)
// ========================================
// Pure mapping from a robot's composition settings to the two dials that drive its orbiters: count
// and size (Phase 40 amendment: orbiters dock on the hull and no longer orbit, so the two orbit-timing
// dials are gone; backlog 85: the line width and strip opacity are fixed, in gemLines.ts). Nothing here reads LFOs, BPM or
// AudioEngine — composition settings only (docs/intent/orbiting-polygons.md).

// ========================================
// IMPORTS
// ========================================
import {
  RHYTHMIC_DENSITY_MIN,
  RHYTHMIC_DENSITY_MAX,
  RHYTHMIC_MOTIF_LENGTH_MIN,
  RHYTHMIC_MOTIF_LENGTH_MAX,
} from '@/constants';
import {
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
} from '@/engine/melodyGenerator';
import type { Robot } from '@/types/Robot';

// ========================================
// TYPES
// ========================================
/** The composition fields `orbiterDials` reads — the same resolution `regenerateMelody.ts` and
 *  `RobotBody`'s audio memo already use. No octave-range field (Phase 40 amendment: the two
 *  orbit-timing dials that read it are gone — docking doesn't have a speed). */
export type OrbiterDialsInput = Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength'>;

export interface OrbiterDials {
  count: 1 | 2 | 3 | 4;
  size: number;
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
  return {
    count: orbiterCount(density),
    size: ORBITER_SIZE_MIN + (ORBITER_SIZE_MAX - ORBITER_SIZE_MIN) * (motifValue / RHYTHMIC_MOTIF_LENGTH_MAX),
  };
}
