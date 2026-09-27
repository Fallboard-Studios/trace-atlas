# Intent: Robot Selection Screen — Filter Panel

Confirmed via `/interview-me` on 2026-09-14. Restructures the `RobotsTab` screen (the "Robots" hub tile's
list view — lore-labeled `UNIT ROSTER`) so company selection becomes a real filter panel instead of the
current inline `CompanyManager` block beneath the robot card list, and turns today's reorder-only company
focus into an actual filter that hides non-members.

## Outcome

**New filter panel, `RobotsTab`-only:**
- A new panel holds `CompanyButtonRow` (restructured — see below) and `CompanyCrudControls`, pulled out of
  today's `CompanyManager` composition in [RobotsTab.tsx](../../src/components/panels/screen/console/RobotsTab.tsx).
- `CompanyCrudControls` drops its `AccordionContainer` wrapper (`COMPANY_CRUD_ACCORDION_SCHEMA`) entirely —
  Create/Rename/Delete render as plain content beneath the button row, not collapsed behind a toggle.
- `CompanyOptionsSection` (the 4 bulk-edit accordions — Volume/Melody/Envelope/Source) is **not** part of the
  panel. It stays exactly where `CompanyManager` renders it today: beneath `robots-tab__list` in the main
  content area. Its own internal logic, disabled-state rules, and broadcast/snapshot behavior are untouched.
- This panel, and the filtering behavior below, exist **only** on this list screen. Selecting a robot swaps
  to `RobotOptionsTab` (a different, mutually-exclusive view in the same `ConsolePanel` slot — see
  [ConsolePanel.tsx](../../src/components/panels/screen/console/ConsolePanel.tsx)); the filter panel has no
  presence there. You can't filter a robot list that isn't on screen.

**Button row restructure (`CompanyButtonRow`/`buildCompanyButtonRowSchema` in `companyConfig.ts`):**
- Order: **All** → company buttons (one per company, in existing order) → **Reset**.
- **All** (green): shows every robot in the locale, including freelancers, unfiltered. Bulk-edit stays
  active and broadcasts to every robot — unchanged from today's `ALL_VALUE`/`allRobotsSelected` behavior.
  Explicitly *not* narrowed to exclude freelancers, even though freelancers are otherwise never
  bulk-editable any other way — flagged in interview as a real risk (uniform oscillator/ADSR settings across
  every robot can produce bad-sounding audio) but kept as-is; a warning here is a possible future addition,
  not part of this intent.
- **Company buttons**: unchanged selection semantics, but now drive a real filter (see below) in addition to
  their existing bulk-edit scoping. Each keeps its own `color`.
- **Reset** (red): renamed from **None** (`NONE_VALUE`) — identical underlying behavior
  (`selectCompany(null)`), just relabeled and moved to the end of the row. Unfiltered view, bulk-edit
  disabled (`active` stays `false`, same as today).
- **No "Freelance" option added to this row.** Raised and explicitly rejected in interview — freelance
  robots must never be bulk-editable, so a selectable "Freelance" filter/bulk-edit target here would defeat
  the point of freelance status. `FREELANCE_VALUE`'s only use stays where it already is: the unrelated
  per-robot company-assignment `RadioButton` (`buildCompanyAssignmentSchema`).

**Filtering — the one real logic change:** Selecting a specific company now hides every non-member robot
from the list, instead of just sinking them to the bottom. This replaces
[`sortRobotsByCompanyFocus`](../../src/utils/robotListSort.ts)'s current reorder-only behavior
(`[...others, ...members]`) with an actual filter (members only). All/Reset both continue to show the full,
unfiltered roster — nothing changes for either of those two states.

**Responsive shell:**
- **Desktop** (the `desktop` cabinet tier — same tiers `useCabinetTier`/`useResponsivePanelOrientation`
  already read from `cabinetBreakpoints.ts`): panel always visible, to the left of the robot card list. The
  robot list must never be laid out so it overlaps the panel.
- **Mobile + tablet** (both remaining tiers, grouped together — mirroring
  `useResponsivePanelOrientation`'s existing 2-way split of these same 3 tiers, not a new 3-way behavior):
  panel starts off-screen. A sticky toggle floats over the top-left of the robot list; tapping it slides the
  panel over the list. Selecting any option in the panel (All, a company, or Reset) auto-closes it, dropping
  the user straight onto the now-filtered list — there's only ever one option "active" at a time here, so
  there's no reason to keep the panel open for a second selection.
- Toggle disappears entirely on desktop (no manual show/hide needed there — the panel is just always on
  screen).

## User

Crawford (solo dev) — reworking his own console UI as the company-management surface (button row, CRUD,
bulk-edit) has grown past what fits comfortably inline above the robot list.

## Why now

Follows directly from the `feature/company-cleanup` work already shipped this cycle (CRUD button preview
labels, company-select scroll-jump fix) — the next step in decluttering the same screen.

## Success

- `RobotsTab` renders a filter panel (button row + CRUD, un-accordioned) distinct from the robot card list
  and from `CompanyOptionsSection`.
- Selecting a company hides every robot not in it; selecting All or Reset shows every robot.
- Button row reads All (green) → companies (own colors) → Reset (red), with Reset behaving exactly as
  today's None and All's bulk-edit-everyone behavior unchanged.
- Desktop: panel and robot list never overlap, panel always visible, no toggle rendered.
- Mobile/tablet: panel starts off-screen; a sticky top-left toggle slides it over the robot list; choosing
  any option closes it back to the filtered list automatically.
- `CompanyOptionsSection` behaves identically to today in every filter state — no regression to its
  disabled/active logic, its broadcast-to-members behavior, or its snapshot patching.
- `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.

## Constraint

- Per `CLAUDE.md`: any slide/toggle animation for the mobile panel must go through a GSAP timeline in
  `timelineMap` (`setTimeline`/`killTimeline`), not React/Zustand state and not a bare CSS transition driven
  from a re-render — following `AccordionContainer`/`accordionAnimation.ts`'s existing precedent (which also
  already respects `prefers-reduced-motion`, the same way this new toggle should). Exact mechanism is a
  spec/build-phase decision, not decided here.
- `CompanyOptionsSection`'s existing logic (member resolution, `active` gating, `resolveCompanyOptions`,
  snapshot patching) is out of bounds for this change — confirmed in interview it "shouldn't need amending."
- `allRobotsSelected`/`selectedCompanyId` in `uiStore.ts` keep their current meaning and mutual exclusivity;
  no new state field is introduced for the filter (the existing pair already fully drives it).
- `FREELANCE_VALUE` and `buildCompanyAssignmentSchema` (the per-robot company-assignment radio) are
  untouched — this intent only touches `buildCompanyButtonRowSchema`/`NONE_VALUE`/`ALL_VALUE` and their
  consumers.

## Design discussion (2026-09-14, via `/interview-me`)

- **Where the panel lives:** The original ask said "robot options should not overlap the desktop filter
  panel" — corrected mid-interview to "robot *selection*," which resolved the whole architecture question:
  the panel lives inside `RobotsTab` next to the card list, not one level up wrapping both `RobotsTab` and
  `RobotOptionsTab`. Confirmed directly: "we should only see this on the robot selection screen as you can't
  filter robots without a list to filter."
- **"Freelance" as a third button, then cut:** First proposed (by the agent, extrapolating from the original
  note's "otherwise it's redundant with the None button" remark) as a rename of "All" to "Freelance" —
  narrowing All's bulk-edit target to unaffiliated robots only. Explicitly reversed: All stays All, keeps
  bulk-editing everyone including freelancers; Freelance never becomes a selectable option here at all,
  because freelance robots must never be bulk-edited, full stop.
- **All's bulk-edit-everyone risk:** Raised by the agent as a "good catch" candidate for removal (uniform
  audio settings across the whole roster can sound bad) — user chose to keep the capability as-is, noting a
  possible future warning rather than removing the behavior now.
- **Bulk-edit accordions' location:** First guessed (wrongly) to move into the new panel alongside the
  button row/CRUD, reasoning from the original note's "components within the unit roster accordion" phrase.
  Corrected: "Bulk editing should stay separate, it's too large to hold in the filter panel" — it stays in
  the main content area, unmoved.
- **Mobile auto-close:** First guessed (wrongly) that the panel stays open after a selection. Corrected:
  "let's close the list" (the panel) "as there aren't multiple options to select at once here, so we should
  just present the results" — any selection auto-closes it.
- **Breakpoint split:** Confirmed reusing the existing 3-tier `cabinetBreakpoints` system with the same
  2-way grouping `useResponsivePanelOrientation` already uses (mobile+tablet vs. desktop), rather than
  inventing a tablet-specific third treatment.

## Out of scope

- Any warning/confirmation dialog for All's bulk-edit-everyone behavior — floated as a future idea, not part
  of this intent.
- Persisting the mobile panel's open/closed state across sessions or navigation.
- Any change to `FREELANCE_VALUE`, `buildCompanyAssignmentSchema`, or the per-robot company-assignment radio.
- Any change to `CompanyOptionsSection`'s internal bulk-edit logic, disabled-state rules, or snapshot
  patching.
- Exact visual/CSS treatment of the panel, toggle, and slide-over animation — implementation detail for the
  spec/build pass, beyond the GSAP-timeline constraint noted above.

## Downstream

Hand this confirmed intent to `spec-driven-development` next — this touches `RobotsTab.tsx`,
`CompanyManager.tsx` (likely dissolved into two call sites), `CompanyButtonRow.tsx`, `CompanyCrudControls.tsx`
(accordion removal), `companyConfig.ts` (button row schema: rename/reorder/recolor `NONE_VALUE`/`ALL_VALUE`),
`robotListSort.ts` (reorder → filter), plus a new panel component and its mobile toggle/animation — enough
surface area to warrant a spec and task breakdown rather than going straight to implementation.
