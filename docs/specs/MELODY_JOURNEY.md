# Phase Spec: The Melody Journey — a home melody, and a seeded walk that makes it busier and calmer

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

**Where the claims come from.** Two sources, marked where it matters:

- **(code)** read in the repo while writing this spec.
- **(arithmetic)** worked by hand in the session from constants in the code. Not measured.

Every number this spec introduces (the rate band, the journey's swing, the slider's stops) is a first cut for
Crawford's ear at Gate A (§5.4), not a decision.

---

## 0. Scope check

One capability: a melody that develops on a seeded journey. Its parts (the walk, the changes, the engine's read, the
two settings, the removal of drift) cannot be heard or verified apart, so there is no capability map. The home melody
editor is a second capability and is out (§3).

---

## 1. Overview & Claude Explanation

### 1.1 Today

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
- **Journey:** a seeded walk that gives a position for a count of changes.
- **Rate:** changes per measure.

### 1.2 The shape of it

Three pure functions, one on top of the other:

| Function | Question | Reads |
|---|---|---|
| `journeyPosition(key, rate, measure)` | How many changes from home is this journey at this measure? | the journey's key, the rate, the measure |
| `developMelody(home, position, options)` | What is the home melody at that position? | the home melody, the position, the robot's own draws |
| the engine's read | Which events does this robot play on this step of this measure? | the two above |

The melody a robot plays in a measure is worked out from its home melody, its rate, its journey and the measure.
Nothing is remembered, nothing is written to the store as the music moves, and nothing new is saved except the two
settings (§1.9).

### 1.3 The journey

- **A walk in changes.** A journey is a list of turning points on alternating sides of home, each a seeded distance
  from it: for example +5, −3, +8, −4. The walk moves one change at a time towards the current turning point, then
  towards the next. Each crossing passes through 0, so the home melody keeps coming back.
- **Its key decides who shares it.** The walk is an `alea` over one string:

  | Journey setting | Key | Who travels together |
  |---|---|---|
  | Own | `` `${worldKey}:${compositionSeed}:journey` `` | the robot alone |
  | Company | `` `${worldKey}:${companyId}:journey` `` | every member on Company |
  | Fleet | `` `${worldKey}:fleet:journey` `` | every robot on Fleet |

  `worldKey` is `melodyWorldKey(localeId)`, the locale's coordinates, as the rhythm stream uses, so a world reloaded
  from a save or a link travels the same journeys (code).
- **Where a robot is.** The count of changes made by a measure is `floor(rate × measure)`. The robot's position is the
  walk at that count. Measure 0 is position 0: every world starts at home.
- **The turning points.** Each distance is an even draw of a whole number from `JOURNEY_SWING_MIN` to
  `JOURNEY_SWING_MAX` (first cut: 2 to 8). The side of the first turning point is one draw; the sides alternate from
  there.
- **Two robots on one journey at one rate are at the same position on every measure.** At different rates they travel
  the same shape at different speeds, and are not in step.
- **A robot with less range than the journey asks for holds at its limit** on the calm side (§1.6). The busy side has
  no limit (§1.5, shifts).
- **No history.** A rate or journey edit re-reads the walk as if the new setting had held from measure 0, the rule the
  chord settings follow.

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
   phase never runs out, so the busy side has no limit; the journey's swing is what bounds it.

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
- **The floor is one note:** the bar's first, at its home start. A position below the floor plays the floor. So a
  three-note melody has two calm changes, and holds there while the journey goes further out.

### 1.7 The engine plays the measure's melody

- **The contract.** A robot's events on a step are the events of its melody *for that step's measure*:
  `developMelody(home, journeyPosition(key, rate, at.measure), options)`. `stepNotes(at, time)` reads it for
  `at.measure`, so the trigger and the early announcement agree by construction, as they do for the chord (code,
  §1.1).
- **Registration carries the home melody only, as now.** The engine reads the robot's settings when it plays: a pure
  `robotJourney(robot, worldKey, bpmTop)` turns the stored robot into the journey's key, the rate, the floor and the
  seed. `stepNotes` already reads the stored robot on the tick (its release, its Humanize seed; code), so this is no
  new kind of read. A settings edit, a company move, a loaded save and the deal therefore need no engine call: the
  next note reads what the store holds. (The spec first had registration carry a descriptor; the plan dropped it,
  because every site that moves a robot between companies would have had to re-register it.)
- **Nothing is rebuilt per sixteenth.** A robot's developed melody is rebuilt only when its position or its inputs
  change (a position moves at most twice a measure), and the last few positions are kept, since the trigger and the
  early announcement read two measures either side of a bar line. A robot at rate 0 plays its home melody's own
  events.
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
  starts only. Members on one journey at one rate split the same notes on the same measures, each with its own
  neighbour notes.
- **The floor.** The attack rail (`audibleDensityBand`, `src/systems/robotFieldDerivation.ts`) exists because a slow
  attack on short notes never climbs (code). Development obeys the same arithmetic: no change makes a note shorter
  than `ceil(ATTACK_REACH_SHARE × attack ÷ one sixteenth at the top of the theme's bpm band)` sixteenths, and never
  shorter than one. Under Classic (100 BPM at the top, a sixteenth of 0.15 s), attacks up to 0.3 s give a floor of
  1 and a 1.14 s attack gives 4, a quarter note (arithmetic).

### 1.9 The two settings

| Field | Values | At spawn | A company member |
|---|---|---|---|
| `Robot.development?: number` | changes per measure, 0 to 2 in steps of 0.125 | an even draw in the `'robot.development'` band, 0 for the share the band's `lit` leaves out | its founder's |
| `Robot.journey?: 'own' \| 'company' \| 'fleet'` | which journey it travels | `'company'` for a robot spawned into a company, `'own'` for a freelancer | `'company'` |

- **Absent reads as 0 and `'own'`**, so a robot built by hand in a test plays its home melody.
- **The band.** `'robot.development': { min: 0.125, max: 1, lit: 0.7 }` in `src/data/bands/classic.ts`, a first cut:
  seven robots in ten develop, between one change every eight measures and one a measure. It joins the Melody family
  (`MELODY_BAND_KEYS`), so the deal re-derives it with the other four; no aspect column names it in this piece.
- **On Company with no company, a robot travels as Own.** The setting is kept, and takes effect if the robot is put in
  a company.
- **Edits.** `applyDevelopment` and `applyJourney` (`src/systems/robotOptionsActions.ts`) write the field and nothing
  else, as `applyDynamics` does (code): no regeneration and no engine call. The home melody is untouched, and the
  engine reads the new value on the next note (§1.7). The same holds for a move between companies and an Attack edit.
- **Broadcast.** Both join `CompanyOptionsSnapshot`, so the company and All Probes screens set them for every member
  (broadcast, not link, as every other setting).
- **Saved.** Both join `RobotAudioOverrideDiff` and the world link's codec, diffed against the seeded baseline like
  `pitchRepeat`. The home melody is still not saved.

### 1.10 The controls

Composition > Rhythm & Melody gains a third row (`CompositionRhythmMelodySection`,
`src/components/robot/CompositionSections.tsx`):

- **Development**, a `SliderLinear`, 0 to 2 in steps of 0.125.
- **Journey**, a `'radio'` control with three options: Own, Company, Fleet.
- **Journey is dimmed while Development is 0**, its value kept: it does nothing there.
- Every label, option and help text is a content entry (`probe.composition.development`,
  `probe.composition.journey`), read through `labels()` and `options()`. The copy is a stand-in, marked as the other
  stand-ins are, for backlog [62](../todo/backlog.md#62-misc-review-items-a-bucket)'s content pass.

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
│   ├── melodyJourney.ts          (new)  the walk: journeyKey, journeyPosition, robotJourney
│   ├── melodyDevelopment.ts      (new)  the changes: developMelody, the floor
│   ├── melodyGenerator.ts               reRollMelodyPitches and its helpers go
│   ├── harmonySystem.ts                 the palette step resolver
│   ├── regenerateMelody.ts              melodyWorldKey shares the world key with the journey
│   └── AudioEngine.ts                   the per-measure read, sixteenths, pitchStep
├── systems/
│   ├── robotSystems.ts                  the drift goes
│   ├── dockCycles.ts             (deleted)
│   ├── lifecycleSim.ts                  the snapshot's three fields go
│   ├── robotFieldDerivation.ts          deriveMelodyFields draws development
│   ├── spawnSystem.ts                   the two fields at spawn, a member's from its founder
│   ├── aspectDeal.ts                    development in the Melody family's re-derive
│   ├── robotOptionsActions.ts           applyDevelopment, applyJourney
│   └── companyOptions.ts                the two fields in the snapshot
├── stores/localeStore.ts                normalise the two fields
├── types/                               Robot.ts, Company.ts, session.ts
├── data/
│   ├── bands/                           bandKeys.ts, classic.ts, aspects.ts
│   └── robotOptionsConfig.ts            DEVELOPMENT_SCHEMA, JOURNEY_SCHEMA
├── content/copy/probe.ts                the two entries and the three options
├── utils/                               sessionDiff.ts, worldDiffCodec.ts
├── constants/index.ts                   the range, the swing; DOCKED_PITCH_DRIFT_RATIO goes
└── components/
    ├── robot/CompositionSections.tsx    the third row
    ├── company/useCompanyOptions.ts     the broadcast
    └── panels/screen/screens/RobotScreen.tsx

docs/   MELODY_SYSTEM.md, ROBOT_LIFECYCLE.md, AUDIO_SYSTEM.md, COMPANIES.md, SESSION_STORAGE.md,
        reference/ROBOT_DATA_GRID.md (at the end of the build)
```

The list is the files a robot setting touches today, read off `pitchRepeat`'s (code). The plan confirms it.

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
- Melody aspects that move the development band (§7.2).
- Saving a developed melody, or a history of them (roadmap
  [32](../todo/roadmap.md#32-robot-melody-history--configuration-scrubber)).

---

## 4. Code Style & Architecture Conventions

The two new modules are pure and take everything they read as arguments, as `composeRobotMelody` does.

```typescript
/** How many changes from home `key`'s journey is at `measure`, travelling at `rate` changes a measure. Pure. */
export function journeyPosition(key: string, rate: number, measure: number): number {
  return walkAt(key, Math.floor(rate * measure));
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

### 5.1 The walk

- The same key, rate and measure give the same position; a different key gives a different walk.
- Position 0 at measure 0, for any key and rate, and at every measure when the rate is 0.
- Consecutive counts differ by exactly one change.
- Two keys that differ only in scope (`own`, a company id, `fleet`) give different walks; two robots with one key
  and one rate agree at every measure of a long run.

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
- A robot at rate 0 plays its home melody at every measure.
- Family members on Company at one rate have the same starts and lengths at every measure of a run.
- Spawn: a member's `development` is its founder's; a member's `journey` is `'company'`, a freelancer's `'own'`.
- A save, edit, wipe and load brings back both settings; so does a world link.
- The lifecycle's replay still matches the live tick, measure by measure, without the drift.
- Each new gate is mutation-checked: break the code, see a test fail.

### 5.4 Gates

- **Gate A (Crawford's ear).** After the walk, the changes and the engine's read are in, with the two settings
  editable but before the band is tuned: he listens to one robot going busier and calmer, then a company on one
  journey. The numbers of §1.3 and §1.9 and the order rules of §1.5 and §1.6 are his to move here.
- **Gate B (profile).** `npm run perf` before and after, same session: the developed read adds no long task to the
  baseline table in [PERFORMANCE.md](../PERFORMANCE.md).
- **Gate C (Crawford's ear).** A full world on the seeded band, on desktop and on the phone.

### 5.5 Success criteria

1. A robot with Development above 0 plays its home melody at measure 0, busier and calmer versions of it as its
   journey moves, and its home melody again at each crossing.
2. A robot at 0 sounds exactly as it does today.
3. A company on one journey at one rate changes on the same measures.
4. The same world, settings and measure always give the same notes, after a reload, a link or a power cycle.
5. No melody changes at a docking.
6. `npm test`, `npm run lint`, `npm run build:types` and `npm run build` pass.

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
| A12 | The turning points alternate sides, 2 to 8 changes from home. | §1.3 |
| A13 | The slider stops every 0.125, so the slowest moving rate is one change every eight measures. | §1.9 |
| A14 | The band: 70 % of robots develop, from 0.125 to 1. | §1.9 |
| A15 | A robot on Company with no company travels as Own. | §1.9 |
| A16 | Journey is dimmed while Development is 0. | §1.10 |
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
