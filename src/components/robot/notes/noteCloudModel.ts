// ========================================
// noteCloudModel (docs/specs/ROBOT_NOTE_CLOUD.md §1.3, §4, §7.2 A3)
// ========================================
// What a robot's next note becomes in its note cloud: its row (the pitch class within the robot's range so far), its
// layer (in front of the body or behind it), or nothing (an even-numbered note of a run of repeats). One model per
// robot id, runtime only, shared by the world's cloud and the avatar's: the model holds the robot's one note-event
// listener and hands each drawn note to every cloud subscribed (subscribeDrawnNotes), so a run is counted once per
// note however many clouds are mounted. Free of the DOM, GSAP, AudioEngine and Tone: it reads nothing but the
// events noteEvents hands it.

// ========================================
// IMPORTS
// ========================================
import { NOTE_RANGE_MIN_SEMITONES, NOTE_REST_MIN_SECONDS } from '../../../constants';
import { onRobotNote, type RobotNoteEvent } from '../../../engine/noteEvents';

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
  /** The lowest and highest pitch class (0 C … 11 B) played so far; Infinity / −Infinity before the first. */
  low: number;
  high: number;
  /** The note before this one, for the repeat rule: its pitch (the pitch class, else the string as given), its
   *  sounding length in whole milliseconds and when it stopped sounding. Null before the first note. */
  last: { pitch: number | string; lengthMs: number; end: number } | null;
  /** How many notes long the current run of identical notes is, this one included once it is counted. */
  run: number;
}

/** A cloud's side: one drawn note, with the event it came from (the hook needs its `lead`). */
export type DrawnNoteListener = (note: DrawnNote, event: RobotNoteEvent) => void;

interface RobotSubscribers {
  /** Each subscription is its own entry, as in noteEvents, so a spent unsubscribe removes nothing but its own. */
  entries: Set<{ listener: DrawnNoteListener }>;
  /** Removes the robot's one engine listener. */
  off: () => void;
}

// ========================================
// STATE
// ========================================
/** The range and the run, per robot. Outlives its subscribers; forgotten by clearNoteCloudModel. */
const models = new Map<string, RobotModel>();
/** The clouds listening to each robot, and that robot's one engine listener. Deleted with the last subscriber. */
const subscribers = new Map<string, RobotSubscribers>();

// ========================================
// HELPERS
// ========================================
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The pitch class, octave stripped: `C4` → 0, `Bb4` → 10, `B3` → 11, `B#3` → 0, `Cb5` → 11; null when the note does
 *  not parse (it still needs an octave to parse, so a note string's shape is checked as before). */
function pitchClassOf(note: string): number | null {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  if (!match) return null;
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (NATURALS[match[1]] + accidental + 12) % 12;
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
 * - The octave is stripped: the row is the pitch class (C lowest, B highest) within the robot's range of classes so
 *   far, centred on the middle of the lowest and highest class played, over NOTE_RANGE_MIN_SEMITONES (twelve, which
 *   the eleven-semitone span of the classes never passes, so the scale is the same for every robot and only the
 *   centre moves). The range only grows (§7.2 A3), so a note keeps the row it was given.
 * - A repeat is the same class: one class in two octaves draws on one row, so it is a repeat like any other.
 * - C, D, E, F♯, G♯ and A♯ (and their flat spellings: the even pitch classes) cross in front; the other six behind.
 * - A note that does not parse draws at mid-height, behind, and leaves the range alone.
 */
export function nextDrawnNote(robotId: string, event: RobotNoteEvent): DrawnNote | null {
  const model = modelFor(robotId);
  const pitchClass = pitchClassOf(event.note);
  if (isEvenRepeat(model, pitchClass ?? event.note, event)) return null;
  if (pitchClass === null) return { row: 0, layer: 'behind', duration: event.duration };

  model.low = Math.min(model.low, pitchClass);
  model.high = Math.max(model.high, pitchClass);
  const range = Math.max(NOTE_RANGE_MIN_SEMITONES, model.high - model.low);
  const row = (pitchClass - (model.low + model.high) / 2) / range;
  return { row, layer: pitchClass % 2 === 0 ? 'front' : 'behind', duration: event.duration };
}

/**
 * A cloud listens to one robot's drawn notes (plan, Architecture Decisions: one engine listener per robot). The first
 * subscriber registers the robot's one `onRobotNote` listener; each event goes through nextDrawnNote once and every
 * subscriber gets the same DrawnNote with its event, and nothing for a dropped repeat. A throwing subscriber is
 * reported and does not cost the next its note. The last unsubscribe removes the engine listener and keeps the
 * robot's range and run. Returns the unsubscribe.
 */
export function subscribeDrawnNotes(robotId: string, listener: DrawnNoteListener): () => void {
  let robot = subscribers.get(robotId);
  if (!robot) {
    const entries = new Set<{ listener: DrawnNoteListener }>();
    const off = onRobotNote(robotId, (event) => {
      const note = nextDrawnNote(robotId, event);
      if (!note) return;
      for (const entry of entries) {
        try {
          entry.listener(note, event);
        } catch (error) {
          console.error('noteCloudModel: a cloud threw on a note', error);
        }
      }
    });
    subscribers.set(robotId, (robot = { entries, off }));
  }
  const entry = { listener };
  robot.entries.add(entry);
  return () => {
    const current = subscribers.get(robotId);
    if (!current?.entries.delete(entry)) return;
    if (current.entries.size > 0) return;
    current.off();
    subscribers.delete(robotId);
  };
}

/** Forgets a robot's range and run, so its next note sits at mid-height and starts a new run. Called when the
 *  robot's world body unmounts for good (plan, Architecture Decisions); subscribers are left as they are. */
export function clearNoteCloudModel(robotId: string): void {
  models.delete(robotId);
}
