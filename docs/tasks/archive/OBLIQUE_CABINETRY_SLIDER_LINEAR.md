# Implementation Plan: Oblique Cabinetry — SliderLinear (Voxel-Track Foundation) (Roadmap Phase 11.1.3)

Source spec: [docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md](../specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md). Source intent: [docs/intent/oblique-cabinetry-slider-linear.md](../intent/oblique-cabinetry-slider-linear.md). Pure presentation change — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `SliderLinearSchema`/`ControlSchema` change (box count is derived, never schema-authored). The roadmap's own stale "box-height-scaled" wording (spec §1.12) was already corrected directly in `docs/todo/roadmap.md` in the same session that produced this spec — **not a task in this plan**, already done.

## Overview

Ship the shared voxel-track rendering mechanism — a new breakpoint-driven gap constant, the dual-fill/extrusion-falloff/fill-color math, a self-fitting box-count hook, and the `VoxelTrack` component itself (N `CabinetBox` instances standing in for a track+handle) — then wire `SliderLinear`, this item's only real consumer, through it. This is a bigger lift than either prior Cabinetry item: unlike `Toggle` (11.1.2), which reused `CabinetBox` unmodified, this phase both widens `CabinetBox` itself (§ spec 1.1, a real change to an already-shipped, heavily-tested reference component) and builds a genuinely new rendering shape on top of it. Foundation modules (the breakpoint constant + hook refactor, the pure voxel-track math, the `CabinetBox` widening) are independent of each other and ship first, in parallel; the box-count hook depends on the math module; `VoxelTrack` depends on both the math module and the widened `CabinetBox`; `SliderLinear` — the only file with real user-facing behavior change — depends on everything above it and ships last, before docs.

## Architecture Decisions

- **Tasks 1–3 (breakpoint/hook refactor, voxel-track math, `CabinetBox` widening) are independent and genuinely parallelizable** — confirmed against the spec's own file list: `voxelTrackMath.ts` has zero imports from `cabinetBreakpoints.ts`/`useCabinetBoxHeight.ts`, and `CabinetBox.tsx`'s `popped`-widening touches neither. Mirrors `docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md`'s own Tasks 1–3 parallelization, not `docs/tasks/OBLIQUE_CABINETRY_TOGGLE.md`'s strictly-sequential shape (that phase had only one foundation change).
- **`CabinetBox.tsx`'s `popped` widening is its own task (Task 3), not folded into `VoxelTrack` (Task 5)** — same "component before consumer" risk-isolation reasoning `OBLIQUE_CABINETRY_FOUNDATION.md`'s Task 5→6 split and `OBLIQUE_CABINETRY_TOGGLE.md`'s Task 1→2 split both already established, but sharper here: this task modifies an **already-shipped** primitive two prior items depend on, not a brand-new one. Task 3's own acceptance criteria require `Button.test.tsx`/`Toggle.test.tsx` to stay green *unmodified* — proving the widening is genuinely behavior-preserving for both existing consumers *before* `VoxelTrack` starts depending on the new fractional capability.
- **A real imprecision in the spec's own §1.4 framing, caught during this planning pass, not left to surface during implementation:** the spec describes `useCabinetBoxHeight()`/`useVoxelTrackGap()` sharing tier-resolution as "one `matchMedia` listener pair, two derived values" — true of the *logic/constants* (both hooks resolve off the same `resolveTier()`/`CABINET_BREAKPOINT_*` source, so they can never disagree), but **not** literally true of listener *count*: `SliderLinear.tsx` calls both hooks, and each is its own `useEffect`, so a component using both still mounts two independent `matchMedia` listener pairs (four listeners), not one. What's actually deduplicated is the tier-resolution constants/logic — the exact class of duplication `OBLIQUE_CABINETRY_FOUNDATION.md` §1.3/§1.9 already found and fixed once — not the subscription itself. Not worth a bigger refactor (a shared context/module-level cache) to save two listeners; Task 1's acceptance criteria are worded to test the *logic-sharing* guarantee (both hooks always agree on tier) rather than a false "single listener" claim.
- **`VoxelTrack` ships with zero real consumers first (Task 5), before `SliderLinear` (Task 6) wires it in** — same "component before consumer" sequencing every prior Cabinetry item used, isolating a geometry/fill-math mistake to Task 5 alone rather than conflating it with `SliderLinear`'s own, larger set of changes.
- **`SliderLinear` (Task 6) is the highest-risk task in this plan, flagged explicitly** — unlike `Button`/`Toggle`'s own consumer-wiring tasks (mechanical, against an already-proven primitive with an unchanged props contract), this task both integrates 4 upstream modules for the first time *and* makes a real, user-visible behavior change (`verticalHeight` becomes a fitting budget, not a literal value — spec §1.7) requiring 3 existing tests to be rewritten, not just extended. Sized **M**, not S, for the same reason `OBLIQUE_CABINETRY_FOUNDATION.md`'s own `CabinetBox` task (Task 5 there) was upsized despite a similar file count.
- **The 2 docs tasks (7, 8) depend on different upstream tasks and can run in parallel with each other** — `docs/CONSOLE_THEMING.md`'s dual-fill/extrusion-falloff notes only need `VoxelTrack` (Task 5) finished; `docs/COMPONENT_LIBRARY.md`'s `SliderLinear` note needs Task 6. Identical split to `OBLIQUE_CABINETRY_FOUNDATION.md`'s own Tasks 7/8.
- **No task in this plan touches `SliderLog`, `SliderCenteredZero`, any drawer, or any domain config file** — confirmed against spec §3's Strict Scope boundary; 11.1.4/11.1.5 are their own future plans that will reuse Tasks 2/4/5's output unchanged.

## Dependency Graph

```
Task 1 (cabinetBreakpoints.ts +      Task 2 (voxelTrackMath.ts)      Task 3 (CabinetBox.tsx
        useCabinetBoxHeight.ts                  │                       popped widening)
        refactor)                               │                            │
        │                                       │                            │
        │                                       ├──→ Task 4 (useVoxelTrackBoxCount.ts)
        │                                       │              │
        │                                       └──────────────┼──→ Task 5 (VoxelTrack.tsx/.css/.test.tsx)
        │                                                      │              │
        └──────────────────────────────────────────────────────┴──────┬──────┘
                                                                        │
                                                              Task 6 (SliderLinear.tsx/.css/.test.tsx)
                                                                   │              │
                                                                   │              └──→ Task 8 (docs/COMPONENT_LIBRARY.md)
                                                                   │
                                                    Task 5 ────────┴──→ Task 7 (docs/CONSOLE_THEMING.md)
```

## Task List

### Phase 1: Foundation — independent modules (parallelizable)

- [x] **Task 1: `cabinetBreakpoints.ts` gains `CABINET_VOXEL_GAP`; `useCabinetBoxHeight.ts` refactors to share tier resolution**

  **Description:** Add `CABINET_VOXEL_GAP = { mobile: 8, tablet: 10, desktop: 12 }` to `src/utils/cabinetBreakpoints.ts` (spec §4) — `CABINET_BOX_HEIGHT`, the breakpoint-max constants, and `CabinetTier` are otherwise untouched. Refactor `src/components/ui/controls/useCabinetBoxHeight.ts` per spec §1.4/§4: factor the existing `matchMedia` tier-detection logic into a private `useCabinetTier(): CabinetTier` hook; `useCabinetBoxHeight()` keeps its exact existing export signature (`CABINET_BOX_HEIGHT[useCabinetTier()]`); add a new exported `useVoxelTrackGap(): number` (`CABINET_VOXEL_GAP[useCabinetTier()]`).

  **Acceptance criteria:**
  - [x] `CABINET_VOXEL_GAP.mobile` (`8`) `< .tablet` (`10`) `< .desktop` (`12`).
  - [x] Every existing `cabinetBreakpoints.test.ts`/`useCabinetBoxHeight.test.ts` assertion stays unchanged and passing — `useCabinetBoxHeight()`'s resolved value for all 3 stubbed tiers, and its re-resolution on a stubbed `change` event, are byte-identical to before this refactor.
  - [x] `useVoxelTrackGap()` resolves `8`/`10`/`12` for the same 3 stubbed tiers `useCabinetBoxHeight.test.ts` already uses, and re-resolves when a stubbed query's `change` listener fires.
  - [x] Both hooks derive from the same `resolveTier()`/`CABINET_BREAKPOINT_*` constants — a test changes a stubbed breakpoint boundary and asserts both `useCabinetBoxHeight()` and `useVoxelTrackGap()` cross their respective tier at the exact same stubbed condition (proves shared logic, not just visually-similar duplicated logic).

  **Verification:**
  - [x] `npx vitest run src/utils/cabinetBreakpoints.test.ts src/components/ui/controls/useCabinetBoxHeight.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: none applicable yet — `useVoxelTrackGap` has zero real consumers until Task 6.

  **Dependencies:** None.

  **Files:** `src/utils/cabinetBreakpoints.ts`, `src/utils/cabinetBreakpoints.test.ts`, `src/components/ui/controls/useCabinetBoxHeight.ts`, `src/components/ui/controls/useCabinetBoxHeight.test.ts`

  **Estimated scope:** S (4 files, but the refactor is a straightforward extraction — no new listener behavior, no new constants beyond one small object)

- [x] **Task 2: `voxelTrackMath.ts` — box-count fitting, track length, dual-fill/extrusion-falloff, fill-color math**

  **Description:** Add `src/utils/voxelTrackMath.ts` per spec §4: `VOXEL_TRACK_MIN_BOX_COUNT = 3`; `computeFittedBoxCount(availableLength, boxSize, gap)`; `computeVoxelTrackLength(boxCount, boxSize, gap)`; `computeVoxelBoxStates(value, min, max, boxCount)` returning `VoxelBoxState[]` (`{ fillPercent, popT }` per box, indexed 0=nearest-min); `computeVoxelFillBackground(fillPercent, axis)`. Pure functions only — no DOM, no GSAP, no React.

  **Acceptance criteria:**
  - [x] `computeFittedBoxCount`: an exact-fit case, an under-by-one-gap case, and a generous-space case all match the hand-derived formula (spec §1.5); `boxSize <= 0` returns `VOXEL_TRACK_MIN_BOX_COUNT`; a space too small even for 3 boxes still returns exactly `3`, never fewer.
  - [x] `computeVoxelTrackLength(computeFittedBoxCount(availableLength, boxSize, gap), boxSize, gap) <= availableLength` holds for representative `(boxSize, gap)` pairs and a generous `availableLength` — the fitted count never overflows what was asked for. `computeVoxelTrackLength(1, boxSize, gap) === boxSize` (no gap term at `boxCount: 1`).
  - [x] `computeVoxelBoxStates(min, min, max, boxCount)`: box `0`'s `fillPercent: 0`, `popT: 1` (it's the straddling box); every other box `fillPercent: 0`, `popT: 0`.
  - [x] `computeVoxelBoxStates(max, min, max, boxCount)`: the **`t=1` clamp edge is explicitly verified** — the last box (`boxCount - 1`) is the straddling box (`fillPercent: 100`, `popT: 1`), every prior box is `fillPercent: 100` with a stepped-down `popT`, and no box reports `fillPercent: 0` (spec §5 names this as the off-by-one risk worth a dedicated test).
  - [x] A mid-range value against a small `boxCount` (e.g. `4`) is hand-verified against the exact expected per-box `{fillPercent, popT}` array, not spot-checked.
  - [x] `min === max` returns every box at the `t=0` shape without throwing (the divide-by-zero guard).
  - [x] `computeVoxelFillBackground(100, axis)`/`computeVoxelFillBackground(0, axis)` return the two solid `var(...)` strings exactly, no gradient syntax; a mid-value (e.g. `37`) returns a `linear-gradient` with both color stops at the same `37%` boundary (hard stop); `axis: 'vertical'` uses `to top`, `'horizontal'` uses `to right`.

  **Verification:**
  - [x] `npx vitest run src/utils/voxelTrackMath.test.ts` passes, covering every acceptance criterion above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/voxelTrackMath.ts`, `src/utils/voxelTrackMath.test.ts`

  **Estimated scope:** S (2 files, pure math — 4 functions with real derivations to verify, no DOM/GSAP/React)

- [x] **Task 3: `CabinetBox` — `popped` widens from `boolean` to `boolean | number`**

  **Description:** Modify `src/components/ui/controls/CabinetBox.tsx` per spec §1.1/§4: widen `CabinetBoxProps.popped` to `boolean | number`; normalize once on entry (`const poppedT = typeof popped === 'number' ? popped : (popped ? 1 : 0)`); replace every downstream use of the old binary `popped` (the `isTransition` comparison, the `target`/`from` geometry calls, the glow tween, the effect's dependency array) with `poppedT`. The `from` value generalizes from the old `popped ? 0 : 1` ternary to `previousPopped ?? (1 - poppedT)` (captured *before* `prevPoppedRef.current` is overwritten) — reproduces today's Button/Toggle behavior exactly at `poppedT` `0`/`1`, generalizes correctly for a fractional value. No other logic in the file changes — the `ResizeObserver` width measurement, the resize-flicker fix's overall shape, and the JSX are untouched.

  **Acceptance criteria:**
  - [x] Every existing `CabinetBox.test.tsx` assertion (11.1.1/11.1.2's full suite) still passes unmodified — every existing case passes a `boolean`, which normalizes identically before and after this change.
  - [x] `Button.test.tsx` and `Toggle.test.tsx` both stay unmodified and passing — direct proof the widening is behavior-preserving for both real consumers, not just type-compatible (`git diff src/components/ui/controls/Button.tsx src/components/ui/controls/Toggle.tsx` is empty for this task).
  - [x] A fractional `popped` (e.g. `0.4`) computes geometry at `t = 0.4` exactly — asserted against `computeCabinetGeometry`'s actual call arguments (spied), not just "doesn't throw".
  - [x] `--cabinet-glow` tweens to exactly `0.4` (not `0` or `1`) for a `popped={0.4}` render — extends the existing glow-direction test to a non-boundary value.
  - [x] A transition between two fractional values (e.g. `0.4 → 0.7`, no boundary crossing) animates `from: 0.4` directly, not `from: 0` or `from: 1` — confirms `previousPopped` drives the tween once a real prior value exists.
  - [x] The very first render at a fractional `popped` (e.g. `0.4`, no prior render) animates `from: 0.6` (`1 - 0.4`) — confirms the numeric-opposite fallback generalizes correctly past `0`/`1`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx src/components/ui/controls/Button.test.tsx src/components/ui/controls/Toggle.test.tsx` passes in full — all 3 files, not just the modified one.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Manual check: none applicable yet — no consumer passes a fractional value until Task 5.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** S (2 files touched, but the highest-*regression*-risk task among the foundation trio — modifies an already-shipped, reference-example primitive two prior items depend on; treat its full verification step as non-optional, not a nice-to-have)

### Checkpoint: Foundation modules
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` (full suite) all clean.
- [x] `grep -rn "voxelTrackMath\|useVoxelTrackGap\|CABINET_VOXEL_GAP" src/` shows the new exports present with no real consumer yet, beyond the modules' own tests.
- [x] `Button`/`Toggle` render identically in the running app to before this checkpoint (no visual or behavioral change) — spot-checked, since Task 3 touched a shared primitive both depend on. Confirmed working by Crawford in the running app.
- [x] Review with human before proceeding.

---

### Phase 2: The box-count hook

- [x] **Task 4: `useVoxelTrackBoxCount` — live, self-fitting box count**

  **Description:** Add `src/components/ui/controls/useVoxelTrackBoxCount.ts` per spec §1.5/§1.7/§4: observes `ref.current?.parentElement` via `ResizeObserver` — never `ref.current` itself (mirrors `useAutoSliderOrientation.ts`'s exact feedback-loop-avoiding convention) — reading `width` or `height` depending on the (already-resolved) `axis` param, feeding `computeFittedBoxCount` (Task 2). An optional `explicitAvailableLength` param, when supplied, skips the observer entirely and fits against that fixed number instead (the `verticalHeight`-as-budget case, spec §1.7).

  **Post-implementation amendment (found debugging a real running-app regression after Task 6 shipped, not part of this task's original implementation pass):** "always observe the parent" turned out wrong for **horizontal** orientation — `.sc-slider-linear` is a plain block box whose width is externally determined and never inflated by its own content (`overflow-x: auto` contains that), so self-observation there carries none of the circularity risk `'auto'` orientation genuinely has. Observing the parent instead meant every ancestor in a control's layout chain had to be individually correct for the measurement to be right, which two separate real bugs (`DirectionalPanel.css`'s missing `min-width`/`flex-basis`, `AudioRigDrawer.tsx`'s Tempo/Ping Variance sliders sharing one `DirectionalPanel` row directly) violated. **Shipped:** horizontal observes `ref.current` directly; vertical still observes the parent (`.sc-slider-linear[data-orientation='vertical']` is `display: inline-flex`, which does shrink-wrap height to content — no real vertical consumer exists yet to verify self-observation against). Full reasoning: spec §1.5's own amendment note.

  **Acceptance criteria:**
  - [x] Returns `VOXEL_TRACK_MIN_BOX_COUNT` before any `ResizeObserver` callback fires.
  - [x] ~~Observes the `ref`'s parent, never `ref.current` itself~~ — **superseded by the amendment above.** Now: observes `ref.current` directly for horizontal, the parent for vertical — asserted the same way `useAutoSliderOrientation.test.ts` asserts this for orientation (`MockResizeObserver.instances[0].observedTargets`), one test per axis.
  - [x] Reads `width` when `axis: 'horizontal'`, `height` when `axis: 'vertical'` — two separate test cases, not inferred from one.
  - [x] Re-computes when the observer fires a new size (not just on mount).
  - [x] When `explicitAvailableLength` is provided, no `ResizeObserver` is constructed at all (`MockResizeObserver.instances` stays empty), and the returned count comes directly from that number.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/useVoxelTrackBoxCount.test.ts` passes, using the `MockResizeObserver` convention from `useAutoSliderOrientation.test.ts`.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: none applicable yet — zero real consumers until Task 6.

  **Dependencies:** Task 2 (`computeFittedBoxCount`).

  **Files:** `src/components/ui/controls/useVoxelTrackBoxCount.ts`, `src/components/ui/controls/useVoxelTrackBoxCount.test.ts`

  **Estimated scope:** S (2 files, one hook against an already-proven measurement convention)

### Checkpoint: Hook ships
- [x] `npm run build:types`, `npm run lint` clean; `useVoxelTrackBoxCount.test.ts` passes in isolation.
- [x] `useVoxelTrackBoxCount` is importable and correctly resolves fitted counts (verified by its own test suite) with zero other files in the app referencing it yet.
- [x] Review with human before proceeding. Confirmed by Crawford — no visual issues.

---

### Phase 3: The shared voxel-track component

- [x] **Task 5: `VoxelTrack` — the shared box-row rendering component**

  **Description:** Add `src/components/ui/controls/VoxelTrack.tsx` per spec §1.2/§1.3/§1.9/§4: renders one `<CabinetBox popped={state.popT} boxHeight={boxSize} timelineKey={\`${timelineKeyPrefix}-${i}\`}>` per `VoxelBoxState` in `states`, each wrapping a `<div className="sc-voxel-track__fill">` whose `background` is `computeVoxelFillBackground(state.fillPercent, axis)` (Task 2). Root is `position: absolute; inset: 0; pointer-events: none; aria-hidden="true"`, `data-axis={axis}`. Add `VoxelTrack.css` per spec §4: `flex-direction: row` (horizontal, box 0 leftmost) / `column-reverse` (vertical, box 0 bottommost); the `.sc-voxel-track .sc-cabinet-box__front` square-footprint override (mirroring `Toggle.css`'s own scoped-override technique from 11.1.2 §1.2); `--voxel-box-size`/`--voxel-gap` supplied as inline custom properties from the `boxSize`/`gap` props.

  **Acceptance criteria:**
  - [x] Renders exactly `states.length` `CabinetBox` instances.
  - [x] Each instance's `popped` prop equals that index's `state.popT`, and is a `number` (not coerced to `boolean`) — guards against an accidental `!!` creeping in.
  - [x] Each instance's `timelineKey` is `` `${timelineKeyPrefix}-${i}` ``, unique per box.
  - [x] Each box's fill child's rendered `background` matches `computeVoxelFillBackground(state.fillPercent, axis)` exactly (spying on the real `voxelTrackMath` module via `importOriginal`, not re-deriving the expected string independently in the test).
  - [x] The root element carries `aria-hidden="true"` and `data-axis` matching the `axis` prop.
  - [x] `.sc-voxel-track .sc-cabinet-box__front` forces `width`/`height` to `var(--voxel-box-size)` and `padding: 0` (confirmed by reading the shipped CSS directly, per `VERTICAL_SLIDERS.md`'s own precedent of not unit-testing CSS-only rules).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/VoxelTrack.test.tsx` passes, mocking `CabinetBox` directly (mirroring `Button.test.tsx`'s own precedent).
  - [x] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [x] Manual check: none applicable yet — `VoxelTrack` has zero real consumers until Task 6, same "component before consumer" precedent every prior Cabinetry item used.

  **Dependencies:** Task 2 (`VoxelBoxState`, `computeVoxelFillBackground`), Task 3 (`CabinetBox`'s widened `popped`).

  **Files:** `src/components/ui/controls/VoxelTrack.tsx`, `src/components/ui/controls/VoxelTrack.css`, `src/components/ui/controls/VoxelTrack.test.tsx`

  **Estimated scope:** M (3 files — the first real composition of N `CabinetBox` instances at once; more integration surface than a typical single-consumer wiring task, though lower-risk than Task 6 since nothing real depends on it yet)

### Checkpoint: Shared component ships
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes. (One unrelated flake observed on the first full-suite run — `audioSwells.test.ts`'s "forces every member of a company-wide swell together" case — passed in isolation and on an immediate full-suite re-run with zero code changes in between; not touched by this task's files, not investigated further here.)
- [x] `VoxelTrack` is importable and renders N correctly-popped, correctly-filled boxes in isolation (verified by its own test suite) with zero other files in the app referencing it yet.
- [x] Review with human before proceeding — highest-value checkpoint to catch a fill/extrusion math mistake before it reaches `SliderLinear`. Confirmed by Crawford — no visual issues.

---

### Phase 4: The first real consumer

- [x] **Task 6: `SliderLinear` — wired through `VoxelTrack`**

  **Description:** Replace `src/components/ui/controls/SliderLinear.tsx` per spec §4's full replacement: resolve `boxSize`/`gap` via `useCabinetBoxHeight()`/`useVoxelTrackGap()` (Task 1); resolve `boxCount` via `useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, isVertical ? verticalHeight : undefined)` (Task 4); compute `trackLength`/`states` via `voxelTrackMath.ts` (Task 2); set `Slider.Root`'s inline `width`/`height` to `trackLength`; render `<VoxelTrack>` (Task 5) as an absolutely-positioned sibling of `Slider.Range` inside `Slider.Track`. Replace `SliderLinear.css` per spec §1.10/§1.11/§4: `Slider.Range` stays `visibility: hidden` (mirrors `SliderCenteredZero.css`'s exact precedent); `Slider.Thumb`'s fill goes `background-color: transparent` while its `:focus-visible` outline stays untouched (never `visibility: hidden`/`opacity: 0` — both would also hide the focus ring); `overflow-x`/`overflow-y: auto` added directly to `.sc-slider-linear`'s existing `data-orientation` selectors (no new wrapper element — spec §1.11 explicitly rejected one to avoid breaking 2 existing DOM-order tests). Update `SliderLinear.test.tsx` per spec §5: 3 of the 17 existing cases must be rewritten (the `verticalHeight`-omitted/-provided/horizontal-ignores trio, since `verticalHeight` is now a fitting budget, not a literal value); the other 14 stay unchanged; 3 new cases added (renders `VoxelTrack` with the expected `states`, thumb fill is transparent, exactly one `role="slider"` element).

  **Acceptance criteria:**
  - [x] The 14 unaffected existing `SliderLinear.test.tsx` cases (ARIA min/max/now, unit/no-unit value rendering, the 3-decimal display cap vs. full-precision `aria-valuenow`, `DualLabel` rendering, accessible-name fallback, not-disabled-by-default, disabled attribute + tabindex removal, no `onChange` on a disabled keyboard step, both `data-orientation` cases, the 2 value-label DOM-order cases, the `'auto'`-defaults-to-horizontal case) pass **unmodified** — confirms §1.11's no-new-wrapper decision genuinely preserved DOM order. (The actual pre-existing file had **15** such cases, not 14 — the spec's own count was off by one; all 15 kept byte-for-byte unmodified.)
  - [x] The 3 rewritten `verticalHeight` cases assert the new, correct behavior per spec §1.7/§5 exactly (an inline height is *always* set now; when `verticalHeight` is supplied, the rendered height is the box-quantized `computeVoxelTrackLength` output, not `verticalHeight` verbatim; horizontal sliders now also get an inline `width`).
  - [x] Renders a `VoxelTrack` (mocked) with `states` matching `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)` for the currently-fitted `boxCount`.
  - [x] `Slider.Thumb`'s rendered `background-color` is `transparent`. **Not asserted via a unit test** — empirically confirmed (a throwaway probe test) that this jsdom/vitest setup injects no `<style>` tags at all, so `getComputedStyle` always returns the browser default regardless of the CSS file's content; a test on it would pass identically whether the CSS said `transparent` or the old `var(--color-text-primary)`, proving nothing. Confirmed instead by reading the shipped `SliderLinear.css` directly — same "don't unit-test CSS-only rules" precedent already used for `VoxelTrack`'s front-face override (Task 5).
  - [x] `screen.getByRole('slider')` still resolves to exactly one element (the voxel boxes introduce no ARIA-role ambiguity).
  - [x] `SliderLinearSchema`/`ControlSchema` are untouched — `git diff src/types/controls.ts` is empty for this task.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` passes (15 unmodified + 3 rewritten + 2 new [VoxelTrack states, single-slider-role] = 20 total; the thumb-transparency criterion above is covered by reading CSS directly, not a 3rd new test).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) re-confirmed clean — including every other real `SliderLinear` consumer's own test file (`AudioRigDrawer` etc.), unmocked against the real component. (One pre-existing flaky test, `audioSwells.test.ts`'s "forces every member of a company-wide swell together" case — same one first seen at Task 5's checkpoint — failed once then passed on immediate re-run with zero code changes; unrelated to any file this task touches, not investigated further.)
  - [x] **Manual check:** confirmed via `ToolSearch` that no browser-automation tool (e.g. chrome-devtools) is available in this environment — only `WebFetch` surfaced. **Outstanding — flagged for Crawford to perform in the running app**, same honest gap `OBLIQUE_CABINETRY_FOUNDATION.md`'s own Task 6 checkpoint recorded rather than skipping silently.

  **Dependencies:** Task 1, Task 4, Task 5.

  **Files:** `src/components/ui/controls/SliderLinear.tsx`, `src/components/ui/controls/SliderLinear.css`, `src/components/ui/controls/SliderLinear.test.tsx`

  **Estimated scope:** M (3 files, but the highest-risk task in this plan — integrates 4 upstream modules for the first time *and* makes a real, user-visible `verticalHeight` behavior change requiring 3 existing tests to be rewritten, not just extended; see Architecture Decisions)

### Checkpoint: SliderLinear ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [x] Every real `SliderLinear` call site in the app renders through `VoxelTrack` with no call-site changes required — confirmed by `npm run build:types` alone surfacing nothing, since the props contract didn't change.
- [ ] **The `verticalHeight`-as-budget behavior change (spec §1.7) is explicitly reviewed with Crawford before merge** — if the intended behavior was actually "force the exact pixel height regardless of box quantization," that's a materially different design not built here (flagged in the spec's own §7, restated here so it isn't missed at this checkpoint specifically).
- [x] Manual pass — explicitly flagged as outstanding, no browser automation tool available in this environment (confirmed via `ToolSearch`), matching how `OBLIQUE_CABINETRY_FOUNDATION.md`'s own Task 6 checkpoint recorded the same gap honestly rather than skipping it silently.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs (parallelizable once their own prerequisite lands)

- [x] **Task 7: `docs/CONSOLE_THEMING.md` — voxel-track dual-fill/extrusion-falloff notes**

  **Description:** Add the voxel-track dual-fill/extrusion-falloff rules (spec §1.8) to `docs/CONSOLE_THEMING.md`, alongside 11.1.1's existing cabinet geometry/face-shading notes, per roadmap 11.1.3's own Docs bullet — spot-checked against `voxelTrackMath.ts`'s actual shipped shape (Task 2), not the spec's draft.

  **Acceptance criteria:**
  - [x] `docs/CONSOLE_THEMING.md` documents the box-indexing convention (0 = nearest min), the dual-fill hard-split rule, and the extrusion-falloff step-down formula, matching `computeVoxelBoxStates`'s actual shipped formula.
  - [x] No claim in the new section is contradicted by the actual shipped source (spot-checked line-by-line against `voxelTrackMath.ts`).

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `voxelTrackMath.ts` (including the post-Task-6 refinements: `isStraddling`, the two-piece straddle box, position-fixed extrusion falloff, z-index paint order, and the trailing-reserve fix — none of which existed when the spec's §1.8 was first drafted).
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 5.

  **Files:** `docs/CONSOLE_THEMING.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 8: `docs/COMPONENT_LIBRARY.md` — SliderLinear's internal rendering note**

  **Description:** Add the same "internal rendering changed, contract didn't" note `Button`/`Toggle`'s rows already carry, to `SliderLinear`'s row, plus a pointer to the shared `VoxelTrack`/`voxelTrackMath.ts` mechanism for 11.1.4/11.1.5 to reference rather than restate, per spec §6.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `SliderLinear` now renders through `VoxelTrack` internally, with its props contract unchanged.
  - [x] The note is spot-checked against `SliderLinear.tsx`'s actual shipped code (Task 6), not the spec's draft.
  - [x] Includes an explicit pointer for 11.1.4/11.1.5 to the shared mechanism, so neither restates the voxel-track rules independently.

  **Verification:**
  - [x] Manual review — spot-checked directly against the shipped `SliderLinear.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 6.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (122 files / 2087 tests, re-confirmed after Tasks 7/8's docs-only changes).
- [x] All acceptance criteria across all 8 tasks are met.
- [x] `docs/CONSOLE_THEMING.md` and `docs/COMPONENT_LIBRARY.md` both reflect the shipped feature — including the 5 post-ship refinements (`isStraddling`, the two-piece straddle box, position-fixed extrusion falloff, z-index paint order, and the trailing-reserve/vertical-default fixes), not just the original 8-task shape.
- [ ] Manual check (Task 6) completed against the real running app.
- [x] Ready for PR — moot at this point: the feature (Tasks 1–6 plus all 5 post-ship refinements) is already merged to `main` via PR #433; Tasks 7/8 above close out the only work this plan had left outstanding.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `CabinetBox`'s `popped` widening (Task 3) regresses `Button`/`Toggle` — the highest-consequence single change in this plan, since both are already-shipped reference components | Medium — a silent regression would ship inside a task nominally about a different consumer | Task 3's acceptance criteria require `Button.test.tsx`/`Toggle.test.tsx` to stay green **unmodified**, and its own checkpoint spot-checks both in the running app before Task 5 starts depending on the widened prop |
| `verticalHeight`'s new fitting-budget semantics (spec §1.7, Task 6) is a resolved-by-reasoning decision, not directly interviewed — Crawford may actually want the literal pixel height honored regardless of box quantization | Low–Medium — a real, visible behavior difference from what's shipped if wrong | Named explicitly in the spec's own §7, restated at Task 6's own checkpoint specifically so it isn't missed among everything else that checkpoint covers |
| N independent `CabinetBox` timelines per slider (spec §1.2/§7) — a drawer with several multi-box sliders could register dozens of `timelineMap` entries, compounding 10.2's own "70-100+ primaries" concern | Unknown — no measurement exists yet | Not addressed in this plan (no data to act on); named explicitly as the first concrete thing for 11.2's performance pass to measure once 11.1.3–11.1.5 have all shipped |
| The spec's "one matchMedia listener pair, two derived values" framing (§1.4) is imprecise — Task 1 actually ships two independent listener pairs when both hooks are used together | Low — a minor inefficiency (2 extra listeners), not a correctness bug; both hooks always agree on tier regardless | Caught and documented during this planning pass (Architecture Decisions) rather than left to surface as a surprise in review; Task 1's acceptance criteria test the logic-sharing guarantee that actually matters, not a listener-count claim that doesn't hold |
| Task 6 rewrites 3 existing tests rather than only adding new ones — a larger single-task diff than any other task in this plan, more chances for an accidental unrelated assertion change to slip in | Low–Medium | Task 6's acceptance criteria explicitly separate "14 stay unmodified" from "3 rewritten, asserting the new documented behavior" — a reviewer can diff exactly which 3 changed and why, rather than the whole file needing re-verification from scratch |

## Open Questions

Resolved during Plan (not left open):

- ~~Does `CabinetBox`'s widening need its own task/phase, or can it fold into `VoxelTrack`?~~ **Resolved: separate task (3)**, mirroring every prior Cabinetry item's "component before consumer" split — sharper here since it modifies an *already-shipped* primitive two other consumers depend on.
- ~~Can Tasks 1–3 run in parallel?~~ **Resolved: yes** — confirmed zero cross-imports between `cabinetBreakpoints.ts`/`useCabinetBoxHeight.ts`, `voxelTrackMath.ts`, and `CabinetBox.tsx`'s widening.
- ~~Do the two docs tasks need to wait for both Task 5 and Task 6?~~ **Resolved: no** — `docs/CONSOLE_THEMING.md` (Task 7) only needs Task 5; `docs/COMPONENT_LIBRARY.md` (Task 8) needs Task 6. Same split `OBLIQUE_CABINETRY_FOUNDATION.md`'s own Tasks 7/8 already used.
- ~~Is the roadmap's stale "box-height-scaled" wording a task in this plan?~~ **Resolved: no** — already corrected directly in `docs/todo/roadmap.md` in the session that produced the spec, before this task breakdown was written.

Carried forward from spec §7, not blocking this plan:

1. **`verticalHeight`'s fitting-budget semantics** (spec §1.7/§7 item 1) — resolved by reasoning, not directly interviewed. Flagged above in Risks and at the Phase 4 checkpoint for explicit human review before merge, rather than assumed correct.
2. **`Slider.Thumb`'s transparent-fill treatment** (spec §1.10/§7 item 2) — already resolved with clear reasoning (never `visibility: hidden`/`opacity: 0`, both of which would hide the focus ring); Task 6's own acceptance criteria pin this to a named test.
3. **N-timelines-per-slider performance** (spec §1.2/§7's own "real risk, not fully resolvable at spec time") — carried forward to 11.2, not this plan's concern to resolve or measure.
4. **Forward note for 11.1.4 (`SliderLog`) and 11.1.5 (`SliderCenteredZero`):** both reuse Tasks 2, 4, and 5's output (`voxelTrackMath.ts`, `useVoxelTrackBoxCount.ts`, `VoxelTrack.tsx`) completely unchanged — neither phase's own plan needs an equivalent of this plan's Phase 1–3 foundation work, only their own `t → value` curve feeding `computeVoxelBoxStates`' existing inputs. `SliderCenteredZero` is flagged in the roadmap itself as the one genuine adaptation (zero-anchored, not min-anchored) — its own future plan should not assume this plan's boxes-from-min logic carries forward unmodified without checking that item's own spec first.

## Post-ship refinements (beyond the original 8 tasks)

Real, shipped changes made after all 8 tasks above were already complete — driven by Crawford iterating against the real running app, not by a gap in the original spec/plan. Recorded here for the same reason `OBLIQUE_CABINETRY_FOUNDATION.md`'s own task doc records its post-ship section: so this history isn't lost, and so 11.1.4/11.1.5 know what `VoxelTrack`/`CabinetBox` stand at *now*, not as Task 5 originally shipped them.

- **Extrusion-falloff redesigned from a fill-relative taper to a fixed per-row-position ceiling**, and the straddling slot redesigned from a single resizable box with an internal gradient to two adjacent glow+flat pieces — both found live in the running app, both fully documented in the spec's own §1.8 revision/addendum notes (2026-09-08).
- **Straddle-boundary remount flash fixed with a new `skipMountAnimation` `CabinetBox` prop.** Every time the straddling index moved, React remounted the box at the old/new boundary (`VoxelTrack.tsx` renders that index as a plain `CabinetBox` or the straddle wrapper's two children depending on state — same key, different element type, which React can't reuse across a type change). The remount reset `CabinetBox`'s internal "have I run before" tracking, so its mount-time "animate in from the opposite state" logic (correct for `Button`/`Toggle`, wrong for a box that was already visible a moment earlier) replayed a full flat↔popped tween, flashing the walls open with no real transition behind it. Confirmed directly by Crawford against the running app; diagnosed from React's own same-key/different-type reconciliation semantics, not from a failing test — no existing test exercised the straddle boundary across a value change. Fixed by adding `skipMountAnimation?: boolean` to `CabinetBoxProps`: on a true first mount with the flag set, the geometry effect positions directly at the target state via `gsap.set()` instead of tweening from the opposite, and registers no timeline. `VoxelTrack.tsx` passes it on every box it renders (`Button`/`Toggle` don't, and keep their pop-in flourish). Full rationale: `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s 2026-09-09 addendum to §1.8. Shipped with real TDD coverage (RED confirmed against the pre-fix `CabinetBox.tsx` before the fix landed) — `CabinetBox.test.tsx` gained a `skipMountAnimation` describe block, `VoxelTrack.test.tsx` gained a test asserting every rendered `CabinetBox` receives the flag.
- **Padding-right/padding-bottom hit-area reservation removed from `.sc-cabinet-box` entirely**, replaced by an always-opaque `.sc-cabinet-box__backing` layer plus an opacity fade on the walls (`--cabinet-glow` 0→1 now also fades the walls 1→0.5) — `Button`/`Toggle`'s hit area now ends at the flat footprint, not the popped one. `Button`'s front face is also now accent-tinted (`--color-accent`, not `--color-surface`) since it carries real text, scoped to `Button` alone. Both confirmed via `/interview-me`, 2026-09-09. Full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`'s §1.4/§1.6 post-implementation corrections.
- **Trailing-edge overflow at value === max fixed with a new `computeVoxelTrackTrailingReserve(axis)`.** Reported directly by Crawford: Limiter, Tempo, and Automatic Effects overflowed their own container at 100%. Root cause: `SliderLinear.tsx` sized `Slider.Root`/`Track` to exactly the tight box-row length, with no allowance for the *last* box's own pop-out bleed (the one box with no next slot to bleed into, and — per §1.8's revision — the one guaranteed to reach the full `VOXEL_TRACK_POP_DISTANCE`); most containers happened to leave enough incidental slack from `computeFittedBoxCount`'s own flooring to hide this, these three's didn't. Not caused by the same session's separate `.sc-cabinet-box` hit-area-padding removal (`OBLIQUE_CABINETRY_FOUNDATION.md` §1.6) — that reservation was already zeroed for every voxel-track box well before this session (commit `44a1a2e`), so removing the base rule changed nothing here; same category of bug, different spot. Fixed by subtracting the new reserve from the available length before fitting a box count (`useVoxelTrackBoxCount`'s new optional `reserve` param, default `0`) and adding it back on top of the rendered track length (`SliderLinear.tsx`) — real trailing slack always exists now, not left to how a container's width happens to divide. Full rationale: `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s 2026-09-09 §1.13. Shipped with real TDD coverage (RED confirmed for both the hook's reserve-subtraction cases and `SliderLinear.test.tsx`'s updated box-count/width assertions before the fix landed) — `voxelTrackMath.test.ts`, `useVoxelTrackBoxCount.test.ts`, and `SliderLinear.test.tsx` (including a new regression case for the exact-multiple container width that broke) all updated/extended; full suite (122 files / 2084 tests), lint, and type-check verified green.
- **Vertical resolution's infinite resize loop fixed by restoring `VERTICAL_SLIDERS.md`'s own original 256px default.** Reported directly by Crawford: any slider resolving to vertical orientation froze the app — hit first via `orientation: 'auto'` landing a slider in a container never built to hold a vertical one, but the same defect applied equally to every explicit `orientation: 'vertical'` schema (`robotOptionsConfig.ts`'s per-layer gain/phase/pulseWidth) since none of them pass `verticalHeight` either. This plan's own voxel-track rewrite had replaced `VERTICAL_SLIDERS.md`'s original non-measuring "256px CSS default, optional override" design (still exactly how `SliderLog`/`SliderCenteredZero` work) with a live `ResizeObserver` fallback for `SliderLinear` specifically whenever `verticalHeight` was omitted — genuinely circular for any real container whose height auto-sizes to its content (e.g. `AudioRigDrawer.css`'s `.audio-rig-drawer__param-row`, no explicit height): the parent's height depends on the slider's rendered height, which depends on measuring that same parent. Fixed with a new `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT = 256` (`voxelTrackMath.ts`, matching `--slider-vertical-height` exactly), used as `SliderLinear`'s own fitting budget whenever `verticalHeight` is omitted — `useVoxelTrackBoxCount` already treats any defined budget as "skip live measurement entirely" (§1.5), so this removes the `ResizeObserver` outright rather than just changing what it measures. `useAutoSliderOrientation` itself was untouched — never the circular part. Full rationale: `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s 2026-09-09 §1.14. Shipped with real TDD coverage (the pre-existing "always sets an inline height from the live-fitted box count... no longer the old CSS default" test was rewritten to assert the opposite, RED-confirmed against the pre-fix component; a new end-to-end case exercises `orientation: 'auto'` resolving to vertical and confirms no live re-measurement of the same parent follows) — full suite (122 files / 2085 tests), lint, and type-check verified green.
- **A narrower residual flicker survived the `skipMountAnimation` fix above** — reported directly by Crawford: the *top wall specifically*, of whichever box sits one index below/left of the straddle boundary, on every crossing. `skipMountAnimation` fixed the wall scale/position on a fresh mount but not the top-face div's own *width*, which comes from a separate `useState(0)` in `CabinetBox.tsx` also reset by the same remount, corrected only once the (asynchronous) `ResizeObserver` fires — the wall rendered fully positioned but at zero width for a frame. This bug belongs to `CabinetBox` itself, not this plan's own `VoxelTrack`/`voxelTrackMath.ts` files, so its full rationale and TDD detail live in `docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md`'s "Residual straddle-boundary flicker, 2026-09-09" section; pointer left here since it directly continues the entry above. Full suite (122 files / 2087 tests), lint, and type-check verified green.

All of the above shipped with the same discipline as the original 8 tasks — real test coverage and full-suite/build verification before considering the change done, not exempted from it just because it came after the checkpoint above was first reached.
