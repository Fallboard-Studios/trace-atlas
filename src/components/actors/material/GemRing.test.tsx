import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { GemRing } from './GemRing';
import { RING_FACET_STROKE_PX } from './worldGemMaterial';

const FACETS = [
  { fill: 'hsl(200, 50%, 50%)', stroke: 'hsl(200, 50%, 20%)', d: 'M0,0L100,0L92,8L8,8ZM100,0L100,50L92,42L92,8Z' },
  { fill: 'hsl(200, 50%, 44%)', stroke: 'hsl(200, 50%, 20%)', d: 'M100,50L0,50L8,42L92,42Z' },
  { fill: 'hsl(200, 50%, 20%)', stroke: 'hsl(200, 50%, 20%)', d: 'M0,50L0,0L8,8L8,42Z' },
];

/** Render inside an <svg>, as every caller does, so jsdom parses the markup as SVG. */
function renderRing(props: Parameters<typeof GemRing>[0]) {
  return render(
    <svg>
      <GemRing {...props} />
    </svg>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('GemRing', () => {
  it('draws one g[data-gem="ring"] holding exactly one path per facet group', () => {
    const { container } = renderRing({ facets: FACETS });
    const groups = container.querySelectorAll('g[data-gem="ring"]');
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelectorAll('path')).toHaveLength(3);
    expect(groups[0].children).toHaveLength(3);
  });

  it('gives each path its facet d, fill and stroke, in the order given', () => {
    const { container } = renderRing({ facets: FACETS });
    const paths = Array.from(container.querySelectorAll('g[data-gem="ring"] path'));
    paths.forEach((p, i) => {
      expect(p.getAttribute('d')).toBe(FACETS[i].d);
      expect(p.getAttribute('fill')).toBe(FACETS[i].fill);
      expect(p.getAttribute('stroke')).toBe(FACETS[i].stroke);
    });
  });

  it('strokes every path at 0.6 px with round joins', () => {
    const { container } = renderRing({ facets: FACETS });
    expect(RING_FACET_STROKE_PX).toBe(0.6);
    for (const p of Array.from(container.querySelectorAll('g[data-gem="ring"] path'))) {
      expect(p.getAttribute('stroke-width')).toBe('0.6');
      expect(p.getAttribute('stroke-linejoin')).toBe('round');
    }
  });

  it('scales the stroke with the item scale: 1.1 gives 0.66', () => {
    const { container } = renderRing({ facets: FACETS, scale: 1.1 });
    for (const p of Array.from(container.querySelectorAll('g[data-gem="ring"] path'))) {
      expect(p.getAttribute('stroke-width')).toBe('0.66');
    }
  });

  it('writes the scaled stroke clean: a 0.94 factory gets 0.56, not 0.5640000000000001', () => {
    const { container } = renderRing({ facets: FACETS, scale: 0.94 });
    for (const p of Array.from(container.querySelectorAll('g[data-gem="ring"] path'))) {
      expect(p.getAttribute('stroke-width')).toBe('0.56');
    }
  });

  it('scale defaults to 1', () => {
    const a = renderRing({ facets: FACETS });
    const b = renderRing({ facets: FACETS, scale: 1 });
    expect(a.container.innerHTML).toBe(b.container.innerHTML);
  });

  it('writes no style attribute anywhere, so nothing can transition (roadmap 17.2.5)', () => {
    const { container } = renderRing({ facets: FACETS, scale: 0.9 });
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('renders nothing at all, not an empty group, when there are no facets', () => {
    const { container } = render(<GemRing facets={[]} />);
    expect(container.innerHTML).toBe('');
    const inSvg = renderRing({ facets: [] });
    expect(inSvg.container.querySelector('g')).toBeNull();
    expect(inSvg.container.querySelector('svg')!.innerHTML).toBe('');
  });

  it('draws a single facet group', () => {
    const { container } = renderRing({ facets: [FACETS[0]] });
    expect(container.querySelectorAll('g[data-gem="ring"] path')).toHaveLength(1);
  });

  it('warns about nothing when it renders several facets (every child is keyed)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRing({ facets: FACETS });
    expect(error).not.toHaveBeenCalled();
  });

  it('survives two facet groups that share a fill and stroke without a duplicate-key warning', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dupes = [FACETS[0], { ...FACETS[0], d: 'M1,1L2,2L3,1Z' }];
    const { container } = renderRing({ facets: dupes });
    expect(container.querySelectorAll('g[data-gem="ring"] path')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('reuses its path elements when the lighting tick changes their fills', () => {
    const { container, rerender } = renderRing({ facets: FACETS });
    const before = Array.from(container.querySelectorAll('g[data-gem="ring"] path'));
    const relit = FACETS.map((f) => ({ ...f, fill: 'hsl(200, 50%, 33%)' }));
    rerender(
      <svg>
        <GemRing facets={relit} />
      </svg>,
    );
    const after = Array.from(container.querySelectorAll('g[data-gem="ring"] path'));
    expect(after).toHaveLength(3);
    after.forEach((p, i) => {
      expect(p).toBe(before[i]);
      expect(p.getAttribute('fill')).toBe('hsl(200, 50%, 33%)');
    });
  });
});
