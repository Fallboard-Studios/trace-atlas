// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';

// vitest.setup.ts mocks randomCoordinate() globally (back to a fixed
// (12, 68)-equivalent sequence, for every OTHER test file's benefit — see its
// own comment) — unmock here so this file exercises the real implementation.
vi.unmock('@/utils/seedUtils');

import { deriveAttenuationStyleSeed, generateRandomAttenuationStyleName, randomCoordinate } from './seedUtils';

// ========================================
// TESTS
// ========================================

describe('deriveAttenuationStyleSeed', () => {
  it('lowercases and strips everything but a-z and 0-9', () => {
    expect(deriveAttenuationStyleSeed('Pelagos 7!')).toBe('pelagos7');
  });

  it('keeps an already-clean name as it is, and maps an all-symbol name to the empty string', () => {
    expect(deriveAttenuationStyleSeed('n40dh8p8')).toBe('n40dh8p8');
    expect(deriveAttenuationStyleSeed('!? -')).toBe('');
  });
});

describe('randomCoordinate', () => {
  it('returns an integer', () => {
    for (let i = 0; i < 20; i++) {
      expect(Number.isInteger(randomCoordinate())).toBe(true);
    }
  });

  it('returns a different value on repeated calls (not a fixed literal)', () => {
    const values = new Set(Array.from({ length: 20 }, () => randomCoordinate()));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('generateRandomAttenuationStyleName', () => {
  it('returns a non-empty alphanumeric string', () => {
    const name = generateRandomAttenuationStyleName();
    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/^[a-z0-9]+$/);
  });

  it('returns a different value on each call', () => {
    const a = generateRandomAttenuationStyleName();
    const b = generateRandomAttenuationStyleName();
    expect(a).not.toBe(b);
  });
});
