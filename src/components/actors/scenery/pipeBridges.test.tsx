import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { PipeBridges } from './pipeBridges';
import { createFactory, getRecipeRow, DEFAULT_FACTORY_ROW } from '../../../systems/factoryPlacementSystem';
import { selectVariantFromSeed, VARIANT_CONF } from '../factoryVariants';
import { calcSilhouetteSize } from '../silhouetteUtils';
import { assertNinetyFortyFive } from './sceneryTestHelpers';
import type { Actor } from '../../../types/Actor';

/** Same silhouette derivation `PipeBridges`' own `geometryOf` uses — including the row's
 *  `variants` filter (a factory with no `config.district` falls back to 'dense', same as
 *  `createFactory`'s own defaults), so a fixture's assumed width/height always matches what
 *  the component actually computes for the same (id, x, row). */
function sizeOf(id: string, x: number, row: number) {
  const available = getRecipeRow('dense', row)?.variants;
  const { variant, noiseValue } = selectVariantFromSeed(id, x, row, available);
  return calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange);
}

/** Builds two factories, `gap` apart along the facade, in the same row. */
function pairAtGap(gap: number, row = DEFAULT_FACTORY_ROW, suffix = ''): [Actor, Actor] {
  const idA = `bridge-a${suffix}`;
  const idB = `bridge-b${suffix}`;
  const xA = 400;
  const { width: widthA } = sizeOf(idA, xA, row);
  const xB = xA + widthA + gap;
  const a = createFactory({ x: xA, y: 1000 }, row, 1, idA);
  const b = createFactory({ x: xB, y: 1000 }, row, 1, idB);
  return [a, b];
}

describe('PipeBridges', () => {
  it('bridges a pair with a 120 gap but not a 40 or 300 gap', () => {
    const [a40, b40] = pairAtGap(40, 0, '-40');
    const [a120, b120] = pairAtGap(120, 0, '-120');
    const [a300, b300] = pairAtGap(300, 0, '-300');

    const r40 = render(<PipeBridges factories={[a40, b40]} />);
    const r120 = render(<PipeBridges factories={[a120, b120]} />);
    const r300 = render(<PipeBridges factories={[a300, b300]} />);

    expect(r40.container.querySelectorAll('[data-pipe-bridge]').length).toBe(0);
    expect(r120.container.querySelectorAll('[data-pipe-bridge]').length).toBe(1);
    expect(r300.container.querySelectorAll('[data-pipe-bridge]').length).toBe(0);
  });

  it('the bar spans gap + 20 and the post reaches the lower base', () => {
    const row = 0;
    const idA = 'bridge-bar-a';
    const idB = 'bridge-bar-b';
    const xA = 300;
    const { width: widthA, height: heightA } = sizeOf(idA, xA, row);
    // createFactory rounds position.x (silhouetteUtils convention), so the facade gap actually
    // rendered can be a fraction off the nominal 150 — compute the real gap from the rounded
    // position, same as geometryOf does, rather than assuming the nominal value exactly.
    const xB = Math.round(xA + widthA + 150);
    const { height: heightB } = sizeOf(idB, xB, row);
    const gap = xB - (xA + widthA);
    const baseYA = 1000;
    const baseYB = 1030; // a physically lower (greater y) base than A's

    const a = createFactory({ x: xA, y: baseYA }, row, 1, idA);
    const b = createFactory({ x: xB, y: baseYB }, row, 1, idB);

    const { container } = render(<PipeBridges factories={[a, b]} />);
    const bar = container.querySelector('[data-pipe-bridge-part="bar"]')!;
    const post = container.querySelector('[data-pipe-bridge-part="post"]')!;

    expect(Number(bar.getAttribute('width'))).toBeCloseTo(gap + 20, 1);

    const roofA = baseYA - heightA;
    const roofB = baseYB - heightB;
    const higherRoof = Math.min(roofA, roofB);
    const barY = Number(bar.getAttribute('y'));
    expect(barY).toBeGreaterThanOrEqual(higherRoof + 40 - 0.01);
    expect(barY).toBeLessThan(higherRoof + 100);

    const lowerBase = Math.max(baseYA, baseYB);
    const postBottom = Number(post.getAttribute('y')) + Number(post.getAttribute('height'));
    expect(postBottom).toBeCloseTo(lowerBase, 1);
  });

  it('two seeds move the bar height within +40..+100 of the higher roof', () => {
    const row = 0;
    const samples: number[] = [];
    for (const suffix of ['seed-1', 'seed-2']) {
      const idA = `bridge-${suffix}-a`;
      const idB = `bridge-${suffix}-b`;
      const xA = 300;
      const { width: widthA, height: heightA } = sizeOf(idA, xA, row);
      const gap = 150;
      const xB = xA + widthA + gap;
      const { height: heightB } = sizeOf(idB, xB, row);
      const baseY = 1000;
      const a = createFactory({ x: xA, y: baseY }, row, 1, idA);
      const b = createFactory({ x: xB, y: baseY }, row, 1, idB);
      const { container } = render(<PipeBridges factories={[a, b]} />);
      const bar = container.querySelector('[data-pipe-bridge-part="bar"]')!;
      const barY = Number(bar.getAttribute('y'));
      const higherRoof = Math.min(baseY - heightA, baseY - heightB);
      samples.push(barY - higherRoof);
    }
    for (const offset of samples) {
      expect(offset).toBeGreaterThanOrEqual(40 - 0.01);
      expect(offset).toBeLessThan(100);
    }
    expect(samples[0]).not.toBeCloseTo(samples[1], 2);
  });

  it('only bridges x-adjacent pairs within the same row', () => {
    const [a, b] = pairAtGap(120, 0, '-row0');
    const [c, d] = pairAtGap(120, 1, '-row1');
    const { container } = render(<PipeBridges factories={[a, b, c, d]} />);
    expect(container.querySelectorAll('[data-pipe-bridge]').length).toBe(2);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeded pairs', () => {
    for (let i = 0; i < 50; i++) {
      const row = i % 4;
      const idA = `sweep-a-${i}`;
      const idB = `sweep-b-${i}`;
      const xA = 200 + i * 7;
      const { width: widthA } = sizeOf(idA, xA, row);
      const gap = 60 + (i % 20) * 10; // 60..250
      const xB = xA + widthA + gap;
      const a = createFactory({ x: xA, y: 1000 + (i % 5) * 5 }, row, 1, idA);
      const b = createFactory({ x: xB, y: 1000 + (i % 7) * 4 }, row, 1, idB);
      const { container } = render(<PipeBridges factories={[a, b]} />);
      assertNinetyFortyFive(container);
    }
  });
});
