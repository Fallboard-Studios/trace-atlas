// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  rippleCycles,
  ripplePosition,
  rippleEnvelope,
  rippleStops,
  RIPPLE_PERIOD,
  RIPPLE_WIDTH,
  RIPPLE_OPACITY,
  RIPPLE_DESPAWN_FROM,
  RIPPLE_EDGE,
} from './haloRipple';

// ========================================
// FIXTURES
// ========================================
/** Hole offset at radius 20 (HALO_HOLE 10 / 20). */
const HOLE = 0.5;

// ========================================
// TESTS — rippleCycles (spec §1.3: max(1, round(arcDuration / RIPPLE_PERIOD)))
// ========================================
describe('rippleCycles — whole rings per arc so the last ring lands with the orbiter', () => {
  it.each([
    [2, 1],
    [3, 1],
    [3.75, 2],
    [4, 2],
    [5, 2],
    [7.5, 3],
  ])('arc %d s → %d cycle(s)', (arcDuration, cycles) => {
    expect(rippleCycles(arcDuration)).toBe(cycles);
  });

  it('never fewer than one cycle, even for a zero or tiny arc', () => {
    expect(rippleCycles(0)).toBe(1);
    expect(rippleCycles(0.2)).toBe(1);
  });

  it('rippleCycles(3) is 1 because the period is 2.5 (mutation: RIPPLE_PERIOD → 2 gives 2)', () => {
    expect(RIPPLE_PERIOD).toBe(2.5);
    expect(rippleCycles(3)).toBe(1);
  });
});

// ========================================
// TESTS — ripplePosition (spec §1.3)
// ========================================
describe('ripplePosition — spawn runs hole → 1 per cycle and restarts', () => {
  it('u 0 → the hole edge', () => {
    expect(ripplePosition('spawn', 0, 2, HOLE)).toBeCloseTo(HOLE, 10);
  });

  it('u 0.25 with 2 cycles → midway between hole and 1', () => {
    expect(ripplePosition('spawn', 0.25, 2, HOLE)).toBeCloseTo((HOLE + 1) / 2, 10);
  });

  it('u 0.5 with 2 cycles → back at the hole (second ring starts)', () => {
    expect(ripplePosition('spawn', 0.5, 2, HOLE)).toBeCloseTo(HOLE, 10);
  });

  it('u → 1 approaches the outer edge, 1', () => {
    expect(ripplePosition('spawn', 0.999, 2, HOLE)).toBeCloseTo(1, 2);
    expect(ripplePosition('spawn', 0.999, 1, HOLE)).toBeCloseTo(1, 2);
  });

  it('one cycle: u 0.5 → midway (no restart)', () => {
    expect(ripplePosition('spawn', 0.5, 1, HOLE)).toBeCloseTo((HOLE + 1) / 2, 10);
  });

  it('the hole offset is honoured — a bigger halo (smaller hole offset) starts further in', () => {
    expect(ripplePosition('spawn', 0, 1, 0.25)).toBeCloseTo(0.25, 10);
  });
});

describe('ripplePosition — despawn runs RIPPLE_DESPAWN_FROM → hole per cycle', () => {
  it('u 0 → 0.95', () => {
    expect(ripplePosition('despawn', 0, 2, HOLE)).toBeCloseTo(0.95, 10);
  });

  it('u → 0.5 with 2 cycles approaches the hole', () => {
    expect(ripplePosition('despawn', 0.4999, 2, HOLE)).toBeCloseTo(HOLE, 2);
  });

  it('u 0.5 with 2 cycles → restarts at 0.95', () => {
    expect(ripplePosition('despawn', 0.5, 2, HOLE)).toBeCloseTo(0.95, 10);
  });

  it('u 0.25 with 2 cycles → midway between 0.95 and the hole', () => {
    expect(ripplePosition('despawn', 0.25, 2, HOLE)).toBeCloseTo((0.95 + HOLE) / 2, 10);
  });
});

// ========================================
// TESTS — rippleEnvelope (spec §1.3: min(1, u / RIPPLE_EDGE, (1 − u) / RIPPLE_EDGE))
// ========================================
describe('rippleEnvelope — fades in over the first 10 % and out over the last 10 %', () => {
  it('0 at u 0 and u 1', () => {
    expect(rippleEnvelope(0)).toBe(0);
    expect(rippleEnvelope(1)).toBe(0);
  });

  it('1 at u 0.5 and across the whole middle', () => {
    expect(rippleEnvelope(0.5)).toBe(1);
    expect(rippleEnvelope(0.1)).toBeCloseTo(1, 10);
    expect(rippleEnvelope(0.9)).toBeCloseTo(1, 10);
  });

  it('0.5 at u 0.05 and at u 0.95', () => {
    expect(rippleEnvelope(0.05)).toBeCloseTo(0.5, 10);
    expect(rippleEnvelope(0.95)).toBeCloseTo(0.5, 10);
  });

  it('never negative outside the arc (u < 0 or u > 1)', () => {
    expect(rippleEnvelope(-0.1)).toBe(0);
    expect(rippleEnvelope(1.1)).toBe(0);
  });
});

// ========================================
// TESTS — rippleStops (spec §1.3: five stops 0, lo, position, hi, 1)
// ========================================
describe('rippleStops — a narrow bright ring inside [hole, 1]', () => {
  it('five stops: 0, lo, position, hi, 1 with the ring at RIPPLE_OPACITY × envelope', () => {
    const stops = rippleStops(0.7, HOLE, 1);
    expect(stops).toHaveLength(5);
    expect(stops[0]).toEqual({ offset: 0, opacity: 0 });
    expect(stops[1]).toEqual({ offset: 0.7 - RIPPLE_WIDTH, opacity: 0 });
    expect(stops[2]).toEqual({ offset: 0.7, opacity: RIPPLE_OPACITY });
    expect(stops[3]).toEqual({ offset: 0.7 + RIPPLE_WIDTH, opacity: 0 });
    expect(stops[4]).toEqual({ offset: 1, opacity: 0 });
  });

  it('ring opacity scales with the envelope: 0.9 × 0.5 = 0.45; envelope 0 → invisible', () => {
    expect(rippleStops(0.7, HOLE, 0.5)[2].opacity).toBeCloseTo(0.45, 10);
    expect(rippleStops(0.7, HOLE, 0)[2].opacity).toBe(0);
  });

  it('lo is clamped to the hole when the ring sits at the hole edge', () => {
    const stops = rippleStops(HOLE, HOLE, 1);
    expect(stops[1].offset).toBe(HOLE);
    expect(stops[2].offset).toBe(HOLE);
  });

  it('hi is clamped to 1 when the ring sits at the outer edge', () => {
    const stops = rippleStops(1, HOLE, 1);
    expect(stops[3].offset).toBe(1);
    expect(stops[4].offset).toBe(1);
  });

  it('offsets are non-decreasing for every position across the span', () => {
    for (let pos = HOLE; pos <= 1.0001; pos += 0.05) {
      const o = rippleStops(Math.min(1, pos), HOLE, 1).map((s) => s.offset);
      for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThanOrEqual(o[i - 1]);
    }
  });
});

describe('haloRipple — constants match the intent table / sketch defaults', () => {
  it('period 2.5, width 0.08, opacity 0.9, despawn from 0.95, edge 0.1', () => {
    expect(RIPPLE_PERIOD).toBe(2.5);
    expect(RIPPLE_WIDTH).toBe(0.08);
    expect(RIPPLE_OPACITY).toBe(0.9);
    expect(RIPPLE_DESPAWN_FROM).toBe(0.95);
    expect(RIPPLE_EDGE).toBe(0.1);
  });
});
