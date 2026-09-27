# Implementation Plan: Oblique Cabinetry — SliderLog (Roadmap Phase 11.1.4)

Source spec: [docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md](../specs/OBLIQUE_CABINETRY_SLIDER_LOG.md). Source intent: [docs/intent/oblique-cabinetry-slider-log.md](../intent/oblique-cabinetry-slider-log.md). Pure presentation change plus one internal refactor — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `SliderLogSchema`/`ControlSchema` change, no change to `voxelTrackMath.ts`/`cabinetGeometry.ts`/`VoxelTrack.tsx`/`CabinetBox.tsx`/`sliderLogMath.ts` (all already correct, shared infrastructure — reused as-is).

## Overview

Extract `SliderLinear.tsx`'s inline container-fitting glue into a new shared hook (`useVoxelTrackSlider`), retrofit `SliderLinear.tsx` to call it with zero observable behavior change, then wire `SliderLog` through the same hook and `VoxelTrack` — this item's only real new consumer, and the first to place voxel boxes using a normalized `t` rather than a raw value. This is a smaller lift than 11.1.3 (no new geometry/math/rendering primitive — every one of those is reused unchanged) but carries a real, specific regression risk 11.1.3 didn't have to worry about: `SliderLinear.tsx` is an already-shipped, heavily-tested component whose only currently-correct behavior is exactly what it does today, and this plan touches it a second time. The hook ships first with zero consumers; the retrofit ships second and is verified in complete isolation before `SliderLog` is allowed to depend on the same hook; `SliderLog` ships third; docs last.

## Architecture Decisions

- **The hook (Task 1) ships with zero real consumers, before either component depends on it** — same "component before consumer" precedent every prior Cabinetry item (`VoxelTrack` in 11.1.3, `CabinetBox` in 11.1.1) already used, isolating a hook-design mistake to Task 1 alone.
- **The `SliderLinear` retrofit (Task 2) is its own task, strictly separated from the `SliderLog` rewire (Task 3)** — not merged into one "wire the hook into both sliders" task despite touching similar code. This is the single highest-regression-risk task in this plan: unlike every prior consumer-wiring task in this series (which added a schema-shaped primitive to a component that had never rendered it before), this task changes *how* an already-shipped, already-correct component computes values it already computes — there is no new behavior to verify, only an absence of behavior change to prove. Task 2's own acceptance criteria require `SliderLinear.test.tsx`'s existing 23 cases to pass with a literal empty `git diff` on that file, and its own checkpoint gates whether Task 3 proceeds.
- **Task 3 depends on Task 2's checkpoint having passed, not merely on Task 1's code existing** — `SliderLog` could technically be wired against the hook the moment Task 1 ships, without waiting for Task 2. Sequenced after Task 2's checkpoint anyway: that checkpoint is the cheapest point in this plan to catch a hook-shape mistake (missing behavior, wrong default, an edge case `SliderLinear`'s own 11.1.3 history already found once — e.g. the vertical-default circularity, §1.14) before a second consumer is built on top of it. Finding a hook defect after two consumers exist is strictly more expensive than after one.
- **The 2 docs tasks (4, 5) depend on different upstream tasks and are ordered last** — `docs/COMPONENT_LIBRARY.md` (Task 4) needs both Task 2 (the `SliderLinear` note's hook-extraction addendum) and Task 3 (`SliderLog`'s own new note) finished; `docs/CONSOLE_THEMING.md` (Task 5) only needs Task 3. Same "docs depend on the code they describe, not the other way around" ordering 11.1.3's own Tasks 7/8 used.
- **No task in this plan touches `voxelTrackMath.ts`, `cabinetGeometry.ts`, `VoxelTrack.tsx`/`.css`, `CabinetBox.tsx`, `useCabinetBoxHeight.ts`, `useVoxelTrackBoxCount.ts`, or `sliderLogMath.ts`** — confirmed against spec §2/§3's Strict Scope; all are already correct and reused exactly as they ship today.

## Dependency Graph

```
Task 1 (useVoxelTrackSlider.ts + test)
        │
        ▼
Task 2 (SliderLinear.tsx retrofit —
        SliderLinear.test.tsx: 0 edits)
        │
        ▼
Checkpoint: Retrofit proven safe
        │
        ▼
Task 3 (SliderLog.tsx/.css/.test.tsx rewrite)
        │
        ▼
Checkpoint: SliderLog ships
        │
   ┌────┴────┐
   ▼         ▼
Task 4     Task 5
(COMPONENT_  (CONSOLE_
LIBRARY.md)  THEMING.md)
   │         │
   └────┬────┘
        ▼
Checkpoint: Complete
```

## Task List

### Phase 1: The shared hook — no consumer yet

- [x] **Task 1: `useVoxelTrackSlider` — the shared box-count/track-length/`rootStyle` hook**

  **Description:** Add `src/components/ui/controls/useVoxelTrackSlider.ts` per spec §1.1/§4: takes an already-resolved `orientation` (`'horizontal' | 'vertical'`, never `'auto'`) and an optional `verticalHeight` budget; internally resolves `boxSize`/`gap` via `useCabinetBoxHeight`/`useVoxelTrackGap`, resolves `boxCount` via `useVoxelTrackBoxCount` (including the trailing-reserve subtraction and the vertical fixed-budget-vs-live-measurement branch `SliderLinear.tsx` already established in 11.1.3), and computes `trackLength`/`rootStyle`. Returns `{ boxSize, gap, boxCount, trackLength, rootStyle }`. Pure extraction — every value it computes must match what `SliderLinear.tsx`'s current inline code already computes for the same inputs; no new formula.

  **Acceptance criteria:**
  - [x] Returns `boxCount: VOXEL_TRACK_MIN_BOX_COUNT` before any `ResizeObserver` callback fires (horizontal, `verticalHeight` irrelevant to this axis).
  - [x] Horizontal, after a fired measurement: `rootStyle` is exactly `{ width: trackLength, height: boxSize }`, where `trackLength` matches `computeVoxelTrackLength(...) + computeVoxelTrackTrailingReserve('horizontal')` for that measurement — asserted against those real functions' own output, not a hand-derived number.
  - [x] Vertical, `verticalHeight` omitted: `boxCount` fits against `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` **synchronously** — correct before any `ResizeObserver` fires, no live measurement attempted.
  - [x] Vertical, `verticalHeight` supplied and deliberately not an exact multiple of `(boxSize + gap)`: `trackLength` is the box-quantized `computeVoxelTrackLength` output, not `verticalHeight` verbatim; `rootStyle` is `{ height: trackLength, width: boxSize }`.
  - [x] Horizontal, a container width landing on an exact multiple of `(boxSize + gap)`: `trackLength` still includes `computeVoxelTrackTrailingReserve('horizontal')` beyond the tight box-row length — re-verifies 11.1.3 §1.13's fix at the hook level, now that this logic no longer lives inline in `SliderLinear.tsx`.
  - [x] The returned object's shape matches `VoxelTrackSliderLayout` exactly (`boxSize`, `gap`, `boxCount`, `trackLength`, `rootStyle`) — no extra or missing field.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/useVoxelTrackSlider.test.ts` passes (7 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: none applicable yet — zero real consumers until Task 2.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/useVoxelTrackSlider.ts`, `src/components/ui/controls/useVoxelTrackSlider.test.ts`

  **Estimated scope:** S (2 files — pure composition over already-proven primitives; no new geometry, math, or rendering, just wiring already-shipped pieces together)

### Checkpoint: Hook ships
- [x] `npm run build:types`, `npm run lint` clean; `useVoxelTrackSlider.test.ts` passes in isolation.
- [x] `grep -rn "useVoxelTrackSlider" src/` shows the new export present with zero real consumers yet, beyond its own test file.
- [x] Review with human before proceeding.

---

### Phase 2: The retrofit — proving zero behavior change on an already-shipped consumer

- [x] **Task 2: `SliderLinear.tsx` — retrofit to call `useVoxelTrackSlider`**

  **Description:** Replace `SliderLinear.tsx`'s current inline block (`useCabinetBoxHeight`/`useVoxelTrackGap` calls, the `explicitLength`/`trailingReserve` computation, the `useVoxelTrackBoxCount` call, `trackLength`, and the `rootStyle` ternary) with a single `useVoxelTrackSlider(wrapperRef, orientation, verticalHeight)` call, destructuring `{ boxSize, gap, boxCount, rootStyle }`, per spec §1.2/§4. `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)` and every line of JSX are otherwise untouched. Drop the now-unused imports (`useCabinetBoxHeight`, `useVoxelTrackGap`, `useVoxelTrackBoxCount`, and `voxelTrackMath.ts`'s `computeVoxelTrackLength`/`computeVoxelTrackTrailingReserve`/`VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` — only `computeVoxelBoxStates` remains) and the now-unused `CSSProperties` type import if nothing else in the file still needs it.

  **Acceptance criteria:**
  - [x] `SliderLinear.tsx` imports `useVoxelTrackSlider` and no longer imports `useCabinetBoxHeight`/`useVoxelTrackGap`/`useVoxelTrackBoxCount` or the 3 now-hook-internal `voxelTrackMath.ts` exports.
  - [x] `git diff src/components/ui/controls/SliderLinear.test.tsx` is **empty** for this task — all 23 existing cases pass with zero edits, zero additions.
  - [x] `npm run lint` is clean with no unused-import warnings (confirms the `CSSProperties` cleanup was actually needed and correctly done — it's dropped from the file's imports entirely).
  - [x] No change to the component's rendered DOM structure, class names, ARIA attributes, or props contract — implied by the untouched test file passing, restated here as an explicit criterion since it's the entire point of this task.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` passes in full — all 23 cases, unmodified file.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Manual check: none formally required beyond the existing automated suite — this task's acceptance bar is "no observable difference," already covered exhaustively by the untouched test file.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/SliderLinear.tsx` (`SliderLinear.test.tsx` is listed only to make explicit that it must receive **zero** edits, not because this task changes it)

  **Estimated scope:** S (1 file changed) — but treat as the single highest-regression-risk task in this plan regardless of its small file count: it modifies an **already-shipped, heavily-tested reference primitive** with real production consumers (Volume, Sustain, Gain, Phase, Interval, LFO Rate/Depth, Density, Motif Length, Note Variance, Octave Range Min/Max, Compressor Ratio), where the only correct outcome is "behaves exactly as before."

### Checkpoint: Retrofit proven safe
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (123 files / 2094 tests).
- [x] `git diff src/components/ui/controls/SliderLinear.test.tsx` confirmed empty (not just "tests pass" — the literal diff, since a rewritten test that happens to still pass would not actually prove behavior preservation).
- [ ] Spot-check in the running app: a real `SliderLinear` consumer (e.g. Audio Rig's EQ3 Gain) renders and behaves identically to before this task — same box row, same drag/keyboard behavior, same focus ring. **Outstanding — no browser-automation tool available in this environment (confirmed via `ToolSearch` in prior Cabinetry items); flagged for Crawford to perform in the running app, same honest gap every prior item's own checkpoint recorded rather than skipping silently.**
- [x] Review with human before proceeding — this checkpoint gates whether Task 3 may safely build `SliderLog` on the same hook. Confirmed by Crawford.

---

### Phase 3: The second real consumer — `SliderLog`

- [x] **Task 3: `SliderLog` — rewired through `VoxelTrack`/`useVoxelTrackSlider`, box placement via `t`**

  **Description:** Replace `SliderLog.tsx` per spec §1.3/§1.4/§4's full replacement: resolve `{ boxSize, gap, boxCount, rootStyle }` via `useVoxelTrackSlider(wrapperRef, orientation, verticalHeight)` (Task 2's own hook); compute `states` via `computeVoxelBoxStates(t, 0, 1, boxCount)`, where `t` is the *same* `sliderLogValueToT(value, schema.min, schema.max)` result already feeding Radix's own `Slider.Root value={[t]}` — not a second, independently-derived value, and not the raw log-scaled `value` against `schema.min`/`schema.max`. Render `<VoxelTrack>` as an absolutely-positioned sibling of `Slider.Range` inside `Slider.Track`, mirroring `SliderLinear.tsx`'s own 11.1.3 JSX shape exactly. Replace `SliderLog.css` per spec §4: `Slider.Range` goes `visibility: hidden`; `Slider.Thumb`'s fill goes `background-color: transparent` (its `:focus-visible` outline untouched); `overflow-x`/`overflow-y: auto` added to `.sc-slider-log`'s existing `data-orientation` selectors. `sliderLogMath.ts` itself is untouched. Update `SliderLog.test.tsx` per spec §5: 3 of the 25 existing cases (the `verticalHeight`-omitted/-provided/horizontal-ignores trio) must be rewritten for the new fitting-budget semantics; the other 22 stay unchanged; 2 new cases added (renders `VoxelTrack` with `states` matching `computeVoxelBoxStates(t, 0, 1, boxCount)`, and exactly one `role="slider"` element) — thumb fill being transparent is confirmed by reading the shipped CSS directly, not a 3rd new unit test, per `SliderLinear.test.tsx`'s own precedent.

  **Acceptance criteria:**
  - [x] `SliderLog` renders through `VoxelTrack` exactly as `SliderLinear` does — same `Slider.Track`/`Slider.Range`/`VoxelTrack`/`Slider.Thumb` structure, `Slider.Root` sized via the hook's `rootStyle`.
  - [x] `computeVoxelBoxStates` is called with `(t, 0, 1, boxCount)`, **not** `(value, schema.min, schema.max, boxCount)` — verified via a mocked `VoxelTrack` (mirroring `SliderLinear.test.tsx`'s own `vi.mock('./VoxelTrack', ...)` precedent) asserting the exact `states` array against `computeVoxelBoxStates(sliderLogValueToT(value, schema.min, schema.max), 0, 1, boxCount)`, not merely "renders without throwing."
  - [x] `git diff src/components/ui/controls/sliderLogMath.ts` is empty for this task.
  - [x] The 22 unaffected existing `SliderLog.test.tsx` cases (every `sliderLogTToValue`/`sliderLogValueToT` math case, `DualLabel` rendering, `{value}{unit}` display including the no-unit/3-decimal-cap cases, the `onChange`-receives-mapped-value case, accessible-name fallback, not-disabled-by-default, disabled attribute + tabindex removal, no-`onChange`-when-disabled, both `data-orientation` cases on root and wrapper, the 2 value-label DOM-order cases, the `'auto'`-defaults-to-horizontal case, and the orientation-has-no-effect-on-the-curve case) pass **unmodified**.
  - [x] The 3 rewritten `verticalHeight` cases assert the new behavior exactly per spec §1.4/§5: omitted → fits against `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` synchronously (no `ResizeObserver` firing required); supplied and not a multiple of `(boxSize + gap)` → rendered height is the box-quantized `computeVoxelTrackLength` output, not the literal value; horizontal → still no inline `height`, but now **also** sets an inline `width` from the fitted box count plus the horizontal trailing reserve.
  - [x] `Slider.Thumb`'s rendered `background-color` is `transparent` — confirmed by reading the shipped `SliderLog.css` directly (this jsdom/vitest setup injects no `<style>` tags, so a unit test on computed style would prove nothing — same finding `SliderLinear.test.tsx`'s own Task 6 already made), not asserted via `getComputedStyle`.
  - [x] `screen.getByRole('slider')` resolves to exactly one element.
  - [x] `SliderLogSchema`/`ControlSchema` are untouched — `git diff src/types/controls.ts` is empty for this task.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` passes (22 unmodified + 3 rewritten + 2 new = 27 total). TDD: RED confirmed first (4 failing, 23 passing against the pre-change component), then GREEN (27/27).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) re-confirmed clean (123 files / 2096 tests) — including `SliderLinear.test.tsx` still unmodified and passing, and `PingContourDrawer.test.tsx` (the real, unmocked `SliderLog` consumer). One unrelated pre-existing flake observed on the first run (`worldTransition.test.ts`'s seeded-swell-snapshot assertion) — passed in isolation and on an immediate re-run with zero code changes; stack trace points to `spawnSystem`/`AudioEngine` voice creation, nothing this task touched.
  - [x] **Manual check:** performed by Crawford in the running app — passed visual review. Surfaced one real bug not caught by the automated suite (jsdom applies no real layout): `.sc-slider-log__track`/`.sc-slider-log__root` still carried pre-Cabinetry CSS, letting the voxel box row overflow into the value label and intercept clicks — fixed as a post-ship refinement (spec §1.5, this doc's own "Post-ship refinements" section below).

  **Dependencies:** Task 1, Task 2 (sequenced after Task 2's own checkpoint — see Architecture Decisions for why).

  **Files:** `src/components/ui/controls/SliderLog.tsx`, `src/components/ui/controls/SliderLog.css`, `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** M (3 files — the first real, user-visible behavior change in this plan: box placement via `t`, plus the `verticalHeight` fitting-budget semantics change requiring 3 rewritten tests)

### Checkpoint: SliderLog ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (123 files / 2096 tests).
- [x] Every real `SliderLog` call site in the app renders through `VoxelTrack` with no call-site changes required — confirmed by `npm run build:types` alone surfacing nothing, since the props contract didn't change.
- [x] Manual pass — performed by Crawford; passed visual review (after the Track/Root fix above).
- [x] Review with human before proceeding.

---

### Phase 4: Docs (parallelizable once their own prerequisite lands)

- [x] **Task 4: `docs/COMPONENT_LIBRARY.md` — `SliderLog`'s note + `SliderLinear`'s hook-extraction addendum**

  **Description:** Add the same "internal rendering changed, contract didn't" note `SliderLinear`'s row already carries, to `SliderLog`'s row, per roadmap 11.1.4's own Docs bullet and spec §6. Also add a short addition to `SliderLinear`'s *existing* note mentioning that its own container-fitting logic moved into the shared `useVoxelTrackSlider` hook this item introduced, so a reader isn't left thinking that logic still lives inline in `SliderLinear.tsx`.

  **Note:** `SliderLinear`'s existing note lived on a sibling branch (`docs/close-out-slider-linear-cabinetry`, the 11.1.3 docs-closeout pass) that hadn't been merged into this feature branch yet — merged in before starting this task so the addendum has a real base to attach to.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `SliderLog` now renders through `VoxelTrack` internally, with its props contract unchanged.
  - [x] `SliderLinear`'s existing note gains a short, accurate mention of the `useVoxelTrackSlider` extraction.
  - [x] Both additions are spot-checked against the actual shipped `SliderLog.tsx` (Task 3) and `SliderLinear.tsx` (Task 2), not this spec's draft.

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped source.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 2, Task 3.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 5: `docs/CONSOLE_THEMING.md` — update the "Voxel-track sliders" section's closing line**

  **Description:** Update the "Voxel-track sliders (Phase 11.1.3)" section's closing framing — currently "Shared unchanged by `SliderLog`/`SliderCenteredZero` (11.1.4/11.1.5) once they ship" — to reflect that `SliderLog` has now shipped through the same mechanism, with `SliderCenteredZero` (11.1.5) remaining the pending one.

  **Acceptance criteria:**
  - [x] The closing line accurately reflects `SliderLog`'s shipped state.
  - [x] No other claim in that section is altered unless this task finds it inaccurate against the actual shipped source while making the edit. (Section header left as "Phase 11.1.3 — SliderLinear" — still accurate as the mechanism's introduction point, not something this task's own scope covers renaming.)

  **Verification:**
  - [x] Manual review — spot-checked against the shipped `SliderLog.tsx`/`voxelTrackMath.ts`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 3.

  **Files:** `docs/CONSOLE_THEMING.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (123 files / 2096 tests).
- [x] All acceptance criteria across all 5 tasks are met.
- [x] `docs/COMPONENT_LIBRARY.md` and `docs/CONSOLE_THEMING.md` both reflect the shipped feature.
- [x] Manual check (Task 3) completed against the real running app — performed by Crawford, passed visual review.
- [x] `docs/todo/roadmap.md` gains the "Done" marker for 11.1.4, mirroring 11.1.2/11.1.3's own pattern.
- [x] Ready for PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 2's retrofit silently regresses `SliderLinear` — the highest-consequence single change in this plan, since it modifies an already-shipped reference component with 11 real production consumers | Medium — a subtle regression (e.g. a rounding difference, a dropped dependency-array entry) could pass a casual glance but change real behavior | Task 2's acceptance criteria require a literal **empty** `git diff` on `SliderLinear.test.tsx`, not just "tests still pass" — and its own checkpoint blocks Task 3 until confirmed |
| `SliderLog`'s box placement accidentally uses raw `value`/`min`/`max` instead of `t`/`0`/`1` (an easy copy-paste mistake from `SliderLinear.tsx`'s own call shape) | Medium — would silently mis-place the straddling box for every log-scaled param, most visible for `Attack`/`Decay`/`Release`'s wide 0–10s range | Task 3's acceptance criteria require asserting the exact `states` array against `computeVoxelBoxStates(t, 0, 1, boxCount)` via a mocked `VoxelTrack`, not "renders without throwing" |
| The `verticalHeight` fitting-budget rewrite reintroduces the same circular-measurement bug class 11.1.3 §1.14 already found and fixed once for `SliderLinear` | Low — the fix (`VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` as a non-measuring fallback) is inherited automatically via the shared hook, not reimplemented | `SliderLog.tsx` never writes its own vertical-measurement logic at all in this plan — it only ever calls `useVoxelTrackSlider`, which already carries the fix; no surface exists for the bug to reappear on |
| N independent `CabinetBox` timelines per slider (11.1.3 §1.2/§7's own "real risk, not fully resolvable at spec time") — this item adds a second slider primitive to the same concern, with no new measurement | Unknown — no data exists yet | Not addressed in this plan; carried forward to 11.2's performance pass exactly as 11.1.3 left it |

## Open Questions

Resolved during Plan (not left open):

- ~~Does the hook ship before or with its first consumer?~~ **Resolved: before (Task 1), with zero consumers** — matches every prior Cabinetry item's "component before consumer" precedent (`VoxelTrack` in 11.1.3, `CabinetBox` in 11.1.1).
- ~~Is `SliderLinear`'s retrofit merged into the same task as `SliderLog`'s rewire, since both call the same new hook?~~ **Resolved: no — kept as 2 strictly separate tasks (2 and 3)**, precisely because the retrofit is this plan's single highest silent-regression-risk task and deserves its own isolated checkpoint before a second consumer is built on the same hook.
- ~~Does `SliderLog`'s rewire have to wait for Task 2's *code* to exist, or its checkpoint to pass?~~ **Resolved: its checkpoint** — the hook's code alone existing (Task 1) would technically unblock Task 3, but sequencing after Task 2's review catches a hook-design flaw at its cheapest possible point (one consumer deep, not two).

Carried forward from the spec's own §7, not blocking this plan:

1. **Whether `SliderCenteredZero` (11.1.5) reuses `useVoxelTrackSlider`** — left to that item's own spec-driven-development pass; this plan doesn't design speculatively for a not-yet-specced consumer.
2. **N-timelines-per-slider performance** (11.1.3's own carried-forward risk, restated in the table above) — not this plan's concern to resolve or measure; 11.2's job once every 11.1.x item has shipped.

## Post-ship refinements (beyond the original 5 tasks)

Real, shipped changes made after all 5 tasks above were already complete — found during the manual running-app check the "Checkpoint: Complete" gate had left outstanding, not a gap in the original spec/plan. Recorded here for the same reason `OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s own task doc records its post-ship section: so this history isn't lost.

- **`.sc-slider-log__track`/`.sc-slider-log__root` still carried the pre-Cabinetry thin-line-track CSS (`height: 3px` + a `background-color` on Track, a literal `height: 20px` on Root), never updated to mirror `SliderLinear.css`'s own already-fixed shape** (`height: 100%` on Track, matching Root's own cross-axis size; the `height: 20px`/`width: 100%` on Root demoted to a same-paint fallback comment, since `Slider.Root`'s real size comes from `useVoxelTrackSlider`'s `rootStyle` now). Task 3's own rewrite touched `Slider.Range`/`Slider.Thumb`/the overflow rules but missed `Track`/`Root` themselves — an oversight in that task's own implementation, not a gap the spec left open. Reported directly by Crawford: clicking near the value label intercepted clicks meant for the slider. Root cause: with Track pinned to a literal 3px height (vertically centered inside Root via `align-items: center`), `VoxelTrack`'s `position: absolute; inset: 0` sized itself to that same 3px box — its own box row (`CabinetBox` instances rendered at their real 32–48px height) then painted `overflow: visible` well outside that 3px container, unclipped, into the flex gap toward the sibling value-label span. `pointer-events: none` on `.sc-voxel-track` (and its inherited descendants) meant the overflowing boxes themselves never captured a click, but the value label — a normal, later-painting DOM sibling with default `pointer-events: auto` — sat visually on top of that overflow region and intercepted clicks before they could reach `Slider.Root`'s real (still only 3px-tall) hit area underneath. Fixed by applying the identical `height: 100%` (horizontal)/`width: 100%` (vertical) treatment `SliderLinear.css` already uses for `.sc-slider-linear__track`, removing the stale `background-color`, and adding the same same-paint-fallback framing comments to `Root` that `SliderLinear.css` already carries. The two files' functional CSS (selectors + property values, comments aside) is now identical modulo the class-name prefix — confirmed by a direct diff. `SliderLog.test.tsx`'s existing 27 cases all still pass unmodified (jsdom applies no real layout, so this class of bug is invisible to the automated suite by construction — exactly why the manual check flagged at the "Checkpoint: Complete" gate mattered here). `npm run build:types`/`lint` clean.
