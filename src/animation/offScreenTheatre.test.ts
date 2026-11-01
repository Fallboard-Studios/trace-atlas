import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import gsap from 'gsap';

import {
  OFF_SCREEN_BOOT_TIMELINE,
  OFF_SCREEN_FADE_IN_TIMELINE,
  OFF_SCREEN_FADE_TIMELINE,
  OFF_SCREEN_REF_KEY,
  fadeInOffScreen,
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

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27 (R18's window): a second power-on press while the first fade runs
  // replaces that fade, so only the second press goes on. The shared stub completes every timeline by itself, so these
  // timelines are held: each keeps its onComplete for the test to fire, and a kill spy.
  it('a second fade supersedes the first: the first is killed before it completes, and the second resolves when it does', async () => {
    const held: { complete: () => void; kill: ReturnType<typeof vi.fn> }[] = [];
    const timeline = vi.spyOn(gsap, 'timeline').mockImplementation(((config?: { onComplete?: () => void }) => {
      const kill = vi.fn();
      held.push({ complete: () => config?.onComplete?.(), kill });
      const tl = { to: () => tl, kill, paused: () => false, pause: () => tl, play: () => tl };
      return tl;
    }) as unknown as typeof gsap.timeline);
    setRef(OFF_SCREEN_REF_KEY, document.createElement('div'));

    void fadeOffScreen();
    const second = fadeOffScreen();

    expect(held).toHaveLength(2);
    expect(held[0].kill).toHaveBeenCalled();
    expect(held[1].kill).not.toHaveBeenCalled();
    held[1].complete();
    await expect(second).resolves.toBeUndefined();
    timeline.mockRestore();
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
/** The off screen's root as OffScreen renders it: the veil, the theatre's dark layer, then the column. */
function offScreenRoot(): { root: HTMLDivElement; veil: HTMLDivElement; dark: HTMLDivElement; column: HTMLDivElement } {
  const root = document.createElement('div');
  const [veil, dark, column] = ['off-screen__veil', 'off-screen__dark', 'off-screen__scroll'].map((className) => {
    const el = document.createElement('div');
    el.className = className;
    root.appendChild(el);
    return el;
  });
  return { root, veil, dark, column };
}

// docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R26 item 2: an ancestor whose opacity is below 1 is a backdrop root, so
// fading the root left the veil's backdrop-filter nothing to blur and the world showed sharp on the fade's first frame
// (measured: the world's sharpness jumped 19-fold at opacity 0.996). The root never fades; its three children do, the
// veil's own opacity fading its blur with it.
describe('fadeOffScreen fades the parts, never the root (review R26)', () => {
  it("tweens the veil, the dark layer and the column to transparent, and nothing tweens the root's own opacity", () => {
    const { root, veil, dark, column } = offScreenRoot();
    setRef(OFF_SCREEN_REF_KEY, root);
    const targets: unknown[] = [];
    const realTimeline = gsap.timeline;
    const timeline = vi.spyOn(gsap, 'timeline').mockImplementation(((config?: gsap.TimelineVars) => {
      const tl = realTimeline(config);
      const to = tl.to.bind(tl);
      tl.to = ((target: gsap.TweenTarget, vars: gsap.TweenVars) => {
        targets.push(target);
        return to(target, vars);
      }) as typeof tl.to;
      return tl;
    }) as typeof gsap.timeline);
    void fadeOffScreen();
    expect(targets).toHaveLength(1);
    expect(Array.from(targets[0] as ArrayLike<Element>)).toEqual([veil, dark, column]);
    expect(targets).not.toContain(root);
    timeline.mockRestore();
  });
});

describe('restoreOffScreen (review R19)', () => {
  it('brings a faded screen back: the fade killed, the veil and the column opaque, the dark layer hidden, input again', () => {
    const { root, veil, dark, column } = offScreenRoot();
    setRef(OFF_SCREEN_REF_KEY, root);
    const set = vi.spyOn(gsap, 'set');
    void fadeOffScreen();
    restoreOffScreen();
    expect(root.hasAttribute('inert')).toBe(false);
    expect(set).toHaveBeenCalledWith([veil, column], { opacity: 1 });
    expect(set).toHaveBeenCalledWith(dark, { opacity: 0, visibility: 'hidden' });
    expect(set).not.toHaveBeenCalledWith(root, expect.anything());
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeUndefined();
    set.mockRestore();
  });

  it('is a no-op when the screen is not mounted', () => {
    expect(() => restoreOffScreen()).not.toThrow();
  });
});

// docs/tasks/OFF_SCREEN_FINAL_FIXES.md F6 (Crawford's answer 2a): a power-off fades the screen in over the world just
// paused, the reverse of the power-on fade, instead of replaying the first-load flicker. The dark layer is hidden at
// once; the veil and the column tween from transparent to opaque over the fade's 0.4 s, never the root (R26 item 2).
describe('fadeInOffScreen (final fixes F6)', () => {
  /** Records the fade-in's one fromTo: its targets and its two vars, on the stub's own timeline. */
  function recordFromTo() {
    const calls: { targets: unknown; from: gsap.TweenVars; to: gsap.TweenVars }[] = [];
    const realTimeline = gsap.timeline;
    const timeline = vi.spyOn(gsap, 'timeline').mockImplementation(((config?: gsap.TimelineVars) => {
      const tl = realTimeline(config);
      const fromTo = tl.fromTo.bind(tl);
      tl.fromTo = ((targets: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars) => {
        calls.push({ targets, from, to });
        return fromTo(targets, from, to);
      }) as typeof tl.fromTo;
      return tl;
    }) as typeof gsap.timeline);
    return { calls, restore: () => timeline.mockRestore() };
  }

  it("registers the fade-in as 'off-screen-fade-in' in the ui scope, from the start", () => {
    const { root } = offScreenRoot();
    fadeInOffScreen(root);
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeDefined();
    expect(getTimelineScope(OFF_SCREEN_FADE_IN_TIMELINE)).toBe('ui');
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)!.progress()).toBe(0);
    expect(getTimeline(OFF_SCREEN_BOOT_TIMELINE)).toBeUndefined();
  });

  it('hides the dark layer at once, never fading it', () => {
    const { root, dark } = offScreenRoot();
    const set = vi.spyOn(gsap, 'set');
    const { calls, restore } = recordFromTo();
    fadeInOffScreen(root);
    expect(set).toHaveBeenCalledWith(dark, { opacity: 0, visibility: 'hidden' });
    expect(calls.flatMap((c) => Array.from(c.targets as ArrayLike<Element>))).not.toContain(dark);
    restore();
    set.mockRestore();
  });

  it('tweens the veil and the column from 0 to 1 over 0.4 s, and nothing tweens the root', () => {
    const { root, veil, column } = offScreenRoot();
    const { calls, restore } = recordFromTo();
    fadeInOffScreen(root);
    expect(calls).toHaveLength(1);
    expect(Array.from(calls[0].targets as ArrayLike<Element>)).toEqual([veil, column]);
    expect(calls[0].from).toMatchObject({ opacity: 0 });
    expect(calls[0].to).toMatchObject({ opacity: 1, duration: 0.4 });
    expect(calls.map((c) => c.targets)).not.toContain(root);
    restore();
  });

  it('the stop it returns kills the fade-in', () => {
    const stop = fadeInOffScreen(offScreenRoot().root);
    stop();
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
    expect(getTimelineScope(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
  });

  it('is shown at once under prefers-reduced-motion: reduce', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion: reduce') }));
    fadeInOffScreen(offScreenRoot().root);
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)!.progress()).toBe(1);
  });

  it('plays from the start when motion is not reduced', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    fadeInOffScreen(offScreenRoot().root);
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)!.progress()).toBe(0);
  });

  it('a power-on during the fade-in kills it first, then fades out from where the parts stand', async () => {
    const { root } = offScreenRoot();
    setRef(OFF_SCREEN_REF_KEY, root);
    fadeInOffScreen(root);
    const done = fadeOffScreen();
    expect(getTimeline(OFF_SCREEN_FADE_IN_TIMELINE)).toBeUndefined();
    expect(getTimeline(OFF_SCREEN_FADE_TIMELINE)).toBeDefined();
    await expect(done).resolves.toBeUndefined();
  });

  it('a screen with no dark layer still fades its parts in', () => {
    const root = document.createElement('div');
    const part = document.createElement('div');
    root.appendChild(part);
    const { calls, restore } = recordFromTo();
    expect(() => fadeInOffScreen(root)).not.toThrow();
    expect(Array.from(calls[0].targets as ArrayLike<Element>)).toEqual([part]);
    restore();
  });
});
