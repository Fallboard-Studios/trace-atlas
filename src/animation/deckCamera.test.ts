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
  deckCameraTargetFor,
  moveCameraTo,
  undockedRobotIds,
  pick,
  __deckCameraStateForTest,
  __resetDeckCameraForTest,
} from './deckCamera';
import { getTimeline, timelineMap, killAllTimelines } from './timelineMap';
import { setRef, clearRefs } from '../utils/refs';
import {
  DECK_CAMERA_MIN_BATTERY_PCT,
  DECK_CAMERA_PAN_S,
  DECK_CAMERA_TIMELINE_ID,
} from '../constants/deckCamera';
import { useLocaleStore } from '../stores/localeStore';
import { useAttenuationStyleStore } from '../stores/attenuationStyleStore';
import { DockingState, type Robot } from '../types/Robot';
import * as deckCameraModule from './deckCamera';

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

interface FakeScroller {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

/** The fake scroller object Task 6's spec calls for: `{ scrollWidth, clientWidth, scrollLeft,
 *  addEventListener, removeEventListener, dispatchEvent }`, with a working listener registry so
 *  `dispatchEvent` actually reaches what `registerDeckScroller` attached. */
function makeFakeScroller(scrollWidth = 3840, clientWidth = 375, scrollLeft = 0): FakeScroller {
  const listeners = new Map<string, Set<(e: { type: string }) => void>>();
  return {
    scrollWidth,
    clientWidth,
    scrollLeft,
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

  describe('listeners (deck-camera follow, Task 5)', () => {
    it('attaches pointerdown, touchstart, wheel, pointerup and touchend, and no scroll listener', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);

      const types = fake.addEventListener.mock.calls.map(([type]) => type).sort();
      expect(types).toEqual(['pointerdown', 'pointerup', 'touchend', 'touchstart', 'wheel']);
    });

    it('detaches exactly the listeners it attached when the scroller is unregistered', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      const attached = fake.addEventListener.mock.calls.map(([type]) => type).sort();

      registerDeckScroller(null);

      const detached = fake.removeEventListener.mock.calls.map(([type]) => type).sort();
      expect(detached).toEqual(attached);
    });

    it('moves its listeners when a different scroller is registered', () => {
      const first = makeFakeScroller();
      const second = makeFakeScroller();
      registerDeckScroller(first as unknown as HTMLElement);
      registerDeckScroller(second as unknown as HTMLElement);

      expect(first.removeEventListener).toHaveBeenCalledTimes(5);
      expect(second.addEventListener).toHaveBeenCalledTimes(5);
    });

    it('registerDeckScroller(null) kills the registered deck-camera timeline', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      moveCameraTo('alpha');
      const tl = getTimeline(DECK_CAMERA_TIMELINE_ID);
      expect(tl).toBeDefined();

      registerDeckScroller(null);

      expect(tl!.kill).toHaveBeenCalled();
      expect(timelineMap.has(DECK_CAMERA_TIMELINE_ID)).toBe(false);
    });
  });

  describe('touch and release (deck-camera follow, Task 5)', () => {
    /** A camera float in flight, so a gesture has something to kill. */
    function floatInFlight(fake: FakeScroller) {
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      moveCameraTo('alpha');
      return getTimeline(DECK_CAMERA_TIMELINE_ID)!;
    }

    it('starts not held, with the boot cooldown sentinel', () => {
      expect(__deckCameraStateForTest()).toEqual({ held: false, cooldownStartedAt: -Infinity });
    });

    it.each(['pointerdown', 'touchstart'])('%s holds the camera and kills the running float', (type) => {
      const fake = makeFakeScroller();
      const tl = floatInFlight(fake);

      fake.dispatchEvent({ type });

      expect(__deckCameraStateForTest().held).toBe(true);
      expect(tl.kill).toHaveBeenCalled();
      expect(timelineMap.has(DECK_CAMERA_TIMELINE_ID)).toBe(false);
    });

    it.each(['pointerdown', 'touchstart'])('%s with no float running holds without throwing', (type) => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);

      expect(() => fake.dispatchEvent({ type })).not.toThrow();
      expect(__deckCameraStateForTest().held).toBe(true);
    });

    it.each(['pointerdown', 'touchstart'])('%s does not start the cooldown, only letting go does', (type) => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      vi.spyOn(performance, 'now').mockReturnValue(4000);

      fake.dispatchEvent({ type });

      expect(__deckCameraStateForTest().cooldownStartedAt).toBe(-Infinity);
    });

    it.each([
      ['pointerdown', 'pointerup'],
      ['touchstart', 'touchend'],
    ])('%s then %s releases the hold and stamps the cooldown at the release time', (down, up) => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      const now = vi.spyOn(performance, 'now');
      now.mockReturnValue(4000);
      fake.dispatchEvent({ type: down });
      now.mockReturnValue(6500);

      fake.dispatchEvent({ type: up });

      expect(__deckCameraStateForTest()).toEqual({ held: false, cooldownStartedAt: 6500 });
    });

    it('a second touch restamps the cooldown from the latest release', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      const now = vi.spyOn(performance, 'now');
      now.mockReturnValue(1000);
      fake.dispatchEvent({ type: 'pointerdown' });
      fake.dispatchEvent({ type: 'pointerup' });
      now.mockReturnValue(9000);
      fake.dispatchEvent({ type: 'touchstart' });
      fake.dispatchEvent({ type: 'touchend' });

      expect(__deckCameraStateForTest().cooldownStartedAt).toBe(9000);
    });

    it('wheel kills the float and stamps the cooldown in one go, never leaving the camera held', () => {
      const fake = makeFakeScroller();
      const tl = floatInFlight(fake);
      vi.spyOn(performance, 'now').mockReturnValue(7200);

      fake.dispatchEvent({ type: 'wheel' });

      expect(tl.kill).toHaveBeenCalled();
      expect(timelineMap.has(DECK_CAMERA_TIMELINE_ID)).toBe(false);
      expect(__deckCameraStateForTest()).toEqual({ held: false, cooldownStartedAt: 7200 });
    });

    it('wheel with no float running still stamps the cooldown', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      vi.spyOn(performance, 'now').mockReturnValue(3300);

      fake.dispatchEvent({ type: 'wheel' });

      expect(__deckCameraStateForTest().cooldownStartedAt).toBe(3300);
    });

    it('a scroll event does nothing now, so the camera cannot mistake its own writes for the user', () => {
      const fake = makeFakeScroller();
      const tl = floatInFlight(fake);
      vi.spyOn(performance, 'now').mockReturnValue(5000);

      fake.dispatchEvent({ type: 'scroll' });

      expect(__deckCameraStateForTest()).toEqual({ held: false, cooldownStartedAt: -Infinity });
      expect(tl.kill).not.toHaveBeenCalled();
    });

    it('unregistering while held lets go, so a lost pointerup cannot freeze the next scroller', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      fake.dispatchEvent({ type: 'pointerdown' });
      expect(__deckCameraStateForTest().held).toBe(true);

      registerDeckScroller(null);

      expect(__deckCameraStateForTest().held).toBe(false);
    });

    it('swapping scrollers while held lets go too', () => {
      const first = makeFakeScroller();
      registerDeckScroller(first as unknown as HTMLElement);
      first.dispatchEvent({ type: 'touchstart' });

      registerDeckScroller(makeFakeScroller() as unknown as HTMLElement);

      expect(__deckCameraStateForTest().held).toBe(false);
    });

    it('the reset helper restores the boot state', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);
      fake.dispatchEvent({ type: 'pointerdown' });
      fake.dispatchEvent({ type: 'pointerup' });

      __resetDeckCameraForTest();

      expect(__deckCameraStateForTest()).toEqual({ held: false, cooldownStartedAt: -Infinity });
    });
  });

  describe('the superseded idle-cut model is gone (deck-camera follow, Task 5)', () => {
    it.each(['panDeckCameraTo', 'cutDeckCameraTo', 'noteDeckUserInput', 'isDeckCameraIdle', '__setDeckCameraScrolling'])(
      'no longer exports %s',
      (name) => {
        expect(deckCameraModule).not.toHaveProperty(name);
      },
    );
  });

  describe('deckCameraTargetFor', () => {
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

  // The float itself (Task 7 wires it to pick() and the ticker); these are the shipped tween's
  // behaviours, carried over from the old pan tests.
  describe('moveCameraTo', () => {
    it('does nothing and reports false when the robot has no ref', () => {
      const fake = makeFakeScroller();
      registerDeckScroller(fake as unknown as HTMLElement);

      expect(moveCameraTo('nobody')).toBe(false);
      expect(gsap.timeline).not.toHaveBeenCalled();
    });

    it('does nothing when there is no scroller', () => {
      makeRobotRef('alpha', 960);

      expect(moveCameraTo('alpha')).toBe(false);
      expect(gsap.timeline).not.toHaveBeenCalled();
    });

    it('tweens scrollLeft to the resolved target with autoKill and reports true', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      expect(moveCameraTo('alpha')).toBe(true);

      const tl = lastCreatedTimeline();
      const [target, vars] = tl.to.mock.calls[0];
      expect(target).toBe(fake);
      expect(vars.scrollTo).toEqual({ x: 1732.5, autoKill: true });
      expect(tl.play).toHaveBeenCalled();
    });

    it('full duration without reduced motion, 0 under prefers-reduced-motion', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);

      moveCameraTo('alpha');
      expect(lastToVars(lastCreatedTimeline()).duration).toBe(DECK_CAMERA_PAN_S);

      const original = window.matchMedia;
      window.matchMedia = vi.fn((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
      })) as unknown as typeof window.matchMedia;

      moveCameraTo('alpha');
      expect(lastToVars(lastCreatedTimeline()).duration).toBe(0);

      window.matchMedia = original;
    });

    it('registers the tween as deck-camera and a second move kills and replaces the first', () => {
      const fake = makeFakeScroller(3840, 375);
      registerDeckScroller(fake as unknown as HTMLElement);
      makeRobotRef('alpha', 960);
      makeRobotRef('beta', 100);

      moveCameraTo('alpha');
      const first = getTimeline(DECK_CAMERA_TIMELINE_ID);

      moveCameraTo('beta');
      const second = getTimeline(DECK_CAMERA_TIMELINE_ID);

      expect(second).not.toBe(first);
      expect(first!.kill).toHaveBeenCalled();
      expect(getTimeline(DECK_CAMERA_TIMELINE_ID)).toBe(second);
    });
  });

  describe('undockedRobotIds and pick (deck-camera follow, Task 6)', () => {
    const LOCALE = 'deck-camera-test';

    /** Distinct battery, docking and (via makeRobotRef) position on every robot. */
    function seedLocale(robots: Array<[id: string, docking: DockingState, battery: number]>): void {
      useLocaleStore.setState({
        locales: {
          [LOCALE]: {
            id: LOCALE, attenuationStyleId: 'pelagos', name: LOCALE, coordinates: { x: 3, y: 7 },
            dayStartTimestamp: 0, createdAtMeasure: 0, companies: [], actors: [], currentMeasure: 0,
            robots: robots.map(([id, docking, batteryLevel]) => ({ id, docking, batteryLevel }) as Robot),
          },
        },
      });
      useAttenuationStyleStore.getState().setCurrentLocale('pelagos', LOCALE);
    }

    afterEach(() => {
      useLocaleStore.setState({ locales: {} });
    });

    describe('undockedRobotIds', () => {
      it('includes Active and Recalled robots and excludes Docked and Undocking ones', () => {
        seedLocale([
          ['docked', DockingState.Docked, 11],
          ['undocking', DockingState.Undocking, 22],
          ['active', DockingState.Active, 33],
          ['recalled', DockingState.Recalled, 44],
        ]);

        expect(undockedRobotIds()).toEqual(['active', 'recalled']);
      });

      it('is empty when the current locale has no robots or does not exist', () => {
        seedLocale([]);
        expect(undockedRobotIds()).toEqual([]);

        useLocaleStore.setState({ locales: {} });
        expect(undockedRobotIds()).toEqual([]);
      });
    });

    describe('pick', () => {
      beforeEach(() => {
        registerDeckScroller(makeFakeScroller(3840, 375, 0) as unknown as HTMLElement);
      });

      it('prefers the lowest battery among robots above the threshold', () => {
        seedLocale([['a', 'active', 90], ['b', 'active', 61], ['c', 'active', 75]]);
        ['a', 'b', 'c'].forEach((id, i) => makeRobotRef(id, 300 + i * 400));

        expect(pick(['a', 'b', 'c'])).toBe('b');
      });

      it('ignores a robot at or below the threshold while any robot is above it', () => {
        seedLocale([['low', 'active', 8], ['mid', 'active', 50], ['high', 'active', 83]]);
        ['low', 'mid', 'high'].forEach((id, i) => makeRobotRef(id, 300 + i * 400));

        expect(pick(['low', 'mid', 'high'])).toBe('high');
      });

      it('treats a battery of exactly the threshold as not above it', () => {
        seedLocale([['edge', 'active', DECK_CAMERA_MIN_BATTERY_PCT], ['just', 'active', DECK_CAMERA_MIN_BATTERY_PCT + 1]]);
        makeRobotRef('edge', 300);
        makeRobotRef('just', 700);

        expect(pick(['edge', 'just'])).toBe('just');
      });

      it('falls back to the lowest battery overall when none is above the threshold', () => {
        seedLocale([['a', 'active', 37], ['b', 'active', 12], ['c', 'active', DECK_CAMERA_MIN_BATTERY_PCT]]);
        ['a', 'b', 'c'].forEach((id, i) => makeRobotRef(id, 300 + i * 400));

        expect(pick(['a', 'b', 'c'])).toBe('b');
      });

      it('breaks a battery tie toward the robot closer to the viewport centre', () => {
        const fake = makeFakeScroller(3840, 375, 1700);
        registerDeckScroller(fake as unknown as HTMLElement);
        seedLocale([['far', 'active', 64], ['near', 'active', 64], ['farther', 'active', 64]]);
        makeRobotRef('far', 200);
        makeRobotRef('near', 880); // target 1560: 140 px from the scroll position
        makeRobotRef('farther', 1500);

        expect(pick(['far', 'near', 'farther'])).toBe('near');
      });

      it('measures a tie by robot centre against viewport centre, not by raw scroll target', () => {
        // Viewport 1700..2075, centre 1887.5. Robot centres: near 1760 (127.5 away), far 2280
        // (392.5 away), so near wins. Their scroll targets are 1572.5 and 2092.5; compared raw
        // against the viewport centre (315 vs 205) far would win, so this pins the centre reading.
        const fake = makeFakeScroller(3840, 375, 1700);
        registerDeckScroller(fake as unknown as HTMLElement);
        seedLocale([['far', 'active', 64], ['near', 'active', 64]]);
        makeRobotRef('far', 1140);
        makeRobotRef('near', 880);

        expect(pick(['far', 'near'])).toBe('near');
      });

      it('breaks a fallback-pool tie by position too', () => {
        const fake = makeFakeScroller(3840, 375, 100);
        registerDeckScroller(fake as unknown as HTMLElement);
        seedLocale([['right', 'active', 20], ['left', 'active', 20]]);
        makeRobotRef('right', 1500);
        makeRobotRef('left', 150);

        expect(pick(['right', 'left'])).toBe('left');
      });

      it('ranks a robot with no ref last in a tie, but can still pick it when it is the only one', () => {
        seedLocale([['ghost', 'active', 64], ['seen', 'active', 64]]);
        makeRobotRef('seen', 900);

        expect(pick(['ghost', 'seen'])).toBe('seen');
        expect(pick(['ghost'])).toBe('ghost');
      });

      it('returns the sole candidate whatever its battery', () => {
        seedLocale([['only', 'active', 3]]);
        makeRobotRef('only', 500);

        expect(pick(['only'])).toBe('only');
      });

      it('skips an id that is not in the current locale', () => {
        seedLocale([['here', 'active', 70]]);
        makeRobotRef('here', 500);

        expect(pick(['stranger', 'here'])).toBe('here');
      });

      it('an empty list picks nothing and restarts the cooldown at the current time', () => {
        vi.spyOn(performance, 'now').mockReturnValue(12345);

        expect(pick([])).toBeNull();
        expect(__deckCameraStateForTest().cooldownStartedAt).toBe(12345);
      });

      it('a non-empty list leaves the cooldown stamp alone', () => {
        seedLocale([['a', 'active', 70]]);
        makeRobotRef('a', 500);
        vi.spyOn(performance, 'now').mockReturnValue(999);

        pick(['a']);

        expect(__deckCameraStateForTest().cooldownStartedAt).toBe(-Infinity);
      });

      it('starts no float yet — Task 7 wires the winner into motion', () => {
        seedLocale([['a', 'active', 70]]);
        makeRobotRef('a', 500);

        pick(['a']);

        expect(gsap.timeline).not.toHaveBeenCalled();
      });
    });
  });

  describe('source boundaries', () => {
    const source = () => readFileSync(resolve(here, 'deckCamera.ts'), 'utf-8');

    it('imports nothing from @/engine, so the camera never reaches audio', () => {
      expect(source()).not.toMatch(/@\/engine/);
    });

    it('uses no timers or frame loops (CLAUDE.md: GSAP only)', () => {
      expect(source()).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|queueMicrotask/);
    });

    it('listens for no scroll event', () => {
      expect(source()).not.toMatch(/['"]scroll['"]/);
    });
  });
});
