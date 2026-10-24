// ========================================
// IMPORTS
// ========================================
import { devWarn } from '../utils/helpers';

// ========================================
// TONE PATCHES — fixes to Tone's own behaviour, applied once at boot
// ========================================
// Tone 15.1.22's `Oscillator._start` builds a fresh one-shot node (`ToneOscillatorNode`) for every start from the
// stopped state and connects the Oscillator's persistent `frequency` and `detune` Signals into the new node's params.
// Nothing disconnects them when the note ends, and standardized-audio-context keeps every connection into an AudioParam
// in the source's output Set, so each note leaves one native OscillatorNode alive for the life of the page and every
// later connect from those Signals scans a longer Set. Spec: docs/specs/OSCILLATOR_LEAK_FIX.md (measured in
// docs/todo/scratchy-audio-phones.md, "Backlog 27, desktop step 1").
//
// The patch wraps `_start` so the new node's `onended` first runs the handler Tone installed (`() => this.onstop(this)`)
// and then disconnects the two Signals from its params, each disconnect swallowing a throw. Tone 15.3.11 fixed this
// upstream (Tone.js #1379, #1393: its handler disconnects the same two params); on such a Tone the repeat is the
// swallowed one, so the wrapper is safe there until the upgrade deletes it. Ours first would throw out of Tone's handler
// every note, before its `onstop`. An error from Tone's handler itself still propagates. It touches two private names,
// `_start` and `_oscillator`; when they are not what this was written against it is a devWarned no-op, so a Tone
// upgrade degrades to "the leak is back", never to a broken boot. No Tone import: it works on any prototype.

/** Marks a prototype already wrapped, so a second call changes nothing. */
const OSCILLATOR_ENDED_DISCONNECT_PATCHED = Symbol('oscillatorEndedDisconnect');

type Disconnectable = { disconnect(destination: unknown): unknown };

/** The one-shot node `_start` leaves on `_oscillator`. */
type OneShotNode = {
  frequency: unknown;
  detune: unknown;
  onended?: ((...args: unknown[]) => void) | undefined;
};

/** The parts of a Tone `Oscillator` instance the wrapper reads. */
type PatchableOscillator = {
  _oscillator?: OneShotNode | null;
  frequency: Disconnectable;
  detune: Disconnectable;
};

type StartFn = (this: PatchableOscillator, ...args: unknown[]) => unknown;

type PatchablePrototype = {
  _start: StartFn;
  [OSCILLATOR_ENDED_DISCONNECT_PATCHED]?: true;
};

/** One disconnect that never throws: a param Tone already disconnected (15.3.11+), or a Tone that wires this
 *  differently, leaves the leak as it was and the sound unchanged. */
function disconnectQuietly(source: Disconnectable, destination: unknown): void {
  try {
    source.disconnect(destination);
  } catch {
    // Not connected (any more): nothing to undo.
  }
}

function isPatchablePrototype(prototype: unknown): prototype is PatchablePrototype {
  return (
    typeof prototype === 'object' &&
    prototype !== null &&
    typeof (prototype as { _start?: unknown })._start === 'function'
  );
}

/** Wrap `prototype._start` so each new one-shot node disconnects the Oscillator's frequency and detune Signals from
 *  its own params in `onended`, after Tone's own handler and before Tone disposes it. Returns `true` when it wrapped, `false` when the prototype was
 *  already wrapped or is not the private API this was written against (Tone 15.1.22). */
export function patchOscillatorEndedDisconnect(prototype: unknown): boolean {
  if (!isPatchablePrototype(prototype)) {
    devWarn(
      '[tonePatches] Oscillator.prototype._start not found; the per-note oscillator leak is not patched.'
    );
    return false;
  }
  if (prototype[OSCILLATOR_ENDED_DISCONNECT_PATCHED]) return false;

  const originalStart = prototype._start;
  prototype._start = function (this: PatchableOscillator, ...args: unknown[]) {
    const result = originalStart.apply(this, args);
    const node = this._oscillator;
    if (typeof node !== 'object' || node === null) return result;

    const toneOnended = node.onended;
    const { frequency, detune } = this;
    node.onended = function (this: unknown, ...endedArgs: unknown[]) {
      try {
        toneOnended?.apply(this, endedArgs);
      } finally {
        disconnectQuietly(frequency, node.frequency);
        disconnectQuietly(detune, node.detune);
      }
    };
    return result;
  };
  prototype[OSCILLATOR_ENDED_DISCONNECT_PATCHED] = true;
  return true;
}
