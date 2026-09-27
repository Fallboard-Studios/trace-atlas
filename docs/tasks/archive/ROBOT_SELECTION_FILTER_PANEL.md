# Implementation Plan: Robot Selection Screen — Filter Panel

Source spec: [docs/specs/ROBOT_SELECTION_FILTER_PANEL.md](../specs/ROBOT_SELECTION_FILTER_PANEL.md). Source
intent: [docs/intent/robot-selection-filter-panel.md](../intent/robot-selection-filter-panel.md). Six tasks
across three phases: four independent foundation changes (schema reorder, filter-not-sort, accordion
removal, `CompanyOptionsSection` relocation), one standalone new component, and one integration task that
wires the new component into `RobotsTab`.

## Overview

Restructure `RobotsTab` so company selection drives a real left-hand filter panel (button row + CRUD,
un-accordioned) instead of the current inline `CompanyManager` block, with a mobile/tablet slide-over toggle
and an always-visible desktop sidebar. Along the way: the button row reorders to All → companies → Reset
with new colors, company selection actually filters the robot list instead of just reordering it, and the
bulk-edit accordions (`CompanyOptionsSection`) move out to render directly in `RobotsTab`, unchanged
internally.

## Architecture Decisions

- **Tasks 1–4 are independent of each other and of Task 5** — no task in this group depends on another's
  *output*, only (for Tasks 2 and 4) on landing in sequence against a file another task also touches
  (`RobotsTab.tsx`), same "shared file → sequence, don't parallelize" reasoning
  [docs/tasks/COMPANY_CRUD_BUTTON_PREVIEW.md](COMPANY_CRUD_BUTTON_PREVIEW.md) already used for
  `CompanyCrudControls.tsx`. Tasks 1 and 3 similarly both touch `companyConfig.ts` — sequence, don't
  parallelize.
- **Task 4 (relocate `CompanyOptionsSection`) lands before Task 6 (wire in `RobotFilterPanel`), not after.**
  If Task 6 landed first, `RobotFilterPanel` would wrap a `CompanyManager` that still contains
  `CompanyOptionsSection` — briefly putting the bulk-edit accordions inside the mobile-collapsible panel,
  exactly what the spec says not to do (§1.5: "too large to hold in the filter panel"). Doing Task 4 first
  means `CompanyManager` is already slimmed to just the button row + CRUD by the time `RobotFilterPanel`
  wraps it — no intermediate state where the accordions are ever inside the panel, even briefly, even in
  git history.
- **Task 5 (build `RobotFilterPanel`) touches only new files** — it renders `CompanyManager` exactly as it
  exists at the time it's built, with no assumption about whether Tasks 1–4 have landed yet. Fully
  parallelizable against Tasks 1–4 in principle; ordered after them here only so its own manual verification
  step (§ each task) already shows the final CRUD/button-row look, not because of a real code dependency.
- **No task combines the panel's visual relocation with the filtering-logic change.** Task 2 makes company
  selection actually filter the robot list — a complete, independently valuable, user-visible change on its
  own — while `RobotsTab` still renders `CompanyManager` directly, unchanged layout. Task 6 only changes
  *where* that already-filtered list and the button row/CRUD render relative to each other. This keeps each
  task's diff explainable in one sentence and independently revertible.
- **`CompanyManager.css`'s border-top/padding-top removal is folded into Task 4**, not split out — it's a
  one-line consequence of the same relocation (that rule existed only to separate `CompanyManager` from the
  list stacked above it in one column; Task 4 is what stops that being true), not a separate concern.

## Dependency Graph

```
Task 1 (button row: reorder/relabel/recolor)         — independent
Task 2 (filter, not sort — rename util + wire in)    — independent (shares RobotsTab.tsx with Task 4, Task 6)
Task 3 (drop CompanyCrudControls' accordion wrap)    — independent (shares companyConfig.ts with Task 1)
Task 4 (relocate CompanyOptionsSection)              — independent (shares RobotsTab.tsx with Task 2, Task 6)
Task 5 (build RobotFilterPanel, standalone)          — independent
        │                         │
        └────────────┬────────────┘
                      ▼
Task 6 (wire RobotFilterPanel into RobotsTab) — depends on Task 4 (CompanyManager already slimmed) and
                                                  Task 5 (RobotFilterPanel exists)
```

## Task List

### Phase 1: Foundation

- [x] **Task 1: Button row — reorder, relabel, recolor**

  **Description:** `buildCompanyButtonRowSchema` (`companyConfig.ts`) changes its `options` order to All →
  companies → Reset. `NONE_VALUE`'s option label changes `'None'` → `'Reset'` and gains
  `color: ACCENT_COLORS.red`; `ALL_VALUE`'s option keeps its `'All'` label and gains
  `color: ACCENT_COLORS.green`. `NONE_VALUE`/`ALL_VALUE`'s sentinel strings and every existing
  branch on them (`CompanyButtonRow.tsx`'s `handleChange`) are unchanged — this is a schema-shape-only
  change. Requires a new `ACCENT_COLORS` import in `companyConfig.ts`. Spec §1.1.

  **Acceptance criteria:**
  - [x] `buildCompanyButtonRowSchema(companies)` returns `options` in the order: `All`, then each company
        (in `companies`' own order, unchanged), then `Reset`.
  - [x] The `All` option carries `color: ACCENT_COLORS.green`; the `Reset` option carries
        `color: ACCENT_COLORS.red`; every company option keeps its own `color: c.color`, unchanged.
  - [x] `NONE_VALUE`/`ALL_VALUE` constants and `CompanyButtonRow.tsx` itself are unmodified — this task
        touches only the schema builder and its own doc comment.
  - [x] Every `CompanyButtonRow.test.tsx` query for `{ name: 'None' }` becomes `{ name: 'Reset' }`; the
        `'shows each company's own color ... and no color on None'` test is rewritten to assert `Reset`
        carries `ACCENT_COLORS.red` and `All` carries `ACCENT_COLORS.green` (no option in this row has a
        `null` `style` attribute anymore).
  - [x] New test: rendering with a company list produces radios in the order All → company(ies) → Reset
        (assert via `screen.getAllByRole('radio')`'s own DOM order, not just individual presence).

  **Verification:**
  - [x] `npx vitest run src/data/companyConfig.test.ts src/components/company/CompanyButtonRow.test.tsx`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/companyConfig.ts`, `src/data/companyConfig.test.ts`,
  `src/components/company/CompanyButtonRow.test.tsx`

  **Estimated scope:** S (schema builder + two test files, no component logic change)

- [x] **Task 2: Filter, not sort — rename the util, wire it into `RobotsTab`**

  **Description:** Rename `src/utils/robotListSort.ts` → `robotListFilter.ts` (test file alongside),
  renaming `sortRobotsByCompanyFocus` → `filterRobotsByCompanyFocus` and rewriting its body from a
  reorder (`[...others, ...members]`) to a real filter (`companyId ? robots.filter(r => r.companyId ===
  companyId) : robots`). `RobotsTab.tsx` updates its one import and call site to match — no other change to
  `RobotsTab.tsx` in this task; `CompanyManager` still renders exactly where it does today. Spec §1.2.

  **Acceptance criteria:**
  - [x] `filterRobotsByCompanyFocus(robots, null)` returns the input array unchanged (reference-equal is
        fine, not required).
  - [x] `filterRobotsByCompanyFocus(robots, 'c1')` returns only the robots whose `companyId === 'c1'`, in
        their original relative order — not the old 2-block reordered array.
  - [x] `filterRobotsByCompanyFocus(robots, 'no-such-company')` returns `[]`.
  - [x] `RobotsTab.tsx` renders only the filtered robots inside `.robots-tab__list`; selecting a company
        (via the existing `CompanyManager`, unmoved) hides every non-member card; selecting `All` or
        `Reset`/`None` shows every card.
  - [x] Old `robotListSort.ts`/`robotListSort.test.ts` no longer exist (renamed, not duplicated).

  **Verification:**
  - [x] `npx vitest run src/utils/robotListFilter.test.ts src/components/panels/screen/console/RobotsTab.test.tsx`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean (confirms no stale import of the old file path
        anywhere).

  **Dependencies:** None.

  **Files:** `src/utils/robotListSort.ts` → `src/utils/robotListFilter.ts` (renamed),
  `src/utils/robotListSort.test.ts` → `src/utils/robotListFilter.test.ts` (renamed),
  `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** S (one renamed util + its test, a two-line change in `RobotsTab.tsx`)

- [x] **Task 3: Drop `CompanyCrudControls`' accordion wrap**

  **Description:** Remove the `<AccordionContainer schema={COMPANY_CRUD_ACCORDION_SCHEMA}>` wrapper from
  `CompanyCrudControls.tsx` — its children (`.company-crud-controls` and everything inside) render
  directly. Remove `COMPANY_CRUD_ACCORDION_SCHEMA` from `companyConfig.ts` (dead once this lands — no other
  consumer). Spec §1.4.

  **Acceptance criteria:**
  - [x] `CompanyCrudControls` renders its `.company-crud-controls` div with no `AccordionContainer`/Radix
        Accordion markup anywhere in its output — no trigger, no `aria-expanded`, no collapse/expand
        behavior.
  - [x] `COMPANY_CRUD_ACCORDION_SCHEMA` is removed from `companyConfig.ts` and has no remaining importer
        (verify via a repo-wide search, not just `CompanyCrudControls.tsx`).
  - [x] The `describe('CRUD accordion', …)` block in `CompanyCrudControls.test.tsx` (2 tests: starts
        collapsed, expands/collapses on click) is deleted.
  - [x] Every other existing test in `CompanyCrudControls.test.tsx` still passes unmodified — none of them
        depend on the accordion wrapper.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx src/data/companyConfig.test.ts`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/company/CompanyCrudControls.tsx`,
  `src/components/company/CompanyCrudControls.test.tsx`, `src/data/companyConfig.ts`

  **Estimated scope:** S (remove one wrapper element, one dead schema constant, two dead tests)

- [x] **Task 4: Relocate `CompanyOptionsSection` out of `CompanyManager`**

  **Description:** `CompanyManager.tsx` drops its `CompanyOptionsSection` import/render, keeping only
  `CompanyButtonRow` + `CompanyCrudControls`. `CompanyManager.css`'s `padding-top`/`border-top` rule (which
  existed only to separate `CompanyManager` from the robot list stacked above it) is removed.
  `RobotsTab.tsx` imports and renders `CompanyOptionsSection` directly, in the same document position
  `CompanyManager` used to occupy (beneath the robot card list). `CompanyOptionsSection.tsx` itself is
  **not modified** — same import, same props (none), same internal logic. Spec §1.3.

  **Acceptance criteria:**
  - [x] `CompanyManager`'s rendered output contains `.company-button-row` and `.company-crud-controls` only
        — no `.company-options-section` anywhere inside it.
  - [x] `RobotsTab`'s rendered output contains exactly one `.company-options-section`, as a sibling
        following `CompanyManager`'s own current render position (still beneath the robot card list).
  - [x] `CompanyManager.test.tsx`'s ordering test drops its `optionsSection` query/assertion (2-element
        check: button row before CRUD controls, not 3).
  - [x] `RobotsTab.test.tsx` gains an assertion that `.company-options-section` still renders, in the same
        relative document position `CompanyManager` used to.
  - [x] `CompanyOptionsSection.tsx`, `.css`, and `.test.tsx` have zero diff — confirm via `git diff
        --stat` before committing.
  - [x] (Regression fix, found during this task) `CompanyManager.test.tsx`'s `'renders the "None" company
        button by default'` test — broken since Task 1 renamed that button to "Reset," but outside Task
        1's own file list — updated to query `'Reset'`.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyManager.test.tsx src/components/panels/screen/console/RobotsTab.test.tsx`
        passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (sequence after Task 2 — both touch `RobotsTab.tsx`).

  **Files:** `src/components/company/CompanyManager.tsx`, `src/components/company/CompanyManager.css`,
  `src/components/company/CompanyManager.test.tsx`,
  `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** M (one relocation touching both ends, 5 files, no internal logic change to the
  thing being moved)

### Checkpoint: Foundation

- [x] `npm run build:types`, `npm run lint`, `npm test` (full suite — 141 files, 2520 tests; the one
      pre-existing flaky random-seeded test noted in memory reran clean in isolation) all clean.
      `npm run build` not run at this checkpoint — no reason to expect it to differ from `build:types`
      here; will run at the final Checkpoint: Complete.
- [ ] `npm run dev` manual spot-check: the Robots tile still renders in one column exactly as before (no
      panel, no toggle yet — that's Phase 3), but: the button row reads All (green) → companies → Reset
      (red); CRUD controls (Create/Rename/Delete) are always visible, not behind a "Manage Companies"
      toggle; selecting a company hides every other robot's card instead of just reordering them. *(Not
      run this session — no live browser available. Genuinely open, not assumed; same caveat the prior
      COMPANY_CRUD_BUTTON_PREVIEW.md plan flagged for its own manual check.)*
- [ ] Review with human before proceeding to Phase 2/3.

---

### Phase 2: New Component

- [x] **Task 5: Build `RobotFilterPanel`, standalone**

  **Description:** New component `src/components/panels/screen/console/RobotFilterPanel.tsx` (+ `.css`,
  `.test.tsx`) implementing the full responsive shell: `useCabinetTier()`-driven desktop-vs-mobile/tablet
  behavior, local `open` state (default `false`), a GSAP slide timeline registered in `timelineMap`
  (`prefers-reduced-motion`-aware), an auto-close effect keyed off `selectedCompanyId`/`allRobotsSelected`
  that skips the initial mount, and a plain-`Button`-based sticky toggle rendered only off-desktop. Renders
  `CompanyManager` as its content, unconditionally. **Not wired into `RobotsTab` in this task** — no other
  existing file changes. Spec §1.5.

  **Acceptance criteria:**
  - [x] At `desktop` tier: no toggle button renders; the panel's root carries `data-tier="desktop"`;
        `CompanyManager`'s own content (`.company-button-row`, `.company-crud-controls`) is present and
        unconditionally visible (no transform applied).
  - [x] At `mobile`/`tablet` tier: a toggle button renders (`FILTER_TOGGLE_SCHEMA`, `humanLabel: 'Filters'`);
        clicking it adds the `isActive` class (`withActiveClass`) to the panel's root; clicking again
        removes it.
  - [x] Selecting a company (`useUIStore.getState().selectCompany('c1')`) or `selectAllRobots()` while the
        panel is open (opened via a simulated toggle click) removes the `isActive` class — the auto-close
        behavior.
  - [x] The auto-close effect does **not** fire from initial mount alone — rendering with a pre-existing
        non-null `selectedCompanyId` (before any toggle interaction) does not call `setTimeline`/create a
        GSAP timeline on mount.
  - [x] A GSAP timeline is registered under a stable key via `setTimeline` on open/close (off-desktop only)
        and killed via `killTimeline` on unmount. (`prefers-reduced-motion` is read directly from
        `window.matchMedia` inside `animateTo` to pick `duration: 0`, mirroring `AccordionContainer`'s own
        logic exactly; not separately asserted here via a tween-args spy — `AccordionContainer.test.tsx`'s
        own equivalent test only asserts the panel still visibly opens/closes under reduced motion, which
        this component's rendered-state assertions already cover indirectly via the `isActive` class.)

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotFilterPanel.test.tsx` passes (14 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite, 142 files / 2534 tests) passes — confirms this new, unimported-elsewhere
        file breaks nothing else. (One pre-existing flaky test found *while* running the full suite this
        task — `CompanyCrudControls.test.tsx`'s `'is (normally) enabled immediately after selecting a
        company'`, which uses real `Math.random()` and can rarely collide with the fixture's own company
        name — confirmed via `git log` to predate this session's work entirely (introduced in `27d80bd`);
        unrelated to this task, not fixed here. Second known flake alongside the already-documented
        `audioSwells.test.ts` one.)

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/RobotFilterPanel.tsx` (new),
  `src/components/panels/screen/console/RobotFilterPanel.css` (new),
  `src/components/panels/screen/console/RobotFilterPanel.test.tsx` (new)

  **Estimated scope:** M (one new component + CSS + test file, but real new logic: tier branching, GSAP
  timeline, auto-close effect — budget a full focused session, not a quick add)

### Checkpoint: New Component

- [x] `npm run build:types`, `npm run lint`, `npm test` (142 files / 2534 tests) all clean.
      `npm run build` deferred to the final Checkpoint: Complete.
- [x] `RobotFilterPanel` is fully covered by its own test file in isolation; nothing else in the app
      imports or renders it yet.
- [ ] Review with human before proceeding to Phase 3.

---

### Phase 3: Integration

- [x] **Task 6: Wire `RobotFilterPanel` into `RobotsTab`**

  **Description:** `RobotsTab.tsx` stops importing `CompanyManager` directly and renders `RobotFilterPanel`
  instead, wrapping it and `.robots-tab__list` in a new `.robots-tab__body` flex-row container;
  `.robots-tab` itself gains `position: relative` (containing the panel's off-desktop absolute
  positioning); `.robots-tab__list` gains `flex: 1; min-width: 0`. `CompanyOptionsSection` (already
  relocated to be `RobotsTab`'s own direct child in Task 4) keeps its position, now following
  `.robots-tab__body` rather than following `CompanyManager` directly. Spec §1.6.

  **Acceptance criteria:**
  - [x] `RobotsTab`'s rendered output: `.robots-tab__body` contains `RobotFilterPanel`'s root (which
        contains `CompanyManager`'s content) followed by `.robots-tab__list`, in that document order;
        `.company-options-section` follows `.robots-tab__body` as a sibling, unchanged from Task 4.
  - [x] At `desktop` tier: `RobotFilterPanel` renders as a static sidebar to the left of
        `.robots-tab__list`; no toggle button anywhere on the page. (`min-width: 0` on
        `.robots-tab__list` + `flex-shrink: 0` on the panel prevents the overlap the spec calls out; not
        separately eyeballed at a real narrow-desktop width in a live browser this session — see the final
        Checkpoint's own manual-check box, genuinely left open.)
  - [x] At `mobile`/`tablet` tier: `RobotFilterPanel`'s toggle renders sticky over the top-left of
        `.robots-tab__list`; tapping it slides the panel over the list; selecting any filter option
        auto-closes it back onto the now-filtered list — covered structurally (this is the same
        `RobotFilterPanel` unit Task 5 already proved end-to-end; Task 6 only changed where it renders,
        not its own internal behavior, so no new test duplicates that coverage here).
  - [x] The `RobotsTab.test.tsx` test that used to assert `.company-manager` renders directly beneath
        `.robots-tab__list` is replaced with an assertion matching the new structure above (per spec §5).
  - [x] Every other existing `RobotsTab.test.tsx` test (card listing, name fallback, job/battery/docking
        display, card-click selection, no-spawn-button, the Task 2/4 filter and options-section
        assertions) still passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotsTab.test.tsx` passes (11 tests).
  - [x] `npm run build:types`, `npm run lint` clean (one import/order lint error found and fixed —
        `./RobotFilterPanel`'s relative import needed to sort before the `@/...` absolute imports).
  - [x] `npm test` (full suite), `npm run build` clean — see Checkpoint: Complete for the full run's
        result (the known pre-existing flaky `audioSwells.test.ts` test aside).

  **Dependencies:** Task 4 (`CompanyManager` already slimmed to button row + CRUD), Task 5
  (`RobotFilterPanel` exists).

  **Files:** `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.css`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** M (3 files, but the one task where every prior piece comes together — budget a full
  focused session)

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint` clean. `npm test` (full suite): 2533/2534 passing — the one
      failure is the known pre-existing flaky `audioSwells.test.ts` random-seeded test (confirmed via
      `git diff --stat` showing zero changes to that file or `audioSwells.ts` across this entire session;
      also independently noted in project memory as pre-existing and unrelated). `npm run build` succeeds
      (pre-existing chunk-size/dynamic-import warnings only, unrelated to this feature).
- [x] All acceptance criteria across all 6 tasks are met.
- [ ] Manual check (not automated): `npm run dev`, open the Robots tile. *(Not run this session — no live
      browser available. Genuinely open, not assumed — same caveat the Foundation checkpoint and the prior
      `COMPANY_CRUD_BUTTON_PREVIEW.md` plan both flagged for their own manual checks.)*
  - [ ] Desktop width: filter panel always visible to the left, never overlapping the robot list; no
        toggle anywhere.
  - [ ] Resize down through tablet/mobile widths: toggle appears, panel disappears off-screen.
  - [ ] Mobile/tablet: tap toggle → panel slides over the list; tap a company → panel auto-closes, list
        shows only that company; tap "All"/"Reset" → panel auto-closes, list shows everyone.
  - [ ] `All` reads green, `Reset` reads red, companies keep their own colors; order is All → companies →
        Reset.
  - [ ] Selecting `All` still lets all 4 `CompanyOptionsSection` accordions bulk-edit every robot including
        freelancers (regression check, not new behavior).
  - [ ] OS/devtools `prefers-reduced-motion` emulation: panel snaps instead of sliding.
- [ ] Ready for human review / commit. *(Each task committed individually as it landed — see git log on
      `feature/company-cleanup` from commit `9df8779` (Task 1) through the commit landing this checkpoint
      (Task 6). Human review of the branch as a whole is still the open item here.)*

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 6 lands before Task 4, briefly putting the bulk-edit accordions inside the mobile-collapsible panel | Medium — a real, if temporary, violation of the spec's own constraint, and extra churn undoing it | Explicit `Dependencies: Task 4` on Task 6; both tasks touch `RobotsTab.tsx` anyway, so landing out of order isn't silently possible without a merge conflict surfacing first (same protection the CRUD-preview plan relied on for its own Task 1→3 ordering) |
| `Button`'s current props don't cleanly support an `aria-expanded` on `RobotFilterPanel`'s toggle (spec §7 Open Question 1) | Low — cosmetic/a11y polish gap, not a functional break | Task 5's acceptance criteria don't require `aria-expanded` specifically; resolve by reading `Button.tsx` directly during Task 5 and either threading a small passthrough prop or relying on the toggle's own accessible-name change (open/closed) as the accessible signal instead — implementation-time call, not blocking |
| No backdrop/scrim on the mobile overlay (spec §7 Open Question 2) turns out confusing in the Task 6/Checkpoint manual check | Low — cosmetic, easy to add later | Flagged explicitly in the Checkpoint's manual-check step; if it reads as confusing, that's a follow-up task, not a blocker for this plan |
| `docs/COMPANIES.md` documents the old None/All-first order or the reorder-only behavior and goes stale | Low — documentation drift, not a functional break | Carried forward from the spec's own §7 Open Question 3 as a follow-up, not folded into any task above (no task in this plan touches `docs/COMPANIES.md`) |

## Open Questions

Carried forward from the spec's own §7, not resolved by this task breakdown (implementation-time or
human-decision items):

1. **`aria-expanded` feasibility on `Button`** — resolve during Task 5 by reading `Button.tsx` directly, not
   decided here.
2. **Backdrop/scrim** — not part of any task above; revisit only if the Checkpoint's manual check finds it
   needed.
3. **`docs/COMPANIES.md` audit** — not part of any task above; a follow-up documentation pass once this
   plan ships, not before.
4. **Branch choice** (continue on `feature/company-cleanup` vs. a fresh `feature/robot-filter-panel`) — left
   for the human, per the spec's own §6.
