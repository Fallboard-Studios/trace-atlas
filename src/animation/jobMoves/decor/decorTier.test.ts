// ========================================
// IMPORTS
// ========================================
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { decorTier, type DecorTier, type DecorTierLadder } from './decorTier';
import { AUDIO_LOAD_PRESETS, DECOR_TIER_BELOW_FULL, DECOR_TIER_BELOW_STANDARD } from '../../../constants';

// ========================================
// FIXTURES
// ========================================
/** The ladder the spec holds in reserve if the perf gate misses (Assumption 9): Light none, Standard cheap, Full all. */
const LADDER: DecorTierLadder = { belowStandard: 'none', belowFull: 'cheap' };
const { light, standard, full } = AUDIO_LOAD_PRESETS;

// ========================================
// TESTS
// ========================================
describe('decorTier (docs/specs/JOB_DECORATION.md Assumption 9, Task 5)', () => {
  it('ships unbound: every preset, and the ends of the dial, are all', () => {
    expect(DECOR_TIER_BELOW_STANDARD).toBe('all');
    expect(DECOR_TIER_BELOW_FULL).toBe('all');
    for (const load of [0, light, standard, full]) expect(decorTier(load), String(load)).toBe('all');
  });

  it('with the ladder bound: Light is none, Standard is cheap, Full is all', () => {
    expect(decorTier(light, LADDER)).toBe('none');
    expect(decorTier(standard, LADDER)).toBe('cheap');
    expect(decorTier(full, LADDER)).toBe('all');
  });

  it('a value between presets takes the lower tier', () => {
    expect(decorTier(0.4, LADDER)).toBe('none'); // between Light and Standard
    expect(decorTier(0.59, LADDER)).toBe('none'); // just under Standard
    expect(decorTier(0.8, LADDER)).toBe('cheap'); // between Standard and Full
    expect(decorTier(0.99, LADDER)).toBe('cheap'); // just under Full
  });

  it('the dial ends: 0 is the lowest rung, 1 the top one', () => {
    expect(decorTier(0, LADDER)).toBe('none');
    expect(decorTier(1, LADDER)).toBe('all');
  });

  it('out-of-range and NaN loads clamp like the slider does: below 0 is the lowest rung, above 1 and NaN are Full', () => {
    expect(decorTier(-3, LADDER)).toBe('none');
    expect(decorTier(7, LADDER)).toBe('all');
    expect(decorTier(Number.NaN, LADDER)).toBe('all');
  });

  it('is monotonic: raising the load never lowers the tier, for any ladder that does not itself fall', () => {
    const rank: Record<DecorTier, number> = { none: 0, cheap: 1, all: 2 };
    const ladders: DecorTierLadder[] = [
      LADDER,
      { belowStandard: 'none', belowFull: 'all' },
      { belowStandard: 'cheap', belowFull: 'cheap' },
      { belowStandard: 'none', belowFull: 'none' },
    ];
    for (const ladder of ladders) {
      let last = -1;
      for (let k = 0; k <= 100; k++) {
        const r = rank[decorTier(k / 100, ladder)];
        expect(r, `${JSON.stringify(ladder)} at ${k / 100}`).toBeGreaterThanOrEqual(last);
        last = r;
      }
    }
  });

  it('is a pure function of the load: the same input twice gives the same tier', () => {
    expect(decorTier(0.3, LADDER)).toBe(decorTier(0.3, LADDER));
  });
});

describe('decorations never read the audio store inside a tween (Task 5)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = [
    ...readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => resolve(here, f)),
    resolve(here, '..', 'buildJobTimeline.ts'),
  ];

  it('finds the sources it is meant to guard (a moved file cannot silently empty the check)', () => {
    expect(sources.some((p) => p.endsWith('decorTier.ts'))).toBe(true);
    expect(sources.some((p) => p.endsWith('buildJobTimeline.ts'))).toBe(true);
  });

  it('no decor module and not buildJobTimeline mentions useAudioStore: the tier is read once, by the work loop', () => {
    for (const path of sources) expect(readFileSync(path, 'utf8'), path).not.toContain('useAudioStore');
  });
});
