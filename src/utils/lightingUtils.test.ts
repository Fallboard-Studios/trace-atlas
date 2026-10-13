import { describe, it, expect } from 'vitest';
import { getLighting, getNightDepth, FLICKER_PERIOD } from './lightingUtils';

// ========================================
// HELPERS
// ========================================

/** Returns east and west values rounded to 3 decimal places. */
function lighting(hour: number) {
  const { eastL, westL } = getLighting(hour);
  return { eastL: Math.round(eastL * 1000) / 1000, westL: Math.round(westL * 1000) / 1000 };
}

// ========================================
// TESTS
// ========================================

describe('getLighting', () => {
  it('returns equal east and west at midnight (hour 0)', () => {
    const { eastL, westL } = getLighting(0);
    expect(eastL).toBeCloseTo(westL, 3);
  });

  it('returns equal east and west at noon (hour 12)', () => {
    const { eastL, westL } = getLighting(12);
    expect(eastL).toBeCloseTo(westL, 3);
  });

  it('east face peaks at 9am', () => {
    const { eastL: at9 } = getLighting(9);
    const { eastL: at6 } = getLighting(6);
    const { eastL: at12 } = getLighting(12);
    expect(at9).toBeGreaterThan(at6);
    expect(at9).toBeGreaterThan(at12);
    // Should be at or near PEAK_L
    expect(at9).toBeCloseTo(1.05, 2);
  });

  it('west face peaks at 3pm', () => {
    const { westL: at15 } = getLighting(15);
    const { westL: at12 } = getLighting(12);
    const { westL: at18 } = getLighting(18);
    expect(at15).toBeGreaterThan(at12);
    expect(at15).toBeGreaterThan(at18);
    // Should be at or near PEAK_L
    expect(at15).toBeCloseTo(1.05, 2);
  });

  it('east is brighter than west in the morning (hour 6)', () => {
    const { eastL, westL } = getLighting(6);
    expect(eastL).toBeGreaterThan(westL);
  });

  it('west is brighter than east in the afternoon (hour 18)', () => {
    const { eastL, westL } = getLighting(18);
    expect(westL).toBeGreaterThan(eastL);
  });

  it('all values stay within [NIGHT_L, PEAK_L] range', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const { eastL, westL } = getLighting(h);
      expect(eastL).toBeGreaterThanOrEqual(0.15);
      expect(eastL).toBeLessThanOrEqual(1.05);
      expect(westL).toBeGreaterThanOrEqual(0.15);
      expect(westL).toBeLessThanOrEqual(1.05);
    }
  });

  it('wraps correctly — hour 0, 24 and 48 produce the same result', () => {
    expect(lighting(0)).toEqual(lighting(24));
    expect(lighting(0)).toEqual(lighting(48));
  });

  it('is darker at night than at noon', () => {
    const night = getLighting(0).eastL;
    const noon = getLighting(12).eastL;
    expect(noon).toBeGreaterThan(night);
  });

  // Pinned from the measure-based form this replaced (roadmap 48): the same curve and gamma, now
  // keyed by hour. Hours 0 / 9 / 12 / 15 were measures 0 / 36 / 48 / 60. Fractional hours matter —
  // the world tick feeds a 0..24 float, not whole hours.
  it.each([
    [0, 0.163144286481, 0.163144286481],
    [1.5, 0.217778814915, 0.150678078075],
    [3, 0.345873876742, 0.15],
    [6, 0.785257836949, 0.163144286481],
    [9, 1.05, 0.345873876742],
    [10.5, 0.976357251617, 0.549545817622],
    [12, 0.785257836949, 0.785257836949],
    [15, 0.345873876742, 1.05],
    [18, 0.163144286481, 0.785257836949],
    [21, 0.15, 0.345873876742],
    [23.75, 0.159128242673, 0.168325959474],
  ])('matches the pinned curve at hour %s', (hour, east, west) => {
    const { eastL, westL } = getLighting(hour);
    expect(eastL).toBeCloseTo(east, 10);
    expect(westL).toBeCloseTo(west, 10);
  });
});
// ========================================
// getNightDepth
// ========================================

describe('getNightDepth', () => {
  it('returns ~1 at deepest night (hour 0)', () => {
    const { eastL, westL } = getLighting(0);
    expect(getNightDepth(eastL, westL)).toBeCloseTo(1, 1);
  });

  it('is near its minimum around midday (hour 12) — not zero because faces peak at different times', () => {
    const { eastL, westL } = getLighting(12);
    // East peaks at 9am, west at 3pm; their average at noon is well below NIGHT_L
    // ceiling but never reaches PEAK_L simultaneously, so nightDepth is low but > 0.
    expect(getNightDepth(eastL, westL)).toBeLessThan(0.4);
  });

  it('is always in [0, 1]', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const { eastL, westL } = getLighting(h);
      const d = getNightDepth(eastL, westL);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it('is higher in the evening/night than at midday', () => {
    const { eastL: eNoon, westL: wNoon } = getLighting(12);
    const { eastL: eNight, westL: wNight } = getLighting(0);
    expect(getNightDepth(eNight, wNight)).toBeGreaterThan(getNightDepth(eNoon, wNoon));
  });
});

// ========================================
// FLICKER_PERIOD
// ========================================

describe('FLICKER_PERIOD', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(FLICKER_PERIOD)).toBe(true);
    expect(FLICKER_PERIOD).toBeGreaterThan(0);
  });

  it('produces a new epoch every FLICKER_PERIOD measures', () => {
    const epoch0 = Math.floor(0 / FLICKER_PERIOD);
    const epochN = Math.floor(FLICKER_PERIOD / FLICKER_PERIOD);
    expect(epochN).toBe(epoch0 + 1);
  });
});
