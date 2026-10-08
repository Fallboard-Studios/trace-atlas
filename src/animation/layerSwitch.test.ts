// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { findLayerSwitchPoint, robotBoxAt } from './layerSwitch';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../components/robot/gem/polygon';
import { LAYER_SWITCH_STEP } from '../constants';
import type { Box } from '../systems/stations';

// ========================================
// FIXTURES
// ========================================
/** A 10 × 10 robot box at its position. */
const BOX: Box = { x0: 0, y0: 0, x1: 10, y1: 10 };

/** A midground silhouette spanning x 0–100, y −50–50. */
const WALL: Box = { x0: 0, y0: -50, x1: 100, y1: 50 };

// ========================================
// TESTS
// ========================================
describe('findLayerSwitchPoint (Phase 43 Task 32, spec §1.10)', () => {
  it('samples every 20 units', () => {
    expect(LAYER_SWITCH_STEP).toBe(20);
  });

  it('a leg already clear returns `from`', () => {
    expect(findLayerSwitchPoint({ x: 500, y: 0 }, { x: 900, y: 0 }, BOX, [WALL])).toEqual({ x: 500, y: 0 });
  });

  it('returns a fresh point, never `from` or `to` itself', () => {
    const from = { x: 500, y: 0 };
    const point = findLayerSwitchPoint(from, { x: 900, y: 0 }, BOX, [WALL]);
    expect(point).not.toBe(from);
    expect(from).toEqual({ x: 500, y: 0 });

    const to = { x: 110, y: 0 }; // only the leg end clears a wall to 110
    const end = findLayerSwitchPoint({ x: 0, y: 0 }, to, BOX, [{ ...WALL, x1: 110 }]);
    expect(end).toEqual(to);
    expect(end).not.toBe(to);
  });

  it('with no midground silhouettes, `from` is clear', () => {
    expect(findLayerSwitchPoint({ x: 50, y: 0 }, { x: 900, y: 0 }, BOX, [])).toEqual({ x: 50, y: 0 });
  });

  it('finds the first clear sample along the leg — a box touching an edge is clear', () => {
    // Samples at x = 0, 20, …; the box clears the wall once its left edge reaches x1 = 100.
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 400, y: 0 }, BOX, [WALL])).toEqual({ x: 100, y: 0 });
  });

  it('a sample still overlapping by a fraction is not clear', () => {
    // From x = 1: samples 1, 21, …, 81, 101 — 81 overlaps (81 + 10 > 0 and 81 < 100), 101 is clear.
    expect(findLayerSwitchPoint({ x: 1, y: 0 }, { x: 400, y: 0 }, BOX, [WALL])).toEqual({ x: 101, y: 0 });
  });

  it('samples only every 20 units — a clear point between samples is skipped', () => {
    // Clear from x = 100; samples from x = 5 are 5, 25, …, 85, 105 — so 105, not 100.
    expect(findLayerSwitchPoint({ x: 5, y: 0 }, { x: 400, y: 0 }, BOX, [WALL])).toEqual({ x: 105, y: 0 });
  });

  it('checks the leg end when the length is not a multiple of the step', () => {
    // Samples 0, 20, …, 100 overlap a wall to 110; the end at 110 is the first clear point.
    const wall: Box = { ...WALL, x1: 110 };
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 110, y: 0 }, BOX, [wall])).toEqual({ x: 110, y: 0 });
  });

  it('null when the whole leg is covered, end included', () => {
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 80, y: 0 }, BOX, [WALL])).toBeNull();
  });

  it('a zero-length leg: `from` when clear, null when covered', () => {
    expect(findLayerSwitchPoint({ x: 300, y: 0 }, { x: 300, y: 0 }, BOX, [WALL])).toEqual({ x: 300, y: 0 });
    expect(findLayerSwitchPoint({ x: 30, y: 0 }, { x: 30, y: 0 }, BOX, [WALL])).toBeNull();
  });

  it('samples a diagonal leg every 20 units along its length', () => {
    // A 3-4-5 leg: each step is (12, 16). The box clears WALL (y1 = 50) once y ≥ 50: samples at
    // y = 0, 16, 32, 48, 64 — so the fifth, (48, 64).
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 300, y: 400 }, BOX, [WALL])).toEqual({ x: 48, y: 64 });
  });

  it('a point clear of one silhouette but inside another is not clear', () => {
    const second: Box = { x0: 100, y0: -50, x1: 160, y1: 50 };
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 400, y: 0 }, BOX, [WALL, second])).toEqual({ x: 160, y: 0 });
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 400, y: 0 }, BOX, [second, WALL])).toEqual({ x: 160, y: 0 });
  });

  it('places the robot box relative to the sampled position, offsets and all', () => {
    // A box hanging 40 left of its position: at x = 40 it spans 0–10 (inside the wall); clear once
    // position.x − 40 ≥ 100, i.e. x = 140. Samples from 40 are 40, 60, …, 140.
    const box: Box = { x0: -40, y0: 0, x1: -30, y1: 10 };
    expect(findLayerSwitchPoint({ x: 40, y: 0 }, { x: 400, y: 0 }, box, [WALL])).toEqual({ x: 140, y: 0 });
  });

  it('a leg running backwards samples from `from` towards `to`', () => {
    // Leaving the wall to the left: clear once position.x + 10 ≤ 0, i.e. x = −10; samples from 90
    // are 90, 70, …, −10.
    expect(findLayerSwitchPoint({ x: 90, y: 0 }, { x: -300, y: 0 }, BOX, [WALL])).toEqual({ x: -10, y: 0 });
  });
});

describe('robotBoxAt (Phase 43 Task 32)', () => {
  const gem = getRobotGem(20261004);
  const w = gemWidth(gem);

  it('at body scale 1 is the gem canvas at the robot position', () => {
    expect(robotBoxAt(gem, 1)).toEqual({ x0: 0, y0: 0, x1: w, y1: GEM_CANVAS_H });
  });

  it('scales about the canvas centre, like g.gem', () => {
    const box = robotBoxAt(gem, 2);
    expect(box.x0).toBeCloseTo(-w / 2, 9);
    expect(box.y0).toBeCloseTo(-GEM_CANVAS_H / 2, 9);
    expect(box.x1).toBeCloseTo(w * 1.5, 9);
    expect(box.y1).toBeCloseTo(GEM_CANVAS_H * 1.5, 9);
  });

  it('a body scale under 1 shrinks it about the same centre', () => {
    const box = robotBoxAt(gem, 0.5);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(w / 2, 9);
    expect((box.y0 + box.y1) / 2).toBeCloseTo(GEM_CANVAS_H / 2, 9);
    expect(box.x1 - box.x0).toBeCloseTo(w / 2, 9);
  });
});
