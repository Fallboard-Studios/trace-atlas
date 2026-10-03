/**
 * Note values for the Free | Sync toggle (docs/specs/FREE_SYNC_TOGGLE.md §1.2): a division plus a
 * modifier, stored as exactly that pair and converted to seconds / Hz from a tempo at read time.
 * Pure data and math — no Tone, store or content import. 4/4 throughout (beatClock.ts's
 * BEATS_PER_MEASURE = 4), so one bar is 4 beats.
 */

// ========================================
// TYPES
// ========================================

/** '1' / '2' / '4' are bars; the rest are fractions of a whole note. */
export type NoteDivision = '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1' | '2' | '4';
export type NoteModifier = 'straight' | 'dotted' | 'triplet';

export interface NoteValue {
  division: NoteDivision;
  modifier: NoteModifier;
}

// ========================================
// TABLE
// ========================================

const BEATS_PER_DIVISION: Record<NoteDivision, number> = {
  '1/32': 0.125,
  '1/16': 0.25,
  '1/8': 0.5,
  '1/4': 1,
  '1/2': 2,
  '1': 4,
  '2': 8,
  '4': 16,
};

const MODIFIER_FACTOR: Record<NoteModifier, number> = {
  straight: 1,
  dotted: 1.5,
  triplet: 2 / 3,
};

/** Every division takes all three modifiers except 2 and 4 bars, which are straight-only. */
const MULTI_BAR_DIVISIONS: readonly NoteDivision[] = ['2', '4'];

// ========================================
// MATH
// ========================================

export function noteValueBeats(nv: NoteValue): number {
  return BEATS_PER_DIVISION[nv.division] * MODIFIER_FACTOR[nv.modifier];
}

/** `bpm` must be > 0; the Tempo slider's range (20-200) guarantees it. */
export function noteValueSeconds(nv: NoteValue, bpm: number): number {
  return (noteValueBeats(nv) * 60) / bpm;
}

export function noteValueHz(nv: NoteValue, bpm: number): number {
  return 1 / noteValueSeconds(nv, bpm);
}

export function noteValueEquals(a: NoteValue, b: NoteValue): boolean {
  return a.division === b.division && a.modifier === b.modifier;
}

// ========================================
// THE LIST
// ========================================

function buildNoteValues(): readonly NoteValue[] {
  const entries: NoteValue[] = [];
  for (const division of Object.keys(BEATS_PER_DIVISION) as NoteDivision[]) {
    const modifiers: NoteModifier[] = MULTI_BAR_DIVISIONS.includes(division)
      ? ['straight']
      : ['straight', 'dotted', 'triplet'];
    for (const modifier of modifiers) entries.push(Object.freeze({ division, modifier }));
  }
  entries.sort((a, b) => noteValueBeats(a) - noteValueBeats(b));
  return Object.freeze(entries);
}

/** All 20 note values, ascending by duration (1/4 triplet, 0.667 beats, sorts before 1/8 dotted,
 *  0.75). Frozen: entries are shared by reference into store state, so nothing may mutate them. */
export const NOTE_VALUES: readonly NoteValue[] = buildNoteValues();

/** True only for a real NOTE_VALUES member and nothing else — unknown division, a modifier the
 *  table doesn't offer for that division, a missing/extra key, or a non-object all fail. This is
 *  the guard for untrusted input (sessions, share links). */
export function isNoteValue(x: unknown): x is NoteValue {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const candidate = x as Record<string, unknown>;
  if (Object.keys(candidate).length !== 2) return false;
  return NOTE_VALUES.some(
    (v) => v.division === candidate.division && v.modifier === candidate.modifier
  );
}

// ========================================
// SELECTION
// ========================================

type NoteUnit = 'seconds' | 'hz';

function derive(nv: NoteValue, bpm: number, unit: NoteUnit): number {
  return unit === 'seconds' ? noteValueSeconds(nv, bpm) : noteValueHz(nv, bpm);
}

/** Entries whose derived value lies inside [min, max] (both edges inclusive) at `bpm`, in
 *  NOTE_VALUES order — ascending beats whichever `unit` is asked for. A fresh array each call, so
 *  a caller can reverse it freely. */
export function allowedNoteValues(
  bpm: number,
  range: { min: number; max: number },
  unit: NoteUnit
): NoteValue[] {
  return NOTE_VALUES.filter((nv) => {
    const value = derive(nv, bpm, unit);
    return value >= range.min && value <= range.max;
  });
}

/** The `allowed` entry closest to `value`, with distance measured in `unit` (so a seconds value
 *  and its Hz equivalent can pick different notes). Out-of-range input lands on the nearest
 *  extreme; an exact tie goes to the earlier entry. Throws on an empty list. */
export function nearestNoteValue(
  value: number,
  bpm: number,
  allowed: readonly NoteValue[],
  unit: NoteUnit
): NoteValue {
  if (allowed.length === 0) throw new Error('nearestNoteValue: allowed list is empty');
  let best = allowed[0];
  let bestDistance = Math.abs(derive(best, bpm, unit) - value);
  for (let i = 1; i < allowed.length; i++) {
    const distance = Math.abs(derive(allowed[i], bpm, unit) - value);
    if (distance < bestDistance) {
      best = allowed[i];
      bestDistance = distance;
    }
  }
  return best;
}
