/**
 * The crane's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 14): only the hanging
 * load is mass, and it rings single-tone at its ambient light. The posts, beam, knee brace and
 * hanger are members (Task 16's hairline), and take no ring.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { crane, craneLayout } from './crane';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, p: Partial<NonNullable<SceneryContext['params']['crane']>> = {}): SceneryContext {
  const actor: Actor = {
    id: 'crane-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'crane', district: 'yard', row: 3 },
  };
  return {
    actor,
    params: { crane: { w: 300, h: 320, hangerFrac: 0.5, ...p } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

const CTX = makeCtx();
const AMBIENT = (0.9 + 0.5) / 2;
const NO_SHIFT = { hueShift: 0, satShift: 0 };
const tone = (mult: number) => applyColorShift(colorTheme.vent.base, NO_SHIFT, mult);
const draw = (c: SceneryContext) => render(crane(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="crane"]')!;
const loadOf = (c: SceneryContext) => craneLayout(500, 1030, c.params.crane!).load;

describe('crane ring: the load, and nothing else', () => {
  it('draws exactly one ring, straight after the load and before the beam-end light', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(1);
    const tags = Array.from(g.children).map((k) => k.getAttribute('data-gem') ?? k.getAttribute('data-crane'));
    expect(tags).toEqual(['post-west', 'post-east', 'beam', 'knee-brace', 'hanger', 'load', 'ring', 'beam-end-light']);
  });

  it('rings exactly the load rect (4 facets, no split) at the hanger position', () => {
    for (const hangerFrac of [0.2, 0.5, 0.8]) {
      const c = makeCtx({}, { hangerFrac });
      const { x, y, w, h } = loadOf(c);
      const ring = ringsIn(draw(c))[0];
      expect(outerBox(ring)).toEqual({ x0: x, y0: y, x1: x + w, y1: y + h });
      expect(facetsOfRing(ring)).toHaveLength(4);
    }
  });

  it('is 8 px deep on the 80 x 50 load (18 % of 50 is 9, so the full 8)', () => {
    const { x, y, w } = loadOf(CTX);
    const top = facetOn(facetsOfRing(ringsIn(draw(CTX))[0]), [x, y], [x + w, y])!;
    expect(top.pts[3][1] - y).toBeCloseTo(8, 1);
  });

  it('puts no ring on the posts, beam, brace or hanger', () => {
    const g = group(draw(CTX));
    for (const part of ['post-west', 'post-east', 'beam', 'knee-brace', 'hanger']) {
      const el = g.querySelector(`[data-crane="${part}"]`)!;
      expect(el.querySelector('[data-gem="ring"]')).toBeNull();
    }
  });
});

describe('crane ring: light and colour', () => {
  it('top lit (1.25x), bottom shaded (0.5x), sides neutral (1.1x), at the average of east and west', () => {
    const { x, y, w, h } = loadOf(CTX);
    const f = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(f, [x, y], [x + w, y])!.fill).toBe(tone(AMBIENT * 1.25));
    expect(facetOn(f, [x + w, y + h], [x, y + h])!.fill).toBe(tone(AMBIENT * 0.5));
    expect(facetOn(f, [x + w, y], [x + w, y + h])!.fill).toBe(tone(AMBIENT * 1.1));
    expect(facetOn(f, [x, y + h], [x, y])!.fill).toBe(tone(AMBIENT * 1.1));
  });

  it('is the load\'s own colour (vent.base), not the steel of the frame (body.shadow x 1.2)', () => {
    const { x, y, w } = loadOf(CTX);
    const fill = facetOn(facetsOfRing(ringsIn(draw(CTX))[0]), [x, y], [x + w, y])!.fill;
    const steel = applyColorShift(colorTheme.body.shadow, NO_SHIFT, AMBIENT * 1.25 * 1.2);
    expect(fill).not.toBe(steel);
  });

  it('folds the depth cap in, and leans with the afternoon sun', () => {
    const { x, y, w, h } = loadOf(CTX);
    const capped = makeCtx({ cap: 0.7 });
    expect(facetOn(facetsOfRing(ringsIn(draw(capped))[0]), [x, y], [x + w, y])!.fill).toBe(tone(AMBIENT * 0.7 * 1.25));
    const pm = makeCtx({ eastL: 0.346, westL: 1.05 });
    const f = facetsOfRing(ringsIn(draw(pm))[0]);
    expect(facetOn(f, [x, y + h], [x, y])!.fill).toBe(tone(((0.346 + 1.05) / 2) * 1.25));
  });
});

describe('crane ring: what stays and what switches off', () => {
  it('without its ring the markup is exactly the switched-off crane', () => {
    for (const c of [CTX, makeCtx({ nightDepth: 0.9 }), makeCtx({ cap: 0.6 }), makeCtx({}, { hangerFrac: 0.2 })]) {
      const on = group(draw(c));
      let off = '';
      withSwitch('massScenery', false, () => {
        off = group(draw(c)).innerHTML;
      });
      expect(markupWithoutRings(on)).toBe(off);
    }
  });

  it('with the switch off there is no ring', () => {
    withSwitch('massScenery', false, () => {
      expect(ringsIn(draw(CTX))).toHaveLength(0);
    });
  });

  it('draws no ring for an actor with no crane params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 cranes', () => {
    for (let i = 0; i < 50; i++) {
      const c = draw(makeCtx(
        { eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 },
        { w: 220 + i * 3, h: 260 + i * 2, hangerFrac: 0.2 + (i % 13) * 0.05 },
      ));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(1);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
