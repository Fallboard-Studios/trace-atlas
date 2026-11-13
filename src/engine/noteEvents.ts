// ========================================
// noteEvents (docs/specs/ROBOT_NOTE_CLOUD.md §1.2, §4)
// ========================================
// Written by the engine, read by the animation layer, keyed by robot id. AudioEngine's `triggerWithCap` emits one
// event per note that will sound; the note cloud listens. A listener is handed what a note is and never the engine,
// so the arrow runs audio to visual only and Strict Separation stands. Not a store: twelve robots on sixteenths is
// about a hundred events a second, none of it through Zustand or React.
//
// Imports nothing.

// ========================================
// TYPES
// ========================================
export interface RobotNoteEvent {
  /** Seconds from now until the note leaves the speakers: the transport's lookahead, MIN_LEAD, Humanize and the
   *  output's latency. */
  lead: number;
  /** The note's sounding length in seconds, after articulation. */
  duration: number;
  /** The note's scheduled start on the audio clock, in seconds: for comparing one note with the next (a rest),
   *  never for scheduling. */
  at: number;
  /** The pitch as triggered, e.g. `C4`. */
  note: string;
}

type Listener = (event: RobotNoteEvent) => void;

// ========================================
// STATE
// ========================================
/** Each subscription is its own entry, so the same function can listen twice and a spent unsubscribe removes
 *  nothing but its own. A robot's set is deleted with its last listener. */
const listeners = new Map<string, Set<{ listener: Listener }>>();

// ========================================
// EXPORTS
// ========================================
/** Listen for one robot's triggered notes. Returns the unsubscribe. */
export function onRobotNote(robotId: string, listener: Listener): () => void {
  const entry = { listener };
  let set = listeners.get(robotId);
  if (!set) listeners.set(robotId, (set = new Set()));
  set.add(entry);
  return () => {
    const current = listeners.get(robotId);
    if (!current?.delete(entry)) return;
    if (current.size === 0) listeners.delete(robotId);
  };
}

/** Whether anything listens to this robot, so the engine builds no event nobody reads. */
export function hasRobotNoteListener(robotId: string): boolean {
  return listeners.has(robotId);
}

/** The engine's side. A throwing listener is reported and never reaches the caller or the next listener: a
 *  listener cannot cost a note (§1.2). */
export function emitRobotNote(robotId: string, event: RobotNoteEvent): void {
  const set = listeners.get(robotId);
  if (!set) return;
  for (const { listener } of set) {
    try {
      listener(event);
    } catch (error) {
      console.error('noteEvents: a note listener threw', error);
    }
  }
}
