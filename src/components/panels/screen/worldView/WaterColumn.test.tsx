import { describe, it, expect, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

import { WaterColumn } from './WaterColumn';
import { useUIStore } from '@/stores/uiStore';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '@/utils/lightingUtils';

// ========================================
// FIXTURES
// ========================================

function setLocalTime(hour: number | null) {
  act(() => {
    useUIStore.getState().setActiveLocaleLocalTime(hour);
  });
}

function dAt(hour: number): number {
  const lightMeasure = (hour / 24) * DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(lightMeasure % DAY_CYCLE_MEASURES);
  return 1 - getNightDepth(eastL, westL);
}

function getGroup(container: HTMLElement, localeId: string) {
  return container.querySelector(`g[data-water="${localeId}"]`);
}

afterEach(() => {
  // Wrapped in act(): a still-mounted <WaterColumn> from the just-finished test may still be
  // subscribed to activeLocaleLocalTime (same reset-ordering reason as TerrainLayer.test.tsx's
  // own afterEach) — an unwrapped reset here would trigger a state update outside act().
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
  cleanup();
});

// ========================================
// TESTS
// ========================================

describe('WaterColumn', () => {
  describe('gradient stops track the day/night cycle (§1.5)', () => {
    it.each([0, 6, 12, 18])('matches the §1.5 formula at hour %i within whole-percent rounding', (hour) => {
      setLocalTime(hour);
      const { container } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);

      const d = dAt(hour);
      const expectedTopL = Math.round(8 + (30 - 8) * d);
      const expectedBottomL = Math.round(4 + (12 - 4) * d);

      const gradient = container.querySelector('linearGradient#water-locale-a')!;
      const stops = gradient.querySelectorAll('stop');
      expect(stops[0].getAttribute('stop-color')).toBe(`hsl(200, 45%, ${expectedTopL}%)`);
      expect(stops[1].getAttribute('stop-color')).toBe(`hsl(230, 45%, ${expectedBottomL}%)`);
    });

    it('top and bottom stops differ between noon and midnight', () => {
      setLocalTime(12);
      const { container, rerender } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const noonGradient = container.querySelector('linearGradient#water-locale-a')!;
      const noonStops = Array.from(noonGradient.querySelectorAll('stop')).map((s) => s.getAttribute('stop-color'));

      setLocalTime(0);
      rerender(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const midnightGradient = container.querySelector('linearGradient#water-locale-a')!;
      const midnightStops = Array.from(midnightGradient.querySelectorAll('stop')).map((s) => s.getAttribute('stop-color'));

      expect(noonStops).not.toEqual(midnightStops);
    });

    it('re-render at the same rounded hour produces identical stop attributes (no churn)', () => {
      setLocalTime(9);
      const { container, rerender } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const first = container.querySelector('linearGradient#water-locale-a')!.innerHTML;

      rerender(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const second = container.querySelector('linearGradient#water-locale-a')!.innerHTML;

      expect(second).toBe(first);
    });
  });

  describe('surface glow', () => {
    it('is present at noon and absent at midnight', () => {
      setLocalTime(12);
      const { container, rerender } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      expect(getGroup(container, 'locale-a')!.querySelector('ellipse')).not.toBeNull();

      setLocalTime(0);
      rerender(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      expect(getGroup(container, 'locale-a')!.querySelector('ellipse')).toBeNull();
    });

    it('is omitted exactly when d <= 0.2 (the §1.5 threshold)', () => {
      // Find an hour where d sits just above and just below the 0.2 threshold by scanning the
      // continuous day cycle in small steps, rather than hardcoding a magic hour that could drift
      // if the lighting curve ever changes.
      let aboveHour: number | null = null;
      let belowHour: number | null = null;
      for (let h = 0; h <= 24; h += 0.1) {
        const d = dAt(h);
        if (d > 0.2 && aboveHour === null) aboveHour = h;
        if (d <= 0.2 && d > 0 && belowHour === null && aboveHour !== null) belowHour = h;
      }
      expect(aboveHour).not.toBeNull();
      expect(belowHour).not.toBeNull();

      setLocalTime(aboveHour!);
      const { container, rerender } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      expect(getGroup(container, 'locale-a')!.querySelector('ellipse')).not.toBeNull();

      setLocalTime(belowHour!);
      rerender(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      expect(getGroup(container, 'locale-a')!.querySelector('ellipse')).toBeNull();
    });

    it('opacity equals 0.08 x d, rounded to the nearest whole percent', () => {
      setLocalTime(12);
      const { container } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const ellipse = getGroup(container, 'locale-a')!.querySelector('ellipse')!;
      const expected = Math.round(0.08 * dAt(12) * 100) / 100;
      expect(Number(ellipse.getAttribute('opacity'))).toBeCloseTo(expected, 5);
    });

    it('cx moves with the hour', () => {
      // Both hours chosen well clear of the glow-omit threshold (d > 0.2 at both) so this test
      // isolates cx movement from the present/absent behavior covered above.
      setLocalTime(10);
      const { container, rerender } = render(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const cxAtHour10 = getGroup(container, 'locale-a')!.querySelector('ellipse')!.getAttribute('cx');

      setLocalTime(14);
      rerender(<WaterColumn localeId="locale-a" width={1920} height={1080} />);
      const cxAtHour14 = getGroup(container, 'locale-a')!.querySelector('ellipse')!.getAttribute('cx');

      expect(cxAtHour10).not.toBe(cxAtHour14);
    });
  });

  describe('gradient id', () => {
    it('carries the locale id so two scenes in one document would not collide', () => {
      const { container } = render(
        <>
          <WaterColumn localeId="locale-a" width={1920} height={1080} />
          <WaterColumn localeId="locale-b" width={1920} height={1080} />
        </>,
      );
      expect(container.querySelector('linearGradient#water-locale-a')).not.toBeNull();
      expect(container.querySelector('linearGradient#water-locale-b')).not.toBeNull();
    });
  });

  describe('background rect', () => {
    it('fills the given width/height using the gradient', () => {
      const { container } = render(<WaterColumn localeId="locale-a" width={800} height={400} />);
      const rect = getGroup(container, 'locale-a')!.querySelector('rect')!;
      expect(rect.getAttribute('width')).toBe('800');
      expect(rect.getAttribute('height')).toBe('400');
      expect(rect.getAttribute('fill')).toBe('url(#water-locale-a)');
    });
  });
});
