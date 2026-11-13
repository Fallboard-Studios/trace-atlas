// ========================================
// noteBands (docs/specs/ROBOT_NOTE_CLOUD.md §1.7; plan Task 17a)
// ========================================
import { describe, expect, it } from 'vitest';

import { notesShown } from './noteBands';

describe('notesShown: notes in every other ten of the battery, attention wakes them (§1.7)', () => {
  it('places notes in the odd tens: 10–20, 30–40, 50–60, 70–80 and 90–100', () => {
    for (const level of [10, 15, 30, 39.9, 55, 70, 79.9, 90, 99.9]) expect(notesShown(level, false), `${level}%`).toBe(true);
  });

  it('places none in the even tens: below 10, 20–30, 40–50, 60–70 and 80–90', () => {
    for (const level of [0, 5, 9.9, 20, 25, 45, 60, 69.9, 80, 89.9]) expect(notesShown(level, false), `${level}%`).toBe(false);
  });

  it('a band runs from its lower edge up to, not including, its upper one', () => {
    expect(notesShown(10, false)).toBe(true);
    expect(notesShown(20, false)).toBe(false);
    expect(notesShown(50, false)).toBe(true);
    expect(notesShown(60, false)).toBe(false);
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
    for (const level of [100, 85, 45, 25, 5, 0, Number.NaN]) expect(notesShown(level, true), `${level}%`).toBe(true);
  });
});
