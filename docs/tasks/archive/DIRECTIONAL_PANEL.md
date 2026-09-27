# Implementation Plan: `DirectionalPanel` Primitive

Source spec: [docs/specs/DIRECTIONAL_PANEL.md](../specs/DIRECTIONAL_PANEL.md). Source intent: [docs/intent/directional-panel.md](../intent/directional-panel.md). Pure presentation addition — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `value`/`onChange` contract change on any existing schema. Every task below either adds a type with no consumer yet, or ships a component with zero real consumers wired in (confirmed out of scope — see spec §2). None touch audio scheduling, animation, or any existing drawer.

## Overview

Add `DirectionalPanel` — the 15th `ControlSchema` primitive — as a pure layout container that groups already-rendered controls into a flex row or column, fixing the "every control gets its own stacked block-level row" problem the intent doc diagnosed in `AudioRigDrawer`'s EQ3 block. Ship the new `PanelOrientation` type and `DirectionalPanelSchema` first (inert — no consumer reads it yet), then the component itself (`DirectionalPanel.tsx`/`.css`/`.test.tsx`, no Radix dependency, no state), then document it in `docs/COMPONENT_LIBRARY.md`. No drawer is touched — wiring this into a real consumer (EQ3, Signature Array, Ping Controls/Contour, etc.) is an explicitly separate follow-up pass, once the user provides the fuller wiring list referenced in the intent doc.

## Architecture Decisions

- **This is 3 tasks, not more, because there's no required-field migration to stage.** `docs/tasks/VERTICAL_SLIDERS.md` needed a 3-task widen-then-narrow sequence because `SliderOrientation` was a *required* field being added to 3 already-populated schema types — an inherently atomic, all-or-nothing change that had to be staged to stay buildable at each step. `PanelOrientation` on `DirectionalPanelSchema` has no such problem: it's optional from day one (spec §3 — this is deliberately the opposite of `SliderOrientation`'s precedent), and `DirectionalPanelSchema` is a brand-new type with zero existing literals anywhere in the codebase to migrate. So Task 1 adds the finished, final type shape in one step — no widen/narrow dance needed.
- **Component + CSS + test ship as one task (Task 2), not split further.** Unlike `docs/tasks/VERTICAL_SLIDERS.md`'s 3 independent slider components (each usable and testable on its own, safe to parallelize), `DirectionalPanel` is a single component: its `.tsx` is non-functional without its `.css` (renders unstyled, wrong axis), and its test file is what proves the acceptance criteria in spec §5. Three files, one indivisible vertical slice — well under the ≤5-file guideline, no seam to split along.
- **Strictly sequential, no parallelization opportunity.** Task 2 imports `DirectionalPanelSchema` from Task 1; Task 3 documents Task 2's final shipped shape. Unlike the sibling feature's Tasks 5-7 (3 independent sliders sharing one prerequisite hook), there's only one component here — nothing to run in parallel.
- **Docs land last (Task 3)**, once the component's final shipped shape is real and spot-checkable — same precedent `docs/tasks/VERTICAL_SLIDERS.md`'s own Task 8 and `docs/tasks/LFO_CONSOLIDATED_DISPLAY.md`'s Task 6 both used.

## Dependency Graph

```
Task 1 (PanelOrientation type + DirectionalPanelSchema, controls.ts/controls.test.ts)
    │
    └──→ Task 2 (DirectionalPanel.tsx + .css + .test.tsx)
              │
              └──→ Task 3 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — the type

- [x] **Task 1: `PanelOrientation` type + `DirectionalPanelSchema`**

  **Description:** In `src/types/controls.ts`, add `export type PanelOrientation = 'row' | 'column';` and `export interface DirectionalPanelSchema extends ControlSchemaBase { type: 'directionalPanel'; orientation?: PanelOrientation; }` (spec §4 — `orientation` optional, no widen/narrow staging needed). Add `DirectionalPanelSchema` to the `ControlSchema` union and `'directionalPanel'` to `CONTROL_SCHEMA_TYPES` (14 → 15 entries). In `src/types/controls.test.ts`: bump the `CONTROL_SCHEMA_TYPES` "has exactly N entries" assertion to 15 and add `'directionalPanel'` to the sorted-discriminants assertion; add a `directionalPanel: DirectionalPanelSchema = { id: 'eq3Panel', type: 'directionalPanel', orientation: 'row' }` literal to the "one literal object per variant" test, add it to the `variants` array, bump that `toHaveLength` to 15; add a new `describe('PanelOrientation', ...)` block mirroring the existing `describe('SliderOrientation', ...)` block — asserting `'row'`/`'column'` are accepted literal values, and that `orientation` is optional (a literal omitting it type-checks).

  **Acceptance criteria:**
  - [x] `PanelOrientation` is exported from `src/types/controls.ts` as `'row' | 'column'`.
  - [x] `DirectionalPanelSchema` is exported, extends `ControlSchemaBase`, `type: 'directionalPanel'`, `orientation?: PanelOrientation` (optional — not required, unlike `SliderOrientation` on the 3 slider schemas).
  - [x] `DirectionalPanelSchema` is a member of the `ControlSchema` union.
  - [x] `CONTROL_SCHEMA_TYPES` has exactly 15 entries, no duplicates, including `'directionalPanel'`.
  - [x] No other schema type gains a field — this task only adds one new type and one new union member.
  - [x] `controls.test.ts`'s "one literal object per variant" test constructs a `DirectionalPanelSchema` literal and includes it in its 15-entry `variants` array.
  - [x] `controls.test.ts` has a `PanelOrientation` describe block asserting both literal values and that `orientation` is optional.

  **Verification:**
  - [x] `npx vitest run src/types/controls.test.ts` passes.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts`

  **Estimated scope:** S (2 files, additive-only — no existing literal anywhere needs updating, since nothing constructs this schema yet)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [x] `grep -n "directionalPanel" src/types/controls.ts src/types/controls.test.ts` shows the type, schema, union member, `CONTROL_SCHEMA_TYPES` entry, and test fixtures all present.
- [x] No visual or behavioral change in the running app — nothing renders this schema yet.
- [ ] Review with human before proceeding.

---

### Phase 2: The component

- [x] **Task 2: `DirectionalPanel` component**

  **Description:** Add `src/components/ui/controls/DirectionalPanel.tsx` per spec §4's full shape: `{ schema: DirectionalPanelSchema; children: ReactNode }` props, no `value`/`onChange`, no local state; resolves `orientation = schema.orientation ?? 'row'`; renders a `DualLabel` (reading `schema.loreLabel`/`schema.humanLabel`) above a `.sc-directional-panel__content` flex wrapper stamped with `data-orientation={orientation}` wrapping `children`. Add `src/components/ui/controls/DirectionalPanel.css` per spec §4: outer `.sc-directional-panel` (`flex; column; gap: 4px`), `.sc-directional-panel__content` (`flex; row; nowrap; gap: 8px`), and the `[data-orientation='column']` override (`flex-direction: column`). Add `src/components/ui/controls/DirectionalPanel.test.tsx` covering spec §5's 6 testable cases: renders children; renders `DualLabel` output correctly across the neither/one/both label-presence cases; `data-orientation` defaults to `'row'` when `schema.orientation` is omitted; is `'row'` when explicitly set; is `'column'` when set; multiple children render in the same DOM order passed in.

  **Acceptance criteria:**
  - [x] `DirectionalPanel` renders with no `value`/`onChange` props and no internal state — a pure function of `schema`/`children`.
  - [x] `schema.orientation` omitted or explicitly `'row'`: content wrapper has `data-orientation="row"`.
  - [x] `schema.orientation: 'column'`: content wrapper has `data-orientation="column"`.
  - [x] `DualLabel` renders correctly for all 4 label-presence combinations (neither/lore-only/human-only/both), matching `DualLabel`'s existing "renders nothing/one/both" behavior.
  - [x] Children render inside the content wrapper, in the same order passed in.
  - [x] No Radix import, no `timelineMap`/GSAP import, no `accessibleName.ts` import (spec §1.1, §3 — not an interactive primitive).
  - [x] `.sc-directional-panel__content` is `flex-wrap: nowrap` in the CSS (spec §1.4) — no `wrap` prop exists on the component.
  - [x] CSS class names follow the `sc-directional-panel`/`sc-directional-panel__content` convention (spec §4).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/DirectionalPanel.test.tsx` passes, covering every acceptance criterion above.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.
  - [x] Manual check: none applicable — zero real consumers exist yet (spec §5); nothing to open in the running app for this task.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/DirectionalPanel.tsx`, `src/components/ui/controls/DirectionalPanel.css`, `src/components/ui/controls/DirectionalPanel.test.tsx`

  **Estimated scope:** S (3 files, one self-contained component — no consumer wiring)

### Checkpoint: Component ships
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `DirectionalPanel` is importable and renders correctly in isolation (verified by its own test suite) with zero other files in the app referencing it yet.
- [ ] Review with human before proceeding.

---

### Phase 3: Docs

- [x] **Task 3: `docs/COMPONENT_LIBRARY.md` — document `DirectionalPanel`**

  **Description:** Add a `DirectionalPanel` row to the primitives table (`ControlSchema` variant `DirectionalPanelSchema`, props `{ schema: DirectionalPanelSchema; children: ReactNode }`, no `ROBOT_DATA_GRID.md` row — same "not in the robot grid" treatment `TextInput`/`CoordsInput` already get). Update "All 14 live in `src/components/ui/controls/`" to "All 15". Add a short subsection (mirroring "Slider orientation (`SliderOrientation`)") introducing `PanelOrientation`, the `'row'`-never-wraps decision, the standalone/nestable composition model (spec §1.2), and a pointer to `docs/specs/DIRECTIONAL_PANEL.md` for the full rationale — including the `LfoTargetGroup` composability note (spec §1.3), since that's the concrete case the fuller wiring pass will hit first.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md`'s primitive table includes `DirectionalPanel`, matching the shipped props exactly.
  - [x] The "All 14 live in..." sentence is updated to 15.
  - [x] The new subsection documents `PanelOrientation`, the no-wrap decision, and the composition/nesting model, and links to `docs/specs/DIRECTIONAL_PANEL.md`.
  - [x] No claim in the new section is contradicted by the actual shipped source (spot-check against Task 2's final code).

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `DirectionalPanel.tsx`/`.css`.
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 2.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 3 tasks are met.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gap values (4px label-to-content, 8px between grouped children) were inferred from sibling-primitive CSS conventions, not explicitly confirmed with the user (spec §7 item 1) | Low — both values have direct precedent elsewhere in the codebase | Task 2's CSS matches spec §4 exactly; flag for a visual confirmation once wired into a real drawer in the follow-up pass, not blocking this plan |
| A future wiring pass reaches for `DirectionalPanel` to *replace* one of `LfoTargetGroup`'s targeted row `<div>`s instead of wrapping around them (spec §1.3) | Medium for that future pass, zero impact on this plan (no drawer touched here) | Spec §1.3 and this plan's Task 3 both document the boundary explicitly: `DirectionalPanel` wraps existing targeted rows, it never becomes one — carried forward so the wiring pass's own plan starts from the right composition |
| `VERTICAL_SLIDERS.md` §7's flagged residual `ResizeObserver` sizing risk applies once a real drawer nests an `'auto'`-orientation slider inside a `DirectionalPanel` (spec §7 item 3) | Medium for the eventual wiring pass, zero impact here (`DirectionalPanel` renders no slider itself) | Re-flagged, not solved, by this plan — the wiring pass's own plan needs to read both specs before deciding how each panel gets sized |

## Open Questions

Resolved during Plan (not left open):

- ~~Does the required-field-migration pattern from `VERTICAL_SLIDERS.md` apply here?~~ **Resolved: no — `orientation` is optional from day one, so Task 1 ships the finished type in a single step.** See Architecture Decisions.
- ~~Can Task 2 be split further (component vs. CSS vs. tests)?~~ **Resolved: no — one indivisible 3-file vertical slice, well under the ≤5-file guideline, with no independent-parallelizable seam the way the sibling feature's 3 slider components had.**

Carried forward from spec §7, not blocking this plan:

1. **The fuller list of where `DirectionalPanel` should apply across the app** is still pending from the user — it will shape a separate, standalone Plan/Tasks pass once provided, not an amendment to this one.
2. **Gap-value visual confirmation** (spec §7 item 1) — deferred to whenever the first real drawer wires this in, since there's no consumer to look at yet in this plan.
