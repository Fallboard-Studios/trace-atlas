import * as Tone from 'tone';

import { rampOrSet } from './voiceEntry';
import { devWarn } from '@/utils/helpers';

// ========================================
// BYPASS CELLS (docs/specs/DARK_EFFECT_BYPASS.md section 1.1)
// ========================================
// Each of the ten global effects sits in a cell, which carries its Mix and takes it out of the signal path while it is
// dark. globalFx.ts builds the effects, puts each in a cell here and runs the dry chain through the cells; this module
// owns the cell model: the two gain laws, the Mix protocol (writeCellMix) and the one duck a lit cell rides for a change
// its effect cannot make smoothly (duckCell). Runtime-only, module-scoped state: never put any of it in Zustand.

/** Ramp for a live colour `wet` or BitCrusher `bits` change - the same declick rationale as the filter ramp.
 *  `amount` and `order` are plain setters that rebuild a 1024-point shaper map and are written directly. */
export const COLOUR_RAMP_SECONDS = 0.05;

/** The stored colour Mix (0-1, the slider position and what the seed draws) as the `wet` the node gets: squared.
 *  On the Pixel the three saturators were far too strong across most of a linear Mix slider (Crawford, 2026-10-15:
 *  "all three need to be super low mixes"), so the curve spends most of the slider on the subtle end, as the
 *  Sends' return levels do. 0 stays fully dry and 1 stays fully wet; only the middle moves. Applied where the
 *  setters write the node, so a seed, a restore and a slider drag all take the same path and the stored value,
 *  the seed bands and the share codes keep meaning "slider position". */
export function colourWetGain(mix: number): number {
  return mix * mix;
}

/** The ten global effects that sit in a bypass cell and leave the signal path while dark. */
export type BypassKey =
  | 'distortion'
  | 'chebyshev'
  | 'bitCrusher'
  | 'autoWah'
  | 'phaser'
  | 'chorus'
  | 'tremolo'
  | 'vibrato'
  | 'frequencyShifter'
  | 'stereoWidener';

/** One effect's bypass cell: `in` -> `dry` -> `cut`, and `in` -> effect -> `wet` -> `cut`. The effect's two edges
 *  exist only while it is lit, and are made and broken only while `wet` is at zero. */
export type Cell = {
  in: Tone.Gain;
  dry: Tone.Gain;
  wet: Tone.Gain;
  cut: Tone.Delay;
  /** The Phaser's is replaced by its rebuild. */
  effect: Tone.ToneAudioNode | null;
  /** The two effect edges are present. */
  connected: boolean;
  /** The law's input: colourWetGain(wet), or Width's f (0 or 1). */
  mix: number;
  /** The pending Tone.getContext().setTimeout id of a darken's disconnect. */
  darken: number | null;
};

/** The live cells, rebuilt by every buildGlobalFxChain. An absent key is an effect left out of the chain: its
 *  constructor is missing, its cell could not be built, or the Gain / Delay constructors are missing altogether. */
const _cells: Partial<Record<BypassKey, Cell>> = {};

/** A Mix effect's cell gains for a tapered wet `w` (0-1): Tone's own CrossFade law, so an effect pinned at wet 1 inside
 *  a cell at cellGains(w) sounds as the bare effect at wet w from Mix 0.04 up (below that Tone's law keeps a −56 dB wet
 *  floor the cell does not; docs/specs/DARK_EFFECT_BYPASS.md §8.1). Tone 15's CrossFade (component/channel/CrossFade.js)
 *  feeds a constant 1 through a mono StereoPanner at pan 2·fade − 1 and splits it into the two gains, which is the
 *  Web Audio equal-power pan: cos(fade·π/2) for the dry input and sin(fade·π/2) for the wet. Spec assumption 2. */
export function cellGains(w: number): { dry: number; wet: number } {
  return { dry: Math.cos((w * Math.PI) / 2), wet: Math.sin((w * Math.PI) / 2) };
}

/** The StereoWidener's cell gains for its fade `f` (0-1). At width 0.5 the widener passes its input unchanged, so both
 *  paths carry the same signal and a linear fade keeps the sum constant; an equal-power fade would swell it by up to
 *  √2 mid-crossing. Spec assumption 5. */
export function widthCellGains(f: number): { dry: number; wet: number } {
  return { dry: 1 - f, wet: f };
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
 * 1.4 s with no unresponsive time, a Decay flip 3 ms, linking all seven global LFOs 1 ms. The Dark-Effect Bypass then
 * gave each of the ten bypass cells a cut of its own (see buildCell), so the chain holds twelve.
 */
export const CHAIN_CUT_OPTIONS = { delayTime: 0, maxDelay: 0.01 } as const;

/** Release a node that will never be wired, so an effect left out of the chain does not run its LFOs unheard. */
export function disposeQuietly(node: Tone.ToneAudioNode | null): void {
  try {
    node?.dispose();
  } catch {
    // Nothing to do: the node is unwired either way.
  }
}

/** Drop every cell, with its pending disconnect and any duck in progress: buildGlobalFxChain is building new ones. */
export function clearCells(): void {
  // The context is read only for a timer to cancel: a headless build with no context has none.
  for (const cell of Object.values(_cells)) {
    if (cell.darken !== null) Tone.getContext().clearTimeout(cell.darken);
  }
  for (const key of Object.keys(_cells) as BypassKey[]) delete _cells[key];
  for (const key of Object.keys(_ducks) as BypassKey[]) {
    Tone.getContext().clearTimeout(_ducks[key]!.timer);
    delete _ducks[key];
  }
}

/**
 * Builds `key`'s bypass cell around `effect` (docs/specs/DARK_EFFECT_BYPASS.md section 1.1): `in` -> `dry` -> `cut` and
 * `in` -> effect -> `wet` -> `cut`. Each cell ends in its own zero-delay cut, so a connect's cycle search never walks
 * further than one cell (see CHAIN_CUT_OPTIONS). The effect is pinned fully wet (the widener at unity width) and its cell
 * built dark (dry 1 / wet 0, unconnected), so the cell carries its Mix. An effect whose constructor threw (null) gets an
 * empty cell wired dry. If the cell itself cannot be built, the effect and the cell nodes already made are released and
 * the effect is left out of the chain.
 */
export function buildCell(
  key: BypassKey,
  effect: Tone.ToneAudioNode | null,
  GainCtor: new (...args: unknown[]) => Tone.Gain,
  DelayCtor: new (...args: unknown[]) => Tone.Delay,
): void {
  const made: Tone.ToneAudioNode[] = [];
  const build = <T extends Tone.ToneAudioNode>(node: T): T => {
    made.push(node);
    return node;
  };
  try {
    _cells[key] = {
      in: build(new GainCtor(1)),
      dry: build(new GainCtor(1)),
      wet: build(new GainCtor(0)),
      cut: build(new DelayCtor({ ...CHAIN_CUT_OPTIONS })),
      effect,
      connected: false,
      mix: 0,
      darken: null,
    };
  } catch (err) {
    devWarn(
      '[AudioEngine] the ' + key + ' bypass cell could not be constructed; the chain runs without the ' + key,
      err,
    );
    for (const node of made) disposeQuietly(node);
    disposeQuietly(effect);
  }
}

/** `key`'s live cell, or undefined when the effect is left out of the chain. */
export function getCell(key: BypassKey): Cell | undefined {
  return _cells[key];
}

/** The effect in `key`'s cell, or null when the cell is absent or empty: what the `_global<Effect>` aliases hold. */
export function cellEffect<T extends Tone.ToneAudioNode>(key: BypassKey): T | null {
  return (_cells[key]?.effect as T | null | undefined) ?? null;
}

/** One stage of the dry chain: where the previous stage connects in, and where this one connects on. */
export type ChainSpan = { head: Tone.ToneAudioNode; tail: Tone.ToneAudioNode };

/** A cell as a chain stage: entered at its `in`, left at its `cut`. Null for an absent cell. */
export function cellSpan(key: BypassKey): ChainSpan | null {
  const cell = _cells[key];
  return cell ? { head: cell.in, tail: cell.cut } : null;
}

/** A cell's nodes in signal order, upstream first, for disconnectAllFxNodes. Empty for an absent cell. */
export function cellNodes(key: BypassKey): Array<Tone.ToneAudioNode | null> {
  const cell = _cells[key];
  return cell ? [cell.in, cell.dry, cell.effect, cell.wet, cell.cut] : [];
}

/** Every cell's own edges: the dry path always, the effect's two edges only while `connected`. */
export function wireCells(): void {
  for (const cell of Object.values(_cells)) {
    cell.in.connect(cell.dry);
    cell.dry.connect(cell.cut);
    cell.wet.connect(cell.cut);
    if (cell.connected && cell.effect) {
      cell.in.connect(cell.effect);
      cell.effect.connect(cell.wet);
    }
  }
}

/** How many of the ten effects are connected into their bypass cells, i.e. in the signal path: a darkening effect
 *  counts until its disconnect fires. 0 before buildGlobalFxChain() has run. Read by the `?debug` HUD's ` · fx in n/10`
 *  token (docs/specs/DARK_EFFECT_BYPASS.md assumption 13). */
export function getConnectedEffectCount(): number {
  return Object.values(_cells).filter((cell) => cell.connected).length;
}

/** The widest step of a Mix effect's law input one linear ramp may take: a quarter, π/8 of the cos / sin arc. Tone ramps
 *  a Gain linearly, so one ramp moves the two gains along a chord of the law, and an uncorrelated signal dips by
 *  cos(arc / 2) at the chord's midpoint: 3 dB for one ramp from dry to Mix 1, under 0.17 dB at π/8 (branch review
 *  item 3). */
const MAX_LAW_STEP = 0.25;

/** A gain that can append a linear ramp after its rampTo; a headless stub cannot, and gets one plain ramp. */
type SegmentableGain = Tone.Param<'gain'> & { linearRampToValueAtTime?: (value: number, endTime: number) => unknown };

/**
 * Ramp `key`'s cell's two gains from its law at `from` to its law at `to` over `seconds`: widthCellGains for the
 * widener, whose linear law a single ramp follows exactly, cellGains for a Mix effect. A Mix ramp wider than
 * MAX_LAW_STEP is split into equal chords of the law over equal shares of the time: the first is a rampTo from the
 * context's now (which holds wherever the gain is, so a ramp cut short by the next one stays continuous and cancels what
 * was still scheduled), the rest are linear ramps appended after it.
 */
function rampCell(key: BypassKey, cell: Cell, from: number, to: number, seconds: number): void {
  const law = key === 'stereoWidener' ? widthCellGains : cellGains;
  const dryGain = cell.dry.gain as SegmentableGain;
  const wetGain = cell.wet.gain as SegmentableGain;
  const chords = key === 'stereoWidener' ? 1 : Math.ceil(Math.abs(to - from) / MAX_LAW_STEP);
  if (chords <= 1 || typeof dryGain.linearRampToValueAtTime !== 'function' || typeof wetGain.linearRampToValueAtTime !== 'function') {
    const { dry, wet } = law(to);
    rampOrSet(dryGain, dry, seconds);
    rampOrSet(wetGain, wet, seconds);
    return;
  }
  const step = seconds / chords;
  const start = Tone.getContext().now();
  for (let k = 1; k <= chords; k++) {
    const { dry, wet } = law(from + ((to - from) * k) / chords);
    if (k === 1) {
      dryGain.rampTo(dry, step, start);
      wetGain.rampTo(wet, step, start);
    } else {
      dryGain.linearRampToValueAtTime(dry, start + step * k);
      wetGain.linearRampToValueAtTime(wet, start + step * k);
    }
  }
}

/** Make the effect's two edges. Only ever called while the cell's wet gain is 0, so the new path is silent. False, with
 *  a warning, if Tone refused: the cell stays dry and unconnected, and the next light tries again. */
export function connectEffect(key: BypassKey, cell: Cell, effect: Tone.ToneAudioNode): boolean {
  try {
    cell.in.connect(effect);
    effect.connect(cell.wet);
    cell.connected = true;
    return true;
  } catch (err) {
    devWarn(
      '[AudioEngine] the ' + key + ' effect could not be connected into its bypass cell; it stays dry',
      err,
    );
    return false;
  }
}

/** Break the effect's two edges, once the wet gain has reached 0 on the audio thread. On a failure the cell keeps
 *  `connected`, so a later light only ramps (the edges that are still there carry it) and a rewire re-makes them. */
export function disconnectEffect(key: BypassKey, cell: Cell, effect: Tone.ToneAudioNode): void {
  try {
    cell.in.disconnect(effect);
    effect.disconnect(cell.wet);
    cell.connected = false;
  } catch (err) {
    devWarn(
      '[AudioEngine] the ' + key + ' effect could not be disconnected from its bypass cell',
      err,
    );
  }
}

/** A darkening cell disconnects its effect once lookAhead + the Mix ramp + this margin has passed, so the wet gain has
 *  reached zero on the audio thread first (the duck's margin, for the same reason). Dark-Effect Bypass §1.2. */
export const BYPASS_DISCONNECT_MARGIN_SECONDS = 0.01;

/**
 * A Mix write through `key`'s cell (docs/specs/DARK_EFFECT_BYPASS.md section 1.2, assumption 4). `mix` is the stored,
 * clamped Mix; the cell runs the tapered `w = colourWetGain(mix)`, or for the widener `mix` is its width and `w` its fade
 * (0 at exactly 0.5, where the widener is unity; 1 anywhere else). Light (w > 0): cancel a pending disconnect, connect the
 * effect if it is not (the wet gain is 0, so the path appears silently), then ramp the cell to the law. Darken (w = 0):
 * ramp to dry and arm the one disconnect for when the ramp has run on the audio thread (lookAhead + the ramp + a margin),
 * where it goes only if the cell is still dark. A re-sent value with nothing left to do writes nothing, so a whole-block
 * apply does not re-ramp or re-arm. While a duck holds the cell at dry it is lit or darkened all the same but its gains
 * are left alone: the duck returns them to the new Mix.
 */
export function writeCellMix(key: BypassKey, mix: number): void {
  const cell = _cells[key];
  const effect = cell?.effect;
  if (!cell || !effect) return;
  const w = key === 'stereoWidener' ? (mix === 0.5 ? 0 : 1) : colourWetGain(mix);
  if (w === cell.mix && (cell.darken !== null || w > 0 === cell.connected)) return;
  const ramp = !isDucked(key);
  const from = cell.mix;
  const context = Tone.getContext();
  if (w > 0) {
    if (cell.darken !== null) {
      context.clearTimeout(cell.darken);
      cell.darken = null;
    }
    if (!cell.connected && !connectEffect(key, cell, effect)) return;
    cell.mix = w;
    if (ramp) rampCell(key, cell, from, w, COLOUR_RAMP_SECONDS);
    return;
  }
  cell.mix = 0;
  if (ramp) rampCell(key, cell, from, 0, COLOUR_RAMP_SECONDS);
  cell.darken = context.setTimeout(
    () => {
      cell.darken = null;
      // The cell's effect at the fire, not at the arm: a Phaser Stages change in between puts a new node in the cell.
      if (cell.mix === 0 && cell.connected && cell.effect) disconnectEffect(key, cell, cell.effect);
    },
    context.lookAhead + COLOUR_RAMP_SECONDS + BYPASS_DISCONNECT_MARGIN_SECONDS,
  );
}

// ========================================
// THE DUCK (docs/specs/GLOBAL_PEDALS.md §8, docs/specs/DARK_EFFECT_BYPASS.md assumption 8 and §8.2)
// ========================================
/**
 * Some changes an effect cannot make smoothly while it is heard: Tone's Chorus and Tremolo `spread` setters swap both
 * LFOs' waveform at once (one 5° step clicked x49-79 on a lit Chorus, x7 on a lit Tremolo, in a real-time context), and a
 * Phaser Stages change swaps the node, a connect at the lit gains (x2-55). So a cell in the signal path is ducked: it
 * ramps to dry, the change is applied from Tone's audio-clock timer (as scheduleVoiceRelease uses it) once that ramp has
 * run, and the cell ramps back to its Mix; measured x1.3 / x1.6 for the Spread. Ramps start lookAhead ahead of the audio
 * thread and the change does not, so it waits lookAhead + the ramp + a margin. Every step of a drag re-arms the one
 * timer with its own change, so the cell stays dry until the drag stops and only the last change is applied. The duck
 * never disconnects, and a cell still connected while it darkens is ducked too.
 */
const DUCK_SECONDS = 0.02;
const DUCK_WRITE_MARGIN_SECONDS = 0.01;
/** A duck in progress: the change to apply at its bottom and the timer that applies it. */
const _ducks: Partial<Record<BypassKey, { apply: () => void; timer: number }>> = {};

/** A duck is holding `key`'s cell at dry. */
export function isDucked(key: BypassKey): boolean {
  return _ducks[key] !== undefined;
}

/** `key`'s effect is heard, or about to be again, so a change it cannot make smoothly must go through duckCell. False
 *  for an absent cell or one out of the signal path: there is nothing to hear, and the change can be made at once. */
export function needsDuck(key: BypassKey): boolean {
  const cell = _cells[key];
  return cell !== undefined && (cell.connected || isDucked(key));
}

/** Duck `key`'s cell and run `apply` at the bottom, replacing the change of a duck already in progress. Call it only
 *  when needsDuck(key). */
export function duckCell(key: BypassKey, apply: () => void): void {
  const cell = _cells[key];
  if (!cell) return;
  const context = Tone.getContext();
  const pending = _ducks[key];
  if (pending) context.clearTimeout(pending.timer);
  else rampCell(key, cell, cell.mix, 0, DUCK_SECONDS);
  const timer = context.setTimeout(
    () => finishDuck(key),
    context.lookAhead + DUCK_SECONDS + DUCK_WRITE_MARGIN_SECONDS,
  );
  _ducks[key] = { apply, timer };
}

/** The bottom of a duck: apply the change while the wet gain is at 0, then ramp the cell back to its Mix, which a Mix
 *  write during the duck may have moved (to dry, for a darken). (A rebuild cancels the timer: clearCells.) */
function finishDuck(key: BypassKey): void {
  const pending = _ducks[key];
  delete _ducks[key];
  if (!pending) return;
  try {
    pending.apply();
    const cell = _cells[key];
    if (cell) rampCell(key, cell, 0, cell.mix, DUCK_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] a ducked ' + key + ' change failed', err);
  }
}
