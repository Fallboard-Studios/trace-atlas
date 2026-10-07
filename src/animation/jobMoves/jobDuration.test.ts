// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { jobDuration } from './jobDuration';
import { JobType } from '../../types/Robot';
import { JOB_BASE_SECONDS, JOB_MIN_SECONDS, JOB_WORK_RATE } from '../../constants';

// ========================================
// TESTS
// ========================================

const ALL_JOBS = Object.values(JobType);

describe('jobDuration (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9 — pulled forward from Task 19 for the Task 15 sim)', () => {
  it('pins the first-guess constants: base 5 s, floor 1.5 s, a rate in [0.5, 0.9] for every one of the six jobs', () => {
    expect(JOB_BASE_SECONDS).toBe(5);
    expect(JOB_MIN_SECONDS).toBe(1.5);
    expect(Object.keys(JOB_WORK_RATE).sort()).toEqual([...ALL_JOBS].sort());
    for (const job of ALL_JOBS) {
      expect(JOB_WORK_RATE[job]).toBeGreaterThanOrEqual(0.5);
      expect(JOB_WORK_RATE[job]).toBeLessThanOrEqual(0.9);
    }
  });

  it('is JOB_BASE_SECONDS − rate × orbiter count for counts 1–4', () => {
    for (const job of ALL_JOBS) {
      for (const count of [1, 2, 3, 4]) {
        expect(jobDuration(job, count)).toBeCloseTo(Math.max(JOB_MIN_SECONDS, JOB_BASE_SECONDS - JOB_WORK_RATE[job] * count));
      }
    }
  });

  it('more orbiters, faster work — strictly shorter from 1 to 4 while above the floor', () => {
    for (const job of ALL_JOBS) {
      const [one, two, three, four] = [1, 2, 3, 4].map((n) => jobDuration(job, n));
      expect(two).toBeLessThan(one);
      expect(three).toBeLessThan(two);
      expect(four).toBeLessThanOrEqual(three);
    }
  });

  it('floors at JOB_MIN_SECONDS however many orbiters work', () => {
    expect(jobDuration(JobType.Salvage, 100)).toBe(JOB_MIN_SECONDS);
    expect(jobDuration(JobType.Maintenance, 7)).toBe(JOB_MIN_SECONDS);
  });

  it('a hand-worked value: ventExtraction with one orbiter is 5 − rate', () => {
    expect(jobDuration(JobType.VentExtraction, 1)).toBeCloseTo(5 - JOB_WORK_RATE[JobType.VentExtraction]);
  });
});
