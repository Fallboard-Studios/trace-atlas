// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  haloDials,
  haloStops,
  HALO_HOLE,
  HALO_RADIUS_MIN,
  HALO_RADIUS_MAX,
  HALO_PEAK,
  HALO_HOLD,
  HALO_TWEEN,
  HALO_RIPPLE_DIM,
  type HaloDialsInput,
} from './haloDials';
import type { ADSREnvelope } from '@/types/Robot';

// ========================================
// FIXTURES
// ========================================
function adsr(overrides: Partial<ADSREnvelope> = {}): ADSREnvelope {
  return { attack: 1, decay: 1, sustain: 0.5, release: 1, ...overrides };
}

function robotFixture(overrides: Partial<HaloDialsInput> = {}): HaloDialsInput {
  return {
    masterVolume: 0.5,
    identityColor: '#aabbcc',
    audioAttributes: { adsr: adsr() } as HaloDialsInput['audioAttributes'],
    ...overrides,
  };
}

const offsets = (stops: { offset: number }[]) => stops.map((s) => s.offset);
const opacities = (stops: { opacity: number }[]) => stops.map((s) => s.opacity);

// ========================================
// TESTS — haloStops (spec §1.1 "Stops": the radius read as time)
// ========================================
describe('haloStops — shape invariants', () => {
  it('always returns exactly six stops', () => {
    expect(haloStops(adsr(), 30)).toHaveLength(6);
    expect(haloStops(adsr({ attack: 0, decay: 0, release: 0 }), 20)).toHaveLength(6);
    expect(haloStops(adsr({ attack: 5, decay: 5, release: 5, sustain: 1 }), 40)).toHaveLength(6);
  });

  it('offsets are non-decreasing, starting at 0 and ending at 1', () => {
    for (const env of [adsr(), adsr({ attack: 0 }), adsr({ decay: 0, release: 0 }), adsr({ attack: 5, decay: 0.1 })]) {
      const o = offsets(haloStops(env, 30));
      expect(o[0]).toBe(0);
      expect(o[5]).toBe(1);
      for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThanOrEqual(o[i - 1]);
    }
  });

  it('stop 1 sits at the hole edge, HALO_HOLE / radius, with opacity 0', () => {
    expect(haloStops(adsr(), 20)[1]).toEqual({ offset: 10 / 20, opacity: 0 });
    expect(haloStops(adsr(), 40)[1]).toEqual({ offset: 10 / 40, opacity: 0 });
  });

  it('centre (stop 0) and outer edge (stop 5) are transparent', () => {
    const s = haloStops(adsr(), 30);
    expect(s[0].opacity).toBe(0);
    expect(s[5].opacity).toBe(0);
  });
});

describe('haloStops — envelope laid out along the radius', () => {
  it('lays attack / decay / hold out as shares of total = a + d + HALO_HOLD + r past the hole', () => {
    // a 1, d 1, hold 1, r 1 → total 4; radius 20 → hole 0.5, span 0.5
    const s = haloStops(adsr({ attack: 1, decay: 1, release: 1, sustain: 0.5 }), 20);
    expect(s[2].offset).toBeCloseTo(0.5 + 0.5 * (1 / 4), 10);
    expect(s[3].offset).toBeCloseTo(0.5 + 0.5 * (2 / 4), 10);
    expect(s[4].offset).toBeCloseTo(0.5 + 0.5 * (3 / 4), 10);
  });

  it('the hold is HALO_HOLD seconds-equivalent: stops 3 and 4 are separated even with decay 0 (mutation: drop HALO_HOLD from total)', () => {
    // a 1, d 0, hold 1, r 2 → total 4; radius 20 → hole 0.5, span 0.5
    const s = haloStops(adsr({ attack: 1, decay: 0, release: 2 }), 20);
    expect(s[3].offset).toBeCloseTo(0.5 + 0.5 * (1 / 4), 10);
    expect(s[4].offset).toBeCloseTo(0.5 + 0.5 * (2 / 4), 10);
    expect(s[4].offset - s[3].offset).toBeCloseTo(0.5 * (HALO_HOLD / 4), 10);
  });

  it('attack 0 → stops 1 and 2 share the hole offset (instant step to the peak)', () => {
    const s = haloStops(adsr({ attack: 0 }), 30);
    expect(s[2].offset).toBe(s[1].offset);
    expect(s[2].opacity).toBe(HALO_PEAK);
  });

  it('decay 0 → stops 2 and 3 share an offset', () => {
    const s = haloStops(adsr({ decay: 0 }), 30);
    expect(s[3].offset).toBe(s[2].offset);
  });

  it('peak opacity at the end of attack is HALO_PEAK = 0.55 (mutation: HALO_PEAK → 0.5)', () => {
    expect(haloStops(adsr(), 30)[2].opacity).toBe(0.55);
    expect(HALO_PEAK).toBe(0.55);
  });

  it('sustain 1 → stops 2, 3 and 4 all at HALO_PEAK', () => {
    const op = opacities(haloStops(adsr({ sustain: 1 }), 30));
    expect(op[2]).toBe(HALO_PEAK);
    expect(op[3]).toBe(HALO_PEAK);
    expect(op[4]).toBe(HALO_PEAK);
  });

  it('sustain 0 → stops 3 and 4 at 0 while stop 2 keeps the peak', () => {
    const op = opacities(haloStops(adsr({ sustain: 0 }), 30));
    expect(op[2]).toBe(HALO_PEAK);
    expect(op[3]).toBe(0);
    expect(op[4]).toBe(0);
  });

  it('sustain 0.5 → stops 3 and 4 at HALO_PEAK × 0.5', () => {
    const op = opacities(haloStops(adsr({ sustain: 0.5 }), 30));
    expect(op[3]).toBeCloseTo(HALO_PEAK * 0.5, 10);
    expect(op[4]).toBeCloseTo(HALO_PEAK * 0.5, 10);
  });

  it('all-zero envelope → offsets at 25 / 50 / 75 % of the span past the hole', () => {
    // radius 40 → hole 0.25, span 0.75
    const o = offsets(haloStops(adsr({ attack: 0, decay: 0, release: 0 }), 40));
    expect(o[2]).toBeCloseTo(0.25 + 0.75 * 0.25, 10);
    expect(o[3]).toBeCloseTo(0.25 + 0.75 * 0.5, 10);
    expect(o[4]).toBeCloseTo(0.25 + 0.75 * 0.75, 10);
  });

  it('release 0 → stop 4 (end of hold) lands at the outer edge, 1', () => {
    const s = haloStops(adsr({ release: 0 }), 30);
    expect(s[4].offset).toBeCloseTo(1, 10);
  });
});

describe('haloStops — inputs clamped to the spawn ranges', () => {
  it('attack 9 clamps to 5 (same stops as attack 5)', () => {
    expect(haloStops(adsr({ attack: 9 }), 30)).toEqual(haloStops(adsr({ attack: 5 }), 30));
  });

  it('negative attack / decay / release clamp to 0', () => {
    expect(haloStops(adsr({ attack: -1, decay: -2, release: -3 }), 30)).toEqual(
      haloStops(adsr({ attack: 0, decay: 0, release: 0 }), 30)
    );
  });

  it('sustain above 1 clamps to 1; below 0 clamps to 0', () => {
    expect(haloStops(adsr({ sustain: 1.7 }), 30)).toEqual(haloStops(adsr({ sustain: 1 }), 30));
    expect(haloStops(adsr({ sustain: -0.4 }), 30)).toEqual(haloStops(adsr({ sustain: 0 }), 30));
  });
});

// ========================================
// TESTS — haloDials (spec §1.1: radius from volume, colour from company)
// ========================================
describe('haloDials — radius (intent table row "Halo size", volume → 20…40)', () => {
  it.each([
    [0, 20],
    [0.5, 30],
    [1, 40],
  ])('volume %d → radius %d', (masterVolume, radius) => {
    expect(haloDials(robotFixture({ masterVolume }), undefined).radius).toBeCloseTo(radius, 10);
  });

  it('volume 1.5 clamps to radius 40; volume -1 clamps to radius 20', () => {
    expect(haloDials(robotFixture({ masterVolume: 1.5 }), undefined).radius).toBe(40);
    expect(haloDials(robotFixture({ masterVolume: -1 }), undefined).radius).toBe(20);
  });

  it('the hole offset follows the radius (a volume edit moves stop 1)', () => {
    expect(haloDials(robotFixture({ masterVolume: 0 }), undefined).stops[1].offset).toBeCloseTo(10 / 20, 10);
    expect(haloDials(robotFixture({ masterVolume: 1 }), undefined).stops[1].offset).toBeCloseTo(10 / 40, 10);
  });

  it('stops are haloStops of the robot envelope at that radius', () => {
    const robot = robotFixture({
      masterVolume: 0.5,
      audioAttributes: { adsr: adsr({ attack: 2, sustain: 0.3 }) } as HaloDialsInput['audioAttributes'],
    });
    expect(haloDials(robot, undefined).stops).toEqual(haloStops(adsr({ attack: 2, sustain: 0.3 }), 30));
  });
});

describe('haloDials — colour (intent table row "Halo colour")', () => {
  it('companyColor wins over identityColor', () => {
    expect(haloDials(robotFixture({ identityColor: '#aabbcc' }), '#ff0000').color).toBe('#ff0000');
  });

  it('undefined companyColor → identityColor (freelance glows in its own card colour)', () => {
    expect(haloDials(robotFixture({ identityColor: '#aabbcc' }), undefined).color).toBe('#aabbcc');
  });

  it('missing identityColor and no company → the #78cce2 fallback RobotBody uses', () => {
    const robot = robotFixture();
    delete (robot as Partial<HaloDialsInput>).identityColor;
    expect(haloDials(robot, undefined).color).toBe('#78cce2');
  });

  it('empty-string identityColor is treated as missing', () => {
    expect(haloDials(robotFixture({ identityColor: '' }), undefined).color).toBe('#78cce2');
  });
});

describe('haloDials — constants match the intent table / sketch defaults', () => {
  it('hole 10, radius 20-40, peak 0.55, hold 1, tween 0.5, ripple dim 0.25', () => {
    expect(HALO_HOLE).toBe(10);
    expect(HALO_RADIUS_MIN).toBe(20);
    expect(HALO_RADIUS_MAX).toBe(40);
    expect(HALO_PEAK).toBe(0.55);
    expect(HALO_HOLD).toBe(1);
    expect(HALO_TWEEN).toBe(0.5);
    expect(HALO_RIPPLE_DIM).toBe(0.25);
  });
});
