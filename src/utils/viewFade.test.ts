import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/animation/timelineMap', () => ({ setTimeline: vi.fn(), killTimeline: vi.fn() }));

let timelineCalls: Array<{ target: unknown; vars: Record<string, unknown> }> = [];
vi.mock('gsap', () => {
  const chainable = {
    to: (target: unknown, vars: Record<string, unknown>) => {
      timelineCalls.push({ target, vars });
      return chainable;
    },
  };
  return { default: { timeline: vi.fn(() => chainable) } };
});

import { setViewFadeRoot, fadeInView } from './viewFade';
import { setTimeline, killTimeline } from '@/animation/timelineMap';

function stubMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') && prefersReducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe('viewFade — setViewFadeRoot/fadeInView', () => {
  beforeEach(() => {
    timelineCalls = [];
    vi.clearAllMocks();
    stubMatchMedia(false);
    setViewFadeRoot(null);
  });

  afterEach(() => {
    setViewFadeRoot(null);
  });

  it('is a no-op, not a throw, when no root is registered', () => {
    expect(() => fadeInView()).not.toThrow();
    expect(setTimeline).not.toHaveBeenCalled();
  });

  it('tweens the registered root\'s opacity to 1 over 250ms (0.25s, GSAP duration units)', () => {
    const el = document.createElement('div');
    setViewFadeRoot(el);

    fadeInView();

    expect(timelineCalls).toContainEqual({ target: el, vars: { opacity: 1, duration: 0.25, ease: 'power1.out' } });
  });

  it('registers the tween in timelineMap under a fixed key', () => {
    const el = document.createElement('div');
    setViewFadeRoot(el);

    fadeInView();

    expect(setTimeline).toHaveBeenCalledWith('nav-view-fade-in', expect.anything());
  });

  it('kills any prior fade timeline before starting a new one', () => {
    const el = document.createElement('div');
    setViewFadeRoot(el);

    fadeInView();

    expect(killTimeline).toHaveBeenCalledWith('nav-view-fade-in');
  });

  it('uses duration 0 under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const el = document.createElement('div');
    setViewFadeRoot(el);

    fadeInView();

    expect(timelineCalls[0].vars.duration).toBe(0);
  });

  it('setViewFadeRoot(null) clears the root — a subsequent fadeInView is a no-op', () => {
    const el = document.createElement('div');
    setViewFadeRoot(el);
    setViewFadeRoot(null);

    fadeInView();

    expect(setTimeline).not.toHaveBeenCalled();
  });

  it('fading an already-visible root is harmless (idempotent 1→1 tween, no error)', () => {
    const el = document.createElement('div');
    el.style.opacity = '1';
    setViewFadeRoot(el);

    expect(() => fadeInView()).not.toThrow();
  });
});
