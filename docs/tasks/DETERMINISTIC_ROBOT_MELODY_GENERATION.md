# Implementation Plan: Deterministic Robot Melody Generation

## Overview

Roadmap [Phase 31](../todo/roadmap.md#31-deterministic-robot-melody-generation). Unifies two currently-separate melody-generation mechanisms — `spawnSystem.ts`'s already-deterministic spawn-time path and `regenerateMelody.ts`'s currently-unseeded (`Math.random()`) edit-time path — into one shared, deterministic formula keyed off a new `Robot.compositionSeed` field. Closes a second, independent gap (`applyOctaveMin`/`applyOctaveMax` not triggering regeneration at all), and removes the now-pointless Reset Melody control. Full rationale and code-grounded decisions: [docs/specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md](../specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md); confirmed intent: [docs/intent/deterministic-robot-melody-generation.md](../intent/deterministic-robot-melody-generation.md).

## Architecture Decisions

- **`compositionSeed: number` is a required field on `Robot`**, not optional — same treatment as `id`, always set at spawn, never user-edited, never inherited on the `shouldCopy` spawn path (spec §1, §4.1).
- **This makes the field addition and its spawn-time population inseparable at the type level**: `spawnSystem.ts`'s own `robot: Robot = {...}` object literal, and every existing hand-built `Robot`-typed test fixture in the repo, will fail `npm run build:types` the instant the field is added unless populated everywhere in the same change. Task 1 below is sized accordingly (see "Definition of Done" and Task 1's own scope note) rather than pretending this can be split into a type-only task followed by a separate wiring task.
- **One new pure helper, `buildSeededComposition`** (`melodyGenerator.ts`), combines `compositionSeed` + the five current attribute values (`rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, `octaveRange`) into an `alea`-based `() => number`, passed as `generateMelodyForRobot`'s existing `opts.rand` — confirmed by Crawford over the intent doc's original `opts.seed` wording, conditioned on zero incidental randomization (spec §7, resolved). `generateMelodyForRobot`'s own signature and internals are never touched.
- **Spawn-time and edit-time call the same helper with the same inputs when nothing has changed** — this is what eliminates the "first-edit ratchet" (nudge a slider back to its original value and get a different melody than the one you started with), which is the core reason this phase unifies the two mechanisms rather than only fixing `regenerateMelody.ts` in isolation.
- **`RobotAudioOverrideDiff`/`SessionPayload`/`RobotAudioBaseline` (Session Storage) are not touched.** `compositionSeed` is never diffed, exactly like `id` — it regenerates identically from the seed on every roster regeneration.
- **`robotSystems.ts`'s docking pitch-drift reroll is explicitly out of scope** — its non-determinism is an intentional feature (gradual drift), not a gap this phase closes. No task below touches it.

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; melody generation stays purely synchronous/store-driven (no `setTimeout`/`requestAnimationFrame` introduced anywhere in this phase).
- [ ] Any new gate with a real failure mode (determinism, the copy-path "always fresh" guarantee, the unification/no-ratchet guarantee) is mutation-checked — break it, confirm the test fails, revert.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Task 1: Robot.compositionSeed (type + spawn wiring + fixture sweep)
                │
                ├──────────────────────────────┐
                ▼                              │
Task 2: melodyGenerator.ts buildSeededComposition (pure, independent of Task 1)
                │                              │
                ▼                              ▼
        ── Checkpoint A: Foundation proven — field exists, helper is pure/tested ──
                │
                ▼
Task 3: spawnRobot's initial melody → buildSeededComposition (retires melody.rand)
                │
                ▼
Task 4: regenerateMelody.ts → buildSeededComposition (the core determinism fix + unification guard)
                │
                ▼
        ── Checkpoint B: Core determinism unified, no first-edit ratchet ──
                │
                ▼
Task 5: applyOctaveMin/applyOctaveMax call regenerateMelody
                │
                ▼
        ── Checkpoint C: octave gap closed ──
                │
                ▼
Task 6: Remove RESET_MELODY_SCHEMA
                │
                ▼
Task 7: Remove Reset Melody from RobotOptionsTab.tsx
                │
                ▼
Task 8: Remove Reset Melody from PingControlsDrawer.tsx (3 exports)
                │
                ▼
        ── Checkpoint D: feature complete end-to-end, zero "ResetMelody" references ──
                │
                ▼
Task 9: Docs — MELODY_SYSTEM.md / PROCEDURAL_GENERATION.md / roadmap.md
                │
                ▼
        ── Checkpoint E: complete ──
```

Tasks 1 and 2 have no dependency on each other and could be done in either order or in parallel; every task from Task 3 onward is strictly sequential.

## Task List

### Phase 1: Foundation

- [x] **Task 1: `Robot.compositionSeed` — type, spawn-time generation, and the existing-fixture sweep** — done, commit `350a82f`

  **Description:** Add `compositionSeed: number` to `Robot.ts`. Add `generateCompositionSeed(noiseMap, spawnCount)` to `spawnSystem.ts` (mirrors `generateRobotId`'s shape, own dataId `'robot.compositionSeed'`, `getSeededVal(noiseMap, 'robot.compositionSeed', spawnCount, 0, 1)`, with the existing no-noiseMap `alea` fallback convention). Compute it unconditionally in `spawnRobot` — outside the `shouldCopy` branch, always fresh, never inherited — and add it to the `Robot` object literal. Because the field is required, this same change must also patch every existing hand-built `Robot`-typed literal in the test suite that would otherwise fail `build:types` — confirmed via `grep -rn "function makeRobot\|const makeRobot"` src: `CompanyOptionsSection.test.tsx`, `regenerateMelody.test.ts`, `localeStore.test.ts`, `worldTransition.test.ts`, `RobotSelectionCard.test.tsx`, `robotSystems.test.ts`, `robotOptionsActions.test.ts`, `idleSystem.test.ts`, `RobotDisplaySection.test.tsx`, `companyOptions.test.ts`, `RobotsTab.test.tsx`, `RobotBody.test.tsx`, `audioSwells.test.ts`, `RobotOptionsTab.test.tsx`, `audioBudgetSystem.test.ts`, `navPanelViewsAndContent.integration.test.ts`, `NavBreadcrumb.test.tsx`, `NavStatusBlock.test.tsx`, `useNavTree.test.ts` — re-run the grep before starting, since this list is a snapshot, not a promise. (`Robot.test.tsx`/`OceanScene.test.tsx` build a different `RobotType`, not `types/Robot.ts`'s `Robot` — confirm which during implementation, skip if genuinely unrelated.) A single fixed placeholder value (e.g. `0.5`) is fine for fixtures whose tests don't care about melody determinism specifically.

  **Why this is one task, not several:** `compositionSeed` being required means `Robot.ts`'s type change, `spawnSystem.ts`'s own object literal, and every test fixture all fail to compile independently of each other the moment the field exists anywhere unpopulated — there is no intermediate state where only some of them are fixed and `build:types` is still green. Sized **L** as a deliberate, justified exception to the ~5-file guideline: every one of the ~19 fixture edits is the same one-line, mechanically uniform addition, not independent design work.

  **Acceptance criteria:**
  - [x] `Robot.compositionSeed: number` exists, required, alongside `id` in `Robot.ts`.
  - [x] `generateCompositionSeed(noiseMap, spawnCount)` returns a value deterministic in `(noiseMap, spawnCount)` — same inputs, same output, across repeated calls.
  - [x] Two robots spawned at different `spawnCount` in the same locale get different `compositionSeed` values (own dataId, own offset).
  - [x] On the `shouldCopy` spawn path, the copy gets its **own**, independently-drawn `compositionSeed` — never the copy source's — mirroring the existing `name`/`melody` "always fresh" treatment in the same branch.
  - [x] `npm run build:types` is clean with zero `Robot`-literal-missing-field errors anywhere in `src/`.
  - [x] `npm test` full suite passes (195 files / 4024 tests). Compiler-forced fixtures (7 files: `AudioEngine.test.ts`, `localeStore.test.ts`, `audioBudgetSystem.test.ts`, `idleSystem.test.ts`, `interactionSystem.test.ts`, `robotSystems.test.ts`, `worldTransition.test.ts`) all patched. `as Robot`/`as unknown as Robot`-cast fixtures were also swept, but narrowed to the ones that actually execute real melody-generation code paths (`regenerateMelody.test.ts`, `robotOptionsActions.test.ts`) — the rest (nav-tree/UI-label/filter/animation fixtures using `{id, name} as unknown as Robot`-style casts) don't call `regenerateMelody`/`spawnRobot` and were deliberately left untouched, per scope discipline (Rule 0.5).
  - [x] Mutation-checked: temporarily hardcoded `compositionSeed = 0.5` in `spawnRobot`, confirmed both the "different spawnCount → different seed" and "copy gets its own seed" tests failed, reverted.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — 83 passed
  - [x] `npm run build:types` — clean across the whole repo
  - [x] `npm test` (full suite) — 195 files / 4024 tests passed

  **Dependencies:** None.

  **Files:** `src/types/Robot.ts`, `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, plus the ~19 test-fixture files enumerated above.

  **Estimated scope:** L (many files, but every edit beyond `Robot.ts`/`spawnSystem.ts` is the same one-line, mechanical addition — see "Why this is one task" above).

- [x] **Task 2: `melodyGenerator.ts` — `buildSeededComposition` pure helper** — done, commit `c5c52d4`

  **Description:** Add the exported pure function from spec §4.3: takes `compositionSeed: number` and the five current attribute values, builds a colon-joined key string (matching this codebase's existing `alea(`${a}:${b}:${c}`)` convention, e.g. `spawnSystem.ts`'s `alea(`${localeId}:${spawnCount}:copy`)`), and returns `alea(key)` — a ready-to-use `() => number`. `generateMelodyForRobot`'s own signature and internals are untouched by this task.

  **Acceptance criteria:**
  - [x] Same `compositionSeed` + same five attribute values (including each element of `octaveRange` independently) ⇒ identical output sequence from the returned `rand` function, across repeated calls and across fresh calls to `buildSeededComposition` itself.
  - [x] Changing *any one* of the six inputs changes the resulting sequence (tested independently per input, not just "changing something changes it").
  - [x] The returned function is a valid drop-in for `generateMelodyForRobot`'s `opts.rand` — a direct integration test calls `generateMelodyForRobot({ ..., rand: buildSeededComposition(...) })` and confirms it produces a melody with no errors and the expected `octaveMin`/`octaveMax` bounds.
  - [x] No `Math.random()` anywhere in the new code path — verified with a `vi.spyOn(Math, 'random')` assertion, not just eyeballed.
  - [x] Mutation-checked: dropped `rhythmicDensity` from the key, confirmed the density-sensitivity test failed, reverted.

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts` — 94 passed
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (independent of Task 1).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (1 file + its test)

### Checkpoint A: Foundation proven
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures) — 195 files / 4034 tests.
- [x] `compositionSeed` exists and is populated everywhere a `Robot` is constructed, real or test fixture (compiler-forced sites; melody-relevant `as Robot`-cast fixtures also covered — see Task 1).
- [x] `buildSeededComposition` is proven deterministic and input-sensitive in isolation. Nothing consumes it yet — melody generation itself is unchanged until Phase 2.
- [ ] Reviewed with human before proceeding to Phase 2 — proceeding per Crawford's explicit "implement each task... sequentially" direction for this session; flagged here rather than silently skipped.

### Phase 2: Unify generation

- [x] **Task 3: `spawnRobot`'s initial melody → `buildSeededComposition`** — done, commit `1ac4984`

  **Description:** Replace the `melodyRand`/`melodyCallIndex`/`getSeededVal(noiseMap, 'melody.rand', ...)` block (spec §4.5) with a call to `buildSeededComposition(compositionSeed, { rhythmicDensity: spawnRhythmicDensity, rhythmicMotifLength: spawnRhythmicMotifLength, noteVariance: spawnNoteVariance, pitchRepeat: spawnPitchRepeat, octaveRange })`, passed as `generateMelodyForRobot`'s `rand`. The `'melody.rand'` dataId is retired (stops being read), not renamed — per `CLAUDE.md`/`PROCEDURAL_GENERATION.md`'s "don't rename a dataId" rule, this is a deliberate retirement, not a rename, so that rule doesn't apply here.

  **Acceptance criteria:**
  - [x] Spawning the same locale (same seed/coordinates) twice produces byte-identical initial melodies for every robot — the direct regression guard replacing the retired `'melody.rand'` coverage. (Note: this alone was **not** a discriminating test for this task — the old mechanism was also deterministic. The real discriminating test added: the spawned melody must exactly match `buildSeededComposition(compositionSeed, initial attrs)`'s own output, confirmed RED before this task's change and GREEN after.)
  - [x] Every existing `spawnSystem.test.ts` test not specifically about melody generation still passes unmodified — this change touches only the melody-generation block, not `spawnRobot`'s other ~150 lines.
  - [x] `melodyCallIndex` and the `melodyRand` local are removed from `spawnSystem.ts` — confirmed by grep, zero remaining references in `src/` production or test code (one unrelated example-string mention in `noiseMaps.test.ts`, not a real reference).
  - [x] No behavior change to anything except melody content itself.
  - [x] Mutation-checked: passed a hardcoded seed instead of the real `compositionSeed` into `buildSeededComposition`, confirmed the exact-match test failed, reverted.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — 86 passed
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** M (1 production file with a focused, well-bounded change; test file gains several new cases)

- [x] **Task 4: `regenerateMelody.ts` → `buildSeededComposition` (the core fix + unification guard)** — done, commit `fdd87c9`

  **Description:** `regenerateMelody.ts` builds its `rand` the same way Task 3 did, using `robot.compositionSeed` and the robot's *current* attribute values (with the file's existing `?? DEFAULT_*` fallbacks unchanged). This is the change that actually fixes the originally-reported bug — every Density/Motif Length/Note Variance/Pitch Repeat edit stops calling `Math.random()`.

  **Acceptance criteria:**
  - [x] Same `robot` object (including `compositionSeed`) ⇒ same melody across repeated `regenerateMelody` calls.
  - [x] Changing one attribute and then changing it back to its original value reproduces the original melody exactly — the literal "nudge a slider back" criterion from the intent doc.
  - [x] Two robots with identical attributes but different `compositionSeed` produce different melodies (the "complementary, not unison" guarantee, tested directly at this layer).
  - [x] **Unification guard (the capstone test for this whole phase):** landed in `spawnSystem.test.ts` (needed its real, unmocked `localeStore`/`spawnRobot` — `regenerateMelody.test.ts`'s heavy module mocking made it a poor fit). Spawns a real robot, calls `regenerateMelody` with zero changes, asserts byte-identical (event-id-stripped) melody. Confirmed RED before Tasks 3+4, GREEN after; mutation-checked separately (swapped `octaveRange` elements in `regenerateMelody.ts`, confirmed this test caught it, reverted).
  - [x] `regenerateMelody.test.ts`'s `makeRobot()` fixture (patched in Task 1) was sufficient — no collision, used real distinguishing values (`0.11`/`0.17`/`0.89`) per test.
  - [x] **Session Storage round-trip guard** — landed in `sessionDiff.test.ts`, using `applyDensity` (the real user-facing action) rather than a raw `updateRobot` write. **This test failed on first run and stayed failing until a real fix, not just a test** — `applySessionPayload`'s `buildRobotUpdates` patches a robot's plain attribute fields but never called `regenerateMelody`, so a restored robot's melody stayed the fresh seed-baseline one instead of matching its overridden attributes. Fixed in `sessionDiff.ts` (one new `regenerateMelody(...)` call after `updateRobot`) — **not in the original Task 4 Files list**, discovered during this task's own TDD cycle. `SessionPayload`'s shape itself needed no change, confirming the spec's claim; the *apply* logic did. Mutation-checked (commented out the new call, confirmed the round-trip test failed, reverted).

  **Verification:**
  - [x] `npx vitest run src/engine/regenerateMelody.test.ts` — 16 passed
  - [x] `npx vitest run src/utils/sessionDiff.test.ts` — 30 passed
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2, 3.

  **Files:** `src/engine/regenerateMelody.ts`, `src/engine/regenerateMelody.test.ts`, `src/systems/spawnSystem.test.ts` (unification guard), `src/utils/sessionDiff.ts` + `src/utils/sessionDiff.test.ts` (round-trip guard — `sessionDiff.ts` itself wasn't in the original plan; see the round-trip guard note above)

  **Estimated scope:** M

### Checkpoint B: Core determinism unified
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (full suite) — 195 files / 4043 tests.
- [x] The unification guard test (Task 4) passes — spawn melody and a zero-change `regenerateMelody` call produce byte-identical output.
- [x] Manual spot-check deferred to Checkpoint D's manual pass (no UI changes yet in this phase).
- [ ] Reviewed with human before proceeding to Phase 3 — proceeding per Crawford's explicit sequential-implementation direction; flagged, not silently skipped.

### Phase 3: Close the octave gap

- [ ] **Task 5: `applyOctaveMin`/`applyOctaveMax` call `regenerateMelody`**

  **Description:** Per spec §4.6 — both functions gain a `regenerateMelody({ ...robot, octaveRange: next }, localeId)` call, mirroring `applyDensity`'s existing shape in the same file.

  **Acceptance criteria:**
  - [ ] `applyOctaveMin`/`applyOctaveMax` each call `regenerateMelody` exactly once, with the robot's *updated* `octaveRange` (not the pre-edit one).
  - [ ] The existing min-`<=`-max clamping behavior in both functions is unchanged.
  - [ ] Assertions mirror the existing `applyDensity`/`applyPitchRepeat`/`applyMotifLength`/`applyNoteVariance` tests already in `robotOptionsActions.test.ts`.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotOptionsActions.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1-4 (needs a working, deterministic `regenerateMelody`).

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S

### Checkpoint C: Octave gap closed
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Reviewed with human before proceeding to Phase 4.

### Phase 4: Remove Reset Melody

- [ ] **Task 6: Remove `RESET_MELODY_SCHEMA`**

  **Description:** Delete the schema from `robotOptionsConfig.ts` and its references in `robotOptionsConfig.test.ts`. No downstream consumer is touched yet — this task only removes the schema's own definition/export, so Tasks 7-8 have nothing left to import once they run.

  **Acceptance criteria:**
  - [ ] `RESET_MELODY_SCHEMA` no longer exists in `robotOptionsConfig.ts`.
  - [ ] `robotOptionsConfig.test.ts` has no remaining reference to it.
  - [ ] `npm run build:types` will show errors in `RobotOptionsTab.tsx`/`PingControlsDrawer.tsx` at this point — expected and resolved by Tasks 7-8, not a regression to fix here.

  **Verification:**
  - [ ] `npx vitest run src/data/robotOptionsConfig.test.ts`
  - [ ] `npm run lint` clean on the touched files (full `build:types` is expected red until Task 8 — note this explicitly when committing).

  **Dependencies:** None strictly, but done first in this phase by convention (schema before consumers).

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`

  **Estimated scope:** XS

- [ ] **Task 7: Remove Reset Melody from `RobotOptionsTab.tsx`**

  **Description:** Remove `handleResetMelody` and the `onResetMelody` prop passed to `PingControlsDrawer`/`PingControlsRhythmSection`. Remove the corresponding test (~line 349, "wires onResetMelody to regenerateMelody directly") and the fake test double's `onResetMelody` prop/button (~lines 47, 61) in `RobotOptionsTab.test.tsx`.

  **Acceptance criteria:**
  - [ ] Zero references to `handleResetMelody`/`onResetMelody`/`regenerateMelody` import-for-this-purpose remain in `RobotOptionsTab.tsx` (confirm `regenerateMelody` isn't imported at all anymore if this was its only use in the file).
  - [ ] `RobotOptionsTab.test.tsx`'s fake `PingControlsDrawer` test double no longer accepts or renders an `onResetMelody` prop.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx`
  - [ ] `npm run build:types` still red (Task 8 not done yet) unless `PingControlsDrawer.tsx`'s prop is optional enough to tolerate the caller no longer passing it — check before assuming red is expected here too.

  **Dependencies:** Task 6.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`, `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** S

- [ ] **Task 8: Remove Reset Melody from `PingControlsDrawer.tsx` (all three exports)**

  **Description:** Remove the `onResetMelody` prop and its conditional `{onResetMelody && <Button schema={RESET_MELODY_SCHEMA} .../>}` JSX from all three component exports in this file (confirmed via grep to occur three times, at three separate prop-interface/render sites — the legacy combined drawer plus the two split `PingControlsRhythmSection`/`PingControlsFrequencySection` pieces per `docs/UI_SHELL.md`'s note on why three copies exist). Remove every Reset-Melody-specific test in `PingControlsDrawer.test.tsx` — confirmed via grep to span multiple line ranges across the file's three render-target sections, both the "renders when provided (robot mode)" and "omits when not provided (company mode)" pairs for each export.

  **Acceptance criteria:**
  - [ ] Zero references to `onResetMelody`/`RESET_MELODY_SCHEMA`/`ResetMelody` remain anywhere in `PingControlsDrawer.tsx` or `PingControlsDrawer.test.tsx` — confirm with a repo-wide grep, not just a visual scan of the known line numbers (they may have shifted since the spec was written).
  - [ ] A final repo-wide `grep -rn "ResetMelody" src/` returns **zero results** anywhere — this is the acceptance bar for the whole Phase 4 removal, not just this task's own files.
  - [ ] Every other existing test in `PingControlsDrawer.test.tsx` (rhythm/frequency/motif-length/pitch-repeat/click-track behavior, unrelated to Reset Melody) still passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx`
  - [ ] `npm run build:types`, `npm run lint`, `npm test` (full suite) all clean — this is the task that turns the build green again after Tasks 6-7.
  - [ ] `npm run build` (production bundle) clean.

  **Dependencies:** Tasks 6, 7.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** M (1 production file, but 3 distinct removal sites within it; test file has the widest removal footprint of the three)

### Checkpoint D: Feature complete end-to-end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] `grep -rn "ResetMelody" src/` returns zero results.
- [ ] **Manual check (`npm run dev`):** open Robot Options for any robot, confirm Reset Melody no longer renders; nudge Rhythmic Density up then back to its original value, confirm the melody sounds the same (or, more rigorously, that `robot.melody` in a debug view/store inspection is unchanged); open a company's bulk-edit panel, confirm no Reset Melody control ever appeared there either (it never took a company prop, so this should be a non-event, but confirm).
- [ ] Reviewed with human before proceeding to Phase 5.

### Phase 5: Docs

- [ ] **Task 9: Update `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/todo/roadmap.md`**

  **Description:** Per spec §6. `MELODY_SYSTEM.md`'s "Seeding & lifecycle" section currently states Pitch Repeat (and its siblings) take "the existing unseeded `Math.random` manual-edit path, not the seeded one above" — false after this phase, rewrite to describe the unified `compositionSeed`/`buildSeededComposition` mechanism. Its Click Track section's call-site list currently names "Reset Melody" as one of four `AudioEngine.registerRobotMelody` call sites — remove it (three remain: spawn, an edit, the docking reroll). `PROCEDURAL_GENERATION.md`'s `melodyGenerator.ts` architecture-table row and its `offset` example both cite the retired `'melody.rand'`/`melodyCallIndex` mechanic — update to describe `compositionSeed`/`buildSeededComposition` instead, preserving the row's actual architectural point (melodyGenerator.ts still never imports noiseMaps/getSeededVal directly). `docs/todo/roadmap.md` Phase 31 marked done, linking this task file and the spec, following Phase 19/20's citation style — including an honest note on what shipped vs. the original roadmap text's framing, the way Phase 20's own Done note did.

  **Acceptance criteria:**
  - [ ] `MELODY_SYSTEM.md` and `PROCEDURAL_GENERATION.md` describe only the shipped mechanism — no leftover references to `'melody.rand'`, `melodyCallIndex`, or "the existing unseeded Math.random manual-edit path."
  - [ ] Every function/type name cited in the updated doc text is spot-checked against the real, final source (not this task file's own draft wording).
  - [ ] `docs/todo/roadmap.md` Phase 31 marked done with links to this task file and the spec.

  **Verification:**
  - [ ] Manual review — every documented name/behavior checked directly against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1-8.

  **Files:** `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (3 files, docs only)

### Checkpoint E: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 9 tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Ready for human review / PR against `feature/deterministic-robot-melody`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 1's fixture sweep misses a `Robot` literal not caught by the `makeRobot`/`const makeRobot` grep pattern (e.g. a differently-named helper, or an inline literal with no helper function at all) | Medium — a missed fixture fails `build:types` immediately, so it can't silently ship broken, but it could stall the task | Re-run the grep at Task 1 start (the file list in Task 1's description is a snapshot, not a promise); treat any `build:types` error as the authoritative completion signal, not the enumerated list |
| `buildSeededComposition`'s colon-joined key collides for two structurally-different inputs (e.g. string concatenation ambiguity between `rhythmicMotifLength.value` and `pitchRepeat` at a boundary) | Low — would silently produce identical melodies for robots that should differ | Task 2's acceptance criteria require changing *each* input independently and confirming the output changes; a collision would show up directly as a failing "changes any one input" test |
| Retiring `'melody.rand'` changes every existing locale seed's remembered melodies (accepted consequence, spec §1) | None — confirmed acceptable by Crawford during interview | No mitigation needed; Task 9's docs update states this plainly so it isn't rediscovered as a surprise later |
| Task 8's `PingControlsDrawer.tsx` removal misses one of the three render-target sections, leaving a dangling `onResetMelody` prop accepted but never passed a handler | Low — a harmless dead prop, but violates "delete, don't stub" (spec §4.7) | The repo-wide `grep -rn "ResetMelody" src/` zero-results check in Task 8's own acceptance criteria and Checkpoint D catches this directly |
| `regenerateMelody.ts`'s `makeRobot()` test fixture's placeholder `compositionSeed` (added in Task 1) happens to produce a melody that coincidentally matches another test's expected output, masking a real bug | Low | Task 4's acceptance criteria explicitly call for confirming the placeholder is "sufficient or given a real, distinguishable value" — not assumed fine by default |

## Open Questions

None blocking Task 1. `buildSeededComposition`'s naming and the `opts.rand`-over-`opts.seed` substitution were the two open items carried from the spec (§7 items 1-2) and are both resolved as of 2026-09-28.
