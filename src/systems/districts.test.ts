// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { DISTRICT_NAMES, SHIPPED_SCENERY, pickDistrict, placeDistrict, isGemGatedRow } from './districts';
import * as getSeededValModule from '../utils/getSeededVal';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getRecipeRow } from './factoryPlacementSystem';
import { selectVariantFromSeed } from '../components/actors/factoryVariants';
import { getTerrainProfile, ridgeYAt, groundYAt, __clearTerrainProfileCache } from './terrainProfile';
import { RECIPES, COVERAGE_TOP_UP, coverageTopUpRow } from './districtRecipes';
import { useLocaleStore } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { ActorType, type Actor, type DistrictName } from '../types/Actor';

// ========================================
// HELPERS
// ========================================

/** Registers a fresh locale at the given coordinates and returns its id. */
function registerLocale(id: string, x: number, y: number): string {
  useLocaleStore.getState().addLocale('pelagos', {
    id,
    attenuationStyleId: 'pelagos',
    name: id,
    coordinates: { x, y },
    dayStartTimestamp: Date.now(),
    createdAtMeasure: 0,
    robots: [],
    actors: [],
    companies: [],
    currentMeasure: 0,
  });
  return id;
}

/**
 * Scans real coordinates with the REAL `pickDistrict` (no mocking — same-module
 * self-spying doesn't intercept districts.ts's own internal call to its own
 * export, confirmed empirically) to find `count` distinct (x, y) pairs that
 * land on `district`. Fast: the whole 9-district, 20-each table resolves in
 * ~250 scanned points thanks to Task 3's spread fix.
 */
function findCoordsForDistrict(district: DistrictName, count: number): Array<{ x: number; y: number }> {
  const results: Array<{ x: number; y: number }> = [];
  for (let x = -500; x <= 500 && results.length < count; x += 5) {
    for (let y = -500; y <= 500 && results.length < count; y += 5) {
      const map = getLocaleNoiseMap(`scan-${x}-${y}`, x, y);
      if (pickDistrict(map) === district) results.push({ x, y });
    }
  }
  return results;
}

/** Places `count` real, differently-seeded locales that land on `district`. */
function placeDistrictSeeds(district: DistrictName, count: number, namePrefix: string): Actor[][] {
  const coords = findCoordsForDistrict(district, count);
  expect(coords.length).toBe(count); // fail loudly if a district can't be found, rather than silently running fewer seeds
  return coords.map(({ x, y }, i) => {
    const id = registerLocale(`${namePrefix}-${district}-${i}`, x, y);
    return placeDistrict(id);
  });
}

// ========================================
// TEST SUITE
// ========================================
describe('districts', () => {
  beforeEach(() => {
    __clearTerrainProfileCache();
    useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors: [] });
  });

  describe('DISTRICT_NAMES', () => {
    it('is the nine names, in spec order, with no "legacy"', () => {
      expect(DISTRICT_NAMES).toEqual([
        'dense',
        'outskirts',
        'towers',
        'yard',
        'derelict',
        'habitat',
        'wreckfield',
        'ventfield',
        'construction',
      ]);
    });
  });

  describe('pickDistrict', () => {
    it('never returns an out-of-range result, however the draws land', () => {
      for (const fixed of [0, 1, 0.5]) {
        vi.spyOn(getSeededValModule, 'getSeededVal').mockReturnValue(fixed);
        expect(DISTRICT_NAMES).toContain(pickDistrict((() => 0) as unknown as NoiseFunction2D));
        vi.restoreAllMocks();
      }
    });

    it('is deterministic for the same noise map', () => {
      const map = createNoise2D(alea('districts-determinism-fixture'));
      expect(pickDistrict(map)).toBe(pickDistrict(map));
    });

    it('draws only on its own dataId, independent of every other draw, at three distinct non-integer offsets', () => {
      const spy = vi.spyOn(getSeededValModule, 'getSeededVal');
      try {
        const map = createNoise2D(alea('districts-dataid-fixture'));
        pickDistrict(map);
        const calls = spy.mock.calls.filter((c) => c[1] === 'locale.district');
        expect(calls.length).toBe(3);
        const offsets = new Set<number>();
        for (const [, , offset, min, max] of calls) {
          expect(min).toBe(0);
          expect(max).toBe(1);
          offsets.add(offset as number);
        }
        expect(offsets.size).toBe(3);
        const nonIntegerCount = [...offsets].filter((o) => !Number.isInteger(o)).length;
        expect(nonIntegerCount).toBeGreaterThanOrEqual(2);
      } finally {
        spy.mockRestore();
      }
    });

    it('over a 121-coordinate grid of real locale maps, every district appears at least 8 times', () => {
      const coords = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
      const counts = new Map<string, number>();
      for (const x of coords) {
        for (const y of coords) {
          const map = getLocaleNoiseMap(`districts-spread-${x}-${y}`, x, y);
          const district = pickDistrict(map);
          counts.set(district, (counts.get(district) ?? 0) + 1);
        }
      }
      expect(coords.length * coords.length).toBe(121);
      for (const name of DISTRICT_NAMES) {
        expect(counts.get(name) ?? 0).toBeGreaterThanOrEqual(8);
      }
    });

    it('mutation check: collapsing to a single offset-0 draw fails the spread case above', () => {
      const singleDrawPick = (noiseMap: NoiseFunction2D): string => {
        const v = getSeededValModule.getSeededVal(noiseMap, 'locale.district', 0, 0, 1);
        const index = Math.min(DISTRICT_NAMES.length - 1, Math.floor(v * DISTRICT_NAMES.length));
        return DISTRICT_NAMES[index];
      };
      const coords = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
      const counts = new Map<string, number>();
      for (const x of coords) {
        for (const y of coords) {
          const map = getLocaleNoiseMap(`districts-mutation-${x}-${y}`, x, y);
          const district = singleDrawPick(map);
          counts.set(district, (counts.get(district) ?? 0) + 1);
        }
      }
      const min = Math.min(...DISTRICT_NAMES.map((name) => counts.get(name) ?? 0));
      expect(min).toBeLessThan(8);
    });
  });

  describe('SHIPPED_SCENERY', () => {
    it('is all sixteen SceneryKinds, as of roadmap Phase 42 Tasks 11-17 (D2 complete)', () => {
      expect(SHIPPED_SCENERY).toEqual(new Set([
        'wall', 'pylon', 'beacon', 'boulder', 'tank', 'dome', 'scaffold', 'containers',
        'crane', 'pipeline', 'turbine', 'tether', 'floodlight', 'dish', 'wreck', 'vent',
      ]));
    });
  });

  describe('isGemGatedRow', () => {
    it('gates only beacon, and only when gems are off (§1.9: "placed nothing when gems off")', () => {
      expect(isGemGatedRow('beacon', false)).toBe(true);
      expect(isGemGatedRow('beacon', true)).toBe(false);
      expect(isGemGatedRow('wall', false)).toBe(false);
      expect(isGemGatedRow('pylon', false)).toBe(false);
      expect(isGemGatedRow('factory', false)).toBe(false);
    });
  });

  describe('placeDistrict', () => {
    it('writes actors to the given localeId, not a hardcoded default', () => {
      const otherLocale = registerLocale('other-locale', 5, 5);
      placeDistrict(otherLocale);

      expect(useLocaleStore.getState().locales['other-locale'].actors.length).toBeGreaterThan(0);
      expect(useLocaleStore.getState().locales[DEFAULT_LOCALE_ID].actors).toEqual([]);
    });

    it('is deterministic: the same locale produces byte-identical actors on repeated calls', () => {
      const id = registerLocale('determinism-locale', 11, 22);
      const first = placeDistrict(id);
      const second = placeDistrict(id);
      expect(second).toEqual(first);
    });

    describe('every district, 20 seeds', () => {
      for (const district of DISTRICT_NAMES) {
        it(`${district}: every actor carries config.district/.row, matches its row's kind (factory vs. shipped scenery), count per row <= recipe count`, () => {
          const placements = placeDistrictSeeds(district, 20, 'basic');
          // Recipe rows, then one row per coverage top-up (Phase 43 Task 12).
          const rowCount = RECIPES[district].length + COVERAGE_TOP_UP[district].length;

          for (const actors of placements) {
            const countPerRow = new Map<number, number>();
            for (const actor of actors) {
              expect(actor.config?.district).toBe(district);
              expect(actor.config?.row).toBeGreaterThanOrEqual(0);
              expect(actor.config?.row).toBeLessThan(rowCount);
              const row = actor.config!.row!;
              const rowKind = getRecipeRow(district, row)!.kind;
              expect(SHIPPED_SCENERY.has(rowKind as never) || rowKind === 'factory').toBe(true);
              expect(actor.type).toBe(rowKind === 'factory' ? ActorType.FACTORY : ActorType.SCENERY);
              if (actor.type === ActorType.SCENERY) expect(actor.config?.kind).toBe(rowKind);
              countPerRow.set(row, (countPerRow.get(row) ?? 0) + 1);
            }
            for (const [row, count] of countPerRow) {
              expect(count).toBeLessThanOrEqual(getRecipeRow(district, row)!.count);
            }
          }
        });
      }
    });

    it('ground-lock invariant: every actor base sits on its anchor profile, never floating', () => {
      for (const district of DISTRICT_NAMES) {
        const coords = findCoordsForDistrict(district, 5);

        coords.forEach(({ x, y }, i) => {
          const id = registerLocale(`groundlock-${district}-${i}`, x, y);
          const actors = placeDistrict(id);
          const noiseMap = getLocaleNoiseMap(id, x, y);
          const profile = getTerrainProfile(id, noiseMap);

          for (const actor of actors) {
            const row = getRecipeRow(district, actor.config!.row!)!;
            if (row.anchor === 'ridge') {
              expect(Math.abs(actor.position.y - ridgeYAt(profile.ridge, actor.position.x))).toBeLessThanOrEqual(0.5);
            } else if (row.anchor === 'ground') {
              expect(Math.abs(actor.position.y - groundYAt(profile.ground, actor.position.x))).toBeLessThanOrEqual(0.5);
            } else if (row.anchor === 'floor') {
              expect(actor.position.y).toBe(row.floorY);
            } else {
              expect(actor.position.y).toBeGreaterThanOrEqual(1080);
            }
          }
        });
      }
    });

    it('mutation check: resolving ground to a fixed 1050 fails the ground-lock invariant', () => {
      const [{ x, y }] = findCoordsForDistrict('dense', 1);
      const id = registerLocale('groundlock-mutation', x, y);
      const actors = placeDistrict(id);
      const noiseMap = getLocaleNoiseMap(id, x, y);
      const profile = getTerrainProfile(id, noiseMap);
      const recipe = RECIPES.dense;

      // Simulate the bug: every ground-anchored actor's y "resolved" to a
      // fixed 1050 instead of groundYAt(x) — must NOT match the real
      // (stepped) profile everywhere, or this check can't catch a regression.
      const groundActors = actors.filter((a) => recipe[a.config!.row!].anchor === 'ground');
      expect(groundActors.length).toBeGreaterThan(0);
      const matchesFixedEverywhere = groundActors.every((a) => Math.abs(groundYAt(profile.ground, a.position.x) - 1050) <= 0.5);
      expect(matchesFixedEverywhere).toBe(false);
    });

    describe('derelict', () => {
      it('row override 1 marks every item of that row derelict; row override 0 marks none', () => {
        const [{ x, y }] = findCoordsForDistrict('dense', 1);
        const row0 = RECIPES.dense[0]; // a factory row with no override by default
        const original = row0.derelict;
        try {
          row0.derelict = 1;
          const id1 = registerLocale('derelict-override-1', x, y);
          const allActors1 = placeDistrict(id1);
          const row0Actors1 = allActors1.filter((a) => a.config?.row === 0);
          expect(row0Actors1.length).toBeGreaterThan(0);
          expect(row0Actors1.every((a) => a.config?.derelict === true)).toBe(true);

          row0.derelict = 0;
          const id0 = registerLocale('derelict-override-0', x, y);
          const allActors0 = placeDistrict(id0);
          const row0Actors0 = allActors0.filter((a) => a.config?.row === 0);
          expect(row0Actors0.length).toBeGreaterThan(0);
          expect(row0Actors0.every((a) => a.config?.derelict === undefined)).toBe(true);
        } finally {
          row0.derelict = original;
        }
      });

      it('default ratio 0.25: the 20-seed mean fraction of derelict actors is 0.15-0.35', () => {
        // Every dense row carries no per-row override, so DERELICT_RATIO (0.25) applies uniformly.
        expect(RECIPES.dense.every((r) => r.derelict === undefined)).toBe(true);
        const placements = placeDistrictSeeds('dense', 20, 'derelict-default');
        let derelictCount = 0;
        let total = 0;
        for (const actors of placements) {
          for (const a of actors) {
            total++;
            if (a.config?.derelict) derelictCount++;
          }
        }
        expect(total).toBeGreaterThan(0);
        const mean = derelictCount / total;
        expect(mean).toBeGreaterThanOrEqual(0.15);
        expect(mean).toBeLessThanOrEqual(0.35);
      });

      it('draws from its own dataId at a distinct offset per actor (actorIndex)', () => {
        const spy = vi.spyOn(getSeededValModule, 'getSeededVal');
        try {
          const [{ x, y }] = findCoordsForDistrict('habitat', 1); // every habitat row is derelict: 0
          const id = registerLocale('derelict-dataid-check', x, y);
          placeDistrict(id);
          const calls = spy.mock.calls.filter((c) => c[1] === 'actor.derelict');
          expect(calls.length).toBeGreaterThan(0);
          const offsets = calls.map((c) => c[2]);
          expect(new Set(offsets).size).toBe(offsets.length); // every draw at a distinct offset
        } finally {
          spy.mockRestore();
        }
      });

      it('wall is not derelict-capable: no wall actor ever carries config.derelict', () => {
        // 'derelict' and 'outskirts' both carry a wall row, so this exercises the shipped
        // non-capable kind directly rather than only documenting the absence of one (D1's
        // version of this test, before Task 11 shipped wall).
        const placements = [
          ...placeDistrictSeeds('derelict', 5, 'derelict-capability-wall'),
          ...placeDistrictSeeds('outskirts', 5, 'derelict-capability-wall'),
        ];
        const wallActors = placements.flatMap((actors) => actors.filter((a) => a.config?.kind === 'wall'));
        expect(wallActors.length).toBeGreaterThan(0);
        expect(wallActors.every((a) => a.config?.derelict === undefined)).toBe(true);
      });

      it('wreck is not derelict-capable: no wreck actor ever carries config.derelict (always-derelict is the renderer\'s own rule, not a flag — roadmap Phase 42 Task 17, §1.6/§1.9)', () => {
        // 'derelict' and 'wreckfield' both carry a wreck row.
        const placements = [
          ...placeDistrictSeeds('derelict', 5, 'derelict-capability-wreck'),
          ...placeDistrictSeeds('wreckfield', 5, 'derelict-capability-wreck'),
        ];
        const wreckActors = placements.flatMap((actors) => actors.filter((a) => a.config?.kind === 'wreck'));
        expect(wreckActors.length).toBeGreaterThan(0);
        expect(wreckActors.every((a) => a.config?.derelict === undefined)).toBe(true);
      });
    });
  });

  // Roadmap Phase 42 Task 5: Factory.tsx/factoryBubbleProps.ts resolve a factory's variant at
  // render time via getRecipeRow(actor.config.district, actor.config.row)?.variants —
  // placeDistrict (above) must pass that SAME row's own `variants` into createFactory at spawn
  // time, or the two resolutions silently diverge (the "spawn and render agree" guarantee
  // createFactory's own doc comment makes).
  describe('spawn and render agree (roadmap Phase 42 Task 5)', () => {
    it('for every factory row of every district, the variant selectVariantFromSeed resolves at render time (filtered by getRecipeRow) matches the variant stored at placement', () => {
      for (const district of DISTRICT_NAMES) {
        const [{ x, y }] = findCoordsForDistrict(district, 1);
        const id = registerLocale(`spawn-render-agree-${district}`, x, y);
        const actors = placeDistrict(id).filter((a) => a.type === ActorType.FACTORY);
        expect(actors.length).toBeGreaterThan(0);

        for (const actor of actors) {
          const row = actor.config!.row!;
          const availableTypes = getRecipeRow(district, row)?.variants;
          const rendered = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
          expect(rendered.purpose).toBe(actor.config?.purpose);
        }
      }
    });

    it("mutation check: comparing against a DIFFERENT row's variant filter fails the agreement case, so this guard really is sensitive to which row's recipe is consulted", () => {
      const [{ x, y }] = findCoordsForDistrict('dense', 1);
      const id = registerLocale('spawn-render-agree-mutation', x, y);
      const actors = placeDistrict(id).filter((a) => a.type === ActorType.FACTORY);
      const recipeLength = RECIPES.dense.length;

      const mismatches = actors.filter((actor) => {
        const row = actor.config!.row!;
        const wrongRow = (row + 1) % recipeLength; // deliberately the wrong row's recipe
        const availableTypes = getRecipeRow('dense', wrongRow)?.variants;
        const rendered = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
        return rendered.purpose !== actor.config?.purpose;
      });
      expect(mismatches.length).toBeGreaterThan(0);
    });
  });

  describe('getRecipeRow', () => {
    it('returns dense row 0', () => {
      expect(getRecipeRow('dense', 0)).toEqual(RECIPES.dense[0]);
    });

    it('rows past the recipe resolve to the coverage top-ups, in list order (Phase 43 Task 12)', () => {
      const n = RECIPES.wreckfield.length;
      COVERAGE_TOP_UP.wreckfield.forEach((t, i) => {
        expect(getRecipeRow('wreckfield', n + i)).toEqual(coverageTopUpRow(t));
      });
    });

    it('returns null for an out-of-range row (below 0, or past the last top-up)', () => {
      expect(getRecipeRow('dense', -1)).toBeNull();
      expect(getRecipeRow('dense', RECIPES.dense.length + COVERAGE_TOP_UP.dense.length)).toBeNull();
    });
  });
});
