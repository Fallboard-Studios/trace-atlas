/**
 * The wreck's world gem rings (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 15): the hull rings
 * as one quadrilateral (stern block and raked bow together), drawn last, over the keel strip; the
 * deckhouse and the funnel each ring at the superstructure's average light. The deck rail, the dead
 * portholes and the keel strip are untouched. A wreck is always derelict: its own 0.5 cap is folded
 * into every tone on top of the row's cap.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { wreck, wreckLayout } from './wreck';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch, type Pt } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, p: Partial<NonNullable<SceneryContext['params']['wreck']>> = {}): SceneryContext {
  const actor: Actor = {
    id: 'wreck-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'wreck', district: 'wreckfield', row: 3 },
  };
  return {
    actor,
    params: { wreck: { w: 400, h: 90, deckhouseFrac: 0.25, portholes: 6, ...p } },
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
const NO_SHIFT = { hueShift: 0, satShift: 0 };
const HULL_BODY = { ...colorTheme.body.base, s: 6 };
const hullTone = (mult: number) => applyColorShift(HULL_BODY, NO_SHIFT, mult);
const steelTone = (mult: number) => applyColorShift(colorTheme.shell.shadow, NO_SHIFT, mult);
const draw = (c: SceneryContext) => render(wreck(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="wreck"]')!;
const lay = (c: SceneryContext) => wreckLayout(500, 1030, c.params.wreck!);
const hullRing = (c: HTMLElement) => ringsIn(group(c)).find((r) => r === group(c).lastElementChild)!;

describe('wreck ring: three rings, the hull\'s last', () => {
  it('draws one ring on the hull, one on the deckhouse and one on the funnel', () => {
    expect(ringsIn(draw(CTX))).toHaveLength(3);
  });

  it('draws each superstructure ring straight after its own block and the hull ring dead last, over the keel strip', () => {
    const g = group(draw(CTX));
    const tags = Array.from(g.children).map((k) => k.getAttribute('data-gem') ?? k.getAttribute('data-wreck'));
    expect(tags).toEqual([
      'hull-west', 'bow', 'deck-rail', 'deckhouse', 'ring', 'funnel', 'ring',
      'porthole', 'porthole', 'porthole', 'porthole', 'porthole', 'porthole', 'keel-shadow', 'ring',
    ]);
  });
});

describe('wreck ring: the hull is one quadrilateral', () => {
  const { top, splitX, x1 } = lay(CTX);
  const X0 = 300;
  const Y = 1030;

  it('outlines stern and raked bow together: left wall, deck, 45 degree bow, and a bottom split at the bow\'s start (5 facets)', () => {
    const ring = hullRing(draw(CTX));
    expect(outerBox(ring)).toEqual({ x0: X0, y0: top, x1, y1: Y });
    const f = facetsOfRing(ring);
    expect(f).toHaveLength(5);
    const edges: Array<[Pt, Pt]> = [
      [[X0, Y], [X0, top]],
      [[X0, top], [splitX, top]],
      [[splitX, top], [x1, Y]],
      [[x1, Y], [splitX, Y]],
      [[splitX, Y], [X0, Y]],
    ];
    for (const [a, b] of edges) expect(facetOn(f, a, b), `${a} to ${b}`).toBeDefined();
  });

  it('has a bow edge at exactly 45 degrees, h long in both x and y', () => {
    expect(x1 - splitX).toBe(90);
    expect(Y - top).toBe(90);
  });

  it('is 8 px deep on every hull the generator can make (h 70-120)', () => {
    for (const h of [70, 90, 120]) {
      const c = makeCtx({}, { h });
      const l = lay(c);
      const f = facetsOfRing(hullRing(draw(c)));
      expect(facetOn(f, [300, l.top], [l.splitX, l.top])!.pts[3][1] - l.top).toBeCloseTo(8, 1);
    }
  });
});

describe('wreck ring: light and colour (the wreck\'s own 0.5 cap folded in)', () => {
  const { top, splitX, x1 } = lay(CTX);
  const X0 = 300;
  const Y = 1030;

  it('hull top: lit (1.25x) on the west deck at westL x 0.5, and the bow lit at eastL x 0.5', () => {
    const f = facetsOfRing(hullRing(draw(CTX)));
    expect(facetOn(f, [X0, top], [splitX, top])!.fill).toBe(hullTone(0.5 * 0.5 * 1.25));
    expect(facetOn(f, [splitX, top], [x1, Y])!.fill).toBe(hullTone(0.9 * 0.5 * 1.25));
  });

  it('hull bottom shaded (0.5x) each half at its own face, the bow-side wall of the stern neutral (1.1x)', () => {
    const f = facetsOfRing(hullRing(draw(CTX)));
    expect(facetOn(f, [x1, Y], [splitX, Y])!.fill).toBe(hullTone(0.9 * 0.5 * 0.5));
    expect(facetOn(f, [splitX, Y], [X0, Y])!.fill).toBe(hullTone(0.5 * 0.5 * 0.5));
    expect(facetOn(f, [X0, Y], [X0, top])!.fill).toBe(hullTone(0.5 * 0.5 * 1.1));
  });

  it('folds the row\'s depth cap in on top of the wreck\'s own 0.5', () => {
    const f = facetsOfRing(hullRing(draw(makeCtx({ cap: 0.7 }))));
    expect(facetOn(f, [X0, top], [splitX, top])!.fill).toBe(hullTone(0.5 * 0.7 * 0.5 * 1.25));
  });

  it('uses the weathered grey body (saturation 6), no placement shift', () => {
    const f = facetsOfRing(hullRing(draw(CTX)));
    expect(facetOn(f, [X0, top], [splitX, top])!.fill).toMatch(/^hsl\(\d+(\.\d+)?, 6%, /);
  });

  it('leans with the afternoon sun: the west wall is lit and the bow shaded', () => {
    const pm = makeCtx({ eastL: 0.346, westL: 1.05 });
    const f = facetsOfRing(hullRing(draw(pm)));
    expect(facetOn(f, [X0, Y], [X0, top])!.fill).toBe(hullTone(1.05 * 0.5 * 1.25));
    expect(facetOn(f, [splitX, top], [x1, Y])!.fill).toBe(hullTone(0.346 * 0.5 * 1.1));
  });
});

describe('wreck ring: the deckhouse and the funnel', () => {
  const l = lay(CTX);
  const [dhRing, funnelRing] = ringsIn(draw(CTX)); // document order: deckhouse, funnel, then the hull

  it('ring the deckhouse (4 facets) and the funnel (4 facets) on their own rects', () => {
    expect(outerBox(dhRing)).toMatchObject({ x0: l.deckhouseX, y0: l.deckhouseTop, x1: l.deckhouseX + l.deckhouseW, y1: l.deckhouseTop + 46 });
    expect(outerBox(funnelRing)).toMatchObject({ y0: l.funnelTop, y1: l.funnelTop + 40 });
    expect(facetsOfRing(dhRing)).toHaveLength(4);
    expect(facetsOfRing(funnelRing)).toHaveLength(4);
  });

  it('are single-tone on shell.shadow at the average light x the wreck\'s cap (0.7 x 0.5): top lit, bottom shaded', () => {
    const avg = ((0.9 + 0.5) / 2) * 0.5;
    const dh = facetsOfRing(dhRing);
    expect(facetOn(dh, [l.deckhouseX, l.deckhouseTop], [l.deckhouseX + l.deckhouseW, l.deckhouseTop])!.fill).toBe(steelTone(avg * 1.25));
    expect(facetOn(dh, [l.deckhouseX + l.deckhouseW, l.deckhouseTop + 46], [l.deckhouseX, l.deckhouseTop + 46])!.fill).toBe(steelTone(avg * 0.5));
  });

  it('are 8 px deep on the deckhouse (18 % of 46 is 8.28) and capped by the width on the narrow funnel (35 wide: 6.3 px)', () => {
    const dh = facetsOfRing(dhRing);
    expect(facetOn(dh, [l.deckhouseX, l.deckhouseTop], [l.deckhouseX + l.deckhouseW, l.deckhouseTop])!.pts[3][1] - l.deckhouseTop).toBeCloseTo(8, 1);
    const fn = facetsOfRing(funnelRing);
    expect(l.funnelW).toBeCloseTo(35, 6);
    expect(facetOn(fn, [l.funnelX, l.funnelTop], [l.funnelX + l.funnelW, l.funnelTop])!.pts[3][1] - l.funnelTop).toBeCloseTo(6.3, 1);
  });
});

describe('wreck ring: the funnel\'s depth follows its short side, whichever it is', () => {
  it('on the widest wreck (w 580, deckhouse 0.3) the funnel is 60.9 wide and 40 tall, so the height caps it at 7.2 px', () => {
    const c = makeCtx({}, { w: 580, deckhouseFrac: 0.3 });
    const l = lay(c);
    expect(l.funnelW).toBeGreaterThan(40);
    const funnelRing = ringsIn(draw(c))[1];
    const f = facetsOfRing(funnelRing);
    expect(facetOn(f, [l.funnelX, l.funnelTop], [l.funnelX + l.funnelW, l.funnelTop])!.pts[3][1] - l.funnelTop).toBeCloseTo(7.2, 1);
  });
});

describe('wreck ring: what stays and what switches off', () => {
  it('without its rings the markup is exactly the switched-off wreck: rail, portholes and keel strip unchanged', () => {
    for (const c of [CTX, makeCtx({ cap: 0.6 }), makeCtx({ nightDepth: 1 }), makeCtx({}, { portholes: 4, deckhouseFrac: 0.3 })]) {
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

  it('draws no ring for an actor with no wreck params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('passes the 90/45 sweep with the ring on (its construction edges are exempt) and has no NaN, across 50 wrecks', () => {
    for (let i = 0; i < 50; i++) {
      const c = draw(makeCtx(
        { eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 },
        { w: 340 + i * 5, h: 70 + (i % 51), deckhouseFrac: 0.2 + (i % 11) / 100, portholes: 4 + (i % 6) },
      ));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(3);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
