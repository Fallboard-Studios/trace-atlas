# Phase Spec: Close and Back — a way out on every screen, and a browser Back that walks the same trail

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests, Parts A–C: `npx vitest run src/components/panels/screen/nav src/components/panels/screen/console/ContentPane.test.tsx src/stores/uiStore.test.ts src/systems/worldTransition.test.ts src/components/company/CompanyCrudControls.test.tsx`
> - Focused tests, Part D: `npx vitest run src/components/panels/screen/nav src/stores/uiStore.test.ts src/components/robot/Robot.test.tsx src/components/panels/screen/screens/RosterTile.test.tsx`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-15 from the confirmed intent
[docs/intent/navigation-close-and-back.md](../intent/navigation-close-and-back.md) (`interview-me`, 2026-11-15, seven
questions; five guesses confirmed, two accepted on trial). Backlog
[75](../todo/backlog.md#75-navigation-close-back-the-browsers-back-button-and-the-navs-width), plan.md Stage 5. Planned in
[tasks/NAVIGATION_CLOSE_AND_BACK.md](../tasks/NAVIGATION_CLOSE_AND_BACK.md). Not yet approved: §7.2's questions are
Crawford's, and the plan builds on their defaults until he answers.

**Who it is for:** the player moving between the deck, the Probes list, a robot, a company, All Probes and Fleet
Params, on the desk shell and the phone shell.

**The finding:** the routes out of a screen exist, but none reads as a way out, and on the phone they sit behind ☰.
The browser's Back button leaves the app at once, because nothing in `src/` makes a history entry. The rail's width
change moves the content's left edge for a list that duplicates the board beside it.

---

## 0. Scope check

Four parts, each testable on its own, in one spec because they share one model (the trail) and one reviewer.

| Part | Responsibility | Depends on |
|---|---|---|
| A — the trail | The trail of screens in `uiStore`; every navigation a step; `back()`; the tabs a step remembers; the reset on a new world | — |
| B — the row | Back and Close on every open screen, both shells | A |
| C — the browser's Back | The browser's Back button runs `back()`; it leaves the app only when the trail is used up | A |
| D — the rail (on trial) | The rail fixed at its rest width; the entity list and its state removed | — |

Build order: Gate 1 (§5.4), then A, then B and C in either order, then D. D is last and separate so that the trial
can be judged, and reverted, without touching A–C.

---

## 1. Overview & Claude Explanation

The app keeps a **trail**: the screens the player has been on, oldest first. Every navigation adds the screen being
left to the trail. **Back** takes the last one off and shows it, on the tabs it had. **Close** shows the deck. The
browser's Back button calls the same `back()`, so the on-screen control and the browser's are one action on one trail.
The trail is plain data in `uiStore`; `navActions.ts` is the only module that changes it.

### 1.1 Today

- `nav/navActions.ts` holds every selection change: `selectBranch`, `selectEntity`, `pressBranchBox`, `goHome`. Each
  starts with `cleanSlate()`, which clears the entity and resets every tab (`selectedSection`, `selectedSubsection`,
  `fleetParamsSection`, `fleetParamsSubsection`). Nothing remembers where the player came from.
- The ways to the deck are the nav's Deck box and the breadcrumb's Root segment. The phone breadcrumb drops Root
  (`NavBreadcrumb.tsx`, `inBar`), so on the phone the deck is ☰ and then Deck.
- Nothing calls `pushState` or listens for `popstate`. The address bar is rewritten in place by two `replaceState`
  writers, `mirrorWorldToUrl` (`sessionShareUtils.ts`) and `mirrorLoadToUrl` (`audioBudgetSystem.ts`). Both read
  `window.location.search`, edit it, and pass `window.history.state` through.
- `NavPanel` tweens `--nav-panel-expand` so the rail runs from 124 px to 200 px while `expandedTopLevelBranch` is
  `'probes'`. The list is open only on the Probes page itself: `selectEntity` collapses it.
- `retransmitWorld` (`worldTransition.ts`) clears the robot and company selection on every change that rebuilds the
  world, and leaves it on the two in-place modes (`aspectsOnly`, `loadingOnly`). It does not change `activeHubTile`,
  so today a player who swaps worlds while off comes back to the same branch.

### 1.2 The trail (Part A)

- **A screen** is one of six: the deck, the Probes list, a robot, a company, All Probes, Fleet Params. Its identity is
  `activeHubTile` plus the open entity. Tabs are not part of the identity.
- **A stop** is a screen plus the tabs it showed when the player left it: the robot/company section and sub-tab, and
  Fleet Params' section and sub-tab. The trail is an array of stops, `uiStore.navTrail`, oldest first. It holds the
  screens *before* the current one, so it is empty on a fresh deck.
- **Every navigation is a step.** `selectBranch`, `selectEntity` and `goHome` each append the current screen's stop
  before they change anything. This covers every caller: the nav boxes, the breadcrumb, a roster tile, a company's
  name box, a member tile, a robot clicked in the world.
- **Going to the screen already open is not a step.** Pressing Fleet Params while on Fleet Params still resets its
  tabs, as today, and adds nothing to the trail.
- **A tab switch is not a step.** The four tab setters stay as they are and never touch the trail.
- **A forward pick opens a screen on its default tabs**, as today. Only Back restores remembered tabs.
- **The trail is capped** at 50 stops; the oldest is dropped (§7.1 A3).

### 1.3 Back and Close (Part A)

- `back()` takes the last stop off the trail and shows it: the clean slate, then the stop's screen, then its tabs.
  It adds nothing to the trail. A robot opened from the deck goes back to the deck; from a company, to that company
  on the tab it showed; from the Probes list, to the list.
- `back()` with an empty trail shows the deck. With a screen open the trail is never empty in practice, so Back is
  never dimmed; this is the fallback, not a state the player meets.
- **Close is `goHome()`**: a step like any other. A Back after Close returns to the screen that was closed.
- **A deleted company leaves the trail.** `CompanyCrudControls` removes the company and calls `selectBranch('probes')`.
  That call must not record the deleted company's screen, and every stop naming that company is removed, so Back never
  lands on a screen with nothing to show. Robots are never removed inside a world.

### 1.4 Power and a new world (Part A)

- Power is not a step. `powerController` does not touch the trail, so a pause and resume of the same world returns
  the player to the screen they left with the trail intact.
- **A world rebuild resets the nav.** Where `retransmitWorld` clears the selection today (every mode but
  `aspectsOnly` and `loadingOnly`), it now resets the whole nav: the deck, no entity, default tabs, an empty trail.
  This covers a save pick, a Scan, an editor commit and a Current restore, since all of them reach `retransmitWorld`.
- A theme or aspect change keeps the roster, so it keeps the screen and the trail, as it keeps the selection today.
- A world change that is cancelled before it lands (Current picked while a pick waits) never reaches
  `retransmitWorld`, so the trail stands.
- The reset is one `uiStore` action, so `worldTransition.ts` keeps importing the store and nothing from
  `components/`.

### 1.5 The row (Part B)

- `ScreenExitRow` holds two `Button`s, Back at the left and Close at the right. `ContentPane` renders it above
  `ConsolePanel` whenever a branch is open, so it is on every screen and absent on the deck.
- It is pinned by structure, not by `position: sticky`: the row sits outside `ConsolePanel`'s scroller, so the screen
  scrolls under it. The robot screen's sticky band on the phone sticks inside that scroller and so stays below the
  row.
- **The power corner.** `.content-pane` starts at `--top-bar-bottom` (`Header.css`), which is the lower of the header
  and `--power-corner-height`. A row at the top of the plate is therefore already below the corner on both shells,
  and Close at its right end cannot run under the rocker. If the sketch moves the row up into the top band, it pads
  its right end by `--power-corner-width`, as `.header__row` does.
- Back calls `back()`; Close calls `goHome()`. Both labels come from `src/content/`.
- **The look is the sketch's** (§5.4 Gate 2): glyph against word, whether Back names where it goes, the row's height,
  and whether it sits in the plate or the top band. This spec fixes what the row does and where it is mounted, and
  takes the look from the approved sketch.
- **Focus.** After Back to another screen the row is still mounted, so focus stays on the button pressed. After Close,
  or a Back that lands on the deck, the row unmounts: on the desk the rail's `useRescueLostFocus` moves focus to the
  Deck box, as it does for any pick that removes its own button; on the phone the menu toggle takes it (§7.1 B3).

### 1.6 The browser's Back (Part C)

- While the power is on and the trail is not empty, the browser's Back button runs `back()` and the page stays in
  the app. One press is one step, the same step the on-screen Back makes.
- When the trail is empty, the browser's Back leaves the app, as on any site.
- While the power is off, the browser's Back leaves the app and the trail is untouched (§7.2 Q1).
- The browser's Forward button does nothing in the app (§7.2 Q2).
- **The address bar keeps showing the live world link.** No step changes the URL's path or query. The two
  `replaceState` writers keep working unchanged, and the app never comes to rest on a history entry that shows an
  older address than the live one.
- **A reload** starts on the deck with an empty trail. Whatever history entry the reload leaves behind, the next
  Back press leaves the app, provided the tab has a page to go back to.
- The mechanism is one hook, `useBrowserBack`, mounted in `ScreenViewport` in both power states. Its default design
  is one **guard entry** (§7.1 C1–C3), checked in real browsers at Gate 1 before anything is built on it.

### 1.7 The rail (Part D, on trial)

- The rail keeps its rest width, 124 px, at all times: `--nav-panel-width` is `--nav-panel-rest`. `ContentPane`,
  `MetaBox` and the breadcrumb keep reading the variable and never move.
- `NavEntityList` goes, on both shells (the phone sheet renders the same panel). Probes becomes a plain box like
  Fleet Params: pressing it opens the Probes list, and pressing it on the Probes list changes nothing.
- With it go `uiStore.expandedTopLevelBranch` and its setter, `expandsInPlace`, `pressBranchBox` (the panel calls
  `selectBranch`), `useNavPanelWidth` and its `nav-panel-width` timeline, `NavBox`'s `expanded` prop if nothing else
  passes it, and `--nav-panel-wide` / `--nav-panel-expand`.
- **This is a trial** (Crawford, 2026-11-15: "let's give it a try like that"), judged by a look at Gate 3. The
  fallback, built only on his call, is the rail fixed at 200 px with the list kept.

### 1.8 Content

Two entries in `src/content/copy/nav.ts`, drafts for Crawford's copy pass:

| Key | Human | Lore |
|---|---|---|
| `nav.back` | Back | to be written, or none |
| `nav.close` | Close | to be written, or none |

### 1.9 What does not change

- The Deck box, the breadcrumb and every existing navAction's destination. Only what they record changes.
- The four tab setters, `SectionTabs`, and what a forward pick opens on.
- `powerController`, the off screen, `requestWorldChange` and the scene wash.
- The two address-bar writers and the world link's params.
- `Robot.tsx`'s rule: a click from the deck or Probes is `selectEntity`; on Fleet Params it only moves the halo, which
  is not a navigation and not a step.
- No audio, no world-view component, no `timelineMap` timeline is added.

---

## 2. Target File Structure

```text
src/stores/
├── uiStore.ts                   # A: NavStop, navTrail, the trail's setters, the nav reset action
│                                # D: expandedTopLevelBranch and its setter go
└── uiStore.test.ts
src/components/panels/screen/nav/
├── navActions.ts                # A: every action records a step; back(); the deleted-company rule
│                                # D: expandsInPlace and pressBranchBox go
├── navActions.test.ts
├── ScreenExitRow.tsx / .css     # B: the row (new)
├── ScreenExitRow.test.tsx       # B (new)
├── useBrowserBack.ts            # C: the popstate listener and the guard entry (new)
├── useBrowserBack.test.tsx      # C (new)
├── NavPanel.tsx / .css          # D: no list, no width tween, one width
├── NavPanel.test.tsx
├── NavBox.tsx                   # D: the expanded prop, if unused
├── NavEntityList.tsx / .css / .test.tsx   # D: deleted
└── NavBreadcrumb.test.tsx       # D: its two mentions of the list's state
src/components/panels/screen/console/
├── ContentPane.tsx / .css       # B: mounts the row above ConsolePanel; the plate becomes a column
├── ContentPane.test.tsx
└── ConsolePanel.css             # B: fills the column under the row
src/components/panels/physical/
└── ScreenViewport.tsx           # C: mounts useBrowserBack
src/components/company/
├── CompanyCrudControls.tsx      # A: the delete path uses the deleted-company rule
└── CompanyCrudControls.test.tsx
src/systems/
├── worldTransition.ts           # A: the selection reset becomes the nav reset
└── worldTransition.test.ts
src/components/robot/Robot.tsx   # D: a comment that describes the list collapsing
src/content/copy/nav.ts          # B: nav.back, nav.close

docs/sketches/navigation-close-and-back.html   # Gate 2: the row, both shells, against the power corner
docs/UI_SHELL.md                 # the nav panel, navActions, the content surface, the uiStore table; and the
                                 #   Deck's "Welcome card" line, which the code no longer has
docs/ANIMATION_SYSTEM.md         # D: its one mention of the nav-panel-width timeline
docs/todo/backlog.md, docs/todo/plan.md   # entry 75 and its line; archive after the merge
docs/specs/NAVIGATION_CLOSE_AND_BACK.md   # an "As built" section
```

`sessionShareUtils.ts`, `audioBudgetSystem.ts`, `powerController.ts`, `worldChange.ts`, the four screens and every
world-view component are untouched. If Gate 1 shows the guard design needs the two address writers to share a helper,
that is an ask-first (§3).

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each rule in
  §1.2–§1.6 that a test can reach is a test that fails on today's code.
- Every trail change goes through `navActions.ts` or the one `uiStore` reset. No component reads the trail to decide
  where Back goes.
- The trail holds plain data only: ids, tile names, tab names, booleans. No functions, refs, timelines or labels.
- Both controls render inside `ScreenViewport`; labels come from `src/content/`; the row clears the power corner
  through the existing CSS variables, never a measured number.
- Every `pushState` happens inside the user gesture that caused it (a click or a key press), never from a `popstate`
  handler, an effect that runs later, or a timer (§7.1 C2).
- Run the focused tests per task, then the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**
- Changing `mirrorWorldToUrl` or `mirrorLoadToUrl`, or routing them through a shared helper.
- Putting the screen, the entity or a tab in the URL.
- Persisting the trail (localStorage, the session payload, the world link).
- A `beforeunload` prompt.
- An Escape-to-close key, or any global key handler.
- Building Part D's fallback (the 200 px rail with the list kept).
- Making `ScreenExitRow` a Design System primitive in `src/components/ui/controls/`.

**Never**
- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` to sequence a history call.
- A second trail: the browser's history is driven from `uiStore.navTrail`, never the other way round.
- Interactive UI in `SleeveContainer`, or a portal to `document.body`.
- A file-text test (source, doc or CSS read as text). The row's look, the rail's width and the copy get a look in the
  browser, named on the task's Proof line. Part D only deletes and re-points, so its tasks update existing tests and
  write no new RED one.
- A "keep existing behaviour" or compatibility clause in any doc (pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

A stop, as it would read in `uiStore.ts` (names provisional; the plan pins them):

```typescript
/** One screen on the trail, with the tabs it showed when the player left it (§1.2). Plain data. */
export interface NavStop {
  tile: HubTile | null; // null = the deck
  robotId: string | null;
  companyId: string | null;
  allProbes: boolean;
  section: RobotSection | null;
  subsection: RobotSubsection | null;
  fleetSection: FleetParamsGroup;
  fleetSubsection: SelectedFleetParamsEffect | null;
}
```

Back, as it would read in `navActions.ts`:

```typescript
/** Back (§1.3): the last stop on the trail, on the tabs it showed; the deck when the trail is empty.
 *  Never a step itself. The row's Back and the browser's Back both call this. */
export function back(): void {
  const stop = useUIStore.getState().popNavStop();
  cleanSlate();
  if (stop) restore(stop);
  else showDeck();
}
```

The browser side, as `useBrowserBack.ts` would handle a press under the guard design (§7.1 C1):

```typescript
function onPopState(event: PopStateEvent): void {
  if (isGuard(event.state)) return; // arrived on the guard (our own forward(), or the Forward button): nothing to do
  const { isPoweredOn, navTrail } = useUIStore.getState();
  if (!isPoweredOn || navTrail.length === 0) {
    window.history.back(); // nothing to step: pass the press on, and it leaves the app
    return;
  }
  back();
  window.history.forward(); // rest on the guard again, where the live address is
}
```

- Names follow the neighbours': `back` beside `goHome`; `navTrail` beside the other nav fields; `useBrowserBack`
  beside `useShell` and `useRescueLostFocus`.
- Recording a step is one private helper in `navActions.ts`, called at the top of each action with the destination's
  identity, so "same screen, no step" is decided in one place.
- `ScreenExitRow` is stateless: two schema-driven `Button`s and the two navActions. No store subscription beyond what
  the labels need.
- `useBrowserBack` adds its listener in an effect and removes it on unmount. It is a no-op outside a browser, and a
  throwing history call is caught and ignored, as the two address writers do.
- Comments as dense as the module's: each new function's doc comment names the spec section it implements.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, Testing Library)

**Part A**

- `navActions.test.ts`, the trail:
  - each of `selectBranch`, `selectEntity` and `goHome` appends the screen being left, with its four tab fields;
  - going to the screen already open appends nothing;
  - a tab setter appends nothing;
  - the trail holds at most 50 stops and drops the oldest.
- `navActions.test.ts`, `back()`:
  - deck → robot → `back()` shows the deck and leaves the trail empty;
  - company (on a non-default section and sub-tab) → member robot → `back()` shows that company on that section and
    sub-tab;
  - Fleet Params (on a non-default section and sub-tab) → Probes → `back()` shows Fleet Params on both;
  - robot → `goHome()` → `back()` shows the robot;
  - `back()` appends nothing, and on an empty trail shows the deck;
  - `back()` shuts the phone sheet, as every action does.
  - Fixtures use non-default tabs, so a restore cannot pass by landing on a default.
- `navActions.test.ts` and `CompanyCrudControls.test.tsx`, a deleted company: after the delete, no stop names it, the
  Probes list is showing, and `back()` skips to the stop before it.
- `uiStore.test.ts`: the reset action leaves the deck's state and an empty trail; the trail survives `setPowerOff`
  and `setPowerOn`.
- `worldTransition.test.ts`: a rebuild mode resets the nav (the deck, an empty trail) from an open robot screen with a
  three-stop trail; `aspectsOnly` and `loadingOnly` leave the screen and the trail as they were.

**Part B**

- `ScreenExitRow.test.tsx`: Back calls `back()` and Close calls `goHome()` (asserted on the store's state, not on
  spies alone); both buttons carry their content labels as accessible names.
- `ContentPane.test.tsx`: the row renders on each of the five open screens and not on the deck; it is outside
  `ConsolePanel`'s scroller.

**Part C**

- `useBrowserBack.test.tsx`, by dispatching `popstate` and spying on `window.history`:
  - power on, trail not empty: a non-guard `popstate` runs one `back()` step and calls `history.forward()`;
  - trail empty: it calls `history.back()` and changes no state;
  - power off, trail not empty: it calls `history.back()` and the trail is unchanged;
  - a `popstate` carrying the guard's state does nothing;
  - the first step from an empty trail pushes exactly one guard entry with the current URL, and later steps push
    none while the current entry is already a guard;
  - unmount removes the listener.

**Part D**

- No new RED tests. The six test files that name the list or `expandedTopLevelBranch` (`NavPanel.test.tsx`,
  `navActions.test.ts`, `uiStore.test.ts`, `Robot.test.tsx`, `RosterTile.test.tsx`, `NavBreadcrumb.test.tsx`) are
  updated: cases about the list go, and set-up that writes the field is dropped. `NavEntityList.test.tsx` is deleted
  with its component. One case is re-pointed: pressing Probes on the Probes list changes no state.

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` green at each task and at each checkpoint.

### 5.3 Runs (the proof; not tests)

- **The trail, by hand** (desk and phone shell): deck → click a robot in the world → Back lands on the deck. Probes →
  a company → its Envelope tab → a member robot → Back lands on the company's Envelope tab. Fleet Params on Modulation
  › Chorus → Probes → Back lands on Chorus. Close from each of the five screens shows the deck in one press.
- **The browser's Back**: the same three walks using the browser's button; then Back on the deck leaves the app.
  Reload on a robot's screen, then Back: it leaves the app in one press.
- **Power**: three steps deep, power off and on: the same screen, and Back still walks three steps. Power off, pick a
  save, power on: the deck, and the browser's Back leaves the app.
- **The address bar**: move the Voice Limit slider (Fleet Params, World › Settings) so `?load=` changes, press the
  browser's Back, and the bar still shows the new `load`.
- **The look**: the row on all five screens at 320 px, 768 px and wide; Close clear of the rocker; the robot screen's
  phone band under the row; the rail at one width with no list, the content's left edge still.

### 5.4 Gates (stop and report)

- **Gate 1, before Part A: the browser check.** The guard design (§7.1 C1) rests on how real browsers treat the Back
  button, which jsdom and a CDP probe cannot show: Chrome's history-manipulation intervention applies to the button,
  not to `history.back()`. A throwaway page with only the hook's logic, and Crawford presses the button in desktop
  Chrome, desktop Firefox and Chrome on the Pixel:
  1. five Back presses in a row each make one step (no press is skipped, none leaves early);
  2. two fast presses do not leave the app while steps remain;
  3. with the trail used up, one press leaves;
  4. reload on a guard entry, then one press leaves;
  5. in a tab opened straight on the app (nothing behind it), a press with the trail used up does nothing harmful,
     and the address shown afterwards is the live one.
  If any fails, the build stops: §7.1 C4 is the fallback, and it changes Part A's trail shape.
- **Gate 2, before Part B: the sketch.** `docs/sketches/navigation-close-and-back.html` draws the row on the desk and
  the phone at 320 px, against the power corner, with the robot screen's band under it. Crawford names the look, the
  row's place (plate or top band) and whether Back names where it goes.
- **Gate 3, after Part D: Crawford's look.** §5.3's last run. He keeps the rail trial or calls the fallback.

### 5.5 Done when

- Every test in §5.1 is written RED and passes; the suite, types, lint and build are green.
- The three gates have passed and §5.3's runs are done.
- UI_SHELL.md and ANIMATION_SYSTEM.md read as the code is; this spec has its "As built" section; backlog 75 is
  archived and its plan.md line deleted.

---

## 6. Git & Workflow Context

- This spec and the plan (`docs/tasks/NAVIGATION_CLOSE_AND_BACK.md`) are committed on a docs branch before the first
  task. The intent file stays.
- One feature branch, `feature/navigation-close-and-back` from `main`. Parts A, B and C first; Part D as its own run
  of commits at the end, so the trial reverts cleanly.
- Commit per task, the RED test in the same commit as its GREEN, message in the repo's voice
  (`feat(nav): Back returns to the screen before, on its tabs (Task 3)`), ending with the session's attribution line.
- Crawford opens and merges the PR.

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (defaults the plan builds on; each re-pinned at a gate)

- **A1. The trail lives in `uiStore`**, as the backlog's constraint says, and is not mirrored into `history.state`.
  The browser holds one marker and no trail data.
- **A2. A stop is eight fields** (§4). Scroll position is not remembered.
- **A3. The cap is 50 stops.** It bounds the store; no player is expected to reach it.
- **A4. The world-rebuild reset lands on the deck.** Today a rebuild keeps the branch open; the intent says the
  player lands on the deck.
- **A5. A deleted company's stops are removed at the delete**, by a navAction the delete path calls, so `back()`
  needs no roster lookup and `navActions.ts` gains no `localeStore` import.
- **B1. The row is inside the plate, above `ConsolePanel`**, and costs each screen one row of height. Gate 2 may move
  it into the top band.
- **B2. The labels are the plain words** Back and Close, with Back not naming its destination. Gate 2 may change
  both.
- **B3. On the phone, focus goes to the menu toggle** when the row unmounts. Backlog
  [61](../todo/backlog.md#61-accessibility-review) reviews it.
- **C1. One guard entry.** The first step from an empty trail pushes one history entry marked as the guard, with the
  URL unchanged. From then on the app rests on the guard. A Back press lands on the entry before it; the hook runs
  `back()` and calls `history.forward()` to return to the guard. With nothing to step, the hook calls
  `history.back()` once more, so the press leaves the app. The browser never holds more than one extra entry, so
  there is nothing to empty on a new world and at most one entry left after a reload.
- **C2. No entry is pushed from `popstate`.** Chrome marks an entry skippable when its document adds another entry
  without a user activation, and the Back button then skips it
  ([Chromium's note](https://chromium.googlesource.com/chromium/src/+/127.0.6533.99/docs/history_manipulation_intervention.md)).
  The guard is pushed synchronously inside the navigation's own click, and the return uses `forward()`, which adds
  nothing.
- **C3. The app rests on the guard, so the live address is always the one shown.** Both address writers edit the
  current entry, which is the guard. The entry behind it may hold an older address; the app is on it only for the
  moment between a press and the `forward()`. **Known hole:** when a press has nowhere to go (a tab opened straight
  on the app, the trail used up, or the power off), the app is left on the entry behind the guard. Its address may be
  older, and until the next navigation pushes a guard again the browser's Back will not step the trail. Gate 1's
  fifth check looks at exactly this. The likely fix is the ask-first helper in §3: the two writers record the live
  address, and the hook rewrites the entry it lands on.
- **C4. The fallback, if Gate 1 fails: one history entry per step**, each pushed in its click, with the trail a list
  and a cursor. It costs more: old entries cannot be removed after a new world or a reload, their addresses go
  stale, and the on-screen Back has to drive `history.back()`. It is named so the fallback is not designed under
  pressure, and it would be re-specified before it is built.
- **D1. Nothing replaces the list.** The roster board is the way to a robot or company; no "jump to" control is
  added to the rail or the sheet.

### 7.2 Open questions

- **Q1. The browser's Back while the power is off.** Not asked in the interview. Default: **it leaves the app in one
  press** and the trail is untouched, because the off screen is outside the nav, like the deck. The alternative
  (step the hidden nav) makes presses that show nothing.
- **Q2. The browser's Forward.** Default: **nothing**; there is no redo of a Back.
- **Q3. The browser's Back while the phone's nav sheet is open.** Default: **a trail step like any other**, which
  shuts the sheet as every action does, and on an empty trail leaves the app. The Android habit is that Back shuts
  the sheet and does nothing else; that is a small addition if Crawford wants it.
- **Q4. Safari.** No Mac or iPhone is to hand (plan.md, Parked), so Gate 1 cannot cover it. Default: ship on the
  three browsers checked and add Safari to the parked Safari look.
- **Q5. The copy.** Back and Close, and whether either has a lore label (§1.8).
- **Q6. The cap** (A3): 50, or no cap.
- **Q7. Does a world rebuild while the power is on happen anywhere?** Nothing in the powered-on app makes one today.
  If one is added later, A4 sends the player to the deck in the middle of a session; flagged so that is a decision,
  not a surprise.
