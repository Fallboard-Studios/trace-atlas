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
        dayStartTimestamp: 0, createdAtMeasure: 0, companies: [], actors: [], robots,
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
  return render(<div><FollowedRobotMarker localeId={LOCALE} /></div>);
}

// Roadmap 53 Task 19 (spec 1.7): the marker is a mover, a div wrapper holding an svg, not a group
// in a sheet. What the wrapper draws in is the same drawing as before.
const marker = (c: HTMLElement) => c.querySelector<HTMLElement>('.mover--marker');
const frameRect = (c: HTMLElement) => marker(c)!.querySelector('rect:not(clipPath rect)')!;
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

    it('draws the border of a 90 x 90 square, unfilled, centred on its origin', () => {
      follow('a');
      const { container } = renderMarker();
      const rect = frameRect(container);
      const line = num(rect, 'stroke-width');

      // the outer line's OUTER edge is the square's edge
      expect(num(rect, 'width') + line).toBeCloseTo(90);
      expect(num(rect, 'x') - line / 2).toBeCloseTo(-45);
      expect(num(rect, 'y') - line / 2).toBeCloseTo(-45);
      expect(rect.getAttribute('fill')).toBe('none');
    });

    it('wears IntroPanel\'s border: a double line (two rects, a line-width gap apart) and an inset glow clipped inside', () => {
      follow('a');
      const { container } = renderMarker();
      const [outer, inner] = Array.from(marker(container)!.querySelectorAll('rect')).filter((r) => r.parentElement?.tagName !== 'clipPath');
      const line = num(outer, 'stroke-width');

      // a 4 px band in thirds: line, gap, line. The inner line's outer face is 2 lines in from the edge.
      expect(line * 3).toBeCloseTo(4);
      expect(num(outer, 'width') - num(inner, 'width')).toBeCloseTo(4 * line, 5);
      expect(inner.getAttribute('stroke')).toBe('#ff8800');
      const glow = marker(container)!.querySelector('path')!;
      expect(glow.getAttribute('fill')).toBe('#ff8800');
      expect(glow.getAttribute('filter')).toMatch(/^url\(#.+\)$/);
      expect(glow.parentElement!.getAttribute('clip-path')).toMatch(/^url\(#.+\)$/);
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
      expect(num(text, 'y')).toBeLessThan(-45); // above the top line, with a gap
      expect(num(text, 'y')).toBeGreaterThan(-65); // but hugging it
      expect(num(text, 'font-size')).toBeCloseTo(14 * 1.33, 0);
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
      const side = 90 * BACK_LAYER_SCALE;
      const line = num(rect, 'stroke-width');

      expect(num(rect, 'width') + line).toBeCloseTo(side);
      expect(num(rect, 'x') - line / 2).toBeCloseTo(-side / 2);
      expect(num(caption(container), 'y')).toBeLessThan(-side / 2);
    });

    it('is decorative: a mover (which takes no clicks, OceanScene.css) hidden from assistive technology', () => {
      follow('a');
      const { container } = renderMarker();

      expect(marker(container)!.classList.contains('mover')).toBe(true);
      expect(marker(container)!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('the mover (roadmap 53, Task 19)', () => {
    // W = MARKER_SIDE; H = MARKER_SIDE + CAPTION_GAP + CAPTION_FONT_SIZE x 1.2 (spec 1.7).
    const W = 90;
    const H = 90 + 6 + 18.6 * 1.2;

    it('is one div.mover.mover--marker in the marker slot, carrying the followed robot id', () => {
      follow('a');
      const { container } = renderMarker();
      const el = marker(container)!;

      expect(el.tagName.toLowerCase()).toBe('div');
      expect(el.getAttribute('data-scene-slot')).toBe('marker');
      expect(el.getAttribute('data-followed-robot')).toBe('a');
      expect(container.querySelectorAll('.mover--marker')).toHaveLength(1);
      expect(container.querySelectorAll('[data-followed-robot]')).toHaveLength(1);
    });

    it('holds one svg, W x H, origin-centred, overflow visible, drawing the unchanged marker', () => {
      follow('a');
      const { container } = renderMarker();
      const svgs = marker(container)!.querySelectorAll('svg');

      expect(svgs).toHaveLength(1);
      const svg = svgs[0];
      expect(marker(container)!.firstElementChild).toBe(svg);
      expect(num(svg, 'width')).toBeCloseTo(W, 6);
      expect(num(svg, 'height')).toBeCloseTo(H, 6);
      expect(svg.getAttribute('viewBox')!.split(' ').map(Number)).toEqual([
        expect.closeTo(-W / 2, 6), expect.closeTo(-H / 2, 6), expect.closeTo(W, 6), expect.closeTo(H, 6),
      ]);
      expect(svg.getAttribute('overflow')).toBe('visible');
      expect(svg.classList.contains('mover__svg')).toBe(true);
      expect(svg.querySelector('text')).not.toBeNull();
    });

    it('keeps the same box for a back-row robot (only the drawn square shrinks)', () => {
      follow('c');
      const { container } = renderMarker();
      const svg = marker(container)!.querySelector('svg')!;

      expect(num(svg, 'width')).toBeCloseTo(W, 6);
      expect(num(svg, 'height')).toBeCloseTo(H, 6);
    });

    it('centres the wrapper on its position: the drawing origin is the svg centre, so the wrapper is pulled back by half itself', () => {
      follow('a');
      const { container } = renderMarker();
      const el = marker(container)!;

      expect(gsap.getProperty(el, 'xPercent')).toBe(-50);
      expect(gsap.getProperty(el, 'yPercent')).toBe(-50);
    });

    it('is never an svg group any more: no g[data-followed-robot], nothing outside the wrapper', () => {
      follow('a');
      const { container } = renderMarker();

      expect(container.querySelector('g[data-followed-robot]')).toBeNull();
      expect(container.firstElementChild!.children).toHaveLength(1);
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
      expect(g.style.visibility).toBe('hidden');

      mountRobotRef('a', 300, 200);
      frame();

      expect(g.style.visibility).toBe('visible');
    });

    it('hides again if the robot\'s ref goes away', () => {
      follow('a');
      const { container } = renderMarker();
      const g = marker(container)!;
      expect(g.style.visibility).toBe('visible');

      clearRefs();
      frame();

      expect(g.style.visibility).toBe('hidden');
    });

    it('is hidden in its markup, so a robot with no gem seed (never placed) leaves no marker at the origin', () => {
      seed(robot('nogem', { gemSeed: undefined }));
      mountRobotRef('nogem', 300, 200);
      follow('nogem');
      const { container } = renderMarker();

      expect(marker(container)!.style.visibility).toBe('hidden');
      frame();
      expect(marker(container)!.style.visibility).toBe('hidden');
    });

    it('rides a robot whose mover is an html wrapper, reading the wrapper\'s x and y', () => {
      follow('a');
      const { container } = renderMarker();
      const wrapper = document.createElement('div');
      gsap.set(wrapper, { x: 640, y: 77 });
      setRef('robot-a', wrapper);
      frame();

      const c = centreOf(640, 77);
      expect(gsap.getProperty(marker(container)!, 'x')).toBe(c.x);
      expect(gsap.getProperty(marker(container)!, 'y')).toBe(c.y);
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
