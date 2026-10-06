// ========================================
// IMPORTS
// ========================================
import { useRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ----------------------------------------
// RECORDING GSAP MOCK — same recipe as useHaloMotion.test.tsx/useOrbiterMotion.test.tsx:
// `gsap.timeline()` returns an object whose `.set()` records each call (target + vars + position)
// and whose `.kill()`/`onComplete` are inspectable, enough to drive and assert the flicker timeline
// without a real GSAP runtime.
// ----------------------------------------
interface RecordedSet {
  target: unknown;
  vars: Record<string, unknown>;
  position?: number;
}

interface FakeTimeline {
  kill: ReturnType<typeof vi.fn>;
  sets: RecordedSet[];
  onComplete?: () => void;
  set: (target: unknown, vars: Record<string, unknown>, position?: number) => FakeTimeline;
  complete: () => void;
}

const createdTimelines: FakeTimeline[] = [];

function makeTimeline(vars: { onComplete?: () => void } = {}): FakeTimeline {
  const tl: FakeTimeline = {
    kill: vi.fn(),
    sets: [],
    onComplete: vars.onComplete,
    set: (target, setVars, position) => {
      tl.sets.push({ target, vars: setVars, position });
      if (target && typeof target === 'object' && 'style' in target) {
        const el = target as HTMLElement;
        if ('opacity' in setVars) el.style.opacity = String(setVars.opacity);
      }
      return tl;
    },
    complete: () => {
      tl.onComplete?.();
    },
  };
  createdTimelines.push(tl);
  return tl;
}

vi.mock('gsap', () => {
  const mocked = {
    timeline: (vars?: { onComplete?: () => void }) => makeTimeline(vars),
    set: (target: unknown, setVars: Record<string, unknown>) => {
      if (target && typeof target === 'object' && 'style' in target) {
        const el = target as HTMLElement;
        if ('opacity' in setVars) el.style.opacity = String(setVars.opacity);
      }
      return mocked;
    },
    to: () => ({}),
    killTweensOf: () => {},
    utils: { selector: () => () => [] },
  };
  return { default: mocked, ...mocked };
});

// ========================================
// OTHER IMPORTS (after the gsap mock — vitest hoists vi.mock calls above these anyway)
// ========================================
import { useStripFlicker, type StripLine, type FlickerTrigger } from './useStripFlicker';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';
import { FLICKER_WINDOW, FLICKER_LOW } from './stripFlicker';

// ========================================
// FIXTURES
// ========================================
function setMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function Strip({ line, base }: { line: StripLine; base: number }) {
  return <path className="gem__strip" data-line={line} data-base={base} opacity={base} />;
}

function Harness({
  robotId = 'r1',
  context = 'world' as 'world' | 'avatar',
  gemSeed = 20261004,
  enabled = true,
  top = [0, 'a'] as FlickerTrigger,
  midLeft = [0, 'a', 0] as FlickerTrigger,
  midRight = [0, 'a', 0] as FlickerTrigger,
  orbiters = [0, false] as FlickerTrigger,
}: {
  robotId?: string;
  context?: 'world' | 'avatar';
  gemSeed?: number;
  enabled?: boolean;
  top?: FlickerTrigger;
  midLeft?: FlickerTrigger;
  midRight?: FlickerTrigger;
  orbiters?: FlickerTrigger;
}) {
  const ref = useRef<SVGGElement>(null);
  useStripFlicker({ root: ref, robotId, context, gemSeed, enabled, triggers: { top, midLeft, midRight, orbiters } });
  return (
    <svg>
      <g ref={ref} className="gem">
        <Strip line="top" base={0.6} />
        <Strip line="midLeft" base={0.6} />
        <Strip line="midRight" base={0.6} />
        <Strip line="orbiters" base={0.4} />
        <Strip line="orbiters" base={0.4} />
        <Strip line="orbiters" base={0.4} />
        <Strip line="orbiters" base={0.4} />
      </g>
    </svg>
  );
}

function stripsFor(container: HTMLElement, line: StripLine): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(`.gem__strip[data-line="${line}"]`)];
}

function keyFor(context: 'world' | 'avatar', robotId: string, line: StripLine) {
  return `flicker-${context}-${robotId}-${line}`;
}

// ========================================
// TESTS
// ========================================
afterEach(() => {
  cleanup();
  killAllTimelines();
  createdTimelines.length = 0;
  setMatchMedia(false);
});

describe('useStripFlicker — per-line flicker timelines (Phase 41, Task 12)', () => {
  it('mount never flickers — no key for any line', () => {
    render(<Harness />);
    (['top', 'midLeft', 'midRight', 'orbiters'] as StripLine[]).forEach((line) => {
      expect(timelineMap.has(keyFor('world', 'r1', line))).toBe(false);
    });
  });

  it('a top trigger change → key flicker-world-r1-top, only [data-line=top] strips touched, 3–5 dips inside the 2s window, final opacity === data-base', () => {
    const { container, rerender } = render(<Harness top={[0, 'a']} />);
    rerender(<Harness top={[5, 'a']} />);

    const key = keyFor('world', 'r1', 'top');
    expect(timelineMap.has(key)).toBe(true);
    const tl = timelineMap.get(key) as unknown as FakeTimeline;

    const topStrip = stripsFor(container, 'top')[0];
    const dips = tl.sets.filter((s) => s.target === topStrip && s.vars.opacity === FLICKER_LOW);
    expect(dips.length).toBeGreaterThanOrEqual(3);
    expect(dips.length).toBeLessThanOrEqual(5);
    dips.forEach((d) => expect(d.position).toBeGreaterThanOrEqual(0));
    dips.forEach((d) => expect(d.position).toBeLessThan(FLICKER_WINDOW));

    tl.complete();
    expect(Number(topStrip.getAttribute('data-base'))).toBe(0.6);
    expect(topStrip.style.opacity).toBe('0.6');
  });

  it('midLeft strips are untouched by a top-only change', () => {
    const { container, rerender } = render(<Harness top={[0, 'a']} />);
    rerender(<Harness top={[5, 'a']} />);
    const midLeftStrip = stripsFor(container, 'midLeft')[0];
    const tl = timelineMap.get(keyFor('world', 'r1', 'top')) as unknown as FakeTimeline;
    expect(tl.sets.some((s) => s.target === midLeftStrip)).toBe(false);
    expect(timelineMap.has(keyFor('world', 'r1', 'midLeft'))).toBe(false);
  });

  it('an orbiters trigger change hits every orbiter-strip copy', () => {
    const { container, rerender } = render(<Harness orbiters={[0, false]} />);
    rerender(<Harness orbiters={[3, false]} />);
    const tl = timelineMap.get(keyFor('world', 'r1', 'orbiters')) as unknown as FakeTimeline;
    const orbiterStrips = stripsFor(container, 'orbiters');
    expect(orbiterStrips).toHaveLength(4);
    orbiterStrips.forEach((el) => {
      expect(tl.sets.some((s) => s.target === el)).toBe(true);
    });
  });

  it('a second top change inside the window kills and rebuilds under the same key (one key, a different pattern)', () => {
    const { rerender } = render(<Harness top={[0, 'a']} />);
    rerender(<Harness top={[5, 'a']} />);
    const key = keyFor('world', 'r1', 'top');
    const first = timelineMap.get(key) as unknown as FakeTimeline;
    expect(first.kill).not.toHaveBeenCalled();

    rerender(<Harness top={[9, 'a']} />);
    expect(first.kill).toHaveBeenCalled();
    const second = timelineMap.get(key);
    expect(second).not.toBe(first);
    expect([...timelineMap.keys()].filter((k) => k === key)).toHaveLength(1);

    const secondPattern = (second as unknown as FakeTimeline).sets.filter((s) => s.vars.opacity === FLICKER_LOW).map((s) => s.position);
    const firstPattern = first.sets.filter((s) => s.vars.opacity === FLICKER_LOW).map((s) => s.position);
    expect(secondPattern).not.toEqual(firstPattern); // run advanced -> a different seed stream
  });

  it('reduced motion → no key for any line, ever', () => {
    setMatchMedia(true);
    const { rerender } = render(<Harness top={[0, 'a']} />);
    rerender(<Harness top={[5, 'a']} />);
    expect(timelineMap.has(keyFor('world', 'r1', 'top'))).toBe(false);
  });

  it('enabled: false → no key for any line, ever', () => {
    const { rerender } = render(<Harness top={[0, 'a']} enabled={false} />);
    rerender(<Harness top={[5, 'a']} enabled={false} />);
    expect(timelineMap.has(keyFor('world', 'r1', 'top'))).toBe(false);
  });

  it('unmount kills every line’s key', () => {
    const { rerender, unmount } = render(<Harness top={[0, 'a']} midLeft={[0, 'a', 0]} />);
    rerender(<Harness top={[5, 'a']} midLeft={[0, 'b', 0]} />);
    const topTl = timelineMap.get(keyFor('world', 'r1', 'top')) as unknown as FakeTimeline;
    const midTl = timelineMap.get(keyFor('world', 'r1', 'midLeft')) as unknown as FakeTimeline;
    unmount();
    expect(topTl.kill).toHaveBeenCalled();
    expect(midTl.kill).toHaveBeenCalled();
    expect(timelineMap.has(keyFor('world', 'r1', 'top'))).toBe(false);
    expect(timelineMap.has(keyFor('world', 'r1', 'midLeft'))).toBe(false);
  });
});
