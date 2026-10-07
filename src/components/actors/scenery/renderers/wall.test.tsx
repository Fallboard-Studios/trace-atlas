import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { wall } from './wall';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'wall-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'wall', district: 'outskirts', row: 7, hueShift: 50, satShift: -15 },
  };
  return {
    actor,
    params: { wall: { w: 200, h: 50, hueShift: 50, satShift: -15 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('wall renderer', () => {
  it('renders under data-scenery="wall"', () => {
    const { container } = render(wall(makeCtx()));
    expect(container.querySelector('[data-scenery="wall"]')).not.toBeNull();
  });

  it('two faces with differing west/east fills at a non-noon hour', () => {
    const { container } = render(wall(makeCtx()));
    const rects = container.querySelectorAll('[data-scenery="wall"] rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(rects[0].getAttribute('fill')).not.toBe(rects[1].getAttribute('fill'));
  });

  it('cap rail is present at the row thickness', () => {
    const { container } = render(wall(makeCtx()));
    const rects = Array.from(container.querySelectorAll('[data-scenery="wall"] rect'));
    expect(rects.some((r) => r.getAttribute('height') === '5')).toBe(true);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { wall: { w: 160 + i * 5, h: 28 + i, hueShift: 40 + (i % 20), satShift: -(i % 30) } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(wall(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(wall(makeCtx({ cap: 0.7 })));
    const uncapped = render(wall(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-scenery="wall"] rect')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-scenery="wall"] rect')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
