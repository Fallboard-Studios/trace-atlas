# Melody Generation Specification

Source of truth: [`src/engine/melodyGenerator.ts`](../src/engine/melodyGenerator.ts).

Melody generation creates procedurally generated musical patterns for each robot at spawn time, producing immutable `MelodyEvent[]` values whose note choices are index-based and later resolved by the harmony palette at playback time.

That melody is the robot's **home melody**. What the robot plays in a given measure is the home melody as its journey
develops it, busier or calmer, worked out when the note plays and never stored ([The melody journey](#the-melody-journey-roadmap-92)).

## Core Principles

1. **Generated at spawn, developed per measure**: the home melody is generated once per robot (again on a composition edit, below) and registered with AudioEngine; the engine develops it for each measure from the robot's journey and writes nothing back.
2. **Index-based**: each event stores a `noteIndex` (0–7), not a literal pitch string.
3. **16-subdivision grid**: onset positions are chosen across a one-measure grid of 16 subdivisions.
4. **Motif-based density**: rhythmic structure comes from a motif repetition algorithm rather than a simple random step picker.
5. **Optional variance**: the generator can bias note choices in a controlled way via the Note Variance toggle.

## Data Structure

```typescript
// Declared once, in types/Robot.ts — this is also the type of Robot.melody.
interface MelodyEvent {
  id: string;
  startStep: number; // 1..16 (1-indexed slot in the 16-step grid)
  length: NoteDuration; // full union is '32n'|'16n'|'8n'|'4n'|'2n'|'1n'|'2m'|'4m' (types/Robot.ts); generation only ever produces '16n'|'8n'|'4n'|'2n'
  noteIndex: number; // 0..7, mapped into the active harmony palette
  octave: number; // concrete octave assigned at generation time
  pitchLocked?: boolean; // Pitch Repeat only — see below. undefined everywhere else, including the base cell.
  rest?: number; // Robot Performance — the fraction of this event's length that falls silent (0.25..0.75), stamped by the post-pass; absent = sounds its full length
  mark?: ArticulationMark; // Robot Performance — 'accent' | 'marcato' | 'staccato' | 'staccatissimo' | 'tenuto', stamped by the post-pass; absent = unmarked
  sixteenths?: number; // the melody journey — a length in sixteenths (1..16), for a length with no note name; developed events only
  pitchStep?: number; // the melody journey — signed steps through the measure's palette from this event's own note; developed events only
}
```

`sixteenths` and `pitchStep` are written only by the journey's changes, on the events of a developed melody, never on a
home event (`Robot.melody`); see [The melody journey](#the-melody-journey-roadmap-92).

`rest` and `mark` are **performance stamps**, not note data: they never move an event, and the trigger path turns them into a
sounding length and a velocity multiplier (`resolveArticulation`, see [Performance Marks](#performance-marks-rests-and-accents) and
[AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)).

`noteIndex` is resolved later by the harmony system and playback layer. `octave` stays fixed once the melody is generated.

## Current Generation API

The current generator entry point is:

```typescript
export function generateMelodyForRobot(opts: GenerateMelodyForRobotOptions): MelodyEvent[]
```

Supported options:

```typescript
interface ToggleValue {
  active: boolean;
  value: number;
}

interface GenerateMelodyForRobotOptions {
  octaveMin: number;
  octaveMax: number;
  rhythmicDensity?: number;        // 0-100 fill-rate percentage (was a 4-12 onset count)
  rhythmicMotifLength?: ToggleValue; // value: 0-8 (was a plain 1-16 number); active derives from value > 0
  seed?: number;
  rand?: () => number;
  rhythmRand?: () => number;        // the rhythm stream: onsets and durations (Company Families); defaults to rand
  noteVariance?: ToggleValue;       // value: 0-8 (was a plain 0-8 number, 0 meaning "off"); active derives from value > 0
  pitchRepeat?: number;             // 0-100, only meaningful when rhythmicMotifLength.active is true
}
```

`onsetCount` no longer exists on this interface — it was a pre-percentage legacy fallback (`rhythmicDensity ?? onsetCount`) removed once every call site moved to the percentage model.

## Generation Algorithm

The implementation uses a motif-repetition algorithm rather than the older step-selection approach.

1. `rhythmicDensity` (a 0–100% fill rate) is converted to a concrete onset count as a pre-step, before `buildMotifOnsets()` is ever called — `buildMotifOnsets()` itself still only understands a plain onset count, exactly as before this conversion existed.
2. `buildMotifOnsets()` builds a sorted list of onset positions for one measure from that onset count.
3. Each event gets:
   - a `startStep` derived from the onset grid
   - a duration chosen via `pickDurationForGap()` — not necessarily filling the whole gap to the next onset; the remainder becomes a rest
   - a `noteIndex` chosen per the Note Variance toggle (see below)
   - an `octave` selected within the provided range

### Rhythm model

Density is a percentage of either the full measure or one motif cell, gated by the Motif Length toggle:

- **Motif Length inactive** (`rhythmicMotifLength.active === false`): `rhythmicDensity`% of the full 16-step measure is filled, with onsets scattered freely (no repeating structure). Onset count = `round(density/100 * subdivisions)`, floored to a minimum of 1.
- **Motif Length active**: `rhythmicDensity`% of a `rhythmicMotifLength.value`-step cell (1–8 steps) is filled, and that identically-filled cell tiles across the measure, truncating at measure end. Per-cell onset count = `round(density/100 * value)`, floored to a minimum of 1; the total onset count passed to `buildMotifOnsets()` is `perCell * repeats` (`repeats = floor(subdivisions / value)`) so every repeat gets exactly the same fill — no remainder distributed unevenly across copies, unlike the pre-percentage model.

Both counts come from one function, `rhythmShape(rhythmicDensity, rhythmicMotifLength, subdivisions = 16)`
(`melodyGenerator.ts`), which returns `{ cellLength, onsets }`: the cell length and the onsets per cell with tiling on,
`cellLength: null` and the onsets in the measure with it off (density clamped to 0–100 first). The rhythm stream's key
is built from the same function, so the two cannot disagree (see [The rhythm stream](#the-rhythm-stream-company-families)).

`buildMotifOnsets()`'s own contract is unchanged: it still takes a plain total onset count, a motif length, and `subdivisions`, and still falls back to picking unique positions directly (ignoring the motif length as a tiling boundary) if the motif length is too short relative to `subdivisions` to support repetition.

**Tail-cell fill (untruncating):** when `rhythmicMotifLength.value` (`M`) doesn't evenly divide `subdivisions` — `3`, `5`, `6`, `7` against the default 16 — the tiling loop above only ever runs `repeats = floor(subdivisions / M)` times, leaving `tailLength = subdivisions - repeats * M` steps past the last full repeat with no onset at all. `buildMotifOnsets()` appends one final partial-cell pass after its existing trim branch (both otherwise untouched): whichever base-motif positions are `< tailLength` are copied into a partial cell at offset `repeats * M`. This is a deterministic subset of the same base motif, not a fresh random draw, and is deliberately **not** counted against the requested `rhythmicDensity` — it's bonus fill from previously-dead grid space, so it can push the final onset count above what was asked for. `M` values that evenly divide `subdivisions` (`1`, `2`, `4`, `8`) have `tailLength = 0` and are unaffected.

**Playback accent:** when Motif Length is active, `AudioEngine` applies a velocity accent to the earliest event in each repeat window (the tiled cell's "downbeat") — this is a playback-layer behavior, not something `melodyGenerator.ts` produces or stores on the event. See [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)'s Note Resolution Pipeline.

## Duration Selection

Each event's duration is chosen by `pickDurationForGap(availableUnits, rand)`, not by deterministically filling the gap to the next onset:

```typescript
export function pickDurationForGap(availableUnits: number, rand?: () => number): NoteDuration
```

Candidates are every representable duration whose grid-unit length (`16n`=1, `8n`=2, `4n`=4, `2n`=8) is `<= availableUnits`, chosen with probability weighted by that unit length — so `16n` is deliberately the least likely candidate whenever a longer option is available, while remaining possible (a gap of exactly 1 unit has no other choice). When the chosen duration is shorter than the available gap, the remainder is silence — this is intentional: it creates space between notes instead of every onset's note always ringing until the instant the next one starts.

## Note Selection

The weighted note selection is still the core melodic bias:

```typescript
const NOTE_INDEX_WEIGHTS = [0.35, 0.2, 0.15, 0.1, 0.07, 0.06, 0.04, 0.03];
```

This makes lower indices more common than higher ones.

### Note variance controls

The `noteVariance` option is a `{ active, value }` toggle. `generateMelodyForRobot` still
branches on `.active` exactly as described below — that logic is
unchanged by docs/specs/STEPPER_TO_SLIDER.md. What changed is `active`'s derivation: it's no
longer an independently-set field. Every write site (the UI slider, spawn-time seeding, the
store's `updateRobot` clamp, manual-edit actions, company broadcast) derives it from `value > 0`
instead — `value === 0` is now the sole off state (see Constants of Interest below for the
corresponding `NOTE_VARIANCE_MIN`/`DEFAULT_NOTE_VARIANCE` changes).

- `active: false` → **unweighted**, unconstrained random pick from all 8 indices (`Math.floor(rand() * 8)`). This is a deliberate behavior change from the pre-refactor `noteVariance === 0` default, which was still weighted — "off" now genuinely means no weighting at all, not just no uniqueness constraint.
- `active: true, value: 1..7` → prefer a limited set of `value` unique notes, weighted among the established set once it fills
- `active: true, value: 8` → use all eight note indices without replacement

Motif Length's own `{ active, value }` toggle follows the identical derivation rule — `active` is
`value > 0`, never independently set — even though its `active: false` branch (whole-measure onset
generation instead of tiled-motif) lives in the Rhythm Model section above, not here.

## Pitch Repeat

`Robot.pitchRepeat` (`0-100`, lore label "Ping Repetition Allowance" in the UI) increasingly locks
a tiled motif's repeated cells to the same pitches as the base cell (repeat 0), not just the same
rhythm — closing the "half-repeats" gap Motif Length tiling leaves on its own. See
[docs/specs/PITCH_REPEAT.md](specs/PITCH_REPEAT.md) for the full spec.

**Gating:** inert whenever `rhythmicMotifLength.active === false` — no cell concept exists to lock
pitches within when tiling is off. `generateMelodyForRobot` never even calls
`computePitchLockPlan` in that case.

**Algorithm (`computePitchLockPlan`, `melodyGenerator.ts`):**
- The base cell has `K` onset positions (however many onsets actually land in `[0, motifLength)` —
  including any `R`-extra onset from the rhythm model above, if one landed in repeat 0). A seeded
  permutation of those `K` positions is drawn once — the order they lock in, not always
  position-0-first.
- `pitchRepeatPct`'s `0-100` range is divided into `K` equal-width stages, one per position in that
  order. Within a position's stage, the *count* of non-base repeats locked for that position ramps
  from `0` (stage start) to "every applicable repeat" (stage end); once a stage completes, later
  stages never unlock it — locking is monotonic as the slider rises. `pitchRepeatPct >= 100`
  short-circuits every stage's fraction to exactly `1` up front, avoiding `100/K` float-boundary
  edge cases (e.g. `K=3` repeats `33.3̄`).
- *Which* repeats lock first within a stage comes from a second seeded permutation — of non-base
  repeat indices — **shared across every position** (drawn once, not re-rolled per position). A
  position's applicable repeats exclude the tail repeat (see above) when that position falls at or
  past `tailLength` — the tail cell has no onset there to lock.
- Both permutations are drawn from the seeded `rand` stream (the composition stream) that
  `generateMelodyForRobot` threads through pitch generation — no new `Math.random`, no new seeding
  utility. The onsets they lock draw from the rhythm stream (`rhythmRand`, below), so robots that
  share a rhythm still lock in their own orders.
- A locked `(position, repeat)` onset copies the base cell's already-chosen `noteIndex` **verbatim**
  — via a `basePositionNoteIndex` map populated as repeat-0 events are pushed — bypassing Note
  Variance entirely for that onset, and without mutating Note Variance's own `uniqueSet`/
  `withoutReplacementPool` state. Unlocked onsets, including every base-cell onset, run through
  Note Variance exactly as before, in the same iteration order — `pitchRepeat: 0` (or omitted,
  `DEFAULT_PITCH_REPEAT`) is statistically indistinguishable from generation with no Pitch Repeat
  at all.
- Locked events are stamped `pitchLocked: true`. Base-cell events and unlocked events leave the
  field `undefined` (never `false`).

**`pitchLocked` has no reader.** Its one reader was the docking re-roll, which kept off locked
events; the re-roll went with docking pitch drift in roadmap 92 (the melody journey). The stamp is
still written, and left in place on Crawford's word: it is the hook if a later piece wants the
journey's changes to keep locked copies in step with their base note
([docs/specs/MELODY_JOURNEY.md](specs/MELODY_JOURNEY.md) §7.2). For now the changes treat a locked
copy like any other note. Pitch Repeat itself is untouched.

**Seeding & lifecycle:** rolled per-robot at spawn (`robotFieldDerivation.ts`'s `deriveMelodyFields`, `getSeededVal(noiseMap,
'robot.pitchRepeat', spawnIndex, band.min, band.max)` with the band from `getBand('robot.pitchRepeat')` — Classic's is
0–100; a Melody aspect moves it, see "Integration at Spawn" below), same convention as Density/Motif Length/Note Variance;
inherited verbatim from the founder by a company member ([COMPANIES.md](COMPANIES.md), "A seeded company is a family"); rerolls with the rest of the melody on a coordinate
change (nothing about Pitch Repeat is preserved across one, same as Density); manually edited via
`applyPitchRepeat` (`robotOptionsActions.ts`), which mirrors `applyDensity` exactly — and, as of
Roadmap Phase 31 (Deterministic Robot Melody Generation), takes the same fully-seeded path every
other manual edit does now too. See "Deterministic Generation (Phase 31)" below.

## Deterministic Generation (Phase 31)

Every robot carries a `compositionSeed: number` (`Robot.ts`), drawn once at spawn from the noise
map (`spawnSystem.ts`'s `generateCompositionSeed`, own dataId `'robot.compositionSeed'`) — always
fresh, never inherited, a company member's included, the same treatment as `id`/`name`/`melody` itself.
`melodyGenerator.ts`'s `buildSeededComposition(compositionSeed, attrs)` combines it with a robot's
current `rhythmicDensity`/`rhythmicMotifLength`/`noteVariance`/`pitchRepeat`/`octaveRange` into a
single `() => number`, passed as `generateMelodyForRobot`'s existing `opts.rand`. Both call sites
build the melody through one recipe, `composeRobotMelody(robot, worldKey)` (`regenerateMelody.ts`,
since Company Families; it adds the rhythm and performance streams, below), with the same inputs:

- **Spawn** (`spawnSystem.ts`) — the robot's *initial* attribute values.
- **Every edit** (`regenerateMelody.ts`, fired by `applyDensity`/`applyMotifLength`/
  `applyNoteVariance`/`applyPitchRepeat`/`applyOctaveMin`/`applyOctaveMax`) — the robot's *current*
  attribute values, post-edit.

Because both call sites share one formula, a robot's melody is a pure function of `compositionSeed`
plus those five fields, its `rests` and `accents`, and its world: the same values always produce the same melody, whether that's the moment
of spawn or the hundredth edit. Nudging a slider to a new value and back reproduces the exact
melody the robot had before — there is no one-time "first edit" shift into a different melody
space. This retired the previous mechanism entirely: spawn-time generation no longer draws from
`getSeededVal(noiseMap, 'melody.rand', ...)` per note, and edit-time generation no longer falls back
to unseeded `Math.random()`. `generateMelodyForRobot`'s own signature and internals were unchanged by
Phase 31 — only what its two callers pass as `rand` changed (Company Families later added `rhythmRand`).

**The played melody is determined too.** What a robot plays in a measure is its home melody
developed by its journey ([The melody journey](#the-melody-journey-roadmap-92)), a pure function of
the home melody, the robot's two journey settings, its seed and attack, the world and the measure,
so a reload, a link or a power cycle plays the same notes. (Until roadmap 92 the docking pitch
drift re-rolled a quarter of a robot's notes at every Docked landing and was outside this
determinism; it is gone.) Session Storage's
`RobotAudioOverrideDiff`/`SessionPayload` (`docs/specs/SESSION_STORAGE.md`) needed no new field for
`compositionSeed` — like `id`, it's never diffed, since it always re-derives identically from the
seed on every roster regeneration. `applySessionPayload` (`sessionDiff.ts`) does call
`regenerateMelody` after applying a robot's override diff, so a restored robot's melody matches its
overridden attributes, not the fresh seed-baseline ones `retransmitWorld` spawned it with a moment
earlier.

**Accepted consequence:** retiring `'melody.rand'` means a previously-familiar locale seed's robots
generate different initial melodies than they did before Phase 31 — every other seeded attribute
(id, name, audio attributes, rhythmic fields) stays byte-identical for a given seed, but the melody
itself changed along with the generation mechanism. Confirmed acceptable during this phase's
`interview-me` pass, not a regression.

The standalone Reset Melody control (`RESET_MELODY_SCHEMA`, `robotOptionsConfig.ts`; wired through
`RobotScreen.tsx`/`PingControlsDrawer.tsx`) was removed entirely as part of this phase — under
full determinism there's nothing left for a manual reroll to do that changing an attribute doesn't
already do.

## The rhythm stream (Company Families)

Company Families (backlog 73, [docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](specs/NO_SILENCE_AND_COMPANY_FAMILIES.md)
§1.11, B16–B19) split the rhythm off the composition stream, so that robots can share a rhythm and keep their own
notes. **A rhythm belongs to the world and the rhythm shape, not to the robot.**

- **The shape** is `rhythmShape`'s `{ cellLength, onsets }` (Rhythm model, above): with tiling on, the motif length and
  the onsets per cell; with it off, the onsets in the measure. Two densities that round to the same count are one
  shape, and a motif length while tiling is off is not part of it.
- **The stream.** `buildSeededRhythm(worldKey, { rhythmicDensity, rhythmicMotifLength })` (`melodyGenerator.ts`) is an
  `alea` over `` `${worldKey}:${cell<n> | free}:${onsets}:rhythm` ``: the world and the shape, nothing of the robot's
  own. The world key is the locale's coordinates, `` `${x}:${y}` ``, the input its noise map hashes, from
  `melodyWorldKey(localeId)` (`regenerateMelody.ts`; the locale id stands in when the store has no such locale, which
  only a unit test with a mocked store gives: `addRobot` drops a robot spawned into a missing locale, so no stored robot
  is ever keyed on the fallback), so a world reloaded from a save or a link plays the rhythms it had.
- **What draws from it.** `generateMelodyForRobot`'s `rhythmRand` takes the onsets (`buildMotifOnsets`) and every
  event's duration (`pickDurationForGap`), in the positions they drew from `rand` before. The pitch-lock plan, the
  octaves and the notes stay on `rand`, the composition stream on the robot's own `compositionSeed`. With no
  `rhythmRand` the option defaults to `rand`, so a one-stream caller gets exactly the melody it got before the option
  existed.
- **The one recipe.** `composeRobotMelody(robot, worldKey)` (`regenerateMelody.ts`) builds a melody from a robot's
  stored fields: the composition stream, the rhythm stream and the performance stream (next section).
  `regenerateMelody` and `spawnRobot` (`spawnSystem.ts`, which imports it) both call it with `melodyWorldKey`, so spawn
  and every later edit agree by construction. It lives in `regenerateMelody.ts` rather than beside the generator so its
  call to `generateMelodyForRobot` crosses a module, where test spies on that export still see it.

What follows from it:

- **In one world, one shape is one rhythm, whoever plays it.** A company member inherits its founder's Density and
  Motif Length, so it plays the founder's onsets and note lengths exactly, with its own notes
  ([COMPANIES.md](COMPANIES.md), "A seeded company is a family"). Two robots that draw the same shape play together
  too: before families, 66 % of robots shared a rhythm with another, in all 121 grid worlds, because most rhythms are
  thin (median density 17 %, 63 % of robots one onset per cell; [docs/tasks/COMPANY_FAMILIES.md](tasks/COMPANY_FAMILIES.md),
  Results). Crawford accepted it. Setting a robot's Density and Motif Length to make another's shape makes it join
  that rhythm; another world plays a different rhythm for the same shape.
- **Only a rhythm setting moves the rhythm** (B7). A Note Variance, Pitch Repeat or Octave Range edit leaves the onsets
  and lengths where they were and re-rolls the notes. A Density edit inside one shape keeps the rhythm too, though
  the notes re-roll, since the composition stream is keyed on the raw density.
- **No onset is moved per robot.** A first build moved one or two onsets for a quarter of members (`moveOnsets`); it
  was cut (B18) before it reached `main`.

Every world's melodies changed when the rhythm moved to its own stream, and again when it moved onto the world key;
pre-v1, by design.

## Performance Marks: Rests and Accents

Robot Performance (roadmap 50.5, [docs/specs/ROBOT_PERFORMANCE.md](specs/ROBOT_PERFORMANCE.md) §1.2) adds a **post-pass** over
the finished melody: `applyPerformanceMarks(melody, { rests, accents }, rand)` (`melodyGenerator.ts`) stamps each event with an
optional `rest` and an optional `mark`, and nothing else. The notes, their steps and their lengths are exactly what
`generateMelodyForRobot` produced, so moving the Rests or Accents slider never changes *which* notes play or *when* — only how
long they sound and how hard they are struck.

**Its own stream.** The notes come from the composition stream and the onsets from the rhythm stream; the stamps come from
their own, `buildSeededPerformance(worldKey, { rhythmicDensity, rhythmicMotifLength })` — an `alea` over the rhythm stream's key
with `:performance` in place of `:rhythm`, so keyed on the world and the rhythm shape (Company Families B19; it was keyed on
`compositionSeed` before). Because the key carries neither slider value, dragging either slider re-stamps the same melody from the
same stream. Robots that share a rhythm and the same Rests and Accents values rest and accent together (a company's members,
which inherit both); with different values, the lighter setting rests or marks a subset of the events the heavier one does. A rhythm edit
reshuffles the stamps along with the onsets.

**Four draws per event, always.** For every event the post-pass draws `restRoll`, `restDepthRoll`, `markRoll` and `markPickRoll`
in that order, whether or not it uses them. That is what keeps the two concerns apart: raising Rests changes which events are rested
without re-rolling anyone's mark, and raising Accents only *adds* stamps — an event marked at 30 is still marked, with the same kind,
at 60.

- **Rest.** With `restChance = rests / PERFORMANCE_MAX` and `restDepth = REST_MIN_FRACTION + REST_SPAN · restChance`, an event
  whose `restRoll` is under `restChance` gets `rest = REST_MIN_FRACTION + restDepthRoll · (restDepth − REST_MIN_FRACTION)`: at a
  low setting a rested note loses about a quarter of its length; at 100 it may lose up to three quarters. A rest is a shortened
  note, never a skipped one (skipping would be anti-Density), and since roadmap 58's R2b it releases short too
  (`CUT_RELEASE_SECONDS`, 0.03 s), so the gap is heard rather than covered by the robot's release tail.
- **Mark.** `unlockedMarks(accents)` (`src/engine/articulation.ts`) opens the five classical marks in tiers — below `ACCENT_TIER_2`
  (34) `accent` and `tenuto`; below `ACCENT_TIER_3` (67) also `staccato` and `marcato`; from 67 `staccatissimo` too — and an event
  whose `markRoll` is under `accents / PERFORMANCE_MAX` takes `kinds[floor(markPickRoll · kinds.length)]`. `ARTICULATION_MARKS`
  holds each mark's velocity and length factors (accent 1.5 × 1, marcato 1.65 × 0.75, staccato 1 × 0.5, staccatissimo 1 × 0.25,
  tenuto 1.2 × 1; the velocities raised from 1.25, 1.4 and 1.1 at roadmap 58's R2a).
- **Both on one event.** `resolveArticulation(event)` lets the shorter of the rest remainder and the mark's length win, and a
  `tenuto` cancels the rest.

`regenerateMelody` applies the post-pass after every generation, and spawn applies it to the initial melody, so the stored
`Robot.melody` always carries the stamps the robot's own `rests` / `accents` (0–100, `DEFAULT_RESTS` / `DEFAULT_ACCENTS` = 0)
imply. A restored session regenerates and therefore re-stamps (SESSION_STORAGE.md).

## The melody journey (roadmap 92)

Spec [docs/specs/MELODY_JOURNEY.md](specs/MELODY_JOURNEY.md) (its §1.3 and §1.5 have worked examples); plan
[docs/tasks/MELODY_JOURNEY.md](tasks/MELODY_JOURNEY.md). Roadmap 93, journey dynamics, changed it after it was built:
the calm side's scaling, the trips and the level, the octave jumps, held shifts, a path per trip, and a performance
that follows the level ([the spec's §10](specs/MELODY_JOURNEY.md#10-journey-dynamics-roadmap-93)). This section
describes the journey as it is now. `Robot.melody` is the **home melody** and only that. In each
measure a robot plays its home melody at a **position**: a number of changes from home, positive busier, negative
calmer, 0 home. The robot's **journey** gives the position for the measure (`melodyJourney.ts`), and `developMelody`
gives the melody at that position (`melodyDevelopment.ts`). Both modules are pure. Nothing is written to the store as
the music moves, and the only new saved fields are the two settings. No melody changes at a docking: docking pitch
drift went with this piece.

### The journey (`src/engine/melodyJourney.ts`)

- **A list of pairs.** A journey is a seeded list of pairs, each an **intensity** (the position it heads for) and a
  **time** (the measures it takes to get there). Each pair starts where the one before ended; the first starts at home
  on measure 0, so every world starts at home.
- **Its key decides who shares it.** `journeyKey(worldKey, scope)` is the `alea` seed:

  | `Robot.journey` | Key | Who travels together |
  |---|---|---|
  | `'own'` | `` `${worldKey}:${compositionSeed}:journey` `` | the robot alone |
  | `'company'` | `` `${worldKey}:${companyId}:journey` `` | every member of one company on Company |
  | `'fleet'` | `` `${worldKey}:fleet:journey` `` | every robot on Fleet |

  `worldKey` is `worldKeyOf(coordinates)`, `` `${x}:${y}` ``, the key the rhythm stream uses (`melodyWorldKey`), so a
  world reloaded from a save or a link travels the same journeys. A robot on Company with no company travels on Fleet,
  where the freelancers spawn.
- **Drawn as shares.** `journeyShares(key, count)` draws each pair as a `JourneyShare`: an intensity share from −1 to
  1, a time share from 0 to 1, and whether it is a drop. Four draws a pair, taken whether the pair uses them or not
  (the home roll, the intensity, the time, the drop roll). With `p` the intensity share of the pair before (0 before
  the first):

  | Step | Rule |
  |---|---|
  | Home | The pair heads home (0) when `p` is at least `JOURNEY_MIN_MOVE` from home and the home roll is under `JOURNEY_HOME_ODDS × \|p\|`: half the time from max intensity. |
  | Intensity | Otherwise an even draw over −1 to 1 less the stretch within `JOURNEY_MIN_MOVE` of `p` (clipped at −1 and 1). A pair always moves, and may stay on its side or cross home. |
  | Time | `JOURNEY_TIME_LEAN × (1 − \|intensity\|) + (1 − JOURNEY_TIME_LEAN) × the time draw`: a pair heading near home takes longer. |
  | Drop | A drop when the drop roll is under `JOURNEY_DROP_ODDS` and the move is at least `JOURNEY_DROP_MIN_MOVE`. The first pair is never a drop, and no drop follows a drop. |

- **A robot's pairs.** `robotPairs(shares, bounds)` scales the shares by the robot's `JourneyBounds` (`maxIntensity`,
  `maxTime`, `calmLimit`), so one journey is one shape however deep a robot travels it. Intensity: a busy share times
  max intensity, a calm share times the **calm range** (the smaller of max intensity and the calm limit), rounded to
  the nearest whole change the same way on both sides of home. So the calm side is spread over the calm changes the
  robot has: it reaches the calm limit only on a full calm share, and never goes past it. Time: the share times max time, rounded to the nearest even number of measures, never under 2. A drop's time
  is 1, and the pair before a drop is one measure shorter.
- **Turning measures.** A pair's turning measure, where it plays its intensity, is the sum of the times up to its own.
  Each is even, so it is a chord change (`MEASURES_PER_PALETTE_ENTRY` is 2); the pair before a drop turns on the odd
  measure, and the drop lands on the chord change after it.
- **Max time is the journey's.** `robotJourney` hands every robot `JOURNEY_TIME_MAX` (16), so robots on one journey
  turn on the same measures, each to its own depth: a company on Company and the fleet on Fleet move in lock step.
- **Where a robot is.** `positionInPairs(pairs, measure)`: in a pair from `a` on measure `s` to `b` on `s + T`, measure
  `s + k` plays `a + sign(b − a) × floor(|b − a| × k ÷ T)`. The floor leaves a turning measure late and arrives on the
  next one exactly, never early. Measure 0, a negative or non-finite measure and an empty list give 0.
- **Trips.** A trip is one stretch away from home on one side. Counted on the shares, so every robot on one journey
  counts alike: the first pair is trip 0, and a pair starts a new trip when it heads for a side the pair before did not
  head for (away from home after a pair that headed home, or across home). A pair that heads home, or further along
  the same side, stays on its trip. A robot still on the side it is leaving reads the trip before, until it is home or
  across.
- **The level.** How far out the journey is, from −1 (as calm as it goes) to 1 (as busy): the shares in a straight
  line across the pair, unrounded, so it moves every measure where the whole-change position waits. It reads neither
  max intensity nor the calm limit (Crawford, 2026-11-19: the performance swing is the journey's, whatever the depth),
  so a one-note robot has a calm level too. It is what the performance follows
  ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)).
- **The engine's read.** `journeyAt(key, bounds, measure)` gives the position (`positionInPairs` over `robotPairs`),
  the trip and the level, without walking there: each key's turning measures are memoised per max time, drawn one pair
  at a time as a read needs them, and searched by halving. A max intensity of 0, measure 0 and a negative or
  non-finite measure give `{ position: 0, trip: 0, level: 0 }` without drawing.
- **The stored robot's journey.** `robotJourney(robot, worldKey, bpmTop)` turns a stored robot into a `RobotJourney`:
  the key its Journey setting names, its max intensity (absent reads as `DEFAULT_JOURNEY_MAX_INTENSITY`, 0),
  `JOURNEY_TIME_MAX`, and the things the changes read: the floor, the seed and the octave range (absent when the robot
  has none). The calm limit comes from the registered home melody (`calmLimit`).
- **A low bound can hold a robot still.** Two pairs can scale to one intensity at a small max intensity or a small
  calm range; the robot then plays one melody through the second pair.
- **No history.** An edit to max intensity or to Journey re-reads the journey as if the setting had held from measure
  0, as the chord settings do.

### The changes (`src/engine/melodyDevelopment.ts`)

`developMelody(home, position, options)` applies that many busy changes above 0 and calm changes below it; at 0 it
returns the home melody itself. Change k+1 is always one change on top of change k, within one trip. `options` is a
`DevelopmentOptions`: the robot's floor, its composition seed, its octave range (no range, no octave jumps) and the
`variation`, `{ key, trip }`, the journey and the trip it is on (the registry always hands one in; with none, every
order is as written and the directions come from the seed alone).

- **A different path each trip.** A trip's **order draws**, from `` alea(`${key}:${trip}:order`) ``, set where each
  visiting order starts on that trip: four draws, always taken in this order, for the first pass, the two thresholds,
  the octave jumps and the shifts; the calm ties start at the stream's first draw. A visiting order is turned, not
  reshuffled: the same round, started on another note. They come from the journey's key and the trip and from nothing
  of the robot's, so robots on one journey with one rhythm (a company's members) make the same rhythm changes on the
  same measures, every trip (Crawford's condition, 2026-11-18).

- **Lengths.** `eventSixteenths(event)` is an event's `sixteenths` when present, else its note name's (`16n` 1, `8n` 2,
  `4n` 4, `2n` 8).
- **The floor.** `developmentFloor(attackSeconds, bpmTop)`: `ceil(ATTACK_REACH_SHARE × attack ÷ one sixteenth at
  bpmTop)`, never below 1, where `bpmTop` is the top of the theme's `bpm` band. The attack rail's arithmetic
  ([Integration at Spawn](#integration-at-spawn)): no change makes a note too short for the robot's attack to climb.
  Under Classic, attacks up to 0.3 s give a floor of 1.
- **Directions.** One draw per change from `` alea(`${compositionSeed}:development:${trip}`) `` (with no variation,
  `` `${compositionSeed}:development` ``), up when under 0.5: the robot's own, drawn afresh each trip. Keyed on the
  seed and the trip, so a composition edit changes the home melody and not the directions.
- **Busier**, in five phases, each running until it has nothing left. `T` is the shortest home note in sixteenths
  (never under the floor), and the subdivision is the larger of the floor and `floor(T / 2)`. A **split** at `t`
  takes a note at least `2t` long: it keeps `L − t`, and a new `t`-long note starts where it now ends, one palette step
  from it, with the id `` `${id}:d${k}` ``.
  1. **First pass:** the home notes that can split at `T`, sorted by length then start and visited from alternating
     ends (shortest, longest, second shortest...), the round started where the trip's draw puts it, until half of
     them (rounded up) are split.
  2. **Two thresholds:** changes alternate between the subdivision and `T` over every note now in the bar, and the
     pick alternates between the shortest and the longest candidate. As written the subdivision and the shortest go
     first; a trip's draw of 0.5 or more starts on `T` and the longest. A threshold with no candidate hands its turn to
     the other. With no subdivision under `T` there is one threshold.
  3. **Fills:** while a gap of silence in the bar (before the first note, between two, after the last) is at least
     the subdivision long, a subdivision-long note goes at the end of the longest gap (the earliest on a tie), one
     palette step from the note it leads into. The gap after the last note leads into the bar's first.
  4. **Octave jumps** (Crawford, 2026-11-18): a change moves one note an octave, **up from octave 1, 4 or 5 and down
     from any other** (`OCTAVES_THAT_JUMP_UP`). The candidates are the notes whose jump lands inside the robot's octave
     range, a note with no octave read as `DEFAULT_NOTE_OCTAVE` (4); by length then start, from alternating ends, the
     round started by the trip's draw, until half of them (rounded up) have jumped. A note jumps once, a note a change
     added included, and carries the octave it landed in. No octave range, no jumps.
  5. **Shifts:** one note moves one palette step, the notes in start order, round and round, starting where the
     trip's draw puts it. **A note keeps the way it first went:** a note a split or a fill added carries on the way
     that change sent it, and any other takes its first shift's direction and holds it, so the shifts add up to a line
     and none undoes another. It never runs out, so max intensity is what bounds the busy side; a robot at the top of
     its journey plays pitch movement on a full rhythm. The engine turns a shift back at the octave range, so a jumped
     note that shifts stays inside it.
- **Calmer.** A **tie** removes a note, and the note before it sounds on to the removed note's end. The candidates
  are every home note but the bar's first, by length then start, from alternating ends, the round started by the
  trip's draw. The floor is the bar's first note alone, whatever the order, so `calmLimit(home)` is the note count
  less one, and the journey never asks for more.
- **What a change never does:** move a home note's start, make two notes overlap, or put a note outside the bar. A
  home note no change touched is the same object; a changed one is a new object keeping its id, slot, octave, rest and
  mark; a note a change adds carries its source's slot and octave, and no rest, mark, motif accent or pitch lock.
- **So a family develops as a section.** Members share their founder's rhythm, and which note a change picks depends
  only on lengths, starts, the journey's key and the trip, so members on one journey at one max intensity split, tie
  and fill the same notes on the same measures, each with its own neighbour notes and octaves.

The engine resolves the event fields when the note plays: `pitchStep` through `stepInPalette` in the measure's
palette, `sixteenths` as seconds at the live tempo, `octave` as written
([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)). It also plays each note to the journey's level: up to
`JOURNEY_BUSY_LENGTH_CUT` (0.4) shorter and with accents up to `JOURNEY_BUSY_ACCENT_GAIN` (0.5) deeper on the busy
side, up to `JOURNEY_CALM_VELOCITY_CUT` (0.4) quieter on the calm side (same section).

### The two settings

| Field | Values | At spawn | A company member |
|---|---|---|---|
| `Robot.journeyMaxIntensity?: number` | whole changes, 0 to `JOURNEY_INTENSITY_MAX` (16); absent reads as 0, the home melody always | 0 for the share the band's `lit` leaves out, else an even whole number in the band | its founder's |
| `Robot.journey?: 'own' \| 'company' \| 'fleet'` | whose journey it travels (`JOURNEY_SETTINGS`); absent reads as `DEFAULT_JOURNEY`, `'own'` | `'fleet'` (Crawford, 2026-11-18: freelancers rise and fall together, where journeys of their own cancel out across a fleet); `spawnInitialCompanies` puts every robot of a seeded company, founder included, on `'company'` | `'company'` |

- **Seeded** in `deriveMelodyFields` (below) with two draws of its own, a lit roll at `'robot.journeyMaxIntensity.lit'`
  and the number at `'robot.journeyMaxIntensity'`, through `seedJourneyMaxIntensity(litRoll, t, band)`: a lit robot is
  never 0. Classic's band is `'robot.journeyMaxIntensity': { min: 1, max: 16, lit: 0.7 }`, so three robots in ten load
  at home; it is one of the Melody family's keys, and no theme or aspect column names it yet. The roster baseline a
  save is diffed against does the same, the seeded companies' robots on `'company'` (`generateRobotRosterBaseline`).
- **Normalised by the store.** `localeStore.updateRobot` rounds max intensity to a whole number from 0 to 16 and drops
  a `NaN`, and drops a journey that is not one of the three.
- **Edited by hand** through `applyJourneyMaxIntensity` and `applyJourney` (`robotOptionsActions.ts`), which write the
  field and nothing else: no regeneration and no engine call, since the engine reads the stored robot on the next note
  ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)). A move between companies and an Attack edit need none
  either.
- **The controls.** Composition > Rhythm & Melody, row 3: Max Intensity (`JOURNEY_MAX_INTENSITY_SCHEMA`, a slider 0 to
  16 by 1) beside Journey (`JOURNEY_SCHEMA`, a radio of Own, Company, Fleet), which is dimmed, its value kept, while
  Max Intensity is 0. The copy is stand-in (`probe.composition.journeyMaxIntensity`, `probe.composition.journey`),
  marked for backlog 62's content pass.
- **Broadcast and saved.** The company and All Probes screens set both for every member
  ([COMPANIES.md](COMPANIES.md#editing-semantics-broadcast-not-link)); a save and a world link carry both as overrides
  ([SESSION_STORAGE.md](SESSION_STORAGE.md)). The home melody is still not saved.

## Constants of Interest

- `PERFORMANCE_MIN = 0`, `PERFORMANCE_MAX = 100` (`src/constants/index.ts`) — the shared range of Dynamics, Rests and Accents.
- `DEFAULT_DYNAMICS = 50`, `DEFAULT_RESTS = 0`, `DEFAULT_ACCENTS = 0` (`melodyGenerator.ts`) — what a robot with the field absent plays (since roadmap 58 R2a, 50 no longer reproduces the pre-50.5 velocity spread: half the notes move by up to ±0.15 around 0.6).
- `REST_MIN_FRACTION = 0.25`, `REST_SPAN = 0.5` — a rest removes between a quarter and three quarters of the note.
- `ACCENT_TIER_2 = 34`, `ACCENT_TIER_3 = 67` (`src/engine/articulation.ts`) — where the third and fifth marks unlock.

- `RHYTHMIC_DENSITY_MIN = 0`, `RHYTHMIC_DENSITY_MAX = 100` (`src/constants/index.ts`) — the shared 0-100% fill-rate range. Was `4`/`12` (an onset count) before this phase.
- `RHYTHMIC_MOTIF_LENGTH_MIN = 0`, `RHYTHMIC_MOTIF_LENGTH_MAX = 8` (`src/constants/index.ts`) — the shared `ToggleValue.value` range for Motif Length. `RHYTHMIC_MOTIF_LENGTH_MAX` was `16` before the Pitch Repeat phase; `RHYTHMIC_MOTIF_LENGTH_MIN` was `1` before docs/specs/STEPPER_TO_SLIDER.md, which extended it down to `0` — `value === 0` is now the off state (`active` derives from `value > 0`), reversing an earlier `0`→`1` migration (see the `NOTE_VARIANCE_MIN` line below, which made the same reverse move).
- `NOTE_VARIANCE_MIN = 0`, `NOTE_VARIANCE_MAX = 8` (`src/constants/index.ts`) — the shared `ToggleValue.value` range for Note Variance. `NOTE_VARIANCE_MIN` was `0` before the Pitch Repeat phase (`0` meant "off" directly), then `1` once that phase moved "off" onto `active: false` alone (`value` itself never needed to reach `0`), then back to `0` under docs/specs/STEPPER_TO_SLIDER.md — `value === 0` is once again the off state, but this time `active` is a *derived, enforced* consequence of `value > 0` rather than an independently-settable flag with its own now-reachable-again `value: 0` floor.
- `DEFAULT_RHYTHMIC_DENSITY = 50` — a clean round mid-point of the new percentage range (was `8`, out of the old `4-12` range).
- `DEFAULT_RHYTHMIC_MOTIF_LENGTH = { active: true, value: 8 }` — behavior-preserving with the pre-refactor always-tiling-at-8 default (motif tiling had no off switch before the Pitch Repeat phase). Already satisfies `value > 0 ⟺ active`, unchanged by docs/specs/STEPPER_TO_SLIDER.md.
- `DEFAULT_NOTE_VARIANCE = { active: false, value: 0 }` — was `{ active: false, value: 1 }`, which violated the `value > 0 ⟺ active` invariant docs/specs/STEPPER_TO_SLIDER.md introduces; `value: 0` is both invariant-correct and still behavior-preserving with the pre-Pitch-Repeat `noteVariance === 0` default.
- `PITCH_REPEAT_MIN = 0`, `PITCH_REPEAT_MAX = 100` (`src/constants/index.ts`) — the shared 0-100% lock-strength range.
- `DEFAULT_PITCH_REPEAT = 0` — the neutral/off state (unlike the other three defaults, `0` isn't a mid-range compromise; it's what makes generation at the default statistically indistinguishable from having no Pitch Repeat).
- `DEFAULT_SUBDIVISIONS = 16`
- The melody journey (`src/constants/index.ts`; every number a first cut, Crawford's to move by ear):
  `JOURNEY_HOME_ODDS = 0.5`, `JOURNEY_MIN_MOVE = 0.125`, `JOURNEY_TIME_LEAN = 0.5`, `JOURNEY_DROP_ODDS = 0.3`,
  `JOURNEY_DROP_MIN_MOVE = 0.5` (all in shares of a robot's bounds); `JOURNEY_INTENSITY_MAX = 16`, the sixteen notes a
  measure can hold; `DEFAULT_JOURNEY_MAX_INTENSITY = 0`; `JOURNEY_TIME_MAX = 16`, every journey's max time;
  `DEFAULT_JOURNEY = 'own'`. `JOURNEY_SETTINGS = ['own', 'company', 'fleet']` sits beside its type, `JourneySetting`,
  in `src/types/Robot.ts`.
- `OCTAVE_JUMP_CHANCE = 0.15` — before each note after the first, the chance the melody jumps to another octave: any octave
  inside Octave Min–Max other than the one it is in, near or far, picked evenly. Until 2026-11-13 a jump went only to an octave
  more than one away: in the three-octave registers a melody that started at an edge leapt straight to the other edge and never
  played the middle (a hollow note cloud), one that started in the middle never jumped, and a two-octave range never jumped.
- `DURATION_UNIT_VALUES`: `[[1,'16n'], [2,'8n'], [4,'4n'], [8,'2n']]` — grid-unit lengths used to weight `pickDurationForGap()`'s choice (weight = unit value, so `2n` is ~8x more likely than `16n` whenever both fit)

## Integration at Spawn

```typescript
import { composeRobotMelody, melodyWorldKey } from '../engine/regenerateMelody';

// What spawnRobot does (and regenerateMelody after every edit): the composition stream on the robot's
// own seed, the rhythm and performance streams on the world and the rhythm shape, stamps applied.
const melody = composeRobotMelody(
  {
    compositionSeed,
    octaveRange: [2, 5],
    rhythmicDensity: 60,                              // 60% fill rate
    rhythmicMotifLength: { active: true, value: 8 },  // tile an 8-step cell across the measure
    noteVariance: { active: true, value: 2 },         // weighted slice of 2 notes
    pitchRepeat: 0,
    rests: 20,
    accents: 40,
  },
  melodyWorldKey(localeId),                           // `${x}:${y}`
);
```

`spawnRobot` stores the melody on the robot and registers it with AudioEngine (`registerRobotMelody`), which consumes it
via a step registry keyed by `startStep`.

**Where the five Melody fields come from (roadmap 57, the band table; `docs/specs/OFF_SCREEN.md` assumptions 15, 21, 22).** `robotFieldDerivation.ts`'s `deriveMelodyFields(noiseMap, spawnIndex, bands, attackSeconds)` is the one derivation of `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance` and `pitchRepeat`, and since roadmap 92 the journey's `journeyMaxIntensity` (its own two draws, [The two settings](#the-two-settings); what follows here is the other four) — at spawn, in the regenerated baseline a save is diffed against, and in the aspect deal. Each is an even draw (`getUniformSeededVal`) from the robot's own spawn index at its dataId (`robot.rhythmicDensity`, `robot.rhythmicMotifLength.active`, `robot.noteVariance.active`, `robot.pitchRepeat`), into a **band** read at the point of the draw: Density and Pitch Repeat from a range band, the two toggle fields through `seedToggleValue(raw, band)` from a `ToggleBand` (`{ offShare, min, max }`: a draw under `offShare` lands the field off, 0; the rest maps uniformly onto the whole numbers `min..max`). The bands are the world's theme's — `getBand(key)` from `src/data/bands/loadingContext.ts`, Classic's `{ 0–100 }`, `{ 0.15, 1–8 }`, `{ 0.15, 1–8 }` and `{ 0–100 }` (`classic.ts`) unless the theme's column moves Density — or, for a robot the deal gave a **Melody aspect** (Hypnotic, Mechanical, Wandering; `src/data/bands/aspects.ts`), that aspect's column over `resolveBands(theme, { melody: aspect })`: the same draws re-derived into the aspect's four bands, so a dealt robot is exactly what it would have been had it spawned under the aspect, and `Robot.loadedUnder.melody` records which. The deal itself — which robots, by company — is in [COMPANIES.md](COMPANIES.md)'s "The deal"; the bands per theme and aspect are tabled in [reference/ROBOT_DATA_GRID.md](reference/ROBOT_DATA_GRID.md). `applyAspectDeal` regenerates each dealt robot's melody from its new fields (`regenerateMelody`, re-registered with the engine) in `initializeLocale`, right after `spawnInitialCompanies`. A hand edit still goes through `applyDensity` and its siblings and is saved as an override, exactly as before; the aspect only moves where a fresh robot starts. A company member draws none of the five: it inherits its founder's at spawn, and the deal derives them at its founder's index ([COMPANIES.md](COMPANIES.md), "A seeded company is a family").

**The attack rail (2026-11-05).** A slow attack on dense notes never climbs: Tone restarts each note's attack from the envelope's current level, so a 1.14 s attack on back-to-back sixteenths reaches about a tenth of its peak per note and plays as a quiet, dull click (Solar Nomad, `?seed=bbng7yv2&x=21&y=-188`, density 88). So the density draw reads the robot's attack: `deriveMelodyFields(noiseMap, spawnIndex, bands, attackSeconds)` draws Density over `audibleDensityBand(band, attack, bpm)`, which caps the band where the mean gap between notes (100 ÷ density sixteenths, density being a fill rate) carries a linear attack to `ATTACK_REACH_SHARE` (0.5, `src/constants/index.ts`) of its peak. The gap is measured at the top of the theme's `bpm` band, the fastest tempo the world can seed, so the rule holds at any seeded tempo without tying a robot to the Attenuation Style that seeds the tempo (robots seed from coordinates alone). Under Classic's 40–100 BPM the cap is 30 ÷ attack: attacks to 0.3 s leave 0–100 whole, Solar Nomad's 1.14 s seeds 0–26. A cap under the band's bottom collapses the band onto the cap, so the rail wins over a dense theme or aspect. The draw stays even inside the narrowed band, at the same dataId. Envelope is drawn first at spawn, so nothing moves in the draw order; the deal derives Envelope before Melody for the same reason, and a robot dealt an Envelope option without a Melody one re-draws its density alone (`deriveRhythmicDensity`) under the theme's band against the dealt attack, its other Melody fields standing; `applyAspectDeal` regenerates its melody only when that moves the density. A company member takes its founder's attack and density together. It is a loading rule only: a hand edit of Density or Attack goes anywhere, and a tempo edit re-checks nothing. Measured over 12,000 Classic robots, it moves the share at density 25 or under from 26 % to 66 % and at 75 or over from 25 % to 7 % (Crawford: "it sounds fine now").

## Playback Integration

The playback layer plays each measure's melody: the registered home melody, developed for that measure by the robot's journey ([The melody journey](#the-melody-journey-roadmap-92); the engine's read is in [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline)). It uses the melody events as index-based cues and applies the palette of the note's own measure (`paletteForMeasure`, [HARMONY_SYSTEM.md](HARMONY_SYSTEM.md)) at scheduling time. The generator itself only produces the event structure; the actual pitch is resolved by the engine when the note is scheduled. An event's `rest` and `mark` are resolved there too (`resolveArticulation` in `processMelodyStep`): a shortened note is scheduled as seconds at the live tempo, floored at `MIN_SOUNDING_SECONDS`, and a mark's velocity factor rides the `accentMultiplier` beside the motif-group accent — see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline).

`AudioEngine`'s playback scheduler ticks on `'16n'` — 16 ticks per measure — so the 16 `startStep` slots this generator produces map 1:1 onto a single measure, exactly matching the "one measure, 16 subdivisions" model above. (This alignment was previously broken — the scheduler ticked on `'8n'`, stretching every melody's loop to 2 measures at half the tuned density — and was fixed to match this generator's model rather than the other way around.)

**Step 1 is the measure's first sixteenth, read from the clock** ([specs/ONE_MUSIC_CLOCK.md](specs/ONE_MUSIC_CLOCK.md) §4.4). The tick starts on the sixteenth grid and each firing reads its step from the transport's tick count at its own time (`positionAt(time).step`, [BEAT_CLOCK.md](BEAT_CLOCK.md#the-music-position)), not from a count of firings. So step 1 always lands on the bar, the palette changes with it, and a lost or late firing cannot shift the steps after it. Registered before the transport starts, the tick's first firing is measure 0, step 1, and no step of the first measure is lost. (Until that change a step counter ran from wherever the transport was when the tick registered, so step 1 sat 0.87 to 1.87 sixteenths after the bar; backlog 83.)

### Click Track (testing aid)

`AudioEngine.registerRobotMelody(robotId, melody)` — the one funnel every melody-registration call site shares (spawn, a Density/Motif Length/Note Variance/Pitch Repeat/Octave Range edit, the deal and a restored session) — ignores its `melody` argument entirely and substitutes a fixed pattern (`src/engine/clickTrack.ts`'s `buildClickTrackMelody`) whenever the robot's own `clickTrackActive` flag (`Robot.ts`) is true: a straight sixteenth on every step, `startStep` 1 to 16, each beat's four on its own noteIndex (`0000 1111 2222 3333` into the measure's palette), all at the robot's lowest octave except step 1, an octave up. So the step, the beat (a change of note) and the downbeat (the high note, where the palette changes every second measure) can each be heard. The override is enforced at that single funnel rather than at each call site, so nothing — including melody changes a user never directly triggered, like the deal's regeneration — can silently fall back to the real melody while the toggle still reads as on. The journey does not develop a Click Track robot: the engine plays the registered click pattern at every measure. Toggled from the last row of Composition > Rhythm & Melody, per robot on the robot screen and broadcast to every member on the company and All Probes screens (`useCompanyOptions`); purely a timing-by-ear testing aid, not part of a robot's generated melody. The toggle itself only renders behind `DEV_TUNING` (`CompositionSections.tsx`'s `CompositionRhythmMelodySection`), so it's unreachable in a production build.

## Testing Notes

The current tests cover:
- deterministic generation with `seed` or `rand`
- duration selection through `pickDurationForGap()` (never exceeds the available gap, weighted toward longer durations)
- onset construction through `buildMotifOnsets()`
- the density→onset-count floor of 1 (a `rhythmicDensity` roll of `0` never produces a silent melody), in both the scatter and tiled branches
- exact rounded onset counts at representative density percentages (100/50/25%) against the full measure
- identical per-window onset counts when Motif Length tiling is active (no remainder skew across repeat copies)
- Note Variance's `active: false` branch producing genuinely unweighted selection, distinct from the old always-weighted default
- `onsetCount` being rejected at compile time (`@ts-expect-error`)
- `buildMotifOnsets()`'s tail-cell pass: `M` values `1/2/4/8` unaffected (regression guard), `M` values `3/5/6/7` gain tail onsets that are a subset of the base motif's own positions and survive the overshoot-trim branch
- `computePitchLockPlan()`: `pct: 0` → all false, `pct: 100` → full lock (float-safety guard), monotonicity across a `0-100` sweep, determinism, seed-dependent (not always position-0-first) lock order, and tail-repeat exclusion for positions `>= tailLength`
- `generateMelodyForRobot`'s Pitch Repeat wiring: gating when Motif Length is off, no `pitchLocked` events at `pitchRepeat: 0`, full-lock verbatim repetition at `pitchRepeat: 100`, and Note Variance's uniqueness cap staying unaffected by locked copies
- `buildSeededComposition`: determinism (same `compositionSeed` + attrs → identical sequence), independent sensitivity to each of its six inputs, drop-in validity as `generateMelodyForRobot`'s `opts.rand`, and a `Math.random` spy confirming zero incidental randomness (`melodyGenerator.test.ts`)
- `rhythmShape`: densities that round to one count are one shape, an inert motif length is not part of it, and it is the count the generator plays; `buildSeededRhythm` / `buildSeededPerformance`: the same world and shape give the same stream (another density of the same shape included), a world or shape change a different one, and note variance, pitch repeat and octave never enter it; `rhythmRand`: one rhythm stream with two composition streams gives the same onsets and lengths and different notes, and two literal parity pins hold the one-stream melody (`melodyGenerator.test.ts`)
- `regenerateMelody.test.ts`, "the rhythm stream": only a rhythm setting moves the rhythm (B7), and in one world one shape is one rhythm (robots with different seeds play the same onsets, lengths and stamps, with their own notes)
- Spawn-time/edit-time unification: `spawnSystem.test.ts` proves a spawned melody exactly matches a rebuild from its stored fields (`buildSeededComposition` on its seed, `buildSeededRhythm` and `buildSeededPerformance` on its world's coordinates) and that a same-coordinates replay reproduces it; a capstone test there also proves `regenerateMelody`, called on a freshly spawned robot with zero attribute changes, reproduces the exact spawn melody (no first-edit ratchet) — the core acceptance criterion for Phase 31
- `regenerateMelody.test.ts`: determinism across repeated calls, the "edit then revert" case, and two robots with identical attributes but different `compositionSeed` producing different melodies
- `spawnSystem.families.test.ts`: over the 121 grid worlds, every company member plays its founder's onsets, lengths and stamps exactly, and most members' notes differ from their founder's
- `sessionDiff.test.ts`: a save → edit → wipe → load round trip reproduces a robot's exact melody, not just its attribute values
- The melody journey (roadmap 92; each new rule mutation-checked, the runs in [docs/tasks/MELODY_JOURNEY.md](tasks/MELODY_JOURNEY.md)'s Results):
  - `melodyJourney.test.ts`: `positionInPairs` on pairs written by hand (the spec's worked example, both calm limits; a pair's intensity first on its turning measure; never past it inside a pair); `journeyShares` (the same key gives the same shares, the three scopes differ, the home odds and the time lean as comparisons, the drop's rules); `robotPairs` (the rounding, the calm range, even times, the pair before a drop); `journeyAt` (the position: 0 at measure 0 and at max intensity 0, robots on one key turning together at different max intensities, the memo per max time; the trip: a new one when a pair heads for a new side, the old one until the robot has crossed, one trip for every robot on one side of one journey; the level: the share on each turning measure, a straight line across the pair, the same at every max intensity, no calm limit read); `robotJourney` (the scopes, Company with no company on Fleet, the defaults, one max time for every robot, the octave range)
  - `melodyDevelopment.test.ts`: the floor, each busy phase and the calm ties, the spec's worked example, `calmLimit`, `eventSixteenths`; the octave jumps (up from 1, 4 and 5, down otherwise, inside the range, half the candidates, none with no range); the shifts holding their directions; a different path each trip (one path per key and trip, the order from the key and the trip and never the seed, so two seeds play one rhythm; the two thresholds starting either way; the same calm floor whatever the order); `melodyDevelopment.worlds.test.ts` sweeps the 121 sim worlds' home melodies from the calm floor to past the last fill (no overlap, nothing outside the bar or under the floor, one change per position, every home note on its slot until the shifts, the same events and ids for the same inputs, the calm floor below it)
  - `harmonySystem.test.ts`: `stepInPalette` (the next pitch class, the octave across B to C, the turn back at the octave range)
  - `AudioEngine.test.ts`: `stepNotes` reading each measure's own melody from one registration, `sixteenths` sounding at the live tempo, a max intensity of 0 playing home at every measure, never a position below the calm limit, a Click Track robot never developed, the motif accent and the stamps kept on home notes only, and reading measure m, m+1, then m again rebuilding nothing; the performance following the level (calm quieter, busy shorter but never under the floor, accents deeper, every measure of a ramp, nothing at max intensity 0 or on the click track); the octave range and the trip in what a developed melody is kept by
  - `spawnSystem.families.test.ts`: over the 121 worlds, every company's members play the same starts and lengths at every measure of a run
  - the settings' seeding (`robotFieldDerivation.test.ts`, `spawnSystem.test.ts`, `aspectDeal.widened.test.ts`), the store's normalisation (`localeStore.test.ts`), the controls and the broadcast (`CompositionSections.test.tsx`, `RobotScreen.test.tsx`, `useCompanyOptions.test.ts`) and the save and the link (`sessionDiff.test.ts`, `worldDiffCodec.test.ts`)
