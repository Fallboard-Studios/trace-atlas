// ========================================
// GEM PATH BUILDERS (docs/tasks/GEM_POLYGON_ROBOTS.md Task 9a)
// ========================================
// The moving robot layer re-rasterizes every child each frame, so its cost tracks element count
// (docs/PERFORMANCE.md, Phase 39 Task 9). These builders let RobotGem draw a part's facets as one
// <path> per fill and its boundary lines as one <path>, instead of one element each.

// ========================================
// IMPORTS
// ========================================
import type { GemPoint } from './polygon';

// ========================================
// HELPERS
// ========================================
const r2 = (n: number) => Number(n.toFixed(2));
const xy = ([x, y]: GemPoint) => `${r2(x)},${r2(y)}`;

/** One closed subpath through four points. */
export function quadPath(q: readonly [GemPoint, GemPoint, GemPoint, GemPoint]): string {
  return `M${xy(q[0])}L${xy(q[1])}L${xy(q[2])}L${xy(q[3])}Z`;
}

/**
 * A bevelled part's facets grouped by fill: facet i (outline[i] → outline[i+1] → inset[i+1] →
 * inset[i]) joins the path of fills[i]. Paths are in first-appearance order of their fill.
 */
export function facetPaths(
  outline: readonly GemPoint[],
  inner: readonly GemPoint[],
  fills: readonly string[],
): Array<{ fill: string; d: string }> {
  const byFill = new Map<string, string>();
  outline.forEach((p, i) => {
    const j = (i + 1) % outline.length;
    byFill.set(fills[i], (byFill.get(fills[i]) ?? '') + quadPath([p, outline[j], inner[j], inner[i]]));
  });
  return [...byFill].map(([fill, d]) => ({ fill, d }));
}

/** Every boundary line of a part as subpaths of one open path ('' when there are none). */
export function linesPath(lines: readonly (readonly GemPoint[])[]): string {
  return lines.map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p)}`).join('')).join('');
}
