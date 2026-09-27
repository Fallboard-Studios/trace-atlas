# Implementation Plan: Wire `DirectionalPanel` into the Audio Rig and Robot Effects Drawers

Source spec: [docs/specs/DIRECTIONAL_PANEL_WIRING.md](../specs/DIRECTIONAL_PANEL_WIRING.md). Source intent: [docs/intent/directional-panel-wiring.md](../intent/directional-panel-wiring.md). Presentation-only regroup-and-relabel pass — no `AudioEngine`/`BeatClock`/Zustand-shape change, no new `ControlSchema` variant, no existing control's `value`/`onChange` contract changes. Every task below either adds schema data with no consumer yet, rewires one consumer to already-landed schema data, or does a small dead-export cleanup once every consumer of the old shape is gone.

## Overview

Regroup `AudioRigDrawer.tsx` (7 flat accordions → 4 accordions of nested `DirectionalPanel`s) and the per-robot audio drawers (`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`/`AudioSettingSection`, shared by `RobotOptionsTab` and `CompanyOptionsSection` — 3 flat accordions + one unwrapped section → 1 bare panel + 3 accordions of nested panels) into the structure confirmed in the intent doc, giving `DirectionalPanel` its first real consumers. Two independent tracks (Audio Rig, Robot Effects) landing in one combined pass per the confirmed intent — not split by side, but broken into small sequential/parallel tasks below for review and verification granularity.

## Architecture Decisions

- **Each config file's schema work is staged additive-first, consumer-rewire-second** — not a same-task rename, even though the spec (§4.1, §4.2) describes some changes as renames. A bare rename of a field/const a component still imports breaks the build the instant it lands; staging it as "add the new schema alongside the old one, then switch each consumer over, then delete the now-dead old schema" keeps every task's own checkpoint (`build:types`/`lint`/`test`/`build`) green in isolation. This is the same widen-then-narrow precedent `docs/tasks/VERTICAL_SLIDERS.md` used for its own required-field migration — applied here for a different reason (a live-consumer rename, not a required-field rollout) but the same mechanic.
- **Audio Rig's config cleanup rides along with its one consumer's task (Task 2), Robot Effects' does not (its own Task 9).** Audio Rig only has one consumer of `audioRigConfig.ts` (`AudioRigDrawer.tsx`), so removing the now-dead old fields in the same task that stops using them is safe and avoids an extra task. Robot Effects' `robotOptionsConfig.ts` has 3 independent consumers (`PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` — Tasks 6/7/8, deliberately parallelizable) that would otherwise all need to edit the same shared config file's dead-export cleanup concurrently — a real merge-conflict risk the skill flags explicitly ("must be sequential: shared state changes"). Deferring that cleanup to its own Task 9, after all 3 consumers have switched over, avoids the contention entirely.
- **`RobotDisplaySection`/`RobotOptionsTab`'s Output extraction (Task 5) touches no schema at all** — it only moves an existing component call and its already-existing value-construction code between two files. It has no dependency on any config task and can run fully in parallel with everything else.
- **`CompanyOptionsSection.tsx` gets a verification task, not an implementation task** (Task 10) — per spec §1.2/§2, it needs no JSX change; the task exists only to confirm that directly (spec's flagged open item #4), not to assume it.
- **Docs land last (Task 11)**, once every schema/consumer's final shipped shape is real and spot-checkable — same precedent `docs/tasks/DIRECTIONAL_PANEL.md`'s own Task 3 and `docs/tasks/VERTICAL_SLIDERS.md`'s Task 8 both used.

## Dependency Graph

```
Task 1 (audioRigConfig.ts — additive)                Task 3 (robotOptionsConfig.ts — additive)
    │                                                      │        │        │
    └──→ Task 2 (AudioRigDrawer.tsx + config cleanup)      │        │        │
              │                                            ▼        ▼        ▼
              ▼                                         Task 4   Task 6   Task 7   Task 8
       Checkpoint: Audio Rig complete                  (AudioSettingSection) (PingControlsDrawer) (PingContourDrawer) (SignatureArrayDrawer)
                                                            │        │        │        │
                                                            └────────┴───┬────┴────────┘
                                                                         ▼
                                                              Task 9 (robotOptionsConfig.ts cleanup)
                                                                         │
                                                                         ▼
                                                          Checkpoint: Robot Effects complete
                                                                         │
                                        Task 5 (RobotDisplaySection/RobotOptionsTab — no dependency) ──┐
                                                                         │                              │
                                                                         ▼                              ▼
                                                              Task 10 (CompanyOptionsSection verify, dep: 4,5,6,7,8)
                                                                         │
                                                                         ▼
                                                          Task 11 (docs/COMPONENT_LIBRARY.md)
                                                                         │
                                                                         ▼
                                                                 Checkpoint: Complete
```

Task 5 has no dependency on anything — it can be done first, last, or in parallel with any other task. Tasks 4, 6, 7, 8 depend only on Task 3 and are mutually independent (disjoint files) — safe to parallelize across sessions/agents. The Audio Rig track (1-2) and the Robot Effects track (3-9) are fully independent of each other and can be done in either order or in parallel.

## Task List

### Phase 1: Audio Rig

- [ ] **Task 1: `audioRigConfig.ts` — additive schema work**

  **Description:** Add, without removing or renaming anything yet: a new, more general `accordionSchema(id: string, loreLabel, humanLabel): AccordionSchema` helper (loosened from the current `key: AudioRigEffectKey`-typed one — the 4 new top-level accordions aren't `AudioRigEffectKey`s); a new `panelSchema(key, loreLabel, humanLabel, orientation): DirectionalPanelSchema` helper; a new `panel: DirectionalPanelSchema` field on each `AudioRigEffectBlock` in `AUDIO_RIG_CONFIG` (built via `panelSchema()`, same `loreLabel`/`humanLabel` text as that block's existing `accordion` field — verbatim, `eq3` gets `orientation: 'row'`, every other block `'column'`) — alongside the existing `accordion` field, not replacing it yet; a new `panel: DirectionalPanelSchema` field on `LfoDriftGroupSchema` (via `driftGroupSchema()`, same text as its existing `accordion` field, `orientation: 'column'`) alongside the existing `accordion` field; a new `AUDIO_RIG_ACCORDION_GROUPS: { accordion: AccordionSchema; blockKeys: AudioRigEffectKey[] }[]` (3 entries: EQ & Filters → `['eq3','filterLPF','filterHPF']`, Time & Space → `['delay','reverb']`, Output → `['compressor','limiter']`, each with an invented `loreLabel`); a new `TRANSPORT_COMPOSITION_ACCORDION_SCHEMA: AccordionSchema` (invented lore); a new `SPEED_AUTOMATION_PANEL_SCHEMA: DirectionalPanelSchema` (`orientation: 'column'`, invented lore). Nothing in `AudioRigDrawer.tsx` changes yet, so this task is purely additive — the drawer keeps rendering exactly as it does today off the untouched `accordion` fields.

  **Acceptance criteria:**
  - [ ] Every new export listed above exists with the exact type shape spec §4.1 describes.
  - [ ] Every `panel` field's `loreLabel`/`humanLabel` is byte-identical to its sibling `accordion` field's text (verbatim preservation) — `eq3`'s panel is the only one with `orientation: 'row'`.
  - [ ] `AudioRigEffectBlock.accordion` and `LfoDriftGroupSchema.accordion` still exist, untouched — nothing is removed this task.
  - [ ] `AudioRigDrawer.tsx` is not modified.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts` passes (new assertions added for every new export's shape and verbatim-label match).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] `npm run build` clean — confirms the additive change alone doesn't break the drawer that still reads the old fields.

  **Dependencies:** None.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** M (2 files, several new exports — additive only, no existing behavior touched)

- [ ] **Task 2: `AudioRigDrawer.tsx` render rewrite + `audioRigConfig.ts` cleanup**

  **Description:** Rewrite `AudioRigDrawer.tsx`'s render per spec §1.4: replace the flat `AUDIO_RIG_CONFIG.map(...)` top-level loop, the standalone `'robots'`-drift `AccordionContainer` loop, and the two bare `master-row` sliders with the new structure — a `TRANSPORT_COMPOSITION_ACCORDION_SCHEMA` `AccordionContainer` containing 2 `DirectionalPanel`s (`SPEED_AUTOMATION_PANEL_SCHEMA` wrapping the Automatic Effects + Tempo sliders, and the `'robots'` drift group's `.panel` wrapping its rate/depth sliders), followed by `AUDIO_RIG_ACCORDION_GROUPS.map(...)`, each rendering an `AccordionContainer` around its `blockKeys`' blocks, each block now wrapped in `<DirectionalPanel schema={block.panel}>` instead of `<AccordionContainer schema={block.accordion}>` (the existing `AudioRigLfoGroup`-or-plain-params-map body, plus the compressor-only Decay Mode radio, is otherwise untouched — wrap around it, don't rewrite it). Keep the existing `audio-rig-drawer__effect-block` bordered-box wrapper `<div>` around each block's panel (spec §4.3 — inferred visual continuity, flag for the manual check). Then, now that nothing reads them, remove `AudioRigEffectBlock.accordion` and `LfoDriftGroupSchema.accordion` from `audioRigConfig.ts`, and remove the now-superseded narrow `accordionSchema(key: AudioRigEffectKey, ...)` overload if Task 1 left one behind (only the general `(id: string, ...)` version should remain).

  **Acceptance criteria:**
  - [ ] The 4 new top-level accordions render in order: Transport & Composition, EQ & Filters, Time & Space, Output.
  - [ ] 3-Band EQ renders as a `row` `DirectionalPanel` (Low/Mid/High side by side); every other block renders as a `column` panel.
  - [ ] Automatic Effects and Tempo render inside Transport & Composition's Speed & Automation panel — no longer bare, no longer outside any accordion.
  - [ ] Robot Drift renders inside Transport & Composition as a panel — no longer its own standalone `AccordionContainer`.
  - [ ] EQ/LPF/HPF's own shared LFO display and per-band drift sliders still render inside their own panel, unchanged in behavior.
  - [ ] The Decay Mode radio still renders inside the Compressor panel, below its sliders.
  - [ ] `AudioRigLfoGroup`'s click/focus-to-select-for-LFO targeting still works identically (manual check).
  - [ ] `AudioRigEffectBlock.accordion` / `LfoDriftGroupSchema.accordion` no longer exist anywhere in `audioRigConfig.ts` or its test.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx src/data/audioRigConfig.test.ts` passes — old "bare control, outside any accordion" and "standalone Drift accordion" assertions rewritten to match the new nesting (spec §5).
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
  - [ ] Manual check: open the Audio Rig drawer in the running app (`npm run dev`). Confirm the 4-accordion structure, EQ's row layout doesn't overflow, and every control still edits the same live value it did before (spot-check a couple of sliders against `audioStore`).

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.css`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** L (5 files — at the guideline ceiling; not split further because the render rewrite and the config cleanup it enables are one coupled change with one meaningful verification pass)

### Checkpoint: Audio Rig complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check of `AudioRigDrawer` in the running app confirms the full §1's Audio Rig table.
- [ ] Review with human before proceeding.

---

### Phase 2: Robot Effects — foundation

- [ ] **Task 3: `robotOptionsConfig.ts` — additive schema work**

  **Description:** Following this file's own literal-const style (not `audioRigConfig.ts`'s helper style — spec §4.2), add: `ROBOT_OUTPUT_PANEL_SCHEMA: DirectionalPanelSchema` (`orientation: 'column'`, invented lore, `humanLabel: 'Output'`); `MELODY_ACCORDION_SCHEMA`, `ENVELOPE_ACCORDION_SCHEMA`, `SOURCE_ACCORDION_SCHEMA` (`AccordionSchema`, invented lore); `PHRASING_PANEL_SCHEMA`, `FREQUENCY_PANEL_SCHEMA` (`DirectionalPanelSchema`, `orientation: 'column'`, invented lore — new labels, not derived from `PING_CONTROLS_ACCORDION_SCHEMA`); `PING_CONTOUR_PANEL_SCHEMA: DirectionalPanelSchema` (same `loreLabel`/`humanLabel` text as the existing `PING_CONTOUR_ACCORDION_SCHEMA`, verbatim, `orientation: 'column'`) as a **new** const, added alongside the existing `PING_CONTOUR_ACCORDION_SCHEMA` (not replacing it yet — Task 7 switches the one consumer over, Task 9 removes the old one). Add a `panel: DirectionalPanelSchema` field to `SignatureArrayLayerBlock`, built inline in `makeLayerBlock()` from its existing `key`/`humanLabel`/`loreLabel` params (`orientation: 'column'`). `PING_CONTROLS_ACCORDION_SCHEMA` and `SIGNATURE_ARRAY_ACCORDION_SCHEMA` are untouched this task (still present, still exported) — nothing consumes the new exports yet.

  **Acceptance criteria:**
  - [ ] Every new export listed above exists with the exact type shape spec §4.2 describes.
  - [ ] `PING_CONTOUR_PANEL_SCHEMA`'s `loreLabel`/`humanLabel` is byte-identical to `PING_CONTOUR_ACCORDION_SCHEMA`'s (verbatim preservation).
  - [ ] `SIGNATURE_ARRAY_CONFIG[i].panel.humanLabel`/`.loreLabel` matches that layer's existing `humanLabel`/`loreLabel` exactly for all 3 layers.
  - [ ] `PING_CONTROLS_ACCORDION_SCHEMA`, `PING_CONTOUR_ACCORDION_SCHEMA`, `SIGNATURE_ARRAY_ACCORDION_SCHEMA` all still exist, untouched.
  - [ ] No component file is modified this task.

  **Verification:**
  - [ ] `npx vitest run src/data/robotOptionsConfig.test.ts` passes (new assertions for every new export's shape and verbatim-label match).
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean — confirms the additive change alone doesn't break any of the 3 drawers still reading the old fields.

  **Dependencies:** None.

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`

  **Estimated scope:** M (2 files, several new exports — additive only)

### Checkpoint: Robot Effects foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Review with human before proceeding — Tasks 4-8 below can be parallelized across sessions once this lands.

---

### Phase 3: Robot Effects — consumers (parallelizable)

- [ ] **Task 4: `AudioSettingSection.tsx` — self-wrap in `DirectionalPanel`**

  **Description:** Wrap `AudioSettingSection`'s existing return value in `<DirectionalPanel schema={ROBOT_OUTPUT_PANEL_SCHEMA}>`, matching the "component wraps itself" precedent every other robot drawer already follows. No prop, no internal logic, no handler changes.

  **Acceptance criteria:**
  - [ ] `AudioSettingSection` renders a `DirectionalPanel` (`sc-directional-panel`, `data-orientation="column"`) around its existing Audio Setting radio + Volume `LfoTargetGroup` content.
  - [ ] `AudioSettingSectionProps` is unchanged — no new prop.
  - [ ] Every existing behavior (LFO wiring, disabled state) is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx` passes (new assertion for the panel wrapper).
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/robot/AudioSettingSection.tsx`, `src/components/robot/AudioSettingSection.css`, `src/components/robot/AudioSettingSection.test.tsx`

  **Estimated scope:** S (3 files, one self-contained wrap)

- [ ] **Task 5: Extract `AudioSettingSection` out of `RobotDisplaySection`**

  **Description:** Per spec §1.3: trim `RobotDisplaySection.tsx` down to the avatar + 4 read-only `DualLabel` rows + company `Select` — remove its `AudioSettingSection` import, `audioSettingValue` construction, `applyAudioMode`/`applyVolume`/`applyVolumeLfo`/`VOLUME_LFO_TARGET`/`DEFAULT_LFO_SETTINGS`/`LfoValue` imports, and the `<AudioSettingSection>` JSX. Move that `audioSettingValue` construction (verbatim) into `RobotOptionsTab.tsx`, and render `<AudioSettingSection value={audioSettingValue} onAudioModeChange={...} onVolumeChange={...} onVolumeLfoChange={...} />` there directly after `<RobotDisplaySection robot={robot} />` and before `<PingControlsDrawer ... />`. This task touches no schema and has no dependency on Tasks 3/4 — `AudioSettingSection`'s own internals are a black box to this task, only *which component renders it* changes.

  **Acceptance criteria:**
  - [ ] `RobotDisplaySection` no longer imports or renders `AudioSettingSection`.
  - [ ] `RobotOptionsTab` renders `AudioSettingSection` as a direct sibling between `RobotDisplaySection` and `PingControlsDrawer`, with the exact same derived value/handlers `RobotDisplaySection` used to wire.
  - [ ] `CompanyOptionsSection.tsx` is not touched (it never used `RobotDisplaySection`).
  - [ ] No behavior change — Audio Setting/Volume edit the same robot fields through the same `robotOptionsActions` calls as before.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/RobotDisplaySection.test.tsx src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check: open Robot Options for a single robot (`npm run dev`), confirm Audio Setting/Volume still visibly render and still edit the robot, now positioned below the meta-data card rather than inside it.

  **Dependencies:** None (parallelizable with Tasks 1-4, 6-8).

  **Files:** `src/components/robot/RobotDisplaySection.tsx`, `src/components/robot/RobotDisplaySection.css`, `src/components/robot/RobotDisplaySection.test.tsx`, `src/components/panels/screen/console/RobotOptionsTab.tsx`, `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** M (5 files, but each edit is a straightforward move — no new logic)

- [ ] **Task 6: `PingControlsDrawer.tsx` — Melody accordion, Phrasing/Frequency panels**

  **Description:** Per spec §1.2: change the component's internal wrapper from one `AccordionContainer` (`PING_CONTROLS_ACCORDION_SCHEMA`) around 8 flat controls to one `AccordionContainer` (`MELODY_ACCORDION_SCHEMA`) around 2 `DirectionalPanel`s — `PHRASING_PANEL_SCHEMA` wrapping Density, Motif Length, Pitch Repeat, the dev-only Click Track toggle, and the Reset Melody button; `FREQUENCY_PANEL_SCHEMA` wrapping Octave Min, Octave Max, Note Variance. `PingControlsDrawerProps` and every handler/disabled-state computation are unchanged — this is a render-shape-only change.

  **Acceptance criteria:**
  - [ ] Melody is the outer accordion; Phrasing and Frequency render as its 2 child panels, in that order.
  - [ ] Click Track and Reset Melody render inside Phrasing, not Frequency.
  - [ ] `pitchRepeatDisabled`/`generationDisabled` gating behavior is unchanged (still disables the same controls under the same conditions).
  - [ ] `PingControlsDrawerProps` is unchanged — no caller (`RobotOptionsTab`, `CompanyOptionsSection`) needs any edit.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` passes (new nesting assertions; existing disabled-state/behavior assertions still pass unmodified).
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingControlsDrawer.css`, `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** M (3 files, moderate JSX restructuring, no logic change)

- [ ] **Task 7: `PingContourDrawer.tsx` — Envelope accordion, Ping Contour panel**

  **Description:** Change the component's internal wrapper from `AccordionContainer` (`PING_CONTOUR_ACCORDION_SCHEMA`) directly around its 4 sliders to `AccordionContainer` (`ENVELOPE_ACCORDION_SCHEMA`) around one `DirectionalPanel` (`PING_CONTOUR_PANEL_SCHEMA`) wrapping the same 4 sliders. `PingContourDrawerProps` and every handler are unchanged.

  **Acceptance criteria:**
  - [ ] Envelope is the outer accordion; Ping Contour renders as its single child panel, keeping its original label text.
  - [ ] Attack/Decay/Sustain/Release behavior (including Sustain's 0-1 ↔ 0-100% conversion) is unchanged.
  - [ ] `PingContourDrawerProps` is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingContourDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/robot/PingContourDrawer.tsx`, `src/components/robot/PingContourDrawer.css`, `src/components/robot/PingContourDrawer.test.tsx`

  **Estimated scope:** S (3 files, small/mechanical restructuring)

- [ ] **Task 8: `SignatureArrayDrawer.tsx` — Source accordion, 3 layer panels**

  **Description:** Change the component's internal wrapper from `AccordionContainer` (`SIGNATURE_ARRAY_ACCORDION_SCHEMA`) around 3 unlabeled layer `<div>`s to `AccordionContainer` (`SOURCE_ACCORDION_SCHEMA`) around 3 `DirectionalPanel`s, one per layer (`SIGNATURE_ARRAY_CONFIG[i].panel`), each wrapping — not replacing — the existing `signature-array-drawer__layer` `data-layer-key` `<div>` per spec §1.5 (`DirectionalPanel` has no prop passthrough, so `data-layer-key` must stay on the inner div). `SignatureArrayDrawerProps` and every handler are unchanged.

  **Acceptance criteria:**
  - [ ] Source is the outer accordion; Baseline, Coaxial, Harmonic render as its 3 child panels, in that order, each labeled from that layer's own `humanLabel`/`loreLabel`.
  - [ ] Each layer's existing `data-layer-key` div still exists, nested inside its `DirectionalPanel`, with its `RadioButton` + `LfoTargetGroup` content unchanged.
  - [ ] Interval (pulseWidth) still renders conditionally (only when that layer's Type is "Burst"), inside its layer's panel.
  - [ ] `SignatureArrayDrawerProps` is unchanged; `LfoTargetGroup`'s click/focus targeting still works identically inside the new panel (manual check).

  **Verification:**
  - [ ] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.css`, `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** M (3 files, the most involved of the 3 leaf rewrites — 3 repeated panels + the wrap-around-not-replace constraint)

---

### Phase 4: Robot Effects — cleanup

- [ ] **Task 9: `robotOptionsConfig.ts` cleanup**

  **Description:** Now that Tasks 6/7/8 have switched their consumers over, remove the now-fully-dead `PING_CONTROLS_ACCORDION_SCHEMA`, `PING_CONTOUR_ACCORDION_SCHEMA`, and `SIGNATURE_ARRAY_ACCORDION_SCHEMA` exports from `robotOptionsConfig.ts`, and their corresponding assertions from `robotOptionsConfig.test.ts`.

  **Acceptance criteria:**
  - [ ] None of the 3 old accordion-shaped consts exist anywhere in `robotOptionsConfig.ts` or are referenced anywhere in `src/`.
  - [ ] `PHRASING_PANEL_SCHEMA`/`FREQUENCY_PANEL_SCHEMA`/`PING_CONTOUR_PANEL_SCHEMA`/`SOURCE_ACCORDION_SCHEMA`/`MELODY_ACCORDION_SCHEMA`/`ENVELOPE_ACCORDION_SCHEMA`/`ROBOT_OUTPUT_PANEL_SCHEMA` remain, unchanged, still in use.

  **Verification:**
  - [ ] `npx vitest run src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm run build:types` clean (confirms nothing still imports a removed const).
  - [ ] `npm run lint`, `npm test`, `npm run build` clean.

  **Dependencies:** Tasks 3, 6, 7, 8.

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`

  **Estimated scope:** XS (2 files, deletion only)

### Checkpoint: Robot Effects complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check of Robot Options (single-robot detail page) in the running app confirms the full §1 Robot Effects table.
- [ ] Review with human before proceeding.

---

### Phase 5: Verification & docs

- [ ] **Task 10: `CompanyOptionsSection.test.tsx` verification**

  **Description:** Per spec's flagged open item #4: directly check whether any assertion in `CompanyOptionsSection.test.tsx` reaches into a child component's internal DOM shape (accordion vs. panel structure) rather than only asserting values/callbacks. If any do, update them to match the new nesting; if the file only asserts the established value/callback pattern (per its own doc comment), no change is needed — this task's job is to confirm that, not assume it.

  **Acceptance criteria:**
  - [ ] Every assertion in `CompanyOptionsSection.test.tsx` is confirmed compatible with (or updated for) the new nested structure inside `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`.
  - [ ] `CompanyOptionsSection.tsx` itself remains unmodified (spec §1.2/§2 — if this task finds itself editing that file's JSX, stop and re-check against the spec).

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
  - [ ] Manual check: open the company/"All" broadcast panel (`npm run dev`), confirm the same Output/Melody/Envelope/Source structure renders and broadcasts edits identically to the single-robot case.

  **Dependencies:** Tasks 4, 5, 6, 7, 8.

  **Files:** `src/components/company/CompanyOptionsSection.test.tsx` (likely no source change; `CompanyOptionsSection.tsx` itself only if the check above surfaces a real gap — flag to human before editing it if so, since the spec asserts it needs none)

  **Estimated scope:** XS (verification task, 0-1 files)

- [ ] **Task 11: `docs/COMPONENT_LIBRARY.md` update**

  **Description:** Add a short note to the existing "Panel orientation (`PanelOrientation`)" subsection: `DirectionalPanel` now has real consumers (the Audio Rig drawer and the Robot Effects drawers), pointing at `docs/specs/DIRECTIONAL_PANEL_WIRING.md`. No contract change to document — neither `DirectionalPanel` nor `AccordionContainer`'s props changed.

  **Acceptance criteria:**
  - [ ] The "Panel orientation" subsection notes `DirectionalPanel` has shipped consumers and links to this spec.
  - [ ] No other claim in `COMPONENT_LIBRARY.md` is contradicted by the actual shipped source (spot-check against Tasks 1-10's final code).

  **Verification:**
  - [ ] Manual review — spot-check the new note against the shipped `AudioRigDrawer.tsx`/`PingControlsDrawer.tsx`/`PingContourDrawer.tsx`/`SignatureArrayDrawer.tsx`/`AudioSettingSection.tsx`.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Tasks 1-10 (docs describe the finished shape).

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 11 tasks are met.
- [ ] Both manual checks (Audio Rig, Robot Effects — single-robot and company/All) confirmed against §1's full tables.
- [ ] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A "rename" described in the spec (§4.1, §4.2) is staged additive-then-cleanup across 2-3 tasks instead of landing atomically — an implementer skimming only the spec (not this plan) might try to do it in one step and break an intermediate checkpoint | Low — this doc's Architecture Decisions section explains why, and each task's own acceptance criteria say explicitly what must/must not exist yet | Follow this task list's staging, not a literal one-shot reading of the spec's §4 prose; the spec's end-state is still the target, only the path there is staged |
| The `.audio-rig-drawer__effect-block` bordered-box nesting depth (spec §4.3, §7 item 1) is an inferred visual detail, not confirmed pixel-for-pixel | Low — cosmetic only, doesn't affect correctness | Flagged in Task 2's acceptance criteria and the Audio Rig checkpoint's manual check; easy to adjust after visual review |
| 9 new `loreLabel`s (spec §7 item 2) are first-pass invented copy | Low — cosmetic only | Flagged in Tasks 1, 3, 11; confirm during each phase's manual check, same precedent `LFO_DRIFT_GROUPS`' own labels already set |
| Tasks 4, 6, 7, 8 running truly in parallel (different sessions/agents) could still collide if any of them turns out to need a `robotOptionsConfig.ts` edit beyond what Task 3 already added | Medium if it happens, but scoped out by design | Task 3's acceptance criteria are written to cover everything Tasks 4/6/7/8 need to import — if one of them discovers a gap, add the missing export to Task 3's scope (or a small follow-up) rather than editing `robotOptionsConfig.ts` directly from within a "parallel" task |
| `CompanyOptionsSection.test.tsx` (Task 10) surfaces a real DOM-shape assertion that needs more than a test update — i.e. the spec's "no JSX change" claim (§1.2) turns out wrong for some edge case | Medium for that one task, zero impact on Tasks 1-9 | Task 10 is explicitly scoped to *find out*, not assume; if it finds a real gap, flag to human before editing `CompanyOptionsSection.tsx`'s source, per its own acceptance criteria |

## Open Questions

Resolved during Plan (not left open):

- ~~Can the spec's "rename" language be followed literally, one field/const at a time, without breaking intermediate builds?~~ **Resolved: no — staged additive-then-cleanup instead, see Architecture Decisions.** Every task's own checkpoint stays green.
- ~~Do Tasks 4/6/7/8 need to be sequential to avoid touching `robotOptionsConfig.ts` concurrently?~~ **Resolved: no — the config cleanup that would've caused contention is deferred to its own Task 9, after all 4 consumer tasks land.**
- ~~Does Task 5 (Output extraction) depend on Task 3/4?~~ **Resolved: no — it touches no schema, only moves an existing component call between 2 files. Fully independent.**

Carried forward from spec §7, not blocking this plan:

1. The `.audio-rig-drawer__effect-block` visual-nesting inference and the 9 invented `loreLabel`s (spec §7 items 1-2) are both flagged for the manual-check steps in Tasks 2, 3, 11 and the two phase checkpoints — not resolved in advance, confirmed by eye once real.
2. The dormant `'auto'`-slider/`ResizeObserver` risk (spec §7 item 3) stays dormant under this plan (nothing here uses `row` except EQ, which is schema-fixed `'vertical'`, not `'auto'`) — re-flag if a future task changes any panel's orientation to `row`.
