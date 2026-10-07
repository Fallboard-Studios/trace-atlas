import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { containers } from './containers';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'containers-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind: 'containers', district: 'yard', row: 3, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: {
      containers: {
        w: 300, cols: 3, rows: 3, boxW: 100, boxH: 40,
        rowOffsets: [2, 5, 8],
        labelLitRoll: [true, false, true, false, true, false, true, false, true],
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

describe('containers renderer', () => {
  it('renders under data-scenery="containers"', () => {
    const { container } = render(containers(makeCtx()));
    expect(container.querySelector('[data-scenery="containers"]')).not.toBeNull();
  });

  it('upper rows have one fewer box than the row below', () => {
    const { container } = render(containers(makeCtx()));
    const row0 = container.querySelectorAll('[data-container-row="0"] [data-container="box"]');
    const row1 = container.querySelectorAll('[data-container-row="1"] [data-container="box"]');
    const row2 = container.querySelectorAll('[data-container-row="2"] [data-container="box"]');
    expect(row0.length).toBe(3);
    expect(row1.length).toBe(2);
    expect(row2.length).toBe(1);
  });

  it('adjacent boxes alternate hue between the pair', () => {
    const { container } = render(containers(makeCtx()));
    const boxes = Array.from(container.querySelectorAll('[data-container-row="0"] [data-container="box"]'));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    const fills = boxes.map((b) => b.getAttribute('fill'));
    expect(fills[0]).not.toBe(fills[1]);
    if (fills.length >= 3) {
      expect(fills[0]).toBe(fills[2]);
    }
  });

  it('one 7x7 label square per box', () => {
    const { container } = render(containers(makeCtx()));
    const boxes = container.querySelectorAll('[data-container="box"]');
    const labels = container.querySelectorAll('[data-container="label"]');
    expect(labels.length).toBe(boxes.length);
    expect(labels[0].getAttribute('width')).toBe('7');
    expect(labels[0].getAttribute('height')).toBe('7');
  });

  it('label fill reflects the seeded lit roll (lit vs off differ)', () => {
    const { container } = render(containers(makeCtx()));
    const labels = Array.from(container.querySelectorAll('[data-container="label"]'));
    const litFill = labels[0].getAttribute('fill'); // labelLitRoll[0] === true
    const offFill = labels[1].getAttribute('fill'); // labelLitRoll[1] === false
    expect(litFill).not.toBe(offFill);
  });

  it('box count matches the max(1, cols - row) pyramid: 3 + 2 + 1 = 6 boxes, 6 labels', () => {
    const { container } = render(containers(makeCtx()));
    expect(container.querySelectorAll('[data-container="box"]').length).toBe(6);
  });

  it('reads body colour from actor.config.hueShift/satShift (the placement-time fold), not params.containers', () => {
    const ctxDefault = makeCtx();
    const ctxDifferentConfigShift = makeCtx({
      actor: { ...ctxDefault.actor, config: { ...ctxDefault.actor.config, hueShift: 170, satShift: 40 } },
    });
    const a = render(containers(ctxDefault)).container.querySelector('[data-container="box"]')?.getAttribute('fill');
    const b = render(containers(ctxDifferentConfigShift)).container.querySelector('[data-container="box"]')?.getAttribute('fill');
    expect(a).not.toBe(b);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds', () => {
    for (let i = 0; i < 50; i++) {
      const cols = 2 + (i % 3);
      const rows = 1 + (i % 3);
      const ctx = makeCtx({
        params: {
          containers: {
            w: (72 + i) * cols, cols, rows, boxW: 72 + i, boxH: 36 + (i % 8),
            rowOffsets: Array.from({ length: rows }, (_, j) => (i + j) % 10),
            labelLitRoll: Array.from({ length: cols * rows }, (_, j) => (i + j) % 2 === 0),
            hueShift: -20 + (i % 40), satShift: -15 + (i % 30),
          },
        },
        eastL: 0.2 + (i % 10) / 10,
        westL: 0.8 - (i % 10) / 10,
      });
      const { container } = render(containers(ctx));
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied', () => {
    const capped = render(containers(makeCtx({ cap: 0.7 })));
    const uncapped = render(containers(makeCtx({ cap: 1 })));
    const cappedFill = capped.container.querySelector('[data-container="box"]')?.getAttribute('fill');
    const uncappedFill = uncapped.container.querySelector('[data-container="box"]')?.getAttribute('fill');
    expect(cappedFill).not.toBe(uncappedFill);
  });
});
