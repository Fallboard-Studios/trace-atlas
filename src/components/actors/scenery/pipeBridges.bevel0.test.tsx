/**
 * With every WORLD_GEM piece off, a pipe bridge draws no hairline (docs/specs/WORLD_GEM_MATERIAL.md
 * §3). The pre-change snapshot that proved byte-identity through Task 17 was deleted in Task 21
 * once the material had landed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../material/worldGemMaterial', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../material/worldGemMaterial')>();
  return {
    ...actual,
    WORLD_GEM: { factories: false, massScenery: false, roofBoxes: false, terrain: false, members: false, others: false },
  };
});

import { PipeBridges } from './pipeBridges';
import { worldGemTraces } from '../material/ringTestHelpers';
import { createFactory, getRecipeRow } from '../../../systems/factoryPlacementSystem';
import { selectVariantFromSeed, VARIANT_CONF } from '../factoryVariants';
import { calcSilhouetteSize } from '../silhouetteUtils';
import type { Actor } from '../../../types/Actor';

function widthOf(id: string, x: number, row: number): number {
  const available = getRecipeRow('dense', row)?.variants;
  const { variant, noiseValue } = selectVariantFromSeed(id, x, row, available);
  return calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange).width;
}

/** Two factories in one row, `gap` apart along the facade. */
function pair(gap: number, row: number, suffix: string): Actor[] {
  const idA = `bridge-a-${suffix}`;
  const idB = `bridge-b-${suffix}`;
  const xA = 400;
  const xB = xA + widthOf(idA, xA, row) + gap;
  return [createFactory({ x: xA, y: 1000 }, row, 1, idA), createFactory({ x: xB, y: 1000 }, row, 1, idB)];
}

describe('pipe bridges with every WORLD_GEM piece off draw no hairline', () => {
  it('the mock really turns every piece off', async () => {
    const { WORLD_GEM } = await import('../material/worldGemMaterial');
    expect((Object.values(WORLD_GEM) as boolean[]).every((on) => on === false)).toBe(true);
  });

  it.each([
    [70, 0],
    [120, 0],
    [180, 1],
    [250, 2],
  ])('a pair with a %i gap in row %i', (gap, row) => {
    const factories = pair(gap, row, `${gap}-${row}`);
    const { container } = render(<svg><PipeBridges factories={factories} /></svg>);
    expect(container.querySelectorAll('[data-pipe-bridge]')).toHaveLength(1);
    expect(worldGemTraces(container.innerHTML)).toEqual([]);
  });

  it('a row of three factories bridged pairwise', () => {
    const a = pair(100, 0, 'chain-1');
    const c = createFactory({ x: a[1].position.x + widthOf(a[1].id, a[1].position.x, 0) + 140, y: 1000 }, 0, 1, 'bridge-c-chain');
    const { container } = render(<svg><PipeBridges factories={[...a, c]} /></svg>);
    expect(container.querySelectorAll('[data-pipe-bridge]').length).toBeGreaterThanOrEqual(1);
    expect(worldGemTraces(container.innerHTML)).toEqual([]);
  });

  it('no factories draws an empty group', () => {
    const { container } = render(<svg><PipeBridges factories={[]} /></svg>);
    expect(container.innerHTML).toBe('<svg><g data-scenery="pipe-bridges"></g></svg>');
  });
});
