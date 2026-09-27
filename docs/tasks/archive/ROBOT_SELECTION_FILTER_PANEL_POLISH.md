# Implementation Plan: Robot Selection Filter Panel — Polish Pass

Source spec: [docs/specs/ROBOT_SELECTION_FILTER_PANEL_POLISH.md](../specs/ROBOT_SELECTION_FILTER_PANEL_POLISH.md).
Source intent: [docs/intent/robot-selection-filter-panel-polish.md](../intent/robot-selection-filter-panel-polish.md).
Four tasks: three sequential `RobotFilterPanel` fixes (slide-in bug → close button/labels → sticky/content-height
layout, in that order since each shares a file with the next) and one fully independent fix in `spawnSystem.ts`.

## Overview

Fix a live GSAP/CSS bug so the mobile/tablet filter drawer actually slides fully into view; add a dedicated close
button (with state-changing "Show Filters"/"Hide Filters" labels) since the open panel covers its own toggle;
rework the panel's CSS on every tier so it's sticky and sized to its own content instead of scrolling away
(desktop) or covering the full screen (mobile/tablet); and close a previously-accepted gap where seeded initial
spawn could assign two companies in the same locale the same identity color.

## Architecture Decisions

- **Tasks 1–3 are sequenced, not parallel, despite having no real logic dependency on each other.** All three
  touch `RobotFilterPanel.tsx`/`.css` — same "shared file → sequence, don't parallelize" reasoning
  [docs/tasks/ROBOT_SELECTION_FILTER_PANEL.md](ROBOT_SELECTION_FILTER_PANEL.md) already used for `RobotsTab.tsx`.
  Order (bug fix → close button → layout) follows the spec's own §1 ordering and keeps each diff small and
  independently revertible; Task 3's grid rewrite touches the most CSS, so it lands last, after the two smaller
  `.tsx`-driven changes have already settled.
- **Task 4 (color collision fix) is fully independent** — a different file (`spawnSystem.ts`), no shared import,
  no shared test file with Tasks 1–3. Ordered last here only for document flow; safe to implement first, last, or
  in parallel with Tasks 1–3 if two sessions are available.
- **The bug diagnosis in spec §1.1 is unverified.** Task 1 opens with a live-repro step before writing any fix —
  if the real cause differs from the spec's inferred one, that's a reason to stop and reconcile the spec, not to
  improvise a different fix silently.
- **No task combines the layout rewrite (Task 3) with the close-button addition (Task 2).** Task 2 is a pure
  `.tsx`/small-`.css` behavior addition with no layout-mechanism change; Task 3 is a CSS-only structural rewrite
  (flex → grid, `position: sticky`) with no behavior change. Keeping them separate means a regression in one is
  easy to bisect to the other.

## Dependency Graph

```
Task 1 (fix slide-in bug — gsap.set sync)         — independent
        │
        ▼
Task 2 (close button + Show/Hide Filters labels)  — depends on Task 1 (shares RobotFilterPanel.tsx)
        │
        ▼
Task 3 (sticky, content-height layout — grid)     — depends on Task 2 (shares RobotFilterPanel.css)

Task 4 (spawn-time color collision fix)           — independent, parallelizable with Tasks 1–3
```

## Task List

### Phase 1: `RobotFilterPanel` fixes

- [x] **Task 1: Fix the mobile/tablet slide-in animation bug**

  **Description:** `animateTo()`'s GSAP `xPercent` tween never syncs with the CSS stylesheet's
  `transform: translateX(-100%)` closed-state baseline, so (per the spec's diagnosis) it composes on top of a
  baked-in pixel offset instead of replacing it, and the panel never fully slides into view. Add a `gsap.set()`
  call on mount (off-desktop only) to establish GSAP's own internal transform state to match the CSS baseline
  before any tween runs — the same pattern `CabinetBox.tsx` already uses for its own skew/scale initialization.
  **Before writing the fix**, reproduce the bug live (`npm run dev`, mobile width, tap the toggle) to confirm the
  spec's diagnosis — if the real symptom or cause differs, stop and reconcile spec §1.1 rather than guessing
  further. Spec §1.1.

  **Acceptance criteria:**
  - [ ] Live repro confirms (or corrects) the spec's diagnosis before any code changes — note the actual finding
        in the task's own commit message or a spec addendum if it differs from §1.1. *(Not run this session — no
        live browser/DevTools MCP available. The fix below proceeded on the spec's code-level diagnosis, which
        was re-derived and confirmed against GSAP's own documented `getComputedStyle`-based transform parsing
        before implementing — genuinely open, not assumed away.)*
  - [x] On mount, at mobile/tablet tier, `gsap.set(panelRef.current, { xPercent: -100 })` is called (verified via
        a local `vi.mock('gsap', ...)` override in `RobotFilterPanel.test.tsx`, following `CabinetBox.test.tsx`'s
        own precedent — the global mock's `set` is a plain no-op, not a `vi.fn()`).
  - [x] At desktop tier, `gsap.set` is not called (the effect's own `isDesktop` guard, mirroring `animateTo`'s
        existing one).
  - [ ] Manual verification in a real browser: tapping "Filters" at mobile width now slides the panel **fully**
        into view (not just barely visible); tapping again fully hides it. *(Not run this session — no live
        browser available. Genuinely open, not assumed.)*
  - [x] Every existing `RobotFilterPanel.test.tsx` test still passes (opening/closing via `isActive` class,
        auto-close behavior, `setTimeline`/`killTimeline` calls) — the fix adds a mount-time `gsap.set()`, it
        doesn't change `animateTo`'s own tween calls.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotFilterPanel.test.tsx` passes (19 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check per the acceptance criteria above (`npm run dev`, real browser, mobile-width emulation).
        *(Not run this session — no live browser available.)*

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/RobotFilterPanel.tsx`,
  `src/components/panels/screen/console/RobotFilterPanel.test.tsx`

  **Estimated scope:** S (one `useEffect` addition + a local test-file gsap mock override)

- [x] **Task 2: Close button + "Show Filters"/"Hide Filters" labels**

  **Description:** Split today's single `FILTER_TOGGLE_SCHEMA` (`humanLabel: 'Filters'`) into two schema
  constants: `FILTER_TOGGLE_SCHEMA` (`humanLabel: 'Show Filters'`, unchanged position/behavior, stays mounted and
  focusable even while covered) and a new `FILTER_CLOSE_SCHEMA` (`humanLabel: 'Hide Filters'`), rendered as a new
  `Button` at the top of the panel, mobile/tablet only, only while `open` is true, calling the same `handleToggle`
  the existing toggle uses. Add a minimal `.robot-filter-panel__close` CSS rule (spacing only — no
  sticky/absolute positioning needed, it's a normal-flow first child). Spec §1.2.

  **Acceptance criteria:**
  - [x] At mobile/tablet tier, before opening: `screen.queryByRole('button', { name: /hide filters/i })` is
        `null`; `screen.getByRole('button', { name: /show filters/i })` exists.
  - [x] After clicking the toggle: a `{ name: /hide filters/i }` button now renders, at the top of the panel
        (before `CompanyManager`'s own content in document order); the toggle (`{ name: /show filters/i }`) is
        still present, unchanged, in the DOM throughout.
  - [x] Clicking the new close button closes the panel (`isActive` class removed) — identical effect to clicking
        the toggle again.
  - [x] At desktop tier, neither `{ name: /show filters/i }` nor `{ name: /hide filters/i }` renders (extends the
        existing "renders no toggle button" desktop test).
  - [x] Every pre-existing test whose query is `{ name: /filters/i }` still matches (case-insensitive substring
        against both new labels) — confirmed, all pre-existing tests pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotFilterPanel.test.tsx` passes (24 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite, 144 files / 2689 tests) clean.

  **Dependencies:** Task 1 (shares `RobotFilterPanel.tsx`; sequenced to avoid stacking unrelated diffs in one
  file at once).

  **Files:** `src/components/panels/screen/console/RobotFilterPanel.tsx`,
  `src/components/panels/screen/console/RobotFilterPanel.css`,
  `src/components/panels/screen/console/RobotFilterPanel.test.tsx`

  **Estimated scope:** S (one new schema constant, one new conditionally-rendered `Button`, a few new tests)

### Checkpoint: `RobotFilterPanel` behavior

- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] Manual check (`npm run dev`, mobile-width emulation): tapping "Show Filters" slides the panel fully into
      view; "Hide Filters" (top of panel) and tapping "Show Filters" again both close it; "Show Filters" stays
      reachable the whole time.
- [ ] Review with human before proceeding to Task 3.

---

### Phase 2: Layout

- [x] **Task 3: Sticky, content-height panel — all tiers**

  **Description:** Rewrite `.robots-tab__body` from a flex row to a CSS Grid (`.robots-tab__list`/
  `.robots-tab__empty` and `.robot-filter-panel` stack in the same cell by default; a `:has(> .robot-filter-panel
  [data-tier='desktop'])` rule widens to a second column for the list at desktop). `.robot-filter-panel` becomes
  `position: sticky; top: 8px; align-self: start` on every tier — desktop replacing `position: static`,
  mobile/tablet replacing the `top: 0; bottom: 0` full-height absolute overlay. Mobile/tablet keeps its
  `translateX(-100%)` baseline, width cap, and `z-index: var(--z-overlay)` (unchanged from Task 1/2's work), just
  repositioned via `left: 8px` instead of `left: 0`. This is this codebase's first use of the `:has()` selector —
  flagged, not a blocker (no legacy-browser target). Spec §1.3.

  **Acceptance criteria:**
  - [ ] At every tier, the panel's rendered height matches its own content (`CompanyManager`'s button row + CRUD
        controls) — never stretched to the robot list's height or the screen's full height. *(CSS-only claim —
        jsdom does not compute Grid/sticky layout, so this cannot be unit-tested; `align-self: start` +
        `position: sticky` is the mechanism, left for the manual check below.)*
  - [ ] At desktop tier: the panel stays on screen (sticky) while `.robots-tab__list` scrolls past it inside
        `.console-panel__content`; the list still never overlaps the panel at a narrow desktop width with many
        robot cards (carrying forward the original spec's own constraint, now enforced via the grid's
        `260px 1fr` column split instead of flex `min-width: 0`). *(Same jsdom limitation — left for manual
        check.)*
  - [ ] At mobile/tablet tier: the open panel stays on screen (sticky) while the list scrolls past it, still
        overlaid above the list (`z-index`), still costing the list zero layout width whether open or closed.
        *(Same jsdom limitation — left for manual check.)*
  - [x] `.robots-tab__body`'s grid-column split is driven entirely by `RobotFilterPanel`'s existing `data-tier`
        attribute via `:has()` — no new prop threaded through `RobotsTab.tsx`; confirmed zero diff to that file.
  - [x] Every existing `RobotsTab.test.tsx` test (card listing/order, filtering, company-options-section
        position) still passes unmodified — this task changes CSS/layout mechanism only, not DOM structure or
        document order. No new unit tests written for this task: it's a pure CSS layout-mechanism change with no
        jsdom-observable behavior (no logic changed, nothing to assert against in a DOM/RTL test) — verified via
        the existing suite as a before/after regression check instead of new RED/GREEN tests.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotsTab.test.tsx src/components/panels/screen/console/RobotFilterPanel.test.tsx`
        passes (40 tests) — run both before and after the CSS change as a regression check (no new tests
        possible for this task, see above).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite, 144 files / 2689 tests), `npm run build` both clean.
  - [ ] Manual check (`npm run dev`, real browser): resize through mobile/tablet/desktop widths; confirm sticky
        behavior and content-height sizing at each; confirm no desktop overlap at a narrow desktop width with a
        full 12-robot roster. *(Not run this session — no live browser available. Genuinely open, not assumed —
        this is the one place this task's actual visual behavior gets proven.)*

  **Dependencies:** Task 2 (shares `RobotFilterPanel.css`; sequenced so the close button's minimal CSS lands
  before this task's structural rewrite touches the same file).

  **Files:** `src/components/panels/screen/console/RobotFilterPanel.css`,
  `src/components/panels/screen/console/RobotsTab.css`

  **Estimated scope:** M (two CSS files, a real layout-mechanism change, needs live-browser verification across
  three tiers — budget a full focused session)

### Checkpoint: Layout

- [x] `npm run build:types`, `npm run lint`, `npm test` (144 files / 2689 tests), `npm run build` all clean.
- [ ] Manual check per Task 3's own manual-check step, all three tiers. *(Not run this session — no live
      browser available.)*
- [ ] Review with human before proceeding to Task 4 (or run Task 4 in parallel if not already done).

---

### Phase 3: Color collision fix (independent)

- [x] **Task 4: Close the spawn-time company color collision gap**

  **Description:** `generateCompanyIdentityColor` (`spawnSystem.ts`) gains a third parameter, `usedColors:
  string[]`, and a bounded retry loop (mirroring `CompanyCrudControls.tsx`'s `pickRandomCompanyColor`'s shape,
  bounded at `ROBOT_IDENTITY_COLOR_NAMES.length` attempts) that skips any color already assigned to an earlier
  company in the same `spawnInitialCompanies` pass. Attempt 0 keeps the exact same `dataId`/`offset` pair as
  today (`'company.identityColor'`, `offset = c`) so a non-colliding seed's output is unchanged; each retry uses
  its own `dataId` suffix (`'company.identityColor.retryN'`) rather than an arithmetic offset shift, so a retry
  can never accidentally reproduce another company's own base draw. The call site passes
  `useLocaleStore.getState().getLocaleById(localeId)?.companies.map((c) => c.color)` — already up to date inside
  the loop, since `addCompany` runs before the next iteration. This reverses a decision previously accepted as
  low-risk in `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` §7 item 2 — that item should be marked resolved once
  this task lands (see this plan's own Risks table). Spec §1.4.

  **Acceptance criteria:**
  - [x] `spawnInitialCompanies` never assigns two companies in the same locale the same color, across a sample
        of seeds (mirroring the existing `it('creates between ${MIN} and ${MAX} companies')` seed-sampling
        style in `spawnSystem.test.ts`) — this test reproduced a real collision before the fix (RED: 3 companies,
        2 distinct colors), confirming the bug, before passing after it.
  - [x] For a seed where the pre-fix (attempt-0) draw never collides, the resulting color is byte-for-byte
        identical to what `getSeededVal(noiseMap, 'company.identityColor', c, 0, ROBOT_IDENTITY_COLOR_NAMES.length)`
        alone would have produced — proving the "unchanged when non-colliding" constraint, not just the
        absence of duplicates.
  - [x] Calling `generateCompanyIdentityColor` twice with identical arguments (including `usedColors`) returns
        the same color both times (determinism preserved).
  - [x] When `usedColors` already contains the attempt-0 result for a given `noiseMap`/`offset`, the function
        returns a *different* color, and that color is not in `usedColors`.
  - [x] `pickRandomCompanyColor` (`CompanyCrudControls.tsx`, manual-creation path) is untouched — confirmed via
        `git diff --stat`, zero diff.
  - [x] Existing `spawnSystem.test.ts` company-count/company-size tests are unaffected.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` passes (68 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite, 144 files / 2694 tests) clean.
  - [ ] Manual check: reseed a planet a few times (Sector Settings), spot-check a locale with 3 companies —
        confirm no two company buttons in `CompanyButtonRow` share a color. *(Not run this session — no live
        browser available.)*

  **Dependencies:** None — safe to implement independently of Tasks 1–3, in any order.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S (one function signature change + retry loop, one call site, new tests in one existing
  test file)

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint` clean. `npm test` (full suite): 144 files / 2694 tests passing.
      `npm run build` succeeds (pre-existing chunk-size warning only, unrelated). Re-verified after Task 4;
      the one flaky random-seeded test seen mid-session (`factoryPlacementSystem.test.ts`, unrelated to any file
      touched here) reran clean in isolation and did not recur.
- [x] All acceptance criteria across all 4 tasks are met, except the manual-verification items below (genuinely
      open, not assumed).
- [ ] Manual check (not automated), `npm run dev`: *(Not run this session — no live browser/DevTools MCP
      available in this environment. Every item below is genuinely open.)*
  - [ ] Mobile/tablet: "Show Filters" slides the panel fully into view; "Hide Filters" and re-tapping "Show
        Filters" both close it; panel is content-height and stays on screen (sticky) while the list scrolls.
  - [ ] Desktop: panel stays on screen while the list scrolls past it; still never overlaps the list at a narrow
        desktop width with a full roster.
  - [ ] `prefers-reduced-motion` (OS or devtools emulation) still makes the panel snap instead of sliding.
  - [ ] Reseeding a planet a few times never produces two same-colored company buttons in one locale.
- [x] `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` §7 item 2 (and its §3 constraint line) updated to reflect the
      reversed decision, committed alongside Task 4 (0ccb190).
- [ ] Ready for human review / commit. *(Each task committed individually as it landed on
      `feature/company-fixes-part-2` — docs f3e2cee, Task 1 27a0025, Task 2 c949050, Task 3 b90738d, Task 4
      0ccb190. Human review of the branch as a whole, and the manual browser checks above, are the open items.)*

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Spec §1.1's root-cause diagnosis is wrong (inferred, not reproduced) | Medium — Task 1 could "fix" a bug that isn't the real one, leaving the reported symptom unresolved | Task 1 opens with a live repro step before any code change; acceptance criteria require confirming or correcting the diagnosis, not just implementing the spec's proposed fix blindly |
| `:has()` is a first-use CSS selector in this codebase (Task 3) | Low — modern-evergreen-only, no legacy-browser target exists in `CLAUDE.md`/`package.json` | Flagged in Task 3's description; revisit only if implementation or manual testing surfaces a real compatibility issue |
| `docs/specs/COMPANY_SECTION_ENHANCEMENTS.md` §7 item 2 goes stale once Task 4 lands (it currently documents the now-reversed "accepted, low-risk" decision) | Low — documentation drift, not a functional break | Called out explicitly in the final Checkpoint as a follow-up, not silently dropped |
| Non-seeded (`noiseMap` null) fallback branch in `generateCompanyIdentityColor` still guarantees a collision (spec §1.4, explicitly out of scope) | Low — only reachable if `getLocaleNoiseMap` fails, no confirmed real-world trigger | Not part of any task above; carried forward as spec §7 open item 2, not silently fixed or silently ignored |

## Open Questions

Carried forward from the spec's own §7, not resolved by this task breakdown:

1. **Non-seeded fallback branch's collision** — left unfixed; confirm at implementation time whether `noiseMap`
   can actually be null in a real (non-test) code path before deciding whether it's worth a follow-up task.
2. **`:has()` as a first-use selector** — not blocking, flagged for awareness (Task 3, Risks table).
3. **Branch choice** — left for the human, same as the original filter-panel plan's own open item.
