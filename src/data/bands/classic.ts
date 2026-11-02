// ========================================
// IMPORTS
// ========================================
import { ENVELOPE_TIME_MAX_SECONDS } from '../../constants';
import type { BandTable } from './bandKeys';

// ========================================
// THE CLASSIC TABLE
// ========================================

/**
 * Classic: today's bands, lifted byte-for-byte (docs/specs/OFF_SCREEN.md assumption 15, §5.2; plan Task 18). The one
 * table every theme column overlays (resolveBands.ts); what getBand() reads until a world installs a theme
 * (loadingContext.ts). Pre-v1 (assumption 20): Classic is the bands as they stood at the lift - main at cc9a01f2,
 * 2026-10-30 - and later retunes move it; nothing here is kept for an old sound's sake. resolveBands.test.ts pins every
 * value from a literal typed in from the survey, so a value that moves is a deliberate change there too.
 *
 * Sources at the lift. The global rows were GLOBAL_AUDIO_LOADING_RANGES, a direct transcription of
 * docs/reference/GLOBAL_CHAIN_GRID.md's "Loading Range" column - that doc is the source of truth; if a value here and
 * the grid disagree, the grid is right and this file has drifted. `bpm` was BPM_SEED_RANGE (src/utils/bpmSeed.ts). The
 * robot bands were spawnSystem.ts's module constants, each threshold riding its range as a lit share. The sends were
 * ROBOT_SEND_LOADING_RANGES. The readers moved to getBand() at Tasks 21-22, and the three names went at
 * docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R31: this table is the grids' code mirror, and classic.test.ts holds the
 * guards those names' tests held.
 */
export const CLASSIC: BandTable = {
  // ---- Tempo -------------------------------------------------------------------------------------------------------
  // BPM's own seeded-default range - [40, 100] as integer BPM, a slower/contemplative band fitting the ambient ocean
  // soundscape; freely draggable across the wider [20, 200] Audio Rig slider range afterward (FREE_SYNC_TOGGLE.md §1.7).
  bpm: { min: 40, max: 100 },

  // ---- The global chain (GLOBAL_CHAIN_GRID.md's Loading Range column) ---------------------------------------------
  // Narrower per-field seed-sampling sub-ranges - what a FRESH SEED can roll, never what the UI exposes.
  // GLOBAL_AUDIO_SEED_RANGES (globalAudioSeedRanges.ts) stays the full/UI-matching range and is what lfoEngine.ts's
  // resolveLfoOutputRange keeps using - never this table: an LFO needs the parameter's entire usable range. A Return
  // (RETURN_FIELD_KEYS) has no row, so it can never be seeded. Retuned in one pass by the Classic Band Retune
  // (docs/tasks/CLASSIC_BAND_RETUNE.md, 2026-10-21): every row that carries a "Retuned" or "Widened" note moved then. The
  // common reason: a Mix is stored as a slider position and squared at the node (the bypass cell's wet layer is
  // sin(pi/2 * mix^2)), so the bottom third of a Mix slider is near silence: -48 dB at 0.05, -29 dB at 0.15, -20 dB at
  // 0.25, -14 dB at 0.35, -8 dB at 0.5.
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

  'reverb.decay': { min: 0.5, max: 4 },
  'reverb.preDelay': { min: 0, max: 0.1 },

  // Retuned at Classic Band Retune T6 (row 16, Crawford: "retune as proposed", 2026-10-21) from -55 to -45 dB at 10-20:1.
  // The Web Audio compressor applies automatic makeup gain, so that deep, high-ratio band did not pin the fleet near
  // -47 dBFS as first thought; it swung fleet loudness by about 11 dB between seeds (-7 to +3.5 dB against uncompressed,
  // measured on the real signal, docs/tasks/CLASSIC_BAND_RETUNE.md §7). -36 to -18 dB at 2-6:1 halves the swing to about
  // 5 dB. Attack, release and knee are unchanged.
  'compressor.threshold': { min: -36, max: -18 },
  'compressor.ratio': { min: 2, max: 6 },
  'compressor.attack': { min: 0.003, max: 0.05 },
  // Raised at Output Headroom Checkpoint A (docs/specs/OUTPUT_HEADROOM.md §7, Crawford, 2026-10-23) from 0.05-0.3 s.
  // With every robot Volume at 100 %, 6j0mgo5z's seeded 70 ms release let a 13-17 dB gain reduction move fast enough to
  // bend the waveform (heard as crunch, with the master never at full scale); a 0.25 s release removed it by ear.
  'compressor.release': { min: 0.25, max: 0.3 },
  'compressor.knee': { min: 1, max: 15 },

  'limiter.threshold': { min: -3, max: -1 },

  // Global Colour (docs/specs/GLOBAL_COLOUR.md assumption 7): the bands a LIT node draws from; an unlit node keeps its
  // shape value from the same band and a `wet` of 0. The three `wet` bands were set at T14 (Distortion 0.10 to 0.25,
  // Chebyshev and Bit Crusher "kept lower" at 0.05 to 0.15), retuned at Classic Band Retune T2 (Decision 1 = B,
  // 2026-10-21) to 0.2-0.3 and 0.25-0.35 so no character seeded an effect nobody could hear, and then pulled back after
  // Crawford's listen (Checkpoint B, same day: "much more subtle") to ONE shared band, 0.1 to 0.2: a wet layer of -36 dB
  // at the floor and -24 dB at the ceiling. It sits inside Crawford's 0.25 colour Mix ceiling (classic.test.ts).
  'distortion.amount': { min: 0.1, max: 0.35 },
  'distortion.wet': { min: 0.1, max: 0.2 },
  'chebyshev.order': { min: 2, max: 5 },
  'chebyshev.wet': { min: 0.1, max: 0.2 },
  'bitCrusher.bits': { min: 6, max: 10 },
  'bitCrusher.wet': { min: 0.1, max: 0.2 },

  // Global Modulation (docs/specs/GLOBAL_MODULATION_COLOUR.md assumption 6): the bands a LIT pedal draws from; a dark
  // pedal keeps its shape values from the same bands and a `wet` of 0. Retuned at T16 (Crawford, 2026-10-15) to his
  // recommended ranges. The Mix bands NO LONGER share the colour Mix ceiling (assumption 9): the pedals keep the same taper
  // (colourWetGain), so a seeded Mix of 0.35 to 0.5 (wah) or 0.3 to 0.4 (phaser) is a node gain of 0.12 to 0.25 or 0.09
  // to 0.16 (the ceilings are the T16 listen's; the floors rose at Classic Band Retune T1, 2026-10-21, because the bottom
  // third of a squared slider is near silence). The Phaser's stages reach 12, the ceiling the Pixel gate ran.
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

  // Global Pedals (docs/specs/GLOBAL_PEDALS.md assumption 6): the bands a LIT motion pedal draws from, placeholders for
  // Crawford's listen (plan T16). A dark pedal keeps its shape values from the same bands and a `wet` of 0. Each Mix
  // band is the pedal's own and goes through the same colourWetGain taper. Retuned at Classic Band Retune T1
  // (docs/tasks/CLASSIC_BAND_RETUNE.md §2, 2026-10-21): Mix floors up (the taper note above), the Chorus delay at a
  // chorus length (under 5 ms with feedback is a flanger; the full range 1-20 ms still reaches one by hand), and the
  // Vibrato at near-full wet and a small depth (a vibrato below full wet is a chorus; at full wet the old depths are a
  // siren). Robot Effect Sends T8 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 4): the Chorus and the Frequency Shifter
  // became rooms, their `wet` a Return of 1 that is never seeded, so their Mix rows (the retune's rows 7 and 9: 0.3-0.4
  // and 0.25-0.35) are history. Their shape rows below still seed every world.
  'chorus.rate': { min: 0.2, max: 2 },
  'chorus.delayTime': { min: 6, max: 15 },
  'chorus.depth': { min: 0.3, max: 0.7 },
  'chorus.spread': { min: 90, max: 180 },
  'chorus.feedback': { min: 0, max: 0.2 },
  'tremolo.rate': { min: 0.5, max: 6 },
  'tremolo.depth': { min: 0.3, max: 0.7 },
  'tremolo.spread': { min: 90, max: 180 },
  'tremolo.wet': { min: 0.35, max: 0.5 },
  'vibrato.rate': { min: 2, max: 7 },
  'vibrato.depth': { min: 0.03, max: 0.12 },
  'vibrato.wet': { min: 0.85, max: 1 },
  // A MAGNITUDE band: the seeder draws the sign separately (`globalAudio.frequencyShifter.sign`), so a seeded shift is
  // +/-(2 - 20) Hz and never inside +/-2 Hz.
  'frequencyShifter.shift': { min: 2, max: 20 },
  // Never near 0: the mono fold is a hand setting only. The widener has no dark state.
  'stereoWidener.width': { min: 0.4, max: 0.65 },

  // ---- Robots (spawnSystem.ts, robotFieldDerivation.ts) --------------------------------------------------------------
  // ADSR. Roadmap Phase 9 unified attack/decay/release to one flat 0-5 s range, kept narrower than the Ping Contour
  // drawer's 0-10 s edit range; all three have since been narrowed to their sliders' 0-2 s (ENVELOPE_TIME_MAX_SECONDS),
  // so a seeded value is always one the slider can show.
  'robot.attack': { min: 0.0, max: ENVELOPE_TIME_MAX_SECONDS },
  'robot.decay': { min: 0.0, max: ENVELOPE_TIME_MAX_SECONDS },
  'robot.sustain': { min: 0.0, max: 1.0 },
  'robot.release': { min: 0.0, max: ENVELOPE_TIME_MAX_SECONDS },
  // A stage that takes a non-linear shape is seeded short, so the shape can be heard: on a note stream the shape only
  // shows while the stage finishes within the note (notes are often 0.15 s). The same noise sample as a plain robot's,
  // spread over this range instead. `lit` is the shaped share, drawn even (docs/specs/EVEN_SEEDED_DRAWS.md §1.4), so the
  // edge is the share: 15.5 % of robots shape their attack and 15 % their release, about 1.9 and 1.8 in 12 - the shares
  // Robot Articulation's listen heard (docs/specs/ROBOT_ARTICULATION.md §1.2), when the edges were fitted to a bunched draw
  // at 0.21 and 0.275. robotFieldDerivation.test.ts pins the shares over 4,800 seeded robots.
  'robot.shapedAttack': { min: 0.03, max: 0.25, lit: 0.155 },
  'robot.shapedRelease': { min: 0.15, max: 0.8, lit: 0.15 },
  // A glider's portamento time, seconds (PORTAMENTO_SEED_RANGE): short enough to read as a slur, not a siren - it tops
  // out at 0.2 s, just over a 16th note (0.15 s at 98 BPM), because a much longer glide never lands (measured: 0.3 s
  // reaches 37 % of the way to the next pitch on 16ths); the spec's risk-5 fallback. `lit` is the share of robots that
  // glide, drawn even, so the edge is the share: 12.5 %, about 1.5 in 12 (Even Seeded Draws T7; the edge was 0.23 when it
  // was fitted to the bunched draw). Every other robot is exactly 0.
  'robot.portamento': { min: 0.05, max: 0.2, lit: 0.125 },
  // Bus filter cutoff for a common robot (OPEN_FILTER_FREQ_RANGE): an open lowpass that rounds the top off without
  // being heard as a filter.
  'robot.filterFreq': { min: 2000, max: 8000 },
  // Bus filter cutoff for an accent robot (ACCENT_FILTER_FREQ_RANGE): dark enough that a Q this high rings. `lit` is the
  // share of robots with a resonant "accent" bus filter instead of the open one, drawn even, so the edge is the share:
  // 20 %, about 2.4 in 12 (Even Seeded Draws T6; the edge was 0.27 when it was fitted to the bunched draw). Which
  // accent robots are bandpass rather than lowpass is a plain coin (ACCENT_BANDPASS_SHARE), not a band.
  'robot.accentFilterFreq': { min: 400, max: 2500, lit: 0.2 },
  // Accent resonance (ACCENT_FILTER_Q_RANGE): a clear peak at the low end, a whistle at the high end.
  'robot.accentFilterQ': { min: 3, max: 8 },
  // The Signature Array's Coaxial and Harmonic gain draw. Baseline (layers[0]) always seeds a real, audible gain from
  // this band; Coaxial and Harmonic each have a plain 50/50 chance (LAYER_QUIET_THRESHOLD 0.5, so a lit share of 1 - 0.5)
  // of a gain of exactly 0 instead - muting keeps the rest of the layer's configuration, so a muted layer still has a
  // full, ready-to-resume config. No product requirement pinned a specific bias; the coin is the least-presumptuous
  // default for "each independently seeded on or muted".
  'robot.layerGain': { min: 0.2, max: 1.2, lit: 0.5 },
  // Master volume (MASTER_VOLUME_MIN/MAX): keep robots below full saturation.
  'robot.masterVolume': { min: 0.65, max: 0.85 },
  // The robot LFO link depth windows, percent (ROBOT_LFO_GAIN/DETUNE/BUS_DEPTH_SEED_RANGE; Crawford's own load-value
  // tuning pass, 2026-10-02): gain and detune read very differently at the same depth percentage, so each gets its own
  // ceiling; the bus filter's sweep (Robot Articulation, spec §1.2) moves the tone far more than a same-sized gain or
  // detune nudge, so it gets a mid-sized window. All share the never-zero floor of 1 (ROBOT_LFO_DEPTH_SEED_MIN): a lit
  // link should always be audible. `lit` is the lit share, 1 - the quiet threshold: LFO_QUIET_THRESHOLD 0.7 for the six
  // layer targets (why 0.7 and not 0.75 for "25 % on": the draw is a smooth simplex sample, not a uniform coin, so the
  // on-rate is not 1 - threshold; measured across 8 worlds x 12 offsets, 0.5 gave about 53 % on, 0.75 about 20 %, 0.7
  // about 27 %, about 1.6 audio-rate LFOs per robot), and LFO_BUS_QUIET_THRESHOLD 0.8 for the bus filter (a lit filter
  // sweep is rarer than a lit layer link, about 1.6 in 12 robots, measured 13.6 %). The gain and detune shares were one
  // constant; they are two rows here so the two fields stay independently tunable, as the two toggle shares below are.
  'robot.lfoGainDepth': { min: 1, max: 60, lit: 0.3 },
  'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0.3 },
  'robot.lfoBusDepth': { min: 1, max: 40, lit: 0.2 },
  // The two plain 0-100 draws, the sliders' own scale.
  'robot.rhythmicDensity': { min: 0, max: 100 },
  'robot.pitchRepeat': { min: 0, max: 100 },
  // Motif Length and Note Variance: one consolidated [0, 1) draw each (docs/specs/archive/STEPPER_TO_SLIDER.md). A draw
  // under `offShare` lands the field off (value 0) - 15 %, preserving the pre-STEPPER_TO_SLIDER two-draw scheme's exact
  // off-rate (§7.1) - and the remaining span maps uniformly onto 1-8. A fresh robot tiles a repeating motif far more
  // often than it scatters freely. Two rows, not one shared value, so the two fields stay independently tunable even
  // though they currently agree (RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD, NOTE_VARIANCE_OFF_THRESHOLD).
  'robot.rhythmicMotifLength': { offShare: 0.15, min: 1, max: 8 },
  'robot.noteVariance': { offShare: 0.15, min: 1, max: 8 },
  // Robot Performance (docs/specs/ROBOT_PERFORMANCE.md assumption 13). Unlike the articulation traits, these are not
  // minority traits: every robot is seeded, most land moderate (the bell-curved getSeededVal draw is wanted here) and a
  // few sit near the edges; each is drawn as a rounded integer 0-100, the sliders' own scale. Dynamics: 25 plays almost
  // flat (a quarter of today's velocity variance), 75 breathes (one and a half times it). Rests: 10 leaves a rare short
  // gap, 60 cuts more than half the notes short, and deeper. Accents: 20 marks about one note in five with only the two
  // mildest marks (accent, tenuto); 80 marks four in five with all five, staccatissimo included.
  'robot.dynamics': { min: 25, max: 75 },
  'robot.rests': { min: 10, max: 60 },
  'robot.accents': { min: 20, max: 80 },
  // The waveform the base and the three Signature Array layers draw (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): a pick
  // (PickBand), five equal unit weights in WAVEFORMS order: 20 % each on the even draw (the bunched draw gave sine and
  // pulse about 6.5 % each; Even Seeded Draws T6). The Voice family's options move the weights.
  'robot.waveform': { weights: { sine: 1, square: 1, triangle: 1, sawtooth: 1, pulse: 1 } },

  // ---- The sends (docs/specs/ROBOT_EFFECT_SENDS.md assumption 6, §1.1) ---------------------------------------------
  // What a FRESH robot may seed for each of its five sends, never what the slider exposes (SEND_MIN..SEND_MAX). The
  // Reverb and Delay rows are the old `reverb.wet` / `delay.wet` rows of the global loading table (as merged by the
  // Classic Band Retune at 2dc5b4a2); they moved to the send table at Robot Effect Sends T1 without moving a single
  // seeded value. The Reverb band was widened from 0.1-0.4 by the retune (row 15) for more contrast between a dry robot
  // and a wet one. The Delay's `lit` is the old quiet roll: a roll under 1 - lit (0.25, the deleted
  // SEND_DELAY_QUIET_THRESHOLD) seeds 0. The three room sends are placeholders tuned at that plan's listen (T20); a fresh
  // robot carries at most one of them (EXCLUSIVE_SEND_FIELDS, in roll order).
  reverbSend: { min: 0.1, max: 0.6, lit: 1 },
  delaySend: { min: 0, max: 0.3, lit: 0.75 },
  gritSend: { min: 0.4, max: 0.8, lit: 0.21 },
  shimmerSend: { min: 0.2, max: 0.5, lit: 0.16 },
  doubleSend: { min: 0.3, max: 0.6, lit: 0.19 },
};
