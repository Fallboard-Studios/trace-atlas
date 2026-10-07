import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { turbine } from './turbine';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'turbine-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'turbine', district: 'habitat', row: 2 },
  };
  return {
    actor,
    params: { turbine: { w: 150, postH: 220, bladeR: 75 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('turbine renderer', () => {
  it('renders under data-scenery="turbine"', () => {
    const { container } = render(turbine(makeCtx()));
    expect(container.querySelector('[data-scenery="turbine"]')).not.toBeNull();
  });

  it('blade rects are inside a rotate(45 …) group', () => {
    const { container } = render(turbine(makeCtx()));
    const blades = container.querySelectorAll('[data-turbine="blade"]');
    expect(blades.length).toBe(2);
    for (const blade of Array.from(blades)) {
      let node: Element | null = blade.parentElement;
      let found = false;
      while (node) {
        if (/rotate\(\s*45/.test(node.getAttribute('transform') ?? '')) {
          found = true;
          break;
        }
        node = node.parentElement;
      }
      expect(found).toBe(true);
    }
  });

  it('hub radius is 11', () => {
    const { container } = render(turbine(makeCtx()));
    const hub = container.querySelector('[data-turbine="hub"]');
    expect(hub?.getAttribute('r')).toBe('11');
  });

  it('hub light is present', () => {
    const { container } = render(turbine(makeCtx()));
    expect(container.querySelector('[data-turbine="hub-light"]')).not.toBeNull();
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { turbine: { w: 120 + i * 2, postH: 170 + i * 2, bladeR: 60 + (i % 36) } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(turbine(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(turbine(makeCtx({ cap: 0.7 })));
    const uncapped = render(turbine(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-turbine="post"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-turbine="post"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
