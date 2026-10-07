import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { boulder } from './boulder';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import { maxShapes } from '../sceneryParams';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'boulder-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 990 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'boulder', district: 'outskirts', row: 2 },
  };
  return {
    actor,
    params: { boulder: { w: 100, hFrac: 0.6, count: 3, hueShift: 8, satShift: -4 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0.4,
    accent: { primary: 180, secondary: 20 },
    gems: true,
    ...overrides,
  };
}

function gemGroups(container: ParentNode) {
  return Array.from(container.querySelectorAll('[data-scenery="boulder"] [data-shape="gem"]'));
}

describe('boulder renderer', () => {
  it('renders under data-scenery="boulder"', () => {
    const { container } = render(boulder(makeCtx()));
    expect(container.querySelector('[data-scenery="boulder"]')).not.toBeNull();
  });

  it('renders one gem per params.count', () => {
    const { container } = render(boulder(makeCtx({ params: { boulder: { w: 80, hFrac: 0.5, count: 2, hueShift: 0, satShift: 0 } } })));
    expect(gemGroups(container)).toHaveLength(2);
  });

  it('every gem sinks to the same bottom: actor.position.y + 8', () => {
    const { container } = render(boulder(makeCtx()));
    const expectedBottom = 990 + 8;
    for (const group of gemGroups(container)) {
      const outline = group.querySelector('polygon');
      const ys = (outline?.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => Number(pair.split(',')[1]));
      expect(Math.max(...ys)).toBeCloseTo(expectedBottom, 5);
    }
  });

  it('no lit element at any night depth (every gem is unlit, so its glow tracks cap, not lerp(0.9,1.6,nd))', () => {
    const dimFill = render(boulder(makeCtx({ nightDepth: 0, cap: 1 })))
      .container.querySelector('[data-scenery="boulder"] [data-shape="gem"] polygon')
      ?.getAttribute('fill');
    const brightFill = render(boulder(makeCtx({ nightDepth: 1, cap: 1 })))
      .container.querySelector('[data-scenery="boulder"] [data-shape="gem"] polygon')
      ?.getAttribute('fill');
    expect(dimFill).toBe(brightFill); // unlit glow depends on eastL/westL/cap only, not nightDepth
  });

  it('saturation stays at 12 +- 6 (never exceeds 18)', () => {
    for (const satShift of [-6, 0, 6]) {
      const { container } = render(boulder(makeCtx({ params: { boulder: { w: 80, hFrac: 0.5, count: 1, hueShift: 0, satShift } } })));
      const fill = container.querySelector('[data-scenery="boulder"] [data-shape="gem"] polygon')?.getAttribute('fill') ?? '';
      const sat = Number(/,\s*(\d+)%,/.exec(fill)?.[1]);
      expect(sat).toBeLessThanOrEqual(18);
    }
  });

  it('no NaN attributes and every non-rect edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { boulder: { w: 60 + i, hFrac: 0.5 + (i % 10) / 40, count: 1 + (i % 3), hueShift: -12 + (i % 24), satShift: -6 + (i % 12) } },
        eastL: 0.1 + (i % 10) / 10,
        westL: 0.9 - (i % 10) / 10,
      });
      const { container } = render(boulder(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it("maxShapes('boulder') covers the real rendered element count at the maximum count (3)", () => {
    const { container } = render(boulder(makeCtx({ params: { boulder: { w: 100, hFrac: 0.6, count: 3, hueShift: 0, satShift: 0 } } })));
    const shapes = container.querySelectorAll('[data-scenery="boulder"] polygon');
    expect(shapes.length).toBeLessThanOrEqual(maxShapes('boulder'));
  });

  it('renders nothing (an empty group) when params are missing', () => {
    const { container } = render(boulder(makeCtx({ params: {} })));
    expect(container.querySelector('[data-scenery="boulder"]')?.children.length).toBe(0);
  });
});
