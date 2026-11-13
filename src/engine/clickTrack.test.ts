import { describe, it, expect } from 'vitest';
import { buildClickTrackMelody } from './clickTrack';

// Four sixteenths a beat on one note, the beats on notes 0, 1, 2, 3, and the measure's first sixteenth an octave up, so
// every step, every beat and the downbeat can be told apart by ear (docs/tasks/ONE_MUSIC_CLOCK.md Task 10c).
describe('buildClickTrackMelody', () => {
  it('produces 16 events, one on every step of the measure (startStep 1 to 16)', () => {
    const melody = buildClickTrackMelody(4);
    expect(melody.map((e) => e.startStep)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it('every event is a straight sixteenth note', () => {
    const melody = buildClickTrackMelody(4);
    melody.forEach((e) => expect(e.length).toBe('16n'));
  });

  it('plays each beat on its own note: 0000 1111 2222 3333', () => {
    const melody = buildClickTrackMelody(4);
    expect(melody.map((e) => e.noteIndex)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it('puts the downbeat (step 1) an octave above the given octave, and every other event on it', () => {
    const melody = buildClickTrackMelody(5);
    expect(melody.map((e) => e.octave)).toEqual([6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  });

  it('accents only the downbeat at any octave, the lowest and the highest included', () => {
    for (const octave of [1, 3, 7]) {
      const melody = buildClickTrackMelody(octave);
      expect(melody.filter((e) => e.octave === octave + 1).map((e) => e.startStep)).toEqual([1]);
      expect(melody.filter((e) => e.octave === octave)).toHaveLength(15);
    }
  });

  it('every event has a unique id', () => {
    const melody = buildClickTrackMelody(4);
    expect(new Set(melody.map((e) => e.id)).size).toBe(16);
  });

  it('builds the same pattern on every call (a fresh array, never shared)', () => {
    const a = buildClickTrackMelody(4);
    const b = buildClickTrackMelody(4);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
