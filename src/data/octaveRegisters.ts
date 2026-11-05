// ========================================
// OCTAVE REGISTERS
// ========================================

/**
 * The five octave registers a fresh robot's Octave Min and Max are dealt from, [min, max] inclusive, lowest first: the
 * bass for large robots, the mid for normal ones, the treble for small ones. Moved out of spawnSystem.ts at
 * docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6, when the pick became a band (robot.octaveRegister, a PickBand over
 * these ids, src/data/bands/bandKeys.ts), so a theme can weigh a world low or high.
 */
export const OCTAVE_REGISTERS = {
  bass: [1, 3],
  low: [2, 4],
  mid: [3, 5],
  high: [4, 6],
  treble: [5, 7],
} as const satisfies Record<string, readonly [number, number]>;

export type OctaveRegisterId = keyof typeof OCTAVE_REGISTERS;

/** The register ids lowest first: the order the pick lays its weights along. */
export const OCTAVE_REGISTER_IDS = Object.keys(OCTAVE_REGISTERS) as OctaveRegisterId[];
