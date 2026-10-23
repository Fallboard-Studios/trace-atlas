import React from 'react';
import type { ReactElement } from 'react';
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EL = ReactElement<any>;
import {
  renderMachinery,
  renderSteppeRoof,
  renderPitchedRoof,
  renderCrownSpire,
  renderAntennae,
  renderWaterTower,
  renderCupola,
  renderPipesValves,
  ROOFTOP_RENDERERS,
  computePitchedRoofLayout,
  paintPitchedRoof,
  computeCrownSpireLayout,
  paintCrownSpire,
  ROOFTOP_LAYOUT_PAINT,
} from './rooftopGreebles';
import type { GreebleRendererContext } from './greebleTypes';

// minimal context for testing
const ctx: GreebleRendererContext = {
  buildingWidth: 100,
  buildingHeight: 100,
  roofY: 50,
  seed: 1234,
  colors: {
    body: { h: 0, s: 0, l: 0 },
    accent: { h: 180, s: 50, l: 50 },
    greeble: { h: 0, s: 0, l: 0 },
    illuminated: { h: 0, s: 0, l: 0 },
  },
  lMultiplier: 1,
};

describe('rooftop greeble renderers', () => {
  it('renderMachinery returns a valid React element (fragment of stacks)', () => {
    // renderMachinery now returns a fragment of stack rects or null.
    // seed=0 is known to generate at least one stack (first LCG value ≈ 0.236 < 0.3).
    const result = renderMachinery({ ...ctx, seed: 0 });
    const el = result as EL;
    expect(React.isValidElement(el)).toBe(true);
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children.length).toBeGreaterThanOrEqual(1);
    // Every child must be a rect filled with accent color
    expect(children[0].type).toBe('rect');
    expect(children[0].props.fill).toBe('hsl(180, 50%, 50%)');
  });

  it('registry contains keys for all rooftop greebles', () => {
    const keys = Object.keys(ROOFTOP_RENDERERS);
    expect(keys).toEqual(
      expect.arrayContaining([
        'machinery',
        'antennae',
        'waterTower',
        'cupola',
        'crownSpire',
        'pitchedRoof',
        'steppeRoof',
        'pipesValves',
      ]),
    );
  });

  it('renderPipesValves returns some shapes for a given ctx and touches roofY', () => {
    const el = renderPipesValves(ctx) as EL;
    expect(React.isValidElement(el)).toBe(true);
    const kids = React.Children.toArray(el.props.children) as EL[];
    expect(kids.length).toBeGreaterThan(0);
    // at least one element should align with the roofY coordinate
    const touchesRoof = kids.some((c) => {
      const props = c.props;
      return props.y === ctx.roofY || props.cy === ctx.roofY;
    });
    expect(touchesRoof).toBe(true);
  });
});

// ========================================
// STEPPE ROOF TESTS
// ========================================

describe('renderSteppeRoof', () => {
  // seed=0 → 1+(0%3)=1 tier; seed=1 → 2 tiers; seed=2 → 3 tiers
  it('produces 1 tier when seed % 3 === 0', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(1);
  });

  it('produces 2 tiers when seed % 3 === 1', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 1 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(2);
  });

  it('produces 3 tiers when seed % 3 === 2', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 2 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(3);
  });

  it('tier widths are 80%, 60%, 40% of buildingWidth', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 2 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children[0].props.width).toBe(80);  // 100 * 0.8
    expect(children[1].props.width).toBe(60);  // 100 * 0.6
    expect(children[2].props.width).toBe(40);  // 100 * 0.4
  });

  it('each tier height is 2% of buildingHeight', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 2 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    for (const child of children) {
      expect(child.props.height).toBe(2); // 100 * 0.02
    }
  });

  it('tiers are horizontally centred', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 2 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    // x should equal (buildingWidth - tierWidth) / 2
    expect(children[0].props.x).toBe(10); // (100 - 80) / 2
    expect(children[1].props.x).toBe(20); // (100 - 60) / 2
    expect(children[2].props.x).toBe(30); // (100 - 40) / 2
  });

  it('tiers stack upward from roofY', () => {
    const el = renderSteppeRoof({ ...ctx, seed: 2 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    // y = roofY - tierH * (i + 1); roofY=50 (ctx), tierH=100*0.02=2
    expect(children[0].props.y).toBe(48); // 50 - 2*1
    expect(children[1].props.y).toBe(46); // 50 - 2*2
    expect(children[2].props.y).toBe(44); // 50 - 2*3
  });
});

// ========================================
// PITCHED ROOF TESTS
// ========================================

describe('renderPitchedRoof', () => {
  it('returns a polygon element', () => {
    const el = renderPitchedRoof(ctx) as EL;
    expect(React.isValidElement(el)).toBe(true);
    expect(el.type).toBe('polygon');
  });

  it('triangle spans full building width and bottom edge sits on roofY', () => {
    const el = renderPitchedRoof(ctx) as EL;
    // roofY=50, buildingWidth=100 → points contain "0,50" and "100,50"
    expect(el.props.points).toContain(`0,${ctx.roofY}`);
    expect(el.props.points).toContain(`${ctx.buildingWidth},${ctx.roofY}`);
  });

  it('height equals building width (1:1 pitch), apex defaults to horizontal centre', () => {
    const el = renderPitchedRoof(ctx) as EL;
    // bw=100 → h=100; no frontCornerX → apexX=50; apexY = 50-100 = -50
    const apexY = ctx.roofY - ctx.buildingWidth;
    const apexX = ctx.buildingWidth / 2;
    expect(el.props.points).toContain(`${apexX},${apexY}`);
  });

  it('apex x aligns with frontCornerX when provided', () => {
    const el = renderPitchedRoof({ ...ctx, frontCornerX: 35 }) as EL;
    const apexY = ctx.roofY - ctx.buildingWidth;
    expect(el.props.points).toContain(`35,${apexY}`);
  });

  it('uses accent color for fill (unshaded fallback)', () => {
    const el = renderPitchedRoof(ctx) as EL;
    expect(el.props.fill).toBe('hsl(180, 50%, 50%)');
  });
});

// ========================================
// PITCHED ROOF — SHADED VARIANT TESTS
// ========================================

describe('renderPitchedRoof — shaded', () => {
  const shadedCtx: GreebleRendererContext = {
    ...ctx,
    frontCornerX: 40,
    eastLMultiplier: 1.1,
    westLMultiplier: 0.5,
  };

  it('returns a React fragment when east/west multipliers are present', () => {
    const el = renderPitchedRoof(shadedCtx) as EL;
    expect(React.isValidElement(el)).toBe(true);
    expect(el.type).toBe(React.Fragment);
  });

  it('fragment contains exactly two polygon elements', () => {
    const el = renderPitchedRoof(shadedCtx) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe('polygon');
    expect(children[1].type).toBe('polygon');
  });

  it('front slope polygon has its diagonal from (0,roofY) to (frontCornerX, ridgeY)', () => {
    const el = renderPitchedRoof(shadedCtx) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const ridgeY = shadedCtx.roofY! - shadedCtx.frontCornerX!;
    const slope = children[0];
    expect(slope.props.points).toContain(`0,${shadedCtx.roofY}`);
    expect(slope.props.points).toContain(`${shadedCtx.frontCornerX},${shadedCtx.roofY}`);
    expect(slope.props.points).toContain(`${shadedCtx.frontCornerX},${ridgeY}`);
  });

  it('side wall polygon is a rectangle at ridge height over the side face', () => {
    const el = renderPitchedRoof(shadedCtx) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const ridgeY = shadedCtx.roofY! - shadedCtx.frontCornerX!;
    const wall = children[1];
    expect(wall.props.points).toContain(`${shadedCtx.frontCornerX},${ridgeY}`);
    expect(wall.props.points).toContain(`${shadedCtx.buildingWidth},${ridgeY}`);
    expect(wall.props.points).toContain(`${shadedCtx.buildingWidth},${shadedCtx.roofY}`);
  });

  it('front and side polygons have different fills', () => {
    const el = renderPitchedRoof(shadedCtx) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children[0].props.fill).not.toBe(children[1].props.fill);
  });
});

// ========================================
// PITCHED ROOF — LAYOUT/PAINT SPLIT
// (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md §1.4 — Task 2)
// ========================================

describe('computePitchedRoofLayout / paintPitchedRoof', () => {
  const shadedCtx: GreebleRendererContext = {
    ...ctx,
    frontCornerX: 40,
    eastLMultiplier: 1.1,
    westLMultiplier: 0.5,
  };

  it('returns null when frontCornerX is absent — the fallback-path signal', () => {
    expect(computePitchedRoofLayout(ctx)).toBeNull();
  });

  it('is identical regardless of eastLMultiplier/westLMultiplier/nightDepth/flickerEpoch — genuinely geometry-only', () => {
    const layoutA = computePitchedRoofLayout({
      ...shadedCtx, eastLMultiplier: 1.1, westLMultiplier: 0.5, nightDepth: 0.8, flickerEpoch: 3,
    });
    const layoutB = computePitchedRoofLayout({
      ...shadedCtx, eastLMultiplier: 0.2, westLMultiplier: 0.9, nightDepth: 0.1, flickerEpoch: 99,
    });
    expect(layoutA).toEqual(layoutB);
  });

  it('layout points match the shaded renderPitchedRoof output exactly', () => {
    const layout = computePitchedRoofLayout(shadedCtx)!;
    const ridgeY = shadedCtx.roofY! - shadedCtx.frontCornerX!;
    expect(layout.slopePoints).toBe(`0,${shadedCtx.roofY} ${shadedCtx.frontCornerX},${shadedCtx.roofY} ${shadedCtx.frontCornerX},${ridgeY}`);
    expect(layout.wallPoints).toBe(`${shadedCtx.frontCornerX},${ridgeY} ${shadedCtx.buildingWidth},${ridgeY} ${shadedCtx.buildingWidth},${shadedCtx.roofY} ${shadedCtx.frontCornerX},${shadedCtx.roofY}`);
  });

  it('paintPitchedRoof produces different fills for different lighting, given the identical layout', () => {
    const layout = computePitchedRoofLayout(shadedCtx);
    const dayEl = paintPitchedRoof(layout, { ...shadedCtx, eastLMultiplier: 1.1, westLMultiplier: 0.9 }) as EL;
    const nightEl = paintPitchedRoof(layout, { ...shadedCtx, eastLMultiplier: 0.2, westLMultiplier: 0.3 }) as EL;
    const dayChildren = React.Children.toArray(dayEl.props.children) as EL[];
    const nightChildren = React.Children.toArray(nightEl.props.children) as EL[];
    expect(dayChildren[0].props.fill).not.toBe(nightChildren[0].props.fill);
    expect(dayChildren[1].props.fill).not.toBe(nightChildren[1].props.fill);
  });

  it('paintPitchedRoof falls back to the unshaded single-polygon shape when layout is null', () => {
    const el = paintPitchedRoof(null, ctx) as EL;
    expect(el.type).toBe('polygon');
    expect(el.props.fill).toBe('hsl(180, 50%, 50%)');
  });

  it('renderPitchedRoof (compatibility wrapper) equals paintPitchedRoof(computePitchedRoofLayout(ctx), ctx)', () => {
    const wrapped = renderPitchedRoof(shadedCtx);
    const direct = paintPitchedRoof(computePitchedRoofLayout(shadedCtx), shadedCtx);
    expect(wrapped).toEqual(direct);
  });

  it('ROOFTOP_LAYOUT_PAINT.pitchedRoof wires the same compute/paint pair', () => {
    const entry = ROOFTOP_LAYOUT_PAINT.pitchedRoof!;
    expect(entry.compute(shadedCtx)).toEqual(computePitchedRoofLayout(shadedCtx));
  });
});

// ========================================
// CROWN SPIRE TESTS
// ========================================

describe('renderCrownSpire', () => {
  // seed=0 → stepCount = 2+(0%2) = 2 steps → 2 rects + 1 antenna = 3 children
  // seed=1 → stepCount = 2+(1%2) = 3 steps → 3 rects + 1 antenna = 4 children

  it('produces 3 children (2 steps + antenna) when seed is even', () => {
    const el = renderCrownSpire({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(3);
  });

  it('produces 4 children (3 steps + antenna) when seed is odd', () => {
    const el = renderCrownSpire({ ...ctx, seed: 1 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(4);
  });

  it('bottom step spans full building width', () => {
    // widthPcts[0] = 1.0 regardless of step count
    const el2 = renderCrownSpire({ ...ctx, seed: 0 }) as EL;
    const el3 = renderCrownSpire({ ...ctx, seed: 1 }) as EL;
    const firstOf2 = (React.Children.toArray(el2.props.children) as EL[])[0];
    const firstOf3 = (React.Children.toArray(el3.props.children) as EL[])[0];
    expect(firstOf2.props.width).toBe(ctx.buildingWidth);
    expect(firstOf3.props.width).toBe(ctx.buildingWidth);
  });

  it('each step height equals 15% of buildingHeight divided by step count', () => {
    const el2 = renderCrownSpire({ ...ctx, seed: 0 }) as EL;
    const children2 = React.Children.toArray(el2.props.children) as EL[];
    // 2 steps: stepH = 15/2 = 7.5
    expect(children2[0].props.height).toBeCloseTo(7.5);
    expect(children2[1].props.height).toBeCloseTo(7.5);

    const el3 = renderCrownSpire({ ...ctx, seed: 1 }) as EL;
    const children3 = React.Children.toArray(el3.props.children) as EL[];
    // 3 steps: stepH = 15/3 = 5
    expect(children3[0].props.height).toBeCloseTo(5);
  });

  it('antenna child is a rect 2px wide', () => {
    const el = renderCrownSpire({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const antenna = children[children.length - 1]; // last child
    expect(antenna.type).toBe('rect');
    expect(antenna.props.width).toBe(2);
  });

  it('antenna is centred horizontally', () => {
    const el = renderCrownSpire({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const antenna = children[children.length - 1];
    // antennaX = (buildingWidth - 2) / 2 = 49
    expect(antenna.props.x).toBeCloseTo((ctx.buildingWidth - 2) / 2);
  });

  it('antenna sits above the topmost step', () => {
    const el = renderCrownSpire({ ...ctx, seed: 0 }) as EL; // 2 steps
    const children = React.Children.toArray(el.props.children) as EL[];
    const topStep = children[1]; // highest tier (index 1 for 2 steps)
    const antenna = children[children.length - 1];
    // antenna bottom = antennaY + antennaH; top step bottom = its y
    // antenna top (antennaY) should be above top step's y
    expect(antenna.props.y).toBeLessThan(topStep.props.y);
  });
});

// ========================================
// CROWN SPIRE — SHADED VARIANT TESTS
// ========================================

describe('renderCrownSpire — shaded', () => {
  const shadedCtx: GreebleRendererContext = {
    ...ctx,
    frontCornerX: 40,
    eastLMultiplier: 1.1,
    westLMultiplier: 0.5,
  };

  it('produces 2*stepCount + 1 children (front+side per tier, antenna)', () => {
    const el2 = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL; // 2 tiers
    const el3 = renderCrownSpire({ ...shadedCtx, seed: 1 }) as EL; // 3 tiers
    expect(React.Children.toArray(el2.props.children)).toHaveLength(5);
    expect(React.Children.toArray(el3.props.children)).toHaveLength(7);
  });

  it('front rect right edge sits at frontCornerX for every tier', () => {
    const el = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    // front rects are at even indices (0, 2)
    [0, 2].forEach(idx => {
      const r = children[idx];
      expect(r.props.x + r.props.width).toBeCloseTo(shadedCtx.frontCornerX!);
    });
  });

  it('side rect left edge sits at frontCornerX for every tier', () => {
    const el = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    // side rects are at odd indices (1, 3)
    [1, 3].forEach(idx => {
      expect(children[idx].props.x).toBeCloseTo(shadedCtx.frontCornerX!);
    });
  });

  it('bottom tier front rect spans full front-face width (no inset at i=0)', () => {
    const el = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL;
    const frontBottom = (React.Children.toArray(el.props.children) as EL[])[0];
    // t=0 → leftX=0 → width = frontCornerX
    expect(frontBottom.props.x).toBeCloseTo(0);
    expect(frontBottom.props.width).toBeCloseTo(shadedCtx.frontCornerX!);
  });

  it('upper tiers are narrower than lower tiers on both faces', () => {
    const el = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL; // 2 tiers
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children[2].props.width).toBeLessThan(children[0].props.width); // front
    expect(children[3].props.width).toBeLessThan(children[1].props.width); // side
  });

  it('front and side rects have different fills', () => {
    const el = renderCrownSpire({ ...shadedCtx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    expect(children[0].props.fill).not.toBe(children[1].props.fill);
  });
});

// ========================================
// CROWN SPIRE — LAYOUT/PAINT SPLIT
// (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md §1.4 — Task 2)
// ========================================

describe('computeCrownSpireLayout / paintCrownSpire', () => {
  const shadedCtx: GreebleRendererContext = {
    ...ctx,
    frontCornerX: 40,
    eastLMultiplier: 1.1,
    westLMultiplier: 0.5,
  };

  it('is identical regardless of eastLMultiplier/westLMultiplier/nightDepth/flickerEpoch — genuinely geometry-only', () => {
    const layoutA = computeCrownSpireLayout({
      ...shadedCtx, seed: 0, eastLMultiplier: 1.1, westLMultiplier: 0.5, nightDepth: 0.8, flickerEpoch: 3,
    });
    const layoutB = computeCrownSpireLayout({
      ...shadedCtx, seed: 0, eastLMultiplier: 0.2, westLMultiplier: 0.9, nightDepth: 0.1, flickerEpoch: 99,
    });
    expect(layoutA).toEqual(layoutB);
  });

  it('produces one tier entry per step (2 for even seed, 3 for odd seed), plus one antenna', () => {
    const layout2 = computeCrownSpireLayout({ ...shadedCtx, seed: 0 });
    const layout3 = computeCrownSpireLayout({ ...shadedCtx, seed: 1 });
    expect(layout2.tiers).toHaveLength(2);
    expect(layout3.tiers).toHaveLength(3);
    expect(layout2.antenna).toBeDefined();
    expect(layout3.antenna).toBeDefined();
  });

  it('falls back to the unshaded tier-width shape when frontCornerX/eastL/westL are absent', () => {
    const layout = computeCrownSpireLayout({ ...ctx, seed: 0 });
    // Unshaded fallback has no per-face split — tiers carry a single `width`, not `frontW`/`sideW`.
    expect(layout.tiers[0]).not.toHaveProperty('frontW');
    expect(layout.tiers[0]).toHaveProperty('width');
  });

  it('paintCrownSpire produces different fills for different lighting, given the identical layout', () => {
    const layout = computeCrownSpireLayout({ ...shadedCtx, seed: 0 });
    const dayEl = paintCrownSpire(layout, { ...shadedCtx, seed: 0, eastLMultiplier: 1.1, westLMultiplier: 0.9 }) as EL;
    const nightEl = paintCrownSpire(layout, { ...shadedCtx, seed: 0, eastLMultiplier: 0.2, westLMultiplier: 0.3 }) as EL;
    const dayChildren = React.Children.toArray(dayEl.props.children) as EL[];
    const nightChildren = React.Children.toArray(nightEl.props.children) as EL[];
    expect(dayChildren[0].props.fill).not.toBe(nightChildren[0].props.fill);
  });

  it('renderCrownSpire (compatibility wrapper) equals paintCrownSpire(computeCrownSpireLayout(ctx), ctx)', () => {
    const testCtx = { ...shadedCtx, seed: 1 };
    const wrapped = renderCrownSpire(testCtx);
    const direct = paintCrownSpire(computeCrownSpireLayout(testCtx), testCtx);
    expect(wrapped).toEqual(direct);
  });

  it('ROOFTOP_LAYOUT_PAINT.crownSpire wires the same compute/paint pair', () => {
    const entry = ROOFTOP_LAYOUT_PAINT.crownSpire!;
    const testCtx = { ...shadedCtx, seed: 0 };
    expect(entry.compute(testCtx)).toEqual(computeCrownSpireLayout(testCtx));
  });
});

describe('ROOFTOP_LAYOUT_PAINT registry shape', () => {
  it('contains exactly the lighting-dependent greebles — every other RooftopGreeble is absent', () => {
    // pitchedRoof/crownSpire read the east/west multipliers; machinery/waterTower/steppeRoof joined
    // them in Phase 44 because their world gem ring needs the hour (docs/specs/WORLD_GEM_MATERIAL.md
    // assumption 7). antennae, cupola and pipesValves stay static: their hairline never changes.
    expect(Object.keys(ROOFTOP_LAYOUT_PAINT).sort()).toEqual(
      ['crownSpire', 'machinery', 'pitchedRoof', 'steppeRoof', 'waterTower'],
    );
  });
});

// ========================================
// ANTENNAE TESTS
// ========================================

describe('renderAntennae', () => {
  // seed=0: lineW=2+(0%3)=2, heightPct=0.10+(0/100*0.15)=0.10 → NOT tall → 2 children
  // seed=50: lineW=2+(50%3)=2+2=4, heightPct=0.10+(50/100*0.15)=0.175 → tall → 3 children

  it('returns fragment with shaft and top light when not tall (seed=0)', () => {
    const el = renderAntennae({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(2);
  });

  it('returns 3 children (shaft + top light + mid light) when tall (seed=50)', () => {
    const el = renderAntennae({ ...ctx, seed: 50 }) as EL;
    const children = React.Children.toArray(el.props.children);
    expect(children).toHaveLength(3);
  });

  it('shaft is a rect with width matching seed-derived lineW', () => {
    // seed=0: lineW = 2+(0%3) = 2
    const el = renderAntennae({ ...ctx, seed: 0 }) as EL;
    const shaft = (React.Children.toArray(el.props.children) as EL[])[0];
    expect(shaft.type).toBe('rect');
    expect(shaft.props.width).toBe(2);

    // seed=2: lineW = 2+(2%3) = 4
    const el2 = renderAntennae({ ...ctx, seed: 2 }) as EL;
    const shaft2 = (React.Children.toArray(el2.props.children) as EL[])[0];
    expect(shaft2.props.width).toBe(4);
  });

  it('shaft height is 10% of buildingHeight for seed=0', () => {
    const el = renderAntennae({ ...ctx, seed: 0 }) as EL;
    const shaft = (React.Children.toArray(el.props.children) as EL[])[0];
    // heightPct=0.10, lineH=100*0.10=10
    expect(shaft.props.height).toBeCloseTo(10);
  });

  it('top light is a circle filled with indicator.powered color', () => {
    const el = renderAntennae({ ...ctx, seed: 0 }) as EL;
    const topLight = (React.Children.toArray(el.props.children) as EL[])[1];
    expect(topLight.type).toBe('circle');
    expect(topLight.props.fill).toBe('hsl(111, 100%, 54%)');
  });

  it('mid light is a circle at the shaft midpoint when tall', () => {
    const el = renderAntennae({ ...ctx, seed: 50 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const midLight = children[2];
    expect(midLight.type).toBe('circle');
    // lineH=100*0.175=17.5, lineY=50-17.5=32.5, midY=32.5+17.5*0.5=41.25
    expect(midLight.props.cy).toBeCloseTo(41.25);
  });

  it('shaft is centred horizontally', () => {
    // seed=0: lineW=2, lineX=(100-2)/2=49
    const el = renderAntennae({ ...ctx, seed: 0 }) as EL;
    const shaft = (React.Children.toArray(el.props.children) as EL[])[0];
    expect(shaft.props.x).toBeCloseTo(49);
  });
});

// ========================================
// MACHINERY TESTS
// ========================================

describe('renderMachinery', () => {
  // seed=0 → first LCG value ≈ 0.236 < 0.3, so col 0 always renders a stack
  it('returns a non-null element for seed=0 (known stack-generating seed)', () => {
    const el = renderMachinery({ ...ctx, seed: 0 }) as EL;
    expect(el).not.toBeNull();
    expect(React.isValidElement(el)).toBe(true);
  });

  it('is deterministic: two calls with the same seed produce the same child count', () => {
    const el1 = renderMachinery({ ...ctx, seed: 42 }) as EL | null;
    const el2 = renderMachinery({ ...ctx, seed: 42 }) as EL | null;
    const count1 = el1 ? React.Children.toArray(el1.props.children).length : 0;
    const count2 = el2 ? React.Children.toArray(el2.props.children).length : 0;
    expect(count1).toBe(count2);
  });

  it('different seeds can produce different child counts', () => {
    // With many seeds tried, the independent LCG sequences will diverge
    const counts = [0, 1, 2, 3, 100, 999].map((seed) => {
      const el = renderMachinery({ ...ctx, seed }) as EL | null;
      return el ? React.Children.toArray(el.props.children).length : 0;
    });
    const unique = new Set(counts);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('all stack rects are positioned above roofY', () => {
    const el = renderMachinery({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    for (const child of children) {
      expect(child.type).toBe('rect');
      // y is the top of the rect; y + height == roofY (bottom sits on roof)
      expect(child.props.y + child.props.height).toBeCloseTo(ctx.roofY);
    }
  });

  it('colCount is capped at 8 for wide buildings', () => {
    // bw=400: 5 + floor(400/40) = 5+10 = 15, capped at 8
    // Render many stacks by lowering the threshold: use a seed where prng<0.3 fires often.
    // We verify the total stacks can never exceed 8 regardless of seed.
    const wideCtx = { ...ctx, buildingWidth: 400 };
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const result = renderMachinery({ ...wideCtx, seed });
      const el = result as EL | null;
      const count = el ? React.Children.toArray(el.props.children).length : 0;
      expect(count).toBeLessThanOrEqual(8);
    }
  });
});

// ========================================
// WATER TOWER TESTS
// ========================================

describe('renderWaterTower', () => {
  // seed=0: stiltCount=2+(0%3)=2  → 2 stilts + 1 body + 1 cap = 4 children
  // seed=1: stiltCount=3          → 5 children
  // seed=2: stiltCount=4          → 6 children

  it('produces 4 children (2 stilts + body + cap) for seed=0', () => {
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    expect(React.Children.toArray(el.props.children)).toHaveLength(4);
  });

  it('produces 5 children (3 stilts + body + cap) for seed=1', () => {
    const el = renderWaterTower({ ...ctx, seed: 1 }) as EL;
    expect(React.Children.toArray(el.props.children)).toHaveLength(5);
  });

  it('produces 6 children (4 stilts + body + cap) for seed=2', () => {
    const el = renderWaterTower({ ...ctx, seed: 2 }) as EL;
    expect(React.Children.toArray(el.props.children)).toHaveLength(6);
  });

  it('body rect is present with correct dimensions for seed=0', () => {
    // totalH=15, thirdH=5, totalW=15, leftX=42.5
    // elements order: [body, cap, stilt0, stilt1] → body is index 0
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const body = children[0]; // body pushed first
    expect(body).toBeDefined();
    expect(body.type).toBe('rect');
    expect(body.props.width).toBeCloseTo(15);
    expect(body.props.height).toBeCloseTo(5);
    expect(body.props.y).toBeCloseTo(40); // 50 - 2*5
  });

  it('cap is a polygon element', () => {
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const cap = children[1]; // cap pushed second
    expect(cap).toBeDefined();
    expect(cap.type).toBe('polygon');
  });

  it('cap apex y is above body (closer to top of building)', () => {
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const body = children[0];
    const cap = children[1];
    // apex y = roofY - totalH; body.y = roofY - 2*thirdH
    // apex should have lower y (higher on screen) than body.y
    const apexY = parseFloat(cap.props.points.split(' ')[2].split(',')[1]);
    expect(apexY).toBeLessThan(body.props.y);
  });

  it('stilts are 2px wide rects', () => {
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const stilts = children.filter((c) => (c.key as string).includes('stilt')) as EL[];
    expect(stilts).toHaveLength(2);
    for (const s of stilts) {
      expect(s.type).toBe('rect');
      expect(s.props.width).toBe(2);
    }
  });

  it('tower is horizontally centred (body x centred in buildingWidth)', () => {
    const el = renderWaterTower({ ...ctx, seed: 0 }) as EL;
    const children = React.Children.toArray(el.props.children) as EL[];
    const body = children[0]; // body is index 0
    // leftX = (bw - totalW) / 2; with bw=100, totalW=15 → leftX=42.5
    expect(body.props.x).toBeCloseTo(42.5);
  });
});

// ========================================
// CUPOLA TESTS
// ========================================

describe('renderCupola', () => {
  // renderCupola returns the filled dome followed by its hairline arc (Phase 44); these tests are
  // about the dome. The arc has its own tests in rooftopHairlines.test.tsx.
  const dome = (c: GreebleRendererContext): EL => {
    const el = renderCupola(c) as EL;
    return el.type === React.Fragment ? (React.Children.toArray(el.props.children)[0] as EL) : el;
  };

  it('returns a path element', () => {
    const el = dome(ctx);
    expect(React.isValidElement(el)).toBe(true);
    expect(el.type).toBe('path');
  });

  it('path contains an arc command (A)', () => {
    const el = dome(ctx);
    expect(el.props.d).toContain('A');
  });

  it('path base points lie on roofY', () => {
    const el = dome(ctx);
    // d = "M cx-rx,roofY A rx,ry 0 0 1 cx+rx,roofY Z"
    expect(el.props.d).toContain(`,${ctx.roofY}`);
  });

  it('dome spans 40% of buildingWidth for seed=0', () => {
    // cupolaW = 100*(0.4 + (0%100)/100*0.2) = 40 → rx=20, cx=50
    // arc start x = 50-20=30, arc end x = 50+20=70
    const el = dome({ ...ctx, seed: 0 });
    expect(el.props.d).toContain('M 30,50');
    expect(el.props.d).toContain('70,50');
  });

  it('dome spans 50% of buildingWidth for seed=50', () => {
    // cupolaW = 100*(0.4 + (50%100)/100*0.2) = 100*(0.4+0.1) = 50 → rx=25
    // arc start x = 50-25=25, arc end x = 50+25=75
    const el = dome({ ...ctx, seed: 50 });
    expect(el.props.d).toContain('M 25,50');
    expect(el.props.d).toContain('75,50');
  });

  it('uses accent color for fill', () => {
    const el = dome(ctx);
    expect(el.props.fill).toBe('hsl(180, 50%, 50%)');
  });

  it('dome height (ry) is 12% of buildingHeight', () => {
    // cupolaH = 100*0.12 = 12; encoded in arc as second radius "A rx,12 ..."
    const el = dome({ ...ctx, seed: 0 });
    // d: "M 30,50 A 20,12 0 0 1 70,50 Z"
    expect(el.props.d).toContain('A 20,12');
  });
});
