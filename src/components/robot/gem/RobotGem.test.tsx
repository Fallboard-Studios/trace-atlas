// ========================================
// IMPORTS
// ========================================
import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { RobotGem, type RobotGemOrbiters, type RobotGemHalo } from './RobotGem';
import { BODY_LINE_WIDTH, BODY_STRIP_OPACITY, ORBITER_LINE_WIDTH, ORBITER_STRIP_OPACITY } from './gemLines';
import { getRobotGem, gemWidth, GEM_CANVAS_H, type GemPart } from './polygon';
import { gemPalette, GEM_LIGHT_COLOR, type GemPalette, type GemPartPaint } from './gemPalette';
import { quadPath } from './gemPaths';
import { WAVE_COUNTER_INDEX, WAVE_PATH_COUNT, WAVE_TRAIL_SIDES, trailGradient } from './haloWaves';

// ========================================
// FIXTURES
// ========================================
const gem = getRobotGem(20261004);
const palette = gemPalette(gem, '#41ad9f', 1, [1, 0.15], 20);
// Phase 40 amendment: orbiters dock between Mid and Top, not between backing and Mid.
const parts: Array<[string, GemPart]> = [
  ['backing', gem.backing],
  ['mid--left', gem.midLeft],
  ['mid--right', gem.midRight],
  ['orbiter', gem.orbiters[0]],
  ['orbiter', gem.orbiters[1]],
  ['orbiter', gem.orbiters[2]],
  ['orbiter', gem.orbiters[3]],
  ['top', gem.top],
];

/** All four corners, no motion. The line widths and strip opacities are not props: RobotGem fixes them (gemLines.ts). */
const ALL_FOUR_STATIC: RobotGemOrbiters = {
  size: 1,
  count: 4,
  cornerOrder: [0, 1, 2, 3],
  motion: false,
};

/** A default halo for the cases that are not about it. */
const HALO_LEGACY: RobotGemHalo = {
  color: '#41ad9f',
  gradientId: 'halo-test-r1',
};

function draw(
  p: GemPalette = palette,
  lightOpacity = 0.7,
  scale = 0.9,
  orbiters: RobotGemOrbiters = ALL_FOUR_STATIC,
  halo: RobotGemHalo = HALO_LEGACY,
) {
  const { container } = render(
    <svg>
      <RobotGem gem={gem} palette={p} lightOpacity={lightOpacity} scale={scale} orbiters={orbiters} halo={halo} />
    </svg>,
  );
  return container;
}

function partGroups(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('g.gem__part')];
}

const fmt = (n: number) => Number(n.toFixed(2));
const subpaths = (d: string) => d.split('Z').map((s) => s.trim()).filter(Boolean);
/** Palette entry for parts[i] (0 = backing, which has no facets). */
const paintOf = (i: number): GemPartPaint =>
  [palette.orbiters[0], palette.midLeft, palette.midRight, palette.orbiters[0], palette.orbiters[1], palette.orbiters[2], palette.orbiters[3], palette.top][i];

// ========================================
// TESTS
// ========================================
describe('RobotGem — draw-only renderer (docs/specs/GEM_POLYGON_ROBOTS.md §1.5, ORBITING_POLYGONS.md §1.3)', () => {
  it('draws the parts in z order: backing, mid--left, mid--right, four orbiters, top', () => {
    const groups = partGroups(draw());
    expect(groups).toHaveLength(8);
    groups.forEach((g, i) => {
      const [name] = parts[i];
      // The four orbiter inner parts no longer carry the corner class themselves (Task 5: that
      // moved to the new `.gem__orbiter--{corner}` wrapper) — they're bare `.gem__part`.
      if (name === 'orbiter') expect(g.getAttribute('class')).toBe('gem__part');
      else expect(g.getAttribute('class')).toContain(`gem__${name}`);
    });
  });

  it('places each part at its layout position', () => {
    partGroups(draw()).forEach((g, i) => {
      const { x, y } = parts[i][1];
      expect(g.getAttribute('transform')).toBe(`translate(${fmt(x)} ${fmt(y)})`);
    });
  });

  // Task 9a (Phase 39): facets are merged into one path per distinct fill, lines into one path per
  // part — the moving robot layer's per-frame cost tracks element count (docs/PERFORMANCE.md).
  it('facets: one .gem__facets path per distinct fill whose subpaths cover every outline edge once; none on the backing; one face each', () => {
    partGroups(draw()).forEach((g, i) => {
      const [name, part] = parts[i];
      const paths = [...g.querySelectorAll('.gem__facets')];
      expect(g.querySelectorAll('.gem__face')).toHaveLength(1);
      if (name === 'backing') {
        expect(paths).toHaveLength(0);
        return;
      }
      const fills = paintOf(i).facets;
      expect(paths.map((p) => p.getAttribute('fill'))).toEqual([...new Set(fills)]);
      expect(paths.flatMap((p) => subpaths(p.getAttribute('d')!))).toHaveLength(part.pts.length);
    });
  });

  it('each facet subpath is the quad between an outline edge and its inset edge, in the path of its own fill', () => {
    const top = partGroups(draw())[7];
    const { pts, inner } = gem.top;
    const path = [...top.querySelectorAll('.gem__facets')].find((p) => p.getAttribute('fill') === palette.top.facets[0])!;
    expect(subpaths(path.getAttribute('d')!)).toContain(quadPath([pts[0], pts[1], inner[1], inner[0]]).replace('Z', ''));
  });

  it('boundary lines: one .gem__lines path per part holding top 4, mids 2, orbiters 1 lines; none on the backing', () => {
    const want = [0, 2, 2, 1, 1, 1, 1, 4];
    partGroups(draw()).forEach((g, i) => {
      const paths = g.querySelectorAll('.gem__lines');
      expect(paths).toHaveLength(want[i] ? 1 : 0);
      if (want[i]) expect(paths[0].getAttribute('d')!.split('M').filter(Boolean)).toHaveLength(want[i]);
    });
  });

  it('exactly two lights, only inside the top, carrying lightOpacity', () => {
    const container = draw(palette, 0.37);
    const lights = container.querySelectorAll('.gem__light');
    expect(lights).toHaveLength(2);
    lights.forEach((L) => {
      expect(L.closest('.gem__top')).not.toBeNull();
      expect(L.getAttribute('opacity')).toBe('0.37');
    });
  });

  it('every fill and stroke is a string from the palette — the renderer computes no colour', () => {
    const allowed = new Set<string>(['none', palette.light, palette.backing.face, palette.backing.stroke]);
    [...palette.orbiters, palette.midLeft, palette.midRight, palette.top].forEach((p) =>
      [...p.facets, p.face, p.line, p.stroke].forEach((c) => allowed.add(c)),
    );
    draw().querySelectorAll('[fill], [stroke]').forEach((el) => {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        // The halo's trail strips fill from a gradient reference; its colour is the halo prop's stop-color
        // (asserted in the halo cases), the one colour that bypasses the palette on purpose.
        if (v !== null && !v.startsWith('url(#')) expect(allowed.has(v)).toBe(true);
      }
    });
  });

  it('a palette change reaches the matching elements (mid--left facets follow palette.midLeft)', () => {
    const groups = partGroups(draw());
    const fills = [...groups[1].querySelectorAll('.gem__facets')].map((f) => f.getAttribute('fill'));
    expect(fills).toEqual([...new Set(palette.midLeft.facets)]);
    expect(groups[7].querySelector('.gem__face')!.getAttribute('fill')).toBe(palette.top.face);
  });

  it('scales the whole robot about the canvas centre', () => {
    const W = gemWidth(gem);
    const root = draw(palette, 1, 0.8).querySelector('g.gem')!;
    expect(root.getAttribute('transform')).toBe(`translate(${W / 2} ${GEM_CANVAS_H / 2}) scale(0.8) translate(${-W / 2} ${-GEM_CANVAS_H / 2})`);
  });

  it('drawable element count is exactly Σ(distinct facet fills + face + one lines path + one strip path per part with lines) + 2 circles per light', () => {
    const container = draw();
    const drawn = container.querySelectorAll('polygon, polyline, path, circle').length;
    const bevelled = [gem.midLeft, gem.midRight, ...gem.orbiters, gem.top];
    const expected =
      1 + // backing face
      bevelled.reduce((n, p, i) => n + new Set(paintOf(i + 1).facets).size + 1 + (p.lines.length ? 1 : 0), 0) +
      gem.top.lights.length * 2 +
      bevelled.filter((p) => p.lines.length > 0).length; // one .gem__strip per part with a line (Phase 41 T5: Mids and Top too)
    expect(drawn).toBe(expected);
  });

  it('forwards ref to the root g.gem (the useOrbiterMotion GSAP scope, Task 8)', () => {
    const ref = createRef<SVGGElement>();
    const { container } = render(
      <svg>
        <RobotGem ref={ref} gem={gem} palette={palette} lightOpacity={0.5} scale={1} orbiters={ALL_FOUR_STATIC} halo={HALO_LEGACY} />
      </svg>,
    );
    expect(ref.current).toBe(container.querySelector('g.gem'));
  });
});

// ========================================
// ORBITER DIALS — static (motion: false) path, Task 5
// ========================================
describe('RobotGem — static orbiters: count, cornerOrder, size, line width, strip (spec §1.3, Task 5)', () => {
  it('count 2, cornerOrder [3, 0, 1, 2] renders exactly .gem__orbiter--br and --tl, in that DOM order, between mid--right and top (Phase 40 amendment: docked, not between backing and mid)', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, count: 2, cornerOrder: [3, 0, 1, 2] });
    const root = container.querySelector('g.gem')!;
    const orbiterWrappers = [...root.querySelectorAll(':scope > .gem__orbiter')];
    expect(orbiterWrappers.map((g) => g.getAttribute('class'))).toEqual([
      'gem__orbiter gem__orbiter--br',
      'gem__orbiter gem__orbiter--tl',
    ]);

    const children = [...root.children];
    const midRightIndex = children.findIndex((c) => c.classList.contains('gem__mid--right'));
    const topIndex = children.findIndex((c) => c.classList.contains('gem__top'));
    const orbiterIndices = children
      .map((c, i) => (c.classList.contains('gem__orbiter') ? i : -1))
      .filter((i) => i >= 0);
    expect(orbiterIndices.every((i) => i > midRightIndex && i < topIndex)).toBe(true);
  });

  it.each([1, 2, 3, 4] as const)('count %d shows the first %d corners of cornerOrder, no more', (count) => {
    const cornerOrder = [2, 3, 1, 0];
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, count, cornerOrder });
    const wrappers = [...container.querySelectorAll('.gem__orbiter')];
    expect(wrappers).toHaveLength(count);
    const expectedCorners = cornerOrder.slice(0, count).map((c) => ['tl', 'tr', 'bl', 'br'][c]);
    expect(wrappers.map((w) => w.getAttribute('class'))).toEqual(expectedCorners.map((c) => `gem__orbiter gem__orbiter--${c}`));
  });

  it('.gem__orbiter-local carries scale(0.75) for size 0.75, transform-origin at the part centre', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, size: 0.75 });
    const local = container.querySelector('.gem__orbiter--tl .gem__orbiter-local')!;
    expect(local.getAttribute('transform')).toBe('scale(0.75)');
    const part = gem.orbiters[0];
    const cx = Number((part.x + part.w / 2).toFixed(2));
    const cy = Number((part.y + part.h / 2).toFixed(2));
    expect((local as HTMLElement).style.transformOrigin).toBe(`${cx}px ${cy}px`);
  });

  it('a different size value produces a different scale() factor, 2 dp', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, size: 1.25 });
    const local = container.querySelector('.gem__orbiter--tl .gem__orbiter-local')!;
    expect(local.getAttribute('transform')).toBe('scale(1.25)');
  });

  it('every orbiter .gem__lines is ORBITER_LINE_WIDTH (1.1) wide, the top of the old Note Variance range', () => {
    expect(ORBITER_LINE_WIDTH).toBe(1.1);
    const container = draw();
    const lines = [...container.querySelectorAll('.gem__orbiter .gem__lines')];
    expect(lines).toHaveLength(4);
    lines.forEach((el) => expect(el.getAttribute('stroke-width')).toBe('1.1'));
  });

  it('each orbiter strip is a third of the line wide (0.37) at ORBITER_STRIP_OPACITY (1), on the same path in palette.light', () => {
    expect(ORBITER_STRIP_OPACITY).toBe(1);
    const container = draw();
    ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
      const lines = container.querySelector(`.gem__orbiter--${corner} .gem__lines`)!;
      const strips = container.querySelectorAll(`.gem__orbiter--${corner} .gem__strip`);
      expect(strips).toHaveLength(1);
      expect(strips[0].getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strips[0].getAttribute('stroke')).toBe(palette.light);
      expect(strips[0].getAttribute('stroke-width')).toBe('0.37'); // 1.1 / 3, 2dp
      expect(strips[0].getAttribute('opacity')).toBe(String(ORBITER_STRIP_OPACITY));
    });
  });
});

// ========================================
// BODY LINES — one fixed width on Top and both Mids (backlog 85)
// ========================================
describe('RobotGem — body lines: one fixed width and lit strips', () => {
  const LINES: Array<[string, string]> = [
    ['.gem__top', 'top'],
    ['.gem__mid--left', 'midLeft'],
    ['.gem__mid--right', 'midRight'],
  ];

  it('every body part .gem__lines is BODY_LINE_WIDTH (0.7) wide, the top of the old gain-depth range', () => {
    expect(BODY_LINE_WIDTH).toBe(0.7);
    const container = draw();
    for (const [sel] of LINES) {
      expect(container.querySelector(`${sel} .gem__lines`)!.getAttribute('stroke-width')).toBe('0.7');
    }
  });

  it('one .gem__strip per body part: same d as its .gem__lines, palette.light, 0.23 wide (a third of 0.7), BODY_STRIP_OPACITY (0.6), round caps', () => {
    expect(BODY_STRIP_OPACITY).toBe(0.6);
    const container = draw();
    for (const [sel] of LINES) {
      const lines = container.querySelector(`${sel} .gem__lines`)!;
      const strips = container.querySelectorAll(`${sel} .gem__strip`);
      expect(strips).toHaveLength(1);
      const strip = strips[0];
      expect(strip.getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strip.getAttribute('stroke')).toBe(palette.light);
      expect(strip.getAttribute('stroke-width')).toBe('0.23');
      expect(strip.getAttribute('opacity')).toBe('0.6');
      expect(strip.getAttribute('fill')).toBe('none');
      expect(strip.getAttribute('stroke-linecap')).toBe('round');
    }
  });

  it('the strip sits directly after its .gem__lines and before the lights (z order)', () => {
    const container = draw();
    const top = container.querySelector('.gem__top')!;
    const classes = [...top.children].map((c) => c.getAttribute('class'));
    const linesAt = classes.indexOf('gem__lines');
    expect(classes[linesAt + 1]).toBe('gem__strip');
    expect(classes.indexOf('gem__light')).toBeGreaterThan(linesAt + 1);
  });

  it('motion: true draws the same widths', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    expect(container.querySelector('.gem__top .gem__strip')).not.toBeNull();
    expect(container.querySelector('.gem__mid--left .gem__lines')!.getAttribute('stroke-width')).toBe('0.7');
    expect(container.querySelector('.gem__orbiter--tl .gem__lines')!.getAttribute('stroke-width')).toBe('1.1');
  });
});

// ========================================
// HALO — the triangular waves (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.1b/§1.4)
// ========================================
describe('RobotGem — halo: the triangular waves behind the Mids (Phase 41)', () => {
  const HALO: RobotGemHalo = { color: '#ae5378', gradientId: 'halo-world-r1' };
  const W = gemWidth(gem);

  it('on cards (motion: false) the halo never renders — no defs, no waves (amendment: halo only appears during a spawn/despawn arc)', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, HALO);
    expect(container.querySelector('defs')).toBeNull();
    expect(container.querySelector('.gem__waves')).toBeNull();
  });

  it('draws no gradient ellipse and no radial gradient: the volume/envelope halo was removed (2026-10-12)', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, HALO);
    expect(container.querySelector('.gem__halo')).toBeNull();
    expect(container.querySelector('.gem__ripple')).toBeNull();
    expect(container.querySelector('radialGradient')).toBeNull();
  });

  it('the waves sit directly after the backing and its defs, and before mid--left (motion mode)', () => {
    const root = draw(palette, 0.7, 0.9, MOTION, HALO).querySelector('g.gem')!;
    const kids = [...root.children];
    const backingAt = kids.findIndex((c) => c.classList.contains('gem__backing'));
    expect(kids[backingAt + 1].tagName).toBe('defs');
    expect(kids[backingAt + 2].classList.contains('gem__waves')).toBe(true);
    expect(kids[backingAt + 3].classList.contains('gem__mid--left')).toBe(true);
  });

  it('on cards, nothing sits between the backing and mid--left — no defs, no waves', () => {
    const root = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, HALO).querySelector('g.gem')!;
    const kids = [...root.children];
    const backingAt = kids.findIndex((c) => c.classList.contains('gem__backing'));
    expect(kids[backingAt + 1].classList.contains('gem__mid--left')).toBe(true);
  });

  it('the waves centre on the canvas (data-cx, data-cy), where the gem scales about', () => {
    const group = draw(palette, 0.7, 0.9, MOTION, HALO).querySelector('g.gem__waves')!;
    expect(group.getAttribute('data-cx')).toBe(String(W / 2));
    expect(group.getAttribute('data-cy')).toBe(String(GEM_CANVAS_H / 2));
  });

  it('no <filter> anywhere (spec Assumption 5)', () => {
    expect(draw(palette, 0.7, 0.9, MOTION, HALO).querySelector('filter')).toBeNull();
  });

  it('a new halo colour re-renders the waves and their trails (nothing freezes the markup: GSAP only writes attributes React leaves constant)', () => {
    const { container, rerender } = render(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} halo={HALO} />
      </svg>,
    );
    expect(container.querySelector('g.gem__waves')!.getAttribute('stroke')).toBe('#ae5378');
    rerender(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} halo={{ ...HALO, color: '#123456' }} />
      </svg>,
    );
    expect(container.querySelector('g.gem__waves')!.getAttribute('stroke')).toBe('#123456');
    expect(container.querySelector('linearGradient[id="halo-world-r1-trail-right"]')!.querySelector('stop')!.getAttribute('stop-color')).toBe('#123456');
  });

  it('two RobotGems with different gradientIds produce two sets of trail gradients, each group naming its own', () => {
    const { container } = render(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} halo={{ ...HALO, gradientId: 'halo-world-r1' }} />
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} halo={{ ...HALO, color: '#123456', gradientId: 'halo-avatar-r1' }} />
      </svg>,
    );
    const groups = [...container.querySelectorAll('g.gem__waves')];
    expect(groups.map((g) => g.getAttribute('data-trail-id'))).toEqual(['halo-world-r1-trail', 'halo-avatar-r1-trail']);
    expect(groups.map((g) => g.getAttribute('stroke'))).toEqual(['#ae5378', '#123456']);
    expect(container.querySelector('linearGradient[id="halo-avatar-r1-trail-right"]')).not.toBeNull();
  });

  it('triangular waves (haloWaves.ts): the outward waves and the counter wave, all empty, invisible paths in the halo colour, only in the motion contexts (world/avatar)', () => {
    const group = draw(palette, 0.7, 0.9, MOTION, HALO).querySelector('g.gem__waves')!;
    expect(group.getAttribute('stroke')).toBe(HALO.color);
    const paths = [...group.querySelectorAll('path.gem__wave')];
    expect(paths).toHaveLength(WAVE_PATH_COUNT);
    // the last one, the counter wave, wears the gem's light colour; the rest take the group's halo colour
    expect(paths[WAVE_COUNTER_INDEX].getAttribute('stroke')).toBe(GEM_LIGHT_COLOR);
    expect(paths.filter((p) => p.hasAttribute('stroke'))).toHaveLength(1);
    paths.forEach((p) => {
      expect(p.getAttribute('d')).toBe('');
      expect(p.getAttribute('opacity')).toBe('0');
    });
    expect(draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, HALO).querySelector('g.gem__waves')).toBeNull();
  });

  it('the waves trails: a gradient for each half of the tail, in the halo colour and the counter wave own, named by the group; no filter anywhere', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, HALO);
    const group = container.querySelector('g.gem__waves')!;
    const gradient = (base: string, side: string) => container.querySelector(`linearGradient[id="${base}-${side}"]`)!;
    const trailId = group.getAttribute('data-trail-id')!;
    const counterId = group.getAttribute('data-trail-counter-id')!;
    for (const [base, color] of [[trailId, HALO.color], [counterId, GEM_LIGHT_COLOR]] as const) {
      for (const side of WAVE_TRAIL_SIDES) {
        const g = gradient(base, side);
        expect(g).not.toBeNull();
        const v = trailGradient(side);
        expect([g.getAttribute('x1'), g.getAttribute('y1'), g.getAttribute('x2'), g.getAttribute('y2')]).toEqual([v.x1, v.y1, v.x2, v.y2].map(String));
        expect([...g.querySelectorAll('stop')].map((s) => s.getAttribute('stop-opacity'))).toEqual(['1', '0']);
        expect(g.querySelector('stop')!.getAttribute('stop-color')).toBe(color);
      }
    }
    // none of the trail strips exist at rest: they are made for the length of a run
    expect(container.querySelector('.gem__wave-trail')).toBeNull();
    expect(container.querySelector('filter')).toBeNull();
    expect(draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, HALO).querySelector('linearGradient')).toBeNull();
  });

  it('the halo adds no g.gem__part to the element-count case', () => {
    expect(partGroups(draw())).toHaveLength(8);
  });
});

// ========================================
// MOTION MODE — docked, GSAP-owned (Phase 40 amendment: single copy per corner, no depth twins)
// ========================================
const MOTION: RobotGemOrbiters = {
  size: 1.1, // ignored in motion mode — no React scale
  count: 2, // ignored in motion mode — all 4 copies present regardless
  cornerOrder: [0, 1, 2, 3],
  motion: true,
};

describe('RobotGem — motion mode: docked orbiters, GSAP-owned (Phase 40 amendment)', () => {
  it('renders exactly 4 .gem__orbiter (one per corner), ignoring count and size', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    const wrappers = [...container.querySelectorAll('.gem__orbiter')];
    expect(wrappers).toHaveLength(4);
    expect(wrappers.map((w) => w.getAttribute('class')).sort()).toEqual(
      ['tl', 'tr', 'bl', 'br'].map((c) => `gem__orbiter gem__orbiter--${c}`).sort(),
    );
  });

  it('DOM order: backing, defs, waves, mid--left, mid--right, 4 orbiters, top', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    const root = container.querySelector('g.gem')!;
    const roles = [...root.children].map((c) => {
      if (c.tagName === 'defs') return 'defs';
      if (c.classList.contains('gem__waves')) return 'waves';
      if (c.classList.contains('gem__orbiter')) return 'orbiter';
      if (c.classList.contains('gem__backing')) return 'backing';
      if (c.classList.contains('gem__mid--left')) return 'mid--left';
      if (c.classList.contains('gem__mid--right')) return 'mid--right';
      if (c.classList.contains('gem__top')) return 'top';
      return 'unknown';
    });
    expect(roles).toEqual(['backing', 'defs', 'waves', 'mid--left', 'mid--right', 'orbiter', 'orbiter', 'orbiter', 'orbiter', 'top']);
  });

  it('no .gem__orbiter or .gem__orbiter-local carries a transform, style, display or opacity attribute; the inner corner group keeps its translate', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    container.querySelectorAll('.gem__orbiter, .gem__orbiter-local').forEach((el) => {
      expect(el.getAttribute('transform')).toBeNull();
      expect(el.getAttribute('style')).toBeNull();
      expect(el.getAttribute('display')).toBeNull();
      expect(el.getAttribute('opacity')).toBeNull();
    });
    const part = gem.orbiters[0];
    const inner = container.querySelector('.gem__orbiter--tl .gem__part')!;
    expect(inner.getAttribute('transform')).toBe(`translate(${fmt(part.x)} ${fmt(part.y)})`);
  });

  it('each of the 4 copies has its own strip and lines at the fixed orbiter width and opacity', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    container.querySelectorAll('.gem__orbiter').forEach((wrapper) => {
      const lines = wrapper.querySelector('.gem__lines')!;
      const strip = wrapper.querySelector('.gem__strip')!;
      expect(lines.getAttribute('stroke-width')).toBe('1.1');
      expect(strip.getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strip.getAttribute('stroke')).toBe(palette.light);
      expect(strip.getAttribute('stroke-width')).toBe('0.37');
      expect(strip.getAttribute('opacity')).toBe('1');
    });
  });

  it('motion: false output is unchanged (DOM order and class list) except the halo, which the amendment removes from cards entirely', () => {
    const container = draw();
    const root = container.querySelector('g.gem')!;
    expect([...root.children].map((c) => c.getAttribute('class') ?? c.tagName)).toEqual([
      'gem__part gem__backing',
      'gem__part gem__mid gem__mid--left',
      'gem__part gem__mid gem__mid--right',
      'gem__orbiter gem__orbiter--tl',
      'gem__orbiter gem__orbiter--tr',
      'gem__orbiter gem__orbiter--bl',
      'gem__orbiter gem__orbiter--br',
      'gem__part gem__top',
    ]);
  });
});
