// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { JOB_MOVES, moveWindows, stepPoint, stepPath } from './jobMoveTable';
import { ATTACH_DURATION } from '../../components/robot/gem/orbiterMotion';
import { MOVE_APPROACH_MAX_SECONDS, MOVE_APPROACH_FRACTION } from '../../constants';
import { JobType } from '../../types/Robot';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// HELPERS
// ========================================
const OUTLINE: Vec2[] = [{ x: 0, y: 10 }, { x: 50, y: 10 }];
const PIPE: Vec2[] = [{ x: 5, y: 20 }, { x: 45, y: 20 }];
const POINTS: Vec2[] = [{ x: 10, y: 10 }, { x: 40, y: 10 }];

// ========================================
// TESTS
// ========================================
describe('JOB_MOVES (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9 table, Task 29)', () => {
  it('is the spec table: each job\'s moves, in order, on their targets', () => {
    expect(JOB_MOVES).toEqual({
      [JobType.VentExtraction]: [{ move: 'hoverPulse', point: 0 }],
      [JobType.AcousticSurvey]: [{ move: 'fan', point: 0 }, { move: 'ring', point: 0 }],
      [JobType.StructuralInspection]: [{ move: 'trace', path: 'outline' }],
      [JobType.FluidMonitoring]: [{ move: 'trace', path: 'pipe' }, { move: 'hoverPulse', point: 1 }],
      [JobType.Salvage]: [{ move: 'carry', from: 0, to: 1 }],
      [JobType.Maintenance]: [{ move: 'ring', point: 0, flicker: true }],
    });
  });

  it('every job has at least one move, and uses all five moves between them', () => {
    for (const job of Object.values(JobType)) expect(JOB_MOVES[job].length, job).toBeGreaterThan(0);
    const used = new Set(Object.values(JOB_MOVES).flatMap((steps) => steps.map((s) => s.move)));
    expect(used).toEqual(new Set(['hoverPulse', 'trace', 'ring', 'carry', 'fan']));
  });
});

describe('stepPoint / stepPath (resolving a step\'s targets on a site)', () => {
  it('a point index reads the site\'s points', () => {
    expect(stepPoint({ points: POINTS }, 0)).toBe(POINTS[0]);
    expect(stepPoint({ points: POINTS }, 1)).toBe(POINTS[1]);
  });

  it('an index past a site\'s points falls back to its last point', () => {
    expect(stepPoint({ points: POINTS }, 3)).toBe(POINTS[1]);
  });

  it('the pipe where the site has one; the outline where it doesn\'t (spec §1.5)', () => {
    expect(stepPath({ paths: { outline: OUTLINE, pipe: PIPE } }, 'pipe')).toBe(PIPE);
    expect(stepPath({ paths: { outline: OUTLINE } }, 'pipe')).toBe(OUTLINE);
    expect(stepPath({ paths: { outline: OUTLINE, pipe: PIPE } }, 'outline')).toBe(OUTLINE);
  });
});

describe('moveWindows (spec §1.9: moves split the duration equally)', () => {
  it('approach constants: min(0.35 s, 25 % of the share) for a later move', () => {
    expect(MOVE_APPROACH_MAX_SECONDS).toBe(0.35);
    expect(MOVE_APPROACH_FRACTION).toBe(0.25);
  });

  it('one move: the detach is its approach, and it works until the reattach', () => {
    for (const D of [6, 8, 10]) {
      expect(moveWindows(1, D)).toEqual([{ approach: 0, start: ATTACH_DURATION, end: D - ATTACH_DURATION }]);
    }
  });

  it('two moves at 6 s and 10 s: equal shares before the reattach; the second approaches for 0.35 s', () => {
    const at6 = moveWindows(2, 6);
    expect(at6).toHaveLength(2);
    expect(at6[0]).toEqual({ approach: 0, start: ATTACH_DURATION, end: 2.5 });
    expect(at6[1].approach).toBe(2.5);
    expect(at6[1].start).toBeCloseTo(2.85, 9);
    expect(at6[1].end).toBe(5);
    const at10 = moveWindows(2, 10);
    expect(at10[0]).toEqual({ approach: 0, start: ATTACH_DURATION, end: 4.5 });
    expect(at10[1].start).toBeCloseTo(4.85, 9);
    expect(at10[1].end).toBe(9);
  });

  it('a short share approaches for 25 % of it, and the first never spends more than 40 % on the detach', () => {
    // Five moves in 6 s: 1 s shares.
    const w = moveWindows(5, 6);
    expect(w[0].start - w[0].approach).toBeCloseTo(0.4, 9);
    for (const k of [1, 2, 3, 4]) expect(w[k].start - w[k].approach).toBeCloseTo(0.25, 9);
  });

  it('windows are contiguous, each approach ends where the work starts, and the last ends at D − ATTACH_DURATION', () => {
    for (const n of [1, 2, 3, 5]) {
      for (const D of [6, 10]) {
        const w = moveWindows(n, D);
        expect(w).toHaveLength(n);
        expect(w[0].approach).toBe(0);
        w.forEach((win, k) => {
          expect(win.start).toBeGreaterThan(win.approach);
          expect(win.end).toBeGreaterThan(win.start);
          if (k > 0) expect(win.approach).toBe(w[k - 1].end);
          expect(win.end - win.approach).toBeCloseTo((D - ATTACH_DURATION) / n, 9);
        });
        expect(w[n - 1].end).toBeCloseTo(D - ATTACH_DURATION, 9);
      }
    }
  });

  it('no moves, no windows', () => {
    expect(moveWindows(0, 6)).toEqual([]);
  });
});
