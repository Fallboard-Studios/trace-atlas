// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';

import { generateAttenuationStyleBpm } from './bpmSeed';
import { evictAttenuationStyleNoiseMap, getAttenuationStyleNoiseMap } from './noiseMaps';
import { getUniformSeededVal } from './getSeededVal';
import { withLoading } from '@/data/bands/loadingContext';
import { CLASSIC } from '@/data/bands/classic';
import { outerTenths } from '@/testUtils/spread';

// band-table T22: the tempo band is read from the loading context at the draw (docs/specs/OFF_SCREEN.md assumption 15).
// The real Calm column is {} until the listen (plan Task 34), so one that moves bpm is injected over the spread originals.
vi.mock('@/data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/bands/themes')>();
  return { ...actual, THEMES: { ...actual.THEMES, float: { bpm: { min: 150, max: 160 } } } };
});

// ========================================
// HELPERS
// ========================================

const SAMPLE_COUNT = 30;
const sampleId = (i: number) => `seed-bpm-as-${i}`;
const sampleName = (i: number) => `Seed Bpm Style ${i}`;

// ========================================
// TESTS
// ========================================

describe('generateAttenuationStyleBpm (docs/specs/FREE_SYNC_TOGGLE.md §1.7 "BPM")', () => {
  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-as');
    evictAttenuationStyleNoiseMap('seed-test-as-b');
    for (let i = 0; i < SAMPLE_COUNT; i++) evictAttenuationStyleNoiseMap(sampleId(i));
  });

  it('seeds from the [40, 100] band — unchanged from the locale-seeded range', () => {
    expect(CLASSIC.bpm).toEqual({ min: 40, max: 100 });
  });

  it('always returns an integer in [40, 100], across many Attenuation Styles', () => {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const value = generateAttenuationStyleBpm(sampleId(i), sampleName(i));
      expect(value, `style ${i}`).toBeGreaterThanOrEqual(CLASSIC.bpm.min);
      expect(value, `style ${i}`).toBeLessThanOrEqual(CLASSIC.bpm.max);
      expect(Number.isInteger(value), `style ${i} is an integer`).toBe(true);
    }
  });

  it('is deterministic — same (id, name) always produces the same value', () => {
    const first = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    const second = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    expect(second).toBe(first);
  });

  it('is deterministic across a fresh noise map too, not just a cached one', () => {
    const first = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    evictAttenuationStyleNoiseMap('seed-test-as');
    const second = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    expect(second).toBe(first);
  });

  it('is a pure function of the Attenuation Style — takes no coordinates, so a coordinates move cannot change it', () => {
    expect(generateAttenuationStyleBpm.length).toBe(2);
  });

  it('produces different values for different Attenuation Styles (non-degenerate)', () => {
    const a = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    const b = generateAttenuationStyleBpm('seed-test-as-b', 'Another Seed Style');
    expect(b).not.toBe(a);
  });

  it('is not degenerate across names — at least 10 distinct tempos over 30 Attenuation Styles (guards the offset-0 sampling artifact)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < SAMPLE_COUNT; i++) seen.add(generateAttenuationStyleBpm(sampleId(i), sampleName(i)));
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });
});

// Even Seeded Draws T12 (docs/specs/EVEN_SEEDED_DRAWS.md §1.3): the tempo is an even draw within the theme's band.
describe('generateAttenuationStyleBpm — the tempo draws even (Even Seeded Draws T12)', () => {
  const STYLE_COUNT = 3000;
  const STYLES = Array.from({ length: STYLE_COUNT }, (_, i) => {
    const id = `even-bpm-${i}`;
    const name = `EvenBpm${i}`;
    const noiseMap = getAttenuationStyleNoiseMap(id, name);
    const bpm = generateAttenuationStyleBpm(id, name);
    evictAttenuationStyleNoiseMap(id);
    return { noiseMap, bpm };
  });
  const TEMPOS = STYLES.map(({ bpm }) => bpm);

  it('every whole tempo from 41 to 99 occurs over 3,000 styles', () => {
    const seen = new Set(TEMPOS);
    for (let bpm = 41; bpm <= 99; bpm++) expect(seen.has(bpm), `${bpm} BPM`).toBe(true);
  });

  // A whole tempo rounds a draw, so the bottom tenth of 40-100 (40-45) holds the draws from 40 to 45.5, 9.17 % of an even
  // draw, and the top tenth (94-100) the draws from 93.5, 10.83 %. Each is held within 3 standard deviations.
  it('each outer tenth of 40-100 holds its even share: 9.17 % at the bottom, 10.83 % at the top', () => {
    const { bottom, top } = outerTenths(TEMPOS, CLASSIC.bpm);
    const within = (share: number, expected: number) => Math.abs(share - expected) <= 3 * Math.sqrt((expected * (1 - expected)) / STYLE_COUNT);
    expect(within(bottom, 5.5 / 60), `bottom tenth ${(bottom * 100).toFixed(2)} %`).toBe(true);
    expect(within(top, 6.5 / 60), `top tenth ${(top * 100).toFixed(2)} %`).toBe(true);
  });

  it('the tempo is the even draw at globalAudio.bpm over the band, rounded', () => {
    for (const { noiseMap, bpm } of STYLES.slice(0, 300)) {
      expect(bpm).toBe(Math.round(getUniformSeededVal(noiseMap, 'globalAudio.bpm', 0, CLASSIC.bpm.min, CLASSIC.bpm.max)));
    }
  });
});

describe('generateAttenuationStyleBpm reads the band table (band-table T22, spec assumption 15)', () => {
  const CALM = { theme: 'float', aspects: {} } as const;

  afterEach(() => {
    evictAttenuationStyleNoiseMap('seed-test-as');
    for (let i = 0; i < SAMPLE_COUNT; i++) evictAttenuationStyleNoiseMap(sampleId(i));
  });

  it('under a theme moving bpm to 150-160 the tempo lands in it, still an integer; the same style under Classic is in 40-100', () => {
    const classic = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    expect(classic).toBeGreaterThanOrEqual(40);
    expect(classic).toBeLessThanOrEqual(100);
    const calm = withLoading(CALM, () => generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style'));
    expect(calm).toBeGreaterThanOrEqual(150);
    expect(calm).toBeLessThanOrEqual(160);
    expect(Number.isInteger(calm)).toBe(true);
  });

  it('moves the band, never the draw: the themed tempo sits at the same point of its band as the Classic one, to within a step', () => {
    const classic = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    const calm = withLoading(CALM, () => generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style'));
    const classicT = (classic - 40) / 60;
    const calmT = (calm - 150) / 10;
    // Rounding to a whole tempo moves a position by at most 0.5 / 60 and 0.5 / 10.
    expect(Math.abs(classicT - calmT)).toBeLessThan(0.06);
  });

  it('reads the band at the draw, never caching it: after withLoading the same style seeds its Classic tempo again', () => {
    const before = generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style');
    withLoading(CALM, () => generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style'));
    expect(generateAttenuationStyleBpm('seed-test-as', 'Seed Test Style')).toBe(before);
  });

  it('over thirty styles every Calm tempo is in 150-160, and every Classic one is below it', () => {
    const calm = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
      withLoading(CALM, () => generateAttenuationStyleBpm(sampleId(i), sampleName(i))),
    );
    const classic = Array.from({ length: SAMPLE_COUNT }, (_, i) => generateAttenuationStyleBpm(sampleId(i), sampleName(i)));
    for (const value of calm) {
      expect(value).toBeGreaterThanOrEqual(150);
      expect(value).toBeLessThanOrEqual(160);
    }
    expect(classic.every((value) => value < 150)).toBe(true);
  });
});
