# Intent: The Melody Journey — a home melody, and a seeded journey that makes it busier and calmer

Confirmed in conversation with Crawford on 2026-11-16 and 2026-11-17 (his eight points, then five rounds of
questions), ahead of a `spec-driven-development` pass. No `interview-me` run: Crawford asked whether one was needed,
and the answer was no for this piece and yes for the melody editor, which he then cut from it. Roadmap
[92](../todo/roadmap.md#92-the-melody-journey-a-home-melody-and-a-seeded-walk-that-makes-it-busier-and-calmer); next
in [plan.md](../todo/plan.md), before launch.

**Revised 2026-11-17, after Phases 1 to 5 were built.** Crawford changed what a journey is: a list of intensity and
time pairs, bounded by two settings, in place of a walk travelled at a set number of changes per measure. The
Development slider goes. The changes themselves (busier, calmer, the neighbour) are as they were. The spec and the
task file do not yet follow this revision (see the note at the end).

**Revised again 2026-11-17, after Phase 7 was built.** Max time leaves the robot: every journey has one max time of
16, so robots that share a journey move in lock step. Max intensity is the one bound a robot has.

Only Crawford's decisions are below. What the spec had to fill in is listed there as assumptions
([MELODY_JOURNEY.md](../specs/MELODY_JOURNEY.md) §7.1), not here.

## Outcome

A robot's melody develops while it plays. The melody it spawns with is its **home melody**; from there it gets busier,
comes home, gets calmer and comes home again, on a seeded **journey** read from the music clock. A setting bounds how
far a robot's journey goes, and a three-way setting lets a company or the whole fleet travel together, in lock step. Docking pitch drift (`reRollMelodyPitches`, `src/engine/melodyGenerator.ts`), the only change over time
before this piece, goes.

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
- **A journey is a list of pairs: an intensity and a time.**
  - **Intensity** is where the melody is heading: a number of changes from home, positive for busier and negative for
    calmer.
  - **Time** is how many measures it takes to get there.
  - His example, `[[16, 16], [-8, 1], [0, 16]]`: for 16 measures the melody gets one change busier each measure. On
    the next measure it plays the home melody already made 8 changes calmer. Then, over 16 measures, it restores one
    element every other measure, back to home. (He wrote the jump as a time of 0; the shortest time was then settled
    as 1, below.)
- **The changes per measure are worked out, not set.** Each measure the melody makes as many changes as it needs to
  reach the intensity on time, smoothly. The Development slider (changes per measure) goes.
- **The shortest time is a drop on the bar line.** His words: "the very developed measure ends and on the down beat of
  the next measure we should be fully at the next intensity." The measure that reached an intensity plays it in full,
  and the next measure plays the new one from its first beat. It is written as a time of 1: the measure that plays
  the new intensity.
- **One setting bounds a robot's journey: max intensity.** The user sets it, and the seeded journey stays within it.
  At a max intensity of 0 the robot plays its home melody.
  - **Max intensity** goes from 0 to 16: the sixteen notes a measure can hold, for now.
- **Every journey has one max time: 16 measures, for now.** It is not a robot setting. His words (2026-11-17): "robots
  should not have max time, they should be in lock step (when in company or fleet mode, of course). let's just have
  one max journey time of 16 for now." (Max time was a second robot setting, up to 16 measures, until then.)
- **The journey is seeded, for now.** Eventually it will be tied to the chord progressions.
- **How the seeded journey leans** (his first gut, "generally", not a hard rule):
  - The closer an intensity is to 0, the slower the changes: more time to get there.
  - The further an intensity is from 0, the less time to get there.
  - The closer the journey is to max intensity, the more likely its next intensity is 0. At max, about half the time.
  - Intensities can change sides from one pair to the next. Nothing makes them.
  - A journey does not hold still. Occasionally a pair may take a long time over a small change in intensity.
- **A robot is never asked for more calm than it has.** A calm intensity past the robot's floor (one note in a bar) is
  brought in to the floor before the changes per measure are worked out. The robot reaches its floor on the measure
  the journey turns, not early.
- **The journey's turning points sit on the clock, not on undocking**, so robots that undock at different times can
  still be in step.
- **Every journey moves in even measure intervals for now**, to match the chord changes (a chord holds 2 measures).
  This will change when the journey is tied to the progressions.
- **A drop takes its one measure from the pair before it**, so the drop itself lands on a chord change. His example
  then reads `[[16, 15], [-8, 1], [0, 16]]`: the melody peaks on measure 15, drops on measure 16 with the new chord,
  and is home on measure 32.
- **Companies and the whole fleet can share a journey.** A three-way setting on the robot, Own, Company or Fleet,
  broadcast from the company and All Probes screens. Seeded: a family member starts on Company, a freelancer on Own
  (on Fleet since roadmap 93, below).
- **A shared journey is drawn once.** Each robot scales its intensities by its own max intensity, and every robot on
  it turns on the same measures, each to its own depth: a company on Company, or the fleet on Fleet, moves in lock
  step.
- **Max intensity is seeded per robot when the world loads**, as density is.
  - Max intensity is drawn across its whole range, up to the top.
  - **About 30 % of robots load at a max intensity of 0**, so some always play their home melody. "More at home on
    load is better."
  - A family member inherits its founder's on load.
- **Docking pitch drift is removed.** The journey replaces it.

## Style / constraint

- **It replays.** The melody a robot plays in a measure is worked out from the home melody, max intensity, the
  journey and the measure, and from nothing remembered. Nothing new is saved but the two settings.
- **An edit to max intensity re-reads the journey as if the new value had held from the start**, the no-history rule the
  chord settings follow ([HARMONY_SYSTEM.md](../HARMONY_SYSTEM.md)).
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
- **A journey written by hand, and a journey tied to the chord progressions.** Both are later pieces. The list of
  pairs is the form either would take.
- **Four earlier shapes of the slider, each replaced:**
  - A −100 % to 100 % slider centred on 0 (the journey sets the direction).
  - A −48 to 48 slider in measures, developing for N measures and then going home for one.
  - A value handed out at each undocking (it cannot keep a company in step, since members undock on different
    measures).
  - A slider of changes per measure, 0 to 2 and then 0 to 8, over a walk whose depth was fixed. Built in Phases 4 and
    5 and replaced on 2026-11-17: the changes per measure are now worked out from the journey.
- **A max time per robot** (it would put robots on one journey out of step), and a max time set per journey. Every
  journey has the one max time of 16 for now.
- Everything else in roadmap 90: a part with its own length, time signatures, editable chords, the pace ruler.

## Known implementation note (not yet spec'd)

- **The spec, the task file and the code are behind this revision.** Built and unchanged by it: the changes
  (`src/engine/melodyDevelopment.ts`), the engine's read of a measure's melody, the removal of docking drift, and the
  Own / Company / Fleet setting. Replaced by it: the walk (`src/engine/melodyJourney.ts`) and the `development` field
  with its slider, band, save and link entries. The spec's §1.3, §1.9, §1.10 and §5.1 and its assumptions A12 to A14
  describe the walk and the old slider.
- **Left for the spec, as first cuts for Crawford's ear:**
  - ~~The range max time is seeded across.~~ No longer asked: max time is not a robot setting (2026-11-17).
  - How strongly the seeded journey leans, how often "occasionally" is, and how often a pair is a drop.

## Journey dynamics (roadmap 93)

2026-11-18, after hearing the journey as built: "I hear it, but it's not quite as dynamic as i'd hoped. do you have
suggestions for either the algo that determines the changes to the melody or its implementation?" Six suggestions
came back with the measurements behind them (the spec's §10.1); he wanted to "give them a try", with these notes:

- **The performance follows the journey** (quieter on the calm side, shorter and with deeper accents on the busy
  side): "sounds good."
- **The calm side scales instead of clamping:** "sounds good."
- **Shifts keep their direction:** wanted only if there are still occasional sudden swings ("would we still get
  occasional sudden swings? if yes sounds good"). There are: the drops, the octave jumps, and new directions each trip.
- **Freelancers seed on Fleet:** "seeding freelancers into fleet is a great idea."
- **Octave jumps:** "ok, but only for notes in octaves 1, 4, and 5. the rest should have an octave jump down."
- **A different path each trip:** wanted only if company members keep one rhythm: "will different robots in the same
  company still have the same rhythyms? if not, i'm not interested." They do.

2026-11-19, after the review:

- **The performance swing is independent of max intensity:** a robot at a small max intensity plays as far from home
  in its performance as one at 16.
- **A robot on Company with no company falls back to Fleet,** not Own.
- **The listen passed:** "ok i'm happy with my listen." The three performance numbers ship as first cut.
