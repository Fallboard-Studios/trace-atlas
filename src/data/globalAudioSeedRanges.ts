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
  | 'distortion.amount'
  | 'distortion.wet'
  | 'chebyshev.order'
  | 'chebyshev.wet'
  | 'bitCrusher.bits'
  | 'bitCrusher.wet'
  | 'colourRoom.wet'
  | 'autoWah.baseFrequency'
  | 'autoWah.octaves'
  | 'autoWah.sensitivity'
  | 'autoWah.Q'
  | 'autoWah.gain'
  | 'autoWah.follower'
  | 'autoWah.wet'
  | 'phaser.rate'
  | 'phaser.octaves'
  | 'phaser.baseFrequency'
  | 'phaser.stages'
  | 'phaser.Q'
  | 'phaser.wet'
  | 'chorus.rate'
  | 'chorus.delayTime'
  | 'chorus.depth'
  | 'chorus.spread'
  | 'chorus.feedback'
  | 'chorus.wet'
  | 'tremolo.rate'
  | 'tremolo.depth'
  | 'tremolo.spread'
  | 'tremolo.wet'
  | 'vibrato.rate'
  | 'vibrato.depth'
  | 'vibrato.wet'
  | 'frequencyShifter.shift'
  | 'frequencyShifter.wet'
  | 'stereoWidener.width'
  | 'limiter.threshold';

/**
 * The keys that are a room's RETURN level, never seeded (docs/specs/ROBOT_EFFECT_SENDS.md assumption 5). They stay seed
 * field keys, because the drawer bounds, the clamp and the session quantiser read their full range below; they have no
 * row in GLOBAL_AUDIO_LOADING_RANGES, which is keyed by LoadingRangeKey, so a Return can never be seeded, by type.
 * The Chorus and Frequency Shifter Mixes joined at Robot Effect Sends T8, when their effects became rooms.
 */
export const RETURN_FIELD_KEYS = ['reverb.wet', 'delay.wet', 'chorus.wet', 'frequencyShifter.wet', 'colourRoom.wet'] as const;
export type ReturnFieldKey = (typeof RETURN_FIELD_KEYS)[number];
export type LoadingRangeKey = Exclude<GlobalAudioSeedFieldKey, ReturnFieldKey>;

// The Chorus, removed in V2, is back with the Global Pedals
// (docs/specs/GLOBAL_PEDALS.md). reverb.dampening removed — Tone.Reverb has
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
  // 0-0.25 s (Classic Band Retune row 14): the grid said 0-0.5 and this said 0-1; a 1 s pre-delay is a slapback.
  'reverb.preDelay': { min: 0, max: 0.25, scale: 'linear', step: 0.01 },
  'reverb.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  // Global Colour (docs/specs/GLOBAL_COLOUR.md assumption 6). `order` is capped at 8 although Tone allows 100:
  // above that it is noise, not colour. `order` and `bits` step by whole integers (a harmonic order and a bit
  // depth are integers by concept). None of these is LFO-able, so no LfoTarget reads them.
  'distortion.amount': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'distortion.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'chebyshev.order': { min: 1, max: 8, scale: 'linear', step: 1 },
  'chebyshev.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'bitCrusher.bits': { min: 1, max: 16, scale: 'linear', step: 1 },
  'bitCrusher.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  // Robot Effect Sends: the Colour room's Return (a RETURN_FIELD_KEY, never seeded; the drawer, clamp and quantiser read it).
  'colourRoom.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 5). `phaser.rate` mirrors
  // PEDAL_RATE_RANGE_HZ (src/types/globalAudio.ts) and is linear because TempoSyncSlider takes a linear schema.
  // `phaser.stages` is the node's real stage count and the gate's ceiling (spec §5): it is constructor-only in
  // Tone, so a change rebuilds the node. None of these is LFO-able, so no LfoTarget reads them.
  'autoWah.baseFrequency': { min: 50, max: 1000, scale: 'log' },
  'autoWah.octaves': { min: 1, max: 8, scale: 'linear', step: 0.5 },
  'autoWah.sensitivity': { min: -40, max: 0, scale: 'linear', step: 1 },
  'autoWah.Q': { min: 0.5, max: 10, scale: 'log' },
  'autoWah.gain': { min: 0, max: 20, scale: 'linear', step: 0.5 },
  'autoWah.follower': { min: 0.01, max: 1, scale: 'log' },
  'autoWah.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'phaser.rate': { min: 0.05, max: 10, scale: 'linear', step: 0.05 },
  'phaser.octaves': { min: 0.5, max: 6, scale: 'linear', step: 0.5 },
  'phaser.baseFrequency': { min: 50, max: 2000, scale: 'log' },
  'phaser.stages': { min: 1, max: 12, scale: 'linear', step: 1 },
  'phaser.Q': { min: 0.5, max: 20, scale: 'log' },
  'phaser.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md assumption 5). Not the V2 Chorus: a new dry-by-default pedal after the
  // Phaser. The three synced rates mirror PEDAL_RATE_RANGE_HZ / PEDAL_RATE_STEP_HZ (src/types/globalAudio.ts) and are
  // linear because TempoSyncSlider takes a linear schema. `frequencyShifter.shift` is signed (Tone's `frequency`);
  // `stereoWidener.width` 0.5 is unity. None of these is LFO-able, so no LfoTarget reads them.
  'chorus.rate': { min: 0.05, max: 10, scale: 'linear', step: 0.05 },
  'chorus.delayTime': { min: 1, max: 20, scale: 'linear', step: 0.5 },
  'chorus.depth': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'chorus.spread': { min: 0, max: 180, scale: 'linear', step: 5 },
  'chorus.feedback': { min: 0, max: 0.9, scale: 'linear', step: 0.01 },
  'chorus.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'tremolo.rate': { min: 0.05, max: 10, scale: 'linear', step: 0.05 },
  'tremolo.depth': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'tremolo.spread': { min: 0, max: 180, scale: 'linear', step: 5 },
  'tremolo.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'vibrato.rate': { min: 0.05, max: 10, scale: 'linear', step: 0.05 },
  'vibrato.depth': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'vibrato.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'frequencyShifter.shift': { min: -1000, max: 1000, scale: 'linear', step: 1 },
  'frequencyShifter.wet': { min: 0, max: 1, scale: 'linear', step: 0.01 },
  'stereoWidener.width': { min: 0, max: 1, scale: 'linear', step: 0.01 },

  'limiter.threshold': { min: -20, max: 0, scale: 'linear', step: 1 },
};
