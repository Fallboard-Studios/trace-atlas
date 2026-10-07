// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach } from 'vitest';

import { getTerrainProfile, ridgeYAt, groundYAt, __clearTerrainProfileCache } from './terrainProfile';
import { getLocaleNoiseMap } from '../utils/noiseMaps';

// ========================================
// HELPERS
// ========================================
function freshNoiseMap(localeId: string, x = 0, y = 0) {
  return getLocaleNoiseMap(localeId, x, y);
}

function assertStepShape(step: { x0: number; y0: number; x1: number; y1: number }) {
  const dx = step.x1 - step.x0;
  const dy = step.y1 - step.y0;
  // horizontal, or exactly 45 degrees (float-safe: x and y accumulate
  // independently across many floating-point adds, so compare within an
  // epsilon rather than requiring bit-identical values)
  if (dy === 0) return;
  expect(dx).toBeCloseTo(Math.abs(dy), 9);
}

// ========================================
// TEST SUITE
// ========================================
describe('terrainProfile', () => {
  beforeEach(() => {
    __clearTerrainProfileCache();
  });

  describe('getTerrainProfile', () => {
    it('every step is horizontal or exactly 45 degrees', () => {
      const noiseMap = freshNoiseMap('locale-a');
      const { ridge, ground } = getTerrainProfile('locale-a', noiseMap);

      for (const step of [...ridge, ...ground]) {
        assertStepShape(step);
      }
    });

    it('profiles cover 0..1920 with no gap', () => {
      const noiseMap = freshNoiseMap('locale-b');
      const { ridge, ground } = getTerrainProfile('locale-b', noiseMap);

      for (const steps of [ridge, ground]) {
        expect(steps[0].x0).toBe(0);
        expect(steps[steps.length - 1].x1).toBe(1920);
        for (let i = 1; i < steps.length; i++) {
          // every step's start exactly meets the previous step's end
          expect(steps[i].x0).toBe(steps[i - 1].x1);
          expect(steps[i].y0).toBe(steps[i - 1].y1);
        }
      }
    });

    it('every y stays inside its band', () => {
      const noiseMap = freshNoiseMap('locale-c');
      const { ridge, ground } = getTerrainProfile('locale-c', noiseMap);

      for (const step of ridge) {
        expect(step.y0).toBeGreaterThanOrEqual(640);
        expect(step.y0).toBeLessThanOrEqual(900);
        expect(step.y1).toBeGreaterThanOrEqual(640);
        expect(step.y1).toBeLessThanOrEqual(900);
      }
      for (const step of ground) {
        expect(step.y0).toBeGreaterThanOrEqual(1035);
        expect(step.y0).toBeLessThanOrEqual(1075);
        expect(step.y1).toBeGreaterThanOrEqual(1035);
        expect(step.y1).toBeLessThanOrEqual(1075);
      }
    });

    it('a clamped step shortens its 45-degree run to match (dx === |dy| still holds)', () => {
      // Run the profile over many locales so at least one step clamps against
      // its band (steps of +/-40/+/-60 against an 820-900/640-720-wide band
      // guarantee some draws land outside and must clamp).
      let sawClamp = false;
      for (let i = 0; i < 40; i++) {
        const localeId = `locale-clamp-${i}`;
        const noiseMap = freshNoiseMap(localeId, i, i);
        const { ridge } = getTerrainProfile(localeId, noiseMap);
        for (const step of ridge) {
          // Invariant holds even where a draw would have overshot the band.
          assertStepShape(step);
          const dy = step.y1 - step.y0;
          if ((step.y0 === 640 || step.y0 === 900) && dy !== 0) sawClamp = true;
          if ((step.y1 === 640 || step.y1 === 900) && dy !== 0) sawClamp = true;
        }
      }
      expect(sawClamp).toBe(true);
    });

    it('ground band never dips to y <= 1030, so midground floors (<=1030) stay buried', () => {
      // Checked across many locales, not one seed: the band is wide enough
      // (1035-1075) that a single locale's random walk might not probe its
      // floor, which would let a lowered band slip past this case unnoticed.
      for (let i = 0; i < 30; i++) {
        const localeId = `locale-ground-floor-${i}`;
        const noiseMap = freshNoiseMap(localeId, i, i + 1);
        const { ground } = getTerrainProfile(localeId, noiseMap);

        for (const step of ground) {
          expect(step.y0).toBeGreaterThan(1030);
          expect(step.y1).toBeGreaterThan(1030);
        }
      }
    });

    it('same locale returns an identical profile on a second call (deep-equal)', () => {
      const noiseMap = freshNoiseMap('locale-e');
      const first = getTerrainProfile('locale-e', noiseMap);
      const second = getTerrainProfile('locale-e', noiseMap);

      expect(second).toEqual(first);
    });

    it('two different locales produce different profiles', () => {
      const noiseMapE = freshNoiseMap('locale-f', 10, 20);
      const noiseMapG = freshNoiseMap('locale-g', 30, 40);

      const f = getTerrainProfile('locale-f', noiseMapE);
      const g = getTerrainProfile('locale-g', noiseMapG);

      expect(f).not.toEqual(g);
    });
  });

  describe('ridgeYAt / groundYAt', () => {
    it('returns the flat y on a horizontal run', () => {
      const noiseMap = freshNoiseMap('locale-h');
      const { ridge } = getTerrainProfile('locale-h', noiseMap);
      const flat = ridge.find((s) => s.y0 === s.y1);
      expect(flat).toBeDefined();
      const midX = (flat!.x0 + flat!.x1) / 2;
      expect(ridgeYAt(ridge, midX)).toBeCloseTo(flat!.y0, 5);
    });

    it('interpolates linearly on a sloped step', () => {
      const noiseMap = freshNoiseMap('locale-i');
      const { ridge } = getTerrainProfile('locale-i', noiseMap);
      const sloped = ridge.find((s) => s.y0 !== s.y1);
      expect(sloped).toBeDefined();
      const midX = (sloped!.x0 + sloped!.x1) / 2;
      const expectedY = sloped!.y0 + (sloped!.y1 - sloped!.y0) * 0.5;
      expect(ridgeYAt(ridge, midX)).toBeCloseTo(expectedY, 5);
    });

    it('never throws querying x = 0 or x = 1920', () => {
      const noiseMap = freshNoiseMap('locale-j');
      const { ridge, ground } = getTerrainProfile('locale-j', noiseMap);

      expect(() => ridgeYAt(ridge, 0)).not.toThrow();
      expect(() => ridgeYAt(ridge, 1920)).not.toThrow();
      expect(() => groundYAt(ground, 0)).not.toThrow();
      expect(() => groundYAt(ground, 1920)).not.toThrow();
    });

    it('is deterministic per locale', () => {
      const noiseMap = freshNoiseMap('locale-k');
      const { ridge } = getTerrainProfile('locale-k', noiseMap);
      expect(ridgeYAt(ridge, 500)).toBe(ridgeYAt(ridge, 500));
    });
  });
});
