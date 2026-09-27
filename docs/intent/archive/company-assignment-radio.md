# Intent: Company Assignment — Replace `Select` with `RadioButton`

Confirmed via `/interview-me` on 2026-09-10. Reverses part of
[Phase 10](../todo/roadmap.md#10-companies)'s own design: the robot→company assignment dropdown
(`Select`, Phase 10's 14th Design System primitive) is replaced with a `RadioButton` row at both of its
call sites. `Select` becomes fully unused once this ships and is removed outright, along with the
not-yet-started [11.1.8](../todo/roadmap.md#1118-oblique-cabinetry-select) item that would have wired
it into [Oblique Cabinetry](oblique-cabinetry-foundation.md).

## Outcome

- `buildCompanySelectSchema` (`src/data/companyConfig.ts`) is replaced by a `RadioButtonSchema`-returning
  equivalent — same `{ value, label }[]` shape it already produces (Freelance first via `FREELANCE_VALUE`,
  then every company in `companies` array order), just `type: 'radio'` instead of `type: 'select'`. No
  change to option order or to `FREELANCE_VALUE`'s sentinel meaning.
- `RobotSelectionCard.tsx` and `RobotDisplaySection.tsx` — the only two real consumers — each swap their
  `<Select schema={companySelectSchema} value={...} onChange={handleCompanyChange} />` for
  `<RadioButton schema={...} value={...} onChange={handleCompanyChange} />`. `handleCompanyChange` and the
  underlying `assignRobotToCompany(localeId, robot.id, value === FREELANCE_VALUE ? null : value)` call are
  unchanged — this is a control-type swap, not a data-flow change.
- Same visual/layout treatment in both places: a horizontal row of labeled segments, matching
  `CompanyButtonRow`'s existing pill-row look (`src/components/company/CompanyButtonRow.tsx`) rather than
  inventing a second style for "pick a company." Since `RadioButton` already renders through the shared
  `CabinetBox` mechanism ([11.1.6](oblique-cabinetry-radio-button.md), shipped), the new rows get Cabinetry
  styling for free.
- `RobotSelectionCard.tsx`'s `handleCardClick`'s existing `stopPropagation` workaround (currently commented
  as guarding against `Select`'s Radix `Portal`-rendered dropdown items bubbling into the card's own click
  handler) gets re-examined during the spec pass — `RadioButton`'s `ToggleGroup` doesn't portal, so this
  guard may become dead code; not assumed dead without checking, since the card's own activation logic
  could have a second, unrelated reason to keep it.
- `Select` is removed entirely: `Select.tsx`/`Select.css`/`Select.test.tsx`, `SelectSchema` from
  `src/types/controls.ts` (and its `controls.test.ts` "all N variants covered" runtime assertion, updated
  down from 14), and any now-dead `RadixSelect` import. The Design System reverts to **13** primitives —
  `CLAUDE.md`'s reference bullet and `docs/COMPONENT_LIBRARY.md` both updated back from "14th primitive."
- Roadmap `11.1.8 Oblique Cabinetry: Select` is marked **cut**, with a reason, the same way
  [Console Theming](../todo/roadmap.md#11-console-theming---cut) (Phase 11, cut) was recorded — not
  silently deleted from the doc. This pass itself gets its own roadmap entry (inserted out of sequence
  under Phase 10, mirroring how 10.1–10.4 were themselves inserted after Phase 10 shipped) — exact numbering
  left to the spec pass.

## User

Crawford (solo dev) — a UI preference against dropdowns for this specific interaction, not a data-model
concern.

## Why now

No specific trigger beyond preference; raised while reviewing the app with the Oblique Cabinetry series
(the active feature line) freshly in context, which is what surfaced the conflict with the not-yet-started
11.1.8.

## Success

- Both `RobotSelectionCard` and `RobotDisplaySection` show a `RadioButton` row (Freelance, then companies)
  in place of the `Select` dropdown; clicking a segment assigns immediately, identical behavior to today's
  `onChange`.
- `Select` no longer exists anywhere in `src/` (component, schema type, tests) or in `CLAUDE.md`/
  `docs/COMPONENT_LIBRARY.md`'s primitive count/list.
- Roadmap `11.1.8` reads as cut, with a one-line reason pointing at this item; this item has its own roadmap
  entry documenting what replaced it — same "what and why" standard `docs/CONSOLE_THEMING.md` set.
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- Reuse `RadioButton` as-is (already Cabinetry-wired) — no bespoke control, no changes to `RadioButton`'s
  own API or rendering to accommodate this.
- `assignRobotToCompany` and every other piece of the company data flow (`companyConfig.ts`'s
  `FREELANCE_VALUE`, `useLocaleStore`) stay exactly as they are — this is presentation-only.
- CLAUDE.md's Strict Separation and `timelineMap` guardrails apply the same way they already do for every
  other `RadioButton` consumer; no new timeline concerns introduced by this swap.
- Up to `MAX_POLYPHONY`-unrelated but still bounded option count: `MAX_COMPANIES` (6) + Freelance = 7
  options max, the same ceiling `CompanyButtonRow` (`NONE_VALUE`/`ALL_VALUE` + companies, 8 max) already
  renders today — no new "too many options" handling is expected to be needed, but isn't assumed without
  checking against `CompanyButtonRow`'s actual CSS during the spec pass.

## Design discussion (2026-09-10, via `/interview-me`)

- **`Select`'s fate:** Confirmed removal, not left in place unused — "Remove it entirely," including the
  roadmap/CLAUDE.md/COMPONENT_LIBRARY.md bookkeeping, rather than leaving a dead primitive around for a
  hypothetical future dropdown need.
- **Layout:** Confirmed same style in both `RobotSelectionCard` (compact, one of 12 cards) and
  `RobotDisplaySection` (roomier detail page) — reuse `CompanyButtonRow`'s existing pill-row look rather
  than two different treatments. Wrapping/overflow behavior for the 7-option case is an implementation
  detail for the spec pass, not a design fork.
- **Process:** Confirmed a full intent → spec → tasks pass, matching every other item in this codebase's
  history (including the Oblique Cabinetry series this conflicts with), rather than a quick unlogged
  change — specifically because this reaches into the active roadmap (cutting 11.1.8) and the documented
  Design System primitive count.

## Out of scope

- `CompanyButtonRow` / `CompanyOptionsSection` — already `RadioButton`-based (company *selection* for
  viewing/bulk-editing, a different feature from robot→company *assignment*), untouched by this change.
- Any change to `assignRobotToCompany`, `FREELANCE_VALUE`'s sentinel behavior, or how companies are
  generated/stored.
- Any visual redesign beyond the control-type swap — reuse the existing pill-row look as shipped; further
  visual iteration happens after it's on screen, not decided here.
- Exact new roadmap numbering/wording for this item and for 11.1.8's cut entry — left to the spec pass,
  same as prior items left their own fine details to spec-driven-development rather than the interview.

## Downstream

Hand this confirmed intent to `spec-driven-development` to produce the written spec (including the exact
`RadioButtonSchema` builder, the `stopPropagation` re-check, and the roadmap/CLAUDE.md/COMPONENT_LIBRARY.md
edits), then `planning-and-task-breakdown` for the task list — one combined pass, following the same
process every other item in `docs/specs/`/`docs/tasks/` used.
