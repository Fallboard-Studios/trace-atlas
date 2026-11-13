# Phase Spec: One Music Clock — the Chord, the Measure and the Melody Step Read from the Transport

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`, or one file: `npx vitest run src/engine/beatClock.test.ts`
> - Build check: `npm run build`
> - The proof run (§6.2): `npx vite --port 5199 --strictPort`, then backlog 82's probe (a scratchpad script on
>   [cdp-lib.mjs](../../scripts/perf/cdp-lib.mjs), recipe in [CHORD_CYCLE_TIMING.md](../tasks/CHORD_CYCLE_TIMING.md)
>   Task 1), ten power-ons, one at a time in the foreground

**Status:** spec written 2026-11-12 from [docs/intent/one-music-clock.md](../intent/one-music-clock.md) (interview of
the same day), after backlog 82's measurement passed its Gate A ([CHORD_CYCLE_TIMING.md](../tasks/CHORD_CYCLE_TIMING.md)).
Backlog items [82](../todo/archive/backlog-archive.md#82-audio-the-chord-cycle-does-not-always-change-on-time) and
[83](../todo/archive/backlog-archive.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure). Part one only; part two is backlog
[86](../todo/backlog.md#86-world-move-the-whole-world-to-a-measure). **Approved by Crawford 2026-11-12**, with §9's
three questions resolved as recommended: the ticks register before the transport starts, `getPolyphonyStats().step`
goes, and the named removals go. Plan: [docs/tasks/ONE_MUSIC_CLOCK.md](../tasks/ONE_MUSIC_CLOCK.md). **Built
2026-11-12** (plan Tasks 1–12): §6.1 green, §6.2 met in ten of ten runs (figures in backlog 82's entry), §6.3 passed by
ear, §7's docs updated. Merged PR #635 2026-11-12; backlog 82 archived, and 83 after Crawford's listen across a pause
and resume the same day (heard, not measured).

---

## 1. Objective

### 1.1 What is built

Every musical value that today keeps its own running count is read from the Tone transport's tick count at the time it
is for:

- **The measure.** BeatClock's `16n` tick turns the measure from its own callback time, not from `transport.position`
  read at Tone's "now".
- **The chord palette.** Worked out from the measure of the note being scheduled. The harmony system's `2m` repeat and
  its stored entry go.
- **The melody step.** Worked out from the melody tick's own time. `stepCounter` goes.
- **The velocity and humanize position.** The same tick-derived count, so a roll keys off where the note is in the
  music, not how many ticks have run since power-on.

And the two `16n` repeats that pass no start time today start on the transport's sixteenth grid.

### 1.2 Why

Measured in backlog 82 (ten power-ons, 120 chord changes): BeatClock's tick and the melody tick start wherever the
transport has reached when `AudioEngine.start` registers them, 37 to 83 ticks after `transport.start()`. So BeatClock
turns the measure 1.4 to 41.9 ticks after each bar, the harmony repeat on the bar reads the old measure (102 of 120
changes one entry late), and step 1 sits 0.87 to 1.87 sixteenths after the downbeat. Which changes are on time depends
on clock passes, so one world plays different chords on each power-on.

Crawford's reason to fix it now (the intent's "Why now"): tracking measures, moving the player to a measure, changing
chord palettes, and later loops, recordings from one measure to another and links at a measure all need one promise:
**the same world at the same measure plays the same notes.** A running count breaks it the moment the clock moves.

### 1.3 The user-visible result

- Each chord holds for exactly two measures, changing on the bar, on every power-on.
- Step 1 of every melody sounds on the measure's downbeat (and with it the motif accent MELODY_SYSTEM.md calls the
  downbeat).
- The same world plays the same notes (pitch, timing, velocity, humanize nudge) at the same measure on every power-on.
- Pre-v1: the chord sequence, the velocity pattern and the humanize pattern all change from today's. That is accepted
  (no "keep the existing sound" constraint).

### 1.4 Out of scope

From the intent, unchanged: moving the world to a measure (backlog 86); the global LFOs and effect tails matching the
clock; any UI (a measure readout, a move control, a palette picker, loops, recording, links); a history of past
settings; the Click Track listen, which becomes a check after this lands (§6.3). Also out: any change to what the
swells or the docking lifecycle do with a measure. They only receive a measure that turns on the bar.

---

## 2. Tech Stack

Unchanged: TypeScript 5.9, Tone.js 15.1.22 (the transport's `getTicksAtTime(time)` and `PPQ`, both public), Vitest.
No new dependency.

Facts this spec rests on, read from Tone 15.1.22's source and confirmed by backlog 82's probe:

- `Transport.scheduleRepeat(cb, interval, startTime)` turns a missing `startTime` into the transport's current
  position (the cause of the offset). A start already behind the transport is moved on to the next whole interval
  after it (`TransportRepeatEvent._restart`), so a start of `0` lands on the next sixteenth of the grid.
- A repeat registered while the transport is stopped is laid out again from the start time when the transport starts
  (`TransportRepeatEvent` listens for `start`), so a repeat registered before `transport.start()` with a start of `0`
  fires first at tick 0.
- `TransportEvent` floors a fractional start tick and adds the remainder back to the callback's `time`. On the grid
  there is no remainder: the callback's time is the sixteenth's own time.
- At Tone's default 192 PPQ a sixteenth is 48 ticks and a measure 768 (`BEATS_PER_MEASURE` = 4,
  [constants](../../src/constants/index.ts)). The code reads `transport.PPQ`; it never assumes 192.

---

## 3. Project Structure: what changes, file by file

```
src/engine/
├── beatClock.ts          # TransportLike gains getTicksAtTime + PPQ, loses position; new MusicPosition,
│                         #   positionFromTicks (pure), positionAt(time); the internal 16n tick starts at 0 and
│                         #   reads positionAt(time); parseTransportPosition removed
├── beatClock.test.ts     # position math, tick start, measure turn from time, listener notification
├── harmonySystem.ts      # paletteForMeasure(measure) (pure); the 2m repeat, the module state and
│                         #   scheduleHarmonyCycle/stopHarmonyCycle/resetHarmony/setAvailableNotes/getAvailableNotes removed
├── harmonySystem.test.ts # rewritten for paletteForMeasure; tests of removed functions deleted with them
├── AudioEngine.ts        # start(): ticks registered before transport.start(), tempo set first (§4.5, Q1);
│                         #   the melody tick starts at 0 and passes positionAt(time); processMelodyStep takes a
│                         #   MusicPosition; stepCounter, the harmony calls and getPolyphonyStats().step removed (Q2)
└── AudioEngine.test.ts   # processMelodyStep and start() tests move to the new shapes
src/systems/
├── audioSwells.ts        # the swell tick reads positionAt(time) for its measure, not BeatClock's last tick (§4.6)
├── audioSwells.test.ts   # one test for that
├── powerController.ts    # the resetHarmony() call goes
└── powerController*.test.ts  # assertions on resetHarmony go
docs/
├── HARMONY_SYSTEM.md, BEAT_CLOCK.md, AUDIO_SYSTEM.md, POLYPHONY_GUIDE.md, MELODY_SYSTEM.md   # §7
└── todo/backlog.md       # 82 and 83 closed on merge; backlog 7's note on resetHarmony updated (§7)
```

Nothing under `src/components`, `src/stores` or `src/animation` changes. No state shape changes; nothing persisted or
on a link changes.

---

## 4. Behaviour

### 4.1 The music position

One type and two functions in [beatClock.ts](../../src/engine/beatClock.ts), so every reader shares one definition:

```ts
/** Where a moment sits in the music, counted from the transport's tick 0. */
export interface MusicPosition {
  /** Sixteenths since tick 0: the roll position for velocity and humanize. */
  sixteenth: number;
  /** Measures since tick 0, never wrapping. */
  measure: number;
  /** 1..16, the melody step this sixteenth plays. */
  step: number;
}

/** Pure: the position of a tick count. Rounds to the nearest sixteenth, so a tick a hair either side of the grid
 *  (float error in getTicksAtTime) reads as the sixteenth it is on. */
export function positionFromTicks(ticks: number, ppq: number): MusicPosition {
  const sixteenth = Math.round(ticks / (ppq / 4));
  const perMeasure = BEATS_PER_MEASURE * 4;
  return { sixteenth, measure: Math.floor(sixteenth / perMeasure), step: (sixteenth % perMeasure) + 1 };
}

/** The position at an audio-clock time (a transport callback's `time`), or undefined with no transport. */
export function positionAt(time: number): MusicPosition | undefined;
```

Rounding is safe because every repeat that reads a position fires on the grid (§4.2, §4.4, §4.6). A reader off the
grid would be told the nearest sixteenth; none exists after this change.

### 4.2 BeatClock's tick

- Registered with a start of `0` (`scheduleRepeat(cb, '16n', 0)`), so it fires on the sixteenth grid whether it is
  registered before the transport starts (from tick 0) or after (from the next sixteenth).
- Its callback takes `time`, reads `positionAt(time)` and sets the current beat and measure from it. Nothing reads
  `transport.position` any more; `parseTransportPosition` and the `position` field of `TransportLike` go.
- It notifies measure listeners exactly as now: once per change, with the real, never-wrapping count. The change now
  lands on the bar's own tick, so the docking lifecycle, the swells' measure and `createdAtMeasure` see a measure that
  turns on the bar.
- `getCurrentBeat`, `getCurrentMeasure`, `getCurrentMeasurePrecise` and `subscribeToMeasure` keep their signatures and
  meaning: the position of the last tick that ran.

### 4.3 The chord palette

- [harmonySystem.ts](../../src/engine/harmonySystem.ts) keeps `HARMONY_PALETTES` and `MEASURES_PER_PALETTE_ENTRY`, and
  exports one pure function:

  ```ts
  /** The palette a measure plays: entry floor(measure / 2) % 12, as a copy. */
  export function paletteForMeasure(measure: number): string[];
  ```

- Removed: `availableNotes`, `lastPaletteIndex`, `scheduleId`, `scheduleHarmonyCycle`, `stopHarmonyCycle`,
  `resetHarmony`, `setAvailableNotes`, `getAvailableNotes`. Each has one production caller (AudioEngine's `start` and
  `killAll`, `powerController.start`, `processMelodyStep`) or none (`setAvailableNotes`, tests only), and each caller
  changes with it.
- "Worked out, not remembered": the palette at a measure depends on the measure and the table, nothing else. After a
  future palette change (backlog 7), an earlier measure plays the palettes as they are then set; nothing keeps a
  history. This spec adds no palette setting; it leaves `paletteForMeasure` as the one place one would enter.

### 4.4 The melody tick and processMelodyStep

- The melody tick in `startMelodyPlayback` is registered with a start of `0`, like BeatClock's. Its callback reads
  `positionAt(time)` and calls `processMelodyStep(position, time)`. A tick with no position (no transport) does
  nothing.
- `processMelodyStep(at: MusicPosition, time: number)`: the events for `at.step`, the palette
  `paletteForMeasure(at.measure)`, and `at.sixteenth` as the position for `humanizeOffsetFor` and `scheduleNote`'s
  `position`. The rest of the function (articulation, accents, `MIN_LEAD`, humanize, the Click Track) is unchanged.
- `stepCounter` goes, with its reset in `killAll`.
- The roll position changes meaning, from "ticks since playback started" to "sixteenths since the transport's tick 0".
  `NoteParams.position`'s comment says so. After a power-on both start at 0, so on a cold start the two agree when
  nothing was lost; the new one also agrees after anything moves the transport (backlog 86).

### 4.5 The power-on order (Q1)

Recommended: `AudioEngine.start` registers BeatClock's tick and the melody tick **before** it starts the transport, and
sets the transport's tempo from the store (`useAudioStore.getState().bpm`, which `start` already reads) before starting
it. Then the first firing of both is tick 0: measure 0, step 1, nothing lost, at the world's tempo from the first
sixteenth. The LFO priming, the rooms and the robot links run before the transport starts; they need a running
AudioContext (`Tone.start()`), not a started transport ([lfoShared.ts](../../src/engine/lfoShared.ts) gates on the
context). The plan's first task confirms that before moving anything. `powerController.start`'s `setBPM` stays: the
same value again, and it is the path a later tempo edit takes.

The alternative (Q1's other option) leaves the order alone. With a start of `0` the ticks still sit on the grid, but
the first one to fire is whichever sixteenth comes after the awaits, so measure 0 begins partway and its first one or
two steps never sound, as today.

### 4.6 The swells

The swell tick ([audioSwells.ts](../../src/systems/audioSwells.ts)) passes `positionAt(time)`'s precise measure
(`sixteenth / 16`) to `tickAudioSwells`, not `getCurrentMeasurePrecise()`. Today it relies on BeatClock's tick having
run first on the same sixteenth, which follows from Tone running same-tick events in the order they were added. That
order was read from the source and never measured (backlog 82's P3 stayed untested), so the swell stops depending on
it. The swell already starts on the grid (BeatClock's `scheduleRepeat` passes the interval as the start). What the
swells do with a measure is unchanged.

### 4.7 What does not change

- The in-world day: wall clock from `dayStartTimestamp`, untouched (CLAUDE.md guardrail).
- Pause and resume: suspending the context freezes the transport's ticks and resuming continues them, so positions
  continue too. Nothing to add.
- A world replaced while paused: `killAll` still rewinds the transport to 0 and resets BeatClock; the next power-on is
  a full start (§4.5).
- `getTickSeconds`, the swells' writes at the callback time, `MIN_LEAD`, `MAX_POLYPHONY`, the voice paths.
- Melodies: still note indices 0..7 (the Melody Logic guardrail); only the palette that turns an index into a pitch is
  looked up differently.

---

## 5. Code Style

As the files already are: named exports, a short doc comment on each export that says what it returns and why, pure
helpers beside the stateful code that uses them (`positionFromTicks` beside the tick, as `paletteForMeasure` beside the
table), `devWarn` for a defensive failure, no new module-level state. The snippets in §4.1 and §4.3 are the shape. A
removed function goes with its tests and its doc mentions in the same task; nothing is left deprecated.

---

## 6. Testing Strategy and Success Criteria

RED first for every task with behaviour, one commit per task, a mutation check on each new guard (the repo's TDD
workflow). Tests import and run the code; none reads source or doc text (CLAUDE.md). The docs task has no test; its
proof is a read.

### 6.1 Unit tests (Vitest)

- **`positionFromTicks`:** tick 0 → sixteenth 0, measure 0, step 1; 48 → step 2; 720 → step 16; 768 → measure 1,
  step 1; 767.9999 and 768.0001 → measure 1, step 1 (the rounding); a PPQ other than 192 gives the same positions at
  the same musical points.
- **BeatClock:** the internal tick registers with a start of `0`; given a mock transport whose `getTicksAtTime` maps a
  time to a tick count, a callback at the bar's tick turns the measure and notifies listeners once; a callback a
  sixteenth before the bar does not, even if a `position` field would read the next measure (the read-ahead backlog 82
  measured cannot happen).
- **`paletteForMeasure`:** measures 0 to 25 give entries floor(m / 2) % 12; returns a copy.
- **`processMelodyStep`:** at a position of measure 5, step 4 it plays the step-4 events with palette entry 2 and
  passes `position` 83 (5 × 16 + 3) to `scheduleNote` and to the humanize roll; the same position twice gives the same
  `scheduleNote` arguments (the determinism the intent asks for, at the unit level).
- **AudioEngine.start (Q1 as recommended):** the two `16n` repeats are registered with a start of `0` before
  `transport.start()`, and the transport's tempo is the store's before it starts.
- **The swell tick:** `tickAudioSwells` receives the precise measure of its own callback's time.

### 6.2 The proof run (live)

Backlog 82's probe, adjusted for the removed harmony repeat (it logs the palette at each melody tick from
`paletteForMeasure` instead), ten power-ons of `?seed=charlie&x=200&y=-30` on a dev server:

- Every BeatClock and melody firing sits on the grid (its tick count is a multiple of 48 to within float error) in
  every run.
- With Q1 as recommended: the first firing of both is tick 0 in every run.
- BeatClock's measure turns on the bar's own tick in every run, never before it.
- At every step 1, the palette entry is floor(measure / 2) % 12: 0 late chord changes in ten runs.
- The sequence of (measure, step, palette entry) is the same in all ten runs.
- The overlay reads as it did before (voices, sounding, events), and the console shows no new error.

### 6.3 By ear (Crawford)

After a hard reload (Ctrl+Shift+R) of his dev page: backlog 83's Click Track on a robot, with the downbeat heard where
the chords change. A check, not a gate on the code; what it finds decides whether 83 closes with 82 or stays open.

### 6.4 Done

All of §6.1 green; `npm run build:types`, `npm run lint` and `npm test` clean; §6.2 met and its figures written into
backlog 82's entry; §7's docs updated; Crawford's listen (§6.3) recorded.

---

## 7. Docs

Updated in the docs task, after the code:

- [HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md): the palette is `paletteForMeasure(measure)`; the `2m` cycle, `resetHarmony`
  and `getAvailableNotes` sections go; the playback example reads the palette for the note's measure.
- [BEAT_CLOCK.md](../BEAT_CLOCK.md): the tick starts on the grid and reads its own time; `MusicPosition`,
  `positionFromTicks`, `positionAt`; `parseTransportPosition` gone.
- [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md): the BeatClock paragraph (no more polling `transport.position`), the power-on
  order, `getPolyphonyStats` if Q2 removes `step`.
- [POLYPHONY_GUIDE.md](../POLYPHONY_GUIDE.md): `getPolyphonyStats`' shape, if Q2 removes `step`.
- [MELODY_SYSTEM.md](../MELODY_SYSTEM.md): step 1 is the measure's first sixteenth, read from the clock.
- [backlog.md](../todo/backlog.md): 82 and 83 close on merge (archived the usual way); backlog 7's note that
  `powerController.start` calls `resetHarmony()` is updated.

Older specs and plans that describe `stepCounter` or the harmony repeat (ROBOT_PERFORMANCE, HARMONY_PALETTE_SEQUENCING,
BEATCLOCK_TRANSPORT_TIME, OFF_SCREEN) are records of their time and are not edited.

---

## 8. Boundaries

- **Always:** every musical value from the transport through `positionAt` / `positionFromTicks`; audio through
  AudioEngine and BeatClock; `MIN_LEAD` on every note; RED first and one commit per task; warn Crawford to hard-reload
  his dev page after any edit under `src/engine` or `src/systems` (an HMR swap has split the audio graph before).
- **Ask first:** anything that touches the LFO bank, the Free/Sync toggle or the effects' timing; any change to what
  the docking lifecycle or the swells do with a measure; moving `transport.start()` if the plan's first task finds the
  priming does need a started transport; adding a dependency.
- **Never:** a timer outside the transport (`setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask`) for
  musical timing; a new running count kept beside the clock; a position, palette or step stored in Zustand; reading
  `transport.position` for a musical decision; a test that reads source or doc text.

---

## 9. Open Questions (resolved 2026-11-12, all as recommended)

1. **The power-on order (§4.5).** **Resolved:** the two ticks register before the transport starts, with the tempo set
   first, so measure 0 plays from step 1.
2. **`getPolyphonyStats().step`.** It reads `stepCounter`, which goes, and no app code reads the field (the overlay
   reads `voices` and `maxVoices`). **Resolved:** removed.
3. **The removals.** **Resolved:** `resetHarmony`, `setAvailableNotes`, `getAvailableNotes`, `scheduleHarmonyCycle`,
   `stopHarmonyCycle` and `parseTransportPosition` all go, with their tests.
