import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';

import { Factory } from './Factory';
import { factoryGeometry } from './factoryGeometry';
import { selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import type { FactoryVariant } from './factoryVariants';
import * as colorUtils from '../../utils/colorUtils';
import { hslToString } from '../../utils/colorUtils';
import { getLighting, DAY_CYCLE_MEASURES } from '../../utils/lightingUtils';
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
 * `row: 99` is deliberately out of the (fallback) `'dense'` district recipe's range
 * (districtRecipes.ts) so `getRecipeRow('dense', 99)` returns `null` — every real row
 * restricts its variants to a subset, but this file wants free rein over which
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
 *  whatever comes after — see Factory.tsx's own JSX structure. The world gem ring
 *  (`g[data-gem="ring"]`, Phase 44) sits between the two and is the building's, not the
 *  greeble's, so it is left out here. */
function getRooftopHTML(container: HTMLElement): string {
  const outerG = container.querySelector('g[data-rooftop-greeble]');
  if (!outerG) return '';
  return Array.from(outerG.children)
    .slice(2)
    .filter((el) => el.getAttribute('data-gem') !== 'ring')
    .map((el) => el.outerHTML)
    .join('');
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

describe('Factory — Task 6: depth lightness cap and derelict rendering', () => {
  // Mirrors Factory.tsx's own localTime → lightMeasure → getLighting derivation so the
  // expected east-face multiplier matches exactly what the component computes.
  function eastLAt(hour: number): number {
    const lightMeasure = (hour / 24) * DAY_CYCLE_MEASURES;
    return getLighting(lightMeasure % DAY_CYCLE_MEASURES).eastL;
  }

  /** Reads back whichever FactoryVariant actually got selected — the test doesn't care
   *  which one, only that the cap/derelict math is applied correctly to its base color. */
  function renderedVariant(container: HTMLElement): FactoryVariant {
    return container.querySelector('[data-factory-type]')!.getAttribute('data-factory-type') as FactoryVariant;
  }

  function parseHslPercent(hsl: string, which: 's' | 'l'): number {
    const match = hsl.match(which === 's' ? /,\s*([\d.]+)%,/ : /,\s*[\d.]+%,\s*([\d.]+)%\)/);
    if (!match) throw new Error(`could not parse ${which} out of "${hsl}"`);
    return Number(match[1]);
  }

  it('background row body lightness at noon = base × eastL × 0.7 (±1 rounding)', () => {
    // dense row 2: background, full spread, Monolith-only (districtRecipes.ts).
    const actor = makeActor({ district: 'dense', row: 2 }, idsByVariant.Monolith);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const base = VARIANT_CONF[renderedVariant(container)].colors.body;
    const expectedL = Math.round(base.l * eastLAt(12) * 0.7);
    const [, eastFill] = getBodyFills(container);
    expect(parseHslPercent(eastFill, 'l')).toBeCloseTo(expectedL, 0);
  });

  it('foreground row body lightness at noon = base × eastL × 1.0 (uncapped)', () => {
    // dense row 10: foreground, edges spread, Warehouse/Monolith (districtRecipes.ts).
    const actor = makeActor({ district: 'dense', row: 10 }, idsByVariant.Monolith);
    setLocalTime(12);
    const { container } = render(<Factory actor={actor} />);
    const base = VARIANT_CONF[renderedVariant(container)].colors.body;
    const expectedL = Math.round(base.l * eastLAt(12));
    const [, eastFill] = getBodyFills(container);
    expect(parseHslPercent(eastFill, 'l')).toBeCloseTo(expectedL, 0);
  });

  it('a lit window fill is identical in a background and a foreground row (never capped)', () => {
    const bgActor = makeActor(
      { district: 'dense', row: 2, rooftopGreeble: undefined, facadeGreeble: 'squareWindows', beltCourseCount: 0 },
      idsByVariant.Monolith,
    );
    const fgActor = makeActor(
      { district: 'dense', row: 10, rooftopGreeble: undefined, facadeGreeble: 'squareWindows', beltCourseCount: 0 },
      idsByVariant.Monolith,
    );
    setLocalTime(0); // midnight — highest nightDepth, windows most likely lit
    const { container: bgContainer } = render(<Factory actor={bgActor} />);
    const { container: fgContainer } = render(<Factory actor={fgActor} />);

    const bgVariant = renderedVariant(bgContainer);
    const fgVariant = renderedVariant(fgContainer);
    const bgIlluminated = hslToString(VARIANT_CONF[bgVariant].colors.illuminated);
    const fgIlluminated = hslToString(VARIANT_CONF[fgVariant].colors.illuminated);

    expect(getFacadeHTML(bgContainer)).toContain(bgIlluminated);
    expect(getFacadeHTML(fgContainer)).toContain(fgIlluminated);
  });

  it('derelict: zero lit-window fills, body saturation 40% of a non-derelict twin, antenna light absent', () => {
    const live = makeActor(
      { rooftopGreeble: 'antennae', facadeGreeble: 'squareWindows', beltCourseCount: 0 },
      idsByVariant.Stacks,
    );
    const derelict = makeActor(
      { rooftopGreeble: 'antennae', facadeGreeble: 'squareWindows', beltCourseCount: 0, derelict: true },
      idsByVariant.Stacks,
    );
    setLocalTime(0); // midnight — highest nightDepth, so the live twin's windows are almost
    // certainly lit, making "the derelict twin has none" a meaningful assertion rather than
    // a coincidence of both being dark.

    const { container: liveContainer } = render(<Factory actor={live} />);
    const { container: derelictContainer } = render(<Factory actor={derelict} />);

    // Antenna light absent.
    expect(getRooftopHTML(liveContainer)).not.toBe('');
    expect(getRooftopHTML(derelictContainer)).toBe('');

    // Zero lit-window fills.
    const variant = renderedVariant(liveContainer);
    const illuminatedFill = hslToString(VARIANT_CONF[variant].colors.illuminated);
    expect(getFacadeHTML(liveContainer)).toContain(illuminatedFill);
    expect(getFacadeHTML(derelictContainer)).not.toContain(illuminatedFill);

    // Body saturation 40% of the non-derelict twin.
    const [, liveEastFill] = getBodyFills(liveContainer);
    const [, derelictEastFill] = getBodyFills(derelictContainer);
    const liveSat = parseHslPercent(liveEastFill, 's');
    const derelictSat = parseHslPercent(derelictEastFill, 's');
    expect(derelictSat).toBeCloseTo(liveSat * 0.4, 1);
  });

  it('mutation check: a derelict actor still renders without throwing when it has no rooftop/facade greeble', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined, derelict: true }, idsByVariant.Monolith);
    setLocalTime(0);
    expect(() => render(<Factory actor={actor} />)).not.toThrow();
  });
});

// ========================================
// WORLD GEM RING (docs/specs/WORLD_GEM_MATERIAL.md §1.4, Phase 44 Task 8)
// ========================================
describe('Factory — the world gem body ring', () => {
  type Pt = [number, number];
  interface Facet {
    fill: string;
    pts: Pt[];
  }

  const NO_SHIFT = { hueShift: 0, satShift: 0 };

  /** The ring's facet quads in document order: [outer a, outer b, inner of b, inner of a]. */
  function ringFacets(container: HTMLElement): Facet[] {
    const ring = container.querySelector('g[data-gem="ring"]');
    if (!ring) return [];
    return Array.from(ring.querySelectorAll('path')).flatMap((path) =>
      (path.getAttribute('d') ?? '')
        .split('M')
        .filter(Boolean)
        .map((sub) => ({
          fill: path.getAttribute('fill') ?? '',
          pts: Array.from(sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)).map((m): Pt => [Number(m[1]), Number(m[2])]),
        })),
    );
  }

  const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
  /** The facet whose outer edge runs (ax, ay) → (bx, by). */
  const facetOn = (facets: Facet[], [ax, ay]: Pt, [bx, by]: Pt) =>
    facets.find((f) => near(f.pts[0][0], ax) && near(f.pts[0][1], ay) && near(f.pts[1][0], bx) && near(f.pts[1][1], by));

  /** The building's pixel box and front-corner x, from the same derivation the factory renders. */
  function box(actor: Actor) {
    const g = factoryGeometry({
      id: actor.id,
      type: ActorType.FACTORY,
      position: actor.position,
      scaleX: actor.scaleX,
      scaleY: actor.scaleY,
      isActive: true,
      config: { row: actor.config?.row, district: actor.config?.district },
    });
    const W = g.width * (actor.scaleX ?? 1);
    const H = g.height * (actor.scaleY ?? 1);
    return { W, H, fc: (g.frontCornerX / 100) * W, variant: g.variant };
  }

  const hour = (h: number) => getLighting(((h / 24) * DAY_CYCLE_MEASURES) % DAY_CYCLE_MEASURES);
  const body = (variant: FactoryVariant) => VARIANT_CONF[variant].colors.body;
  const fill = (variant: FactoryVariant, m: number) => colorUtils.applyColorShift(body(variant), NO_SHIFT, m);

  describe.each(ALL_VARIANTS)('%s', (variant) => {
    const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows', beltCourseCount: 1 }, idsByVariant[variant]);

    it('has exactly one ring, after the scaled body group and before the rooftop greeble', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      expect(container.querySelectorAll('g[data-gem="ring"]')).toHaveLength(1);
      const kids = Array.from(container.querySelector('g[data-rooftop-greeble]')!.children);
      expect(kids[0].tagName.toLowerCase()).toBe('defs');
      expect(kids[1].getAttribute('transform')).toMatch(/^scale\(/);
      expect(kids[2].getAttribute('data-gem')).toBe('ring');
      expect(kids.length).toBeGreaterThan(3); // the rooftop greeble follows the ring
    });

    it('is the six facets of a front-corner-split rectangle that exactly covers the building', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const facets = ringFacets(container);
      const { W, H, fc } = box(actor);
      expect(facets).toHaveLength(6);
      expect(facetOn(facets, [0, 0], [fc, 0])).toBeDefined();
      expect(facetOn(facets, [fc, 0], [W, 0])).toBeDefined();
      expect(facetOn(facets, [W, 0], [W, H])).toBeDefined();
      expect(facetOn(facets, [W, H], [fc, H])).toBeDefined();
      expect(facetOn(facets, [fc, H], [0, H])).toBeDefined();
      expect(facetOn(facets, [0, H], [0, 0])).toBeDefined();
    });

    it('is 8 px deep on both axes, never stretched by the body scale (capped at 18% of the short side)', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const facets = ringFacets(container);
      const { W, H, fc } = box(actor);
      const d = Math.min(8, 0.18 * Math.min(W, H));
      expect(facetOn(facets, [0, 0], [fc, 0])!.pts[3][1]).toBeCloseTo(d, 1); // top depth
      expect(facetOn(facets, [0, H], [0, 0])!.pts[3][0]).toBeCloseTo(d, 1); // left depth
      expect(facetOn(facets, [W, 0], [W, H])!.pts[3][0]).toBeCloseTo(W - d, 1); // right depth
      expect(facetOn(facets, [fc, H], [0, H])!.pts[3][1]).toBeCloseTo(H - d, 1); // bottom depth
    });

    it('carries no style attribute, so nothing can transition (roadmap 17.2.5)', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      expect(container.querySelector('g[data-gem="ring"]')!.querySelectorAll('[style]')).toHaveLength(0);
    });
  });

  describe('lit by the hour', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Monolith);

    it('at 9 am the top-west and top-east facets differ, the east one in the lit tone of the body at eastL', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const { W, H, fc, variant } = box(actor);
      const facets = ringFacets(container);
      const topWest = facetOn(facets, [0, 0], [fc, 0])!;
      const topEast = facetOn(facets, [fc, 0], [W, 0])!;
      expect(topWest.fill).not.toBe(topEast.fill);
      expect(topEast.fill).toBe(fill(variant, hour(9).eastL * 1.25));
      expect(topWest.fill).toBe(fill(variant, hour(9).westL * 1.25));
      // the east-side facet is lit, the west side shaded
      expect(facetOn(facets, [W, 0], [W, H])!.fill).toBe(fill(variant, hour(9).eastL * 1.25));
      expect(facetOn(facets, [0, H], [0, 0])!.fill).toBe(fill(variant, hour(9).westL * 0.5));
    });

    it('at noon the two top halves match and the sides are neutral', () => {
      setLocalTime(12);
      const { container } = render(<Factory actor={actor} />);
      const { W, H, fc, variant } = box(actor);
      const facets = ringFacets(container);
      expect(facetOn(facets, [0, 0], [fc, 0])!.fill).toBe(facetOn(facets, [fc, 0], [W, 0])!.fill);
      expect(facetOn(facets, [W, 0], [W, H])!.fill).toBe(fill(variant, hour(12).eastL * 1.1));
      expect(facetOn(facets, [0, H], [0, 0])!.fill).toBe(fill(variant, hour(12).westL * 1.1));
    });

    it('at 3 pm the sun is in the west: the west facet is lit and the east shaded', () => {
      setLocalTime(15);
      const { container } = render(<Factory actor={actor} />);
      const { W, H, variant } = box(actor);
      const facets = ringFacets(container);
      expect(facetOn(facets, [0, H], [0, 0])!.fill).toBe(fill(variant, hour(15).westL * 1.25));
      expect(facetOn(facets, [W, 0], [W, H])!.fill).toBe(fill(variant, hour(15).eastL * 0.5));
    });

    it('re-lights across the hour: the ring changes between 9 am and 10 pm', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const morning = ringFacets(container).map((f) => f.fill);
      setLocalTime(22);
      const night = ringFacets(container).map((f) => f.fill);
      expect(night).toHaveLength(6);
      expect(night).not.toEqual(morning);
    });

    it('reuses its elements across a lighting tick (only the fills move)', () => {
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const before = Array.from(container.querySelectorAll('g[data-gem="ring"] path'));
      setLocalTime(15);
      const after = Array.from(container.querySelectorAll('g[data-gem="ring"] path'));
      expect(after.length).toBeGreaterThan(0);
      after.slice(0, Math.min(after.length, before.length)).forEach((p, i) => expect(p).toBe(before[i]));
    });
  });

  describe('the ring is the face\'s own material', () => {
    it('a derelict\'s facets carry the desaturated body and its depth cap, and go dark with the building', () => {
      const live = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Stacks);
      const dead = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined, derelict: true }, idsByVariant.Stacks);
      setLocalTime(9);
      const { container: liveC } = render(<Factory actor={live} />);
      const { container: deadC } = render(<Factory actor={dead} />);
      const { W, variant } = box(dead);
      const topEast = (c: HTMLElement) => facetOn(ringFacets(c), [box(live).fc, 0], [W, 0])!.fill;
      const desaturated = { ...body(variant), s: body(variant).s * 0.4 };
      const DERELICT_L_CAP = 0.55; // constants/sceneDepth.ts
      expect(topEast(deadC)).toBe(colorUtils.applyColorShift(desaturated, NO_SHIFT, hour(9).eastL * DERELICT_L_CAP * 1.25));
      expect(topEast(deadC)).not.toBe(topEast(liveC));
    });

    it('a background-row factory\'s facets carry the 0.7 depth cap', () => {
      const actor = makeActor({ district: 'dense', row: 2, rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Monolith);
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const { W, variant, fc } = box(actor);
      const topEast = facetOn(ringFacets(container), [fc, 0], [W, 0])!;
      expect(topEast.fill).toBe(fill(variant, hour(9).eastL * 0.7 * 1.25));
    });

    it('a foreground-row factory\'s facets are uncapped', () => {
      const actor = makeActor({ district: 'dense', row: 10, rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Monolith);
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const { W, variant, fc } = box(actor);
      const topEast = facetOn(ringFacets(container), [fc, 0], [W, 0])!;
      expect(topEast.fill).toBe(fill(variant, hour(9).eastL * 1.25));
    });

    it('applies the actor\'s hue and saturation shift to every facet', () => {
      const actor = makeActor({ hueShift: 30, satShift: -15, rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Stacks);
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const { W, variant, fc } = box(actor);
      const shifted = colorUtils.shiftHSL(body(variant), { hueShift: 30, satShift: -15 });
      const topEast = facetOn(ringFacets(container), [fc, 0], [W, 0])!;
      expect(topEast.fill).toBe(colorUtils.applyColorShift(shifted, NO_SHIFT, hour(9).eastL * 1.25));
    });
  });

  describe('actor scale', () => {
    it('sizes the ring to the scaled building and scales its depth with it (8 × scaleX)', () => {
      const actor: Actor = { ...makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Skyscraper), scaleX: 1.1, scaleY: 1.1 };
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      const { W, H, fc } = box(actor);
      const facets = ringFacets(container);
      const d = Math.min(8.8, 0.18 * Math.min(W, H));
      expect(facetOn(facets, [0, 0], [fc, 0])).toBeDefined();
      expect(facetOn(facets, [W, 0], [W, H])).toBeDefined();
      expect(facetOn(facets, [0, 0], [fc, 0])!.pts[3][1]).toBeCloseTo(d, 1);
    });

    it('strokes its facets at 0.6 × the scale', () => {
      const actor: Actor = { ...makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Skyscraper), scaleX: 0.9, scaleY: 0.9 };
      setLocalTime(9);
      const { container } = render(<Factory actor={actor} />);
      for (const p of Array.from(container.querySelectorAll('g[data-gem="ring"] path'))) {
        expect(p.getAttribute('stroke-width')).toBe('0.54');
      }
    });
  });

  it('adds only the ring to a bare building: the body, clip and facade markup are untouched', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, idsByVariant.Monolith);
    setLocalTime(9);
    const { container } = render(<Factory actor={actor} />);
    expect(getBodyFills(container)).toHaveLength(2);
    expect(container.querySelectorAll('clipPath')).toHaveLength(2);
    expect(container.querySelectorAll('g[data-gem="ring"]')).toHaveLength(1);
  });
});
