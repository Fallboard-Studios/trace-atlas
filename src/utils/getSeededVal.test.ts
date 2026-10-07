import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';

vi.mock('./seedUtils', () => ({
  getGlobalAttenuationStyleSeedOverride: vi.fn(() => null),
}));

import { precomputeDataX, getSeededVal, getUniformSeededVal } from './getSeededVal';
import { getGlobalAttenuationStyleSeedOverride } from './seedUtils';

describe('precomputeDataX', () => {
  it('is deterministic — the same dataId produces the same output on repeated calls', () => {
    expect(precomputeDataX('robots.audioAttributes.waveform')).toBe(
      precomputeDataX('robots.audioAttributes.waveform'),
    );
  });

  it('produces a different output for a different dataId', () => {
    expect(precomputeDataX('a')).not.toBe(precomputeDataX('b'));
  });

  it('folds the global seed override into the key — two different overrides produce two different outputs for the same dataId', () => {
    const mocked = vi.mocked(getGlobalAttenuationStyleSeedOverride);

    mocked.mockReturnValue('seed-one');
    const withSeedOne = precomputeDataX('robots.spawn.index');

    mocked.mockReturnValue('seed-two');
    const withSeedTwo = precomputeDataX('robots.spawn.index');

    expect(withSeedOne).not.toBe(withSeedTwo);

    mocked.mockReturnValue(null);
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
});
