# Implementation Plan: Test Suite Run Time

Source: backlog [70](../todo/backlog.md#70-tests-the-full-run-takes-too-long--speed-the-run-dont-thin-the-suite). No
spec and no intent doc: the goal is one sentence (a full `npm test` takes less wall-clock time, and every test still
proves what it proves today), and nothing user-facing changes. The audit that motivated it is
[TEST_REMOVAL_CANDIDATES.md](../reference/TEST_REMOVAL_CANDIDATES.md); its numbers are quoted below where a task
starts from them.

**Status:** drafted 2026-11-07 on `tests/pruning`; no task started. Next: Task 1.

## Overview

Four groups. Phase 1 measures the full run once so every later number has something to be compared with. Phase 2 is
configuration: the DOM-free folders stop booting jsdom, and development gets a changed-files-only run so the full run
becomes a checkpoint step. Gate A after it decides whether Phase 3 is still worth doing. Phase 3 takes the files that
are slow by construction one at a time, each measured alone before and after, each with a stop-if clause. Phase 4 is
the audit's first removal PR, optional and for signal rather than speed, and the docs.

Every task here changes tests or test configuration, never production code, so no task has a RED test. A task's Proof is
a measurement (a number in this file's tables, taken by the recipe in Task 1) or a Read. The invariant every task keeps:
the same cases run and pass before and after, which the case count from `--reporter=json` shows.

## Architecture Decisions

- **Measure wall-clock, rank by alone time.** The audit showed a file's duration inside a full run is three to six
  times its duration alone (worker contention). So the headline figure for this plan is the wall-clock time of one
  full run on an idle machine, and a per-file cost is only ever quoted from a run of that file alone. Recipe in Task 1.
- **The Node environment switch uses `test.projects`, not `environmentMatchGlobs`.** Vitest here is 3.2.4;
  `environmentMatchGlobs` is deprecated in 3.2 and `test.projects` is its replacement. Two projects in
  `vitest.config.ts`: `node` for the DOM-free globs, `jsdom` for the rest. Both keep `vitest.setup.ts` (its GSAP and
  seedUtils mocks are environment-free; its ResizeObserver polyfill is a harmless no-op under Node). Where a folder is
  mixed, a file joins the node project by a `// @vitest-environment node` docblock rather than a growing exclude list.
- **A `typeof window` branch is a behaviour, not a detail.** Six source modules branch on `window` or `document`
  (`audioStore.ts`, `audioBudget.ts`, `audioBudgetSystem.ts`, `debugParams.ts`, `audioContextSetup.ts`,
  `audioDiagnostics.ts`). A test that moves to Node and reaches one of those branches now tests the no-window path,
  which the browser never runs. Task 2's acceptance criterion is therefore stricter than "green": a file whose
  expectations would have to change to pass under Node stays on jsdom, and the task lists which ones.
- **Each slow file is its own task with a stop-if clause.** Gate A may remove most of the reason for Phase 3. Each
  Phase 3 task states the alone time it starts from, the change, and the saving below which it is not worth the
  review; the task is skipped, not forced, when the number says so.
- **The removal audit is last and optional.** Its own finding is that it does not move the clock. It rides along for
  signal, after the measured work, so a faster suite is not confused with a smaller one.

## Dependency Graph

```
Task 1 (baseline)
    │
    ├── Task 2 (DOM-free folders → node project)
    │       │
    │       └── Task 3 (mixed folders, per-file docblocks)
    │
    └── Task 4 (test:related script + guide note)
            │
   ───────── Gate A: wall-clock vs baseline ─────────
            │
    Tasks 5–10 (slow files, each independent, each measured alone)
            │
   ───────── Gate B: wall-clock vs baseline ─────────
            │
    Task 11 (audit PR 1, optional) ── Task 12 (docs, close 70)
```

## Task List

### Phase 1: Measure

- [ ] **Task 1: Baseline — one full run on an idle machine**

  **Description:** Record the wall-clock time and worker time of a full run with nothing else running in the
  checkout (no dev server, no other session, no browser profiling; see the perf harness's hygiene note). Record the
  case count and the error line, if any (backlog 66's "Timeout calling onTaskUpdate" is expected to appear). Also run
  the six Phase 3 files alone and record their alone times, so Phase 3 starts from today's numbers rather than the
  audit's.

  Recipe, PowerShell:

  ```powershell
  Measure-Command { npx vitest run --reporter=json --outputFile=baseline.json } | Select-Object TotalSeconds
  node -e "const r=require('./baseline.json');console.log(r.numTotalTests, r.numFailedTests, r.testResults.reduce((s,f)=>s+(f.endTime-f.startTime),0)/1000)"
  npx vitest run --reporter=json --outputFile=alone.json src/engine/audioEngine/globalFx.test.ts
  ```

  Write the JSON files to the scratchpad, not the repo.

  **Proof:** Read — the Baseline table at the end of this file is filled in.

  **Acceptance criteria:**
  - [ ] Wall-clock seconds, worker seconds, case count and the unhandled-error line are in the Baseline table.
  - [ ] Alone times for the six Phase 3 files are in the Phase 3 table.

  **Dependencies:** None.

  **Files:** this file.

  **Estimated scope:** XS (a run and a table).

### Checkpoint: Measure
- [ ] The Baseline table has a wall-clock figure. Everything after is judged against it.

---

### Phase 2: Configuration

- [ ] **Task 2: The DOM-free folders run in the Node environment**

  **Description:** Add `test.projects` to `vitest.config.ts`: a `node` project including `src/data/**`,
  `src/constants/**`, `src/types/**`, `src/content/**`, `src/testUtils/**` and `src/engine/**` less
  `src/engine/audioContextSetup.test.ts` (the one engine test that reaches the DOM), and a `jsdom` project for the
  rest. On 2026-11-07 those folders hold 60 test files and the grep below finds no DOM use in any of them but that one:

  ```
  grep -lE "from '@testing-library|render\(|document\.|window\.|HTMLElement|localStorage|matchMedia" src/<folder>/**/*.test.ts*
  ```

  Then run the node project alone and read each failure: a file that fails because a module it imports needs the DOM
  at load goes back to jsdom (name it in the commit); a file whose expectations would change because it now reaches a
  `typeof window` branch (Architecture Decisions) goes back to jsdom too, even if it happens to pass. Take the full
  wall-clock figure again by the Task 1 recipe.

  **Proof:** Measurement — the Baseline table gains an "after Task 2" row; the case count is unchanged.

  **Acceptance criteria:**
  - [ ] `npx vitest run` passes with the same case count as the baseline.
  - [ ] No test's expectations were edited to pass under Node; files that would have needed it are listed in the
        commit and stay on jsdom.
  - [ ] The "after Task 2" row is filled in.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `vitest.config.ts`, this file.

  **Estimated scope:** S (one config change, one full run, a read of the failures).

- [ ] **Task 3: The mixed folders, file by file**

  **Description:** `src/utils/` (45 files, 13 touch the DOM), `src/systems/` (32, 9), `src/stores/` (8, 4) and
  `src/animation/` (29, 19) are mixed. For each DOM-free file by the Task 2 grep, add a `// @vitest-environment node`
  docblock at the top. Same two reasons to leave a file on jsdom as Task 2, with the `typeof window` list in mind:
  `audioStore.test.ts`, `audioBudget.test.ts`, `audioBudgetSystem.test.ts` and `debugParams.test.ts` test the
  modules that branch on `window` and are the most likely to stay. The docblock insert is quote-free mechanical work
  and may be scripted; the read of the failures is not.

  **Proof:** Measurement — an "after Task 3" row; case count unchanged.

  **Acceptance criteria:**
  - [ ] Every DOM-free file in the four folders carries the docblock or is named in the commit as staying on jsdom
        with the reason.
  - [ ] Same case count; no expectation edited.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (only if Task 2's row shows a saving; if the Node switch bought nothing on 60 files, skip
  this task and say so at Gate A).

  **Files:** the test files named by the grep, this file.

  **Estimated scope:** S (about 70 one-line inserts and a run).

- [ ] **Task 4: A changed-files run for development; the full run is a checkpoint step**

  **Description:** Add `"test:related": "vitest related --run"` to `package.json` so `npm run test:related -- <files>`
  runs only the tests that import the given source files, and note `npx vitest run --changed` for the uncommitted set.
  In `docs/CONTRIBUTION_GUIDE.md`'s test commands block, add the two forms beside the existing "single file" line and
  say in one sentence that the full run belongs at a checkpoint, with the type check and lint, not after every edit.
  CLAUDE.md's Commands block is not touched (it lists the scripts a PR must pass, which is still `npm test`).

  **Proof:** Read — the guide's test section, and `npm run test:related -- src/utils/colorUtils.ts` runs a handful of
  files, not the suite.

  **Acceptance criteria:**
  - [ ] The script exists and runs only the dependents of the named file.
  - [ ] The guide names both forms and states the checkpoint rule.

  **Dependencies:** Task 1 (so the guide can quote the full run's wall-clock time as the reason).

  **Files:** `package.json`, `docs/CONTRIBUTION_GUIDE.md`.

  **Estimated scope:** XS.

### Checkpoint: Gate A
- [ ] `npm run build:types`, `npm run lint` clean; full run green at the baseline's case count.
- [ ] The Baseline table shows wall-clock after Tasks 2 and 3 against the baseline.
- [ ] **Crawford decides** whether Phase 3 goes ahead, and for which files: each Phase 3 task's stop-if figure is
      read against the new wall-clock, not the old.

---

### Phase 3: Files slow by construction

Each task: measure alone before (Task 1's figure), change, measure alone after, and take one full wall-clock figure
at the end of the phase rather than per task. The audit's section 5 is the source of the "what is slow" column; the
alone times quoted are from 2026-11-07 and Task 1 refreshes them. Order is by expected saving.

- [ ] **Task 5: `src/engine/audioEngine/globalFx.test.ts` — one module graph per `describe`, not per case**

  **Description:** The `beforeEach` at (today) line 458 calls `vi.resetModules()` and re-imports the module for
  every one of 468 cases; that is the file's cost (22.2 s alone). Find which `describe` blocks mutate module state
  between cases (those keep the per-case reset) and move the reset to `beforeAll` for the rest. The ten "warns and
  does not throw when the node throws" cases fold into one `it.each` while in the file; that is a tidy, not a saving.

  **Stop-if:** less than 8 s saved alone.

  **Proof:** Measurement — alone time before and after in the Phase 3 table; case count unchanged.

  **Dependencies:** Gate A.

  **Files:** `src/engine/audioEngine/globalFx.test.ts`.

  **Estimated scope:** M (a 6,300-line file; the read of which blocks share state is the work).

- [ ] **Task 6: `src/engine/AudioEngine.test.ts` — the Tone mocks**

  **Description:** The largest file (395 cases, 38.6 s alone, 98 ms per case). Each case builds its Tone mocks in
  `beforeEach`. Profile three representative cases to see whether the cost is the mock construction, the engine's
  `start()`, or the assertions, then share what is shareable. The audit's 3.4 (the Global FX Chain block repeating
  `globalFx.test.ts`, and the six priming blocks that could be one table) is a tidy that rides along if the file is
  open; it saves cases, not seconds.

  **Stop-if:** the profile shows the cost is in the engine code under test rather than the fixtures, or less than 10 s
  saved alone.

  **Proof:** Measurement — alone time before and after; case count unchanged (or reduced only by 3.4's named
  duplicates, with the `setGlobalCompressor` case moved into `globalFx.test.ts` first).

  **Dependencies:** Gate A.

  **Files:** `src/engine/AudioEngine.test.ts`, `src/engine/audioEngine/globalFx.test.ts` (3.4's move only).

  **Estimated scope:** M.

- [ ] **Task 7: `src/utils/globalAudioSeed.test.ts` — the three 3,000-style colour tests**

  **Description:** The three slowest cases in the file (18.3 s alone) are the Global Colour trio at lines 559, 581
  and 598. Two of them (581, 598) have a stronger twin in `globalAudioSeed.evenDraws.test.ts` line 273 per the
  audit's 2.1 and go; the third (559, the Mix 0.1 to 0.2 listen pin) is the audit's 2.3 and is **Crawford's call**
  (Open Questions). Do not shrink the 3,000-style samples instead: at ±3 points the tolerance is about one standard
  deviation at 300 styles and the test turns flaky (audit 2.5).

  **Stop-if:** none; the two deletions are the audit's own.

  **Proof:** Measurement — alone time before and after; case count down by exactly the deleted cases.

  **Dependencies:** Gate A; the 2.3 answer.

  **Files:** `src/utils/globalAudioSeed.test.ts`.

  **Estimated scope:** XS.

- [ ] **Task 8: `src/utils/svgElementExtent.test.tsx` — sample the seeds**

  **Description:** 33 cases at 215 ms each (7.1 s alone), the highest per-case cost in the suite: each rooftop case
  renders 5 sizes × 60 seeds × shaded or not = 600 React trees, each scenery case 160. Cut the seed sample to 10 and
  check which renderer geometry branches the remaining seeds still reach (the seeds pick branches; a smaller sample
  sees fewer). If a branch is lost, pick the seeds that cover it rather than enlarging the sample.

  **Stop-if:** fewer than 4 s saved alone, or a branch cannot be kept covered with a fixed seed list.

  **Proof:** Measurement — alone time before and after; case count unchanged.

  **Dependencies:** Gate A.

  **Files:** `src/utils/svgElementExtent.test.tsx`.

  **Estimated scope:** S.

- [ ] **Task 9: `src/screens/OffScreen.test.tsx` — the mounts**

  **Description:** 195 full-screen mounts under the scene wash (16.5 s alone, 85 ms each; the file that suffers most
  under contention, 108 s in a full run). Find which of the 22 top-level `describe`s assert on the chooser, the
  Loading axis or the veil alone and could mount with the boot theatre and scene stubbed. This is the riskiest task
  in the phase: the off screen's tests found real bugs through full mounts (its review follow-ups), so a stub must
  not hide the path a block exists to test.

  **Stop-if:** fewer than 6 s saved alone, or any block would need its expectations changed to pass with a stub.

  **Proof:** Measurement — alone time before and after; case count unchanged; no expectation edited.

  **Dependencies:** Gate A.

  **Files:** `src/screens/OffScreen.test.tsx`.

  **Estimated scope:** M.

- [ ] **Task 10: `src/systems/lifecycleSim.test.ts` and the 1.12 flake**

  **Description:** Two items the audit already settled as far as it could. The readiness sim "over the full grid at
  20, 110 and 200 BPM for 10 minutes" is the slowest single case in the suite (17.4 s) and the file is the audit's 1.4:
  the test file goes once **Crawford decides** on the `lifecycleSim.ts` module (Open Questions; the module stays until
  `SIM_SEED_COORDS` has a test-utils home, since four live test files import it). And
  `src/animation/jobMoves/sceneToOrbiterLocal.test.tsx`'s 800-gem round trip timed out in two of three full runs and
  passed the third at 5.2 s: cut its sample to 5 gems or remove it (**Crawford's call**). Check while there whether it
  is backlog 66's unhandled "Timeout calling onTaskUpdate"; if the error line disappears from a full run after this
  task, 66 closes with it.

  **Stop-if:** none; both are decisions, not measurements.

  **Proof:** Measurement — full run clean of the timeout, or not, recorded; case count down by the removed cases.

  **Dependencies:** Gate A; the 1.4 and 1.12 answers.

  **Files:** `src/systems/lifecycleSim.test.ts`, `src/animation/jobMoves/sceneToOrbiterLocal.test.tsx`, and
  `src/systems/lifecycleSim.ts` plus a test-utils home for `SIM_SEED_COORDS` if the module goes.

  **Estimated scope:** S.

### Checkpoint: Gate B
- [ ] `npm run build:types`, `npm run lint` clean; full run green; case count equals the baseline less the cases
      Tasks 7 and 10 removed by name.
- [ ] The Baseline table shows wall-clock after Phase 3.
- [ ] **Crawford decides** whether Phase 4's removal PR goes ahead.

---

### Phase 4: The removal audit, and docs

- [ ] **Task 11 (optional): the audit's first PR — groups 1.1 to 1.8 and 1.12**

  **Description:** As [TEST_REMOVAL_CANDIDATES.md](../reference/TEST_REMOVAL_CANDIDATES.md) section 7 step 1 lays
  it out, with its four relocations done in the same commit as the deletion they precede, never after: the
  `isSyncedRateKey` and `withGlobalAudioDefaults` blocks out of `types/globalAudio.test.ts`; the orbiter-timeline case
  out of `Robot.integration.test.tsx` into `Robot.test.tsx`; the re-reserve sends case out of
  `robotSendsParity.test.ts` into `AudioEngine.test.ts` (it uses the parity file's own `recordPrimes` harness, so
  expect to rewrite it against `AudioEngine.test.ts`'s mocks, not paste it); the Button and TempoSyncToggle help checks
  out of `helpOnLabels.test.tsx` if 1.11 rides along. `constants/time.test.ts` is trimmed to its six
  `computeLocaleHour` tests. One commit per audit group so any group reverts alone. Groups 1.9, 3.3, 3.5, 3.6 and 4
  are read-and-pick sweeps and are **not** in this task.

  **Proof:** Read — green run; the before and after case counts in the commit; `npm run build:types` still rejects
  the type cases the deleted files asserted at runtime. A green run cannot fail for a deletion, so the count and the
  relocation list are the proof.

  **Dependencies:** Gate B; the 1.3, 1.6 and 1.7 answers (Open Questions).

  **Files:** the 31 files the audit's section 1 names; see the doc.

  **Estimated scope:** M (about 4,000 lines deleted, four tests moved).

- [ ] **Task 12: Docs — close backlog 70**

  **Description:** Write the final Baseline table into backlog 70's entry (or its archive entry, by the usual move),
  tick the audit doc's groups that Task 11 acted on, and add a short "Test run time" paragraph to
  `docs/PERFORMANCE.md` naming the wall-clock baseline, the Node-project split and the alone-time recipe, so the next
  person measures the same way. If Task 10 cleared the unhandled timeout, close backlog 66 with it.

  **Proof:** Read.

  **Dependencies:** Gate B (and Task 11 if run).

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/PERFORMANCE.md`,
  `docs/reference/TEST_REMOVAL_CANDIDATES.md`.

  **Estimated scope:** XS.

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, full run clean.
- [ ] The Baseline table is complete and copied into backlog 70's record.
- [ ] Reviewed with Crawford.

## Risks and Mitigations

- **A Node-environment file silently tests the wrong branch.** The six `typeof window` modules take their no-window
  path under Node. Mitigation: Task 2 and 3's rule that a file whose expectations would change stays on jsdom, and the
  named list of the four most likely files.
- **A module needs the DOM at import time, not in the test.** It fails loudly under Node (a `document is not
  defined` at load); the file goes back to jsdom and is named in the commit. No silent case.
- **The Node switch buys less than hoped.** jsdom's cost is per file at startup; with 16 workers it may be small
  against the test bodies. That is what Gate A is for: Task 3 and Phase 3 are skipped or kept on the number, not on
  the hope.
- **A stub in `OffScreen.test.tsx` hides a real path.** Task 9's stop-if forbids changing any expectation to pass
  with a stub; if a block needs the real child, it keeps it.
- **Shrinking a sample makes a statistical test flaky.** Only Task 8 shrinks a sample, and it is a geometry parity
  check with fixed seeds, not a share test. The share tests' samples are explicitly not shrunk (Task 7).
- **Two sessions in the checkout during a measurement.** Every figure in this file is taken on an idle checkout, by
  the Task 1 recipe; a figure taken otherwise is not written down.

## Open Questions

Decisions for Crawford; each is named at the task that waits on it.

1. **Audit 1.3:** are the `WORLD_GEM` switches developer toggles (keep one switch-off test each, cut the rest) or
   cruft (the switches go too, a code change)? Waits: Task 11.
2. **Audit 1.4:** does `src/systems/lifecycleSim.ts` go with its test, once `SIM_SEED_COORDS` has a test-utils home?
   Waits: Task 10.
3. **Audit 1.7:** keep `numericDuration.test.ts`, the deliberate Tone-upgrade tripwire? Waits: Task 11.
4. **Audit 1.12:** `sceneToOrbiterLocal`'s 800-gem round trip — cut to 5 gems or remove? Waits: Task 10.
5. **Audit 2.3:** the Mix 0.1 to 0.2 listen pin at `globalAudioSeed.test.ts` 559 — keep or cut? Waits: Task 7.
6. **Audit 1.6:** of the three cascade tests (`CabinetryCascade.test.tsx`, the `AudioRigEffectPanel.test.tsx` block,
   the per-control pair), which one stays? Waits: Task 11.

## Baseline

Filled in by the tasks. Wall-clock is `Measure-Command` over `npx vitest run` on an idle checkout; worker seconds is
the sum of per-file durations from `--reporter=json`.

| Point | Wall-clock (s) | Worker (s) | Cases | Unhandled error | Date |
| --- | --- | --- | --- | --- | --- |
| Baseline (Task 1) | | | | | |
| After Task 2 | | | | | |
| After Task 3 | | | | | |
| After Phase 3 | | | | | |
| After Task 11 | | | | | |

### Phase 3 files, alone

| File | Alone before (s) | Alone after (s) | Cases before | Cases after | Task |
| --- | --- | --- | --- | --- | --- |
| `engine/audioEngine/globalFx.test.ts` | | | | | 5 |
| `engine/AudioEngine.test.ts` | | | | | 6 |
| `utils/globalAudioSeed.test.ts` | | | | | 7 |
| `utils/svgElementExtent.test.tsx` | | | | | 8 |
| `screens/OffScreen.test.tsx` | | | | | 9 |
| `systems/lifecycleSim.test.ts` | | | | | 10 |
