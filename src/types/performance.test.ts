// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  ARTICULATION_MARK_NAMES,
  type ArticulationMark,
  type MelodyEvent,
  type Robot,
} from './Robot';
import type { RobotAudioOverrideDiff, SessionPayload } from './session';
import {
  DEFAULT_ACCENTS,
  DEFAULT_DYNAMICS,
  DEFAULT_RESTS,
} from '../engine/melodyGenerator';
import {
  HUMANIZE_MAX_MS,
  HUMANIZE_MIN_MS,
  MIN_SOUNDING_SECONDS,
  PERFORMANCE_MAX,
  PERFORMANCE_MIN,
} from '../constants';

// Robot Performance (roadmap 50.5) Task 1: the vocabulary every later task reads.
// docs/specs/ROBOT_PERFORMANCE.md section 1.1.

// ========================================
// TESTS
// ========================================

describe('ARTICULATION_MARK_NAMES', () => {
  it('lists the five marks in the spec order', () => {
    expect(ARTICULATION_MARK_NAMES).toEqual([
      'accent',
      'marcato',
      'staccato',
      'staccatissimo',
      'tenuto',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(ARTICULATION_MARK_NAMES).size).toBe(ARTICULATION_MARK_NAMES.length);
  });

  it('every name is assignable to ArticulationMark (compile-time check via build:types)', () => {
    const names: readonly ArticulationMark[] = ARTICULATION_MARK_NAMES;
    expect(names).toHaveLength(5);
  });
});

describe('performance fields are optional (absence is the default)', () => {
  it('a MelodyEvent with no rest or mark still type-checks and leaves both undefined', () => {
    const plain: MelodyEvent = { id: 'e', startStep: 1, length: '8n', noteIndex: 0, octave: 3 };
    expect(plain.rest).toBeUndefined();
    expect(plain.mark).toBeUndefined();
  });

  it('a MelodyEvent accepts a rest fraction and a mark together', () => {
    const stamped: MelodyEvent = {
      id: 'e',
      startStep: 1,
      length: '8n',
      noteIndex: 0,
      octave: 3,
      rest: 0.4,
      mark: 'marcato',
    };
    expect(stamped.rest).toBe(0.4);
    expect(stamped.mark).toBe('marcato');
  });

  it('a Robot carries dynamics, rests and accents without requiring any of them', () => {
    const none: Pick<Robot, 'dynamics' | 'rests' | 'accents'> = {};
    const all: Pick<Robot, 'dynamics' | 'rests' | 'accents'> = {
      dynamics: 70,
      rests: 30,
      accents: 60,
    };
    expect(none.dynamics).toBeUndefined();
    expect(all.accents).toBe(60);
  });

  // The company snapshot fields land in Task 14 with resolveCompanyOptions, whose
  // Required<CompanyOptionsSnapshot> return type forces the resolver to supply them.
  it('the session diff and the payload accept the new fields', () => {
    const diff: RobotAudioOverrideDiff = { dynamics: 70, rests: 30, accents: 60 };
    const payload: Pick<SessionPayload, 'humanize'> = { humanize: 12 };
    expect(diff.rests).toBe(30);
    expect(payload.humanize).toBe(12);
  });
});

describe('performance defaults reproduce today sound', () => {
  it('Dynamics defaults to 50 (the neutral midpoint), Rests and Accents to 0 (off)', () => {
    expect(DEFAULT_DYNAMICS).toBe(50);
    expect(DEFAULT_RESTS).toBe(0);
    expect(DEFAULT_ACCENTS).toBe(0);
  });

  it('every default sits inside the robot slider range', () => {
    for (const value of [DEFAULT_DYNAMICS, DEFAULT_RESTS, DEFAULT_ACCENTS]) {
      expect(value).toBeGreaterThanOrEqual(PERFORMANCE_MIN);
      expect(value).toBeLessThanOrEqual(PERFORMANCE_MAX);
    }
  });
});

describe('performance constants', () => {
  it('the three robot sliders run 0 to 100', () => {
    expect(PERFORMANCE_MIN).toBe(0);
    expect(PERFORMANCE_MAX).toBe(100);
  });

  it('Humanize runs 0 to 20 ms', () => {
    expect(HUMANIZE_MIN_MS).toBe(0);
    expect(HUMANIZE_MAX_MS).toBe(20);
  });

  it('a shortened note always sounds for at least 30 ms', () => {
    expect(MIN_SOUNDING_SECONDS).toBe(0.03);
  });
});
