import type * as Tone from 'tone';

import { devWarn } from '../../utils/helpers';
import type { CompositeVoice } from './compositeVoice';

/**
 * One reserved robot's voice graph: composite -> panner -> busGain -> busFilter -> the global chain, with the two
 * send gains tapped off busFilter into the shared Reverb and Delay rooms (docs/specs/ROBOT_SENDS.md §1.4).
 * AudioEngine.ts keeps the map of these; this module owns how one comes down and how its params are written.
 */
export interface VoiceEntry {
  composite: CompositeVoice;
  panner: Tone.Panner;
  busGain: Tone.Gain;
  busFilter: Tone.Filter;
  /** busFilter -> reverbSend -> global Reverb room. 0 = this robot is dry in the Reverb. */
  reverbSend: Tone.Gain;
  /** busFilter -> delaySend -> global Delay room. */
  delaySend: Tone.Gain;
  /** busFilter -> gritSend -> the Colour room's in (docs/specs/ROBOT_EFFECT_SENDS.md §1.4). */
  gritSend: Tone.Gain;
  /** busFilter -> shimmerSend -> the Shimmer room's in. */
  shimmerSend: Tone.Gain;
  /** busFilter -> doubleSend -> the Double room's in. */
  doubleSend: Tone.Gain;
}

/** Run one teardown step on its own, so a node that fails to come down never stops the ones after it. */
function attempt(label: string, step: () => void): void {
  try {
    step();
  } catch (err) {
    devWarn(`[AudioEngine] ${label} failed`, err);
  }
}

/** Tear down one robot's voice graph: the composite, then its sends, panner, bus gain and bus filter.
 *  Every disconnect and dispose is its own step (Tone nodes may or may not implement dispose). */
export function disposeVoiceNodes(entry: VoiceEntry): void {
  attempt('composite.dispose', () => entry.composite.dispose?.());
  const nodes = [
    ['reverbSend', entry.reverbSend],
    ['delaySend', entry.delaySend],
    ['gritSend', entry.gritSend],
    ['shimmerSend', entry.shimmerSend],
    ['doubleSend', entry.doubleSend],
    ['panner', entry.panner],
    ['busGain', entry.busGain],
    ['busFilter', entry.busFilter],
  ] as const;
  for (const [name, node] of nodes) attempt(`${name}.disconnect`, () => node.disconnect());
  for (const [name, node] of nodes) attempt(`${name}.dispose`, () => node.dispose?.());
}

/** A Tone AudioParam / Signal as far as a live edit needs it: `rampTo` when the real node has it. */
export type RampableParam = { rampTo?: (value: number, rampTime: number) => void; value: number };

/** Glide `param` to `target` over `rampSeconds` when it can ramp, else assign it (headless / test stubs). */
export function rampOrSet(param: RampableParam, target: number, rampSeconds: number): void {
  if (typeof param.rampTo === 'function') {
    param.rampTo(target, rampSeconds);
  } else {
    param.value = target;
  }
}
