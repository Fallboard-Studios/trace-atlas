# Implementation Plan: Company CRUD Buttons — Dynamic Preview Labels

Source spec: [docs/specs/COMPANY_CRUD_BUTTON_PREVIEW.md](../specs/COMPANY_CRUD_BUTTON_PREVIEW.md). Source
intent: [docs/intent/company-crud-button-preview.md](../intent/company-crud-button-preview.md). One real
file's worth of logic (`src/components/company/CompanyCrudControls.tsx`) plus its own test file — four
tasks, all touching those same two files, so sequenced rather than parallelized (see Architecture
Decisions).

## Overview

Give all three CRUD buttons (Create, Rename, Delete) a dynamic `humanLabel`, computed each render from
component state, so each button previews exactly what clicking it will do — "Create Glass Crew," "Rename
Iron Consortium > Null Wisp," "Delete Iron Consortium" — via the same per-render schema-clone pattern this
file already uses elsewhere. Rename's own staged draft additionally changes from pre-filling the selected
company's current name to auto-generating a fresh suggested name (never the current name), and re-rolls to
a new suggestion after a successful submit, so the button always previews two different names.

## Architecture Decisions

- **All four tasks touch the same two files** (`CompanyCrudControls.tsx` and its own `.test.tsx`) — no task
  in this plan is parallelizable against another without merge friction. Sequenced strictly in the order
  below, same "small shared file, land one at a time" reasoning
  [docs/tasks/COMPANY_SECTION_ENHANCEMENTS.md](COMPANY_SECTION_ENHANCEMENTS.md)'s own Tasks 4/6 used for
  their shared `CompanyCrudControls.tsx`/`companyConfig.ts` files.
- **Rename's draft-behavior change (Task 1) lands before Rename's label (Task 3), not after.** The label
  itself would still compile and render against the *old* pre-fill-with-current-name behavior — nothing
  about computing `renameLabel` strictly requires Task 1 first — but landing the behavior change first means
  Task 3's own tests exercise the label against its final, correct draft-generation logic from the start,
  rather than needing a follow-up update once Task 1 lands. It's also the one task in this plan that changes
  actual behavior (not just display), so doing it first surfaces any surprise in the existing staged-draft
  logic (`lastSeenSelectedCompanyId` tracking, the `renameUnchanged` guard) earliest, while it's cheapest to
  adjust.
- **Create's label (Task 2) and Delete's label (Task 4) are each fully independent of every other task** —
  both read only their own existing, already-shipped state (`nameIsBlank`/`createNameDraft` for Create;
  `selectedCompany` for Delete). Placed on either side of Rename's own two tasks so the plan reads as
  "establish the shared pattern on the simplest case (Create) → do Rename's real behavior change → apply the
  same pattern to Rename's label → apply it once more to Delete" rather than because of any real ordering
  requirement between them.
- **No CSS task.** Confirmed directly with Crawford: labels are allowed to wrap — the three buttons are each
  already in their own row (`.company-crud-controls__create`/`__rename` each hold one `TextInput` + one
  `Button`; Delete is a standalone child of the column-flex `.company-crud-controls`), and a grep of
  `Button.css`/`DualLabel.css`/`CabinetBox.css` found no `white-space: nowrap` or other rule that would force
  a long label onto one line or clip it — default CSS text wrapping already applies. This closes the spec's
  own Open Question 1 without any code change; each label task's own manual-check step confirms it holds up
  visually rather than assuming it from the grep alone.

## Dependency Graph

```
Task 1 (Rename draft — auto-suggest on selection, reroll after submit)
    │
    └──→ Task 3 (Rename button — dynamic label)

Task 2 (Create button — dynamic label) — fully independent

Task 4 (Delete button — dynamic label) — fully independent

All four share CompanyCrudControls.tsx/.test.tsx — sequence, don't parallelize, against each other
regardless of the dependency graph above.
```

## Task List

### Phase 1: Foundation

- [x] **Task 1: Rename's draft — auto-suggest on selection, reroll after submit**

  **Description:** Replace the staged Rename draft's pre-fill value (currently the selected company's
  *current* `name`, both on initial selection and on the existing `lastSeenSelectedCompanyId`-tracked reset)
  with a fresh `suggestCompanyName()` result — the same generator `createNameDraft` already uses. Add one
  new line to `handleRenameSubmit`: after `updateCompany` commits, re-roll the draft to another fresh
  suggestion, mirroring `handleCreate`'s own existing `setCreateNameDraft(suggestCompanyName())` reroll. No
  label/display work in this task — `RENAME_NAME_SCHEMA`'s own `humanLabel` ("Rename Company," the
  `TextInput`'s field label) and the button's own label are both untouched here.

  **Acceptance criteria:**
  - [x] `renameDraft`'s initial value and its value immediately after selecting any company are both a
        generated "Adjective Noun" string — never equal to that company's own current `name` (assert
        inequality directly, not just shape, as the regression guard for what this task changes).
  - [x] Switching to a *different* selected company resets the draft to a **new** fresh suggestion (not the
        previous draft, not either company's current name).
  - [x] An unrelated update to the *same* selected company (e.g. `updateCompany` changing `color`, not
        `name`) does **not** reset the draft — existing `lastSeenSelectedCompanyId`-based guard, unaffected
        by this task, still holds (this is regression coverage, not new behavior).
  - [x] After a successful `handleRenameSubmit` call, the draft holds a **new** generated suggestion,
        different from the just-committed name.
  - [x] `renameIsBlank`/`renameUnchanged`/`hasSelectedCompany` and the Submit button's own `disabled`
        expression are all untouched — still exactly their current logic.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/company/CompanyCrudControls.tsx`, `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** S (1 component + its test, two small logic changes in already-existing functions)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [x] Rename's draft always shows a generated suggestion, distinct from the selected company's current name,
      at every point in its lifecycle (selection, switching selection, post-submit) — no button-label work
      yet, so this is verified against the input field's own value, not the button.
- [ ] Review with human before proceeding. *(Crawford pre-authorized running all 4 tasks sequentially before
      this doc was updated — flagging this box as the actual human-review point, now that it's done.)*

---

### Phase 2: Dynamic Labels

- [x] **Task 2: Create button — dynamic label**

  **Description:** Compute `createLabel` (`nameIsBlank ? CREATE_COMPANY_SCHEMA.humanLabel :
  \`${CREATE_COMPANY_SCHEMA.humanLabel} ${createNameDraft}\``) and a per-render `createSchema` clone
  carrying it (spec §1.2); pass `createSchema` to the existing `<Button>` in place of the static
  `CREATE_COMPANY_SCHEMA` import. Establishes the shared "schema clone with a computed `humanLabel`"
  pattern the other two button tasks reuse.

  **Acceptance criteria:**
  - [x] Draft blank/whitespace-only: the button's accessible name (`aria-label`) and visible text are both
        exactly `"Create"`.
  - [x] Draft non-blank: both are exactly `` `Create ${createNameDraft}` `` — the raw, untrimmed draft (matches
        `nameIsBlank`'s own trim-only-for-the-blank-check convention; what's displayed once non-blank is
        "as typed," not re-trimmed).
  - [x] `CREATE_COMPANY_SCHEMA`, `atCap`, `nameIsBlank`, and `handleCreate`'s own committed value
        (`createNameDraft.trim()`) are all untouched.
  - [x] Every existing test in this file that locates the Create button by its old exact accessible name
        (`screen.getByRole('button', { name: 'Create' })`) is updated to a stable-prefix regex
        (`name: /^create\b/i`) — since the draft is non-blank immediately on mount (an autofilled
        suggestion), the exact-match query would otherwise break every such test, not just new ones.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` passes, including every
        pre-existing Create test (query updated, assertions' own intent unchanged) plus the new label
        assertions above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/company/CompanyCrudControls.tsx`, `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** S (1 component + its test, one computed value + one schema clone + existing-query migration)

- [x] **Task 3: Rename button — dynamic label**

  **Description:** Compute `renameLabel` (`renameIsBlank ? RENAME_COMPANY_SCHEMA.humanLabel :
  \`${RENAME_COMPANY_SCHEMA.humanLabel} ${selectedCompany?.name ?? ''} > ${renameDraft}\``) and a per-render
  `renameSchema` clone carrying it (spec §1.3c); pass `renameSchema` to the existing Submit `<Button>` in
  place of the static `RENAME_COMPANY_SCHEMA` import. Builds directly on Task 1's draft behavior — the label
  reads `renameDraft` and `selectedCompany.name`, whichever Task 1's own logic currently has them set to.

  **Acceptance criteria:**
  - [x] Nothing selected, or draft manually cleared to blank/whitespace: accessible name and visible text
        are both exactly `"Rename"`.
  - [x] Draft non-blank (the common case, given Task 1's auto-suggestion): both are exactly
        `` `Rename ${selectedCompany.name} > ${renameDraft}` ``, read from the actual rendered values, not a
        hardcoded suggestion string.
  - [x] Editing the draft further (typing) updates the label live, with no click/submit required to see the
        preview.
  - [x] Immediately after a successful submit, the label reads `` `Rename ${justCommittedName} > ${newSuggestion}` ``
        — the "always two different names" property holds on the very next render, not just before submit.
  - [x] `RENAME_NAME_SCHEMA`'s own `humanLabel` ("Rename Company," the `TextInput` field's own label) is
        unchanged — only the *button's* label is dynamic.
  - [x] Every existing test locating the Rename button by its old exact accessible name
        (`screen.getByRole('button', { name: 'Rename' })`) is updated to `name: /^rename\b/i`.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` passes, including every
        pre-existing Rename Submit test (query updated) plus the new label assertions above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (the draft's own generation/reroll behavior must be in place first — see
  Architecture Decisions).

  **Files:** `src/components/company/CompanyCrudControls.tsx`, `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** S (1 component + its test, one computed value + one schema clone + existing-query migration)

- [x] **Task 4: Delete button — dynamic label**

  **Description:** Compute `deleteLabel` (`selectedCompany ? \`${DELETE_COMPANY_SCHEMA.humanLabel}
  ${selectedCompany.name}\` : DELETE_COMPANY_SCHEMA.humanLabel`) and a per-render `deleteSchema` clone
  carrying it (spec §1.4); pass `deleteSchema` to the existing `<Button>` in place of the static
  `DELETE_COMPANY_SCHEMA` import.

  **Acceptance criteria:**
  - [x] No company selected: accessible name and visible text are both exactly `"Delete"`.
  - [x] Company selected: both are exactly `` `Delete ${selectedCompany.name}` ``.
  - [x] Selecting a *different* company updates the label to that company's own name — no stale name left
        from the previous selection.
  - [x] `handleDelete` and its own `disabled` condition (`!hasSelectedCompany`) are untouched.
  - [x] Every existing test locating the Delete button by its old exact accessible name
        (`screen.getByRole('button', { name: 'Delete' })`) is updated to `name: /^delete\b/i` — every such
        test selects a company first, so the exact-match query breaks the same way Create's did.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` passes, including every
        pre-existing Delete test (query updated) plus the new label assertions above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/company/CompanyCrudControls.tsx`, `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** S (1 component + its test, one computed value + one schema clone + existing-query migration)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite — 141 files, 2520 tests), `npm run build`
      all clean.
- [x] All acceptance criteria across all 4 tasks are met.
- [ ] Manual check (not automated): `npm run dev`, open the Robots tile, expand "Manage Companies." *(Not
      run this session — no live browser available. Genuinely open, not assumed.)*
  - [ ] Create reads "Create" only while the field is genuinely empty; the autofilled suggestion on
        load/after-create means this is rarely seen in practice.
  - [ ] Selecting a company shows two visibly different names on the Rename button immediately, no typing
        required; typing further live-updates it; submitting immediately shows a fresh
        "OldName > NewSuggestion" pair.
  - [ ] Delete names the selected company and reverts to plain "Delete" when deselected.
  - [ ] A long user-typed or generated name **wraps** onto a second line within the button's own row rather
        than overflowing/clipping — confirms the Architecture Decisions' "no CSS task needed" call was
        right; if it doesn't hold up visually, flag it rather than silently patching CSS not scoped by this
        plan.
- [ ] Ready for human review / commit.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing test queries (`getByRole('button', { name: 'Create' })` etc.) silently pass for the wrong reason after being changed to a regex (e.g. a too-loose regex matching an unintended second element) | Medium — a passing suite that isn't actually testing what it claims | Each task's own acceptance criteria require the *new* label-content assertions alongside the query migration, not just a query fix in isolation; a too-loose regex would still need to coexist with an exact-string content assertion elsewhere in the same test file, making a silent false-pass unlikely to survive the full task |
| Task 3 lands before Task 1 by mistake (e.g. parallel agents, or a rebase), computing `renameLabel` against the old pre-fill-with-current-name behavior | Low — still compiles and renders, just doesn't fulfill "always two different names" until Task 1 also lands | Explicit `Dependencies: Task 1` on Task 3; both tasks touch the same file anyway, so landing them out of order isn't silently possible without a merge conflict surfacing first |
| A generated or user-typed name long enough to visually crowd the button's own row, even while wrapping correctly (e.g. pushing the row taller than its neighbors expect) | Low — cosmetic only, no functional break | Explicitly checked in the Phase 2 checkpoint's manual-check step; not assumed fine from the CSS grep alone (Architecture Decisions) |

## Open Questions

None carried forward — the spec's own Open Question 1 (long-name layout) was resolved directly with
Crawford before this plan was written (Architecture Decisions); Open Question 2 (one commit vs. a
behavior/display split) is answered by this plan's own task boundaries — four commits, one per task, in the
order above, rather than a single combined commit.
