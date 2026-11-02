import { describe, expect, it, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';

vi.mock('@/utils/getSeededVal', async (importOriginal) => {
  const { steerSeededDraws } = await import('./seededDraws');
  return steerSeededDraws(await importOriginal<typeof import('@/utils/getSeededVal')>());
});

import { constantNoiseMap, noiseMapForDataIds } from './seededDraws';
import { getCentredSeededVal, getSeededVal, getUniformSeededVal } from '@/utils/getSeededVal';

const DRAWS = { getSeededVal, getUniformSeededVal, getCentredSeededVal };
const real = await vi.importActual<typeof import('@/utils/getSeededVal')>('@/utils/getSeededVal');

describe('constantNoiseMap', () => {
  for (const [name, draw] of Object.entries(DRAWS)) {
    describe(name, () => {
      it('drives a raw -1 to the band min, 0 to its middle and 1 to its max', () => {
        expect(draw(constantNoiseMap(-1), 'k', 0, 10, 20)).toBe(10);
        expect(draw(constantNoiseMap(0), 'k', 0, 10, 20)).toBe(15);
        expect(draw(constantNoiseMap(1), 'k', 0, 10, 20)).toBe(20);
      });

      it('maps any raw value linearly, at any dataId and offset', () => {
        expect(draw(constantNoiseMap(0.5), 'robot.audio.attack', 7, -4, 4)).toBe(2);
        expect(draw(constantNoiseMap(-0.5), 'globalAudio.eq3.low', 400, -6, 6)).toBe(-3);
      });

      it('defaults the band to [0, 1]', () => {
        expect(draw(constantNoiseMap(-1), 'k')).toBe(0);
        expect(draw(constantNoiseMap(0), 'k')).toBe(0.5);
        expect(draw(constantNoiseMap(1), 'k')).toBe(1);
      });
    });
  }

  it('is still a noise map returning its raw value', () => {
    expect(constantNoiseMap(-0.25)(0.3, 12)).toBe(-0.25);
  });
});

describe('noiseMapForDataIds', () => {
  for (const [name, draw] of Object.entries(DRAWS)) {
    describe(name, () => {
      it('gives a named dataId its own raw value and every other dataId the fallback', () => {
        const map = noiseMapForDataIds({ a: -1 }, 1);
        expect(draw(map, 'a', 0, 10, 20)).toBe(10);
        expect(draw(map, 'b', 0, 10, 20)).toBe(20);
        expect(draw(map, 'a', 9, 10, 20)).toBe(10);
      });

      it('falls back to the middle of the band when no fallback is given', () => {
        const map = noiseMapForDataIds({ a: 1 });
        expect(draw(map, 'a', 0, 0, 8)).toBe(8);
        expect(draw(map, 'b', 0, 0, 8)).toBe(4);
      });

      it('steers several named dataIds independently', () => {
        const map = noiseMapForDataIds({ a: -1, b: 0, c: 1 }, -0.5);
        expect([draw(map, 'a'), draw(map, 'b'), draw(map, 'c'), draw(map, 'd')]).toEqual([0, 0.5, 1, 0.25]);
      });
    });
  }
});

describe('steerSeededDraws', () => {
  const maps = Array.from({ length: 40 }, (_, i) => createNoise2D(alea(`${i * 13 - 200}:${i * 7 - 90}`)));

  it('passes a real seeded map through to the real functions, value for value', () => {
    for (const map of maps) {
      expect(getSeededVal(map, 'k', 3, -2, 5)).toBe(real.getSeededVal(map, 'k', 3, -2, 5));
      expect(getUniformSeededVal(map, 'k', 3, -2, 5)).toBe(real.getUniformSeededVal(map, 'k', 3, -2, 5));
      expect(getUniformSeededVal(map, 'k')).toBe(real.getUniformSeededVal(map, 'k'));
      expect(getCentredSeededVal(map, 'k', 3, -2, 5)).toBe(real.getCentredSeededVal(map, 'k', 3, -2, 5));
      expect(getCentredSeededVal(map, 'k')).toBe(real.getCentredSeededVal(map, 'k'));
    }
  });

  it('passes a plain function stub (untagged) through to the real functions', () => {
    const stub = () => -1;
    expect(getUniformSeededVal(stub, 'k', 0, 10, 20)).toBe(real.getUniformSeededVal(stub, 'k', 0, 10, 20));
    expect(getCentredSeededVal(stub, 'k', 0, 10, 20)).toBe(real.getCentredSeededVal(stub, 'k', 0, 10, 20));
  });

  it('wraps the even and centred draws in spies that record their calls', () => {
    vi.mocked(getUniformSeededVal).mockClear();
    vi.mocked(getCentredSeededVal).mockClear();
    getUniformSeededVal(constantNoiseMap(0), 'u', 2, 0, 4);
    getCentredSeededVal(maps[0], 'c', 1);
    expect(vi.mocked(getUniformSeededVal).mock.calls).toEqual([[expect.any(Function), 'u', 2, 0, 4]]);
    expect(vi.mocked(getCentredSeededVal).mock.calls).toEqual([[maps[0], 'c', 1]]);
  });
});
