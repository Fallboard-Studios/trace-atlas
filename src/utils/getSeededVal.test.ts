import { beforeAll, describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

import { precomputeDataX, getSeededVal, getUniformSeededVal, getCentredSeededVal } from './getSeededVal';

describe('precomputeDataX', () => {
  it('is deterministic — the same dataId produces the same output on repeated calls', () => {
    expect(precomputeDataX('robots.audioAttributes.waveform')).toBe(
      precomputeDataX('robots.audioAttributes.waveform'),
    );
  });

  it('produces a different output for a different dataId', () => {
    expect(precomputeDataX('a')).not.toBe(precomputeDataX('b'));
  });
});

describe('getSeededVal', () => {
  function stubNoiseMap(returnValue: number): NoiseFunction2D {
    return () => returnValue;
  }

  it('maps a raw -1 to exactly min', () => {
    expect(getSeededVal(stubNoiseMap(-1), 'k', 0, 10, 20)).toBe(10);
  });

  it('maps a raw 1 to exactly max', () => {
    expect(getSeededVal(stubNoiseMap(1), 'k', 0, 10, 20)).toBe(20);
  });

  it('maps a raw 0 to the midpoint', () => {
    expect(getSeededVal(stubNoiseMap(0), 'k', 0, 10, 20)).toBe(15);
  });

  it('defaults offset to 0, min to 0, and max to 1', () => {
    expect(getSeededVal(stubNoiseMap(0), 'k')).toBe(0.5);
    expect(getSeededVal(stubNoiseMap(-1), 'k')).toBe(0);
    expect(getSeededVal(stubNoiseMap(1), 'k')).toBe(1);
  });
});

describe('getUniformSeededVal', () => {
  const GRID_AXIS = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
  const worldMaps = GRID_AXIS.flatMap((x) => GRID_AXIS.map((y) => createNoise2D(alea(`${x}:${y}`))));

  it('is alea() over three getSeededVal samples at offset + [0, 137.42, 911.77], joined by ":"', () => {
    const noiseMap = worldMaps[17];
    const samples = [0, 137.42, 911.77].map((s) => getSeededVal(noiseMap, 'k', 5 + s, 0, 1));
    expect(getUniformSeededVal(noiseMap, 'k', 5)).toBe(alea(samples.join(':'))());
  });

  it('defaults offset to 0 and stays in [0, 1)', () => {
    for (const noiseMap of worldMaps) {
      const v = getUniformSeededVal(noiseMap, 'k');
      expect(v).toBe(getUniformSeededVal(noiseMap, 'k', 0));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('spreads across worlds at offset 0, where one getSeededVal sample barely moves', () => {
    const distinct = (vals: number[]) => new Set(vals.map((v) => Math.round(v * 1000))).size;
    expect(distinct(worldMaps.map((m) => getSeededVal(m, 'locale.coverage.x', 0, 0, 1)))).toBeLessThan(10);
    expect(distinct(worldMaps.map((m) => getUniformSeededVal(m, 'locale.coverage.x', 0)))).toBeGreaterThan(110);
  });

  describe('with a band', () => {
    it('maps the unbanded draw linearly onto [min, max), at the same dataId and offset', () => {
      for (const noiseMap of worldMaps) {
        const t = getUniformSeededVal(noiseMap, 'robot.audio.attack', 3);
        const v = getUniformSeededVal(noiseMap, 'robot.audio.attack', 3, 10, 20);
        expect(v).toBeCloseTo(10 + t * 10, 12);
        expect(v).toBeGreaterThanOrEqual(10);
        expect(v).toBeLessThan(20);
      }
    });

    it('maps onto a band below zero', () => {
      for (const noiseMap of worldMaps) {
        const t = getUniformSeededVal(noiseMap, 'k', 0);
        const v = getUniformSeededVal(noiseMap, 'k', 0, -6, -2);
        expect(v).toBeCloseTo(-6 + t * 4, 12);
        expect(v).toBeGreaterThanOrEqual(-6);
        expect(v).toBeLessThan(-2);
      }
    });

    it('returns min for a zero-width band', () => {
      for (const noiseMap of worldMaps) expect(getUniformSeededVal(noiseMap, 'k', 2, 7, 7)).toBe(7);
    });

    it('is exactly the unbanded draw for the band [0, 1]', () => {
      for (const noiseMap of worldMaps) {
        expect(getUniformSeededVal(noiseMap, 'k', 4, 0, 1)).toBe(getUniformSeededVal(noiseMap, 'k', 4));
      }
    });
  });
});

describe('getCentredSeededVal', () => {
  const WORLDS = 3000;
  const seedRng = alea('getCentredSeededVal.test');
  const worldMaps = Array.from({ length: WORLDS }, () => {
    const x = Math.floor(seedRng() * 20000) - 10000;
    const y = Math.floor(seedRng() * 20000) - 10000;
    return createNoise2D(alea(`${x}:${y}`));
  });

  it('is the mean of the even draws at the dataId and the dataId + ".centre", same offset, mapped onto the band', () => {
    for (const noiseMap of worldMaps.slice(0, 200)) {
      const a = getUniformSeededVal(noiseMap, 'eq3.low', 7);
      const b = getUniformSeededVal(noiseMap, 'eq3.low.centre', 7);
      expect(getCentredSeededVal(noiseMap, 'eq3.low', 7, -6, 6)).toBeCloseTo(-6 + ((a + b) / 2) * 12, 12);
    }
  });

  it('defaults offset to 0 and the band to [0, 1]', () => {
    for (const noiseMap of worldMaps.slice(0, 200)) {
      const a = getUniformSeededVal(noiseMap, 'k', 0);
      const b = getUniformSeededVal(noiseMap, 'k.centre', 0);
      expect(getCentredSeededVal(noiseMap, 'k')).toBeCloseTo((a + b) / 2, 12);
    }
  });

  it('returns min for a zero-width band', () => {
    for (const noiseMap of worldMaps.slice(0, 200)) expect(getCentredSeededVal(noiseMap, 'k', 3, 4, 4)).toBe(4);
  });

  describe('over 3,000 seeded worlds, it is a triangle peaking at the middle of the band', () => {
    const MIN = -5;
    const MAX = 5;
    let values: number[] = [];
    beforeAll(() => {
      values = worldMaps.map((m) => getCentredSeededVal(m, 'robot.audio.detune', 0, MIN, MAX));
    });
    const fraction = (lo: number, hi: number) => values.filter((v) => v >= lo && v < hi).length / WORLDS;

    it('stays in [min, max)', () => {
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(MIN);
        expect(v).toBeLessThan(MAX);
      }
    });

    it('has its median within 2 % of the band from the middle', () => {
      const median = [...values].sort((p, q) => p - q)[WORLDS / 2];
      expect(Math.abs(median)).toBeLessThan(0.02 * (MAX - MIN));
    });

    it('puts 1–3.5 % of draws in each outer tenth (a triangle gives 2 %)', () => {
      for (const share of [fraction(MIN, MIN + 1), fraction(MAX - 1, MAX)]) {
        expect(share).toBeGreaterThanOrEqual(0.01);
        expect(share).toBeLessThanOrEqual(0.035);
      }
    });

    it('puts 30–42 % of draws in the middle fifth (a triangle gives 36 %)', () => {
      const share = fraction(-1, 1);
      expect(share).toBeGreaterThanOrEqual(0.3);
      expect(share).toBeLessThanOrEqual(0.42);
    });
  });
});
