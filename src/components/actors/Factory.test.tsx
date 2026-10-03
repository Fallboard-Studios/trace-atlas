import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

// Same isolation reasoning as FactoryBubbleStream.test.tsx: BubbleStream's own timing/GSAP
// internals are irrelevant to what this file verifies (lighting-driven re-render behavior),
// so it's stubbed out rather than exercised.
vi.mock('./BubbleStream', () => ({
  __esModule: true,
  default: () => <div data-testid="bubble-stream-stub" />,
}));

import { Factory } from './Factory';
import { selectVariantFromSeed } from './factoryVariants';
import type { FactoryVariant } from './factoryVariants';
import * as colorUtils from '../../utils/colorUtils';
import { useAttenuationStyleStore } from '../../stores/attenuationStyleStore';
import { useLocaleStore } from '../../stores/localeStore';
import { useUIStore } from '../../stores/uiStore';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';
import type { AttenuationStyle } from '../../types/attenuationStyle';
import type { Locale } from '../../types/locale';

// ========================================
// FIXTURES
// ========================================

const TEST_ATTENUATION_STYLE: AttenuationStyle = {
  id: 'test-attenuation-style',
  name: 'Glaxos',
  locales: ['test-locale'],
  currentLocaleId: 'test-locale',
};

const TEST_LOCALE: Locale = {
  id: 'test-locale',
  attenuationStyleId: 'test-attenuation-style',
  name: 'Test Locale',
  coordinates: { x: -17, y: 30 },
  dayStartTimestamp: 0,
  robots: [],
  actors: [],
  companies: [],
  currentMeasure: 0,
};

function setStoreFixtures() {
  useAttenuationStyleStore.setState({ attenuationStyles: [TEST_ATTENUATION_STYLE], currentAttenuationStyleId: TEST_ATTENUATION_STYLE.id });
  useLocaleStore.setState({ locales: { [TEST_LOCALE.id]: TEST_LOCALE } });
}

/**
 * `row: 99` is deliberately out of `FACTORY_ROWS`' range (factoryPlacementSystem.ts has 9
 * entries, indices 0-8) so `getRowConfig(99)` returns `null` — every real row restricts
 * `availableFactoryTypes` to a subset, but this file wants free rein over which
 * `FactoryVariant` a given seed resolves to (see `idsByVariant` below), which only an
 * unrestricted `availableTypes` (the `selectVariantFromSeed` default: all 5 variants) makes
 * predictable to search for.
 */
function makeActor(configOverrides: Actor['config'] = {}, id = 'factory-lighting-test'): Actor {
  return {
    id,
    type: ActorType.FACTORY,
    position: { x: 100, y: 900 },
    isActive: true,
    cooldownRemaining: 0,
    config: { row: 99, hueShift: 0, satShift: 0, ...configOverrides },
  };
}

const ALL_VARIANTS: FactoryVariant[] = ['Monolith', 'Stacks', 'Refinery', 'Skyscraper', 'Warehouse'];

/**
 * Deterministically finds one actor id producing each `FactoryVariant`, by calling the real
 * `selectVariantFromSeed` directly rather than hardcoding magic ids — stays correct even if
 * `getVariantFromNoise`'s weighting changes. Computed once at module load; throws loudly
 * (failing every test in this file, not silently skipping variant coverage) if any variant
 * isn't found within a generous search budget.
 */
function findActorIdForEachVariant(): Record<FactoryVariant, string> {
  const found = {} as Record<FactoryVariant, string>;
  const remaining = new Set(ALL_VARIANTS);
  for (let n = 0; remaining.size > 0; n++) {
    if (n > 5000) {
      throw new Error(`Could not find seeds producing every FactoryVariant; still missing: ${[...remaining].join(', ')}`);
    }
    const id = `factory-variant-search-${n}`;
    const { variant } = selectVariantFromSeed(id, 100, 99);
    if (remaining.has(variant)) {
      found[variant] = id;
      remaining.delete(variant);
    }
  }
  return found;
}

const idsByVariant = findActorIdForEachVariant();

/** The 2 body-fill rects (west base + east overlay) are always exactly 100x100 in the
 *  normalized 0-100 viewBox — every other rect in the tree (rooftop greebles use actual
 *  pixel dimensions; facade greebles are sized well under 100 units) is a different size. */
function getBodyFills(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('rect[width="100"][height="100"]')).map(
    (el) => el.getAttribute('fill') ?? '',
  );
}

/** Factory.tsx's outer `<g>` always renders exactly `<defs>` then the scaled body/facade
 *  `<g>` as its first two children; the rooftop greeble element (if any) renders as
 *  whatever comes after — see Factory.tsx's own JSX structure. */
function getRooftopHTML(container: HTMLElement): string {
  const outerG = container.querySelector('g[data-rooftop-greeble]');
  if (!outerG) return '';
  return Array.from(outerG.children).slice(2).map((el) => el.outerHTML).join('');
}

/** Facade content renders inside the second `g[clip-path]` in document order (the first
 *  clips the east body-fill overlay; the second — `bodyClipId` — clips facade greebles). */
function getFacadeHTML(container: HTMLElement): string {
  const clipGroups = container.querySelectorAll('g[clip-path]');
  return clipGroups[1]?.innerHTML ?? '';
}

function setLocalTime(hour: number) {
  act(() => {
    useUIStore.getState().setActiveLocaleLocalTime(hour);
  });
}

beforeEach(() => {
  setStoreFixtures();
});

afterEach(() => {
  // Wrapped in act(): this file's own afterEach can run before Testing Library's automatic
  // unmount cleanup, while the just-finished test's <Factory> is still mounted and subscribed
  // to activeLocaleLocalTime — an unwrapped reset here would trigger a state update on that
  // still-live component outside of act().
  act(() => {
    useUIStore.setState({ activeLocaleLocalTime: null });
  });
});

// ========================================
// TESTS
// ========================================

describe('Factory — renders every variant without crashing', () => {
  it.each(ALL_VARIANTS)('renders a %s factory without throwing', (variant) => {
    const actor = makeActor({}, idsByVariant[variant]);
    expect(() => render(<Factory actor={actor} />)).not.toThrow();
  });

  it('renders without throwing when no rooftop or facade greeble is configured', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Monolith);
    expect(() => render(<Factory actor={actor} />)).not.toThrow();
  });
});

describe('Factory — body fill tracks the day/night lighting cycle', () => {
  it('body fill differs between a day and a night activeLocaleLocalTime', () => {
    setLocalTime(12); // noon — lightMeasure 48, both faces near peak brightness
    const { container } = render(<Factory actor={makeActor({}, idsByVariant.Monolith)} />);
    const dayFills = getBodyFills(container);
    expect(dayFills.length).toBeGreaterThanOrEqual(2);

    setLocalTime(0); // midnight — lightMeasure 0, both faces near minimum brightness
    const nightFills = getBodyFills(container);

    expect(nightFills).not.toEqual(dayFills);
  });

  // Found live-verifying items 21-23's fixes (2026-09-15, Crawford + React DevTools Profiler):
  // FactoryInner still cost 5-9ms/tick in the real browser even with items 21-23's JS-computation
  // fixes landed, because eastFill/westFill (via applyColorShift) were unrounded floats — a
  // genuinely different string every single tick, forcing a real DOM write every second even
  // when the visual change was imperceptible. Fixed by rounding lightness to a whole number
  // (colorUtils.ts). A full in-game day cycle is ~6 real minutes (Crawford, backlog item 21's
  // own Decision note) — one real second is ~0.067 hours of localTime, the delta used below.
  it('body fill is unchanged across a realistic one-second tick, even at dawn (the steepest part of the day/night curve)', () => {
    const actor = makeActor({}, idsByVariant.Monolith);
    setLocalTime(6); // dawn — steepest slope of the sine-based lighting curve
    const { container } = render(<Factory actor={actor} />);
    const before = getBodyFills(container);

    setLocalTime(6 + 24 / 360); // +1 real second at the ~6-minute-per-day-cycle rate
    const after = getBodyFills(container);

    expect(after).toEqual(before);
  });
});

describe('Factory — static-only greebles stay visually identical across a lighting tick', () => {
  // Per docs/specs/FACTORY_LIGHTING_RERENDER.md §1.1: these renderers read no lighting
  // field at all today, so their output must be byte-identical regardless of the tick —
  // both before and after the eventual layout/paint split (Tasks 2-4).
  it('rooftop: machinery', () => {
    const actor = makeActor({ rooftopGreeble: 'machinery', facadeGreeble: undefined }, idsByVariant.Monolith);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getRooftopHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getRooftopHTML(container)).toBe(dayHTML);
  });

  it('facade: pipesValves', () => {
    const actor = makeActor(
      { rooftopGreeble: undefined, facadeGreeble: 'pipesValves', beltCourseCount: 0 },
      idsByVariant.Monolith,
    );
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getFacadeHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getFacadeHTML(container)).toBe(dayHTML);
  });
});

describe('Factory — lighting-dependent greebles change across a lighting tick', () => {
  // Per docs/specs/FACTORY_LIGHTING_RERENDER.md §1.1: these are the 5 renderers that
  // genuinely read eastLMultiplier/westLMultiplier/nightDepth/flickerEpoch — the eventual
  // layout/paint split (Tasks 2-4) must not freeze their paint step along with their geometry.
  it('rooftop: pitchedRoof', () => {
    const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: undefined }, idsByVariant.Monolith);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getRooftopHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getRooftopHTML(container)).not.toBe(dayHTML);
  });

  it('rooftop: crownSpire', () => {
    const actor = makeActor({ rooftopGreeble: 'crownSpire', facadeGreeble: undefined }, idsByVariant.Skyscraper);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getRooftopHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getRooftopHTML(container)).not.toBe(dayHTML);
  });

  it.each(['squareWindows', 'wideWindows', 'tallWindows'] as const)('facade: %s', (facadeGreeble) => {
    const actor = makeActor(
      { rooftopGreeble: undefined, facadeGreeble, beltCourseCount: 0 },
      idsByVariant.Stacks,
    );
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getFacadeHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getFacadeHTML(container)).not.toBe(dayHTML);
  });

  it('facade: squareWindows with belt courses (multi-zone) still updates across a tick', () => {
    // Edge case: beltCourseCount > 0 routes through Factory.tsx's own zone-splitting loop
    // (separate FACADE_RENDERERS call per zone) rather than the single-call path above.
    const actor = makeActor(
      { rooftopGreeble: undefined, facadeGreeble: 'squareWindows', beltCourseCount: 2 },
      idsByVariant.Skyscraper,
    );
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const dayHTML = getFacadeHTML(container);
    expect(dayHTML).not.toBe('');

    setLocalTime(0);
    expect(getFacadeHTML(container)).not.toBe(dayHTML);
  });
});

describe('Factory — no CSS transition on lighting fills (roadmap 17.2.5)', () => {
  // The idle paint localizer (scripts/perf/idle-paint.mjs, 2026-10-02) found the whole ocean
  // scene repainting on every frame at idle, and one of the two causes was the `fill 4.8s`
  // CSS transition on every lighting-driven body/belt/rooftop fill: the rounded lightness
  // steps every ~2 s, so with a 4.8 s transition some fill is ALWAYS mid-transition, and a
  // running transition style-invalidates its element on every frame. With the moving nodes
  // removed, that alone was 943 ms of paint per 6 s unthrottled (23 ms with transitions off).
  // A 1 %-lightness step every ~2 s needs no easing to look smooth.
  it.each(ALL_VARIANTS)('%s: no element carries an inline transition', (variant) => {
    const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows', beltCourseCount: 2 }, idsByVariant[variant]);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    expect(container.querySelectorAll('[style*="transition"]').length).toBe(0);
  });

  it.each(['steppeRoof', 'crownSpire'] as const)('rooftop %s: no element carries an inline transition', (rooftopGreeble) => {
    const actor = makeActor({ rooftopGreeble, facadeGreeble: undefined }, idsByVariant.Skyscraper);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    expect(container.querySelectorAll('[style*="transition"]').length).toBe(0);
  });
});

describe('Factory — regression guard (documents pre-fix behavior; tightened by Task 4)', () => {
  // This isn't the call-count spy the spec's Task 4 will add (nothing to spy on yet — the
  // static/dynamic split doesn't exist until then). It just confirms the tick really does
  // reach every render path today, so Task 4's later "stop redoing this work" assertion has
  // a true baseline to improve on rather than an already-inert one.
  it('re-renders and recomputes fills on every activeLocaleLocalTime change, today', () => {
    const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows' }, idsByVariant.Stacks);
    const times = [12, 6, 0, 18];
    const { container } = render(<Factory actor={actor} />);
    const seen = new Set<string>();
    for (const t of times) {
      setLocalTime(t);
      seen.add(getBodyFills(container).join('|'));
    }
    // 4 distinct local times around the sine-based lighting curve should produce at least 2
    // distinct body-fill pairs — proves the render is actually live, not stuck on a cached value.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('Factory — Task 4: staticVisual isolates geometry from the lighting tick', () => {
  // The regression test the whole fix (docs/specs/FACTORY_LIGHTING_RERENDER.md) is for.
  // Must fail against pre-Task-4 Factory.tsx (confirmed directly before implementing) and
  // pass once staticVisual exists.
  //
  // Spies on `shiftHSL` (colorUtils.ts) rather than a same-module greeble function: Factory.tsx
  // imports shiftHSL across a real module boundary, so vi.spyOn's replacement is actually what
  // Factory.tsx calls. A function greebles/*.tsx calls internally (e.g.
  // computeWindowGridLayout, called by renderWindowGrid in the *same* file) is a same-module
  // reference that Vite's SSR transform doesn't route through the exports object — spying on
  // it from outside silently observes zero calls regardless of the real behavior (confirmed
  // directly: an earlier version of this test spying on computeWindowGridLayout that way
  // reported 0 calls even right after mount, before any tick — not a meaningful RED).
  //
  // shiftHSL itself is a real, currently-unmemoized piece of the bug: Factory.tsx calls it 4x
  // (body/accent/greeble/illuminated) directly in the render body today, on every tick, even
  // though its inputs (the variant's base colors + the actor's fixed hueShift/satShift) never
  // change after spawn. Task 4 moves it inside staticVisual.
  it('does not recompute shiftHSL on every activeLocaleLocalTime tick — only on mount', () => {
    const shiftSpy = vi.spyOn(colorUtils, 'shiftHSL');
    const actor = makeActor({}, idsByVariant.Stacks);
    setLocalTime(12);
    render(<Factory actor={actor} />);
    const callsAfterMount = shiftSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    setLocalTime(0);
    setLocalTime(18);
    setLocalTime(6);

    expect(shiftSpy.mock.calls.length).toBe(callsAfterMount);
    shiftSpy.mockRestore();
  });
});
