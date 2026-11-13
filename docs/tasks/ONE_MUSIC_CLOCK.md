# Implementation Plan: One Music Clock (part one)

Source spec: [docs/specs/ONE_MUSIC_CLOCK.md](../specs/ONE_MUSIC_CLOCK.md) (approved 2026-11-12). Source intent:
[docs/intent/one-music-clock.md](../intent/one-music-clock.md). Backlog
[82](../todo/backlog.md#82-audio-the-chord-cycle-does-not-always-change-on-time) and
[83](../todo/backlog.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure); measured in
[CHORD_CYCLE_TIMING.md](CHORD_CYCLE_TIMING.md). Part two is backlog
[86](../todo/backlog.md#86-world-move-the-whole-world-to-a-measure).

**Status:** Phases 1–3 done 2026-11-12 (Task 1: nothing needs a started transport; Tasks 2–3: `positionFromTicks`,
`positionAt`, BeatClock's tick on its own time; Tasks 4–9: `paletteForMeasure`, the melody and swell ticks on their
own positions, the harmony repeat and its state gone, the ticks registered before the transport starts at the
store's tempo). Checkpoint: Core's suite and build are clean. Phase 4's Task 10 done 2026-11-12: ten power-ons, every
firing on the grid from tick 0, every measure turned on its bar, every step 1 on the right chord, one sequence in all
ten. Waiting at Checkpoint: By ear (Crawford's hard reload and Click Track listen), and his reads of Task 1, Core and
Task 10's table.

## Overview

The measure, the chord palette, the melody step and the velocity/humanize position stop being running counts and are
read from the transport's tick count at each callback's own time, through one `MusicPosition`
([beatClock.ts](../../src/engine/beatClock.ts)). The two `16n` ticks that pass no start time start on the grid and
register before the transport starts. The harmony repeat, its module state and `stepCounter` go.

Thirteen tasks in five phases: one read that confirms the power-on order is safe to move (Task 1, first because it is
the riskiest assumption); the position foundation in BeatClock (Tasks 2–3); the consumers moved onto it one at a time,
each leaving the app working (Tasks 4–9); the live proof and Crawford's listen (Task 10 and its checkpoint); docs and
the record (Tasks 11–12), and the archive after merge (Task 13).

Every behaviour task is RED first, one commit per task, with the mutation named in the task run against the new test
before the commit (the repo's TDD workflow). After any task that edits `src/engine` or `src/systems`, Crawford
hard-reloads (Ctrl+Shift+R) any dev page he has open before listening: an HMR swap has split the audio graph before.

## Architecture Decisions

- **One position, many readers (spec §4.1).** `MusicPosition { sixteenth, measure, step }`, `positionFromTicks(ticks,
  ppq)` (pure) and `positionAt(time)` live in `beatClock.ts`, which already owns the transport instance. Every reader
  (BeatClock's tick, the melody tick, the swell tick) calls `positionAt` with its own callback's `time`, so no reader
  depends on another having run first on the same sixteenth. That ordering was read from Tone's source and never
  measured (backlog 82's P3), so nothing leans on it.
- **Round to the nearest sixteenth (spec §4.1).** Safe because every reader fires on the grid; Task 10 measures that.
- **Grid starts (spec §4.2, §4.4).** BeatClock's tick and the melody tick pass a start of `0`. Registered before the
  transport starts, they fire first at tick 0; registered later, Tone moves them to the next sixteenth. The swell tick
  already passes its interval as its start.
- **Resolves spec §9 Q1: register, then start.** `AudioEngine.start` registers BeatClock's tick and the melody tick
  and sets the transport's tempo from the store before `transport.start()`. Task 1 confirms first that nothing between
  `Tone.start()` and the registrations needs a started transport; if something does, the build stops there and asks
  (spec §8, "Ask first").
- **Resolves spec §9 Q2: `getPolyphonyStats().step` goes** in Task 5, with `stepCounter`.
- **Resolves spec §9 Q3: the named removals** go in Task 3 (`parseTransportPosition`), Task 6 (the callers of the
  harmony repeat and of `resetHarmony`) and Task 7 (the harmony module's state and old exports), each with its tests.
- **Additive, then switch, then delete.** `paletteForMeasure` lands beside the old harmony exports (Task 4), the engine
  switches to it (Task 5), the callers of the repeat stop calling it (Task 6), and only then does the module lose the old
  exports (Task 7). Each step leaves the suite green and the app playing.
- **`processMelodyStep(at: MusicPosition, time)` (spec §4.4).** It takes the position, not a step number, so the
  palette and the roll position come with the step. Its three direct test callers move with it in Task 5.

## Dependency Graph

```
Task 1 (read)     Task 2 (positionFromTicks)        Task 4 (paletteForMeasure)
   │                  │                                 │
   │              Task 3 (BeatClock's tick, own time)   │
   │                  │                                 │
   │                  ├─────────────────┬───────────────┘
   │                  │                 │
   │              Task 8 (swells)   Task 5 (melody tick on MusicPosition; stepCounter goes)
   │                                    │
   │                                Task 6 (callers stop scheduling/resetting the harmony)
   │                                    │
   │                                Task 7 (harmony state and old exports deleted)
   │                                    │
   └──────────────────────────────► Task 9 (register the ticks, then start)  ◄── needs 1, 3, 5, 6
                                        │
                                    Task 10 (proof run) ──► Checkpoint: by ear
                                        │
                                    Task 11 (docs) ── Task 12 (backlog record)
                                        │
                                    Task 13 (archive, after merge)
```

Tasks 2 and 4 are independent pure functions; Task 8 can land any time after Task 3; Task 7 and Task 9 both follow
Task 6 and do not depend on each other.

## Task List

### Phase 1: The risky assumption

- [x] **Task 1: `AudioEngine.start` — confirm nothing before the registrations needs a started transport**

  **Description:** Read every step `AudioEngine.start` runs between `Tone.start()` and `initBeatClock` (in
  [AudioEngine.ts](../../src/engine/AudioEngine.ts)): `loadInstruments`, `waitForGlobalReverbReady`,
  `applyGlobalAudioToEngine`, `lfoEngine.primeLfoBank` and `linkTarget`, `setRoomFed`, `primeRosterLinks`, and what each
  calls, for any read of the transport (`getTransport`, `.sync()`, a transport-relative time such as `'+4n'` or `'1m'`,
  `transport.state`, `transport.seconds`). Already known: outside `beatClock.ts`, only `AudioEngine.ts`,
  `audioDiagnostics.ts` and `audioContextSetup.ts` reach `getTransport`, and `lfoShared.ts` gates LFOs on the
  AudioContext, not the transport. Record the outcome under this task.

  **Proof:** Read. No test file; nothing changes.

  **Acceptance criteria:**
  - [x] Each step is listed with what it needs (a running context, the store, nothing).
  - [x] Either "nothing needs a started transport" is recorded and Task 9 proceeds as planned, or the step that does is
        named and the build stops for Crawford (spec §8, "Ask first").

  **Verification:**
  - [ ] Crawford reads the outcome at Checkpoint: Foundation.

  **Dependencies:** None.

  **Files:** this file only.

  **Estimated scope:** XS (a read)

  **Outcome (read 2026-11-12): nothing needs a started transport. Task 9 proceeds as planned.**

  | Step in `AudioEngine.start` | What it does | What it needs |
  |---|---|---|
  | `Tone.start()` | Resumes the AudioContext (the user gesture). | Nothing |
  | `loadInstruments()` | `buildGlobalFxChain()` builds the nodes; Chorus and Tremolo call `.start()` with no time (the context's now). A robot spawned before power-on gets `reserveVoice`, `updateRobotPan`, `updateRobotSends`. | A running context, the store |
  | `waitForGlobalReverbReady()` | Awaits the reverb's impulse response. | A running context |
  | `applyGlobalAudioToEngine(globalAudio, bpm)` | Writes each `setGlobal*`. Synced rates and the delay time are Hz and seconds from the store's `bpm` (`tempoSync.ts`, plain arithmetic). | The store, the built nodes |
  | `lfoEngine.primeLfoBank` | Gated on `isAudioContextRunning()` (`lfoShared.ts`); lanes start at `Tone.now() + MIN_LEAD`. | A running context, the store |
  | `lfoEngine.linkTarget` (each global target) | Connects link gains; drift starts at `Tone.now() + MIN_LEAD`. | A running context, the store |
  | `setRoomFed` (each room) | Builds or lights bypass cells; effect LFOs `.start()` with no time. | A running context |
  | `primeRosterLinks` | Robot lane links, as `linkTarget`. | A running context, the store |

  Repo-wide, outside tests: no `.sync()` anywhere in `src`; `getTransport` only in `AudioEngine.ts`, `audioDiagnostics.ts`
  (the overlay's reads of the transport's state and event counts, after `start` returns) and `audioContextSetup.ts` (a
  comment). `Tone.Time(…).toSeconds()` appears only on the note path (`scheduleVoiceRelease`, `processMelodyStep`,
  `compositeVoice`'s trigger), which only the ticks reach. BeatClock's pending schedules, registered in
  `initBeatClock`, pass their interval as an absolute start, so they land on the grid with the transport stopped too.

  Three things for later tasks, none a blocker:
  - **Stale comments.** `AudioEngine.ts` (above the LFO priming: "after Tone.start()/transport.start() have
    succeeded"), `audioStore.ts` (above `regenerateLfoBankFromSeed`: "after Tone.start()/transport.start() succeed")
    and `beatClock.ts` (`initBeatClock`: "Should be called after Transport starts") name the transport. Only a running
    context is needed (`lfoShared.ts` already says so). Task 3 rewords the BeatClock one and Task 9 the other two.
  - **The tempo today.** `AudioEngine.setBPM` returns early until `initialized`, which `start` sets on its last line,
    so the transport starts at Tone's default 120 BPM until `powerController.start`'s `setBPM` call after `start`
    resolves. Task 9 writes `transport.bpm.value` directly before `transport.start()`, as its description says, not
    through `setBPM`.
  - **`await transport.start()`.** Tone's `start` returns the transport, not a promise, so the `await` does nothing.
    Harmless. Task 9 can drop it when it moves the call.

### Phase 2: The position foundation

- [x] **Task 2: `beatClock.ts` — `MusicPosition` and `positionFromTicks`**

  **Description:** Add the type and the pure function exactly as spec §4.1 gives them. No caller yet; independently
  testable.

  **Proof:** RED test — `src/engine/beatClock.test.ts`: the positions of spec §6.1's tick counts.

  **Acceptance criteria:**
  - [x] Tick 0 gives sixteenth 0, measure 0, step 1; 48 gives step 2; 720 gives step 16; 768 gives measure 1, step 1.
  - [x] 767.9999 and 768.0001 both give measure 1, step 1 (rounding to the nearest sixteenth).
  - [x] At a PPQ of 96, tick 384 gives measure 1, step 1 (nothing assumes 192).
  - [x] Mutation: `Math.round` → `Math.floor` fails the 767.9999 case; the measure length 16 → 12 fails the 768 case.

  **Verification:**
  - [x] `npx vitest run src/engine/beatClock.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** RED: 9 new cases, all "positionFromTicks is not a function". Edge cases beyond the list: a hair
  either side of a mid-measure sixteenth (192 ± 0.0001 → step 5), measure 97 step 4 (no wrap), tick 24 at PPQ 96.
  Mutants: floor killed 2 (767.9999 and the mid-measure hair), 16 → 12 killed 6 (768 among them).

  **Dependencies:** None.

  **Files:** `src/engine/beatClock.ts`, `src/engine/beatClock.test.ts`

  **Estimated scope:** XS (one pure function and its tests)

- [x] **Task 3: `beatClock.ts` — BeatClock's tick reads its own time and starts on the grid**

  **Description:** `TransportLike` gains `getTicksAtTime(time)` and `PPQ` and loses `position`. Add `positionAt(time)`
  (undefined with no transport). The internal `16n` tick registers with a start of `0`, takes its `time`, and sets the
  current beat and measure from `positionAt(time)`; listeners are notified once per change, as now.
  `parseTransportPosition` and its tests go (spec §9 Q3). `AudioEngine` passes the real transport, which already has
  both members, so no engine change. The test file's mock transport moves to the new shape.

  **Proof:** RED test — `src/engine/beatClock.test.ts`: the tick turns the measure from its callback's time, not from
  `position`.

  **Acceptance criteria:**
  - [x] `initBeatClock` registers its tick with interval `16n` and a start of `0`.
  - [x] A tick callback whose time maps to the bar's tick count turns the measure and notifies each listener once.
  - [x] A tick callback a sixteenth before the bar does not turn the measure, even with a mock `position` field that
        reads the next measure (the read-ahead backlog 82 measured cannot happen).
  - [x] `getCurrentBeat`, `getCurrentMeasure`, `getCurrentMeasurePrecise` read the last tick's position; the existing
        `subscribeToMeasure`, `scheduleRepeat`, `cancelSchedule`, `getTickSeconds` and `resetBeatClock` tests pass
        with only the mock's shape changed.
  - [x] Mutation: drop the start of `0` fails the registration test; read `getTicksAtTime(time + 0.1)` fails the
        before-the-bar test.

  **Verification:**
  - [x] `npx vitest run src/engine/beatClock.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** The mock transport runs at 120 BPM, 192 PPQ from time 0 (`timeAt(measure, beat, sixteenth)`
  gives a callback's time); the existing tick tests moved from setting `position` to calling the tick with a time.
  RED: 18 failures, among them the read-ahead case reading measure 5 a sixteenth before the bar under the old code.
  Edge cases beyond the list: `positionAt` reads the transport's PPQ and is undefined with no transport; a bar tick
  count a hair off the grid (767.9999, 768.0001) still turns the measure; the first tick at time 0 notifies measure 0;
  a stale tick called after `resetBeatClock` changes nothing and does not throw. Mutants: no start killed 2, `time +
  0.1` killed 8 (the before-the-bar case among them), the dropped `if (!at) return` killed 1 (the stale tick).
  `initBeatClock`'s comment no longer says "after Transport starts".

  **Dependencies:** Task 2.

  **Files:** `src/engine/beatClock.ts`, `src/engine/beatClock.test.ts`

  **Estimated scope:** S (one module and its tests)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (full suite; any pre-existing, unrelated failure named).
      2026-11-12 at 451855a5: 355 files, 13,912 passed, 2 skipped, 0 failed (257 s); types clean; lint 0 errors (4
      existing `react-refresh` warnings in the scenery files, untouched).
- [ ] Task 1's outcome read by Crawford.
- [ ] What is true now: BeatClock's measure turns on the bar's own tick. The chord is still the old repeat, which now
      reads a measure that has turned, so the chord changes on time already; the melody is still off the grid.
- [ ] Reviewed with Crawford before Phase 3.

---

### Phase 3: The consumers move onto the position

- [x] **Task 4: `harmonySystem.ts` — `paletteForMeasure`**

  **Description:** Add `paletteForMeasure(measure)` (spec §4.3) beside the existing exports, which stay until Task 7.
  No caller yet.

  **Proof:** RED test — `src/engine/harmonySystem.test.ts`: measures 0 to 25 give entries `floor(m / 2) % 12`.

  **Acceptance criteria:**
  - [x] Measures 0 and 1 give entry 0, 2 and 3 entry 1, 22 and 23 entry 11, 24 entry 0.
  - [x] It returns a copy: mutating the result leaves the next call's unchanged.
  - [x] Mutation: `/ MEASURES_PER_PALETTE_ENTRY` dropped fails the measure-1 case; `% HARMONY_PALETTES.length` dropped
        fails the measure-24 case.

  **Verification:**
  - [x] `npx vitest run src/engine/harmonySystem.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** The expected entries are written out as literal notes, so the test never restates `% 12`. RED:
  30 new cases, all "paletteForMeasure is not a function". Edge cases beyond the list: later laps (48, 241, 263) wrap
  the same as the first; the stored palette and a firing of the old repeat do not change what it returns (that case
  goes with `setAvailableNotes` in Task 7). Mutants: no division killed 27 (measure 1 among them), no wrap killed 3
  (measure 24 among them), returning the table entry uncopied killed 1 (the copy case).

  **Dependencies:** None (listed after Task 3 for the order of the build).

  **Files:** `src/engine/harmonySystem.ts`, `src/engine/harmonySystem.test.ts`

  **Estimated scope:** XS

- [x] **Task 5: `AudioEngine.ts` — the melody tick plays the clock's position; `stepCounter` goes**

  **Description:** The melody tick in `startMelodyPlayback` registers with a start of `0`, reads `positionAt(time)`,
  and calls `processMelodyStep(position, time)`; with no position it does nothing. `processMelodyStep(at, time)` plays
  `at.step`'s events with `paletteForMeasure(at.measure)` and passes `at.sixteenth` as the humanize and `scheduleNote`
  position (spec §4.4). `NoteParams.position`'s comment says what the position now counts. `stepCounter`, its reset in
  `killAll` and `getPolyphonyStats().step` go (spec §9 Q2). `AudioEngine.test.ts`'s mocks gain `positionAt` and
  `paletteForMeasure` (a mocked module throws on a missing export); the two other test files that drive
  `processMelodyStep(step, 0)` pass a position instead.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: a position of measure 5, step 4 plays the step-4 events in
  palette entry 2 at roll position 83.

  **Acceptance criteria:**
  - [x] `processMelodyStep({ sixteenth: 83, measure: 5, step: 4 }, t)` schedules only step 4's events, with pitches
        from palette entry 2, `position: 83`, and a humanize offset drawn at 83.
  - [x] The same position twice gives identical `scheduleNote` arguments.
  - [x] The melody tick registers with interval `16n` and a start of `0`; its callback hands `processMelodyStep` the
        position `positionAt` returns for its own time, and does nothing when that is undefined.
  - [x] `getPolyphonyStats()` returns `{ voices, maxVoices }`; the existing cap and voice tests pass unchanged.
  - [x] Mutation: `at.sixteenth` → `0` fails the position-83 case; `paletteForMeasure(at.measure)` →
        `paletteForMeasure(0)` fails the palette case.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/systems/spawnSystem.test.ts src/systems/worldTransition.test.ts`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** The palette case swaps the real `paletteForMeasure` into the file's harmony mock, so "entry 2"
  is a real note (D at measure 5, where measure 0 plays C). The existing callers moved to an `atStep(step, measure =
  0)` helper in AudioEngine.test.ts (sixteenth `step - 1`) and an inline position in spawnSystem and worldTransition.
  The old live-tick test (20 ticks all at time 0 gave positions `[0, 2, 16, 18]` from the count) now ticks at real
  times through the actual `positionFromTicks`. RED: 10 of 12 new cases failed; the 20-tick case and the Humanize-0
  case passed under the old code too (evenly spaced ticks look the same to a counter), and the new "same time twice
  plays the same position" case is the one that tells a count from a clock (old code: `[2]` for `[2, 2, 18]`). Edge
  cases beyond the list: the step a measure later plays palette entry 3 at 99; nothing counts ticks; a tick with no
  position neither throws nor schedules. With no position the tick skips the panner update too (no transport, nothing
  sounds). Mutants: `at.sixteenth` → `0` killed 5 (position 83 among them), `paletteForMeasure(0)` killed 2 (the
  palette case among them), no start of `0` killed 1, the dropped `if (!at) return` killed 1. Blast radius: the 17
  files that mock `beatClock` or `harmonySystem`, or call `processMelodyStep`, 2,466 passed, 0 failed.
  audioDiagnostics.test's engine mock lost its `step: 1`.

  **Dependencies:** Tasks 3, 4.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (one module, three test files moved to the new call shape)

- [x] **Task 6: `AudioEngine.ts`, `powerController.ts` — nothing schedules or resets the harmony any more**

  **Description:** `AudioEngine.start` stops calling `scheduleHarmonyCycle`, `killAll` stops calling
  `stopHarmonyCycle`, and `powerController.start` stops calling `resetHarmony`. With Task 5 in, nothing reads the
  stored palette, so the music does not change. The assertions that `resetHarmony` is or is not called go with the
  call.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: `AudioEngine.start` does not schedule the harmony cycle.
  The test file mocks the harmony module, so the assertion is on that mock; Task 7 deletes the assertion with the
  name.

  **Acceptance criteria:**
  - [x] After `AudioEngine.start`, the mocked `scheduleHarmonyCycle` has not been called; after `killAll`, the mocked
        `stopHarmonyCycle` has not been called.
  - [x] `powerController.start` runs `AudioEngine.start`, `setBPM` and `reRegisterAllRobotsAudio`, as its test says
        without `resetHarmony`.
  - [x] Mutation: restore the `scheduleHarmonyCycle()` call fails the start test.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/systems/powerController.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** RED: both new cases failed on the calls being made. Edge case beyond the list: the power-on
  after a `killAll` schedules no cycle either. powerController.test.ts lost its harmony mock and both `resetHarmony`
  assertions (the start case and the resume-from-pause case); `pause()`'s comment no longer lists "the harmony" among
  what the BeatClock tick carries. Mutant: the restored `scheduleHarmonyCycle()` call killed 2 (the start case among
  them). AudioEngine, powerController and powerController.world tests: 472 passed.

  **Dependencies:** Task 5.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/systems/powerController.ts`,
  `src/systems/powerController.test.ts`

  **Estimated scope:** S (removing three calls and the assertions on them)

- [x] **Task 7: `harmonySystem.ts` — the stored palette and the old exports go**

  **Description:** Delete `availableNotes`, `lastPaletteIndex`, `scheduleId`, `scheduleHarmonyCycle`,
  `stopHarmonyCycle`, `resetHarmony`, `setAvailableNotes` and `getAvailableNotes`, with their tests and the test file's
  BeatClock mock, and drop the old names from `AudioEngine.test.ts`'s harmony mock. The module keeps
  `HARMONY_PALETTES`, `MEASURES_PER_PALETTE_ENTRY`, the `EighthNotes` type and `paletteForMeasure`, and no longer
  imports BeatClock.

  **Proof:** Read — a deletion. The suite staying green with the names gone is the check.

  **Acceptance criteria:**
  - [x] None of the eight names appears in `src/` (Task 6's mock assertions go with them).
  - [x] `harmonySystem.ts` imports nothing from `beatClock.ts`.

  **Verification:**
  - [x] `npx vitest run src/engine/harmonySystem.test.ts src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** A grep of `src` finds none of the eight names (the only `scheduleId` left is BeatClock's own
  local name for its schedule map, unrelated). `harmonySystem.ts` imports nothing at all (`devWarn` went with the
  repeat). harmonySystem.test.ts is the `paletteForMeasure` cases alone, with no clock mock; Task 4's "reads no
  module state" case went with `setAvailableNotes`, since the state it guarded no longer exists. Task 6's describe
  in AudioEngine.test.ts went with the names; the comment above the click-track note assertion now names
  `paletteForMeasure`. `MEASURES_PER_PALETTE_ENTRY`'s comment no longer mentions a schedule interval. The two files:
  453 passed.

  **Dependencies:** Task 6.

  **Files:** `src/engine/harmonySystem.ts`, `src/engine/harmonySystem.test.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** XS (deletions)

- [x] **Task 8: `audioSwells.ts` — the swell tick reads its own position**

  **Description:** `startAudioSwells` passes `positionAt(time)`'s precise measure (`sixteenth / 16`) to
  `tickAudioSwells`, not `getCurrentMeasurePrecise()` (spec §4.6). With no position the tick does nothing. What the
  swells do with the measure is unchanged. `audioSwells.test.ts`'s BeatClock mock gains `positionAt`.

  **Proof:** RED test — `src/systems/audioSwells.test.ts`: the tick hands `tickAudioSwells` the precise measure of its
  own time, while BeatClock's last measure says something else.

  **Acceptance criteria:**
  - [x] With `positionAt` returning sixteenth 83 and `getCurrentMeasurePrecise` returning 4, the swell tick advances
        swells at measure 5.1875.
  - [x] The existing swell tests pass with only the mock extended.
  - [x] Mutation: restore `getCurrentMeasurePrecise()` fails the test.

  **Done 2026-11-12.** The measure is `at.sixteenth / TICKS_PER_MEASURE` (the file's own 16). The test reads the
  measure the tick handed `tickAudioSwells` off the `startMeasure` of a swell created on that tick. One deviation
  from "only the mock extended": the transport-time block's `registeredTick` helper queued its measure on
  `getCurrentMeasurePrecise`; it now queues the same measure as a position on `positionAt`, and every case in it
  passes unchanged. RED: all three new cases failed on the old code (4, 4.9375, and a write on a tick with no
  position). Edge cases beyond the list: a tick on the bar reads measure 5 where BeatClock's last tick says 4.9375; a
  tick with no position neither throws, writes, nor moves a swell. The new block resets both clock mocks after each
  case, since a value queued for `getCurrentMeasurePrecise` is now never used and would otherwise reach a later test.
  Mutants: the restored `getCurrentMeasurePrecise()` killed 3 (the 5.1875 case among them), the dropped `if (!at)
  return` killed 1. The 12 files that mock `beatClock` (AudioEngine's ran in Task 5): 1,628 passed, 0 failed.

  **Verification:**
  - [x] `npx vitest run src/systems/audioSwells.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** XS

- [x] **Task 9: `AudioEngine.start` — register the ticks, set the tempo, then start the transport**

  **Description:** Move `transport.start()` to after `initBeatClock` and `startMelodyPlayback`, and set
  `transport.bpm.value` from the store's `bpm` (already read in `start`) before it (spec §4.5, §9 Q1). Everything else
  in `start` keeps its order. If Task 1 found a step that needs a started transport, this task does not run until
  Crawford decides.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: `initBeatClock` and the melody tick's `scheduleRepeat` are
  called before `transport.start`, and the tempo is set before it.

  **Acceptance criteria:**
  - [x] By call order, `initBeatClock` and the melody tick's registration both precede `transport.start()`.
  - [x] `transport.bpm.value` equals the store's `bpm` before `transport.start()` is called.
  - [x] A transport already started (a second `start` after a pause path) is not started again, as now.
  - [x] Mutation: put `transport.start()` back before the registrations fails the order test.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Done 2026-11-12.** `start` reads the store's `bpm` with the seeded state it already reads, then, after
  `initBeatClock` and `startMelodyPlayback`, writes `transport.bpm.value` (in a try, as `setBPM` does) and starts
  the transport if it is not started. The tempo is written whether or not the transport was already started. The
  `await` on `transport.start()` went (Task 1: it returns the transport, not a promise). The test transport records
  its tempo at its first `start` call. RED: the two order cases (start at call 142 and 304, before the registrations
  at 161 and 324) and the tempo case (120) failed; the already-started case passed, as a kept behaviour should.
  Mutants: `transport.start()` moved back before the registrations killed 3 (both order cases, and the tempo case
  once the recorder kept the first call's tempo: the mock never flips to `'started'`, so the mutant started it twice
  and the first version of the recorder read the second); the tempo write dropped killed 1. The stale comments Task 1
  named are reworded: the LFO priming's in `AudioEngine.ts` and `regenerateLfoBankFromSeed`'s in `audioStore.ts`
  name a running context, not a started transport. `AudioEngine.pause()`'s doc comment no longer lists "the
  harmony" (missed in Task 6). AudioEngine and audioStore tests: 558 passed.

  **Dependencies:** Tasks 1, 3, 5, 6.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

### Checkpoint: Core
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (full suite, foreground, logged to the
      scratchpad; any pre-existing, unrelated failure named).
      2026-11-12 at 9c1d5877: 13,950 passed, 2 skipped, 0 failed; types clean; lint 0 errors (the 4 existing
      `react-refresh` warnings); build clean (its existing warnings: `audioStore` and `robotLfoLinks` imported both
      dynamically and statically, and the 1.3 MB chunk).
- [ ] Crawford hard-reloads his dev page and powers on a world: it plays, and nothing sounds broken.
- [ ] Reviewed with Crawford before Phase 4.

---

### Phase 4: The proof

- [ ] **Task 10: the proof run — ten power-ons on the clock (spec §6.2)**

  **Description:** Backlog 82's probe (rewritten in the scratchpad, recipe in
  [CHORD_CYCLE_TIMING.md](CHORD_CYCLE_TIMING.md) Task 1), with the harmony rows replaced: at each melody firing it logs
  the tick count of the callback's time, BeatClock's measure before and after, and `paletteForMeasure` of the measure
  the step plays in. Ten power-ons of `?seed=charlie&x=200&y=-30` on `npx vite --port 5199 --strictPort`, each a fresh
  headless Chrome, one at a time in the foreground, no orphaned Chrome after. Results go in a table under this task.

  **Proof:** Measurement.

  **Acceptance criteria:**
  - [x] Every BeatClock and melody firing in every run sits on a multiple of 48 ticks (to within 0.01).
  - [x] The first firing of both is tick 0 in every run.
  - [x] BeatClock's measure turns on the bar's own tick in every run, never before it.
  - [x] At every step 1 the palette is entry `floor(measure / 2) % 12`: no late chord change in ten runs.
  - [x] The sequence of (measure, step, palette entry) is identical across the ten runs.
  - [x] The overlay's rows read as before (voices, sounding, events, tempo), and the console shows nothing new.
        (See the overlay note below: no pre-change overlay was recorded to compare with, and the overlay has no
        tempo row; the tempo is the transport's.)

  **Verification:**
  - [ ] The table, read by Crawford at the checkpoint below.

  **Done 2026-11-12.** Measured on this branch at 4b99707a (Tasks 2–9 in), dev server, headless Chrome,
  `?debug&seed=charlie&x=200&y=-30`. Ten runs, each a fresh Chrome, one at a time in the foreground (two or three per
  call), no orphaned Chrome after, the dev server's node process stopped after. Each run lasted until the melody tick
  had played measure 25, step 1 (about 88 s: 406 or 407 firings of each `16n` tick). Every run read PPQ 192 (a
  sixteenth is 48 ticks, a measure 768), 71 BPM at the first firing, a 100 ms lookahead, a 50 ms update interval and
  the worker clock.

  The probe (scratchpad, not committed) imports the page's own Tone, `beatClock.ts`, `harmonySystem.ts` and
  `AudioEngine.ts` by their resource URLs before the Power click, wraps `scheduleRepeat` on the transport instance
  (each firing logs its time, `getTicksAtTime(time)`, and BeatClock's measure before and after the callback) and
  wraps `AudioEngine.processMelodyStep` (each step logs the position the engine was handed, its tick count and the
  palette `paletteForMeasure` gives that measure). The analysis works the position out from the tick count itself
  and names the palette entry against its own copy of the table, so it does not reuse the code under test. It was
  tested before it was trusted: a copy of run 1 with the old faults written in (the melody's ticks 37.36 off the grid,
  a measure turned a sixteenth late at measure 5, measure 10's step 1 on the stale entry) was flagged on each, and
  run 1 against that copy failed the identical-sequence check.

  | Run | BeatClock firings | Melody firings | Off the grid (> 0.01) | Largest offset (ticks) | First firing (both) | Swell registered / first | Measure turns (on the bar) | Step 1s (right palette) | Steps off their tick count | Console |
  |---|---|---|---|---|---|---|---|---|---|---|
  | 1 | 407 | 407 | 0 | 8.2e-12 | 0 | 10 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 2 | 407 | 407 | 0 | 8.2e-12 | 0 | 5 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 3 | 406 | 406 | 0 | 5.5e-12 | 0 | 12 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 4 | 407 | 407 | 0 | 1.4e-11 | 0 | 10 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 5 | 407 | 407 | 0 | 8.2e-12 | 0 | 5 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 6 | 406 | 406 | 0 | 1.4e-11 | 0 | 8 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 7 | 406 | 406 | 0 | 5.5e-12 | 0 | 5 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 8 | 406 | 406 | 0 | 8.2e-12 | 0 | 10 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 9 | 406 | 406 | 0 | 8.2e-12 | 0 | 5 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |
  | 10 | 406 | 406 | 0 | 8.2e-12 | 0 | 10 / 48 | 25 (25) | 26 (26) | 0 | the Tone warning |

  **What the rows show.**
  - *Registrations.* Three in every run, each named by its call stack: BeatClock's tick (`initBeatClock`) and the
    melody tick (`startMelodyPlayback`), both `16n` with a start of `0`, registered with the transport stopped at tick
    0; and the swell tick (`startAudioSwells`), `16n` from `16n`, registered after the transport had started (at tick
    5 to 12). No fourth: the harmony repeat is gone, and nothing unexpected appeared.
  - *The grid.* Every BeatClock, melody and swell firing sits on a multiple of 48 ticks; the largest offset in any run
    is about 1e-11 ticks (float error). Consecutive firings are 48 ticks apart throughout, so no firing was lost. Both
    `16n` ticks fire first at tick 0 in every run (backlog 82 measured 41.9 to 132.9 before). The swell tick fires
    first at 48 in every run (before: 48, 96 or 144, depending on how far the transport had got).
  - *The measure.* BeatClock turns the measure 25 times per run (measures 1 to 25), each on the bar's own firing and to
    that bar's measure; no bar went by without a turn and nothing turned between bars. The first turn's tick count
    reads 767.9999999999998 in run 1: the rounding to the nearest sixteenth (spec §4.1) is what labels it bar 1.
  - *The chord.* Every step 1 (26 per run, measures 0 to 25) plays entry `floor(measure / 2) % 12`, and so does every
    other step: the entries at step 1 read `0 0 1 1 2 2 … 11 11 0 0` in every run. No late chord change at any of the
    260 bar starts.
  - *The position.* The position the engine handed `processMelodyStep` (sixteenth, measure, step) equals the one
    worked out from the step's own tick count at all 4,064 steps, and BeatClock's last measure equals the step's
    measure at every one (BeatClock's tick runs first on each shared sixteenth; nothing leans on that any more).
  - *Across runs.* The sequence of (measure, step, palette entry) for measures 0 to 24, 400 steps, is identical in all
    ten runs. Backlog 82 measured six different chord sequences in ten power-ons of this world.
  - *Console.* One warning per power-on, the same Tone warning backlog 82's runs saw with and without the probe
    ("Events scheduled inside of scheduled callbacks should use the passed in scheduling time"). Nothing else: no
    error, no exception.
  - *The overlay* (`?debug`, read 11 s after the Power click and at the end), the same in every run: `ctx running`,
    `transport started`, `events 9`, `bank 4/4`, `links 28/91`, `fin ok`; at 11 s `sounding 3/12`, voices 2 to 4 of
    16; at the end `sounding 7/12`, voices 3 to 7 of 16. The world played throughout. No overlay from before the
    change was recorded, so "as before" is that every row is present and reads as a healthy world, not a row-by-row
    comparison; the overlay has no tempo row, and the transport read 71 BPM at the first firing in every run.

  **Dependencies:** Tasks 2–9.

  **Files:** this file (the table). The probe is scratchpad only.

  **Estimated scope:** S

- [x] **Task 10a: the Click Track toggle back on the robot screen (added 2026-11-12, Crawford's ask)**

  **Description:** The checkpoint below listens on the Click Track, but its toggle had left the UI: the screens render
  `PingControlsCompositionSection`, which dropped it (docs/reference/layout-updates.md), while the engine path
  (`clickTrack.ts`, `registerRobotMelody`'s swap), the store field, the schema and the copy all stayed. The section
  takes an optional `onClickTrackActiveChange` and, with it and `DEV_TUNING`, renders the toggle first, before
  Density. The robot screen passes it, wired to `applyClickTrackActive`. The company screen passes none (no broadcast
  action exists for it), so it shows no toggle.

  **Proof:** RED test — `PingControlsDrawer.test.tsx` (the section) and `RobotScreen.test.tsx` (the wiring).

  **Acceptance criteria:**
  - [x] With a handler and `DEV_TUNING`, a Click Track switch renders before Density, reads the robot's flag, and a
        flip calls the handler once with the new state (on from off, off from on); it is disabled with the section.
  - [x] Without a handler, or with `DEV_TUNING` false, there is no switch.
  - [x] The robot screen passes the robot's flag (false when absent) and wires the flip to `applyClickTrackActive`.
  - [x] Mutation: each of the handler check, the `DEV_TUNING` check, the toggle's `disabled` and the robot screen's
        handler, removed, fails a test.

  **Done 2026-11-12.** RED: 6 failures (the 4 section cases above and the 2 screen cases; one screen case failed first
  on its fixture, two robots sharing the id `r1`, fixed to `r2`). Two cases passed before the change and are kept as
  guards: no switch under `DEV_TUNING` false, and every slider live while the Click Track plays. The sliders are not
  dimmed, unlike the old drawer: `registerRobotMelody` plays the click pattern whenever the flag is on, so a slider
  edit cannot override it; it changes the stored melody, heard once the Click Track is off. Mutants: all 4 killed, 1
  failure each. The three files (with CompanyScreen.test.tsx): 359 passed. Types clean; lint 0 errors. Where the
  toggle sits on the screen is for Crawford's look in the browser.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingControlsDrawer.test.tsx`,
  `src/components/panels/screen/screens/RobotScreen.tsx`, `src/components/panels/screen/screens/RobotScreen.test.tsx`

- [x] **Task 10b: the Click Track on the company and All Probes screens too (added 2026-11-12, Crawford's ask)**

  **Description:** Both screens render the Composition section through `useCompanySubsectionRenderer` on
  `useCompanyOptions` (a company id, or `'all'` for every robot, Freelance included). The hook gains
  `onClickTrackActiveChange`, on `onDensityChange`'s shape: `applyClickTrackActive` once per member, then
  `{ clickTrackActive }` patched into the company's `lastEditedOptions` (or `allRobotsLastEditedOptions`), a field the
  snapshot type and `resolveCompanyOptions` already carried. `CompanyOptionsSection` passes it to the section, so the
  toggle from Task 10a shows there too.

  **Proof:** RED test — `useCompanyOptions.test.ts` (the broadcast) and `CompanyOptionsSection.test.tsx` (the wiring).

  **Acceptance criteria:**
  - [x] A flip applies once per member with the new state (on and off) and records only `{ clickTrackActive }`.
  - [x] With the real action, every member stores the flag and the panel's value follows it, on then off.
  - [x] For `'all'`, every robot is reached (Freelance included) and the all-robots snapshot records it, no company's.
  - [x] A company that does not exist reaches nobody and records nothing; the handler keeps its identity across an
        unrelated edit and across its own.
  - [x] Mutation: the section's handler dropped, the broadcast dropped, the record dropped, and `active` → `true`
        each fail a test.

  **Done 2026-11-12.** RED: 8 failures (6 hook cases on "onClickTrackActiveChange is not a function", 2 section cases
  on the missing probe). Mutants: all 4 killed (2, 6, 4, 2 failures). The company, Composition and screens suites (14
  files): 1,202 passed. Types clean; lint 0 errors.

  **Files:** `src/components/company/useCompanyOptions.ts`, `src/components/company/useCompanyOptions.test.ts`,
  `src/components/company/CompanyOptionsSection.tsx`, `src/components/company/CompanyOptionsSection.test.tsx`,
  `src/components/robot/PingControlsDrawer.tsx` (comments)

### Checkpoint: By ear (spec §6.3)
- [ ] Crawford, after a hard reload: a robot on the testing-only Click Track (the toggle at the top of the
      Composition section on a robot, company or All Probes screen, dev server only, Tasks 10a and 10b), the downbeat
      heard where the chords change. Recorded here.
- [ ] His call: backlog 83 closes with 82, or stays open with what the listen found.

---

### Phase 5: The record

- [ ] **Task 11: docs — what shipped (spec §7)**

  **Description:** [HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md) (the palette is `paletteForMeasure`; the `2m` cycle,
  `resetHarmony` and `getAvailableNotes` sections go), [BEAT_CLOCK.md](../BEAT_CLOCK.md) (`MusicPosition`,
  `positionFromTicks`, `positionAt`; the tick's grid start and own-time read; `parseTransportPosition` gone),
  [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md) (the BeatClock paragraph, the power-on order, `getPolyphonyStats`' shape),
  [POLYPHONY_GUIDE.md](../POLYPHONY_GUIDE.md) (`getPolyphonyStats`' shape), [MELODY_SYSTEM.md](../MELODY_SYSTEM.md)
  (step 1 is the measure's first sixteenth, read from the clock). Every name spot-checked against the shipped source.
  Older specs and plans are not edited (spec §7).

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [ ] Each named function, type and order matches the shipped source.
  - [ ] No doc still describes the `2m` cycle, `stepCounter` or `transport.position` as current.

  **Verification:**
  - [ ] Manual review against the source.
  - [ ] `npm run lint` clean.

  **Dependencies:** Tasks 2–10.

  **Files:** the five docs above.

  **Estimated scope:** S (docs only)

- [ ] **Task 12: backlog — 82's figures, 83's outcome, backlog 7's note**

  **Description:** Backlog 82's entry gets Task 10's figures and is marked fixed. Backlog 83's gets the listen's outcome
  (fixed, or what stays open). Backlog 7's line that `powerController.start` calls `resetHarmony()` is updated to the
  palette being a function of the measure. This file's status line; the spec's status line.

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [ ] Each entry states what was measured and heard, with the figures, and nothing it did not show.

  **Verification:**
  - [ ] Crawford's read.

  **Dependencies:** Task 10, Checkpoint: By ear.

  **Files:** `docs/todo/backlog.md`, this file, `docs/specs/ONE_MUSIC_CLOCK.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every acceptance criterion above met, or flagged here with the reason.
- [ ] Docs match the shipped source.
- [ ] Ready for Crawford's PR.

- [ ] **Task 13: archive, after the merge**

  **Description:** Backlog 82 and 83 (if 83 closed) move to the backlog archive with their links rebased; their
  plan.md lines go; CHORD_CYCLE_TIMING.md, this plan, the spec and the intent stay live where they are, as archived
  phases' docs do. Backlog 86 and 87 keep pointing at the intent.

  **Proof:** Read.

  **Acceptance criteria:**
  - [ ] No link to 82 or 83 is broken (each points into the archive).

  **Verification:**
  - [ ] Crawford's read.

  **Dependencies:** The PR merged.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`

  **Estimated scope:** XS

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Something in `AudioEngine.start` needs a started transport, so starting it last breaks priming | High | Task 1 reads every step before Task 9 moves anything; Task 9 waits on Crawford if Task 1 finds one; Task 10 checks the overlay's LFO bank and links rows live. |
| A reader fires off the grid and rounding labels it with the wrong sixteenth | Medium | Every reader is given a grid start (Tasks 3, 5; the swells already are); Task 10 measures every firing's tick. |
| A test file mocks `beatClock` or `harmonySystem` without a new export and throws | Low | Each task names the mocks it extends (Tasks 5, 7, 8); the full suite runs at each checkpoint. |
| A new reader later leans on another tick having run first on the same sixteenth | Medium | Every reader takes its position from its own `time` (Architecture Decisions); the swell tick is moved off BeatClock's last value for this reason (Task 8). |
| Crawford's open dev page keeps the old engine after an HMR swap and sounds wrong or silent | Medium | The hard-reload note in the Overview, at both checkpoints that involve listening. |
| The velocity and humanize patterns change, and that reads as a regression | Low | Accepted pre-v1 (spec §1.3); the determinism test in Task 5 and Task 10's identical runs are the new contract. |
| A tempo set before `transport.start()` does not hold | Low | Task 9's test asserts the value before start; Task 10 reads the tempo row live. |

## Open Questions

1. The spec's three questions: **resolved** 2026-11-12, all as recommended (Architecture Decisions).
2. Whether a pause and resume keeps every position in step: **expected yes** (the context's suspend freezes the
   transport's ticks), not measured by Task 10. Backlog 83 lists it as open; Task 12 carries it forward if the listen
   does not settle it.
