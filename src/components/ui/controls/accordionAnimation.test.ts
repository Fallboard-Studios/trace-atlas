import { describe, it, expect } from 'vitest';
import {
  getAccordionDuration,
  getAccordionFadeDuration,
  ACCORDION_DURATION,
  ACCORDION_FADE_DURATION,
  FIRST_OPEN_MAX_SETTLE_TICKS,
} from './accordionAnimation';

describe('getAccordionDuration', () => {
  it('returns 0 when prefers-reduced-motion is set', () => {
    expect(getAccordionDuration(true)).toBe(0);
  });

  it('returns ACCORDION_DURATION otherwise', () => {
    expect(getAccordionDuration(false)).toBe(ACCORDION_DURATION);
  });
});

describe('getAccordionFadeDuration', () => {
  it('returns 0 when prefers-reduced-motion is set', () => {
    expect(getAccordionFadeDuration(true)).toBe(0);
  });

  it('returns ACCORDION_FADE_DURATION otherwise', () => {
    expect(getAccordionFadeDuration(false)).toBe(ACCORDION_FADE_DURATION);
  });
});

describe('documented invariants', () => {
  it('the fade duration is shorter than the height-tween duration (sequenced, never simultaneous)', () => {
    expect(ACCORDION_FADE_DURATION).toBeLessThan(ACCORDION_DURATION);
  });

  it('FIRST_OPEN_MAX_SETTLE_TICKS is a positive integer', () => {
    expect(Number.isInteger(FIRST_OPEN_MAX_SETTLE_TICKS)).toBe(true);
    expect(FIRST_OPEN_MAX_SETTLE_TICKS).toBeGreaterThan(0);
  });
});
