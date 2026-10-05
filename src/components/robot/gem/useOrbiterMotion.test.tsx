// ========================================
// IMPORTS
// ========================================
import { createRef } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

// ----------------------------------------
// RECORDING GSAP MOCK (overrides vitest.setup.ts's global no-op mock — same recipe
// BubbleStream.test.tsx uses, extended with module-level set/to/fromTo so useOrbiterMotion's
// direct gsap.set/gsap.to calls (not just timeline-instance calls) are inspectable, and gsap.to's
// returned tween supports .progress() the way real GSAP's does).
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

/** Option keys that aren't animated numeric properties. */
const RESERVED_TWEEN_KEYS = new Set(['duration', 'ease', 'repeat', 'yoyo', 'onUpdate', 'onComplete', 'delay']);

/**
 * A plain-object target (e.g. the Task 9 orbit proxy `{ t: 0 }`) gets its numeric vars linearly
 * interpolated from their value-at-creation when `.progress(p)` is called, and fires
 * onUpdate/onComplete — close enough to real GSAP for tests that drive specific checkpoints
 * directly, without needing a real ticker. A DOM-element target (drift/display tweens) is left
 * alone: no test here reads a mutated style back off the element for those.
 */
function makeTween(target: unknown, vars: Record<string, unknown>): FakeTween {
  const isPlainProxy = typeof target === 'object' && target !== null && !('style' in (target as object));
  const fromSnapshot: Record<string, number> = {};
  if (isPlainProxy) {
    for (const k of Object.keys(vars)) {
      if (RESERVED_TWEEN_KEYS.has(k)) continue;
      const v = vars[k];
      if (typeof v === 'number') fromSnapshot[k] = ((target as Record<string, unknown>)[k] as number) ?? 0;
    }
  }
  const tween: FakeTween = {
    target,
    vars,
    _progress: 0,
    progress: (p?: number) => {
      if (p === undefined) return tween._progress;
      tween._progress = p;
      if (isPlainProxy) {
        for (const k of Object.keys(fromSnapshot)) {
          const to = vars[k] as number;
          (target as Record<string, unknown>)[k] = fromSnapshot[k] + (to - fromSnapshot[k]) * p;
        }
      }
      if (typeof vars.onUpdate === 'function') (vars.onUpdate as () => void)();
      if (p >= 1 && typeof vars.onComplete === 'function') (vars.onComplete as () => void)();
      return tween;
    },
    kill: vi.fn(),
    pause: vi.fn(() => tween),
    play: vi.fn(() => tween),
  };
  // A finite (non-repeating) tween also completes on its own if real/fake time elapses, so
  // timing-chain tests (successive orbit gaps) work without every checkpoint being manually driven.
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
    fromTo: (target: unknown, fromVars: Record<string, unknown>, toVars: Record<string, unknown>) => {
      const tween = makeTween(target, { ...fromVars, ...toVars });
      toCalls.push({ target, vars: { ...fromVars, ...toVars }, tween });
      return tween;
    },
    killTweensOf: () => {},
    // Real setTimeout, driven by the test file's fake timers (Task 9) — delayedCall's whole
    // purpose here is wait-then-draw scheduling, which needs to actually elapse under test control.
    delayedCall: (seconds: number, fn: () => void) => {
      const id = setTimeout(fn, seconds * 1000);
      return { kill: () => clearTimeout(id) };
    },
    utils: { selector: () => () => [] },
  };
  return { default: mocked, ...mocked };
});

// ----------------------------------------
// CONTROLLABLE nextOrbit (Task 9) — real orbiterMotion.ts otherwise untouched (ORBIT_PAIRS,
// ringPose, orbiterPlan, partnerOf stay real); queued draws give pairing/timing tests an exact,
// predictable dir/open/wait instead of fighting the real seeded Rng, while tests that don't queue
// anything fall back to the real nextOrbit (still realistic for generic timing checks).
// ----------------------------------------
let nextOrbitQueue: Array<{ dir: 1 | -1; open: number; wait: number }> = [];
vi.mock('./orbiterMotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./orbiterMotion')>();
  return {
    ...actual,
    nextOrbit: (R: Parameters<typeof actual.nextOrbit>[0], dials: Parameters<typeof actual.nextOrbit>[1]) =>
      nextOrbitQueue.shift() ?? actual.nextOrbit(R, dials),
  };
});

// ========================================
// OTHER IMPORTS (after the gsap mock — vitest hoists vi.mock calls above these anyway)
// ========================================
import { useOrbiterMotion } from './useOrbiterMotion';
import { RobotGem } from './RobotGem';
import { getRobotGem } from './polygon';
import { gemPalette } from './gemPalette';
import { orbiterPlan, ORBIT_PAIRS, partnerOf } from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';
import { useLocaleStore } from '../../../stores/localeStore';

// ========================================
// FIXTURES
// ========================================
const GEM_SEED = 20261004;
const PALETTE = gemPalette(getRobotGem(GEM_SEED), '#41ad9f', 1, [1, 0.15], 20);
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

function dials(overrides: Partial<OrbiterDials> = {}): OrbiterDials {
  return { count: 2, size: 1, lineWidth: 0.5, stripOpacity: 0.4, orbitGap: 17, orbitDuration: 5, ...overrides };
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
  /** Overrides the real seeded plan — used to isolate a single pair's scheduler in tests
   *  without fighting the real seed's own corner order (it may not put a full pair first). */
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
      />
    </svg>
  );
}

function copyEl(container: HTMLElement, corner: number, depth: 'behind' | 'rest' | 'front'): HTMLElement {
  const el = container.querySelector(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="${depth}"]`);
  if (!el) throw new Error(`no ${depth} copy for corner ${corner}`);
  return el as HTMLElement;
}

function localEl(container: HTMLElement, corner: number, depth: 'behind' | 'rest' | 'front'): HTMLElement {
  const el = copyEl(container, corner, depth).querySelector('.gem__orbiter-local');
  if (!el) throw new Error(`no local group for corner ${corner}/${depth}`);
  return el as HTMLElement;
}

function lastSetFor(target: unknown, key: string): Record<string, unknown> | undefined {
  for (let i = setCalls.length - 1; i >= 0; i--) {
    if (setCalls[i].target === target && key in setCalls[i].vars) return setCalls[i].vars;
  }
  return undefined;
}

// ========================================
// TESTS
// ========================================
describe('useOrbiterMotion — mount state, drift, reduced motion (spec §1.4, Task 8)', () => {
  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    killAllTimelines();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows exactly the first `count` corners\' rest copies (display \'\'), hides the other 10 (display \'none\')', () => {
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 2 })} />);
    const shown = new Set(plan.cornerOrder.slice(0, 2));
    for (let corner = 0; corner < 4; corner++) {
      for (const depth of ['behind', 'rest', 'front'] as const) {
        const el = copyEl(container, corner, depth);
        const expectShown = depth === 'rest' && shown.has(corner);
        expect(el.style.display).toBe(expectShown ? '' : 'none');
      }
    }
  });

  it('scales every local group to `size` at mount, including hidden copies', () => {
    const { container } = render(<Harness dials={dials({ size: 0.85 })} />);
    for (let corner = 0; corner < 4; corner++) {
      for (const depth of ['behind', 'rest', 'front'] as const) {
        const el = localEl(container, corner, depth);
        const vars = lastSetFor(el, 'scale');
        expect(vars?.scale).toBe(0.85);
      }
    }
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

  it('creates two repeating yoyo drift tweens per shown corner (x and y), none for hidden corners', () => {
    const plan = orbiterPlan(GEM_SEED);
    render(<Harness dials={dials({ count: 2 })} />);
    const shown = plan.cornerOrder.slice(0, 2);
    const hidden = plan.cornerOrder.slice(2);

    shown.forEach((corner) => {
      const local = toCalls.filter((c) => {
        const el = c.target as HTMLElement;
        return el?.closest && el.closest(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="rest"]`) !== null;
      });
      expect(local).toHaveLength(2); // x and y
      local.forEach((c) => {
        expect(c.vars.repeat).toBe(-1);
        expect(c.vars.yoyo).toBe(true);
        expect(c.vars.ease).toBe('sine.inOut');
      });
    });

    hidden.forEach((corner) => {
      const local = toCalls.filter((c) => {
        const el = c.target as HTMLElement;
        return el?.closest && el.closest(`.gem__orbiter--${ORBITER_CORNERS[corner]}`) !== null;
      });
      expect(local).toHaveLength(0);
    });
  });

  it("the x drift tween's progress at mount equals the plan's phase, and the y drift tween's equals phase2 (±1e-6)", () => {
    const plan = orbiterPlan(GEM_SEED);
    render(<Harness dials={dials({ count: 1 })} />);
    const corner = plan.cornerOrder[0];
    const drift = plan.drift[corner];
    const local = toCalls.filter((c) => {
      const el = c.target as HTMLElement;
      return el?.closest && el.closest(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="rest"]`) !== null;
    });
    const xTween = local.find((c) => 'x' in c.vars)!.tween;
    const yTween = local.find((c) => 'y' in c.vars)!.tween;
    expect(xTween.progress() as number).toBeCloseTo(drift.phase, 6);
    expect(yTween.progress() as number).toBeCloseTo(drift.phase2, 6);
    expect(local.find((c) => 'x' in c.vars)!.vars.duration).toBeCloseTo(drift.px / 2, 6);
    expect(local.find((c) => 'y' in c.vars)!.vars.duration).toBeCloseTo(drift.py / 2, 6);
  });

  it('reduced motion: display state unchanged, but no repeat: -1 tweens are created', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const plan = orbiterPlan(GEM_SEED);
    const { container } = render(<Harness dials={dials({ count: 2 })} />);
    const shown = new Set(plan.cornerOrder.slice(0, 2));
    for (let corner = 0; corner < 4; corner++) {
      for (const depth of ['behind', 'rest', 'front'] as const) {
        const el = copyEl(container, corner, depth);
        const expectShown = depth === 'rest' && shown.has(corner);
        expect(el.style.display).toBe(expectShown ? '' : 'none');
      }
    }
    expect(toCalls.filter((c) => c.vars.repeat === -1)).toHaveLength(0);
  });

  it('enabled: false creates nothing — no gsap.* calls, no timeline key', () => {
    render(<Harness enabled={false} robotId="r-disabled" />);
    expect(setCalls).toHaveLength(0);
    expect(toCalls).toHaveLength(0);
    expect(createdTimelines).toHaveLength(0);
    expect(timelineMap.has('orbiters-world-r-disabled')).toBe(false);
  });
});

describe("BubbleStream still passes its reduced-motion tests after the helper move (sanity cross-check)", () => {
  it('src/utils/reducedMotion.ts exports prefersReducedMotion', async () => {
    const mod = await import('../../../utils/reducedMotion');
    expect(typeof mod.prefersReducedMotion).toBe('function');
  });
});

// ========================================
// Task 9: pair orbit scheduler and the twin swap
// ========================================
function depthOf(container: HTMLElement, corner: number): 'behind' | 'rest' | 'front' {
  for (const depth of ['behind', 'rest', 'front'] as const) {
    if (copyEl(container, corner, depth).style.display !== 'none') return depth;
  }
  throw new Error(`corner ${corner} has no visible copy`);
}

/** The orbit proxy tween targets a plain `{ t: 0 }` object, unlike drift's DOM-element targets. */
function findProxyTweens() {
  return toCalls.filter((c) => typeof c.target === 'object' && c.target !== null && !('style' in (c.target as object)) && 'duration' in c.vars);
}

function pairIndexOf(corner: number): number {
  return ORBIT_PAIRS.findIndex((pair) => pair.includes(corner));
}

describe('useOrbiterMotion — pair orbit scheduler and the twin swap (spec §1.4, Task 9)', () => {
  const plan = orbiterPlan(GEM_SEED);

  beforeEach(() => {
    setCalls.length = 0;
    toCalls.length = 0;
    createdTimelines.length = 0;
    nextOrbitQueue = [];
    killAllTimelines();
    vi.useFakeTimers();
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('registers a scheduler key per pair with a shown member; a pair with no shown member has none', () => {
    const shownCorner = plan.cornerOrder[0];
    const shownPair = pairIndexOf(shownCorner);
    const emptyPair = 1 - shownPair;
    render(<Harness dials={dials({ count: 1 })} robotId="r-one" />);
    expect(timelineMap.has(`orbit-world-r-one-${shownPair}`)).toBe(true);
    expect(timelineMap.has(`orbit-world-r-one-${emptyPair}`)).toBe(false);
  });

  it("waits initialWait[pair] * orbitGap before the pair's first draw", () => {
    const shownCorner = plan.cornerOrder[0];
    const shownPair = pairIndexOf(shownCorner);
    const waitMs = plan.initialWait[shownPair] * dials().orbitGap * 1000;
    render(<Harness dials={dials({ count: 1 })} />);

    act(() => { vi.advanceTimersByTime(Math.max(0, waitMs - 10)); });
    expect(findProxyTweens()).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(20); });
    expect(findProxyTweens()).toHaveLength(1);
  });

  // A crafted plan with [0, 3] (a full pair) shown and [1, 2] untouched — isolates pair 0's
  // scheduler so these tests don't also race the real seed's other, unrelated pair.
  const isolatedPairPlan = { ...plan, cornerOrder: [0, 3, 1, 2] as [number, number, number, number] };

  it('pairing: one proxy tween drives both shown members; the partner swaps to the opposite depth from the lead, never the same non-rest depth', () => {
    nextOrbitQueue = [{ dir: 1, open: 0, wait: 20 }];
    const waitMs = isolatedPairPlan.initialWait[0] * dials().orbitGap * 1000;

    const { container } = render(<Harness plan={isolatedPairPlan} dials={dials({ count: 2, orbitDuration: 4 })} />);
    expect(timelineMap.has('orbit-world-r1-1')).toBe(false); // pair [1,2] has no shown member
    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    const [proxy] = findProxyTweens();
    expect(proxy).toBeDefined();

    act(() => { proxy.tween.progress(0.25); }); // quarter point, theta = pi/2
    const aDepth = depthOf(container, 0);
    const bDepth = depthOf(container, 3);
    expect(aDepth).not.toBe('rest');
    expect(bDepth).not.toBe('rest');
    expect(aDepth).not.toBe(bDepth);
    expect(new Set([aDepth, bDepth])).toEqual(new Set(['front', 'behind']));
  });

  it('on completion, both members are back at the rest copy, x: 0, y: 0, scale: size, opacity: 1', () => {
    nextOrbitQueue = [{ dir: 1, open: 0.2, wait: 20 }];
    const waitMs = isolatedPairPlan.initialWait[0] * dials({ count: 2 }).orbitGap * 1000;

    const { container } = render(<Harness plan={isolatedPairPlan} dials={dials({ count: 2, orbitDuration: 2 })} />);
    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    const [proxy] = findProxyTweens();
    act(() => { proxy.tween.progress(0.6); }); // mid-flight, somewhere off-rest
    act(() => { vi.advanceTimersByTime(2000); }); // the tween's own duration elapses -> onComplete

    [0, 3].forEach((corner) => {
      expect(depthOf(container, corner)).toBe('rest');
      const rest = copyEl(container, corner, 'rest');
      expect(lastSetFor(rest, 'x')).toMatchObject({ x: 0, y: 0, scale: 1, opacity: 1 });
    });
  });

  it('with the partner hidden, the lead orbits alone and the partner\'s copies stay display: none', () => {
    // count 1 with cornerOrder's first entry shown: only the lead of its pair is shown.
    const lead = plan.cornerOrder[0];
    const partner = partnerOf(lead);
    const shownPair = pairIndexOf(lead);
    nextOrbitQueue = [{ dir: 1, open: 0, wait: 20 }];
    const waitMs = plan.initialWait[shownPair] * dials({ count: 1 }).orbitGap * 1000;

    const { container } = render(<Harness dials={dials({ count: 1, orbitDuration: 4 })} />);
    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    const [proxy] = findProxyTweens();
    act(() => { proxy.tween.progress(0.25); });

    expect(depthOf(container, lead)).not.toBe('rest');
    (['behind', 'rest', 'front'] as const).forEach((depth) => {
      expect(copyEl(container, partner, depth).style.display).toBe('none');
    });
  });

  it('successive orbits for one pair are separated by [gap, 2*gap)', () => {
    const lead = plan.cornerOrder[0];
    const shownPair = pairIndexOf(lead);
    const gap = 10;
    nextOrbitQueue = [{ dir: 1, open: 0, wait: gap }, { dir: -1, open: 0.1, wait: gap * 1.5 }];
    const waitMs = plan.initialWait[shownPair] * dials({ count: 1, orbitGap: gap }).orbitGap * 1000;

    render(<Harness dials={dials({ count: 1, orbitGap: gap, orbitDuration: 1 })} />);
    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    expect(findProxyTweens()).toHaveLength(1);

    // first orbit completes after its own 1s duration; the second draw's `wait` (gap) must elapse
    // before a second proxy tween appears.
    act(() => { vi.advanceTimersByTime(1000); }); // orbit 1 completes
    act(() => { vi.advanceTimersByTime(gap * 1000 - 50); });
    expect(findProxyTweens()).toHaveLength(1); // still just the first
    act(() => { vi.advanceTimersByTime(100); });
    expect(findProxyTweens()).toHaveLength(2);
  });

  it('a pair whose member is mid-arc does not start; it starts within 0.5 s of the arc ending', () => {
    const lead = plan.cornerOrder[0];
    const shownPair = pairIndexOf(lead);
    nextOrbitQueue = [{ dir: 1, open: 0, wait: 20 }];
    const waitMs = plan.initialWait[shownPair] * dials({ count: 1 }).orbitGap * 1000;

    const { container } = render(<Harness dials={dials({ count: 1, orbitDuration: 2 })} />);
    // Simulate an in-flight arc on the lead corner the way Task 10's arc code will mark one.
    copyEl(container, lead, 'rest').dataset.motionBusy = '1';

    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    expect(findProxyTweens()).toHaveLength(0); // retried, not drawn

    act(() => { vi.advanceTimersByTime(300); }); // still inside the 0.5s retry window
    expect(findProxyTweens()).toHaveLength(0);

    delete copyEl(container, lead, 'rest').dataset.motionBusy;
    act(() => { vi.advanceTimersByTime(300); }); // past the retry
    expect(findProxyTweens()).toHaveLength(1);
  });

  it('the scheduler key is killed on unmount', () => {
    const lead = plan.cornerOrder[0];
    const shownPair = pairIndexOf(lead);
    const { unmount } = render(<Harness dials={dials({ count: 1 })} robotId="r-kill" />);
    expect(timelineMap.has(`orbit-world-r-kill-${shownPair}`)).toBe(true);
    unmount();
    expect(timelineMap.has(`orbit-world-r-kill-${shownPair}`)).toBe(false);
  });

  it('no onUpdate/onComplete callback reads useLocaleStore', () => {
    const lead = plan.cornerOrder[0];
    const shownPair = pairIndexOf(lead);
    nextOrbitQueue = [{ dir: 1, open: 0, wait: 5 }];
    const waitMs = plan.initialWait[shownPair] * dials({ count: 2 }).orbitGap * 1000;
    const spy = vi.spyOn(useLocaleStore, 'getState');

    render(<Harness dials={dials({ count: 2, orbitDuration: 1 })} />);
    act(() => { vi.advanceTimersByTime(waitMs + 10); });
    const [proxy] = findProxyTweens();
    act(() => { proxy.tween.progress(0.5); });
    act(() => { vi.advanceTimersByTime(1000); }); // completion -> next wait scheduled

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reduced motion skips the scheduler entirely — no orbit-* key', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const lead = plan.cornerOrder[0];
    const shownPair = pairIndexOf(lead);
    render(<Harness dials={dials({ count: 2 })} robotId="r-reduced" />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(timelineMap.has(`orbit-world-r-reduced-${shownPair}`)).toBe(false);
    expect(findProxyTweens()).toHaveLength(0);
  });
});
