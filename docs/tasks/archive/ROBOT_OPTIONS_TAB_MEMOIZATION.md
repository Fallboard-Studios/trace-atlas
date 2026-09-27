# Implementation Plan: Robot Options Tab Memoization

Source spec: [docs/specs/ROBOT_OPTIONS_TAB_MEMOIZATION.md](../specs/ROBOT_OPTIONS_TAB_MEMOIZATION.md).
Source backlog item: [docs/todo/backlog.md #27](../todo/backlog.md#27-robot-options-whole-panel-re-renders-on-any-single-field-edit).
Seven tasks: five component-level `React.memo` (+ internal-instability) fixes, one call-site
stabilization in `RobotOptionsTab.tsx` (the task that actually changes observable re-render
behavior), and one verification/close-out pass.

## Overview

`RobotOptionsTab.tsx` rebuilds its 3 derived value objects, every `onXChange` closure, and every
`style` prop fresh on every render, and hands them to 5 section components — `RobotDisplaySection`,
`AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` — none of
which are `React.memo`-wrapped. Any single field edit anywhere in the panel re-renders all 5,
defeating even the already-memoized `AccordionContainer` (item 26) each one wraps. This is the
exact follow-up item 26's own spec predicted (§1.4/§7.5) for "every other drawer composing these
primitives." Same fix shape as item 26: `React.memo` + `useMemo`/`useCallback`, no new tools.

## Architecture Decisions

- **`RobotDisplaySection` gets `React.memo` + its own 2 internal-instability fixes, but is NOT
  expected to stop re-rendering on every edit** (spec §1.2.3) — its sole prop is the entire
  `robot` object, which is, by construction, always a new reference whenever `RobotOptionsTab`
  itself re-renders (that new reference is *why* it re-rendered). Fixing this for real would mean
  changing `RobotDisplaySectionProps` from `{ robot: Robot }` to a narrowed value shape matching
  the other 4 sections' contract — a real prop-contract change, out of scope here (flagged in the
  spec, not silently attempted). This also matches the reported symptom precisely:
  `RobotDisplaySection` isn't one of "the accordions" Crawford described (its own docstring: not
  an `AccordionContainer`).
- **The 4 accordion-wrapped sections (`AudioSettingSection`/`PingControlsDrawer`/
  `PingContourDrawer`/`SignatureArrayDrawer`) already take narrowed `value`/`onChange` props, not
  the whole `robot`** — this is what makes their fix actually effective once `RobotOptionsTab`'s
  own `useMemo`/`useCallback` keeps those narrowed values stable across edits to *other* fields.
- **Tasks 1-5 (every component's own file) are purely additive/internal** — same reasoning items
  21-23/26 used: a memoized component with an unstabilized caller is no worse off than today.
  **Task 6 (`RobotOptionsTab.tsx`) is the only task that changes observable re-render behavior.**
- **No custom `React.memo` comparator anywhere** — every real prop, once fixed, is a primitive, a
  stable schema object, or a `useMemo`'d value/style object.
- **`XxxInner`/`export const Xxx = React.memo(XxxInner)` pattern**, matching `Lfo.tsx`'s own most
  recent precedent (chosen over `RobotBody.tsx`'s inline form for the same JSDoc-readability
  reason item 26's plan gave).

## Dependency Graph

```
Task 1 (AudioSettingSection.tsx)   ─┐
Task 2 (PingControlsDrawer.tsx)    ─┤
Task 3 (PingContourDrawer.tsx)     ─┤  independent of each other
Task 4 (SignatureArrayDrawer.tsx)  ─┤
Task 5 (RobotDisplaySection.tsx)   ─┘
                                       │
                                       ▼
Task 6 (RobotOptionsTab.tsx — the actual fix) — depends on Tasks 1-5
                                       │
                                       ▼
Task 7 (manual profiler re-verification + docs close-out) — depends on Task 6
```

## Task List

### Phase 1: Component-Level Memoization

- [x] **Task 1: `AudioSettingSection.tsx` — `React.memo` + memoize the inline `Lfo` schema**

  **Description:** Split into `AudioSettingSectionInner`/`React.memo`. Replace the inline
  `schema={{ id: 'robotOptions.volume.lfo', type: 'lfo', humanLabel: displayLabel }}` (line 97)
  with a `useMemo` keyed on `displayLabel` (matching `Lfo.tsx`'s own `schema.id`-keying
  precedent for its 3 internal schemas). Pass `onVolumeLfoChange` directly to `Lfo`'s `onChange`
  instead of wrapping it in `(v) => onVolumeLfoChange(v)` (redundant — identical signature).

  **⚠ Amended during implementation:** the `resolveAccessibleName` render-count marker planned
  below was never used — `Lfo` is itself already `React.memo`-wrapped (item 26), and since a
  memo object can't be spied on via `vi.fn(actual.Lfo)` the way a plain function export can, the
  schema-stability test instead wraps `Lfo` in a small JSX-forwarding capture component (`vi.mock`
  with `importOriginal`, rendering `<actual.Lfo {...props} />` after recording `props.schema`).
  That capture wrapper is itself unmemoized, so it also works as this test's render-count proxy.

  **Acceptance criteria:**
  - [x] `AudioSettingSection.$$typeof === Symbol.for('react.memo')`.
  - [x] The `Lfo` schema object reference is stable across 2 renders with the same `displayLabel`
        (captured via the `Lfo`-wrapping mock described above); RED confirmed first (pre-fix, the
        2 captured schema objects were deep-equal but not the same reference).
  - [x] Every existing `AudioSettingSection.test.tsx` assertion passes unmodified.

  **Verification:** `npx vitest run src/components/robot/AudioSettingSection.test.tsx` passes.
  `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/robot/AudioSettingSection.tsx`,
  `src/components/robot/AudioSettingSection.test.tsx`

  **Estimated scope:** S

- [x] **Task 2: `PingControlsDrawer.tsx` — `React.memo`**

  **Description:** Split into `PingControlsDrawerInner`/`React.memo`. No internal instability
  found in this file (spec §1.2 audit) — a mechanical wrap only.

  **⚠ Amended during implementation:** the `resolveAccessibleName` render-count test planned below
  was tried first and found to be a **false test** — it passed identically with or without the
  `React.memo` wrap, because this file's schemas are already module-level constants and every
  `onChange` passes straight through unwrapped, so the already-memoized `SliderLinear`/`Toggle`/
  `Button` children bail on their own stable props regardless of whether *this* drawer re-executed.
  A delegated marker can't tell those two cases apart when the children were already stable to
  begin with. Dropped in favor of a `$$typeof` structural check only; the real end-to-end proof
  that this drawer's own memo matters lives in Task 6's cascade test, where the caller's own prop
  stability is what's actually varied.

  **Acceptance criteria:**
  - [x] `PingControlsDrawer.$$typeof === Symbol.for('react.memo')`.
  - [x] Every existing `PingControlsDrawer.test.tsx` assertion passes unmodified.

  **Verification:** `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` passes.
  `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (parallelizable with Tasks 1, 3, 4, 5).

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** XS

- [x] **Task 3: `PingContourDrawer.tsx` — `React.memo` + hoist the 2 inline `DirectionalPanel`
  schemas**

  **Description:** Split into `PingContourDrawerInner`/`React.memo`. Hoist the 2 inline schema
  objects (lines 50, 54 — `robotOptions.pingContour.topRow`/`bottomRow`) to module-level
  constants — they don't depend on any prop/state, so a plain hoist (not `useMemo`) is the
  correct, minimal fix, matching this codebase's established "schema is always a stable
  module-level reference" convention.

  **⚠ Amended during implementation:** same false-test finding as Task 2 — dropped the
  `resolveAccessibleName` render-count test. Also decided against a reference-stability test for
  the 2 hoisted schemas specifically: `DirectionalPanel`'s own `children` (this drawer's 2/4
  sliders per row) are freshly constructed by this drawer on every real re-render regardless, so
  even a stable `schema` has no observable path to a measurable win today (the exact "conditional
  benefit" item 26 §1.3 already documented for `DirectionalPanel`/`AccordionContainer`) — writing
  a test that can't actually observe anything real would be theater, not a regression guard.

  **Acceptance criteria:**
  - [x] `PingContourDrawer.$$typeof === Symbol.for('react.memo')`.
  - [x] Every existing `PingContourDrawer.test.tsx` assertion passes unmodified.

  **Verification:** `npx vitest run src/components/robot/PingContourDrawer.test.tsx` passes.
  `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (parallelizable with Tasks 1, 2, 4, 5).

  **Files:** `src/components/robot/PingContourDrawer.tsx`,
  `src/components/robot/PingContourDrawer.test.tsx`

  **Estimated scope:** XS

- [x] **Task 4: `SignatureArrayDrawer.tsx` — `React.memo`**

  **Description:** Split into `SignatureArrayDrawerInner`/`React.memo`. `RobotDriftPanel` (the
  internal component with its own `useAudioStore` subscription) is untouched — it re-renders
  independently of its parent regardless of `SignatureArrayDrawer`'s own memo status, and isn't
  reached at all when the parent bails (its own JSX is never even constructed then). No internal
  instability beyond the per-layer closures already flagged out of scope (spec §2 — these don't
  reduce anything the outer memo boundary doesn't already handle, since this component re-renders
  as one whole unit on any of its own genuine value changes).

  **⚠ Amended during implementation:** same false-test finding as Task 2 — dropped the
  `resolveAccessibleName` render-count test.

  **Acceptance criteria:**
  - [x] `SignatureArrayDrawer.$$typeof === Symbol.for('react.memo')`.
  - [x] Every existing `SignatureArrayDrawer.test.tsx` assertion passes unmodified.

  **Verification:** `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx` passes.
  `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (parallelizable with Tasks 1, 2, 3, 5).

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`,
  `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** S

- [x] **Task 5: `RobotDisplaySection.tsx` — `React.memo` + `useMemo`/`useCallback` its own 2
  internal instabilities**

  **Description:** Split into `RobotDisplaySectionInner`/`React.memo`. `useMemo` the
  `companyAssignmentSchema` (line 44), keyed on `companies`. `useCallback` the
  `handleCompanyChange` closure (line 46), keyed on `[localeId, robot.id]`. Per spec §1.2.3/
  Architecture Decisions above: this task does **not** claim to stop this component re-rendering
  on every field edit — its sole `robot` prop is always a new reference on every edit regardless.
  The `React.memo` wrap and the 2 internal fixes are still worth doing (consistency, no
  regression, and correctness if `robot`'s reference is ever unchanged for some other reason), but
  the acceptance criteria below reflect that limitation honestly rather than asserting a cascade
  fix that doesn't hold.

  **⚠ Amended during implementation:** the planned `resolveAccessibleName` marker doesn't work
  here either, for a *different* reason than Tasks 2-4 — the battery readout's `SliderLinear` is
  `readOnly`, and `SliderLinear`'s `readOnly` branch returns early without ever calling
  `resolveAccessibleName` at all (only its interactive branch does), so that marker is simply
  never invoked by this component regardless of memoization. Replaced with a capture-wrapper
  around `RadioButton` (same JSX-forwarding `vi.mock` pattern as Task 1's `Lfo` capture) — since
  the wrapper itself is unmemoized, its own call count doubles as a reliable "did this component's
  body execute" proxy, independent of whatever `RadioButton`'s own memo then does with the props.

  **Acceptance criteria:**
  - [x] `RobotDisplaySection.$$typeof === Symbol.for('react.memo')`.
  - [x] Render-count test proving the memo comparator itself works correctly (marker: the
        `RadioButton`-capture wrapper's own call count): given the exact same `robot` object
        reference across 2-3 re-renders, the body does not re-execute; given a **new** `robot`
        reference (even with identical field values), the body DOES re-execute — this second case
        is the one documenting §1.2.3's limitation, not a bug: it proves the memo is correctly
        comparing by reference, which is exactly why it can't help here in practice. RED confirmed
        first for the flat-count and schema-stability cases (verified by temporarily reverting the
        component's own fix via `git stash` on just this file, not merely reasoned about).
  - [x] `companyAssignmentSchema`'s reference is stable across a re-render (even with a new
        `robot` reference) as long as `companies` hasn't changed, and gets a new reference once
        `companies` actually changes (captured via the same `RadioButton` wrapper).
  - [x] Every existing `RobotDisplaySection.test.tsx` assertion passes unmodified.

  **Verification:** `npx vitest run src/components/robot/RobotDisplaySection.test.tsx` passes.
  `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (parallelizable with Tasks 1-4).

  **Files:** `src/components/robot/RobotDisplaySection.tsx`,
  `src/components/robot/RobotDisplaySection.test.tsx`

  **Estimated scope:** S

### Checkpoint: Component Library Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite) clean.
- [x] All 5 components confirmed `React.memo`-wrapped
      (`grep -n "React.memo" src/components/robot/*.tsx`).
- [x] Safe regardless of `RobotOptionsTab`'s own readiness (every existing consumer, including
      `CompanyOptionsSection.tsx`, still passes its own unmodified tests importing these
      now-memoized components).

---

### Phase 2: Integration — the Actual Fix

- [x] **Task 6: `RobotOptionsTab.tsx` — stabilize value/style/callback construction**

  **Description:**
  1. Hoist `OUTPUT_STYLE`/`COMPOSITION_STYLE`/`TIME_SPACE_STYLE`/`SPECTRAL_STYLE` to module-level
     constants (`getTraitColorStyle('output')` etc. — the trait argument is always a literal, so
     these never need per-render or per-instance recomputation).
  2. `useMemo` `robotColorStyle` from `getRobotColorStyle(robot.identityColor)`, deps
     `[robot.identityColor]`.
  3. `useMemo` each of `audioSettingValue`/`pingControlsValue`/`signatureArrayValue`, keyed on
     their own real scalar/reference inputs (e.g. `audioSettingValue`:
     `[robot.audioMode, robot.masterVolume, robot.lfoSettings]`).
  4. `useCallback` every `onXChange` handler passed to the 4 accordion-wrapped sections
     (`onAudioModeChange`, `onVolumeChange`, `onVolumeLfoChange`, `onDensityChange`,
     `onMotifLengthChange`, `onPitchRepeatChange`, `onOctaveMinChange`, `onOctaveMaxChange`,
     `onNoteVarianceChange`, `onResetMelody`, `onClickTrackActiveChange`, `onChange` (ADSR),
     `onContinuousChange`, `onStructuralChange`, `onLfoChange`).

  **⚠ Real bug found and fixed mid-implementation, not anticipated by the spec/plan:** the
  originally-planned `useCallback([robot, localeId])` dependency array for these handlers was
  wrong, not just imprecise. `robot` is a *new reference on every edit, regardless of which field
  changed* (confirmed elsewhere in this same plan, e.g. Task 5) — so keying every handler on
  `[robot, localeId]` made literally every handler unstable on every single edit, defeating every
  section's own memo regardless of which field the user actually touched. This surfaced as a real
  RED result while writing this task's own cascade test: a Density-only edit still re-rendered
  `AudioSettingSection`, because its `onAudioModeChange`/`onVolumeChange`/`onVolumeLfoChange` props
  all got fresh references purely because *some* field on the robot changed, not because their own
  concern did. Fixed the same way `Lfo.tsx` stabilizes its own per-field handlers (item 26 round
  1): a `useRef` (`latestRobot`) holds the current `robot`, updated in a `useEffect` (never mutated
  during render — `react-hooks/refs`), and every handler reads `latestRobot.current` at call time
  instead of closing over `robot` directly — `useCallback` deps become `[localeId]` alone, stable
  for the life of the component instance. This also required restructuring `RobotOptionsTab` into
  an outer component (store selectors + the 2 early-return guards) and an inner
  `RobotOptionsPanel({ robot: Robot; localeId })` that receives a guaranteed-non-`undefined`
  `robot` — Rules of Hooks means every `useMemo`/`useCallback`/the new `useRef`+`useEffect` must be
  called unconditionally, which isn't possible in the original single-component shape where
  `robot` could still be `undefined` at the point those hooks would need to run.

  **Acceptance criteria:**
  - [x] **The end-to-end cascade regression test this whole plan exists for** — render
        `RobotOptionsTab` for a selected robot, mutate the store directly (`updateRobot`, the same
        underlying write `applyDensity`/`applyAdsr`/etc. make, without invoking the real
        `regenerateMelody`/AudioEngine machinery those actions also call) for a single field
        (Density in one test, ADSR in another), and assert that the 3 *other* accordion-wrapped
        sections' own render-count markers did not increment while the edited section's own did.
        `RobotDisplaySection` is deliberately excluded from the "stayed flat" assertions — per
        Task 5, its own re-render rate is a separate, known, unfixed limitation. RED confirmed
        first against pre-Task-6 code (verified via `git stash` on just this file, not merely
        reasoned about) — both before AND after the `[robot, localeId]`→ref-based fix correction
        above, since the first attempt was still RED for exactly the reason described there.
  - [x] Every existing `RobotOptionsTab.test.tsx` assertion passes unmodified (26 pre-existing + 2
        new = 28 tests).
  - [x] `robotColorStyle`/the 3 value objects are confirmed (via reference-capture, not just
        "the test passed") to stay the same object reference across a re-render where their own
        real inputs didn't change.

  **Implementation Notes (resolved before starting, not left to guesswork):**
  - `RobotOptionsTab.test.tsx`'s existing 5 `vi.mock` stubs are plain functions, not
    `React.memo`-wrapped — they can't demonstrate a bail on their own. Chose to wrap this file's
    existing stub mocks in `React.memo` too (rather than a second test file that un-mocks the real
    components), keeping the existing file's own "isolate RobotOptionsTab's own wiring" boundary
    intact. Each stub calls its own `vi.fn()` render-count spy unconditionally in its body — not a
    plain incremented counter, since `react-hooks/immutability` forbids mutating a module-level
    variable during render (caught by `npm run lint`, not anticipated when the plan was written).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` full suite passes, including `CompanyOptionsSection.test.tsx` (unmodified, but
        must keep passing since it imports these now-memoized components).
  - [x] `npm run build` succeeds.

  **Dependencies:** Tasks 1-5 (every section this file renders must already be `React.memo`'d for
  this task's own stabilization to have any observable effect).

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`,
  `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** M — the highest-risk task in this plan, same posture as item 26 Task 12.

### Checkpoint: Integration Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean.
- [x] The Task 6 end-to-end cascade regression test is green and was confirmed red first.

---

### Phase 3: Verification & Close-out

- [ ] **Task 7: Manual profiler re-verification + documentation close-out**

  **Description:** No further production code changes. Same close-out shape as items 21/23-26:
  found live, fix should be confirmed live.

  **Acceptance criteria / checklist:**
  - [ ] **Genuinely deferred — needs a live browser with React DevTools:** `npm run dev`, open
        Robot Options for any robot, React DevTools Profiler ("highlight updates" or Ranked/
        Flamegraph view), edit a single field in one section (e.g. drag Density) — confirm only
        that section's own control shows real render duration/highlight, not
        `RobotDisplaySection`/the other 3 sections (per spec §5's manual check).
  - [ ] Spot-check: edit a field in each of the 4 accordion sections in turn, confirm the
        interactive behavior (slider drag, toggle, company reassignment, reset melody) is
        unchanged.
  - [x] `docs/todo/backlog.md` item 27: status line updated noting the code fix landed, linking
        this task file — not marked ☑ fixed until the live profiler check above actually runs,
        matching this backlog's own "found → fixed → live-verified" pattern.

  **Verification:**
  - [x] `npm run lint`, `npm run build:types` re-run clean after the doc edit.

  **Dependencies:** Task 6.

  **Files:** `docs/todo/backlog.md`

  **Estimated scope:** XS (no production code; live-profiler items genuinely deferred)

### Checkpoint: Complete

- [ ] Tasks 1-6's acceptance criteria met; Task 7's doc-only items done, live-profiler items
      deferred.
- [ ] `docs/todo/backlog.md` item 27 marked fixed — blocked on the live profiler check.
- [ ] Ready for human review / PR once the live-verification step runs.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A render-count test is written loosely enough that it passes even without the fix (false green) | Medium | Every task requires confirming its key regression test fails against pre-task code first, same bar items 21/22/26 held themselves to |
| `RobotDisplaySection`'s limitation (§1.2.3) gets misread later as "already fixed," leading a future session to skip the real fix (narrowing its prop shape) | Low-Medium — wasted future investigation time | Task 5's acceptance criteria explicitly test and document the reference-based limitation rather than silently asserting a guarantee that doesn't hold, matching item 26's own handling of `DirectionalPanel`/`AccordionContainer`'s conditional benefit |
| Task 6's per-field `useCallback` dependency arrays are subtly wrong (stale closure), silently reintroducing the bug | High | Task 6's acceptance criteria require reference-capture proof, not just "the UI still works"; the manual profiler check (Task 7) is the final real-world confirmation |
| Manual profiler re-check (Task 7) skipped or deferred indefinitely | Medium | Task 7 is its own phase/checkpoint; backlog item 27 explicitly not marked fixed until it runs |

## Open Questions

Resolved during this planning pass (see Architecture Decisions / Task 6 Implementation Notes):

- ~~Does `RobotDisplaySection` need a narrowed prop shape to genuinely stop re-rendering?~~
  **Resolved: yes, but out of scope** — flagged, not attempted, per spec §1.2.3.
- ~~How does the cascade test observe stub re-renders given `RobotOptionsTab.test.tsx`'s existing
  stubs aren't memoized?~~ **Resolved: wrap the existing stubs in `React.memo` too** (Task 6).

Still open, left for Crawford:

1. **`CompanyOptionsSection.tsx` follow-up** (spec §1.4/§7) — not scoped or sized here.
2. **`RobotDisplaySection`'s own narrowed-prop-shape fix**, if its re-render rate is ever worth
   addressing directly — not scoped or sized here.
