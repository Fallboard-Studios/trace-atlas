// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Alea from 'alea';

import { factoryGeometry } from './factoryGeometry';
import { Factory } from './Factory';
import { selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import { calcSilhouetteSize } from './silhouetteUtils';
import { createFactory, DEFAULT_FACTORY_ROW } from '../../systems/factoryPlacementSystem';
import { RECIPES } from '../../systems/districtRecipes';
import { ActorType, type Actor, type DistrictName } from '../../types/Actor';
import { useUIStore } from '../../stores/uiStore';

// ========================================
// HELPERS
// ========================================

/** Every factory row across the nine district recipes. */
const FACTORY_ROWS = (Object.keys(RECIPES) as DistrictName[]).flatMap((district) =>
  RECIPES[district]
    .map((cfg, row) => ({ district, row, cfg }))
    .filter((r) => r.cfg.kind === 'factory'),
);

/**
 * Fifty real factories (createFactory + the district the placer stamps), spread over every
 * factory row, with seeded x/y and — on every other one — unequal scaleX/scaleY so a swapped
 * axis can't pass.
 */
function seededFactories(n = 50): Actor[] {
  const prng = Alea('factory-geometry-parity');
  return Array.from({ length: n }, (_, i) => {
    const { district, row, cfg } = FACTORY_ROWS[i % FACTORY_ROWS.length];
    const x = Math.round(prng() * 1900);
    const y = Math.round(900 + prng() * 200);
    const actor = createFactory({ x, y }, row, 0.8 + prng() * 0.4, `geo-${i}`, undefined, undefined, cfg.variants);
    if (i % 2 === 1) actor.scaleY = 0.7 + prng() * 0.6;
    actor.config = { ...actor.config, district };
    return actor;
  });
}

function parseTranslate(t: string | null): { x: number; y: number } {
  const m = /translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(t ?? '');
  if (!m) throw new Error(`not a translate: ${t}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

function parseScale(t: string | null): { sx: number; sy: number } {
  const m = /scale\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(t ?? '');
  if (!m) throw new Error(`not a scale: ${t}`);
  return { sx: Number(m[1]), sy: Number(m[2]) };
}

/** The rendered outer group's translate plus its scaled 100×100 body, in scene units. */
function renderedBox(actor: Actor) {
  const { container, unmount } = render(<Factory actor={actor} />);
  const outer = container.querySelector('g[data-factory-type]');
  const scaled = outer?.querySelector(':scope > g[transform^="scale"]');
  const { x, y } = parseTranslate(outer?.getAttribute('transform') ?? null);
  const { sx, sy } = parseScale(scaled?.getAttribute('transform') ?? null);
  const variant = outer?.getAttribute('data-factory-type');
  unmount();
  return { variant, box: { x0: x, y0: y, x1: x + sx * 100, y1: y + sy * 100 } };
}

beforeEach(() => {
  useUIStore.setState({ activeLocaleLocalTime: 12 });
});

// ========================================
// TESTS
// ========================================
describe('factoryGeometry — the derivation', () => {
  it('matches selectVariantFromSeed + calcSilhouetteSize with the row\'s variant list', () => {
    for (const actor of seededFactories()) {
      const row = actor.config!.row!;
      const variants = RECIPES[actor.config!.district!][row].variants;
      const cfg = selectVariantFromSeed(actor.id, actor.position.x, row, variants);
      const { width, height } = calcSilhouetteSize(cfg.noiseValue, VARIANT_CONF[cfg.variant].sizeRange);
      const g = factoryGeometry(actor);
      expect(g.variant).toBe(cfg.variant);
      expect(g.width).toBe(width);
      expect(g.height).toBe(height);
      expect(g.frontCornerX).toBe(cfg.frontCornerX);
    }
  });

  it('the box spans x … x + w·sx and is bottom-anchored at the rendered y (y − h·sy, rounded)', () => {
    const actor: Actor = {
      id: 'geo-box',
      type: ActorType.FACTORY,
      position: { x: 300, y: 1000 },
      scaleX: 1.1,
      scaleY: 0.9,
      isActive: true,
      config: { district: 'dense', row: 5 },
    };
    const g = factoryGeometry(actor);
    expect(g.box.x0).toBe(300);
    expect(g.box.x1).toBeCloseTo(300 + g.width * 1.1, 9);
    expect(g.box.y0).toBe(Math.round(1000 - g.height * 0.9));
    expect(g.box.y1).toBeCloseTo(g.box.y0 + g.height * 0.9, 9);
    expect(Math.abs(g.box.y1 - 1000)).toBeLessThanOrEqual(0.5);
  });

  it('missing scale means 1 on both axes', () => {
    const actor: Actor = {
      id: 'geo-noscale',
      type: ActorType.FACTORY,
      position: { x: 50, y: 980 },
      isActive: true,
      config: { district: 'dense', row: 5 },
    };
    const g = factoryGeometry(actor);
    expect(g.box.x1 - g.box.x0).toBeCloseTo(g.width, 9);
    expect(g.box.y1 - g.box.y0).toBeCloseTo(g.height, 9);
  });

  it('an unresolvable row falls back to all five variants (dense, DEFAULT_FACTORY_ROW when row is missing)', () => {
    const noRow: Actor = { id: 'geo-norow', type: ActorType.FACTORY, position: { x: 10, y: 1000 }, isActive: true };
    const denseDefault = RECIPES.dense[DEFAULT_FACTORY_ROW].variants;
    expect(factoryGeometry(noRow).variant).toBe(
      selectVariantFromSeed('geo-norow', 10, DEFAULT_FACTORY_ROW, denseDefault).variant,
    );
    const outOfRange: Actor = { ...noRow, id: 'geo-row99', config: { row: 99 } };
    expect(factoryGeometry(outOfRange).variant).toBe(selectVariantFromSeed('geo-row99', 10, 99).variant);
  });

  it('is pure: same actor, same result; the actor is not mutated', () => {
    const [actor] = seededFactories(1);
    const before = JSON.stringify(actor);
    expect(factoryGeometry(actor)).toEqual(factoryGeometry(actor));
    expect(JSON.stringify(actor)).toBe(before);
  });
});

describe('factoryGeometry — render parity with Factory.tsx', () => {
  it('for 50 seeded factories, box = the rendered outer translate + scaled size, and variant matches', () => {
    for (const actor of seededFactories()) {
      const g = factoryGeometry(actor);
      const rendered = renderedBox(actor);
      expect(rendered.variant, actor.id).toBe(g.variant);
      expect(rendered.box.x0, actor.id).toBeCloseTo(g.box.x0, 6);
      expect(rendered.box.y0, actor.id).toBeCloseTo(g.box.y0, 6);
      expect(rendered.box.x1, actor.id).toBeCloseTo(g.box.x1, 6);
      expect(rendered.box.y1, actor.id).toBeCloseTo(g.box.y1, 6);
    }
  });
});
