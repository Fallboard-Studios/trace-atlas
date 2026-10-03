// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  NOTE_VALUES,
  noteValueBeats,
  noteValueSeconds,
  noteValueHz,
  noteValueEquals,
  isNoteValue,
  allowedNoteValues,
  nearestNoteValue,
  type NoteValue,
} from './noteValues';

// ========================================
// HELPERS
// ========================================

const nv = (
  division: NoteValue['division'],
  modifier: NoteValue['modifier'] = 'straight'
): NoteValue => ({
  division,
  modifier,
});

const label = (v: NoteValue) => `${v.division}/${v.modifier}`;

// ========================================
// TESTS — docs/specs/FREE_SYNC_TOGGLE.md §1.2
// ========================================

describe('NOTE_VALUES', () => {
  it('has exactly 20 entries: 6 divisions x 3 modifiers, plus 2 bars and 4 bars straight-only', () => {
    expect(NOTE_VALUES).toHaveLength(20);
  });

  it('has no duplicate entries', () => {
    const labels = NOTE_VALUES.map(label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('is strictly ascending by beats', () => {
    for (let i = 1; i < NOTE_VALUES.length; i++) {
      expect(
        noteValueBeats(NOTE_VALUES[i]),
        `${label(NOTE_VALUES[i - 1])} should be shorter than ${label(NOTE_VALUES[i])}`
      ).toBeGreaterThan(noteValueBeats(NOTE_VALUES[i - 1]));
    }
  });

  it('puts 1/4 triplet (0.667 beats) before 1/8 dotted (0.75 beats)', () => {
    const triplet = NOTE_VALUES.findIndex((v) => noteValueEquals(v, nv('1/4', 'triplet')));
    const dotted = NOTE_VALUES.findIndex((v) => noteValueEquals(v, nv('1/8', 'dotted')));
    expect(triplet).toBeGreaterThanOrEqual(0);
    expect(dotted).toBeGreaterThanOrEqual(0);
    expect(triplet).toBeLessThan(dotted);
  });

  it('starts at 1/32 triplet and ends at 4 bars', () => {
    expect(NOTE_VALUES[0]).toEqual(nv('1/32', 'triplet'));
    expect(NOTE_VALUES[NOTE_VALUES.length - 1]).toEqual(nv('4'));
  });

  it('offers dotted and triplet only up to 1 bar — 2 and 4 bars are straight-only', () => {
    const multiBar = NOTE_VALUES.filter((v) => v.division === '2' || v.division === '4');
    expect(multiBar).toEqual([nv('2'), nv('4')]);
    const oneBar = NOTE_VALUES.filter((v) => v.division === '1').map((v) => v.modifier);
    expect(oneBar.sort()).toEqual(['dotted', 'straight', 'triplet']);
  });

  it('is frozen, so a shared entry can never be mutated through state', () => {
    expect(Object.isFrozen(NOTE_VALUES)).toBe(true);
    expect(Object.isFrozen(NOTE_VALUES[0])).toBe(true);
  });
});

describe('noteValueBeats', () => {
  it('counts 4/4 beats per division', () => {
    expect(noteValueBeats(nv('1/32'))).toBeCloseTo(0.125, 12);
    expect(noteValueBeats(nv('1/16'))).toBeCloseTo(0.25, 12);
    expect(noteValueBeats(nv('1/8'))).toBeCloseTo(0.5, 12);
    expect(noteValueBeats(nv('1/4'))).toBeCloseTo(1, 12);
    expect(noteValueBeats(nv('1/2'))).toBeCloseTo(2, 12);
    expect(noteValueBeats(nv('1'))).toBeCloseTo(4, 12);
    expect(noteValueBeats(nv('2'))).toBeCloseTo(8, 12);
    expect(noteValueBeats(nv('4'))).toBeCloseTo(16, 12);
  });

  it('applies dotted x1.5 and triplet x2/3', () => {
    expect(noteValueBeats(nv('1/4', 'dotted'))).toBeCloseTo(1.5, 12);
    expect(noteValueBeats(nv('1/4', 'triplet'))).toBeCloseTo(2 / 3, 12);
    expect(noteValueBeats(nv('1', 'dotted'))).toBeCloseTo(6, 12);
    expect(noteValueBeats(nv('1/32', 'triplet'))).toBeCloseTo(0.125 * (2 / 3), 12);
  });
});

describe('noteValueSeconds / noteValueHz', () => {
  it('matches the spec fixtures at 60 BPM', () => {
    expect(noteValueSeconds(nv('1/4'), 60)).toBeCloseTo(1, 9);
    expect(noteValueHz(nv('1/4'), 60)).toBeCloseTo(1, 9);
    expect(noteValueSeconds(nv('1/8', 'dotted'), 60)).toBeCloseTo(0.75, 9);
    expect(noteValueSeconds(nv('1/4', 'triplet'), 60)).toBeCloseTo(0.6667, 4);
    expect(noteValueSeconds(nv('1'), 60)).toBeCloseTo(4, 9);
    expect(noteValueHz(nv('1'), 60)).toBeCloseTo(0.25, 9);
    expect(noteValueSeconds(nv('4'), 60)).toBeCloseTo(16, 9);
    expect(noteValueHz(nv('4'), 60)).toBeCloseTo(0.0625, 9);
    expect(noteValueSeconds(nv('1/32'), 60)).toBeCloseTo(0.125, 9);
    expect(noteValueHz(nv('1/32'), 60)).toBeCloseTo(8, 9);
  });

  it('halves the seconds (and doubles the Hz) at 120 BPM', () => {
    expect(noteValueSeconds(nv('1/4'), 120)).toBeCloseTo(0.5, 9);
    expect(noteValueHz(nv('1/4'), 120)).toBeCloseTo(2, 9);
    expect(noteValueSeconds(nv('1/8', 'dotted'), 120)).toBeCloseTo(0.375, 9);
  });

  it('keeps Hz as the exact reciprocal of seconds for every entry', () => {
    for (const v of NOTE_VALUES) {
      expect(noteValueHz(v, 97) * noteValueSeconds(v, 97), label(v)).toBeCloseTo(1, 9);
    }
  });

  it('scales inversely with tempo across the whole Tempo slider range (20-200)', () => {
    for (const v of NOTE_VALUES) {
      expect(noteValueSeconds(v, 20) / noteValueSeconds(v, 200), label(v)).toBeCloseTo(10, 9);
    }
  });
});

describe('noteValueEquals', () => {
  it('compares division and modifier by value, not identity', () => {
    expect(noteValueEquals(nv('1/8', 'dotted'), { division: '1/8', modifier: 'dotted' })).toBe(
      true
    );
  });

  it('is false when either field differs', () => {
    expect(noteValueEquals(nv('1/8', 'dotted'), nv('1/8'))).toBe(false);
    expect(noteValueEquals(nv('1/8', 'dotted'), nv('1/4', 'dotted'))).toBe(false);
  });
});

describe('isNoteValue', () => {
  it('accepts every NOTE_VALUES entry', () => {
    for (const v of NOTE_VALUES) {
      expect(isNoteValue(v), label(v)).toBe(true);
    }
  });

  it('accepts a fresh object equal to a table entry (e.g. one decoded from JSON)', () => {
    expect(isNoteValue(JSON.parse('{"division":"1/8","modifier":"triplet"}'))).toBe(true);
  });

  it('rejects an unknown division', () => {
    expect(isNoteValue({ division: '1/3', modifier: 'straight' })).toBe(false);
    expect(isNoteValue({ division: '8', modifier: 'straight' })).toBe(false);
  });

  it('rejects a modifier the table does not offer for that division (multi-bar is straight-only)', () => {
    expect(isNoteValue({ division: '2', modifier: 'dotted' })).toBe(false);
    expect(isNoteValue({ division: '4', modifier: 'triplet' })).toBe(false);
  });

  it('rejects an unknown modifier', () => {
    expect(isNoteValue({ division: '1/4', modifier: 'swung' })).toBe(false);
  });

  it('rejects a missing field', () => {
    expect(isNoteValue({ division: '1/4' })).toBe(false);
    expect(isNoteValue({ modifier: 'straight' })).toBe(false);
    expect(isNoteValue({})).toBe(false);
  });

  it('rejects a wrong-typed field', () => {
    expect(isNoteValue({ division: 4, modifier: 'straight' })).toBe(false);
    expect(isNoteValue({ division: '1/4', modifier: null })).toBe(false);
  });

  it('rejects extra keys, so junk from a hand-edited session never reaches state', () => {
    expect(isNoteValue({ division: '1/4', modifier: 'straight', extra: 1 })).toBe(false);
  });

  it('rejects non-objects: the old "off" idea, null, undefined, strings, numbers, arrays', () => {
    expect(isNoteValue('off')).toBe(false);
    expect(isNoteValue('1/4')).toBe(false);
    expect(isNoteValue(null)).toBe(false);
    expect(isNoteValue(undefined)).toBe(false);
    expect(isNoteValue(0)).toBe(false);
    expect(isNoteValue(['1/4', 'straight'])).toBe(false);
  });
});

describe('allowedNoteValues', () => {
  it('at 60 BPM over 0-10 s includes 2 bars (8 s) and excludes 4 bars (16 s)', () => {
    const allowed = allowedNoteValues(60, { min: 0, max: 10 }, 'seconds');
    expect(allowed.some((v) => noteValueEquals(v, nv('2')))).toBe(true);
    expect(allowed.some((v) => noteValueEquals(v, nv('4')))).toBe(false);
  });

  it('at 200 BPM over 0-20 Hz excludes 1/32 triplet (40 Hz)', () => {
    const allowed = allowedNoteValues(200, { min: 0, max: 20 }, 'hz');
    expect(allowed.some((v) => noteValueEquals(v, nv('1/32', 'triplet')))).toBe(false);
  });

  it('keeps a value sitting exactly on the top edge — 20 Hz (1/16 triplet at 200 BPM, 1/32 triplet at 100)', () => {
    const at200 = allowedNoteValues(200, { min: 0, max: 20 }, 'hz');
    expect(at200.some((v) => noteValueEquals(v, nv('1/16', 'triplet')))).toBe(true);
    const at100 = allowedNoteValues(100, { min: 0, max: 20 }, 'hz');
    expect(at100.some((v) => noteValueEquals(v, nv('1/32', 'triplet')))).toBe(true);
  });

  it('keeps a value sitting exactly on the top edge — 10 s (1 bar at 24 BPM, 4 bars at 96 BPM)', () => {
    const at24 = allowedNoteValues(24, { min: 0, max: 10 }, 'seconds');
    expect(at24.some((v) => noteValueEquals(v, nv('1')))).toBe(true);
    const at96 = allowedNoteValues(96, { min: 0, max: 10 }, 'seconds');
    expect(at96.some((v) => noteValueEquals(v, nv('4')))).toBe(true);
  });

  it('includes both edges of the range and returns NOTE_VALUES order (ascending beats)', () => {
    // At 60 BPM: 1/4 = 1 s, 1/2 triplet = 1.333 s, 1/4 dotted = 1.5 s, 1/2 = 2 s.
    // Excluded: 1/4 triplet (0.667 s) and 1/2 dotted (3 s).
    const allowed = allowedNoteValues(60, { min: 1, max: 2 }, 'seconds');
    expect(allowed).toEqual([nv('1/4'), nv('1/2', 'triplet'), nv('1/4', 'dotted'), nv('1/2')]);
  });

  it('returns NOTE_VALUES order for the Hz unit too (not Hz order)', () => {
    const allowed = allowedNoteValues(60, { min: 0.5, max: 1.5 }, 'hz');
    const beats = allowed.map(noteValueBeats);
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(allowed.length).toBeGreaterThan(0);
  });

  it('filters on the unit asked for — the same range means different things in seconds and Hz', () => {
    const asSeconds = allowedNoteValues(60, { min: 0, max: 1 }, 'seconds');
    const asHz = allowedNoteValues(60, { min: 0, max: 1 }, 'hz');
    expect(asSeconds.some((v) => noteValueEquals(v, nv('1/16')))).toBe(true); // 0.25 s
    expect(asHz.some((v) => noteValueEquals(v, nv('1/16')))).toBe(false); // 4 Hz
    expect(asHz.some((v) => noteValueEquals(v, nv('1')))).toBe(true); // 0.25 Hz
  });

  it('is empty when nothing fits the range', () => {
    expect(allowedNoteValues(60, { min: 100, max: 200 }, 'seconds')).toEqual([]);
  });

  it('returns the whole table when the range covers everything', () => {
    expect(allowedNoteValues(60, { min: 0, max: 1000 }, 'seconds')).toEqual([...NOTE_VALUES]);
  });

  it('returns a new array each call, so a caller can reverse it without corrupting the table', () => {
    const a = allowedNoteValues(60, { min: 0, max: 1000 }, 'seconds');
    a.reverse();
    expect(NOTE_VALUES[0]).toEqual(nv('1/32', 'triplet'));
  });

  it('is non-empty at every integer tempo in the seed and slider range for both real controls', () => {
    for (let bpm = 20; bpm <= 200; bpm++) {
      expect(
        allowedNoteValues(bpm, { min: 0, max: 10 }, 'seconds').length,
        `delay @${bpm}`
      ).toBeGreaterThan(0);
      expect(
        allowedNoteValues(bpm, { min: 0, max: 20 }, 'hz').length,
        `lane @${bpm}`
      ).toBeGreaterThan(0);
    }
  });
});

describe('nearestNoteValue', () => {
  const lane60 = allowedNoteValues(60, { min: 0, max: 20 }, 'hz');
  const delay60 = allowedNoteValues(60, { min: 0, max: 10 }, 'seconds');

  it('returns the exact entry when the value is on the grid (1.5 Hz at 60 BPM = 1/4 triplet)', () => {
    expect(nearestNoteValue(1.5, 60, lane60, 'hz')).toEqual(nv('1/4', 'triplet'));
  });

  it('snaps an off-grid seconds value to the closest note (0.3 s at 60 BPM = 1/8 triplet, 0.333 s)', () => {
    expect(nearestNoteValue(0.3, 60, delay60, 'seconds')).toEqual(nv('1/8', 'triplet'));
  });

  it('measures distance in the unit it was asked for, not in the other one', () => {
    // 1/8 triplet = 0.333 s = 3 Hz, 1/8 = 0.5 s = 2 Hz at 60 BPM.
    const pair = [nv('1/8', 'triplet'), nv('1/8')];
    // 0.41 s is closer to 0.333 s in seconds (0.077 vs 0.090)...
    expect(nearestNoteValue(0.41, 60, pair, 'seconds')).toEqual(nv('1/8', 'triplet'));
    // ...but 1/0.41 = 2.44 Hz is closer to 2 Hz in Hz (0.44 vs 0.56).
    expect(nearestNoteValue(1 / 0.41, 60, pair, 'hz')).toEqual(nv('1/8'));
  });

  it('returns the longest entry for a value above the whole range, the shortest for one below', () => {
    expect(nearestNoteValue(1000, 60, delay60, 'seconds')).toEqual(delay60[delay60.length - 1]);
    expect(nearestNoteValue(0, 60, delay60, 'seconds')).toEqual(delay60[0]);
    expect(nearestNoteValue(-5, 60, delay60, 'seconds')).toEqual(delay60[0]);
  });

  it('snaps 0 Hz to the slowest allowed note (the lane Free -> Sync case)', () => {
    const slowest = lane60.reduce((a, b) => (noteValueHz(a, 60) < noteValueHz(b, 60) ? a : b));
    expect(nearestNoteValue(0, 60, lane60, 'hz')).toEqual(slowest);
  });

  it('breaks an exact tie toward the earlier entry in the list it was given', () => {
    const list = [nv('1/4'), nv('1/2')]; // 1 s and 2 s at 60 BPM; 1.5 is exactly between
    expect(nearestNoteValue(1.5, 60, list, 'seconds')).toEqual(nv('1/4'));
    expect(nearestNoteValue(1.5, 60, [...list].reverse(), 'seconds')).toEqual(nv('1/2'));
  });

  it('only ever returns a member of the list it was given', () => {
    const restricted = [nv('1/4'), nv('1/2')];
    expect(nearestNoteValue(0.05, 60, restricted, 'seconds')).toEqual(nv('1/4'));
    expect(nearestNoteValue(30, 60, restricted, 'seconds')).toEqual(nv('1/2'));
  });

  it('returns a single-entry list its only entry whatever the value', () => {
    expect(nearestNoteValue(123, 60, [nv('1')], 'seconds')).toEqual(nv('1'));
  });

  it('throws on an empty list rather than inventing a note', () => {
    expect(() => nearestNoteValue(1, 60, [], 'seconds')).toThrow();
  });
});
