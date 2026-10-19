import * as Tone from 'tone';

import { getToneCtor, type ModulationTarget } from './toneHelpers';
import { devWarn } from '@/utils/helpers';
import { GLOBAL_AUDIO_SEED_RANGES, type GlobalAudioSeedFieldKey } from '@/data/globalAudioSeedRanges';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import type {
  ReverbSettings,
  DelaySettings,
  FilterSettings,
  EQ3Settings,
  CompressorSettings,
  LimiterSettings,
  DistortionSettings,
  ChebyshevSettings,
  BitCrusherSettings,
  AutoWahSettings,
  PhaserSettings,
  ChorusSettings,
  TremoloSettings,
  VibratoSettings,
  FrequencyShifterSettings,
  StereoWidenerSettings,
} from '@/types/globalAudio';
import type { GlobalLfoTargetId } from '@/types/lfo';

// ========================================
// MODULE STATE (module-scoped, runtime-only — never put these in Zustand)
// ========================================
let _globalCompressor: Tone.Compressor | null = null;
let _globalReverb: Tone.Reverb | null = null;
let _globalDelay: Tone.FeedbackDelay | null = null;
let _globalEQ: Tone.EQ3 | null = null;
let _globalLPF: Tone.Filter | null = null;
let _globalHPF: Tone.Filter | null = null;
let _globalLimiter: Tone.Limiter | null = null;
// The colour slot, in chain order between the High-Pass Filter and the Compressor (docs/specs/GLOBAL_COLOUR.md §1.3).
let _globalDistortion: Tone.Distortion | null = null;
let _globalChebyshev: Tone.Chebyshev | null = null;
let _globalBitCrusher: Tone.BitCrusher | null = null;
// The modulation slot, in chain order between the colour slot and the Compressor (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.3).
let _globalAutoWah: Tone.AutoWah | null = null;
let _globalPhaser: Tone.Phaser | null = null;
// Tone's Phaser takes `stages` only in its constructor, so changing it rebuilds the node (spec §1.3). The live stage
// count, and the last-written values of every other field (`wet` as the slider position, not the tapered gain), are
// kept here so a rebuild needs no store read. Reset by buildGlobalFxChain.
type PhaserLive = Omit<PhaserSettings, 'sync' | 'stages'>;
let _phaserStages = DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.stages;
let _phaserLive: PhaserLive = defaultPhaserLive();
// The motion pedals, in chain order after the Phaser and before the Compressor (docs/specs/GLOBAL_PEDALS.md §1.3).
let _globalChorus: Tone.Chorus | null = null;
let _globalTremolo: Tone.Tremolo | null = null;
// Plain Tone `Effect`s, not `StereoEffect`s, but neither is mono: the Vibrato's delay moves left and right alike, and
// only the shifter's sine branch is downmixed (see setGlobalFrequencyShifter).
let _globalVibrato: Tone.Vibrato | null = null;
let _globalFrequencyShifter: Tone.FrequencyShifter | null = null;
// The Width stage, between the Compressor and the Limiter: after the rooms' join in both Decay Modes (GLOBAL_PEDALS.md §1.3).
let _globalStereoWidener: Tone.StereoWidener | null = null;
// The cycle-search cuts: zero-delay DelayNodes at the chain entry and after the High-Pass Filter (see CHAIN_CUT_OPTIONS).
let _entryCut: Tone.Delay | null = null;
let _filterCut: Tone.Delay | null = null;
// The Decay Mode wireGlobalFxChain was last called with. A Phaser rebuild re-wires, and nothing else remembers the mode.
let _lastControlledDecay = false;
// Where each room's output rejoins the signal path. The global Reverb / Delay `wet` sliders drive these
// gains, never Effect.wet: the rooms stay fully wet and each robot's send decides how much enters
// (docs/specs/ROBOT_SENDS.md §1.3).
let _globalReverbReturn: Tone.Gain | null = null;
let _globalDelayReturn: Tone.Gain | null = null;
// Master output gain controlling overall volume (used by setMasterVolume/getMasterVolume)
let _masterGain: Tone.Gain | null = null;
let _masterVolume = 1;
// Read-only output taps for the `?debug` overlay (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md). Nothing here
// exists unless attachOutputTaps() is called.
let _tapsWanted = false;
let _preTap: OutputTap | null = null;
let _masterTap: OutputTap | null = null;

/** Ramp duration for a live LPF/HPF frequency change — same declick rationale as
 *  AudioEngine.ts's own VOLUME_RAMP_SECONDS: short enough to feel instant while dragging, long
 *  enough to avoid an audible click on a large jump. Confirmed audible live on LPF frequency
 *  with a direct .value write (docs/tasks/AUDIO_ENGINE_CLEANUP.md P2.4); Q and every other
 *  global-chain param are left as direct writes — not confirmed audible, and out of scope for
 *  this fix. */
const FILTER_FREQUENCY_RAMP_SECONDS = 0.05;

/** Ramp for a live colour `wet` or BitCrusher `bits` change - the same declick rationale as the filter ramp.
 *  `amount` and `order` are plain setters that rebuild a 1024-point shaper map and are written directly. */
const COLOUR_RAMP_SECONDS = 0.05;

/** The stored colour Mix (0-1, the slider position and what the seed draws) as the `wet` the node gets: squared.
 *  On the Pixel the three saturators were far too strong across most of a linear Mix slider (Crawford, 2026-10-15:
 *  "all three need to be super low mixes"), so the curve spends most of the slider on the subtle end, as the
 *  Sends' return levels do. 0 stays fully dry and 1 stays fully wet; only the middle moves. Applied where the
 *  setters write the node, so a seed, a restore and a slider drag all take the same path and the stored value,
 *  the seed bands and the share codes keep meaning "slider position". */
export function colourWetGain(mix: number): number {
  return mix * mix;
}

/** `value` clamped into the field's full range, or undefined when it is not a finite number. A saved session or a
 *  share link is untrusted input: an out-of-range colour value must not reach a node (an order of 1e9 would stall
 *  the shaper-map build) and NaN must not be written at all. */
function clampColour(key: GlobalAudioSeedFieldKey, value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const { min, max } = GLOBAL_AUDIO_SEED_RANGES[key];
  return Math.min(max, Math.max(min, value));
}

function defaultPhaserLive(): PhaserLive {
  const { rate, octaves, baseFrequency, Q, wet } = DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser;
  return { rate, octaves, baseFrequency, Q, wet };
}

/** Constructs a Phaser at `stages` with the given non-stage values, its Mix already tapered, so a rebuilt node
 *  comes up at exactly the sound the old one had. */
function buildPhaser(PhaserCtor: new (...args: unknown[]) => Tone.Phaser, stages: number, live: PhaserLive): Tone.Phaser {
  return new PhaserCtor({
    frequency: live.rate,
    octaves: live.octaves,
    stages,
    Q: live.Q,
    baseFrequency: live.baseFrequency,
    wet: colourWetGain(live.wet),
  });
}

/**
 * The cycle-search cuts (docs/specs/GLOBAL_PEDALS.md, as-built). Tone's standardized-audio-context runs `detectCycles`
 * on every connect and disconnect: it enumerates EVERY simple path downstream of the destination, without memoising, and
 * stops only at a node that has a `delayTime`. Each Tone effect has a dry and a wet path and the stereo and mid/side
 * ones split again, so the path count multiplies stage by stage. With the five Global Pedals a power-on (every robot
 * voice connecting into the front of the chain) took an estimated ~14 minutes of main thread, measured in headless
 * Chrome on 2026-10-18; even `main`'s chain spent ~1.5 s unresponsive. So two zero-delay DelayNodes sit in the dry
 * chain: one at its entry (every robot bus connects into it) and one after the High-Pass Filter (where the global LFO
 * targets end). Neither is in a cycle, so a delayTime of 0 adds no latency: the sound passes through unchanged. The
 * buffer is tiny because the delay never moves. Measured with both cuts and the downstream-first disconnect: power-on
 * 1.4 s with no unresponsive time, a Decay flip 3 ms, linking all seven global LFOs 1 ms.
 */
const CHAIN_CUT_OPTIONS = { delayTime: 0, maxDelay: 0.01 } as const;

function buildChainCut(DelayCtor: (new (...args: unknown[]) => Tone.Delay) | undefined, where: string): Tone.Delay | null {
  if (!DelayCtor) return null;
  try {
    return new DelayCtor({ ...CHAIN_CUT_OPTIONS });
  } catch (err) {
    devWarn('[AudioEngine] the ' + where + ' cycle-search cut could not be constructed; the chain runs without it', err);
    return null;
  }
}

/** clampColour for a field a partial update may leave out: an absent field stays undefined (and is not written). */
function clampIfGiven(key: GlobalAudioSeedFieldKey, value: number | undefined): number | undefined {
  return value === undefined ? undefined : clampColour(key, value);
}

/** Ramp a Signal-backed AudioParam-like value to `target` when it supports .rampTo(), falling
 *  back to a direct .value assignment when it doesn't (headless/test environments). */
function rampOrSet(param: { rampTo?: (value: number, rampTime: number) => void; value: unknown }, target: number, rampSeconds: number): void {
  if (typeof param.rampTo === 'function') {
    param.rampTo(target, rampSeconds);
  } else {
    param.value = target;
  }
}

/**
 * Build every global FX node and wire them into the default "Natural Decay"
 * topology via wireGlobalFxChain(false). All nodes are guarded with
 * getToneCtor() checks for test/headless environments. Idempotent relative to
 * AudioEngine.ts's own instrumentsLoaded guard — this function itself doesn't
 * guard re-entry, that stays the caller's job (loadInstruments).
 */
export function buildGlobalFxChain(): void {
  _globalCompressor = new Tone.Compressor({
    threshold: -18,  // engage earlier to tame FM/AM harmonics before clipping
    ratio: 6,        // softer compression ratio; not a hard limiter
    attack: 0.003,
    release: 0.15,
  });

  const ReverbCtor = getToneCtor<Tone.Reverb>('Reverb');
  const DelayCtor = getToneCtor<Tone.FeedbackDelay>('FeedbackDelay');
  const EQ3Ctor = getToneCtor<Tone.EQ3>('EQ3');
  const FilterCtor = getToneCtor<Tone.Filter>('Filter');
  const GainCtorFX = getToneCtor<Tone.Gain>('Gain');
  const LimiterCtor = getToneCtor<Tone.Limiter>('Limiter');
  const DistortionCtor = getToneCtor<Tone.Distortion>('Distortion');
  const ChebyshevCtor = getToneCtor<Tone.Chebyshev>('Chebyshev');
  const BitCrusherCtor = getToneCtor<Tone.BitCrusher>('BitCrusher');
  const AutoWahCtor = getToneCtor<Tone.AutoWah>('AutoWah');
  const PhaserCtor = getToneCtor<Tone.Phaser>('Phaser');
  const ChorusCtor = getToneCtor<Tone.Chorus>('Chorus');
  const TremoloCtor = getToneCtor<Tone.Tremolo>('Tremolo');
  const VibratoCtor = getToneCtor<Tone.Vibrato>('Vibrato');
  const FrequencyShifterCtor = getToneCtor<Tone.FrequencyShifter>('FrequencyShifter');
  const StereoWidenerCtor = getToneCtor<Tone.StereoWidener>('StereoWidener');
  const ChainCutCtor = getToneCtor<Tone.Delay>('Delay');

  _entryCut = buildChainCut(ChainCutCtor, 'entry');
  _filterCut = buildChainCut(ChainCutCtor, 'post-filter');

  if (ReverbCtor) {
    // wet 1: a room is all room. How much of a robot enters it is that robot's send.
    _globalReverb = new ReverbCtor({ decay: 1.5, preDelay: 0.02, wet: 1 });
  }
  if (DelayCtor) {
    // maxDelay is explicit on purpose: it must stay >= the max of
    // GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'] (10s) and equal to
    // DELAY_TIME_RANGE_SECONDS.max (types/globalAudio.ts), which tempo-synced
    // delay times are clamped to. Previously this was
    // an unset, implicit reliance on Tone.FeedbackDelay's own default of 1 —
    // correct today only by coincidence, and silently driftable if either
    // side changed independently.
    _globalDelay = new DelayCtor({ delayTime: 0.25, feedback: 0.2, wet: 1, maxDelay: 10 });
  }
  if (EQ3Ctor) {
    _globalEQ = new EQ3Ctor({ low: 0, mid: 0, high: 0 });
  }
  if (FilterCtor) {
    _globalLPF = new FilterCtor({ type: 'lowpass', frequency: 20000, Q: 1 });
    _globalHPF = new FilterCtor({ type: 'highpass', frequency: 20, Q: 1 });
  }
  if (LimiterCtor) {
    _globalLimiter = new LimiterCtor({ threshold: -12 });
  }
  // Built dry (wet 0); the store pushes the seeded values once the chain exists. `oversample` is 'none' on both
  // shapers and is never read from state (docs/specs/GLOBAL_COLOUR.md §1.3).
  if (DistortionCtor) {
    _globalDistortion = new DistortionCtor({ distortion: 0.3, oversample: 'none', wet: 0 });
  }
  if (ChebyshevCtor) {
    _globalChebyshev = new ChebyshevCtor({ order: 2, oversample: 'none', wet: 0 });
  }
  // The first AudioWorklet in the app: Tone.BitCrusher constructs synchronously and registers its processor on a
  // promise, so at wet 0 nothing changes and at wet > 0 the crushed share is briefly absent at boot. If the browser
  // refuses worklets the constructor throws, and the slot is simply skipped.
  _globalBitCrusher = null;
  if (BitCrusherCtor) {
    try {
      _globalBitCrusher = new BitCrusherCtor({ bits: 8, wet: 0 });
    } catch (err) {
      devWarn('[AudioEngine] BitCrusher could not be constructed; the colour slot runs without it', err);
      _globalBitCrusher = null;
    }
  }
  // Built dry (wet 0) at the stored defaults, like the colour nodes; the store pushes the seeded values once the
  // chain exists. A missing constructor (headless) leaves the slot empty and the chain whole.
  if (AutoWahCtor) {
    _globalAutoWah = new AutoWahCtor({ ...DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah, wet: 0 });
  }
  // The Phaser starts its LFOs in its constructor, so it is built once here and never in the setter's hot path
  // except for a Stages change. A failed construction leaves the slot empty and the chain whole.
  _globalPhaser = null;
  _phaserStages = DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser.stages;
  _phaserLive = defaultPhaserLive();
  if (PhaserCtor) {
    try {
      _globalPhaser = buildPhaser(PhaserCtor, _phaserStages, _phaserLive);
    } catch (err) {
      devWarn('[AudioEngine] Phaser could not be constructed; the modulation slot runs without it', err);
      _globalPhaser = null;
    }
  }
  // Global Pedals: built dry (wet 0) at the stored defaults. Tone's Chorus and Tremolo do NOT start their LFOs in the
  // constructor, so each is started once here and runs for the chain's life: a dark pedal is Mix 0, not a stopped LFO
  // (docs/specs/GLOBAL_PEDALS.md assumption 4). A failed construction leaves the slot empty and the chain whole.
  resetSpreadDucks();
  _globalChorus = null;
  if (ChorusCtor) {
    try {
      const { rate, delayTime, depth, spread, feedback } = DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus;
      _globalChorus = new ChorusCtor({ frequency: rate, delayTime, depth, spread, feedback, wet: 0 });
      _globalChorus.start();
    } catch (err) {
      devWarn('[AudioEngine] Chorus could not be constructed; the pedal slot runs without it', err);
      _globalChorus = null;
    }
  }
  _globalTremolo = null;
  if (TremoloCtor) {
    try {
      const { rate, depth, spread } = DEFAULT_GLOBAL_AUDIO_SETTINGS.tremolo;
      _globalTremolo = new TremoloCtor({ frequency: rate, depth, spread, wet: 0 });
      _globalTremolo.start();
    } catch (err) {
      devWarn('[AudioEngine] Tremolo could not be constructed; the pedal slot runs without it', err);
      _globalTremolo = null;
    }
  }
  // The Vibrato starts its own LFO in its constructor, so it is never start()ed here. Its `maxDelay` (constructor-only,
  // the Depth ceiling) is left at Tone's 0.005 s default, which the full Depth range is written against.
  _globalVibrato = null;
  if (VibratoCtor) {
    try {
      const { rate, depth } = DEFAULT_GLOBAL_AUDIO_SETTINGS.vibrato;
      _globalVibrato = new VibratoCtor({ frequency: rate, depth, wet: 0 });
    } catch (err) {
      devWarn('[AudioEngine] Vibrato could not be constructed; the pedal slot runs without it', err);
      _globalVibrato = null;
    }
  }
  _globalFrequencyShifter = null;
  if (FrequencyShifterCtor) {
    try {
      _globalFrequencyShifter = new FrequencyShifterCtor({
        frequency: DEFAULT_GLOBAL_AUDIO_SETTINGS.frequencyShifter.shift,
        wet: 0,
      });
    } catch (err) {
      devWarn('[AudioEngine] FrequencyShifter could not be constructed; the pedal slot runs without it', err);
      _globalFrequencyShifter = null;
    }
  }
  // Width: built at unity (0.5) and held fully wet - Width itself is the control; there is no Mix and no dark state.
  _globalStereoWidener = null;
  if (StereoWidenerCtor) {
    try {
      _globalStereoWidener = new StereoWidenerCtor({ width: DEFAULT_GLOBAL_AUDIO_SETTINGS.stereoWidener.width, wet: 1 });
    } catch (err) {
      devWarn('[AudioEngine] StereoWidener could not be constructed; the chain runs without the Width stage', err);
      _globalStereoWidener = null;
    }
  }
  if (GainCtorFX) {
    // Unity until setGlobalReverb / setGlobalDelay writes the sliders' wet. A failed construction leaves
    // that room unreturned rather than breaking the build.
    try {
      _globalReverbReturn = new GainCtorFX(1);
      _globalDelayReturn = new GainCtorFX(1);
    } catch {
      _globalReverbReturn = null;
      _globalDelayReturn = null;
    }
    // Master gain sits after the FX chain (or final destination) to control overall volume.
    try {
      _masterGain = new GainCtorFX(1);
    } catch {
      _masterGain = null;
    }
  }

  wireGlobalFxChain(false);
}

/**
 * Disconnect every constructed global FX node from whatever it's currently
 * connected to. Tone.js's (and the underlying Web Audio) disconnect() with no
 * arguments detaches a node from ALL of its outputs, so this doesn't need to
 * track exact prior edges — safe to call even if nothing was ever connected.
 */
function disconnectAllFxNodes(): void {
  // Signal order, upstream to downstream (the rooms feed their returns, which feed the join), walked BACKWARDS: every
  // disconnect runs Tone's cycle search from the nodes it drops, so dropping the downstream ones first leaves each later
  // search a node with no outputs (see CHAIN_CUT_OPTIONS; front-to-back took a Decay flip 2.6 s with the pedals).
  const nodes = [
    _entryCut,
    _globalEQ,
    _globalLPF,
    _globalHPF,
    _filterCut,
    _globalDistortion,
    _globalChebyshev,
    _globalBitCrusher,
    _globalAutoWah,
    _globalPhaser,
    _globalChorus,
    _globalTremolo,
    _globalVibrato,
    _globalFrequencyShifter,
    _globalDelay,
    _globalReverb,
    _globalReverbReturn,
    _globalDelayReturn,
    _globalCompressor,
    _globalStereoWidener,
    _globalLimiter,
    _masterGain,
  ].filter(Boolean) as Array<{ disconnect: () => void }>;
  for (const node of nodes.reverse()) {
    try {
      node.disconnect();
    } catch (err) {
      devWarn('[AudioEngine] disconnect failed during FX rewire', err);
    }
  }
}

/**
 * Wire the global FX chain, tearing down whatever was previously connected
 * first. The dry chain is the same in both modes: EQ3 → LPF → HPF →
 * Distortion → Chebyshev → BitCrusher → AutoWah → Phaser → Chorus → Tremolo → Vibrato →
 * FrequencyShifter → Compressor → StereoWidener →
 * Limiter → masterGain → Destination (or straight to Destination if masterGain
 * wasn't constructed). An absent colour or modulation node (headless, or a worklet
 * that failed to construct) is skipped by the filter below, so the chain
 * never breaks.
 *
 * Reverb and Delay are two parallel rooms OFF that chain, not stages in it.
 * Each robot feeds a room through its own send gain (AudioEngine.reserveVoice);
 * the room's output runs through a return gain (what the Fleet Params wet
 * sliders set) to a join node, and the join node is the only thing the two
 * modes change (docs/specs/ROBOT_SENDS.md §1.3):
 *
 * - Natural Decay (controlledDecay=false, default): both returns join at the
 *   Compressor input, so the echoes are compressed with the dry signal.
 * - Controlled Decay (controlledDecay=true): both returns join at the
 *   StereoWidener's input, past the Compressor, so the echoes are not squeezed
 *   by it but are still folded or spread by Width (docs/specs/GLOBAL_PEDALS.md
 *   assumption 2). Without a widener node the join falls back to the Limiter.
 *
 * A room's own input is never disconnected here, so the robots' sends stay
 * connected across every flip. Called once from
 * buildGlobalFxChain() and again whenever the "Natural Decay" / "Controlled
 * Decay" toggle flips (src/stores/audioStore.ts's setCompressorBeforeDelay).
 */
export function wireGlobalFxChain(controlledDecay: boolean): void {
  _lastControlledDecay = controlledDecay;
  disconnectAllFxNodes();

  const chainNodes = [
    _entryCut,
    _globalEQ,
    _globalLPF,
    _globalHPF,
    _filterCut,
    _globalDistortion,
    _globalChebyshev,
    _globalBitCrusher,
    _globalAutoWah,
    _globalPhaser,
    _globalChorus,
    _globalTremolo,
    _globalVibrato,
    _globalFrequencyShifter,
    _globalCompressor,
    _globalStereoWidener,
    _globalLimiter,
  ].filter(Boolean) as Array<{
    connect: (t: unknown) => unknown;
    toDestination?: () => void;
  }>;

  if (chainNodes.length === 0) {
    // No FX nodes available at all (fully headless env) — nothing to wire.
    return;
  }

  try {
    for (let i = 0; i < chainNodes.length - 1; i++) {
      chainNodes[i].connect(chainNodes[i + 1]);
    }
    const last = chainNodes[chainNodes.length - 1];
    if (_masterGain) {
      last.connect(_masterGain);
      try {
        _masterGain.toDestination?.();
      } catch (err) {
        devWarn('[AudioEngine] masterGain.toDestination failed', err);
      }
    } else {
      try {
        last.toDestination?.();
      } catch (err) {
        devWarn('[AudioEngine] chain.toDestination failed', err);
      }
    }

    // Each room → its return → the join node. Absent rooms, returns or join nodes are skipped. Without a widener the
    // Controlled join falls through to the Limiter, as it was before the widener existed.
    const join = (controlledDecay ? _globalStereoWidener : _globalCompressor) ?? _globalLimiter ?? _globalCompressor;
    if (join) {
      _globalReverb?.connect(_globalReverbReturn ?? join);
      _globalReverbReturn?.connect(join);
      _globalDelay?.connect(_globalDelayReturn ?? join);
      _globalDelayReturn?.connect(join);
    }
  } catch (err) {
    devWarn('[AudioEngine] wireGlobalFxChain failed', err);
  }

  // disconnectAllFxNodes() above dropped every output of every FX node — including any diagnostic tap.
  // Put the taps back (and build them, if they were asked for before this chain existed). A no-op
  // unless attachOutputTaps() was called, so with `?debug` off this changes nothing.
  connectTapsIfWanted();
}

/** The live chain-entry node — the entry cycle-search cut, which feeds the EQ3 (first in both Natural and Controlled
 *  Decay topologies), or the EQ3 itself when no Delay node could be built — read by AudioEngine.ts's reserveVoice() to
 *  connect each robot's per-voice bus into the global chain. Entering at a delay node keeps every bus connect's cycle
 *  search to one node (see CHAIN_CUT_OPTIONS). Null until buildGlobalFxChain() has run. Replaces the old
 *  getMasterCompressor(), which stopped being accurate once the V2 reorder moved Compressor off the front of the chain. */
export function getGlobalChainEntry(): Tone.ToneAudioNode | null {
  return _entryCut ?? _globalEQ;
}

/** The Reverb room, read by AudioEngine.ts's reserveVoice() to connect each robot's reverb send into it.
 *  Null until buildGlobalFxChain() has run (and in a headless env with no Tone.Reverb). */
export function getGlobalReverbRoom(): Tone.Reverb | null {
  return _globalReverb;
}

/** The Delay room — as getGlobalReverbRoom, for each robot's delay send. */
export function getGlobalDelayRoom(): Tone.FeedbackDelay | null {
  return _globalDelay;
}

// ========================================
// OUTPUT TAPS (read-only diagnostics)
// ========================================
// Two analysers for the `?debug` overlay, to tell a silent graph from loss after the graph
// (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md): one on EQ3's output (what the voices hand the chain) and one on
// masterGain's output (what the destination receives). They only listen — they connect to nothing and
// never to the destination, and they exist only between attachOutputTaps() and detachOutputTaps().
//
// They are NATIVE AnalyserNodes made from Tone's raw context, not Tone.Analyser: that wrapper sets
// fftSize = 2 * size and caps size at 16384, so it cannot build the window below, and it fills its size-long
// buffer from only the older half of the fftSize window. Found in the real-browser check (audio output
// diagnostic task 6); the native configuration is the one probed in headless Chrome 153 (task 1).

/** fftSize of each tap — the largest Web Audio allows — and the length of the buffer read from it. One buffer
 *  must cover a whole sampler interval, or a quiet gap between two samples goes unseen: 32768 samples ≈ 0.68 s
 *  at 48 kHz (0.74 s at 44.1 kHz) against the 500 ms sampler. */
export const OUTPUT_TAP_SIZE = 32768;

/** A native analyser and the one buffer it is read into — reused every tick rather than allocating ~128 KB each time. */
interface OutputTap {
  node: AnalyserNode;
  buffer: Float32Array<ArrayBuffer>;
}

function createTap(): OutputTap {
  const context = Tone.getContext().rawContext as unknown as BaseAudioContext;
  const node = context.createAnalyser();
  node.fftSize = OUTPUT_TAP_SIZE;
  return { node, buffer: new Float32Array(OUTPUT_TAP_SIZE) };
}

/** Feed `tap` from `source`. A failure is warned about, never thrown — a diagnostic must not break audio. */
function connectTap(source: Tone.ToneAudioNode | null, tap: OutputTap | null, label: string): void {
  if (!source || !tap) return;
  try {
    source.connect(tap.node);
  } catch (err) {
    devWarn(`[AudioEngine] output tap connect failed (${label})`, err);
  }
}

/** Build any missing tap whose source node exists, and (re)connect it. Does nothing unless taps were requested. */
function connectTapsIfWanted(): void {
  if (!_tapsWanted) return;
  try {
    if (_globalEQ) _preTap ??= createTap();
    if (_masterGain) _masterTap ??= createTap();
  } catch (err) {
    devWarn('[AudioEngine] output tap construction failed', err);
    return;
  }
  connectTap(_globalEQ, _preTap, 'pre-chain');
  connectTap(_masterGain, _masterTap, 'master');
}

/** Start listening: taps are built and connected as soon as the chain they listen to exists. */
export function attachOutputTaps(): void {
  _tapsWanted = true;
  connectTapsIfWanted();
}

function releaseTap(source: Tone.ToneAudioNode | null, tap: OutputTap | null): void {
  if (!tap) return;
  try {
    source?.disconnect(tap.node);
  } catch (err) {
    devWarn('[AudioEngine] output tap disconnect failed', err);
  }
}

/** Stop listening: disconnect both taps and drop them. Safe with nothing attached, and safe to repeat. */
export function detachOutputTaps(): void {
  _tapsWanted = false;
  releaseTap(_globalEQ, _preTap);
  releaseTap(_masterGain, _masterTap);
  _preTap = null;
  _masterTap = null;
}

function readTap(tap: OutputTap | null): Float32Array | null {
  if (!tap) return null;
  try {
    tap.node.getFloatTimeDomainData(tap.buffer);
    return tap.buffer;
  } catch (err) {
    devWarn('[AudioEngine] output tap read failed', err);
    return null;
  }
}

/**
 * The latest full window from each tap, or null for a tap that is not attached or cannot be read. Never throws.
 * Each buffer is reused by the next read, so use it (e.g. measureLevel) before reading again.
 */
export function readOutputTaps(): { pre: Float32Array | null; master: Float32Array | null } {
  return { pre: readTap(_preTap), master: readTap(_masterTap) };
}

/** Reverb generates its impulse response asynchronously — AudioEngine.start()
 *  awaits this before starting the transport. No-op if reverb wasn't built
 *  (headless/test env) or has no `.ready` promise. */
export async function waitForGlobalReverbReady(): Promise<void> {
  const reverb = _globalReverb;
  if (!reverb) return;
  try {
    await reverb.ready;
  } catch (err) {
    devWarn('[AudioEngine] reverb.ready failed', err);
  }
}

/** Set master volume (clamped to [0,1]). */
export function setMasterVolume(volume: number): void {
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  _masterVolume = v;
  const masterGain = _masterGain;
  if (masterGain) {
    try {
      masterGain.gain.value = v;
    } catch (err) {
      devWarn('[AudioEngine] setMasterVolume failed', err);
    }
  }
}

/** Get the current master volume (0..1). */
export function getMasterVolume(): number {
  try {
    if (_masterGain && typeof _masterGain.gain.value === 'number') {
      return _masterGain.gain.value ?? _masterVolume;
    }
  } catch {
    /* ignore */
  }
  return _masterVolume;
}

// ========================================
// GLOBAL FX SETTERS
// ========================================

/**
 * How long to wait, after the last `decay`/`preDelay` write, before pushing them to the live
 * Tone.Reverb. Each of those two setters calls `Reverb.generate()`: an OfflineContext render of
 * `decay + preDelay` seconds of stereo noise (up to ~11 s at the slider maximum) plus a convolver
 * buffer swap. The Audio Rig sliders fire on every change event during a drag, so without this
 * one drag queues dozens of renders. `wet` is a plain AudioParam and is never deferred.
 *
 * A wall-clock timer is correct here: this is a UI commit debounce, not musical timing
 * (CLAUDE.md's timer rule is about scheduling audio events).
 */
export const REVERB_IR_COALESCE_MS = 120;

let _pendingReverbIr: { decay?: number; preDelay?: number } | null = null;
let _reverbIrTimer: ReturnType<typeof setTimeout> | null = null;

/** Push the coalesced decay/preDelay to the node, writing only fields that actually differ. */
function flushReverbIr(): void {
  _reverbIrTimer = null;
  const pending = _pendingReverbIr;
  _pendingReverbIr = null;
  const reverb = _globalReverb;
  if (!pending || !reverb) return;
  try {
    if (pending.decay !== undefined && pending.decay !== reverb.decay) reverb.decay = pending.decay;
    if (pending.preDelay !== undefined && pending.preDelay !== reverb.preDelay) reverb.preDelay = pending.preDelay;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalReverb (impulse response) failed', err);
  }
}

export function setGlobalReverb(params: Partial<ReverbSettings>): void {
  const reverb = _globalReverb;
  if (!reverb) return;
  try {
    // wet is the room's return level (the room itself stays fully wet, docs/specs/ROBOT_SENDS.md §1.3).
    if (params.wet !== undefined && _globalReverbReturn) _globalReverbReturn.gain.value = params.wet;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalReverb failed', err);
  }
  if (params.decay === undefined && params.preDelay === undefined) return;
  _pendingReverbIr = { ..._pendingReverbIr };
  if (params.decay !== undefined) _pendingReverbIr.decay = params.decay;
  if (params.preDelay !== undefined) _pendingReverbIr.preDelay = params.preDelay;
  if (_reverbIrTimer !== null) clearTimeout(_reverbIrTimer);
  _reverbIrTimer = setTimeout(flushReverbIr, REVERB_IR_COALESCE_MS);
}

export function setGlobalDelay(params: Partial<DelaySettings>): void {
  const delay = _globalDelay;
  if (!delay) return;
  try {
    // wet is the room's return level, as for the Reverb.
    if (params.wet !== undefined && _globalDelayReturn) _globalDelayReturn.gain.value = params.wet;
    if (params.delayTime !== undefined) delay.delayTime.value = params.delayTime;
    if (params.feedback !== undefined) delay.feedback.value = params.feedback;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalDelay failed', err);
  }
}

export function setGlobalFilterLPF(params: Partial<FilterSettings>): void {
  const lpf = _globalLPF;
  if (!lpf) return;
  try {
    if (params.frequency !== undefined) rampOrSet(lpf.frequency as unknown as { rampTo?: (value: number, rampTime: number) => void; value: number }, params.frequency, FILTER_FREQUENCY_RAMP_SECONDS);
    if (params.Q !== undefined) lpf.Q.value = params.Q;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalFilterLPF failed', err);
  }
}

export function setGlobalFilterHPF(params: Partial<FilterSettings>): void {
  const hpf = _globalHPF;
  if (!hpf) return;
  try {
    if (params.frequency !== undefined) rampOrSet(hpf.frequency as unknown as { rampTo?: (value: number, rampTime: number) => void; value: number }, params.frequency, FILTER_FREQUENCY_RAMP_SECONDS);
    if (params.Q !== undefined) hpf.Q.value = params.Q;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalFilterHPF failed', err);
  }
}

export function setGlobalDistortion(params: Partial<DistortionSettings>): void {
  const distortion = _globalDistortion;
  if (!distortion) return;
  try {
    const amount = params.amount === undefined ? undefined : clampColour('distortion.amount', params.amount);
    const wet = params.wet === undefined ? undefined : clampColour('distortion.wet', params.wet);
    if (amount !== undefined) distortion.distortion = amount;
    if (wet !== undefined) rampOrSet(distortion.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalDistortion failed', err);
  }
}

export function setGlobalChebyshev(params: Partial<ChebyshevSettings>): void {
  const chebyshev = _globalChebyshev;
  if (!chebyshev) return;
  try {
    const order = params.order === undefined ? undefined : clampColour('chebyshev.order', Math.round(params.order));
    const wet = params.wet === undefined ? undefined : clampColour('chebyshev.wet', params.wet);
    if (order !== undefined) chebyshev.order = order;
    if (wet !== undefined) rampOrSet(chebyshev.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalChebyshev failed', err);
  }
}

export function setGlobalBitCrusher(params: Partial<BitCrusherSettings>): void {
  const crusher = _globalBitCrusher;
  if (!crusher) return;
  try {
    const bits = params.bits === undefined ? undefined : clampColour('bitCrusher.bits', params.bits);
    const wet = params.wet === undefined ? undefined : clampColour('bitCrusher.wet', params.wet);
    if (bits !== undefined) rampOrSet(crusher.bits, bits, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) rampOrSet(crusher.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalBitCrusher failed', err);
  }
}

/** Auto Wah (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.3). The sweep range, sensitivity and follower smoothing are
 *  plain properties in Tone 15; Q and gain are Signals; the Mix is tapered like Colour's (colourWetGain). */
export function setGlobalAutoWah(params: Partial<AutoWahSettings>): void {
  const wah = _globalAutoWah;
  if (!wah) return;
  try {
    const baseFrequency = clampIfGiven('autoWah.baseFrequency', params.baseFrequency);
    const octaves = clampIfGiven('autoWah.octaves', params.octaves);
    const sensitivity = clampIfGiven('autoWah.sensitivity', params.sensitivity);
    const follower = clampIfGiven('autoWah.follower', params.follower);
    const Q = clampIfGiven('autoWah.Q', params.Q);
    const gain = clampIfGiven('autoWah.gain', params.gain);
    const wet = clampIfGiven('autoWah.wet', params.wet);
    if (baseFrequency !== undefined) wah.baseFrequency = baseFrequency;
    if (octaves !== undefined) wah.octaves = octaves;
    if (sensitivity !== undefined) wah.sensitivity = sensitivity;
    if (follower !== undefined) wah.follower = follower;
    if (Q !== undefined) rampOrSet(wah.Q, Q, COLOUR_RAMP_SECONDS);
    if (gain !== undefined) rampOrSet(wah.gain, gain, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) rampOrSet(wah.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalAutoWah failed', err);
  }
}

/**
 * Replaces the Phaser with one built at `stages` from the last-written values (spec §1.3), then re-wires the chain in
 * the Decay Mode it was last wired in. The new node is built FIRST: if the constructor fails the old node is kept,
 * undisposed and still wired, and the caller carries on with it; the next Stages edit tries again. True on success.
 */
function rebuildPhaser(stages: number): boolean {
  const PhaserCtor = getToneCtor<Tone.Phaser>('Phaser');
  if (!PhaserCtor) return false;
  let fresh: Tone.Phaser;
  try {
    fresh = buildPhaser(PhaserCtor, stages, _phaserLive);
  } catch (err) {
    devWarn('[AudioEngine] Phaser could not be rebuilt at ' + stages + ' stages; keeping the current one', err);
    return false;
  }
  const old = _globalPhaser;
  _globalPhaser = fresh;
  _phaserStages = stages;
  try {
    old?.dispose();
  } catch (err) {
    devWarn('[AudioEngine] disposing the replaced Phaser failed', err);
  }
  wireGlobalFxChain(_lastControlledDecay);
  return true;
}

/** Phaser (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.3). The store resolves a synced Rate to Hz first, so `rate` here
 *  is always Hz and `sync` never arrives. Rate and Q are Signals, octaves and baseFrequency plain setters, and the Mix is
 *  tapered like Colour's; `stages` is constructor-only, so a changed count rebuilds the node. */
export function setGlobalPhaser(params: Partial<Omit<PhaserSettings, 'sync'>>): void {
  const phaser = _globalPhaser;
  if (!phaser) return;
  try {
    const rate = clampIfGiven('phaser.rate', params.rate);
    const octaves = clampIfGiven('phaser.octaves', params.octaves);
    const baseFrequency = clampIfGiven('phaser.baseFrequency', params.baseFrequency);
    const Q = clampIfGiven('phaser.Q', params.Q);
    const wet = clampIfGiven('phaser.wet', params.wet);
    const stages = clampIfGiven('phaser.stages', params.stages === undefined ? undefined : Math.round(params.stages));

    // The mirror takes only what passed the clamp, and is updated before any rebuild so a rebuilt node is built from it.
    if (rate !== undefined) _phaserLive.rate = rate;
    if (octaves !== undefined) _phaserLive.octaves = octaves;
    if (baseFrequency !== undefined) _phaserLive.baseFrequency = baseFrequency;
    if (Q !== undefined) _phaserLive.Q = Q;
    if (wet !== undefined) _phaserLive.wet = wet;

    // A rebuilt node comes up at the mirror's values, this edit's included, so there is nothing left to write to it.
    if (stages !== undefined && stages !== _phaserStages && rebuildPhaser(stages)) return;

    if (rate !== undefined) rampOrSet(phaser.frequency, rate, COLOUR_RAMP_SECONDS);
    if (octaves !== undefined) phaser.octaves = octaves;
    if (baseFrequency !== undefined) phaser.baseFrequency = baseFrequency;
    if (Q !== undefined) rampOrSet(phaser.Q, Q, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) rampOrSet(phaser.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalPhaser failed', err);
  }
}

/** The Tone 15 Chorus internals a ramped Delay / Depth change writes: the stored centre (SECONDS) and depth, and each
 *  LFO's Scale, whose `_add` (the range's floor) and `_mult` (its span) are Signals. */
type ChorusScale = { _min: number; _max: number; _add: { rampTo?: (value: number, rampTime: number) => void; value: unknown }; _mult: { rampTo?: (value: number, rampTime: number) => void; value: unknown } };
type ChorusSweep = { _delayTime: number; _depth: number; _lfoL?: { _scaler?: ChorusScale }; _lfoR?: { _scaler?: ChorusScale } };

/**
 * A Chorus Delay (ms) and / or Depth change, ramped (docs/specs/GLOBAL_PEDALS.md §8). Tone's own `delayTime` / `depth`
 * setters write each LFO's range as an instant Signal step (Scale._setRange), which jumps the delay's read position: in
 * an offline render one 0.5 ms Delay step measured x217 the steady waveform's peak second difference, one 0.01 Depth step
 * x13, the same changes ramped like this x1. So this computes the range as Tone's setter does (centre d, deviation
 * d * depth, floor d - deviation) and ramps the two Signals of both LFOs over COLOUR_RAMP_SECONDS, keeping
 * Tone's stored fields in step so its getters and any later setter agree. When the internals are not the shape this
 * was written against (a Tone upgrade, a test stub), it falls back to Tone's setters, which step.
 */
function rampChorusSweep(chorus: Tone.Chorus, delayTimeMs: number | undefined, depth: number | undefined): void {
  const sweep = chorus as unknown as Partial<ChorusSweep>;
  const scales = [sweep._lfoL?._scaler, sweep._lfoR?._scaler];
  if (typeof sweep._delayTime !== 'number' || typeof sweep._depth !== 'number' || !scales.every((s) => s?._add && s._mult)) {
    if (delayTimeMs !== undefined) chorus.delayTime = delayTimeMs;
    if (depth !== undefined) chorus.depth = depth;
    return;
  }
  const centre = delayTimeMs === undefined ? sweep._delayTime : delayTimeMs / 1000;
  const newDepth = depth === undefined ? sweep._depth : depth;
  const deviation = centre * newDepth;
  // Tone floors this at 0; Depth arrives clamped to 0 - 1, so the floor can never bite here.
  const min = centre - deviation;
  const max = centre + deviation;
  sweep._delayTime = centre;
  sweep._depth = newDepth;
  for (const scale of scales as ChorusScale[]) {
    scale._min = min;
    scale._max = max;
    rampOrSet(scale._add, min, COLOUR_RAMP_SECONDS);
    rampOrSet(scale._mult, max - min, COLOUR_RAMP_SECONDS);
  }
}

/**
 * The Spread de-click (docs/specs/GLOBAL_PEDALS.md §8). Tone's Chorus and Tremolo `spread` setters swap both LFOs'
 * waveform at once, on the audio thread's current time, so the sweep jumps: in a real-time context one 5° step clicked
 * x49-79 on a lit Chorus and x7 on a lit Tremolo. A lit pedal is ducked instead: its Mix ramps to dry, the Spread is
 * written from Tone's audio-clock timer (as scheduleVoiceRelease uses it) once that ramp has run, and the Mix ramps
 * back; measured x1.3 / x1.6. Ramps start lookAhead ahead of the audio thread and the swap does not, so the write waits
 * lookAhead + the ramp + a margin. Every step of a drag re-arms the one timer, so the pedal stays dry until the drag
 * stops and only the last Spread is written. A dry pedal is written at once: there is nothing to hear.
 */
const SPREAD_DUCK_SECONDS = 0.02;
const SPREAD_WRITE_MARGIN_SECONDS = 0.01;
type SpreadPedal = 'chorus' | 'tremolo';
type SpreadNode = { spread: number; wet: { rampTo?: (value: number, rampTime: number) => void; value: unknown } };
/** The Mix gain (already tapered) each Spread pedal's node was last given: what a duck ramps back to. 0 = dry. */
const _spreadWetGain: Record<SpreadPedal, number> = { chorus: 0, tremolo: 0 };
/** A duck in progress: the Spread to write and the timer that writes it. */
const _spreadDuck: Partial<Record<SpreadPedal, { spread: number; timer: number }>> = {};
/** The Spread each node has, or is about to get from a duck. Every whole-block apply re-sends it, and a lit pedal must
 *  not drop to dry for a value it already has. */
const _spreadTarget: Record<SpreadPedal, number> = {
  chorus: DEFAULT_GLOBAL_AUDIO_SETTINGS.chorus.spread,
  tremolo: DEFAULT_GLOBAL_AUDIO_SETTINGS.tremolo.spread,
};

/** Drop every pending duck and forget the Mix gains: the nodes are being rebuilt dry, at the default Spread. */
function resetSpreadDucks(): void {
  for (const pedal of ['chorus', 'tremolo'] as const) {
    const pending = _spreadDuck[pedal];
    if (pending) Tone.getContext().clearTimeout(pending.timer);
    delete _spreadDuck[pedal];
    _spreadWetGain[pedal] = 0;
    _spreadTarget[pedal] = DEFAULT_GLOBAL_AUDIO_SETTINGS[pedal].spread;
  }
}

/** A Spread write: nothing if the node has (or is getting) it, at once on a dry pedal, ducked on a lit one. */
function writeSpread(pedal: SpreadPedal, node: SpreadNode, spread: number): void {
  if (spread === _spreadTarget[pedal]) return;
  _spreadTarget[pedal] = spread;
  const pending = _spreadDuck[pedal];
  if (!pending && _spreadWetGain[pedal] === 0) {
    node.spread = spread;
    return;
  }
  const context = Tone.getContext();
  if (pending) context.clearTimeout(pending.timer);
  else rampOrSet(node.wet, 0, SPREAD_DUCK_SECONDS);
  const timer = context.setTimeout(
    () => finishSpreadDuck(pedal, node),
    context.lookAhead + SPREAD_DUCK_SECONDS + SPREAD_WRITE_MARGIN_SECONDS,
  );
  _spreadDuck[pedal] = { spread, timer };
}

/** The bottom of a duck: write the Spread and ramp the Mix back. (A rebuild cancels the timer: resetSpreadDucks.) */
function finishSpreadDuck(pedal: SpreadPedal, node: SpreadNode): void {
  const pending = _spreadDuck[pedal];
  delete _spreadDuck[pedal];
  if (!pending) return;
  try {
    node.spread = pending.spread;
    rampOrSet(node.wet, _spreadWetGain[pedal], SPREAD_DUCK_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] a ducked Spread write failed', err);
  }
}

/** A Mix write on a Spread pedal: remembered as the duck's return level, and ramped now unless a duck holds it dry. */
function writeSpreadPedalWet(pedal: SpreadPedal, node: SpreadNode, wet: number): void {
  _spreadWetGain[pedal] = colourWetGain(wet);
  if (!_spreadDuck[pedal]) rampOrSet(node.wet, _spreadWetGain[pedal], COLOUR_RAMP_SECONDS);
}

/** Chorus (docs/specs/GLOBAL_PEDALS.md §1.3). The store resolves a synced Rate to Hz first, so `rate` here is always Hz
 *  and `sync` never arrives. Rate (Tone's `frequency`) and feedback are Signals; delayTime (ms) and depth are ramped
 *  through the LFOs' range (rampChorusSweep); spread is ducked when lit (writeSpread); the Mix is tapered like Colour's. */
export function setGlobalChorus(params: Partial<Omit<ChorusSettings, 'sync'>>): void {
  const chorus = _globalChorus;
  if (!chorus) return;
  try {
    const rate = clampIfGiven('chorus.rate', params.rate);
    const delayTime = clampIfGiven('chorus.delayTime', params.delayTime);
    const depth = clampIfGiven('chorus.depth', params.depth);
    const spread = clampIfGiven('chorus.spread', params.spread);
    const feedback = clampIfGiven('chorus.feedback', params.feedback);
    const wet = clampIfGiven('chorus.wet', params.wet);
    if (rate !== undefined) rampOrSet(chorus.frequency, rate, COLOUR_RAMP_SECONDS);
    if (delayTime !== undefined || depth !== undefined) rampChorusSweep(chorus, delayTime, depth);
    if (spread !== undefined) writeSpread('chorus', chorus, spread);
    if (feedback !== undefined) rampOrSet(chorus.feedback, feedback, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) writeSpreadPedalWet('chorus', chorus, wet);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalChorus failed', err);
  }
}

/** Tremolo (docs/specs/GLOBAL_PEDALS.md §1.3). Rate (Tone's `frequency`) and depth are Signals fanned to both LFOs;
 *  spread is ducked when lit (writeSpread); the Mix is tapered like Colour's. `rate` arrives already resolved to Hz. */
export function setGlobalTremolo(params: Partial<Omit<TremoloSettings, 'sync'>>): void {
  const tremolo = _globalTremolo;
  if (!tremolo) return;
  try {
    const rate = clampIfGiven('tremolo.rate', params.rate);
    const depth = clampIfGiven('tremolo.depth', params.depth);
    const spread = clampIfGiven('tremolo.spread', params.spread);
    const wet = clampIfGiven('tremolo.wet', params.wet);
    if (rate !== undefined) rampOrSet(tremolo.frequency, rate, COLOUR_RAMP_SECONDS);
    if (depth !== undefined) rampOrSet(tremolo.depth, depth, COLOUR_RAMP_SECONDS);
    if (spread !== undefined) writeSpread('tremolo', tremolo, spread);
    if (wet !== undefined) writeSpreadPedalWet('tremolo', tremolo, wet);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalTremolo failed', err);
  }
}

/** Vibrato (docs/specs/GLOBAL_PEDALS.md §1.3). Rate (Tone's `frequency`) and depth are the LFO's Signals; the Mix is
 *  tapered like Colour's. `rate` arrives already resolved to Hz. Stereo: one LFO moves one delay for both channels. */
export function setGlobalVibrato(params: Partial<Omit<VibratoSettings, 'sync'>>): void {
  const vibrato = _globalVibrato;
  if (!vibrato) return;
  try {
    const rate = clampIfGiven('vibrato.rate', params.rate);
    const depth = clampIfGiven('vibrato.depth', params.depth);
    const wet = clampIfGiven('vibrato.wet', params.wet);
    if (rate !== undefined) rampOrSet(vibrato.frequency, rate, COLOUR_RAMP_SECONDS);
    if (depth !== undefined) rampOrSet(vibrato.depth, depth, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) rampOrSet(vibrato.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalVibrato failed', err);
  }
}

/** Frequency Shifter (docs/specs/GLOBAL_PEDALS.md §1.3). `shift` is Tone's signed `frequency` Signal, clamped into
 *  -1000..1000 by its sign (never by magnitude); the Mix is tapered like Colour's. Half mono: Tone negates the sine
 *  branch into `Add.addend`, an AudioParam, which the browser downmixes, while the cosine branch stays stereo. A centred
 *  voice shifts cleanly; a hard-panned one leaks the other sideband at a third of the wanted one and puts both, at a
 *  quarter level, in the far channel (measured, docs/specs/GLOBAL_PEDALS.md §8). */
export function setGlobalFrequencyShifter(params: Partial<FrequencyShifterSettings>): void {
  const shifter = _globalFrequencyShifter;
  if (!shifter) return;
  try {
    const shift = clampIfGiven('frequencyShifter.shift', params.shift);
    const wet = clampIfGiven('frequencyShifter.wet', params.wet);
    if (shift !== undefined) rampOrSet(shifter.frequency, shift, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) rampOrSet(shifter.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalFrequencyShifter failed', err);
  }
}

/** Width (docs/specs/GLOBAL_PEDALS.md §1.3). Tone's `width` Signal, clamped 0 - 1 and NEVER tapered: 0.5 is unity
 *  (as recorded), 0 folds everything after the rooms' join to mono, 1 is all side. The node's own `wet` stays 1. */
export function setGlobalStereoWidener(params: Partial<StereoWidenerSettings>): void {
  const widener = _globalStereoWidener;
  if (!widener) return;
  try {
    const width = clampIfGiven('stereoWidener.width', params.width);
    if (width !== undefined) rampOrSet(widener.width, width, COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalStereoWidener failed', err);
  }
}

export function setGlobalEQ(params: Partial<EQ3Settings>): void {
  const eq = _globalEQ;
  if (!eq) return;
  try {
    if (params.low !== undefined) eq.low.value = params.low;
    if (params.mid !== undefined) eq.mid.value = params.mid;
    if (params.high !== undefined) eq.high.value = params.high;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalEQ failed', err);
  }
}

export function setGlobalCompressor(params: Partial<CompressorSettings>): void {
  if (!_globalCompressor) return;
  try {
    if (params.threshold !== undefined) _globalCompressor.threshold.value = params.threshold;
    if (params.ratio !== undefined) _globalCompressor.ratio.value = params.ratio;
    if (params.attack !== undefined) _globalCompressor.attack.value = params.attack;
    if (params.release !== undefined) _globalCompressor.release.value = params.release;
    if (params.knee !== undefined) _globalCompressor.knee.value = params.knee;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalCompressor failed', err);
  }
}

export function setGlobalLimiter(params: Partial<LimiterSettings>): void {
  const limiter = _globalLimiter;
  if (!limiter) return;
  try {
    if (params.threshold !== undefined) limiter.threshold.value = params.threshold;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalLimiter failed', err);
  }
}

/**
 * Resolve the live, connectable Tone Signal/Param for a global-chain LFO
 * modulation target (docs/tasks/LFO_INTEGRATION_PLAN.md Task 10). Returns
 * null — never throws — before buildGlobalFxChain() has run (module-scope
 * _global* nodes are null until then). Neither Limiter nor Delay's
 * delayTime ever appears here: neither is a GlobalLfoTargetId member (no
 * LFO on the Limiter by design; delayTime's LFO was removed after shipping).
 */
export function getGlobalModulationTarget(target: GlobalLfoTargetId): ModulationTarget | null {
  try {
    switch (target) {
      case 'eq3.low':
        return _globalEQ?.low ?? null;
      case 'eq3.mid':
        return _globalEQ?.mid ?? null;
      case 'eq3.high':
        return _globalEQ?.high ?? null;
      case 'lpf.frequency':
        return _globalLPF?.frequency ?? null;
      case 'lpf.Q':
        return _globalLPF?.Q ?? null;
      case 'hpf.frequency':
        return _globalHPF?.frequency ?? null;
      case 'hpf.Q':
        return _globalHPF?.Q ?? null;
      default:
        return null;
    }
  } catch (err) {
    devWarn('[AudioEngine] getGlobalModulationTarget failed', err);
    return null;
  }
}
