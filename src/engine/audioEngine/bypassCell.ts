import * as Tone from 'tone';

import { rampOrSet } from './voiceEntry';
import { devWarn } from '@/utils/helpers';
import type { SendRoomKey } from '@/data/robotSends';

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

/** The ten global effects that sit in a bypass cell and leave the signal path while dark, in chain order. The `?debug`
 *  HUD's ` · fx in n/10` token takes its denominator from here. */
export const BYPASS_KEYS = [
  'distortion',
  'chebyshev',
  'bitCrusher',
  'autoWah',
  'phaser',
  'chorus',
  'tremolo',
  'vibrato',
  'frequencyShifter',
  'stereoWidener',
] as const;
export type BypassKey = (typeof BYPASS_KEYS)[number];

/** One effect's bypass cell: `in` -> `dry` -> `cut`, and `in` -> effect -> `wet` -> `cut`. The effect's two edges
 *  exist only while it is lit, and are made and broken only while `wet` is at zero. A room's BRANCH (Robot Effect Sends,
 *  the ROOMS section below) is the same cell with no `dry`: its `in` and `cut` are the room's, shared by its branches. */
export type Cell = {
  in: Tone.Gain;
  /** Null for a room's branch: a room has no dry path. */
  dry: Tone.Gain | null;
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
  /** The room this cell is a branch of; null for a chain cell. */
  room: RoomKey | null;
  /** A branch's own Mix, the law input while its room is live (recorded on every write, lit or not). 0 on a chain cell. */
  depth: number;
  /** The effect's own LFOs (effectLfos), running only while the effect is connected. docs/specs/LIGHT_TIER_STANDING_COST.md H3a. */
  lfos: EffectLfo[];
};

/** A Tone LFO inside an effect, as far as the cell needs it. */
export type EffectLfo = { start: (time?: number) => unknown; stop: (time?: number) => unknown };

/**
 * The LFOs a Tone effect runs, read once from Tone's own fields: the Chorus, the Tremolo and the Phaser keep two
 * (`_lfoL`, `_lfoR`), the Vibrato one (`_lfo`); the others none (the AutoWah's follower is not an LFO). A dark effect is
 * out of the signal path, so its LFOs only cost the audio thread: the cell stops them while it is dark (Light tier
 * standing cost H3a). A restarted LFO begins at phase 0 while the cell's wet gain is still 0, so nobody hears it.
 */
function effectLfos(effect: Tone.ToneAudioNode | null): EffectLfo[] {
  const fields = effect as unknown as { _lfoL?: unknown; _lfoR?: unknown; _lfo?: unknown } | null;
  if (!fields) return [];
  return [fields._lfoL, fields._lfoR, fields._lfo].filter(
    (lfo): lfo is EffectLfo => typeof (lfo as EffectLfo | undefined)?.start === 'function' && typeof (lfo as EffectLfo).stop === 'function',
  );
}

function startLfos(cell: Cell): void {
  for (const lfo of cell.lfos) lfo.start();
}

function stopLfos(cell: Cell): void {
  for (const lfo of cell.lfos) lfo.stop();
}

/** Put `effect` in `cell` (the Phaser's Stages rebuild) with its LFOs recorded and stopped: the new node is out of the
 *  path until the caller connects it, and connectEffect starts them. */
export function setCellEffect(cell: Cell, effect: Tone.ToneAudioNode): void {
  cell.effect = effect;
  cell.lfos = effectLfos(effect);
  stopLfos(cell);
}

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

/** Drop every cell and room, with its pending disconnect and any duck in progress: buildGlobalFxChain is building new
 *  ones. */
export function clearCells(): void {
  // The context is read only for a timer to cancel: a headless build with no context has none.
  for (const cell of Object.values(_cells)) {
    if (cell.darken !== null) Tone.getContext().clearTimeout(cell.darken);
  }
  for (const key of Object.keys(_cells) as BypassKey[]) delete _cells[key];
  for (const key of Object.keys(_rooms) as RoomKey[]) delete _rooms[key];
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
      room: null,
      depth: 0,
      lfos: effectLfos(effect),
    };
    stopLfos(_cells[key]); // built dark; undoes a start in Tone's constructor (Vibrato, Phaser) or the build's (Chorus, Tremolo)
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

/** A cell as a chain stage: entered at its `in`, left at its `cut`. Null for an absent cell, and for a room's branch,
 *  which is no stage of the chain. */
export function cellSpan(key: BypassKey): ChainSpan | null {
  const cell = _cells[key];
  return cell && cell.room === null ? { head: cell.in, tail: cell.cut } : null;
}

/** A cell's nodes in signal order, upstream first, for disconnectAllFxNodes. Empty for an absent cell. A branch lists
 *  only its own two, its effect and wet gain: the room's `in` and `cut` are roomNodes'. */
export function cellNodes(key: BypassKey): Array<Tone.ToneAudioNode | null> {
  const cell = _cells[key];
  if (!cell) return [];
  return cell.dry ? [cell.in, cell.dry, cell.effect, cell.wet, cell.cut] : [cell.effect, cell.wet];
}

/** Every room's cut -> return, and every cell's own edges: the dry path always (a branch has none), the effect's two
 *  edges only while `connected`. */
export function wireCells(): void {
  for (const room of Object.values(_rooms)) room.cut.connect(room.return);
  for (const cell of Object.values(_cells)) {
    if (cell.dry) {
      cell.in.connect(cell.dry);
      cell.dry.connect(cell.cut);
    }
    cell.wet.connect(cell.cut);
    if (cell.connected && cell.effect) {
      cell.in.connect(cell.effect);
      cell.effect.connect(cell.wet);
    }
  }
}

/** How many of the ten effects are connected into their bypass cells or room branches, i.e. in the signal path: a
 *  darkening effect counts until its disconnect fires. 0 before buildGlobalFxChain() has run. Read by the `?debug` HUD's ` · fx in n/10`
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
 * Ramp `key`'s cell's two gains from its law at `from` to its law at `to` over `seconds`: branchGains for a room's branch
 * (its wet gain only: the law is linear, so one ramp follows it exactly), widthCellGains for the widener, whose linear
 * law a single ramp follows exactly too, cellGains for a Mix effect. A Mix ramp wider than
 * MAX_LAW_STEP is split into equal chords of the law over equal shares of the time: the first is a rampTo from the
 * context's now (which holds wherever the gain is, so a ramp cut short by the next one stays continuous and cancels what
 * was still scheduled), the rest are linear ramps appended after it.
 */
function rampCell(key: BypassKey, cell: Cell, from: number, to: number, seconds: number): void {
  if (!cell.dry) {
    rampOrSet(cell.wet.gain, branchGains(to).wet, seconds);
    return;
  }
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

/** Make the effect's two edges, its LFOs started first. Only ever called while the cell's wet gain is 0, so the new path
 *  is silent. False, with a warning, if Tone refused: the cell stays dry and unconnected with its LFOs stopped again, and
 *  the next light tries again. */
export function connectEffect(key: BypassKey, cell: Cell, effect: Tone.ToneAudioNode): boolean {
  startLfos(cell);
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
    stopLfos(cell);
    return false;
  }
}

/** Break the effect's two edges, once the wet gain has reached 0 on the audio thread, then stop its LFOs. On a failure
 *  the cell keeps `connected` (and its LFOs), so a later light only ramps (the edges that are still there carry it) and
 *  a rewire re-makes them. */
export function disconnectEffect(key: BypassKey, cell: Cell, effect: Tone.ToneAudioNode): void {
  try {
    cell.in.disconnect(effect);
    effect.disconnect(cell.wet);
    cell.connected = false;
    stopLfos(cell);
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
 * are left alone: the duck returns them to the new Mix. On a room's branch `mix` is recorded as the branch's depth and
 * the target is colourWetGain(mix) only while the room is live (fed and its Return above 0), 0 otherwise.
 */
export function writeCellMix(key: BypassKey, mix: number): void {
  const cell = _cells[key];
  const effect = cell?.effect;
  if (!cell || !effect) return;
  if (cell.room !== null) cell.depth = mix;
  const w = cellTarget(key, cell, mix);
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

/** The law input a Mix write targets: a branch's tapered depth while its room is live, else 0; the widener's fade; a
 *  Mix effect's tapered Mix. */
function cellTarget(key: BypassKey, cell: Cell, mix: number): number {
  if (cell.room !== null) {
    const room = _rooms[cell.room];
    return room && roomLive(room) ? colourWetGain(mix) : 0;
  }
  return key === 'stereoWidener' ? (mix === 0.5 ? 0 : 1) : colourWetGain(mix);
}

// ========================================
// ROOMS (docs/specs/ROBOT_EFFECT_SENDS.md assumptions 2-3, §1.3)
// ========================================
// Five of the ten effects are not stages of the dry chain but branches of three ROOMS beside it, fed only by the
// robots' per-robot send gains (AudioEngine.reserveVoice), as the Reverb and Delay rooms are. A room is the cell
// machinery with the dry path removed: a shared `in` every robot's send connects to, one branch per effect (a Cell with
// `dry` null: `in` -> effect -> `wet` -> `cut`, the effect's two edges present only while lit, `wet` the wet-only
// branchGains law), a zero-delay `cut` that bounds a connect's cycle search to the room, and a `return` gain the global
// Return slider drives (globalFx.ts joins it with the Reverb and Delay returns). A branch is lit while its room is LIVE
// (some reserved robot feeds it AND its Return is above 0) and its own depth is above 0; either driver crossing 0
// re-targets every branch through writeCellMix's one crossing, so every graph edit is silent.

export const ROOM_KEYS = ['grit', 'shimmer', 'double'] as const;
/** The send table's room keys (robotSends.ts, which the seeder reads too), one type for both: a room added there fails to compile here until
 *  ROOM_BRANCHES (and AudioEngine's feeder sets) name it, and a key here that the seeder lacks fails at every call. */
export type RoomKey = SendRoomKey;

/** Which bypass keys are branches of which room, in chain order; the other five BYPASS_KEYS are chain cells. */
export const ROOM_BRANCHES: Record<RoomKey, readonly BypassKey[]> = {
  grit: ['distortion', 'chebyshev', 'bitCrusher'],
  shimmer: ['frequencyShifter'],
  double: ['chorus'],
};

export type Room = {
  /** Every robot's send gain for this room connects here, for the voice's life. */
  in: Tone.Gain;
  /** Every branch's wet -> cut -> return; bounds the cycle search to this room (CHAIN_CUT_OPTIONS). */
  cut: Tone.Delay;
  /** The global Return slider's gain; globalFx.ts connects it to the rooms' join. */
  return: Tone.Gain;
  /** Some reserved robot's send into this room is above 0 (setRoomFed, the engine's word). */
  fed: boolean;
  /** The last Return written (setRoomReturn). */
  returnLevel: number;
};

/** The live rooms, rebuilt by every buildGlobalFxChain beside the cells. An absent key is a room left out. */
const _rooms: Partial<Record<RoomKey, Room>> = {};

/** A branch's gains for a tapered wet `w`: wet-only. A room has no dry path to keep equal power against, so the wet gain
 *  is `w` itself and there is no cos / sin. */
export function branchGains(w: number): { dry: number; wet: number } {
  return { dry: 0, wet: w };
}

/** Builds `key`'s room: `in` (1), a zero-delay `cut` and `return` (1), unfed, at a Return of 1, with no branch yet. If a
 *  node cannot be built, the ones already made are released and the room is left out. */
export function buildRoom(
  key: RoomKey,
  GainCtor: new (...args: unknown[]) => Tone.Gain,
  DelayCtor: new (...args: unknown[]) => Tone.Delay,
): void {
  const made: Tone.ToneAudioNode[] = [];
  const build = <T extends Tone.ToneAudioNode>(node: T): T => {
    made.push(node);
    return node;
  };
  try {
    _rooms[key] = {
      in: build(new GainCtor(1)),
      cut: build(new DelayCtor({ ...CHAIN_CUT_OPTIONS })),
      return: build(new GainCtor(1)),
      fed: false,
      returnLevel: 1,
    };
  } catch (err) {
    devWarn('[AudioEngine] the ' + key + ' room could not be constructed; it is left out', err);
    for (const node of made) disposeQuietly(node);
  }
}

/** Builds `key`'s branch of `room` around `effect`: a cell sharing the room's `in` and `cut`, with no dry gain and a wet
 *  gain at 0, built dark (unconnected, depth 0). The effect must already be pinned fully wet. Without the room, without
 *  an effect, or if the wet gain cannot be built, there is no branch and the effect is released. */
export function buildBranch(
  key: BypassKey,
  room: RoomKey,
  effect: Tone.ToneAudioNode | null,
  GainCtor: new (...args: unknown[]) => Tone.Gain,
): void {
  const host = _rooms[room];
  if (!host || !effect) {
    disposeQuietly(effect);
    return;
  }
  try {
    _cells[key] = {
      in: host.in,
      dry: null,
      wet: new GainCtor(0),
      cut: host.cut,
      effect,
      connected: false,
      mix: 0,
      darken: null,
      room,
      depth: 0,
      lfos: effectLfos(effect),
    };
    stopLfos(_cells[key]); // built dark, as a chain cell
  } catch (err) {
    devWarn('[AudioEngine] the ' + key + ' branch of the ' + room + ' room could not be constructed; it is left out', err);
    disposeQuietly(effect);
  }
}

/** `key`'s live room, or undefined when it is left out. */
export function getRoom(key: RoomKey): Room | undefined {
  return _rooms[key];
}

/** A room's nodes in signal order, upstream first, for disconnectAllFxNodes: `in`, each branch's effect and wet gain,
 *  `cut`, `return`. Empty for an absent room. */
export function roomNodes(key: RoomKey): Array<Tone.ToneAudioNode | null> {
  const room = _rooms[key];
  if (!room) return [];
  const branches = ROOM_BRANCHES[key].flatMap((branch) => {
    const cell = _cells[branch];
    return cell?.room === key ? [cell.effect, cell.wet] : [];
  });
  return [room.in, ...branches, room.cut, room.return];
}

/** A room is live while some robot feeds it and its Return is above 0: the two drivers of every branch's crossing. */
function roomLive(room: Room): boolean {
  return room.fed && room.returnLevel > 0;
}

/** Re-run every branch's Mix write at its recorded depth, so each lights or darkens to match the room's liveness. */
function syncRoom(key: RoomKey): void {
  for (const branch of ROOM_BRANCHES[key]) {
    const cell = _cells[branch];
    if (cell?.room === key) writeCellMix(branch, cell.depth);
  }
}

/** The engine's word on whether anyone sends into `key`'s room (spec assumption 3): AudioEngine calls it only when its
 *  set of feeding robots becomes empty or non-empty. A change re-targets every branch. */
export function setRoomFed(key: RoomKey, fed: boolean): void {
  const room = _rooms[key];
  if (!room || room.fed === fed) return;
  room.fed = fed;
  syncRoom(key);
}

/** The Return: ramps `key`'s return gain over COLOUR_RAMP_SECONDS and, when the level crosses 0, re-targets every branch
 *  (a Return of 0 takes the room's effects out of the signal path). A non-finite or re-sent equal level writes nothing. */
export function setRoomReturn(key: RoomKey, level: number): void {
  const room = _rooms[key];
  if (!room || !Number.isFinite(level) || level === room.returnLevel) return;
  const wasLive = roomLive(room);
  room.returnLevel = level;
  rampOrSet(room.return.gain, level, COLOUR_RAMP_SECONDS);
  if (roomLive(room) !== wasLive) syncRoom(key);
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
