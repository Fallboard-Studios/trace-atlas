// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { DISTRICT_NAMES, pickDistrict } from './districts';
import * as getSeededValModule from '../utils/getSeededVal';
import { getLocaleNoiseMap } from '../utils/noiseMaps';

// ========================================
// TEST SUITE
// ========================================
describe('districts', () => {
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
      // 0 and 1 are the extremes getSeededVal can return (min/max of its own
      // output range); every draw combination must still resolve to one of
      // the nine names, not undefined.
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
      // Three draws, not one: a single offset-0 draw on raw simplex noise
      // is bell-curve biased (starves the edge districts across many
      // locales, see districts.ts doc comment) and doesn't clear this
      // file's own spread test below. Combining three draws at different
      // offsets flattens it.
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
        // at least two of the three must be non-integer, or the lattice
        // collapse this scheme exists to avoid could recur
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
      // Characterizes the bug this scheme fixes. If pickDistrict ever
      // regresses to one getSeededVal(noiseMap, 'locale.district', 0, 0, 1)
      // draw, this reproduces the starvation measured in districts.ts's
      // doc comment.
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
});
