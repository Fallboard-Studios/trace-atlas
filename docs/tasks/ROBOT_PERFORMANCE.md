# Implementation Plan: Robot Performance — Dynamics, Rests, Accents, Humanize

Spec: [docs/specs/ROBOT_PERFORMANCE.md](../specs/ROBOT_PERFORMANCE.md). Intent:
[docs/intent/robot-performance.md](../intent/robot-performance.md). Roadmap **50.5** (proposed; T19 writes it).
Branch `feature/palette-performance`, off `main` at `2ec52f2f`.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the Pixel `?debug` HUD A/B (spec §5) at T18.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: PLANNED 2026-10-15.** Spec assumptions 1–14 not yet reviewed by Crawford. The veto points are
> isolated so a late veto is a one-task change: assumption 2 (marks per event vs copied across motif repeats) →
> T3; assumption 6 (velocity baseline 0.8) → T5; assumption 5 (tiers and multipliers) → T2; assumption 10
> (Humanize in the Pacing top row) → T13; assumption 13 (seed ranges) → T6 / T12; assumption 14 (lore words)
> → T8 / T13. The "Dynamics" naming clash (spec §7) → T8, one content key.
>
> **Progress 2026-10-15: T1–T6 BUILT** on `feature/palette-performance` (555292a1 … 102c08ae); suite, types, lint and
> build green. Checkpoint A's two manual items (a dev-server day cycle, the `?debug` HUD) are Crawford's. Next: T7.
> Five deviations from the first draft of this plan, all patched into the tasks below and the spec:
> 1. **Stream key (T3, veto point of assumption 2).** `buildSeededPerformance(compositionSeed)` is keyed on the seed
>    alone. With `${rests}:${accents}` in the key every slider tick re-seeded the stream, so the four-draw contract
>    could not hold through `regenerateMelody`. One-line revert if vetoed.
> 2. **Humanize is pushed (T6 → T11).** `AudioEngine.setHumanize(ms)` replaces the engine's store read (audioStore
>    imports AudioEngine; `:607` is a static localeStore import). **T11's `setHumanize` and its seed-once branch must
>    call it**; T15's restore goes through `setHumanize`, so it follows for free.
> 3. **Company snapshot fields moved from T1 to T14** (`Required<CompanyOptionsSnapshot>` forces the resolver).
> 4. **No determinism oracle existed (T4, T5).** The stale expectation was `sessionDiff.test.ts`; T5's oracle is new.
> 5. **T5 extras:** `computeNoteVelocitySeeded` exported, Dynamics clamped 0–100 (NaN → 50), `min(1, rate)` removed.
>
> **Progress 2026-10-15 (Phase 2): T7–T13 BUILT** on `feature/palette-performance` (8d13777d … 53e4b2be); full suite 358 files /
> 11 968 tests, types, lint (0 errors) and build green. Checkpoints B, C and D's listening items are Crawford's. Deviations:
> 6. **T10 lives in `PingControlsCompositionSection`, not the PHRASING panel.** The screens render the Composition section
>    (three unlabelled rows, the Click Track toggle removed); `PingControlsDrawer` and `PHRASING_PANEL_SCHEMA` are retired
>    and unused outside their tests, so the plan's "inside `PHRASING_PANEL_SCHEMA`" would have put the sliders on no
>    screen. The Articulation panel is a fourth, labelled panel after the Octave row, gated by `disabled` alone (there is no
>    click-track gate in that section, and unlike Pitch Repeat neither slider needs Phrase Length). Checkpoint C judges the look.
> 7. **T12 before T11, and a uniform draw.** T11's seed branch imports `generateHumanize`, so T12 was built first to keep every
>    commit type-checking. A plain `getSeededVal` draw on `globalAudio.humanize` gave **3 distinct values over 300 styles** (the
>    plan's own guard), so `generateHumanize` uses `getUniformSeededVal` (same dataId; the plan's "rename the dataId" fallback would
>    not have fixed a flat offset-0 patch). The noise map is seeded by the **name alone**; the id only keys the cache.
> 8. **T9/T10 company stand-ins** carry `TODO T14` markers in `useCompanyOptions.ts` (first member's values, one inert handler
>    `NO_PERFORMANCE_BROADCAST` shared by the three). Their tests are labelled "replaced by Task 14".
> 9. **Existing exact-shape expectations moved** with the new fields: three `toEqual`s on `audioSettingValue` / the disabled
>    placeholder in `useCompanyOptions.test.ts` gained `dynamics`; `AudioSettingSection.test.tsx`'s no-op const was renamed
>    `LEVEL_NOOPS` and its `makeValue` gained `dynamics: 50`; the two `AudioEngine` mocks that load `audioStore`
>    (`audioStore.test.ts`, `audioStore.tempoSync.test.ts`) gained `setHumanize: vi.fn()` (module-load seeding pushes).
> 10. **Melody event ids are fresh UUIDs on every generation**, so tests comparing a Rests/Accents re-register to the plain melody
>     compare `startStep / length / noteIndex / octave`, not ids.
>
> **Progress 2026-10-16 (Phase 3): T14–T16 BUILT** on `feature/palette-performance` (4f4f9939, ce72e3be, 8b4958a2); full suite 358 files /
> 12 003 tests (one unrelated flake, `sceneToOrbiterLocal.test.tsx`'s 50-random-gem round trip, passes in isolation; not chased), types,
> lint (0 errors) and build green. T15's mutation check (accents dropped from the merge) turned the restore case red. Checkpoint E's
> manual items are Crawford's. Deviations:
> 11. **`CompanyOptionsSection.tsx` needed no change in T14.** T9/T10 had already passed the hook's `onDynamicsChange` / `onRestsChange` /
>     `onAccentsChange` through to the shared sections, so the stand-ins to replace all lived in `useCompanyOptions.ts` (the inert
>     `NO_PERFORMANCE_BROADCAST` and the first-member values). The three handlers follow `onDensityChange` exactly: no NaN guard, no
>     member-count guard (the controls are disabled with no members). `docs/COMPANIES.md` got its subsection in T14, not T19.
> 12. **The diff guards presence (T15).** `computeRobotAudioOverrideDiff` writes `dynamics` / `rests` / `accents` only when the live robot
>     carries a value (`!== undefined`, the articulation fields' rule), so an older robot never writes an undefined-valued key.
> 13. **A decoded absent `hm` is a present-but-undefined key (T16)**, exactly as `sd` / `sf` / `b` / `pv` already are (`fromCompactSessionPayload`
>     assigns `humanize: compact.hm`); `applySessionPayload`'s `!== undefined` reads it as absent. The per-robot `dy` / `rt` / `ax` are
>     genuinely omitted. The plan's "absent keys stay absent" holds `toEqual`-wise; the test says so. `docs/SESSION_STORAGE.md` got its
>     section in T16, not T19.
> 14. **The positioned rolls are `alea` draws, not noise-map samples (T20).** `compositionSeed` is a 0–1 fraction, so the spec's
>     `(compositionSeed + position) % VELOCITY_PERIOD` put the whole roster within one unit on a smooth field: Humanize moved a unison
>     together (inaudible) and the Dynamics roll was all-or-none across robots. `performanceRoll(seed, purpose, position)` replaces it for
>     velocity, variance and Humanize; the legacy counter path is unchanged. Found at Checkpoint D (Crawford), measured, fixed test-first.

## Overview

Nineteen tasks in five phases, in the intent's build order so Crawford can listen to each control before the
next is built. **Phase 1** is the foundation nothing can see: types and constants, the articulation table,
the melody post-pass, and the spawn seeding. **Phase 2** is the engine: position-keyed velocity with the
Dynamics scale and the 0.8 baseline, then the articulation and humanize arithmetic on the tick. **Phase 3**
is the robot-screen vertical slice in listen order: Dynamics (Levels), then Rests and Accents (Composition),
then Humanize (Pacing) — each visible and audible on one robot at its own checkpoint. **Phase 4** widens it
to companies and makes it persist. **Phase 5** is the guard test, Crawford's listen and Pixel A/B, and docs.
Every task leaves types, lint and the suite green; RED first; one commit per task; mutation-check at the
named gates ([[tdd-incremental-workflow]]).

## Architecture Decisions

- **Absence is the default (spec assumption 1).** `dynamics` / `rests` / `accents` are optional on `Robot`;
  `rest` / `mark` optional on `MelodyEvent`; `DEFAULT_DYNAMICS = 50`, `DEFAULT_RESTS = 0`, `DEFAULT_ACCENTS = 0`
  reproduce today's sound, so every fixture, saved session and share link decodes unchanged.
- **Marks are a post-pass from their own stream (assumption 2).** `applyPerformanceMarks` runs after
  `generateMelodyForRobot` at both call sites with `buildSeededPerformance(compositionSeed)` (keyed on the seed
  alone: see the progress note); `buildSeededComposition` and its key are untouched, so notes never move when the
  two sliders do. Four `rand()` draws per event, always, so a slider change re-stamps one concern without shifting
  the other, and raising either slider only adds stamps.
- **One table for every number a mark means (assumption 5).** `src/engine/articulation.ts` holds
  `ARTICULATION_MARKS`, `unlockedMarks`, `resolveArticulation`; the engine imports it, nothing else computes
  a multiplier. A rest and a mark on one event: the shorter wins, tenuto cancels the rest.
- **Headroom (assumption 6).** `NOTE_VELOCITY_BASELINE` 1 → 0.8 in its own task (T5) so the level change and
  the new oracle are one revertable commit.
- **Position-keyed rolls (assumption 8).** `processMelodyStep` passes `position = stepCounter`; velocity and
  humanize draws are `performanceRoll(compositionSeed, purpose, position)` (T20 — the first build's
  `(compositionSeed + position) % VELOCITY_PERIOD` noise-map offset correlated the whole roster, see deviation 14).
  The old `robotNoteIndex` counter stays as the no-position fallback only.
- **Humanize is a Pacing scalar (assumption 9).** `audioStore.humanize` in ms with the swell fields'
  seed-once / carry-forward mechanism, **pushed to the engine** with `AudioEngine.setHumanize(ms)` (the
  `setPolyphonyCap` precedent; the engine never reads a store on the tick) and fetched into a per-step offset
  function once per step; click-track entries are exempt via a flag set in `registerRobotMelody`.
- **Restore regenerates for free.** `applySessionPayload` already calls `regenerateMelody` for every robot
  with a diff (`sessionDiff.ts:608`), so restored `rests` / `accents` take effect once `buildRobotUpdates`
  merges them — spec risk 6 closes by inspection; T15 pins it with a test.
- **Ordering.** Types (T1) before everything; the table (T2) and post-pass (T3) before spawn (T4) and the
  engine (T6); velocity (T5) before the tick (T6) so each layer's tests mock the one below. UI tasks land in
  the intent's listen order. Persistence (T15–T16) waits for T4 so the baseline parity test has a
  distinguishing seeded value.

## Dependency Graph

```
T1 types + constants + defaults + store clamp ─┬─► T2 articulation.ts (table, tiers, resolve) ─────┐
                                               ├─► T3 melodyGenerator post-pass + regenerateMelody ─┼─► T4 spawn seeding + baseline + copy branch
                                               └─► T5 AudioEngine velocity (position, dynamics, 0.8) ┘            │
                                                                                     T6 AudioEngine tick (articulation, humanize, clickTrack flag) ◄── T2, T5
                                                                                                           Checkpoint A
T7 applyDynamics / applyRests / applyAccents (needs T3) ─┐
T8 content + schemas (needs T1) ─────────────────────────┼─► T9 Levels: Dynamics row + RobotScreen ─► Checkpoint B (listen: Dynamics)
                                                         ├─► T10 Composition: Articulation row + RobotScreen ─► Checkpoint C (listen: Rests, Accents)
T11 audioStore humanize (needs T1, T6: pushes AudioEngine.setHumanize) + T12 generateHumanize ─┴─► T13 Pacing: Humanize slider ─► Checkpoint D (listen: Humanize)
                                                                                   │
                                  T14 company (snapshot, resolve, handlers, drawers) ◄─────────┤
                                  T15 session diff / apply / capture / restore ◄───────────────┤ (needs T4, T11)
                                  T16 share-link codec ◄── T15
                                                                      │
                                                              Checkpoint E ─► T17 guard tests ─► T18 Crawford's listen + Pixel A/B (STOP) ─► T19 docs ─► Complete
```

T2, T3 and T5 were independent once T1 landed; T8 and T12 depend only on T1, and T11 on T1 and T6 (it calls the
engine's `setHumanize`), so all three can run once Phase 1 is done; T14 and T15 may run in parallel sessions after T13.

## Phase 1: Foundations (nothing visible)

### Task 1: Types, constants, defaults, store clamp

**Status: BUILT** (555292a1).

**Description:** `src/types/Robot.ts` gains `ArticulationMark` + `ARTICULATION_MARK_NAMES` (five, spec §1.1
order), `MelodyEvent.rest?` / `mark?`, `Robot.dynamics?` / `rests?` / `accents?` with the §1.1 doc comments.
`src/engine/melodyGenerator.ts` exports `DEFAULT_DYNAMICS = 50`, `DEFAULT_RESTS = 0`, `DEFAULT_ACCENTS = 0`
beside `DEFAULT_PITCH_REPEAT`. `src/constants/index.ts` gains `PERFORMANCE_MIN/MAX`, `HUMANIZE_MIN_MS/MAX_MS`,
`MIN_SOUNDING_SECONDS`. `src/stores/localeStore.ts`'s `updateRobot` normalisation clamps the three new robot
fields to `[PERFORMANCE_MIN, PERFORMANCE_MAX]` with `Math.trunc`, exactly as `pitchRepeat` (`:187`), and drops a
NaN (keeping the stored value) as `pan` does. `src/types/session.ts` gains `RobotAudioOverrideDiff.dynamics? /
rests? / accents?` and `SessionPayload.humanize?`. **`src/types/Company.ts` is NOT touched here (as built):** its
snapshot fields moved to T14, because `resolveCompanyOptions` returns `Required<CompanyOptionsSnapshot>` and adding
them earlier forces resolver behaviour into this types-only task.

**Acceptance criteria:**
- [ ] `ARTICULATION_MARK_NAMES` has exactly five entries in the spec's order (type-level test pins it).
- [ ] `updateRobot(…, { rests: 140.7 })` stores `100`; `{ dynamics: -3 }` stores `0`; `{ accents: 42.9 }` stores `42`; a robot updated without the fields keeps them absent (`localeStore.test.ts`).
- [ ] `npm run build:types` green with **no fixture edits** — every new field is optional.

**Verification:**
- [ ] `npx vitest run src/types/ src/stores/localeStore.test.ts`
- [ ] `npm run build:types && npm run lint`

**Dependencies:** None. **Files:** `src/types/Robot.ts`, `src/types/session.ts`,
`src/engine/melodyGenerator.ts` (three constants), `src/constants/index.ts`, `src/stores/localeStore.ts` (+ test),
`src/types/performance.test.ts` (new). **Scope:** M.

### Task 2: `src/engine/articulation.ts` — the table, the tiers, `resolveArticulation`

**Status: BUILT** (52895915). `unlockedMarks` guards NaN with `!(accents > 0)` so a NaN cannot fall into the top tier.

**Description:** New pure module per spec §4: `ARTICULATION_MARKS` (velocity × length per mark),
`ACCENT_TIER_2 = 34`, `ACCENT_TIER_3 = 67`, `unlockedMarks(accents)`, `resolveArticulation(event)`. No imports
beyond the types. **Assumption 5's veto point lives here**: changing a multiplier or a tier is one line.

**Acceptance criteria:**
- [ ] `unlockedMarks`: `0` → `[]`; `1` and `33` → accent + tenuto; `34` and `66` → + staccato, marcato; `67` and `100` → all five; the result is always a subset of `ARTICULATION_MARK_NAMES` and grows monotonically across a 0–100 sweep.
- [ ] `resolveArticulation`: plain → `{ velocity: 1, length: 1 }`; staccato → length `0.5`; staccatissimo `0.25`; marcato `{ 1.4, 0.75 }`; rest `0.6` alone → length `0.4`; rest `0.6` + staccato → `0.4`; rest `0.6` + staccatissimo → `0.25`; rest `0.6` + tenuto → `{ 1.1, 1 }`.
- [ ] The table has exactly the five keys (a `toEqual(Object.keys(…))` pin).

**Verification:**
- [ ] `npx vitest run src/engine/articulation.test.ts`

**Dependencies:** T1. **Files:** `src/engine/articulation.ts` (+ test). **Scope:** S.

### Task 3: Melody post-pass — `buildSeededPerformance`, `applyPerformanceMarks`, `regenerateMelody`

**Status: BUILT** (2baafb7d).

**Description:** `src/engine/melodyGenerator.ts` gains `REST_MIN_FRACTION = 0.25`, `REST_SPAN = 0.5`,
`buildSeededPerformance(compositionSeed)` (an `alea` over `` `${compositionSeed}:performance` `` — **the seed alone,
not the slider values; as built**, see the progress note) and `applyPerformanceMarks(melody, { rests,
accents }, rand)` exactly as spec §1.2 (four draws per event, always; stamps only where something was drawn;
untouched events returned by reference). `src/engine/regenerateMelody.ts` reads `robot.rests ??
DEFAULT_RESTS` / `robot.accents ?? DEFAULT_ACCENTS` and applies the post-pass after `generateMelodyForRobot`.
`buildSeededComposition` is **not** touched. **Assumption 2's veto point lives here.**

**Acceptance criteria:**
- [ ] Determinism: same seed and values → identical stamps (`toEqual`); `{ rests: 0, accents: 0 }` returns every input event by reference (`toBe`); a `Math.random` spy sees zero calls.
- [ ] `rests: 100` → every event has `rest` in `[0.25, 0.75]`; `rests: 50` over 400 events → `rest` present on 35–65 % and never above `0.5`; `accents: 100` over 400 events → all five marks occur; `accents: 20` → only accent and tenuto occur; `accents: 50` → never staccatissimo.
- [ ] Event count, `startStep`, `length`, `noteIndex`, `octave` and `pitchLocked` are identical before and after at every setting (Rests never changes density); changing `rests` from 30 to 80 leaves the set of marked event ids unchanged (the four-draw stream contract, tested with one shared `rand` AND through `regenerateMelody`, which only holds with the seed-only key); raising either slider only adds stamps; `buildSeededPerformance(s)` and `buildSeededComposition(s, …)` produce different first draws.
- [ ] `regenerateMelody` on a robot with `rests: 60, accents: 60` writes a stamped melody to the store and registers it; with the fields absent the melody is byte-identical to today's (the existing regenerate tests pass unmodified).

**Verification:**
- [ ] `npx vitest run src/engine/melodyGenerator.test.ts src/engine/regenerateMelody.test.ts`
- [ ] **Mutation check:** make the rest draw conditional (skip `restDepthRoll` when not rested) and watch the "marked set unchanged" case go red.

**Dependencies:** T1. **Files:** `src/engine/melodyGenerator.ts` (+ test), `src/engine/regenerateMelody.ts`
(+ test). **Scope:** S.

### Task 4: Spawn seeding, baseline, copy branch, post-pass at spawn

**Status: BUILT** (296dc54e).

**Description:** `src/systems/spawnSystem.ts`: `DYNAMICS_SEED_RANGE = [25, 75]`, `RESTS_SEED_RANGE = [10, 60]`,
`ACCENTS_SEED_RANGE = [20, 80]` with "what this means audibly" doc comments; in `spawnRobot`'s fresh branch
three rounded `getSeededVal` draws (`robot.dynamics`, `robot.rests`, `robot.accents`) at `spawnCount` with the
`alea` no-noise-map fallbacks the composition fields have; the copy branch inherits `source.dynamics ??
DEFAULT_DYNAMICS` etc.; the robot literal carries all three; `spawnMelody` is wrapped in the post-pass (spec
§1.2). `RobotAudioBaseline` and `generateRobotAudioBaseline` mirror every line. **Assumption 13's robot
ranges live here.**

**Acceptance criteria:**
- [ ] Over 400 seeded robots (the existing distribution harness): `dynamics` in 25–75, `rests` in 10–60, `accents` in 20–80, each integer with ≥ 20 distinct values; every robot has all three present.
- [ ] A spawned robot's `melody` equals `applyPerformanceMarks(generateMelodyForRobot(…), { rests, accents }, buildSeededPerformance(…))` for its own fields (the Phase 31 capstone test gains the post-pass); `regenerateMelody` on a fresh unedited robot reproduces the spawn melody, stamps included.
- [ ] `generateRobotAudioBaseline` equals `spawnRobot`'s three fields for the same seed, with a fixture that seeds a **non-default** value for each ([[parity-test-fixture-non-default-values]]); a copied robot inherits all three from its source. (As built: there was no seeded-roster determinism oracle to re-record; the one stale expectation, `sessionDiff.test.ts`'s NORMALIZED regenerate case, gained the post-pass.)

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts`
- [ ] **Mutation check:** drop `accents` from the baseline return and watch the parity case go red.

**Dependencies:** T1, T3. **Files:** `src/systems/spawnSystem.ts` (+ test), `src/utils/sessionDiff.test.ts` (one expectation). **Scope:** S (one file, several sites).

### Task 5: Engine velocity — position-keyed, Dynamics-scaled, baseline 0.8

**Status: BUILT** (6c2ef04d).

**Description:** `src/engine/AudioEngine.ts`: `NoteParams.position?: number`; `computeNoteVelocitySeeded(robotId?,
position?, robot?)` (exported for tests) per spec §4 — offset `(compositionSeed + position) % VELOCITY_PERIOD` when a
position is given (**replaced in T20 by `performanceRoll`**, deviation 14), the legacy `robotNoteIndex` advance otherwise; rate `VELOCITY_VARIANCE_RATE · s` and width
`VELOCITY_VARIANCE_AMOUNT · s` with `s = resolveDynamics(robot) / DYNAMICS_NEUTRAL` (50), where `resolveDynamics`
clamps to 0–100 and reads an absent or non-finite value as 50 (so the rate tops out at 0.3 and the spec's
`min(1, …)` is gone); `NOTE_VELOCITY_BASELINE = 0.8`; `scheduleNote` threads `params.position`. The store robot is
looked up once per note (`scheduleNote` fetches the roster once, hoisted above the velocity call, and hands the robot
in). **Assumption 6's veto point lives here**: the baseline is one constant and one new oracle, so a revert is one
commit.

**Acceptance criteria:**
- [ ] `dynamics: 50` with a fixed position series follows a hand-checkable noise map (literals for positions 0–3, 20, 21) scaled to the 0.8 baseline — no velocity oracle existed, so this one is new, its title naming the baseline change; `dynamics: 0` → every note exactly `0.8`; `dynamics: 100` → over 200 positions, 25–35 % of notes vary and the max |offset| exceeds 0.3.
- [ ] Two robots with different `compositionSeed`s at the same position get different offsets; the same robot at the same position after `stop()` / `start()` returns the same velocity (no counter state); the clamp stays `[0.05, 1]`.
- [ ] With `position` omitted the legacy counter path behaves as before (no counter tests existed; new ones pin it, and the one existing assertion that moved, the masterVolume-0 trigger, goes 1 → 0.8); the construction-count test is unchanged. An out-of-range or NaN Dynamics is clamped or read as 50, and no velocity is ever NaN.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts`

**Dependencies:** T1. **Files:** `src/engine/AudioEngine.ts` (+ test). **Scope:** S.

### Task 6: Engine tick — articulation, humanize, the click-track flag

**Status: BUILT** (102c08ae).

**Description:** `src/engine/AudioEngine.ts`: `NoteParams.duration: NoteDuration | number`;
`MelodyEventEntry.clickTrack?: boolean` set in `registerRobotMelody` when the click track is substituted;
`HUMANIZE_X = precomputeDataX('audio.humanize')` at module scope; **`AudioEngine.setHumanize(ms)`** (engine state
`humanizeMs`, clamped 0–20, NaN → 0, survives `killAll()`), pushed in by the store like `setPolyphonyCap` — the
first draft had the engine read `audioStore.humanize` through a dynamic import, but `:607` is a static localeStore
import, `audioStore` imports `AudioEngine` (a cycle) and the field does not exist until T11; and
`humanizeOffsetFor(position)`, which builds a robot-id → seconds function **once per `processMelodyStep` call**
(a constant 0 fetching nothing when `humanizeMs` is 0 or there is no noise map). `processMelodyStep` per spec §1.3 —
`resolveArticulation`, a seconds `duration` floored at `MIN_SOUNDING_SECONDS` only when the length factor is below 1
and never longer than the written note, `accentMultiplier = groupAccent × art.velocity` (`undefined` when exactly 1),
`time + MIN_LEAD + offset` (offset `0` for click-track entries), `position = stepCounter`. `scheduleVoiceRelease`
takes the number through `Tone.Time`; `triggerWithCap` hands the composite voice `String(seconds)`, so the composite
voice is untouched (the string-as-seconds reading is pinned against the REAL Tone in
`audioEngine/numericDuration.test.ts`).

**Acceptance criteria:**
- [ ] A staccato `8n` event schedules `duration = Tone.Time('8n').toSeconds() × 0.5` (number); a plain event schedules the `'8n'` string unchanged; a staccatissimo `16n` at 200 BPM is floored at `MIN_SOUNDING_SECONDS`; a rest `0.6` + tenuto event keeps the full length.
- [ ] A marcato event that is also the motif-group accent passes `accentMultiplier = 1.25 × 1.4`; a plain non-accent event passes `undefined` (today's behaviour); every scheduled note carries `position === stepCounter` at that tick.
- [ ] Humanize (via `AudioEngine.setHumanize`): `0` → `time + MIN_LEAD` exactly; `20` → within `±0.020` of it, identical on a repeated position, different for two robots; a click-track entry gets no offset at `20`; the roster is fetched once per step with three robots registered (spy count) and not at all at `0`; the setter clamps (99 → 20, −5 and NaN → 0) and survives `killAll()`.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioEngine/compositeVoice.test.ts`
- [ ] **Mutation check:** remove the tenuto override in `resolveArticulation`'s caller path (pass the rest through) and watch the tenuto case go red; remove the click-track exemption and watch its case go red.

**Dependencies:** T2, T5. **Files:** `src/engine/AudioEngine.ts` (+ test), `src/engine/audioEngine/numericDuration.test.ts` (new). **Scope:** S.

### Checkpoint A: Foundations
- [x] `npm test` (358 files, 11,846 tests), `npm run build:types`, `npm run lint`, `npm run build` all green (2026-10-15). The zero-new-nodes pin is the existing construction-count test, which passes.
- [ ] A fresh world in `npm run dev` already sounds different (seeded rests and accents play; the fleet is a touch quieter) with no UI yet — confirm nothing errors in the console over a full day cycle.
- [ ] The `?debug` HUD shows no change in links / load lines (no nodes added).

## Phase 2: The robot screen, in listen order

### Task 7: Actions — `applyDynamics`, `applyRests`, `applyAccents`

**Status: BUILT** (8d13777d).

**Description:** `src/systems/robotOptionsActions.ts` per spec §1.5: `applyDynamics` writes the field only;
`applyRests` / `applyAccents` write and call `regenerateMelody` with the new value spread in, on
`applyPitchRepeat`'s shape.

**Acceptance criteria:**
- [ ] `applyDynamics(robot, id, 70)` calls `updateRobot` with `{ dynamics: 70 }` and no `AudioEngine` method (spy on every engine export).
- [ ] `applyRests(robot, id, 40)` calls `updateRobot` with `{ rests: 40 }` then `regenerateMelody` with a robot whose `rests` is `40`; `applyAccents` likewise.

**Verification:**
- [ ] `npx vitest run src/systems/robotOptionsActions.test.ts`

**Dependencies:** T3. **Files:** `src/systems/robotOptionsActions.ts` (+ test). **Scope:** XS.

### Task 8: Content and schemas

**Status: BUILT** (077fc5a5).

**Description:** `src/content/copy/probe.ts`: `probe.levels.dynamics`, `probe.composition.articulation`
(heading), `probe.composition.rests`, `probe.composition.accents`, each with `human`, placeholder `lore`,
`unit '%'` where a slider, and `help.human` per spec §1.9; the Levels and Composition intros gain one sentence
each. `src/content/copy/fleet.ts`: `fleet.pacing.humanize` (`unit ' ms'`, help) and one `<li>` in the Pacing
intro. `src/data/robotOptionsConfig.ts`: `DYNAMICS_SCHEMA`, `RESTS_SCHEMA`, `ACCENTS_SCHEMA` (`sliderLinear`,
`PERFORMANCE_MIN–MAX`, step 1) and `ARTICULATION_PANEL_SCHEMA` (`responsive`, heading label).
`src/data/audioRigConfig.ts`: `HUMANIZE_SCHEMA` (`sliderLinear`, `HUMANIZE_MIN_MS–MAX_MS`, step 1), beside
`BPM_SCHEMA`, never in `AUDIO_RIG_CONFIG`'s array. **Assumption 14's lore words and the "Dynamics" naming clash
live here**: the human word for `probe.levels.dynamics` is the one thing Crawford may rename.

**Acceptance criteria:**
- [ ] `content.test.ts` green: every new key has `human`; every slider key has `help.human`; no literal in a config or component.
- [ ] Each schema `satisfies` its type; `CONTROL_SCHEMA_TYPES` still 14; the four slider schemas' `min` / `max` come from the constants (a test reads them back).

**Verification:**
- [ ] `npx vitest run src/content/ src/data/`
- [ ] `npm run lint`

**Dependencies:** T1. **Files:** `src/content/copy/probe.ts`, `src/content/copy/fleet.ts`,
`src/data/robotOptionsConfig.ts`, `src/data/audioRigConfig.ts` (+ tests). **Scope:** M.

### Task 9: Levels — the Dynamics row, wired on the robot screen

**Status: BUILT** (73f77683). Company stand-in marked `TODO T14` (deviation 8).

**Description:** `src/components/robot/AudioSettingSection.tsx`: `AudioSettingValue.dynamics: number`,
`onDynamicsChange(value: number)`, a sixth wrapper row after Delay (no display rule on the wrapper, the
Volume row's reason) rendering `<SliderLinear schema={DYNAMICS_SCHEMA} …>`, no `swelling`.
`src/components/panels/screen/screens/RobotScreen.tsx` passes `robot.dynamics ?? DEFAULT_DYNAMICS` and a
memoised handler through `applyDynamics`. `CompanyOptionsSection.tsx` gets the new required prop with a
temporary pass-through of the first member's value and a no-op handler (T14 replaces both) so types stay
green.

**Acceptance criteria:**
- [ ] The section renders a slider named by `CONTENT['probe.levels.dynamics'].human` with its help popover; dragging it calls `onDynamicsChange` with the integer value; the five existing controls' tests pass unmodified.
- [ ] On `RobotScreen` the slider shows the selected robot's `dynamics` (50 when absent) and a change reaches `applyDynamics` once; handler identity is stable across unrelated re-renders (the existing identity test gains it).

**Verification:**
- [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`
- [ ] Manual: `npm run dev`, pick a robot, drag Dynamics 0 → 100 → 50.

**Dependencies:** T7, T8, T5 (to hear it). **Files:** `AudioSettingSection.tsx` (+ test), `RobotScreen.tsx`
(+ test), `CompanyOptionsSection.tsx` (one line). **Scope:** S.

### Checkpoint B: Dynamics (Crawford listens)
- [ ] Suite, types, lint green.
- [ ] Headphones, one slow robot: at 0 it is metronomic, at 100 it breathes, at 50 it is today's robot a touch quieter. Verdict on the 0.8 baseline (assumption 6) and the human word "Dynamics" (spec §7) recorded in this file before T10.

### Task 10: Composition — the Articulation row, wired on the robot screen

**Status: BUILT** (567355d5). Placed in `PingControlsCompositionSection` (deviation 6).

**Description:** `src/components/robot/PingControlsDrawer.tsx`: `PingControlsValue.rests` / `.accents`,
`onRestsChange` / `onAccentsChange`; inside `PHRASING_PANEL_SCHEMA` after the Rhythm row, a
`<DirectionalPanel schema={ARTICULATION_PANEL_SCHEMA}>` with the two `SliderLinear`s, both
`disabled={generationDisabled}`. `RobotScreen.tsx` passes `robot.rests ?? DEFAULT_RESTS` /
`robot.accents ?? DEFAULT_ACCENTS` and memoised handlers through `applyRests` / `applyAccents`.
`CompanyOptionsSection.tsx` gets the temporary pass-through as in T9.

**Acceptance criteria:**
- [ ] The drawer renders Rests and Accents under their heading, each with help; a drag calls the right handler with an integer; both are disabled while `clickTrackActive`; the existing Density / Motif / Pitch Repeat / Octave / Variance tests pass unmodified.
- [ ] On `RobotScreen` a Rests change reaches `applyRests` once and the robot's registered melody changes (spy on `registerRobotMelody`) while its `noteIndex` sequence does not; an Accents change likewise.

**Verification:**
- [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`
- [ ] Manual: drag one robot's Rests to 100 and count the onsets against Density; drag Accents to 100 on a slow robot.

**Dependencies:** T7, T8, T6 (to hear it). **Files:** `PingControlsDrawer.tsx` (+ test), `RobotScreen.tsx`
(+ test), `CompanyOptionsSection.tsx` (two lines). **Scope:** S.

### Checkpoint C: Rests and Accents (Crawford listens)
- [ ] Suite, types, lint green.
- [ ] Rests at 100 opens the line up and the onset count is unchanged; the five marks are distinguishable at Accents 100 on a slow robot. Verdicts on per-event marks (assumption 2), the tiers and multipliers (assumption 5) and the rest floor (spec risk 3) recorded here before T11.

### Task 11: `audioStore.humanize`

**Status: BUILT** (0e71ad19).

**Description:** `src/stores/audioStore.ts`: `humanize: number` (initial `HUMANIZE_UNSEEDED` sentinel, like
`SWELL_DURATION_UNSEEDED`), `setHumanize(ms)` clamping to `[HUMANIZE_MIN_MS, HUMANIZE_MAX_MS]` and truncating,
and the seed-once / carry-forward branch in `regenerateGlobalAudioFromSeed` beside `swellDuration`'s, calling
`generateHumanize` (T12; stub it in this task's test). **Both writers also call `AudioEngine.setHumanize(ms)`** (built
in T6): the engine never reads the store, so this push is the only way the value reaches the playback loop. A
session restore goes through `setHumanize` (T15), so it is covered by the same push. The sentinel is never pushed
(the engine stays at 0 until the first real value).

**Acceptance criteria:**
- [ ] `setHumanize(7.9)` stores `7`; `setHumanize(40)` stores `20`; `setHumanize(-1)` stores `0`.
- [ ] `setHumanize(12)` calls `AudioEngine.setHumanize(12)` once with the stored (clamped, truncated) value; `setHumanize(40)` pushes `20`.
- [ ] `regenerateGlobalAudioFromSeed` seeds `humanize` on the first call, pushes the seeded value to the engine, and leaves a user-set value (store and engine) alone on the second (the `swellDuration` carry-forward test, cloned).

**Verification:**
- [ ] `npx vitest run src/stores/audioStore.test.ts`
- [ ] **Mutation check:** remove the push from `setHumanize` and watch the push case go red; remove it from the seed branch and watch the seeded-push case go red.

**Dependencies:** T1, T6. **Files:** `src/stores/audioStore.ts` (+ test). **Scope:** S.

### Task 12: `generateHumanize`

**Status: BUILT** (eb5f028d). Built before T11; uniform draw (deviation 7).

**Description:** `src/utils/globalAudioSeed.ts`: `HUMANIZE_SEED_RANGE = { min: 2, max: 6 }` ms;
`generateHumanize(styleId, styleName)` on `generateSwellDuration`'s shape (`globalAudio.humanize` dataId on
the style's noise map, `quantizeToStep(raw, HUMANIZE_MIN_MS, 1)`). **Assumption 13's global range lives here.**

**Acceptance criteria:**
- [ ] Over 300 styles: every value is an integer in `[2, 6]`, at least four distinct values occur (the bpmSeed distinct-values guard, cloned — if the dataId lands on a flat patch, rename it and record why in the doc comment).
- [ ] A pure function of (id, name): same inputs → same value; different names → not all equal.

**Verification:**
- [ ] `npx vitest run src/utils/globalAudioSeed.test.ts`

**Dependencies:** T1. **Files:** `src/utils/globalAudioSeed.ts` (+ test). **Scope:** XS.

### Task 13: Pacing — the Humanize slider

**Status: BUILT** (53e4b2be).

**Description:** `src/components/panels/screen/screens/FleetParamsScreen.tsx`: `PacingPanel` subscribes to
`humanize`; a module-level `setHumanize` like `setBPM`; the top row gains a third `audio-rig-drawer__param-row`
with `<SliderLinear schema={HUMANIZE_SCHEMA} …>` between Tempo and Automation Rate. The slider writes the store's
`setHumanize` only; the engine push is that action's job (T11), so the component never touches `AudioEngine`.
**Assumption 10's veto point lives here** (a third row instead is a four-line change).

**Acceptance criteria:**
- [ ] Pacing renders Tempo, Humanize, Automation Rate in that order in the top row, with Humanize's help; a drag calls `setHumanize` with the integer ms.
- [ ] A Humanize change re-renders `PacingPanel` only (the existing "a tempo change re-renders Pacing only" test, extended).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/FleetParamsScreen.test.tsx`
- [ ] Manual: Fleet Params → Pacing, drag Humanize 0 → 20 with twelve robots sounding.

**Dependencies:** T8, T11, T12, T6 (to hear it). **Files:** `FleetParamsScreen.tsx` (+ test). **Scope:** XS.

### Checkpoint D: Humanize (Crawford listens)
- [ ] Suite, types, lint green.
- [ ] At 20 ms the fleet loosens; at 0 it locks. **Decision recorded here:** keep Humanize, lower `HUMANIZE_MAX_MS`, or cut it (intent: never ship it off-by-default). A cut reverts T11–T13, removes the `humanize` fields from T1's types, and removes `AudioEngine.setHumanize` / `humanizeOffsetFor` and the `clickTrack` flag from T6, before T15.
- [ ] The phone-width layout of the three-wide Pacing row and the Articulation row holds (no overflow).

## Phase 3: Companies and persistence

### Task 14: Companies broadcast the three robot fields

**Status: BUILT** (4f4f9939). `CompanyOptionsSection.tsx` was already wired by T9/T10; only the hook changed (deviation 11).

**Description:** `src/types/Company.ts`: `CompanyOptionsSnapshot.dynamics? / rests? / accents?` (moved here from T1:
`resolveCompanyOptions` returns `Required<CompanyOptionsSnapshot>`, so the type and the resolver land together).
`src/systems/companyOptions.ts`: `resolveCompanyOptions` falls back per field to the first
member then the `DEFAULT_*`. `src/components/company/useCompanyOptions.ts`: `dynamicsValue`, `restsValue`,
`accentsValue`, `onDynamicsChange` / `onRestsChange` / `onAccentsChange` on `onDensityChange`'s plain-number
pattern (loop members through the action, then `patchSnapshot`). `CompanyOptionsSection.tsx` replaces T9/T10's
temporary pass-throughs with the real values and handlers. `docs/COMPANIES.md` gets the three rows (T19 may
batch it).

**Acceptance criteria:**
- [ ] Resolution: snapshot value wins; absent → first member's field; first member's field absent → the default.
- [ ] `onRestsChange(40)` calls `applyRests` once per member and records `{ rests: 40 }`; the other two likewise; handler identities stable across unrelated edits (the identity test gains the three).
- [ ] The company screen renders the three controls from the resolved value and no temporary pass-through remains (grep `TODO T14` → none).

**Verification:**
- [ ] `npx vitest run src/systems/companyOptions.test.ts src/components/company/`

**Dependencies:** T9, T10. **Files:** `src/types/Company.ts`, `companyOptions.ts` (+ test), `useCompanyOptions.ts`
(+ test), `CompanyOptionsSection.tsx`. **Scope:** M.

### Task 15: Session — diff, apply, capture, restore

**Status: BUILT** (ce72e3be). Mutation check passed: dropping `accents` from the merge turned the restore case red.

**Description:** `src/utils/sessionDiff.ts`: three `deepEqual` lines beside `rhythmicDensity`'s (`:292`);
`buildRobotUpdates` merges `dynamics` / `rests` / `accents` only when finite (`:429` region); `humanize`
captured beside `swellDuration` (`:398`) and applied beside it (`:551`) through `setHumanize`. The existing
`regenerateMelody` call at `:608` already covers restored rests / accents — this task **pins** that with a
test rather than adding a call.

**Acceptance criteria:**
- [ ] A robot edited to `dynamics 70 / rests 30 / accents 60` diffs to exactly those three keys; an untouched robot diffs `{}` (the baseline from T4 carries the seeded values).
- [ ] Restoring a payload with `rests: 30` sets the field **and** the robot's registered melody equals a fresh `regenerateMelody` with `rests: 30` (spy on `registerRobotMelody`); a payload without the keys leaves them at their seeded values; `rests: NaN` and `accents: 'x'` are dropped whole.
- [ ] `humanize: 12` is captured and restored through `setHumanize` — so `AudioEngine.setHumanize(12)` is pushed too (spy on it; T11 owns the push, this pins that a restore reaches the engine); absent leaves the seeded value, which T11's seed branch has already pushed.

**Verification:**
- [ ] `npx vitest run src/utils/sessionDiff.test.ts`
- [ ] **Mutation check:** remove `accents` from the `buildRobotUpdates` merge and watch the restore case go red.

**Dependencies:** T4, T11. **Files:** `src/utils/sessionDiff.ts` (+ test). **Scope:** S.

### Task 16: Share-link codec

**Status: BUILT** (8b4958a2). See deviation 13 for the decoded absent `hm`.

**Description:** `src/utils/sessionShareUtils.ts`: `CompactRobotOverrideDiff.dy / rt / ax`, the top-level `hm`
beside `sd`, encode and decode lines, and the decoder's type check (`:358–364`) extended to `hm`.
`docs/SESSION_STORAGE.md`'s codec table (T19 may batch it).

**Acceptance criteria:**
- [ ] A payload with all four fields round-trips `toEqual` through encode → decode; absent keys stay absent; `hm: 'x'` fails validation the way `sd: 'x'` does; `dy: NaN` decodes to absent.

**Verification:**
- [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`

**Dependencies:** T15. **Files:** `src/utils/sessionShareUtils.ts` (+ test). **Scope:** XS.

### Checkpoint E: Companies and persistence
- [x] Suite, types, lint, build green (2026-10-16: 358 files / 12 003 tests, one unrelated flake passing in isolation; 0 lint errors).
- [ ] Manual: edit a company's Accents and hear every member change; save, reload, share-link a world with edited Rests and Humanize — all survive; an old saved session loads with no console error.

## Phase 4: Guard, gate, docs

### Task 17: Guard tests — `src/docs/robotPerformanceDocs.test.ts`

**Status: BUILT** (94e74398). 102 green; group (4) red with exactly the two expected MELODY_SYSTEM cases (`rest`, `mark`);
SESSION_STORAGE's case is already green because T16 wrote its section. No stale name in the spec; `numericDuration` and
`globalModulationDocs` are test-file names and sit in the non-symbol list. The zero-new-nodes pin is the existing construction-count test.

**Description:** On `robotArticulationDocs.test.ts`'s pattern: (1) the gem source scan (`src/components/robot/gem/`,
`RobotBody.tsx`) for `\bdynamics\b`, `\brests\b`, `\baccents\b`, `\.rest\b`, `\.mark\b`, `humanize`; (2) every
backticked symbol in the spec and the docs T19 updates exists in source; (3) `MIN_LEAD − HUMANIZE_MAX_MS / 1000
≥ 0.05`; (4) doc-text cases — `MELODY_SYSTEM.md`'s `MelodyEvent` block names `rest` and `mark`;
`SESSION_STORAGE.md` names `dynamics`, `rests`, `accents`, `humanize` — **red until T19**, by design. Plus the
zero-new-nodes pin in `AudioEngine.test.ts` if T5/T6 did not already assert it.

**Acceptance criteria:**
- [ ] Groups (1)–(3) green; group (4) red with exactly the expected failures (listed in the commit body).
- [ ] The symbol walk finds no stale name in the spec or this plan (fix the doc, not the test).

**Verification:**
- [ ] `npx vitest run src/docs/robotPerformanceDocs.test.ts`

**Dependencies:** T16. **Files:** `src/docs/robotPerformanceDocs.test.ts`. **Scope:** XS.

### Task 18: Crawford's listen and the Pixel A/B — STOP

**Status: listen PASSED, Pixel A/B NOT RUN** (2026-10-16). Crawford's verdict after Checkpoints B–E on the desktop: "it all sounds
good" — every listen line accepted and every open veto point (assumptions 2, 5, 6, 10, 13, 14) accepted as built. The one finding
during his listen, Humanize inaudible over a unison, became T20. The Pixel runs, the underrun counts and the desktop `npm run perf`
comparison were not done; roadmap 50.5 records the phone gate as open. The desktop underruns investigated the same day were a
pre-existing rendering load on his laptop (main reproduced them), not this phase.

**Description:** Spec §5's performance gate and listen list, run by Crawford. Branch vs `main` at `2ec52f2f`,
seed `alpha` `?session=` world, `?debug` HUD, 3:00 each, Standard then Full; desktop `npm run perf` before and
after. Then the full list: Dynamics 0 / 50 / 100, Rests 100 on one robot, Accents 100 on a slow robot, Humanize
0 / 20, save / reload / share, company broadcast, keyboard, every "?", nothing on any gem changed. Results go
into `docs/todo/scratchy-audio-phones.md` (append-only) and this file. **No code in this task**; a rise or a
veto opens a follow-up task.

**Acceptance criteria:**
- [ ] Underrun counts recorded for Standard and Full, branch and base; expected flat.
- [ ] Every listen line has a verdict; every open veto point (assumptions 2, 5, 6, 10, 13, 14) has an answer or an explicit "later".

**Dependencies:** T17. **Files:** `docs/todo/scratchy-audio-phones.md`, this file. **Scope:** —.

### Task 19: Docs

**Status: BUILT** (2026-10-16). The nine docs, the intent banner, roadmap 50.5 and the backlog 21 → archive move; the guard test is
fully green. `docs/PERFORMANCE.md` was not touched: the desktop raster finding is a separate workstream.

**Description:** `MELODY_SYSTEM.md` (the `MelodyEvent` block, the post-pass and the two streams, the
four-draw contract); `AUDIO_SYSTEM.md` (playback loop: articulation, Dynamics, Humanize, the 0.8 baseline,
position-keyed rolls, the click-track exemption); `SESSION_STORAGE.md`, `COMPANIES.md` (fields and codec
keys); `ROBOT_DATA_GRID.md`, `SLIDER_VALUES.md` (rows with Load Min/Max); `PROCEDURAL_GENERATION.md`
(dataIds); `ROBOT_DESIGN.md` (one line: performance reaches the body through no dial); the intent's shipped
banner; `docs/todo/roadmap.md` gains **50.5** under roadmap 50 with a status line and "as built" deltas;
backlog item 21 moves to `docs/todo/archive/backlog-archive.md` with a pointer here and to the spec
(append-only, re-read first). T17's red doc-text cases go green.

**Acceptance criteria:**
- [ ] `npx vitest run src/docs/robotPerformanceDocs.test.ts` fully green.
- [ ] Roadmap 50.5 exists, backlog 21 is gone from the open list and present in the archive with its number intact; the intent banner names the deltas.

**Verification:**
- [ ] `npm test` (full), `npm run lint`.

**Dependencies:** T18. **Files:** the nine docs above, `docs/intent/robot-performance.md`,
`docs/todo/roadmap.md`, `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`. **Scope:** L (docs only).

### Task 20: Decorrelate the positioned rolls (follow-up from Checkpoint D's listen)

**Status: BUILT** (2026-10-16). Opened when Crawford maxed Humanize over a unison and heard nothing.

**Description:** `compositionSeed` is a 0–1 fraction (`generateCompositionSeed`), not the large integer the
`(compositionSeed + position) % VELOCITY_PERIOD` offset assumed, so at every tick all twelve robots sampled within one
unit of each other on a smooth simplex field. Measured over three worlds and 64 ticks at the 20 ms setting: mean
cross-robot spread 13–16 ms (independent draws give 34 ms), whole-unison shift ~7 ms in one direction, ticks with every
robot inside 5 ms common; the velocity roll was all-or-none across the roster on 51 of 64 ticks and fired at about half
its 15 % rate. Fix: `performanceRoll(compositionSeed, purpose, position)` in `AudioEngine.ts` — `alea` over
`seed:purpose:position`, `purpose` one of `'velocityRoll' | 'velocityVariance' | 'humanize'` — feeds the positioned
velocity roll, its variance and Humanize. Uniform, independent across robots, purposes and ticks, replayable. The
legacy no-position path keeps the noise map; `HUMANIZE_X` and the `audio.humanize` dataId are gone. The noise map's
presence still gates both (no active locale, no roll).

**Acceptance criteria:**
- [x] `performanceRoll` is deterministic and equals `alea(\`seed:purpose:position\`)()`; 400 draws fill `[0, 1)` (mean 0.42–0.58, extremes past 0.05 / 0.95); seeds 0.30 and 0.31 differ by a mean of more than 0.25; lag-1 correlation below 0.2; the three purposes differ at one seed and tick.
- [x] Twelve robots with seeds spread over 0–1 land more than 20 ms apart at one tick at the 20 ms setting; seeds 0.30 / 0.31 differ by more than 5 ms.
- [x] At Dynamics 100, robots with seeds 0.30 / 0.31 disagree on whether a note varies on more than 50 of 200 positions; no 97-step period.
- [x] The T5/T6 oracles were re-recorded against the same `alea` arithmetic; replay, same-position, click-track exemption, clamp, power-cycle and no-noise-map cases hold.
- [x] Mutation check: dropping the seed from the key turns 10 cases red.

**Verification:**
- [x] `npx vitest run src/engine/AudioEngine.test.ts` (291 green), `npm run lint`, `npm run build:types`.

**Dependencies:** T6. **Files:** `src/engine/AudioEngine.ts` (+ test), spec §1.3 / §4 lines patched. **Scope:** S.

### Checkpoint: Complete
- [ ] All acceptance criteria met; `npm test`, `npm run build:types`, `npm run lint`, `npm run build` green.
- [ ] PR opened by Crawford, body citing the spec; the four veto verdicts from T18 are in the roadmap entry.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The 0.8 baseline is felt as "the world got quiet" (spec risk 1) | Med | T5 is one constant and one oracle; Checkpoint B decides; a +2 dB master trim is the follow-up if kept |
| Rested or staccatissimo 16ths read as clicks (spec risk 3) | Med | `MIN_SOUNDING_SECONDS` in T1; Checkpoint C can raise it or exempt `16n` in T3's post-pass (one line) |
| Humanize inaudible against twelve robots (intent) | Low | Checkpoint D decides; a cut is T11–T13 reverted plus two type lines — isolated on purpose |
| Position-keyed velocity changes the velocity pattern (spec risk 2) | Low | No existing test pinned it; the new oracle's title names the baseline change; T5 commit body cites assumption 8 |
| Roster fetch for Humanize or `Tone.Time` conversion costs on the phone (spec §5) | Low | No per-step store read exists (Humanize is pushed); the roster is fetched once per step and not at 0 ms; if T18 shows a rise, cache seconds per `NoteDuration` per BPM — inside `AudioEngine`, no scope change |
| T11 forgets to push Humanize to the engine, so the slider moves nothing | Med | T11's acceptance spies on `AudioEngine.setHumanize` for both writers (and a mutation check removes each push); T15 pins the restore path |
| Company temporary pass-throughs (T9/T10) forgotten | Low | T14's criterion greps for the `TODO T14` marker |
| Another session edits `docs/todo/*.md` concurrently | Low | Append-only, re-read first (T18, T19) |

## Open Questions

- Spec §7's veto points, answered at the checkpoints they are isolated to (see the status banner).
- The human word for the Levels slider ("Dynamics" inside a nav row already called Dynamics) — Checkpoint B.
- Whether Humanize ships at all — Checkpoint D.
