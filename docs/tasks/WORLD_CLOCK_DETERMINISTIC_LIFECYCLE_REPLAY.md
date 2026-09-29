# Implementation Plan: World Clock — Deterministic Lifecycle Replay

Source spec: [docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md](../specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md). Source intent: [docs/intent/world-clock-deterministic-lifecycle-replay.md](../intent/world-clock-deterministic-lifecycle-replay.md). Roadmap: [Phase 20.5](../todo/roadmap.md#205-world-clock-deterministic-lifecycle-replay).

## Overview

9 tasks across 4 phases. Phase 1 is two small, independent foundation pieces (the new `Locale.createdAtMeasure` field and its stamping). Phase 2 builds the pure lifecycle step function incrementally — battery/docking/job first (Task 3, the riskiest piece: the cross-robot "never zero Active" invariant), then melody drift layered on top (Task 4, which changes Task 3's signature by design — see Architecture Decisions). Phase 3 wires the step function into a headless replay loop and refactors the live tick to call it, then proves the two paths converge (the spec's load-bearing test). Phase 4 is the non-blocking audit and docs. No task wires this into Session Storage, Phase 21, or Phase 32 — that's explicitly out of scope for this phase.

## Architecture Decisions

Carried forward from spec §7, confirmed choices baked into task ordering below:

- **`stepRobotLifecycle`'s signature grows across Tasks 3→4** (`(roster, measure)` → `(roster, measure, noiseMap)`) rather than accepting an unused `noiseMap` parameter from the start — Task 3 has no use for it yet (melody drift isn't in scope until Task 4), and threading an unused parameter through would violate incremental-implementation's "don't add capability before it's needed." Task 4's own acceptance criteria include updating every Task 3 call site.
- **`Locale.currentMeasure` is left untouched, not repurposed** (spec §7 item 1) — `createdAtMeasure` is a new, distinctly-named field. Task 1's acceptance criteria include a regression guard that `currentMeasure`'s existing (if odd) behavior is unaffected.
- **`stepRobotLifecycle` requires a non-null `noiseMap`** (spec §7 item 2) — no `alea(...)` fallback ported from `landOnDocked`'s live defensive branch. Task 4's tests don't cover a null-noiseMap case for this reason; that's deliberate, not an oversight.
- **Dock-cycle count stays dual-tracked** (spec §7 item 4): the live path keeps using the module-global `dockCycleCounters` map (Task 6 reads from it when building a snapshot for `tickRobotLifecycle`, does not remove it), while `RobotLifecycleSnapshot.dockCycleCount` is replay's own equivalent, threaded through the snapshot rather than a shared mechanism. Not proposing a `Robot`-level field — out of proportion to this phase.
- **`landOnDocked`'s signature changes** (Task 6): it takes an already-drifted melody as a parameter instead of computing it via `reRollMelodyPitches` itself, since `stepRobotLifecycle` (Task 4) now owns that computation. This is a real, larger-than-a-clean-extraction diff to that function — flagged in spec risk 6, mitigated by Task 6's full-existing-suite-parity requirement.

## Definition of Done (every task)

- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] The task's focused tests pass; the **full suite** (`npm test`) passes at every checkpoint.
- [ ] `CLAUDE.md` PR checklist: no synths in components; no timelines/refs in Zustand state; no `setTimeout`/`setInterval` introduced anywhere in this phase's own code; state stays JSON-serializable (`RobotLifecycleSnapshot` is plain data throughout).
- [ ] Any new gate with a real failure mode (the invariant, melody-drift seeding, replay-vs-realtime convergence) is mutation-checked — break it, confirm the test fails, revert.
- [ ] One commit per task, tests with their code, message ends with this session's attribution line.

## Dependency Graph

```
Phase 1 — Foundation (parallel-safe)
Task 1 (types/locale.ts: createdAtMeasure)
        │
        ▼
Task 2 (worldTransition.ts: buildLocale stamps it)
                ── Checkpoint A: new field exists, stamped correctly, nothing else changed ──
Phase 2 — The pure step function, built incrementally
Task 3 (robotSystems.ts: RobotLifecycleSnapshot + stepRobotLifecycle -- battery/docking/job)
        │
        ▼
Task 4 (robotSystems.ts: stepRobotLifecycle -- + melody drift, dockCycleCount, noiseMap param)
                ── Checkpoint B: step function complete and proven in isolation ──
Phase 3 — Wiring + the load-bearing proof
Task 4 ──→ Task 5 (robotSystems.ts: replayLifecycle loop)
Task 4 ──→ Task 6 (robotSystems.ts: tickRobotLifecycle refactor + landOnDocked signature change)
Tasks 5, 6 ──→ Task 7 (robotSystems.test.ts: prove-it -- replay vs. realtime)
                ── Checkpoint C: feature complete, proven, zero live-behavior change ──
Phase 4 — Non-blocking audit + docs
Task 8 (audit findings -- independent, can run any time from Task 1 onward)
Tasks 1–7 ──→ Task 9 (docs)
                ── Checkpoint D: complete ──
```

Task 8 has no dependency on anything else in this plan and can be done whenever — first, last, or interleaved. It's listed last here only because it's least urgent.

## Task List

### Phase 1: Foundation

- [ ] **Task 1: `src/types/locale.ts` — add `Locale.createdAtMeasure`**

  **Description:** Add `createdAtMeasure: number` to the `Locale` interface, doc-commented per spec §4.1 — explicitly noting it is *not* the same as the adjacent `currentMeasure` field (spec §7 item 1: that field is dead/vestigial, never incremented by the real tick system; leave it completely untouched).

  **Acceptance criteria:**
  - [ ] `Locale` has a new required `createdAtMeasure: number` field with a doc comment distinguishing it from `currentMeasure`.
  - [ ] `currentMeasure`'s own field and doc comment (or lack thereof) are unchanged — a regression guard that this task didn't touch the field it's explicitly not repurposing.
  - [ ] No other file changes — this is a type-only addition; every construction site that will now fail to type-check is deliberately left broken until Task 2 (the only real constructor, `buildLocale`) fixes it.

  **Verification:**
  - [ ] `npm run build:types` — expected to **fail** after this task alone (no construction site sets the new required field yet); this is the intended, temporary RED state until Task 2 lands in the same session. Note in the commit message that Task 2 follows immediately.
  - [ ] `npm run lint` clean (lint doesn't touch type completeness).

  **Dependencies:** None.

  **Files:** `src/types/locale.ts`

  **Estimated scope:** XS (1 file)

- [ ] **Task 2: `src/systems/worldTransition.ts` — stamp `createdAtMeasure` in `buildLocale`**

  **Description:** `buildLocale` gains `createdAtMeasure: getCurrentMeasure()`, imported from `../engine/beatClock` (not currently imported in this file), at the same call site `dayStartTimestamp` is stamped (spec §4.3). This is the only place a `Locale` is ever constructed, so it's also what fixes Task 1's deliberate type-check break.

  **Acceptance criteria:**
  - [ ] `buildLocale`'s returned `Locale` has `createdAtMeasure` equal to `getCurrentMeasure()`'s value at call time.
  - [ ] `dayStartTimestamp`'s own stamping is unchanged (parity check — same formula, same inputs).
  - [ ] Every existing `worldTransition.test.ts` test still passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts`
  - [ ] `npm run build:types` clean (resolves Task 1's temporary break) — `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint A: New field exists, correctly stamped
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] Every `Locale` in the store has a real `createdAtMeasure` from the moment it's built; nothing else about locale construction changed.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: The pure step function

- [ ] **Task 3: `src/systems/robotSystems.ts` — `RobotLifecycleSnapshot` + `stepRobotLifecycle` (battery/docking/job)**

  **Description:** Per spec §4.2, minus the melody-drift piece (added in Task 4). Define `RobotLifecycleSnapshot` (`id`, `docking`, `batteryLevel`, `dockingHoldUntilMeasure?`, `job?`, `octaveRange`, `rhythmicDensity?`, `rhythmicMotifLength?`, `noteVariance?` — no `melody`/`dockCycleCount` yet). Define `stepRobotLifecycle(roster: RobotLifecycleSnapshot[], measure: number): RobotLifecycleSnapshot[]`, a pure reimplementation-by-extraction of `tickRobotLifecycle`'s per-robot arithmetic (`BATTERY_DRAIN_BASE`/`JOB_BATTERY_DRAIN_SURCHARGE`/`BATTERY_RECHARGE_RATE`/`BATTERY_CRITICAL_THRESHOLD`/`BATTERY_FULL_THRESHOLD`, the hold-measure landing check, `assignJob`'s balancing logic via `scoreJobAffinities`) and the "never zero Active" invariant, reusing the same constants and `scoreJobAffinities` — not reimplementing them. Purely additive: `tickRobotLifecycle` itself is untouched until Task 6.

  **Acceptance criteria:**
  - [ ] An `Active` robot's `batteryLevel` drops by `BATTERY_DRAIN_BASE` plus its job's `JOB_BATTERY_DRAIN_SURCHARGE` (0 if no job), floored at 0.
  - [ ] A `Docked` robot's `batteryLevel` rises by `BATTERY_RECHARGE_RATE`, capped at 100.
  - [ ] An `Active` robot at/under `BATTERY_CRITICAL_THRESHOLD` after drain transitions to `Departing` with `dockingHoldUntilMeasure = measure + 1` — *unless* it's the only `Active` robot in the roster, in which case it stays `Active` (battery still floors at/near 0).
  - [ ] A `Docked` robot at/over `BATTERY_FULL_THRESHOLD` after recharge transitions to `Docking` with `dockingHoldUntilMeasure = measure + 1`.
  - [ ] A `Docking` robot whose `dockingHoldUntilMeasure` has elapsed (`measure >= dockingHoldUntilMeasure`) lands on `Active`, with `job` assigned via the same type-balancing rule `assignJob` uses today (skips any type already at `JOB_MAX_ROBOTS_PER_TYPE` among other `Active` robots in the *post-step* roster), `dockingHoldUntilMeasure` cleared.
  - [ ] A `Departing` robot whose hold has elapsed lands on `Docked`, `dockingHoldUntilMeasure` cleared, `job` cleared.
  - [ ] The invariant check re-reads the *in-progress* working roster (an earlier robot's departure this same step already visible to a later robot's check), not a stale pre-step snapshot — a direct regression guard mirroring `tickRobotLifecycle`'s own existing comment about this.
  - [ ] `stepRobotLifecycle` imports neither `useLocaleStore` nor `getCurrentMeasure` — a static/structural check (no matching import statement), not just a behavioral one.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (independent of Phase 1).

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M (2 files, the riskiest arithmetic in this plan — the invariant and job-balancing logic both have real failure modes)

- [ ] **Task 4: `stepRobotLifecycle` — melody drift, `dockCycleCount`, `noiseMap` parameter**

  **Description:** Extends Task 3's function and type per spec §4.2's full design. `RobotLifecycleSnapshot` gains `melody: MelodyEvent[]` and `dockCycleCount: number` (starts at 0). `stepRobotLifecycle`'s signature becomes `(roster, measure, noiseMap: NoiseFunction2D)`. On a `Departing`→`Docked` landing specifically (not `Docking`→`Active`), increments `dockCycleCount` by 1 and drifts `melody` via the existing, already-pure `reRollMelodyPitches(melody, DOCKED_PITCH_DRIFT_RATIO, { noteVariance, rand })`, with `rand` seeded exactly as `landOnDocked` seeds it live: `getSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1)`, `callIndex` incrementing per `rand()` call within that one reroll. No `alea(...)` fallback for a null noise map (spec §7 item 2 — `noiseMap` is required, not optional).

  **Acceptance criteria:**
  - [ ] A `Departing`→`Docked` landing increments that robot's `dockCycleCount` by exactly 1; a `Docking`→`Active` landing does not touch `dockCycleCount` or `melody` at all.
  - [ ] The drifted melody matches what calling the real `reRollMelodyPitches` with the same seed formula produces — verified by computing the expected result independently in the test (not by calling `stepRobotLifecycle` twice and comparing to itself).
  - [ ] Two different robots that each dock once during the same step (or across a short multi-step sequence) end up with *different* drifted melodies — regression guard that `dockCycleCount`/seed isn't accidentally shared or collided across robots.
  - [ ] A robot that docks twice (two separate `Departing`→`Docked` landings across two calls) has its *second* drift applied on top of the *first* drift's result, not on top of the original pre-drift melody — regression guard for the cumulative-drift requirement.
  - [ ] A landing transition still never sets `position`/`audioMode`/`state`/`destination`/`direction` — regression guard carried forward from Task 3's scope boundary, now re-verified with melody in the mix.
  - [ ] Every Task 3 acceptance criterion still holds (battery/docking/job unaffected by this extension).

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M (2 files, seeding-formula fidelity is the real risk here)

### Checkpoint B: Step function complete and proven in isolation
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite, no new failures).
- [ ] `stepRobotLifecycle` alone — given any roster snapshot and a measure — reproduces every transition `tickRobotLifecycle` would make, provably via unit tests, with zero side effects.
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: Wiring + the load-bearing proof

- [ ] **Task 5: `replayLifecycle` — the headless loop**

  **Description:** Per spec §4.2: `replayLifecycle(roster: RobotLifecycleSnapshot[], fromMeasure: number, toMeasure: number, noiseMap: NoiseFunction2D): RobotLifecycleSnapshot[]`, calling `stepRobotLifecycle` once per measure from `fromMeasure + 1` through `toMeasure` inclusive. `toMeasure < fromMeasure + 1` is a no-op.

  **Acceptance criteria:**
  - [ ] `replayLifecycle(roster, 10, 10, noiseMap)` (and any `toMeasure < fromMeasure + 1`) returns the input roster unchanged (same values; reference equality not required, but zero transitions applied).
  - [ ] `replayLifecycle(roster, 0, N, noiseMap)` produces the identical result to calling `stepRobotLifecycle` N times in a hand-written loop (measures `1..N`) — a direct unit check of the loop's own correctness, independent of the realtime-parity test in Task 7.
  - [ ] `replayLifecycle` imports neither `useLocaleStore` nor `getCurrentMeasure` — same structural check as Task 3/4.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts`
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S (2 files, thin wrapper over an already-proven step function)

- [ ] **Task 6: `tickRobotLifecycle` refactor + `landOnDocked` signature change**

  **Description:** Per spec §4.2's tail and risk 6. `tickRobotLifecycle` builds a `RobotLifecycleSnapshot[]` from the live roster (reading each robot's `dockCycleCount` from the existing, unremoved `dockCycleCounters` module map — spec §7 item 4, dual-tracked deliberately), calls `stepRobotLifecycle` once, diffs the result against the pre-step snapshot per robot, and for any robot whose `docking` changed calls the appropriate existing landing effect (`landOnActive`/`landOnDocked`/`beginDeparting`/`beginDocking`) exactly as today. `landOnDocked`'s signature changes: it now receives the already-drifted melody as a parameter (computed by `stepRobotLifecycle`) instead of calling `reRollMelodyPitches` itself — it still owns position (`generateSpawnPosition`), `audioMode`, and `AudioEngine.registerRobotMelody`. For robots whose `batteryLevel`/`job` changed without a docking transition, `tickRobotLifecycle` calls `updateRobot` directly with just those fields, as it does today.

  **Acceptance criteria:**
  - [ ] Every existing `robotSystems.test.ts` test for `tickRobotLifecycle`, `landOnActive`, `landOnDocked`, `beginDeparting`, `beginDocking` passes **unmodified** — same `createSwimTimeline`/`handleRobotIdle`/`AudioEngine.registerRobotMelody`/`generateSpawnPosition` calls, same arguments, same conditions, as before this task. This is the behavior-preservation bar, not just "new tests pass."
  - [ ] `landOnDocked`'s new melody parameter, when supplied, is what ends up on `AudioEngine.registerRobotMelody`'s call and the robot's stored `melody` — no double-drift (i.e., `landOnDocked` itself must not also call `reRollMelodyPitches`).
  - [ ] `dockCycleCounters` (the module map) is still incremented exactly once per real `Departing`→`Docked` landing, unchanged from today — regression guard that Task 6 didn't remove or duplicate this bookkeeping.
  - [ ] A full real multi-measure run (`tickRobotLifecycle` called repeatedly, as `startRobotLifecycle`'s real subscription would) produces bit-for-bit the same end state it would have before this refactor, for a fixed sequence of measures and a fixed starting roster — a targeted before/after comparison test, not just "existing tests still pass."

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts`
  - [ ] `npm run build:types`, `npm run lint`, `npm test` (full suite — this task touches the most call sites of any in this plan).

  **Dependencies:** Task 4.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M (2 files, but the highest-risk behavioral-parity task in this plan — see Architecture Decisions)

- [ ] **Task 7: The prove-it test — replay matches realtime**

  **Description:** Per spec §5.2/§5.3's load-bearing test. Build a real 12-robot roster (`MAX_ROBOTS`) via existing spawn helpers, with a **contrived starting state** (spec §7 item 3) that guarantees both: (a) the "never zero Active" invariant fires at least once (e.g. 11 robots `Docked`, 1 `Active` at low battery), and (b) at least one dock-triggered melody drift occurs within the test's measure window (e.g. a robot already `Departing`/`Docking` with a near-elapsed hold). Run `tickRobotLifecycle` for N real measures, capture `docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` per robot. Separately, from the identical starting snapshot (`dockCycleCount: 0` for every robot), call `replayLifecycle` for the same N measures. Assert the two results are identical, field-for-field, melody arrays included, for all 12 robots.

  **Acceptance criteria:**
  - [ ] The test's starting state is explicit and documented (not left to chance) — asserts, before running anything, that the contrived state actually satisfies both preconditions (only one `Active` robot; at least one robot within one measure of landing).
  - [ ] After N measures, every robot's `docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` from the real-tick run and the replay run are identical.
  - [ ] The test fails if `stepRobotLifecycle`'s invariant check is broken (mutation-checked: temporarily break the invariant guard, confirm this test — not just Task 3's own unit tests — catches it).
  - [ ] The test fails if melody-drift seeding drifts from `landOnDocked`'s real formula (mutation-checked the same way).

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts`
  - [ ] `npm run build:types`, `npm run lint`, `npm test` (full suite).

  **Dependencies:** Tasks 5, 6.

  **Files:** `src/systems/robotSystems.test.ts`

  **Estimated scope:** M (1 file, but the single most important test in this plan — the spec's actual acceptance bar)

### Checkpoint C: Feature complete, proven, zero live-behavior change
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (full suite — note any pre-existing, unrelated failures explicitly, e.g. `worldTransition.test.ts`'s known-flaky swell-clear case per `docs/todo/backlog.md` item 15, so new failures are distinguishable).
- [ ] The prove-it test (Task 7) passes, and every pre-existing `robotSystems.test.ts`/`worldTransition.test.ts` test still passes unmodified.
- [ ] No manual/live-browser check performed or required — per the intent doc's explicit constraint, the prove-it test is the verification for this phase.
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Non-blocking audit + docs

- [ ] **Task 8: Audit pass — LFO drift / audio swells / ping-variance automation**

  **Description:** Per spec §4.5. Trace `src/systems/audioSwells.ts`, `src/engine/lfoEngine.ts`, and the ping-variance-automation mechanic for any real-time (`Date.now()`, `setTimeout`/`setInterval` used for musical timing) or unseeded-random (`Math.random()` outside an explicitly-approved use) dependency. Record findings as a new `docs/todo/backlog.md` entry — which systems are already measure-quantized and safe, which aren't, with specific file/line citations for each claim.

  **Acceptance criteria:**
  - [ ] Every claim in the findings entry cites a specific file/line/function, not a general impression — spot-checked against the real source, not assumed from memory of how the system "should" work.
  - [ ] The entry explicitly states whether each of the three named systems is safe or not, with a one-line reason each.
  - [ ] No source code changed by this task — findings only, per spec's explicit "non-blocking, informational" framing. Anything found broken becomes its own future backlog/roadmap item, not fixed here.

  **Verification:**
  - [ ] Manual review — every citation checked against the real file it names.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change, but confirms nothing was accidentally touched).

  **Dependencies:** None — can run any time, independent of every other task in this plan.

  **Files:** `docs/todo/backlog.md`

  **Estimated scope:** S (1 file, but requires real investigation across 2-3 source files to write accurately)

- [ ] **Task 9: Docs — `ROBOT_LIFECYCLE.md` + roadmap**

  **Description:** Document `stepRobotLifecycle`/`replayLifecycle` in `docs/ROBOT_LIFECYCLE.md`, prominently stating exactly which fields replay does and doesn't reproduce (`docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` — not `position`/`audioMode`/`state`/`destination`/`direction`), spot-checked against the final shipped source, not this plan. Mark roadmap [Phase 20.5](../todo/roadmap.md#205-world-clock-deterministic-lifecycle-replay) done, following the citation style of other completed phases (e.g. Phase 31).

  **Acceptance criteria:**
  - [ ] `docs/ROBOT_LIFECYCLE.md` describes the shipped `stepRobotLifecycle`/`replayLifecycle` signatures and behavior exactly as implemented — every named function/field spot-checked against `robotSystems.ts`, not assumed from the spec draft.
  - [ ] The doc is explicit that no consumer (Session Storage, Phase 21, Phase 32) uses this yet — matching the intent doc's explicit out-of-scope boundary, so a future reader doesn't assume it's already wired in somewhere.
  - [ ] `docs/todo/roadmap.md` Phase 20.5 marked done, linking this task file, the spec, and the intent doc.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked against shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Tasks 1–7 (needs final shipped shape of everything it documents). Independent of Task 8 (that's its own backlog entry, not part of `ROBOT_LIFECYCLE.md`).

  **Files:** `docs/ROBOT_LIFECYCLE.md`, `docs/todo/roadmap.md`

  **Estimated scope:** XS (2 files, docs only)

### Checkpoint D: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all 9 tasks are met.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 3/4's `stepRobotLifecycle` silently diverges from `tickRobotLifecycle`'s real arithmetic in some edge case the unit tests don't cover | High — would make the whole phase's premise (replay matches realtime) false while looking shipped | Task 7's prove-it test is the actual gate, not Task 3/4's own unit tests alone — it exercises a real multi-measure run end to end, and is itself mutation-checked (spec-mandated, not optional) |
| Task 6's refactor of `tickRobotLifecycle`/`landOnDocked` changes real, live gameplay behavior by accident (this is the one task touching the most existing call sites) | High — would ship a silent regression to the actual running app, the opposite of this phase's own goal | Task 6's acceptance criteria require the *entire pre-existing* `robotSystems.test.ts` suite to pass unmodified, plus a dedicated before/after multi-measure comparison test — not just "my new tests pass" |
| Melody-drift seeding (Task 4) reproduces the wrong sequence when a robot docks multiple times, because `dockCycleCount`/`callIndex` bookkeeping is subtly off | Medium — replay would silently diverge from realtime specifically for any robot with >1 dock cycle, the most realistic case, not an edge case | Task 4's acceptance criteria explicitly require testing a *second* dock cycle's drift compounding on the first's result, not just a single-cycle case |
| The prove-it test (Task 7) is accidentally too easy to pass (e.g. never actually triggers the invariant or a drift) | High — a green checkmark that doesn't actually prove anything | Task 7's acceptance criteria require the test to assert its own preconditions are met before asserting the outcome, and to be mutation-checked against both the invariant and the drift-seeding logic specifically |
| `Locale.currentMeasure`'s odd mount-time self-write behavior (`App.tsx`) turns out to depend on something this plan doesn't anticipate | Low — Task 1 explicitly doesn't touch it, so this plan carries no risk of breaking it; flagged only because a future reader might wonder why two measure-ish fields coexist on `Locale` | Task 1's doc comment on `createdAtMeasure` explicitly distinguishes it from `currentMeasure`, and Task 9's docs pass re-states this once more for anyone reading `ROBOT_LIFECYCLE.md` in isolation |

## Open Questions

Carried forward from spec §7:

1. `Locale.currentMeasure` dead-field handling — **Resolved** (Architecture Decisions above): left untouched, `createdAtMeasure` added as a new, distinctly-named field.
2. `noiseMap` required vs. optional-with-alea-fallback — **Resolved**: required; no fallback ported. Task 4's tests don't cover a null case.
3. How the prove-it test reliably exercises both the invariant and a melody drift — **Resolved**: Task 7's acceptance criteria require an explicit, asserted-up-front contrived starting state, not chance.
4. Dual dock-cycle-count bookkeeping (module map for live, snapshot field for replay) vs. moving it onto `Robot` — **Resolved**: dual-tracked, per Architecture Decisions; moving it onto `Robot` was judged out of proportion to this phase.

No open questions remain that block starting Task 1.
