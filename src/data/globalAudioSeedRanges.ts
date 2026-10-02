/**
 * Per-field FULL/UI-matching ranges for GlobalAudioSettings — this is the
 * "Unit / Range" column, not the narrower "Loading Range" column
 * (src/data/globalAudioLoadingRanges.ts). docs/reference/GLOBAL_CHAIN_GRID.md
 * is the source of truth for both; this file is a mechanical transcription.
 *
 * min/max mirror the doc-comment ranges already in src/types/globalAudio.ts —
 * do not change one without the other. `scale` is 'log' only for the fields
 * GLOBAL_CHAIN_GRID.md's UI column marks "SLIDER (Logarithmic)"; everything
 * else (including EQ3's center-zero sliders, which are a UI presentation
 * choice, not a sampling one) is 'linear'.
 *
 * Consumed by globalAudioSeed.ts to seed-generate the global FX chain from
 * the Attenuation Style noise map, and by lfoEngine.ts's resolveLfoOutputRange (the full
 * range an LFO can swing a modulated parameter across — never the narrower
 * loading range).
 */

export type SeedScale = 'log' | 'linear';

export interface SeedRange {
  min: number;
  max: number;
  scale: SeedScale;
  step?: number;
}

export type GlobalAudioSeedFieldKey =
  | 'compressor.threshold'
  | 'compressor.ratio'
  | 'compressor.attack'
  | 'compressor.release'
  | 'compressor.knee'
  | 'eq3.low'
  | 'eq3.mid'
  | 'eq3.high'
  | 'filterLPF.frequency'
  | 'filterLPF.Q'
  | 'filterHPF.frequency'
  | 'filterHPF.Q'
  | 'delay.delayTime'
  | 'delay.feedback'
  | 'delay.wet'
  | 'reverb.decay'
  | 'reverb.preDelay'
  | 'reverb.wet'
  | 'limiter.threshold';

// V2: Chorus (rate/depth/delayTime/feedback/wet) removed entirely — the
// effect doesn't suit this music. reverb.dampening removed — Tone.Reverb has
// no such property; it was a dead cast in globalFx.ts since Phase 0.
// limiter.threshold added — Tone.Limiter's only controllable param.
// See docs/reference/GLOBAL_CHAIN_GRID.md, the source of truth for every
// value below.
export const GLOBAL_AUDIO_SEED_RANGES: Record<GlobalAudioSeedFieldKey, SeedRange> = {
  'compressor.threshold': { min: -60, max: 0, scale: 'linear', step: 1 },
  'compressor.ratio': { min: 1, max: 20, scale: 'linear', step: 1 },
  'compressor.attack': { min: 0.001, max: 0.2, scale: 'log' },
  'compressor.release': { min: 0.01, max: 1, scale: 'log' },
  'compressor.knee': { min: 0, max: 40, scale: 'linear', step: 1 },

  'eq3.low': { min: -12, max: 12, scale: 'linear', step: 0.5 },
  'eq3.mid': { min: -12, max: 12, scale: 'linear', step: 0.5 },
  'eq3.high': { min: -12, max: 12, scale: 'linear', step: 0.5 },

  'filterLPF.frequency': { min: 20, max: 20000, scale: 'log' },
  'filterLPF.Q': { min: 0.1, max: 20, scale: 'log' },
  'filterHPF.frequency': { min: 20, max: 20000, scale: 'log' },
  'filterHPF.Q': { min: 0.1, max: 20, scale: 'log' },

  'delay.delayTime': { min: 0, max: 10, scale: 'linear', step: 0.001 },
  'delay.feedback': { min: 0, max: 0.95, scale: 'linear', step: 0.01 },
  'delay.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  'reverb.decay': { min: 0.1, max: 10, scale: 'log' },
  'reverb.preDelay': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'reverb.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  'limiter.threshold': { min: -20, max: 0, scale: 'linear', step: 1 },
};
