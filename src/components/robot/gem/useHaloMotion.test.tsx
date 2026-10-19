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
// and drive the waves' per-frame maths without a real GSAP runtime.
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

import { useHaloMotion } from './useHaloMotion';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';
import { WAVE_COUNT, WAVE_COUNTER_INDEX, WAVE_LINE_WIDTH, WAVE_PATH_COUNT, WAVE_TOTAL_SECONDS, waveState, wavePath } from './haloWaves';

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

function Harness({
  robotId = 'r1',
  context = 'world' as 'world' | 'avatar',
  dimOpacity = 1,
  withWaves = false,
  withTrail = false,
  inScene = false,
  onDecorateArc,
}: {
  /** Renders the gem the way the world does (Phase 53): in its own mover svg inside a stage child, a static scene sheet beside it. */
  inScene?: boolean;
  robotId?: string;
  context?: 'world' | 'avatar';
  dimOpacity?: number;
  /** Renders the `path.gem__wave` elements of RobotGem's `g.gem__waves`, so `decorateArc` plays the waves. */
  withWaves?: boolean;
  /** Names the two trail gradients on the waves group, as RobotGem does, so `decorateArc` makes trail strips. */
  withTrail?: boolean;
  /** Receives the hook's `decorateArc` on every render — the test drives it directly. */
  onDecorateArc?: (decorateArc: ReturnType<typeof useHaloMotion>['decorateArc']) => void;
}) {
  const ref = useRef<SVGGElement>(null);
  const { decorateArc } = useHaloMotion({ root: ref, robotId, context, dimOpacity });
  onDecorateArc?.(decorateArc);
  const gem = (
    <svg className={inScene ? 'mover__svg' : undefined}>
      <g ref={ref} className="gem">
        {withWaves && (
          <g
            className="gem__waves"
            data-cx={0}
            data-cy={0}
            data-trail-id={withTrail ? 'trail-test' : undefined}
            data-trail-counter-id={withTrail ? 'trail-counter-test' : undefined}
          >
            {Array.from({ length: WAVE_PATH_COUNT }, (_, i) => <path key={i} className="gem__wave" data-wave={i} d="" opacity={0} />)}
          </g>
        )}
      </g>
    </svg>
  );
  if (!inScene) return gem;
  return (
    <div className="ocean-scene">
      <div className="ocean-scene__stage">
        <svg className="ocean-scene__sheet" data-scene-slot="back" />
        <div className="mover mover--robot">{gem}</div>
      </div>
    </div>
  );
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

describe('useHaloMotion — no mount state and no dial tween (the gradient halo was removed 2026-10-12)', () => {
  it('mounting and re-rendering make no gsap call and register no timeline key', () => {
    const { rerender } = render(<Harness withWaves />);
    rerender(<Harness withWaves dimOpacity={0.4} />);
    expect(setCalls).toHaveLength(0);
    expect(createdTimelines).toHaveLength(0);
    expect(timelineMap.size).toBe(0);
  });

  it('world and avatar for the same robot id run under separate keys', () => {
    let world!: ReturnType<typeof useHaloMotion>['decorateArc'];
    let avatar!: ReturnType<typeof useHaloMotion>['decorateArc'];
    render(<Harness robotId="r1" context="world" withWaves onDecorateArc={(d) => { world = d; }} />);
    render(<Harness robotId="r1" context="avatar" withWaves onDecorateArc={(d) => { avatar = d; }} />);
    // Both Harnesses render into the same document: each decorates the first `.gem` it was handed, so play
    // each against its own root by mounting the arc through its own decorator.
    world('spawn', 1, gsap.timeline() as unknown as Parameters<typeof world>[2]);
    avatar('spawn', 1, gsap.timeline() as unknown as Parameters<typeof avatar>[2]);
    expect(timelineMap.has('halo-waves-world-r1')).toBe(true);
    expect(timelineMap.has('halo-waves-avatar-r1')).toBe(true);
  });
});

describe('useHaloMotion.decorateArc — the triangular waves (haloWaves.ts, haloWavesMotion.ts)', () => {
  function mount(dimOpacity = 1) {
    let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
    const { container } = render(
      <Harness dimOpacity={dimOpacity} withWaves onDecorateArc={(d) => { decorateArc = d; }} />,
    );
    return { container, decorateArc, paths: [...container.querySelectorAll<SVGPathElement>('path.gem__wave')] };
  }

  /** The waves write plain attributes, not `gsap.set`: read them back off the element. */
  const d = (el: Element) => el.getAttribute('d');
  const opacityOf = (el: Element) => Number(el.getAttribute('opacity'));

  /** Plays the decorator and returns the arc's timeline and the waves' own (the one it creates). */
  const arcOf = (decorateArc: ReturnType<typeof useHaloMotion>['decorateArc'], kind: 'spawn' | 'despawn') => {
    const arc = gsap.timeline() as unknown as FakeTimeline;
    const before = createdTimelines.length;
    decorateArc(kind, 1, arc as unknown as Parameters<typeof decorateArc>[2]);
    const waves = createdTimelines[before] as FakeTimeline | undefined;
    return { arc, waves: waves ?? arc };
  };

  it('runs on a timeline of its own, registered under the halo key — the arc timeline gains nothing, so its onComplete is never held back', () => {
    const { decorateArc } = mount();
    const { arc, waves } = arcOf(decorateArc, 'spawn');
    expect(arc.children).toHaveLength(0);
    expect(waves).not.toBe(arc);
    expect(waves.children).toHaveLength(1);
    expect(timelineMap.get('halo-waves-world-r1')).toBe(waves);
  });

  it('writes attributes directly: a run makes no gsap.set call', () => {
    const { decorateArc } = mount();
    const { waves } = arcOf(decorateArc, 'spawn');
    const before = setCalls.length;
    waves.progress(0.5);
    expect(setCalls).toHaveLength(before);
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
    const [w0, w1, w2] = paths;
    expect(d(w0)).not.toBe('');
    expect(opacityOf(w0)).toBeCloseTo(waveState('spawn', 0.3, 0).alpha, 10);
    expect(opacityOf(w1)).toBeCloseTo(waveState('spawn', 0.3, 1).alpha, 10);
    expect(opacityOf(w1)).toBeLessThan(opacityOf(w0));
    expect(d(w2)).toBe('');
    expect(opacityOf(w2)).toBe(0);
  });

  it('writes only what changed: a wave that is not yet launched is not rewritten from one frame to the next', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.3);
    const idle = paths[WAVE_COUNT - 1]; // launches at u ≈ 0.5
    const writes = vi.spyOn(idle, 'setAttribute');
    tl.progress(0.31);
    expect(writes).not.toHaveBeenCalled();
    // a launched wave is rewritten
    const moving = vi.spyOn(paths[0], 'setAttribute');
    tl.progress(0.32);
    expect(moving).toHaveBeenCalled();
  });

  describe('the trails', () => {
    const mountTrail = () => {
      let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
      const { container } = render(
        <Harness withWaves withTrail onDecorateArc={(dec) => { decorateArc = dec; }} />,
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
      const drawn = strips(group).filter((s) => opacityOf(s) > 0);
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((s) => {
        expect(d(s)).toMatch(/^M/);
        expect(s.getAttribute('transform')).toMatch(/^matrix\(/);
      });
    });

    it('a wave not yet launched has no trail drawn', () => {
      const { decorateArc, group } = mountTrail();
      const { waves } = arcOf(decorateArc, 'spawn');
      waves.progress(0.3); // the third outward wave starts later
      const undrawn = strips(group).filter((s) => opacityOf(s) === 0);
      expect(undrawn.length).toBeGreaterThan(0);
      undrawn.forEach((s) => expect(d(s)).toBe(''));
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
      expect(d(paths[0])).not.toBe('');
    });
  });

  it('the counter wave is written like the others, from its own state, travelling the other way', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.2);
    const counter = paths[WAVE_COUNTER_INDEX];
    expect(opacityOf(counter)).toBeCloseTo(waveState('spawn', 0.2, WAVE_COUNTER_INDEX).alpha, 10);
    expect(opacityOf(counter)).toBeGreaterThan(0);
    expect(d(counter)).not.toBe('');
  });

  it('despawn: the same waves converge, and are gone by the end', () => {
    const { decorateArc, paths } = mount(1);
    const tl = arcOf(decorateArc, 'despawn').waves;
    tl.progress(0.7);
    expect(opacityOf(paths[0])).toBeCloseTo(waveState('spawn', 0.3, 0).alpha, 10);
    tl.progress(1);
    paths.forEach((p) => expect(opacityOf(p)).toBe(0));
  });

  it('the run ends with nothing drawn: onComplete empties every line', () => {
    const { decorateArc, paths } = mount(1);
    const { waves } = arcOf(decorateArc, 'spawn');
    waves.progress(0.3);
    (waves.children[0].vars.onComplete as () => void)();
    paths.forEach((p) => {
      expect(d(p)).toBe('');
      expect(opacityOf(p)).toBe(0);
    });
  });

  it('opacity follows the battery dim; the stroke width is the scene-unit width over the group scale (1 where jsdom has no getCTM)', () => {
    const { decorateArc, paths } = mount(0.5);
    const tl = arcOf(decorateArc, 'spawn').waves;
    tl.progress(0.3);
    expect(opacityOf(paths[0])).toBeCloseTo(0.5 * waveState('spawn', 0.3, 0).alpha, 10);
    expect(Number(paths[0].getAttribute('stroke-width'))).toBe(WAVE_LINE_WIDTH);
  });

  describe('in the world (Phase 53: each robot is a mover of its own, so the gem\'s own svg is not the scene)', () => {
    type M = { a: number; b: number; c: number; d: number; e: number; f: number };
    const matrix = (a: number, e: number, f = 0): M => ({ a, b: 0, c: 0, d: a, e, f });
    const stub = (el: Element, name: 'getCTM' | 'getScreenCTM', read: () => M) => {
      (el as unknown as Record<string, () => M>)[name] = read;
    };

    /** A world with the stage at `stage` on the screen and the robot's wrapper `robotX` scene units along (scale `robotScale`);
     *  `getCTM` answers as the browser does, with the mover svg as its viewport (so the wrapper is not in it). */
    function mountInScene(stage: M, robot: { x: number; scale: number }) {
      let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
      const { container } = render(<Harness inScene withWaves onDecorateArc={(dec) => { decorateArc = dec; }} />);
      const group = container.querySelector('g.gem')!;
      stub(container.querySelector('svg.ocean-scene__sheet')!, 'getScreenCTM', () => stage);
      stub(group, 'getCTM', () => matrix(1, 0));
      stub(group, 'getScreenCTM', () => matrix(stage.a * robot.scale, stage.a * robot.x + stage.e, stage.f));
      return { decorateArc, paths: [...container.querySelectorAll<SVGPathElement>('path.gem__wave')], robot };
    }

    it('the waves stay where the arc began when the robot\'s wrapper swims on (they follow the station, not the robot)', () => {
      const m = mountInScene(matrix(0.5, 10, 20), { x: 100, scale: 1 });
      const tl = (() => {
        const arc = gsap.timeline() as unknown as FakeTimeline;
        const before = createdTimelines.length;
        m.decorateArc('spawn', 1, arc as unknown as Parameters<typeof m.decorateArc>[2]);
        return createdTimelines[before];
      })();
      tl.progress(0.1);
      m.robot.x = 300; // the swim moved the wrapper 200 scene units right
      tl.progress(0.3);
      // Still centred on the point the first frame found: 200 units to the robot's left, in the robot's own units.
      expect(d(m.paths[0])).toBe(wavePath(waveState('spawn', 0.3, 0), -200, 0, 1));
    });

    it('sizes the lines in scene units, with the stage\'s scale taken out of the group\'s', () => {
      const m = mountInScene(matrix(0.5, 10, 20), { x: 100, scale: 2 });
      const arc = gsap.timeline() as unknown as FakeTimeline;
      const before = createdTimelines.length;
      m.decorateArc('spawn', 1, arc as unknown as Parameters<typeof m.decorateArc>[2]);
      createdTimelines[before].progress(0.3);
      expect(Number(m.paths[0].getAttribute('stroke-width'))).toBe(WAVE_LINE_WIDTH / 2);
    });

    // The sheet is a static stage child, so it is found once when the arc's timeline is made; the two
    // screen matrices (the deck camera's scroll changes the frame) are still read on every frame.
    describe('finding the scene', () => {
      const FRAMES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
      const asked = (spy: { mock: { calls: unknown[][] } }, needle: string) =>
        spy.mock.calls.filter(([selector]) => String(selector).includes(needle)).length;

      /** Plays one arc over ten frames, and returns the timeline once the spies are set. */
      function playTenFrames(m: ReturnType<typeof mountInScene>) {
        const arc = gsap.timeline() as unknown as FakeTimeline;
        const before = createdTimelines.length;
        m.decorateArc('spawn', 1, arc as unknown as Parameters<typeof m.decorateArc>[2]);
        const tl = createdTimelines[before];
        FRAMES.forEach((p) => tl.progress(p));
      }

      it('looks the scene and its sheet up at most once across ten frames of one arc', () => {
        const m = mountInScene(matrix(0.5, 10, 20), { x: 100, scale: 1 });
        const closestSpy = vi.spyOn(Element.prototype, 'closest');
        const queryOneSpy = vi.spyOn(Element.prototype, 'querySelector');
        try {
          playTenFrames(m);
          expect(asked(closestSpy, 'ocean-scene')).toBeLessThanOrEqual(1);
          expect(asked(queryOneSpy, 'ocean-scene__sheet')).toBeLessThanOrEqual(1);
        } finally {
          closestSpy.mockRestore();
          queryOneSpy.mockRestore();
        }
      });

      it('still reads the sheet\'s and the group\'s screen matrices on every frame', () => {
        const m = mountInScene(matrix(0.5, 10, 20), { x: 100, scale: 1 });
        const sheetSpy = vi.spyOn(document.querySelector('svg.ocean-scene__sheet') as SVGGraphicsElement, 'getScreenCTM');
        const groupSpy = vi.spyOn(document.querySelector('g.gem') as SVGGraphicsElement, 'getScreenCTM');
        playTenFrames(m);
        expect(sheetSpy.mock.calls.length).toBeGreaterThanOrEqual(FRAMES.length);
        expect(groupSpy.mock.calls.length).toBeGreaterThanOrEqual(FRAMES.length);
      });
    });
  });

  it('an avatar or card has no scene: it keeps getCTM, and looks for a scene once, not every frame', () => {
    const { container, decorateArc, paths } = mount();
    const group = container.querySelector('g.gem') as unknown as Record<string, unknown>;
    group.getCTM = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    const closestSpy = vi.spyOn(Element.prototype, 'closest');
    try {
      const tl = arcOf(decorateArc, 'spawn').waves;
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((p) => tl.progress(p));
      expect(Number(paths[0].getAttribute('stroke-width'))).toBe(WAVE_LINE_WIDTH / 2);
      expect(closestSpy.mock.calls.filter(([selector]) => String(selector).includes('ocean-scene')).length).toBeLessThanOrEqual(1);
    } finally {
      closestSpy.mockRestore();
    }
  });

  it('reduced motion: nothing is added to the arc', () => {
    setMatchMedia(true);
    const { decorateArc } = mount();
    const { arc, waves } = arcOf(decorateArc, 'spawn');
    expect(arc.children).toHaveLength(0);
    expect(waves).toBe(arc); // no timeline of its own was created
  });

  it('no wave elements to draw: decorateArc does nothing', () => {
    let decorateArc!: ReturnType<typeof useHaloMotion>['decorateArc'];
    render(<Harness onDecorateArc={(dec) => { decorateArc = dec; }} />);
    const { arc, waves } = arcOf(decorateArc, 'spawn');
    expect(arc.children).toHaveLength(0);
    expect(waves).toBe(arc);
    expect(timelineMap.has('halo-waves-world-r1')).toBe(false);
  });
});
