// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';

import { detectCoarsePointer, latencyForLoad, resolveInitialAudioLoad } from '../utils/audioBudget';
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
// The hint comes from, in order: an explicit `?latency=interactive|balanced|playback`; otherwise the Audio Load
// preset in force at page load (docs/specs/AUDIO_LOAD_BUDGET.md §1.5) — `?load=`, or device detection when there is
// none — where Light selects `playback` and Standard/Full leave Tone's own default (interactive) alone. A context's
// hint is fixed at creation, so only the BOOT-TIME preset counts; moving the dial later never touches the context.
// That resolution uses only src/utils/audioBudget.ts (constants, no Tone, no stores), which is why it can run here.
// With neither, nothing is touched and Tone keeps its own default. Roadmap 17.2.4 / docs/todo/scratchy-audio-phones.md — Chrome
// Android's low-latency path is known to glitch on complex graphs, and `playback` is the usual
// mitigation; this switch exists so it can be A/B tested on a real phone from one deploy.

/** The hint to install, or `null` to leave Tone's default context alone. */
function resolveBootLatencyHint(): LatencyHint | null {
  const explicit = getLatencyOverride();
  if (explicit) return explicit;
  if (typeof window === 'undefined') return null;
  const load = resolveInitialAudioLoad({ search: window.location.search, coarsePointer: detectCoarsePointer() });
  // Only Light's hint differs from Tone's default, so interactive means "install nothing".
  return latencyForLoad(load) === 'playback' ? 'playback' : null;
}

function applyLatencyOverride(): LatencyHint | null {
  const hint = resolveBootLatencyHint();
  if (!hint) return null;
  Tone.setContext(new Tone.Context({ latencyHint: hint }), true);
  return hint;
}

/** The latency hint installed (from `?latency=` or the boot-time Audio Load preset), or `null` when Tone's default was left alone. */
export const appliedLatencyHint: LatencyHint | null = applyLatencyOverride();
