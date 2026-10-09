/**
 * The hairline on the members (docs/specs/WORLD_GEM_MATERIAL.md §1.3, §1.6, plan Task 16): the
 * pylon tower and cross-arms, the scaffold's posts, levels and braces, the crane's posts, beam,
 * brace and hanger, the dome's mast and the arc along its cap, and the beacon's mast and foot
 * plate each carry a 1.5 px outline in the scenery gem outline's colour. Gem heads, lamps, the
 * portholes, the hatch plate and every ringed mass are left alone.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { pylon } from './pylon';
import { scaffold } from './scaffold';
import { crane, craneLayout } from './crane';
import { dome } from './dome';
import { beacon } from './beacon';
import { assertNinetyFortyFive } from '../sceneryTestHelpers';
import type { SceneryContext } from '../sceneryTypes';
import { ActorType, type Actor, type SceneryKind } from '../../../../types/Actor';
import { gemOutlineStroke } from '../gemShape';
import { withSwitch } from '../../material/ringTestHelpers';

function ctxFor(kind: SceneryKind, params: SceneryContext['params'], overrides: Partial<SceneryContext> = {}, config: Actor['config'] = {}): SceneryContext {
  const actor: Actor = {
    id: `${kind}-fixture`,
    type: ActorType.SCENERY,
    position: { x: 500, y: 1030 },
    isActive: false,
    config: { kind, district: 'dense', row: 3, hueShift: 10, satShift: -5, ...config },
  };
  return { actor, params, cap: 1, eastL: 0.9, westL: 0.5, nightDepth: 0.4, accent: { primary: 210, secondary: 30 }, gems: true, ...overrides };
}

const PYLON = (o: Partial<SceneryContext> = {}) => ctxFor('pylon', { pylon: { w: 70, h: 320 } }, o);
const SCAFFOLD = (o: Partial<SceneryContext> = {}, c: Actor['config'] = {}) =>
  ctxFor('scaffold', { scaffold: { w: 200, h: 300, bays: 3, solidFrac: 0.3, hueShift: 10, satShift: -5 } }, o, c);
const CRANE = (o: Partial<SceneryContext> = {}, hangerFrac = 0.5) => ctxFor('crane', { crane: { w: 300, h: 320, hangerFrac } }, o);
const DOME = (o: Partial<SceneryContext> = {}) =>
  ctxFor('dome', { dome: { w: 200, bh: 40, ry: 70, portholes: 4, portholeLitRoll: [0.1, 0.3, 0.5, 0.7], hueShift: 10, satShift: -5 } }, o);
const BEACON = (o: Partial<SceneryContext> = {}) => ctxFor('beacon', { beacon: { w: 60, mastH: 160, gemW: 48 } }, o);

const draw = (el: ReturnType<typeof pylon>) => render(el).container;
const isHairline = (el: Element) => el.getAttribute('stroke') === gemOutlineStroke() && el.getAttribute('stroke-width') === '1.5';
const bare = (el: Element) => el.getAttribute('stroke') === null && el.getAttribute('stroke-width') === null;
const part = (c: HTMLElement, attr: string, value: string) => Array.from(c.querySelectorAll(`[${attr}="${value}"]`));
const num = (el: Element, a: string) => Number(el.getAttribute(a));

describe('pylon: tower and cross-arms', () => {
  it('puts the hairline on the tower polygon and each of the three cross-arms', () => {
    const c = draw(pylon(PYLON()));
    const own = Array.from(c.querySelectorAll('[data-scenery="pylon"] > polygon, [data-scenery="pylon"] > rect'));
    expect(own).toHaveLength(4);
    for (const el of own) expect(isHairline(el)).toBe(true);
  });

  it('leaves the gem head alone: it keeps its own 2 px outline and nothing in it takes the hairline', () => {
    const c = draw(pylon(PYLON()));
    const head = Array.from(c.querySelectorAll('[data-shape="gem"] polygon'));
    expect(head.length).toBeGreaterThan(0);
    for (const el of head) expect(el.getAttribute('stroke-width') === '1.5').toBe(false);
    expect(head.some((el) => el.getAttribute('stroke-width') === '2')).toBe(true);
  });

  it('leaves the plain indicator lamp (gems off) unstroked', () => {
    const c = draw(pylon(PYLON({ gems: false })));
    const lamp = c.querySelector('[data-scenery="pylon"] > circle')!;
    expect(bare(lamp)).toBe(true);
  });
});

describe('scaffold: posts, levels and braces', () => {
  it('puts the hairline on every post, level and brace', () => {
    const c = draw(scaffold(SCAFFOLD()));
    const posts = part(c, 'data-scaffold', 'post');
    const levels = part(c, 'data-scaffold', 'level');
    const braces = part(c, 'data-scaffold', 'brace');
    expect(posts).toHaveLength(4); // bays + 1
    expect(levels).toHaveLength(5); // floor(300 / 60)
    expect(braces.length).toBeGreaterThan(0);
    for (const el of [...posts, ...levels, ...braces]) expect(isHairline(el)).toBe(true);
  });

  it('leaves the solid block (a ringed mass) and the top-corner light unstroked', () => {
    const c = draw(scaffold(SCAFFOLD()));
    for (const el of part(c, 'data-scaffold', 'solid')) expect(bare(el)).toBe(true);
    expect(bare(c.querySelector('[data-scaffold="light"]')!)).toBe(true);
  });

  it('takes the same hairline on a derelict frame (its colour is fixed, not the frame\'s)', () => {
    const c = draw(scaffold(SCAFFOLD({}, { derelict: true })));
    for (const el of part(c, 'data-scaffold', 'post')) expect(isHairline(el)).toBe(true);
    expect(c.querySelector('[data-scaffold="light"]')).toBeNull();
  });
});

describe('crane: posts, beam, brace and hanger', () => {
  it('puts the hairline on both posts, the beam, the knee brace and the hanger', () => {
    const c = draw(crane(CRANE()));
    for (const name of ['post-west', 'post-east', 'beam', 'knee-brace', 'hanger']) {
      const els = part(c, 'data-crane', name);
      expect(els, name).toHaveLength(1);
      expect(isHairline(els[0]), name).toBe(true);
    }
  });

  it('leaves the load (a ringed mass) and the beam-end light unstroked', () => {
    const c = draw(crane(CRANE()));
    expect(bare(part(c, 'data-crane', 'load')[0])).toBe(true);
    expect(bare(part(c, 'data-crane', 'beam-end-light')[0])).toBe(true);
  });

  describe('the hanger is a rect now, on the footprint the 3 px line had', () => {
    it.each([0.2, 0.5, 0.8])('hangerFrac %f: 3 wide, centred on hangerX, from the beam\'s bottom to hangerBottomY', (hangerFrac) => {
      const ctx = CRANE({}, hangerFrac);
      const { beamBottom, hangerX, hangerBottomY } = craneLayout(500, 1030, ctx.params.crane!);
      const hanger = part(draw(crane(ctx)), 'data-crane', 'hanger')[0];
      expect(hanger.tagName.toLowerCase()).toBe('rect');
      expect(num(hanger, 'width')).toBe(3);
      expect(num(hanger, 'x') + num(hanger, 'width') / 2).toBeCloseTo(hangerX, 9);
      expect(num(hanger, 'y')).toBeCloseTo(beamBottom, 9);
      expect(num(hanger, 'y') + num(hanger, 'height')).toBeCloseTo(hangerBottomY, 9);
    });

    it('is the frame\'s own fill (it was the line\'s stroke colour), and there is no <line> left', () => {
      const c = draw(crane(CRANE()));
      const beam = part(c, 'data-crane', 'beam')[0];
      expect(part(c, 'data-crane', 'hanger')[0].getAttribute('fill')).toBe(beam.getAttribute('fill'));
      expect(c.querySelector('line')).toBeNull();
    });

    it('is a rect even with the members switch off (the geometry is not a switch), just unstroked', () => {
      withSwitch('members', false, () => {
        const hanger = part(draw(crane(CRANE())), 'data-crane', 'hanger')[0];
        expect(hanger.tagName.toLowerCase()).toBe('rect');
        expect(bare(hanger)).toBe(true);
      });
    });
  });
});

describe('dome: the mast and the arc along the cap', () => {
  const kids = (c: HTMLElement) => Array.from(c.querySelector('[data-scenery="dome"]')!.children);

  it('puts the hairline on the mast and nothing on the hatch, portholes or lights', () => {
    const c = draw(dome(DOME()));
    const rects = Array.from(c.querySelectorAll('[data-scenery="dome"] > rect'));
    // base west, base east, hatch, mast: the mast is the last rect
    expect(isHairline(rects[rects.length - 1])).toBe(true);
    for (const el of rects.slice(0, -1)) expect(bare(el)).toBe(true);
    for (const el of part(c, 'data-dome', 'porthole')) expect(bare(el)).toBe(true);
    expect(bare(part(c, 'data-dome', 'mast-light')[0])).toBe(true);
  });

  it('adds exactly one open arc path after the two cap halves, with the hairline and no fill', () => {
    const c = draw(dome(DOME()));
    const direct = kids(c).filter((k) => k.tagName.toLowerCase() === 'path');
    expect(direct).toHaveLength(3);
    const [west, east, arc] = direct;
    expect(bare(west)).toBe(true);
    expect(bare(east)).toBe(true);
    expect(isHairline(arc)).toBe(true);
    expect(arc.getAttribute('fill')).toBe('none');
    expect(kids(c).indexOf(arc)).toBe(kids(c).indexOf(east) + 1);
  });

  it('runs from (x - rx, top) over the apex to (x + rx, top), and never closes', () => {
    const c = draw(dome(DOME())); // x 500, y 1030, w 200, bh 40, ry 70 -> top 990
    const arc = kids(c).filter((k) => k.tagName.toLowerCase() === 'path')[2];
    const d = arc.getAttribute('d')!;
    expect(d).toMatch(/^M 400,990 A 100,70 0 0 1 600,990$/);
    expect(d).not.toContain('Z');
  });

  it('spans the dome for every size the generator can make', () => {
    for (const [w, bh, ry] of [[170, 30, 47.6], [300, 60, 126], [240, 45, 80]]) {
      const ctx = ctxFor('dome', { dome: { w, bh, ry, portholes: 3, portholeLitRoll: [0.1, 0.2, 0.3], hueShift: 0, satShift: 0 } });
      const arc = kids(draw(dome(ctx))).filter((k) => k.tagName.toLowerCase() === 'path')[2];
      expect(arc.getAttribute('d')).toBe(`M ${500 - w / 2},${1030 - bh} A ${w / 2},${ry} 0 0 1 ${500 + w / 2},${1030 - bh}`);
    }
  });
});

describe('beacon: mast and foot plate', () => {
  it('puts the hairline on the mast and the foot plate, and leaves the gem head alone', () => {
    const c = draw(beacon(BEACON()));
    const own = Array.from(c.querySelectorAll('[data-scenery="beacon"] > rect'));
    expect(own).toHaveLength(2);
    for (const el of own) expect(isHairline(el)).toBe(true);
    for (const el of Array.from(c.querySelectorAll('[data-shape="gem"] polygon'))) expect(el.getAttribute('stroke-width')).not.toBe('1.5');
  });
});

describe('members hairline: the switch, the hour, and the grid', () => {
  const ALL: Array<[string, () => HTMLElement]> = [
    ['pylon', () => draw(pylon(PYLON()))],
    ['scaffold', () => draw(scaffold(SCAFFOLD()))],
    ['crane', () => draw(crane(CRANE()))],
    ['dome', () => draw(dome(DOME()))],
    ['beacon', () => draw(beacon(BEACON()))],
  ];

  it.each(ALL)('%s: with the members switch off nothing carries the 1.5 px hairline', (_name, make) => {
    withSwitch('members', false, () => {
      expect(Array.from(make().querySelectorAll('[stroke-width="1.5"]'))).toHaveLength(0);
    });
  });

  it('with the members switch off the dome has no arc path (just the two cap halves)', () => {
    withSwitch('members', false, () => {
      const direct = Array.from(draw(dome(DOME())).querySelector('[data-scenery="dome"]')!.children).filter((k) => k.tagName.toLowerCase() === 'path');
      expect(direct).toHaveLength(2);
    });
  });

  it('the others switch does not touch these members', () => {
    withSwitch('others', false, () => {
      expect(draw(pylon(PYLON())).querySelectorAll('[stroke-width="1.5"]').length).toBeGreaterThan(0);
    });
  });

  it('the mass switch does not remove the hairlines, nor the members switch the rings', () => {
    withSwitch('massScenery', false, () => {
      expect(draw(scaffold(SCAFFOLD())).querySelectorAll('[stroke-width="1.5"]').length).toBeGreaterThan(0);
    });
    withSwitch('members', false, () => {
      expect(draw(scaffold(SCAFFOLD())).querySelectorAll('[data-gem="ring"]')).toHaveLength(1);
    });
  });

  it('the hairline colour never changes with the hour or the depth cap', () => {
    const strokes = (c: HTMLElement) => new Set(Array.from(c.querySelectorAll('[stroke-width="1.5"]')).map((e) => e.getAttribute('stroke')));
    const day = draw(crane(CRANE({ eastL: 1.05, westL: 0.9, nightDepth: 0, cap: 1 })));
    const night = draw(crane(CRANE({ eastL: 0.3, westL: 0.3, nightDepth: 1, cap: 0.5 })));
    expect([...strokes(day)]).toEqual([gemOutlineStroke()]);
    expect([...strokes(night)]).toEqual([gemOutlineStroke()]);
  });

  it('no NaN anywhere and every non-ring edge still 90/45, across 50 sizes', () => {
    for (let i = 0; i < 50; i++) {
      for (const el of [
        pylon(ctxFor('pylon', { pylon: { w: 60 + (i % 31), h: 260 + i * 3 } })),
        crane(ctxFor('crane', { crane: { w: 220 + i * 2, h: 260 + i * 2, hangerFrac: 0.2 + (i % 13) * 0.05 } })),
        beacon(ctxFor('beacon', { beacon: { w: 40 + (i % 30), mastH: 100 + i * 2, gemW: 36 + (i % 20) } })),
      ]) {
        const c = draw(el);
        assertNinetyFortyFive(c);
        expect(c.innerHTML).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
