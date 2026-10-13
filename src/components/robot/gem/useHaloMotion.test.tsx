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
import { WAVE_COUNTER_INDEX, WAVE_LINE_WIDTH, WAVE_PATH_COUNT, WAVE_TOTAL_SECONDS, waveState } from './haloWaves';

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
  withWaves = false,
  withTrail = false,
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
  /** Renders the three `path.gem__wave` elements of RobotGem's `g.gem__waves`, so `decorateArc` plays the waves. */
  withWaves?: boolean;
  /** Names the two trail gradients on the waves group, as RobotGem does, so `decorateArc` makes trail strips. */
  withTrail?: boolean;
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
        {withWaves && (
          <g className="gem__waves" data-trail-id={withTrail ? 'trail-test' : undefined} data-trail-counter-id={withTrail ? 'trail-counter-test' : undefined}>
            {Array.from({ length: WAVE_PATH_COUNT }, (_, i) => <path key={i} className="gem__wave" data-wave={i} d="" opacity={0} />)}
          </g>
        )}
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

  // RobotBody builds a brand-new `{ rx, ry, stops }` object every render, so the dial tween must key on the
  // dial's VALUES, not the object: a re-render that changes nothing used to start a 0.5 s tween each time,
  // and a robot that re-renders a few times a second then writes its halo's attributes on every frame,
  // forever — the powered-off world's frame loop (layout rework Task 29).
  it('a re-render with a fresh, equal-valued halo object (new stops array too) creates no tween and no gsap.set', () => {
    const { rerender } = render(<Harness haloDial={halo()} />);
    setCalls.length = 0;
    createdTimelines.length = 0;
    rerender(<Harness haloDial={halo()} />);
    expect(createdTimelines).toHaveLength(0);
    expect(setCalls).toHaveLength(0);
    expect([...timelineMap.keys()].some((k) => k.startsWith('halo-'))).toBe(false);
  });

  it('twenty equal-valued re-renders in a row start no tween, and leave an in-flight one alone', () => {
    const { rerender } = render(<Harness haloDial={halo()} />);
    rerender(<Harness haloDial={halo({ rx: 40, ry: 20 })} />);
    const inFlight = timelineMap.get('halo-world-r1') as unknown as FakeTimeline;
    createdTimelines.length = 0;
    for (let i = 0; i < 20; i++) rerender(<Harness haloDial={halo({ rx: 40, ry: 20 })} />);
    expect(createdTimelines).toHaveLength(0);
    expect(inFlight.kill).not.toHaveBeenCalled();
    expect(timelineMap.get('halo-world-r1')).toBe(inFlight);
  });

  it('a change to ry alone, rx alone, or one stop alone each still starts a tween', () => {
    const { rerender } = render(<Harness haloDial={halo()} />);
    for (const changed of [halo({ ry: 31 }), halo({ rx: 61 }), halo({ stops: stops(0.56) })]) {
      createdTimelines.length = 0;
      rerender(<Harness haloDial={changed} />);
      expect(createdTimelines).toHaveLength(1);
      rerender(<Harness haloDial={halo()} />); // back to the base, itself a change
    }
  });

  it('a stop with the same offset but a different opacity (or the reverse) counts as a change', () => {
    const base = stops();
    const { rerender } = render(<Harness haloDial={halo({ stops: base })} />);
    createdTimelines.length = 0;
    const opacityOnly = base.map((s, i) => (i === 2 ? { ...s, opacity: s.opacity + 0.01 } : s));
    rerender(<Harness haloDial={halo({ stops: opacityOnly })} />);
    expect(createdTimelines).toHaveLength(1);
    createdTimelines.length = 0;
    // Built from the render before it, so the offset is the only thing that differs.
    rerender(<Harness haloDial={halo({ stops: opacityOnly.map((s, i) => (i === 2 ? { ...s, offset: s.offset + 0.01 } : s)) })} />);
    expect(createdTimelines).toHaveLength(1);
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

describe('useHaloMotion.decorateArc — the triangular waves (haloWaves.ts)', () => {
  function mount(dimOpacity = 1) {
    let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
    const { container } = render(
      <Harness haloDial={halo()} dimOpacity={dimOpacity} withRipple withWaves onDecorateArc={(d) => { decorateArc = d; }} />,
    );
    return { container, decorateArc, paths: [...container.querySelectorAll<SVGPathElement>('path.gem__wave')] };
  }

  type WaveSet = { attr: { d: string; 'stroke-width': number }; opacity: number };
  /** Plays the decorator and returns the arc's timeline and the waves' own (the one it creates). */
  const arcOf = (decorateArc: ReturnType<typeof useHaloMotion>['decorateArc'], kind: 'spawn' | 'despawn') => {
    const arc = gsap.timeline() as unknown as FakeTimeline;
    const before = createdTimelines.length;
    decorateArc(kind, 1, arc as unknown as Parameters<typeof decorateArc>[2]);
    const waves = createdTimelines[before] as FakeTimeline | undefined;
    return { arc, waves: waves ?? arc };
  };

  it('runs on a timeline of its own, registered under the halo key — the arc timeline gains nothing, so its onComplete is never held back', () => {
    const { container, decorateArc } = mount();
    const { arc, waves } = arcOf(decorateArc, 'spawn');
    expect(arc.children).toHaveLength(0);
    expect(waves).not.toBe(arc);
    expect(waves.children).toHaveLength(1);
    expect(timelineMap.get('halo-waves-world-r1')).toBe(waves);
    waves.progress(0.5);
    expect(setsFor(rippleEllipse(container))).toHaveLength(0);
  });

  it('a spawn run lasts WAVE_TOTAL_SECONDS (longer than the 1 s arc); a despawn run is squeezed into the arc', () => {
    const { decorateArc } = mount();
    expect(arcOf(decorateArc, 'spawn').waves.children[0].vars.duration).toBe(WAVE_TOTAL_SECONDS);
    expect(WAVE_TOTAL_SECONDS).toBeGreaterThan(1);
    expect(arcOf(decorateArc, 'despawn').waves.children[0].vars.duration).toBe(1);
  });

  it('is killed when the robot body unmounts', () => {
    const { decorateArc } = mount();
    const { waves } = arcOf(decorateArc, 'spawn');
    cleanup();
    expect(waves.kill).toHaveBeenCalled();
    expect(timelineMap.has('halo-waves-world-r1')).toBe(false);
  });

  it('spawn: mid-arc the first wave is drawn at its own strength, the second fainter, the third not yet launched', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.3);
    const [w0, w1, w2] = paths.map((p) => lastSetFor(p)!.vars as unknown as WaveSet);
    expect(w0.attr.d).not.toBe('');
    expect(w0.opacity).toBeCloseTo(waveState('spawn', 0.3, 0).alpha, 10);
    expect(w1.opacity).toBeCloseTo(waveState('spawn', 0.3, 1).alpha, 10);
    expect(w1.opacity).toBeLessThan(w0.opacity);
    expect(w2.attr.d).toBe('');
    expect(w2.opacity).toBe(0);
  });

  describe('the trails', () => {
    const mountTrail = () => {
      let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
      const { container } = render(
        <Harness haloDial={halo()} withRipple withWaves withTrail onDecorateArc={(d) => { decorateArc = d; }} />,
      );
      return { container, decorateArc, group: container.querySelector('g.gem__waves')! };
    };
    const strips = (group: Element) => [...group.querySelectorAll('path.gem__wave-trail')] as SVGPathElement[];

    it('none at rest; six pieces per wave (two halves of a tail behind each line), behind the lines, made when the run starts', () => {
      const { decorateArc, group } = mountTrail();
      expect(strips(group)).toHaveLength(0);
      arcOf(decorateArc, 'spawn');
      expect(strips(group)).toHaveLength(6 * WAVE_PATH_COUNT);
      // behind the lines: every strip comes before the first wave line in the group
      const children = [...group.children];
      const firstLine = children.findIndex((c) => c.classList.contains('gem__wave'));
      children.slice(0, firstLine).forEach((c) => expect(c.classList.contains('gem__wave-trail')).toBe(true));
      expect(children.slice(0, firstLine)).toHaveLength(6 * WAVE_PATH_COUNT);
    });

    it('each half is filled with its own side gradient, the counter wave in the other colour', () => {
      const { decorateArc, group } = mountTrail();
      arcOf(decorateArc, 'spawn');
      const fills = strips(group).map((s) => s.getAttribute('fill'));
      // one half of each side per edge: three of each gradient per wave
      for (const side of ['right', 'left']) {
        expect(fills.filter((f) => f === `url(#trail-test-${side})`)).toHaveLength(3 * WAVE_COUNTER_INDEX);
        expect(fills.filter((f) => f === `url(#trail-counter-test-${side})`)).toHaveLength(3);
      }
    });

    it('while the waves run each strip takes its shape, matrix and the wave own opacity', () => {
      const { decorateArc, group } = mountTrail();
      const { waves } = arcOf(decorateArc, 'spawn');
      waves.progress(0.3);
      const first = strips(group)[0];
      const set = lastSetFor(first)!.vars as unknown as { attr: { d: string; transform: string }; opacity: number };
      expect(set.attr.d).toMatch(/^M/);
      expect(set.attr.transform).toMatch(/^matrix\(/);
      expect(set.opacity).toBeGreaterThan(0);
    });

    it('a wave not yet launched has no trail drawn', () => {
      const { decorateArc, group } = mountTrail();
      const { waves } = arcOf(decorateArc, 'spawn');
      waves.progress(0.3); // the third outward wave starts later
      const undrawn = strips(group).filter((s) => (lastSetFor(s)!.vars as unknown as { opacity: number }).opacity === 0);
      expect(undrawn.length).toBeGreaterThan(0);
      undrawn.forEach((s) => expect((lastSetFor(s)!.vars as unknown as { attr: { d: string } }).attr.d).toBe(''));
    });

    it('removed when the run ends, and a run cut short leaves none behind for the next', () => {
      const { decorateArc, group } = mountTrail();
      const first = arcOf(decorateArc, 'spawn');
      expect(strips(group)).toHaveLength(6 * WAVE_PATH_COUNT);
      (first.waves.children[0].vars.onComplete as () => void)();
      expect(strips(group)).toHaveLength(0);

      arcOf(decorateArc, 'spawn');
      arcOf(decorateArc, 'despawn'); // the first was never completed
      expect(strips(group)).toHaveLength(6 * WAVE_PATH_COUNT);
    });

    it('without the gradients the waves still play, as bare lines', () => {
      const { decorateArc, paths } = mount(1); // no withTrail
      const { waves } = arcOf(decorateArc, 'spawn');
      waves.progress(0.3);
      expect((lastSetFor(paths[0])!.vars as unknown as WaveSet).attr.d).not.toBe('');
    });
  });

  it('the counter wave is written like the others, from its own state, travelling the other way', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.2);
    const counter = lastSetFor(paths[WAVE_COUNTER_INDEX])!.vars as unknown as WaveSet;
    expect(counter.opacity).toBeCloseTo(waveState('spawn', 0.2, WAVE_COUNTER_INDEX).alpha, 10);
    expect(counter.opacity).toBeGreaterThan(0);
    expect(counter.attr.d).not.toBe('');
  });

  it('despawn: the same waves converge, and are gone by the end', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'despawn').waves;
    tl.progress(0.7);
    expect((lastSetFor(paths[0])!.vars as unknown as WaveSet).opacity).toBeCloseTo(waveState('spawn', 0.3, 0).alpha, 10);
    tl.progress(1);
    paths.forEach((p) => expect((lastSetFor(p)!.vars as unknown as WaveSet).opacity).toBe(0));
  });

  it('opacity follows the battery dim; the stroke width is the scene-unit width over the group scale (1 where jsdom has no getCTM)', () => {
    const { decorateArc, paths } = mount(0.5);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.3);
    const w0 = lastSetFor(paths[0])!.vars as unknown as WaveSet;
    expect(w0.opacity).toBeCloseTo(0.5 * waveState('spawn', 0.3, 0).alpha, 10);
    expect(w0.attr['stroke-width']).toBe(WAVE_LINE_WIDTH);
  });

  it('reduced motion: nothing is added to the arc', () => {
    setMatchMedia(true);
    const { decorateArc } = mount();
    const { arc, waves } = arcOf(decorateArc, 'spawn');
    expect(arc.children).toHaveLength(0);
    expect(waves).toBe(arc); // no timeline of its own was created
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
