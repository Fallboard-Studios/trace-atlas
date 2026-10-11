/**
 * The hairline on the six remaining families (docs/specs/WORLD_GEM_MATERIAL.md §1.3, §1.6, plan
 * Task 17): dish, turbine, floodlight, tether, pipeline and the pipe bridges. Every thin member and
 * curve takes the 1.5 px outline in the scenery gem outline's colour, including the elements
 * inside the rotate(45) groups. The lit bars, beams, pools, highlight strip, valve, float, hub
 * light and centre light are left exactly as they are.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { dish } from './dish';
import { turbine } from './turbine';
import { floodlight } from './floodlight';
import { tether } from './tether';
import { pipeline } from './pipeline';
import { PipeBridges } from '../pipeBridges';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor, type SceneryKind } from '../../../../types/Actor';
import { gemOutlineStroke } from '../gemShape';
import { createFactory, getRecipeRow } from '../../../../systems/factoryPlacementSystem';
import { selectVariantFromSeed, VARIANT_CONF } from '../../factoryVariants';
import { calcSilhouetteSize } from '../../silhouetteUtils';
import { withSwitch } from '../../material/ringTestHelpers';

function ctxFor(kind: SceneryKind, params: SceneryContext['params'], overrides: Partial<SceneryContext> = {}): SceneryContext {
  const actor: Actor = {
    id: `${kind}-fixture`,
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind, district: 'ventfield', row: 3 },
  };
  return { actor, params, cap: 1, eastL: 0.9, westL: 0.5, nightDepth: 0.5, accent: { primary: 0, secondary: 30 }, gems: true, ...overrides };
}

const DISH = (o: Partial<SceneryContext> = {}, tiltRight = true) => ctxFor('dish', { dish: { w: 80, rx: 40, postH: 130, tiltRight } }, o);
const TURBINE = (o: Partial<SceneryContext> = {}) => ctxFor('turbine', { turbine: { w: 150, postH: 220, bladeR: 75 } }, o);
const FLOOD = (o: Partial<SceneryContext> = {}, headOffset = 8) => ctxFor('floodlight', { floodlight: { w: 40, mastH: 250, headOffset } }, o);
const TETHER = (o: Partial<SceneryContext> = {}, hasFloat = true) => ctxFor('tether', { tether: { w: 36, h1: 200, dx: 60, hasFloat } }, o);
const PIPELINE = (o: Partial<SceneryContext> = {}, w = 500, riserRight = true) =>
  ctxFor('pipeline', { pipeline: { w, d: 18, e: 46, riserH: 150, riserRight } }, o);

const draw = (el: ReturnType<typeof dish>) => render(el).container;
const isHairline = (el: Element) => el.getAttribute('stroke') === gemOutlineStroke() && el.getAttribute('stroke-width') === '1.5';
const bare = (el: Element) => el.getAttribute('stroke') === null && el.getAttribute('stroke-width') === null;
const part = (c: HTMLElement, attr: string, value: string) => Array.from(c.querySelectorAll(`[${attr}="${value}"]`));

function expectAll(c: HTMLElement, attr: string, names: string[], test: (el: Element) => boolean, atLeast = 1) {
  for (const name of names) {
    const els = part(c, attr, name);
    expect(els.length, name).toBeGreaterThanOrEqual(atLeast);
    for (const el of els) expect(test(el), name).toBe(true);
  }
}

describe('dish', () => {
  it('puts the hairline on the post, the reflector curve and the feed', () => {
    expectAll(draw(dish(DISH())), 'data-dish', ['post', 'reflector', 'feed'], isHairline);
  });

  it('reaches the elements inside the rotate(45) group, both tilts', () => {
    for (const tiltRight of [true, false]) {
      const c = draw(dish(DISH({}, tiltRight)));
      const rotated = c.querySelector('g[transform^="rotate"]')!;
      expect(rotated.querySelectorAll('[stroke-width="1.5"]')).toHaveLength(2); // reflector and feed
    }
  });

  it('leaves the centre light a lamp', () => {
    expectAll(draw(dish(DISH())), 'data-dish', ['centre-light'], bare);
  });
});

describe('turbine', () => {
  it('puts the hairline on the post, the nacelle, both blades and the hub circle', () => {
    const c = draw(turbine(TURBINE()));
    expectAll(c, 'data-turbine', ['post', 'nacelle', 'hub'], isHairline);
    expectAll(c, 'data-turbine', ['blade'], isHairline, 2);
    expect(part(c, 'data-turbine', 'blade')).toHaveLength(2);
  });

  it('reaches the blades inside the rotate group', () => {
    const rotated = draw(turbine(TURBINE())).querySelector('g[transform^="rotate"]')!;
    expect(rotated.querySelectorAll('[stroke-width="1.5"]')).toHaveLength(2);
  });

  it('leaves the hub light a lamp', () => {
    expectAll(draw(turbine(TURBINE())), 'data-turbine', ['hub-light'], bare);
  });
});

describe('floodlight', () => {
  it('puts the hairline on the mast, the arm and the head', () => {
    expectAll(draw(floodlight(FLOOD())), 'data-floodlight', ['mast', 'arm', 'head'], isHairline);
  });

  it('keeps the arm outlined for a head on either side of the mast', () => {
    for (const headOffset of [-14, 14]) expectAll(draw(floodlight(FLOOD({}, headOffset))), 'data-floodlight', ['arm'], isHairline);
  });

  it('leaves the lit bar, the translucent beam and the ground pool exactly as they are', () => {
    expectAll(draw(floodlight(FLOOD())), 'data-floodlight', ['lit-bar', 'beam', 'pool'], bare);
  });
});

describe('tether', () => {
  it('puts the hairline on the anchor, the line, the dog-leg and the riser', () => {
    expectAll(draw(tether(TETHER())), 'data-tether', ['anchor', 'line', 'dogleg', 'riser'], isHairline);
  });

  it('leaves the float a lamp, and draws no float when there is none', () => {
    expectAll(draw(tether(TETHER())), 'data-tether', ['float'], bare);
    expect(part(draw(tether(TETHER({}, false))), 'data-tether', 'float')).toHaveLength(0);
  });
});

describe('pipeline', () => {
  it('puts the hairline on every stanchion, the pipe, the riser and the flange', () => {
    const c = draw(pipeline(PIPELINE()));
    expectAll(c, 'data-pipeline', ['pipe', 'riser', 'flange'], isHairline);
    expectAll(c, 'data-pipeline', ['stanchion'], isHairline, 2);
  });

  it('outlines every stanchion on short and long pipelines, with the riser at either end', () => {
    for (const [w, riserRight] of [[260, true], [420, false], [620, true]] as const) {
      const c = draw(pipeline(PIPELINE({}, w, riserRight)));
      expectAll(c, 'data-pipeline', ['stanchion'], isHairline);
      expect(part(c, 'data-pipeline', 'stanchion')).toHaveLength(Math.floor((w - 60) / 110) + 1);
    }
  });

  it('leaves the highlight strip and the valve exactly as they are', () => {
    expectAll(draw(pipeline(PIPELINE())), 'data-pipeline', ['highlight', 'valve'], bare);
  });
});

describe('pipe bridges', () => {
  function widthOf(id: string, x: number, row: number): number {
    const available = getRecipeRow('dense', row)?.variants;
    const { variant, noiseValue } = selectVariantFromSeed(id, x, row, available);
    return calcSilhouetteSize(noiseValue, VARIANT_CONF[variant].sizeRange).width;
  }
  const bridge = (gap: number, row = 0) => {
    const xA = 400;
    const idA = `hair-a-${gap}`;
    const idB = `hair-b-${gap}`;
    const xB = xA + widthOf(idA, xA, row) + gap;
    const factories = [createFactory({ x: xA, y: 1000 }, row, 1, idA), createFactory({ x: xB, y: 1000 }, row, 1, idB)];
    return render(<svg><PipeBridges factories={factories} /></svg>).container;
  };

  it('puts the hairline on the bar and the post', () => {
    for (const gap of [80, 120, 240]) {
      const c = bridge(gap);
      expectAll(c, 'data-pipe-bridge-part', ['bar', 'post'], isHairline);
    }
  });

  it('draws nothing (so no stray hairline) when no pair is close enough to bridge', () => {
    expect(bridge(40).querySelectorAll('[data-pipe-bridge]')).toHaveLength(0);
  });
});

describe('the switch, the hour, and the grid', () => {
  const ALL: Array<[string, () => HTMLElement]> = [
    ['dish', () => draw(dish(DISH()))],
    ['turbine', () => draw(turbine(TURBINE()))],
    ['floodlight', () => draw(floodlight(FLOOD()))],
    ['tether', () => draw(tether(TETHER()))],
    ['pipeline', () => draw(pipeline(PIPELINE()))],
  ];

  it.each(ALL)('%s: with the others switch off nothing carries the 1.5 px hairline', (_name, make) => {
    withSwitch('others', false, () => {
      expect(make().querySelectorAll('[stroke-width="1.5"], [stroke]')).toHaveLength(0);
    });
  });

  it.each(ALL)('%s: the members switch does not touch it', (_name, make) => {
    withSwitch('members', false, () => {
      expect(make().querySelectorAll('[stroke-width="1.5"]').length).toBeGreaterThan(0);
    });
  });

  it('with the others switch off the pipe bridges draw no stroke either', () => {
    withSwitch('others', false, () => {
      const factories = [createFactory({ x: 400, y: 1000 }, 0, 1, 'sw-a'), createFactory({ x: 900, y: 1000 }, 0, 1, 'sw-b')];
      const c = render(<svg><PipeBridges factories={factories} /></svg>).container;
      expect(c.querySelectorAll('[stroke]')).toHaveLength(0);
    });
  });

  it('the hairline colour never changes with the hour or the depth cap', () => {
    const strokes = (c: HTMLElement) => new Set(Array.from(c.querySelectorAll('[stroke-width="1.5"]')).map((e) => e.getAttribute('stroke')));
    const day = draw(turbine(TURBINE({ eastL: 1.05, westL: 0.9, nightDepth: 0, cap: 1 })));
    const night = draw(turbine(TURBINE({ eastL: 0.3, westL: 0.3, nightDepth: 1, cap: 0.5 })));
    expect([...strokes(day)]).toEqual([gemOutlineStroke()]);
    expect([...strokes(night)]).toEqual([gemOutlineStroke()]);
  });

  it('no NaN anywhere and every edge still 90/45 (the rotate groups are exempt), across 50 sizes', () => {
    for (let i = 0; i < 50; i++) {
      for (const el of [
        dish(ctxFor('dish', { dish: { w: 60 + (i % 41), rx: 30 + (i % 21), postH: 90 + i, tiltRight: i % 2 === 0 } })),
        turbine(ctxFor('turbine', { turbine: { w: 120 + i * 2, postH: 170 + i * 2, bladeR: 60 + (i % 36) } })),
        floodlight(ctxFor('floodlight', { floodlight: { w: 40, mastH: 190 + i * 2, headOffset: -14 + (i % 28) } })),
        tether(ctxFor('tether', { tether: { w: 36, h1: 140 + i * 2, dx: 40 + (i % 51), hasFloat: i % 2 === 0 } })),
        pipeline(ctxFor('pipeline', { pipeline: { w: 260 + i * 8, d: 18, e: 46, riserH: 150, riserRight: i % 2 === 0 } })),
      ]) {
        const c = draw(el);
        assertNinetyFortyFive(c);
        expect(c.innerHTML).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
