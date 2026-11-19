# Implementation Plan: The Melody Journey

Source spec: [docs/specs/MELODY_JOURNEY.md](../specs/MELODY_JOURNEY.md). Source intent:
[docs/intent/melody-journey.md](../intent/melody-journey.md). Roadmap
[92](../todo/roadmap.md#92-the-melody-journey-a-home-melody-and-a-seeded-walk-that-makes-it-busier-and-calmer).

> **After this plan:** roadmap 93, journey dynamics (2026-11-18 and 2026-11-19), changed parts of what it built,
> without a task file of its own: the spec's [§10](../specs/MELODY_JOURNEY.md#10-journey-dynamics-roadmap-93) lists
> every change with its commit. This plan is left as the record of 92's build; where it names `journeyPosition`, read
> `journeyAt(...).position`.

**Status:** plan written 2026-11-17; Crawford asked for Phase 1 the same day. Phase 1 built on `feature/melody-journey`
(Tasks 1–7, ab4c5bbc..8ca7100e). Checkpoint A's suite, mutation checks and path lengths done (Results); its review
with Crawford is next. Phase 2 built the same day (Tasks 8–9, 5fb21a7b, 4d088fb0); Checkpoint B's suite and probe
done (Results), its review with Crawford next, then Task 10. Phase 3 built the same day (Tasks 10–14, 842b28fb,
7d00e5b8, bae04ac3, cce717bf, 92461adc); Checkpoint C's suite and mutation checks done (Results); its browser look and
review with Crawford next, then Task 15. Phase 4 built the same day (Tasks 15–17, 76dae0fb, 90e82c07, e713df1c);
Checkpoint D's suite done (Results); Gate A, Crawford's ear, next. Phase 5 built 2026-11-17 on Crawford's word (Tasks
18–20, f0e17661, 2ea953e5, b0bc81e6, 65adbb2a), with Gate A's numbers not recorded, so the plan's defaults stand;
Checkpoint E's suite, build and mutation checks done; Gate B run as a substitute (the step harness is broken, Results);
Gate C was next.

**Revised 2026-11-17, after Checkpoint E:** Crawford changed what a journey is (the intent and the spec, both revised
that day): a list of intensity and time pairs bounded by two settings, in place of the walk and the Development
slider. Phases 6 to 9 below (Tasks 24 to 37) rebuild the journey, the engine's read of it, the settings and the
seeding on top of what Phases 1 to 5 built; the docs move to Phase 10 and keep their task numbers (21 to 23). Phase 6
built the same day on Crawford's word (Tasks 24–26, 659f5f56, 840f9b01, 54cb4a74; a test tightened at the checkpoint,
2f7796b0); Checkpoint F done (Results) and passed on Crawford's word. Phase 7 built the same day (Tasks 27–28,
7627bb59, 157faf54; a tidy at the checkpoint, c0643e2c); Checkpoint G's suite and mutation checks done (Results).

**Revised again 2026-11-17, after Phase 7:** Crawford took max time off the robot (spec §7.4): every journey has one
max time of 16, so robots on one journey move in lock step. Task 38 (Phase 7) takes the built field out; Tasks 29 to
35 below are revised to carry max intensity alone. Task 38 built the same day (c670c221; Results, Checkpoint G).
Phase 8 built the same day on Crawford's word (Tasks 29–32, 4b0504b1, f85c7e41, 2f39079c, c71db96e), with
Checkpoint G's browser look and review still open; Checkpoint H's suite done (Results). Gate A, Crawford's ear, is
next.

**Phase 9 built 2026-11-17 on Crawford's word** (Tasks 33–37, c8262d96, bf836cf7, af66424f, 9fb95462, 9a8d11f4), with
Gate A's numbers not recorded, so the plan's defaults stand (the band `{ min: 1, max: 16, lit: 0.7 }`, the key `ji`).
Checkpoint I's suite, build and mutation checks done (Results). Gates B and C, Crawford's, are next.

**Phase 10 built 2026-11-17** (Tasks 21–22, 59d43056, cb2aae71). The gates closed the same day: Gates A and C and
Checkpoint G's look passed on Crawford's listen with nothing moved, Gate B waived (Results, Checkpoint Complete).
Ready for his PR; Task 23 after the merge.

## Overview

A robot's melody develops while it plays: busier, home, calmer, home, on a seeded journey read from the music clock.
The build is 23 tasks in six phases. Phase 1 is the two pure modules, the walk (`src/engine/melodyJourney.ts`) and the
changes (`src/engine/melodyDevelopment.ts`), with no caller. Phase 2 removes docking pitch drift, so the home melody
holds still. Phase 3 makes the engine play the melody of each note's own measure. Phase 4 puts the two settings on the
robot, company and All Probes screens, and ends at Gate A, Crawford's first listen. Phase 5 seeds and saves the
settings and ends at the profile and the world listen. The docs were Phase 6 and are now Phase 10.

**The revision adds 14 tasks in four phases** (spec §8 says what of Phases 1 to 5 stands). Phase 6 builds the new
journey as three pure pieces beside the walk, with no caller: the shares, a robot's pairs, and the position inside a
list of pairs. Phase 7 puts the two bounds on the robot and swaps the engine onto the pairs; the walk goes; then
(Task 38, revised again) max time leaves the robot for one max time of 16 on every journey. Phase 8 swaps the
Development slider for Max Intensity on the robot, company and All Probes screens, and ends at Gate A. Phase 9 seeds
and saves max intensity, deletes `development`, and ends at Gates B and C.

## Architecture Decisions

- **The engine reads a robot's settings when it plays; registration still carries only the home melody.** `stepNotes`
  already reads the stored robot on the tick (its release, its Humanize seed), so a Development or Journey edit, a
  company move, a loaded save and the deal need no engine call. The spec first had registration carry a descriptor;
  that needed a re-registration at every site that moves a robot between companies, and a missed one would have
  played a stale journey. Spec §1.7 and §1.9 are amended.
- **The engine's registry changes shape in two steps.** Task 13 files events per robot with no change in what plays
  (the existing engine tests pass unmodified), and Task 14 adds the per-measure read on top. The riskiest change in
  the plan is then a parity refactor followed by a small addition.
- **The changes are built one phase at a time (Tasks 3 to 7).** Until a later phase exists, a position past the last
  built change plays the last built change. Each task leaves `developMelody` total and tested.
- **Drift goes before the engine work (Phase 2).** With it in, a docking would rewrite the home melody under the
  journey, and Gate A would be a listen to both at once.
- **A note a change adds gets a derived id** (`` `${sourceId}:d${changeNumber}` ``), not a `generateUUID`, so one
  position always gives the same events, ids included.
- **The seeded Journey is written where membership is known.** `spawnRobot` writes `'own'`; `spawnInitialCompanies`
  writes `'company'` with the `companyId` it already writes; the baseline reads the same membership
  (`generateCompanyMembership`), so a fresh world diffs clean.
- **`development` joins the deal's field table with no push** (`TOP_LEVEL_FIELDS`, `src/systems/aspectDeal.ts`), as
  `dynamics` does: a theme change re-derives it by a store write.
- **The floor is handed the top of the theme's bpm band by its caller** (`getBand('bpm').max`), so
  `melodyDevelopment.ts` stays free of the loading context.
- **Resolves spec §7.1 A17:** a save and a world link both carry a hand-made company whole, id included, so a
  company's journey comes back with it. No task needed.
- **The sweep over the 121 worlds lives in its own test file** (`melodyDevelopment.worlds.test.ts`), so it runs in
  parallel with the unit file, as the `spawnSystem.even*` files do.

**The revision's decisions (Phases 6 to 9):**

- **Add, swap, then delete.** `Robot.development` is read in 24 files under `src/`, so it cannot be renamed in one
  small task. Max intensity is added beside it, each layer is swapped onto it, and `development` is deleted last
  (Tasks 32, 36 and 37). Types hold after every task.
- **Between Task 28 and Phase 9 every robot plays its home melody unless max intensity is set by hand.** The engine
  reads it from Task 28, and nothing seeds it until Task 34. This is the quiet world Gate A wants, as it was the
  first time.
- **Max time is the journey's, not the robot's** (spec §7.4, Task 38). The pure pieces keep it as an argument, so the
  shape at other max times stays tested; `robotJourney` hands back `JOURNEY_TIME_MAX` for every robot.
- **The journey is three pure pieces, tested apart.** The shares are checked as properties over long runs; the
  position inside a list of pairs is checked literally, on pairs written by hand (the spec's worked example); a
  robot's scaling of the shares sits between them.
- **The shares' tests read the constants.** Every odd and lean is Crawford's to move at Gate A, so an expected share
  is worked out from `JOURNEY_HOME_ODDS` and its neighbours in the test, not written as a number.
- **Every pair takes four draws**, used or not, so pair i reads the same draws whatever the pairs before it did.
- **Turning measures depend on the key and max time alone**, not on max intensity or the calm limit, so that pair is
  the memo's key. Intensities are scaled when read.
- **The calm limit is read from the registered home melody** in `entriesOnStep`, where the engine already holds it. It
  is not stored and not a setting.
- **`developMelody` and the engine's cache are untouched.** The cache is keyed on the position, so a drop of many
  changes is one rebuild, as a single change is.
- **Gate B is run again.** A drop can move a robot up to 31 changes in one measure (from +16 to a calm limit of 15),
  and the first Gate B measured the walk.
- **The docs keep their task numbers** (21 to 23) and run last, so nothing that names "Task 22" moves.

## Dependency Graph

```
Task 1 (the walk)            Task 2 (lengths, floor, event fields)
     │                              │
     │                Tasks 3 → 4 → 5 → 6 → 7 (the changes, phase by phase)
     │                              │
     │            Tasks 8 → 9 (drift goes; needs nothing above)
     │                              │
     │        Task 10 (palette step) → Task 11 (the engine honours sixteenths and pitchStep; needs 2)
     │                              │
     └──────────► Task 12 (the two fields, robotJourney; needs 1, 2)
                                    │
                  Task 13 (registry per robot, parity) → Task 14 (the per-measure read; needs 7, 11, 12)
                                    │
                  Task 15 (content, schemas, applies) → Task 16 (robot screen) → Task 17 (company, All Probes)
                                    │
                                 Gate A
                                    │
                  Task 18 (band, draw) → Task 19 (spawn, baseline, deal) → Task 20 (saves, links)
                                    │
                             Gate B, Gate C
                                    │
                  Tasks 21, 22 (docs) → Task 23 (archive, after the merge)
```

The revision, built on the above (Tasks 21 to 23 now follow Task 37):

```
Task 24 (the shares)        Task 25 (the position in a list of pairs)
     │                              │
     └──────► Task 26 (a robot's pairs, the calm limit; needs 24)
                                    │
Task 27 (the two bounds on the robot, the store)
     │                              │
     └──────► Task 28 (the engine plays the pairs, the walk goes; needs 25, 26, 27)
                                    │
              Task 38 (max time leaves the robot; needs 28)
                                    │
              Task 29 (content, schema, apply; needs 38) → Task 30 (robot screen) → Task 31 (company, All Probes)
                                    │
                  Task 32 (the Development slider's leftovers go; needs 31)
                                    │
                                 Gate A
                                    │
              Task 33 (band, draw) → Task 34 (spawn, baseline, deal) → Task 35 (saves, links)
                                    │
              Task 36 (development's band and draw go; needs 34) → Task 37 (the field goes; needs 35, 36)
                                    │
                             Gate B, Gate C
                                    │
              Tasks 21, 22 (docs) → Task 23 (archive, after the merge)
```

## Task List

Every task names its **Proof**. RED test: a test that imports or renders the code and fails first. Read: a human
review, for a docs-only or deletion task. Look: what to see in the browser. Every task ends with
`npm run build:types` and `npm run lint` clean; it is not repeated under each one.

Tasks 1, 12 and 15 to 20 were built as written below and are revised by Phases 6 to 9: the walk, `robotJourney`'s
rate, and everything that carries `development`. Their text is left as the record of what was built.

### Phase 1: The walk and the changes

- [x] **Task 1: `melodyJourney.ts` — the walk**

  **Description:** New pure module. `journeyKey(worldKey, scope)` builds the three keys of spec §1.3;
  `journeyPosition(key, rate, measure)` returns the walk at `floor(rate × measure)`. The walk is an `alea` over the
  key: the first draw is the first turning point's side, each next draw a whole distance from `JOURNEY_SWING_MIN` to
  `JOURNEY_SWING_MAX`, sides alternating. Turning points are drawn as needed and memoised per key. The constants
  (`JOURNEY_SWING_MIN` 2, `JOURNEY_SWING_MAX` 8, `DEVELOPMENT_MIN` 0, `DEVELOPMENT_MAX` 2, `DEVELOPMENT_STEP` 0.125) go
  in `src/constants/index.ts`. No caller yet.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts`: the positions below.

  **Acceptance criteria:**
  - [x] Position is 0 at measure 0 for any key and rate, and at every measure when the rate is 0.
  - [x] The same key, rate and measure give the same position; a different key gives a different walk.
  - [x] The walk at consecutive counts differs by exactly one, over 5,000 counts.
  - [x] Over that run the position never passes `JOURNEY_SWING_MAX` either side, visits both sides, and returns to 0
        between them.
  - [x] Own, a company id and fleet give three different keys for one world; one key gives one walk whoever asks.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 2: `Robot.ts`, `melodyDevelopment.ts` — the event's two fields, lengths and the floor**

  **Description:** `MelodyEvent` gains `sixteenths?: number` and `pitchStep?: number` (spec §1.4), documented as
  never written on a home event. New module `melodyDevelopment.ts` with `eventSixteenths(event)` (the `sixteenths`
  field when present, else the note name's length: 1, 2, 4, 8, and 16 for anything a bar or longer) and
  `developmentFloor(attackSeconds, bpmTop)` (spec §1.8).

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts`: both helpers.

  **Acceptance criteria:**
  - [x] `eventSixteenths` reads `'16n'`, `'8n'`, `'4n'`, `'2n'` as 1, 2, 4, 8, and prefers `sixteenths` when set.
  - [x] `developmentFloor` is 1 for attacks up to 0.3 s at a band top of 100 BPM, 4 at 1.14 s, and never below 1.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/types/Robot.ts`, `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** S

- [x] **Task 3: `melodyDevelopment.ts` — home and the calm side**

  **Description:** `developMelody(home, position, options)` with `options = { floor, seed }`. Position 0 returns
  `home` itself. A negative position applies that many ties (spec §1.6): candidates are every home note but the
  bar's first, sorted by length then start, visited from alternating ends; the note before the tied one sounds on to
  the tied note's end. A positive position returns `home` for now.

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts`: the calm side.

  **Acceptance criteria:**
  - [x] Position 0 is the same array reference as `home`.
  - [x] Position −1 removes the shortest candidate, and the note before it ends where the removed note ended, any
        silence between them covered.
  - [x] The visits alternate: shortest, longest, second shortest.
  - [x] The floor is one note, the bar's first, at its home start; every position below the floor equals the floor.
  - [x] A one-note and an empty home melody come back unchanged at any negative position.
  - [x] A home event no tie touched is the same object; a lengthened one is a new object with its id, rest and mark.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** Task 2.

  **Files:** `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** S

- [x] **Task 4: `melodyDevelopment.ts` — busier, the first pass of splits**

  **Description:** Spec §1.5, phase 1. `T` is the shortest home note, raised to the floor. Candidates are the home
  notes at least `2T` long, sorted by length then start, visited from alternating ends, until half (rounded up) are
  split. A split keeps `L − T` on the note and adds a `T`-long note where it now ends, one `pitchStep` from it; the
  direction is draw k of `alea(`` `${seed}:development` ``)` for change k, one draw per change. Positions past the pass
  play its last change.

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts`: phase 1.

  **Acceptance criteria:**
  - [x] The spec's worked example, position 1, literally: `1: 8, 9: 2, 11: 2, 13: 2`.
  - [x] With an eighth-note threshold, a note six sixteenths long becomes four and two (Crawford's dotted quarter).
  - [x] The two parts of a split sum to the note split; the new note carries no rest, mark or accent and has the
        derived id; the split note keeps its id, slot, rest and mark.
  - [x] A note shorter than `2T` is never split; a floor above `T` raises the threshold.
  - [x] The pass stops at half the candidates, rounded up. With no candidate, position 1 equals home.
  - [x] One seed gives the same directions every time; another seed gives the same rhythm with other directions.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** Task 3.

  **Files:** `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** M

- [x] **Task 5: `melodyDevelopment.ts` — busier, two thresholds**

  **Description:** Spec §1.5, phase 2. Changes alternate between `T / 2` and `T`, starting with `T / 2`, neither
  below the floor. For each, the candidates are every note now in the melody at least twice that threshold, sorted
  as before; the pick alternates shortest and longest, change by change. A threshold with no candidate hands its turn
  to the other; the phase ends when neither has one. A `T` of one sixteenth has no subdivision.

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts`: phase 2.

  **Acceptance criteria:**
  - [x] The worked example, positions 2 and 3, literally.
  - [x] A piece made by an earlier split is split again when it is long enough.
  - [x] With `T` of 1, or a floor at or above `T`, the phase uses the one threshold and still ends.
  - [x] After the phase's last change no note is at least twice the smaller threshold.
  - [x] No note is ever shorter than the floor.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** Task 4.

  **Files:** `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** S

- [x] **Task 6: `melodyDevelopment.ts` — busier, the silence fills**

  **Description:** Spec §1.5, phase 3. A gap is a run of silence inside the bar, measured on written lengths: before
  the first note, between two notes, after the last. While a gap is at least one fill length long (the smaller
  threshold in use), a change adds one note of that length at the end of the longest gap (the earliest on a tie), on
  the slot and octave of the note it leads into and one `pitchStep` from it. The gap after the last note leads into
  the bar's first note.

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts`: phase 3.

  **Acceptance criteria:**
  - [x] In a bar with nothing left to split and one gap at its end, the next change adds a note at the end of that
        gap, as a neighbour of the bar's first note. (The worked example is not this case: after its position 3 it
        still has notes to split.)
  - [x] The longest gap fills first, the earliest on a tie, and a fill sits flush against the note it leads into.
  - [x] A rest stamped on a note is not a gap.
  - [x] The phase ends when no gap is a fill length long. A bar with no silence has no fills.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** Task 5.

  **Files:** `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** S

- [x] **Task 7: `melodyDevelopment.ts` — the shifts, and the whole path over the 121 worlds**

  **Description:** Spec §1.5, phase 4: a change moves one note one `pitchStep`, notes visited in start order, round
  and round, without end. Then the sweep of spec §5.2 in its own file: every robot of the 121 sim worlds
  (`SIM_SEED_COORDS`, home melodies from the roster baselines through `composeRobotMelody`), at every position from
  below the calm floor to 12 changes past the last fill.

  **Proof:** RED test — `src/engine/melodyDevelopment.test.ts` (the shift) and
  `src/engine/melodyDevelopment.worlds.test.ts` (the sweep; its shift-phase assertions fail first).

  **Acceptance criteria:**
  - [x] A shift changes one note's `pitchStep` by one and nothing else; the visit order is by start and wraps.
  - [x] Over the sweep: no two notes overlap, none leaves the bar, none is shorter than the robot's floor.
  - [x] Over the sweep: position p+1 is position p plus one change, and walking back from p+1 gives p exactly.
  - [x] Over the sweep: before the shift phase, every home note is present on its own slot and start.
  - [x] Over the sweep: the same inputs give the same events, ids included, and no melody is ever empty.

  **Verification:** `npx vitest run src/engine/melodyDevelopment.test.ts src/engine/melodyDevelopment.worlds.test.ts`
  passes; note the sweep file's run time in the commit.

  **Dependencies:** Task 6.

  **Files:** `src/engine/melodyDevelopment.ts`, `src/engine/melodyDevelopment.test.ts`,
  `src/engine/melodyDevelopment.worlds.test.ts`

  **Estimated scope:** M

### Checkpoint A: the pure core
- [x] `npm test` clean (full suite).
- [x] Mutation checks, each killed by a test: the alternation of ends (Tasks 3, 4), the `2T` rule (4), the half
      rounded up (4), the floor (5), the fill's gap choice (6), the one-draw-per-change rule (4).
- [x] The path lengths, measured once over the 121 worlds with a throwaway probe (not committed) and written under
      Results below: per robot, the calm changes, the splits and the fills. Gate A's swing numbers are read against
      these.
- [x] Reviewed with Crawford before Phase 2 (2026-11-17: he moved on to Phase 2).

---

### Phase 2: Docking pitch drift goes

- [x] **Task 8: `robotSystems.ts` — a docking no longer changes a melody**

  **Description:** Remove the drift block from `stepRobotLifecycle`; `melody`, `dockCycleCount` and `noteVariance`
  from `RobotLifecycleSnapshot`; `landOnDocked`'s `driftedMelody` parameter, its `melody` write and its
  `registerRobotMelody` call. `stepRobotLifecycle`'s and `replayLifecycle`'s `noiseMap` parameter goes too if the
  drift was its only reader (it is, as read on 2026-11-17; confirm). Delete `src/systems/dockCycles.ts` after a grep
  shows the drift was its only reader. `lifecycleSim.ts` follows the snapshot. Tests of the drift itself are deleted
  and named in the commit.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: a Recalled robot landing on Docked keeps the same
  `melody` array and makes no `registerRobotMelody` call.

  **Acceptance criteria:**
  - [x] The RED test passes; no melody changes at any docking transition.
  - [x] The replay still matches the live tick measure by measure (the existing parity tests, with only the removed
        fields and parameter edited out).
  - [x] Before committing, run every test file that mocks `./dockCycles`, `robotSystems` or `lifecycleSim`
        (`grep -rln` for each), not only the two named here.

  **Verification:** `npx vitest run src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts src/systems/workLoop.integration.test.ts src/systems/worldTransition.test.ts`
  passes.

  **Dependencies:** None.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`, `src/systems/lifecycleSim.ts`,
  `src/systems/lifecycleSim.test.ts`, `src/systems/dockCycles.ts` (deleted)

  **Estimated scope:** M

- [x] **Task 9: `melodyGenerator.ts` — the re-roll and what only it used are deleted**

  **Description:** Delete `reRollMelodyPitches`, `pickWeightedIndex` and `pickRandomIndices` (each confirmed by grep
  to have no caller left), their tests, and `DOCKED_PITCH_DRIFT_RATIO`. `MelodyEvent.pitchLocked` and the code that
  stamps it stay (spec §7.2, question 3).

  **Proof:** Read — a deletion. The type check and lint show nothing dangles.

  **Acceptance criteria:**
  - [x] The three functions and the constant are gone, with no reference left in `src/`.
  - [x] `generateMelodyForRobot` is untouched, and its tests pass unmodified.

  **Verification:** `npx vitest run src/engine/melodyGenerator.test.ts src/engine/regenerateMelody.test.ts` passes.

  **Dependencies:** Task 8.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

### Checkpoint B: drift gone
- [x] `npm test` clean (full suite).
- [x] In the browser: a robot's melody is the same before and after a dock cycle (the note cloud, or a Solo by ear).
      Read from the store by a headless probe (Results); a listen is his at the review.
- [x] Reviewed with Crawford before Phase 3 (2026-11-17: he moved on to Phase 3).

---

### Phase 3: The engine plays the measure's melody

- [x] **Task 10: `harmonySystem.ts` — a step through the palette**

  **Description:** A pure `stepInPalette(palette, noteIndex, octave, pitchStep, octaveRange)` returning the note name
  and octave (spec §1.4, §1.7): the palette's distinct pitch classes in rising order, moved through `pitchStep`
  places from the event's own class, the octave carried across the top and the bottom. A result outside
  `octaveRange` takes the opposite step; if that leaves too, the event's own note. Sharps and flats are read.

  **Proof:** RED test — `src/engine/harmonySystem.test.ts`: the steps below.

  **Acceptance criteria:**
  - [x] In `C G E D B C E G`: up one from E4 is G4, up one from B4 is C5, down one from C4 is B3.
  - [x] A `pitchStep` of 0 is the palette's own note at the event's octave.
  - [x] Two steps are two single steps. A one-class palette steps by octaves.
  - [x] At the edge of `octaveRange` the step turns back, and the result is always inside the range.

  **Verification:** `npx vitest run src/engine/harmonySystem.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/engine/harmonySystem.ts`, `src/engine/harmonySystem.test.ts`

  **Estimated scope:** S

- [x] **Task 11: `AudioEngine.ts` — `stepNotes` honours `sixteenths` and `pitchStep`**

  **Description:** In `stepNotes`, an event with a `pitchStep` resolves through `stepInPalette` with the stored
  robot's `octaveRange` (no range when the robot is not found), and an event with `sixteenths` sounds for that many
  sixteenths at the live tempo, with the rest and mark arithmetic applied to that length. Events with neither read
  exactly as now.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: a registered melody with one event carrying each field.

  **Acceptance criteria:**
  - [x] A `pitchStep` event's note is the palette step for the measure it sounds in, so it moves with the chord.
  - [x] A `sixteenths: 3` event's duration is three sixteenths at the transport's tempo; with a rest it shortens from
        that length and is never under `MIN_SOUNDING_SECONDS`.
  - [x] Every existing `stepNotes` and `processMelodyStep` test passes unmodified.

  **Verification:** `npx vitest run src/engine/AudioEngine.test.ts` passes.

  **Dependencies:** Tasks 2, 10.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

- [x] **Task 12: `Robot.ts`, `localeStore.ts`, `melodyJourney.ts` — the two fields and `robotJourney`**

  **Description:** `Robot.development?: number` and `Robot.journey?: 'own' | 'company' | 'fleet'` (spec §1.9), absent
  reading as 0 and `'own'` (`DEFAULT_DEVELOPMENT`, `DEFAULT_JOURNEY`). `localeStore.updateRobot` normalises them as it
  does `pitchRepeat`: development clamped to 0–2 and snapped to 0.125, a NaN or an unknown journey dropped. A pure
  `robotJourney(robot, worldKey, bpmTop)` returns `{ key, rate, floor, seed }`; a robot on Company with no
  `companyId` gets its Own key. `worldKeyOf(coordinates)` moves here, and `melodyWorldKey` uses it.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts` (`robotJourney`) and `src/stores/localeStore.test.ts` (the
  normalisation).

  **Acceptance criteria:**
  - [x] Two members of one company on Company get one key; the same two on Own get two; any two robots on Fleet get
        one.
  - [x] A freelancer on Company gets the key it would have on Own.
  - [x] The floor follows the robot's attack; the rate is the stored development; a robot with neither field reads
        as rate 0.
  - [x] `updateRobot` stores 0.3 as 0.25, 5 as 2, and drops a NaN and an unknown journey, keeping the stored value.
  - [x] `melodyWorldKey` returns what it returned before.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts src/stores/localeStore.test.ts src/engine/regenerateMelody.test.ts`
  passes.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/types/Robot.ts`, `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`,
  `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/engine/regenerateMelody.ts`,
  `src/constants/index.ts`

  **Estimated scope:** M

- [x] **Task 13: `AudioEngine.ts` — the registry files events per robot (no change in what plays)**

  **Description:** `stepRegistry` (a map from step to every robot's entries) becomes a registry per robot: its
  registered melody, its accented events and its click-track flag, with the entries by step built once at
  registration. `stepNotes` gathers a step's entries robot by robot. A re-registered robot moves to the end of the
  order, as its entries do today, so the order notes reach the polyphony cap in is unchanged. A refactor: nothing
  that plays changes.

  **Proof:** Read — a refactor with no behaviour change, so no RED test (CLAUDE.md). The proof is every existing test
  in `AudioEngine.test.ts` passing unmodified. One characterisation test is added before the refactor and passes
  before and after it: the order of two robots' notes on one step, before and after a re-registration.

  **Acceptance criteria:**
  - [x] Every existing engine test passes unmodified.
  - [x] `registerRobotMelody` stays idempotent, `unregisterRobotMelody` removes every trace of a robot, and the click
        track still replaces a robot's melody at the one funnel.
  - [x] The order test above passes.

  **Verification:** `npx vitest run src/engine/AudioEngine.test.ts src/engine/clickTrack.test.ts src/engine/noteEvents.test.ts`
  passes.

  **Dependencies:** Task 11.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M

- [x] **Task 14: `AudioEngine.ts` — a note reads its own measure's melody**

  **Description:** For each registered robot, `stepNotes(at, time)` reads the stored robot, builds its journey
  (`robotJourney`, with the active locale's world key and `getBand('bpm').max`), takes
  `journeyPosition(key, rate, at.measure)` and plays `developMelody(home, position, { floor, seed })`. The developed
  events by step are kept per robot for the last few positions and rebuilt only when the position or an input
  changes. A robot the store does not hold, and a robot on the click track, play what is registered. The accent stays
  on the home event that had it. Check what importing the band reader newly reaches at module load before adding it
  (the 2026-10-31 lesson), and run every test file that mocks `AudioEngine`'s imports.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: the reads below.

  **Acceptance criteria:**
  - [x] From one registration, `stepNotes` at two measures with different positions returns each measure's own
        events.
  - [x] A robot at Development 0 returns its home melody's notes at every measure.
  - [x] Writing a new `development`, `journey`, `companyId` or attack to the store changes the next read with no
        engine call.
  - [x] Two robots with one key and one rate are at the same position at every measure of a 200-measure run.
  - [x] Reading measure m, then m+1, then m again (the trigger and the early announcement either side of a bar line)
        gives m's events both times and rebuilds nothing the second time.
  - [x] A note a change adds is never accented; a home event's accent, rest and mark are as registered.

  **Verification:** `npx vitest run src/engine/AudioEngine.test.ts` passes, and the full suite (`npm test`) before
  the commit.

  **Dependencies:** Tasks 7, 12, 13.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M

### Checkpoint C: the engine
- [x] `npm test` clean (full suite).
- [x] Mutation checks, each killed: the measure passed to `journeyPosition` (14), the Company fallback to Own (12),
      the octave-range turn-back (10), the kept positions (14).
- [ ] In the browser, with a robot's `development` set from the console through the store: its notes change from
      measure to measure and return to the home melody. **Overtaken by the revision:** `development` is gone; the
      look is Checkpoint G's, on max intensity, passed on his listen.
- [x] Reviewed with Crawford before Phase 4 (2026-11-17: he moved on to Phase 4).

---

### Phase 4: The two settings, by hand

- [x] **Task 15: content, schemas and the two applies**

  **Description:** Content entries `probe.composition.development` and `probe.composition.journey` (with its three
  options and help text), as stand-ins marked the way the file's other stand-ins are. `DEVELOPMENT_SCHEMA` (a
  `SliderLinearSchema`, 0 to 2, step 0.125) and `JOURNEY_SCHEMA` (a `RadioButtonSchema`) in `robotOptionsConfig.ts`.
  `applyDevelopment` and `applyJourney` in `robotOptionsActions.ts` write the field and nothing else.

  **Proof:** RED test — `src/systems/robotOptionsActions.test.ts`: each apply writes its field, and neither
  regenerates the melody nor calls the engine.

  **Acceptance criteria:**
  - [x] Both applies write the store and make no `AudioEngine` and no `regenerateMelody` call.
  - [x] The stored melody is the same array after either.
  - [x] `src/content/content.test.ts` passes with the new entries.

  **Verification:** `npx vitest run src/systems/robotOptionsActions.test.ts src/content/content.test.ts` passes.

  **Dependencies:** Task 12.

  **Files:** `src/content/copy/probe.ts`, `src/data/robotOptionsConfig.ts`, `src/systems/robotOptionsActions.ts`,
  `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S

- [x] **Task 16: `CompositionSections.tsx`, `RobotScreen.tsx` — the third row on the robot screen**

  **Description:** `CompositionRhythmMelodySection` gains a third row: Development beside Journey (spec §1.10).
  `PingControlsValue` gains both. Journey is disabled while Development is 0, its value kept. The row renders when
  its two handlers are given (optional until Task 17 makes every caller pass them). `RobotScreen` passes the values
  and handlers.

  **Proof:** RED test — `src/components/robot/CompositionSections.test.tsx` (the row, the dimming, the handlers) and
  `src/components/panels/screen/screens/RobotScreen.test.tsx` (an edit reaches the store).

  **Acceptance criteria:**
  - [x] Both controls render with their content labels; a change calls its handler with the new value.
  - [x] Journey is disabled at Development 0 and enabled above it, showing the stored value either way.
  - [x] On the robot screen, moving Development writes `robot.development`, and choosing Fleet writes
        `robot.journey`.
  - [x] Look: the row at phone width and desktop; neither control changes size as values change.

  **Verification:** `npx vitest run src/components/robot/CompositionSections.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`
  passes; the Look recorded in the commit.

  **Dependencies:** Task 15.

  **Files:** `src/components/robot/CompositionSections.tsx`, `src/components/robot/CompositionSections.test.tsx`,
  `src/components/panels/screen/screens/RobotScreen.tsx`,
  `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** M

- [x] **Task 17: the company and All Probes broadcast**

  **Description:** `CompanyOptionsSnapshot` gains `development` and `journey`; `companyOptions.ts` resolves them from
  the first member as it does `pitchRepeat`; `useCompanyOptions` broadcasts each to every member through the two
  applies; `CompanyOptionsSection` passes them to the section, whose two handlers become required. All Probes uses
  the same hook.

  **Proof:** RED test — `src/components/company/useCompanyOptions.test.ts`: a company edit of each setting writes
  every member.

  **Acceptance criteria:**
  - [x] A company's Development edit writes every member's `development` and the company's snapshot; the same for
        Journey.
  - [x] The All Probes screen's edit reaches every robot.
  - [x] A member edited on its own afterwards keeps its own value (broadcast, not link).

  **Verification:** `npx vitest run src/components/company/useCompanyOptions.test.ts src/systems/companyOptions.test.ts src/components/company/CompanyOptionsSection.test.tsx src/components/panels/screen/screens/CompanyScreen.test.tsx`
  passes.

  **Dependencies:** Task 16.

  **Files:** `src/types/Company.ts`, `src/systems/companyOptions.ts`, `src/components/company/useCompanyOptions.ts`,
  `src/components/company/useCompanyOptions.test.ts`, `src/components/company/CompanyOptionsSection.tsx`

  **Estimated scope:** M

### Checkpoint D: Gate A, Crawford's ear
- [x] `npm test` clean (full suite).
- [ ] **Gate A.** Every robot still spawns at Development 0, so the world sounds as it did. Crawford sets one robot
      to 1 and solos it, then a company to one rate on Company, then the fleet on Fleet. His to move here, each
      recorded in the spec before Phase 5: the order rules of §1.5 and §1.6 (A1 to A6), the swing (A12, against the
      path lengths in Results), and the slider's stops (A13). **Never recorded, and overtaken by the revision:** the
      listen is Checkpoint H's, on the new journey. The order rules (A1 to A6) are still his to move there.
- [x] Stop. Phase 5 starts on his word. (Given 2026-11-17.)

---

### Phase 5: Seeding and saving

- [x] **Task 18: the band and the draw**

  **Description:** `'robot.development'` joins the band keys (`bandKeys.ts`), Classic's column
  (`{ min: 0.125, max: 1, lit: 0.7 }`, or Gate A's numbers) and the Melody family's keys (`MELODY_BAND_KEYS`,
  `aspects.ts`); no aspect or theme column names it. `deriveMelodyFields` draws it: one even draw at
  `'robot.development.lit'` against the band's `lit`, one at `'robot.development'` across the band, snapped to
  0.125; a draw outside the lit share is 0. `MelodyFields`, `currentMelodyBands` and `RobotAudioBaseline` carry it.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts`: the draw.

  **Acceptance criteria:**
  - [x] Over 12,000 spawn indices the share above 0 is the band's `lit` within a point, and every value above 0 is on
        the 0.125 grid inside the band.
  - [x] A `lit` of 0 gives every robot 0. The same index gives the same value.
  - [x] The four older Melody fields draw exactly what they drew before (their existing tests, unmodified).

  **Verification:** `npx vitest run src/systems/robotFieldDerivation.test.ts src/data/bands/classic.test.ts src/data/bands/resolveBands.test.ts`
  passes.

  **Dependencies:** Task 12; Gate A.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`,
  `src/systems/robotFieldDerivation.ts`, `src/systems/robotFieldDerivation.test.ts`

  **Estimated scope:** M

- [x] **Task 19: spawn, the baseline and the deal**

  **Description:** `spawnRobot` writes `development` (an original's own draw, with the alea fallback its neighbours
  have; a member's from its founder) and `journey: 'own'`. `spawnInitialCompanies` writes `journey: 'company'` beside
  the `companyId`. `generateRobotRosterBaseline` mirrors both: a member's development is its founder's, and every
  index in a seeded company's membership is `'company'`. `development` joins the deal's `TOP_LEVEL_FIELDS` with no
  push, so a theme change re-derives it by a write.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts` and `src/systems/spawnSystem.families.test.ts`: the fields
  at spawn; `src/systems/aspectDeal.test.ts`: the re-derive.

  **Acceptance criteria:**
  - [x] In a spawned world every seeded company's robots, founder included, are on Company and every freelancer on
        Own; a member's development is its founder's.
  - [x] A spawned roster equals its baseline in both fields, over the 121 worlds.
  - [x] Over the 121 worlds, the members of a company share one journey key and one rate, and their developed
        melodies have the same starts and lengths at every measure of a 100-measure run (spec success criterion 3).
  - [x] A theme whose column moves the development band re-derives each robot's value in place, with no melody
        regeneration.

  **Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/systems/spawnSystem.families.test.ts src/systems/aspectDeal.test.ts src/systems/aspectDeal.widened.test.ts`
  passes.

  **Dependencies:** Tasks 14, 18.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/spawnSystem.families.test.ts`, `src/systems/aspectDeal.ts`, `src/systems/aspectDeal.test.ts`

  **Estimated scope:** M

- [x] **Task 20: saves and links**

  **Description:** `RobotAudioOverrideDiff` gains `development` and `journey`. `sessionDiff.ts` diffs each against
  the baseline and applies it, as it does `pitchRepeat`. `worldDiffCodec.ts` gives each a short key, chosen from
  those unused.

  **Proof:** RED test — `src/utils/sessionDiff.test.ts` and `src/utils/worldDiffCodec.test.ts`: the round trips.

  **Acceptance criteria:**
  - [x] An untouched robot has neither key in a save.
  - [x] Save, edit, wipe and load brings back both settings on a robot, and a company-wide edit on every member.
  - [x] A world link round-trips both.
  - [x] A payload saved before the fields existed loads, and its robots read the seeded values.

  **Verification:** `npx vitest run src/utils/sessionDiff.test.ts src/utils/worldDiffCodec.test.ts src/utils/seedBaseline.test.ts src/utils/sessionShareUtils.test.ts`
  passes.

  **Dependencies:** Task 19.

  **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`,
  `src/utils/worldDiffCodec.ts`, `src/utils/worldDiffCodec.test.ts`

  **Estimated scope:** M

### Checkpoint E: Gates B and C
- [x] `npm test`, `npm run build` clean.
- [x] Mutation checks, each killed: the lit share (18), the member's inherited rate (19), the Company write at
      `spawnInitialCompanies` (19), each diff key (20).
- [ ] **Gate B (profile).** `npm run perf` on `main` and on the branch, same session, one at a time: the branch adds
      no long task to the baseline table in [PERFORMANCE.md](../PERFORMANCE.md). A miss stops the build here, with
      the numbers and options. **Not run as written:** against `main`'s build the harness stops before its first
      measured step, at a nav button it can no longer find ("Settings"); a substitute A/B is in Results, for Crawford
      to accept or not. **Overtaken by the revision:** the gate is run again at Checkpoint I, on the new journey.
- [ ] **Gate C (Crawford's ear).** A full seeded world, on desktop and on the phone. His to move: the band (A14).
      **Overtaken by the revision:** moved to Checkpoint I.
- [x] Stop. In place of the docs, Crawford revised the journey (2026-11-17); Phase 6 follows.

---

### Phase 6: The journey of pairs

- [x] **Task 24: `melodyJourney.ts` — the journey's shares**

  **Description:** New pure `journeyShares(key, count)`: the first `count` pairs of a key's journey as shares,
  `{ intensity, time, drop }`, by the four rows of spec §1.3's table. An `alea` over the key, four draws per pair in
  the order home roll, intensity, time, drop roll, all four taken whatever the pair uses. Pairs are drawn as needed
  and memoised per key, as the walk's turning points are. The five constants (`JOURNEY_HOME_ODDS` 0.5,
  `JOURNEY_MIN_MOVE` 0.125, `JOURNEY_TIME_LEAN` 0.5, `JOURNEY_DROP_ODDS` 0.3, `JOURNEY_DROP_MIN_MOVE` 0.5) go in
  `src/constants/index.ts`. Built beside the walk, which the engine still reads. No caller yet.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts`: the rules below over 5,000 pairs of several keys, each
  expected share worked out from the constants.

  **Acceptance criteria:**
  - [x] The same key gives the same shares whichever count is asked for first; a different key gives different ones.
  - [x] Every intensity share is from −1 to 1 and every time share from 0 to 1.
  - [x] No pair's intensity share is within `JOURNEY_MIN_MOVE` of the one before it (the first counts from 0), and
        pairs both stay on a side and cross home.
  - [x] A pair heads home only from at least `JOURNEY_MIN_MOVE` away. Of the pairs that start 0.9 or more from home,
        the share heading home is `JOURNEY_HOME_ODDS × 0.95` within five points; of those that start within 0.25,
        it is under `JOURNEY_HOME_ODDS × 0.25`.
  - [x] Every time share lies between `JOURNEY_TIME_LEAN × (1 − |v|)` and that plus `1 − JOURNEY_TIME_LEAN`.
  - [x] The first pair is never a drop, no drop follows a drop, and no drop moves less than `JOURNEY_DROP_MIN_MOVE`.
        Of the pairs that could be a drop, the share that are is `JOURNEY_DROP_ODDS` within five points.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 25: `melodyJourney.ts` — the position inside a list of pairs**

  **Description:** New pure `positionInPairs(pairs, measure)`. `pairs` are a robot's own, `{ intensity, time }` in
  whole changes and whole measures; the first starts at home on measure 0. In a pair that runs from `a` on measure
  `s` to `b` on measure `s + T`, measure `s + k` plays `a + sign(b − a) × floor(|b − a| × k ÷ T)` (spec §1.3). A
  measure past the last pair handed in plays the last intensity. No caller yet.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts`: the worked example and the rules below, on pairs written
  by hand.

  **Acceptance criteria:**
  - [x] The worked example of spec §1.3, both columns, literally, at every measure from 0 to 32.
  - [x] Position 0 at measure 0, at a negative or non-finite measure, and everywhere on an empty list.
  - [x] A pair's intensity is played on its turning measure and on no earlier measure of that pair.
  - [x] Inside a pair the position never moves away from the pair's intensity.
  - [x] A pair with a time of 1 plays its intensity on the very next measure; a pair that does not move holds.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`

  **Estimated scope:** S

- [x] **Task 26: `melodyJourney.ts`, `melodyDevelopment.ts` — a robot's pairs, and its calm limit**

  **Description:** `calmLimit(home)` in `melodyDevelopment.ts`: the home notes less one, never below 0, which is how
  many calm changes `calmer` can make. `JourneyBounds` (`maxIntensity`, `maxTime`, `calmLimit`) and a pure
  `robotPairs(shares, bounds)` in `melodyJourney.ts`, by spec §1.3's "A robot's pairs": the intensity share times max
  intensity, rounded to the nearest whole change the same way on both sides of home, and never below the calm limit;
  the time share times max time, rounded to the nearest even number, never under 2; a drop's time is 1, and the pair
  before a drop is one measure shorter. No caller yet.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts` (the scaling) and `src/engine/melodyDevelopment.test.ts`
  (the calm limit).

  **Acceptance criteria:**
  - [x] Intensity: at 16, shares 0.5 and −0.5 give +8 and −8; at 1, shares 0.4, 0.6 and −0.6 give 0, +1 and −1.
  - [x] A calm intensity past the calm limit is brought in to it (share −0.75 at 16 with a limit of 4 gives −4); a
        busy intensity is never brought in.
  - [x] Time: at 16, shares 0, 0.1, 0.5 and 1 give 2, 2, 8 and 16; at 2, every share gives 2. Every time is even,
        except a drop's and that of the pair before a drop.
  - [x] A drop's time is 1 and the pair before it is one shorter (16 becomes 15, 2 becomes 1), so the times through
        any drop sum to an even number.
  - [x] Shares that scale to Crawford's example give `[[16, 15], [-8, 1], [0, 16]]`.
  - [x] `calmLimit` is 2 for three notes and 0 for one note and for none; `developMelody` at minus the limit has one
        note, and one change past it is the same melody.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts src/engine/melodyDevelopment.test.ts` passes.

  **Dependencies:** Task 24.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/engine/melodyDevelopment.ts`,
  `src/engine/melodyDevelopment.test.ts`

  **Estimated scope:** S

### Checkpoint F: the pure journey
- [x] `npm test` clean (full suite).
- [x] Mutation checks, each killed: the home roll ignored; the least move ignored; the time lean left out; a drop
      allowed after a drop; `positionInPairs` rounding in place of flooring (a robot arrives early); the calm limit
      not applied; the pair before a drop not shortened.
- [x] The journey's shape, measured once over long runs with a throwaway probe (not committed) and written under
      Results: at bounds of 16 and 16, the share of pairs that are drops, the share that head home, the mean time of
      a pair, and the mean measures between two visits home. Gate A's numbers are read against these.
- [x] Reviewed with Crawford before Phase 7 (2026-11-17: he moved on to Phase 7).

---

### Phase 7: The engine reads the pairs

- [x] **Task 27: `Robot.ts`, `localeStore.ts` — the two bounds**

  **Description:** `Robot.journeyMaxIntensity?: number` and `Robot.journeyMaxTime?: number` (spec §1.9). Constants
  `JOURNEY_INTENSITY_MAX` 16, `JOURNEY_TIME_MIN` 2, `JOURNEY_TIME_MAX` 16, `JOURNEY_TIME_STEP` 2,
  `DEFAULT_JOURNEY_MAX_INTENSITY` 0 and `DEFAULT_JOURNEY_MAX_TIME` 8. `localeStore.updateRobot` normalises both as it
  does `development`: max intensity to a whole number from 0 to 16, max time to an even number from 2 to 16, a `NaN`
  dropped. `Robot.development` stays until Task 37.

  **Proof:** RED test — `src/stores/localeStore.test.ts`: the normalisation.

  **Acceptance criteria:**
  - [x] Max intensity: 7.4 is stored as 7, 20 as 16, −1 as 0, `Infinity` as 16.
  - [x] Max time: 5 is stored as 6, 1 as 2, 40 as 16, and every stored value is even.
  - [x] A `NaN` in either is dropped, keeping the stored value and the rest of the update.

  **Verification:** `npx vitest run src/stores/localeStore.test.ts` passes.

  **Dependencies:** None.

  **Files:** `src/types/Robot.ts`, `src/constants/index.ts`, `src/stores/localeStore.ts`,
  `src/stores/localeStore.test.ts`

  **Estimated scope:** S

- [x] **Task 28: `melodyJourney.ts`, `AudioEngine.ts` — the engine plays the pairs; the walk goes**

  **Description:** `journeyPosition(key, bounds, measure)` replaces the rate form: 0 at a max intensity of 0 and at
  measure 0, else `positionInPairs` over the robot's pairs. The shares are memoised per key and the turning measures
  per key and max time, found by binary search as the walk's counts are, so a read at measure 10,000 does not walk
  there. `robotJourney` hands back `maxIntensity` and `maxTime` in place of `rate`, each absent field read as its
  default. `entriesOnStep` hands `journeyPosition` the calm limit of the registered melody. The walk (`walkFor`,
  `extendTo`, `walkAt`), `JOURNEY_SWING_MIN` and `JOURNEY_SWING_MAX` are deleted with their tests. The family case in
  `spawnSystem.families.test.ts` that reads `journey.rate` is moved onto bounds set by hand; Task 34 puts it back on
  seeded ones. From here the Development slider does nothing, and every robot plays its home melody until a bound is
  set.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts` (`journeyPosition` on bounds, `robotJourney`'s bounds) and
  `src/engine/AudioEngine.test.ts` (the per-measure read on a robot with bounds).

  **Acceptance criteria:**
  - [x] Position is 0 at measure 0 for any key and bounds, and at every measure at a max intensity of 0 or with no
        bounds at all.
  - [x] Over 2,000 measures of several keys, at bounds (16, 16), (16, 2), (1, 16) and (5, 8) and calm limits 0, 3 and
        15: no position is past max intensity or below the calm limit, and every turning measure is even but the one
        before a drop.
  - [x] Reads in any order of measures give the same positions.
  - [x] Two robots on one key with one max time and different max intensities turn on the same measures; with
        different max times they do not.
  - [x] `stepNotes` at two measures with different positions returns each measure's own events; a bound edited in the
        store is read on the next note with no engine call; a Click Track robot still plays the click track.
  - [x] The developed melody is rebuilt once per new position, not per sixteenth (the existing call-count case, on
        bounds), and `developMelody` is never asked for a position below the calm limit.

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts src/engine/AudioEngine.test.ts src/systems/spawnSystem.families.test.ts`
  passes; so does every file that mocks or imports `melodyJourney` (`grep -rln "melodyJourney" src`), and the full
  suite, before the commit.

  **Dependencies:** Tasks 25, 26, 27.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/engine/AudioEngine.ts`,
  `src/engine/AudioEngine.test.ts`, `src/systems/spawnSystem.families.test.ts`, `src/constants/index.ts`

  **Estimated scope:** M

- [x] **Task 38: max time leaves the robot** (added 2026-11-17, spec §7.4)

  **Description:** Crawford's change after Phase 7: robots on one journey move in lock step. `robotJourney` hands back
  `JOURNEY_TIME_MAX` (16) as `maxTime` for every robot, whatever the robot carries. `Robot.journeyMaxTime`, its
  normalisation in `localeStore.updateRobot` and that normalisation's tests, and the constants `JOURNEY_TIME_MIN`,
  `JOURNEY_TIME_STEP` and `DEFAULT_JOURNEY_MAX_TIME` are deleted. The pure pieces (`JourneyBounds.maxTime`,
  `robotPairs`, `journeyPosition`) keep max time as an argument and their tests at other max times. The engine
  block's fixtures and the family case stop setting a max time; the engine's "max time edit" case goes with the
  field.

  **Proof:** RED test — `src/engine/melodyJourney.test.ts` (`robotJourney`'s max time) and
  `src/engine/AudioEngine.test.ts` (robots on one journey turn together). Both fail first: an absent max time reads
  as 8 today, and a stored one is honoured.

  **Acceptance criteria:**
  - [x] `robotJourney`'s `maxTime` is `JOURNEY_TIME_MAX` for a robot with no fields and for one whose object still
        carries a `journeyMaxTime` (an old save's leftover).
  - [x] In the engine, a robot plays `journeyPosition(key, { its max intensity, JOURNEY_TIME_MAX, its calm limit })`
        at every measure of a run.
  - [x] Two robots on one Company journey with different max intensities, one of them carrying a stray
        `journeyMaxTime`, change melody only on the same measures in the engine.
  - [x] Nothing in `src/` names `JOURNEY_TIME_MIN`, `JOURNEY_TIME_STEP` or `DEFAULT_JOURNEY_MAX_TIME`, and
        `journeyMaxTime` only in the test fixtures that stand for an old save's leftover (searched by hand before the
        commit).

  **Verification:** `npx vitest run src/engine/melodyJourney.test.ts src/engine/AudioEngine.test.ts src/stores/localeStore.test.ts src/systems/spawnSystem.families.test.ts`
  passes, and the full suite before the commit.

  **Dependencies:** Task 28.

  **Files:** `src/engine/melodyJourney.ts`, `src/engine/melodyJourney.test.ts`, `src/engine/AudioEngine.test.ts`,
  `src/types/Robot.ts`, `src/constants/index.ts`, `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`,
  `src/systems/spawnSystem.families.test.ts`

  **Estimated scope:** S

### Checkpoint G: the engine on pairs
- [x] `npm test` clean (full suite).
- [x] Mutation checks, each killed: the calm limit not handed to the journey; the turning measures memoised without
      max time (two max times share them); `robotJourney` ignoring the stored max time; a max intensity of 0 still
      walking the pairs. (The first three killed; the fourth is equivalent and survives, Results.)
- [x] After Task 38: `npm test` clean, and the mutant of `robotJourney` reading a stored max time again killed.
- [x] Look: in the browser, a robot's max intensity set through the store and the robot soloed. Its notes change by
      the measure, a drop is heard on a bar line, and it comes home. Then two members of one company set to different
      max intensities: they turn on the same bar lines. (Crawford's listen, 2026-11-17, after Phase 10: Results,
      Checkpoint Complete.)
- [x] Reviewed with Crawford (after Phase 10, with the gates).

---

### Phase 8: Max intensity, by hand

- [x] **Task 29: content, schema and the apply**

  **Description:** Content entry `probe.composition.journeyMaxIntensity`, a stand-in marked the way the file's other
  stand-ins are. `JOURNEY_MAX_INTENSITY_SCHEMA` (a `SliderLinearSchema`, 0 to 16, step 1) in `robotOptionsConfig.ts`,
  reading Task 27's constant. `applyJourneyMaxIntensity` in `robotOptionsActions.ts` writes the field and nothing
  else. The Development entry, schema and apply stay until Task 32.

  **Proof:** RED test — `src/systems/robotOptionsActions.test.ts`: the apply writes its field, and neither
  regenerates the melody nor calls the engine.

  **Acceptance criteria:**
  - [x] The apply writes the store and makes no `AudioEngine` and no `regenerateMelody` call.
  - [x] The stored melody is the same array after it.
  - [x] `src/content/content.test.ts` passes with the new entry.

  **Verification:** `npx vitest run src/systems/robotOptionsActions.test.ts src/content/content.test.ts` passes.

  **Dependencies:** Task 38.

  **Files:** `src/content/copy/probe.ts`, `src/data/robotOptionsConfig.ts`, `src/systems/robotOptionsActions.ts`,
  `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S

- [x] **Task 30: `CompositionSections.tsx`, `RobotScreen.tsx` — row 3 on the robot screen**

  **Description:** In `CompositionRhythmMelodySection`, Max Intensity takes Development's place on row 3, beside
  Journey (spec §1.10, C1). `PingControlsValue` gains max intensity. Journey is disabled while Max Intensity is 0, its
  value kept. The Development slider is no longer rendered. Its prop and value stay in the section's types, optional,
  and the new handler is optional too, until Task 31 changes the last caller. `RobotScreen` passes the value and
  handler.

  **Proof:** RED test — `src/components/robot/CompositionSections.test.tsx` (the row, the dimming, the handler) and
  `src/components/panels/screen/screens/RobotScreen.test.tsx` (an edit reaches the store).

  **Acceptance criteria:**
  - [x] The Max Intensity slider renders with its content label; a change calls its handler with the new value.
  - [x] Journey is disabled at a Max Intensity of 0 and enabled above it, showing the stored value either way.
  - [x] On the robot screen, moving Max Intensity writes `robot.journeyMaxIntensity`, and choosing Fleet still writes
        `robot.journey`.
  - [x] No Development slider renders.
  - [x] Look: the row at phone width and desktop; no control changes size as values change (spec C1, Crawford's
        eye).

  **Verification:** `npx vitest run src/components/robot/CompositionSections.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`
  passes; the Look recorded in the commit.

  **Dependencies:** Task 29.

  **Files:** `src/components/robot/CompositionSections.tsx`, `src/components/robot/CompositionSections.test.tsx`,
  `src/components/panels/screen/screens/RobotScreen.tsx`,
  `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** M

- [x] **Task 31: the company and All Probes broadcast**

  **Description:** `CompanyOptionsSnapshot` swaps `development` for max intensity; `companyOptions.ts` resolves it
  from the first member, else the default; `useCompanyOptions` broadcasts it to every member through its apply;
  `CompanyOptionsSection` passes it to the section. The section's handler becomes required, and its Development prop
  and value go. All Probes uses the same hook.

  **Proof:** RED test — `src/components/company/useCompanyOptions.test.ts`: a company edit of max intensity writes
  every member.

  **Acceptance criteria:**
  - [x] A company's Max Intensity edit writes every member's `journeyMaxIntensity` and the company's snapshot.
  - [x] The All Probes screen's edit reaches every robot.
  - [x] A member edited on its own afterwards keeps its own value (broadcast, not link).
  - [x] Journey's broadcast is as it was (its existing tests, unmodified).

  **Verification:** `npx vitest run src/components/company/useCompanyOptions.test.ts src/systems/companyOptions.test.ts src/components/company/CompanyOptionsSection.test.tsx src/components/panels/screen/screens/CompanyScreen.test.tsx src/components/robot/CompositionSections.test.tsx`
  passes.

  **Dependencies:** Task 30.

  **Files:** `src/types/Company.ts`, `src/systems/companyOptions.ts`, `src/components/company/useCompanyOptions.ts`,
  `src/components/company/useCompanyOptions.test.ts`, `src/components/company/CompanyOptionsSection.tsx`,
  `src/components/company/CompanyOptionsSection.test.tsx`, `src/components/robot/CompositionSections.tsx`

  **Estimated scope:** M

- [x] **Task 32: the Development slider's leftovers go**

  **Description:** Deletion only. `applyDevelopment`, `DEVELOPMENT_SCHEMA` and the content entry
  `probe.composition.development`, each re-checked for a caller before it is deleted, with the tests that exercised
  them. `Robot.development` and its seeding stay until Phase 9.

  **Proof:** Read — a deletion. No new test.

  **Acceptance criteria:**
  - [x] Nothing imports any of the three.
  - [x] `npm test`, `npm run build:types` and `npm run lint` pass, `src/content/content.test.ts` among them.

  **Verification:** the full suite; the three names searched for in `src/` by hand before the commit.

  **Dependencies:** Task 31.

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`,
  `src/data/robotOptionsConfig.ts`, `src/content/copy/probe.ts`

  **Estimated scope:** XS (deletion only)

### Checkpoint H: Gate A, Crawford's ear
- [x] `npm test` clean (full suite).
- [x] **Gate A** (passed, Crawford's listen, 2026-11-17, after Phase 10; nothing moved: Results, Checkpoint
      Complete). Every robot still loads at a max intensity of 0, so the world plays its home melodies. Crawford
      sets one robot to 16 and solos it through a drop and a slow return home; then a low max intensity; then a
      company on Company at mixed max intensities, in lock step; then the fleet on Fleet. His to move here, each
      recorded in the spec before Phase 9: the journey's odds and leans (spec §7.3, B1 to B10, against the shape in
      Results, measured at max time 16), the one max time of 16 (§7.4), whether the busy top being pitch movement is
      right (B15), the row layout (C1), and the order rules of §1.5 and §1.6 (A1 to A6), which the first Gate A never
      recorded.
- [x] Stop. Phase 9 starts on his word.

---

### Phase 9: Seeding and saving max intensity

- [x] **Task 33: the band and its draw**

  **Description:** `'robot.journeyMaxIntensity'` (`{ min: 1, max: 16, lit: 0.7 }`), or Gate A's numbers, joins the
  band keys (`bandKeys.ts`), Classic's column and the Melody family's keys (`MELODY_BAND_KEYS`, `aspects.ts`); no
  aspect or theme column names it. A pure seeder in `robotFieldDerivation.ts`: `seedJourneyMaxIntensity(litRoll, t,
  band)`, 0 outside the lit share and otherwise a whole number in the band, each a full share, floored as
  `seedDevelopment` is. `deriveMelodyFields` draws it at `'robot.journeyMaxIntensity.lit'` and
  `'robot.journeyMaxIntensity'`. `MelodyFields`, `currentMelodyBands` and `RobotAudioBaseline` carry it.
  `development` is still drawn until Task 36, and max intensity stays out of the deal's field table until Task 34
  writes it at spawn, as Task 18 held `development` out.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts`: the draw.

  **Acceptance criteria:**
  - [x] Over 12,000 spawn indices the share of max intensities above 0 is the band's `lit` within a point; every
        value above 0 is a whole number in the band, and each of them takes its even share within a point.
  - [x] A `lit` of 0 gives every robot 0.
  - [x] The same index gives the same values, and the five older Melody fields draw exactly what they drew (their
        existing tests, unmodified).
  - [x] `resolveBands.test.ts`'s rows for a band against its slider's range, and for the Melody keys no aspect names,
        hold for the new band.

  **Verification:** `npx vitest run src/systems/robotFieldDerivation.test.ts src/data/bands/classic.test.ts src/data/bands/resolveBands.test.ts`
  passes.

  **Dependencies:** Task 27; Gate A.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`,
  `src/systems/robotFieldDerivation.ts`, `src/systems/robotFieldDerivation.test.ts`,
  `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** M

- [x] **Task 34: spawn, the baseline and the deal**

  **Description:** `spawnRobot` writes max intensity (an original's own draw, with the alea fallback its neighbours
  have; a member's from its founder) and stops writing `development`. `generateRobotRosterBaseline` mirrors it. Max
  intensity joins the deal's `TOP_LEVEL_FIELDS` with no push, and `development`'s row goes. The seeded Journey
  (`'company'` for a seeded company's robots, `'own'` for the rest) is untouched.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts` and `src/systems/spawnSystem.families.test.ts`: the fields
  at spawn; `src/systems/aspectDeal.widened.test.ts`: the re-derive.

  **Acceptance criteria:**
  - [x] A member's max intensity is its founder's, over the 121 worlds.
  - [x] A spawned roster equals its baseline in both settings, over the 121 worlds.
  - [x] Over the 121 worlds, the share of robots that are not members and load above 0 is the band's `lit` within
        five points.
  - [x] Over the 121 worlds, the members of a company share one journey key and the same max intensity, and their
        developed melodies have the same starts and lengths at every measure of a 100-measure run (spec success
        criterion 3). The family case goes back from Task 28's hand-set values to the seeded ones.
  - [x] A theme whose column moves the band re-derives each robot's value in place, with no melody regeneration and no
        engine call.

  **Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/systems/spawnSystem.families.test.ts src/systems/aspectDeal.test.ts src/systems/aspectDeal.widened.test.ts`
  passes.

  **Dependencies:** Tasks 28, 33.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/spawnSystem.families.test.ts`, `src/systems/aspectDeal.ts`, `src/systems/aspectDeal.widened.test.ts`

  **Estimated scope:** M

- [x] **Task 35: saves and links**

  **Description:** `RobotAudioOverrideDiff` swaps `development` for max intensity. `sessionDiff.ts` diffs it against
  the baseline and applies it, with the finite-number check `development` has before the store sees it
  (`buildRobotUpdates`). `worldDiffCodec.ts` drops `dv` and gives max intensity a short key, `ji` if the task finds it
  unused. Journey's `jy` is untouched.

  **Proof:** RED test — `src/utils/sessionDiff.test.ts` and `src/utils/worldDiffCodec.test.ts`: the round trips.

  **Acceptance criteria:**
  - [x] An untouched robot has no max intensity key in a save.
  - [x] Save, edit, wipe and load brings back both settings on a robot, and a company-wide edit on every member.
  - [x] A world link round-trips both.
  - [x] A max intensity that is not a finite number, in a save or a link, is dropped on its own, and the robot keeps
        its seeded value.

  **Verification:** `npx vitest run src/utils/sessionDiff.test.ts src/utils/worldDiffCodec.test.ts src/utils/seedBaseline.test.ts src/utils/sessionShareUtils.test.ts`
  passes.

  **Dependencies:** Task 34.

  **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`,
  `src/utils/worldDiffCodec.ts`, `src/utils/worldDiffCodec.test.ts`

  **Estimated scope:** M

- [x] **Task 36: `development`'s band and draw go**

  **Description:** Deletion only. `'robot.development'` leaves the band keys, Classic's column and
  `MELODY_BAND_KEYS`; `seedDevelopment` and the two `development` draws leave `robotFieldDerivation.ts`, with the
  field on `MelodyFields`, `currentMelodyBands` and `RobotAudioBaseline`; their tests and `resolveBands.test.ts`'s
  rows for the band go with them. Each is re-checked for a reader first.

  **Proof:** Read — a deletion. No new test. The other Melody fields' draw tests pass unmodified: each draw has its
  own dataId, so taking two out moves none of the rest.

  **Acceptance criteria:**
  - [x] Nothing reads the band, the seeder or the baseline's `development`.
  - [x] The other Melody fields, max intensity among them, draw exactly what they drew.

  **Verification:** `npx vitest run src/systems/robotFieldDerivation.test.ts src/data/bands/classic.test.ts src/data/bands/resolveBands.test.ts src/systems/spawnSystem.test.ts src/systems/aspectDeal.widened.test.ts`
  passes.

  **Dependencies:** Task 34.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`,
  `src/systems/robotFieldDerivation.ts`, `src/systems/robotFieldDerivation.test.ts`,
  `src/data/bands/resolveBands.test.ts`

  **Estimated scope:** S (deletion only)

- [x] **Task 37: `Robot.development` goes**

  **Description:** Deletion only. The field on `Robot`; `DEVELOPMENT_MIN`, `DEVELOPMENT_MAX`, `DEVELOPMENT_STEP` and
  `DEFAULT_DEVELOPMENT`; the store's snap and clamp for it and their tests; and any fixture that still sets it. The
  changes keep their names (`melodyDevelopment.ts`, `developMelody`, `developmentFloor`, the `:development` draw
  stream): they are the development, not the old setting.

  **Proof:** Read — a deletion. No new test.

  **Acceptance criteria:**
  - [x] No robot, snapshot, diff, band or constant carries `development`; what is left of the word in `src/` is the
        changes module and its callers.
  - [x] `npm test`, `npm run build:types`, `npm run lint` and `npm run build` pass.

  **Verification:** the full suite and the build; `development` searched for in `src/` by hand before the commit, and
  what remains listed in the commit message.

  **Dependencies:** Tasks 35, 36.

  **Files:** `src/types/Robot.ts`, `src/constants/index.ts`, `src/stores/localeStore.ts`,
  `src/stores/localeStore.test.ts`, and any test fixture the search finds

  **Estimated scope:** S (deletion only)

### Checkpoint I: Gates B and C
- [x] `npm test`, `npm run build` clean.
- [x] Mutation checks, each killed: the lit share ignored (33), a member drawing its own max intensity (34), max
      intensity left out of the deal's table (34), the diff key and the link key (35).
- [x] **Gate B (profile)** (waived, Crawford, 2026-11-17: "we're good" after his listen; not run on the pairs, so
      Checkpoint E's audio-thread A/B on the walk is the last measure: Results, Checkpoint Complete). Run again, on the new journey, same session, `main` against the branch, one at a time.
      With the step harness if it has been mended, else the audio-thread A/B that stood in at Checkpoint E, this
      time on a world whose robots are set to a max intensity of 16, so drops are as deep as they go. Which one is
      Crawford's call (Open Questions). A miss stops the build here, with the numbers and options.
- [x] **Gate C (Crawford's ear)** (passed, his listen, 2026-11-17, after Phase 10; nothing moved). A full seeded
      world, on desktop and on the phone. His to move: the band, the share at home and the one max time.
- [x] Stop. The docs start on his word.

---

### Phase 10: Docs

- [x] **Task 21: `MELODY_SYSTEM.md`, `AUDIO_SYSTEM.md`, `ROBOT_LIFECYCLE.md`**

  **Description:** `MELODY_SYSTEM.md`: the home melody, a section for the journey (the pairs, the shares, the drop,
  the calm limit) and the changes, the two new event fields, and the docking re-roll's text out. `AUDIO_SYSTEM.md`: the note resolution pipeline's per-measure read,
  `sixteenths` and `pitchStep`. `ROBOT_LIFECYCLE.md`: pitch drift, the dock-cycle count and the snapshot's three
  fields out. Every name checked against the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] No doc says a melody changes at a docking, or names a deleted function.
  - [x] Every function, field and constant named exists as written.

  **Verification:** each name spot-checked against the code; links and anchors checked.

  **Dependencies:** Checkpoint I.

  **Files:** `docs/MELODY_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** S (docs only)

- [x] **Task 22: `COMPANIES.md`, `SESSION_STORAGE.md`, the data grid, and the spec's As built**

  **Description:** `COMPANIES.md`: a member's inherited bounds, the seeded Journey, the broadcast.
  `SESSION_STORAGE.md`: the three override fields. `reference/ROBOT_DATA_GRID.md`: the two band rows. The spec gains
  §9, As built: what Gates A and C moved, and any deviation from this plan (its §8 is the revision against the
  build). Roadmap 92's entry is brought up to date. **Ask first:** CLAUDE.md's
  reference line for `ROBOT_LIFECYCLE.md` lists "pitch drift"; the one-word fix is Crawford's to approve.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] Each doc matches the shipped source; the spec's §9 records every number as shipped.
  - [x] The CLAUDE.md line is changed only on Crawford's word.

  **Verification:** each name spot-checked against the code; links and anchors checked.

  **Dependencies:** Task 21.

  **Files:** `docs/COMPANIES.md`, `docs/SESSION_STORAGE.md`, `docs/reference/ROBOT_DATA_GRID.md`,
  `docs/specs/MELODY_JOURNEY.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (Results: one vitest worker
      timeout, no test failed).
- [x] The spec's eight success criteria (§5.5) each met, by a named test or a gate (spec §9.4; 6 is by construction
      and tests, its hearing after a reload is Gate C's).
- [x] Any browser check not done in the session is flagged here, not skipped: **Checkpoint G's look, Gate A, Gate B
      and Gate C are not done** (Results, Checkpoint Complete).
- [x] Ready for Crawford's PR: once he has run, or waived, the open gates. (2026-11-17: A, C and Checkpoint G's look
      passed by his listen, B waived; Results.)

- [ ] **Task 23: archive, after the merge**

  **Description:** Once Crawford has merged: roadmap 92 moves to the archive with its stub, its line leaves
  `plan.md`, inbound links are repointed, and the links in the moved text are rebased.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The stub names the PR; every inbound anchor still resolves; `plan.md` has no line for 92.

  **Verification:** a before-and-after broken-link count over `docs/`.

  **Dependencies:** the merge.

  **Files:** `docs/todo/roadmap.md`, `docs/todo/archive/roadmap-archive.md`, `docs/todo/plan.md`

  **Estimated scope:** XS (docs only)

## Results

*(Filled in as the build goes: Checkpoint A's path lengths, what each gate moved, each mutation run.)*

### Checkpoint A (2026-11-17)

**Suite.** `npm test`: 364 files, 14,629 passed, 2 skipped, 0 failed (260 s). The sweep file
(`melodyDevelopment.worlds.test.ts`) takes 4.7 s alone: 1.5 s of tests, 2.7 s collecting.

**Mutation checks.** Thirteen mutants, each run against `melodyDevelopment.test.ts` and `melodyJourney.test.ts`; all
killed.

| Mutant | Task | Failed |
|---|---|---|
| The calm side visits in sorted order, not from alternating ends | 3 | 3 |
| Phase 1 visits in sorted order, not from alternating ends | 4 | 2 |
| A note longer than `T` is a candidate (not at least `2T`) | 4 | 2 |
| Phase 1 stops at half rounded down | 4 | 5 |
| Two draws per change | 4 | 1 |
| Directions by change parity, not from the seed's stream | 4 | 5 |
| The subdivision may fall under the floor | 5 | 8 |
| `T` is not raised to the floor | 5 | 3 |
| A fill takes the latest gap on a tie | 6 | 1 |
| A fill takes the first gap long enough, not the longest | 6 | 1 |
| The gap after the last note leads into the last note, not the bar's first | 6 | 1 |
| The journey's sides do not alternate | 1 | 2 |
| The swing never reaches `JOURNEY_SWING_MAX` | 1 | 1 |

**Path lengths** (a throwaway probe over the 1,452 robots of the 121 sim worlds, Classic, bpm band top 100; home
melodies through `composeRobotMelody` from the roster baselines, floors from each robot's seeded attack):

| Per robot | Min | Median | Mean | Max |
|---|---|---|---|---|
| Calm changes (notes − 1) | 0 | 4 | 5.75 | 15 |
| Splits (phases 1 and 2) | 0 | 0 | 0.97 | 9 |
| Fills (phase 3) | 0 | 0 | 1.52 | 15 |
| Busy changes before the shifts | 0 | 0 | 2.49 | 15 |

- **Half the fleet has no split and no fill: 729 of 1,452 robots.** Their busy side is shifts from the first change.
  The floor is most of it: 1,009 robots have a floor of 2 or more.

  | Floor | Robots | Busy path, mean (max) | No split or fill |
  |---|---|---|---|
  | 1 | 443 | 6.40 (15) | 95 |
  | 2 | 196 | 1.78 (6) | 98 |
  | 3 | 169 | 0.86 (4) | 88 |
  | 4 | 214 | 0.83 (3) | 99 |
  | 5 | 144 | 0.49 (2) | 96 |
  | 6 | 167 | 0.15 (2) | 145 |
  | 7 | 119 | 0.09 (1) | 108 |

  At floor 1 the 95 can only be full bars of sixteenths (worked from the rules, not measured: at floor 1 any note of
  two or more splits and any gap fills); 199 robots have sixteen notes.
- **The calm side:** 46 robots have one note (no calm change), 199 have sixteen (fifteen calm changes).
- **Against the swing** (`JOURNEY_SWING_MIN` 2 to `JOURNEY_SWING_MAX` 8): a turning point past a robot's busy path
  plays shifts for the rest of the way out; past its calm floor, the floor. With half the fleet at no busy path, most
  busy turning points are heard as neighbour notes on the home rhythm. This is the plan's Low risk ("a slow-attack
  robot's floor leaves it nothing to split") measured: it touches half the fleet, not a few robots. For Gate A.

**Readings the spec did not cover (Phase 1).**

- An odd `T` (only a raised floor or a hand-made length gives one) subdivides at `floor(T / 2)`, never under the
  floor (Task 5).
- A direction is up when its draw is under 0.5, down otherwise (Task 4).
- A note a change adds carries a placeholder `length`, the longest note name not over its `sixteenths`; `sixteenths`
  is its length. It carries its source's slot and octave and no rest, mark or pitch lock (Tasks 4, 6).
- A home note whose length a change leaves alone gains no `sixteenths` field, so a shifted note differs from its home
  event in `pitchStep` alone (Task 7).
- Task 4's "with no candidate, position 1 equals home" holds until Task 7's shifts exist; the test pins the rhythm,
  which holds for good. Task 3's "a positive position returns home for now" ended at Task 4, as planned.
- The sweep mirrors `generateCompositionSeed`'s draw (`'robot.compositionSeed'`, even, 0 to 1), which spawnSystem does
  not export. Its floor check counts only notes a change shortened or added: a tie lengthens a home note, which may
  stay under the floor.

### Checkpoint B (2026-11-17)

**Tasks.** Task 8 5fb21a7b, Task 9 4d088fb0. A grep of `src/` finds no `dockCycles`, `dockCycleCount`,
`driftedMelody`, `reRollMelodyPitches`, `pickWeightedIndex`, `pickRandomIndices` or `DOCKED_PITCH_DRIFT_RATIO`.

**Suite.** `npm test`: 14,602 passed, 2 skipped, 0 failed. Checkpoint A's 14,629 less 27 net: Task 8 net 11 (the drift
tests out, its two RED tests in), Task 9 the 16 re-roll and pick tests. `build:types` clean; `lint` clean apart from the four standing
fast-refresh warnings.

**In the browser.** A throwaway headless probe (not committed) on the dev server, world `charlie:200:-30`, read every
robot's `docking` and `melody` from the locale store once a second for 240 s after power-on: 12 robots, 19 Recalled →
Docked landings (every robot landed at least once; seven landed twice), 0 melody changes, and each robot's last
melody equal to its first.

### Checkpoint C (2026-11-17)

**Tasks.** Task 10 842b28fb, Task 11 7d00e5b8, Task 12 bae04ac3, Task 13 cce717bf, Task 14 92461adc.

**Suite.** `npm test`: 14,656 passed, 2 skipped, 0 failed: Checkpoint B's 14,602 and 54 new (Task 10 12, Task 11 9,
Task 12 17, Task 13 5, Task 14 11). `build:types` clean; `lint` clean apart from the four standing fast-refresh
warnings.

**Mutation checks.** All killed.

| Mutant | Task | Failed |
|---|---|---|
| The octave-range turn-back removed (the forward step always wins) | 10 | 4 |
| The own-note fallback removed (the back step always wins) | 10 | 2 |
| Company with no `companyId` keys on the company, not Own | 12 | 1 |
| A re-registration updates in place instead of moving to the end | 13 | 1 |
| The measure passed to `journeyPosition` one late | 14 | 7 |
| One kept position, not four | 14 | 1 |
| The floor dropped from the kept key (an Attack edit plays a stale build) | 14 | 1 |

**Readings the plan did not cover (Phase 3).**

- `stepInPalette` gives each pitch class the first spelling the palette uses for it; the B-to-C boundary carries the
  octave (Task 10).
- Every step now reads the locale store once, Humanize or not; the robots' journeys, the Humanize seeds, the cut
  release and the pitch step's range share that read. The one existing test changed is the Humanize read count: at
  0 ms it pinned no read, it now pins one (Task 14).
- The motif accent on a developed melody is kept by home event id; at position 0 the registered entries play as before,
  accent by start step (Task 14).
- **In the browser:** not yet run.

### Checkpoint D (2026-11-17)

**Tasks.** Task 15 76dae0fb, Task 16 90e82c07, Task 17 e713df1c.

**Suite.** `npm test`: 14,684 passed, 2 skipped, 0 failed. `build:types` clean; `lint` clean apart from the four
standing fast-refresh warnings.

**Mutation checks.** All killed: Journey ignoring Development 0 (Task 16, 2 failed); the company Development
broadcast reaching only the first member (Task 17, 3 failed).

**The Look (Task 16).** A throwaway headless Chrome on its own Vite, one robot of the default world, five store writes
(Development 0 / Own, 0.125 / Own, 1.375 / Company, 2 / Fleet, 0 / Fleet): at 390 px the row stacks (Development
290×105, Journey 290×142.5, its three options on two lines); at 1440 px it sits side by side (360×121 each). Neither box
changed size across the five states at either width; Journey was disabled at both Development-0 states only.

**Readings the plan did not cover (Phase 4).**

- The content copy is a stand-in, human and lore (lore: Payload Drift; Drift Formation with Solo, Convoy and Fleet
  Drift), marked for backlog 62's content pass.
- Task 16 made the row optional on its two handlers; Task 17 made the handlers and `PingControlsValue`'s two fields
  required, so the row always renders and each caller resolves absent fields to 0 and Own. Task 16's two optionality
  tests went with it.

**Gate A:** not yet run (Crawford's ear).

### Checkpoint E (2026-11-17)

**Tasks.** Task 18 f0e17661, Task 19 2ea953e5, Task 20 b0bc81e6 and 65adbb2a (the journey guard, below). Started on
Crawford's word with Gate A's numbers not recorded, so the spec's §7.1 defaults stand: Classic's band
`{ min: 0.125, max: 1, lit: 0.7 }`, the slider 0 to 2 by 0.125.

**Suite.** `npm test`: 14,722 passed, 2 skipped, 0 failed (243 s). `npm run build` clean (the standing chunk-size
warning). `build:types` clean; `lint` clean apart from the four standing fast-refresh warnings.

**Mutation checks.** Fourteen mutants, all killed.

| Mutant | Task | Failed |
|---|---|---|
| The lit share ignored (every robot lit) | 18 | 4 |
| The stop rounds instead of floors (the ends at half a share) | 18 | 2 |
| A member draws 0, not its founder's rate | 19 | 4 |
| `spawnInitialCompanies` writes no Company | 19 | 4 |
| The baseline leaves a company's robots on Own | 19 | 2 |
| `development` left out of `TOP_LEVEL_FIELDS` (a theme change does not re-derive it) | 19 | 1 |
| The save diffs no development | 20 | 4 |
| The save diffs no journey | 20 | 3 |
| The restore applies no development | 20 | 3 |
| The restore takes any development (a string reaches the store) | 20 | 1 |
| The restore applies no journey | 20 | 2 |
| The link writes no `dv` | 20 | 4 |
| The link reads any `jy` | 20 | 2 |
| The link reads any `dv` | 20 | 2 |

A fifteenth, "the restore takes any journey", survived (374 passed): `localeStore.updateRobot` already drops a journey
that is not a setting, so Task 20's own check in `buildRobotUpdates` was redundant. It went in 65adbb2a; a restored
journey now goes to the store as it is, as the other fields the store normalises do. The development keeps its check,
since the store would store a string.

**Gate B, as a substitute.** `npm run perf` could not run: against `main`'s production build (`2e316525`, served on
4174) it stops before its first measured step, at a nav button it can no longer find ("Settings",
`scripts/perf/profile.mjs`'s TILE constants). It was not tried against the branch. In its place, the audio-thread
harness as a same-session A/B (`npm run perf:audio`, world `charlie:200:-30`, the two production builds served side by
side, one run at a time, no orphaned Chrome before or after). It measures steady play, where this branch's work is
(the per-note development read); the step table measured view switches, which the branch does not touch.

| 180 s run, 30 s buckets | Mean capacity | Max capacity | Bucket max lag |
|---|---|---|---|
| `main` 1 | 0.287 | 0.797 | ≤ 21 ms |
| branch 1 | 0.289 | 0.606 | ≤ 28 ms |
| branch 2 | 0.296 | 0.795 | 16–19 ms |
| `main` 2 | 0.296 | 0.799 | 17–20 ms |

The overlay's max lag over the warm-up (power-on and the first seconds of play, where the first developed melodies are
built; the overlay's max is since boot, so a long run's end-of-series max bounds it), seven runs each side: `main` ≤ 21,
17, 59, 28, 193, 106, 330 ms; branch ≤ 28, 182, 28, 76, 106, 147, 128 ms. Both sides cross 100 ms in that window in
three or four runs of seven, and the worst was `main`'s,
so nothing here points at the branch; but the warm-up is noisy and the sample is small. Crawford's to accept as Gate B,
or to have the step harness fixed first (its nav labels, backlog 31's tooling).

**Readings the plan did not cover (Phase 5).**

- A lit robot takes a stop of the 0.125 grid inside the band, each stop a full share, the ends included (floored, as
  `detuneLinkDepth` is, not rounded); a band edge off the grid draws only the stops inside it; a lit robot is never 0
  (`seedDevelopment`, Task 18).
- Task 18 held `development` out of the deal's Melody case, because a dealt robot would have carried it while spawn did
  not yet; Task 19 put it back with the spawn write.
- The theme re-derive case lives in `aspectDeal.widened.test.ts`, which holds the injected theme column, not in
  `aspectDeal.test.ts` as Task 19 named.
- The baseline's Company write is one pass after the roster loop in `generateRobotRosterBaseline`, over the seeded
  membership.
- Task 20 changed nineteen existing tests' fixtures (eighteen in `sessionDiff.test.ts` over seven fixture sites, one in
  `robotSendsParity.test.ts`; b0bc81e6's message says "nine tests", wrongly). Each saved a world built by
  `spawnInitialRoster` alone, so its seeded companies' robots stayed on Own while the baseline, like every real world,
  puts them on Company; each now runs `spawnInitialCompanies` too.
- Success criterion 3 is met over the 121 worlds by `spawnSystem.families.test.ts` (every developing company's members
  play the same starts and lengths at each of 100 measures).

**After Checkpoint E (2026-11-17), on Crawford's word:** the Development slider's top is 8 changes a measure, not 2
(`DEVELOPMENT_MAX`; the store's clamp and the slider read it). The spawn band is unchanged (0.125 to 1). Above about 2,
a measure can carry the walk past a turning point, so the bars heard skip positions, home among them; the engine's
cache keeps positions, not rates, so it needs no change. For the spec's §8.

**Gate C:** not yet run (Crawford's ear, desktop and phone).

### Checkpoint F (2026-11-17)

**Tasks.** Task 24 659f5f56, Task 25 840f9b01, Task 26 54cb4a74; a test tightened at the checkpoint 2f7796b0 (below).
Nothing calls the three new functions yet; the engine still reads the walk.

**Suite.** `npm test`: 364 files, 14,754 passed, 2 skipped, 0 failed (260 s). `build:types` clean; `lint` clean apart
from the four standing fast-refresh warnings.

**Mutation checks.** Sixteen mutants, run against `melodyJourney.test.ts` and `melodyDevelopment.test.ts`; all
killed, one only after its test was tightened.

| Mutant | Task | Failed |
|---|---|---|
| The home roll ignored (no pair ever heads home) | 24 | 1 |
| The home odds flat, not scaled by how far out (`JOURNEY_HOME_ODDS` from anywhere) | 24 | 2 (survived first) |
| The home odds squared, not a straight line | 24 | 1 |
| The least move ignored (no stretch left out of the intensity draw) | 24 | 1 |
| Home from anywhere (the least move ignored on the home row) | 24 | 2 |
| The time lean left out | 24 | 1 |
| A drop allowed after a drop | 24 | 2 |
| The first pair may be a drop | 24 | 1 |
| The drop odds ignored (every big move a drop) | 24 | 1 |
| The drop's least move ignored | 24 | 1 |
| `positionInPairs` rounding in place of flooring (a robot arrives early) | 25 | 5 |
| The calm limit not applied | 26 | 3 |
| Intensity rounded one way (`Math.round` on the signed value) | 26 | 1 |
| The pair before a drop not shortened | 26 | 3 |
| Time rounded to whole measures, not even ones | 26 | 2 |
| `calmLimit` is the note count, not one less | 26 | 2 |

The flat home odds survived the first run (103 passed): the near-home case counted every pair starting within 0.25,
most of them at home, where no pair heads home, so the share stayed under its bound either way. The case now counts
only pairs from `JOURNEY_MIN_MOVE` to 0.25 out, and a new case checks the odds halfway out are `JOURNEY_HOME_ODDS × 0.5`
within five points (B2's straight line); 2f7796b0, tests only. Both home-odds mutants were then killed.

**The journey's shape** (a throwaway probe, not committed: 400 keys × 2,000 pairs, bounds 16 and 16, through
`journeyShares` and `robotPairs`). Gate A's numbers are read against these.

| At max intensity 16, max time 16 | Calm limit 15 | Calm limit 4 |
|---|---|---|
| Pairs that are drops | 16.0 % | 16.0 % |
| Pairs that head home | 22.3 % | 22.3 % |
| Mean time of a pair | 7.37 measures | 7.37 measures |
| Measures between two visits home: mean (median, 90th percentile) | 32.9 (26, 62) | 32.9 (26, 62) |
| Drops that land home | 24.8 % of drops | 24.8 % of drops |
| The biggest drop | 31 changes (+16 to −15) | 20 changes (+16 to −4) |

The calm limit moves only the depth on the calm side: no pair's time, drop or home visit depends on it.

**Readings the plan did not cover (Phase 6).**

- The intensity draw's left-out stretch is clipped at −1 and 1, so a pair starting near an edge draws evenly over what
  is left (Task 24).
- A share's intensity can scale to 0 without heading home (under 1/32 at max intensity 16; under a half at 1), so a
  small max intensity visits home more often than the shares' home odds alone say (Task 26).
- A time share whose half lands on .5 rounds up (`Math.round`): at max time 6, a share of 0.5 is 4 measures (Task 26).
- `robotPairs` sees a drop only in the shares it is handed, so the pair before a drop is shortened only when share
  i + 1 is in the list; Task 28 hands in one share more than the pairs it reads.

### Checkpoint G (2026-11-17)

**Tasks.** Task 27 7627bb59, Task 28 157faf54; a tidy at the checkpoint c0643e2c (`pairAt` hands back the turning
measures it searched, so the memo key is built in one place; no change in what plays). From Task 28 the Development
slider does nothing and every robot plays its home melody: nothing seeds the bounds until Task 34.

**Suite.** `npm test` at 157faf54: 364 files, 14,763 passed, 2 skipped, 0 failed (272 s), with one vitest worker
error, `Timeout calling "onTaskUpdate"` (backlog 66's main-process swamp; no test failed). `build:types` clean; `lint`
clean apart from the four standing fast-refresh warnings. The tidy was run against the three files below (605 passed).

**Mutation checks.** Eight mutants, run against `melodyJourney.test.ts`, `AudioEngine.test.ts` and
`spawnSystem.families.test.ts` (605 tests): the checkpoint's four and four more on the new read.

| Mutant | Failed |
|---|---|
| The calm limit not handed to the journey (the engine hands 16) | 2 |
| The turning measures memoised without max time | 5 |
| `robotJourney` ignoring the stored max time | 2 |
| A max intensity of 0 still walking the pairs | survived: equivalent |
| The pair before a drop not shortened (in the engine's read) | 4 |
| The binary search taking the pair that ends on the measure (`<` for `<=`) | survived: equivalent |
| Every pair read from home, not from the pair before | 9 |
| Time rounded to whole measures, not even ones (in the engine's read) | 3 |

Both survivors were traced. **A max intensity of 0:** every pair then scales to an intensity of 0, so the position is
0 with or without the guard; the guard only saves drawing the shares and filling the memo, which no read can see. It
stays as the cheap path for the three robots in ten that will load at 0 (Phase 9). **The binary search:** on a turning
measure exactly, the mutant reads the pair that ends there at its last measure (`k = T`, its intensity) and the code
reads the next pair at its first (`k = 0`, the same intensity). Neither is a gap in the tests.

**Readings the plan did not cover (Phase 7).**

- The engine reads the calm limit on every step (`calmLimit(registered.melody)`, the note count less one); it is not
  cached on the registration (Task 28).
- `robotJourney` does not normalise a bound the store did not write (a save or link is Task 35's): an odd max time
  still gives even times, since each pair's time is rounded to an even number, and a fractional max intensity is
  rounded per pair (Task 28).
- The turning measures are drawn one pair at a time as a read needs them, each pair drawing one share past itself, so
  a read at measure 10,000 at a max time of 16 draws about 1,400 shares (10,000 over Checkpoint F's mean of 7.37
  measures a pair), not 10,000 (Task 28).
- The family case reads a table of four hand-set bounds, (16, 16), (5, 8), (1, 2) and (9, 4), one per company in
  turn; its "one rate" assertion went with the rate, and its precondition now counts companies whose rhythm moves
  (Task 28). Task 38 cut the table to max intensities alone, 16, 5, 1 and 9.

**Task 38 (added after the checkpoint's first pass, spec §7.4).** c670c221. Suite: 364 files, 14,762 passed, 2
skipped, 0 failed, no worker error (274 s); types and lint clean. Three mutants, against the same three files (607
tests), all killed:

| Mutant | Failed |
|---|---|
| `robotJourney` reads a stored max time again (a leftover in an old save) | 3 |
| The engine uses 8, the old default, in place of the journey's max time | 6 |
| `robotJourney` hands back 8 | 5 |

Two rows of the first pass's table no longer exist as written: `robotJourney` ignoring the stored max time is now the
behaviour, and its opposite is the first row above. The memo-key mutant stays meaningful: the pure pieces still take
any max time, and the case that reads one key at six max times kills it. `journeyMaxTime` is still named in `src/`
by two test fixtures that stand for an old save's leftover; nothing else carries it.

### Checkpoint H (2026-11-17)

**Tasks.** Task 29 4b0504b1, Task 30 f85c7e41, Task 31 2f39079c, Task 32 c71db96e. Built with Checkpoint G's browser
look and review still open (Crawford asked for Phase 8 directly). Every robot still loads at a max intensity of 0:
nothing seeds it until Task 34.

**Suite.** `npm test` at c71db96e: 364 files, 14,774 passed, 2 skipped, 0 failed (260 s), no worker error.
`build:types` clean; `lint` clean apart from the four standing fast-refresh warnings.

**Mutation checks.** Each killed:

| Mutant | Failed |
|---|---|
| Journey dimmed on `development` again, not max intensity (Task 30) | 2 |
| The company resolver ignoring the first member's max intensity (Task 31) | 2 |
| A company Max Intensity edit not recorded in the snapshot (Task 31) | 5 |

**Look (Task 30).** Headless Chrome on a dev server, the robot screen's Rhythm & Melody, max intensity 0, 1, 9, 16 and
0 on Fleet set through the store. Phone (390 wide): row 3 a column, the slider's box 290 × 105 and Journey's
290 × 142.5 at every value. Desktop (1440 wide): a row, both 360 × 121 at every value. Journey's radios disabled at 0
only; five sliders in the box. Crawford's eye on the row (C1) is part of Gate A.

**Readings the plan did not cover (Phase 8).**

- Between Tasks 30 and 31 (one commit), the company and All Probes screens showed Journey alone on row 3, dimmed: the
  section rendered Max Intensity only when its handler was given, and only the robot screen gave it. Task 31 made the
  handler required and the slider unconditional (Task 30).
- RobotScreen stopped passing Development in Task 30, not Task 31: the section no longer rendered it, so the value and
  handler were dead there (Task 30).
- Journey's help text names Max Intensity in place of Development (Task 30, copy only).
- An old company snapshot (`lastEditedOptions`) that carries `development` loads with the key in place; nothing reads
  it, since the type no longer names it (Task 31).
- `useCompanyOptions.test.ts`'s mixed Journey cases (the apply-per-member, outside-the-company, broadcast-not-link, All
  Probes and handler-identity cases) swapped their Development half for Max Intensity; the pure Journey case is
  unmodified (Task 31).
- The `DEVELOPMENT_*` constants stay: the store's normalisation of `development`, its band test and its seeder read
  them until Tasks 36 and 37 (Task 32).

### Checkpoint I (2026-11-17)

**Tasks.** Task 33 c8262d96, Task 34 bf836cf7, Task 35 af66424f, Task 36 9fb95462, Task 37 9a8d11f4. Built on
Crawford's word with Gate A not yet heard, so the band is the plan's default, `{ min: 1, max: 16, lit: 0.7 }`, and the
link key is `ji` (unused before). From Task 34 a fresh world loads with about seven robots in ten on a journey.

**Suite.** `npm test` at 9a8d11f4: 364 files, 14,766 passed, 2 skipped, 0 failed (266 s), no worker error. At Task 34
(bf836cf7), the first commit that seeds journeys: 14,786 passed, 0 failed (266 s); the 20 fewer at the end are the
development tests Tasks 36 and 37 deleted. `build:types` clean; `lint` clean apart from the four standing fast-refresh
warnings; `npm run build` clean apart from its standing chunk-size and mixed-import notices.

**The draw, measured.** Over the 121 worlds (1,452 robots, 707 members): 533 of the 745 robots that are not members
load above 0, 71.5 % against a `lit` of 0.7. Of the 288 seeded companies, 206 move within 100 measures and 82 stay
home; every company's members share one key and one max intensity and play the same starts and lengths at every
measure (spec success criterion 3).

**Mutation checks.** Nine mutants, each against the files named, all killed (scratchpad `mutate.mjs` +
`mutants-i.json`; the tree was clean after):

| Mutant | Failed |
|---|---|
| The lit share ignored: every robot lit (33) | 5 |
| A lit robot allowed to seed 0: no floor of 1 (33) | 1 |
| A member drawing its own max intensity (34) | 7 |
| Max intensity left out of the deal's field table (34) | 1 |
| The diff key never written (35) | 5 |
| The restore without its finite check (35) | 1 |
| The link key not encoded (35) | 4 |
| The link key not decoded (35) | 4 |
| The link decode without its finite check (35) | 2 |

**Readings the plan did not cover (Phase 9).**

- `seedJourneyMaxIntensity` floors a lit robot at 1 when a band reaches below 1, so a lit robot never seeds 0 and the
  share above 0 is the lit share (Task 33).
- Between Tasks 34 and 36 the deal's Melody case held `development` out, as spawn no longer wrote it; Task 36 put the
  case back to the plain derivation (Task 34).
- Task 19's development cases at spawn, over the 121 worlds and in the deal's widened file were swapped for max
  intensity, not kept beside it: spawn no longer writes the field they read (Task 34).
- The restore's finite check also drops an Infinity, which the store would otherwise clamp to 16 (Task 35).
- A `development` in an old save, and a `dv` in an old link, are ignored; a case for each stays, since saves and links
  made before this phase may still carry them (Tasks 35 and 37).
- Tests deleted with the field beyond the store's (Task 37): the "no development written" assertions at spawn, and the
  transition cases that handed a stray `development` or its handler to the company options hook, the company and
  robot screens' section stubs, the Rhythm & Melody row and `robotJourney`. Nothing can put the key on a robot now.
- What is left of the word in `src/` (Task 37's search): the changes module and its callers (`melodyDevelopment.ts`,
  `developMelody`, `developmentFloor`, `DevelopmentOptions`, the `:development` stream), the old-save and old-link
  handling and their two cases, `DEV_TUNING`'s doc, and four test comments that say Max Intensity took Development's
  place.

**Open at Checkpoint I.** Gate B: run on the new journey, `main` against the branch, with the step harness if mended,
else the audio-thread A/B on a world set to max intensity 16 (Open Questions 5, Crawford's call). Gate C: a full
seeded world on desktop and phone, Crawford's ear (the band, the share at home, the one max time). Checkpoint G's
browser look and Gate A also remain open.

### Checkpoint Complete (2026-11-17)

**Tasks.** Task 21 59d43056, Task 22 cb2aae71, built on Crawford's word ("implement phase 10") with the gates of
Checkpoints G, H and I still open; spec §9 says so. Task 21 also brought `BEAT_CLOCK.md`'s list of what measures count
and `PROCEDURAL_GENERATION.md`'s two drift-draw mentions up to date, so no living reference doc says a melody changes
at a docking. Task 22 wrote two override fields and one band row where the task said three and two: max time left the
robot (spec §7.4), and Journey is not banded. CLAUDE.md's "pitch drift" went on Crawford's answer at Task 22.

**Checks** at cb2aae71 (docs only since Checkpoint I's 9a8d11f4): `build:types` clean; `lint` 0 errors, the four
standing fast-refresh warnings; `npm run build` clean apart from the standing chunk-size notice; `npm test` 364 files,
14,766 passed, 2 skipped, 0 failed (276 s), with one vitest worker error, `Timeout calling "onTaskUpdate"` (backlog
66's main-process swamp, as at Checkpoint G), which makes the run exit 1.

**Not done in any session, flagged:** Checkpoint G's browser look (a drop heard on a bar line, a company turning
together), Gate A (his ear), Gate B (his call on the harness, then the A/B at max intensity 16) and Gate C (his ear,
desktop and phone). Every number stands at its first cut until he moves it.

**The one max time, settled** (Crawford, 2026-11-17, after Checkpoint Complete). He asked whether journey length was
hardcoded at 16 and should be dynamic. A journey has no end, and each pair's time is drawn, 2 to 16 measures; only
the ceiling is one constant (`JOURNEY_TIME_MAX`, read in `robotJourney`) for every journey, so robots on one journey
turn together. He kept it: "ok i'm happy let's mark it and move on". Gate A's and Gate C's max-time item is closed;
the rest of both gates stays open. Spec §9.1 records it.

**The gates, closed** (Crawford, 2026-11-17, after the max-time answer): "i listened, we're good". Gate A, Gate C and
Checkpoint G's look pass on his listen, and nothing moved: every number stands as shipped (spec §9.2), the journey's
odds and leans, the band `{ min: 1, max: 16, lit: 0.7 }` and the one max time of 16 among them. Gate B is waived on the
same word: it was not run on the pairs, so the last measure is Checkpoint E's audio-thread A/B on the walk, and
`npm run perf`'s broken nav labels stay as they were. Ready for his PR; Task 23 after the merge.

**Left as they are:** `docs/ideas/the-score.md` (roadmap 90's idea) and two items in `backlog.md` still describe docking pitch drift as current; they are idea and backlog text, outside
Phase 10's files.

**Gate B on the pairs, run after the waiver** (2026-11-17, on Crawford's "go for it", after the five-axis review and
its fixes). `npm run perf:audio`, same session: `main` `2e316525` (the branch's merge-base, built in a scratch
worktree) on :4173 and the branch `c7c78ff9` on :4175, production builds, each port's bundle proven (only the branch's
carries `journeyMaxIntensity`). One link for both, `charlie:200:-30` with an `s=` blob setting every robot's max
intensity to 16 (the twelve ids read off the page's `data-robot-id`, the blob made by the app's own `encodeBlob`). On
the branch's dev server the link loaded all twelve at 16 (seven on Company, five on Own); `main` ignores the key and
plays its home melodies, so the A/B is the branch's deepest journey against no journey at all. Fresh Chrome per run,
foreground, orphaned-Chrome count 0 before and after every call.

| 180 s run, 30 s buckets | Mean capacity | Max capacity | Bucket max lag | Underruns in the series |
|---|---|---|---|---|
| `main` 1 | 0.329 | 0.857 | 15–19 ms | 0 |
| branch 1 | 0.321 | 0.814 | 11–16 ms | 0 |
| branch 2 | 0.327 | 0.987 | 12–28 ms | 0 |
| `main` 2 | 0.321 | 0.830 | 12–17 ms | 0 |

Steady play is level: the means are within 0.008 either way, bucket by bucket the two sides track each other (r of
audible robots against capacity 0.99–1.00 on both), and every run's two underruns came at boot (0:01–0:04), none in
play. Branch 2's 0.987 is one sample, in a bucket whose mean (0.340) is `main`'s (0.334).

The warm-up (power-on and the first seconds, the overlay's max lag since boot) leans the other way. Over the two long
runs and four short ones each side, interleaved: `main` 27, 89, 176, 111, 127, 232 ms (median 119); branch 183, 192,
118, 155, 236, 203 ms (median 188). The ranges overlap and six a side do not separate them (rank-sum U = 8; 5 or
under is the 5 % line), and no run took an extra underrun (1 or 2 at boot on both). A possible cause, not measured:
the warm-up spans the first few measures, where every robot leaves home together and builds its first developed
melodies (one `developMelody` per robot per new position, a first pair to 16 reaching 8 by measure 1). Crawford's to
accept as Gate B, or to have the power-on traced (`npm run perf:trace`) first.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The engine refactor changes what plays. | High | Task 13 is a parity step on its own: every existing engine test passes unmodified before Task 14 adds behaviour. |
| A new engine import, or a new call on a mocked module, breaks test files the task did not name. | High | Tasks 8 and 14 run every file that mocks the touched modules, and the full suite, before their commits. |
| The trigger and the early announcement read two measures either side of a bar line and rebuild a melody every sixteenth. | Medium | Task 14 keeps the last few positions and tests the m, m+1, m read; Gate B profiles it. |
| Removing the lifecycle's `noiseMap` parameter touches many test call sites. | Medium | Task 8 edits out only the removed argument; the replay parity tests are otherwise unmodified. |
| The order rules read well and sound wrong. | Medium | Gate A comes before anything is seeded, with every robot still at 0; the rules are his to move there. |
| A whole fleet developing is too busy, or underruns on the phone. | Medium | The band leaves a share at 0 and tops out at one change a measure; Gate C is on the phone; the band is his to move. |
| A slow-attack robot's floor leaves it nothing to split, so its busy side is all shifts. | Low | By design (spec §1.8). Checkpoint A's path lengths show how many robots it touches. |
| An edit swaps a robot's melody mid-bar. | Low | Notes are separate triggers, as a Density edit already shows; nothing is scheduled twice. |
| The sweep over 121 worlds slows the suite. | Low | Its own file, so it runs in parallel; its time is recorded in Task 7's commit. |

The revision's (Phases 6 to 9):

| Risk | Impact | Mitigation |
|---|---|---|
| The engine swap (Task 28) changes what plays in a way its tests miss. | High | The position is built and tested pure first (Tasks 24 to 26); Task 28's engine cases are the existing per-measure block moved onto bounds, with the oracle read through the same pure functions. |
| A new call on a mocked module breaks test files Task 28 does not name. | High | Task 28 runs every file that mocks or imports `melodyJourney`, and the full suite, before its commit. |
| A drop rebuilds a robot's melody up to 31 changes away in one measure, and a company drops together. | Medium | The cache makes it one rebuild per robot per measure, as any change is; Gate B is run again, on a world set to drop often. |
| The odds and leans read well and sound wrong. | Medium | Gate A comes before anything is seeded; every number is a constant the shares' tests read, so moving one needs no test rewritten. |
| A share test fails on a number moved at Gate A because its tolerance was fitted to the first cut. | Medium | Expected shares are worked out from the constants (Architecture Decisions); the tolerances are five points over 5,000 pairs. |
| A layer is swapped while another still reads `development`, and a robot's setting is lost between tasks. | Medium | Add, swap, delete: `development` stays stored and seeded until Tasks 34 to 37, and each deletion re-checks for a reader first. |
| A robot with a small bound, or a short melody, holds through most of its journey. | Low | By design (spec B5). Checkpoint F's shape and Gate A show how it sounds; the bands are his to move at Gate C. |
| A drop at max time 16 is rarer than at short max times: fewer pairs, so fewer chances. | Low | The shape in Results was measured at 16; Gate A hears it, and the one max time is his to move (spec §7.4). |

## Open Questions

1. Spec §7.2's four questions. **Resolved** (Crawford, 2026-11-17): at least one note in a bar; the band stays the
   theme's; `pitchLocked` stays in place; a phone listen is enough.
2. Spec §7.1's assumptions. **Open by design:** they stand at their defaults until Gates A and C, where Crawford
   moves them by ear.
3. CLAUDE.md's `ROBOT_LIFECYCLE.md` line names pitch drift. **Resolved** (Crawford, 2026-11-17, at Task 22): drop
   the two words; nothing else in CLAUDE.md changes.
4. Spec §7.3's assumptions (B1 to B15). **Open by design:** they stand at their first cuts until Gates A and C.
5. Gate B's harness. **Open** — Crawford's word, before Checkpoint I: mend the step harness (`npm run perf` stops at
   a nav button it can no longer find), or accept the audio-thread A/B (`npm run perf:audio`) as the gate. The A/B
   was run on the pairs at max intensity 16 after the waiver (Results, Checkpoint Complete); its acceptance is his.
6. The link's new key. **For Task 35:** `ji` if nothing else in the codec uses it (`jt` is no longer needed: max
   time left the robot, spec §7.4).
