# Intent: Company CRUD Buttons — Dynamic Preview Labels

Confirmed via `/interview-me` on 2026-09-14. Extends `CompanyCrudControls.tsx`'s Create/Rename/Delete
buttons (Create and Delete shipped in [Company Section Enhancements](company-section-enhancements.md);
Rename's own staged-draft + Submit button shipped just before this intent, same session) so each button's
own visible label previews exactly what clicking it will do, instead of a static verb — "Create Glass
Crew," "Rename Iron Consortium > Null Wisp," "Delete Iron Consortium" — rather than a bare "Create" /
"Rename" / "Delete" the user has to cross-reference against the input field or the current selection to
interpret.

## Outcome

All three buttons in `CompanyCrudControls.tsx` gain a dynamic `humanLabel`, computed each render from
component state, with the accessible name (screen-reader announcement, and what tests query by) tracking
the same dynamic text — not a static `humanLabel` with separately-updated visual-only text. `loreLabel`
(`COMMISSION UNIT` / `REDESIGNATE UNIT` / `DECOMMISSION UNIT`) is untouched on all three; only
`humanLabel` becomes dynamic.

**Create button**
- Draft blank/whitespace-only: `"Create"` (the existing static label — rare in practice, since the field
  autofills a suggested name on mount; only reachable by deleting the suggestion entirely).
- Draft non-blank: `"Create {draft, as typed}"`.
- No change to `atCap`/blank disabled logic — this changes only the label text, independent of why the
  button is or isn't clickable.

**Rename button**
- Selecting a company (via `CompanyButtonRow`, or any future company-selection entry point) no longer
  pre-fills the rename draft with that company's *current* name — it auto-generates a fresh suggested name
  instead, via the same `suggestCompanyName()` generator Create's own field already uses. The two names are
  therefore virtually always different from the moment a company is selected, with no typing required.
- Draft blank/whitespace-only: `"Rename"`.
- Draft non-blank: `"Rename {selected company's current name} > {draft}"`.
- On a successful submit: commits the rename, then immediately re-rolls the draft to a fresh suggestion —
  mirroring Create's own post-submit reroll exactly. The button now reads `"Rename {just-committed name} >
  {new suggestion}"`, ready for another rename with no further input needed.
- Switching to a *different* selected company resets the draft to a fresh suggestion (tracked by company
  id, not the resolved `Company` object — see the staged-draft work this builds on). An unrelated update to
  the *same* selected company elsewhere (e.g. a robot reassigned into/out of it via `RobotSelectionCard`,
  which also produces a new `Company` object reference) must **not** reset the draft — already true of the
  staged-draft implementation this extends, unaffected by this change.
- The existing "disabled when the draft is blank or exactly matches the company's current name" Submit
  guard stays, as a defensive no-op check — should almost never actually trigger now that the draft is
  auto-generated to differ, but stays cheap insurance against a pointless store write if a suggestion ever
  coincidentally collides (company names aren't required unique in this app, so this is possible, just
  unlikely).

**Delete button**
- No company selected: `"Delete"`.
- Company selected: `"Delete {selected company's current name}"`.

## User

Crawford (solo dev) — a direct usability improvement for himself while managing companies through the
console UI; not a request originating from playtesting or another stakeholder.

## Why now

Raised immediately after finishing Rename's own staged-draft + Submit button work (this same session) —
noticing, while using the freshly-added Submit button, that none of the three CRUD buttons say what they're
about to do.

## Success

- Create's button face reads `"Create {draft}"` whenever the draft is non-blank, `"Create"` otherwise; its
  accessible name matches.
- Rename's button face reads `"Rename {current name} > {draft}"` whenever the draft is non-blank (which is
  effectively always, once a company is selected, given the auto-suggested draft), `"Rename"` otherwise
  (nothing selected, or the draft was emptied by hand); its accessible name matches.
- Selecting a company pre-fills Rename's draft with a fresh suggestion, never the company's own current
  name — the button therefore always previews two *different* names as soon as a company is selected.
- A successful Rename submit re-rolls the draft immediately, keeping the "two different names" promise true
  on the very next render.
- Delete's button face reads `"Delete {selected company's current name}"` when a company is selected,
  `"Delete"` otherwise; its accessible name matches.
- Existing tests querying these buttons by their old static accessible names (`getByRole('button', { name:
  'Create' })` etc.) are updated to match the new dynamic contract, not left broken or loosened.
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- `loreLabel` is untouched on all three schemas — only `humanLabel` becomes dynamic, following this
  codebase's own established pattern of a per-render schema clone (e.g. `CREATE_NAME_SCHEMA`/
  `RENAME_NAME_SCHEMA` in `CompanyCrudControls.tsx` already do this for `id`/`humanLabel`), not a new
  mechanism.
- Accessible name tracks the dynamic visible text on all three (confirmed in interview) — matches WCAG 2.5.3
  Label in Name, and this codebase's `resolveAccessibleName` (`schema.humanLabel ?? schema.loreLabel ??
  schema.id`) already produces this for free once `humanLabel` itself is dynamic; no separate ARIA
  attribute or override needed.
- No change to Create's or Delete's underlying commit/disabled logic — `atCap`, `nameIsBlank`,
  `hasSelectedCompany` all stay exactly as they are; only the label text computed from them changes.
- No new uniqueness handling for Rename's auto-suggested draft against other companies' names or the
  currently-selected company's own name — company names aren't required unique elsewhere in this app
  (unlike `color`, which does have collision-avoidance), and this doesn't introduce a new requirement for
  one.

## Design discussion (2026-09-14, via `/interview-me`)

- **Accessible name vs. visible-only text:** Confirmed the accessible name should track the full dynamic
  string, not stay fixed while only the DualLabel's visible text changes — "correct" on the first pass,
  reasoned from WCAG's Label in Name expectation plus the feature's own point (a legible preview) applying
  equally to screen-reader users.
- **Create's exact template:** Corrected mid-interview — not just the bare draft name, but `"Create
  {draft}"` (the static word plus the name), matching the same `"{HumanLabel} {content}"` shape Rename and
  Delete already use. This was the one real drift between the original ask and the confirmed intent; folding
  it in made all three buttons follow one consistent template rather than Create being a special case.
- **Rename's post-submit reroll:** Confirmed — the draft re-rolls to a fresh suggestion immediately after a
  successful submit, mirroring Create's own reroll-after-create exactly, so the "always two different
  names" property holds continuously rather than only right after selecting a company.
- **Rename's auto-suggested draft (not the current name) on selection:** This was explicit in the original
  ask, not something the interview needed to surface — restated here for completeness since it's the
  behavior change with the widest blast radius (it supersedes part of the staged-draft work from earlier
  this same session, specifically the "pre-fill with the current name" piece — the "reset only on an actual
  id change, not an unrelated field update" piece is unaffected and carries forward unchanged).

## Out of scope

- Any redesign of the button/DualLabel visual treatment itself (font size, wrapping, truncation for a long
  generated or user-typed name) — implementation detail for the spec/build pass, not decided here. Worth
  keeping an eye on given `RadioButton.css`'s own recent width fix was motivated by these same
  variable-length, user-generated company names, but no specific truncation/overflow behavior is being
  committed to in this intent.
- Any change to `CREATE_COMPANY_SCHEMA` / `RENAME_COMPANY_SCHEMA` / `DELETE_COMPANY_SCHEMA`'s `loreLabel`,
  `id`, or `type` fields.
- Any change to `pickRandomCompanyColor`, `addCompany`, `updateCompany`, `removeCompany`, or any other piece
  of the company data flow — this is a label-text-only change layered on top of already-shipped commit
  logic.
- Company-name uniqueness enforcement, for the auto-suggested Rename draft or anywhere else.

## Downstream

Hand this confirmed intent to `spec-driven-development` (or straight to implementation, given the small,
single-file blast radius — `CompanyCrudControls.tsx` plus its own test file and `companyConfig.ts`/its test
file for schema shape) at the next available point. No roadmap/`CLAUDE.md`/`COMPONENT_LIBRARY.md` edits
expected — this doesn't add or remove a primitive or change any documented contract beyond `humanLabel`
being computed rather than static, which is already `ButtonSchema`'s existing declared type (`string`).
