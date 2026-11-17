# Intent: The Melody Journey — a home melody, and a seeded walk that makes it busier and calmer

Confirmed in conversation with Crawford on 2026-11-16 and 2026-11-17 (his eight points, then five rounds of
questions), ahead of a `spec-driven-development` pass. No `interview-me` run: Crawford asked whether one was needed,
and the answer was no for this piece and yes for the melody editor, which he then cut from it. Roadmap
[92](../todo/roadmap.md#92-the-melody-journey-a-home-melody-and-a-seeded-walk-that-makes-it-busier-and-calmer); next
in [plan.md](../todo/plan.md), before launch.

Only Crawford's decisions are below. What the spec had to fill in is listed there as assumptions
([MELODY_JOURNEY.md](../specs/MELODY_JOURNEY.md) §7.1), not here.

## Outcome

A robot's melody develops while it plays. The melody it spawns with is its **home melody**; from there it gets busier,
comes home, gets calmer and comes home again, on a seeded **journey** read from the music clock. A slider sets how
fast it travels, and a three-way setting lets a company or the whole fleet travel together. Docking pitch drift
(`reRollMelodyPitches`, `src/engine/melodyGenerator.ts`), today's only change over time, goes.

## Behavior

- **The home melody.** A melody is created at spawn from the composition sliders, as now
  (`composeRobotMelody`, `src/engine/regenerateMelody.ts`). It becomes the robot's home melody.
- **Development is finite and moves in changes.** One change is one small edit to the melody. A robot is some number
  of changes busier than home, or calmer than home, or at home.
- **Getting busier** (Crawford's points 6a to 6g, with his answers):
  - Measure the shortest note. Its length is the threshold.
  - Sort the notes longer than the threshold by length. The sort decides the order only; it changes nothing.
  - A change takes one of those notes and splits it: the note keeps its length less one threshold, and the last
    threshold becomes a new note on a neighbouring note. His example: with an eighth-note threshold, a dotted quarter
    becomes a quarter on the original note and an eighth on the neighbour.
  - **The order alternates:** the shortest, then the longest, then the second shortest, and so on.
  - When half of the longer notes are changed, the changes alternate between two thresholds: the threshold, and its
    subdivision (eighths, then sixteenths). The notes already split may be split again.
  - **Then the silence may fill:** once nothing is left to split, changes add notes into the gaps.
  - When everything is exhausted, a change moves one note to a neighbouring note.
- **A neighbouring note is the nearest pitch in the current palette**, a step, not the next slot of the palette array
  (which is a leap: a palette runs `C G E D B C E G`).
- **Getting calmer is the opposite.** A change ties a note into the note before it, so there are fewer, longer notes.
- **The slider is the number of changes per measure**, capped at 2. At 0 the robot plays its home melody.
- **The journey sets the direction.** A seeded value that goes back and forth around zero: the melody gets more
  complicated, then simpler, and back, as time goes on.
- **The journey's turning points sit on the clock, not on undocking**, so robots that undock at different times can
  still be in step.
- **Companies and the whole fleet can share a journey.** A three-way setting on the robot, Own, Company or Fleet,
  broadcast from the company and All Probes screens. Seeded: a family member starts on Company, a freelancer on Own.
- **The rate is seeded per robot from a band**, as density is, with a share of robots at 0 so some always play their
  home melody.
- **Docking pitch drift is removed.** The journey replaces it.

## Style / constraint

- **It replays.** The melody a robot plays in a measure is worked out from the home melody, the rate, the journey and
  the measure, and from nothing remembered. Nothing new is saved but the two settings.
- **A rate edit re-reads the journey as if the new rate had held from the start**, the no-history rule the chord
  settings follow ([HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md)).
- **Melodies still store note indices, never pitch strings** (CLAUDE.md, Melody Logic). A neighbour is stored as a
  step from a slot and resolved when the note plays.
- **It changes every world's sound.** So it lands before backlog
  [45](../todo/backlog.md#45-off-screen-crawfords-three-preset-links) (the three preset links), the last change to
  generation before launch.

## Out of scope

- **The home melody editor** (his point 2: "a custom melody selector component yet to be created"). Its own piece,
  with an interview first; it belongs with roadmap
  [90](../todo/roadmap.md#90-the-score-editable-chords-a-clock-with-two-rulers-hand-edited-parts)'s hand-edited parts
  and backlog [65](../todo/backlog.md#65-robot-a-melody-strip-under-the-accents-slider-and-later-editing-the-notes).
- **Three earlier shapes of the slider, each replaced in the conversation:** a −100 % to 100 % slider centred on 0
  (the journey now sets the direction); a −48 to 48 slider in measures, developing for N measures and then going home
  for one; and a value handed out at each undocking (it cannot keep a company in step, since members undock on
  different measures).
- **A second slider for a cycle length.**
- Everything else in roadmap 90: a part with its own length, time signatures, editable chords, the pace ruler.

## Known implementation note (not yet spec'd)

Nothing left open here; the spec carries its own assumptions and questions.
