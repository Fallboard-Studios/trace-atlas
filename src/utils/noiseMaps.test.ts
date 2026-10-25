// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { getLocaleNoiseMap, evictLocaleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';

// ========================================
// HELPERS
// ========================================

/** The roadmap's own documented worst-case coordinates under the OLD
 *  Attenuation-Style-sampled derivation, per docs/todo/roadmap.md § 5's Known Issue. */
const HISTORICALLY_BAD_COORDS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 1 },
  { x: 3.7, y: -8.2 },
];

const CONTROL_COORD = { x: 12.3456, y: 67.891 };

let localeCounter = 0;
/** Every call needs a fresh localeId so the module-scoped cache never
 *  interferes between assertions (getLocaleNoiseMap caches by id). */
function freshLocaleId(): string {
  localeCounter += 1;
  return `test-locale-${localeCounter}`;
}

// ========================================
// TESTS
// ========================================

describe('noiseMaps — getLocaleNoiseMap (decoupled from Attenuation Style)', () => {
  describe('Attenuation-Style-invariance', () => {
    it('produces identical getSeededVal output for two different locale ids at the same coordinates', () => {
      const { x, y } = CONTROL_COORD;
      const mapA = getLocaleNoiseMap(freshLocaleId(), x, y);
      const mapB = getLocaleNoiseMap(freshLocaleId(), x, y);

      const dataIds = ['robot.audio.attack', 'spawn.pos.x', 'melody.rand'];
      for (const dataId of dataIds) {
        expect(getSeededVal(mapA, dataId)).toBe(getSeededVal(mapB, dataId));
      }
    });

    it('produces identical output at a historically-bad coordinate too, not just the control point', () => {
      const { x, y } = HISTORICALLY_BAD_COORDS[0]; // (0, 0)
      const mapA = getLocaleNoiseMap(freshLocaleId(), x, y);
      const mapB = getLocaleNoiseMap(freshLocaleId(), x, y);

      expect(getSeededVal(mapA, 'robot.audio.attack')).toBe(getSeededVal(mapB, 'robot.audio.attack'));
    });
  });

  describe('dead-zone regression — historically-bad coordinates no longer collapse', () => {
    it.each(HISTORICALLY_BAD_COORDS)('($x, $y) yields 8 distinct getSeededVal results across 8 different dataIds', ({ x, y }) => {
      const map = getLocaleNoiseMap(freshLocaleId(), x, y);
      const dataIds = Array.from({ length: 8 }, (_, i) => `deadzone.check.${i}`);
      const values = dataIds.map((dataId) => getSeededVal(map, dataId));

      expect(new Set(values).size).toBe(8);
    });
  });

  describe('distinctness across coordinates', () => {
    it('the 4 historically-bad coordinates plus a control point all produce mutually distinct noise maps', () => {
      const points = [...HISTORICALLY_BAD_COORDS, CONTROL_COORD];
      const samples = points.map(({ x, y }) => {
        const map = getLocaleNoiseMap(freshLocaleId(), x, y);
        return getSeededVal(map, 'distinctness.probe');
      });

      expect(new Set(samples).size).toBe(points.length);
    });
  });

  describe('caching', () => {
    it('returns the cached map for a repeated locale id even if x/y differ on the second call', () => {
      const id = freshLocaleId();
      const first = getLocaleNoiseMap(id, 1, 2);
      const second = getLocaleNoiseMap(id, 999, 999); // different coords, same id — should be ignored

      expect(getSeededVal(second, 'cache.probe')).toBe(getSeededVal(first, 'cache.probe'));

      evictLocaleNoiseMap(id);
    });
  });
});
