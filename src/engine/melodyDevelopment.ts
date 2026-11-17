// ========================================
// THE MELODY JOURNEY: THE CHANGES (docs/specs/MELODY_JOURNEY.md §1.4–§1.8)
// ========================================
// The home melody at a position: busier changes above 0, calmer below it, home at 0. Pure: everything it reads is an
// argument, as composeRobotMelody's is.
import alea from 'alea';
import { ATTACK_REACH_SHARE } from '../constants';
import { DEFAULT_SUBDIVISIONS } from './melodyGenerator';
import type { MelodyEvent, NoteDuration } from '../types/Robot';

// ========================================
// LENGTHS
// ========================================

/** Sixteenths per note name. Home events are 16n to 2n; anything a bar or longer is the whole bar, and a thirty-second
 *  (never generated) counts as the one sixteenth it sounds within. */
const NOTE_NAME_SIXTEENTHS: Record<NoteDuration, number> = {
  '32n': 1,
  '16n': 1,
  '8n': 2,
  '4n': 4,
  '2n': 8,
  '1n': 16,
  '2m': 16,
  '4m': 16,
};

/** An event's length in sixteenths (§1.4): its `sixteenths` when present, else its note name's. */
export function eventSixteenths(event: MelodyEvent): number {
  return event.sixteenths ?? NOTE_NAME_SIXTEENTHS[event.length];
}

// ========================================
// THE FLOOR
// ========================================

/** Absorbs float error in the floor's division, so an attack that reaches a whole number of sixteenths exactly is not
 *  rounded up past it. */
const FLOOR_EPSILON = 1e-9;

/**
 * The shortest note development may make, in sixteenths (§1.8): the attack rail's arithmetic (audibleDensityBand), so
 * a slow attack is never split into notes too short for it to climb. `ceil(ATTACK_REACH_SHARE × attack ÷ one
 * sixteenth at bpmTop)`, never below 1. `bpmTop` is the top of the theme's bpm band, handed in by the caller so this
 * module stays free of the loading context.
 */
export function developmentFloor(attackSeconds: number, bpmTop: number): number {
  if (!(attackSeconds > 0) || !(bpmTop > 0)) return 1;
  const sixteenthSeconds = 15 / bpmTop;
  return Math.max(1, Math.ceil((ATTACK_REACH_SHARE * attackSeconds) / sixteenthSeconds - FLOOR_EPSILON));
}

// ========================================
// THE WORKING BAR
// ========================================

/** What a robot's changes read besides its home melody (§1.8): its floor (developmentFloor) and its composition seed,
 *  whose `${seed}:development` stream gives each change's direction. */
export interface DevelopmentOptions {
  floor: number;
  seed: number;
}

/** One note of the bar as the changes see it. `src` is the home event it came from, or, for a note a change added,
 *  the note it was made from (its slot and octave). */
interface Note {
  src: MelodyEvent;
  id: string;
  start: number;
  len: number;
  pitchStep: number;
  added: boolean;
}

function homeNotes(home: MelodyEvent[]): Note[] {
  return [...home]
    .sort((a, b) => a.startStep - b.startStep)
    .map((e) => ({ src: e, id: e.id, start: e.startStep, len: eventSixteenths(e), pitchStep: 0, added: false }));
}

/** Sorted by length, then by start (§1.5): the sort fixes the order and changes nothing. */
function byLengthThenStart(a: Note, b: Note): number {
  return a.len - b.len || a.start - b.start;
}

/** A sorted list visited from alternating ends: the first, the last, the second, the second last... */
function fromAlternatingEnds<T>(sorted: T[]): T[] {
  const out: T[] = [];
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    out.push(sorted[lo++]);
    if (lo <= hi) out.push(sorted[hi--]);
  }
  return out;
}

/** The longest note name not over `sixteenths`: a placeholder `length` for a note a change added, whose `sixteenths`
 *  is its real length (§1.4). */
function nameAtMost(sixteenths: number): NoteDuration {
  if (sixteenths >= 16) return '1n';
  if (sixteenths >= 8) return '2n';
  if (sixteenths >= 4) return '4n';
  if (sixteenths >= 2) return '8n';
  return '16n';
}

/** The working bar back as events, in start order. A home note no change touched is its own home event (the same
 *  object); a changed one is a new object keeping its id, slot, octave, rest and mark. A note a change added carries
 *  its source's slot and octave and nothing else of it: no rest, mark or pitch lock (A10). */
function toEvents(notes: Note[]): MelodyEvent[] {
  return notes.map((n) => {
    const homeLength = n.len === eventSixteenths(n.src);
    if (!n.added && homeLength && n.pitchStep === 0) return n.src;
    const event: MelodyEvent = n.added
      ? { id: n.id, startStep: n.start, length: nameAtMost(n.len), noteIndex: n.src.noteIndex, octave: n.src.octave, sixteenths: n.len }
      : { ...n.src };
    if (!n.added && !homeLength) event.sixteenths = n.len;
    if (n.pitchStep !== 0) event.pitchStep = n.pitchStep;
    return event;
  });
}

// ========================================
// CALMER (§1.6)
// ========================================

/** `steps` ties on the home melody. A tie removes a note and the note before it sounds on through to the removed
 *  note's end, any silence between them covered. The candidates are every home note but the bar's first, by length
 *  then start, visited from alternating ends. The floor is the bar's first note alone. */
function calmer(home: MelodyEvent[], steps: number): MelodyEvent[] {
  if (home.length <= 1) return home;
  const notes = homeNotes(home);
  const order = fromAlternatingEnds(notes.slice(1).sort(byLengthThenStart));
  const ties = Math.min(steps, order.length);
  for (let k = 0; k < ties; k++) {
    const i = notes.indexOf(order[k]);
    const tied = notes[i];
    const before = notes[i - 1];
    before.len = tied.start + tied.len - before.start;
    notes.splice(i, 1);
  }
  return toEvents(notes);
}

// ========================================
// BUSIER (§1.5)
// ========================================

/** One busy phase: makes change `k` on the bar in the direction `dir` (+1 up, −1 down a palette step) and says so, or
 *  says it has nothing left to do. A phase holds its own progress, so it is built fresh for each call. */
type Phase = (notes: Note[], k: number, dir: number) => boolean;

/** Splits `note` at `t` (§1.5): it keeps `L − t`, and a new `t`-long note starts where it now ends, one palette step
 *  from it, with the id `${note.id}:d${k}`. Only called on a note at least `2t` long. */
function split(notes: Note[], note: Note, t: number, k: number, dir: number): void {
  note.len -= t;
  const added: Note = { src: note.src, id: `${note.id}:d${k}`, start: note.start + note.len, len: t, pitchStep: note.pitchStep + dir, added: true };
  notes.splice(notes.indexOf(note) + 1, 0, added);
}

/** Phase 1, the first pass of splits: the home notes at least `2T` long, by length then start, visited from
 *  alternating ends, each split at `T`, until half of them (rounded up) are split. */
function firstPass(notes: Note[], T: number): Phase {
  const order = fromAlternatingEnds(notes.filter((n) => n.len >= 2 * T).sort(byLengthThenStart));
  const limit = Math.ceil(order.length / 2);
  let i = 0;
  return (bar, k, dir) => {
    if (i >= limit) return false;
    split(bar, order[i++], T, k, dir);
    return true;
  };
}

/** Phase 2, two thresholds: changes alternate between the subdivision `sub` and `T`, the subdivision first, and the
 *  pick between the shortest and the longest note at least twice the change's threshold (pieces made earlier
 *  included), change by change. A threshold with no candidate hands its turn to the other; the phase ends when
 *  neither has one. With `sub` not under `T` (a `T` of 1, or a floor at or above `T`) there is the one threshold. */
function twoThresholds(T: number, sub: number): Phase {
  let j = 0;
  return (bar, k, dir) => {
    const nominal = j % 2 === 0 ? [sub, T] : [T, sub];
    const thresholds = sub < T ? nominal : [T];
    for (const t of thresholds) {
      const candidates = bar.filter((n) => n.len >= 2 * t).sort(byLengthThenStart);
      if (candidates.length === 0) continue;
      split(bar, j % 2 === 0 ? candidates[0] : candidates[candidates.length - 1], t, k, dir);
      j++;
      return true;
    }
    return false;
  };
}

/** Phase 3, the fills: while some gap of silence inside the bar (on written lengths: before the first note, between
 *  two notes, after the last) is at least `fill` long, a change adds one `fill`-long note at the end of the longest gap
 *  (the earliest on a tie), on the slot and octave of the note it leads into and one palette step from it. The gap
 *  after the last note leads into the bar's first note. */
function fills(fill: number): Phase {
  return (bar, k, dir) => {
    let best: { start: number; end: number; into: Note; at: number } | null = null;
    for (let i = 0; i <= bar.length; i++) {
      const start = i === 0 ? 1 : bar[i - 1].start + bar[i - 1].len;
      const end = i === bar.length ? DEFAULT_SUBDIVISIONS + 1 : bar[i].start;
      if (end - start < fill || (best && end - start <= best.end - best.start)) continue;
      best = { start, end, into: bar[i === bar.length ? 0 : i], at: i };
    }
    if (!best) return false;
    const { into } = best;
    bar.splice(best.at, 0, { src: into.src, id: `${into.id}:d${k}`, start: best.end - fill, len: fill, pitchStep: into.pitchStep + dir, added: true });
    return true;
  };
}

/** `steps` busy changes on the home melody, phase after phase, each phase running until it has nothing left. Change k
 *  reads draw k of the seed's development stream, one draw per change (§1.8). A position past the last change any
 *  phase can make plays that last change. */
function busier(home: MelodyEvent[], steps: number, options: DevelopmentOptions): MelodyEvent[] {
  if (home.length === 0) return home;
  const notes = homeNotes(home);
  const floor = Math.max(1, options.floor);
  // T is measured once, on the home melody; neither threshold is under the floor. An odd T (only a raised floor or a
  // hand-made length gives one) subdivides at its whole half.
  const T = Math.max(Math.min(...notes.map((n) => n.len)), floor);
  const sub = Math.max(floor, Math.floor(T / 2));
  // The fill length is the smaller threshold in use: the subdivision, which is T itself when there is one threshold.
  const phases: Phase[] = [firstPass(notes, T), twoThresholds(T, sub), fills(sub)];
  const rand = alea(`${options.seed}:development`);
  let phase = 0;
  let made = 0;
  for (let k = 1; k <= steps; k++) {
    const dir = rand() < 0.5 ? 1 : -1;
    while (phase < phases.length && !phases[phase](notes, k, dir)) phase++;
    if (phase >= phases.length) break;
    made++;
  }
  return made === 0 ? home : toEvents(notes);
}

// ========================================
// THE MELODY AT A POSITION
// ========================================

/** The home melody at `position` (§1.5, §1.6): that many busy changes above 0, calm changes below it, home itself at
 *  0. Change k+1 is always one change on top of change k. Pure. */
export function developMelody(home: MelodyEvent[], position: number, options: DevelopmentOptions): MelodyEvent[] {
  if (position < 0) return calmer(home, -position);
  if (position > 0) return busier(home, position, options);
  return home;
}
