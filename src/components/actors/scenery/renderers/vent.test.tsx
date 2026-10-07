import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { vent } from './vent';
import { ventSteps } from '../sceneryParams';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'vent-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'vent', district: 'ventfield', row: 1 },
  };
  return {
    actor,
    params: { vent: { w: 80, steps: 5 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('vent renderer', () => {
  it('renders under data-scenery="vent"', () => {
    const { container } = render(vent(makeCtx()));
    expect(container.querySelector('[data-scenery="vent"]')).not.toBeNull();
  });

  it('step count equals params.vent.steps', () => {
    const { container } = render(vent(makeCtx()));
    const steps = container.querySelectorAll('[data-vent="step"]');
    expect(steps.length).toBe(5);
  });

  it('each step is narrower than the last by 0.9x, floored at 14', () => {
    const { container } = render(vent(makeCtx()));
    const steps = Array.from(container.querySelectorAll('[data-vent="step"]'));
    const widths = steps.map((s) => Number(s.getAttribute('width')));
    const expected = ventSteps({ w: 80, steps: 5 }).map((s) => s.width);
    expect(widths).toEqual(expected);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeCloseTo(Math.max(14, widths[i - 1] * 0.9), 6);
    }
  });

  it('a narrow base (below the 14 floor after one narrowing) still floors at 14, never shrinking to 0 or negative', () => {
    const { container } = render(vent(makeCtx({ params: { vent: { w: 16, steps: 6 } } })));
    const widths = Array.from(container.querySelectorAll('[data-vent="step"]')).map((s) => Number(s.getAttribute('width')));
    expect(Math.min(...widths)).toBe(14);
    expect(widths.every((w) => w > 0)).toBe(true);
  });

  it('mouth circle radius is 0.45x the top (narrowest) step width', () => {
    const { container } = render(vent(makeCtx()));
    const mouth = container.querySelector('[data-vent="mouth-glow"]')!;
    const topWidth = ventSteps({ w: 80, steps: 5 }).at(-1)!.width;
    expect(Number(mouth.getAttribute('r'))).toBeCloseTo(0.45 * topWidth, 6);
  });

  it('mouth circle opacity is 0.5 + 0.4 x nightDepth', () => {
    const atZero = render(vent(makeCtx({ nightDepth: 0 })));
    const atHalf = render(vent(makeCtx({ nightDepth: 0.5 })));
    const atOne = render(vent(makeCtx({ nightDepth: 1 })));
    expect(Number(atZero.container.querySelector('[data-vent="mouth-glow"]')?.getAttribute('opacity'))).toBeCloseTo(0.5, 6);
    expect(Number(atHalf.container.querySelector('[data-vent="mouth-glow"]')?.getAttribute('opacity'))).toBeCloseTo(0.7, 6);
    expect(Number(atOne.container.querySelector('[data-vent="mouth-glow"]')?.getAttribute('opacity'))).toBeCloseTo(0.9, 6);
  });

  it('plume ellipses are present and static (no transition styling)', () => {
    const { container } = render(vent(makeCtx()));
    const plumes = container.querySelectorAll('ellipse[data-vent="plume"]');
    expect(plumes.length).toBe(2);
    for (const plume of Array.from(plumes)) {
      expect((plume as SVGElement).getAttribute('style') ?? '').not.toMatch(/transition/);
    }
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: { vent: { w: 44 + i, steps: 4 + (i % 3) } },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(vent(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(vent(makeCtx({ cap: 0.7 })));
    const uncapped = render(vent(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-vent="step"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-vent="step"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
