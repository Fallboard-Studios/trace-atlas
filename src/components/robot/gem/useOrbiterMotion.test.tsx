// ========================================
// IMPORTS
// ========================================
import { createRef } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

// ----------------------------------------
// RECORDING GSAP MOCK (overrides vitest.setup.ts's global no-op mock — same recipe
// BubbleStream.test.tsx uses, extended with module-level set/to so useOrbiterMotion's direct
// gsap.set/gsap.to calls (not just timeline-instance calls) are inspectable, and gsap.to's
// returned tween supports .progress() the way real GSAP's does, and auto-completes after its own
// duration under fake timers).
// ----------------------------------------
interface FakeTween {
  target: unknown;
  vars: Record<string, unknown>;
  _progress: number;
  progress: (p?: number) => number | FakeTween;
  kill: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
}

interface RecordedSet {
  target: unknown;
  vars: Record<string, unknown>;
}

interface FakeTimeline {
  children: Array<{ child: unknown; position?: number }>;
  setCalls: RecordedSet[];
  kill: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  set: (target: unknown, vars: Record<string, unknown>) => FakeTimeline;
  add: (child: unknown, position?: number) => FakeTimeline;
}

function applyDisplay(target: unknown, vars: Record<string, unknown>) {
  const el = target as (HTMLElement | SVGElement | null);
  if (el && 'style' in el && 'display' in vars) {
    (el as HTMLElement).style.display = vars.display === '' ? '' : String(vars.display);
  }
}

const setCalls: RecordedSet[] = [];
const toCalls: Array<{ target: unknown; vars: Record<string, unknown>; tween: FakeTween }> = [];
const createdTimelines: FakeTimeline[] = [];

function makeTween(target: unknown, vars: Record<string, unknown>): FakeTween {
  const tween: FakeTween = {
    target,
    vars,
    _progress: 0,
    progress: (p?: number) => {
      if (p === undefined) return tween._progress;
      tween._progress = p;
      if (typeof vars.onUpdate === 'function') (vars.onUpdate as () => void)();
      if (p >= 1 && typeof vars.onComplete === 'function') (vars.onComplete as () => void)();
      return tween;
    },
    kill: vi.fn(),
    pause: vi.fn(() => tween),
    play: vi.fn(() => tween),
  };
  // A finite tween also completes on its own if (fake) time elapses, so tests don't have to
  // manually drive every checkpoint.
  if (vars.repeat !== -1 && typeof vars.duration === 'number') {
    setTimeout(() => tween.progress(1), (vars.duration as number) * 1000);
  }
  return tween;
}

function makeTimeline(): FakeTimeline {
  const tl: FakeTimeline = {
    children: [],
    setCalls: [],
    kill: vi.fn(),
    play: vi.fn(() => tl),
    pause: vi.fn(() => tl),
    set: (target, vars) => {
      tl.setCalls.push({ target, vars });
      setCalls.push({ target, vars });
      applyDisplay(target, vars);
      return tl;
    },
    add: (child, position) => {
      tl.children.push({ child, position });
      return tl;
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
      applyDisplay(target, vars);
      return mocked;
    },
    to: (target: unknown, vars: Record<string, unknown>) => {
      const tween = makeTween(target, vars);
      toCalls.push({ target, vars, tween });
      return tween;
    },
    killTweensOf: () => {},
    utils: { selector: () => () => [] },
  };
  return { default: mocked, ...mocked };
});

// ========================================
// OTHER IMPORTS (after the gsap mock — vitest hoists vi.mock calls above these anyway)
// ========================================
import { useOrbiterMotion } from './useOrbiterMotion';
import { RobotGem } from './RobotGem';
import { getRobotGem } from './polygon';
import { gemPalette } from './gemPalette';
import { orbiterPlan, ATTACH_DROP, ATTACH_START_SCALE, ATTACH_DURATION } from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';

// ========================================
// FIXTURES
// ========================================
const GEM_SEED = 20261004;
const PALETTE = gemPalette(getRobotGem(GEM_SEED), '#41ad9f', 1, [1, 0.15], 20);
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function dials(overrides: Partial<OrbiterDials> = {}): OrbiterDials {
  return { count: 2, size: 1, lineWidth: 0.5, stripOpacity: 0.4, ...overrides };
}

function Harness({
  robotId = 'r1',
  context = 'world' as 'world' | 'avatar',
  gemSeed = GEM_SEED,
  enabled = true,
  dials: d = dials(),
  plan: planOverride,
}: {
  robotId?: string;
  context?: 'world' | 'avatar';
  gemSeed?: number;
  enabled?: boolean;
  dials?: OrbiterDials;
  /** Overrides the real seeded plan — used to pin a predictable attach order in tests without
   *  fighting the real seed's own corner order. */
  plan?: ReturnType<typeof orbiterPlan>;
}) {
  const ref = createRef<SVGGElement>();
  const gem = getRobotGem(gemSeed);
  const plan = planOverride ?? orbiterPlan(gemSeed);
  useOrbiterMotion({ root: ref, robotId, context, gem, plan, dials: d, enabled });
  return (
    <svg>
      <RobotGem
        ref={ref}
        gem={gem}
        palette={PALETTE}
        lightOpacity={0.7}
        scale={1}
        orbiters={{ lineWidth: d.lineWidth, stripOpacity: d.stripOpacity, size: d.size, count: d.count, cornerOrder: plan.cornerOrder, motion: true }}
        bodyLines={{ top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 }}
        halo={{ color: '#41ad9f', rx: 30, ry: 30, stops: [], opacity: 1, gradientId: `halo-${context}-${robotId}` }}
      />
    </svg>
  );
}

function copyEl(container: HTMLElement, corner: number): HTMLElement {
  const el = container.querySelector(`.gem__orbiter--${ORBITER_CORNERS[corner]}`);
  if (!el) throw new Error(`no copy for corner ${corner}`);
  return el as HTMLElement;
}

function localEl(container: HTMLElement, corner: number): HTMLElement {
  const el = copyEl(container, corner).querySelector('.gem__orbiter-local');
  if (!el) throw new Error(`no local group for corner ${corner}`);
  return el as HTMLElement;
}

function isShown(container: HTMLElement, corner: number): boolean {
  return copyEl(container, corner).style.display !== 'none';
}

function lastSetFor(target: unknown, key: string): Record<string, unknown> | undefined {
  for (let i = setCalls.length - 1; i >= 0; i--) {
    if (setCalls[i].target === target && key in setCalls[i].vars) return setCalls[i].vars;
  }
  return undefined;
}

/** The attach/detach hop targets the corner's own local group with a `y` var — distinct from the
 *  Task 11 size tween's NodeList-array target (no single element has that shape). */
function hopTweensFor(container: HTMLElement, corner: number) {
  const local = localEl(container, corner);
  return toCalls.filter((c) => c.target === local && 'y' in c.vars);
}

/** The reduced-motion stand-in: an opacity-only fade on the corner's local group, no `y`. */
function fadeTweensFor(container: HTMLElement, corner: number) {
  const local = localEl(container, corner);
  return toCalls.filter((c) => c.target === local && 'opacity' in c.vars && !('y' in c.vars));
}

function setMatchMedia(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

// ========================================
// TESTS
// ========================================
describe('useOrbiterMotion — mount state (spec §1.4, Phase 40 amendment: dock, not drift/orbit)', () => {
  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    setMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows exactly the first `count` corners (display ''), hides the other 2-3 (display 'none')", () => {
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 2 })} />);
    const shown = new Set(plan.cornerOrder.slice(0, 2));
    for (let corner = 0; corner < 4; corner++) {
      expect(isShown(container, corner)).toBe(shown.has(corner));
    }
  });

  it('a shown corner flies in: starts dropped/shrunk/transparent, ends at rest (x:0, y:0, scale:size, opacity:1)', () => {
    vi.useFakeTimers();
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 1, size: 0.9 })} />);
    const corner = plan.cornerOrder[0];
    const local = localEl(container, corner);

    const startVars = lastSetFor(local, 'opacity');
    expect(startVars).toMatchObject({ x: 0, y: ATTACH_DROP, scale: 0.9 * ATTACH_START_SCALE, opacity: 0 });

    const [hop] = hopTweensFor(container, corner);
    expect(hop.vars).toMatchObject({ y: 0, scale: 0.9, opacity: 1, ease: 'back.out(1.7)' });
    act(() => { vi.advanceTimersByTime(hop.vars.duration as number * 1000); });
    vi.useRealTimers();
  });

  it('a hidden corner is left at rest pose, scaled to `size`, with no hop tween', () => {
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 1, size: 0.75 })} />);
    const hidden = plan.cornerOrder[1];
    expect(isShown(container, hidden)).toBe(false);
    expect(hopTweensFor(container, hidden)).toHaveLength(0);
    const local = localEl(container, hidden);
    expect(lastSetFor(local, 'scale')).toMatchObject({ scale: 0.75, x: 0, y: 0 });
  });

  it('registers the timeline under orbiters-${context}-${robotId}, and removes it on unmount', () => {
    const { unmount } = render(<Harness robotId="r1" context="world" />);
    expect(timelineMap.has('orbiters-world-r1')).toBe(true);
    unmount();
    expect(timelineMap.has('orbiters-world-r1')).toBe(false);
  });

  it('mounting world and avatar for the same robot id registers two keys, neither killing the other', () => {
    render(<Harness robotId="r9" context="world" />);
    render(<Harness robotId="r9" context="avatar" />);
    expect(timelineMap.has('orbiters-world-r9')).toBe(true);
    expect(timelineMap.has('orbiters-avatar-r9')).toBe(true);
    expect(timelineMap.get('orbiters-world-r9')).not.toBe(timelineMap.get('orbiters-avatar-r9'));
  });

  it('reduced motion: shown corners fade in (opacity only, no hop), hidden corners stay display:none', () => {
    setMatchMedia(true);
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 2 })} />);
    const shown = new Set(plan.cornerOrder.slice(0, 2));
    for (let corner = 0; corner < 4; corner++) {
      expect(isShown(container, corner)).toBe(shown.has(corner));
    }
    shown.forEach((corner) => {
      expect(hopTweensFor(container, corner)).toHaveLength(0);
      expect(fadeTweensFor(container, corner)).toHaveLength(1);
    });
  });

  it('enabled: false creates nothing — no gsap.* calls, no timeline key', () => {
    render(<Harness enabled={false} robotId="r-disabled" />);
    expect(setCalls).toHaveLength(0);
    expect(toCalls).toHaveLength(0);
    expect(createdTimelines).toHaveLength(0);
    expect(timelineMap.has('orbiters-world-r-disabled')).toBe(false);
  });
});

// ========================================
// Count changes — attach/detach and the queue (spec §1.4, Phase 40 amendment of Task 10)
// ========================================
describe('useOrbiterMotion — count changes: attach/detach and the one-arc-at-a-time queue', () => {
  // cornerOrder [0, 3, 1, 2]: predictable attach/detach order for every test here, regardless of
  // what the real seed's own order happens to be.
  const customPlan = { ...orbiterPlan(GEM_SEED), cornerOrder: [0, 3, 1, 2] as [number, number, number, number] };

  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    vi.useFakeTimers();
    setMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('2 -> 3: the first unshown corner flies in and ends shown at rest', () => {
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    expect(isShown(container, 1)).toBe(false);

    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 3 })} />);
    });
    expect(isShown(container, 1)).toBe(true); // display flips immediately, the hop then animates in
    const [hop] = hopTweensFor(container, 1);
    expect(hop).toBeDefined();
    expect(hop.vars).toMatchObject({ y: 0, opacity: 1, ease: 'back.out(1.7)' }); // the hop's target pose is rest

    act(() => { vi.advanceTimersByTime((hop.vars.duration as number) * 1000); });
    expect(isShown(container, 1)).toBe(true); // settled, still shown
  });

  it('2 -> 4: the second attach starts only after the first completes', () => {
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 4 })} />);
    });
    expect(hopTweensFor(container, 1)).toHaveLength(1);
    expect(isShown(container, 2)).toBe(false); // second spawn not started yet

    const [firstHop] = hopTweensFor(container, 1);
    act(() => { vi.advanceTimersByTime((firstHop.vars.duration as number) * 1000); }); // first completes
    expect(isShown(container, 2)).toBe(true);
    expect(hopTweensFor(container, 2)).toHaveLength(1);
  });

  it('2 -> 4 -> 2 while the first attach is still in flight settles at 2, corner 1 hidden again', () => {
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 4 })} />);
    });
    expect(isShown(container, 1)).toBe(true); // attach for corner 1 in flight

    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    });
    expect(hopTweensFor(container, 2)).toHaveLength(0); // the second spawn never started

    const [firstHop] = hopTweensFor(container, 1);
    act(() => { vi.advanceTimersByTime((firstHop.vars.duration as number) * 1000); }); // the in-flight attach completes; reconcile re-evaluates
    // Target is 2, shown is now {0, 3, 1} = 3 -> detaches the last-in-order shown corner, which is 1.
    const [detachHop] = hopTweensFor(container, 1).filter((c) => c !== firstHop);
    act(() => { vi.advanceTimersByTime((detachHop.vars.duration as number) * 1000); }); // the detach completes

    expect(isShown(container, 1)).toBe(false);
    expect(isShown(container, 0)).toBe(true);
    expect(isShown(container, 3)).toBe(true);
  });

  it('3 -> 2: the last shown corner detaches (hop reversed) and ends hidden', () => {
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 3 })} />);
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); }); // let the mount's own attach hops settle first — a corner busy with its own attach can't be despawned
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    });
    expect(isShown(container, 1)).toBe(true); // still visible mid-hop
    const [hop] = hopTweensFor(container, 1).filter((c) => c.vars.ease === 'power2.in');
    expect(hop).toBeDefined();
    expect(hop.vars).toMatchObject({ y: ATTACH_DROP, opacity: 0 });

    act(() => { vi.advanceTimersByTime((hop.vars.duration as number) * 1000); });
    expect(isShown(container, 1)).toBe(false);
  });

  it('the Gate 1 loop case: 3 -> 2 then -> 4 while the detach is mid-flight settles at 4 after exactly two further hops', () => {
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 3 })} />);
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); }); // let the mount's own attach hops (0/3/1) settle first — a corner busy with its own attach can't be despawned
    toCalls.length = 0; // isolate the count-change sequence under test
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    });
    const detachHop = hopTweensFor(container, 1).find((c) => c.vars.ease === 'power2.in')!;
    expect(detachHop).toBeDefined();

    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 4 })} />);
    });
    expect(hopTweensFor(container, 1).filter((c) => c.vars.ease === 'back.out(1.7)')).toHaveLength(0); // blocked by "one hop at a time"

    act(() => { vi.advanceTimersByTime((detachHop.vars.duration as number) * 1000); }); // detach completes -> reconcile re-attaches corner 1
    const reattach = hopTweensFor(container, 1).find((c) => c.vars.ease === 'back.out(1.7)')!;
    expect(reattach).toBeDefined();

    act(() => { vi.advanceTimersByTime((reattach.vars.duration as number) * 1000); }); // that attach completes -> reconcile attaches corner 2
    const corner2Hop = hopTweensFor(container, 2)[0];
    expect(corner2Hop).toBeDefined();

    act(() => { vi.advanceTimersByTime((corner2Hop.vars.duration as number) * 1000); }); // final attach completes -> settled at 4
    [0, 1, 2, 3].forEach((c) => expect(isShown(container, c)).toBe(true));
  });

  it('reduced motion: a count change fades opacity over a short duration — no hop tween', () => {
    setMatchMedia(true);
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 3 })} />);
    });

    expect(hopTweensFor(container, 1)).toHaveLength(0);
    const fades = fadeTweensFor(container, 1);
    expect(fades.length).toBeGreaterThan(0);
    expect(fades[fades.length - 1].vars.opacity).toBe(1);
  });

  it('a count decrease never starts a detach on a corner whose own attach hop is still in flight (code review fix, 2026-10-05)', () => {
    // Mount with count 2: both initial corners (0, 3) fly in at once, ungated — both mid-attach.
    const { rerender, container } = render(<Harness plan={customPlan} dials={dials({ count: 2 })} />);
    const attachHops = [0, 3].flatMap((c) => hopTweensFor(container, c)).filter((c) => c.vars.ease === 'back.out(1.7)');
    expect(attachHops).toHaveLength(2);

    // Drop to 1 immediately — every shown corner is still busy attaching, so reconcile must defer.
    act(() => {
      rerender(<Harness plan={customPlan} dials={dials({ count: 1 })} />);
    });
    expect([0, 3].flatMap((c) => hopTweensFor(container, c)).filter((c) => c.vars.ease === 'power2.in')).toHaveLength(0);

    // Once both attach hops settle, the deferred despawn fires on the retry — exactly one detach,
    // never two tweens racing the same corner's x/y/scale/opacity.
    act(() => { vi.advanceTimersByTime(Math.max(...attachHops.map((c) => (c.vars.duration as number) * 1000))); });
    const detaches = [0, 3].flatMap((c) => hopTweensFor(container, c)).filter((c) => c.vars.ease === 'power2.in');
    expect(detaches).toHaveLength(1);
  });
});

// ========================================
// Size tween and live dial refs
// ========================================
function allLocalEls(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll('.gem__orbiter-local')] as HTMLElement[];
}

function sizeTweenCalls() {
  return toCalls.filter((c) => Array.isArray(c.target) && 'scale' in c.vars && c.vars.duration !== undefined && c.vars.ease === 'power2.out');
}

describe('useOrbiterMotion — size tween and live dial refs', () => {
  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    setMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('a size change tweens scale over 0.5s, power2.out, on every local group — shown and hidden', () => {
    const { rerender, container } = render(<Harness dials={dials({ count: 2, size: 1.0 })} />);
    const locals = allLocalEls(container);
    expect(locals).toHaveLength(4); // motion: true always renders all 4 corners, one copy each
    toCalls.length = 0; // mount itself fires attach hops — isolate the change under test

    rerender(<Harness dials={dials({ count: 2, size: 1.25 })} />);

    const calls = sizeTweenCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].vars).toMatchObject({ scale: 1.25, duration: 0.5, ease: 'power2.out' });
    expect([...(calls[0].target as HTMLElement[])].sort()).toEqual([...locals].sort());
  });

  it('registers the size tween under orbiter-size-${context}-${robotId}', () => {
    const { rerender } = render(<Harness robotId="r-size" context="avatar" dials={dials({ size: 1.0 })} />);
    rerender(<Harness robotId="r-size" context="avatar" dials={dials({ size: 0.9 })} />);
    expect(timelineMap.has('orbiter-size-avatar-r-size')).toBe(true);
  });

  it('a second size change re-targets the same key rather than stacking a second tween', () => {
    const KEY = 'orbiter-size-world-r1';
    const { rerender } = render(<Harness dials={dials({ size: 1.0 })} />);
    toCalls.length = 0; // mount itself fires attach hops — isolate the two changes under test
    rerender(<Harness dials={dials({ size: 1.1 })} />);
    const firstTween = timelineMap.get(KEY);
    rerender(<Harness dials={dials({ size: 1.2 })} />);
    const secondTween = timelineMap.get(KEY);
    expect(sizeTweenCalls()).toHaveLength(2); // two distinct gsap.to calls were made...
    expect(firstTween).not.toBe(secondTween); // ...but the key holds only the latest one
    expect(sizeTweenCalls()[1].vars.scale).toBe(1.2);
  });

  it('reduced motion: scale is set with duration 0', () => {
    setMatchMedia(true);
    const { rerender } = render(<Harness dials={dials({ size: 1.0 })} />);
    toCalls.length = 0; // mount itself fires attach fades — isolate the change under test
    rerender(<Harness dials={dials({ size: 1.3 })} />);
    const calls = sizeTweenCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].vars).toMatchObject({ scale: 1.3, duration: 0 });
  });
});
