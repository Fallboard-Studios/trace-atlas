# Implementation Plan: Oblique Cabinetry Memoization

Source spec: [docs/specs/OBLIQUE_CABINETRY_MEMOIZATION.md](../specs/OBLIQUE_CABINETRY_MEMOIZATION.md).
Source backlog item: [docs/todo/backlog.md #26](../todo/backlog.md#26-oblique-cabinetry-primitives-no-memo-boundary-anywhere--whole-panels-re-render-together).
Thirteen tasks across five phases: three derived-array memoization tasks (the deepest layer of
the spec's own fix chain), two structural-memo tasks for the shared `VoxelTrack`/`CabinetBox`
rendering core, six primitive-sweep tasks covering the remaining 11 primitives, one high-risk
call-site stabilization task in `AudioRigDrawer.tsx` (the only task that actually changes
observable re-render behavior for a real consumer), and one verification/close-out pass.

## Overview

None of the 14 shared Oblique Cabinetry primitives (`src/components/ui/controls/`) are wrapped in
`React.memo`, so any single field update inside an `AudioRigEffectPanel` re-renders every sibling
control in that panel, not just the one whose value changed (confirmed live via React DevTools
Profiler during an Audio Swell tick — `AudioRigEffectPanel x36, CabinetBox x36, SliderLog x36,
SliderLinear x36`, identical counts throughout). The spec traced this to three layers, each a
precondition for the one above it: (1) `computeVoxelBoxStates`/`...CenteredZero`
(`voxelTrackMath.ts`) are pure functions called directly in `SliderLinear`/`SliderLog`/
`SliderCenteredZero`'s render bodies, returning a fresh array every call; (2) `VoxelTrack` maps
that fresh array into fresh `CabinetBox` children every render; (3) `AudioRigDrawer.tsx` builds
every `onChange` as a new inline arrow function on every render, which defeats `React.memo`'s
shallow-compare regardless of how many primitives get wrapped. This plan fixes all three layers
plus memoizes the remaining 11 primitives, matching the spec's "safe regardless of caller
readiness" framing (§1.4) — everything except the final `AudioRigDrawer.tsx` task can land, be
reviewed, and even be reverted independently with zero behavior change to the running app.

## Architecture Decisions

- **Resolves spec §7 open item 2 (CabinetBox test/GSAP-mock compatibility):** confirmed directly
  by reading `CabinetBox.test.tsx` — it already renders `CabinetBox` directly against a **local**
  `gsap` mock (`vi.mock('gsap', ...)` at the top of the file, overriding `vitest.setup.ts`'s
  global noop for this file only, capturing `fromTo`/`set` calls), the same pattern
  `useLfoTargetGroup.test.ts` already uses. It does **not** hit `BubbleStream.test.tsx`'s
  `tl.add()` gap (`BubbleStream` needed a different accommodation because it calls `.add()`, which
  this local mock never defines — `CabinetBox` never calls `.add()`). Tasks 4/5 below write
  real render-based, render-count-spy tests directly, no `BubbleStream`-style workaround needed.
- **Resolves spec §7 open item 1 (the exact `useCallback` mechanical shape in
  `AudioRigDrawer.tsx`):** a `useCallback`-wrapped `updateParam(field, value)` plus a `useMemo`-built
  **per-field onChange map** (`Record<string, (v: number) => void>`), keyed by `block.params`
  (stable — a slice of the module-level `AUDIO_RIG_CONFIG`) and `updateParam` (stable once
  memoized, since `effectKey`/`setGlobalAudio` don't change across an `AudioRigEffectPanel`
  instance's own lifetime). `paramRow` changes from building `(v) => updateParam(param.field, v)`
  inline to accepting a pre-bound `onChange` directly; `AudioRigLfoGroup` takes the same map
  instead of a raw `updateParam` prop. This is the "one memoized factory, not a `useCallback` per
  literal call site" option the spec left open — chosen because `block.params`'s field set is
  already a stable, closed list per effect (no field ever appears/disappears across an instance's
  life), so building the whole map once and reusing entries is both simpler and cheaper than
  hand-writing a `useCallback` at each of the ~9 distinct call shapes in this file (`paramRow`'s
  loop, the compressor special case's 5 direct `paramRow` calls, `AudioRigLfoGroup`'s own
  `params.map`, `driftContent`'s 2 `SliderCenteredZero`s, the Decay Mode `RadioButton`, and
  `AudioRigDrawer`'s own top-level Ping Variance slider).
- **Tasks 1-11 (every primitive/utility file) are purely additive/internal to their own file** —
  same reasoning items 21-23's plans used: a memoized component with an unmigrated caller is no
  worse off than today, never worse, so these tasks can land and be reviewed independently of
  Task 12. **Task 12 (`AudioRigDrawer.tsx`) is the only task that changes observable re-render
  behavior for a real consumer**, and is scoped, sized, and risk-flagged accordingly (see Task 12).
- **No custom `React.memo` comparator anywhere** (spec §3) — every real prop across all 16 files is
  either a primitive or a stable module-level config object; if a task's own testing surfaces an
  exception, that's a signal to fix the instability at its source (flag it), not add a comparator.
- **The `XxxInner`/`export const Xxx = React.memo(XxxInner)` pattern** (spec §4), applied uniformly
  across all 16 files, matching `Factory.tsx`/`BubbleStream.tsx`'s existing precedent in this
  codebase, chosen over `RobotBody.tsx`'s inline `memo(function RobotBody() {...})` form because
  several of these files (`CabinetBox.tsx` especially) carry extensive JSDoc anchored to the
  function declaration that reads more naturally split from the export line.

## Dependency Graph

```
Task 1 (SliderLinear.tsx — useMemo computeVoxelBoxStates)        ─┐
Task 2 (SliderLog.tsx — useMemo computeVoxelBoxStates, t-space)   ─┤  independent of each other
Task 3 (SliderCenteredZero.tsx — useMemo …CenteredZero)           ─┘
                                                                      │
                                                                      ▼
Task 4 (CabinetBox.tsx — React.memo(CabinetBoxInner))             ─┐  independent of Tasks 1-3
                                                                      │  and of each other, but
Task 5 (VoxelTrack.tsx — React.memo(VoxelTrackInner))              ─┘  Task 5's own end-to-end
                                                                         "sibling box didn't
                                                                         re-render" test needs
                                                                         Tasks 1-4 all landed
                                                                         to be meaningful
                                                                      │
                                                                      ▼
Tasks 6-11 (remaining 11 primitives, React.memo sweep) — independent of Tasks 1-5 and each other
                                                                      │
                                                                      ▼
Task 12 (AudioRigDrawer.tsx — useCallback stabilization, the actual fix) — depends on ALL of
                                                                            Tasks 1-11
                                                                      │
                                                                      ▼
Task 13 (manual profiler re-verification + docs close-out) — depends on Task 12
```

## Task List

### Phase 1: Derived-Array Memoization (layer 1 — the deepest precondition)

- [x] **Task 1: `SliderLinear.tsx` — memoize the `computeVoxelBoxStates` call site**

  **⚠ Amended during Task 12 (2026-09-15):** this task as originally written and completed only
  added the `useMemo` below — it never wrapped `SliderLinear` itself in `React.memo`, even though
  the spec's own §2 target file structure said "`React.memo` + `useMemo(computeVoxelBoxStates)`"
  for this file. The gap went undetected through Task 5's own end-to-end cascade test (that test's
  marker only observes whether `VoxelTrack`/`CabinetBox` re-execute, which doesn't require
  `SliderLinear` itself to bail — `VoxelTrack`'s own memo only cares about the *props it receives*,
  not who calls it) and was only caught by Task 12's own deeper end-to-end test, which measures
  `resolveAccessibleName` — called inside `SliderLinear`'s own render body, on `Slider.Thumb`'s
  aria-label. Fixed as part of Task 12; see that task's own entry for the full story and the
  `SliderLinearInner`/`React.memo` split + new render-count test pair added to close this gap.

  **Description:** Wrap the existing `const states = computeVoxelBoxStates(value, schema.min,
  schema.max, boxCount);` (line 56) in `useMemo`, deps `[value, schema.min, schema.max,
  boxCount]`. `voxelTrackMath.ts` itself is untouched — the fix is memoizing the call site, not
  the pure function.

  **Acceptance criteria:**
  - [x] `states` is the same array reference across two renders with identical `value`/
        `schema.min`/`schema.max`/`boxCount`.
  - [x] A spy on `computeVoxelBoxStates` (real cross-module call — confirmed genuinely
        cross-module: RED against pre-fix code showed 3 calls across mount + 2 unchanged
        re-renders, proving `vi.spyOn` on the `voxelTrackMath` namespace import observes
        `SliderLinear.tsx`'s own call, unlike item 21's same-module `selectVariantFromSeed`
        case) is called once at mount and does NOT get called again across 2 forced parent
        re-renders with unchanged `value`/`schema`/`boxCount`.
  - [x] The spy call count DOES increment when `value` changes, when `schema.min`/`schema.max`
        change, and when the fitted `boxCount` changes via a `ResizeObserver` measurement —
        proves the memo isn't over-eager on any of its 4 real dependencies.
  - [x] Both the interactive and `readOnly` render branches use the same memoized `states` — true
        by construction (one shared local variable read by both branches), not a separate test.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` passes (40 tests — 36
        pre-existing, 4 new).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes (143 files / 2589 tests).

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/SliderLinear.tsx`,
  `src/components/ui/controls/SliderLinear.test.tsx`

  **Estimated scope:** S (one call site, one new test block)

- [x] **Task 2: `SliderLog.tsx` — memoize the `computeVoxelBoxStates` call site**

  **⚠ Amended during Task 12 (2026-09-15):** same gap and fix as Task 1's own amendment note —
  `SliderLog` itself was never wrapped in `React.memo`, only its internal `states` `useMemo` was
  added. Fixed as part of Task 12.

  **Description:** Same shape as Task 1, adapted for this file's own t-space call:
  `computeVoxelBoxStates(t, 0, 1, boxCount)` (line 45), where `t = sliderLogValueToT(value,
  schema.min, schema.max)` is itself recomputed every render. `useMemo` deps: `[t, boxCount]`
  (`0`/`1` are literals, not real dependencies).

  **Acceptance criteria:** Same shape as Task 1's, adapted to this file's `t`/`boxCount` inputs —
  spy call count flat across re-renders with unchanged `value`/`schema.min`/`schema.max`/
  `boxCount` (which resolve to unchanged `t`), increments when `value` changes.
  - [x] Confirmed red first (3 calls across mount + 2 unchanged re-renders).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` passes (31 tests — 27
        pre-existing, 4 new).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes.

  **Dependencies:** None (parallelizable with Task 1, Task 3).

  **Files:** `src/components/ui/controls/SliderLog.tsx`,
  `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** S

- [x] **Task 3: `SliderCenteredZero.tsx` — memoize the `computeVoxelBoxStatesCenteredZero` call
  site**

  **⚠ Amended during Task 12 (2026-09-15):** same gap and fix as Tasks 1-2's own amendment note —
  `SliderCenteredZero` itself was never wrapped in `React.memo`, only its internal `states`
  `useMemo` was added. Fixed as part of Task 12.

  **Description:** Same shape, wrapping `computeVoxelBoxStatesCenteredZero(value, schema.min,
  schema.max, boxCount)` (line 44) in `useMemo`, deps `[value, schema.min, schema.max, boxCount]`.

  **Acceptance criteria:** Same shape as Tasks 1-2's, spying on
  `computeVoxelBoxStatesCenteredZero` instead.
  - [x] Confirmed red first (3 calls across mount + 2 unchanged re-renders). Note: the
        boxCount-change regression test needed a 500px fire (not 288px, used elsewhere in the
        existing file) — 288px happens to resolve to the same forced-even count (4) as the
        default unmeasured state, which would have been a false negative.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx` passes (29 tests
        — 25 pre-existing, 4 new).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes (one unrelated flake in `audioSwells.test.ts` on the
        combined run — confirmed clean, 65/65, in isolation; known random-seeded flake pattern,
        not caused by this task).

  **Dependencies:** None (parallelizable with Task 1, Task 2).

  **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`,
  `src/components/ui/controls/SliderCenteredZero.test.tsx`

  **Estimated scope:** S

### Checkpoint: Layer 1 Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite) clean.
- [x] All 3 sliders' `states`/`voxelTrackMath.ts` call counts confirmed flat across unchanged-prop
      re-renders — the referential stability `VoxelTrack`'s own memo (Task 5) depends on now
      exists.

---

### Phase 2: Structural Memo — the Shared Rendering Core

- [x] **Task 4: `CabinetBox.tsx` — `React.memo(CabinetBoxInner)`**

  **Description:** Split the existing `export function CabinetBox(...)` into
  `function CabinetBoxInner(...)` (body unchanged) + `export const CabinetBox =
  React.memo(CabinetBoxInner);`. No internal logic changes — GSAP timeline handling
  (`timelineMap`, `setTimeline`/`killTimeline`), the `ResizeObserver`, and every existing prop
  stay byte-identical.

  **Acceptance criteria:**
  - [x] `CabinetBox.$$typeof === Symbol.for('react.memo')`.
  - [x] A render-count test: mount `CabinetBox` inside a re-rendering parent that passes
        identical props (`popped`, `timelineKey`, `children`, etc.) each time; assert the inner
        render body does not re-execute on the second/third render. The marker used is a spy on
        `useCabinetBoxHeight` (real cross-module hook, called unconditionally in the render body —
        `computeCabinetFrontFaceOffset`, this file's only other spy-able import, is called from
        inside an *effect*, not synchronously during render, so it can't tell "did the render body
        run" apart from "did the effect's own separate dependency check re-fire"; found while
        writing Task 5's own end-to-end test below). Confirmed red first (3 calls across mount + 2
        unchanged re-renders).
  - [x] The same test, with one prop changed (`popped`), confirms the render body DOES
        re-execute.
  - [x] Every existing `CabinetBox.test.tsx` assertion passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes (69 tests — 66
        pre-existing, 3 new).
  - [x] `npm run build:types`, `npm run lint` clean (one import-order autofix needed after adding
        the new `vi.mock`/import).
  - [x] `npm test` full suite passes.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/CabinetBox.tsx`,
  `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** S (mechanical split; the file's real complexity is in its existing
  unchanged internals, not this task's diff)

- [x] **Task 5: `VoxelTrack.tsx` — `React.memo(VoxelTrackInner)`**

  **Description:** Same split pattern: `function VoxelTrackInner({ states, boxSize, gap, axis,
  timelineKeyPrefix }: VoxelTrackProps)` + `export const VoxelTrack =
  React.memo(VoxelTrackInner);`. No internal logic changes.

  **Acceptance criteria:**
  - [x] `VoxelTrack.$$typeof === Symbol.for('react.memo')`.
  - [x] Render-count test (spy on `computeVoxelBoxZIndex`, called once per state unconditionally
        in the `.map()` body): a stable `states` array reference across 2-3 forced parent
        re-renders leaves the render body un-re-executed. Confirmed red first.
  - [x] The same test with a **new** (but deep-equal) `states` array reference on each render
        confirms the render body DOES re-execute — proves Task 1's memoization is a real
        precondition, not incidental.
  - [x] **The end-to-end regression test this whole plan exists for** — new file
        `src/components/ui/controls/CabinetryCascade.test.tsx`: renders the REAL
        `SliderLinear -> VoxelTrack -> CabinetBox` chain (no mocks between them), spies on
        `useCabinetBoxHeight` (called once by `SliderLinear`'s own `useVoxelTrackSlider`, once per
        real `CabinetBox` render). A `SliderLinear` re-render with unchanged `value`/`schema`
        produces exactly a `+1` delta (SliderLinear's own fixed, unmemoized-root contribution) —
        zero from any `CabinetBox`. Confirmed both ways: this test was RED with `VoxelTrack`'s
        memo temporarily reverted (delta was `+5`, i.e. every box re-rendered, not just
        `SliderLinear`'s own baseline) and GREEN with it restored — proving `CabinetBox`'s own
        memo (Task 4) alone is NOT sufficient; `VoxelTrack` rebuilding fresh `children` divs every
        render defeats every `CabinetBox`'s own shallow-compare bail-out regardless, exactly the
        mechanism spec §1.2.2 describes.
  - [x] Every existing `VoxelTrack.test.tsx` assertion passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/VoxelTrack.test.tsx
        src/components/ui/controls/CabinetryCascade.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes (144 files / 2606 tests).

  **Dependencies:** Tasks 1, 2, 3 (states referential stability), Task 4 (`CabinetBox` itself
  memoized, so the end-to-end test's "nothing downstream re-executes" claim is actually true all
  the way down, not just at `VoxelTrack`'s own top level).

  **Files:** `src/components/ui/controls/VoxelTrack.tsx`,
  `src/components/ui/controls/VoxelTrack.test.tsx`,
  `src/components/ui/controls/CabinetryCascade.test.tsx` (new)

  **Estimated scope:** S–M (the mechanical split is small; the end-to-end regression test is the
  part worth budgeting real time for — it's the test that actually proves the mechanism, same
  category as item 21 Task 4's `shiftHSL` spy). Ran meaningfully over — the first two marker
  designs for the end-to-end test each had a real flaw (see Task 4/5's own acceptance-criteria
  notes above) caught only by actually trying to force a RED before trusting the GREEN.

### Checkpoint: Structural Core Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite, 144 files / 2606 tests) clean.
- [x] The end-to-end "a slider with unchanged value/schema re-renders zero of its own
      `CabinetBox`es" test is green, and was confirmed red (by temporarily reverting `VoxelTrack`'s
      own memo) before trusting it.
- [ ] Review with human before proceeding — this is the last checkpoint before the broader
      primitive sweep, which depends on this chain actually working.

---

### Phase 3: Remaining Primitives — `React.memo` Sweep

Every task in this phase is the same mechanical shape (`XxxInner` split + `React.memo` + a
`$$typeof`/render-count test pair per component) applied to self-contained primitives per the
spec's own per-primitive audit (§1.3) — no `computeVoxelBoxStates`-style prerequisite, since none
of these take a `VoxelTrack`-derived array. Grouped in pairs to keep each task's file count small;
order within this phase doesn't matter (all independent of each other and of Phase 2's `Xxx`
exports, though they compose `CabinetBox`/`DualLabel` internally, already memoized by Task 4).

- [x] **Task 6: `DualLabel.tsx` + `Button.tsx`** — `React.memo`, each. `DualLabel`'s own props
  (`loreLabel?`, `humanLabel?`) are always plain strings off a stable `schema` — trivially
  memo-safe (spec §1.3's own note: its benefit is realized once its *parent* primitive bails, so
  `DualLabel` is never even reached — still worth memoizing directly for the cases where it is).
  `Button` composes `CabinetBox` + `DualLabel` internally, no caller-supplied `children`.

  **Acceptance criteria (each component):** `$$typeof === Symbol.for('react.memo')`; a
  render-count test proves a re-render with identical props doesn't re-execute the body, and a
  changed prop (e.g. `Button`'s `disabled`, `DualLabel`'s `humanLabel`) does. Every existing test
  in `DualLabel.test.tsx`/`Button.test.tsx` passes unmodified.
  - [x] `DualLabel` has no hook or cross-module utility call in its render body to spy on — a
        `$$typeof`-only structural test, matching item 23's `BubbleStream.test.tsx` precedent for
        when a real render-based test isn't practical (confirmed via direct read, not assumed).
  - [x] `Button` render-count marker: `resolveAccessibleName(schema)`, called unconditionally.
        Confirmed red first (all 3 new tests failed against pre-fix code).

  **Verification:** `npx vitest run src/components/ui/controls/DualLabel.test.tsx
  src/components/ui/controls/Button.test.tsx` passes (5 + 17 = 22 tests, 3 new). `npm run
  build:types`, `npm run lint` clean.

  **Dependencies:** Task 4 (`CabinetBox` memoized — not required for these tests to pass, but
  required for the memo to be worth anything downstream).

  **Files:** `DualLabel.tsx`/`.test.tsx`, `Button.tsx`/`.test.tsx` (all under
  `src/components/ui/controls/`)

  **Estimated scope:** S

- [x] **Task 7: `Toggle.tsx` + `TextInput.tsx`** — same shape. Note: `Toggle` sometimes receives
  caller-supplied `children` (Header's Mute switch) — memoize it anyway (spec §1.3's conditional
  case), same as `AccordionContainer`/`DirectionalPanel` below; document in the render-count test
  that the "no-children" call shape is the one with a guaranteed bail-out.

  **Acceptance criteria / Verification / Dependencies / Files / Scope:** same shape as Task 6,
  for `Toggle.tsx`/`.test.tsx`, `TextInput.tsx`/`.test.tsx`. Marker for both: `resolveAccessibleName`.
  - [x] `Toggle`'s bare (no-children) call shape confirmed to bail (flat count across unchanged
        re-renders); the children-bearing call shape confirmed to still re-execute when the
        caller constructs an actual *element* inline (`<span>🔊</span>`) — caught a test-design
        bug first: a bare string child (`🔊` alone) is already `Object.is`-stable across renders
        of the same literal, so it didn't actually demonstrate the conditional-benefit case at
        all; fixed before treating the test as meaningful.
  - [x] Both confirmed red first. `npx vitest run` passes (17 + 35 = 52 tests, 2 + 3 = 5 new).
        `npm run build:types`, `npm run lint` clean.

- [x] **Task 8: `Stepper.tsx` + `StepperWithToggle.tsx`** — same shape.

  **Files:** `Stepper.tsx`/`.test.tsx`, `StepperWithToggle.tsx`/`.test.tsx`

  **Acceptance criteria:** `$$typeof`/render-count pair for both, marker `resolveAccessibleName`
  for both — `StepperWithToggle` has no hook/utility call of its own, but it unconditionally
  composes `Toggle` + `Stepper` (each of which calls `resolveAccessibleName` internally); if
  `StepperWithToggle` bails, its body never constructs either child element, so neither of their
  own calls fire either — the total count is still a valid "did this subtree's root bail" signal
  (same reasoning as the `CabinetryCascade.test.tsx` end-to-end test, Task 5). Confirmed red first
  (4 failures: both `$$typeof` checks, both "unchanged re-render" counts).

  **Verification:** `npx vitest run` passes (11 + 12 = 23 tests, 3 + 3 = 6 new). `npm run
  build:types`, `npm run lint` clean.

- [x] **Task 9: `CoordsInput.tsx` + `RadioButton.tsx`** — same shape. `RadioButton` renders one
  `CabinetBox` per option (spec §1.3) — its own memo benefit still depends on `CabinetBox` (Task
  4) and on `RadioButton` itself not rebuilding fresh `children` per option on every render, which
  this task's own memoization doesn't change (each option's `children` is still built fresh
  inside `RadioButton`'s own render body when it DOES run) — that's expected and fine: the goal is
  `RadioButton` bailing entirely when its own props are unchanged, not eliminating its internal
  per-option construction when it does run.

  **Files:** `CoordsInput.tsx`/`.test.tsx`, `RadioButton.tsx`/`.test.tsx`

  **Acceptance criteria:** `$$typeof`/render-count pair for both, marker `resolveAccessibleName`
  for both — `CoordsInput` composes 2 `TextInput`s the same "bailed subtree root stops everything
  beneath it" way `StepperWithToggle`/Task 8 does; `RadioButton` calls it directly. Confirmed red
  first (4 failures). `npx vitest run` passes (15 + 30 = 45 tests, 3 + 3 = 6 new). `npm run
  build:types`, `npm run lint` clean.

- [x] **Task 10: `Lfo.tsx` + `AccordionContainer.tsx`** — same shape. `AccordionContainer` takes
  caller-supplied `children` (like `Toggle`) — same conditional-benefit note as Task 7.

  **Files:** `Lfo.tsx`/`.test.tsx`, `AccordionContainer.tsx`/`.test.tsx`

  **Acceptance criteria:** `Lfo` marker `resolveAccessibleName` (bailed-subtree reasoning, same as
  Tasks 8/9 — composes `RadioButton` + 2 `SliderLinear`s). `AccordionContainer` marker
  `withActiveClass`, called unconditionally on its own root; confirmed both the bare-string
  `children` case (bails) and an inline-element `children` case (still re-executes, conditional
  benefit) — same distinction Task 7's `Toggle` test documents. Confirmed red first (4 failures).
  `npx vitest run` passes (14 + 28 = 42 tests, 3 + 4 = 7 new). `npm run build:types`, `npm run
  lint` clean.

- [x] **Task 11: `DirectionalPanel.tsx`** — solo task (the spec's own §1.3 flags it individually
  for its conditional-benefit case; confirmed via direct read of the file: every real call site
  in this codebase constructs its `children` inline — e.g. `AudioRigDrawer.tsx`'s own
  `<DirectionalPanel schema={...}>{...inline JSX...}</DirectionalPanel>` — so `React.memo` here
  is correct to add (never harmful) but won't itself produce a measurable win until/unless a
  caller's own children construction becomes referentially stable, which is out of this plan's
  scope). Document this plainly in the component's own comment, matching §3's requirement.

  **Acceptance criteria:** `$$typeof === Symbol.for('react.memo')`; existing
  `DirectionalPanel.test.tsx` assertions pass unmodified; one new test explicitly demonstrating
  the "inline children defeats the memo" case (a re-render with freshly-constructed but
  deep-equal `children` still re-executes) alongside one proving a **stable** `children` reference
  (e.g. hoisted to a variable outside the render) DOES bail — documents the real, conditional
  nature of this primitive's benefit rather than silently asserting a guarantee that doesn't hold.
  - [x] Marker: `useResponsivePanelOrientation`, called unconditionally. Confirmed red first (2
        failures: `$$typeof` and the stable-children flat-count test).

  **Verification:** `npx vitest run src/components/ui/controls/DirectionalPanel.test.tsx` passes
  (25 tests, 4 new). `npm run build:types`, `npm run lint` clean.

  **Files:** `DirectionalPanel.tsx`, `DirectionalPanel.test.tsx`

  **Estimated scope:** S

### Checkpoint: Primitive Library Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite, 144 files / 2640 tests) clean.
      `npm run build` also confirmed clean.
- [x] All 16 files (`CabinetBox`, `VoxelTrack`, + the 14 documented primitives) are
      `React.memo`-wrapped, confirmed via `grep -rL "React.memo\|= memo(" src/components/ui/controls
      --include="*.tsx" | grep -v test` — returned only `LfoTargetGroup.tsx`/`PanelGroup.tsx`, both
      explicitly out of this spec's scope (not among the 16 target files — `PanelGroup` is a plain
      flex wrapper per `AudioRigDrawer.tsx`'s own comment, `LfoTargetGroup` a different, hook-based
      component).
- [x] The primitive-library half of the fix is complete and safe regardless of any caller's own
      readiness (§1.4) — every existing drawer (`RobotOptionsTab`, `SectorSettingsDrawer`, etc.)
      still passes its own unmodified tests, importing these now-memoized components.
- [x] Review with human before Task 12 — the one task that actually changes `AudioRigDrawer.tsx`'s
      observable behavior. Confirmed directly with Crawford before starting.

---

### Phase 4: Integration — the Actual Fix

- [x] **Task 12: `AudioRigDrawer.tsx` — callback stabilization**

  **Real-world correction found while implementing this task:** the end-to-end cascade regression
  test (below) went RED→GREEN once for the callback restructure, but a sibling field still got one
  extra re-render (`resolveAccessibleName` call) after the fix. Debugging (a temporary render
  counter + reference-identity log inside `AudioRigEffectPanel`, removed before commit) confirmed
  `fieldOnChange`/`updateParam` WERE stable across the re-render — the real cause was upstream:
  **Tasks 1-3 (`SliderLinear`/`SliderLog`/`SliderCenteredZero`) had only added the internal
  `states` `useMemo`, never actually wrapped the component itself in `React.memo`** — a gap in the
  original task breakdown, not caught because those tasks' own render-count tests only exercised
  the `computeVoxelBoxStates` call count, never asked whether the *component* itself bailed. Fixed
  as part of this task (same `XxxInner`/`React.memo` split every other primitive already got, plus
  a `resolveAccessibleName`-based render-count test pair per slider, matching Task 6's own
  pattern) — see the 3 sliders' own file entries below.

  **Description:** Per the resolved mechanical shape (Architecture Decisions above):
  1. In `AudioRigEffectPanel`, wrap `updateParam` in `useCallback`, deps `[effectKey,
     setGlobalAudio]`.
  2. Add a `useMemo`-built `fieldOnChange: Record<string, (v: number) => void>`, one entry per
     `block.params[i].field`, each `(v) => updateParam(field, v)`, deps `[block.params,
     updateParam]`.
  3. Change `paramRow(param, effect, updateParam)` to `paramRow(param, effect, onChange)`,
     replacing its internal `(v) => updateParam(param.field, v)` construction with the passed-in
     `onChange` directly. Update all 6 call sites (the generic `block.params.map(...)` path, and
     the compressor special case's 5 direct `paramRow` calls) to pass `fieldOnChange[param.field]`.
  4. Change `AudioRigLfoGroupProps.updateParam: (field, value) => void` to
     `fieldOnChange: Record<string, (v: number) => void>`; update `AudioRigLfoGroup`'s own
     `params.map(...)` to use `fieldOnChange[param.field]` instead of building
     `(v) => updateParam(param.field, v)` inline; update `AudioRigEffectPanel`'s own
     `<AudioRigLfoGroup updateParam={updateParam} .../>` call to pass `fieldOnChange` instead.
  5. Wrap `AudioRigLfoGroup`'s own `onChange={(v) => setGlobalLfo(selectedTarget, v)}` (the `Lfo`
     component's prop) in `useCallback`, deps `[selectedTarget, setGlobalLfo]`.
  6. Wrap `driftContent`'s two `SliderCenteredZero` `onChange`s (`rateDrift`/`depthDrift`) in
     `useCallback` inside `AudioRigEffectPanel`, deps `[driftGroup, setGlobalLfoDrift]` each.
  7. Wrap the compressor special case's `RadioButton onChange={(v) =>
     setCompressorBeforeDelay(v === 'controlled')}` in `useCallback`, deps
     `[setCompressorBeforeDelay]`.
  8. In `AudioRigDrawer` itself, wrap the top-level Ping Variance Automation slider's
     `onChange={(v) => setPingVarianceAutomation(v / 100)}` in `useCallback`, deps
     `[setPingVarianceAutomation]` (the BPM slider's `onChange={setBPM}` is already a stable store
     action — no change needed).

  **Acceptance criteria:**
  - [x] Every prop passed into a now-`React.memo`'d primitive from this file
        (`SliderLinear`/`SliderLog`/`SliderCenteredZero`/`Stepper`/`RadioButton`/`Lfo`) is
        referentially stable across an `AudioRigEffectPanel` re-render triggered by an unrelated
        field's value changing.
  - [x] **The end-to-end cascade regression test this whole spec exists for:** added to
        `AudioRigDrawer.test.tsx` — renders the real `AudioRigDrawer`, changes ONE field's value
        via a simulated `setGlobalAudio` call (mirroring an audio-swell tick: `delay.delayTime`,
        and separately the compressor's hand-composed `threshold`), and asserts a **sibling**
        field's own `resolveAccessibleName` call count (filtered by `schema.id`, since every
        control in the panel shares the one spy) stays flat while the changed field's own count
        increases. A third test confirms cross-effect isolation (item 18's own pre-existing fix)
        still holds. Confirmed red first against pre-Task-12 code (both same-block tests failed);
        confirmed the *fully* green state only after also finding and fixing the Tasks 1-3
        `React.memo` gap above — the naive callback-only fix reduced but did not eliminate the
        cascade (a real, measured partial fix, not assumed complete from a passing subset of
        tests).
  - [x] Every existing `AudioRigDrawer.test.tsx` assertion passes unmodified (72 tests total, 3
        new) — all interactive behavior (dragging a slider, the Decay Mode radio, LFO target
        selection) is unchanged.
  - [x] `fieldOnChange`/`updateParam` confirmed stable via direct reference-identity debugging
        (temporary, removed before commit) — not just inferred from the test passing.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes (72
        tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes (144 files / 2652 tests, run twice to confirm no flake; one
        run each time logged an unrelated vitest-worker RPC timeout ("Timeout calling
        onTaskUpdate") as an *unhandled error*, not a test failure — infra/system-load noise from
        the long run, not a regression from this change).
  - [x] `npm run build` succeeds.

  **Dependencies:** Tasks 1-11 (every primitive this file renders must already be `React.memo`'d
  for this task's own stabilization to have any observable effect — per Architecture Decisions,
  this is the ONE task where that matters). Turned out to also depend on **fixing** Tasks 1-3
  properly (see the correction note above) — a dependency the original plan assumed was already
  satisfied but wasn't.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`,
  `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, plus the Tasks 1-3 correction:
  `SliderLinear.tsx`/`.test.tsx`, `SliderLog.tsx`/`.test.tsx`, `SliderCenteredZero.tsx`/`.test.tsx`

  **Estimated scope:** L by file count (1-2 files) but the highest-risk, most intricate diff in
  this plan — touches 3 components' worth of callback plumbing in one file. Budget a full focused
  session, not a quick edit; same posture as item 21's own Task 4 note ("this is the task the
  entire plan exists to protect") — turned out to be accurate: the task also surfaced and required
  fixing a real gap in 3 already-committed earlier tasks.

### Checkpoint: Integration Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite, 144 files / 2652 tests),
      `npm run build` all clean.
- [x] The Task 12 end-to-end cascade regression test is green and was confirmed red first — twice,
      once for the callback restructure alone (partial fix) and again after finding the deeper
      Tasks 1-3 gap.

---

### Phase 5: Verification & Close-out

- [x] **Task 13: Manual profiler re-verification + documentation close-out** (doc-only items
  done; live-profiler items genuinely deferred — see below)

  **Description:** No further production code changes. Closes the loop the same way items 21/23-
  25 did: the bug was found live via React DevTools Profiler; the fix should be confirmed the same
  way.

  **Live-verification round 1 (Crawford, React DevTools "highlight updates", 2026-09-15):**
  ran the manual check below for real and found the code fix didn't fully hold — LFO-bearing
  blocks (`eq3`/`filterLPF`/`filterHPF`) still showed their whole subtree re-rendering on every
  swell tick, not just the swelling field. Two follow-up fixes landed as a direct result, each
  with its own RED→GREEN regression test:
  - `AudioRigLfoGroup` (`AudioRigDrawer.tsx`) built its own `Lfo` schema (+2 `DirectionalPanel`
    schemas) as a fresh inline object every render — Task 12's own cascade tests never covered
    this path (only Delay/Compressor, neither LFO-bearing). Fixed via `useMemo`.
  - `Lfo.tsx` itself built its own 3 internal schemas + onChange closures fresh every render too
    — once Lfo's own memo bailed correctly at the group level, this was the remaining cause of
    its 3 fields (Shape/Rate/Depth) re-rendering each other unnecessarily. Fixed via `useMemo` +
    per-field `useCallback` (latest value/onChange read from a ref, updated in an effect per
    `react-hooks/refs`, not mutated during render).

  Both fixes are code-complete and unit-tested; **the live-browser re-check below still hasn't
  run against them** — do that before treating this round as closed.

  **Acceptance criteria / checklist:**
  - [ ] **Genuinely deferred — needs a live browser with React DevTools, not available in this
        session:** `npm run dev`, open Audio Rig, let an Audio Swell run, Profiler Ranked/
        Flamegraph view — confirm only the actually-swelling field's own control shows real
        render duration, not the whole panel (per spec §5's own manual check), **including the 3
        LFO-bearing blocks** specifically, now that round 1's 2 fixes are in.
  - [ ] Deferred alongside the above: spot-check that dragging a slider, toggling the Decay Mode
        radio, and switching an LFO target all still work exactly as before — a pure perf
        refactor, zero behavioral change expected.
  - [x] `docs/COMPONENT_LIBRARY.md` update (spec §6): added a new "`React.memo` boundary" section
        (before the Primitives table) — all 16 files (14 primitives + `DualLabel` + `VoxelTrack`,
        `CabinetBox` too) are `React.memo`-wrapped; consumers must pass a stable `onChange`
        (`useCallback`, or a memoized per-field map as `AudioRigDrawer.tsx` now does) to actually
        benefit; `AccordionContainer`/`DirectionalPanel`/`Toggle`'s own conditional-benefit
        `children` case documented explicitly, not silently asserted as a guarantee; names the
        other drawers still needing the same follow-up treatment.
  - [x] `docs/todo/backlog.md` item 26: status line added noting the code fix landed, linking this
        task file and the spec, and documenting the Tasks 1-3 correction — **not** marked fixed
        until the live profiler check above actually runs, matching this backlog's own
        "found → fixed → live-verified" pattern (confirmed against item 21's own exact phrasing
        before writing this, since a first draft of this line mistakenly used the ☑ checkmark
        item 21 only earns once live-verified).

  **Verification:**
  - [x] `npm run lint`, `npm run build:types` re-run clean after the doc edits.

  **Dependencies:** Task 12.

  **Files:** `docs/todo/backlog.md`, `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (no production code; doc edits land now, live-profiler items genuinely
  deferred to a live browser)

### Checkpoint: Complete

- [x] Tasks 1-12's acceptance criteria met; Task 13's doc-only items done, live-profiler items
      deferred.
- [x] `npm run build:types`, `npm run lint`, `npm test` (144 files / 2652 tests), `npm run build`
      all clean.
- [ ] Live profiler check recorded and confirms only the swelling field re-renders — open, needs a
      live browser (Crawford, or a future session with one).
- [ ] `docs/todo/backlog.md` item 26 marked fixed — blocked on the live profiler check.
- [x] Ready for human review / PR — code and docs are ready; the live-verification step above is
      the one remaining gate before calling this fully closed, same posture as item 21's plan.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A render-count/`useMemo` regression test is written loosely enough that it passes even without the fix (false green) | Medium — the tests that actually prove each layer works silently don't | Every task explicitly requires confirming its key regression test fails against pre-task code before being treated as done, same bar item 21/22 held themselves to |
| Task 12's `fieldOnChange` map or one of its dependent `useCallback`s has a stale/incorrect dependency array, silently reintroducing the exact bug this plan fixes (an onChange that looks stable but isn't, or one that goes stale and calls a wrong `updateParam`) | High — would ship code that passes every unit test in isolation but never actually stops the cascade in the real app | Task 12's own acceptance criteria require a reference-identity assertion on `fieldOnChange` across renders, not just "the UI still works"; the manual profiler check (Task 13) is the final real-world confirmation this doesn't happen |
| `DirectionalPanel`/`AccordionContainer`/`Toggle`'s conditional-benefit memoization (Tasks 7, 10, 11) gets treated as a guaranteed win in the close-out docs, misleading a future session into skipping the real fix (stabilizing a caller's own `children` construction) for these | Low-Medium — wasted future investigation time | Task 11's own acceptance criteria require a test that explicitly demonstrates the "inline children defeats the memo" case, and the Architecture Decisions/§1.3 framing is carried into the Task 13 `docs/COMPONENT_LIBRARY.md` update |
| Manual profiler re-check (Task 13) is skipped or deferred indefinitely | Medium — the actual perf claim goes unverified in the real app despite all tests passing | Task 13 is its own phase/checkpoint, not folded into Task 12's "done" state; `docs/todo/backlog.md` item 26 explicitly not marked fixed until this step's numbers are recorded |

## Open Questions

Resolved during this planning pass (see Architecture Decisions for full reasoning):

- ~~**Spec §7 item 1 — exact `useCallback` mechanical shape in `AudioRigDrawer.tsx`?**~~
  **Resolved: `useCallback`-wrapped `updateParam` + a `useMemo`-built per-field `onChange` map**,
  threaded through `paramRow` and `AudioRigLfoGroup`'s own prop shape. See Task 12.
- ~~**Spec §7 item 2 — does `CabinetBox.test.tsx` already render directly, or hit
  `BubbleStream`'s `tl.add()` gap?**~~ **Resolved: renders directly**, against its own local
  `gsap` mock — confirmed by reading the file. No workaround needed.

Still open, left for Crawford (spec §7 items 3-5, unchanged by this plan):

1. **Branch choice.** This plan defaults to continuing on `refactor/factory-timing` (same branch
   items 21-25 landed on, and the spec's own stated default) — flag before Task 1 if a fresh
   branch is preferred instead.
2. **Follow-up drawers** (`RobotOptionsTab`/`RobotAudioTab`/`RobotOscillatorsTab`,
   `SectorSettingsDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`,
   `AudioSettingSection`, `CompanyManager`/`CompanyButtonRow`, `Header.tsx`'s nav `RadioButton`) —
   each likely carries the identical unstabilized-inline-closure pattern `AudioRigDrawer.tsx` had,
   and each needs its own follow-up spec/task pass to benefit from Tasks 1-11's primitive-library
   fix. Not scoped or sized here, same as the source spec left it.
