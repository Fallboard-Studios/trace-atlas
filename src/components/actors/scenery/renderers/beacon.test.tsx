import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { beacon } from './beacon';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import { maxShapes } from '../sceneryParams';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'beacon-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'beacon', district: 'outskirts', row: 9 },
  };
  return {
    actor,
    params: { beacon: { w: 60, mastH: 160, gemW: 48 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0.4,
    accent: { primary: 180, secondary: 20 },
    gems: true,
    ...overrides,
  };
}

describe('beacon renderer', () => {
  it('renders under data-scenery="beacon"', () => {
    const { container } = render(beacon(makeCtx()));
    expect(container.querySelector('[data-scenery="beacon"]')).not.toBeNull();
  });

  it('mast and foot plus a gem head', () => {
    const { container } = render(beacon(makeCtx()));
    const rects = container.querySelectorAll('[data-scenery="beacon"] rect');
    expect(rects).toHaveLength(2);
    expect(container.querySelector('[data-scenery="beacon"] [data-shape="gem"]')).not.toBeNull();
  });

  it('the gem sits on top of the mast (fully above the mast top)', () => {
    const mastTopY = 1030 - 160; // actor.position.y - params.beacon.mastH
    const { container } = render(beacon(makeCtx()));
    const gemOutline = container.querySelector('[data-scenery="beacon"] [data-shape="gem"] polygon');
    const ys = (gemOutline?.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => Number(pair.split(',')[1]));
    expect(Math.max(...ys)).toBeLessThanOrEqual(mastTopY);
  });

  it('no NaN attributes and every non-rect edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { beacon: { w: 60, mastH: 120 + i * 2, gemW: 40 + (i % 24) } },
        eastL: 0.1 + (i % 10) / 10,
        westL: 0.9 - (i % 10) / 10,
        nightDepth: (i % 10) / 10,
      });
      const { container } = render(beacon(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it("maxShapes('beacon') covers the real rendered element count", () => {
    const { container } = render(beacon(makeCtx()));
    const shapes = container.querySelectorAll('[data-scenery="beacon"] polygon, [data-scenery="beacon"] rect, [data-scenery="beacon"] circle');
    expect(shapes.length).toBeLessThanOrEqual(maxShapes('beacon'));
  });

  it('renders nothing (an empty group) when params are missing', () => {
    const { container } = render(beacon(makeCtx({ params: {} })));
    expect(container.querySelector('[data-scenery="beacon"]')?.children.length).toBe(0);
  });
});
