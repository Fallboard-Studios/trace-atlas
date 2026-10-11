// ========================================
// IMPORTS
// ========================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import gsap from 'gsap';

import {
  registerDeckScroller,
  noteDeckUserInput,
  isDeckCameraIdle,
  deckCameraTargetFor,
  panDeckCameraTo,
  cutDeckCameraTo,
  __setDeckCameraScrolling,
  __resetDeckCameraForTest,
} from './deckCamera';
import { getTimeline, timelineMap, killAllTimelines } from './timelineMap';
import { setRef, clearRefs } from '../utils/refs';
import { DECK_CAMERA_CUT_COOLDOWN_MS, DECK_CAMERA_IDLE_MS, DECK_CAMERA_PAN_S, DECK_CAMERA_TIMELINE_ID } from '../constants/deckCamera';

// ----------------------------------------
// RECORDING GSAP MOCK
// ----------------------------------------
// Overrides the global mock in vitest.setup.ts: that one discards every tween's vars and has no
// getProperty, and this file needs both — `deckCameraTargetFor` reads a seeded x back via
// gsap.getProperty (Task 6), and the pan/cut tests need to see exactly what config reached
// gsap.to (Task 7, the BubbleStream.test.tsx pattern). `timeline`/`to` are vi.fn so a test can
// read `.mock.results`/`.mock.calls`; `set`/`getProperty` share a WeakMap-backed prop store so
// gsap.set(el, { x }) is readable back as the same x.
interface RecordingTimeline {
  kill: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
}

vi.mock('gsap', () => {
  const props = new WeakMap<object, Record<string, number>>();
  const propsOf = (target: object): Record<string, number> => {
    let p = props.get(target);
    if (!p) {
      p = {};
      props.set(target, p);
    }
    return p;
  };

  const timeline = vi.fn((): RecordingTimeline => {
    const tl: RecordingTimeline = {
      kill: vi.fn(),
      play: vi.fn(() => tl),
      to: vi.fn(() => tl),
    };
    return tl;
  });

  const mocked = {
    timeline,
    set: vi.fn((target: object, vars: Record<string, number>) => Object.assign(propsOf(target), vars)),
    getProperty: vi.fn((target: object, prop: string) => propsOf(target)[prop] ?? 0),
    registerPlugin: vi.fn(),
  };
  return { default: mocked, ...mocked };
});

vi.mock('gsap/ScrollToPlugin', () => ({ ScrollToPlugin: {} }));

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const here = dirname(fileURLToPath(import.meta.url));

interface FakeScrollerStyle {
  scrollSnapType: string;
  removeProperty: ReturnType<typeof vi.fn>;
}

interface FakeScroller {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
  style: FakeScrollerStyle;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

/** The fake scroller object Task 6's spec calls for: `{ scrollWidth, clientWidth, scrollLeft,
 *  addEventListener, removeEventListener, dispatchEvent }`, with a working listener registry so
 *  `dispatchEvent` actually reaches what `registerDeckScroller` attached. `style` is a minimal
 *  stand-in for CSSStyleDeclaration (post-ship follow-up: the camera forces scroll-snap-type off
 *  after its own tween, so real DOM style assignment/removal needs to be observable in tests). */
function makeFakeScroller(scrollWidth = 3840, clientWidth = 375, scrollLeft = 0): FakeScroller {
  const listeners = new Map<string, Set<(e: { type: string }) => void>>();
  const style: FakeScrollerStyle = {
    scrollSnapType: '',
    removeProperty: vi.fn((prop: string) => {
      if (prop === 'scroll-snap-type') style.scrollSnapType = '';
    }),
  };
  return {
    scrollWidth,
    clientWidth,
    scrollLeft,
    style,
    addEventListener: vi.fn((type: string, fn: (e: { type: string }) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: (e: { type: string }) => void) => {
      listeners.get(type)?.delete(fn);
    }),
    dispatchEvent: vi.fn((event: { type: string }) => {
      listeners.get(event.type)?.forEach((fn) => fn(event));
    }),
  };
}

/** A stub `<g>` ref at scene x, the way Robot.tsx registers its own (`robot-<id>`). Seeded with a
 *  non-default x (the parity-fixture rule): a target computed from x = 0 proves nothing. */
function makeRobotRef(id: string, x: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as unknown as SVGGElement;
  gsap.set(g, { x });
  setRef(`robot-${id}`, g);
  return g;
}

/** The single timeline the mock's `gsap.timeline()` most recently created. */
function lastCreatedTimeline(): RecordingTimeline {
  const results = vi.mocked(gsap.timeline).mock.results;
  return results[results.length - 1].value as RecordingTimeline;
}

/** The `vars` object a timeline's `.to()` was last called with. */
function lastToVars(tl: RecordingTimeline): Record<string, unknown> {
  const calls = tl.to.mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

// ========================================
// TESTS
// ========================================
describe('deckCamera', () => {
  beforeEach(() => {
    __resetDeckCameraForTest();
  });

  afterEach(() => {
    registerDeckScroller(null);
    clearRefs();
    killAllTimelines();
    vi.restoreAllMocks();
  });

  describe('isDeckCameraIdle (Task 6)', () => {
    it('is true before any input has ever been seen', () => {
      expect(isDeckCameraIdle()).toBe(true);
    });

    it('is false one ms short of the idle window and true exactly at it', () => {
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      noteDeckUserInput();
      vi.restoreAllMocks();

      expect(isDeckCameraIdle(1000 + 7999)).toBe(false);
      expect(isDeckCameraIdle(1000 + 8000)).toBe(true);
    });
  });

  describe('scroller input listeners (Task 6)', () => {
    it('attaches pointerdown, touchstart, wheel and scroll on registration', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);

      const types = fake.addEventListener.mock.calls.map(([type]) => type);
      expect(types.sort()).toEqual(['pointerdown', 'scroll', 'touchstart', 'wheel']);
    });

    it('detaches exactly the listeners it attached when the scroller is unregistered', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      const attached = fake.addEventListener.mock.calls.map(([type]) => type).sort();

      registerDeckScroller(null);

      const detached = fake.removeEventListener.mock.calls.map(([type]) => type).sort();
      expect(detached).toEqual(attached);
    });

    it.each(['pointerdown', 'touchstart', 'wheel', 'scroll'])('a %s event stamps user input', (type) => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      vi.spyOn(performance, 'now').mockReturnValue(5000);

      fake.dispatchEvent({ type });

      expect(isDeckCameraIdle(5000 + 7999)).toBe(false);
      expect(isDeckCameraIdle(5000 + 8000)).toBe(true);
    });

    it('ignores a scroll event while the camera is mid-tween', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      __setDeckCameraScrolling(true);
      vi.spyOn(performance, 'now').mockReturnValue(5000);

      fake.dispatchEvent({ type: 'scroll' });

      // Never stamped — still idle at the very moment of the (ignored) event.
      expect(isDeckCameraIdle(5000)).toBe(true);
    });

    it('registerDeckScroller(null) kills the registered deck-camera timeline', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      panDeckCameraTo('alpha');
      const tl = getTimeline(DECK_CAMERA_TIMELINE_ID);
      expect(tl).toBeDefined();

      registerDeckScroller(null);

      expect(tl!.kill).toHaveBeenCalled();
      expect(timelineMap.has(DECK_CAMERA_TIMELINE_ID)).toBe(false);
    });
  });

  describe('deckCameraTargetFor (Task 6)', () => {
    it('scales the robot x to the stage pixel width and centres it in the viewport', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      expect(deckCameraTargetFor('alpha')).toBeCloseTo(1732.5, 3);
    });

    it('clamps to 0 near the left edge', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 10);

      expect(deckCameraTargetFor('alpha')).toBe(0);
    });

    it('clamps to scrollWidth - clientWidth near the right edge', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 1910);

      expect(deckCameraTargetFor('alpha')).toBe(3465);
    });

    it('is null when the robot has no ref', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);

      expect(deckCameraTargetFor('nobody')).toBeNull();
    });

    it('is null when there is no scroller', () => {
      makeRobotRef('alpha', 960);

      expect(deckCameraTargetFor('alpha')).toBeNull();
    });
  });

  describe('panDeckCameraTo (Task 7)', () => {
    it('does nothing when the robot has no ref', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);

      panDeckCameraTo('nobody');

      expect(gsap.timeline).not.toHaveBeenCalled();
    });

    it('tweens scrollLeft to the resolved target with autoKill', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');

      const tl = lastCreatedTimeline();
      const [target, vars] = tl.to.mock.calls[0];
      expect(target).toBe(fake);
      expect(vars.scrollTo).toEqual({ x: 1732.5, autoKill: true });
      expect(tl.play).toHaveBeenCalled();
    });

    it('still tweens even while the user is not idle — a tap is never idle-gated', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      noteDeckUserInput();

      panDeckCameraTo('alpha');

      expect(gsap.timeline).toHaveBeenCalledTimes(1);
    });

    it('full duration without reduced motion, 0 under prefers-reduced-motion', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      expect(lastToVars(lastCreatedTimeline()).duration).toBe(DECK_CAMERA_PAN_S);

      const original = window.matchMedia;
      window.matchMedia = vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
      })) as unknown as typeof window.matchMedia;

      panDeckCameraTo('alpha');
      expect(lastToVars(lastCreatedTimeline()).duration).toBe(0);

      window.matchMedia = original;
    });

    it('registers the tween as deck-camera and a second pan kills and replaces the first', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      makeRobotRef('beta', 100);

      panDeckCameraTo('alpha');
      const first = getTimeline(DECK_CAMERA_TIMELINE_ID);

      panDeckCameraTo('beta');
      const second = getTimeline(DECK_CAMERA_TIMELINE_ID);

      expect(second).not.toBe(first);
      expect(first!.kill).toHaveBeenCalled();
      expect(getTimeline(DECK_CAMERA_TIMELINE_ID)).toBe(second);
    });

    it('cameraScrolling is set between onStart and onComplete, driven by the tween callbacks', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      const vars = lastToVars(lastCreatedTimeline());
      vi.spyOn(performance, 'now').mockReturnValue(9000);

      (vars.onStart as () => void)();
      fake.dispatchEvent({ type: 'scroll' });
      // Mid-tween: the camera's own scroll did not stamp user input, so idle stays true at 9000.
      expect(isDeckCameraIdle(9000)).toBe(true);

      (vars.onComplete as () => void)();
      fake.dispatchEvent({ type: 'scroll' });
      // After onComplete, the flag is clear again: this scroll is the user's and does stamp.
      expect(isDeckCameraIdle(9000 + 7999)).toBe(false);
    });

    it('onInterrupt clears cameraScrolling too, so the next scroll stamps input', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      const vars = lastToVars(lastCreatedTimeline());
      vi.spyOn(performance, 'now').mockReturnValue(9000);

      (vars.onStart as () => void)();
      (vars.onInterrupt as () => void)();
      fake.dispatchEvent({ type: 'scroll' });

      expect(isDeckCameraIdle(9000 + 7999)).toBe(false);
    });
  });

  describe('cutDeckCameraTo (Task 7)', () => {
    it('does nothing while the user is not idle', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 1910); // 5% of the window — off screen, were idle checked second
      noteDeckUserInput();

      cutDeckCameraTo('alpha');

      expect(gsap.timeline).not.toHaveBeenCalled();
    });

    it('does nothing when the robot centre is at 50% of the window (already on screen)', () => {
      // scrollLeft 0, scale 2: a robot at scene x 93.75 sits at pixel 187.5 — exactly 50% of 375.
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 93.75);

      cutDeckCameraTo('alpha');

      expect(gsap.timeline).not.toHaveBeenCalled();
    });

    it('tweens when the robot centre is at 5% of the window (off screen)', () => {
      // scale 2: scene x 9.375 -> pixel 18.75 == 5% of 375.
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 9.375);

      cutDeckCameraTo('alpha');

      expect(gsap.timeline).toHaveBeenCalledTimes(1);
    });

    it('is otherwise identical to a pan: same target, autoKill, registered as deck-camera', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      cutDeckCameraTo('alpha');

      const tl = lastCreatedTimeline();
      const [, vars] = tl.to.mock.calls[0];
      expect(vars.scrollTo).toEqual({ x: 1732.5, autoKill: true });
      expect(getTimeline(DECK_CAMERA_TIMELINE_ID)).toBe(tl as never);
    });
  });

  describe('scroll-snap suppression after a camera move (post-ship follow-up)', () => {
    // Root cause (found reading node_modules/gsap/src/ScrollToPlugin.js): ScrollToPlugin disables
    // scroll-snap-type on the target for the duration of its own tween (to avoid fighting it), then
    // restores the original value at the very end via a scrollLeft nudge. Our five quarter-stage
    // snap marks have no relation to a robot's position, so restoring `x proximity` at an
    // off-mark landing lets the browser "correct" it — a pan that visibly finishes, then an
    // instant, unrequested shift. The camera now re-forces snap off itself after every tween and
    // only lets a real user gesture turn it back on.
    // The gap this closes: GSAP's ScrollToPlugin only disables-then-restores scroll-snap-type for
    // a tween if it finds snap ALREADY on at init() time. Suppressing only reactively (onComplete)
    // left the very FIRST tween of a session unprotected -- nothing had set it to 'none' yet, so
    // GSAP's own init->disable->restore dance ran for that one tween exactly where the race lives,
    // and never again afterward (every later tween's init() already finds it off and skips the
    // dance entirely). Matches what was seen live: only ever the first camera move, deterministically.
    it('forces scroll-snap-type off immediately on registration, before any tween ever runs', () => {
      const fake = makeFakeScroller(3840, 375);
      fake.style.scrollSnapType = 'x proximity'; // the CSS rule's cascaded value, pre-registration

      registerDeckScroller(fake as unknown as HTMLElement);

      expect(fake.style.scrollSnapType).toBe('none');
    });

    it('forces scroll-snap-type off once a pan completes', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      fake.style.scrollSnapType = 'x proximity'; // simulate ScrollToPlugin's own restore
      (lastToVars(lastCreatedTimeline()).onComplete as () => void)();

      expect(fake.style.scrollSnapType).toBe('none');
    });

    it('forces scroll-snap-type off on an interrupted move too (autoKill)', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      fake.style.scrollSnapType = 'x proximity';
      (lastToVars(lastCreatedTimeline()).onInterrupt as () => void)();

      expect(fake.style.scrollSnapType).toBe('none');
    });

    it.each(['pointerdown', 'touchstart', 'wheel'])('a real %s gesture clears the forced-off override', (type) => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      (lastToVars(lastCreatedTimeline()).onComplete as () => void)();
      expect(fake.style.scrollSnapType).toBe('none');

      fake.dispatchEvent({ type });

      expect(fake.style.removeProperty).toHaveBeenCalledWith('scroll-snap-type');
    });

    it('the camera\'s own scroll events (mid-tween) do not clear the override', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      panDeckCameraTo('alpha');
      const vars = lastToVars(lastCreatedTimeline());
      (vars.onStart as () => void)();
      fake.dispatchEvent({ type: 'scroll' }); // the tween's own write, cameraScrolling is true

      expect(fake.style.removeProperty).not.toHaveBeenCalled();
    });
  });

  describe('cutDeckCameraTo cooldown (post-ship follow-up: no whiplash between two quick cuts)', () => {
    it('a second cut inside the cooldown window does nothing, even to an off-screen robot', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 9.375); // off screen (5%)
      makeRobotRef('beta', 9.375 + 1); // also off screen, a hair further along

      vi.spyOn(performance, 'now').mockReturnValue(1000);
      cutDeckCameraTo('alpha');
      expect(gsap.timeline).toHaveBeenCalledTimes(1);

      vi.spyOn(performance, 'now').mockReturnValue(1000 + DECK_CAMERA_CUT_COOLDOWN_MS - 1);
      cutDeckCameraTo('beta');
      expect(gsap.timeline).toHaveBeenCalledTimes(1); // still just the first
    });

    it('a cut exactly at the cooldown boundary is allowed', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 9.375);
      makeRobotRef('beta', 9.375 + 1);

      vi.spyOn(performance, 'now').mockReturnValue(1000);
      cutDeckCameraTo('alpha');
      vi.spyOn(performance, 'now').mockReturnValue(1000 + DECK_CAMERA_CUT_COOLDOWN_MS);
      cutDeckCameraTo('beta');

      expect(gsap.timeline).toHaveBeenCalledTimes(2);
    });

    it('a cut suppressed by the on-screen check never starts the cooldown clock', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('onscreen', 93.75); // 50% -- already on screen, suppressed
      makeRobotRef('offscreen', 9.375); // 5% -- off screen

      vi.spyOn(performance, 'now').mockReturnValue(1000);
      cutDeckCameraTo('onscreen');
      expect(gsap.timeline).not.toHaveBeenCalled();

      cutDeckCameraTo('offscreen'); // same instant -- no time has passed
      expect(gsap.timeline).toHaveBeenCalledTimes(1);
    });

    it('a cut suppressed by the idle gate never starts the cooldown clock', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 9.375);
      makeRobotRef('beta', 9.375 + 1);

      vi.spyOn(performance, 'now').mockReturnValue(1000);
      noteDeckUserInput(); // not idle until 1000 + DECK_CAMERA_IDLE_MS

      cutDeckCameraTo('alpha');
      expect(gsap.timeline).not.toHaveBeenCalled();

      vi.spyOn(performance, 'now').mockReturnValue(1000 + DECK_CAMERA_IDLE_MS);
      cutDeckCameraTo('beta'); // idle again; the suppressed first cut left no cooldown behind
      expect(gsap.timeline).toHaveBeenCalledTimes(1);
    });

    it('does not gate panDeckCameraTo -- a tap right after a cut still moves the camera', () => {
      const fake = makeFakeScroller(3840, 375, 0);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 9.375);
      makeRobotRef('beta', 9.375 + 1);

      vi.spyOn(performance, 'now').mockReturnValue(1000);
      cutDeckCameraTo('alpha');
      expect(gsap.timeline).toHaveBeenCalledTimes(1);

      panDeckCameraTo('beta'); // same instant, no cooldown applies to a user tap
      expect(gsap.timeline).toHaveBeenCalledTimes(2);
    });
  });

  describe('source boundaries (Task 7)', () => {
    it('imports nothing from @/engine or @/stores — the camera never reaches audio or the store', () => {
      const source = readFileSync(resolve(here, 'deckCamera.ts'), 'utf-8');
      expect(source).not.toMatch(/@\/engine/);
      expect(source).not.toMatch(/@\/stores/);
    });
  });
});
