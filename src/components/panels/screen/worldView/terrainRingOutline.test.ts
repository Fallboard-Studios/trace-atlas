/**
 * The outline the terrain ring is built on (docs/specs/WORLD_GEM_MATERIAL.md §1.7, plan Task 18).
 * The drawn polygon is the profile closed to the scene's bottom corners, and an 8 px miter inset of
 * THAT polygon does not hold on real worlds: the profile builder ends in a final flat run as short
 * as 0.3 px (it stops the run at x = 1920), emits zero-length "steps", can overshoot x = 1920 by
 * 48 px with its last 45 degree step, and the ground band leaves only 5 px between the profile and
 * the bottom frame. So the ring is built on this outline instead: the profile, extended past the
 * frame on the left, right and bottom, with zero-length edges and collinear vertices removed.
 * Everything the extension adds lies outside the scene and its facets are dropped.
 */
import { describe, it, expect } from 'vitest';

import { terrainRingOutline, terrainRingSkipEdge, TERRAIN_RING_MARGIN } from './terrainRingOutline';
import { getTerrainProfile, __clearTerrainProfileCache, type Step } from '@/systems/terrainProfile';
import { getLocaleNoiseMap, evictLocaleNoiseMap } from '@/utils/noiseMaps';
import { bevelHolds } from '@/components/robot/gem/polygon';
import { WORLD_BEVEL_PX } from '@/components/actors/material/worldGemMaterial';

const W = 1920;
const H = 1080;
const M = TERRAIN_RING_MARGIN;
type Pt = [number, number];

const step = (x0: number, y0: number, x1: number, y1: number): Step => ({ x0, y0, x1, y1 });

function profileOf(i: number, part: 'ridge' | 'ground'): Step[] {
  const id = `ring-outline-${i}`;
  __clearTerrainProfileCache();
  evictLocaleNoiseMap(id);
  const noiseMap = getLocaleNoiseMap(id, ((i * 13) % 211) - 100, ((i * 7) % 61) - 30);
  return getTerrainProfile(id, noiseMap)[part];
}

const edges = (pts: Pt[]) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]] as [Pt, Pt]);
const onGrid = ([a, b]: [Pt, Pt]) => {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  return dx < 1e-9 || dy < 1e-9 || Math.abs(dx - dy) < 1e-6;
};

describe('the margin', () => {
  it('is four ring depths (32 px): far enough that no corner of the extension is anywhere near the scene', () => {
    expect(M).toBe(4 * WORLD_BEVEL_PX);
    expect(M).toBe(32);
  });
});

describe('terrainRingOutline: the shape', () => {
  const steps = [step(0, 860, 200, 860), step(200, 860, 240, 820), step(240, 820, 500, 820), step(500, 820, 520, 840), step(520, 840, 1920, 840)];
  const outline = terrainRingOutline(steps, W, H);

  it('starts left of the frame at the profile\'s first height and ends in the bottom-left, outside the scene', () => {
    expect(outline[0]).toEqual([-M, 860]);
    expect(outline[outline.length - 1]).toEqual([-M, H + M]);
  });

  it('runs along the profile, then out past the right edge, down to below the bottom frame, and back', () => {
    expect(outline).toContainEqual([240, 820]);
    expect(outline).toContainEqual([500, 820]);
    expect(outline).toContainEqual([520, 840]);
    expect(outline).toContainEqual([W + M, 840]);
    expect(outline).toContainEqual([W + M, H + M]);
  });

  it('merges the profile\'s first and last runs with their extensions: no vertex sits on the scene\'s own edge', () => {
    expect(outline.some(([x]) => x === 0)).toBe(false);
    expect(outline.some(([x]) => x === W)).toBe(false);
    expect(outline).toHaveLength(8);
  });

  it('every edge is horizontal, vertical or exactly 45 degrees', () => {
    for (const e of edges(outline)) expect(onGrid(e), `${e[0]} to ${e[1]}`).toBe(true);
  });

  it('holds an 8 px bevel', () => {
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
  });
});

describe('terrainRingOutline: the real profile\'s quirks, one at a time', () => {
  it('drops a zero-length step (the builder draws one whenever the step delta is 0) and merges the runs either side of it', () => {
    const outline = terrainRingOutline([step(0, 860, 150, 860), step(150, 860, 150, 860), step(150, 860, 400, 860), step(400, 860, 1920, 860)], W, H);
    expect(outline).toEqual([[-M, 860], [W + M, 860], [W + M, H + M], [-M, H + M]]);
  });

  it('absorbs a final flat run that is only 0.3 px long (the builder stops it at x = 1920)', () => {
    // a clean 140 px rise on a 140 px run, a 1479.7 px run, and the 0.3 px sliver the builder leaves
    const steps = [step(0, 800, 300, 800), step(300, 800, 440, 660), step(440, 660, 1919.7, 660), step(1919.7, 660, 1920, 660)];
    const outline = terrainRingOutline(steps, W, H);
    expect(outline.every(([x]) => x !== 1919.7 && x !== 1920)).toBe(true);
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
    // without the merge the sliver inverts the bevel
    const drawn: Pt[] = [[0, 800], [300, 800], [440, 660], [1919.7, 660], [1920, 660], [W, H], [0, H]];
    expect(bevelHolds(drawn, WORLD_BEVEL_PX)).toBe(false);
  });

  it('copes with a last 45 degree step that overshoots x = 1920 (the builder does not clamp it): the margin goes past the overshoot', () => {
    const steps = [step(0, 860, 1900, 860), step(1900, 860, 1948, 908)];
    const outline = terrainRingOutline(steps, W, H);
    expect(outline).toContainEqual([1948, 908]);
    expect(Math.max(...outline.map(([x]) => x))).toBe(1948 + M);
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
  });

  it('keeps 8 px clear of the bottom even where the ground is only 5 px above the frame (y 1075 under a 1080 frame)', () => {
    const outline = terrainRingOutline([step(0, 1075, 1920, 1075)], W, H);
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
    expect(Math.max(...outline.map(([, y]) => y))).toBe(H + M);
  });

  it('puts the bottom below the profile whatever the scene height it is given (a profile lower than `height`)', () => {
    const outline = terrainRingOutline([step(0, 900, 1920, 900)], W, 400);
    expect(Math.max(...outline.map(([, y]) => y))).toBe(900 + M);
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
  });

  it('keeps a tiny 5 px ground step (a 7 px edge): its inner edge survives the bevel', () => {
    const outline = terrainRingOutline([step(0, 1070, 900, 1070), step(900, 1070, 905, 1075), step(905, 1075, 1920, 1075)], W, H);
    expect(bevelHolds(outline, WORLD_BEVEL_PX)).toBe(true);
    expect(outline).toContainEqual([900, 1070]);
    expect(outline).toContainEqual([905, 1075]);
  });

  it('a profile that starts right of x = 0 still extends left to -margin', () => {
    const outline = terrainRingOutline([step(10, 860, 1920, 860)], W, H);
    expect(outline[0][0]).toBe(-M);
  });

  it('a profile that starts left of x = 0 extends left from where it starts, not from 0', () => {
    const outline = terrainRingOutline([step(-5, 860, 1920, 860)], W, H);
    expect(outline[0][0]).toBe(-5 - M);
  });

  it('is a plain flat world when the profile is one run: four corners', () => {
    expect(terrainRingOutline([step(0, 700, 1920, 700)], W, H)).toEqual([[-M, 700], [W + M, 700], [W + M, H + M], [-M, H + M]]);
  });

  it('does not mutate the steps it is given', () => {
    const steps = Object.freeze([Object.freeze(step(0, 860, 400, 860)), Object.freeze(step(400, 860, 1920, 860))]);
    expect(() => terrainRingOutline(steps, W, H)).not.toThrow();
  });
});

describe('terrainRingOutline: every real profile, both layers', () => {
  const SEEDS = Array.from({ length: 400 }, (_, i) => i);

  it.each(['ridge', 'ground'] as const)('%s: an 8 px bevel holds on all 400 sampled worlds (the drawn polygon\'s own does not)', (part) => {
    let drawnFails = 0;
    for (const i of SEEDS) {
      const steps = profileOf(i, part);
      const outline = terrainRingOutline(steps, W, H);
      expect(bevelHolds(outline, WORLD_BEVEL_PX), `${part} #${i}`).toBe(true);
      const drawn: Pt[] = [[steps[0].x0, steps[0].y0], ...steps.map((s): Pt => [s.x1, s.y1]), [W, H], [0, H]];
      if (!bevelHolds(drawn, WORLD_BEVEL_PX)) drawnFails++;
    }
    // the reason this module exists: the polygon as drawn fails on most worlds
    expect(drawnFails).toBeGreaterThan(SEEDS.length / 10);
  });

  it.each(['ridge', 'ground'] as const)('%s: every edge is on the grid, none is zero-length, and no vertex is collinear', (part) => {
    for (const i of SEEDS.slice(0, 120)) {
      const outline = terrainRingOutline(profileOf(i, part), W, H);
      outline.forEach((p, k) => {
        const prev = outline[(k + outline.length - 1) % outline.length];
        const next = outline[(k + 1) % outline.length];
        expect(Math.hypot(next[0] - p[0], next[1] - p[1])).toBeGreaterThan(0);
        const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
        expect(Math.abs(cross), `${part} #${i} vertex ${k}`).toBeGreaterThan(1e-9);
      });
      for (const e of edges(outline)) expect(onGrid(e), `${part} #${i}`).toBe(true);
    }
  });

  it.each(['ridge', 'ground'] as const)('%s: every vertex between the two ends is on the profile, at its own height', (part) => {
    for (const i of SEEDS.slice(0, 120)) {
      const steps = profileOf(i, part);
      const onProfile = new Set(steps.flatMap((s) => [`${s.x0},${s.y0}`, `${s.x1},${s.y1}`]));
      const inner = terrainRingOutline(steps, W, H).filter(([x, y]) => x > -M && x < Math.max(W, steps[steps.length - 1].x1) + M && y < H);
      for (const [x, y] of inner) expect(onProfile.has(`${x},${y}`), `${part} #${i} (${x},${y})`).toBe(true);
    }
  });
});

describe('terrainRingSkipEdge: the frame, and only the frame', () => {
  const skip = terrainRingSkipEdge(W, H);

  it('drops the left, right and bottom frame edges of the extended outline', () => {
    expect(skip([-M, H + M], [-M, 860])).toBe(true); // left, outside the scene
    expect(skip([W + M, 840], [W + M, H + M])).toBe(true); // right
    expect(skip([W + M, H + M], [-M, H + M])).toBe(true); // bottom
  });

  it('drops the extension runs that lie wholly outside the scene', () => {
    expect(skip([-M, 860], [0, 860])).toBe(true); // left of x = 0
    expect(skip([1920, 840], [W + M, 840])).toBe(true); // right of x = W
    expect(skip([1948, 908], [W + 48 + M, 908])).toBe(true);
  });

  it('keeps every edge of the profile that is in the scene: runs, steps, and a run that crosses the scene edge', () => {
    expect(skip([0, 860], [200, 860])).toBe(false);
    expect(skip([200, 860], [240, 820])).toBe(false);
    expect(skip([1000, 840], [1920, 840])).toBe(false);
    expect(skip([-M, 860], [W + M, 860])).toBe(false); // a one-run world: its top spans the scene
  });

  it('keeps the part of an overshooting 45 degree step that is in the scene', () => {
    expect(skip([1900, 860], [1948, 908])).toBe(false);
  });

  it('drops nothing for a profile edge even at the lowest height the ground reaches (1075, five px above the frame)', () => {
    expect(skip([300, 1075], [900, 1075])).toBe(false);
  });

  it('respects the width and height it is given', () => {
    const narrow = terrainRingSkipEdge(800, 400);
    expect(narrow([900, 300], [1200, 300])).toBe(true); // right of an 800 wide scene
    expect(narrow([100, 500], [300, 500])).toBe(true); // below a 400 tall one
    expect(narrow([100, 300], [300, 300])).toBe(false);
  });
});
