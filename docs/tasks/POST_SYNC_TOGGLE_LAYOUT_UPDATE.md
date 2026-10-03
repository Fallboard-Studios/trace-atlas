# Implementation Plan: Post-Sync-Toggle Layout Update

Source spec: [docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md](../specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md) (Crawford's checklist is its §0). Branch `layout/post-sync-toggle`, cut from `feature/sync-toggle` at 1366fe39; rebase onto `main` once Free | Sync merges. Roadmap slot: Phase 34 (added in Task 11).

> Process note: `planning-and-task-breakdown` asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house rhythm: RED test first, one commit per task, mutation check at the named gates, stop and report at every checkpoint.

> Spec assumptions 1–3 (responsive pairs; the row inside `LfoLink`; probe Lane | Depth rows full-width) were put to Crawford and he moved on to planning without amending them, so this plan treats them as confirmed. If one turns out wrong, the tasks it changes are named in Open Questions.

## Overview

A pure layout pass, no behaviour change: nineteen sliders turn horizontal, eight control pairs move onto shared `'responsive'` rows (nested `DirectionalPanel`s, the Compressor's own shape), `LfoLink` lays Lane and Depth side by side, Retransmit goes left, and a session's timestamp joins its title. Eleven tasks in seven phases: the one shared primitive change first (`LfoLink`, Task 1), then one vertical slice per screen area — EQ & Filters (2), Time & Space (3–4), the LFO Bank lane (5–6), Probes (7–8), Settings (9–10) — each leaving the app working and its own tests re-pinned, then docs (11). Every task's commit replaces the layout tests it invalidates in the same commit; no behaviour test changes anywhere.

## Architecture Decisions

- **`LfoLink` lands first and alone** (Task 1). It is the only shared primitive touched, both of its consumers are in scope, and the EQ/filter and probe slices can't be judged until Lane | Depth is a row. On desktop the interim (a row of Lane | Depth under a still-vertical slider) is odd for one commit; acceptable because nothing is checkpointed until Task 2.
- **Orientation is a config fact, pinned in config tests** (Tasks 2, 7). Components stop forwarding `verticalHeight` only because no schema carries it any more; the slider primitives and their vertical mode are untouched (spec assumption 13).
- **Nested rows are `DirectionalPanel`s with `'responsive'`**, declared as schema constants where the Compressor's are (module scope in `AudioRigDrawer.tsx`) or on the per-lane / per-layer schema object when the id needs the key (spec assumption 4). Never a bespoke flex div with its own breakpoint.
- **Vertical slices per screen area**, so every checkpoint is one screen Crawford can look at whole: EQ & Filters (A), Params + Time & Space (B), Probes (C), Settings + final (D).
- **Test tier mocking copies the sibling pattern.** Fifteen test files already carry their own local `stubMatchMedia({ mobile, tablet })` (e.g. `AudioRigEffectPanel.test.tsx` line 67); a new test that needs the tier copies that helper. Hoisting it into `src/testUtils/` is a separate cleanup, not this phase.
- **Layout tests are structural + CSS-scan; the look is manual.** jsdom can't measure, so tests pin DOM order, nesting, `data-orientation` under mocked tiers and Radix `aria-orientation`; the CSS rules are pinned by source scans (`tempoSyncSliderLayout.test.ts` precedent); real-pixel checks are the checkpoints' job in Chrome at ~360 / ~800 / ≥1024 px.

## Dependency Graph

```
Task 1 (LfoLink row)
   ├─→ Task 2 (EQ & Filters: config flip + column blocks)        ── Checkpoint A ──
   └─→ Task 8 (probe layer rows)                     ← Task 7 (probe config)
Task 3 (Delay top row)        none
Task 4 (Reverb top row)       none
Task 5 (lane row schemas) ─→ Task 6 (lane panel rows)            ── Checkpoint B (after 3–6) ──
Task 7 (probe config) ─→ Task 8                                  ── Checkpoint C ──
Task 9 (Seeds)                none
Task 10 (Save & Share)        none
Task 11 (docs, roadmap)       ← all                              ── Checkpoint D (final) ──
```

Parallelisable: 1 ‖ 3 ‖ 4 ‖ 5 ‖ 7 ‖ 9 ‖ 10; 2 and 8 wait on 1. Phases are ordered so each checkpoint is one screen.

## Task List

### Phase 1: The shared primitive

- [x] **Task 1: `LfoLink` lays Lane | Depth side by side on desktop**

  **Description:** Spec §1.5. `LfoLink.tsx` reads `useResponsivePanelOrientation()` and sets `data-orientation` on `.sc-lfo-link`. `LfoLink.css` gains the row rule: `.sc-lfo-link[data-orientation='row'] { flex-direction: row; align-items: flex-start; }` and `.sc-lfo-link[data-orientation='row'] > * { flex: 1 1 0; min-width: 0; }` (DirectionalPanel.css's row rule restated — equal halves, and it overrides `RadioButton`'s `width: 100%`). Column stays the default. Handlers, memo, `heldOff`, active class and the first-child `DualLabel` are untouched. New `LfoLink.css.test.ts` scans the stylesheet.

  **Acceptance criteria:**
  - [x] `data-orientation` is `row` with the tier stubbed to desktop and `column` on mobile and on tablet; the Lane radio precedes the Depth slider in DOM order in both.
  - [x] CSS scan: the row rule sets `flex-direction: row` on the root and `flex: 1 1 0` + `min-width: 0` on its children; the base `.sc-lfo-link` rule still says `flex-direction: column` and keeps its `sc-control` container.
  - [x] Every existing `LfoLink.test.tsx` case (lane/depth onChange, heldOff, disabled, memo, no-literal) unchanged and green.

  **As built:** RED first (7 component cases + 2 of 4 scan cases failing), then GREEN with one hook read and two CSS rules. Edge cases beyond the plan: no `matchMedia` at all resolves to `row` (the tier hook's desktop default, which is also why the fourteen pre-existing unstubbed tests needed no change); a live tier change flips the attribute without a remount (the stub's `fireChange`, the `useResponsivePanelOrientation.test.ts` shape, copied locally with the correct `639px` mobile query — note `AudioRigEffectPanel.test.tsx`'s own copy checks `640px`, which never matches, so it only distinguishes "both true" from "both false"); `heldOff` display is unaffected by the orientation. The DOM-order test anchors on the Off radio: `RadioButton` exposes no `radiogroup` role. **Mutation check run:** dropping `min-width: 0` turned exactly the children-rule scan red. Both consumers (`AudioRigEffectPanel.test.tsx`, `SignatureArrayDrawer.test.tsx`) green unchanged — the hook is `useSyncExternalStore` over the shared tier, so no re-render tests moved.

  **Verification:** `npx vitest run src/components/ui/controls/LfoLink.test.tsx src/components/ui/controls/LfoLink.css.test.ts` (RED first); `npm run lint`, `npm run build:types`. **Mutation check:** drop `min-width: 0` from the row rule and watch the scan go red.
  **Dependencies:** None. **Files:** `LfoLink.tsx`, `LfoLink.css`, `LfoLink.test.tsx`, `LfoLink.css.test.ts` (new). **Scope:** S.

### Phase 2: EQ & Filters slice

- [x] **Task 2: EQ and filter sliders go horizontal; their blocks become columns**

  **Description:** Spec §1.2. In `audioRigConfig.ts`: `eq3.low/mid/high`, `filterLPF.frequency/Q`, `filterHPF.frequency/Q` → `orientation: 'horizontal'`, `verticalHeight` removed; `panelSchema('eq3' | 'filterLPF' | 'filterHPF', …, 'column')`. In `AudioRigDrawer.tsx`, `renderParamControl` stops forwarding `verticalHeight` (no schema carries it). The generic branch is otherwise untouched: each param-row already renders the slider then its `LfoLink`.

  **Acceptance criteria:**
  - [x] `audioRigConfig.test.ts`: the "3-Band EQ is vertical" / "LPF/HPF is vertical" cases become horizontal; the verticalHeight-budget cases become "declares no verticalHeight"; the panel-orientation case says every block panel is `'column'`.
  - [x] `AudioRigEffectPanel.test.tsx`: eq3/filterLPF/filterHPF panels are column-orientation; each band/param row holds a slider with `aria-orientation="horizontal"` followed by its `LfoLink`; inside that `LfoLink` the Lane radio precedes the Depth slider.
  - [x] Every LfoLink-wiring, held-off, swell-isolation and re-render test in both files unchanged and green.

  **As built:** RED first (8 cases: the two orientation flips, the two no-verticalHeight cases, a new whole-config "nothing vertical, no verticalHeight anywhere" pin, the config panel-orientation case, the component column case and the `aria-orientation="horizontal"` case), then GREEN with seven schema lines, three `panelSchema(..., 'column')` calls and three dropped `verticalHeight` forwards in `renderParamControl`. Two of the three new component pins (direct param-rows in config order with no nested panel; slider-then-LfoLink with Lane before Depth) were already true of the old structure and passed on first run — they are regression guards for the shape §1.2 relies on, not proof of the change; the RED set above is. The `AudioRigEffectKey` type import became unused in the config test and was removed. Both files green (95 + 91); lint and types clean.

  **Verification:** `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` (RED first); `npm run lint`, `npm run build:types`.
  **Dependencies:** 1. **Files:** `audioRigConfig.ts`, `audioRigConfig.test.ts`, `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`. **Scope:** M.

### Checkpoint A: EQ & Filters
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] Manual (Crawford, Chrome at ~360 / ~800 / ≥1024 px): EQ reads as three stacked bands, each a horizontal slider over a Lane | Depth row (side by side on desktop, stacked below); LPF/HPF the same with two rows; Lane's five boxes wrap cleanly in their half; no slider under its 3-box floor.
- [ ] Review with Crawford before proceeding.

---

### Phase 3: Time & Space slice

- [x] **Task 3: Delay — Delay Time (over Tempo Sync) beside Repeats, Delay Amount alone**

  **Description:** Spec §1.3. Module-scope `DELAY_TOP_ROW_SCHEMA` (`audioRig.delay.topRow`, `'responsive'`) beside the Compressor's; the `delay` branch wraps the existing `TempoSyncSlider` param-row and the Repeats `paramRow` in that panel, then renders Delay Amount's `paramRow` as a direct child. The archived §1.7 "3 direct param-rows" tests for Delay are replaced in this commit.

  **Acceptance criteria:**
  - [x] Delay's block content has exactly one direct nested `.sc-directional-panel` (first) and one direct `.audio-rig-drawer__param-row` (Delay Amount, last); inside the nested panel the Tempo Sync composition's row precedes Repeats' row.
  - [x] The nested panel's `data-orientation` is `row` on a stubbed desktop tier and `column` on tablet.
  - [x] Every Delay Tempo Sync test (switch placement "in the Delay Time row", readouts, mode flips, swell isolation, Profiler re-render tests) unchanged and green, with only its row-locating selectors updated where they counted direct rows.

  **As built:** RED first (5 cases: exact child list of the block, top-row contents + `data-panel-id`, desktop `row`, tablet/mobile `column` with the block itself still `column`, and the existing "first position" layout case re-pointed at the nested panel), then GREEN with one schema constant and the `DirectionalPanel` wrap. One extra pin passed on first run: exactly one Cabinetry facade in the block (the nested row renders unframed — the DirectionalPanel nesting context). The old §1.7 Delay case is gone; the Reverb one stays until Task 4. **Mutation check run:** forcing the schema to `'row'` turned the tablet/mobile `column` case red. 95/95; lint and types clean.

  **Verification:** `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` (RED first); `npm run lint`, `npm run build:types`. **Mutation check:** set the schema to `'row'` and watch the tablet `column` case go red.
  **Dependencies:** None. **Files:** `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`. **Scope:** S.

- [x] **Task 4: Reverb — Length beside Pre-Delay, Amount alone**

  **Description:** Spec §1.3. Module-scope `REVERB_TOP_ROW_SCHEMA` (`audioRig.reverb.topRow`, `'responsive'`) and a new `block.key === 'reverb'` branch beside `delay`'s: `paramRow(decay)` + `paramRow(preDelay)` inside the panel, `paramRow(wet)` after it. Update `findParam`'s doc comment (it already names reverb as a caller).

  **Acceptance criteria:**
  - [x] Reverb's block content is one nested panel (Reverb Length then Pre-Delay) followed by one direct param-row (Reverb Amount); `row` on desktop, `column` on tablet.
  - [x] Reverb Length is still the `SliderLog` and Pre-Delay / Amount the `SliderLinear`s with their existing names and ranges (the arrow-key increment regression test stays green).
  - [x] The archived "Reverb renders 3 direct param-rows" test is replaced, not kept.

  **As built:** RED first (4 structural cases), then GREEN with one schema constant and a `reverb` branch beside `delay`'s; `findParam`'s doc comment now names all three hand-composed blocks. Two pins passed on first run as regression guards: each slider still bound to its own field (an arrow step on Pre-Delay moves only `preDelay`) and exactly one facade in the block. **Mutation check run:** forcing the schema to `'row'` turned the tablet/mobile `column` case red. 100/100; lint and types clean.

  **Verification:** as Task 3.
  **Dependencies:** None. **Files:** `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`. **Scope:** S.

---

### Phase 4: Params → LFO Bank lane slice

- [x] **Task 5: Lane schemas gain `topRow` and `driftRow`**

  **Description:** Spec §1.1. `LfoBankLaneSchema` gains `topRow` and `driftRow: DirectionalPanelSchema` (`audioRig.lfoBank.${lane}.topRow` / `.driftRow`, `type: 'directionalPanel'`, `orientation: 'responsive'`, no labels), built in `lfoBankLaneSchema()`.

  **Acceptance criteria:**
  - [x] `audioRigConfig.test.ts`: every lane's `topRow`/`driftRow` are `'responsive'` `directionalPanel`s with those exact ids and no `humanLabel`/`loreLabel`; ids are unique across the four lanes.
  - [x] Shape/Rate/drift schemas unchanged (existing cases green).

  **As built:** RED first (3 cases: exact row schemas with no label keys, never `'auto'`/fixed `'row'`/`'column'`, the id-uniqueness count 20 → 28), then GREEN with two fields on `LfoBankLaneSchema` and two lines in `lfoBankLaneSchema()`. 97/97; lint and types clean.

  **Verification:** `npx vitest run src/data/audioRigConfig.test.ts` (RED first); `npm run build:types`.
  **Dependencies:** None. **Files:** `audioRigConfig.ts`, `audioRigConfig.test.ts`. **Scope:** XS.

- [x] **Task 6: Lane panel — Shape | Rate+Tempo Sync, then Rate Drift | Depth Drift**

  **Description:** Spec §1.1. `LfoBankLanePanel` wraps the Shape param-row and the `TempoSyncSlider` param-row in `<DirectionalPanel schema={schema.topRow}>`, and the two drift param-rows (still `withHeldOffClass`) in `<DirectionalPanel schema={schema.driftRow}>`; `HeldOffNote` stays a direct child after the drift row. Store wiring and handlers untouched.

  **Acceptance criteria:**
  - [x] The lane panel's content has exactly two direct nested panels; the first holds Shape then the Rate composition (slider + Tempo Sync switch), the second Rate Drift then Depth Drift; the held-off note, when shown, is a direct child after them.
  - [x] Both nested panels are `row` on a stubbed desktop tier and `column` on tablet (copy the local `stubMatchMedia` helper; the file's `lfoEngine` mock stays).
  - [x] Every existing wiring test (Free/Sync writes, mode flips at 60/120 BPM, drift held-off greying, four lanes independent) unchanged and green; the "exactly four param-rows" test is replaced by the structure above (still four param-rows, now two per nested panel).

  **As built:** RED first (7 cases: exact child list, top-row contents, drift-row contents, desktop `row` with the lane panel still `column`, tablet/mobile `column`, held-off note placement + held-off class only on the drift rows, per-lane row ids), then GREEN with the two `DirectionalPanel` wraps. The "exactly four param-rows" test was kept, not replaced — it is still true (two per nested row) and still worth pinning. One pin passed first run: one facade per lane panel. **Mutation check run:** moving the Rate composition into the drift row turned 3 cases red (top-row contents, drift-row contents, the exact child list of the held-off case). 43/43; lint and types clean.

  **Verification:** `npx vitest run src/components/panels/screen/console/LfoBankLanePanel.test.tsx` (RED first); `npm run lint`, `npm run build:types`. **Mutation check:** move the Tempo Sync composition into the drift row and watch the top-row order test go red.
  **Dependencies:** 5. **Files:** `LfoBankLanePanel.tsx`, `LfoBankLanePanel.test.tsx`. **Scope:** S.

### Checkpoint B: Params + Time & Space
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual (Crawford): lane panel = Shape beside Rate-over-Tempo-Sync, drifts beside each other; Delay = Time-over-Tempo-Sync beside Repeats, Amount full width; Reverb = Length beside Pre-Delay, Amount full width. **Measure at exactly 1024 px** (spec risk 1): the half-width Tempo Sync composition (slider + 84 px toggle box + its label) must not clip or slide under its neighbour; the toggle still holds one size in both modes. Below 1024 px everything stacks.
- [ ] Review with Crawford before proceeding.

---

### Phase 5: Probes → Source slice

- [x] **Task 7: Probe layer config — horizontal sliders, column panel, row schemas; no vertical schema left anywhere**

  **Description:** Spec §1.4. In `robotOptionsConfig.ts`'s `makeLayerBlock`: `gain`/`detune`/`phase`/`pulseWidth` → `orientation: 'horizontal'`, `verticalHeight` removed; the layer `panel` → `'column'`; `SignatureArrayLayerBlock` gains `rows: { typeGain, phaseInterval }` (`robotOptions.${key}.typeGainRow` / `.phaseIntervalRow`, `'responsive'`, no labels). Add the spec §5 cross-config pin: no schema in `AUDIO_RIG_CONFIG`, `LFO_BANK_LANE_SCHEMAS` or `SIGNATURE_ARRAY_CONFIG` is `'vertical'`.

  **Acceptance criteria:**
  - [x] `robotOptionsConfig.test.ts`: "Signature Array is vertical on every layer" becomes horizontal; the verticalHeight-budget case becomes "declares no verticalHeight"; the layer panel is `'column'`; `rows.*` are `'responsive'` with the stated ids, unique across layers.
  - [x] A test in `audioRigConfig.test.ts` (or a small new `sliderOrientation.test.ts` beside it) walks both configs and asserts no `'vertical'` orientation remains — the "no live vertical consumer" fact from the spec survey, pinned.
  - [x] Type radio, ranges, ids and `lfoTarget`s unchanged (existing cases green).

  **As built:** RED first (7 cases across two files), then GREEN with the `rows` field, two row schemas, the panel → `'column'`, and four `orientation: 'horizontal'` lines with their `verticalHeight` dropped. The cross-config pin is a new `src/data/sliderOrientation.test.ts` walking `AUDIO_RIG_CONFIG`, `LFO_BANK_LANE_SCHEMAS` and `SIGNATURE_ARRAY_CONFIG` (≥ 43 slider schemas, every one `'horizontal'`, none with a `verticalHeight`) — a separate file because it is a whole-app fact, not one config's. The probe drawer's own tests stayed green on the horizontal config (its structure is Task 8's). 88/88; lint and types clean.

  **Verification:** `npx vitest run src/data/robotOptionsConfig.test.ts src/data/audioRigConfig.test.ts` (RED first); `npm run build:types`.
  **Dependencies:** None (Task 2 must have landed for the cross-config pin to be green; it has, by phase order). **Files:** `robotOptionsConfig.ts`, `robotOptionsConfig.test.ts`, `audioRigConfig.test.ts`. **Scope:** S.

- [x] **Task 8: Probe layer rows — Type | Gain, Lane | Depth, Detune, Lane | Depth, Phase (| Interval)**

  **Description:** Spec §1.4. Inside `.signature-array-drawer__layer`: `<DirectionalPanel schema={block.rows.typeGain}>` holding the Type `RadioButton` (in its own `__param` wrapper) and Gain's `__param`; then Gain's `LfoLink` in its own `__param`; Detune's `__param`; Detune's `LfoLink` in its own `__param`; then either `<DirectionalPanel schema={block.rows.phaseInterval}>` holding Phase's and Interval's `__param`s (type `pulse`) or Phase's `__param` alone. Drop the `verticalHeight` prop pass-throughs. `SignatureArrayDrawer.css` unchanged.

  **Acceptance criteria:**
  - [x] Per layer, DOM order is: nested panel (Type, Gain) → Gain `LfoLink` → Detune → Detune `LfoLink` → either a nested panel (Phase, Interval) for a `pulse` layer or Phase alone with no nested panel; the Gain `LfoLink` is **not** inside the Type | Gain panel (assumption 3).
  - [x] Both nested panels are `row` on a stubbed desktop tier and `column` on tablet; every slider is `aria-orientation="horizontal"`.
  - [x] Every existing test — Interval shown only for `pulse`, structural vs continuous callbacks, LfoLink wiring per target, disabled, style forwarding, per-layer memo bailout, standalone `SignatureArrayLayer` — unchanged and green; `RobotOptionsTab.test.tsx` and `CompanyOptionsSection.test.tsx` (which mount `SignatureArrayLayer`) still green.

  **As built:** RED first (11 cases: the six new structural pins — exact child list per layer type, top-row contents without the Gain link, desktop `row` with the layer panel `column`, tablet/mobile `column`, the pulse toggle round trip adding and removing the Phase | Interval panel — plus the existing link tests re-pointed at the link's own wrapper), then GREEN with the two `DirectionalPanel` wraps, each control in its own `__param`, Phase rendered once as a shared element placed in either spot, and every `verticalHeight` forward dropped. Two pins passed on first run (every slider horizontal — Task 7's config; three facades for the drawer). Test-side: a `linkRow(section, slider)` helper replaces reaching the link through the slider's wrapper; its first version took the wrapper's next sibling, which is wrong for Gain (its wrapper is the last child of the nested top row), so it climbs to the layer's top-level row first — the three link tests that "passed" under the first version did so by landing on Detune's link, which is exactly why the structural pins exist. `RobotOptionsTab.test.tsx` / `CompanyOptionsSection.test.tsx` mock `SignatureArrayLayer` and were unaffected (green). **Mutation check run:** moving Gain's link back into Gain's half turned 4 cases red. 40/40; lint and types clean.

  **Verification:** `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx src/components/panels/screen/console/RobotOptionsTab.test.tsx src/components/company/CompanyOptionsSection.test.tsx` (RED first for the drawer); `npm run lint`, `npm run build:types`. **Mutation check:** put Gain's `LfoLink` back inside Gain's half of the top row and watch the order test go red.
  **Dependencies:** 1, 7. **Files:** `SignatureArrayDrawer.tsx`, `SignatureArrayDrawer.test.tsx`. **Scope:** M.

### Checkpoint C: Probes
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] Manual (Crawford): each oscillator reads Type beside Gain, Lane | Depth under it, Detune, Lane | Depth, then Phase beside Interval for a Burst (pulse) layer and Phase alone otherwise — switch a layer's Type to and from pulse and watch the last row change; the same in a company's bulk-edit view.
- [ ] Review with Crawford before proceeding.

---

### Phase 6: Settings

- [x] **Task 9: Seeds — Retransmit aligned left**

  **Description:** Spec §1.6. `.sector-settings-drawer__retransmit { justify-content: flex-start; }`. A CSS source-scan assertion in `SectorSettingsDrawer.test.tsx` (or a tiny `SectorSettingsDrawer.css.test.ts`) pins it.

  **Acceptance criteria:**
  - [x] The scan finds `justify-content: flex-start` and not `flex-end` in that rule.
  - [x] Every existing drawer test (presets, Retransmit inputs, trait colours, no-literal) unchanged and green.

  **As built:** RED first (the CSS scan), then GREEN with one declaration. A DOM pin passed on first run and stays as the anchor that the scanned class is the one the button actually sits in, after both seed sections. Lint wanted the `node:` imports ahead of the library ones (import/order) — moved.

  **Verification:** `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` (RED first). **Dependencies:** None. **Files:** `SectorSettingsDrawer.css`, `SectorSettingsDrawer.test.tsx`. **Scope:** XS.

- [x] **Task 10: Save & Share — the timestamp sits beside its title**

  **Description:** Spec §1.6. `SessionListItem` wraps name + timestamp in `<span className="session-list-item__title">`; CSS: `__title { flex: 1; display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }`, `__label` drops `flex: 1` and gains `min-width: 0` (keeps ellipsis), `__saved-at` unchanged. Buttons follow the group as before.

  **Acceptance criteria:**
  - [x] The timestamp element is inside the same `__title` group as the name and is its next sibling; Load / Share / Delete are outside the group, in that order.
  - [x] CSS scan: `__title` carries `flex: 1` and `min-width: 0`; `__label` no longer carries `flex: 1`.
  - [x] Every existing row test (Load/Share/Delete behaviour, "shows the entry's saved time next to its name", status notes, delete confirm, no-literal) unchanged and green.

  **As built:** RED first (4 cases: the group's exact two children with the timestamp the name's next sibling, the three buttons outside and after it in order, the share-status note outside it, the CSS scan), then GREEN with the `__title` span and its rule; `__label` keeps ellipsis and gains `min-width: 0` so a long name still truncates inside the group. The timestamp's own style is pinned unchanged. `SessionsPanel.test.tsx` and the Settings integration test stayed green. **Mutation check run:** restoring `flex: 1` on `__label` turned the scan red.

  **Verification:** `npx vitest run src/components/panels/screen/console/SessionListItem.test.tsx src/components/panels/screen/console/SessionsPanel.test.tsx` (RED first). **Mutation check:** restore `flex: 1` on `__label` and watch the scan go red.
  **Dependencies:** None. **Files:** `SessionListItem.tsx`, `SessionListItem.css`, `SessionListItem.test.tsx`. **Scope:** S.

---

### Phase 7: Docs

- [x] **Task 11: Docs and roadmap**

  **Description:** `COMPONENT_LIBRARY.md`: the `LfoLink` entry (row on desktop via the tier hook, column below; both consumers), the slider table's "Used by"/orientation notes and the `'vertical'` paragraph (mode retained, no live consumer after Phase 34), and the stale "side-by-side groupings deferred (`VERTICAL_SLIDERS.md` §1.2, §7)" note resolved. `AUDIO_SYSTEM.md`: the `LfoLink` paragraph (Lane | Depth row beneath each field). `todo/roadmap.md`: **Phase 34 — Layout Updates Pass 2: Post-Sync-Toggle Row Reshuffle** with "About" (spec §1 in brief) and "Not Doing" (vertical mode removal; `'row'`-on-every-tier variants; Levels/Composition/Envelope; Phase 30's open items). The reference grids state no orientation (checked 2026-10-03), so they are not touched. Tick this file's boxes; leave the checkpoints to Crawford.

  **Acceptance criteria:**
  - [x] Every doc claim names a file, class or symbol that exists; `src/docs/freeSyncDocs.test.ts`'s symbol checks still green.
  - [x] `grep -rn "vertical" docs/COMPONENT_LIBRARY.md` shows only the retained-mode paragraph and the (now resolved) history note, no claim of a live vertical consumer.

  **As built:** `COMPONENT_LIBRARY.md` — the `LfoLink` table row and section gain the tier-driven row layout; the `'vertical'` bullet records "no live consumer since Phase 34" and points at `sliderOrientation.test.ts`; the `'auto'` bullet notes no real schema uses it; the stale "side-by-side groupings deferred" paragraph is replaced by how pairs are actually done (nested `'responsive'` panels) and where. `AUDIO_SYSTEM.md` — the `LfoLink` UI paragraph and its three call-site bullets describe the new rows. `todo/roadmap.md` — Phase 34 with About and Not Doing. The reference grids state no orientation (checked 2026-10-03) and were left alone. Every symbol and file named exists; the docs guard (`freeSyncDocs.test.ts`) and the content guard stayed green. Checkpoints A–D are left for Crawford.

  **Verification:** `npm test`, `npm run lint`; read-through by Crawford. **Dependencies:** all. **Files:** the three docs. **Scope:** S (docs only).

### Checkpoint D: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual (Crawford, Chrome at ~360 / ~800 / ≥1024 px, plus exactly 1024 px): the spec §5 manual list in full — every pair side by side on desktop and stacked below, nothing under a 3-box floor, Shape wrapping cleanly, the Tempo Sync toggle holding its size in both new homes, Phase/Interval switching with the layer type, Retransmit left, the session timestamp beside a long ellipsised name; nothing outside the listed panels moved.
- [ ] Crawford's final review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Half-width Tempo Sync composition clips just above 1024 px | Med (lane + Delay rows) | Checkpoint B measures at exactly 1024 px; fallback (ask first) is a wider cut for that one row. |
| `RadioButton`'s `width: 100%` claims a whole flex row | Med (Lane, Shape, Type halves) | `flex: 1 1 0; min-width: 0` on row children — DirectionalPanel's rule, restated in `LfoLink` and pinned by its CSS scan (Task 1). |
| A re-pinned layout test silently loosens a behaviour test | Med | Tasks only replace tests named "direct param-rows" / "vertical" / "four param-rows"; every behaviour test is listed as "unchanged and green" per task. |
| Vertical slider mode goes dark (no consumer) | Low | Pinned as a fact (Task 7) and recorded in COMPONENT_LIBRARY.md (Task 11); the primitives' own tests remain. |
| Interim commit after Task 1 looks odd (row under vertical sliders) | Low | Nothing is checkpointed until Task 2 lands. |

## Open Questions

- None blocking. Spec assumptions 1–3 stand as written. If Crawford reverses one later: assumption 1 ("responsive") changes the schema orientation in Tasks 3, 4, 5, 7 and the tier cases in 3, 6, 8; assumption 2 (row inside `LfoLink`) changes Task 1 and the LfoLink-row assertions in 2 and 8; assumption 3 (probe Lane | Depth full-width) changes Task 8 only.
- Optional cleanup, not this phase: hoist the fifteen per-file `stubMatchMedia` copies into `src/testUtils/`.
