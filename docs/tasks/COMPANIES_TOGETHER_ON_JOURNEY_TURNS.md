# Implementation Plan: Companies Together — a company leaves as one, and comings and goings land on the journey's turns

Source spec: [docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md](../specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md)
(approved by Crawford, 2026-11-20). Source intent:
[docs/intent/companies-together-on-journey-turns.md](../intent/companies-together-on-journey-turns.md). Roadmap
[94](../todo/roadmap.md#94-companies-together-a-company-leaves-as-one-and-comings-and-goings-land-on-the-journeys-turns).

**Status:** plan written 2026-11-20. Not started. Awaiting Crawford's approval. Roadmap 93 is on main since
2026-11-20, so nothing blocks the build: it is on `feature/companies-together`, from main (spec §6).

## Overview

When a robot comes and goes moves from its own battery to its group's plan on its journey's turns (spec §1.2).
Thirty tasks in five phases:

1. **Turns and pace** (Tasks 1–6). `journeyTurns` in `melodyJourney.ts`, and a new pure `shiftPlan.ts`: the pace at
   a tempo, groups and their draws, the exit and the entrance, the rescale. Nothing calls them yet.
2. **The step, beside today's** (Tasks 7–13). A new pure step in `robotSystems.ts` built up rule by rule. Today's
   `stepRobotLifecycle` and the live tick are untouched.
3. **The start and the sims** (Tasks 14–20). The start of a world as a pure function, a sim roster with groups, the
   group tally, the cover sim on both steps at five tempos, the loop sim's late members. Then **Gate A: the
   numbers**.
4. **Wiring** (Tasks 21–26). The tick moves to the new step, the prove-it, spawn, the station fade's hold, the
   integration test, the browser runs. Then **Gate B: Crawford's eye and ear**.
5. **After the gate** (Tasks 27–30). The removals, the docs, the archive.

Two gates stop for Crawford: **Gate A** after Task 19 and **Gate B** at Task 26.

## Architecture Decisions

- **New beside old until the switch.** The new step is a new function (`stepShiftLifecycle`, name provisional) in
  `robotSystems.ts`. `stepRobotLifecycle`, `activeDrain` and the drain sim stay as they are until Task 27. This
  departs from spec §1.8 and §2, which keep the old name: the suite stays green at every commit, the live world does
  not change until Task 21, and today's rows and the new rows come from one sim run on two steps. So spec §5.3's
  "today's rows are run first" becomes "before Task 27".
- **Resolves spec Q3 structurally.** Everything the gauge makes dead is removed in one task (Task 27), after Gate B,
  and only on Crawford's yes. Without it the old step stays as unused code and the plan is otherwise complete.
- **The state is on the robot** (spec §4): `entersAtMeasure`, `exitsAtMeasure`, `shiftBpm`. A group's draw happens
  inside the step's one pass, on the tick its first member lands `Active` (the exit) or its last member lands
  `Docked` (the entrance), and is written to every member in that pass. No group record exists anywhere.
- **`shiftPlan.ts` knows no roster shape beyond what it is handed.** It takes a group's key, size, member ids, a
  measure and a tempo, and returns measures. The step owns the transitions; the plan owns the arithmetic. Tasks 2 to
  6 are tested with no roster at all.
- **The group's draws are read by turn index** (spec §1.3): four draws a turn from the group's `:shifts` stream,
  memoised as `journeyShares` memoises. A decision about turn *i* never depends on what was asked before it, which is
  what lets a rescale (Task 6) redraw without changing other turns' answers.
- **The step builds up in the order a shift happens:** transitions on robots that already carry moves (Task 7), the
  exit draw (Task 8), the entrance draw (Task 9), the stay (Task 10), the gauge (Task 11), the tempo change
  (Task 12), the robot out of step (Task 13). Each task's tests hand-build what the later tasks will draw.
- **The start is a pure function first** (Task 14: `generateRosterStart`), so the sims use it at Task 15 and spawn
  adopts it at Task 23. The sim roster and the real spawn then match by construction.
- **Report runs are opt-in** (`LIFECYCLE_SIM_REPORT`, the file's existing check). The always-on additions are one
  grid pass at 60 BPM and a few worlds at the other four tempos (Task 17), to keep the suite's run time.
- **A pin moves in the commit that moves it.** Tasks 15, 20, 23 and 27 each name the pins they move, old → new.
- **Measured numbers go into Results** at the end of this file. The docs take them from there (Task 28).
- **No new import edge into the engine's audio.** `robotSystems.ts` gains an import of `melodyJourney.ts`, which is
  pure (no Tone). The tick reads the tempo from `useAudioStore` as the work loop does, and the world's key from the
  locale's coordinates through `worldKeyOf`.

## Dependency Graph

```
Task 1 (journeyTurns)        Task 2 (pace + lead)        Task 3 (groups + draws)
        └──────────────┬──────────────┴──────────────┬────────────┘
              Task 4 (planExit)              Task 5 (planEntrance)
                       └──────────┬──────────────────┘
                          Task 6 (rescale)
                                  │
                             Checkpoint A
                                  │
          Task 7 (fields + the four transitions)
                                  │
     Task 8 (exit draw) ── Task 9 (entrance draw) ── Task 10 (the stay)
                                  │
     Task 11 (the gauge)   Task 12 (tempo change)   Task 13 (out of step)
                                  │
                             Checkpoint B
                                  │
     Task 14 (the start, pure) ── Task 15 (sim roster with groups)
                                  │
     Task 16 (group tally) ── Task 17 (cover sim, two steps, five tempos) ── Task 18 (run: the rows)
                                  │
     Task 19 (loop sim: late members, door waits; run)
                                  │
                    Checkpoint C = Gate A (stop) ── Task 20 (the picks, pinned)
                                  │
     Task 21 (the tick switches) ── Task 22 (replay + prove-it) ── Task 23 (spawn starts groups)
                                  │
     Task 24 (the fade waits for the hold) ── Task 25 (integration: one bar line)
                                  │
                    Checkpoint D ── Task 26 (browser runs, then Gate B: stop)
                                  │
     Task 27 (removals, on his yes)   Task 28 (ROBOT_LIFECYCLE.md)   Task 29 (other docs)
                                  │
                    Checkpoint: Complete ── Task 30 (archive, after the merge)
```

Tasks 1, 2 and 3 are independent of each other; so are 11, 12 and 13 once 10 is in; so are 27, 28 and 29.

## Task List

Every task names its **Proof**: **RED test** for behaviour, **Run** for a measurement, **Look** / **Ear** for
Crawford's gate, **Read** for docs and removals. Only a RED-test task lists a `*.test.ts`. No file-text tests
(CLAUDE.md). Where the spec names a mutant (§5.1), its task runs it by hand and names it in the commit. One commit
per task.

### Phase 1: Turns and pace (pure; nothing calls them)

- [ ] **Task 1: `melodyJourney.ts` — `journeyTurns`, the turns of a key in a range**

  **Description:** One pure read (spec §1.4): `journeyTurns(key, fromMeasure, toMeasure)` returns each turning
  measure in the range at `JOURNEY_TIME_MAX`, with its pair `index`, its `move` (the shares' distance, the first
  pair's from home) and whether it is a `drop`. It reads the memos `pairAt` and `drawnTo` already keep and changes
  no existing function.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts`: the turns match the measures on which `journeyAt`'s pair
  changes, for ranges that start and end mid-pair.

  **Acceptance criteria:**
  - [ ] The measures returned are exactly the turning measures in `[from, to]`, in order, and a range with none is
        empty.
  - [ ] `move` is `|share[i].intensity − share[i−1].intensity|` (the first from 0); a drop is flagged on the drop's
        own pair, one measure after the turn before it.
  - [ ] The same key gives the same turns whichever range is asked first.
  - [ ] Mutants killed: the move read from a robot's scaled pairs; the pair before a drop flagged.

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyJourney.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`

  **Estimated scope:** S (one export, one test block)

- [ ] **Task 2: `shiftPlan.ts` and the constants — the pace at a tempo, the windows, the recall's lead**

  **Description:** The new file's first functions (spec §1.5, §1.11, §4): `paceBars`, `shiftWindow(phase, size, bpm)`
  returning `{ least, most }`, and `recallLeadBars(bpm)`. Adds §4's pace constants (`SHIFT_REFERENCE_BPM`,
  `SHIFT_OUT_BASE_BARS`, `SHIFT_HOME_BASE_BARS`, `SHIFT_OUT_MAX_BARS`, `SHIFT_HOME_MAX_BARS`, `SHIFT_MIN_BARS`,
  `RECALL_LEAD_SECONDS`) beside the battery's.

  **Proof:** RED test — `src/systems/shiftPlan.test.ts`: spec §1.5's table, row by row.

  **Acceptance criteria:**
  - [ ] Size 1 gives the table's ten windows at 20, 40, 60, 100 and 200 BPM; sizes 0.67 and 1.5 scale the "least".
  - [ ] No "least" is under `SHIFT_MIN_BARS`, and every "most" is at least `JOURNEY_TIME_MAX` past its "least".
  - [ ] `recallLeadBars` is 2, 4, 6, 10 and 20 at the five tempos.
  - [ ] Mutant killed: the window's 16-measure width dropped.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/systems/shiftPlan.ts`, `src/systems/shiftPlan.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S (a new file with three functions)

- [ ] **Task 3: `shiftPlan.ts` — a robot's group, its journey key, its size, its draws**

  **Description:** Spec §1.3. `groupIdOf(robot)` (the `companyId`, else the robot's own id); `groupJourneyKey(worldKey,
  robot)` (the company key or the fleet key, never read from `Robot.journey`); `groupSize(members)` (the
  `batterySize` of the member earliest in the roster, absent reads as `DEFAULT_BATTERY_SIZE`); `groupDraws(worldKey,
  robot, turnIndex)` returning four draws from the group's `:shifts` stream (`companyId` for a company,
  `compositionSeed` for a freelancer), memoised per stream.

  **Proof:** RED test — `src/systems/shiftPlan.test.ts`.

  **Acceptance criteria:**
  - [ ] A member whose Journey setting is Own or Fleet still gets its company's key; a freelancer gets the fleet's.
  - [ ] Two freelancers get different draws for the same turn; two members of one company get the same.
  - [ ] Turn *i*'s draws are the same whether turn *i* or a later turn is asked first.
  - [ ] Mutants killed: the size read from a later member; the draws keyed on the journey alone.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/systems/shiftPlan.ts`, `src/systems/shiftPlan.test.ts`

  **Estimated scope:** S

- [ ] **Task 4: `shiftPlan.ts` — `planExit`: the walk, and together or drifting**

  **Description:** Spec §1.6. `planExit({ worldKey, members, from, bpm })` returns each member's exit turn. It lists
  the group's turns in the out window counted from `from`, walks them with the leave odds on each turn's weight
  (a drop's is 1, else `min(1, move)`), takes the last if none leaves, then decides together or drifting on the same
  weight; a drifting exit gives the members, in a drawn order, the turns from the chosen one on. Adds
  `SHIFT_LEAVE_ODDS_MIN` / `MAX` and `GROUP_EXIT_ODDS_MIN` / `MAX`.

  **Proof:** RED test — `src/systems/shiftPlan.test.ts`, on journeys found by key so the cases are real turns.

  **Acceptance criteria:**
  - [ ] The exit is the first candidate whose leave draw is under its odds, and the last candidate when none is;
        every result is a turning measure inside the window.
  - [ ] A drop always leaves and always leaves together; a weight of 0.125 leaves together half the time over many
        keys, a weight of 1 or more 95 % of the time.
  - [ ] A group exit gives every member one turn; a drifting exit gives successive turns, the first on the chosen
        one; a group of one gets one turn.
  - [ ] Mutant killed: the weight ignored.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2, 3.

  **Files:** `src/systems/shiftPlan.ts`, `src/systems/shiftPlan.test.ts`, `src/constants/index.ts`

  **Estimated scope:** M (the core of the plan)

- [ ] **Task 5: `shiftPlan.ts` — `planEntrance`: the walk, and together or staggered**

  **Description:** Spec §1.7. `planEntrance({ worldKey, members, from, bpm })` returns each member's entrance
  measure: the home window's turns walked at `SHIFT_ENTER_ODDS`, the last taken if none; together under
  `ENTRANCE_TOGETHER_ODDS`, else the members in a drawn order `ENTRANCE_STAGGER_BARS` apart from the turn on. Adds
  those three constants.

  **Proof:** RED test — `src/systems/shiftPlan.test.ts`.

  **Acceptance criteria:**
  - [ ] The first entrance is always a turning measure inside the home window; the move's size changes nothing.
  - [ ] Together gives every member one measure; staggered gives 0, 2, 4 and 6 bars after the turn for four members.
  - [ ] Over many keys about 70 % of entrances are together.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2, 3.

  **Files:** `src/systems/shiftPlan.ts`, `src/systems/shiftPlan.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

- [ ] **Task 6: `shiftPlan.ts` — `rescaleMove`: a move after a tempo change**

  **Description:** Spec §1.12. `rescaleMove({ worldKey, robot, move, measure, fromBpm, toBpm, least })`: the bars
  still to go times `toBpm ÷ fromBpm`, rounded, then the first turn of the group's journey at or after that, never
  nearer than `least` measures ahead (the caller passes the lead for an exit).

  **Proof:** RED test — `src/systems/shiftPlan.test.ts`.

  **Acceptance criteria:**
  - [ ] 60 → 200 BPM lengthens the bars to go by 3⅓ and lands on a turn; 200 → 20 shortens them tenfold and lands on
        a turn.
  - [ ] Two members with one move get one move; equal tempos return the move unchanged.
  - [ ] The result is never nearer than `least`.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 3.

  **Files:** `src/systems/shiftPlan.ts`, `src/systems/shiftPlan.test.ts`

  **Estimated scope:** S

### Checkpoint A: Turns and pace
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] `shiftPlan.ts` and `journeyTurns` are pure and have no caller outside their tests; the live world is unchanged.
- [ ] Reviewed with Crawford before Phase 2.

---

### Phase 2: The step, beside today's (pure; the live tick untouched)

- [ ] **Task 7: `Robot.ts`, `robotSystems.ts` — the three fields, and the four transitions on robots that carry moves**

  **Description:** Adds `entersAtMeasure`, `exitsAtMeasure` and `shiftBpm` to `Robot` (spec §4) and a snapshot type
  for the new step (today's snapshot plus those three, `companyId` and `compositionSeed`). Adds
  `stepShiftLifecycle(roster, measure, env)` with spec §1.8's table for robots whose moves are already set: `Docked`
  begins `Undocking` one measure before its entrance; `Undocking` lands `Active` on it; `Active` is `Recalled` the
  lead before its exit turn with its hold on the bar line after the turn; `Recalled` lands `Docked` on the hold. No
  draw, no stay, no battery yet: the recall here is unconditional. Pure, one pass in roster order, as today's step.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: each row of the table on a hand-built roster.

  **Acceptance criteria:**
  - [ ] Each of the four transitions fires on its measure and not the one before; the holds are the entrance and
        `exit turn + 1`.
  - [ ] The lead follows `env.bpm`: the same exit turn recalls 6 measures ahead at 60 BPM and 20 at 200.
  - [ ] The input roster is not mutated; the step imports no store and no clock; today's `stepRobotLifecycle` cases
        pass unmodified.
  - [ ] Mutant killed: the hold left at one measure.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/types/Robot.ts`, `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M

- [ ] **Task 8: `robotSystems.ts` — the exit is drawn when a group's first member lands `Active`**

  **Description:** Spec §1.6, §1.8. On the tick a robot lands `Active` and no mate carries an exit turn, the step
  calls `planExit` from that measure and writes each member's exit turn and `shiftBpm`, members still home included
  (a staggered company). A later member landing draws nothing.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A company landing together gets its exit turns on that tick, equal to `planExit`'s for the same inputs.
  - [ ] A staggered company's later members already carry the exit when they land, and land without a second draw.
  - [ ] A freelancer landing draws on the fleet's turns with its own draws.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4, 7.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S

- [ ] **Task 9: `robotSystems.ts` — the entrance is drawn when a group's last member lands `Docked`**

  **Description:** Spec §1.7, §1.8. On the tick after which no member of a group is `Active` or `Recalled`, the step
  calls `planEntrance` from that measure and writes every member's entrance and `shiftBpm`, and clears their exit
  turns.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A drifting company's first members to dock get no entrance until the last docks; then all get theirs on that
        tick.
  - [ ] A whole shift runs from hand-set starting moves through exit, entrance and the next exit with no hand-set
        measure after the first.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 8.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S

- [ ] **Task 10: `robotSystems.ts` — the stay: a group is recalled only while a robot outside it is `Active`**

  **Description:** Spec §1.9. A member due for recall with no robot outside its group `Active` (read on the working
  array, in roster order) is not recalled, and every `Active` member of its group loses its exit turn. On a later
  tick with an outside robot `Active`, the staying members all take the first turn of their journey the lead allows.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A lone group due for recall stays whole; relief landing earlier in the roster gives the new exit the same
        tick, later in the roster the next tick; the new exit is one turn for every staying member.
  - [ ] Two groups due on one measure with no third: the earlier in the roster is recalled, the later stays. A group
        beside only a `Recalled` robot stays.
  - [ ] Over a few hand-built worlds stepped 500 measures, the `Active` count never reaches zero.
  - [ ] Mutants killed: the recall without the check; the stay holding one robot of the group.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M

- [ ] **Task 11: `robotSystems.ts` — the battery is a gauge**

  **Description:** Spec §1.10. After the transitions, each robot's level steps a straight line to its target: 10 on
  the bar line after its exit turn while out, 100 on its entrance while home. A staying robot, and one that has
  stayed until it docks, loses `BATTERY_EASE_SHARE` of its level each measure; a home robot with no entrance gains
  that share of what is missing. Adds the constant.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A robot's level is exactly 10 on the bar line after its exit turn and exactly 100 on its entrance.
  - [ ] The level falls on every measure a robot is out, `Recalled` included, and rises on every measure it is home,
        `Undocking` included; no two consecutive measures hold one value.
  - [ ] In a stay the level keeps falling and never reaches 0.
  - [ ] Mutant killed: the gauge aimed at the exit turn itself.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

- [ ] **Task 12: `robotSystems.ts` — a tempo change rescales the moves**

  **Description:** Spec §1.12. At the top of the step, a robot whose `shiftBpm` differs from `env.bpm` has its
  entrance or exit turn passed through `rescaleMove` and its `shiftBpm` updated. A `Recalled` or `Undocking` robot
  keeps its hold.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A company planned at 60 BPM and stepped at 200 keeps one exit turn between its members, on a turn, further
        off in bars; no docking state changes on the tick the tempo changes.
  - [ ] A `Recalled` robot's hold is the same before and after.
  - [ ] The gauge reaches its target on the rescaled measure with no jump on the tick of the change.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 6, 10.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S

- [ ] **Task 13: `robotSystems.ts` — a robot out of step takes its group's move**

  **Description:** Spec §1.14. An `Active` robot with no exit turn takes a mate's if it can still make it, else is
  treated as staying. A `Docked` robot with no entrance takes a home mate's; with its group out it waits; with its
  whole group home and no entrance, the entrance is drawn. A robot whose group changed (its moves no longer match
  any mate's and it is not in a hold) drops them.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`.

  **Acceptance criteria:**
  - [ ] A hand-built `Active` robot with no fields is recalled on a turn once another group is out, and is never left
        out for ever.
  - [ ] A robot moved into a company that is out, while it is home, stays home and comes out at the company's next
        entrance.
  - [ ] A roster of twelve robots with no fields at all reaches a state where every robot carries a move within one
        home window, with the `Active` count never zero.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M

### Checkpoint B: The step
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] The new step is complete and pure. `tickRobotLifecycle` still calls today's step; the live world is unchanged.
- [ ] Reviewed with Crawford before Phase 3.

---

### Phase 3: The start and the sims (no live change)

- [ ] **Task 14: `spawnSystem.ts` — the start of a world, as a pure function**

  **Description:** Spec §1.13. `generateRosterStart(noiseMap, { bpm, worldKey, startMeasure })` returns, per roster
  index, the docking, the battery and the first move: each group's start from its even draw
  (`'roster.groupStartsOut'` under `SHIFT_START_OUT_ODDS`, the earliest group if none starts out); a starting-out
  group whole at 100 with its exit from `planExit`; a starting-home group at each member's `'roster.dockedBattery'`
  with one entrance, the first turn at or after `round(u × SHIFT_HOME_MAX_BARS × bpm ÷ 60)` measures in
  (`'roster.groupFirstEntrance'`). Membership is `generateCompanyMembership`'s. `spawnInitialRoster` does not call it
  yet. Adds the constant.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`.

  **Acceptance criteria:**
  - [ ] A starting-out company is whole, at 100, with one exit turn; a starting-home company shares one entrance.
  - [ ] At least one group starts out in every one of the 121 grid worlds.
  - [ ] The two draws are even over 3,000 worlds, and the same world gives the same start twice.
  - [ ] Mutants killed: the start by roster index; a plain draw.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 4, 5.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/constants/index.ts`

  **Estimated scope:** M

- [ ] **Task 15: `lifecycleSim.ts` — sim rosters carry their groups**

  **Description:** `buildSimRoster` gains each robot's `companyId` and `compositionSeed` (seeded as spawn seeds
  them), which today's step ignores, and a second builder, `buildShiftSimRoster(noiseMap, env)`, returns
  `generateRosterStart`'s roster as snapshots for the new step.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`.

  **Acceptance criteria:**
  - [ ] Each sim robot's group matches `generateCompanyMembership` for its world.
  - [ ] Today's pinned drain and cover rows are unchanged (the old step reads none of the new fields).
  - [ ] `buildShiftSimRoster` equals `generateRosterStart` robot for robot.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 14.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** S

- [ ] **Task 16: `lifecycleSim.ts` — a group tally: apart, group exits, on a turn, time out and home**

  **Description:** A pure accumulator beside the cover tally (spec §5.3), fed one post-tick roster per measure and a
  turn reader. Per company it counts the measures with any member sounding and those with not every member sounding
  (the **apart share**); each company exit and whether every member docked on one measure (**group exits**); each
  exit and first entrance and whether it lands on a turn of the group's journey; and every group's times out and
  home in bars. It reads `id`, `docking` and the group only, so it runs on either step.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: hand-built roster series.

  **Acceptance criteria:**
  - [ ] A company of three with one member out for 4 of its 10 sounding measures has an apart share of 40 %.
  - [ ] Three members docking on one measure are one group exit; on two measures, one exit that is not.
  - [ ] An exit on a turning measure counts as on a turn and one a bar off does not; times out and home are the
        measured spans.
  - [ ] The tally does not mutate what it is handed and gives the same result twice.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 15.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** M

- [ ] **Task 17: `lifecycleSim.ts` — the cover sim on either step at a tempo, and its report**

  **Description:** `runShiftCoverSim({ coords, measures, bpms, step })` runs the cover tally and the group tally over
  the grid on today's step or the new one at each tempo and pools one row per (step, tempo): silent measures, robots
  sounding, apart share, group exits, on a turn, time out and home in bars and in seconds (median, p90, longest),
  stays, heard share. `formatShiftCoverReport` renders it. The full run (2,000 measures, five tempos, both steps) is
  behind `LIFECYCLE_SIM_REPORT`.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: one world's row equals a count the test makes itself.

  **Acceptance criteria:**
  - [ ] The single-world cross-check holds on both steps.
  - [ ] Always on: zero silent measures on the new step over the grid at 60 BPM for 2,000 measures, and over a few
        worlds at 20, 40, 100 and 200.
  - [ ] Always on: every planned exit turn and every group's first entrance on the new step is a turning measure.
  - [ ] Deterministic; no store and no BeatClock.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes, and its run time is noted in the commit.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 13, 16.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`

  **Estimated scope:** M

- [ ] **Task 18: Run — today's row and the new rows at five tempos**

  **Description:** Run the report and write the table into Results: today's step (one row in bars, its seconds at
  each tempo) and the new step at 20, 40, 60, 100 and 200 BPM, beside spec §5.5's first-cut bars.

  **Proof:** Run — `LIFECYCLE_SIM_REPORT=1 npx vitest run src/systems/lifecycleSim.test.ts -t "<the report's title>"`.

  **Acceptance criteria:**
  - [ ] The table is in Results with the command and the date.
  - [ ] Each of spec §5.5's sim criteria is marked met or missed against it, with no constant changed.

  **Verification:**
  - [ ] The run's output pasted into Results as printed.

  **Dependencies:** Task 17.

  **Files:** `docs/tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md`

  **Estimated scope:** XS

- [ ] **Task 19: `lifecycleSim.ts` — the loop sim counts late members and door waits; run it**

  **Description:** Spec §1.11, §5.3. `runLoopSim` learns the wait at the port: a returning robot that arrives while
  `Recalled` waits until its hold's last bar and goes in on the hold's bar line; one that arrives with under half a
  measure left, or after it, is **late** and takes the next bar line. The result gains late members, member exits
  and every door wait in seconds. Then the readiness run at 20, 110 and 200 BPM on the new step goes into Results.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts`: a hand-worked timeline with a scripted step (an early
  arrival, one inside the last bar's first half, one late). Then a Run.

  **Acceptance criteria:**
  - [ ] The three scripted arrivals give the door waits and the one late member worked by hand.
  - [ ] The existing loop-sim cases pass unmodified on today's step.
  - [ ] Results holds late members per exit, door waits (median, p90, longest), turn-backs and charging-while-visible
        at the three tempos.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 17.

  **Files:** `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`,
  `docs/tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md`

  **Estimated scope:** M

### Checkpoint C = Gate A: the numbers (stop)
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Results holds Task 18's and Task 19's tables beside today's rows.
- [ ] **Crawford reads them and keeps or moves spec §4's constants and §5.5's bars.** Nothing is wired or heard yet.

- [ ] **Task 20: The picks, pinned**

  **Description:** Whatever Gate A moved is changed in `src/constants/index.ts`, the rows are run again into Results,
  and the always-on pins that name a value are moved in the same commit. With nothing moved, this task is a line in
  Results saying so.

  **Proof:** RED test where a pinned value moves (the pin fails first); otherwise Run.

  **Acceptance criteria:**
  - [ ] The constants are Gate A's, each with his date in its comment.
  - [ ] Results holds the final rows, and spec §4 and §5.5 carry the same numbers.

  **Verification:**
  - [ ] `npx vitest run src/systems/shiftPlan.test.ts src/systems/lifecycleSim.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/constants/index.ts`, the test files whose pins move,
  `docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md`, this file

  **Estimated scope:** XS to S

---

### Phase 4: Wiring (the live world changes here)

- [ ] **Task 21: `robotSystems.ts` — the tick moves to the new step**

  **Description:** `tickRobotLifecycle` reads the tempo (`useAudioStore`) and the world's key (`worldKeyOf` on the
  locale's coordinates), calls `stepShiftLifecycle`, writes each changed robot's battery and three fields, and fires
  the landing effects where a transition happened, as today. The tick's battery-driven cases in
  `robotSystems.test.ts` are re-aimed at moves in this commit and counted in its message; today's
  `stepRobotLifecycle` cases stay. `workLoop.integration.test.ts`'s three recall triggers (a battery set near
  critical) become an exit turn set near.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: a live roster's company is recalled on one tick from its
  exit turn, with the seam called once per member.

  **Acceptance criteria:**
  - [ ] A tick writes the new fields and the battery to the store and nothing else new; `audioMode` is never written.
  - [ ] `beginRecall`, `beginUndocking`, `landOnActive` and `landOnDocked` fire once per transition, and the seam
        stays the tick's only route to visuals (the existing pin).
  - [ ] A locale with no coordinates, or a robot with no fields, does not throw (Task 13's rule covers it).
  - [ ] The full suite is green; every re-aimed case is named or counted in the commit.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts src/systems/workLoop.integration.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 20.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`,
  `src/systems/workLoop.integration.test.ts`

  **Estimated scope:** L (one source file, but many tick cases re-aimed; not splittable with the suite green)

- [ ] **Task 22: `robotSystems.ts` — the replay on the new step, and the prove-it**

  **Description:** `replayLifecycle(roster, from, to, env)` loops the new step. The prove-it runs a real 12-robot
  roster with two companies for N real ticks and replays it once at the same tempo, identical field for field, new
  fields included, through a group exit, a drifting exit, a stay and its relief (spec §5.1).

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: the prove-it.

  **Acceptance criteria:**
  - [ ] N real ticks and one replay give identical rosters; a hand-written loop over the step matches the replay;
        `toMeasure < fromMeasure + 1` is a no-op.
  - [ ] The run named in the test passes through all four events, checked in the test, not assumed.
  - [ ] Mutant killed: a field left out of the snapshot the tick builds.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 21.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** M

- [ ] **Task 23: `spawnSystem.ts` — a world starts by groups**

  **Description:** `spawnInitialRoster` takes each robot's docking, battery and first move from
  `generateRosterStart` (the live tempo, the world's key, the current measure) in place of the roster-index start.
  The cases that pin "indices 0 to n−1 start Active" are re-aimed; the sim-roster-matches-spawn case moves to
  `buildShiftSimRoster`. Any other suite pin the new start moves is re-pinned here and named.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: a spawned world's companies are each whole, out or home.

  **Acceptance criteria:**
  - [ ] Every spawned robot carries the move `generateRosterStart` gives it; a starting-out company's members are all
        `'exiting'` at their ports and a starting-home one's all `'charging'`.
  - [ ] Still one store write for the placement, and every robot keeps its voice and its registered melody.
  - [ ] The full suite is green; every re-pin is named in the commit, old → new.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/systems/lifecycleSim.test.ts src/systems/worldTransition.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 21.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/systems/lifecycleSim.test.ts`, and
  the test files whose pins move

  **Estimated scope:** M

- [ ] **Task 24: `stationFadeSystem.ts` — a `Recalled` robot waits at its port, and its fade ends on its hold**

  **Description:** Spec §1.11. For an `'entering'` robot that is `Recalled`, the sixteenths left are counted to the
  bar line of its `dockingHoldUntilMeasure`, not to the next bar line: with more than a measure left it holds; with a
  measure or less and `STATION_FADE_MIN_STEPS` or more, the fade and the arc start over what is left. A `Docked`
  robot keeps today's rule. Solo, the cancel and the no-record design are unchanged.

  **Proof:** RED test — `src/systems/stationFadeSystem.test.ts`.

  **Acceptance criteria:**
  - [ ] A hold two or more bars ahead gets nothing on any tick; on the bar line of the last bar it gets the fade and
        the arc over 16 sixteenths.
  - [ ] Arriving in the last bar with 8 or more sixteenths left gets both over what is left; with fewer, nothing
        until it is `Docked`, then today's rule.
  - [ ] Today's cases for a `Docked` robot and for Solo pass unmodified.
  - [ ] Mutants killed: the hold ignored (today's code); the fade started a bar early.

  **Verification:**
  - [ ] `npx vitest run src/systems/stationFadeSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 21.

  **Files:** `src/systems/stationFadeSystem.ts`, `src/systems/stationFadeSystem.test.ts`

  **Estimated scope:** S

- [ ] **Task 25: `workLoop.integration.test.ts` — a company goes in on one bar line**

  **Description:** Spec §5.1's integration cases: the real tick, the real loop and the real fade system at 60 and 200
  BPM. A company of three is recalled on one measure from a swim, a job and a wait; each reaches its port and waits;
  all three become `'charging'` on one bar line. Tests only, unless they find a fault.

  **Proof:** RED test — `src/systems/workLoop.integration.test.ts` (it fails before Task 24; if it passes at once
  here, the commit says which mutant of Task 24 it kills).

  **Acceptance criteria:**
  - [ ] The three members' `'charging'` writes land on the same bar line at both tempos.
  - [ ] No member is dock-muted before that bar line, and the loop still never calls `AudioEngine` (the existing
        pin).
  - [ ] The two hidden-tab turn-back cases still pass.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.integration.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 23, 24.

  **Files:** `src/systems/workLoop.integration.test.ts`

  **Estimated scope:** S

### Checkpoint D: Wired
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every sim criterion of spec §5.5 still holds on the wired code (re-run Task 18's report; note any row that
      moved).
- [ ] Reviewed with Crawford before the gate.

- [ ] **Task 26: The browser runs, then Gate B: Crawford's eye and ear (stop)**

  **Description:** Spec §5.3's browser runs, then §5.4's Gate B. Runs first, with `?debug`: a company's exit watched
  end to end; the roster tiles' batteries reading 10 as the bodies go in; a tempo drag from 60 to 200 and back with
  no robot changing state on the drag. Then Crawford's three worlds: three companies ((−200, 80)), one at 40 BPM, one
  at 160 BPM or more. A listening list with the measures to watch goes into Results before he listens.

  **Proof:** Look and Ear — Crawford's, on the built branch after a hard reload.

  **Acceptance criteria:**
  - [ ] He answers: does a company read as a group; do exits feel placed; the last bar (spec Q1); the gathering at
        the door, and whether it runs too long at a fast tempo; a staggered entrance (Q2); the battery through a
        shift, a stay and a tempo change.
  - [ ] Each answer is written into Results. Anything he moves becomes a task inserted here before Phase 5.

  **Verification:**
  - [ ] His words quoted in Results with the date.

  **Dependencies:** Checkpoint D.

  **Files:** this file

  **Estimated scope:** XS for the agent; the gate is his

---

### Phase 5: After the gate

- [ ] **Task 27: The removals — today's step, the drain machinery and the roster-index start (on Crawford's yes)**

  **Description:** Spec Q3. **Stop and ask before starting.** With his yes: delete `stepRobotLifecycle`, `DrainRule`,
  `activeDrain`, `BATTERY_DRAIN_ACTIVE`, `BATTERY_RECHARGE_RATE`, the drain sim (`runDrainSim`, `DRAIN_CANDIDATES`,
  `flatDrain`, `formatDrainReport`, `activeCountsOverTime` if nothing else reads it), the today-step option of
  `runShiftCoverSim`, the old `runCoverSim` rows the new report replaces, `INITIAL_ACTIVE_ROBOTS_MIN` / `MAX`, and
  the tests that exercise only those. Today's rows stay in Results as the record. With his no: this task is struck
  and the code stays.

  **Proof:** Read — the diff is deletions; the suite, types and lint stay green.

  **Acceptance criteria:**
  - [ ] Nothing left in `src/` reads a removed name (`build:types` and `lint` say so).
  - [ ] No test that exercises shipped behaviour is deleted; each deleted test is listed in the commit with what it
        covered.

  **Verification:**
  - [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` clean.

  **Dependencies:** Gate B, and his yes.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/lifecycleSim.ts`, `src/constants/index.ts`, their test files

  **Estimated scope:** M (deletions only)

- [ ] **Task 28: `docs/ROBOT_LIFECYCLE.md` — the lifecycle as shipped**

  **Description:** Principle 3 (the plan decides, the battery is a gauge), the docking machine's triggers and holds,
  the stay as a group's, the Battery section (the gauge; the pace table; the rates gone), Roster Creation (the start
  by groups), the sims (the new rows from Results), the testing notes. Every name and number checked against the
  shipped source and Results, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No sentence describes the battery as the cause of a recall or an undocking.
  - [ ] Every constant, function and figure named exists in the shipped source or in Results.

  **Verification:**
  - [ ] Manual review against the source.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate B (and Task 27 if it ran).

  **Files:** `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 29: The other docs, CLAUDE.md's line, and the spec's "As built"**

  **Description:** `MELODY_SYSTEM.md` (`journeyTurns`; the lifecycle reads the journey), `COMPANIES.md` (a company
  comes and goes as one), `PROCEDURAL_GENERATION.md` (the two new dataIds, the retired one, the `:shifts` streams),
  CLAUDE.md's ROBOT_LIFECYCLE.md line under Reference docs (spec Q6; the new wording is shown to Crawford before the
  commit), roadmap 94's Open list, a line in `plan.md` if he places it, and the spec's "As built" section: what the
  gates moved, every constant as shipped, where the build departed from the spec. The battery help copy in
  `src/content/copy/probe.ts` is read; if it is wrong it is flagged to him, not changed here.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Each doc matches the shipped source; the spec's "As built" lists every departure, this plan's "new beside
        old" included.
  - [ ] CLAUDE.md's guardrails and forbidden list are untouched; only the reference line changes.

  **Verification:**
  - [ ] Manual review against the source.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 28.

  **Files:** `docs/MELODY_SYSTEM.md`, `docs/COMPANIES.md`, `docs/PROCEDURAL_GENERATION.md`, `CLAUDE.md`,
  `docs/todo/roadmap.md`, `docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md`

  **Estimated scope:** S (docs only; six files, small edits each)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every acceptance criterion above is met, and spec §5.5 is marked criterion by criterion in the spec's "As
      built".
- [ ] Any browser check not done in the session is flagged here, never skipped silently.
- [ ] Ready for Crawford's PR.

- [ ] **Task 30: Archive roadmap 94 (after the merge)**

  **Description:** Move roadmap 94 to the archive by the repo's convention (a stub stays; links are rebased), and
  delete its `plan.md` line if it has one.

  **Proof:** Read.

  **Acceptance criteria:**
  - [ ] The entry is in `docs/todo/archive/roadmap-archive.md` with its links working from there.

  **Verification:**
  - [ ] The links opened from the archive.

  **Dependencies:** The merge.

  **Files:** `docs/todo/roadmap.md`, `docs/todo/archive/roadmap-archive.md`, `docs/todo/plan.md`

  **Estimated scope:** XS

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The first-cut odds give too few group exits, or shifts that all run to the limit | High | Gate A exists for this: Tasks 17 to 19 measure every number on a pure step before anything is wired, and Task 20 pins what he picks. |
| Groups moving as blocks make the fleet thin or lumpy (a mean far from 5, long stays) | High | The cover row reports sounding and stays at five tempos; spec §5.5 makes a mean outside 4.5 to 6 a stop and report. |
| Task 21 re-aims many tick cases in one commit | Medium | The new step is fully tested before it (Tasks 7 to 13), so Task 21 changes only who the tick calls; its commit counts the re-aimed cases; the old step's own cases stay until Task 27. |
| Members miss the exit's bar line (a far robot, a long job), so the company still goes quiet raggedly | Medium | Task 19 counts late members at three tempos before Gate A; `RECALL_LEAD_SECONDS` is his to raise there. |
| The wait at the door looks wrong at a fast tempo (20 bars of lead at 200 BPM) | Medium | Gate B looks at a fast world. Spec A6's per-robot lead is the follow-up if it does, not built here. |
| A tempo drag redraws every tick and thrashes the plans | Medium | Task 12 rescales only when `shiftBpm` differs and snaps to a turn; Task 26 drags the slider and watches that no robot changes state. |
| A company edited mid-shift leaves a robot with a move no mate shares | Low | Task 13's one rule, tested on a moved robot and on a roster with no fields at all. |
| The always-on sim cases slow the suite | Low | Task 17 runs the grid at one tempo and a few worlds at the others, and notes the file's run time. |

## Open Questions

1. **Q1, the last bar.** **Resolved by default** (spec approved 2026-11-20 with no change): the turn's own bar.
   Gate B (Task 26) hears it.
2. **Q2, a staggered entrance's spacing.** **Resolved by default:** 2 bars. Gate B hears it.
3. **Q3, the removals.** **Open** — Task 27 stops for Crawford's yes. His rule is that a removal is proposed, never
   made unasked.
4. **Q4, the success numbers.** **Resolved by default:** spec §5.5's first cuts stand, and Gate A may move them once
   today's rows are beside them.
5. **Q5, the other members' battery sizes.** **Resolved by default:** every robot keeps drawing one.
6. **Q6, CLAUDE.md's lifecycle line.** **Resolved** by the spec's approval; Task 29 still shows him the new wording
   before the commit.

## Results

Filled in by Tasks 18, 19, 20 and 26. Nothing measured yet.

- **Today's row and the new rows** (Task 18), run 2026-11-20 on `feature/companies-together` after Task 17, with
  `LIFECYCLE_SIM_REPORT=1 npx vitest run src/systems/lifecycleSim.test.ts -t "the report: the grid at 20, 40, 60, 100
  and 200 BPM"`: the 121-world grid, 2,000 measures a world, spec §4's first-cut constants unchanged. Today's step reads
  no tempo, so its five rows are one run in bars with the seconds scaled. Pasted as printed:

  | Step | BPM | Silent | Sounding (mean, p10–p90) | Apart | Group exits | Exits on a turn | Entrances on a turn | Time out, bars (median, p90, longest) | Time out, s | Time home, bars | Time home, s | Stays / 1,000 | Stay length | Heard share (lowest–highest) |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | today | 20 | 0.0 % | 5.42, 3–8 | 91.9 % | 4.2 % of 11414 | 13.7 % | 14.7 % | 19, 43, 482 | 228, 516, 5784 | 17, 27, 29 | 204, 324, 348 | 0.96 | 2, 5, 10 | 44.1 %–46.2 % |
  | today | 40 | 0.0 % | 5.42, 3–8 | 91.9 % | 4.2 % of 11414 | 13.7 % | 14.7 % | 19, 43, 482 | 114, 258, 2892 | 17, 27, 29 | 102, 162, 174 | 0.96 | 2, 5, 10 | 44.1 %–46.2 % |
  | today | 60 | 0.0 % | 5.42, 3–8 | 91.9 % | 4.2 % of 11414 | 13.7 % | 14.7 % | 19, 43, 482 | 76, 172, 1928 | 17, 27, 29 | 68, 108, 116 | 0.96 | 2, 5, 10 | 44.1 %–46.2 % |
  | today | 100 | 0.0 % | 5.42, 3–8 | 91.9 % | 4.2 % of 11414 | 13.7 % | 14.7 % | 19, 43, 482 | 46, 103, 1157 | 17, 27, 29 | 41, 65, 70 | 0.96 | 2, 5, 10 | 44.1 %–46.2 % |
  | today | 200 | 0.0 % | 5.42, 3–8 | 91.9 % | 4.2 % of 11414 | 13.7 % | 14.7 % | 19, 43, 482 | 23, 52, 578 | 17, 27, 29 | 20, 32, 35 | 0.96 | 2, 5, 10 | 44.1 %–46.2 % |
  | shift | 20 | 0.0 % | 5.85, 2–9 | 25.1 % | 82.2 % of 16460 | 100.0 % | 100.0 % | 15, 26, 75 | 180, 312, 900 | 15, 23, 26 | 180, 276, 312 | 40.98 | 3, 9, 22 | 41.1 %–57.5 % |
  | shift | 40 | 0.0 % | 5.47, 2–9 | 20.4 % | 83.4 % of 12557 | 100.0 % | 100.0 % | 19, 31, 79 | 114, 186, 474 | 23, 31, 36 | 138, 186, 216 | 46.15 | 4, 12, 25 | 38.5 %–54.9 % |
  | shift | 60 | 0.0 % | 5.36, 2–9 | 15.9 % | 83.6 % of 9426 | 100.0 % | 100.0 % | 25, 40, 91 | 100, 160, 364 | 30, 45, 50 | 120, 180, 200 | 36.89 | 6, 15, 36 | 38.3 %–52.5 % |
  | shift | 100 | 0.0 % | 5.32, 2–9 | 11.2 % | 84.1 % of 6516 | 100.0 % | 100.0 % | 37, 55, 117 | 89, 132, 281 | 45, 64, 83 | 108, 154, 199 | 26.67 | 8, 23, 50 | 37.2 %–52.4 % |
  | shift | 200 | 0.0 % | 5.29, 2–9 | 6.3 % | 85.4 % of 3752 | 100.0 % | 100.0 % | 63, 89, 159 | 76, 107, 191 | 80, 106, 167 | 96, 127, 200 | 16.90 | 14, 38, 102 | 37.3 %–52.9 % |

  How to read it: a time out runs from a group's first member out to its last member home, so it holds the drift of a
  drifting exit and any stay; a time home runs from all home to the first member out. "Group exits" counts company exits
  only; "Exits on a turn" counts every robot's docking (its exit turn is the bar before). A stay on today's step is an
  Active robot at or under critical; on the shift step it is an Active robot with no exit turn, counted per robot.

  **Spec §5.5's sim criteria against it, no constant changed:**

  | Criterion | Result |
  |---|---|
  | No silent measure in any grid world at any of the five tempos | **Met**: 0.0 % at all five (always on at 60 BPM over the grid, and on six worlds at the other four). |
  | Every planned exit turn and group entrance turn is a turning measure | **Met**: 100 % of exits and entrances on a turn at all five; no planned exit off a turn (always on). |
  | Apart share at or under 20 % at every tempo | **Missed at 20 BPM (25.1 %) and 40 BPM (20.4 %)**; met at 60 (15.9 %), 100 (11.2 %) and 200 (6.3 %). Today: 91.9 %. The share falls with tempo because the stagger (2 bars) and the drift (a turn a member) are in bars while a shift at a slow tempo is few bars. |
  | Group exits at or over 75 % of company exits | **Met**: 82.2 %–85.4 %. Today: 4.2 %. |
  | Median time out in seconds at 40, 100 and 200 within a third of 60's | **Met**: 60 BPM 100 s; 40 → 114 s, 100 → 89 s, 200 → 76 s (all within 67–133 s). 20 BPM, reported: 180 s (the 8-bar floor). |
  | No time out past its "most" except in a stay; no time home past its "most" | **Home met**: the longest time home at each tempo is the largest group's "most" (26, 36, 50, 83, 167 bars) or under. **Out not separable from this row**: a time out includes a drifting exit's later turns and any stay, which the tally does not tell apart; the p90 sits at or under the largest group's "most" at 40–200 BPM (31 against 31 at 40, 40 against 40 at 60, 55 against 67, 89 against 133), and over it at 20 BPM (26 against 24). |
  | Robots sounding: a mean from 4.5 to 6 at every tempo | **Met**: 5.29–5.85 (today 5.42). |
  | Late members under 5 % of member exits at each loop-sim tempo | Task 19. |

  **Two things to see that no criterion names:** stays are far commoner than today's (17–46 robot-stays per 1,000
  measures a world against 0.96), and longer at fast tempos in bars (median 14 bars at 200 BPM): when the last group out
  is due with nobody else out it stays, and groups now move as blocks, so that happens more. And the heard share widens
  from 44–46 % to about 37–57 %: some robots are out more than others, which the intent welcomed ("unfair airtime").
- **The loop sim** (Task 19), run 2026-11-20 after Task 19 with `LIFECYCLE_SIM_REPORT=1 npx vitest run
  src/systems/lifecycleSim.test.ts -t "the door report"`: the 121-world grid, 10 minutes a world at 20, 110 and 200 BPM,
  the shift step with the door on (`runReadinessSim({ step: 'shift' })`), the shipped cooldown. Pasted as printed:

  | BPM | Member exits | Late members | Door wait (median, p90, longest) | Turn-backs | Charging visible | Longest Docked visible |
  |---|---|---|---|---|---|---|
  | 20 | 1320 | 0 (0.0 %) | 16.0 s, 20.7 s, 23.3 s | 0 | 0 | 0.0 s |
  | 110 | 2812 | 0 (0.0 %) | 17.1 s, 21.0 s, 23.5 s | 0 | 0 | 0.0 s |
  | 200 | 3124 | 0 (0.0 %) | 18.2 s, 21.2 s, 23.6 s | 0 | 0 | 0.0 s |

  | Cooldown | BPM | Mean waiting | p95 waiting | Longest wait | p95 wait | Switches / stint | Turn-backs | Charging visible | Longest Docked visible |
  |---|---|---|---|---|---|---|---|---|---|
  | 0.3/2/30 | 20 | 0.0 % | 0.1 % | 4.0 s | 4.0 s | 0.28 | 0 | 0 | 0.0 s |
  | 0.3/2/30 | 110 | 0.0 % | 0.0 % | 4.0 s | 4.0 s | 0.12 | 0 | 0 | 0.0 s |
  | 0.3/2/30 | 200 | 0.0 % | 0.0 % | 4.0 s | 4.0 s | 0.12 | 0 | 0 | 0.0 s |

  A "member exit" is a company member reaching its port on the way in; "late" is under half a measure before its hold's
  bar line, or Docked already. A door wait is the time from reaching the port to the start of the fade (the hold's last
  bar), freelancers included.

  **Against spec §5.5:** late members under 5 % of member exits at each loop-sim tempo: **met**, 0 at all three. No
  robot charges while visible, and none is visible while Docked (the fade now ends on the hold's bar line).

  **To see at Gate B:** the wait at the door is long. Most robots are near home when recalled, so they spend most of
  the 24-second lead (`RECALL_LEAD_SECONDS`) at the port, visible and playing: a median of 16–18 s and up to 23.6 s, at
  every tempo (the lead is in seconds). Crawford said gathering at the door is fine to see (2026-11-20); spec A6's
  per-robot lead is the follow-up if it reads as too long, and `RECALL_LEAD_SECONDS` is his to lower (no member was
  late, so there is room).
- **Gate A's picks** (Task 20): —
- **Gate B's listening list and answers** (Task 26): —
