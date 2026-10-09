/**
 * The wall's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 13): the full rect
 * rings with the top and bottom split at the centre line, and the cap rail moves inside the ring
 * (inset by the depth from the top and both sides) so the ring's top facet does not bury it
 * (assumption 9).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { wall } from './wall';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, ringsIn, withSwitch, outerBox } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, size = { w: 200, h: 50 }): SceneryContext {
  const actor: Actor = {
    id: 'wall-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'wall', district: 'outskirts', row: 7, hueShift: 50, satShift: -15 },
  };
  return {
    actor,
    params: { wall: { ...size, hueShift: 50, satShift: -15 } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

const CTX = makeCtx(); // x 500, y 1030, w 200, h 50
const X0 = 400;
const X1 = 600;
const Y = 1030;
const TOP = 980;
const MID = 500;
const SHIFT = { hueShift: 50, satShift: -15 };
const tone = (mult: number) => applyColorShift(colorTheme.body.base, SHIFT, mult);
const draw = (c: SceneryContext) => render(wall(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="wall"]')!;
const rail = (c: HTMLElement) => Array.from(group(c).querySelectorAll('rect')).find((r) => r.getAttribute('height') === '5')!;
const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

describe('wall ring: geometry', () => {
  it('draws exactly one ring, after the two faces and the cap rail', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(1);
    const kids = Array.from(g.children);
    expect(kids.map((k) => k.tagName.toLowerCase())).toEqual(['rect', 'rect', 'rect', 'g']);
    expect(kids[3].getAttribute('data-gem')).toBe('ring');
  });

  it('rings the full rect with the top and bottom split at the centre line (6 facets)', () => {
    const ring = ringsIn(draw(CTX))[0];
    const facets = facetsOfRing(ring);
    expect(facets).toHaveLength(6);
    expect(outerBox(ring)).toEqual({ x0: X0, y0: TOP, x1: X1, y1: Y });
    for (const [a, b] of [
      [[X0, TOP], [MID, TOP]], [[MID, TOP], [X1, TOP]], [[X1, TOP], [X1, Y]],
      [[X1, Y], [MID, Y]], [[MID, Y], [X0, Y]], [[X0, Y], [X0, TOP]],
    ] as Array<[[number, number], [number, number]]>) {
      expect(facetOn(facets, a, b), `${a} to ${b}`).toBeDefined();
    }
  });

  it('is 8 px deep on a 50 px wall', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.pts[3][1]).toBeCloseTo(TOP + 8, 1);
  });

  it('is capped at 18 % of the short side on a low wall (h 30: 5.4 px)', () => {
    const low = makeCtx({}, { w: 200, h: 30 });
    const facets = facetsOfRing(ringsIn(draw(low))[0]);
    expect(facetOn(facets, [X0, 1000], [MID, 1000])!.pts[3][1]).toBeCloseTo(1000 + 5.4, 1);
  });

  it('is capped by the height on the lowest wall the generator makes (h 28: 5.04 px)', () => {
    const lowest = makeCtx({}, { w: 160, h: 28 });
    const facets = facetsOfRing(ringsIn(draw(lowest))[0]);
    expect(facetOn(facets, [420, 1002], [500, 1002])!.pts[3][1]).toBeCloseTo(1002 + 5.04, 1);
  });
});

describe('wall ring: light and colour', () => {
  it('top: west half at westL, east half at eastL, both lit (1.25x)', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.fill).toBe(tone(0.5 * 1.25));
    expect(facetOn(facets, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 1.25));
  });

  it('bottom shaded 0.5x and the end walls neutral 1.1x at this hour, each at its own face', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X1, Y], [MID, Y])!.fill).toBe(tone(0.9 * 0.5));
    expect(facetOn(facets, [MID, Y], [X0, Y])!.fill).toBe(tone(0.5 * 0.5));
    expect(facetOn(facets, [X1, TOP], [X1, Y])!.fill).toBe(tone(0.9 * 1.1));
    expect(facetOn(facets, [X0, Y], [X0, TOP])!.fill).toBe(tone(0.5 * 1.1));
  });

  it('at noon (east and west equal) the two top halves match', () => {
    const noon = makeCtx({ eastL: 0.8, westL: 0.8 });
    const facets = facetsOfRing(ringsIn(draw(noon))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.fill).toBe(facetOn(facets, [MID, TOP], [X1, TOP])!.fill);
  });

  it('folds the depth cap in', () => {
    const capped = makeCtx({ cap: 0.7 });
    const facets = facetsOfRing(ringsIn(draw(capped))[0]);
    expect(facetOn(facets, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 0.7 * 1.25));
  });

  it('applies the placement-time hue and saturation shift', () => {
    const base = makeCtx();
    const other = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, hueShift: 120, satShift: 10 } } });
    const fill = (c: SceneryContext) => facetOn(facetsOfRing(ringsIn(draw(c))[0]), [MID, TOP], [X1, TOP])!.fill;
    expect(fill(other)).not.toBe(fill(base));
    expect(fill(other)).toBe(applyColorShift(colorTheme.body.base, { hueShift: 120, satShift: 10 }, 0.9 * 1.25));
  });
});

describe('wall ring: the cap rail sits inside it (assumption 9)', () => {
  it('moves in by the depth from the top and both sides: x + d, y + d, width w - 2d', () => {
    const r = rail(draw(CTX));
    expect(num(r, 'x')).toBeCloseTo(X0 + 8, 6);
    expect(num(r, 'y')).toBeCloseTo(TOP + 8, 6);
    expect(num(r, 'width')).toBeCloseTo(200 - 16, 6);
    expect(num(r, 'height')).toBe(5);
  });

  it('moves in by the capped depth on a low wall', () => {
    const r = rail(draw(makeCtx({}, { w: 200, h: 30 })));
    expect(num(r, 'x')).toBeCloseTo(X0 + 5.4, 6);
    expect(num(r, 'y')).toBeCloseTo(1000 + 5.4, 6);
    expect(num(r, 'width')).toBeCloseTo(200 - 10.8, 6);
  });

  it('stays entirely inside the ring on every wall the generator can make', () => {
    for (const [w, h] of [[160, 28], [160, 70], [420, 28], [420, 70], [250, 45]]) {
      const c = draw(makeCtx({}, { w, h }));
      const facets = facetsOfRing(ringsIn(c)[0]);
      const innerTop = facets.find((f) => Math.abs(f.pts[0][1] - (1030 - h)) < 0.011 && f.pts[0][0] < 500)!.pts[3][1];
      const innerLeft = facets.find((f) => Math.abs(f.pts[0][0] - (500 - w / 2)) < 0.011 && f.pts[0][1] > 1030 - 1)!.pts[3][0];
      const r = rail(c);
      expect(num(r, 'y')).toBeGreaterThanOrEqual(innerTop - 0.011);
      expect(num(r, 'x')).toBeGreaterThanOrEqual(innerLeft - 0.011);
      expect(num(r, 'x') + num(r, 'width')).toBeLessThanOrEqual(500 + w / 2 - (innerLeft - (500 - w / 2)) + 0.011);
    }
  });

  it('keeps its fill: the ambient shell shadow', () => {
    let off = '';
    withSwitch('massScenery', false, () => {
      off = rail(draw(CTX)).getAttribute('fill')!;
    });
    expect(rail(draw(CTX)).getAttribute('fill')).toBe(off);
  });
});

describe('wall ring: what stays and what switches off', () => {
  it('leaves the two face rects exactly as they were', () => {
    const faces = (c: HTMLElement) => Array.from(group(c).querySelectorAll('rect')).slice(0, 2).map((r) => r.outerHTML);
    const on = draw(CTX);
    let off!: HTMLElement;
    withSwitch('massScenery', false, () => {
      off = draw(CTX);
    });
    expect(faces(on)).toEqual(faces(off));
  });

  it('with the switch off there is no ring and the rail is back at the top, full width', () => {
    withSwitch('massScenery', false, () => {
      const c = draw(CTX);
      expect(ringsIn(c)).toHaveLength(0);
      const r = rail(c);
      expect([num(r, 'x'), num(r, 'y'), num(r, 'width')]).toEqual([X0, TOP, 200]);
    });
  });

  it('draws no ring for an actor with no wall params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 sizes', () => {
    for (let i = 0; i < 50; i++) {
      const c = draw(makeCtx({ eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 }, { w: 160 + i * 5, h: 28 + (i % 43) }));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(1);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
