// ========================================
// decorTier (docs/specs/JOB_DECORATION.md Assumption 9, Task 5)
// ========================================
// How much of a job's decoration to draw, by the Robot Load dial: 'none' (no group at all), 'cheap'
// (the lighter variants) or 'all'. The plumbing ships now and the thresholds don't bind: both
// ladder rungs are 'all' today. If the perf gate misses, the ladder is Light 'none', Standard
// 'cheap', Full 'all', changed in the two DECOR_TIER_* constants only. The fleet, its audibility and
// its count are never touched.
//
// Pure. The work loop reads robotLoad once at job start, beside bpm, and hands the tier to
// buildJobTimeline; nothing in a tween callback reads a store.

// ========================================
// IMPORTS
// ========================================
import { AUDIO_LOAD_PRESETS, DECOR_TIER_BELOW_FULL, DECOR_TIER_BELOW_STANDARD } from '../../../constants';

// ========================================
// TYPES
// ========================================
export type DecorTier = 'none' | 'cheap' | 'all';

/** The tier below Standard (Light and everything under it), and the tier from Standard up to
 *  below Full. Full itself is always 'all'. */
export interface DecorTierLadder {
  belowStandard: DecorTier;
  belowFull: DecorTier;
}

// ========================================
// CONSTANTS
// ========================================
const SHIPPED_LADDER: DecorTierLadder = { belowStandard: DECOR_TIER_BELOW_STANDARD, belowFull: DECOR_TIER_BELOW_FULL };

// ========================================
// EXPORTS
// ========================================
/** The tier for a Robot Load. A value between presets takes the lower preset's tier. Out-of-range
 *  loads need no clamp: below 0 is under Standard, above 1 is Full, and NaN fails both comparisons
 *  to land on Full, as the slider's own clamp does. `ladder` is the shipped constants; tests
 *  substitute their own. */
export function decorTier(robotLoad: number, ladder: DecorTierLadder = SHIPPED_LADDER): DecorTier {
  if (robotLoad < AUDIO_LOAD_PRESETS.standard) return ladder.belowStandard;
  if (robotLoad < AUDIO_LOAD_PRESETS.full) return ladder.belowFull;
  return 'all';
}
