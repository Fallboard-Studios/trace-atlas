/**
 * With every WORLD_GEM piece off, each scenery family renders with no ring and no hairline
 * (docs/specs/WORLD_GEM_MATERIAL.md §3). The pre-change snapshots that proved byte-identity through
 * Tasks 13-17 were deleted in Task 21 once the material had landed (the crane's hanger, a <line>
 * before Task 16 and a <rect> after it whatever the switches, was the one deliberate difference).
 *
 * Real actors from the real district placer, through the real <Scenery> dispatcher, so depth caps,
 * derelicts, body shifts and every seeded parameter set are whatever the world produces.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('../material/worldGemMaterial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../material/worldGemMaterial')>();
  return {
    ...actual,
    WORLD_GEM: { factories: false, massScenery: false, roofBoxes: false, terrain: false, members: false, others: false },
  };
});

// The attenuation style's accent pair is seeded per run; the gem lamps on pylons, beacons and
// containers read it, so pin it (the placer's own shifts are pinned in beforeAll).
vi.mock('../../../systems/factoryPlacementSystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../systems/factoryPlacementSystem')>();
  return { ...actual, deriveAsAccentPair: () => ({ primary: 40, secondary: 200 }) };
});

import { Scenery } from './Scenery';
import { worldGemTraces } from '../material/ringTestHelpers';
import { placeDistrict } from '../../../systems/districts';
import { SIM_SEED_COORDS } from '../../../systems/lifecycleSim';
import { useAttenuationStyleStore } from '../../../stores/attenuationStyleStore';
import { useLocaleStore } from '../../../stores/localeStore';
import { useUIStore } from '../../../stores/uiStore';
import { ActorType, type Actor, type SceneryKind } from '../../../types/Actor';

const KINDS: SceneryKind[] = [
  'wall', 'pylon', 'beacon', 'boulder', 'tank', 'dome', 'scaffold', 'containers',
  'crane', 'pipeline', 'turbine', 'tether', 'floodlight', 'dish', 'wreck', 'vent',
];
const PER_KIND = 3;

let BY_KIND: Record<string, Actor[]> = {};
/** The first derelict actor of each family the sampled worlds produce (where there is one). */
let DEAD: Record<string, Actor | undefined> = {};

beforeAll(() => {
  useAttenuationStyleStore.setState({
    attenuationStyles: [{ id: 'pelagos', name: 'Pelagos', locales: [], currentLocaleId: null }],
    currentAttenuationStyleId: 'pelagos',
  } as never);
  BY_KIND = Object.fromEntries(KINDS.map((k) => [k, [] as Actor[]]));
  DEAD = {};
  for (const { x, y } of SIM_SEED_COORDS) {
    const id = `bevel0-${x}-${y}`;
    useLocaleStore.getState().addLocale('pelagos', {
      id, attenuationStyleId: 'pelagos', name: id, coordinates: { x, y },
      dayStartTimestamp: 0, createdAtMeasure: 0, robots: [], actors: [], companies: [],
    });
    for (const placed of placeDistrict(id)) {
      // The placer's body hue/sat shift varies from run to run (it reads the attenuation style's
      // noise); everything else it decides (position, row, size, derelict) is stable. Pin the shift.
      const a: Actor = placed.config
        ? { ...placed, config: { ...placed.config, ...(placed.config.hueShift !== undefined && { hueShift: 17 }), ...(placed.config.satShift !== undefined && { satShift: -6 }) } }
        : placed;
      const kind = a.config?.kind;
      if (a.type !== ActorType.SCENERY || !kind || !BY_KIND[kind]) continue;
      if (BY_KIND[kind].length < PER_KIND) BY_KIND[kind].push(a);
      if (a.config?.derelict && !DEAD[kind]) DEAD[kind] = a;
    }
  }
});

afterEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
});

function markup(actor: Actor, hour: number): string {
  act(() => useUIStore.getState().setActiveLocaleLocalTime(hour));
  const { container, unmount } = render(<svg><Scenery actor={actor} /></svg>);
  const html = container.innerHTML;
  unmount();
  return html;
}

/** Rendered for real (not blank) and no ring or hairline anywhere in it. */
function expectPlain(html: string): void {
  expect(html).toContain('data-scenery');
  expect(worldGemTraces(html)).toEqual([]);
}

describe('scenery with every WORLD_GEM piece off carries no trace of the material', () => {
  it('the mock really turns every piece off', async () => {
    const { WORLD_GEM } = await import('../material/worldGemMaterial');
    expect((Object.values(WORLD_GEM) as boolean[]).every((on) => on === false)).toBe(true);
  });

  it('found three actors of every family in the sampled worlds', () => {
    for (const kind of KINDS) expect(BY_KIND[kind].length, kind).toBe(PER_KIND);
  });

  describe.each([
    ['9 am', 9],
    ['noon', 12],
    ['10 pm', 22],
  ])('at %s', (_name, hour) => {
    describe.each(KINDS)('%s', (kind) => {
      it.each([0, 1, 2])('actor %i', (i) => {
        const actor = BY_KIND[kind][i];
        expectPlain(markup(actor, hour));
      });
    });
  });

  describe('derelict actors (desaturated body, dimmed cap, dark lamps)', () => {
    it('the sampled worlds produce derelict actors of at least three families (only a few families are ever placed derelict)', () => {
      expect(Object.values(DEAD).filter(Boolean).length).toBeGreaterThanOrEqual(3);
    });

    describe.each([
      ['9 am', 9],
      ['10 pm', 22],
    ])('at %s', (_name, hour) => {
      it.each(KINDS)('%s', (kind) => {
        const actor = DEAD[kind];
        if (!actor) return; // this family has no derelict placement in the sampled worlds
        expect(actor.config?.derelict).toBe(true);
        expectPlain(markup(actor, hour));
      });
    });
  });

  it('the samples span more than one row (so the depth caps are covered)', () => {
    const rows = new Set(KINDS.flatMap((k) => BY_KIND[k]).map((a) => a.config?.row));
    expect(rows.size).toBeGreaterThan(1);
  });
});
