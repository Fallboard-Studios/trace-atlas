import { describe, it, expect } from 'vitest';
import {
  getLighting,
  getNightDepth,
  FLICKER_PERIOD,
  flickerPhase,
  getFlickerEpoch,
} from './lightingUtils';

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
  it('is two in-world hours', () => {
    expect(FLICKER_PERIOD).toBe(2);
  });
});

describe('flickerPhase', () => {
  it('is zero for a seed on slot 0 and steps a quarter hour per slot', () => {
    expect(flickerPhase(0)).toBe(0);
    expect(flickerPhase(1)).toBe(0.25);
    expect(flickerPhase(4)).toBe(1);
    expect(flickerPhase(7)).toBe(1.75);
  });

  it('wraps by slot — seed 8 lands where seed 0 does', () => {
    expect(flickerPhase(8)).toBe(flickerPhase(0));
    expect(flickerPhase(13)).toBe(flickerPhase(5));
  });

  it('spreads buildings over eight distinct offsets inside one period', () => {
    const phases = new Set(Array.from({ length: 64 }, (_, seed) => flickerPhase(seed)));
    expect(phases.size).toBe(8);
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(FLICKER_PERIOD);
    }
  });
});

describe('getFlickerEpoch', () => {
  it('is epoch 0 at midnight for an unshifted building and ticks over at hour 2', () => {
    expect(getFlickerEpoch(0, 0)).toBe(0);
    expect(getFlickerEpoch(1.99, 0)).toBe(0);
    expect(getFlickerEpoch(2, 0)).toBe(1);
  });

  it('a phase pulls the boundary earlier by that many hours', () => {
    // phase 1.75 (seed slot 7): boundary at hour 0.25, then every 2 hours
    expect(getFlickerEpoch(0.24, 1.75)).toBe(0);
    expect(getFlickerEpoch(0.25, 1.75)).toBe(1);
    expect(getFlickerEpoch(2.24, 1.75)).toBe(1);
    expect(getFlickerEpoch(2.25, 1.75)).toBe(2);
  });

  it('every building rolls exactly once per period, never all on the same tick', () => {
    // Walk hour 0..24 in quarter-hour steps; count how many of the 8 slots roll at each step.
    const slots = Array.from({ length: 8 }, (_, seed) => flickerPhase(seed));
    let maxRollsAtOnce = 0;
    for (let q = 1; q <= 96; q++) {
      const rolls = slots.filter((p) => getFlickerEpoch(q / 4, p) !== getFlickerEpoch((q - 1) / 4, p));
      maxRollsAtOnce = Math.max(maxRollsAtOnce, rolls.length);
    }
    expect(maxRollsAtOnce).toBe(1);
  });

  it('runs a full day to epoch 12 for an unshifted building', () => {
    expect(getFlickerEpoch(23.99, 0)).toBe(11);
    expect(getFlickerEpoch(24, 0)).toBe(12);
  });
});
