// ========================================
// IMPORTS
// ========================================
import { createRef } from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

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

function makeTween(target: unknown, vars: Record<string, unknown>): FakeTween {
  const tween: FakeTween = {
    target,
    vars,
    _progress: 0,
    progress: (p?: number) => {
      if (p === undefined) return tween._progress;
      tween._progress = p;
      return tween;
    },
    kill: vi.fn(),
    pause: vi.fn(() => tween),
    play: vi.fn(() => tween),
  };
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
    delayedCall: () => ({ kill: () => {} }),
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
import { orbiterPlan } from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';
import { timelineMap, killAllTimelines } from '../../../animation/timelineMap';

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
}: {
  robotId?: string;
  context?: 'world' | 'avatar';
  gemSeed?: number;
  enabled?: boolean;
  dials?: OrbiterDials;
}) {
  const ref = createRef<SVGGElement>();
  const gem = getRobotGem(gemSeed);
  const plan = orbiterPlan(gemSeed);
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
