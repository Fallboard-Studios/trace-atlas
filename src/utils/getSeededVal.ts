// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import { getGlobalAttenuationStyleSeedOverride } from './seedUtils';

// ========================================
// FUNCTIONS
// ========================================

/**
 * Convert a stable dataId string into a deterministic float in [0, 1].
 * This is the x-axis value passed to a noise map for a given data key.
 *
 * **Hot-path callers (e.g. AudioEngine scheduling) must call this ONCE at
 * module scope and cache the result.** `alea(dataId)()` involves string
 * hashing — calling it hundreds of times per second is measurably slower
 * than Math.random() and can delay the Tone.js scheduling callback.
 *
 * Pattern for audio hot paths:
 *   // module scope — computed once at import time:
 *   const MY_KEY_X = precomputeDataX('my.data.key');
 *
 *   // inside the hot path:
 *   const value = noiseMap(MY_KEY_X, offset);
 */
export function precomputeDataX(dataId: string): number {
  const global = getGlobalAttenuationStyleSeedOverride();
  const key = global ? `${global}:${dataId}` : dataId;
  return alea(key)();
}

/**
 * Sample a locale noise map at a deterministic (dataId, offset) position
 * and map the [-1, 1] result to [min, max].
 *
 * **Do not call this on the audio scheduling hot path.** Use
 * `precomputeDataX` to cache the x value at module scope and call
 * `noiseMap(x, offset)` directly inside the scheduling callback.
 *
 * @param noiseMap  The locale's 2D noise function (from noiseMaps registry)
 * @param dataId    A stable, unique string key — use the Zustand state key path
 *                  (e.g. 'robots.audioAttributes.waveform') so values are
 *                  consistent across app instances
 * @param offset    Array index for per-element variation (e.g. robot spawn order); default 0
 * @param min       Output range minimum; default 0
 * @param max       Output range maximum; default 1
 */
export function getSeededVal(
  noiseMap: NoiseFunction2D,
  dataId: string,
  offset = 0,
  min = 0,
  max = 1,
): number {
  const x = precomputeDataX(dataId);
  const raw = noiseMap(x, offset); // simplex noise in [-1, 1]
  return min + ((raw + 1) / 2) * (max - min);
}

/** Added to the offset for getUniformSeededVal's three samples — arbitrary, non-integer, far apart. */
const UNIFORM_SAMPLE_SHIFTS = [0, 137.42, 911.77] as const;

/**
 * A uniform [0, 1) draw that varies from world to world at every offset. One getSeededVal sample
 * is bell-curved, and at offset 0 it takes only ~3 values across all worlds; three samples at
 * spread offsets, hashed together through alea(), fix both. Use it wherever one seeded draw picks
 * a world-level choice or position (district, stations, coverage top-ups).
 */
export function getUniformSeededVal(noiseMap: NoiseFunction2D, dataId: string, offset = 0): number {
  const samples = UNIFORM_SAMPLE_SHIFTS.map((shift) => getSeededVal(noiseMap, dataId, offset + shift, 0, 1));
  return alea(samples.join(':'))();
}
