# Implementation Plan: Seeded Slider Value Quantization

Source spec: [docs/specs/SEEDED_SLIDER_VALUE_QUANTIZATION.md](../specs/SEEDED_SLIDER_VALUE_QUANTIZATION.md). Source intent: [docs/intent/seeded-slider-value-quantization.md](../intent/seeded-slider-value-quantization.md). Touches presentation schemas, seeded-generation logic, one new pure-math helper, and (found during this planning pass, not in the spec) one real engine-level correctness fix.

> **Found during Planning, not in the spec:** `docs/reference/GLOBAL_CHAIN_GRID.md`'s own Delay section explicitly documents that Delay Time's full range and `src/engine/audioEngine/globalFx.ts`'s hardcoded `Tone.FeedbackDelay({ maxDelay: 1 })` "must stay in sync if this range ever changes." Widening Delay Time's max to `10` without also raising `maxDelay` would silently cap the real Tone.js delay buffer above 1 second — an audio-engine correctness bug, not a cosmetic one. Given its own task (Task 4) rather than folded into the schema-value task, since it's a different subsystem (`AudioEngine`, not a `ControlSchema`) with its own test file.
>
> Also found: 6 more files carry values that mirror the ones being edited and would otherwise go stale — 3 test files with hardcoded assertions (`audioRigConfig.test.ts`, `globalAudioSeedRanges.test.ts`, `lfo.test.ts`), `types/globalAudio.ts`'s doc-comment ranges (the file `globalAudioSeedRanges.ts`'s own header names as its "do not change one without the other" mirror), and 2 reference docs (`GLOBAL_CHAIN_GRID.md`, `ROBOT_DATA_GRID.md`). Folded into Task 3 (the value-edit task) rather than left to surface as a build failure.

## Overview

Add one pure quantization helper; give `SliderCenteredZeroSchema` an optional `step` (EQ3-only); land the 6 confirmed range/step edits app-wide, including their mirrored doc-comments/tests/reference docs and the `maxDelay` engine fix; then wire quantization into every generation call site that has a real, declared `step` — global-chain fields (`globalAudioSeed.ts`) and robot-level fields (`spawnSystem.ts`). Docs (`SLIDER_VALUES.md`'s own footnotes) land last.

## Architecture Decisions

- **The helper ships alone first, with its own tests, before anything consumes it** — same "foundation lands first" precedent every prior task plan in this repo uses (`docs/tasks/ROBOT_CARDS_REDESIGN.md`, `docs/tasks/ROBOT_DETAIL_TOP_CARD_REDESIGN.md`).
- **`SliderCenteredZeroSchema.step` (Task 2) lands before the value edits (Task 3)** — Task 3 sets EQ3's schema `step: 0.5`, which needs the field to exist first. Task 2 has no dependency of its own (additive type change + one component line).
- **The `maxDelay` engine fix is its own task (Task 4), not folded into Task 3** — different subsystem (`AudioEngine`/`globalFx.ts`, not a `ControlSchema`), different test file, and a correctness fix rather than a value/doc alignment — worth its own reviewable commit and acceptance criteria rather than hiding inside a large schema-edit diff.
- **Global-chain quantization (Task 5) and robot-level quantization (Task 6) are independent of each other** — different files (`globalAudioSeed.ts` vs. `spawnSystem.ts`), no shared state. Both depend on Task 1 (the helper) and Task 3 (final min/max/step values, especially `LFO_RATE_MAX`/`LFO_RATE_STEP` and Compressor Attack's new max).
- **Docs (Task 7) land last**, once every value and quantization behavior is real and spot-checkable — same "docs land last" precedent as every prior plan.

## Dependency Graph

```
Task 1 (quantizeToStep + its own test)
    │
    ├──────────────────────────────────────────────┐
    │                                               │
Task 2 (SliderCenteredZeroSchema.step + component)  │
    │                                               │
    └──→ Task 3 (6 value/range edits + mirrored     │
                  docs/tests/constants)              │
              │                                      │
              ├──→ Task 4 (globalFx.ts maxDelay fix) │
              │                                      │
              ├──→ Task 5 (global-chain quantization)◄┘
              │
              └──→ Task 6 (robot-level quantization) ◄── Task 1

Task 3, Task 4, Task 5, Task 6 ──→ Task 7 (docs)
```

## Task List

### Phase 1: Foundation

- [ ] **Task 1: `quantizeToStep` — the shared rounding helper**

  **Description:** Add `quantizeToStep(value: number, min: number, step: number): number` to `src/utils/math.ts` (spec §1.1), alongside the existing `lerp`: `return min + Math.round((value - min) / step) * step`. Pure function, no imports beyond what's already there.

  **Acceptance criteria:**
  - [ ] `quantizeToStep(4.236, 0, 0.25)` returns `4.25` (rounds to nearest, not floor/ceil).
  - [ ] `quantizeToStep(0, 0, 0.25)` returns `0` (already on-grid, unchanged).
  - [ ] `quantizeToStep(-3, -12, 0.5)` returns a value on the `-12 + n*0.5` grid (negative `min`).
  - [ ] For any result, `(result - min) / step` is an integer within floating-point tolerance.

  **Verification:**
  - [ ] `npx vitest run src/utils/math.test.ts` passes — new `describe('quantizeToStep')` block added alongside the existing `describe('lerp')` block (the file already exists; not a new file).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/math.ts`, `src/utils/math.test.ts`

  **Estimated scope:** XS (one pure function, one test file already in place)

### Checkpoint: Foundation helper
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] `quantizeToStep` has no consumers yet and no dead-code lint warnings.
- [ ] Review with human before proceeding.

---

### Phase 2: Schema plumbing

- [ ] **Task 2: `SliderCenteredZeroSchema.step` + `SliderCenteredZero.tsx` wiring**

  **Description:** Add optional `step?: number` to `SliderCenteredZeroSchema` (`src/types/controls.ts`, spec §1.4/§4). Change `SliderCenteredZero.tsx:65`'s hardcoded `step={1}` to `step={schema.step ?? 1}`. No schema in the codebase sets `step` yet (that's Task 3) — this task is purely additive plumbing.

  **Acceptance criteria:**
  - [ ] `SliderCenteredZeroSchema` accepts an optional `step` field; every existing literal schema of this type (Detune ×3, Rate Drift, Depth Drift — none of which set `step`) still type-checks unchanged.
  - [ ] `SliderCenteredZero.tsx` reads `schema.step ?? 1` instead of the literal `1`.
  - [ ] With no `step` set on any schema yet, every `SliderCenteredZero` instance's drag behavior is byte-for-byte unchanged from before this task (still steps of `1`).

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx` passes (check during implementation whether this file exists; if not, existing coverage lives elsewhere — do not create a new test file just for this line unless no coverage exists at all).
  - [ ] `npx vitest run src/types/controls.test.ts` passes — existing `SliderCenteredZeroSchema` literals (none set `step`) still satisfy the type.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/components/ui/controls/SliderCenteredZero.tsx`

  **Estimated scope:** XS (one type field, one line)

- [ ] **Task 3: The 6 value/range edits, and every file that mirrors them**

  **Description:** Land all 6 confirmed schema/constant edits (spec §1.3, §4), plus the 6 mirroring files found during this planning pass so nothing is left stale:
  - **EQ3 Low/Mid/High** (`audioRigConfig.ts`): `step: 0.5` on all 3.
  - **Delay Time** (`audioRigConfig.ts`): `max: 1 → 10`, `step: 0.01 → 0.001`.
  - **Reverb Pre-Delay** (`audioRigConfig.ts`): `max: 0.5 → 1`.
  - **Compressor Attack** (`audioRigConfig.ts`): `max: 1 → 0.2`.
  - **LFO Rate** (`types/lfo.ts`'s `LFO_RATE_MAX`, `Lfo.tsx`'s `RATE_STEP`): `10 → 20`, `0.25 → 0.05`.
  - **Mirrors, found during planning:**
    - `src/types/globalAudio.ts`'s doc comments: `DelaySettings.delayTime` (`0 - 1` → `0 - 10`), `ReverbSettings.preDelay` (`0 - 0.5` → `0 - 1`), `CompressorSettings.attack` (`0.001 - 1` → `0.001 - 0.2`).
    - `src/data/audioRigConfig.test.ts`: the `delayTime is a linear slider, seconds, 0 to 1` test (title + `max: 1` → `max: 10`, line ~170), `preDelay is a linear slider, seconds, 0 to 0.5` (title + `max: 0.5` → `max: 1`, line ~200), `attack is a log slider, seconds, 0.001 to 1` (title + `max: 1` → `max: 0.2`, line ~80).
    - `src/data/globalAudioSeedRanges.test.ts`: `GLOBAL_AUDIO_SEED_RANGES['compressor.attack']` max `1 → 0.2` (line ~61), `['delay.delayTime']` max `1 → 10` (line ~71), `['reverb.preDelay']` max `0.5 → 1` (line ~75).
    - `src/types/lfo.test.ts`: `expect(LFO_RATE_MAX).toBe(10)` → `toBe(20)` (line ~86).
    - `docs/reference/GLOBAL_CHAIN_GRID.md`: Compressor Attack row's range (`0.001–1` → `0.001–0.2`); its own §61 prose ("both sit safely inside Tone's 0–1") needs rewording once Attack's range no longer reaches `1`.
    - `docs/reference/ROBOT_DATA_GRID.md`: LFO Rate row's range (`10 Hz` → `20 Hz`).

  **Note:** `globalAudioSeedRanges.ts`'s own `min`/`max` values for these 3 fields are NOT edited in this task — that file's `GLOBAL_AUDIO_SEED_RANGES` min/max entries get updated here (they mirror `audioRigConfig.ts` 1:1, same file the test in the bullet above asserts against), but its new `step` field and the 6 other fields' `step` values are Task 5's job, kept separate since Task 5 is about wiring quantization, not just updating a range.

  **Acceptance criteria:**
  - [ ] All 6 edits are live in their primary schema/constant location.
  - [ ] Every mirroring file listed above reflects the same new values — a grep for the old values (`max: 1` for Delay Time, `max: 0.5` for Reverb Pre-Delay, `max: 1` for Compressor Attack context, `toBe(10)` for `LFO_RATE_MAX`) in the listed files returns nothing.
  - [ ] No other field's value changes as a side effect.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/data/globalAudioSeedRanges.test.ts src/types/lfo.test.ts` passes with the updated expectations (this is the acceptance proof for the mirrored files — a test that still expects the *old* value must fail before the edit and pass after).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual doc review: `GLOBAL_CHAIN_GRID.md`/`ROBOT_DATA_GRID.md` read correctly against the shipped values.

  **Dependencies:** Task 2 (`SliderCenteredZeroSchema.step` must exist before EQ3's schema can set it).

  **Files:** `src/data/audioRigConfig.ts`, `src/types/lfo.ts`, `src/components/ui/controls/Lfo.tsx`, `src/data/globalAudioSeedRanges.ts` (min/max only), `src/types/globalAudio.ts`, `src/data/audioRigConfig.test.ts`, `src/data/globalAudioSeedRanges.test.ts`, `src/types/lfo.test.ts`, `docs/reference/GLOBAL_CHAIN_GRID.md`, `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** L (10 files, but every change is the same mechanical value edit — no new logic)

### Checkpoint: Schemas and values updated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Grep confirms no leftover old value (`10` for LFO_RATE_MAX, `1` for Delay Time's max, `0.5` for Reverb Pre-Delay's max, `1` for Compressor Attack's max) in any of Task 3's files.
- [ ] Review with human before proceeding.

---

### Phase 3: Engine correctness fix

- [ ] **Task 4: `globalFx.ts` — raise `Tone.FeedbackDelay`'s `maxDelay` to match Delay Time's new max**

  **Description:** `src/engine/audioEngine/globalFx.ts:71` constructs `Tone.FeedbackDelay` with `maxDelay: 1`, hardcoded to match Delay Time's old `max: 1` — `GLOBAL_CHAIN_GRID.md`'s own Delay section documents these two must stay in sync. Now that Task 3 raised Delay Time's max to `10`, `maxDelay` must become `10` too, or `delayTime` values above `1` second will be silently capped/misbehave inside the real Tone.js delay buffer.

  **Acceptance criteria:**
  - [ ] `_globalDelay = new DelayCtor({ delayTime: 0.25, feedback: 0.2, wet: 0, maxDelay: 10 })`.
  - [ ] The explanatory comment above the constructor (`// maxDelay is explicit on purpose: it must stay >= the max of ...`) is updated to reference the new value, not left describing the old `1`.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes — the existing `constructs Tone.FeedbackDelay with an explicit maxDelay of 1` test updated to assert `maxDelay: 10` (title + `toHaveBeenCalledWith(expect.objectContaining({ maxDelay: 10 }))`).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, drag Delay Time above 1 second (once the UI reflects the new max) and confirm the delay is audible and doesn't glitch/clip at the old 1-second boundary.

  **Dependencies:** Task 3 (needs the final Delay Time max value).

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** XS (one constructor argument, one comment, one test assertion)

### Checkpoint: Engine fix verified
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check (Task 4's own) confirms Delay Time is audible and correct above 1 second — not yet run.
- [ ] Review with human before proceeding.

---

### Phase 4: Quantization wiring (parallelizable — different files, no shared state)

- [ ] **Task 5: Global-chain generation quantization (`globalAudioSeedRanges.ts` + `globalAudioSeed.ts`)**

  **Description:** Add `step?: number` to `SeedRange` (`globalAudioSeedRanges.ts`, spec §1.5/§4), set it on the 9 fields with a real declared step (`eq3.low`/`mid`/`high`: `0.5`; `delay.delayTime`: `0.001`; `delay.feedback`/`delay.wet`/`reverb.preDelay`/`reverb.wet`: `0.01`; `compressor.ratio`: `1`). In `globalAudioSeed.ts`'s `sampleField`, quantize the result against `GLOBAL_AUDIO_SEED_RANGES[key].min`/`.step` when `.step` is set (never against the narrower loading-range min). In `generateGlobalLfoSettings`, quantize `rate` against `LFO_RATE_MIN`/a new mirrored `LFO_RATE_STEP = 0.05` constant; leave `depth` unquantized (no declared step). In `generatePingVarianceAutomation`, quantize in percent-space: `quantizeToStep(raw * 100, 0, 1) / 100`.

  **Acceptance criteria:**
  - [ ] Every `sampleField`-driven field with a `step` (via `generateGlobalAudioSettings`, checked across many seeds) always returns a value on that field's `min + n*step` grid.
  - [ ] Fields without a `step` (`compressor.threshold`, `filterLPF.frequency`, etc.) are byte-for-byte unaffected — same value as before this task for the same seed (regression, not just "still works").
  - [ ] `generateGlobalLfoSettings`'s `rate` is always step-aligned to `0.05` (excluding the `quiet → 0` case, trivially aligned).
  - [ ] `generatePingVarianceAutomation`'s result, ×100, is always an integer percent.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts` passes — new assertions for `eq3.low`, `delay.delayTime`, `compressor.ratio` (step-aligned across many seeds), a regression assertion for at least one no-step field, and the Rate/Ping-Variance-Automation alignment checks above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (`quantizeToStep`), Task 3 (final min/max/step values).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** M (2 source files + their shared test file, one coherent mechanism)

- [ ] **Task 6: Robot-level generation quantization (`spawnSystem.ts`)**

  **Description:** Three call sites in `spawnSystem.ts` (spec §1.5/§4), each with its own mirrored step constant (`LFO_RATE_STEP = 0.05`, `LAYER_GAIN_STEP = 0.01`, `VOLUME_STEP_PERCENT = 1`): `generateAudioAttributes`'s per-layer `gain` (only the `!quiet` branch — a muted layer's gain must stay the literal `0`, never run through `quantizeToStep`), `generateRobotLfoSettings`'s per-target `rate` (excluding the `quiet → 0` case), and `spawnRobot`'s `masterVolume` (percent-space: `quantizeToStep(raw * 100, 0, 1) / 100`, same unit-conversion shape as Ping Variance Automation in Task 5).

  **Acceptance criteria:**
  - [ ] A non-muted layer's `gain`, across many seeds, is always step-aligned to `0.01`.
  - [ ] A muted layer's `gain` is still exactly `0` — never passed through `quantizeToStep`.
  - [ ] `generateRobotLfoSettings`'s `rate`, across many seeds and targets, is always step-aligned to `0.05` (excluding quiet/`0`).
  - [ ] A spawned robot's `masterVolume × 100` is always an integer percent, across many seeds.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` passes — new assertions for all 3 fields above, plus a regression check that a muted layer's gain is unaffected.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (`quantizeToStep`), Task 3 (`LFO_RATE_MIN` unchanged but `LFO_RATE_STEP` needs the final `0.05`).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (1 file, 3 well-isolated call sites)

### Checkpoint: Quantization wired
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Full suite run (`npx vitest run`) — no regressions in any file referencing `LFO_RATE_MAX`/`LFO_RATE_MIN` outside the ones already updated (`lfoEngine.test.ts`, `lfoConfig.test.ts`, `AudioEngine.test.ts` — these use relative comparisons like `toBeLessThanOrEqual`, not hardcoded `10`, per this planning pass's own check, but re-run to confirm rather than assume).
- [ ] Manual check: `npm run dev`, reseed several Attenuation Styles and confirm the Audio Rig's EQ3/Delay Time/Compressor Ratio values always land on a visible slider tick; spawn/reseed a locale several times and confirm a robot's Signature Array Gain, per-layer LFO Rate, and Volume all load on values reachable by dragging their own sliders.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs

- [ ] **Task 7: `docs/reference/SLIDER_VALUES.md` — refresh footnotes for the now-quantized fields**

  **Description:** Update the per-field footnotes that currently describe unrounded/off-grid loading behavior for every field this plan quantizes (EQ3, Delay Time, Delay Feedback/Wet, Reverb Pre-Delay/Wet, Compressor Ratio, Volume, Ping Variance Automation, Signature Array Gain, LFO Rate) to reflect the corrected behavior. Update the Min/Max/Step columns for Delay Time, Reverb Pre-Delay, Compressor Attack, and LFO Rate to their shipped values (already partly done by Crawford's own edits during the Specify pass — confirm they match the final shipped code exactly). Leave the still-unrounded fields' footnotes (Density, Sustain, Pitch Repeat, Compressor Threshold/Knee, Limiter Threshold, LFO Depth) as-is.

  **Acceptance criteria:**
  - [ ] Every footnote describing a now-fixed field reflects quantized behavior, not the old bug description.
  - [ ] The file's own opening note (currently describing the bug class as universally present) is reworded to reflect that it's now fixed for explicit-step fields, still present for implicit-default ones.
  - [ ] Column values for the 4 range-edited fields match the shipped schemas exactly (spot-check against Task 3's final code).

  **Verification:**
  - [ ] Manual review — spot-checked against the shipped source.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change, no behavioral impact — `npm test`/`npm run build` already verified clean at the prior checkpoint).

  **Dependencies:** Task 3, Task 4, Task 5, Task 6 (documents their final, shipped state).

  **Files:** `docs/reference/SLIDER_VALUES.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 7 tasks are met, including the manual checks under Tasks 4 and 6.
- [ ] `docs/reference/SLIDER_VALUES.md` reflects the shipped behavior.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `maxDelay` fix (Task 4) is skipped or landed out of order, leaving `delayTime` values above 1s silently misbehaving in the real Tone.js delay buffer | High — an audible correctness bug, not a cosmetic one, and easy to miss since nothing in the UI would visibly signal it | Given its own task with an explicit manual check (drag Delay Time above 1s, confirm no clip/glitch) rather than folded into the larger schema-edit task where it could be missed in review |
| One of the 6 mirroring files found during planning (Task 3) is missed, leaving a stale hardcoded value that either fails a test or silently drifts from the real schema | Medium — a failed test is self-catching; a stale doc (`GLOBAL_CHAIN_GRID.md`/`ROBOT_DATA_GRID.md`) is not, and could mislead a future reader the same way this spec's own predecessor documents were found stale | Task 3's acceptance criteria require a grep for each old value across the listed files, not just "the tests pass" — a passing test suite doesn't catch a stale *doc* |
| Quantizing a percent-space field (Volume, Ping Variance Automation) directly against its stored fraction instead of in percent-space first | High if it happens — would quantize to the wrong grid (hundredths of a fraction, not whole percent), silently reintroducing a subtler version of the same bug this whole plan exists to fix | Task 6/Task 5's own acceptance criteria specify the `× 100` / `÷ 100` conversion explicitly, not just "quantize this value" |
| A muted Signature Array layer's `gain` (`0`) gets accidentally run through `quantizeToStep` and ends up at a nonzero value | Medium — `quantizeToStep(0, 0, 0.01)` happens to still return `0`, so this specific bug wouldn't manifest with today's constants, but the code shape (an `if` that doesn't clearly separate "muted" from "quantized") could still hide a real bug on the next change | Task 6's acceptance criteria explicitly require a regression check that a muted layer's gain stays exactly `0`, not just that non-muted gains are aligned |
| Existing tests elsewhere hardcode `LFO_RATE_MAX`'s old value (`10`) outside the files this plan checked | Low — this planning pass grepped every `LFO_RATE_MAX` reference in `src/` and found only `types/lfo.test.ts` hardcodes it directly; every other reference (`lfoEngine.test.ts`, `lfoConfig.test.ts`, `globalAudioSeed.test.ts`, `spawnSystem.test.ts`) uses a relative comparison (`toBeLessThanOrEqual`, `midpointRate = (MIN+MAX)/2`) that adapts automatically | Full suite run at the Phase 4 checkpoint re-verifies this rather than trusting the planning-time grep alone |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **Whether `GLOBAL_CHAIN_GRID.md` needed updating for the 5 range/max edits** — resolved during this planning pass: yes, for Compressor Attack's range and its own "sits safely inside Tone's 0–1" prose (Task 3). EQ3/Delay Time/Reverb Pre-Delay's entries in that doc don't state a step, so no further edit needed there beyond Compressor Attack.
2. **Whether any test hardcodes `LFO_RATE_MAX`'s old value outside `spawnSystem.test.ts`/`globalAudioSeed.test.ts`** — resolved during this planning pass (see Risks table): only `types/lfo.test.ts` does; added to Task 3.
3. **Whether `audioRigConfig.ts`/`controls.ts` have their own dedicated test files** — resolved during this planning pass: both exist (`audioRigConfig.test.ts`, `controls.test.ts`); folded into Tasks 2 and 3 respectively.
