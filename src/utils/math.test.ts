// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { lerp, quantizeToStep, roundToDecimals } from './math';

// ========================================
// TEST SUITE
// ========================================
describe('math utilities', () => {
  describe('lerp', () => {
    it('returns start value when t = 0', () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(-5, 5, 0)).toBe(-5);
    });

    it('returns end value when t = 1', () => {
      expect(lerp(10, 20, 1)).toBe(20);
      expect(lerp(-5, 5, 1)).toBe(5);
    });

    it('returns midpoint when t = 0.5', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(10, 30, 0.5)).toBe(20);
    });

    it('interpolates correctly for arbitrary t values', () => {
      expect(lerp(0, 100, 0.25)).toBe(25);
      expect(lerp(0, 100, 0.75)).toBe(75);
      expect(lerp(50, 150, 0.2)).toBe(70);
    });

    it('handles negative ranges', () => {
      expect(lerp(-10, -5, 0.5)).toBe(-7.5);
      expect(lerp(-100, 100, 0.5)).toBe(0);
    });

    it('works with identical start and end values', () => {
      expect(lerp(42, 42, 0)).toBe(42);
      expect(lerp(42, 42, 0.5)).toBe(42);
      expect(lerp(42, 42, 1)).toBe(42);
    });

    it('extrapolates correctly outside [0,1] range', () => {
      // t < 0
      expect(lerp(0, 10, -0.5)).toBe(-5);
      // t > 1
      expect(lerp(0, 10, 1.5)).toBe(15);
    });
  });

  describe('quantizeToStep', () => {
    it('rounds to the nearest step, not floor or ceil', () => {
      expect(quantizeToStep(4.236, 0, 0.25)).toBe(4.25);
    });

    it('leaves an already on-grid value unchanged', () => {
      expect(quantizeToStep(0, 0, 0.25)).toBe(0);
    });

    it('quantizes correctly against a negative min', () => {
      const result = quantizeToStep(-3, -12, 0.5);
      const steps = (result - -12) / 0.5;
      expect(Number.isInteger(steps)).toBe(true);
    });

    it('always lands on the min + n*step grid, for any input', () => {
      const cases: Array<[number, number, number]> = [
        [4.236, 0, 0.25],
        [0, 0, 0.25],
        [-3, -12, 0.5],
        [9.999, 0, 0.01],
        [-0.001, -1, 0.1],
        [100, 0, 3],
      ];
      for (const [value, min, step] of cases) {
        const result = quantizeToStep(value, min, step);
        const stepsFromMin = (result - min) / step;
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin))).toBeLessThan(1e-9);
      }
    });
  });

  describe('roundToDecimals', () => {
    it('removes floating-point residue: -0.42000000000000004 → -0.42 at 2 places', () => {
      expect(roundToDecimals(-0.42000000000000004, 2)).toBe(-0.42);
    });

    it('cleans a quantizeToStep result so state never carries residue (1.3500000000000001 → 1.35)', () => {
      expect(roundToDecimals(quantizeToStep(1.35, 0, 0.05), 2)).toBe(1.35);
      expect(roundToDecimals(quantizeToStep(0.333, 0, 0.001), 3)).toBe(0.333);
    });

    it('rounds, not truncates, and 0 places gives an integer', () => {
      expect(roundToDecimals(2.5, 0)).toBe(3);
      expect(roundToDecimals(2.449, 0)).toBe(2);
      expect(roundToDecimals(0.0049, 2)).toBe(0);
    });

    it('leaves an exact value alone', () => {
      expect(roundToDecimals(10, 3)).toBe(10);
      expect(roundToDecimals(0, 2)).toBe(0);
    });
  });
});
