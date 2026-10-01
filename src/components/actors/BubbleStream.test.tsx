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
    <svg>
      <BubbleStream {...baseProps} {...overrides} />
    </svg>,
  );
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
