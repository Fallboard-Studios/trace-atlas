// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ACCENT_TIER_2,
  ACCENT_TIER_3,
  ARTICULATION_MARKS,
  resolveArticulation,
  unlockedMarks,
} from './articulation';
import { ARTICULATION_MARK_NAMES, type MelodyEvent } from '../types/Robot';

// Robot Performance (roadmap 50.5) Task 2: the one table every number a mark means lives in.
// docs/specs/ROBOT_PERFORMANCE.md assumption 5, sections 1.3 and 4.

// ========================================
// HELPERS
// ========================================

const stamps = (event: Pick<MelodyEvent, 'rest' | 'mark'>) => resolveArticulation(event);

// ========================================
// TESTS
// ========================================

describe('ARTICULATION_MARKS', () => {
  it('has exactly the five mark names and nothing else', () => {
    expect(Object.keys(ARTICULATION_MARKS).sort()).toEqual([...ARTICULATION_MARK_NAMES].sort());
  });

  it('holds the spec velocity and length multipliers', () => {
    expect(ARTICULATION_MARKS).toEqual({
      accent: { velocity: 1.25, length: 1 },
      marcato: { velocity: 1.4, length: 0.75 },
      staccato: { velocity: 1, length: 0.5 },
      staccatissimo: { velocity: 1, length: 0.25 },
      tenuto: { velocity: 1.1, length: 1 },
    });
  });

  it('never silences a note (every length factor is above 0 and at most 1) or quiets it (velocity at least 1)', () => {
    for (const mark of ARTICULATION_MARK_NAMES) {
      expect(ARTICULATION_MARKS[mark].length).toBeGreaterThan(0);
      expect(ARTICULATION_MARKS[mark].length).toBeLessThanOrEqual(1);
      expect(ARTICULATION_MARKS[mark].velocity).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('accent tiers', () => {
  it('unlock the second tier at 34 and the third at 67', () => {
    expect(ACCENT_TIER_2).toBe(34);
    expect(ACCENT_TIER_3).toBe(67);
  });
});

describe('unlockedMarks', () => {
  it('unlocks nothing at 0', () => {
    expect(unlockedMarks(0)).toEqual([]);
  });

  it('unlocks accent and tenuto from 1 through 33', () => {
    expect(unlockedMarks(1)).toEqual(['accent', 'tenuto']);
    expect(unlockedMarks(33)).toEqual(['accent', 'tenuto']);
  });

  it('adds staccato and marcato from 34 through 66', () => {
    expect([...unlockedMarks(34)].sort()).toEqual(['accent', 'marcato', 'staccato', 'tenuto']);
    expect([...unlockedMarks(66)].sort()).toEqual(['accent', 'marcato', 'staccato', 'tenuto']);
  });

  it('adds staccatissimo from 67 through 100, all five marks', () => {
    expect([...unlockedMarks(67)].sort()).toEqual([...ARTICULATION_MARK_NAMES].sort());
    expect([...unlockedMarks(100)].sort()).toEqual([...ARTICULATION_MARK_NAMES].sort());
  });

  it('puts the tier boundary between 33.9 and 34, not at the rounding of a fractional value', () => {
    expect(unlockedMarks(33.9)).toHaveLength(2);
    expect(unlockedMarks(34)).toHaveLength(4);
    expect(unlockedMarks(66.9)).toHaveLength(4);
    expect(unlockedMarks(67)).toHaveLength(5);
  });

  it('unlocks nothing for a negative or NaN value, and everything above 100', () => {
    expect(unlockedMarks(-5)).toEqual([]);
    expect(unlockedMarks(NaN)).toEqual([]);
    expect(unlockedMarks(250)).toHaveLength(5);
    expect(unlockedMarks(Infinity)).toHaveLength(5);
  });

  it('only ever returns names from ARTICULATION_MARK_NAMES, and grows monotonically across a 0-100 sweep', () => {
    let previous = new Set<string>();
    for (let accents = 0; accents <= 100; accents++) {
      const current = new Set<string>(unlockedMarks(accents));
      for (const mark of current) expect(ARTICULATION_MARK_NAMES).toContain(mark);
      for (const mark of previous) expect(current.has(mark)).toBe(true);
      previous = current;
    }
  });

  it('has no duplicates at any value', () => {
    for (const accents of [1, 34, 67, 100]) {
      expect(new Set(unlockedMarks(accents)).size).toBe(unlockedMarks(accents).length);
    }
  });
});

describe('resolveArticulation', () => {
  it('a plain event is full velocity and full length', () => {
    expect(stamps({})).toEqual({ velocity: 1, length: 1 });
  });

  it('staccato halves the length, staccatissimo quarters it, neither changes velocity', () => {
    expect(stamps({ mark: 'staccato' })).toEqual({ velocity: 1, length: 0.5 });
    expect(stamps({ mark: 'staccatissimo' })).toEqual({ velocity: 1, length: 0.25 });
  });

  it('accent is louder at full length, marcato louder and clipped to three quarters', () => {
    expect(stamps({ mark: 'accent' })).toEqual({ velocity: 1.25, length: 1 });
    expect(stamps({ mark: 'marcato' })).toEqual({ velocity: 1.4, length: 0.75 });
  });

  it('a rest alone leaves the remainder of the length', () => {
    expect(stamps({ rest: 0.6 }).length).toBeCloseTo(0.4, 10);
    expect(stamps({ rest: 0.6 }).velocity).toBe(1);
  });

  it('a rest and staccato: the shorter wins (0.4 beats 0.5)', () => {
    expect(stamps({ rest: 0.6, mark: 'staccato' }).length).toBeCloseTo(0.4, 10);
  });

  it('a rest and staccatissimo: the shorter wins (0.25 beats 0.4)', () => {
    expect(stamps({ rest: 0.6, mark: 'staccatissimo' }).length).toBe(0.25);
  });

  it('a shallow rest does not lengthen a staccato (0.5 beats 0.75)', () => {
    expect(stamps({ rest: 0.25, mark: 'staccato' }).length).toBe(0.5);
  });

  it('a rest and marcato: the shorter of the two clips (0.4 beats 0.75, 0.75 beats 0.9)', () => {
    expect(stamps({ rest: 0.6, mark: 'marcato' })).toEqual({
      velocity: 1.4,
      length: expect.closeTo(0.4, 10),
    });
    expect(stamps({ rest: 0.1, mark: 'marcato' }).length).toBe(0.75);
  });

  it('a rest and accent keeps the accent velocity and takes the rest length', () => {
    expect(stamps({ rest: 0.5, mark: 'accent' })).toEqual({ velocity: 1.25, length: 0.5 });
  });

  it('tenuto cancels a rest: full length, tenuto velocity, at any rest depth', () => {
    for (const rest of [0.25, 0.5, 0.75]) {
      expect(stamps({ rest, mark: 'tenuto' })).toEqual({ velocity: 1.1, length: 1 });
    }
  });

  it('the deepest rest on the plain event leaves a quarter of the length', () => {
    expect(stamps({ rest: 0.75 }).length).toBe(0.25);
  });

  it('does not mutate the event', () => {
    const event: Pick<MelodyEvent, 'rest' | 'mark'> = { rest: 0.5, mark: 'staccato' };
    resolveArticulation(event);
    expect(event).toEqual({ rest: 0.5, mark: 'staccato' });
  });

  it('every mark resolves to a length in (0, 1] with or without a rest', () => {
    for (const mark of ARTICULATION_MARK_NAMES) {
      for (const rest of [undefined, 0.25, 0.75]) {
        const { length } = stamps({ mark, rest });
        expect(length).toBeGreaterThan(0);
        expect(length).toBeLessThanOrEqual(1);
      }
    }
  });
});
