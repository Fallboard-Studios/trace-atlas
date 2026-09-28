import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';
import {
  pickRandomIndices,
  buildMotifOnsets,
  computePitchLockPlan,
  gridUnitsToDuration,
  pickDurationForGap,
  generateMelodyForRobot,
  reRollMelodyPitches,
  buildSeededComposition,
  DEFAULT_SUBDIVISIONS,
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  type ToggleValue,
} from './melodyGenerator';
import type { MelodyEvent } from '../types/Robot';
import { NOTE_PALETTE_SIZE } from '../constants';

// ========================================
// HELPERS
// ========================================

/**
 * Create a test melody event with sensible defaults.
 */
function createMelodyEvent(overrides: Partial<MelodyEvent> = {}): MelodyEvent {
  return {
    id: 'test-event-1',
    startStep: 1,
    length: '8n',
    noteIndex: 0,
    octave: 4,
    ...overrides,
  };
}

// ========================================
// TEST SUITE: pickRandomIndices
// ========================================

describe('pickRandomIndices', () => {
  it('picks exact count from array', () => {
    const arr = [1, 2, 3, 4, 5];
    const indices = pickRandomIndices(arr, 2);
    expect(indices).toHaveLength(2);
    // All indices should be valid and unique
    expect(new Set(indices).size).toBe(2);
    expect(indices.every((i) => i >= 0 && i < arr.length)).toBe(true);
  });

  it('returns empty array when count is 0', () => {
    const arr = [1, 2, 3];
    const indices = pickRandomIndices(arr, 0);
    expect(indices).toEqual([]);
  });

  it('returns all indices when count > array length', () => {
    const arr = [1, 2, 3];
    const indices = pickRandomIndices(arr, 10);
    expect(indices).toHaveLength(3);
    expect(new Set(indices).size).toBe(3);
  });

  it('respects custom RNG for determinism', () => {
    const arr = [1, 2, 3, 4, 5];
    let _callCount = 0;
    const mockRand = () => {
      _callCount++;
      return 0.5; // Fixed RNG
    };

    const indices1 = pickRandomIndices(arr, 2, mockRand);
    _callCount = 0;
    const indices2 = pickRandomIndices(arr, 2, mockRand);

    // With same RNG, should pick same indices
    expect(indices1).toEqual(indices2);
  });
});

// ========================================
// TEST SUITE: buildMotifOnsets
// ========================================

describe('buildMotifOnsets', () => {
  const fixedRand = () => 0.5;

  it('returns sorted unique onset positions in [0, subdivisions)', () => {
    const onsets = buildMotifOnsets(8, 8, DEFAULT_SUBDIVISIONS, fixedRand);
    expect(onsets.length).toBeGreaterThan(0);
    expect(new Set(onsets).size).toBe(onsets.length); // unique
    onsets.forEach((o) => {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(DEFAULT_SUBDIVISIONS);
    });
    // sorted ascending
    for (let i = 1; i < onsets.length; i++) {
      expect(onsets[i]).toBeGreaterThan(onsets[i - 1]);
    }
  });

  it('short motifLength (<=subdivisions/2) produces repeating pattern across the measure', () => {
    // motifLength=4, subdivisions=16 → 4 repeats of the same base motif
    // With a fixed RNG the base motif should tile: offsets 0, 4, 8, 12
    const onsets = buildMotifOnsets(4, 4, 16, fixedRand);
    // With 4 repeats and density 4: K=1 onset per motif, R=0 → exactly 4 onsets
    expect(onsets).toHaveLength(4);
    // Each onset should be in a different repeat window
    const windows = onsets.map((o) => Math.floor(o / 4));
    expect(new Set(windows).size).toBe(4); // one per window
  });

  it('motifLength === subdivisions falls back to non-repeating unique positions', () => {
    const density = 8;
    const onsets = buildMotifOnsets(density, DEFAULT_SUBDIVISIONS, DEFAULT_SUBDIVISIONS, fixedRand);
    expect(onsets).toHaveLength(density);
    expect(new Set(onsets).size).toBe(density);
  });

  it('motifLength > subdivisions is clamped to subdivisions (non-repeating)', () => {
    const density = 4;
    const onsets = buildMotifOnsets(density, 999, DEFAULT_SUBDIVISIONS, fixedRand);
    expect(onsets).toHaveLength(density);
    onsets.forEach((o) => expect(o).toBeLessThan(DEFAULT_SUBDIVISIONS));
  });

  it('density is capped at subdivisions (never more onsets than grid cells)', () => {
    const onsets = buildMotifOnsets(99, 8, DEFAULT_SUBDIVISIONS, fixedRand);
    expect(onsets.length).toBeLessThanOrEqual(DEFAULT_SUBDIVISIONS);
    expect(new Set(onsets).size).toBe(onsets.length);
  });

  it('deterministic with the same RNG', () => {
    // Build with a stateless fixed-value rand — same inputs → same output
    const a = buildMotifOnsets(6, 4, 16, () => 0.3);
    const b = buildMotifOnsets(6, 4, 16, () => 0.3);
    expect(a).toEqual(b);
  });

  it('never returns more onsets than rhythmicDensity, even with a very short motif', () => {
    // motifLength=1, subdivisions=16 → repeats=16, far more windows than density=4.
    // K floors to 1 per window (16 raw onsets) before being trimmed back to density.
    const onsets = buildMotifOnsets(4, 1, 16, fixedRand);
    expect(onsets).toHaveLength(4);
    expect(new Set(onsets).size).toBe(4);
    onsets.forEach((o) => {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(16);
    });
  });

  it('never returns more onsets than rhythmicDensity for a moderately short motif', () => {
    // motifLength=2, subdivisions=16 → repeats=8, still more than density=4.
    const onsets = buildMotifOnsets(4, 2, 16, fixedRand);
    expect(onsets).toHaveLength(4);
    expect(new Set(onsets).size).toBe(4);
  });

  it('distributes remainder onsets to first R repeat copies', () => {
    // density=5, motifLength=8, subdivisions=16 → repeats=2, K=2, R=1
    // First repeat should have 3 onsets, second repeat should have 2
    const onsets = buildMotifOnsets(5, 8, 16, fixedRand);
    expect(onsets).toHaveLength(5);
    const inFirstHalf = onsets.filter((o) => o < 8).length;
    const inSecondHalf = onsets.filter((o) => o >= 8).length;
    expect(inFirstHalf).toBe(3);
    expect(inSecondHalf).toBe(2);
  });
});

// ========================================
// TEST SUITE: buildMotifOnsets — tail-cell pass (untruncating)
//
// Pitch Repeat (docs/specs/PITCH_REPEAT.md) bundles a fix to the shared rhythm engine: when
// `rhythmicMotifLength` (M) doesn't evenly divide `subdivisions`, the leftover
// `subdivisions - repeats * M` steps used to never receive an onset. This block pins the fix.
// ========================================

describe('buildMotifOnsets — tail-cell pass (untruncating)', () => {
  const fixedRand = () => 0.5;

  it.each([1, 2, 4, 8])(
    'M=%i evenly divides 16 — repeats*M fills the whole measure, so there is no tail region to fill',
    (M) => {
      const repeats = Math.floor(16 / M);
      expect(repeats * M).toBe(16); // sanity: no leftover steps exist for these M values
      const onsets = buildMotifOnsets(M * repeats, M, 16, fixedRand);
      onsets.forEach((o) => expect(o).toBeLessThan(16));
    }
  );

  it.each([3, 5, 6, 7])(
    'M=%i does not evenly divide 16 — the leftover tail steps now receive onsets',
    (M) => {
      const repeats = Math.floor(16 / M);
      const tailOffset = repeats * M;
      // K = M (full-density base cell) guarantees every base-motif position exists, so the
      // tail — whichever base positions land inside it — is non-empty.
      const onsets = buildMotifOnsets(M * repeats, M, 16, fixedRand);
      const tailOnsets = onsets.filter((o) => o >= tailOffset);
      expect(tailOnsets.length).toBeGreaterThan(0);
    }
  );

  it('tail onset positions are a deterministic subset of the base motif (repeat 0), not a fresh draw', () => {
    // M=6 against 16 → repeats=2, tailLength=4. K=3 (a partial base cell, not full) so the
    // subset relationship is meaningful rather than vacuously true.
    const M = 6;
    const repeats = Math.floor(16 / M); // 2
    const tailOffset = repeats * M; // 12
    const tailLength = 16 - tailOffset; // 4
    const onsets = buildMotifOnsets(6, M, 16, fixedRand); // density=6 → K=3, R=0

    const basePositions = new Set(onsets.filter((o) => o < M));
    const tailOnsets = onsets.filter((o) => o >= tailOffset);
    expect(tailOnsets.length).toBeGreaterThan(0);
    tailOnsets.forEach((o) => {
      const pos = o - tailOffset;
      expect(pos).toBeLessThan(tailLength);
      expect(basePositions.has(pos)).toBe(true);
    });
  });

  it('tail onset count never exceeds min(K, tailLength)', () => {
    // M=6, density=6 → K=3 base positions, tailLength=4 → tail can hold at most min(3,4)=3.
    const M = 6;
    const repeats = Math.floor(16 / M);
    const tailOffset = repeats * M;
    const onsets = buildMotifOnsets(6, M, 16, fixedRand);
    const tailOnsets = onsets.filter((o) => o >= tailOffset);
    expect(tailOnsets.length).toBeLessThanOrEqual(3);
  });

  it('leaves the existing R-extra-onset-per-repeat and overshoot-trim branches unaffected', () => {
    // Same case as the existing 'distributes remainder onsets to first R repeat copies' test
    // above (density=5, motifLength=8, subdivisions=16 → repeats=2, tailLength=0) — the tail
    // pass must be a no-op here since 8 evenly divides 16, so this must still hold exactly.
    const onsets = buildMotifOnsets(5, 8, 16, fixedRand);
    expect(onsets).toHaveLength(5);
    const inFirstHalf = onsets.filter((o) => o < 8).length;
    const inSecondHalf = onsets.filter((o) => o >= 8).length;
    expect(inFirstHalf).toBe(3);
    expect(inSecondHalf).toBe(2);
  });

  it('appended tail onsets are not counted against the combined.length <= rhythmicDensity trim check', () => {
    // M=6, density=1, subdivisions=16 → repeats=2, tailLength=4. K floors to 1 per repeat window
    // regardless of the requested density=1, so the pre-tail tiling loop already overshoots
    // (2 onsets from 2 repeats) and the existing overshoot-trim branch fires, trimming back down
    // to exactly 1 onset — before the tail-cell pass ever runs. If the tail pass were folded into
    // that trim check, its onset could get discarded too; because it's appended *after*, the
    // final count exceeds the requested density=1 once the tail lands inside the leftover span.
    const onsets = buildMotifOnsets(1, 6, 16, fixedRand);
    expect(onsets.length).toBeGreaterThan(1); // requested density=1, but tail fill adds more
    expect(onsets.some((o) => o >= 12)).toBe(true); // the extra onset lives in the tail region
  });
});

// ========================================
// TEST SUITE: computePitchLockPlan
//
// Pitch Repeat's staged/seeded pitch-locking model (docs/specs/PITCH_REPEAT.md §4). Uses
// hand-built onset arrays (rather than buildMotifOnsets output) so each scenario's K/repeats/tail
// shape is exact and legible, and `rand = () => 0` where a specific, known permutation is needed
// (pickUniqueInRange's Fisher-Yates shuffle degenerates to the identity order at rand() === 0).
// ========================================

describe('computePitchLockPlan', () => {
  // motifLength=4, subdivisions=16 -> repeats=4, tailLength=0, totalRepeats=4.
  // Base cell (repeat 0) has 2 onsets, positions 1 and 3; every repeat tiles the same positions.
  const noTailOnsets = [1, 3, 5, 7, 9, 11, 13, 15];
  const noTailMotifLength = 4;
  const noTailSubdivisions = 16;

  it('pitchRepeatPct: 0 -> every returned value is false', () => {
    const plan = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 0, () => 0.37);
    expect(plan).toEqual(noTailOnsets.map(() => false));
  });

  it('pitchRepeatPct: 100 -> every non-base-cell onset is true (full verbatim repetition)', () => {
    const plan = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 100, () => 0.81);
    // Indices 0-1 are repeat 0 (the base cell, never locked); indices 2-7 are repeats 1-3.
    expect(plan.slice(0, 2)).toEqual([false, false]);
    expect(plan.slice(2)).toEqual(plan.slice(2).map(() => true));
  });

  it("base-cell (repeat 0) onsets are always false, even at pitchRepeatPct: 100", () => {
    const plan = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 100, () => 0.5);
    expect(plan[0]).toBe(false); // onset 1, repeat 0
    expect(plan[1]).toBe(false); // onset 3, repeat 0
  });

  it('is deterministic — identical inputs and a fresh identically-seeded rand produce identical plans', () => {
    const planA = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 60, alea('pitch-repeat-determinism'));
    const planB = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 60, alea('pitch-repeat-determinism'));
    expect(planA).toEqual(planB);
  });

  it('is monotonic for a fixed seed: the locked set only grows as pitchRepeatPct rises', () => {
    // Same seed re-created fresh for each pct (so only pct varies, not the RNG stream consumed).
    let previousLocked = new Set<number>();
    for (let pct = 0; pct <= 100; pct += 10) {
      const plan = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, pct, alea('pitch-repeat-monotonic'));
      const locked = new Set(plan.flatMap((v, i) => (v ? [i] : [])));
      previousLocked.forEach((i) => expect(locked.has(i)).toBe(true)); // nothing unlocks as pct rises
      previousLocked = locked;
    }
  });

  it('two different seeds produce different position-lock orders (not always position 0 first)', () => {
    // K=2 (positions 1 and 3) -> stageWidth=50, so pct=50 exactly completes stage 0 (fully
    // locking whichever position came first) while stage 1's position stays fully unlocked.
    // Index 2 (onset value 5) is position 1's repeat-1 onset; index 3 (onset value 7) is
    // position 3's repeat-1 onset — exactly one of the two is true at pct=50.
    const position1FirstResults = new Set<boolean>();
    for (let seedNum = 0; seedNum < 25; seedNum++) {
      const plan = computePitchLockPlan(noTailOnsets, noTailMotifLength, noTailSubdivisions, 50, alea(`order-seed-${seedNum}`));
      expect(plan[2]).not.toBe(plan[3]); // exactly one of the two positions is stage 0's winner
      position1FirstResults.add(plan[2]);
    }
    expect(position1FirstResults.has(true)).toBe(true);
    expect(position1FirstResults.has(false)).toBe(true);
  });

  it('excludes the tail repeat from a position\'s applicable-repeat list when that position is >= tailLength', () => {
    // motifLength=6, subdivisions=16 -> repeats=2, tailLength=4, totalRepeats=3 (2 full + 1 tail).
    // Base cell has 3 onsets: positions 0, 2 (both < tailLength, so the tail repeat has an onset
    // at each) and 5 (>= tailLength, so the tail repeat has NO onset there).
    const onsets = [0, 2, 5, 6, 8, 11, 12, 14]; // repeat0: 0,2,5 | repeat1: 6,8,11 | tail: 12,14
    const motifLength = 6;
    const subdivisions = 16;
    // rand() === 0 degenerates pickUniqueInRange's shuffle to the identity order: positionOrder
    // = [0,1,2] (basePositions[0,1,2] = 0,2,5 in that stage order), repeatOrder = [1,2].
    const identityRand = () => 0;

    // Position 5 is basePositions[2] -> stage index 2 -> stage range [66.667, 100). Its only
    // applicable repeat is repeat 1 (onset value 11, index 5) — repeat 2 (tail) is excluded
    // because position 5 >= tailLength, so applicable.length is 1, not 2.
    const notYetLocked = computePitchLockPlan(onsets, motifLength, subdivisions, 80, identityRand);
    expect(notYetLocked[5]).toBe(false); // fraction 0.4 through the stage, round(0.4 * 1) = 0

    const locked = computePitchLockPlan(onsets, motifLength, subdivisions, 90, identityRand);
    expect(locked[5]).toBe(true); // fraction 0.7 through the stage, round(0.7 * 1) = 1

    // Contrast: position 0 (stage index 0, applicable.length = 2 — repeat1 AND the tail) is
    // long past its own stage by pct=80/90, so it's fully locked in both onsets it has (repeat1
    // at index1=6, tail at index6=12) — confirming the tail repeat DOES apply to position 0.
    expect(locked[3]).toBe(true); // onset 6, position 0's repeat-1 onset
    expect(locked[6]).toBe(true); // onset 12, position 0's tail onset
  });
});

// ========================================
// TEST SUITE: gridUnitsToDuration
// ========================================

describe('gridUnitsToDuration', () => {
  it('1 unit → 16n', () => expect(gridUnitsToDuration(1)).toBe('16n'));
  it('0 units → 16n', () => expect(gridUnitsToDuration(0)).toBe('16n'));
  it('2 units → 8n', () => expect(gridUnitsToDuration(2)).toBe('8n'));
  it('3 units → 8n', () => expect(gridUnitsToDuration(3)).toBe('8n'));
  it('4 units → 4n', () => expect(gridUnitsToDuration(4)).toBe('4n'));
  it('6 units → 4n', () => expect(gridUnitsToDuration(6)).toBe('4n'));
  it('7 units → 2n', () => expect(gridUnitsToDuration(7)).toBe('2n'));
  it('16 units → 2n', () => expect(gridUnitsToDuration(16)).toBe('2n'));
});

// ========================================
// TEST SUITE: pickDurationForGap
// ========================================

describe('pickDurationForGap', () => {
  it('never returns a duration longer than the available gap', () => {
    // grid units: 16n=1, 8n=2, 4n=4, 2n=8
    const maxUnitsFor: Record<string, number> = { '16n': 1, '8n': 2, '4n': 4, '2n': 8 };
    for (let gap = 1; gap <= 16; gap++) {
      for (let i = 0; i < 20; i++) {
        const duration = pickDurationForGap(gap, () => i / 20);
        expect(maxUnitsFor[duration]).toBeLessThanOrEqual(gap);
      }
    }
  });

  it('gap of 1 always returns 16n (only candidate)', () => {
    expect(pickDurationForGap(1, () => 0)).toBe('16n');
    expect(pickDurationForGap(1, () => 0.999)).toBe('16n');
  });

  it('gap of 2 only ever returns 16n or 8n', () => {
    for (let i = 0; i < 10; i++) {
      const duration = pickDurationForGap(2, () => i / 10);
      expect(['16n', '8n']).toContain(duration);
    }
  });

  it('is deterministic for a given rand function', () => {
    const a = pickDurationForGap(8, () => 0.42);
    const b = pickDurationForGap(8, () => 0.42);
    expect(a).toBe(b);
  });

  it('favors longer durations over many samples with a large gap', () => {
    const counts: Record<string, number> = { '16n': 0, '8n': 0, '4n': 0, '2n': 0 };
    for (let i = 0; i < 2000; i++) {
      counts[pickDurationForGap(8, Math.random)]++;
    }
    // Weighted by unit value (1/2/4/8 of 15 total) — 16n should be the rarest by far.
    expect(counts['16n']).toBeLessThan(counts['2n']);
    expect(counts['16n']).toBeLessThan(counts['4n']);
    expect(counts['16n']).toBeLessThan(counts['8n']);
  });
});

// ========================================
// TEST SUITE: generateMelodyForRobot (new-style opts)
// ========================================

describe('generateMelodyForRobot — GenerateMelodyForRobotOptions', () => {
  it('rhythmicDensity=100 with motif inactive fills the entire 16-step measure', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: false, value: 8 },
      octaveMin: 3,
      octaveMax: 5,
      seed: 1,
    });
    expect(melody).toHaveLength(16);
  });

  it('rhythmicDensity=50 with motif inactive fills half the measure', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 50,
      rhythmicMotifLength: { active: false, value: 8 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 2,
    });
    expect(melody).toHaveLength(8);
  });

  it('rhythmicDensity=25 with motif inactive rounds to the nearest onset count', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 25,
      rhythmicMotifLength: { active: false, value: 4 }, // value is inert while inactive
      octaveMin: 3,
      octaveMax: 4,
      seed: 7,
    });
    expect(melody).toHaveLength(4); // round(0.25 * 16)
  });

  it('rhythmicDensity=0 with motif inactive never produces a silent (empty) melody', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 0,
      rhythmicMotifLength: { active: false, value: 8 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 3,
    });
    expect(melody.length).toBeGreaterThanOrEqual(1);
  });

  it('rhythmicDensity=0 with motif active never produces a silent melody', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 0,
      rhythmicMotifLength: { active: true, value: 4 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 4,
    });
    expect(melody.length).toBeGreaterThanOrEqual(1);
  });

  it('rhythmicDensity=100 with motif active (value=4) fully fills and tiles the 4-step cell', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: true, value: 4 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 5,
    });
    // 4 onsets/cell (100% of a 4-step cell) * 4 repeats (16/4) = fully dense measure
    expect(melody).toHaveLength(16);
    expect(new Set(melody.map((e) => e.startStep)).size).toBe(16);
  });

  it('motif active tiles an identical onset count across each repeat window', () => {
    // motif.value=4, subdivisions=16 → 4 repeat windows of 4 steps each;
    // 50% density → 2 onsets per cell, identically in every window (no remainder skew)
    const melody = generateMelodyForRobot({
      rhythmicDensity: 50,
      rhythmicMotifLength: { active: true, value: 4 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 6,
    });
    const steps = melody.map((e) => e.startStep - 1); // 0-indexed
    const windowCounts = [0, 1, 2, 3].map(
      (w) => steps.filter((s) => s >= w * 4 && s < (w + 1) * 4).length
    );
    windowCounts.forEach((count) => expect(count).toBe(2));
  });

  it('all noteIndex values are in [0, NOTE_PALETTE_SIZE - 1]', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 75, octaveMin: 2, octaveMax: 6, seed: 42 });
    melody.forEach((e) => {
      expect(e.noteIndex).toBeGreaterThanOrEqual(0);
      expect(e.noteIndex).toBeLessThanOrEqual(NOTE_PALETTE_SIZE - 1);
    });
  });

  it('all octave values are within [octaveMin, octaveMax]', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 50, octaveMin: 3, octaveMax: 5, seed: 7 });
    melody.forEach((e) => {
      expect(e.octave).toBeGreaterThanOrEqual(3);
      expect(e.octave).toBeLessThanOrEqual(5);
    });
  });

  it('octaveMin === octaveMax pins all events to that octave', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 40, octaveMin: 4, octaveMax: 4, seed: 99 });
    melody.forEach((e) => expect(e.octave).toBe(4));
  });

  it('swapped octaveMin/octaveMax is normalised (no events out of range)', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 40, octaveMin: 5, octaveMax: 3, seed: 5 });
    melody.forEach((e) => {
      expect(e.octave).toBeGreaterThanOrEqual(3);
      expect(e.octave).toBeLessThanOrEqual(5);
    });
  });

  it('all startStep values are in [1, 16]', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 50, octaveMin: 3, octaveMax: 4, seed: 10 });
    melody.forEach((e) => {
      expect(e.startStep).toBeGreaterThanOrEqual(1);
      expect(e.startStep).toBeLessThanOrEqual(16);
    });
  });

  it('noteVariance inactive produces unweighted note selection, not the weighted default', () => {
    // A dense, motif-inactive melody gives a large sample. Weighted selection
    // (NOTE_INDEX_WEIGHTS = [0.35, 0.2, ...]) would collapse heavily toward index
    // 0; unweighted selection should spread across noticeably more of the 8 indices.
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: false, value: 8 },
      noteVariance: { active: false, value: 1 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 123,
    });
    const indices = melody.map((e) => e.noteIndex);
    expect(new Set(indices).size).toBeGreaterThan(4);
  });

  it('noteVariance active with value=3 prefers new unique notes until the set fills (deterministic)', () => {
    const value = 3;
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: false, value: 8 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 11,
      noteVariance: { active: true, value },
    });
    const seen = new Set<number>();
    for (let i = 0; i < melody.length; i++) {
      const idx = melody[i].noteIndex;
      if (seen.size < value) {
        expect(seen.has(idx)).toBe(false);
      }
      seen.add(idx);
    }
    expect(seen.size).toBeLessThanOrEqual(value);
  });

  it('noteVariance active with value=8 draws without replacement until all NOTE_PALETTE_SIZE notes used', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: false, value: 8 },
      octaveMin: 3,
      octaveMax: 5,
      seed: 7,
      noteVariance: { active: true, value: 8 },
    });
    const indices = melody.map((e) => e.noteIndex);
    const uniq = new Set(indices);
    expect(uniq.size).toBe(NOTE_PALETTE_SIZE);
  });

  it('is deterministic with the same seed', () => {
    const opts = { rhythmicDensity: 50, octaveMin: 3, octaveMax: 5, seed: 77 };
    const a = generateMelodyForRobot(opts);
    const b = generateMelodyForRobot(opts);
    expect(a.map((e) => e.startStep)).toEqual(b.map((e) => e.startStep));
    expect(a.map((e) => e.noteIndex)).toEqual(b.map((e) => e.noteIndex));
    expect(a.map((e) => e.octave)).toEqual(b.map((e) => e.octave));
  });

  it('each event has a valid length (16n | 8n | 4n | 2n)', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 50, octaveMin: 3, octaveMax: 4, seed: 6 });
    const valid = new Set(['16n', '8n', '4n', '2n']);
    melody.forEach((e) => expect(valid.has(e.length)).toBe(true));
  });

  it('each event has a unique id', () => {
    const melody = generateMelodyForRobot({ rhythmicDensity: 50, octaveMin: 3, octaveMax: 4, seed: 8 });
    const ids = melody.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('onsetCount is no longer a recognized option', () => {
    // @ts-expect-error — onsetCount was removed from GenerateMelodyForRobotOptions
    generateMelodyForRobot({ onsetCount: 4, octaveMin: 3, octaveMax: 4, seed: 1 });
  });

  it('applies behavior-preserving defaults when rhythmicDensity/rhythmicMotifLength/noteVariance are omitted', () => {
    expect(DEFAULT_RHYTHMIC_DENSITY).toBe(50);
    expect(DEFAULT_RHYTHMIC_MOTIF_LENGTH).toEqual({ active: true, value: 8 });
    expect(DEFAULT_NOTE_VARIANCE).toEqual({ active: false, value: 0 });
    const melody = generateMelodyForRobot({ octaveMin: 3, octaveMax: 4, seed: 9 });
    expect(melody.length).toBeGreaterThanOrEqual(1);
  });
});

// ========================================
// TEST SUITE: buildSeededComposition (Deterministic Robot Melody Generation, Task 2)
// ========================================

describe('buildSeededComposition', () => {
  const baseAttrs: {
    rhythmicDensity: number;
    rhythmicMotifLength: ToggleValue;
    noteVariance: ToggleValue;
    pitchRepeat: number;
    octaveRange: [number, number];
  } = {
    rhythmicDensity: 50,
    rhythmicMotifLength: { active: true, value: 8 },
    noteVariance: { active: false, value: 0 },
    pitchRepeat: 0,
    octaveRange: [3, 5],
  };

  function drawSequence(rand: () => number, n = 5): number[] {
    return Array.from({ length: n }, () => rand());
  }

  it('same compositionSeed + same attrs produce an identical output sequence, across repeated calls to the returned function and across fresh calls to buildSeededComposition itself', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, baseAttrs));
    expect(seqA).toEqual(seqB);
  });

  it('changing compositionSeed changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.43, baseAttrs));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing rhythmicDensity changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, rhythmicDensity: 75 }));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing rhythmicMotifLength changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, rhythmicMotifLength: { active: true, value: 4 } }));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing noteVariance changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, noteVariance: { active: true, value: 3 } }));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing pitchRepeat changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, pitchRepeat: 80 }));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing octaveRange[0] alone changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, octaveRange: [2, 5] }));
    expect(seqA).not.toEqual(seqB);
  });

  it('changing octaveRange[1] alone changes the output sequence', () => {
    const seqA = drawSequence(buildSeededComposition(0.42, baseAttrs));
    const seqB = drawSequence(buildSeededComposition(0.42, { ...baseAttrs, octaveRange: [3, 6] }));
    expect(seqA).not.toEqual(seqB);
  });

  it('is a valid drop-in for generateMelodyForRobot\'s opts.rand', () => {
    const rand = buildSeededComposition(0.42, baseAttrs);
    const melody = generateMelodyForRobot({
      octaveMin: baseAttrs.octaveRange[0],
      octaveMax: baseAttrs.octaveRange[1],
      rhythmicDensity: baseAttrs.rhythmicDensity,
      rhythmicMotifLength: baseAttrs.rhythmicMotifLength,
      noteVariance: baseAttrs.noteVariance,
      pitchRepeat: baseAttrs.pitchRepeat,
      rand,
    });
    expect(melody.length).toBeGreaterThan(0);
    for (const event of melody) {
      expect(event.octave).toBeGreaterThanOrEqual(baseAttrs.octaveRange[0]);
      expect(event.octave).toBeLessThanOrEqual(baseAttrs.octaveRange[1]);
    }
  });

  it('never calls Math.random — fully seeded, per Crawford\'s spec-approval condition', () => {
    const spy = vi.spyOn(Math, 'random');
    const rand = buildSeededComposition(0.42, baseAttrs);
    generateMelodyForRobot({
      octaveMin: baseAttrs.octaveRange[0],
      octaveMax: baseAttrs.octaveRange[1],
      rhythmicDensity: baseAttrs.rhythmicDensity,
      rhythmicMotifLength: baseAttrs.rhythmicMotifLength,
      noteVariance: baseAttrs.noteVariance,
      pitchRepeat: baseAttrs.pitchRepeat,
      rand,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ========================================
// TEST SUITE: generateMelodyForRobot — Pitch Repeat (Task 6)
// ========================================

describe('generateMelodyForRobot — Pitch Repeat', () => {
  it('rhythmicMotifLength.active: false makes pitchRepeat inert regardless of value (gating)', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 75,
      rhythmicMotifLength: { active: false, value: 8 },
      pitchRepeat: 100,
      octaveMin: 3,
      octaveMax: 4,
      seed: 20,
    });
    melody.forEach((e) => expect(e.pitchLocked).toBeUndefined());
  });

  it('pitchRepeat: 0 with motif active produces no pitchLocked events', () => {
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: true, value: 4 },
      pitchRepeat: 0,
      octaveMin: 3,
      octaveMax: 4,
      seed: 21,
    });
    melody.forEach((e) => expect(e.pitchLocked).toBeUndefined());
  });

  it('pitchRepeat omitted behaves identically to pitchRepeat: 0 (DEFAULT_PITCH_REPEAT)', () => {
    const base = { rhythmicDensity: 100, rhythmicMotifLength: { active: true, value: 4 }, octaveMin: 3, octaveMax: 4, seed: 22 };
    const omitted = generateMelodyForRobot(base);
    const explicit = generateMelodyForRobot({ ...base, pitchRepeat: 0 });
    // id is crypto.randomUUID()-based, not seeded — compare every other field, same convention
    // as the existing 'is deterministic with the same seed' test above.
    expect(omitted.map((e) => ({ ...e, id: undefined }))).toEqual(explicit.map((e) => ({ ...e, id: undefined })));
  });

  it('pitchRepeat: 100 with motif active — every repeat\'s noteIndex sequence matches the base cell\'s', () => {
    // value=4, density=100 → K=4 (fully dense cell), 4 repeat windows, no tail (4 evenly divides 16).
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: true, value: 4 },
      pitchRepeat: 100,
      octaveMin: 3,
      octaveMax: 4,
      seed: 23,
    });
    expect(melody).toHaveLength(16);
    const byPositionAndRepeat = new Map<number, Map<number, MelodyEvent>>();
    melody.forEach((e) => {
      const step = e.startStep - 1;
      const position = step % 4;
      const repeat = Math.floor(step / 4);
      if (!byPositionAndRepeat.has(position)) byPositionAndRepeat.set(position, new Map());
      byPositionAndRepeat.get(position)!.set(repeat, e);
    });
    byPositionAndRepeat.forEach((repeatsForPosition) => {
      const base = repeatsForPosition.get(0)!;
      expect(base.pitchLocked).toBeUndefined(); // base cell is the copy source, never locked
      for (let repeat = 1; repeat < 4; repeat++) {
        const event = repeatsForPosition.get(repeat)!;
        expect(event.noteIndex).toBe(base.noteIndex);
        expect(event.pitchLocked).toBe(true);
      }
    });
  });

  it('is deterministic with the same seed', () => {
    const opts = { rhythmicDensity: 60, rhythmicMotifLength: { active: true, value: 8 }, pitchRepeat: 60, octaveMin: 3, octaveMax: 5, seed: 24 };
    const a = generateMelodyForRobot(opts);
    const b = generateMelodyForRobot(opts);
    expect(a.map((e) => e.startStep)).toEqual(b.map((e) => e.startStep));
    expect(a.map((e) => e.noteIndex)).toEqual(b.map((e) => e.noteIndex));
    expect(a.map((e) => e.octave)).toEqual(b.map((e) => e.octave));
    expect(a.map((e) => e.pitchLocked)).toEqual(b.map((e) => e.pitchLocked));
  });

  it('partial lock: locked events copy the base cell\'s noteIndex verbatim; unlocked events are unconstrained by it', () => {
    // value=8, density=50 → K=4 of 8 positions filled per cell, 2 repeat windows.
    const melody = generateMelodyForRobot({
      rhythmicDensity: 50,
      rhythmicMotifLength: { active: true, value: 8 },
      pitchRepeat: 50,
      octaveMin: 3,
      octaveMax: 4,
      seed: 25,
    });
    const byPosition = new Map<number, MelodyEvent[]>();
    melody.forEach((e) => {
      const position = (e.startStep - 1) % 8;
      if (!byPosition.has(position)) byPosition.set(position, []);
      byPosition.get(position)!.push(e);
    });
    let sawALockedEvent = false;
    byPosition.forEach((eventsForPosition) => {
      const base = eventsForPosition.find((e) => e.startStep - 1 < 8);
      if (!base) return; // this position's onset only exists in a later repeat (R-extra) — not base-cell-locked
      eventsForPosition.forEach((e) => {
        if (e === base) {
          expect(e.pitchLocked).toBeUndefined();
        } else if (e.pitchLocked) {
          sawALockedEvent = true;
          expect(e.noteIndex).toBe(base.noteIndex); // verbatim copy
        }
      });
    });
    expect(sawALockedEvent).toBe(true); // sanity: this seed/pct actually exercises locking
  });

  it('noteVariance\'s uniqueness cap is unaffected by locked copies — only unlocked picks count toward it', () => {
    // Locked events bypass Note Variance selection entirely, so they must not be able to push the
    // running unique-note count past noteVariance's own value cap.
    const melody = generateMelodyForRobot({
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: true, value: 4 },
      pitchRepeat: 50,
      noteVariance: { active: true, value: 3 },
      octaveMin: 3,
      octaveMax: 4,
      seed: 26,
    });
    const unlockedIndices = melody.filter((e) => !e.pitchLocked).map((e) => e.noteIndex);
    expect(new Set(unlockedIndices).size).toBeLessThanOrEqual(3);
  });
});

// ========================================
// TEST SUITE: reRollMelodyPitches
// ========================================

describe('reRollMelodyPitches', () => {
  /** 8-event melody with distinct, easily-diffable startStep/noteIndex/octave per event. */
  function makeEightEventMelody(): MelodyEvent[] {
    return Array.from({ length: 8 }, (_, i) =>
      createMelodyEvent({ id: `e${i}`, startStep: i + 1, length: '16n', noteIndex: i % 8, octave: 3 + (i % 3) })
    );
  }

  it('changes exactly round(length * ratio) events at a 25% ratio on an 8-event melody', () => {
    const melody = makeEightEventMelody();
    const rand = alea('reroll-seed-1');
    const result = reRollMelodyPitches(melody, 0.25, { rand });

    const changedCount = result.filter((e, i) => e.noteIndex !== melody[i].noteIndex).length;
    expect(changedCount).toBe(2); // round(8 * 0.25) = 2
  });

  it('leaves startStep, length, and octave unchanged on every event, including changed ones', () => {
    const melody = makeEightEventMelody();
    const rand = alea('reroll-seed-2');
    const result = reRollMelodyPitches(melody, 0.25, { rand });

    expect(result.map((e) => e.startStep)).toEqual(melody.map((e) => e.startStep));
    expect(result.map((e) => e.length)).toEqual(melody.map((e) => e.length));
    expect(result.map((e) => e.octave)).toEqual(melody.map((e) => e.octave));
  });

  it('leaves unchanged events\' noteIndex byte-identical to the input', () => {
    const melody = makeEightEventMelody();
    const rand = alea('reroll-seed-3');
    const result = reRollMelodyPitches(melody, 0.25, { rand });

    result.forEach((e, i) => {
      const isChanged = e.noteIndex !== melody[i].noteIndex;
      if (!isChanged) expect(e.noteIndex).toBe(melody[i].noteIndex);
    });
  });

  it('floors at 1 changed event even when round(length * ratio) would be 0', () => {
    const melody = [createMelodyEvent({ id: 'only', startStep: 1, noteIndex: 5, octave: 4 })];
    const rand = alea('reroll-seed-4');
    const result = reRollMelodyPitches(melody, 0.25, { rand });

    // A 1-event melody at 25% floors to "change 1", not "change 0".
    expect(result).toHaveLength(1);
    // Can't assert the new value differs from a possible-by-chance identical re-roll,
    // but the function must have gone through the re-roll path (index 0 is always selected
    // when count >= length), not a same-reference pass-through.
    expect(result[0]).not.toBe(melody[0]);
  });

  it('noteVariance inactive (or absent) produces unweighted picks in the valid palette range', () => {
    const melody = makeEightEventMelody();
    const rand = alea('reroll-seed-5');
    const result = reRollMelodyPitches(melody, 1, { rand }); // ratio 1 -> every event re-rolled
    result.forEach((e) => {
      expect(e.noteIndex).toBeGreaterThanOrEqual(0);
      expect(e.noteIndex).toBeLessThan(NOTE_PALETTE_SIZE);
    });
  });

  it('noteVariance active produces picks within the valid palette range (weighted selection)', () => {
    const melody = makeEightEventMelody();
    const rand = alea('reroll-seed-6');
    const result = reRollMelodyPitches(melody, 1, { noteVariance: { active: true, value: 8 }, rand });
    result.forEach((e) => {
      expect(e.noteIndex).toBeGreaterThanOrEqual(0);
      expect(e.noteIndex).toBeLessThan(NOTE_PALETTE_SIZE);
    });
  });

  it('is deterministic — same rand sequence in, same output out', () => {
    const melodyA = makeEightEventMelody();
    const melodyB = makeEightEventMelody();
    const resultA = reRollMelodyPitches(melodyA, 0.25, { rand: alea('reroll-determinism') });
    const resultB = reRollMelodyPitches(melodyB, 0.25, { rand: alea('reroll-determinism') });
    expect(resultA.map((e) => e.noteIndex)).toEqual(resultB.map((e) => e.noteIndex));
  });

  it('does not mutate the input melody array or its events', () => {
    const melody = makeEightEventMelody();
    const snapshot = melody.map((e) => ({ ...e }));
    reRollMelodyPitches(melody, 0.25, { rand: alea('reroll-seed-7') });
    expect(melody).toEqual(snapshot);
  });

  describe('Pitch Repeat — excluding pitchLocked events (Task 7)', () => {
    it('a fully pitchLocked melody re-rolls zero events, not the old floor-of-1', () => {
      const melody = makeEightEventMelody().map((e) => ({ ...e, pitchLocked: true }));
      const result = reRollMelodyPitches(melody, 0.25, { rand: alea('reroll-all-locked') });
      expect(result).toEqual(melody);
    });

    it('a single pitchLocked event is not force-changed by the old floor-of-1', () => {
      const melody = [createMelodyEvent({ id: 'only', startStep: 1, noteIndex: 5, octave: 4, pitchLocked: true })];
      const result = reRollMelodyPitches(melody, 0.25, { rand: alea('reroll-single-locked') });
      expect(result).toBe(melody); // eligible pool is empty -> early-return the same reference
    });

    it('a partially-locked melody only ever selects unlocked events for change, across repeated seeded runs', () => {
      // First 4 locked, last 4 unlocked. ratio=1 requests changing "all" 8, but only 4 are eligible.
      const melody = makeEightEventMelody().map((e, i) => (i < 4 ? { ...e, pitchLocked: true } : e));
      for (let seedNum = 0; seedNum < 20; seedNum++) {
        const result = reRollMelodyPitches(melody, 1, { rand: alea(`reroll-partial-${seedNum}`) });
        for (let i = 0; i < 4; i++) {
          expect(result[i].noteIndex).toBe(melody[i].noteIndex); // locked events never change
          expect(result[i].pitchLocked).toBe(true); // and stay flagged locked
        }
      }
    });

    it('a melody with no locked events behaves identically to before this change (regression guard)', () => {
      const melody = makeEightEventMelody(); // no event has pitchLocked set
      const result = reRollMelodyPitches(melody, 0.25, { rand: alea('reroll-seed-1') });
      const changedCount = result.filter((e, i) => e.noteIndex !== melody[i].noteIndex).length;
      expect(changedCount).toBe(2); // same seed/ratio as the very first test in this file — same result
    });
  });
});
