# Implementation Plan: Vertical Slider Orientation

Source spec: [docs/specs/VERTICAL_SLIDERS.md](../specs/VERTICAL_SLIDERS.md). Source intent: [docs/intent/vertical-sliders.md](../intent/vertical-sliders.md). Pure presentation change — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `value`/`onChange` contract change on any of the 3 slider primitives. Every task below either adds a type/hook with no consumer yet, teaches one existing component to read a field it already ignores, or sets inert config data — none touch audio scheduling or animation.

## Overview

Add a required `orientation: 'horizontal' | 'vertical' | 'auto'` field to `SliderLinearSchema`/`SliderLogSchema`/`SliderCenteredZeroSchema`, classify every real slider in the app per the spec's table, and teach `SliderLinear`/`SliderLog`/`SliderCenteredZero` to actually render all three values — `'vertical'` as a 256px (overridable) Radix vertical slider with label→value→track ordering, `'auto'` resolved via a new `ResizeObserver`-backed hook that measures each slider's parent element. No drawer layout work (explicitly out of scope per the confirmed intent) — once the 3 components ship, every real consumer (`AudioRigDrawer`, `SignatureArrayDrawer`, etc.) picks up the correct orientation automatically, since they already just pass schemas straight through.

## Architecture Decisions

- **The required-field migration is split into 3 small, always-green steps instead of one wide task.** Making `orientation` a *required* field is, by nature, atomic — TypeScript won't compile with only some of the 8 files that construct these schema literals updated, so no split of "flip to required + fix every site" leaves a working build partway through. Rather than accept one 8-file task (violates the "≤5 files, buildable at each step" guideline), this plan uses a widen-then-narrow sequence long used for this exact kind of migration: **Task 1** adds `orientation` as *optional* (compiles everywhere, changes nothing), **Task 2** fills in the real, final value everywhere it's actually known (still optional, so nothing breaks if a site is momentarily missed), **Task 3** flips the modifier to required — a 1-file, almost mechanical change that only succeeds because Tasks 1-2 already made it safe. Every step keeps `npm run build:types` clean.
- **The real classification lands in Task 2, not deferred to a later "wire it up" task — because the field has zero runtime effect until Phase 2 ships.** Nothing reads `schema.orientation` until `useAutoSliderOrientation` (Task 4) and the 3 components (Tasks 5-7) exist, so setting `eq3.low`'s orientation to `'vertical'` in Task 2 changes no pixel on screen at that point. This means there is no separate "apply the classification table" task later — the payoff (EQ actually rendering vertical, LFO/filter/etc. actually resolving auto) arrives for free the moment Tasks 5-7 land, exactly matching spec §2's "every consumer needs zero code changes."
- **`useAutoSliderOrientation` (Task 4) lands alone before any component consumes it**, same "shared foundation first" precedent `docs/tasks/LFO_CONSOLIDATED_DISPLAY.md` used for `useLfoTargetGroup`.
- **The 3 slider components (Tasks 5-7) are independent vertical slices once Task 4 lands — none imports another, so they can be built/reviewed/merged in any order, including in parallel.** Sequenced `SliderLinear → SliderLog → SliderCenteredZero` here only because `SliderLinear` is the simplest (no internal value-mapping math) and establishes the shared JSX/CSS pattern once; `SliderLog` repeats it verbatim; `SliderCenteredZero` repeats it plus the fill-axis remap (spec §1.3). `index.css`'s new `--slider-vertical-height` token is added in Task 5 (first consumer) and simply reused, unchanged, by Tasks 6-7.
- **Docs (Task 8) land last**, once the 3 components' final shipped shape is real and spot-checkable — same precedent as `docs/tasks/LFO_CONSOLIDATED_DISPLAY.md`'s own Task 6.

## Dependency Graph

```
Task 1 (SliderOrientation type, optional field)
    │
    ├──→ Task 2 (real classification: audioRigConfig.ts, robotOptionsConfig.ts, Lfo.tsx)
    │         │
    │         └──→ Task 3 (flip orientation to required)
    │                   │
    │                   └──→ Task 4 (useAutoSliderOrientation hook)
    │                             │
    │                             ├──→ Task 5 (SliderLinear + --slider-vertical-height token)
    │                             ├──→ Task 6 (SliderLog)
    │                             └──→ Task 7 (SliderCenteredZero + fill-axis doc note)
    │
    Task 5, Task 6, Task 7 ──→ Task 8 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — the type, the data, then the guarantee

- [ ] **Task 1: `SliderOrientation` type — optional field, zero behavior change**

  **Description:** In `src/types/controls.ts`, add `export type SliderOrientation = 'horizontal' | 'vertical' | 'auto';` and add `orientation?: SliderOrientation` (optional, for now) to `SliderLinearSchema`, `SliderLogSchema`, and `SliderCenteredZeroSchema`. In `src/types/controls.test.ts`, add `orientation: 'horizontal'` to the existing `sliderLinear`/`sliderLog`/`sliderCenteredZero` literal fixtures, plus one new assertion that `SliderOrientation` accepts all 3 literal values. In `SliderLinear.test.tsx`/`SliderLog.test.tsx`/`SliderCenteredZero.test.tsx`, add `orientation: 'horizontal'` to each file's own schema fixture(s) (prep for Task 3's required flip — harmless now since the field is still optional).

  **Acceptance criteria:**
  - [ ] `SliderOrientation` is exported from `src/types/controls.ts` as `'horizontal' | 'vertical' | 'auto'`.
  - [ ] All 3 slider schema interfaces have an optional `orientation?: SliderOrientation` field.
  - [ ] No other schema type (`StepperSchema`, `ToggleSchema`, etc.) gains this field — it's specific to the 3 slider variants.
  - [ ] Every schema literal in `controls.test.ts`, `SliderLinear.test.tsx`, `SliderLog.test.tsx`, `SliderCenteredZero.test.tsx` that omitted the field before still compiles (it's optional) and now explicitly sets `orientation: 'horizontal'`.
  - [ ] No component, config file, or rendering logic changes — this task only touches types and test fixtures.

  **Verification:**
  - [ ] `npx vitest run src/types/controls.test.ts src/components/ui/controls/SliderLinear.test.tsx src/components/ui/controls/SliderLog.test.tsx src/components/ui/controls/SliderCenteredZero.test.tsx` passes.
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts`, `src/components/ui/controls/SliderLinear.test.tsx`, `src/components/ui/controls/SliderLog.test.tsx`, `src/components/ui/controls/SliderCenteredZero.test.tsx`

  **Estimated scope:** M (5 files, but every edit is a single added line — no logic)

- [ ] **Task 2: Apply the real `orientation` classification**

  **Description:** Set the final `orientation` value (spec §1.1's table) on every real slider schema literal in `src/data/audioRigConfig.ts` (`eq3.low/mid/high` → `'vertical'`; `filterLPF`/`filterHPF`'s `frequency`/`Q`, `delay`'s 3 params, `reverb`'s 3 params, `compressor`'s 4 slider params (not `ratio`, a `StepperSchema`), `limiter.threshold`, and all 4 `LFO_DRIFT_GROUPS`' `rateSchema`/`depthSchema` → `'auto'`; `PING_VARIANCE_AUTOMATION_SCHEMA`, `BPM_SCHEMA` → `'horizontal'`), `src/data/robotOptionsConfig.ts` (`VOLUME_SCHEMA` → `'horizontal'`; `DENSITY_SCHEMA`, `PITCH_REPEAT_SCHEMA`, `ATTACK_SCHEMA`, `DECAY_SCHEMA`, `SUSTAIN_SCHEMA`, `RELEASE_SCHEMA`, and `SIGNATURE_ARRAY_CONFIG`'s `gain`/`detune`/`phase`/`pulseWidth` across all 3 layers → `'auto'`), and `src/components/ui/controls/Lfo.tsx`'s internal `rateSchema`/`depthSchema` (built per-render, not config data) → `'auto'`. Add one new assertion group each to `audioRigConfig.test.ts` and `robotOptionsConfig.test.ts` asserting the real exported schemas carry the correct `orientation` — the actual regression guard for the classification table, since nothing else checks it.

  **Acceptance criteria:**
  - [ ] Every slider schema listed in spec §1.1's table carries the exact `orientation` value shown there — no omissions, no `'auto'` used as a lazy default for anything actually classified `'horizontal'`/`'vertical'`.
  - [ ] `TransportBar.tsx`'s hand-rolled Volume slider is untouched — confirmed no `SliderLinearSchema` was invented for it (spec §1.1's correction note).
  - [ ] `audioRigConfig.test.ts` and `robotOptionsConfig.test.ts` each assert `orientation` directly on the real exported config objects (e.g. `expect(findParam('eq3', 'low').schema.orientation).toBe('vertical')`), covering every entry in spec §1.1's table.
  - [ ] No visual or behavioral change in the running app — `schema.orientation` is still unread by any component at this point (verify via `npm run dev`, spot-check the Audio Rig looks identical to before this task).

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/data/robotOptionsConfig.test.ts src/components/ui/controls/Lfo.test.tsx` passes (the last one verifies `Lfo.tsx`'s internal schema edit didn't break its own existing suite — no assertion changes expected there).
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, open the Audio Rig and a robot's options — confirm nothing looks different from before this task (the point of this step is inert data, not visible change).

  **Dependencies:** Task 1.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`, `src/components/ui/controls/Lfo.tsx`

  **Estimated scope:** M (5 files, but mechanical — one field per existing literal, values fully determined by the spec's table, no new logic)

- [ ] **Task 3: Make `orientation` required**

  **Description:** In `src/types/controls.ts`, flip `orientation?: SliderOrientation` to `orientation: SliderOrientation` (drop the `?`) on all 3 slider schema interfaces. This should compile cleanly with zero other file changes, because Tasks 1-2 already gave every real and test literal an explicit value.

  **Acceptance criteria:**
  - [ ] `orientation` is required (no `?`) on `SliderLinearSchema`, `SliderLogSchema`, `SliderCenteredZeroSchema`.
  - [ ] `npm run build:types` passes with **no other file touched** — if it doesn't, that means Task 1 or 2 missed a literal somewhere in `src/`; fix the missed site as part of this task and note it in the PR, don't silently widen this task's file list without saying so.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] `npm test` — full suite still green (confirms no test file anywhere else in the repo constructs one of these 3 schema types without `orientation`).

  **Dependencies:** Task 2.

  **Files:** `src/types/controls.ts` (only, if Tasks 1-2 were complete)

  **Estimated scope:** XS (1 file, 3 characters removed — the guarantee this whole phase was building toward)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] `grep -rn "type: 'sliderLinear'\|type: 'sliderLog'\|type: 'sliderCenteredZero'" src/` shows every match sitting inside an object literal that also sets `orientation`.
- [ ] Manual check: the running app looks and behaves identically to before Phase 1 — no slider has changed orientation yet, because nothing reads the field until Phase 2.
- [ ] Review with human before proceeding.

---

### Phase 2: Orientation-aware rendering (vertical slices — Tasks 5-7 parallelizable once Task 4 lands)

- [ ] **Task 4: `useAutoSliderOrientation` — the resolver hook**

  **Description:** Add `src/components/ui/controls/useAutoSliderOrientation.ts`, exporting `useAutoSliderOrientation(ref, orientation)` per spec §4's full shape: `'horizontal'`/`'vertical'` pass through unchanged (no observer created); `'auto'` observes `ref.current.parentElement` (never `ref.current` itself — spec §1.2's feedback-loop rationale) via `ResizeObserver`, resolving to `'vertical'` when the parent's measured height exceeds its width, else `'horizontal'`, defaulting to `'horizontal'` before the first measurement and when no parent exists. Guard the observer's `setState` call so an unchanged resolved value doesn't trigger a re-render.

  **Acceptance criteria:**
  - [ ] `orientation: 'horizontal'` always resolves to `'horizontal'`; `orientation: 'vertical'` always resolves to `'vertical'` — neither constructs a `ResizeObserver`.
  - [ ] `orientation: 'auto'` resolves to `'horizontal'` before any measurement.
  - [ ] `orientation: 'auto'` observes `ref.current.parentElement`, not `ref.current` — assertable via a mocked `ResizeObserver`'s `observe()` call argument.
  - [ ] A mocked measurement with `height > width` resolves to `'vertical'`; a subsequent one with `width > height` resolves back to `'horizontal'`.
  - [ ] `orientation: 'auto'` with no parent element (`ref.current.parentElement` is `null`) resolves to `'horizontal'` without throwing.
  - [ ] Unmounting calls the observer's `disconnect()`.
  - [ ] Switching the `orientation` argument from `'auto'` to `'horizontal'`/`'vertical'` on a re-render disconnects any existing observer and resolves directly to the new fixed value.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/useAutoSliderOrientation.test.ts` passes, covering every acceptance criterion above — stub `globalThis.ResizeObserver` per test to capture and manually invoke its callback (the repo's existing `vitest.setup.ts` polyfill is a no-op, sufficient for tests that don't need to inspect it, but this hook's own tests need a controllable mock — see spec §5 item 5).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3 (imports the now-required `SliderOrientation` type — works against the optional version too, but sequencing after Task 3 keeps every later task building on the finished type).

  **Files:** `src/components/ui/controls/useAutoSliderOrientation.ts`, `src/components/ui/controls/useAutoSliderOrientation.test.ts`

  **Estimated scope:** S (one new hook, no consumer yet)

- [ ] **Task 5: `SliderLinear` — all 3 orientations**

  **Description:** Add `--slider-vertical-height: 256px;` to `src/index.css` alongside the existing `--spacing-*`/`--color-*` tokens. In `SliderLinear.tsx`: add a `verticalHeight?: number` prop, a `wrapperRef`, resolve orientation via `useAutoSliderOrientation(wrapperRef, schema.orientation)`, pass `orientation={resolved}` to `Slider.Root`, reorder rendering so the value readout renders *before* `Slider.Root` when resolved is `'vertical'` (else after, as today), and apply `verticalHeight` as an inline `height` style on `Slider.Root` only when both `isVertical` and the prop is explicitly passed (default height comes from the new CSS var, per spec §4). In `SliderLinear.css`, add the `[data-orientation='vertical']` rules for `__root` (`flex-direction: column; width: 20px; height: var(--slider-vertical-height, 256px);`), `__track` (`width: 3px; height: 100%;`), and `__range` (`width: 100%; height: auto;`).

  **Acceptance criteria:**
  - [ ] `orientation: 'horizontal'` renders byte-for-byte the same as before this task (existing tests pass unmodified in behavior, only the fixture gained the field in Task 1).
  - [ ] `orientation: 'vertical'`: `Slider.Root` receives `orientation="vertical"`; the value readout appears before the track in DOM order; the rendered height reflects `--slider-vertical-height` (256px) by default.
  - [ ] `orientation: 'vertical'` with an explicit `verticalHeight` prop: the root's inline height reflects the passed value instead of the CSS default.
  - [ ] `orientation: 'auto'` renders without throwing, defaulting to horizontal-looking output before any `ResizeObserver` callback fires.
  - [ ] All existing `SliderLinear.test.tsx` assertions (a11y name, disabled state, value formatting, keyboard stepping) still pass for `orientation: 'horizontal'`.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` passes, covering the new orientation cases above.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `npm run dev` — no visible change yet in any real drawer (every real `SliderLinear` consumer is either `'horizontal'` or `'auto'`-that-measures-horizontal-in-today's-layout per spec §1.2; nothing is classified `'vertical'` for this component). Confirm this explicitly rather than assuming it.

  **Dependencies:** Task 4.

  **Files:** `src/index.css`, `src/components/ui/controls/SliderLinear.tsx`, `src/components/ui/controls/SliderLinear.css`, `src/components/ui/controls/SliderLinear.test.tsx`

  **Estimated scope:** M (4 files — the pattern every other slider component in this phase repeats)

- [ ] **Task 6: `SliderLog` — all 3 orientations**

  **Description:** Apply Task 5's identical pattern to `SliderLog.tsx`/`.css`/`.test.tsx` — same `verticalHeight` prop, same `wrapperRef`/`useAutoSliderOrientation` wiring, same value-before-track reordering for `'vertical'`, same CSS block under `.sc-slider-log__*` class names. `SliderLog`'s own internal `t ∈ [0,1]` log-curve mapping (`sliderLogMath.ts`) is orthogonal to orientation and needs no change.

  **Acceptance criteria:** Same 5 criteria as Task 5, restated for `SliderLog` — plus: the existing log-curve round-trip tests (`sliderLogValueToT`/`sliderLogTToValue`) are unaffected by any orientation value.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: Attack/Decay/Release (Ping Contour) and LPF/HPF Frequency/Resonance still behave identically to before this task (all `'auto'`, still measuring horizontal in today's layout).

  **Dependencies:** Task 4. (Independent of Task 5 — safe to build in parallel.)

  **Files:** `src/components/ui/controls/SliderLog.tsx`, `src/components/ui/controls/SliderLog.css`, `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** S (3 files, repeats an already-established pattern)

- [ ] **Task 7: `SliderCenteredZero` — all 3 orientations + the fill-axis remap**

  **Description:** Apply Task 5's wrapper/orientation/CSS-height pattern to `SliderCenteredZero.tsx`/`.css`/`.test.tsx`, plus the fill-axis remap from spec §1.3: compute `fillStyle` as `{ left, width }` (unchanged) when resolved horizontal, or `{ bottom: `${fill.left}%`, height: `${fill.width}%` }` when resolved vertical — reusing `computeFillRect`'s existing returned percentages unchanged on the new axis, per spec §1.3 ("no change to `sliderCenteredZeroMath.ts`'s math"). Update `sliderCenteredZeroMath.ts`'s doc comment only (no function signature or return-value change) to note the percentages are axis-agnostic. In `SliderCenteredZero.css`, drop the `.__fill` element's static `top: 0; height: 100%;` rule (both axes are now fully driven by the computed `fillStyle`) and add the same `[data-orientation='vertical']` root/track rules Task 5 added.

  **Acceptance criteria:** Same 5 criteria as Task 5, restated for `SliderCenteredZero` — plus:
  - [ ] `orientation: 'vertical'`: the `.__fill` element's inline style uses `bottom`/`height`, not `left`/`width`.
  - [ ] The vertical fill's `bottom`/`height` values equal `computeFillRect`'s existing `{ left, width }` numbers for the same `value`/`min`/`max` (assert by reusing `computeFillRect` directly in the test, not a hand-computed second expected value).
  - [ ] `orientation: 'horizontal'`'s fill rendering is visually unchanged from before this task (the existing horizontal fill assertions in `SliderCenteredZero.test.tsx` still pass without modification).
  - [ ] `sliderCenteredZeroMath.ts`'s exported function signatures and return values are byte-for-byte unchanged — only its doc comment is edited.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: open the Audio Rig, expand 3-Band EQ — Low/Mid/High now render as **vertical faders, 256px tall**, value above the track, zero-anchored fill visibly anchored at 0dB (not the bottom edge), thumb draggable up/down with max (+12dB) at the top. This is the one visible change in the entire feature at this point in the plan — everything else stays `'horizontal'`/`'auto'`-measuring-horizontal. Also confirm an unrelated `'auto'`-classified `SliderCenteredZero` (e.g. a drift pair) still renders horizontal, unchanged.

  **Dependencies:** Task 4. (Independent of Tasks 5-6 — safe to build in parallel.)

  **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`, `src/components/ui/controls/SliderCenteredZero.css`, `src/components/ui/controls/SliderCenteredZero.test.tsx`, `src/components/ui/controls/sliderCenteredZeroMath.ts`

  **Estimated scope:** M (4 files — the most involved of the 3 components, but the math itself doesn't change, only how its output is applied)

### Checkpoint: All 3 components ship
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual pass across the real app: EQ Low/Mid/High are vertical faders (256px, value-above-track, correct zero anchor). Volume (robot and the hand-rolled Rig master), Automatic Effects, and Tempo are still horizontal. Every `'auto'`-classified slider (LPF/HPF, Delay, Reverb, Compressor, Limiter, all 4 drift pairs, Ping Controls, Ping Contour, Signature Array's 3 layers, and LFO Rate/Depth inside every `Lfo` control) still renders and behaves correctly — horizontal-looking today, which is expected (spec §1.2), not a regression.
- [ ] No console errors/warnings from `ResizeObserver` (e.g. no "loop limit exceeded" warning) during normal interaction with any `'auto'` slider.
- [ ] Review with human before proceeding.

---

### Phase 3: Docs

- [ ] **Task 8: `docs/COMPONENT_LIBRARY.md` — document `orientation`/`useAutoSliderOrientation`**

  **Description:** Extend the existing `SliderLinear`/`SliderLog`/`SliderCenteredZero` rows (or add a short subsection after "Primitives") documenting the new required `orientation: SliderOrientation` field, its 3 resolved values, the `verticalHeight` override prop and its 256px default, and `useAutoSliderOrientation`'s parent-vs-self measurement design — with a pointer to `docs/specs/VERTICAL_SLIDERS.md` for the full rationale.

  **Acceptance criteria:**
  - [ ] `docs/COMPONENT_LIBRARY.md` documents `orientation`, its 3 values, `verticalHeight`, and `useAutoSliderOrientation`'s existence and purpose.
  - [ ] The doc links to `docs/specs/VERTICAL_SLIDERS.md`.
  - [ ] No claim in the new section is contradicted by the actual shipped source (spot-check against Tasks 4-7's final code).

  **Verification:**
  - [ ] Manual review — every documented detail spot-checked directly against the shipped `SliderLinear.tsx`/`SliderLog.tsx`/`SliderCenteredZero.tsx`/`useAutoSliderOrientation.ts`.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 5, Task 6, Task 7.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 8 tasks are met.
- [ ] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The residual feedback-loop/instability risk once a later drawer-layout session gives `'auto'` sliders a real (but height-unconstrained) parent container (spec §7 item 1) | Medium, but out of this plan's scope — no task here wires a real sized wrapper into any drawer | Flagged again here so the later layout session designs each `'auto'` container with an externally-fixed height (CSS grid/aspect-ratio), not one that shrink-wraps its slider child; `useAutoSliderOrientation` itself (Task 4) already does everything it can by observing the parent, not itself |
| Task 3 ("flip to required") surfaces a literal Tasks 1-2 missed, silently growing that task's file list | Low — `npm run build:types` catches this immediately, it can't ship silently | Task 3's acceptance criteria explicitly call this out: fix it there and note it, don't expand scope quietly |
| `SliderCenteredZero`'s `.__fill` CSS moving from a static horizontal-only rule to a fully inline-style-driven approach (Task 7) could visually regress the existing horizontal case | Low — the JS-computed `{ top: 0, left, width }` is a superset of what the static rule did | Task 7's acceptance criteria require the existing horizontal fill assertions to pass unmodified; manual check in Task 7 explicitly re-checks an unrelated horizontal `SliderCenteredZero` |
| `TransportBar.tsx`'s hand-rolled master Volume slider stays inconsistent with the schema-driven system (spec §7 item 4) | Low — purely a consistency/tech-debt question, zero behavior impact since it's already horizontal | Out of scope for this plan; Task 2's acceptance criteria confirm it's deliberately left untouched, not silently forgotten |

## Open Questions

Resolved during Plan (not left open):

- ~~Can the required-field migration be split into smaller tasks without ever breaking the build?~~ **Resolved: yes, via the widen-then-narrow Tasks 1-3 sequence — see Architecture Decisions.**
- ~~Does the real classification wiring need its own task after the components ship?~~ **Resolved: no — it's set once in Task 2, while still inert, and takes effect automatically once Tasks 5-7 land.**

Carried forward from spec §7, not blocking this plan:

1. **Whether `TransportBar.tsx`'s Volume slider should migrate onto `SliderLinear`/`SliderLinearSchema`** for consistency with the rest of the app — explicitly out of scope here (spec §7 item 4); raise as a separate, standalone task if the user wants it.
2. **`verticalHeight`'s lack of validation/clamping** (spec §7 item 3) — no real call site overrides the default in this plan, so low risk; add a guard only if a future consumer needs one.
