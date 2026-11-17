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

/** Semitones above C per letter; an accidental moves it (pitchClass). */
const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note name's pitch class, 0 (C) to 11 (B): its letter, raised a semitone per `#` and lowered one per `b`. */
function pitchClass(name: string): number {
  let semis = LETTER_SEMITONES[name[0].toUpperCase()] ?? 0;
  for (const ch of name.slice(1)) semis += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
  return ((semis % 12) + 12) % 12;
}

/** A note name and the octave it sounds in. */
export interface SteppedNote {
  note: string;
  octave: number;
}

/**
 * A neighbour in the palette (docs/specs/MELODY_JOURNEY.md §1.4, §1.7): from `palette[noteIndex]` at `octave`, move
 * `pitchStep` places through the palette's distinct pitch classes in rising order (C to B), the octave carried across
 * the top and the bottom. Each class keeps the first spelling the palette gives it. With `octaveRange`, a result
 * outside it takes the opposite step instead; if that leaves too, the event's own note. Pure.
 */
export function stepInPalette(
  palette: readonly string[],
  noteIndex: number,
  octave: number,
  pitchStep: number,
  octaveRange?: readonly [number, number],
): SteppedNote {
  const own = { note: palette[noteIndex], octave };
  if (pitchStep === 0) return own;
  const classes: { pc: number; name: string }[] = [];
  for (const name of palette) {
    const pc = pitchClass(name);
    if (!classes.some((c) => c.pc === pc)) classes.push({ pc, name });
  }
  classes.sort((a, b) => a.pc - b.pc);
  const from = classes.findIndex((c) => c.pc === pitchClass(own.note));
  const step = (places: number): SteppedNote => {
    const to = from + places;
    const wrapped = ((to % classes.length) + classes.length) % classes.length;
    return { note: classes[wrapped].name, octave: octave + Math.floor(to / classes.length) };
  };
  const inside = (n: SteppedNote) => !octaveRange || (n.octave >= octaveRange[0] && n.octave <= octaveRange[1]);
  const forward = step(pitchStep);
  if (inside(forward)) return forward;
  const back = step(-pitchStep);
  return inside(back) ? back : own;
}
