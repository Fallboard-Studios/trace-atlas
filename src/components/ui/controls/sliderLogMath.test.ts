import { describe, it, expect } from 'vitest';
import { sliderLogValueToT, sliderLogTToValue } from './sliderLogMath';

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
