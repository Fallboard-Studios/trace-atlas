// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { RobotGem } from './RobotGem';
import source from './RobotGem.tsx?raw';
import { getRobotGem, gemWidth, GEM_CANVAS_H, type GemPart } from './polygon';
import { gemPalette, type GemPalette } from './gemPalette';

// ========================================
// FIXTURES
// ========================================
const gem = getRobotGem(20261004);
const palette = gemPalette(gem, '#41ad9f', 1, [1, 0.15], 20);
const parts: Array<[string, GemPart]> = [
  ['backing', gem.backing],
  ['orbiter', gem.orbiters[0]],
  ['orbiter', gem.orbiters[1]],
  ['orbiter', gem.orbiters[2]],
  ['orbiter', gem.orbiters[3]],
  ['mid--left', gem.midLeft],
  ['mid--right', gem.midRight],
  ['top', gem.top],
];

function draw(p: GemPalette = palette, lightOpacity = 0.7, scale = 0.9) {
  const { container } = render(
    <svg>
      <RobotGem gem={gem} palette={p} lightOpacity={lightOpacity} scale={scale} />
    </svg>,
  );
  return container;
}

function partGroups(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('g.gem__part')];
}

const fmt = (n: number) => Number(n.toFixed(2));

// ========================================
// TESTS
// ========================================
describe('RobotGem — draw-only renderer (docs/specs/GEM_POLYGON_ROBOTS.md §1.5)', () => {
  it('draws the parts in z order: backing, four orbiters, mid--left, mid--right, top', () => {
    const groups = partGroups(draw());
    expect(groups).toHaveLength(8);
    groups.forEach((g, i) => expect(g.getAttribute('class')).toContain(`gem__${parts[i][0]}`));
    ['tl', 'tr', 'bl', 'br'].forEach((corner, i) => expect(groups[1 + i].getAttribute('class')).toContain(`gem__orbiter--${corner}`));
  });

  it('places each part at its layout position', () => {
    partGroups(draw()).forEach((g, i) => {
      const { x, y } = parts[i][1];
      expect(g.getAttribute('transform')).toBe(`translate(${fmt(x)} ${fmt(y)})`);
    });
  });

  it('one facet per outline edge on every bevelled part, none on the backing; one face each', () => {
    partGroups(draw()).forEach((g, i) => {
      const [name, part] = parts[i];
      expect(g.querySelectorAll('.gem__facet')).toHaveLength(name === 'backing' ? 0 : part.pts.length);
      expect(g.querySelectorAll('.gem__face')).toHaveLength(1);
    });
  });

  it('each facet is the quad between an outline edge and its inset edge', () => {
    const top = partGroups(draw())[7];
    const facet = top.querySelectorAll('.gem__facet')[0];
    const { pts, inner } = gem.top;
    const quad = [pts[0], pts[1], inner[1], inner[0]].map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
    expect(facet.getAttribute('points')).toBe(quad);
  });

  it('boundary lines: top 4, each mid 2, each orbiter 1, backing 0', () => {
    const want = [0, 1, 1, 1, 1, 2, 2, 4];
    partGroups(draw()).forEach((g, i) => expect(g.querySelectorAll('.gem__line')).toHaveLength(want[i]));
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
        if (v !== null) expect(allowed.has(v)).toBe(true);
      }
    });
    expect(source).not.toMatch(/hsl\(|#[0-9a-f]{6}\b|hexToHsl|facetTone/i);
  });

  it('a palette change reaches the matching elements (mid--left facets follow palette.midLeft)', () => {
    const groups = partGroups(draw());
    const fills = [...groups[5].querySelectorAll('.gem__facet')].map((f) => f.getAttribute('fill'));
    expect(fills).toEqual(palette.midLeft.facets);
    expect(groups[7].querySelector('.gem__face')!.getAttribute('fill')).toBe(palette.top.face);
  });

  it('scales the whole robot about the canvas centre', () => {
    const W = gemWidth(gem);
    const root = draw(palette, 1, 0.8).querySelector('g.gem')!;
    expect(root.getAttribute('transform')).toBe(`translate(${W / 2} ${GEM_CANVAS_H / 2}) scale(0.8) translate(${-W / 2} ${-GEM_CANVAS_H / 2})`);
  });

  it('drawable element count is exactly Σ(facets + face + lines) + 2 circles per light — a perf cut shows here', () => {
    const container = draw();
    const drawn = container.querySelectorAll('polygon, polyline, circle').length;
    const expected =
      1 + // backing face
      [...gem.orbiters, gem.midLeft, gem.midRight, gem.top].reduce((n, p) => n + p.pts.length + 1 + p.lines.length, 0) +
      gem.top.lights.length * 2;
    expect(drawn).toBe(expected);
  });
});
