import * as Tone from 'tone';

import { getToneCtor, type ModulationTarget } from './toneHelpers';
import { devWarn } from '@/utils/helpers';
import type { ReverbSettings, DelaySettings, FilterSettings, EQ3Settings, CompressorSettings, LimiterSettings } from '@/types/globalAudio';
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

/** Ramp a Signal-backed AudioParam-like value to `target` when it supports .rampTo(), falling
 *  back to a direct .value assignment when it doesn't (headless/test environments). */
function rampOrSet(param: { rampTo?: (value: number, rampTime: number) => void; value: number }, target: number, rampSeconds: number): void {
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

  if (ReverbCtor) {
    _globalReverb = new ReverbCtor({ decay: 1.5, preDelay: 0.02, wet: 0.3 });
  }
  if (DelayCtor) {
    // maxDelay is explicit on purpose: it must stay >= the max of
    // GLOBAL_AUDIO_SEED_RANGES['delay.delayTime'] (10s). Previously this was
    // an unset, implicit reliance on Tone.FeedbackDelay's own default of 1 —
    // correct today only by coincidence, and silently driftable if either
    // side changed independently.
    _globalDelay = new DelayCtor({ delayTime: 0.25, feedback: 0.2, wet: 0, maxDelay: 10 });
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
  if (GainCtorFX) {
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
  const nodes = [
    _globalEQ,
    _globalLPF,
    _globalHPF,
    _globalDelay,
    _globalReverb,
    _globalCompressor,
    _globalLimiter,
    _masterGain,
  ].filter(Boolean) as Array<{ disconnect: () => void }>;
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch (err) {
      devWarn('[AudioEngine] disconnect failed during FX rewire', err);
    }
  }
}

/**
 * Wire the global FX chain into one of two fixed topologies, tearing down
 * whatever was previously connected first:
 *
 * - Natural Decay (controlledDecay=false, default): EQ3 → LPF → HPF → Delay →
 *   Reverb → Compressor → Limiter — the two time-based effects' tails ring
 *   out before compression.
 * - Controlled Decay (controlledDecay=true): EQ3 → LPF → HPF → Compressor →
 *   Delay → Reverb → Limiter — compression happens before both Delay and
 *   Reverb, tightening their tails.
 *
 * Both topologies terminate at masterGain → Destination (or straight to
 * Destination if masterGain wasn't constructed). Called once from
 * buildGlobalFxChain() and again whenever the "Natural Decay" / "Controlled
 * Decay" toggle flips (src/stores/audioStore.ts's setCompressorBeforeDelay).
 */
export function wireGlobalFxChain(controlledDecay: boolean): void {
  disconnectAllFxNodes();

  const orderedNodes = controlledDecay
    ? [_globalEQ, _globalLPF, _globalHPF, _globalCompressor, _globalDelay, _globalReverb, _globalLimiter]
    : [_globalEQ, _globalLPF, _globalHPF, _globalDelay, _globalReverb, _globalCompressor, _globalLimiter];

  const chainNodes = orderedNodes.filter(Boolean) as Array<{
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
  } catch (err) {
    devWarn('[AudioEngine] wireGlobalFxChain failed', err);
  }

  // disconnectAllFxNodes() above dropped every output of every FX node — including any diagnostic tap.
  // Put the taps back (and build them, if they were asked for before this chain existed). A no-op
  // unless attachOutputTaps() was called, so with `?debug` off this changes nothing.
  connectTapsIfWanted();
}

/** The live chain-entry node — EQ3, first in both Natural and Controlled
 *  Decay topologies — read by AudioEngine.ts's reserveVoice() to connect each
 *  robot's per-voice bus into the global chain. Null until
 *  buildGlobalFxChain() has run. Replaces the old getMasterCompressor(),
 *  which stopped being accurate once the V2 reorder moved Compressor off the
 *  front of the chain. */
export function getGlobalChainEntry(): Tone.EQ3 | null {
  return _globalEQ;
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

export function setGlobalReverb(params: Partial<ReverbSettings>): void {
  const reverb = _globalReverb;
  if (!reverb) return;
  try {
    if (params.wet !== undefined) reverb.wet.value = params.wet;
    if (params.decay !== undefined) reverb.decay = params.decay;
    if (params.preDelay !== undefined) reverb.preDelay = params.preDelay;
  } catch (err) {
    devWarn('[AudioEngine] setGlobalReverb failed', err);
  }
}

export function setGlobalDelay(params: Partial<DelaySettings>): void {
  const delay = _globalDelay;
  if (!delay) return;
  try {
    if (params.wet !== undefined) delay.wet.value = params.wet;
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
