import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { scaffold } from './scaffold';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'scaffold-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'scaffold', district: 'derelict', row: 5, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: { scaffold: { w: 200, h: 300, bays: 3, solidFrac: 0.3, hueShift: 10, satShift: -5 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

describe('scaffold renderer', () => {
  it('renders under data-scenery="scaffold"', () => {
    const { container } = render(scaffold(makeCtx()));
    expect(container.querySelector('[data-scenery="scaffold"]')).not.toBeNull();
  });

  it('solid-lower block has two faces with differing fills at a non-noon hour', () => {
    const { container } = render(scaffold(makeCtx()));
    const solid = container.querySelectorAll('[data-scaffold="solid"]');
    expect(solid.length).toBe(2);
    expect(solid[0].getAttribute('fill')).not.toBe(solid[1].getAttribute('fill'));
  });

  it('brace polygons are 45° parallelograms of length min(bay, 60)', () => {
    const { container } = render(scaffold(makeCtx()));
    const braces = container.querySelectorAll('[data-scaffold="brace"]');
    expect(braces.length).toBeGreaterThan(0);
    const bayWidth = 200 / 3;
    const expectedRun = Math.min(bayWidth, 60);
    const brace = braces[0];
    const points = (brace.getAttribute('points') ?? '').trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
    let foundDiagonal = false;
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      if (dx > 0.01 && dy > 0.01 && Math.abs(dx - dy) < 0.01) {
        if (Math.abs(dx - expectedRun) < 0.5) foundDiagonal = true;
      }
    }
    expect(foundDiagonal).toBe(true);
  });

  it('braces only in alternating bays: count = ceil(bays * levels / 2), ±1', () => {
    const { container } = render(scaffold(makeCtx()));
    const braces = container.querySelectorAll('[data-scaffold="brace"]');
    const bays = 3;
    const levels = Math.max(1, Math.floor(300 / 60));
    const expected = Math.ceil((bays * levels) / 2);
    expect(Math.abs(braces.length - expected)).toBeLessThanOrEqual(1);
  });

  it('posts: one per bay boundary (bays + 1)', () => {
    const { container } = render(scaffold(makeCtx()));
    const posts = container.querySelectorAll('[data-scaffold="post"]');
    expect(posts.length).toBe(4); // bays(3) + 1
  });

  it('top-corner light is lit (alert.powered) when not derelict', () => {
    const { container } = render(scaffold(makeCtx()));
    expect(container.querySelector('[data-scaffold="light"]')).not.toBeNull();
  });

  it('derelict: frame recolors to shell.shadow and the top-corner light is absent', () => {
    const derelictActor: Actor = {
      id: 'scaffold-derelict',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'scaffold', district: 'derelict', row: 5, hueShift: 10, satShift: -5, derelict: true },
    };
    const live = render(scaffold(makeCtx()));
    const derelict = render(scaffold(makeCtx({ actor: derelictActor })));
    expect(derelict.container.querySelector('[data-scaffold="light"]')).toBeNull();
    const liveFrameFill = live.container.querySelector('[data-scaffold="post"]')?.getAttribute('fill');
    const derelictFrameFill = derelict.container.querySelector('[data-scaffold="post"]')?.getAttribute('fill');
    expect(liveFrameFill).not.toBe(derelictFrameFill);
  });

  it('derelict: solid-lower body saturation is 40% of a non-derelict twin (DERELICT_SAT)', () => {
    const derelictActor: Actor = {
      id: 'scaffold-sat-derelict',
      type: ActorType.SCENERY,
      position: { x: 500, y: 1030 },
      isActive: false,
      cooldownRemaining: 0,
      config: { kind: 'scaffold', district: 'derelict', row: 5, hueShift: 0, satShift: 0, derelict: true },
    };
    const liveActor: Actor = { ...derelictActor, id: 'scaffold-sat-live', config: { ...derelictActor.config, derelict: undefined } };
    const derelict = render(scaffold(makeCtx({ actor: derelictActor, cap: 1, eastL: 1, westL: 1 })));
    const live = render(scaffold(makeCtx({ actor: liveActor, cap: 1, eastL: 1, westL: 1 })));
    const derelictFill = derelict.container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    const liveFill = live.container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    const derelictSat = Number(derelictFill?.match(/,\s*([\d.]+)%,/)?.[1]);
    const liveSat = Number(liveFill?.match(/,\s*([\d.]+)%,/)?.[1]);
    expect(liveSat).toBeGreaterThan(0);
    expect(derelictSat).toBeCloseTo(liveSat * 0.4, 0);
  });

  it('reads body colour from actor.config.hueShift/satShift (the placement-time fold), not params.scaffold', () => {
    const ctxDefault = makeCtx();
    const ctxDifferentConfigShift = makeCtx({
      actor: { ...ctxDefault.actor, config: { ...ctxDefault.actor.config, hueShift: 170, satShift: 40 } },
    });
    const a = render(scaffold(ctxDefault)).container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    const b = render(scaffold(ctxDifferentConfigShift)).container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    expect(a).not.toBe(b);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = makeCtx({
        params: {
          scaffold: {
            w: 160 + i, h: 220 + i * 3, bays: 2 + (i % 2), solidFrac: 0.25 + (i % 10) / 50,
            hueShift: -20 + (i % 40), satShift: -15 + (i % 30),
          },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(scaffold(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(scaffold(makeCtx({ cap: 0.7 })));
    const uncapped = render(scaffold(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-scaffold="solid"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
