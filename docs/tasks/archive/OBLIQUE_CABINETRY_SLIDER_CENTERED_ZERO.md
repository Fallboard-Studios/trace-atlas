# Implementation Plan: Oblique Cabinetry — SliderCenteredZero (Roadmap Phase 11.1.5)

Source spec: [docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md](../specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md).
Source intent: [docs/intent/oblique-cabinetry-slider-centered-zero.md](../intent/oblique-cabinetry-slider-centered-zero.md).
Pure presentation change plus two small, additive extensions to already-shipped shared
infrastructure — no `AudioEngine`/`BeatClock` change, no new Zustand field, no
`SliderCenteredZeroSchema`/`ControlSchema` change, no change to `CabinetBox.tsx`,
`useCabinetBoxHeight.ts`, `useVoxelTrackBoxCount.ts`, `cabinetGeometry.ts`, `SliderLinear.tsx`, or
`SliderLog.tsx`/`sliderLogMath.ts` (all already correct, reused as-is).

## Overview

The last of the 3 voxel-track sliders. Unlike 11.1.4's `SliderLog` (a pure wiring exercise), this
item requires two small, genuinely new capabilities in shared infrastructure before the component
itself can be touched: a zero-anchored, dead-center-seam box-state function
(`computeVoxelBoxStatesCenteredZero`, alongside a forced-even box-count helper) in
`voxelTrackMath.ts`, and a per-side-relative pop-distance override threaded through `VoxelTrack.tsx`.
Both ship first, in isolation, against their own test suites, with the existing `SliderLinear`/
`SliderLog` regression suites re-run as a hard gate proving neither shared-infrastructure touch
changed anything for its existing consumers. Only once both extensions are proven safe does
`SliderCenteredZero.tsx` itself get rewritten — inseparably from deleting the pre-Cabinetry
`sliderCenteredZeroMath.ts`, since nothing in the new component calls it. Docs last.

## Architecture Decisions

- **The two shared-infrastructure extensions (`voxelTrackMath.ts` additions, then
  `VoxelTrack.tsx`'s override and `useVoxelTrackSlider`'s `forceEven` option) ship and are verified
  *before* `SliderCenteredZero.tsx` itself is touched** — same "component before consumer"
  precedent 11.1.3/11.1.4 already used (`VoxelTrack` before `SliderLinear`; the shared hook before
  `SliderLog`), isolating a design mistake in either extension to its own task, before a real
  consumer is built on top of it.
- **`voxelTrackMath.ts`'s additions (Task 1) are one task, not split by which later task consumes
  which export** — `VoxelBoxState`'s 2 new optional fields, `computeEvenBoxCount`, and
  `computeVoxelBoxStatesCenteredZero` all live in one file with one test file, and none has any
  caller until Tasks 2-4. Splitting them into 3 tasks would only fragment one already-small,
  self-contained diff.
- **Task 2 (`VoxelTrack.tsx`'s override) and Task 3 (`useVoxelTrackSlider`'s `forceEven`) are
  independent of each other and may proceed in parallel** — both depend only on Task 1
  (`VoxelTrack.tsx` needs the 2 new `VoxelBoxState` fields; `useVoxelTrackSlider` needs
  `computeEvenBoxCount`), not on each other. Both are sequenced strictly before Task 4 regardless,
  since `SliderCenteredZero.tsx` needs both extensions simultaneously.
- **Tasks 2 and 3 each carry the same hard regression bar Task 2 of the `SliderLog` plan (11.1.4)
  used for its `SliderLinear` retrofit**: proof of *zero* behavior change for existing consumers,
  not merely "tests still pass." Task 2's gate is `VoxelTrack.test.tsx`'s existing cases receiving
  zero edits (only a new case added); Task 3's gate is `SliderLinear.test.tsx`/`SliderLog.test.tsx`
  — the hook's two real consumers — both passing with an empty `git diff`, proving the new optional
  4th parameter is truly opt-in.
- **Task 4 (the `SliderCenteredZero.tsx`/`.css`/`.test.tsx` rewrite plus `sliderCenteredZeroMath.ts`'s
  deletion) is one task, not split further** — per spec §6, the rewrite and the deletion are
  inseparable: nothing in the new component calls the old math file, so shipping the rewrite without
  the deletion leaves dead, misleading code behind, and shipping the deletion first would break the
  still-old component. This is the largest single task in this plan and the only one touching more
  than 2 files; sized `L` deliberately rather than force-split into a broken intermediate state.
- **The 2 docs tasks (5, 6) depend on Task 4 and are ordered last** — both describe shipped
  behavior; neither can be written accurately before the component exists. Same "docs depend on the
  code they describe" ordering 11.1.3's/11.1.4's own plans used.
- **No task in this plan touches `CabinetBox.tsx`, `useCabinetBoxHeight.ts`,
  `useVoxelTrackBoxCount.ts`, `cabinetGeometry.ts`, `computeVoxelBoxStates`,
  `computeVoxelBoxPopDistance`, `computeVoxelBoxZIndex`, `SliderLinear.tsx`, `SliderLog.tsx`, or
  `sliderLogMath.ts`** — confirmed against spec §2/§3's Strict Scope; all are already correct and
  reused exactly as they ship today, or (for the two `computeVoxelBox*` functions) called with
  recomputed inputs rather than modified.

## Dependency Graph

```
Task 1 (voxelTrackMath.ts additions + test —
        VoxelBoxState fields, computeEvenBoxCount,
        computeVoxelBoxStatesCenteredZero)
        │
   ┌────┴────┐
   ▼         ▼
Task 2     Task 3
(VoxelTrack (useVoxelTrackSlider
 override)   forceEven option)
   │         │
   └────┬────┘
        ▼
Checkpoint: Both extensions proven safe
        │
        ▼
Task 4 (SliderCenteredZero.tsx/.css/.test.tsx
        rewrite + sliderCenteredZeroMath.ts deletion)
        │
        ▼
Checkpoint: SliderCenteredZero ships — last of the 3 sliders
        │
   ┌────┴────┐
   ▼         ▼
Task 5     Task 6
(COMPONENT_  (CONSOLE_
LIBRARY.md)  THEMING.md)
   │         │
   └────┬────┘
        ▼
Checkpoint: Complete
```

## Task List

### Phase 1: Shared math — no consumer yet

- [x] **Task 1: `voxelTrackMath.ts` — `VoxelBoxState`'s new optional fields, `computeEvenBoxCount`, `computeVoxelBoxStatesCenteredZero`**

  **Description:** Add to `src/utils/voxelTrackMath.ts` per spec §1.2/§1.4/§4: two new optional
  fields on `VoxelBoxState` (`popDistanceLocalIndex?: number`, `popDistanceLocalCount?: number`);
  `VOXEL_TRACK_MIN_BOX_COUNT_EVEN = 4`; `computeEvenBoxCount(rawBoxCount)`; and
  `computeVoxelBoxStatesCenteredZero(value, min, max, boxCount)`, which reuses
  `computeVoxelBoxStates` for both sides (the negative side's result reversed after the call — see
  spec §1.2's worked example) rather than reimplementing straddle logic. No existing export's
  signature or behavior changes.

  **Acceptance criteria:**
  - [x] `VoxelBoxState` gains the 2 new optional fields; every existing caller of the type
        (`computeVoxelBoxStates`'s own return objects) remains valid without setting either.
  - [x] `computeEvenBoxCount`: rounds an odd count down to the nearest even number (`7 → 6`);
        leaves an already-even count unchanged (`6 → 6`); floors at `VOXEL_TRACK_MIN_BOX_COUNT_EVEN`
        (`4`), not `VOXEL_TRACK_MIN_BOX_COUNT` (`3`) — an input of `3` produces `4`, not `2`; an
        input of `0` also floors to `4`.
  - [x] `computeVoxelBoxStatesCenteredZero`: at `value === 0`, every box on both sides is
        `{ fillPercent: 0, popT: 0, isStraddling: false }`; for a positive value, the negative side
        is entirely flat and the positive side matches `computeVoxelBoxStates(value, 0, max,
        positiveCount)` exactly on `fillPercent`/`popT`/`isStraddling`; for a negative value
        (hand-derived case: `min: -50, max: 50, boxCount: 4, value: -5` → `states[0]` flat,
        `states[1]` straddling at `fillPercent: 20`, `states[2..3]` flat), the mirrored/reversed
        logic matches spec §1.2's worked example exactly.
  - [x] The seam is always `Math.floor(boxCount / 2)` regardless of asymmetric `min`/`max` — for
        `min: -20, max: 50, boxCount: 6`, both sides get 3 boxes each across a sweep of
        representative values, never a split proportional to `zeroPointPercent(-20, 50)`'s own
        ≈28.57%.
  - [x] `popDistanceLocalIndex`/`popDistanceLocalCount` are correct per side: `0` at the box
        physically nearest the seam, ascending outward to `sideCount - 1` at that side's own
        physical end (`min` or `max`).
  - [x] Exactly one `isStraddling: true` entry for any non-zero value; zero for `value === 0`.
  - [x] `git diff` on every existing export in `voxelTrackMath.ts` (`computeVoxelBoxStates`,
        `computeVoxelBoxPopDistance`, `computeVoxelBoxZIndex`, `computeVoxelFillBackground`,
        `computeVoxelStraddleSizeFraction`, `computeFittedBoxCount`, `computeVoxelTrackLength`,
        `computeVoxelTrackTrailingReserve`, `VOXEL_TRACK_MIN_BOX_COUNT`,
        `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`, `VOXEL_STRADDLE_MIN_SIZE_FRACTION`) is empty —
        additions only.

  **Verification:**
  - [x] `npx vitest run src/utils/voxelTrackMath.test.ts` passes (existing cases + new
        `computeEvenBoxCount`/`computeVoxelBoxStatesCenteredZero`/`VOXEL_TRACK_MIN_BOX_COUNT_EVEN`
        blocks).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: none applicable yet — zero real consumers until Tasks 2-4.

  **Dependencies:** None.

  **Files:** `src/utils/voxelTrackMath.ts`, `src/utils/voxelTrackMath.test.ts`

  **Estimated scope:** S (2 files — pure addition, no consumer yet; mirrors 11.1.4's own Task 1
  "component before consumer" pattern)

### Checkpoint: Math ships
- [x] `npm run build:types`, `npm run lint` clean; `voxelTrackMath.test.ts` passes in isolation.
- [x] `grep -rn "computeVoxelBoxStatesCenteredZero\|computeEvenBoxCount" src/` shows both new
      exports present with zero real consumers yet, beyond their own test file.
- [x] Review with human before proceeding.

---

### Phase 2: Two independent, additive extensions to shared infrastructure

- [x] **Task 2: `VoxelTrack.tsx` — per-side pop-distance override**

  **Description:** Change the single statement inside `VoxelTrack.tsx`'s existing
  `states.map((state, i) => { ... })` that computes `popDistance`, per spec §1.3/§4:
  `computeVoxelBoxPopDistance(state.popDistanceLocalIndex ?? i, state.popDistanceLocalCount ??
  states.length)`, replacing the current `computeVoxelBoxPopDistance(i, states.length)`. Update the
  adjacent comment to explain the override and that `SliderLinear`/`SliderLog` never set either
  field. No other line in the file changes — z-index, the straddle-slot rendering, and every prop
  stay untouched.

  **Acceptance criteria:**
  - [x] `git diff src/components/ui/controls/VoxelTrack.tsx` touches only the `popDistance`
        statement and its comment.
  - [x] `git diff` on `VoxelTrack.test.tsx`'s existing `it(...)` blocks is **empty** for this task
        — every existing case passes unmodified (none of `STATES`'s fixtures set the new optional
        fields, so `?? i` / `?? states.length` resolve to exactly what those tests already assert).
  - [x] New test added: a `states` fixture where at least one entry sets
        `popDistanceLocalIndex`/`popDistanceLocalCount` to values that differ from its real row
        index/`states.length`; the rendered `data-pop-distance` reflects the override values, while
        that same box's z-index (`data-z-index` or the straddle wrapper's inline `zIndex`) still
        equals `computeVoxelBoxZIndex` computed from the box's **real** global index/`states.length`
        — confirming no crossover between the two mechanisms.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/VoxelTrack.test.tsx` passes in full (all
        existing cases + 1 new).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Manual check: none formally required yet — no real consumer sets either new field until
        Task 4.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/VoxelTrack.tsx`, `src/components/ui/controls/VoxelTrack.test.tsx`

  **Estimated scope:** S (2 files) — treat with the same care as `SliderLog`'s plan treated its
  `SliderLinear` retrofit despite the small file count: `VoxelTrack` is already-shipped, shared
  infrastructure with 2 real production consumers (`SliderLinear`, `SliderLog`) whose correctness
  this task must not disturb.

- [x] **Task 3: `useVoxelTrackSlider.ts` — opt-in `forceEven` option**

  **Description:** Add an optional 4th parameter, `options?: VoxelTrackSliderOptions` (a new
  exported interface with a single `forceEven?: boolean` field), per spec §1.4/§4. When
  `options?.forceEven` is true, the hook's internally-resolved `rawBoxCount` is passed through
  `computeEvenBoxCount` (Task 1) *before* `trackLength`/`rootStyle` are derived from it — not
  applied afterward as a transform on the hook's already-returned values. Omitted or `false`
  preserves today's exact behavior.

  **Acceptance criteria:**
  - [x] `useVoxelTrackSlider`'s signature gains the optional 4th parameter; `SliderLinear.tsx`'s and
        `SliderLog.tsx`'s existing 3-argument calls require zero changes.
  - [x] `forceEven: true` rounds an odd fitted count down (e.g. a measurement that would fit 5 boxes
        → `boxCount: 4`) and leaves an already-even fitted count unchanged (`6 → 6`);
        `trackLength`/`rootStyle` are derived from the **post-rounding** `boxCount`, not the raw
        fitted one.
  - [x] `forceEven: true`, vertical, `verticalHeight` omitted: fits against
        `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` and then rounds down to the nearest even count,
        synchronously — no `ResizeObserver` needs to fire.
  - [x] `git diff src/components/ui/controls/SliderLinear.tsx` and
        `git diff src/components/ui/controls/SliderLog.tsx` are both **empty** for this task.
  - [x] `git diff` on `useVoxelTrackSlider.test.ts`'s existing `it(...)` blocks is empty — only new
        cases are added.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/useVoxelTrackSlider.test.ts` passes in full.
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` **and**
        `npx vitest run src/components/ui/controls/SliderLog.test.tsx` both pass with their files
        **unmodified** (hard gate, mirroring 11.1.4's own empty-diff bar for its `SliderLinear`
        retrofit) — proves the new optional parameter is genuinely opt-in for both real consumers.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Manual check: none required yet — no real consumer passes `forceEven: true` until Task 4.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/useVoxelTrackSlider.ts`,
  `src/components/ui/controls/useVoxelTrackSlider.test.ts`

  **Estimated scope:** S (2 files) — same "modifies already-shipped shared infrastructure with real
  consumers" risk class as Task 2, independent of it.

### Checkpoint: Both extensions proven safe
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [x] `git diff` confirms: `VoxelTrack.test.tsx` and `useVoxelTrackSlider.test.ts` each contain
      **only additions** relative to their pre-Task-2/3 state (no edited existing case); `git diff
      src/components/ui/controls/SliderLinear.tsx src/components/ui/controls/SliderLinear.test.tsx
      src/components/ui/controls/SliderLog.tsx src/components/ui/controls/SliderLog.test.tsx` is
      **empty** — not just "tests still pass," the literal diff.
- [x] Manual check: none applicable yet (no real consumer of either extension exists before Task 4)
      — recorded explicitly rather than silently skipped, same honest-gap posture 11.1.4's own
      checkpoints used for the steps in this plan where a manual pass genuinely isn't yet possible.
- [x] Review with human before proceeding — this checkpoint gates whether Task 4 may safely build
      `SliderCenteredZero` on both extensions at once.

---

### Phase 3: The real consumer — `SliderCenteredZero`, and retiring the old math file

- [x] **Task 4: `SliderCenteredZero` — rewired through `VoxelTrack`/`useVoxelTrackSlider`, `sliderCenteredZeroMath.ts` deleted**

  **Description:** Replace `SliderCenteredZero.tsx` and `SliderCenteredZero.css` per spec §1.6/§4
  in full: resolve `{ boxSize, gap, boxCount, rootStyle }` via `useVoxelTrackSlider(wrapperRef,
  orientation, verticalHeight, { forceEven: true })` (Task 3); compute `states` via
  `computeVoxelBoxStatesCenteredZero(value, schema.min, schema.max, boxCount)` (Task 1); render
  `<VoxelTrack>` (Task 2's own override available, inherited automatically) as an
  absolutely-positioned sibling of `Slider.Range` inside `Slider.Track`, mirroring
  `SliderLinear.tsx`'s/`SliderLog.tsx`'s own JSX shape — no `t`-curve here, `Slider.Root` keeps
  using the schema's literal `min`/`max`/`value`. Rewrite `SliderCenteredZero.css` mirroring
  `SliderLog.css`'s own voxel-track conversion (`Range` hidden, `Thumb` fill transparent, overflow
  rules on the wrapper) **and proactively applying the `Track`/`Root` height fix** 11.1.4 only found
  post-ship (spec §1.6) — starting from the already-correct shape, not the bug. Delete
  `sliderCenteredZeroMath.ts` (`computeFillRect`/`zeroPointPercent`/`valuePercent` have no remaining
  caller). Update `SliderCenteredZero.test.tsx` per spec §5's exact disposition of the existing 28
  cases: the `sliderCenteredZeroMath` `describe` block (6 cases) removed entirely; 16 cases kept
  unmodified; 3 `verticalHeight` cases rewritten for the fitting-budget-plus-forced-even semantics;
  3 fill-based cases removed (superseded); 1 asymmetric-bounds case removed and replaced with its
  opposite, now-confirmed behavior; 8 new cases added.

  **Acceptance criteria:**
  - [x] `grep -rn "sliderCenteredZeroMath" src/` returns nothing anywhere in the app — no dangling
        import.
  - [x] `SliderCenteredZero` renders through `VoxelTrack` exactly as `SliderLinear`/`SliderLog` do —
        same `Slider.Track`/`Slider.Range`/`VoxelTrack`/`Slider.Thumb` structure, `Slider.Root`
        sized via `rootStyle`.
  - [x] `computeVoxelBoxStatesCenteredZero` is called with `(value, schema.min, schema.max,
        boxCount)` — verified via a mocked `VoxelTrack` (mirroring `SliderLog.test.tsx`'s own
        precedent) asserting the exact `states` array for a positive value, a negative value, and
        `value: 0` — not merely "renders without throwing."
  - [x] `useVoxelTrackSlider` is called with `{ forceEven: true }` — verified indirectly by
        confirming the rendered box count is always even across a sweep of container widths/
        `verticalHeight` values, including ones whose raw fit would be odd.
  - [x] The 16 unaffected existing cases (`DualLabel` rendering, `{value}{unit}` display including
        the no-unit/3-decimal-cap cases, `aria-valuemin`/`valuemax`/`valuenow` reflecting
        `schema.min`/`max`/`value` directly, accessible-name fallback, not-disabled-by-default,
        disabled attribute + tabindex removal, no-`onChange`-when-disabled, both `data-orientation`
        cases, the 2 value-label DOM-order cases, the `'auto'`-defaults-to-horizontal case) pass
        **unmodified**.
  - [x] The 3 rewritten `verticalHeight` cases assert the fitting-budget-plus-forced-even behavior
        exactly per spec §5: omitted → fits against `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` then
        rounds even, synchronously; supplied and not landing on an already-even fitted count →
        rendered height is the box-quantized, forced-even `computeVoxelTrackLength` output, not
        `verticalHeight` verbatim; horizontal → still no inline `height`, but now also sets an
        inline `width`.
  - [x] The asymmetric-bounds fixture (`min: -20, max: 50`) confirms the seam split is dead-center
        (`Math.floor(boxCount / 2)` per side), **not** proportional to that schema's own
        `zeroPointPercent` — the direct replacement for the removed test that assumed the opposite.
  - [x] `disabled` does not change the `states` passed to `VoxelTrack` — the visual read is
        identical whether or not the control is disabled.
  - [x] `Slider.Thumb`'s rendered `background-color` is `transparent` — confirmed by reading the
        shipped `SliderCenteredZero.css` directly (this jsdom/vitest setup injects no `<style>`
        tags), not asserted via `getComputedStyle`.
  - [x] `screen.getByRole('slider')` resolves to exactly one element.
  - [x] `git diff src/types/controls.ts` is empty for this task.
  - [x] `SliderCenteredZero`'s `{ schema, value, onChange, disabled?, verticalHeight? }` props
        contract is byte-for-byte unchanged — no call site (`audioRigConfig.ts`'s EQ3/Drift entries,
        `robotOptionsConfig.ts`'s Detune entry, or any drawer) requires a change.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx` passes in full (16
        unmodified + 3 rewritten + 8 new = 27 total).
  - [x] `npm run build:types`, `npm run lint` clean (confirms no dangling import from the deleted
        math file).
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) clean — including `SliderLinear.test.tsx`, `SliderLog.test.tsx`,
        `VoxelTrack.test.tsx`, `useVoxelTrackSlider.test.ts` all still unmodified and passing, and
        every real `SliderCenteredZero` consumer's own test file (`AudioRigDrawer.test.tsx`,
        `SignatureArrayDrawer.test.tsx`) unmocked against the real component.
  - [ ] **Manual check** — **Outstanding.** No browser-automation tool is available in this
        environment (same gap 11.1.3/11.1.4's own checkpoints recorded rather than skipping
        silently); flagged for Crawford to perform in the running app: load the app, open a drawer
        with a real `SliderCenteredZero` (Detune on
        all 3 robot signature layers; EQ3 Low/Mid/High; LFO Rate/Depth Drift) at each of the 3
        breakpoints: confirm the box row is always an even count; confirm dragging/keyboard-stepping
        through zero cleanly switches which side shows fill, reading fully flat/at-rest exactly at
        center; confirm extrusion depth ramps shallow-near-center to deepest-at-each-far-end,
        independently per side; confirm the focus ring renders clearly on the box row; confirm a
        narrow container clamps to 4 boxes (2 per side) and scrolls rather than shrinking or going
        odd; confirm "reduce motion" makes transitions snap. Spot-check `SliderLinear`/`SliderLog`
        elsewhere in the same drawers are unaffected.

  **Dependencies:** Task 1, Task 2, Task 3 (sequenced after the "Both extensions proven safe"
  checkpoint).

  **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`,
  `src/components/ui/controls/SliderCenteredZero.css`,
  `src/components/ui/controls/SliderCenteredZero.test.tsx`,
  `src/components/ui/controls/sliderCenteredZeroMath.ts` (deleted)

  **Estimated scope:** L (4 files, including one deletion) — the rewrite and the deletion are
  inseparable per spec §6 (nothing in the new component calls the old math file, so shipping either
  half alone leaves the app in a broken or misleading state); not split further despite exceeding
  this plan's other tasks' file counts.

### Checkpoint: SliderCenteredZero ships — last of the 3 sliders
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [x] Every real `SliderCenteredZero` call site in the app renders through `VoxelTrack` with no
      call-site changes required — confirmed by `npm run build:types` alone surfacing nothing,
      since the props contract didn't change.
- [ ] Manual pass (Task 4's own manual check) — **Outstanding**, see Task 4 above; not blocking the
      docs tasks below (both describe already-shipped, automated-test-verified behavior), but
      blocking a genuine "ready for PR" declaration.
- [x] Review with human before proceeding to docs — proceeded per Crawford's own explicit
      "implement each task sequentially, then commit" instruction, which stands as that review.

---

### Phase 4: Docs (parallelizable once their shared prerequisite lands)

- [x] **Task 5: `docs/COMPONENT_LIBRARY.md` — `SliderCenteredZero`'s note + zero-anchored mechanism description**

  **Description:** Add the same "internal rendering changed, contract didn't" note
  `SliderLinear`/`SliderLog`'s rows already carry, to `SliderCenteredZero`'s row, per roadmap
  11.1.5's own Docs bullet and spec §6. Remove the existing "`SliderCenteredZero`'s zero-anchored
  fill" subsection (which describes the now-deleted `computeFillRect` mechanism) and replace it with
  a short description of the dead-center-seam/per-side mechanism, pointing to the spec rather than
  restating it in full.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `SliderCenteredZero` now renders through
        `VoxelTrack` internally, with its props contract unchanged.
  - [x] The old "zero-anchored fill" subsection's `computeFillRect`-based description is gone; its
        replacement accurately describes the dead-center seam and per-side fill/falloff, spot-checked
        against the actual shipped `SliderCenteredZero.tsx`/`voxelTrackMath.ts` (Task 4/Task 1), not
        this spec's draft.

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped source.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 4.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 6: `docs/CONSOLE_THEMING.md` — close out the "Voxel-track sliders" section**

  **Description:** Update the "Voxel-track sliders" section's closing framing — updated by 11.1.4
  to "`SliderLog` shipped, `SliderCenteredZero` pending" — to reflect all 3 voxel-track sliders now
  shipped, and add the zero-anchored dead-center-seam/per-side-falloff rules this item introduces
  alongside 11.1.3's/11.1.4's existing geometry notes.

  **Acceptance criteria:**
  - [x] The closing line accurately reflects all 3 sliders (`SliderLinear`, `SliderLog`,
        `SliderCenteredZero`) having shipped through the shared voxel-track mechanism.
  - [x] The dead-center-seam/per-side-falloff rules are documented, spot-checked against the actual
        shipped `voxelTrackMath.ts`/`VoxelTrack.tsx`/`SliderCenteredZero.tsx`.
  - [x] No other claim in the section is altered unless this task finds it inaccurate against the
        actual shipped source while making the edit.

  **Verification:**
  - [x] Manual review — spot-checked against the shipped source.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 4.

  **Files:** `docs/CONSOLE_THEMING.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes
      (123 files / 2115 tests, including every real `SliderCenteredZero`/`SliderLinear`/`SliderLog`
      consumer unmocked).
- [x] All acceptance criteria across all 6 tasks are met, except Task 4's manual browser check
      (below).
- [x] `docs/COMPONENT_LIBRARY.md` and `docs/CONSOLE_THEMING.md` both reflect the shipped feature.
- [ ] Manual check (Task 4) completed against the real running app — **Outstanding**, same
      no-browser-automation-tool gap recorded honestly above; flagged for Crawford.
- [x] `docs/todo/roadmap.md` gains the "Done" marker for 11.1.5, mirroring 11.1.2–11.1.4's own
      pattern — and, since this is the last of the 3 voxel-track sliders, may also note that
      `VoxelTrack`/`voxelTrackMath.ts`/`useVoxelTrackSlider` are now exercised by all 3 intended
      consumers and should be treated as stable, closed infrastructure going forward (spec §7).
- [ ] Ready for PR — pending Crawford's manual browser check (the one outstanding item above); every
      automated gate is green.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 2's or Task 3's extension silently regresses `SliderLinear`/`SliderLog` — both are already-shipped components with real production consumers (Volume, Sustain, Gain, Phase, Interval, Attack, Decay, Release, and more) | Medium — a subtle regression (a dropped fallback, an off-by-one in the new optional-field handling) could pass a casual glance but change real behavior | Task 2's and Task 3's acceptance criteria require an **empty** `git diff` on `SliderLinear.tsx`/`.test.tsx` and `SliderLog.tsx`/`.test.tsx` (Task 3) and on `VoxelTrack.test.tsx`'s existing cases (Task 2), not just "tests still pass" — and the shared checkpoint after both blocks Task 4 until confirmed |
| `computeVoxelBoxStatesCenteredZero`'s negative-side reversal is subtly wrong — an off-by-one in the `negativeCount - 1 - i` remapping would silently misplace which box represents "nearest the seam" vs. "nearest min" | Medium — most visible as the wrong box straddling/filling first as a negative value moves away from zero, easy to miss on a casual visual check since both boxes are adjacent | Task 1's acceptance criteria require the exact hand-derived case from spec §1.2 (`min: -50, max: 50, boxCount: 4, value: -5`) asserted literally, not just "some box fills" |
| The per-side pop-distance override (Task 2) accidentally also affects z-index, reintroducing a paint-order bug at the seam boundary (the exact failure mode spec §1.3 rejected the two-`VoxelTrack`-instances approach to avoid) | Medium — would be very easy to miss visually (z-index bugs only show up when boxes' pop-out bleeds actually overlap) | Task 2's new test explicitly asserts z-index is unaffected by the override, using a fixture where the local and global index/count values differ |
| `useVoxelTrackSlider`'s `forceEven` composed with the `verticalHeight` fitting-budget (11.1.4's own already-shipped behavior change) reintroduces a rounding edge case neither prior slider had to handle | Low — both transforms are simple, pure, and independently tested; composing them is unlikely to interact badly | Task 3's acceptance criteria include a vertical case exercising both `verticalHeight` and `forceEven` together, not just each in isolation |
| N independent `CabinetBox` timelines per slider (11.1.3 §1.2/§7's own "real risk, not fully resolvable at spec time") — this item adds the third and final voxel-track slider primitive to the same concern | Unknown — no data exists yet | Not addressed in this plan; carried forward to 11.2's performance pass exactly as 11.1.3/11.1.4 left it |

## Open Questions

Resolved during Plan (not left open):

- ~~Do Task 2 and Task 3 need to be sequential?~~ **Resolved: no — both depend only on Task 1 and
  touch disjoint files, so they may proceed in parallel**, converging at one shared checkpoint
  before Task 4.
- ~~Is the `SliderCenteredZero` rewrite split from the `sliderCenteredZeroMath.ts` deletion, the way
  11.1.4 split its hook extraction from its `SliderLinear` retrofit?~~ **Resolved: no — kept as one
  task (Task 4)**, since (per spec §6) nothing in the new component calls the old math file, so
  either half shipped alone leaves the app broken or carrying dead code, unlike 11.1.4's hook/
  retrofit split where each half was independently shippable.
- ~~Does Task 4 have to wait for both Task 2 and Task 3's *code* to exist, or their shared
  checkpoint?~~ **Resolved: their shared checkpoint** — the cheapest point in this plan to catch a
  design flaw in either extension is before a real consumer depends on both simultaneously, the same
  reasoning 11.1.4's own plan used for sequencing `SliderLog` after `SliderLinear`'s retrofit
  checkpoint rather than merely after the hook's code existed.

Carried forward from the spec's own §7, not blocking this plan:

1. **`--slider-vertical-height`'s global CSS custom property loses its last reader once this item
   ships** — a small, unrelated cleanup this plan doesn't require; not scheduled as a task here.
2. **N-timelines-per-slider performance** (11.1.3's own carried-forward risk, restated in the table
   above) — not this plan's concern to resolve or measure; 11.2's job once every 11.1.x item has
   shipped.
3. **All 3 voxel-track sliders share `useVoxelTrackSlider` once this item ships** — `voxelTrackMath.ts`/
   `VoxelTrack.tsx`/`useVoxelTrackSlider.ts` should be treated as stable, closed infrastructure from
   this point forward; any further change to any of the three is a deliberate, reviewed modification,
   not a routine follow-up.

## Post-ship refinements (beyond the original 6 tasks)

A real, shipped fix made after all 6 tasks above were already complete — found by Crawford during
the manual running-app check the "Checkpoint: Complete" gate had left outstanding, not a gap in the
original spec/plan. Recorded here for the same reason `OBLIQUE_CABINETRY_SLIDER_LOG.md`'s own task
doc records its own post-ship section: so this history isn't lost.

- **Dragging below zero correctly activated the right box, but its accent color grew left-to-right
  instead of right-to-left.** Root cause: `VoxelTrack`'s straddling slot always renders its glow
  (filled) piece as the first DOM child, which CSS positions on the box's MIN side — correct for
  `computeVoxelBoxStates`' own single min-anchored scan (and for `computeVoxelBoxStatesCenteredZero`'s
  positive side, where the min side of the straddling box genuinely is the filled side), but backwards
  for the negative side: after that side's own index reversal (spec §1.2), the filled portion of its
  straddling box is the one nearer the seam — its MAX side, not its min side. `VoxelBoxState` gained a
  3rd optional field, `flipStraddleFill` (`computeVoxelBoxStatesCenteredZero` sets it `true` for the
  negative side, `false` for the positive side; `computeVoxelBoxStates`' own output never sets it, so
  `SliderLinear`/`SliderLog` are unaffected). `VoxelTrack.tsx` stamps `data-flip="true"` on the
  straddling slot's wrapper when set; a new `VoxelTrack.css` rule swaps visual flex `order` (not DOM
  order, so the existing `:last-child` z-index rule — which must keep targeting the flat piece
  structurally regardless of which side it visually renders on — needed no change). Reproduced first
  via the Prove-It Pattern: 2 existing hand-derived exact-match tests in `voxelTrackMath.test.ts`
  updated to include the new field, plus 2 new tests (one confirming
  `computeVoxelBoxStatesCenteredZero` sets the field correctly per side, one confirming `VoxelTrack`
  stamps the attribute) — all 4 failing before the fix, all passing after. `npm test` full suite:
  123 files / 2118 tests. `npm run build:types`/`lint`/`build` clean.
