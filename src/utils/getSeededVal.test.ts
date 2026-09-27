import { describe, it, expect, vi } from 'vitest';
import type { NoiseFunction2D } from 'simplex-noise';

vi.mock('./seedUtils', () => ({
  getGlobalAttenuationStyleSeedOverride: vi.fn(() => null),
}));

import { precomputeDataX, getSeededVal } from './getSeededVal';
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
