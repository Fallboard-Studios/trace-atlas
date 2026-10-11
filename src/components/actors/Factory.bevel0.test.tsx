/**
 * With every WORLD_GEM piece off, a factory renders as it did before the world gem material existed
 * (docs/specs/WORLD_GEM_MATERIAL.md §3): no ring, no hairline, and the old window clip. The pre-change
 * snapshots that proved byte-identity through Tasks 8-12 were deleted in Task 21 once the material
 * had landed; what stays is the plain assertion that the switched-off markup carries no trace of it.
 *
 * Its own file because vi.mock is file-wide and Factory.test.tsx needs the real switches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('./material/worldGemMaterial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./material/worldGemMaterial')>();
  return {
    ...actual,
    WORLD_GEM: { factories: false, massScenery: false, roofBoxes: false, terrain: false, members: false, others: false },
  };
});

import { Factory } from './Factory';
import { worldGemTraces } from './material/ringTestHelpers';
import { selectVariantFromSeed } from './factoryVariants';
import type { FactoryVariant } from './factoryVariants';
import { useUIStore } from '../../stores/uiStore';
import { ActorType } from '../../types/Actor';
import type { Actor } from '../../types/Actor';
import type { RooftopGreeble, FacadeGreeble } from './greebles/greebleTypes';

const ALL_VARIANTS: FactoryVariant[] = ['Monolith', 'Stacks', 'Refinery', 'Skyscraper', 'Warehouse'];
const ROOFTOPS: RooftopGreeble[] = ['machinery', 'antennae', 'waterTower', 'cupola', 'crownSpire', 'pitchedRoof', 'steppeRoof', 'pipesValves'];
const FACADES: FacadeGreeble[] = ['squareWindows', 'wideWindows', 'tallWindows', 'beltCourse', 'pipesValves'];

/** `row: 99` is outside every district recipe, so the variant is free (see Factory.test.tsx). */
function makeActor(config: Actor['config'], id: string, extra: Partial<Actor> = {}): Actor {
  return {
    id,
    type: ActorType.FACTORY,
    position: { x: 100, y: 900 },
    isActive: true,
    config: { row: 99, hueShift: 0, satShift: 0, ...config },
    ...extra,
  };
}

function idsByVariant(): Record<FactoryVariant, string> {
  const found = {} as Record<FactoryVariant, string>;
  const remaining = new Set(ALL_VARIANTS);
  for (let n = 0; remaining.size > 0; n++) {
    if (n > 5000) throw new Error(`no seed for: ${[...remaining].join(', ')}`);
    const id = `factory-variant-search-${n}`;
    const { variant } = selectVariantFromSeed(id, 100, 99);
    if (remaining.has(variant)) {
      found[variant] = id;
      remaining.delete(variant);
    }
  }
  return found;
}
const IDS = idsByVariant();

function markup(actor: Actor, hour: number): string {
  act(() => useUIStore.getState().setActiveLocaleLocalTime(hour));
  const { container, unmount } = render(<Factory actor={actor} />);
  const html = container.innerHTML;
  unmount();
  return html;
}

/** Rendered for real (not blank), body clip back at the old 2 / 2 / 96 / 96, and no ring or hairline anywhere. */
function expectPlain(html: string): void {
  expect(html).toContain('data-factory-type');
  expect(html).toMatch(/<clippath id="body-clip-[^"]*"><rect x="2" y="2" width="96" height="96">/);
  expect(worldGemTraces(html)).toEqual([]);
}

beforeEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
});
afterEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
});

describe('Factory with every WORLD_GEM piece off carries no trace of the material', () => {
  it('the mock really turns every piece off', async () => {
    const { WORLD_GEM } = await import('./material/worldGemMaterial');
    expect((Object.values(WORLD_GEM) as boolean[]).every((on) => on === false)).toBe(true);
    expect(Object.keys(WORLD_GEM)).toHaveLength(6);
  });

  describe.each([
    ['noon', 12],
    ['9 am', 9],
    ['3 pm', 15],
    ['10 pm', 22],
  ])('every variant, roof + windows + belt courses, at %s', (_name, hour) => {
    it.each(ALL_VARIANTS)('%s', (variant) => {
      const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows', beltCourseCount: 2 }, IDS[variant]);
      expectPlain(markup(actor, hour));
    });
  });

  describe.each([
    ['9 am', 9],
    ['10 pm', 22],
  ])('every rooftop greeble at %s', (_name, hour) => {
    it.each(ROOFTOPS)('%s', (rooftopGreeble) => {
      const actor = makeActor({ rooftopGreeble, facadeGreeble: undefined }, IDS.Skyscraper);
      expectPlain(markup(actor, hour));
    });
  });

  describe('every facade greeble at 9 am', () => {
    it.each(FACADES)('%s, no belt courses', (facadeGreeble) => {
      const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble, beltCourseCount: 0 }, IDS.Stacks);
      expectPlain(markup(actor, 9));
    });

    it.each([1, 2, 3])('squareWindows with %i belt courses', (beltCourseCount) => {
      const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: 'squareWindows', beltCourseCount }, IDS.Skyscraper);
      expectPlain(markup(actor, 9));
    });
  });

  it('a bare building with no greebles at all', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, IDS.Monolith);
    expectPlain(markup(actor, 12));
  });

  describe('derelict', () => {
    it('at night, with an antenna (its light is suppressed)', () => {
      const actor = makeActor({ rooftopGreeble: 'antennae', facadeGreeble: 'squareWindows', beltCourseCount: 1, derelict: true }, IDS.Stacks);
      expectPlain(markup(actor, 22));
    });

    it('by day, with a pitched roof', () => {
      const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'wideWindows', derelict: true }, IDS.Warehouse);
      expectPlain(markup(actor, 9));
    });
  });

  describe('background and midground rows', () => {
    it('dense row 2 (background) at noon', () => {
      const actor = makeActor({ district: 'dense', row: 2, rooftopGreeble: 'crownSpire', facadeGreeble: 'tallWindows' }, IDS.Monolith);
      expectPlain(markup(actor, 12));
    });

    it('dense row 2 (background) at 9 am', () => {
      const actor = makeActor({ district: 'dense', row: 2, rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows' }, IDS.Monolith);
      expectPlain(markup(actor, 9));
    });

    it('dense row 10 (foreground) at 9 am', () => {
      const actor = makeActor({ district: 'dense', row: 10, rooftopGreeble: 'steppeRoof', facadeGreeble: 'squareWindows' }, IDS.Monolith);
      expectPlain(markup(actor, 9));
    });
  });

  describe('actor scale', () => {
    it.each([
      ['0.9', 0.9, 0.9],
      ['1.1', 1.1, 1.1],
      ['1.0 wide, 0.94 tall', 1, 0.94],
    ])('scale %s', (_name, scaleX, scaleY) => {
      const actor = makeActor(
        { rooftopGreeble: 'steppeRoof', facadeGreeble: 'squareWindows', beltCourseCount: 1 },
        IDS.Skyscraper,
        { scaleX, scaleY },
      );
      expectPlain(markup(actor, 9));
    });
  });

  it('hue and saturation shifts', () => {
    const actor = makeActor({ hueShift: 25, satShift: -10, rooftopGreeble: 'machinery', facadeGreeble: 'wideWindows' }, IDS.Refinery);
    expectPlain(markup(actor, 9));
  });
});
