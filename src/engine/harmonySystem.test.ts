import { describe, expect, it } from 'vitest';

import { paletteForMeasure } from './harmonySystem';

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
