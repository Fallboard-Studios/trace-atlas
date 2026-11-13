// ========================================
// TYPES
// ========================================
// Exactly 8 note-name strings (no octave digit) per palette entry.
// Octave is determined per-robot at spawn time; melody events store note index + octave separately.
export type EighthNotes = [string, string, string, string, string, string, string, string];

// ========================================
// CONSTANTS
// ========================================
// 12 structurally-unique palettes, cycled sequentially — no hour-of-day meaning. Copied verbatim
// from the old TIME_PITCHES[0..11] (hours 12-23 were byte-for-byte duplicates of 0-11 and are
// dropped, not re-derived, by this restructuring). See docs/specs/archive/HARMONY_PALETTE_SEQUENCING.md.
const HARMONY_PALETTES: EighthNotes[] = [
  ['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G'],
  ['C', 'G', 'F', 'D', 'A', 'C', 'F', 'F'],
  ['D', 'A', 'F', 'D', 'A', 'C', 'F', 'D'],
  ['F', 'G', 'B', 'D', 'G', 'D', 'G', 'G'],
  ['G', 'D', 'B', 'A', 'B', 'D', 'A', 'G'],
  ['A', 'D', 'C', 'G', 'E', 'C', 'A', 'E'],
  ['Bb', 'D', 'C', 'G', 'F', 'C', 'Bb', 'F'],
  ['Bb', 'Eb', 'C', 'G', 'F', 'D', 'Bb', 'Eb'],
  ['Ab', 'Eb', 'C', 'G', 'Ab', 'D', 'Ab', 'Eb'],
  ['Db', 'F', 'C', 'Ab', 'Bb', 'Db', 'Ab', 'F'],
  ['B', 'F#', 'D#', 'C#', 'A', 'B', 'D#', 'F#'],
  ['E', 'C', 'G#', 'D', 'Bb', 'E', 'G#', 'B'],
];

// Measures each palette entry holds before advancing to the next. Not yet user-configurable
// (docs/intent/archive/harmony-palette-sequencing.md's "Out of scope").
const MEASURES_PER_PALETTE_ENTRY = 2;

// ========================================
// EXPORTS
// ========================================

/**
 * The palette a measure plays: entry floor(measure / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length, as a copy.
 * Worked out from the measure and the table, nothing remembered, so a note reads the chord of the measure it sounds
 * in (docs/specs/ONE_MUSIC_CLOCK.md §4.3).
 */
export function paletteForMeasure(measure: number): string[] {
  return [...HARMONY_PALETTES[Math.floor(measure / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length]];
}
