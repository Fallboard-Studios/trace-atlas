import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { LightShafts } from './LightShafts';
import { seedLightShafts } from './seedLightShafts';
import { renderSvg } from '@/testUtils/renderSvg';
import { outerTenths } from '@/testUtils/spread';

import { evictLocaleNoiseMap, getLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, getNightDepth } from '@/utils/lightingUtils';
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
  const { eastL, westL } = getLighting(hour);
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
      const { container, unmount } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
      const count = getGroup(container)!.querySelectorAll('polygon').length;
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
      unmount();

      const { container: second } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
      const secondCount = getGroup(second)!.querySelectorAll('polygon').length;
      expect(secondCount).toBe(count);
    });

    it('varies the count across locales (not hardcoded to one value)', () => {
      setLocalTime(12);
      const counts = new Set<number>();
      for (let i = 0; i < 25; i++) {
        const locale: Locale = { ...DEFAULT_LOCALE, id: `shaft-sweep-${i}`, coordinates: { x: i, y: -i } };
        setStoreFixtures(locale);
        const { container, unmount } = renderSvg(<LightShafts localeId={locale.id} />);
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
      const { container } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
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
      const { container } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
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
      const { container } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
      const group = getGroup(container)!;
      // The gradient's stops are the only <stop>s in the group (jsdom's selector engine does not match a
      // camelCase SVG tag in a descendant selector once the tree is in the SVG namespace).
      const stops = group.querySelectorAll('stop');
      const expected = 0.11 * (1 - ndAt(12));
      expect(Number(stops[0].getAttribute('stop-opacity'))).toBeCloseTo(expected, 3);
      expect(Number(stops[1].getAttribute('stop-opacity'))).toBe(0);
    });

    it('is entirely absent at hour 0 (opacity below the 0.005 omit threshold)', () => {
      setLocalTime(0);
      const { container } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
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

      const { container } = renderSvg(
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
      const { container } = renderSvg(<LightShafts localeId="does-not-exist" />);
      expect(container.querySelector('g[data-atmos="shafts"]')).toBeNull();
    });
  });

  describe('seedLightShafts', () => {
    it("the component renders exactly the shafts seedLightShafts gives for the locale's map", () => {
      setLocalTime(12);
      const { dir, shafts } = seedLightShafts(
        getLocaleNoiseMap(TEST_LOCALE.id, TEST_LOCALE.coordinates.x, TEST_LOCALE.coordinates.y),
      );
      const { container } = renderSvg(<LightShafts localeId={TEST_LOCALE.id} />);
      const rendered = Array.from(getGroup(container)!.querySelectorAll('polygon')).map((p) => p.getAttribute('points'));
      expect(rendered).toEqual(
        shafts.map(({ x, w, depth }) => `${x},0 ${x + w},0 ${x + w + dir * depth},${depth} ${x},${depth}`),
      );
    });
  });
});

// Even World Draws (docs/specs/EVEN_WORLD_DRAWS.md §5.1, docs/tasks/EVEN_WORLD_DRAWS.md T6): the shafts' seeded geometry
// over 3,000 real locale maps (each seeded `${x}:${y}`, as a locale's is). Every tolerance is at least 3 standard
// deviations of its share.
describe('the light shafts draw even (Even World Draws T6)', () => {
  const WORLDS = 3000;
  const seeded = Array.from({ length: WORLDS }, (_, i) =>
    seedLightShafts(createNoise2D(alea(`${(i % 60) * 7 - 210}:${Math.floor(i / 60) * 7 - 175}`))));
  const shafts = seeded.flatMap((s) => s.shafts);

  const expectTenths = (values: number[], band: { min: number; max: number }, label: string) => {
    expect(Math.min(...values), label).toBeGreaterThanOrEqual(band.min);
    expect(Math.max(...values), label).toBeLessThan(band.max);
    const { bottom, top } = outerTenths(values, band);
    expect(bottom, `${label} bottom`).toBeGreaterThanOrEqual(0.08);
    expect(bottom, `${label} bottom`).toBeLessThanOrEqual(0.12);
    expect(top, `${label} top`).toBeGreaterThanOrEqual(0.08);
    expect(top, `${label} top`).toBeLessThanOrEqual(0.12);
  };

  it('3, 4 and 5 shafts each start a third of worlds (+/-3 points)', () => {
    for (const count of [3, 4, 5]) {
      const share = seeded.filter((s) => s.shafts.length === count).length / WORLDS;
      expect(share, `${count} shafts`).toBeGreaterThanOrEqual(0.303);
      expect(share, `${count} shafts`).toBeLessThanOrEqual(0.363);
    }
  });

  it('each direction is half the worlds (+/-3 points), and only ever -1 or 1', () => {
    expect(seeded.every((s) => s.dir === -1 || s.dir === 1)).toBe(true);
    const share = seeded.filter((s) => s.dir === -1).length / WORLDS;
    expect(share).toBeGreaterThanOrEqual(0.47);
    expect(share).toBeLessThanOrEqual(0.53);
  });

  it('the direction is independent of the count: half of each count rakes each way (+/-5 points)', () => {
    for (const count of [3, 4, 5]) {
      const worlds = seeded.filter((s) => s.shafts.length === count);
      const share = worlds.filter((s) => s.dir === -1).length / worlds.length;
      expect(share, `${count} shafts`).toBeGreaterThanOrEqual(0.45);
      expect(share, `${count} shafts`).toBeLessThanOrEqual(0.55);
    }
  });

  it('the widths fill 50-160, the depths 420-760 and the xs -200-1920: 8-12 % in each outer tenth', () => {
    expectTenths(shafts.map((s) => s.w), { min: 50, max: 160 }, 'width');
    expectTenths(shafts.map((s) => s.depth), { min: 420, max: 760 }, 'depth');
    expectTenths(shafts.map((s) => s.x), { min: -200, max: 1920 }, 'x');
  });
});
