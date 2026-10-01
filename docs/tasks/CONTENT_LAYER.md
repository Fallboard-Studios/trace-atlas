# Implementation Plan: Content Layer

Source spec: [docs/specs/CONTENT_LAYER.md](../specs/CONTENT_LAYER.md). Source intent: [docs/intent/content-layer.md](../intent/content-layer.md). No roadmap slot yet.

> Process note: the `planning-and-task-breakdown` skill asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (see every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house TDD rhythm: RED test first, one commit per task, stop and report at every checkpoint.

> **Status 2026-09-30 (branch `feature/content-layer`):** Tasks 1–16 and 18 done, one commit each, suite/lint/types/build green at every checkpoint. Two sequencing changes from the plan, both recorded in the commits: (a) Task 18's lint rule landed *before* Task 17 because it is the completeness proof — it caught 17 strings the surveys missed, all migrated verbatim — and its "no `[c]` anywhere" assertion is deferred to Task 17; (b) Task 19's documentation half (`docs/CONTENT_LAYER.md`, the archived table, the pointers) is done, while its deletions (the inventory + script) wait for Task 17. **Task 17 is blocked on Crawford filling the copy column in `docs/reference/content-inventory.md`** (57 placeholder/ALL CAPS rows, 8 nav-vs-control conflicts to veto). Checkpoint E's manual walk is also outstanding.

## Overview

Move every user-facing string into one typed module, `src/content/` (one file per area, merged into a typed `CONTENT` object with `labels()`/`options()`/`optionsRecord()`/`intro()`/`fill()` helpers), then migrate every consumer to read from it — data configs first, the nav tree second, content components and primitives third — and finish with a lint rule plus a test that keep literal copy out, and the docs. Nineteen tasks in five phases: 5 foundation tasks that build and fill the module without any consumer (plus the inventory review gate), 4 data-config migrations, 2 nav-tree migrations, 6 component/primitive migrations (the last of which lands the reviewed copy from the gate), then the guard and the docs. Every task leaves the suite green; the module is additive until Phase 2, so nothing user-visible changes before Checkpoint A.

## Architecture Decisions

- **The module is built and filled completely before any consumer touches it (Tasks 1–5).** It is pure data with no importers, so it can land verbatim and be reviewed as "is this the same text?" in isolation. Migrations then become mechanical substitutions whose tests compare against `CONTENT`, never against a second literal.
- **`labels()` omits absent fields instead of emitting `undefined` (spec §7 risk).** Spreading `{ unit: undefined }` into a schema would silently clear a slider suffix; the helper's own test (Task 1) asserts key absence, not value.
- **The `label` → `humanLabel` rename is split into a primitive half (Task 6) and a config half (Task 7).** The option type and `RadioButton.tsx`/`Lfo.tsx` can change first with the configs still compiling (TypeScript flags every stale `label:` site as the task's own to-do list); doing both in one task would touch nine files.
- **Data configs migrate before the nav tree (Phase 2 before Phase 3)** because `FleetParamsContent`'s own label copies (Phase 4) must resolve to the same keys the nav uses, and those keys are easiest to settle while migrating the schemas that define each concept's bounds.
- **`robotSelectionConfig`'s value-label maps become `optionsRecord()` wrappers, not consumer rewrites** (spec §7 resolved) — `RobotSelectionCard`, `RobotDisplaySection`, `AudioStatusBadge` keep importing `JOB_TYPE_LABELS` etc. unchanged.
- **Names are data: `SectorPreset.label` → `.name`** and it is guard-exempt (spec §1.4). Done in Task 8 alongside the sector config so the rename and the content spread land together in the one file that owns the type.
- **The review gate (Task 2) runs in parallel with Tasks 3–5 and blocks only Task 17.** Everything with already-approved wording migrates verbatim without waiting; only the placeholder/heading rows and the inventory's hardcoded strings need Crawford's copy, and they land as one late task.
- **The guard (Task 18) is deliberately last among code tasks** — it is the completeness proof. If `npm run lint` fails when the rule lands, that is a missed string, fixed in Task 18, not a reason to weaken the rule.
- **`IntroContent` (IntroPanel.tsx) is replaced by `ContentIntro` from `src/content/types`** rather than kept as a duplicate interface (Task 16) — the primitive's prop shape is unchanged; only where the type is declared moves.
- **Content components' tests switch to `CONTENT[key]` assertions in the same task that migrates the component**, never in a separate "fix tests" task — a test that still passes against a literal after migration proves nothing.

## Dependency Graph

```
Task 1 (content types + helpers + tests)          Task 2 (inventory script + review doc — GATE for Task 17)
    │
    ├──→ Task 3 (fleet.ts verbatim)
    ├──→ Task 4 (probe.ts + company.ts verbatim)
    └──→ Task 5 (home/header/nav/settings/session/sector/ui.ts verbatim)
              │
   ── Checkpoint A ──
              │
Task 6 (label→humanLabel: controls.ts, RadioButton, Lfo)     ← Task 1
    │
    ├──→ Task 7 (audioRigConfig → labels/options)             ← Task 3
    ├──→ Task 8 (robotOptions/company/session/sector configs) ← Task 4, 5
    └──→ Task 9 (robotSelectionConfig → optionsRecord)        ← Task 4
              │
   ── Checkpoint B ──
              │
Task 10 (navTreeConfig + useNavTree → content keys)          ← Task 3, 5
Task 11 (robotSubsectionConfig → content keys)               ← Task 4
              │
   ── Checkpoint C ──
              │
Task 12 (FleetParamsContent + SettingsContent)               ← Task 7, 10
Task 13 (Probes/Companies content + RobotSectionAccordionStack + ContentPane home) ← Task 11, 5
Task 14 (Header, SectorSettingsDrawer, CoordsInput)          ← Task 8
Task 15 (CompanyCrudControls, SessionListItem, SessionsPanel, RobotOptionsTab) ← Task 8
Task 16 (Lfo shape maps, useLfoTargetGroup, Stepper, PowerRockerSwitch, IntroPanel type) ← Task 5, 6
    │
    └──→ Task 17 (land reviewed copy: placeholders, headings, inventory rows) ← Task 2 gate + 12–16
              │
   ── Checkpoint D ──
              │
Task 18 (ESLint rule + content.test.ts guard)                ← Task 17
    │
    └──→ Task 19 (docs, archive the table, delete inventory + script)
              │
   ── Checkpoint E (manual walk) ──
```

Parallelisable: 3/4/5 together; 2 alongside any of them; 7/8/9 together; 10/11 together; 12–16 together.

## Task List

### Phase 1: Foundation — the module, filled verbatim, with no consumers

- [x] **Task 1: `src/content/` — types, helpers, empty-but-typed `CONTENT`**

  **Description:** Create `src/content/types.ts` (`ContentEntry`, `ContentOption`, `ContentIntro` exactly per spec §1.1, incl. `heading`), `src/content/index.ts` (`CONTENT` merge of the per-area modules — start with a `ui.ts` holding one entry, `ui.cancel`, so the merge and the `ContentKey` union are real from day one; `labels(key, { surface })`, `options`, `optionsRecord`, `intro`, `fill` per spec §1.3/§4), and `src/content/index.test.ts`. No consumer imports it yet.

  **Acceptance criteria:**
  - [ ] `labels(key)` returns `humanLabel` always and includes `loreLabel`/`placeholder`/`unit` **only when the entry has them** — asserted with `not.toHaveProperty`, not `toBeUndefined`.
  - [ ] `labels(key, { surface: 'heading' })` resolves `loreLabel` as `heading ?? lore`; the default surface never reads `heading`.
  - [ ] `options()` preserves declaration order and maps `human`→`humanLabel`, `lore`→`loreLabel`; `optionsRecord()` returns the value-keyed `{ humanLabel, loreLabel? }` record; both throw on an entry without `options`. `intro()` throws on an entry without `intro`. `fill()` substitutes every `{slot}` and throws on a missing var.
  - [ ] `CONTENT` is `as const satisfies Record<string, ContentEntry>`; `ContentKey` is a string-literal union (a test with `// @ts-expect-error` on a misspelt key).

  **Verification:**
  - [ ] `npx vitest run src/content/index.test.ts` passes (RED first for each helper).
  - [ ] `npm run build:types` clean.

  **Dependencies:** None.
  **Files:** `src/content/types.ts`, `src/content/index.ts`, `src/content/copy/ui.ts`, `src/content/index.test.ts`.
  **Scope:** M.

- [x] **Task 2: Inventory script + `docs/reference/content-inventory.md` (the review gate)**

  **Description:** Write `scripts/content/inventory.mjs` (Node, no deps, same style as `scripts/perf/*.mjs`) that walks `src/components`, `src/data`, `src/types` (excluding `*.test.*`) and emits a Markdown table of every string that is **not** already a `loreLabel`/`humanLabel`/`label`/`placeholder`/`unit`/`loreDescription`/`humanDescription` property: JSX text nodes with ≥3 letters, `aria-label`/`title`/`placeholder`/`alt` attribute literals, template literals with ≥2 words, ternary string pairs, and string-valued `Record` maps (`SHAPE_LORE_LABELS`, etc.). Columns per spec §1.5: `file:line` · current text · surface · proposed key · copy (blank). Append a second section listing the six `[c]` placeholders and every ALL CAPS `loreLabel` (regex `^[A-Z0-9 &/\-\[\]]+$`) with the same columns. Run it, commit the output. **Crawford fills the copy column; Task 17 cannot start until he has.**

  **Acceptance criteria:**
  - [ ] Running `node scripts/content/inventory.mjs` writes `docs/reference/content-inventory.md` deterministically (sorted by path then line) and exits 0.
  - [ ] The output contains, at minimum, these known rows: `ContentPane.tsx` HOME_HTML, every `Cancel`, `Robot not found`, `PowerRockerSwitch.tsx`'s `Power on/off`, `Stepper.tsx`'s `Increment/Decrement`, `useLfoTargetGroup.ts`'s `'Mutation'`, `Lfo.tsx`'s two shape maps, `SectorSettingsDrawer.tsx`'s two `[c]` buttons, `CoordsInput.tsx`'s two `[c]` fields, the `RHYTHMIC PHRASING MATRIX`/`CALIBRATION PULSE`-style ALL CAPS headings.
  - [ ] It does **not** list `devWarn`/`console` strings, `className`s, `schema.id`s, or sector preset names.
  - [ ] Rows already carrying approved copy from the 2026-09-29 pass are absent (the first section is hardcoded strings only).

  **Verification:**
  - [ ] Script run in the foreground, output diffed against the known-row list above by eye; ESLint passes on the script (`scripts/**/*.mjs` block already exists in `eslint.config.js`).
  - [ ] Manual: Crawford confirms the table is readable and starts filling it.

  **Dependencies:** None (parallel with 1/3/4/5).
  **Files:** `scripts/content/inventory.mjs`, `docs/reference/content-inventory.md`.
  **Scope:** S.

- [x] **Task 3: `src/content/copy/fleet.ts` — Fleet Params area, verbatim**

  **Description:** Populate every `fleet.*` concept from the current literals in `navTreeConfig.ts` (lore/human pairs), `audioRigConfig.ts` (every param's lore/human/unit, the panel headings, `DECAY_MODE` options, Robot/Effects Load options), `FleetParamsContent.tsx` (section + 5 group intros, HTML bodies byte-for-byte), and `useNavTree.ts`/`uiStore.ts` where a leaf name only exists there. One entry per concept; `fleet.lpf.cutoff` and `fleet.hpf.cutoff` are separate entries. ALL CAPS panel headings and `[c]` strings are copied **as they are** — Task 17 replaces them. Nothing imports the file yet beyond the `CONTENT` merge.

  **Acceptance criteria:**
  - [ ] For every Fleet Params nav node, `audioRigConfig` schema and group intro, a `fleet.*` key exists whose `human`/`lore`/`unit`/`intro` match the current literal exactly (a one-off parity test in `src/content/copy/fleet.test.ts` imports the *current* config/nav/content modules and compares — this test is deleted in Task 12 once the sources read from content and the comparison becomes circular).
  - [ ] No key is surface-named (`...Row`, `...Heading`, `...Accordion`).
  - [ ] Every key matches `/^fleet(\.[a-zA-Z0-9]+){1,3}$/`.

  **Verification:**
  - [ ] `npx vitest run src/content/copy/fleet.test.ts src/content/index.test.ts` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Task 1.
  **Files:** `src/content/copy/fleet.ts`, `src/content/copy/fleet.test.ts`, `src/content/index.ts` (merge line).
  **Scope:** S (2 files, many lines).

- [x] **Task 4: `src/content/copy/probe.ts` + `company.ts` — verbatim**

  **Description:** Same as Task 3 for the Probes and Companies branches: `robotOptionsConfig.ts` (all 4 sections' schemas + options, incl. `probe.monitorMode` options), `robotSelectionConfig.ts` (row schemas + the five value-label maps as `options`), `robotSubsectionConfig.ts` (section/subsection lore + nav + accordion labels — `rhythm` row vs "Composition" accordion become `probe.composition.rhythm` and `probe.composition`), `companyConfig.ts`, `ProbesContent.tsx`/`CompaniesContent.tsx`/`RobotSectionAccordionStack.tsx` intros, and `CompanyCrudControls.tsx`'s base + dynamic labels as templates (`'Delete {company}'`).

  **Acceptance criteria:**
  - [ ] Parity test (`probe.test.ts`, `company.test.ts`, deleted in Tasks 9/13/15) matches every current literal.
  - [ ] `probe.job`, `probe.status.docking`, `probe.status.monitorMode`, `probe.status.audibility` carry `options` keyed by the exact enum values the maps use today, with `UNASSIGNED_JOB_LABEL` as `probe.job.unassigned` (its own concept, not an option — it's shown when there is no value).
  - [ ] Dynamic templates use `{company}`-style slots and nothing else is interpolated.

  **Verification:**
  - [ ] `npx vitest run src/content/copy/probe.test.ts src/content/copy/company.test.ts` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Task 1.
  **Files:** `src/content/copy/probe.ts`, `src/content/copy/company.ts`, their two parity tests, `src/content/index.ts`.
  **Scope:** M.

- [x] **Task 5: `home.ts`, `header.ts`, `nav.ts`, `settings.ts`, `session.ts`, `sector.ts`, `ui.ts` — verbatim**

  **Description:** The remaining areas: `ContentPane.tsx`'s `HOME_HTML` → `home.intro`; `Header.tsx`'s Mute/Volume; nav chrome (`NavToggleButton`, `NavBreadcrumb` aria-labels); `SettingsContent.tsx` intros + its three accordion labels + `settings.*` nav nodes; `sessionConfig.ts`; `sectorSettingsConfig.ts` controls + `SectorSettingsDrawer.tsx`'s two Random buttons + status header (preset *names* excluded); `ui.*`: `Cancel`, `Robot not found`, `Power on/off`, `Increment {name}`/`Decrement {name}`, `ui.lfo.shape` options (Sine/Sway etc.), `ui.lfo.rate`, `ui.lfo.depth`, `ui.lfo.fallbackName` (`'Mutation'`), `CoordsInput`'s X/Y.

  **Acceptance criteria:**
  - [ ] Parity test per area against current literals (deleted as each consumer migrates).
  - [ ] `home.intro.humanDescription` equals today's `HOME_HTML` body byte-for-byte (HTML preserved).
  - [ ] `sector.ts` contains no preset name; `SectorPreset` values are untouched.
  - [ ] The closed area list in `index.ts` is exactly `home header nav fleet probe company settings session sector ui`.

  **Verification:**
  - [ ] `npx vitest run src/content/` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Task 1.
  **Files:** the seven copy files, their parity tests, `src/content/index.ts`.
  **Scope:** M.

### Checkpoint A: Module complete, nothing consumes it
- [ ] `npm test` green, `npm run lint` clean, `npm run build:types` clean.
- [ ] `grep -rn "from '@/content'" src --include=*.ts --include=*.tsx | grep -v "^src/content"` returns nothing (still additive).
- [ ] Every parity test passes — the module is a faithful copy of today's text.
- [ ] `docs/reference/content-inventory.md` exists; Crawford has started filling the copy column (Task 17's gate — does not block Phase 2).
- [ ] Review with human before proceeding.

---

### Phase 2: Data configs read from content

- [x] **Task 6: `label` → `humanLabel` on radio options — the primitive half**

  **Description:** In `src/types/controls.ts` rename `RadioButtonSchema`'s option field `label` to `humanLabel` (keep `loreLabel?`, `color?`). Update the one read in `RadioButton.tsx` and `Lfo.tsx`'s `SHAPE_OPTIONS` construction (rename only — the shape maps themselves move in Task 16). Let `npm run build:types` enumerate every stale `label:` site in `src/data` and `companyConfig.ts`; fix those sites with a **mechanical rename only** in this task (the content spread comes in Tasks 7–9), so the tree compiles at the end.

  **Acceptance criteria:**
  - [ ] `RadioButton.test.tsx`: options render `humanLabel`; an option object with `label` is a type error (`// @ts-expect-error` case).
  - [ ] No `label:` property remains on any radio option in `src/data` or `src/components`.
  - [ ] All pre-existing `RadioButton`/`Lfo`/config tests pass unmodified except for the rename.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/RadioButton.test.tsx src/components/ui/controls/Lfo.test.tsx src/data/` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Task 1.
  **Files:** `src/types/controls.ts`, `RadioButton.tsx` + test, `Lfo.tsx`, `src/data/{audioRigConfig,robotOptionsConfig,companyConfig}.ts` (rename lines only).
  **Scope:** M.

- [x] **Task 7: `audioRigConfig.ts` → `labels()` / `options()`**

  **Description:** Replace every `loreLabel`/`humanLabel`/`unit` literal and every radio `options` array in `audioRigConfig.ts` with `...labels('fleet.…')` / `options('fleet.…')`; panel headings use `labels(key, { surface: 'heading' })`. Bounds, ids, orientation, `verticalHeight`, traits untouched. `audioRigConfig.test.ts`'s label assertions switch to `CONTENT[key]`. Delete `fleet.test.ts`'s audioRig half of the parity test (now circular).

  **Acceptance criteria:**
  - [ ] `grep -nE "(loreLabel|humanLabel|unit)\s*:\s*'" src/data/audioRigConfig.ts` returns nothing.
  - [ ] Every schema's `humanLabel` equals `CONTENT[key].human` for its concept; `unit` present exactly where the entry has one.
  - [ ] Structural tests (unique ids, bounds, option counts) pass unchanged.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console/` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Tasks 3, 6.
  **Files:** `src/data/audioRigConfig.ts` + test, `src/content/copy/fleet.test.ts`.
  **Scope:** S.

- [x] **Task 8: `robotOptionsConfig.ts`, `companyConfig.ts`, `sessionConfig.ts`, `sectorSettingsConfig.ts` → `labels()` / `options()`; `SectorPreset.label` → `.name`**

  **Description:** Same substitution across the four configs. `buildCompanyAssignmentSchema` keeps company names as option `humanLabel` values (data) but takes its own label pair and the Freelance option from `company.assign`. `SectorPreset.label` becomes `name`; `SectorSettingsDrawer.tsx`'s two `preset.label` reads follow (the drawer's own schemas migrate in Task 14). Tests switch to `CONTENT`. Delete the matching parity-test halves.

  **Acceptance criteria:**
  - [ ] No copy literal remains in the four files (same grep as Task 7, over all four).
  - [ ] `SectorPreset` has `name`, not `label`; preset names are unchanged strings.
  - [ ] `companyConfig.test.ts`: Freelance option label equals `CONTENT['company.assign'].options.freelance.human`; a company option's `humanLabel` is the company's `name` verbatim.

  **Verification:**
  - [ ] `npx vitest run src/data/ src/components/panels/screen/console/SectorSettingsDrawer.test.tsx src/components/company/` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Tasks 4, 5, 6.
  **Files:** the four configs + their tests, `SectorSettingsDrawer.tsx` (two reads).
  **Scope:** M (5 source files, mechanical).

- [x] **Task 9: `robotSelectionConfig.ts` → `labels()` + `optionsRecord()` wrappers**

  **Description:** Row schemas spread from `probe.*`; the five value-label maps become `export const JOB_TYPE_LABELS = optionsRecord('probe.job')` etc. (typed as today's `Record<JobType, ValueLabel>` via a cast-free `satisfies`), `UNASSIGNED_JOB_LABEL = labels('probe.job.unassigned')`. Consumers (`RobotSelectionCard`, `RobotDisplaySection`, `AudioStatusBadge`) untouched. Delete `probe.test.ts`'s selection half.

  **Acceptance criteria:**
  - [ ] Each map has exactly the same keys as before (`JobType`/`DockingState`/`AudioMode`/`AudibilityState` closed-set tests pass unchanged).
  - [ ] `RobotSelectionCard.test.tsx` / `AudioStatusBadge.test.tsx` pass **unmodified** — behaviour parity through the wrapper.
  - [ ] No copy literal remains in the file.

  **Verification:**
  - [ ] `npx vitest run src/data/robotSelectionConfig.test.ts src/components/selection/ src/components/robot/RobotDisplaySection.test.tsx` passes.

  **Dependencies:** Tasks 4, 6.
  **Files:** `src/data/robotSelectionConfig.ts` + test, `src/content/copy/probe.test.ts`.
  **Scope:** S.

### Checkpoint B: Every `src/data` schema reads from content
- [ ] `grep -rnE "(loreLabel|humanLabel|label|unit|placeholder)\s*:\s*['\"]" src/data --include=*.ts --exclude=*.test.ts` returns nothing.
- [ ] `npm test`, `npm run lint`, `npm run build:types` all clean.
- [ ] Manual: open Fleet Params, a robot, a company, Settings → Seeds, Sessions — every slider/radio/button label reads exactly as before this branch.
- [ ] Review with human before proceeding.

---

### Phase 3: Nav tree reads from content

- [x] **Task 10: `navTreeConfig.ts` + `useNavTree.ts` → `content` keys**

  **Description:** `NavTreeNodeSchema` drops `loreLabel`/`humanLabel`/`docId` and gains `content: ContentKey`. Every static node references its concept. `useNavTree.ts` resolves a row's pair via `labels(node.content)` wherever it read `node.humanLabel`/`node.loreLabel` (and `NavTreeNode.tsx`/`NavBreadcrumb.tsx`/`NavCabinetRow.tsx` if they read the schema fields directly). `SettingsContent.tsx`'s "must match navTreeConfig" comment becomes moot — leave its own labels for Task 12. Tests: `navTreeConfig.test.ts` asserts every `content` key exists in `CONTENT` and no node carries the removed fields; `useNavTree.test.ts` asserts resolved labels equal `CONTENT[...]`. Delete the nav half of `fleet.test.ts`/`settings.test.ts` parity.

  **Acceptance criteria:**
  - [ ] No nav node carries `loreLabel`, `humanLabel` or `docId`; each has a `content` key that exists.
  - [ ] Every tree row renders `CONTENT[node.content].human` and (where present) `.lore`; breadcrumb and tree-row tests pass against `CONTENT`.
  - [ ] Dynamic Probes/Companies subtrees (per-robot/company nodes built at render time) still show robot/company **names** (data, not content) — an explicit test.

  **Verification:**
  - [ ] `npx vitest run src/data/navTreeConfig.test.ts src/components/panels/screen/nav/` passes.
  - [ ] `npm run build:types` clean.

  **Dependencies:** Tasks 3, 5.
  **Files:** `navTreeConfig.ts` + test, `useNavTree.ts` + test, possibly `NavTreeNode.tsx`/`NavBreadcrumb.tsx`.
  **Scope:** M.

- [x] **Task 11: `robotSubsectionConfig.ts` → `content` keys**

  **Description:** `RobotSectionEntry`/`RobotSubsectionEntry` replace `loreLabel`/`navLabel`/`accordionLabel`/`ownAccordionLabel` with `content: ContentKey` (row) and `accordion?: ContentKey` (the accordion's concept, present exactly where an accordion exists — `rhythm`'s is `probe.composition`; `source`'s own wrapper is `probe.source`). `useNavTree.ts`'s section/subsection builders and `RobotSectionAccordionStack.tsx`'s two `AccordionSchema` literals resolve via `labels()`. Tests updated to `CONTENT`.

  **Acceptance criteria:**
  - [ ] `ROBOT_SECTIONS_CONFIG` has no string label fields; every `content`/`accordion` key exists.
  - [ ] The `rhythm` row renders `CONTENT['probe.composition.rhythm'].human` ("Rhythm") and its accordion `CONTENT['probe.composition'].human` ("Composition") — two keys, asserted distinct.
  - [ ] `mergedInto` behaviour unchanged (existing tests pass).

  **Verification:**
  - [ ] `npx vitest run src/data/robotSubsectionConfig.test.ts src/components/panels/screen/nav/` passes.

  **Dependencies:** Task 4.
  **Files:** `robotSubsectionConfig.ts` + test, `useNavTree.ts`, `RobotSectionAccordionStack.tsx` (schema lines only; intros in Task 13).
  **Scope:** S.

### Checkpoint C: Nav tree is label-free
- [ ] `grep -nE "(loreLabel|humanLabel|navLabel|accordionLabel|ownAccordionLabel)\s*:" src/data/navTreeConfig.ts src/data/robotSubsectionConfig.ts` returns nothing.
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] Manual: every nav row (desktop + phone tier), breadcrumb and accordion heading reads as before; robot/company names still show in their rows.
- [ ] Review with human before proceeding.

---

### Phase 4: Components and primitives read from content

- [x] **Task 12: `FleetParamsContent.tsx` + `SettingsContent.tsx`**

  **Description:** Remove `FLEET_PARAMS_SECTION_INTRO`, `FLEET_PARAMS_GROUP_INTRO`, the `humanLabel` fields on `FleetParamsGroupDef`/`FleetParamsLeaf`, and `SettingsContent`'s `SETTINGS_*_INTRO` + its three accordion schemas; read `intro(key)` and `labels(key)` using the same keys the nav nodes carry (group defs and leaves get `content: ContentKey` instead of `humanLabel`). Tests assert intro headline/body and accordion headings from `CONTENT`. Delete the remaining `fleet.test.ts`/`settings.test.ts` parity tests.

  **Acceptance criteria:**
  - [ ] Neither file contains a copy literal (grep per Task 7, plus `loreDescription|humanDescription`).
  - [ ] Each group accordion heading equals `CONTENT[group.content].human`; each `IntroPanel` receives `intro(group.content)`.
  - [ ] Lazy-mount/accordion/scrollspy tests pass unchanged (pure wiring is untouched).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx src/components/panels/screen/nav/content/SettingsContent.test.tsx` passes.

  **Dependencies:** Tasks 7, 10.
  **Files:** the two components + tests, two parity tests deleted.
  **Scope:** S.

- [x] **Task 13: `ProbesContent.tsx`, `CompaniesContent.tsx`, `RobotSectionAccordionStack.tsx` intros, `ContentPane.tsx` home**

  **Description:** The four intro tables (`ALL_PROBES_INTRO`, `PROBES_INTRO`, `COMPANIES_INTRO`, `INDIVIDUAL_COMPANY_INTRO`, `SUBSECTION_INTRO`, `SOURCE_INTRO`) → `intro(key)`; `HOME_HTML` → `intro('home.intro').humanDescription` (rendered through the same sanitised path `IntroPanel` uses, or the existing `dangerouslySetInnerHTML` with DOMPurify — whichever `ContentPane` does today, unchanged). `RobotOptionsTab.tsx`'s `Robot not found` → `CONTENT['ui.robotNotFound'].human` can ride here if it is the only remaining string in that file. Delete the matching parity tests.

  **Acceptance criteria:**
  - [ ] No copy literal in the four files.
  - [ ] `ContentPane.test.tsx` asserts the home heading/body against `CONTENT['home.intro']`.
  - [ ] Existing intro-rendering tests pass against `CONTENT`.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/ src/components/panels/screen/nav/RobotSectionAccordionStack.test.tsx src/components/panels/screen/console/ContentPane.test.tsx` passes.

  **Dependencies:** Tasks 5, 11.
  **Files:** the four components + tests (+ `RobotOptionsTab.tsx` if taken here).
  **Scope:** M.

- [x] **Task 14: `Header.tsx`, `SectorSettingsDrawer.tsx`, `CoordsInput.tsx` inline schemas**

  **Description:** `MUTE_SCHEMA`/volume schema → `labels('header.mute')`/`labels('header.volume')`; the drawer's Random buttons, status header and `presetSchema()` lore caption → `sector.*` keys (preset `name` stays the button's `humanLabel` — data); `CoordsInput`'s X/Y schemas → `ui.coords.x`/`ui.coords.y`. The `[c]` strings are still verbatim here; Task 17 swaps them.

  **Acceptance criteria:**
  - [ ] No copy literal in the three files.
  - [ ] `Header.test.tsx`'s accessible-name assertions use `CONTENT['header.mute'].human`.
  - [ ] A preset button's visible label is still the preset's `name`.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/Header.test.tsx src/components/panels/screen/console/SectorSettingsDrawer.test.tsx src/components/ui/controls/CoordsInput.test.tsx` passes.

  **Dependencies:** Task 8.
  **Files:** three components + tests.
  **Scope:** S.

- [x] **Task 15: `CompanyCrudControls.tsx`, `SessionListItem.tsx`, `SessionsPanel.tsx` (+ `RobotOptionsTab.tsx` if not taken in 13)**

  **Description:** Dynamic labels via `fill()` (`company.create`/`rename`/`delete` templates with `{company}`/`{name}` slots; `session.load`/`session.delete` per-row labels likewise); every `Cancel` → `CONTENT['ui.cancel'].human`. Tests assert the filled strings against `fill()`.

  **Acceptance criteria:**
  - [ ] No copy literal in the files.
  - [ ] `CompanyCrudControls.test.tsx`: the delete button's accessible name for company "Acme" equals `fill('company.delete', { company: 'Acme' })`; the blank-draft case equals the entry's own `human`.
  - [ ] Session row Load/Delete names likewise.

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyCrudControls.test.tsx src/components/panels/screen/console/SessionListItem.test.tsx src/components/panels/screen/console/SessionsPanel.test.tsx` passes.

  **Dependencies:** Task 8.
  **Files:** three or four components + tests.
  **Scope:** S.

- [x] **Task 16: Primitives' own strings — `Lfo.tsx`, `useLfoTargetGroup.ts`, `Stepper.tsx`, `PowerRockerSwitch.tsx`, `IntroPanel.tsx` type**

  **Description:** `SHAPE_HUMAN_LABELS`/`SHAPE_LORE_LABELS` → `options('ui.lfo.shape')`; the Shape/Rate/Depth schemas' labels → `ui.lfo.*`; `'Mutation'` fallback → `CONTENT['ui.lfo.fallbackName'].lore`; `Stepper` aria templates → `fill('ui.stepper.increment', { name })`; `PowerRockerSwitch` → `ui.power.on/off`; `IntroPanel.tsx` re-exports/uses `ContentIntro` from `src/content/types` in place of its own `IntroContent`. These are the only primitives that import `CONTENT`, and only for `ui.*` keys.

  **Acceptance criteria:**
  - [ ] No copy literal in the five files; `IntroContent` no longer declared in `IntroPanel.tsx`.
  - [ ] `Lfo.test.tsx`: shape option labels equal `options('ui.lfo.shape')`; `Stepper.test.tsx`/`PowerRockerSwitch.test.tsx`: aria names equal the filled/looked-up strings.
  - [ ] `useLfoTargetGroup.test.ts`'s fallback-name case asserts against `CONTENT`.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/` passes.

  **Dependencies:** Tasks 5, 6.
  **Files:** five source files + four tests.
  **Scope:** M.

- [ ] **Task 17: Land the reviewed copy — placeholders, headings, inventory stragglers** *(gated on Task 2's copy column being filled)*

  **Description:** Apply Crawford's copy from `docs/reference/content-inventory.md` to the content module: the six `[c]` strings, every ALL CAPS heading (as `heading` where he assigned a heading distinct from the row name, else as `lore`), and any hardcoded string the inventory found that Tasks 12–16 did not already move (these get keys + consumers migrated here). This is the **only** task that changes wording. Parity tests are all gone by now, so the tests here are: no `[c]` anywhere in `CONTENT`; every inventory row's `file:line` no longer contains its literal.

  **Acceptance criteria:**
  - [ ] `grep -rn "\[c\]" src` returns nothing.
  - [ ] No `loreLabel`/`lore` value in `CONTENT` matches `/^[A-Z0-9 &/\-]+$/` unless Crawford's copy column explicitly kept it (list those keys in the commit message).
  - [ ] Every row in the inventory's first section is either migrated (its literal is gone from the cited file) or explicitly marked "keep as data" in the doc with a one-line reason.

  **Verification:**
  - [ ] `npm test` green; `npm run build:types` clean.
  - [ ] Manual: Crawford reads the diff of the copy files — this is the wording review.

  **Dependencies:** Task 2 (filled), Tasks 12–16.
  **Files:** `src/content/copy/*.ts`, whichever consumers the stragglers live in, `docs/reference/content-inventory.md`.
  **Scope:** M (unknown until the inventory is filled — split if > 5 consumer files).

### Checkpoint D: No literal copy outside `src/content/`
- [ ] `grep -rnE "(loreLabel|humanLabel|loreDescription|humanDescription|placeholder|unit)\s*:\s*['\"\`]" src/components src/data --include=*.ts --include=*.tsx --exclude=*.test.*` returns nothing.
- [ ] `grep -rn "\[c\]" src` returns nothing.
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` all clean.
- [ ] Manual: full walk (Deck, Fleet Params, Probes incl. All Probes + one robot, Companies incl. one company, Settings incl. Seeds + Sessions) at desktop and phone width — no label reads as a key, `undefined`, or `[c]`; the rewritten headings show the approved copy.
- [ ] Review with human before proceeding.

---

### Phase 5: Guard and docs

- [x] **Task 18: ESLint `no-restricted-syntax` rule + `src/content/content.test.ts`**

  **Description:** Add the spec §1.7 rule block to `eslint.config.js` (scoped `files: ['src/components/**', 'src/data/**']`, `ignores: ['**/*.test.*']`; selectors for copy-property literals, `JSXText` with ≥3 letters, and `aria-label`/`title`/`placeholder`/`alt` literals; the spec's message). Add `content.test.ts`: every `ContentKey` referenced from `src/` outside `src/content/`; no `[c]`; non-empty `human`; key grammar + closed area list; same-area duplicate `human`+`lore` pairs fail with both keys named. **Mutation check:** temporarily add `humanLabel: 'X'` to a component and a bare `<p>Hello there</p>`; confirm `npm run lint` reports both with the spec's message; revert.

  **Acceptance criteria:**
  - [ ] `npm run lint` passes on the finished tree with the rule on (if it doesn't, the failures are missed strings — migrate them here and note them in the commit).
  - [ ] The mutation check produces exactly two new lint errors, both carrying the "User-facing text belongs in src/content" message.
  - [ ] `content.test.ts` fails when a key is added to `CONTENT` without a consumer (verified by adding one temporarily) and passes otherwise.

  **Verification:**
  - [ ] `npx vitest run src/content/` passes; `npm run lint` clean; mutation check recorded in the task commit message.

  **Dependencies:** Task 17.
  **Files:** `eslint.config.js`, `src/content/content.test.ts`.
  **Scope:** S.

- [ ] **Task 19: Docs — `docs/CONTENT_LAYER.md`, archive the reference table, pointers, delete the inventory + script**

  **Description:** Write `docs/CONTENT_LAYER.md` (entry shape, key rules + area list, the five helpers, the `heading` surface, the guard, "names are data", how to add a concept). `git mv docs/reference/text-content-tables.md docs/reference/archive/` with a two-line superseded header. One pointer line in `copy-tone-guide.md`. Update `COMPONENT_LIBRARY.md` (the `loreLabel`/`humanLabel` casing and `resolveAccessibleName` sections now cite `src/content/`; the `ROBOT_SECTIONS_CONFIG` paragraph mentions `content` keys) and `UI_SHELL.md` (the "one shared table" paragraph). `CLAUDE.md`: reference-docs entry + the TL;DR line from spec §1.8. Delete `docs/reference/content-inventory.md` and `scripts/content/inventory.mjs`.

  **Acceptance criteria:**
  - [ ] Every path and helper name cited in the new doc exists (checked by grep, per the repo's "verify docs against code" rule).
  - [ ] `docs/reference/text-content-tables.md` no longer exists at its old path; the archived copy has the header.
  - [ ] `CLAUDE.md` lists `docs/CONTENT_LAYER.md` and carries the one-line rule.

  **Verification:**
  - [ ] `npm run lint` (markdown isn't linted — manual read-through), `npm test` still green (the inventory script's removal breaks nothing).

  **Dependencies:** Task 18.
  **Files:** `docs/CONTENT_LAYER.md`, `docs/reference/archive/text-content-tables.md`, `docs/reference/copy-tone-guide.md`, `docs/COMPONENT_LIBRARY.md`, `docs/UI_SHELL.md`, `CLAUDE.md`, two deletions.
  **Scope:** M (docs only).

### Checkpoint E: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] `docs/reference/content-inventory.md` and `scripts/content/inventory.mjs` are gone.
- [ ] Spec §5 manual check done once more on the final build, including the accessibility-tree read of a stepper and the power switch.
- [ ] Crawford's final review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Inventory misses strings built by concatenation/ternaries | Med | Task 18's lint rule is the real completeness check; expect one straggler round inside Task 18, budgeted for. |
| `labels()` spreads `undefined` and clears a schema default | High (silent) | Task 1 asserts property *absence*; Task 7's `unit` criterion re-checks on real schemas. |
| Transcription error while filling ~350 strings | Med | Tasks 3–5 carry parity tests against the *current* literals, deleted only when the source they compare to migrates; Checkpoints B–D each include a visual walk. |
| Test churn across ~25 test files | Med | Tests migrate in the same task as their component; never a separate "fix tests" task; never fix a failing literal by editing content. |
| `JSXText` rule false positives on punctuation | Low | `[A-Za-z]{3,}` guard; legitimate separators become `{' — '}`. |
| Task 17 blocked on the copy column | Med (schedule) | Tasks 2 and 3–16 are independent of it; only 17–19 wait. |
| Phase 4 tasks collide on `RobotOptionsTab.tsx` | Low | Assigned to Task 13 by default, Task 15 only if 13 didn't take it — decided at Task 13's start, noted in its commit. |

## Open Questions

None — spec §7 is fully resolved as of 2026-09-30. Anything new discovered mid-task goes in the inventory doc (strings) or a spec amendment (shape), not into an ad-hoc decision.
