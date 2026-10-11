/**
 * Each container box's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 14):
 * single-tone at the box's ambient light, drawn before the box's label square.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { containers } from './containers';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, p: Partial<NonNullable<SceneryContext['params']['containers']>> = {}): SceneryContext {
  const actor: Actor = {
    id: 'containers-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
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
        ...p,
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

const CTX = makeCtx(); // 3 + 2 + 1 boxes, 100 x 40
const SHIFT = { hueShift: 10, satShift: -5 };
const AMBIENT = (0.9 + 0.5) / 2;
const boxBase = (hue: number) => ({ h: hue, s: 35, l: 30 });
const tone = (hue: number, mult: number, shift = SHIFT) => applyColorShift(boxBase(hue), shift, mult);
const draw = (c: SceneryContext) => render(containers(c)).container;
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));
const cells = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-scenery="containers"] > g > g'));

describe('containers ring: one per box, before its label', () => {
  it('draws one ring per box (3 + 2 + 1 = 6) and no other ring', () => {
    const c = draw(CTX);
    expect(cells(c)).toHaveLength(6);
    expect(ringsIn(c)).toHaveLength(6);
  });

  it('puts each ring after its box and before its label, inside that box\'s own group', () => {
    for (const cell of cells(draw(CTX))) {
      expect(Array.from(cell.children).map((k) => k.getAttribute('data-gem') ?? k.getAttribute('data-container'))).toEqual(['box', 'ring', 'label']);
    }
  });

  it('rings exactly the box rect: its four edges are the box\'s four edges (4 facets, no split)', () => {
    for (const cell of cells(draw(CTX))) {
      const box = cell.querySelector('[data-container="box"]')!;
      const ring = ringsIn(cell)[0];
      const x = num(box, 'x');
      const y = num(box, 'y');
      expect(outerBox(ring)).toEqual({ x0: x, y0: y, x1: x + 100, y1: y + 40 });
      expect(facetsOfRing(ring)).toHaveLength(4);
    }
  });

  it('is 7.2 px deep on a 40 px box (18 % of the short side, under 8)', () => {
    const cell = cells(draw(CTX))[0];
    const box = cell.querySelector('[data-container="box"]')!;
    const x = num(box, 'x');
    const y = num(box, 'y');
    const top = facetOn(facetsOfRing(ringsIn(cell)[0]), [x, y], [x + 100, y])!;
    expect(top.pts[3][1] - y).toBeCloseTo(7.2, 1);
  });

  it('follows the box height across the generator\'s range: 36 gives 6.48, 44 gives 7.92', () => {
    for (const [boxH, depth] of [[36, 6.48], [44, 7.92]]) {
      const cell = cells(draw(makeCtx({}, { boxH })))[0];
      const box = cell.querySelector('[data-container="box"]')!;
      const x = num(box, 'x');
      const y = num(box, 'y');
      expect(facetOn(facetsOfRing(ringsIn(cell)[0]), [x, y], [x + 100, y])!.pts[3][1] - y).toBeCloseTo(depth, 1);
    }
  });

  it('rings the narrowest box (72 x 36) too', () => {
    const c = draw(makeCtx({}, { boxW: 72, boxH: 36 }));
    expect(ringsIn(c)).toHaveLength(6);
  });

  it('draws a ring on a lone box in a one-box row', () => {
    const c = draw(makeCtx({}, { cols: 1, rows: 1, rowOffsets: [0], labelLitRoll: [true] }));
    expect(ringsIn(c)).toHaveLength(1);
  });
});

describe('containers ring: single-tone at the ambient light', () => {
  it('top lit (1.25x), bottom shaded (0.5x), sides neutral (1.1x), all at the average of east and west', () => {
    const cell = cells(draw(CTX))[0];
    const box = cell.querySelector('[data-container="box"]')!;
    const x = num(box, 'x');
    const y = num(box, 'y');
    const f = facetsOfRing(ringsIn(cell)[0]);
    expect(facetOn(f, [x, y], [x + 100, y])!.fill).toBe(tone(0, AMBIENT * 1.25));
    expect(facetOn(f, [x + 100, y + 40], [x, y + 40])!.fill).toBe(tone(0, AMBIENT * 0.5));
    expect(facetOn(f, [x + 100, y], [x + 100, y + 40])!.fill).toBe(tone(0, AMBIENT * 1.1));
    expect(facetOn(f, [x, y + 40], [x, y])!.fill).toBe(tone(0, AMBIENT * 1.1));
  });

  it('leans with the hour: in the afternoon sun the west side is lit and the east shaded', () => {
    const pm = makeCtx({ eastL: 0.346, westL: 1.05 });
    const cell = cells(draw(pm))[0];
    const box = cell.querySelector('[data-container="box"]')!;
    const x = num(box, 'x');
    const y = num(box, 'y');
    const ambient = (0.346 + 1.05) / 2;
    const f = facetsOfRing(ringsIn(cell)[0]);
    expect(facetOn(f, [x, y + 40], [x, y])!.fill).toBe(tone(0, ambient * 1.25));
    expect(facetOn(f, [x + 100, y], [x + 100, y + 40])!.fill).toBe(tone(0, ambient * 0.5));
  });

  it('alternates the accent pair per box, so the ring takes the box\'s own hue', () => {
    const row = Array.from(draw(CTX).querySelectorAll('[data-container-row="0"] > g'));
    expect(row).toHaveLength(3);
    row.forEach((cell, col) => {
      const hue = col % 2 === 0 ? 0 : 30;
      const box = cell.querySelector('[data-container="box"]')!;
      const x = num(box, 'x');
      const y = num(box, 'y');
      expect(box.getAttribute('fill')).toBe(tone(hue, AMBIENT));
      expect(facetOn(facetsOfRing(ringsIn(cell)[0]), [x, y], [x + 100, y])!.fill).toBe(tone(hue, AMBIENT * 1.25));
    });
  });

  it('folds the depth cap in', () => {
    const cell = cells(draw(makeCtx({ cap: 0.7 })))[0];
    const box = cell.querySelector('[data-container="box"]')!;
    const x = num(box, 'x');
    const y = num(box, 'y');
    expect(facetOn(facetsOfRing(ringsIn(cell)[0]), [x, y], [x + 100, y])!.fill).toBe(tone(0, AMBIENT * 0.7 * 1.25));
  });

  it('applies the placement-time hue and saturation shift', () => {
    const base = makeCtx();
    const other = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, hueShift: 90, satShift: 15 } } });
    const cell = cells(draw(other))[0];
    const box = cell.querySelector('[data-container="box"]')!;
    const x = num(box, 'x');
    const y = num(box, 'y');
    expect(facetOn(facetsOfRing(ringsIn(cell)[0]), [x, y], [x + 100, y])!.fill).toBe(tone(0, AMBIENT * 1.25, { hueShift: 90, satShift: 15 }));
  });
});

describe('containers ring: what stays and what switches off', () => {
  it('without its rings the markup is exactly the switched-off containers: boxes and labels unchanged', () => {
    for (const c of [CTX, makeCtx({ nightDepth: 0.9 }), makeCtx({ cap: 0.6 })]) {
      const on = draw(c);
      let off = '';
      withSwitch('massScenery', false, () => {
        off = draw(c).innerHTML;
      });
      expect(markupWithoutRings(on)).toBe(off);
    }
  });

  it('with the switch off there is no ring at all', () => {
    withSwitch('massScenery', false, () => {
      expect(ringsIn(draw(CTX))).toHaveLength(0);
    });
  });

  it('draws no ring for an actor with no containers params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 pyramids', () => {
    for (let i = 0; i < 50; i++) {
      const cols = 2 + (i % 3);
      const rows = 1 + (i % 3);
      const c = draw(makeCtx(
        { eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 },
        { cols, rows, boxW: 72 + (i % 39), boxH: 36 + (i % 9), rowOffsets: [i % 11, (i * 3) % 11, (i * 5) % 11] },
      ));
      assertNinetyFortyFive(c);
      let boxes = 0;
      for (let r = 0; r < rows; r++) boxes += Math.max(1, cols - r);
      expect(ringsIn(c)).toHaveLength(boxes);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
