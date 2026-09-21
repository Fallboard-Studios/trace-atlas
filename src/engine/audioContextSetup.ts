// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

import { getLatencyOverride, type LatencyHint } from '../utils/debugParams';

// ========================================
// SIDE EFFECT AT IMPORT — must be main.tsx's FIRST import
// ========================================
// Tone creates its global context with `latencyHint: "interactive"` the first time anything calls
// `getContext()` — which importing 'tone' itself already does (its deprecated Transport/Destination/
// Draw/Listener exports are evaluated eagerly; this app uses only the lazy getTransport()-style
// accessors). A different hint therefore means *replacing* that default context before any Tone node
// is constructed on it: this module does that at import time, main.tsx imports it ahead of every
// other app module, and `disposeOld` closes the default context so nothing keeps running on it.
// It constructs no Tone nodes itself.
//
// Opt-in only (`?latency=interactive|balanced|playback`): with no param nothing is touched and
// Tone keeps its own default. Roadmap 17.2.4 / docs/todo/scratchy-audio-phones.md — Chrome
// Android's low-latency path is known to glitch on complex graphs, and `playback` is the usual
// mitigation; this switch exists so it can be A/B tested on a real phone from one deploy.

function applyLatencyOverride(): LatencyHint | null {
  const hint = getLatencyOverride();
  if (!hint) return null;
  Tone.setContext(new Tone.Context({ latencyHint: hint }), true);
  return hint;
}

/** The latency hint installed by `?latency=`, or `null` when Tone's default was left alone. */
export const appliedLatencyHint: LatencyHint | null = applyLatencyOverride();
