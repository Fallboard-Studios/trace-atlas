import { describe, it, expect } from 'vitest';
import {
  CEILING_CURVE_LENGTH,
  CEILING_KNEE,
  HEADROOM_TRIM_DB,
  HEADROOM_TRIM_GAIN,
  robotBusGain,
  softCeiling,
  softCeilingCurve,
} from './headroom';
import { volumePositionToGain } from './volumeTaper';

/** `count` evenly spaced points from `from` to `to`, both ends included. */
function points(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

describe('HEADROOM_TRIM_DB / HEADROOM_TRIM_GAIN', () => {
  it('the gain is the dB figure converted, and is a cut', () => {
    expect(HEADROOM_TRIM_GAIN).toBe(10 ** (HEADROOM_TRIM_DB / 20));
    expect(HEADROOM_TRIM_DB).toBeLessThan(0);
    expect(HEADROOM_TRIM_GAIN).toBeLessThan(1);
    expect(HEADROOM_TRIM_GAIN).toBeGreaterThan(0);
  });
});

describe('robotBusGain', () => {
  it('Volume 1 is the trim alone, not unity', () => {
    expect(robotBusGain(1)).toBe(HEADROOM_TRIM_GAIN);
  });

  it('Volume 0 is still true silence', () => {
    expect(robotBusGain(0)).toBe(0);
  });

  it.each([0.25, 0.5, 0.8])('Volume %s is the shared taper times the trim', (position) => {
    expect(robotBusGain(position)).toBe(volumePositionToGain(position) * HEADROOM_TRIM_GAIN);
    expect(robotBusGain(position)).toBeLessThan(volumePositionToGain(position));
  });

  it('out-of-range positions clamp the way the taper does', () => {
    expect(robotBusGain(-0.5)).toBe(0);
    expect(robotBusGain(1.5)).toBe(HEADROOM_TRIM_GAIN);
  });
});

describe('CEILING_KNEE / CEILING_CURVE_LENGTH', () => {
  it('the knee sits inside full scale and the curve length is odd, so its middle entry is x = 0', () => {
    expect(CEILING_KNEE).toBeGreaterThan(0);
    expect(CEILING_KNEE).toBeLessThan(1);
    expect(CEILING_CURVE_LENGTH % 2).toBe(1);
  });
});

describe('softCeiling', () => {
  it('is the identity for every |x| at or below the knee, the knee itself included', () => {
    for (const x of [...points(-CEILING_KNEE, CEILING_KNEE, 141), 0, CEILING_KNEE, -CEILING_KNEE]) {
      expect(softCeiling(x)).toBe(x);
    }
  });

  it('pulls every input above the knee down, towards the knee', () => {
    for (const x of points(CEILING_KNEE + 0.01, 1, 30)) {
      expect(softCeiling(x)).toBeLessThan(x);
      expect(softCeiling(x)).toBeGreaterThan(CEILING_KNEE);
    }
  });

  it('is strictly increasing over 401 points on [-1, 1]', () => {
    const ys = points(-1, 1, 401).map((x) => softCeiling(x));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it('is odd, so it adds no DC', () => {
    for (const x of [0.1, CEILING_KNEE, 0.75, 0.9, 1, 3]) {
      expect(softCeiling(-x)).toBe(-softCeiling(x));
    }
  });

  it('is continuous at the knee with no kink: just past it, the output moves as fast as the input', () => {
    // The input offset as the doubles hold it: (0.7 + 1e-6) - 0.7 is 1.0000000000287e-6, not 1e-6.
    const dx = CEILING_KNEE + 1e-6 - CEILING_KNEE;
    expect(softCeiling(CEILING_KNEE)).toBe(CEILING_KNEE);
    const above = softCeiling(CEILING_KNEE + dx) - CEILING_KNEE;
    expect(above).toBeGreaterThan(0);
    expect(above).toBeLessThanOrEqual(dx);
    expect(above / dx).toBeCloseTo(1, 6);
  });

  it('never reaches full scale on [-1, 1]', () => {
    for (const x of points(-1, 1, 401)) {
      expect(Math.abs(softCeiling(x))).toBeLessThan(1);
    }
  });

  it('meets the tanh formula at full scale', () => {
    const expected = CEILING_KNEE + (1 - CEILING_KNEE) * Math.tanh(1);
    expect(Math.abs(softCeiling(1) - expected)).toBeLessThan(1e-12);
    expect(Math.abs(softCeiling(-1) + expected)).toBeLessThan(1e-12);
  });

  it('stays bounded by full scale far beyond the curve domain', () => {
    for (const x of [2, 10, 1e6]) {
      expect(softCeiling(x)).toBeLessThanOrEqual(1);
      expect(softCeiling(-x)).toBeGreaterThanOrEqual(-1);
    }
  });

  it('honours a custom knee', () => {
    expect(softCeiling(0.5, 0.6)).toBe(0.5);
    expect(softCeiling(0.5, 0.4)).toBeLessThan(0.5);
    expect(softCeiling(0.5, 0.4)).toBeGreaterThan(0.4);
    expect(Math.abs(softCeiling(1, 0.4) - (0.4 + 0.6 * Math.tanh(1)))).toBeLessThan(1e-12);
  });
});

describe('softCeilingCurve', () => {
  it('is a Float32Array of CEILING_CURVE_LENGTH entries by default', () => {
    const curve = softCeilingCurve();
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(CEILING_CURVE_LENGTH);
  });

  it('maps its middle entry to exactly 0', () => {
    const curve = softCeilingCurve();
    expect(curve[(curve.length - 1) / 2]).toBe(0);
  });

  it('ends at minus and plus f(1), below full scale', () => {
    const curve = softCeilingCurve();
    expect(curve[0]).toBe(Math.fround(-softCeiling(1)));
    expect(curve[curve.length - 1]).toBe(Math.fround(softCeiling(1)));
    expect(curve[curve.length - 1]).toBeLessThan(1);
  });

  it('is strictly increasing', () => {
    const curve = softCeilingCurve();
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    }
  });

  it('is the identity at every entry whose input is at or below the knee, so the node passes that signal untouched', () => {
    const curve = softCeilingCurve();
    const n = curve.length;
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const x = (2 * i) / (n - 1) - 1;
      if (Math.abs(x) <= CEILING_KNEE) {
        expect(curve[i]).toBe(Math.fround(x));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(n / 2);
  });

  it('honours a custom length and knee', () => {
    const curve = softCeilingCurve(5, 0.5);
    expect(Array.from(curve)).toEqual(
      [-softCeiling(1, 0.5), -0.5, 0, 0.5, softCeiling(1, 0.5)].map((y) => Math.fround(y))
    );
  });
});
