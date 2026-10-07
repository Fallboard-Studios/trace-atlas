import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { crane } from './crane';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'crane-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'crane', district: 'yard', row: 3 },
  };
  return {
    actor,
    params: { crane: { w: 300, h: 320, hangerFrac: 0.5 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('crane renderer', () => {
  it('renders under data-scenery="crane"', () => {
    const { container } = render(crane(makeCtx()));
    expect(container.querySelector('[data-scenery="crane"]')).not.toBeNull();
  });

  it('posts are lit west/east separately (differing fills at a non-noon hour)', () => {
    const { container } = render(crane(makeCtx()));
    const west = container.querySelector('[data-crane="post-west"]');
    const east = container.querySelector('[data-crane="post-east"]');
    expect(west).not.toBeNull();
    expect(east).not.toBeNull();
    expect(west!.getAttribute('fill')).not.toBe(east!.getAttribute('fill'));
  });

  it('knee brace carries a 45° run of the spec length (40)', () => {
    const { container } = render(crane(makeCtx()));
    const brace = container.querySelector('[data-crane="knee-brace"]')!;
    const points = (brace.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let foundSpecLength = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx > 1 && dy > 1) {
        expect(dx).toBeCloseTo(dy, 6);
        if (Math.abs(dx - 40) < 0.01) foundSpecLength = true;
      }
    }
    expect(foundSpecLength).toBe(true);
  });

  it("load hangs at hangerFrac × w from the tower's west edge", () => {
    const { container } = render(crane(makeCtx({ params: { crane: { w: 300, h: 320, hangerFrac: 0.25 } } })));
    const load = container.querySelector('[data-crane="load"]')!;
    const centerX = Number(load.getAttribute('x')) + Number(load.getAttribute('width')) / 2;
    // actor x = 500, half = 150 -> west edge = 350; hanger at 350 + 0.25*300 = 425
    expect(centerX).toBeCloseTo(500 - 150 + 0.25 * 300, 1);
  });

  it('beam-end light is present', () => {
    const { container } = render(crane(makeCtx()));
    expect(container.querySelector('[data-crane="beam-end-light"]')).not.toBeNull();
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { crane: { w: 220 + i * 3, h: 260 + i * 2, hangerFrac: 0.2 + (i % 10) / 15 } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(crane(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(crane(makeCtx({ cap: 0.7 })));
    const uncapped = render(crane(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-crane="post-west"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-crane="post-west"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
