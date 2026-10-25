// ========================================
// IMPORTS
// ========================================
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateWorldSeedBaseline } from './seedBaseline';
import * as globalAudioSeed from './globalAudioSeed';
import { generateAttenuationStyleBpm } from './bpmSeed';
import { evictAttenuationStyleNoiseMap, getAttenuationStyleNoiseMap } from './noiseMaps';

// ========================================
// FIXTURES
// ========================================

const NAME = 'n40dh8p8';
const SCRATCH_ID = '__world-link__';

/** The eight generators called directly, under an id of the test's own choosing. */
function directBaseline(id: string, name: string) {
  return {
    globalAudio: globalAudioSeed.generateGlobalAudioSettings(id, name),
    lfoBank: globalAudioSeed.generateLfoBankSettings(id, name),
    globalLfoLinks: globalAudioSeed.generateGlobalLfoLinks(id, name),
    bpm: generateAttenuationStyleBpm(id, name),
    swellFrequency: globalAudioSeed.generateSwellFrequency(id, name),
    swellDuration: globalAudioSeed.generateSwellDuration(id, name),
    humanize: globalAudioSeed.generateHumanize(id, name),
    pingVarianceAutomation: globalAudioSeed.generatePingVarianceAutomation(id, name),
  };
}

/** One sample off the map the cache holds for `id`, built under `name` only if `id` is not cached. */
function firstSample(id: string, name: string): number {
  return getAttenuationStyleNoiseMap(id, name)(0.37, 0.61);
}

// ========================================
// TEST SUITE
// ========================================

describe('generateWorldSeedBaseline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const id of [SCRATCH_ID, 'any-id', 'ref-n40', 'ref-other'])
      evictAttenuationStyleNoiseMap(id);
  });

  it('equals the eight generators called directly with any id and the same name, field for field', () => {
    const baseline = generateWorldSeedBaseline(NAME);
    expect(baseline).toEqual(directBaseline('any-id', NAME));
    expect(Object.keys(baseline).sort()).toEqual(
      [
        'bpm',
        'globalAudio',
        'globalLfoLinks',
        'humanize',
        'lfoBank',
        'pingVarianceAutomation',
        'swellDuration',
        'swellFrequency',
      ].sort()
    );
  });

  it('returns an equal value on a second consecutive call', () => {
    expect(generateWorldSeedBaseline(NAME)).toEqual(generateWorldSeedBaseline(NAME));
  });

  it('reads the exact name: a different name gives a different baseline', () => {
    expect(generateWorldSeedBaseline('Pelagos 7!')).toEqual(directBaseline('any-id', 'Pelagos 7!'));
    expect(generateWorldSeedBaseline('Pelagos 7!')).not.toEqual(generateWorldSeedBaseline(NAME));
  });

  it('leaves compressorBeforeDelay at whatever the generator returns (false)', () => {
    expect(generateWorldSeedBaseline(NAME).globalAudio.compressorBeforeDelay).toBe(false);
  });

  it('evicts its scratch noise map: the scratch id builds a fresh map for another name afterwards', () => {
    generateWorldSeedBaseline(NAME);
    const underScratch = firstSample(SCRATCH_ID, 'OTHER');
    expect(underScratch).not.toBe(firstSample('ref-n40', NAME));
    expect(underScratch).toBe(firstSample('ref-other', 'OTHER'));
  });

  it('still evicts the scratch map when a generator throws', () => {
    vi.spyOn(globalAudioSeed, 'generateHumanize').mockImplementationOnce(() => {
      throw new Error('generator failed');
    });
    expect(() => generateWorldSeedBaseline(NAME)).toThrow('generator failed');
    expect(firstSample(SCRATCH_ID, 'OTHER')).toBe(firstSample('ref-other', 'OTHER'));
  });
});
