/**
 * The tank's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 13): the shouldered
 * hexagon rings as one outline with the top and bottom split at the corner, and the belt courses
 * move inside the ring by its depth on both sides (assumption 9).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { tank } from './tank';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, shiftHSL } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, ringsIn, withSwitch, type Pt } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: 'tank-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
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

const NO_SHIFT = { hueShift: 0, satShift: 0 };
const CTX = makeCtx(); // x 500, y 1030, w 120, h 200, corner 0.5, 2 belts, eastL 0.9, westL 0.5, cap 1
const X0 = 440; // x - w / 2
const X1 = 560;
const Y = 1030;
const TOP = 830;
const SH = 36; // 0.3 w
const SPLIT = 500;

const body = (c: SceneryContext) =>
  shiftHSL(colorTheme.shell.shadow, { hueShift: c.actor.config?.hueShift ?? 0, satShift: c.actor.config?.satShift ?? 0 });
const tone = (c: SceneryContext, mult: number) => applyColorShift(body(c), NO_SHIFT, mult);
const draw = (c: SceneryContext) => render(tank(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="tank"]')!;
const narrow = () => makeCtx({ params: { tank: { w: 40, h: 200, corner: 0.5, beltCourses: 1, hueShift: 10, satShift: -5 } } });

describe('tank ring: geometry', () => {
  it('draws exactly one ring, after the two body polygons and before the gauge', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(1);
    const kids = Array.from(g.children);
    const ring = kids.findIndex((k) => k.getAttribute('data-gem') === 'ring');
    expect(ring).toBe(2);
    expect(kids.slice(0, ring).filter((k) => k.tagName.toLowerCase() === 'polygon')).toHaveLength(2);
    expect(kids[kids.length - 1].tagName.toLowerCase()).toBe('circle'); // the gauge is last
  });

  it('rings the whole shouldered hexagon: its six edges, top and bottom split at the corner (8 facets)', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facets).toHaveLength(8);
    const edges: Array<[Pt, Pt]> = [
      [[X0, Y], [X0, TOP + SH]], // left wall
      [[X0, TOP + SH], [X0 + SH, TOP]], // 45 degree shoulder
      [[X0 + SH, TOP], [SPLIT, TOP]], // top, west half
      [[SPLIT, TOP], [X1 - SH, TOP]], // top, east half
      [[X1 - SH, TOP], [X1, TOP + SH]], // 45 degree shoulder
      [[X1, TOP + SH], [X1, Y]], // right wall
      [[X1, Y], [SPLIT, Y]], // bottom, east half
      [[SPLIT, Y], [X0, Y]], // bottom, west half
    ];
    for (const [a, b] of edges) expect(facetOn(facets, a, b), `${a} to ${b}`).toBeDefined();
  });

  it('is 8 px deep: the inner top edge sits 8 px below the top, the inner left wall 8 px in', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0 + SH, TOP], [SPLIT, TOP])!.pts[3][1]).toBeCloseTo(TOP + 8, 1);
    expect(facetOn(facets, [X0, Y], [X0, TOP + SH])!.pts[3][0]).toBeCloseTo(X0 + 8, 1);
  });

  it('is capped at 18 % of the short side on a narrow tank (w 40: 7.2 px, not 8)', () => {
    const facets = facetsOfRing(ringsIn(draw(narrow()))[0]);
    const x0 = 480;
    expect(facetOn(facets, [x0, Y], [x0, TOP + 12])!.pts[3][0]).toBeCloseTo(x0 + 7.2, 1);
  });
});

describe('tank ring: light and colour', () => {
  it('lights each face from its own side: west top half at westL, east top half at eastL (both lit, 1.25x)', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0 + SH, TOP], [SPLIT, TOP])!.fill).toBe(tone(CTX, 0.5 * 1.25));
    expect(facetOn(facets, [SPLIT, TOP], [X1 - SH, TOP])!.fill).toBe(tone(CTX, 0.9 * 1.25));
  });

  it('shades the bottom (0.5x) and gives the near-vertical walls the neutral tone (1.1x) at this hour', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X1, Y], [SPLIT, Y])!.fill).toBe(tone(CTX, 0.9 * 0.5));
    expect(facetOn(facets, [SPLIT, Y], [X0, Y])!.fill).toBe(tone(CTX, 0.5 * 0.5));
    expect(facetOn(facets, [X1, TOP + SH], [X1, Y])!.fill).toBe(tone(CTX, 0.9 * 1.1));
    expect(facetOn(facets, [X0, Y], [X0, TOP + SH])!.fill).toBe(tone(CTX, 0.5 * 1.1));
  });

  it('lights the east shoulder and leaves the west one neutral, from the same sun', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X1 - SH, TOP], [X1, TOP + SH])!.fill).toBe(tone(CTX, 0.9 * 1.25));
    expect(facetOn(facets, [X0, TOP + SH], [X0 + SH, TOP])!.fill).toBe(tone(CTX, 0.5 * 1.1));
  });

  it('flips with the afternoon sun: at 3 pm the west wall is lit and the east wall shaded', () => {
    const pm = makeCtx({ eastL: 0.346, westL: 1.05 });
    const facets = facetsOfRing(ringsIn(draw(pm))[0]);
    expect(facetOn(facets, [X0, Y], [X0, TOP + SH])!.fill).toBe(tone(pm, 1.05 * 1.25));
    expect(facetOn(facets, [X1, TOP + SH], [X1, Y])!.fill).toBe(tone(pm, 0.346 * 0.5));
  });

  it('folds the depth cap into every facet', () => {
    const capped = makeCtx({ cap: 0.7 });
    const facets = facetsOfRing(ringsIn(draw(capped))[0]);
    expect(facetOn(facets, [SPLIT, TOP], [X1 - SH, TOP])!.fill).toBe(tone(capped, 0.9 * 0.7 * 1.25));
  });

  it('a derelict carries the desaturated body and its cap', () => {
    const base = makeCtx();
    // a positive saturation shift: the shell is near-grey, so the default -5 would clamp it to 0
    // and desaturating it would change nothing visible
    const dead = makeCtx({ cap: 0.55, actor: { ...base.actor, config: { ...base.actor.config, derelict: true, satShift: 30 } } });
    const live = makeCtx({ cap: 0.55, actor: { ...base.actor, config: { ...base.actor.config, satShift: 30 } } });
    expect(body(dead).s).toBeGreaterThan(10);
    const desat = { ...body(dead), s: body(dead).s * 0.4 };
    const deadFacets = facetsOfRing(ringsIn(draw(dead))[0]);
    const liveFacets = facetsOfRing(ringsIn(draw(live))[0]);
    const topEast = (fs: typeof deadFacets) => facetOn(fs, [SPLIT, TOP], [X1 - SH, TOP])!.fill;
    expect(topEast(deadFacets)).toBe(applyColorShift(desat, NO_SHIFT, 0.9 * 0.55 * 1.25));
    expect(topEast(deadFacets)).not.toBe(topEast(liveFacets));
  });


  it('applies the actor\'s placement-time hue and saturation shift', () => {
    const base = makeCtx();
    const other = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, hueShift: 170, satShift: 40 } } });
    const a = facetOn(facetsOfRing(ringsIn(draw(base))[0]), [SPLIT, TOP], [X1 - SH, TOP])!.fill;
    const b = facetOn(facetsOfRing(ringsIn(draw(other))[0]), [SPLIT, TOP], [X1 - SH, TOP])!.fill;
    expect(a).not.toBe(b);
    expect(b).toBe(tone(other, 0.9 * 1.25));
  });
});

describe('tank ring: the belt courses sit inside it (assumption 9)', () => {
  const belts = (c: HTMLElement) => Array.from(group(c).querySelectorAll('rect'));

  it('start 8 px in from each side: x = left + d, width = w - 2d', () => {
    const rects = belts(draw(CTX));
    expect(rects).toHaveLength(2);
    for (const b of rects) {
      expect(Number(b.getAttribute('x'))).toBeCloseTo(X0 + 8, 6);
      expect(Number(b.getAttribute('width'))).toBeCloseTo(120 - 16, 6);
    }
  });

  it('keep their rows and height', () => {
    const [first, second] = belts(draw(CTX));
    expect(first.getAttribute('height')).toBe('5');
    expect(Number(first.getAttribute('y'))).toBeCloseTo(TOP + 200 / 3 - 2.5, 6);
    expect(Number(second.getAttribute('y'))).toBeCloseTo(TOP + 400 / 3 - 2.5, 6);
  });

  it('are inset by the capped depth on a narrow tank', () => {
    const [b] = belts(draw(narrow()));
    expect(Number(b.getAttribute('x'))).toBeCloseTo(480 + 7.2, 6);
    expect(Number(b.getAttribute('width'))).toBeCloseTo(40 - 14.4, 6);
  });

  it('never reach the ring\'s inner wall edge on either side', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    const innerLeft = facetOn(facets, [X0, Y], [X0, TOP + SH])!.pts[3][0];
    const innerRight = facetOn(facets, [X1, TOP + SH], [X1, Y])!.pts[2][0];
    for (const b of belts(draw(CTX))) {
      const x = Number(b.getAttribute('x'));
      expect(x).toBeGreaterThanOrEqual(innerLeft - 0.011);
      expect(x + Number(b.getAttribute('width'))).toBeLessThanOrEqual(innerRight + 0.011);
    }
  });
});

describe('tank ring: what stays and what switches off', () => {
  const tagMarkup = (c: HTMLElement, tag: string) => Array.from(group(c).querySelectorAll(tag)).map((e) => e.outerHTML);

  it('leaves the body polygons and the gauge exactly as they were', () => {
    const on = draw(CTX);
    let off!: HTMLElement;
    withSwitch('massScenery', false, () => {
      off = draw(CTX);
    });
    expect(tagMarkup(on, 'polygon')).toEqual(tagMarkup(off, 'polygon'));
    expect(tagMarkup(on, 'circle')).toEqual(tagMarkup(off, 'circle'));
  });

  it('with the switch off there is no ring and the belts run the full width (as before)', () => {
    withSwitch('massScenery', false, () => {
      const g = group(draw(CTX));
      expect(ringsIn(g)).toHaveLength(0);
      for (const b of Array.from(g.querySelectorAll('rect'))) {
        expect(Number(b.getAttribute('x'))).toBe(X0);
        expect(Number(b.getAttribute('width'))).toBe(120);
      }
    });
  });

  it('draws no ring and no stray group for an actor with no tank params', () => {
    const empty = draw(makeCtx({ params: {} }));
    expect(ringsIn(empty)).toHaveLength(0);
  });

  it('no NaN anywhere and every non-ring edge still 90/45, across 50 sizes and corners', () => {
    for (let i = 0; i < 50; i++) {
      const c = makeCtx({
        params: { tank: { w: 80 + i * 2, h: 120 + i * 3, corner: 0.35 + (i % 7) * 0.05, beltCourses: i % 4, hueShift: 10, satShift: -5 } },
      });
      const container = draw(c);
      assertNinetyFortyFive(container);
      expect(ringsIn(container)).toHaveLength(1);
      expect(container.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
