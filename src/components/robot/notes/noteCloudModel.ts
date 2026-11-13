// ========================================
// noteCloudModel (docs/specs/ROBOT_NOTE_CLOUD.md §1.3, §4, §7.2 A3)
// ========================================
// What a robot's next note becomes in its note cloud: its row (the pitch within the robot's own range so far) and
// its layer (in front of the body or behind it). One model per robot id, runtime only, shared by the world's cloud
// and the avatar's. Pure of the DOM, GSAP, the engine and Tone: it reads nothing but the events it is handed.

// ========================================
// IMPORTS
// ========================================
import { NOTE_RANGE_MIN_SEMITONES } from '../../../constants';
import type { RobotNoteEvent } from '../../../engine/noteEvents';

// ========================================
// TYPES
// ========================================
export interface DrawnNote {
  /** The row: −0.5 (the robot's lowest so far) to 0.5 (its highest). */
  row: number;
  layer: 'front' | 'behind';
  /** The note's sounding length in seconds, as the event gave it. */
  duration: number;
}

interface RobotModel {
  /** The lowest and highest MIDI pitch played so far; Infinity / −Infinity before the first. */
  low: number;
  high: number;
}

// ========================================
// STATE
// ========================================
const models = new Map<string, RobotModel>();

// ========================================
// HELPERS
// ========================================
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `C4` → 60, `Bb4` → 70, `F#-1` → 6; null for anything else. */
function midiOf(note: string): number | null {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  if (!match) return null;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + NATURALS[match[1]] + accidental;
}

function modelFor(robotId: string): RobotModel {
  let model = models.get(robotId);
  if (!model) models.set(robotId, (model = { low: Infinity, high: -Infinity }));
  return model;
}

// ========================================
// EXPORTS
// ========================================
/**
 * The next note of this robot's melody (§1.3): its row and its layer.
 *
 * - The row is the pitch within the robot's range so far, at least NOTE_RANGE_MIN_SEMITONES, centred on the middle
 *   of the lowest and highest pitch played. The range only grows (§7.2 A3), so a note keeps the row it was given.
 * - C, D, E, F♯, G♯ and A♯ (and their flat spellings: the even pitch classes) cross in front; the other six behind.
 * - A note that does not parse draws at mid-height, behind, and leaves the range alone.
 */
export function nextDrawnNote(robotId: string, event: RobotNoteEvent): DrawnNote {
  const midi = midiOf(event.note);
  if (midi === null) return { row: 0, layer: 'behind', duration: event.duration };

  const model = modelFor(robotId);
  model.low = Math.min(model.low, midi);
  model.high = Math.max(model.high, midi);
  const range = Math.max(NOTE_RANGE_MIN_SEMITONES, model.high - model.low);
  const row = (midi - (model.low + model.high) / 2) / range;
  // An octave is twelve semitones, so a pitch's class is even exactly when its MIDI number is.
  return { row, layer: midi % 2 === 0 ? 'front' : 'behind', duration: event.duration };
}
