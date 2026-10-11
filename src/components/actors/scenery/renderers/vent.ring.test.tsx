/**
 * The vent's world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5, plan Task 14): each stepped
 * block is its own ring, lit at the body's own level (avgL x cap x 1.3). The union polygon's ledges
 * are narrower than the bevel, which is why every step rings on its own. Plumes and the mouth
 * glow are untouched.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { vent } from './vent';
import { ventSteps } from '../sceneryParams';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor } from '../../../../types/Actor';
import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { facetOn, facetsOfRing, markupWithoutRings, outerBox, ringsIn, withSwitch } from '../../material/ringTestHelpers';

function makeCtx(overrides: Partial<SceneryContext> = {}, p: { w?: number; steps?: number } = {}): SceneryContext {
  const actor: Actor = {
    id: 'vent-fixture',
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind: 'vent', district: 'ventfield', row: 1 },
  };
  return {
    actor,
    params: { vent: { w: p.w ?? 80, steps: p.steps ?? 5 } },
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
const AVG = (0.9 + 0.5) / 2;
const NO_SHIFT = { hueShift: 0, satShift: 0 };
const tone = (mult: number) => applyColorShift(colorTheme.shadowDepth, NO_SHIFT, mult);
const draw = (c: SceneryContext) => render(vent(c)).container;
const group = (c: HTMLElement) => c.querySelector('[data-scenery="vent"]')!;
/** The steps' rects as the renderer stacks them, bottom up from the base. */
function stepRects(c: SceneryContext) {
  let top = 1030;
  return ventSteps(c.params.vent!).map((s) => {
    top -= s.height;
    return { x: 500 - s.width / 2, y: top, w: s.width, h: s.height };
  });
}

describe('vent ring: one per step', () => {
  it('draws one ring per step, each straight after its own step rect', () => {
    const g = group(draw(CTX));
    expect(ringsIn(g)).toHaveLength(5);
    const tags = Array.from(g.children).map((k) => k.getAttribute('data-gem') ?? k.getAttribute('data-vent'));
    expect(tags).toEqual(['step', 'ring', 'step', 'ring', 'step', 'ring', 'step', 'ring', 'step', 'ring', 'plume', 'plume', 'mouth-glow']);
  });

  it('rings each step exactly (4 facets, no split, on the step\'s own rect)', () => {
    const rects = stepRects(CTX);
    ringsIn(draw(CTX)).forEach((ring, i) => {
      const { x, y, w, h } = rects[i];
      const box = outerBox(ring); // coordinates are written to two decimals
      expect(box.x0).toBeCloseTo(x, 1);
      expect(box.y0).toBeCloseTo(y, 1);
      expect(box.x1).toBeCloseTo(x + w, 1);
      expect(box.y1).toBeCloseTo(y + h, 1);
      expect(facetsOfRing(ring)).toHaveLength(4);
    });
  });

  it('is capped at 18 % of the short side of each step: 5.4 px on a 30 px step whatever its width', () => {
    const rects = stepRects(CTX);
    ringsIn(draw(CTX)).forEach((ring, i) => {
      const { x, y, w } = rects[i];
      expect(facetOn(facetsOfRing(ring), [x, y], [x + w, y])!.pts[3][1] - y).toBeCloseTo(5.4, 1);
    });
  });

  it('is capped by the width on a very narrow step (14 wide: 2.52 px)', () => {
    const c = makeCtx({}, { w: 14, steps: 3 }); // every step floors at 14
    const rects = stepRects(c);
    expect(rects.map((r) => r.w)).toEqual([14, 14, 14]);
    ringsIn(draw(c)).forEach((ring, i) => {
      const { x, y, w } = rects[i];
      expect(facetOn(facetsOfRing(ring), [x, y], [x + w, y])!.pts[3][1] - y).toBeCloseTo(2.52, 1);
    });
  });

  it('follows the generator\'s range: 4 to 6 steps, 44 to 90 wide', () => {
    for (const [w, steps] of [[44, 4], [90, 6], [60, 5]]) {
      const c = makeCtx({}, { w, steps });
      expect(ringsIn(draw(c))).toHaveLength(steps);
    }
  });
});

describe('vent ring: lit at the body\'s own level', () => {
  it('top lit (1.25x), bottom shaded (0.5x), sides neutral (1.1x), all at avgL x cap x 1.3', () => {
    const { x, y, w, h } = stepRects(CTX)[0];
    const f = facetsOfRing(ringsIn(draw(CTX))[0]);
    expect(facetOn(f, [x, y], [x + w, y])!.fill).toBe(tone(AVG * 1.3 * 1.25));
    expect(facetOn(f, [x + w, y + h], [x, y + h])!.fill).toBe(tone(AVG * 1.3 * 0.5));
    expect(facetOn(f, [x + w, y], [x + w, y + h])!.fill).toBe(tone(AVG * 1.3 * 1.1));
    expect(facetOn(f, [x, y + h], [x, y])!.fill).toBe(tone(AVG * 1.3 * 1.1));
  });

  it('folds the depth cap in', () => {
    const { x, y, w } = stepRects(CTX)[2];
    const f = facetsOfRing(ringsIn(draw(makeCtx({ cap: 0.7 })))[2]);
    expect(facetOn(f, [x, y], [x + w, y])!.fill).toBe(tone(AVG * 0.7 * 1.3 * 1.25));
  });

  it('leans with the afternoon sun: the west side lit, the east shaded', () => {
    const pm = makeCtx({ eastL: 0.346, westL: 1.05 });
    const { x, y, w, h } = stepRects(pm)[0];
    const avg = (0.346 + 1.05) / 2;
    const f = facetsOfRing(ringsIn(draw(pm))[0]);
    expect(facetOn(f, [x, y + h], [x, y])!.fill).toBe(tone(avg * 1.3 * 1.25));
    expect(facetOn(f, [x + w, y], [x + w, y + h])!.fill).toBe(tone(avg * 1.3 * 0.5));
  });

  it('every step has the same tones (they share the body\'s level), only the geometry differs', () => {
    const fills = ringsIn(draw(CTX)).map((ring) => facetsOfRing(ring).map((f) => f.fill).sort().join('|'));
    expect(new Set(fills).size).toBe(1);
  });
});

describe('vent ring: what stays and what switches off', () => {
  it('without its rings the markup is exactly the switched-off vent: plumes and mouth glow unchanged', () => {
    for (const c of [CTX, makeCtx({ nightDepth: 0.9 }), makeCtx({ cap: 0.5 }), makeCtx({}, { w: 44, steps: 4 })]) {
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

  it('draws no ring for an actor with no vent params', () => {
    expect(ringsIn(draw(makeCtx({ params: {} })))).toHaveLength(0);
  });

  it('no NaN and every non-ring edge still 90/45, across 50 vents', () => {
    for (let i = 0; i < 50; i++) {
      const steps = 4 + (i % 3);
      const c = draw(makeCtx({ eastL: 0.1 + (i % 10) / 10, westL: 0.9 - (i % 10) / 10 }, { w: 44 + (i % 47), steps }));
      assertNinetyFortyFive(c);
      expect(ringsIn(c)).toHaveLength(steps);
      expect(c.innerHTML).not.toMatch(/NaN|undefined/);
    }
  });
});
