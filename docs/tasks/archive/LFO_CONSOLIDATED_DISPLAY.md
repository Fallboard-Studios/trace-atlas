# Implementation Plan: Consolidated LFO Display

Source spec: [docs/specs/LFO_CONSOLIDATED_DISPLAY.md](../specs/LFO_CONSOLIDATED_DISPLAY.md). Source intent: [docs/intent/lfo-consolidated-display.md](../intent/lfo-consolidated-display.md). Pure UI restructuring — no `AudioEngine`/`lfoEngine.ts` change, no new Zustand field, no new `LfoTargetId`/`DriftGroupId`. Every task below either builds the new shared component or modifies an existing presentational component/config file; none touch audio scheduling.

## Overview

Replace every "slider + its own nested Modulation accordion" instance (3 EQ bands, LPF/HPF's Frequency+Q pairs, each of the 3 Signature Array oscillator layers' Gain/Detune/Phase/Interval, and Volume) with bare sliders followed by one shared LFO display per functionally-independent group, selected by click/click-around/keyboard-focus, defaulting to the group's first field, transitioning through a neutral placeholder state (GSAP-scaffolded, instant today) rather than jumping directly between two real values. Where a drift control already exists for a group (EQ3/LPF/HPF only), it moves from its current standalone trailing block into that group's own accordion, directly beneath the shared display.

## Architecture Decisions

- **Resolves spec §7 open question 1 (public API shape): a hook-backed component exposing both.** `useLfoTargetGroup` (Task 1) owns the entire state machine (selected field, transitioning flag, `select()`, the `timelineMap`-registered GSAP scaffold) and is the one place the logic lives. `LfoTargetGroup` (Task 2) is a thin render-prop wrapper around that hook for the two consumers that can render every row through a single callback (`SignatureArrayDrawer`, `AudioSettingSection`). `AudioRigDrawer` — whose params are already rendered in an existing pass for `updateParam`'s own dispatch — calls `useLfoTargetGroup` directly against its own pre-rendered rows instead of going through the wrapper, exactly the fit the spec flagged. Both are exported from `LfoTargetGroup.tsx` so there is one source of truth for the state machine, not two.
- **Resolves spec §7 open question 2 (optimistic vs. deferred update): deferred until the transition's `onComplete`.** The targeted row's class and the shared display's label/values all move together off one committed `selected` value, updated only when the (today 0-duration) GSAP timeline completes — never split into an instant per-click piece and a lagging piece. This is a asserted behavior in Task 1's tests, not left as a follow-up decision.
- **New shared component lands first, alone, before any consumer.** Every other task either imports `useLfoTargetGroup`/`LfoTargetGroup` directly or depends transitively on a file that does. Nothing about it depends on any consumer's own shape, so there's no reason to sequence it after them — same reasoning `docs/tasks/LFO_DRIFT_GROUPS.md` used for its own foundational `DriftGroupId` task.
- **Each consumer site is its own vertical slice, not split into "config change" and "drawer change" tasks.** Unlike `LFO_DRIFT_GROUPS.md`'s horizontal split (data model, then engine, then UI, sequenced because later layers depended on earlier ones' final shape), this feature's config changes (removing the now-dead `lfoAccordion` field) and its consumer's rendering change are two halves of one coherent edit with no independent value on their own — shipping one without the other either leaves dead schema fields in place or breaks a compile. Each of Tasks 3-5 below is a complete, independently mergeable, independently testable "this screen now shows the consolidated display" slice.
- **Global effects (Task 3) and robot/company screens (Tasks 4-5) can run in either order, or in parallel, once Task 2 lands** — neither reads the other's files. Task 4 (Signature Array) and Task 5 (Volume) both touch `robotOptionsConfig.ts`/`.test.ts`, but at non-overlapping locations (`SIGNATURE_ARRAY_CONFIG`'s per-layer `lfoAccordion` field vs. the standalone `VOLUME_LFO_ACCORDION_SCHEMA` export) — sequence them however's convenient; they don't need to block each other.
- **Docs (Task 6) land last**, once the shipped component's final public shape (hook + component, both exports) is real and spot-checkable, matching `LFO_DRIFT_GROUPS.md`'s own "docs land last" precedent.

## Dependency Graph

```
Task 1 (useLfoTargetGroup hook)
    │
    ├──→ Task 2 (LfoTargetGroup render-prop component, wraps Task 1's hook)
    │         │
    │         ├──→ Task 4 (SignatureArrayDrawer.tsx — 3 layers)
    │         │
    │         └──→ Task 5 (AudioSettingSection.tsx — Volume)
    │
    └──→ Task 3 (AudioRigDrawer.tsx — eq3/filterLPF/filterHPF, uses hook directly)

Task 3, Task 4, Task 5 ──→ Task 6 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — the shared component

- [x] **Task 1: `useLfoTargetGroup` — the selection/transition hook**

  **Description:** Add `src/components/ui/controls/useLfoTargetGroup.ts`, exporting a hook that owns everything in spec §1.3: `selected` (defaults to the first field), `transitioning`, `select(field)` (no-op if already selected; otherwise kills any existing timeline for this group, sets `transitioning: true`, creates a 0-duration `gsap.timeline()` registered in `timelineMap` under `` `lfo-target-group-${groupId}` ``, and on `onComplete` commits `selected`/clears `transitioning` together — the deferred-update decision above), a `useEffect` that kills the timeline on unmount, and a fallback `useEffect` that snaps `selected` to `fields[0]` if the currently-selected field's key disappears from a new `fields` array (spec §1.4 item 4, e.g. Signature Array's `pulseWidth` row hiding). Also exports `NEUTRAL_LFO_VALUE` (`{ shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN, active: false }`) and a computed `displayValue`/`displayLabel` pair (`NEUTRAL_LFO_VALUE`/`undefined` while transitioning, else the selected field's own `lfoValue`/`label`).

  **Acceptance criteria:**
  - [x] `useLfoTargetGroup({ groupId, fields })` returns `{ selected, transitioning, select, displayValue, displayLabel, isTargeted(field) }`.
  - [x] Defaults `selected` to `fields[0].field` on first render.
  - [x] `select(next)` where `next === selected` does not create or kill any timeline (verifiable via a `setTimeline`/`killTimeline` spy).
  - [x] `select(next)` where `next !== selected` sets `transitioning: true` synchronously, then — once the timeline's `onComplete` fires — sets `selected: next` and `transitioning: false` together, never one without the other in the same tick.
  - [x] While `transitioning` is `true`, `displayValue` is exactly `NEUTRAL_LFO_VALUE` and `displayLabel` is `undefined` — never the outgoing or incoming field's real label/value.
  - [x] If the current `fields` prop stops containing `selected` (identity by `field` key), the hook falls back to the new `fields[0]` without requiring `select()` to be called, and without leaving `transitioning` stuck `true`.
  - [x] Unmounting calls `killTimeline` for `` `lfo-target-group-${groupId}` ``.
  - [x] No `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in the file — the transition is GSAP-timeline-only, per CLAUDE.md and spec §3.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/useLfoTargetGroup.test.ts` passes, covering every acceptance criterion above (mock or directly invoke `gsap.timeline`'s `onComplete` to assert both the synchronous "just started transitioning" state and the post-completion committed state).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/useLfoTargetGroup.ts`, `src/components/ui/controls/useLfoTargetGroup.test.ts`

  **Estimated scope:** S (one new hook, no consumers yet)

- [x] **Task 2: `LfoTargetGroup` — the render-prop component**

  **Description:** Add `src/components/ui/controls/LfoTargetGroup.tsx` (+ `.css`), a thin wrapper around Task 1's `useLfoTargetGroup`: renders one row per field via a caller-supplied `renderField(field, targeted, select)` callback, each row's own className carrying `withActiveClass('sc-lfo-target-group__row', isTargeted(field))`; then one shared `<Lfo>` control (`schema={{ id: \`${groupId}.lfo\`, type: 'lfo', humanLabel: displayLabel }}`, `value={displayValue}`, `disabled={disabled || transitioning}`, `onChange={(v) => onLfoChange(selected, v)}`) inside a wrapper carrying `withActiveClass('sc-lfo-target-group__display', transitioning)`; then `driftContent` if passed, directly below, still inside the same outer `<div className="sc-lfo-target-group">` (spec §1.2, §4).

  **Acceptance criteria:**
  - [x] `LfoTargetGroup<F>` renders exactly one row per entry in `fields`, each via `renderField`, wrapped with the targeted class computed from the hook.
  - [x] Exactly one `Lfo` control renders regardless of field count, showing the hook's `displayValue`/`displayLabel`.
  - [x] `driftContent`, when passed, renders inside the same outer wrapper, below the `Lfo` display; when omitted, nothing extra renders.
  - [x] No `AccordionContainer` (or any other accordion) is rendered anywhere inside `LfoTargetGroup` itself — it is plain content, not a new collapsible section (spec §3's "no accordions nested inside accordions").
  - [x] `onLfoChange` fires with the currently-selected field and the `Lfo` control's new value.
  - [x] Both `useLfoTargetGroup` and `LfoTargetGroup` are exported from the module (so `AudioRigDrawer`, Task 3, can import the hook directly without going through this component).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/LfoTargetGroup.test.ts` passes — row count/targeted-class correctness, single shared `Lfo` display, `driftContent` placement, `onLfoChange` wiring, and (reusing Task 1's own coverage by composition, not re-testing the state machine from scratch) that clicking a row's `select` callback eventually re-renders with the new field targeted.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/LfoTargetGroup.tsx`, `src/components/ui/controls/LfoTargetGroup.css`, `src/components/ui/controls/LfoTargetGroup.test.tsx`

  **Estimated scope:** S (one component composing an existing hook + the existing `Lfo` primitive)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `useLfoTargetGroup`/`LfoTargetGroup` have no consumers yet and no dead-code lint warnings (both are exported, so this should already be clean).
- [x] Review with human before proceeding.

---

### Phase 2: Consumer sites (vertical slices — parallelizable once Phase 1 is done)

- [x] **Task 3: Global effects — `eq3`/`filterLPF`/`filterHPF` consolidated display**

  **Description:** In `audioRigConfig.ts`, remove `AudioRigParamSchema.lfoAccordion` and the now-dead `lfoAccordionSchema()` helper (all 7 call sites: `eq3.low/mid/high`, `filterLPF.frequency/Q`, `filterHPF.frequency/Q`); `LFO_DRIFT_GROUPS` itself is unchanged in shape. In `AudioRigDrawer.tsx`, for each `AUDIO_RIG_CONFIG` block: render every param's slider as a bare row (as today, minus the nested accordion); if the block has any `lfoTarget` params (true only for `eq3`/`filterLPF`/`filterHPF` — `delay`/`reverb`/`compressor`/`limiter` render nothing extra), render `useLfoTargetGroup({ groupId: \`audioRig.${block.key}\`, fields })` directly and wrap the existing rows with its `isTargeted`/`select` (via `onClick`/`onFocus`), then render one shared `Lfo` display below them using the hook's `displayValue`/`displayLabel`, then — looked up via `LFO_DRIFT_GROUPS.find(g => g.group === block.key)` — that block's own drift sliders directly beneath, still inside the same `AccordionContainer`. The standalone `LFO_DRIFT_GROUPS.map(...)` block at the bottom of the file keeps rendering **only** the `robots` entry (spec's explicit "leave it exactly where it is").

  **Acceptance criteria:**
  - [x] `eq3`, `filterLPF`, `filterHPF` each render exactly one shared LFO display inside their own `AccordionContainer` — not one per param, and not a nested accordion.
  - [x] Clicking, click-around, or keyboard-focusing any of Low/Mid/High's (or Frequency/Q's) rows updates which `globalLfo` entry the shared display edits, defaulting to the group's first param (Low, Frequency) on initial render.
  - [x] `eq3`/`filterLPF`/`filterHPF`'s own Rate Drift/Depth Drift sliders render inside that block's own accordion, directly below the shared display — the trailing standalone block now contains only the `robots` Drift accordion, not 4.
  - [x] `delay`, `reverb`, `compressor`, `limiter` are visually and behaviorally unchanged (no `LfoTargetGroup`/hook instance renders for them — none of their params carry `lfoTarget`).
  - [x] `AudioRigParamSchema` no longer has an `lfoAccordion` field anywhere in `audioRigConfig.ts`; `lfoAccordionSchema()` is deleted, not left unused.

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes — `audioRigConfig.test.ts`'s closed-shape assertions drop `lfoAccordion`; `AudioRigDrawer.test.tsx` covers per-block single-display rendering, target-switching updating the right `globalLfo` entry, drift-sliders-inside-the-block, and the trailing block containing only `robots`.
  - [x] `npm run build:types` clean — surfaces any remaining reference to the removed `lfoAccordion` field.
  - [x] `npm run lint` clean.
  - [x] Manual check: `npm run dev`, open the Audio Rig, expand 3-Band EQ — confirm Low/Mid/High render bare, one shared LFO display below labeled with whichever band was last clicked, EQ Drift sliders directly beneath that display inside the same accordion. Click each band and confirm the label/values update and the just-clicked row is visibly targeted. Repeat for Low-Pass/High-Pass Filter.

  **Dependencies:** Task 1 (uses the hook directly, not the wrapper component).

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`, `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.css`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** M (5 files, but a single repeated pattern applied to 3 near-identical blocks)

- [x] **Task 4: Robot Signature Array — 3 independent per-layer displays**

  **Description:** In `robotOptionsConfig.ts`, remove `SignatureArrayParamSchema.lfoAccordion` and its `lfoAccordionSchema()` helper (12 call sites: `gain`/`detune`/`phase`/`pulseWidth` × `layer0`/`layer1`/`layer2`). In `SignatureArrayDrawer.tsx`, for each layer block: keep `type`'s `RadioButton` rendered inline exactly as today (no LFO, stays grouped with the other sliders per spec §1.1/§3); render one `<LfoTargetGroup groupId={\`robotOptions.${block.key}\`} fields={...} renderField={...} />` covering that layer's LFO-tied params only (`gain`/`detune`/`phase`, plus `pulseWidth` only when `showPulseWidth`), each field's `lfoValue` resolved via the existing `value.lfoSettings?.[lfoTarget] ?? { ...DEFAULT_LFO_SETTINGS[lfoTarget], active: false }` fallback (unchanged logic, just relocated). This yields 3 separate `LfoTargetGroup` instances — Baseline, Coaxial, Harmonic — inside the one existing `SIGNATURE_ARRAY_ACCORDION_SCHEMA` accordion, never 1 shared across all 12 sliders.

  **Acceptance criteria:**
  - [x] Each of the 3 layers renders exactly one `LfoTargetGroup` (one shared display per layer, not per drawer and not per param).
  - [x] `type`'s `RadioButton` renders inline among the layer's other controls, not inside `LfoTargetGroup` and not separated elsewhere.
  - [x] Toggling a layer's `type` to `'pulse'` shows the Interval (`pulseWidth`) row in that layer's group; toggling away hides it — and if Interval was the targeted field when it disappears, that layer's group falls back to its first remaining field (Gain) without erroring (exercises Task 1's fallback effect end-to-end).
  - [x] Company-mode-shaped `value` (a partial `lfoSettings`, per `CompanyOptionsSection`'s usage) still resolves correctly — no change needed to `CompanyOptionsSection.tsx` itself.
  - [x] `SignatureArrayParamSchema` no longer has an `lfoAccordion` field; `lfoAccordionSchema()` is deleted.

  **Verification:**
  - [x] `npx vitest run src/data/robotOptionsConfig.test.ts src/components/robot/SignatureArrayDrawer.test.tsx` passes — config test drops `lfoAccordion` assertions; drawer test covers 3-independent-groups rendering, the pulse-type show/hide + fallback case, and unchanged company-mode value resolution.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: open a robot's Signature Array — confirm Baseline/Coaxial/Harmonic each show bare sliders + their own shared LFO display (3 total). Toggle Harmonic's type to `pulse` and back, confirming Interval appears/disappears cleanly and the shared display doesn't break. Repeat inside a Company's bulk-edit panel (Robots tab → select a company) to confirm identical behavior there with no `CompanyOptionsSection.tsx` changes.

  **Dependencies:** Task 2.

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`, `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.css`, `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** M (5 files, same repeated-pattern-×3 shape as Task 3)

- [x] **Task 5: Volume — single-field consolidated display**

  **Description:** In `robotOptionsConfig.ts`, remove the now-unused `VOLUME_LFO_ACCORDION_SCHEMA` export (Volume's `humanLabel`/`loreLabel` for the display comes from the existing `VOLUME_SCHEMA.humanLabel` instead — no new copy). In `AudioSettingSection.tsx`, replace the Volume row's `AccordionContainer`-wrapped `Lfo` with one `<LfoTargetGroup groupId="robotOptions.volume" fields={[{ field: 'volume', label: VOLUME_SCHEMA.humanLabel!, lfoValue: value.volumeLfo }]} onLfoChange={(_f, v) => onVolumeLfoChange(v)} renderField={() => <SliderLinear ... />} />` — same shape every other group uses, just with one field and nothing to click between yet.

  **Acceptance criteria:**
  - [x] Volume renders as a bare slider followed by its shared LFO display, with no `AccordionContainer` wrapping it anymore.
  - [x] The display's label reads "Volume" (from `VOLUME_SCHEMA.humanLabel`, not new copy).
  - [x] `onVolumeLfoChange` still fires correctly when the `Lfo` control's value changes.
  - [x] `VOLUME_LFO_ACCORDION_SCHEMA` is removed from `robotOptionsConfig.ts` and has no remaining references anywhere in the codebase.
  - [x] `CompanyOptionsSection.tsx` (the company-mode call site for `AudioSettingSection`) requires no change — its `onVolumeLfoChange` wiring is untouched.

  **Verification:**
  - [x] `npx vitest run src/data/robotOptionsConfig.test.ts src/components/robot/AudioSettingSection.test.tsx` passes — config test drops the `VOLUME_LFO_ACCORDION_SCHEMA` export assertion; section test covers the new bare-slider-plus-display shape and unchanged `onVolumeLfoChange` wiring.
  - [x] `npm run build:types` clean — surfaces any stale `VOLUME_LFO_ACCORDION_SCHEMA` import.
  - [x] `npm run lint` clean.
  - [x] Manual check: open Robot Options (or a Company's bulk-edit panel) — confirm Volume shows the same bare-slider-plus-display shape as EQ/Signature Array, just with nothing to click between.

  **Dependencies:** Task 2.

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`, `src/components/robot/AudioSettingSection.tsx`, `src/components/robot/AudioSettingSection.css`, `src/components/robot/AudioSettingSection.test.tsx`

  **Estimated scope:** S (smallest consumer slice — one field, one existing component)

### Checkpoint: All consumer sites converted
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] No remaining reference anywhere in `src/` to `lfoAccordion`, `lfoAccordionSchema`, or `VOLUME_LFO_ACCORDION_SCHEMA` (grep to confirm — every nested-per-slider accordion is gone).
- [x] Manual pass across all 5 group locations (EQ, LPF, HPF, and all 3 Signature Array layers on both a single robot and a company) confirms: one shared display per group, correct default field, click/focus targeting works, drift sliders sit inside EQ/LPF/HPF's own accordions, Volume matches the same shape.
- [x] Review with human before proceeding.

---

### Phase 3: Docs

- [x] **Task 6: `docs/COMPONENT_LIBRARY.md` — document `LfoTargetGroup`/`useLfoTargetGroup`**

  **Description:** Add a short section after the existing "Primitives" table introducing the new shared composition component: what it's for (one shared LFO display per group of LFO-tied sliders, replacing the old per-slider nested "Modulation" accordion pattern), why it isn't a 15th `ControlSchema` primitive (composes caller-rendered sliders + one `Lfo`, not a single schema-driven leaf control — no new `ControlSchema` variant was added), and that it ships as both a hook (`useLfoTargetGroup`, used directly by `AudioRigDrawer`) and a render-prop component (`LfoTargetGroup`, used by `SignatureArrayDrawer`/`AudioSettingSection`) — with a pointer to `docs/specs/LFO_CONSOLIDATED_DISPLAY.md` for the full design rationale.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents `LfoTargetGroup`/`useLfoTargetGroup`'s purpose, its hook-plus-component shape, and why it's outside the 14-primitive `ControlSchema` table.
  - [x] The doc links to `docs/specs/LFO_CONSOLIDATED_DISPLAY.md`.
  - [x] No claim in the new section is contradicted by the actual shipped source (spot-check against Tasks 1-2's final code).

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `LfoTargetGroup.tsx`/`useLfoTargetGroup.ts`.
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 3, Task 4, Task 5 (documents the final shipped shape across every consumer).

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 6 tasks are met.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped component.
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The deferred-until-`onComplete` update (Architecture Decisions, resolving spec §7 open question 2) reads as unresponsive once real animation duration is added later, since nothing visibly changes until the transition finishes | Low today (0-duration, imperceptible); becomes a real UX question only when animation work actually lands | Spec §7 item 2 already flags this for revisit at that later point — not a concern for this plan's own scope |
| `AudioRigDrawer.tsx`'s direct `useLfoTargetGroup` usage (Task 3) and `LfoTargetGroup`'s render-prop usage (Tasks 4-5) drift apart in behavior over time since they share the hook but not the wrapper's rendering | Medium — a future bug fix applied to `LfoTargetGroup.tsx`'s row/display markup could be missed in `AudioRigDrawer.tsx`'s parallel hand-rolled version | Task 1's hook owns all *behavior* (selection, transition, fallback); the two rendering call sites only differ in markup structure, not logic — keep it that way in review, don't let `AudioRigDrawer` reimplement any state logic itself |
| `pulseWidth`'s show/hide-triggering-fallback path (Task 4) is the one genuinely new edge case this feature introduces — nothing in the shipped app today changes a `fields` array's membership while a "selection" persists across it | Medium — easy to under-test since it depends on the interaction of two features (layer type radio + the new hook) | Task 1's own tests cover the hook's fallback behavior in isolation; Task 4's tests exercise it through the real `type` toggle, not just the hook in isolation — both are required, not either/or |
| ~~Passing `humanLabel: undefined` to `Lfo`'s schema during a transition (spec §7 item 3) relies on `DualLabel` already handling an absent label gracefully~~ | **Materialized during manual testing** — the label blanking in sync with the values read as a flicker, not the imperceptible transition intended. **Fixed:** `displayLabel` now always shows the still-committed field's name; only `displayValue` resets to `NEUTRAL_LFO_VALUE` while transitioning (`useLfoTargetGroup.ts`, `displayLabel`'s type tightened to `string`). | Resolved — no longer open. |

## Open Questions

Resolved during Plan (not left open):

- ~~`LfoTargetGroup`'s public API shape (hook vs. component vs. both)?~~ **Resolved: both — see Architecture Decisions.**
- ~~Optimistic vs. deferred-until-`onComplete` update?~~ **Resolved: deferred — see Architecture Decisions.**

Carried forward from spec §7, confirmed during manual testing post-implementation:

- ~~`Lfo`'s `disabled` prop during the transition (spec §7 item 4) — does `disabled || transitioning` read as "broken/greyed out"?~~ **Resolved: kept as-is.** The actual reported issue was the *label* blanking alongside the values (Risks table above), not the disabled state itself — fixed by keeping `displayLabel` visible through the transition; `disabled || transitioning` is unchanged.

Still open, not blocking this plan:

1. **Whether the deferred-update decision (selection commits only in `onComplete`) should become optimistic once real animation duration lands** — noted in Risks, not a concern for this plan's own scope.
