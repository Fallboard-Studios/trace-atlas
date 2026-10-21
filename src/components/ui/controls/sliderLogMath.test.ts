import { describe, it, expect } from 'vitest';
import {
  sliderLogValueToT,
  sliderLogTToValue,
  stepsValueToT,
  stepsTToValue,
  signedLogValueToT,
  signedLogTToValue,
  signedLogKeyStep,
  signedLogTrackValue,
} from './sliderLogMath';

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

// Branch review item 7 (the Frequency Shifter's Shift): a signed-log track for a zero-centred slider. Each half runs
// |value| = knee * ((bound / knee + 1)^|t| - 1), so t = 0 is exactly 0, t = +-1 is exactly the bound, and below about
// the knee it is near linear.
describe('signedLogValueToT / signedLogTToValue', () => {
  const MIN = -1000;
  const MAX = 1000;
  const KNEE = 1;

  it('maps 0 to 0 and each bound to its own end', () => {
    expect(signedLogValueToT(0, MIN, MAX, KNEE)).toBe(0);
    expect(signedLogValueToT(MAX, MIN, MAX, KNEE)).toBeCloseTo(1, 12);
    expect(signedLogValueToT(MIN, MIN, MAX, KNEE)).toBeCloseTo(-1, 12);
    expect(signedLogTToValue(0, MIN, MAX, KNEE)).toBe(0);
    expect(signedLogTToValue(1, MIN, MAX, KNEE)).toBeCloseTo(MAX, 9);
    expect(signedLogTToValue(-1, MIN, MAX, KNEE)).toBeCloseTo(MIN, 9);
  });

  it('is odd-symmetric for symmetric bounds and round-trips', () => {
    for (const v of [0.5, 1, 2, 7, 20, 150, 999]) {
      const t = signedLogValueToT(v, MIN, MAX, KNEE);
      expect(signedLogValueToT(-v, MIN, MAX, KNEE)).toBeCloseTo(-t, 12);
      expect(signedLogTToValue(t, MIN, MAX, KNEE)).toBeCloseTo(v, 9);
    }
  });

  it('gives the seeded 2-20 Hz band over a quarter of each half (a linear track gives it under 2 %)', () => {
    const span = signedLogValueToT(20, MIN, MAX, KNEE) - signedLogValueToT(2, MIN, MAX, KNEE);
    expect(span).toBeGreaterThan(0.25);
    expect((20 - 2) / MAX).toBeLessThan(0.02);
  });

  it('rises strictly with the value across the whole range', () => {
    let previous = -Infinity;
    for (let v = MIN; v <= MAX; v += 7) {
      const t = signedLogValueToT(v, MIN, MAX, KNEE);
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });

  it('scales each half by its own bound when the bounds are asymmetric', () => {
    expect(signedLogValueToT(-20, -20, 500, KNEE)).toBeCloseTo(-1, 12);
    expect(signedLogValueToT(500, -20, 500, KNEE)).toBeCloseTo(1, 12);
    expect(signedLogTToValue(-1, -20, 500, KNEE)).toBeCloseTo(-20, 9);
  });

  it('clamps a value past a bound to that end, and a t past +-1 to the bound', () => {
    expect(signedLogValueToT(5000, MIN, MAX, KNEE)).toBeCloseTo(1, 12);
    expect(signedLogValueToT(-5000, MIN, MAX, KNEE)).toBeCloseTo(-1, 12);
    expect(signedLogTToValue(1.5, MIN, MAX, KNEE)).toBeCloseTo(MAX, 9);
    expect(signedLogTToValue(-1.5, MIN, MAX, KNEE)).toBeCloseTo(MIN, 9);
  });

  it('a larger knee puts more of the track near zero', () => {
    const at = (knee: number) => signedLogValueToT(5, MIN, MAX, knee);
    expect(at(10)).toBeLessThan(at(1));
  });
});

// A keyboard step on the signed-log track: a hundredth of the track (a tenth for a page step), but never less than
// one `step` of value, so an arrow press near zero still moves, and the result is snapped to `step` and clamped.
describe('signedLogKeyStep', () => {
  const MIN = -1000;
  const MAX = 1000;
  const KNEE = 1;

  it('moves at least one step from 0, either way', () => {
    expect(signedLogKeyStep(0, 1, false, MIN, MAX, KNEE, 1)).toBe(1);
    expect(signedLogKeyStep(0, -1, false, MIN, MAX, KNEE, 1)).toBe(-1);
  });

  it('moves a hundredth of the track where that is more than a step', () => {
    const from = 500;
    const expected = Math.round(signedLogTToValue(signedLogValueToT(from, MIN, MAX, KNEE) + 0.01, MIN, MAX, KNEE));
    expect(expected).toBeGreaterThan(from + 1);
    expect(signedLogKeyStep(from, 1, false, MIN, MAX, KNEE, 1)).toBe(expected);
  });

  it('takes a page step of a tenth of the track', () => {
    const page = signedLogKeyStep(100, 1, true, MIN, MAX, KNEE, 1);
    const arrow = signedLogKeyStep(100, 1, false, MIN, MAX, KNEE, 1);
    expect(page).toBe(Math.round(signedLogTToValue(signedLogValueToT(100, MIN, MAX, KNEE) + 0.1, MIN, MAX, KNEE)));
    expect(page).toBeGreaterThan(arrow);
  });

  it('crosses zero cleanly and stays on the step grid', () => {
    expect(signedLogKeyStep(1, -1, false, MIN, MAX, KNEE, 1)).toBe(0);
    expect(Object.is(signedLogKeyStep(1, -1, false, MIN, MAX, KNEE, 1), -0)).toBe(false);
    for (const from of [-37, -3, 0, 4, 61]) {
      const next = signedLogKeyStep(from, 1, false, MIN, MAX, KNEE, 1);
      expect(Number.isInteger(next), String(from)).toBe(true);
    }
  });

  it('holds at each bound', () => {
    expect(signedLogKeyStep(MAX, 1, false, MIN, MAX, KNEE, 1)).toBe(MAX);
    expect(signedLogKeyStep(MIN, -1, true, MIN, MAX, KNEE, 1)).toBe(MIN);
  });
});

// A pointer drag on the signed-log track: the position's value, snapped to the step grid.
describe('signedLogTrackValue', () => {
  it('snaps the track position to whole steps, 0 included, never -0', () => {
    expect(signedLogTrackValue(0.0005, -1000, 1000, 1, 1)).toBe(0);
    expect(Object.is(signedLogTrackValue(-0.0005, -1000, 1000, 1, 1), -0)).toBe(false);
    const sevenHz = signedLogValueToT(7, -1000, 1000, 1);
    expect(signedLogTrackValue(sevenHz + 0.001, -1000, 1000, 1, 1)).toBe(7);
    expect(signedLogTrackValue(-sevenHz, -1000, 1000, 1, 1)).toBe(-7);
  });

  it('lands every position from end to end on the grid and inside the bounds', () => {
    for (let t = -1; t <= 1; t += 0.013) {
      const v = signedLogTrackValue(t, -1000, 1000, 1, 1);
      expect(Number.isInteger(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1000);
    }
  });
});
