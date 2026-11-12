# Measurement Plan: The Chord Cycle's Timing

Source: backlog [82](../todo/backlog.md#82-audio-the-chord-cycle-does-not-always-change-on-time). No spec and no intent
doc: this plan builds nothing. It measures one thing on `main`, whether the lead recorded in the backlog entry on
2026-11-12 is the cause, and stops at a gate where Crawford decides what, if anything, is built. A fix gets its own
interview and spec after the gate.

**Status:** written 2026-11-12, not started.

## Overview

One probe, ten power-ons of one world, two tables, one gate. Nothing under `src/` changes, so no task has a RED test:
a task's Proof is a measurement (a filled table in this file) or a Read. The probe is a scratchpad script and is not
committed; what it found is.

The same log also answers the first question of backlog
[83](../todo/backlog.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure) (which of the two clocks is off
the sixteenth it claims), so Task 2 records that too. 83 stays its own item.

## What the lead says

Read from the source on 2026-11-12, Tone 15.1.22. None of it has been measured.

Four repeats sit on the transport after a power-on:

| Repeat | Registered at | Interval | Start time passed |
|---|---|---|---|
| BeatClock's tick | `initBeatClock`, `src/engine/beatClock.ts` | `16n` | none |
| The melody tick | `startMelodyPlayback`, `src/engine/AudioEngine.ts` | `16n` | none |
| The harmony cycle | `scheduleHarmonyCycle` through BeatClock's `scheduleRepeat` | `2m` | `2m` |
| The swell tick | `src/systems/audioSwells.ts` through BeatClock's `scheduleRepeat` | `16n` | `16n` |

- **A repeat with no start time starts where the transport is.** `Transport.scheduleRepeat` turns its start into
  ticks with `TransportTime`, and a `TransportTime` with no value is `transport.seconds`. `AudioEngine.start` awaits
  `transport.start()`, primes the LFO bank and awaits a dynamic import before it registers anything. If the transport
  has moved by then, BeatClock's tick and the melody tick run at an offset from the bar that is fixed for that
  power-on and different on the next. The harmony cycle and the swell tick are given a start, so they sit on the bar.
- **On a shared tick the harmony callback runs before BeatClock's.** Tone runs same-tick events in the order they
  were added to its timeline (`Timeline.add` puts a new event after the last one with the same time), and a repeat
  adds each firing two intervals ahead (`TransportRepeatEvent`). The `2m` event for a boundary is added four measures
  before it; BeatClock's `16n` event is added two sixteenths before it.
- **So the harmony callback reads a measure BeatClock has not yet turned over.** It derives the entry already in
  force and changes nothing until it next fires: one entry, two measures, late.
- **It is on time only when BeatClock's previous tick read ahead.** BeatClock parses `transport.position`, which is
  the position at Tone's "now" (the audio clock plus the lookahead, the end of the clock loop's pass), not at the
  tick's own time. A tick processed in a pass that already reaches the boundary reads the new measure early.

## Predictions

Each is settled by the tables in Task 2. A sixteenth is 48 ticks and a measure 768 at Tone's default 192 PPQ; the
probe reads `transport.PPQ` and does not assume it.

- **P1.** BeatClock's tick and the melody tick start at a tick that is not a multiple of 48 in at least some runs, and
  the start differs from run to run. The harmony cycle starts at tick 1536 and the swell tick at 48 in every run.
  *Refuted if* both start at 0 in all ten runs: the awaits resolve before the audio clock moves, and the offset is
  not part of the cause.
- **P2.** At a harmony firing where the palette does not change, the measure the callback read is the boundary's
  measure minus one. *Refuted if* a late firing read the right measure: the cause is somewhere else.
- **P3.** Where BeatClock's tick and the harmony callback share a tick, the harmony callback runs first, every time.
  *Refuted if* the order varies.
- **P4.** At every on-time firing, BeatClock's last tick before the boundary had already read the boundary's measure.
  *Refuted if* a firing is on time with BeatClock still on the old measure.
- **P5.** Within a run, the share of on-time firings follows the gap between BeatClock's last tick and the boundary:
  a run whose gap is longer than the clock loop's reach is late throughout, one whose gap is inside it is on time
  throughout, one near the edge is mixed. *Refuted if* runs with the same gap behave differently and Task 3's
  slowed runs do not explain it.

If P2 to P4 hold, the cause is established whatever P1 and P5 show: the harmony callback reads state that another
callback writes, and nothing orders the two in its favour.

## Task List

- [ ] **Task 1: the probe, and proof that it is live**

  **Description:** A scratchpad Node script on `scripts/perf/cdp-lib.mjs`'s `withChrome`, against a dev server on its
  own port (`npx vite --port 5199 --strictPort`, `main`'s tree). It follows `withPoweredWorld`'s sequence by hand,
  because it needs a step between page load and the Power click: open the sighting's world
  (`?seed=charlie&x=200&y=-30`), wait for the Power button, install the hook, then click.

  The hook imports the page's Tone module (its URL is in `performance.getEntriesByType('resource')`) and the app's
  own `beatClock.ts` and `harmonySystem.ts` instances (`import('/trace-atlas/src/engine/...')`), then wraps
  `scheduleRepeat` on the transport instance `Tone.getTransport()` returns. The app's context is installed at import
  (`src/engine/audioContextSetup.ts`), so that instance is the one `AudioEngine.start` uses. It records:

  - at each registration: its order, the interval and start time passed, and `transport.ticks`;
  - at each firing, before and after the wrapped callback: the callback's `time`,
    `transport.getTicksAtTime(time)`, `transport.position`, `getCurrentMeasure()` and `getAvailableNotes()`;
  - once: `transport.PPQ`, the tempo, and the context's `lookAhead` and `updateInterval`.

  The hook makes no Tone write and schedules nothing. A registration is named by its arguments, not its order alone:
  the first `16n` with no start is BeatClock's, the second the melody's, the `2m` is the harmony cycle, the `16n` with
  a start is the swell tick.

  **Proof:** Measurement. One run's log shows the four registrations above and no others, BeatClock's tick firing
  every 48 ticks, and the harmony callback firing every 1536.

  **Acceptance criteria:**
  - [ ] The four repeats are seen and named; an unexpected fifth is reported, not ignored.
  - [ ] The app's own values (`getCurrentMeasure()`, the palette) and the transport's are both in every firing's row.
  - [ ] The page's console shows no error the probe caused, and the world still sounds (the overlay's rows read as
        they do without the probe).

  **Dependencies:** None.

  **Files:** scratchpad only. Nothing committed.

  **Estimated scope:** S (one script, on a recipe used before).

- [ ] **Task 2: ten power-ons, and the two tables**

  **Description:** Ten runs, each a fresh Chrome, one at a time in the foreground
  ([PERFORMANCE.md](../PERFORMANCE.md), "Measurement hygiene"). Each run lasts until the harmony callback has fired
  twelve times (measure 24). Fill the tables below from the logs.

  **Proof:** Measurement. Both tables filled, and each of P1 to P5 marked held or refuted with the rows that show it.

  **Acceptance criteria:**
  - [ ] Table 1 has a row per run and Table 2 a row per run.
  - [ ] Each prediction is marked from the rows, with no prediction left "probably".
  - [ ] For backlog 83: across the runs, the tick count of each melody tick that plays step 1 and of each BeatClock
        tick that turns the measure, as offsets from the bar, and whether either repeat lost its first firing.

  **Dependencies:** Task 1.

  **Files:** this file (the tables and the findings).

  **Estimated scope:** S.

- [ ] **Task 3: slowed runs (only if P5 is unsettled)**

  **Description:** Five more runs under CDP's `Emulation.setCPUThrottlingRate` (4), which lengthens the clock loop's
  passes. The lead predicts more on-time firings at the same start offset. Skipped, and marked skipped here, if
  Task 2 settles P5 or refutes P2 to P4.

  **Proof:** Measurement. Five rows added to Table 2, marked as slowed.

  **Dependencies:** Task 2.

  **Files:** this file.

  **Estimated scope:** XS.

- [ ] **Task 4: the findings go into the record**

  **Description:** Backlog 82's entry: the lead paragraph becomes what was measured, with the figures; its "To find
  out" list is marked item by item (answered, or still open). Backlog 83's entry: what Task 2 showed for its first
  question, and what is still to hear. The status line above.

  **Proof:** Read. Crawford's review.

  **Dependencies:** Task 2 (and Task 3 if run).

  **Files:** `docs/todo/backlog.md`, this file.

  **Estimated scope:** XS (docs only).

### Gate A: Crawford reads the findings

- [ ] The cause is established, or the plan says plainly that it is not and what was ruled out.
- [ ] His decision on what is built. The candidates, named here and designed nowhere yet:
  - the palette as a pure function of the transport's tick count at a note's own time, read when the note is
    scheduled, with no harmony repeat and no stored entry (his "redundant code" question);
  - BeatClock's measure derived from each tick's own time and not from `transport.position`, with its tick started
    on the bar, which would also move everything else that reads the measure.
- [ ] Whether backlog 83 is answered by the same log, or still needs its listen with the Click Track.
- [ ] Whichever is chosen changes the timing path CLAUDE.md asks about before changing, so it goes through an
      interview and a spec, not straight into a branch.

## Tables

**Table 1: where each repeat starts.** Ticks. Offset is the start modulo 48.

| Run | BPM | BeatClock start | Offset | Melody start | Offset | Harmony start | Swell start | A first firing lost? |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |

**Table 2: the twelve harmony firings of each run.** "Late" is a firing that read the boundary's measure minus one
and left the palette as it was. "Gap" is from BeatClock's last tick before a boundary to the boundary, in
milliseconds at the run's tempo.

| Run | Gap (ms) | On time | Late | Ran first on a shared tick | Entries by firing | Slowed? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

**Findings.** Not yet measured.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The probe changes the timing it measures | Medium | It wraps callbacks and reads; it writes nothing to Tone and schedules nothing. Task 1 compares the overlay's rows with and without it. |
| A dev server's load timing is not a production build's, so the start offsets differ where players are | Low | P2 to P4 do not depend on the offset. If the gate turns on P1 or P5, a production run is added then, with logging lines on a throwaway branch, since a bundle offers no module URLs to hook. |
| The sighting came from the spike branch and does not happen on `main` | Low | The code it passed through is the same on `main`. Ten runs with every firing on time and P3 refuted would say so, and backlog 82 would close with nothing built. |
| Headless Chrome's clock loop is not a phone's | Low | The lead's mechanism is ordering, not speed. Task 3 varies the speed on purpose. |

## Open Questions

1. Does the transport move between `transport.start()` and the registrations? **Open**: P1 answers it.
2. Does a replay from power-on give the same chords? **Open**: Table 2's "Entries by firing" column answers it for
   ten power-ons of one world.
3. What backlog [79](../todo/backlog.md#79-robots-move-in-time-with-their-own-melody)'s early announcements should
   read once the cycle is predictable. **Open**, and not this plan's: it is settled when 79 is picked up again,
   against whatever the gate decides.
