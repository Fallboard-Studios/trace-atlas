// ========================================
// noteStrength (docs/specs/ROBOT_NOTE_CLOUD.md §1.7; plan Task 18)
// ========================================
import { describe, expect, it } from 'vitest';

import { noteStrength } from './noteStrength';

describe('noteStrength: the battery thins the cloud, attention wakes it (§1.7)', () => {
  it('is full from a full battery down to half', () => {
    expect(noteStrength(100, false)).toBe(1);
    expect(noteStrength(75, false)).toBe(1);
    expect(noteStrength(50, false)).toBe(1);
  });

  it('falls in a straight line from half to nothing at a flat battery, not at the recall line', () => {
    expect(noteStrength(25, false)).toBeCloseTo(0.5, 10);
    expect(noteStrength(10, false)).toBeCloseTo(0.2, 10);
    expect(noteStrength(0, false)).toBe(0);
  });

  it('is full at any battery while the robot is woken', () => {
    for (const level of [100, 50, 25, 10, 0]) expect(noteStrength(level, true)).toBe(1);
  });

  it('stays inside 0 to 1 for a level outside 0 to 100', () => {
    expect(noteStrength(120, false)).toBe(1);
    expect(noteStrength(-5, false)).toBe(0);
    expect(noteStrength(Number.NaN, false)).toBe(0);
  });
});
