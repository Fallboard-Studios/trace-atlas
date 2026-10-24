# Phase Spec: Oscillator Leak Fix — Disconnecting the Dead Note's Params

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - The proof run: `npm run build && npx vite preview --port 4173` then
>   `npm run perf:audio -- --world "56c2t2t8:-116:-2?load=light&session=<D1>" --seconds 240 --bucket 15`
>   (the D1 link: [PERFORMANCE.md](../PERFORMANCE.md), "The seven links")

**Status:** spec written 2026-10-23 from the measurements in
[docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md) ("Backlog 27, desktop step 1" and "step 2").
Crawford's call of 2026-10-23: a dependency patch, **route (A), the in-app wrapper** (§7 question 1, resolved the same
day). Plan: [docs/tasks/OSCILLATOR_LEAK_FIX.md](../tasks/OSCILLATOR_LEAK_FIX.md). Backlog slot:
[32](../todo/backlog.md#32-audio-oscillator-leak-fix--disconnecting-the-dead-notes-params), the plan's T0 proposal;
the number (or a roadmap phase instead) stays Crawford's.

---

## 1. Overview & Claude Explanation

Every note the app plays leaves one native `OscillatorNode` alive for the life of the page. Tone 15.1.22's `Oscillator`
builds a fresh `ToneOscillatorNode` on each start from the stopped state and connects the Oscillator's persistent
`frequency` and `detune` Signals into the new node's params (`source/oscillator/Oscillator.js`, `_start`). When the note
ends, Tone disposes the `ToneOscillatorNode`: its own output is disconnected and its Param wrappers disposed, but the two
inbound connections are never removed, because only the source side can remove an inbound connection and nothing calls
`frequency.disconnect(deadNode.frequency)`. standardized-audio-context records every connection into an AudioParam in the
**source's** output Set as `[destinationParam, output]` (`factories/audio-node-constructor.js`, `connectAudioParam`),
scans that Set on every later insert, and forgets an entry only on a disconnect. So each note leaves two strong
references to an AudioParam whose `OscillatorNode` can never be collected, and every later connect from those Signals
scans a Set longer by two. On the dense world D1 at Light that is about two oscillators a second, 1 057 in fifteen
minutes, a straight line, deterministic to the world; a forced GC frees the matching Gains and not one oscillator. A
retrigger while a note still sounds reuses the node (`_restart` only cancels the pending stop), so staccato leaks and
legato does not. The app meets this by playing a `Tone.Synth` per layer (`src/engine/audioEngine/compositeVoice.ts`);
no wiring of ours is at fault.

**The fix** is one disconnect at the right moment: when the new node's `onended` fires, before Tone disposes it, call
`frequency.disconnect(node.frequency)` and `detune.disconnect(node.detune)`. The A/B of 2026-10-23 (a throwaway build
wrapping `Tone.Oscillator.prototype._start` this way) took D1 from +324 to +48 live nodes in four minutes, the remainder
oscillators and gains in step awaiting ordinary collection, with no change on the audio thread (stock 0.526–0.579 against
patched 0.541–0.558 mean capacity, same bursts, same max lag). The desktop never felt the leak; the fix is for the phone,
where memory and a lengthening per-note connect scan cost more, and for correctness.

**Delivery, two ways to patch a dependency** (§7 question 1 picks):

- **(A) An in-app wrapper, recommended.** A module `src/engine/tonePatches.ts` exporting
  `patchOscillatorEndedDisconnect(prototype)`, applied once at boot to `Tone.Oscillator.prototype` by
  `src/engine/audioContextSetup.ts`, which is already `main.tsx`'s first app import and so runs before any Oscillator
  can start. No new dependency, no `postinstall`, nothing rewritten under `node_modules/`. The wrapper feature-detects
  (`_start` a function, `_oscillator` set after it) and is a `devWarn`ed no-op otherwise, so a Tone upgrade that fixes
  or moves the code degrades to "the leak is back", never to a broken boot. Pure enough to unit-test against a stub
  prototype with no Tone import.
- **(B) `patch-package`.** A new devDependency plus a `postinstall` script and `patches/tone+15.1.22.patch` editing
  `Oscillator.js` itself (the same disconnects, in `_start`'s `onended`). Closer to what an upstream fix would look like
  and visible to anyone reading Tone's source in this repo; against it, a new dependency (CLAUDE.md: ask first), a
  patch that fails to apply on every Tone upgrade until regenerated, and a build step that rewrites `node_modules/`.
- **(C) Upstream.** A Tone.js issue and PR with the probe numbers. Worth filing whichever of A or B ships, since the
  fix is theirs to own; not a route on its own, the timeline is not ours.

(A) is recommended: it is the smaller change, it cannot break an install, and it carries its own test. (B) is right if
Crawford wants the fix to read as a change to Tone rather than a wrapper around it.

---

## 2. Target File Structure

```text
src/
└── engine/
    ├── tonePatches.ts            # NEW: patchOscillatorEndedDisconnect(prototype) and its guard
    ├── tonePatches.test.ts       # NEW: the stub-prototype tests (§5.1)
    └── audioContextSetup.ts      # one import + one call, after the context is installed
docs/
├── AUDIO_SYSTEM.md               # a paragraph under the diagnostics section: what the patch does and why
├── PERFORMANCE.md                # the proof run's numbers beside the step 2 A/B
└── todo/backlog.md               # the item's line, archived in the usual way when merged
```

Route (B) replaces the first three with `patches/tone+15.1.22.patch`, a `postinstall` in `package.json` and the
`patch-package` devDependency; the docs are the same.

---

## 3. Implementation Boundaries & Constraints

- **Sound unchanged.** The disconnect happens at `onended`, after the node has finished rendering; nothing audible
  moves. The listen (§5.3) is the check.
- **Applied once, before the first Oscillator start.** `audioContextSetup.ts` is the only call site; the function is
  idempotent (a marker on the prototype), so a second call changes nothing.
- **Feature-detected, never assumed.** If `prototype._start` is not a function, or `_oscillator` is not set after the
  original runs, the patch is a `devWarn`ed no-op. Both disconnects sit in one `try`; a throw there is swallowed (the
  leak stays, the sound does not change). Tone's own `onended` handler (`() => this.onstop(this)`) runs after ours.
- **No other Tone internals.** `_start` and `_oscillator` are the two private names touched; the test names them so a
  Tone upgrade that renames them fails loudly in CI rather than silently in the browser.
- **CLAUDE.md rules stand:** no Tone construction in components; `AudioEngine` remains the only musical scheduler; the
  patch is engine code under `src/engine/`.
- **Not in scope:** Tone's per-Param automation history (bounded at 1 000 events per Param; see step 2b), the
  standing deadline bursts at Light, and backlog 29's lost render quantum.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/engine/tonePatches.ts — shape, not final code
export const OSCILLATOR_ENDED_DISCONNECT_PATCHED = Symbol('oscillatorEndedDisconnect');

/** Wrap `prototype._start` so each new one-shot node disconnects the Oscillator's frequency and detune
 *  Signals from its own params in `onended`, before Tone disposes it. Idempotent; a no-op when the
 *  private API is not the one this was written against (Tone 15.1.22). */
export function patchOscillatorEndedDisconnect(prototype: unknown): boolean { /* … */ }
```

- `devWarn` from `src/utils/helpers` for the no-op path, never `console.*`.
- Types stay local to the module (`PatchableOscillator`); no `any`.
- Tests colocated: `tonePatches.test.ts` beside `tonePatches.ts`; they build a stub prototype and never import `tone`.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first, one task)

On a stub prototype whose `_start` sets `this._oscillator = { frequency, detune, onended }`:

1. After the patch, calling `_start(time)` runs the original with the same `this` and `time`.
2. Invoking the node's `onended` calls `frequency.disconnect(node.frequency)` and `detune.disconnect(node.detune)`
   once each, then the `onended` the original installed, in that order.
3. A `disconnect` that throws is swallowed; the original `onended` still runs.
4. A second `patchOscillatorEndedDisconnect(prototype)` leaves `_start` as it was after the first (idempotent; returns
   false).
5. A prototype without a `_start` function returns false, is left untouched and `devWarn`s once.
6. An `_start` that leaves `_oscillator` null does not throw and installs nothing.

### 5.2 The proof run (a run, not a test)

`npm run perf:audio` on D1 at Light, production build, 240 s, 15 s buckets, three rounds against the unpatched build on a
second port, interleaved, foreground, one run per call, orphaned Chrome 0 (PERFORMANCE.md hygiene). **Criterion:** the
`Oscillator` entry of the by-type line within the band the step 2 A/B set for the patched build (about +20 to +60 in
four minutes, in step with `Gain`), against the stock build's about +320; and mean capacity, peak window and `max lag`
inside the stock spread (no cost added). Recorded in PERFORMANCE.md beside the step 2 table.

### 5.3 The listen (Crawford)

D1 and D5 at Full on the desktop, a few minutes each: no change to the sound, no click at any note's end (the
disconnect lands after the node has finished). Then the Pixel sitting of plan.md Stage 1 carries this build beside
stock, per Crawford's decision of 2026-10-23.

### 5.4 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

---

## 6. Git & Workflow Context

- Branch `fix/oscillator-leak`, off `main` once `perf/underruns-desktop` has merged (it carries the harness columns the
  proof run reads), else off that branch.
- Tasks, in order, one commit each: **T1** the module and its six tests (RED first); **T2** the call in
  `audioContextSetup.ts`, types and lint; **T3** the proof run, recorded; **T4** the docs (AUDIO_SYSTEM.md,
  PERFORMANCE.md) and the backlog line; **T5** Crawford's listen. The PR is Crawford's.
- Commit messages: short, imperative, the proof named (the run for T3, "a Read" for T4).

---

## 7. Open Questions

1. **(A) wrapper or (B) `patch-package`?** Recommendation: (A). (B) needs the dependency approval CLAUDE.md asks for.
2. **File upstream?** A Tone.js issue with the probe's numbers (two inbound Signal connections per note never removed)
   costs an hour and would retire the patch one day. Recommendation: yes, after T3, as its own small task.
   **Moot, 2026-10-23 (plan T5):** upstream already has it, [#1379](https://github.com/Tonejs/Tone.js/issues/1379),
   fixed by [#1393](https://github.com/Tonejs/Tone.js/pull/1393) in Tone 15.3.11 (npm `next`; `latest` is still
   15.1.22). On that Tone this wrapper throws on every note, so the upgrade removes it: the plan's Open Question 4.
3. **Number.** A backlog item (the fix is a few dozen lines) or a roadmap phase (it changes a dependency's behaviour).
   Recommendation: backlog, next free number, with this spec linked.
