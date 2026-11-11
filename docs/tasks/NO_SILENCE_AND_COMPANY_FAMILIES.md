# Implementation Plan: No Silence and Company Families — Part A, `no-silence`

Source spec: [docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md). Source intent:
[docs/intent/no-silence-and-company-families.md](../intent/no-silence-and-company-families.md). Backlog
[60](../todo/backlog.md#60-audio-cover-the-silence-when-every-active-robot-is-charging), first line of plan.md's
Stage 3.

**Status:** plan written 2026-11-10. Phase 1 built 2026-11-10 (Tasks 1–2: `da8d5b52`, `da9416d0`; Task 3's row is in
Results); at Checkpoint A, waiting on Crawford before Task 4. **Part A only**: Part B (`company-families`) is not planned until
Gate B has passed and its questions (spec §7.3) are answered.

## Overview

The last Active robot stays up until another arrives, and every robot draws one seeded battery size that divides its
drain and its charge (spec §1.2–§1.4). Both live in `stepRobotLifecycle`, which the live tick and the replay share.
Seventeen tasks in five phases:

1. **Measure today** (Tasks 1–3). A cover sim in `lifecycleSim.ts` counts silence, stays, robots sounding and cycle
   lengths, and today's row is recorded before anything changes. No product change.
2. **Battery size** (Tasks 4–10). The store keeps fractions, the step divides both rates, the size reaches the tick,
   spawn draws it, the sims carry it. The size-only row is measured before the rule lands.
3. **The rule** (Tasks 11–13). The cases that expect a recall get a second Active robot, then the rule lands, then the
   runs for Gate A.
4. **Gate A's decisions and the docs** (Tasks 14–16).
5. **Gate B** (Task 17): Crawford's ear.

Two gates stop for Crawford: **Gate A** after Task 13 (he picks the size band) and **Gate B** at Task 17.

## Architecture Decisions

- **Size before the rule** (spec §1.5, assumption 7). The step gets no switch that only a sim reads. The four rows of
  the cover sim's table come from the build order: today's row on today's code (Task 3), the size-only row before the
  rule exists (Task 10), the rule-only and both rows after it (Task 13, on a roster with no sizes and on sized ones).
  Today's and the size-only rows cannot be re-measured later, so each has its own task and is written into Results.
- **The cover sim is a tally plus a runner.** The tally (Task 1) is a pure accumulator fed one post-tick roster per
  measure. It reads only `id`, `docking` and `batteryLevel`, so hand-built rosters test it before the rule or the size
  exists. The runner (Task 2) feeds it from the real `stepRobotLifecycle`.
- **A stay is read off the snapshot:** a robot that is Active at or below `BATTERY_CRITICAL_THRESHOLD` after a tick.
  On today's code that never happens, so today's row reports no stays without a special case.
- **A robot's cycle length is measured, not computed:** the commonest gap between its landings on Active. No second
  copy of the step's arithmetic enters the repo.
- **Report runs are opt-in.** The 6,000-measure runs execute only with `LIFECYCLE_SIM_REPORT` set (`it.runIf`, or the
  file's existing env check). The always-on addition is one grid pass at `SIM_MEASURES` (Task 12's zero-silence case).
- **A pin moves in the commit that moves it.** The drain sim's three flat means (5.70, 5.14, 4.60) move at Task 8
  (sizes in the sim roster), again at Task 12 (the rule), and a third time at Task 14 if Gate A picks another band.
  Each commit states old → new. The zero-silence case lands with the rule, not after Gate A as spec §1.5 words it: it
  has to fail first, and no band can break it.
- **Companions first** (Task 11). The suite is green at every commit, and the rule breaks every case that expects a
  lone Active robot to be recalled. Those cases get a second Active robot in their own commit, as `beb6abc0` did for
  two of them, so Task 12's diff is the rule plus the five cases whose meaning it reverses.
- **`generateBatterySize(noiseMap, spawnCount, min?, max?)`** takes the band as defaulted arguments, as
  `getUniformSeededVal` does, so the sims run candidate bands without touching the constants. A sim roster built
  `'flat'` carries no sizes and reads as 1.
- **`BATTERY_SIZE_MIN` / `BATTERY_SIZE_MAX` are provisional from Task 7** (0.8 and 1.25, the sketch's) until Gate A.
- **The prove-it grows twice:** sized robots and fractional batteries at Task 6, a stay at Task 12. Its result always
  holds one battery that was drained and never floored at 0, and one that was charged and never capped at 100,
  because a floored or capped battery hides a wrong rate (the test's own comment, from Phase 43's mutation check). At
  Task 12 the staying robot is the only Active one, so the unfloored drain is the robot that lands and relieves it.
- **No task adds an import edge.** `generateBatterySize` lives in `spawnSystem.ts`, which already imports
  `getUniformSeededVal`, and `lifecycleSim.ts` already imports from `spawnSystem.ts`.
- **Measured numbers go into Results** at the end of this file, beside the intent's probe numbers. The docs take them
  from there (Task 15).

## Dependency Graph

```
Task 1 (cover tally) ── Task 2 (cover sim + report) ── Task 3 (run: today's row)
                                                              │
                                                         Checkpoint A
                                                              │
        Task 4 (store keeps fractions)      Task 5 (step divides both rates)
                    └───────────────┬────────────────┘
                     Task 6 (the size through the tick; prove-it sized)
                                    │
                     Task 7 (spawn draws the size)
                                    │
                     Task 8 (sim roster carries the size; drain pin moves)
                                    │
                     Task 9 (sims take a band: needs 2 + 8) ── Task 10 (run: size-only row)
                                    │
                               Checkpoint B
                                    │
                     Task 11 (companions, tests only) ── Task 12 (the rule; drain pin moves)
                                    │
                     Task 13 (runs for Gate A)
                                    │
                         Checkpoint C = Gate A (stop)
                                    │
                     Task 14 (the pick, pinned) ── Task 15 (ROBOT_LIFECYCLE.md) ── Task 16 (other docs)
                                    │
                         Checkpoint D (complete, before the ear)
                                    │
                     Task 17 (Gate B: Crawford's ear)
```

Tasks 4 and 5 are independent of each other. Everything after them is a chain.

## Task List

Every task names its **Proof**: **RED test** for behaviour, **Run** for a measurement, **Ear** for Crawford's listen,
**Read** for docs. Only a RED-test task lists a `*.test.ts`. No file-text tests (CLAUDE.md). Where the spec names a
mutant (§5.1), its task runs it by hand and names it in the commit. Case numbers are the spec's (§5.1). One commit per
task.

### Phase 1: Measure today (no product change)

- [x] **Task 1: `lifecycleSim.ts` — a cover tally that reads silence, stays, sounding and cycles off a roster**

  **Description:** A pure accumulator beside the drain sim (name provisional: `createCoverTally(startRoster)`), fed one
  post-tick roster per measure and read once at the end. It is seeded with the starting roster so the first measure's
  landings are known. It counts: robots sounding per measure (Active or Recalled) as a histogram; silent measures, the
  longest unbroken silence and the measure it begins; stays (a robot Active at or below critical after a tick;
  consecutive such measures for one robot are one stay) and their lengths; and per robot the gaps between its landings
  on Active, its cycle (the commonest gap; undefined with fewer than two landings) and its heard share (sounding
  measures over all measures). No step and no noise map: it reads `id`, `docking` and `batteryLevel` only. Spec §1.1
  (the three terms), §1.5.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: hand-built roster series give the counts below (case 16).

  **Acceptance criteria:**
  - [x] Two measures with no Active or Recalled robot count as two silent measures, one silence of length 2 beginning
        at the right measure; a measure whose only sounding robot is Recalled is not silent.
  - [x] A robot Active at battery 10, then 4, then 0, then Recalled is one stay of length 3; an Active robot above
        critical is in no stay; two robots' stays are counted apart.
  - [x] A robot landing on Active at measures 3, 38 and 73 has cycle 35; one landing gives no cycle; heard share is
        its sounding measures over the measures observed.
  - [x] The same series gives the same result twice, and the tally does not mutate the rosters it is handed.

  **Verification:**
  - [x] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** S (one module, one test file)

- [x] **Task 2: `lifecycleSim.ts` — the cover sim over the grid, and its report**

  **Description:** `runCoverSim({ coords = SIM_SEED_COORDS, measures = SIM_MEASURES })` steps each world's
  `buildSimRoster` through the real `stepRobotLifecycle` and feeds Task 1's tally, then pools the worlds into one row:
  the share of silent measures and the worlds with at least one; the worlds with a stay, stays per 1,000 measures per
  world, stay length (median, p90, longest) and the share of measures with a robot in a stay; robots sounding (mean,
  p10, p90); cycle lengths (shortest, longest, distinct across the grid, and per world the largest group of robots
  sharing one); heard share (lowest, highest); and the five worlds with the longest silence, each with its coordinates,
  the measure it begins and its length. `formatCoverReport(rows)` renders a markdown table and the worst-worlds list,
  beside `formatDrainReport`. A report-only case prints it at 6,000 measures when `LIFECYCLE_SIM_REPORT` is set.
  Spec §1.5.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: for one world, `runCoverSim`'s silent-measure count and
  sounding mean equal a count the test makes itself by stepping that world with `stepRobotLifecycle`.

  **Acceptance criteria:**
  - [x] One row with every field finite, shares inside 0–1, p10 ≤ mean ≤ p90, and at most five worst worlds, longest
        silence first.
  - [x] The single-world cross-check above holds, so the row is right whatever the step does later.
  - [x] Deterministic, and touching no store and no BeatClock (case 19, as the drain sim's cases check).
  - [x] `formatCoverReport` renders a header, a separator, one line per row and the worst-worlds list.
  - [x] The always-on cases run on `FEW_COORDS`; the 6,000-measure grid run happens only under `LIFECYCLE_SIM_REPORT`.
        *As built:* the invariants case runs the whole grid at 300 measures (0.9 s) and the cross-check runs 12
        worlds, because `FEW_COORDS` holds one silence and the five-world cap and the longest-first order need more
        than five silent worlds of more than one length. No stay can occur before Task 12, so the stay fields are
        all 0 until then (the mutant "stays per 1,000 per world only" survives by construction; commit `da9416d0`).

  **Verification:**
  - [x] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** S (one module, one test file)

- [x] **Task 3: Run — today's row**

  **Description:** Run the cover sim's report at 6,000 measures on the code as it stands, before any behaviour changes,
  and write the row into Results beside the intent's probe numbers. This is the only chance to measure today's fleet
  with the repo's own step.

  **Proof:** Run — `LIFECYCLE_SIM_REPORT=1` on `lifecycleSim.test.ts`; the printed row is recorded in Results.

  **Acceptance criteria:**
  - [x] Today's row and its five worst worlds are in Results.
  - [x] Every cycle is 35 measures and no stay is counted.
  - [x] Each probe number it re-measures (79 worlds, 3.4 % of measures, the 48 / 19 / 12 split by length) is marked
        confirmed or given its measured value, with the difference stated.

  **Verification:**
  - [x] The report run completes and its output matches what is written in Results.

  **Dependencies:** Task 2.

  **Files:** `docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md` (Results)

  **Estimated scope:** XS (a run and a record)

### Checkpoint A: today is measured
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. (2026-11-10: 351 files, 13,638 passed, 1 skipped (the
      opt-in cover report); the full run took 239.9 s, the baseline Task 13 compares against.)
- [x] Today's row is reported to Crawford beside the probe's.
- [x] If the row disagrees with the intent in kind (no silent worlds, or silence in nearly all of them), stop here:
      the intent's premise needs his eyes before Phase 2. A difference of a few worlds or a fraction of a percent is
      recorded and the work goes on. *It agrees: 79 of 121 worlds silent, every probe number confirmed.*
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Battery size

- [ ] **Task 4: `localeStore.ts` — `updateRobot` keeps a fractional battery**

  **Description:** Drop `Math.trunc` from `updateRobot`'s `batteryLevel` normalisation. Keep the 0–100 clamp. A `NaN`
  drops the key and keeps the stored value, as `pan`'s branch does. Nothing writes a fraction yet, so nothing in the
  app changes. Spec §1.4.

  **Proof:** RED test — `src/stores/localeStore.test.ts`: a battery written as 42.9 reads back 42.9 (case 13; the
  "truncates a fractional value" case flips).

  **Acceptance criteria:**
  - [ ] A fractional battery is stored as written.
  - [ ] 150 clamps to 100, −10 to 0, and a fractional overshoot (100.4) to 100.
  - [ ] A `NaN` leaves the stored battery as it was.

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** XS (one branch, one test block)

- [ ] **Task 5: `robotSystems.ts` — the step divides the drain and the charge by the robot's battery size**

  **Description:** `RobotLifecycleSnapshot.batterySize?: number`, and `DEFAULT_BATTERY_SIZE = 1` in
  `src/constants/index.ts` beside the other battery constants. In `stepRobotLifecycle` the size is
  `robot.batterySize ?? DEFAULT_BATTERY_SIZE`; an Active robot drains by `drain(robot) / size` and a Docked one charges
  by `BATTERY_RECHARGE_RATE / size`. `DrainRule`'s doc comment says it returns the base drain. Thresholds, holds and
  clamps are untouched. No snapshot in the app carries a size yet, so the app's behaviour does not change. Spec §1.3,
  §4.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`, on `stepRobotLifecycle`: cases 8, 9 and 10.

  **Acceptance criteria:**
  - [ ] A snapshot of size *s* drains by `BATTERY_DRAIN_ACTIVE / s` and charges by `BATTERY_RECHARGE_RATE / s`; a
        snapshot with no size uses today's rates, and every existing step and tick case passes unmodified.
  - [ ] An injected `DrainRule`'s value is divided by the size too.
  - [ ] Counted through real steps from a full battery, beside a second Active robot: size 0.85 is recalled on its
        13th Active measure and starts Undocking on its 16th Docked one; size 1.15 on its 18th and its 22nd.
  - [ ] Mutant, killed: divide the drain but not the charge.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/constants/index.ts`, `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S (two lines of arithmetic, one type field, one constant)

- [ ] **Task 6: `Robot.batterySize` reaches the tick, and the prove-it runs on sized robots**

  **Description:** `Robot.batterySize?: number` in `src/types/Robot.ts`, with a doc comment in `gemSeed`'s manner
  (seeded at spawn, never edited, never saved). `toLifecycleSnapshot` passes it to the step. The prove-it's fixture
  gives every robot a size: the sizes differ from each other and none is 1, so parity cannot pass on defaults. Its
  recall expectation is re-worked for the sized drain; it still ends with robot 0 recalled, which Task 12 changes.
  Spec §1.3, §1.4.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: through `tickRobotLifecycle`, an Active robot of size 1.25
  at 50 loses `BATTERY_DRAIN_ACTIVE / 1.25` and a Docked one of size 0.8 gains `BATTERY_RECHARGE_RATE / 0.8`
  (case 12); and the prove-it on sized robots, which fails while the live tick ignores the size.

  **Acceptance criteria:**
  - [ ] The tick drains and charges each robot by its own size.
  - [ ] The prove-it holds field for field (docking, battery, hold, melody) for all twelve sized robots, and asserts
        that at least one battery in the result is not a whole number.
  - [ ] The result holds a battery that was drained and never floored at 0, and one that was charged and never capped
        at 100.
  - [ ] Mutants, both killed: drop `batterySize` from `toLifecycleSnapshot`; put `Math.trunc` back in `updateRobot`.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/stores/localeStore.test.ts src/systems/workLoop.integration.test.ts src/systems/audioBudgetSystem.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4 and 5.

  **Files:** `src/types/Robot.ts`, `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S (one type field, one line in the snapshot builder, the prove-it's fixture)

- [ ] **Task 7: `spawnSystem.ts` — every robot draws a battery size at spawn**

  **Description:** `BATTERY_SIZE_MIN = 0.8` and `BATTERY_SIZE_MAX = 1.25` in `src/constants/index.ts`, marked
  provisional until Gate A. `generateBatterySize(noiseMap, spawnCount, min = BATTERY_SIZE_MIN, max = BATTERY_SIZE_MAX)`
  beside `generateGemSeed`: one `getUniformSeededVal` at `'robot.batterySize'`. `spawnRobot` sets `batterySize` from
  it, with an `alea` fallback into the same band when there is no noise map, as its neighbours have. **This is the
  commit where the app changes:** a real world's robots now keep different shift lengths. Spec §1.3.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: case 11.

  **Acceptance criteria:**
  - [ ] Every robot `spawnInitialRoster` makes carries a size inside the band; two locales at the same coordinates get
        the same sizes; the sizes differ across a roster.
  - [ ] Over the grid's 121 worlds at offsets 0–99, `generateBatterySize` puts 8–12 % of its values in each outer
        tenth of the band (`outerTenths`, `src/testUtils/spread.ts`).
  - [ ] A lone `spawnRobot` with no noise map still gets a size inside the band.
  - [ ] An untouched spawned roster still diffs to no overrides: the session tests pass unmodified.
  - [ ] Mutant, killed: draw the size with a plain `getSeededVal`.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/systems/lifecycleSim.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/constants/index.ts`, `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (one pure function, one field at spawn, two constants)

- [ ] **Task 8: `lifecycleSim.ts` — the sim roster carries the size**

  **Description:** `buildSimRoster(noiseMap, band?)`: by default each robot's size comes from `generateBatterySize` on
  the shipped band; a `[min, max]` band draws on that band; `'flat'` sets no size, which is today's fleet. The parity
  case with `spawnInitialRoster` extends to `batterySize`. The drain sim now runs on sized robots, so its three pinned
  means move: re-measure and re-pin them in this commit. Spec §1.3, §1.5.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: the sim roster matches `spawnInitialRoster` robot for
  robot on battery size (case 15), which fails while the sim sets none.

  **Acceptance criteria:**
  - [ ] The default roster's sizes equal the spawned roster's at the same coordinates; the seed used in the test has
        sizes that vary.
  - [ ] A `[min, max]` band puts every size inside it; `'flat'` gives a roster with no size on any robot.
  - [ ] The drain rows are re-pinned, old → new in the commit message; flat 5 > flat 6 > flat 7 still holds.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5 and 7.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** S (one function's signature, one pin)

- [ ] **Task 9: `lifecycleSim.ts` — the cover sim and the loop sim take a band**

  **Description:** `runCoverSim` gains `rows`, a list of `{ label, band }` handed to `buildSimRoster`, defaulting to
  one row on the shipped band. `runReadinessSim` gains a `band` option handed on the same way. The report-only cases
  print every row asked for. Spec §1.5, §1.6.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: over `FEW_COORDS` a `'flat'` row has one cycle length and
  a banded row has more than one.

  **Acceptance criteria:**
  - [ ] Rows come back in the order asked, labelled, each built on its own band; with no `rows`, one row on the
        shipped band.
  - [ ] The `'flat'` row has one distinct cycle length; a banded row has several.
  - [ ] `runReadinessSim` runs on the band it is given (a `'flat'` run and a banded run are on different rosters), and
        with no band on the shipped one.
  - [ ] Deterministic, no store, no BeatClock, no GSAP.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 2 and 8.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** S (two options threaded through)

- [ ] **Task 10: Run — the size-only row**

  **Description:** Run the cover report at 6,000 measures with four rows: `'flat'`, 0.9–1.1, 0.8–1.25 and 0.67–1.5.
  The rule does not exist yet, so these are size with no rule. Record the 0.8–1.25 row as "Size only" beside the
  probe's (0.19 % of measures, 103 worlds), and the other two bands under it. After Task 12 this cannot be measured.

  **Proof:** Run — the report under `LIFECYCLE_SIM_REPORT`; the rows are recorded in Results.

  **Acceptance criteria:**
  - [ ] The `'flat'` row equals Task 3's today row exactly, which shows nothing but the size has moved the fleet.
  - [ ] The three sized rows are in Results, the probe's numbers marked confirmed or given their measured values.

  **Verification:**
  - [ ] The report run completes and its output matches what is written in Results.

  **Dependencies:** Task 9.

  **Files:** `docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md` (Results)

  **Estimated scope:** XS (a run and a record)

### Checkpoint B: battery size is in
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite; any unrelated failure named).
- [ ] A real world's robots carry sizes, the live tick and the replay agree on fractional batteries, and the sim
      roster matches spawn.
- [ ] The size-only rows are reported to Crawford beside the probe's.
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: The rule

- [ ] **Task 11: tests only — every case that expects a recall gets a second Active robot**

  **Description:** The rule keeps a lone Active robot up, so every case that puts one robot at critical and expects it
  Recalled will fail at Task 12 for a reason that is not its subject. Give each a healthy second Active robot (battery
  100) first. Find them all by applying the rule from spec §4 locally, running the files below, and reverting the rule:
  each failing case is either one of these or one of the five reversal cases Task 12 owns. Known in
  `robotSystems.test.ts`, by title: "Active robot crossing the critical threshold begins Recalled with a hold, not
  immediate Docked" (the tick's and the step's), "calls the seam with 'recalled' the instant a robot is Recalled",
  "beginRecall writes no visual state itself", "drives the tick with getCurrentMeasure() (monotonic)", and the first
  call in "a smaller drain reaches the critical threshold later". Left alone for Task 12: the five cases about the
  missing guard ("the sole Active robot is recalled…", "a sole Active robot that drains to 0…", "when two robots cross
  critical in the same tick, both depart", "the only Active robot is recalled at/under critical battery", "two robots
  at critical in the same step both depart"), the prove-it, and `lifecycleSim.test.ts`'s "it may reach zero" case and
  drain pin.

  **Proof:** Run — the files pass before and after this commit; with the rule applied locally and not committed, only
  the cases left for Task 12 fail. No behaviour changes, so there is no RED test.

  **Acceptance criteria:**
  - [ ] Every case found by the local run has a second Active robot, placed so its seam-call counts and the robot it
        asserts on are unchanged.
  - [ ] No assertion is weakened or removed, and the commit lists the titles it touched.
  - [ ] With the rule applied locally, the failing set is exactly the cases named above as Task 12's.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/systems/workLoop.integration.test.ts src/systems/audioBudgetSystem.test.ts src/systems/lifecycleSim.test.ts`
        passes on the committed tree.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10 (so the size-only row is measured before the rule is tried).

  **Files:** `src/systems/robotSystems.test.ts`, plus any test file the local run adds (no source file)

  **Estimated scope:** S (fixtures in one test file, six known cases)

- [ ] **Task 12: `robotSystems.ts` — the last Active robot stays up**

  **Description:** In `stepRobotLifecycle`, an Active robot at or below critical after its drain is recalled only
  while `working.some((r) => r.id !== robot.id && r.docking === DockingState.Active)`; otherwise it stays Active and
  drains on to the floor of 0. The step's doc comment is rewritten (it says the guard is gone). `tickRobotLifecycle`
  needs no change. The five reversal cases are renamed and inverted. The prove-it gains a stay. The drain rows move
  again and are re-pinned. Spec §1.2, §4.

  **Proof:** RED test — `src/systems/robotSystems.test.ts` and `src/systems/lifecycleSim.test.ts`: cases 1–7 and 17,
  and the prove-it's stay, each failing on the code before the rule.

  **Acceptance criteria:**
  - [ ] A sole Active robot at or below critical stays Active with no hold set and no `'recalled'` seam call, drains
        every measure and floors at 0 (cases 1, 2), on the step and through the tick.
  - [ ] It is recalled the same tick when the robot landing on Active is earlier in the roster, the next tick when it
        is later (case 3). Two robots crossing critical together: the earlier goes, the later stays; with a third
        Active robot both go (case 4).
  - [ ] Beside only a Recalled robot, or only an Undocking one, it stays (case 5); a muted last robot stays (case 6).
  - [ ] Over a real seeded roster the Active count never reaches zero (case 7), and over the grid at `SIM_MEASURES`
        the cover sim counts zero silent measures in every world (case 17).
  - [ ] The prove-it's run contains a stay: a sole Active robot crosses critical, drains on for at least two ticks and
        is recalled after another robot lands. The live result and the replay still agree field for field, and the
        robot that landed ends on a battery that was drained and never floored.
  - [ ] Mutants, all killed: drop `r.id !== robot.id`; count Recalled as Active; read the pre-tick `roster` and not
        `working`.
  - [ ] The drain rows are re-pinned, old → new in the commit message.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts src/systems/workLoop.integration.test.ts src/systems/workLoop.test.ts src/systems/audioBudgetSystem.test.ts`
        passes.
  - [ ] `npm test` passes: the rule changes what every ticking test sees, so the full suite runs before this commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 11.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** M (a few lines of source; the tests are the work)

- [ ] **Task 13: Run — the rule-only row, the three bands and the loop sim**

  **Description:** With the rule in: the cover report at 6,000 measures for `'flat'` (rule only), 0.9–1.1, 0.8–1.25
  and 0.67–1.5; and the loop sim at 20, 110 and 200 BPM on each of the three bands. Record all of it in Results, then
  write the Gate A summary there: the three bands side by side (stays, robots sounding, cycle lengths, the largest
  group sharing a length per world, the shortest recall-to-Active, turn-backs), the difference from the probe's
  numbers, and how much the suite's run time moved since Checkpoint A.

  **Proof:** Run — both reports under `LIFECYCLE_SIM_REPORT`; the rows and the summary are recorded in Results.

  **Acceptance criteria:**
  - [ ] Zero silent measures in every row.
  - [ ] `chargingWhileVisible` is 0 on every band at every tempo.
  - [ ] Turn-backs are recorded per band and tempo, whatever they are (spec §1.6: a count above 0 is a finding to
        report, not a failure).
  - [ ] Each probe number is marked confirmed or given its measured value, with the difference stated.

  **Verification:**
  - [ ] Both report runs complete and their output matches what is written in Results.

  **Dependencies:** Task 12.

  **Files:** `docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md` (Results)

  **Estimated scope:** S (two long runs and a record)

### Checkpoint C: Gate A — the band (stop and report)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] The Gate A summary is in front of Crawford.
- [ ] **Crawford picks `BATTERY_SIZE_MIN` / `BATTERY_SIZE_MAX`** (spec open question A1; default 0.8–1.25).
- [ ] **Crawford answers A2** (eight cycle lengths, not a continuum; default accept), with the per-world sharing
      measured.
- [ ] If a row has a silent measure, or the stays are far from the probe's (0.13 % of measures on 0.8–1.25), say so
      plainly and stop. No threshold is re-tuned to pass.
- [ ] Nothing in Phase 4 starts before his answer.

---

### Phase 4: Gate A's decisions and the docs

- [ ] **Task 14: the pick, in the constants and the pins**

  **Description:** Set `BATTERY_SIZE_MIN` / `BATTERY_SIZE_MAX` to Crawford's pick, drop the "provisional" from their
  comment, and pin the two values in a test beside "BATTERY_DRAIN_ACTIVE is the flat 6 the Phase 43 drain sim picked".
  If the band moved, re-pin the drain rows (old → new in the commit) and re-run Task 13's loop sim on the picked band.
  Rewrite `lifecycleSim.test.ts`'s comment "Turn-backs are not compared: … ~20 measures, 24 s at 200 BPM" to what was
  measured. Write the answers to A1 and A2 into the spec's §7.

  **Proof:** RED test when the pick moves the band — `src/systems/robotSystems.test.ts`: the constants' pin, and the
  drain rows in `lifecycleSim.test.ts`, fail first. When the pick is 0.8–1.25 no behaviour changes and the proof is a
  Read of the comment and the spec.

  **Acceptance criteria:**
  - [ ] The constants hold the pick, and a test names them as Gate A's.
  - [ ] Every sim pin is green on the picked band, and the zero-silence case still passes.
  - [ ] The spec's A1 and A2 read as answered, with the date.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/systems/spawnSystem.test.ts src/systems/lifecycleSim.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint C.

  **Files:** `src/constants/index.ts`, `src/systems/robotSystems.test.ts`, `src/systems/lifecycleSim.test.ts`,
  `docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md`

  **Estimated scope:** S (two constants, their pin, a comment, the spec's two answers)

- [ ] **Task 15: `docs/ROBOT_LIFECYCLE.md` — the lifecycle as shipped**

  **Description:** Rewrite the parts the change makes wrong, every number taken from Results and every identifier
  checked against the shipped source: core principle 3 (the rate is per robot, by its size); the "No keep-one-playing
  guard" bullet, which becomes the stay-up rule and its roster-order behaviour; the Battery table and constants, with
  a battery-size subsection (the draw, the eight-lengths finding or its measured form, the floating-point split);
  "Why 6", with the re-pinned rows under the Phase 43 table; the turn-back paragraph, as measured; the replay
  snapshot's new field and the sentence that the tick reads no joint roster state, which is no longer true; the
  Headless Sims section, with the cover sim and its four rows; Roster Creation; and the Testing Notes lines about the
  flat drain, the missing guard and the prove-it.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No sentence says a robot is recalled whatever the fleet is doing, or that the fleet can go silent.
  - [ ] Every number is one in Results; none is the intent's probe number unless Results confirmed it.
  - [ ] Every function, constant and field named exists in the shipped source under that name.
  - [ ] No compatibility or "keeps the existing sound" clause (the pre-v1 rule).

  **Verification:**
  - [ ] Manual review, each named identifier and number checked against the source and Results.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 14.

  **Files:** `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** S (one doc, about nine sections touched)

- [ ] **Task 16: the other records — `PROCEDURAL_GENERATION.md`, backlog 60, plan.md, the spec**

  **Description:** `docs/PROCEDURAL_GENERATION.md`: `'robot.batterySize'` in the `spawnSystem.ts` call-site row and in
  "Which draw each site makes" (an even key). `docs/todo/backlog.md` item 60: a status paragraph (Stage 1 built on the
  branch, the spec linked, the fade-on-arcs note still waiting on open question A4). `docs/todo/plan.md`: the Stage 3
  line points at the spec and says where it stands. The spec: its Status line, and an "As built" section in the
  manner of `DARK_EFFECTS_LEAVE_THE_GRAPH.md`'s §8 (the names §4 left provisional, where the build differs from §1,
  the mutants and their commits, the runs). CLAUDE.md is not touched (open question A5).

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Each record says what shipped, and every link and anchor in the edited lines resolves.
  - [ ] Backlog 60 is updated, not archived.
  - [ ] The spec's "As built" names every difference from §1 and §4, or says there is none.

  **Verification:**
  - [ ] Manual review; links and anchors opened.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 15.

  **Files:** `docs/PROCEDURAL_GENERATION.md`, `docs/todo/backlog.md`, `docs/todo/plan.md`,
  `docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md`

  **Estimated scope:** S (four docs, a few lines each, plus the spec's new section)

### Checkpoint D: complete, before the ear
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every case in spec §5.1 passes and was written RED first; each of its seven mutants is named, killed, in a
      commit.
- [ ] The docs describe the shipped behaviour, every identifier spot-checked against the source.
- [ ] Flagged, not skipped: Gate B has not happened yet.
- [ ] Reviewed with human before Task 17.

---

### Phase 5: Gate B

- [ ] **Task 17: Gate B — Crawford's ear**

  **Description:** Crawford listens and looks on the built branch, in a browser (`npm run dev`). The agent's part is
  the list he works from, taken from Results: today's five worst worlds, each with its coordinates, the measure its
  silence used to begin and how long it lasted (a measure is 240 ÷ BPM seconds), to load through New Transmission on
  this branch and on `main`. Spec §5.5.

  **Proof:** Ear and Look — Crawford's, in a live browser. No test file.

  **Acceptance criteria:**
  - [ ] A long listen with no silence.
  - [ ] At one of the worst worlds, the measure that was silent on `main` is covered on the branch.
  - [ ] The fleet without its 35-measure loop sounds at least as good.
  - [ ] A staying robot has been looked at, and open question A3 (its 0.1 opacity) is answered.

  **Verification:**
  - [ ] Crawford's words are recorded in the spec's "As built" and in Results.
  - [ ] If it fails: stop, report what he heard, and offer options. Nothing is re-tuned to pass.

  **Dependencies:** Checkpoint D.

  **Files:** `docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md` ("As built"), this file (Results)

  **Estimated scope:** XS for the agent (a list and a record); the listen is Crawford's

### After Gate B
- [ ] The spec's Status line says Part A is built and heard.
- [ ] Part B's questions (spec §7.3) are open for Crawford; Part B is completed in the spec and planned on its own.
- [ ] Backlog 60 archives only once A4 (the fade on station arcs) and B11 (where Stage 2 is recorded) are settled.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A case that expects a lone robot's recall is missed, and Task 12's commit goes red for a reason that is not the rule | Medium | Task 11 finds them by applying the rule locally, and its third criterion fixes the exact failing set. Task 12 runs the full suite before committing. |
| The prove-it passes on a wrong rate because the battery floored at 0 or capped at 100 | High | Tasks 6 and 12 each require an unfloored drained battery and an uncapped charged one in the result, and name rate mutants that must be killed. |
| Parity passes by coincidence on default sizes | High | Task 6's fixture sets sizes that differ from each other and from 1; Task 8's parity seed must have varying sizes. |
| Today's row disagrees with the intent's probe | Medium | Checkpoint A reports it and stops for a difference in kind; smaller differences are recorded, and Results is what the docs use. |
| A test sits on a bucket edge and turns on floating-point noise | Low | Task 5 uses mid-bucket sizes (0.85, 1.15), never an edge such as 0.8 or 1.2. |
| The even-draw case passes or fails on sample luck | Low | Task 7 samples 12,100 values: the sampling error on an outer tenth's share is about 0.3 %, against a pass band of 10 % ± 2 %. |
| The suite gets slower | Low | One always-on grid pass is added (Task 12); the 6,000-measure runs are opt-in. Task 13 reports the measured difference. |
| The drain pin is edited three times and one edit hides a real regression | Medium | Each edit is in the commit whose behaviour moves it, with old → new stated; the order check (flat 5 > 6 > 7) stays. |
| A small battery brings turn-backs into ordinary play | Low | Task 13 measures them per band at three tempos; both turn-back paths are already covered by `workLoop.integration.test.ts`; Gate A sees the count before the band is picked. |
| A ticking test elsewhere depends on today's timing (`audioBudgetSystem.test.ts`'s 200-tick case) | Low | It is in the focused run of Tasks 6, 11 and 12. |
| Between Tasks 7 and 12 the branch has sizes without the rule, where silence is rarer but wider | Low | It never leaves the branch; Checkpoint B says so. |

## Open Questions

Carried from the spec's §7.2. None blocks Task 1.

1. **A1. The size's band.** **Open** — Crawford's, at Gate A (Checkpoint C). Task 14 pins it.
2. **A2. Eight cycle lengths, not a continuum.** **Open** — Crawford's, at Gate A, with the sharing measured.
   Default: accept.
3. **A3. A staying robot at 0.1 opacity.** **Open** — Crawford's, at Gate B (Task 17). Default: leave it.
4. **A4. Backlog 60's fade on station arcs.** **Open** — needs its own item or a cut before 60 archives. No task here.
5. **A5. CLAUDE.md's "flat drain/recharge".** **Open** — Crawford's file; no task touches it.
6. **The intent, the spec and this plan are uncommitted** on `feature/no-silence-for-now`. **Open** — Crawford commits
   them, or says to include them with Task 1.

## Results

Filled in by Tasks 3, 10, 13 and 17. "Probe" is the intent's scratch-probe number; "Measured" is the cover sim's.

### The four rows (6,000 measures a world, 121 worlds)

| Row | Task | Silent measures | Worlds with a silence | Stays | Robots sounding (mean, p10–p90) | Probe |
|---|---|---|---|---|---|---|
| Today | 3 | 3.39 % | 79 / 121 | none (0 / 121 worlds) | 5.49, 2–9 | 3.4 % of measures; 79 worlds; no stays; 5.5, 2–9 — **all confirmed** |
| Size only (0.8–1.25) | 10 | | | | | 0.19 % of measures; 103 worlds |
| Rule only | 13 | | | | | none; one stay in 92 worlds, 1–9 measures, inside the first 70 |
| Both (0.8–1.25) | 13 | | | | | none; in a stay 0.13 % of measures, one per 1,700 measures a world, typically 2 (p90 4, longest 10); 5.4, 3–8 |

**Today in full (Task 3, 2026-11-10, commit `da9416d0`'s cover sim on the unchanged step):** every robot's cycle is
35 measures (one distinct length; the largest group sharing it is all 12 robots in every world), no stay anywhere,
heard share 45.60–45.85 % (16 of 35 is 45.71 %; the spread is where measure 6,000 cuts each robot's cycle). The probe's
split of the 79 silent worlds by their longest silence is **confirmed**: 48 at one measure, 19 at two, 12 at three to
eight (4 at 3, 3 at 4, one each at 5, 6 and 7, 2 at 8). Every world's longest silence begins between measures 27 and
34, before the robots that started Active come back, and recurs every 35 measures.

### Today's five worst worlds (Task 3; Gate B listens here)

The silence recurs every 35 measures from the measure it begins. A measure is 240 ÷ BPM seconds.

| x | y | Silence begins at measure | Length |
|---|---|---|---|
| 40 | 0 | 27 | 8 |
| 200 | 0 | 27 | 8 |
| -120 | -120 | 28 | 7 |
| 80 | 120 | 29 | 6 |
| -80 | -200 | 30 | 5 |

### The bands (Tasks 10 and 13)

| Band | Rule | Stays per 1,000 measures | Stay length (median, p90, longest) | Cycle lengths | Largest group sharing a length | Turn-backs (20 / 110 / 200 BPM) |
|---|---|---|---|---|---|---|
| 0.9–1.1 | off | | | | | n/a |
| 0.8–1.25 | off | | | | | n/a |
| 0.67–1.5 | off | | | | | n/a |
| 0.9–1.1 | on | | | | | |
| 0.8–1.25 | on | | | | | |
| 0.67–1.5 | on | | | | | |

### Gate A summary (Task 13)

*Not yet written.*

### Gate B (Task 17)

*Not yet heard.*
