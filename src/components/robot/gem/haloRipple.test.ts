// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { rippleEnvelope, RIPPLE_OPACITY, RIPPLE_EDGE } from './haloRipple';

// ========================================
// TESTS — rippleEnvelope (spec §1.3: min(1, u / RIPPLE_EDGE, (1 − u) / RIPPLE_EDGE))
// ========================================
describe('rippleEnvelope — fades in over the first 10 % and out over the last 10 %', () => {
  it('0 at u 0 and u 1', () => {
    expect(rippleEnvelope(0)).toBe(0);
    expect(rippleEnvelope(1)).toBe(0);
  });

  it('1 at u 0.5 and across the whole middle', () => {
    expect(rippleEnvelope(0.5)).toBe(1);
    expect(rippleEnvelope(0.1)).toBeCloseTo(1, 10);
    expect(rippleEnvelope(0.9)).toBeCloseTo(1, 10);
  });

  it('0.5 at u 0.05 and at u 0.95', () => {
    expect(rippleEnvelope(0.05)).toBeCloseTo(0.5, 10);
    expect(rippleEnvelope(0.95)).toBeCloseTo(0.5, 10);
  });

  it('never negative outside the arc (u < 0 or u > 1)', () => {
    expect(rippleEnvelope(-0.1)).toBe(0);
    expect(rippleEnvelope(1.1)).toBe(0);
  });
});

describe('haloRipple — constants the station ripple shares', () => {
  it('opacity 0.9, edge 0.1', () => {
    expect(RIPPLE_OPACITY).toBe(0.9);
    expect(RIPPLE_EDGE).toBe(0.1);
  });
});
