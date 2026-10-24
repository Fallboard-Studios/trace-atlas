# Implementation Plan: Oscillator Leak Fix — Disconnecting the Dead Note's Params

Spec: [docs/specs/OSCILLATOR_LEAK_FIX.md](../specs/OSCILLATOR_LEAK_FIX.md). No intent doc: the work follows from the
measurements in [docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md) ("Backlog 27, desktop step 1",
"step 2", "step 2b") and Crawford's decisions of 2026-10-23 (a dependency patch; route **A**, the in-app wrapper).
Backlog slot: a new item under [backlog.md](../todo/backlog.md), number Crawford's (T0 proposes 32). Build branch
`fix/oscillator-leak` off `main` once `perf/underruns-desktop` has merged (T3's proof run reads that branch's harness
columns); off `perf/underruns-desktop` itself if the fix goes first.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run build && npx vite preview --port 4173` (the served build the proof run drives), `npm run perf:audio`.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

One new engine module and one call. `src/engine/tonePatches.ts` exports `patchOscillatorEndedDisconnect(prototype)`,
which wraps `Tone.Oscillator.prototype._start` so that every one-shot node Tone creates for a note gets an `onended`
that first disconnects the Oscillator's persistent `frequency` and `detune` Signals from the node's own params and then
runs Tone's handler. `src/engine/audioContextSetup.ts`, already `main.tsx`'s first app import, applies it once at boot.
The work is: the backlog line (T0) → the pure module with its six tests (T1) → the boot call with its test (T2) → the
proof run against an unpatched build, recorded (T3) → the docs (T4) → an optional upstream report draft (T5). Every
task names its **Proof** (TASK_TEMPLATE.md): RED tests for the two that change behaviour (T1, T2), a run for T3, a Read
for T0, T4 and T5. One commit per task, suite / types / lint / build green. No docs guards, no source scans (CLAUDE.md,
2026-10-23).

## Architecture Decisions

- **Resolves spec §7 question 1: route (A), the in-app wrapper.** Crawford, 2026-10-23. No new dependency, no
  `postinstall`, nothing rewritten under `node_modules/`; a Tone upgrade that moves the private names degrades to "the
  leak is back" with a `devWarn`, never to a broken install. Route (B), `patch-package`, is not built.
- **The patch is a pure function on a prototype, tested on a stub.** `patchOscillatorEndedDisconnect(prototype)` takes
  any object; the tests build a stub whose `_start` sets `_oscillator`, so `tonePatches.test.ts` imports no Tone and
  needs no AudioContext, the same way `audio-load-lib.test.mjs` tests the harness without Chrome.
- **Feature-detected, idempotent, swallowing.** A missing or non-function `_start` → `false` and one `devWarn`; a second
  call → `false` and no second wrap (a marker symbol on the prototype); a `disconnect` that throws → swallowed, Tone's
  own `onended` still runs. The two private names (`_start`, `_oscillator`) appear only in this module and its test, so
  a Tone upgrade that renames them fails the test, not the browser (spec §3).
- **Applied in `audioContextSetup.ts`, after the context install.** It is the one module guaranteed to run before any
  Oscillator can start (`main.tsx` line 6), and it already owns the "touch Tone before anything else" responsibility. The
  prototype patch needs no context, so its position relative to `applyLatencyOverride()` is for reading order only.
  The existing `audioContextSetup.test.ts` mocks `tone` without an `Oscillator`; the guard makes that a `false` with a
  `devWarn`, so those cases pass unchanged, and T2 adds the case that supplies one.
- **The proof is the harness, against an unpatched build in the same session.** Spec §5.2: `npm run perf:audio` on D1
  at Light reads the by-type node line; the stock build is `main` (or the commit before T2) built to a scratch `--outDir`
  and served on a second port, as the step 2 A/B did. Three rounds, interleaved. The criterion is the band step 2 set.
- **Order.** T0 before T1 so the backlog carries the work from the first commit (todo-archive conventions); T1 before T2
  because T2 calls T1's export; T3 after T2 because it measures the real boot path; docs last.

## Dependency Graph

```
T0 (backlog line + spec status)
        │
T1 (tonePatches.ts + 6 tests)
        │
T2 (the call in audioContextSetup.ts + its test)
        │
   Checkpoint A
        │
T3 (proof run: patched against stock, recorded in PERFORMANCE.md)
        │
   Checkpoint B (full suite, build, Crawford's listen)
        │
T4 (AUDIO_SYSTEM.md, backlog line finished)        T5 (upstream report draft — optional, Crawford's call)
        │                                                   │
        └──────────────────── Checkpoint: Complete ─────────┘
```

## Task List

### Phase 0: The slot

- [x] **Task 0: `docs/todo/backlog.md` — the item's line; spec status points here**

  **Description:** Add the backlog item (proposed **32. Audio: Oscillator Leak Fix — Disconnecting the Dead Note's
  Params**; Crawford may renumber): one paragraph naming the leak, the measurements that found it (step 1, step 2 of
  backlog 27), the chosen route and this plan; backlog 27's last update line gets a pointer to it. In the spec's
  **Status** line, record route (A) as decided and link this plan. Nothing else changes.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] The backlog has one new numbered item linking the spec and this plan; backlog 27 points at it.
  - [x] The spec's Status line says route (A), 2026-10-23, and links `docs/tasks/OSCILLATOR_LEAK_FIX.md`.

  **Verification:**
  - [ ] Manual review of the two files.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** None.

  **Files:** `docs/todo/backlog.md`, `docs/specs/OSCILLATOR_LEAK_FIX.md`

  **Estimated scope:** XS (docs only)

---

### Phase 1: The patch

- [x] **Task 1: `src/engine/tonePatches.ts` — `patchOscillatorEndedDisconnect(prototype)`**

  **Description:** New module. `patchOscillatorEndedDisconnect(prototype: unknown): boolean` wraps `prototype._start`:
  the wrapper calls the original with the same `this` and arguments, then reads `this._oscillator`; if it is an object,
  the wrapper replaces its `onended` with a function that, inside one `try`, calls `this.frequency.disconnect(node.frequency)`
  and `this.detune.disconnect(node.detune)`, then calls the `onended` the original installed (if any) with the same
  arguments. A marker (`Symbol`) on the prototype makes a second call return `false` without wrapping again. A prototype
  that is not an object, or whose `_start` is not a function, returns `false` and `devWarn`s once (`src/utils/helpers`).
  Types are local (`PatchableOscillator`, `OneShotNode`); no `any`; no Tone import. Ships as independently testable
  code; T2 gives it its caller.

  **Proof:** RED test — `src/engine/tonePatches.test.ts`: on a stub prototype, the six cases below, all failing before
  the module exists.

  **Acceptance criteria:**
  - [x] After patching, `_start(time)` runs the original with the same `this` and `time`, and returns its value.
  - [x] Firing the node's `onended(arg)` calls `frequency.disconnect(node.frequency)` once, `detune.disconnect(node.detune)`
        once, then the original `onended(arg)`, in that order (a call-order array in the test).
  - [x] A `disconnect` that throws is swallowed; the original `onended` still runs; nothing propagates.
  - [x] A second `patchOscillatorEndedDisconnect(prototype)` returns `false` and leaves `_start` the same function as
        after the first call (no double wrap: one `onended` chain, disconnects still called once).
  - [x] A prototype without a `_start` function (undefined, or a non-object) returns `false`, is left untouched, and
        `devWarn` is called once (`vi.mock('../utils/helpers')`).
  - [x] An original `_start` that leaves `_oscillator` null or undefined does not throw and installs nothing.

  **Verification:**
  - [x] `npx vitest run src/engine/tonePatches.test.ts` passes (RED first: the file does not exist).
  - [x] Mutation check: remove the `detune` disconnect and the order test fails; remove the marker and the idempotence
        test fails.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0.

  **Files:** `src/engine/tonePatches.ts`, `src/engine/tonePatches.test.ts`

  **Estimated scope:** S (one new module, one new test file)

### Checkpoint A: The patch
- [x] `npm run build:types`, `npm run lint` clean; `npx vitest run src/engine/tonePatches.test.ts` green.
- [x] The module has no caller yet; nothing in the app has changed.
- [x] Reviewed with Crawford before Phase 2 (a glance; the design is the spec's). Passed 2026-10-23.

---

### Phase 2: The boot call and the proof

- [x] **Task 2: `src/engine/audioContextSetup.ts` — apply the patch once at boot**

  **Description:** Import `patchOscillatorEndedDisconnect` and call it with `Tone.Oscillator?.prototype` after
  `appliedLatencyHint` is computed, exporting the result as `oscillatorLeakPatched: boolean` (read-only, for the
  diagnostics overlay if ever wanted; no UI). The module's header comment gains two lines on why the patch lives here
  (the one module that runs before any Oscillator can start). The existing tests, whose `tone` mock has no `Oscillator`,
  keep passing: the guard returns `false` and `devWarn`s.

  **Proof:** RED test — `src/engine/audioContextSetup.test.ts`: a new case whose `tone` mock supplies
  `Oscillator: { prototype: { _start } }` with a stub `_start` that sets `this._oscillator`; after `import('./audioContextSetup')`,
  constructing a stub instance from that prototype, calling `_start(0)` and firing `_oscillator.onended()` calls both
  `disconnect`s, and `oscillatorLeakPatched` is `true`. Fails before the call exists.

  **Acceptance criteria:**
  - [x] Importing `audioContextSetup` with an `Oscillator` in the `tone` mock patches its prototype (the disconnects fire
        on `onended`) and exports `oscillatorLeakPatched === true`.
  - [x] Importing it with no `Oscillator` in the mock (the existing cases) still installs or leaves the context as before,
        and `oscillatorLeakPatched === false`; the existing cases pass unmodified. *(The cases are unmodified; the
        shared `tone` mock gained an `Oscillator` getter, `undefined` by default, because vitest throws on reading an
        export a mock does not define. `devWarn` is mocked through a forwarding `vi.fn`, so it survives `resetModules`.)*
  - [x] The module still imports no store (the existing throwing mocks for `audioStore` / `localeStore` stay green).

  **Verification:**
  - [x] `npx vitest run src/engine/audioContextSetup.test.ts src/engine/tonePatches.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check, dev server: power on a world with `?debug`; the console shows no warning from the patch and the
        sound is unchanged. *(2026-10-23, headless Chrome on the dev server at `?debug`, powered on for 20 s: the app's
        own `Tone.Oscillator.prototype` carries the `oscillatorEndedDisconnect` marker and its `_start` is the wrapper;
        no `[tonePatches]` warning, no console error. The sound half is Crawford's listen at Checkpoint B.)*

  **Dependencies:** Task 1.

  **Files:** `src/engine/audioContextSetup.ts`, `src/engine/audioContextSetup.test.ts`

  **Estimated scope:** S (two files, a few lines each)

- [x] **Task 3: The proof run — patched against stock on D1 at Light, recorded** *(Run and recorded 2026-10-23; one criterion missed, below. Crawford accepted the miss at Checkpoint B.)*

  **Description:** Spec §5.2. Production build of the branch (`npm run build`, served on :4173) and of the stock
  comparison (`main`, or the commit before T2, built from a clean checkout to a scratch `--outDir` and served on :4175;
  bundle names recorded). `npm run perf:audio` with the D1 link (PERFORMANCE.md "The seven links") at `?load=light`,
  `--seconds 240 --bucket 15`, three rounds interleaved, foreground, one run per call, orphaned Chrome 0 before and
  after. Record the six rows (mean cap, peak window, overall max, nodes, by type, heap, max lag) in PERFORMANCE.md
  beside the step 2 A/B table, with the criterion read against them.

  **Proof:** a run, not a test (nothing imports a served build). Recorded in PERFORMANCE.md and in the commit.

  **Acceptance criteria:**
  - [x] Patched build: the by-type `Oscillator` change per 240 s is within the step 2 band (about +20 to +60, in step
        with `Gain`); stock: about +320. Three rounds each.
  - [x] Patched mean capacity, peak window and `max lag` inside the stock rounds' spread (no cost added). *(Missed on round 3, 2026-10-23: `max lag` inside on all three, mean and peak window inside on rounds 1 and 2; round 3 read 0.516 against stock 0.487–0.513 and 0.717 against 0.529–0.621, the peak from one 15 s bucket. PERFORMANCE.md, "Oscillator Leak Fix — the T3 proof run". Not re-run. **Accepted by Crawford at Checkpoint B, 2026-10-23**: no more rounds.)*
  - [x] The pin check passed on every run (the overlay landed at (−116, −2)).

  **Verification:**
  - [x] The PERFORMANCE.md section names both bundles, the commands and the orphan counts.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change in the repo).

  **Dependencies:** Task 2.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S (one doc section; about 30 minutes of idle machine)

### Checkpoint B: Proven on the desktop
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (note any pre-existing, unrelated failure; the
      `sceneToOrbiterLocal` round-trip test has timed out under full-suite load before). *(2026-10-23: 327 files,
      12 035 tests, all green, no timeout this time; lint 0 errors, 4 existing warnings.)*
- [x] `npm run build` clean. *(`index-BJ-YFaEE.js`, the bundle T3 measured.)*
- [x] T3's criterion met on all three rounds. *(Not met as written: round 3's mean and one peak bucket sat above the stock spread. Crawford accepted it as noise at this checkpoint, 2026-10-23; no more rounds.)*
- [x] **Crawford's listen (spec §5.3):** D1 and D5 at Full on the desktop, a few minutes each, dev server or the served
      build: no change to the sound, no click at a note's end. Recorded here when done; flagged if not. *(**Passed, Crawford 2026-10-23:** listened a bunch, happy.)*
- [x] Reviewed with Crawford before Phase 3. Passed 2026-10-23.

---

### Phase 3: Docs, and the upstream report

- [ ] **Task 4: `docs/AUDIO_SYSTEM.md`, `docs/todo/backlog.md` — document the shipped patch**

  **Description:** AUDIO_SYSTEM.md gets a short subsection near the diagnostics paragraph: what the leak was (two
  sentences, linking the step 1 record), what `tonePatches.ts` does and where it is applied, the guard's behaviour on a
  Tone upgrade, and that `oscillatorLeakPatched` says whether it took. The backlog item from T0 gets its closing line
  (built, the proof numbers' pointer); archiving happens when the PR merges, in the usual way. Spot-check every named
  identifier against the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] AUDIO_SYSTEM.md names `patchOscillatorEndedDisconnect`, `audioContextSetup.ts` and `oscillatorLeakPatched`
        exactly as shipped, and links the measurement record.
  - [ ] The backlog item says what shipped and where the proof is.

  **Verification:**
  - [ ] Manual review against the final source.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 2 and 3.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

- [ ] **Task 5 (optional, Crawford's call — spec §7 question 2): the upstream report, drafted**

  **Description:** A draft Tone.js issue as a markdown file for Crawford to post: Tone 15.1.22 and
  standardized-audio-context versions, the mechanism (`Oscillator._start` connects `frequency`/`detune` into each new
  `ToneOscillatorNode`; nothing disconnects them at `onended`; the source's output Set keeps the param), the numbers
  (one retained `OscillatorNode` per note, +1 057 in fifteen minutes; forced GC frees the gains, not the oscillators),
  a minimal reproduction (a `Tone.Synth` triggered twice a second for a minute, then DevTools' WebAudio panel or a
  forced GC and a node count), and the one-line fix. Posting it is Crawford's: outward-facing.

  **Proof:** Read — Crawford's review of the draft. No test file.

  **Acceptance criteria:**
  - [ ] The draft is self-contained for a Tone maintainer: versions, mechanism, reproduction, numbers, proposed fix.

  **Verification:**
  - [ ] Crawford's read.

  **Dependencies:** Task 3 (the numbers).

  **Files:** `docs/reference/tone-oscillator-leak-report.md`

  **Estimated scope:** XS (one doc)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across T1–T3 met; T0 and T4 read.
- [ ] Docs reflect the shipped names, spot-checked against source.
- [ ] Crawford's listen recorded at Checkpoint B, or flagged here.
- [ ] Ready for Crawford's PR. The Pixel sitting of plan.md Stage 1 carries this build beside stock (Crawford's decision
      of 2026-10-23); that sitting is Stage 1's, not this plan's.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A Tone upgrade renames `_start` or `_oscillator`, or fixes the leak upstream, and the wrapper silently does nothing | Medium | T1's guard returns `false` with a `devWarn`; T2 exports `oscillatorLeakPatched`; the T1 tests name the two private fields, so a rename that reaches the stub contract fails a test. A real upgrade re-runs T3. |
| Disconnecting a param that is already gone throws and breaks Tone's own `onended` (dispose never runs, a second leak) | High | T1's third criterion: the disconnects sit in one `try`, and the original `onended` runs after it regardless; mutation-checked. |
| The wrapper replaces `onended` *after* Tone's `_onended` has already fired (a node that ends inside `_start`) | Low | `_start` schedules the native start in the future; `onended` cannot fire synchronously inside it. T2's manual check and T3's node count would show a wrap that never ran. |
| `audioContextSetup.test.ts`'s `tone` mock lacks `Oscillator` and the new call throws there | Medium | The guard treats a missing prototype as `false`; T2's second criterion keeps the existing cases unmodified. |
| The proof run compares builds whose only difference is not the patch (a stray change on the branch) | Medium | T3 names both bundles and builds the stock side from a clean checkout; the branch carries only T0–T2 at that point. |
| The disconnect itself costs the main thread per note (a Set scan, now on a short Set) | Low | T3's `max lag` and mean capacity criteria against stock; the step 2 A/B already read no difference. |

## Open Questions

1. Route: **Resolved** (Architecture Decisions): (A), the in-app wrapper. Crawford, 2026-10-23.
2. File upstream? **Open** — Crawford's call; T5 drafts the report if yes, and posting it is his.
3. Numbering: **Open** — T0 proposes backlog 32; Crawford may renumber or make it a roadmap phase.
