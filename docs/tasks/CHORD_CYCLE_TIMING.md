# Measurement Plan: The Chord Cycle's Timing

Source: backlog [82](../todo/archive/backlog-archive.md#82-audio-the-chord-cycle-does-not-always-change-on-time). No spec and no intent
doc: this plan builds nothing. It measures one thing on `main`, whether the lead recorded in the backlog entry on
2026-11-12 is the cause, and stops at a gate where Crawford decides what, if anything, is built. A fix gets its own
interview and spec after the gate.

**Status:** measured 2026-11-12 (Tasks 1, 2 and 4 done, Task 3 skipped). The cause is established, by a different
route from the one the lead named: see Findings. Gate A passed the same day: both fixes, as one (see the gate). Next is
the interview and spec; this plan builds nothing further.

## Overview

One probe, ten power-ons of one world, two tables, one gate. Nothing under `src/` changes, so no task has a RED test:
a task's Proof is a measurement (a filled table in this file) or a Read. The probe is a scratchpad script and is not
committed; what it found is.

The same log also answers the first question of backlog
[83](../todo/archive/backlog-archive.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure) (which of the two clocks is off
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

- [x] **Task 1: the probe, and proof that it is live**

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
  - [x] The four repeats are seen and named; an unexpected fifth is reported, not ignored. Named by their arguments,
        and each name matches its registration's call stack (`initBeatClock`, `startMelodyPlayback`,
        `scheduleHarmonyCycle`, `startAudioSwells`). No fifth in any run.
  - [x] The app's own values (`getCurrentMeasure()`, the palette) and the transport's are both in every firing's row.
  - [x] The page's console shows no error the probe caused, and the world still sounds (the overlay's rows read as
        they do without the probe). One Tone warning per power-on ("Events scheduled inside of scheduled callbacks
        should use the passed in scheduling time"), present in a run without the probe too, so not the probe's.

  **Done 2026-11-12.** Proof run: four registrations, BeatClock's tick every 48 ticks, the harmony callback every 1536.

  **Dependencies:** None.

  **Files:** scratchpad only. Nothing committed.

  **Estimated scope:** S (one script, on a recipe used before).

- [x] **Task 2: ten power-ons, and the two tables**

  **Description:** Ten runs, each a fresh Chrome, one at a time in the foreground
  ([PERFORMANCE.md](../PERFORMANCE.md), "Measurement hygiene"). Each run lasts until the harmony callback has fired
  twelve times (measure 24). Fill the tables below from the logs.

  **Proof:** Measurement. Both tables filled, and each of P1 to P5 marked held or refuted with the rows that show it.

  **Acceptance criteria:**
  - [x] Table 1 has a row per run and Table 2 a row per run.
  - [x] Each prediction is marked from the rows, with no prediction left "probably". P3 is marked untested, with the
        reason.
  - [x] For backlog 83: across the runs, the tick count of each melody tick that plays step 1 and of each BeatClock
        tick that turns the measure, as offsets from the bar, and whether either repeat lost its first firing.

  **Done 2026-11-12.** Ten runs, each a fresh headless Chrome, one at a time in the foreground, no orphaned Chrome
  after. Every run reached twelve harmony firings.

  **Dependencies:** Task 1.

  **Files:** this file (the tables and the findings).

  **Estimated scope:** S.

- [x] **Task 3: slowed runs (only if P5 is unsettled)**: **skipped.** P5 is settled from Task 2's rows: the probe
  logged how far each BeatClock tick's clock pass reached, so whether each firing is on time is explained firing by
  firing (Findings, P5). Slowing the passes would only change how often the reach is long, not the mechanism.

  **Description:** Five more runs under CDP's `Emulation.setCPUThrottlingRate` (4), which lengthens the clock loop's
  passes. The lead predicts more on-time firings at the same start offset. Skipped, and marked skipped here, if
  Task 2 settles P5 or refutes P2 to P4.

  **Proof:** Measurement. Five rows added to Table 2, marked as slowed.

  **Dependencies:** Task 2.

  **Files:** this file.

  **Estimated scope:** XS.

- [x] **Task 4: the findings go into the record**

  **Description:** Backlog 82's entry: the lead paragraph becomes what was measured, with the figures; its "To find
  out" list is marked item by item (answered, or still open). Backlog 83's entry: what Task 2 showed for its first
  question, and what is still to hear. The status line above.

  **Proof:** Read. Crawford's review.

  **Dependencies:** Task 2 (and Task 3 if run).

  **Files:** `docs/todo/backlog.md`, this file.

  **Estimated scope:** XS (docs only).

### Gate A: Crawford reads the findings

- [x] The cause is established, or the plan says plainly that it is not and what was ruled out.
- [x] His decision on what is built. The candidates, named here and designed nowhere yet:
  - the palette as a pure function of the transport's tick count at a note's own time, read when the note is
    scheduled, with no harmony repeat and no stored entry (his "redundant code" question);
  - BeatClock's measure derived from each tick's own time and not from `transport.position`, with its tick started
    on the bar, which would also move everything else that reads the measure.

  **Decided 2026-11-12: both.** One idea, two halves: nothing keeps its own count, everything reads the music clock.
  The chord comes from the clock when a note is scheduled; the measure comes from the clock at each tick's own time,
  started on the bar; and the melody's step comes from the clock too, not from `stepCounter`. Why both: features
  coming soon (tracking measures, letting the player move to a measure, changing chord palettes) each break on a
  count that does not know the transport moved. Fixing only the chord leaves the measure and the steps wrong; fixing
  only the measure leaves the chord stale for up to two measures after a move or a palette change.
- [x] Whether backlog 83 is answered by the same log, or still needs its listen with the Click Track. Answered by the
      same log, and folded into the same fix (the melody's step from the clock puts step 1 on the bar). The listen
      becomes a check after the fix, not an investigation.
- [ ] Whichever is chosen changes the timing path CLAUDE.md asks about before changing, so it goes through an
      interview and a spec, not straight into a branch. **Next:** the interview, starting from the coming features,
      not from the bug.

## Tables

Measured 2026-11-12 on `main`'s tree (a1337cf2), dev server, headless Chrome, `?seed=charlie&x=200&y=-30`. The run
read PPQ 192 (a sixteenth is 48 ticks, a measure 768), the world's 71 BPM (a tick is 4.4 ms, a sixteenth 211 ms),
a 100 ms lookahead, a 50 ms update interval and the worker clock.

**Table 1: where each repeat starts.** Ticks, at the first firing's own time. Offset is the start modulo 48.

| Run | BPM | BeatClock start | Offset | Melody start | Offset | Harmony start | Swell start | A first firing lost? |
|---|---|---|---|---|---|---|---|---|
| 1 | 71 | 82.87 | 34.87 | 82.87 | 34.87 | 1536 | 96 | swell (48 already passed) |
| 2 | 71 | 132.94 | 36.94 | 85.98 | 37.98 | 1536 | 144 | BeatClock (83 already passed); swell |
| 3 | 71 | 49.36 | 1.36 | 49.36 | 1.36 | 1536 | 96 | swell |
| 4 | 71 | 85.73 | 37.73 | 85.73 | 37.73 | 1536 | 48 | BeatClock and melody (36.9 scheduled, never fired) |
| 5 | 71 | 41.94 | 41.94 | 41.94 | 41.94 | 1536 | 48 | none |
| 6 | 71 | 49.36 | 1.36 | 49.36 | 1.36 | 1536 | 96 | swell |
| 7 | 71 | 89.92 | 41.92 | 89.92 | 41.92 | 1536 | 48 | BeatClock and melody (40 already passed) |
| 8 | 71 | 82.87 | 34.87 | 82.87 | 34.87 | 1536 | 96 | swell |
| 9 | 71 | 41.94 | 41.94 | 41.94 | 41.94 | 1536 | 48 | none |
| 10 | 71 | 41.94 | 41.94 | 41.94 | 41.94 | 1536 | 48 | none |

**Table 2: the twelve harmony firings of each run.** "Late" is a firing that read the boundary's measure minus one,
so the entry in force after it is the previous one. (The plan first said "and left the palette as it was". That fits
only a first late firing: a run late throughout changes the palette at every firing, to the stale entry, which is why
five runs read 0 to 11.) "Gap" is from the time of BeatClock's last tick before a boundary to the boundary, in
milliseconds at the run's tempo, with ticks in brackets. It is the same at every boundary of a run.

| Run | Gap (ms) | On time | Late | Ran first on a shared tick | Entries by firing | Slowed? |
|---|---|---|---|---|---|---|
| 1 | 57.9 (13.2) | 1 | 11 | no shared tick | 1 1 2 3 4 5 6 7 8 9 10 11 | no |
| 2 | 48.7 (11.1) | 0 | 12 | no shared tick | 0 1 2 3 4 5 6 7 8 9 10 11 | no |
| 3 | 205.5 (46.7) | 0 | 12 | no shared tick | 0 1 2 3 4 5 6 7 8 9 10 11 | no |
| 4 | 45.2 (10.3) | 0 | 12 | no shared tick | 0 1 2 3 4 5 6 7 8 9 10 11 | no |
| 5 | 26.8 (6.1) | 4 | 8 | no shared tick | 0 1 2 4 4 5 7 7 8 10 10 0 | no |
| 6 | 205.5 (46.7) | 0 | 12 | no shared tick | 0 1 2 3 4 5 6 7 8 9 10 11 | no |
| 7 | 26.8 (6.1) | 5 | 7 | no shared tick | 0 2 2 3 4 6 6 8 9 9 10 0 | no |
| 8 | 57.9 (13.2) | 0 | 12 | no shared tick | 0 1 2 3 4 5 6 7 8 9 10 11 | no |
| 9 | 26.8 (6.1) | 4 | 8 | no shared tick | 0 1 2 4 4 5 6 8 9 10 10 11 | no |
| 10 | 26.8 (6.1) | 4 | 8 | no shared tick | 0 1 2 4 4 5 6 8 9 9 11 11 | no |

Intended entries, firing 1 to 12: 1 2 3 4 5 6 7 8 9 10 11 0.

**Findings.**

*The cause.* BeatClock's tick never sits on the bar. It passes no start time, so Tone starts it where the transport
has reached when it is registered: 37 to 83 ticks after `transport.start()` (about 95 to 215 ms at Tone's default
120 BPM; `powerController.start` sets the world's tempo only after `AudioEngine.start` returns). In every run it then
ran 1.4 to 41.9 ticks after each sixteenth, and its measure turns that far after each bar. The harmony repeat fires on
the bar (tick 1536 × k in every run) and reads `getCurrentMeasure()` before BeatClock has turned it, so it sets the
entry already in force: one entry, two measures, late. The exception is a boundary where BeatClock's last tick before
it ran in a clock pass that already reached past the boundary. That tick reads `transport.position` at Tone's "now",
gets the new measure early, and the firing is on time. Of 120 firings, 102 were late and 18 on time. Every on-time
firing followed a BeatClock tick that had read ahead, and no late firing did. Whether a firing is on time is decided at
each boundary by how far that one pass reached, which is why one world plays a different chord sequence on each
power-on.

*What the lead got wrong.* The same-tick order (the harmony callback before BeatClock's) never came into play: no run
had a BeatClock tick on a boundary. It could only happen on a power-on whose BeatClock start lands on a multiple of
48, and none of ten did. The lateness needs no shared tick.

*The predictions, from the rows.* "Reach" below is how far past its own time Tone's "now" was when BeatClock's last
tick before a boundary ran, in ticks; the probe logged it at every firing.

- **P1: held, except the swell.** BeatClock's and the melody's starts were never a multiple of 48 and moved from run
  to run (offsets 1.36, 34.87, 36.94 and 37.98, 37.73, 41.92, 41.94). The harmony started at 1536 in all ten. The
  swell clause is refuted: the swell started at 48 in five runs, 96 in four and 144 in one. In those five its 48 had already
  passed when `startLocaleSystems` registered it (the transport at 54 to 99), and Tone moved it to the next sixteenth.
  It stays on the sixteenth grid.
- **P2: held.** All 102 late firings read the boundary's measure minus one. All 18 on-time firings read the boundary's
  measure. No firing read anything else.
- **P3: untested.** No run had a shared tick (above). Not needed for the cause.
- **P4: held, both ways.** All 18 on-time firings followed a BeatClock tick that had already turned to the boundary's
  measure, and none of the 102 late ones did. Run 5's rows show the line: firing 4, reach 8.08 against a gap of 6.08,
  BeatClock read ahead, on time; firing 5, reach 6.08 against 6.08, not ahead, late. Every on-time firing has a reach
  above its gap and every late one a reach at or below it.
- **P5: held in part.** The share of on-time firings follows the gap: 17 of 48 at 6.1 ticks (runs 5, 7, 9, 10), 1 of
  48 at 10.3 to 13.2 ticks (runs 1, 2, 4, 8), 0 of 24 at 46.7 ticks (runs 3, 6). The split by run is refuted as
  stated: the reach is not a fixed length for a run. It changed from firing to firing inside every run, between −0.9
  and 16.2 ticks (up to about 70 ms) and 25.7 once, so no gap is "inside it" every time and no run was on time
  throughout. Runs with the same gap differ by at
  most one firing (4, 5, 4, 4 and 1, 0), and each difference is that firing's reach.

*Backlog 83.*

- Melody step 1 sits 41.9 to 89.9 ticks after the bar (0.87 to 1.87 sixteenths, 185 to 396 ms at 71 BPM), the same
  in every measure of a run and different between runs: 82.87, 85.98, 49.36, 85.73, 41.94, 49.36, 89.92, 82.87,
  41.94, 41.94. Step 1 is the melody tick's first firing, wherever the transport had got to.
- BeatClock turns the measure 1.3 to 41.9 ticks after the bar, or 6.1 to 13.2 ticks before it when it reads ahead.
- Of 83's two readings the first is the one, for a different reason: the melody loop is late because it starts where
  the transport has reached, not because a tick at time 0 never fires. BeatClock is early only on a read-ahead, and
  only by a fraction of a sixteenth.
- The sighting reproduces on `main`. In the seven runs whose step 1 sits 48 or more ticks after the bar, step 16 falls
  in the next bar and carries the next measure in 24 of 24 cycles. In runs 5, 9 and 10 (step 1 at 41.9), step 16 sits
  6 ticks before the next bar and carries the next measure in 10 or 11 of 24 cycles: those where BeatClock read ahead.
- A first firing was lost by both `16n` ticks in run 4 (scheduled on a tick already processed, never fired) and run 7
  (already passed at registration, moved on a sixteenth), and by BeatClock alone in run 2. There BeatClock runs about
  a tick before the melody tick in each sixteenth, not on the same tick.
- Not measured: the listen with the Click Track, and a pause and resume.

*Aside, not chased.* Every power-on logs one Tone warning, "Events scheduled inside of scheduled callbacks should use
the passed in scheduling time", with or without the probe. Something reaches Tone with no time from inside a
callback. Not this plan's question.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The probe changes the timing it measures | Medium | It wraps callbacks and reads; it writes nothing to Tone and schedules nothing. Task 1 compares the overlay's rows with and without it. |
| A dev server's load timing is not a production build's, so the start offsets differ where players are | Low | P2 to P4 do not depend on the offset. If the gate turns on P1 or P5, a production run is added then, with logging lines on a throwaway branch, since a bundle offers no module URLs to hook. |
| The sighting came from the spike branch and does not happen on `main` | Low | The code it passed through is the same on `main`. Ten runs with every firing on time and P3 refuted would say so, and backlog 82 would close with nothing built. |
| Headless Chrome's clock loop is not a phone's | Low | The lead's mechanism is ordering, not speed. Task 3 varies the speed on purpose. |

## Open Questions

1. Does the transport move between `transport.start()` and the registrations? **Answered: yes**, 37 to 83 ticks
   (about 95 to 215 ms) before BeatClock's tick is registered, a different amount on each power-on.
2. Does a replay from power-on give the same chords? **Answered: no.** Five of ten power-ons played 0 to 11, one entry
   late throughout; the other five each played a different sequence, three of them from the same start offset (runs
   5, 9, 10). A mixed run skips entries: run 5 never plays entries 3, 6 or 9.
3. What backlog [79](../todo/archive/backlog-archive.md#79-robots-move-in-time-with-their-own-melody)'s early announcements should
   read once the cycle is predictable. **Settled 2026-11-13** by the note cloud's Part E (its spec §8.4): the announcement reads
   `positionAt` of the step's own time and the palette of that measure, as the step itself will.
