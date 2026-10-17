import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BubbleStream } from './BubbleStream';
import { timelineMap, killAllTimelines } from '../../animation/timelineMap';

// ----------------------------------------
// RECORDING GSAP MOCK
// ----------------------------------------
// Overrides the global mock in vitest.setup.ts: that one discards every tween's vars, and this
// file needs to see *what* BubbleStream animates (transforms vs. geometry attributes, wobble
// repeat counts) and whether it pauses/rewinds — so each timeline here records its calls.

interface Recorded {
  method: 'set' | 'to';
  vars: Record<string, unknown>;
  position?: number;
}

interface RecordingTimeline {
  calls: Recorded[];
  config: Record<string, unknown> | undefined;
  children: RecordingTimeline[];
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  set: (t: unknown, vars: Record<string, unknown>) => RecordingTimeline;
  to: (t: unknown, vars: Record<string, unknown>, position?: number) => RecordingTimeline;
  add: (child: RecordingTimeline, position?: number) => RecordingTimeline;
}

const created: RecordingTimeline[] = [];

vi.mock('gsap', () => {
  const timeline = (config?: Record<string, unknown>): RecordingTimeline => {
    const tl: RecordingTimeline = {
      calls: [],
      config,
      children: [],
      pause: vi.fn(() => tl),
      play: vi.fn(() => tl),
      kill: vi.fn(),
      set: (_t, vars) => {
        tl.calls.push({ method: 'set', vars });
        return tl;
      },
      to: (_t, vars, position) => {
        tl.calls.push({ method: 'to', vars, position });
        return tl;
      },
      add: (child) => {
        tl.children.push(child);
        return tl;
      },
    };
    created.push(tl);
    return tl;
  };
  const mocked = { timeline, set: () => {}, to: () => {}, killTweensOf: () => {} };
  return { default: mocked, ...mocked };
});

// ----------------------------------------
// HELPERS
// ----------------------------------------

function makeLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const baseProps = {
  actorId: 'factory-1',
  ventX: 120,
  ventY: 400,
  seed: 42,
  isActive: true,
  totalBuildings: 10,
  bodyHue: 200,
};

function renderStream(overrides: Partial<typeof baseProps> & { depthScale?: number } = {}) {
  return render(
    <div>
      <BubbleStream {...baseProps} {...overrides} />
    </div>,
  );
}

// The OLD derivation, kept inline as the parity reference (roadmap 53, Task 17): the draws the
// component made inside its useGSAP body before they moved into the config memo. Same seeds, same
// order, so the strip is sized from exactly the numbers the timelines tween.
const POP_SCALE = 2.5;
function oldDerivation(seed: number, depthScale: number) {
  const rand = makeLcg(seed);
  const radius = (8 + rand() * 2) * depthScale;
  rand(); // burstStagger
  const count = 5 + Math.floor(rand() * 6);
  const bubbleRand = makeLcg(seed ^ 0xb0bb1e5);
  const params = Array.from({ length: count }, () => {
    const scaledMinRise = 100 * depthScale;
    const risePx = scaledMinRise + bubbleRand() * (500 - scaledMinRise);
    const riseSpeed = 40 + bubbleRand() * (70 - 40);
    const wobbleAmp = (8 + bubbleRand() * 12) * depthScale;
    const wobblePeriod = 0.4 + bubbleRand() * 0.4;
    const wobbleDir = bubbleRand() > 0.5 ? 1 : -1;
    return { risePx, riseDuration: risePx / riseSpeed, wobbleAmp, wobblePeriod, wobbleDir };
  });
  const margin = radius * POP_SCALE;
  const maxWobbleAmp = Math.max(...params.map((p) => p.wobbleAmp));
  const maxRisePx = Math.max(...params.map((p) => p.risePx));
  const W = 2 * (maxWobbleAmp + margin);
  const H = maxRisePx + 2 * margin;
  return { radius, count, params, margin, W, H };
}

function strip(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.mover--bubbles');
  if (!el) throw new Error('no .mover--bubbles rendered');
  return el;
}

function stubReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') && matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

/** The parent timeline is the one registered in timelineMap; its children are the bubbles. */
function registeredParent(): RecordingTimeline {
  const tl = timelineMap.get(`bubble-${baseProps.actorId}`) as unknown as RecordingTimeline | undefined;
  if (!tl) throw new Error('no bubble timeline registered');
  return tl;
}

function findTo(tl: RecordingTimeline, pred: (vars: Record<string, unknown>) => boolean): Recorded {
  const hit = tl.calls.find((c) => c.method === 'to' && pred(c.vars));
  if (!hit) throw new Error('expected tween not recorded');
  return hit;
}

// ----------------------------------------
// TESTS
// ----------------------------------------

describe('BubbleStream', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    created.length = 0;
    killAllTimelines();
    stubReducedMotion(false);
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
  });

  it('exports a React.memo-wrapped component (backlog item 23)', () => {
    expect(typeof BubbleStream).toBe('object');
    expect((BubbleStream as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('does not pass a custom comparator — every prop is a primitive, so the default shallow compare is already correct', () => {
    expect((BubbleStream as unknown as { compare: unknown }).compare).toBeNull();
  });

  describe('rendering + timelineMap lifecycle', () => {
    it('renders one <circle> per seeded bubble count and registers bubble-{actorId}', () => {
      const rand = makeLcg(baseProps.seed);
      rand(); // radius
      rand(); // burstStagger
      const count = 5 + Math.floor(rand() * 6);

      const { container } = renderStream();
      expect(container.querySelectorAll('circle').length).toBe(count);
      expect(registeredParent().children.length).toBe(count);
    });

    it('kills and unregisters the timeline on unmount', () => {
      const { unmount } = renderStream();
      const tl = registeredParent();
      unmount();
      expect(tl.kill).toHaveBeenCalled();
      expect(timelineMap.has(`bubble-${baseProps.actorId}`)).toBe(false);
    });
  });

  describe('the strip mover (roadmap 53, Task 17 - spec 1.6)', () => {
    it('is one div.mover.mover--bubbles in the bubbles slot holding one svg', () => {
      const { container } = renderStream();
      const el = strip(container);
      expect(el.classList.contains('mover')).toBe(true);
      expect(el.getAttribute('data-scene-slot')).toBe('bubbles');
      expect(container.querySelectorAll('.mover--bubbles')).toHaveLength(1);
      expect(el.querySelectorAll(':scope > svg')).toHaveLength(1);
      expect(el.querySelectorAll('svg')).toHaveLength(1);
    });

    it('sizes the svg W x H from the seeded parameters: W = 2 x (maxWobbleAmp + margin), H = maxRisePx + 2 x margin', () => {
      const { container } = renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const svg = strip(container).querySelector('svg')!;
      expect(Number(svg.getAttribute('width'))).toBeCloseTo(ref.W, 9);
      expect(Number(svg.getAttribute('height'))).toBeCloseTo(ref.H, 9);
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${ref.W} ${ref.H}`);
    });

    it('places the strip so the vent lands on the circles: left = ventX - W/2, top = ventY + margin - H', () => {
      const { container } = renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const el = strip(container);
      expect(parseFloat(el.style.left)).toBeCloseTo(baseProps.ventX - ref.W / 2, 6);
      expect(parseFloat(el.style.top)).toBeCloseTo(baseProps.ventY + ref.margin - ref.H, 6);
    });

    it('puts every circle at the local vent (W/2, H - margin) with the seeded radius', () => {
      const { container } = renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const circles = Array.from(container.querySelectorAll('circle'));
      expect(circles).toHaveLength(ref.count);
      for (const c of circles) {
        expect(Number(c.getAttribute('cx'))).toBeCloseTo(ref.W / 2, 9);
        expect(Number(c.getAttribute('cy'))).toBeCloseTo(ref.H - ref.margin, 9);
        expect(Number(c.getAttribute('r'))).toBeCloseTo(ref.radius, 9);
      }
    });

    it('the vent in scene units is unchanged: strip origin + the circle position = (ventX, ventY)', () => {
      const { container } = renderStream({ ventX: 333, ventY: 777 });
      const el = strip(container);
      const c = container.querySelector('circle')!;
      expect(parseFloat(el.style.left) + Number(c.getAttribute('cx'))).toBeCloseTo(333, 6);
      expect(parseFloat(el.style.top) + Number(c.getAttribute('cy'))).toBeCloseTo(777, 6);
    });

    it('holds the whole burst: the highest popped bubble and the widest wobble stay inside the strip', () => {
      const { container } = renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const svg = strip(container).querySelector('svg')!;
      const W = Number(svg.getAttribute('width'));
      const H = Number(svg.getAttribute('height'));
      const cx = ref.W / 2;
      const cy = H - ref.margin;
      for (const p of ref.params) {
        // The bubble ends its rise at y = -risePx with the pop's scale, at most wobbleAmp aside.
        expect(cy - p.risePx - ref.margin).toBeGreaterThanOrEqual(-1e-9);
        expect(cx - p.wobbleAmp - ref.margin).toBeGreaterThanOrEqual(-1e-9);
        expect(cx + p.wobbleAmp + ref.margin).toBeLessThanOrEqual(W + 1e-9);
      }
      expect(cy + ref.margin).toBeLessThanOrEqual(H + 1e-9);
    });

    it('depthScale 1/3 shrinks the strip, the margin and the offsets by the same factor', () => {
      const depth = 1 / 3;
      const { container } = renderStream({ depthScale: depth });
      const ref = oldDerivation(baseProps.seed, depth);
      const el = strip(container);
      const svg = el.querySelector('svg')!;
      expect(Number(svg.getAttribute('width'))).toBeCloseTo(ref.W, 9);
      expect(Number(svg.getAttribute('height'))).toBeCloseTo(ref.H, 9);
      expect(parseFloat(el.style.left)).toBeCloseTo(baseProps.ventX - ref.W / 2, 6);
      expect(parseFloat(el.style.top)).toBeCloseTo(baseProps.ventY + ref.margin - ref.H, 6);
      const full = oldDerivation(baseProps.seed, 1);
      expect(ref.W).toBeLessThan(full.W);
      expect(ref.H).toBeLessThan(full.H);
    });

    it('draws the same parameters the old effect drew: the first bubble tweens the old rise, wobble and duration', () => {
      renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const bubbles = registeredParent().children;
      expect(bubbles).toHaveLength(ref.count);
      bubbles.forEach((b, i) => {
        const rise = findTo(b, (v) => 'y' in v);
        const wobble = findTo(b, (v) => v.yoyo === true);
        expect(rise.vars.y).toBeCloseTo(-ref.params[i].risePx, 9);
        expect(rise.vars.duration).toBeCloseTo(ref.params[i].riseDuration, 9);
        expect(wobble.vars.x).toBeCloseTo(ref.params[i].wobbleDir * ref.params[i].wobbleAmp, 9);
        expect(wobble.vars.duration).toBeCloseTo(ref.params[i].wobblePeriod, 9);
      });
    });

    it('sizes the strip from the seed alone, for several seeds and both depth extremes', () => {
      for (const seed of [0, 1, 42, 999, 0xdeadbeef]) {
        for (const depth of [1, 0.5, 1 / 3]) {
          cleanup();
          const { container } = renderStream({ seed, depthScale: depth });
          const ref = oldDerivation(seed, depth);
          const svg = strip(container).querySelector('svg')!;
          expect(Number(svg.getAttribute('width'))).toBeCloseTo(ref.W, 9);
          expect(Number(svg.getAttribute('height'))).toBeCloseTo(ref.H, 9);
        }
      }
    });

    it('keeps the strip and its hidden circles under reduced motion (no timeline, same box)', () => {
      stubReducedMotion(true);
      const { container } = renderStream();
      const ref = oldDerivation(baseProps.seed, 1);
      const svg = strip(container).querySelector('svg')!;
      expect(Number(svg.getAttribute('width'))).toBeCloseTo(ref.W, 9);
      expect(container.querySelectorAll('circle')).toHaveLength(ref.count);
      expect(timelineMap.has(`bubble-${baseProps.actorId}`)).toBe(false);
    });

    it('a vent near the scene edge gives a strip that hangs outside it rather than clamping (the circles must stay on the vent)', () => {
      const { container } = renderStream({ ventX: 2, ventY: 50 });
      const el = strip(container);
      const c = container.querySelector('circle')!;
      expect(parseFloat(el.style.left)).toBeLessThan(0);
      expect(parseFloat(el.style.top)).toBeLessThan(0);
      expect(parseFloat(el.style.left) + Number(c.getAttribute('cx'))).toBeCloseTo(2, 6);
      expect(parseFloat(el.style.top) + Number(c.getAttribute('cy'))).toBeCloseTo(50, 6);
    });

    it('moving the vent moves the strip without re-seeding it (same size, new left/top)', () => {
      const { container, rerender } = renderStream({ ventX: 100, ventY: 400 });
      const svgBefore = strip(container).querySelector('svg')!;
      const w = svgBefore.getAttribute('width');
      const h = svgBefore.getAttribute('height');
      rerender(
        <div>
          <BubbleStream {...baseProps} ventX={250} ventY={500} />
        </div>,
      );
      const el = strip(container);
      const svg = el.querySelector('svg')!;
      expect(svg.getAttribute('width')).toBe(w);
      expect(svg.getAttribute('height')).toBe(h);
      const ref = oldDerivation(baseProps.seed, 1);
      expect(parseFloat(el.style.left)).toBeCloseTo(250 - ref.W / 2, 6);
      expect(parseFloat(el.style.top)).toBeCloseTo(500 + ref.margin - ref.H, 6);
    });
  });

  describe('transform-based motion (docs/ANIMATION_SYSTEM.md: transforms, not geometry attributes)', () => {
    it('never tweens cx/cy/r — rise is y, wobble is x, pop is scale', () => {
      renderStream();
      const bubble = registeredParent().children[0];
      for (const c of bubble.calls) {
        expect(c.vars).not.toHaveProperty('attr');
      }
      expect(() => findTo(bubble, (v) => 'y' in v)).not.toThrow();
      expect(() => findTo(bubble, (v) => 'x' in v && v.yoyo === true)).not.toThrow();
      expect(() => findTo(bubble, (v) => 'scale' in v)).not.toThrow();
    });

    it('rewinds every bubble to the origin at the start of each burst (x/y 0, scale 1, opacity 0)', () => {
      renderStream();
      const bubble = registeredParent().children[0];
      const reset = bubble.calls.find((c) => c.method === 'set');
      expect(reset?.vars).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 0 });
    });

    it('stops wobbling less than one wobble period after the rise ends (no invisible post-pop wobble)', () => {
      renderStream();
      for (const bubble of registeredParent().children) {
        const rise = findTo(bubble, (v) => 'y' in v);
        const wobble = findTo(bubble, (v) => v.yoyo === true);
        const riseDuration = rise.vars.duration as number;
        const period = wobble.vars.duration as number;
        const plays = (wobble.vars.repeat as number) + 1;
        const wobbleTotal = plays * period;
        expect(wobbleTotal).toBeGreaterThanOrEqual(riseDuration - 1e-9);
        expect(wobbleTotal).toBeLessThan(riseDuration + period);
      }
    });
  });

  describe('isActive', () => {
    it('plays when active', () => {
      renderStream({ isActive: true });
      expect(registeredParent().play).toHaveBeenCalled();
    });

    it('rewinds to the hidden start state via pause(0) when inactive, not a bare pause', () => {
      // A bare pause freezes bubbles mid-air: GSAP writes style.opacity, which beats any
      // opacity="0" attribute the component might set by hand.
      renderStream({ isActive: false });
      const tl = registeredParent();
      expect(tl.pause).toHaveBeenCalledWith(0);
      expect(tl.play).not.toHaveBeenCalled();
    });
  });

  describe('prefers-reduced-motion', () => {
    it('builds no timeline and keeps the circles hidden when reduced motion is requested', () => {
      stubReducedMotion(true);
      const { container } = renderStream();
      expect(timelineMap.has(`bubble-${baseProps.actorId}`)).toBe(false);
      expect(created.length).toBe(0);
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
      circles.forEach((c) => {
        expect(c.getAttribute('opacity')).toBe('0');
      });
    });
  });

  describe('config derivation', () => {
    it('derives bubble count between 5 and 10 for any seed', () => {
      for (const seed of [0, 1, 42, 999, 0xdeadbeef]) {
        const rand = makeLcg(seed);
        rand(); // radius
        rand(); // burstStagger
        const count = 5 + Math.floor(rand() * 6);
        expect(count).toBeGreaterThanOrEqual(5);
        expect(count).toBeLessThanOrEqual(10);
      }
    });

    it('burst interval scales with totalBuildings (initial delay lands inside it)', () => {
      renderStream({ totalBuildings: 25 });
      const cfg = registeredParent().config!;
      const burstInterval = 4 * 25; // TARGET_GLOBAL_BURST_INTERVAL_SECONDS × totalBuildings
      expect(cfg.repeat).toBe(-1);
      expect(cfg.delay as number).toBeGreaterThanOrEqual(0);
      expect(cfg.delay as number).toBeLessThan(burstInterval);
      expect(cfg.repeatDelay as number).toBeLessThanOrEqual(burstInterval);
    });

    it('clamps totalBuildings to a minimum of 1 (never a zero/negative interval)', () => {
      renderStream({ totalBuildings: 0 });
      const cfg = registeredParent().config!;
      expect(cfg.delay as number).toBeLessThan(4);
    });

    it('depthScale halves the wobble amplitude for midground (scale=0.5)', () => {
      renderStream({ depthScale: 0.5 });
      const halfAmp = Math.abs(findTo(registeredParent().children[0], (v) => v.yoyo === true).vars.x as number);
      cleanup();
      killAllTimelines();
      created.length = 0;
      renderStream({ depthScale: 1 });
      const fullAmp = Math.abs(findTo(registeredParent().children[0], (v) => v.yoyo === true).vars.x as number);
      expect(halfAmp).toBeCloseTo(fullAmp * 0.5);
    });
  });
});
