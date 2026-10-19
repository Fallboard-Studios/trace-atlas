import { describe, expect, it } from 'vitest';

import { sceneFit } from './sceneFit';
import { WORLD_BOUNDS } from '@/constants/sceneDepth';

// docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.1 (roadmap Phase 53, Task 5). `sceneFit` is the
// `preserveAspectRatio="xMidYMax slice"` fit the scene's shared viewBox gave every sheet, as plain
// arithmetic, so one CSS scale-and-offset on the stage can replace it. It is pure: no DOM, no clock.

interface Box {
  width: number;
  height: number;
}

/**
 * The slice fit written the way the SVG spec words it (preserveAspectRatio: scale = the larger of
 * the two axis ratios for `slice`; align factors xMid = 0.5 and YMax = 1 place the leftover space),
 * so `sceneFit` is checked against a second statement of the rule, not against itself.
 */
function svgXMidYMaxSlice(box: Box, viewBox: Box) {
  const scale = Math.max(box.width / viewBox.width, box.height / viewBox.height);
  return {
    scale,
    x: (box.width - viewBox.width * scale) * 0.5,
    y: (box.height - viewBox.height * scale) * 1,
  };
}

const WIDTHS = [160, 320, 390, 640, 1024, 1280, 1920, 2560, 3440];
const HEIGHTS = [90, 180, 400, 720, 900, 1080, 1440];
const GRID: Box[] = WIDTHS.flatMap((width) => HEIGHTS.map((height) => ({ width, height })));

describe('sceneFit', () => {
  it('a box exactly 16:9 at the stage size is the identity fit', () => {
    expect(sceneFit({ width: 1920, height: 1080 })).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('a smaller exact 16:9 box scales by either side with no offset', () => {
    const fit = sceneFit({ width: 1280, height: 720 });
    expect(fit.scale).toBeCloseTo(2 / 3, 12);
    expect(fit.x).toBeCloseTo(0, 9);
    expect(fit.y).toBeCloseTo(0, 9);
  });

  it('a box wider than 16:9 scales to its width and loses the top of the world, never the ground', () => {
    const fit = sceneFit({ width: 2560, height: 1080 });
    expect(fit.scale).toBeCloseTo(4 / 3, 12);
    expect(fit.x).toBeCloseTo(0, 9);
    // 1080 tall box, 1440 tall scaled stage: the stage hangs 360 above the box, bottoms aligned.
    expect(fit.y).toBeCloseTo(-360, 9);
  });

  it('a box taller than 16:9 (unreachable in the app, still defined) scales to its height and centres horizontally', () => {
    const fit = sceneFit({ width: 1080, height: 1080 });
    expect(fit.scale).toBeCloseTo(1, 12);
    expect(fit.x).toBeCloseTo(-420, 9);
    expect(fit.y).toBeCloseTo(0, 9);
  });

  it('a portrait phone box is height-driven: the stage is wider than the box and centred', () => {
    // 390 x 400: 400 / 1080 beats 390 / 1920, so the scale follows the height.
    const fit = sceneFit({ width: 390, height: 400 });
    expect(fit.scale).toBeCloseTo(400 / 1080, 12);
    expect(fit.x).toBeCloseTo((390 - 1920 * (400 / 1080)) / 2, 9);
    expect(fit.y).toBeCloseTo(0, 9);
  });

  it('a 0 x 0 box returns scale 0 with finite offsets (the hook, not this function, decides to skip it)', () => {
    expect(sceneFit({ width: 0, height: 0 })).toEqual({ scale: 0, x: 0, y: 0 });
  });

  it('fits a stage other than the world when one is given', () => {
    // 200 x 200 box, 100 x 50 stage: height ratio 4 beats width ratio 2; stage is 400 wide, 200 tall.
    expect(sceneFit({ width: 200, height: 200 }, { width: 100, height: 50 })).toEqual({
      scale: 4,
      x: -100,
      y: 0,
    });
  });

  it('the default stage is the world bounds', () => {
    const box = { width: 2560, height: 1080 };
    expect(sceneFit(box)).toEqual(sceneFit(box, WORLD_BOUNDS));
  });

  it('agrees with the SVG xMidYMax slice rule over a grid of boxes, wider, exact and taller', () => {
    for (const box of GRID) {
      const expected = svgXMidYMaxSlice(box, WORLD_BOUNDS);
      const fit = sceneFit(box);
      expect(fit.scale, `${box.width}x${box.height} scale`).toBeCloseTo(expected.scale, 9);
      expect(fit.x, `${box.width}x${box.height} x`).toBeCloseTo(expected.x, 9);
      expect(fit.y, `${box.width}x${box.height} y`).toBeCloseTo(expected.y, 9);
    }
  });

  it('always pins the stage bottom to the box bottom and centres it horizontally', () => {
    for (const box of GRID) {
      const { scale, x, y } = sceneFit(box);
      const stageRight = x + WORLD_BOUNDS.width * scale;
      expect(y + WORLD_BOUNDS.height * scale, `${box.width}x${box.height} bottom`).toBeCloseTo(
        box.height,
        9
      );
      // Equal overhang left and right: the left edge sits as far outside as the right edge does.
      expect(x + stageRight, `${box.width}x${box.height} centre`).toBeCloseTo(box.width, 9);
    }
  });

  it('a box at least as wide as 16:9 is always fully covered by the stage', () => {
    for (const box of GRID.filter((b) => b.width * 9 >= b.height * 16)) {
      const { scale, x, y } = sceneFit(box);
      expect(x, `${box.width}x${box.height} left`).toBeLessThanOrEqual(1e-9);
      expect(y, `${box.width}x${box.height} top`).toBeLessThanOrEqual(1e-9);
      expect(
        x + WORLD_BOUNDS.width * scale,
        `${box.width}x${box.height} right`
      ).toBeGreaterThanOrEqual(box.width - 1e-9);
    }
  });
});
