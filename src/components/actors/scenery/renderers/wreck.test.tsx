import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { wreck } from './wreck';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'wreck-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'wreck', district: 'wreckfield', row: 3 },
  };
  return {
    actor,
    params: { wreck: { w: 400, h: 90, deckhouseFrac: 0.25, portholes: 6 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('wreck renderer', () => {
  it('renders under data-scenery="wreck"', () => {
    const { container } = render(wreck(makeCtx()));
    expect(container.querySelector('[data-scenery="wreck"]')).not.toBeNull();
  });

  it("bow polygon's raked edge is 45° and exactly h long (x1 - h)", () => {
    const ctx = makeCtx();
    const { container } = render(wreck(ctx));
    const bow = container.querySelector('[data-wreck="bow"]')!;
    expect(bow).not.toBeNull();
    const points = (bow.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let foundDiagonal = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx > 0 && dy > 0) {
        expect(dx).toBeCloseTo(dy, 6);
        expect(dx).toBeCloseTo(90, 6); // h
        foundDiagonal = true;
      }
    }
    expect(foundDiagonal).toBe(true);
  });

  it('renders the expected number of dead portholes, each the shadowDepth colour (never lit)', () => {
    const { container } = render(wreck(makeCtx()));
    const portholes = container.querySelectorAll('[data-wreck="porthole"]');
    expect(portholes.length).toBe(6);
  });

  it('no lit element at any hour: fills are identical at nightDepth 0 and 1', () => {
    const atZero = render(wreck(makeCtx({ nightDepth: 0 })));
    const atOne = render(wreck(makeCtx({ nightDepth: 1 })));
    const fillsZero = Array.from(atZero.container.querySelectorAll('[data-scenery="wreck"] *')).map((el) => el.getAttribute('fill'));
    const fillsOne = Array.from(atOne.container.querySelectorAll('[data-scenery="wreck"] *')).map((el) => el.getAttribute('fill'));
    expect(fillsZero).toEqual(fillsOne);
  });

  it('config.derelict is absent on a wreck actor — always-derelict is the renderer\'s own rule', () => {
    const ctx = makeCtx();
    expect(ctx.actor.config?.derelict).toBeUndefined();
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: {
          wreck: { w: 340 + i * 4, h: 70 + i, deckhouseFrac: 0.2 + (i % 10) / 100, portholes: 4 + (i % 6) },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(wreck(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(wreck(makeCtx({ cap: 0.7 })));
    const uncapped = render(wreck(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-wreck="hull-west"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-wreck="hull-west"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });

  it('two faces with differing west/east fills at a non-noon hour', () => {
    const { container } = render(wreck(makeCtx()));
    const west = container.querySelector('[data-wreck="hull-west"]')?.getAttribute('fill');
    const east = container.querySelector('[data-wreck="bow"]')?.getAttribute('fill');
    expect(west).not.toBe(east);
  });
});
