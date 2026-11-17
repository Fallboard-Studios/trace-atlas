import { describe, expect, it } from 'vitest';

import { paletteForMeasure, stepInPalette } from './harmonySystem';

// The palette is a pure function of the measure (docs/specs/ONE_MUSIC_CLOCK.md §4.3): no repeat, no stored palette,
// so nothing here mocks the clock.
describe('paletteForMeasure', () => {
  // The twelve entries as literal note content, so a drift in the table or the index math fails on a wrong note.
  const ENTRIES = [
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
  // Measure m plays entry floor(m / 2) % 12, written out rather than recomputed.
  const ENTRY_AT_MEASURE = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 0, 0];

  it.each(ENTRY_AT_MEASURE.map((entry, measure) => [measure, entry]))('measure %i plays entry %i', (measure, entry) => {
    expect(paletteForMeasure(measure)).toEqual(ENTRIES[entry]);
  });

  it('holds each entry for two measures: 1 is still entry 0, 23 still entry 11', () => {
    expect(paletteForMeasure(1)).toEqual(ENTRIES[0]);
    expect(paletteForMeasure(23)).toEqual(ENTRIES[11]);
  });

  it('wraps on every lap, not only the first: measure 24 and 48 give entry 0, 241 entry 0, 263 entry 11', () => {
    expect(paletteForMeasure(24)).toEqual(ENTRIES[0]);
    expect(paletteForMeasure(48)).toEqual(ENTRIES[0]);
    expect(paletteForMeasure(241)).toEqual(ENTRIES[0]);
    expect(paletteForMeasure(263)).toEqual(ENTRIES[11]);
  });

  it('returns a copy: mutating the result leaves the next call unchanged', () => {
    const first = paletteForMeasure(4);
    first[0] = 'Z';
    first.push('X');
    expect(paletteForMeasure(4)).toEqual(ENTRIES[2]);
    expect(paletteForMeasure(5)).toEqual(ENTRIES[2]);
  });
});

// A neighbour (docs/specs/MELODY_JOURNEY.md §1.4, §1.7): the palette's distinct pitch classes in rising order, moved
// through pitchStep places from the event's own class, the octave carried across the top and the bottom.
describe('stepInPalette', () => {
  // C G E D B C E G: the classes C, D, E, G, B. Slots: 0 C, 1 G, 2 E, 3 D, 4 B.
  const CGE = ['C', 'G', 'E', 'D', 'B', 'C', 'E', 'G'];

  it('steps through the classes in pitch order, not slot order: up one from E4 is G4', () => {
    expect(stepInPalette(CGE, 2, 4, 1)).toEqual({ note: 'G', octave: 4 });
  });

  it('carries the octave across the top: up one from B4 is C5', () => {
    expect(stepInPalette(CGE, 4, 4, 1)).toEqual({ note: 'C', octave: 5 });
  });

  it('carries the octave across the bottom: down one from C4 is B3', () => {
    expect(stepInPalette(CGE, 0, 4, -1)).toEqual({ note: 'B', octave: 3 });
  });

  it('a pitchStep of 0 is the palette own note at the event octave', () => {
    expect(stepInPalette(CGE, 1, 3, 0)).toEqual({ note: 'G', octave: 3 });
    expect(stepInPalette(CGE, 7, 5, 0)).toEqual({ note: 'G', octave: 5 });
  });

  it('two steps are two single steps, either way and across the octave', () => {
    const once = (slotNote: { note: string; octave: number }, dir: number) =>
      stepInPalette(CGE, CGE.indexOf(slotNote.note), slotNote.octave, dir);
    for (const [slot, octave] of [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 2]] as const) {
      const start = { note: CGE[slot], octave };
      expect(stepInPalette(CGE, slot, octave, 2)).toEqual(once(once(start, 1), 1));
      expect(stepInPalette(CGE, slot, octave, -2)).toEqual(once(once(start, -1), -1));
    }
    // Written out: up two from G4 is C5, down two from D4 is B3, up five from C4 is C5 (a full lap of five classes).
    expect(stepInPalette(CGE, 1, 4, 2)).toEqual({ note: 'C', octave: 5 });
    expect(stepInPalette(CGE, 3, 4, -2)).toEqual({ note: 'B', octave: 3 });
    expect(stepInPalette(CGE, 0, 4, 5)).toEqual({ note: 'C', octave: 5 });
  });

  it('a one-class palette steps by octaves', () => {
    const one = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
    expect(stepInPalette(one, 3, 4, 1)).toEqual({ note: 'A', octave: 5 });
    expect(stepInPalette(one, 3, 4, -2)).toEqual({ note: 'A', octave: 2 });
  });

  it('reads sharps and flats: in Db F C Ab Bb the classes are C Db F Ab Bb', () => {
    const flats = ['Db', 'F', 'C', 'Ab', 'Bb', 'Db', 'Ab', 'F'];
    expect(stepInPalette(flats, 2, 4, 1)).toEqual({ note: 'Db', octave: 4 });
    expect(stepInPalette(flats, 4, 4, 1)).toEqual({ note: 'C', octave: 5 });
    expect(stepInPalette(flats, 1, 4, 1)).toEqual({ note: 'Ab', octave: 4 });
    const sharps = ['B', 'F#', 'D#', 'C#', 'A', 'B', 'D#', 'F#'];
    // C# D# F# A B: down one from C#4 is B3; up one from D#4 is F#4.
    expect(stepInPalette(sharps, 3, 4, -1)).toEqual({ note: 'B', octave: 3 });
    expect(stepInPalette(sharps, 2, 4, 1)).toEqual({ note: 'F#', octave: 4 });
  });

  it('at the top of octaveRange the step turns back: up one from B5 in [3, 5] is G5', () => {
    expect(stepInPalette(CGE, 4, 5, 1, [3, 5])).toEqual({ note: 'G', octave: 5 });
  });

  it('at the bottom of octaveRange the step turns back: down one from C3 in [3, 5] is D3', () => {
    expect(stepInPalette(CGE, 0, 3, -1, [3, 5])).toEqual({ note: 'D', octave: 3 });
  });

  it('a step that stays inside the range is not turned: up one from B4 in [3, 5] is C5', () => {
    expect(stepInPalette(CGE, 4, 4, 1, [3, 5])).toEqual({ note: 'C', octave: 5 });
  });

  it('when the opposite step leaves too, the event own note plays', () => {
    // A one-octave range and a one-class palette: either way leaves it.
    const one = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
    expect(stepInPalette(one, 0, 4, 1, [4, 4])).toEqual({ note: 'A', octave: 4 });
    // Five classes, a one-octave range, six steps: up and down both leave.
    expect(stepInPalette(CGE, 2, 4, 6, [4, 4])).toEqual({ note: 'E', octave: 4 });
  });

  it('every step from every slot of every palette lands inside the range when the event is inside it', () => {
    for (let measure = 0; measure < 24; measure += 2) {
      const palette = paletteForMeasure(measure);
      for (let slot = 0; slot < 8; slot++) {
        for (const octave of [3, 4]) {
          for (let step = -7; step <= 7; step++) {
            const { octave: out } = stepInPalette(palette, slot, octave, step, [3, 4]);
            expect(out).toBeGreaterThanOrEqual(3);
            expect(out).toBeLessThanOrEqual(4);
          }
        }
      }
    }
  });
});
