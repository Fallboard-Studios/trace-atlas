# Implementation Plan: The Melody Journey

Source spec: [docs/specs/MELODY_JOURNEY.md](../specs/MELODY_JOURNEY.md). Source intent:
[docs/intent/melody-journey.md](../intent/melody-journey.md). Roadmap
[92](../todo/roadmap.md#92-the-melody-journey-a-home-melody-and-a-seeded-walk-that-makes-it-busier-and-calmer).

**Status:** plan written 2026-11-17; Crawford asked for Phase 1 the same day. Phase 1 built on `feature/melody-journey`
(Tasks 1–7, ab4c5bbc..8ca7100e). Checkpoint A's suite, mutation checks and path lengths done (Results); its review
with Crawford is next. Phase 2 built the same day (Tasks 8–9, 5fb21a7b, 4d088fb0); Checkpoint B's suite and probe
done (Results), its review with Crawford next, then Task 10. Phase 3 built the same day (Tasks 10–14, 842b28fb,
7d00e5b8, bae04ac3, cce717bf, 92461adc); Checkpoint C's suite and mutation checks done (Results); its browser look and
review with Crawford next, then Task 15. Phase 4 built the same day (Tasks 15–17, 76dae0fb, 90e82c07, e713df1c);
Checkpoint D's suite done (Results); Gate A, Crawford's ear, next.

## Overview

A robot's melody develops while it plays: busier, home, calmer, home, on a seeded journey read from the music clock.
The build is 23 tasks in six phases. Phase 1 is the two pure modules, the walk (`src/engine/melodyJourney.ts`) and the
changes (`src/engine/melodyDevelopment.ts`), with no caller. Phase 2 removes docking pitch drift, so the home melody
holds still. Phase 3 makes the engine play the melody of each note's own measure. Phase 4 puts the two settings on the
robot, company and All Probes screens, and ends at Gate A, Crawford's first listen. Phase 5 seeds and saves the
settings and ends at the profile and the world listen. Phase 6 is the docs.

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

## Task List

Every task names its **Proof**. RED test: a test that imports or renders the code and fails first. Read: a human
review, for a docs-only or deletion task. Look: what to see in the browser. Every task ends with
`npm run build:types` and `npm run lint` clean; it is not repeated under each one.

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
- [ ] Reviewed with Crawford before Phase 2.

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
- [ ] Reviewed with Crawford before Phase 3.

---

### Phase 3: The engine plays the measure's melody

- [x] **Task 10: `harmonySystem.ts` — a step through the palette**

  **Description:** A pure `stepInPalette(palette, noteIndex, octave, pitchStep, octaveRange)` returning the note name
  and octave (spec §1.4, §1.7): the palette's distinct pitch classes in rising order, moved through `pitchStep`
  places from the event's own class, the octave carried across the top and the bottom. A result outside
  `octaveRange` takes the opposite step; if that leaves too, the event's own note. Sharps and flats are read.

  **Proof:** RED test — `src/engine/harmonySystem.test.ts`: the steps below.

  **Acceptance criteria:**
  - [ ] In `C G E D B C E G`: up one from E4 is G4, up one from B4 is C5, down one from C4 is B3.
  - [ ] A `pitchStep` of 0 is the palette's own note at the event's octave.
  - [ ] Two steps are two single steps. A one-class palette steps by octaves.
  - [ ] At the edge of `octaveRange` the step turns back, and the result is always inside the range.

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
  - [ ] A `pitchStep` event's note is the palette step for the measure it sounds in, so it moves with the chord.
  - [ ] A `sixteenths: 3` event's duration is three sixteenths at the transport's tempo; with a rest it shortens from
        that length and is never under `MIN_SOUNDING_SECONDS`.
  - [ ] Every existing `stepNotes` and `processMelodyStep` test passes unmodified.

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
  - [ ] Two members of one company on Company get one key; the same two on Own get two; any two robots on Fleet get
        one.
  - [ ] A freelancer on Company gets the key it would have on Own.
  - [ ] The floor follows the robot's attack; the rate is the stored development; a robot with neither field reads
        as rate 0.
  - [ ] `updateRobot` stores 0.3 as 0.25, 5 as 2, and drops a NaN and an unknown journey, keeping the stored value.
  - [ ] `melodyWorldKey` returns what it returned before.

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
  - [ ] Every existing engine test passes unmodified.
  - [ ] `registerRobotMelody` stays idempotent, `unregisterRobotMelody` removes every trace of a robot, and the click
        track still replaces a robot's melody at the one funnel.
  - [ ] The order test above passes.

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
  - [ ] From one registration, `stepNotes` at two measures with different positions returns each measure's own
        events.
  - [ ] A robot at Development 0 returns its home melody's notes at every measure.
  - [ ] Writing a new `development`, `journey`, `companyId` or attack to the store changes the next read with no
        engine call.
  - [ ] Two robots with one key and one rate are at the same position at every measure of a 200-measure run.
  - [ ] Reading measure m, then m+1, then m again (the trigger and the early announcement either side of a bar line)
        gives m's events both times and rebuilds nothing the second time.
  - [ ] A note a change adds is never accented; a home event's accent, rest and mark are as registered.

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
      measure to measure and return to the home melody.
- [ ] Reviewed with Crawford before Phase 4.

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
  - [ ] Both applies write the store and make no `AudioEngine` and no `regenerateMelody` call.
  - [ ] The stored melody is the same array after either.
  - [ ] `src/content/content.test.ts` passes with the new entries.

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
  - [ ] Both controls render with their content labels; a change calls its handler with the new value.
  - [ ] Journey is disabled at Development 0 and enabled above it, showing the stored value either way.
  - [ ] On the robot screen, moving Development writes `robot.development`, and choosing Fleet writes
        `robot.journey`.
  - [ ] Look: the row at phone width and desktop; neither control changes size as values change.

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
  - [ ] A company's Development edit writes every member's `development` and the company's snapshot; the same for
        Journey.
  - [ ] The All Probes screen's edit reaches every robot.
  - [ ] A member edited on its own afterwards keeps its own value (broadcast, not link).

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
      path lengths in Results), and the slider's stops (A13).
- [ ] Stop. Phase 5 starts on his word.

---

### Phase 5: Seeding and saving

- [ ] **Task 18: the band and the draw**

  **Description:** `'robot.development'` joins the band keys (`bandKeys.ts`), Classic's column
  (`{ min: 0.125, max: 1, lit: 0.7 }`, or Gate A's numbers) and the Melody family's keys (`MELODY_BAND_KEYS`,
  `aspects.ts`); no aspect or theme column names it. `deriveMelodyFields` draws it: one even draw at
  `'robot.development.lit'` against the band's `lit`, one at `'robot.development'` across the band, snapped to
  0.125; a draw outside the lit share is 0. `MelodyFields`, `currentMelodyBands` and `RobotAudioBaseline` carry it.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts`: the draw.

  **Acceptance criteria:**
  - [ ] Over 12,000 spawn indices the share above 0 is the band's `lit` within a point, and every value above 0 is on
        the 0.125 grid inside the band.
  - [ ] A `lit` of 0 gives every robot 0. The same index gives the same value.
  - [ ] The four older Melody fields draw exactly what they drew before (their existing tests, unmodified).

  **Verification:** `npx vitest run src/systems/robotFieldDerivation.test.ts src/data/bands/classic.test.ts src/data/bands/resolveBands.test.ts`
  passes.

  **Dependencies:** Task 12; Gate A.

  **Files:** `src/data/bands/bandKeys.ts`, `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`,
  `src/systems/robotFieldDerivation.ts`, `src/systems/robotFieldDerivation.test.ts`

  **Estimated scope:** M

- [ ] **Task 19: spawn, the baseline and the deal**

  **Description:** `spawnRobot` writes `development` (an original's own draw, with the alea fallback its neighbours
  have; a member's from its founder) and `journey: 'own'`. `spawnInitialCompanies` writes `journey: 'company'` beside
  the `companyId`. `generateRobotRosterBaseline` mirrors both: a member's development is its founder's, and every
  index in a seeded company's membership is `'company'`. `development` joins the deal's `TOP_LEVEL_FIELDS` with no
  push, so a theme change re-derives it by a write.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts` and `src/systems/spawnSystem.families.test.ts`: the fields
  at spawn; `src/systems/aspectDeal.test.ts`: the re-derive.

  **Acceptance criteria:**
  - [ ] In a spawned world every seeded company's robots, founder included, are on Company and every freelancer on
        Own; a member's development is its founder's.
  - [ ] A spawned roster equals its baseline in both fields, over the 121 worlds.
  - [ ] Over the 121 worlds, the members of a company share one journey key and one rate, and their developed
        melodies have the same starts and lengths at every measure of a 100-measure run (spec success criterion 3).
  - [ ] A theme whose column moves the development band re-derives each robot's value in place, with no melody
        regeneration.

  **Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/systems/spawnSystem.families.test.ts src/systems/aspectDeal.test.ts src/systems/aspectDeal.widened.test.ts`
  passes.

  **Dependencies:** Tasks 14, 18.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/spawnSystem.families.test.ts`, `src/systems/aspectDeal.ts`, `src/systems/aspectDeal.test.ts`

  **Estimated scope:** M

- [ ] **Task 20: saves and links**

  **Description:** `RobotAudioOverrideDiff` gains `development` and `journey`. `sessionDiff.ts` diffs each against
  the baseline and applies it, as it does `pitchRepeat`. `worldDiffCodec.ts` gives each a short key, chosen from
  those unused.

  **Proof:** RED test — `src/utils/sessionDiff.test.ts` and `src/utils/worldDiffCodec.test.ts`: the round trips.

  **Acceptance criteria:**
  - [ ] An untouched robot has neither key in a save.
  - [ ] Save, edit, wipe and load brings back both settings on a robot, and a company-wide edit on every member.
  - [ ] A world link round-trips both.
  - [ ] A payload saved before the fields existed loads, and its robots read the seeded values.

  **Verification:** `npx vitest run src/utils/sessionDiff.test.ts src/utils/worldDiffCodec.test.ts src/utils/seedBaseline.test.ts src/utils/sessionShareUtils.test.ts`
  passes.

  **Dependencies:** Task 19.

  **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`,
  `src/utils/worldDiffCodec.ts`, `src/utils/worldDiffCodec.test.ts`

  **Estimated scope:** M

### Checkpoint E: Gates B and C
- [ ] `npm test`, `npm run build` clean.
- [ ] Mutation checks, each killed: the lit share (18), the member's inherited rate (19), the Company write at
      `spawnInitialCompanies` (19), each diff key (20).
- [ ] **Gate B (profile).** `npm run perf` on `main` and on the branch, same session, one at a time: the branch adds
      no long task to the baseline table in [PERFORMANCE.md](../PERFORMANCE.md). A miss stops the build here, with
      the numbers and options.
- [ ] **Gate C (Crawford's ear).** A full seeded world, on desktop and on the phone. His to move: the band (A14).
- [ ] Stop. The docs start on his word.

---

### Phase 6: Docs

- [ ] **Task 21: `MELODY_SYSTEM.md`, `AUDIO_SYSTEM.md`, `ROBOT_LIFECYCLE.md`**

  **Description:** `MELODY_SYSTEM.md`: the home melody, a section for the journey and the changes, the two new event
  fields, and the docking re-roll's text out. `AUDIO_SYSTEM.md`: the note resolution pipeline's per-measure read,
  `sixteenths` and `pitchStep`. `ROBOT_LIFECYCLE.md`: pitch drift, the dock-cycle count and the snapshot's three
  fields out. Every name checked against the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No doc says a melody changes at a docking, or names a deleted function.
  - [ ] Every function, field and constant named exists as written.

  **Verification:** each name spot-checked against the code; links and anchors checked.

  **Dependencies:** Checkpoint E.

  **Files:** `docs/MELODY_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 22: `COMPANIES.md`, `SESSION_STORAGE.md`, the data grid, and the spec's As built**

  **Description:** `COMPANIES.md`: a member's inherited rate, the seeded Journey, the broadcast. `SESSION_STORAGE.md`:
  the two override fields. `reference/ROBOT_DATA_GRID.md`: the band row. The spec gains §8, As built: what Gates A
  and C moved, and any deviation from this plan. Roadmap 92's entry is brought up to date. **Ask first:** CLAUDE.md's
  reference line for `ROBOT_LIFECYCLE.md` lists "pitch drift"; the one-word fix is Crawford's to approve.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Each doc matches the shipped source; the spec's §8 records every number as shipped.
  - [ ] The CLAUDE.md line is changed only on Crawford's word.

  **Verification:** each name spot-checked against the code; links and anchors checked.

  **Dependencies:** Task 21.

  **Files:** `docs/COMPANIES.md`, `docs/SESSION_STORAGE.md`, `docs/reference/ROBOT_DATA_GRID.md`,
  `docs/specs/MELODY_JOURNEY.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] The spec's six success criteria (§5.5) each met, by a named test or a gate.
- [ ] Any browser check not done in the session is flagged here, not skipped.
- [ ] Ready for Crawford's PR.

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

## Open Questions

1. Spec §7.2's four questions. **Resolved** (Crawford, 2026-11-17): at least one note in a bar; the band stays the
   theme's; `pitchLocked` stays in place; a phone listen is enough.
2. Spec §7.1's assumptions. **Open by design:** they stand at their defaults until Gates A and C, where Crawford
   moves them by ear.
3. CLAUDE.md's `ROBOT_LIFECYCLE.md` line names pitch drift. **Open** — Crawford's word, at Task 22.
