# Implementation Plan: Company Assignment — `Select` → `RadioButton` (Roadmap Phase 10.5)

Source spec: [docs/specs/COMPANY_ASSIGNMENT_RADIO.md](../specs/COMPANY_ASSIGNMENT_RADIO.md).
Source intent: [docs/intent/company-assignment-radio.md](../intent/company-assignment-radio.md).
Pure presentation + one data-config rename + documentation — no `AudioEngine`/`BeatClock` change, no new
Zustand field, no `Company`/`Robot`/`Locale` shape change, no change to `assignRobotToCompany`. Every task
below either swaps a control type at an existing call site, removes a now-dead primitive, or updates docs
to match — none touch `CabinetBox`, `RadioButton.tsx` itself, or any Oblique Cabinetry file.

## Overview

The spec resolves every implementation-shape question already (§1–§4), including two corrections to the
intent doc (14, not 13, primitives after removal; `CLAUDE.md` needs no edit) and full replacement source for
every touched file. That collapses this plan to 5 tasks: one foundation task (the schema builder rename,
consumed by nothing yet but independently testable), two independent per-call-site consumer swaps, one
combined primitive-deletion-and-type-removal task (the two must land together — deleting `Select.tsx` and
removing `SelectSchema` from `controls.ts` are each other's precondition), and one docs task.

## Architecture Decisions

- **The schema-builder rename (`companyConfig.ts`) is its own first task, not folded into a consumer task**
  — both `RobotSelectionCard` and `RobotDisplaySection` need the renamed `buildCompanyAssignmentSchema` to
  exist before either can be updated, so it's the one true foundation dependency (spec §1.1). Landing it
  first, alone, keeps `companyConfig.test.ts`'s own suite independently green before either consumer changes,
  rather than bundling an unrelated data-layer rename into a component-swap task's diff.
- **The two consumer swaps are separate tasks, not one** — `RobotSelectionCard.tsx` and
  `RobotDisplaySection.tsx` share no code beyond the schema builder (already landed by Task 1) and
  `FREELANCE_VALUE`; each is a complete, independently reviewable, independently testable vertical slice
  (one component + its own test file), matching this codebase's own established pattern of one task per real
  consumer (e.g. `RadioButton`'s 11.1.6 plan, `AccordionContainer`'s 11.1.7 plan). They have no dependency on
  each other and are safe to implement in either order or in parallel.
- **`Select.tsx`/`.css`/`.test.tsx` deletion and `SelectSchema`'s removal from `controls.ts`/`.test.ts` are
  one task, not two** — each is the other's precondition (deleting the files first leaves `controls.ts`'s
  `SelectSchema` referencing nothing real but still compiling; removing `SelectSchema` first breaks
  `Select.tsx`'s own `import type { SelectSchema }`), and both must be true simultaneously for the repo to
  build. Splitting them would create an artificial intermediate state that either doesn't compile or doesn't
  fully honor the "remove entirely" intent.
- **This task must come after both consumer tasks, not before or alongside them** — `RobotSelectionCard.tsx`
  and `RobotDisplaySection.tsx` are `Select`'s only two real call sites (confirmed by spec §2's repo-wide
  search); deleting `Select` before they stop importing it would break the build mid-plan.
- **Docs are one task, last** — `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, and
  `docs/todo/roadmap.md` all describe the *shipped* end state (primitive count, which control renders the
  company row, the roadmap's own record of what happened), so they can only be written accurately once every
  code task has landed. All three are independent of each other and can be done in any order within the task.
- **No task touches `CLAUDE.md`** — spec §1.5 confirms its existing "14 stateless UI primitives" text is
  already correct (by coincidence — see Task 5's own note) and needs no edit anywhere in this plan.
- **No task touches `RadioButton.tsx`/`.css`, `CabinetBox.tsx`/`.css`, `CompanyButtonRow.tsx`/`.css`, or
  `assignRobotToCompany`** — confirmed against spec §3's Strict Scope boundary; every task below reuses these
  completely unmodified.

## Dependency Graph

```
Task 1 (companyConfig.ts/.test.ts — rename to buildCompanyAssignmentSchema, RadioButtonSchema)
        │
        ├──→ Task 2 (RobotSelectionCard.tsx/.test.tsx — Select → RadioButton)
        │             │
        └──→ Task 3 (RobotDisplaySection.tsx/.test.tsx — Select → RadioButton)
                      │        (Tasks 2 and 3 are independent of each other — both only need Task 1)
                      │
                      ▼
              Task 4 (Select.tsx/.css/.test.tsx deleted; SelectSchema removed from
                      controls.ts/.test.ts — must land together)
                      │
                      ▼
              Task 5 (docs: COMPONENT_LIBRARY.md, COMPANIES.md, roadmap.md)
```

## Task List

### Phase 1: Foundation — the schema builder

- [x] **Task 1: `companyConfig.ts` — rename `buildCompanySelectSchema` to `buildCompanyAssignmentSchema`, return `RadioButtonSchema`**

  **Description:** Per spec §1.1/§1.2/§4: rename the exported function, change its return type from
  `SelectSchema` (`type: 'select'`) to `RadioButtonSchema` (`type: 'radio'`), and drop the now-unused
  `SelectSchema` import (the file already imports `RadioButtonSchema` for `buildCompanyButtonRowSchema`, so
  no new import is needed). Freelance-first-then-companies option order is unchanged — only the function's
  name and return type change, not its logic. Reword `FREELANCE_VALUE`'s doc comment (drop the "Radix
  `Select.Item` rejects an empty string" reasoning, replace with the defensiveness/symmetry reasoning spec
  §1.2 gives) and `NONE_VALUE`'s doc comment (drop its own "the robot-to-company assignment Select" phrase).
  Update `companyConfig.test.ts` to match: renamed `describe`/import, `schema.type` assertion `'select'` →
  `'radio'`, and the `FREELANCE_VALUE` test's description string reworded (its assertions are unchanged —
  still checks non-empty string).

  **Acceptance criteria:**
  - [x] `buildCompanySelectSchema` no longer exists anywhere in `src/`; `buildCompanyAssignmentSchema` exists,
    has the exact same signature (`(companies: Company[]) => RadioButtonSchema`), and returns
    `type: 'radio'` with `options` starting with `{ value: FREELANCE_VALUE, label: 'Freelance' }` followed by
    one `{ value: c.id, label: c.name }` per company, in array order — byte-identical option-building logic
    to before, only the return type/id-string literal changed.
  - [x] `id: 'company.assign'` is unchanged.
  - [x] `SelectSchema` is no longer imported anywhere in `companyConfig.ts`.
  - [x] `FREELANCE_VALUE`'s value (`'__freelance__'`) is unchanged; only its doc comment is reworded per spec
    §4's exact text.
  - [x] `NONE_VALUE`'s doc comment no longer mentions "Select" — reworded per spec §4.
  - [x] `buildCompanyButtonRowSchema`, `NONE_VALUE`, `ALL_VALUE`, `COMPANY_SELECTION_HEADER_SCHEMA`,
    `COMPANY_NAME_INPUT_SCHEMA`, `CREATE_COMPANY_SCHEMA`, `DELETE_COMPANY_SCHEMA` are all byte-for-byte
    unchanged except `NONE_VALUE`'s comment above.
  - [x] `companyConfig.test.ts`'s `buildCompanySelectSchema` describe block is renamed to
    `buildCompanyAssignmentSchema`, its 3 tests updated to call the renamed function and assert
    `schema.type === 'radio'`, all other assertions (option order/content/length, `company.` id namespace)
    unchanged.
  - [x] `companyConfig.test.ts`'s `FREELANCE_VALUE` test description string no longer references
    "Select.Item"; its assertions (`typeof === 'string'`, `.length > 0`) are unchanged.
  - [x] `companyConfig.test.ts`'s "every schema type is one of the 14 closed-set ControlSchema variants"
    describe-block string is **not** edited (spec §1.6 — it's already accidentally correct and stays that
    way once Task 4 lands).
  - [x] `RobotSelectionCard.tsx`/`RobotDisplaySection.tsx` are **not** touched by this task — they still
    import the now-nonexistent `buildCompanySelectSchema`, so `npm run build:types` is expected to fail
    against those two files specifically until Tasks 2/3 land. This is a deliberate, temporary,
    single-branch intermediate state (spec's own commit grouping), not a regression to fix here.

  **Verification:**
  - [x] `npx vitest run src/data/companyConfig.test.ts` passes in full — confirmed genuinely RED first (3
    failures, `buildCompanyAssignmentSchema is not a function`, all 3 in the renamed describe block; the 8
    other pre-existing tests in the file passed untouched), then GREEN after the rename (11/11 passing).
  - [x] `npm run build:types` (the repo's real type-check script — plain `npx tsc --noEmit` at the repo root
    is a no-op here, since `tsconfig.json` is a project-references shell with `files: []`; confirmed and used
    `-p tsconfig.app.json` instead) shows errors **only** in `RobotSelectionCard.tsx`/`RobotDisplaySection.tsx`
    (`TS2305: has no exported member 'buildCompanySelectSchema'`) — no error anywhere else.
  - [x] `npx eslint src/data/companyConfig.ts src/data/companyConfig.test.ts` — zero errors.

  **Dependencies:** None.

  **Files:** `src/data/companyConfig.ts`, `src/data/companyConfig.test.ts`

  **Estimated scope:** XS (2 files, one rename + two comment rewords)

---

### Phase 2: The two consumers — independent, both depend only on Task 1

- [x] **Task 2: `RobotSelectionCard` — `Select` → `RadioButton`**

  **Description:** Per spec §1.1/§1.3/§4/§5: full replacement of `RobotSelectionCard.tsx` per the spec's
  given source — swap the `Select` import for `RadioButton`, rename the local `companySelectSchema` variable
  to `companyAssignmentSchema` bound to `buildCompanyAssignmentSchema(companies)`, reword the `stopBubble`
  JSDoc and the component's own top-of-file JSDoc to drop the portal-specific reasoning (spec §1.3) while
  keeping both `stopBubble` handlers (`onClick`/`onKeyDown`) on the company row exactly as before — they are
  still required. No change to `RobotSelectionCard.css`. Rewrite `RobotSelectionCard.test.tsx`'s "company
  assignment" describe block per spec §5: `getByRole('combobox')`/`getByRole('option')` queries become
  `getByRole('radio', { name })`; the "opens then selects" two-step interaction becomes a single click; the
  old "trigger" + "portaled option" double-fire tests merge into one (spec §1.7). Every test outside that
  describe block is unchanged.

  **Acceptance criteria:**
  - [x] `RobotSelectionCard.tsx` imports `RadioButton` from `@/components/ui/controls/RadioButton`, not
    `Select`.
  - [x] The company row renders `<RadioButton schema={companyAssignmentSchema} value={robot.companyId ??
    FREELANCE_VALUE} onChange={handleCompanyChange} />` — `handleCompanyChange`'s body is unchanged
    (`assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value)`).
  - [x] The company row `<div>` still has both `onClick={stopBubble}` and `onKeyDown={stopBubble}`.
  - [x] `stopBubble`'s doc comment and the component's own top-of-file doc comment no longer claim a Radix
    `Portal` is involved; both explain the guard as being for a nested interactive DOM element.
  - [x] `RobotSelectionCard.css` is unmodified (`git diff` empty).
  - [x] `RobotSelectionCard.test.tsx`'s company-assignment tests use `getByRole('radio', { name: ... })` and
    `.getAttribute('aria-checked')`, never `getByRole('combobox'|'option')`.
  - [x] Exactly one "does not also select the robot" double-fire test remains (merged per spec §1.7) —
    clicking a company radio option; the old separately-portal-focused test is gone, not duplicated.
  - [x] Every test outside the "company assignment" describe block (name/job/battery/docking/audio rendering,
    click/keyboard activation, avatar daylight-independence, accessible name, "not the Button primitive")
    passes unmodified.
  - [x] `git diff src/types/controls.ts src/components/ui/controls/RadioButton.tsx
    src/components/ui/controls/CabinetBox.tsx` is empty for this task.

  **Verification:**
  - [x] `npx vitest run src/components/selection/RobotSelectionCard.test.tsx` passes in full — confirmed
    genuinely RED first (all 20 tests failed, `buildCompanySelectSchema is not a function` — Task 1's own
    flagged fallout, since the component hadn't switched to the renamed function yet), then GREEN after the
    swap (20/20 passing). Non-fatal React `act(...)` warnings appear on 2 tests (Radix `ToggleGroup`'s async
    internals in jsdom) — no test failure, same class of warning other `RadioButton` consumers already emit.
  - [x] `npm run build:types` shows no error in `RobotSelectionCard.tsx`; still shows the expected one in
    `RobotDisplaySection.tsx` (Task 3 not yet landed).
  - [x] `npx eslint src/components/selection/RobotSelectionCard.tsx src/components/selection/RobotSelectionCard.test.tsx` — zero errors.
  - [ ] Manual check (deferred to Checkpoint A, once both consumers land — see below).

  **Dependencies:** Task 1.

  **Files:** `src/components/selection/RobotSelectionCard.tsx`, `src/components/selection/RobotSelectionCard.test.tsx`

  **Estimated scope:** S (2 files)

- [x] **Task 3: `RobotDisplaySection` — `Select` → `RadioButton`**

  **Description:** Same shape as Task 2, for the second call site. Per spec §1.1/§4/§5: full replacement of
  `RobotDisplaySection.tsx` — swap the `Select` import for `RadioButton`, rename the local
  `companySelectSchema` variable to `companyAssignmentSchema`, update the component's own top-of-file JSDoc
  (which describes "the company picker") to say RadioButton instead of Select. No change to
  `RobotDisplaySection.css`. `RobotDisplaySection` has no nested-clickable-parent concern the way
  `RobotSelectionCard` does — no `stopBubble`-equivalent exists or is needed here. Rewrite
  `RobotDisplaySection.test.tsx`'s "company assignment" describe block per spec §5: same
  `combobox`/`option` → `radio` query changes, same single-click interaction. Every test outside that describe
  block is unchanged.

  **Acceptance criteria:**
  - [x] `RobotDisplaySection.tsx` imports `RadioButton` from `@/components/ui/controls/RadioButton`, not
    `Select`.
  - [x] The company row renders `<RadioButton schema={companyAssignmentSchema} value={robot.companyId ??
    FREELANCE_VALUE} onChange={handleCompanyChange} />` — `handleCompanyChange`'s body is unchanged.
  - [x] The component's own top-of-file doc comment says "RadioButton" (converted by 10.5), not "Select."
  - [x] `RobotDisplaySection.css` is unmodified (`git diff` empty).
  - [x] `RobotDisplaySection.test.tsx`'s company-assignment tests use `getByRole('radio', { name: ... })` and
    `.getAttribute('aria-checked')`, never `getByRole('combobox'|'option')`.
  - [x] Every test outside the "company assignment" describe block (avatar daylight-independence, plain-text
    Name/Job/Battery/Docking rendering, "Unassigned" fallback, no job-reassignment/docking-override control,
    no `AudioSettingSection` controls) passes unmodified — including the "no job-reassignment or
    docking-override control" test, which queries `combobox`/`radio` scoped to `/job/i`/docking names and is
    unaffected by the company row's own control-type change.
  - [x] `git diff src/types/controls.ts src/components/ui/controls/RadioButton.tsx
    src/components/ui/controls/CabinetBox.tsx` is empty for this task.

  **Verification:**
  - [x] `npx vitest run src/components/robot/RobotDisplaySection.test.tsx` passes in full — confirmed
    genuinely RED first (all 9 tests failed on the same `buildCompanySelectSchema is not a function` cause),
    then GREEN after the swap (9/9 passing).
  - [x] `npm run build:types` — zero errors anywhere in the repo (both consumers now resolve
    `buildCompanyAssignmentSchema`; `Select.tsx` itself still compiles standalone).
  - [x] `npx eslint src/components/robot/RobotDisplaySection.tsx src/components/robot/RobotDisplaySection.test.tsx` — zero errors.
  - [x] Manual check — see Checkpoint A below.

  **Dependencies:** Task 1. Independent of Task 2 — safe to implement before, after, or in parallel with it.

  **Files:** `src/components/robot/RobotDisplaySection.tsx`, `src/components/robot/RobotDisplaySection.test.tsx`

  **Estimated scope:** S (2 files)

### Checkpoint A: Both consumers ship — `Select` now fully orphaned but not yet deleted
- [x] `npm run build:types` — zero errors anywhere.
- [x] `npm run lint` — zero errors.
- [x] `npm test` (full suite) — 2136/2138 passing. The 2 remaining failures
  (`audioRigConfig.test.ts`'s slider-orientation-classification case and `AudioRigDrawer.test.tsx`'s
  3-Band-EQ row-orientation case) are confirmed pre-existing and unrelated: reproduced identically with this
  phase's changes `git stash`ed, so present on the branch before Tasks 2/3 started — the same 2 cases the
  `AccordionContainer` (11.1.7) plan already recorded as pre-existing. `Select.test.tsx` is still present and
  still green — it tests the primitive in isolation, not its (now nonexistent) call sites.
- [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
- [x] `grep -rn "buildCompanySelectSchema" src/` returns only 2 hits, both inside doc comments that
  historically reference the old name (`companyConfig.ts`'s own function doc, `controls.ts`'s `SelectSchema`
  doc) — no real import/call site remains; `grep -rln "from '@/components/ui/controls/Select'" src/` returns
  nothing. Confirms both real consumers are fully converted.
- [x] Manual check, both call sites (spec §5's manual-check list) — **confirmed by Crawford directly against
  the running app.** (Performed after the RadioButton hover-pop addition landed too — see that separate
  commit — so the check also covers the hover behavior on both call sites, beyond the original list below.)
  1. Company row renders as a `RadioButton` pill row (Freelance, then companies) at both the Robot Selection
     hub tile's card list and an individual robot's Robot Options detail page — no click-to-open step.
  2. The currently-assigned company (or Freelance) shows popped/accent-tinted.
  3. Clicking a different option reassigns immediately, reflected without a reload/re-render glitch.
  4. On `RobotSelectionCard` specifically: clicking any company option does not also select/open that robot's
     detail page.
  5. With a locale seeded up to `MAX_COMPANIES` (6), the 7-option row wraps cleanly on the compact
     `RobotSelectionCard` with no layout break (confirms `RadioButton.css`'s existing `flex-wrap: wrap` is
     sufficient, no new CSS needed).
  6. Keyboard interaction (`Tab`, arrow keys, `Space`/`Enter`) works the same as `CompanyButtonRow` elsewhere.
- [x] Reviewed with human — confirmed good, proceeding to Task 4.
- [ ] Review with human before proceeding to Task 4 (the irreversible deletion step).

---

### Phase 3: Remove the now-dead primitive

- [x] **Task 4: Delete `Select`; remove `SelectSchema` from `controls.ts`/`.test.ts`**

  **Description:** Per spec §1.4/§4: delete `Select.tsx`, `Select.css`, `Select.test.tsx` outright (not
  deprecated, not kept-unused). In `src/types/controls.ts`: remove the `SelectSchema` interface and its doc
  comment, remove `| SelectSchema` from the `ControlSchema` union, remove `'select'` from
  `CONTROL_SCHEMA_TYPES`, and update that array's own doc comment from "all 15 variants" to "all 14
  variants." In `src/types/controls.test.ts`: remove the `SelectSchema` type import, remove the `select`
  fixture and its entry in the `variants` array, and update both count assertions (`toHaveLength`/`.size`)
  from `15` to `14`. This is the point where the Design System's live primitive count actually drops from 15
  to 14 (spec §1.4) — must land only after Task 2 and Task 3 (both real consumers must have stopped importing
  `Select` first, or this task breaks the build).

  **Acceptance criteria:**
  - [x] `src/components/ui/controls/Select.tsx`, `Select.css`, `Select.test.tsx` no longer exist.
  - [x] `SelectSchema` no longer exists anywhere in `src/types/controls.ts`; `ControlSchema`'s union no
    longer includes it.
  - [x] `CONTROL_SCHEMA_TYPES` has exactly 14 entries, does not include `'select'`, and its own doc comment
    says "14 variants."
  - [x] `controls.test.ts`'s two `CONTROL_SCHEMA_TYPES` assertions (`toHaveLength`, `new
    Set(...).size`) both read `14`; its sorted-list-equality assertion no longer includes `'select'`.
  - [x] `controls.test.ts` no longer imports `SelectSchema`; the `select` fixture and its entry in the
    `variants` array are gone; that describe block's `expect(variants).toHaveLength(...)` reads `14`.
  - [x] `grep -rn "SelectSchema\|'select'" src/types/controls.ts src/types/controls.test.ts` — zero hits, not
    even an unrelated one.
  - [x] `grep -rln "from '@/components/ui/controls/Select'\|from './Select'"` (and a broader
    `import.*Select` sweep, excluding `RadixSelect`) `src/` returns only false positives
    (`RobotSelectionCard`/`robotSelectionConfig` imports) — confirms no dangling reference to the deleted
    primitive survives anywhere.
  - [x] `CLAUDE.md` is **not** edited by this task (spec §1.5) — `git diff CLAUDE.md` empty, confirmed.
  - [x] `companyConfig.test.ts`'s "14 closed-set ControlSchema variants" describe-block string is **not**
    edited by this task (spec §1.6) — `git diff src/data/companyConfig.test.ts` empty, confirmed; it was
    already stale-but-coincidentally-worded-correctly before this task, and this task's own change (15→14)
    is what makes it genuinely accurate.

  **Verification:**
  - [x] `npx vitest run src/types/controls.test.ts` passes in full — confirmed genuinely RED first (2
    failures: `CONTROL_SCHEMA_TYPES` count and sorted-list assertions, both still expecting/containing
    `'select'` against the unmodified `controls.ts`), then GREEN after the removal (9/9 passing).
  - [x] `npm run build:types` — zero TypeScript errors anywhere in the repo.
  - [x] `npx eslint src/types/controls.ts src/types/controls.test.ts` — zero errors.
  - [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
  - [x] `npm test` (full suite) — 2132/2134 passing (down from 2139/2142 pre-deletion — the ~8-test drop is
    `Select.test.tsx`'s own coverage leaving with the file, no other suite affected). The 2 remaining
    failures are the same pre-existing/unrelated pair (`audioRigConfig.test.ts`,
    `AudioRigDrawer.test.tsx`) recorded at Checkpoint A; the separately-flagged flaky
    `factoryPlacementSystem.test.ts` case did not recur, consistent with it being order-dependent rather
    than caused by any change on this branch.

  **Dependencies:** Task 2, Task 3 (both must land first).

  **Files:** `src/components/ui/controls/Select.tsx` (deleted), `src/components/ui/controls/Select.css`
  (deleted), `src/components/ui/controls/Select.test.tsx` (deleted), `src/types/controls.ts`,
  `src/types/controls.test.ts`

  **Estimated scope:** M (5 files — 3 deletions + 2 edits)

### Checkpoint B: `Select` fully gone
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes
  (2132/2134, the same 2 pre-existing/unrelated failures as Checkpoint A).
- [x] Dangling-reference sweep (Task 4's own criterion) — zero real hits, only false-positive substring
  matches (`RobotSelectionCard` etc.).
- [x] Reviewed with human — confirmed good, proceeding to Task 5.

---

### Phase 4: Docs

- [x] **Task 5: `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, `docs/todo/roadmap.md`**

  **Description:** Per spec §6, three independent doc updates describing the now-shipped state:
  - `docs/COMPONENT_LIBRARY.md`: "All 15 live in…" → "All 14 live in…"; the `CONTROL_SCHEMA_TYPES` paragraph
    rewritten to record `select`'s addition (Phase 10) *and* removal (Phase 10.5), per the spec's exact
    wording; the `Select` table row removed; the `### Select (added Roadmap Phase 10)` subsection removed
    entirely.
  - `docs/COMPANIES.md`'s "Company Membership" section: the opening sentence, the "Radix `Select.Item`
    rejects an empty string" sentence, and the `stopPropagation`/portal paragraph all reworded per the
    spec's exact text (RadioButton instead of Select, no portal-specific reasoning, pointer to
    `docs/specs/COMPANY_ASSIGNMENT_RADIO.md` where relevant).
  - `docs/todo/roadmap.md`: new `## 10.5 Company Assignment: Select → RadioButton` section inserted after
    `## 10.4` and before `## 11`; `## 11.1.8`'s heading and opening paragraph replaced with a Cut notice
    (original content preserved below a `<details>` fold, mirroring `## 11`'s own established cut-record
    format); `## 11.1.9`'s "About" section and `## 11.2`'s "About" section each get the one-sentence
    correction spec §6 gives, since both were still-live forward-looking text that specifically described
    `Select` as in-scope future Cabinetry work.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` reads "All 14 live in…"; its `CONTROL_SCHEMA_TYPES` paragraph now
    records both `select`'s Phase 10 addition and Phase 10.5 removal; the primitives table has no `Select`
    row; the `### Select` subsection is gone. (One extra correction beyond the spec's own list, found while
    verifying: the "CSS tokens" section's closing sentence also referenced `Select` in the present tense —
    reworded to past tense, `Select` removed/`DirectionalPanel` confirmed instead.)
  - [x] `docs/COMPANIES.md`'s "Company Membership" section describes `RadioButton` as the current control
    throughout — every remaining mention of "Select" is explicitly historical/parenthetical context (`Select`
    through Phase 10, replaced by 10.5), not a description of current behavior; "14th primitive" and the
    Radix-empty-string rationale are gone, matching spec §6's own given text (which itself keeps "Select" in
    that same historical-context form — the task description's "no longer says Select" was a slight
    overstatement of the spec's actual wording, corrected here). (One extra fix beyond the spec's own list:
    the doc's own "Related docs" header line at the top also referenced `Select` in the present tense —
    updated to point at `RadioButton` with the same historical note.)
  - [x] `docs/todo/roadmap.md` has a new `## 10.5` section (Create/Restructure/About/Docs-style, matching
    spec §6's given markdown) between `## 10.4` and `## 11`.
  - [x] `## 11.1.8`'s heading reads `## 11.1.8 Oblique Cabinetry: Select — Cut`; its opening paragraph states
    it was cut before any implementation began (not reverted for a bug), links to `10.5`; its original
    Create/Restructure/About/Docs content is preserved verbatim inside a `<details>` fold below, matching
    `## 11`'s own cut-record format.
  - [x] `## 11.1.9`'s "About" section's "last of the 15 primitives" sentence is corrected to say 14 and to
    distinguish `Select`'s cut (11.1.8) from `Stepper`/`StepperWithToggle`'s own drop (11.1.1); the rest of
    that paragraph (about free text having no natural "popped" precedent) is unchanged, except its own
    `11.1.1–11.1.8` range corrected to `11.1.1–11.1.7` — `Select` (11.1.8) was cut, so it never actually
    contributed a click/value/open-keyed precedent for 11.1.9 to reference (an extra, logically-necessary
    correction in the same sentence, beyond the spec's own literal diff).
  - [x] `## 11.2`'s "About" section's `AccordionContainer`/`Select` clause is corrected — `Select`'s own
    accessibility-check bullet is dropped with a note that 11.1.8 was cut before it was ever built; the rest
    of that paragraph (the keyboard-walkthrough/focus-ring/`prefers-reduced-motion`/screen-reader checks) is
    unchanged.
  - [x] This roadmap's own pre-existing `## 10` section (Phase 10's original content, including its "Docs"
    checklist item recording the 13→14 `CLAUDE.md` update) is **not** rewritten — historical record, per
    spec §2's "explicitly not touched" list; confirmed by `grep`, every remaining `Select` mention inside
    `## 10`/`## 8`/`## 9` is original historical prose, untouched.
  - [x] `CLAUDE.md` is **not** edited (spec §1.5) — `git diff CLAUDE.md` empty, confirmed.
  - [x] `docs/specs/COMPANIES.md`, `docs/tasks/COMPANIES.md`, `docs/intent/companies.md` are **not** edited —
    confirmed via `git status`, none of the three appear.

  **Verification:**
  - [x] Manual review — every edited doc spot-checked against the actually-shipped code from Tasks 1–4 (not
    just against the spec's draft text).
  - [x] `npm run build:types`, `npx eslint .` clean (docs-only change, no source touched).

  **Dependencies:** Task 4.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, `docs/todo/roadmap.md`

  **Estimated scope:** M (3 files, docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npx eslint .`, `npm run build` all clean.
- [x] `npm test` full suite — 2131/2134 passing. 3 failures, all confirmed pre-existing/environmental, not
  caused by this branch (impossible for the docs-only Task 5 commit specifically, and independently
  reproduced in isolation for the code-touching tasks too): the same 2 `audioRigConfig.test.ts`/
  `AudioRigDrawer.test.tsx` cases recorded at every earlier checkpoint, plus a third, *different* flaky
  case each full run so far (`factoryPlacementSystem.test.ts` once, `audioSwells.test.ts` this time) that
  passes cleanly in isolation both times (33/33 and 65/65) — cross-file test-order/global-state flakiness
  in the existing suite, unrelated to `Select`/`RadioButton`/company assignment, worth flagging to Crawford
  as a separate pre-existing issue but out of scope for this task to chase down.
- [x] All acceptance criteria across all 5 tasks are met, including Checkpoint A's manual check (confirmed
  by Crawford directly).
- [x] `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, `docs/todo/roadmap.md` reflect the shipped
  feature; `CLAUDE.md` is untouched throughout (confirmed at Tasks 4 and 5, `git diff CLAUDE.md` empty both
  times).
- [ ] Not yet reviewed with Crawford — not ready for PR until Task 5's docs and this final checkpoint are
  both reviewed (Checkpoint A's manual check is already confirmed).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 1 deliberately leaves `RobotSelectionCard.tsx`/`RobotDisplaySection.tsx` type-broken until Tasks 2/3 land | Low within a single feature branch (never merged mid-plan), but a real risk if tasks are picked up out of order across sessions/agents | Task 1's own acceptance criteria explicitly call out and scope the expected breakage; Tasks 2/3 both declare their dependency on Task 1; this plan's own dependency graph makes the ordering explicit up front |
| Task 4 (deletion) is irreversible in the sense that a mistake here (e.g. deleting before both consumers actually stopped importing `Select`) breaks the build immediately and visibly | Low — `npm run build:types` fails loudly and immediately, no silent breakage possible | Task 4 explicitly depends on both Task 2 and Task 3; Checkpoint A (a full green build/test/manual pass) gates Task 4 from starting |
| The intent doc's own "13 primitives" claim could be implemented literally by mistake, under-removing (e.g. someone tries to also strip `DirectionalPanel`) | Low — spec §1.4 corrects this explicitly, and this plan's every relevant acceptance criterion says "14," never "13" | Task 4's/Task 5's acceptance criteria state the number as 14 throughout, with an explicit spec §1.4 citation, not left to the implementer to recompute |
| `CLAUDE.md`'s already-stale "14" (spec §1.5) gets "corrected" to 15 by an implementer who doesn't know it was already wrong, undoing the coincidence that makes it accurate again post-removal | Low–Medium — an easy mistake for anyone not reading spec §1.5 | Both Task 4 and Task 5 carry an explicit "`CLAUDE.md` is **not** edited" acceptance criterion with a `git diff` check, not just a passive absence from the files-touched list |
| Manual check (Checkpoint A) requires a running dev server / real browser, not available in every implementing session | Medium — same situation `AccordionContainer`'s own plan (11.1.7) hit; that manual check remained outstanding after implementation and was flagged for Crawford directly | Checkpoint A lists the manual check as a required gate before Task 4 (the irreversible deletion) starts, not deferred to the very end — if a session can't perform it, that must be flagged explicitly to Crawford before proceeding past Checkpoint A, the same way 11.1.7's plan flagged its own outstanding manual check rather than silently marking the checkpoint complete |

## Open Questions

Resolved during Plan (not left open):

- ~~Should the schema-builder rename land together with one of the consumer tasks, to avoid a
  temporarily-broken build?~~ **Resolved: no, it's its own first task** — `companyConfig.test.ts`'s own
  suite is independently green after Task 1 alone; the two consumer files' own broken imports are an
  expected, scoped, single-branch intermediate state (Task 1's own acceptance criteria say so explicitly),
  not a defect to design around.
- ~~Should Tasks 2 and 3 be combined into one task, since they're the same mechanical swap twice?~~
  **Resolved: no, kept separate** — matching this codebase's own established one-task-per-real-consumer
  precedent (`RadioButton`/`AccordionContainer`'s own plans), and because they're genuinely independent
  (no shared file, no ordering constraint between them beyond both needing Task 1).
- ~~Should the primitive deletion (Task 4) be split into "delete the files" and "remove the schema type" as
  two tasks?~~ **Resolved: no, one task** — each half is the other's precondition for a working build; per
  spec §1.4's "Boundaries" §3, splitting them would create a non-compiling intermediate commit.

Carried forward from spec §7, not blocking this plan:

1. **`CABINET_ACCORDION_TRIGGER_HEIGHT`-style visual/manual confirmation risk does not apply here** — this
   phase adds no new sizing constant and no new Cabinetry geometry; the only manual check this plan requires
   is Checkpoint A's behavioral/visual pass (7-option wrapping, selected-state styling, no double-fire),
   already scoped tightly in spec §5.
2. **Nothing here reopens `RadioButton`'s own 11.1.6 Cabinetry design** (box-per-option, state-keyed pop) —
   this plan adds two more call sites of an already-shipped, unmodified primitive, not a new `RadioButton`
   consumer shape. Carried forward from spec §7's own Forward Note, not actionable by this plan.
