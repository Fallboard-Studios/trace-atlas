/**
 * Narrower per-field seed-sampling sub-ranges — bounds what a FRESH SEED can
 * roll, never what the UI exposes or what the app can do.
 * GLOBAL_AUDIO_SEED_RANGES (globalAudioSeedRanges.ts) stays the full/UI-
 * matching range and is what lfoEngine.ts's resolveLfoOutputRange keeps
 * using — never this table. An LFO modulating a parameter needs to swing
 * across that parameter's entire usable range, not just the narrower window
 * a fresh Attenuation Style is allowed to start in.
 *
 * Values are a direct transcription of docs/reference/GLOBAL_CHAIN_GRID.md's
 * "Loading Range" column — that doc is the source of truth; this file
 * mirrors it, it doesn't decide it. If a value here and the grid ever
 * disagree, the grid is right and this file has drifted.
 */
import type { GlobalAudioSeedFieldKey } from './globalAudioSeedRanges';

export interface LoadingRange {
  min: number;
  max: number;
}

/** The most a fresh world may seed any colour Mix to, as a slider position (Crawford, Global Colour T14, 2026-10-15:
 *  "don't allow any of the new color mixes to exceed .25 on load"). The Mix is tapered at the node (squared), so a seeded
 *  Mix of this size is a wet of at most 0.0625. Saved sessions and share links carry whatever was hand-set and are not
 *  clamped to it. */
export const COLOUR_LOAD_MIX_MAX = 0.25;

// The two `wet` rows ('delay.wet', 'reverb.wet') are no longer sampled for the global rooms - those are a
// fixed full return now (docs/specs/ROBOT_SENDS.md §1.2). The rows keep their keys and values because they are
// the per-robot SEND bands: spawnSystem.ts generateRobotSends draws each robot's reverbSend / delaySend from them.
export const GLOBAL_AUDIO_LOADING_RANGES: Record<GlobalAudioSeedFieldKey, LoadingRange> = {
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },

  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  'filterHPF.frequency': { min: 20, max: 500 },
  'filterHPF.Q': { min: 0.1, max: 5 },

  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'delay.wet': { min: 0, max: 0.3 },

  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  'reverb.wet': { min: 0.1, max: 0.4 },

  'compressor.threshold': { min: -55, max: -45 },
  'compressor.ratio': { min: 10, max: 20 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.05, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },

  'limiter.threshold': { min: -3, max: -1 },

  // Global Colour (docs/specs/GLOBAL_COLOUR.md assumption 7): the bands a LIT node draws from; an unlit node
  // keeps its shape value from the same band and a `wet` of 0. The three `wet` bands were set at T14: Distortion 0.10
  // to COLOUR_LOAD_MIX_MAX (0.25), and Chebyshev and Bit Crusher gentler, 0.05 to 0.15 (they always seeded below
  // Distortion; Crawford, "keep those ones lower").
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.1, max: COLOUR_LOAD_MIX_MAX },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.05, max: 0.15 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.05, max: 0.15 },

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 6): the bands a LIT pedal draws from; a dark
  // pedal keeps its shape values from the same bands and a `wet` of 0. Retuned at T16 (Crawford, 2026-10-15) to his
  // recommended ranges. The Mix bands NO LONGER share COLOUR_LOAD_MIX_MAX (assumption 9): the pedals keep the same taper
  // (colourWetGain), so a seeded Mix of 0.2 to 0.5 (wah) or 0.15 to 0.4 (phaser) is a node gain of 0.04 to 0.25 or 0.02 to 0.16, brought down from 0.3-0.7 and 0.25-0.6 after Crawford heard them;
  // the Phaser's stages now reach 12, the
  // ceiling the Pixel gate ran. Colour's own ceiling is untouched.
  'autoWah.baseFrequency': { min: 50, max: 250 },
  'autoWah.octaves': { min: 2.5, max: 5 },
  'autoWah.sensitivity': { min: -40, max: -10 },
  'autoWah.Q': { min: 2, max: 6 },
  'autoWah.gain': { min: 2, max: 6 },
  'autoWah.follower': { min: 0.1, max: 0.4 },
  'autoWah.wet': { min: 0.2, max: 0.5 },
  'phaser.rate': { min: 0.1, max: 2.5 },
  'phaser.octaves': { min: 2, max: 5 },
  'phaser.baseFrequency': { min: 200, max: 800 },
  'phaser.stages': { min: 4, max: 12 },
  'phaser.Q': { min: 1, max: 10 },
  'phaser.wet': { min: 0.15, max: 0.4 },
};
