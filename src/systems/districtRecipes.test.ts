// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { RECIPES, DERELICT_RATIO, type DistrictRow } from './districtRecipes';
import { VARIANT_CONF } from '../components/actors/factoryVariants';
import type { DistrictName, SceneryKind } from '../types/Actor';

// ========================================
// CONSTANTS
// ========================================
const DISTRICT_NAMES: DistrictName[] = [
  'dense',
  'outskirts',
  'towers',
  'yard',
  'derelict',
  'habitat',
  'wreckfield',
  'ventfield',
  'construction',
];

const SCENERY_KINDS: SceneryKind[] = [
  'tank',
  'crane',
  'pylon',
  'wall',
  'beacon',
  'pipeline',
  'dome',
  'wreck',
  'turbine',
  'boulder',
  'vent',
  'containers',
  'scaffold',
  'tether',
  'floodlight',
  'dish',
];

// ========================================
// HELPERS
// ========================================
function allRows(): { district: DistrictName; row: DistrictRow }[] {
  const out: { district: DistrictName; row: DistrictRow }[] = [];
  for (const district of DISTRICT_NAMES) {
    for (const row of RECIPES[district]) {
      out.push({ district, row });
    }
  }
  return out;
}

// ========================================
// TEST SUITE
// ========================================
describe('districtRecipes', () => {
  it('has exactly the nine district names and no legacy', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...DISTRICT_NAMES].sort());
    expect(RECIPES).not.toHaveProperty('legacy');
  });

  it('every district has at least one row per depth', () => {
    for (const district of DISTRICT_NAMES) {
      const depths = new Set(RECIPES[district].map((r) => r.depth));
      expect(depths.has('background')).toBe(true);
      expect(depths.has('midground')).toBe(true);
      expect(depths.has('foreground')).toBe(true);
    }
  });

  describe('every row', () => {
    for (const { district, row } of allRows()) {
      const label = `${district} / ${row.kind} (${row.depth}, ${row.spread})`;

      it(`${label}: has a valid depth`, () => {
        expect(['background', 'midground', 'foreground']).toContain(row.depth);
      });

      it(`${label}: has a valid anchor`, () => {
        expect(['ridge', 'floor', 'ground', 'offscreen']).toContain(row.anchor);
      });

      it(`${label}: carries floorY iff anchor is 'floor', within its depth's band`, () => {
        if (row.anchor === 'floor') {
          expect(row.floorY).toBeDefined();
          if (row.depth === 'background') {
            expect(row.floorY).toBeGreaterThanOrEqual(980);
            expect(row.floorY).toBeLessThanOrEqual(1000);
          } else if (row.depth === 'midground') {
            expect(row.floorY).toBeGreaterThanOrEqual(1015);
            expect(row.floorY).toBeLessThanOrEqual(1030);
          } else {
            throw new Error("anchor 'floor' should only appear on background/midground rows");
          }
        } else {
          expect(row.floorY).toBeUndefined();
        }
      });

      it(`${label}: has a valid spread with its width field present`, () => {
        expect(['full', 'center', 'edges']).toContain(row.spread);
        if (row.spread === 'center') {
          expect(row.centerWidth).toBeDefined();
          expect(row.edgeWidth).toBeUndefined();
        } else if (row.spread === 'edges') {
          expect(row.edgeWidth).toBeDefined();
          expect(row.centerWidth).toBeUndefined();
        } else {
          expect(row.centerWidth).toBeUndefined();
          expect(row.edgeWidth).toBeUndefined();
        }
      });

      it(`${label}: has count >= 1`, () => {
        expect(row.count).toBeGreaterThanOrEqual(1);
      });

      it(`${label}: has a kind that is 'factory' or a known SceneryKind`, () => {
        if (row.kind !== 'factory') {
          expect(SCENERY_KINDS).toContain(row.kind);
        }
      });

      it(`${label}: factory rows carry at least one known variant`, () => {
        if (row.kind === 'factory') {
          expect(row.variants).toBeDefined();
          expect(row.variants!.length).toBeGreaterThanOrEqual(1);
          for (const v of row.variants!) {
            expect(Object.keys(VARIANT_CONF)).toContain(v);
          }
        } else {
          expect(row.variants).toBeUndefined();
        }
      });

      it(`${label}: any derelict override is within 0..1`, () => {
        if (row.derelict !== undefined) {
          expect(row.derelict).toBeGreaterThanOrEqual(0);
          expect(row.derelict).toBeLessThanOrEqual(1);
        }
      });
    }
  });

  it("anchor 'offscreen' appears only on foreground rows", () => {
    for (const { row } of allRows()) {
      if (row.anchor === 'offscreen') {
        expect(row.depth).toBe('foreground');
      }
    }
  });

  it("anchor 'ridge' appears only on background rows", () => {
    for (const { row } of allRows()) {
      if (row.anchor === 'ridge') {
        expect(row.depth).toBe('background');
      }
    }
  });

  it('habitat and construction rows all carry derelict: 0', () => {
    for (const row of RECIPES.habitat) {
      expect(row.derelict).toBe(0);
    }
    for (const row of RECIPES.construction) {
      expect(row.derelict).toBe(0);
    }
  });

  it('DERELICT_RATIO is 0.25', () => {
    expect(DERELICT_RATIO).toBe(0.25);
  });
});
