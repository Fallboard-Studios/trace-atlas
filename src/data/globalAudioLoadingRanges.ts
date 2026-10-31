/**
 * Classic's global loading rows, by name (docs/specs/OFF_SCREEN.md assumption 15, band-table T22): the narrower
 * per-field seed-sampling sub-ranges a FRESH SEED can roll, never what the UI exposes or what the app can do. The rows
 * themselves live in the band table (src/data/bands/classic.ts), with each one's history; this file is their
 * projection, keyed by LoadingRangeKey, so the grid mirror still has a file: the values are a direct transcription of
 * docs/reference/GLOBAL_CHAIN_GRID.md's "Loading Range" column - that doc is the source of truth; if a value and the
 * grid ever disagree, the grid is right and the table has drifted.
 *
 * GLOBAL_AUDIO_SEED_RANGES (globalAudioSeedRanges.ts) stays the full/UI-matching range and is what lfoEngine.ts's
 * resolveLfoOutputRange keeps using - never this table. An LFO modulating a parameter needs to swing across that
 * parameter's entire usable range, not just the narrower window a fresh Attenuation Style is allowed to start in.
 *
 * The generators no longer read this file: globalAudioSeed.ts reads the loaded world's band through getBand(key)
 * (src/data/bands/loadingContext.ts), which is Classic's row until a world installs a theme.
 */
import { CLASSIC } from './bands/classic';
import { GLOBAL_AUDIO_SEED_RANGES, RETURN_FIELD_KEYS, type LoadingRangeKey } from './globalAudioSeedRanges';

export interface LoadingRange {
  min: number;
  max: number;
}

/** The most a fresh world may seed any colour Mix to, as a slider position. Crawford set it at 0.25 (Global Colour T14,
 *  2026-10-15: "don't allow any of the new color mixes to exceed .25 on load") to protect the whole fleet on the Pixel. The
 *  Classic Band Retune raised it to 0.35 (Decision 1 = B, 2026-10-21), and his listen the same day found the colour
 *  effects far too strong ("much more subtle"), so it is back at 0.25 and the bands sit well under it (0.1 to 0.2). The Mix
 *  is tapered at the node (squared), so a seeded Mix of this size is a wet of at most 0.0625. Saved sessions and share
 *  links carry whatever was hand-set and are not clamped to it. */
export const COLOUR_LOAD_MIX_MAX = 0.25;

/** Every seedable global key: GLOBAL_AUDIO_SEED_RANGES less the Returns (a Return has no row, so it can never be
 *  seeded, by type and by key). */
const LOADING_RANGE_KEYS = (Object.keys(GLOBAL_AUDIO_SEED_RANGES) as (keyof typeof GLOBAL_AUDIO_SEED_RANGES)[]).filter(
  (key): key is LoadingRangeKey => !(RETURN_FIELD_KEYS as readonly string[]).includes(key),
);

// Keyed by LoadingRangeKey, each row the very object CLASSIC holds. The 'delay.wet' and 'reverb.wet' rows left at Robot
// Effect Sends T1 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 5): the rooms' returns are a fixed 1, and the per-robot
// SEND bands those rows carried live in the table's send rows (robotSendLoadingRanges.ts projects them).
export const GLOBAL_AUDIO_LOADING_RANGES: Record<LoadingRangeKey, LoadingRange> = Object.fromEntries(
  LOADING_RANGE_KEYS.map((key) => [key, CLASSIC[key]]),
) as Record<LoadingRangeKey, LoadingRange>;
