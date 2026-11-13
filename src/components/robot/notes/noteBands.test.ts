// ========================================
// noteBands (docs/specs/ROBOT_NOTE_CLOUD.md §1.7; plan Tasks 17a and 17e)
// ========================================
import { describe, expect, it } from 'vitest';

import { notesShown } from './noteBands';

describe('notesShown: notes in the battery\'s on bands, attention wakes them (§1.7)', () => {
  it('places notes in the on bands: 10–28, 38–55, 65–73 and 83–100', () => {
    for (const level of [10, 15, 27.9, 38, 45, 54.9, 65, 70, 72.9, 83, 90, 99.9]) expect(notesShown(level, false), `${level}%`).toBe(true);
  });

  it('places none below 10 or in the gaps: 28–38, 55–65 and 73–83', () => {
    for (const level of [0, 5, 9.9, 28, 30, 37.9, 55, 60, 64.9, 73, 78, 82.9]) expect(notesShown(level, false), `${level}%`).toBe(false);
  });

  it('a band runs from its lower edge up to, not including, its upper one', () => {
    expect(notesShown(10, false)).toBe(true);
    expect(notesShown(28, false)).toBe(false);
    expect(notesShown(38, false)).toBe(true);
    expect(notesShown(55, false)).toBe(false);
    expect(notesShown(65, false)).toBe(true);
    expect(notesShown(73, false)).toBe(false);
    expect(notesShown(83, false)).toBe(true);
  });

  it('a full battery counts as the top band, and so does a level above 100', () => {
    expect(notesShown(100, false)).toBe(true);
    expect(notesShown(120, false)).toBe(true);
  });

  it('a level below 0 or not a number places none', () => {
    expect(notesShown(-5, false)).toBe(false);
    expect(notesShown(Number.NaN, false)).toBe(false);
  });

  it('places notes at any level while the robot is woken', () => {
    for (const level of [100, 78, 60, 30, 5, 0, Number.NaN]) expect(notesShown(level, true), `${level}%`).toBe(true);
  });
});
