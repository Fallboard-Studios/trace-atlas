import { describe, it, expect } from 'vitest';
import { lamp, NO_SHIFT } from './sceneryColor';

const BASE = { h: 200, s: 50, l: 40 };

describe('NO_SHIFT', () => {
  it('is a zero hue/sat shift', () => {
    expect(NO_SHIFT).toEqual({ hueShift: 0, satShift: 0 });
  });
});

describe('lamp', () => {
  it('at nightDepth 0, lightness is half the base (lo defaults to 0.5)', () => {
    expect(lamp(BASE, 0)).toBe('hsl(200, 50%, 20%)');
  });

  it('at nightDepth 1, lightness equals the base in full', () => {
    expect(lamp(BASE, 1)).toBe('hsl(200, 50%, 40%)');
  });

  it('rises monotonically with nightDepth', () => {
    const dim = lamp(BASE, 0.2);
    const bright = lamp(BASE, 0.8);
    const dimL = Number(/,\s*(\d+)%\)$/.exec(dim)![1]);
    const brightL = Number(/,\s*(\d+)%\)$/.exec(bright)![1]);
    expect(brightL).toBeGreaterThan(dimL);
  });

  it('a custom floor (lo) changes the nightDepth-0 value', () => {
    expect(lamp(BASE, 0, 0.8)).toBe('hsl(200, 50%, 32%)');
  });

  it('mutation check: using nightDepth as the lMultiplier directly (skipping the lerp floor) would make nd=0 fully dark, not half-lit', () => {
    expect(lamp(BASE, 0)).not.toBe('hsl(200, 50%, 0%)');
  });
});
