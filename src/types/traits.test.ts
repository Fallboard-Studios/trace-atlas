import { describe, it, expect } from 'vitest';
import { TRAIT_IDS, type Trait } from './traits';

describe('TRAIT_IDS', () => {
  it('has exactly 8 entries, no duplicates', () => {
    expect(TRAIT_IDS).toHaveLength(8);
    expect(new Set(TRAIT_IDS).size).toBe(8);
  });

  it('includes the colour trait, the Global Colour tab\'s own accent (Phase 50.3)', () => {
    expect(TRAIT_IDS).toContain('colour');
  });

  it('matches the Trait union discriminants exactly', () => {
    // Mirrors CONTROL_SCHEMA_TYPES' own "all variants covered" runtime assertion
    // (src/types/controls.test.ts) — a missing/extra member here is a real drift
    // between the type and the array, not just a typo.
    const expected: Trait[] = ['spectral', 'timeSpace', 'output', 'composition', 'company', 'seed', 'header', 'colour'];
    expect([...TRAIT_IDS].sort()).toEqual([...expected].sort());
  });

  it('every entry is a plain, non-empty string', () => {
    for (const trait of TRAIT_IDS) {
      expect(typeof trait).toBe('string');
      expect(trait.length).toBeGreaterThan(0);
    }
  });
});
