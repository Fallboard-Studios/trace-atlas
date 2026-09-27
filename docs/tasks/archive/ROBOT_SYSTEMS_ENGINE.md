# Implementation Plan: Robot Systems Engine (Roadmap Phase 7)

Source spec: [docs/specs/ROBOT_SYSTEMS_ENGINE.md](../specs/ROBOT_SYSTEMS_ENGINE.md). Source intent: [docs/intent/robot-systems-engine.md](../intent/robot-systems-engine.md).

## Overview

Build the pure Battery/Docking/Job domain models and state machines (`src/systems/robotSystems.ts`,
new), wire them into locale load and the two existing systems that need docking-awareness
(`idleSystem.ts`, `collisionSystem.ts`), and retire the dynamic spawn/despawn/persistence
scaffolding they replace (`spawnSystem.ts`'s scheduler, `removeSystem.ts`, `persists`, "+ New
Robot"). The scope matches spec §2's file list exactly; this plan sequences it and resolves spec
§7's six open questions before any task is written.

## Architecture Decisions

Resolving spec §7's open questions up front, not during implementation:

- **§7.1 — Field naming, adopted as final.** `docking: DockingState`, `dockingHoldUntilMeasure?:
  number`, `batteryLevel: number`, `job?: { type: JobType; assignedAtMeasure: number }`, exactly as
  spec §4 proposed. No further bikeshedding during implementation.
- **§7.2 — Departing→Docked is an instant position snap, no exit animation.** Matches the
  confirmed "hard mute, no fade" simplicity for audio — `removeSystem.ts`'s exit-swim logic is
  deleted wholesale (see §7.4 below), not repurposed. This is a real design choice, not a
  placeholder: revisit only if a future phase explicitly asks for a docking exit animation.
- **§7.3 — `spawnSystem.ts` keeps its filename and its exported function name (`spawnRobot`).**
  No rename to `createRobot` — the function's *behavior* changes (scheduler/min-max logic
  removed, `docking`/`batteryLevel` params added) but renaming it adds diff noise for no
  behavioral gain. The file keeps creating robots; "spawn" in the roster-creation sense (not the
  dynamic-timer sense) is still an accurate name.
- **§7.4 — `removeSystem.ts` and `removeSystem.test.ts` are deleted outright** once nothing
  references `removeRobotWithExit` (Task 14, after Task 12 removes its only caller). No empty
  placeholder file — nothing in this repo's convention keeps dead scaffolding around for a
  hypothetical future phase.
- **§7.5 — `docs/ROBOT_LIFECYCLE.md`'s content is written in Task 19**, against the final shipped
  API, not drafted speculatively now.
- **§7.6 — Dock-position and pitch-drift seeding scheme.** `robotSystems.ts` gets its own
  module-level `dockCycleCounters: Map<string, number>` (keyed by robot ID), incremented every
  time a robot lands on `Docked` — the same pattern `idleSystem.ts`'s `idleMoveCounters` and
  `spawnSystem.ts`'s `spawnCounters` already use. That counter is the `getSeededVal` offset for
  both `'robot.dock.pos'` (fed into `generateSpawnPosition`) and `'robot.pitchDrift'` (fed into a
  closure-counter `rand` for `reRollMelodyPitches`, mirroring `spawnSystem.ts`'s existing
  `melodyRand` closure exactly — see spec §4).
- **New: no import cycle between `robotSystems.ts` and `spawnSystem.ts`.** `robotSystems.ts`
  imports `generateSpawnPosition` from `spawnSystem.ts` (one-directional — it's a general
  "pick a position outside the viewBox" utility, not spawn-specific in behavior). `spawnSystem.ts`
  never imports from `robotSystems.ts`. Consequence: `spawnInitialRoster` (Task 12) creates all 12
  robots with `docking`/`batteryLevel` set but **no `job`** yet — `worldTransition.ts`'s
  `initializeLocale` (Task 15), which already imports both systems modules, calls
  `robotSystems.ts`'s `assignJob` once per initially-`Active` robot immediately after
  `spawnInitialRoster` returns. `robotSystems.ts`'s own `landOnActive` (used for every *later*
  Docking→Active transition) still calls `assignJob` internally — only the spawn-time path is
  relocated to the orchestrator, for exactly the same reason `worldTransition.ts` already
  orchestrates `placeFactories` + `spawnRobot` + `startSpawnScheduler` today rather than any one
  systems module calling another.
- **`spawnRobot`'s `reserveVoice`/`registerRobotMelody` calls become conditional** on
  `docking === DockingState.Active` — a robot created `Docked` gets no voice reserved and no
  melody registered until it actually lands on `Active` for the first time.

## Dependency Graph

```
Task 1 (types/Robot.ts)  ──┬──→ Task 2 (constants/index.ts — needs JobType)
                             │
Task 3 (types/locale.ts) ───┤ (independent of 1/2)
                             │
Task 4 (melodyGenerator.ts: reRollMelodyPitches) ──→ Task 5 (its test)
                             │
                             ├──→ Task 6 (robotSystems.ts: battery/docking tick)
                             │         │
                             │         ├──→ Task 7 (robotSystems.ts: job scoring/assignment)
                             │         │         │
                             │         │         └──→ Task 8 (robotSystems.ts: landing effects,
                             │         │                       needs Task 4's reRollMelodyPitches
                             │         │                       + spawnSystem's generateSpawnPosition)
                             │         │                   │
                             │         │                   └──→ Task 9 (robotSystems.test.ts)
                             │         │
                             ├──→ Task 10 (idleSystem.ts guard + test)      ┐ parallel-safe
                             └──→ Task 11 (collisionSystem.ts guard + test) ┘ with each other
                                       │
                                       └──→ (both need DockingState from Task 1 only)

Task 9 + Task 10 + Task 11 ──→ Checkpoint: Core Engine
                                       │
Task 7 (assignJob) + Task 2 (INITIAL_ACTIVE_ROBOTS_MIN/MAX) ──→ Task 12 (spawnSystem.ts retirement
                                       │                                  + spawnInitialRoster)
                                       │                                  │
                                       │                                  ├──→ Task 13 (its test)
                                       │                                  ├──→ Task 14 (delete
                                       │                                  │     removeSystem.ts —
                                       │                                  │     its only caller is
                                       │                                  │     now gone)
                                       │                                  └──→ Task 15
                                       │                                        (worldTransition.ts
                                       │                                        rewiring + initial
                                       │                                        assignJob loop +
                                       │                                        its test)
                                       │
Task 1 (persists removed) ───────────────────────→ Task 16 (RobotMetaTab.tsx + test)
Task 12 (spawnRobot signature change) ───────────→ Task 17 (RobotsTab.tsx + test)
Task 1 + Task 2 ──────────────────────────────────→ Task 18 (localeStore.ts batteryLevel clamp + test)

Tasks 1–18 ──→ Task 19 (docs: ROBOT_LIFECYCLE.md, UI_SHELL.md, CLAUDE.md, roadmap.md)
```

Tasks 6–9 (`robotSystems.ts` + its test) form one sequential chain within a single new file — no
parallelization within it. Tasks 10 and 11 are parallel-safe with each other and depend only on
Task 1. Tasks 16, 17, and 18 are parallel-safe with each other once their respective dependencies
land.

## Task List

### Phase 1: Foundation

- [x] **Task 1: `src/types/Robot.ts` — new state machines, new fields, remove `persists`**

  **Description:** Add `DockingState` and `JobType` const-objects matching `RobotState`'s exact
  pattern; add `docking`, `dockingHoldUntilMeasure`, `batteryLevel`, `job` to `Robot`; remove
  `persists`.

  **Acceptance criteria:**
  - [x] `DockingState = { Docked: 'docked', Docking: 'docking', Departing: 'departing', Active:
    'active' } as const` + derived `DockingState` type, same shape as `RobotState` (`Robot.ts:14-21`)
  - [x] `JobType = { VentExtraction: 'ventExtraction', AcousticSurvey: 'acousticSurvey',
    StructuralInspection: 'structuralInspection', FluidMonitoring: 'fluidMonitoring' } as const` +
    derived type
  - [x] `Robot.docking: DockingState` (required, not optional — every robot has a docking state
    from creation)
  - [x] `Robot.dockingHoldUntilMeasure?: number`
  - [x] `Robot.batteryLevel: number` (required, 0–100)
  - [x] `Robot.job?: { type: JobType; assignedAtMeasure: number }`
  - [x] `Robot.persists?: boolean` removed entirely

  **Verification:**
  - [x] `npm run build:types` — expect NEW errors everywhere `persists` was read/written
    (`RobotMetaTab.tsx`, `spawnSystem.ts`) and everywhere a `Robot` literal is constructed without
    the new required fields (`spawnSystem.ts`); expected until Tasks 12/16 land, not a defect here
  - [x] `npm run lint` clean for `types/Robot.ts` itself

  **Dependencies:** None.

  **Files:** `src/types/Robot.ts`, `src/engine/AudioEngine.test.ts`, `src/systems/interactionSystem.test.ts`
  (discovered via `npm run build:types` after the type change — these two test files build a
  `Robot` fixture but aren't otherwise touched by any later task, so their one-line
  `docking`/`batteryLevel` fixture additions are folded into this task rather than left as an
  untracked gap)

  **Estimated scope:** XS (3 files, two of which are one-line fixture additions)

- [x] **Task 2: `src/constants/index.ts` — new Battery/Docking/Job constants**

  **Description:** Add the numeric constants `tickRobotLifecycle`/`spawnInitialRoster`/
  `scoreJobAffinities` depend on, and update `MAX_ROBOTS`'s doc comment.

  **Acceptance criteria:**
  - [x] `INITIAL_ACTIVE_ROBOTS_MIN = 2`, `INITIAL_ACTIVE_ROBOTS_MAX = 4`
  - [x] `BATTERY_DRAIN_BASE = 2`
  - [x] `JOB_BATTERY_DRAIN_SURCHARGE: Record<JobType, number> = { ventExtraction: 1,
    acousticSurvey: 3, structuralInspection: 5, fluidMonitoring: 7 }` (imports `JobType` from
    `types/Robot.ts`)
  - [x] `BATTERY_RECHARGE_RATE = 5`
  - [x] `BATTERY_CRITICAL_THRESHOLD = 10`, `BATTERY_FULL_THRESHOLD = 100`
  - [x] `DOCKED_PITCH_DRIFT_RATIO = 0.25`
  - [x] `JOB_MAX_ROBOTS_PER_TYPE = 3`
  - [x] `MAX_ROBOTS`'s doc comment describes it as "fixed roster size" rather than "ceiling"

  **Verification:**
  - [x] `npm run build:types` passes for `constants/index.ts` itself
  - [x] `npm run lint` clean for `constants/index.ts`

  **Dependencies:** Task 1 (needs `JobType`).

  **Files:** `src/constants/index.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 3: `src/types/locale.ts` — trim `LocaleSettings`**

  **Description:** Remove the four fields that only existed to configure the retired dynamic
  spawn scheduler.

  **Acceptance criteria:**
  - [x] `maxRobots`, `minRobots`, `autoSpawn`, `spawnFrequency` removed from `LocaleSettings`
  - [x] The `[key: string]: unknown` index signature stays (other settings, e.g. `bpm`, are
    unaffected)

  **Verification:**
  - [x] `npm run build:types` — no new errors expected: `LocaleSettings`' `[key: string]: unknown`
    index signature means `constants/index.ts`'s `DEFAULT_LOCALE` and `worldTransition.ts`'s
    `buildLocale` (both still construct the old `settings` shape) type-check without complaint even
    though the named fields are gone; actual removal of the stale fields from those two literals is
    still Task 15's job, just not compiler-enforced in between
  - [x] `npm run lint` clean for `types/locale.ts`

  **Dependencies:** None (parallel-safe with Tasks 1–2).

  **Files:** `src/types/locale.ts`

  **Estimated scope:** XS (1 file)

### Checkpoint: Foundation

- [x] `npm run build:types` shows only the expected downstream errors (files later tasks haven't
  touched yet) — no *unexpected* errors elsewhere.
- [x] `npm run lint` passes on the three touched files.

### Phase 2: Melody Pitch-Drift Helper

- [x] **Task 4: `src/engine/melodyGenerator.ts` — add `reRollMelodyPitches`**

  **Description:** New exported function re-rolling a seeded ratio of a melody's `noteIndex`
  values, reusing the already-exported `pickRandomIndices` and `pickWeightedIndex` — no new
  selection logic invented, per spec §4.

  **Acceptance criteria:**
  - [x] `reRollMelodyPitches(melody, ratio, opts: { noteVariance?: ToggleValue; rand: () => number
    })` exported
  - [x] Number of events changed = `Math.max(1, Math.round(melody.length * ratio))`
  - [x] Changed events selected via `pickRandomIndices` (existing export, line 124) — not a new
    shuffling implementation
  - [x] `noteVariance?.active === true` → new `noteIndex` via `pickWeightedIndex(rand)` (existing
    export, line 480); `false`/absent → `Math.floor(rand() * 8)` (unweighted)
  - [x] `startStep`, `length`, and `octave` are identical on every returned event, including
    changed ones — only `noteIndex` differs
  - [x] Unchanged events are the exact same object reference or a shallow-equal copy (caller
    shouldn't need to care which, but no unrelated field is mutated)

  **Verification:**
  - [x] `npm run build:types` passes for `melodyGenerator.ts` itself
  - [x] `npm run lint` clean

  **Dependencies:** None (independent of Foundation; parallel-safe with Tasks 1–3).

  **Files:** `src/engine/melodyGenerator.ts`

  **Estimated scope:** XS (1 file, small self-contained function)

- [x] **Task 5: `src/engine/melodyGenerator.test.ts` — test `reRollMelodyPitches`**

  **Description:** New describe block covering the ratio math, seeded determinism, and the
  rhythm-untouched guarantee.

  **Acceptance criteria:**
  - [x] Given a fixed `rand` seed, exactly `Math.round(melody.length * 0.25)` events (floor 1)
    have a different `noteIndex` than the input; all others are unchanged
  - [x] `startStep`/`length`/`octave` unchanged on every event, including re-rolled ones (assert
    across the whole melody, not just spot-checked)
  - [x] `noteVariance: { active: false }` produces picks in `[0,8)` with no weighting assumption
    baked into the assertion beyond range
  - [x] `noteVariance: { active: true, value: N }` produces picks that are valid `pickWeightedIndex`
    outputs (i.e. never asserts an impossible index)
  - [x] A 1-event melody with `ratio: 0.25` still changes exactly 1 event (floor-of-1 regression)

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts` — all passing
  - [x] `npm run build:types` passes for the test file

  **Dependencies:** Task 4.

  **Files:** `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** XS (1 file)

### Phase 3: `robotSystems.ts` — the core deliverable

- [x] **Task 6: `src/systems/robotSystems.ts` — battery tick + docking transitions**

  **Description:** New file. Implements the per-measure battery drain/recharge math and the
  threshold-triggered `Docking`/`Departing` state entry (hold-until-next-measure), plus the
  `startRobotLifecycle`/`stopRobotLifecycle`/`tickRobotLifecycle` scaffolding. Landing effects
  (Task 8) and job assignment (Task 7) are stubbed as no-ops or TODOs at this point — this task is
  the pure state-machine skeleton only.

  **Acceptance criteria:**
  - [x] `tickRobotLifecycle(localeId, measure)` exported, pure with respect to its inputs (reads/
    writes only via `useLocaleStore`)
  - [x] `Active` robots: `batteryLevel` decreases by `BATTERY_DRAIN_BASE +
    JOB_BATTERY_DRAIN_SURCHARGE[job.type]` (0 surcharge if no job yet) per tick, floored at 0
  - [x] `Docked` robots: `batteryLevel` increases by `BATTERY_RECHARGE_RATE` per tick, capped at 100
  - [x] `Active` robot crossing `≤ BATTERY_CRITICAL_THRESHOLD` → `docking: Departing`,
    `dockingHoldUntilMeasure: measure + 1` (not immediately `Docked`)
  - [x] `Docked` robot crossing `≥ BATTERY_FULL_THRESHOLD` → `docking: Docking`,
    `dockingHoldUntilMeasure: measure + 1` (not immediately `Active`)
  - [x] `Docking`/`Departing` robot with `measure >= dockingHoldUntilMeasure` → lands on
    `Active`/`Docked` respectively (calling stub `landOnActive`/`landOnDocked` functions — full
    bodies land in Task 8), clearing `dockingHoldUntilMeasure`
  - [x] `startRobotLifecycle(localeId)` / `stopRobotLifecycle()` exported, module-singleton pattern
    identical to `spawnSystem.ts`'s current `startSpawnScheduler`/`stopSpawnScheduler` (one active
    `subscribeToMeasure` unsubscribe-function stored in module state; idempotent start; safe
    repeated stop)
  - [x] Uses `subscribeToMeasure` from `beatClock.ts` — no `setTimeout`/`setInterval`

  **Verification:**
  - [x] `npm run build:types` passes for `robotSystems.ts` itself (its test is Task 9)
  - [x] `npm run lint` clean

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/systems/robotSystems.ts`

  **Estimated scope:** S (1 file, concentrated new logic)

- [x] **Task 7: `src/systems/robotSystems.ts` — job affinity scoring + assignment**

  **Description:** Add `scoreJobAffinities` (pure) and `assignJob` (store-writing) to the same
  file, per spec §1's four job profiles.

  **Acceptance criteria:**
  - [x] `scoreJobAffinities(robot): Record<JobType, number>` exported, pure — same robot
    attributes in, same scores out
  - [x] Vent Extraction scores highest for low-register (`octaveRange` skewed low), dense
    (`rhythmicDensity` high), short-motif, low-`noteVariance` robots
  - [x] Acoustic Survey scores highest for high-register, sparse, long/inactive-motif,
    high/unrestricted-variance robots
  - [x] Structural Inspection scores highest for wide `octaveRange` span, mid-length motifs,
    balanced density
  - [x] Fluid Monitoring scores highest for mid-register, default/mid density and variance
  - [x] `assignJob(localeId, robotId)` exported: sorts the four types by score descending, skips
    any type already at `JOB_MAX_ROBOTS_PER_TYPE` active assignments in that locale, writes the
    first available type + `assignedAtMeasure: getCurrentMeasure()` to the robot's `job` field via
    `updateRobot`
  - [x] All scoring inputs are the robot's already-stored, already-seeded attributes — no new
    `Math.random`/`getSeededVal` call introduced for scoring itself (the *inputs* were seeded at
    spawn; the *scoring function* is deterministic arithmetic, no additional randomness)

  **Verification:**
  - [x] `npm run build:types` passes for `robotSystems.ts`
  - [x] `npm run lint` clean

  **Dependencies:** Task 6 (same file, sequenced to avoid concurrent edits).

  **Files:** `src/systems/robotSystems.ts`

  **Estimated scope:** S (same file, additive)

- [x] **Task 8: `src/systems/robotSystems.ts` — landing effects**

  **Description:** Implement `landOnActive`/`landOnDocked` for real (replacing Task 6's stubs):
  audio mute/unmute, idle-wander restart, dock positioning, and pitch drift.

  **Acceptance criteria:**
  - [x] `landOnActive`: sets `docking: Active`, clears `dockingHoldUntilMeasure`; calls
    `AudioEngine.reserveVoice`/`registerRobotMelody` (guarded the same way `spawnSystem.ts`
    already guards — only if `audioAttributes.layers` is a non-empty array); calls `assignJob`
    (Task 7); calls `handleRobotIdle(localeId, robotId)` (imported from `idleSystem.ts`) to restart
    wandering, since `Robot.tsx` only calls it on mount
  - [x] `landOnDocked`: sets `docking: Docked`, clears `dockingHoldUntilMeasure`; increments this
    robot's `dockCycleCounters` entry; repositions via `generateSpawnPosition(noiseMap,
    dockCycleCount)` (imported from `spawnSystem.ts` — see Architecture Decisions' no-cycle note);
    re-rolls melody via `reRollMelodyPitches(robot.melody, DOCKED_PITCH_DRIFT_RATIO, { noteVariance:
    robot.noteVariance, rand: <seeded closure keyed 'robot.pitchDrift', per Architecture
    Decisions> })`; calls `AudioEngine.releaseVoice`/`unregisterRobotMelody`
  - [x] `dockCycleCounters: Map<string, number>` is module state, not persisted to the store
  - [x] No `AudioEngine` method is called that doesn't already exist on its public surface (no new
    capability)

  **Verification:**
  - [x] `npm run build:types` passes for `robotSystems.ts`
  - [x] `npm run lint` clean

  **Dependencies:** Task 4 (`reRollMelodyPitches`), Task 6, Task 7 (`assignJob`).

  **Files:** `src/systems/robotSystems.ts`

  **Estimated scope:** S (same file, additive — ties the module together)

- [x] **Task 9: `src/systems/robotSystems.test.ts` — full test suite**

  **Description:** New test file covering Tasks 6–8's combined behavior, per spec §5's
  `robotSystems.test.ts` coverage list.

  **Acceptance criteria:**
  - [x] Drain math correct for all four job types plus the no-job case (0 surcharge)
  - [x] Recharge math correct, clamped at 100
  - [x] Critical-threshold crossing → `Departing` with `dockingHoldUntilMeasure`, not immediate
    `Docked`
  - [x] Full-threshold crossing → `Docking` with `dockingHoldUntilMeasure`, not immediate `Active`
  - [x] Hold-elapsed → lands on `Active`/`Docked`, `dockingHoldUntilMeasure` cleared
  - [x] Landing on `Active`: `reserveVoice`/`registerRobotMelody` called (spy/mock `AudioEngine`),
    `job` assigned, `handleRobotIdle` invoked (spy/mock `idleSystem`)
  - [x] Landing on `Docked`: `releaseVoice`/`unregisterRobotMelody` called, position off-screen,
    ~25% of `noteIndex` values changed, rhythm fields unchanged
  - [x] `scoreJobAffinities` deterministic; each profile scores highest for a robot matching its
    description
  - [x] `assignJob` respects `JOB_MAX_ROBOTS_PER_TYPE` — 4th robot for an already-full job type
    gets its next-best available type
  - [x] `startRobotLifecycle`/`stopRobotLifecycle` idempotent, matching `spawnSystem.test.ts`'s
    existing scheduler-lifecycle test style (before this phase deletes those specific tests in
    Task 13)

  **Verification:**
  - [x] `npx vitest run src/systems/robotSystems.test.ts` — all passing
  - [x] `npm run build:types` passes for the test file

  **Dependencies:** Task 8.

  **Files:** `src/systems/robotSystems.test.ts`

  **Estimated scope:** M (1 file, broad coverage)

### Phase 4: Existing-System Docking Guards

- [x] **Task 10: `src/systems/idleSystem.ts` — docking guard**

  **Description:** `handleRobotIdle` must no-op for non-`Active` robots so a `Docked` robot never
  wanders off its dock position.

  **Acceptance criteria:**
  - [x] Early-return condition becomes `!robot || robot.state !== RobotState.Idle ||
    robot.docking !== DockingState.Active`
  - [x] No other logic in the file changes

  **Verification:**
  - [x] `npx vitest run src/systems/idleSystem.test.ts` — all passing, including new test below
  - [x] `npm run build:types` passes

  **Dependencies:** Task 1 (`DockingState`).

  **Files:** `src/systems/idleSystem.ts`, `src/systems/idleSystem.test.ts`

  **Estimated scope:** XS (2 files, one-line guard + one test)

- [x] **Task 11: `src/systems/collisionSystem.ts` — docking guard**

  **Description:** `canInteract` must exclude non-`Active` robots so a `Docked` (muted) robot is
  never flagged into an audible `triggerInteraction` by the ticker, which iterates every robot in
  the store regardless of render state.

  **Acceptance criteria:**
  - [x] `validState` becomes `(robot.state === RobotState.Idle || robot.state ===
    RobotState.Moving) && robot.docking === DockingState.Active`
  - [x] No other logic in the file changes

  **Verification:**
  - [x] `npx vitest run src/systems/collisionSystem.test.ts` — all passing, including new test below
  - [x] `npm run build:types` passes

  **Dependencies:** Task 1 (parallel-safe with Task 10).

  **Files:** `src/systems/collisionSystem.ts`, `src/systems/collisionSystem.test.ts`

  **Estimated scope:** XS (2 files, one-line guard + one test)

### Checkpoint: Core Engine

- [x] `npm test` passes for `robotSystems.test.ts`, `melodyGenerator.test.ts`, `idleSystem.test.ts`,
  `collisionSystem.test.ts`.
- [x] `npm run build:types` passes for every file touched in Phases 1–4 (`spawnSystem.ts`,
  `worldTransition.ts`, and the UI files remain broken until Phases 5–6 — expected).
- [x] Manual/unit spot check: calling `tickRobotLifecycle` repeatedly against a hand-built `Active`
  robot with a critical-drain job drives it to `Departing` then `Docked` within the expected number
  of ticks.

### Phase 5: Roster Creation Retirement

- [x] **Task 12: `src/systems/spawnSystem.ts` — remove scheduler, add `spawnInitialRoster`**

  **Description:** Remove `startSpawnScheduler`/`stopSpawnScheduler`/`SPAWN_INTERVAL_MIN/MAX` and
  the min/max "bounce" branch in `spawnRobot`; remove `persists: false` from the constructed
  `Robot`; add `docking`/`batteryLevel` handling to `spawnRobot`; add new `spawnInitialRoster
  (localeId)` looping 12× with the seeded 2–4-active/rest-docked split; remove
  `reRegisterAllRobotsAudio`/`removeNonPersistentRobots` (no more power-cycle removal).

  **Acceptance criteria:**
  - [x] `startSpawnScheduler`, `stopSpawnScheduler`, `SPAWN_INTERVAL_MIN`, `SPAWN_INTERVAL_MAX`
    removed
  - [x] `spawnRobot`'s min/max "bounce" branch (the `if (robots.length >= maxRobots) { ... }`
    block) removed
  - [x] `spawnRobot` accepts `docking: DockingState` and `batteryLevel: number` (or computes them
    internally when called by `spawnInitialRoster` — implementer's choice, but the constructed
    `Robot` always has both set, never defaulted implicitly)
  - [x] `spawnRobot`'s `AudioEngine.reserveVoice`/`registerRobotMelody` calls are conditional on
    `docking === DockingState.Active` — a robot created `Docked` gets neither
  - [x] `persists: false` removed from the constructed `Robot` literal
  - [x] `spawnInitialRoster(localeId)` exported: creates exactly `MAX_ROBOTS` (12) robots; a
    seeded count in `[INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]` are `Active`, the rest
    `Docked`; every `Docked` robot's `batteryLevel` is seeded and varied (not all identical, not
    all 100); does **not** assign jobs (per Architecture Decisions' no-cycle note — that's
    `worldTransition.ts`'s job in Task 15)
  - [x] `removeNonPersistentRobots` removed outright (no replacement — nothing is ever removed now).
    `reRegisterAllRobotsAudio` is **adapted, not removed** — see the "Scope discovered during
    implementation" note below; `powerController.ts` still calls it on power-on
  - [x] `import { removeRobotWithExit } from './removeSystem'` (if present) removed — its only
    call site was the deleted bounce branch

  **Verification:**
  - [x] `npm run build:types` passes for `spawnSystem.ts` itself (its test is Task 13; callers in
    `worldTransition.ts`/`RobotsTab.tsx` remain broken until Tasks 15/17 — expected)
  - [x] `npm run lint` clean

  **Dependencies:** Task 1, Task 2, Task 7 (`assignJob` not called here, but `spawnRobot`'s
  shape must match what `robotSystems.ts` expects a freshly-created `Robot` to look like).

  **Files:** `src/systems/spawnSystem.ts`

  **Estimated scope:** M (1 file, but a large removal + a new function)

- [x] **Task 13: `src/systems/spawnSystem.test.ts` — rewrite for the new roster model**

  **Description:** Remove scheduler/min-max/bounce/persists tests; add coverage for
  `spawnInitialRoster`.

  **Acceptance criteria:**
  - [x] All `startSpawnScheduler`/`stopSpawnScheduler`/min-max-bounce/`persists`-related tests
    removed
  - [x] New test: `spawnInitialRoster` produces exactly 12 robots
  - [x] New test: the `Active` count falls within `[INITIAL_ACTIVE_ROBOTS_MIN,
    INITIAL_ACTIVE_ROBOTS_MAX]`
  - [x] New test: every `Docked` robot's `batteryLevel` is seeded (deterministic across two runs
    against the same coordinates) and not uniformly identical across the roster
  - [x] New test: `Docked` robots have no voice reserved / melody registered
    (`AudioEngine.getVoiceForRobot`/`getRegisteredMelody` empty); `Active` robots do
  - [x] Existing robot-ID-determinism tests (from Phase 6) still pass unmodified

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — all passing
  - [x] `npm run build:types` passes

  **Dependencies:** Task 12.

  **Files:** `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (1 file)

- [x] **Task 14: Delete `src/systems/removeSystem.ts` and `removeSystem.test.ts`**

  **Description:** Its only caller (`spawnSystem.ts`'s bounce branch) is gone as of Task 12 —
  remove the dead file pair outright, per Architecture Decisions §7.4.

  **Acceptance criteria:**
  - [x] `src/systems/removeSystem.ts` deleted
  - [x] `src/systems/removeSystem.test.ts` — turned out not to exist (this plan's file list was
    wrong on that point; `removeSystem.ts` had no dedicated test file to delete)
  - [x] `grep -r "removeRobotWithExit\|from '.*removeSystem'" src` returns nothing

  **Verification:**
  - [x] `npm run build:types` — no new errors (confirms nothing still imports from the deleted file)
  - [x] `npm run lint` clean project-wide

  **Dependencies:** Task 12.

  **Files:** `src/systems/removeSystem.ts` (deleted), `src/systems/removeSystem.test.ts` (deleted)

  **Estimated scope:** XS (deletion only)

- [x] **Task 15: `src/systems/worldTransition.ts` — rewire locale bring-online**

  **Description:** Replace the two-`spawnRobot`-calls-plus-scheduler init sequence with
  `spawnInitialRoster` + `startRobotLifecycle`, add the initial `assignJob` loop for
  spawn-time-`Active` robots, and trim `buildLocale`'s `settings` shape to match Task 3's
  `LocaleSettings`.

  **Acceptance criteria:**
  - [x] `initializeLocale`'s `if (locale.robots.length === 0) { spawnRobot(localeId);
    spawnRobot(localeId); }` replaced with `if (locale.robots.length === 0) {
    spawnInitialRoster(localeId); }`
  - [x] Immediately after roster creation, every robot whose `docking === DockingState.Active` gets
    `robotSystems.ts`'s `assignJob(localeId, robot.id)` called once
  - [x] `stopSpawnScheduler()`/`startSpawnScheduler(localeId)` calls replaced with
    `stopRobotLifecycle()`/`startRobotLifecycle(localeId)`
  - [x] `buildLocale`'s `settings: { bpm: 60, maxRobots: 12, minRobots: 2, autoSpawn: true,
    spawnFrequency: 4 }` becomes `settings: { bpm: 60 }` (matching Task 3's trimmed
    `LocaleSettings`)
  - [x] `stores/localeStore.ts`'s `DEFAULT_LOCALE.settings` gets the same trim (correction from
    this plan's original draft, which misattributed this constant to `constants/index.ts` — it
    actually lives in `stores/localeStore.ts`; same shape, same need to update in this task to
    avoid a stray compile error)

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts` — all passing
  - [x] `npm run build:types` passes project-wide for every file touched so far (RobotsTab/
    RobotMetaTab remain broken until Tasks 16–17 — expected)

  **Dependencies:** Task 3, Task 12, Task 8 (needs `startRobotLifecycle`/`assignJob` to exist).

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`,
  `src/stores/localeStore.ts`

  **Estimated scope:** S (3 files, one of which is a one-line follow-up in an already-touched file)

  **Scope discovered during implementation — folded into this task:** grepping for
  `startSpawnScheduler`/`stopSpawnScheduler`/`removeNonPersistentRobots`/`reRegisterAllRobotsAudio`
  callers (not just definitions) surfaced two files spec §2 missed entirely: `powerController.ts`
  (power-off calls `stopSpawnScheduler()` + `removeNonPersistentRobots()`; power-on calls
  `reRegisterAllRobotsAudio()`, which filters by `r.persists`) and `OceanScene.tsx` (mount calls
  `initializeLocale`; unmount calls `stopSpawnScheduler()`). Both need the same `stopSpawnScheduler`
  → `stopRobotLifecycle` swap this task already does in `worldTransition.ts`, for the identical
  reason: `AudioEngine.killAll()` triggers `resetBeatClock()`, which silently clears every
  `subscribeToMeasure` listener — without an explicit `stopRobotLifecycle()` call to null out the
  module's own `lifecycleUnsubscribe` reference first, a later `startRobotLifecycle()` call would
  see it as "already running" and skip resubscribing, permanently killing the tick after the first
  power cycle. Additionally: `removeNonPersistentRobots()` has no replacement call (nothing is ever
  removed now) — just delete the call site — and `reRegisterAllRobotsAudio()`'s filter changes from
  `r.persists` to `r.docking === DockingState.Active` (every robot survives a power cycle now, but
  only currently-Active robots had a voice to lose when `AudioEngine.killAll()` ran, so only they
  need re-registering; Docked robots have no voice to restore).

  **Additional acceptance criteria (from the above):**
  - [x] `powerController.ts`: `stopSpawnScheduler` import/calls (in both `shutdown()` and
    `shutdownWithAnimation()`) replaced with `stopRobotLifecycle`; `removeNonPersistentRobots()`
    call sites deleted (both methods); `reRegisterAllRobotsAudio` import kept (same name — see
    Task 12's own note on this function), now filtering by `docking === DockingState.Active`
  - [x] `OceanScene.tsx`: `stopSpawnScheduler` import/call in the unmount cleanup replaced with
    `stopRobotLifecycle` (from `robotSystems.ts`)
  - [x] `powerController.test.ts`: `stopSpawnScheduler`/`removeNonPersistentRobots` mocks/assertions
    replaced with `stopRobotLifecycle`; the "removeNonPersistentRobots called" assertion deleted
    (nothing to assert — the call no longer exists)
  - [x] `OceanScene.test.tsx`: `stopSpawnScheduler` mock/assertion replaced with `stopRobotLifecycle`

  **Additional files:** `src/systems/powerController.ts`, `src/systems/powerController.test.ts`,
  `src/components/panels/screen/worldView/OceanScene.tsx`,
  `src/components/panels/screen/worldView/OceanScene.test.tsx`

### Checkpoint: Roster Creation Retirement

- [x] `npm test` passes for `spawnSystem.test.ts`, `worldTransition.test.ts`.
- [x] `npm run build:types` — only `RobotMetaTab.tsx`/`RobotsTab.tsx` (Phase 6) remain broken.
- [x] Manual check: `initializeLocale` on a fresh locale produces 12 robots with the documented
  active/docked split, no stray scheduler running.

### Phase 6: UI Removal + Store Clamp

- [x] **Task 16: `src/components/panels/screen/console/RobotMetaTab.tsx` — remove Persist**

  **Description:** Remove the Persist `Switch.Root` control and its supporting state/handlers;
  drop `persists` from the copy-robot optional-field list.

  **Acceptance criteria:**
  - [x] `currentPersists`/`persists`/`prevPersists`/`togglePersists` state and handler removed
  - [x] The Persist `row control-row` JSX block removed
  - [x] `performCopyFromTarget`'s `optFields` list no longer includes `persists` (it never did per
    spec — confirm it wasn't silently relying on the removed field)
  - [x] Name editing, Age display, and Copy Robot controls are otherwise unchanged

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotMetaTab.test.tsx` — all passing
  - [x] `npm run build:types` passes
  - [x] Manual check: render the tab, confirm no Persist row appears, Copy Robot still works

  **Dependencies:** Task 1 (`persists` removed from the type forces this).

  **Files:** `src/components/panels/screen/console/RobotMetaTab.tsx`,
  `src/components/panels/screen/console/RobotMetaTab.test.tsx` (this file didn't exist —
  `RobotMetaTab.tsx` had zero test coverage before this task; created new, scoped to the Persist
  removal plus a few smoke assertions on its neighboring controls, not full component coverage)

  **Estimated scope:** S (2 files)

- [x] **Task 17: `src/components/panels/screen/console/RobotsTab.tsx` — remove "+ New Robot"**

  **Description:** The roster is now fixed at 12 robots created once at locale load — remove the
  manual spawn button entirely.

  **Acceptance criteria:**
  - [x] `NEW_ROBOT_SCHEMA`, `handleNewRobot`, the `robots-tab__new-robot` wrapper div, and the
    `spawnRobot` import all removed
  - [x] The tab renders only the robot list (name buttons navigating to `selectRobot`)

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotsTab.test.tsx` — all passing
  - [x] `npm run build:types` passes
  - [x] Manual check: render the tab, confirm no "+ New Robot" button appears

  **Dependencies:** Task 12 (`spawnRobot`'s signature change would otherwise break this call site).

  **Files:** `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** XS (2 files, pure removal)

- [x] **Task 18: `src/stores/localeStore.ts` — clamp `batteryLevel`**

  **Description:** Add `batteryLevel` to `updateRobot`'s normalized-field clamp block.

  **Acceptance criteria:**
  - [x] `normalized.batteryLevel` clamped to `0–100` when present, following the existing
    `rhythmicDensity` clamp's exact style (`Math.max(0, Math.min(100, Math.trunc(...)))`)
  - [x] New test: `updateRobot` clamps `batteryLevel` outside `0–100`

  **Verification:**
  - [x] `npx vitest run src/stores/localeStore.test.ts` — all passing
  - [x] `npm run build:types` passes

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** XS (2 files)

### Checkpoint: Complete Implementation

- [x] `npm test` — all tests passing project-wide (1058/1058).
- [x] `npm run build:types` — zero errors project-wide. `grep -rn "\bmaxRobots\b\|\bminRobots\b\|
  autoSpawn\|startSpawnScheduler\|removeRobotWithExit" src` came back non-empty on the first pass —
  found real dead config (`maxRobots`/`minRobots` still being *set*, just never read, in
  `AudioEngine.test.ts` and `spawnSystem.test.ts`) plus one stale comment cross-reference to a
  since-renamed describe block; all cleaned up in this same pass rather than left as noise. The
  `persists` hits that remain are all legitimate (test names/comments asserting its *absence*, or
  historical-lineage doc comments in `robotSystems.ts`/`powerController.ts`).
- [x] `npm run lint` — zero errors project-wide.
- [x] `npm run build` — production bundle builds cleanly.
- [ ] Manual check (`npm run dev`): load a fresh locale, confirm exactly 12 robots exist in the
  store, 2–4 visibly `Active`/audible, the rest silent and off-screen; watch for several minutes
  and confirm at least one full `Active`→`Departing`→`Docked`→`Docking`→`Active` cycle occurs,
  matching § 5's manual-check description in the spec. **Not yet done — needs the human operator
  running the real dev server/browser, not something verifiable from the CLI alone.**
- [ ] Review with human before proceeding to docs.

### Phase 7: Docs

- [x] **Task 19: `docs/ROBOT_LIFECYCLE.md`, `docs/UI_SHELL.md`, `CLAUDE.md`, `docs/todo/roadmap.md`**

  **Description:** Document shipped behavior, per the roadmap's own Docs bullets and spec §7.5 —
  written against the final API, not the plan.

  **Acceptance criteria:**
  - [x] New `docs/ROBOT_LIFECYCLE.md`, in `docs/MELODY_SYSTEM.md`'s style, documents
    `DockingState`/`JobType`, the battery drain/recharge formula and thresholds, the
    up-to-one-measure hold, the pitch-drift mechanic, and `robotSystems.ts`'s full exported API
  - [x] `CLAUDE.md`'s reference doc list gains `docs/ROBOT_LIFECYCLE.md`
  - [x] `docs/UI_SHELL.md`'s `robotOptions` "Planned Replacement" point folded in; its "+ New
    Robot" reference in § Console Navigation updated to reflect the removal
  - [x] `docs/todo/roadmap.md` § 7's bullets marked resolved, mirroring the strikethrough+
    pointer pattern used for prior phases, pointing at `docs/specs/ROBOT_SYSTEMS_ENGINE.md`

  **Verification:**
  - [x] Manual proofread: every claim in `ROBOT_LIFECYCLE.md` spot-checked against the actually-
    shipped code (constants, function names, field names), not reconstructed from this plan
  - [x] Links resolve (relative paths correct)

  **Dependencies:** Tasks 1–18.

  **Files:** `docs/ROBOT_LIFECYCLE.md` (new), `docs/UI_SHELL.md`, `CLAUDE.md`,
  `docs/todo/roadmap.md`

  **Estimated scope:** S (4 files, text-only)

### Checkpoint: Complete

- [x] All acceptance criteria across Tasks 1–19 met.
- [x] Full verification suite green (`build:types`, `lint`, `test`, `build`).
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Import cycle between `robotSystems.ts` and `spawnSystem.ts` if job assignment is called from inside `spawnInitialRoster` | Medium | Resolved structurally in Architecture Decisions: `spawnInitialRoster` never calls `assignJob`; `worldTransition.ts` (Task 15) does, after roster creation returns |
| `collisionSystem.ts`'s ticker iterating all robots (not just rendered ones) is easy to miss since it's not obvious from the component tree | High if missed | Called out explicitly in spec §1/§2 and Task 11 — the one required change to already-shipping behavior, not left implicit |
| `spawnInitialRoster`'s seeded active/docked split accidentally collides in `getSeededVal` dataId with another spawn-time field, producing correlated (not independent) rolls | Low | Task 13's tests assert the split and battery levels are varied, not just present — would catch a degenerate all-2-or-all-4 pattern |
| Deleting `removeSystem.ts` (Task 14) before confirming no other caller exists | Low | Task 14's acceptance criteria includes a repo-wide grep, not just a build-passes check |
| `robotSystems.test.ts` (Task 9) mocking `AudioEngine`/`idleSystem` incorrectly, giving false-green landing-effect tests | Medium | Task 9 explicitly lists spy/mock assertions per effect (reserveVoice called, handleRobotIdle called) rather than only asserting store state, so a no-op mock would fail loudly |

## Open Questions

None remaining — spec §7's six items are resolved above under Architecture Decisions, plus one
additional import-cycle decision surfaced during planning itself (not present in the spec, since
it only becomes visible once file-level task boundaries are drawn).

## Post-Completion Revision: mute via `audioMode`, not voice release

After all 19 tasks shipped and while the user was manually testing, the mute mechanism was
revised: landing effects originally reserved/released the `AudioEngine` voice and registered/
unregistered the melody directly (§4's `landOnActive`/`landOnDocked` snippets). Changed instead to
set `Robot.audioMode` (`'none'`/`'mute'`) — the same field `RobotAudioTab.tsx`'s Audio Mode toggle
in Robot Options already writes to — so a user can independently override a Docked robot's mute
from the UI. This requires every robot's voice/melody to be reserved/registered unconditionally at
spawn (not gated on `docking === Active`), since an overridden mute needs a live synth to actually
produce sound. Touched: `robotSystems.ts` (`landOnActive`/`landOnDocked`), `spawnSystem.ts`
(`spawnRobot`'s registration + `audioMode` default, `reRegisterAllRobotsAudio`'s no-longer-filtered
re-registration on power-on), `robotSystems.test.ts`, `spawnSystem.test.ts`, and
`docs/ROBOT_LIFECYCLE.md`. TDD throughout (failing tests first for the new `audioMode` expectations
and the always-registered invariant, confirmed RED, then implemented). Full suite green after:
1064/1064 tests, zero lint/type errors, production build clean. No spec/plan-doc rewrite otherwise
— this section is the record of the deviation from the original design.

## Post-Completion Revision: battery-dim visuals, exit swim, never-zero-Active, bottom-only entry/exit

Four further rounds of manual-playtest feedback, each TDD'd (RED confirmed, then implemented) and
landed as its own commit:

- **Battery-dim windows/lights**: `robotVisualHelpers.ts`'s `computeBatteryDimOpacity` dims each
  robot shape's hardcoded-color Window/Viewport/Status-light elements as `batteryLevel` drops (25%
  dim ≤50%, 50% dim <25%, 90% dim ≤12% — `BATTERY_DIM_THRESHOLD_LOW/MID/CRITICAL`), following the
  same non-audio-brightness-overlay precedent as day/night lighting (see `ROBOT_DESIGN.md`).
- **Exit swim**: a `Departing` robot now visibly swims off-screen (`idleSystem.ts`'s
  `pickExitDestination`, `beginDeparting` in `robotSystems.ts`) instead of freezing wherever its
  last idle motion left it. The entrance side needed no new code — `landOnActive`'s existing
  `handleRobotIdle` call already animates from wherever the robot currently is.
- **Never-zero-Active invariant**: `tickRobotLifecycle` won't let the sole `Active` robot depart at
  critical battery — it's held `Active` (battery floors at 0) until another robot lands back on
  `Active`, re-checked fresh every tick so a same-tick race between two robots resolves correctly too.
- **Bottom-only entrance/exit + battery-confined wandering**: every robot now enters and exits
  exclusively via the bottom of the world view, always — `spawnSystem.ts`'s `generateSpawnPosition`
  dropped its 4-edge switch for straight-down-only (this is every robot's initial off-screen spot at
  locale load, Active or Docked, and what `landOnDocked` reuses for the dock resting spot);
  `pickExitDestination` exits straight down instead of nearest-edge; `beginDeparting` keeps the
  robot's current facing direction rather than recomputing one from a now-nonexistent horizontal
  component. `handleRobotIdle` gained `{ isReturning: true }` (passed by `Robot.tsx`'s mount effect
  and `landOnActive`) so a robot's first destination after surfacing stays in the bottom half
  (`BOTTOM_HALF_Y_RANGE`); independently, any robot below the new `BATTERY_LOWER_THIRD_THRESHOLD`
  (15%) has its idle wandering confined to the lower third (`LOWER_THIRD_Y_RANGE`) so it's already
  near the bottom by the time it actually departs. `pickDestination` gained an optional `yRange`
  param carrying both. See `ROBOT_LIFECYCLE.md`'s "Bottom-only, always" section for the full
  mechanics. Also fixed a latent gap in `vitest.setup.ts`'s GSAP mock — `delayedCall` didn't exist,
  which meant `handleRobotIdle`'s no-ref path (real code, no mocked `idleSystem`) would throw the
  first time a test actually reached it; added a non-auto-firing mock (auto-firing would recurse
  through the idle-wander self-scheduling loop with no real delay to throttle it).

Full suite green after each round; final state: 1088/1088 tests, zero lint/type errors, clean
`tsc --noEmit`. No spec/plan-doc rewrite beyond these revision notes.
