// ========================================
// noteRows (docs/specs/ROBOT_NOTE_CLOUD.md §1.3; plan Tasks 7–9)
// ========================================
import { describe, expect, it } from 'vitest';

import { GEM_CANVAS_H, gemWidth, getRobotGem, type GemPart, type RobotGem } from '../gem/polygon';
import { noteColor, noteLength, noteMask, noteRowGeometry, noteThickness, rollBox } from './noteRows';

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

describe('noteRows: rows that run in flat and fan on the way out (§1.3, Gate 4)', () => {
  // A roll 200 wide and 140 high with 10-unit bars: the rows spread over 130 in the middle.
  const BOX = { x: 0, y: 0, w: 200, h: 140 };
  const THICK = 10;
  const TRAVEL = BOX.h - THICK;
  const WAVE = 0.015 * BOX.h; // the wave's amplitude in the middle
  const rows = noteRowGeometry(BOX, THICK);
  /** Where a row's bar sits with no fan and no wave: the pitch height, in the layer's units. */
  const pitchY = (row: number) => rows.pad + TRAVEL / 2 - row * TRAVEL;
  const spread = (across: number) => rows.y(-0.5, across) - rows.y(0.5, across);
  /** The row's slope at `across` as an angle in degrees, measured from the curve by a small step either side. */
  const slopeDegrees = (row: number, across: number) => {
    const step = 1e-5;
    const lo = Math.max(0, across - step);
    const hi = Math.min(1, across + step);
    const slope = (rows.y(row, hi) - rows.y(row, lo)) / ((hi - lo) * BOX.w);
    return (Math.atan(slope) * 180) / Math.PI;
  };
  const ROWS = [-0.5, -0.3, -0.25, 0, 0.1, 0.25, 0.5];

  it('at the centre a row is within the wave’s amplitude of its pitch height, and the top row is above the bottom', () => {
    for (const row of ROWS) expect(Math.abs(rows.y(row, 0.5) - pitchY(row))).toBeLessThanOrEqual(WAVE + 1e-9);
    expect(rows.y(0.5, 0.5)).toBeLessThan(rows.y(-0.5, 0.5));
  });

  it('through the straight middle the rows hold their spread', () => {
    for (const across of [0.23, 0.35, 0.5, 0.65, 0.77]) expect(spread(across)).toBeCloseTo(TRAVEL, 10);
  });

  it('at the left edge, where a note leaves, the top and bottom rows are 1.6 times as far apart as at the centre', () => {
    expect(spread(0)).toBeCloseTo(1.6 * TRAVEL, 10);
  });

  it('a place beyond the left edge fans no further than the edge', () => {
    expect(spread(-0.3)).toBeCloseTo(1.6 * TRAVEL, 10);
  });

  it('the right half, where a note enters, does not fan: the rows hold their spread to the edge and beyond', () => {
    for (let i = 0; i <= 80; i++) expect(spread(0.5 + i / 100)).toBeCloseTo(TRAVEL, 10);
  });

  it('on the right half every row stays within the middle’s wave of its pitch height', () => {
    for (const row of ROWS) {
      for (let i = 0; i <= 60; i++) {
        const across = 0.5 + i / 100;
        expect(Math.abs(rows.y(row, across) - pitchY(row))).toBeLessThanOrEqual(WAVE + 1e-9);
      }
    }
  });

  it('the wave grows to five times its middle amplitude at the left edge, 1.5 waves across', () => {
    // The quarter row's wave is at its crest at the left edge (sin(2π · (1.5 · 0 + 0.25)) = 1): it sits at its
    // fanned height (spread 1.6) plus five times the middle's wave.
    expect(rows.y(0.25, 0)).toBeCloseTo(rows.pad + TRAVEL / 2 - 0.25 * 1.6 * TRAVEL + 5 * WAVE, 10);
    // The middle row is not fanned, so it moves only by its wave: never more than five times the middle's.
    for (let i = 0; i <= 200; i++) {
      expect(Math.abs(rows.y(0, i / 200) - pitchY(0))).toBeLessThanOrEqual(5 * WAVE + 1e-9);
    }
  });

  it('every bar stays inside the layer: the pad is room enough for the fan and the wave', () => {
    for (const row of ROWS) {
      for (let i = 0; i <= 100; i++) {
        const y = rows.y(row, i / 100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y + THICK).toBeLessThanOrEqual(BOX.h + 2 * rows.pad);
      }
    }
  });

  it('a bar is level through the straight middle', () => {
    for (const row of ROWS) {
      for (const across of [0.23, 0.3, 0.5, 0.7, 0.77]) expect(Math.abs(rows.tilt(row, across))).toBeLessThan(1);
    }
  });

  it('past the fan’s start on the left a bar tilts the way its row slopes, all the way to the slope at the edge', () => {
    for (const row of ROWS) {
      for (const across of [0.05, 0.12]) {
        const slope = slopeDegrees(row, across);
        if (Math.abs(slope) > 0.5) expect(Math.sign(rows.tilt(row, across))).toBe(Math.sign(slope));
      }
      expect(rows.tilt(row, 0)).toBeCloseTo(slopeDegrees(row, 0), 1);
    }
    // the fan opens the top row upward on the left (rising toward the centre: y grows left to right)
    expect(rows.tilt(0.5, 0.02)).toBeGreaterThan(5);
  });

  it('a bar is level across the whole right half, to the edge and beyond', () => {
    for (const row of ROWS) {
      for (let i = 0; i <= 70; i++) expect(rows.tilt(row, 0.5 + i / 100)).toBe(0);
    }
  });

  it('a bar thicker than the roll puts every row at one height', () => {
    const flat = noteRowGeometry(BOX, 200);
    for (const across of [0, 0.1, 0.5, 1]) expect(flat.y(-0.5, across) - flat.y(0.5, across)).toBeCloseTo(0, 10);
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

describe('noteRows: a note’s colour (§1.3)', () => {
  it('a robot in a company wears the company’s colour as it is', () => {
    expect(noteColor('#ff8000', '#3a7bd5')).toBe('#3a7bd5');
  });

  it('a freelancer at hue 30 gets hue 210, S 100, L 70', () => {
    expect(noteColor('#ff8000', undefined)).toBe('hsl(210, 100%, 70%)'); // #ff8000 is hue 30.1
  });

  it('hue 300 wraps round to 120', () => {
    expect(noteColor('#ff00ff', undefined)).toBe('hsl(120, 100%, 70%)');
  });

  it('an empty company colour counts as none', () => {
    expect(noteColor('#ff00ff', '')).toBe('hsl(120, 100%, 70%)');
  });
});

/** The mask's stops, read from what noteMask returns: each colour and where it sits, in percent. */
function maskStops(mask: string): Array<{ color: string; at: number }> {
  const match = /^linear-gradient\(to right, (.*)\)$/.exec(mask);
  expect(match).not.toBeNull();
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of match![1]) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts.map((part) => {
    const split = part.lastIndexOf(' ');
    const at = /^(-?[\d.]+)%$/.exec(part.slice(split + 1));
    expect(at).not.toBeNull();
    return { color: part.slice(0, split), at: Number(at![1]) };
  });
}

describe('noteRows: the layer’s mask (§1.4)', () => {
  it('clear at the left edge, full from 30% to “now”, clear 0.2 s ahead', () => {
    const stops = maskStops(noteMask(0.2));
    expect(stops.map((s) => s.color)).toEqual(['transparent', '#000', '#000', 'transparent']);
    const at = stops.map((s) => s.at);
    [0, 30, 77.5, 81.5].forEach((expected, i) => expect(at[i]).toBeCloseTo(expected, 6));
  });

  it('a note known 2 s ahead ends the mask at the right edge, not past it', () => {
    expect(maskStops(noteMask(2)).at(-1)!.at).toBe(100);
  });

  it('a note known no time ahead turns clear at “now”', () => {
    expect(maskStops(noteMask(0)).at(-1)!.at).toBeCloseTo(77.5, 6);
    expect(maskStops(noteMask(-1)).at(-1)!.at).toBeCloseTo(77.5, 6);
  });
});
