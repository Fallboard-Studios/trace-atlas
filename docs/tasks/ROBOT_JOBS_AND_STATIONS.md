# Implementation Plan: Robot Jobs and Charging Stations

Spec: [docs/specs/ROBOT_JOBS_AND_STATIONS.md](../specs/ROBOT_JOBS_AND_STATIONS.md). Intent:
[docs/intent/robot-jobs-and-stations.md](../intent/robot-jobs-and-stations.md). Idea:
[docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md). Roadmap Phase 43.
A sketch gate, then four branches in sequence — `feature/jobs-lifecycle` (J1, from Phase 42 D2's
merge), `feature/jobs-loop` (J2, from J1's tip), `feature/jobs-moves` (J3, from J2's tip),
`feature/jobs-depth` (J4, from J3's tip). **Do not start J1 until districts D1 + D2 have merged.**

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`; perf gate `npm run build && npx vite preview --port 4173` then
`npm run perf:idle --throttle 1 --only none --url http://localhost:4173/trace-atlas/?session=…`.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Spec corrections found while planning (Task 16 folds them into the spec):**
> 1. **Every branch must leave the app working.** As specced, J1 deletes wandering and strips the
>    tick's visual effects while the loop that replaces them lands in J2 — between the two, recalled
>    robots would sit on screen muted and nothing would move. So J1 adds the `onLifecycleChange`
>    seam with a **legacy adapter** (`lifecycleVisuals.ts`) that keeps today's visuals exactly: the
>    exit swim, the off-screen dock position, `handleRobotIdle` and a live `assignJob`. J2 swaps the
>    adapter for the work loop and only then deletes `idleSystem.ts`, `RobotState`,
>    `destination`, `direction`, `scoreJobAffinities`/`assignJob`, `JOB_MAX_ROBOTS_PER_TYPE` and
>    `BATTERY_LOWER_THIRD_THRESHOLD`. `activity`/`stationId`/`siteId` arrive in J2 with their writer.
> 2. **Initially Active robots exit a station at load** (intent). Spec §1.6 only assigns Docked
>    robots. Spawn assigns every robot a station and the port position; Active ones start
>    `activity: 'exiting'`, and `onRobotMounted` plays `exitStation` for `'exiting'`.
> 3. **`chooseNextSite` and `siteCooldown` live in `src/systems/siteChoice.ts` (J1)**, not
>    `workLoop.ts`, so the readiness sim (spec §5.2) runs before the loop exists. `workLoop.ts`
>    imports them.
> 4. **"Held" in the variety rule** = the `job` of every *other* robot whose `docking` is Active and
>    whose `activity` is `exiting | transit | working | waiting`. Charging, returning and entering
>    robots hold nothing (their stale `job` is ignored).
> 5. **Centre vs position.** `robot.position` is the gem canvas's top-left; station ports and site
>    `park`s are centres. One pure pair, `robotCentre` / `positionForCentre` (Task 18), is the only
>    conversion; spawn, the loop and the layer switch all use it.

## Overview

Thirty-six tasks plus a sketch gate. **Task 0** is the motion sketch: Crawford signs off the five
moves, the station enter/exit and the placeholder station before any code. **J1** (Tasks 1–16)
changes the lifecycle underneath today's visuals — renamed states, a measured flat drain, the job out
of replay, the legacy seam, dead code out — and builds the world data the loop will need: host
lists, factory geometry, work sites, the coverage guarantee, stations, the pure site choice and the
readiness sim. Nothing on screen changes in J1 except the new card words. **J2** (Tasks 17–27)
builds the loop on that data: the motion registry and orbiter lock, one move end to end, the
station, the activity field, the loop itself, the hand-over from the legacy adapter and the card
states. **J3** (Tasks 28–31) adds the remaining four moves and all six jobs. **J4** (Tasks 32–36)
adds the back robot layer. Every branch ends with Crawford's live gate, an idle-paint gate that
stops and reports, and a docs task. RED first, one commit per task, every rule test mutation-checked
by breaking the constant or branch it guards (named in the commit message).

## Architecture Decisions

- **Seam first, swap later.** `onLifecycleChange(localeId, robotId, to)` is the only way the tick
  reaches anything visual. J1 implements it with the legacy adapter (behaviour parity, proved by the
  moved exit-swim/dock-position tests passing unmodified); J2 re-points it at `workLoop.ts`. The tick
  never changes again after J1.
- **Measure before flattening.** Task 2 makes the drain an injectable function of the snapshot
  (default = today's surcharge rule) so the sim can compare today against flat candidates on the
  same replay code; Task 3 flips the default to the pinned constant. No guessed number ships.
- **Pure modules carry the logic, shells stay thin.** Hosts, geometry, sites, coverage, stations,
  site choice, cooldown, scene→orbiter maths and the layer-switch point are pure and fully tested
  without React or GSAP; `workLoop.ts`, the move builders and the components only sequence them.
- **Factory geometry is extracted, not re-derived.** `factoryGeometry(actor)` is cut out of
  `Factory.tsx`'s `staticVisual`, which then calls it, so the renderer and the work sites cannot
  drift (parity test against the rendered box).
- **Scenery anchors sit beside `deriveSceneryParams`.** Phase 42 already made each family's
  parameters a pure module; anchors read those parameters and nothing else.
- **One move end to end before the move set.** J2 ships `hoverPulse` for every job (spec §1.9), so
  the loop, the lock, the registry and the station are judged live before four more moves land.
- **The registry is the only bridge to hooks.** `robotMotionRegistry.ts` mirrors `refs.ts`
  (`setRef`/`getRef`/`deleteRef`): `RobotBody` and `useOrbiterMotion` register on mount, deregister
  on unmount, world context only.
- **The depth layers stay behind a flag until their gate passes.** `BACK_HOSTS_ENABLED` is false
  through J3; J4 flips it in its last code task, so a failed J4 gate means "don't merge J4", never
  a revert.

## Dependency Graph

```
T0 sketch gate (Crawford) ───────────────────────────────────────────────────────────────┐
                                                                                          │
J1  T1 rename states ─► T2 drain injectable + sim (stop) ─► T3 flat drain, job out of replay
    T4 JobType ×6 + bare job (needs T1)                                                   │
    T5 onLifecycleChange seam + legacy adapter (needs T3, T4)                             │
    T6 dead code: interactionSystem, factory production fields (independent)              │
                    └──────────────► Checkpoint A (parity) ◄─────────────┘                │
    T7 jobHosts ─┐                                                                        │
    T8 factoryGeometry ─► T9 sites: factories ─► T10 sites: scenery A ─► T11 sites: scenery B
                 └───────────────────────────────────────────────┬────────┘               │
                                    T12 coverage + top-ups (needs T7, T11)                │
    T13 stations (needs T9–T11 bounds) ── T14 siteChoice (needs T7) ─► T15 readiness + handoff sim (stop)
                                    Checkpoint B ─► T16 J1 docs + spec corrections        │
                                                                                          ▼
J2  T17 registry + orbiter lock ─┐   T18 centre/position + sceneToOrbiterLocal ─┐   (T0 constants)
    T19 hoverPulse + buildJobTimeline (needs T17, T18) ─────────────────────────┤
    T20 ChargingStation (needs T13, T0) ────────────────────────────────────────┤
    T21 activity/stationId/siteId + spawn at stations (needs T13, T18) ─────────┤
    T22 loop: site cycle (needs T14, T19, T21) ─► T23 loop: stations + mount (needs T20, T22)
    T24 hand-over: seam → loop, delete legacy (needs T23) ─► T25 card states (needs T21)
                    Checkpoint C (Crawford live + Phase 41 halo gate) ─► T26 perf gate (stop) ─► T27 J2 docs
J3  T28 trace + ring + variation ─► T29 carry + fan + spark, six-job table ─► Checkpoint D ─► T30 perf (stop) ─► T31 docs
J4  T32 findLayerSwitchPoint + flag plumbing ─► T33 layer split + per-layer robots + clicks
    ─► T34 layer-aware legs + remount without flourish ─► Checkpoint E ─► T35 perf + Pixel (stop) ─► T36 final docs
```

## Task List

### Sketch gate

- [ ] **Task 0: Motion sketch — `docs/sketches/robot-jobs-and-stations.html`**

  **Description:** A standalone page in the style of the Phase 39–42 sketches (no build step, GSAP
  from cdnjs, the real palette tokens). Panels: a robot gem with four docked orbiters beside (a) a
  Refinery-style factory and (b) a dome, playing each of the five moves (spec §1.9) and the six
  jobs' sequences, with sliders for orbiter count (1–4), `JOB_WORK_RATE` per job and
  `JOB_BASE_SECONDS`; (c) a placeholder gem station (≤ 16 shapes, six slot lights) with a robot
  entering and exiting through a ripple ring; a toggle for reduced motion; a 1× / 0.75× scale
  toggle for the back layer. Crawford can drop his own station design into one marked function.

  **Acceptance criteria:**
  - [ ] Every move and job plays at 1× at world scale; orbiter count visibly changes speed.
  - [ ] Station enter/exit reads as "into" and "out of" the station, not a fade-out next to it.
  - [ ] Crawford's verdict recorded in the sketch header; the constants he keeps written into spec
        §1.6/§1.9 (Task 16 or the J2 task that consumes them).

  **Verification:** Crawford, by eye. **Dependencies:** None. **Files:**
  `docs/sketches/robot-jobs-and-stations.html`. **Scope:** M (one file, the gate before code).

---

### Phase J1: Lifecycle and world data (`feature/jobs-lifecycle`)

- [x] **Task 1: Rename the docking states**

  **Description:** `DockingState` becomes `Docked / Undocking / Active / Recalled` with values
  `'docked' / 'undocking' / 'active' / 'recalled'` (spec §1.1). Rename `beginDocking` →
  `beginUndocking`, `beginDeparting` → `beginRecall` in `robotSystems.ts`; update `spawnSystem.ts`,
  `worldTransition.ts`, `idleSystem.ts`, the `probe.status.docking` content options ("Docked /
  Undocking / Active / Recalled") and `DOCKING_STATE_LABELS`. Pure rename — no behaviour change.

  **Acceptance criteria:**
  - [x] No reference to `DockingState.Docking`/`Departing` or the strings `'docking'`/`'departing'`
        remains in `src/` (grep in the test).
  - [x] All existing lifecycle, replay, spawn, idle and card tests pass with only the renamed
        identifiers changed.

  **Verification:** `npm test`; `npm run build:types`, `npm run lint`. **Dependencies:** None.
  **Files:** `src/types/Robot.ts`, `src/systems/robotSystems.ts`, `src/systems/spawnSystem.ts`,
  `src/content/copy/probe.ts`, `src/data/robotSelectionConfig.ts` (+ their tests). **Scope:** M.

- [x] **Task 2: Injectable drain + the drain sim — stop and report**

  **Description:** `stepRobotLifecycle`/`replayLifecycle` take an optional `drain(snapshot)`
  defaulting to today's rule (`BATTERY_DRAIN_BASE + surcharge`). A new `lifecycleSim.ts` (pure)
  builds real seeded rosters over the districts seed grid (121 seeds, via the spawn baseline
  helpers) and reports the mean and p10/p90 Active count over 2000 measures for today's rule and
  flat 5, 6 and 7. A test asserts the report's shape; the numbers go to Crawford.

  **Acceptance criteria:**
  - [x] Default behaviour unchanged: the prove-it replay test passes unmodified.
  - [x] The sim is deterministic (same table twice) and touches no store or BeatClock.
  - [x] Report table posted; Crawford confirms the flat value (expected 6). — confirmed 6, 2026-10-07.

  **Verification:** `npx vitest run src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts`.
  **Dependencies:** T1. **Files:** `src/systems/robotSystems.ts`, `src/systems/lifecycleSim.ts`
  (+ tests). **Scope:** S.

- [x] **Task 3: Flat drain; job out of replay**

  **Description:** `BATTERY_DRAIN_ACTIVE` (the confirmed value) replaces `BATTERY_DRAIN_BASE` and
  `JOB_BATTERY_DRAIN_SURCHARGE`; the default `drain` returns it for every Active robot.
  `RobotLifecycleSnapshot` drops `job`, `octaveRange`, `rhythmicDensity`, `rhythmicMotifLength`;
  `chooseJobForSnapshot` goes. `tickRobotLifecycle` no longer compares jobs. Live `assignJob` stays
  (legacy, T5) — it writes the store only.

  **Acceptance criteria:**
  - [x] Every Active robot drains `BATTERY_DRAIN_ACTIVE` regardless of `job`.
  - [x] The prove-it test passes with the narrowed snapshot; mutation check: re-introducing a job
        surcharge in the live tick breaks it.
  - [x] Invariant, hold and pitch-drift tests pass unmodified. — logic unmodified; their battery
        fixtures name `BATTERY_DRAIN_ACTIVE` where they named `BATTERY_DRAIN_BASE`.

  **Verification:** `npx vitest run src/systems/robotSystems.test.ts`; `npm run build:types`.
  **Dependencies:** T2. **Files:** `src/systems/robotSystems.ts`, `src/constants/index.ts` (+ tests).
  **Scope:** S.

- [x] **Task 4: Six job types; `job` becomes the bare type**

  **Description:** `JobType` gains `salvage` and `maintenance`; `Robot.job` becomes `JobType`
  (drop `assignedAtMeasure`). `probe.job` gains Salvage and Maintenance with lore lines (copy-tone
  guide; flagged for Crawford's review). `assignJob` writes the bare type; `scoreJobAffinities`
  keeps scoring its four (it is deleted in T24 — the new two are never chosen until the loop).
  Cards read `robot.job` directly.

  **Acceptance criteria:**
  - [x] `JOB_TYPE_LABELS` has six entries; content test green; no literals in components.
  - [x] Cards show the job label for a robot with a job and "Unassigned" without one. — lore lines
        "DERELICT HULL SALVAGE" / "GRID INFRASTRUCTURE MAINTENANCE" await Crawford's review.

  **Verification:** `npx vitest run src/content src/components/selection src/components/robot/RobotDisplaySection.test.tsx`.
  **Dependencies:** T1. **Files:** `src/types/Robot.ts`, `src/systems/robotSystems.ts`,
  `src/content/copy/probe.ts`, `src/data/robotSelectionConfig.ts`, the two card components (+ tests).
  **Scope:** M.

- [x] **Task 5: The `onLifecycleChange` seam and the legacy adapter**

  **Description:** New `src/systems/lifecycleVisuals.ts` exports `onLifecycleChange(localeId,
  robotId, to: 'recalled' | 'active' | 'docked')` and, behind it, today's visuals moved verbatim out
  of `robotSystems.ts`: the exit swim (`pickExitDestination` + `createSwimTimeline` + `state: Moving`
  + `destination`), `assignJob` + `handleRobotIdle({ isReturning: true })` on active, and the
  off-screen dock position + `state: Idle` + `destination: null` on docked. `beginRecall`,
  `landOnActive`, `landOnDocked` keep only audio + docking + drift writes and call the seam
  (spec §1.1, correction 1).

  **Acceptance criteria:**
  - [x] `robotSystems.ts` imports nothing from `idleSystem`, `swimAnimation` or `spawnSystem`'s
        position helper.
  - [x] The moved exit-swim, dock-position and idle-restart tests pass unmodified against the
        adapter (behaviour parity); the landing tests assert the seam is called with the right `to`.
        — the assertions are unchanged; only the entry call changed (`onLifecycleChange` instead of
        the tick/landing function). An end-to-end test through the real tick also proves parity.
  - [x] Mutation check: dropping the seam call from `landOnDocked` fails a test.

  **As shipped:** (1) `dockCycleCounters` moved to a new `src/systems/dockCycles.ts`
  (`getDockCycleCount` / `recordDockLanding`). The off-screen dock position is seeded by the dock
  cycle, and the count also seeds pitch drift. A shared module lets both read one counter without
  an import cycle. `landOnDocked` advances it; the adapter reads it. (2) `scoreJobAffinities` and
  `assignJob` moved into `lifecycleVisuals.ts` with the rest of the legacy visuals. That avoids an
  import cycle with `robotSystems.ts`, and they get deleted together in T24. `worldTransition.ts`
  imports `assignJob` from there now.

  **Verification:** `npx vitest run src/systems`. **Dependencies:** T3, T4. **Files:**
  `src/systems/robotSystems.ts`, `src/systems/lifecycleVisuals.ts` (+ tests, moved cases).
  **Scope:** M.

- [x] **Task 6: Delete the interaction system and the factory production fields**

  **Description:** Delete `interactionSystem.ts` and its test (no callers). Remove
  `cooldownRemaining`, `productionInterval`, `isOffline`, `offlineSince` from `Actor`,
  `createFactory` and `PRODUCTION_INTERVAL`; `factoryBubbleProps.ts`'s `isActive` becomes `true`.

  **Acceptance criteria:**
  - [x] No reference to the removed names in `src/`; bubble tests pass with `isActive: true`.
        — enforced by a source-scan test in `factoryPlacementSystem.test.ts`.
  - [x] Full suite green (the deleted test file is the only removed test). — 6503 − 10 deleted
        + 3 new = 6496. `districts.ts` scenery also dropped its `cooldownRemaining: 0` (the field
        is gone from `Actor`), and ~23 test fixtures lost the same line.

  **Verification:** `npm test`; `npm run build:types`. **Dependencies:** None. **Files:**
  `src/systems/interactionSystem.ts` (+ test, deleted), `src/types/Actor.ts`,
  `src/systems/factoryPlacementSystem.ts`, `src/components/actors/factoryBubbleProps.ts` (+ tests).
  **Scope:** S.

### Checkpoint A: Lifecycle parity
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. — 6496 tests at 20039099; lint
      has only the two pre-existing react-refresh warnings.
- [x] Live (`npm run dev`): robots wander, depart down, dock off-screen and return exactly as on
      main; cards say Undocking/Recalled where they said Docking/Departing.
- [x] Reviewed with Crawford before the world-data half. — passed 2026-10-07 ("everything looks
      good"), taken to include the T4 Salvage/Maintenance lore lines.

- [x] **Task 7: `jobHosts.ts`**

  **Description:** `hostJobs(actor): JobType[]` — the spec §1.3 table for the five factory
  variants and sixteen scenery kinds, the derelict override (`[salvage, structuralInspection]`),
  nothing for `offscreen` rows or wall/boulder/tether. `isWorkSiteEligible(actor, { backHosts })`
  adds the depth filter (background only when `backHosts`). `BACK_HOSTS_ENABLED = false`.

  **Acceptance criteria:**
  - [x] Every row of the table asserted; every `SceneryKind` and `FactoryVariant` covered
        (exhaustiveness test over the type unions). — `Record<Union, true>` sets in the test, so
        `build:types` fails if a kind or variant is added and left out.
  - [x] Derelict tank → `[salvage, structuralInspection]`; offscreen Warehouse → `[]`; background
        Skyscraper ineligible with `backHosts: false`, eligible with `true`.

  **As shipped:** (1) The tables are exported as `FACTORY_HOST_JOBS` / `SCENERY_HOST_JOBS`. A
  factory's variant is derived the way `Factory.tsx` derives it (`selectVariantFromSeed` with the
  row's `variants`); T8 can switch this to `factoryGeometry`. (2) Two rules the spec leaves open,
  decided here: offscreen beats derelict (an offscreen derelict hosts nothing), and a derelict
  non-host (wall, boulder, tether) stays a non-host. (3) An unresolvable row counts as foreground,
  the same fallback `Factory.tsx` uses. (4) Mutation checks: dropping the offscreen check, the
  derelict override, the depth filter, the row's variant list or the non-host guard each fail
  tests.

  **Verification:** `npx vitest run src/systems/jobHosts.test.ts`. **Dependencies:** T4.
  **Files:** `src/systems/jobHosts.ts` (+ test), `src/constants/index.ts`. **Scope:** S.

- [x] **Task 8: Extract `factoryGeometry(actor)`**

  **Description:** Cut `selectVariantFromSeed` + `calcSilhouetteSize` + the bottom-anchor maths out
  of `Factory.tsx`'s `staticVisual` into `components/actors/factoryGeometry.ts`, returning
  `{ variant, width, height, frontCornerX, box: { x0, y0, x1, y1 } }` in scene units (box
  `x … x + w·sx`, `y − h·sy … y`). `Factory.tsx` calls it.

  **Acceptance criteria:**
  - [x] `Factory.test.tsx` and `Factory.test.ts` pass unmodified (render parity).
  - [x] For 50 seeded factories, `box` equals the rendered outer group's translate plus scaled size.

  **As shipped:** (1) `box.y0` is `Math.round(y − h·sy)`, rounded the way the rendered translate
  (`bottomAnchorTransform`) is, and `y1 = y0 + h·sy`. So the box is the drawn body exactly, and its
  bottom can sit up to 0.5 units off `actor.position.y`. (2) `Factory.tsx` passes the geometry a
  copy of the actor built from its memo's own dependencies (`position.y` was added to them), so the
  React compiler's memoisation check still passes. (3) `jobHosts.ts` now takes the factory variant
  from `factoryGeometry`. `factoryBubbleProps.ts` and `pipeBridges.tsx` still derive it themselves
  (out of scope). (4) Mutation checks: dropping the rounding, swapping the scale axes, or dropping
  the row's variant list each fail tests.

  **Verification:** `npx vitest run src/components/actors`. **Dependencies:** None.
  **Files:** `src/components/actors/factoryGeometry.ts` (+ test), `src/components/actors/Factory.tsx`.
  **Scope:** S.

- [x] **Task 9: Work sites — `workSites.ts` and factories**

  **Description:** `getWorkSite(actor): WorkSite | null` (spec §1.5) with the factory branch:
  `bounds` from `factoryGeometry`, `park` per the park rule (`PARK_CLEARANCE` = 70, `WORLD_MARGIN`
  100), `points`/`path` per variant from `Alea(id + ':work')` — the Monolith/Skyscraper top outline,
  Stacks/Refinery stack mouths and a valve point. Foreground sites keep every point on or above the
  top outline. Cached per actor id.

  **Acceptance criteria:**
  - [x] Deterministic per actor id; `null` for non-hosts.
  - [x] Over 200 seeded factories: `park` inside the world margin and above `bounds.y0`;
        foreground `points`/`path` never below `bounds.y0`; `path.length ≥ 2`, `points` 2–4.
        — every real factory host the placer puts down over the 121-seed grid (well over 200).
        Points and path sit on or above the roof at every depth, not only foreground. "Above
        `bounds.y0`" holds for every eligible (midground/foreground) site, but not for every
        background one: see (2).

  **As shipped:** (1) **The cache is keyed by the actor object (`WeakMap`), not the id.** Actor
  ids repeat across locales: 730 of 4210 actors over the grid share an id with another locale's,
  652 of them with different geometry. An id key would hand the next world a stale site (a test
  pins this with a real colliding pair). `deriveWorkSite` is the uncached derivation.
  (2) **Park clamp vs. "above the roof".** Background Skyscrapers can have a roof as high as
  y = 48. There, `roof − 70` clamps to `WORLD_MARGIN`, so the park is *below* the roof line. Only
  background sites hit this, and those stay ineligible until J4 (`BACK_HOSTS_ENABLED`). J4 must
  decide it: drop such sites, or park beside them. (3) **Visible roof.** Some hosts run off a
  world edge (x0 = −20; x1 up to ~2250), and some foreground Warehouse hosts sit wholly past it
  (x0 ≥ 1977). Points, path and the park centre use the part of the roof inside [0, 1920]; a roof
  wholly outside falls back to the whole roof. Whether off-world hosts should host at all is open
  for T12/Crawford. (4) Per variant: Stacks/Refinery `[mouth, valve]`, where the mouth is the bubble vent's x
  (`factoryVentFraction`, now shared with `factoryBubbleProps.ts`) on the drawn roof, and the valve
  is in the other half. Warehouse has `[a, b]`, one in each half. Monolith/Skyscraper has
  `[seeded mid point, roof 10 %, roof 90 %]`. `path` is the top outline, through the front corner
  when it's visible. (5) `WORLD_MARGIN` moved into `constants/index.ts`; `idleSystem.ts` imports it
  and `WORLD_WIDTH`/`WORLD_HEIGHT` instead of its own copies. Scenery hosts return `null` until
  T10/T11. (6) Mutation checks: dropping the visible-span clip, the unrounded vent y, dropping the
  park clamp, an id-keyed cache, and zeroing the park jitter each fail tests. The jitter mutant
  survived the first version of its test, so the test was tightened.

  **Verification:** `npx vitest run src/systems/workSites.test.ts`. **Dependencies:** T7, T8.
  **Files:** `src/systems/workSites.ts` (+ test), `src/constants/index.ts`. **Scope:** M.

- [ ] **Task 10: Work sites — scenery group A (tank, dome, scaffold, containers, wreck, vent)**

  **Description:** Per-kind anchor functions beside `deriveSceneryParams` (one
  `sceneryWorkAnchors.ts` in `components/actors/scenery/`), reading only those parameters: tank
  gauge + shoulder line, dome portholes + hatch + dome arc as `path`, scaffold top frame + brace
  points, container label squares + stack top, wreck deckhouse/funnel + hull line, vent mouth.
  `getWorkSite` dispatches to them.

  **Acceptance criteria:**
  - [ ] Each kind: same invariants as T9 over 50 seeds per kind; anchors lie inside the silhouette's
        `bounds` (or ≤ 40 above it for mouths/masts).
  - [ ] A param change in `deriveSceneryParams` moves the anchors (mutation check on one kind).

  **Verification:** `npx vitest run src/components/actors/scenery src/systems/workSites.test.ts`.
  **Dependencies:** T9. **Files:** `src/components/actors/scenery/sceneryWorkAnchors.ts` (+ test),
  `src/systems/workSites.ts`. **Scope:** M.

- [ ] **Task 11: Work sites — scenery group B (crane, pylon, beacon, pipeline, turbine, floodlight, dish)**

  **Description:** The structural kinds: crane beam ends + hanger, pylon head + cross-arms, beacon
  gem, pipeline run as `path` + valve + riser top, turbine hub, floodlight head, dish centre + feed.

  **Acceptance criteria:**
  - [ ] Same invariants as T10; the exhaustiveness test now passes for every host kind
        (`getWorkSite` non-null for every host in `jobHosts`).

  **Verification:** as T10. **Dependencies:** T10. **Files:** as T10. **Scope:** M.

- [ ] **Task 12: Coverage guarantee and top-up lists**

  **Description:** `jobCoverage.ts`'s `ensureJobCoverage(localeId)` (spec §1.4) counts eligible
  midground + foreground hosts per job and appends `coverageTopUp` items through the district
  placer's row machinery at `'locale.coverage.x'` until ≥ 3 jobs have ≥ 4 hosts. Each recipe in
  `districtRecipes.ts` gains its ordered `coverageTopUp` list (wreck field first). `placeDistrict`
  calls it.

  **Acceptance criteria:**
  - [ ] Over the 121-seed grid every world satisfies the rule after placement; top-ups are
        deterministic and ground-locked; the recipe element budgets still hold.
  - [ ] Mutation check: emptying wreck field's top-up list fails the grid test.
  - [ ] Worlds that already satisfy the rule are unchanged (no top-up placed — asserted on a seed).

  **Verification:** `npx vitest run src/systems/jobCoverage.test.ts src/systems/districtRecipes.test.ts src/systems/districts.test.ts`.
  **Dependencies:** T7, T11. **Files:** `src/systems/jobCoverage.ts` (+ test),
  `src/systems/districtRecipes.ts`, `src/systems/districts.ts`. **Scope:** M.

- [ ] **Task 13: `stations.ts`**

  **Description:** `getStations(localeId): Station[]` (spec §1.6) — count 2–3, positions with
  re-draw until spacing ≥ `STATION_MIN_SPACING` and no overlap with any host `bounds`, cached like
  `getRobotGem`. `assignStationsAtLoad(robotIds, stations)` (index modulo count) and
  `nearestFreeStation(centre, stations, occupancy)`. Station box size from the sketch (T0).

  **Acceptance criteria:**
  - [ ] Over the seed grid: 2–3 stations, pairwise spacing ≥ 480, no host overlap, inside
        x [240, 1680] / y [220, 560]; deterministic.
  - [ ] Load assignment never exceeds capacity 6; `nearestFreeStation` skips a full station.

  **Verification:** `npx vitest run src/systems/stations.test.ts`. **Dependencies:** T11 (bounds),
  T0 (box size). **Files:** `src/systems/stations.ts` (+ test), `src/constants/index.ts`.
  **Scope:** S.

- [ ] **Task 14: `siteChoice.ts` — `chooseNextSite`, `siteCooldown`, held jobs**

  **Description:** The pure decision functions of spec §1.7 and §4's snippet, in their own module
  (correction 3), plus `heldJobs(robots, selfId)` per correction 4. `siteCooldown(n) = clamp(n ×
  COOLDOWN_PER_SITE, COOLDOWN_MIN, COOLDOWN_MAX)` with the first-guess constants.

  **Acceptance criteria:**
  - [ ] Keeps the robot's job when a ready site hosts it (nearest wins); otherwise prefers an unheld
        job, weighted by ready-site count (seeded `rand`, frequency test over 10 000 draws within 2 %);
        falls back to held jobs when all are held; `null` when nothing is ready.
  - [ ] `heldJobs` ignores charging/returning/entering robots and the robot itself.
  - [ ] `siteCooldown` clamps at both ends.

  **Verification:** `npx vitest run src/systems/siteChoice.test.ts`. **Dependencies:** T7.
  **Files:** `src/systems/siteChoice.ts` (+ test), `src/constants/index.ts`. **Scope:** S.

- [ ] **Task 15: Readiness and handoff sim — stop and report**

  **Description:** Extend `lifecycleSim.ts` with a loop sim: the real lifecycle at a given BPM, real
  work sites and stations per seed, `chooseNextSite` + `siteCooldown`, swims at `SWIM_SPEED`, job
  durations from `jobDuration` with orbiter counts from each robot's `rhythmicDensity`, station arcs
  at `STATION_ARC_SECONDS`. Report per seed and overall: mean/p95 waiting share and longest wait,
  job switches per active stint, turn-backs at 20 and 200 BPM, and any robot `charging` while
  visible.

  **Acceptance criteria:**
  - [ ] Deterministic; no store, BeatClock or GSAP.
  - [ ] Report posted; Crawford confirms `COOLDOWN_*` (target: mean waiting < 10 % of active time,
        no wait > 15 s) and the constants are written back.
  - [ ] Zero "charging while visible" cases at both tempos.

  **Verification:** `npx vitest run src/systems/lifecycleSim.test.ts`. **Dependencies:** T13, T14.
  **Files:** `src/systems/lifecycleSim.ts` (+ test), `src/constants/index.ts`. **Scope:** M.

### Checkpoint B: J1 complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] J1 perf: busy-only `perf:idle` vs the branch base — no measurable change expected (nothing new
      draws); a change is a stop-and-report.
- [ ] Reviewed with Crawford; J1 merge decision is his.

- [ ] **Task 16: J1 docs and spec corrections**

  **Description:** ROBOT_LIFECYCLE.md: renamed states, flat drain with the T2 table, the narrowed
  snapshot, the seam. PROCEDURAL_GENERATION.md: `station.*`, `locale.coverage.x`. BUILDING_DESIGN.md:
  hosts, work sites, coverage. Fold corrections 1–5 and the T0/T2/T15 constants into the spec.
  Roadmap Phase 43 status line.

  **Acceptance criteria:**
  - [ ] Every named identifier spot-checked against shipped source; docs tests green.

  **Verification:** `npm test`. **Dependencies:** T1–T15. **Files:** the docs above, the spec,
  `docs/todo/roadmap.md`. **Scope:** S.

---

### Phase J2: Stations and the loop (`feature/jobs-loop`)

- [ ] **Task 17: `robotMotionRegistry.ts` and the orbiter lock**

  **Description:** `register/get/deleteArcDecorator` and `register/get/deleteOrbiterWork` (spec
  §1.8), mirroring `refs.ts`. `RobotBody` registers its world-context `decorateArc` on mount and
  deletes it on unmount. `useOrbiterMotion` (world only) registers `{ lock, unlock }`: `lock` returns
  the shown `.gem__orbiter-local` groups in `cornerOrder` and makes `reconcile()` return early;
  `unlock` clears the lock and reconciles once. No caller yet.

  **Acceptance criteria:**
  - [ ] Avatar and card contexts never register.
  - [ ] While locked, count changes 2 → 4 → 1 → 3 queue no hops; on unlock exactly the hops from the
        shown count to 3 play (one reconcile pass, not three).
  - [ ] Unmount deregisters both.

  **Verification:** `npx vitest run src/animation/robotMotionRegistry.test.ts src/components/robot/gem/useOrbiterMotion.test.tsx src/components/robot/RobotBody.test.tsx`.
  **Dependencies:** None (J2 base). **Files:** `src/animation/robotMotionRegistry.ts` (+ test),
  `src/components/robot/gem/useOrbiterMotion.ts`, `src/components/robot/RobotBody.tsx` (+ tests).
  **Scope:** M.

- [ ] **Task 18: Centre/position and scene→orbiter maths**

  **Description:** `jobMoves/sceneToOrbiterLocal.ts`: `robotCentre(robot, gem, scale)`,
  `positionForCentre(centre, gem, scale)` (correction 5) and `sceneToOrbiterLocal(point, { robotPos,
  gem, bodyScale, layerScale, corner })` inverting the robot translate, the `g.gem`
  `translate(c) scale(s) translate(−c)` and the corner's dock offset.

  **Acceptance criteria:**
  - [ ] Round-trip: a point mapped to local and pushed back through the real transform chain (built
        from `RobotGem`'s transform string) lands within 0.01 units, for 50 gems × scales 1/1.69/0.75.
  - [ ] `positionForCentre(robotCentre(r)) === r.position`.

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** None.
  **Files:** `src/animation/jobMoves/sceneToOrbiterLocal.ts` (+ test). **Scope:** S.

- [ ] **Task 19: `hoverPulse` and `buildJobTimeline`**

  **Description:** `jobMoves/hoverPulse.ts` (targets pure, tweens on the timeline) and
  `jobMoves/buildJobTimeline.ts`: given a robot, its site, job and locked orbiter groups, one paused
  timeline keyed `work-${robotId}` — the bob (`BOB_PX`, finite repeats), detach (`ATTACH_DURATION`),
  the job's moves (every job → `hoverPulse` in J2), reattach to `x: 0, y: 0`, total
  `jobDuration(job, count)` (constants from T0). Reduced motion: an in-place opacity pulse of the same
  length. `onComplete` is passed in. Registered in `timelineMap`.

  **Acceptance criteria:**
  - [ ] Duration equals `jobDuration` for counts 1–4 (± one frame); floors at `JOB_MIN_SECONDS`.
  - [ ] Orbiters end at `x: 0, y: 0`, scale and opacity restored; the bob ends where it started.
  - [ ] The timeline never touches `AudioEngine` (spy); killing the key leaves no live tweens.

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** T17, T18, T0.
  **Files:** `src/animation/jobMoves/hoverPulse.ts`, `src/animation/jobMoves/buildJobTimeline.ts`,
  `src/animation/jobMoves/jobDuration.ts` (+ tests), `src/constants/index.ts`. **Scope:** M.

- [ ] **Task 20: `ChargingStation.tsx`**

  **Description:** The placeholder gem station from T0 (or Crawford's design if ready), memoised,
  rendered from `getStations` in `OceanScene`'s robots layer **after** the robots. Six slot lights,
  lit count from a narrow selector (robots with this `stationId` and `activity === 'charging'` — the
  selector returns 0 until T21 adds the fields). No continuous animation.

  **Acceptance criteria:**
  - [ ] ≤ `STATION_SHAPE_BUDGET` (16) drawn shapes per station (counted in the test).
  - [ ] Drawn after every `.robot` in the robots layer's DOM order.
  - [ ] A battery tick on an unrelated robot does not re-render the station (render-count test).

  **Verification:** `npx vitest run src/components/stations src/components/panels/screen/worldView/OceanScene.test.tsx`.
  **Dependencies:** T13, T0. **Files:** `src/components/stations/ChargingStation.tsx` (+ test),
  `src/components/panels/screen/worldView/OceanScene.tsx`. **Scope:** S.

- [ ] **Task 21: `activity`, `stationId`, `siteId`; spawn at the stations**

  **Description:** Add `RobotActivity` and the three fields (spec §1.2) — `state`, `destination`
  and `direction` stay until T24 so the legacy adapter keeps working. `spawnInitialRoster` assigns
  every robot a station (`assignStationsAtLoad`) and the port position (`positionForCentre`);
  Docked robots `activity: 'charging'`, Active robots `'exiting'` (correction 2). The station slot
  selector from T20 now reads real data.

  **Acceptance criteria:**
  - [ ] Every spawned robot has a `stationId` within capacity and its position at that port.
  - [ ] Initial Docked count lights exactly that many slots across the stations.
  - [ ] Fields JSON-serializable; session payloads unchanged (`sessionDiff` tests unmodified).

  **Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/components/stations src/utils/sessionDiff.test.ts`.
  **Dependencies:** T13, T18, T20. **Files:** `src/types/Robot.ts`, `src/systems/spawnSystem.ts`
  (+ test). **Scope:** S.

- [ ] **Task 22: `workLoop.ts` — the site cycle**

  **Description:** `startWorkLoop`/`stopWorkLoop`, module `siteState`, injectable `now()`
  (`gsap.ticker.time`), and `next()` for an Active robot: `chooseNextSite` → `activity: 'transit'`,
  `siteId` held, swim to `park` (`createSwimTimeline`), `position` written on arrival →
  `'working'` with the T19 timeline (lock → run → unlock) → release with `readyAt = now +
  siteCooldown(n)` → `next()`. No site → `'waiting'` (`bob-wait-*`, `WAIT_RETRY_SECONDS`) →
  `next()`. Not yet wired to mounts or the lifecycle (tests drive it directly).

  **Acceptance criteria:**
  - [ ] One robot per site; a site is not chosen again before its `readyAt`.
  - [ ] The job sticks across sites until no ready site hosts it, then switches to an unheld job.
  - [ ] `stopWorkLoop` kills every `work-*`, `swim-*`, `bob-wait-*` key and clears state; callbacks
        never touch `AudioEngine` (spy).

  **Verification:** `npx vitest run src/systems/workLoop.test.ts`. **Dependencies:** T14, T19, T21.
  **Files:** `src/systems/workLoop.ts` (+ test). **Scope:** M.

- [ ] **Task 23: `workLoop.ts` — stations, recall and mounts**

  **Description:** `exitStation`, `returnToStation` + `entering` (spec §1.7, `decorateArc` from the
  registry, `autoAlpha` and scale 0.4 at the port, `STATION_ARC_SECONDS`), recall handling (finish a
  job, abandon transit/waiting), the turn-back rule, and `onRobotMounted` (charging → hidden at the
  port; exiting → `exitStation`; other Active → release + `next()`). `Robot.tsx`'s mount effect calls
  `onRobotMounted` instead of `handleRobotIdle`. `initializeLocale` and both power-off paths call
  `stopWorkLoop`/`startWorkLoop`. Reduced motion: 0.3 s fades in place.

  **Acceptance criteria:**
  - [ ] Recall while working: the job completes, then the robot returns; while in transit or
        waiting: it returns at once and its site is released.
  - [ ] Active landing while returning/entering: the slot is released and the robot goes back to
        work; while charging: it exits.
  - [ ] A charging robot has `visibility: hidden` and its slot is lit; the decorator is called with
        `'spawn'` on exit and `'despawn'` on entry.

  **Verification:** `npx vitest run src/systems/workLoop.test.ts src/components/robot/Robot.test.tsx src/systems/worldTransition.test.ts src/systems/powerController.test.ts`.
  **Dependencies:** T17, T20, T22. **Files:** `src/systems/workLoop.ts`, `src/components/robot/Robot.tsx`,
  `src/systems/worldTransition.ts`, `src/systems/powerController.ts` (+ tests). **Scope:** M.

- [ ] **Task 24: Hand-over — the seam points at the loop; delete the legacy**

  **Description:** `onLifecycleChange` (moved into `workLoop.ts`) drives the loop; delete
  `lifecycleVisuals.ts`, `idleSystem.ts`, `RobotState`, `Robot.state`/`destination`/`direction`,
  `scoreJobAffinities`, `assignJob`, `JOB_MAX_ROBOTS_PER_TYPE`, `BATTERY_LOWER_THIRD_THRESHOLD`,
  `pickExitDestination`, the off-screen dock call and `initRobotIdleCounter`. Retire the
  `idle.target.*` dataIds.

  **Acceptance criteria:**
  - [ ] No reference to any deleted name in `src/`; the lifecycle's prove-it test still passes.
  - [ ] A full measure-driven cycle in an integration test: Active robot works → recalled → finishes
        → enters → charges (slot lit, hidden) → undocks → exits → works.
  - [ ] Mutation check: removing the turn-back branch fails the integration test's 200 BPM case.

  **Verification:** `npm test`; `npm run build:types`. **Dependencies:** T23. **Files:**
  `src/systems/workLoop.ts`, `src/systems/robotSystems.ts`, `src/systems/lifecycleVisuals.ts`,
  `src/systems/idleSystem.ts` (deleted, + tests), `src/types/Robot.ts`, `src/systems/spawnSystem.ts`.
  **Scope:** M.

- [ ] **Task 25: Card states**

  **Description:** `probe.status.activity` with the seven activities (spec §1.11), `ACTIVITY_LABELS`,
  `RobotSelectionCard`'s status line `{docking} · {activity} · {audibility}`, and an Activity row in
  `RobotDisplaySection` after Docked Status. Lore lines flagged for Crawford's review.

  **Acceptance criteria:**
  - [ ] Each activity renders its label on both surfaces; content test green; no literals.
  - [ ] The card line holds its largest-content width (project rule: controls hold their largest
        content size) — no reflow as activities change.

  **Verification:** `npx vitest run src/content src/components/selection src/components/robot/RobotDisplaySection.test.tsx`.
  **Dependencies:** T21. **Files:** `src/content/copy/probe.ts`, `src/data/robotSelectionConfig.ts`,
  the two card components (+ CSS, tests). **Scope:** M.

### Checkpoint C: J2 live
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Crawford, live on a few worlds: robots exit stations, go to buildings, orbiters hover-pulse,
      return and vanish into stations; no pops; no long waits; cards read correctly.
- [ ] **Phase 41's deferred halo gate**, original wording: a slow outward ring on exit, inward on
      entry, fading up and down; a volume/envelope edit reflected.

- [ ] **Task 26: J2 perf gate — stop and report**

  **Description:** Spec §5.4 method against J2's base (J1 tip): busy and Paint within the 17.2.5
  noise band, per-element counts for the robots layer (stations included), dated section in
  PERFORMANCE.md. Crawford's Pixel listen: no new dropouts.

  **Acceptance criteria:**
  - [ ] Table recorded; a miss stops here with ablations (stations hidden, moves off) for Crawford.

  **Verification:** the harness. **Dependencies:** Checkpoint C. **Files:** `docs/PERFORMANCE.md`.
  **Scope:** S.

- [ ] **Task 27: J2 docs**

  **Description:** ROBOT_LIFECYCLE.md rewritten around the two state machines, the loop, stations,
  recall and turn-back. ANIMATION_SYSTEM.md: the registry, the job timeline, the station arcs, keys.
  ROBOT_DESIGN.md: line 128 (job animations) and the orbiter lock. SESSION_STORAGE.md: "never
  persisted" reasons. CLAUDE.md: the ROBOT_LIFECYCLE reference line. Spec/intent `> **Shipped (J2)**`
  lines.

  **Acceptance criteria:**
  - [ ] Every named identifier spot-checked against source; docs tests green.

  **Verification:** `npm test`. **Dependencies:** T26. **Files:** the docs above. **Scope:** S.

---

### Phase J3: The move set (`feature/jobs-moves`)

- [ ] **Task 28: `trace`, `ring` and per-robot variation**

  **Description:** `jobMoves/trace.ts` (staggered run along `path`) and `jobMoves/ring.ts` (evenly
  phased circle at radius `r`), targets pure; `jobMoves/variation.ts` — `Alea(gemSeed + ':work')`
  for stagger, ring direction, radius ±15 % and trace direction. Structural Inspection and Acoustic
  Survey's ring switch from the J2 fallback.

  **Acceptance criteria:**
  - [ ] Trace: every orbiter visits every path vertex in order; ring: orbiters stay at `r ± 1` and
        evenly phased; both fit the job duration.
  - [ ] Variation deterministic per `gemSeed`; two gem seeds differ in at least one parameter.

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** J2 merged.
  **Files:** `src/animation/jobMoves/trace.ts`, `ring.ts`, `variation.ts`, `buildJobTimeline.ts`
  (+ tests). **Scope:** M.

- [ ] **Task 29: `carry`, `fan`, the spark flicker and the six-job table**

  **Description:** `jobMoves/carry.ts`, `jobMoves/fan.ts`, Maintenance's opacity spark-flicker, and
  `JOB_MOVES` (spec §1.9 table) with each job's `JOB_WORK_RATE` from T0. Reduced motion stays the
  in-place pulse for every job.

  **Acceptance criteria:**
  - [ ] Each job's timeline contains its moves in order and totals `jobDuration`.
  - [ ] Every move ends with orbiters reattached (`x: 0, y: 0`, scale and opacity restored).

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** T28.
  **Files:** `src/animation/jobMoves/carry.ts`, `fan.ts`, `jobMoveTable.ts`, `buildJobTimeline.ts`
  (+ tests), `src/constants/index.ts`. **Scope:** M.

### Checkpoint D: J3 live
- [ ] Clean build/lint/types/suite. Crawford, live: can he tell all six jobs apart at a glance?
      Company members visibly vary.

- [ ] **Task 30: J3 perf gate — stop and report** — as T26 against J2's tip. **Files:**
  `docs/PERFORMANCE.md`. **Scope:** S.

- [ ] **Task 31: J3 docs** — ANIMATION_SYSTEM.md moves section; BUILDING_DESIGN.md job → host →
  move table; spec `> **Shipped (J3)**`. **Scope:** XS.

---

### Phase J4: Depth layers (`feature/jobs-depth`)

- [ ] **Task 32: `findLayerSwitchPoint` and back-host plumbing**

  **Description:** Pure `findLayerSwitchPoint(from, to, robotBox, midgroundBounds)` (sampled every
  20 units, first clear point or `null`); `chooseNextSite` callers pass `backHosts:
  BACK_HOSTS_ENABLED` (still false); background sites skipped when no switch point exists.

  **Acceptance criteria:**
  - [ ] First clear point found; `null` when the leg is fully covered; a leg already clear returns
        `from`.

  **Verification:** `npx vitest run src/animation/jobMoves src/systems/siteChoice.test.ts`.
  **Dependencies:** J3 merged. **Files:** `src/animation/layerSwitch.ts` (+ test),
  `src/systems/workLoop.ts`. **Scope:** S.

- [ ] **Task 33: Split the scene layers; robots per layer; clicks**

  **Description:** `OceanScene` (spec §1.10): `back` → `robots-back` (moving) → `mid` (gradient 0-1,
  midground, gradient 1-2) → `bubbles` → `robots` → `front`. Robots render in the list for their
  `Robot.layer` (all `'foreground'` until T34). Layer `pointer-events: none` everywhere; `.robot`
  `pointer-events: auto`.

  **Acceptance criteria:**
  - [ ] DOM order of `data-scene-layer` matches the stack; a robot with `layer: 'background'`
        renders in `robots-back`.
  - [ ] A click on a back-layer robot selects it (test dispatches through the stacked layers).
  - [ ] OceanScene and perf-harness layer selectors updated; existing scene tests pass.

  **Verification:** `npx vitest run src/components/panels/screen/worldView`. **Dependencies:** T32.
  **Files:** `OceanScene.tsx`, `OceanScene.css` (+ test), `scripts/perf/idle-paint.mjs` (its
  selectors name `data-scene-layer` values — add `robots-back` and `mid`). **Scope:** M.

- [ ] **Task 34: Layer-aware legs; re-mount without a flourish**

  **Description:** The loop splits a leg at the switch point: swim there, write `layer` +
  `position`, mark the robot in the registry's `layerSwitching` set; `onRobotMounted` continues the
  leg; the robot `<g>` eases between scale 1 and `BACK_LAYER_SCALE` (0.75) over the second half.
  `RobotBody`/`useOrbiterMotion` skip the initial attach and re-register silently for a
  `layerSwitching` mount. Flip `BACK_HOSTS_ENABLED` to true.

  **Acceptance criteria:**
  - [ ] A robot sent to a background site switches only at a clear point and arrives at 0.75; the
        reverse trip restores 1 before any foreground site or station.
  - [ ] No orbiter attach hop on a layer-switch remount (spy on the attach tween).
  - [ ] Coverage still holds without background hosts (flag false → all J1–J3 tests green).

  **Verification:** `npx vitest run src/systems/workLoop.test.ts src/components/robot`.
  **Dependencies:** T33. **Files:** `src/systems/workLoop.ts`, `src/animation/robotMotionRegistry.ts`,
  `src/components/robot/RobotBody.tsx`, `src/components/robot/gem/useOrbiterMotion.ts`,
  `src/constants/index.ts` (+ tests). **Scope:** M.

### Checkpoint E: J4 live
- [ ] Clean build/lint/types/suite. Crawford, live: robots work among background buildings, never
      pop through a midground silhouette, no hitch at a layer switch (spec §7 Q3 — a hitch is a
      stop-and-report).

- [ ] **Task 35: J4 perf gate + Pixel — stop and report**

  **Description:** As T26 against J3's tip, plus the extra compositor layers' memory. Crawford's
  Pixel run is the gate. A miss: J4 does not merge; `BACK_HOSTS_ENABLED` stays false on main.

  **Files:** `docs/PERFORMANCE.md`. **Scope:** S.

- [ ] **Task 36: Final docs**

  **Description:** ANIMATION_SYSTEM.md scene stack and layer switch; ROBOT_DESIGN.md the 0.75
  back-layer scale; roadmap Phase 43 shipped with branch tips, decisions and Not Doing; backlog item
  8 moved to the archive; intent/spec/idea/sketch `> **Shipped**` headers.

  **Acceptance criteria:**
  - [ ] Every named identifier spot-checked; docs tests green; CLAUDE.md reference line current.

  **Verification:** `npm test`. **Dependencies:** T35. **Scope:** S.

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean on the last branch.
- [ ] Every perf gate recorded with Crawford's verdict; every live gate's verdict recorded.
- [ ] Any manual check not performed is listed here explicitly, never silently skipped.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A branch merges with robots frozen or stranded on screen | High | Correction 1: the legacy adapter keeps today's visuals until J2's hand-over; Checkpoint A checks them live |
| The flat drain changes how many robots are on screen or how much you hear | Med | T2 measures today vs candidates on the same replay code before T3 flips; Crawford picks the value |
| Robots wait too long or never find work in sparse worlds | High | T12 guarantees coverage over the seed grid; T15 sims waiting at both tempos and pins the cooldown before any loop code |
| The lifecycle and the visuals desync (hidden tab, 200 BPM, short charges) | Med | Every `next()` reconciles against `docking`; T15 counts turn-backs and "charging while visible"; T24's integration test covers the 200 BPM turn-back (mutation-checked) |
| Orbiter count changes mid-job fight the job timeline | Med | T17's lock suppresses `reconcile`; the catch-up is one pass, tested with a 4-change sequence |
| Job timelines or waits leave standing GSAP objects (the Phase 40 +63 % lesson) | High | One timeline per job run, finite waits, `stopWorkLoop` kill test; T26/T30 gates with per-element counts |
| Stations add per-frame paint in the moving layer | Med | 16-shape budget asserted in T20; slot lights re-render only on count change; T26 ablates stations |
| A layer-switch remount reads as a hitch | Med | T34 suppresses the attach flourish; Checkpoint E judges it; a hitch is a stop-and-report (spec §7 Q3) |
| The second robot layer costs too much on the Pixel | High | J4 is last and behind `BACK_HOSTS_ENABLED`; T35 is a Pixel gate; a miss means J4 doesn't merge |
| Starting J1 before districts D1 + D2 merge | Med | Plan header; T7's exhaustiveness test fails to compile without `SceneryKind` |

## Open Questions (carried from spec §7, with the plan's recommendation)

1. **Station design** — T0 carries a placeholder and a marked slot for Crawford's drawing; T20 uses
   whichever is signed off.
2. **Coverage top-up lists** — written in T12 against D2's real hosts; wreck field first.
3. **J4 re-mount cost** — judged at Checkpoint E; a hitch stops for Crawford (alternative: one
   robot layer with midground clipping).
4. **Lore copy** for Salvage, Maintenance and the seven activities — flagged in T4 and T25 commits
   for Crawford's review.
5. **Constants** — `BATTERY_DRAIN_ACTIVE` (T2), `COOLDOWN_*` (T15), job rates and station geometry
   (T0) — each pinned at its stop-and-report.
6. **New (plan-time):** corrections 1–5 at the top; T16 folds them into the spec.
