import type * as Tone from 'tone';

import { devWarn } from '../../utils/helpers';
import { getTickSeconds } from '../beatClock';
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

/** A Tone Param / Signal as far as a live edit needs it: `rampTo` and `setValueAtTime` when the real node has them. */
export type RampableParam = {
  rampTo?: (value: number, rampTime: number, startTime?: number) => void;
  setValueAtTime?: (value: number, time: number) => void;
  value: number;
};

/**
 * Glide `param` to `target`. Given a `time` (a Transport tick's own time, docs/specs/BEATCLOCK_TRANSPORT_TIME.md §3),
 * the ramp starts there and lasts one tick (`getTickSeconds`), so a per-tick write glides into the next tick instead of
 * stepping (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2); with no tick length it lasts `rampSeconds`. With no time it
 * starts now over `rampSeconds`. With no ramp, a timed point; with neither, assign (headless / test stubs). A missing
 * time is never defaulted: the untimed calls are `rampTo` with two arguments and `.value =`, so a UI edit is unchanged.
 */
export function rampOrSet(param: RampableParam, target: number, rampSeconds: number, time?: number): void {
  if (typeof param.rampTo === 'function') {
    if (time !== undefined) param.rampTo(target, getTickSeconds(time) ?? rampSeconds, time);
    else param.rampTo(target, rampSeconds);
  } else {
    setOrGlide(param, target, time);
  }
}

/**
 * Write `value` to a live Param / Signal that a UI edit sets with no ramp. Given a `time` (a Transport tick), it glides
 * one tick from there when the node can ramp and a tick length is known, so a per-tick write does not step
 * (docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2), else it is a point at `time`. With no time, or on a headless / test
 * stub, it assigns now; the untimed call is exactly `.value =`.
 */
export function setOrGlide(param: RampableParam, value: number, time?: number): void {
  if (time !== undefined) {
    const tickSeconds = typeof param.rampTo === 'function' ? getTickSeconds(time) : undefined;
    if (tickSeconds !== undefined) {
      param.rampTo!(value, tickSeconds, time);
      return;
    }
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, time);
      return;
    }
  }
  param.value = value;
}
