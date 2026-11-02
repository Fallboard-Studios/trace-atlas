// ========================================
// IMPORTS
// ========================================
import { getAttenuationStyleNoiseMap } from './noiseMaps';
import { getUniformSeededVal } from './getSeededVal';
import { getBand } from '@/data/bands/loadingContext';

// ========================================
// FUNCTIONS
// ========================================

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
 * The band is the loaded world's tempo row, getBand('bpm') (band-table T22,
 * docs/specs/OFF_SCREEN.md assumption 15), so a theme may move it. Classic's
 * row (src/data/bands/classic.ts, `bpm`) is [40, 100], freely draggable
 * across the wider [20, 200] Audio Rig slider afterward.
 *
 * The data key is 'globalAudio.bpm', not the bare 'bpm' the spec first named
 * (on the old plain draw the bare key hashed to a spot where simplex noise is
 * nearly flat: 9 distinct tempos over 300 styles). The draw is even
 * (getUniformSeededVal, Even Seeded Draws T12), so every whole tempo in the
 * band is as likely as any other, the two ends half as likely (they round
 * from half a step).
 */
export function generateAttenuationStyleBpm(attenuationStyleId: string, attenuationStyleName: string): number {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  const band = getBand('bpm');
  const raw = getUniformSeededVal(noiseMap, 'globalAudio.bpm', 0, band.min, band.max);
  return Math.round(raw);
}
