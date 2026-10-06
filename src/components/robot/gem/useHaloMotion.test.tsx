// ========================================
// IMPORTS
// ========================================
import { useRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

// ----------------------------------------
// RECORDING GSAP MOCK — overrides vitest.setup.ts's global no-op mock (same recipe
// useOrbiterMotion.test.tsx uses), extended so `gsap.timeline()` returns an object whose `.to()`
// records each child tween (target + vars) and supports `.progress(p)` (driving the child's own
// `onUpdate`, same as a real nested GSAP tween would at that point in its parent's timeline — this
// mock's timelines only ever carry the one proxy child `decorateArc` creates, so forwarding
// progress 1:1 is exact, not an approximation) — enough to inspect both the mount `gsap.set` calls
// and drive the ripple's per-frame maths without a real GSAP runtime.
// ----------------------------------------
interface FakeTween {
  target: unknown;
  vars: Record<string, unknown>;
  progress: (p: number) => void;
}

interface FakeTimeline {
  kill: ReturnType<typeof vi.fn>;
  children: FakeTween[];
  to: (target: unknown, vars: Record<string, unknown>, position?: number) => FakeTween;
  progress: (p: number) => void;
}

const setCalls: FakeTween[] = [];
const createdTimelines: FakeTimeline[] = [];

function makeTimeline(): FakeTimeline {
  const tl: FakeTimeline = {
    kill: vi.fn(),
    children: [],
    to: (target, vars) => {
      const tween: FakeTween = {
        target,
        vars,
        progress: (p: number) => {
          if (target && typeof target === 'object' && 'u' in (target as Record<string, unknown>)) {
            (target as { u: number }).u = p;
          }
          if (typeof vars.onUpdate === 'function') (vars.onUpdate as () => void)();
        },
      };
      tl.children.push(tween);
      return tween;
    },
    progress: (p: number) => {
      tl.children.forEach((child) => child.progress(p));
    },
  };
  createdTimelines.push(tl);
  return tl;
}

vi.mock('gsap', () => {
  const mocked = {
    timeline: () => makeTimeline(),
    set: (target: unknown, vars: Record<string, unknown>) => {
      setCalls.push({ target, vars, progress: () => {} });
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
import gsap from 'gsap';

import { useHaloMotion, type HaloMotionDial } from './useHaloMotion';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';
import { HALO_HOLE } from './haloDials';
import { rippleCycles, ripplePosition, rippleEnvelope } from './haloRipple';

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

const RIPPLE_STOP_COUNT = 5;

function Harness({
  robotId = 'r1',
  context = 'world' as 'world' | 'avatar',
  haloDial,
  dimOpacity = 1,
  enabled = true,
  withRipple = false,
  onDecorateArc,
}: {
  robotId?: string;
  context?: 'world' | 'avatar';
  haloDial: HaloMotionDial;
  dimOpacity?: number;
  enabled?: boolean;
  /** Renders `ellipse.gem__ripple` + its 5-stop gradient, matching RobotGem's real markup (Task 9),
   *  so `decorateArc` has elements to find. */
  withRipple?: boolean;
  /** Receives the hook's `decorateArc` on every render — the test drives it directly. */
  onDecorateArc?: (decorateArc: ReturnType<typeof useHaloMotion>['decorateArc']) => void;
}) {
  const ref = useRef<SVGGElement>(null);
  const { decorateArc } = useHaloMotion({ root: ref, robotId, context, halo: haloDial, dimOpacity, enabled });
  onDecorateArc?.(decorateArc);
  const rippleId = `ripple-${context}-${robotId}`;
  return (
    <svg>
      <g ref={ref} className="gem">
        <defs>
          <radialGradient id={`halo-${context}-${robotId}`}>
            {haloDial.stops.map((s, i) => (
              <stop key={i} offset={`${(s.offset * 100).toFixed(2)}%`} stopColor="#ae5378" stopOpacity={s.opacity} />
            ))}
          </radialGradient>
          {withRipple && (
            <radialGradient id={rippleId}>
              {Array.from({ length: RIPPLE_STOP_COUNT }, (_, i) => (
                <stop key={i} offset={`${((i / (RIPPLE_STOP_COUNT - 1)) * 100).toFixed(2)}%`} stopColor="#ae5378" stopOpacity={0} />
              ))}
            </radialGradient>
          )}
        </defs>
        <ellipse className="gem__halo" cx={0} cy={0} rx={haloDial.rx} ry={haloDial.ry} opacity={1} />
        {withRipple && <ellipse className="gem__ripple" cx={0} cy={0} rx={haloDial.rx} ry={haloDial.ry} fill={`url(#${rippleId})`} opacity={0} />}
      </g>
    </svg>
  );
}

function setsFor(target: unknown): FakeTween[] {
  return setCalls.filter((c) => c.target === target);
}

function lastSetFor(target: unknown): FakeTween | undefined {
  const matches = setsFor(target);
  return matches[matches.length - 1];
}

function haloEllipse(container: HTMLElement): SVGEllipseElement {
  return container.querySelector('ellipse.gem__halo')!;
}

function rippleEllipse(container: HTMLElement): SVGEllipseElement {
  return container.querySelector('ellipse.gem__ripple')!;
}

/** jsdom gotcha: a descendant selector through an SVG gradient element (e.g. `radialGradient
 *  stop`) matches nothing — query `stop` alone and slice by DOM order instead (halo's 6 render
 *  before the ripple's 5, Harness below). */
function stopEls(container: HTMLElement): SVGStopElement[] {
  return [...container.querySelectorAll('stop')].slice(0, 6);
}

function rippleStopEls(container: HTMLElement): SVGStopElement[] {
  return [...container.querySelectorAll('stop')].slice(6);
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

describe('useHaloMotion.decorateArc — the ripple, and the halo’s only moment of visibility (Phase 41, Task 11)', () => {
  function mount(haloDial: HaloMotionDial, dimOpacity = 1) {
    let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
    const { container } = render(
      <Harness haloDial={haloDial} dimOpacity={dimOpacity} withRipple onDecorateArc={(d) => { decorateArc = d; }} />,
    );
    return { container, decorateArc };
  }

  it('spawn: at tl.progress(0.5) the ring sits where ripplePosition says, both ellipses fade to dimOpacity × rippleEnvelope(0.5); at progress(1) both are 0', () => {
    const { container, decorateArc } = mount(halo(), 0.8);
    const tl = (gsap.timeline() as unknown as FakeTimeline);
    decorateArc('spawn', 3, tl as unknown as Parameters<typeof decorateArc>[2]);
    expect(tl.children).toHaveLength(1); // the one proxy tween

    tl.progress(0.5);
    const hole = HALO_HOLE / halo().ry;
    const expectedPosition = ripplePosition('spawn', 0.5, rippleCycles(3), hole);
    const envelope = rippleEnvelope(0.5);
    const ringStop = rippleStopEls(container)[2]; // rippleStops' 3rd of 5 is the ring itself
    expect(lastSetFor(ringStop)!.vars).toMatchObject({ attr: { offset: `${(expectedPosition * 100).toFixed(2)}%` } });
    expect(Number((lastSetFor(rippleEllipse(container))!.vars as { opacity: number }).opacity)).toBeCloseTo(0.8 * envelope, 5);
    expect(Number((lastSetFor(haloEllipse(container))!.vars as { opacity: number }).opacity)).toBeCloseTo(0.8 * envelope, 5);

    tl.progress(1);
    expect(Number((lastSetFor(rippleEllipse(container))!.vars as { opacity: number }).opacity)).toBe(0);
    expect(Number((lastSetFor(haloEllipse(container))!.vars as { opacity: number }).opacity)).toBe(0);
  });

  it('despawn: at tl.progress(0) the ring sits at 0.95 (RIPPLE_DESPAWN_FROM)', () => {
    const { container, decorateArc } = mount(halo());
    const tl = (gsap.timeline() as unknown as FakeTimeline);
    decorateArc('despawn', 3, tl as unknown as Parameters<typeof decorateArc>[2]);
    tl.progress(0);
    const ringStop = rippleStopEls(container)[2];
    expect(lastSetFor(ringStop)!.vars).toMatchObject({ attr: { offset: '95.00%' } });
  });

  it('a 5s spawn arc runs two cycles — the ring restarts (near the hole) at progress(0.5)', () => {
    const { container, decorateArc } = mount(halo());
    const tl = (gsap.timeline() as unknown as FakeTimeline);
    decorateArc('spawn', 5, tl as unknown as Parameters<typeof decorateArc>[2]);
    tl.progress(0.5);
    const hole = HALO_HOLE / halo().ry;
    const ringStop = rippleStopEls(container)[2];
    expect(lastSetFor(ringStop)!.vars).toMatchObject({ attr: { offset: `${(hole * 100).toFixed(2)}%` } });
  });

  it('reduced motion: decorateArc is a no-op — the arc timeline gains no children', () => {
    setMatchMedia(true);
    const { decorateArc } = mount(halo());
    const tl = (gsap.timeline() as unknown as FakeTimeline);
    decorateArc('spawn', 3, tl as unknown as Parameters<typeof decorateArc>[2]);
    expect(tl.children).toHaveLength(0);
  });

  it('enabled: false or no ripple elements — decorateArc does nothing (no elements to find)', () => {
    let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
    render(<Harness haloDial={halo()} withRipple={false} onDecorateArc={(d) => { decorateArc = d; }} />);
    const tl = (gsap.timeline() as unknown as FakeTimeline);
    expect(() => decorateArc('spawn', 3, tl as unknown as Parameters<typeof decorateArc>[2])).not.toThrow();
    expect(tl.children).toHaveLength(0);
  });
});
