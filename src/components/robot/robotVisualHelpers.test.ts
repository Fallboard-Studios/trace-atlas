// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

// Phase 39 Task 10: the colour/shape/socket helpers for the hand-drawn robots are deleted (their
// absence is pinned in legacyRemoval.test.ts); layerLitLevel's cases live in gem/gemPalette.test.ts.
import {
  calculateScale,
  computeBatteryDimOpacity,
  bodyShapeFromAdsr,
  BODY_NORMALISER,
  calculateBodyScale,
  BODY_SCALE_MIN,
  calculateLampIntensity,
  LAMP_MIN,
} from './robotVisualHelpers';
import type { ADSREnvelope } from '../../types/Robot';
import type { OscillatorLayer } from '../../types/layeredAudio';

describe('robotVisualHelpers', () => {
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

  describe('BODY_SCALE_MIN', () => {
    it('is at least 1.5x the pre-Phase-36 floor of 0.49', () => {
      expect(BODY_SCALE_MIN).toBeGreaterThanOrEqual(0.49 * 1.5);
    });
  });

  describe('calculateBodyScale', () => {
    it('treble register at the slowest attack bottoms out at BODY_SCALE_MIN, not the unfloored 0.49', () => {
      expect(calculateBodyScale([3, 5], 0)).toBe(BODY_SCALE_MIN);
    });

    it('bass register at the fastest attack reaches the ceiling of 1.69', () => {
      expect(calculateBodyScale([1, 3], 1)).toBeCloseTo(1.69);
    });

    it('mid register at a neutral attack bias sits at 1.0, above the floor so it is untouched', () => {
      expect(calculateBodyScale([2, 4], 0.5)).toBe(1.0);
    });
  });

  describe('calculateLampIntensity', () => {
    const layer = (gain: number): OscillatorLayer => ({ type: 'sine', gain, detune: 0, phase: 0 });

    it('falls back to a gain of 1 when every layer is muted', () => {
      const layers = [layer(0), layer(0), layer(0)];
      expect(calculateLampIntensity(layers, 0)).toBe(0.6); // 1 * 0.6 + 0 * 0.4
    });

    it('falls back to a gain of 1 when layers is undefined', () => {
      expect(calculateLampIntensity(undefined, 1)).toBe(1); // 1 * 0.6 + 1 * 0.4
    });

    it('clamps to 1 for gains above 1 even with full detail', () => {
      const layers = [layer(1.2), layer(0), layer(1.2)];
      expect(calculateLampIntensity(layers, 1)).toBe(1);
    });

    it('excludes a muted layer from the average instead of averaging it in as zero', () => {
      const layers = [layer(0.2), layer(0)];
      // Averaging the muted layer in as 0 would give (0.2+0)/2 * 0.6 = 0.06; excluding it gives
      // 0.2 * 0.6 = 0.12.
      expect(calculateLampIntensity(layers, 0)).toBeCloseTo(0.12);
    });
  });

  describe('LAMP_MIN', () => {
    it('is 0.4', () => {
      expect(LAMP_MIN).toBe(0.4);
    });
  });

  describe('darken', () => {
    it('is no longer exported from robotVisualHelpers', async () => {
      const helpers: Record<string, unknown> = await import('./robotVisualHelpers');
      expect(helpers.darken).toBeUndefined();
    });
  });
});
