// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { dissolveRunLength, findLayerSwitchPoint, robotBoxAt } from './layerSwitch';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../components/robot/gem/polygon';
import { LAYER_DISSOLVE_SECONDS, LAYER_SWITCH_STEP, SWIM_SPEED } from '../constants';
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

describe('dissolveRunLength (Phase 43 Task 32b, spec §1.10)', () => {
  /** How far a sine.inOut swim from rest covers `remaining` in `secs` at SWIM_SPEED — independently. */
  const swum = (remaining: number, secs: number) => {
    const duration = remaining / SWIM_SPEED;
    const u = Math.min(1, secs / duration);
    return (remaining * (1 - Math.cos(Math.PI * u))) / 2;
  };

  it('the dissolve lasts one second', () => {
    expect(LAYER_DISSOLVE_SECONDS).toBe(1);
  });

  it('a long leg: the run is what the swim covers in the dissolve — less than SWIM_SPEED × 1 s, since it starts from rest', () => {
    expect(dissolveRunLength(1000)).toBeCloseTo(swum(1000, LAYER_DISSOLVE_SECONDS), 9);
    expect(dissolveRunLength(1000)).toBeGreaterThan(0);
    expect(dissolveRunLength(1000)).toBeLessThan(SWIM_SPEED * LAYER_DISSOLVE_SECONDS);
  });

  it('a leg the swim finishes within the dissolve: the whole of it', () => {
    expect(dissolveRunLength(100)).toBeCloseTo(100, 9);
    expect(dissolveRunLength(SWIM_SPEED * LAYER_DISSOLVE_SECONDS)).toBeCloseTo(SWIM_SPEED * LAYER_DISSOLVE_SECONDS, 9);
  });

  it('nothing left: no run', () => {
    expect(dissolveRunLength(0)).toBe(0);
  });

  it('never more than what is left, over a sweep of lengths', () => {
    for (let l = 1; l <= 3000; l += 7) {
      expect(dissolveRunLength(l)).toBeLessThanOrEqual(l + 1e-9);
      expect(dissolveRunLength(l)).toBeCloseTo(swum(l, LAYER_DISSOLVE_SECONDS), 9);
    }
  });
});

describe('findLayerSwitchPoint — the switch point starts a clear run (Phase 43 Task 32b)', () => {
  /** A 30 × 30 robot box: wider than the 20-unit step, as every real robot is, so the samples
   *  sweep the run without gaps. */
  const BIG: Box = { x0: 0, y0: 0, x1: 30, y1: 30 };

  it('a point clear itself but with a silhouette inside its run is not chosen; the first whose run is clear is', () => {
    // Clear of WALL from x = 100. A post at 160–165 sits in 100's run (≈ 38.9 long: boxes to x ≈ 168.9)
    // and in 120's (≈ 39.8: to ≈ 189.8); 140 and 160 overlap it outright; 180 is past it.
    const post: Box = { x0: 160, y0: -50, x1: 165, y1: 50 };
    expect(100 + dissolveRunLength(900) + BIG.x1).toBeGreaterThan(post.x0); // 100's run reaches the post
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 1000, y: 0 }, BIG, [WALL])).toEqual({ x: 100, y: 0 }); // without it
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 1000, y: 0 }, BIG, [WALL, post])).toEqual({ x: 180, y: 0 });
  });

  it('a silhouette just past the run does not count', () => {
    const post: Box = { x0: 100 + dissolveRunLength(900) + BIG.x1 + 1, y0: -50, x1: 400, y1: 50 };
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 1000, y: 0 }, BIG, [WALL, post])).toEqual({ x: 100, y: 0 });
  });

  it('a run reaching the leg end checks only to the end — a silhouette beyond it does not count', () => {
    // From 100 only 50 is left, less than a dissolve's swim: the run is the rest of the leg, boxes to x = 180.
    const beyond: Box = { x0: 185, y0: -50, x1: 190, y1: 50 };
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 150, y: 0 }, BIG, [WALL, beyond])).toEqual({ x: 100, y: 0 });
  });

  it('the run is what is left of the leg from the candidate, not the whole leg', () => {
    // Clear of a long wall only from x = 900, 100 short of the end: that swim takes under a second, so
    // the run is all of it, to x = 1000 (boxes to 1030) — into the post. (Measured on the whole
    // 1000-unit leg it would be ≈ 35 long and miss the post.)
    const longWall: Box = { x0: 0, y0: -50, x1: 900, y1: 50 };
    const post: Box = { x0: 1010, y0: -50, x1: 1015, y1: 50 };
    expect(900 + dissolveRunLength(1000) + BIG.x1).toBeLessThan(post.x0);
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 1000, y: 0 }, BIG, [longWall, post])).toBeNull();
  });

  it('the run is checked every LAYER_SWITCH_STEP — a thin silhouette inside it cannot slip between checks', () => {
    // A 120 leg is all run from `from`. A 5-wide post at 40–45 lies between boxes placed 60 apart
    // (0–30, 60–90, 120–150) but not between boxes 20 apart (20–50 hits it). 0, 20 and 40 are out;
    // from 60 the run (60 → 120) is past the post.
    const post: Box = { x0: 40, y0: -50, x1: 45, y1: 50 };
    expect(findLayerSwitchPoint({ x: 0, y: 0 }, { x: 120, y: 0 }, BIG, [post])).toEqual({ x: 60, y: 0 });
  });

  it('a silhouette over the leg end leaves no switch point at all — every run ends there', () => {
    const atEnd: Box = { x0: 575, y0: -50, x1: 580, y1: 50 };
    expect(findLayerSwitchPoint({ x: 500, y: 0 }, { x: 560, y: 0 }, BIG, [atEnd])).toBeNull();
  });

  it('a short leg clear end to end returns `from`', () => {
    expect(findLayerSwitchPoint({ x: 500, y: 0 }, { x: 560, y: 0 }, BIG, [WALL])).toEqual({ x: 500, y: 0 });
  });

  it('the run follows the leg: on a diagonal it is checked along the diagonal', () => {
    // A 3-4-5 leg from (200, 0): its run from `from` ends ≈ dissolveRunLength(1000) along it. A post off
    // to the side of the straight-ahead x-axis run but on the diagonal blocks it.
    const r = dissolveRunLength(1000);
    const onDiagonal = { x: 200 + 0.6 * r, y: 0.8 * r };
    const post: Box = { x0: onDiagonal.x + 25, y0: onDiagonal.y + 25, x1: onDiagonal.x + 28, y1: onDiagonal.y + 28 };
    expect(findLayerSwitchPoint({ x: 200, y: 0 }, { x: 800, y: 800 }, BIG, [post])).not.toEqual({ x: 200, y: 0 });
    expect(findLayerSwitchPoint({ x: 200, y: 0 }, { x: 1000, y: 0 }, BIG, [post])).toEqual({ x: 200, y: 0 });
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
