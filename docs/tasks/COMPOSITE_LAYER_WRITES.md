# Implementation Plan: Composite Layer Writes

Spec: [docs/specs/COMPOSITE_LAYER_WRITES.md](../specs/COMPOSITE_LAYER_WRITES.md). Intent:
[docs/intent/composite-layer-writes.md](../intent/composite-layer-writes.md). Backlog slots:
[40](../todo/backlog.md#40-audio-every-layer-write-re-applies-every-layers-phase) and
[41](../todo/backlog.md#41-audio-the-composite-voices-layer-records-drift-from-the-robots-layers), the first line of
plan.md's Stage 1, on one branch because their fixes are one mechanism. Build branch: `fix/composite-layer-writes` off
`main` at `a5d5944d`. One PR closes 40 and 41.

**Spec §7 is resolved** (Crawford, 2026-10-27, each as proposed). The Architecture Decisions record each answer:

- Q1: the action rebuilds on `needsRebuild` (T8).
- Q2: `LayerLivePatch` loses `adsr` and `portamento`; `setShared` is their only path (T3, T6).
- Q3: the reservation-time top-level write stays; out of scope.
- Q4: the probe stays in scratch; its table goes into PERFORMANCE.md (T10).
- Q5: an LFO link on a never-built layer resolves `null` until the unmute rebuild re-primes it (T5, T8).

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, and for T9 the
T7 scratch harness (`profile-raw.mjs`, spec §5.3) against `npx vite build --minify false --outDir <scratch>` +
`npx vite preview`.

The planning skill's default output paths, `tasks/plan.md` and `tasks/todo.md`, are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

The composite voice ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts)) learns two things: which
robot layer each of its synths is (`index`), and what it last wrote to each (`written`). `set` routes by index, skips
a field whose value equals its record, and reports a non-zero gain it had no synth for. `setShared` becomes the one
path for the ADSR and portamento. The engine ([AudioEngine.ts](../../src/engine/AudioEngine.ts)) passes the indices at
reservation, resolves LFO targets by them, sends envelope and portamento edits through `setShared`, and returns
`needsRebuild` from `updateVoiceLayerParams`. `applyLayersContinuous`
([robotOptionsActions.ts](../../src/systems/robotOptionsActions.ts)) rebuilds the voice on that flag, the way
`applyLayersStructural` already does.

The work is ordered so **every commit type-checks and the suite stays green**, inside out: four composite tasks
(T1–T4) behind the existing mocked-Tone tests, then three engine tasks (T5–T7), then the one action task (T8).
Checkpoint A closes the composite, B the engine, C the code. T9 is the measurement (recorded, not gated), Checkpoint D
is Crawford's listen, and T10–T11 are docs and the backlog.

Each task names its **Proof** (TASK_TEMPLATE.md):

- a RED test for the eight that change behaviour (T1–T8);
- a run for T9;
- a Read for T0, T10 and T11.

One commit per task. Every new test is mutation-checked (break the code, see it fail, restore). No docs guards and no
source scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **Records are written targets, never node reads** (spec §3). `written` is updated in the same `if` as the write it
  follows, so the two cannot drift. Nothing reads `.value` off a node to decide a write: headless stubs have none, and a
  glide in flight would never compare equal.
- **`indices` is an optional fourth parameter of `createCompositeVoice`, defaulting to positions.** Every existing
  direct-build test keeps compiling and passing; only `reserveVoice` passes real indices. Rejected: changing the
  descriptor shape, which touches every fixture.
- **The reservation-time patch becomes index-keyed (found during planning, not in the spec's task list).**
  `reserveVoice`'s post-build `set` builds `layersParam` by mapping over the audible list, so on a voice with indices
  `[0, 2]` its second entry would be read as robot layer 1 and dropped or misrouted. T5 builds that array at the robot
  indices (holes where no layer was built). The write itself stays (§7 Q3).
- **`set` iterates by index, not `forEach`.** A sparse patch array (holes for layers that were not built, from T5's
  reservation patch) must behave the same as an array with `undefined` entries; an explicit `for` over
  `params.layers.length` with a `continue` on a missing patch makes that one rule.
- **The ADSR record is a copy, compared field by field** (`attack`, `decay`, `sustain`, `release`, `attackCurve`,
  `releaseCurve`), never by reference: the store hands the engine fresh objects on every edit.
- **`setShared` with a `time` ignores it**, as the ADSR and portamento are settings (backlog 38's rule, spec §3). The
  parameter is accepted so `updateVoiceEnvelope`'s signature keeps carrying the tick time through (BeatClock Transport
  time §3).
- **`unrouted` means "a non-zero gain with no synth"** (spec §3). Detune, phase or pulse width for a never-built layer
  are dropped silently and are not a rebuild trigger; a swell cannot start there (`isRobotAttributeStructurallyLive`).
- **Resolves spec §7 Q1: the action rebuilds.** `updateVoiceLayerParams` returns a boolean; `applyLayersContinuous`
  calls a new `rebuildVoice(robot)` that `applyLayersStructural` also uses (`reReserveVoice` then `primeRobotLinks`,
  its existing body). The engine never calls `primeRobotLinks` (it lives in the systems layer).
- **Resolves §7 Q2: one path per field.** `LayerLivePatch` becomes `Partial<Pick<OscillatorLayer, 'gain' | 'detune' |
  'phase' | 'pulseWidth'>>`. The narrowing may not break the engine at T3 (its patched array is a variable, so no
  excess-property check); T6 switches the engine regardless, and if the compiler does reject it at T3, T6's change
  lands in T3's commit and is recorded there.
- **Resolves §7 Q5: a link on a never-built layer resolves `null`.** `getRobotModulationTarget` uses `layerAt`;
  `lfoEngine` already treats `null` as "not connectable". After the unmute rebuild `primeRobotLinks` connects it.
- **Task order.** T5 needs T1 (`layerAt`, `indices`); T6 needs T3 (`setShared`); T7 needs T4 (`unrouted`); T8 needs
  T7. T5 could run in parallel with T2–T4 in another session; in one session it follows them.

## Dependency Graph

```
T0 (docs slot)
 │
 T1 (composite: index, written, layerAt, routing)
 │            \
 T2 (skip)     T5 (engine: indices, reservation patch, modulation target)
 │
 T3 (setShared, patch narrowed)
 │            \
 T4 (unrouted) T6 (engine: envelope/portamento via setShared — needs T3)
 │
 T7 (engine: needsRebuild — needs T4, T5)
 │
 T8 (action: rebuild on needsRebuild)
 │
 ─── Checkpoint C (full suite, build) ───
 │
 T9 (measurement, recorded)
 │
 ─── Checkpoint D (Crawford's listen) ───
 │
 T10 (docs) → T11 (backlog)
```

## Task List

### Phase 0: The slot

- [x] **Task 0: `docs/specs/COMPOSITE_LAYER_WRITES.md`, `docs/todo/backlog.md`: status lines**

  **Description:**
  - The spec's **Status** paragraph records Crawford's five answers and links this plan (done 2026-10-27 in the working
    tree; this task is its commit, with the intent and this plan).
  - Under backlog 40 and 41, one paragraph each points at the intent, the spec, this plan and the branch, and records
    what is already known: 40's size (0.03 %) and the probe's verdict (inaudible); 41 confirmed by code read with the
    fourth victim (`getRobotModulationTarget`). "Fix: not decided" becomes "Fix: spec'd".
  - plan.md's Stage 1 line already names both; it is not changed.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [x] Each §7 question carries a Decided line (the Status paragraph).
  - [x] Backlog 40 and 41 link the intent, the spec, this plan and `fix/composite-layer-writes`.
  - [x] Every link and anchor in the three docs resolves (the scratchpad slug checker; compare the broken-link count
        before and after, not a zero check — `docs/` carries 655 older broken links).

  **Verification:**
  - [x] Manual read of the diffs. Anchors checked against the headings they target.

  **Dependencies:** Crawford's answers to spec §7 (given 2026-10-27).

  **Files:** `docs/specs/COMPOSITE_LAYER_WRITES.md`, `docs/intent/composite-layer-writes.md`, `docs/todo/backlog.md`,
  this plan

  **Estimated scope:** XS (docs only)

---

### Phase 1: The composite

- [x] **Task 1: `compositeVoice.ts`: records carry `index` and `written`, `layerAt`, and `set` routes by index**

  **Description:**
  - `createCompositeVoice(descriptor, adsr, portamento = 0, indices?: number[])`. `indices[k]` is the robot layer
    index of the k-th built layer; absent, it is `k`. Each record becomes `{ index, synth, gainNode, written }`, with
    `written` seeded from exactly what construction wrote: the layer's `gain`, `detune`, `phase`, `pulseWidth` (when
    present), the shared `adsr` (a copy) and `portamento`. The `layer` field goes (nothing reads it once T6 lands;
    until then the engine's `{ ...layer, adsr }` maps read `written` instead — see Files).
  - `layerAt(index)` returns the record with that `index` or `undefined`. `layers` stays exported, each entry now
    carrying `index`.
  - `set` loops `for (let i = 0; i < params.layers.length; i++)`, skips a missing patch, and routes patch `i` to
    `layerAt(i)`. No diffing yet (T2); every present field is still written, as today.
  - `getRobotModulationTarget` and the two engine re-stamp maps are touched only as far as the compiler requires
    (`layer` → `written`); their behaviour changes in T5 and T6.

  **Proof:** RED test — `src/engine/audioEngine/compositeVoice.test.ts`: build with `indices: [0, 2]`, `set({ layers:
  [{ gain: 0.1 }, { gain: 0.2 }, { gain: 0.3 }] })`: the first gain node gets 0.1, the second gets 0.3, nothing gets
  0.2; `layerAt(1)` is `undefined`, `layerAt(2)` is the second record, `layers[1].index === 2`. Fails today: the
  fourth parameter does not exist and position matching puts 0.2 on the second node.

  **Acceptance criteria:**
  - [x] Routing by index as above; a sparse patch array (`const p = []; p[2] = { gain: 0.3 }`) routes the same as one
        with `undefined` holes.
  - [x] Without `indices`, every existing `compositeVoice.test.ts` case passes unmodified (position = index).
  - [x] `written` after construction equals the build values: a case builds `[gain 0.8, detune −5, phase 90, width
        0.3]` with `adsr` and `portamento 0.2` and reads `layerAt(0).written` back, `adsr` by value not reference.
  - [x] The existing "match by index" comment on `set` is replaced by one sentence naming this spec.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes.
  - [x] Mutation: route by position (`layerNodes[i]`) and the RED case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T0.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `src/engine/audioEngine/compositeVoice.test.ts`,
  `src/engine/AudioEngine.ts` (only the `layer` → `written` reads the compiler demands)

  **Estimated scope:** S (one module and its test, plus a mechanical rename in the engine)

- [x] **Task 2: `compositeVoice.ts`: a write equal to its record is skipped, timed or not**

  **Description:**
  - In `set`, each field's branch becomes "if present and `!==` the record: write, then record". Gain and detune
    through `setOrGlide` / `applyOscDetune` with the `time`; phase and pulse width through `applyOscFieldViaSet`;
    portamento through `synth.portamento`; the ADSR through `synth.set({ envelope })`, compared field by field and
    written whole when any field differs, the record taking a copy.
  - Construction is untouched: it writes everything and seeds the records (T1).

  **Proof:** RED test — `compositeVoice.test.ts`: build `[sine gain 0.8 detune 0 phase 90]`, clear the mocks, `set`
  with the same three values: no gain write, no detune write, no `synth.set`. Fails today: all three are written.

  **Acceptance criteria:**
  - [x] Equal values write nothing; a changed gain writes exactly once and nothing else; the same for detune, phase,
        pulse width, portamento and the ADSR (one `synth.set({ envelope })` for a one-field change, none for an
        identical object with a different reference).
  - [x] Timed: with a `time` and a `rampTo` stub, an equal gain makes no `rampTo` call and a changed one makes one.
  - [x] Records follow writes: `set({ layers: [{ gain: 0.5 }] })` twice writes once; construction's phase write
        happens once and a following `set` with the same phase does not repeat it.
  - [x] Every existing `set` case still passes; where one asserted a write of an unchanged value, its value changes to
        one that differs from the build, named in the commit.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes.
  - [x] Mutation: drop the guard on one field (gain), the RED case fails; record before writing (so the write is
        skipped), the "records follow writes" case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T1.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `src/engine/audioEngine/compositeVoice.test.ts`

  **Estimated scope:** S (one module and its test)

- [x] **Task 3: `compositeVoice.ts`: `setShared`, and `LayerLivePatch` loses `adsr` and `portamento`** *(§7 Q2)*

  **Description:**
  - `setShared({ adsr?, portamento? }, time?)` applies either field to every built layer through T2's record-and-skip
    rule. `time` is accepted and ignored (settings).
  - `LayerLivePatch` becomes `Partial<Pick<OscillatorLayer, 'gain' | 'detune' | 'phase' | 'pulseWidth'>>`; `set`'s
    `adsr` and `portamento` branches move into `setShared`.
  - The existing cases that send `adsr` or `portamento` through `set({ layers })` move to `setShared`; the "settings
    are the same calls with a time as without" case asserts through `setShared` for the two shared fields and `set`
    for phase and pulse width, with values that differ from the build so they are written.
  - If `npm run build:types` rejects the engine's `{ ...written, adsr }` map after the narrowing, T6's switch to
    `setShared` lands here and T6 becomes its tests only; record it in the commit.

  **Proof:** RED test — `compositeVoice.test.ts`: `setShared({ adsr })` on a two-layer voice calls `synth.set({
  envelope })` once per layer; the same call again writes nothing; a one-field change writes once per layer;
  `setShared({ portamento: 0.3 })` sets `synth.portamento` on each and not again. Fails today: no `setShared`.

  **Acceptance criteria:**
  - [x] As the proof, plus: `setShared` writes no layer field (no gain, detune, phase or width write).
  - [x] `set({ layers: [{ adsr }] })` no longer type-checks (compiler, no test).
  - [x] All moved cases pass; the composite test file has no `set` call carrying `adsr` or `portamento`.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes.
  - [x] Mutation: make `setShared` write the ADSR to the first layer only, and the per-layer case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T2.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `src/engine/audioEngine/compositeVoice.test.ts` (and
  `src/engine/AudioEngine.ts` only in the compiler case above)

  **Estimated scope:** S (one module and its test)

- [x] **Task 4: `compositeVoice.ts`: `set` returns `{ unrouted }`**

  **Description:** `set` collects the indices of patches whose `gain` is a number `> 0` and whose `layerAt(i)` is
  `undefined`, and returns `{ unrouted }`. Any other field on a missing layer is dropped silently. `CompositeVoice.set`'s
  return type changes; the stub composite in `reserveVoice`'s failure path returns `{ unrouted: [] }`.

  **Proof:** RED test — `compositeVoice.test.ts`: on an `indices: [0, 2]` voice, `set` with `{ gain: 0.5 }` at index 1
  returns `{ unrouted: [1] }`. Fails today: `set` returns `undefined`.

  **Acceptance criteria:**
  - [x] `{ gain: 0.5 }` at a missing index → `[1]`; `{ gain: 0 }` or `{ detune: 5 }` there → `[]`; a full-voice `set`
        → `[]`; two missing non-zero gains → both indices, ascending.
  - [x] A `gain: 0.5` patch at a built index is never reported, even when equal to the record (skipped, not
        unrouted).

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes.
  - [x] Mutation: report any missing index regardless of gain, and the `{ detune: 5 }` case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T1 (routing); independent of T2–T3 but ordered after them.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `src/engine/audioEngine/compositeVoice.test.ts`,
  `src/engine/AudioEngine.ts` (the stub's return)

  **Estimated scope:** XS (one branch and a return)

### Checkpoint A: The composite
- [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts src/engine/AudioEngine.test.ts` passes.
- [x] `npm run build:types`, `npm run lint` clean.
- [x] The composite routes by index, skips equal writes, has `setShared`, reports `unrouted`; the engine still
      compiles against it and behaves as before for full voices.
- [x] Reviewed with Crawford before Phase 2.

---

### Phase 2: The engine

- [x] **Task 5: `AudioEngine.ts`: `filterAudibleLayers` keeps indices, `reserveVoice` passes them, the reservation
  patch and `getRobotModulationTarget` are index-keyed** *(§7 Q5)*

  **Description:**
  - `filterAudibleLayers` returns `{ layers, indices }` for the array shape (and the same for the `{ base, layers }`
    shape, where `base` alone is index `0`). `reserveVoice` passes `indices` to `createCompositeVoice`.
  - `reserveVoice`'s post-build `set` (the `phase` / `detune` / `pulseWidth` parameters) builds `layersParam` at the
    robot indices, with holes elsewhere, so it reaches the right synths (Architecture Decisions). Its values and its
    guard are unchanged (§7 Q3).
  - `getRobotModulationTarget` resolves `layerN.*` through `voice.layerAt(N)`.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: reserve `[l0, l1 (gain 0), l2]`; `updateVoiceLayerParams`
  with l2's detune changed writes the second synth's detune, and with l1's detune changed writes nothing;
  `getRobotModulationTarget('layer2.gain')` is the second gain node's `gain` and `'layer1.gain'` is `null`. Fails
  today: l1's edit lands on the second synth and `'layer2.gain'` returns `null`.

  **Acceptance criteria:**
  - [x] As the proof, plus: the voice has two records with `index` `[0, 2]`.
  - [x] Reserving `[l0 (pulse, width 0.3), l1 (gain 0), l2]` with the reservation-time `pulseWidth` writes the width
        to the synths at indices 0 and 2, none at 1 (today's copy-to-all behaviour, now at the right indices).
  - [x] The pinned node-count baseline ("builds today node counts for a plain two-layer reservation") and every other
        reservation case pass unmodified.
  - [x] The existing `getRobotModulationTarget` cases pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] Mutation: pass no `indices` from `reserveVoice`, and the RED case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T1 (and T4 for the stub's return type if T4 landed first — it did, by order).

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (one module and its test; three functions)

- [x] **Task 6: `AudioEngine.ts`: `updateVoiceEnvelope` and `updateVoicePortamento` go through `setShared`**

  **Description:** Both methods call `entry.composite.setShared({ adsr }, time)` / `setShared({ portamento })` and
  stop mapping over the composite's records. Their doc comments say "the two robot-level fields; no layer field is
  written". If T3 already made this change under the compiler, this task is its tests.

  **Proof:** RED test — `AudioEngine.test.ts`: reserve `[l0, l1]`, `updateVoiceLayerParams` with l0 gain 0.3, clear the
  mocks, `updateVoiceEnvelope(adsr)`: every synth gets `{ envelope }` and no gain node is written. Fails today (with
  T2 in place the build-time 0.8 differs from the written 0.3, so the stale patch writes it back).

  **Acceptance criteria:**
  - [x] As the proof, for the envelope and for portamento.
  - [x] The existing "hands a Transport time to composite.set with the patched layers" case becomes "hands it to
        `setShared({ adsr }, 3.25)`, and `undefined` without one".
  - [x] The "applies the new ADSR to every audible layer's live synth" and the portamento cases pass, adjusted only
        in what call they spy on.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] Mutation: restore the `{ ...written, adsr }` map through `set`, and the RED case fails on the gain write.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T3.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** XS (two method bodies and their cases)

- [x] **Task 7: `AudioEngine.ts`: `updateVoiceLayerParams` returns `needsRebuild`**

  **Description:** The method returns `set(...).unrouted.length > 0`; `false` when no composite is reserved (the
  existing `devWarn` no-op) and `false` from the failure-path stub. The doc comment's "two-tier update rule" gains the
  third line: a non-zero gain on a layer with no synth returns `true`, and the caller rebuilds.

  **Proof:** RED test — `AudioEngine.test.ts`: on the `[l0, l1 (gain 0), l2]` voice, `updateVoiceLayerParams` with l1
  gain 0.5 returns `true`. Fails today: `void`.

  **Acceptance criteria:**
  - [x] `true` for l1 gain 0.5; `false` for l1 gain 0, for l0 gain 0 (muting a built layer), for a full-voice call,
        and for an unreserved robot (and no throw).
  - [x] The existing `updateVoiceLayerParams` cases pass unmodified.
  - [x] The actions test's spy `vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => {})`
        (`robotOptionsActions.test.ts` ~973) becomes `() => false` so it type-checks against the new return; no
        other change there (T8 adds the `true` cases).

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/systems/robotOptionsActions.test.ts` passes.
  - [x] Mutation: return `unrouted.length >= 0`, and the `false` cases fail.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T4, T5.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/systems/robotOptionsActions.test.ts`
  (the one spy's return)

  **Estimated scope:** XS

### Checkpoint B: The engine
- [x] `npx vitest run src/engine` passes.
- [x] `npm run build:types`, `npm run lint` clean.
- [x] A voice built with a muted layer routes edits and LFO targets by robot index; an envelope or portamento edit
      writes no layer field; `updateVoiceLayerParams` reports the unmute case.
- [x] Reviewed with Crawford before Phase 3.

---

### Phase 3: The action

- [x] **Task 8: `robotOptionsActions.ts`: `applyLayersContinuous` rebuilds on `needsRebuild`** *(§7 Q1)*

  **Description:** A new `rebuildVoice(robot)` holds `applyLayersStructural`'s two engine calls (`reReserveVoice`,
  `primeRobotLinks`) and both actions use it. `applyLayersContinuous` writes the store, calls
  `updateVoiceLayerParams`, and on `true` calls `rebuildVoice`. Its doc comment replaces "muting a layer is a live
  update, not a rebuild" with the full rule: mute is live; unmuting a layer that has a synth is live; unmuting one
  that has none rebuilds, after the store write so the rebuild reads the new gain.

  **Proof:** RED test — `src/systems/robotOptionsActions.test.ts`: with `AudioEngine.updateVoiceLayerParams` mocked to
  return `true`, `applyLayersContinuous` calls `reReserveVoice` then `primeRobotLinks`, after the store write. Fails
  today: neither is called.

  **Acceptance criteria:**
  - [x] Mocked `true`: store write, then `reReserveVoice(robot.id)`, then `primeRobotLinks(robot)`, in that order.
  - [x] Mocked `false` (and the default `undefined`): neither is called; the existing continuous cases pass
        unmodified.
  - [x] `applyLayersStructural`'s existing cases pass unmodified (same two calls, now through `rebuildVoice`).
  - [x] The tick's time still reaches `updateVoiceLayerParams` last (the existing `audioSwells.test.ts` case passes
        unmodified).

  **Verification:**
  - [x] `npx vitest run src/systems/robotOptionsActions.test.ts src/systems/audioSwells.test.ts` passes.
  - [x] Mutation: drop the `primeRobotLinks` call from `rebuildVoice`, and the ordered case fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** T7.

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S (one helper, one branch, cases)

### Checkpoint C: The code
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (the known `sceneToOrbiterLocal`
      5 s timeout, which passes alone, is not this branch's; any other failure is).
- [x] Spec §5.6's first four boxes hold: tests 1–13, index routing, no layer field from an envelope edit, the unmute
      rebuild.
- [x] Reviewed with Crawford before the measurement.

---

### Phase 4: The run and the listen

- [x] **Task 9: the measurement (spec §5.3) — recorded, not gated**

  **Description:** T7's method, one session, two builds: the branch base (`main` at `a5d5944d`, a clean `git
  worktree`) and the branch head, each `npx vite build --minify false --outDir <scratch>` and `vite preview` on its
  own port. S1 (`charlie`, 200, −30, `s=1.q1YqTlOyMjTTUSpOAdK1AA`), `--throttle 4`, three runs each, interleaved so no
  build runs twice in a row, foreground, one run per call, orphaned Chrome 0 before and after every call. The scratch
  harness (`profile-raw.mjs` + `analyze.mjs`) is rebuilt from PERFORMANCE.md's T7 description in the session
  scratchpad, not committed. Prove it first: the base's buckets must land inside T7's head ranges (tick 2.90–3.07 %,
  envelope 0.47–0.68 %, param writes 0.39–0.56 %) before the branch is read; a base outside them is reported and the
  harness fixed before any branch number is quoted.

  **Proof:** the run. No test file.

  **Acceptance criteria:**
  - [x] Medians and min–max for both builds on spec §5.3's buckets: the tick inclusive and store-excluded, envelope,
        robot param writes, oscillator settings and its phase-setter share, long tasks and how many hold tick time.
  - [x] The expected direction is stated against the numbers: envelope toward 0.22 %, param writes toward 0.16 %,
        phase setter toward 0. A miss is written as a number and a reason; the branch continues (§7 Q2 of the
        interview: recorded, not gated).

  **Verification:**
  - [x] The table is in the session notes, ready for T10, with the build commits, bundle names and ports.
  - [x] Worktrees removed; `git status` clean apart from the branch's own work.

  **Dependencies:** Checkpoint C.

  **Files:** none in the repo (scratch only)

  **Estimated scope:** M (two builds, six runs, the harness rebuilt; about an hour of wall clock)

### Checkpoint D: Crawford's listen (spec §5.5)
- [ ] Engine files changed: hard-reload (`Ctrl+Shift+R`) on `npm run dev` before listening.
- [ ] One robot alone, long Release: a gain drag then an ADSR drag leaves the gain where it was put.
- [ ] A robot with one layer muted: detune drags move the right layers; raising the muted layer's gain makes it sound
      after a short gap; lowering a built layer to 0 and back is live.
- [ ] A swell on a sustained note: nothing new to hear.
- [ ] Crawford's verdict recorded here and in T11's Built lines.

---

### Phase 5: Docs and the backlog

- [ ] **Task 10: `docs/AUDIO_SYSTEM.md`, `docs/PERFORMANCE.md`, doc comments — document the shipped behaviour**

  **Description:**
  - AUDIO_SYSTEM.md, "Layered / Composite Voices": the records (`index`, `written`), routing by robot index, the
    equal-write skip, `setShared` as the path for the ADSR and portamento, `updateVoiceLayerParams`'s `needsRebuild`
    and the unmute rebuild. Its sentence that a muted layer "only gets excluded from the graph on the next real
    rebuild" and the "Recommended usage" lines for envelope and glide edits are rewritten to match. Spot-check every
    named identifier against the shipped source, not this plan.
  - PERFORMANCE.md: T9's table beside T7 under its own heading, and spec §5.4's probe table and recipe under a second
    heading ("Is an unchanged phase re-apply audible?"), both dated.
  - The composite's and the three engine methods' doc comments say what the composite records and why in one
    sentence, pointing at the spec; no "used to", no "fixed in".

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented name exists in the shipped source with the documented signature (`createCompositeVoice`'s
        fourth parameter, `layerAt`, `setShared`, `set`'s return, `updateVoiceLayerParams`'s return, `rebuildVoice`).
  - [ ] PERFORMANCE.md carries both tables with their methods, builds and dates.
  - [ ] Links and anchors resolve (before/after count).

  **Verification:**
  - [ ] Manual review against the source.
  - [ ] `npm run build:types`, `npm run lint` clean (doc comments only).

  **Dependencies:** T9, Checkpoint D.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/PERFORMANCE.md`, `src/engine/audioEngine/compositeVoice.ts`,
  `src/engine/AudioEngine.ts`, `src/systems/robotOptionsActions.ts` (comments only)

  **Estimated scope:** S (docs and comments)

- [ ] **Task 11: `docs/todo/backlog.md`: Built lines on 40 and 41**

  **Description:** Each item gains a **Built** line: the branch, the commits, T9's numbers in one sentence, Checkpoint
  D's verdict, and for 40 the probe's verdict. At merge, both items move whole to `archive/backlog-archive.md` under
  the usual `**Closed**` header with links rebased, no stub is left, inbound `backlog.md#40-…` / `#41-…` links are
  repointed (grep `docs/`), and plan.md's Stage 1 line for them is deleted — the archive conventions as practised on
  36–38.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [ ] Both Built lines name the branch, the listen's verdict and T9's numbers.
  - [ ] Every link and anchor resolves (before/after count).

  **Verification:**
  - [ ] Manual read.

  **Dependencies:** T10.

  **Files:** `docs/todo/backlog.md` (and at merge `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`)

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every task's acceptance criteria are met, and any not met are stated with the reason.
- [ ] AUDIO_SYSTEM.md and PERFORMANCE.md match the shipped code and the run.
- [ ] Checkpoint D's verdict is recorded in both Built lines.
- [ ] Ready for Crawford's PR, which closes 40 and 41. Next in plan.md: backlog 27's interview.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A skipped write hides a real need to write: a node whose value moved underneath the record (a rebuild, an LFO link writing the same Signal, a `cancelScheduledValues`) | Medium | The record is reset by construction (a rebuild builds fresh records). LFO links modulate through a connected Signal and do not touch the record's target. An untimed hand edit always differs from a swell's last float. Named in the spec (§3) so a future "why didn't it write" starts here. |
| T5's reservation-time patch builds a sparse array and `set` uses `forEach`, which skips holes — fine — but some consumer later uses `map` and gets holes back | Low | Architecture Decision: `set` iterates by index with an explicit `continue`; T1's acceptance covers a sparse patch array. |
| The `LayerLivePatch` narrowing (T3) breaks the engine's compile before T6 | Low | T3 names the fallback: T6's change lands in T3's commit and is recorded. |
| `written.adsr` compared by reference and a fresh store object defeats the skip, so an ADSR swell writes every tick as today | Medium | Architecture Decision: field-by-field; T2's "identical object, different reference" case is the mutation target. |
| The existing "match by index" composite cases pin position semantics in a way T1 breaks silently (a fixture with fewer patches than layers) | Low | T1's acceptance: every existing case passes unmodified without `indices`; a case that changes is named in the commit and is a finding, not a shift. |
| An unmute rebuild re-primes LFO links on a robot whose links were deliberately disconnected by the Load Budget | Low | `primeRobotLinks` is the same call `applyLayersStructural` makes today for a type change; the budget's own subscription runs after either. Checkpoint D's muted-layer step listens for it. |
| `robotOptionsActions.test.ts` spies on the engine with `vi.spyOn(AudioEngine, 'updateVoiceLayerParams').mockImplementation(() => {})`, whose `undefined` return is falsy, so the rebuild branch is never exercised by accident — and a spy that returns `true` somewhere would rebuild where a case does not expect it | Low | T7 changes that spy to `() => false` for the type; T8's cases set the return explicitly in both directions; the existing continuous cases must pass unmodified (acceptance). |
| T9's numbers drift from T7's and the drop is read into noise | Medium | Same session, interleaved, three runs each; the base is proven inside T7's head ranges first; recorded, not gated. |
| The envelope bucket's remaining cost (one `synth.set({ envelope })` per built layer per ADSR tick) is read as a miss | Low | T9 states the expected floor: an ADSR swell still writes the envelope every tick by design (settings are stepwise, spec §3). |
| Crawford's listen cannot hear symptom 2's fix because the fields it restored were already near the build value | Low | Checkpoint D's first step drags gain far from the build value before the ADSR drag; the test (T6) is the proof either way. |

## Open Questions

All five from spec §7 are **resolved** (Crawford, 2026-10-27, "happy with your recs"), and the Architecture Decisions
record each.

1. **Who rebuilds on an unmute of a never-built layer?** **Resolved:** the action, through `rebuildVoice` (T8).
2. **`LayerLivePatch` loses `adsr` and `portamento`.** **Resolved:** yes (T3); `setShared` is the only path (T6).
3. **The reservation-time top-level write.** **Resolved:** stays, out of scope; T5 only keys its patch by robot index
   so it lands where it did before on a full voice and where it should on one with a muted layer.
4. **Where the probe lives.** **Resolved:** scratch; the table and recipe go into PERFORMANCE.md (T10).
5. **An LFO link on a never-built layer.** **Resolved:** `null` until the rebuild re-primes it (T5, T8); no UI change.
