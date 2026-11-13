// ========================================
// noteRows (docs/specs/ROBOT_NOTE_CLOUD.md §1.3; plan Tasks 7–9)
// ========================================
import { describe, expect, it } from 'vitest';

import { GEM_CANVAS_H, gemWidth, getRobotGem, type GemPart, type RobotGem } from '../gem/polygon';
import { noteLength, noteThickness, rollBox } from './noteRows';

/** A part with only the box the roll reads. */
const part = (x: number, y: number, w: number, h: number): GemPart => ({ x, y, w, h, pts: [], inner: [], lines: [], lights: [] });

/**
 * A hand-made gem on the 80 × 80 canvas (centre 40, 40), its parts lopsided on purpose: they reach 30 units left of
 * the centre and 25 right of it, 20 above and 35 below. The roll's box is centred on the canvas centre, so it takes
 * the larger reach each way: 30 across and 35 down, a box 60 × 70 before the roll's 2.5.
 */
const LOPSIDED: RobotGem = {
  widthFactor: 1,
  backing: part(10, 20, 50, 40), // x 10–60, y 20–60
  midLeft: part(15, 30, 25, 30), // x 15–40, y 30–60
  midRight: part(40, 30, 25, 45), // x 40–65, y 30–75
  top: part(20, 25, 40, 20),
  orbiters: [part(12, 22, 6, 4), part(55, 22, 6, 4), part(12, 50, 6, 4), part(55, 50, 6, 4)],
};

describe('noteRows: the roll’s box (§1.3)', () => {
  it('is centred on the canvas centre and is 2.5 times the box the parts fill', () => {
    expect(rollBox(LOPSIDED, 1)).toEqual({ x: 40 - 75, y: 40 - 87.5, w: 150, h: 175 });
  });

  it('a body scale of 1.69 grows it by 1.69 about the same centre', () => {
    const box = rollBox(LOPSIDED, 1.69);
    expect(box.w).toBeCloseTo(150 * 1.69, 10);
    expect(box.h).toBeCloseTo(175 * 1.69, 10);
    expect(box.x + box.w / 2).toBeCloseTo(40, 10);
    expect(box.y + box.h / 2).toBeCloseTo(40, 10);
  });

  it.each([11, 4242, 90210])('on seeded gem %i: every part lies inside the box ÷ 2.5, and the box is no larger', (seed) => {
    const gem = getRobotGem(seed);
    const cx = gemWidth(gem) / 2;
    const cy = GEM_CANVAS_H / 2;
    const box = rollBox(gem, 1);
    expect(box.x + box.w / 2).toBeCloseTo(cx, 10);
    expect(box.y + box.h / 2).toBeCloseTo(cy, 10);
    const halfW = box.w / 2 / 2.5;
    const halfH = box.h / 2 / 2.5;
    const parts = [gem.backing, gem.midLeft, gem.midRight, gem.top, ...gem.orbiters];
    let reachX = 0;
    let reachY = 0;
    for (const p of parts) {
      for (const x of [p.x, p.x + p.w]) {
        expect(Math.abs(x - cx)).toBeLessThanOrEqual(halfW + 1e-9);
        reachX = Math.max(reachX, Math.abs(x - cx));
      }
      for (const y of [p.y, p.y + p.h]) {
        expect(Math.abs(y - cy)).toBeLessThanOrEqual(halfH + 1e-9);
        reachY = Math.max(reachY, Math.abs(y - cy));
      }
    }
    // tight: some part touches the box's edge each way
    expect(reachX).toBeCloseTo(halfW, 10);
    expect(reachY).toBeCloseTo(halfH, 10);
  });
});

describe('noteRows: a bar’s thickness (§1.3)', () => {
  it('is a fourteenth of the roll’s height at 1 pixel per unit', () => {
    expect(noteThickness(140, 1)).toBeCloseTo(10, 10);
  });

  it('never draws under 4 pixels on screen: 16 units at 0.25 pixels per unit', () => {
    expect(noteThickness(140, 0.25)).toBeCloseTo(16, 10);
  });

  it('the floor gives way to the share once the share is thicker', () => {
    // at 0.5 px/unit the floor is 8 units, under the share's 10
    expect(noteThickness(140, 0.5)).toBeCloseTo(10, 10);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('a scale not yet known (%s) leaves the share alone', (pxPerUnit) => {
    expect(noteThickness(140, pxPerUnit)).toBeCloseTo(10, 10);
  });
});

describe('noteRows: a bar’s length (§1.3)', () => {
  it('a 0.5 s note is a tenth of the roll’s width (a note crosses in 5 s)', () => {
    expect(noteLength(0.5, 200, 4)).toBeCloseTo(20, 10);
  });

  it('a very short note is as long as it is thick', () => {
    expect(noteLength(0.01, 200, 9)).toBe(9);
    expect(noteLength(0, 200, 9)).toBe(9);
  });

  it('a 10 s note is 0.8 of the width', () => {
    expect(noteLength(10, 200, 4)).toBeCloseTo(160, 10);
  });
});
