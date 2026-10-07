import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { tether } from './tether';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'tether-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'tether', district: 'habitat', row: 9 },
  };
  return {
    actor,
    params: { tether: { w: 36, h1: 200, dx: 60, hasFloat: true } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('tether renderer', () => {
  it('renders under data-scenery="tether"', () => {
    const { container } = render(tether(makeCtx()));
    expect(container.querySelector('[data-scenery="tether"]')).not.toBeNull();
  });

  it("the dog-leg polygon's slanted edges are 45° with |dx| matching params.dx", () => {
    const { container } = render(tether(makeCtx({ params: { tether: { w: 36, h1: 200, dx: 72, hasFloat: false } } })));
    const dogleg = container.querySelector('[data-tether="dogleg"]')!;
    const points = (dogleg.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let foundSpecLength = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx > 1 && dy > 1) {
        expect(dx).toBeCloseTo(dy, 6);
        if (Math.abs(dx - 72) < 0.01) foundSpecLength = true;
      }
    }
    expect(foundSpecLength).toBe(true);
  });

  it('the top segment ends at y = -20 (off frame)', () => {
    const { container } = render(tether(makeCtx()));
    const riser = container.querySelector('[data-tether="riser"]')!;
    const top = Number(riser.getAttribute('y'));
    expect(top).toBeCloseTo(-20, 1);
  });

  it('float is present when hasFloat is true, absent when false', () => {
    const withFloat = render(tether(makeCtx({ params: { tether: { w: 36, h1: 200, dx: 60, hasFloat: true } } })));
    const withoutFloat = render(tether(makeCtx({ params: { tether: { w: 36, h1: 200, dx: 60, hasFloat: false } } })));
    expect(withFloat.container.querySelector('[data-tether="float"]')).not.toBeNull();
    expect(withoutFloat.container.querySelector('[data-tether="float"]')).toBeNull();
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { tether: { w: 36, h1: 120 + i * 4, dx: 40 + (i % 50), hasFloat: i % 2 === 0 } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(tether(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(tether(makeCtx({ cap: 0.7 })));
    const uncapped = render(tether(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-tether="anchor"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-tether="anchor"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
