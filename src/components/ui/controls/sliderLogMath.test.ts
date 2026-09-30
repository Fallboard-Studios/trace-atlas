import { describe, it, expect } from 'vitest';
import { sliderLogValueToT, sliderLogTToValue, stepsValueToT, stepsTToValue } from './sliderLogMath';

describe('sliderLogValueToT', () => {
  it('maps value <= min to exactly 0, including the min = 0 edge case', () => {
    expect(sliderLogValueToT(0, 0, 100)).toBe(0);
    expect(sliderLogValueToT(-5, 0, 100)).toBe(0);
    expect(sliderLogValueToT(5, 10, 100)).toBe(0); // value below a nonzero min
  });

  it('maps max to exactly 1', () => {
    expect(sliderLogValueToT(100, 0, 100)).toBe(1);
    expect(sliderLogValueToT(100, 10, 100)).toBe(1);
  });
});

describe('sliderLogTToValue', () => {
  it('maps t <= 0 to exactly min, including the min = 0 edge case', () => {
    expect(sliderLogTToValue(0, 0, 100)).toBe(0);
    expect(sliderLogTToValue(-1, 0, 100)).toBe(0);
    expect(sliderLogTToValue(0, 10, 100)).toBe(10);
  });

  it('maps t = 1 to exactly max', () => {
    expect(sliderLogTToValue(1, 0, 100)).toBe(100);
    expect(sliderLogTToValue(1, 10, 100)).toBe(100);
  });
});

describe('round-trip', () => {
  const cases: Array<{ min: number; max: number }> = [
    { min: 0, max: 100 }, // the real Attack/Decay/Release case
    { min: 10, max: 1000 },
  ];

  for (const { min, max } of cases) {
    it(`sliderLogTToValue(sliderLogValueToT(v)) ≈ v for min=${min}, max=${max}`, () => {
      const samples = [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max];
      for (const v of samples) {
        const t = sliderLogValueToT(v, min, max);
        const roundTripped = sliderLogTToValue(t, min, max);
        expect(roundTripped).toBeCloseTo(v, 5);
      }
    });
  }
});

// A discrete-stops variant (docs: Automation Rate's fixed set of allowed frequencies) — used
// instead of the continuous log curve above when a SliderLog schema provides its own `steps`
// list. Evenly spaced by INDEX along the track, not by numeric ratio — the whole point is that
// every stop is equally reachable/visible regardless of how the underlying numbers are spaced.
describe('stepsValueToT / stepsTToValue', () => {
  const STEPS = [0, 1 / 16, 1 / 12, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8, 12, 16];

  it('maps the first step to exactly t = 0 and the last step to exactly t = 1', () => {
    expect(stepsValueToT(STEPS[0], STEPS)).toBe(0);
    expect(stepsValueToT(STEPS[STEPS.length - 1], STEPS)).toBe(1);
  });

  it('spaces steps evenly by index, not by value — the 2nd and 3rd steps (very close numerically) are as far apart in t as any other adjacent pair', () => {
    const tFirstGap = stepsValueToT(STEPS[1], STEPS) - stepsValueToT(STEPS[0], STEPS);
    const tSecondGap = stepsValueToT(STEPS[2], STEPS) - stepsValueToT(STEPS[1], STEPS);
    expect(tSecondGap).toBeCloseTo(tFirstGap, 10);
  });

  it('stepsTToValue at each step\'s own exact t returns that exact step value', () => {
    STEPS.forEach((step, i) => {
      const t = i / (STEPS.length - 1);
      expect(stepsTToValue(t, STEPS)).toBe(step);
    });
  });

  it('snaps a t between two steps to the nearer one, never an interpolated in-between value', () => {
    const tBetweenFirstTwo = (1 / (STEPS.length - 1)) * 0.2; // close to step 0, not step 1
    expect(stepsTToValue(tBetweenFirstTwo, STEPS)).toBe(STEPS[0]);
  });

  it('round-trips: stepsTToValue(stepsValueToT(v)) === v for every real step', () => {
    for (const v of STEPS) {
      expect(stepsTToValue(stepsValueToT(v, STEPS), STEPS)).toBe(v);
    }
  });

  it('stepsValueToT snaps an arbitrary (non-step) value to its nearest step\'s own t, not an interpolated position', () => {
    // 0.6 sits between step 6 (0.5) and step 7 (1) — nearer to 0.5.
    const t = stepsValueToT(0.6, STEPS);
    expect(t).toBe(6 / (STEPS.length - 1));
  });
});
