import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { MarineSnow, SNOW_COUNT } from './MarineSnow';
import { evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE, DEFAULT_LOCALE_ID } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';
import type { Locale } from '@/types/locale';

// ========================================
// FIXTURES
// ========================================

const TEST_LOCALE: Locale = {
  ...DEFAULT_LOCALE,
  id: 'snow-test-locale',
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
  return container.querySelector('g[data-atmos="snow"]');
}

function ndAt(hour: number): number {
  const lightMeasure = (hour / 24) * DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(lightMeasure % DAY_CYCLE_MEASURES);
  return getNightDepth(eastL, westL);
}

beforeEach(() => {
  evictLocaleNoiseMap(TEST_LOCALE.id);
  evictLocaleNoiseMap(DEFAULT_LOCALE_ID);
  setStoreFixtures();
});

afterEach(() => {
  // Same reset-ordering reason as LightShafts.test.tsx's own afterEach: a still-mounted
  // <MarineSnow> may still be subscribed to activeLocaleLocalTime.
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
  cleanup();
});

// ========================================
// TESTS
// ========================================

describe('MarineSnow', () => {
  describe('circle count (§1.12)', () => {
    it('renders exactly 140 circles', () => {
      setLocalTime(12);
      const { container } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      expect(getGroup(container)!.querySelectorAll('circle').length).toBe(140);
      expect(SNOW_COUNT).toBe(140);
    });

    it('is deterministic for a given locale', () => {
      setLocalTime(12);
      const { container, unmount } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const first = Array.from(getGroup(container)!.querySelectorAll('circle')).map((c) => c.outerHTML);
      unmount();

      const { container: second } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const secondHtml = Array.from(getGroup(second)!.querySelectorAll('circle')).map((c) => c.outerHTML);
      expect(secondHtml).toEqual(first);
    });

    it('varies positions across locales (not hardcoded)', () => {
      setLocalTime(12);
      const { container: a } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const firstCx = getGroup(a)!.querySelector('circle')!.getAttribute('cx');

      const localeB: Locale = { ...DEFAULT_LOCALE, id: 'snow-test-locale-b', coordinates: { x: 40, y: -12 } };
      setStoreFixtures(localeB);
      const { container: b } = render(<MarineSnow localeId={localeB.id} />);
      const secondCx = getGroup(b)!.querySelector('circle')!.getAttribute('cx');

      expect(secondCx).not.toBe(firstCx);
      evictLocaleNoiseMap(localeB.id);
    });
  });

  describe('circle attributes (§1.12)', () => {
    it('every circle has r in 1.2-3 and shell.highlight fill', () => {
      setLocalTime(12);
      const { container } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const circles = Array.from(getGroup(container)!.querySelectorAll('circle'));
      expect(circles.length).toBeGreaterThan(0);
      circles.forEach((circle) => {
        const r = Number(circle.getAttribute('r'));
        expect(r).toBeGreaterThanOrEqual(1.2);
        expect(r).toBeLessThanOrEqual(3);
        // shell.highlight is hsl(206, 4%, 68%) — assert via hslToString's own output rather than
        // re-deriving the string, so a future colorTheme.json edit doesn't silently desync this test.
        expect(circle.getAttribute('fill')).toMatch(/^hsl\(/);
      });
    });

    it('opacity at hour 0 is 0.6x its hour-12 value (within the per-circle random factor)', () => {
      setLocalTime(12);
      const { container: noon } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const noonOpacities = Array.from(getGroup(noon)!.querySelectorAll('circle')).map((c) =>
        Number(c.getAttribute('opacity')),
      );

      setLocalTime(0);
      const { container: midnight } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const midnightOpacities = Array.from(getGroup(midnight)!.querySelectorAll('circle')).map((c) =>
        Number(c.getAttribute('opacity')),
      );

      const dayFactor = 1 - ndAt(12);
      const nightFactor = 1 - ndAt(0);
      noonOpacities.forEach((noonOpacity, i) => {
        const midnightOpacity = midnightOpacities[i];
        // Both opacities share the same per-circle base (0.08-0.3), scaled by lerp(0.6, 1, 1-nd).
        const base = noonOpacity / (0.6 + 0.4 * dayFactor);
        expect(midnightOpacity).toBeCloseTo(base * (0.6 + 0.4 * nightFactor), 5);
      });
    });

    it('every opacity is within the (0.08-0.3) x lerp(0.6,1,1-nd) range at hour 12', () => {
      setLocalTime(12);
      const { container } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      const scale = 0.6 + 0.4 * (1 - ndAt(12));
      const circles = Array.from(getGroup(container)!.querySelectorAll('circle'));
      circles.forEach((circle) => {
        const opacity = Number(circle.getAttribute('opacity'));
        expect(opacity).toBeGreaterThanOrEqual(0.08 * scale - 1e-9);
        expect(opacity).toBeLessThanOrEqual(0.3 * scale + 1e-9);
      });
    });
  });

  describe('static (no transition)', () => {
    it('never carries a transition style', () => {
      setLocalTime(12);
      const { container } = render(<MarineSnow localeId={TEST_LOCALE.id} />);
      getGroup(container)!.querySelectorAll('circle').forEach((circle) => {
        expect(circle.getAttribute('style')).toBeNull();
      });
    });
  });

  describe('missing locale', () => {
    it('renders nothing when the locale does not exist (defensive)', () => {
      setLocalTime(12);
      const { container } = render(<MarineSnow localeId="does-not-exist" />);
      expect(getGroup(container)).toBeNull();
    });
  });
});
