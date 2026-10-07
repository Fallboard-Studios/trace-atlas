import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { TerrainLayer } from './TerrainLayer';
import { getTerrainProfile, __clearTerrainProfileCache } from '@/systems/terrainProfile';
import { getLocaleNoiseMap, evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import type { Locale } from '@/types/locale';

// ========================================
// FIXTURES
// ========================================

const TEST_LOCALE: Locale = {
  ...DEFAULT_LOCALE,
  id: 'terrain-test-locale',
  coordinates: { x: -5, y: 9 },
};

function setStoreFixtures() {
  useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: TEST_LOCALE } });
}

function setLocalTime(hour: number | null) {
  act(() => {
    useUIStore.getState().setActiveLocaleLocalTime(hour);
  });
}

function getPolygon(container: HTMLElement, part: 'ridge' | 'ground') {
  return container.querySelector(`polygon[data-terrain="${part}"]`);
}

beforeEach(() => {
  __clearTerrainProfileCache();
  evictLocaleNoiseMap(TEST_LOCALE.id);
  evictLocaleNoiseMap(DEFAULT_LOCALE_ID);
  setStoreFixtures();
});

afterEach(() => {
  // Wrapped in act(): a still-mounted <TerrainLayer> from the just-finished test may still be
  // subscribed to activeLocaleLocalTime (same reset-ordering reason as Factory.test.tsx's own
  // afterEach) — an unwrapped reset here would trigger a state update outside act().
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
  cleanup();
});

// ========================================
// TESTS
// ========================================

describe('TerrainLayer', () => {
  describe('polygon points', () => {
    it('ridge polygon points equal the ridge profile steps plus the two bottom corners', () => {
      const noiseMap = getLocaleNoiseMap(TEST_LOCALE.id, TEST_LOCALE.coordinates.x, TEST_LOCALE.coordinates.y);
      const { ridge } = getTerrainProfile(TEST_LOCALE.id, noiseMap);

      const { container } = render(<TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />);
      const polygon = getPolygon(container, 'ridge');
      expect(polygon).not.toBeNull();

      const expectedPoints = [
        `${ridge[0].x0},${ridge[0].y0}`,
        ...ridge.map((s) => `${s.x1},${s.y1}`),
        '1920,1080',
        '0,1080',
      ].join(' ');
      expect(polygon!.getAttribute('points')).toBe(expectedPoints);
    });

    it('ground polygon points equal the ground profile steps plus the two bottom corners', () => {
      const noiseMap = getLocaleNoiseMap(TEST_LOCALE.id, TEST_LOCALE.coordinates.x, TEST_LOCALE.coordinates.y);
      const { ground } = getTerrainProfile(TEST_LOCALE.id, noiseMap);

      const { container } = render(<TerrainLayer localeId={TEST_LOCALE.id} part="ground" width={1920} height={1080} />);
      const polygon = getPolygon(container, 'ground');
      expect(polygon).not.toBeNull();

      const expectedPoints = [
        `${ground[0].x0},${ground[0].y0}`,
        ...ground.map((s) => `${s.x1},${s.y1}`),
        '1920,1080',
        '0,1080',
      ].join(' ');
      expect(polygon!.getAttribute('points')).toBe(expectedPoints);
    });

    it('uses the given width/height for the two bottom corners, not a hardcoded 1920x1080', () => {
      const { container } = render(<TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={800} height={400} />);
      const polygon = getPolygon(container, 'ridge');
      const points = polygon!.getAttribute('points')!.split(' ');
      expect(points.at(-2)).toBe('800,400');
      expect(points.at(-1)).toBe('0,400');
    });
  });

  describe('fill lightness tracks the day/night cycle', () => {
    it('ridge and ground fills differ between noon and midnight', () => {
      setLocalTime(12);
      const { container } = render(
        <>
          <TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />
          <TerrainLayer localeId={TEST_LOCALE.id} part="ground" width={1920} height={1080} />
        </>,
      );
      const noonRidgeFill = getPolygon(container, 'ridge')!.getAttribute('fill');
      const noonGroundFill = getPolygon(container, 'ground')!.getAttribute('fill');

      setLocalTime(0);
      const midnightRidgeFill = getPolygon(container, 'ridge')!.getAttribute('fill');
      const midnightGroundFill = getPolygon(container, 'ground')!.getAttribute('fill');

      expect(noonRidgeFill).not.toBe(midnightRidgeFill);
      expect(noonGroundFill).not.toBe(midnightGroundFill);
    });

    // §1.3: ridge fill = shadowDepth (h0 s0 l10) lightened by 1 + m*1.2; ground fill =
    // body.shadow (h203 s13 l12) lightened by m*0.9, where m = mean(eastL, westL) at the
    // current hour — the same eastL/westL Factory.tsx derives from activeLocaleLocalTime.
    it('matches the §1.3 formula at noon within whole-percent rounding', () => {
      setLocalTime(12);
      const { container } = render(
        <>
          <TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />
          <TerrainLayer localeId={TEST_LOCALE.id} part="ground" width={1920} height={1080} />
        </>,
      );
      const cycleMeasure = (12 / 24) * DAY_CYCLE_MEASURES;
      const { eastL, westL } = getLighting(cycleMeasure);
      const m = (eastL + westL) / 2;
      const expectedRidgeL = Math.round(10 * (1 + m * 1.2));
      const expectedGroundL = Math.round(12 * (m * 0.9));

      expect(getPolygon(container, 'ridge')!.getAttribute('fill')).toBe(`hsl(0, 0%, ${expectedRidgeL}%)`);
      expect(getPolygon(container, 'ground')!.getAttribute('fill')).toBe(`hsl(203, 13%, ${expectedGroundL}%)`);
    });

    it('re-render at the same rounded hour produces an identical fill attribute (no churn)', () => {
      setLocalTime(9);
      const { container, rerender } = render(<TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />);
      const first = getPolygon(container, 'ridge')!.getAttribute('fill');

      rerender(<TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />);
      const second = getPolygon(container, 'ridge')!.getAttribute('fill');

      expect(second).toBe(first);
    });

    it('carries no transition style on the polygon', () => {
      const { container } = render(<TerrainLayer localeId={TEST_LOCALE.id} part="ridge" width={1920} height={1080} />);
      const polygon = getPolygon(container, 'ridge')!;
      expect(polygon.getAttribute('style')).toBeNull();
    });
  });

  describe('missing locale', () => {
    it('renders nothing when the locale does not exist (defensive)', () => {
      const { container } = render(<TerrainLayer localeId="does-not-exist" part="ridge" width={1920} height={1080} />);
      expect(getPolygon(container, 'ridge')).toBeNull();
      expect(container.querySelector('polygon')).toBeNull();
    });
  });
});
