# Phase Spec: The Melody Journey — a home melody, and a seeded journey that makes it busier and calmer

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/engine/melodyJourney.test.ts src/engine/melodyDevelopment.test.ts src/engine/AudioEngine.test.ts src/systems/robotSystems.test.ts src/systems/spawnSystem.test.ts`
> - Unit tests: `npm test`
> - Main-thread profile: `npm run perf`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-17 from the confirmed intent
[docs/intent/melody-journey.md](../intent/melody-journey.md). Crawford answered §7.2 the same day and asked for the
plan: [docs/tasks/MELODY_JOURNEY.md](../tasks/MELODY_JOURNEY.md) (2026-11-17, 23 tasks in six phases). The assumptions
of §7.1 stand at their defaults; Gate A is where he moves them by ear. The plan changed one thing here: the engine
reads a robot's settings when it plays, in place of carrying them at registration (§1.7, §1.9). Roadmap
[92](../todo/roadmap.md#92-the-melody-journey-a-home-melody-and-a-seeded-walk-that-makes-it-busier-and-calmer), next in
[plan.md](../todo/plan.md).

**Revised 2026-11-17, after Phases 1 to 5 were built**, to follow the revised intent: a journey is a list of
intensity and time pairs bounded by two settings, in place of a walk travelled at a set rate. §1.3, §1.9, §1.10, §5
and §7 are rewritten; §1.2, §1.5 to §1.8, §2 and §4 are touched where they named the walk or the rate. §8 says what
of the build stands and what is replaced. The task file follows as its Phases 6 to 9 (revised the same day).

**Revised again 2026-11-17, after Phase 7 was built:** max time leaves the robot (§7.4). Every journey has one max
time of 16, so robots on one journey move in lock step; max intensity is a robot's one bound. §1.1, §1.3, §1.9,
§1.10, §2, §4, §5 and §7.3 are touched; the task file adds Task 38 and revises Tasks 29 to 35.

**Built 2026-11-17**, every phase; what shipped, every number and what the gates moved (nothing; passed or waived 2026-11-17) is §9, As built.

**Changed by roadmap 93, journey dynamics (2026-11-18 and 2026-11-19), §10.** The calm side is scaled, not clamped;
freelancers and a robot on Company with no company travel on Fleet; shifts hold their direction; octave jumps are a
busy phase; each trip takes its own path; the performance follows the journey's level; `journeyPosition` became
`journeyAt`. §1 to §9 stand as the record of 92 and are not rewritten: where they differ, §10 holds.

**Where the claims come from.** Two sources, marked where it matters:

- **(code)** read in the repo while writing this spec.
- **(arithmetic)** worked by hand in the session from constants in the code. Not measured.

Every number this spec introduces that the intent does not give (the journey's odds and leans) is
a first cut for Crawford's ear at Gate A (§5.4), not a decision.

---

## 0. Scope check

One capability: a melody that develops on a seeded journey. Its parts (the journey, the changes, the engine's read, the
two settings, the removal of drift) cannot be heard or verified apart, so there is no capability map. The home melody
editor is a second capability and is out (§3).

---

## 1. Overview & Claude Explanation

### 1.1 Before this piece

(As `main` has it. On the branch, Phases 1 to 5 have already changed what this section describes; §8.)

- **A melody is one bar, generated once.** `composeRobotMelody` (`src/engine/regenerateMelody.ts`) builds 16
  sixteenth-note steps of `MelodyEvent`s from the robot's `compositionSeed`, its composition settings and its world.
  `Robot.melody` holds it, and `AudioEngine.registerRobotMelody` files its events by `startStep` in one
  `stepRegistry` that every measure reads (code).
- **Its only change over time is docking pitch drift.** On each Docked landing, `stepRobotLifecycle`
  (`src/systems/robotSystems.ts`) re-rolls the slot of a quarter of the unlocked events (`reRollMelodyPitches`,
  `DOCKED_PITCH_DRIFT_RATIO` 0.25). Rhythm, lengths and octaves never change (code).
- **The drift has three flaws** (code):
  - It ignores the Note Variance set: with variance on, the new slot comes from all eight by weight.
  - Any composition edit wipes it, because `regenerateMelody` rebuilds from the seed.
  - It happens while the robot is silent, so it is heard one shift later.
- **A note reads its own measure.** `stepNotes(at, time)` (`src/engine/AudioEngine.ts`) resolves a step's events with
  `paletteForMeasure(at.measure)`. It has two callers: the trigger, and the note cloud's early announcement of a later
  step (`announceUpcomingStep`). So anything a note reads must be a function of the measure it sounds in (code).

Terms, used the same way from here on:

- **Home melody:** the melody `composeRobotMelody` makes. `Robot.melody` holds it, and only it.
- **Change:** one small edit to a melody. "Step" stays the word for a sixteenth slot (`startStep`).
- **Position:** how many changes a robot is from home. Positive is busier, negative is calmer, 0 is home.
- **Journey:** a seeded list of pairs that gives a position for a measure.
- **Pair:** an intensity and a time.
- **Intensity:** the position a pair heads for.
- **Time:** how many measures a pair takes to get there.
- **Drop:** a pair with a time of one measure.
- **Turning measure:** the measure that plays a pair's intensity.
- **Bounds:** a robot's max intensity (§1.9) and the journey's max time, `JOURNEY_TIME_MAX` 16 for every journey
  (§7.4).

### 1.2 The shape of it

Three pure functions, one on top of the other:

| Function | Question | Reads |
|---|---|---|
| `journeyPosition(key, bounds, measure)` | How many changes from home is this robot at this measure? | the journey's key, the robot's bounds and calm limit, the measure |
| `developMelody(home, position, options)` | What is the home melody at that position? | the home melody, the position, the robot's own draws |
| the engine's read | Which events does this robot play on this step of this measure? | the two above |

The melody a robot plays in a measure is worked out from its home melody, its bounds, its journey and the measure.
Nothing is remembered, nothing is written to the store as the music moves, and nothing new is saved except the two
settings (§1.9).

### 1.3 The journey

- **A list of pairs.** A journey is a seeded list of pairs, each an intensity and a time. The melody heads for the
  pair's intensity and is there after the pair's time. Each pair starts where the one before it ended; the first
  starts at home, on measure 0.
- **Its key decides who shares it.** The journey is an `alea` over one string:

  | Journey setting | Key | Who travels together |
  |---|---|---|
  | Own | `` `${worldKey}:${compositionSeed}:journey` `` | the robot alone |
  | Company | `` `${worldKey}:${companyId}:journey` `` | every member on Company |
  | Fleet | `` `${worldKey}:fleet:journey` `` | every robot on Fleet |

  `worldKey` is `melodyWorldKey(localeId)`, the locale's coordinates, as the rhythm stream uses, so a world reloaded
  from a save or a link travels the same journeys (code).
- **Drawn as shares, scaled by each robot.** The stream gives each pair as an intensity share `v`, from −1 to 1, and a
  time share `u`, from 0 to 1, and says whether the pair is a drop. Each robot scales the shares by its own bounds
  (below). So one journey is one shape, however deep or long a robot travels it.
- **The draws.** Four draws per pair, taken whether the pair uses them or not, so pair i always reads draws 4i to
  4i + 3: the home roll, the intensity, the time, the drop roll. `p` is the intensity share of the pair before, 0
  before the first.

  | Step | Rule | First cut |
  |---|---|---|
  | Home | The pair heads home (`v` = 0) when the home roll is under `JOURNEY_HOME_ODDS × \|p\|`, and `p` is at least `JOURNEY_MIN_MOVE` from home. | `JOURNEY_HOME_ODDS` 0.5: from max intensity, half the time |
  | Intensity | Otherwise `v` is an even draw over −1 to 1, less the stretch within `JOURNEY_MIN_MOVE` of `p`. A pair always moves, and may stay on its side or cross home. | `JOURNEY_MIN_MOVE` 0.125: 2 changes at a max intensity of 16 |
  | Time | `u = JOURNEY_TIME_LEAN × (1 − \|v\|) + (1 − JOURNEY_TIME_LEAN) × the time draw`. | `JOURNEY_TIME_LEAN` 0.5: a pair heading home takes the top half of the time, a pair heading for max intensity the bottom half |
  | Drop | The pair is a drop when the drop roll is under `JOURNEY_DROP_ODDS`, its move `\|v − p\|` is at least `JOURNEY_DROP_MIN_MOVE`, it is not the first pair, and the pair before it is not a drop. | `JOURNEY_DROP_ODDS` 0.3; `JOURNEY_DROP_MIN_MOVE` 0.5: 8 changes at 16 |

- **A long time over a small change needs no rule of its own.** A small move near home draws the top of the time,
  from the Time row.
- **A robot's pairs.** With max intensity `N`, max time `M` (the journey's: `JOURNEY_TIME_MAX` 16, §7.4) and calm
  limit `C` (the robot's calm changes: its home
  notes less one, §1.6):
  - **Intensity:** `v × N`, rounded to the nearest whole change, and never below `−C`.
  - **Time:** `u × M`, rounded to the nearest even number of measures, and never under 2.
  - **A drop** has a time of 1, and the pair before a drop is one measure shorter.
- **Turning measures.** A pair's turning measure is the sum of the times up to and including its own. Every turning
  measure is even, so it is a chord change (`paletteForMeasure` moves on every second measure, code). The one
  exception is a pair before a drop: it turns on the odd measure, and the drop lands on the chord change after it.
- **Where a robot is.** In a pair that runs from intensity `a` on measure `s` to intensity `b` on measure `s + T`,
  measure `s + k` plays `a + sign(b − a) × floor(|b − a| × k ÷ T)`. The floor means the robot reaches `b` on the
  turning measure and not before. Measure 0 is position 0: every world starts at home.
- **Worked example** (arithmetic). Crawford's example, `[[16, 15], [-8, 1], [0, 16]]`, for a robot with eight or more
  calm changes and for one with four, whose second pair is brought in to −4:

  | Measure | Calm limit 8 or more | Calm limit 4 |
  |---|---|---|
  | 0 | 0 | 0 |
  | 1 to 14 | +1 to +14 | +1 to +14 |
  | 15 | +16 | +16 |
  | 16 (the drop) | −8 | −4 |
  | 18 | −7 | −4 |
  | 20 | −6 | −3 |
  | 24 | −4 | −2 |
  | 28 | −2 | −1 |
  | 32 | 0 | 0 |

- **Robots on one journey turn on the same measures**, each to its own depth: max time is the journey's, not the
  robot's (§7.4), so a company on Company, or the fleet on Fleet, moves in lock step.
- **A robot with less range than the journey asks for** is brought in on the calm side before its changes are worked
  out (the calm limit, above). The busy side has no limit (§1.5, shifts).
- **A low bound can hold a robot still.** Two pairs in a row can scale to one intensity when max intensity is small,
  or when both are brought in to the calm limit. The robot then plays one melody through the second pair. The rule
  that a pair always moves is a rule of the journey's shares, not of every robot's scaling of them.
- **No history.** An edit to max intensity or to Journey re-reads the journey as if the new setting had held from measure 0,
  the rule the chord settings follow.

### 1.4 Lengths and neighbours

Two things the changes need that a `MelodyEvent` cannot say today.

- **A length in sixteenths.** Home events are `'16n'`, `'8n'`, `'4n'` or `'2n'`: 1, 2, 4 or 8 sixteenths
  (`DURATION_UNIT_VALUES`, code). A split or a tie gives 3, 5, 6 or 7, which have no note name. So a changed event
  carries `sixteenths?: number`, a whole number from 1 to 16. Present, it is the event's length; absent, `length` is.
  The engine sounds it for that many sixteenths at the live tempo.
- **A neighbour.** A changed event may carry `pitchStep?: number`, a signed whole number of palette steps. The engine
  resolves it when the note plays (§1.7): from the event's own slot and octave, move that many places through the
  measure's palette in pitch order. A palette of `C G E D B C E G` has the pitch classes C, D, E, G, B; one step up
  from E4 is G4, from B4 is C5, and one step down from C4 is B3.

Both are index data, never a pitch string (the Melody Logic guardrail). Neither is ever written on a home event.

### 1.5 Getting busier

`developMelody(home, position, options)` with a positive position applies that many busy changes to the home melody, in
order. Change k+1 is always one change on top of change k, so walking back undoes them in reverse.

**The threshold.** `T` is the shortest home note's length in sixteenths, measured once on the home melody. Its
subdivision is `T / 2`. Neither is ever below the robot's floor (§1.8); a threshold under the floor is raised to it,
and a `T` of one sixteenth has no subdivision.

**A split, at threshold `t`.** A note of `L` sixteenths keeps `L − t`, and a new note of `t` sixteenths starts where it
now ends, one palette step from it. The direction, up or down, is a draw (§1.8). A note may be split at `t` only when
it is at least `2t` long, so the part it keeps is never shorter than the part it gives up.

The changes come in four phases, each running until it has nothing left to do:

1. **Split, first pass.** The candidates are the home notes that can be split at `T`, sorted by length, then by start.
   The sort fixes the order and changes nothing. They are visited from alternating ends: the shortest, the longest,
   the second shortest, the second longest. One visit is one change. The pass ends when half of the candidates
   (rounded up) are split.
2. **Split, two thresholds.** Changes now alternate between `T / 2` and `T`, starting with `T / 2`. For each change the
   candidates are every note now in the melody that can be split at that change's threshold, the pieces made earlier
   included, sorted as before; the pick alternates between the shortest and the longest, change by change. A threshold
   with no candidate hands its turn to the other. The phase ends when neither has one.
3. **Fill.** A gap is a run of silence inside the bar: between one note's written end and the next note's start,
   before the bar's first note, or after its last. While some gap is at least one fill length long (the smaller
   threshold in use), a change adds one note of that length at the end of the longest gap (the earliest, on a tie),
   one palette step from the note it leads into. The gap after the last note leads into the bar's first note.
4. **Shift.** A change moves one note one palette step. The notes are visited in start order, round and round. This
   phase never runs out, so the busy side has no limit; the robot's max intensity is what bounds it.

**What a change never does.** It never moves a home note's start, never makes two notes overlap, and never puts a note
outside the bar. Before the shift phase, every home note still sounds on its own slot.

**Worked example** (arithmetic). A home melody of a half note at step 1, a quarter at step 9 and an eighth at step 13,
so `T` = 2 and the candidates at `T` are the quarter and the half:

| Position | Change | The bar (start: sixteenths) |
|---|---|---|
| 0 | home | 1: 8, 9: 4, 13: 2 |
| 1 | split the quarter at 2 | 1: 8, 9: 2, **11: 2**, 13: 2 |
| 2 | phase 2, at 1: split the shortest | 1: 8, 9: 1, **10: 1**, 11: 2, 13: 2 |
| 3 | phase 2, at 2: split the longest | 1: 6, **7: 2**, 9: 1, 10: 1, 11: 2, 13: 2 |

Phase 1 ends after one change, because half of two candidates is one. Bold is the new neighbour note.

### 1.6 Getting calmer

A negative position applies that many calm changes to the home melody.

- **A tie.** The note is removed, and the note before it sounds on through to where the removed note ended. Any
  silence between the two is covered.
- **The order.** The candidates are every home note except the bar's first, sorted by length, then by start, and
  visited from alternating ends, as the busy side visits its own.
- **The floor is one note:** the bar's first, at its home start. So a three-note melody has two calm changes: its
  **calm limit** is 2. The journey never asks a robot for more (§1.3), and `developMelody` handed a position below the
  floor still plays the floor.

### 1.7 The engine plays the measure's melody

- **The contract.** A robot's events on a step are the events of its melody *for that step's measure*:
  `developMelody(home, journeyPosition(key, bounds, at.measure), options)`. `stepNotes(at, time)` reads it for
  `at.measure`, so the trigger and the early announcement agree by construction, as they do for the chord (code,
  §1.1).
- **Registration carries the home melody only, as now.** The engine reads the robot's settings when it plays: a pure
  `robotJourney(robot, worldKey, bpmTop)` turns the stored robot into the journey's key, the bounds, the floor and
  the seed. The calm limit comes from the registered home melody. `stepNotes` already reads the stored robot on the tick (its release, its Humanize seed; code), so this is no
  new kind of read. A settings edit, a company move, a loaded save and the deal therefore need no engine call: the
  next note reads what the store holds. (The spec first had registration carry a descriptor; the plan dropped it,
  because every site that moves a robot between companies would have had to re-register it.)
- **Nothing is rebuilt per sixteenth.** A robot's developed melody is rebuilt only when its position or its inputs
  change (a measure has one position), and the last few positions are kept, since the trigger and the early
  announcement read two measures either side of a bar line. A robot at a max intensity of 0, or at position 0, plays
  its home melody's own events.
- **The pitch step.** After `paletteForMeasure(at.measure)` gives the eight names, an event with a `pitchStep` is
  resolved as §1.4 describes. A neighbour that would leave the robot's `octaveRange` goes the other way instead.
- **The motif accent** is decided on the home melody, as now (the earliest home event of each repeat window, code),
  and carried by that event. A note a change adds is never accented; an accented note that is tied away takes its
  accent with it.
- **Rests and marks** stay on the home event they were stamped on (`applyPerformanceMarks`, code). A note a change adds
  carries neither.
- **The Click Track** still replaces everything while it is on.
- **Audio rules hold.** All of this is a read inside the melody's `16n` transport tick. No timer, no synth, no
  scheduling outside `AudioEngine.scheduleNote`, `MIN_LEAD` applied as now.

### 1.8 The robot's own draws, and its floor

- **The draws.** `alea(`` `${compositionSeed}:development` ``)`, one draw per change, taken whether the change uses it
  or not, so change k always reads draw k. It gives a split's, a fill's and a shift's direction. It is keyed on the
  seed alone, so a composition edit changes the home melody and not the directions.
- **So a family develops as a section.** Members share their founder's rhythm (code,
  [MELODY_SYSTEM.md](../MELODY_SYSTEM.md), the rhythm stream), and which note a change picks depends on lengths and
  starts only. Members on one journey with the same bounds split the same notes on the same measures, each with its
  own neighbour notes.
- **The floor.** The attack rail (`audibleDensityBand`, `src/systems/robotFieldDerivation.ts`) exists because a slow
  attack on short notes never climbs (code). Development obeys the same arithmetic: no change makes a note shorter
  than `ceil(ATTACK_REACH_SHARE × attack ÷ one sixteenth at the top of the theme's bpm band)` sixteenths, and never
  shorter than one. Under Classic (100 BPM at the top, a sixteenth of 0.15 s), attacks up to 0.3 s give a floor of
  1 and a 1.14 s attack gives 4, a quarter note (arithmetic).

### 1.9 The two settings

| Field | Values | At spawn | A company member |
|---|---|---|---|
| `Robot.journeyMaxIntensity?: number` | whole changes, 0 to 16 | 0 for the share the band's `lit` leaves out; for the rest, an even draw of a whole number in the `'robot.journeyMaxIntensity'` band | its founder's |
| `Robot.journey?: 'own' \| 'company' \| 'fleet'` | which journey it travels | `'company'` for a robot spawned into a company, `'own'` for a freelancer | `'company'` |

- **`Robot.development` goes**, with everything that carried it (§8).
- **The top of max intensity is 16** (`JOURNEY_INTENSITY_MAX`): the sixteen notes a measure can hold.
- **Max time is not a setting** (§7.4). Every journey's pairs take from 2 to `JOURNEY_TIME_MAX` 16 measures, in even
  numbers but at a drop (§1.3), for every robot.
- **Absent reads as 0 and `'own'`**, so a robot built by hand in a test plays its home melody.
- **The band,** in `src/data/bands/classic.ts`: `'robot.journeyMaxIntensity': { min: 1, max: 16, lit: 0.7 }`. Three
  robots in ten load at 0 and play their home melody; the rest draw evenly from 1 to 16. It joins the Melody family
  (`MELODY_BAND_KEYS`), so the deal re-derives it with the other four; no aspect column names it in this piece.
- **On Company with no company, a robot travels as Own.** The setting is kept, and takes effect if the robot is put in
  a company.
- **Edits.** `applyJourneyMaxIntensity` and `applyJourney` (`src/systems/robotOptionsActions.ts`) write the field and
  nothing else, as `applyDynamics` does (code): no regeneration and no engine call. The home melody is untouched, and
  the engine reads the new value on the next note (§1.7). The same holds for a move between companies and an Attack
  edit.
- **The store normalises max intensity** to a whole number from 0 to 16, a `NaN` dropped (`localeStore.updateRobot`,
  as it snaps, clamps and drops `development` today, code). A restore keeps its own check that it is a finite number
  before the store sees it (`buildRobotUpdates`, `src/utils/sessionDiff.ts`, code).
- **Broadcast.** Both join `CompanyOptionsSnapshot`, so the company and All Probes screens set them for every member
  (broadcast, not link, as every other setting).
- **Saved.** Both join `RobotAudioOverrideDiff` and the world link's codec, diffed against the seeded baseline like
  `pitchRepeat`. The link's `dv` key goes; max intensity takes a new key (`ji`, if the plan finds it free). The home
  melody is still not saved.

### 1.10 The controls

Composition > Rhythm & Melody (`CompositionRhythmMelodySection`, `src/components/robot/CompositionSections.tsx`) has
a third row today: Development beside Journey (code). It stays one row (C1, §7.4):

- **Row 3: Max Intensity beside Journey.** Max Intensity is a `SliderLinear`, 0 to 16 in steps of 1, in Development's
  place; Journey is the `'radio'` control with three options, Own, Company, Fleet, as built.
- **Journey is dimmed while Max Intensity is 0**, its value kept: it does nothing there.
- Every label, option and help text is a content entry (`probe.composition.journeyMaxIntensity`,
  `probe.composition.journey`), read through `labels()` and `options()`.
  `probe.composition.development` goes. The copy is a stand-in, marked as the other stand-ins are, for backlog
  [62](../todo/backlog.md#62-misc-review-items-a-bucket)'s content pass.

### 1.11 What goes

Docking pitch drift, and what only it used (code, each to be re-checked by the plan before it is deleted):

- `reRollMelodyPitches`, and `pickWeightedIndex` and `pickRandomIndices` if nothing else calls them
  (`src/engine/melodyGenerator.ts`); `DOCKED_PITCH_DRIFT_RATIO` (`src/constants/index.ts`).
- The drift block in `stepRobotLifecycle`, and `melody`, `dockCycleCount` and `noteVariance` on
  `RobotLifecycleSnapshot`; `landOnDocked`'s `driftedMelody` parameter and its re-registration
  (`src/systems/robotSystems.ts`).
- `src/systems/dockCycles.ts`, whose one reader is the drift.
- The lifecycle then writes docking and battery only. Replay loses nothing: the melody of any measure is §1.2's.

`MelodyEvent.pitchLocked` loses its only reader with the drift. It is left in place; removing it is Crawford's call
(§7.2).

---

## 2. Target File Structure

```text
src/
├── engine/
│   ├── melodyJourney.ts          (new)  the journey: journeyKey, the pairs, journeyPosition, robotJourney
│   ├── melodyDevelopment.ts      (new)  the changes: developMelody, the floor, the calm limit
│   ├── melodyGenerator.ts               reRollMelodyPitches and its helpers go
│   ├── harmonySystem.ts                 the palette step resolver
│   ├── regenerateMelody.ts              melodyWorldKey shares the world key with the journey
│   └── AudioEngine.ts                   the per-measure read, sixteenths, pitchStep
├── systems/
│   ├── robotSystems.ts                  the drift goes
│   ├── dockCycles.ts             (deleted)
│   ├── lifecycleSim.ts                  the snapshot's three fields go
│   ├── robotFieldDerivation.ts          deriveMelodyFields draws max intensity
│   ├── spawnSystem.ts                   the two fields at spawn, a member's max intensity from its founder
│   ├── aspectDeal.ts                    max intensity in the Melody family's re-derive
│   ├── robotOptionsActions.ts           applyJourneyMaxIntensity, applyJourney
│   └── companyOptions.ts                the two fields in the snapshot
├── stores/localeStore.ts                normalise the two fields
├── types/                               Robot.ts, Company.ts, session.ts
├── data/
│   ├── bands/                           bandKeys.ts, classic.ts, aspects.ts
│   └── robotOptionsConfig.ts            max intensity's schema, JOURNEY_SCHEMA
├── content/copy/probe.ts                the two entries and the three options
├── utils/                               sessionDiff.ts, worldDiffCodec.ts
├── constants/index.ts                   max intensity's range, the journey's max time and odds; DOCKED_PITCH_DRIFT_RATIO goes
└── components/
    ├── robot/CompositionSections.tsx    the third row
    ├── company/useCompanyOptions.ts     the broadcast
    └── panels/screen/screens/RobotScreen.tsx

docs/   MELODY_SYSTEM.md, ROBOT_LIFECYCLE.md, AUDIO_SYSTEM.md, COMPANIES.md, SESSION_STORAGE.md,
        reference/ROBOT_DATA_GRID.md (at the end of the build)
```

The list is the files a robot setting touches, read off `pitchRepeat`'s and, since Phase 5, off `development`'s own
(code: 24 files under `src/` name it, tests apart). The plan confirms it.

---

## 3. Implementation Boundaries & Constraints

**Always**

- The melody of a measure is a pure function of the home melody, the two settings, the robot's seed and attack, the
  world key and the measure. No module state decides a note.
- `Robot.melody` is the home melody and nothing else. The store is not written as a melody develops.
- Melodies store note indices and steps, never a pitch string.
- Every draw is seeded. No `Math.random`.
- User-facing text goes through `src/content/`.

**Ask first**

- Any change to the rhythm, composition or performance streams, or to what `composeRobotMelody` returns.
- Any new dependency.
- Removing `pitchLocked`, or anything else §1.11 does not name.

**Never**

- A timer for musical timing (`setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask`).
- A synth, a timeline or a ref in state.
- A change to the robot's body, colour or dials. The note cloud shows the developed notes because it is fed by the
  engine's note events (code); nothing else visual reads a melody.
- A guardrail relaxed to make a task easier.

**Out of scope**

- The home melody editor, and anything hand-owned (roadmap
  [90](../todo/roadmap.md#90-the-score-editable-chords-a-clock-with-two-rulers-hand-edited-parts), backlog
  [65](../todo/backlog.md#65-robot-a-melody-strip-under-the-accents-slider-and-later-editing-the-notes)).
- A part with its own length, time signatures, editable chords, the pace ruler (roadmap 90).
- A journey written by hand, and a journey tied to the chord progressions. The list of pairs is the form either would
  take; this piece only seeds it.
- Melody aspects that move the development band (§7.2).
- Saving a developed melody, or a history of them (roadmap
  [32](../todo/roadmap.md#32-robot-melody-history--configuration-scrubber)).

---

## 4. Code Style & Architecture Conventions

The two new modules are pure and take everything they read as arguments, as `composeRobotMelody` does.

```typescript
/** A robot's reach on a journey: its max intensity, the journey's max time (JOURNEY_TIME_MAX for every robot, §7.4),
 *  and how many calm changes its home melody has. */
export interface JourneyBounds {
  maxIntensity: number;
  maxTime: number;
  calmLimit: number;
}

/** How many changes from home a robot with `bounds` is on `key`'s journey at `measure`. Pure. */
export function journeyPosition(key: string, bounds: JourneyBounds, measure: number): number {
  if (!(bounds.maxIntensity > 0) || !(measure > 0)) return 0;
  return positionInPairs(pairsFor(key, bounds), measure);
}

/** The home melody at `position`: that many busy changes above 0, calm changes below it, home at 0. Pure. */
export function developMelody(home: MelodyEvent[], position: number, options: DevelopmentOptions): MelodyEvent[] {
  if (position === 0) return home;
  return position > 0 ? busier(home, position, options) : calmer(home, -position);
}
```

- A changed event is a new object; a home event that no change touched is the same reference.
- A new note's `id` is derived from the event it came from and the change's number, not from `generateUUID`, so the
  same position always gives the same ids.
- Constants live in `src/constants/index.ts`; bands in the band table.

---

## 5. Testing & Verification Requirements

Vitest, colocated. Tests import and run the code they check; none reads source, CSS or doc text. Tasks that only
delete, or only change docs or copy, get no test (CLAUDE.md).

### 5.1 The journey

The position inside a list of pairs is its own pure function (`positionInPairs`), so it is tested on pairs written
by hand, apart from the draws.

- The worked example of §1.3, literally, both columns.
- A pair's intensity is played on its turning measure and on no measure of the pair before it.
- Inside a pair the position never moves away from the pair's intensity.
- The same key gives the same shares; keys that differ only in scope (`own`, a company id, `fleet`) give different
  ones.
- Position 0 at measure 0 for any key and bounds, and at every measure at a max intensity of 0.
- Over a long run of several keys, at several bounds:
  - No position is past max intensity, or below the calm limit.
  - No pair's time is over max time.
  - Every turning measure is even, except a pair before a drop, which turns on the odd measure before the drop's.
  - The first pair is not a drop, and no drop follows a drop.
  - No pair's intensity share is within `JOURNEY_MIN_MOVE` of the one before it.
  - Pairs both stay on a side and cross home.
  - The leans, as comparisons and not exact counts: pairs heading near home take more time on average than pairs
    heading far out, and a pair starting near max intensity heads home far more often than one starting near home.
- Two robots on one key with different max intensities turn on the same measures.

### 5.2 The changes

Run over generated home melodies (the 121 sim worlds' rosters, `SIM_SEED_COORDS`) and positions from the calm floor
to well past the last fill:

- No two notes overlap, and none leaves the bar.
- No note is shorter than the floor.
- Position p+1 differs from p by one change; position 0 is the home melody itself.
- Before the shift phase, every home note is still present on its own slot.
- A split conserves length: the two parts sum to the note split.
- The calm floor is one note, and positions below it equal it.
- The same inputs give the same events, ids included.
- The worked example of §1.5, literally.

### 5.3 The engine and the settings

- `stepNotes` at two measures with different positions returns each measure's own events, from one registration.
- A `pitchStep` resolves to the next pitch class of the measure's palette, carries the octave across B to C, and
  turns back at the edge of `octaveRange`.
- A `sixteenths` length sounds for that many sixteenths at the live tempo.
- A robot at a max intensity of 0 plays its home melody at every measure.
- A robot is never read at a position below its calm limit.
- Family members on Company with the same max intensity have the same starts and lengths at every measure of a run.
- Robots on one journey with different max intensities turn on the same measures in the engine.
- Spawn: a robot whose lit roll falls outside the band's `lit` has a max intensity of 0; every other robot has a whole
  number in the band, each a full share.
- Spawn: a member's max intensity is its founder's; a member's `journey` is `'company'`, a freelancer's `'own'`.
- A save, edit, wipe and load brings back both settings; so does a world link.
- The lifecycle's replay still matches the live tick, measure by measure, without the drift.
- Each new gate is mutation-checked: break the code, see a test fail.

### 5.4 Gates

- **Gate A (Crawford's ear).** After the new journey and the two settings are in by hand: he listens to one robot
  at a high max intensity through a drop and a slow return home, then a company on one journey. The numbers of §1.3
  and §1.9 and the order rules of §1.5 and §1.6 are his to move here. (The first Gate A, on the walk, was never
  recorded.)
- **Gate B (profile).** `npm run perf` before and after, same session: the developed read adds no long task to the
  baseline table in [PERFORMANCE.md](../PERFORMANCE.md). On the walk's build the step harness did not run and a
  `npm run perf:audio` A/B stood in for it; whether that stands is Crawford's call, still open (the task file's
  Checkpoint E). The new journey can move a robot many changes in one measure, so the gate is run again on it.
- **Gate C (Crawford's ear).** A full world on the seeded bands, on desktop and on the phone.

### 5.5 Success criteria

1. A robot with a max intensity above 0 plays its home melody at measure 0, then busier and calmer versions of it as
   its journey moves, and its home melody again on the turning measure of each pair that heads home.
2. A robot at a max intensity of 0 plays its home melody on every measure.
3. A company or the fleet on one journey turns on the same measures, whatever each robot's max intensity, and every
   turning measure but the one before a drop is a chord change.
4. A drop is heard as one: the measure before it plays the intensity it left, and the drop's measure plays the new one
   from its first beat.
5. A robot reaches its calm limit on a turning measure, not before.
6. The same world, settings and measure always give the same notes, after a reload, a link or a power cycle.
7. No melody changes at a docking.
8. `npm test`, `npm run lint`, `npm run build:types` and `npm run build` pass.

---

## 6. Git & Workflow Context

- Branch `feature/melody-journey` off `main`. One commit per task, tests with the code. Crawford opens the PR.
- It lands before backlog [45](../todo/backlog.md#45-off-screen-crawfords-three-preset-links): it changes every
  world's sound.
- No guardrail in CLAUDE.md changes. The reference docs named in §2 are brought up to date as the last tasks.

---

## 7. Assumptions & Open Questions

### 7.1 What this spec filled in

Crawford decided the shape (the intent). These are the corners he did not describe. Each stands unless he changes it.

| # | Assumption | Where |
|---|---|---|
| A1 | A note can be split at a threshold only when it is at least twice that long. His words were "longer than the threshold"; a note one and a half thresholds long cannot be subdivided by it. | §1.5 |
| A2 | Phase 1 ends at half the candidates, rounded up. | §1.5 |
| A3 | In phase 2 the thresholds alternate change by change, the subdivision first, and the pick alternates shortest and longest. | §1.5 |
| A4 | A fill note is one fill length long, sits at the end of the longest gap, and is a neighbour of the note it leads into. | §1.5 |
| A5 | A shift visits the notes in start order. | §1.5 |
| A6 | The calm side mirrors the busy side's order, and its floor is the bar's first note. He chose the tie; the floor was asked and not answered. | §1.6 |
| A7 | The attack floor: development never makes a note shorter than the attack rail allows. It reads the robot's live attack, so an Attack edit can change the path. | §1.8 |
| A8 | A split's direction comes from a stream on the composition seed alone, so settings edits do not reshuffle it. | §1.8 |
| A9 | A neighbour that would leave the octave range goes the other way. | §1.7 |
| A10 | New notes carry no rest, mark or accent; a home note keeps its own. Pitch Repeat's locked copies are treated like any other note. | §1.7 |
| A11 | Neighbour notes may leave a Note Variance set. That is the development. | §1.5 |
| A12 | ~~The turning points alternate sides, 2 to 8 changes from home.~~ Replaced by the revision (§7.3). | §1.3 |
| A13 | ~~The slider stops every 0.125, so the slowest moving rate is one change every eight measures.~~ Replaced (§7.3). | §1.9 |
| A14 | ~~The band: 70 % of robots develop, from 0.125 to 1.~~ Replaced: the 70 % is now Crawford's, on max intensity (§1.9). | §1.9 |
| A15 | A robot on Company with no company travels as Own. | §1.9 |
| A16 | Journey is dimmed while Max Intensity is 0. (It also dimmed Max Time, which has gone, §7.4.) | §1.10 |
| A17 | The Company key is `Company.id`. A seeded company's id is seeded (`generateCompanyId`); a hand-made one's is a `generateUUID` (`CompanyCrudControls.tsx`). **Checked by the plan (code):** a save and a world link both carry a hand-made company whole, id included (`SessionPayload.userCreatedCompanies`, the codec's `u`), so its journey comes back with it. | §1.3 |

### 7.2 Questions, answered by Crawford on 2026-11-17

1. **The calm floor.** At least one note in a bar. A6 stands.
2. **Aspects.** The development band stays the theme's for now. No aspect column names it.
3. **`pitchLocked`.** Not sure; "might be useful for when the new slider is 0/off?" So it stays in place. To be clear
   about what is and is not lost: Pitch Repeat itself is untouched, at any Development value. Its locked copies are
   still made at generation and still play the base cell's notes. Only the stamp on the event is unread, because the
   drift it told to keep off is gone; at Development 0 nothing changes a melody at all, so there is nothing for it to
   resist. It is the natural hook if a later piece wants development to keep locked copies in step with their base
   note (A10 treats them like any other note for now).
4. **The phone.** A listen is enough (Gate C).

### 7.3 What the revision of 2026-11-17 filled in

Crawford decided the pairs, the two bounds and their ranges (max time then left the robot, §7.4), the drop and where it lands, the even measures, the
calm limit, the shares, the leans' direction, the home odds at max, and the 30 % at home (the intent). These are the
corners he did not describe. Each stands unless he changes it, and every number is his to move at Gate A.

| # | Assumption | Where |
|---|---|---|
| B1 | His two time leans are read as being about the intensity a pair heads for: a pair heading far out takes less time, a pair heading near or to home takes more. | §1.3, Time |
| B2 | "The closer it is to max, the more likely it is to land on 0" is read as: where the journey is when the next pair is drawn. The odds rise in a straight line from 0 at home to a half at max. | §1.3, Home |
| B3 | The time lean is half of the time share; the other half is the draw. | §1.3, Time |
| B4 | A pair always moves at least an eighth of max intensity in the shares. This is "a journey does not hold still". | §1.3, Intensity |
| B5 | A robot can still hold through a pair when its own bound is small or its calm limit brings two pairs to one place. | §1.3 |
| B6 | A drop goes either way, to calmer or to busier, and may land home. His example drops to calmer. | §1.3, Drop |
| B7 | Only a big move can be a drop (half of max intensity or more, in the shares), three times in ten. | §1.3, Drop |
| B8 | A drop never follows a drop, and the first pair is never one: each needs a pair before it to take its measure from. | §1.3, Drop |
| B9 | "Long times without a large change, occasionally" gets no rule of its own; the time lean gives it. | §1.3 |
| B10 | Inside a pair the changes are spread by a floor, so a robot leaves a turning measure late and arrives exactly, never early. | §1.3 |
| B11 | The field is `journeyMaxIntensity`; the label Max Intensity is stand-in copy. (`journeyMaxTime` and its label have gone, §7.4.) | §1.9, §1.10 |
| B12 | ~~Max time is seeded evenly across its whole range, 2 to 16, and absent it reads as 8.~~ Gone: max time is not a robot setting (§7.4). | §1.9 |
| B13 | ~~A robot at a max intensity of 0 still draws a max time.~~ Gone (§7.4). | §1.9 |
| B14 | ~~The two sliders share row 3 and Journey takes a row of its own.~~ Replaced by C1 (§7.4). | §1.10 |
| B15 | The busy side is not brought in as the calm side is: past its splits and fills a robot shifts notes, so at a max intensity of 16 the top of every robot's journey is pitch movement on a full rhythm (the task file's Checkpoint A: the longest busy path before the shifts is 15, and half the fleet has none). | §1.3, §1.5 |

### 7.4 Max time leaves the robot (Crawford, 2026-11-17, after Phase 7)

His words: "robots should not have max time, they should be in lock step (when in company or fleet mode, of course).
let's just have one max journey time of 16 for now."

- **Every journey has one max time, `JOURNEY_TIME_MAX` 16.** A pair's time is its time share times 16, rounded to an
  even number from 2 (§1.3), for every robot. Robots on one journey therefore turn on the same measures, each to its
  own depth: a company on Company and the fleet on Fleet move in lock step. An Own robot is alone on its journey, so
  nothing changes for it but the pace.
- **Gone with it:** `Robot.journeyMaxTime`, its store normalisation, its band, draw, slider, content entry, apply,
  snapshot field, save diff and link key, and the constants `JOURNEY_TIME_MIN`, `JOURNEY_TIME_STEP` and
  `DEFAULT_JOURNEY_MAX_TIME`. The field and the constants were built (Task 27); the rest was planned and is dropped
  from the plan.
- **The pure pieces keep max time as an argument** (`JourneyBounds.maxTime`, `robotPairs`, `journeyPosition`):
  `robotJourney` hands back `JOURNEY_TIME_MAX` for every robot. So the journey's shape at other max times stays tested
  and measurable, and a later max time per journey, or one tied to the chord progressions, is a change in one place.

| # | Assumption | Where |
|---|---|---|
| C1 | Max Intensity takes Development's place beside Journey on row 3; there is no fourth row. | §1.10 |

---

## 8. The revision against the build

Phases 1 to 5 of the plan were built on `feature/melody-journey` before the revision (the task file's Results).

**Stands, untouched by the revision** (code):

- The changes: `src/engine/melodyDevelopment.ts`, with its sweep over the 121 worlds.
- The event's two fields (`sixteenths`, `pitchStep`), the palette step, and the engine's read of a measure's melody
  with its per-robot cache (`entriesOnStep`, `src/engine/audioEngine/melodyRegistry.ts`, moved out of
  `AudioEngine.ts` after review; the least recently read position goes first). The cache is keyed on the position, so it
  does not care how the position was reached.
- The removal of docking pitch drift.
- `Robot.journey`, its three scopes and their keys (`journeyKey`), its radio control, its broadcast, its place in
  the save and the link (`jy`), and its seeding (`'company'` for a seeded company's robots, `'own'` for the rest).

**Replaced:**

- The walk in `src/engine/melodyJourney.ts` (`walkFor`, `extendTo`, `walkAt`, and `journeyPosition`'s rate), with
  `JOURNEY_SWING_MIN` and `JOURNEY_SWING_MAX`. `robotJourney` hands back the bounds in place of the rate.
- `Robot.development` and everything that carries it: the `DEVELOPMENT_*` constants, `seedDevelopment` and the
  `'robot.development'` band, the store's snap and clamp, `applyDevelopment`, `DEVELOPMENT_SCHEMA`, the content
  entry, the slider in row 3, the snapshot field and its broadcast, the save diff, the link's `dv`, and the deal's
  `TOP_LEVEL_FIELDS` row. `journeyMaxIntensity` takes its place at each of those sites (it took two fields until
  §7.4).

**New:** the calm limit handed to the journey; the journey's one max time (§7.4).

**The reference docs** (the plan's Tasks 21 and 22) were written once, against the revised build (§9).

**The plan:** [docs/tasks/MELODY_JOURNEY.md](../tasks/MELODY_JOURNEY.md), Phases 6 to 9 (Tasks 24 to 37), revised
2026-11-17.

---

## 9. As built

Built 2026-11-17 on `feature/melody-journey`, unpushed, for Crawford's PR: the plan's ten phases, Tasks 1 to 38
(Tasks 1 to 20 the first build, 24 to 38 the revision, 21 and 22 the docs; Task 23, the archive, follows the merge).
Each task's commit, suite and mutation run is in the plan's Results, Checkpoints A to I. The reference docs:
[MELODY_SYSTEM.md](../MELODY_SYSTEM.md#the-melody-journey-roadmap-92) (the journey, the changes, the settings),
[AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md#note-resolution-pipeline) (the engine's read),
[ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) (no drift), [COMPANIES.md](../COMPANIES.md) (a company as a section, the
broadcast), [SESSION_STORAGE.md](../SESSION_STORAGE.md) (the save and the link) and
[reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md) (the rows and the band).

### 9.1 What the gates moved

**Nothing.** Every number below is the first cut this spec gave it, kept by Crawford as shipped (2026-11-17, after
Phase 10):

- **The one max time of 16 stands.** He asked whether journey length was hardcoded and should be dynamic; a journey
  has no end, and each pair's time is drawn, 2 to 16 measures, so the pace already varies pair to pair. Only the
  ceiling is one number for every journey, and he kept it. A ceiling per journey (seeded, from the chord
  progressions, from tempo, or a setting) stays the later change in one place §7.4 names.
- **Gate A** (his ear, the journey by hand), **Gate C** (his ear, a full seeded world) and **Checkpoint G's browser
  look** (a drop on a bar line, a company turning together): passed on his listen ("i listened, we're good"), nothing
  moved. A first Gate A on the walk was never recorded; Phases 5 and 9 were built on his word before this one.
- **Gate B** (profile): waived on the same word. It was not run on the pairs; the last measure is the `npm run
  perf:audio` A/B on the walk's build (Checkpoint E: steady play equal on `main` and the branch, the warm-up noisy on
  both). `npm run perf` still stops at a nav button it can no longer find.

### 9.2 Every number as shipped

| What | Value | Where |
|---|---|---|
| Home odds | `JOURNEY_HOME_ODDS` 0.5 × \|p\| | `src/constants/index.ts` |
| Least move of a pair | `JOURNEY_MIN_MOVE` 0.125 of max intensity | same |
| Time lean | `JOURNEY_TIME_LEAN` 0.5 | same |
| Drop odds | `JOURNEY_DROP_ODDS` 0.3, on moves of `JOURNEY_DROP_MIN_MOVE` 0.5 or more | same |
| Top of max intensity | `JOURNEY_INTENSITY_MAX` 16 | same |
| Every journey's max time | `JOURNEY_TIME_MAX` 16 measures; pairs 2 to 16, even, a drop 1 | same |
| Absent settings | `DEFAULT_JOURNEY_MAX_INTENSITY` 0, `DEFAULT_JOURNEY` `'own'` | same |
| The band | `'robot.journeyMaxIntensity': { min: 1, max: 16, lit: 0.7 }`, a Melody family key; no theme or aspect column names it | `src/data/bands/classic.ts` |
| The floor | `ceil(ATTACK_REACH_SHARE` (0.5) `× attack ÷ a sixteenth at the top of the bpm band)`, never under 1 | `developmentFloor` |
| A direction | up when the `${compositionSeed}:development` draw is under 0.5 | `melodyDevelopment.ts` |
| Positions kept per robot | `DEVELOPED_KEPT` 4, the least recently read going first | `src/engine/audioEngine/melodyRegistry.ts` |
| Link keys | `ji` (max intensity), `jy` (Journey); `dv` ignored | `worldDiffCodec.ts` |
| The changes | A1 to A11 of §7.1 as written; B1 to B10 and B15 of §7.3 as written | `melodyDevelopment.ts`, `melodyJourney.ts` |

**Measured** (the plan's Results; throwaway probes, not committed):

- **The journey's shape at max intensity 16** (Checkpoint F, 400 keys × 2,000 pairs at a max time of 16): 16.0 % of
  pairs are drops and 22.3 % head home; a pair takes 7.37 measures on average; a robot is home every 32.9 measures
  (median 26, 90th percentile 62); a quarter of drops land home; the biggest drop is 31 changes (+16 to −15).
- **The draw** (Checkpoint I, the 121 sim worlds, 1,452 robots): 533 of the 745 robots that are not members load
  above 0 (71.5 % against a `lit` of 0.7); 206 of the 288 seeded companies move within 100 measures and 82 stay home.
- **The busy side** (Checkpoint A): half the fleet, 729 of 1,452 robots, has no split and no fill, so its busy side is
  shifts from the first change; the attack floor is most of it (1,009 robots have a floor of 2 or more). At a max
  intensity of 16 the top of most journeys is pitch movement on the home rhythm (B15).

### 9.3 Deviations from the plan, and readings it did not cover

The full list, task by task, is in the plan's Results ("Readings the plan did not cover", per checkpoint). The ones
that change what a reader of this spec would expect:

- **Max time left the robot** (§7.4, Task 38): one max time of 16 for every journey. The pure pieces keep max time as
  an argument; `robotJourney` hands back `JOURNEY_TIME_MAX`.
- **The engine's read draws lazily.** `journeyPosition` draws turning measures one pair at a time as a read needs
  them, memoised per key and max time, each pair drawing one share past itself to see a drop; a read at measure 10,000
  draws about 1,400 shares. The calm limit is read on every step, not cached on the registration.
- **Every step reads the locale store once,** Humanize or not (one existing test's read count went from 0 to 1).
- **A lit robot is never 0:** `seedJourneyMaxIntensity` floors it at 1 when a band reaches below 1.
- **The restore** keeps a finite check on max intensity (it also drops an Infinity, which the store would clamp to
  16) and none on Journey, which the store already drops when it is not a setting.
- **Old keys.** A `development` in a save and a `dv` in a link, from the branch's first build, are ignored; a case for
  each stays.
- **The rounding.** A share's intensity can scale to 0 without heading home (under 1/32 at max intensity 16, under a
  half at 1), so a small max intensity visits home more often than the home odds alone say; a time share whose half
  lands on .5 rounds up.
- **The changes.** An odd `T` subdivides at `floor(T / 2)`, never under the floor; a note a change adds carries a
  placeholder note name (the longest not over its `sixteenths`) and its source's slot and octave.
- **Copy.** Max Intensity and Journey (lore: Drift Reach, Drift Formation, with Solo, Convoy and Fleet Drift) are
  stand-ins for backlog 62's content pass.
- **CLAUDE.md** (Crawford's word, 2026-11-17, at Task 22): "pitch drift" left its reference line for
  `ROBOT_LIFECYCLE.md`. No guardrail changed.

### 9.4 Success criteria (§5.5)

| # | Met by |
|---|---|
| 1 | `AudioEngine.test.ts`, "from one registration, every measure plays its own position: busier, calmer and home all heard"; `melodyJourney.test.ts`, "is 0 at measure 0 for any key and bounds" and "plays each pair intensity on its turning measure" |
| 2 | `AudioEngine.test.ts`, "a robot at a max intensity of 0, or with no bounds at all, plays its home melody at every measure" |
| 3 | `AudioEngine.test.ts`, "members of one Company journey at different max intensities arrive on the same turning measures, each at its own depth"; `melodyJourney.test.ts`, "every turning measure is even but the one before a drop"; `spawnSystem.families.test.ts` over the 121 worlds |
| 4 | `melodyJourney.test.ts`, "plays a pair with a time of 1 on the very next measure" and the worked example (measures 15 and 16) |
| 5 | `melodyJourney.test.ts`, the worked example for a calm limit of 4, and "plays a pair intensity on its turning measure and on no earlier measure of that pair" |
| 6 | By construction (§1.2: a pure function of the home melody, the settings, the seed, the attack, the world key and the measure): "gives the same positions whichever order the measures are read in"; the save and link round trips (`sessionDiff.test.ts`, `worldDiffCodec.test.ts`). Not heard after a reload: Gate C |
| 7 | `robotSystems.test.ts`, "a Recalled robot landing on Docked keeps the same melody array and registers no melody" and the two-dock-cycle case; Checkpoint B's headless probe (19 landings, 0 melody changes) |
| 8 | The plan's Checkpoint Complete |

## 10. Journey dynamics (roadmap 93)

Roadmap [93](../todo/roadmap.md#93-journey-dynamics-a-melody-journey-you-can-hear). Raised 2026-11-18: Crawford heard
the journey and found it "not quite as dynamic as i'd hoped", and asked for suggestions on the algorithm or its
implementation. Six were proposed from the measurements in §10.1; he took all six with notes (his intent, in
[melody-journey.md](../intent/melody-journey.md#journey-dynamics-roadmap-93)). Built 2026-11-18 and 2026-11-19 on
`feature/journey-dynamics`, branched from `feature/melody-journey` so 92's branch stays as it was passed; reviewed with
the `code-review-and-quality` workflow, then passed on his listen ("i'm happy with my listen", 2026-11-19). No task
file: the changes were built straight from the conversation, TDD and one commit a change, and the commits below are
the record. This section supersedes §1 to §9 wherever they differ; [MELODY_SYSTEM.md](../MELODY_SYSTEM.md#the-melody-journey-roadmap-92)
and [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md#note-resolution-pipeline) describe the result.

### 10.1 Why: what the measurements said

A throwaway probe over 300 journey keys × 2,000 measures (not committed), and §9.2's Checkpoint A:

- **The busy side was mostly pitch shifts,** and they cancelled: half the fleet (729 of 1,452 robots) has no split and
  no fill, so its busy side is shifts from the first change, and each shift took a fresh coin flip, so a note moved up
  and back down again.
- **The calm side waited on its floor.** `robotPairs` clamped a calm share at minus the calm limit, so a robot with a
  calm limit of 4 at max intensity 16 reached its floor on any calm share past about a fifth (3.5 ÷ 16) and sat there:
  14.2 % of measures on the floor.
- **Journeys of their own cancel out across a fleet.** Six robots on Own journeys (max intensity 8, calm limit 4)
  summed to a spread (standard deviation) of 7.2 changes; six on one shared journey, 17.5. The freelancers spawned on Own, so the fleet as a whole barely moved.
- **Intensity moved only the notes:** how many and which neighbour. Nothing in how they were played.

### 10.2 What changed

| Change | The rule now | Whose call | Commits |
|---|---|---|---|
| The calm side is scaled, not clamped | A calm share times the **calm range**, the smaller of max intensity and the calm limit; a busy share times max intensity, as before. The calm floor comes only on a full calm share. | Proposed; "sounds good" | `3464bb50` |
| Freelancers on Fleet | Spawn and the roster baseline write `journey: 'fleet'` for a robot outside a seeded company. `DEFAULT_JOURNEY` (an absent field) stays `'own'`. | His: "seeding freelancers into fleet is a great idea" | `82cee22b` |
| Company with no company travels on Fleet | `robotJourney`: Own only when set to Own; Company with a `companyId` on the company's key; anything else on the fleet's. Was Own (§1.9, A15). | His, 2026-11-19 | `6fa40fa9` |
| Shifts hold their direction | A note keeps the way it first went: a note a split or fill added goes on the way that change sent it, any other takes its first shift's draw and holds it. | Proposed; his condition: "would we still get occasional sudden swings?" (yes: drops, octave jumps, a fresh set of directions each trip) | `fd99a51c` |
| Octave jumps | A fifth busy phase, after the fills and before the shifts: one note an octave a change, **up from octave 1, 4 or 5, down from any other**, landing inside the robot's octave range; half the notes that can jump (rounded up), by length then start from alternating ends; each once. | The octaves are his: "only for notes in octaves 1, 4, and 5. the rest should have an octave jump down." The rest is mine | `3bc1c065`, `d69e4802` |
| A different path each trip | A **trip** is one stretch away from home on one side, counted on the shares. Each trip's order draws (`` `${key}:${trip}:order` ``) start each visiting order somewhere else, and the directions are drawn afresh (`` `${seed}:development:${trip}` ``). | His condition: robots in one company keep the same rhythms. They do: the order reads the journey's key and the trip, never the robot. | `b1226427`, `48e44227`, `8a48ceed` |
| The performance follows the level | The **level** is the shares in a straight line across the pair, −1 to 1, moving every measure. Busy: notes up to 40 % shorter (never under the floor, own release kept) and accent lift up to 50 % deeper. Calm: notes up to 40 % quieter. | Proposed; "sounds good". The level is independent of max intensity (his, 2026-11-19); it first scaled with it | `e4f246c9`, `d8f5128f`, `47b216ef` |

The other commits: the help copy (`22693fc7`), two tests the review's mutation run found missing (`655cf567`),
`journeyPosition` deleted for `journeyAt(...).position` (`8715b3c6`), and a sixteenth's seconds read once a step
(`84129cbe`).

### 10.3 Every new number

| What | Value | Where |
|---|---|---|
| The octaves that jump up | 1, 4 and 5 (`OCTAVES_THAT_JUMP_UP`); every other jumps down | `melodyDevelopment.ts` |
| A note with no octave | `DEFAULT_NOTE_OCTAVE` 4, for the engine and the jumps alike | `src/constants/index.ts` |
| How many notes jump | half the notes that can, rounded up | `melodyDevelopment.ts` |
| The order draws a trip | four, in the order first pass, two thresholds (0.5 or more starts on `T` and the longest), octave jumps, shifts; the calm ties take the first | same |
| Calm, quieter | `JOURNEY_CALM_VELOCITY_CUT` 0.4 × \|level\| (about 4.4 dB at a full calm level) | `src/constants/index.ts` |
| Busy, shorter | `JOURNEY_BUSY_LENGTH_CUT` 0.4 × level, never under the robot's floor | same |
| Busy, deeper accents | `JOURNEY_BUSY_ACCENT_GAIN` 0.5 × level, on the lift over an unaccented note | same |

The three performance constants are first cuts, kept on his listen. `JOURNEY_MIN_MOVE` stays 0.125 (0.25 to 0.33 was
offered and not taken).

### 10.4 Measured after the build

- **The calm side** (the same probe, max intensity 16, calm limit 4, no busy path): measures on the calm floor 14.2 %
  → 1.9 %. The calm side is shallower overall: measures whose rhythm moves 20.4 % → 14.3 %, and measures that move
  at all 60.2 % → 55.5 %. Told to Crawford before his listen, with `3464bb50` as the one commit to drop for the old
  depth; it stayed. The probe counts neither the octave jumps nor the performance, which move every measure away
  from home.
- **Cost** ([PERFORMANCE.md](../PERFORMANCE.md#journey-dynamics-roadmap-93-2026-11-19)): the registry's read of a
  step 9.5 → 13.5 µs for twelve robots (about 0.003 % of the main thread at 120 bpm); the audio thread unchanged on a
  quiet machine, four builds × three rounds.

### 10.5 Choices that are mine, not his

First cuts, each in one place if his ear moves it: a jump stays inside the octave range, and a robot with no range
handed in makes none; half the notes that can jump do; a trip is counted on the shares (so every robot on a journey
counts alike) and a robot reads the old trip until it is home or across; the four order draws turn an order rather
than reshuffle it; a busy-shortened note keeps its own release; nothing gets louder than home but an accent, so the
output headroom holds; the level reads no calm limit, so a one-note robot still plays quieter on the calm side.
**Not built:** "calm plays longer". The ties already lengthen notes, and a longer note would overlap the next and hold
a voice.
