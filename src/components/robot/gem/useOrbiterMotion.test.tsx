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
import {
  getOrbiterWork,
  clearRobotMotionRegistry,
  markLayerSwitching,
  clearLayerSwitching,
} from '../../../animation/robotMotionRegistry';

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

// ========================================
// No halo decoration — the density-driven hop no longer decorates its arcs (Crawford, 2026-10-06:
// the halo's ripple is reserved for the future job-detach animation instead; `decorateArc` and the
// `ArcDecorator` type are gone from this hook's own options, see useHaloMotion.ts/RobotBody.tsx)
// ========================================
describe('useOrbiterMotion — no halo decoration (amendment, 2026-10-06)', () => {
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

  it('a count-increase spawn hop and a count-decrease despawn hop both play normally with nothing to decorate them', () => {
    vi.useFakeTimers();
    const plan = orbiterPlan(GEM_SEED);
    const { container, rerender } = render(<Harness dials={dials({ count: 1 })} plan={plan} />);
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); });
    const corner = plan.cornerOrder[0];
    expect(isShown(container, corner)).toBe(true);

    rerender(<Harness dials={dials({ count: 2 })} plan={plan} />);
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); });
    const nextCorner = plan.cornerOrder[1];
    expect(isShown(container, nextCorner)).toBe(true);

    rerender(<Harness dials={dials({ count: 1 })} plan={plan} />);
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); });
    expect(isShown(container, nextCorner)).toBe(false);
    vi.useRealTimers();
  });
});

// ========================================
// The work lock (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.8, Phase 43 Task 17) — the work loop
// locks a robot's orbiters for a job, and the count catches up in one pass on unlock.
// ========================================
describe('useOrbiterMotion — the work lock (Phase 43, Task 17)', () => {
  const customPlan = { ...orbiterPlan(GEM_SEED), cornerOrder: [0, 3, 1, 2] as [number, number, number, number] };

  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    clearRobotMotionRegistry();
    vi.useFakeTimers();
    setMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function settle() {
    act(() => { vi.advanceTimersByTime(ATTACH_DURATION * 1000); });
  }

  function attachHops(container: HTMLElement) {
    return [0, 1, 2, 3].flatMap((c) => hopTweensFor(container, c)).filter((c) => c.vars.ease === 'back.out(1.7)');
  }

  function allHops(container: HTMLElement) {
    return [0, 1, 2, 3].flatMap((c) => hopTweensFor(container, c));
  }

  it('world context registers { lock, unlock } under the robot id', () => {
    render(<Harness robotId="r-work" context="world" />);
    const control = getOrbiterWork('r-work');
    expect(control).toBeDefined();
    expect(typeof control!.lock).toBe('function');
    expect(typeof control!.unlock).toBe('function');
  });

  it('avatar context never registers', () => {
    render(<Harness robotId="r-avatar" context="avatar" />);
    expect(getOrbiterWork('r-avatar')).toBeUndefined();
  });

  it('a disabled (card) hook never registers', () => {
    render(<Harness robotId="r-card" context="world" enabled={false} />);
    expect(getOrbiterWork('r-card')).toBeUndefined();
  });

  it('a world and an avatar mount of the same robot: only the world one is registered, and unmounting the avatar keeps it', () => {
    const world = render(<Harness robotId="r-both" context="world" />);
    const control = getOrbiterWork('r-both');
    const avatar = render(<Harness robotId="r-both" context="avatar" />);
    avatar.unmount();
    expect(getOrbiterWork('r-both')).toBe(control);
    world.unmount();
    expect(getOrbiterWork('r-both')).toBeUndefined();
  });

  it('unmount deregisters', () => {
    const { unmount } = render(<Harness robotId="r-gone" context="world" />);
    expect(getOrbiterWork('r-gone')).toBeDefined();
    unmount();
    expect(getOrbiterWork('r-gone')).toBeUndefined();
  });

  it('a re-render (size edit) keeps the same registered control', () => {
    const { rerender } = render(<Harness robotId="r-same" plan={customPlan} dials={dials({ size: 1 })} />);
    const control = getOrbiterWork('r-same');
    rerender(<Harness robotId="r-same" plan={customPlan} dials={dials({ size: 1.2 })} />);
    expect(getOrbiterWork('r-same')).toBe(control);
  });

  it('lock returns the shown orbiters’ local groups in cornerOrder, and only those', () => {
    const { container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 3 })} />);
    settle();
    const groups = getOrbiterWork('r1')!.lock();
    expect(groups).toEqual([localEl(container, 0), localEl(container, 3), localEl(container, 1)]);
  });

  it('lock with count 1 returns one group; with count 4, all four in cornerOrder', () => {
    const one = render(<Harness robotId="r-one" plan={customPlan} dials={dials({ count: 1 })} />);
    settle();
    expect(getOrbiterWork('r-one')!.lock()).toEqual([localEl(one.container, 0)]);
    const four = render(<Harness robotId="r-four" plan={customPlan} dials={dials({ count: 4 })} />);
    settle();
    expect(getOrbiterWork('r-four')!.lock()).toEqual([0, 3, 1, 2].map((c) => localEl(four.container, c)));
  });

  it('while locked, count changes 2 → 4 → 1 → 3 queue no hops', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    getOrbiterWork('r1')!.lock();
    toCalls.length = 0;
    for (const count of [4, 1, 3] as const) {
      act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count })} />); });
      settle();
    }
    expect(allHops(container)).toHaveLength(0);
    expect(isShown(container, 1)).toBe(false); // the shown set did not move
    expect(isShown(container, 0)).toBe(true);
    expect(isShown(container, 3)).toBe(true);
  });

  it('on unlock exactly the hops from the shown count to 3 play — one attach, not a replay of 4 → 1 → 3', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    control.lock();
    for (const count of [4, 1, 3] as const) {
      act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count })} />); });
    }
    toCalls.length = 0;
    act(() => { control.unlock(); });
    settle();
    settle(); // a second hop, if one were (wrongly) queued, would land here
    expect(allHops(container)).toHaveLength(1);
    expect(attachHops(container)).toHaveLength(1);
    expect(hopTweensFor(container, 1)).toHaveLength(1); // the next corner in order
    [0, 3, 1].forEach((c) => expect(isShown(container, c)).toBe(true));
    expect(isShown(container, 2)).toBe(false);
  });

  it('on unlock a count that ended where it started plays no hop at all', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    control.lock();
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 4 })} />); });
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />); });
    toCalls.length = 0;
    act(() => { control.unlock(); });
    settle();
    expect(allHops(container)).toHaveLength(0);
  });

  it('on unlock to a lower count the catch-up detaches, one hop at a time, from the end of cornerOrder', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 4 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    control.lock();
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />); });
    toCalls.length = 0;
    act(() => { control.unlock(); });
    expect(hopTweensFor(container, 2)).toHaveLength(1);
    expect(hopTweensFor(container, 1)).toHaveLength(0); // queued behind the first
    settle();
    expect(hopTweensFor(container, 1)).toHaveLength(1);
    settle();
    expect(isShown(container, 2)).toBe(false);
    expect(isShown(container, 1)).toBe(false);
    expect(allHops(container)).toHaveLength(2);
  });

  it('lock during the mount attach finishes the hops: the groups come back at rest and the hops never restart', () => {
    const { container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    const inFlight = attachHops(container);
    expect(inFlight).toHaveLength(2);
    const groups = getOrbiterWork('r1')!.lock();
    expect(groups).toEqual([localEl(container, 0), localEl(container, 3)]);
    inFlight.forEach((hop) => expect(hop.tween._progress).toBe(1));
    toCalls.length = 0;
    settle();
    expect(allHops(container)).toHaveLength(0);
  });

  it('lock during a detach finishes it: the departing corner is hidden and not returned', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 3 })} />);
    settle();
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />); });
    const detach = hopTweensFor(container, 1).find((c) => c.vars.ease === 'power2.in')!;
    expect(detach).toBeDefined();
    let groups: SVGGElement[] = [];
    act(() => { groups = getOrbiterWork('r1')!.lock(); });
    expect(detach.tween._progress).toBe(1);
    expect(isShown(container, 1)).toBe(false);
    expect(groups).toEqual([localEl(container, 0), localEl(container, 3)]);
  });

  it('lock during a queued count increase stops the queue after the in-flight hop', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 4 })} />); });
    expect(hopTweensFor(container, 1)).toHaveLength(1); // corner 1 in flight, corner 2 queued
    let groups: SVGGElement[] = [];
    act(() => { groups = getOrbiterWork('r1')!.lock(); });
    expect(groups).toEqual([0, 3, 1].map((c) => localEl(container, c)));
    settle();
    expect(hopTweensFor(container, 2)).toHaveLength(0);
    expect(isShown(container, 2)).toBe(false);
  });

  it('unlock without a lock is a no-op; a second unlock plays nothing more', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    toCalls.length = 0;
    act(() => { control.unlock(); });
    expect(allHops(container)).toHaveLength(0);
    control.lock();
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 3 })} />); });
    act(() => { control.unlock(); });
    act(() => { control.unlock(); });
    settle();
    expect(allHops(container)).toHaveLength(1);
  });

  it('lock twice returns the same groups and needs one unlock', () => {
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    const first = control.lock();
    expect(control.lock()).toEqual(first);
    act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 3 })} />); });
    toCalls.length = 0;
    act(() => { control.unlock(); });
    expect(attachHops(container)).toHaveLength(1);
  });

  it('a control kept after unmount is inert — lock returns [] and unlock plays nothing', () => {
    const { unmount } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    settle();
    const control = getOrbiterWork('r1')!;
    unmount();
    toCalls.length = 0;
    expect(control.lock()).toEqual([]);
    act(() => { control.unlock(); });
    expect(toCalls).toHaveLength(0);
  });

  it('reduced motion: lock finishes the in-flight fades and unlock catches up with one fade', () => {
    setMatchMedia(true);
    const { rerender, container } = render(<Harness robotId="r1" plan={customPlan} dials={dials({ count: 2 })} />);
    const control = getOrbiterWork('r1')!;
    expect(control.lock()).toEqual([localEl(container, 0), localEl(container, 3)]);
    for (const count of [4, 1, 3] as const) {
      act(() => { rerender(<Harness robotId="r1" plan={customPlan} dials={dials({ count })} />); });
    }
    toCalls.length = 0;
    act(() => { control.unlock(); });
    settle();
    expect([0, 1, 2, 3].flatMap((c) => fadeTweensFor(container, c))).toHaveLength(1);
    expect(fadeTweensFor(container, 1)).toHaveLength(1);
  });
});

// Phase 43 Task 34 (spec §1.10 "Re-mount without a flourish"): a layer switch re-mounts the robot
// in the other robot row mid-leg. Its orbiters were already docked in the old row, so the new
// mount shows them docked at once — no initial attach hop — and is otherwise an ordinary mount.
describe('useOrbiterMotion — a layer-switch re-mount (Phase 43 Task 34)', () => {
  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    clearRobotMotionRegistry();
    vi.useFakeTimers();
    setMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const allHops = (container: HTMLElement) => [0, 1, 2, 3].flatMap((c) => hopTweensFor(container, c));
  const allFades = (container: HTMLElement) => [0, 1, 2, 3].flatMap((c) => fadeTweensFor(container, c));

  it('a marked world mount plays no attach hop: the shown corners are docked at rest at once, the others hidden', () => {
    markLayerSwitching('r1');
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 3, size: 0.8 })} />);
    expect(allHops(container)).toEqual([]);
    const shown = new Set(plan.cornerOrder.slice(0, 3));
    for (let corner = 0; corner < 4; corner++) {
      expect(isShown(container, corner)).toBe(shown.has(corner));
      if (!shown.has(corner)) continue;
      expect(lastSetFor(localEl(container, corner), 'opacity')).toMatchObject({ x: 0, y: 0, scale: 0.8, opacity: 1 });
    }
  });

  it('reduced motion: no fade-in either', () => {
    setMatchMedia(true);
    markLayerSwitching('r1');
    const { container } = render(<Harness dials={dials({ count: 2 })} />);
    expect(allFades(container)).toEqual([]);
    expect(allHops(container)).toEqual([]);
  });

  it('only the marked robot skips it: another robot mounting beside it attaches as usual', () => {
    markLayerSwitching('r2');
    const { container } = render(<Harness robotId="r1" dials={dials({ count: 2 })} />);
    expect(allHops(container).filter((h) => h.vars.ease === 'back.out(1.7)')).toHaveLength(2);
  });

  it('an avatar mount of a marked robot attaches as usual — the mark is the world row\'s', () => {
    markLayerSwitching('r1');
    const { container } = render(<Harness context="avatar" dials={dials({ count: 2 })} />);
    expect(allHops(container).filter((h) => h.vars.ease === 'back.out(1.7)')).toHaveLength(2);
  });

  it('it still registers its work lock, and the queue still runs a later count change', () => {
    markLayerSwitching('r1');
    const { container, rerender } = render(<Harness dials={dials({ count: 2 })} />);
    expect(getOrbiterWork('r1')).toBeDefined();
    clearLayerSwitching('r1'); // the loop clears it once the mount is handed back
    rerender(<Harness dials={dials({ count: 3 })} />);
    expect(allHops(container).filter((h) => h.vars.ease === 'back.out(1.7)')).toHaveLength(1);
    expect(getOrbiterWork('r1')!.lock()).toHaveLength(3); // the hop finishes; the lock returns all three
  });
});
