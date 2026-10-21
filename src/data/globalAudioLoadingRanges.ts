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
 *
 * Retuned in one pass, the Classic Band Retune (docs/tasks/CLASSIC_BAND_RETUNE.md, 2026-10-21): every row below that
 * carries a "Retuned" or "Widened" comment moved then, with the reason beside it. The common one is that a Mix is stored
 * as a slider position and squared at the node (the bypass cell's wet layer is sin(pi/2 * mix^2)), so the bottom third of
 * a Mix slider is near silence: -48 dB at 0.05, -29 dB at 0.15, -20 dB at 0.25, -14 dB at 0.35, -8 dB at 0.5.
 */
import type { GlobalAudioSeedFieldKey } from './globalAudioSeedRanges';

export interface LoadingRange {
  min: number;
  max: number;
}

/** The most a fresh world may seed any colour Mix to, as a slider position. Crawford set it at 0.25 (Global Colour T14,
 *  2026-10-15: "don't allow any of the new color mixes to exceed .25 on load") to protect the whole fleet on the Pixel; the
 *  Classic Band Retune raised it to 0.35 (Decision 1 = B, 2026-10-21) because the sends phase re-homes these three Mixes
 *  inside the Colour room, where only the robots with a Grit send hear them. The Mix is tapered at the node (squared), so
 *  a seeded Mix of this size is a wet of at most 0.1225. Saved sessions and share links carry whatever was hand-set and
 *  are not clamped to it. */
export const COLOUR_LOAD_MIX_MAX = 0.35;

// The two `wet` rows ('delay.wet', 'reverb.wet') are no longer sampled for the global rooms - those are a
// fixed full return now (docs/specs/ROBOT_SENDS.md §1.2). The rows keep their keys and values because they are
// the per-robot SEND bands: spawnSystem.ts generateRobotSends draws each robot's reverbSend / delaySend from them.
export const GLOBAL_AUDIO_LOADING_RANGES: Record<GlobalAudioSeedFieldKey, LoadingRange> = {
  'eq3.low': { min: -6, max: 6 },
  'eq3.mid': { min: -6, max: 6 },
  'eq3.high': { min: -6, max: 6 },

  'filterLPF.frequency': { min: 2000, max: 20000 },
  'filterLPF.Q': { min: 0.1, max: 5 },
  // Retuned at Classic Band Retune T1: C4 is 262 Hz, and octave-1..3 robots exist; the old 20-500 Hz band removed the
  // fundamentals of every robot below octave 5. The full range (20-20000) and the LFO swing are untouched.
  'filterHPF.frequency': { min: 20, max: 120 },
  'filterHPF.Q': { min: 0.1, max: 5 },

  'delay.delayTime': { min: 0.05, max: 0.5 },
  'delay.feedback': { min: 0, max: 0.4 },
  'delay.wet': { min: 0, max: 0.3 },

  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },
  // Widened from 0.1-0.4 at Classic Band Retune T5 (row 15, 2026-10-21): more contrast between a dry probe and a wet one.
  'reverb.wet': { min: 0.1, max: 0.6 },

  // Retuned at Classic Band Retune T6 (row 16, Crawford: "retune as proposed", 2026-10-21) from -55 to -45 dB at 10-20:1.
  // The Web Audio compressor applies automatic makeup gain, so that deep, high-ratio band did not pin the fleet near
  // -47 dBFS as first thought; it swung fleet loudness by about 11 dB between seeds (-7 to +3.5 dB against uncompressed,
  // measured on the real signal, docs/tasks/CLASSIC_BAND_RETUNE.md §7). -36 to -18 dB at 2-6:1 halves the swing to about
  // 5 dB. Attack, release and knee are unchanged.
  'compressor.threshold': { min: -36, max: -18 },
  'compressor.ratio': { min: 2, max: 6 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  'compressor.release': { min: 0.05, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },

  'limiter.threshold': { min: -3, max: -1 },

  // Global Colour (docs/specs/GLOBAL_COLOUR.md assumption 7): the bands a LIT node draws from; an unlit node
  // keeps its shape value from the same band and a `wet` of 0. The three `wet` bands were set at T14 (Distortion 0.10 to
  // 0.25, Chebyshev and Bit Crusher "kept lower" at 0.05 to 0.15) and retuned at Classic Band Retune T2 (Decision 1 = B,
  // 2026-10-21): Distortion 0.2 to 0.3, Chebyshev and Bit Crusher 0.25 to 0.35. The old floors sat in the bottom third of
  // a squared slider (a wet layer of -48 dB at 0.05, -36 dB at 0.1), so two of the four Colour characters seeded an effect
  // nobody could hear; the floors now sit at -24 dB (0.2) and -20 dB (0.25). No band tops out above COLOUR_LOAD_MIX_MAX.
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.2, max: 0.3 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.25, max: COLOUR_LOAD_MIX_MAX },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.25, max: COLOUR_LOAD_MIX_MAX },

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 6): the bands a LIT pedal draws from; a dark
  // pedal keeps its shape values from the same bands and a `wet` of 0. Retuned at T16 (Crawford, 2026-10-15) to his
  // recommended ranges. The Mix bands NO LONGER share COLOUR_LOAD_MIX_MAX (assumption 9): the pedals keep the same taper
  // (colourWetGain), so a seeded Mix of 0.35 to 0.5 (wah) or 0.3 to 0.4 (phaser) is a node gain of 0.12 to 0.25 or 0.09
  // to 0.16 (the ceilings are the T16 listen's; the floors rose at Classic Band Retune T1, 2026-10-21, because the bottom
  // third of a squared slider is near silence: a wet layer of -48 dB at 0.05, -20 dB at 0.25). The Phaser's stages reach
  // 12, the ceiling the Pixel gate ran. Colour's own ceiling is the separate constant COLOUR_LOAD_MIX_MAX.
  'autoWah.baseFrequency': { min: 50, max: 250 },
  'autoWah.octaves': { min: 2.5, max: 5 },
  // Retuned at Classic Band Retune T1: Tone boosts the follower by -sensitivity dB, so at -40 on a fleet near 0 dBFS
  // the filter sits open and never sweeps.
  'autoWah.sensitivity': { min: -20, max: -5 },
  'autoWah.Q': { min: 2, max: 6 },
  'autoWah.gain': { min: 2, max: 6 },
  'autoWah.follower': { min: 0.1, max: 0.4 },
  'autoWah.wet': { min: 0.35, max: 0.5 },
  'phaser.rate': { min: 0.1, max: 2.5 },
  'phaser.octaves': { min: 2, max: 5 },
  'phaser.baseFrequency': { min: 200, max: 800 },
  'phaser.stages': { min: 4, max: 12 },
  'phaser.Q': { min: 1, max: 10 },
  'phaser.wet': { min: 0.3, max: 0.4 },

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md assumption 6): the bands a LIT motion pedal draws from, placeholders
  // for Crawford's listen (plan T16). A dark pedal keeps its shape values from the same bands and a `wet` of 0. Each
  // Mix band is the pedal's own and goes through the same colourWetGain taper. Retuned at Classic Band Retune T1
  // (docs/tasks/CLASSIC_BAND_RETUNE.md §2, 2026-10-21): Mix floors up (the taper note above), the Chorus delay at a
  // chorus length (under 5 ms with feedback is a flanger; the full range 1-20 ms still reaches one by hand), and the
  // Vibrato at near-full wet and a small depth (a vibrato below full wet is a chorus; at full wet the old depths are a siren).
  'chorus.rate': { min: 0.2, max: 2 },
  'chorus.delayTime': { min: 6, max: 15 },
  'chorus.depth': { min: 0.3, max: 0.7 },
  'chorus.spread': { min: 90, max: 180 },
  'chorus.feedback': { min: 0, max: 0.2 },
  'chorus.wet': { min: 0.3, max: 0.4 },
  'tremolo.rate': { min: 0.5, max: 6 },
  'tremolo.depth': { min: 0.3, max: 0.7 },
  'tremolo.spread': { min: 90, max: 180 },
  'tremolo.wet': { min: 0.35, max: 0.5 },
  'vibrato.rate': { min: 2, max: 7 },
  'vibrato.depth': { min: 0.03, max: 0.12 },
  'vibrato.wet': { min: 0.85, max: 1 },
  // A MAGNITUDE band: the seeder draws the sign separately (`globalAudio.frequencyShifter.sign`), so a seeded shift is
  // ±(2 - 20) Hz and never inside ±2 Hz.
  'frequencyShifter.shift': { min: 2, max: 20 },
  // The ceiling moved by only 0.05 (to 0.35), so the band is not a point.
  'frequencyShifter.wet': { min: 0.25, max: 0.35 },
  // Never near 0: the mono fold is a hand setting only. The widener has no dark state.
  'stereoWidener.width': { min: 0.4, max: 0.65 },
};
