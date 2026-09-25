// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach } from 'vitest';

import { stepLocaleTemperature } from './localeTemperatureStep';
import { LOCALE_TEMPERATURE_RANGE } from './localeTemperature';
import { evictLocaleNoiseMap } from './noiseMaps';

// ========================================
// TESTS
// ========================================

describe('stepLocaleTemperature', () => {
  afterEach(() => {
    evictLocaleNoiseMap('step-test-locale');
    evictLocaleNoiseMap('step-test-locale-b');
    for (let i = 0; i < 60; i++) evictLocaleNoiseMap(`step-sample-${i}`);
  });

  it('never moves by more than 5 degrees in either direction, across many slots', () => {
    for (let slot = 0; slot < 500; slot++) {
      const current = -75;
      const next = stepLocaleTemperature('step-test-locale', 12, 68, slot, current);
      expect(Math.abs(next - current)).toBeLessThanOrEqual(5);
      expect(Math.abs(next - current)).toBeGreaterThanOrEqual(1);
    }
  });

  it('stays within LOCALE_TEMPERATURE_RANGE even when starting at the boundary', () => {
    for (let slot = 0; slot < 500; slot++) {
      expect(stepLocaleTemperature('step-test-locale', 12, 68, slot, LOCALE_TEMPERATURE_RANGE.max)).toBeLessThanOrEqual(
        LOCALE_TEMPERATURE_RANGE.max,
      );
      expect(stepLocaleTemperature('step-test-locale', 12, 68, slot, LOCALE_TEMPERATURE_RANGE.min)).toBeGreaterThanOrEqual(
        LOCALE_TEMPERATURE_RANGE.min,
      );
    }
  });

  it('favors smaller moves over many slots (1-degree moves strictly more common than 5-degree moves)', () => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const SAMPLES = 4000;
    for (let slot = 0; slot < SAMPLES; slot++) {
      const magnitude = Math.abs(stepLocaleTemperature('step-test-locale', 12, 68, slot, -75) - -75);
      counts[magnitude] += 1;
    }
    expect(counts[1]).toBeGreaterThan(counts[5]);
    expect(counts[1] + counts[2] + counts[3] + counts[4] + counts[5]).toBe(SAMPLES);
  });

  it('always returns an integer', () => {
    expect(Number.isInteger(stepLocaleTemperature('step-test-locale', 12, 68, 3, -75))).toBe(true);
  });

  it('is deterministic — same (localeId, x, y, slot, current) always produces the same value', () => {
    const first = stepLocaleTemperature('step-test-locale', 12, 68, 5, -75);
    const second = stepLocaleTemperature('step-test-locale', 12, 68, 5, -75);
    expect(second).toBe(first);
  });

  it('produces identical walks for identical (x, y), even under a different localeId', () => {
    const a = stepLocaleTemperature('step-test-locale', 12, 68, 5, -75);
    const b = stepLocaleTemperature('step-test-locale-b', 12, 68, 5, -75);
    expect(b).toBe(a);
  });

  it('produces different walks for different coordinates (non-degenerate)', () => {
    const results = Array.from({ length: 20 }, (_, i) => stepLocaleTemperature(`step-sample-${i}`, i * 7, i * 13, 5, -75));
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it('is not a Math.random()-driven value (source-scan regression guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'localeTemperatureStep.ts'), 'utf-8');
    expect(source).not.toMatch(/Math\.random/);
    expect(source).toMatch(/getLocaleNoiseMap/);
  });
});
