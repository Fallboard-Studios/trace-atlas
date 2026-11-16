# Intent: Close and Back — a way out on every screen, and a browser Back that walks the same trail

Confirmed via `interview-me` on 2026-11-15 (seven questions; five guesses confirmed outright, two accepted on trial and
marked so below), ahead of a sketch and then a `spec-driven-development` pass. This is backlog
[75](../todo/archive/backlog-archive.md#75-navigation-close-back-the-browsers-back-button-and-the-navs-width), plan.md Stage 5.

## Outcome

Every open screen carries a **Back** and a **Close** in one fixed row. Close always shows the deck. Back returns to the
screen you were on before, on the tab it was showing, and the browser's Back button does exactly the same thing, so it
only leaves the app from the deck. The nav rail keeps one width, so the content's left edge never moves.

## Behavior

- **Who it is for.** The player moving between the deck, the Probes list (`RosterBoard`), a robot, a company, All
  Probes and Fleet Params, on the desk and on the phone shell.
- **Why now.** The routes out exist, but none reads as a way out: the nav's Deck and Probes boxes read as "go somewhere
  else" and the breadcrumb as "where am I". On the phone they sit behind ☰, and the phone breadcrumb leaves Root out, so
  the deck is two presses away. The browser's Back leaves the app at once. Backlog
  [77](../todo/backlog.md#77-help-popovers-a-link-from-a-send-to-its-effect) (a jump from a send to its effect) needs a
  Back to return from.

### The trail

- The app keeps a trail of the screens the player has been on, oldest first, starting at the deck. A screen is one of:
  the deck, the Probes list, a robot, a company, All Probes, Fleet Params.
- Every navigation is a forward step onto the trail, whatever made it: a nav box, a breadcrumb segment, a roster tile,
  a company's name box, a member tile on a company's screen, a robot clicked in the world.
- **A tab switch is not a step.** Changing a robot's or company's section or sub-tab, or Fleet Params' section or
  sub-tab, adds nothing to the trail.
- **Each step remembers its tabs.** Going back to a screen shows it on the section and sub-tab it had when the player
  left it, not on its default. This is new: today every nav pick starts from a clean slate that resets the tabs.

### Back

- Back goes to the previous screen on the trail: "where I was", not "up a level". A robot opened from the deck goes
  back to the deck; a robot opened from a company's screen goes back to that company; a robot opened from the Probes
  list goes back to the list.
- The on-screen Back and the browser's Back button are the same action on the same trail.
- Back is never dimmed: any open screen was reached from somewhere, even if that is only the deck.
- On the deck the trail is used up. The browser's Back then leaves the app, as it does on any site.

### Close

- Close always shows the deck, from any screen, in one press. It is a forward step, so a Back after it returns to the
  screen that was closed.
- The deck shows neither control: nothing is open there.

### Power

- Power is a pause, not a step. Neither the off screen nor the flip goes on the trail.
- When the same world resumes, the player is on the screen they left (as today) and the trail is intact.
- A theme or aspect change made while off keeps the roster, so it keeps the trail.
- When a different world is picked while off (a save, a Scan, an editor commit, a Current restore), the trail is
  emptied and the player lands on the deck: its robots and companies belonged to the world they left.

### The nav rail (on trial)

- The rail stays at its rest width (124 px, `--nav-panel-rest`) at all times. Nothing tweens, and `ContentPane`,
  `MetaBox` and the breadcrumb never shift.
- The entity list under the Probes box (`NavEntityList`) goes, and Probes becomes a plain box like Fleet Params. The
  list is only ever open on the Probes page itself, beside the roster board, which already lists every robot and
  company.
- Crawford, 2026-11-15: "let's give it a try like that". Judged by a look once built; the fallback is a rail fixed at
  the wide size (200 px) with the list kept.

### The row (placement on trial)

- One row at the top of the content plate, the same on every open screen and on both shells: Back at the left, Close at
  the right, pinned while the screen scrolls.
- Crawford, 2026-11-15: "ok for now", with one requirement: the power button takes up space at the top right and has
  its own CSS variables, and the row must be laid out against it.
- The exact look is settled in a sketch page before the spec: glyph against word, whether Back names where it goes,
  how the row clears the power corner, and how it meets the robot screen's sticky band on the phone.

## Style / constraint

- **UI Shell guardrail.** Both controls live inside `ScreenViewport`, never in `SleeveContainer`.
- **The power corner.** The row clears it through `--power-corner-width` and `--power-corner-height`
  (`src/index.css`), as `Header.css` already does (its padding, and `--top-bar-bottom`). No new measurement of the
  rocker.
- **Selection stays in one place.** Back and Close are `navActions`; no component derives where Back goes. The trail is
  plain serialisable data: no functions, refs or timelines in it.
- **The address bar keeps showing the world link.** A step on the trail never changes the URL's path or query, and the
  two `replaceState` writers (`mirrorWorldToUrl` in `sessionShareUtils.ts`, the load mirror in `audioBudgetSystem.ts`)
  keep working as they do.
- **Animation.** Any motion on the row is a GSAP timeline in `timelineMap`. With the width tween gone the rail needs
  none.
- **Copy lives in `src/content/`**: the two labels and their accessible names.
- **Tests exercise code, not text**: the trail, Back, Close, the remembered tabs and the world-swap reset are behaviour
  with tests. The row's look and the rail's width are a look in the browser.

## Out of scope

- **A "Leave site?" prompt.** Considered and rejected: once Back walks the trail an accidental press costs one screen,
  and a world counts as unsaved until Save, so the prompt would fire on nearly every reload and tab close.
- **Tab switches as Back steps.**
- **The screen in the URL.** No deep link to a robot, a company or a tab.
- **The nav surviving a reload.** A reload starts on the deck with an empty trail, as today.
- **Backlog 77's link itself.** This item only makes sure a jump has a Back to return from.
- **The Deck box and the breadcrumb.** Both stay as they are.
- **"Up a level" as a second control.** The Probes box and the breadcrumb's Probes segment already do it.

## Known implementation notes (not yet spec'd)

None of these was asked in the interview; each is a fact from the code or a question the spec must answer.

- **The clean slate.** `cleanSlate()` in `nav/navActions.ts` clears `selectedSection` / `selectedSubsection` (through
  `selectRobot(null)`) and resets `fleetParamsSection` / `fleetParamsSubsection`. A trail entry therefore has to carry
  those four fields with the screen's identity (`activeHubTile`, `selectedRobotId`, `selectedCompanyId`,
  `allProbesSelected`), and Back restores them after the slate. A forward pick still opens a screen on its default tab.
- **Where the trail lives.** `uiStore` (the backlog's constraint), `history.state`, or both mirrored. Both
  `replaceState` writers already pass `window.history.state` through unchanged, so a marker kept there survives them.
- **The browser side.** Nothing in `src/` calls `pushState` or listens for `popstate` today. The likely shape is one
  `pushState` per step with the URL unchanged, and a `popstate` listener that applies the entry. To decide: what the
  browser's Forward button does, and whether re-picking the screen already open adds a step (the guess is no).
- **Entries the app cannot remove.** The browser's own history cannot be emptied, so after a world swap (and after a
  reload) old entries remain behind the current one. The spec says what a Back onto one of them does: the guess is that
  it shows the deck.
- **An entry whose entity is gone.** A company on the trail can be deleted. The guess is that Back skips it.
- **Detecting a world swap.** The off screen's picks run through `requestWorldChange` (`src/systems/worldChange.ts`);
  the theme and family rows take the `loadingOnly` / `aspectsOnly` paths, which rebuild nothing. A link arrival and the
  boot start on the deck anyway.
- **The browser's Back while powered off.** Not asked. The trail's entries still exist under the off screen, so the
  spec says whether a Back there steps the hidden nav or is held until power-on.
- **What leaves with the rail's list**, if the trial holds: `NavEntityList` and its stylesheet, `expandedTopLevelBranch`
  and its setter in `uiStore`, `expandsInPlace`, the toggle half of `pressBranchBox` (it becomes `selectBranch`),
  `useNavPanelWidth` with its `nav-panel-width` timeline, and `--nav-panel-wide` / `--nav-panel-expand` in
  `NavPanel.css`. The phone sheet renders the same panel, so the list leaves there too. `useEntityRoster` stays for the
  breadcrumb. UI_SHELL.md's nav panel section and `uiStore` table need the rewrite.
- **Keyboard and focus.** Whether Escape closes, and where focus lands after Back and after Close (`useRescueLostFocus`
  covers the rail today). Backlog [61](../todo/backlog.md#61-accessibility-review) reviews the result.
- **A stale comment to fix while there.** `ContentPane.tsx`'s header names the Deck box as "the close control".
