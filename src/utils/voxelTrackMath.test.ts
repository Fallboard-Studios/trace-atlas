import { describe, it, expect } from 'vitest';

import {
  VOXEL_TRACK_MIN_BOX_COUNT,
  VOXEL_TRACK_MIN_BOX_COUNT_EVEN,
  VOXEL_STRADDLE_MIN_SIZE_FRACTION,
  computeFittedBoxCount,
  computeEvenBoxCount,
  computeVoxelTrackLength,
  computeVoxelBoxStates,
  computeVoxelBoxStatesCenteredZero,
  computeVoxelBoxPopDistance,
  computeVoxelBoxZIndex,
  computeVoxelTrackTrailingReserve,
  computeVoxelFillBackground,
  computeVoxelStraddleSizeFraction,
  computeVoxelPopStaggerDelays,
  VOXEL_POP_STAGGER_SECONDS,
} from './voxelTrackMath';
import { VOXEL_TRACK_POP_DISTANCE, VOXEL_TRACK_POP_DISTANCE_MIN_RATIO } from './cabinetGeometry';

describe('VOXEL_TRACK_MIN_BOX_COUNT', () => {
  it('is 3', () => {
    expect(VOXEL_TRACK_MIN_BOX_COUNT).toBe(3);
  });
});

describe('computeFittedBoxCount', () => {
  it('fits exactly N boxes when the available length is exactly N*(boxSize+gap) - gap', () => {
    // 5 boxes of 40px with 4 gaps of 10px: 5*40 + 4*10 = 240px, exactly.
    expect(computeFittedBoxCount(240, 40, 10)).toBe(5);
  });

  it('floors to N-1 boxes when short by exactly one gap of the space the Nth box would need', () => {
    // 230px is 10px (one gap) short of the 240px 5 boxes need; 4 boxes need
    // only 190px, so 4 is still the largest count that fits.
    expect(computeFittedBoxCount(230, 40, 10)).toBe(4);
  });

  it('fits a generous number of boxes without overflowing', () => {
    // 20 boxes need 20*40 + 19*10 = 990px (fits in 1000); 21 would need 1040px (doesn't).
    expect(computeFittedBoxCount(1000, 40, 10)).toBe(20);
  });

  it('returns the 3-box minimum when boxSize is zero', () => {
    expect(computeFittedBoxCount(1000, 0, 10)).toBe(VOXEL_TRACK_MIN_BOX_COUNT);
  });

  it('returns the 3-box minimum when boxSize is negative', () => {
    expect(computeFittedBoxCount(1000, -5, 10)).toBe(VOXEL_TRACK_MIN_BOX_COUNT);
  });

  it('clamps to the 3-box minimum, never fewer, when the space is too small even for 3 boxes', () => {
    // 3 boxes of 48px with 2 gaps of 12px need 168px; 10px isn't remotely enough.
    expect(computeFittedBoxCount(10, 48, 12)).toBe(VOXEL_TRACK_MIN_BOX_COUNT);
  });

  it('clamps to the 3-box minimum for zero available length', () => {
    expect(computeFittedBoxCount(0, 48, 12)).toBe(VOXEL_TRACK_MIN_BOX_COUNT);
  });
});

describe('computeVoxelTrackLength', () => {
  it('never overflows the available length the fitted count was computed against', () => {
    const boxSize = 40;
    const gap = 10;
    const availableLength = 1000;
    const fitted = computeFittedBoxCount(availableLength, boxSize, gap);
    expect(computeVoxelTrackLength(fitted, boxSize, gap)).toBeLessThanOrEqual(availableLength);
  });

  it('never overflows for a second representative (boxSize, gap) pair', () => {
    const boxSize = 48;
    const gap = 12;
    const availableLength = 777;
    const fitted = computeFittedBoxCount(availableLength, boxSize, gap);
    expect(computeVoxelTrackLength(fitted, boxSize, gap)).toBeLessThanOrEqual(availableLength);
  });

  it('equals exactly boxSize at boxCount 1 — no gap term with only one box', () => {
    expect(computeVoxelTrackLength(1, 48, 12)).toBe(48);
  });

  it('sums N box sizes and N-1 gaps for a hand-derived case', () => {
    // 3 boxes of 32px with 2 gaps of 8px: 3*32 + 2*8 = 112px.
    expect(computeVoxelTrackLength(3, 32, 8)).toBe(112);
  });
});

describe('computeVoxelBoxStates', () => {
  it('at value === min: box 0 straddles at 0% fill, every other box is flat and empty', () => {
    const states = computeVoxelBoxStates(0, 0, 100, 5);
    expect(states).toEqual([
      { fillPercent: 0, popT: 1, isStraddling: true },
      { fillPercent: 0, popT: 0, isStraddling: false },
      { fillPercent: 0, popT: 0, isStraddling: false },
      { fillPercent: 0, popT: 0, isStraddling: false },
      { fillPercent: 0, popT: 0, isStraddling: false },
    ]);
  });

  it('at value === max: the last box straddles fully popped, every prior filled box is also popT: 1, and no box reports 0% fill', () => {
    const states = computeVoxelBoxStates(100, 0, 100, 5);
    expect(states).toEqual([
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 100, popT: 1, isStraddling: true },
    ]);
    expect(states.every((s) => s.fillPercent > 0)).toBe(true);
  });

  it('hand-derives the exact per-box array for a mid-range value against a small box count', () => {
    // min=0, max=100, boxCount=4, value=62.5 → t=0.625, rawPosition=2.5,
    // straddlingIndex=2, localFraction=0.5 → box 2 straddles at 50% fill.
    const states = computeVoxelBoxStates(62.5, 0, 100, 4);
    expect(states).toEqual([
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 100, popT: 1, isStraddling: false },
      { fillPercent: 50, popT: 1, isStraddling: true },
      { fillPercent: 0, popT: 0, isStraddling: false },
    ]);
  });

  it('exactly one box is isStraddling: true, for a variety of representative values — popT alone can\'t distinguish the straddling box from an ordinary filled one (both are popT: 1), so this is asserted directly, not inferred', () => {
    for (const value of [0, 1, 25, 50, 62.5, 99, 100]) {
      const states = computeVoxelBoxStates(value, 0, 100, 7);
      const straddlingCount = states.filter((s) => s.isStraddling).length;
      expect(straddlingCount).toBe(1);
    }
  });

  it('does not throw and returns the t=0 shape when min === max', () => {
    expect(() => computeVoxelBoxStates(50, 50, 50, 4)).not.toThrow();
    const states = computeVoxelBoxStates(50, 50, 50, 4);
    expect(states).toEqual([
      { fillPercent: 0, popT: 1, isStraddling: true },
      { fillPercent: 0, popT: 0, isStraddling: false },
      { fillPercent: 0, popT: 0, isStraddling: false },
      { fillPercent: 0, popT: 0, isStraddling: false },
    ]);
  });

  it('clamps a value below min to the same t=0 shape as value === min', () => {
    expect(computeVoxelBoxStates(-50, 0, 100, 5)).toEqual(computeVoxelBoxStates(0, 0, 100, 5));
  });

  it('clamps a value above max to the same t=1 shape as value === max', () => {
    expect(computeVoxelBoxStates(150, 0, 100, 5)).toEqual(computeVoxelBoxStates(100, 0, 100, 5));
  });

  it('boxCount 1 always renders the single box as the fully-popped straddler', () => {
    expect(computeVoxelBoxStates(25, 0, 100, 1)).toEqual([{ fillPercent: 25, popT: 1, isStraddling: true }]);
  });
});

describe('computeVoxelBoxPopDistance', () => {
  it('at box 0 (nearest min), returns exactly VOXEL_TRACK_POP_DISTANCE_MIN_RATIO of the max distance', () => {
    expect(computeVoxelBoxPopDistance(0, 5)).toBe(VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO);
  });

  it('at the last box (nearest max), returns exactly the full VOXEL_TRACK_POP_DISTANCE', () => {
    expect(computeVoxelBoxPopDistance(4, 5)).toBe(VOXEL_TRACK_POP_DISTANCE);
  });

  it('interpolates linearly by row position for boxes in between — independent of the slider value', () => {
    // boxCount 5 → span 4; box 2 sits at positionFraction 0.5, exactly
    // halfway between the min-ratio floor and the full max distance.
    const min = VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO;
    const expected = min + (VOXEL_TRACK_POP_DISTANCE - min) * 0.5;
    expect(computeVoxelBoxPopDistance(2, 5)).toBe(expected);
  });

  it('never exceeds VOXEL_TRACK_POP_DISTANCE or drops below the min-ratio floor, across a representative sweep of box counts', () => {
    const min = VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO;
    for (const boxCount of [3, 4, 5, 8, 20]) {
      for (let i = 0; i < boxCount; i++) {
        const distance = computeVoxelBoxPopDistance(i, boxCount);
        expect(distance).toBeGreaterThanOrEqual(min);
        expect(distance).toBeLessThanOrEqual(VOXEL_TRACK_POP_DISTANCE);
      }
    }
  });

  it('does not throw for a single-box row (boxCount: 1) — the divide-by-zero guard; index 0 still reads as nearest-min, so it gets the floor distance, not the max', () => {
    expect(() => computeVoxelBoxPopDistance(0, 1)).not.toThrow();
    expect(computeVoxelBoxPopDistance(0, 1)).toBe(VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO);
  });
});

describe('computeVoxelBoxZIndex', () => {
  it('horizontal: descends as index rises — box 0 (leftmost) outranks every box to its right', () => {
    const zIndexes = [0, 1, 2, 3, 4].map((i) => computeVoxelBoxZIndex(i, 5, 'horizontal'));
    expect(zIndexes).toEqual([5, 4, 3, 2, 1]);
    for (let i = 1; i < zIndexes.length; i++) {
      expect(zIndexes[i]).toBeLessThan(zIndexes[i - 1]);
    }
  });

  it('vertical: ascends as index rises — the last box (topmost, per column-reverse) outranks every box below it', () => {
    const zIndexes = [0, 1, 2, 3, 4].map((i) => computeVoxelBoxZIndex(i, 5, 'vertical'));
    expect(zIndexes).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < zIndexes.length; i++) {
      expect(zIndexes[i]).toBeGreaterThan(zIndexes[i - 1]);
    }
  });

  it('never produces a tie between two different indexes of the same row, for either axis', () => {
    for (const axis of ['horizontal', 'vertical'] as const) {
      const zIndexes = Array.from({ length: 8 }, (_, i) => computeVoxelBoxZIndex(i, 8, axis));
      expect(new Set(zIndexes).size).toBe(zIndexes.length);
    }
  });
});

describe('computeVoxelTrackTrailingReserve', () => {
  it("horizontal: returns exactly 2 * VOXEL_TRACK_POP_DISTANCE — the last box's own full rightward bleed", () => {
    expect(computeVoxelTrackTrailingReserve('horizontal')).toBe(2 * VOXEL_TRACK_POP_DISTANCE);
  });

  it('vertical: returns 0 — the fixed 2:1 vector bleeds right and down regardless of axis, so a vertical track\'s last (topmost) box bleeds into the column, not past its own top edge', () => {
    expect(computeVoxelTrackTrailingReserve('vertical')).toBe(0);
  });
});

describe('computeVoxelFillBackground', () => {
  it('returns the 2-tone gradient token (not the solid accent token) at exactly 100%', () => {
    // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.2/§4, Task 6) — a fully-filled
    // box is one of the few flat-rectangle fills that can render the literal 2-tone gradient
    // rather than a single solid color.
    expect(computeVoxelFillBackground(100, 'horizontal')).toBe('var(--color-accent-gradient)');
  });

  it('returns the 2-tone gradient token above 100%', () => {
    expect(computeVoxelFillBackground(150, 'horizontal')).toBe('var(--color-accent-gradient)');
  });

  it('returns the solid surface token, no gradient syntax, at exactly 0%', () => {
    expect(computeVoxelFillBackground(0, 'horizontal')).toBe('var(--color-surface)');
  });

  it('returns the solid surface token below 0%', () => {
    expect(computeVoxelFillBackground(-10, 'horizontal')).toBe('var(--color-surface)');
  });

  it('renders a hard-stop gradient — both color stops at the same percentage boundary — for a mid-value fill', () => {
    expect(computeVoxelFillBackground(37, 'horizontal')).toBe(
      'linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) 37%, var(--color-surface) 37%, var(--color-surface) 100%)',
    );
  });

  it('splits toward the right for the horizontal axis', () => {
    expect(computeVoxelFillBackground(50, 'horizontal')).toContain('to right');
  });

  it('splits toward the top for the vertical axis', () => {
    expect(computeVoxelFillBackground(50, 'vertical')).toContain('to top');
  });
});

describe('VOXEL_STRADDLE_MIN_SIZE_FRACTION', () => {
  it('is a fraction strictly between 0 and 1', () => {
    expect(VOXEL_STRADDLE_MIN_SIZE_FRACTION).toBeGreaterThan(0);
    expect(VOXEL_STRADDLE_MIN_SIZE_FRACTION).toBeLessThan(1);
  });
});

describe('computeVoxelStraddleSizeFraction', () => {
  it('at fillPercent: 100, returns exactly 1 (full-size)', () => {
    expect(computeVoxelStraddleSizeFraction(100)).toBe(1);
  });

  it('at fillPercent: 50, returns exactly 0.5 — no floor engaged', () => {
    expect(computeVoxelStraddleSizeFraction(50)).toBe(0.5);
  });

  it('at fillPercent: 0 (value === min), floors to VOXEL_STRADDLE_MIN_SIZE_FRACTION rather than 0 — the straddling box must never fully disappear', () => {
    expect(computeVoxelStraddleSizeFraction(0)).toBe(VOXEL_STRADDLE_MIN_SIZE_FRACTION);
  });

  it('at a fillPercent whose raw fraction is below the floor (e.g. 5%, i.e. 0.05), clamps up to the floor rather than returning the raw fraction', () => {
    const raw = 5 / 100;
    expect(raw).toBeLessThan(VOXEL_STRADDLE_MIN_SIZE_FRACTION); // sanity-check the test's own premise
    expect(computeVoxelStraddleSizeFraction(5)).toBe(VOXEL_STRADDLE_MIN_SIZE_FRACTION);
  });

  it('at a fillPercent whose raw fraction is comfortably above the floor, returns the raw fraction unclamped', () => {
    expect(computeVoxelStraddleSizeFraction(80)).toBe(0.8);
  });
});

describe('VOXEL_TRACK_MIN_BOX_COUNT_EVEN', () => {
  it('is 4', () => {
    expect(VOXEL_TRACK_MIN_BOX_COUNT_EVEN).toBe(4);
  });
});

describe('computeEvenBoxCount', () => {
  it('rounds an odd count down to the nearest even number', () => {
    expect(computeEvenBoxCount(7)).toBe(6);
  });

  it('leaves an already-even count unchanged', () => {
    expect(computeEvenBoxCount(6)).toBe(6);
  });

  it('floors at VOXEL_TRACK_MIN_BOX_COUNT_EVEN (4), not VOXEL_TRACK_MIN_BOX_COUNT (3) — an odd input of 3 produces 4, not 2', () => {
    expect(computeEvenBoxCount(3)).toBe(VOXEL_TRACK_MIN_BOX_COUNT_EVEN);
  });

  it('floors non-positive input at VOXEL_TRACK_MIN_BOX_COUNT_EVEN', () => {
    expect(computeEvenBoxCount(0)).toBe(VOXEL_TRACK_MIN_BOX_COUNT_EVEN);
  });
});

describe('computeVoxelBoxStatesCenteredZero', () => {
  it('at value === 0, every box on both sides is flat — no straddling box, no marker (symmetric bounds)', () => {
    const states = computeVoxelBoxStatesCenteredZero(0, -50, 50, 4);
    expect(states).toEqual([
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 1, popDistanceLocalCount: 2, flipStraddleFill: true },
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 0, popDistanceLocalCount: 2, flipStraddleFill: true },
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 0, popDistanceLocalCount: 2, flipStraddleFill: false },
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 1, popDistanceLocalCount: 2, flipStraddleFill: false },
    ]);
  });

  it('at value === 0, every box on both sides is flat (asymmetric bounds too)', () => {
    const states = computeVoxelBoxStatesCenteredZero(0, -20, 50, 6);
    expect(states.every((s) => s.fillPercent === 0 && s.popT === 0 && !s.isStraddling)).toBe(true);
  });

  it('a positive value fills only the positive side, matching computeVoxelBoxStates(value, 0, max, positiveCount) exactly on fillPercent/popT/isStraddling', () => {
    const states = computeVoxelBoxStatesCenteredZero(25, -50, 50, 4);
    const expectedPositive = computeVoxelBoxStates(25, 0, 50, 2);
    expect(states.slice(0, 2).every((s) => s.fillPercent === 0 && s.popT === 0 && !s.isStraddling)).toBe(true);
    expect(states.slice(2, 4).map(({ fillPercent, popT, isStraddling }) => ({ fillPercent, popT, isStraddling }))).toEqual(
      expectedPositive,
    );
  });

  it('hand-derived negative-value case (min: -50, max: 50, boxCount: 4, value: -5): the box nearest min stays flat, the box nearest the seam straddles at 20%, the positive side is untouched', () => {
    const states = computeVoxelBoxStatesCenteredZero(-5, -50, 50, 4);
    expect(states).toEqual([
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 1, popDistanceLocalCount: 2, flipStraddleFill: true },
      { fillPercent: 20, popT: 1, isStraddling: true, popDistanceLocalIndex: 0, popDistanceLocalCount: 2, flipStraddleFill: true },
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 0, popDistanceLocalCount: 2, flipStraddleFill: false },
      { fillPercent: 0, popT: 0, isStraddling: false, popDistanceLocalIndex: 1, popDistanceLocalCount: 2, flipStraddleFill: false },
    ]);
  });

  it("the negative side's straddling box carries flipStraddleFill: true (its filled portion must render on the seam side, not the min side that VoxelTrack's default DOM order paints) — the positive side's straddling box carries flipStraddleFill: false (default is already correct there)", () => {
    const negative = computeVoxelBoxStatesCenteredZero(-25, -50, 50, 4);
    const negativeStraddler = negative.find((s) => s.isStraddling)!;
    expect(negativeStraddler.flipStraddleFill).toBe(true);

    const positive = computeVoxelBoxStatesCenteredZero(25, -50, 50, 4);
    const positiveStraddler = positive.find((s) => s.isStraddling)!;
    expect(positiveStraddler.flipStraddleFill).toBe(false);
  });

  it('the seam is always Math.floor(boxCount / 2), never proportional to the schema\'s own zero fraction — asymmetric bounds (-20/+50) still split a 6-box row 3/3', () => {
    // A positive value only ever touches the last 3 (indices 3-5); a negative
    // value only ever touches the first 3 (indices 0-2) — regardless of how
    // far zeroPointPercent(-20, 50) (~28.57%) sits from the row's true center.
    const positive = computeVoxelBoxStatesCenteredZero(10, -20, 50, 6);
    expect(positive.slice(0, 3).every((s) => s.fillPercent === 0 && !s.isStraddling)).toBe(true);
    expect(positive.slice(3, 6).some((s) => s.fillPercent > 0)).toBe(true);

    const negative = computeVoxelBoxStatesCenteredZero(-10, -20, 50, 6);
    expect(negative.slice(3, 6).every((s) => s.fillPercent === 0 && !s.isStraddling)).toBe(true);
    expect(negative.slice(0, 3).some((s) => s.fillPercent > 0)).toBe(true);
  });

  it('popDistanceLocalIndex is 0 at the box nearest the seam on either side, ascending outward to sideCount - 1 at that side\'s own physical end', () => {
    const states = computeVoxelBoxStatesCenteredZero(25, -50, 50, 4);
    // Negative side: global 0 (nearest min) -> local 1; global 1 (nearest seam) -> local 0.
    expect(states[0].popDistanceLocalIndex).toBe(1);
    expect(states[1].popDistanceLocalIndex).toBe(0);
    // Positive side: global 2 (nearest seam) -> local 0; global 3 (nearest max) -> local 1.
    expect(states[2].popDistanceLocalIndex).toBe(0);
    expect(states[3].popDistanceLocalIndex).toBe(1);
    expect(states.every((s) => s.popDistanceLocalCount === 2)).toBe(true);
  });

  it('exactly one isStraddling box for a sweep of representative non-zero values on both sides', () => {
    for (const value of [-50, -25, -1, 1, 25, 50]) {
      const states = computeVoxelBoxStatesCenteredZero(value, -50, 50, 8);
      expect(states.filter((s) => s.isStraddling)).toHaveLength(1);
    }
  });

  it('zero isStraddling boxes when value === 0', () => {
    const states = computeVoxelBoxStatesCenteredZero(0, -50, 50, 8);
    expect(states.filter((s) => s.isStraddling)).toHaveLength(0);
  });

  it('delegates out-of-range clamping to computeVoxelBoxStates rather than reimplementing it', () => {
    expect(computeVoxelBoxStatesCenteredZero(-999, -50, 50, 4)).toEqual(computeVoxelBoxStatesCenteredZero(-50, -50, 50, 4));
    expect(computeVoxelBoxStatesCenteredZero(999, -50, 50, 4)).toEqual(computeVoxelBoxStatesCenteredZero(50, -50, 50, 4));
  });
});

describe('computeVoxelPopStaggerDelays', () => {
  it('returns all zeros when prevStraddleIndex is null (no prior render to compare against, e.g. mount)', () => {
    const delays = computeVoxelPopStaggerDelays([false, false, false], [true, true, true], null);
    expect(delays).toEqual([0, 0, 0]);
  });

  it('returns all zeros when nothing flipped', () => {
    const filled = [true, true, false, false];
    const delays = computeVoxelPopStaggerDelays(filled, filled, 1);
    expect(delays).toEqual([0, 0, 0, 0]);
  });

  it('returns all zeros for an ordinary single-box flip (an unstaggered drag/ease step)', () => {
    const delays = computeVoxelPopStaggerDelays(
      [true, true, false, false],
      [true, true, true, false],
      1,
    );
    expect(delays).toEqual([0, 0, 0, 0]);
  });

  it('stages a multi-box flip (a jump) in order of distance from prevStraddleIndex, the closest box first', () => {
    // A jump from index 1 to index 4: boxes 2, 3, 4 flip from flat to filled in one render.
    const delays = computeVoxelPopStaggerDelays(
      [true, true, false, false, false],
      [true, true, true, true, true],
      1,
    );
    expect(delays[2]).toBe(0); // closest to the OLD straddle index (1)
    expect(delays[3]).toBeCloseTo(VOXEL_POP_STAGGER_SECONDS);
    expect(delays[4]).toBeCloseTo(2 * VOXEL_POP_STAGGER_SECONDS);
    // Unaffected boxes (0, 1 — never flipped) stay at 0.
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBe(0);
  });

  it('orders a downward jump (a drag toward the min) the same way — closest to the OLD value first, regardless of direction', () => {
    // A jump from index 4 to index 1: boxes 2, 3, 4 flip from filled to flat.
    const delays = computeVoxelPopStaggerDelays(
      [true, true, true, true, true],
      [true, true, false, false, false],
      4,
    );
    expect(delays[4]).toBe(0); // closest to the OLD straddle index (4)
    expect(delays[3]).toBeCloseTo(VOXEL_POP_STAGGER_SECONDS);
    expect(delays[2]).toBeCloseTo(2 * VOXEL_POP_STAGGER_SECONDS);
  });

  it('handles a jump straddling both sides of prevStraddleIndex (e.g. a centered-zero track crossing the seam)', () => {
    // prevStraddleIndex is 2; boxes 1 and 3 are equidistant (1 away) but box 1 wins the tie
    // (Array.prototype.sort is stable, and 1 appears before 3 in the flipped-index scan order).
    const delays = computeVoxelPopStaggerDelays(
      [false, false, false, false, false],
      [false, true, false, true, false],
      2,
    );
    expect(delays[1]).toBe(0);
    expect(delays[3]).toBeCloseTo(VOXEL_POP_STAGGER_SECONDS);
  });
});
