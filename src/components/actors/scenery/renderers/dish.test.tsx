import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { dish } from './dish';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'dish-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'dish', district: 'habitat', row: 5 },
  };
  return {
    actor,
    params: { dish: { w: 80, rx: 40, postH: 130, tiltRight: true } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('dish renderer', () => {
  it('renders under data-scenery="dish"', () => {
    const { container } = render(dish(makeCtx()));
    expect(container.querySelector('[data-scenery="dish"]')).not.toBeNull();
  });

  it('the reflector ellipse is inside a rotate(45) or rotate(-45) group, sign following tiltRight', () => {
    const right = render(dish(makeCtx({ params: { dish: { w: 80, rx: 40, postH: 130, tiltRight: true } } })));
    const left = render(dish(makeCtx({ params: { dish: { w: 80, rx: 40, postH: 130, tiltRight: false } } })));

    const findRotateGroup = (container: HTMLElement) => {
      const ellipse = container.querySelector('[data-dish="reflector"]')!;
      let node: Element | null = ellipse.parentElement;
      while (node) {
        const transform = node.getAttribute('transform') ?? '';
        if (/rotate\(/.test(transform)) return transform;
        node = node.parentElement;
      }
      return null;
    };

    const rightTransform = findRotateGroup(right.container);
    const leftTransform = findRotateGroup(left.container);
    expect(rightTransform).toMatch(/rotate\(\s*45/);
    expect(leftTransform).toMatch(/rotate\(\s*-45/);
  });

  it('the ellipse ry is 0.32 × rx', () => {
    const { container } = render(dish(makeCtx()));
    const ellipse = container.querySelector('[data-dish="reflector"]')!;
    expect(Number(ellipse.getAttribute('rx'))).toBe(40);
    expect(Number(ellipse.getAttribute('ry'))).toBeCloseTo(40 * 0.32, 5);
  });

  it('a feed stub and a centre light are present', () => {
    const { container } = render(dish(makeCtx()));
    expect(container.querySelector('[data-dish="feed"]')).not.toBeNull();
    expect(container.querySelector('[data-dish="centre-light"]')).not.toBeNull();
  });

  it('no NaN attributes across 50 seeds (ellipse decoration excepted, per sceneryTestHelpers)', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { dish: { w: 60 + i, rx: 30 + (i % 18), postH: 90 + i * 2, tiltRight: i % 2 === 0 } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(dish(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the post fill, so the cap really is applied', () => {
    const capped = render(dish(makeCtx({ cap: 0.7 })));
    const uncapped = render(dish(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-dish="post"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-dish="post"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
