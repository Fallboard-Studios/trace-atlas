/**
 * Rings on the rooftop block greebles (docs/specs/WORLD_GEM_MATERIAL.md §1.4, assumption 7;
 * plan Task 11). Blocks get the roof-box ring at 0.6 x the building's depth; the ring needs the
 * hour's light, so it only exists when the context carries `light`. Without it every renderer is
 * byte-identical to before (the existing tests in rooftopGreebles.test.tsx stay unmodified).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  ROOFTOP_LAYOUT_PAINT,
  ROOFTOP_RENDERERS,
  computeMachineryLayout,
  computeSteppeRoofLayout,
  computeWaterTowerLayout,
  renderCrownSpire,
  renderMachinery,
  renderPitchedRoof,
  renderSteppeRoof,
  renderWaterTower,
} from './rooftopGreebles';
import type { GreebleElement, GreebleRendererContext } from './greebleTypes';
import { applyColorShift } from '../../../utils/colorUtils';
import { worldLightVector } from '../material/worldGemMaterial';
import { NO_SHIFT } from '../scenery/sceneryColor';

const ACCENT = { h: 180, s: 50, l: 50 };
const NINE_AM = worldLightVector(1.05, 0.346);

const BASE: GreebleRendererContext = {
  buildingWidth: 200,
  buildingHeight: 400,
  roofY: 1,
  seed: 0,
  colors: {
    body: { h: 0, s: 0, l: 0 },
    accent: ACCENT,
    greeble: { h: 0, s: 0, l: 0 },
    illuminated: { h: 0, s: 0, l: 0 },
  },
  lMultiplier: 0.7,
  eastLMultiplier: 1.05,
  westLMultiplier: 0.346,
  frontCornerX: 120,
};
const LIT: GreebleRendererContext = { ...BASE, light: NINE_AM };

type Pt = [number, number];
interface Facet {
  fill: string;
  pts: Pt[];
}

/** The drawn element in a DOM, so ring markup can be read back the way the app would paint it. */
function draw(el: GreebleElement | null): HTMLElement {
  const { container } = render(<svg>{el}</svg>);
  return container;
}
const rings = (c: HTMLElement) => Array.from(c.querySelectorAll('g[data-gem="ring"]'));
function facetsOf(ring: Element): Facet[] {
  return Array.from(ring.querySelectorAll('path')).flatMap((p) =>
    (p.getAttribute('d') ?? '')
      .split('M')
      .filter(Boolean)
      .map((sub) => ({
        fill: p.getAttribute('fill') ?? '',
        pts: Array.from(sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)).map((m): Pt => [Number(m[1]), Number(m[2])]),
      })),
  );
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.011;
const facetOn = (fs: Facet[], [ax, ay]: Pt, [bx, by]: Pt) =>
  fs.find((f) => near(f.pts[0][0], ax) && near(f.pts[0][1], ay) && near(f.pts[1][0], bx) && near(f.pts[1][1], by));
const tone = (m: number) => applyColorShift(ACCENT, NO_SHIFT, m);

/** Every extent of a ring's facet outer edges: the box the ring sits on. */
function outerBox(ring: Element) {
  const outer = facetsOf(ring).flatMap((f) => [f.pts[0], f.pts[1]]);
  return {
    x0: Math.min(...outer.map((p) => p[0])),
    y0: Math.min(...outer.map((p) => p[1])),
    x1: Math.max(...outer.map((p) => p[0])),
    y1: Math.max(...outer.map((p) => p[1])),
  };
}

const rectsOf = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('rect')).map((r) => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    w: Number(r.getAttribute('width')),
    h: Number(r.getAttribute('height')),
  }));

describe('without ctx.light every renderer is exactly as before', () => {
  it.each(Object.keys(ROOFTOP_RENDERERS) as Array<keyof typeof ROOFTOP_RENDERERS>)('%s draws no ring', (type) => {
    for (const seed of [0, 1, 2, 7, 50, 99]) {
      const el = ROOFTOP_RENDERERS[type]({ ...BASE, seed });
      if (el) expect(rings(draw(el))).toHaveLength(0);
    }
  });

  it('adds no extra child element either, so the element tree is unchanged', () => {
    const lit = renderCrownSpire({ ...LIT, seed: 1 }) as GreebleElement;
    const dark = renderCrownSpire({ ...BASE, seed: 1 }) as GreebleElement;
    const kids = (el: GreebleElement) => React.Children.toArray(el.props.children as React.ReactNode).length;
    expect(kids(dark)).toBe(2 * 3 + 1); // 3 tiers x (front + side) + antenna
    expect(kids(lit)).toBe(kids(dark) + 3); // plus one ring per tier
  });
});

describe('every ringed greeble draws its rings after all of its fills', () => {
  const CASES: Array<[string, () => GreebleElement | null]> = [
    ['crownSpire', () => renderCrownSpire({ ...LIT, seed: 1 })],
    ['pitchedRoof', () => renderPitchedRoof({ ...LIT, roofY: 100 })],
    ['waterTower', () => renderWaterTower({ ...LIT, seed: 3 })],
    ['machinery', () => renderMachinery({ ...LIT, seed: 0 })],
    ['steppeRoof', () => renderSteppeRoof({ ...LIT, seed: 2 })],
  ];

  it.each(CASES)('%s', (_name, make) => {
    const el = make() as GreebleElement;
    const kids = React.Children.toArray(el.props.children as React.ReactNode) as Array<React.ReactElement<Record<string, unknown>>>;
    const isRing = (k: React.ReactElement<Record<string, unknown>>) => typeof k.type !== 'string';
    const firstRing = kids.findIndex(isRing);
    expect(firstRing).toBeGreaterThan(0);
    expect(kids.slice(0, firstRing).every((k) => !isRing(k))).toBe(true);
    expect(kids.slice(firstRing).every(isRing)).toBe(true);
  });
});

describe('crownSpire: one two-faced ring per tier, split at the front corner', () => {
  it.each([0, 1])('seed %i: one ring per tier', (seed) => {
    const c = draw(renderCrownSpire({ ...LIT, seed }));
    expect(rings(c)).toHaveLength(2 + (seed % 2));
  });

  it('rings the union of a tier\'s two rects, with the top facet split at the front corner', () => {
    const c = draw(renderCrownSpire({ ...LIT, seed: 0 }));
    const rects = rectsOf(c);
    const [front0, side0] = [rects[0], rects[1]]; // the bottom tier's two rects
    const ring = rings(c)[0];
    const box = outerBox(ring);
    expect(box.x0).toBeCloseTo(front0.x, 1);
    expect(box.x1).toBeCloseTo(side0.x + side0.w, 1);
    expect(box.y0).toBeCloseTo(front0.y, 1);
    expect(box.y1).toBeCloseTo(front0.y + front0.h, 1);
    const fs = facetsOf(ring);
    expect(fs).toHaveLength(6);
    expect(facetOn(fs, [front0.x, front0.y], [120, front0.y])).toBeDefined();
    expect(facetOn(fs, [120, front0.y], [side0.x + side0.w, front0.y])).toBeDefined();
  });

  it('lights the west half of the top facet with the west multiplier and the east half with the east one', () => {
    const c = draw(renderCrownSpire({ ...LIT, seed: 0 }));
    const rects = rectsOf(c);
    const fs = facetsOf(rings(c)[0]);
    const y = rects[0].y;
    expect(facetOn(fs, [rects[0].x, y], [120, y])!.fill).toBe(tone(0.346 * 1.25));
    expect(facetOn(fs, [120, y], [rects[1].x + rects[1].w, y])!.fill).toBe(tone(1.05 * 1.25));
  });

  it('draws each ring after all the fills, so the tier rects keep their order and indexes', () => {
    const el = renderCrownSpire({ ...LIT, seed: 0 }) as GreebleElement;
    const kids = React.Children.toArray(el.props.children as React.ReactNode) as Array<React.ReactElement<Record<string, unknown>>>;
    expect(kids.slice(0, 5).map((k) => k.type)).toEqual(['rect', 'rect', 'rect', 'rect', 'rect']);
    expect(kids.slice(5).every((k) => typeof k.type !== 'string')).toBe(true);
  });

  it('draws no ring on the unshaded fallback (no east/west lighting to light it by)', () => {
    const noLighting = { ...LIT, eastLMultiplier: undefined, westLMultiplier: undefined, frontCornerX: undefined };
    expect(rings(draw(renderCrownSpire(noLighting)))).toHaveLength(0);
  });
});

describe('pitchedRoof: the slope triangle and the wall, each from its own face', () => {
  const c = () => draw(renderPitchedRoof({ ...LIT, roofY: 100 }));

  it('draws one ring on the slope and one on the wall', () => {
    expect(rings(c())).toHaveLength(2);
  });

  it('rings the slope triangle at the west multiplier and the wall at the east one', () => {
    const [slope, wall] = rings(c());
    // slope: (0,100) (120,100) (120,-20): west face; its vertical edge faces east (away from a
    // west-leaning sun at 9 am it is the shaded side of the west face, so check the base too)
    const slopeFills = facetsOf(slope).map((f) => f.fill);
    const wallFills = facetsOf(wall).map((f) => f.fill);
    const westTones = [0.346 * 1.25, 0.346 * 1.1, 0.346 * 0.5].map(tone);
    const eastTones = [1.05 * 1.25, 1.05 * 1.1, 1.05 * 0.5].map(tone);
    for (const f of slopeFills) expect(westTones).toContain(f);
    for (const f of wallFills) expect(eastTones).toContain(f);
  });

  it('rings the wall rectangle exactly: ridge to roof, front corner to building edge', () => {
    const [, wall] = rings(c());
    const box = outerBox(wall);
    expect(box).toMatchObject({ x0: 120, x1: 200, y0: -20, y1: 100 });
  });

  it('rings the slope\'s 45 degree triangle: a right angle at the corner, legs of 120', () => {
    const [slope] = rings(c());
    const box = outerBox(slope);
    expect(box).toMatchObject({ x0: 0, x1: 120, y0: -20, y1: 100 });
    expect(facetsOf(slope)).toHaveLength(3);
  });

  it('draws no ring on the unshaded single-triangle fallback', () => {
    const noLighting = { ...LIT, eastLMultiplier: undefined, westLMultiplier: undefined, frontCornerX: undefined };
    expect(rings(draw(renderPitchedRoof(noLighting)))).toHaveLength(0);
  });
});

describe('waterTower: the tank body', () => {
  it('rings the body rect at the roof average, and nothing else', () => {
    const c = draw(renderWaterTower({ ...LIT, seed: 0 }));
    expect(rings(c)).toHaveLength(1);
    const layout = computeWaterTowerLayout({ ...LIT, seed: 0 });
    const box = outerBox(rings(c)[0]);
    expect(box.x0).toBeCloseTo(layout.body.x, 1);
    expect(box.x1).toBeCloseTo(layout.body.x + layout.body.w, 1);
    expect(box.y0).toBeCloseTo(layout.body.y, 1);
    expect(box.y1).toBeCloseTo(layout.body.y + layout.body.h, 1);
  });

  it('is single-tone: top lit, bottom shaded, sides neutral, all at lMultiplier', () => {
    const c = draw(renderWaterTower({ ...LIT, seed: 0 }));
    const fs = facetsOf(rings(c)[0]);
    const { x, y, w, h } = computeWaterTowerLayout({ ...LIT, seed: 0 }).body;
    expect(facetOn(fs, [x, y], [x + w, y])!.fill).toBe(tone(0.7 * 1.25));
    expect(facetOn(fs, [x + w, y + h], [x, y + h])!.fill).toBe(tone(0.7 * 0.5));
    expect(facetOn(fs, [x + w, y], [x + w, y + h])!.fill).toBe(tone(0.7 * 1.25)); // east side lit at 9 am
    expect(facetOn(fs, [x, y + h], [x, y])!.fill).toBe(tone(0.7 * 0.5));
    expect(fs).toHaveLength(4);
  });

  it('keeps the cap and stilts as they were', () => {
    const lit = draw(renderWaterTower({ ...LIT, seed: 0 }));
    const dark = draw(renderWaterTower({ ...BASE, seed: 0 }));
    expect(lit.querySelectorAll('polygon').length).toBe(dark.querySelectorAll('polygon').length);
    expect(rectsOf(lit)).toEqual(rectsOf(dark));
  });
});

/** The roof-box ring is 4.8 px capped at 18 % of the short side, and dropped under 1 px. */
const carriesRing = (r: { w: number; h: number }) => 0.18 * Math.min(r.w, r.h) >= 1;

describe('machinery: one ring per stack tall enough to carry one', () => {
  it('rings each stack with its own ring', () => {
    const lit = draw(renderMachinery({ ...LIT, seed: 0 }));
    const layout = computeMachineryLayout({ ...LIT, seed: 0 });
    expect(layout.stacks.length).toBeGreaterThan(0);
    expect(rings(lit)).toHaveLength(layout.stacks.filter(carriesRing).length);
    expect(rectsOf(lit)).toHaveLength(layout.stacks.length);
  });

  it('a stack too short for a 1 px ring grows none: the floor', () => {
    // stacks are 3-10 % of a 120 px building (3.6-12 px) and 10 px wide: some fall under the floor
    const seed = Array.from({ length: 60 }, (_, s) => s).find((s) => {
      const { stacks } = computeMachineryLayout({ ...BASE, buildingHeight: 120, seed: s });
      return stacks.some(carriesRing) && stacks.some((r) => !carriesRing(r));
    });
    expect(seed).toBeDefined();
    const layout = computeMachineryLayout({ ...BASE, buildingHeight: 120, seed: seed! });
    const c = draw(renderMachinery({ ...LIT, buildingHeight: 120, seed: seed! }));
    expect(rings(c)).toHaveLength(layout.stacks.filter(carriesRing).length);
    expect(rectsOf(c)).toHaveLength(layout.stacks.length); // the short ones are still drawn
  });

  it('single-tone at the roof average', () => {
    const c = draw(renderMachinery({ ...LIT, seed: 0 }));
    for (const ring of rings(c)) {
      for (const f of facetsOf(ring)) {
        expect([0.7 * 1.25, 0.7 * 1.1, 0.7 * 0.5].map(tone)).toContain(f.fill);
      }
    }
  });
});

describe('steppeRoof: one ring per tier', () => {
  it('rings each tier tall enough for one', () => {
    const lit = draw(renderSteppeRoof({ ...LIT, seed: 2 })); // 3 tiers, 8 px each at 400 px
    expect(rings(lit)).toHaveLength(3);
  });

  it('a tier under the floor emits no ring (a 100 px building: 2 px tiers)', () => {
    expect(rings(draw(renderSteppeRoof({ ...LIT, buildingHeight: 100, seed: 2 })))).toHaveLength(0);
  });

  it('a 6 px tier is just above the floor: 0.18 x 6 = 1.08 px, so it does ring', () => {
    // the plan says a 6 px tier emits none; the floor (RING_MIN_PX = 1) only bites under 5.56 px
    expect(rings(draw(renderSteppeRoof({ ...LIT, buildingHeight: 300, seed: 0 })))).toHaveLength(1); // 6 px tier
    expect(rings(draw(renderSteppeRoof({ ...LIT, buildingHeight: 275, seed: 0 })))).toHaveLength(0); // 5.5 px tier
  });

  it('rings sit on their tier rects', () => {
    const c = draw(renderSteppeRoof({ ...LIT, seed: 2 }));
    const tiers = rectsOf(c);
    rings(c).forEach((ring, i) => {
      const box = outerBox(ring);
      expect(box.x0).toBeCloseTo(tiers[i].x, 1);
      expect(box.x1).toBeCloseTo(tiers[i].x + tiers[i].w, 1);
      expect(box.y0).toBeCloseTo(tiers[i].y, 1);
    });
  });
});

describe('the ring depth is 0.6 x 8 px, capped at 18 % of the block\'s short side', () => {
  it('is 4.8 px on a block tall enough: the inner top edge sits 4.8 px below the top', () => {
    const c = draw(renderSteppeRoof({ ...LIT, buildingHeight: 2000, seed: 0 })); // one 40 px tier
    const { x, y, w } = rectsOf(c)[0];
    const top = facetOn(facetsOf(rings(c)[0]), [x, y], [x + w, y])!;
    expect(top.pts[3][1] - y).toBeCloseTo(4.8, 1);
  });

  it('is capped at 18 % of the short side on a short block', () => {
    const c = draw(renderSteppeRoof({ ...LIT, buildingHeight: 500, seed: 0 })); // one 10 px tier
    const { x, y, w } = rectsOf(c)[0];
    const top = facetOn(facetsOf(rings(c)[0]), [x, y], [x + w, y])!;
    expect(top.pts[3][1] - y).toBeCloseTo(1.8, 1);
  });
});

describe('the lighting-dependent registry', () => {
  it('lists machinery, waterTower and steppeRoof beside pitchedRoof and crownSpire', () => {
    expect(Object.keys(ROOFTOP_LAYOUT_PAINT).sort()).toEqual(
      ['crownSpire', 'machinery', 'pitchedRoof', 'steppeRoof', 'waterTower'],
    );
  });

  it.each(['machinery', 'waterTower', 'steppeRoof'] as const)('%s: compute reads no lighting field', (type) => {
    const entry = ROOFTOP_LAYOUT_PAINT[type]!;
    const day = entry.compute({ ...BASE, seed: 3, lMultiplier: 1, eastLMultiplier: 1.05, westLMultiplier: 0.9, nightDepth: 0, flickerEpoch: 0 });
    const night = entry.compute({ ...LIT, seed: 3, lMultiplier: 0.2, eastLMultiplier: 0.3, westLMultiplier: 0.3, nightDepth: 1, flickerEpoch: 9 });
    expect(night).toEqual(day);
  });

  it.each(['machinery', 'waterTower', 'steppeRoof'] as const)('%s: the thin wrapper equals compute then paint', (type) => {
    const entry = ROOFTOP_LAYOUT_PAINT[type]!;
    const ctx = { ...LIT, seed: 2 };
    expect(ROOFTOP_RENDERERS[type](ctx)).toEqual(entry.paint(entry.compute(ctx), ctx));
  });

  it.each(['machinery', 'waterTower', 'steppeRoof'] as const)('%s: paint re-lights the same layout', (type) => {
    const entry = ROOFTOP_LAYOUT_PAINT[type]!;
    const layout = entry.compute({ ...LIT, seed: 2 });
    const day = draw(entry.paint(layout, { ...LIT, seed: 2, lMultiplier: 1, light: worldLightVector(1.05, 0.346) }));
    const night = draw(entry.paint(layout, { ...LIT, seed: 2, lMultiplier: 0.2, light: worldLightVector(0.3, 0.3) }));
    expect(night.innerHTML).not.toBe(day.innerHTML);
  });

  it('a machinery layout that drew no stacks paints null', () => {
    const entry = ROOFTOP_LAYOUT_PAINT.machinery!;
    const layout = entry.compute({ ...BASE, seed: 0 }) as { stacks: unknown[] };
    expect(entry.paint({ stacks: [] }, LIT)).toBeNull();
    expect(layout.stacks.length).toBeGreaterThan(0);
  });
});

describe('machinery, waterTower and steppeRoof layouts match what they drew before', () => {
  it('steppeRoof: tiers centred at 80/60/40 % of the width, 2 % of the height each', () => {
    const layout = computeSteppeRoofLayout({ ...BASE, seed: 2 });
    expect(layout.tiers.map((t) => t.w)).toEqual([160, 120, 80]);
    expect(layout.tiers.map((t) => t.x)).toEqual([20, 40, 60]);
    expect(layout.tiers.map((t) => t.h)).toEqual([8, 8, 8]);
    expect(layout.tiers.map((t) => t.y)).toEqual([1 - 8, 1 - 16, 1 - 24]);
  });
});
