# Intent: Robot Melody & Seed Engine (Roadmap Phase 6)

Confirmed via `/interview-me` on `main`, 2026-08-25. Covers the remaining slice of
[Roadmap Phase 6](../todo/roadmap.md#6-robot-melody--seed-engine) after its first
Restructure bullet (planet-agnostic lat/long seeding) was pulled forward and resolved by
[locale-seed-decoupling.md](locale-seed-decoupling.md) /
[docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md). This doc covers what's
left: robot ID determinism, standardizing measure-length references to 16 sixteenth notes, and the
melody rhythm-engine overhaul (density-as-%, motif length range/toggle, note variance toggle).

This doc is deliberately **wider than the roadmap's own file list**. The roadmap's About/Docs
sections name only `melodyGenerator.ts` and `localeStore.ts`, but `generateMelodyForRobot`'s API is
also called from `regenerateMelody.ts` and consumed by `RobotAudioTab.tsx`'s sliders — both go
stale (compiling but semantically wrong) if left untouched. This phase fixes all four in lockstep
rather than leaving two of them for Phase 9 to silently inherit as broken.

## Outcome

`src/engine/melodyGenerator.ts` becomes a percentage/toggle-driven rhythm engine, robot IDs become
deterministic, and every current consumer of the changed API is updated in the same phase:

- **Density** (`Robot.rhythmicDensity`): becomes `0–100` (a fill-rate percentage), replacing the
  old `4–12` onset-count range. Converts to an onset count via round-to-nearest against 16 (when
  motif tiling is off — the whole measure) or against the motif's `value` (when tiling is on — one
  motif cell, then tiled/truncated across the measure) — **with a hard floor of 1 onset either
  way**, so no seeded roll can ever produce a silent robot.
- **Motif Length** (`Robot.rhythmicMotifLength`): becomes `{ active: boolean; value: number }`,
  `value` ranging `1–8` (step 1) — down from the old plain `1–16` number, and now carrying its own
  on/off toggle instead of always applying. Off → onsets scatter freely across the full measure. On
  → a `value`-length cell tiles across the measure and truncates at measure end. This shape is an
  exact match for Phase 1's existing `StepperWithToggleValue` (`src/components/ui/controls/StepperWithToggle.tsx`).
- **Note Variance** (`Robot.noteVariance`): becomes `{ active: boolean; value: number }`, same
  `1–8`/step-1 range and same `StepperWithToggleValue` shape as Motif Length — replacing the old
  `0–8` magnitude-only number (where `0` meant "off"). Off → unweighted random pick from all 8
  pitch indices. On → a weighted slice of `value` notes from the pitch array.
- **`onsetCount`** is deleted from `GenerateMelodyForRobotOptions` entirely — it was a pre-percentage
  legacy fallback (`rhythmicDensity ?? onsetCount`), and every call site is being fixed anyway, so
  there's nothing left for it to shim.
- **Robot IDs** replace `crypto.randomUUID()` (`spawnSystem.ts`) with a deterministic derivation
  through the *existing* seeding mechanism — `getSeededVal(getLocaleNoiseMap(...), 'robot.id',
  spawnCount, ...)`, formatted into a human-legible string — rather than a new hashing utility.
  Uniqueness is structural, not actively checked: `getSeededVal`'s `dataId` string already gives
  each field its own effectively-unique row in the noise map (this is what every other seeded
  attribute — `robot.name.adj`, `robot.masterVolume`, etc. — already relies on), and `spawnCount` is
  already a monotonic per-locale counter. No new "seed row reuse" guard function is needed; the
  property the roadmap wants already falls out of the existing `dataId`/`offset` pattern used
  correctly.
- **Measure-length references**: `AudioEngine.ts`'s scheduler already correctly ticks `'16n'`
  (16 steps = 1 measure) — no runtime change needed there. What's actually stale are two leftover
  doc comments from before that scheduler bug was fixed: `Robot.ts:60` ("16-step, 2-measure loop")
  and `melodyGenerator.ts:13` ("8th-note position in 2-measure loop") — both get corrected to
  describe the real, already-shipped single-measure/16-subdivision model.
- **`localeStore.ts`'s `updateRobot` clamp block** (lines ~117–125) is rewritten for the new ranges
  and new object shapes — clamping `rhythmicDensity` to `0–100`, and clamping `rhythmicMotifLength`/
  `noteVariance`'s nested `.value` to `1–8` while coercing `.active` to boolean, instead of the
  current flat `Math.max/min/trunc` against the old numeric ranges.
- **`regenerateMelody.ts`** and **`RobotAudioTab.tsx`** are updated to read/write the new field
  shapes and ranges. `RobotAudioTab.tsx` keeps its current hand-rolled Radix `Slider`/`input`
  markup — it does **not** adopt the `StepperWithToggle` primitive early. Phase 9 is a wholesale,
  one-time tear-out of every control in this tab (Audio Mode, Density, Octave Range included, not
  just these two); migrating only two of five controls now would leave the tab half-migrated and
  duplicate work Phase 9 already redoes.

## User

Crawford (solo dev) — this phase needs to leave the codebase internally consistent for the next
person touching it (which is also Crawford), not just technically compliant with the roadmap's
literal file list.

## Why now

Phase 12 (Session Storage) explicitly depends on robot IDs being deterministic so it can reapply
Robot Options overrides by ID after the roster regenerates from a reload or shared link — this is a
hard prerequisite, not a nice-to-have. The rhythm-engine overhaul is bundled into the same phase per
the roadmap's own sequencing, and doing both together means the two extra call sites
(`regenerateMelody.ts`, `RobotAudioTab.tsx`) that share the melody API only need touching once.

## Success

- `generateMelodyForRobot` accepts `rhythmicDensity: 0–100`, no `onsetCount`, and produces melodies
  with at least 1 onset for every valid input, including density rolls near 0.
- `Robot.rhythmicMotifLength` and `Robot.noteVariance` are both `{ active: boolean; value: number }`
  (`value` clamped `1–8`), and `localeStore.ts`'s `updateRobot` correctly clamps both nested shapes
  without mis-clamping a valid new-range value into the old numeric range.
- Two calls to `spawnRobot` against the same locale coordinates (same seed) produce robots with
  identical IDs in the same spawn order — the determinism Phase 12 needs, verifiable by comparing
  two fresh spawns against a reset spawn counter.
- `regenerateMelody.ts` and `RobotAudioTab.tsx` compile and behave correctly against the new shapes;
  manually exercising the Density/Motif/Note-Variance controls in `RobotAudioTab` produces melodies
  matching the new semantics, not the old onset-count/magnitude semantics.
- `Robot.ts:60` and `melodyGenerator.ts:13`'s comments describe the single-measure, 16-subdivision
  model — no remaining "2-measure" references anywhere in `src/`.
- `docs/MELODY_SYSTEM.md` and `docs/PROCEDURAL_GENERATION.md` are updated per the roadmap's Docs
  bullets.

## Constraint

- No new hashing/collision-avoidance utility for robot IDs — reuse `getLocaleNoiseMap`/
  `getSeededVal` exactly as every other spawn-time attribute does.
- `RHYTHMIC_DENSITY_MIN/MAX` → `0/100`, `RHYTHMIC_MOTIF_LENGTH_MIN/MAX` → `1/8`,
  `NOTE_VARIANCE_MIN/MAX` → `1/8` (not `0/8` — `0` as a magic "off" value is retired now that
  `active: false` covers that state) in `src/constants/index.ts`, the single shared source these
  three files already draw from.
- `RobotAudioTab.tsx` is fixed for correctness only in this phase — no primitive migration, no
  early adoption of Phase 1's `StepperWithToggle` component. That stays Phase 9's job for the whole
  tab at once.
- Everything already resolved by `LOCALE_SEED_DECOUPLING.md` (planet-agnostic locale seeding) is
  untouched — this doc only covers what that one explicitly left pending.

## Out of scope

- Any UI primitive swap in `RobotAudioTab.tsx` (Phase 9's job).
- `AudioEngine.ts`'s scheduler internals — already correct; only stale comments elsewhere are fixed.
- Session Storage's actual override-reapplication-by-ID logic (Phase 12) — this phase only makes
  robot IDs stable enough for that to be possible later.
- Locale-to-planet decoupling and the coordinate dead-zone fix — already done, see
  [locale-seed-decoupling.md](locale-seed-decoupling.md).
