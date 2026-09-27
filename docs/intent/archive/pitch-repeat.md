# Intent: Pitch Repeat

Confirmed via `/interview-me` on `main`, 2026-09-01.

**Human label:** Pitch Repeat. **Lore label (UI-facing):** Ping Repetition Allowance — consistent
with the existing "Ping Controls"/"Ping Contour" naming family (`PingControlsDrawer.tsx`,
`PingContourDrawer.tsx`).

## Outcome

A new per-robot slider, `0–100` (a plain number, same shape as `Robot.rhythmicDensity` — no
separate `{active, value}` toggle of its own), that increasingly locks a tiled motif's *repeated
cells* to the same pitches as the base cell, not just the same rhythm. Today, when Motif Length
tiling is active, onset **positions** repeat identically across cells, but each onset's `noteIndex`
is still chosen independently per repeat — so the "motif" only half-repeats. This slider closes that
gap with graduated, fully deterministic control.

**Gating:** Inert whenever `rhythmicMotifLength.active === false` — there is no "cell" concept to
lock pitches within when tiling is off.

**Mechanism, at `slider = 0`:** Pitch selection is exactly what it is today — every onset's
`noteIndex` goes through the existing Note Variance logic, independent of which repeat/cell it's in.

**Mechanism, at `slider = 100`:** Every repeat of a tiled cell is pitch-identical to the base cell
(full verbatim motif repetition, rhythm + pitch).

**Mechanism, in between — staged, seeded, monotonic:**
- The base cell has one onset position per index `0..K-1` (`K` = number of onsets in the base
  motif cell). At generation time, a seeded permutation of `0..K-1` is drawn once — this is the
  **order positions get locked in**, and it is *not* always position 0 first; it varies per robot.
- The slider's range is divided into `K` stages, one per position in that seeded order. Within a
  position's stage, match probability for that position ramps from 0% (stage start) to 100% (stage
  end); once a stage completes, that position's repeats stay fully locked as later stages run —
  locking is monotonic, never regresses as the slider rises.
- "Which repeats match first" within a stage is **also seeded**, but the same seeded permutation of
  repeat order is **shared across every position** in the cell (not re-rolled per position) — a
  repeat that has "unlocked" earlier stays unlocked-first for later stages too. This is a **fixed
  count**, not a per-repeat independent coin flip: at a given slider value, exactly N of the
  non-base repeats are locked for the current stage's position, where N is read off the shared
  seeded order's prefix — deliberately more controllable/less chaotic than an independent
  probabilistic roll per repeat.
- Locked `(position, repeat)` onsets copy the base cell's `noteIndex` **verbatim**, bypassing Note
  Variance selection entirely for that onset. Unlocked onsets are unaffected — they run through
  today's Note Variance logic exactly as if this feature didn't exist.
- **Tail-cell fix (untruncating), bundled into this feature:** Today, when `rhythmicMotifLength.value`
  (`M`) doesn't evenly divide 16, the leftover `16 mod M` steps past `repeats × M`
  (`repeats = floor(16 / M)`) never receive an onset — verified against `buildMotifOnsets`
  (`melodyGenerator.ts`), whose tiling loop only runs `repeats` times. `buildMotifOnsets` gains a
  final partial-cell pass: after tiling `repeats` full copies of the base motif, it also copies
  whichever base-motif positions are `< tailLength` (`tailLength = 16 − repeats × M`) into one final
  partial cell at offset `repeats × M`. This is a deterministic subset of the same base motif — not
  a fresh random draw — so it participates in Pitch Repeat's base-cell lock exactly like a full
  repeat, just with fewer positions (whichever base positions happen to fall inside the shorter
  tail). The appended onsets don't count against `buildMotifOnsets`' existing
  `combined.length <= rhythmicDensity` trim check — they're bonus fill from previously-dead grid
  space, appended after that check runs, not part of the requested density target.
  **Blast radius:** this is a change to the shared rhythm engine, not scoped to Pitch Repeat — every
  robot with `rhythmicMotifLength.active: true` and a `value` that doesn't evenly divide 16 (`3, 5,
  6, 7`) gets a few extra onsets it didn't have before, regardless of that robot's own Pitch Repeat
  setting. Values `1, 2, 4, 8` evenly divide 16, so those robots are unaffected — no tail exists for
  them. Bundled here (rather than filed separately) because without it, Pitch Repeat's tail-cell
  locking has nothing to lock — the cell would stay permanently empty.
- Each event that ends up locked is stamped `pitchLocked: true` on the `MelodyEvent` (a new,
  plain, serializable boolean field) — this records the outcome so downstream consumers (the docking
  re-roll, in particular) don't need to re-derive the seeded position/repeat permutations to know
  which onsets are locked.

## Seeding & lifecycle

- **Spawn:** Rolled per-robot from the locale's coordinate-derived noise map, same convention as
  `rhythmicDensity`/`rhythmicMotifLength`/`noteVariance` — `getSeededVal(noiseMap, 'robot.pitchRepeat',
  spawnCount, 0, 100)` in `spawnSystem.ts`. A robot created via the `shouldCopy` path inherits its
  source's value, same as the other three fields.
- **Coordinate change:** Not special-cased or preserved. A locale coordinate change produces a new
  noise map, which already reseeds density/motif/variance/melody together (`spawnSystem.ts`'s
  `getLocaleNoiseMap(localeId, x, y)` keying). This feature's rolled slider value, its seeded
  position-lock-order permutation, its seeded repeat-lock-order permutation, and every event's
  `noteIndex`/`pitchLocked` outcome are simply part of "the melody" being rebuilt fresh from the new
  seed — nothing about this feature survives a coordinate change any more than density does today.
- **Manual edit:** Mirrors `applyDensity`/`applyMotifLength`/`applyNoteVariance` in
  `robotOptionsActions.ts` exactly — a new `applyPitchRepeat(robot, localeId, value)` writes the
  field via `updateRobot` and calls `regenerateMelody`, which rebuilds the whole melody. Consistent
  with (not a fix to) `regenerateMelody.ts`'s existing behavior of using an unseeded `Math.random`
  path for manual edits, same as the other three fields today.
- **Company broadcast:** `applyPitchRepeat` also gets wired into `CompanyOptionsSection.tsx`
  alongside `applyDensity`/`applyMotifLength`/`applyNoteVariance`, so broadcasting a company's
  melody settings includes Pitch Repeat like every other rhythm/pitch field — no reason for it to
  be the one field left robot-only.

## Docking re-roll interaction

`reRollMelodyPitches` (called from `robotSystems.ts` on every Docked transition, via
`DOCKED_PITCH_DRIFT_RATIO = 0.25`) must exclude `pitchLocked` events from its candidate pool before
picking `round(melody.length × ratio)` events to change. If the eligible (unlocked) pool is smaller
than that count — including empty — it simply picks from what's available, down to zero. The
existing "always changes at least 1" floor no longer holds once locking is involved: a heavily
Pitch-Repeat-locked melody should visibly resist drifting on dock, not quietly compensate to
preserve a fixed amount of change.

## User

Crawford (solo dev), tuning the melody generator's expressive range for robot audio design.

## Why now

Motif Length tiling already gives repeating rhythm; this gives the option of repeating pitch too,
closing the "half-repeats" gap without touching rhythm, duration, or octave logic.

## Success

- At `slider = 0`, generated melodies are statistically indistinguishable from today's (no locking
  applied, Note Variance runs unmodified).
- At `slider = 100`, every repeat of a tiled cell has identical `noteIndex` sequences to the base
  cell.
- Intermediate values produce a visibly progressive, monotonic increase in matched positions/repeats
  as the slider rises, with two independent seeded permutations (position order, repeat order)
  driving *which* onsets lock first — deterministic given the same seed, not per-item probabilistic.
- The slider's rolled value is visibly different across robots spawned at different coordinates
  (coordinate-seeded, same as Density), and rerolls along with everything else on a coordinate
  change.
- Docking a heavily-locked robot changes fewer (possibly zero) notes on re-roll; docking a
  `slider = 0` robot behaves exactly as it does today (2 of 8 onsets, at default settings).
- For `rhythmicMotifLength.value` values that don't evenly divide 16 (`3`, `5`, `6`, `7`), the tail
  steps now receive onsets — a deterministic subset of the base motif's positions — instead of
  staying empty; verifiable by comparing `buildMotifOnsets`' onset count before/after for e.g.
  `value: 3, density: 100` against a 16-step measure. Values `1, 2, 4, 8` are unaffected (no tail).

## Constraint

- Fully seeded/deterministic — no `Math.random` in the generation-time locking logic (per
  CLAUDE.md); `regenerateMelody.ts`'s existing unseeded manual-edit path is unchanged, not extended.
- State stays JSON-serializable: the slider value is a plain number on `Robot`, `pitchLocked` is a
  plain boolean on `MelodyEvent` — no functions, no derived-at-read-time closures.
- `Robot.melody` is typed `MelodyEvent[]`. At the time this feature was built, `types/Robot.ts` and
  `melodyGenerator.ts` each declared their own separate, structurally-identical copy of this
  interface (`MelodyEvent` and `RobotMelodyEvent`, respectively) — pre-existing duplication, not
  something this feature introduced, and `pitchLocked?: boolean` had to be added to *both* or reads
  of `robot.melody[i].pitchLocked` (e.g. the docking re-roll) wouldn't type-check. That duplication
  was resolved on `bug/duplicate-melody-event`: `types/Robot.ts` is now the sole declaration, and
  `melodyGenerator.ts` imports it rather than keeping its own copy.
- The tail-cell fix above is the *only* rhythm/onset-generation change this feature makes — duration
  selection and octave assignment are untouched, and no other onset-generation behavior changes.
  Everything else about this feature only ever affects `noteIndex` selection and adds the one new
  `pitchLocked` flag.
- Reuses the existing seeding mechanism (`getLocaleNoiseMap` + `getSeededVal`) — no new seeding/hash
  utility, matching the precedent set by `robot.id`, `robot.rhythmicDensity`, etc.

## Out of scope

- Any effect when `rhythmicMotifLength.active === false` (feature is fully inert — no cell to lock
  pitches within).
- Per-position-independent repeat-lock ordering (each position rolling its own repeat order rather
  than sharing one).
- Probabilistic (coin-flip) locking of individual `(position, repeat)` pairs.
- Preserving lock state, the rolled slider value, or the seeded permutations across a coordinate
  change.
- Fixing `regenerateMelody.ts`'s existing unseeded manual-edit behavior for Density/Motif
  Length/Note Variance — out of scope for this feature, pre-existing behavior.
- Changing `buildMotifOnsets`' `R`-extra-onset-per-repeat behavior or its `combined.length <=
  rhythmicDensity` overshoot-trim branch — both untouched. The tail-cell fix is a separate, additive
  pass appended after that existing logic runs, not a rewrite of it.
- Any UI primitive work beyond adding one more schema-driven slider alongside Density/Motif
  Length/Note Variance. The `RobotAudioTab.tsx` referenced by `robot-melody-seed-engine.md`'s
  precedent no longer exists — Phase 9's `StepperWithToggle` migration has since shipped, and the
  slider markup now lives in `PingControlsDrawer.tsx` (schema-driven via a new
  `PITCH_REPEAT_SCHEMA` in `robotOptionsConfig.ts`), wired from `RobotOptionsTab.tsx` (robot mode)
  and `CompanyOptionsSection.tsx` (company-broadcast mode, matching `applyDensity`/
  `applyMotifLength`/`applyNoteVariance`'s existing wiring there). No further primitive work beyond
  adding this one slider through the existing pattern.
