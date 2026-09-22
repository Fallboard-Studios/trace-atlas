// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';

// vitest.setup.ts mocks randomCoordinate() globally (back to a fixed
// (12, 68)-equivalent sequence, for every OTHER test file's benefit — see its
// own comment) — unmock here so this file exercises the real implementation.
vi.unmock('@/utils/seedUtils');

import {
  generateRandomAttenuationStyleName,
  resolveDefaultAttenuationStyleName,
  setGlobalAttenuationStyleSeedOverride,
  randomCoordinate,
  parseCoordinateParam,
  getLocaleCoordinateOverride,
  setLocaleCoordinateOverride,
} from './seedUtils';

// ========================================
// TESTS
// ========================================

describe('parseCoordinateParam', () => {
  it('parses plain and negative integers', () => {
    expect(parseCoordinateParam('12')).toBe(12);
    expect(parseCoordinateParam('-68')).toBe(-68);
    expect(parseCoordinateParam('0')).toBe(0);
  });

  it('rejects null, empty, decimals, and non-numeric text (coordinates are integers system-wide)', () => {
    expect(parseCoordinateParam(null)).toBeNull();
    expect(parseCoordinateParam('')).toBeNull();
    expect(parseCoordinateParam('12.5')).toBeNull();
    expect(parseCoordinateParam('abc')).toBeNull();
    expect(parseCoordinateParam('12abc')).toBeNull();
    expect(parseCoordinateParam(' 12')).toBeNull();
    expect(parseCoordinateParam('1e3')).toBeNull();
  });
});

describe('locale coordinate override', () => {
  afterEach(() => {
    setLocaleCoordinateOverride({ x: null, y: null });
  });

  it('is unset by default', () => {
    expect(getLocaleCoordinateOverride()).toEqual({ x: null, y: null });
  });

  it('can be set per axis and cleared', () => {
    setLocaleCoordinateOverride({ x: 12, y: null });
    expect(getLocaleCoordinateOverride()).toEqual({ x: 12, y: null });

    setLocaleCoordinateOverride({ x: null, y: null });
    expect(getLocaleCoordinateOverride()).toEqual({ x: null, y: null });
  });

  describe('boot-time ?x= / ?y= URL params', () => {
    afterEach(() => {
      window.history.replaceState({}, '', '/');
      vi.resetModules();
    });

    async function loadFreshWithQuery(query: string) {
      window.history.replaceState({}, '', `/${query}`);
      vi.resetModules();
      return import('./seedUtils');
    }

    it('reads both axes from the URL', async () => {
      const fresh = await loadFreshWithQuery('?x=12&y=-68');
      expect(fresh.getLocaleCoordinateOverride()).toEqual({ x: 12, y: -68 });
    });

    it('reads a single axis and leaves the other unset', async () => {
      const fresh = await loadFreshWithQuery('?x=5');
      expect(fresh.getLocaleCoordinateOverride()).toEqual({ x: 5, y: null });
    });

    it('ignores invalid values per axis', async () => {
      const fresh = await loadFreshWithQuery('?x=1.5&y=7');
      expect(fresh.getLocaleCoordinateOverride()).toEqual({ x: null, y: 7 });
    });

    it('is independent of ?seed=', async () => {
      const fresh = await loadFreshWithQuery('?seed=foo&x=3&y=4');
      expect(fresh.getGlobalAttenuationStyleSeedOverride()).toBe('foo');
      expect(fresh.getLocaleCoordinateOverride()).toEqual({ x: 3, y: 4 });

      const seedOnly = await loadFreshWithQuery('?seed=foo');
      expect(seedOnly.getLocaleCoordinateOverride()).toEqual({ x: null, y: null });
    });
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

describe('resolveDefaultAttenuationStyleName', () => {
  afterEach(() => {
    setGlobalAttenuationStyleSeedOverride(null);
  });

  it('returns a random name when no override is set', () => {
    setGlobalAttenuationStyleSeedOverride(null);
    const a = resolveDefaultAttenuationStyleName();
    const b = resolveDefaultAttenuationStyleName();
    // Not a hardcoded literal, and not stable across calls without an override.
    expect(a).not.toBe('pelagos');
    expect(a).not.toBe(b);
  });

  it('deterministically returns the sanitized override when one is set', () => {
    setGlobalAttenuationStyleSeedOverride('MyTestSeed!');
    const a = resolveDefaultAttenuationStyleName();
    const b = resolveDefaultAttenuationStyleName();
    expect(a).toBe('mytestseed');
    expect(b).toBe('mytestseed');
  });

  it('reverts to random behavior once the override is cleared', () => {
    setGlobalAttenuationStyleSeedOverride('pinned');
    expect(resolveDefaultAttenuationStyleName()).toBe('pinned');

    setGlobalAttenuationStyleSeedOverride(null);
    const a = resolveDefaultAttenuationStyleName();
    const b = resolveDefaultAttenuationStyleName();
    expect(a).not.toBe('pinned');
    expect(a).not.toBe(b);
  });
});
