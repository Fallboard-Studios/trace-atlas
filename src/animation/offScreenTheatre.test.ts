import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';

import {
  OFF_SCREEN_BOOT_TIMELINE,
  OFF_SCREEN_FADE_TIMELINE,
  OFF_SCREEN_REF_KEY,
  fadeOffScreen,
  restoreOffScreen,
  skipOffScreenBoot,
  startOffScreenBoot,
} from './offScreenTheatre';
import { getTimeline, getTimelineScope, killAllTimelines } from './timelineMap';
import { clearRefs, setRef } from '../utils/refs';

/*
 * docs/tasks/OFF_SCREEN.md Task 16b (spec assumption 18): the off screen's two timelines, as timelineMap sees them.
 * The boot theatre — dark, flicker, ready — is a 'ui' timeline (it must run while the world is paused), skippable
 * by a tap and jumped to ready under reduced motion; the power-on fade is a 'ui' tween of the screen the controller
 * awaits before the power flag flips. Timings are the browser's to show; this file pins the registrations, the
 * skip, the stop and the promise. The shared GSAP stub (vitest.setup.ts) keeps progress and drives matchMedia from
 * window.matchMedia, which jsdom lacks until a test stubs it.
 */

afterEach(() => {
  killAllTimelines();
  clearRefs();
  vi.unstubAllGlobals();
});

describe('startOffScreenBoot', () => {
  let dark: HTMLDivElement;
  beforeEach(() => {
    dark = document.createElement('div');
  });

  it("registers the boot theatre as 'off-screen-boot' in the ui scope — it runs while the world is paused", () => {
    startOffScreenBoot(dark);
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).toBeDefined();
    expect(getTimelineScope(OFF_SCREEN_BOOT_TIMELINE)).toBe('ui');
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)!.progress()).toBe(0);
  });

  it('the stop it returns kills the timeline', () => {
    const stop = startOffScreenBoot(dark);
    stop();
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).toBeUndefined();
    expect(getTimelineScope(OFF_SCREEN_BOOT_TIMELINE)).toBeUndefined();
  });

  it('a second start replaces the first (a remount), never stacking two theatres', () => {
    const first = startOffScreenBoot(dark);
    const before = getTimeline(OFF_SCREEN_BOOT_TIMELINE);
    startOffScreenBoot(dark);
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).not.toBe(before);
    first();
  });

  it('jumps to ready at once under prefers-reduced-motion: reduce — no dark, no flicker, no wait', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    startOffScreenBoot(dark);
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)!.progress()).toBe(1);
  });

  it('plays from the start when motion is not reduced', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    startOffScreenBoot(dark);
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)!.progress()).toBe(0);
  });
});

describe('skipOffScreenBoot', () => {
  it('sets the running theatre to ready', () => {
    startOffScreenBoot(document.createElement('div'));
    skipOffScreenBoot();
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)!.progress()).toBe(1);
  });

  it('is a no-op when no theatre is registered (the screen is gone, or never mounted)', () => {
    expect(() => skipOffScreenBoot()).not.toThrow();
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).toBeUndefined();
  });
});

describe('fadeOffScreen', () => {
  it('resolves at once and registers nothing when the off screen is not mounted (no ref)', async () => {
    await expect(fadeOffScreen()).resolves.toBeUndefined();
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeUndefined();
  });

  it("registers the fade as 'off-screen-fade' in the ui scope and resolves when the tween completes", async () => {
    setRef(OFF_SCREEN_REF_KEY, document.createElement('div'));
    const done = fadeOffScreen();
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeDefined();
    expect(getTimelineScope(OFF_SCREEN_FADE_TIMELINE)).toBe('ui');
    await expect(done).resolves.toBeUndefined();
  });

  it('a flip during the theatre just goes: the fade kills a running boot timeline first', async () => {
    setRef(OFF_SCREEN_REF_KEY, document.createElement('div'));
    startOffScreenBoot(document.createElement('div'));
    await fadeOffScreen();
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).toBeUndefined();
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R19: a screen fading out, and the transparent one left behind it through
  // a slow first start, takes no input: nothing on it that the eye has lost can still be clicked.
  it('makes the screen inert as the fade starts, before the tween completes', () => {
    const root = document.createElement('div');
    setRef(OFF_SCREEN_REF_KEY, root);
    expect(root.hasAttribute('inert')).toBe(false);
    void fadeOffScreen();
    expect(root.hasAttribute('inert')).toBe(true);
  });
});

// R19: a power-on that fails after the fade gives the screen back, opaque and taking input, rather than leaving it
// invisible and mounted over the glass.
describe('restoreOffScreen (review R19)', () => {
  it('brings a faded screen back: the fade killed, the screen opaque and taking input again', () => {
    const root = document.createElement('div');
    setRef(OFF_SCREEN_REF_KEY, root);
    const set = vi.spyOn(gsap, 'set');
    void fadeOffScreen();
    restoreOffScreen();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(set).toHaveBeenCalledWith(root, { opacity: 1 });
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeUndefined();
    set.mockRestore();
  });

  it('is a no-op when the screen is not mounted', () => {
    expect(() => restoreOffScreen()).not.toThrow();
  });
});
