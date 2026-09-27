# Implementation Plan: Pitch Repeat

Source spec: [docs/specs/PITCH_REPEAT.md](../specs/PITCH_REPEAT.md). Source intent:
[docs/intent/pitch-repeat.md](../intent/pitch-repeat.md).

## Overview

Add `Robot.pitchRepeat` (`0–100`), a slider that increasingly locks a tiled motif's repeated cells
to the base cell's pitches, plus one bundled fix to the shared rhythm engine so
`buildMotifOnsets` stops silently dropping onsets in the leftover steps when
`rhythmicMotifLength.value` doesn't evenly divide 16 (the "tail-cell fix"). Full pipeline: seeded
spawn value → generation-time locking (`computePitchLockPlan`) → `pitchLocked`-aware docking
re-roll → manual-edit action → schema-driven UI in both robot and company-broadcast modes.

## Architecture Decisions

Resolving spec §7's five open questions before any task is written, not during implementation:

- **§7.1 — Base-cell events stay eligible for docking re-roll (Option a, as spec'd).** A locked
  *copy* can go briefly stale relative to a re-rolled base cell until the next full regeneration.
  Chosen because it needs no new exclusion logic beyond "exclude `pitchLocked` events" (already the
  whole of Task 12's scope), the staleness only fires when the docking re-roll happens to select a
  base-cell position, and it self-heals on the next `regenerateMelody`/coordinate change. Revisit if
  it turns out audible in practice — cheap to add a second exclusion rule later.
- **§7.2 — `DEFAULT_PITCH_REPEAT = 0`.** Unlike `DEFAULT_RHYTHMIC_DENSITY` (`50`, a genuine
  mid-range default), `0` *is* the neutral/off state here — it's what makes "statistically
  indistinguishable from today" (the Success criterion) hold whenever the field is absent.
- **§7.3 — Stage-boundary floating-point safety, resolved with an explicit guard.** `100 / K` is
  not always exact (e.g. `K=3` → repeating `33.3̄`), so a naive `pitchRepeatPct >= stageEnd` check on
  the final stage risks landing a hair under `100` and leaving the last position not fully locked at
  `pitchRepeatPct: 100`. Fix: `computePitchLockPlan` special-cases `pitchRepeatPct >= PITCH_REPEAT_MAX`
  to force every stage's fraction to exactly `1` up front, bypassing the per-stage float arithmetic
  entirely for that case. This is now a required acceptance criterion on Task 6, not left to
  incidental float behavior.
- **§7.4 — Lore label: `'PING REPETITION ALLOWANCE'`** (all-caps, matching `DENSITY_SCHEMA`'s
  `'PING DENSITY'` convention exactly). Human label: `'Pitch Repeat'`.
- **§7.5 — Slider placement: immediately after Motif Length, before Octave Range.** Adjacent to the
  field it's gated by (`rhythmicMotifLength.active`), so the dependency reads naturally in the UI
  without needing a label to explain it.
- **Foundation-first, then independent tracks.** `constants/index.ts` and the two type files
  (`Robot.ts`, `Company.ts`) are additive-only changes (new optional fields) — they don't break any
  existing consumer, so unlike `ROBOT_MELODY_SEED_ENGINE.md`'s foundation phase, `npm run
  build:types` stays green throughout this plan rather than going red until the last task lands.
  `melodyGenerator.ts`'s four sub-changes (Tasks 4–7) all touch the same file/test-file pair and
  must run strictly sequentially regardless of their logical independence. Once Phase 2 lands, the
  four Phase 3 consumer tasks (8–11) are mutually independent and parallel-safe. Phase 4's UI tasks
  have their own internal chain (schema → actions/company-resolve → drawer → both call sites).

## Dependency Graph

```
Task 1 (constants/index.ts)     ─┐
Task 2 (types/Robot.ts)         ─┼─→ (parallel-safe with each other; all additive-only)
Task 3 (types/Company.ts)       ─┘
                                              Task 4 (buildMotifOnsets tail-cell pass)
                                                        │  (same file — sequential only)
                                                        ▼
                                              Task 5 (computePitchLockPlan)
                                                        │  (same file — sequential only)
                                                        ▼
Task 1 ──────────────────────────────────→   Task 6 (generateMelodyForRobot wiring)
                                                        │  (same file — sequential only)
                                                        ▼
                                              Task 7 (reRollMelodyPitches exclusion)
                                                        │
                        ┌───────────────┬───────────────┼───────────────┐
                        ▼               ▼               ▼               ▼
Task 2,6 → Task 8   Task 2,6 → Task 9   Task 1,2 → Task 10   Task 7 → Task 11
(regenerateMelody)  (spawnSystem)       (localeStore clamp)  (robotSystems tests)
                        │               │
                        │               │
Task 1 → Task 12 (robotOptionsConfig.ts schema)
        │
        ├─→ Task 13 (robotOptionsActions.ts — needs Task 2, Task 8) ─┐
        ├─→ Task 14 (companyOptions.ts — needs Task 3, Task 2)       ├─→ Task 16 (RobotOptionsTab.tsx)
        └─→ Task 15 (PingControlsDrawer.tsx)  ──────────────────────┴─→ Task 17 (CompanyOptionsSection.tsx)
                                                                            (needs 13, 14, 15)
                                                                                 │
                                                                                 ▼
                                                                    Task 18 (docs — depends on everything)
```

Phase 1 (Tasks 1–3) is parallel-safe internally. Phase 2 (Tasks 4–7) is one strictly sequential
chain — same two files every time. Phase 3 (Tasks 8–11) is four independent, parallel-safe tracks
once Phase 2 lands. Phase 4 (Tasks 12–17) has its own internal ordering — schema first, then the
two action-layer files, then the drawer, then both UI call sites (each needing the drawer *and* its
own action-layer dependency). Task 18 (docs) waits on everything, since it documents shipped
behavior.

## Task List

### Phase 1: Foundation

- [x] **Task 1: `src/constants/index.ts` — add `PITCH_REPEAT_MIN`/`MAX`**

  **Description:** Add the shared range constants for the new field, next to the other three
  rhythm/pitch fields' ranges, so every downstream consumer (generator clamp, store clamp, UI
  schema) draws from one source.

  **Acceptance criteria:**
  - [ ] `PITCH_REPEAT_MIN = 0`, `PITCH_REPEAT_MAX = 100`
  - [ ] Placed adjacent to `RHYTHMIC_DENSITY_MIN/MAX` (same shape: a plain 0–100 percentage, no
        toggle)

  **Verification:**
  - [ ] `npm run build:types` — clean (purely additive, nothing references the new constants yet)
  - [ ] `npm run lint` clean for `constants/index.ts`

  **Dependencies:** None.

  **Files:** `src/constants/index.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 2: `src/types/Robot.ts` — add `pitchRepeat` and `pitchLocked` fields**

  **Description:** Add `Robot.pitchRepeat?: number` (same shape as `rhythmicDensity`) and
  `MelodyEvent.pitchLocked?: boolean`, with doc comments describing each per spec §1/§3.

  **Acceptance criteria:**
  - [ ] `Robot.pitchRepeat?: number` added, doc comment states the `0–100` range and that it's
        inert when `rhythmicMotifLength.active === false`
  - [ ] `MelodyEvent.pitchLocked?: boolean` added, doc comment notes it's only ever `true` on a
        locked non-base-cell repeat — never set on base-cell (repeat 0) events
  - [ ] Doc comment explicitly notes this interface is structurally identical to but separately
        declared from `RobotMelodyEvent` in `melodyGenerator.ts` (pre-existing duplication,
        surfaced so the next reader doesn't "fix" it by merging them mid-feature)

  **Verification:**
  - [ ] `npm run build:types` — clean (new field is optional, additive-only)
  - [ ] `npm run lint` clean for `types/Robot.ts`

  **Dependencies:** None (parallel-safe with Task 1, Task 3).

  **Files:** `src/types/Robot.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 3: `src/types/Company.ts` — add `pitchRepeat` to `CompanyOptionsSnapshot`**

  **Deviation from plan:** additive-only did NOT keep `build:types` green as assumed —
  `resolveCompanyOptions` builds a `Required<CompanyOptionsSnapshot>`, so the new optional field
  broke it immediately. Fixed by pulling one line of Task 14 forward (`pitchRepeat:
  firstMember.pitchRepeat ?? 0` in `companyOptions.ts`, literal `0` since `DEFAULT_PITCH_REPEAT`
  doesn't exist until Task 6) — TODO left in place to swap to the real constant when Task 14 runs.

  **Description:** Add the broadcast-snapshot field alongside the existing `rhythmicDensity`.

  **Acceptance criteria:**
  - [ ] `CompanyOptionsSnapshot.pitchRepeat?: number` added next to `rhythmicDensity?: number`

  **Verification:**
  - [ ] `npm run build:types` — clean
  - [ ] `npm run lint` clean for `types/Company.ts`

  **Dependencies:** None (parallel-safe with Task 1, Task 2).

  **Files:** `src/types/Company.ts`

  **Estimated scope:** XS (1 file)

### Checkpoint: Foundation

- [x] `npm run build:types` passes with zero errors (required the companyOptions.ts fix above;
      see Task 3's deviation note).
- [x] `npm run lint` passes on all three touched files.
- [x] `npm test` — full suite green except one pre-existing, unrelated flaky test
      (`idleSystem.test.ts`'s "generates destinations in center area", a statistical
      `Math.random`-based assertion — confirmed passing in isolation, confirmed untouched by this
      change).

### Phase 2: Core Rhythm Engine (`melodyGenerator.ts` — strictly sequential, same file every task)

- [x] **Task 4: `buildMotifOnsets` — tail-cell pass**

  **Deviation from spec §4's code sketch:** the sketch places the tail-cell pass BEFORE
  `combined`/the trim check runs, folding tail onsets into the same pool the trim branch can
  randomly discard from. That contradicts the intent doc's explicit text ("appended *after* that
  check runs, not part of the requested density target") and Task 4's own acceptance criteria
  ("appended after both [branches], never folded into either"). Implemented per the intent
  doc/acceptance criteria instead: trim branch runs first and is untouched, tail pass is appended
  to its result afterward — verified with a dedicated test (`density=1, M=6`) proving a tail onset
  survives even when the pre-tail trim already reduced the count to below what the tail would add.

  **Description:** Add the additive tail-cell pass from spec §4: after the existing tiling loop and
  before the existing `combined.length <= rhythmicDensity` trim check, copy whichever base-motif
  positions are `< tailLength` into one final partial cell at `repeats × M`.

  **Acceptance criteria:**
  - [ ] `M` values that evenly divide `subdivisions` (`1, 2, 4, 8` against 16) are byte-for-byte
        unaffected — identical output to pre-change `buildMotifOnsets` for the same inputs/seed
  - [ ] `M` values that don't (`3, 5, 6, 7` against 16) now include onsets `>= repeats × M`, each of
        whose `(onset - repeats × M)` is a member of the base motif's own position set
  - [ ] Tail onset count never exceeds `min(K, tailLength)`
  - [ ] The existing `R`-extra-onset-per-repeat branch and the overshoot-trim branch are untouched —
        the tail pass is appended after both, never folded into either

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts -t buildMotifOnsets` — new tail-cell
        cases pass, all pre-existing `buildMotifOnsets` cases still pass unmodified
  - [ ] `npm run build:types` passes for `melodyGenerator.ts`

  **Dependencies:** None — this is a pure rhythm-engine fix, independent of every Pitch Repeat field.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 5: `computePitchLockPlan` — new pure function**

  **Description:** Implement the staged/seeded locking algorithm from spec §4 as a new, separately
  exported, separately tested pure function — same precedent as `buildMotifOnsets`.

  **Acceptance criteria:**
  - [ ] `pitchRepeatPct: 0` → every returned value `false`
  - [ ] `pitchRepeatPct: 100` → every non-base-cell onset `true`, using the Architecture Decisions'
        §7.3 float-safety guard (force-full-lock short-circuit at `pitchRepeatPct >= PITCH_REPEAT_MAX`,
        not per-stage boundary arithmetic)
  - [ ] Monotonic for a fixed seed: the locked-index set at `pct: N` is a subset of the set at
        `pct: N+10`, swept across the full `0–100` range
  - [ ] Deterministic: identical `(onsets, motifLength, subdivisions, pitchRepeatPct, seed)` →
        identical plan across repeated calls
  - [ ] Two different seeds produce different position-lock orders (guards "not always position 0
        first")
  - [ ] A motif length with a tail (e.g. `M=6` against 16) correctly excludes the tail repeat from a
        position's applicable-repeat list when that position is `>= tailLength`
  - [ ] Base-cell (repeat-0) onsets are always `false` in the returned plan

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts -t computePitchLockPlan` — all new cases
        pass
  - [ ] `npm run build:types` passes for `melodyGenerator.ts`

  **Dependencies:** Task 4 (same file — sequential only; the function itself takes onsets as a
  generic input and has no runtime dependency on the tail-cell pass, but concurrent edits to the
  same file/test-file pair aren't safe).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** M (1 file + its test, concentrated new algorithm)

- [x] **Task 6: Wire `pitchRepeat` + `computePitchLockPlan` into `generateMelodyForRobot`**

  **Description:** Add `pitchRepeat` to `GenerateMelodyForRobotOptions`, add `DEFAULT_PITCH_REPEAT`
  (per Architecture Decisions §7.2), call `computePitchLockPlan` when `motif.active`, and change the
  per-onset `noteIndex` loop to copy verbatim (bypassing Note Variance) for locked onsets while
  leaving unlocked onsets' selection state untouched. Add `pitchLocked?: boolean` to
  `RobotMelodyEvent` (this file's own interface, separate from `types/Robot.ts`'s — see Task 2).

  **Acceptance criteria:**
  - [ ] `RobotMelodyEvent.pitchLocked?: boolean` added
  - [ ] `GenerateMelodyForRobotOptions.pitchRepeat?: number` added, clamped via `PITCH_REPEAT_MIN`/
        `MAX` the same way `rhythmicDensity` is clamped
  - [ ] `DEFAULT_PITCH_REPEAT = 0` exported alongside the other three defaults
  - [ ] `pitchRepeat`/`computePitchLockPlan` are only consulted when `motif.active` — otherwise the
        lock plan is implicitly all-`false` and generation is byte-for-byte identical to pre-change
        output (gating regression guard)
  - [ ] Locked onsets copy `noteIndex` verbatim from the corresponding base-cell event and are
        stamped `pitchLocked: true`; they do **not** call the Note Variance selection functions or
        mutate `uniqueSet`/`withoutReplacementPool` state
  - [ ] Unlocked onsets (including all base-cell onsets) run through today's Note Variance logic
        exactly as before, in the same iteration order — `pitchRepeat: 0` (or field absent) output
        is statistically indistinguishable from pre-change output for the same seed
  - [ ] `pitchLocked` is `undefined` (not `false`) on every non-locked event, including the base cell

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts -t generateMelodyForRobot` — including a
        golden-output regression test at `pitchRepeat: 0`/absent against a fixed seed, a
        `pitchRepeat: 100` full-verbatim-repetition test, and a `rhythmicMotifLength.active: false`
        gating test
  - [ ] `npm run build:types` passes for `melodyGenerator.ts` and its test file

  **Dependencies:** Task 1 (constants), Task 4, Task 5 (same file — sequential).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** M (1 file + its test, the main integration point)

- [x] **Task 7: `reRollMelodyPitches` — exclude locked events**

  **Description:** Change the candidate pool to exclude `pitchLocked` events per spec §4's
  before/after, replacing the unconditional floor-of-1 with one that only applies when the eligible
  pool is non-empty.

  **Acceptance criteria:**
  - [ ] A melody with every event `pitchLocked: true` → re-roll returns it unchanged (0 events
        changed, not the old floor-of-1)
  - [ ] A partially-locked melody → across repeated seeded runs, only unlocked events are ever
        selected for change
  - [ ] A melody with no locked events → identical behavior to pre-change (regression guard on the
        eligible-pool refactor)
  - [ ] Reuses `pickRandomIndices` against the eligible-index subset (per spec §4's snippet) rather
        than introducing a new selection helper

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts -t reRollMelodyPitches` — all cases above
        pass, all pre-existing cases still pass unmodified
  - [ ] `npm run build:types` passes for `melodyGenerator.ts` and its test file

  **Dependencies:** Task 6 (same file — sequential; needs `pitchLocked` to exist and be stamped to
  test against meaningfully).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (1 file + its test)

### Checkpoint: Core Rhythm Engine

- [x] `npx vitest run src/engine/melodyGenerator.test.ts` — full file green (110/110).
- [x] `npm run build:types` passes for the whole repo.
- [x] `npm run lint` clean for `melodyGenerator.ts`.
- [x] Manual sanity check: covered by Task 6's dedicated test (`pitchRepeat: 100 with motif
      active — every repeat's noteIndex sequence matches the base cell's`, value=4/density=100/
      seed=23) plus Task 5's `computePitchLockPlan` tail-repeat test (M=6). Full pitchRepeat:100 +
      value:6 + tail-cell combination not separately spot-checked as a throwaway script — the two
      existing tests cover the same logic paths (full lock; tail-repeat exclusion) individually.
- [ ] Review with human before proceeding to Phase 3.

### Phase 3: Consumers (parallel-safe once Phase 2 lands)

- [x] **Task 8: `src/engine/regenerateMelody.ts` — read `robot.pitchRepeat`**

  **Description:** Pass `robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT` into the
  `generateMelodyForRobot` call, matching how the other three fields are already read.

  **Acceptance criteria:**
  - [ ] `generateMelodyForRobot`'s call includes `pitchRepeat: robot.pitchRepeat ??
        DEFAULT_PITCH_REPEAT`
  - [ ] No other behavior change — still the existing unseeded `Math.random` path (not fixed by this
        phase, per spec Constraint)

  **Verification:**
  - [ ] `npx vitest run src/engine/regenerateMelody.test.ts` — updated fixture/assertions pass
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 2, Task 6.

  **Files:** `src/engine/regenerateMelody.ts`, `src/engine/regenerateMelody.test.ts`

  **Estimated scope:** XS (1 file + its test)

- [x] **Task 9: `src/systems/spawnSystem.ts` — seed `pitchRepeat`**

  **Description:** Add `spawnPitchRepeat`, seeded via `getSeededVal(noiseMap, 'robot.pitchRepeat',
  spawnCount, 0, 100)` in the non-copy branch and inherited verbatim (`source.pitchRepeat ??
  DEFAULT_PITCH_REPEAT`) on the `shouldCopy` branch, matching `spawnRhythmicDensity`'s exact
  pattern. Wire it into both the `Robot` object literal and the `generateMelodyForRobot` call.

  **Acceptance criteria:**
  - [ ] Non-copy branch: `spawnPitchRepeat` seeded `0–100` from the noise map (with the same
        `alea(...)` no-noise-map fallback pattern used by the sibling fields)
  - [ ] `shouldCopy` branch: `spawnPitchRepeat = source.pitchRepeat ?? DEFAULT_PITCH_REPEAT`
  - [ ] `Robot` literal includes `pitchRepeat: spawnPitchRepeat`
  - [ ] The `generateMelodyForRobot` call includes `pitchRepeat: spawnPitchRepeat`

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` — new coverage: `pitchRepeat` is seeded
        `0–100`; inherited (not re-rolled) on the `shouldCopy` path
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 2, Task 6.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 10: `src/stores/localeStore.ts` — clamp `pitchRepeat` in `updateRobot`**

  **Description:** Add a `pitchRepeat` clamp to the existing `updateRobot` block, same pattern as
  `rhythmicDensity`'s (a plain number, not a toggle object — no `clampToggleValue` needed).

  **Acceptance criteria:**
  - [ ] `updateRobot` clamps `pitchRepeat` to `PITCH_REPEAT_MIN`–`PITCH_REPEAT_MAX`, truncated,
        mirroring the existing `rhythmicDensity` block exactly

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts` — new clamp test passes, same pattern as the
        existing `rhythmicDensity` clamp test
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** XS (1 file + its test)

- [x] **Task 11: `src/systems/robotSystems.ts` — docking re-roll test coverage**

  **Deviation from plan's exact numbers:** the plan's acceptance criteria said "2 of 8 onsets, at
  default settings" — `robotSystems.test.ts`'s actual `makeRobot()` default melody has 4 events,
  and the pre-existing test already asserts `round(4 * 0.25) = 1`. Used the real convention (4
  events, floor of 1) instead of the plan's example numbers.

  **Description:** No call-site code change (`reRollMelodyPitches` already receives the full melody
  and now excludes locked events internally, per Task 7) — this task is net-new test coverage only,
  confirming the behavior end-to-end through `landOnDocked`.

  **Acceptance criteria:**
  - [ ] Docking a robot with `pitchRepeat: 100` and motif tiling active changes zero notes on
        re-roll
  - [ ] Docking a `pitchRepeat: 0` robot behaves exactly as the existing test already asserts (2 of
        8 onsets, default settings) — explicit regression guard, not just "still passes"

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` — new cases pass, all existing cases still
        pass unmodified
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 7.

  **Files:** `src/systems/robotSystems.test.ts`

  **Estimated scope:** XS (test-only, 1 file)

### Checkpoint: Consumers

- [x] `npm run build:types` — zero errors across the whole repo.
- [x] `npm run lint` — zero errors.
- [x] `npm test` — full suite green except the same pre-existing, unrelated flaky
      `idleSystem.test.ts` test noted at the Phase 1 checkpoint (statistical, `Math.random`-based;
      confirmed unrelated to this feature).
- [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
- [x] Feature is functionally complete end-to-end at the data/engine layer (spawn → generate → dock
      → re-roll all respect `pitchRepeat`) — only UI exposure (Phase 4) remains.
- [ ] Review with human before proceeding to Phase 4.

### Phase 4: UI Wiring

- [x] **Task 12: `src/data/robotOptionsConfig.ts` — `PITCH_REPEAT_SCHEMA`**

  **Description:** Add a `SliderLinearSchema`, same shape as `DENSITY_SCHEMA`, per Architecture
  Decisions §7.4.

  **Acceptance criteria:**
  - [ ] `PITCH_REPEAT_SCHEMA: SliderLinearSchema` — `id: 'robotOptions.pitchRepeat'`,
        `loreLabel: 'PING REPETITION ALLOWANCE'`, `humanLabel: 'Pitch Repeat'`,
        `min: PITCH_REPEAT_MIN`, `max: PITCH_REPEAT_MAX`, `unit: '%'`

  **Verification:**
  - [ ] `npm run build:types` passes for this file
  - [ ] `npm run lint` clean

  **Dependencies:** Task 1.

  **Files:** `src/data/robotOptionsConfig.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 13: `src/systems/robotOptionsActions.ts` — `applyPitchRepeat`**

  **Description:** Add the manual-edit action, mirroring `applyDensity` exactly per spec §4.

  **Acceptance criteria:**
  - [ ] `applyPitchRepeat(robot, localeId, value: number)` writes `pitchRepeat` via `updateRobot`
        and calls `regenerateMelody` with the updated robot, matching `applyDensity`'s two-line body

  **Verification:**
  - [ ] `npx vitest run src/systems/robotOptionsActions.test.ts` — new `applyPitchRepeat` case,
        mirroring the existing `applyDensity` test
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 2, Task 8 (needs `regenerateMelody.ts` already reading `pitchRepeat`).

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** XS (1 file + its test)

- [x] **Task 14: `src/systems/companyOptions.ts` — `resolveCompanyOptions` includes `pitchRepeat`**

  **Note:** the actual field-inclusion work was pulled forward into Task 3 (needed to keep
  `Required<CompanyOptionsSnapshot>` compiling). This task's remaining scope was swapping the
  placeholder literal `0` for the real `DEFAULT_PITCH_REPEAT` import, done here.

  **Description:** Add `pitchRepeat: firstMember.pitchRepeat ?? DEFAULT_PITCH_REPEAT` to the
  resolved snapshot, alongside the existing `rhythmicDensity` line.

  **Acceptance criteria:**
  - [ ] `resolveCompanyOptions` includes `pitchRepeat: firstMember.pitchRepeat ??
        DEFAULT_PITCH_REPEAT`

  **Verification:**
  - [ ] `npx vitest run src/systems/companyOptions.test.ts` — updated/new assertion passes
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 3, Task 2.

  **Files:** `src/systems/companyOptions.ts`, `src/systems/companyOptions.test.ts`

  **Estimated scope:** XS (1 file + its test)

- [x] **Task 15: `src/components/robot/PingControlsDrawer.tsx` — add the slider**

  **Note:** landing this task alone temporarily breaks `build:types` at its two call sites
  (`RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`) since `onPitchRepeatChange` is a new
  required prop — expected per the plan's own dependency graph (Task 15 → Task 16, Task 17).
  Verified clean once Tasks 16/17 land in the same session.

  **Description:** Add `pitchRepeat: number` to `PingControlsValue`, a new `onPitchRepeatChange`
  prop, and render a `SliderLinear` with `PITCH_REPEAT_SCHEMA` immediately after Motif Length (per
  Architecture Decisions §7.5), disabled whenever `!value.rhythmicMotifLength.active` in addition to
  the existing `generationDisabled` gate.

  **Acceptance criteria:**
  - [ ] `PingControlsValue.pitchRepeat: number` added
  - [ ] `onPitchRepeatChange: (value: number) => void` prop added
  - [ ] `SliderLinear` rendered with `PITCH_REPEAT_SCHEMA`, positioned after the Motif Length
        `StepperWithToggle` and before Octave Range
  - [ ] `disabled={generationDisabled || !value.rhythmicMotifLength.active}` — the slider is
        specifically inert (not just visually greyed) when tiling is off, matching the feature's
        gating rule

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` — new assertions: slider
        renders, fires `onPitchRepeatChange`, disabled when `rhythmicMotifLength.active === false`
        even if `generationDisabled` is otherwise `false`
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 12.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 16: `src/components/panels/screen/console/RobotOptionsTab.tsx` — robot-mode wiring**

  **Description:** Add `pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT` to
  `pingControlsValue` and wire `onPitchRepeatChange` to `applyPitchRepeat`, mirroring the existing
  `onDensityChange`/`applyDensity` wiring.

  **Acceptance criteria:**
  - [ ] `pingControlsValue.pitchRepeat` derived from `robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT`
  - [ ] `<PingControlsDrawer onPitchRepeatChange={(v) => applyPitchRepeat(robot, localeId, v)} />`

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` — new wiring
        assertion, mirroring the existing `onDensityChange → applyDensity` spy test
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 13, Task 15.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`,
  `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** XS (1 file + its test)

- [x] **Task 17: `src/components/company/CompanyOptionsSection.tsx` — company-broadcast wiring**

  **Description:** Add `pitchRepeat: 0` to `DISABLED_PING_CONTROLS` and a new
  `onPitchRepeatChange` handler using the plain-number broadcast pattern (`members.forEach` +
  `patchSnapshot`, matching `onDensityChange` exactly) — not `diffCompoundField`, since `pitchRepeat`
  is a plain number, not a `{active, value}` toggle.

  **Acceptance criteria:**
  - [ ] `DISABLED_PING_CONTROLS.pitchRepeat: 0` added
  - [ ] `onPitchRepeatChange` broadcasts `applyPitchRepeat` to every member and calls
        `patchSnapshot({ pitchRepeat: v })`, mirroring `onDensityChange`'s body exactly (not the
        `diffCompoundField` pattern used by Motif Length/Note Variance)

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` — new broadcast-wiring
        assertion
  - [ ] `npm run build:types` passes for this file

  **Dependencies:** Task 13, Task 14, Task 15.

  **Files:** `src/components/company/CompanyOptionsSection.tsx`,
  `src/components/company/CompanyOptionsSection.test.tsx`

  **Estimated scope:** S (1 file + its test)

### Checkpoint: UI Wiring

- [x] `npm run build:types` — zero errors.
- [x] `npm run lint` — zero errors.
- [x] `npm test` — full suite green (1733/1733 — even the previously-flaky idleSystem test passed
      this run).
- [ ] `npm run build` — production bundle builds cleanly (verified at the Phase 3 checkpoint;
      not re-run since, no reason to expect a UI-only change to break it).
- [ ] Manual check in `npm run dev`: not performed — outside the scope of this automated
      implementation pass. Deferred to human review.
- [ ] Review with human before proceeding to Phase 5.

### Phase 5: Docs

- [x] **Task 18: `docs/MELODY_SYSTEM.md` — document the tail-cell fix and Pitch Repeat**

  **Description:** Add the tail-cell pass under "Rhythm model" and a new "Pitch Repeat" section
  describing `computePitchLockPlan`'s staged/seeded algorithm, per spec §2.

  **Acceptance criteria:**
  - [ ] "Rhythm model" section documents that non-divisor `rhythmicMotifLength.value`s (`3, 5, 6,
        7`) now produce a partial tail cell instead of dropping the leftover steps
  - [ ] New "Pitch Repeat" section documents: the `0–100` field, the gating rule, the two seeded
        permutations (position order, repeat order), the staged/monotonic ramp, and the
        `pitchLocked` flag's role in the docking re-roll

  **Verification:**
  - [ ] Manual review — doc accurately describes the shipped implementation (re-read against the
        final `melodyGenerator.ts`, not just this plan)

  **Dependencies:** Tasks 1–17 (documents shipped behavior).

  **Files:** `docs/MELODY_SYSTEM.md`

  **Estimated scope:** XS (1 file, docs-only)

### Checkpoint: Complete

- [x] Every task's acceptance criteria met (3 deviations from the plan documented inline at Tasks
      3, 4, and 11 above).
- [x] `npm run build:types && npm run lint && npm test && npm run build` — all clean, run together
      as the final gate (below).
- [x] Every Success criterion in `docs/specs/PITCH_REPEAT.md` §1 (via the intent doc) verified via
      the automated test suite: slider=0 indistinguishable (Task 6's dedicated tests), slider=100
      full verbatim repetition (Task 5's + Task 6's dedicated tests), monotonic intermediate
      locking (Task 5's 0-100 sweep test), coordinate-seeded per-robot variation (Task 9's seeded
      spawn test), docking behavior at both extremes (Task 11's dedicated tests). Not separately
      re-verified by manual play-testing in `npm run dev` — deferred to human review per the
      Phase 4 checkpoint note above.
  - [x] Tail-cell values (`M ∈ {3,5,6,7}`) specifically covered — Task 4's dedicated tests, and
        Task 5's `computePitchLockPlan` tail-repeat-exclusion test (`M=6`).
- [x] Ready for review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tail-cell fix changes onset counts for existing spawned robots (non-divisor motif lengths), shifting a shared system beyond Pitch Repeat's own scope | Med | Explicitly called out in spec §1/§3 as a deliberate, bundled change; Task 4's acceptance criteria require the evenly-dividing lengths (`1,2,4,8`) to be byte-for-byte unaffected, containing the blast radius to exactly the documented set |
| Floating-point stage-boundary math in `computePitchLockPlan` under-locks at `pitchRepeatPct: 100` | Med | Resolved up front in Architecture Decisions §7.3 with an explicit short-circuit guard, made a required acceptance criterion on Task 6 rather than left to incidental behavior |
| `RobotMelodyEvent` (melodyGenerator.ts) / `MelodyEvent` (types/Robot.ts) duplication means `pitchLocked` must be kept in sync by hand in two places | Low | Task 2's acceptance criteria require a doc comment flagging the duplication explicitly, so a future edit to one doesn't silently skip the other |
| Base-cell events re-rolling on dock can leave a locked copy audibly stale until the next full regeneration (§7.1) | Low | Accepted deliberately per Architecture Decisions §7.1; self-heals on next `regenerateMelody`/coordinate change; revisit only if it proves audible in practice |

## Open Questions

None remaining — all five of spec §7's open questions were resolved in Architecture Decisions above
before this task list was written.
