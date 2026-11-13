// ========================================
// noteStrength (docs/specs/ROBOT_NOTE_CLOUD.md §1.7; plan Task 18)
// ========================================
import { describe, expect, it } from 'vitest';

import { noteStrength } from './noteStrength';

// The cloud at its strongest (Crawford, 2026-11-13: "75% of their current opacity").
const PEAK = 0.75;

describe('noteStrength: the battery thins the cloud, attention wakes it (§1.7)', () => {
  it('is at its peak, three quarters, from a full battery down to half', () => {
    expect(noteStrength(100, false)).toBe(PEAK);
    expect(noteStrength(75, false)).toBe(PEAK);
    expect(noteStrength(50, false)).toBe(PEAK);
  });

  it('falls in a straight line from half to nothing at a flat battery, not at the recall line', () => {
    expect(noteStrength(25, false)).toBeCloseTo(PEAK * 0.5, 10);
    expect(noteStrength(10, false)).toBeCloseTo(PEAK * 0.2, 10);
    expect(noteStrength(0, false)).toBe(0);
  });

  it('is at its peak at any battery while the robot is woken', () => {
    for (const level of [100, 50, 25, 10, 0]) expect(noteStrength(level, true)).toBe(PEAK);
  });

  it('stays inside 0 to the peak for a level outside 0 to 100', () => {
    expect(noteStrength(120, false)).toBe(PEAK);
    expect(noteStrength(-5, false)).toBe(0);
    expect(noteStrength(Number.NaN, false)).toBe(0);
  });
});
