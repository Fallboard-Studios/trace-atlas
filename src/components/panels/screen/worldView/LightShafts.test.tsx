import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { LightShafts } from './LightShafts';
import { evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import { assertNinetyFortyFive } from '@/components/actors/scenery/sceneryTestHelpers';
import type { Locale } from '@/types/locale';

// ========================================
// FIXTURES
// ========================================

const TEST_LOCALE: Locale = {
  ...DEFAULT_LOCALE,
  id: 'shaft-test-locale',
  coordinates: { x: -5, y: 9 },
};

function setStoreFixtures(locale: Locale = TEST_LOCALE) {
  useLocaleStore.setState({ locales: { [locale.id]: locale } });
}

function setLocalTime(hour: number | null) {
  act(() => {
    useUIStore.getState().setActiveLocaleLocalTime(hour);
  });
}

function getGroup(container: HTMLElement) {
  return container.querySelector('g[data-atmos="shafts"]');
}

function ndAt(hour: number): number {
  const lightMeasure = (hour / 24) * DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(lightMeasure % DAY_CYCLE_MEASURES);
  return getNightDepth(eastL, westL);
}

beforeEach(() => {
  evictLocaleNoiseMap(TEST_LOCALE.id);
  evictLocaleNoiseMap(DEFAULT_LOCALE_ID);
  evictLocaleNoiseMap('shaft-test-locale-b');
  setStoreFixtures();
});

afterEach(() => {
  // Same reset-ordering reason as TerrainLayer.test.tsx / WaterColumn.test.tsx's own afterEach: a
  // still-mounted <LightShafts> may still be subscribed to activeLocaleLocalTime.
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
  cleanup();
});

// ========================================
// TESTS
// ========================================

describe('LightShafts', () => {
  describe('polygon count (§1.12)', () => {
    it('renders between 3 and 5 polygons, deterministic for a given locale', () => {
      setLocalTime(12);
      const { container, unmount } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      const count = getGroup(container)!.querySelectorAll('polygon').length;
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
      unmount();

      const { container: second } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      const secondCount = getGroup(second)!.querySelectorAll('polygon').length;
      expect(secondCount).toBe(count);
    });

    it('varies the count across locales (not hardcoded to one value)', () => {
      setLocalTime(12);
      const counts = new Set<number>();
      for (let i = 0; i < 25; i++) {
        const locale: Locale = { ...DEFAULT_LOCALE, id: `shaft-sweep-${i}`, coordinates: { x: i, y: -i } };
        setStoreFixtures(locale);
        const { container, unmount } = render(<LightShafts localeId={locale.id} />);
        counts.add(getGroup(container)!.querySelectorAll('polygon').length);
        unmount();
        evictLocaleNoiseMap(locale.id);
      }
      expect(counts.size).toBeGreaterThan(1);
    });
  });

  describe('polygon shape (§1.12)', () => {
    it('each polygon has exactly one vertical edge and one 45-degree edge, depth within 420-760', () => {
      setLocalTime(12);
      const { container } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      const group = getGroup(container)!;
      assertNinetyFortyFive(group);

      const polygons = Array.from(group.querySelectorAll('polygon'));
      expect(polygons.length).toBeGreaterThan(0);

      polygons.forEach((polygon) => {
        const points = polygon.getAttribute('points')!.trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
        expect(points.length).toBe(4);

        let verticalCount = 0;
        let diagonalCount = 0;
        let maxDepth = 0;
        for (let i = 0; i < points.length; i++) {
          const [x0, y0] = points[i];
          const [x1, y1] = points[(i + 1) % points.length];
          const dx = x1 - x0;
          const dy = y1 - y0;
          if (dx === 0 && dy !== 0) verticalCount++;
          else if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.01 && dx !== 0) diagonalCount++;
          maxDepth = Math.max(maxDepth, Math.abs(y0), Math.abs(y1));
        }
        expect(verticalCount).toBe(1);
        expect(diagonalCount).toBe(1);
        expect(maxDepth).toBeGreaterThanOrEqual(420);
        expect(maxDepth).toBeLessThanOrEqual(760);
      });
    });

    it('every polygon starts at the top edge (y = 0)', () => {
      setLocalTime(12);
      const { container } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      const group = getGroup(container)!;
      group.querySelectorAll('polygon').forEach((polygon) => {
        const points = polygon.getAttribute('points')!.trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
        const topYs = points.map(([, y]) => y).filter((y) => y === 0);
        expect(topYs.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('gradient opacity tracks the day/night cycle (§1.12)', () => {
    it('top stop opacity equals 0.11 x (1 - nightDepth) at hour 12', () => {
      setLocalTime(12);
      const { container } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      const group = getGroup(container)!;
      const stops = group.querySelectorAll('linearGradient stop');
      const expected = 0.11 * (1 - ndAt(12));
      expect(Number(stops[0].getAttribute('stop-opacity'))).toBeCloseTo(expected, 3);
      expect(Number(stops[1].getAttribute('stop-opacity'))).toBe(0);
    });

    it('is entirely absent at hour 0 (opacity below the 0.005 omit threshold)', () => {
      setLocalTime(0);
      const { container } = render(<LightShafts localeId={TEST_LOCALE.id} />);
      expect(0.11 * (1 - ndAt(0))).toBeLessThan(0.005);
      expect(getGroup(container)).toBeNull();
    });
  });

  describe('gradient id', () => {
    it('carries the locale id so two scenes in one document would not collide', () => {
      setLocalTime(12);
      const localeB: Locale = { ...DEFAULT_LOCALE, id: 'shaft-test-locale-b', coordinates: { x: 40, y: -12 } };
      useLocaleStore.setState({
        locales: { [TEST_LOCALE.id]: TEST_LOCALE, [localeB.id]: localeB },
      });

      const { container } = render(
        <>
          <LightShafts localeId={TEST_LOCALE.id} />
          <LightShafts localeId={localeB.id} />
        </>,
      );
      const gradientA = container.querySelector(`linearGradient[id$="${TEST_LOCALE.id}"]`);
      const gradientB = container.querySelector(`linearGradient[id$="${localeB.id}"]`);
      expect(gradientA).not.toBeNull();
      expect(gradientB).not.toBeNull();
      expect(gradientA!.id).not.toBe(gradientB!.id);
    });
  });

  describe('missing locale', () => {
    it('renders nothing when the locale does not exist (defensive)', () => {
      setLocalTime(12);
      const { container } = render(<LightShafts localeId="does-not-exist" />);
      expect(container.querySelector('g[data-atmos="shafts"]')).toBeNull();
    });
  });
});
