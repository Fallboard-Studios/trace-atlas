# Implementation Plan: Architecture & Components (Roadmap Phase 1)

Source spec: [docs/specs/ARCHITECTURE_AND_COMPONENTS.md](../specs/ARCHITECTURE_AND_COMPONENTS.md). Source intent: [docs/intent/architecture-and-components.md](../intent/architecture-and-components.md). Source field data: [docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md).

## Overview

Build the `ControlSchema` type foundation and all 13 stateless UI primitives that every later drawer phase (Audio Rig, Sector Settings, Robot Options) depends on, plus `docs/COMPONENT_LIBRARY.md`. No real domain config file is written this phase, and nothing wires into the existing robot editor — verification is unit tests plus an informal by-eye comparison against `RobotAudioTab.tsx`'s still-live sliders/steppers. One new dependency, `@radix-ui/react-accordion`, is added for `AccordionContainer` only.

## Architecture Decisions

- **`DualLabel` is sequenced immediately after the type module, ahead of every other primitive** — refining the spec's "Button, Toggle, TextInput, DualLabel, no sub-dependencies" grouping (§2), which understated a real dependency: all 12 other primitives compose `DualLabel` internally for their own label rendering (spec §3), so it must exist first. This is a dependency-graph correction, not a scope change.
- **`controls.ts` gets a `CONTROL_SCHEMA_TYPES` const array** alongside the `ControlSchema` union, mirroring `src/types/lfo.ts`'s established pattern (`LFO_SHAPES`, `ROBOT_LFO_TARGET_IDS`) of pairing every union type with a `readonly` array of its members — makes "all 13 discriminants are covered, no duplicates" a real runtime-testable assertion instead of a compile-time-only property.
- **`SliderLog`'s curve formula, resolved now (spec §7 Q1):** Attack/Decay/Release all have `min = 0`, which breaks a pure `value = min * (max/min)^t` exponential (undefined at `min = 0`). Resolved as: internal Radix track position `t ∈ [0, 1]`; displayed value is exactly `min` at `t = 0`, otherwise `floor * (max/floor)^t` where `floor = Math.max(min, LOG_EPSILON)` and `LOG_EPSILON = 0.001`. This gives an exact `min` endpoint and a genuine log curve everywhere else, with the inverse mapping (value → `t`, for controlled re-renders) using the same floor.
- **`SliderCenteredZero`'s zero-anchored fill, resolved now (spec §7 Q2):** the zero point's track position is computed generally as `(0 - min) / (max - min) * 100%` (not hardcoded to 50%, so it still works if a future schema has asymmetric bounds like `-20`/`+50`). Radix's own `Slider.Range` is rendered visually hidden (kept in the DOM for structural/a11y parity); a custom absolutely-positioned fill `<div>` spans from the zero point to the thumb's position, with its `left`/`width` computed inline (the code style's documented exception to "no inline style objects").
- **`AccordionContainer` is a single independent collapsible section, not a group coordinator (spec §7 Q3, now resolved directly in the spec):** wraps one Radix `Accordion.Root type="single" collapsible` + one `Item`. A drawer wanting several independently-open sections renders multiple `AccordionContainer` instances — already true for free, no `type` prop or cross-instance coordination needed.
- **`Lfo`'s value type reuse of `LfoSettings` (spec §7 Q4) is confirmed safe:** it's a type-only import (`import type`), no runtime dependency on `lfoEngine.ts` or any Tone object — doesn't violate presentation-only scope.
- **Test fixtures stay inline per test file** (spec §5) — no shared fixture module, so nothing built this phase is later mistaken for a real domain config by a future phase skimming `src/data/`.

## Dependency Graph

```
Task 1 (types/controls.ts + CONTROL_SCHEMA_TYPES)
    │
    └── Task 2 (DualLabel) ──────────────────────────────────────────────┐
            │                                                            │
            ├── Task 3 (Button)                                         │
            ├── Task 4 (Toggle) ───────────────┐                        │
            ├── Task 5 (TextInput) ──┐          │                        │
            │                        │          │                        │
            ├── Task 6 (Stepper) ────┼──→ Task 7 (StepperWithToggle)     │
            ├── Task 8 (RadioButton) │                                   │
            ├── Task 9 (SliderLinear)│                                   │
            ├── Task 10 (SliderLog)  │                                   │
            ├── Task 11 (SliderCenteredZero)                             │
            │                        │                                   │
            ├── Task 12 (CoordsInput, needs Task 5) ←───────────────────┘
            ├── Task 13 (AccordionContainer, adds @radix-ui/react-accordion)
            └── Task 14 (Lfo, needs Task 4, 8, 9)

Tasks 1–14 ──→ Task 15 (docs/COMPONENT_LIBRARY.md + CLAUDE.md reference-list entry)
```

## Task List

### Phase 1: Schema foundation

- [x] **Task 1: `src/types/controls.ts` — `ControlSchema` discriminated union**

  **Description:** Define `ControlSchemaBase` (`id`, optional `loreLabel`/`humanLabel`) and one interface per variant per spec §4 (`StepperSchema`, `StepperWithToggleSchema`, `SliderLinearSchema`, `SliderLogSchema`, `SliderCenteredZeroSchema`, `RadioButtonSchema`, `ToggleSchema`, `TextInputSchema`, `CoordsInputSchema`, `ButtonSchema`, `DualLabelSchema`, `AccordionSchema`, `LfoSchema`), the `ControlSchema` union, `LfoValue` (`LfoSettings & { active: boolean }`), and a `CONTROL_SCHEMA_TYPES` const array of all 13 discriminant strings.

  **Acceptance criteria:**
  - [x] All 13 variants exist with exactly the fields specified in spec §4 (bounds only where the grid specifies them: e.g. `RadioButtonSchema.options`, `SliderCenteredZeroSchema.min`/`max`).
  - [x] `loreLabel`/`humanLabel` are optional on every variant (via `ControlSchemaBase`).
  - [x] `LfoValue` extends the real `LfoSettings` from `src/types/lfo.ts` via `import type` — no engine import.
  - [x] `CONTROL_SCHEMA_TYPES` has exactly 13 entries, no duplicates, matching the union's discriminants exactly.

  **Verification:**
  - [x] `npx vitest run src/types/controls.test.ts` — asserts `CONTROL_SCHEMA_TYPES` length/uniqueness, and that one literal object per variant type-checks against `ControlSchema`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts`

  **Estimated scope:** S (1 file, types only + a small const array)

### Checkpoint: Schema foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [x] Review with human before proceeding.

---

### Phase 2: Universal label primitive

- [x] **Task 2: `DualLabel` component**

  **Description:** Render 0, 1, or 2 of `loreLabel`/`humanLabel` per spec §4's sketch — renders `null` when neither is present, otherwise only the span(s) for whichever prop(s) are supplied. This is the primitive every other component in this phase composes internally, so it lands before any of them.

  **Acceptance criteria:**
  - [x] Renders nothing (no wrapping `<div>`) when both `loreLabel` and `humanLabel` are omitted.
  - [x] Renders only the lore span when only `loreLabel` is present, only the human span when only `humanLabel` is present, and both when both are present.
  - [x] Zero hardcoded text — every rendered string comes from props.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/DualLabel.test.tsx` — covers all 3 presence cases (neither/one/both) explicitly.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/DualLabel.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S (1 component, 3 files)

### Checkpoint: Universal label primitive
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [x] Review with human before proceeding.

---

### Phase 3: Base atoms

- [x] **Task 3: `Button` component**

  **Description:** Schema-driven button per `ROBOT_DATA_GRID.md`'s "Reset Melody | CALIBRATE PING | Button Component" row — composes `DualLabel` for its own `loreLabel`/`humanLabel`, calls an `onClick` prop, no internal state.

  **Acceptance criteria:**
  - [x] Renders its own schema's `loreLabel`/`humanLabel` via an internally-composed `<DualLabel />`.
  - [x] Calls `onClick` exactly once per click; no internal state.
  - [x] Accessible name resolves from `humanLabel` (falling back to `loreLabel`) via `aria-label`, when either is present.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Button.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/Button.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 4: `Toggle` component**

  **Description:** Binary ON/OFF control per the grid's "Layer Active"/"LFO Active" rows, wrapping the already-installed `@radix-ui/react-switch` (not `@radix-ui/react-toggle` — spec §3). Controlled `value: boolean` / `onChange(value: boolean)`.

  **Acceptance criteria:**
  - [x] Renders `role="switch"` with `aria-checked` reflecting the controlled `value` prop — never manages its own selection state.
  - [x] Calls `onChange(!value)` on click and on keyboard activation (Radix `Switch` provides the latter natively).
  - [x] Renders its own schema's labels via internally-composed `<DualLabel />`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Toggle.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/Toggle.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 5: `TextInput` component**

  **Description:** Plain schema-driven text input (`placeholder?`, `maxLength?`), controlled `value: string` / `onChange(value: string)`. This is `CoordsInput`'s (Task 12) building block, per Phase 5's roadmap About text explicitly naming `TextInput` among Sector Settings' primitives.

  **Acceptance criteria:**
  - [x] Renders `placeholder` from schema (not hardcoded) when present.
  - [x] Respects `maxLength` from schema when present (native `maxLength` attribute).
  - [x] Calls `onChange` with the raw string value on every keystroke; no internal buffering.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/TextInput.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/TextInput.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

### Checkpoint: Base atoms
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [x] By-eye sanity check: nothing yet to compare against the robot editor (no numeric/bounded controls built yet) — skip this checkpoint's manual step, resume it from Phase 4 onward.
- [x] Review with human before proceeding.

---

### Phase 4: Bounded numeric & choice controls

- [x] **Task 6: `Stepper` component**

  **Description:** Integer +/- control per the grid's Density (1–16), Motif Length (1–8), and Octave Range Min/Max (1–7) rows — each octave bound is its own independent `Stepper` instance, matching the grid's two separate rows (no paired min/max composite needed). Controlled `value: number` / `onChange(value: number)`, clamps to `min`/`max`, steps by `step` (default 1).

  **Acceptance criteria:**
  - [x] Increment/decrement controls step by `schema.step ?? 1` and clamp at `min`/`max` — never call `onChange` with an out-of-bounds value.
  - [x] Renders its own schema's labels via `<DualLabel />`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Stepper.test.tsx` — covers clamping at both bounds using the grid's own Density (1–16) and Motif Length (1–8) ranges as fixtures.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/Stepper.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 7: `StepperWithToggle` component**

  **Description:** Composes `Toggle` + `Stepper` for the grid's Note Variance row ("Toggle OFF: unweighted random selection. Toggle ON: slices pitch array length 1–8"). Controlled value shape `{ active: boolean; value: number }`; the `Stepper` is rendered disabled (non-interactive) when `active` is `false`.

  **Acceptance criteria:**
  - [x] Renders an actual `<Toggle />` and `<Stepper />` (imported, not reimplemented) — a test asserts both sub-components' interactive elements are present.
  - [x] `Stepper`'s control is disabled when `value.active` is `false`, enabled when `true`.
  - [x] `onChange` is called with the full `{ active, value }` shape on either the toggle or the stepper changing.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/StepperWithToggle.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4, Task 6.

  **Files:** `src/components/ui/controls/StepperWithToggle.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 8: `RadioButton` component**

  **Description:** Single-select control per the grid's Audio Setting/Layer Type/LFO Shape rows, wrapping the already-installed `@radix-ui/react-toggle-group` (`type="single"`) — matching `RobotAudioTab.tsx`'s existing Audio Mode pattern (spec §3), not a new `@radix-ui/react-radio-group` dependency. Controlled `value: string` / `onChange(value: string)`, options from `schema.options`.

  **Acceptance criteria:**
  - [x] Renders one `ToggleGroup.Item` per `schema.options` entry, with exactly one marked pressed/selected matching `value`.
  - [x] Calls `onChange(newValue)` on selection; a deselect-to-empty event (Radix's single-mode behavior) is guarded and does **not** call `onChange` — matching `RobotAudioTab.tsx`'s existing `if (value) handle...` guard.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` — uses the grid's LFO Shape options (TRIANGLE/SINE/SQUARE/SAWTOOTH) as a fixture.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/RadioButton.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 9: `SliderLinear` component**

  **Description:** Linear-scale slider per spec §4's full code example, wrapping `@radix-ui/react-slider`. Controlled `value: number` / `onChange(value: number)`, `unit?` renders a trailing value label.

  **Acceptance criteria:**
  - [x] Matches spec §4's example exactly in shape (`schema`/`value`/`onChange` props, `DualLabel` composed internally).
  - [x] Respects `min`/`max`/`step` from schema.
  - [x] Renders `{value}{unit}` only when `schema.unit` is present.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/SliderLinear.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 10: `SliderLog` component**

  **Description:** Logarithmic-scale slider per the grid's Attack/Decay/Release rows (0s–10s, "Logarithmic scaling"), implementing this plan's resolved epsilon-floor curve (`LOG_EPSILON = 0.001`, exact `min` at `t = 0`, `floor * (max/floor)^t` otherwise). Internal Radix track operates on normalized `t ∈ [0, 1]`; the wrapper converts `t ↔ value` both ways.

  **Acceptance criteria:**
  - [x] `t = 0` maps to exactly `schema.min` (including the `min = 0` case) — not `LOG_EPSILON`.
  - [x] The value→`t`→value round-trip is accurate within floating-point tolerance across the full range.
  - [x] The midpoint (`t = 0.5`) is **not** the arithmetic mean of `min`/`max` (proves genuine log spacing, not linear) — asserted exactly, per the pattern `globalAudioSeed.test.ts` already uses for `scaleUnitValue`'s log/linear distinction, not statistically.
  - [x] `onChange` receives the mapped display value, never the raw internal `t`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` — uses the grid's Attack/Decay/Release bounds (0s–10s) as the `min = 0` fixture.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/SliderLog.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** M (the epsilon-floor mapping is genuinely novel math for this codebase, not a copy of an existing pattern)

- [x] **Task 11: `SliderCenteredZero` component**

  **Description:** Zero-anchored slider per the grid's Detune rows (-50/+50 cents), implementing this plan's resolved custom-fill approach: Radix's own `Slider.Range` rendered visually hidden; a custom fill `<div>` positioned via inline style, spanning from the computed zero point (`(0 - min) / (max - min) * 100%`) to the thumb's position.

  **Acceptance criteria:**
  - [x] `value = 0` renders a zero-width (or negligible) fill.
  - [x] Positive values fill from the zero point rightward; negative values fill from the zero point leftward.
  - [x] The zero-point calculation is verified against an asymmetric-bounds fixture (e.g. `-20`/`+50`), not just the grid's symmetric `-50`/`+50`, to prove it isn't hardcoded to 50%.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** M (custom fill math beyond what Radix provides out of the box)

### Checkpoint: Bounded numeric & choice controls
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] By-eye check: `Stepper`, `SliderLinear`/`SliderLog`/`SliderCenteredZero` compared informally against `RobotAudioTab.tsx`'s still-live density/motif/octave/note-variance sliders — no code changes to that file.
- [x] Review with human before proceeding.

---

### Phase 5: Composites

- [x] **Task 12: `CoordsInput` component**

  **Description:** X/Y coordinate entry composing two `TextInput` instances, per Phase 5's roadmap About text. Controlled value `{ x: number; y: number }` / `onChange({ x, y })`; each `TextInput` handles its raw string, `CoordsInput` parses to number before calling `onChange`. Presentation only — no round-number/low-entropy guard (spec §3; that's Phase 5's job).

  **Acceptance criteria:**
  - [x] Renders two actual `<TextInput />` instances (not reimplemented raw `<input>`s).
  - [x] Calls `onChange({ x, y })` with parsed numbers on either field changing.
  - [x] A non-numeric entry does not throw and does not call `onChange` with `NaN`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CoordsInput.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/ui/controls/CoordsInput.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S

- [x] **Task 13: `AccordionContainer` component**

  **Description:** Adds `@radix-ui/react-accordion` (^1.2.20) to `package.json` — the one new dependency this phase, confirmed with the user. Wraps a single Radix `Accordion.Root type="single" collapsible` + one `Item` per this plan's resolved architecture decision (independent single-section collapsible, not a group coordinator). Expand/collapse animates via `useGSAP` + `timelineMap` (`setTimeline`/`killTimeline`), following `PowerRockerSwitch.tsx`'s pattern, respecting `prefers-reduced-motion` the same way `PowerRockerSwitch.css` does.

  **Acceptance criteria:**
  - [x] `npm install @radix-ui/react-accordion` completes; `package.json`/`package-lock.json` updated.
  - [x] Toggles `aria-expanded` on its trigger when clicked.
  - [x] Registers a GSAP timeline via `setTimeline` on expand/collapse and calls `killTimeline` on unmount (mocked in tests, matching `PowerRockerSwitch.test.tsx`'s mocking pattern).
  - [x] Under `prefers-reduced-motion: reduce`, the section still opens/closes but the transition snaps instead of animating.
  - [x] Renders its own schema's title via `<DualLabel />` in the trigger.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/AccordionContainer.test.tsx`.
  - [x] `npm run build:types`, `npm run lint`, `npm run build` clean (confirms the new dependency resolves cleanly in the production bundle too).

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/AccordionContainer.tsx`, `.css`, `.test.tsx`, `package.json`, `package-lock.json`

  **Estimated scope:** M (new dependency + GSAP timeline lifecycle, both novel surface for this component)

- [x] **Task 14: `Lfo` component**

  **Description:** Composes `RadioButton` (shape) + two `SliderLinear`s (rate, depth) + `Toggle` (active) per the grid's OSCILLATION rows. Controlled value is `LfoValue` (`LfoSettings & { active: boolean }`, from Task 1) — a type-only reuse of the real Phase 0 engine type, no engine wiring.

  **Acceptance criteria:**
  - [x] Renders actual `<RadioButton />`, `<SliderLinear />` (×2), and `<Toggle />` instances (not reimplemented).
  - [x] `RadioButton`'s options match `LFO_SHAPES` from `src/types/lfo.ts` (triangle/sine/square/sawtooth) — imported, not re-listed as literals.
  - [x] Rate/depth sliders' bounds match `LFO_RATE_MIN/MAX` and `LFO_DEPTH_MIN/MAX` from `src/types/lfo.ts` — imported, not re-hardcoded.
  - [x] `onChange` receives a complete `LfoValue` on any sub-control changing.
  - [x] No import of `src/engine/lfoEngine.ts` or any `Tone` object — type-only coupling, confirmed by this test file having zero engine mocks to set up.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Lfo.test.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4, Task 8, Task 9.

  **Files:** `src/components/ui/controls/Lfo.tsx`, `.css`, `.test.tsx`

  **Estimated scope:** S (composition only — every sub-control it uses is already built and tested)

### Checkpoint: Composites
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All 13 primitives + `controls.ts` exist and are individually tested.
- [x] Review with human before proceeding.

---

### Phase 6: Docs

- [x] **Task 15: `docs/COMPONENT_LIBRARY.md` + CLAUDE.md reference-list entry**

  **Description:** Document all 13 primitives (props, the schema variant each consumes) and the `ControlSchema` contract, including the accent-tier CSS token list (spec §3's Phase-10 Forward Note requirement — any `--control-*` tokens introduced by Tasks 2–14, or "none introduced" if none were needed). Add `docs/COMPONENT_LIBRARY.md` to CLAUDE.md's reference doc list.

  **Acceptance criteria:**
  - [x] Every one of the 13 primitives has a documented prop signature and its corresponding `ControlSchema` variant, cross-referenced against `ROBOT_DATA_GRID.md`'s rows.
  - [x] The `DualLabel`-composition rule (every primitive renders its own schema's labels, no separate label schema) is stated explicitly, not left implicit.
  - [x] Any new CSS custom property introduced during Tasks 2–14 is listed with its accent-tier classification; if none were introduced, the doc says so explicitly rather than omitting the section.
  - [x] CLAUDE.md's reference doc list includes `docs/COMPONENT_LIBRARY.md`.

  **Verification:**
  - [x] Manual review — every documented prop signature spot-checked against the actual shipped source, not reconstructed from memory (matching `LFO_INTEGRATION_PLAN.md` Task 15's own verification method).
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, but confirms nothing else broke).

  **Dependencies:** Tasks 1–14.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `CLAUDE.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 15 tasks are met.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped API — every signature spot-checked against source.
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `SliderLog`'s epsilon-floor curve (Task 10) is genuinely novel math for this codebase — no existing pattern to copy | Medium — could introduce subtle rounding/round-trip bugs | Isolated to one task with explicit exact-value (not statistical) acceptance criteria at both endpoints and the midpoint, following the same exact-math testing style `globalAudioSeed.test.ts` already established for log-vs-linear proof |
| `SliderCenteredZero`'s custom fill (Task 11) bypasses Radix's default `Range` rendering | Medium — custom positioning math is easy to get subtly wrong at the boundaries | Tested against both the grid's symmetric fixture (-50/+50) and a deliberately asymmetric one (-20/+50) so the zero-point formula can't silently hardcode 50% |
| `AccordionContainer` (Task 13) is the only task adding a new dependency and the only one touching `package.json` | Low | Isolated to its own task; `npm run build` verification specifically confirms the new dependency resolves cleanly in the production bundle, not just in dev |
| 13 components × 3 files each is a lot of small, similar-shaped work — risk of drift from the spec's exact prop shapes over that many tasks | Low | Task 9 (`SliderLinear`) is checked explicitly against spec §4's full code example; every other component task cites its exact `ROBOT_DATA_GRID.md` row(s) so acceptance criteria trace to source, not memory |

## Open Questions

None remaining from the spec — all four items in spec §7 are resolved: Q1 (SliderLog curve) and Q2 (SliderCenteredZero fill) into this plan's Architecture Decisions and Tasks 10–11's acceptance criteria; Q3 (Accordion single-vs-multiple) resolved directly in the spec itself as "not a group coordinator"; Q4 (Lfo/LfoSettings coupling) confirmed safe as a type-only import.
