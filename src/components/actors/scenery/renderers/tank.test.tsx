import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { tank } from './tank';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'tank-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'tank', district: 'outskirts', row: 5, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: { tank: { w: 120, h: 200, corner: 0.5, beltCourses: 2, hueShift: 10, satShift: -5 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('tank renderer', () => {
  it('renders under data-scenery="tank"', () => {
    const { container } = render(tank(makeCtx()));
    expect(container.querySelector('[data-scenery="tank"]')).not.toBeNull();
  });

  it('two faces with differing west/east fills at a non-noon hour', () => {
    const { container } = render(tank(makeCtx()));
    const polys = container.querySelectorAll('[data-scenery="tank"] polygon');
    expect(polys.length).toBe(2);
    expect(polys[0].getAttribute('fill')).not.toBe(polys[1].getAttribute('fill'));
  });

  it('renders one belt course rect per params.beltCourses', () => {
    const { container } = render(tank(makeCtx({ params: { tank: { w: 120, h: 200, corner: 0.5, beltCourses: 3, hueShift: 10, satShift: -5 } } })));
    const rects = container.querySelectorAll('[data-scenery="tank"] rect');
    expect(rects.length).toBe(3);
  });

  it("shoulder polygon edges include a 45° run of exactly the shoulder length (0.3 w)", () => {
    const { container } = render(tank(makeCtx()));
    const west = container.querySelector('[data-scenery="tank"] polygon')!;
    const points = (west.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let foundDiagonal = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx > 0 && dy > 0) {
        expect(dx).toBeCloseTo(dy, 6);
        expect(dx).toBeCloseTo(120 * 0.3, 6); // w * SHOULDER_FRACTION
        foundDiagonal = true;
      }
    }
    expect(foundDiagonal).toBe(true);
  });

  it('gauge circle is lit (indicator.powered, lamped) when not derelict, and the plain indicator.off colour when derelict', () => {
    const notDerelict = render(tank(makeCtx()));
    const derelict = render(
      tank(
        makeCtx({
          actor: {
            id: 'tank-derelict',
            type: ActorType.SCENERY,
            position: { x: 500, y: 1030 },
            isActive: false,
            cooldownRemaining: 0,
            config: { kind: 'tank', district: 'outskirts', row: 5, hueShift: 10, satShift: -5, derelict: true },
          },
        }),
      ),
    );
    const litFill = notDerelict.container.querySelector('[data-scenery="tank"] circle')?.getAttribute('fill');
    const offFill = derelict.container.querySelector('[data-scenery="tank"] circle')?.getAttribute('fill');
    expect(litFill).not.toBe(offFill);
    // Powered reads brighter than off at any nightDepth (lamp() floors at 0.5x vs off's flat 1x
    // on a much darker base) — a loose but real distinguishing property, not a hardcoded string.
    const litL = Number(litFill?.match(/,\s*([\d.]+)%\)/)?.[1]);
    const offL = Number(offFill?.match(/,\s*([\d.]+)%\)/)?.[1]);
    expect(litL).toBeGreaterThan(offL);
  });

  it('derelict: body saturation is 40% of a non-derelict twin (DERELICT_SAT) — cap is already folded into ctx.cap by Scenery.tsx', () => {
    const derelictActor: Actor = {
      id: 'tank-sat-derelict',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'tank', district: 'outskirts', row: 5, hueShift: 0, satShift: 0, derelict: true },
    };
    const liveActor: Actor = { ...derelictActor, id: 'tank-sat-live', config: { ...derelictActor.config, derelict: undefined } };

    // Same cap for both — isolates the saturation effect from the depth-cap multiply, which
    // Scenery.tsx (not this renderer) is responsible for folding into ctx.cap.
    const derelict = render(tank(makeCtx({ actor: derelictActor, cap: 1, eastL: 1, westL: 1 })));
    const live = render(tank(makeCtx({ actor: liveActor, cap: 1, eastL: 1, westL: 1 })));

    const derelictFill = derelict.container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    const liveFill = live.container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    const derelictSat = Number(derelictFill?.match(/,\s*([\d.]+)%,/)?.[1]);
    const liveSat = Number(liveFill?.match(/,\s*([\d.]+)%,/)?.[1]);
    expect(liveSat).toBeGreaterThan(0);
    expect(derelictSat).toBeCloseTo(liveSat * 0.4, 0);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: {
          tank: {
            w: 90 + i, h: 140 + i * 2, corner: 0.35 + (i % 10) / 33, beltCourses: 1 + (i % 3),
            hueShift: -20 + (i % 40), satShift: -15 + (i % 30),
          },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(tank(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(tank(makeCtx({ cap: 0.7 })));
    const uncapped = render(tank(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });

  it('reads body colour from actor.config.hueShift/satShift (the placement-time fold), not params.tank', () => {
    const ctxDefault = makeCtx();
    const ctxDifferentConfigShift = makeCtx({
      actor: { ...ctxDefault.actor, config: { ...ctxDefault.actor.config, hueShift: 170, satShift: 40 } },
    });
    const a = render(tank(ctxDefault)).container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    const b = render(tank(ctxDifferentConfigShift)).container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    expect(a).not.toBe(b);
  });

  it('base body colour is colorTheme.shell.shadow (per §1.9: "body shell.shadow + shift")', () => {
    const zeroShiftActor: Actor = {
      id: 'tank-base',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'tank', district: 'outskirts', row: 5, hueShift: 0, satShift: 0 },
    };
    const { container } = render(tank(makeCtx({ actor: zeroShiftActor, cap: 1, eastL: 1, westL: 1 })));
    const fill = container.querySelector('[data-scenery="tank"] polygon')?.getAttribute('fill');
    const h = Number(fill?.match(/hsl\((\d+)/)?.[1]);
    expect(h).toBe(colorTheme.shell.shadow.h);
  });
});
