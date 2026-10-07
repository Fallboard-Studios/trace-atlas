import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { pylon } from './pylon';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import { maxShapes } from '../sceneryParams';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'pylon-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 990 },
    isActive: false,
    config: { kind: 'pylon', district: 'dense', row: 3 },
  };
  return {
    actor,
    params: { pylon: { w: 70, h: 320 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0.4,
    accent: { primary: 210, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

function allShapes(container: ParentNode) {
  return Array.from(container.querySelectorAll('[data-scenery="pylon"] polygon, [data-scenery="pylon"] rect, [data-scenery="pylon"] circle'));
}

describe('pylon renderer', () => {
  it('renders under data-scenery="pylon"', () => {
    const { container } = render(pylon(makeCtx()));
    expect(container.querySelector('[data-scenery="pylon"]')).not.toBeNull();
  });

  it('three cross-arms at 1/4, 2/4, 3/4 height steps, narrowing with height', () => {
    const { container } = render(pylon(makeCtx()));
    const arms = Array.from(container.querySelectorAll('[data-scenery="pylon"] rect'));
    expect(arms).toHaveLength(3);
    const widths = arms.map((a) => Number(a.getAttribute('width')));
    // Each successive arm (higher up, closer to the tapered top) is narrower than the last.
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it('head is a gem when gems are on', () => {
    const { container } = render(pylon(makeCtx({ gems: true })));
    expect(container.querySelector('[data-scenery="pylon"] [data-shape="gem"]')).not.toBeNull();
    expect(container.querySelector('[data-scenery="pylon"] circle')).toBeNull();
  });

  it('head is a plain indicator circle when gems are off', () => {
    const { container } = render(pylon(makeCtx({ gems: false })));
    expect(container.querySelector('[data-scenery="pylon"] [data-shape="gem"]')).toBeNull();
    expect(container.querySelector('[data-scenery="pylon"] circle')).not.toBeNull();
  });

  it('no NaN attributes and every non-rect edge is 90/45, across 50 seeds, for both gem states', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { pylon: { w: 60 + i * 0.6, h: 260 + i * 3.2 } },
        eastL: 0.1 + (i % 10) / 10,
        westL: 0.9 - (i % 10) / 10,
        nightDepth: (i % 10) / 10,
        gems: i % 2 === 0,
      });
      const { container } = render(pylon(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('maxShapes(\'pylon\') covers the real rendered element count (gem branch is the larger one)', () => {
    const { container } = render(pylon(makeCtx({ gems: true })));
    expect(allShapes(container).length).toBeLessThanOrEqual(maxShapes('pylon'));
  });

  it('mutation check: dropping the depth-cap multiply on the steel tone changes the fill', () => {
    const capped = render(pylon(makeCtx({ cap: 0.7, gems: false })));
    const uncapped = render(pylon(makeCtx({ cap: 1, gems: false })));
    const cappedFill = capped.container.querySelector('[data-scenery="pylon"] polygon')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-scenery="pylon"] polygon')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });

  it('renders nothing (an empty group) when params are missing', () => {
    const { container } = render(pylon(makeCtx({ params: {} })));
    expect(container.querySelector('[data-scenery="pylon"]')?.children.length).toBe(0);
  });
});
