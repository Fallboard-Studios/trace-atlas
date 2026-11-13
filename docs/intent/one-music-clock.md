# Intent: One Music Clock — the chord, the measure and the melody step read from the transport

Confirmed via `interview-me` on 2026-11-12 (six questions, every guess held; one answer reshaped the work, splitting
"move the world to a measure" out into a part two), ahead of a `spec-driven-development` pass. Backlog items
[82](../todo/archive/backlog-archive.md#82-audio-the-chord-cycle-does-not-always-change-on-time) and
[83](../todo/backlog.md#83-audio-melody-steps-may-sit-one-sixteenth-off-the-measure), decided at the measurement
plan's Gate A ([CHORD_CYCLE_TIMING.md](../tasks/CHORD_CYCLE_TIMING.md)): both candidate fixes, as one.

## Outcome

Everything musical that today keeps its own running count reads the music clock (the Tone transport) instead. The
chord palette comes from the clock when a note is scheduled, BeatClock's measure comes from each tick's own time with
its tick started on the bar, and the melody's step, with the velocity and humanize rolls keyed to it, comes from the
clock and not from `stepCounter` ([AudioEngine.ts](../../src/engine/AudioEngine.ts)). So the same world at the same
measure plays the same notes on every power-on. That fixes 82 (the chord one entry late, differently on each power-on)
and 83 (step 1 up to two sixteenths after the bar), and it is the floor that the coming measure features stand on.

## Why now

Crawford named the features this is for: tracking measures, letting the player move to a measure, changing chord
palettes, and further out isolating loops, exporting a recording from one measure to another, and sharing a link that
opens a composition at a measure. He does not yet have a vision for how those go. What they share is one promise, "the
same world at the same measure gives the same music", and each breaks on a count that does not know the clock moved.

## Behavior

- **Measure N plays the same notes every time.** For a given world: which notes, when, how loud, and the humanize
  nudge are the same at measure N on every power-on. Today they are not: the chord depends on which clock pass ran
  first (backlog 82's Findings), the step depends on where the transport had got to at power-on, and velocity and
  humanize key off `stepCounter`, a count since power-on (`computeNoteVelocitySeeded`, `humanizeOffsetFor`).
- **The chord is worked out, not remembered.** The chord palette at any measure is a function of the measure and the
  current settings. Nothing keeps a history: after a palette change, an earlier measure plays the chords as they are set
  now, not the ones that played before the change. The harmony's own `2m` repeat and its stored entry
  ([harmonySystem.ts](../../src/engine/harmonySystem.ts)) go (Crawford's "redundant code" question, answered).
- **The measure turns on the bar.** BeatClock's tick starts on the bar, and its measure comes from the tick's own time,
  not from `transport.position` read at Tone's "now". Everything that reads the measure (the docking lifecycle, the
  swells) inherits a measure that turns on the bar.
- **Step 1 is on the downbeat.** The melody's step at any tick comes from the clock's position, so step 1 falls on the
  measure's first sixteenth in every measure of every power-on.
- **The in-world day is untouched.** It stays on the wall clock from `dayStartTimestamp` (CLAUDE.md's guardrail).
  Nothing musical defines a day.

## Style / constraint

- Everything still goes through AudioEngine, BeatClock and the transport (CLAUDE.md's audio and timing rules). No timer
  outside the transport; `MIN_LEAD` kept on notes.
- Nothing keeps a separate musical count once this lands: a value derived from the clock beats a counter that has to be
  kept in step with it.
- Pre-v1: the music is allowed to sound different afterwards. No "keep the existing sound" clause.
- Proof by tests that read the chord, measure and step at a given clock position, and by re-running backlog 82's probe
  (scratchpad, on `cdp-lib.mjs`): 120 of 120 chord changes on the bar, step 1 on the downbeat in every run, the same
  entries on every power-on.
- Crawford asked for this change on 2026-11-12, so CLAUDE.md's "ask before changing the audio architecture" is met for
  the timing path. The spec says exactly which modules move.

## Out of scope (part one)

- **Moving the world to a measure (part two).** The engine call that jumps the whole world to measure N: music,
  batteries, docking and who is playing. It gets its own interview and spec after this lands. Its open question is the
  robots' work loop, which runs on wall-clock time ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md)): after a jump a robot
  whose battery says "docked" may be mid-job at a work site. The battery and docking cycle already replays from
  power-on (World Clock, [intent](world-clock-deterministic-lifecycle-replay.md)), which part two builds on.
- **The sound matching, not only the notes.** Global LFOs and effect tails run on their own free-running timing; making
  them land identically at a measure means syncing their phase to the clock (the LFO bank, the Free/Sync toggle).
  That belongs with loops and recordings.
- **Any UI**: a measure readout, a move-to-measure control, a palette picker, loops, recording, links.
- **A history of past settings** (roadmap 32's idea).
- **The Click Track listen** from backlog 83: it becomes a check after this lands, not part of it.

## Known implementation notes (not yet spec'd)

- Measured in backlog 82's runs: BeatClock's and the melody's `16n` repeats start 37 to 83 ticks after
  `transport.start()`, because they pass no start time and `AudioEngine.start` awaits before registering them
  (Tables 1 and 2 of the plan). Starting a repeat on the bar needs a start time at or after the transport's position;
  a start already behind is moved on, or scheduled and never fired (both seen).
- `powerController.start` sets the world's tempo after `AudioEngine.start` returns, so the registrations happen at Tone's
  default 120 BPM. Ticks are tempo-independent, but the spec should say whether that order stays.
- Read from Tone 15.1.22's source, not measured: a repeat moved by a `ticks` change keeps its original offset
  (`TransportRepeatEvent._restart` adds whole intervals to its start). Part two will meet this; part one should not lean
  on an offset staying put.
- Backlog [79](../todo/backlog.md#79-robots-move-in-time-with-their-own-melody)'s early announcements read the cycle's lag
  off the palette in force; once the chord is a function of position they can compute it. Backlog
  [7](../todo/backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter) (tagged progressions, a seeded
  mood chain) is the likely shape of "changing chord palettes" and should be read against the spec.
- The one Tone warning per power-on ("Events scheduled inside of scheduled callbacks should use the passed in scheduling
  time") is still there, although backlog 35 ([intent](beatclock-transport-time.md)) was meant to stop it. Seen in
  backlog 82's runs; not part of this work unless the spec finds it on the same path.
