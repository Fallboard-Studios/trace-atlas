/**
 * "Bevel 0 is proven, not promised" for the terrain (docs/specs/WORLD_GEM_MATERIAL.md §3, plan Task
 * 18): with every WORLD_GEM piece off, the terrain layer renders byte-for-byte as it did before the
 * ring existed. The snapshot beside this test was captured on the PRE-CHANGE TerrainLayer.tsx
 * (Task 18's RED step). Task 21 deletes this file and its snapshot once the docs land.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';

vi.mock('@/components/actors/material/worldGemMaterial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/actors/material/worldGemMaterial')>();
  return {
    ...actual,
    WORLD_GEM: { factories: false, massScenery: false, roofBoxes: false, terrain: false, members: false, others: false },
  };
});

import { TerrainLayer } from './TerrainLayer';
import { __clearTerrainProfileCache } from '@/systems/terrainProfile';
import { evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { useLocaleStore, DEFAULT_LOCALE } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import type { Locale } from '@/types/locale';

const LOCALES: Locale[] = [
  { ...DEFAULT_LOCALE, id: 'terrain-bevel0-a', coordinates: { x: -5, y: 9 } },
  { ...DEFAULT_LOCALE, id: 'terrain-bevel0-b', coordinates: { x: 40, y: -12 } },
  { ...DEFAULT_LOCALE, id: 'terrain-bevel0-c', coordinates: { x: 0, y: 0 } },
];

beforeEach(() => {
  __clearTerrainProfileCache();
  for (const l of LOCALES) evictLocaleNoiseMap(l.id);
  useLocaleStore.setState({ locales: Object.fromEntries(LOCALES.map((l) => [l.id, l])) });
});

afterEach(() => {
  act(() => useUIStore.setState({ activeLocaleLocalTime: null }));
  cleanup();
});

describe('terrain with every WORLD_GEM piece off renders as it did before the ring', () => {
  it('the mock really turns every piece off', async () => {
    const { WORLD_GEM } = await import('@/components/actors/material/worldGemMaterial');
    expect((Object.values(WORLD_GEM) as boolean[]).every((on) => on === false)).toBe(true);
  });

  describe.each(LOCALES.map((l) => l.id))('%s', (localeId) => {
    describe.each(['ridge', 'ground'] as const)('%s', (part) => {
      it.each([
        ['9 am', 9],
        ['noon', 12],
        ['10 pm', 22],
      ])('at %s', (_name, hour) => {
        act(() => useUIStore.getState().setActiveLocaleLocalTime(hour));
        const { container } = render(<svg><TerrainLayer localeId={localeId} part={part} width={1920} height={1080} /></svg>);
        expect(container.innerHTML).toMatchSnapshot();
      });
    });
  });

  it('an unknown locale draws nothing', () => {
    const { container } = render(<svg><TerrainLayer localeId="no-such-locale" part="ridge" width={1920} height={1080} /></svg>);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
