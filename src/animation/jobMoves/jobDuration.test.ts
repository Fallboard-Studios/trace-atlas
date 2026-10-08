// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { jobDuration } from './jobDuration';
import { JOB_BASE_MAX_SECONDS, JOB_BASE_MIN_SECONDS } from '../../constants';

// ========================================
// TESTS
// ========================================

describe('jobDuration(bpm) (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9 — Task 0b timing, Task 16b)', () => {
  it('pins the sketch constants: 10 s at the slowest tempo, 6 s at the fastest', () => {
    expect(JOB_BASE_MAX_SECONDS).toBe(10);
    expect(JOB_BASE_MIN_SECONDS).toBe(6);
  });

  it('is 10 s at 20 BPM, 8 s at 110 BPM and 6 s at 200 BPM', () => {
    expect(jobDuration(20)).toBe(10);
    expect(jobDuration(110)).toBeCloseTo(8);
    expect(jobDuration(200)).toBe(6);
  });

  it('is linear in the tempo between 20 and 200 BPM', () => {
    expect(jobDuration(65)).toBeCloseTo(9);
    expect(jobDuration(155)).toBeCloseTo(7);
    expect(jobDuration(29)).toBeCloseTo(9.8);
  });

  it('strictly shortens as the tempo rises across 20–200', () => {
    for (let bpm = 20; bpm < 200; bpm += 10) expect(jobDuration(bpm + 10)).toBeLessThan(jobDuration(bpm));
  });

  it('clamps outside 20–200 BPM', () => {
    expect(jobDuration(19)).toBe(10);
    expect(jobDuration(0)).toBe(10);
    expect(jobDuration(-50)).toBe(10);
    expect(jobDuration(201)).toBe(6);
    expect(jobDuration(240)).toBe(6);
    expect(jobDuration(Infinity)).toBe(6);
  });
});
