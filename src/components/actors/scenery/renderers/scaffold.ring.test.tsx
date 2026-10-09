/**
 * The scaffold's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 14): its solid
 * lower block rings (split at the centre line); the open frame above it (posts, levels, braces)
 * takes none — those are members, which take the hairline in Task 16.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { scaffold } from './scaffold';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, p: Partial<NonNullable<SceneryContext['params']['scaffold']>> = {}): SceneryContext {
  const actor: Actor = {
    id: 'scaffold-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'scaffold', district: 'derelict', row: 5, hueShift: 10, satShift: -5 },
  };
  return {
    actor,
    params: { scaffold: { w: 200, h: 300, bays: 3, solidFrac: 0.3, hueShift: 10, satShift: -5, ...p } },
    cap: 1,
    eastL: 0.9,
    westL: 0.5,
    nightDepth: 0,
    accent: { primary: 0, secondary: 30 },
    gems: true,
    ...overrides,
  };
}

const CTX = makeCtx(); // w 200, h 300, solidFrac 0.3 -> a 200 x 90 block from 940 to 1030
const X0 = 400;
const X1 = 600;
const Y = 1030;
const TOP = 940;
const MID = 500;
const SHIFT = { hueShift: 10, satShift: -5 };
const tone = (mult: number, satMult = 1) =>
  applyColorShift({ ...colorTheme.body.base, s: colorTheme.body.base.s * satMult }, SHIFT, mult);
const draw = (c: SceneryContext) => render(scaffold(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="scaffold"]')!;

describe('scaffold ring: the solid block, and nothing else', () => {
  it('draws exactly one ring, straight after the two solid rects and before the frame', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(1);
    const tags = Array.from(g.children).map((k) => k.getAttribute('data-gem') ?? k.getAttribute('data-scaffold'));
    expect(tags.slice(0, 4)).toEqual(['solid', 'solid', 'ring', 'post']);
  });

  it('rings the solid block: from the left edge to the right, the block\'s top to the ground, split at the centre (6 facets)', () => {
    const ring = ringsIn(draw(CTX))[0];
    expect(outerBox(ring)).toEqual({ x0: X0, y0: TOP, x1: X1, y1: Y });
    expect(facetsOfRing(ring)).toHaveLength(6);
  });

  it('puts no ring on a post, a level or a brace: the only ring group is the solid block\'s', () => {
    const g = group(draw(CTX));
    for (const part of ['post', 'level', 'brace']) {
      for (const el of Array.from(g.querySelectorAll(`[data-scaffold="${part}"]`))) {
        expect(el.closest('[data-gem="ring"]')).toBeNull();
        expect(el.querySelector('[data-gem="ring"]')).toBeNull();
      }
    }
  });

  it('is 8 px deep on a 90 px block', () => {
    const facets = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(facets, [X0, TOP], [MID, TOP])!.pts[3][1]).toBeCloseTo(TOP + 8, 1);
  });

  it('is capped at 18 % of a low block (h 100 x 0.2 = a 20 px block: 3.6 px)', () => {
    const low = makeCtx({}, { h: 100, solidFrac: 0.2 });
    const facets = facetsOfRing(ringsIn(draw(low))[0]);
    expect(facetOn(facets, [X0, 1010], [MID, 1010])!.pts[3][1]).toBeCloseTo(1010 + 3.6, 1);
  });

  it('follows the block across the generator\'s range (h 220-380, solidFrac 0.25-0.45)', () => {
    for (const [h, solidFrac] of [[220, 0.25], [380, 0.45], [300, 0.35]]) {
      const c = draw(makeCtx({}, { h, solidFrac }));
      const solidH = h * solidFrac;
      expect(outerBox(ringsIn(c)[0])).toMatchObject({ y0: Y - solidH, y1: Y });
    }
  });
});

describe('scaffold ring: light and colour', () => {
  it('top: west half at westL, east half at eastL, both lit (1.25x)', () => {
    const f = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(f, [X0, TOP], [MID, TOP])!.fill).toBe(tone(0.5 * 1.25));
    expect(facetOn(f, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 1.25));
  });

  it('bottom shaded (0.5x), end walls neutral (1.1x), each at its own face', () => {
    const f = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(f, [X1, Y], [MID, Y])!.fill).toBe(tone(0.9 * 0.5));
    expect(facetOn(f, [MID, Y], [X0, Y])!.fill).toBe(tone(0.5 * 0.5));
    expect(facetOn(f, [X1, TOP], [X1, Y])!.fill).toBe(tone(0.9 * 1.1));
    expect(facetOn(f, [X0, Y], [X0, TOP])!.fill).toBe(tone(0.5 * 1.1));
  });

  it('folds the depth cap in', () => {
    const f = facetsOfRing(ringsIn(draw(makeCtx({ cap: 0.7 })))[0]);
    expect(facetOn(f, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 0.7 * 1.25));
  });

  it('a derelict carries the 40 % saturation body, its cap, and still has a ring', () => {
    const base = makeCtx();
    const dead = makeCtx({ cap: 0.55, actor: { ...base.actor, config: { ...base.actor.config, derelict: true } } });
    const f = facetsOfRing(ringsIn(draw(dead))[0]);
    expect(facetOn(f, [MID, TOP], [X1, TOP])!.fill).toBe(tone(0.9 * 0.55 * 1.25, 0.4));
  });

  it('applies the placement-time hue and saturation shift', () => {
    const base = makeCtx();
    const other = makeCtx({ actor: { ...base.actor, config: { ...base.actor.config, hueShift: 100, satShift: 20 } } });
    const f = facetsOfRing(ringsIn(draw(other))[0]);
    expect(facetOn(f, [MID, TOP], [X1, TOP])!.fill).toBe(applyColorShift(colorTheme.body.base, { hueShift: 100, satShift: 20 }, 0.9 * 1.25));
  });
});

describe('scaffold ring: what stays and what switches off', () => {
  it('without its ring the markup is exactly the switched-off scaffold: frame, braces and light unchanged', () => {
    const derelict = makeCtx({ actor: { ...CTX.actor, config: { ...CTX.actor.config, derelict: true } } });
    for (const c of [CTX, makeCtx({ nightDepth: 0.8 }), derelict, makeCtx({}, { bays: 2 })]) {
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

  it('draws no ring for an actor with no scaffold params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 scaffolds', () => {
    for (let i = 0; i < 50; i++) {
      const c = draw(makeCtx(
        { eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 },
        { w: 160 + i * 2, h: 220 + i * 3, bays: 2 + (i % 2), solidFrac: 0.25 + (i % 21) / 100 },
      ));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(1);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
