# Implementation Plan: Audio Rig — Responsive Layout Rework

Source spec: [docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md](../specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md). Source intent: [docs/intent/audio-rig-responsive-layout.md](../intent/audio-rig-responsive-layout.md). Layout/orientation-only — no `AudioEngine`/`BeatClock`/Zustand-shape change, no new `ControlSchema` variant, no existing control's `value`/`onChange` contract changes. Every task either adds a new primitive with no consumer yet, flips an existing schema's literal `orientation` value (immediately live, since the consuming component already reads that field), or restructures `AudioRigDrawer.tsx`'s JSX around content that keeps working exactly as it does today.

## Overview

Retire `'auto'`-resolved orientation (both panel and slider) from the Audio Rig, replacing it with a new tier-driven `'responsive'` `PanelOrientation` (Transport, EQ & Filters, Time & Space's block row, Compressor's sub-rows) and fixed slider values everywhere else, per the spec's §1. Two independent foundation pieces (a new hook, a set of schema-value edits) land first with zero visible behavior change, then each of the 4 Audio Rig sections gets its own small task wiring the new mechanism in, then docs sync last.

## Architecture Decisions

- **The new `'responsive'` mechanism (Tasks 1-2) lands before any schema flips to use it** — same additive-first discipline `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`'s own plan used, for the same reason: a schema flipping to a `PanelOrientation` literal the type system and `DirectionalPanel.tsx` don't recognize yet is a build break, not a soft failure.
- **Slider-orientation fixes (Task 3, Task 4) have zero dependency on the panel mechanism** — they're independent literal-value edits on fields `SliderLinear`/`SliderLog`/`SliderCenteredZero` already read via `useAutoSliderOrientation`'s existing literal-passthrough branch. They can be done first, last, or fully in parallel with Tasks 1-2 and each other.
- **Two of the spec's 5 open items resolve directly during planning, not left for implementation to discover:** `driftGroupSchema()` hardcodes `orientation: 'auto'` inline on both `rateSchema`/`depthSchema` (no parameter to add — Task 4 just changes the two literals in place) and `AudioRigDrawer.css` has zero references to `FILTERS_COLUMN`/`filters-column` (confirmed via direct search — Task 7 needs no CSS change). The remaining 3 open items (whether `controls.test.ts` enumerates `PanelOrientation` exhaustively, the pre-existing inert `filterLPF`/`filterHPF` `block.panel` value, and EQ's own Low/Mid/High row possibly tightening at mobile) stay open, folded into the relevant task's acceptance criteria or the final checkpoint's manual check.
- **EQ & Filters (Tasks 6-7) and Time & Space (Task 8) are each staged as "flip the schema value" then "restructure the JSX that reads it"** where the two aren't atomic — EQ & Filters needs this split because removing `FILTERS_COLUMN_PANEL_SCHEMA` (Task 7) is a breaking change to `AudioRigDrawer.tsx` the instant it lands, so the safe, additive `EQ_FILTERS_ROW_PANEL_SCHEMA`/`EQ_FILTERS_DESKTOP_SHARE` groundwork (Task 6) goes first. Time & Space's `TIME_SPACE_COLUMN_PANEL_SCHEMA` flip (part of Task 5) has no such breaking risk (no export removal), so it's grouped with Transport's own flip in one small task, and only the `topRow`-removal JSX work gets its own task (Task 8).
- **Tasks 7, 8, and 9 are logically independent of each other (different sections) but all touch `AudioRigDrawer.tsx`/`.test.tsx`** — run them sequentially even though the dependency graph alone permits any order among them once their own prerequisites land; parallelizing them across separate sessions risks a real merge conflict on the same file, the same caution the skill gives for shared-file edits.
- **Docs sync (Task 10) lands last**, once every schema's final shipped shape is real and spot-checkable — same precedent `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`'s own Task 11 used.

## Dependency Graph

```
Task 1 (useResponsivePanelOrientation — new hook)
    │
    ▼
Task 2 (types/controls.ts + DirectionalPanel.tsx wiring)
    │
    ├──────────────┬──────────────┬──────────────┐
    ▼              ▼              ▼              │
Task 5          Task 6         Task 9            │
(Transport +    (EQ_FILTERS_   (Compressor       │
 TimeSpace      ROW +          sub-rows →        │
 orientation    DESKTOP_SHARE  responsive)        │
 → responsive)  additive)          │              │
    │              │               │              │
    ▼              ▼               │              │
Task 8         Task 7              │              │
(Time & Space  (AudioRigDrawer     │              │
 topRow        EQ&Filters          │              │
 removal)      flatten +           │              │
    │          FILTERS_COLUMN      │              │
    │          removal)            │              │
    │              │               │              │
    └──────────────┴───────────────┘              │
                   │                               │
                   ▼                               │
        Checkpoint: Audio Rig layout complete ◄────┘
                   │
                   ▼
              Task 10 (docs sync)
                   │
                   ▼
          Checkpoint: Complete

Task 3 (Lfo.tsx Rate/Depth → horizontal) — no dependency, parallel with everything.
Task 4 (audioRigConfig.ts slider fixes: filterLPF/HPF, compressor/limiter, drift groups) — no dependency, parallel with everything.
```

Tasks 3 and 4 are fully independent of the whole `'responsive'`-mechanism chain and of each other conceptually (though both edit `audioRigConfig.ts`/`.test.ts` alongside Tasks 5/6/7, so — same file-contention caution as Tasks 7-9 above — don't literally parallel-edit `audioRigConfig.ts` across sessions; do these sequentially even though nothing here is a true logical dependency).

## Task List

### Phase 1: The `'responsive'` mechanism

- [x] **Task 1: `useResponsivePanelOrientation` — new hook**

  **Description:** Export `useCabinetTier` from `useCabinetBoxHeight.ts` (currently a private function in that file — same file, just drop the missing `export`). Add `src/components/ui/controls/useResponsivePanelOrientation.ts` per spec §4.4: a `useResponsivePanelOrientation(): 'row' | 'column'` hook with no `ref` parameter, returning `'row'` when `useCabinetTier()` is `'desktop'`, `'column'` otherwise. Nothing consumes this yet — `DirectionalPanel.tsx` is untouched this task.

  **Acceptance criteria:**
  - [ ] `useCabinetTier` is exported from `useCabinetBoxHeight.ts`; `useCabinetBoxHeight`/`useVoxelTrackGap`'s own behavior is byte-for-byte unchanged.
  - [ ] `useResponsivePanelOrientation` exists, takes no arguments, returns `'column'` for mobile and tablet tiers, `'row'` for desktop.
  - [ ] No `ResizeObserver` is constructed by this hook — only `useCabinetTier`'s existing `matchMedia` listener pair.
  - [ ] `DirectionalPanel.tsx`/`types/controls.ts` are not modified this task.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/useResponsivePanelOrientation.test.ts src/components/ui/controls/useCabinetBoxHeight.test.ts` passes. New test file stubs `window.matchMedia` the way `useCabinetBoxHeight.test.ts` already does (mobile/tablet query control + `fireChange`) — covers: mobile → `'column'`, tablet → `'column'`, neither → `'row'` (desktop), and re-resolves on a `matchMedia` `'change'` event without remount.
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/useCabinetBoxHeight.ts`, `src/components/ui/controls/useResponsivePanelOrientation.ts` (new), `src/components/ui/controls/useResponsivePanelOrientation.test.ts` (new)

  **Estimated scope:** S (3 files, one small new hook)

- [x] **Task 2: `PanelOrientation` gains `'responsive'`; `DirectionalPanel.tsx` wires it in**

  **Description:** Add `'responsive'` to `PanelOrientation` in `types/controls.ts` (spec §4.1), with a doc-comment sentence distinguishing it from `'auto'`. In `DirectionalPanel.tsx`, call both `useAutoPanelOrientation` (with `schema.orientation === 'responsive' ? 'row' : (schema.orientation ?? 'row')` as its input, per spec §1.2's exact shape) and `useResponsivePanelOrientation()` unconditionally, then resolve `orientation` to whichever result applies based on `schema.orientation === 'responsive'`. Directly check whether `controls.test.ts` enumerates `PanelOrientation`'s literals exhaustively (spec's open item #2) — if so, add `'responsive'` there too.

  **Acceptance criteria:**
  - [ ] `PanelOrientation` is `'row' | 'column' | 'auto' | 'responsive'`.
  - [ ] A `DirectionalPanel` with `schema.orientation: 'responsive'` renders `data-orientation` matching `useResponsivePanelOrientation`'s current resolution.
  - [ ] `'row'`/`'column'`/`'auto'` behavior is provably unaffected — every existing `DirectionalPanel.test.tsx` assertion for those three still passes unmodified.
  - [ ] No `ResizeObserver` is constructed for a `'responsive'` panel (confirms the `autoInput` sanitization actually short-circuits `useAutoPanelOrientation`'s observer branch).
  - [ ] `controls.test.ts` checked directly for an exhaustive `PanelOrientation` enumeration; updated if one exists, left alone with a one-line note in the PR/commit if it doesn't.
  - [ ] No schema in `audioRigConfig.ts`/`AudioRigDrawer.tsx` uses `'responsive'` yet — this task is still additive from the app's own behavior standpoint.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/DirectionalPanel.test.tsx src/types/controls.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Task 1.

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts` (only if the exhaustive-enumeration check finds one), `src/components/ui/controls/DirectionalPanel.tsx`, `src/components/ui/controls/DirectionalPanel.test.tsx`

  **Estimated scope:** S (3-4 files, one resolution branch + a type literal)

### Checkpoint: Mechanism complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] No visible change to the running app yet — `'responsive'` exists and is tested but unused by any real schema.
- [x] Review with human before proceeding — Tasks 3-9 below can be parallelized across sessions once this lands, subject to the file-contention cautions in Architecture Decisions.

---

### Phase 2: Independent slider-orientation fixes

- [x] **Task 3: `Lfo.tsx` — Rate/Depth fixed horizontal**

  **Description:** Per spec §1.3: change `Lfo.tsx`'s `rateSchema`/`depthSchema` `orientation` from `'auto'` to `'horizontal'`, literal. No other change — `LfoProps`, the `RadioButton`/2×`SliderLinear` composition, and every handler stay exactly as-is.

  **Acceptance criteria:**
  - [ ] Every `Lfo` instance's Rate and Depth sliders render `orientation: 'horizontal'`, regardless of viewport width.
  - [ ] `LfoProps` and `Lfo`'s own `isActive`/shape-radio behavior are unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/Lfo.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/Lfo.tsx`, `src/components/ui/controls/Lfo.test.tsx`

  **Estimated scope:** XS (1-2 files, two literal value changes)

- [x] **Task 4: `audioRigConfig.ts` — remaining slider-orientation fixes**

  **Description:** Per spec §1.3/§1.4 and §4.2: change `filterLPF.frequency`/`.Q` and `filterHPF.frequency`/`.Q` from `orientation: 'auto'` back to `orientation: 'vertical'` (the pre-session value — this is the deliberate reversal §1.4 describes, and requires no change to `AudioRigLfoGroup`'s existing `slidersOrientation` heuristic, which already resolves `'row'` once any param in the group is `'vertical'`). Change Compressor's 5 param schemas (`threshold`, `ratio`, `attack`, `release`, `knee`) and Limiter's `threshold` from `'auto'` to `'horizontal'`. In `driftGroupSchema()`, change both `rateSchema.orientation` and `depthSchema.orientation` inline literals from `'auto'` to `'horizontal'` (confirmed: the function takes no `orientation` parameter to add — just the two literals in its body, resolving spec's open item #1 directly).

  **Acceptance criteria:**
  - [ ] `filterLPF`/`filterHPF`'s Frequency and Resonance sliders are `'vertical'`, and (via the unchanged `slidersOrientation` heuristic) their shared sliders-panel resolves `'row'`, not `'column'` — never stacked, at any width.
  - [ ] Compressor's 5 params and Limiter's Threshold are `'horizontal'`.
  - [ ] All 4 `LFO_DRIFT_GROUPS` entries' (`eq3`, `filterLPF`, `filterHPF`, `robots`) `rateSchema`/`depthSchema` are `'horizontal'`.
  - [ ] `filterLPF`/`filterHPF`'s own `block.panel` orientation value (currently `'row'`, wrapping a single `AudioRigLfoGroup` child) is left untouched — not part of this task, per spec §3/§7 item 4.
  - [ ] `eq3`'s Low/Mid/High sliders are untouched — still `'vertical'`.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes. Per spec §5: rename/rewrite the "Low-Pass/High-Pass Filter (Frequency/Resonance) is auto" test to assert `'vertical'`; rewrite the Compressor/Limiter "is auto" tests to assert `'horizontal'`; rewrite the "all 4 `LFO_DRIFT_GROUPS`... are auto" test to assert `'horizontal'`; rewrite `AudioRigDrawer.test.tsx`'s "3-Band EQ's own sliders render in a row-orientation panel — ...`filterLPF`/`filterHPF`... are column" test so all three groups assert `'row'`, updating the test's own title (it currently asserts the opposite for `filterLPF`/`filterHPF`).
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** None (parallelizable with Tasks 1-3; file-contention caution applies against Tasks 5/6/7, which also edit `audioRigConfig.ts`/`AudioRigDrawer.test.tsx`).

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (3 files, literal value edits + matching test rewrites)

### Checkpoint: Slider fixes complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Manual check: LPF/HPF's Frequency/Resonance sliders are vertical and share a row at every width; Compressor/Limiter/LFO/Drift sliders are horizontal.
- [x] Review with human before proceeding.

---

### Phase 3: Transport & Time/Space orientation

- [x] **Task 5: `audioRigConfig.ts` — Transport and Time & Space orientation → `'responsive'`**

  **Description:** Per spec §1.9/§1.7: change `SPEED_AUTOMATION_PANEL_SCHEMA.orientation` and `TIME_SPACE_COLUMN_PANEL_SCHEMA.orientation` from `'row'` to `'responsive'`. Both consts are already rendered by `AudioRigDrawer.tsx` via `<DirectionalPanel schema={...}>` — no consumer-code change needed for this task; the behavior change is live the moment `DirectionalPanel` resolves `'responsive'` (Task 2).

  **Acceptance criteria:**
  - [ ] `SPEED_AUTOMATION_PANEL_SCHEMA.orientation === 'responsive'`.
  - [ ] `TIME_SPACE_COLUMN_PANEL_SCHEMA.orientation === 'responsive'`.
  - [ ] Tempo/Automatic Effects render as 2 stacked rows below 1024px, 1 row above.
  - [ ] Delay/Reverb (as blocks) stack below 1024px, sit side-by-side above.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts` passes — rewrite `SPEED_AUTOMATION_PANEL_SCHEMA`'s "is a row-orientation directionalPanel" test to assert `'responsive'`; add/update the equivalent for `TIME_SPACE_COLUMN_PANEL_SCHEMA` if such a test exists.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check (stub or resize to cross 640px/1024px): Transport & Composition and the Delay/Reverb block row both flip correctly at the tier boundaries.

  **Dependencies:** Task 2.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** S (2 files, two literal value changes + matching test updates)

- [x] **Task 6: `audioRigConfig.ts` — EQ & Filters additive groundwork**

  **Amendment, 2026-09-10 (post-ship):** `EQ_FILTERS_DESKTOP_SHARE` and every `flexBasis`/`desktopSharePercent`/`useCabinetTier()` mechanism this task and Task 7 introduced was removed in a follow-up commit — Crawford changed the desktop split to a straight equal-thirds share, which `DirectionalPanel.css`'s own default `flex: 1 1 0` already provides with no per-block override. Left below as a record of the task as originally executed.

  **Description:** Per spec §1.5/§1.6/§4.2: change `EQ_FILTERS_ROW_PANEL_SCHEMA.orientation` from `'auto'` to `'responsive'`. Add `EQ_FILTERS_DESKTOP_SHARE: Record<'eq3' | 'filterLPF' | 'filterHPF', number>` (`{ eq3: 40, filterLPF: 30, filterHPF: 30 }`), adjacent to `EQ_FILTERS_ROW_PANEL_SCHEMA`. `FILTERS_COLUMN_PANEL_SCHEMA` and `AudioRigDrawer.tsx`'s nested JSX are both untouched this task — still the old 2-level nesting, still building and rendering exactly as before, just with `EQ_FILTERS_ROW_PANEL_SCHEMA` now flowing through `'responsive'` instead of `'auto'` (a behavior change on its own — the outer EQ-vs-Filters split now uses the fixed tier instead of a per-instance width measurement — but the *nesting shape* doesn't change until Task 7).

  **Acceptance criteria:**
  - [ ] `EQ_FILTERS_ROW_PANEL_SCHEMA.orientation === 'responsive'`.
  - [ ] `EQ_FILTERS_DESKTOP_SHARE` exists, `{ eq3: 40, filterLPF: 30, filterHPF: 30 }`, values sum to 100.
  - [ ] `FILTERS_COLUMN_PANEL_SCHEMA` still exists, unchanged, still imported and used by `AudioRigDrawer.tsx`.
  - [ ] `AudioRigDrawer.tsx` is not modified this task.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts` passes — rewrite `EQ_FILTERS_ROW_PANEL_SCHEMA`'s "is an auto-orientation directionalPanel" test to assert `'responsive'`; add a new test for `EQ_FILTERS_DESKTOP_SHARE`'s shape.
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean — confirms the additive change alone doesn't break the drawer that still reads the old nested structure.

  **Dependencies:** Task 2.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** S (2 files, one value flip + one new const)

- [x] **Task 7: `AudioRigDrawer.tsx` — flatten EQ & Filters, remove `FILTERS_COLUMN_PANEL_SCHEMA`**

  **Description:** Per spec §1.5/§1.6/§4.3: replace the 2-level nested EQ & Filters JSX with the flattened shape — `EQ_FILTERS_ROW_PANEL_SCHEMA` wraps `eq3`/`filterLPF`/`filterHPF` directly, as 3 siblings, via `(['eq3', 'filterLPF', 'filterHPF'] as const).map((key) => renderBlock(key, EQ_FILTERS_DESKTOP_SHARE[key]))`. Give `renderBlock()` a new optional second parameter, `desktopSharePercent?: number`; import `useCabinetTier` and call it once at the top of `AudioRigDrawer()`; when `desktopSharePercent` is given and the tier is `'desktop'`, apply `style={{ flexBasis: `${desktopSharePercent}%` }}` to that block's existing `.audio-rig-drawer__effect-block` wrapper `<div>` — omitted (`undefined`) at mobile/tablet and for every other `renderBlock` call site, which stays a single-argument call. Then remove `FILTERS_COLUMN_PANEL_SCHEMA` from `audioRigConfig.ts` and its test — confirmed no other consumer exists after this task lands. Per spec §7 item 3, `AudioRigDrawer.css` needs no change (confirmed during planning: it contains no reference to `FILTERS_COLUMN`/`filters-column`).

  **Acceptance criteria:**
  - [ ] EQ & Filters' accordion content is one flat `DirectionalPanel` (`EQ_FILTERS_ROW_PANEL_SCHEMA`) containing `eq3`/`filterLPF`/`filterHPF`'s effect-blocks directly as siblings — no intermediate wrapper `DirectionalPanel` in the DOM.
  - [ ] Below 1024px: EQ, LPF, and HPF each render as their own full-width row (one per line).
  - [ ] At/above 1024px: all three share one row; `eq3`'s wrapper has `style.flexBasis: '40%'`, `filterLPF`'s and `filterHPF`'s each have `'30%'`.
  - [ ] Every other `renderBlock` call site (delay, reverb, compressor, limiter) is unaffected — no `flexBasis` applied, single-argument calls.
  - [ ] `FILTERS_COLUMN_PANEL_SCHEMA` no longer exists anywhere in `audioRigConfig.ts`, `audioRigConfig.test.ts`, or `AudioRigDrawer.tsx`.
  - [ ] `AudioRigLfoGroup`'s click/focus-to-select-for-LFO targeting inside `eq3`/`filterLPF`/`filterHPF` still works identically (manual check).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx src/data/audioRigConfig.test.ts` passes. Per spec §5: delete every test asserting `FILTERS_COLUMN_PANEL_SCHEMA`'s own shape; add assertions for the flattened sibling structure; add assertions (stubbing `matchMedia` for the desktop tier) that the 3 wrapper divs carry the correct `flexBasis` at desktop and none at mobile/tablet.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check: open Audio Rig in the running app, confirm the EQ & Filters row/stack behavior and the visual ~40/30/30 split at desktop widths, and that nothing overflows horizontally between the tiers (the original bug report).

  **Dependencies:** Task 6.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** L (4 files, at the guideline ceiling — the flatten-and-cleanup is one coupled change with one meaningful verification pass, same reasoning `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`'s own Task 2 used)

- [x] **Task 8: `AudioRigDrawer.tsx` — de-nest Delay/Reverb's paired sub-rows**

  **Description:** Per spec §1.7/§4.3: delete the `block.key === 'delay'` and `block.key === 'reverb'` branches from `renderBlock()`'s conditional entirely — both fall through to the existing final `else` branch (`block.params.map((param) => paramRow(param, effect, updateParam))`), the same flat shape Compressor/Limiter's non-special-cased params already use. This removes the hand-composed `topRow` (`Time`+`Feedback` / `Decay`+`Pre-Delay`) nesting outright, at every breakpoint — not just mobile/tablet.

  **Acceptance criteria:**
  - [ ] Every one of Delay's params (Time, Feedback, Mix) renders as its own direct `.audio-rig-drawer__param-row`, in that order, inside Delay's own (unchanged, `'column'`) `block.panel` — no nested row `DirectionalPanel` remains.
  - [ ] Every one of Reverb's params (Decay, Pre-Delay, Mix) renders the same way.
  - [ ] This holds at every breakpoint, including desktop — not conditional on tier.
  - [ ] Delay's and Reverb's own `block.panel` orientation is unchanged (`'column'`) — only the internal `topRow` composition is removed.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes — remove/rewrite any assertion of Delay's/Reverb's nested `topRow` `DirectionalPanel`; add an assertion that each param renders as its own row with no intermediate wrapper, at every tier.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check: Delay's and Reverb's sliders each occupy a full-width row within their own block, at every viewport width.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (2 files, deletion of 2 branches)

### Checkpoint: EQ & Filters / Time & Space complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Manual check of EQ & Filters and Time & Space against spec §1.5/§1.6/§1.7 at mobile/tablet/desktop widths.
- [x] Review with human before proceeding.

---

### Phase 4: Output

- [x] **Task 9: `AudioRigDrawer.tsx` — Compressor's sub-rows → `'responsive'`; de-nest the third row**

  **Description:** Per spec §1.8, confirmed against the intent doc directly during planning: the intent doc names exactly two "existing paired sub-rows" that stay paired on desktop — Threshold+Ratio and Attack+Release. Compressor's third inline row (`audioRig.compressor.bottomRow` — note this id is a pre-existing duplicate of the Attack+Release row's own id; flag but don't fix as part of this task, it's not this phase's concern) pairs Knee with the Decay Mode radio and is **not** one of the two named pairs. Per the general Output rule ("all sliders get their own rows" on mobile/tablet) and the absence of Knee/Decay-Mode from the protected pair list, this third row is de-nested entirely, the same way Delay/Reverb's `topRow` was (Task 8) — Knee and the Decay Mode radio each become their own direct `.audio-rig-drawer__param-row`/row, at every breakpoint, not just mobile/tablet. So: change `audioRig.compressor.topRow` (Threshold+Ratio) and the Attack+Release `bottomRow` from `orientation: 'row'` to `orientation: 'responsive'`; remove the third `DirectionalPanel` wrapper entirely, rendering Knee's `paramRow(...)` and the Decay Mode radio's row as two flat, unwrapped siblings directly inside Compressor's own `block.panel`.

  **Acceptance criteria:**
  - [ ] Compressor's Threshold+Ratio pair and Attack+Release pair each render as 2 stacked rows below 1024px, paired side-by-side above.
  - [ ] Knee renders as its own full-width row, and the Decay Mode radio renders as its own full-width row, at every breakpoint — no shared wrapper between them.
  - [ ] The pre-existing duplicate `audioRig.compressor.bottomRow` id (shared by the old Attack+Release and Knee+DecayMode panels) no longer exists once the third wrapper is removed — confirms the duplicate is resolved as a side effect, not left behind.
  - [ ] Limiter's single param is unaffected.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes — add assertions (stubbing `matchMedia`) that Compressor's `topRow`/Attack+Release row resolve `'row'` at desktop and `'column'` at mobile/tablet; add an assertion that Knee and Decay Mode each render as their own unwrapped row at every tier.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check: Compressor's first two paired rows stack below 1024px, pair above; Knee and Decay Mode each sit on their own full-width row at every width; Limiter unaffected.

  **Dependencies:** Task 2.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (2 files, two literal value changes + one wrapper removal)

### Checkpoint: Audio Rig layout complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Full manual check across mobile (~375px), tablet (~800px), and desktop (~1280px+), dragging the window live across the 640px/1024px thresholds, against spec §5's complete checklist (Transport, EQ & Filters, LPF/HPF sliders, Time & Space, Compressor) — including a glance at EQ's own Low/Mid/High row at mobile widths now that it's a standalone sibling (spec §7 item 5 — not a confirmed requirement, just worth a look).
- [x] Confirm nothing overflows horizontally at any width between the tiers — the original bug report.
- [x] Review with human before proceeding.

---

### Phase 5: Docs

- [x] **Task 10: Documentation sync**

  **Description:** Per spec §6: add a short line to `docs/COMPONENT_LIBRARY.md`'s existing "Panel orientation (`PanelOrientation`)" subsection introducing `'responsive'` alongside `'auto'`/`'row'`/`'column'`, pointing at this spec. Add a short dated amendment note to `docs/specs/VERTICAL_SLIDERS.md` near its classification table's `filterLPF`/`filterHPF` row (still `'auto'` in that historical table — leave the table itself as a record of what was decided then, add the note pointing at this spec's reversal). Add the same kind of amendment note to `docs/tasks/DIRECTIONAL_PANEL_WIRING.md` near its own description of `filterLPF`/`filterHPF` resolving to `'column'`.

  **Acceptance criteria:**
  - [ ] `COMPONENT_LIBRARY.md`'s "Panel orientation" subsection documents `'responsive'` and links to this spec.
  - [ ] `VERTICAL_SLIDERS.md` and `DIRECTIONAL_PANEL_WIRING.md` each carry a short amendment note (not a rewrite of their historical tables/prose) pointing at this spec for `filterLPF`/`filterHPF`'s reversal.
  - [ ] No claim in any of the 3 docs contradicts the actual shipped source (spot-check against Tasks 1-9's final code).

  **Verification:**
  - [ ] Manual review — spot-check each note against the shipped `audioRigConfig.ts`/`AudioRigDrawer.tsx`/`DirectionalPanel.tsx`.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Tasks 1-9 (docs describe the finished shape).

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/specs/VERTICAL_SLIDERS.md`, `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`

  **Estimated scope:** XS (docs only, 3 files)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 10 tasks are met.
- [x] Full manual check (Phase 4's checkpoint) reconfirmed against the final shipped code.
- [x] All 3 docs reflect the shipped feature.
- [x] Ready for human review / PR.

**Reopened, 2026-09-10 (found during `ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md` Task 8):** `DirectionalPanel.css`'s `.sc-directional-panel__content>* { flex: 1 1 0; }` applied unconditionally to both row and column orientation — correct for row (this phase's own EQ-split fix), but for a column-oriented top-level (autoHeight) facade, `flex-basis: 0` collapses the panel to zero visible height regardless of real content. `SPEED_AUTOMATION_PANEL_SCHEMA` (Task 5, `'responsive'`, resolves `'column'` on mobile/tablet) is a top-level, autoHeight, column-shaped panel with 2 direct slider-row children — the same shape as the confirmed Robot Drift bug — so Tempo/Automatic Effects on mobile/tablet width are suspect and need Crawford's own visual re-check. The fix itself (scoping the rule to `[data-orientation='row']`) already landed in `DirectionalPanel.css` as part of the other task; nothing in this task list's own files needs to change, only a visual re-confirmation of this one already-checked-off item.

**Reopened, 2026-09-10 (Crawford, live in the browser, following the Task 6/7 EQ & Filters work): "Audio Rig's gap doesn't actually show."** Tasks 6-9 grouped eq3/filterLPF/filterHPF (and later, in the same spirit, Delay/Reverb and Compressor/Limiter) as direct siblings of one shared `DirectionalPanel` — `EQ_FILTERS_ROW_PANEL_SCHEMA` / `TIME_SPACE_COLUMN_PANEL_SCHEMA` / `OUTPUT_COLUMN_PANEL_SCHEMA`. Since a `DirectionalPanel` only renders its own Cabinetry facade when it's *top-level* (not nested inside another `DirectionalPanel`), every block inside one of these 3 shared panels became nested and lost its own facade — all 3 blocks in a group painted onto one continuous facade. A follow-up fix widened that shared panel's own internal flex gap via `data-panel-id`-targeted CSS (`AudioRigDrawer.css`); Crawford confirmed via DevTools' Computed panel that the CSS rule matched correctly (`row-gap: 12px`) but the gap still wasn't visible — because it was padding inside one shared surface, not a boundary between two distinct boxes. Explicitly confirmed goal: **"Yes — I want each section to look like its own separate box, with a real gap between distinct boxes."**

Fix: a new shared component, `PanelGroup` (`src/components/ui/controls/PanelGroup.tsx`/`.css`, TDD'd in `PanelGroup.test.tsx`) — a plain row/column flex wrapper with a fixed `0.75rem` gap that does **not** provide `DirectionalPanel`'s nesting context, so any `DirectionalPanel` rendered as its child stays top-level and keeps its own independent facade. `AudioRigDrawer.tsx`'s EQ & Filters and Time & Space groupings now use `<PanelGroup orientation="responsive">`; Output uses `<PanelGroup orientation="column">`. `EQ_FILTERS_ROW_PANEL_SCHEMA` / `TIME_SPACE_COLUMN_PANEL_SCHEMA` / `OUTPUT_COLUMN_PANEL_SCHEMA` are removed from `audioRigConfig.ts` (no longer `DirectionalPanelSchema` objects — `PanelGroup` takes a plain `orientation` prop, no schema/id/facade), and the now-dead `data-panel-id`-targeted gap CSS is removed from `AudioRigDrawer.css`. `AudioRigDrawer.test.tsx`/`audioRigConfig.test.ts` were rewritten to assert the new structure: each of EQ/LPF/HPF, Delay/Reverb, and Compressor/Limiter has its own `.sc-directional-panel-facade`, not a shared one. This is the reason Task 6/7's original "flatten into one shared panel" framing (§1.5/§1.6) is superseded for the *grouping* layer specifically — the row/column layout behavior those tasks specified is unchanged, only the wrapper that provides it.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tasks 4/5/6/7 all edit `audioRigConfig.ts`/`audioRigConfig.test.ts` — literal parallel execution across separate sessions risks a merge conflict even though each task's own changes are logically independent | Medium if parallelized carelessly, low if sequential | Architecture Decisions calls this out explicitly; run these 4 tasks in the listed order within one session/branch rather than truly concurrently |
| Tasks 7/8/9 all edit `AudioRigDrawer.tsx`/`.test.tsx` — same file-contention risk as above | Medium if parallelized carelessly, low if sequential | Same mitigation — sequential execution, dependency graph order |
| The `flexBasis` inline-style override (Task 7) is the one place this phase reaches past `DirectionalPanel`'s own schema contract — confirmed acceptable in the spec (§1.6/§3), but an implementer skimming only the task list might be tempted to generalize it into a new schema field | Low — spec explicitly forbids generalizing this speculatively | Task 7's description and spec §3 both state this directly; don't add a `shares`/`weights` field to `DirectionalPanelSchema` as part of this work |
| `controls.test.ts`'s exhaustive-enumeration check (Task 2) and the `AudioRigDrawer.css`/`driftGroupSchema()`/Compressor's-third-row open items (spec §7 items 1, 3) | Low | The latter three are already resolved during this planning pass (Architecture Decisions, Task 9's description) — only the `controls.test.ts` check remains genuinely open, folded into Task 2 |

## Open Questions

Resolved during Plan (not left open):

- ~~Does `driftGroupSchema()` need a new `orientation` parameter?~~ **Resolved: no — both `rateSchema`/`depthSchema` hardcode `orientation: 'auto'` inline; Task 4 just changes the two literals.** Confirmed by reading the function directly.
- ~~Does `AudioRigDrawer.css` reference the removed `FILTERS_COLUMN_PANEL_SCHEMA` grouping by class name?~~ **Resolved: no — confirmed via direct search, zero matches. Task 7 needs no CSS change.**
- ~~Can EQ & Filters' flattening (schema flip + JSX restructure + export removal) land as one atomic task?~~ **Resolved: no — staged as Task 6 (additive) then Task 7 (restructure + removal), same reasoning as `DIRECTIONAL_PANEL_WIRING.md`'s own additive-first precedent.**

Carried forward from the spec, not blocking this plan:

1. Whether `controls.test.ts` exhaustively enumerates `PanelOrientation` (spec §7 item 2) — Task 2's own acceptance criteria resolve this directly during implementation, not guessed here.
2. `filterLPF`/`filterHPF`'s own inert `block.panel` orientation (spec §7 item 4) — explicitly left untouched in Task 4's acceptance criteria; not a bug this plan fixes.
3. Whether EQ's own Low/Mid/High row tightens at mobile widths now that it's a standalone flattened sibling (spec §7 item 5) — folded into the Phase 4 checkpoint's manual check, not a task of its own unless that check finds a real problem.

Resolved during this Plan (spec left open, closed here by reading the intent doc + code directly):

- ~~Compressor's third row (Knee + Decay Mode) orientation?~~ **Resolved: de-nested entirely, not made `'responsive'`** — the intent doc names exactly two "existing paired sub-rows" (Threshold+Ratio, Attack+Release); Knee/Decay-Mode isn't among them, so it falls under the general "sliders get their own row" rule at every breakpoint, matching Delay/Reverb's treatment (Task 8/9). This also resolves a pre-existing duplicate-id bug (`audioRig.compressor.bottomRow` was reused by 2 different panels) as a side effect.
