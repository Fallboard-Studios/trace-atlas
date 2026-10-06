// ========================================
// IMPORTS
// ========================================
import { createRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { RobotGem, type RobotGemOrbiters, type RobotGemBodyLines, type RobotGemHalo, type RobotGemRipple } from './RobotGem';
import source from './RobotGem.tsx?raw';
import { getRobotGem, gemWidth, GEM_CANVAS_H, type GemPart } from './polygon';
import { gemPalette, type GemPalette, type GemPartPaint } from './gemPalette';
import { quadPath } from './gemPaths';

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

/** The temporary prop RobotBody passes until Task 7 lands — all four corners, today's fixed line
 *  width, strip fully transparent, no motion. Keeps the live app pixel-identical through T5/T6. */
const ALL_FOUR_STATIC: RobotGemOrbiters = {
  lineWidth: 0.8,
  stripOpacity: 0,
  size: 1,
  count: 4,
  cornerOrder: [0, 1, 2, 3],
  motion: false,
};

/** The temporary body-line prop RobotBody passes until Phase 41 Task 7 lands — Phase 40's fixed
 *  0.8 on every body line, strip fully transparent. Keeps the live app pixel-identical through T5/T6. */
const BODY_LINES_LEGACY: RobotGemBodyLines = { top: 0.8, midLeft: 0.8, midRight: 0.8, stripOpacity: 0 };

/** The temporary halo RobotBody passes until Phase 41 Task 7 lands — six stops, every one
 *  transparent, so the live app shows no halo yet. */
const HALO_LEGACY: RobotGemHalo = {
  color: '#41ad9f',
  rx: 30,
  ry: 30,
  stops: [0, 0.33, 0.5, 0.66, 0.83, 1].map((offset) => ({ offset, opacity: 0 })),
  opacity: 1,
  gradientId: 'halo-test-r1',
};

function draw(
  p: GemPalette = palette,
  lightOpacity = 0.7,
  scale = 0.9,
  orbiters: RobotGemOrbiters = ALL_FOUR_STATIC,
  bodyLines: RobotGemBodyLines = BODY_LINES_LEGACY,
  halo: RobotGemHalo = HALO_LEGACY,
  ripple?: RobotGemRipple,
) {
  const { container } = render(
    <svg>
      <RobotGem gem={gem} palette={p} lightOpacity={lightOpacity} scale={scale} orbiters={orbiters} bodyLines={bodyLines} halo={halo} ripple={ripple} />
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
        // The halo ellipse's fill is a gradient reference; its colour is the halo prop's stop-color
        // (asserted in the halo cases), the one colour that bypasses the palette on purpose.
        if (v !== null && !v.startsWith('url(#')) expect(allowed.has(v)).toBe(true);
      }
    });
    expect(source).not.toMatch(/hsl\(|#[0-9a-f]{6}\b|hexToHsl|facetTone/i);
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
        <RobotGem ref={ref} gem={gem} palette={palette} lightOpacity={0.5} scale={1} orbiters={ALL_FOUR_STATIC} bodyLines={BODY_LINES_LEGACY} halo={HALO_LEGACY} />
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

  it('an orbiter .gem__lines stroke-width equals the lineWidth dial', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, lineWidth: 0.45 });
    const lines = container.querySelector('.gem__orbiter--tl .gem__lines')!;
    expect(lines.getAttribute('stroke-width')).toBe('0.45');
  });

  it('Mid and Top .gem__lines ignore the orbiter lineWidth dial (they read bodyLines, Phase 41 T5)', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, lineWidth: 0.3 });
    expect(container.querySelector('.gem__mid--left .gem__lines')!.getAttribute('stroke-width')).toBe('0.8');
    expect(container.querySelector('.gem__mid--right .gem__lines')!.getAttribute('stroke-width')).toBe('0.8');
    expect(container.querySelector('.gem__top .gem__lines')!.getAttribute('stroke-width')).toBe('0.8');
  });

  it('orbiter strips carry data-line="orbiters" and data-base = their opacity (Phase 41 T5, for useStripFlicker)', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, stripOpacity: 0.62 });
    const strips = [...container.querySelectorAll('.gem__orbiter .gem__strip')];
    expect(strips).toHaveLength(4);
    strips.forEach((strip) => {
      expect(strip.getAttribute('data-line')).toBe('orbiters');
      expect(strip.getAttribute('data-base')).toBe('0.62');
    });
  });

  it('.gem__strip exists per shown orbiter with the same d as .gem__lines, stroke palette.light, width lineWidth/3, opacity stripOpacity', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, lineWidth: 0.9, stripOpacity: 0.62 });
    ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
      const lines = container.querySelector(`.gem__orbiter--${corner} .gem__lines`)!;
      const strip = container.querySelector(`.gem__orbiter--${corner} .gem__strip`)!;
      expect(strip.getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strip.getAttribute('stroke')).toBe(palette.light);
      expect(strip.getAttribute('stroke-width')).toBe('0.3'); // 0.9 / 3
      expect(strip.getAttribute('opacity')).toBe('0.62');
    });
  });

  it('stripOpacity 0 still renders the strip (opacity 0, not absent)', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, stripOpacity: 0 });
    const strip = container.querySelector('.gem__orbiter--tl .gem__strip');
    expect(strip).not.toBeNull();
    expect(strip!.getAttribute('opacity')).toBe('0');
  });

});

// ========================================
// BODY LINES — Top/Mid line-width dial and strips (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4, Task 5)
// ========================================
describe('RobotGem — bodyLines: Top/Mid line width dial and lit strips (Phase 41, Task 5)', () => {
  const BODY = { top: 0.7, midLeft: 0.3, midRight: 0.5, stripOpacity: 0.6 };
  const LINES: Array<[string, keyof typeof BODY, string]> = [
    ['.gem__top', 'top', 'top'],
    ['.gem__mid--left', 'midLeft', 'midLeft'],
    ['.gem__mid--right', 'midRight', 'midRight'],
  ];

  it('each body part\'s .gem__lines stroke-width is its own dial', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY);
    for (const [sel, key] of LINES) {
      expect(container.querySelector(`${sel} .gem__lines`)!.getAttribute('stroke-width')).toBe(String(BODY[key]));
    }
  });

  it('one .gem__strip per body part with the same d as its .gem__lines, stroke palette.light, width lineWidth / 3 (2 dp), opacity stripOpacity, round caps', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY);
    for (const [sel, key] of LINES) {
      const lines = container.querySelector(`${sel} .gem__lines`)!;
      const strips = container.querySelectorAll(`${sel} .gem__strip`);
      expect(strips).toHaveLength(1);
      const strip = strips[0];
      expect(strip.getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strip.getAttribute('stroke')).toBe(palette.light);
      expect(strip.getAttribute('stroke-width')).toBe(String(fmt(BODY[key] / 3)));
      expect(strip.getAttribute('opacity')).toBe('0.6');
      expect(strip.getAttribute('fill')).toBe('none');
      expect(strip.getAttribute('stroke-linecap')).toBe('round');
    }
  });

  it('the strip follows its own line\'s width: top 0.7 → 0.23, midLeft 0.3 → 0.1, midRight 0.5 → 0.17', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY);
    expect(container.querySelector('.gem__top .gem__strip')!.getAttribute('stroke-width')).toBe('0.23');
    expect(container.querySelector('.gem__mid--left .gem__strip')!.getAttribute('stroke-width')).toBe('0.1');
    expect(container.querySelector('.gem__mid--right .gem__strip')!.getAttribute('stroke-width')).toBe('0.17');
  });

  it('each body strip carries data-line ∈ top / midLeft / midRight and data-base = its opacity', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY);
    for (const [sel, , line] of LINES) {
      const strip = container.querySelector(`${sel} .gem__strip`)!;
      expect(strip.getAttribute('data-line')).toBe(line);
      expect(strip.getAttribute('data-base')).toBe('0.6');
    }
  });

  it('the strip sits directly after its .gem__lines and before the lights (z order)', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY);
    const top = container.querySelector('.gem__top')!;
    const classes = [...top.children].map((c) => c.getAttribute('class'));
    const linesAt = classes.indexOf('gem__lines');
    expect(classes[linesAt + 1]).toBe('gem__strip');
    expect(classes.indexOf('gem__light')).toBeGreaterThan(linesAt + 1);
  });

  it('stripOpacity 0 still renders every body strip (opacity 0, not absent)', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, { ...BODY, stripOpacity: 0 });
    for (const [sel] of LINES) {
      const strip = container.querySelector(`${sel} .gem__strip`);
      expect(strip).not.toBeNull();
      expect(strip!.getAttribute('opacity')).toBe('0');
      expect(strip!.getAttribute('data-base')).toBe('0');
    }
  });

  it('body strips are independent of the orbiter strip opacity and vice versa', () => {
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, stripOpacity: 0.9 }, { ...BODY, stripOpacity: 0.2 });
    expect(container.querySelector('.gem__top .gem__strip')!.getAttribute('opacity')).toBe('0.2');
    expect(container.querySelector('.gem__orbiter--tl .gem__strip')!.getAttribute('opacity')).toBe('0.9');
  });

  it('the legacy prop (0.8 / 0.8 / 0.8 / strip 0) draws every body line at 0.8 — pixel-identical to Phase 40', () => {
    const container = draw();
    for (const [sel] of LINES) {
      expect(container.querySelector(`${sel} .gem__lines`)!.getAttribute('stroke-width')).toBe('0.8');
      expect(container.querySelector(`${sel} .gem__strip`)!.getAttribute('opacity')).toBe('0');
    }
  });

  it('motion: true also draws the body strips with their dials', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY);
    expect(container.querySelector('.gem__top .gem__strip')!.getAttribute('data-line')).toBe('top');
    expect(container.querySelector('.gem__mid--left .gem__lines')!.getAttribute('stroke-width')).toBe('0.3');
  });

  it('the fixed BODY_LINE_WIDTH constant is gone from the source — nothing is 0.8 by default any more', () => {
    expect(source).not.toMatch(/BODY_LINE_WIDTH/);
    const container = draw(palette, 0.7, 0.9, { ...ALL_FOUR_STATIC, lineWidth: 0.9 }, BODY);
    container.querySelectorAll('[stroke-width]').forEach((el) => expect(el.getAttribute('stroke-width')).not.toBe('0.8'));
  });
});

// ========================================
// HALO — the static gradient ellipse (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.1/§1.4, Task 6)
// ========================================
describe('RobotGem — halo: radial-gradient ellipse behind the Mids (Phase 41, Task 6)', () => {
  const HALO: RobotGemHalo = {
    color: '#ae5378',
    rx: 60,
    ry: 30,
    stops: [
      { offset: 0, opacity: 0 },
      { offset: 1 / 3, opacity: 0 },
      { offset: 0.5, opacity: 0.55 },
      { offset: 0.625, opacity: 0.275 },
      { offset: 0.875, opacity: 0.275 },
      { offset: 1, opacity: 0 },
    ],
    opacity: 0.8,
    gradientId: 'halo-world-r1',
  };
  const W = gemWidth(gem);

  it('on cards (motion: false) the halo never renders — no defs, no gradient, no ellipse (amendment: halo only appears during a spawn/despawn arc)', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY_LINES_LEGACY, HALO);
    expect(container.querySelector('ellipse.gem__halo')).toBeNull();
    expect(container.querySelector('radialGradient')).toBeNull();
    expect(container.querySelector('g.gem > defs')).toBeNull();
  });

  it('emits <defs><radialGradient id={gradientId}> with exactly six <stop>s', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO);
    const gradient = container.querySelector('g.gem > defs > radialGradient')!;
    expect(gradient).not.toBeNull();
    expect(gradient.getAttribute('id')).toBe('halo-world-r1');
    expect(gradient.querySelectorAll('stop')).toHaveLength(6);
  });

  it('each stop carries offset as a percentage (2 dp), stop-color = halo colour, stop-opacity from the dial', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO);
    const stops = [...container.querySelectorAll('stop')];
    expect(stops.map((s) => s.getAttribute('offset'))).toEqual(['0.00%', '33.33%', '50.00%', '62.50%', '87.50%', '100.00%']);
    expect(stops.map((s) => s.getAttribute('stop-opacity'))).toEqual(['0', '0', '0.55', '0.275', '0.275', '0']);
    stops.forEach((s) => expect(s.getAttribute('stop-color')).toBe('#ae5378'));
  });

  it('ellipse.gem__halo is centred on the canvas, sized rx/ry, filled by its own gradient, at the given opacity', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO);
    const halo = container.querySelector('ellipse.gem__halo')!;
    expect(halo).not.toBeNull();
    expect(halo.getAttribute('cx')).toBe(String(W / 2));
    expect(halo.getAttribute('cy')).toBe(String(GEM_CANVAS_H / 2));
    expect(halo.getAttribute('rx')).toBe('60');
    expect(halo.getAttribute('ry')).toBe('30');
    expect(halo.getAttribute('fill')).toBe('url(#halo-world-r1)');
    expect(halo.getAttribute('opacity')).toBe('0.8');
  });

  it('the halo sits directly after the backing and before mid--left (motion mode)', () => {
    const root = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO).querySelector('g.gem')!;
    const kids = [...root.children];
    const backingAt = kids.findIndex((c) => c.classList.contains('gem__backing'));
    expect(kids[backingAt + 1].tagName).toBe('defs');
    expect(kids[backingAt + 2].classList.contains('gem__halo')).toBe(true);
    expect(kids[backingAt + 3].classList.contains('gem__mid--left')).toBe(true);
  });

  it('on cards, nothing sits between the backing and mid--left — no defs, no halo', () => {
    const root = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY_LINES_LEGACY, HALO).querySelector('g.gem')!;
    const kids = [...root.children];
    const backingAt = kids.findIndex((c) => c.classList.contains('gem__backing'));
    expect(kids[backingAt + 1].classList.contains('gem__mid--left')).toBe(true);
  });

  it('exactly one halo ellipse and one gradient per robot; no <filter> anywhere (spec Assumption 5)', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO);
    expect(container.querySelectorAll('.gem__halo')).toHaveLength(1);
    expect(container.querySelectorAll('radialGradient')).toHaveLength(1);
    expect(container.querySelector('filter')).toBeNull();
    expect(source).not.toMatch(/<filter|feGaussianBlur/);
  });

  it('a different halo prop re-renders the stops, size and opacity (RobotGem itself always re-renders from props; GSAP ownership is layered on in RobotBody, Task 8)', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, { ...HALO, rx: 40, ry: 20, opacity: 0.1, stops: HALO.stops.map((s) => ({ ...s, opacity: 0 })) });
    const halo = container.querySelector('ellipse.gem__halo')!;
    expect(halo.getAttribute('rx')).toBe('40');
    expect(halo.getAttribute('ry')).toBe('20');
    expect(halo.getAttribute('opacity')).toBe('0.1');
    container.querySelectorAll('stop').forEach((s) => expect(s.getAttribute('stop-opacity')).toBe('0'));
  });

  it('a halo prop with every stop transparent still emits the ellipse and six stops (the interim RobotBody prop)', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO_LEGACY);
    expect(container.querySelector('ellipse.gem__halo')).not.toBeNull();
    expect(container.querySelectorAll('stop')).toHaveLength(6);
  });

  it('two RobotGems with different gradientIds produce two gradients, each ellipse referencing its own', () => {
    const { container } = render(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} bodyLines={BODY_LINES_LEGACY} halo={{ ...HALO, gradientId: 'halo-world-r1' }} />
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} bodyLines={BODY_LINES_LEGACY} halo={{ ...HALO, color: '#123456', gradientId: 'halo-avatar-r1' }} />
      </svg>,
    );
    const gradients = [...container.querySelectorAll('radialGradient')];
    expect(gradients.map((g) => g.getAttribute('id'))).toEqual(['halo-world-r1', 'halo-avatar-r1']);
    const halos = [...container.querySelectorAll('ellipse.gem__halo')];
    expect(halos.map((h) => h.getAttribute('fill'))).toEqual(['url(#halo-world-r1)', 'url(#halo-avatar-r1)']);
    expect(gradients[1].querySelector('stop')!.getAttribute('stop-color')).toBe('#123456');
  });

  it('no ripple prop → no .gem__ripple, even in motion mode', () => {
    expect(draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO).querySelector('.gem__ripple')).toBeNull();
  });

  it('the halo ellipse is not a drawable the element-count case counts, and adds no g.gem__part', () => {
    expect(partGroups(draw())).toHaveLength(8);
  });
});

// ========================================
// HALO LAYER — the stable-props wrapper and the ripple element (Phase 41, Task 9)
// ========================================
describe('RobotGem — HaloLayer: ripple element and the stable-props wrapper (Phase 41, Task 9)', () => {
  const HALO: RobotGemHalo = {
    color: '#ae5378',
    rx: 60,
    ry: 30,
    stops: [0, 1 / 3, 0.5, 0.625, 0.875, 1].map((offset) => ({ offset, opacity: 0.2 })),
    opacity: 0.8,
    gradientId: 'halo-world-r1',
  };
  const RIPPLE: RobotGemRipple = { gradientId: 'ripple-world-r1' };

  it('motion: true with a ripple prop → ellipse.gem__ripple at opacity 0, five-stop gradient id === ripple.gradientId', () => {
    const container = draw(palette, 0.7, 0.9, MOTION, BODY_LINES_LEGACY, HALO, RIPPLE);
    const ripple = container.querySelector('ellipse.gem__ripple')!;
    expect(ripple).not.toBeNull();
    expect(ripple.getAttribute('opacity')).toBe('0');
    const rippleGradient = container.querySelector(`radialGradient#${RIPPLE.gradientId}`)!;
    expect(rippleGradient).not.toBeNull();
    expect(rippleGradient.querySelectorAll('stop')).toHaveLength(5);
    [...rippleGradient.querySelectorAll('stop')].forEach((s) => expect(s.getAttribute('stop-opacity')).toBe('0'));
  });

  it('motion: false → no .gem__ripple even when a ripple prop is passed (the whole halo subtree is gated out)', () => {
    const container = draw(palette, 0.7, 0.9, ALL_FOUR_STATIC, BODY_LINES_LEGACY, HALO, RIPPLE);
    expect(container.querySelector('.gem__ripple')).toBeNull();
    expect(container.querySelector(`radialGradient#${RIPPLE.gradientId}`)).toBeNull();
  });

  it('motion: true — re-rendering with a different halo.rx leaves the DOM attribute unchanged (React freezes its copy; GSAP owns it from here)', () => {
    const { container, rerender } = render(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} bodyLines={BODY_LINES_LEGACY} halo={HALO} ripple={RIPPLE} />
      </svg>,
    );
    expect(container.querySelector('ellipse.gem__halo')!.getAttribute('rx')).toBe('60');
    rerender(
      <svg>
        <RobotGem gem={gem} palette={palette} lightOpacity={0.7} scale={1} orbiters={MOTION} bodyLines={BODY_LINES_LEGACY} halo={{ ...HALO, rx: 41 }} ripple={RIPPLE} />
      </svg>,
    );
    expect(container.querySelector('ellipse.gem__halo')!.getAttribute('rx')).toBe('60');
  });
});

// ========================================
// MOTION MODE — docked, GSAP-owned (Phase 40 amendment: single copy per corner, no depth twins)
// ========================================
const MOTION: RobotGemOrbiters = {
  lineWidth: 0.55,
  stripOpacity: 0.4,
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

  it('DOM order: backing, defs, halo, mid--left, mid--right, 4 orbiters, top', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    const root = container.querySelector('g.gem')!;
    const roles = [...root.children].map((c) => {
      if (c.tagName === 'defs') return 'defs';
      if (c.classList.contains('gem__halo')) return 'halo';
      if (c.classList.contains('gem__orbiter')) return 'orbiter';
      if (c.classList.contains('gem__backing')) return 'backing';
      if (c.classList.contains('gem__mid--left')) return 'mid--left';
      if (c.classList.contains('gem__mid--right')) return 'mid--right';
      if (c.classList.contains('gem__top')) return 'top';
      return 'unknown';
    });
    expect(roles).toEqual(['backing', 'defs', 'halo', 'mid--left', 'mid--right', 'orbiter', 'orbiter', 'orbiter', 'orbiter', 'top']);
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

  it('each of the 4 copies has its own strip and lines with the dial attributes (T5 assertions hold per copy)', () => {
    const container = draw(palette, 0.7, 0.9, MOTION);
    container.querySelectorAll('.gem__orbiter').forEach((wrapper) => {
      const lines = wrapper.querySelector('.gem__lines')!;
      const strip = wrapper.querySelector('.gem__strip')!;
      expect(lines.getAttribute('stroke-width')).toBe('0.55');
      expect(strip.getAttribute('d')).toBe(lines.getAttribute('d'));
      expect(strip.getAttribute('stroke')).toBe(palette.light);
      expect(strip.getAttribute('stroke-width')).toBe('0.18'); // 0.55 / 3, 2dp
      expect(strip.getAttribute('opacity')).toBe('0.4');
      expect(strip.getAttribute('data-line')).toBe('orbiters');
      expect(strip.getAttribute('data-base')).toBe('0.4');
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
