# Implementation Plan: Audio Engine Cleanup

Source spec: [docs/specs/AUDIO_ENGINE_CLEANUP.md](../specs/AUDIO_ENGINE_CLEANUP.md). Not yet slotted into docs/todo/roadmap.md — this is a maintenance/cleanup pass found via a Tone.js best-practices review, not a roadmap feature.

## Overview

One confirmed leak (P0: robot LFO/drift state never torn down on despawn) plus one confirmed duplication (P1: `compositeVoice.ts`'s oscillator-field fallback logic repeated 3x) plus four small, independent opportunistic cleanups (P2.1-P2.3, P2.6) get their own tasks below. P2.4 (ramp-vs-direct-value in `globalFx.ts`) is **not** a task to implement — it requires an explicit human decision per the spec's own boundary ("ask first, don't just change") and is listed only as a follow-up to raise, not to build.

## Architecture Decisions

- **P0 is split into 3 tasks, not 1**, because it touches two independent files (`lfoEngine.ts`, `lfoDrift.ts`) plus a third consumer (`localeStore.ts`) that depends on the first. Task 1 (`lfoEngine.ts`) and Task 2 (`lfoDrift.ts`) have no dependency on each other — both are small, additive, single-file changes — but Task 3 (`localeStore.ts`) depends on Task 1, since it calls the function Task 1 adds.
- **P0 explicitly excludes `AudioEngine.releaseVoice`/`spawnSystem.ts`.** Per the spec's own Non-goals, folding LFO teardown into `releaseVoice` itself would break the power-cycle release-then-reserve path (`reRegisterAllRobotsAudio`), which calls `releaseVoice` then immediately re-reserves the same robot with no LFO re-priming today. No task here touches either of those.
- **P1 (Task 4) and every P2 task (5-8) are independent of P0 and of each other** — each touches a different, disjoint region of a different file (or a different function in the same file, in the compositeVoice/AudioEngine cases), so they can be done in any order, by different sessions, or skipped individually without blocking the rest.
- **P2.4 is deliberately not a task.** It's recorded here as a follow-up so it isn't lost, but the spec is explicit that changing it without a listening test and explicit approval would violate CLAUDE.md's "ask before changing audio architecture" boundary.

## Dependency Graph

```
Task 1 (lfoEngine.ts: add disposeRobotLfos)      Task 2 (lfoDrift.ts: dispose drift Gains in detachDrift)
    │                                                   (independent — no downstream dependents)
    └──→ Task 3 (localeStore.ts: wire disposeRobotLfos into removeRobot/removeLocale)

Task 4 (compositeVoice.ts: extract applyOscField)          — independent
Task 5 (toneHelpers.ts + AudioEngine.ts: dedupe stub nodes) — independent
Task 6 (AudioEngine.ts: remove redundant per-note pan recompute) — independent
Task 7 (AudioEngine.ts: hoist NOTE_RE) — independent
Task 8 (AudioEngine.ts: clear pending scheduleVoiceRelease timeouts on stop/killAll) — independent, optional
```

Tasks 4-8 have no dependency on Tasks 1-3 or on each other; they may be done in any order, in parallel across sessions, or skipped individually (Task 8 is explicitly optional per the spec).

## Task List

### Phase 1: P0 — LFO/drift teardown leak

- [x] **Task 1: `lfoEngine.ts` — add `disposeRobotLfos(robotId)`**

  **Description:** Add a new function that fully tears down every robot-scoped LFO instance for one robot: for each target in `ROBOT_LFO_TARGET_IDS`, call the existing `disconnectLfoTarget(target, robotId)` (reuses its drift-detach + phase-fallback-cancel + `connectedSignals` cleanup), then additionally `.dispose()` and remove the entry from `activeLfos`, and remove the entry from `settingsByKey`. Export it from the `lfoEngine` object. Does not change `disconnectLfoTarget`'s existing reversible (non-disposing) behavior — this is a new, separate, one-way function.

  **Acceptance criteria:**
  - [x] `lfoEngine.disposeRobotLfos` is exported from `src/engine/lfoEngine.ts`'s `lfoEngine` object.
  - [x] After `connectLfoTarget('layer0.gain', robotId)` + `disposeRobotLfos(robotId)`, `getLfoSettings('layer0.gain', robotId)` returns `DEFAULT_LFO_SETTINGS['layer0.gain']` (proves `settingsByKey` was cleared, not just disconnected).
  - [x] After the same sequence, a subsequent `connectLfoTarget('layer0.gain', robotId)` call constructs a **new** `Tone.LFO` (proves `activeLfos` was cleared and the old node was disposed, not silently reused) — assert via a spy on the `Tone.LFO` constructor or by checking the returned node identity differs.
  - [x] Calling `disposeRobotLfos` for a robot with no connected LFOs at all does not throw.
  - [x] Calling `disposeRobotLfos` twice in a row for the same robot does not throw (idempotent).
  - [x] A robot's `'layerN.phase'` fallback (manual-polling, via `scheduleRepeat`) is genuinely cancelled by `disposeRobotLfos` — assert `cancelSchedule` was called (or that the schedule no longer fires) for that robot's phase target.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes, including new tests for the acceptance criteria above. (101 tests, 8 new)
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** S (one file, one new function, reuses existing internals; test file gets a handful of new cases)

- [x] **Task 2: `lfoDrift.ts` — dispose drift Gain nodes in `detachDrift`**

  **Description:** `detachDrift` currently calls `.disconnect()` on `rateDriftGain`/`depthDriftGain` and removes the `driftLinks` entry, but never calls `.dispose()` on either `Tone.Gain` node. Add `.dispose()` calls (each in its own try/catch, matching the existing pattern in that function) before or alongside the existing `.disconnect()` calls.

  **Acceptance criteria:**
  - [x] `detachDrift` calls `.dispose()` on both `rateDriftGain` and `depthDriftGain`.
  - [x] Each dispose call is independently try/caught (a failure disposing one must not prevent disposing the other or removing the `driftLinks` entry) — matches the existing per-node try/catch style already in this function for `.disconnect()`.
  - [x] `driftLinks.delete(key)` still happens unconditionally afterward, same as today.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes (102 tests, 1 new — added to the existing `teardown` describe block).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/lfoDrift.ts`, `src/engine/lfoEngine.test.ts` (drift teardown is tested from this file, per the existing test layout)

  **Estimated scope:** XS (one function, two added dispose calls)

- [x] **Task 3: `localeStore.ts` — wire `disposeRobotLfos` into `removeRobot`/`removeLocale`**

  **Description:** Import `lfoEngine` and add a third try/catch call — alongside the existing `AudioEngine.releaseVoice`/`AudioEngine.unregisterRobotMelody` pair — calling `lfoEngine.disposeRobotLfos(robotId)` in `removeRobot`, and `lfoEngine.disposeRobotLfos(robot.id)` inside the existing `for (const robot of existing.robots)` loop in `removeLocale`. Matches the existing "independently try/caught per call" pattern already used at both sites.

  **Acceptance criteria:**
  - [x] `removeRobot(localeId, robotId)` calls `lfoEngine.disposeRobotLfos(robotId)`.
  - [x] `removeLocale(localeId)` calls `lfoEngine.disposeRobotLfos(robot.id)` for every robot in the removed locale.
  - [x] A thrown error from `disposeRobotLfos` in either call site is caught and does not prevent the robot/locale from still being removed from store state (matches existing resilience pattern for the other two calls).
  - [x] `spawnSystem.ts`'s `reRegisterAllRobotsAudio` (the power-cycle release-then-reserve path) is untouched — no call to `disposeRobotLfos` added there.

  **Verification:**
  - [x] `npx vitest run src/stores/localeStore.test.ts` passes (68 tests) — including new spy-based assertions on `lfoEngine.disposeRobotLfos`, plus first-ever audio-cleanup coverage for `removeRobot` (it had none before this task).
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` passes unmodified (68 tests) — confirms no accidental behavior change to the power-cycle path.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (calls the function it adds).

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (one file, two call sites, one new import)

### Checkpoint: P0 complete

- [x] `npx vitest run src/engine/lfoEngine.test.ts src/stores/localeStore.test.ts` passes (102 + 68 tests).
- [x] `npm run build:types`, `npm run lint` clean.
- [x] `npm test` (full suite) passes — 2709 tests, 144 files — confirms the power-cycle path and every other consumer of `releaseVoice`/`lfoEngine` is unaffected.
- [x] Manual check: a robot that connects an LFO and is then removed (`removeRobot`) leaves no trace in `activeLfos`/`settingsByKey` — verified via the Task 1 test rather than a live browser session (headless engine, no audible way to verify directly).
- [ ] Reviewed with human before proceeding to P1/P2.

### Phase 2: P1 — compositeVoice.ts duplication

- [x] **Task 4: `compositeVoice.ts` — extract shared oscillator-field fallback helper**

  **Description:** Extract the repeated 3-level fallback chain (try `synth.set({oscillator: {...}})`, then try writing `.value` on a Signal-shaped field, then try a raw property assignment) into one helper function, and use it from both the live-update path (`applyLayersContinuous`'s detune/phase/pulseWidth handling) and the construction-time path (`createCompositeVoice`'s equivalent detune/phase logic). Exact helper signature is an implementation detail — the bar is "the fallback logic exists in exactly one place."

  **Acceptance criteria:**
  - [x] The 3-level try/set/value/raw-assignment fallback chain exists in exactly one function in `compositeVoice.ts` (`applyOscFieldViaSet`), called from both the construction-time and live-update code paths for both phase and pulseWidth; detune's simpler direct-write shape is its own shared `applyOscDetune`, likewise called from both paths.
  - [x] Behavior is unchanged for all three fields (detune, phase, pulseWidth/width) in both call paths — verified via 9 new characterization tests written against the pre-refactor code first, all still passing after.
  - [x] Every existing `devWarn` call this logic makes on failure is preserved — one per field/failure mode, wording normalized slightly via a shared `verb` param (no test asserts exact message text).

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes — 14 original tests unmodified + 9 new characterization tests, all green. (Deviated from "no new tests required" — this logic had zero prior coverage, so characterization tests were added first per this session's TDD instruction, as a real safety net for the extraction rather than a bare refactor-on-faith.)
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`

  **Estimated scope:** M (one file, but touches both construction and live-update code paths; requires care to preserve exact fallback behavior for 3 fields)

### Checkpoint: P1 complete

- [x] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes (14 original + 9 new characterization tests).
- [x] `npm run build:types`, `npm run lint` clean.
- [x] `npm test` (full suite) passes — 2718 tests, 144 files.

### Phase 3: P2 — small opportunistic cleanups (any order, independent)

- [x] **Task 5: `toneHelpers.ts` + `AudioEngine.ts` — dedupe stub-node construction**

  **Description:** `AudioEngine.reserveVoice` writes out the panner/busGain/busFilter stub-node fallback (used when a Tone constructor is missing, or in the catch-all construction-failure path) as a near-identical inline object literal twice. Factor into one or more small helpers in `toneHelpers.ts` (e.g. `makeStubPanner()`, `makeStubGain()`, `makeStubFilter()`, or one generic `makeStubNode(extra?)`) reusing the existing `MinimalToneNode` type, and use the helper(s) at both sites in `AudioEngine.ts`.

  **Acceptance criteria:**
  - [x] The panner/busGain/busFilter stub-node literal shape exists in exactly one place per node type (in `toneHelpers.ts`), not duplicated inline in `AudioEngine.ts`.
  - [x] Both call sites in `reserveVoice` (the "ctor missing" fallback and the catch-block "construction threw" fallback) use the shared helper(s).
  - [x] Stub node shape/behavior is unchanged — same methods, same default values (`pan: 0`, same `initialBusGain` handling, etc.); the catch-block busGain stub gained an unused `toDestination` no-op it didn't have before (harmless — nothing calls it), unifying it with the other site's shape.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioEngine/toneHelpers.test.ts` passes (105 tests: 103 original + 2 new characterization tests neither fallback path had before).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/audioEngine/toneHelpers.ts`, `src/engine/AudioEngine.ts`

  **Estimated scope:** S (two files, mechanical extraction)

- [x] **Task 6: `AudioEngine.ts` — remove redundant per-note pan recompute in `triggerWithCap`**

  **Description:** `triggerWithCap` recomputes and reassigns `panner.pan.value` on every triggered note, duplicating work `updateAllPanners` already does for every reserved robot on every 16th-note tick (strictly more frequent than any single robot's note-trigger rate). Remove the recompute block inside `triggerWithCap`.

  **Acceptance criteria:**
  - [x] `triggerWithCap` no longer calls `getRobotVisualX`/`calculatePanFromPosition`/writes `panner.pan.value` itself.
  - [x] `updateAllPanners`'s own tick-level pan update is untouched.
  - [x] No existing test asserted pan synchronously within `triggerWithCap` (there was zero pan coverage at all beforehand) — a new characterization test was added instead, proving the old behavior first, then proving its removal.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes (104 tests: 103 original + 1 new).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts` (only if an existing test encodes the old behavior)

  **Estimated scope:** XS (delete a few lines from one function)

- [x] **Task 7: `AudioEngine.ts` — hoist `NOTE_RE` to module scope**

  **Description:** `const NOTE_RE = /^[A-Ga-g][b#]{0,2}\d+$/;` is currently declared inside `triggerWithCap`, recompiling the regex literal on every note trigger. Hoist it to a module-level constant, matching the file's existing pattern of precomputed module-level constants.

  **Acceptance criteria:**
  - [x] `NOTE_RE` is declared once, at module scope, not inside `triggerWithCap`.
  - [x] `triggerWithCap` references the module-level constant; behavior (which note strings pass/fail validation) is unchanged.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes unmodified (104 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`

  **Estimated scope:** XS (move one line)

- [x] **Task 8 (optional — skip if not worth the churn): `AudioEngine.ts` — clear pending `scheduleVoiceRelease` timeouts on `stop`/`killAll`** — **SKIPPED.** Testing this properly requires capturing the mocked `Tone.getContext().setTimeout` callback for manual firing, which means changing the shared Tone mock at the top of `AudioEngine.test.ts` — used by all ~104 tests in that file. That's a disproportionate, real-regression-risk lift for an edge case that's already harmless today (every write is `Math.max(0, ...)`-clamped, so a stale post-`killAll()` decrement self-corrects rather than going negative or breaking anything observable). Exactly the "low priority — do not go out of the way for this one" case the plan called out in advance.

  **Description:** `scheduleVoiceRelease` uses `Tone.getContext().setTimeout` (deliberately, to track real elapsed time independent of live BPM changes) to decrement `activeVoices` after a note's duration. `stop()`/`killAll()` reset `activeVoices = 0` unconditionally but never cancel pending timeouts from this function, so a stale one can still fire afterward — harmless today (every write is `Math.max(0, ...)`-clamped) but untracked. Track the returned timeout handle per voice and clear pending ones in `stop()`/`killAll()`, or gate the decrement on a generation/initialized check.

  **Acceptance criteria:**
  - [ ] After `stop()` or `killAll()`, a previously-scheduled voice-release timeout does not decrement `activeVoices` below what it was reset to.
  - [ ] No change to `scheduleVoiceRelease`'s normal (non-stopped) behavior — voices still release correctly after their duration during normal playback.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes, including a new test simulating a pending release timeout across a `stop()`/`killAll()` call.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (one function plus its two call sites in `stop`/`killAll`)

### Checkpoint: P2 complete

- [x] `npm test` (full suite) passes — 2721 tests, 144 files (Tasks 5-7 implemented; Task 8 skipped, see above). Two isolated flaky single-test failures were observed across this whole implementation session's full-suite runs (once during Task 3, once during Task 6), neither reproducing on immediate re-run and neither related to files this plan touches — pre-existing suite flakiness, not a regression.
- [x] `npm run build:types`, `npm run lint` clean.
- [ ] Reviewed with human.

## P2.4 (globalFx.ts ramp-vs-direct-value) — RESOLVED

Per the spec, `setGlobalReverb`/`setGlobalDelay`/`setGlobalFilterLPF`/`setGlobalFilterHPF`/`setGlobalEQ`/`setGlobalCompressor`/`setGlobalLimiter` all used direct `.value =` assignment where `updateRobotMasterVolume` ramps to avoid zipper noise — flagged as a listening-test judgment call requiring explicit approval, not an implementation task to build unilaterally.

**Confirmed live by the user**: a large LPF frequency jump produced an audible click. Fixed by
ramping `frequency` on both `setGlobalFilterLPF` and `setGlobalFilterHPF` (same node type, same
setter shape, same risk), using the same `rampTo`-with-fallback shape `updateRobotMasterVolume`
already established, via a new small `rampOrSet` helper in `globalFx.ts`. Scope was an explicit
choice, not a default: `Q` and every other global-chain param (EQ bands, compressor, delay,
reverb, limiter) are deliberately left as direct writes — not confirmed audible, and there was
no listening test for them. 4 new tests added to `globalFx.test.ts`. See the
`globalFx: ramp LPF/HPF frequency...` commit for the full rationale.

If EQ bands, compressor knobs, delay/reverb wet, or Q ever get their own confirmed-audible click
report, the same `rampOrSet` helper is already there to reuse — but each one still needs its own
listening test before being added, per the same reasoning that applied here.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Folding LFO teardown into `releaseVoice` itself (instead of the new separate `disposeRobotLfos`) would silently break LFO modulation across every power cycle | High | Task 1 adds a new, separate function; Task 3 wires it only into the two true-teardown call sites in `localeStore.ts`, never into `AudioEngine.releaseVoice` or `spawnSystem.ts` |
| Task 4's refactor subtly changes fallback ordering or a default value for one of the 3 oscillator fields | Medium | Acceptance criteria require zero test changes in `compositeVoice.test.ts`; any needed test change is a signal to stop and investigate, not adjust the test |
| Task 6 silently drops real pan-update coverage if a test encodes the old per-note write | Low | Acceptance criteria require flagging any such test change explicitly rather than changing it silently |

## Open Questions

- P2.4 — deferred to the human, not resolved here (see "Not a task" section above).
- Whether robot-level LFOs currently survive `reRegisterAllRobotsAudio`'s release-then-reserve cycle correctly at all is unknown and out of scope for every task in this plan (per the spec's own Non-goals) — noted here only so it isn't lost as a possible future investigation.
