// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { generateUUID } from '../utils/randomId';
import type { MelodyEvent, NoteDuration } from '../types/Robot';
import {
  RHYTHMIC_DENSITY_MIN,
  RHYTHMIC_DENSITY_MAX,
  RHYTHMIC_MOTIF_LENGTH_MIN,
  RHYTHMIC_MOTIF_LENGTH_MAX,
  NOTE_VARIANCE_MIN,
  NOTE_VARIANCE_MAX,
  PITCH_REPEAT_MIN,
  PITCH_REPEAT_MAX,
  NOTE_PALETTE_SIZE,
} from '../constants';

// ========================================
// TYPES
// ========================================
/** A 1–8 magnitude paired with an on/off toggle — shared shape for Motif Length and Note Variance. */
export interface ToggleValue {
  active: boolean;
  value: number;
}

/**
 * Options for generateMelodyForRobot.
 * Uses explicit octaveMin/octaveMax and controls the motif-repetition density algorithm.
 */
export interface GenerateMelodyForRobotOptions {
  /** Minimum octave (inclusive). */
  octaveMin: number;
  /** Maximum octave (inclusive). Must be >= octaveMin. */
  octaveMax: number;
  /**
   * Fill-rate percentage (0–100) of either the full measure (motif inactive) or
   * one motif cell (motif active). Converted to an onset count internally, with
   * a hard floor of 1 — no roll ever produces a silent melody.
   * Default: DEFAULT_RHYTHMIC_DENSITY.
   */
  rhythmicDensity?: number;
  /**
   * Motif tiling toggle. When `active` is false, onsets scatter freely across
   * the full measure and `value` is inert. When true, a `value`-length
   * (1–8 sixteenth notes) cell tiles across the measure and truncates at
   * measure end. Default: DEFAULT_RHYTHMIC_MOTIF_LENGTH.
   */
  rhythmicMotifLength?: ToggleValue;
  /**
   * Number of 16th-note subdivisions per measure.
   * Default: 16.
   */
  subdivisions?: number;
  /**
   * Integer seed for deterministic RNG. When provided, a seeded PRNG is used
   * instead of Math.random — useful for reproducible tests.
   */
  seed?: number;
  /**
   * RNG function override. When provided, used instead of `seed` or `Math.random`.
   * Useful when callers supply a deterministic noise-map-based PRNG.
   */
  rand?: () => number;
  /**
   * Weighted note-selection toggle. When `active` is false, notes are picked
   * unweighted from all 8 indices and `value` is inert. When true, selection
   * is a weighted slice of `value` (1–8) notes from the pitch array.
   * Default: DEFAULT_NOTE_VARIANCE.
   */
  noteVariance?: ToggleValue;
  /**
   * 0-100. Increasingly locks a tiled motif's repeated cells to the base cell's pitches as it
   * rises (100 = full verbatim repetition). Inert whenever `rhythmicMotifLength.active` is false.
   * Default: DEFAULT_PITCH_REPEAT.
   */
  pitchRepeat?: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Probability that a successive note jumps more than one octave (when range allows). */
const OCTAVE_JUMP_CHANCE = 0.15;

const NOTE_INDEX_WEIGHTS = [0.35, 0.2, 0.15, 0.1, 0.07, 0.06, 0.04, 0.03];

/**
 * Default rhythmic density (0-100% fill rate). A clean round mid-point of the
 * new range; not a preserved value from the old 4-12 onset-count scale.
 */
export const DEFAULT_RHYTHMIC_DENSITY = 50;
/**
 * Default motif toggle — active at the maximum 1-8 value. Preserves the old
 * always-tiling-at-8 default behavior exactly (motif tiling used to have no
 * off switch and always defaulted to a length-8 cell).
 */
export const DEFAULT_RHYTHMIC_MOTIF_LENGTH: ToggleValue = { active: true, value: 8 };
/**
 * Default note-variance toggle — inactive. value: 0 satisfies the value > 0 ⟺ active
 * invariant (docs/specs/STEPPER_TO_SLIDER.md) — active: false paired with a nonzero
 * value would violate it. Preserves the old noteVariance === 0 / unweighted default
 * exactly.
 */
export const DEFAULT_NOTE_VARIANCE: ToggleValue = { active: false, value: 0 };
/**
 * Default Pitch Repeat lock strength — 0 (no locking), the neutral/off state. Unlike the
 * mid-range defaults above, 0 isn't a compromise value; it's what makes generation at the
 * default statistically indistinguishable from having no Pitch Repeat at all.
 */
export const DEFAULT_PITCH_REPEAT = 0;
/** Default subdivision grid per measure (16 sixteenth notes in 4/4). */
export const DEFAULT_SUBDIVISIONS = 16;

// ========================================
// EXPORTS
// ========================================

/**
 * Pick random indices from an array without replacement.
 * @param arr Array to pick from
 * @param count Number of items to pick
 * @param rand Optional RNG function (default: Math.random)
 * @returns Array of picked indices
 */
export function pickRandomIndices(arr: unknown[], count: number, rand: () => number = Math.random): number[] {
  const indices = Array.from({ length: arr.length }, (_, i) => i);
  const picked: number[] = [];

  for (let i = 0; i < Math.min(count, indices.length); i++) {
    const idx = Math.floor(rand() * (indices.length - i));
    picked.push(indices[idx]);
    // Swap to end to remove from available pool
    [indices[idx], indices[indices.length - 1 - i]] = [indices[indices.length - 1 - i], indices[idx]];
  }

  return picked;
}

// ========================================
// MOTIF ALGORITHM HELPERS
// ========================================

/**
 * Pick `count` unique integers from [0, n) via Fisher-Yates partial shuffle.
 * Internal helper — use buildMotifOnsets for the public API.
 */
function pickUniqueInRange(n: number, count: number, rand: () => number): number[] {
  const pool = Array.from({ length: n }, (_, i) => i);
  const result: number[] = [];
  const pickCount = Math.min(count, n);
  for (let i = 0; i < pickCount; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    result.push(pool[i]);
  }
  return result;
}

/**
 * Build sorted onset positions (0-indexed, 0..subdivisions-1) for one measure
 * using the motif-repetition algorithm.
 *
 * Algorithm:
 *   M = clamp(rhythmicMotifLength, 1, subdivisions)
 *   repeats = floor(subdivisions / M)
 *
 *   If repeats >= 2 (motif path):
 *     K = max(1, floor(density / repeats))  — onsets per motif copy
 *     R = density - K * repeats             — extra onsets, distributed to first R copies
 *     Generate one base motif of K unique positions in [0, M), sorted.
 *     Tile it across the measure; first R copies get one extra position each.
 *     Truncate any partial motif at subdivisions.
 *     K is floored to a minimum of 1, so when density < repeats (a short motif
 *     relative to density), R goes negative and tiling alone overshoots density —
 *     the result is trimmed back down to exactly `density` onsets in that case.
 *
 *   Else (non-repeating fallback):
 *     Pick density unique positions from [0, subdivisions).
 *
 * @param rhythmicDensity    Target onset count (4–12)
 * @param rhythmicMotifLength Motif length in subdivision grid units (1..subdivisions)
 * @param subdivisions       Grid units per measure (default: 16)
 * @param rand               RNG function
 */
export function buildMotifOnsets(
  rhythmicDensity: number,
  rhythmicMotifLength: number,
  subdivisions: number,
  rand: () => number,
): number[] {
  const M = Math.max(1, Math.min(rhythmicMotifLength, subdivisions));
  const repeats = Math.floor(subdivisions / M);

  if (repeats >= 2) {
    const K = Math.max(1, Math.floor(rhythmicDensity / repeats));
    const R = Math.max(0, rhythmicDensity - K * repeats);

    const baseMotif = pickUniqueInRange(M, K, rand).sort((a, b) => a - b);

    const onsetSet = new Set<number>();
    for (let rep = 0; rep < repeats; rep++) {
      const offset = rep * M;
      const motifForRep = [...baseMotif];

      // First R repeats get one extra position not in the base motif
      if (rep < R) {
        const usedInBase = new Set(baseMotif);
        const available = Array.from({ length: M }, (_, i) => i).filter(p => !usedInBase.has(p));
        if (available.length > 0) {
          motifForRep.push(available[Math.floor(rand() * available.length)]);
          motifForRep.sort((a, b) => a - b);
        }
      }

      for (const pos of motifForRep) {
        const gridPos = offset + pos;
        // Truncate: do not emit positions beyond the measure
        if (gridPos < subdivisions) onsetSet.add(gridPos);
      }
    }

    const combined = Array.from(onsetSet).sort((a, b) => a - b);
    let result: number[];
    if (combined.length <= rhythmicDensity) {
      result = combined;
    } else {
      // K's minimum of 1 per repeat window overshot the target density (short
      // motif relative to density) — trim back down to exactly rhythmicDensity.
      const keepIndices = pickUniqueInRange(combined.length, rhythmicDensity, rand).sort((a, b) => a - b);
      result = keepIndices.map(i => combined[i]);
    }

    // Tail-cell pass (untruncating), appended AFTER the trim check/branch above — both are
    // otherwise untouched. The leftover `subdivisions - repeats * M` steps past the last full
    // repeat never receive an onset from the loop above; copy whichever base-motif positions
    // fall inside that leftover span into one final partial cell — a deterministic subset of the
    // same base motif, not a fresh random draw. This is bonus fill from previously-dead grid
    // space and deliberately does NOT count against `rhythmicDensity` — it can push the final
    // onset count above the requested density, and is never itself trimmed.
    const tailLength = subdivisions - repeats * M;
    if (tailLength > 0) {
      const tailOffset = repeats * M;
      // No Set/re-sort needed: `result` is already ascending and every tail position
      // (tailOffset + pos) is strictly greater than every element already in it — tailOffset
      // (= repeats * M) exceeds any onset from a non-tail repeat by construction, and baseMotif
      // is itself sorted ascending — so a plain concat preserves sort order with no duplicates.
      const tailPositions = baseMotif.filter((pos) => pos < tailLength).map((pos) => tailOffset + pos);
      result = result.concat(tailPositions);
    }

    return result;
  }

  // Non-repeating fallback
  const N = Math.min(rhythmicDensity, subdivisions);
  return pickUniqueInRange(subdivisions, N, rand).sort((a, b) => a - b);
}

/**
 * Determine which onsets in a tiled-motif melody should copy the base cell's noteIndex
 * verbatim, per Pitch Repeat's staged/seeded locking model (docs/intent/pitch-repeat.md,
 * docs/specs/PITCH_REPEAT.md §4). Returns a boolean per onset, same order/length as `onsets`.
 * Repeat-0 (base cell) onsets are always `false` — they're the copy source, never a locked
 * target.
 *
 * Two independent seeded permutations, drawn once from `rand`:
 *   - `positionOrder`: the order in which the base cell's K onset positions lock in, one per
 *     `100/K`-wide stage of the `pitchRepeatPct` range. Not always position-0-first.
 *   - `repeatOrder`: which non-base repeats lock first within a stage, shared across every
 *     position (drawn once, not re-rolled per position) — a fixed-count prefix of this order is
 *     locked per position/stage, not an independent per-repeat coin flip.
 * A position's applicable repeats exclude the tail repeat when that position falls at or past
 * `tailLength` (the tail cell has no onset there to lock) — see buildMotifOnsets' tail-cell pass.
 *
 * `pitchRepeatPct >= PITCH_REPEAT_MAX` short-circuits every stage's fraction to exactly 1 up
 * front, bypassing the per-stage `100/K` float arithmetic (not always exact, e.g. K=3 repeats
 * 33.3̄) so full lock is guaranteed rather than left to incidental float behavior.
 */
export function computePitchLockPlan(
  onsets: number[],
  motifLength: number,
  subdivisions: number,
  pitchRepeatPct: number,
  rand: () => number,
): boolean[] {
  const repeats = Math.floor(subdivisions / motifLength);
  const tailLength = subdivisions - repeats * motifLength;
  const totalRepeats = repeats + (tailLength > 0 ? 1 : 0);

  const basePositions = onsets.filter((o) => o < motifLength).sort((a, b) => a - b);
  const K = basePositions.length;
  // `repeats < 2` mirrors buildMotifOnsets' own gate for the non-tiled fallback path exactly —
  // onsets aren't tiled-motif positions at all below that threshold, so there's nothing valid to
  // lock. (Strictly subsumes `totalRepeats <= 1`: totalRepeats >= repeats, so this never returns
  // early in a case the old check wouldn't have — it only additionally catches repeats===1 with a
  // tail, which `totalRepeats <= 1` alone let through.)
  if (K === 0 || repeats < 2) {
    return onsets.map(() => false);
  }

  const positionOrder = pickUniqueInRange(K, K, rand);
  const repeatOrder = pickUniqueInRange(totalRepeats - 1, totalRepeats - 1, rand).map((i) => i + 1);

  const forceFullLock = pitchRepeatPct >= PITCH_REPEAT_MAX;
  const stageWidth = 100 / K;
  const locked = new Set<string>(); // `${position}:${repeatIdx}`

  positionOrder.forEach((posIdx, stageNum) => {
    const position = basePositions[posIdx];
    // Only repeats that actually contain this position — the tail repeat may not (see doc comment).
    const applicable = repeatOrder.filter((r) => r < repeats || (r === repeats && position < tailLength));
    if (applicable.length === 0) return;

    let fraction: number;
    if (forceFullLock) {
      fraction = 1;
    } else {
      const stageStart = stageNum * stageWidth;
      const stageEnd = stageStart + stageWidth;
      fraction = pitchRepeatPct <= stageStart ? 0
        : pitchRepeatPct >= stageEnd ? 1
        : (pitchRepeatPct - stageStart) / stageWidth;
    }

    const n = Math.round(fraction * applicable.length);
    for (let i = 0; i < n; i++) locked.add(`${position}:${applicable[i]}`);
  });

  return onsets.map((o) => {
    const repeatIdx = Math.floor(o / motifLength);
    if (repeatIdx === 0) return false;
    return locked.has(`${o % motifLength}:${repeatIdx}`);
  });
}

/**
 * Map a duration in 16th-note subdivision grid units to the nearest NoteDuration.
 *   ≤ 1  → '16n'
 *   2–3  → '8n'
 *   4–6  → '4n'
 *   7+   → '2n'
 *
 * Kept as a general-purpose quantization utility; `generateMelodyForRobot` uses
 * `pickDurationForGap` instead so notes can be shorter than the full gap to the
 * next onset (leaving rests) rather than always filling it.
 */
export function gridUnitsToDuration(units: number): NoteDuration {
  if (units <= 1) return '16n';
  if (units <= 3) return '8n';
  if (units <= 6) return '4n';
  return '2n';
}

/** Grid-unit length of each representable note duration, used by pickDurationForGap. */
const DURATION_UNIT_VALUES: Array<[number, NoteDuration]> = [
  [1, '16n'],
  [2, '8n'],
  [4, '4n'],
  [8, '2n'],
];

/**
 * Choose a note duration that fits within the available grid-unit gap to the next
 * onset (or measure end), leaving any remainder as a rest rather than always filling
 * the whole gap. Weighted toward longer durations (weight = unit value), so shorter
 * notes — especially `16n` — are chosen less often while remaining possible.
 *
 * @param availableUnits Grid units available before the next onset. Always >= 1.
 * @param rand Optional RNG function (default: Math.random)
 */
export function pickDurationForGap(availableUnits: number, rand: () => number = Math.random): NoteDuration {
  const candidates = DURATION_UNIT_VALUES.filter(([units]) => units <= availableUnits);
  const totalWeight = candidates.reduce((sum, [units]) => sum + units, 0);
  let r = rand() * totalWeight;
  for (const [units, duration] of candidates) {
    r -= units;
    if (r <= 0) return duration;
  }
  return candidates[candidates.length - 1][1];
}

// ========================================
// MELODY GENERATION
// ========================================

/**
 * Generates a melody for a robot using the motif-repetition density algorithm.
 * Onset positions are built by buildMotifOnsets() and durations are computed
 * as the gap to the next onset.
 */
export function generateMelodyForRobot(
  opts: GenerateMelodyForRobotOptions
): MelodyEvent[] {
  const rand = opts.rand ?? (opts.seed !== undefined ? alea(String(opts.seed)) : Math.random);
  const subdivisions = opts.subdivisions ?? DEFAULT_SUBDIVISIONS;
  const densityPct = Math.max(
    RHYTHMIC_DENSITY_MIN,
    Math.min(RHYTHMIC_DENSITY_MAX, opts.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY),
  );
  const motif = opts.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
  const octMin = Math.min(opts.octaveMin, opts.octaveMax);
  const octMax = Math.max(opts.octaveMin, opts.octaveMax);

  // Density is a fill-rate % of either one motif cell (tiling on) or the whole
  // measure (tiling off). buildMotifOnsets' own `rhythmicDensity` parameter is a
  // TOTAL onset count across the tiled measure, not a per-cell count — so when
  // tiling is on, the per-cell fill is multiplied back out by the repeat count
  // before calling it, keeping every repeat identically filled (no remainder
  // distributed unevenly, unlike the old total-onset-count model).
  let onsets: number[];
  // Resolved only when motif tiling is active (`motif.active` stays the single source of truth
  // for that below — this is just the value, not a second independent flag); Pitch Repeat is
  // gated inert whenever tiling is off (no cell concept to lock pitches within).
  let motifLength: number | null = null;
  if (motif.active) {
    motifLength = Math.max(RHYTHMIC_MOTIF_LENGTH_MIN, Math.min(RHYTHMIC_MOTIF_LENGTH_MAX, Math.trunc(motif.value)));
    const repeats = Math.max(1, Math.floor(subdivisions / motifLength));
    const perCell = Math.max(1, Math.round((densityPct / 100) * motifLength));
    onsets = buildMotifOnsets(perCell * repeats, motifLength, subdivisions, rand);
  } else {
    const onsetCount = Math.max(1, Math.round((densityPct / 100) * subdivisions));
    onsets = buildMotifOnsets(onsetCount, subdivisions, subdivisions, rand);
  }

  // Pitch Repeat: which onsets copy the base cell's noteIndex verbatim (docs/specs/PITCH_REPEAT.md).
  // Inert (all-false, no `computePitchLockPlan` call at all) whenever motif tiling is off.
  const pitchRepeatPct = Math.max(
    PITCH_REPEAT_MIN,
    Math.min(PITCH_REPEAT_MAX, opts.pitchRepeat ?? DEFAULT_PITCH_REPEAT),
  );
  const lockPlan: boolean[] = motif.active
    ? computePitchLockPlan(onsets, motifLength!, subdivisions, pitchRepeatPct, rand)
    : onsets.map(() => false);

  let currentOctave = octMin + Math.floor(rand() * (octMax - octMin + 1));
  const melody: MelodyEvent[] = [];

  // Note-variance state
  const variance = opts.noteVariance ?? DEFAULT_NOTE_VARIANCE;
  const noteVarianceValue = Math.max(NOTE_VARIANCE_MIN, Math.min(NOTE_VARIANCE_MAX, Math.trunc(variance.value)));
  const uniqueSet = new Set<number>();
  // Lazily built below on first use when noteVariance === 8 (shuffled draw-without-replacement pool).
  let withoutReplacementPool: number[] | null = null;
  // Base-cell (repeat 0) noteIndex per position, keyed by grid position — populated as repeat-0
  // events are pushed (they always sort first, before any later repeat's onsets) so a locked
  // onset later in the loop can copy its base position's already-chosen noteIndex verbatim.
  const basePositionNoteIndex = new Map<number, number>();

  for (let i = 0; i < onsets.length; i++) {
    // 15% chance to jump to a non-adjacent octave when range allows
    if (i > 0 && rand() < OCTAVE_JUMP_CHANCE) {
      const jumpCandidates: number[] = [];
      for (let oct = octMin; oct <= octMax; oct++) {
        if (Math.abs(oct - currentOctave) > 1) jumpCandidates.push(oct);
      }
      if (jumpCandidates.length > 0) {
        currentOctave = jumpCandidates[Math.floor(rand() * jumpCandidates.length)];
      }
    }

    // Duration = gap to next onset; last onset fills to measure end
    const nextOnset = i < onsets.length - 1 ? onsets[i + 1] : subdivisions;
    const durationUnits = nextOnset - onsets[i];

    // Pick noteIndex honoring the noteVariance toggle — unless Pitch Repeat has locked this
    // onset, in which case it copies the base cell's noteIndex verbatim, bypassing Note Variance
    // entirely (and not touching uniqueSet/withoutReplacementPool), so unlocked onsets later in
    // the same melody see identical selection state to today's unmodified run.
    let noteIndex: number;
    if (lockPlan[i]) {
      noteIndex = basePositionNoteIndex.get(onsets[i] % motifLength!)!;
    } else if (!variance.active) {
      // Off: unweighted, unconstrained random pick from all 8 indices — deliberately
      // NOT pickWeightedIndex(); "off" now means no weighting at all, not just no
      // uniqueness constraint (a behavior change from the old noteVariance === 0
      // default, which was still weighted).
      noteIndex = Math.floor(rand() * NOTE_PALETTE_SIZE);
    } else if (noteVarianceValue === NOTE_VARIANCE_MAX) {
      if (!withoutReplacementPool || withoutReplacementPool.length === 0) {
        const pool = Array.from({ length: NOTE_PALETTE_SIZE }, (_, i) => i);
        withoutReplacementPool = [];
        while (pool.length > 0) {
          const j = Math.floor(rand() * pool.length);
          withoutReplacementPool.push(pool.splice(j, 1)[0]);
        }
      }
      noteIndex = withoutReplacementPool.shift()!;
      uniqueSet.add(noteIndex);
    } else {
      if (uniqueSet.size < noteVarianceValue) {
        // prefer selecting notes not yet in the set (uniform among remaining)
        const remaining = Array.from({ length: 8 }, (_, i) => i).filter((i) => !uniqueSet.has(i));
        noteIndex = remaining[Math.floor(rand() * remaining.length)];
        uniqueSet.add(noteIndex);
      } else {
        // choose among established set — weighted by NOTE_INDEX_WEIGHTS restricted to set
        const setArray = Array.from(uniqueSet);
        const totalW = setArray.reduce((s, idx) => s + NOTE_INDEX_WEIGHTS[idx], 0);
        let r = rand() * totalW;
        noteIndex = setArray[setArray.length - 1];
        for (const idx of setArray) {
          r -= NOTE_INDEX_WEIGHTS[idx];
          if (r <= 0) { noteIndex = idx; break; }
        }
      }
    }

    if (motif.active && onsets[i] < motifLength!) {
      basePositionNoteIndex.set(onsets[i], noteIndex);
    }

    melody.push({
      id: generateUUID(),
      startStep: onsets[i] + 1, // 1-indexed to match existing MelodyEvent convention
      length: pickDurationForGap(durationUnits, rand),
      noteIndex,
      octave: currentOctave,
      ...(lockPlan[i] ? { pitchLocked: true } : {}),
    });
  }

  return melody;
}

/**
 * Picks a weighted note index (0-7).
 * Lower indices are more common (35%, 20%, 15%, etc.)
 */
export function pickWeightedIndex(rand: () => number = Math.random): number {
  const r = rand();
  let acc = 0;

  for (let i = 0; i < NOTE_INDEX_WEIGHTS.length; i++) {
    acc += NOTE_INDEX_WEIGHTS[i];
    if (r <= acc) return i;
  }

  return NOTE_INDEX_WEIGHTS.length - 1;
}

/**
 * Re-roll a seeded ratio of a melody's note pitches, leaving rhythm untouched.
 * Used by robotSystems.ts every time a robot lands on Docked — `startStep`,
 * `length`, and `octave` are never modified, only `noteIndex`. Reuses
 * `pickRandomIndices` (which events change) and `pickWeightedIndex` (the new
 * pitch, when variance is active) rather than inventing new selection logic.
 *
 * @param melody Melody events to re-roll pitches within.
 * @param ratio Fraction (0-1) of events to change. Rounded, floored at 1 —
 *   a re-roll on a non-empty melody always changes at least one event.
 * @param opts.noteVariance When `active`, new pitches are weighted via
 *   `pickWeightedIndex`; otherwise unweighted (`Math.floor(rand() * 8)`),
 *   matching `generateMelodyForRobot`'s own off/on split.
 * @param opts.rand Seeded RNG — never Math.random (see CLAUDE.md).
 * @returns A new array; unchanged events are unchanged, changed events are new objects with only `noteIndex` different.
 *
 * Pitch Repeat (docs/specs/PITCH_REPEAT.md): `pitchLocked` events are excluded from the candidate
 * pool entirely — locking should visibly resist drift, not quietly compensate to preserve a fixed
 * amount of change. The "always changes at least 1" floor only applies once the eligible
 * (unlocked) pool is non-empty; a fully-locked melody re-rolls zero events.
 */
export function reRollMelodyPitches(
  melody: MelodyEvent[],
  ratio: number,
  opts: { noteVariance?: ToggleValue; rand: () => number },
): MelodyEvent[] {
  if (melody.length === 0) return melody;

  const eligible = melody.map((_, i) => i).filter((i) => !melody[i].pitchLocked);
  if (eligible.length === 0) return melody;

  const count = Math.max(1, Math.min(Math.round(melody.length * ratio), eligible.length));
  const pickedPositions = pickRandomIndices(eligible, count, opts.rand);
  const changeIndices = new Set(pickedPositions.map((p) => eligible[p]));

  return melody.map((event, i) => {
    if (!changeIndices.has(i)) return event;
    const noteIndex = opts.noteVariance?.active
      ? pickWeightedIndex(opts.rand)
      : Math.floor(opts.rand() * 8);
    return { ...event, noteIndex };
  });
}
