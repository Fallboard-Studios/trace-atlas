// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { facetPaths, linesPath, quadPath } from './gemPaths';
import { getRobotGem, type GemPoint } from './polygon';
import { gemPalette } from './gemPalette';

// ========================================
// HELPERS
// ========================================
const subpaths = (d: string) => d.split('Z').map((s) => s.trim()).filter(Boolean);

// ========================================
// TESTS
// ========================================
describe('quadPath', () => {
  it('is one closed subpath through the four points, two-decimal coordinates', () => {
    expect(quadPath([[0, 0], [10.004, 0], [10, 5.556], [0.1, 5]])).toBe('M0,0L10,0L10,5.56L0.1,5Z');
  });
});

describe('facetPaths — one path per distinct facet fill (Phase 39 Task 9a)', () => {
  const square: GemPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const inner: GemPoint[] = [[2, 2], [8, 2], [8, 8], [2, 8]];

  it('groups facets sharing a fill into one path, in first-appearance order', () => {
    const paths = facetPaths(square, inner, ['a', 'b', 'a', 'c']);
    expect(paths.map((p) => p.fill)).toEqual(['a', 'b', 'c']);
    expect(subpaths(paths[0].d)).toHaveLength(2);
    expect(subpaths(paths[1].d)).toHaveLength(1);
    expect(subpaths(paths[2].d)).toHaveLength(1);
  });

  it('facet i is the quad outline[i] → outline[i+1] → inset[i+1] → inset[i], wrapping at the end', () => {
    const paths = facetPaths(square, inner, ['a', 'b', 'c', 'd']);
    expect(paths[0].d).toBe(quadPath([square[0], square[1], inner[1], inner[0]]));
    expect(paths[3].d).toBe(quadPath([square[3], square[0], inner[0], inner[3]]));
  });

  it('with every fill distinct it is one path per facet; with one fill, one path holding every facet', () => {
    expect(facetPaths(square, inner, ['a', 'b', 'c', 'd'])).toHaveLength(4);
    const one = facetPaths(square, inner, ['x', 'x', 'x', 'x']);
    expect(one).toHaveLength(1);
    expect(subpaths(one[0].d)).toHaveLength(4);
  });

  it('on a real robot every facet appears exactly once across the paths', () => {
    const gem = getRobotGem(20261004);
    const paint = gemPalette(gem, '#41ad9f', 1, [1, 1], 20);
    const paths = facetPaths(gem.top.pts, gem.top.inner, paint.top.facets);
    const all = paths.flatMap((p) => subpaths(p.d));
    expect(all).toHaveLength(gem.top.pts.length);
    expect(new Set(all).size).toBe(gem.top.pts.length);
    expect(paths.map((p) => p.fill)).toEqual([...new Set(paint.top.facets)]);
  });
});

describe('linesPath — every boundary line of a part in one path', () => {
  it('starts each line with M and continues it with L, open (no Z)', () => {
    expect(linesPath([[[0, 0], [4, 4], [4, 9]], [[1, 1], [6, 1]]])).toBe('M0,0L4,4L4,9M1,1L6,1');
  });

  it('is empty for a part with no lines', () => {
    expect(linesPath([])).toBe('');
  });
});
