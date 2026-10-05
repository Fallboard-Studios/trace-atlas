// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  orbiterDials,
  ORBITER_COUNT_BREAKS,
  ORBITER_SIZE_MIN,
  ORBITER_SIZE_MAX,
  ORBITER_LINE_BASE,
  ORBITER_STRIP_OPACITY_MIN,
  ORBIT_GAP_BASE,
  ORBIT_GAP_PER_OCTAVE,
  ORBIT_DURATION_BASE,
  ORBIT_DURATION_PER_OCTAVE,
  type OrbiterDialsInput,
} from './orbiterDials';

// ========================================
// FIXTURES
// ========================================
function robotFixture(overrides: Partial<OrbiterDialsInput> = {}): OrbiterDialsInput {
  return {
    octaveRange: [1, 7],
    audioAttributes: {},
    ...overrides,
  };
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

describe('orbiterDials — line width (Note Variance, intent table row "Boundary-line width")', () => {
  it.each([
    [0, 0.3],
    [8, 1.1],
  ])('variance value %d → line width %d', (value, lineWidth) => {
    expect(orbiterDials(robotFixture({ noteVariance: { active: true, value } })).lineWidth).toBeCloseTo(lineWidth, 10);
  });

  it('ignores the active flag — only value drives line width', () => {
    const inactive = orbiterDials(robotFixture({ noteVariance: { active: false, value: 8 } }));
    expect(inactive.lineWidth).toBeCloseTo(1.1, 10);
  });

  it('base constant matches the table', () => {
    expect(ORBITER_LINE_BASE).toBe(3);
  });
});

describe('orbiterDials — strip opacity (Pitch Repeat, intent table row "Line light strip")', () => {
  it.each([
    [0, 0.35],
    [100, 1.0],
  ])('pitchRepeat %d → strip opacity %d', (pitchRepeat, stripOpacity) => {
    expect(orbiterDials(robotFixture({ pitchRepeat })).stripOpacity).toBeCloseTo(stripOpacity, 10);
  });

  it('floor constant matches the table', () => {
    expect(ORBITER_STRIP_OPACITY_MIN).toBe(0.35);
  });
});

describe('orbiterDials — orbit gap (min octave, intent table row "Gap between orbits")', () => {
  it.each([
    [1, 17],
    [7, 29],
  ])('min octave %d → gap %d s', (minOctave, gap) => {
    expect(orbiterDials(robotFixture({ octaveRange: [minOctave, minOctave] })).orbitGap).toBeCloseTo(gap, 10);
  });

  it('base/per-octave constants match the table', () => {
    expect(ORBIT_GAP_BASE).toBe(15);
    expect(ORBIT_GAP_PER_OCTAVE).toBe(2);
  });
});

describe('orbiterDials — orbit duration (max octave, Gate 1 correction)', () => {
  it.each([
    [1, 4],
    [7, 8],
  ])('max octave %d → duration %d s', (maxOctave, duration) => {
    expect(orbiterDials(robotFixture({ octaveRange: [maxOctave, maxOctave] })).orbitDuration).toBeCloseTo(duration, 10);
  });

  it('base/per-octave constants match the Gate 1 numbers (4 + (max - 1) * 2/3)', () => {
    expect(ORBIT_DURATION_BASE).toBe(4);
    expect(ORBIT_DURATION_PER_OCTAVE).toBeCloseTo(2 / 3, 10);
  });
});

describe('orbiterDials — octave range [2, 5] (Task 2 acceptance example)', () => {
  it('gives gap 19 s and duration 6.67 s', () => {
    const dials = orbiterDials(robotFixture({ octaveRange: [2, 5] }));
    expect(dials.orbitGap).toBeCloseTo(19, 10);
    expect(dials.orbitDuration).toBeCloseTo(6.67, 2);
  });
});

describe('orbiterDials — audioAttributes.octaveRange wins over robot.octaveRange', () => {
  it('uses audioAttributes.octaveRange when present', () => {
    const dials = orbiterDials(
      robotFixture({
        octaveRange: [1, 1],
        audioAttributes: { octaveRange: [2, 5] },
      })
    );
    expect(dials.orbitGap).toBeCloseTo(19, 10);
    expect(dials.orbitDuration).toBeCloseTo(6.67, 2);
  });

  it('falls back to robot.octaveRange when audioAttributes.octaveRange is absent', () => {
    const dials = orbiterDials(robotFixture({ octaveRange: [2, 5] }));
    expect(dials.orbitGap).toBeCloseTo(19, 10);
    expect(dials.orbitDuration).toBeCloseTo(6.67, 2);
  });
});

describe('orbiterDials — every field undefined (melody defaults)', () => {
  it('matches the melody generator defaults', () => {
    const dials = orbiterDials(robotFixture());
    expect(dials.count).toBe(2); // DEFAULT_RHYTHMIC_DENSITY 50
    expect(dials.size).toBeCloseTo(1.25, 10); // DEFAULT_RHYTHMIC_MOTIF_LENGTH.value 8
    expect(dials.lineWidth).toBeCloseTo(0.3, 10); // DEFAULT_NOTE_VARIANCE.value 0
    expect(dials.stripOpacity).toBeCloseTo(0.35, 10); // DEFAULT_PITCH_REPEAT 0
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

  it('clamps noteVariance.value above 8', () => {
    expect(orbiterDials(robotFixture({ noteVariance: { active: true, value: 20 } })).lineWidth).toBeCloseTo(1.1, 10);
  });

  it('clamps pitchRepeat above 100', () => {
    expect(orbiterDials(robotFixture({ pitchRepeat: 200 })).stripOpacity).toBeCloseTo(1.0, 10);
  });

  it('clamps octaveRange values outside 1..7', () => {
    const dials = orbiterDials(robotFixture({ octaveRange: [0, 10] }));
    expect(dials.orbitGap).toBeCloseTo(17, 10); // min clamps to 1
    expect(dials.orbitDuration).toBeCloseTo(8, 10); // max clamps to 7
  });
});
