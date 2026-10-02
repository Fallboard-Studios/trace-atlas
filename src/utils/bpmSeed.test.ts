// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';

import { generateAttenuationStyleBpm, BPM_SEED_RANGE } from './bpmSeed';
import { evictAttenuationStyleNoiseMap } from './noiseMaps';

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
    expect(BPM_SEED_RANGE).toEqual({ min: 40, max: 100 });
  });

  it('always returns an integer in [40, 100], across many Attenuation Styles', () => {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const value = generateAttenuationStyleBpm(sampleId(i), sampleName(i));
      expect(value, `style ${i}`).toBeGreaterThanOrEqual(BPM_SEED_RANGE.min);
      expect(value, `style ${i}`).toBeLessThanOrEqual(BPM_SEED_RANGE.max);
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

  it('is not a Math.random()-driven value, and is keyed off the Attenuation Style noise map, not the locale one (source-scan regression guard)', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const source = readFileSync(join(dirname(thisFile), 'bpmSeed.ts'), 'utf-8');
    expect(source).not.toMatch(/Math\.random/);
    expect(source).toMatch(/getAttenuationStyleNoiseMap/);
    expect(source).not.toMatch(/getLocaleNoiseMap/);
  });
});
