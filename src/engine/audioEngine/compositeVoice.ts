import * as Tone from 'tone';

import { getToneCtor, type MinimalToneNode, type SynthWithOscillator } from './toneHelpers';
import { setOrGlide, type RampableParam } from './voiceEntry';
import { devWarn } from '@/utils/helpers';
import type { ADSREnvelope, NoteDuration, WaveformType } from '@/types/Robot';
import type { OscillatorLayer } from '@/types/layeredAudio';

/** Create a per-layer gain node connected to `out`, falling back to a stub in headless/test envs. */
function createLayerGain(value: number, out: Tone.Gain): Tone.Gain {
  const GainCtor = getToneCtor<Tone.Gain>('Gain');
  if (GainCtor) return new GainCtor(value).connect(out);
  const node: MinimalToneNode = { gain: { value }, connect: function () { return node; } };
  return node as unknown as Tone.Gain;
}

/**
 * Set a layer synth's detune directly on its oscillator's detune Signal. No `.set()` fallback
 * chain needed here — detune is always a real Signal (with a `.value`) on any real Tone
 * oscillator, unlike phase/width below. Shared by construction and the live-update `set({
 * layers })` path (docs/tasks/archive/AUDIO_ENGINE_CLEANUP.md Task 4) — previously duplicated verbatim
 * in both places. `time` (the tick's time, docs/specs/BEATCLOCK_TRANSPORT_TIME.md) glides the write one
 * tick from there (setOrGlide).
 */
function applyOscDetune(synth: SynthWithOscillator, detune: number, verb: 'apply' | 'set', time?: number): void {
  try {
    const osc = (synth as unknown as { oscillator?: { detune?: RampableParam } })?.oscillator;
    if (osc && osc.detune) setOrGlide(osc.detune, detune, time);
  } catch (err) {
    devWarn(`[AudioEngine] Failed to ${verb} detune on composite layer`, err);
  }
}

/**
 * Set a layer synth's phase or pulse-width oscillator field, with the 3-level fallback both
 * call sites need since Tone.js doesn't guarantee a live Signal for every oscillator/field
 * combination (docs/AUDIO_SYSTEM.md's "Two Tone.js divergences" — phase in particular has none
 * at all): try `synth.set({ oscillator: { [setProp]: value } })` first; if that throws, try
 * writing `.value` on a Signal-shaped `oscillator[setProp]`; if that's not Signal-shaped either,
 * fall back to a raw property assignment. `setProp` is Tone's own oscillator property name
 * (`'phase'` or `'width'` — pulseWidth's Tone-facing key differs from its own field name);
 * `label` is only for the devWarn message, matching each field's existing wording. Shared by
 * construction and the live-update `set({ layers })` path — previously duplicated verbatim in
 * both places, for both fields.
 */
function applyOscFieldViaSet(
  synth: SynthWithOscillator,
  setProp: 'phase' | 'width',
  label: 'phase' | 'pulseWidth',
  value: number,
  verb: 'apply' | 'set',
): void {
  try {
    const osc = (synth as unknown as Record<string, Record<string, unknown> | undefined>)?.oscillator;
    if (osc) {
      try {
        synth.set?.({ oscillator: { [setProp]: value } });
      } catch {
        try {
          const oscField = osc[setProp] as { value?: number } | number | undefined;
          if (typeof oscField === 'object' && oscField !== null && 'value' in oscField) {
            (oscField as { value?: number }).value = value;
          } else {
            osc[setProp] = value;
          }
        } catch (err) {
          devWarn(`[AudioEngine] Failed to ${verb} ${label} on composite layer`, err);
        }
      }
    }
  } catch (err) {
    devWarn(`[AudioEngine] Failed to ${verb} ${label} on composite layer`, err);
  }
}

/**
 * The envelope object Tone.Synth takes, from the robot's stored ADSR. The four timings always; each
 * curve only when present, so `synth.set({ envelope })` never receives `attackCurve: undefined`
 * (Tone would try to apply it). The one place an absent curve becomes today's sound (Tone's linear
 * default) — docs/specs/ROBOT_ARTICULATION.md §4.
 */
export function toToneEnvelope(adsr: ADSREnvelope): Partial<Tone.EnvelopeOptions> {
  const envelope: Partial<Tone.EnvelopeOptions> = {
    attack: adsr.attack,
    decay: adsr.decay,
    sustain: adsr.sustain,
    release: adsr.release,
  };
  if (adsr.attackCurve !== undefined) envelope.attackCurve = adsr.attackCurve;
  if (adsr.releaseCurve !== undefined) envelope.releaseCurve = adsr.releaseCurve;
  return envelope;
}

const ADSR_FIELDS = ['attack', 'decay', 'sustain', 'release', 'attackCurve', 'releaseCurve'] as const;

/** Two envelopes are the same when every field is `===`, whatever their references (an absent curve equals an
 *  explicitly undefined one). */
function sameAdsr(a: ADSREnvelope, b: ADSREnvelope): boolean {
  return ADSR_FIELDS.every((k) => a[k] === b[k]);
}

/**
 * A live-update patch entry for `set({ layers })`: the four per-layer fields only. The ADSR and portamento are
 * robot-level and go through `setShared`, so each field has one way in (docs/specs/COMPOSITE_LAYER_WRITES.md §7 Q2).
 */
export type LayerLivePatch = Partial<Pick<OscillatorLayer, 'gain' | 'detune' | 'phase' | 'pulseWidth'>>;

/** The two robot-level fields `setShared` applies to every built layer. */
export interface SharedLivePatch {
  adsr?: ADSREnvelope;
  portamento?: number;
}

/** What the composite last wrote to one layer's synth: targets, never values read back from a node
 *  (docs/specs/COMPOSITE_LAYER_WRITES.md §3). */
export interface WrittenLayer {
  gain: number;
  detune: number;
  phase: number;
  pulseWidth?: number;
  portamento: number;
  adsr: ADSREnvelope;
}

/** One built layer: the robot layer it was built from, its live nodes, and what was last written to them. */
export interface LayerRecord {
  /** The robot layer this synth was built from (the index into `audioAttributes.layers`). */
  index: number;
  synth: Tone.Synth | null;
  gainNode: Tone.Gain | null;
  written: WrittenLayer;
}

// Composite voices (created from LayeredWave descriptors) — the shape reserveVoice stores.
export interface CompositeVoice {
  output: Tone.Gain;
  triggerAttackRelease: (note: string, dur: NoteDuration | string, time?: number, velocity?: number) => void;
  /** Live edit; patch `i` is for robot layer `i`. `time` is the Transport tick's time when a swell writes
   *  (docs/specs/BEATCLOCK_TRANSPORT_TIME.md); a UI edit passes none and lands now. Returns the robot indices whose
   *  non-zero gain found no synth (a layer muted at build being unmuted), ascending: the caller rebuilds. */
  set: (params: { layers?: LayerLivePatch[]; outputGain?: number }, time?: number) => { unrouted: number[] };
  /** The ADSR and portamento, applied to every built layer with the same skip as `set`. Both are settings, so a
   *  `time` is accepted and ignored. */
  setShared: (params: SharedLivePatch, time?: number) => void;
  /** The record built from robot layer `index`, or undefined when that layer has no synth (muted at build). */
  layerAt: (index: number) => LayerRecord | undefined;
  dispose?: () => void;
  /**
   * Per-layer live node references — synth (for oscillator.detune/width) and
   * gain node (for gain). Exposed for AudioEngine.getRobotModulationTarget
   * (docs/tasks/archive/LFO_INTEGRATION_PLAN.md Task 9) to resolve a connectable
   * Signal without duplicating layer-construction logic outside this module.
   */
  layers?: ReadonlyArray<LayerRecord>;
}

/**
 * Build a composite voice (one or more oscillator layers summed into a
 * single output Gain) from a LayeredWave descriptor. Pure construction only —
 * does not reserve/register the voice anywhere; AudioEngine.reserveVoice owns
 * the per-robot bus (panner/busGain/busFilter) and the compositeVoices registry.
 *
 * `adsr` is the robot's one shared envelope (Roadmap Phase 9) — applied
 * identically to every layer's synth at construction, the same "one shared
 * value applied across every layer" role `phase`/`detune`/`pulseWidth` play
 * elsewhere in AudioEngine.reserveVoice. There is no per-layer override
 * anymore; live envelope edits go through the unchanged `set({ layers })`
 * path below via AudioEngine.updateVoiceEnvelope.
 *
 * `portamento` (seconds each layer glides into the next note; 0 = none, today's sound) is likewise one
 * shared robot-level value applied to every layer's synth.
 *
 * `indices[k]` is the robot layer index of the k-th layer built (reserveVoice builds only audible layers, so a
 * muted layer leaves a gap); absent, it is `k`. Each record also keeps what construction wrote, as `written`.
 */
export function createCompositeVoice(
  descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] },
  adsr: ADSREnvelope,
  portamento = 0,
  indices?: number[],
): CompositeVoice {
  const GainCtor = getToneCtor<Tone.Gain>('Gain');
  const OutGain = GainCtor ? new GainCtor(1) : (() => {
    // Minimal fallback gain node for test environments where Tone.Gain isn't mocked
    const node: MinimalToneNode = {
      gain: { value: 1 },
      connect: function () { return node; },
      disconnect: function () { },
      toDestination: function () { },
    };
    return node as unknown as Tone.Gain;
  })();
  const out = OutGain as unknown as Tone.Gain;

  const layers: OscillatorLayer[] = Array.isArray(descriptor)
    ? descriptor
    : (descriptor.layers && descriptor.layers.length > 0
      ? descriptor.layers
      : (descriptor.base ? [{ type: descriptor.base, gain: 1, detune: 0, phase: 0 } as OscillatorLayer] : []));

  const layerNodes: LayerRecord[] = layers.map((layer, k) => {
    const oscConfig: Record<string, unknown> = { type: layer.type as WaveformType };
    // Apply per-layer pulse width when provided (meaningful for pulse/square)
    if (typeof layer.pulseWidth === 'number') oscConfig.width = layer.pulseWidth;

    const synth = new Tone.Synth({
      portamento,
      oscillator: oscConfig,
      envelope: toToneEnvelope(adsr),
    });
    const layerGain = createLayerGain(layer.gain ?? 1, out);
    if (layerGain && typeof synth?.connect === 'function') synth.connect(layerGain);
    if (layer.detune !== undefined) {
      applyOscDetune(synth as unknown as SynthWithOscillator, layer.detune, 'apply');
    }
    if (layer.phase !== undefined) {
      applyOscFieldViaSet(synth as unknown as SynthWithOscillator, 'phase', 'phase', layer.phase, 'apply');
    }
    if (layer.pulseWidth !== undefined) {
      applyOscFieldViaSet(synth as unknown as SynthWithOscillator, 'width', 'pulseWidth', layer.pulseWidth, 'apply');
    }

    const written: WrittenLayer = {
      gain: layer.gain ?? 1,
      detune: layer.detune ?? 0,
      phase: layer.phase ?? 0,
      portamento,
      adsr: { ...adsr },
    };
    if (layer.pulseWidth !== undefined) written.pulseWidth = layer.pulseWidth;

    return { index: indices?.[k] ?? k, synth, gainNode: layerGain, written };
  });

  const layerAt = (index: number): LayerRecord | undefined => layerNodes.find((rec) => rec.index === index);

  // Per-layer last-scheduled time tracker. Tone Source nodes (Synth, NoiseSynth) require
  // strictly increasing schedule times. We track the last time used per layer index so we
  // can always advance by at least 1ms even when multiple flurries hit the same composite
  // in the same AudioContext quantum (where Tone.now() returns the same value for all calls).
  const layerLastTime: number[] = layerNodes.map(() => -Infinity);

  const triggerAttackRelease = (note: string, dur: NoteDuration | string, time?: number, velocity?: number) => {
    const requested = (typeof time === 'number' && isFinite(time)) ? time : Tone.now();
    const durStr = String(dur);
    layerNodes.forEach(({ synth }, i) => {
      try {
        const t = Math.max(requested, Tone.now() + 0.001, layerLastTime[i] + 0.001);
        layerLastTime[i] = t;
        if (synth && typeof (synth as unknown as { triggerAttackRelease?: unknown }).triggerAttackRelease === 'function') {
          (synth as unknown as { triggerAttackRelease?: (n: string, d: string, time?: number, v?: number) => void }).triggerAttackRelease?.(note, durStr, t, velocity ?? 0.8);
        } else if (synth && typeof (synth as unknown as { triggerAttack?: unknown }).triggerAttack === 'function') {
          (synth as unknown as { triggerAttack?: (n: string, time?: number, v?: number) => void }).triggerAttack?.(note, t, velocity ?? 0.8);
          const releaseAt = t + Tone.Time(durStr).toSeconds();
          (synth as unknown as { triggerRelease?: (time?: number) => void }).triggerRelease?.(releaseAt + 0.01);
        }
      } catch (err) {
        devWarn('[AudioEngine] Composite layer trigger failed', err);
      }
    });
  };

  /**
   * Live edit. Patch `i` goes to the layer built from robot layer `i` (`layerAt`), never to position `i`
   * (docs/specs/COMPOSITE_LAYER_WRITES.md §1.2). With a `time` (a Transport tick's, docs/specs/BEATCLOCK_TRANSPORT_TIME.md §3)
   * the rule is: **a live Param or Signal takes the time; a setting does not.** Layer gain (a Tone.Param) and detune (a
   * Signal) glide one tick from `time` (setOrGlide); phase and pulse width (oscillator settings via synth.set) are
   * written now either way. Without a time every write is exactly the pre-existing one.
   *
   * A field whose value `===` its record in `written` is not written, timed or not (no epsilon):
   * docs/specs/COMPOSITE_LAYER_WRITES.md §1.2. Each record is updated in the same branch as its write.
   *
   * A patch with no synth to land on is dropped; when it asks for a non-zero gain its index is returned in
   * `unrouted`, as only a rebuild can honour it. Any other field there (detune, phase, width) is dropped silently.
   */
  const set = (params: { layers?: LayerLivePatch[]; outputGain?: number }, time?: number): { unrouted: number[] } => {
    const unrouted: number[] = [];
    if (params.outputGain !== undefined) out.gain.value = params.outputGain;
    if (params.layers) {
      // An explicit loop so a sparse patch array and one with undefined holes are the same.
      for (let i = 0; i < params.layers.length; i++) {
        const p = params.layers[i];
        if (!p) continue;
        const node = layerAt(i);
        if (!node) {
          if (typeof p.gain === 'number' && p.gain > 0) unrouted.push(i);
          continue;
        }
        const { synth, gainNode, written } = node;
        if (p.gain !== undefined && p.gain !== written.gain && gainNode) {
          try {
            setOrGlide(gainNode.gain as unknown as RampableParam, p.gain, time);
            written.gain = p.gain;
          } catch (err) {
            devWarn('[AudioEngine] Failed to set layer gain on composite', err);
          }
        }
        if (p.detune !== undefined && p.detune !== written.detune) {
          applyOscDetune(synth as unknown as SynthWithOscillator, p.detune, 'set', time);
          written.detune = p.detune;
        }
        if (p.phase !== undefined && p.phase !== written.phase) {
          applyOscFieldViaSet(synth as unknown as SynthWithOscillator, 'phase', 'phase', p.phase, 'set');
          written.phase = p.phase;
        }
        if (p.pulseWidth !== undefined && p.pulseWidth !== written.pulseWidth) {
          applyOscFieldViaSet(synth as unknown as SynthWithOscillator, 'width', 'pulseWidth', p.pulseWidth, 'set');
          written.pulseWidth = p.pulseWidth;
        }
      }
    }
    return { unrouted };
  };

  /**
   * The ADSR and portamento on every built layer, with `set`'s skip: portamento by `===`, the ADSR field by field and
   * written whole when any field differs, its record a copy. Both are read at the next trigger, so `_time` is ignored.
   */
  const setShared = (params: SharedLivePatch, _time?: number) => {
    for (const { synth, written } of layerNodes) {
      if (params.portamento !== undefined && params.portamento !== written.portamento && synth) {
        try {
          synth.portamento = params.portamento;
          written.portamento = params.portamento;
        } catch (err) {
          devWarn('[AudioEngine] Failed to set portamento on composite layer', err);
        }
      }
      if (params.adsr && !sameAdsr(params.adsr, written.adsr) && typeof (synth as unknown as { set?: (props: unknown) => void }).set === 'function') {
        try {
          (synth as unknown as { set?: (props: unknown) => void }).set?.({ envelope: toToneEnvelope(params.adsr) });
          written.adsr = { ...params.adsr };
        } catch (err) {
          devWarn('[AudioEngine] Failed to set ADSR on composite layer', err);
        }
      }
    }
  };

  const dispose = () => {
    layerNodes.forEach(({ synth, gainNode }) => {
      try {
        try { (synth as unknown as { dispose?: () => void }).dispose?.(); } catch (err) { devWarn('[AudioEngine] Error disposing composite layer synth', err); }
      } catch (err) {
        devWarn('[AudioEngine] Error disposing composite layer synth', err);
      }
      try { gainNode?.disconnect(); } catch { devWarn('[AudioEngine] Failed disconnecting gainNode'); }
      try { (gainNode as unknown as { dispose?: () => void })?.dispose?.(); } catch { devWarn('[AudioEngine] Failed disposing gainNode'); }
    });
    try { out.disconnect(); } catch { devWarn('[AudioEngine] Failed disconnecting composite output'); }
    try { (out as unknown as { dispose?: () => void })?.dispose?.(); } catch { devWarn('[AudioEngine] Failed disposing composite output'); }
  };

  return { output: out, triggerAttackRelease, set, setShared, layerAt, dispose, layers: layerNodes };
}
