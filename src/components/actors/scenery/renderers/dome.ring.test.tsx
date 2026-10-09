/**
 * The dome's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 13): the base block
 * rings (split at the centre line); the curved cap is never faceted and its portholes, hatch and
 * mast are untouched, so the ring is the only thing the dome gains.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { dome } from './dome';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, size: { w?: number; bh?: number } = {}): SceneryContext {
  const actor: Actor = {
    id: 'dome-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'dome', district: 'habitat', row: 2, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: {
      dome: {
        w: size.w ?? 200, bh: size.bh ?? 40, ry: 70, portholes: 4,
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

const CTX = makeCtx(); // x 500, y 1030, base 200 x 40, ry 70
const X0 = 400;
const X1 = 600;
const Y = 1030;
const TOP = 990;
const MID = 500;
const SHIFT = { hueShift: 10, satShift: -5 };
const bodyBase = (satMult = 1) => ({ ...colorTheme.body.base, s: colorTheme.body.base.s * satMult });
const tone = (mult: number, satMult = 1) => applyColorShift(bodyBase(satMult), SHIFT, mult);
const draw = (c: SceneryContext) => render(dome(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="dome"]')!;

describe('dome ring: geometry and order', () => {
  it('draws exactly one ring, after the two cap paths and before the portholes', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(1);
    expect(Array.from(g.children).map((k) => k.tagName.toLowerCase())).toEqual([
      'rect', 'rect', 'path', 'path', 'g', 'circle', 'circle', 'circle', 'circle', 'rect', 'rect', 'circle',
    ]);
    expect(g.children[4].getAttribute('data-gem')).toBe('ring');
  });

  it('rings the base block only: 6 facets on a box from the left edge to the right, the top of the block to the ground', () => {
    const ring = ringsIn(draw(CTX))[0];
    expect(outerBox(ring)).toEqual({ x0: X0, y0: TOP, x1: X1, y1: Y });
    expect(facetsOfRing(ring)).toHaveLength(6);
  });

  it('is capped at 18 % of the block height (40: 7.2 px, not 8)', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.pts[3][1]).toBeCloseTo(TOP + 7.2, 1);
  });

  it('reaches the full 8 px on a taller block (bh 60)', () => {
    const tall = makeCtx({}, { bh: 60 });
    const facets = facetsOfRing(ringsIn(draw(tall))[0]);
    expect(facetOn(facets, [X0, 970], [MID, 970])!.pts[3][1]).toBeCloseTo(970 + 8, 1);
  });
});

describe('dome ring: light and colour', () => {
  it('top: west half at westL, east half at eastL, both lit (1.25x)', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.fill).toBe(tone(0.5 * 1.25));
    expect(facetOn(facets, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 1.25));
  });

  it('bottom shaded (0.5x), end walls neutral (1.1x), each at its own face', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X1, Y], [MID, Y])!.fill).toBe(tone(0.9 * 0.5));
    expect(facetOn(facets, [X0, Y], [X0, TOP])!.fill).toBe(tone(0.5 * 1.1));
  });

  it('folds the depth cap in', () => {
    const capped = makeCtx({ cap: 0.7 });
    expect(facetOn(facetsOfRing(ringsIn(draw(capped))[0]), [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 0.7 * 1.25));
  });

  it('a derelict carries the 40 % saturation body and its cap', () => {
    const base = makeCtx();
    const dead = makeCtx({ cap: 0.55, actor: { ...base.actor, config: { ...base.actor.config, derelict: true } } });
    const fill = facetOn(facetsOfRing(ringsIn(draw(dead))[0]), [MID, TOP], [X1, TOP])!.fill;
    expect(fill).toBe(tone(0.9 * 0.55 * 1.25, 0.4));
    expect(fill).not.toBe(tone(0.9 * 0.55 * 1.25, 1));
  });

  it('applies the placement-time hue and saturation shift', () => {
    const base = makeCtx();
    const other = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, hueShift: 120, satShift: 20 } } });
    const fill = (c: SceneryContext) => facetOn(facetsOfRing(ringsIn(draw(c))[0]), [MID, TOP], [X1, TOP])!.fill;
    expect(fill(other)).toBe(applyColorShift(bodyBase(), { hueShift: 120, satShift: 20 }, 0.9 * 1.25));
    expect(fill(other)).not.toBe(fill(base));
  });
});

describe('dome ring: it is the only thing the dome gains', () => {
  it('without the ring the markup is exactly the switched-off dome: cap paths, portholes, hatch and mast unchanged', () => {
    for (const c of [CTX, makeCtx({ nightDepth: 0.8 }), makeCtx({ cap: 0.55 })]) {
      const on = group(draw(c));
      let off = '';
      withSwitch('massScenery', false, () => {
        off = group(draw(c)).innerHTML;
      });
      expect(markupWithoutRings(on)).toBe(off);
    }
  });

  it('a derelict still has no mast light and still has its portholes', () => {
    const base = makeCtx();
    const dead = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, derelict: true } } });
    const g = group(draw(dead));
    expect(g.querySelector('[data-dome="mast-light"]')).toBeNull();
    expect(g.querySelectorAll('[data-dome="porthole"]')).toHaveLength(4);
    expect(ringsIn(g)).toHaveLength(1);
  });

  it('with the switch off there is no ring', () => {
    withSwitch('massScenery', false, () => {
      expect(ringsIn(draw(CTX))).toHaveLength(0);
    });
  });

  it('draws no ring for an actor with no dome params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 sizes and hours', () => {
    for (let i = 0; i < 50; i++) {
      const c = draw(makeCtx({ eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10, nightDepth: (i % 10) / 10 }, { w: 120 + i * 4, bh: 30 + (i % 20) }));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(1);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
