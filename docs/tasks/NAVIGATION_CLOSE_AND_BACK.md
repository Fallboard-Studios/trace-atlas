# Implementation Plan: Close and Back

Source spec: [docs/specs/NAVIGATION_CLOSE_AND_BACK.md](../specs/NAVIGATION_CLOSE_AND_BACK.md). Source intent:
[docs/intent/navigation-close-and-back.md](../intent/navigation-close-and-back.md). Backlog slot:
[75](../todo/backlog.md#75-navigation-close-back-the-browsers-back-button-and-the-navs-width), plan.md Stage 5.

**Status:** plan written 2026-11-15 from the spec. Tasks 0 and 1 built 2026-11-15 on
`feature/navigation-close-and-back` (stacked on the unpushed `docs/backlog-75-intent`). Gates 1 and 2 passed the same
day: the guard design stands; the row is words, in the plate, with a plain "Back". Crawford accepted spec §7.2's
defaults. Next: Phase 1.

## Overview

The app gains a trail of screens in `uiStore`, a `back()` in `navActions.ts`, a row with Back and Close on every open
screen, and a hook that makes the browser's Back button run the same `back()`. Last, on trial, the rail loses its
entity list and its width change. Eighteen tasks in seven phases:

0. **The two early gates** (Tasks 0–1): a probe page for the browser's Back button, and the sketch of the row.
   Crawford presses and looks once, for both.
1. **The trail** (Tasks 2–6, Part A): the store field, the steps, `back()`, the deleted-company rule, the reset on a
   new world.
2. **The row** (Tasks 7–9, Part B): the component, its mount in `ContentPane`, focus when it unmounts.
3. **The browser's Back** (Tasks 10–12, Part C): the press handler, the guard entry, the mount.
4. **The rail** (Tasks 13–15, Part D): the list and the tween out, then the dead navActions, then the dead store field.
5. **Docs** (Task 16).
6. **The records** (Task 17), after the merge.

## Architecture Decisions

- **The two early gates share one stop.** Spec §5.4 puts Gate 1 before Part A and Gate 2 before Part B. Both need
  Crawford and neither needs code from the other, so both are prepared first and he is asked once. Part A does not
  depend on Gate 2: if the sketch needs a second round, Phase 1 goes ahead while it is redrawn.
- **Gate 1 can change the plan.** If the probe fails, spec §7.1 C4 (one history entry per step) replaces the guard
  design, the trail becomes a list with a cursor, and Phases 1 and 3 are re-planned before any of their tasks start.
  That is why Task 0 comes before Task 2.
- **The store's surface is three names:** `navTrail: NavStop[]`, `setNavTrail(trail)` and `resetNav()`. Every rule
  about the trail (recording, the cap, same-screen, removal, restore) lives in `navActions.ts`; the store only holds
  the array. This pins spec §4's provisional `popNavStop`.
- **A screen's identity is one string**, from a private `screenKey` in `navActions.ts`: `deck`, `probes`,
  `robot:<id>`, `company:<id>`, `all`, `fleetParams`. Under Probes a robot wins over a company and a company over All
  Probes, as `ProbesBranch` routes. On Fleet Params the entity fields are ignored: a robot clicked in the world there
  only moves the halo.
- **Recording is one private helper**, called at the top of `selectBranch`, `selectEntity` and `goHome` with the
  destination's key. It appends the current screen's stop unless the destination is the screen showing, and applies
  the cap. `back()` and the deleted-company action never call it.
- **Restore order matters.** `selectRobot` clears the robot tabs and `setFleetParamsSection` clears its sub-tab, so
  `back()` runs the clean slate, then the tile and entity, then the robot tabs, then Fleet Params' section, then its
  sub-tab. Task 3's fixtures use non-default tabs so a wrong order fails.
- **Until Part D, a Probes-list stop restores with the list open**, as `selectBranch('probes')` shows it. A stop does
  not carry `expandedTopLevelBranch`, so Part D removes nothing from the trail.
- **The deleted-company rule is its own navAction**, `closeDeletedCompany(companyId)` (spec §7.1 A5). It removes
  every stop naming the company, then drops any stop left next to one for the same screen and any last stop that is
  the Probes list, then shows the Probes list without recording a step. So Back never shows the same screen twice
  in a row.
- **The nav reset is the store's**, called by `retransmitWorld` where it clears the selection today (spec §1.4, A4).
  One existing test pins the opposite (`worldTransition.test.ts`, "clears selectedRobotId but leaves activeHubTile
  untouched") and is rewritten in Task 6.
- **The content entries land with the row** (Task 7), not before it, so no key exists without a consumer.
- **The guard is pushed from a `uiStore` subscription** inside `useBrowserBack`. Zustand calls subscribers
  synchronously, so the `pushState` runs inside the click that made the step (spec §3, §7.1 C2). The marker is
  `{ traceAtlasNav: 'guard' }` merged into the existing `history.state`.
- **`NavBox`'s `expanded` prop stays** if `RosterBoard`'s "+ New Company" box still passes it (Task 13 checks);
  `NavPanel` only stops passing it.
- **Part D is three tasks at the end** so the trial reverts as three commits and nothing in Parts A–C reads the list's
  state.

## Dependency Graph

```
Task 0 (probe page)        Task 1 (sketch)
        │                        │
        └────── Gates 1 + 2 ─────┘
                    │
          Task 2 (navTrail in the store)
                    │
          Task 3 (every action records a step)
                    │
          Task 4 (back())
              │           │
   Task 5 (deleted     Task 6 (resetNav; the world rebuild)
     company)             │
              └─────┬─────┘
              Checkpoint A
          ┌─────────┴──────────┐
 Task 7 (ScreenExitRow)   Task 10 (the press handler)
          │                    │
 Task 8 (mount; the plate) Task 11 (the guard entry)
          │                    │
 Task 9 (focus)           Task 12 (mount in ScreenViewport)
          │                    │
    Checkpoint B          Checkpoint C
          └─────────┬──────────┘
          Task 13 (the list and the tween out)
                    │
          Task 14 (dead navActions out)
                    │
          Task 15 (dead store field out)
                    │
          Gate 3: Crawford's look
                    │
          Task 16 (docs) → Task 17 (records, after the merge)
```

Tasks 0 and 1 are independent. Phases 2 and 3 are independent of each other once Checkpoint A has passed.

## Task List

Every task names its **Proof**: **RED test** for a behaviour change (a test that imports or renders the code and
fails first); **Look** for a CSS-only or visual task; **Read** for a docs, copy or deletion task (CLAUDE.md, "Tests
exercise code, not text"). Per Crawford's rule, every new RED test is mutation-checked at its phase's checkpoint.

### Phase 0: The two early gates

- [x] **Task 0: `docs/sketches/tools/browser-back-probe.html` — the probe for Gate 1**

  **Description:** One self-contained page with the guard design from spec §7.1 C1 and nothing of the app: a counter
  standing in for the trail, a "step" button (adds one, and pushes the guard on the first step from zero), the
  `popstate` handler from spec §4, a "change the address" button (a `replaceState` that edits a query param, as the two
  mirror writers do), and an on-page log of every `popstate`, `pushState`, `back()` and `forward()` with the address at
  that moment. One toggle, "rewrite the entry on landing", tries the fix for spec §7.1 C3's known hole. The page lists
  spec §5.4's five checks so they can be ticked on a phone. It is kept after the gate: a later browser or Safari
  (spec §7.2 Q4) is checked with the same page.

  **Proof:** Look — Crawford opens it from the dev server (`npm run dev -- --host` for the Pixel) and runs the five
  checks in desktop Chrome, desktop Firefox and Chrome on the Pixel.

  **Acceptance criteria:**
  - [x] The page runs with no build step and no import from `src/`.
  - [x] Each of the five checks can be run from the page's own buttons and read from its log.
  - [x] The toggle shows whether rewriting the landed entry closes the known hole.

  **Verification:**
  - [x] Opened once in desktop Chrome before handing over: the step button, the address button and the log work.
        (Headless Chrome over CDP: three steps pushed one guard, three `history.back()` calls each stepped and
        returned to the guard, a fourth on an empty trail left the page; no console errors.)
  - [x] `npm run lint` clean. (ESLint covers `.ts`/`.tsx` only; neither page is linted.)

  **Dependencies:** None.

  **Files:** `docs/sketches/tools/browser-back-probe.html`

  **Estimated scope:** S (one standalone page)

- [x] **Task 1: `docs/sketches/navigation-close-and-back.html` — the sketch for Gate 2**

  **Description:** The row drawn on the desk and on the phone at 320 px, against the power corner at its real size
  (the rocker's variables from `src/index.css`), with the robot screen's sticky band under it on the phone. Toggles:
  glyph, word, or both; Back naming its destination or not; the row in the plate (spec §7.1 B1) or in the top band.
  It shows the height the row costs each screen. It follows the sketch pages' conventions: each frame is
  `section.frame` with its toggles in a sticky `div.bar`, and page-wide toggles sit in `.fixedpanel`.

  **Proof:** Look — Crawford names the look, the row's place and whether Back names where it goes.

  **Acceptance criteria:**
  - [x] Both shells are drawn, the phone at 320 px, with Close clear of the rocker in every toggle state. (In the
        plate and on the desk's top band, yes. In the phone's top band at 320 px, no: the controls line needs 285 px
        and has 225, and Close runs under the rocker. The page reads this out rather than hiding it; it is Gate 2's
        evidence against that option, and the "band on desk, plate on phone" toggle is the alternative.)
  - [x] Every option spec §1.5 leaves to the sketch has a toggle.

  **Verification:**
  - [x] Opened in a browser at desk width and at 320 px. (Headless Chrome at 1500, 1300 and 320 px; no
        horizontal page scroll at 320.)
  - [x] `npm run lint` clean. (ESLint covers `.ts`/`.tsx` only.)

  **Dependencies:** None.

  **Files:** `docs/sketches/navigation-close-and-back.html`

  **Estimated scope:** S (one sketch page)

### Checkpoint: Gates 1 and 2 (stop and report)
- [x] Gate 1: the five checks pass in the three browsers, or the failure is recorded and the build stops for a
      re-plan on spec §7.1 C4. The results, and whether the known hole needs the ask-first address helper, are written
      into the spec. (Passed 2026-11-15. The address helper stays an ask-first, looked at again at Checkpoint C.)
- [x] Gate 2: Crawford's answers are written into the spec (§1.5, §7.1 B1–B2, §7.2 Q5), and Tasks 7–8 are adjusted
      if the row moves to the top band. (Words, the plate, a plain "Back", no lore label. The row stays in the plate,
      so Tasks 7–8 stand as written.)
- [x] Crawford's answers to spec §7.2 Q1–Q3 and Q6, if he gives them here, are written into the spec and this plan.
      (All six defaults accepted.)

---

### Phase 1: The trail (Part A)

- [x] **Task 2: `uiStore.ts` — `NavStop` and `navTrail`**

  **Description:** The `NavStop` interface (spec §4, eight fields), the field `navTrail: NavStop[]` (initially empty)
  and `setNavTrail(trail)`. No caller yet. `uiStore.test.ts`'s field table (`NAV_FIELDS`) gains `navTrail`, and its
  JSON round-trip case then covers it.

  **Proof:** RED test — `src/stores/uiStore.test.ts`: the initial trail is empty; `setNavTrail` replaces it; the trail
  is unchanged by `setPowerOff` then `setPowerOn`.

  **Acceptance criteria:**
  - [x] `navTrail` starts as `[]` and holds exactly what `setNavTrail` was given.
  - [x] A trail of two stops survives `setPowerOff` and `setPowerOn` unchanged.
  - [x] The store's initial state still round-trips through JSON.

  **Verification:**
  - [x] `npx vitest run src/stores/uiStore.test.ts` passes. (RED first: 6 failures, the field table and the five
        new cases; 66 pass after.)
  - [x] `npm run build:types`, `npm run lint` clean. (Lint's four warnings are older, in `Scenery.tsx` and
        `gemShape.tsx`.)

  **Dependencies:** Gate 1.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`

  **Estimated scope:** XS (one field, one setter)

- [x] **Task 3: `navActions.ts` — every navigation records a step**

  **Description:** The private `screenKey` and the recording helper (Architecture Decisions). `selectBranch`,
  `selectEntity` and `goHome` call it first, with their destination. The stop holds the screen and the four tab
  fields as they are at that moment. The trail is capped at 50 (`NAV_TRAIL_MAX`), dropping the oldest.

  **Proof:** RED test — `src/components/panels/screen/nav/navActions.test.ts`: after deck → robot the trail is one
  deck stop; after company (on a non-default section and sub-tab) → robot the last stop names the company with both
  tabs.

  **Acceptance criteria:**
  - [x] Each of the three actions appends the screen being left, with its four tab fields.
  - [x] Going to the screen already showing appends nothing (Fleet Params pressed on Fleet Params, the same robot
        picked twice), and still resets the tabs as today.
  - [x] The four tab setters append nothing.
  - [x] The 51st step drops the oldest stop.
  - [x] Every existing `navActions.test.ts` case passes unmodified. (No case changed. The `dirtyStore` helper now
        also sets an empty trail: `pressBranchBox`'s "does what selectBranch does" cases dirty the store twice and
        compare the whole state, so the second run started with the first run's stop.)

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav` passes. (RED first: 11 of the 20 new cases failed; the
        nine that passed are the "no step" guards, which Checkpoint A's same-screen mutation must kill. Also run:
        `src/components/panels/screen`, `src/components/robot`, `src/components/company`, 3,128 pass.)
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `src/components/panels/screen/nav/navActions.test.ts`

  **Estimated scope:** S (one helper, three call sites, its tests)

- [x] **Task 4: `navActions.ts` — `back()`**

  **Description:** `back()` takes the last stop off the trail and shows it in the restore order above; with an empty
  trail it shows the deck. It never records a step, and it runs the clean slate, so it shuts the phone sheet.

  **Proof:** RED test — `navActions.test.ts`: company on Envelope › Character → member robot → `back()` shows that
  company on Envelope › Character.

  **Acceptance criteria:**
  - [x] deck → robot → `back()` shows the deck with an empty trail.
  - [x] Fleet Params on a non-default section and sub-tab → Probes → `back()` shows Fleet Params on both.
  - [x] robot → `goHome()` → `back()` shows the robot.
  - [x] `back()` appends nothing; on an empty trail it shows the deck; it sets `isNavPanelOpen` false.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav` passes. (RED first: all 15 new cases failed, `back` not a
        function; 271 pass after.)
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `src/components/panels/screen/nav/navActions.test.ts`

  **Estimated scope:** S (one action and a restore helper)

- [ ] **Task 5: `navActions.ts`, `CompanyCrudControls.tsx` — a deleted company leaves the trail**

  **Description:** `closeDeletedCompany(companyId)` as in Architecture Decisions. `handleConfirmDelete` calls it in
  place of `selectBranch('probes')`.

  **Proof:** RED test — `navActions.test.ts`: with the trail Probes list → company X and X's screen showing,
  `closeDeletedCompany('X')` shows the Probes list and leaves no stop naming X.

  **Acceptance criteria:**
  - [ ] No stop names the deleted company, and the delete itself records no step.
  - [ ] No two neighbouring stops name the same screen afterwards, and the last stop is not the Probes list.
  - [ ] In `CompanyCrudControls.test.tsx`, confirming a delete shows the Probes list and a following `back()` shows
        the screen before the company, not the Probes list again.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav src/components/company/CompanyCrudControls.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `src/components/panels/screen/nav/navActions.test.ts`,
  `src/components/company/CompanyCrudControls.tsx`, `src/components/company/CompanyCrudControls.test.tsx`

  **Estimated scope:** S (one action, one call site)

- [ ] **Task 6: `uiStore.ts`, `worldTransition.ts` — a world rebuild resets the nav**

  **Description:** `resetNav()` sets the deck's state in one write: no tile, no robot, no company (`allRobotsSelected`
  true), All Probes off, the robot tabs null, Fleet Params on its default section with no sub-tab, nothing expanded,
  the phone sheet and the Move panel shut, an empty trail. It leaves power, the scene wash and the clock fields alone.
  `retransmitWorld` calls it where it calls `selectRobot(null)` and `selectAllRobots()` today, under the same
  condition. The existing case "clears selectedRobotId but leaves activeHubTile untouched" is rewritten to the new
  rule.

  **Proof:** RED test — `src/systems/worldTransition.test.ts`: from an open robot screen with a three-stop trail, a
  coordinates retransmit leaves the deck and an empty trail.

  **Acceptance criteria:**
  - [ ] `resetNav()` leaves every nav field at the deck's value and `navTrail` empty; `isPoweredOn` and `sceneWash`
        are unchanged.
  - [ ] Every rebuilding mode of `retransmitWorld` resets the nav; `aspectsOnly`, `loadingOnly` and the no-op leave
        the screen and the trail as they were.
  - [ ] The suites that mock `uiStore` with a fixed shape still load (`PowerRockerSwitch.test.tsx`,
        `PowerRockerSwitch.light.test.tsx`, `Tablet.test.tsx`, `SleeveContainer.test.tsx`, `powerController.test.ts`).

  **Verification:**
  - [ ] `npx vitest run src/stores/uiStore.test.ts src/systems/worldTransition.test.ts` passes, then the five mocking
        suites named above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2. (Independent of Tasks 3–5.)

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/systems/worldTransition.ts`,
  `src/systems/worldTransition.test.ts`

  **Estimated scope:** S (one action, one call site, one rewritten test)

### Checkpoint A: The trail
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean (full suite; note any unrelated failure by name).
- [ ] Mutation checks, each killed by a test: the same-screen check removed; the cap removed; the robot tabs restored
      before the entity; `back()` recording a step; `resetNav()` leaving the trail.
- [ ] No component reads `navTrail` yet, and no screen looks different.
- [ ] Reviewed with Crawford before Phases 2 and 3.

---

### Phase 2: The row (Part B)

- [ ] **Task 7: `ScreenExitRow.tsx`, `nav.ts` — Back and Close**

  **Description:** A stateless component in `nav/`: two schema-driven `Button`s, Back calling `back()` and Close
  calling `goHome()`, labelled from two new entries, `nav.back` and `nav.close` (the wording Gate 2 gave). The markup
  and the stylesheet follow the approved sketch. Not mounted yet.

  **Proof:** RED test — `src/components/panels/screen/nav/ScreenExitRow.test.tsx`: from a robot's screen reached from
  the Probes list, pressing Back shows the Probes list; pressing Close shows the deck (both read from the store).

  **Acceptance criteria:**
  - [ ] Back runs `back()` and Close runs `goHome()`, asserted on the store's state.
  - [ ] Both buttons carry their content labels as accessible names; no display string is written in the component.
  - [ ] `src/content/content.test.ts` passes with the two new entries.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav src/content/content.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint A, Gate 2.

  **Files:** `src/components/panels/screen/nav/ScreenExitRow.tsx`, `ScreenExitRow.css`, `ScreenExitRow.test.tsx`,
  `src/content/copy/nav.ts`

  **Estimated scope:** S (one small component, two content entries)

- [ ] **Task 8: `ContentPane.tsx`, `ContentPane.css`, `ConsolePanel.css` — the row on every open screen**

  **Description:** `ContentPane` renders `ScreenExitRow` above `ConsolePanel`. The plate becomes a column: the row at
  its natural height, the console filling the rest and scrolling inside itself. `ContentPane.tsx`'s header comment,
  which names the Deck box as the close control, is corrected. If Gate 2 moved the row to the top band, this task
  mounts it there instead and pads its right end by `--power-corner-width`.

  **Proof:** RED test — `src/components/panels/screen/console/ContentPane.test.tsx`: the row renders with a tile
  active and not on the deck. Then a Look for the stylesheet.

  **Acceptance criteria:**
  - [ ] The row renders on the Probes list, a robot, a company, All Probes and Fleet Params, and not on the deck.
  - [ ] The row is not inside `ConsolePanel`'s scroller.
  - [ ] Look: at 320 px, 768 px and wide the row stays put while each screen scrolls, Close is clear of the rocker,
        and the robot screen's phone band sits under the row.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console` passes.
  - [ ] The Look above in a live browser, recorded in the commit or flagged at Checkpoint B.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/components/panels/screen/console/ContentPane.tsx`, `ContentPane.css`, `ContentPane.test.tsx`,
  `ConsolePanel.css`

  **Estimated scope:** S (one mount, two stylesheets)

- [ ] **Task 9: `Header.tsx` — focus when the row unmounts**

  **Description:** Close, or a Back that lands on the deck, removes the button that had focus. On the desk the rail's
  `useRescueLostFocus` should already move focus to the Deck box; this task adds the case that shows it. On the phone
  nothing rescues focus today, so `Header` gains the same hook for the phone shell, aimed at the menu toggle and
  triggered by the open tile (spec §7.1 B3). It is off while the nav sheet is open, since the sheet's dialog hands
  focus back itself.

  **Proof:** RED test — `src/components/panels/screen/Header.test.tsx`: on the phone shell, a focused element that
  leaves the document as the tile becomes null leaves focus on the menu toggle.

  **Acceptance criteria:**
  - [ ] Phone: after the focused row button unmounts, the menu toggle has focus; focus on a live element is left alone.
  - [ ] Desk: with Close focused, pressing it leaves focus on the Deck box. If this case passes on today's code it is
        kept as a pin and said so in the commit.
  - [ ] After a Back to another open screen, focus is still on the Back button.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/Header.test.tsx src/components/panels/screen/nav` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 8.

  **Files:** `src/components/panels/screen/Header.tsx`, `src/components/panels/screen/Header.test.tsx`,
  `src/components/panels/screen/nav/NavPanel.test.tsx`

  **Estimated scope:** S (one hook call, three cases)

### Checkpoint B: The row
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Mutation checks: Back wired to `goHome`; the row rendered on the deck; the phone rescue left on while the sheet
      is open.
- [ ] Spec §5.3's first run (the trail, by hand) done on both shells with the on-screen controls.
- [ ] Crawford's look at the row against the sketch.

---

### Phase 3: The browser's Back (Part C)

- [ ] **Task 10: `useBrowserBack.ts` — a Back press runs `back()`**

  **Description:** The hook adds a `popstate` listener in an effect and removes it on unmount. The handler is spec
  §4's: a guard state does nothing; with the power off or the trail empty it calls `history.back()`; otherwise it
  runs `back()` and calls `history.forward()`. It does nothing outside a browser, and a throwing history call is
  caught. Not mounted yet; the test renders it through a small host component.

  **Proof:** RED test — `src/components/panels/screen/nav/useBrowserBack.test.tsx`: with the power on and a two-stop
  trail, a dispatched non-guard `popstate` leaves a one-stop trail and one `history.forward()` call.

  **Acceptance criteria:**
  - [ ] Power on, trail not empty: one press makes exactly one `back()` step and one `forward()` call.
  - [ ] Trail empty: one `history.back()` call and no state change.
  - [ ] Power off, trail not empty: one `history.back()` call and the trail unchanged (spec §7.2 Q1's default).
  - [ ] A `popstate` carrying the guard marker changes nothing and calls nothing (spec §7.2 Q2's default).
  - [ ] After unmount a `popstate` changes nothing.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/useBrowserBack.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint A.

  **Files:** `src/components/panels/screen/nav/useBrowserBack.ts`, `useBrowserBack.test.tsx`

  **Estimated scope:** S (one hook, one handler)

- [ ] **Task 11: `useBrowserBack.ts` — the guard entry**

  **Description:** Inside the same effect, a `uiStore` subscription keeps one rule: while the power is on and the
  trail is not empty, the current history entry is a guard. When it is not, the hook pushes one entry with the
  marker and the URL unchanged, synchronously in the subscriber. The subscription is removed on unmount.

  **Proof:** RED test — `useBrowserBack.test.tsx`: the first step from an empty trail calls `pushState` once, with the
  marker and the current URL.

  **Acceptance criteria:**
  - [ ] The first step from an empty trail pushes exactly one guard; later steps push none while `history.state`
        carries the marker.
  - [ ] The push keeps the existing `history.state` fields and the path, query and hash.
  - [ ] With steps on the trail and a current entry that is not a guard (the known hole), the next step pushes one.
  - [ ] No push happens from the `popstate` handler, with the power off, or with an empty trail.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/useBrowserBack.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/nav/useBrowserBack.ts`, `useBrowserBack.test.tsx`

  **Estimated scope:** S (one subscription)

- [ ] **Task 12: `ScreenViewport.tsx` — the hook is mounted in both power states**

  **Description:** `ScreenViewport` calls `useBrowserBack()`. It is mounted whether the power is on or off, so a press
  on the off screen reaches the handler.

  **Proof:** RED test — `src/components/panels/physical/ScreenViewport.test.tsx`: with the viewport rendered powered
  on and a one-stop trail, a dispatched `popstate` empties the trail.

  **Acceptance criteria:**
  - [ ] Powered on, a press steps the trail; powered off, it passes on and the trail stands.
  - [ ] Unmounting the viewport removes the listener and the subscription.
  - [ ] `Tablet.test.tsx`, which mocks `uiStore`, still loads.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/physical src/components/tablet` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 11.

  **Files:** `src/components/panels/physical/ScreenViewport.tsx`, `ScreenViewport.test.tsx`

  **Estimated scope:** XS (one call, one case)

### Checkpoint C: The browser's Back (stop and report)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Mutation checks: the power check removed; `forward()` removed; the guard pushed on every step; the marker
      check inverted.
- [ ] Spec §5.3's browser, power and address-bar runs, by Crawford in a real browser, since only the real button
      shows the browser's own rules: desktop Chrome, desktop Firefox, Chrome on the Pixel.
- [ ] If the known hole shows in the app as it did on the probe, stop: the address helper is an ask-first (spec §3)
      and gets its own task only on Crawford's yes.

---

### Phase 4: The rail (Part D, on trial)

- [ ] **Task 13: `NavPanel.tsx`, `NavPanel.css` — one width, no list**

  **Description:** `NavPanel` stops rendering `NavEntityList`, stops passing `expanded`, drops `useNavPanelWidth` with
  its GSAP and `timelineMap` imports, and calls `selectBranch` for every box. The rescue hook's trigger loses the
  expanded branch. In `NavPanel.css`, `--nav-panel-width` is `--nav-panel-rest`; `--nav-panel-wide`,
  `--nav-panel-expand` and the list's sheet rule go. `NavEntityList.tsx`, its stylesheet and its test are deleted, and
  `useEntityRoster.ts`'s comment no longer names it. `NavPanel.test.tsx`'s "Probes expands in place" group and the
  sheet cases about the list are removed. Its focus group opens the list to get a box that leaves; those cases are
  re-pointed at Task 9's row button, which is now the only focused control a pick removes.

  **Proof:** RED test — `src/components/panels/screen/nav/NavPanel.test.tsx`: pressing Probes on the Probes list
  changes no nav state (today it toggles the list). The rest is deletion: Read, and a Look.

  **Acceptance criteria:**
  - [ ] The panel renders three boxes and no entity list on either shell; no box carries `aria-expanded`.
  - [ ] Pressing Probes from a robot's screen shows the Probes list; pressing it there changes nothing.
  - [ ] No `nav-panel-width` timeline is ever registered.
  - [ ] Look: the rail is 124 px on every screen and the content's left edge never moves; the phone sheet shows three
        boxes.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav` passes.
  - [ ] The Look above, recorded in the commit or flagged at Gate 3.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoints B and C.

  **Files:** `src/components/panels/screen/nav/NavPanel.tsx`, `NavPanel.css`, `NavPanel.test.tsx`,
  `NavEntityList.tsx` / `.css` / `.test.tsx` (deleted), `useEntityRoster.ts` (comment)

  **Estimated scope:** M (three edited, three deleted, one comment)

- [ ] **Task 14: `navActions.ts` — the list's actions go**

  **Description:** `pressBranchBox`, `expandsInPlace`, `probesHasEntity` if nothing else reads it, and `open()`'s
  `expand` argument are deleted; `selectBranch`, `selectEntity`, `goHome` and the restore helper stop writing
  `expandedTopLevelBranch`. The module's header comment and `selectEntity`'s lose their sentences about the list.
  `navActions.test.ts` loses its `pressBranchBox` group and the "only Probes expands in place" case, and the
  remaining cases stop asserting the field.

  **Proof:** Read — deletion only. The type check proves no caller is left.

  **Acceptance criteria:**
  - [ ] Nothing in `src/` imports `pressBranchBox` or `expandsInPlace`.
  - [ ] Every remaining `navActions.test.ts` case passes, the trail's included.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 13.

  **Files:** `src/components/panels/screen/nav/navActions.ts`, `navActions.test.ts`

  **Estimated scope:** S (deletions in two files)

- [ ] **Task 15: `uiStore.ts` — `expandedTopLevelBranch` goes**

  **Description:** The field, its setter and its doc comment are deleted (the `TopLevelBranch` type stays: the branch
  tables use it). `resetNav()` stops writing it. The tests that set or read it are updated: `uiStore.test.ts` (the
  field table, the power case, the field's own group, which is deleted), `Robot.test.tsx`, `RosterTile.test.tsx`,
  `NavBreadcrumb.test.tsx`. `Robot.tsx`'s comment about the list collapsing is corrected.

  **Proof:** Read — deletion only. The type check proves no reader is left.

  **Acceptance criteria:**
  - [ ] `expandedTopLevelBranch` appears nowhere in `src/`.
  - [ ] The four test files pass with no case weakened beyond dropping that field.

  **Verification:**
  - [ ] `npx vitest run src/stores/uiStore.test.ts src/components/robot/Robot.test.tsx src/components/panels/screen/screens/RosterTile.test.tsx src/components/panels/screen/nav` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 14.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/components/robot/Robot.tsx`,
  `src/components/robot/Robot.test.tsx`, `src/components/panels/screen/screens/RosterTile.test.tsx`,
  `src/components/panels/screen/nav/NavBreadcrumb.test.tsx`

  **Estimated scope:** M (six files, all small deletions)

### Gate 3: The rail (stop and report)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Spec §5.3's last run (the look) on both shells.
- [ ] Crawford keeps the trial, or calls the fallback (the rail fixed at 200 px with the list kept). The fallback is
      Tasks 13–15 reverted and one new task, planned then; it is not built unasked.

---

### Phase 5: Docs

- [ ] **Task 16: `UI_SHELL.md`, `ANIMATION_SYSTEM.md`, the spec — the docs read as the code is**

  **Description:** `UI_SHELL.md`: the nav panel section (three plain boxes, one width), the `navActions.ts` list
  (`back`, `closeDeletedCompany`, the step rule; `pressBranchBox` gone), the content surface (the row; and the Deck's
  "Welcome card" sentence, which the code no longer has), the `uiStore` table (`navTrail` in, `expandedTopLevelBranch`
  out) and a short section on the browser's Back. `ANIMATION_SYSTEM.md`: its mention of the `nav-panel-width`
  timeline. The spec gains "8. As built": what each gate decided, every default kept or changed, and anything built
  differently from §1–§4. If Gate 3 called the fallback, the docs describe that instead.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every name the docs give exists in the shipped source, spot-checked one by one.
  - [ ] No doc describes the entity list, the width tween or a route to the deck that is gone.

  **Verification:**
  - [ ] Manual review against the final code.
  - [ ] `npm run lint` clean.

  **Dependencies:** Gate 3.

  **Files:** `docs/UI_SHELL.md`, `docs/ANIMATION_SYSTEM.md`, `docs/specs/NAVIGATION_CLOSE_AND_BACK.md`

  **Estimated scope:** S (three docs)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every acceptance criterion above is met, and spec §5.5's list holds apart from the archive.
- [ ] Any look or browser run not done in the session is named here, never skipped silently.
- [ ] Ready for Crawford's review and PR.

---

### Phase 6: The records (after the merge)

- [ ] **Task 17: `backlog.md`, `plan.md`, the archive — backlog 75 closed**

  **Description:** Backlog 75 moves whole to `docs/todo/archive/backlog-archive.md` under a "Closed" line naming the
  PR, with its links rebased; it leaves no stub, so every inbound link is repointed (backlog 77 links to it). Its
  plan.md line is deleted. If spec §7.2 Q4 stands, Safari's check of the browser's Back is added to plan.md's parked
  Safari line.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No link in `docs/` points at `backlog.md#75-`.
  - [ ] plan.md's Stage 5 no longer lists 75.

  **Verification:**
  - [ ] A search of `docs/` for `backlog.md#75-` finds nothing.

  **Dependencies:** The merge.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/todo/archive/backlog-archive.md`

  **Estimated scope:** XS (docs only)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A real browser skips the guard entry, or a fast double press leaves the app | High | Task 0 and Gate 1 come before any trail code; the fallback (spec §7.1 C4) is named, and a failure stops the build for a re-plan |
| The address bar shows an older address after a press with nowhere to go (spec §7.1 C3's known hole) | Medium | The probe's toggle shows at Gate 1 whether rewriting the landed entry fixes it; the fix touches the two mirror writers, so it is an ask-first with its own task |
| jsdom's history is not a browser's, so Part C's tests pass while the button misbehaves | Medium | The tests cover only the hook's own decisions; Checkpoint C's runs are done by hand on the three browsers |
| `back()` restores tabs in the wrong order and a setter clears them | Medium | Task 4's fixtures use non-default tabs on both tab pairs; Checkpoint A mutates the order |
| A new store method breaks a suite that mocks `uiStore` with a fixed shape | Medium | Task 6 and Task 12 name the five suites and run them before the commit |
| The row costs the phone one row of height it cannot spare | Medium | The sketch shows the cost and draws the top-band alternative; Gate 2 decides before the row is built |
| A world rebuild now sends the player to the deck where it used to keep the branch | Low | It is the intent's rule (spec §7.1 A4); the rewritten `worldTransition` test names it, and spec §7.2 Q7 flags the powered-on case |
| Part D's removal is wanted back after the look | Low | Three commits at the end of the branch, read by nothing in Parts A–C; Gate 3 names the fallback |
| Safari behaves differently and nobody sees it | Low | Spec §7.2 Q4; the probe page is kept for the day a Mac or iPhone is to hand |

## Open Questions

Carried from spec §7.2. Q1–Q6 answered 2026-11-15 (Crawford took each default; the copy came from Gate 2).

1. **The browser's Back while the power is off.** **Answered** (Task 10): it leaves the app in one press.
2. **The browser's Forward.** **Answered** (Task 10): it does nothing.
3. **The browser's Back while the phone's nav sheet is open.** **Answered** (no task): a trail step like any other.
4. **Safari.** **Answered**: not checked; the probe is kept and Task 17 parks the check.
5. **The copy.** **Answered at Gate 2**: Back and Close, no lore label (Task 7).
6. **The cap.** **Answered** (Task 3): 50 stops.
7. **A world rebuild while the power is on.** **Open, nothing to build**: none exists today.

The plan's own question, whether Gate 1 needed the Pixel, is closed: Gate 1 passed.
