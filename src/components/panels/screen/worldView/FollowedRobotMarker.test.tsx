// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import gsap from 'gsap';

import { FollowedRobotMarker } from './FollowedRobotMarker';
import { useLocaleStore } from '@/stores/localeStore';
import { setRef, getRef, clearRefs } from '@/utils/refs';
import { fill } from '@/content';
import { BACK_LAYER_SCALE } from '@/constants';
import { JOB_TYPE_LABELS, UNASSIGNED_JOB_LABEL } from '@/data/robotSelectionConfig';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '@/components/robot/gem/polygon';
import { JobType, type Robot } from '@/types/Robot';

// ========================================
// MOCKS
// ========================================
// The camera's followed-robot signal, driven by hand.
const followed = vi.hoisted(() => ({ id: null as string | null, listeners: new Set<() => void>() }));
vi.mock('@/animation/deckCamera', () => ({
  getFollowedRobotId: () => followed.id,
  subscribeFollowedRobot: (listener: () => void) => {
    followed.listeners.add(listener);
    return () => followed.listeners.delete(listener);
  },
}));

// A recording gsap: `set`/`getProperty` share a prop store, and `ticker` holds its handlers so a
// test can run a frame. (The global mock in vitest.setup.ts has neither.)
const tickers = vi.hoisted(() => new Set<() => void>());
vi.mock('gsap', () => {
  const props = new WeakMap<object, Record<string, number>>();
  const propsOf = (target: object) => {
    let p = props.get(target);
    if (!p) props.set(target, (p = {}));
    return p;
  };
  const mocked = {
    set: vi.fn((target: object, vars: Record<string, number>) => Object.assign(propsOf(target), vars)),
    getProperty: vi.fn((target: object, prop: string) => propsOf(target)[prop] ?? 0),
    ticker: {
      add: vi.fn((fn: () => void) => tickers.add(fn)),
      remove: vi.fn((fn: () => void) => tickers.delete(fn)),
    },
  };
  return { default: mocked, ...mocked };
});

// ========================================
// FIXTURES
// ========================================
const LOCALE = 'marker-test';
const SVG_NS = 'http://www.w3.org/2000/svg';
const GEM_SEED = 20261011;
const gem = getRobotGem(GEM_SEED);

function robot(id: string, over: Partial<Robot> = {}): Robot {
  return {
    id, name: `Probe ${id}`, identityColor: '#88ccff', gemSeed: GEM_SEED,
    position: { x: 0, y: 0 }, docking: 'active', batteryLevel: 60, ...over,
  } as Robot;
}

function seed(...robots: Robot[]): void {
  useLocaleStore.setState({
    locales: {
      [LOCALE]: {
        id: LOCALE, attenuationStyleId: 'pelagos', name: LOCALE, coordinates: { x: 3, y: 7 },
        dayStartTimestamp: 0, createdAtMeasure: 0, companies: [], actors: [], currentMeasure: 0, robots,
      },
    },
  });
}

/** The robot's `.robot` group, at a scene position, the way Robot.tsx registers it. */
function mountRobotRef(id: string, x: number, y: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as unknown as SVGGElement;
  gsap.set(g, { x, y });
  setRef(`robot-${id}`, g);
  return g;
}

function follow(id: string | null): void {
  act(() => {
    followed.id = id;
    followed.listeners.forEach((l) => l());
  });
}

function frame(): void {
  act(() => [...tickers].forEach((fn) => fn()));
}

function renderMarker() {
  return render(<svg><FollowedRobotMarker localeId={LOCALE} /></svg>);
}

const marker = (c: HTMLElement) => c.querySelector<SVGGElement>('g[data-followed-robot]');
const frameRect = (c: HTMLElement) => marker(c)!.querySelector('rect')!;
const caption = (c: HTMLElement) => marker(c)!.querySelector('text')!;
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

beforeEach(() => {
  followed.id = null;
  followed.listeners.clear();
  tickers.clear();
  seed(
    robot('a', { job: JobType.VentExtraction, identityColor: '#ff8800' }),
    robot('b', { name: undefined, job: undefined }),
    robot('c', { layer: 'background', job: JobType.Salvage }),
  );
  mountRobotRef('a', 300, 200);
  mountRobotRef('b', 700, 500);
  mountRobotRef('c', 900, 420);
});

afterEach(() => {
  cleanup();
  clearRefs();
  useLocaleStore.setState({ locales: {} });
});

// ========================================
// TESTS
// ========================================
describe('FollowedRobotMarker', () => {
  describe('what it shows', () => {
    it('renders nothing while no robot is followed', () => {
      const { container } = renderMarker();

      expect(marker(container)).toBeNull();
      expect(tickers.size).toBe(0);
    });

    it('draws the border of a 60 x 60 square, unfilled, centred on its origin', () => {
      follow('a');
      const { container } = renderMarker();
      const rect = frameRect(container);

      expect([num(rect, 'width'), num(rect, 'height')]).toEqual([60, 60]);
      expect([num(rect, 'x'), num(rect, 'y')]).toEqual([-30, -30]);
      expect(rect.getAttribute('fill')).toBe('none');
    });

    it('wears the followed robot\'s identity colour', () => {
      follow('a');
      const { container } = renderMarker();

      expect(frameRect(container).getAttribute('stroke')).toBe('#ff8800');
    });

    it('says "name | job" in the content layer\'s words, centred above the square\'s top line', () => {
      follow('a');
      const { container } = renderMarker();
      const text = caption(container);

      expect(text.textContent).toBe(fill('probe.followMarker', { name: 'Probe a', job: JOB_TYPE_LABELS.ventExtraction.humanLabel }));
      expect(text.textContent).toContain(' | ');
      expect(text.getAttribute('text-anchor')).toBe('middle');
      expect(num(text, 'x')).toBe(0);
      expect(num(text, 'y')).toBeLessThan(-30); // above the top line, with a gap
      expect(num(text, 'y')).toBeGreaterThan(-50); // but hugging it
    });

    it('names a robot with no name by its id, and one with no job as unassigned', () => {
      follow('b');
      const { container } = renderMarker();

      expect(caption(container).textContent).toBe(fill('probe.followMarker', { name: 'b', job: UNASSIGNED_JOB_LABEL.humanLabel }));
    });

    it('shrinks the square with a back-row robot, which is drawn smaller', () => {
      follow('c');
      const { container } = renderMarker();
      const rect = frameRect(container);
      const side = 60 * BACK_LAYER_SCALE;

      expect([num(rect, 'width'), num(rect, 'height')]).toEqual([side, side]);
      expect(num(rect, 'x')).toBe(-side / 2);
      expect(num(caption(container), 'y')).toBeLessThan(-side / 2);
    });

    it('is decorative: takes no clicks and is hidden from assistive technology', () => {
      follow('a');
      const { container } = renderMarker();

      expect(marker(container)!.getAttribute('pointer-events')).toBe('none');
      expect(marker(container)!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('which robot', () => {
    it('follows the camera from one robot to the next', () => {
      follow('a');
      const { container } = renderMarker();
      expect(marker(container)!.getAttribute('data-followed-robot')).toBe('a');

      follow('c');

      expect(marker(container)!.getAttribute('data-followed-robot')).toBe('c');
      expect(caption(container).textContent).toContain('Probe c');
    });

    it('goes away when the follow ends', () => {
      follow('a');
      const { container } = renderMarker();

      follow(null);

      expect(marker(container)).toBeNull();
    });

    it('shows a robot that was already being followed when it mounted', () => {
      follow('a');

      const { container } = renderMarker();

      expect(marker(container)!.getAttribute('data-followed-robot')).toBe('a');
    });

    it('draws nothing for an id that is not in the locale', () => {
      follow('ghost');
      const { container } = renderMarker();

      expect(marker(container)).toBeNull();
    });

    it('stops listening to the camera when unmounted', () => {
      follow('a');
      const { unmount } = renderMarker();
      expect(followed.listeners.size).toBe(1);

      unmount();

      expect(followed.listeners.size).toBe(0);
    });
  });

  describe('where it sits', () => {
    const centreOf = (x: number, y: number) => ({ x: x + gemWidth(gem) / 2, y: y + GEM_CANVAS_H / 2 });

    it('is placed on the robot\'s gem canvas centre as soon as it appears', () => {
      follow('a');
      const { container } = renderMarker();
      const g = marker(container)!;

      const c = centreOf(300, 200);
      expect(gsap.getProperty(g, 'x')).toBe(c.x);
      expect(gsap.getProperty(g, 'y')).toBe(c.y);
    });

    it('tracks the robot every frame as it swims', () => {
      follow('a');
      const { container } = renderMarker();
      const g = marker(container)!;

      gsap.set(getRef('robot-a') as SVGGElement, { x: 1210, y: 333 });
      frame();

      const c = centreOf(1210, 333);
      expect(gsap.getProperty(g, 'x')).toBe(c.x);
      expect(gsap.getProperty(g, 'y')).toBe(c.y);
    });

    it('stays hidden until the robot has a ref, then shows', () => {
      clearRefs();
      follow('a');
      const { container } = renderMarker();
      const g = marker(container)!;
      expect(g.getAttribute('visibility')).toBe('hidden');

      mountRobotRef('a', 300, 200);
      frame();

      expect(g.getAttribute('visibility')).toBe('visible');
    });

    it('hides again if the robot\'s ref goes away', () => {
      follow('a');
      const { container } = renderMarker();
      const g = marker(container)!;
      expect(g.getAttribute('visibility')).toBe('visible');

      clearRefs();
      frame();

      expect(g.getAttribute('visibility')).toBe('hidden');
    });
  });

  describe('the ticker handler', () => {
    it('is added while a robot is followed and removed when the follow ends', () => {
      follow('a');
      renderMarker();
      expect(tickers.size).toBe(1);

      follow(null);

      expect(tickers.size).toBe(0);
    });

    it('stays a single handler as the followed robot changes', () => {
      follow('a');
      renderMarker();

      follow('c');

      expect(tickers.size).toBe(1);
    });

    it('is removed on unmount', () => {
      follow('a');
      const { unmount } = renderMarker();

      unmount();

      expect(tickers.size).toBe(0);
    });
  });
});
