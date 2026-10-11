/**
 * Shared helpers for tests that read the world gem material back out of rendered markup
 * (docs/specs/WORLD_GEM_MATERIAL.md §5). Test-only: nothing in the app imports this file.
 */
import { HAIRLINE_PX, WORLD_GEM } from './worldGemMaterial';

export type Pt = [number, number];

/** One facet quad read back from a ring's merged path: `[outer a, outer b, inner of b, inner of a]`. */
export interface RingFacet {
  fill: string;
  stroke: string;
  pts: Pt[];
}

/** Every `g[data-gem="ring"]` under a root, in document order. */
export const ringsIn = (root: ParentNode): Element[] => Array.from(root.querySelectorAll('g[data-gem="ring"]'));

/** Every facet quad of one ring, in the order its merged paths list them. */
export function facetsOfRing(ring: Element): RingFacet[] {
  return Array.from(ring.querySelectorAll('path')).flatMap((path) =>
    (path.getAttribute('d') ?? '')
      .split('M')
      .filter(Boolean)
      .map((sub) => ({
        fill: path.getAttribute('fill') ?? '',
        stroke: path.getAttribute('stroke') ?? '',
        pts: Array.from(sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)).map((m): Pt => [Number(m[1]), Number(m[2])]),
      })),
  );
}

/** Coordinates are written to two decimals, so compare to a hair more than that. */
export const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.011;

/** The facet whose outer edge runs (ax, ay) to (bx, by). */
export const facetOn = (facets: RingFacet[], [ax, ay]: Pt, [bx, by]: Pt): RingFacet | undefined =>
  facets.find((f) => near(f.pts[0][0], ax) && near(f.pts[0][1], ay) && near(f.pts[1][0], bx) && near(f.pts[1][1], by));

/** The box a ring sits on: the extent of its facets' outer edges. */
export function outerBox(ring: Element) {
  const outer = facetsOfRing(ring).flatMap((f) => [f.pts[0], f.pts[1]]);
  return {
    x0: Math.min(...outer.map((p) => p[0])),
    y0: Math.min(...outer.map((p) => p[1])),
    x1: Math.max(...outer.map((p) => p[0])),
    y1: Math.max(...outer.map((p) => p[1])),
  };
}

/** Run `body` with one WORLD_GEM piece forced, restoring it whatever happens. */
export function withSwitch(piece: keyof typeof WORLD_GEM, value: boolean, body: () => void): void {
  const switches = WORLD_GEM as Record<string, boolean>;
  const before = switches[piece];
  switches[piece] = value;
  try {
    body();
  } finally {
    switches[piece] = before;
  }
}

/**
 * What of the world gem material a chunk of markup carries: `'ring'` for a `data-gem="ring"` group,
 * `'hairline'` for a 1.5 px stroke (the only place that width is drawn — the scenery gem's own
 * outline is 2 px and a ring facet's 0.6 px sits inside a ring group). Empty means the markup is as
 * it was before the material existed; the switch-off tests assert exactly that.
 */
export function worldGemTraces(markup: string): Array<'ring' | 'hairline'> {
  const traces: Array<'ring' | 'hairline'> = [];
  if (markup.includes('data-gem="ring"')) traces.push('ring');
  if (markup.includes(`stroke-width="${HAIRLINE_PX}"`)) traces.push('hairline');
  return traces;
}

/** A root's markup with every ring group removed: what is left must equal the switched-off render. */
export function markupWithoutRings(root: Element): string {
  const copy = root.cloneNode(true) as Element;
  copy.querySelectorAll('g[data-gem="ring"]').forEach((g) => g.remove());
  return copy.innerHTML;
}
