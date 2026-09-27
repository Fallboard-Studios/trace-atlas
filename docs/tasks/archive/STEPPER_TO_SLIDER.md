# Implementation Plan: Stepper → Slider Conversion

Source spec: [docs/specs/STEPPER_TO_SLIDER.md](../specs/STEPPER_TO_SLIDER.md).

## Overview

Replace all 5 real `Stepper`/`StepperWithToggle` call sites with `SliderLinear` (`step: 1`).
Octave Range Min/Max and Compressor Ratio are pure UI substitutions. Motif Length and Note
Variance additionally remove their `StepperWithToggle`'s toggle entirely — `value === 0` becomes
the new "off" state, reproducing the exact old `active: false` behavior, with `ToggleValue`'s
`active` field kept but made a derived, enforced consequence of `value > 0` at every write site
instead of independently settable. `Stepper`/`StepperWithToggle` themselves are not deleted.

## Architecture Decisions

Carrying forward spec §7's five confirmed decisions into how this plan is ordered:

- **§7.1 — Spawn seeding: one tuned single draw per field**, over an extended range, calibrated so
  landing on `value: 0` stays ≈15% (preserving `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/
  `NOTE_VARIANCE_ACTIVE_THRESHOLD`'s existing off-rate). Task 6 works out the exact range math.
- **§7.2 — Company broadcast: `diffCompoundField` stays untouched.** `CompanyOptionsSection.tsx`
  moves Motif Length/Note Variance onto the plain-number broadcast pattern `onPitchRepeatChange`
  already uses (Task 12), rather than patching shared diff logic other compound controls
  (ADSR/LFO/layers) also depend on.
- **§7.3 — `PingControlsDrawer`'s prop shape flattens to plain `number`**, matching `pitchRepeat`'s
  existing shape in the same drawer (Task 10). `{active, value}` reconstruction happens only in
  `robotOptionsActions.ts` (Task 5) — nothing above that layer touches the `ToggleValue` shape for
  these two fields again.
- **§7.4 — `AudioRigDrawer.tsx`'s dead `'stepper'` case is left in place**, along with its
  `Stepper` import, as defensive dead code. No task touches this file.
- **§7.5 — Branch: `feature/stepper-to-slider`** (already active).
- **Invariant enforcement lands before UI exposure.** Every write site that can produce a
  `{active, value}` payload for Motif Length/Note Variance must derive `active` from `value > 0`
  (Tasks 3–6) *before* the slider that can actually drive `value` to `0` is wired into the UI
  (Task 10) — otherwise there's a real window where a `0`-valued slider edit could round-trip
  through an unfixed write path and re-acquire a stale `active: true`. Octave Range/Compressor
  Ratio carry no such risk (pure number passthrough, no derived-flag concept) and are not gated by
  Phase 2 at all.

## Dependency Graph

```
Task 1 (constants/index.ts)  ─┐
Task 2 (types/Robot.ts)      ─┴─→ (parallel-safe with each other; Task 2 is comment-only)
        │
        ├──────────────┬──────────────┬──────────────┐
        ▼               ▼              ▼              ▼
   Task 3            Task 4         Task 5         Task 6
(melodyGenerator   (localeStore   (robotOptions   (spawnSystem
 default fix)       derived-      Actions.ts       single-draw
                     active)       number-in)       seeding)
        │               │              │              │
        └───────┬───────┴──────┬───────┴──────┬───────┘
                │  (Phase 2 — independent files, parallel-safe)
                ▼
Task 1 ──→ Task 7 (robotOptionsConfig.ts — 4 schemas)     Task 8 (audioRigConfig.ts)
                │                                          (fully independent — no
                │                                           dependents anywhere)
                ▼
        Task 9 (PingControlsDrawer — Octave Range swap)
                │  (same file — sequential only)
                ▼
   Tasks 3,4,5,6,7 ──→ Task 10 (PingControlsDrawer — Motif Length/Note Variance swap + flatten)
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
      Task 5,10 → Task 11          Task 5,10 → Task 12
      (RobotOptionsTab.tsx)        (CompanyOptionsSection.tsx)
                    │                       │
                    └───────────┬───────────┘
                                 ▼
                    Task 13 (docs — depends on everything)
```

Phase 1 (Tasks 1–2) is parallel-safe. Phase 2 (Tasks 3–6) is four independent tracks — different
files, safe to parallelize once Phase 1 lands. Phase 3 (Tasks 7–8) splits into the gated schema
file (Task 7, needs Task 1) and the fully independent Compressor Ratio schema (Task 8, no
dependencies at all — could land anytime). Phase 4 has an internal chain: Task 9 and Task 10 share
one file (sequential only) with Task 10 additionally gated on all of Phase 2 landing first (see
Architecture Decisions); Tasks 11 and 12 are independent of each other but both need Task 10.
Task 13 (docs) waits on everything, since it documents shipped behavior.

## Task List

### Phase 1: Foundation

- [x] **Task 1: `src/constants/index.ts` — extend Motif Length/Note Variance min to 0**

  **Description:** Change `RHYTHMIC_MOTIF_LENGTH_MIN`/`NOTE_VARIANCE_MIN` from `1` to `0`, and
  rewrite the shared doc comment above them — it currently states "`active: false` is the sole
  'off' state ... `value` itself has no reachable off/magic-zero meaning," the exact opposite of
  the new design.

  **Acceptance criteria:**
  - [x] `RHYTHMIC_MOTIF_LENGTH_MIN = 0`, `NOTE_VARIANCE_MIN = 0`
  - [x] `RHYTHMIC_MOTIF_LENGTH_MAX`/`NOTE_VARIANCE_MAX` unchanged (`8`)
  - [x] Doc comment rewritten to state `value === 0` is now itself the off state for both fields,
        with `active` derived from `value > 0` rather than independently meaningful

  **Verification:**
  - [x] `npm run build:types` — clean (a widened bound is not a breaking type change)
  - [x] `npm run lint` clean for `constants/index.ts`

  **Dependencies:** None.

  **Files:** `src/constants/index.ts`

  **Estimated scope:** XS (1 file)

- [x] **Task 2: `src/types/Robot.ts` — update doc comments (no shape change)**

  **Description:** Update the `rhythmicMotifLength`/`noteVariance` field doc comments: "value is
  1-8" → "0-8"; `noteVariance`'s "Default: `{ active: false, value: 1 }`" → "`{ active: false,
  value: 0 }`". The field types themselves (`{ active: boolean; value: number }`) do not change.

  **Acceptance criteria:**
  - [x] Both doc comments' stated `value` range is `0-8`
  - [x] `noteVariance`'s stated default is `{ active: false, value: 0 }`
  - [x] No change to either field's TypeScript type

  **Verification:**
  - [x] `npm run build:types` — clean (comment-only)
  - [x] `npm run lint` clean for `types/Robot.ts`

  **Dependencies:** None (parallel-safe with Task 1 — describes the same change but touches a
  different file).

  **Files:** `src/types/Robot.ts`

  **Estimated scope:** XS (1 file, comment-only)

### Checkpoint: Foundation

- [x] `npm run build:types` passes with zero errors.
- [x] `npm run lint` passes on both touched files.
- [x] `npm test` — full suite green.

  **Deviation from plan:** this checkpoint's original wording claimed "nothing should break yet"
  (Tasks 1-2 look purely additive/comment-only) — wrong. `localeStore.ts`'s pre-existing
  `clampToggleValue` clamps against the imported `RHYTHMIC_MOTIF_LENGTH_MIN`/`NOTE_VARIANCE_MIN`
  constants directly, so Task 1's `1 → 0` change immediately flipped one existing
  `localeStore.test.ts` case red (it asserted the old min-1 clamp). Not a bug — exactly the
  regression Task 4 exists to fix, landed a few commits later in the same phase — but the
  Foundation checkpoint briefly saw 1 failing test between Task 1's commit and Task 4's.

### Phase 2: Invariant Enforcement (independent files, parallel-safe once Phase 1 lands)

- [x] **Task 3: `src/engine/melodyGenerator.ts` — fix `DEFAULT_NOTE_VARIANCE`**

  **Description:** `DEFAULT_NOTE_VARIANCE = { active: false, value: 1 }` pairs `active: false`
  with a nonzero `value` — it already violates the new `value > 0 ⟺ active` invariant. Change its
  `value` to `0`. `DEFAULT_RHYTHMIC_MOTIF_LENGTH` (`{ active: true, value: 8 }`) already satisfies
  the invariant and is untouched. No change to any branching logic in `generateMelodyForRobot` or
  `reRollMelodyPitches` — both keep reading `.active` exactly as today.

  **Acceptance criteria:**
  - [x] `DEFAULT_NOTE_VARIANCE` is `{ active: false, value: 0 }`
  - [x] `DEFAULT_RHYTHMIC_MOTIF_LENGTH` unchanged
  - [x] No change to any function body in this file — constant literal only

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts -t DEFAULT_NOTE_VARIANCE` — updated
        assertion passes
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts` — full file still green (regression
        guard: nothing else in this large suite depended on the old default's exact value)
  - [x] `npm run build:types` passes for this file

  **Dependencies:** None (the constant's value doesn't reference `constants/index.ts`; logically
  paired with Task 1 but not code-dependent on it).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** XS (1 file + its test, single-line change)

  **Deviation from plan (gap in original scope):** `companyOptions.ts`'s `resolveCompanyOptions`
  also falls back to `DEFAULT_NOTE_VARIANCE` and its own test asserted the old literal value —
  missed when this task was written. Caught at the Phase 2 checkpoint's full-suite run and fixed
  in a small standalone commit (test-only, no production code change) rather than folded
  retroactively into this task's own commit, since Task 3's commit had already landed by then.

- [x] **Task 4: `src/stores/localeStore.ts` — `clampToggleValue` derives `active`**

  **Description:** `clampToggleValue` currently trusts the caller's `active` field
  (`active: Boolean(active)`). Change it to derive `active` from the post-clamp `value` instead
  (`clamped > 0`), per spec §4's before/after. This is the single central enforcement point —
  every store-mediated write (`robotOptionsActions.ts`, `RobotOptionsTab.tsx`,
  `CompanyOptionsSection.tsx`'s broadcast) funnels through `updateRobot`.

  **Acceptance criteria:**
  - [x] `clampToggleValue` no longer reads `active` off the input object at all
  - [x] Returned `active` is `clamped_value > 0`, where `clamped_value` is the already-clamped
        `value`
  - [x] A caller passing `{ active: false, value: 5 }` (lying about `active`) yields
        `{ active: true, value: 5 }`
  - [x] A caller passing `{ value: -3 }` with the new `min: 0` yields `{ active: false, value: 0 }`

  **Verification:**
  - [x] `npx vitest run src/stores/localeStore.test.ts -t rhythmicMotifLength` and
        `-t noteVariance` — existing clamp cases updated for min-`0` + derived-`active`; new case
        added for a caller-supplied `active` that disagrees with `value`
  - [x] `npm run build:types` passes for this file

  **Dependencies:** Task 1 (needs `RHYTHMIC_MOTIF_LENGTH_MIN`/`NOTE_VARIANCE_MIN` to actually be
  `0` for its own tests to exercise the new floor meaningfully).

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 5: `src/systems/robotOptionsActions.ts` — number-in signatures**

  **Description:** Change `applyMotifLength`/`applyNoteVariance` from `(robot, localeId, value:
  StepperWithToggleValue)` to `(robot, localeId, value: number)`, constructing `{ active: value >
  0, value }` internally before writing to the store and calling `regenerateMelody` — mirrors
  `applyDensity`/`applyPitchRepeat`'s existing plain-number pattern exactly.

  **Acceptance criteria:**
  - [x] `applyMotifLength(robot, localeId, value: number)` builds `{ active: value > 0, value }`
        once, passes it to both `updateRobot` and `regenerateMelody`
  - [x] `applyNoteVariance` follows identically
  - [x] Neither function accepts or reads any externally-supplied `active` field anymore

  **Verification:**
  - [x] `npx vitest run src/systems/robotOptionsActions.test.ts -t applyMotifLength` and
        `-t applyNoteVariance` — updated for the number-in signature, asserting the constructed
        object is what's written/regenerated
  - [x] `npm run build:types` passes for this file (expect a temporary break at its two call sites
        — `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx` — until Tasks 11/12 land; acceptable
        mid-plan per Phase 2/4's parallel-track structure, must be green again by the UI Wiring
        checkpoint)

  **Dependencies:** None (parallel-safe within Phase 2; the object it constructs doesn't depend on
  Task 3's or Task 4's changes to be correct, though all three should ship together for the
  invariant to hold everywhere at once).

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 6: `src/systems/spawnSystem.ts` — single tuned seed draw**

  **Description:** Collapse each field's two independent noise-map draws
  (`'robot.rhythmicMotifLength.active'` / `'.value'`, and the Note Variance equivalents) into one
  seeded draw per field, over an extended range (e.g. `0-9`, floored to `0-8`), tuned so
  `P(value = 0)` stays ≈15% — matching today's `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/
  `NOTE_VARIANCE_ACTIVE_THRESHOLD` (`0.15`) off-rate. `active` is derived (`value > 0`) at
  construction, not drawn.

  **Acceptance criteria:**
  - [x] Exactly one noise-map dataId per field for Motif Length, one for Note Variance (down from
        two each)
  - [x] `spawnRhythmicMotifLength`/`spawnNoteVariance` are built as `{ active: value > 0, value }`
        from the single draw's result
  - [x] The `shouldCopy` (inheritance) branch is unaffected — still copies the source robot's field
        verbatim
  - [x] `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/`NOTE_VARIANCE_ACTIVE_THRESHOLD` are either reused
        in the new range math or removed with a comment explaining the replacement — not left as
        dead, misleading constants

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts -t rhythmicMotifLength` and
        `-t noteVariance` — full-range seeding coverage updated; a statistical off-rate assertion
        (many samples, `value === 0` rate within a tolerance band of 15%) replaces the old
        threshold-based assertion
  - [x] `npm run build:types` passes for this file

  **Dependencies:** None (this file doesn't import the `constants/index.ts` bounds for these two
  fields today — logically related to Task 1/Task 4 but not code-dependent on either).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** M (1 file + its test — the range-tuning math needs care)

  **Deviation from plan:** the plan's own description suggested a fresh, differently-named
  consolidated dataId (implying a range like `0-9`). A first implementation attempt did exactly
  that (`'robot.rhythmicMotifLength'`, a new string) and empirically landed at 99.2% active
  against the existing ~85% statistical test — `getSeededVal`'s simplex slice is keyed off the
  *exact* dataId string, so a new string samples a completely different noise curve with no
  guarantee of reproducing the old one's threshold-crossing rate against `OFF_THRESHOLD`. Fixed by
  reusing the OLD `'.active'` dataId verbatim (retiring only the `.value` dataId) instead of
  inventing a new key — the actual implementation is "one draw over `[0, 1)`, split by threshold
  into off/on-with-derived-value" rather than "one draw over an extended integer range," a
  different (simpler, and correct) mechanism than the plan sketched. `RHYTHMIC_MOTIF_LENGTH_ACTIVE_THRESHOLD`/
  `NOTE_VARIANCE_ACTIVE_THRESHOLD` were renamed to `..._OFF_THRESHOLD` (same `0.15` value,
  inverted meaning) rather than removed.

### Checkpoint: Invariant Enforcement

- [x] `npm run build:types` — Task 5's expected temporary breakage at its two call sites is the
      *only* acceptable error; everything else must be clean.
- [x] `npm run lint` passes on all Phase 2 files.
- [x] `npx vitest run src/engine/melodyGenerator.test.ts src/stores/localeStore.test.ts src/systems/robotOptionsActions.test.ts src/systems/spawnSystem.test.ts` — all green.
- [x] Manual check: no file outside Phase 2's list was touched.
- [x] Review with human before proceeding to Phase 3.

### Phase 3: Schema Conversion

- [x] **Task 7: `src/data/robotOptionsConfig.ts` — convert 4 schemas to `SliderLinear`**

  **Description:** `OCTAVE_RANGE_MIN_SCHEMA`/`OCTAVE_RANGE_MAX_SCHEMA`: `type: 'stepper'` →
  `'sliderLinear'` (+ `step: 1`), bounds unchanged. `MOTIF_LENGTH_SCHEMA`/`NOTE_VARIANCE_SCHEMA`:
  `type: 'stepperToggle'` → `'sliderLinear'` (+ `step: 1`), `min` now reads
  `RHYTHMIC_MOTIF_LENGTH_MIN`/`NOTE_VARIANCE_MIN` (`0`, per Task 1). Drop now-unused
  `StepperSchema`/`StepperWithToggleSchema` type imports if nothing else in the file uses them.

  **Acceptance criteria:**
  - [x] All 4 schemas are `SliderLinearSchema`-typed with `step: 1`
  - [x] `OCTAVE_RANGE_MIN_SCHEMA`/`MAX_SCHEMA`'s bounds unchanged (`OCTAVE_RANGE_MIN`/`MAX`)
  - [x] `MOTIF_LENGTH_SCHEMA`/`NOTE_VARIANCE_SCHEMA`'s `min` is `0`
  - [x] No unused type imports remain in this file

  **Verification:**
  - [x] `npx vitest run src/data/robotOptionsConfig.test.ts` — all 4 schema-shape assertions
        updated and passing
  - [x] `npm run build:types` passes for this file
  - [x] `npm run lint` clean (catches unused imports)

  **Dependencies:** Task 1 (Motif Length/Note Variance need the real `0` bound).

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 8: `src/data/audioRigConfig.ts` — Compressor Ratio schema**

  **Description:** Change the inline `compressor.ratio` schema's `type: 'stepper'` →
  `'sliderLinear'` (+ `step: 1`). Fully independent of Motif Length/Note Variance — `AudioRigDrawer.tsx`
  is confirmed not touched (its existing `'sliderLinear'` dispatcher case already handles this;
  its dead `'stepper'` case is left in place per Architecture Decisions §7.4).

  **Acceptance criteria:**
  - [x] `compressor.ratio` schema is `type: 'sliderLinear'`, `step: 1`, bounds unchanged (`min: 1,
        max: 20`)
  - [x] No change to `AudioRigDrawer.tsx`

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts` — updated schema-shape assertion passes;
        review (and update if needed) whatever assertion documents the drawer's "closed set of
        `ControlSchema` variants this drawer uses"
  - [x] `npm run build:types` passes for this file

  **Dependencies:** None — can land anytime, independently of every other task in this plan.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** XS (1 file + its test)

### Checkpoint: Schemas

- [x] `npm run build:types` — same expected Task-5-only breakage as the prior checkpoint, nothing
      new.
- [x] `npm run lint` clean on all Phase 3 files.
- [x] `npx vitest run src/data/robotOptionsConfig.test.ts src/data/audioRigConfig.test.ts` — green.

### Phase 4: UI Wiring

- [x] **Task 9: `PingControlsDrawer.tsx` — Octave Range Min/Max swap**

  **Description:** Replace both `<Stepper schema={OCTAVE_RANGE_MIN_SCHEMA} .../>` /
  `<Stepper schema={OCTAVE_RANGE_MAX_SCHEMA} .../>` with `<SliderLinear .../>`. Purely mechanical
  — same props (`schema`, `value`, `onChange`, `disabled={generationDisabled}`), same
  `onOctaveMinChange`/`onOctaveMaxChange` handlers, `applyOctaveMin`/`applyOctaveMax`'s min≤max
  clamp (`robotOptionsActions.ts`) untouched and not part of this task's scope.

  **Acceptance criteria:**
  - [x] Both Octave Range controls render as `SliderLinear`
  - [x] `disabled={generationDisabled}` preserved unchanged on both
  - [x] `onOctaveMinChange`/`onOctaveMaxChange` prop signatures unchanged (still plain `number`)

  **Verification:**
  - [x] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx -t "Octave Range"` —
        updated to query for the slider instead of the stepper's button/role, same behavioral
        assertions
  - [x] `npm run build:types` passes for this file

  **Dependencies:** Task 7.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 10: `PingControlsDrawer.tsx` — Motif Length/Note Variance swap + flatten**

  **Description:** Replace both `<StepperWithToggle .../>` usages with `<SliderLinear .../>`.
  `PingControlsValue.rhythmicMotifLength`/`noteVariance` flatten from `StepperWithToggleValue` to
  plain `number` (per Architecture Decisions §7.3) — `onMotifLengthChange`/`onNoteVarianceChange`
  become `(value: number) => void`, with no `{active, value}` reconstruction at this layer.
  `pitchRepeatDisabled`'s gate (`!value.rhythmicMotifLength.active`) becomes
  `value.rhythmicMotifLength === 0` — same semantics, new field shape. Neither slider is ever
  disabled by its own "off" state — only `generationDisabled`/`clickTrackActive` still gate them,
  identically to every other control in this drawer.

  **Acceptance criteria:**
  - [x] `PingControlsValue.rhythmicMotifLength`/`noteVariance` are `number`
  - [x] Both controls render as `SliderLinear` with `min: 0`, never disabled purely because their
        value is `0`
  - [x] `onMotifLengthChange`/`onNoteVarianceChange` fire with the raw slider `number`, no object
        wrapping
  - [x] `pitchRepeatDisabled` reads `value.rhythmicMotifLength === 0` (equivalent to the old
        `!.active` check, new field shape)
  - [x] `Stepper`/`StepperWithToggle` imports removed from this file (now fully unused here)

  **Verification:**
  - [x] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` — full file updated:
        Motif Length/Note Variance test fixtures become plain numbers, `onChange` assertions expect
        a raw number, a new case confirms the slider stays interactive at `value: 0`, Pitch Repeat's
        gating test updated for the new `=== 0` check
  - [x] `npm run build:types` passes for this file
  - [x] `npm run lint` clean (unused-import check)

  **Dependencies:** Task 9 (same file — sequential only); Tasks 3, 4, 5, 6, 7 (invariant
  enforcement and schema must be in place before this task wires a `value: 0`-capable slider into
  the live UI — see Architecture Decisions).

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** M (1 file + its test, the field-shape change touches several call sites
  within the file)

- [x] **Task 11: `RobotOptionsTab.tsx` — robot-mode wiring**

  **Description:** `pingControlsValue.rhythmicMotifLength`/`noteVariance` become
  `robot.rhythmicMotifLength?.value ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH.value` /
  `robot.noteVariance?.value ?? DEFAULT_NOTE_VARIANCE.value` (plain numbers, mirroring
  `pitchRepeat`'s existing mapping). `onMotifLengthChange`/`onNoteVarianceChange` wire straight
  through to `applyMotifLength`/`applyNoteVariance`'s new number-in signature — no local
  reconstruction.

  **Acceptance criteria:**
  - [x] Both fields derive a plain number from the robot's stored `{active, value}`, falling back
        to the (now invariant-correct) defaults
  - [x] Both `onChange` props call `applyMotifLength`/`applyNoteVariance(robot, localeId, value)`
        directly

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` — updated
        wiring assertions, mirroring the existing `onDensityChange → applyDensity` spy test
  - [x] `npm run build:types` passes for this file (this resolves Task 5's expected temporary
        breakage at this call site)

  **Dependencies:** Task 5, Task 10.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`,
  `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** S (1 file + its test)

- [x] **Task 12: `CompanyOptionsSection.tsx` — company-broadcast wiring**

  **Description:** `DISABLED_PING_CONTROLS.noteVariance` default → `{ active: false, value: 0 }`
  (matching Task 3's fix). Motif Length/Note Variance broadcast handlers move off
  `diffCompoundField` entirely, onto the plain-number pattern `onPitchRepeatChange` already uses —
  `members.forEach` + `patchSnapshot` on the raw number, each member's `{active, value}`
  reconstructed via `applyMotifLength`/`applyNoteVariance` on write (per Architecture Decisions
  §7.2).

  **Acceptance criteria:**
  - [x] `DISABLED_PING_CONTROLS.noteVariance` is `{ active: false, value: 0 }`
  - [x] `onMotifLengthChange`/`onNoteVarianceChange` broadcast via `members.forEach` +
        `applyMotifLength`/`applyNoteVariance` + `patchSnapshot({ rhythmicMotifLength: { active:
        value > 0, value } })` (or the `noteVariance` equivalent) — not `diffCompoundField`
  - [x] A broadcast that crosses the `0` boundary (e.g. `0 → 3`) updates both `active` and `value`
        on every member — no field silently dropped

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` — updated
        broadcast-wiring assertions, plus a new 0-boundary-crossing case
  - [x] `npm run build:types` passes for this file (resolves Task 5's remaining expected breakage)

  **Dependencies:** Task 5, Task 10.

  **Files:** `src/components/company/CompanyOptionsSection.tsx`,
  `src/components/company/CompanyOptionsSection.test.tsx`

  **Estimated scope:** S (1 file + its test)

  **Note:** `DISABLED_PING_CONTROLS.rhythmicMotifLength` was flattened to plain `0` too (not just
  `noteVariance`, which is all the plan's own wording called out) — a direct, mechanical
  consequence of `PingControlsValue` flattening in Task 10, not a separate decision.

### Checkpoint: UI Wiring

- [x] `npm run build:types` — zero errors (Task 5's temporary breakage is now fully resolved).
- [x] `npm run lint` — zero errors.
- [x] `npm test` — full suite green.
- [x] `npm run build` — production bundle builds cleanly.
- [x] Manual check in `npm run dev`: Octave Range, Motif Length, Note Variance, and Compressor
      Ratio all render as sliders; Motif Length/Note Variance sliders reach `0` and stay
      interactive there (draggable back up) in both single-robot and company-broadcast modes.
- [x] Review with human before proceeding to Phase 5.

### Phase 5: Docs

- [x] **Task 13: Update `COMPONENT_LIBRARY.md`, `MELODY_SYSTEM.md`, `ROBOT_DATA_GRID.md`**

  **Description:** Document the shipped conversion across all three reference docs, per spec §2.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md`: notes that Octave Range Min/Max, Motif Length, and Note
        Variance moved off `Stepper`/`StepperWithToggle` onto `SliderLinear`, mirroring the
        existing `DENSITY_SCHEMA` precedent comment
  - [x] `docs/MELODY_SYSTEM.md`: `ToggleValue.value` comments ("1-8") → "0-8"; the
        `DEFAULT_NOTE_VARIANCE` reference → `{ active: false, value: 0 }`; the `NOTE_VARIANCE_MIN`
        narrative (which currently describes the *prior* `0→1` migration) updated to describe this
        phase's `1→0` reversal instead
  - [x] `docs/reference/ROBOT_DATA_GRID.md`: Motif Length/Note Variance/Octave Range Min/Max rows'
        Component column → "Slider Component"; Motif Length/Note Variance min bound `1→0`. (Opportunistic,
        not required: Density's row is already stale, still reading "Stepper Component" from an
        earlier phase — fix while this table is open.)

  **Verification:**
  - [x] Manual review — each doc accurately describes the final shipped implementation (re-read
        against the actual code, not just this plan)

  **Dependencies:** Tasks 1–12 (documents shipped behavior).

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/MELODY_SYSTEM.md`, `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** S (3 files, docs-only)

  **Deviation from plan (opportunistic 4th file):** `docs/reference/GLOBAL_CHAIN_GRID.md` — not
  named in the plan or spec — also documented Compressor Ratio as `STEPPER`. Same class of fix as
  ROBOT_DATA_GRID.md's Density row (a reference table directly describing a schema this phase
  changed); fixed alongside for the same reason. `docs/todo/roadmap.md` has several older
  "Stepper"/"done" mentions of the same shipped fields (e.g. "Octave Range Min/Max ship as two
  independent Steppers") that are now equally stale — noticed but not touched, since it's a large
  historical narrative document mixing point-in-time decision records with forward roadmap items,
  outside this task's named scope; flagged to the human rather than edited.

### Checkpoint: Complete

- [x] Every task's acceptance criteria met.
- [x] `npm run build:types && npm run lint && npm test && npm run build` — all clean, run together
      as the final gate. One run hit `src/systems/audioSwells.test.ts` failing on a different
      assertion than a prior isolated run, then passing cleanly both isolated and in the full suite
      on retry — pre-existing statistical/noise-sampling flakiness in that file (same class as
      `factoryPlacementSystem.test.ts`, confirmed flaky earlier this session), unrelated to Motif
      Length/Note Variance or anything this plan touched. Final full-suite run: 1746/1746 green.
- [x] Every behavior in spec §1 verified: Octave Range's min≤max clamp still holds exactly as
      before (Task 9's regression coverage); Motif Length/Note Variance sliders reach `0` and stay
      interactive (Task 10); `value === 0` reproduces the old `active: false` melody-generation
      behavior byte-for-byte (Task 3's default fix + Phase 2's invariant enforcement, verified
      through existing `melodyGenerator.test.ts` cases that were never touched); spawn-time off-rate
      statistically unchanged (Task 6); company broadcast propagates both `active` and `value`
      together (Task 12).
- [x] Ready for review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A write path constructing `{active, value}` for Motif Length/Note Variance is missed, leaving one place where `active` can still drift out of sync with `value` | High | Spec §3 enumerates all 4 known write sites exhaustively (Tasks 3–6); Phase 2's checkpoint requires a full-suite test run before Phase 3/4 proceed, and Task 10 (the UI exposure point) is explicitly gated on all of Phase 2 landing first |
| `spawnSystem.ts`'s single-draw range tuning (Task 6) doesn't actually preserve the ~15% off-rate, silently changing spawn-time robot behavior | Med | Task 6's verification requires a statistical assertion (many samples, tolerance band around 15%) rather than a single-sample smoke test |
| `Task 5` lands with a known, temporary `build:types` break at its two call sites | Low | Explicitly called out as expected in Task 5's own verification step and both intervening checkpoints; resolved by Tasks 11/12, confirmed clean at the UI Wiring checkpoint |
| `CompanyOptionsSection.tsx`'s move off `diffCompoundField` (Task 12) is copy-pasted incorrectly and silently drops the `active` or `value` half of a broadcast | Med | Task 12's acceptance criteria require a dedicated 0-boundary-crossing test case, not just a happy-path assertion |

## Open Questions

None remaining — all five of spec §7's decisions were confirmed with the human before this task
list was written (see Architecture Decisions above).
