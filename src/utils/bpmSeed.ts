// ========================================
// IMPORTS
// ========================================
import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';
import { getBand } from '@/data/bands/loadingContext';
import { CLASSIC } from '@/data/bands/classic';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Classic's tempo band — [40, 100] as integer BPM, a slower/contemplative band fitting the ambient ocean soundscape,
 * freely draggable across the wider [20, 200] Audio Rig slider range afterward; unchanged by the move from locale
 * seeding to Attenuation Style seeding (docs/specs/FREE_SYNC_TOGGLE.md §1.7). The row lives in the band table
 * (src/data/bands/classic.ts, `bpm`) and the generator reads the loaded world's band through getBand('bpm')
 * (band-table T22, docs/specs/OFF_SCREEN.md assumption 15), so a theme may move it. This name is the Classic row, for
 * the tests and the Audio Rig's slider note.
 */
export const BPM_SEED_RANGE = CLASSIC.bpm;

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
  const band = getBand('bpm');
  const raw = getSeededVal(noiseMap, 'globalAudio.bpm', 0, band.min, band.max);
  return Math.round(raw);
}
