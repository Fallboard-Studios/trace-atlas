/**
 * "Bevel 0 is proven, not promised" (docs/specs/WORLD_GEM_MATERIAL.md §3, plan architecture
 * decisions): with every WORLD_GEM piece off, a factory renders byte-for-byte as it did before the
 * world gem material existed. The snapshot file beside this test was captured on the PRE-CHANGE
 * Factory.tsx (Task 8's RED step) and must match unchanged through Tasks 8-12.
 *
 * Its own file because vi.mock is file-wide and Factory.test.tsx needs the real switches.
 * Task 21 deletes this file and its snapshots once the docs land: they guard the transition, not
 * the future; the switch-off cases become plain "renders no ring/hairline" assertions.
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

beforeEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
});
afterEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
});

describe('Factory with every WORLD_GEM piece off renders as it did before the material', () => {
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
      expect(markup(actor, hour)).toMatchSnapshot();
    });
  });

  describe.each([
    ['9 am', 9],
    ['10 pm', 22],
  ])('every rooftop greeble at %s', (_name, hour) => {
    it.each(ROOFTOPS)('%s', (rooftopGreeble) => {
      const actor = makeActor({ rooftopGreeble, facadeGreeble: undefined }, IDS.Skyscraper);
      expect(markup(actor, hour)).toMatchSnapshot();
    });
  });

  describe('every facade greeble at 9 am', () => {
    it.each(FACADES)('%s, no belt courses', (facadeGreeble) => {
      const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble, beltCourseCount: 0 }, IDS.Stacks);
      expect(markup(actor, 9)).toMatchSnapshot();
    });

    it.each([1, 2, 3])('squareWindows with %i belt courses', (beltCourseCount) => {
      const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: 'squareWindows', beltCourseCount }, IDS.Skyscraper);
      expect(markup(actor, 9)).toMatchSnapshot();
    });
  });

  it('a bare building with no greebles at all', () => {
    const actor = makeActor({ rooftopGreeble: undefined, facadeGreeble: undefined }, IDS.Monolith);
    expect(markup(actor, 12)).toMatchSnapshot();
  });

  describe('derelict', () => {
    it('at night, with an antenna (its light is suppressed)', () => {
      const actor = makeActor({ rooftopGreeble: 'antennae', facadeGreeble: 'squareWindows', beltCourseCount: 1, derelict: true }, IDS.Stacks);
      expect(markup(actor, 22)).toMatchSnapshot();
    });

    it('by day, with a pitched roof', () => {
      const actor = makeActor({ rooftopGreeble: 'pitchedRoof', facadeGreeble: 'wideWindows', derelict: true }, IDS.Warehouse);
      expect(markup(actor, 9)).toMatchSnapshot();
    });
  });

  describe('background and midground rows', () => {
    it('dense row 2 (background) at noon', () => {
      const actor = makeActor({ district: 'dense', row: 2, rooftopGreeble: 'crownSpire', facadeGreeble: 'tallWindows' }, IDS.Monolith);
      expect(markup(actor, 12)).toMatchSnapshot();
    });

    it('dense row 2 (background) at 9 am', () => {
      const actor = makeActor({ district: 'dense', row: 2, rooftopGreeble: 'pitchedRoof', facadeGreeble: 'squareWindows' }, IDS.Monolith);
      expect(markup(actor, 9)).toMatchSnapshot();
    });

    it('dense row 10 (foreground) at 9 am', () => {
      const actor = makeActor({ district: 'dense', row: 10, rooftopGreeble: 'steppeRoof', facadeGreeble: 'squareWindows' }, IDS.Monolith);
      expect(markup(actor, 9)).toMatchSnapshot();
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
      expect(markup(actor, 9)).toMatchSnapshot();
    });
  });

  it('hue and saturation shifts', () => {
    const actor = makeActor({ hueShift: 25, satShift: -10, rooftopGreeble: 'machinery', facadeGreeble: 'wideWindows' }, IDS.Refinery);
    expect(markup(actor, 9)).toMatchSnapshot();
  });
});
