# Implementation Plan: Robot Melody & Seed Engine (Roadmap Phase 6)

Source spec: [docs/specs/ROBOT_MELODY_SEED_ENGINE.md](../specs/ROBOT_MELODY_SEED_ENGINE.md). Source intent: [docs/intent/robot-melody-seed-engine.md](../intent/robot-melody-seed-engine.md).

## Overview

Rewrite `melodyGenerator.ts`'s rhythm engine from an onset-count model to a percentage/toggle model, make robot IDs deterministic, and fix every downstream consumer of the changed API (`localeStore.ts`'s clamps, `spawnSystem.ts`'s two independent changes, `regenerateMelody.ts`, `RobotAudioTab.tsx`) in the same phase — plus two stale comments and three docs. The scope is deliberately wider than the roadmap's own file list, per the confirmed intent doc: `generateMelodyForRobot`'s API is also called from `regenerateMelody.ts` and consumed by `RobotAudioTab.tsx`, and both go stale if left untouched.

## Architecture Decisions

Resolving spec §7's five open questions before any task is written, not during implementation:

- **§7.1 — `DEFAULT_RHYTHMIC_DENSITY = 50`.** The old default was `8` out of a `4–12` range (roughly the 57th percentile). `50` is a clean round mid-point of the new `0–100` range — not asked about directly during intake, but low-risk and easy to change later since it's just a fallback constant.
- **§7.2 — Default toggle states.** `DEFAULT_RHYTHMIC_MOTIF_LENGTH = { active: true, value: 8 }` (preserves the old always-tiling-at-8 default exactly). `DEFAULT_NOTE_VARIANCE = { active: false, value: 1 }` (preserves the old `noteVariance === 0`/unweighted default exactly). Both chosen to make this a behavior-preserving default change, not a silent behavior shift for any robot that doesn't specify these fields.
- **§7.3 — Robot ID format, adopted as final.** `` `robot-${spawnCount}-${idSeed.toString(36).slice(2, 10)}` `` per spec §4's illustrative snippet. Confirmed during intake that the exact format is non-critical as long as it's deterministic and human-legible — this is simply the concrete choice, not left as a placeholder.
- **§7.4 — `docs/MELODY_SYSTEM.md` states old-vs-new values side by side** for `RHYTHMIC_MOTIF_LENGTH_MAX` (16 → 8), per the roadmap's own Docs-bullet phrasing ("the `RHYTHMIC_MOTIF_LENGTH_MAX` constant change (16 → 8)").
- **§7.5 — `RobotAudioTab.tsx`'s interim toggle affordance is a plain native `<input type="checkbox">`** per field (Motif Length, Note Variance), labeled "Active", sitting next to the existing slider/number-input pair — not a new component. Phase 9 replaces this whole tab wholesale regardless of how polished the interim markup is, so minimal effort here is the right call, not a shortcut.
- **Foundation-first, then two independent tracks in parallel.** `constants/index.ts` and `types/Robot.ts` are breaking changes every other touched file depends on — they must land first, and the project will not type-check cleanly again until every later task lands (expected, not a defect, exactly as `LOCALE_SEED_DECOUPLING.md`'s plan called out for its own foundation task). Once the foundation lands, the core-engine track (Tasks 3–4, then 7–9) and the store-validation track (Task 5) are independent of each other; the robot-ID track (Task 6) is independent of both but shares a file with Task 7, so it's sequenced before Task 7 rather than run concurrently against it.

## Dependency Graph

```
Task 1 (constants/index.ts)  ──┐
Task 2 (types/Robot.ts)      ──┤
                                ├──→ Task 3 (melodyGenerator.ts) ──→ Task 4 (its test)
                                │         │
                                │         ├──→ Task 7 (spawnSystem.ts melody call site)
                                │         ├──→ Task 8 (regenerateMelody.ts + its test)
                                │         └──→ Task 9 (RobotAudioTab.tsx + its test)
                                │
                                ├──→ Task 5 (localeStore.ts clamp rewrite + new tests)
                                │
                                └──→ (independent) Task 6 (spawnSystem.ts robot ID + new tests)
                                                        │
                                                        └──→ sequenced before Task 7 (same file — avoid concurrent edits)
                                                                │
                                                                └──→ Task 10 (docs)
```

Tasks 3–4 (engine) and Task 5 (store) are parallel-safe with each other once Tasks 1–2 land. Task 6 (robot ID) has no logical dependency on Tasks 1–5 at all and could start immediately, but is sequenced before Task 7 since both touch `spawnSystem.ts`. Task 10 (docs) waits on everything, since it documents shipped behavior.

## Task List

### Phase 1: Foundation

- [x] **Task 1: `src/constants/index.ts` — update range constants**

  **Description:** Change the three shared range constants to their new bounds so every downstream consumer (generator, store clamps, UI sliders) inherits the correct ranges from one source, and update the doc comment above the block.

  **Acceptance criteria:**
  - [x] `RHYTHMIC_DENSITY_MIN = 0`, `RHYTHMIC_DENSITY_MAX = 100` (was `4`/`12`)
  - [x] `RHYTHMIC_MOTIF_LENGTH_MIN = 1`, `RHYTHMIC_MOTIF_LENGTH_MAX = 8` (was `1`/`16`)
  - [x] `NOTE_VARIANCE_MIN = 1`, `NOTE_VARIANCE_MAX = 8` (was `0`/`8`)
  - [x] The doc comment above the block describes the new percentage/toggle model instead of the old onset-count/magnitude model

  **Verification:**
  - [x] `npm run build:types` — expect NEW errors in `melodyGenerator.ts`, `localeStore.ts`, `spawnSystem.ts`, `RobotAudioTab.tsx` at this point; expected until Tasks 3, 5, 7, 9 land, not a defect in this task
  - [x] `npm run lint` clean for `constants/index.ts` itself

  **Dependencies:** None.

  **Files:** `src/constants/index.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 2: `src/types/Robot.ts` — update field shapes and fix the stale comment**

  **Description:** Change `Robot.rhythmicMotifLength` and `Robot.noteVariance` from plain numbers to `{ active: boolean; value: number }`, and correct the stale "16-step, 2-measure loop" comment on `MelodyEvent`.

  **Acceptance criteria:**
  - [x] `rhythmicMotifLength?: { active: boolean; value: number }` (was `number`)
  - [x] `noteVariance?: { active: boolean; value: number }` (was `number`)
  - [x] `MelodyEvent`'s doc comment (~L60) describes a single-measure, 16-subdivision loop — no "2-measure" wording remains
  - [x] `startStep`'s inline comment (~L64, "1-16 (8th-note grid position)") corrected to reflect the 16th-note grid, matching `melodyGenerator.ts`'s own model

  **Verification:**
  - [x] `npm run build:types` — expect NEW errors at every current reader/writer of these two fields, same expected-broken-until-later-tasks state as Task 1
  - [x] `npm run lint` clean for `types/Robot.ts` itself

  **Dependencies:** None (parallel-safe with Task 1).

  **Files:** `src/types/Robot.ts`

  **Estimated scope:** XS (1 file)

### Checkpoint: Foundation

- [x] `npm run build:types` shows only the expected downstream errors (in files Tasks 3–9 haven't touched yet) — no *unexpected* errors elsewhere.
- [x] `npm run lint` passes on the two touched files.

### Phase 2: Core Engine

- [x] **Task 3: `src/engine/melodyGenerator.ts` — rewrite density/motif/variance logic**

  **Description:** Implement the percentage→onset-count conversion, the motif-tiling toggle branch, the note-variance toggle branch, remove `onsetCount` from `GenerateMelodyForRobotOptions`, add the new `DEFAULT_RHYTHMIC_DENSITY`/`DEFAULT_RHYTHMIC_MOTIF_LENGTH`/`DEFAULT_NOTE_VARIANCE` constants per the Architecture Decisions above, and fix the stale "2-measure loop" comment on `RobotMelodyEvent`.

  **Acceptance criteria:**
  - [x] `GenerateMelodyForRobotOptions.onsetCount` is deleted (compile error if referenced anywhere)
  - [x] `rhythmicDensity` (0–100) converts to an onset count via round-to-nearest against 16 (motif inactive) or `rhythmicMotifLength.value` (motif active), per spec §4's before/after
  - [x] The onset-count floor is exactly 1 in both branches — a density of `0` (or any value rounding to 0) never produces an empty melody
  - [x] `buildMotifOnsets`'s own signature and behavior are unchanged — the percentage conversion is a pre-step inside `generateMelodyForRobot`, not pushed into `buildMotifOnsets`
  - [x] `rhythmicMotifLength: { active: false, value }` produces the scatter (non-repeating) path regardless of `value`
  - [x] `noteVariance: { active: false }` produces unweighted random selection unconditionally; `{ active: true, value }` produces the weighted slice of `value` notes (value `8` still reduces to draw-without-replacement)
  - [x] `RobotMelodyEvent`'s doc comment (~L13, "8th-note position in 2-measure loop") corrected to describe the single-measure, 16-subdivision model
  - [x] New `DEFAULT_RHYTHMIC_DENSITY = 50`, `DEFAULT_RHYTHMIC_MOTIF_LENGTH = { active: true, value: 8 }`, `DEFAULT_NOTE_VARIANCE = { active: false, value: 1 }` exported alongside existing defaults

  **Verification:**
  - [x] `npm run build:types` passes for `melodyGenerator.ts` itself (its test file is Task 4; other consumers remain broken until Tasks 7–9)
  - [x] `npm run lint` clean for `melodyGenerator.ts`

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/engine/melodyGenerator.ts`

  **Estimated scope:** S (1 file, concentrated logic change)

- [x] **Task 4: `src/engine/melodyGenerator.test.ts` — update tests for the new behavior**

  **Description:** Update the `generateMelodyForRobot — GenerateMelodyForRobotOptions` describe block for the new option shape; leave `buildMotifOnsets`/`pickDurationForGap`/`gridUnitsToDuration`/`applyRhythmicVariance`/`applyTonalVariance` blocks untouched — they operate below the percentage-conversion layer.

  **Acceptance criteria:**
  - [x] Every test currently passing `onsetCount` is rewritten to pass `rhythmicDensity` (%) instead
  - [x] New test: `rhythmicDensity: 0` yields a melody with ≥1 event (floor-of-1 regression test)
  - [x] New test: `rhythmicDensity: 100` with motif inactive yields 16 onsets; with motif active (`value: 4`) yields a fully dense 4-step cell tiled across the measure
  - [x] New test: a representative mid-range density (e.g. `50`) against the full measure produces the expected rounded onset count
  - [x] Existing motif/variance tests updated to use `{ active, value }` instead of bare numbers
  - [x] Confirmed by inspection (not a runtime test) that `buildMotifOnsets`/`pickDurationForGap`/`gridUnitsToDuration`/`applyRhythmicVariance`/`applyTonalVariance` describe blocks required zero edits

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts` — all passing
  - [x] `npm run build:types` passes for the test file

  **Dependencies:** Task 3.

  **Files:** `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (1 file)

### Phase 3: Store Validation (parallel-safe with Phase 2)

- [x] **Task 5: `src/stores/localeStore.ts` — rewrite `updateRobot`'s clamp block**

  **Description:** Replace the flat `Math.max/min/trunc` clamps for `rhythmicDensity`, `rhythmicMotifLength`, and `noteVariance` with logic matching the new ranges and the two toggle object shapes, per spec §4's before/after. Add net-new test coverage — confirmed via grep that no existing test exercises these three fields today.

  **Acceptance criteria:**
  - [x] `rhythmicDensity` clamps to `0–100` (was `4–12`)
  - [x] `rhythmicMotifLength`/`noteVariance`: nested `.value` clamps to `1–8`, `.active` coerced to boolean, via a shared helper (e.g. `clampToggleValue`) rather than duplicated inline logic
  - [x] A malformed payload matching the *old* shape (a bare number) for either toggle field is rejected/stripped rather than silently mis-clamped as if it were the new shape
  - [x] New test: `updateRobot` clamps `rhythmicDensity` outside `0–100`
  - [x] New test: `updateRobot` clamps `rhythmicMotifLength.value`/`noteVariance.value` outside `1–8` and coerces non-boolean `active`
  - [x] New test: `updateRobot` rejects/strips a bare-number payload for `rhythmicMotifLength`/`noteVariance`

  **Verification:**
  - [x] `npx vitest run src/stores/localeStore.test.ts` — all passing
  - [x] `npm run build:types` passes for `localeStore.ts`

  **Dependencies:** Task 2.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (2 files)

### Phase 4: Robot ID Determinism (parallel-safe with Phases 1–3; sequence before Task 7 — same file)

- [x] **Task 6: `src/systems/spawnSystem.ts` — deterministic robot IDs**

  **Description:** Replace `crypto.randomUUID()` (~L431) with a derivation through the existing `getLocaleNoiseMap`/`getSeededVal` mechanism, keyed by `'robot.id'` and the existing `spawnCount` offset. No new hashing/collision-avoidance utility — uniqueness is structural. Add net-new determinism test coverage.

  **Acceptance criteria:**
  - [x] `robot.id` no longer calls `crypto.randomUUID()`
  - [x] ID derivation uses `getSeededVal(noiseMap, 'robot.id', spawnCount, ...)` when a noise map is available, falling back to the same `alea(`${localeId}:${spawnCount}:...`)` pattern already used elsewhere in this file when it isn't
  - [x] Resulting ID string is deterministic and human-legible: `` `robot-${spawnCount}-${idSeed.toString(36).slice(2, 10)}` `` per the Architecture Decisions above
  - [x] New test: two `spawnRobot` calls against a locale reset to the same coordinates and a reset spawn counter produce identical ID sequences
  - [x] New test: robot IDs are unique across several consecutive spawns in one sequence

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — all passing
  - [x] `npm run build:types` passes for `spawnSystem.ts`

  **Dependencies:** None (independent of Phases 1–3; do not run concurrently with Task 7 — same file).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint: Engine + Store + ID

- [x] `npm test` passes for `melodyGenerator.test.ts`, `localeStore.test.ts`, and the new ID-determinism tests in `spawnSystem.test.ts`.
- [x] `npm run build:types` passes for every file touched so far (`spawnSystem.ts`'s melody call site remains broken until Task 7 — expected).
- [x] Manual check: `generateMelodyForRobot({ rhythmicDensity: 0, ... })` still returns a non-empty melody.

### Phase 5: Downstream Consumers

- [x] **Task 7: `src/systems/spawnSystem.ts` — update the `generateMelodyForRobot` call site**

  **Description:** Update the melody-generation call (~L425) and the seeded motif-length/note-variance roll logic (~L400–417) to produce and pass the new option shapes instead of the deleted `onsetCount` and the old discrete-value rolls.

  **Acceptance criteria:**
  - [x] The `generateMelodyForRobot` call no longer passes `onsetCount`; passes `rhythmicDensity` (0–100, seeded) instead
  - [x] The existing seeded `spawnRhythmicMotifLength`/`spawnNoteVariance` roll logic (currently picking from `[3, 4, 6, 8, 12, 16]` / an 8-way threshold ladder) is replaced with seeded rolls producing `{ active, value }` pairs in the new `1–8` range
  - [x] The `shouldCopy` branch (copying an existing robot's audio personality) correctly copies the new object shapes, not just a bare number
  - [x] `robot.rhythmicDensity` stored on the spawned robot reflects the percentage actually used, not the resulting event count (the old code stored `spawnMelody.length`, which no longer matches the field's new meaning)

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — all passing, including Task 6's tests, still green
  - [x] `npm run build:types` passes for `spawnSystem.ts`

  **Dependencies:** Task 3, Task 6 (sequenced after — same file).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (2 files)

- [x] **Task 8: `src/engine/regenerateMelody.ts` — update for the new field shapes**

  **Description:** Update the `GenerateMelodyForRobotOptions` object built from `robot.rhythmicDensity`/`rhythmicMotifLength`/`noteVariance` to match the new shapes, and update its fixture-based tests.

  **Acceptance criteria:**
  - [x] No reference to `onsetCount` remains
  - [x] `rhythmicMotifLength`/`noteVariance` are passed through as `{ active, value }` objects, with sensible fallbacks (`DEFAULT_RHYTHMIC_MOTIF_LENGTH`/`DEFAULT_NOTE_VARIANCE`) when absent on the robot
  - [x] `makeRobot()` test fixture updated to the new shapes
  - [x] The exact-event-count assertions (`toHaveLength(8)`, `toHaveLength(6)`) are replaced with assertions appropriate to percentage-based density, since event count is now derived, not literal

  **Verification:**
  - [x] `npx vitest run src/engine/regenerateMelody.test.ts` — all passing
  - [x] `npm run build:types` passes for `regenerateMelody.ts`

  **Dependencies:** Task 3.

  **Files:** `src/engine/regenerateMelody.ts`, `src/engine/regenerateMelody.test.ts`

  **Estimated scope:** S (2 files)

- [x] **Task 9: `src/components/panels/screen/console/RobotAudioTab.tsx` — update for the new shapes, ranges, and toggle affordance**

  **Description:** Update the Density slider to the new `0–100` range (inherited from `constants/index.ts` once Task 1 lands — verify), and rework the Motif Length / Note Variance controls to read/write `{ active, value }`, adding a plain checkbox per the Architecture Decisions above. Keep the existing hand-rolled Radix `Slider`/`input` markup — no `StepperWithToggle` adoption.

  **Acceptance criteria:**
  - [x] Density slider/input bounds reflect `0–100`
  - [x] Motif Length: slider/input bounds `1–8`; a checkbox (labeled "Active") toggles `.active`; slider/input reflect and write `.value`; disabled visual/interaction state when `.active` is false (matching `StepperWithToggle`'s own disabled-when-inactive convention, without importing the component itself)
  - [x] Note Variance: same pattern as Motif Length
  - [x] `handleMotifLengthChange`/`handleNoteVarianceChange` write the correct nested shape to `updateRobot` and call `regenerateMelody` with the updated robot
  - [x] Existing `RobotAudioTab.test.tsx` motif-length test's out-of-range value (`'12'`) replaced with a valid `1–8` value; assertions updated for the `{active, value}` shape
  - [x] New/updated test coverage for the Active checkbox toggling `.active` and triggering regeneration

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotAudioTab.test.tsx` — all passing
  - [x] `npm run build:types` passes for the component
  - [x] Manual check: render the tab, toggle Motif Length/Note Variance off and on, confirm the slider visually disables when inactive and melody regenerates on every change

  **Dependencies:** Task 1, Task 3.

  **Files:** `src/components/panels/screen/console/RobotAudioTab.tsx`, `src/components/panels/screen/console/RobotAudioTab.test.tsx`

  **Estimated scope:** M (2 files, more UI surface than other tasks)

### Checkpoint: Full Consumer Chain

- [x] `npm test` — all tests passing project-wide.
- [x] `npm run build:types` — zero errors project-wide (no leftover `onsetCount` or old-shape field access anywhere).
- [x] `npm run lint` — zero errors project-wide.
- [x] `npm run build` — production bundle builds cleanly.
- [x] Manual check: spawn a robot, open its Robot Audio tab, toggle Motif Length and Note Variance on/off, drag each slider, confirm "New Melody" regenerates without console errors.
- [x] Review with human before proceeding to docs.

### Phase 6: Docs

- [x] **Task 10: `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/todo/roadmap.md` — document shipped behavior**

  **Description:** Update all three per the roadmap's own Docs bullets, once everything above is implemented and verified — these describe shipped behavior, not planned behavior.

  **Acceptance criteria:**
  - [x] `docs/MELODY_SYSTEM.md` fully updated: Density as 0–100% fill rate (was 4–12 onset count), Motif Length as a 1–8 on/off-toggled value (was a plain 1–16 slider), Note Variance as a 1–8 on/off-toggled value (was a 0–8 magnitude), and `RHYTHMIC_MOTIF_LENGTH_MAX`'s old-vs-new values (16 → 8) stated explicitly
  - [x] `docs/PROCEDURAL_GENERATION.md`'s existing "Planned change" callout on the Locale map bullet is resolved (already actually resolved by `LOCALE_SEED_DECOUPLING.md`; this task only updates the doc text)
  - [x] `docs/todo/roadmap.md` §6's remaining bullets (robot ID determinism, measure-length references, density/motif/variance restructuring, localeStore clamp update) are marked resolved, mirroring the strikethrough+pointer pattern already used for the first (pulled-forward) bullet, pointing at `docs/specs/ROBOT_MELODY_SEED_ENGINE.md`

  **Verification:**
  - [x] Manual proofread: no remaining references to the old 4–12/1–16/0–8 ranges anywhere in these three docs, each rewritten claim spot-checked against the actually-shipped code, not reconstructed from this plan
  - [x] Links resolve (relative paths correct)

  **Dependencies:** Tasks 1–9.

  **Files:** `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (3 files, text-only)

### Checkpoint: Complete

- [x] All acceptance criteria across Tasks 1–10 met.
- [x] Full verification suite green (`build:types`, `lint`, `test`, `build`).
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Percentage→onset-count rounding produces off-by-one mismatches with hand-written test expectations | Low | Task 4's tests assert ranges/properties (e.g. "≥1 onset", "onsets ≤ subdivisions") rather than brittle exact counts wherever rounding is involved, per spec §5's coverage targets |
| `RobotAudioTab.tsx`'s new checkbox affordance regresses existing density/motif tests before Task 9 lands | Medium | Task 9 explicitly updates `RobotAudioTab.test.tsx` in the same task — never left for a later task |
| Two agents editing `spawnSystem.ts` concurrently (Task 6 and Task 7) | Medium | Task 7 is sequenced after Task 6 even though Task 6 has no logical dependency on Phases 1–3; do not parallelize Task 6 and Task 7 against each other |
| `onsetCount` deletion breaks a call site not caught by this plan | Low | `npm run build:types` in every checkpoint catches this — also verified via grep during spec-writing that only the files listed in spec §2 reference it |

## Open Questions

None remaining — all five items in spec §7 are resolved above under Architecture Decisions: §7.1 (default density) → `50`; §7.2 (default toggle states) → stated exactly; §7.3 (robot ID format) → adopted as final; §7.4 (MELODY_SYSTEM.md wording) → old-vs-new stated explicitly; §7.5 (interim toggle affordance) → plain checkbox, no new component.
