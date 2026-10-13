// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { DAY_DURATION_MS, computeLocaleHour } from './time';
import * as constants from './index';

// ========================================
// TESTS
// ========================================

describe('the in-world day is wall-clock only (roadmap 48)', () => {
  it('has no measure-count day constant — measures count music and the fleet lifecycle, never a day', () => {
    expect(constants).not.toHaveProperty('DAY_CYCLE_MEASURES');
  });
});

describe('DAY_DURATION_MS', () => {
  it('is a flat 6 minutes in milliseconds', () => {
    expect(DAY_DURATION_MS).toBe(360000);
  });
});

describe('computeLocaleHour', () => {
  it('returns 0 right at dayStartTimestamp', () => {
    const now = Date.now();
    expect(computeLocaleHour(now)).toBeCloseTo(0, 1);
  });

  it('returns ~12 at the halfway point of the day', () => {
    const halfwayStart = Date.now() - DAY_DURATION_MS / 2;
    expect(computeLocaleHour(halfwayStart)).toBeCloseTo(12, 0);
  });

  it('returns ~23.9 just before the day wraps', () => {
    const almostFullDayStart = Date.now() - (DAY_DURATION_MS - 1000);
    const hour = computeLocaleHour(almostFullDayStart);
    expect(hour).toBeGreaterThan(23);
    expect(hour).toBeLessThan(24);
  });

  it('wraps back to a small hour just after a full day elapses', () => {
    // Slightly more than one full day elapsed — should wrap past 24 back
    // toward 0, not keep climbing.
    const justOverOneDayStart = Date.now() - (DAY_DURATION_MS + 1000);
    const hour = computeLocaleHour(justOverOneDayStart);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThan(1);
  });

  it('wraps correctly across multiple elapsed days', () => {
    // 2.5 days elapsed → should read the same as 0.5 days elapsed (~12).
    const twoAndHalfDaysStart = Date.now() - DAY_DURATION_MS * 2.5;
    expect(computeLocaleHour(twoAndHalfDaysStart)).toBeCloseTo(12, 0);
  });

  it('handles a dayStartTimestamp in the future (negative elapsed) without throwing', () => {
    const futureStart = Date.now() + 60_000;
    expect(() => computeLocaleHour(futureStart)).not.toThrow();
    expect(Number.isFinite(computeLocaleHour(futureStart))).toBe(true);
  });

  it('takes exactly one parameter — no size argument', () => {
    expect(computeLocaleHour.length).toBe(1);
  });
});
