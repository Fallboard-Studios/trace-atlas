// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { createFactory, deriveAsAccentPair, pickAccentTarget, getRecipeRow, factoryWidthAt, spreadXs } from './factoryPlacementSystem';
import { placeDistrict, pickDistrict } from './districts';
import { VARIANT_CONF, selectVariantFromSeed } from '../components/actors/factoryVariants';
import type { FactoryVariant } from '../components/actors/factoryVariants';
import { calcSilhouetteSize } from '../components/actors/silhouetteUtils';
import { RECIPES } from './districtRecipes';
import { shiftHSL } from '../utils/colorUtils';
import { computeAccentLean, hueArc, ACCENT_SAT_LIFT, ACCENT_HUES } from '../utils/accentLean';
import { getAttenuationStyleNoiseMap, getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import * as getSeededValModule from '../utils/getSeededVal';
import { deriveAttenuationStyleSeed } from '../utils/seedUtils';

// duplicate constants from placement system for use in assertions
const WORLD_BOUNDS = { width: 1920, height: 1080 };

// VARIANT_CONF imported previously but no longer needed

import { useLocaleStore } from '../stores/localeStore';
import { useAttenuationStyleStore, DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { ActorType } from '../types/Actor';
import type { Actor } from '../types/Actor';
import { recolorActorsForAttenuationStyle, foldBodyShift } from './factoryPlacementSystem';
import { BODY_BEARING_BASE } from '../components/actors/scenery/sceneryParams';

// The row Factory.tsx's own render-time fallback and
// recolorActorsForAttenuationStyle's row lookup both use when a factory's
// config.row is missing. Intentionally a literal here, NOT imported from
// factoryPlacementSystem.ts — this test exists to characterize that
// observable behavior (row falls back to 1) independent of however the
// implementation currently sources that number, so it still catches a
// regression if a future refactor changes the value without updating both
// call sites in lockstep.
const EXPECTED_DEFAULT_FACTORY_ROW = 1;

// ========================================
// TEST SUITE
// ========================================
describe('FactoryPlacementSystem', () => {
  describe('createFactory', () => {
    it('creates a factory with correct properties and random scale', () => {
      const factory = createFactory({ x: 500, y: 1000 }, 1);

      expect(factory.id).toBeDefined();
      expect(factory.type).toBe(ActorType.FACTORY);
      expect(factory.position).toEqual({ x: 500, y: 1000 });
      expect(factory.scaleX).toBeGreaterThanOrEqual(0.9);
      expect(factory.scaleX).toBeLessThanOrEqual(1.1);
      expect(factory.scaleY).toBeGreaterThanOrEqual(0.9);
      expect(factory.scaleY).toBeLessThanOrEqual(1.1);
      expect(factory.isActive).toBe(true);
      expect(factory.config?.row).toBe(1);
    });

    it('defaults row and gives random scale when none provided', () => {
      const factory = createFactory({ x: 100, y: 200 });

      expect(factory.scaleX).toBeGreaterThanOrEqual(0.9);
      expect(factory.scaleX).toBeLessThanOrEqual(1.1);
      expect(factory.scaleY).toBeGreaterThanOrEqual(0.9);
      expect(factory.scaleY).toBeLessThanOrEqual(1.1);
      expect(factory.config?.row).toBe(0);
    });

    it('factory data is serializable', () => {
      const factory = createFactory({ x: 500, y: 1000 }, 2);
      expect(() => JSON.stringify(factory)).not.toThrow();
    });
  });

  // Roadmap Phase 42 Task 13: `foldBodyShift` is the pure fold `createFactory` always did
  // inline, now extracted so scenery's body-bearing families (wall, tank, …) can share it.
  describe('foldBodyShift (extracted from createFactory)', () => {
    const baseBody = { h: 200, s: 15, l: 19 };
    const localShift = { hueShift: 10, satShift: 5 };
    const asShift = { hueShift: -4, satShift: 2 };

    it('with no accentTarget, sums local + AS only (no lean) — matches createFactory with accentTarget omitted', () => {
      const result = foldBodyShift(baseBody, localShift, asShift, undefined);
      expect(result).toEqual({ hueShift: localShift.hueShift + asShift.hueShift, satShift: localShift.satShift + asShift.satShift });
    });

    it('an explicit undefined accentTarget is byte-identical to omitting it', () => {
      expect(foldBodyShift(baseBody, localShift, asShift, undefined)).toStrictEqual(foldBodyShift(baseBody, localShift, asShift));
    });

    it('with an accentTarget, adds computeAccentLean(shiftHSL(baseBody, combined), target) on top of the combined shift', () => {
      const target = 172; // ~teal
      const combined = { hueShift: localShift.hueShift + asShift.hueShift, satShift: localShift.satShift + asShift.satShift };
      const lean = computeAccentLean(shiftHSL(baseBody, combined), target);
      const result = foldBodyShift(baseBody, localShift, asShift, target);
      expect(result.hueShift).toBe(combined.hueShift + lean.hueShift);
      expect(result.satShift).toBe(combined.satShift + lean.satShift);
      expect(lean.hueShift).not.toBe(0); // fixture really exercises the lean, not a 0-delta no-op
    });

    it("createFactory now delegates to it: its stored shift equals foldBodyShift's result for the same variant base/local/AS/target (regression — the extraction changed no observable output)", () => {
      const id = 'fold-delegate-id';
      const pos = { x: 500, y: 1000 };
      const row = 1;
      const asShiftArg = { hueShift: 10, satShift: -5 };
      const target = 172;
      const local = selectVariantFromSeed(id, pos.x, row);
      const expected = foldBodyShift(
        VARIANT_CONF[local.variant].colors.body,
        { hueShift: local.hueShift, satShift: local.satShift },
        asShiftArg,
        target,
      );
      const actor = createFactory(pos, row, 1, id, asShiftArg, target);
      expect(actor.config?.hueShift).toBe(expected.hueShift);
      expect(actor.config?.satShift).toBe(expected.satShift);
    });
  });

  // The generic placement-loop properties the legacy fixed-table placement path used to cover
  // here (row validity, scale range, world-bounds, per-row count caps, spreadType semantics)
  // are now exercised against the real recipe tables by districts.test.ts's `placeDistrict`
  // suite (every district, 20 seeds) and this file's own `spreadXs` unit tests below — nothing
  // is re-authored here (roadmap Phase 42 Task 5, "Architecture Decisions: pure modules first").

  describe('getRecipeRow (roadmap Phase 42 Task 4 — the districts.ts placement path)', () => {
    it('returns dense row 0', () => {
      expect(getRecipeRow('dense', 0)).toEqual(RECIPES.dense[0]);
    });

    it('returns every row of every district, by index', () => {
      for (const district of Object.keys(RECIPES) as (keyof typeof RECIPES)[]) {
        RECIPES[district].forEach((row, idx) => {
          expect(getRecipeRow(district, idx)).toEqual(row);
        });
      }
    });

    it('returns null for an out-of-range row', () => {
      expect(getRecipeRow('dense', -1)).toBeNull();
      expect(getRecipeRow('dense', RECIPES.dense.length)).toBeNull();
    });
  });

  describe('factoryWidthAt', () => {
    it('agrees with the variant selection createFactory itself makes for the same (id, x, row, availableTypes)', () => {
      // createFactory's availableTypes is now an explicit caller-supplied filter (roadmap Phase
      // 42 Task 5), not an internal table lookup — factoryWidthAt must be given the same filter
      // to agree.
      const availableTypes: FactoryVariant[] = ['Monolith'];
      const factory = createFactory({ x: 300, y: 1000 }, 2, 1, 'width-check-id', undefined, undefined, availableTypes);
      const { variant, noiseValue } = selectVariantFromSeed('width-check-id', 300, 2, availableTypes);
      const expectedWidth = calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange).width;
      expect(factoryWidthAt('width-check-id', 300, 2, availableTypes)).toBe(expectedWidth);
      // sanity: createFactory picked the same variant this helper assumed
      expect(factory.config?.purpose).toBe(VARIANT_CONF[variant].purpose);
    });

    it('is deterministic for the same inputs', () => {
      expect(factoryWidthAt('det-id', 500, 1)).toBe(factoryWidthAt('det-id', 500, 1));
    });
  });

  describe('spreadXs', () => {
    const fakeNoiseMap = createNoise2D(alea('spreadxs-fixture'));

    it("'full': places exactly `count` items (nextWidth called once per item, return value ignored)", () => {
      const widths: number[] = [];
      spreadXs({ spread: 'full', count: 5 }, (x) => { widths.push(x); return 999; }, fakeNoiseMap, 0);
      expect(widths.length).toBe(5);
    });

    it("'edges': splits count between left and right halves (ceil/floor)", () => {
      const xs: number[] = [];
      spreadXs({ spread: 'edges', count: 5, edgeWidth: 0.3 }, (x) => { xs.push(x); return 60; }, fakeNoiseMap, 0);
      // half = ceil(5/2) = 3 on the left, halfRight = floor(5/2) = 2 on the right, capped by
      // how many fit before the limit — assert the total never exceeds count and both sides are used.
      expect(xs.length).toBeLessThanOrEqual(5);
      const mid = WORLD_BOUNDS.width / 2;
      expect(xs.some((x) => x < mid)).toBe(true);
      expect(xs.some((x) => x >= mid)).toBe(true);
    });

    it("'center': calls getSeededVal's 'factory.spacing' jitter at offset rowIndex*1000 + placedCenter", () => {
      const spy = vi.spyOn(getSeededValModule, 'getSeededVal');
      try {
        spreadXs({ spread: 'center', count: 3, centerWidth: 0.4 }, () => 60, fakeNoiseMap, 7);
        const calls = spy.mock.calls.filter((c) => c[1] === 'factory.spacing');
        expect(calls.length).toBeGreaterThan(0);
        for (const [, , offset] of calls) {
          expect(offset).toBeGreaterThanOrEqual(7000);
          expect(offset).toBeLessThan(8000);
        }
      } finally {
        spy.mockRestore();
      }
    });

    it('falls back to alea (not a crash) when noiseMap is null', () => {
      expect(() => spreadXs({ spread: 'center', count: 2, centerWidth: 0.3 }, () => 60, null, 0)).not.toThrow();
    });
  });

  describe('color shift determinism', () => {
    it('stores hueShift, satShift and greeble choices in Actor.config', () => {
      const factory = createFactory({ x: 500, y: 1000 }, 1);

      expect(factory.config?.hueShift).toBeDefined();
      expect(factory.config?.satShift).toBeDefined();
      expect(typeof factory.config?.hueShift).toBe('number');
      expect(typeof factory.config?.satShift).toBe('number');

      expect(factory.config?.rooftopGreeble).toBeDefined();
      expect(factory.config?.facadeGreeble).toBeDefined();
      // ensure values are strings (they should be a Rooftop/Facade enum)
      expect(typeof factory.config?.rooftopGreeble).toBe('string');
      expect(typeof factory.config?.facadeGreeble).toBe('string');
    });

    it('generates color shifts within expected ranges and valid greebles', () => {
      const factory = createFactory({ x: 500, y: 1000 }, 1);

      // Resolve the variant so we can check against its actual colorRanges — createFactory was
      // given no availableTypes filter above, so neither does this re-derivation.
      const variantConf = VARIANT_CONF[selectVariantFromSeed(factory.id, factory.position.x, factory.config?.row ?? 0).variant];
      // Use Math.min/max to handle ranges that are specified high-to-low (e.g. [-45, -90])
      const hueMin = Math.min(...variantConf.colorRanges.hueShiftRange);
      const hueMax = Math.max(...variantConf.colorRanges.hueShiftRange);
      const satMin = Math.min(...variantConf.colorRanges.satShiftRange);
      const satMax = Math.max(...variantConf.colorRanges.satShiftRange);

      expect(factory.config?.hueShift).toBeGreaterThanOrEqual(hueMin);
      expect(factory.config?.hueShift).toBeLessThanOrEqual(hueMax);
      expect(factory.config?.satShift).toBeGreaterThanOrEqual(satMin);
      expect(factory.config?.satShift).toBeLessThanOrEqual(satMax);

      // selected greebles must belong to the variant's pools
      const gc = variantConf.greebleConfig as {
        allowedRooftop: string[];
        allowedFacade: string[];
      };
      expect(gc.allowedRooftop).toContain(factory.config?.rooftopGreeble);
      expect(gc.allowedFacade).toContain(factory.config?.facadeGreeble);
    });

    it('stores beltCourseCount in Actor.config', () => {
      const factory = createFactory({ x: 300, y: 1000 }, 0);
      expect(factory.config?.beltCourseCount).toBeDefined();
      expect(typeof factory.config?.beltCourseCount).toBe('number');
    });

    it('beltCourseCount is within variant maxBeltCourses range', () => {
      const factory = createFactory({ x: 700, y: 1000 }, 1);
      const variant = selectVariantFromSeed(factory.id, factory.position.x, factory.config?.row ?? 0).variant;
      const maxBeltCourses = (VARIANT_CONF[variant] as { greebleConfig?: { maxBeltCourses?: number } })
        .greebleConfig?.maxBeltCourses ?? 0;
      expect(factory.config!.beltCourseCount).toBeGreaterThanOrEqual(0);
      expect(factory.config!.beltCourseCount).toBeLessThanOrEqual(maxBeltCourses);
    });

    it('beltCourseCount is deterministic with the same actor id', () => {
      const factory = createFactory({ x: 400, y: 900 }, 0);
      const a = selectVariantFromSeed(factory.id, factory.position.x, 0);
      const b = selectVariantFromSeed(factory.id, factory.position.x, 0);
      expect(a.beltCourseCount).toBe(b.beltCourseCount);
      expect(a.beltCourseCount).toBe(factory.config?.beltCourseCount);
    });

    it('selectVariantFromSeed returns correct purpose for each variant', () => {
      (['Monolith', 'Stacks', 'Refinery', 'Skyscraper', 'Warehouse'] as const).forEach((variant) => {
        const info = selectVariantFromSeed('dummy-id', 0, 0, [variant]);
        expect(info.purpose).toBe(VARIANT_CONF[variant].purpose);
      });
    });

    it('factory.config.purpose matches selectVariantFromSeed and survives JSON stringify', () => {
      const factory = createFactory({ x: 200, y: 800 }, 0);
      expect(factory.config?.purpose).toBeDefined();
      const info = selectVariantFromSeed(factory.id, factory.position.x, factory.config?.row ?? 0);
      expect(factory.config?.purpose).toBe(info.purpose);
      expect(() => JSON.stringify(factory)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(factory));
      expect(parsed.config.purpose).toBe(factory.config?.purpose);
    });

    it('produces identical color shifts for same position (deterministic from ID seed)', () => {
      // Each factory's own id is itself seeded from the locale's noise map (not
      // crypto.randomUUID()), so two factories only get identical color shifts if their
      // seeded ids happen to collide — this test verifies selectVariantFromSeed is
      // deterministic given the same id, not that placeDistrict assigns colliding ids.
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [] });
      // Scenery rows (roadmap Phase 42 Task 11) may share this locale's district recipe — filter
      // to factory actors, since this test is about selectVariantFromSeed's color-shift fields,
      // which only factories carry.
      const factories = placeDistrict(DEFAULT_LOCALE_ID).filter((a) => a.type === ActorType.FACTORY);

      // Verify that all factories have valid color shifts and greeble selections
      factories.forEach((factory) => {
        expect(factory.config?.hueShift).toBeDefined();
        expect(factory.config?.satShift).toBeDefined();
        expect(typeof factory.config?.hueShift).toBe('number');
        expect(typeof factory.config?.satShift).toBe('number');
        expect(factory.config?.rooftopGreeble).toBeDefined();
        expect(factory.config?.facadeGreeble).toBeDefined();
      });

      // Verify that different factories have different shifts or greebles
      if (factories.length >= 2) {
        const factory1 = factories[0];
        const factory2 = factories[1];

        const shiftsAreDifferent =
          factory1.config?.hueShift !== factory2.config?.hueShift ||
          factory1.config?.satShift !== factory2.config?.satShift;
        const greeblesAreDifferent =
          factory1.config?.rooftopGreeble !== factory2.config?.rooftopGreeble ||
          factory1.config?.facadeGreeble !== factory2.config?.facadeGreeble;

        expect(shiftsAreDifferent || greeblesAreDifferent).toBe(true);
      }
    });

    it('produces an identical factory backdrop for two locales sharing the same coordinates (reload / shared-link determinism)', () => {
      // Simulates the real scenario Session Storage's URL-sharing depends on: the same
      // same coordinates must regenerate the exact same world, factories included —
      // not just internally-consistent colors (the test above), but the same ids,
      // positions, scales, and colors bit-for-bit, on a completely separate locale.
      const localeA = {
        id: 'locale-a', attenuationStyleId: 'p', name: 'A', coordinates: { x: 42, y: 7 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      const localeB = {
        id: 'locale-b', attenuationStyleId: 'p', name: 'B', coordinates: { x: 42, y: 7 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      useLocaleStore.getState().addLocale('p', localeA);
      useLocaleStore.getState().addLocale('p', localeB);

      const actorsA = placeDistrict('locale-a');
      const actorsB = placeDistrict('locale-b');

      expect(actorsA.length).toBeGreaterThan(0);
      expect(actorsA).toEqual(actorsB);
    });

    it('produces a different factory backdrop for locales at different coordinates', () => {
      const localeA = {
        id: 'locale-c', attenuationStyleId: 'p', name: 'C', coordinates: { x: 1, y: 1 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      const localeB = {
        id: 'locale-d', attenuationStyleId: 'p', name: 'D', coordinates: { x: 99, y: 99 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      useLocaleStore.getState().addLocale('p', localeA);
      useLocaleStore.getState().addLocale('p', localeB);

      const actorsC = placeDistrict('locale-c');
      const actorsD = placeDistrict('locale-d');

      expect(actorsC).not.toEqual(actorsD);
    });
  });

  describe('Attenuation Style (AS) additive color shift', () => {
    it('createFactory with no asShift produces the same hueShift/satShift as an explicit zero asShift (regression-safe default)', () => {
      const withoutArg = createFactory({ x: 500, y: 1000 }, 1, 1, 'as-parity-id');
      const withZero = createFactory({ x: 500, y: 1000 }, 1, 1, 'as-parity-id', { hueShift: 0, satShift: 0 });

      expect(withoutArg.config?.hueShift).toBe(withZero.config?.hueShift);
      expect(withoutArg.config?.satShift).toBe(withZero.config?.satShift);
    });

    it('createFactory sums a supplied asShift into the stored hueShift/satShift, never replacing the local shift', () => {
      const base = createFactory({ x: 500, y: 1000 }, 1, 1, 'as-sum-id');
      const withShift = createFactory({ x: 500, y: 1000 }, 1, 1, 'as-sum-id', { hueShift: 10, satShift: -5 });

      expect(withShift.config?.hueShift).toBe((base.config?.hueShift ?? 0) + 10);
      expect(withShift.config?.satShift).toBe((base.config?.satShift ?? 0) - 5);
    });

    it("placeDistrict folds in the locale's own Attenuation Style noise map, distinct from another Attenuation Style's", () => {
      // Two locales at IDENTICAL coordinates get identical local-seeded ids/shifts
      // (the locale noise map is a pure function of (x, y)) — so any difference in
      // the final stored hueShift/satShift must come from the AS input.
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'as-planet-a', name: 'as-planet-alpha', locales: [] });
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'as-planet-b', name: 'as-planet-beta', locales: [] });

      const localeOnA = {
        id: 'locale-as-a', attenuationStyleId: 'as-planet-a', name: 'A', coordinates: { x: 30, y: 30 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      const localeOnB = {
        id: 'locale-as-b', attenuationStyleId: 'as-planet-b', name: 'B', coordinates: { x: 30, y: 30 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      useLocaleStore.getState().addLocale('as-planet-a', localeOnA);
      useLocaleStore.getState().addLocale('as-planet-b', localeOnB);

      const actorsA = placeDistrict('locale-as-a');
      const actorsB = placeDistrict('locale-as-b');

      expect(actorsA.length).toBeGreaterThan(0);
      expect(actorsA.map((a) => a.id)).toEqual(actorsB.map((a) => a.id));
      const anyShiftDiffers = actorsA.some((a, i) => {
        const b = actorsB[i];
        return a.config?.hueShift !== b.config?.hueShift || a.config?.satShift !== b.config?.satShift;
      });
      expect(anyShiftDiffers).toBe(true);
    });

    it("placeDistrict falls back to a zero asShift (not a crash) when the locale's attenuationStyleId doesn't resolve to any Attenuation Style in the store", () => {
      const orphanLocale = {
        id: 'locale-orphan', attenuationStyleId: 'no-such-planet', name: 'Orphan', coordinates: { x: 8, y: 8 },
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      };
      useLocaleStore.getState().addLocale('no-such-planet', orphanLocale);

      expect(() => placeDistrict('locale-orphan')).not.toThrow();
      const actors = useLocaleStore.getState().locales['locale-orphan'].actors.filter((a) => a.type === ActorType.FACTORY);
      expect(actors.length).toBeGreaterThan(0);

      // No AS contribution: stored hueShift/satShift must equal the pure local shift.
      actors.forEach((actor) => {
        const district = actor.config!.district!;
        const row = actor.config?.row ?? 0;
        const availableTypes = getRecipeRow(district, row)?.variants;
        const local = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
        expect(actor.config?.hueShift).toBe(local.hueShift);
        expect(actor.config?.satShift).toBe(local.satShift);
      });
    });
  });

  // docs/specs/WORLD_PALETTE_PULL.md §1.3 / docs/tasks/WORLD_PALETTE_PULL.md Task 3: createFactory's
  // optional trailing `accentTarget` folds the accent lean into the stored hueShift/satShift.
  describe('accent lean (Phase 35) — createFactory accentTarget', () => {
    const pos = { x: 500, y: 1000 };
    const row = 1;
    // Non-default AS shift on EVERY fixture (parity-test rule: an "unchanged" assertion must
    // not be able to pass because both sides are zero).
    const asShift = { hueShift: 10, satShift: -5 };

    /** The body colour the lean is computed from: variant base + local + AS, exactly as the
     *  implementation must compute it (spec §1.3). */
    function bodyBeforeLean(id: string) {
      const local = selectVariantFromSeed(id, pos.x, row);
      const combined = { hueShift: local.hueShift + asShift.hueShift, satShift: local.satShift + asShift.satShift };
      return { combined, body: shiftHSL(VARIANT_CONF[local.variant].colors.body, combined) };
    }

    it('an explicit `undefined` accentTarget produces a byte-identical actor to omitting it (no lean = today)', () => {
      const without = createFactory(pos, row, 1, 'lean-parity-id', asShift);
      const withUndefined = createFactory(pos, row, 1, 'lean-parity-id', asShift, undefined);
      expect(withUndefined).toStrictEqual(without);
    });

    it('with an accentTarget, the stored shift differs from local + AS by exactly computeAccentLean(bodyBeforeLean, target)', () => {
      const id = 'lean-delta-id';
      const { combined, body } = bodyBeforeLean(id);
      const target = 172; // ≈ teal

      const actor = createFactory(pos, row, 1, id, asShift, target);
      const lean = computeAccentLean(body, target);

      expect(actor.config?.hueShift).toBe(combined.hueShift + lean.hueShift);
      // lean.satShift, not ACCENT_SAT_LIFT: the warm-band cap (accentLean.ts) can make the
      // saturation delta smaller than the lift, or negative. The oracle is computeAccentLean.
      expect(actor.config?.satShift).toBe(combined.satShift + lean.satShift);
      // And the lean really is non-trivial for this fixture — otherwise the equality proves nothing.
      expect(lean.hueShift).not.toBe(0);
      expect(lean.satShift).toBe(ACCENT_SAT_LIFT); // teal target → cool → full lift, so this fixture also pins the uncapped path
    });

    it('moves the body hue strictly closer to the target without overshooting, for targets on both sides and across the 0/360 seam', () => {
      const id = 'lean-arc-id';
      const { body } = bodyBeforeLean(id);
      const variant = selectVariantFromSeed(id, pos.x, row).variant;
      const base = VARIANT_CONF[variant].colors.body;

      for (const target of [5, 100, 250, 355]) {
        const actor = createFactory(pos, row, 1, id, asShift, target);
        const after = shiftHSL(base, { hueShift: actor.config!.hueShift!, satShift: actor.config!.satShift! });
        const arcBefore = hueArc(body.h, target);
        const arcAfter = hueArc(after.h, target);
        if (arcBefore === 0) {
          expect(arcAfter, `target ${target}`).toBeCloseTo(0, 9);
          continue;
        }
        expect(Math.abs(arcAfter), `target ${target}`).toBeLessThan(Math.abs(arcBefore));
        expect(Math.sign(arcAfter), `target ${target}`).toBe(Math.sign(arcBefore));
      }
    });

    it('a target across the seam pulls the short way round (via 360), never the long way through the hue wheel', () => {
      // Graphite base is h≈200; local Skyscraper shift is ±120 so the pre-lean body can sit
      // anywhere — so assert the direction relative to the body actually produced.
      const id = 'lean-seam-id';
      const { body } = bodyBeforeLean(id);
      const variant = selectVariantFromSeed(id, pos.x, row).variant;
      const base = VARIANT_CONF[variant].colors.body;
      const target = ((body.h + 170) % 360 + 360) % 360; // 170° away — the short arc is +170, not −190
      const actor = createFactory(pos, row, 1, id, asShift, target);
      const after = shiftHSL(base, { hueShift: actor.config!.hueShift!, satShift: actor.config!.satShift! });
      // Half of +170 = +85 of travel in the positive direction.
      expect(hueArc(body.h, after.h)).toBeCloseTo(85, 6);
    });

    it('leaves every non-colour field identical with and without an accentTarget', () => {
      const without = createFactory(pos, row, 1, 'lean-rest-id', asShift);
      const withTarget = createFactory(pos, row, 1, 'lean-rest-id', asShift, 20);
      const { config: cW, ...restWithout } = without;
      const { config: cT, ...restWith } = withTarget;
      expect(restWith).toStrictEqual(restWithout);
      const { hueShift: _h1, satShift: _s1, ...cfgWithout } = cW!;
      const { hueShift: _h2, satShift: _s2, ...cfgWith } = cT!;
      expect(cfgWith).toStrictEqual(cfgWithout);
      expect(cT!.hueShift).not.toBe(cW!.hueShift); // the lean did land
    });
  });

  // docs/specs/WORLD_PALETTE_PULL.md §1.2 / docs/tasks/WORLD_PALETTE_PULL.md Task 4: placeDistrict
  // seeds the style's accent pair once and leans every factory toward one of the two.
  describe('accent lean (Phase 35) — placeDistrict pair and pick', () => {
    // (-100, -25) lands on the 'dense' district (60 factory actors across its 12 factory
    // rows) — picked so the "both targets are used somewhere" assertion below has enough
    // actors to make a real split likely, unlike a sparser district (e.g. 'habitat' at the
    // old (30, 30) fixture, which places only 2 factories and can land all-one-side by chance).
    const coords = { x: -100, y: -25 };
    const makeLocale = (id: string, attenuationStyleId: string) => ({
      id, attenuationStyleId, name: id, coordinates: coords,
      robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
    });

    /** Re-derives the pre-lean combined shift for a placed factory the way the system does.
     *  The AS component is re-sampled here with the system's own dataIds and ranges
     *  (AS_FACTORY_HUE/SAT_SHIFT_RANGE are private; the rowless-row test below already pins the
     *  ±30 range the same way) — a deliberate, DAMP duplication so this test can isolate the lean. */
    function preLean(actor: Actor, index: number, asMap: NoiseFunction2D) {
      const district = actor.config?.district ?? 'dense';
      const row = actor.config?.row ?? EXPECTED_DEFAULT_FACTORY_ROW;
      const local = selectVariantFromSeed(actor.id, actor.position.x, row, getRecipeRow(district, row)?.variants);
      const as = {
        hueShift: getSeededVal(asMap, 'factory.as.hueShift', index, -30, 30),
        satShift: getSeededVal(asMap, 'factory.as.satShift', index, -20, 20),
      };
      const combined = { hueShift: local.hueShift + as.hueShift, satShift: local.satShift + as.satShift };
      return { combined, body: shiftHSL(VARIANT_CONF[local.variant].colors.body, combined) };
    }

    it('two locales under the SAME Attenuation Style share one accent pair, and every placed factory leans toward exactly one of its two hues', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'as-pair-shared', name: 'as-pair-shared-name', locales: [] });
      useLocaleStore.getState().addLocale('as-pair-shared', makeLocale('locale-pair-1', 'as-pair-shared'));
      useLocaleStore.getState().addLocale('as-pair-shared', makeLocale('locale-pair-2', 'as-pair-shared'));
      const asMap = getAttenuationStyleNoiseMap('as-pair-shared', 'as-pair-shared-name');

      const pair = deriveAsAccentPair(asMap);
      expect(deriveAsAccentPair(asMap)).toEqual(pair); // stable across calls
      expect(pair.primary).not.toBe(pair.secondary);
      expect(ACCENT_HUES).toContain(pair.primary);
      expect(ACCENT_HUES).toContain(pair.secondary);

      const actors1 = placeDistrict('locale-pair-1');
      const actors2 = placeDistrict('locale-pair-2');
      expect(actors1.length).toBeGreaterThan(0);
      expect(actors1.map((a) => [a.config?.hueShift, a.config?.satShift])).toEqual(actors2.map((a) => [a.config?.hueShift, a.config?.satShift]));

      // 'dense' also places pylon actors (roadmap Phase 42 Task 12) interspersed among the
      // factories — filter to factories so `index` below still lines up with createFactory's own
      // factoryIndex (preLean's seeded AS-shift draw), not the actor array's raw position.
      const factories1 = actors1.filter((a) => a.type === ActorType.FACTORY);

      let leanedToPrimary = 0;
      let leanedToSecondary = 0;
      factories1.forEach((actor, index) => {
        const { combined, body } = preLean(actor, index, asMap);
        const leanPrimary = computeAccentLean(body, pair.primary);
        const leanSecondary = computeAccentLean(body, pair.secondary);
        const viaPrimary = combined.hueShift + leanPrimary.hueShift;
        const viaSecondary = combined.hueShift + leanSecondary.hueShift;
        const stored = actor.config!.hueShift!;
        const matchesPrimary = Math.abs(stored - viaPrimary) < 1e-9;
        const matchesSecondary = Math.abs(stored - viaSecondary) < 1e-9;
        expect(matchesPrimary || matchesSecondary, `factory ${index}: stored ${stored}, primary ${viaPrimary}, secondary ${viaSecondary}`).toBe(true);
        if (matchesPrimary) leanedToPrimary++; else leanedToSecondary++;
        // The saturation delta follows the SAME target's lean (warm-band cap included) — not a flat lift.
        const matchedLean = matchesPrimary ? leanPrimary : leanSecondary;
        expect(actor.config!.satShift!).toBeCloseTo(combined.satShift + matchedLean.satShift, 9);
      });
      // The seeded coin is a real split, not a constant — both targets are used somewhere in
      // a ~60-factory skyline.
      expect(leanedToPrimary).toBeGreaterThan(0);
      expect(leanedToSecondary).toBeGreaterThan(0);
    });

    it('two different Attenuation Styles draw different accent pairs (for the fixture names used by the AS-shift test above)', () => {
      const a = deriveAsAccentPair(getAttenuationStyleNoiseMap('as-planet-a', 'as-planet-alpha'));
      const b = deriveAsAccentPair(getAttenuationStyleNoiseMap('as-planet-b', 'as-planet-beta'));
      // 18 possible primaries — a collision is possible for some pair of names; if this ever
      // trips after a palette change, swap one fixture name here rather than weakening it.
      expect(a.primary).not.toBe(b.primary);
    });

    it("samples the style-level primary at a fixed NON-integer, non-zero offset — the simplex lattice-collapse guard (PROCEDURAL_GENERATION.md 'Gotchas')", () => {
      const spy = vi.spyOn(getSeededValModule, 'getSeededVal');
      try {
        deriveAsAccentPair(getAttenuationStyleNoiseMap('as-offset-guard', 'as-offset-guard-name'));
        const calls = spy.mock.calls.filter((c) => c[1] === 'factory.as.accentPrimary');
        expect(calls.length).toBeGreaterThan(0);
        for (const [, , offset] of calls) {
          expect(offset).not.toBe(0);
          expect(Number.isInteger(offset)).toBe(false);
        }
      } finally {
        spy.mockRestore();
      }
    });

    it('spread guard: across 50 real style seeds the primary covers at least 10 of the 18 accent hues', () => {
      // Real maps, not mocks — this measures the real hash of the dataId. If it fails, change
      // ACCENT_PAIR_OFFSET in factoryPlacementSystem.ts, never this threshold.
      const primaries = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const map = createNoise2D(alea(deriveAttenuationStyleSeed(`accent-spread-${i}`)));
        primaries.add(deriveAsAccentPair(map).primary);
      }
      expect(primaries.size).toBeGreaterThanOrEqual(10);
    });

    it('pickAccentTarget: a seeded value below 0.5 picks the primary, at/above 0.5 the secondary', () => {
      const pair = { primary: 100, secondary: 140 };
      const lowMap: NoiseFunction2D = () => -1; // getSeededVal maps -1 → 0
      const highMap: NoiseFunction2D = () => 1;  // and +1 → 1
      expect(pickAccentTarget(lowMap, pair, 0)).toBe(100);
      expect(pickAccentTarget(highMap, pair, 0)).toBe(140);
    });

    it('pickAccentTarget keys on the factory index, so neighbouring factories can differ under one real map', () => {
      const map = getAttenuationStyleNoiseMap('as-pick-index', 'as-pick-index-name');
      const pair = { primary: 100, secondary: 140 };
      const picks = new Set(Array.from({ length: 60 }, (_, i) => pickAccentTarget(map, pair, i)));
      expect(picks.size).toBe(2);
    });
  });

  describe('recolorActorsForAttenuationStyle', () => {
    beforeEach(() => {
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [] });
      placeDistrict(DEFAULT_LOCALE_ID);
    });

    it('changes only config.hueShift/config.satShift on every factory — everything else round-trips byte-identical', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'recolor-planet', name: 'recolor-planet-name', locales: [] });
      const before = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors;

      recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, 'recolor-planet', 'recolor-planet-name');

      const after = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors;
      expect(after.length).toBe(before.length);

      before.forEach((b, i) => {
        const a = after[i];
        expect(a.id).toBe(b.id);
        expect(a.position).toEqual(b.position);
        expect(a.scaleX).toBe(b.scaleX);
        expect(a.scaleY).toBe(b.scaleY);
        expect(a.rotation).toBe(b.rotation);
        expect(a.config?.row).toBe(b.config?.row);
        expect(a.config?.district).toBe(b.config?.district);
        expect(a.config?.rooftopGreeble).toBe(b.config?.rooftopGreeble);
        expect(a.config?.facadeGreeble).toBe(b.config?.facadeGreeble);
        expect(a.config?.beltCourseCount).toBe(b.config?.beltCourseCount);
        expect(a.config?.purpose).toBe(b.config?.purpose);
      });
    });

    it('is idempotent under repeated calls with the same AS (no drift)', () => {
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'idempotent-planet', name: 'idempotent-planet-name', locales: [] });

      recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, 'idempotent-planet', 'idempotent-planet-name');
      const first = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors;

      recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, 'idempotent-planet', 'idempotent-planet-name');
      const second = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors;

      expect(second).toEqual(first);
    });

    it('is a safe no-op on a locale with zero factories', () => {
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [] });
      expect(() =>
        recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, 'pelagos', 'pelagos-name')
      ).not.toThrow();
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors).toEqual([]);
    });

    it('is a safe no-op on a nonexistent locale id', () => {
      expect(() =>
        recolorActorsForAttenuationStyle('no-such-locale', 'pelagos', 'pelagos-name')
      ).not.toThrow();
    });

    // docs/specs/WORLD_PALETTE_PULL.md §1.3 (last paragraph) / docs/tasks/WORLD_PALETTE_PULL.md Task 5.
    describe('accent lean (Phase 35)', () => {
      const coords = { x: 44, y: -17 };
      const makeLocale = (id: string, attenuationStyleId: string) => ({
        id, attenuationStyleId, name: id, coordinates: coords,
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      });
      const styleA = { id: 'recolor-lean-a', name: 'recolor-lean-alpha' };
      const styleB = { id: 'recolor-lean-b', name: 'recolor-lean-beta' };

      function preLean(actor: Actor, index: number, asMap: NoiseFunction2D) {
        const district = actor.config?.district ?? 'dense';
        const row = actor.config?.row ?? EXPECTED_DEFAULT_FACTORY_ROW;
        const local = selectVariantFromSeed(actor.id, actor.position.x, row, getRecipeRow(district, row)?.variants);
        const as = {
          hueShift: getSeededVal(asMap, 'factory.as.hueShift', index, -30, 30),
          satShift: getSeededVal(asMap, 'factory.as.satShift', index, -20, 20),
        };
        const combined = { hueShift: local.hueShift + as.hueShift, satShift: local.satShift + as.satShift };
        return { combined, body: shiftHSL(VARIANT_CONF[local.variant].colors.body, combined) };
      }

      beforeEach(() => {
        useAttenuationStyleStore.getState().addAttenuationStyle({ ...styleA, locales: [] });
        useAttenuationStyleStore.getState().addAttenuationStyle({ ...styleB, locales: [] });
      });

      it("moves every factory onto the NEW style's accent pair, and off the old one", () => {
        const mapA = getAttenuationStyleNoiseMap(styleA.id, styleA.name);
        const mapB = getAttenuationStyleNoiseMap(styleB.id, styleB.name);
        const pairA = deriveAsAccentPair(mapA);
        const pairB = deriveAsAccentPair(mapB);
        // Precondition on the fixture names — the "off the old one" half is meaningless otherwise.
        expect(pairB.primary).not.toBe(pairA.primary);

        useLocaleStore.getState().addLocale(styleA.id, makeLocale('recolor-lean-locale', styleA.id));
        placeDistrict('recolor-lean-locale');

        recolorActorsForAttenuationStyle('recolor-lean-locale', styleB.id, styleB.name);
        const after = useLocaleStore.getState().locales['recolor-lean-locale'].actors.filter((a) => a.type === ActorType.FACTORY);
        expect(after.length).toBeGreaterThan(0);

        let offOldPair = 0;
        after.forEach((actor, index) => {
          const { combined, body } = preLean(actor, index, mapB);
          const stored = actor.config!.hueShift!;
          const leansB = [pairB.primary, pairB.secondary].map((p) => computeAccentLean(body, p));
          const matchedB = leansB.find((l) => Math.abs(stored - (combined.hueShift + l.hueShift)) < 1e-9);
          expect(matchedB, `factory ${index} not on pair B`).toBeDefined();
          // Saturation follows the matched target's own lean (warm-band cap included), not a flat lift.
          expect(actor.config!.satShift!).toBeCloseTo(combined.satShift + matchedB!.satShift, 9);
          const viaA = [pairA.primary, pairA.secondary].map((p) => combined.hueShift + computeAccentLean(body, p).hueShift);
          if (!viaA.some((v) => Math.abs(stored - v) < 1e-9)) offOldPair++;
        });
        // Parity-fixture rule: the two formulas must actually distinguish for at least one factory.
        expect(offOldPair).toBeGreaterThan(0);
      });

      it('equals a fresh placeDistrict under the new style at the same coordinates, factory for factory — the two write sites agree', () => {
        useLocaleStore.getState().addLocale(styleA.id, makeLocale('recolor-lean-from-a', styleA.id));
        useLocaleStore.getState().addLocale(styleB.id, makeLocale('recolor-lean-fresh-b', styleB.id));
        placeDistrict('recolor-lean-from-a');
        const fresh = placeDistrict('recolor-lean-fresh-b').filter((a) => a.type === ActorType.FACTORY);

        recolorActorsForAttenuationStyle('recolor-lean-from-a', styleB.id, styleB.name);
        const recolored = useLocaleStore.getState().locales['recolor-lean-from-a'].actors.filter((a) => a.type === ActorType.FACTORY);

        expect(recolored.map((a) => a.id)).toEqual(fresh.map((a) => a.id));
        recolored.forEach((a, i) => {
          expect(a.config?.hueShift, `factory ${i} hue`).toBeCloseTo(fresh[i].config!.hueShift!, 9);
          expect(a.config?.satShift, `factory ${i} sat`).toBeCloseTo(fresh[i].config!.satShift!, 9);
        });
      });
    });

    it("falls back to DEFAULT_FACTORY_ROW and district 'dense' when a factory's config.row/district are missing, matching Factory.tsx's own render-time fallback", () => {
      // Every real factory from createFactory/placeDistrict always has
      // config.row/config.district set, so this path is unreachable via the
      // public spawn API — exercised directly here with a hand-built actor
      // so the fallback itself has real coverage, not just a comment's word
      // for it.
      const rowlessActor: Actor = {
        id: 'rowless-actor', type: ActorType.FACTORY,
        position: { x: 100, y: 900 }, scaleX: 1, scaleY: 1, rotation: 0,
        isActive: true, cooldownRemaining: 0,
        config: { hueShift: 0, satShift: 0 }, // no `row`/`district` keys at all
      };
      useAttenuationStyleStore.getState().addAttenuationStyle({ id: 'rowless-planet', name: 'rowless-planet-name', locales: [] });
      useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [rowlessActor] });

      recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, 'rowless-planet', 'rowless-planet-name');

      const recolored = useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors[0];
      // Never invents a row — position/count/id/variant/row/greebles stay
      // untouched by recolor, this actor included; it round-trips absent.
      expect(recolored.config?.row).toBeUndefined();
      expect(recolored.config?.district).toBeUndefined();

      // The local (non-AS) component must match the fallback district/row's own
      // variant pool specifically — not some other row's. Isolate it by
      // subtracting the AS-only contribution, bounded by the reverted
      // baseline's own AS_FACTORY_HUE_SHIFT_RANGE ([-30, 30]): a wrong row
      // would very likely pick a different variant with a very different
      // base hue, pushing this delta far outside that window.
      const expectedAvailableTypes = getRecipeRow('dense', EXPECTED_DEFAULT_FACTORY_ROW)?.variants;
      const expectedLocal = selectVariantFromSeed(
        rowlessActor.id, rowlessActor.position.x, EXPECTED_DEFAULT_FACTORY_ROW, expectedAvailableTypes
      );
      const asOnlyHueDelta = (recolored.config?.hueShift ?? 0) - expectedLocal.hueShift;
      expect(Math.abs(asOnlyHueDelta)).toBeLessThanOrEqual(30);
    });

    // docs/specs/WORLD_VIEW_DISTRICTS.md §1.8 / roadmap Phase 42 Task 13: body-bearing scenery
    // (wall, tank) now folds and recolors exactly like a factory, via the shared foldBodyShift.
    describe('scenery (body-bearing families fold and recolor like factories)', () => {
      const styleA = { id: 'scenery-recolor-a', name: 'scenery-recolor-alpha' };
      const styleB = { id: 'scenery-recolor-b', name: 'scenery-recolor-beta' };

      /** Scans real coordinates with the real `pickDistrict` for one that lands on 'outskirts' —
       *  the only district whose recipe carries BOTH a wall row and a tank row alongside
       *  factories (districtRecipes.ts), so a single locale fixture exercises every
       *  foldBodyShift-folding kind at once. */
      function findOutskirtsCoords(): { x: number; y: number } {
        for (let x = -500; x <= 500; x += 5) {
          for (let y = -500; y <= 500; y += 5) {
            const map = getLocaleNoiseMap(`outskirts-scan-${x}-${y}`, x, y);
            if (pickDistrict(map) === 'outskirts') return { x, y };
          }
        }
        throw new Error('no outskirts coordinates found in scan range');
      }

      const makeLocale = (id: string, attenuationStyleId: string, coords: { x: number; y: number }) => ({
        id, attenuationStyleId, name: id, coordinates: coords,
        robots: [], actors: [], companies: [], currentMeasure: 0, createdAtMeasure: 0, dayStartTimestamp: Date.now(),
      });

      beforeEach(() => {
        useAttenuationStyleStore.getState().addAttenuationStyle({ ...styleA, locales: [] });
        useAttenuationStyleStore.getState().addAttenuationStyle({ ...styleB, locales: [] });
      });

      it('equals a fresh placeDistrict under the new style, actor for actor, for a locale with factories, walls AND tanks — the lean moved at least one actor ≥10° (parity-fixture rule)', () => {
        const coords = findOutskirtsCoords();
        useLocaleStore.getState().addLocale(styleA.id, makeLocale('scenery-recolor-from-a', styleA.id, coords));
        useLocaleStore.getState().addLocale(styleB.id, makeLocale('scenery-recolor-fresh-b', styleB.id, coords));

        const fromA = placeDistrict('scenery-recolor-from-a');
        const fresh = placeDistrict('scenery-recolor-fresh-b');

        // Precondition: the fixture really exercises wall AND tank, not just factories.
        expect(fromA.some((a) => a.config?.kind === 'wall')).toBe(true);
        expect(fromA.some((a) => a.config?.kind === 'tank')).toBe(true);

        recolorActorsForAttenuationStyle('scenery-recolor-from-a', styleB.id, styleB.name);
        const recolored = useLocaleStore.getState().locales['scenery-recolor-from-a'].actors;

        expect(recolored.map((a) => a.id)).toEqual(fresh.map((a) => a.id));
        let maxHueMove = 0;
        recolored.forEach((a, i) => {
          const label = `actor ${i} (${a.config?.kind ?? 'factory'})`;
          expect(a.config?.hueShift ?? 0, `${label} hue`).toBeCloseTo(fresh[i].config?.hueShift ?? 0, 9);
          expect(a.config?.satShift ?? 0, `${label} sat`).toBeCloseTo(fresh[i].config?.satShift ?? 0, 9);
          maxHueMove = Math.max(maxHueMove, Math.abs((a.config?.hueShift ?? 0) - (fromA[i].config?.hueShift ?? 0)));
        });
        // Parity-fixture rule (project memory): the two formulas must actually distinguish for
        // at least one actor, or an "equal" assertion above could pass with the lean disabled.
        expect(maxHueMove).toBeGreaterThanOrEqual(10);
      });

      it('mutation check: wall/tank actors are themselves recolored onto the new style (isolates scenery from the combined check above, which a factory alone could satisfy)', () => {
        const coords = findOutskirtsCoords();
        useLocaleStore.getState().addLocale(styleA.id, makeLocale('scenery-recolor-isolate', styleA.id, coords));
        const before = placeDistrict('scenery-recolor-isolate');
        const sceneryBefore = before.filter((a) => a.config?.kind === 'wall' || a.config?.kind === 'tank');
        expect(sceneryBefore.length).toBeGreaterThan(0);

        recolorActorsForAttenuationStyle('scenery-recolor-isolate', styleB.id, styleB.name);
        const after = useLocaleStore.getState().locales['scenery-recolor-isolate'].actors;

        const anySceneryShiftChanged = sceneryBefore.some((b) => {
          const a = after.find((candidate) => candidate.id === b.id)!;
          return a.config?.hueShift !== b.config?.hueShift || a.config?.satShift !== b.config?.satShift;
        });
        expect(anySceneryShiftChanged).toBe(true);
      });

      it('leaves every non-body-bearing scenery actor (boulder, pylon, turbine, …) completely untouched by recolor', () => {
        const coords = findOutskirtsCoords();
        useLocaleStore.getState().addLocale(styleA.id, makeLocale('scenery-recolor-structural', styleA.id, coords));
        const before = placeDistrict('scenery-recolor-structural');
        const structural = before.filter((a) => a.type === ActorType.SCENERY && !BODY_BEARING_BASE[a.config!.kind!]);
        expect(structural.length).toBeGreaterThan(0);

        recolorActorsForAttenuationStyle('scenery-recolor-structural', styleB.id, styleB.name);
        const after = useLocaleStore.getState().locales['scenery-recolor-structural'].actors;

        structural.forEach((b) => {
          const a = after.find((candidate) => candidate.id === b.id)!;
          expect(a).toEqual(b);
        });
      });

      it('is a safe no-op on a locale with zero scenery actors (only factories)', () => {
        useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [] });
        const factoryOnly: Actor = {
          id: 'factory-only-actor', type: ActorType.FACTORY,
          position: { x: 100, y: 900 }, scaleX: 1, scaleY: 1, rotation: 0,
          isActive: true, cooldownRemaining: 0,
          config: { row: 0, district: 'dense', hueShift: 0, satShift: 0 },
        };
        useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [factoryOnly] });
        expect(() => recolorActorsForAttenuationStyle(DEFAULT_LOCALE_ID, styleB.id, styleB.name)).not.toThrow();
      });
    });
  });
});
