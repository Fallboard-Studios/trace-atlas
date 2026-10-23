// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach } from 'vitest';

import { computeLocaleTemperature, LOCALE_TEMPERATURE_RANGE } from './localeTemperature';
import { evictLocaleNoiseMap } from './noiseMaps';

// ========================================
// TESTS
// ========================================

describe('computeLocaleTemperature', () => {
  afterEach(() => {
    evictLocaleNoiseMap('temp-test-locale');
    evictLocaleNoiseMap('temp-test-locale-b');
    for (let i = 0; i < 30; i++) evictLocaleNoiseMap(`temp-sample-${i}`);
  });

  it('always returns an integer in [-120, -30], across many locales/coordinates/hours', () => {
    const SAMPLE_LOCALES = 30;
    for (let i = 0; i < SAMPLE_LOCALES; i++) {
      const hour = (i * 0.83) % 24;
      const value = computeLocaleTemperature(`temp-sample-${i}`, i * 7, i * 13, hour);
      expect(value, `locale ${i}`).toBeGreaterThanOrEqual(LOCALE_TEMPERATURE_RANGE.min);
      expect(value, `locale ${i}`).toBeLessThanOrEqual(LOCALE_TEMPERATURE_RANGE.max);
      expect(Number.isInteger(value), `locale ${i} is an integer`).toBe(true);
    }
  });

  it('is deterministic — same (localeId, x, y, hour) always produces the same value', () => {
    const first = computeLocaleTemperature('temp-test-locale', 12, 68, 9.5);
    const second = computeLocaleTemperature('temp-test-locale', 12, 68, 9.5);
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = computeLocaleTemperature('temp-test-locale', 12, 68, 9.5);
    evictLocaleNoiseMap('temp-test-locale');
    const second = computeLocaleTemperature('temp-test-locale', 12, 68, 9.5);
    expect(second).toBe(first);
  });

  it('produces different values for a different locale/coordinates (non-degenerate)', () => {
    const a = computeLocaleTemperature('temp-test-locale', 12, 68, 9.5);
    const b = computeLocaleTemperature('temp-test-locale-b', -37, 204, 9.5);
    expect(b).not.toBe(a);
  });

  it('drifts across the hour — not a flat per-locale constant like BPM (samples across a spread of hours, at least one differs from the first)', () => {
    const localeId = 'temp-test-locale';
    const x = 12;
    const y = 68;
    const atHourZero = computeLocaleTemperature(localeId, x, y, 0);
    const samples = [3, 6, 9, 12, 15, 18, 21].map((hour) => computeLocaleTemperature(localeId, x, y, hour));
    expect(samples.some((value) => value !== atHourZero)).toBe(true);
  });

  it('is a pure function — the same call twice never mutates shared state observable by a third call', () => {
    // Calling it interleaved with a different locale must not cross-contaminate either result.
    const a1 = computeLocaleTemperature('temp-test-locale', 12, 68, 4);
    const b1 = computeLocaleTemperature('temp-test-locale-b', -37, 204, 4);
    const a2 = computeLocaleTemperature('temp-test-locale', 12, 68, 4);
    const b2 = computeLocaleTemperature('temp-test-locale-b', -37, 204, 4);
    expect(a2).toBe(a1);
    expect(b2).toBe(b1);
  });
});
