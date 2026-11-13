// ========================================
// noteCloudModel (docs/specs/ROBOT_NOTE_CLOUD.md §1.3, §4, §7.2 A3)
// ========================================
// What a robot's next note becomes in its note cloud: its row (the pitch within the robot's own range so far), its
// layer (in front of the body or behind it), or nothing (an even-numbered note of a run of repeats). One model per
// robot id, runtime only, shared by the world's cloud and the avatar's. Pure of the DOM, GSAP, the engine and Tone:
// it reads nothing but the events it is handed.

// ========================================
// IMPORTS
// ========================================
import { NOTE_RANGE_MIN_SEMITONES, NOTE_REST_MIN_SECONDS } from '../../../constants';
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
  /** The note before this one, for the repeat rule: its pitch (the MIDI number, else the string as given), its
   *  sounding length in whole milliseconds and when it stopped sounding. Null before the first note. */
  last: { pitch: number | string; lengthMs: number; end: number } | null;
  /** How many notes long the current run of identical notes is, this one included once it is counted. */
  run: number;
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
  if (!model) models.set(robotId, (model = { low: Infinity, high: -Infinity, last: null, run: 0 }));
  return model;
}

/** Counts this note into the robot's run of repeats and says whether it is an even-numbered note of the run (§1.3).
 *  A repeat is the same pitch and the same sounding length to the millisecond (§7.2 A2) with no rest before it: a
 *  rest is more than NOTE_REST_MIN_SECONDS between the earlier note's end and this note's start (§7.2 A4). */
function isEvenRepeat(model: RobotModel, pitch: number | string, event: RobotNoteEvent): boolean {
  const lengthMs = Math.round(event.duration * 1000);
  const last = model.last;
  const repeats =
    last !== null &&
    last.pitch === pitch &&
    last.lengthMs === lengthMs &&
    event.at - last.end <= NOTE_REST_MIN_SECONDS;
  model.run = repeats ? model.run + 1 : 1;
  model.last = { pitch, lengthMs, end: event.at + event.duration };
  return model.run % 2 === 0;
}

// ========================================
// EXPORTS
// ========================================
/**
 * The next note of this robot's melody (§1.3): its row and its layer, or null when it is not drawn.
 *
 * - In a run of identical notes (same pitch, same length, no rest between) the first, third, fifth… are drawn and
 *   the even-numbered ones are null. The run is counted on every note handed in, drawn or not.
 * - The row is the pitch within the robot's range so far, at least NOTE_RANGE_MIN_SEMITONES, centred on the middle
 *   of the lowest and highest pitch played. The range only grows (§7.2 A3), so a note keeps the row it was given.
 * - C, D, E, F♯, G♯ and A♯ (and their flat spellings: the even pitch classes) cross in front; the other six behind.
 * - A note that does not parse draws at mid-height, behind, and leaves the range alone.
 */
export function nextDrawnNote(robotId: string, event: RobotNoteEvent): DrawnNote | null {
  const model = modelFor(robotId);
  const midi = midiOf(event.note);
  if (isEvenRepeat(model, midi ?? event.note, event)) return null;
  if (midi === null) return { row: 0, layer: 'behind', duration: event.duration };

  model.low = Math.min(model.low, midi);
  model.high = Math.max(model.high, midi);
  const range = Math.max(NOTE_RANGE_MIN_SEMITONES, model.high - model.low);
  const row = (midi - (model.low + model.high) / 2) / range;
  // An octave is twelve semitones, so a pitch's class is even exactly when its MIDI number is.
  return { row, layer: midi % 2 === 0 ? 'front' : 'behind', duration: event.duration };
}
