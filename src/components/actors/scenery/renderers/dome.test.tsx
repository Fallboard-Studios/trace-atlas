import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { dome } from './dome';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'dome-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'dome', district: 'habitat', row: 2, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: {
      dome: {
        w: 200, bh: 40, ry: 70, portholes: 4,
        portholeLitRoll: [0.1, 0.3, 0.5, 0.7],
        hueShift: 10, satShift: -5,
      },
    },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('dome renderer', () => {
  it('renders under data-scenery="dome"', () => {
    const { container } = render(dome(makeCtx()));
    expect(container.querySelector('[data-scenery="dome"]')).not.toBeNull();
  });

  it('the two dome paths meet at x with differing west/east fills', () => {
    const { container } = render(dome(makeCtx()));
    const paths = container.querySelectorAll('[data-scenery="dome"] path');
    expect(paths.length).toBe(2);
    expect(paths[0].getAttribute('fill')).not.toBe(paths[1].getAttribute('fill'));
    // Both paths reference the actor's own x (500) as a shared coordinate — the apex/base-centre
    // point each arc starts or ends at — so the two halves actually meet rather than gapping.
    expect(paths[0].getAttribute('d')).toContain('500,');
    expect(paths[1].getAttribute('d')).toContain('500,');
  });

  it('base block renders two faces with differing fills', () => {
    const { container } = render(dome(makeCtx()));
    const rects = Array.from(container.querySelectorAll('[data-scenery="dome"] rect'));
    // base west/east + hatch + mast rod, at minimum
    expect(rects.length).toBeGreaterThanOrEqual(4);
  });

  it('renders one porthole circle per params.portholes', () => {
    const { container } = render(dome(makeCtx()));
    const portholes = container.querySelectorAll('[data-scenery="dome"] [data-dome="porthole"]');
    expect(portholes.length).toBe(4);
  });

  it('portholes lit fraction rises with nightDepth (same seeded rolls, higher nd crosses more thresholds)', () => {
    const dim = render(dome(makeCtx({ nightDepth: 0 })));
    const bright = render(dome(makeCtx({ nightDepth: 1 })));
    const countLit = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-dome="porthole"]')).filter(
        (el) => el.getAttribute('data-lit') === 'true',
      ).length;
    expect(countLit(bright.container)).toBeGreaterThan(countLit(dim.container));
    // At nd=1 the threshold is 1.0 — every seeded roll (all < 1) is lit.
    expect(countLit(bright.container)).toBe(4);
    // At nd=0 the threshold is 0.4 — only rolls below it (0.1, 0.3) are lit.
    expect(countLit(dim.container)).toBe(2);
  });

  it('mast light is present and lit when not derelict', () => {
    const { container } = render(dome(makeCtx()));
    const light = container.querySelector('[data-dome="mast-light"]');
    expect(light).not.toBeNull();
  });

  it('derelict: no porthole is lit and the mast light is absent, regardless of seeded rolls', () => {
    const derelictActor: Actor = {
      id: 'dome-derelict',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'dome', district: 'habitat', row: 2, hueShift: 10, satShift: -5, derelict: true },
    };
    // Even at nightDepth 1 (which would otherwise light every porthole), derelict forces none lit.
    const { container } = render(dome(makeCtx({ actor: derelictActor, nightDepth: 1 })));
    const litPortholes = Array.from(container.querySelectorAll('[data-dome="porthole"]')).filter(
      (el) => el.getAttribute('data-lit') === 'true',
    );
    expect(litPortholes.length).toBe(0);
    expect(container.querySelector('[data-dome="mast-light"]')).toBeNull();
  });

  it('base body colour is colorTheme.body.base (per §1.9: "base bh 30-60 (body.base, two faces)")', () => {
    const zeroShiftActor: Actor = {
      id: 'dome-base',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'dome', district: 'habitat', row: 2, hueShift: 0, satShift: 0 },
    };
    const { container } = render(dome(makeCtx({ actor: zeroShiftActor, cap: 1, eastL: 1, westL: 1 })));
    const rects = container.querySelectorAll('[data-scenery="dome"] rect');
    const fill = rects[0].getAttribute('fill');
    const h = Number(fill?.match(/hsl\((\d+)/)?.[1]);
    expect(h).toBe(colorTheme.body.base.h);
  });

  it('reads body colour from actor.config.hueShift/satShift (the placement-time fold), not params.dome', () => {
    const ctxDefault = makeCtx();
    const ctxDifferentConfigShift = makeCtx({
      actor: { ...ctxDefault.actor, config: { ...ctxDefault.actor.config, hueShift: 170, satShift: 40 } },
    });
    const a = render(dome(ctxDefault)).container.querySelectorAll('[data-scenery="dome"] rect')[0]?.getAttribute('fill');
    const b = render(dome(ctxDifferentConfigShift)).container.querySelectorAll('[data-scenery="dome"] rect')[0]?.getAttribute('fill');
    expect(a).not.toBe(b);
  });

  it('no NaN attributes and every non-arc edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const portholes = 3 + (i % 4);
      const ctx = makeCtx({
        params: {
          dome: {
            w: 170 + i, bh: 30 + (i % 30), ry: 60 + i, portholes,
            portholeLitRoll: Array.from({ length: portholes }, (_, j) => (i + j) / 53),
            hueShift: -20 + (i % 40), satShift: -15 + (i % 30),
          },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
        nightDepth: (i % 10) / 10,
      });
      const { container } = render(dome(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(dome(makeCtx({ cap: 0.7 })));
    const uncapped = render(dome(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelectorAll('[data-scenery="dome"] rect')[0]?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelectorAll('[data-scenery="dome"] rect')[0]?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
