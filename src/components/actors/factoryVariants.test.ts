import { describe, it, expect } from 'vitest';
import { isBubbleEligible, getVariantFromNoise, selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import type { FactoryPurpose } from './factoryVariants';

describe('isBubbleEligible', () => {
  const eligible: FactoryPurpose[] = ['heavyIndustry', 'chemicalProcessing', 'pipeWorks', 'storageLogistics'];

  it.each(eligible)('returns true for %s', (purpose) => {
    expect(isBubbleEligible(purpose)).toBe(true);
  });

  it('returns false for observationComms', () => {
    expect(isBubbleEligible('observationComms')).toBe(false);
  });

  it('falls back to heavyIndustry (true) for undefined', () => {
    expect(isBubbleEligible(undefined)).toBe(true);
  });
});

describe('getVariantFromNoise', () => {
  it('resolves a noiseValue near 0 to the first (heaviest-weighted) entry with the default list', () => {
    expect(getVariantFromNoise(0, 1)).toBe('Monolith');
  });

  it('resolves a noiseValue near 1 to the last entry with the default list', () => {
    expect(getVariantFromNoise(0.999999, 1)).toBe('Warehouse');
  });

  it('falls through to the final entry for a noiseValue of exactly 1 (edge the loop\'s < comparisons never catch)', () => {
    expect(getVariantFromNoise(1, 1)).toBe('Warehouse');
  });

  it('re-weights correctly for a custom, shorter availableTypes list', () => {
    // 2 entries -> total = 3, cumulative after entry 1 = 2/3.
    const types: Array<'Monolith' | 'Stacks'> = ['Monolith', 'Stacks'];
    expect(getVariantFromNoise(0, 1, types)).toBe('Monolith');
    expect(getVariantFromNoise(0.6, 1, types)).toBe('Monolith'); // < 2/3
    expect(getVariantFromNoise(0.7, 1, types)).toBe('Stacks'); // >= 2/3
  });
});

describe('selectVariantFromSeed', () => {
  it('is deterministic — identical (actorId, x, row) produces byte-identical output on every field', () => {
    const first = selectVariantFromSeed('actor-42', 17.3, 1);
    const second = selectVariantFromSeed('actor-42', 17.3, 1);
    expect(second).toEqual(first);
  });

  it('pins one known-seed output as a regression snapshot — guards the documented PRNG draw order', () => {
    // If this ever fails after an intentional, reviewed change to
    // selectVariantFromSeed's draw order or math, re-generate the pinned
    // values deliberately — don't just paste in whatever the new output is
    // without checking it's the change you meant to make.
    const result = selectVariantFromSeed('actor-pin-1', 42, 1);
    expect(result).toMatchInlineSnapshot(`
      {
        "beltCourseCount": 1,
        "facadeGreeble": "wideWindows",
        "frontCornerX": 45,
        "hueShift": -14.59507951978594,
        "noiseValue": 0.5851908695347321,
        "purpose": "chemicalProcessing",
        "rooftopGreeble": "machinery",
        "satShift": -44.6996934292838,
        "scale": 1.0286702455021441,
        "variant": "Stacks",
      }
    `);
  });

  it('frontCornerX is always an integer in [25, 75] inclusive, across several seeds', () => {
    for (const actorId of ['a1', 'a2', 'a3', 'a4', 'a5']) {
      const { frontCornerX } = selectVariantFromSeed(actorId, 10, 1);
      expect(Number.isInteger(frontCornerX)).toBe(true);
      expect(frontCornerX).toBeGreaterThanOrEqual(25);
      expect(frontCornerX).toBeLessThanOrEqual(75);
    }
  });

  it('beltCourseCount is 0 when the resolved variant has maxBeltCourses 0 (Warehouse)', () => {
    expect(VARIANT_CONF.Warehouse.greebleConfig.maxBeltCourses).toBe(0);
    // Force the Warehouse variant via a single-entry availableTypes list.
    const { beltCourseCount, variant } = selectVariantFromSeed('actor-x', 5, 1, ['Warehouse']);
    expect(variant).toBe('Warehouse');
    expect(beltCourseCount).toBe(0);
  });

  it('beltCourseCount is otherwise an integer in [0, maxBeltCourses]', () => {
    for (const actorId of ['b1', 'b2', 'b3', 'b4', 'b5']) {
      const result = selectVariantFromSeed(actorId, 20, 1, ['Skyscraper']); // maxBeltCourses: 3
      expect(Number.isInteger(result.beltCourseCount)).toBe(true);
      expect(result.beltCourseCount).toBeGreaterThanOrEqual(0);
      expect(result.beltCourseCount).toBeLessThanOrEqual(3);
    }
  });
});
