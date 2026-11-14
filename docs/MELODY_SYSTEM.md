# Melody Generation Specification

Source of truth: [`src/engine/melodyGenerator.ts`](../src/engine/melodyGenerator.ts).

Melody generation creates procedurally generated musical patterns for each robot at spawn time, producing immutable `MelodyEvent[]` values whose note choices are index-based and later resolved by the harmony palette at playback time.

## Core Principles

1. **Spawn-time only**: melodies are generated once per robot and then registered with AudioEngine.
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
}
```

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

The `noteVariance` option is a `{ active, value }` toggle. `generateMelodyForRobot`/
`reRollMelodyPitches` still branch on `.active` exactly as described below — that logic is
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

**Docking re-roll:** `reRollMelodyPitches` (called from `robotSystems.ts`'s `landOnDocked`, via
`DOCKED_PITCH_DRIFT_RATIO`) excludes `pitchLocked` events from its candidate pool before picking
which events to change. The "always changes at least 1" floor only applies once the eligible
(unlocked) pool is non-empty — a fully-locked melody re-rolls zero notes on dock instead of
force-changing one. Base-cell events are **not** excluded (they're never stamped `pitchLocked`
themselves), so a re-roll can still touch a base-cell position whose locked copies then look
briefly stale until the next full regeneration — a deliberate, low-cost tradeoff (see
docs/specs/PITCH_REPEAT.md §7.1), not a bug.

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

**Not covered by this determinism:** `robotSystems.ts`'s docking pitch-drift reroll
(`reRollMelodyPitches`, via `DOCKED_PITCH_DRIFT_RATIO`) is a distinct, intentionally non-reproducible
mechanism — gradual pitch drift over a robot's lifetime is the feature, not a gap. Session Storage's
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
- `OCTAVE_JUMP_CHANCE = 0.15` — before each note after the first, the chance the melody moves one octave up or down (picked
  evenly from the ones inside Octave Min–Max). A jump is never more than one octave, so a melody never skips the octave between
  two it plays. Until 2026-11-13 a jump went only to an octave more than one away: in the three-octave registers a melody that
  started at an edge leapt straight to the other edge and never played the middle (a hollow note cloud), and one that started in
  the middle never jumped at all.
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

**Where the four Melody fields come from (roadmap 57, the band table; `docs/specs/OFF_SCREEN.md` assumptions 15, 21, 22).** `robotFieldDerivation.ts`'s `deriveMelodyFields(noiseMap, spawnIndex, bands, attackSeconds)` is the one derivation of `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance` and `pitchRepeat` — at spawn, in the regenerated baseline a save is diffed against, and in the aspect deal. Each is an even draw (`getUniformSeededVal`) from the robot's own spawn index at its dataId (`robot.rhythmicDensity`, `robot.rhythmicMotifLength.active`, `robot.noteVariance.active`, `robot.pitchRepeat`), into a **band** read at the point of the draw: Density and Pitch Repeat from a range band, the two toggle fields through `seedToggleValue(raw, band)` from a `ToggleBand` (`{ offShare, min, max }`: a draw under `offShare` lands the field off, 0; the rest maps uniformly onto the whole numbers `min..max`). The bands are the world's theme's — `getBand(key)` from `src/data/bands/loadingContext.ts`, Classic's `{ 0–100 }`, `{ 0.15, 1–8 }`, `{ 0.15, 1–8 }` and `{ 0–100 }` (`classic.ts`) unless the theme's column moves Density — or, for a robot the deal gave a **Melody aspect** (Hypnotic, Mechanical, Wandering; `src/data/bands/aspects.ts`), that aspect's column over `resolveBands(theme, { melody: aspect })`: the same draws re-derived into the aspect's four bands, so a dealt robot is exactly what it would have been had it spawned under the aspect, and `Robot.loadedUnder.melody` records which. The deal itself — which robots, by company — is in [COMPANIES.md](COMPANIES.md)'s "The deal"; the bands per theme and aspect are tabled in [reference/ROBOT_DATA_GRID.md](reference/ROBOT_DATA_GRID.md). `applyAspectDeal` regenerates each dealt robot's melody from its new fields (`regenerateMelody`, re-registered with the engine) in `initializeLocale`, right after `spawnInitialCompanies`. A hand edit still goes through `applyDensity` and its siblings and is saved as an override, exactly as before; the aspect only moves where a fresh robot starts. A company member draws none of the four: it inherits its founder's at spawn, and the deal derives them at its founder's index ([COMPANIES.md](COMPANIES.md), "A seeded company is a family").

**The attack rail (2026-11-05).** A slow attack on dense notes never climbs: Tone restarts each note's attack from the envelope's current level, so a 1.14 s attack on back-to-back sixteenths reaches about a tenth of its peak per note and plays as a quiet, dull click (Solar Nomad, `?seed=bbng7yv2&x=21&y=-188`, density 88). So the density draw reads the robot's attack: `deriveMelodyFields(noiseMap, spawnIndex, bands, attackSeconds)` draws Density over `audibleDensityBand(band, attack, bpm)`, which caps the band where the mean gap between notes (100 ÷ density sixteenths, density being a fill rate) carries a linear attack to `ATTACK_REACH_SHARE` (0.5, `src/constants/index.ts`) of its peak. The gap is measured at the top of the theme's `bpm` band, the fastest tempo the world can seed, so the rule holds at any seeded tempo without tying a robot to the Attenuation Style that seeds the tempo (robots seed from coordinates alone). Under Classic's 40–100 BPM the cap is 30 ÷ attack: attacks to 0.3 s leave 0–100 whole, Solar Nomad's 1.14 s seeds 0–26. A cap under the band's bottom collapses the band onto the cap, so the rail wins over a dense theme or aspect. The draw stays even inside the narrowed band, at the same dataId. Envelope is drawn first at spawn, so nothing moves in the draw order; the deal derives Envelope before Melody for the same reason, and a robot dealt an Envelope option without a Melody one re-draws its density alone (`deriveRhythmicDensity`) under the theme's band against the dealt attack, its other Melody fields standing; `applyAspectDeal` regenerates its melody only when that moves the density. A company member takes its founder's attack and density together. It is a loading rule only: a hand edit of Density or Attack goes anywhere, and a tempo edit re-checks nothing. Measured over 12,000 Classic robots, it moves the share at density 25 or under from 26 % to 66 % and at 75 or over from 25 % to 7 % (Crawford: "it sounds fine now").

## Playback Integration

The playback layer uses the melody events as index-based cues and applies the palette of the note's own measure (`paletteForMeasure`, [HARMONY_SYSTEM.md](HARMONY_SYSTEM.md)) at scheduling time. The generator itself only produces the event structure; the actual pitch is resolved by the engine when the note is scheduled. An event's `rest` and `mark` are resolved there too (`resolveArticulation` in `processMelodyStep`): a shortened note is scheduled as seconds at the live tempo, floored at `MIN_SOUNDING_SECONDS`, and a mark's velocity factor rides the `accentMultiplier` beside the motif-group accent — see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-resolution-pipeline).

`AudioEngine`'s playback scheduler ticks on `'16n'` — 16 ticks per measure — so the 16 `startStep` slots this generator produces map 1:1 onto a single measure, exactly matching the "one measure, 16 subdivisions" model above. (This alignment was previously broken — the scheduler ticked on `'8n'`, stretching every melody's loop to 2 measures at half the tuned density — and was fixed to match this generator's model rather than the other way around.)

**Step 1 is the measure's first sixteenth, read from the clock** ([specs/ONE_MUSIC_CLOCK.md](specs/ONE_MUSIC_CLOCK.md) §4.4). The tick starts on the sixteenth grid and each firing reads its step from the transport's tick count at its own time (`positionAt(time).step`, [BEAT_CLOCK.md](BEAT_CLOCK.md#the-music-position)), not from a count of firings. So step 1 always lands on the bar, the palette changes with it, and a lost or late firing cannot shift the steps after it. Registered before the transport starts, the tick's first firing is measure 0, step 1, and no step of the first measure is lost. (Until that change a step counter ran from wherever the transport was when the tick registered, so step 1 sat 0.87 to 1.87 sixteenths after the bar; backlog 83.)

### Click Track (testing aid)

`AudioEngine.registerRobotMelody(robotId, melody)` — the one funnel every melody-registration call site shares (spawn, a Density/Motif Length/Note Variance/Pitch Repeat/Octave Range edit, and `robotSystems.ts`'s docking pitch-drift reroll) — ignores its `melody` argument entirely and substitutes a fixed pattern (`src/engine/clickTrack.ts`'s `buildClickTrackMelody`) whenever the robot's own `clickTrackActive` flag (`Robot.ts`) is true: a straight sixteenth on every step, `startStep` 1 to 16, each beat's four on its own noteIndex (`0000 1111 2222 3333` into the measure's palette), all at the robot's lowest octave except step 1, an octave up. So the step, the beat (a change of note) and the downbeat (the high note, where the palette changes every second measure) can each be heard. The override is enforced at that single funnel rather than at each call site, so nothing — including automatic melody changes a user never directly triggered, like the docking reroll — can silently fall back to the real melody while the toggle still reads as on. Toggled from the top of the Composition section, per robot on the robot screen and broadcast to every member on the company and All Probes screens (`useCompanyOptions`); purely a timing-by-ear testing aid, not part of a robot's generated melody. The toggle itself only renders behind `DEV_TUNING` (`PingControlsDrawer.tsx`'s `PingControlsCompositionSection`), so it's unreachable in a production build.

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
- `reRollMelodyPitches` excluding `pitchLocked` events from its candidate pool, including the fully-locked (zero changes) and no-locks-present (regression) cases
- `buildSeededComposition`: determinism (same `compositionSeed` + attrs → identical sequence), independent sensitivity to each of its six inputs, drop-in validity as `generateMelodyForRobot`'s `opts.rand`, and a `Math.random` spy confirming zero incidental randomness (`melodyGenerator.test.ts`)
- `rhythmShape`: densities that round to one count are one shape, an inert motif length is not part of it, and it is the count the generator plays; `buildSeededRhythm` / `buildSeededPerformance`: the same world and shape give the same stream (another density of the same shape included), a world or shape change a different one, and note variance, pitch repeat and octave never enter it; `rhythmRand`: one rhythm stream with two composition streams gives the same onsets and lengths and different notes, and two literal parity pins hold the one-stream melody (`melodyGenerator.test.ts`)
- `regenerateMelody.test.ts`, "the rhythm stream": only a rhythm setting moves the rhythm (B7), and in one world one shape is one rhythm (robots with different seeds play the same onsets, lengths and stamps, with their own notes)
- Spawn-time/edit-time unification: `spawnSystem.test.ts` proves a spawned melody exactly matches a rebuild from its stored fields (`buildSeededComposition` on its seed, `buildSeededRhythm` and `buildSeededPerformance` on its world's coordinates) and that a same-coordinates replay reproduces it; a capstone test there also proves `regenerateMelody`, called on a freshly spawned robot with zero attribute changes, reproduces the exact spawn melody (no first-edit ratchet) — the core acceptance criterion for Phase 31
- `regenerateMelody.test.ts`: determinism across repeated calls, the "edit then revert" case, and two robots with identical attributes but different `compositionSeed` producing different melodies
- `spawnSystem.families.test.ts`: over the 121 grid worlds, every company member plays its founder's onsets, lengths and stamps exactly, and most members' notes differ from their founder's
- `sessionDiff.test.ts`: a save → edit → wipe → load round trip reproduces a robot's exact melody, not just its attribute values
