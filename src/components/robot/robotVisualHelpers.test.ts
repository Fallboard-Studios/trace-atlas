// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  selectRobotShape,
  calculateScale,
  calculateDetailLevel,
  generateColors,
  hueOffset,
  toSaturation,
  toLuminance,
  calculateGreebleCount,
  computeBatteryDimOpacity,
  bodyShapeFromAdsr,
  BODY_NORMALISER,
} from './robotVisualHelpers';
import { RobotSleek } from './RobotSleek';
import type { AudioAttributes, ADSREnvelope } from '../../types/Robot';

describe('robotVisualHelpers', () => {
  describe('selectRobotShape', () => {
    it('returns a default RobotSleek for sine waveform', () => {
      const result = selectRobotShape('sine' as const);
      expect(result).toBe(RobotSleek);
    });
  });

  describe('generateColors (new HSL mapping)', () => {
    it('returns HSL strings for primary/secondary/accent', () => {
      const attrs = {
        adsr: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
        filterFreq: 1000,
        waveform: 'sine',
      } as unknown as AudioAttributes;

      const colors = generateColors(attrs);
      const hslRegex = /^hsl\(\d+,\s*\d+%,\s*\d+%\)$/;
      expect(hslRegex.test(colors.primary)).toBe(true);
      expect(hslRegex.test(colors.secondary)).toBe(true);
      expect(hslRegex.test(colors.accent)).toBe(true);
    });

    it('varies primary hue by waveform', () => {
      const base = {
        adsr: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.2 },
        filterFreq: 800,
      } as unknown as Omit<AudioAttributes, 'waveform'>;

      // generateColors now varies primarily by ADSR; ensure different ADSR yields different primary hues
      const a = generateColors({ ...base, waveform: 'sine', adsr: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 } } as AudioAttributes);
      const b = generateColors({ ...base, waveform: 'sine', adsr: { attack: 0.5, decay: 1.0, sustain: 0.1, release: 1.0 } } as AudioAttributes);
      expect(a.primary).not.toEqual(b.primary);
    });
  });

  describe('color helpers', () => {
    it('hueOffset returns a finite number and varies with ADSR', () => {
      const a: AudioAttributes['adsr'] = { attack: 0.05, decay: 0.1, sustain: 0.5, release: 0.2 };
      const b: AudioAttributes['adsr'] = { attack: 0.5, decay: 1.5, sustain: 0.2, release: 1.0 };

      const ha = hueOffset(a);
      const hb = hueOffset(b);

      expect(Number.isFinite(ha)).toBe(true);
      expect(Number.isFinite(hb)).toBe(true);
      expect(ha).not.toEqual(hb);
    });

    it('toSaturation: faster attack -> higher saturation', () => {
      const fast = toSaturation(0.01);
      const slow = toSaturation(0.7);
      expect(fast).toBeGreaterThan(slow);
    });

    it('toLuminance: higher sustain -> higher luminance', () => {
      const low = toLuminance(0.0);
      const high = toLuminance(1.0);
      expect(high).toBeGreaterThan(low);
    });

    it('calculateGreebleCount: deterministic, integer, and capped at 16', () => {
      const waveform = 'sawtooth' as const;
      const adsr1: ADSREnvelope = { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.2 };
      const adsr2: ADSREnvelope = { attack: 0.5, decay: 1.0, sustain: 0.1, release: 1.0 };

      const c1 = calculateGreebleCount(2200, 1.0, waveform, adsr1);
      const c2 = calculateGreebleCount(200, 0.0, waveform, adsr2);

      expect(Number.isInteger(c1)).toBe(true);
      expect(Number.isInteger(c2)).toBe(true);
      expect(c1).toBeGreaterThanOrEqual(0);
      expect(c1).toBeLessThanOrEqual(16);
      expect(c2).toBeGreaterThanOrEqual(0);
      expect(c2).toBeLessThanOrEqual(16);
      // different inputs should often produce different results
      expect(c1).not.toEqual(c2);
    });
  });

  describe('calculateScale', () => {
    it('returns 0.7 for treble register', () => {
      expect(calculateScale([3, 5])).toBe(0.7);
    });

    it('returns 1.0 for mid register', () => {
      expect(calculateScale([2, 4])).toBe(1.0);
    });

    it('returns 1.3 for bass register', () => {
      expect(calculateScale([1, 3])).toBe(1.3);
    });
  });

  describe('calculateDetailLevel', () => {
    it('returns 0.0 for filter frequency at or below low threshold', () => {
      expect(calculateDetailLevel(400)).toBe(0.0);
      expect(calculateDetailLevel(500)).toBe(0.0);
    });

    it('returns 1.0 for filter frequency at or above high threshold', () => {
      expect(calculateDetailLevel(2000)).toBe(1.0);
      expect(calculateDetailLevel(3000)).toBe(1.0);
    });
  });

  describe('computeBatteryDimOpacity', () => {
    it('returns full opacity (no dim) above the low threshold', () => {
      expect(computeBatteryDimOpacity(100)).toBe(1);
      expect(computeBatteryDimOpacity(51)).toBe(1);
    });

    it('returns 0.75 (25% dim) at or below 50%, down to just above 25%', () => {
      expect(computeBatteryDimOpacity(50)).toBe(0.75);
      expect(computeBatteryDimOpacity(30)).toBe(0.75);
      expect(computeBatteryDimOpacity(25)).toBe(0.75); // "less than 25" — 25 itself is still this tier
    });

    it('returns 0.5 (50% dim) below 25%, down to just above 12%', () => {
      expect(computeBatteryDimOpacity(24)).toBe(0.5);
      expect(computeBatteryDimOpacity(20)).toBe(0.5);
      expect(computeBatteryDimOpacity(13)).toBe(0.5);
    });

    it('returns 0.1 (90% dim) at or below 12%', () => {
      expect(computeBatteryDimOpacity(12)).toBe(0.1);
      expect(computeBatteryDimOpacity(5)).toBe(0.1);
      expect(computeBatteryDimOpacity(0)).toBe(0.1);
    });

    it('is a step function, not additive — critical-tier battery does not stack all three dims', () => {
      // If tiers were summed (0.25 + 0.5 + 0.9 dim), opacity would go negative.
      // The deepest applicable tier alone applies.
      expect(computeBatteryDimOpacity(0)).toBe(0.1);
    });
  });

  describe('BODY_NORMALISER', () => {
    it('matches the seeded attack/release range (5s) and sustain range (1)', () => {
      expect(BODY_NORMALISER).toEqual({ attack: 5, sustain: 1, release: 5 });
    });
  });

  describe('bodyShapeFromAdsr', () => {
    it('an all-zero envelope maps to the biggest, squarest, plainest body', () => {
      const adsr: ADSREnvelope = { attack: 0, decay: 0, sustain: 0, release: 0 };
      expect(bodyShapeFromAdsr(adsr)).toEqual({ scale: 1, roundness: 0, detail: 0 });
    });

    it('attack at the normaliser clamps scale to its floor (0.25)', () => {
      const adsr: ADSREnvelope = { attack: 5, decay: 0, sustain: 0, release: 0 };
      expect(bodyShapeFromAdsr(adsr).scale).toBe(0.25);
    });

    it('attack beyond the normaliser still clamps scale to 0.25, not negative', () => {
      const adsr: ADSREnvelope = { attack: 10, decay: 0, sustain: 0, release: 0 };
      expect(bodyShapeFromAdsr(adsr).scale).toBe(0.25);
    });

    it('release at half the normaliser gives exactly 0.5 detail', () => {
      const adsr: ADSREnvelope = { attack: 0, decay: 0, sustain: 0, release: 2.5 };
      expect(bodyShapeFromAdsr(adsr).detail).toBe(0.5);
    });

    it('sustain at its max gives exactly 1 roundness', () => {
      const adsr: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 };
      expect(bodyShapeFromAdsr(adsr).roundness).toBe(1);
    });
  });
});
