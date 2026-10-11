// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import gsap from 'gsap';

import {
  registerDeckScroller,
  noteDeckUserInput,
  isDeckCameraIdle,
  deckCameraTargetFor,
  __setDeckCameraScrolling,
  __resetDeckCameraForTest,
} from './deckCamera';
import { setRef, clearRefs } from '../utils/refs';

// Real tween values: vitest.setup.ts mocks gsap globally and discards every tween's vars, which
// would make gsap.getProperty(ref, 'x') always read 0. stationRipple.test.ts and
// workLoop.test.ts unmock gsap for the same reason.
vi.unmock('gsap');

// ========================================
// FIXTURES
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

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
function makeFakeScroller(scrollWidth = 3840, clientWidth = 375): FakeScroller {
  const listeners = new Map<string, Set<(e: { type: string }) => void>>();
  return {
    scrollWidth,
    clientWidth,
    scrollLeft: 0,
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

// ========================================
// TESTS
// ========================================
describe('deckCamera — register, idle gate, target (Task 6)', () => {
  beforeEach(() => {
    __resetDeckCameraForTest();
  });

  afterEach(() => {
    registerDeckScroller(null);
    clearRefs();
    vi.restoreAllMocks();
  });

  describe('isDeckCameraIdle', () => {
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

  describe('scroller input listeners', () => {
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
});
