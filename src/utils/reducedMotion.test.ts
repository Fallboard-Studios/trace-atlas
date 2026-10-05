// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach } from 'vitest';

import { prefersReducedMotion } from './reducedMotion';

// ========================================
// TESTS
// ========================================
describe('prefersReducedMotion — lifted from BubbleStream.tsx (Phase 40 Task 8)', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('is true when the OS/browser reports prefers-reduced-motion: reduce', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the preference does not match', () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when window.matchMedia is unavailable (defensive, pre-jsdom-polyfill environments)', () => {
    // @ts-expect-error — simulating an environment without matchMedia
    window.matchMedia = undefined;
    expect(prefersReducedMotion()).toBe(false);
  });
});
