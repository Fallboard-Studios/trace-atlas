// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { smooth } from './smooth';

// ========================================
// TESTS
// ========================================
describe('smooth (smoothstep)', () => {
  it('runs 0 to 1, hitting .5 at the middle and the hand-computed .15625 at a quarter', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.25)).toBeCloseTo(0.15625, 12);
  });

  it('is point-symmetric about the middle and never leaves [0, 1] on [0, 1]', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      expect(smooth(u) + smooth(1 - u)).toBeCloseTo(1, 12);
      expect(smooth(u)).toBeGreaterThanOrEqual(0);
      expect(smooth(u)).toBeLessThanOrEqual(1);
    }
  });

  it('has a zero slope at both ends: it starts and ends slower than linear', () => {
    expect(smooth(0.01)).toBeLessThan(0.001);
    expect(1 - smooth(0.99)).toBeLessThan(0.001);
  });
});
