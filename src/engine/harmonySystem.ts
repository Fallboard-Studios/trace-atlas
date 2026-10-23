// ========================================
// IMPORTS
// ========================================
import { getCurrentMeasure, scheduleRepeat, cancelSchedule } from './beatClock';
import { devWarn } from '../utils/helpers';

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

// Measures each palette entry holds before advancing to the next. One value read by both the
// index derivation and the schedule interval below — not independently restated as two literal
// `2`s. Not yet user-configurable (docs/intent/archive/harmony-palette-sequencing.md's "Out of scope").
const MEASURES_PER_PALETTE_ENTRY = 2;

// ========================================
// MODULE STATE
// ========================================
let availableNotes: EighthNotes = HARMONY_PALETTES[0];
let lastPaletteIndex = 0;
let scheduleId: string | null = null;

// ========================================
// EXPORTS
// ========================================

/**
 * Returns a copy of the current 8-note palette.
 * Safe for iteration without mutation risk.
 */
export function getAvailableNotes(): string[] {
  return [...availableNotes];
}

/**
 * Reset the harmony palette to the first entry.
 * Call on power-on so music resumes from the start of the progression.
 */
export function resetHarmony(): void {
  availableNotes = HARMONY_PALETTES[0];
  lastPaletteIndex = 0;
}

/**
 * Manually set the harmony palette (for testing or custom harmonies).
 */
export function setAvailableNotes(notes: EighthNotes): void {
  availableNotes = notes;
}

/**
 * Initialize automatic palette cycling. Every MEASURES_PER_PALETTE_ENTRY measures, advances to
 * the next HARMONY_PALETTES entry (wrapping via % HARMONY_PALETTES.length — no assumption about
 * the array's length). The index is derived fresh from getCurrentMeasure() on every tick, not
 * accumulated, so a missed/errored tick can never leave the palette permanently out of sync with
 * the transport. Call once after Transport starts.
 */
export function scheduleHarmonyCycle(): void {
  if (scheduleId !== null) {
    devWarn('[HarmonySystem] Harmony cycle already scheduled');
    return;
  }

  scheduleId = scheduleRepeat(`${MEASURES_PER_PALETTE_ENTRY}m`, () => {
    try {
      const paletteIndex = Math.floor(getCurrentMeasure() / MEASURES_PER_PALETTE_ENTRY) % HARMONY_PALETTES.length;

      if (paletteIndex !== lastPaletteIndex) {
        lastPaletteIndex = paletteIndex;
        availableNotes = HARMONY_PALETTES[paletteIndex] ?? HARMONY_PALETTES[0];
      }
    } catch (err) {
      devWarn('[HarmonySystem] palette cycle callback threw', err);
    }
  });
}

/**
 * Stop the harmony cycle (for cleanup/testing).
 */
export function stopHarmonyCycle(): void {
  if (scheduleId !== null) {
    cancelSchedule(scheduleId);
    scheduleId = null;
  }
}
