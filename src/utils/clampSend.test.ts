import { describe, it, expect } from 'vitest';
import { clampSend } from './clampSend';

describe('clampSend', () => {
  it('passes an in-range fraction through unchanged, fractions included', () => {
    expect(clampSend(0)).toBe(0);
    expect(clampSend(0.25)).toBe(0.25);
    expect(clampSend(1)).toBe(1);
  });

  it('clamps below 0 to 0 and above 1 to 1, infinities included', () => {
    expect(clampSend(-0.5)).toBe(0);
    expect(clampSend(7)).toBe(1);
    expect(clampSend(Infinity)).toBe(1);
    expect(clampSend(-Infinity)).toBe(0);
  });

  it('turns a NaN into 0, so callers that must keep the old value check for NaN first', () => {
    expect(clampSend(NaN)).toBe(0);
  });
});
