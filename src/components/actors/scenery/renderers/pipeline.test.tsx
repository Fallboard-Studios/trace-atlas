import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { pipeline } from './pipeline';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'pipeline-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'pipeline', district: 'dense', row: 2 },
  };
  return {
    actor,
    params: { pipeline: { w: 500, d: 18, e: 46, riserH: 150, riserRight: true } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('pipeline renderer', () => {
  it('renders under data-scenery="pipeline"', () => {
    const { container } = render(pipeline(makeCtx()));
    expect(container.querySelector('[data-scenery="pipeline"]')).not.toBeNull();
  });

  it('stanchion count matches ⌊(w − 60) / 110⌋ + 1', () => {
    const cases = [320, 430, 500, 610, 720];
    for (const w of cases) {
      const { container } = render(
        pipeline(makeCtx({ params: { pipeline: { w, d: 18, e: 46, riserH: 150, riserRight: true } } })),
      );
      const stanchions = container.querySelectorAll('[data-pipeline="stanchion"]');
      expect(stanchions.length).toBe(Math.floor((w - 60) / 110) + 1);
    }
  });

  it('riser sits at the seeded side', () => {
    const right = render(
      pipeline(makeCtx({ params: { pipeline: { w: 500, d: 18, e: 46, riserH: 150, riserRight: true } } })),
    );
    const left = render(
      pipeline(makeCtx({ params: { pipeline: { w: 500, d: 18, e: 46, riserH: 150, riserRight: false } } })),
    );
    const riserRightX = Number(right.container.querySelector('[data-pipeline="riser"]')?.getAttribute('x'));
    const riserLeftX = Number(left.container.querySelector('[data-pipeline="riser"]')?.getAttribute('x'));
    expect(riserRightX).toBeGreaterThan(500);
    expect(riserLeftX).toBeLessThan(500);
  });

  it('valve circle is lit and varies with nightDepth', () => {
    const { container } = render(pipeline(makeCtx({ nightDepth: 0 })));
    const litValve = container.querySelector('[data-pipeline="valve"]')?.getAttribute('fill');
    const { container: darkContainer } = render(pipeline(makeCtx({ nightDepth: 1 })));
    const nightValve = darkContainer.querySelector('[data-pipeline="valve"]')?.getAttribute('fill');
    expect(litValve).not.toBe(nightValve);
  });

  it('no NaN attributes across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: {
          pipeline: {
            w: 320 + i * 8, d: 14 + (i % 8), e: 34 + (i % 26), riserH: 90 + i * 2, riserRight: i % 2 === 0,
          },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(pipeline(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the pipe fill, so the cap really is applied', () => {
    const capped = render(pipeline(makeCtx({ cap: 0.7 })));
    const uncapped = render(pipeline(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-pipeline="pipe"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-pipeline="pipe"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
