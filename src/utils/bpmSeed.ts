// ========================================
// IMPORTS
// ========================================
import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';

// ========================================
// FUNCTIONS
// ========================================

/**
 * BPM's own seeded-default range — [40, 100] as integer BPM, a slower/
 * contemplative band fitting the ambient ocean soundscape. Freely draggable
 * across the wider [20, 200] Audio Rig slider range afterward. Unchanged by
 * the move from locale seeding to Attenuation Style seeding
 * (docs/specs/FREE_SYNC_TOGGLE.md §1.7).
 */
export const BPM_SEED_RANGE = { min: 40, max: 100 };

/**
 * Generate the deterministic audio BPM for an Attenuation Style, sampled from
 * that style's own noise map (getAttenuationStyleNoiseMap — name-derived, no
 * coordinate dependency). Rounded to the nearest integer — BPM precision is
 * integer-only. A pure function of (id, name): it takes no coordinates, so
 * moving around a world can never change it, and every Sync draw in
 * globalAudioSeed.ts can recompute the same tempo without it being threaded
 * through (docs/specs/FREE_SYNC_TOGGLE.md §1.7). Never stored on the
 * Attenuation Style itself; audioStore reseeds it on each style change.
 *
 * The data key is 'globalAudio.bpm', not the bare 'bpm' the spec first named:
 * getSeededVal samples the noise map at (hash(key), offset), and the bare key
 * hashes to a spot where simplex noise is nearly flat — measured over 300
 * styles it produced 9 distinct tempos (50–90), where 'globalAudio.bpm'
 * produced 36 (42–98). Same artifact the spec's risk table anticipated; the
 * distinct-values test in bpmSeed.test.ts guards it.
 */
export function generateAttenuationStyleBpm(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const raw = getSeededVal(noiseMap, 'globalAudio.bpm', 0, BPM_SEED_RANGE.min, BPM_SEED_RANGE.max);
  return Math.round(raw);
}
