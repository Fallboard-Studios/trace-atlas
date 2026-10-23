import type * as Tone from 'tone';

import { devWarn } from '../../utils/helpers';
import type { CompositeVoice } from './compositeVoice';
import { ROBOT_SENDS, type SendEngineKey } from '../../data/robotSends';

/**
 * One reserved robot's voice graph: composite -> panner -> busGain -> busFilter -> the global chain, with the five
 * send gains tapped off busFilter into the shared rooms (docs/specs/ROBOT_SENDS.md §1.4, ROBOT_EFFECT_SENDS.md §1.4).
 * AudioEngine.ts keeps the map of these; this module owns how one comes down and how its params are written.
 */
export interface VoiceEntry {
  composite: CompositeVoice;
  panner: Tone.Panner;
  busGain: Tone.Gain;
  busFilter: Tone.Filter;
  /** busFilter -> sends[key] -> that send's room (Reverb, Delay, or the Colour / Shimmer / Double room's in); 0 = this
   *  robot is dry there. One record keyed by engine key (docs/specs/ROBOT_SEND_TABLE.md assumption 4). */
  sends: Readonly<Record<SendEngineKey, Tone.Gain>>;
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
  const nodes: readonly (readonly [string, Tone.Gain | Tone.Panner | Tone.Filter])[] = [
    ...ROBOT_SENDS.map((spec) => [spec.field, entry.sends[spec.engineKey]] as const),
    ['panner', entry.panner],
    ['busGain', entry.busGain],
    ['busFilter', entry.busFilter],
  ];
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
