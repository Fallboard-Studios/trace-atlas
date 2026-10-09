/**
 * Hairlines on the thin rooftop parts (docs/specs/WORLD_GEM_MATERIAL.md §1.3, §1.6, assumption 7;
 * plan Task 12): the antennae shaft, pipesValves' pipes and valve discs, waterTower's stilts and
 * crownSpire's antenna rod take the 1.5 px hairline, and the cupola takes it along its arc only.
 * Lamps (the antenna's indicator lights) and every block that takes a ring are left alone.
 * The hairline's colour is fixed, so none of this depends on the hour.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  ROOFTOP_RENDERERS,
  renderAntennae,
  renderCrownSpire,
  renderCupola,
  renderMachinery,
  renderPipesValves,
  renderPitchedRoof,
  renderSteppeRoof,
  renderWaterTower,
} from './rooftopGreebles';
import type { GreebleElement, GreebleRendererContext } from './greebleTypes';
import { gemOutlineStroke } from '../scenery/gemShape';
import { WORLD_GEM } from '../material/worldGemMaterial';

const BASE: GreebleRendererContext = {
  buildingWidth: 200,
  buildingHeight: 400,
  roofY: 100,
  seed: 0,
  colors: {
    body: { h: 0, s: 0, l: 0 },
    accent: { h: 180, s: 50, l: 50 },
    greeble: { h: 90, s: 40, l: 40 },
    illuminated: { h: 0, s: 0, l: 0 },
  },
  lMultiplier: 0.7,
  eastLMultiplier: 1.05,
  westLMultiplier: 0.346,
  frontCornerX: 120,
};
const SEEDS = [0, 1, 2, 3, 7, 50, 99];

function draw(el: GreebleElement | null): HTMLElement {
  const { container } = render(<svg>{el}</svg>);
  return container;
}
const stroke = (el: Element) => el.getAttribute('stroke');
const width = (el: Element) => el.getAttribute('stroke-width');
const isHairline = (el: Element) => stroke(el) === gemOutlineStroke() && width(el) === '1.5';
const unstroked = (el: Element) => stroke(el) === null && width(el) === null;

/** Run `body` with the members switch off, restoring it whatever happens. */
function withMembersOff(body: () => void) {
  const switches = WORLD_GEM as { members: boolean };
  switches.members = false;
  try {
    body();
  } finally {
    switches.members = true;
  }
}

describe('antennae', () => {
  it('puts the hairline on the shaft and nowhere else', () => {
    for (const seed of [0, 50]) {
      const c = draw(renderAntennae({ ...BASE, seed }));
      const rects = c.querySelectorAll('rect');
      expect(rects).toHaveLength(1);
      expect(isHairline(rects[0])).toBe(true);
    }
  });

  it('leaves the indicator lights as lamps: no stroke on the top or mid light', () => {
    const c = draw(renderAntennae({ ...BASE, seed: 50 })); // tall: top + mid light
    const lights = c.querySelectorAll('circle');
    expect(lights).toHaveLength(2);
    for (const light of Array.from(lights)) expect(unstroked(light)).toBe(true);
  });
});

describe('pipesValves', () => {
  it('puts the hairline on every pipe and every valve disc', () => {
    for (const seed of SEEDS) {
      const c = draw(renderPipesValves({ ...BASE, seed }));
      const parts = Array.from(c.querySelectorAll('rect, circle'));
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts) expect(isHairline(part)).toBe(true);
    }
  });

  it('keeps its fill and geometry: only the stroke is added', () => {
    let plain = '';
    withMembersOff(() => {
      plain = draw(renderPipesValves({ ...BASE, seed: 3 })).innerHTML;
    });
    const lined = draw(renderPipesValves({ ...BASE, seed: 3 })).innerHTML;
    expect(plain).not.toContain('stroke');
    expect(lined).toContain('stroke');
    expect(lined.replace(/ stroke="[^"]*"/g, '').replace(/ stroke-width="[^"]*"/g, '')).toBe(plain);
  });
});

describe('waterTower', () => {
  it('puts the hairline on every stilt', () => {
    for (const seed of [0, 1, 2]) {
      const c = draw(renderWaterTower({ ...BASE, seed }));
      const rects = Array.from(c.querySelectorAll('rect'));
      const stilts = rects.slice(1); // the body is first
      expect(stilts).toHaveLength(2 + (seed % 3));
      for (const stilt of stilts) expect(isHairline(stilt)).toBe(true);
    }
  });

  it('leaves the tank body (a ringed block) and the cap unstroked', () => {
    const c = draw(renderWaterTower({ ...BASE, seed: 0 }));
    expect(unstroked(c.querySelector('rect')!)).toBe(true);
    expect(unstroked(c.querySelector('polygon')!)).toBe(true);
  });
});

describe('crownSpire', () => {
  it.each([
    ['shaded', BASE],
    ['unshaded fallback', { ...BASE, eastLMultiplier: undefined, westLMultiplier: undefined, frontCornerX: undefined }],
  ])('%s: the antenna rod takes the hairline, the tiers do not', (_name, ctx) => {
    for (const seed of [0, 1]) {
      const rects = Array.from(draw(renderCrownSpire({ ...ctx, seed })).querySelectorAll('rect'));
      const rod = rects[rects.length - 1];
      expect(isHairline(rod)).toBe(true);
      for (const tier of rects.slice(0, -1)) expect(unstroked(tier)).toBe(true);
    }
  });
});

describe('cupola: the hairline runs along the arc only', () => {
  const paths = (seed = 50) => Array.from(draw(renderCupola({ ...BASE, seed })).querySelectorAll('path'));

  it('is the filled dome followed by exactly one extra open path', () => {
    expect(paths()).toHaveLength(2);
  });

  it('leaves the filled dome unstroked: its base edge is not outlined', () => {
    const [dome] = paths();
    expect(dome.getAttribute('fill')).toBe('hsl(180, 50%, 50%)');
    expect(dome.getAttribute('d')).toMatch(/Z$/);
    expect(unstroked(dome)).toBe(true);
  });

  it('draws the arc with the hairline, fill none, after the dome', () => {
    const [, arc] = paths();
    expect(isHairline(arc)).toBe(true);
    expect(arc.getAttribute('fill')).toBe('none');
  });

  it('starts at (cx - rx, roofY), ends at (cx + rx, roofY) and never closes', () => {
    // seed 50: cupolaW = 200 * 0.5 = 100, rx = 50, cx = 100 -> 50 .. 150 along roofY = 100
    const [dome, arc] = paths(50);
    const d = arc.getAttribute('d')!;
    expect(d).toMatch(/^M 50,100 A /);
    expect(d).toMatch(/150,100$/);
    expect(d).not.toContain('Z');
    // the same arc the dome fills
    expect(dome.getAttribute('d')!.replace(/ Z$/, '')).toBe(d);
  });

  it('follows the dome for every seed: its ends sit on the dome\'s ends', () => {
    for (const seed of SEEDS) {
      const [dome, arc] = paths(seed);
      expect(dome.getAttribute('d')!.startsWith(arc.getAttribute('d')!)).toBe(true);
    }
  });
});

describe('what takes a ring takes no hairline', () => {
  it.each([
    ['machinery', () => renderMachinery({ ...BASE, seed: 0 })],
    ['steppeRoof', () => renderSteppeRoof({ ...BASE, seed: 2 })],
    ['pitchedRoof', () => renderPitchedRoof(BASE)],
  ])('%s: no fill rect or polygon carries a stroke', (_name, make) => {
    const c = draw(make());
    for (const el of Array.from(c.querySelectorAll('rect, polygon'))) expect(unstroked(el)).toBe(true);
  });
});

describe('with the members switch off every renderer is as it was', () => {
  it.each(Object.keys(ROOFTOP_RENDERERS) as Array<keyof typeof ROOFTOP_RENDERERS>)('%s draws no stroke', (type) => {
    withMembersOff(() => {
      for (const seed of SEEDS) {
        const el = ROOFTOP_RENDERERS[type]({ ...BASE, seed });
        if (el) expect(draw(el).querySelectorAll('[stroke], [stroke-width]')).toHaveLength(0);
      }
    });
  });

  it('cupola is the single filled path again, not a dome and an arc', () => {
    withMembersOff(() => {
      const el = renderCupola({ ...BASE, seed: 50 }) as GreebleElement;
      expect(el.type).toBe('path');
      expect(el.props.d).toMatch(/Z$/);
    });
  });
});

describe('the hairline does not depend on the hour', () => {
  it('antennae, pipesValves and cupola are identical for any lighting, so they can stay static', () => {
    const day = { ...BASE, lMultiplier: 1, eastLMultiplier: 1.05, westLMultiplier: 0.9, nightDepth: 0 };
    const night = { ...BASE, lMultiplier: 0.2, eastLMultiplier: 0.3, westLMultiplier: 0.3, nightDepth: 1 };
    for (const render_ of [renderAntennae, renderPipesValves, renderCupola]) {
      expect(draw(render_({ ...day, seed: 50 })).innerHTML).toBe(draw(render_({ ...night, seed: 50 })).innerHTML);
    }
  });
});
