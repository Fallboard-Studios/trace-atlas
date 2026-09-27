# Phase Spec: Company CRUD Buttons — Dynamic Preview Labels

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/company-crud-button-preview.md](../intent/company-crud-button-preview.md)
(confirmed via `/interview-me`, 2026-09-14). Builds on
[docs/specs/COMPANY_SECTION_ENHANCEMENTS.md](COMPANY_SECTION_ENHANCEMENTS.md) (Create/Delete, and the
`AccordionContainer` wrap) and Rename's own staged-draft + Submit button (shipped directly earlier the same
session, no separate spec — small enough in isolation not to need one; this phase now builds on it directly
enough to warrant one). One change, one file's worth of real logic
(`src/components/company/CompanyCrudControls.tsx`) — not independently landable sub-parts the way the prior
phase's four changes were, since all three buttons share the same "dynamic `humanLabel`, computed each
render" mechanism and the Rename button specifically depends on the same state (`renameDraft`) the
auto-suggestion behavior also touches.

---

## 1. Overview & Claude Explanation

### 1.1 The shared mechanism

All three buttons' `ButtonSchema`s (`CREATE_COMPANY_SCHEMA`, `RENAME_COMPANY_SCHEMA`,
`DELETE_COMPANY_SCHEMA` — all static, unchanged, in `companyConfig.ts`) get a per-render clone with a
computed `humanLabel`, passed to `<Button>` in place of the static import — the same "schema clone with one
field overridden" pattern `CompanyCrudControls.tsx` already uses for `CREATE_NAME_SCHEMA`/
`RENAME_NAME_SCHEMA` (module-level, since those don't depend on state) and `RobotSelectionCard.tsx`'s own
`batteryReadoutSchema` (per-render, since that one does). No change to `companyConfig.ts` itself — every
schema's own `loreLabel`/`id`/`type` stays exactly as-is; `humanLabel` on the *clone* is the only thing that
varies.

`Button.tsx` needs zero changes to make this work: `resolveAccessibleName(schema)` (`schema.humanLabel ??
schema.loreLabel ?? schema.id`) already drives `aria-label`, and `<DualLabel humanLabel={schema.humanLabel}
… />` already drives the visible text — both read `schema.humanLabel` directly, so a dynamic value on the
clone flows through to both the accessible name and the visible label automatically, with no new prop, no
new component logic. This is what makes "accessible name tracks the visible text" (confirmed in interview)
free rather than a second thing to wire up.

### 1.2 Create button

```typescript
// CompanyCrudControls() — NEW, alongside the existing nameIsBlank
const createLabel = nameIsBlank
  ? CREATE_COMPANY_SCHEMA.humanLabel
  : `${CREATE_COMPANY_SCHEMA.humanLabel} ${createNameDraft}`;
const createSchema = { ...CREATE_COMPANY_SCHEMA, humanLabel: createLabel };
```

```tsx
// JSX — MODIFIED, schema prop only
<Button schema={createSchema} onClick={handleCreate} disabled={atCap || nameIsBlank} />
```

The raw draft (`createNameDraft`, not `.trim()`'d) is interpolated — "as entered," per the intent doc — the
same way `nameIsBlank`'s own `.trim().length === 0` check already treats a whitespace-only draft as blank
without altering what gets displayed once it's non-blank. No change to `atCap`/`nameIsBlank`-driven
`disabled` logic, and no change to what `handleCreate` actually submits (`createNameDraft.trim()`, already
trimmed at the commit point).

### 1.3 Rename button

Two independent-but-related changes to the *already-shipped* staged-draft behavior (not this phase's own
new mechanism — the draft/Submit button itself already exists):

**(a) The draft auto-suggests instead of pre-filling the current name.** Confirmed explicitly in the
intent's own original ask, not a judgment call: selecting a company (or switching to a different one) sets
`renameDraft` to a fresh `suggestCompanyName()` result — the exact same generator `createNameDraft` already
uses — never `selectedCompany.name`. The existing "reset only on an actual id change, not an unrelated
update to the same company" guard (tracked via `lastSeenSelectedCompanyId`, not the resolved `Company`
object) is unaffected — only *what* the reset sets the draft to changes, not *when* it resets:

```typescript
// CompanyCrudControls() — MODIFIED (both the initial useState and the render-time reset)
const [renameDraft, setRenameDraft] = useState(() => (selectedCompany ? suggestCompanyName() : ''));
const [lastSeenSelectedCompanyId, setLastSeenSelectedCompanyId] = useState(selectedCompanyId);
if (selectedCompanyId !== lastSeenSelectedCompanyId) {
  setLastSeenSelectedCompanyId(selectedCompanyId);
  setRenameDraft(selectedCompany ? suggestCompanyName() : '');
}
```

**(b) A successful submit re-rolls the draft**, mirroring `handleCreate`'s own `setCreateNameDraft(suggestCompanyName())`
reroll exactly:

```typescript
// CompanyCrudControls() — MODIFIED, one new line
const handleRenameSubmit = () => {
  if (!selectedCompany) return;
  useLocaleStore.getState().updateCompany(localeId, selectedCompany.id, { name: renameDraft.trim() });
  setRenameDraft(suggestCompanyName()); // NEW
};
```

**(c) The dynamic label itself:**

```typescript
// CompanyCrudControls() — NEW, alongside the existing renameIsBlank/renameUnchanged
const renameLabel = renameIsBlank
  ? RENAME_COMPANY_SCHEMA.humanLabel
  : `${RENAME_COMPANY_SCHEMA.humanLabel} ${selectedCompany?.name ?? ''} > ${renameDraft}`;
const renameSchema = { ...RENAME_COMPANY_SCHEMA, humanLabel: renameLabel };
```

`renameIsBlank` (`renameDraft.trim().length === 0`) already coincides with "nothing selected," since the
draft is forced to `''` on deselect by (a) above — no separate `!selectedCompany` branch is needed in the
condition itself; `selectedCompany?.name ?? ''` in the *true* branch is defensive typing, not a reachable
`''` case in practice (TypeScript can't otherwise prove `selectedCompany` is defined whenever
`!renameIsBlank`, even though it always is by construction). `RENAME_NAME_SCHEMA` — the `TextInput`'s own
schema (`humanLabel: 'Rename Company'`), a separate field from the button's own `RENAME_COMPANY_SCHEMA`
(`humanLabel: 'Rename'`) — is untouched; only the *button's* label becomes dynamic.

```tsx
// JSX — MODIFIED, schema prop only
<Button
  schema={renameSchema}
  onClick={handleRenameSubmit}
  disabled={!hasSelectedCompany || renameIsBlank || renameUnchanged}
/>
```

`renameUnchanged`'s own existing definition (`renameDraft.trim() === selectedCompany?.name`) needs no
change — it stays a defensive no-op guard, effectively unreachable now that the draft auto-generates to
differ from the current name, but still correct if a suggestion ever coincidentally collides (company names
aren't required unique — see Constraints).

### 1.4 Delete button

```typescript
// CompanyCrudControls() — NEW
const deleteLabel = selectedCompany
  ? `${DELETE_COMPANY_SCHEMA.humanLabel} ${selectedCompany.name}`
  : DELETE_COMPANY_SCHEMA.humanLabel;
const deleteSchema = { ...DELETE_COMPANY_SCHEMA, humanLabel: deleteLabel };
```

```tsx
// JSX — MODIFIED, schema prop only
<Button schema={deleteSchema} onClick={handleDelete} disabled={!hasSelectedCompany} />
```

No change to `handleDelete` or its own `disabled` condition — label text only.

### 1.5 Judgment calls made while translating intent into a concrete design

Per this skill's "surface assumptions immediately" step — none of these were asked during `/interview-me`:

1. **Existing test queries move from an exact accessible name to a stable-prefix regex.** Every template is
   `"{HumanLabel}"` or `"{HumanLabel} {content}"` — the static word is always a prefix of the dynamic
   string. `screen.getByRole('button', { name: 'Create' })` (exact match) breaks the instant a draft is
   non-blank, which — given Create autofills a suggestion on mount — is effectively *immediately*, not an
   edge case. Every such query across `CompanyCrudControls.test.tsx` moves to a prefix regex, e.g. `name:
   /^create\b/i`, `/^rename\b/i`, `/^delete\b/i` — see §5 for the full list of affected tests. This is the
   natural, idiomatic Testing-Library fix for a label that gained a dynamic suffix without changing its own
   stable prefix; no `data-testid` or other escape hatch is introduced (this codebase doesn't use them
   elsewhere for role-queryable elements, and a regex keeps the tests asserting against the same accessible
   name real users/screen readers see, which is the point of querying by role/name in the first place).
2. **`createSchema`/`renameSchema`/`deleteSchema` are plain per-render object literals, not
   `useMemo`'d.** They're cheap (one spread, one string), `Button` isn't itself `React.memo`'d, and
   `CabinetBox`'s own `timelineKey` doesn't depend on schema identity (it's `` `cabinet-button-${schema.id}-${instanceId}` ``
   — `schema.id` is unchanged, `instanceId` is `useId()`-derived) — so a fresh object each render costs
   nothing and doesn't disturb any GSAP/timeline machinery. Consistent with `RobotSelectionCard.tsx`'s own
   `batteryReadoutSchema`, an existing precedent for exactly this per-render-clone shape.
3. **The dynamic label always derives from the schema constant's own `humanLabel`** (`` `${CREATE_COMPANY_SCHEMA.humanLabel} …` ``),
   never a hardcoded literal — so `"Create"`/`"Rename"`/`"Delete"` each have exactly one source of truth
   (`companyConfig.ts`), matching this codebase's own general aversion to duplicated literal values
   ([docs/DUPLICATE_VALUE_AUDIT.md](../DUPLICATE_VALUE_AUDIT.md) tracks exactly this class of bug
   elsewhere).

---

## 2. Target File Structure

```text
src/
└── components/
    └── company/
        ├── CompanyCrudControls.tsx      # MODIFIED — §1.2, §1.3, §1.4
        └── CompanyCrudControls.test.tsx # MODIFIED — see §5
```

**Explicitly not touched, and why:**

- `src/data/companyConfig.ts` / `.test.ts` — `CREATE_COMPANY_SCHEMA`/`RENAME_COMPANY_SCHEMA`/
  `DELETE_COMPANY_SCHEMA` stay exactly as shipped; only per-render *clones* inside
  `CompanyCrudControls.tsx` vary `humanLabel`. Nothing about the schema constants' own shape changes.
- `src/components/ui/controls/Button.tsx` / `.test.ts` — already reads `schema.humanLabel` for both the
  accessible name and the visible label; needs no new prop, no new logic, per §1.1.
- `src/components/ui/controls/DualLabel.tsx`, `src/components/ui/controls/accessibleName.ts` — reused
  completely as-is.
- `CompanyManager.tsx`, `CompanyButtonRow.tsx`, `CompanyOptionsSection.tsx` — untouched; this phase is
  scoped entirely inside `CompanyCrudControls.tsx`'s own three buttons.
- `docs/COMPONENT_LIBRARY.md` — `Button`'s documented contract (`humanLabel: string`) doesn't change; a
  consumer computing that string dynamically isn't a new contract shape.

No new dependency. No file is renamed. No new CSS.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`loreLabel` is untouched on all three schemas** — only the per-render clone's `humanLabel` varies;
  `id`/`type`/`loreLabel` are copied through unchanged via the object spread.
* **Accessible name must track the visible text exactly, on all three buttons** — no divergence between
  what `aria-label` announces and what the `DualLabel` shows, confirmed in interview against WCAG 2.5.3
  Label in Name. This falls out for free per §1.1; do not add a separate, stable `aria-label` override that
  would defeat it.
* **No change to Create's or Delete's underlying commit/disabled logic** (`atCap`, `nameIsBlank`,
  `hasSelectedCompany`, `handleCreate`, `handleDelete`) — this phase changes label text computed *from*
  that existing state, never the state or the gating logic itself.
* **No change to Rename's existing disabled-guard logic** (`renameIsBlank`, `renameUnchanged`,
  `hasSelectedCompany`) or to the "reset only on an id change, not an unrelated same-company update" guard
  (`lastSeenSelectedCompanyId`) — both stay exactly as shipped; only *what value* the reset assigns to
  `renameDraft` changes (§1.3a), and one new line reroll after submit (§1.3b).
* **No new uniqueness enforcement** for Rename's auto-suggested draft against any other company's name, or
  the currently-selected company's own name — company names aren't required unique elsewhere in this app
  (unlike `color`), and this phase doesn't introduce that requirement. The existing `renameUnchanged` guard
  is the only collision handling, and only for the coincidental-exact-match case.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** — every change here is synchronous derived
  state (label strings) or a plain function call (`suggestCompanyName()`), no new timing concern
  whatsoever.
* **No new `timelineMap` key** — `CabinetBox`'s existing `timelineKey` (`` `cabinet-button-${schema.id}-${instanceId}` ``)
  is unaffected; `schema.id` doesn't change on any of the three clones.

---

## 4. Code Style & Architecture Conventions

All three buttons' full code shapes are given inline in §1.2–§1.4 above — not repeated here.

**Naming conventions:** `createLabel`/`renameLabel`/`deleteLabel` for the computed strings,
`createSchema`/`renameSchema`/`deleteSchema` for the clones carrying them — mirrors this file's own
existing `nameIsBlank`/`renameIsBlank`/`renameUnchanged` naming register (a derived-value name describing
what it *is*, not how it's computed).

**Formatting:** Matches `CompanyCrudControls.tsx`'s existing style exactly — no reformatting beyond the
lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocated — `CompanyCrudControls.test.tsx`, matching §2.
* **Global query-pattern change (§1.5 item 1):** every existing `screen.getByRole('button', { name: 'Create' })`,
  `{ name: 'Rename' }`, and `{ name: 'Delete' }` call in this file — across every existing `it`/`describe`
  block, including the `color generation` and `CRUD accordion` sub-`describe`s — moves to a prefix regex
  (`/^create\b/i`, `/^rename\b/i`, `/^delete\b/i` respectively). This is a mechanical find-and-replace in
  effect, but every call site needs checking individually, since a couple assert `.disabled` on the queried
  element rather than clicking it, and the regex must still resolve to exactly one match in each test's own
  fixture setup (verify no test's fixture accidentally creates a second button whose label also starts with
  the same word).
* **New: Create button label.**
  - Draft blank/whitespace-only (e.g. right after clearing the autofilled suggestion): button's accessible
    name and visible text are both exactly `"Create"`.
  - Draft non-blank: both are exactly `` `Create ${draft}` `` (assert with the literal current draft value,
    not a substring match, to catch a wrong separator/casing/extra-space regression).
* **New: Rename button label and auto-suggested draft.**
  - Selecting a company pre-fills the draft with a *generated* name (assert the input's own value is a
    two-word "Adjective Noun" string, matching the existing `suggestCompanyName` shape-assertion this file's
    `it("Create's name input pre-fills with a generated \"Adjective Noun\" suggestion", …)` test already
    uses for Create), and asserts that value is **not** equal to the selected company's own `name` — proving
    it's a fresh suggestion, not the current name (regression guard for the exact behavior this phase
    changes).
  - Immediately after selecting a company (draft auto-filled, nothing typed yet): button reads exactly
    `` `Rename ${company.name} > ${autoFilledDraft}` `` — read the actual rendered draft value out of the
    input first, then assert the button's label was built from that same value, rather than hardcoding an
    expected suggestion string (the suggestion itself is `Math.random()`-fed and not asserted-exact
    elsewhere in this file either).
  - Editing the draft further updates the button's label to match the newly-typed value, live (no submit
    needed to see the preview) — matches Create's own existing "no live store write, but the local draft
    state drives the label directly" behavior.
  - Draft edited back to blank: button's accessible name and visible text both revert to exactly
    `"Rename"`.
  - Clicking Rename (a non-blank, changed draft): after the click, (1) `updateCompany` was called with the
    pre-click draft's trimmed value (existing coverage, query updated per the global change above), (2) the
    rename input's own value is a *new* generated suggestion, different from what was just submitted, (3)
    the button's own label now reads `` `Rename ${justCommittedName} > ${newSuggestion}` `` — i.e. the
    "always two different names" property holds immediately after submit, not just before it.
* **New: Delete button label.**
  - No company selected: button's accessible name and visible text are both exactly `"Delete"`.
  - Company selected: both are exactly `` `Delete ${company.name}` ``.
  - Selecting a *different* company updates the label to that company's own name (no stale name left over
    from the previous selection).
* **Every pre-existing test in this file must keep passing**, behavior-preserving beyond the query-pattern
  change in §5's second bullet — no existing assertion's *intent* changes, only how the target button is
  located.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open the Robots tile, expand "Manage Companies."
  Confirm: (1) Create's button reads "Create" only while the name field is genuinely empty, and the
  autofilled suggestion on load/after-create means this is rarely seen; (2) selecting a company shows two
  visibly different names on the Rename button immediately, with no typing required; (3) typing in the
  Rename field live-updates the button's own label; (4) submitting a rename immediately shows a fresh
  "OldName > NewSuggestion" pair, never "OldName > OldName"; (5) Delete's button names the selected company
  and reverts to plain "Delete" when deselected; (6) a long user-typed or generated name doesn't visibly
  break the button's layout in a way that looks broken (not fixing any such issue found here — flag it if
  seen, per §1's own Out of Scope on truncation).

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** none needed — `Button`'s documented `humanLabel: string` contract
  is unchanged; a consumer supplying a computed string isn't a new contract shape worth a doc line (unlike
  `RadioButton`'s own optional `color` field in the prior phase, which *was* a new field on the schema
  type itself).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/company-cleanup` (current branch) — this is a direct continuation of the
  session's own company-cleanup work, not a new feature line.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences.
  Given the single-file scope and the three buttons' shared mechanism, one commit is reasonable rather than
  three near-identical ones; split only if implementation finds a natural seam (e.g. Rename's
  auto-suggestion/reroll behavior change lands separately from all three labels' own display logic).

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left
open):

- ~~Does the accessible name track the dynamic visible text, or stay fixed?~~ **Resolved: tracks it, on all
  three buttons** (intent doc, confirmed via interview).
- ~~Does Create's dynamic label include the static word "Create," or just the raw name?~~ **Resolved:
  includes it — `` `Create {draft}` ``, matching Rename's and Delete's own template shape** (intent doc,
  corrected mid-interview).
- ~~Does Rename's draft re-roll after a successful submit?~~ **Resolved: yes, mirroring Create's own
  post-submit reroll** (intent doc, confirmed via interview).
- ~~Does selecting a company pre-fill Rename's draft with the current name or a fresh suggestion?~~
  **Resolved: a fresh suggestion, never the current name** (intent doc, explicit in the original ask).

Still open — flag for Tasks, not blocking this spec:

1. **Long-name layout/overflow on the button face** (§1's own Out of Scope, intent doc) — a user-typed or
   generated name long enough to visually crowd or overflow the button isn't specifically handled here.
   `Button.css`'s `width: fit-content` means the button simply grows; no wrapping/truncation/max-width rule
   exists today for this content. Worth a look during the manual check (§5); not assumed to be a problem,
   not assumed to be fine either.
2. **Whether one commit or a Rename-behavior/label-display split better matches Crawford's own preference**
   (§6) — left as an implementation-time call given how small and shared the actual diff is expected to be.
