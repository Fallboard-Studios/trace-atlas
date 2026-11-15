# Idea: The score — editable chords, a clock with two rulers, hand-edited parts

**Status: idea**, 2026-11-14. A conversation with Crawford that began as "make the chord palette editable" and widened
to the mental model behind it. Not interviewed, not specced, nothing built. Recorded as roadmap
[90](../todo/roadmap.md#90-the-score-editable-chords-a-clock-with-two-rulers-hand-edited-parts). It takes in backlog
[7](../todo/backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter),
[20](../todo/backlog.md#20-audio-user-authored-progressions-and-tags-editor-ui--maybe) and
[65](../todo/backlog.md#65-robot-a-melody-strip-under-the-accents-slider-and-later-editing-the-notes), and touches
[86](../todo/backlog.md#86-world-move-the-whole-world-to-a-measure) and
[87](../todo/backlog.md#87-composition-loops-recordings-from-measure-to-measure-links-at-a-measure).

Crawford's points, Claude's leans and the open questions are kept apart below. A lean is not a decision.

## What Crawford wants (his words and decisions, 2026-11-14)

- The chord palette editable, and more than the chords: time signature changes, a few chord palettes to rotate through
  or arrange, and, eventually, users editing a robot's array of note indices and its rhythms.
- **The chord editor:** eight slots, each with some sort of note picker, and "lots of education". Maybe a gradient
  behind the note picker as a heat map.
- **Timing:** "i want to do an overhaul of all of that timing anyways, it's not holding up as is." The problem: things
  are timed to measures, the BPM changes, and some things then happen too quickly. "The big problem was the docking
  cycle, but sometimes i wished the chords lasted twice as long at the faster speeds as well."
- **Whether an edit lasts:** "a tough one - i think we might end up having modes to control it."
- **Order:** all of it can be planned now, and what is built when is worked out during the planning. He wants the mental
  model first, so it can be built in pieces. He has another big piece, redoing the layout of the nav and the views, and
  thinks this one comes first because it would inform that redesign.

## The model (Claude's; Crawford has read it and answered into it, not confirmed it as a decision)

### Three layers

The music is three lookups, one on top of the other, and each is plain data.

| Layer | The question it answers | Its data | Today |
|---|---|---|---|
| **Clock** | Where in the music is this moment? | the meter: how long a bar is, where the bars fall | a fixed 16-step bar |
| **Harmony** | Which eight notes are available here? | progressions, and the order they play in | one constant table, 2 measures an entry |
| **Part** | Which slot does this robot play here, and for how long? | each robot's melody events | generated from seed and sliders, then drifted |

A layer reads the one above it only through a position. A part stores slot numbers, never notes (the Melody Logic
guardrail), so changing a chord never touches a melody. Harmony stores positions, never ticks, so a change to the clock
need not touch a chord. That is what lets the work be built in pieces.

### Two rulers on the one clock

There is one clock, the transport's ticks. It needs two rulers, and today everything is measured on the first.

- **Bars** follow the tempo. Right for anything musical: steps, melodies, how long a chord holds, synced LFOs.
- **Pace** does not follow the tempo. It is how fast the world lives: batteries, docking, drift.

Pace is counted in bars today, so the tempo slider is also a speed control for the fleet. A battery cycle is 27 to 53
measures ([ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md#battery-size)):

| Tempo | One measure | One full shift and charge |
|---|---|---|
| 40 BPM | 6 s | 2.7 to 5.3 min |
| 100 BPM | 2.4 s | 65 to 127 s |
| 200 BPM | 1.2 s | 32 to 64 s |

A chord holds 2 measures: 12 s at 40 BPM, 4.8 s at 100, 2.4 s at 200.

### One ownership question, asked at every layer

Crawford's "modes" for whether an edit lasts are one question, asked of each piece of data: who owns it, the seed or
the hand?

- **Seed-owned:** generated, and generated again when a slider moves. Everything today.
- **Hand-owned:** the user wrote it, it is saved as written, and the sliders that would regenerate it dim (his rule: a
  control that does nothing is dimmed, its value kept).

## What exists (verified against the code, 2026-11-14)

- **Harmony.** `HARMONY_PALETTES` is a module constant in `src/engine/harmonySystem.ts`: 12 entries of 8 note names,
  `MEASURES_PER_PALETTE_ENTRY = 2`. `paletteForMeasure(measure)` is pure and has one production caller, `stepNotes` in
  `src/engine/AudioEngine.ts`. Nothing seeds it, stores it or saves it.
- **Clock.** `positionFromTicks` in `src/engine/beatClock.ts` is the one place that turns ticks into a measure and a
  step. Nothing sets Tone's own time signature, so `1m` and `2m` are 4/4 bars.
- **The 16-step bar is assumed in:** `beatClock.ts` (`BEATS_PER_MEASURE * 4`), `melodyGenerator.ts`
  (`DEFAULT_SUBDIVISIONS = 16`), `audioSwells.ts` (`TICKS_PER_MEASURE = 16`), `stationFadeSystem.ts`, `clickTrack.ts`,
  `lifecycleSim.ts` (the measure's length in seconds), and `data/noteValues.ts` (the synced LFO lengths). The note
  cloud was not checked.
- **Parts.** `Robot.melody` is generated from `compositionSeed` and the robot's settings (`buildSeededComposition`,
  `engine/regenerateMelody.ts`), then a quarter of its events re-roll their slot at each docking
  (`reRollMelodyPitches`, which skips `pitchLocked` events). The melody is not in a save; the settings are
  (`RobotAudioOverrideDiff`).
- **Slot weights.** `NOTE_INDEX_WEIGHTS` (0.35 down to 0.03) applies only when Note Variance is on and its set has
  filled, and in drift when Note Variance is on. With Note Variance off the pick is even over the eight slots.
- **Pace.** The lifecycle ticks once a measure (`subscribeToMeasure` in `robotSystems.ts`) and the battery amounts are
  per measure. The swells count in measures too. Jobs are already in seconds, `jobDuration(bpm)`, 10 s at 20 BPM down to
  6 s at 200. The day is wall clock.
- **Tempo.** Classic seeds 40 to 100 BPM (`src/data/bands/classic.ts`); the slider goes further.

## Leans (Claude's, unconfirmed)

- **One "score" in the store, JSON, read by the two pure functions.** A save or a link carries it only where it differs
  from the default.

  ```ts
  interface Progression { id: string; name?: string; measuresPerEntry: number; palettes: EighthNotes[] }
  interface Section     { progressionId: string; repeats: number; stepsPerMeasure?: number }
  interface Score       { progressions: Progression[]; arrangement: Section[] }  // the arrangement loops
  ```

- **The harmony lookup takes the whole position, not the measure number,** so a chord could later change inside a bar
  without a rewrite.
- **Pace, keeping the replay.** On 2026-10-09 Crawford kept the lifecycle on measures because replay is the top
  priority. Keep that: the lifecycle still ticks on the bar line, so a robot docks and undocks on a bar, but its
  amounts are written in seconds and converted at the world's tempo, as `jobDuration(bpm)` already does for jobs. The
  world at measure N stays a pure function of the world, its tempo and N. The catch is a tempo change partway through
  a session: a later jump or replay works the pace out as if the new tempo had held from the start, the same
  no-history rule the chord settings already follow
  ([HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md#palette-design-guidelines)).
- **Chords stay on the bar ruler.** "Twice as long" is twice the measures, not a length in seconds, so the chord still
  changes on a bar. `measuresPerEntry` becomes a setting of the progression. Its default could be seeded from the
  world's tempo (a fast world starts on 4), seed-owned until the user sets it.
- **The heat map from the fleet, not from a formula:** count how many of the robots' current melody events sit on each
  slot. The fixed weights apply only under some Note Variance settings (above), so the live count is what the world
  plays.
- **Backlog 7's seeded chain fills the arrangement** when the user has not, in place of being a second system.
- **An edited note reuses `pitchLocked`,** so docking drift already leaves it alone.
- **Order.** Design the whole model first. Sketch the surfaces (the eight-slot editor with its heat map, an arrangement
  view, the meter controls, a note and rhythm editor) on `docs/sketches` pages, so the layout redesign has real sizes
  to plan around. Redo the layout. Build the editors onto the new layout, a piece at a time. The engine half (the chord
  table into the store, the clock's two rulers) has no UI in it and can be built before, during or after the layout.

## Open

1. How fine ownership goes: a whole progression or one chord, a whole robot or one note. And what the modes are.
2. A hand-edited part against its sliders: when the density slider moves, is the edit dropped, or do the sliders dim?
3. What a robot plays in a bar that is not 16 steps: a melody generated at that length, the 16-step one cut short, or
   the 16-step loop running across the bar lines.
4. Which ruler the swells are on. Their frequency and length are counted in measures today.
5. Whether a chord's hold follows the tempo by default, and where it doubles.
6. What the pace change does to the lifecycle's whole-measure cycle lengths (fifteen of them today) and to the holds.
7. Whether a progression belongs to the world (saved and linked with it) or to a library used across worlds. Backlog
   20 leaned to both.
8. Where this sits against launch. plan.md has backlog 7, 20 and 65 after it.
