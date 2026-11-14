// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  orbiterDials,
  ORBITER_COUNT_BREAKS,
  ORBITER_SIZE_MIN,
  ORBITER_SIZE_MAX,
  type OrbiterDialsInput,
} from './orbiterDials';

// ========================================
// FIXTURES
// ========================================
function robotFixture(overrides: Partial<OrbiterDialsInput> = {}): OrbiterDialsInput {
  return { ...overrides };
}

// ========================================
// TESTS
// ========================================
describe('orbiterDials — count (rhythmicDensity, intent table row "Count")', () => {
  it.each([
    [0, 1],
    [24, 1],
    [25, 2],
    [50, 2],
    [51, 3],
    [75, 3],
    [76, 4],
    [100, 4],
  ])('density %d → count %d', (density, count) => {
    expect(orbiterDials(robotFixture({ rhythmicDensity: density })).count).toBe(count);
  });

  it('breaks are the documented thresholds', () => {
    expect(ORBITER_COUNT_BREAKS).toEqual([25, 50, 75]);
  });
});

describe('orbiterDials — size (Phrase Length / rhythmicMotifLength.value, intent table row "Size")', () => {
  it.each([
    [0, 0.75],
    [4, 1.0],
    [8, 1.25],
  ])('motif value %d → size %d', (value, size) => {
    expect(orbiterDials(robotFixture({ rhythmicMotifLength: { active: true, value } })).size).toBeCloseTo(size, 10);
  });

  it('ignores the active flag — only value drives size', () => {
    const inactive = orbiterDials(robotFixture({ rhythmicMotifLength: { active: false, value: 4 } }));
    const active = orbiterDials(robotFixture({ rhythmicMotifLength: { active: true, value: 4 } }));
    expect(inactive.size).toBeCloseTo(1.0, 10);
    expect(inactive.size).toBe(active.size);
  });

  it('min/max constants match the table', () => {
    expect(ORBITER_SIZE_MIN).toBe(0.75);
    expect(ORBITER_SIZE_MAX).toBe(1.25);
  });
});

describe('orbiterDials — every field undefined (melody defaults)', () => {
  it('matches the melody generator defaults', () => {
    const dials = orbiterDials(robotFixture());
    expect(dials.count).toBe(2); // DEFAULT_RHYTHMIC_DENSITY 50
    expect(dials.size).toBeCloseTo(1.25, 10); // DEFAULT_RHYTHMIC_MOTIF_LENGTH.value 8
  });

  it('has exactly two fields — no orbit-timing dials (docking has no speed) and no line dials (backlog 85: every line is one fixed width)', () => {
    expect(Object.keys(orbiterDials(robotFixture())).sort()).toEqual(['count', 'size']);
  });
});

describe('orbiterDials — out-of-range inputs clamp to the constant ranges', () => {
  it('clamps rhythmicDensity below 0 and above 100', () => {
    expect(orbiterDials(robotFixture({ rhythmicDensity: -5 })).count).toBe(1);
    expect(orbiterDials(robotFixture({ rhythmicDensity: 150 })).count).toBe(4);
  });

  it('clamps rhythmicMotifLength.value above 8', () => {
    expect(orbiterDials(robotFixture({ rhythmicMotifLength: { active: true, value: 12 } })).size).toBeCloseTo(1.25, 10);
  });
});
