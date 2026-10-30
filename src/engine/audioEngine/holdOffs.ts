import * as Tone from 'tone';

import { BYPASS_DISCONNECT_MARGIN_SECONDS, BYPASS_KEYS, COLOUR_RAMP_SECONDS, writeCellMix, type BypassKey } from './bypassCell';
import { rampOrSet } from './voiceEntry';
import { devWarn } from '@/utils/helpers';

/**
 * The two Effects Load hold-offs on the global chain (docs/specs/LIGHT_TIER_STANDING_COST.md): the pedals and colour
 * effects held dark (H1), and the Reverb held off (§1.6 (2), T19). audioBudgetSystem pushes both through AudioEngine;
 * globalFx.ts re-exports what its callers read, and hands in the Reverb and its return, which it owns.
 */

// ========================================
// THE EFFECTS HOLD-OFF (docs/specs/LIGHT_TIER_STANDING_COST.md H1)
// ========================================
// Below LOAD_EFFECTS_MIN the budget holds every cell and branch dark. Each Mix write records what the user set here
// first, and reaches its cell only while not held off.
let _effectsHeldOff = false;
const _lastMix: Partial<Record<BypassKey, number>> = {};

/** Every Mix write's one way in (a colour or pedal Mix, Width's width, the Shimmer and Double branches' pinned depth):
 *  recorded as what the user set, then written through the cell's crossing unless the effects are held off. */
export function writeMix(key: BypassKey, mix: number): void {
  _lastMix[key] = mix;
  if (!_effectsHeldOff) writeCellMix(key, mix);
}

/**
 * The budget's word on the effects tier (audioBudgetSystem, below LOAD_EFFECTS_MIN). Held off, every chain cell and room
 * branch is written dark through writeCellMix's own crossing (ramp to dry, then the disconnect on the audio clock; Width
 * to 0.5, its unity); lifted, each is written back to its recorded Mix through the same crossing, exactly. A re-sent
 * value writes nothing (writeCellMix's own re-send rule). A room's liveness is left alone: a held-off branch is dark at
 * depth 0, so feeding its room or moving its Return lights nothing, and a Decay flip re-wires the cells as they are. The
 * record outlives a chain rebuild, as the store's Mixes do.
 */
export function setEffectsHeldOff(heldOff: boolean): void {
  _effectsHeldOff = heldOff;
  for (const key of BYPASS_KEYS) {
    if (heldOff) writeCellMix(key, key === 'stereoWidener' ? 0.5 : 0);
    else if (_lastMix[key] !== undefined) writeCellMix(key, _lastMix[key]);
  }
}

/** Whether the effects are held off, for the `?debug` overlay. */
export function getEffectsHeldOff(): boolean {
  return _effectsHeldOff;
}

// ========================================
// THE REVERB HOLD-OFF (docs/specs/LIGHT_TIER_STANDING_COST.md §1.6 (2), T19)
// ========================================
// Below LOAD_REVERB_MIN the Reverb's own edge to its return is dropped, so it and every robot's reverb send stop being
// rendered. The Amount is recorded here and reaches the return only while not held off; the wiring records where the
// Reverb's output goes and whether the edge is there now.
let _reverbHeldOff = false;
let _reverbWet = 1;
let _reverbOut: Tone.ToneAudioNode | null = null;
let _reverbEdge = false;
let _reverbDrop: number | null = null;

/** How long the Reverb's return ramps up on a lift. Slower than the 50 ms it ramps down: the robots' sends reach a
 *  freshly reset Convolver at once, and a 50 ms ramp let that onset through (×3.3–×3.9 with the reset alone; ×1.1–×1.7
 *  with this ramp; docs/todo/scratchy-audio-phones.md, the decomposition's §12). Crawford, 2026-10-29. */
export const REVERB_LIFT_RAMP_SECONDS = 1;

/** Reset the Reverb's Convolver by setting its impulse buffer again, which makes the browser build a fresh kernel. An
 *  unrendered Convolver keeps the tail it held when its edge was dropped, and replayed it on the lift at a fifth to a
 *  half of its steady level (§12). Tone keeps the native ConvolverNode on its private `_convolver` (Tone 15's
 *  Reverb.generate() sets that field's buffer the same way); without it, or before it has a buffer, the lift goes ahead
 *  without the reset. */
function resetReverbConvolver(reverb: Tone.Reverb | null): void {
  const convolver = (reverb as unknown as { _convolver?: { buffer: AudioBuffer | null } } | null)?._convolver;
  const buffer = convolver?.buffer;
  if (!convolver || !buffer) return;
  try {
    convolver.buffer = buffer;
  } catch (err) {
    devWarn('[AudioEngine] the Reverb could not be reset on its lift; its old tail may replay', err);
  }
}

/** Make the Reverb's edge to where its output goes (its return), if it is not there. */
function connectReverbEdge(reverb: Tone.Reverb | null): void {
  const out = _reverbOut;
  if (!reverb || !out || _reverbEdge) return;
  try {
    reverb.connect(out);
    _reverbEdge = true;
  } catch (err) {
    devWarn('[AudioEngine] the Reverb could not be connected to its return', err);
  }
}

/** Drop the Reverb's edge to its return, if it is there; a rewire since the drop was armed leaves nothing to drop. */
function dropReverbEdge(reverb: Tone.Reverb | null): void {
  const out = _reverbOut;
  if (!reverb || !out || !_reverbEdge) return;
  try {
    reverb.disconnect(out);
    _reverbEdge = false;
  } catch (err) {
    devWarn('[AudioEngine] the Reverb could not be disconnected from its return', err);
  }
}

/** wireGlobalFxChain has just dropped every FX edge: the Reverb has no edge and nowhere to go until it is wired. */
export function forgetReverbEdge(): void {
  _reverbEdge = false;
  _reverbOut = null;
}

/** wireGlobalFxChain: the Reverb's output goes to `out` (its return, or the join without one). The edge is the one the
 *  hold-off drops, so it is made here only while the Reverb is not held off. */
export function wireReverbEdge(reverb: Tone.Reverb | null, out: Tone.ToneAudioNode): void {
  _reverbOut = out;
  if (!_reverbHeldOff) connectReverbEdge(reverb);
}

/** setGlobalReverb's Amount (the return's level): recorded first, and written only while the Reverb is not held off
 *  (holdReverbOff ramps to it on the lift). */
export function writeReverbAmount(ret: Tone.Gain | null, wet: number): void {
  _reverbWet = wet;
  if (!_reverbHeldOff && ret) ret.gain.value = wet;
}

/**
 * The budget's word on the Reverb (audioBudgetSystem, below LOAD_REVERB_MIN), on globalFx's Reverb and its return. Held
 * off, the return ramps to 0 over COLOUR_RAMP_SECONDS and, once the audio clock has run the ramp (writeCellMix's timing),
 * the Reverb's edge to it is dropped: the Reverb and every robot's reverb send stop being rendered. Lifted, a pending
 * drop is cancelled; if the edge was dropped, the Convolver is reset (resetReverbConvolver) and the edge re-made while
 * the return is at 0; then the return ramps to the recorded Amount over REVERB_LIFT_RAMP_SECONDS. A re-sent value
 * writes nothing. Length and Pre-Delay keep reaching the node, so the lift is exact; the Delay is untouched.
 */
export function holdReverbOff(heldOff: boolean, reverb: Tone.Reverb | null, ret: Tone.Gain | null): void {
  if (heldOff === _reverbHeldOff) return;
  _reverbHeldOff = heldOff;
  const context = Tone.getContext();
  if (heldOff) {
    if (ret) rampOrSet(ret.gain, 0, COLOUR_RAMP_SECONDS);
    if (!reverb) return;
    _reverbDrop = context.setTimeout(
      () => {
        _reverbDrop = null;
        dropReverbEdge(reverb);
      },
      context.lookAhead + COLOUR_RAMP_SECONDS + BYPASS_DISCONNECT_MARGIN_SECONDS,
    );
    return;
  }
  if (_reverbDrop !== null) {
    context.clearTimeout(_reverbDrop);
    _reverbDrop = null;
  }
  // A dropped edge is re-made silent and clean: the Convolver's kept tail is cleared, the return goes to 0 (nothing feeds
  // it yet), and then it ramps up. An edge that was never dropped kept rendering, so there is nothing to clear.
  if (!_reverbEdge) {
    resetReverbConvolver(reverb);
    if (ret) ret.gain.value = 0;
  }
  connectReverbEdge(reverb);
  if (ret) rampOrSet(ret.gain, _reverbWet, REVERB_LIFT_RAMP_SECONDS);
}

/** Whether the Reverb is held off, for the `?debug` overlay. */
export function getReverbHeldOff(): boolean {
  return _reverbHeldOff;
}
