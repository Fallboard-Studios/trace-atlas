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

> **Spec corrections found while planning (folded into the spec by Task 16, 2026-10-07):**
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
moves, the station enter/exit and the placeholder station before any code *(as shipped: split into
0a, the station, and 0b, the moves and jobs, both passed 2026-10-07 — see Task 0; Task 16b carries
their code changes into J2)*. **J1** (Tasks 1–16)
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
  - [x] Every move and job plays at 1× at world scale; ~~orbiter count visibly changes speed~~
        *(cut at the gate: duration follows BPM, orbiter count only sets how many orbiters work)*.
  - [ ] Station enter/exit reads as "into" and "out of" the station, not a fade-out next to it.
  - [ ] Crawford's verdict recorded in the sketch header; the constants he keeps written into spec
        §1.6/§1.9 (Task 16 or the J2 task that consumes them).

  **Verification:** Crawford, by eye. **Dependencies:** None. **Files:**
  `docs/sketches/robot-jobs-and-stations.html`. **Scope:** M (one file, the gate before code).

  **As shipped (2026-10-07): split into 0a and 0b.** The station panel ran first, as its own file,
  because its design came out of a working session rather than the placeholder gem; the moves and
  jobs panel is still to build.

  - [x] **Task 0a: Station sketch — `docs/sketches/robot-charging-station.html`.** Six seeded
    rolls plus a motion stage with enter/exit, built with Crawford live. Both station criteria
    above pass. Design and verdicts are in the file header and folded into spec §1.6. Headline
    results: box **200 × 200**; four loosely triangular gem layers, L4 solid, L1–L3 rings cut into
    three pieces; six of the nine pieces are the slots, lit back-to-front in the stored robot's
    identityColor with one light dot each; a port gem at the centre and a static halo (radius 60)
    both brighten with occupancy; **no bob** (spec §1.6's no-continuous-animation rule stands);
    `STATION_ARC_SECONDS` **1.0**, ripple one whole cycle per arc, ring width 0.2; gap, band
    width, rotation spread and size falloff are **driven live by the world's global rig** (HPF,
    LPF, EQ3 mid, EQ3 low−high tilt — ranges in §1.6). Two structural findings for J2: the station
    renders as **three fragments interleaved with the robots** (L4 · exiting robots · L3 · entering
    robots · L2 · halo · L1), and the **exiting robot appears in the back robot row** (J4's layer,
    0.75 scale under the 0-1 depth tint) — T20 gains a J4 dependency with a front-row fallback.
    Left TBD in the header: depth tint on/off and opacity, swim speed, back-row scale, enter/exit
    sides, port = centre, the chosen roll. Verified in jsdom over 60 seeds × 6 stations
    (3,240 pieces, none degenerate), not by eye in a browser beyond Crawford's session.
  - [x] **Task 0b: Moves and jobs sketch — `docs/sketches/robot-jobs-and-stations.html`.** The
    (a)/(b) panels above: a robot beside a Refinery-style factory and a dome playing the five moves
    and six job sequences, with the orbiter-count, `JOB_WORK_RATE` and `JOB_BASE_SECONDS` sliders,
    reduced motion and the 0.75× toggle. Gates T19/T20's timing constants and J3; build on the J2
    branch before T19.
    **As shipped (2026-10-07, passed):** built on `feature/job-lifecycle-2` right after 0a. Two
    hand-drawn hosts with hand-placed points (mouth, mast, valve, a, b) and two paths (outline,
    pipe); five move buttons, six job buttons chaining them per §1.9, auto-cycle alternating hosts,
    scrubber, per-robot seeded variation, reduced motion and the 0.75× back layer under the depth
    tint. **Crawford changed direction on timing at the gate:** orbiter count no longer drives
    speed; `jobDuration(bpm)` = 10 s at 20 BPM → 6 s at 200 BPM, linear; `JOB_WORK_RATE` and
    `JOB_MIN_SECONDS` retired; `ATTACH_DURATION` 1 s. Move weights kept as sketched (now listed in
    §1.9), flights inside the duration (A1) and two paths per site (A2) confirmed — §1.5's
    `WorkSite.path` becomes `paths: { outline, pipe? }` at T19. Verified in jsdom: 176 runs (11
    runs × 2 hosts × foreground on/off × 4 counts), no errors, every orbiter docked at start and
    end. **Knock-on:** Task 15's cooldown was pinned against 2.2–4.3 s jobs; Task 16b re-runs the
    sim at 6–10 s before J2.

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
  (x0 ≥ 1977). Points, path and the park centre use the part of the roof inside [0, 1920]. A
  roof wholly outside first fell back to the whole roof; since Crawford's "off screen means no
  job" ruling (see T12 (7)), such an actor hosts nothing, and the fallback is gone. (4) Per variant: Stacks/Refinery `[mouth, valve]`, where the mouth is the bubble vent's x
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

- [x] **Task 10: Work sites — scenery group A (tank, dome, scaffold, containers, wreck, vent)**

  **Description:** Per-kind anchor functions beside `deriveSceneryParams` (one
  `sceneryWorkAnchors.ts` in `components/actors/scenery/`), reading only those parameters: tank
  gauge + shoulder line, dome portholes + hatch + dome arc as `path`, scaffold top frame + brace
  points, container label squares + stack top, wreck deckhouse/funnel + hull line, vent mouth.
  `getWorkSite` dispatches to them.

  **Acceptance criteria:**
  - [x] Each kind: same invariants as T9 over 50 seeds per kind; anchors lie inside the silhouette's
        `bounds` (or ≤ 40 above it for mouths/masts). — at both depths. The foreground rule is
        measured against the true top outline (on a vertical step's edge counts as on it).
  - [x] A param change in `deriveSceneryParams` moves the anchors (mutation check on one kind).

  **As shipped:** (1) Each kind's anchors return `{ bounds, outline, points, path }`. `outline`
  is the silhouette's x-monotonic top edge, which is what "on or above" is measured to. It isn't
  on `WorkSite`. (2) **Shared layouts, not re-derived.** The geometry that was more than a
  one-liner moved out of the renderers into exported helpers that the renderer and the anchors
  both call: `domePortholeCentres`, `scaffoldBraces`, `containerRows`, `wreckLayout`. The tank,
  dome, scaffold and vent constants the anchors need are exported too. All four renderers' tests
  pass unmodified. (3) **Render-parity tests.** Every named anchor is checked against the element
  it names in the rendered DOM: the tank gauge, dome mast light / portholes / hatch, scaffold
  light and braces, container labels and stack top, wreck funnel, vent mouth glow and plume. The
  vent mouth is also checked against the bubbles. The bounds must contain every drawn
  rect/polygon/circle, with lights up to 40 above. (4) Foreground vs. not:
  - Foreground keeps to the outline: tank top between the shoulders, dome portholes (on the arc),
    scaffold post heads, container outline samples.
  - Midground also uses facade points: tank gauge, dome hatch, scaffold brace, container labels.
  - Wreck and vent points are all on the outline at every depth.
  (5) **The park has its own seeded stream** (`Alea(id + ':park')`), so the park doesn't depend
  on how many draws a kind's points take. This changed the T9 factory parks' seeded offsets, but
  not their rule. (6) Scenery points are not clipped to the visible span; only the park centre
  is. The group-B kinds return `null` until T11 (pinned by a test that T11 must flip). (7) Mutation
  checks: ignoring the passed params, a facade hatch on a foreground dome, `foreground` never set
  by `workSites`, and dropping the scaffold overhang from its bounds each fail tests.

  **Verification:** `npx vitest run src/components/actors/scenery src/systems/workSites.test.ts`.
  **Dependencies:** T9. **Files:** `src/components/actors/scenery/sceneryWorkAnchors.ts` (+ test),
  `src/systems/workSites.ts`. **Scope:** M.

- [x] **Task 11: Work sites — scenery group B (crane, pylon, beacon, pipeline, turbine, floodlight, dish)**

  **Description:** The structural kinds: crane beam ends + hanger, pylon head + cross-arms, beacon
  gem, pipeline run as `path` + valve + riser top, turbine hub, floodlight head, dish centre + feed.

  **Acceptance criteria:**
  - [x] Same invariants as T10; the exhaustiveness test now passes for every host kind
        (`getWorkSite` non-null for every host in `jobHosts`). — every host the placer puts down
        over the 121-seed grid, factory or scenery, at every depth; every non-host stays null.
        `ANCHORED_KINDS` now equals the 13 non-empty `SCENERY_HOST_JOBS` rows (pinned).

  **As shipped:** (1) **Shared layouts again.** Each group-B renderer's geometry moved into an
  exported helper the renderer and the anchors both call: `craneLayout`, `pylonArms` /
  `pylonTowerTop` / `pylonHeadCentre`, `beaconGem` (+ `gemChamfer` in `gemShape.tsx`),
  `pipelineLayout`, `turbineLayout`, `floodlightLayout`, `dishLayout`. All renderer tests pass
  unmodified. (2) **Rotated kinds.** Turbine blades and the dish sit in `rotate(…)` groups, so
  their anchors apply the same rotation. The turbine's outline is the rotor bar's upper edge
  (leftmost → topmost → rightmost corner). The dish's is the tilted reflector's upper rim, with
  the left/top/right extremes exact. The test's shape-extent helper now follows a group's
  `rotate` and measures ellipses exactly; the vent plumes and the floodlight's beam and pool are
  skipped as translucent decoration. (3) Per kind:
  - Crane: the beam's top. Foreground `[left end, hanger head, right end]`; midground
    `[left end, load centre, beam-end light]`.
  - Pylon: the tower's narrow top. Foreground `[head, top corners]`; midground `[head, both ends
    of one seeded cross-arm]`. The head follows `SCENERY_GEM_ACCENTS`.
  - Beacon: the gem's top edge. Bounds include the gem, which can be wider than the foot
    (64 vs 60). Midground `[gem centre, gem top, a seeded foot point]`.
  - Pipeline: one set at every depth: `[valve, riser top, a seeded run point]`. `path` is the pipe
    run from the flange's inner edge to the far end, so it never passes under the riser.
  - Turbine: foreground on the rotor's upper edge; midground `[hub, both blade tips]`.
  - Floodlight: the head's top; midground `[lit bar, a head-top point]`.
  - Dish: foreground on the rim; midground `[centre light, feed tip, a rim point]`. The feed may
    rise past the rim like a mast; the box's top is the reflector's.
  (4) **Found, not fixed (renderer, out of scope):** the crane's knee brace is a zero-area
  polygon. All four of its vertices lie on one 45° diagonal, so it draws nothing, and the line it
  traces runs *up* from the beam's underside to 24 above the beam's top. The anchors ignore it.
  (5) Mutation checks: dropping the crane light from the bounds, an unrotated turbine, a pipe run
  under the flange, always the first pylon arm, beacon bounds from the foot only, and an untilted
  dish rim each fail tests. (6) The T10 titles' mojibake (`â€”` etc.) in
  `sceneryWorkAnchors.test.tsx` was fixed in passing.

  **Verification:** as T10. **Dependencies:** T10. **Files:** as T10. **Scope:** M.

- [x] **Task 12: Coverage guarantee and top-up lists**

  **Description:** `jobCoverage.ts`'s `ensureJobCoverage(localeId)` (spec §1.4) counts eligible
  midground + foreground hosts per job and appends `coverageTopUp` items through the district
  placer's row machinery at `'locale.coverage.x'` until ≥ 3 jobs have ≥ 4 hosts. Each recipe in
  `districtRecipes.ts` gains its ordered `coverageTopUp` list (wreck field first). `placeDistrict`
  calls it.

  **Acceptance criteria:**
  - [x] Over the 121-seed grid every world satisfies the rule after placement; top-ups are
        deterministic and ground-locked; the recipe element budgets still hold. — the shape
        budget is checked at each kind's real `maxShapes` with every top-up placed; no top-up is
        a vent, so the vent cap is unchanged.
  - [x] Mutation check: emptying wreck field's top-up list fails the grid test.
  - [x] Worlds that already satisfy the rule are unchanged (no top-up placed — asserted on a seed).

  **As shipped:** (1) **Far more worlds fell short than the spec expected.** The spec named
  wreck field (2 vents) as the known case. Measured before the change over the 121-seed grid,
  56 worlds failed: every ventfield (13), derelict (10), wreckfield (11) and outskirts (13)
  world, and 9 of 15 towers. Dense, yard, habitat and construction never fail. The missing
  third job is nearly always acoustic survey or maintenance, so the lists lead with midground
  pylons, which host both. After the change: 92 top-ups over 56 worlds, at most 3 per world.
  ventfield gets floodlight + pylon + crane (all 13 worlds), wreckfield 3 pylons, outskirts 1–2
  pylons (24 over 13 worlds, + a tank in 6), derelict 1 pylon, towers 1–2 pylons. (2) **Shape of the data.**
  `RECIPES` is `Record<DistrictName, DistrictRow[]>`, an array per district, so the lists sit
  beside it as `COVERAGE_TOP_UP: Record<DistrictName, CoverageTopUp[]>` (`{ kind, depth }`,
  scenery only, midground/foreground only). (3) **Top-up rows.** Top-up `i` is placed on row
  `recipe.length + i`, and `getRecipeRow` resolves that to `coverageTopUpRow(topUp)`. That row
  is ground-locked in the foreground, at `MG_FLOOR` in the midground, `count: 1`,
  `derelict: 0` (a derelict roll would swap the jobs it was placed for). So Scenery.tsx,
  jobHosts, workSites and OceanScene's depth sort read top-ups with no change. The tests that
  assumed `row < recipe.length` (districts, factoryPlacementSystem) now go through
  `getRecipeRow`. (4) **Signature.** `ensureJobCoverage(actors, topUps, place)` is pure, and
  the placer is passed in, not `ensureJobCoverage(localeId)`. The seeded counters (scenery id,
  derelict, AS recolor index) live inside `placeDistrict`. Placing top-ups through the same
  closure keeps them in that sequence, so `recolorActorsForAttenuationStyle`'s in-order index
  still matches. The scenery item build moved into a shared `placeScenery` closure. A gem-gated
  beacon returns null and the walk moves on. (5) `x` = 15 %–85 % of the width from
  `'locale.coverage.x'` at offset `i`, re-hashed through `alea()` (the bell-curve fix
  `rollDerelict` uses). (6) Mutation checks: no coverage call, every top-up on one row, and a
  walk that ignores the stop rule each fail tests. (7) **Off screen means no job** (Crawford, 2026-10-07, settling T9 (3)). `hostJobs`
  returns `[]` for an actor whose drawn body lies wholly outside `[0, WORLD_WIDTH]`: the
  factory box, or the scenery anchors' bounds. A body that straddles an edge still hosts. This
  removed 43 grid hosts: 8 foreground Warehouses past the right edge, and 35 foreground
  floodlights that the left-edge spread (starting at x = −20) puts wholly off the left edge;
  only their beams reach the screen. Coverage still holds on every grid world with the same
  top-ups. `workSites.ts`'s wholly-off-screen fallback (T9 (3)) became unreachable and was
  removed. Spec §1.3 updated.

  **Verification:** `npx vitest run src/systems/jobCoverage.test.ts src/systems/districtRecipes.test.ts src/systems/districts.test.ts`.
  **Dependencies:** T7, T11. **Files:** `src/systems/jobCoverage.ts` (+ test),
  `src/systems/districtRecipes.ts`, `src/systems/districts.ts`. **Scope:** M.

- [x] **Task 13: `stations.ts`**

  **Description:** `getStations(localeId): Station[]` (spec §1.6) — count 2–3, positions with
  re-draw until spacing ≥ `STATION_MIN_SPACING` and no overlap with any host `bounds`, cached like
  `getRobotGem`. `assignStationsAtLoad(robotIds, stations)` (index modulo count) and
  `nearestFreeStation(centre, stations, occupancy)`. Station box size from the sketch (T0).

  **Acceptance criteria:**
  - [x] Over the seed grid: 2–3 stations, pairwise spacing ≥ 480, no host overlap, inside
        x [240, 1680] / y [220, 560]; deterministic. — 50 of 121 worlds roll 3; 44 fit around
        their hosts, 6 step down to 2. No grid world needs the overlap fallback.
  - [x] Load assignment never exceeds capacity 6; `nearestFreeStation` skips a full station.

  **As shipped:** (1) **The box size is a placeholder.** T0 hasn't run, so
  `STATION_BOX_W/H` = 160 × 120 and `port` = the centre. Both are marked placeholder in
  `constants/index.ts` and the module. The sketch replaces them, and the grid tests re-check
  the overlap rule at whatever size it picks. (2) **Pure core.** `deriveStations(noiseMap,
  obstacles)` is pure. `getStations(localeId)` reads the locale's coordinates and actors from
  the store and caches by the actors array (a `WeakMap`), so a re-placed world re-derives.
  It returns `[]` for an unknown locale. Never cache by actor id (T9 gotcha). (3) **Obstacles
  are every host at every depth** (`hostObstacles`: each `getWorkSite` bounds), background
  too, so J4 flipping `BACK_HOSTS_ENABLED` doesn't move any station. (4) **One draw at offset
  0 is near-constant.** At `y = 0`, simplex noise takes about 3 values across all worlds.
  With one sample, no grid world rolled 3 stations, and first stations clumped (86 distinct
  centres over 121 worlds). Every station draw now hashes three samples, at `offset + [0,
  137.42, 911.77]`, through `alea()`. That's `pickDistrict`'s fix. Result: 121 distinct first
  centres and 50/121 three-station worlds. (5) **Layouts restart.** Greedy placement
  dead-ends when the first two stations land near the middle: 3 points ≥ 480 apart in
  1440 × 340 leave little room. So a station that finds no spot in 16 candidates restarts the
  whole layout from the next draw, up to 16 layouts. If no layout fits, the count steps down
  to 2. If 2 don't fit, the overlap rule goes (spacing always holds). The last fallback is the
  range's two ends. So the roster always fits. (6) `assignStationsAtLoad` throws rather than
  overfill (the fixed roster never does). `nearestFreeStation` treats a missing occupancy
  entry as empty, breaks ties to the earlier station, and returns null when everything is
  full. (7) Mutation checks: no spacing check, no obstacle check, one layout only, one sample
  per draw, no step-down, `>` for full, and no capacity throw each fail tests.

  **Verification:** `npx vitest run src/systems/stations.test.ts`. **Dependencies:** T11 (bounds),
  T0 (box size). **Files:** `src/systems/stations.ts` (+ test), `src/constants/index.ts`.
  **Scope:** S.

- [x] **Task 14: `siteChoice.ts` — `chooseNextSite`, `siteCooldown`, held jobs**

  **Description:** The pure decision functions of spec §1.7 and §4's snippet, in their own module
  (correction 3), plus `heldJobs(robots, selfId)` per correction 4. `siteCooldown(n) = clamp(n ×
  COOLDOWN_PER_SITE, COOLDOWN_MIN, COOLDOWN_MAX)` with the first-guess constants.

  **Acceptance criteria:**
  - [x] Keeps the robot's job when a ready site hosts it (nearest wins); otherwise prefers an unheld
        job, weighted by ready-site count (seeded `rand`, frequency test over 10 000 draws within 2 %);
        falls back to held jobs when all are held; `null` when nothing is ready.
  - [x] `heldJobs` ignores charging/returning/entering robots and the robot itself.
  - [x] `siteCooldown` clamps at both ends.

  **As shipped:** (1) **`RobotActivity` came forward from T21.** `heldJobs` reads `activity`,
  so the type is now in `types/Robot.ts`. The `Robot.activity` field still arrives with its
  writer in T21. `heldJobs` takes a structural `HeldJobsRobot` (`id`, `docking`, `job?`,
  `activity?`), so T21 needs no change here. A robot with no `activity` holds nothing. (2) **A
  non-Active robot holds nothing**, whatever its activity (correction 4 says "whose `docking` is
  Active"). (3) **Spec §4's snippet, as written.** Keeping the job never draws `rand`, and a
  switch draws exactly once. A multi-job site adds one to each of its jobs' weights. Only jobs
  with a ready site count toward "every job is held". Distance is Euclidean from the robot's
  centre to the site's `park`, and ties go to the earlier site. (4) `COOLDOWN_PER_SITE` 0.6,
  `COOLDOWN_MIN` 4, `COOLDOWN_MAX` 30 (seconds) are first guesses until T15. (5) `Robot.test.ts`'s
  old-state guard matches the string `'docking'`, so `Pick<Robot, 'docking' | …>` trips it. The
  shape is spelled out instead. (6) Mutation checks: no keep step, held jobs ignored, no held
  fallback, unweighted pick, unready sites kept, x-only distance, ties to the later site, either
  clamp removed, self counted, non-Active counted, and charging holding a job each fail tests.

  **Verification:** `npx vitest run src/systems/siteChoice.test.ts`. **Dependencies:** T7.
  **Files:** `src/systems/siteChoice.ts` (+ test), `src/constants/index.ts`. **Scope:** S.

- [x] **Task 15: Readiness and handoff sim — stop and report**

  **Description:** Extend `lifecycleSim.ts` with a loop sim: the real lifecycle at a given BPM, real
  work sites and stations per seed, `chooseNextSite` + `siteCooldown`, swims at `SWIM_SPEED`, job
  durations from `jobDuration` with orbiter counts from each robot's `rhythmicDensity`, station arcs
  at `STATION_ARC_SECONDS`. Report per seed and overall: mean/p95 waiting share and longest wait,
  job switches per active stint, turn-backs at 20 and 200 BPM, and any robot `charging` while
  visible.

  **Acceptance criteria:**
  - [x] Deterministic; no store, BeatClock or GSAP. — `runLoopSim` and `runReadinessSim` (given
        placed worlds) are spied store-, BeatClock- and GSAP-free; placing the grid's worlds
        (`placeDistrict`) stays in the test, as in the coverage and stations tests.
  - [x] Report posted; Crawford confirms `COOLDOWN_*` (target: mean waiting < 10 % of active time,
        no wait > 15 s) and the constants are written back. — the first guess missed; **Crawford
        chose 0.4/3/30 (2026-10-07)**, written to `constants/index.ts`. The mean target holds at
        both tempos (6.4 % / 3.7 %), and so does the 15 s cap at 200 BPM (14 s). The 20 BPM
        longest wait (34 s) is accepted as measure-bound. He picked it over 0.3/2/30 for more job
        variety (3.92 vs 3.24 switches per stint at 20 BPM).
  - [x] Zero "charging while visible" cases at both tempos.

  **As shipped:** (1) **Pulled forward.** `jobDuration` (T19's
  pure function, `src/animation/jobMoves/jobDuration.ts`) with `JOB_BASE_SECONDS` 5,
  `JOB_MIN_SECONDS` 1.5 and `JOB_WORK_RATE` 0.7 for every job (the spec's 0.5–0.9 midpoint; T0
  gives each job its own). `WAIT_RETRY_SECONDS` 2 and `STATION_ARC_SECONDS` 0.9 are in constants.
  `SWIM_SPEED` (from `swimAnimation.ts`) and `BEATS_PER_MEASURE` (from `beatClock.ts`) moved into
  constants, and both modules import them, so the sim has no second copy. (2) **The model.**
  `runLoopSim` is an event loop in seconds (spec §1.7, one world) interleaved with lifecycle
  measures of 4 × 60 / BPM s. Active → Recalled is `'recalled'`, anything → Active is `'active'`,
  and measures win ties. Robots start at their load-assigned station's port (correction 2: Active
  ones exit at t = 0). The lifecycle step and the cooldown are injectable, so scripted lifecycles
  test each spec §1.7 branch to the hand-worked second: recall mid-job, in transit, waiting or
  exiting, turn-back mid-return, mid-entry and at entry end, a full station skipped. An abandoned
  transit releases its site **with no cooldown** (the robot never worked there). Sim site ids are
  actor indexes (actor ids can repeat). (3) **"Charging while visible"** is checked as the
  invariant `activity === 'charging' && visible`, and it is 0 everywhere. The lifecycle reading
  (Docked or Undocking while still visible) is reported separately as "Longest Docked visible". It
  is non-zero by design (spec §1.7 `'docked'`: keep returning). At 200 BPM a robot is still
  swimming home up to 16.7 s after it docked. (4) **Turn-backs are 0 at both tempos, and
  structurally so.** Recharge 5 per measure from ≤ 10 makes the shortest Docked stay about 20
  measures (24 s at 200 BPM). That outlasts the longest walk home (finish a ≤ 4.3 s job, swim
  ≤ ~1500 px, 0.9 s entry). The turn-back branches are covered by the scripted tests only.
  (5) **Results (121 seeds × 600 s, `LIFECYCLE_SIM_REPORT=1 npx vitest run src/systems/lifecycleSim.test.ts`):**

  | Cooldown | BPM | Mean waiting | p95 waiting | Longest wait | p95 wait | Switches / stint | Seeds missing a target |
  |---|---|---|---|---|---|---|---|
  | 0.6/4/30 (first guess) | 20 | 10.9 % | 24.0 % | 42 s | 10 s | 4.48 | 69 / 121 |
  | 0.6/4/30 (first guess) | 200 | 7.3 % | 17.3 % | 17.1 s | 8 s | 0.60 | 32 / 121 |
  | **0.4/3/30 (shipped)** | 20 | 6.4 % | 17.3 % | 34 s | 8 s | 3.92 | 32 / 121 |
  | **0.4/3/30 (shipped)** | 200 | 3.7 % | 12.4 % | 14 s | 6 s | 0.46 | 15 / 121 |
  | 0.3/2/30 | 20 | 4.2 % | 11.5 % | 30 s | 7.3 s | 3.24 | 15 / 121 |
  | 0.3/2/30 | 200 | 2.4 % | 9.3 % | 12 s | 4.2 s | 0.39 | 3 / 121 |
  | 0.2/2/30 | 20 | 2.7 % | 10.2 % | 36 s | 4 s | 2.70 | 8 / 121 |
  | 0.2/2/30 | 200 | 1.5 % | 5.8 % | 8 s | 4 s | 0.30 | 1 / 121 |
  | 0/0/0 (reference) | 20 | 0.0 % | 0.0 % | 48 s | 48 s | 0.00 | 3 / 121 |
  | 0/0/0 (reference) | 200 | 0.0 % | 0.0 % | 6 s | 6 s | 0.00 | 0 / 121 |

  **The "no wait > 15 s" target can't be met at 20 BPM by any cooldown, zero included.** Traced
  case: world (−120, 80) has 9 sites, and all 9 were held by working robots while a 10th waited
  24 s (two measures). When more robots are Active than there are sites, only a recall frees one,
  and at 20 BPM recalls come every 12 s. Zero rest also means zero job switches (robots camp on one
  site). Waits are multiples of `WAIT_RETRY_SECONDS`. Eligible sites per world: 9–24 (median 14).

  **Verification:** `npx vitest run src/systems/lifecycleSim.test.ts`. **Dependencies:** T13, T14.
  **Files:** `src/systems/lifecycleSim.ts` (+ test), `src/constants/index.ts`; as shipped also
  `src/animation/jobMoves/jobDuration.ts` (+ test), `src/animation/swimAnimation.ts`,
  `src/engine/beatClock.ts`. **Scope:** M.

### Checkpoint B: J1 complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. — Crawford ran
      them at 20fd82d9 (2026-10-07).
- [x] J1 perf: busy-only `perf:idle` vs the branch base — no measurable change expected (nothing new
      draws); a change is a stop-and-report. — **passed** 2026-10-07: busy median 1892 vs 1921 ms
      (−1.5 %), paint 238 vs 241 (−1.2 %), inside the base's own spread; three rotated rounds on
      the D3 gate's pinned hour-0 world (docs/PERFORMANCE.md, "Robot Jobs J1").
- [x] Reviewed with Crawford; J1 merge decision is his. — approved for merge 2026-10-07.

- [x] **Task 16: J1 docs and spec corrections**

  **Description:** ROBOT_LIFECYCLE.md: renamed states, flat drain with the T2 table, the narrowed
  snapshot, the seam. PROCEDURAL_GENERATION.md: `station.*`, `locale.coverage.x`. BUILDING_DESIGN.md:
  hosts, work sites, coverage. Fold corrections 1–5 and the T0/T2/T15 constants into the spec.
  Roadmap Phase 43 status line.

  **Acceptance criteria:**
  - [x] Every named identifier spot-checked against shipped source; docs tests green. — every
        export, constant, dataId and test file named was grepped in `src/`, the removed names
        confirmed absent; docs tests 184 green, full suite 6795.

  **As shipped:** (1) **ROBOT_LIFECYCLE.md** is rewritten for J1 as it stands. It covers the
  renamed states, the flat drain with the Task 2 table, the narrowed snapshot and `DrainRule`, a new
  "Visual Seam" section (what the legacy adapter does per `to`, and `dockCycles.ts`), and a new
  "Headless Sims" section (drain and loop sims, the turn-back and Docked-but-visible findings). It
  also says what J2 deletes. The wandering and exit-swim sections are kept, marked legacy until
  J2. J2 (Task 27) rewrites the doc for stations and the loop. (2) **BUILDING_DESIGN.md** has a new
  "Robot jobs — hosts, work sites, coverage" section, plus a note on the top-up rows in
  `getRecipeRow`. Two stale passages were fixed: "Runtime fields & production timing" (the deleted
  production fields) and the unbuilt "Offline State" goal (its `config.isOffline` wiring is gone).
  (3) **PROCEDURAL_GENERATION.md** gains call-site rows for `stations.ts` (`'station.*'`),
  `districts.ts`'s `'locale.coverage.x'` and `workSites.ts`'s `Alea` streams. The deleted
  `interactionSystem.ts` row is gone. A gotcha records the three-sample hash and why it was needed.
  (4) **The spec** opens with an amendment block (corrections 1–5, the measured values, what still
  waits for the sketch). Inline *(J1)* notes are in Assumptions 3 and 10 and §1.1, §1.2, §1.3,
  §1.4, §1.5, §1.6, §1.7, §1.9, §2, §5.1, §5.2 and §7. Open question 2 is resolved, and a sixth
  (background Skyscraper parks, for J4) was added. **Task 0's constants are not folded in: the
  sketch hasn't run.** The spec lists what is still a placeholder. (5) **Roadmap** Phase 43
  status: J1 code-complete, with Checkpoint B's review and merge call still Crawford's. (6) **Found,
  not fixed:** PROCEDURAL_GENERATION.md still describes `?seed=` / `?x=` / `?y=` as live (they were
  removed 2026-09-28). That is outside this task, so it's flagged rather than rewritten.

  **Verification:** `npm test`. **Dependencies:** T1–T15. **Files:** the docs above, the spec,
  `docs/todo/roadmap.md`. **Scope:** S.

**J1 code review (2026-10-07, after Checkpoint B).** Four findings, each fixed in its own commit:
(1) **Coverage top-up x had almost no spread.** One `'locale.coverage.x'` sample re-hashed through
`alea()` took 3 values at offset 0 over the grid, so all 56 topped-up worlds stood their first
top-up at x = 368, 929 or 1538. It is now a `getUniformSeededVal` draw. That is the three-sample
hash, extracted from `pickDistrict` and `stations.ts` into `src/utils/getSeededVal.ts` with no
change to their output. Top-ups move in those 56 worlds. The Task 15 table above predates this.
Re-run at the shipped 0.4/3/30: mean waiting unchanged (6.4 % / 3.7 %), turn-backs and
charging-visible still 0. The 200 BPM longest wait went 14 s → 17.1 s; seeds missing a target
went 32 / 15 → 33 / 13. (2) **Bubble vents read `factoryGeometry`**, the third copy of the
variant/size derivation gone. `ventY` is now the drawn (rounded) roof `box.y0`, ≤ 0.5 px. (3)
**Coverage counts each actor once** (`eligibleHostJobs`; incremental top-up counts):
`placeDistrict` 3.6–4.2 → 1.8–2.4 ms per world on desktop. (4) **`gemChamfer` moved to
`gemGeometry.ts`**, clearing the one lint warning the branch added.

---

### Between J1 and J2: the sketch gate's code (`feature/job-lifecycle-2`)

- [x] **Task 16b: `jobDuration(bpm)`, the retired constants, and the readiness sim re-run**

  **Description:** Carry Task 0b's timing verdicts into code before J2 builds on them. Rewrite
  `src/animation/jobMoves/jobDuration.ts` as `jobDuration(bpm): number` = `lerp(JOB_BASE_MAX_SECONDS,
  JOB_BASE_MIN_SECONDS, clamp((bpm − 20) / 180, 0, 1))` with `JOB_BASE_MAX_SECONDS` 10 and
  `JOB_BASE_MIN_SECONDS` 6 in `constants/index.ts`; delete `JOB_BASE_SECONDS`, `JOB_MIN_SECONDS`
  and `JOB_WORK_RATE`; `ATTACH_DURATION` 0.5 → 1.0 (`orbiterMotion.ts` — check Phase 40's attach
  tests for the value). Re-run Task 15's readiness sim with the new durations at 20, 110 and 200
  BPM (`npx vite-node` as before) and **stop and report**: longer jobs hold sites longer, so the
  0.4/3/30 cooldown may need re-pinning. Spec §1.9 and §5.2 then record the re-run's table.

  **Acceptance criteria:**
  - [x] `jobDuration(20)` = 10, `jobDuration(110)` = 8, `jobDuration(200)` = 6; clamped outside 20–200.
  - [x] No reference to `JOB_WORK_RATE`, `JOB_MIN_SECONDS` or `JOB_BASE_SECONDS` remains in `src/` or `scripts/` (grep; docs keep them as history).
  - [x] The readiness sim runs and its table is in the commit message; cooldown decision recorded.
        — table in 311716f1's message and below; **Crawford chose 0.3/2/30 (2026-10-07)**.

  **As shipped:** (1) **The function** is as described, with the 20/200 BPM ends as file-local
  constants. Tests cover the three named tempos, linearity, strict monotonicity and the clamp
  (below 20, 0, negative, above 200, 240 and `Infinity`). (2) **The sim lost its orbiter
  plumbing.** `simOrbiterCounts`, `LoopSimOptions.orbiterCounts` and its parity test are gone, since
  orbiter count no longer touches timing. A job lasts `jobDuration(bpm)` at the sim's tempo.
  `SIM_LOOP_BPMS` is now `[20, 110, 200]`. Two scripted turn-back tests were hand-timed for 4.3 s
  jobs and were retimed for 6 s (Active at measure 10 and 9). `COOLDOWN_CANDIDATES` now leads with
  the shipped 0.3/2/30 and keeps 0.4/3/30 as a comparison row. A test keeps labels unique. (3)
  **No `vite-node` script was needed.** The re-run is the existing
  `LIFECYCLE_SIM_REPORT=1 npx vitest run src/systems/lifecycleSim.test.ts` (there is no
  `readinessSim` file; the verification line's path predates Task 15's naming). (4) **Results**
  (121 seeds × 600 s; the 0.4/3/30 rows are the first run, at the old cooldown):

  | Cooldown | BPM | Mean waiting | p95 waiting | Longest wait | p95 wait | Switches / stint | Seeds missing a target |
  |---|---|---|---|---|---|---|---|
  | **0.3/2/30 (shipped)** | 20 | 1.2 % | 5.6 % | 20.0 s | 8.0 s | 1.40 | 4 / 121 |
  | **0.3/2/30 (shipped)** | 110 | 1.2 % | 5.6 % | 14.0 s | 6.0 s | 0.36 | 1 / 121 |
  | **0.3/2/30 (shipped)** | 200 | 1.3 % | 6.8 % | 10.0 s | 6.0 s | 0.23 | 1 / 121 |
  | 0.4/3/30 (Task 15 pick) | 20 | 1.9 % | 7.7 % | 35.1 s | 6.1 s | 1.52 | 7 / 121 |
  | 0.4/3/30 (Task 15 pick) | 110 | 1.8 % | 8.2 % | 14.0 s | 6.0 s | 0.44 | 1 / 121 |
  | 0.4/3/30 (Task 15 pick) | 200 | 2.2 % | 8.9 % | 16.0 s | 6.0 s | 0.26 | 5 / 121 |
  | 0.6/4/30 | 20 | 3.6 % | 11.4 % | 38.3 s | 10.0 s | 1.85 | 21 / 121 |
  | 0.6/4/30 | 110 | 3.7 % | 11.6 % | 22.0 s | 8.0 s | 0.55 | 13 / 121 |
  | 0.6/4/30 | 200 | 4.2 % | 14.0 % | 17.1 s | 8.0 s | 0.35 | 14 / 121 |
  | 0.2/2/30 | 20 | 0.8 % | 4.0 % | 40.0 s | 4.0 s | 1.10 | 2 / 121 |
  | 0.2/2/30 | 110 | 0.7 % | 4.5 % | 12.0 s | 4.0 s | 0.29 | 0 / 121 |
  | 0.2/2/30 | 200 | 0.8 % | 4.5 % | 8.0 s | 4.0 s | 0.17 | 0 / 121 |
  | 0/0/0 (reference) | 20 | 0.0 % | 0.1 % | 52.0 s | 52.0 s | 0.00 | 3 / 121 |
  | 0/0/0 (reference) | 110 | 0.1 % | 0.4 % | 12.0 s | 8.0 s | 0.00 | 0 / 121 |
  | 0/0/0 (reference) | 200 | 0.1 % | 0.8 % | 8.0 s | 6.0 s | 0.00 | 0 / 121 |

  Turn-backs and charging-while-visible are 0 in every row. Longer jobs **lowered** waiting rather
  than raising it (robots spend more of each shift working) and roughly halved job switches per
  stint (3.92 → 1.52 at 20 BPM on 0.4/3/30), which shrank 0.4/3/30's variety edge to 1.52 vs 1.40.
  0.4/3/30 also went 1 s over the 15 s cap at 200 BPM. 0.3/2/30 meets the cap at 110 and 200 BPM
  and cuts the 20 BPM longest wait from 35 s to 20 s; 20 BPM is still over it, measure-bound as
  before. `STATION_ARC_SECONDS` stays 0.9 in code and in the sim; the sketch's 1.0 moves at Task 20.

  **Verification:** `npx vitest run src/animation/jobMoves src/systems/readinessSim` + the sim.
  **Dependencies:** Task 0b. **Files:** `src/animation/jobMoves/jobDuration.ts` (+ test),
  `src/constants/index.ts`, `src/components/robot/gem/orbiterMotion.ts` (+ test), the Task 15 sim
  script; as shipped also `src/systems/lifecycleSim.ts` (+ test), `src/systems/siteChoice.test.ts`,
  docs/ROBOT_LIFECYCLE.md. **Scope:** S–M (stop gate on the sim).

---

### Phase J2: Stations and the loop (`feature/jobs-loop`)

- [x] **Task 17: `robotMotionRegistry.ts` and the orbiter lock**

  **Description:** `register/get/deleteArcDecorator` and `register/get/deleteOrbiterWork` (spec
  §1.8), mirroring `refs.ts`. `RobotBody` registers its world-context `decorateArc` on mount and
  deletes it on unmount. `useOrbiterMotion` (world only) registers `{ lock, unlock }`: `lock` returns
  the shown `.gem__orbiter-local` groups in `cornerOrder` and makes `reconcile()` return early;
  `unlock` clears the lock and reconciles once. No caller yet.

  **Acceptance criteria:**
  - [x] Avatar and card contexts never register.
  - [x] While locked, count changes 2 → 4 → 1 → 3 queue no hops; on unlock exactly the hops from the
        shown count to 3 play (one reconcile pass, not three).
  - [x] Unmount deregisters both.

  **As shipped:** (1) **Lock finishes hops in flight.** The spec doesn't say what happens if a job
  locks while an attach or detach hop is still playing. `lock` now jumps every in-flight hop to its
  end (`progress(1)`), which runs its own `onComplete`. That `onComplete` calls `reconcile()`, a
  no-op while locked. So a corner that was arriving comes back at rest, a corner that was leaving is
  hidden and not returned, and the job never tweens a group that a hop is still moving.
  `arcKillers` became `arcTweens`, which store the tweens themselves. (2) **Owner-checked deletes.**
  `deleteArcDecorator`/`deleteOrbiterWork(robotId, owner?)` remove the entry only if it still
  belongs to that owner. A stale unmount after a remount (J4's layer switch) can't remove the new
  mount's entry. Every caller passes its owner. (3) **`decorateArc` is memoised** (`useCallback` on
  `reducedMotion`, `root`) in `useHaloMotion`. Without that, every audio edit would re-register it.
  A test pins that the registered function survives a re-render. (4) **The control lives in refs**
  (`lockedRef`, `lockGroupsRef`), so it survives a re-run of the mount effect. After unmount,
  `lock` returns `[]` and `unlock` does nothing. (5) **Mutation checks:** 12 mutants, 11 killed. The
  survivor was an `if (!locked) return` guard in `unlock`. It was redundant, because unlocked,
  `reconcile()` is already a no-op, so it was deleted. Suite 6842 green.

  **Verification:** `npx vitest run src/animation/robotMotionRegistry.test.ts src/components/robot/gem/useOrbiterMotion.test.tsx src/components/robot/RobotBody.test.tsx`.
  **Dependencies:** None (J2 base). **Files:** `src/animation/robotMotionRegistry.ts` (+ test),
  `src/components/robot/gem/useOrbiterMotion.ts`, `src/components/robot/RobotBody.tsx` (+ tests);
  as shipped also `src/components/robot/gem/useHaloMotion.ts`.
  **Scope:** M.

- [x] **Task 18: Centre/position and scene→orbiter maths**

  **Description:** `jobMoves/sceneToOrbiterLocal.ts`: `robotCentre(robot, gem, scale)`,
  `positionForCentre(centre, gem, scale)` (correction 5) and `sceneToOrbiterLocal(point, { robotPos,
  gem, bodyScale, layerScale, corner })` inverting the robot translate, the `g.gem`
  `translate(c) scale(s) translate(−c)` and the corner's dock offset.

  **Acceptance criteria:**
  - [x] Round-trip: a point mapped to local and pushed back through the real transform chain (built
        from `RobotGem`'s transform string) lands within 0.01 units, for 50 gems × scales 1/1.69/0.75.
  - [x] `positionForCentre(robotCentre(r)) === r.position`.

  **As shipped:** (1) **No `scale` parameter on the centre pair.** `g.gem` scales about the canvas
  centre, so a robot's centre doesn't move with body or layer scale. The pair is
  `robotCentre(robot, gem)` / `positionForCentre(centre, gem)`. A test pins that the centre is the
  fixed point of the rendered `g.gem` transform at every scale. (2) **"===" holds exactly only for
  positions on a binary-exact grid** (integers, quarter units). Half the gem width is always an
  exact integer (40–80), but `(0.1 + 70) − 70` is not `0.1` in floating point. Arbitrary fractional
  positions round-trip to 1e-9, and that is tested separately. (3) **The output is the GSAP `x`/`y`
  that puts the orbiter's centre on the point.** `{ x: 0, y: 0 }` is docked. The local group's own
  scale is about the orbiter's centre, so it plays no part. (4) **The round-trip test renders the
  real `RobotGem`** (world context) inside a translated `<g>` and walks every rendered `transform`
  from the orbiter's part up to the `<svg>`. It covers 50 gems × 4 scale pairs (1, 1.69, 0.75,
  1.69 × 0.75) × 4 corners. (5) **A non-positive or NaN combined scale throws `RangeError`** (no
  inverse). (6) **The robot's swim `rotation` is not inverted.** A job runs on a robot at rest, and
  J2 deletes the wandering code that tilts it. (7) **Mutation checks:** 10 mutants, 10 killed.

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** None.
  **Files:** `src/animation/jobMoves/sceneToOrbiterLocal.ts` (+ test, `.test.tsx` because it
  renders `RobotGem`). **Scope:** S.

- [x] **Task 19: `hoverPulse` and `buildJobTimeline`**

  **Description:** `jobMoves/hoverPulse.ts` (targets pure, tweens on the timeline) and
  `jobMoves/buildJobTimeline.ts`: given a robot, its site, job and locked orbiter groups, one paused
  timeline keyed `work-${robotId}` — the bob (`BOB_PX`, finite repeats), detach (`ATTACH_DURATION`),
  the job's moves (every job → `hoverPulse` in J2), reattach to `x: 0, y: 0`, total
  `jobDuration(bpm)` (Task 16b; the live tempo read at job start). Reduced motion: an in-place opacity pulse of the same
  length. `onComplete` is passed in. Registered in `timelineMap`.

  **Acceptance criteria:**
  - [x] Duration equals `jobDuration(bpm)` at 20, 110 and 200 BPM (± one frame); orbiter count 1–4
        changes which orbiters move, never the duration.
  - [x] Orbiters end at `x: 0, y: 0`, scale and opacity restored; the bob ends where it started.
  - [x] The timeline never touches `AudioEngine` (spy); killing the key leaves no live tweens.

  **As shipped:** (1) **Counter-bob.** The orbiters sit inside the `.robot` group, so the bob would
  carry a detached orbiter off its target. The sketch has them hold still unless docked. Each
  orbiter's `.gem__orbiter` copy group gets the same bob, inverted and divided by the gem scale.
  `useOrbiterMotion` only sets `display` on that group. The bob is zero at both ends, so a docked
  orbiter still rides with the body. A test checks every orbiter holds its target in the scene to
  0.01 u through the work window, at layer scale 1 and 0.75. (2) **Targets are spaced by slot,
  not corner.** The sketch used corner index × 2π/n, which puts two orbiters on the same spot when
  corners {0, 1, 3} are shown. The first target is directly above the point. There is no per-robot
  phase or pulse order yet (T28's `variation.ts`); the pulse runs in lock (`cornerOrder`) order.
  (3) **Every job runs `hoverPulse(points[0])`.** `points[0]` is the mouth (Stacks/Refinery) or the
  mast (Monolith/Skyscraper) in `workSites.ts`. (4) **The reattach doesn't restore scale or
  opacity.** A mutant showed it did nothing: the pulse already ends each orbiter at its rest scale,
  and nothing changes orbiter opacity in J2. **T29's spark flicker must end at rest too,** or bring
  the restore back with a test. (5) **`WorkSite.path` → `paths` is not done here.** The plan
  (Task 0b note) and spec §1.5 put the split at T19, but T19 reads only `points`. It moves to T28,
  where `trace` is the first reader of `path`. (6) **Input contract:** the caller passes the
  `.robot` element (`getRef`), the body and layer scale, and the orbiters from `lock()`. It unlocks
  in its own `onComplete`. The bob is centred on `robot.position.y`. Reduced motion: opacity
  1 → 0.8 → 1 once per bob cycle, no bob, orbiters untouched. (7) Constants `BOB_PX` 6,
  `BOB_CYCLE_SECONDS` 1.2, `HOVER_GATHER_RADIUS` 14 and `HOVER_PULSE_SCALE` 1.3 are in
  `constants/index.ts`. `jobDuration.ts` didn't need a change. (8) The two new test files call
  `vi.unmock('gsap')`, because `vitest.setup.ts` mocks gsap globally and these tests read real
  tween values. (9) **Open:** `useOrbiterMotion`'s size-dial tween isn't stopped by the lock. A
  Size edit mid-job would fight the pulse on `scale`, and the job's rest scale would be stale.
  This is not fixed. (10) **Mutation checks:** 22 mutants. On the first run, 18 of 21 were killed.
  The three survivors were the reattach's redundant scale restore (deleted), a wrong key in the
  reduced-motion branch (both branches now share one `setTimeline`, and the mutant is killed) and a
  shortened detach (a new test pins both flights to `ATTACH_DURATION`; it kills that mutant and a
  new one that shortens the reattach).
  Suite 6876 green.

  **Verification:** `npx vitest run src/animation/jobMoves`. **Dependencies:** T17, T18, T0.
  **Files:** `src/animation/jobMoves/hoverPulse.ts`, `src/animation/jobMoves/buildJobTimeline.ts`,
  `src/animation/jobMoves/jobDuration.ts` (+ tests), `src/constants/index.ts`. **Scope:** M.

- [x] **Task 20: `ChargingStation.tsx`**

  **Description:** The placeholder gem station from T0 (or Crawford's design if ready), memoised,
  rendered from `getStations` in `OceanScene`'s robots layer **after** the robots. Six slot lights,
  lit count from a narrow selector (robots with this `stationId` and `activity === 'charging'` — the
  selector returns 0 until T21 adds the fields). No continuous animation.

  **Acceptance criteria:**
  - [x] ≤ `STATION_SHAPE_BUDGET` ~~(16)~~ **(25, Crawford's call — see As shipped)** drawn shapes
        per station (counted in the test).
  - [x] ~~Drawn after every `.robot` in the robots layer's DOM order.~~ *(Task 0a correction:)*
        three fragments around the robot group — L4, L3, robots, L2 + halo + L1.
  - [x] A battery tick on an unrelated robot does not re-render the station (render-count test).

  **As shipped (2026-10-07):** (1) **Crawford's Task 0a design, not a placeholder.** Ported from
  `docs/sketches/robot-charging-station.html` into three modules: `stationGem.ts` (pure geometry),
  `stationPaint.ts` (pure paths and colours) and `stationOccupancy.ts` (the lit-set selector key).
  `ChargingStation` draws one **fragment** (`l4`, `l3` or `front` = L2 · halo · ripple · L1);
  `OceanScene`'s robots layer is `#station-l4-layer`, `#station-l3-layer`, `#robot-layer`,
  `#station-front-layer`. Exiting robots go between the first two (T21/T23; the J4 back row
  later). Stations are `pointer-events: none` and `aria-hidden`, so robots behind L1/L2 stay
  clickable. (2) **Shape budget 16 → 25 (Crawford, 2026-10-07).** 16 can't hold the design:
  the layers can't share paths (robots draw between them), and each lit slot is its robot's own
  colour, so robot-style tones would cost 3 paths per slot (~38 full). Crawford chose **facet
  shading by overlay**: each broken layer is a flat base path (unlit pieces), one path per lit
  slot, then one white and one black facet-overlay path (the robots' 3-tone quantised light).
  Lines are one dark-stroke path per layer, and slot dots are at most two paths per layer (on and off).
  Measured: 19 empty, 21 with one stored robot, 25 at five or six. `STATION_SHAPE_BUDGET` = 25 is
  the measured ceiling, and a test pins it as the max. A stored robot is hidden (~30 shapes out of
  the raster), so a lit slot is a net saving. T26 judges the rest. The overlay opacities (0.25 /
  0.4) are approximate and need an eye-check at Checkpoint C. (3) **Slot colour** = the robot's fully lit Mid face
  (`gemMidLitFace`, new in `gemPalette.ts`), pinned equal to `gemPalette(...).midLeft.face` at
  lit 1. Slots light back to front (L3 holds 0–1, L2 2–3, L1 4–5) in **roster order** of the
  charging robots. When a lower-roster robot docks, the colours shift one slot. There is no stored slot
  index; T21/T23 can add one if Crawford wants arrival order. (4) **Live rig dials** read five narrow
  `useAudioStore` selectors (HPF/LPF cutoff, EQ3 low/mid/high). Audio Swells write those at 16n
  cadence mid-swell, so a station re-renders (geometry only, ~1 ms) during an EQ/filter swell.
  Spec §1.6 wants live, so this is accepted. (5) **No re-roll, by construction.** `rollStation` draws a fixed count from its
  stream (tested). `stationGeometry` draws nothing. Boundary lines are routed once at the reference
  dials, on their own stream, and kept in each piece's ring coordinates (u along the piece between
  its cut faces, v across the band). Each run is resampled ×6, so a line bends with a narrowing
  ring. Before that, 22 of 53,652 samples sat up to 1.8 u outside their piece at band 8; now 0 of
  321,912. (6) **Three geometry fixes over the sketch**, each found by the dial-corner sweeps:
  (a) the ring's inner edge is an **edge-dropping offset** (`offsetPolygon`), because a plain miter
  inverts a small chamfer at band 16; (b) a cut's half-angle is capped at **0.4 × the piece's span**,
  because at gap 25 + falloff 0.12 the front ring's inner edge is ~15 u out, and uncapped the inner
  walk wrapped the wrong way round the ring (the sketch has the same flaw at that corner); (c) the bevel
  is **min(5, 0.3 × band)**, not the sketch's 0.3 × shortest edge, because a cut landing next to a
  corner made that collapse to 0.6 and jump back as a dial moved on. Faces use the same edge-dropping
  offset, so no facet inverts. The band cap (0.7 × inradius) binds only rarely (3 of 3000 seeds at
  full falloff); a test pins those seeds. (7) **`Station.gemSeed`** (`'station.gem.seed'`,
  `getUniformSeededVal` per index), with the roll cached per seed like `getRobotGem`. The accent is a
  robot identity hue. (8) **Constants moved:** `STATION_BOX_W/H` 160×120 → **200×200** (the grid
  still needs no overlap fallback), `STATION_ARC_SECONDS` 0.9 → **1.0**, new `STATION_HALO_RADIUS`
  60. The arc retimed the hand-worked sim tests, and two turn-back scenarios had to move off exact
  boundaries: recall at measure 4, and a 150 u park. Readiness re-run at 0.3/2/30 (box + arc):
  mean waiting 1.2 / 1.2 / 1.3 % (unchanged), longest wait 18.0 / 13.1 / 12.0 s at 20 / 110 /
  200 BPM (was 20 / 14 / 10), and turn-backs and charging-while-visible are still 0. (9) **The ripple circle
  is rendered but invisible** (opacity 0, gradient `station-ripple-<id>`, all stops clear) so
  the budget counts it; T23 drives it. **Not done:** daylight on the station (the robots dim at
  night, the station doesn't; no spec rule, so it's flagged for Checkpoint C). (10) **Mutation
  checks:** 26 mutants, 25 killed and 1 control. The band-cap and more-than-six survivors got tests
  (pinned binding seeds; halo and port saturate at six). Heavy dial sweeps carry a 30 s timeout,
  following `lifecycleSim.test.ts`. Suite 6933 green.

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
  `JOB_MOVES` (spec §1.9 table); every job runs for `jobDuration(bpm)`, and the move constants
  §1.9 lists from Task 0b land in `constants/index.ts` here. Reduced motion stays the
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
