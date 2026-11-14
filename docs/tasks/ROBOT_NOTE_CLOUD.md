# Implementation Plan: The Note Cloud

Source spec: [docs/specs/ROBOT_NOTE_CLOUD.md](../specs/ROBOT_NOTE_CLOUD.md). Source intent:
[docs/intent/robot-note-cloud.md](../intent/robot-note-cloud.md). Backlog
[79](../todo/backlog.md#79-robots-move-in-time-with-their-own-melody), plan.md Stage 4. The look's reference is the
branch `spike/note-pulse` at `?trail=all` (never merges; no code is carried over without its test).

**Status:** branch one complete; Checkpoint: Complete passed 2026-11-13. Phase 1 (Tasks 1 to 3) built 2026-11-12; Checkpoint: Events awaits Crawford's look at the bob
and his review. Phase 2 (Tasks 4 to 9) built 2026-11-12; Checkpoint: Pure awaits his review. Phase 3 (Tasks 10 to
16) built 2026-11-12; Checkpoint: Cloud's checks pass and its look awaits him (hard reload first: `workLoop.ts`
changed). Phase 4 (Tasks 18 to 25) built 2026-11-13 on Crawford's word ("implement phase 4"), ahead of Task 17 and
Gate 1, which are still to run; Checkpoint: Attention's checks pass. Phase 5 (Tasks 27 and 28) built 2026-11-13 on
Crawford's word, ahead of Gates 1 and 2; Checkpoint: Avatar's checks pass, and Gate 3 passed 2026-11-13 with the
cloud spilling past the avatar's box. Task 17 ran 2026-11-13: main-thread time +17.6 % with the cloud on (the spike's
+19 %), over the working 10 %. Crawford's answer was the battery bands (Tasks 17a to 17d, built and run the same day):
+3.7 %, inside it; he then re-drew the bands (Task 17e, 60% on, not re-measured). Gate 1 passed 2026-11-13 ("no,
that's ok" to a re-run) and Gate 2 passed the same day on his word ("i'm happy with gate 2, i believe"). Task 26 (his
guardrail sentence) and Phase 6 (Tasks 29 and 30, the record) done 2026-11-13: **branch one's Tasks 1 to 30 are all
built.** Checkpoint: Complete passed 2026-11-13: the looks and reviews the earlier checkpoints waited on were
answered there, and the five-axis review approved (four fixes). Branch one merged (PR #637). **Phase 7 (Tasks 31 to
36) built 2026-11-13** on `feature/note-cloud-early-notes`, one commit each. Gate 4's checks pass, and its look and
cost answer wait on Crawford. Task 37 (the archive) follows the merge.

How the boxes read: a task's own box is ticked when it was built and committed. The acceptance and verification
boxes inside Tasks 1 to 16, 18 to 25, 27 and 28 were left as written while building; each is pinned by the task's
tests (its Proof line), and every checkpoint's full suite passed. From Task 17 on they were ticked as built. The
checkpoint boxes still open are looks and reviews Crawford never went through item by item; each is marked where it
stands.

## Overview

A robot's melody is drawn as a small piano roll around it: the engine tells listeners about each note it triggers
(`src/engine/noteEvents.ts`), a per-robot model decides what is drawn (`src/components/robot/notes/`), and one hook
per robot places plain bars on two belts inside the robot's mover and moves them with one registered world timeline.
Attention (dim, strength, waking, the marker) sits on top, then the same cloud on the desk's detail avatar.

Thirty-seven tasks in seven phases, across two branches as the spec orders them (§0, §6):

- **Branch one, `feature/note-cloud` (Parts 0 to D), Tasks 1 to 30.** The bob's cycle and the note events (Tasks 1
  to 3); what a note becomes, as pure functions (4 to 9); the cloud on a world robot (10 to 16) and its cost run,
  **Gate 1** (17); attention (18 to 25), **Gate 2**, and the guardrail sentence (26); the avatar (27 to 28),
  **Gate 3**; the record (29 to 30).
- **Branch two, `feature/note-cloud-early-notes` (Part E), Tasks 31 to 37**, off `main` after branch one merges:
  the engine announces notes early, **Gate 4**, and the archive.

Every behaviour task is RED first, one commit per task, with the mutation named in the task run against the new test
before the commit. The build stops and reports at each gate and each checkpoint. After any task that edits
`src/engine` or `src/systems`, Crawford hard-reloads (Ctrl+Shift+R) any dev page he has open before he looks or
listens: an HMR swap has split the audio graph before.

## Architecture Decisions

- **The file names are the spec's (§2), now pinned.** One addition: `useStageFit.ts` gains `getStageScale()`
  (Task 11), because the 4-pixel floor needs the stage's scale without a layout read.
- **One engine listener per robot, owned by the model (spec §1.8 "the same notes").** The world's cloud and the
  avatar's must drop the same repeats and share one range, and a run can only be counted once per note. So
  `noteCloudModel.ts` registers the one `onRobotNote` listener for a robot when its first cloud subscribes
  (`subscribeDrawnNotes`), passes each event through `nextDrawnNote` once, and hands the result to every subscribed
  cloud. The spec's `nextDrawnNote(robotId, event)` stays as the tested rule; clouds never call it themselves.
- **Where the model is cleared (spec §4, "the plan pins where").** A world robot's body mounts once and is never
  re-mounted (twelve fixed robots; a row switch has been a write, not a re-mount, since Phase 53). So the
  world-context cloud clears its robot's model, and sleeps its woken entry, in an unmount effect keyed on the robot
  id alone. An effect re-run (a scale edit) and the avatar's mount and unmount clear nothing.
- **The layers are found, not passed.** `Robot.tsx`'s mover and `AvatarGem`'s box both carry `data-note-cloud` and
  render one `NoteCloudLayer` before the `<svg>` and one after. The hook, called in `RobotBody` (inside the svg),
  finds them with `root.closest('[data-note-cloud]')`. The phone band's gem has no such box, so its hook finds
  nothing and registers nothing (spec §1.8 default).
- **Pixels per unit is a getter, read as a number.** The hook takes `pxPerUnit: () => number`. In the world it is
  `getStageScale()` times the row's scale (1 or `BACK_LAYER_SCALE`, from `robot.layer`); in the avatar it is the fit
  `AvatarGem` measures (Task 27). The hook compares it on a note's arrival (a number compare) and re-derives the
  thickness and the rows only when it has changed; notes already placed keep theirs. No layout read per note.
- **The belt tween is the note's whole life (spec §1.6).** One linear, repeating tween per robot per context moves
  both belts, registered as `note-belt-<context>-<robotId>` under `'world'` (cast as `useOrbiterMotion` casts its
  tween). Its `onUpdate` settles each live note on its row, sets the white copy's opacity from the belt's own time,
  and removes a note that has crossed. Paused by its owner while the robot has no live notes; `timelineMap` already
  leaves an owner-paused timeline paused across a power cycle. No `gsap.delayedCall` and no tween per note.
- **The re-size fade is the second registered timeline:** `note-resize-<context>-<robotId>`, `'world'`, a tween of
  both wrappers' opacity out and back round the rebuild (Task 24). Planned as `note-strength-…`, the battery fade's
  tween, which Task 24 reused; the battery fade went at Gate 1 and the strength ease after it (spec §8).
- **Until Task 24, a body-scale edit rebuilds the roll at once** (the hook's effect re-runs and drops the notes in
  flight). Task 24 puts the fade round it. Gate 2 is where Crawford looks at it, after Task 24.
- **Constants land with their first user,** all named `NOTE_…` in `src/constants/index.ts` at the spec's §7.2 A1
  values; no task adds a constant nothing reads yet.
- **Part E: one place turns a step into notes, and one place answers "may this robot trigger now?"** (spec §1.9).
  Both are taken out of `processMelodyStep` and `triggerWithCap` first, with the existing tests untouched and green
  (Tasks 32, 33), and only then does the announcement call them (Task 34). While a preview is asked for, the
  trigger emits nothing: every event comes from an announcement.
- **Resolves spec §7.2 A12:** the Click Track's notes are events like any other; no code names it.

## Dependency Graph

```
Task 1 (bob cycle)      Task 2 (registry) ── Task 3 (the emit)
                             │
        ┌────────────────────┴───────────────┐
Task 4 (row, layer)                    Task 7 (roll box, bar)
Task 5 (repeat rule)                   Task 8 (rows)
Task 6 (one listener, fan-out)         Task 9 (colour, mask)
        └────────────────────┬───────────────┘
   Task 10 (?notes=off)   Task 11 (stage scale)   Task 12 (the layers in the mover)
        └────────────────────┼───────────────────────┘
                 Task 13 (a note places a bar)
                             │
          Task 14 (the belt) ── Task 15 (white as it sounds)      Task 16 (the back row; needs 12)
                             │
                 Task 17 (cost run)  ══ GATE 1 ══
                             │
Task 18 (noteStrength)   Task 19 (robotAttention) ── Task 20 (pointer) ── Task 25 (the marker)
        │                       │
        │                Task 21 (dim on the singled-out robot)
        └── Task 22 (strength timeline) ── Task 23 (battery, wake, sleep) ── Task 24 (re-size under a fade)
                             │
                      ══ GATE 2 ══ ── Task 26 (guardrail sentence)
                             │
          Task 27 (the avatar's box and fit) ── Task 28 (the avatar's cloud)  ══ GATE 3 ══
                             │
          Task 29 (docs) ── Task 30 (the record)  →  PR one
                             │ (merged)
Task 31 (preview asked) ── Task 32 (a step's notes, one place) ── Task 33 (the gates, one place)
                             │
          Task 34 (the announcement) ── Task 35 (the cloud asks; the mask)
                             │
          Task 36 (forecast and cost runs, docs)  ══ GATE 4 ══  →  PR two  →  Task 37 (archive)
```

## Task List

### Phase 1: The bob and the note events (Parts 0 and A)

- [x] **Task 1: `constants/index.ts` — the working bob's cycle doubles**

  **Description:** `BOB_CYCLE_SECONDS` 1.2 to 2.4 (spec §1.11). `buildJobTimeline.ts` already fits whole cycles to
  the job; its comment "≥ 5: jobs last 6–10 s" is corrected to the counts the test pins. ANIMATION_SYSTEM.md's bob
  paragraph says 2.4 in the same commit. `workLoop.ts`'s waiting bob is timed by `WAIT_RETRY_SECONDS` and is not touched.

  **Proof:** RED test — `src/animation/jobMoves/buildJobTimeline.test.ts`: the constant is 2.4, and the two
  existing cases that pin 1.2 (the value, and the units-a-second arithmetic) are rewritten for 2.4.

  **Acceptance criteria:**
  - [ ] `BOB_CYCLE_SECONDS` is 2.4; `BOB_PX` stays 3.
  - [ ] A 6 s and a 10 s job bob in whole cycles (`Math.round(duration / 2.4)` of them, pinned as numbers in the
        test) and end where they started.
  - [ ] Mutation: 2.4 back to 1.2 fails the value case and the cycle-count case.

  **Verification:**
  - [ ] `npx vitest run src/animation/jobMoves src/systems/workLoop.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/constants/index.ts`, `src/animation/jobMoves/buildJobTimeline.ts`,
  `src/animation/jobMoves/buildJobTimeline.test.ts`, `docs/ANIMATION_SYSTEM.md`

  **Estimated scope:** XS

- [x] **Task 2: `noteEvents.ts` — the listener registry**

  **Description:** New `src/engine/noteEvents.ts` exactly as spec §4 gives it: `RobotNoteEvent`, `onRobotNote`,
  `hasRobotNoteListener`, `emitRobotNote`. It imports nothing. No caller yet.

  **Proof:** RED test — `src/engine/noteEvents.test.ts` (new).

  **Acceptance criteria:**
  - [ ] A listener hears its own robot's events and no other robot's; two listeners on one robot both hear.
  - [ ] The unsubscribe stops it; `hasRobotNoteListener` is false once the last listener has gone, true before.
  - [ ] A throwing listener does not stop the next listener, and nothing is thrown to the caller of `emitRobotNote`.
  - [ ] Mutation: dropping the try/catch fails the throwing case; keying listeners globally fails the other-robot case.

  **Verification:**
  - [ ] `npx vitest run src/engine/noteEvents.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/noteEvents.ts`, `src/engine/noteEvents.test.ts`

  **Estimated scope:** S

- [x] **Task 3: `AudioEngine.ts` — a triggered note tells its listeners**

  **Description:** In `triggerWithCap`'s success path, after `synth.triggerAttackRelease` and
  `standingBy.recordNoteEnd`, emit one event when `hasRobotNoteListener(robotId)` (spec §1.2, §4's snippet).
  `duration` is the note's end (what `scheduleVoiceRelease` returns) less `scheduleTime`; `at` is `scheduleTime`;
  `lead` is `max(0, scheduleTime − Tone.now())` plus a new private `outputLatencySeconds()` (the raw context's
  `outputLatency`, else `baseLatency`, else 0, capped at `NOTE_LATENCY_MAX_SECONDS` = 0.5; spec §7.2 A11). No gate
  is changed.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`, a new `describe` on the existing Tone mocks.

  **Acceptance criteria:**
  - [ ] A triggered note emits one event with the pitch, the sounding length in seconds (a written `'8n'` and a
        seconds number both), its scheduled start, and a lead of at least zero that includes the output latency.
  - [ ] A note refused by Mute, by another robot's Solo, by the dock, by the budget (standing by), by the polyphony
        cap, by a missing voice or by a bad note string emits nothing.
  - [ ] With no listener, no event is built (the latency is not read).
  - [ ] A throwing listener leaves `triggerWithCap` returning true and the synth triggered.
  - [ ] Mutation: moving the emit above the polyphony check fails the cap case; dropping the `hasRobotNoteListener`
        guard fails the no-listener case.

  **Verification:**
  - [ ] `npx vitest run src/engine/noteEvents.test.ts src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/constants/index.ts`

  **Estimated scope:** S

### Checkpoint: Events
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (any existing, unrelated failure named). 2026-11-12:
      356 files, 13,988 passed, 2 skipped (skipped before this branch), 0 failed; lint has the 4 old warnings only.
- [x] Nothing is drawn yet and nothing is heard differently: the engine emits only when something listens, and
      nothing does.
- [ ] Crawford looks at a working robot's bob at ±3 on 2.4 s (Task 1's Look; a hard reload first). Not looked at
      on its own; Gate 2's word covers the world as a whole.
- [ ] Reviewed with Crawford before Phase 2. Not done before Phase 2 was built.

---

### Phase 2: What a note becomes (Part B, pure)

- [x] **Task 4: `noteCloudModel.ts` — a note's row and its layer**

  **Description:** New `src/components/robot/notes/noteCloudModel.ts`: `DrawnNote` and `nextDrawnNote(robotId,
  event)` (spec §4), for now without the repeat rule. The row is the pitch within the robot's own range so far, at
  least `NOTE_RANGE_MIN_SEMITONES` (12), centred on the middle of the lowest and highest pitch played (spec §1.3,
  §7.2 A3). The layer is `front` for C, D, E, F♯, G♯, A♯ and `behind` for the other six, flats included. A note
  string that does not parse draws at mid-height, behind.

  **Proof:** RED test — `src/components/robot/notes/noteCloudModel.test.ts` (new).

  **Acceptance criteria:**
  - [ ] The first note's row is 0; a second note an octave up sits at 0.5 and moves nothing already returned.
  - [ ] A pitch above the range so far widens the range for the notes after it; rows never leave −0.5 to 0.5.
  - [ ] `C4`, `D4`, `E4`, `F#4`, `G#4`, `A#4`, `Bb4` are `front`; `Db4`, `F4`, `G4`, `A4`, `B4`, `Eb4` are `behind`.
  - [ ] Two robots' models do not share a range.
  - [ ] Mutation: a range floor of 0 fails the octave case; `midi % 2 === 1` fails the layer case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteCloudModel.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (the event type).

  **Files:** `src/components/robot/notes/noteCloudModel.ts`, `src/components/robot/notes/noteCloudModel.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 5: `noteCloudModel.ts` — a repeated note is not drawn twice**

  **Description:** `nextDrawnNote` returns null for the even-numbered notes of a run (spec §1.3). A run is the same
  pitch and the same sounding length (equal to the millisecond, §7.2 A2) with no rest between; a rest is a gap of
  more than `NOTE_REST_MIN_SECONDS` (0.05) between the earlier note's `at + duration` and the later note's `at`
  (§7.2 A4). The run is counted on every note, drawn or not.

  **Proof:** RED test — `src/components/robot/notes/noteCloudModel.test.ts`.

  **Acceptance criteria:**
  - [ ] Two identical notes that run straight into each other draw the first only; a run of five draws the first,
        third and fifth.
  - [ ] The same pitch at a different length is drawn and starts a new run.
  - [ ] An identical note after a rest is drawn and starts a new run; two notes 40 ms apart are still a run.
  - [ ] Two robots' models do not share a run.
  - [ ] Mutation: comparing pitch only fails the length case; ignoring `at` fails the rest case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteCloudModel.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/robot/notes/noteCloudModel.ts`, `src/components/robot/notes/noteCloudModel.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 6: `noteCloudModel.ts` — one engine listener per robot, shared by its clouds**

  **Description:** `subscribeDrawnNotes(robotId, listener)` and `clearNoteCloudModel(robotId)` (Architecture
  Decisions). The first subscriber registers one `onRobotNote` listener; each event goes through `nextDrawnNote`
  once and every subscriber gets the same `DrawnNote` with its event (nothing for a dropped repeat). The last
  unsubscribe removes the engine listener and keeps the run and the range; `clearNoteCloudModel` forgets them.

  **As built:** also a throwing subscriber is reported and does not cost the next its note (the rule noteEvents
  keeps), tested and mutation-checked.

  **Proof:** RED test — `src/components/robot/notes/noteCloudModel.test.ts`, driving `emitRobotNote`.

  **Acceptance criteria:**
  - [ ] Two subscribers on one robot each get the same row and layer for one event, and a repeat reaches neither.
  - [ ] With two subscribers a run of four still draws the first and third (the run is counted once per note).
  - [ ] `hasRobotNoteListener` is true while any subscriber remains and false after the last leaves.
  - [ ] A subscriber that leaves and returns finds the range kept; after `clearNoteCloudModel` the next note sits at
        mid-height again.
  - [ ] Mutation: one engine listener per subscriber fails the run-of-four case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteCloudModel.test.ts src/engine/noteEvents.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/robot/notes/noteCloudModel.ts`, `src/components/robot/notes/noteCloudModel.test.ts`

  **Estimated scope:** S

- [x] **Task 7: `noteRows.ts` — the roll's box and a bar's size**

  **Description:** New `src/components/robot/notes/noteRows.ts`, pure geometry (spec §1.3): `rollBox(gem, scale)`,
  the box the backing, Mids, Top and orbiters fill, scaled about the gem canvas centre as the body is, times
  `NOTE_ROLL_SIZE` (2.5); `noteThickness(rollHeight, pxPerUnit)`, a `NOTE_HEIGHT_SHARE` (1/14) of the height and
  never under `NOTE_MIN_PX` (4) on screen; `noteLength(seconds, rollWidth, thickness)`, the length at the roll's
  speed (`NOTE_CROSSING_SECONDS`, 5) between the thickness and `NOTE_MAX_LENGTH_SHARE` (0.8) of the width.

  **Proof:** RED test — `src/components/robot/notes/noteRows.test.ts` (new), on a fixture gem from `getRobotGem`.

  **Acceptance criteria:**
  - [ ] The box is centred on the canvas centre and is 2.5 times the parts' box; a body scale of 1.69 grows it by
        1.69.
  - [ ] For a roll 140 units high the thickness is 10 units at 1 pixel per unit, and 16 units (4 pixels) at 0.25.
  - [ ] A 0.5 s note is a tenth of the roll's width; a very short note is as long as it is thick; a 10 s note is
        0.8 of the width.
  - [ ] Mutation: dropping the floor fails the 0.25 case; dropping the upper clamp fails the 10 s case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteRows.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/robot/notes/noteRows.ts`, `src/components/robot/notes/noteRows.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 8: `noteRows.ts` — rows that run straight and fan at the edges**

  **Description:** `noteRowGeometry(box, thickness)` returns the room the fan needs above and below the box (`pad`)
  and two functions of a row (−0.5 to 0.5) and a place across the roll (0 left to 1 right): the row's height and
  its tilt in degrees (spec §1.3). Straight, with a wave of `NOTE_WAVE` (0.015) of the height, until
  `NOTE_EDGE_START` (0.55) of the way from the centre to an edge; past it the spread grows by up to `NOTE_FAN` (0.6)
  and the wave to `NOTE_WAVE_EDGE_GAIN` (5) times, `NOTE_WAVE_COUNT` (1.5) waves across. The spike's curve is the
  picture.

  **As built (for Gate 2's look):** the spike tilted every bar to its row's slope, and the middle's wave alone gives
  up to about 8° on a square robot's roll (0.015 × 2π × 1.5 ≈ 0.14), which this task's "within a degree of level at
  the centre" rules out. So the tilt is weighted by the fan's own weight (the square of how far past
  `NOTE_EDGE_START`): level through the straight middle, easing in to the row's full slope at the edge, never a pop.
  "Now" (`NOTE_NOW`, 0.225) sits where that easing begins. The spike also let the fan grow to 1.69 beyond the roll,
  outside its own `pad`; here it holds its edge value beyond the roll. `y` is a bar's top edge in the layer (the roll
  grown by `pad` each way); the slope is analytic, checked in the test against the curve.

  **Proof:** RED test — `src/components/robot/notes/noteRows.test.ts`.

  **Acceptance criteria:**
  - [ ] At the centre a row is within the wave's amplitude of its pitch height, and the top row is above the bottom.
  - [ ] At either edge the top and bottom rows are 1.6 times as far apart as at the centre, give or take the wave.
  - [ ] The spread at 0.2 across equals the spread at 0.8 across (left as right).
  - [ ] The tilt is within a degree of level at the centre and follows the row's slope past the fan's start.
  - [ ] Mutation: `NOTE_FAN` read as 0 fails the edge case; an `edge` that ignores the left half fails the symmetry case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteRows.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/components/robot/notes/noteRows.ts`, `src/components/robot/notes/noteRows.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 9: `noteRows.ts` — a note's colour and the layer's mask**

  **Description:** `noteColor(identityColor, companyColor)`: the company's colour, else the identity hue plus 180°
  at S 100 and L 70 (`hexToHsl`, `hslToString` from `src/utils/colorUtils.ts`). `noteMask(knownAheadSeconds)`: the
  `linear-gradient` the wrappers wear (spec §1.4, §1.7): transparent at the left edge, `var(--note-dim, 1)` from
  `NOTE_DIM_FROM` (30%) to `NOTE_BRIGHT_BAND` (14%) left of "now", full at "now" (`NOTE_NOW`, 22.5% in from the
  right), and transparent again where a note is first known (the time ahead as travel, never past the right edge).

  **Proof:** RED test — `src/components/robot/notes/noteRows.test.ts`: the function's stops as numbers (the test
  parses what the function returns; it reads no stylesheet).

  **Acceptance criteria:**
  - [ ] A company colour is returned as it is; a freelancer at hue 30 gets hue 210, S 100, L 70; hue 300 wraps to 120.
  - [ ] The mask's stops are at 0, 30, 63.5 and 77.5 percent, then 77.5 plus the known-ahead travel: 81.5 for 0.2 s.
  - [ ] A known-ahead of 2 s ends the mask at 100, not past it.
  - [ ] Mutation: `hue + 90` fails the complement case; an unclamped last stop fails the 2 s case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteRows.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/components/robot/notes/noteRows.ts`, `src/components/robot/notes/noteRows.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** S

### Checkpoint: Pure
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. 2026-11-12: 358 files, 14,067 passed, 2 skipped
      (skipped before this branch), 0 failed; lint has the 4 old warnings only; `npm run build` clean.
- [x] Everything that decides what is drawn is a tested pure function, and nothing is drawn yet: nothing in `src`
      imports `src/components/robot/notes/`.
- [ ] Reviewed with Crawford before Phase 3. Not done before Phase 3 was built.

---

### Phase 3: The cloud on a world robot (Part B, mounted)

- [x] **Task 10: `debugParams.ts` — `?notes=off`**

  **Description:** `parseNotesParam(raw)` and `isNoteCloudEnabled()`, read once at load beside `?debug` and
  `?latency=` (spec §1.6, §7.2 A8). Only `off`, `0` and `false` turn the cloud off; absent means on. Checked first:
  nothing else in `src` reads a `notes` param.

  **Proof:** RED test — `src/utils/debugParams.test.ts`.

  **Acceptance criteria:**
  - [ ] Absent and an empty value are on; `off`, `OFF`, `0` and `false` are off; any other value is on.
  - [ ] Mutation: treating a bare `?notes` as off fails the empty case.

  **Verification:**
  - [ ] `npx vitest run src/utils/debugParams.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/debugParams.ts`, `src/utils/debugParams.test.ts`

  **Estimated scope:** XS

- [x] **Task 11: `useStageFit.ts` — the stage's scale as a number anyone can read**

  **Description:** `useStageFit` already works the stage's scale out on every resize and writes `--stage-scale`. It
  also keeps the number in module state, and `getStageScale()` returns it (1 until the first resize). No
  subscription: the cloud reads it when a note arrives (Architecture Decisions).

  **Proof:** RED test — `src/components/panels/screen/worldView/useStageFit.test.ts`, driving a resize the way
  the file's existing cases do.

  **Acceptance criteria:**
  - [ ] `getStageScale()` is 1 before any resize and the fitted scale after one; a zero-sided box changes nothing.
  - [ ] Mutation: returning the constant 1 fails the after-resize case.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/useStageFit.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/worldView/useStageFit.ts`,
  `src/components/panels/screen/worldView/useStageFit.test.ts`

  **Estimated scope:** XS

- [x] **Task 12: `NoteCloudLayers.tsx`, `Robot.tsx` — the two layers in the mover**

  **Description:** New `NoteCloudLayer({ side })`: a wrapper `div.note-layer.note-layer--behind|front`,
  `aria-hidden`, holding an empty `div.note-layer__belt`; it renders nothing when `isNoteCloudEnabled()` is false or
  `prefersReducedMotion()` is true. `Robot.tsx` puts `data-note-cloud` on the mover and renders one layer before the
  `<svg>` and one after (spec §1.5). New `NoteCloud.css`: the wrappers are absolutely placed, `pointer-events:
  none`, `display: none` until the hook shows them, z-index −1 and 1; the belt is absolutely placed at the origin.
  React renders no children in a belt and never reconciles what the hook appends there.

  **As built:** the Phase 53 mover-structure case counted the mover's children (one svg); it now asks for exactly
  one svg child, since the layers sit beside it. The mutations also dropped the reduced-motion check (killed).

  **Proof:** RED test — `src/components/robot/Robot.test.tsx`. The CSS is seen at Checkpoint: Cloud.

  **Acceptance criteria:**
  - [ ] The mover holds a note layer before its `<svg>` and one after it, both `aria-hidden`, each with a belt.
  - [ ] With reduced motion, and with `?notes=off`, the mover holds no note layer.
  - [ ] The robot still takes a click (the existing click cases pass unmodified).
  - [ ] Mutation: rendering both layers after the `<svg>` fails the order case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/Robot.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/components/robot/notes/NoteCloudLayers.tsx`, `src/components/robot/notes/NoteCloud.css`,
  `src/components/robot/Robot.tsx`, `src/components/robot/Robot.test.tsx`

  **Estimated scope:** M

- [x] **Task 13: `useNoteCloud.ts` — a triggered note places a bar**

  **Description:** New hook beside `useOrbiterMotion` (options `root`, `robotId`, `context`, `enabled`, plus `gem`,
  `scale`, `color`, `pxPerUnit`), called from `RobotBody` for `motion === 'world'`. It finds the layers
  (`closest('[data-note-cloud]')`), sizes the two wrappers to the roll's box plus the fan's pad with the mask from
  `noteMask` (0.2 s known ahead until Part E), subscribes with `subscribeDrawnNotes`, and for each drawn note
  appends one bar (a `div` with its white copy inside) to the front or behind belt: its length and thickness from
  `noteRows`, its colour read from a ref so a colour edit colours only the notes placed after it, its left end
  `lead` seconds of travel right of "now". A note is dropped, not placed, while `document.hidden` or the world is
  not `running` (`getWorldState`). A gem or body-scale change re-runs the effect and rebuilds the roll at once
  (Task 24 adds the fade). The world-context mount clears the robot's model on unmount (Architecture Decisions).
  The belts do not move yet (Task 14).

  **As built:** the stopgap's 0.2 s is a constant, `NOTE_KNOWN_AHEAD_SECONDS`, which Part E replaces. A wrapper is
  the roll's box grown by the rows' `pad` above and below (not to the sides). The bar's row height and tilt are read
  at its middle. Beyond the plan's cases, the tests also pin the 4-pixel floor, the wrappers' box, a world that is
  `cold`, a box with no layers (no listener), and that an avatar's unmount and a scale re-run clear no model; twelve
  mutants, all killed.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx` (new), a harness that renders a
  `data-note-cloud` box with two layers and a `g` root, real GSAP, events through `emitRobotNote`;
  `src/components/robot/RobotBody.test.tsx` for the wiring.

  **Acceptance criteria:**
  - [ ] An event for `C4` places one bar in the front layer in the given colour; `F4` goes behind; another robot's
        event places none.
  - [ ] A repeat places none. A hidden document, a world that is not running, `enabled: false`, reduced motion and
        `?notes=off` each place none (and the last three register no listener).
  - [ ] A longer `lead` places the bar further right; a colour change re-renders without removing the bar already
        placed, and the next bar wears the new colour.
  - [ ] Unmount removes every bar and leaves `hasRobotNoteListener` false; a world body's unmount clears its model.
  - [ ] A world `RobotBody` calls the hook enabled; a card (no `motion`) does not listen.
  - [ ] Mutation: skipping the `document.hidden` check fails its case; colour as an effect dependency fails the
        colour-change case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes src/components/robot/RobotBody.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 3, 6, 8, 9, 11, 12.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`,
  `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`

  **Estimated scope:** M

- [x] **Task 14: `useNoteCloud.ts` — the belt carries the notes across and takes them off**

  **Description:** One linear, repeating tween per robot moves both belts at the roll's speed, registered as
  `note-belt-<context>-<robotId>` under `'world'` and killed on unmount (spec §1.6). Its `onUpdate` makes one pass
  over the live notes: each is settled on its row and tilt for where it now is (`noteRowGeometry`), quantised to
  `NOTE_QUANTUM_UNITS` (0.25) and `NOTE_QUANTUM_DEGREES` (0.25) and written only when the quantised value changed
  (§7.2 A7); a note whose right end has passed the roll's left edge is removed. When the tween wraps, every live
  note is re-based so nothing jumps. With no live notes the wrappers are `display: none`, the belts carry no
  `will-change`, and the tween is paused; the first note shows them and plays it.

  **As built:** the tween runs on a plain clock object, and the pass writes both belts' `translate` from its
  playhead. A note's place is kept in unwrapped belt units, so its x on the belt changes only at a wrap (written to
  four decimals); only its row height and tilt are quantised. The playhead is kept from the tween's last render, so
  placing a note reads no tween time (the global GSAP mock's tween has none). Placement goes through the same
  quantised writer, so Task 13's row case checks y to within half a quantum. A `writeBelts(0)` at mount survived its
  mutant (the cleanup already clears the belts before a rebuild) and was removed as dead code.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`, advancing the registered timeline's
  time by hand.

  **Acceptance criteria:**
  - [ ] After a note, `getTimeline('note-belt-world-<id>')` exists with the `'world'` scope and is playing.
  - [ ] Advanced past the note's crossing, its bar is gone, the wrappers are `display: none`, the belts have no
        `will-change`, and the tween is paused.
  - [ ] Through the straight middle of the roll, two successive small advances write a bar's transform at most once.
  - [ ] `pauseWorldTimelines()` with a note mid-flight pauses the belt and `resumeWorldTimelines()` plays it; an
        idle belt stays paused across the pair.
  - [ ] Unmount kills the timeline (`getTimeline` is undefined).
  - [ ] Mutation: registering under `'ui'` fails the scope case; writing every frame fails the write-count case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/useNoteCloud.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 13.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`,
  `src/constants/index.ts`

  **Estimated scope:** M

- [x] **Task 15: `useNoteCloud.ts` — a note is white while it sounds**

  **Description:** The same per-frame pass sets each note's white copy (`NOTE_HOT_COLOR`, `#fffbe6`) from the belt's
  own time: clear until the note sounds, opaque over `NOTE_HOT_IN_SECONDS` (0.05), held for the note's length, clear
  again over `NOTE_COOL_SECONDS` (0.25); written only on a change (spec §1.4, §1.6). No tween and no timer per note.

  **As built:** the level is written to two decimals. A note shorter than the rise never reaches full white and
  still cools to clear (tested).

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`.

  **Acceptance criteria:**
  - [ ] Before `lead` has passed the white copy is clear; just after, it is opaque; at `lead` plus the note's length
        plus 0.25 s it is clear.
  - [ ] Placing a note creates no GSAP tween and no delayed call (the global timeline's child count is unchanged).
  - [ ] Mutation: timing the flash from the placement, not from `lead`, fails the first case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/useNoteCloud.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 14.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 16: `workLoop.ts` — the back row's scale reaches the note layers**

  **Description:** `placeRow` and `easeRowWith` write the row's scale to the mover's two note layers as well as to
  `.robot__row`, about the same point (the gem canvas centre, as a CSS `transformOrigin` in each layer's own box),
  in the same call and the same tween (spec §1.5). A mover with no note layers (reduced motion, `?notes=off`)
  behaves as today.

  **As built:** the origin is `50% 50%`: the roll is centred on the gem canvas centre and a layer is the roll grown
  evenly, so the layer's own centre is that point. The front-to-back case checks the layers against the row a
  quarter of the way as well as half way: at half way the sine ease and a linear one agree, and a linear-ease
  mutant survived until the quarter-way check was added.

  **Proof:** RED test — `src/systems/workLoop.test.ts`.

  **Acceptance criteria:**
  - [ ] Placing a back-row robot sets both note layers' scale to `BACK_LAYER_SCALE`; a front-row robot's to 1.
  - [ ] A swim that changes rows eases the layers' scale with `.robot__row`'s over the swim, equal at its middle.
  - [ ] With no note layers in the mover the existing row cases pass unmodified.
  - [ ] Mutation: scaling `.robot__row` alone fails the first two cases.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 12.

  **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

  **Estimated scope:** S

### Checkpoint: Cloud
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. 2026-11-12: 359 files, 14,135
      passed, 2 skipped (skipped before this branch), 0 failed; lint has the 4 old warnings only; the build's
      chunk-size warnings predate this branch.
- [ ] Look (Crawford, after a hard reload), beside `spike/note-pulse` at `?trail=all&noPreview`: bars at pitch
      heights round every sounding robot, half in front and half behind, right to left, white as each sounds, fading
      in just right of "now" and out at the left edge; the right-hand fan empty (the stopgap, spec §1.4); a back-row
      robot's cloud at its size; nothing on a silent robot.
- [ ] The pause: power off with notes mid-flight and they freeze; power on and they carry on, none stranded.
- [ ] `?notes=off` draws nothing. Every cloud is at full strength and undimmed for now (attention is Phase 4).

  These three were never gone through one by one. The look was judged as a whole at Gate 2; the pause and
  `?notes=off` are pinned by tests (Task 14's `'world'` registration, Task 10, Task 12) and `?notes=off` was the
  off arm of every cost run, but neither was watched in a browser as a look.

- [x] **Task 17: the cost run (spec §5.3) and its record**

  **Description:** Headless, one session, nothing else running: `npm run perf:idle -- --only stock --throttle 1`,
  6-second windows, off / on / off / on with `?notes=off` against the default. Record main-thread time, the
  compositor's update time, paint time, rastered area and frames a second in PERFORMANCE.md, with the spike's
  figures beside them (about +19% main thread and +33% compositor update at the approved settings, with early notes
  on, which this build does not have yet). Also record how many notes the repeat rule dropped in one run, since the
  rule now thins less than the spike's (spec §7.3 Q3).

  **Proof:** Run — the four windows' figures in PERFORMANCE.md and reported at Gate 1. No test file.

  **As run (2026-11-13, 3e91a1b6, `?seed=charlie&x=200&y=-30`, the spike's world):** main busy 2 799 and 2 684 ms off
  against 3 242 and 3 205 on, **+17.6 %** (the spike +19 %). Compositor::Update +27 % (the spike +33 %). Paint +2 %,
  rastered 0.47 → 0.48 and 58.6 → 57.0 frames a second, each just outside the off runs' spread. Most of the added
  time is script in the animation-frame callbacks (+315 ms of +482). The repeat rule dropped 4 of 498 notes in 50 s
  (the spike's rule: 88 of 373). The figures and the caveats are in PERFORMANCE.md, "Note cloud — the Task 17 cost run".

  **Acceptance criteria:**
  - [x] The table is in PERFORMANCE.md with the command, the world and the date.
  - [x] The report says plainly whether main-thread time with the cloud on is within 10% of off, and whether paint
        time, rastered area and frame rate are inside the off runs' own spread. Main thread: no, +17.6 %. The other
        three: each just outside, by a few percent or less.

  **Verification:**
  - [x] The runs were taken in the foreground, one at a time, with no orphaned Chrome left behind.

  **Dependencies:** Tasks 13 to 16.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S (a run and a record)

### Gate 1: cost (spec §5.4)
- [x] Task 17's figures reported with the spike's beside them (2026-11-13).
- [x] **Crawford sets the line.** Over the working 10%, the build does not go on to Phase 4 without his decision:
      take more back (the quantum of Task 14 is the first lever), or accept the figure. 2026-11-13: he chose to take
      more back with the battery bands (spec §1.7), Tasks 17a to 17d below. The line itself waits on Task 17d's run:
      +3.7 % with the bands, inside the working 10 %. After Task 17e re-drew the bands (60% on) he declined a
      re-run ("no, that's ok"): **Gate 1 passed**, 2026-11-13.

### Gate 1 follow-up: the battery bands (spec §1.7, Crawford 2026-11-13)

His three answers: the bands replace the battery fade (every note placed shows at the peak); attention still wakes a
robot's notes whatever its band; at a band's edge the notes in flight finish their crossing. Built after Phase 4,
so these tasks revise Tasks 18, 22 and 23.

- [x] **Task 17a: `noteBands.ts` — whether notes are placed, from the battery and the wake**

  **Description:** New pure `notesShown(batteryLevel, woken)` in place of Task 18's `noteStrength`: true while woken;
  otherwise true only in an odd band of `NOTE_BATTERY_BAND` (10): 10–20%, 30–40%, 50–60%, 70–80%, 90–100%, each from
  its lower edge up to, not including, its upper one, a full 100% (and above) counting as the top band, below 0 or
  not a number as off. `noteStrength.ts`, its test and `NOTE_BATTERY_FULL` go, replaced.

  **Proof:** RED test — `src/components/robot/notes/noteBands.test.ts` (new).

  **As built:** `noteStrength.ts`, its test and `NOTE_BATTERY_FULL` stay until Task 17c, which takes the body off
  them, so every commit builds. No guard for a negative level or NaN: neither gives an odd band (two mutants that
  removed such a guard survived as equivalents, so it went). Mutations: 4 killed (even bands, no top-band clamp, the
  wake ignored, ceil for floor).

  **Acceptance criteria:**
  - [x] Shown at 10, 15, 30, 55, 79.9, 90, 100 and 120; not at 0, 9.9, 20, 45, 60, 89.9, −5 or NaN.
  - [x] Shown at every level while woken.

  **Dependencies:** Gate 1's answer. **Files:** `noteBands.ts`, `noteBands.test.ts` (new); `noteStrength.ts`,
  `noteStrength.test.ts` (removed); `src/constants/index.ts`. **Estimated scope:** XS

- [x] **Task 17b: `useNoteCloud.ts` — the `placing` switch**

  **Description:** The hook takes `placing` (boolean). While it is false a drawn note places no bar (the model still
  counts it). Turning it false touches nothing on screen: the notes in flight keep moving to the left edge at the
  layers' strength and are removed there as any note is. Turning it true places the next note as usual. It starts no
  tween and re-runs no effect.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`.

  **As built:** `placing` is optional and defaults to true, so the avatar and the existing callers need nothing. It
  is read through a ref when a note arrives, beside the colour and the pixels per unit. Seven cases, four RED first;
  a run counted while not placing is honoured, as at strength 0. Mutations: 4 killed (placing ignored, default false,
  the ref never following the prop, a switch re-running the cloud).

  **Acceptance criteria:**
  - [x] Placing false: an event places no bar.
  - [x] True to false with bars in flight: the bars stay on their belts and the belt keeps moving them; the layers'
        opacity is unchanged.
  - [x] False to true: the next event places a bar.

  **Dependencies:** none. **Files:** `useNoteCloud.ts`, `useNoteCloud.test.tsx`. **Estimated scope:** S

- [x] **Task 17c: `RobotBody.tsx` — the bands in place of the fade**

  **Description:** A world body hands its cloud `strength: NOTE_PEAK_STRENGTH` at any battery and
  `placing: notesShown(robot.batteryLevel, woken)`; the avatar places always. Task 23's wake and sleep are
  unchanged.

  **Proof:** RED test — `src/components/robot/RobotBody.test.tsx` (Task 23's cases re-pinned to the bands).

  **As built:** the avatar passes `placing: true` explicitly. `noteStrength.ts`, its test and `NOTE_BATTERY_FULL`
  are removed here (held back from Task 17a so every commit builds). Eight cases RED first, among them a battery step
  from 61 to 59 switching placing on and the avatar placing in an off band. Mutations: 4 killed (the world placing in
  every band, the wake ignored, the avatar following the bands, the world's strength below the peak). Full suite:
  361 files, 14,227 passed, 2 skipped, 0 failed. One run under the JSON reporter exited 1 with `success: true` and
  no failure in its report; the plain re-run of the same code exited 0. Not chased.

  **Acceptance criteria:**
  - [x] At 100, 55 and 15 a world body places; at 45, 25 and 5 it does not; the strength is the peak at all six.
  - [x] Pointed at or selected in an off band it places, and stays placing until charging sleeps it.
  - [x] The Deck camera following it in an off band does not make it place.

  **Dependencies:** 17a, 17b. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`. **Estimated scope:** S

- [x] **Task 17d: the cost run again**

  **Description:** Task 17's run, the same command, world and window order, against the bands' build, with Task 17's
  build beside it (or its figures, if the session matches). The windows count which robots are in an on band, since
  a 6 s window samples that. PERFORMANCE.md gains the rows.

  **Proof:** Run. No test file.

  **As run (2026-11-13):** a same-session A/B, two rounds of off, Task 17's build (3e91a1b6, a scratch worktree, the
  same bundle hash) and the bands (6bd2a82e). Main busy against off: **bands +3.7 %** (+2.7 % and +4.8 % in-round),
  Task 17's cloud +15.1 % (+7.3 % and +23.4 %). Compositor::Update +10 % against +30 %. Frames and rastered area are
  inside the off runs' spread, and paint is 5 ms over it. No long tasks with the bands; Task 17's cloud had 1 and 2.
  The layer counts (39 and 43 against 46) are the proxy for robots with notes in a window. PERFORMANCE.md, "Note
  cloud — the battery bands".

  **Dependencies:** 17c. **Files:** `docs/PERFORMANCE.md`. **Estimated scope:** S

- [x] **Task 17e: the bands re-drawn (Crawford, 2026-11-13, after 17d)**

  **Description:** The on bands become 10–28%, 38–55%, 65–73% and 83–100% (spec §1.7), a table
  `NOTE_BATTERY_BANDS` in place of `NOTE_BATTERY_BAND`'s odd tens. Each band runs from its lower edge up to, not
  including, its upper one; a full 100% (and above) counts as the top band; below 0 or not a number is off. 60% of
  the range is on, against the odd tens' 50%, so 17d's +3.7% is expected to rise a little.

  **Proof:** RED test — `noteBands.test.ts` (the new edges) and `RobotBody.test.tsx` (its on and off levels moved
  to the new bands).

  **As built:** `notesShown` asks whether the level is in any band of the table; the band ending at 100 has no upper
  edge, so no clamp is needed (a clamp at 100 survived as an equivalent mutant and went). 8 cases RED first (3 in
  `noteBands.test.ts`, 5 in `RobotBody.test.tsx`, whose levels moved: on 45, off 30, the edge step 74 → 72).
  Mutations: 7 killed (either edge flipped, the top band's 100 not counted, every upper edge counting, the wake
  ignored, a band widened, a band dropped). Not re-measured: 17d's +3.7% was the odd tens' half-on; these bands are
  60% on.

  **Acceptance criteria:**
  - [x] Shown at 10, 27.9, 38, 54.9, 65, 72.9, 83, 100 and 120; not at 0, 9.9, 28, 37.9, 55, 64.9, 73, 82.9, −5 or
        NaN; shown at every level while woken.

  **Dependencies:** 17c. **Files:** `noteBands.ts`, `noteBands.test.ts`, `src/constants/index.ts`,
  `RobotBody.test.tsx`. **Estimated scope:** XS

---

### Phase 4: Attention (Part C)

- [x] **Task 18: `noteStrength.ts` — strength from the battery and the wake**

  **Description:** New pure `noteStrength(batteryLevel, woken)` (spec §1.7, §4): 1 down to `NOTE_BATTERY_FULL` (50),
  then a straight line to 0 at a flat battery; 1 whenever woken.

  **Proof:** RED test — `src/components/robot/notes/noteStrength.test.ts` (new).

  **Acceptance criteria:**
  - [ ] 1 at 100 and at 50; 0.5 at 25; 0.2 at 10; 0 at 0; 1 at any level when woken.
  - [ ] Mutation: a zero at the recall line (10) fails the 0.2 case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/noteStrength.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/robot/notes/noteStrength.ts`, `src/components/robot/notes/noteStrength.test.ts`,
  `src/constants/index.ts`

  **Estimated scope:** XS

  **Revised 2026-11-13 (Crawford: "75% of their current opacity", the whole cloud):** the peak is
  `NOTE_PEAK_STRENGTH` (0.75), not 1. Every "1" above now reads as the peak: 0.75 at 100 and 50 and whenever woken,
  0.375 at 25, 0.15 at 10, 0 at 0. The dim, the battery fade and the white sit under it, because strength is the
  layers' opacity. RED first (`noteStrength.test.ts` and Task 23's cases in `RobotBody.test.tsx` re-pinned to 0.75).

- [x] **Task 19: `robotAttention.ts` — the pointed-at robot, the singled-out robot, the woken set**

  **Description:** New `src/systems/robotAttention.ts`, runtime module state shaped like `deckCamera.ts`'s
  followed-robot pair (spec §1.7): `setPointedRobot(id | null)`, `getSingledOutRobotId()` (the pointed-at robot,
  else `getFollowedRobotId()`, else null) with `subscribeSingledOut`, and `wakeRobotNotes`, `sleepRobotNotes`,
  `isRobotNotesWoken` with `subscribeWokenNotes`. Pointing at a robot wakes it; the camera following one does not.
  It names robots and never reaches the engine.

  **As built:** two additions. `getPointedRobotId()`, so a robot's unmount clears the pointer only if it is still
  that robot (Task 20). And the camera's subscription is held only while the singled-out id has a subscriber; the
  first subscriber takes the current id as the last one told, so a camera change made while nobody listened is not
  reported twice.

  **Proof:** RED test — `src/systems/robotAttention.test.ts` (new), with `deckCamera`'s pair mocked.

  **Acceptance criteria:**
  - [ ] The singled-out id is the pointed-at robot, else the followed robot, else null.
  - [ ] A subscriber is called only when the id changes (pointing at the robot already followed calls nobody).
  - [ ] Pointing at a robot wakes it and it stays woken after the pointer leaves; `sleepRobotNotes` ends it; waking
        a woken robot calls no subscriber.
  - [ ] The followed robot is not woken.
  - [ ] Mutation: waking on follow fails the last case; notifying on every set fails the second.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotAttention.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/systems/robotAttention.ts`, `src/systems/robotAttention.test.ts`

  **Estimated scope:** S

- [x] **Task 20: `Robot.tsx` — the pointer sets the pointed-at robot**

  **Description:** `onPointerEnter` and `onPointerLeave` on `g.robot` call `setPointedRobot(robotId)` and
  `setPointedRobot(null)`, whatever the pointer type (spec §7.2 A5). The unmount clears it if it is still this robot.

  **Proof:** RED test — `src/components/robot/Robot.test.tsx`.

  **Acceptance criteria:**
  - [ ] Pointer enter makes this robot the singled-out one and wakes it; pointer leave clears the pointed-at robot
        and leaves it woken.
  - [ ] Unmounting the robot under the pointer clears the pointed-at robot.
  - [ ] Mutation: no leave handler fails the leave case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/Robot.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 19.

  **Files:** `src/components/robot/Robot.tsx`, `src/components/robot/Robot.test.tsx`

  **Estimated scope:** XS

- [x] **Task 21: `RobotBody.tsx` — the singled-out robot's cloud is undimmed**

  **Description:** A world body is singled out while it is the singled-out id (`useSyncExternalStore`), or selected
  (`uiStore.selectedRobotId`), or its `audioMode` is `solo` or `highlight` (spec §1.7). It writes `--note-dim` on
  its `data-note-cloud` box: 1 when singled out, `NOTE_DIM` (0.35) when not. Both masks read it, so a change
  rebuilds nothing. A card and an avatar subscribe to nothing.

  **As built:** the snapshot is a boolean about this robot (`getSingledOutRobotId() === robot.id`), and the
  selection selector likewise, so the pointer moving between two other robots re-renders no world body; a case
  pins it (an id snapshot fails it). `RobotBody.test.tsx` mocks `deckCamera`'s pair (the rest of the module real)
  so a case can follow a robot.

  **Proof:** RED test — `src/components/robot/RobotBody.test.tsx`.

  **Acceptance criteria:**
  - [ ] A pointed-at, a followed, a selected, a soloed and a highlighted robot's box each carry `--note-dim: 1`;
        any other carries 0.35.
  - [ ] The value flips back when the pointer leaves, and no note bar is removed by the flip.
  - [ ] A card (no `motion`) writes no `--note-dim` and does not re-render when the singled-out robot changes.
  - [ ] Mutation: leaving `highlight` out fails its case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/RobotBody.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 13, 19.

  **Files:** `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 22: `useNoteCloud.ts` — strength is the cloud's opacity, eased**

  **Removed 2026-11-13, after Task 30 (Crawford: "remove the leftovers"):** once the battery bands made the strength
  a constant, this ease never ran. The `strength` option, the ease, `NOTE_EBB_SECONDS` and the strength-0 gate are
  gone; the layers sit at `NOTE_PEAK_STRENGTH`, and Task 24's fade is keyed `note-resize-<context>-<robotId>`. Spec
  §8.3.

  **Description:** The hook takes `strength` (0 to 1). A change eases both wrappers' opacity to it on a tween
  registered as `note-strength-<context>-<robotId>` under `'world'`: a rise over `NOTE_WAKE_SECONDS` (0.3), a fall
  over `NOTE_EBB_SECONDS` (1), never a step (spec §1.7). At a strength of 0 no note is placed (the run and the range
  are still counted). Killed on unmount.

  **As built:** the layers mount at their strength with no fade and no strength timeline; the first change
  registers one. Rise or fall is judged against the layers' opacity at the moment of the change, not the last
  target, so a change mid-fade eases on from where the fade had got to. The ease is `sine.inOut` (the spec names
  none). `RobotBody` passed 1 until Task 23.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`.

  **Acceptance criteria:**
  - [ ] Strength 1 to 0.4 registers the strength timeline under `'world'` with a 1 s duration; 0.4 to 1 with 0.3 s;
        the wrappers' opacity ends at the new strength.
  - [ ] At strength 0 an event places no bar; back at 1 the next event does, and a run begun meanwhile is honoured.
  - [ ] Unmount kills the strength timeline.
  - [ ] Mutation: `gsap.set` in place of the tween fails the duration case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/useNoteCloud.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 14.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 23: `RobotBody.tsx` — the battery thins the cloud, attention wakes it, the station ends the wake**

  **Description:** A world body passes `noteStrength(robot.batteryLevel, woken)` to the hook, with `woken` read
  from `robotAttention` (`useSyncExternalStore`). Being selected wakes the robot; `robot.activity === 'charging'`
  sleeps it (spec §1.7). The Deck camera following it changes nothing here.

  **As built:** the global gsap mock runs no tween, so the cases read the strength the body hands `useNoteCloud`
  (a spy that calls through) rather than the wrappers' eased opacity; the easing is Task 22's, tested with real
  GSAP. The world body's unmount sleeps its robot: the Architecture Decisions put that on the world cloud's unmount,
  and it sits in `RobotBody` beside the wake and the sleep instead, so the hook never imports `robotAttention`.

  **Proof:** RED test — `src/components/robot/RobotBody.test.tsx`.

  **Acceptance criteria:**
  - [ ] At 25% battery and not woken the cloud's wrappers ease to 0.5; pointing at the robot brings them to 1, and
        they stay at 1 after the pointer leaves.
  - [ ] Selecting a robot wakes it; deselecting leaves it woken.
  - [ ] A woken robot stays woken while its `activity` is `returning` and `entering`; `charging` sleeps it, and the
        cloud returns to the battery's strength.
  - [ ] Mutation: sleeping on `returning` fails the stays-woken half of that case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/RobotBody.test.tsx src/systems/robotAttention.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 18, 19, 22.

  **Files:** `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`

  **Estimated scope:** S

- [x] **Task 24: `useNoteCloud.ts` — an edit that re-sizes the roll never pops**

  **Description:** A gem or body-scale change no longer rebuilds at once. On the strength timeline the wrappers fade
  out over `NOTE_WAKE_SECONDS`, the roll is rebuilt at the new size (the notes in flight are dropped), and they fade
  back to the current strength (spec §1.5, §7.2 A6). A colour edit still rebuilds nothing.

  **As built:** the main effect is no longer keyed on the gem and the scale; it keeps the latest size in a ref and
  hands a rebuild to the re-size effect, whose timeline calls it between the fade out and the fade in. The rebuild
  drops the notes and makes a new belt tween from the left of the new roll (as the old re-run did). A strength
  change before the rebuild does not cut the re-size short: the fade in reads the strength when it starts. A cloud
  that is not built when the size changes takes the latest size when it is. Three Task 13/14 cases that pinned the
  instant rebuild now advance the strength timeline past the fade first; the instant-rebuild case itself is replaced
  by this task's.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`.

  **Acceptance criteria:**
  - [ ] Straight after a scale change the wrappers keep their old size and the bar in flight is still there; with
        the strength timeline advanced past the fade-out, the wrappers have the new size and no bars; advanced to
        its end, their opacity is the strength again.
  - [ ] A second scale change mid-fade ends at the latest size with one strength timeline registered.
  - [ ] Mutation: rebuilding in the effect body fails the "old size straight after" case.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/notes/useNoteCloud.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 22.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`

  **Estimated scope:** S

- [x] **Task 25: `FollowedRobotMarker.tsx` — the marker frames the robot under the pointer**

  **Description:** The marker reads `getSingledOutRobotId` / `subscribeSingledOut` in place of the camera's pair:
  the pointed-at robot when there is one, else the followed robot, else nothing (spec §1.7). So on a desktop the
  marker appears on hover. The marker's drawing is unchanged.

  **Proof:** RED test — `src/components/panels/screen/worldView/FollowedRobotMarker.test.tsx`.

  **Acceptance criteria:**
  - [ ] With a pointed-at robot the marker frames it, even while the camera follows another.
  - [ ] With none it frames the followed robot; with neither it renders nothing.
  - [ ] Mutation: reading the camera's pair alone fails the first case.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/FollowedRobotMarker.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 19.

  **Files:** `src/components/panels/screen/worldView/FollowedRobotMarker.tsx`,
  `src/components/panels/screen/worldView/FollowedRobotMarker.test.tsx`

  **Estimated scope:** XS

### Checkpoint: Attention
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. 2026-11-13: 361 files, 14,194
      passed, 2 skipped (skipped before this branch), 0 failed; lint has the 4 old warnings only; the build's
      chunk-size warnings predate this branch.
- [x] No store gained state: the pointed-at robot, the woken set and every note are module or DOM state. Phase 4
      touches nothing in `src/stores` or `src/types`.

### Gate 2: Crawford's eye and ear (spec §5.4)

**Passed 2026-11-13 on his word:** "i'm happy with gate 2, i believe." He did not go through the items one by one, so
the boxes record his overall answer, not a check of each. He named no number to re-pin and asked for no change to
the repeat rule. The guardrail sentence is still to be worded: Task 26 asks him for it.

- [x] The look on his desktop and on a phone: faint clouds, full strength on the robot he points at or selects, the
      marker on hover, a low-battery robot fainter and woken by a click until its station. (Since Gate 1 a robot in
      an off band shows no notes rather than fainter ones.)
- [x] A row switch, a layer switch's dissolve (the cloud stays with the mover, §7.2 A10) and an edit that re-sizes
      the roll.
- [x] The unmeasured cost runs (spec §5.3): his desktop at full screen, a phone, and twelve robots sounding at the
      Full tier, each with the `?debug` HUD up against `?notes=off`. No added crackle; the underrun count no worse.
- [x] He names any of §7.2 A1's numbers to re-pin, says whether the repeat rule thins enough (§7.3 Q3), and gives
      the guardrail sentence its wording. None re-pinned, the rule kept (4 of 498 dropped); the sentence given
      2026-11-13 (Task 26).

- [x] **Task 26: `CLAUDE.md` — the Visual Mapping guardrail names the cloud**

  **As built (2026-11-13):** his sentence, word for word, closes the guardrail. On his word ("change it so there's a
  third overlay allowed") the line before it now reads "remain the first two overlay exceptions" in place of "the
  two overlay exceptions", so the guardrail allows the third. The older phase docs that quote the old wording
  (GEM_POLYGON_ROBOTS.md, ROBOT_HALO_AND_LIT_LINES.md) are left as their phases' record.

  **Description:** The sentence Crawford words at Gate 2, added to the Visual Mapping guardrail (spec §7.1 point 1).
  Nothing else in CLAUDE.md changes. `.github/copilot-instructions.md` is a pointer and is not edited.

  **Proof:** Read — Crawford's own wording, read back to him in the commit. No test file.

  **Acceptance criteria:**
  - [ ] The guardrail carries his sentence, word for word.

  **Verification:**
  - [ ] He reads the diff.

  **Dependencies:** Gate 2.

  **Files:** `CLAUDE.md`

  **Estimated scope:** XS

---

### Phase 5: The detail avatar (Part D)

- [x] **Task 27: `RobotScreen.tsx` — the desk avatar's box, its layers and its fit**

  **Description:** `AvatarGem` takes a `cloud` flag, set by the desk column and not by the phone band (spec §1.8).
  With it, the `<svg>` sits in a positioned box (`data-note-cloud`, the avatar's present size, `overflow: hidden`)
  between a behind layer and a front layer. The layers sit in a div the size of the avatar's viewBox
  (`gemMotionViewBox`), which CSS scales and centres to match the svg's own fit. The box measures itself with a
  ResizeObserver, as `useStageFit` does, writes the fit as custom properties, and keeps the scale (rendered pixels
  per viewBox unit) where the hook's `pxPerUnit` reads it. The avatar's box does not change size.

  **As built:** each layer hangs in its own frame (`.robot-screen__note-frame--behind` / `--front`), not in one
  viewBox-sized div. A frame is a zero-size origin at the gem canvas's (0, 0), moved and scaled by CSS from
  `--note-fit-x`, `--note-fit-y` and `--note-fit-scale`. It is needed because the hook writes a layer's `left` and
  `top` in canvas units, which the layer's own transform would not scale. Two frames, not one, so the behind frame
  sits under the svg and the front frame over it inside the box (`isolation: isolate`). So the layers are not
  direct children of the box, and Task 28 changed the hook's lookup to match. The box also sets `--note-dim: 1`
  inline (spec §1.8). With the cloud off (reduced motion, `?notes=off`) the avatar is the bare svg, with no box.
  Finding: no seed's motion canvas is padded today (2,000 seeds probed, every `gemMotionViewBox` starts `0 0`), so
  the fit's viewBox-origin term is tested with a spied, padded viewBox.

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx`. The clip and the fit are CSS
  and are seen at Gate 3.

  **Acceptance criteria:**
  - [ ] The desk avatar's box holds a note layer either side of its `<svg>`, both `aria-hidden`.
  - [ ] The phone band's gem has no box and no note layers.
  - [ ] With reduced motion or `?notes=off` the desk avatar has no note layers and renders as it does today.
  - [ ] Mutation: passing `cloud` in the band fails the second case.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 12.

  **Files:** `src/components/panels/screen/screens/RobotScreen.tsx`,
  `src/components/panels/screen/screens/RobotScreen.css`,
  `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** M

- [x] **Task 28: `RobotBody.tsx` — the avatar's cloud**

  **Description:** A body with `motion === 'avatar'` calls the hook too: strength `NOTE_PEAK_STRENGTH` (0.75, revised 2026-11-13) and `--note-dim` 1 whatever the
  battery or the attention, the roll at 2.5 times the robot at the avatar's scale of 1 (`ignoreScale`), `pxPerUnit`
  from Task 27, timelines `note-belt-avatar-<id>` and `note-strength-avatar-<id>` under `'world'` (spec §1.8, §7.2
  A9). It subscribes to the same model, so its notes are the world's notes. It never clears the model.

  **As built:** the avatar's `pxPerUnit` reads `--note-fit-scale` from its box's inline style when a note arrives
  (before the first fit it is not a number, and `noteThickness` leaves the share alone). `useNoteCloud` finds a
  layer anywhere in its box (`.note-layer--front`, no longer `:scope > …`). The tests live in
  `RobotScreen.test.tsx` only; `RobotBody.test.tsx` is unchanged. The screen's `deckCamera` mock became partial (a
  world body reads the followed robot). The muted case drives the real `triggerWithCap` for a muted robot: it
  refuses and the avatar stays empty, but jsdom has no audio context, so the case cannot tell the mute gate from a
  missing voice. The gate itself is `AudioEngine.test.ts`'s "refused notes emit nothing" (Task 3).

  **Proof:** RED test — `src/components/panels/screen/screens/RobotScreen.test.tsx`.

  **Acceptance criteria:**
  - [ ] An event for the robot on screen places a bar in the avatar's layers at the peak strength (0.75) at 10% battery.
  - [ ] With the world's robot and the avatar both mounted, one event places a bar in the same layer (front or
        behind) in each, and a repeat in neither.
  - [ ] Closing the screen removes the avatar's bars and timelines and leaves the world's cloud and the model's
        range as they were.
  - [ ] A muted robot's avatar gains no bars (nothing is emitted).
  - [ ] Mutation: clearing the model on any unmount fails the third case.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx src/components/robot` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 23, 27.

  **Files:** `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`,
  `src/components/panels/screen/screens/RobotScreen.test.tsx`

  **Estimated scope:** S

### Checkpoint: Avatar
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean. 2026-11-13: 361 files, 14,216
      passed, 2 skipped (skipped before this branch), 0 failed; lint has the 4 old warnings only; the build's
      chunk-size warning predates this branch.

### Gate 3: the avatar (spec §5.4)
- [x] Crawford looks at the desk avatar with the roll clipped by its box: where "now" falls, and whether the top and
      bottom rows are missed (spec §1.8). 2026-11-13: he looked at the clip, then at the cloud spilling past the
      box ("i like it").
- [x] His answer to spec §7.3 Q1: the clip as it is, or an avatar-only "now" or roll size; and whether the phone
      band's gem stays without a cloud. **The spill:** the box does not clip and only the console pane's edge cuts
      the cloud. The robot screen's column no longer scrolls as a whole; the gem stays at its top and the details
      under it (`.robot-screen__avatar-details`) scroll, the gem still shrinking to its 120 px first. The company
      screen's column is unchanged. The phone band keeps the default, no cloud. CSS and a wrapper: proof by look,
      no test.

---

### Phase 6: The record

- [x] **Task 29: docs — the cloud as shipped**

  **As built (2026-11-13):** ROBOT_DESIGN.md gains "The note cloud — the third overlay", the cloud in the overview,
  the render contexts (the world mover and the desk avatar's box draw it; the phone band, roster tile and company
  screen do not), the data flow and a forbidden-patterns line. ANIMATION_SYSTEM.md gains "The note cloud" (layers,
  belt, the per-frame pass, strength and re-size, the dim, the row scale, pixels per unit) and the two keys in the
  robot timeline table. AUDIO_SYSTEM.md gains "Note events — audio to the picture" and a fifth forbidden pattern.
  Stale lines found on the way and corrected: the avatar was `RobotDisplaySection` (now `RobotScreen.tsx`'s
  `AvatarGem`), a "selection card" (now the roster tile and the company screen's gem), and the marker as the Deck
  camera's only (now the singled-out robot's, so it appears on hover on a desktop). CLAUDE.md's ROBOT_DESIGN.md
  reference line names the third overlay. Every name was taken from the source as read; `npm run lint` clean.

  **Description:** ROBOT_DESIGN.md: the note cloud as the third overlay beside day/night and the battery, the
  render contexts (world and desk avatar yes; phone band, cards and tiles no), and the forbidden-patterns line.
  ANIMATION_SYSTEM.md: the layers, the belt, the per-frame pass, the two timelines per robot per context and their
  ids, the pause. AUDIO_SYSTEM.md: note events (the registry, the emit's place, that the arrow runs audio to
  visual). Every name checked against the shipped source, not this plan.

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [ ] Each named function, constant, timeline id and file exists in the source as written.
  - [ ] No "keep the existing look" or compatibility clause (pre-v1 rule).

  **Verification:**
  - [ ] Each identifier spot-checked with a search of `src`.
  - [ ] `npm run lint` clean.

  **Dependencies:** Tasks 1 to 28.

  **Files:** `docs/ROBOT_DESIGN.md`, `docs/ANIMATION_SYSTEM.md`, `docs/AUDIO_SYSTEM.md`, `CLAUDE.md` (the reference
  docs list, only if a line there has gone stale)

  **Estimated scope:** S (docs only)

- [x] **Task 30: the record — the spec's "As built", backlog 79, this plan**

  **As built (2026-11-13):** the spec gains §8 "As built" (the gates and what Crawford changed, where the code
  departs and why, what is left for him), its status line and Gate 2's line current, and §7.1 point 1 answered.
  Backlog 79's status says what the first branch ships and that Part E follows; not archived. This plan's status
  line is current, and how its boxes read is stated under it.

  **Description:** The spec gains an "As built" section: what differs from it and why (names, any number re-pinned
  at a gate, the gates' outcomes). Backlog 79's entry says what shipped and that Part E follows; it is not archived.
  This plan's status line and boxes are current.

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [ ] The spec, the backlog entry and this plan agree with each other and with the code.

  **Verification:**
  - [ ] Crawford reads them at Checkpoint: Complete.

  **Dependencies:** Task 29.

  **Files:** `docs/specs/ROBOT_NOTE_CLOUD.md`, `docs/todo/backlog.md`, `docs/tasks/ROBOT_NOTE_CLOUD.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete (branch one)
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (2026-11-13, after the review's
  fixes): 14,219 passed, 2 skipped, 0 failed. The build's warnings (dynamic imports, the 500 kB chunk) predate the branch.
- [x] Every acceptance criterion of Tasks 1 to 30 is met; Gates 1 to 3 have passed. The per-task boxes read as the
  note under this plan's status says: each is pinned by its task's tests.
- [x] Any Look or run not done in session is named here, never skipped silently. Put to Crawford on 2026-11-13 and
  answered "everything is fine":
  - The bob (±3 px on a 2.4 s cycle, Checkpoint: Events) and the Task 8 tilt departure (level through the middle,
    tilting only in the fan): looked at in the browser, accepted.
  - Checkpoints Events, Pure and Cloud, never reviewed item by item: covered by the five-axis review below.
  - Runs never made, accepted without a harness number: the re-drawn bands' cost (Task 17e, 60 % on; Task 17d's
    +3.7 % was the odd tens, 50 % on), his desktop at full screen, a phone, and twelve robots sounding at once.
- [x] A five-axis review (`code-review-and-quality`) of the branch, its findings fixed or recorded. Verdict: approve.
  Ten mutants against the branch's tests, nine killed; the survivor was dead code. Fixed on Crawford's word:
  - a520363f: the avatar's pixels per unit is NaN until its box is measured, and NaN never equals itself, so every
    note re-fitted both layers. RED test first; `fit()` now compares with `Object.is` against a null "not fitted".
  - 7c8f4e1c: the unmount's display and will-change resets removed (the surviving mutant: dead on every path).
  - db32a91e: `parseNotesParam` reads through `parseDebugParam`.
  - 94324efc: spec §1.6 and this plan's Architecture Decisions name the `note-resize-…` timeline.

  Recorded, not fixed: `RobotBody` imports `getStageScale` from a panel's hook file (`useStageFit.ts`), whose module
  state it is; a small `stageScale` module both import would turn the dependency the right way. `AudioEngine.ts` is
  1,741 lines; Part E's Tasks 32 and 33 take pieces out of it before adding.
- [x] Ready for Crawford's PR. The PR body links the spec's sections.

---

### Phase 7: Early announcements (Part E; branch `feature/note-cloud-early-notes`, off `main` after the merge)

- [x] **Task 31: `noteEvents.ts` — a listener asks for notes earlier** (51910b07)

  **Description:** `setNotePreviewSeconds(seconds)` and `getNotePreviewSeconds()` (spec §1.9). 0 until asked; a
  negative or non-finite value is 0.

  **Proof:** RED test — `src/engine/noteEvents.test.ts`.

  **Acceptance criteria:**
  - [x] The preview is 0 until asked, reads back what was asked, and a bad value reads back 0.
  - [x] Mutation: no clamp fails the bad-value case (4 cases fail: negative, NaN, ±Infinity).

  **Verification:**
  - [x] `npx vitest run src/engine/noteEvents.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Branch one merged.

  **Files:** `src/engine/noteEvents.ts`, `src/engine/noteEvents.test.ts`

  **Estimated scope:** XS

- [x] **Task 32: `AudioEngine.ts` — one place turns a step into its notes** (ceca175d)

  **Description:** The reads inside `processMelodyStep` (the events of `at.step` from `stepRegistry`, the pitch from
  `paletteForMeasure(at.measure)`, the sounding length and release after articulation, the accent, and the start at
  `time + MIN_LEAD` plus the Humanize roll at `at.sixteenth`) move into one function that returns the step's notes
  as `NoteParams`. `processMelodyStep` becomes "resolve, then `scheduleNote` each". A refactor: nothing is heard
  differently.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: the new function's own cases (it does not exist yet), on
  the file's `atStep` helper and its mocked `positionAt` / `paletteForMeasure`.

  **Acceptance criteria:**
  - [x] For a step it returns each registered robot's note with the pitch of that measure's palette, the articulated
        length, and the humanized start; a bad note index is skipped, and the others still come back.
  - [x] A Click Track event carries no Humanize offset.
  - [x] Every existing `processMelodyStep` test passes unmodified.
  - [x] Mutation: reading the palette of `at.measure − 1` fails the pitch case (the case reads measure 6, which
        opens a palette entry; at measure 5 the measure before plays the same entry, as the oracle guard found).

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** `stepNotes(at, time): NoteParams[]`, a module export. An event that throws while it is read is
  skipped alone. An empty step returns before the Humanize roster read. Two more mutants killed: the Click Track
  humanized, and a throwing event aborting the step.

  **Dependencies:** Branch one merged.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

- [x] **Task 33: `AudioEngine.ts` — one place answers "may this robot trigger now?"** (1a3f2269)

  **Description:** `triggerWithCap`'s gates before the polyphony cap (Mute, Solo and the dock through
  `isRobotAudible`; the budget's `soundingRobots`; a reserved voice) move into one function that `triggerWithCap`
  calls first. A refactor: nothing is heard differently, and the cap, the voice count and the note-string check stay
  where they are. Ask-first item of the spec (§3: "any change to `triggerWithCap`'s gates"): this moves them and
  changes none, and Crawford sees the diff at the checkpoint.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: the new function's own cases.

  **Acceptance criteria:**
  - [x] It is false for a muted robot, a robot soloed away, a docked robot, a robot standing by and a robot with no
        voice, and true otherwise; it changes no voice count.
  - [x] Every existing `triggerWithCap` test, Task 3's included, passes unmodified.
  - [x] Mutation: leaving the budget out of it fails the standing-by case.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** `mayRobotTrigger(robotId)`, a module export. One order change, for Crawford's read of the diff: the
  reserved-voice check now runs before the cap rather than after it (it used to bump the voice count and take it
  back). A robot with no voice is refused either way, and at a full cap it now also logs the dev warning. A case pins
  that it is true at a full polyphony count. Three more mutants killed: audibility left out, the voice check left
  out, and the cap moved in.

  **Dependencies:** Task 32.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

- [x] **Task 34: `AudioEngine.ts` — the engine announces a step ahead of its trigger** (e63f2250)

  **Description:** With a preview asked for, each firing of the melody's 16n tick also announces a later step: the
  first whole sixteenth at least the preview ahead (`getTickSeconds(time)` gives a sixteenth's length; the later
  step's position is `positionAt` of its own time). Its notes come from Task 32's function, each robot is asked
  Task 33's question as things stand now, and each note with a listener is emitted with `at` as its start and
  `lead` as that start less `Tone.now()`, plus the output latency. The polyphony cap refuses no announcement. While
  a preview is asked for, `triggerWithCap` emits nothing. With no preview, Task 3's behaviour is unchanged.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`.

  **Acceptance criteria:**
  - [x] With 0.9 s asked at 120 BPM, a tick announces the step eight sixteenths on, with the pitch, the length and
        the scheduled start that step's own trigger then gives it.
  - [x] Across a palette change and across a measure's end the announced pitch is the triggered pitch.
  - [x] An announced note is not emitted again at its trigger.
  - [x] A robot muted, soloed away, docked or standing by at the announcing tick announces nothing; a full
        polyphony count stops no announcement.
  - [x] With no preview asked for, no step is resolved twice and the trigger emits as in Task 3.
  - [x] Mutation: `Math.floor` for the sixteenths ahead fails the eight-sixteenths case; emitting at the trigger as
        well fails the third.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/engine/noteEvents.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** `announceUpcomingStep(time)`, private, run by the melody tick after `processMelodyStep`. The cases
  drive the real tick on a 120 BPM clock. The round-up has no epsilon: at a 0.125 s sixteenth no case could pin one,
  and a float error can only announce one sixteenth more. Added cases: an exact multiple (1 s is eight, not nine);
  no tick length known announces nothing; a robot nobody listens to builds no event (the latency is never read).
  Nine mutants, all killed. Test gotcha: the `tone` mock outlives `resetModules`, so the harness takes the last
  transport given a `16n` repeat (the first would be an earlier test's engine).

  **Dependencies:** Tasks 31, 32, 33.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M

- [x] **Task 35: `useNoteCloud.ts` — the cloud asks for the run-in, and the mask opens the right-hand fan** (bcc39943)

  **Description:** The first cloud to mount asks for `NOTE_PREVIEW_SECONDS`: the run-in from the roll's right edge
  to "now" (`NOTE_NOW × NOTE_CROSSING_SECONDS`, 1.125 s) less the 0.2 s every note already has. `noteMask` is given
  the whole run-in, so a note fades in across the fan. With `?notes=off` or reduced motion nothing asks, and the
  engine does no announcing. A bar whose lead puts it past the roll's right edge is placed there and rides in.

  **Proof:** RED test — `src/components/robot/notes/useNoteCloud.test.tsx`.

  **Acceptance criteria:**
  - [x] Mounting a cloud leaves `getNotePreviewSeconds()` at 0.925; with `?notes=off` it stays 0.
  - [x] The wrappers' mask ends at the right edge (100%).
  - [x] An event with a 1.2 s lead places its bar right of the roll's right edge, and the belt brings its left end
        to "now" when the lead has passed. (It already did; the case pins it.)
  - [x] Mutation: asking for the whole 1.125 s fails the first case.

  **Verification:**
  - [x] `npx vitest run src/components/robot/notes` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **As built:** beyond the plan, the ask is counted. The first cloud built asks, and the last to go sets the preview
  back to 0, so with no cloud the engine announces nothing. Cases: two clouds and the last withdraws; an effect re-run
  leaves one ask; a disabled cloud and one with no layers ask nothing. Mutants killed: no withdrawal, no count, the
  old mask. Full suite after this task: 14,261 passed, 2 skipped, 0 failed.

  **Dependencies:** Task 34.

  **Files:** `src/components/robot/notes/useNoteCloud.ts`, `src/components/robot/notes/useNoteCloud.test.tsx`,
  `src/constants/index.ts`

  **Estimated scope:** S

- [x] **Task 36: the forecast run, the cost run again, and the docs**

  **Description:** The forecast (spec §5.3): two power-ons of one world with no input, a few hundred notes each, a
  palette change included, with a scratch probe that checks each announced note against its trigger (the probe
  ships behind `?debug` or not at all; this task decides and says which). The headless cost run of Task 17 again,
  against Gate 1's figures. AUDIO_SYSTEM.md gains the announcement; PERFORMANCE.md the figures; the spec's "As
  built" the outcome.

  **Proof:** Run — the forecast's counts and the cost table, recorded and reported at Gate 4. No test file.

  **Acceptance criteria:**
  - [x] The forecast: no wrong pitch, and no unannounced note outside the lead after a robot starts sounding; or
        each miss is named with its cause.
  - [x] The cost table sits beside Gate 1's and the spike's in PERFORMANCE.md.
  - [x] AUDIO_SYSTEM.md's names match the source.

  **Verification:**
  - [x] The runs were taken in the foreground, one at a time.

  **As built:** the probe does **not** ship (Open Question 6). It was a scratchpad script that wrapped
  `AudioEngine.scheduleNote` on the page's module and listened through `onRobotNote`, checked first against a doctored
  copy of a saved run. Forecast, two power-ons: 625 played, 610 matched, 0 wrong pitch, 0 wrong length, 15
  unannounced (all a robot just started sounding), 5 announced and not played (all a gate closing inside the lead,
  robots docking), the same both times. Cost, same session, off / `main` / early notes: +10.0 % and +9.5 % main
  busy against off. The early notes add nothing the harness can tell from noise, and this was the first measurement
  of the re-drawn bands. ROBOT_DESIGN.md and ANIMATION_SYSTEM.md also gained a line each on where a note now enters.

  **Dependencies:** Task 35.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/PERFORMANCE.md`, `docs/specs/ROBOT_NOTE_CLOUD.md`

  **Estimated scope:** S

### Gate 4: Part E (spec §5.4)
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (2026-11-13: 14,261 passed, 2 skipped,
  0 failed; lint 0 errors, its 4 warnings in scenery files this branch does not touch; the build's warnings predate it).
- [ ] Crawford's eye: a note enters at the roll's edge and rides the fan in to "now", as in the spike. Hard reload
  first (Ctrl+Shift+R): `AudioEngine.ts` changed. 2026-11-13, his first look: "a little too much lead", split the
  difference. `NOTE_PREVIEW_SECONDS` halved to 0.4625 s (a note known about 0.7 s ahead, entering about halfway
  between the edge and "now") and the mask clears where a note is first known (90.75 %); spec §8.4. Then "the lead
  shouldn't balloon out": the right half runs flat (no fan, wave growth or tilt), the left keeps the fan. Then the
  cloud leaves the world: the robot screen's avatar is the only cloud, always on (spec §8.4). His look is open.
- [x] Task 36's forecast counts and cost figures reported; he accepts the cost or names what to take back. Moot
  2026-11-13: the cost was twelve world clouds, and the world draws none now (spec §8.4).
- [ ] Ready for his PR.

- [ ] **Task 37: archive, after the merge**

  **Description:** Backlog 79 moves to the archive with what shipped; its plan.md line is deleted; the spec's and
  this plan's status lines say done; links rebased on the move (the archive conventions).

  **Proof:** Read. No test file.

  **Acceptance criteria:**
  - [ ] Plan.md Stage 4 no longer lists 79; no link to the entry is dead.

  **Verification:**
  - [ ] Crawford's PR for the docs branch.

  **Dependencies:** PR two merged.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`,
  `docs/specs/ROBOT_NOTE_CLOUD.md`, `docs/tasks/ROBOT_NOTE_CLOUD.md`

  **Estimated scope:** XS (docs only)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The per-frame pass costs more than the working 10% at the approved settings (the spike measured about 19%) | High | The quantised, write-on-change pass is built in from Task 14 and measured at Task 17 before anything is built on it; Gate 1 is Crawford's decision, with the quantum as the first lever |
| Gate 1 flatters the cost, because the first branch has no early notes and so fewer notes alive | Medium | Said in Task 17's record; Gate 4 runs the same measurement with early notes on (Task 36) |
| React and the hook fight over the belts' children | High | React renders the belts empty and never gives them children (Task 12); the hook only appends and removes its own bars; Task 13's re-render case holds a bar across a re-render |
| A world timeline paused by its owner is played by a power-on, or a paused world's belt runs | Medium | `timelineMap` resumes only what it paused; Task 14's criterion drives the pause and resume pair for a live and an idle belt |
| The world's cloud and the avatar's count a run twice and drop different notes | Medium | One engine listener per robot in the model (Task 6); Task 28 checks the two clouds against each other |
| The avatar's HTML layers do not line up with the svg's fit | Medium | One measured fit drives both the CSS and `pxPerUnit` (Task 27); it is CSS, so Gate 3's look is the proof and the plan says so |
| The back row's scale and the layers drift apart mid-ease | Low | The same tween writes both (Task 16), with a mid-swim equality check |
| Moving `triggerWithCap`'s gates changes what is heard | High | Task 33 is a pure move with every existing test untouched, flagged as the spec's ask-first item, on its own commit for Crawford's read |
| The forecast and the trigger drift | Medium | They call one function (Task 32); Task 34's cases compare an announcement with its own trigger across a palette change |
| A hidden tab or a paused world strands notes on screen | Low | Events are dropped while hidden or not running (Task 13); the belt freezes with the world (Task 14); Checkpoint: Cloud runs the pause |
| A thirty-task branch grows stale against `main` | Low | Stage 4's other items (84, 85) wait behind this one in plan.md; rebase at each gate |

## Open Questions

1. **The avatar's clip (spec §7.3 Q1).** **Answered** at Gate 3, 2026-11-13: no clip at the box, the cloud spills
   and the console pane cuts it; the phone band has no cloud.
2. **The cost line (spec §7.3 Q2).** **Open** — Crawford at Gate 1, with Task 17's figures.
3. **How much the repeat rule thins (spec §7.3 Q3).** **Open** — Task 17 recorded the count, 4 of 498 notes in
   50 s (the spike's rule: 88 of 373); Crawford at Gate 2.
4. **Part E's place (spec §7.3 Q4).** **Resolved** — last, on its own branch (Crawford, 2026-11-12); Phase 7.
5. **Where the model is cleared, and how two clouds share one run.** **Resolved** (Architecture Decisions): the
   world body's unmount; one engine listener per robot in the model.
6. **Does the forecast probe ship?** **Decided in Task 36: not at all.** It lived in the session's scratchpad, as
   spec §1.9 says ("No forecast check ships"); PERFORMANCE.md records how it worked.
