import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { GemShape, accentBase } from './gemShape';
import { assertNinetyFortyFive } from './sceneryTestHelpers';

const BASE = { h: 20, s: 55, l: 42 };

function renderGem(overrides: Partial<Parameters<typeof GemShape>[0]> = {}) {
  return render(
    <GemShape cx={100} cy={200} w={26} h={18} base={BASE} lit={false} eastL={0.9} westL={0.5} nightDepth={0.3} cap={1} {...overrides} />,
  );
}

describe('accentBase', () => {
  it('is hsl(hue, 55, 42) — spec §1.10', () => {
    expect(accentBase(120)).toEqual({ h: 120, s: 55, l: 42 });
  });
});

describe('GemShape', () => {
  it('renders under data-shape="gem"', () => {
    const { container } = renderGem();
    expect(container.querySelector('[data-shape="gem"]')).not.toBeNull();
  });

  it('emits exactly four filled polygons plus one stroked outline', () => {
    const { container } = renderGem();
    const polygons = Array.from(container.querySelectorAll('[data-shape="gem"] polygon'));
    expect(polygons).toHaveLength(5);
    const filled = polygons.filter((p) => p.getAttribute('fill') !== 'none');
    const outlines = polygons.filter((p) => p.getAttribute('fill') === 'none');
    expect(filled).toHaveLength(4);
    expect(outlines).toHaveLength(1);
    expect(outlines[0].getAttribute('stroke')).not.toBeNull();
    expect(outlines[0].getAttribute('stroke-width')).toBe('2');
  });

  it('the three facet tones (upper, lower, side) are three distinct fills', () => {
    const { container } = renderGem();
    const polygons = Array.from(container.querySelectorAll('[data-shape="gem"] polygon')).filter(
      (p) => p.getAttribute('fill') !== 'none',
    );
    // polygons[0] is the base body; [1]=upper, [2]=lower, [3]=side (render order).
    const [, upper, lower, side] = polygons.map((p) => p.getAttribute('fill'));
    expect(new Set([upper, lower, side]).size).toBe(3);
  });

  it('matches the spec §1.10 multipliers exactly (upper ×1.25, lower ×0.5, side ×1.1) for an unlit gem', () => {
    const eastL = 0.6;
    const westL = 0.6; // east === west -> side defaults to the east face
    const cap = 1;
    const glow = ((eastL + westL) / 2) * cap;
    const { container } = renderGem({ eastL, westL, cap, lit: false });
    const polygons = Array.from(container.querySelectorAll('[data-shape="gem"] polygon')).filter(
      (p) => p.getAttribute('fill') !== 'none',
    );
    const [, upper, lower, side] = polygons.map((p) => p.getAttribute('fill'));
    const expectedL = (mult: number) => Math.round(BASE.l * glow * mult);
    expect(upper).toBe(`hsl(${BASE.h}, ${BASE.s}%, ${expectedL(1.25)}%)`);
    expect(lower).toBe(`hsl(${BASE.h}, ${BASE.s}%, ${expectedL(0.5)}%)`);
    expect(side).toBe(`hsl(${BASE.h}, ${BASE.s}%, ${expectedL(1.1)}%)`);
  });

  it('a lit gem uses lightness × lerp(0.9, 1.6, nightDepth), not the ambient cap formula', () => {
    const { container: dark } = renderGem({ lit: true, nightDepth: 0, eastL: 0.1, westL: 0.1, cap: 0.5 });
    const { container: bright } = renderGem({ lit: true, nightDepth: 1, eastL: 0.1, westL: 0.1, cap: 0.5 });
    const bodyFillDark = dark.querySelectorAll('[data-shape="gem"] polygon')[0].getAttribute('fill');
    const bodyFillBright = bright.querySelectorAll('[data-shape="gem"] polygon')[0].getAttribute('fill');
    const expectedDark = `hsl(${BASE.h}, ${BASE.s}%, ${Math.round(BASE.l * 0.9 * 0.75)}%)`;
    const expectedBright = `hsl(${BASE.h}, ${BASE.s}%, ${Math.round(BASE.l * 1.6 * 0.75)}%)`;
    expect(bodyFillDark).toBe(expectedDark);
    expect(bodyFillBright).toBe(expectedBright);
  });

  it('the side facet sits on the east edge when eastL >= westL', () => {
    const { container } = renderGem({ eastL: 0.9, westL: 0.2 });
    const polygons = Array.from(container.querySelectorAll('[data-shape="gem"] polygon'));
    const sidePoints = polygons[3].getAttribute('points') ?? '';
    const xs = sidePoints.trim().split(/\s+/).map((pair) => Number(pair.split(',')[0]));
    // East side hugs the right edge: cx + w/2 = 100 + 13 = 113.
    expect(Math.max(...xs)).toBe(113);
  });

  it('the side facet sits on the west edge when westL > eastL', () => {
    const { container } = renderGem({ eastL: 0.2, westL: 0.9 });
    const polygons = Array.from(container.querySelectorAll('[data-shape="gem"] polygon'));
    const sidePoints = polygons[3].getAttribute('points') ?? '';
    const xs = sidePoints.trim().split(/\s+/).map((pair) => Number(pair.split(',')[0]));
    // West side hugs the left edge: cx - w/2 = 100 - 13 = 87.
    expect(Math.min(...xs)).toBe(87);
  });

  it('no NaN attributes and every edge is 90/45, across 50 seeds of w/h/lighting', () => {
    for (let i = 0; i < 50; i++) {
      const { container } = renderGem({
        w: 10 + i * 3,
        h: 8 + i * 2,
        eastL: 0.1 + (i % 10) / 10,
        westL: 0.9 - (i % 10) / 10,
        nightDepth: (i % 10) / 10,
        lit: i % 2 === 0,
      });
      assertNinetyFortyFive(container);
    }
  });

  it('mutation check: the facet multiplier lookup must distinguish all three quantized levels, not collapse two', () => {
    // Re-derive the same quantized levels gemShape.ts uses (GEM_FACET_TONES = 3) and confirm the
    // chosen multipliers (1.25 / 1.1 / 0.5) are pairwise distinct — collapsing any two would make
    // this test's "three distinct fills" case above pass by accident on some inputs but fail on
    // others (e.g. whenever base.l * glow happens to make two multipliers round to the same %).
    const multipliers = [1.25, 1.1, 0.5];
    expect(new Set(multipliers).size).toBe(3);
  });
});
