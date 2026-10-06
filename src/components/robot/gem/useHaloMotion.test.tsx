// ========================================
// IMPORTS
// ========================================
import { useRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ----------------------------------------
// RECORDING GSAP MOCK — overrides vitest.setup.ts's global no-op mock (same recipe
// useOrbiterMotion.test.tsx uses), extended so `gsap.timeline()` returns an object whose `.to()`
// records each child tween (target + vars) and whose `.kill()` is a spy — enough to inspect both
// the mount `gsap.set` calls and the dial tween's children without a real GSAP runtime.
// ----------------------------------------
interface FakeTween {
  target: unknown;
  vars: Record<string, unknown>;
}

interface FakeTimeline {
  kill: ReturnType<typeof vi.fn>;
  children: FakeTween[];
  to: (target: unknown, vars: Record<string, unknown>, position?: number) => FakeTween;
}

const setCalls: FakeTween[] = [];
const createdTimelines: FakeTimeline[] = [];

function makeTimeline(): FakeTimeline {
  const tl: FakeTimeline = {
    kill: vi.fn(),
    children: [],
    to: (target, vars) => {
      const tween: FakeTween = { target, vars };
      tl.children.push(tween);
      return tween;
    },
  };
  createdTimelines.push(tl);
  return tl;
}

vi.mock('gsap', () => {
  const mocked = {
    timeline: () => makeTimeline(),
    set: (target: unknown, vars: Record<string, unknown>) => {
      setCalls.push({ target, vars });
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
import { useHaloMotion, type HaloMotionDial } from './useHaloMotion';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';

// ========================================
// FIXTURES
// ========================================
function stops(peak = 0.55): HaloMotionDial['stops'] {
  return [
    { offset: 0, opacity: 0 },
    { offset: 1 / 3, opacity: 0 },
    { offset: 0.5, opacity: peak },
    { offset: 0.625, opacity: peak / 2 },
    { offset: 0.875, opacity: peak / 2 },
    { offset: 1, opacity: 0 },
  ];
}

function halo(overrides: Partial<HaloMotionDial> = {}): HaloMotionDial {
  return { rx: 60, ry: 30, stops: stops(), ...overrides };
}

function setMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function Harness({
  robotId = 'r1',
  context = 'world' as 'world' | 'avatar',
  haloDial,
  dimOpacity = 1,
  enabled = true,
}: {
  robotId?: string;
  context?: 'world' | 'avatar';
  haloDial: HaloMotionDial;
  dimOpacity?: number;
  enabled?: boolean;
}) {
  const ref = useRef<SVGGElement>(null);
  useHaloMotion({ root: ref, robotId, context, halo: haloDial, dimOpacity, enabled });
  return (
    <svg>
      <g ref={ref} className="gem">
        <defs>
          <radialGradient id={`halo-${context}-${robotId}`}>
            {haloDial.stops.map((s, i) => (
              <stop key={i} offset={`${(s.offset * 100).toFixed(2)}%`} stopColor="#ae5378" stopOpacity={s.opacity} />
            ))}
          </radialGradient>
        </defs>
        <ellipse className="gem__halo" cx={0} cy={0} rx={haloDial.rx} ry={haloDial.ry} opacity={1} />
      </g>
    </svg>
  );
}

function setsFor(target: unknown): FakeTween[] {
  return setCalls.filter((c) => c.target === target);
}

function haloEllipse(container: HTMLElement): SVGEllipseElement {
  return container.querySelector('ellipse.gem__halo')!;
}

function stopEls(container: HTMLElement): SVGStopElement[] {
  return [...container.querySelectorAll('stop')];
}

// ========================================
// TESTS
// ========================================
afterEach(() => {
  cleanup();
  killAllTimelines();
  setCalls.length = 0;
  createdTimelines.length = 0;
  setMatchMedia(false);
});

describe('useHaloMotion — mount state, dial tween, reduced motion (Phase 41, Task 8)', () => {
  it('mount: one gsap.set for rx/ry + opacity 0 on the ellipse, and one gsap.set per stop; no timelineMap key yet', () => {
    const { container } = render(<Harness haloDial={halo()} />);
    const ellipse = haloEllipse(container);
    const ellipseSets = setsFor(ellipse);
    expect(ellipseSets).toHaveLength(1);
    expect(ellipseSets[0].vars).toMatchObject({ attr: { rx: 60, ry: 30 }, opacity: 0 });

    const stopList = stopEls(container);
    expect(stopList).toHaveLength(6);
    stopList.forEach((stopEl, i) => {
      const calls = setsFor(stopEl);
      expect(calls).toHaveLength(1);
      expect(calls[0].vars).toEqual({ attr: { offset: `${(stops()[i].offset * 100).toFixed(2)}%`, 'stop-opacity': stops()[i].opacity } });
    });

    expect([...timelineMap.keys()].some((k) => k.startsWith('halo-'))).toBe(false);
  });

  it('a halo change creates one tween, keyed halo-world-r1, duration 0.5, targeting rx/ry and the six stops’ offset/stop-opacity — never opacity', () => {
    const { container, rerender } = render(<Harness haloDial={halo()} />);
    rerender(<Harness haloDial={halo({ rx: 40, ry: 20, stops: stops(0.3) })} />);

    const tl = timelineMap.get('halo-world-r1');
    expect(tl).toBeDefined();
    const fake = tl as unknown as FakeTimeline;
    expect(fake.children).toHaveLength(7); // ellipse + 6 stops

    const ellipse = haloEllipse(container);
    const ellipseChild = fake.children.find((c) => c.target === ellipse)!;
    expect(ellipseChild.vars).toMatchObject({ attr: { rx: 40, ry: 20 }, duration: 0.5 });
    expect(ellipseChild.vars).not.toHaveProperty('opacity');

    const stopList = stopEls(container);
    stopList.forEach((stopEl, i) => {
      const child = fake.children.find((c) => c.target === stopEl)!;
      expect(child.vars).toMatchObject({
        attr: { offset: `${(stops(0.3)[i].offset * 100).toFixed(2)}%`, 'stop-opacity': stops(0.3)[i].opacity },
        duration: 0.5,
      });
    });
  });

  it('a second halo change mid-tween replaces the tween under the same key (one key, one active tween)', () => {
    const { rerender } = render(<Harness haloDial={halo()} />);
    rerender(<Harness haloDial={halo({ rx: 40, ry: 20 })} />);
    const first = timelineMap.get('halo-world-r1') as unknown as FakeTimeline;
    expect(first.kill).not.toHaveBeenCalled();

    rerender(<Harness haloDial={halo({ rx: 50, ry: 25 })} />);
    expect(first.kill).toHaveBeenCalled();
    const second = timelineMap.get('halo-world-r1');
    expect(second).not.toBe(first);
    expect([...timelineMap.keys()].filter((k) => k === 'halo-world-r1')).toHaveLength(1);
  });

  it('a dimOpacity change alone touches no gsap.* call', () => {
    const dial = halo(); // the same reference across both renders — isolates dimOpacity as the only change
    const { rerender } = render(<Harness haloDial={dial} dimOpacity={1} />);
    setCalls.length = 0;
    createdTimelines.length = 0;
    rerender(<Harness haloDial={dial} dimOpacity={0.2} />);
    expect(setCalls).toHaveLength(0);
    expect(createdTimelines).toHaveLength(0);
    expect([...timelineMap.keys()].some((k) => k.startsWith('halo-'))).toBe(false);
  });

  it('reduced motion → the dial tween runs at duration 0', () => {
    setMatchMedia(true);
    const { rerender } = render(<Harness haloDial={halo()} />);
    rerender(<Harness haloDial={halo({ rx: 40, ry: 20 })} />);
    const tl = timelineMap.get('halo-world-r1') as unknown as FakeTimeline;
    tl.children.forEach((c) => expect(c.vars.duration).toBe(0));
  });

  it('enabled: false → no gsap.* calls at all, mount or change', () => {
    const { rerender } = render(<Harness haloDial={halo()} enabled={false} />);
    expect(setCalls).toHaveLength(0);
    rerender(<Harness haloDial={halo({ rx: 40 })} enabled={false} />);
    expect(setCalls).toHaveLength(0);
    expect(createdTimelines).toHaveLength(0);
  });

  it('unmount kills the key', () => {
    const { rerender, unmount } = render(<Harness haloDial={halo()} />);
    rerender(<Harness haloDial={halo({ rx: 40 })} />);
    const tl = timelineMap.get('halo-world-r1') as unknown as FakeTimeline;
    expect(tl).toBeDefined();
    unmount();
    expect(tl.kill).toHaveBeenCalled();
    expect(timelineMap.has('halo-world-r1')).toBe(false);
  });

  it('world and avatar for the same robot id coexist under separate keys', () => {
    const world = render(<Harness robotId="r1" context="world" haloDial={halo()} />);
    world.rerender(<Harness robotId="r1" context="world" haloDial={halo({ rx: 41 })} />);
    expect(timelineMap.has('halo-world-r1')).toBe(true);

    const avatar = render(<Harness robotId="r1" context="avatar" haloDial={halo()} />);
    avatar.rerender(<Harness robotId="r1" context="avatar" haloDial={halo({ rx: 41 })} />);
    expect(timelineMap.has('halo-avatar-r1')).toBe(true);

    // Mounting/changing the avatar instance must not have touched the world instance's key.
    expect(timelineMap.has('halo-world-r1')).toBe(true);
  });
});
