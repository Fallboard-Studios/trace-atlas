import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { floodlight } from './floodlight';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'floodlight-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'floodlight', district: 'yard', row: 4 },
  };
  return {
    actor,
    params: { floodlight: { w: 40, mastH: 250, headOffset: 8 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('floodlight renderer', () => {
  it('renders under data-scenery="floodlight"', () => {
    const { container } = render(floodlight(makeCtx()));
    expect(container.querySelector('[data-scenery="floodlight"]')).not.toBeNull();
  });

  it('beam opacity is 0.04 at noon (nightDepth 0) and 0.16 at night (nightDepth 1)', () => {
    const noon = render(floodlight(makeCtx({ nightDepth: 0 })));
    const night = render(floodlight(makeCtx({ nightDepth: 1 })));
    const noonOpacity = Number(noon.container.querySelector('[data-floodlight="beam"]')?.getAttribute('opacity'));
    const nightOpacity = Number(night.container.querySelector('[data-floodlight="beam"]')?.getAttribute('opacity'));
    expect(noonOpacity).toBeCloseTo(0.04, 3);
    expect(nightOpacity).toBeCloseTo(0.16, 3);
  });

  it('the beam polygon has one vertical edge and one 45° edge', () => {
    const { container } = render(floodlight(makeCtx()));
    const beam = container.querySelector('[data-floodlight="beam"]')!;
    const points = (beam.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let hasVertical = false;
    let has45 = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx === 0 && dy > 0) hasVertical = true;
      if (dx > 0 && Math.abs(dx - dy) < 0.01) has45 = true;
    }
    expect(hasVertical).toBe(true);
    expect(has45).toBe(true);
  });

  it('ground pool opacity is 0.03 at noon and 0.13 at night', () => {
    const noon = render(floodlight(makeCtx({ nightDepth: 0 })));
    const night = render(floodlight(makeCtx({ nightDepth: 1 })));
    const noonOpacity = Number(noon.container.querySelector('[data-floodlight="pool"]')?.getAttribute('opacity'));
    const nightOpacity = Number(night.container.querySelector('[data-floodlight="pool"]')?.getAttribute('opacity'));
    expect(noonOpacity).toBeCloseTo(0.03, 3);
    expect(nightOpacity).toBeCloseTo(0.13, 3);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { floodlight: { w: 40, mastH: 190 + i * 2, headOffset: -14 + (i % 28) } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(floodlight(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the mast fill, so the cap really is applied', () => {
    const capped = render(floodlight(makeCtx({ cap: 0.7 })));
    const uncapped = render(floodlight(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-floodlight="mast"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-floodlight="mast"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
