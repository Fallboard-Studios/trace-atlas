# Implementation Plan: Layout Rework

Spec: [docs/specs/LAYOUT_REWORK.md](../specs/LAYOUT_REWORK.md). Intent:
[docs/intent/layout-rework.md](../intent/layout-rework.md). Sketch (every tab approved 2026-10-09):
[docs/sketches/layout-rework.html](../sketches/layout-rework.html). Branch `feature/layout-rework`
from `feature/world-gem` (`ced07eb5`); first commit `d9cb97bb` (intent + spec + sketch amendments).
Roadmap Phase 45 (entry written in Task 32).

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `node docs/sketches/tools/smoke-layout-rework.cjs`, `npm run perf:idle` (after
`npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Thirty-two tasks in six phases, four of them the spec's sub-phases, each ending in a checkpoint that
is Crawford's dev look (stop and report; nothing starts past a checkpoint without his word). **Phase 1
(shell + nav, Tasks 1–9)** builds the one-panel nav, the phone bar and sheet, the slim header, the
opaque content surface over the dimmed world and the meta box, deletes the nav tree, and drops the
existing content screens in unchanged. **Phase 2 (section tabs, Tasks 10–18)** adds the `SectionTabs`
and `HelpPopover` primitives, the single-line `RadioButton` face and the compact `LfoLink`, rebuilds
Fleet Params, the robot screen and Settings on tabs, and retires the stacked-scroll machinery and its
store fields. **Phase 3 (roster + company, Tasks 19–24)** replaces the Probes list and the Companies
index with the roster board and its Move chip, adds the Company detail, and gives the Deck its halo
colours and selection lines. **Phase 4 (off screen, Tasks 25–28)** builds the world before power-on,
the presets and the no-pop Transmission picker. **Phase 5 (gates, Tasks 29–30)** is the idle-paint
harness and Crawford's screenshot check. **Phase 6 (docs, Tasks 31–32)** pins the docs to the source.

Every task: RED first (a failing test that names the behaviour), then GREEN, one commit per task,
types / lint / suite green at every commit. Every test that guards a rule is mutation-checked by
breaking the rule and watching it fail (the one-mounted-at-a-time rule, the hover-only chip, the
no-pop off screen, the Freelance-last order, the parity fixtures). Deletions are gated by a grep for
importers before the file goes. Misses are reported, never smoothed over.

## Architecture Decisions

- **One shell switch, `useShell(): 'desk' | 'phone'`** (Task 2), a `matchMedia` hook on
  `NAV_PANEL_DOCK_MIN_WIDTH` (768, kept as the constant's new home in `useShell.ts`). Everything
  that differs by shell — the panel vs the sheet, header contents, lane titles, the `LfoLink` row,
  the meta box's line rule — reads this hook and nothing else. The cabinet tier (`useCabinetTier`,
  639) keeps sizing controls and is not a shell switch. Spec Assumption 1 and §7 Q2.
- **Store fields retire with their last consumer, not up front.** Phase 1 deletes the tree but keeps
  the existing content screens, which still read `selectedFleetParamsEffect`, `expandedProbeId`,
  `expandedCompanyId`, `selectedSettingsSubsection` through `accordionSync`; those fields go in
  Task 18 when the screens that read them are gone. New fields arrive with their first consumer
  (`fleetParamsSection` / `fleetParamsSubsection` in Task 15, `movePanelRobotId` in Task 22).
- **Selection logic lives in one pure module, `navActions.ts`** (Task 3): `selectBranch`,
  `selectEntity`, `goHome` and `breadcrumbPath(state)` replace `useNavTree`'s `select` / `goHome` /
  `selectedPath` / `trimToLowestParent`. The panel, the entity list, the breadcrumb, the roster and
  the company column all call it; no component derives the path itself.
- **The meta box exists from Phase 1** (Task 7) as the new home of `NavStatusBlock`'s telemetry (the
  world line: style, coordinates, clock, temperature, emitting count), so deleting the panel's status
  block loses nothing. Phase 3 (Task 24) adds the selection lines to the same component.
- **The content surface is `ContentPane`'s own background** (`--content-surface`), offset by
  `--nav-panel-width` which `NavPanel` writes on the viewport root; `WorldView` dims via a
  `data-dimmed` attribute on its root that `ConsolePanel`'s presence sets. No portal, no second
  overlay element. Panels inside keep their static popped `CabinetBox` facade in trait colour (spec
  §1.1 as amended).
- **Help copy is a new content field, `help?: { human: string; lore?: string }` on `ContentEntry`**
  (Task 10), surfaced by `labels()` into `ControlSchemaBase.help`. `intro` stays what it is (a
  section's intro); a control's help is its own thing. The copy is written in two tasks by content
  area (Tasks 10 and 12b) in the copy-tone guide's human voice, at the length of the existing intro
  descriptions — spec §7 Q7.
- **`SectionTabs` is a `ControlSchema` consumer over Radix `Tabs`** with `CabinetBox` triggers and no
  `forceMount`; the active section is the only one in the DOM (spec Assumption 7). Fleet Params,
  the robot screen, the company screen and Settings all use it; the sub-tab row is the same
  component nested once.
- **The Companies branch's parent opens the roster board**, the same board Probes opens (the sketch's
  Roster tab serves both); "+ New Company" sits in the board's head and in the nav's entity list.
  `ConsolePanel.TILE_CONTENT` routes `robots` → `RosterBoard` or `RobotScreen` (a robot selected),
  `companies` → `RosterBoard` or `CompanyScreen` (a company or All selected), `audioRig` →
  `FleetParamsScreen`, `settings` → `SettingsScreen`.
- **`CompanyOptionsSection` becomes a hook plus panels** (Task 23): `useCompanyOptions()` returns the
  resolved values and the broadcasting change handlers it computes today; the four section
  components render inside `SectionTabs`. The broadcast-not-link semantics and the diff-one-field
  rule (COMPANIES.md) move unchanged; the existing tests move with them.
- **The glide is `Flip.getState` before the store write and `Flip.from` after React commits** (Task
  22): `RosterBoard` records the tile rects in the click handler, calls `assignRobotToCompany`, and
  runs `Flip.from` in a `useLayoutEffect` keyed on the roster order; the timeline is registered in
  `timelineMap` under `roster-move-<robotId>`; `prefers-reduced-motion` skips it. The timeline never
  touches audio.
- **The world boots on `WorldView`'s mount, which no longer depends on power, and its systems start
  on the rocker** (Task 26). Found at plan time: `initializeLocale` (`worldTransition.ts:101–118`)
  does not only build the world — it also calls `startRobotLifecycle`, `startWorkLoop` and
  `startAudioSwells`, so mounting it while off would start the world ticking. The function is split
  behind a flag, `initializeLocale(localeId, { startSystems })`: the mount effect at
  `OceanScene.tsx:263` and a powered-off retransmit pass `false`; `powerController.powerOnSequence()`
  calls the start half after `AudioEngine.start()` (it already re-registers audio via
  `reRegisterAllRobotsAudio`); a powered-on retransmit passes `true` as today. Spec §1.9 and §3
  were amended to allow this one `worldTransition.ts` change. Task 26's RED step proves the build
  half runs with no audio context and starts nothing.
- **Presets are three `SessionPayload` constants** (Task 25, spec §7 Q4) validated by the same
  checks a saved session passes, with names as content keys.
- **Each sub-phase ends in Crawford's dev look.** The app is not expected to ship between them; the
  branch merges once.

## Dependency Graph

```
Phase 1 — shell + nav
  T1 content (nav/ui keys)   T2 useShell()   T3 navActions.ts
          └──────────┬──────────┴───────────────┘
                     │
            T4 NavPanel + NavEntityList (desk)
                     │
            T5 PhoneBar + nav sheet (phone)
                     │
   T6 Header slim ── T7 ContentPane surface + world dim ── T8 MetaBox + NavBreadcrumb
                     │
            T9 delete the tree
                     │
              ═ Checkpoint A ═ (Crawford's dev look)

Phase 2 — section tabs
  T10 ContentEntry.help + lane short + laneTitle()      T11 SectionTabs      T13 RadioButton single-line
          │                                                   │                      │
  T12 HelpPopover (needs T10)   T12b help copy (needs T10)    │             T14 LfoLink compact (needs T13, T2, T10)
          └──────────────────────────┬────────────────────────┴──────────────────────┘
                                     │
          T15 FleetParamsScreen ── T16 RobotScreen ── T17 SettingsScreen
                                     │
                       T18 retire the stacked scroll + store fields
                                     │
                               ═ Checkpoint B ═

Phase 3 — roster + company
  T19 content (roster/company keys)     T20 rosterRows() + movePanelRobotId
          └──────────────┬───────────────┘
                         │
                 T21 RosterBoard + RosterTile (no chip)
                         │
          T22 Move chip + popover/sheet + Flip      T23 CompanyScreen + useCompanyOptions
                         └──────────────┬─────────────────┘
                                        │
                      T24 Deck halo colours + meta-box selection lines
                                        │
                                  ═ Checkpoint C ═

Phase 4 — off screen
  T25 presets + home.off keys ── T26 world before power-on ── T27 OffScreen + muted RadioButton ── T28 phone off + 320 px
                                                                                                        │
                                                                                                  ═ Checkpoint D ═
Phase 5 — gates:  T29 idle-paint gate ── T30 Crawford's screenshots
Phase 6 — docs:   T31 docs + docs test ── T32 roadmap, backlog, headers
```

## Task List

### Phase 1: Shell and nav (existing screens dropped in unchanged)

## Task 1: Content keys for the shell

**Description:** Add the shell's strings to `src/content/copy/nav.ts` and `ui.ts`: the five parent
boxes keep their existing `nav.*` entries; add `nav.entity.allProbes` ("All Probes — the whole fleet"),
`nav.entity.newCompany` ("+ New Company"), `ui.phoneBar.menu` (the menu button's name),
`ui.phoneBar.menuOpen` (the bar's text while the sheet is open), `ui.metaBox.*` (the world line's
field names, moved from `nav.status.*` if they are not already reusable). One entry per concept,
`human` + `lore`, placeholder lore where the sketch has none.

**Acceptance criteria:**
- [ ] `content.test.ts` passes with the new keys (no literal strings anywhere else).
- [ ] Every key added is read by a Phase 1 task (Tasks 4–8); none is orphaned at Checkpoint A.

**Verification:**
- [ ] `npx vitest run src/content/content.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/content/copy/nav.ts`, `src/content/copy/ui.ts`

**Estimated scope:** XS (content only)

**As built (2026-10-09):** two keys, not five — one entry per concept (CLAUDE.md) won over the list
above. "All Probes" already is `probe.all` (today's tree row reads it), the phone bar's menu button
is `NavToggleButton`'s replacement and keeps `nav.toggle`, and the world line has no field names
beyond `nav.status.*`, which `MetaBox` reuses (the plan's own "if not already reusable" clause). Added:
`nav.entity.newCompany` (`[c]` placeholder lore) and `ui.phoneBar.menuOpen`. The content guard fails
on any key without a consumer, so `content.test.ts` gained `AWAITING_CONSUMER`: a key listed there is
exempt only while unreferenced — once Task 4 / Task 5 reads it, a self-cleaning test fails until the
entry is removed, which empties the list by Checkpoint A.

## Task 2: `useShell.ts` — the one shell switch

**Description:** New hook `useShell(): 'desk' | 'phone'` in `src/components/panels/screen/useShell.ts`,
a `useSyncExternalStore` over `matchMedia('(min-width: 768px)')` (the pattern `Header.tsx` already uses
in `useMatchesMediaQuery`). `NAV_PANEL_DOCK_MIN_WIDTH` moves here from `useNavPanelSlideAway.ts` (which
Task 9 deletes); a `SHELL_MIN_WIDTH = 320` constant is exported for the CSS tests.

**Acceptance criteria:**
- [ ] Returns `'desk'` at 768 px and above, `'phone'` below, and updates on a `change` event.
- [ ] Returns `'phone'` when `matchMedia` is absent (tests, SSR).
- [ ] `useCabinetTier` is untouched and still reports its own 639 px tier.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/useShell.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/panels/screen/useShell.ts`, `src/components/panels/screen/useShell.test.ts`

**Estimated scope:** XS (one hook)

## Task 3: `navActions.ts` — select branch / entity / home, and the breadcrumb path

**Description:** Pure functions over `useUIStore` in `src/components/panels/screen/nav/navActions.ts`:
`selectBranch(branch: TopLevelBranch | 'deck')` (sets `activeHubTile`, `expandedTopLevelBranch`, clears
the entity when the branch changes), `selectEntity({ robotId } | { companyId } | 'all')` (sets the
entity and the matching branch), `goHome()` (Deck), and `breadcrumbPath(state): string[]` (Root /
branch / entity / section, using `labels()` for names and `localeStore` for entity names). Replaces
`useNavTree`'s `select`, `goHome`, `selectedPath` and `trimToLowestParent`.

**Acceptance criteria:**
- [ ] `selectBranch('probes')` expands Probes and clears the entity, `selectedRobotId` included
      (amended 2026-10-09, see As built); `selectBranch('settings')` collapses any expanded branch
      and clears the entity.
- [ ] `selectEntity({ robotId })` clears `selectedCompanyId` and `allProbesSelected`;
      `selectEntity('all')` sets `allProbesSelected` and clears both ids; `selectEntity({ companyId })`
      clears the robot and `allProbesSelected`.
- [ ] `breadcrumbPath` yields `[]` on the Deck, `['Root', 'Fleet Params', 'LFO Bank']` with a section
      selected, and `['Root', 'Probes', '<robot name>']` for a robot with no section.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/nav/navActions.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/panels/screen/nav/navActions.ts`, `.../navActions.test.ts`

**Estimated scope:** S (one module)

**As built (2026-10-09):** the first acceptance line was changed by Crawford's call — picking a
parent **clears** the entity on every branch, Probes included ("Clear it"): Probes content routes on
`selectedRobotId`, so keeping it would have sent the Probes box and the breadcrumb's "Probes" segment
back to the last robot instead of the list. Every action starts from a clean slate (no robot, no
company — via `selectAllRobots`, so `allRobotsSelected` always equals "no company" — no All Probes,
and every section field null, including `selectedFleetParamsEffect` / `selectedSettingsLeaf`, which
the old tree set to a first leaf; the Phase 1 screens only write those through scrollspy), then sets
what it opens; `goHome` is `selectBranch('deck')`. `breadcrumbPath(state, roster)` takes the entity
names as a second argument (pure; the caller reads `localeStore`), falls back to a robot's id when it
has no name, and drops an entity id that is not in the roster. `FLEET_PARAMS_EFFECT_GROUP`,
`FLEET_PARAMS_GROUP_CONTENT` and `SETTINGS_LEAF_CONTENT` are exported for the Phase 2 screens;
`SettingsContent.tsx` and `useNavTree.ts` keep their own copies until Tasks 9 and 17 delete them.

## Task 4: `NavPanel` — one panel of five boxes that expands in place (desk)

**Description:** Rewrite `NavPanel.tsx` / `.css`: a `role="navigation"` column of five parent
`CabinetBox`es (lore + human from `nav.*`, popped = `activeHubTile`'s branch, trait colour), 96 px at
rest (`--nav-panel-rest`). A new `NavEntityList.tsx` renders under the active Probes or Companies box:
"All Probes" then the twelve robots (identity colour), or "+ New Company" then each company
(`Company.color`), each a `CabinetBox` calling `navActions`. When the active branch has entities the
panel widens to 260 px (`--nav-panel-wide`) through a GSAP timeline (`timelineMap` key
`nav-panel-width`, reduced motion = instant) and writes `--nav-panel-width` on `#screen-viewport`. The
panel keeps its static popped facade (the existing permanently-popped `CabinetBox`). Desk shell only in
this task; the phone sheet is Task 5.

**Acceptance criteria:**
- [ ] Five boxes render with the content layer's labels; the active branch's box is popped.
- [ ] Selecting Probes or Companies renders the entity list and sets `--nav-panel-width` to the wide
      value; selecting Deck, Fleet Params or Settings renders no list and the rest value. The width
      timeline is registered in `timelineMap` and killed on unmount.
- [ ] Clicking an entity calls `navActions.selectEntity` with the right id; "+ New Company" opens the
      existing `CompanyCreateForm` (staged draft) inline under the list.
- [ ] Keyboard: Tab moves through boxes and entities in reading order; Enter / Space activates.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/nav/NavPanel.test.tsx src/components/panels/screen/nav/NavEntityList.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: `npm run dev` at ≥ 768 px — the panel sits on the left edge, widens on Probes, the
      content shifts right with it, and the old tree is nowhere.

**Dependencies:** Tasks 1, 2, 3.

**Files:** `src/components/panels/screen/nav/NavPanel.tsx`, `NavPanel.css`, `NavPanel.test.tsx`,
`NavEntityList.tsx`, `NavEntityList.css`, `NavEntityList.test.tsx`

**Estimated scope:** M (two components, one timeline)

**As built (2026-10-09):** the timeline tweens a 0–1 expand factor (`--nav-panel-expand`) on
`#screen-viewport`, and `NavPanel.css` derives `--nav-panel-width` from it on that same element:
`calc(var(--nav-panel-rest) + (var(--nav-panel-wide) - var(--nav-panel-rest)) * var(--nav-panel-expand))`.
That keeps 96 / 260 in CSS only. Tweening px values instead would mean reading the CSS back in JS or
keeping a TS copy, and a derivation declared on an ancestor would not pick up the override (the
traitColors.ts gotcha). The first value and every reduced-motion change are a `gsap.set`, with no
timeline. Unmount kills `nav-panel-width` and removes the factor. The panel width and entity list
follow the open branch (`navActions.branchOfTile(activeHubTile)`) while `expandedTopLevelBranch` is
that branch — see the collapse follow-up below.

Two files beyond the list. `NavBox.tsx` / `.css` is the one box both components draw: Button has no
"current" state, and adding one would change a primitive. `navActions.ts` now exports `branchOfTile`,
`expandsInPlace` and `branchContent`, so the branch / tile / content tables exist once (tests in
`navActions.test.ts`). Colours follow the sketch: the Deck box and All Probes use the header trait
(teal), and + New Company uses the company trait. The landmark is named from `nav.toggle`
("Navigation"). The rest width needed the compact label sizes, so each `NavBox` is an `sc-control`
size container.

Interim, until later tasks: `NavStatusBlock` is no longer rendered, so the world line is missing
until Task 8's `MetaBox`. On the phone shell the panel shows only while `isNavPanelOpen` (the old
hamburger still toggles it) until Task 5's sheet. The content's left edge follows the panel only
from Task 7. + New Company toggles the form, which stays open after Create (`CompanyCreateForm` is
unchanged). `nav.entity.newCompany` is off `AWAITING_CONSUMER`. Manual check, headless Chrome at
1280×800: 96 px on the Deck, 260 px on Probes (18 boxes) and Companies, back to 96 px on Fleet
Params, no tree.

**Follow-up, collapse (Crawford, 2026-10-09, "back, then collapse"; spec §1.2 amended):** the
sketch's "clicking the active box again collapses the list" was missing from the plan, and is now
built. The list and width follow `expandedTopLevelBranch`. The parent box calls the new
`navActions.pressBranchBox`. With an entity selected (a robot or All Probes on Probes, a company on
Companies), it is `selectBranch`: back to the branch's page, list open. On the branch's own page it
toggles the list and changes nothing else. A world-selected robot does not count under Companies.
`selectBranch` never toggles. The open parent box carries `aria-expanded`. `Robot.tsx`'s world click
from the Deck now goes through `selectEntity`, so Probes opens with its list. Before this, it set
only the tile, and the list would have stayed shut. With a tile open, the click still only moves
the selection. 15 mutants, all killed.

## Task 5: `PhoneBar` and the nav sheet (phone shell)

**Description:** New `src/components/panels/screen/PhoneBar.tsx` / `.css`: a 56 px bottom bar with
the menu `Button` (opens the nav sheet) and a well that shows the breadcrumb (Task 8) or the telemetry
line (Task 7). On the phone shell `NavPanel` renders inside a Radix `Dialog` (300 px, left edge, scrim,
focus trap, Escape) whose open flag is `isNavPanelOpen`; picking a branch or entity closes it. The
header's nav-toggle hamburger (`NavToggleButton`) is no longer rendered. `ContentPane` scrolls between
the top bar and the bottom bar (CSS `top` / `bottom` from the two heights), never under either.

**Acceptance criteria:**
- [ ] On the phone shell the bar renders at the bottom, the panel is not in the DOM until the menu
      button opens the sheet, and a pick closes it (`isNavPanelOpen` false).
- [ ] On the desk shell neither the bar nor the sheet renders.
- [ ] The sheet traps focus and closes on Escape and scrim click; the bar's well reads "tap outside or
      pick to close" while open (content key from Task 1; shortened 2026-10-09, see As built).
- [ ] At 320 px wide nothing in the bar overflows (CSS test on the bar's widths).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/PhoneBar.test.tsx src/components/panels/screen/nav/NavPanel.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server at 375 px and 320 px — bar at the bottom, sheet from the left, no floating
      hamburger.

**Dependencies:** Task 4.

**Files:** `src/components/panels/screen/PhoneBar.tsx`, `PhoneBar.css`, `PhoneBar.test.tsx`,
`src/components/panels/screen/nav/NavPanel.tsx`, `src/components/panels/physical/ScreenViewport.tsx`

**Estimated scope:** M (one component, one sheet, viewport wiring)

**As built (2026-10-09):** the menu is the existing `Toggle` + `ToggleFacade` (☰ / ✕), not `Button`.
`Button` draws only a `DualLabel`, and this is `NavToggleButton`'s own control moved into the bar
(`nav.toggle`, as Task 1 found). Its state is in `aria-checked`, and its 44 px box never resizes on a
flip. The bar wears the static popped facade in the header trait, the sketch's Deck colour. The well
is a glow-glass well. It is empty while the sheet is shut, until Task 8 puts the breadcrumb and the
telemetry in it.

**A pick closes the sheet in `navActions`, not in the panel.** Every action's clean slate
(`cleanSlate`, was `clearEntityAndSections`) now also sets `isNavPanelOpen` false. So
`selectBranch`, `selectEntity`, `goHome` and `pressBranchBox` close the sheet when they move the
selection. A collapse in place and + New Company's form are not picks, and leave it open. Task 3's
test "leaves the phone sheet flag and power alone" became "leaves power alone"; the flag half moved
to a new describe. Doing it in `NavPanel` instead would have needed callbacks through `NavEntityList`
and a return value from `pressBranchBox`.

**The sheet is a Radix `Dialog` with no `Portal`.** It renders in place, inside `ScreenViewport`,
never out on `<body>` (the UI Shell guardrail; a test pins it). A modal Radix Dialog gives focus
back only to its own `Dialog.Trigger`, and the menu is PhoneBar's, so after Escape focus fell to
`<body>`. The test caught this. The sheet now records what had focus in `onOpenAutoFocus` and
returns it in `onCloseAutoFocus`. Radix marks a modal by `aria-hidden` on everything else, not
`aria-modal`; the test checks that. The Dialog's title is visually hidden
(`@radix-ui/react-visually-hidden`, already a dependency), named from `nav.toggle`.

**Found in Chrome:**
- The tablet's bottom sleeve strip covers the screen's last 32 px at every width (764–796 at 375,
  320 and 700 px), so a bar at `bottom: 0` sat half under "TRACE ATLAS". The bar now stands on the
  strip (`--phone-bar-bottom: var(--spacing-2xl)`, the sketch's `bottom: var(--sb)`).
  `--phone-bar-clearance` (strip + bar) is where the sheet, its scrim and the content stop.
- `CabinetBox`'s root is inline-flex, so the bar's facade hugged the menu. That gave an 86 px row
  and an 18 px well at 320 px. It now stretches as `DirectionalPanel.css`'s does.

**The content stops at the bar.** With the bar's top at 708 px, today's content (bottom 724) would
have run 16 px under it. `ScreenViewport` now sets `data-shell` on `#screen-viewport` from
`useShell()`, so CSS can tell the shells apart with no media query of its own. `ContentPane.css`
ends the phone shell's `.content-pane` at `--phone-bar-clearance`. Only the bottom edge changed; the
top edge stays the header clearance until Tasks 6 and 7. Task 7 can key the left edge on the same
attribute.

**Measured (headless Chrome over CDP, 375 / 320 / 700 px):**
- Bar 56 px at 708–764; menu 44 × 44.
- Well 257 / 202 / 582 px. Content ends at 708.
- Sheet 300 px from the left edge (288 = the whole screen at 320). Sheet and scrim end at 708.
- No horizontal overflow; no hamburger.
- Focus moves into the sheet on open, and back to the menu after a pick, Escape, a scrim press and
  a press on ✕. The ✕ press does not reopen it.

**Known gaps:**
- ~~At 320 px the hint is 212 px of text in a 202 px well: "…pick to cl…".~~ Fixed by shorter
  copy (Crawford, 2026-10-09: "shorter copy if possible"). The hint is now "tap outside or pick to
  close", without the sketch's "menu open — ", which the open sheet and the ✕ already say. Measured
  in Chrome, it fits the well whole at 320 px (202 / 202) and at 375 px (257 / 257).
- At 320 px the sheet covers the whole screen, so "outside" is the header or the bar.
- ~~The sheet's top (`--nav-sheet-top`, the home card's header clearance) sits over the header's
  lower edge: 4 px below 640 px, 16 px at 640–767.~~ Fixed in Task 6: the sheet and the scrim start
  at Header.css's `--top-bar-bottom`.

**Interim, until later tasks:**
- The phone breadcrumb (`bottom: var(--spacing-2xl)`) now sits under the bar, until Task 8 moves it
  into the well.
- ~~The header's nav-clearance slide still fires on `isNavPanelOpen` from 400 to 767 px.~~ Deleted
  in Task 6.
- `NavToggleButton` is no longer rendered; its files go in Task 9.
- `AWAITING_CONSUMER` is empty.

**Mutation check:** 23 mutants, all killed. One more, the opener's `isConnected` guard, survived
because a detached element takes no focus anyway. The guard was deleted.

## Task 6: `Header` slim — mute and volume beside the power corner

**Description:** Reduce `Header.tsx` / `.css` to the mute `Toggle` and master-volume `SliderLinear` it
already composes (`MUTE_SCHEMA`, `MASTER_VOLUME_SCHEMA`), in one cabinet row beside the power corner on
the desk shell. Remove the nav-clearance GSAP slide, the `HEADER_NAV_CLEARANCE_*` constants and the
`40em` / `64em` media queries. On the phone shell the header holds mute only and the volume slider
opens from the mute box in a Radix `Popover`. The header keeps its static popped facade.

**Acceptance criteria:**
- [ ] Desk: mute and the volume slider render in the header; no element animates on `isNavPanelOpen`
      changes (no `header-cabinet-nav-clearance` timeline exists).
- [ ] Phone: mute renders; the slider is absent until the mute box's volume affordance opens the
      popover; Escape closes it.
- [ ] Mute and volume still drive `audioStore` exactly as before (`Header.test.tsx`'s existing
      behaviour tests pass unmodified).
- [ ] The header fits at 320 px beside the power corner (CSS test).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/Header.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 2.

**Files:** `src/components/panels/screen/Header.tsx`, `Header.css`, `Header.test.tsx`

**Estimated scope:** S (one component, mostly removal)

**As built (2026-10-09):**

**Crawford's call, "Volume box beside mute."** The plan's "the mute box's volume affordance" did not
say how one box both mutes and opens volume, and the sketch draws one 🔊 box. Crawford was asked and
picked a ▾ box beside mute. Mute stays one press; the ▾ box opens the pop-out. It is a Radix
`Popover`: a press outside, Escape or a second press closes it, and focus goes back to the box. It
has no `Portal`, so it renders inside the header (a test pins this).

The ▾ box is a native button over a `CabinetBox`. It pops while open and fills with the accent, as
a checked Toggle does, and is disabled while powered off. Mute now passes
`boxSize={CABINET_TOGGLE_BOX_SIZE}`, so the two are matching 44 px squares. The pop-out lives in
its own `VolumePopout` component, so its open state goes with it when the shell widens; narrowing
again finds it shut.

**Removed:**
- The nav-clearance slide, its `header-cabinet-nav-clearance` timeline, and the `HEADER_NAV_CLEARANCE_*`
  constants and `useMatchesMediaQuery`.
- Every `@media` in Header.css, including the slider-width tiers.
- The dead status-row rules (`.header__row--status`, unrendered since the readout left the header),
  and their guard in `remainingOneOffLiterals.test.ts`.
- The undefined `--rocker-column-width`.
- A stale `.coordinates` comment.

Header.test.tsx's 15 behaviour tests pass unchanged. Their `describe` now pins the desk shell in
setup: jsdom has no `matchMedia`, so it would otherwise be the phone shell, where the slider sits in
the pop-out. The old nav-clearance block went with the slide. The file stubs `CabinetBox` to expose
`popped`, as `NavPanel.test.tsx` does.

**The top bar's lower edge, Task 5's gap.** Header.css declares `--header-top: 20px` (one sticky
offset, 8 px below the 12 px top strip, as the sketch's desk header) and
`--top-bar-bottom: max(calc(var(--header-top) + var(--header-height, 0px)), var(--power-corner-height))`
on `#screen-viewport`. The power corner is part of the top bar and reaches lower than the slim header
(126 px on the phone, 160 on the desk). Task 5's sheet had run 9 px under it at 320 px. The nav sheet
and its scrim now start there: 142 px at 320 / 375 px, 176 at 700, with no overlap. `NavPanel.css`
loses `--nav-sheet-top`. Task 7's content can read the same value.

**Found in Chrome:**
- **The slider's width comes from the cabinet tables.** A fixed 176 px overflowed the desk header by
  8 px, into the power corner. Voxel boxes follow the cabinet tier (32 / 40 / 48 px) and a track never
  draws fewer than three, so its shortest track is 128 / 156 / 184 px. Header.tsx sets
  `--header-volume-width` inline from `CABINET_BOX_HEIGHT` / `CABINET_VOXEL_GAP` /
  `VOXEL_TRACK_MIN_BOX_COUNT`: 184 px, three boxes on the desk. A test checks that every tier fits.
  The desk slider was 164–316 px by breakpoint before.
- **The pop-out's fit at 320 px.** A 244 px pop-out was pushed to x = 8, outside the screen, which
  starts at 16 and clips. It also ran under the power corner. At 184 + 16 px, end-aligned under the
  ▾ box, it spans 25–225 px: inside the screen and left of the corner (233). I added a
  `collisionBoundary` on the screen, but at that width it never changes the placement (measured the
  same without it), so it survived its mutant and was deleted.

**Measured:**

| Width | Header | Row | Pop-out | Overflow |
|---|---|---|---|---|
| 320 px | 36–96 | mute 129–173, ▾ 181–225 | 25–225 | none |
| 375 px | 36–96 | mute 184–228, ▾ 236–280 | 80–280 | none |
| 700 px | 36–96 | mute 490–534, ▾ 542–586 | 386–586 | none |
| 1280 px | 36–153 | mute 930–974, slider 982–1166 | — | none |

The power corner starts at 233 / 288 / 594 / 1174 px.

**Mutation check:** 19 mutants, all killed. Two more survived at first:
- "the ▾ box never pops" was invisible with the real `CabinetBox` under mocked gsap, so it is now
  asserted through the stub.
- The `collisionBoundary` was deleted (see above).

**For later tasks:** `ContentPane.css`'s header clearance (`--header-height` + `--spacing-lg`) is
untouched; Task 7 can move it to `--top-bar-bottom`. `NavTreeNode.css` still names
`.header__row--volume` in a comment; it goes in Task 9.

## Task 7: `ContentPane` — the opaque content surface over the dimmed world

**Description:** `ContentPane.css` gets `--content-surface` (an opaque colour token added to
`index.css`) as its background and `left: var(--nav-panel-width)` on the desk shell; the Deck
(`activeHubTile === null`) renders no surface. `ConsolePanel.css` loses the header / nav clearances and
the translucent glass. `WorldView`'s root gets `data-dimmed` while a surface is showing, and
`WorldView.css` dims the static layers (`filter: brightness(.42) blur(2px)`, the sketch's values) under
that attribute — the moving robot layer is not blurred separately (the surface covers it).

**Acceptance criteria:**
- [ ] With a branch open, `ContentPane` is opaque (CSS test: the background is a solid colour, no
      alpha) and `WorldView` carries `data-dimmed`; on the Deck neither is true.
- [ ] `ContentPane`'s left edge follows `--nav-panel-width` on the desk shell and is 0 on the phone.
- [ ] Every existing content screen renders inside unchanged (the `ConsolePanel.test.tsx` routing tests
      pass unmodified).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/console/ContentPane.test.tsx src/components/panels/screen/worldView/WorldView.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 4.

**Files:** `src/components/panels/screen/console/ContentPane.tsx`, `ContentPane.css`, `ConsolePanel.css`,
`src/components/panels/screen/worldView/WorldView.tsx`, `WorldView.css`, `src/index.css`

**Estimated scope:** M (five files, CSS-heavy)

**As built (2026-10-09):**

**The surface.** `index.css` declares `--content-surface: #141a20` once in `:root`. That is the
sketch's `--surf2`, and opaque by rule (a test parses it: one declaration, a six-digit hex).
`.content-pane` paints it and has a 1 px `--color-border` edge. Its old glass is gone: the
`--color-surface: rgba(26, 26, 26, 0.75)` override that tinted every panel inside. The panels now
paint the app's own `--color-surface` over the plate. `ContentPane.tsx` is unchanged: its Deck
branch already renders only the home card, and the card is not a surface.

**Its edges** come from the variables the earlier tasks left:
- **Top:** `--top-bar-bottom` on both shells (Header.css, Task 6).
- **Desk:** left `calc(var(--nav-panel-width) + 16px)`, so it rides the panel's tween. Right 16 px.
  Bottom `calc(32px + 16px)`, above the bottom sleeve strip. These are the sketch's 16 px gutters
  (`.content { left: 112px; right: 16px; bottom: calc(var(--sb) + 16px) }`), where the dimmed world
  shows.
- **Phone:** left 0, right 0, bottom `--phone-bar-clearance` (the sketch's `.scroll`).
- The old `height: calc(100% - 72px)` and the phone's `height: auto` went.

`ConsolePanel.css` loses the three `--console-*-clearance` variables, their `600px` / `48em` media
queries and the clearance padding. The scroller's padding is now `16px 8px 16px 0`.

**The dim.** `WorldView` sets `data-dimmed` from `activeHubTile !== null`, the same field
ContentPane switches on. One test renders both, for the Deck and all four tiles, and checks they
agree. `WorldView.css` puts `filter: brightness(0.42) blur(2px)` on the static scene layers.

**Beyond the plan:** the moving layers (both robot rows and the bubbles) get `brightness(0.42)`
with no blur. The world does show around the surface: under the nav panel's 0.75 glass, in the
gutters, and in the top band (142 px on the phone), where bubbles rise. A robot left at full
brightness there was brighter than the dimmed world behind it. The blur stays off the layers that
repaint every frame, as the plan said.

**Found in Chrome:**
- **A 4 px horizontal scrollbar** on Fleet Params and Settings at every width. A popped facade's
  front face sits `computeCabinetFrontFaceOffset(1).frontFaceOffsetX` (2 × `CABINET_POP_DISTANCE`
  = 4 px) right of its box, so each full-width accordion was 1075 px wide in a 1071 px scroller.
  The old 32 px desk edge clearance had hidden this. The 8 px right padding holds it, and a test
  checks the padding against that function. Afterwards `scrollWidth === clientWidth` on every view
  at 1280, 375 and 320 px but one (next item).
- **Probes at 320 px** is 300 px of content in a 256 px scroller. `RobotsTab.css`'s
  `minmax(300px, 1fr)` grid causes it. It predates this task: the phone scroller was 256 px before
  too. RobotsTab goes in Task 21; noted for Task 28's 320 px pass.

**One file beyond the list:** `RobotDisplaySection.css` read ConsolePanel.css's
`--console-nav-panel-clearance` (320 px) to centre the fixed avatar on the desk. Left undefined,
that would have voided three declarations. It now reads `--nav-panel-width`: `(W + nav) / 2` is the
surface's centre, since the two gutters match. The robot screen is rebuilt in Task 16. A guard test
scans every stylesheet under `src/` for the deleted variables.

**Measured (headless Chrome, CDP):**

| Width | Deck | Fleet Params / Settings | Probes / Companies (list open) | Static / moving filter |
|---|---|---|---|---|
| 1280 | no pane, not dimmed | 128–1248 × 176–736 | 292–1248 × 176–736 | `brightness(0.42) blur(2px)` / `brightness(0.42)` |
| 700 | no pane | 16–684 × 176–708 | 16–684 × 176–708 | same |
| 375 | no pane | 16–359 × 142–708 | same | same |
| 320 | no pane | 16–304 × 142–708 | same | same |

The screen starts at x = 16, and the phone bar's top is 708. There is no document overflow at any
width.

**Mutation check:** 26 mutants, all killed. Four of them first missed their target because two
stylesheets are CRLF; that was a script fix, not a surviving mutant.

**For later tasks:**
- The home card's top is still the old `--header-height` clearance, untouched.
- The desk surface starts flush at the power corner's bottom (176 at 1280), with no top gutter.
- The phone breadcrumb still sits under the bar until Task 8.

## Task 8: `MetaBox` (the world line) and `NavBreadcrumb` as a well

**Description:** New `src/components/panels/screen/worldView/MetaBox.tsx` / `.css`: the glow-glass well
bottom-left of the Deck carrying the world line — `NavStatusBlock`'s telemetry (style name, coordinates,
clock, temperature, emitting count) moved here verbatim, `NavStatusBlock` deleted. `NavBreadcrumb.tsx`
reads `navActions.breadcrumbPath` instead of `useNavTree`, renders as a well (desk: bottom of the
content surface; phone: inside `PhoneBar`'s well, telemetry when the path is empty), and keeps its
"nothing at the landing state" rule.

**Acceptance criteria:**
- [ ] On the Deck the meta box shows the five telemetry fields with the same formatting
      (`formatClock`) `NavStatusBlock.test.tsx` asserted; those tests move to `MetaBox.test.tsx` and pass.
- [ ] The breadcrumb renders `Root / Fleet Params / LFO Bank` for that state, nothing on the Deck, and
      each ancestor is a button calling `navActions` (Root → `goHome`).
- [ ] On the phone shell the breadcrumb lives in the bar's well and the meta box's telemetry shows
      there when the path is empty.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/MetaBox.test.tsx src/components/panels/screen/nav/NavBreadcrumb.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Tasks 3, 5, 7.

**Files:** `src/components/panels/screen/worldView/MetaBox.tsx`, `MetaBox.css`, `MetaBox.test.tsx`,
`src/components/panels/screen/nav/NavBreadcrumb.tsx`, `NavBreadcrumb.css`, `NavBreadcrumb.test.tsx`,
`src/components/panels/screen/PhoneBar.tsx`

**Estimated scope:** M (one new component, one rewired)

**As built (2026-10-09):**

**The meta box.** `MetaBox.tsx` exports two components:
- `WorldLine`: NavStatusBlock's three readouts (`formatClock`, the `nav.status.*` fills) in one line of
  three inline fields. The order is clock and temperature, then probes emitting, then the place.
- `MetaBox`: the desk Deck's well, holding the world line.

`WorldView` mounts `MetaBox`, as spec §2 has it ("WorldView — meta box lines"). It renders only on
the desk shell on the Deck. NavStatusBlock's six tests moved to `MetaBox.test.tsx` unchanged, and
NavStatusBlock's three files are deleted (grep gate: no importers left).

**Beyond verbatim: the emitting count.** It is now a selector that returns a number, not the whole
robots array. `updateRobot` replaces that array on every battery tick and swell. The meta box sits
on the Deck, which Task 29's idle-paint gate measures, and it now re-renders only when its line
changes. A Profiler test pins this, and a mutant that widened the subscription was killed.

**The breadcrumb.**
- `navActions` gains `breadcrumbTrail(state, roster)`. Each segment has its label and, for Root, the
  branch and the entity, a `go`: `goHome`, `selectBranch` (never the toggling `pressBranchBox`) or
  `selectEntity`. `breadcrumbPath` is now the trail's labels, so the path is still derived in one
  place, and Task 3's tests are unchanged.
- `NavBreadcrumb` renders every ancestor as a button, per the acceptance criterion; the Fleet Params
  and Settings branch segments used to be plain text. The current segment is text with
  `aria-current="page"`.
- Entity names come from `useEntityRoster`, NavEntityList's narrow roster hook, now in its own
  module (`nav/useEntityRoster.ts`) and shared. A Profiler test shows a battery tick does not
  re-render the breadcrumb.

**Where they sit:**
- **Desk:** the meta box (Deck) and the breadcrumb (every other view) share the content surface's
  bottom-left corner, the same `left` / `bottom` expressions as `.content-pane` (a test compares the
  three stylesheets). The sketch hangs the crumb over the surface's corner, but the content here
  scrolls. So the surface keeps a 32 px band at its foot (`padding-bottom: var(--nav-breadcrumb-height)`;
  0 on the phone) and the crumb sits in it, never over content.
- **Phone:** PhoneBar's well shows the open sheet's hint, else `WorldLine` on the Deck, else
  `<NavBreadcrumb inBar />` (inline, with no well of its own). On its own, NavBreadcrumb renders
  nothing on the phone.
- **The wells:** `index.css` gains `--well-background` and `--well-inset`, the accent-free parts of the
  glow glass (spec §2's `--well-*`). Each well adds its own accent glow and border, since a `var()` in
  `:root` would resolve the accent there. The meta box, the breadcrumb and PhoneBar's well all use the
  tokens, all in the header trait.

**Files beyond the list:** `navActions.ts` / `.test.ts`, `useEntityRoster.ts` (from
`NavEntityList.tsx`), `WorldView.tsx` / `.test.tsx`, `PhoneBar.css` / `.test.tsx`, `ContentPane.css`
(the band), `index.css` (the tokens), and two comments that named NavStatusBlock (`Header.test.tsx`,
`content/copy/nav.ts`).

**Measured (headless Chrome, CDP):**
- **Desk at 1280 px:** the meta box spans 128–576 × 700–736 on the Deck. The crumb spans
  128–302 × 704–736 on Fleet Params, and starts at 292 with the panel wide. The surface's content
  ends at 704.
- **Phone, on a branch:** every trail fits the well whole at 375 and 320 px.
- **Phone, on the Deck:** the world line runs 69 px over the well at 375 px and 138 px at 320, and the
  well's ellipsis cuts it. The clock, temperature and count stay visible; the place is cut, and the
  sketch's phone line leaves it off too.
- No document overflow at any width.
- Settings reads `Root / Settings / Audio Quality` as it opens. Phase 1's SettingsContent scrollspy
  writes `selectedSettingsLeaf` on mount; that is expected until Tasks 17–18.

**Mutation check:** 47 mutants, all killed. One survived first: rounding the clock's minute up
passed, because the moved tests use 14.5, a whole minute. A new edge-case test (7.26 → 07:15,
23.999, null → 00:00, the hour clamp at 25) killed it and two more clock mutants.

One mutant was not run because it is equivalent: the branch segment calling `pressBranchBox`
instead of `selectBranch`. The branch is only an ancestor when an entity or a group follows it,
and there the two behave the same.

**For later:**
- `MetaBox` keeps NavStatusBlock's `role="status"`. The clock ticks with the lighting tick (about
  every second), so a screen reader may announce it constantly. That is worth a look in an a11y
  pass; it was left as it was.
- Pre-existing, not touched: on the phone Deck the home card (`.content-pane__home`) has no bottom
  bound and runs under the bar. Noted for Task 28's 320 px pass.
- Task 26 mounts WorldView while off, and the meta box should not show on the off screen then.

## Task 9: Delete the tree

**Description:** Remove `NavTree.tsx`, `NavTreeNode.tsx`, `NavCabinetRow.tsx`, `NavStatusBlock.tsx`,
`NavToggleButton.tsx`, `useNavTree.ts`, `useNavPanelSlideAway.ts`, `src/data/navTreeConfig.ts`, their
CSS and tests, and `navPanelViewsAndContent.integration.test.ts`; rewrite `ScreenViewport.test.tsx` for
the new composition (Header, WorldView, NavPanel, ContentPane, NavBreadcrumb, PhoneBar on the phone).
Gate: `grep -rn` for every deleted export must be empty before the file goes. `accordionSync.ts`,
`sectionRefs.ts` and the content screens' calls into them stay until Task 18 (they now have no nav
caller and are inert).

**Acceptance criteria:**
- [ ] No file under `src/` imports any deleted module (grep gate recorded in the commit message).
- [ ] `npm test` is green with the deletions; the only test changes are the deleted files and the
      `ScreenViewport` rewrite.
- [ ] The UI Shell guardrail test (interactive UI only inside `ScreenViewport`) still passes.

**Verification:**
- [ ] `npm test` passes (full suite).
- [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.

**Dependencies:** Tasks 4–8.

**Files:** the deletions above; `src/components/panels/physical/ScreenViewport.tsx`, `ScreenViewport.test.tsx`

**Estimated scope:** L by file count, XS by thought (mechanical deletion behind a grep gate)

**As built (2026-10-09):**

**Deleted (18 files):** `NavTree`, `NavTreeNode`, `NavCabinetRow` and `NavToggleButton` (each `.tsx`,
`.css`, `.test.tsx`), `useNavTree.ts` and its test, `useNavPanelSlideAway.ts` (it had no test),
`navPanelViewsAndContent.integration.test.ts`, and `src/data/navTreeConfig.ts` and its test.
NavStatusBlock's three files had already gone in Task 8. `ScreenViewport.tsx` is unchanged: its
composition was already the new one.

**The grep gate is now a test.** `ScreenViewport.test.tsx` checks that:
- none of the nine modules exists in any extension (`.ts`, `.tsx`, `.css` or a test);
- no `.ts` / `.tsx` file under `src/` imports or `vi.mock`s one, by path or alias, stylesheets included.

The rewrite also pins `.screen-content`'s six children and their order (Header, WorldView, NavPanel,
ContentPane, NavBreadcrumb, PhoneBar) and checks nothing renders while off. The `data-shell` test is
kept. Before deletion the gate found two live dependents: `ScreenViewport.test.tsx`'s own mock of
`NavToggleButton` (gone with the rewrite) and `useAccordionOpenState.ts`.

**`expandNavAncestorsForId` moved, verbatim, into `useAccordionOpenState.ts`**, its last caller,
with its `asTopLevelBranch` guard. Both retire in Task 18. The plan's "the content screens' calls
stay inert" missed this function. Its test pins that opening an accordion writes
`expandedTopLevelBranch`, and the new panel reads that field to open its entity list. Removing
the call would have broken that test, which this task's acceptance does not allow changing. So the
behaviour is unchanged for now, and it is reported at Checkpoint A: an accordion opened on a
screen can reopen an entity list the user collapsed.

**Beyond the plan:**
- **Content keys:** `nav.expand` / `nav.collapse`, the tree rows' +/− labels, lost their last
  consumer. The content guard ("every key is referenced") failed on them, so both are removed from
  `content/copy/nav.ts`. No doc or inventory names them.
- **One test added** to `useAccordionOpenState.test.ts`: opening an id that does not start with a nav
  branch expands nothing. The guard's coverage lived in the deleted useNavTree tests, and its mutant
  survived until this test was added. It is the one test change besides the deletions and the
  ScreenViewport rewrite.

Comments that name the deleted files as history were left as they are: DualLabel.css, Toggle.css,
TempoSyncToggle.css, CabinetBox.css, index.css, NavBox.css, the content copy files and the Phase 1
content screens. No surviving selector targets a tree class. The docs (UI_SHELL.md,
COMPONENT_LIBRARY.md) are Task 31's.

**Verified:**
- Full suite: 311 files / 8486 tests (from 318 / 8680; the difference is the deleted tests).
- `build:types` clean; `lint` at the known 25 errors / 4 warnings, none in these files; `npm run build`
  clean.
- The UI Shell guardrail tests (`SleeveContainer.test.tsx`, `Tablet.test.tsx`) pass.
- Headless Chrome at 1280 and 375 px: every nav pick (Fleet Params, Settings, Companies, Probes, a
  robot) lands, with no console errors.

**Mutation check:** 12, all killed. That is ten scripted (a deleted stylesheet re-imported, a test
mocking a deleted module, a type-only import, an alias import, an extra / reordered / always-on
shell child, three on the moved function) plus two deleted files restored. The one survivor, the
branch guard, is the test added above.

### Checkpoint A: Shell and nav (Crawford's dev look)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Dev server at ≥ 768 px, 375 px and 320 px: the two strips, the slim header, the one panel
      expanding in place, the opaque surface over the dimmed world, the meta box on the Deck, the phone
      bar and sheet — with today's content screens inside, untouched.
- [ ] Stop and report. Phase 2 starts on Crawford's word.

---

### Phase 2: Section tabs

## Task 10: `ContentEntry.help`, lane `short` forms, `laneTitle()`

**Description:** `src/content/types.ts` gains `help?: { human: string; lore?: string }` on
`ContentEntry` and `short?: string` on entries that need a compact form; `labels()` (`content/index.ts`)
surfaces `help` into `SchemaLabels` and `ControlSchemaBase` gains `help?`. `fleet.lfoBank.laneA–D` gain
`short: 'LFO A'` …; `src/data/lfoConfig.ts` gains `laneTitle(lane: LfoLaneId, shell: 'desk' | 'phone')`
returning "Core LFO (LFO A)" on desk and "LFO A" on phone. Write the help copy for the **Fleet Params
and Settings** controls in this task (human voice per `docs/reference/copy-tone-guide.md`, the length
of the existing intro descriptions; lore name from the entry).

**Acceptance criteria:**
- [ ] `labels('fleet.lfoBank.rateDrift').help` returns the entry's help; an entry without `help`
      yields `undefined`.
- [ ] `laneTitle('laneB', 'desk') === 'Companion LFO (LFO B)'`, `laneTitle('laneB', 'phone') === 'LFO B'`
      for all four lanes.
- [ ] Every Fleet Params and Settings control entry has `help.human` (a test enumerates the schemas in
      `audioRigConfig.ts`, `lfoConfig.ts`, `sectorSettingsConfig.ts`, `sessionConfig.ts` and the
      audio-load schemas).

**Verification:**
- [ ] `npx vitest run src/content src/data/lfoConfig.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None (Phase 1 complete).

**Files:** `src/content/types.ts`, `src/content/index.ts`, `src/content/copy/fleet.ts`,
`src/content/copy/settings.ts`, `src/data/lfoConfig.ts`, `src/data/lfoConfig.test.ts`, `src/types/controls.ts`

**Estimated scope:** M (two type changes, copy for ~30 controls)

**As built (2026-10-09):**

**Types.** `ContentHelp = { human: string; lore?: string }` lives in `content/types.ts` and is
re-exported from `@/content`. `ContentEntry.help?`, `SchemaLabels.help?` and `ControlSchemaBase.help?`
all use that one type; `types/controls.ts` imports it rather than declaring its own copy. `lore` is
optional, following this plan over spec §1.4's required `lore`. It is the lore *description*: the
popover takes the lore *name* from the entry's own `lore`. `labels()` adds `help` only when the entry
has one, on both surfaces, by reference, never as `help: undefined`. `short` is never spread.

**`laneTitle(lane, shell)`** takes `LfoLaneId` (`'a'…'d'`), the real lane type; the acceptance line's
`'laneB'` is not a lane id. `Shell` comes from `useShell.ts` as a type-only import. The desk form
comes from a new key, `fleet.lfoBank.laneTitle` (`template: '{lane} ({short})'`), following the
`ui.noteValue.modified` precedent, so no format string sits in `src/data`. `LFO_BANK_LANE_CONTENT`
moved from `audioRigConfig.ts` (private) to `lfoConfig.ts` (exported) so the lane panels and
`laneTitle` read one map.

**Which controls got help.** 37 entries. Every value control (slider, radio, toggle, text input,
coords input, `LfoLink`) reachable from `audioRigConfig.ts`, `sectorSettingsConfig.ts` and
`sessionConfig.ts`, plus the three keys that shared primitives build schemas from: `ui.lfoLane` and
`ui.lfo.depth` (`LfoLink`) and `ui.tempoSync`. `lfoConfig.ts` has no schemas; the lane schemas are in
`audioRigConfig.ts`. **Buttons get no help** (Retransmit, Save, Share, Load, Delete, Clear Local
Storage, the Random and preset buttons). A button's labels sit inside its own face, so a "?" there
would be a button inside a button. Panels and headings are not controls. Copy is human voice only.
No lore descriptions were written; those are Crawford's to add. Copy files touched beyond the list:
`ui.ts`, `sector.ts`, `session.ts`.

**Tests.** `content.test.ts` gained the coverage guard: a recursive walk over the three config
modules' exports, with a check that it reaches nested lane schemas so it can never pass on an empty
list. It also guards that help is plain text (no `<` / `>`; the popover renders text) and that every
help has a non-empty human. `index.test.ts` has fixture cases for `help` and `short`.
`lfoConfig.test.ts` covers `laneTitle` for all four lanes on both shells and checks that the short
forms are distinct.

**Verified:** `src/data`, `src/content`, `ui/controls` and `console` tests: 74 files / 1464 tests;
`build:types` clean; lint at the known 25 errors / 4 warnings. **Mutation check:** 17, all killed
(help dropped / emitted as undefined / rebuilt with `lore: undefined`, `short` spread, `laneTitle`
shells swapped or mis-mapped, template changed, duplicate short, help removed from five controls
including one nested lane control and one primitive-owned key, markup in help, blank help, walker cut
to top level).

## Task 11: `SectionTabs` primitive

**Description:** New `src/components/ui/controls/SectionTabs.tsx` / `.css`: Radix `Tabs.Root` with
`CabinetBox` triggers (popped = active, trait colour via `getTraitColorStyle`, `autoHeight`, a
`timelineKey` per trigger), an optional sub-tab row (the same component nested, smaller boxes), and
`Tabs.Content` without `forceMount` so only the active section renders. Items are
`{ id, content: ContentKey, trait, render }`. Added to COMPONENT_LIBRARY.md in Task 31.

**Acceptance criteria:**
- [ ] Only the active item's `render()` output is in the DOM; switching unmounts the old one
      (mutation check: add `forceMount` and watch the test fail).
- [ ] Arrow keys move the active trigger; Home / End jump; the tablist has the right ARIA roles.
- [ ] The active trigger is the popped `CabinetBox`; inactive ones are at rest; a label never resizes
      the box on flip (largest-content sizing test).

**Verification:**
- [ ] `npx vitest run src/components/ui/controls/SectionTabs.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/ui/controls/SectionTabs.tsx`, `SectionTabs.css`, `SectionTabs.test.tsx`

**Estimated scope:** S (one primitive)

**As built (2026-10-10):**

**API:** `{ items, value, onValueChange, label, variant? }`. Two props are additions to spec §4's
sketch:
- `label` is the tablist's accessible name and is required. The consumer passes content.
- `variant: 'section' | 'sub'` marks the nested sub row with `.section-tabs--sub`.

Items are as planned. React.memo'd per COMPONENT_LIBRARY.md, cast to keep the `Id` generic.

**Departures from the description, each for a reason:**
- **The trigger is the Radix `Tabs.Trigger` button itself**, carrying the trait colour, with the
  `CabinetBox` inside only drawing (Button's split). The spec sketch had `asChild` on a `<span>`, which
  would drop the button.
- **The panel's `render()` runs inside `Tabs.Content`** through a tiny `SectionPanel`, so it runs
  only while Radix has the panel mounted. The sketch's `item.id === value ? item.render() : null`
  guard is gone because it would make the plan's own `forceMount` mutant survive.
- **No `autoHeight`.** CabinetBox documents it for permanently popped facades. The triggers keep the
  tier heights with the 44 px touch floor: 48 px on desk, 44 px on phone.
- **Hover pops a resting trigger**, like RadioButton's options. Focus needs no case of its own: Radix's
  automatic activation makes the focused tab the active one.
- **Two edge cases decided here.** An empty list renders nothing. A `value` that no item has falls
  back to the first item without calling `onValueChange`, so the pane is never blank and nothing
  writes to the store during render.
- **The sub row is "smaller" by its labels** (`--font-size-label-compact`, 11 px against 15 px), not by
  its box height, because of the touch floor.

**Measured in Chrome** with a throwaway page (deleted): at 1280 px both rows fit. At 375 / 320 px the
five Fleet Params tabs (497 px) and the four lanes (385 px) are wider than the pane and scroll
sideways (`overflow-x: auto`, `white-space: nowrap`); nothing wraps or clips. A popped front face
moves 4 px right and 2 px down. Its top stays inside the row and the bottom padding holds the drop.

**Left for later:**
- The sketch's phone tab row is tighter (12 px labels, 10 px side padding). Nothing in this primitive
  is shell-aware; that sizing belongs to the phone pass (Checkpoint B / Task 28) if Crawford wants it.
- Task 15's lane sub-tabs need `laneTitle()` as their label. That label isn't a `ContentKey`, so Task
  15 will need a label override on the item, which this primitive does not have yet.

**Verified:** 20 tests; `build:types` and lint clean on the files. **Mutation check:** 21, all killed.
- **Panel mounting:** `forceMount`; `render()` called eagerly.
- **Keyboard and naming:** manual activation; no loop; an unnamed tablist.
- **Pop state:** inactive fully popped; active at rest; hover ignored; hover never cleared.
- **Per-trigger identity:** a timeline key without `useId`; one trait for all triggers; the label
  swapped on active.
- **Edge cases:** a stale value showing nothing; a stale value reporting a change; empty items
  unguarded.
- **Variant and memo:** the variant class lost; memo removed.
- **CSS:** bold or padded active state; labels wrapping; the row clipping.

The stale-value-reports-a-change mutant first **survived**: a deferred `onValueChange` landed after
the synchronous assertion. The test now waits a tick before asserting.

## Task 12: `HelpPopover` primitive on the control label

**Description:** New `src/components/ui/controls/HelpPopover.tsx` / `.css`: a focusable "?" button
(accessible name from `ui.help`) rendered by `DualLabel` when the schema carries `help`, opening a
Radix `Popover` styled as a well with the human description, the lore name and the lore description.
`DualLabel` gains the optional `help` prop; every primitive that composes `DualLabel` passes
`schema.help` through.

**Acceptance criteria:**
- [ ] A schema with `help` renders the "?"; one without renders no button (every existing `DualLabel`
      test passes unmodified).
- [ ] Opening shows `help.human` and `help.lore`; Escape and click-outside close; focus returns to the
      "?".
- [ ] The well has no cabinet walls and no glow (CSS test: it is the recessed style, not `CabinetBox`).

**Verification:**
- [ ] `npx vitest run src/components/ui/controls/HelpPopover.test.tsx src/components/ui/controls/DualLabel.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 10.

**Files:** `src/components/ui/controls/HelpPopover.tsx`, `HelpPopover.css`, `HelpPopover.test.tsx`,
`DualLabel.tsx`, `DualLabel.test.tsx`

**Estimated scope:** S (one primitive, one prop)

**As built (2026-10-10):**

**The "?".** The sketch's `.q`: a 16 px outlined circle in a 24 px button. The phone shell gets a
44 px hit area through a `::before` keyed on `#screen-viewport[data-shell='phone']`. In Chrome at 375
px, presses at the slider track's top edge under the "?" still land on the slider. It is not cabinetry:
a label row stays a label row. `margin-block: -4px` gives back the layout height. Without it every
labelled row grew 1.5 px (24 against the 22.5 px name line, measured), and with it the line is 22.5.
Its accessible name comes from a new key, `ui.help` (`template: 'Help for {name}'`), so the 59 "?"s on
Fleet Params are told apart. It falls back to the lore label, then to the plain "Help".

**DualLabel** gains `help?`. The "?" sits *beside* the last line's name in a
`.sc-dual-label__line` wrapper, never inside the name's span, so `getByText('Tempo')` still finds
exactly the name. With no label at all it renders nothing, help or not.

**Pass-through.** These primitives pass `schema.help` to their own label row: SliderLinear (its
interactive path only), SliderLog, SliderCenteredZero, RadioButton (the control's label, never an
option's), Toggle, TextInput, CoordsInput, Stepper, StepperWithToggle (into the toggle schema it
builds), LfoLink, DirectionalPanel. TempoSyncToggle passes its own `ui.tempoSync` help.

Never passed:
- **Button, AccordionContainer, NavBox and RadioButton options:** the label is inside the button, and
  a "?" there would be a button inside a button.
- **SliderLinear's read-only path:** it is a readout with `role=status`.

A new `helpOnLabels.test.tsx` covers all of it.

**Two departures from the description, each found in Chrome:**
- **Modal, and portalled into ScreenViewport.** Modal because spec §3 says popovers trap focus, and
  only modal Radix returns focus to the "?" after an outside press. Left in place (no Portal, the
  Header pop-out's way), it opened inside its panel, and the next panel's facade painted over it at
  1280 and 375 px: every popped facade is its own stacking context. It now portals into
  `#screen-viewport`, so it is still inside ScreenViewport (the UI Shell guardrail) and never in
  `document.body`. With no screen on the page, as in component tests, it opens in place.
- **The collision boundary is the screen.** Left to the window, it ran 8 px past the screen's edge into
  the sleeve at 375 px. It now sits at 51–351 inside 16–359.

**The well** uses the shared well tokens (NavBreadcrumb / MetaBox / PhoneBar), over an opaque
`--content-surface` base, because `--well-background` is 55 % see-through and the popover sits over
controls. Every shadow is inset: no filter, no outward glow. Its content is the title (the human
name), the human description, and the lore name over the lore description when there is one.

**Visible now, before Phase 2's screens:** every Fleet Params and Settings control in today's screens
shows its "?" (59 on Fleet Params).

**One existing test changed.** `AudioRigDrawer.test.tsx`'s "renders no accordion anywhere" asserted no
buttons at all. It now asserts no buttons other than help "?"s, with at least one present. Its intent,
no accordion trigger, is unchanged.

**Verified:**
- Full suite: 314 files / 8574 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.
- Chrome at 1280 and 375 px: the popover opens on screen, focus moves inside it, and a second press,
  Escape or a press outside each close it with focus back on the "?".

**Mutation check:** 38, all killed after one fix. The collision-boundary mutant first **survived**.
`HelpPopover.test.tsx` now wraps the real `Popover.Content` to record the boundary it is handed.

## Task 12b: Help copy for the probe and company controls

**Description:** Write `help` for every control entry in `src/content/copy/probe.ts` and `company.ts`
(the robot sections: Levels, Composition, Envelope, Source and their layers; the company assignment
radio), in the copy-tone guide's human voice at the existing intro-description length. Content only.

**Acceptance criteria:**
- [ ] A test enumerates `ROBOT_SECTIONS_CONFIG`'s subsections' control schemas
      (`robotOptionsConfig.ts`) and `companyConfig.ts`'s schemas and asserts each has `help.human`.
- [ ] `content.test.ts` passes.

**Verification:**
- [ ] `npx vitest run src/content` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 10.

**Files:** `src/content/copy/probe.ts`, `src/content/copy/company.ts`, `src/content/content.test.ts`

**Estimated scope:** S (copy for ~25 controls)

**As built (2026-10-10):**

**What the test walks.** `ROBOT_SECTIONS_CONFIG` (in `robotSubsectionConfig.ts`, not
`robotOptionsConfig.ts`) holds section and nav ids only, no control schemas. So the new block in
`content.test.ts` reuses Task 10's `valueControlSchemas` walker over `robotOptionsConfig.ts`'s exports,
plus the company schemas. The two company radios are functions of the live company list, so they are
walked as built from a one-company fixture. A reach check (the three Source layers included) keeps
the walk from passing on an empty list.

**Which controls got help.** 33 entries:
- **Probe (28):** Monitor Mode and Volume; the seven Composition controls, including the dev-only
  Click Track toggle (the walker counts it as a value control); the four envelope times; and Type,
  Gain, Detune, Phase and Interval on each of the three Source layers.
- **Company (5):** `company.assign`, `company.selection`, `company.name`, `company.name.create` and
  `company.name.rename`.

The last two are built inside `CompanyCrudControls.tsx` by spreading `COMPANY_NAME_INPUT_SCHEMA` and
then their own labels. Without help of their own they would silently show the base input's, so the
test checks them by key, and checks that their text differs from the base. The parallel Source layers
each name their own layer, and a test holds the three apart.

Not given help:
- the battery readout (read-only, `role=status`);
- the Display rows (`dualLabel`, not controls);
- the buttons (Create / Rename / Delete, Clear Filter).

**Copy facts, checked against code and docs:**
- Highlight halves the other probes' note velocity (AUDIO_SYSTEM.md).
- Density never drops below one note.
- Phrase Length 0 scatters notes over the measure, and Pitch Repeat is inert while it is 0
  (MELODY_SYSTEM.md).
- Note Variance 0 is an unweighted random pick, and 8 uses all eight notes.
- Ranges: octaves run 1–7, Detune ±50 cents, Phase 0–360.
- Interval renders only on Pulse layers.
- Reassigning a probe applies nothing (COMPANIES.md). A new company starts with no probes. Names cap
  at 128 characters.

Human voice only; lore descriptions stay Crawford's to add.

**Visible now.** A "?" appears on every robot-screen and company-screen value control, and on every
roster card's company radio. The roster cards keep theirs until Task 21 replaces the cards.

**Two existing tests changed**, the same relaxation Task 12 made to `AudioRigDrawer.test.tsx`:
- `RobotSelectionCard.test.tsx`: seven unnamed `getByRole('button')` calls now find the card's
  "?" as well. A `cardButton()` helper picks the one non-help button and keeps the "exactly one card
  button" property. The "?" sits in the card's bottom region, a sibling of the role="button" top, so
  it is not a nested button.
- `CompanyCrudControls.test.tsx`: "no aria-expanded anywhere" now allows help triggers only, with at
  least one present.

**Verified:**
- Full suite: 314 files / 8579 tests.
- `build:types` clean; lint at the known 25 / 4.

**Mutation check:** 13, all killed. They cover:
- help dropped from a top-level control, a nested layer control, Click Track, each company schema and
  the Create clone;
- the Rename clone or the companion layer repeating another entry's help word for word;
- the walk skipping either module;
- the card growing a second real button, and the CRUD form gaining a real `aria-expanded` trigger.

A 14th mutant first **survived** because it was ill-formed: it deleted the card helper's own length
check, which cannot fail while the card has one button. It was replaced by the second-button mutant
above.

## Task 13: `RadioButton` — single-line options

**Description:** `RadioButton.tsx` renders each option as one line of `humanLabel` (no `DualLabel`
inside the option box); the control's own label row keeps `DualLabel` and now carries the help "?"
(Task 12), which is where the lore names go. Option boxes keep their `CabinetBox` pop, colour and
largest-content sizing. Every consumer (Shape, Anchoring, Audio Mode, the load preset, company
assignment, `LfoLink`'s lane row) changes face with no prop change.

**Acceptance criteria:**
- [ ] An option with `loreLabel` renders only its `humanLabel` inside the box (CSS test: no `.dual-label`
      in an option).
- [ ] Selection, `color`, disabled and the pop timeline behave as before (`RadioButton.test.tsx`'s
      behaviour tests pass unmodified; only the face tests change).
- [ ] Row height matches the single-line cabinet height (`useCabinetBoxHeight`) at both tiers.

**Verification:**
- [ ] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 12 (for the lore's new home).

**Files:** `src/components/ui/controls/RadioButton.tsx`, `RadioButton.css`, `RadioButton.test.tsx`

**Estimated scope:** S (one primitive)

**As built (2026-10-10):**

**The face.** Each option's face is `<span class="sc-radio-button__label">` holding its `humanLabel`,
inside the same `CabinetBox`. The control's own label row keeps its `DualLabel` (lore over human) and
the Task 12 "?".

The span takes DualLabel's human-line face: `--font-mono`, `--font-size-label`, the fixed white. The
selected-option colour opt-in moved onto it from `.sc-dual-label__human`. DualLabel's compact fallback
(`@container sc-control (max-width: 120px)`) is carried over for it. `DualLabel.css`'s comment no
longer lists the two other opt-in places, NavCabinetRow and NavTreeNode, which went with the tree in
Task 9.

**Open for Crawford: option lore names now show nowhere.** The help popover shows the *control's*
lore name, which is what the approved sketch's popovers draw. An option's own lore is no longer
rendered anywhere:
- the waveforms' Sway / Sweep / Kinetic / Binary / Burst;
- Monitor Mode's Freeform / Standby / Featured / Elevated;
- Decay Mode's Dissipation.

The copy stays in `src/content`, so listing it in the popover later would be additive. The plan's
"which is where the lore names go" could be read either way.

**Edge case found in Chrome: long company names.** A company name is user-typed, up to 128
characters. With a 128-character name:
- **Old two-line face:** the name wrapped to four lines, 80 px of text in a 44 px box.
- **One line with no cap:** at 375 px it ran 627 px past its control and scrolled the page sideways.

**Fix:** every link is capped at 100% of its container: the item, its cabinet box, and the front
face. The front face also uses `border-box`, so its 14 px side padding counts inside the cap. The
label ends in an ellipsis. The radio's accessible name (`aria-label`) stays the full name.

An ablation in Chrome at 375 px removed one link at a time. Without any one of the four, the option
ran 14–627 px past the control and the page scrolled sideways. A fifth rule, `min-width: 0` on the
label, changed nothing: `overflow: hidden` already zeroes a flex item's automatic minimum. It was
deleted.

**Row height.** The front face was already a fixed `height: var(--cabinet-box-height)`, so the old
two-line face never changed the row's height either. The tier tests are regression guards that pass
before and after. Each pins the tier height with the 44 px touch floor and a non-`autoHeight` box.
Measured in Chrome: 48 px at 1280, 44 px at 375 and 320.

**Tests:**
- New `RadioButton.face.test.tsx`, with the real CabinetBox: the face, the label row with its lore
  and the one "?", and the row height at all three tiers.
- New `RadioButton.css.test.ts`: the label face, the selected colour, the compact fallback, no rule
  into an option's DualLabel, no front-height override, and the width-cap chain.
- `RadioButton.test.tsx`: one face assertion changed. The vocabulary test now expects the option lore
  "Dissipation" to be absent. Every behaviour test is unmodified.
- No consumer test needed a change.

**Verified:**
- Full suite: 316 files / 8592 tests.
- `build:types` clean; lint at the known 25 / 4.

**Mutation check:** 20, all killed:
- the face reverting to a two-line or human-only DualLabel, preferring the lore, or appending it;
- the label row losing its help or its lore;
- `autoHeight`, or a fixed desktop height at every tier;
- the CSS: wrap, colour, size, the selected selector, the compact fallback, a front `height: auto`,
  each cap link, `border-box`, the ellipsis and the overflow.

**Follow-up, option lore back on the face (Crawford, 2026-10-10, after Task 18; spec §1.4 amended).**
This closes the open question above. Asked where the lore should go, he chose the two-line face over
"one line, lore after" and over listing it in the help popover. `RadioButton` draws
`.sc-radio-button__face`: a `.sc-radio-button__lore` line in DualLabel's lore face, then the label.
It is not a DualLabel, so each line keeps the nowrap / ellipsis cap and no "?" can land in an option.
- An option without lore (company names, Off) stays one line, and an empty `loreLabel` counts as none.
- The accessible name is still the human label alone.
- `LfoLink` builds its lane options without lore, so its compact lane row is unchanged.

Measured in Chrome at 1280, 375 and 320 px, on Fleet Params (LFO Bank, Output) and a robot (Source,
Levels):
- every lore face is 40 px tall inside 48 px (desk) or 44 px (phone) fronts;
- no line is cut, and there is no sideways scroll.

Options are wider now, so rows wrap sooner: at 375 px Monitor Mode is three options and one.

Mutation check: 8, all killed. The mutants: lore dropped; lore after the label; the lore span always
rendered; lore in the accessible name; the face as a DualLabel; the lore wrapping; the face not a
column; the lore missing from the compact fallback.

## Task 14: `LfoLink` compact

**Description:** `LfoLink.tsx` composes the single-line lane `RadioButton` (options from `ui.lfoLane`;
on the desk shell "Off · Core LFO (A) · Companion LFO (B) · …" via `laneTitle`, on the phone "Off · A ·
B · C · D") and a short depth `VoxelTrack` (8 boxes) in one row, replacing the five-box two-line picker
plus full slider. `LfoLinkValue` and `onChange` are unchanged.

**Acceptance criteria:**
- [ ] Desk shell shows the full lane names, phone shell the letters (`useShell` mocked both ways).
- [ ] Picking a lane and dragging depth produce the same `LfoLinkValue` transitions
      `LfoLink.test.tsx` asserts today (behaviour tests pass unmodified).
- [ ] The row's height is one cabinet row (CSS test).

**Verification:**
- [ ] `npx vitest run src/components/ui/controls/LfoLink.test.tsx src/components/ui/controls/LfoLink.css.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Tasks 2, 10, 13.

**Files:** `src/components/ui/controls/LfoLink.tsx`, `LfoLink.css`, `LfoLink.test.tsx`, `LfoLink.css.test.ts`

**Estimated scope:** S (one composition)

**As built (2026-10-10):**

**Crawford's two calls.** Asked before any code, now in spec §1.4:
- **"App sizes, wrap".** At tier sizes with the 44 px floor, the sketch's one-row link doesn't fit. The
  phone needs ~221 px of lanes plus a 312 px strip in a 343 px pane; the desk needs ~622 + 468 px. The
  lane row and the strip share a line where both fit, and the strip wraps under the lanes where they
  do not.
- **"Keep Lane + Depth rows".** Both label rows and both "?"s stay, so no new content is needed.

**Lane names.** The sketch's link row reads `name (letter)` / `letter` ("Core LFO (A)" / "A"). That is
not `laneTitle`'s "Core LFO (LFO A)" / "LFO A", which is the LFO Bank's tab title, so "via `laneTitle`"
above was loose. New pieces:
- `ContentOption.short?`, never spread by `options()` / `optionsRecord()`;
- letters `A`–`D` on `ui.lfoLane`'s options;
- one template key, `ui.lfoLane.linkName` (`'{lane} ({short})'`).

`LfoLink` builds the option lists once per shell at module level and keys the lane schema on the shell.
Each option's text is also its accessible name: "A" on the phone, inside the group named "Lane".

**Consequences for existing tests:**
- **"Behaviour tests pass unmodified" could not hold as written.** The visible names changed, so
  `LfoLink.test.tsx`'s radio queries were renamed to the desk forms under a mocked desk `useShell`.
  Every asserted value transition is unchanged.
- **The same rename landed in two consumer tests**, `SignatureArrayDrawer.test.tsx` and
  `AudioRigEffectPanel.test.tsx` (8 failing tests). Both now pin `useShell` to desk.
  `AudioRigEffectPanel`'s crude `matchMedia` stub answered the shell's query with its own `tablet`
  flag, which would have flipped the names from test to test.

**The strip: at most 8 boxes, not a fixed 8.** A fixed count was built first, as a SliderLinear
`boxCount` prop. In Chrome at 320 px it ran 40 px past the 288 px pane and scrolled the page sideways:
8 boxes at 32 px need 328 px. It was reverted. SliderLinear already fits its box count to its own
width. So `LfoLink` sets `--lfo-link-depth-length` (an 8-box track plus the trailing reserve at the
tier's sizes) on the row, and the slider takes it as its `flex-basis`. It is 8 boxes wherever there is
room and 7 in the 288 px pane. SliderLinear is unchanged.

**The tier switch is gone.** `useResponsivePanelOrientation`, `data-orientation`, and the old row/column
tests and CSS rules were removed; the wrap replaces them.

**CSS, ablated in Chrome.** Each declaration was removed one at a time at 1280 and 320 px. Three are
load-bearing:
- the lane radio's `container-type: normal`: with containment the radio collapsed to 0 px;
- its `width: auto`: at full width the strip never shared a line;
- the strip's `flex-basis`: without it the strip collapsed to 0 px and a 320 px page scrolled 79 px.

Four were dead and deleted:
- the row's `align-items: flex-start`;
- the radio's `max-width: 100%` (a flex item already shrinks to its line);
- the radio's `flex: 0 1 auto` (the default);
- the strip's `min-width: 0` (its own containment already leaves no content minimum).

**Measured in Chrome:**
- **1280 px:** 8 boxes at 48 px. A 1,000 px container wraps (lanes 633 + strip 484); a 600 px one wraps
  and the lane options take two lines; full width shares one line.
- **375 px:** letters, 8 boxes at 32 px under the lanes.
- **320 px:** 7 boxes filling 288 px.
- No sideways scroll anywhere.

**Tests:**
- `LfoLink.test.tsx`, new: names by shell both ways, a live shell flip that keeps the selection without
  `onChange`, a phone pick, phone `heldOff`, the two label rows each with one "?", the row structure,
  no `data-orientation`, the length variable at all three tiers, 8 boxes at that length, and 7 at
  288 px.
- `LfoLink.css.test.ts`: rewritten for the wrap.
- `index.test.ts`: `short` never spread.

**Verified:**
- Full suite: 316 files / 8602 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.

**Mutation check:** 21, all killed:
- shells swapped; the phone showing full names; the desk dropping the letter;
- the memo ignoring the shell; options fixed to the desk set;
- 7 boxes; the length one box short, without the reserve, or at a fixed desktop size;
- the row class dropped; the variable misnamed;
- the content letter or template changed; `options()` spreading `short`;
- each CSS declaration, plus a tier rule brought back.

## Task 15: `FleetParamsScreen` — intro + section tabs over the five groups

**Description:** New `src/components/panels/screen/screens/FleetParamsScreen.tsx`: one collapsible
intro (`AccordionContainer` + `IntroPanel`, `fleet.root`), then `SectionTabs` over the five
`FleetParamsGroup`s with sub-tabs (LFO Bank: the four lanes titled by `laneTitle`; EQ & Filters: EQ /
HPF / LPF; Time & Space: Reverb / Delay; Output: Compressor / Limiter). Panels are the existing
`AudioRigEffectPanel`, `LfoBankLanePanel` and the pacing controls from `FleetParamsContent`. Adds
`fleetParamsSection: FleetParamsGroup` and `fleetParamsSubsection: SelectedFleetParamsEffect | null` to
`uiStore` (with actions and tests). `ConsolePanel` routes `audioRig` here; `FleetParamsContent` is
deleted.

**Acceptance criteria:**
- [ ] The default section is LFO Bank with lane A's sub-tab; only that panel is in the DOM.
- [ ] Each sub-tab renders its existing panel; every `AudioRigEffectPanel` / `LfoBankLanePanel` test
      passes unmodified.
- [ ] `fleetParamsSection` / `fleetParamsSubsection` round-trip through the store and the breadcrumb
      shows `Root / Fleet Params / <group> / <lane>`.
- [ ] No `accordionSync` / `sectionRefs` / `viewFade` import remains in the screen.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/stores/uiStore.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server — Fleet Params shows tabs, one section at a time, lane titles with letters.

**Dependencies:** Tasks 11, 12, 13, 14.

**Files:** `src/components/panels/screen/screens/FleetParamsScreen.tsx`, `.css`, `.test.tsx`,
`src/stores/uiStore.ts`, `uiStore.test.ts`, `src/components/panels/screen/console/ConsolePanel.tsx`;
delete `src/components/panels/screen/nav/content/FleetParamsContent.tsx` + css + test

**Estimated scope:** M (one screen, two store fields, one deletion)

**As built (2026-10-10):**

**Store.** `fleetParamsSection` (default `DEFAULT_FLEET_PARAMS_SECTION = 'lfoBank'`, exported from
uiStore) and `fleetParamsSubsection`, where null reads as the section's first sub-tab.
`setFleetParamsSection` also resets the sub-tab, since a sub-tab belongs to its section (as
`selectRobot` resets a robot's section).

**One table, two readers.** navActions gains `FLEET_PARAMS_SUBSECTIONS`: each section's sub-tabs in
the sketch's order, each named from the entry its panel's heading uses. Pacing has none. It also
gains `activeFleetParamsSubsection(section, stored)`: the stored sub-tab if it is this section's,
else the first, and none on Pacing. The screen and the breadcrumb both read these, so they always
name the same tab. `FLEET_PARAMS_EFFECT_GROUP` lost its only consumer, the breadcrumb, and is
deleted.

**The breadcrumb** reads the new fields: `Root / Fleet Params / <section> / <sub-tab>`.
- The sub-tab is named by its entry: "Core LFO", not the tab's "Core LFO (LFO A)". The trail stays
  pure and does not depend on the shell.
- Fleet Params always has a tab open, so the bare `Root / Fleet Params` state is gone. Pacing reads
  `Root / Fleet Params / Pacing`.
- The section segment is a button (to its first sub-tab) whenever a sub-tab follows it, per Task 8's
  "every ancestor is a button".

Files beyond the list: `navActions.ts` / `.test.ts`, `NavBreadcrumb.tsx` / `.test.tsx`,
`PhoneBar.test.tsx`. Their Fleet Params trail tests now set the new fields instead of
`selectedFleetParamsEffect`, which nothing reads any more. It goes in Task 18.

**My call: every nav pick returns Fleet Params to LFO Bank / lane A.** `cleanSlate` resets the tab
along with every other section field (Task 3's rule), as `selectRobot` resets a robot's section.
- Leaving Fleet Params and coming back lands on the default tab. The breadcrumb's "Fleet Params"
  segment goes there too.
- A section pick resets the sub-tab: LFO Bank / lane C → Output → LFO Bank opens lane A.

Remembering the tab instead would be a one-line change in `cleanSlate`. Remembering it per section
would need a store field the spec does not have.

**SectionTabs** gains `label?: string` on an item (Task 11's open note): text that replaces the
entry's name on the trigger and in its accessible name. The lane sub-tabs pass
`laneTitle(lane, shell)`.

**The screen** (`screens/FleetParamsScreen.tsx`):
- **Intro:** one `AccordionContainer` + `IntroPanel` (`fleet.root`, spectral, the nav box's colour).
  It opens collapsed, as the approved sketch draws it.
- **Tabs:** `SectionTabs` over the five sections (tablist "Fleet Params"). The sub row is named after
  its section, with its triggers in that section's trait.
- **Colour:** each section's panel sits in its group's trait, the colour the group accordions gave the
  panels inside them: Pacing composition, LFO Bank and Time & Space timeSpace, EQ & Filters spectral,
  Output output.
- **Pacing** keeps its two rows of two and has no sub-tabs. `PacingPanel` subscribes to its three
  values itself. The old screen subscribed at its root, so a tempo change re-rendered all of Fleet
  Params; now it re-renders nothing unless Pacing is open. A Profiler test pins this both ways.
  Module-level setters keep the memo'd sliders' `onChange` stable.
- **Re-renders:** the item lists are built once per shell at load, so SectionTabs' memo holds. Only
  `SubTabs` reads the stored sub-tab and the shell.
- **Layout:** the per-leaf anchor `div`s are gone, so the param rows are now the DirectionalPanels'
  direct children, which is what the row CSS targets.

**Removed:** FleetParamsContent's three files. Grep gate: ConsolePanel.tsx was the only importer. The
gate is a test in the screen's file, as Task 9's is. Comments in `AudioRigDrawer.tsx` / `.test.tsx`
and `SignatureArrayDrawer.tsx` that named it as the current renderer now name the screen. That is the
only change to AudioRigDrawer.test.tsx: a comment, not a test. ConsolePanel.test.tsx's mock moved to
the screen.

**For Crawford:**
- **A miss on the phone: the breadcrumb no longer fits the bar's well.** Measured in Chrome:
  - **320 px (202 px well):** every trail with a sub-tab overflows. The default needs 242 px, and
    `EQ & Filters / High-Pass Filter` about 286 px. The well's ellipsis cuts the *current* segment:
    "ROOT / FLEET PARAMS / LFO BANK / …".
  - **375 px (257 px well):** Companion LFO, High-Pass, Low-Pass and 3-Band EQ overflow, the last by
    8 px.
  - **Desk and 700 px:** every trail fits.

  Before this task the three-segment trail fit at 320. Options:
  - (a) on the bar only, the ancestors shrink and ellipsize first, and the current segment never does
    (CSS in NavBreadcrumb);
  - (b) drop the sub-tab from the phone trail (the sketch's phone crumb is `Root / Fleet Params /
    <group>`);
  - (c) leave it.

  Recommend (a). Not built: it changes Task 8's breadcrumb, which is your call.

  **Decided (Crawford, 2026-10-10):** neither (a), (b) nor (c) as written. "Remove the word root on
  mobile, and if it happens a little still so be it." The bar's crumb drops `Root`; the desk well
  keeps it. Spec §1.2 amended. Built as a follow-up to Task 18 (see there).
- **Group intros no longer render** (spec §1.3: one intro per screen). The intro copy of `fleet.pacing`
  … `fleet.output` stays in `src/content`, unrendered, like the option lore in Task 13.
  **Decided 2026-10-10:** they are back, every intro as an expander. See the follow-up under Task 18.
- **Lane panel headings are unchanged.** Spec §1.4 has the lane *panels* reading "Core LFO (LFO A)"
  too. LfoBankLanePanel's heading still reads "Core LFO", so it repeats the sub-tab. Its tests had to
  pass unmodified, and two of them read that heading.

**Measured in Chrome** (power on → Fleet Params → every section and sub-tab, at 1280, 700, 375 and
320 px):
- **1280:** intro at 193–286, the section row at 298, the sub row at 367. Pacing's rows are two-up:
  Tempo 163–677 beside Automation Rate 685–1198.
- **Every width:** no sideways scroll on any tab (at 1280 the scroller is 1071 / 1071 and the document
  1280 / 1280); no console errors.
- **Phone widths:** the section row scrolls inside itself (464 px of tabs in 303 / 248 px), as Task 11
  built it. The lanes read LFO A–D.

**Verified:**
- Full suite: 316 files / 8653 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.

**Mutation check:** 31, all killed:
- **SectionTabs:** the label override ignored.
- **Store:** a section pick keeping its sub-tab; the default or the initial state changed.
- **Clean slate:** `cleanSlate` keeping the tab.
- **Resolver:** no membership check, or no first-tab fallback.
- **Breadcrumb trail:** the sub-tab dropped; the section without a `go`, or Pacing with one.
- **The table:** an order swap, a wrong entry, a missing sub-tab.
- **Breadcrumb component:** not subscribing to the sub-tab.
- **Re-renders:** the screen root subscribing to tempo; Pacing not subscribing.
- **Labels and colour:** the shell ignored; the lane label dropped; a fixed sub-tab or panel trait.
- **Intro:** open by default; a group intro brought back.
- **Writes:** a section or sub-tab pick never reaching the store; tempo writing the wrong setter.
- **Pacing layout:** the drawer out of its row; Pacing growing a sub-tab row.
- **Routing:** ConsolePanel routing nowhere.
- **Source scan and gate:** the screen importing `accordionSync`; a test mocking the deleted module; a
  deleted file restored.

## Task 16: `RobotScreen` — avatar column + section tabs; phone small band

**Description:** New `src/components/panels/screen/screens/RobotScreen.tsx` from `RobotOptionsTab` +
`RobotDisplaySection`: the fixed avatar column (`--avatar-column-width`: the gem in the avatar render
context, name, the read-only meta as wells in two columns, battery `VoxelTrack` read-only, the company
`RadioButton` from `buildCompanyAssignmentSchema`) beside the controls column with `SectionTabs` over
`ROBOT_SECTIONS_CONFIG` and its subsections. On the phone shell the column becomes a sticky band in the
small form (72 × 58 gem, name, one status line) above the tabs; voxel rows run edge to edge. `ConsolePanel`
routes `robots` here when `selectedRobotId` is set (the list stays `RobotsTab` until Task 21).
`RobotOptionsTab`, `RobotSectionAccordionStack` and `RobotDisplaySection`'s accordion wrapper are deleted
(`AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` are kept).

**Acceptance criteria:**
- [ ] The default section is Source with Core Oscillator's sub-tab; only that panel is in the DOM.
- [ ] Every section's edit reaches the robot as before (the `RobotOptionsTab` behaviour tests move to
      `RobotScreen.test.tsx` and pass).
- [ ] The company radio in the column calls `assignRobotToCompany` (the `RobotDisplaySection` test
      moves and passes).
- [ ] Phone shell: the band is present, sticky, small (CSS test: 72 px gem); no expanded form exists.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server — pick a robot; desk column + tabs; phone band + tabs.

**Dependencies:** Tasks 11, 12, 13, 14.

**Files:** `src/components/panels/screen/screens/RobotScreen.tsx`, `.css`, `.test.tsx`,
`src/components/panels/screen/console/ConsolePanel.tsx`; delete `RobotOptionsTab.tsx`,
`RobotSectionAccordionStack.tsx`, `RobotDisplaySection.tsx` (+ css/tests)

**Estimated scope:** M (one screen from two, three deletions)

**As built (2026-10-10):**

**`RobotSectionAccordionStack` is not deleted.** The grep gate failed: `CompanyOptionsSection` still
renders through it, for the company screen and All Probes, until Task 23. It retires with that last
consumer, by the plan's own "retire with their last consumer" rule. RobotDisplaySection had no
accordion wrapper to remove, so the whole file went (its content is the avatar column now).
RobotOptionsTab went too. Grep gate: their only importers were `ProbesContent.tsx` and their own
tests; the gate is a test in the screen's file.

**One table, two readers** (as Task 15's). `robotSubsectionConfig.ts` gains:
- `DEFAULT_ROBOT_SECTION = 'source'`;
- `sectionTabContent` (a tab is named after the panel it shows, as its accordion was: "Levels", not
  the tree's old "Dynamics" row);
- `sectionSubTabs` (a sub row only where a section has two or more panels, so only Source; the
  merged Pitches is inside Composition's panel and gets no tab);
- `activeRobotSection` / `activeRobotSubsection` (null or a stale value resolves to the first).

The screen and the breadcrumb both read these.

**The sketch draws Rhythm / Pitches sub-tabs under Composition. Not built.** The code merged them
into one panel (`mergedInto`, docs/reference/layout-updates.md), and §1.3 keeps the section components
as they are. A "Pitches" tab would show the same panel again.

**The breadcrumb** (files beyond the list: `navActions.ts` / `.test.ts`, `NavBreadcrumb.test.tsx`):
- A robot's trail always names its open tab: `Root / Probes / Tidal Wisp / Source` by default, as the
  desk sketch draws it. So Task 3's `['Root', 'Probes', '<robot name>']` for "no section" is gone; with
  tabs there is no such state.
- The robot is now always an ancestor (a button).
- Sections are named by their tab, so Levels reads "Levels" everywhere, All Probes included.
- All Probes and a company keep naming only a stored section: their stacked screens have no tabs until
  Task 23.
- No sub-tab segment (spec §1.2's `<entity> / <section>`).

**Routing:** `ProbesContent` renders RobotScreen for a selected robot, in place of RobotOptionsTab.
It is the component ConsolePanel routes Probes to, so ConsolePanel is unchanged until Task 21.

**The screen** (`screens/RobotScreen.tsx`):
- **Tabs:** SectionTabs over `ROBOT_SECTIONS_CONFIG`. The tablist is named after the robot, falling
  back to its id. Each section's panel sits in its trait, as its accordion was. A section pick clears
  the sub-tab: Source / Accent → Envelope → Source opens Core again (Task 15's rule). Picking another
  robot opens its default tab (`selectRobot` already reset the section).
- **No intros and no accordion** (spec §1.3; the sketch's robot frame has none). The four section
  intros still render on the company and All Probes screens until Task 23.
- **Wiring:** each panel's value and handler logic moved verbatim from RobotOptionsTab into
  `useRobotSubsectionRenderer`. That includes the swell cancels, the `latestRobot` ref and the per-field
  memos. One thing was dropped: PingControlsCompositionSection's `noteVarianceAnchorId`, a sectionRefs
  scroll anchor for the tree's Pitches row.
- **Desk column:** the gem (avatar render context), the name as a heading, the four meta values (job,
  docking, phase, emission) as wells in two columns with their lore captions, the battery readout and
  the company radio.
- **Phone band:** the gem at 72 × 58, the name, and one status line from a new template,
  `probe.band.statusLine`: "job · docking · phase · emission · battery%". There are no wells, battery
  readout or company radio on the phone; reassignment there is the roster's Move sheet (Task 22).

**Found in Chrome:**
- **The band showed the controls through the scroller's padding.** A sticky box sticks inside its
  scroller's padding, so at `top: 0` the controls scrolled through the 16 px strip above it. It now
  sticks at `calc(-1 * var(--spacing-lg))`. A test ties that to ConsolePanel's padding.
- **The status line wraps instead of ending in an ellipsis.** At 320 px "Structural Inspection · Active ·
  Working · Emitting · 82%" is 244 px in 164, and the ellipsis cut off the emission and the battery.
- **The desk gem now yields first.** It is 300 px tall but shrinks to 120 px before the column scrolls.
  At 1280 × 800 the column needed 801 px in 494; now it needs 537.
- **The column is `min(400px, 40%)`, not a fixed 400 px** (`--avatar-column-width: 400px`, spec §4).
  With Probes' list open (the nav panel is 260 px) a fixed 400 px left the controls under a three-box
  slider's width below about 1100 px.

**Measured** (power on → Probes → a robot → every tab):

| Size | Column | Controls | Notes |
|---|---|---|---|
| 1280 × 800 | 360 px | 523 px | the outer scroller does not scroll; each column scrolls on its own; the company radio is 41 px below the column's fold |
| 1024 × 768 | 242 px | 365 px | |
| 800 × 700 | 153 px | 220 px | the section tab row scrolls (350 px in 212) |
| 375 / 320 | band | full width | after a 400 px scroll the band sits at the scroller's edge (143) |

No document overflow and no console errors at any size.

**For Crawford:**
- **Narrow desk widths, a design gap.** The sketch draws 1600 and 375 px only. From 768 to about
  1000 px, with Probes' list open, the split leaves 153–242 px for the column and 220–365 px for the
  controls: usable at 1024, poor at 800. Options:
  - (a) below a content width, a container query stacks the column above the controls;
  - (b) below a content width, use the band (small form);
  - (c) leave it.

  Not decided here.

  **Decided (Crawford, 2026-10-10): (c), leave it.** "I don't love it, and feel like the area to the
  left of the power rocker switch is wasted space, but it is what it is." That top-bar space is a
  candidate for a later layout pass, not this phase.
- **The phone breadcrumb.** `Root / Probes / Drift Warden / Source` is 225 px in the 202 px well at
  320 px. This is the same open question as Task 15's. **Decided 2026-10-10:** Root is dropped on the
  phone (see Task 15).
- **The company radio needs a short scroll** of the column at 1280 × 800.

**Two existing tests changed, both because of the deletion:**
- `standaloneDualLabelHosts.test.ts` read the deleted RobotDisplaySection.css. Its DualLabel-host
  checks now target the avatar column in RobotScreen.css.
- `Robot.test.ts`'s stale-state guard caught a `'docking'` key in the screen's meta table. That is the
  `Robot.docking` field, not the retired state, but the guard can't tell. The key is `dockingState`.

The mutation runs targeted the task's own tests and so never ran these two; the full suite caught
them.

**Comments:** comments elsewhere that name the deleted files as history are left as they are, as in
Task 9 (about 40 files, `src/engine/` and `src/systems/` among them). The config's own header now names
RobotScreen.

**Verified:**
- Full suite: 315 files / 8683 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.

**Mutation check:** 37, all killed:
- **Config helpers:** the default, the sub-tab resolver (membership, stored value), the one-panel
  sub row, the tab name, the merged panel.
- **Breadcrumb:** the default for robots only; the tab name in the crumb.
- **Writes:** section and sub-tab writes; the sub-tab reset.
- **Shell:** the switch; the band's battery.
- **Column:** the well order, Freelance → null, the company schema memo.
- **Re-renders:** the robot and anySolo subscriptions.
- **Colour:** section and sub-tab traits.
- **Wiring:** the dropped anchor, the volume and ADSR swell cancels, the layer index.
- **Fallbacks:** the name and tablist id fallbacks, battery rounding.
- **Routing and gate:** ProbesContent's route; a test mocking a deleted module; a deleted file
  restored.
- **CSS:** sticky, the sticky offset, the 72 px gem, the status-line wrap, the gem's yield, the column
  width.

**Follow-up, the nav widths and an entity pick collapsing the list.** Crawford answered the
narrow-desk question with: "the nav items could be narrower for sure, let's cut the side padding down.
That being said, the inactive state should be about 20px wider", and "let's collapse the nav when a
probe or company is selected." Spec §1.2 is amended.

*Widths.* `--nav-panel-rest` 96 → 116 px, `--nav-panel-wide` 260 → 200 px, and a nav box's face
padding 8 → 4 px a side (`NavBox.css`). The values were trialled in Chrome first:
- **At rest:** every label fits, and "ENVIRONMENT" is no longer cut. "TIMBRE & COLOR" and
  "UNITY & VARIETY" (88 px in 84) still take two lines, as they did at 96; about 124 px would fit
  them.
- **Wide:** the entity boxes are 143 px (Probes, with its scrollbar) and 158 px (Companies). They
  hold the longest robot name (83 px) and "+ New Company"'s 125 px lore line, with nothing wrapped
  or cut.

*Collapse.* `selectEntity` opens its branch with the list collapsed: `open(branch, expand)` gains
the flag, which is false for every entity. That covers a robot, a company and All Probes, whether
picked from the list, the breadcrumb or the world.
- **All Probes is included** although Crawford said "a probe or company". Its screen (the company
  screen's All form, Task 23) needs the same room. This is my reading; flagged.
- **The parent box still goes back to the branch's page with the list open,** so "back, then
  collapse" holds.
- **`expandNavAncestorsForId` is deleted** from `useAccordionOpenState.ts`: the Task 9 open
  question. Every accordion CompanyOptionsSection opened, on the company and All Probes screens until
  Task 23, wrote `expandedTopLevelBranch` and would have reopened the list just collapsed. The hook
  now never writes the nav.

*Tests changed:* `navActions`, `NavPanel`, `NavEntityList`, `Robot` (the world click) and
`useAccordionOpenState` now expect the list collapsed after a pick. The last of these no longer
expects the nav written when an accordion opens. New: the list page → pick → box → list-open cycle
for each entity, and the CSS contract for the three sizes.

*Measured in Chrome, on a robot with the list collapsed* (the "before" is Task 16 with the 260 px
list open):

| Size | Column | Controls | Before |
|---|---|---|---|
| 1280 × 800 | 400 px (the sketch's full width) | 627 px | 360 / 523 |
| 1024 × 768 | 315 px | 456 px | 242 / 365 |
| 800 × 700 | 225 px | 322 px | 153 / 220 |

No document overflow and no console errors. The company radio still needs a short column scroll at
these heights.

*Verified:* the full suite ran 8688 of 8689 green. The one failure was
`sceneToOrbiterLocal.test.tsx`, "Test timed out in 5000ms" (5.6 s). That is the load-sensitive
timeout recorded at Task 6; the test is in `src/animation/`, which this change does not touch, and
it passed in both earlier full runs today (4.4–4.7 s). Not chased. `build:types` clean; lint at the
known 25 / 4; `npm run build` clean.

*Mutation check:* 9, all killed:
- each of the three entity picks keeping the list open;
- the parent box never expanding;
- an accordion's `setOpen` and `openExclusive` writing the nav again;
- each of the three CSS values put back.

**Follow-up 2, Crawford's look at 1024 × 680.** Spec §1.2 and §1.4 are amended.
- **a2) "let's try 124px so timbre & color etc make it to one line."** Rest is 116 → 124 px. Measured
  in Chrome, no label wraps or is cut at rest, in either list, or on a robot.
- **2) "the robot detail page at 1024 needs to reserve more space for the right column with the
  attributes".** Before, the controls had 451 px, so the side-by-side rows got 196 px a half (about a
  three-box slider).
  - The desk grid's first column is now `clamp(--avatar-column-min 200px, 100% −
    --controls-column-reserve 560px − gap, --avatar-column-width 400px)`.
  - The reserve of 560 was picked from a Chrome trial against 520. At 1024, 520 gave a 243 px column,
    520 px controls and 231 px halves; 560 gives 203 / 560 / 251.
  - At 560 the four meta wells shrank to 90 px. So they now flow two to a row where two 120 px wells
    fit and one to a row where they don't: `repeat(auto-fit, minmax(max(120px, (100% − gap) / 2), 1fr))`.
    The `max()` term caps a row at two; without it, the 400 px column packed three to a row.
  - The column also gets 8 px of right padding: its own scrollbar sat on the right-hand wells, the same
    collision Crawford found in the nav.
- **3) "the nav container needs more padding on the right so the boxes don't collide with the scroll
  bar".** A popped face sat 4 px from the list's scrollbar. While a list is open
  (`.nav-panel:has(.nav-entity-list)`), the plate keeps 16 px on the right, so the boxes clear the
  scrollbar by 12 px. At rest there is no scrollbar, and the plate keeps its 8 px, which the 124 px
  one-line labels are sized against.
- **The list stayed open on a robot in Crawford's screenshot.** The cause was the Probes page's robot
  cards: `RobotSelectionCard` called `uiStore.selectRobot` directly, outside navActions. The Companies
  page's company radio did the same with `selectCompany`. Both now call `selectEntity`, so they collapse
  the list like every other pick. Checked in Chrome: a card click at 1024 opens the robot at the 124 px
  rest width.

*Measured in Chrome (committed CSS, robot on Envelope):*

| Size | Column | Controls | Halves | Wells |
|---|---|---|---|---|
| 1024 × 680 | 203 px | 560 px | 251 px | one to a row, 180 px |
| 1100 × 700 | 279 px | 560 px | 251 px | two to a row, 124 px |
| 1280 × 800 | 400 px | 619 px | 288 px | two to a row, 185 px |

At 800 px the rows already stack (the tablet tier). No document overflow and no console errors.

*Verified:*
- Full suite: 315 files / 8696 tests.
- `build:types` clean; `npm run build` clean.
- Lint at the known 25 / 4, after fixing one `import/order` error this change added in
  `CompaniesContent.tsx`.

*Mutation check:* 11, all killed:
- the card and the company radio selecting without navActions;
- rest 116;
- the list-open padding lost, or applied at rest too;
- the reserve and the minimum changed;
- the split back to 40%;
- the column's scrollbar clearance lost;
- the wells fixed at two, or uncapped.

## Task 17: `SettingsScreen` — section tabs over the three leaves

**Description:** New `src/components/panels/screen/screens/SettingsScreen.tsx`: `SectionTabs` over
`SettingsLeaf` with the content layer's titles (Audio Quality → `AudioLoadPanel`, Seeds →
`SectorSettingsDrawer`, Save & Share → `SessionsPanel`), one intro. `selectedSettingsLeaf` is the tab;
`selectedSettingsSubsection` is retired (its only reader was the tree). `SettingsContent` is deleted.

**Acceptance criteria:**
- [ ] The three tabs render the three existing panels; each panel's own tests pass unmodified.
- [ ] `selectedSettingsSubsection` is gone from `uiStore` and no file reads it.
- [ ] The limits readout inside Audio Quality is a well, not a cabinet (CSS test).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/SettingsScreen.test.tsx src/stores/uiStore.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 11.

**Files:** `src/components/panels/screen/screens/SettingsScreen.tsx`, `.css`, `.test.tsx`,
`src/stores/uiStore.ts`, `ConsolePanel.tsx`; delete `SettingsContent.tsx` + css + test

**Estimated scope:** S (one screen, one deletion)

**As built (2026-10-10):**

**One table, two readers.** navActions gains:
- `SETTINGS_LEAVES`, the tab order;
- `DEFAULT_SETTINGS_LEAF` (`'quality'`, the first);
- `activeSettingsLeaf(stored)`: the stored leaf if it is a tab, else Audio Quality.

The check matters because SectionTabs falls back to its first item for a value it doesn't know, so
the breadcrumb must not name a tab the screen isn't showing. The screen and the breadcrumb both read
these, as Task 15's Fleet Params pair do. There is now one leaf order in `src/`. useNavTree's copy
went in Task 9 and SettingsContent's now, which settles DUPLICATE_VALUE_AUDIT item 6 by
construction. The audit doc is not checked off here; its rule is "once merged".

**The breadcrumb always names the open tab:** `Root / Settings / Audio Quality` when nothing is stored.
The bare `Root / Settings` is gone. Users see no change, because the old screen's scrollspy wrote
`selectedSettingsLeaf` on mount (Task 8's note). `cleanSlate` still stores null, so every nav pick
lands Settings on Audio Quality, the same call as Task 15's for Fleet Params. Task 3's "names the
branch alone" breadcrumb test lost its Settings line. A new test pins the default instead.

**Store.** `selectedSettingsSubsection`, its setter and the `SettingsSubsection` type are gone. Their
only readers were SettingsContent's scrollspy and `cleanSlate`, plus the navActions test fixtures.

**The screen** (`screens/SettingsScreen.tsx`):
- one `settings.root` intro, collapsed, as Fleet Params' is;
- `SectionTabs` (tablist "Settings") over the three leaves, every trigger in the seed trait (the
  Settings nav box's);
- the open panel in a seed-trait wrapper, the colour the old accordions gave it;
- the panels themselves unchanged.

The screen subscribes to `selectedSettingsLeaf` alone. A Profiler test shows the lighting tick
(`activeLocaleLocalTime`, about once a second) and a Fleet Params tab change do not re-render it.

**The limits readout is a well:**
- `AudioLoadPanel.css` gives it the shared well tokens, the accent edge and glow, fixed white mono
  text;
- `align-self: flex-start`, found in Chrome: on the desk the preset row stretched it to the radio's
  height, a 94 px well with one line at the top (it was invisible as plain text);
- now 32 px tall at the top of its cell, content-width and left-aligned under the radio on the phone
  (the sketch's `.limits`);
- a DOM test checks that its nearest cabinet is the Audio Load panel's own facade (panels keep it,
  spec §1.1) and that it is no cabinet of its own.

The CSS test lives in the screen's file, so AudioLoadPanel's tests stay unmodified.

**Tests:**
- `SettingsScreen.test.tsx` (37), with the three panels stubbed.
- `SettingsScreen.panels.test.tsx` (5), with the real panels in their tabs. It replaces the chain
  `SettingsSubsections.integration.test.tsx` exercised and adds SessionsPanel. A limit edit survives
  a trip to another tab.
- uiStore +2 (the third leaf, the retired field).
- navActions: fixtures lose the subsection, plus 12 new cases.
- ConsolePanel's mock moved to the screen.

`AudioLoadPanel`, `SectorSettingsDrawer` and `SessionsPanel`'s own test files are untouched.

**Removed:** SettingsContent's three files and `SettingsSubsections.integration.test.tsx`. Grep gate:
the only importers and readers were those files and ConsolePanel.tsx. The gate is a test in the
screen's file, which also checks that no non-test file names `SettingsSubsection`. One comment
changed: `AudioLoadPanel.tsx`'s docblock named SettingsContent as its renderer and now names the
screen. Comments naming it as history were left, as Task 9 did (`Header.tsx` / `.test.tsx`,
`AudioRigDrawer.test.tsx`, `intersectionObserverStub.ts`, `content/copy/settings.ts`).

**Measured in Chrome**, every tab at 1280, 1024, 700, 375 and 320 px, no console errors:

| Width | Tab row (scroll / client) | Readout | Document overflow |
|---|---|---|---|
| 1280 | 1035 / 1035 | 686–1198 × 428–460 | none |
| 1024 | 779 / 779 | 558–942 × 428–460 | none |
| 700 | 628 / 628 | 50–289 × 522–554 | none |
| 375 | 303 / 303 (304 on Save & Share) | 50–289 × 488–520 | none |
| 320 | 302 / 248 | 50–270 × 488–538 (two lines) | none |

At 320 px the tab row scrolls sideways and "Save & Share" is half hidden until scrolled. That is
SectionTabs' designed behaviour (Task 11); the sketch's tighter phone tabs are left for the phone
pass. At 375 px the row scrolls 1 px while Save & Share is open: the popped last tab's front face
(Task 11: it moves 4 px right) overhangs the row by a pixel. The crumb reads
`Root / Settings / <tab>` on every tab, in the well on the desk and in the bar on the phone.

**For Crawford:**
- **The leaves' own intros now render nowhere** (`settings.quality` / `.seeds` / `.sessions`), as
  with Task 15's group intros (spec §1.3: one intro per screen). The copy stays in `src/content`.
  Audio Quality's intro was the one place that said to lower the limits if the app stutters. Its two
  sliders' help "?"s now say the same.
- **Inert until Task 18:** `AudioLoadPanel` and `SectorSettingsDrawer` still register `setSectionRef`
  anchors that nothing reads now.

**Verified:**
- Full suite: 315 files / 8730 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.
- The first full run had one failure: `sceneToOrbiterLocal` hit its 5 s timeout. A vite server was
  running at the time (the known load timeout); this task doesn't touch that test, and the second
  full run passed.

**Mutation check:** 31, all killed.
- **The screen:** every panel mounted; two panels swapped; a whole-store or clock subscription; the
  intro open, dropped, or joined by a leaf intro; the wrong trait on tabs or panel; a pick that writes
  nothing; a wrong tablist name; a hard-coded order.
- **navActions:** the order swapped; Seeds misnamed; the wrong default; an unchecked stored value; the
  old "only when stored" crumb; the leaf as a link; `cleanSlate` keeping the tab.
- **The readout CSS:** no background; an outward glow; a drop-shadow filter; no edge; muted text; no
  `align-self` (the RED step).
- **ConsolePanel's route.**
- **uiStore:** the field or the type back.
- **The deletion gate:** a test mocking the deleted module; the stylesheet and the integration test
  restored.

**Follow-up, Save & Share (Crawford, 2026-10-10):** "I thought the save/load session buttons would get
a once over." Spec §1.8's "unchanged inside" had kept `SessionsPanel` as it was. With three saves in
Chrome it fell well short of the approved sketch:
- **Repeated names.** Every row's buttons read "Load Night, all freelance", "Share Session Night, all
  freelance" and "Delete Night, all freelance". The per-row accessible names had been built by cloning
  the schema's `humanLabel`, and `Button` draws its humanLabel as its face.
- **The phone.** On a phone each row wrapped to three lines and the row's own name was cut to "Nig…".
- **Two-line buttons.** Every button was lore over human, and Save and Share stacked under the input.

Two calls asked and answered: the single-line face goes on **Save & Share only** (an opt-in, not
Button-wide; every other button waits for Checkpoint B), and the panel uses **the sketch's copy**.
Spec §1.8 is amended.

**`Button`** gains two opt-in props:
- `face="single"`: the human label alone, in DualLabel's human-line face, the lore left to the label
  rows (as RadioButton's options went in Task 13);
- `accessibleName`: names the button apart from its face. A row's "Load" is named "Load Dusk Run".

Without them Button is unchanged; its existing tests pass as they were.

**Copy:**
- `session.share` is now a row's "Share" (template `Share {session}`, placeholder lore
  `TRANSMIT ARCHIVE [c]`).
- New `session.shareLive` "Share live", the live share, keeping the old `TRANSMIT COORDINATES` lore.
- New `session.saved` (Stored Traces / Saved Sessions).
- `session.clearStorage` is now the label row (Factory Reset / Clear Local Storage), and the new
  `session.clearStorage.action` "Reset to Factory Settings" is the button. That swaps Crawford's
  2026-09-28 pair, as the sketch draws it. The confirm dialog still says "Clear Local Storage".

**Layout:**
- **The save row:** the name (260 px basis), Save Session and Share live, buttons on the input's
  bottom edge. It wraps on the phone.
- **The saved list:** a Saved Sessions label row, shown only when something is saved, over the rows.
- **A row:** title then a Load / Share / Delete actions group (`flex: none`), with a divider under it.
  The title's share went from `flex: 1` (a zero basis) to `flex: 1 1 10rem`, so a narrow row wraps the
  whole group under the title instead of squeezing the name. One pinned CSS assertion changed for it.
- **The reset:** a Factory Reset label row over a full-width reset button.

The time stays beside the name, as POST_SYNC_TOGGLE_LAYOUT_UPDATE §1.6 decided; the sketch puts it by
the buttons. The buttons keep the panel's seed trait; the sketch draws Save Session teal.

**The two confirm dialogs:**
- **Portal into `#screen-viewport`:** they used to go to `<body>`, against the UI Shell guardrail. With
  no screen they open in place, as HelpPopover does (Task 12).
- **Own text colour:** found in Chrome. Inside the screen the title and Cancel inherited a dark colour
  and all but vanished, so the dialog sets `--color-text-primary-fixed` itself.
- **Focus return, pre-existing:** Escape or Cancel left focus on `<body>`. A modal Radix dialog gives
  focus back only to its own `Trigger`, which these have none of, so the opener is recorded on open and
  focused on close.

`CompanyCrudControls`' delete dialog still portals to `<body>`; it is rebuilt in Task 23.

**Tests changed for the new copy:** SessionsPanel's and SessionListItem's queries by name ("Share
Session" → "Share live" / "Share Deep Dive", the opener "Clear Local Storage" → "Reset to Factory
Settings"; the confirm's own "Clear Local Storage" is unchanged), and sessionConfig's label check.
**Added:** Button +7, SessionListItem +11, SessionsPanel +13, sessionConfig +1 (8730 → 8762).

**Measured in Chrome** with four saves, one of them a 60-character name:

| Width | Save row | Rows | Reset | Document overflow |
|---|---|---|---|---|
| 1280 | input 173–995, then Save Session and Share live | one line each, 65 px | 173–1208 | none |
| 700 | one line | one line each | full width | none |
| 375 | input on its own line, Save and Share live under it | title line, then Load / Share / Delete | 32–335 | none |
| 320 | as at 375 | as at 375; the long name ellipsizes at 148 px | 32–280 | none |

The confirm sits inside `#screen-viewport`, and focus goes back to Delete after Escape at 1280 and 375.
No console errors.

**Docs:** SESSION_STORAGE.md still names "Share Session" and "Clear Local Storage" as the buttons; Task
31 rewrites it.

**Verified:**
- Full suite: 315 files / 8762 tests.
- `build:types` clean; lint at the known 25 / 4; `npm run build` clean.

**Mutation check:** 38 killed, 1 survivor removed.
- **Button:** the single face drawing the DualLabel, losing its lore fallback, or showing the accessible
  name; the override ignored; the label wrapping.
- **The row:** the two-line face back; a name without its session or from the wrong template; the old
  name-on-the-face clone; no actions group; the confirm on `<body>`, with or without a screen; focus not
  returned, the opener not recorded, the handler not wired; the CSS (a zero basis, shrinking or
  wrapping actions, no divider, inherited dialog colour).
- **The panel:** Share live reading "Share"; Save and reset on two lines; the Saved label over an empty
  list, missing, or on the reset; no save row; the confirm on `<body>`; focus not returned; the CSS (no
  wrap, no input basis, a narrow reset, label rows without the controls' face, inherited dialog
  colour).
- **Config and content:** the reset reading its label row's text; Share live named like a row's Share.

The survivor was `event.preventDefault()` in the focus return. Radix's own close handler only focuses
a `Trigger`, and there is none, so it changed nothing. It is deleted from both dialogs.

## Task 18: Retire the stacked scroll

**Description:** Delete `useAccordionOpenState.ts`, `useSectionObserver.ts`, `src/utils/accordionSync.ts`,
`src/utils/sectionRefs.ts`, the scroll-fade half of `src/utils/viewFade.ts` (keep anything the Deck
still uses), and `AccordionContainer`'s nav-sync props; strip the `openAccordionFromNav` /
`expandNavAncestorsForId` / `hasPendingNavTargetFor` / `setSectionRef` calls from `CompanyOptionsSection`,
`AudioLoadPanel`, `SectorSettingsDrawer` and `CompaniesContent` (which survives until Task 23 with plain
accordions). Remove `expandedProbeId`, `expandedCompanyId`, `selectedFleetParamsEffect` from `uiStore`.
Grep gate before every deletion.

**Acceptance criteria:**
- [ ] No file under `src/` imports a deleted module or reads a retired field (grep gate in the commit).
- [ ] `AccordionContainer` keeps its controlled open/closed behaviour (its tests pass minus the sync
      cases).
- [ ] `uiStore`'s initial state is the spec §1.10 table exactly (a test asserts the key set).

**Verification:**
- [ ] `npm test` passes (full suite).
- [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.

**Dependencies:** Tasks 15, 16, 17.

**Files:** the deletions above; `src/components/ui/controls/AccordionContainer.tsx`,
`src/components/company/CompanyOptionsSection.tsx`, `src/components/panels/screen/console/AudioLoadPanel.tsx`,
`SectorSettingsDrawer.tsx`, `src/components/panels/screen/nav/content/CompaniesContent.tsx`,
`src/stores/uiStore.ts`

**Estimated scope:** L by file count, S by thought (removal behind grep gates)

**As built (2026-10-10):**

**Deleted (11 files):** `useAccordionOpenState` and `useSectionObserver` (each with its test),
`accordionSync`, `sectionRefs` and `viewFade` (each with its test), and
`testUtils/intersectionObserverStub.ts`. All of `viewFade.ts` went: nothing on the Deck used it.

**The grep gate is a test,** `screens/stackedScrollRetired.test.ts`. It checks that:
- the six modules are gone in every extension;
- nothing under `src/` imports, mocks or dynamically imports one, by path or alias;
- nothing calls one of their 17 functions, so a pasted copy is caught too;
- no file names a retired store field, except `uiStore.test.ts`, which asserts their absence.

Before deletion it found only the modules, their tests and the gate itself.

**Beyond the plan's list:**
- **`AccordionContainer`'s "nav-sync props"** were one call, not props: `notifyAccordionAnimationComplete`
  in the open tween's `onComplete`. It is gone. Its two test cases became one: the height lands on
  `auto` after the open tween.
- **`PingControlsCompositionSection`'s `noteVarianceAnchorId` prop** registered a `sectionRefs` anchor
  for the tree's "Pitches" leaf. The plan's strip list missed it. The prop and its two tests are gone.
  The wrapper `div` stays, so the row lays out as before.
- **`robotSubsectionConfig`'s `subsectionIds` / `accordionIds`** existed to feed the scrollspy and the
  open-state hook; only their own tests used them after this. Both are gone and are in the gate.
- **`CompaniesContent`** had nothing left to strip: the Task 16 follow-up had already moved it onto
  `navActions`.
- **`AudioLoadPanel` / `SectorSettingsDrawer`:** the anchor refs are gone; their wrapper `div`s keep
  their classes.

**`CompanyOptionsSection` until Task 23.** Plain local state, `AccordionState`, replaces the
open-state hook: which accordions are open, and which have ever opened.
- The lazy-mount gate was the scrollspy's "approached". It is now the accordion's **first open**:
  a section's content mounts then and stays mounted after a close, so the close animates it out.
- The state resets per entity (`prefix`) during render, including on a return trip
  (All → a company → All).
- `RobotSectionAccordionStack`'s gate prop is renamed `hasApproached` → `hasOpened`, and its
  `sectionAnchorRef` prop is gone. Both components still retire in Task 23.
- **Behaviour change, interim:** the screen no longer writes `selectedSection` /
  `selectedSubsection`, because the scrollspy did that. The company and All Probes crumbs therefore
  name no section until Task 23's tabs. A test pins that the screen never writes them.

**`uiStore`:** `expandedProbeId`, `expandedCompanyId`, `selectedFleetParamsEffect` and their setters
are gone. `SelectedFleetParamsEffect` stays as `fleetParamsSubsection`'s type. `navActions`'
`cleanSlate` lost its one call.

The key-set test lists §1.10's kept and new fields, plus the six non-nav fields the table does
not mention (`activeView`, `theme`, `language`, `isFullscreen`, `activeLocaleLocalTime`,
`activeLocaleTemperature`). **`movePanelRobotId` is not in it yet; Task 20 adds the field and must
add it to the list.** A second test round-trips the state through JSON with `toStrictEqual`, so an
`undefined` field fails too.

**Tests changed:**
- `CompanyOptionsSection.test.tsx`: "approach a section" became "open its accordion". The two fade
  tests became one no-fade test. A lazy-mount block of six tests was added.
- `RobotSectionAccordionStack.test.tsx`: the anchor test was deleted.
- `AccordionContainer.test.tsx`: as above.
- `PingControlsDrawer.test.tsx`: two anchor tests were deleted.
- `RobotScreen.test.tsx`: the anchor assertion was dropped.
- `uiStore.test.ts`: the four retired-field describes became the retirement and key-set tests.
- `navActions.test.ts`: the fixture field was dropped.
- `robotSubsectionConfig.test.ts`: the id-list tests were deleted.

**Measured in headless Chrome at 1280 × 800,** on a company and on All Probes, with no console errors:
- On mount only Levels' content exists.
- Envelope opens to its full 538 px with its four sliders. Closed, it is 0 px with the sliders still
  mounted.
- Source opens, then Core Oscillator: 945 px, with Companion still unmounted.
- Sampled frame by frame, Composition's open tween runs 469 → 713 → 717 → `auto` 720 px. It was
  aimed at the mounted height: content measured before the mount would have capped it at 269 px.

**Verified:**
- Full suite: 311 files / 8654 tests (from 315 / 8762; the difference is the deleted tests).
- `build:types` clean; lint at the known 25 errors / 4 warnings; `npm run build` clean.

**Mutation check:** 23, all killed:
- **Mounting:** opening never mounts; a close unmounts; the gate reads open instead of opened;
  everything mounted; no reset on an entity switch; a reset that keeps the mounted set; Levels
  open but unmounted; nothing open by default.
- **The stack:** its gate ignored.
- **The store:** a retired field back; an unlisted field; a listed field dropped; a `Date` or an
  `undefined` in state.
- **The gate:** an import, a `vi.mock` and a dynamic import of a deleted module; a retired call
  back; an id list back; a retired field read; a deleted file restored.
- **AccordionContainer:** the height never freed after the tween.

One survived first: the reset that keeps the mounted set. Its ids are prefix-scoped, so it only
shows on a return trip, and the return-trip test was added for it.

**Found, not touched:** `FIRST_OPEN_MAX_SETTLE_TICKS` (`accordionAnimation.ts`) and
`testUtils/openAccordions.ts` are referenced only by their own tests. Both are dead, and neither is
part of the stacked scroll.

**Follow-up, the phone crumb (Crawford, 2026-10-10, spec §1.2 amended):** "remove the word root on
mobile, and if it happens a little still so be it." `NavBreadcrumb` drops the first segment when it
renders in the bar (`inBar`). The desk well keeps `Root`. On the phone the menu's Deck box is the way
home. Every remaining ancestor is still a button. `PhoneBar.test.tsx`'s well test clicked Root, so it
now clicks Fleet Params instead.

Measured in headless Chrome, as text width against the well's room (186 px at 320, 241 px at 375):

| Trail | 320 px | 375 px |
|---|---|---|
| Settings, every tab | fits (90–131) | fits |
| Probes, All Probes and robots | fits (110–177) | fits |
| Fleet Params / Pacing | fits (120) | fits |
| Fleet Params / LFO Bank / Core LFO | over by 3 | fits |
| Fleet Params / Output / Compressor | over by 13 | fits |
| Fleet Params / Time & Space / Reverb | over by 15 | fits |
| Fleet Params / EQ & Filters / 3-Band EQ | over by 27 | fits |
| Fleet Params / LFO Bank / Companion LFO | over by 36 | fits |
| Fleet Params / EQ & Filters / High-Pass Filter | over by 63 | over by 8 |

So at 375 px only High-Pass is cut. At 320 px every Fleet Params trail with a sub-tab is cut by the
well's ellipsis, which takes the end of the current segment.

Mutation check: 5, all killed. The mutants: Root kept in the bar; Root dropped on the desk too; the
branch dropped as well; a leading separator; the first remaining segment losing its button. The
full suite has 8657 tests. Once, `sceneToOrbiterLocal`'s 5 s round-trip timed out under full-suite
load with a dev server up; that code is untouched, and the test passes alone in 1.4 s.

**Narrow desk, decided (Crawford, 2026-10-10): leave it** (Task 16's option (c)). He noted that the
top bar's space left of the power rocker reads as wasted; that is for a later pass.

**Follow-up, the intros back as expanders (Crawford, 2026-10-10, spec §1.3 amended).** He said: "put
the intros back in for now … a way to collapse them that's an expander button more than a hide it all
accordion." From the options offered he chose the headline plus a More button, and all intros.
- **`IntroPanel`** gains `collapsible` and `name`. The headline always shows. A cabinet `Button`
  sits beside it ("More ▾" / "Less ▴", from new keys `ui.intro.more` / `ui.intro.less`, named
  "More about {name}") and toggles a body region folded by its `hidden` attribute. Every intro
  starts collapsed. With no descriptions there is no button.
- **`Button`** gains `expanded` / `controls`, which set `aria-expanded` / `aria-controls`. This is an
  additive disclosure state.
- **Fleet Params and Settings:** the screen intro's accordion became the expander. Each section tab's
  panel opens with its group's or leaf's intro.
- **The robot screen** opens each section with its intro. Source's sits above the oscillator
  sub-tabs, so it stays open across an oscillator change.
- **State:** a section intro resets to collapsed when its tab unmounts. The screen intro keeps its
  state across tab switches.
- **No animation:** the body shows and hides at once.
- **Tests changed:** the three screens' "no second intro" tests, and RobotScreen's "has no intro",
  pinned the reversed decision. They were rewritten.

Measured in headless Chrome. **Desk at 1280:** a collapsed intro is 88 px with a 34 px headline, and
the open LFO Bank intro is 268 px; nothing overflows. **The phone is the open problem.** The headline
keeps IntroPanel's large h2 and shares a narrow row with the 70 px button, so it wraps:

| Width | Collapsed intro | Headline |
|---|---|---|
| 375 px | 175–209 px | 135–169 px |
| 320 px | 243–310 px | 203–270 px |

At 320 px two collapsed intros, the screen's and the section's, take more than the visible pane
before the first control. Not changed here; it is Crawford's call.

**Decided, option (a) (Crawford, 2026-10-10).** On the phone shell the headline takes the full
width at `--font-size-heading-sm` (18 px against the h2's 22.5), and the button gets its own line
under it on the right. I also tightened the intro's own margin and padding, to 8 px / 12 px from
16 / 16, because at the desk spacing it sat 32 px in from each side of the pane. The rules key on
`#screen-viewport[data-shell='phone']`, so the desk is unchanged (still 88 px).

Re-measured in Chrome:

| Width | Collapsed intro | Headline |
|---|---|---|
| 375 px | 146–173 px (from 175–209) | 54–81 px |
| 320 px | 146–173 px (from 243–310) | 54–81 px |

Most of what remains is the button's own 44 px line. Mutation check: 6, all killed. The mutants:
the phone keeping the desk row; two columns; the full-size headline; the desk spacing; the rules
keyed on the desk; the smaller headline leaking to the desk.

Mutation check: 19, all killed. The mutants: starts expanded; body never hidden; no `aria-expanded`
or `aria-controls`; the name ignored or always "More"; the face always More; a button with nothing to
expand; `collapsible` ignored; one shared body id; a one-column grid; and per screen, each intro
removed, not collapsible, the wrong concept, or placed inside the sub-tab panel.

### Checkpoint B: Section tabs (Crawford's dev look)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Dev server: Fleet Params, a robot, Settings — tabs with one section mounted, single-line radios,
      the "?" wells, lane titles with letters, the compact LfoLink; no accordion stack anywhere but the
      Companies index (Phase 3's).
- [ ] Stop and report.

---

### Phase 3: Roster board and Company detail

## Task 19: Content keys for the roster and the company detail

**Description:** `probe.roster.*` (head: all-probes, new-company; group count template "N probes";
the status line template; move chip; move title template "Move {name} to"; Freelance group name if not
already in `company.*`) and `company.detail.*` (share template "{n} of 12 probes", signal, the broadcast
note template, the All-form title and note). Templates use `fill`.

**Acceptance criteria:**
- [ ] `content.test.ts` passes; every key is read by Tasks 21–24.
- [ ] `fill('company.detail.broadcastNote', { n: '4' })` renders the sketch's sentence with the count.

**Verification:**
- [ ] `npx vitest run src/content` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None (Phase 2 complete).

**Files:** `src/content/copy/probe.ts`, `src/content/copy/company.ts`

**Estimated scope:** XS (content only)

**As built (2026-10-10):** one entry per concept again won over the list above (Task 1's precedent).
Reused, no new key: the head's "All Probes" is `probe.all` and "+ New company" is
`nav.entity.newCompany` (both gained a `short` — "All" / "+" — for the sketch's phone head); the
Freelance group is `company.assign`'s `freelance` option; the Move title is a `template` on
`company.assign` itself ("Move {name} to" — the Move panel *is* that radio, retitled), so
**Task 22 reads `fill('company.assign', { name })`, not `probe.roster.moveTitle`**. The sketch's
"All Probes — edit the whole fleet" tagline is dropped, as the nav's "— the whole fleet" was in Task 1.
Added: `probe.roster.count` ("{n} probes") + `.count.one` ("1 probe"), `probe.roster.statusLine`
("{job} · {dockingState} · {activity} · {status}", the sketch's desk tile line — the same four values
`RobotScreen`'s `useRobotMeta` already resolves), `probe.roster.move` ("⇄ Move", `short` "⇄",
template "Move {name}" for the accessible name); `company.detail.share` (lore "Mesh Share", template
"{n} of {total} probes" — the fleet size is a slot, never a literal 12), `company.detail.signal` (lore
"Affiliation Signal", options `company` / `all` = the sketch's two values — the All form's note),
`company.detail.broadcastNote` (the sketch sentence) + `.one` / `.none` (a single plural template would
say "all 1 probes" / "all 0 probes"; a new company starts empty), `company.detail.allForm` (the All
form's eyebrow "Fleet-wide edit"; its title is `probe.all`). The human names "Fleet Share" / "Halo" and
the `.one` / `.none` sentences are mine — the sketch draws only lore + value and the plural case. All
ten new keys sit in `content.test.ts`'s `AWAITING_CONSUMER` naming Task 21 / 22 / 23; empty again by
Checkpoint C. Not added: the sketch's phone company band line "{n} probes · edits reach every member"
(Task 23 says name + count, which `probe.roster.count` covers).

## Task 20: `rosterRows()` and `movePanelRobotId`

**Description:** Pure `src/utils/rosterRows.ts`: `rosterRows(locale): RosterRow[]` — one row per company
in `locale.companies` order with its member ids, then Freelance (robots with no `companyId`) last;
empty companies keep their row. `uiStore` gains `movePanelRobotId: string | null` with
`openMovePanel(id)` / `closeMovePanel()`.

**Acceptance criteria:**
- [ ] Three companies + Freelance → four rows in order, Freelance last; six companies → seven rows;
      a robot appears in exactly one row; a company with no members yields a row with zero tiles.
- [ ] `openMovePanel('r4')` then `closeMovePanel()` round-trips; opening another replaces the first.

**Verification:**
- [ ] `npx vitest run src/utils/rosterRows.test.ts src/stores/uiStore.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/utils/rosterRows.ts`, `rosterRows.test.ts`, `src/stores/uiStore.ts`, `uiStore.test.ts`

**Estimated scope:** S

**As built (2026-10-10):** `rosterRows({ robots, companies })` takes the structural narrow shapes
(`{ id, companyId? }` / `{ id }`), not a full `Locale` — Task 21's board calls it on its narrow roster
slice. `RosterRow` = `{ companyId: string | null; robotIds: string[] }`, `null` = Freelance. Three calls
beyond the text above (open for Crawford): the **Freelance row is always present, even empty** (it is a
Move target, as an empty company's row is); membership reads `Robot.companyId` in the locale's robot
order (as `getCompanyMembers` does), not `Company.robotIds`; a `companyId` naming no company (or `''`)
files the robot under **Freelance**, so every robot sits in exactly one row. `movePanelRobotId` joined
the uiStore key-set test's `NAV_FIELDS`. 12/12 mutants killed.

## Task 21: `RosterBoard` and `RosterTile` (no Move chip yet)

**Description:** New `src/components/panels/screen/screens/RosterBoard.tsx` / `RosterTile.tsx`: the head
("All Probes — edit the whole fleet" → `selectEntity('all')`; "+ New company" → `CompanyCreateForm`
inline), one intro, then one row per `rosterRows()` entry — the leading cell (name `CabinetBox` in
`Company.color`, Freelance in the companies trait frame style, opens the company via `selectEntity`;
the count) and the member tiles (gem via the card render context, name, status line from
`AudioStatusBadge`'s state + job, battery `VoxelTrack` read-only; click → `selectEntity({ robotId })`).
Tiles flow right and wrap (`--roster-tile-width`); the phone shell lists them in one column and scrolls.
`ConsolePanel` routes `robots` and `companies` here when no entity is selected. `RobotsTab`,
`RobotSelectionCard`, `robotSelectionConfig.ts`, `robotListFilter.ts`, `ProbesContent` and `CompaniesContent`
are deleted (`CompanyCrudControls`' forms survive). The roster subscribes to a narrow
`{ id, name, companyId, identityColor, audioMode }` slice.

**Acceptance criteria:**
- [ ] Rows render in `rosterRows` order with Freelance last and the right counts; six companies plus
      Freelance render seven rows; no filter control exists.
- [ ] Clicking a tile selects that robot and the screen becomes `RobotScreen`; clicking a company's
      name box selects that company; "All Probes" sets `allProbesSelected`.
- [ ] Re-render discipline: changing one robot's `masterVolume` does not re-render the board (test
      with a render counter, the backlog item 27 pattern).
- [ ] No file imports a deleted module (grep gate).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RosterBoard.test.tsx src/components/panels/screen/screens/RosterTile.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server — Probes shows the board; a six-company world (create three) still fits the
      desk content area without clipping Freelance.

**Dependencies:** Tasks 19, 20.

**Files:** `RosterBoard.tsx`, `.css`, `.test.tsx`, `RosterTile.tsx`, `.css`, `.test.tsx`,
`ConsolePanel.tsx`; deletions listed above

**As built (2026-10-10):** `ConsolePanel` now routes both branches itself (`ProbesBranch`: robot screen >
the All Probes form > the board; `CompaniesBranch`: the company form > the board). The All Probes and
company forms are ProbesContent's / CompaniesContent's old ones, moved in unchanged until Task 23. Grep
gate = `screens/rosterBoardRetired.test.ts`. Departures from the text above:
- **`robotSelectionConfig.ts` is NOT deleted** (spec §1.11 lists it): every export still has a reader —
  `RobotScreen` (row schemas, battery readout), `AudioStatusBadge`, and the tile's status line (the
  value labels). Open for Crawford: keep it, or rename it now that no selection card exists.
- `useRobotMeta` moved out of `RobotScreen` into `screens/useRobotMeta.ts`, shared with the tile.
- The board subscribes narrower than the plan's slice: `{ id, companyId }` per robot plus
  `useEntityRoster('companies')`; each tile reads its own robot, memo'd, as RobotSelectionCard did.
- Freelance's leading cell is a flat `CabinetBox` label, not a button (there is no company to open).
  The phone head shows the `short` faces ("All", "+") with the full names as accessible names. No
  "Probes" heading: no other screen has one; the crumb names it.
- Dead with the deletions and removed: `buildCompanySelectionSchema` + `company.selection`, the
  `probe.list*` keys. `company.root`'s intro block is now unread (the key stays as the nav label).
  `AudioStatusBadge` had no component consumer before this task either; left alone.
- **Found in Chrome and fixed:** VoxelTrack is an absolute overlay, so the battery strip covered the
  whole tile; it now sits in a positioned box at the track's own length.
- **Manual check (CDP, 1280×800 / 1024×768 / 375×760 / 320×640):** no sideways scroll anywhere; six
  companies + Freelance = seven rows, Freelance never clipped, but the board scrolls — already at 3
  companies at 1280×800 (778 / 526 px). Open for Crawford: (a) the four-part status line is ellipsized
  on every tile (260 px of text in a 162 px column on desk, 215 on phone; the sketch drew two parts);
  (b) gems draw ~31×12 px — the card render context's 160×80 `gemViewBox` in a 56×44 box, the framing
  RobotSelectionCard had too; (c) at 1024 px the row's tile column (489 px) fits one 250 px tile, not two.
- 37/37 mutants killed (one survivor first: the create form's "mounted only while open" check could not
  see under `hidden`; the test now queries `{ hidden: true }`).

**Estimated scope:** M (two components) + L deletions

## Task 22: The Move chip, its popover and sheet, and the glide

**Description:** `RosterTile` gains the "⇄ Move" chip (`CabinetBox`, 22 px, frame style): desk shell
hidden until `:hover` / `:focus-within` on the tile, phone shell a small always-on glyph plus a 500 ms
press on the tile. The chip is a Radix `Popover.Trigger` (desk) or `Dialog.Trigger` (phone) opening the
company `RadioButton` (`buildCompanyAssignmentSchema`, title `fill('company.assign', { name })` — Task 19 as built); the open tile
is `movePanelRobotId`. Picking calls `assignRobotToCompany` once, closes the panel, and `RosterBoard`
runs the Flip glide (`Flip.getState` in the handler, `Flip.from` in a `useLayoutEffect` on the row
order, `timelineMap` key `roster-move-<id>`, skipped under reduced motion). The chip stops propagation
so the tile's own click does not fire.

**Acceptance criteria:**
- [ ] Desk: the chip is not visible at rest (CSS test on opacity under `:hover` / `:focus-within`
      only — mutation check: make it always visible and watch the test fail); phone: always visible.
- [ ] Picking "Iron Crew" for Tidal Wisp calls `assignRobotToCompany(localeId, 'r0', ironCrewId)`
      exactly once, closes the popover (`movePanelRobotId` null) and the tile renders in Iron Crew's
      row; picking Freelance passes `null`.
- [ ] Escape and click-outside close without a store write; the tile's `selectEntity` does not fire
      when the chip is clicked.
- [ ] With reduced motion no timeline is registered; without it one is, and it is killed on unmount.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RosterTile.test.tsx src/components/panels/screen/screens/RosterBoard.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: hover a tile, move it, watch it glide; phone at 375 px — glyph, sheet, move.

**Dependencies:** Tasks 13, 21.

**Files:** `RosterTile.tsx`, `.css`, `.test.tsx`, `RosterBoard.tsx`, `.test.tsx`

**Estimated scope:** M

**As built (2026-10-10):** the tile takes an `onMove(robotId, companyId | null)` prop from the board
(the board must measure before the store write, so the write lives there); the tile closes its panel.
The open state is a per-tile boolean selector on `movePanelRobotId`, so one panel opening re-renders one
tile, and only the open panel subscribes to the company list. Desk = a modal `Popover` anchored on the
whole `<li>` (`Popover.Anchor`), the chip its trigger; phone = a `Dialog` sheet over a scrim, in the nav
sheet's band. Both portal into `#screen-viewport` (in place inside the tile, the positioned `<li>` would
lay the sheet out against itself; HelpPopover's stacking finding too). Departures and calls beyond the
text above:
- **No help "?" in the Move panel** — the robot screen's company radio carries it, and a modal popover
  inside a modal popover is one too many (my call, open for Crawford).
- **Re-picking the current company closes the panel** with no move (Radix's deselect → `onDeselect`).
- **The 500 ms hold** is a plain `setTimeout` in the tile (a UI gesture, not musical timing); release,
  `pointercancel` (a scroll) or leaving the tile cancels it; the click that ends a hold is swallowed, so
  the robot does not open; the tile's `contextmenu` is prevented on the phone so the browser's touch
  menu stays away. Desk tiles have no hold.
- **Focus follows the moved tile to its face** in the new row (the opener left with the old row). Not
  the chip: a freshly mounted desk tile swaps its chip element once just after mount (Radix's
  `Popover.Trigger` wraps itself in a Popper anchor until `Popover.Anchor` registers), which took focus
  with it — found by a failing test.
- **One glide at a time:** a second pick runs the first `progress(1)` and kills it, measured after, so
  the next glide starts from where the tiles stand. A finished glide deletes its own timelineMap entry.
  Duration 0.45 s, `power2.inOut` (`ROSTER_GLIDE_DURATION`).
- **`gsap/dist/Flip`, not `gsap/Flip`:** gsap's exports map types `gsap/Flip` as `types/Flip.d.ts` while
  its `index.d.ts` references `types/flip.d.ts`, and tsc on a case-insensitive disk rejects the pair
  (TS1149). The dist path types through gsap's ambient `declare module` and is Flip alone (`gsap/all`
  would pull every plugin into the dev pre-bundle). `vitest.setup.ts`'s gsap mock gained a no-op
  `registerPlugin`; `RosterBoard.test.tsx` mocks `gsap/dist/Flip` with a recording fake.
- **Chip height:** one value, `MOVE_CHIP_HEIGHT = 22` (CabinetBox needs a number), set inline on the
  tile as `--move-chip-height` for the CSS (the `--header-volume-width` way). The desk name line keeps a
  constant 72 px reserve so it never reflows as the chip fades in; the phone glyph is a 22 px box in a
  44 px press area.
- **Found in Chrome and fixed:** the desk panel folded to **26 px wide** — `RadioButton` is an
  inline-size container with no intrinsic width, so a shrink-to-fit popover collapses around it. It now
  has a set width, `min(--move-panel-width 480px, 100vw − 2 × spacing-lg)`, and the options **wrap** (the
  sketch's single nowrap row cannot hold six companies + Freelance). The screen is the collision
  boundary: without it the rightmost tile's panel ran 8 px into the sleeve at 800 px. A dead
  `align-items: stretch` on the sheet's options was deleted (options are `fit-content`).
- **Manual check (CDP, 1280×800, 800×700, 375×760):** chip opacity 0 at rest → 1 on hover; panel
  480×119, 8 px under the tile, inside the screen; picking glides the tile with a real Flip (e.g.
  (463, 391) → mid `translate3d(−171, −78)` → (721, 509), transform cleared after) into its new row,
  focus on its face, panel closed; phone: 44×44 glyph, 650 ms hold opens the sheet without opening the
  robot, Escape closes, sheet 343×270 ends above the bar; no sideways scroll anywhere. Not checked: a
  real touch device (the hold was driven with mouse pointer events).
- **Open for Crawford:** the sketch's phone bar well reads "moving Tidal Wisp — tap outside or pick to
  close" while the sheet is open; the bar keeps its breadcrumb (not in this task's text). After a mouse
  pick the moved tile wears a light ring and its chip stays shown (it holds focus) until focus moves on —
  seen in the 1280 screenshot, not measured.
- 44/44 mutants killed (after 4 survivors in the first run: three got tests, and one showed my focus
  timing explanation was wrong, so the code was simplified to the plain layout-effect focus).

## Task 23: `CompanyScreen` and `useCompanyOptions()`

**Description:** `CompanyOptionsSection.tsx` splits into `useCompanyOptions(companyId | 'all')` (the
resolved values via `resolveCompanyOptions`, the per-field broadcasting handlers, the diff-one-field rule,
the zero-member disabled state — logic moved, not rewritten; its tests move) and the four section
renders. New `src/components/panels/screen/screens/CompanyScreen.tsx`: the company column (popped name
`CabinetBox` in `Company.color`, share and signal wells, member gem tiles → `selectEntity({ robotId })`,
the broadcast note well via `fill`, `CompanyRenameDeleteForm`) beside `SectionTabs` over
`ROBOT_SECTIONS_CONFIG` rendering the four sections with the hook's values. The All form
(`allProbesSelected`) has twelve tiles, the deck trait colour, no Rename / Delete. `ConsolePanel` routes
`companies` here when a company or All is selected; the phone shell uses a small company band (flat
colour swatch, name, count).

**Acceptance criteria:**
- [ ] Changing Volume on Rust Syndicate's screen calls `applyVolume` once per member and records only
      `masterVolume` in `lastEditedOptions` (the moved `CompanyOptionsSection` tests pass).
- [ ] The column shows "4 of 12 probes", four tiles, the note with "4", Rename and Delete; the All
      form shows twelve tiles and no Rename / Delete.
- [ ] Rename and Delete behave as `CompanyCrudControls.test.tsx` asserts (tests pass unmodified);
      deleting selects All and the screen becomes the All form.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/CompanyScreen.test.tsx src/components/company` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server — open a company from the nav and from a roster header; edit a slider; the
      members change.

**Dependencies:** Tasks 11, 13, 19, 21.

**Files:** `CompanyScreen.tsx`, `.css`, `.test.tsx`, `src/components/company/useCompanyOptions.ts`,
`useCompanyOptions.test.ts`, `CompanyOptionsSection.tsx` (→ sections only), `ConsolePanel.tsx`

**Estimated scope:** M

**As built (2026-10-10):** `useCompanyOptions(target: string)` (`ALL_TARGET = 'all'`, else a company id)
returns `{ company, members, options }`; `options` is one memoized bag (the four values, the swelling
flags, `active` and twelve handlers) that keeps its identity through any edit that changes none of
them, and `company` / `members` stay outside it so a roster change does not rebuild it. The sections
file is `useCompanySubsectionRenderer(options)` (one stable function from a subsection id to its panel)
and `companyTraitStyle(trait, active)` (the full or the desaturated pair). `CompanyScreen` reads the
selection itself — `selectedCompanyId ?? 'all'` — so a delete (which selects All) re-renders the same
screen as its All form. Tests moved as follows: the broadcast, value and stability tests to
`useCompanyOptions.test.ts` (real store, `renderHook`, handlers called directly); the wiring, disabled
state and re-render-cascade tests stayed in `CompanyOptionsSection.test.tsx` over a hook-plus-renderer
harness. The accordion tests (triggers, default-open Levels, lazy mount, entity-switch reset, "never
writes the section fields") went with the accordions. Departures and calls beyond the text above:
- **`RobotSectionAccordionStack` is deleted** (its last consumer left; the grep gate is in
  `RobotScreen.test.tsx` beside the other two). `RobotSectionTabs` is now exported from `RobotScreen.tsx`
  with an optional `traitStyle`, which the company screen uses to mute the panels while there is nothing
  to edit — the robot screen is unchanged.
- **Deleting a company calls `selectEntity('all')`**, not `selectAllRobots()`: with a company's screen
  and the All form as one screen, "select All" is the nav's own action (it also sets `allProbesSelected`
  and opens Probes on All Probes). `CompanyCrudControls.test.tsx` passes unmodified.
  `CompanyRenameDeleteForm` gained `showSummary` (default true); the screen passes false, since the name
  box is the summary.
- **The delete confirm is rebuilt** (Task 17's deferral; not in this task's text): it portals into
  `#screen-viewport` (in place with no screen), sets its own text colour and gives focus back to the
  Delete button, exactly as the Settings confirms do; five tests added to `CompanyCrudControls.test.tsx`,
  none of the existing ones touched. Its body is still plain Radix buttons, not the Button primitive.
- **The breadcrumb names a section for All Probes and a company**, Source when none is stored, as it
  does for a robot (`navActions.ts`; its comment said "until Task 23"). Two tests changed with it.
- **The intros stay** (open for Crawford): `company.profile` and `probe.all` are collapsible expanders
  above the tabs. The sketch draws none, but dropping them leaves `company.profile` unreferenced, which
  the content guard rejects, and the old forms showed them. `AWAITING_CONSUMER` is empty again.
- **Phone:** the band is a swatch (`var(--color-accent)`), name and count (`probe.roster.count`), then the
  member tiles and Rename / Delete. The broadcast note and the two wells are desk-column only, as the
  task text has it.
- **A stale selected id renders nothing** (a company deleted elsewhere or a reseed); the old form
  rendered disabled panels with no summary.
- Mutants: hook 2 equivalent survivors (a memo dep on an identity-stable handler; keying `resolved` on
  `members` instead of `firstMember`, which the resolved fields' references hide); renderer, screen and
  the shared edits all killed after four tests were added or tightened.
- **Not checked:** the screen in a browser. The CSS (the name box's face, the tile grid, the swatch) is
  unseen; that is Checkpoint C's look at 1280, 800, 375 and 320 px.

## Task 24: Deck — halo colours and the meta box's selection lines

**Description:** `Robot.tsx` sets `--halo` on the `.robot` element (`identityColor` when selected,
`Company.color` when a company member) and `OceanScene.css`'s `.robot.selected, .robot.isCompanyMember`
rule uses `var(--halo)` in its drop-shadows instead of the fixed cyan. `MetaBox` adds a selected robot's
line (name · job · state) and a selected company's line (name · count), latest on top; on the phone
shell only the latest shows and tapping the bar cycles to the other. A test asserts no text label
renders in the world for a selected robot.

**Acceptance criteria:**
- [ ] A selected robot's `.robot` carries `--halo: <identityColor>`; a member of the selected company
      carries `--halo: <Company.color>`; under All nobody carries `isCompanyMember`.
- [ ] The meta box shows one line for a robot, one for a company, both when both are selected (latest
      first) on desk; on phone one line, tap cycles.
- [ ] No `<text>` for the robot's name exists in the world SVG when selected (mutation check: add one
      and watch the test fail).

**Verification:**
- [ ] `npx vitest run src/components/robot/Robot.test.tsx src/components/panels/screen/worldView/MetaBox.test.tsx src/components/panels/screen/worldView/OceanScene.css.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: select a robot — halo in its colour; select a company — every member in the company
      colour.

**Dependencies:** Tasks 8, 23.

**Files:** `src/components/robot/Robot.tsx`, `Robot.test.tsx`, `src/components/panels/screen/worldView/OceanScene.css`,
`OceanScene.css.test.ts`, `MetaBox.tsx`, `MetaBox.test.tsx`

**Estimated scope:** S

### Checkpoint C: Roster and company (Crawford's dev look)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Dev server: the board with rows, the hover chip and a glide, a company screen editing its
      members, halos in colour, the meta box lines; phone at 375 px and 320 px.
- [ ] Stop and report.

---

### Phase 4: Off screen

## Task 25: Transmission presets and the off-screen content

**Description:** `src/data/transmissionPresets.ts`: `TRANSMISSION_PRESETS: { id, nameKey, payload:
SessionPayload }[]` — three constants, placeholders built from today's defaults (`buildSessionPayload()`
on a fresh default locale, captured as literals) under three names; content keys `home.off.label`,
`home.off.powerHint`, `home.off.transmission`, `home.off.presets.{a,b,c}`, `home.off.readout` template.

**Acceptance criteria:**
- [ ] Each preset payload passes the same validation `loadSession` output passes (`sessionDiff`'s
      guards) and `applySessionPayload` accepts it in a test.
- [ ] Three presets, three distinct names, stable ids.
- [ ] `content.test.ts` passes.

**Verification:**
- [ ] `npx vitest run src/data/transmissionPresets.test.ts src/content` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None (Phase 3 complete).

**Files:** `src/data/transmissionPresets.ts`, `transmissionPresets.test.ts`, `src/content/copy/home.ts`

**Estimated scope:** S

## Task 26: The world before power-on

**Description:** Split `initializeLocale(localeId, { startSystems = true })` in `worldTransition.ts`:
the build half (`placeDistrict`, `spawnInitialRoster`, `spawnInitialCompanies`) always runs; the start
half (`stop`/`startRobotLifecycle`, `stop`/`startWorkLoop`, `stop`/`startAudioSwells`) runs only when
`startSystems` is true. `OceanScene`'s mount effect passes `startSystems: isPoweredOn`;
`retransmitWorld` passes the current power state; `powerController.powerOnSequence()` calls the start
half after `AudioEngine.start()`. `ScreenViewport` renders `WorldView` in both power states.
`powerController.shutdown()` stops lifecycle, work loop and audio but no longer empties `actors`. RED
first: a test that the build half completes with `AudioEngine` un-started and that
`startRobotLifecycle` / `startWorkLoop` / `startAudioSwells` are not called until `powerOnSequence()`;
if any spawn path throws without audio, the fix is a guard in the caller, reported as a finding, not
silently patched in `src/engine/`. The off world is still: no lifecycle tick, hour lighting only.

**Acceptance criteria:**
- [ ] With `isPoweredOn` false, `WorldView` is mounted and the locale has twelve robots and its
      actors; `startRobotLifecycle`, `startWorkLoop` and `startAudioSwells` have not been called;
      nothing in `audioStore` has started.
- [ ] `powerOnSequence()` after a pre-power load starts the three systems once and registers every
      robot's audio (the `reRegisterAllRobotsAudio` spy) exactly as a fresh power-on does;
      `shutdown()` leaves `actors` populated; a second power-on does not double-start (the stop-then-
      start pairs hold).
- [ ] A powered-on retransmit still starts the systems (the existing `worldTransition.test.ts` cases
      pass unmodified); a powered-off retransmit does not.
- [ ] A `?session=` link still applies once per page load (the existing `consumeSessionSharePayload`
      tests pass).

**Verification:**
- [ ] `npx vitest run src/systems/worldTransition.test.ts src/systems/powerController.test.ts src/components/panels/physical/ScreenViewport.test.tsx src/components/panels/screen/worldView/OceanScene.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: load the app powered off — the world is visible and still; press power — sound and
      motion start; power off — the world stays.

**Dependencies:** None.

**Files:** `src/systems/worldTransition.ts`, `worldTransition.test.ts`, `src/systems/powerController.ts`,
`powerController.test.ts`, `src/components/panels/physical/ScreenViewport.tsx`, `ScreenViewport.test.tsx`,
`src/components/panels/screen/worldView/OceanScene.tsx`

**Estimated scope:** M (one split, two callers, one proof — the only `src/systems/` change beyond `powerController.ts`)

## Task 27: `OffScreen` and the muted `RadioButton`

**Description:** `RadioButton` gains `appearance?: 'cabinet' | 'muted'` (schema field): `muted` renders
each option as the box's own shape and size with no cabinet walls, no pop timeline and no glow, the
selected one a monochrome fill (the sketch's `.cab.sel`). New
`src/components/panels/screen/screens/OffScreen.tsx`: over the dimmed still world, the etched label,
the power hint, and the Transmission row — the three presets, a divider, then `listSessions()` names if
any — as a muted `RadioButton`; a well names the pick. Picking a preset calls
`applySessionPayload(preset.payload)`; picking a save calls `applySessionPayload(loadSession(name))`;
neither touches `AudioEngine`. `ScreenViewport` renders it when `!isPoweredOn`. The Theme row is not
built.

**Acceptance criteria:**
- [ ] Nothing on the off screen has the popped class or a cabinet wall element (CSS + DOM test;
      mutation check: switch the appearance to `cabinet` and watch it fail).
- [ ] Three presets then the user's saves render, with a divider only when saves exist; picking calls
      `applySessionPayload` with the right payload and never `AudioEngine.start`; the well shows the
      pick's name.
- [ ] The off screen is absent while powered on; the Theme row does not exist.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/OffScreen.test.tsx src/components/ui/controls/RadioButton.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: powered off — pick a preset, the faint world retransmits silently; press power.

**Dependencies:** Tasks 13, 25, 26.

**Files:** `OffScreen.tsx`, `.css`, `.test.tsx`, `src/components/ui/controls/RadioButton.tsx`, `.css`,
`.test.tsx`, `src/types/controls.ts`, `ScreenViewport.tsx`

**Estimated scope:** M

## Task 28: The phone off screen and the 320 px pass

**Description:** `OffScreen` on the phone shell: the label higher, the picker centred and wrapping, the
readout on two lines; the power switch with the light in the button (the sketch's Q11) if the sleeve's
phone switch does not already draw it. A CSS test walks every shell piece at 320 px — header, bar,
sheet, roster tile, section tab row, off screen — asserting no fixed width exceeds the viewport.

**Acceptance criteria:**
- [ ] At 320 px no component's fixed width or min-width exceeds `SHELL_MIN_WIDTH` (CSS test over the
      shell stylesheets).
- [ ] The phone off screen renders all three presets without horizontal overflow.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/shell320.css.test.ts src/components/panels/screen/screens/OffScreen.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] Manual: dev server at 320 px, every screen.

**Dependencies:** Task 27.

**Files:** `OffScreen.css`, `src/components/panels/screen/shell320.css.test.ts`, any shell CSS the test
flags

**Estimated scope:** S

### Checkpoint D: Off screen (Crawford's dev look)
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Dev server powered off: the faint still world, the label, the hint, the Transmission row with
      nothing popping; a preset retransmits silently; power on works; phone at 375 and 320 px.
- [ ] Stop and report.

---

### Phase 5: Gates

## Task 29: Idle-paint perf gate

**Description:** `npm run build && npx vite preview --port 4173`, then `npm run perf:idle` against `main`
and the branch on the pinned `?session=` world, in Phase 44's gate shape (PERFORMANCE.md): idle busy and
paint within the noise band, on the Deck and on a content screen. A second run measures the powered-off
screen: the still world must not run a frame loop. Results recorded in PERFORMANCE.md's table.

**Acceptance criteria:**
- [ ] Deck and Fleet Params idle busy / paint within the noise band of `main`.
- [ ] Powered off: no periodic long tasks; paint count flat over 6 s.

**Verification:**
- [ ] The two harness runs, pasted into the task's commit message and PERFORMANCE.md.

**Dependencies:** Checkpoint D.

**Files:** `docs/PERFORMANCE.md`

**Estimated scope:** XS (measurement)

## Task 30: Crawford's screenshot check

**Description:** The original twelve desktop and six phone screenshots retaken on the branch, plus the
phone shell at 320 px, each read against the intent's problem statement; no listening check. Any miss
becomes a follow-up task here before Phase 6.

**Acceptance criteria:**
- [ ] Every complaint in the problem statement is gone in the retaken set, or a follow-up task is
      written for it.

**Verification:**
- [ ] Crawford's sign-off, recorded in this file.

**Dependencies:** Task 29.

**Files:** this file

**Estimated scope:** XS (review)

---

### Phase 6: Docs

## Task 31: Docs and the docs test

**Description:** Rewrite UI_SHELL.md for the shell (strips, header, one panel, surface, meta box, phone
bar and sheets, `useShell`, `navActions`, the store table); COMPONENT_LIBRARY.md for `SectionTabs`,
`HelpPopover`, `RadioButton`'s face and `appearance`, `LfoLink`'s composition, `ContentEntry.help`;
COMPANIES.md for where reassignment and the bulk edit live (roster chip, robot column, company screen,
`useCompanyOptions`) and remove the stale `CompanyManager` / `CompanyButtonRow` paragraph;
SESSION_STORAGE.md for presets; ANIMATION_SYSTEM.md for the three new timelines; CONTENT_LAYER.md for
`help` and `short`. Add `src/docs/layoutReworkDocs.test.ts` in the house pattern pinning every named
identifier to the source. Every name spot-checked against the shipped code, not this plan.

**Acceptance criteria:**
- [ ] Every identifier the docs name exists in the source (the docs test).
- [ ] No doc still describes the nav tree, the accordion stack, the Probes card list or the Companies
      index as current.

**Verification:**
- [ ] `npx vitest run src/docs/layoutReworkDocs.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 30.

**Files:** `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md`, `docs/COMPANIES.md`, `docs/SESSION_STORAGE.md`,
`docs/ANIMATION_SYSTEM.md`, `docs/CONTENT_LAYER.md`, `src/docs/layoutReworkDocs.test.ts`

**Estimated scope:** M (docs)

## Task 32: Roadmap, backlog, headers

**Description:** Roadmap Phase 45 entry (About, Decisions made while building, Not Doing); archive
backlog items 2 and 4; mark the intent and spec headers "built"; a one-line note in the sketch header
that the sketch is now the record, not the plan; CLAUDE.md's reference-docs list gains nothing unless a
new doc was created.

**Acceptance criteria:**
- [ ] Roadmap entry present and linked from the intent and spec headers; backlog items 2 and 4 moved
      to the archive with the shipping commit.

**Verification:**
- [ ] `npm run build:types`, `npm run lint` clean (docs only).

**Dependencies:** Task 31.

**Files:** `docs/todo/roadmap.md`, `docs/todo/backlog.md`, `docs/todo/archive/*`, `docs/intent/layout-rework.md`,
`docs/specs/LAYOUT_REWORK.md`, `docs/sketches/layout-rework.html`

**Estimated scope:** XS (docs)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across all tasks met; the perf gate holds; the screenshot set
      signed off.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Any manual check not performed in-session is flagged here, never silently skipped.
- [ ] Ready for Crawford's final review and the PR (one branch, merged once).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The world built before power-on starts ticking, or a spawn path throws without audio (Task 26) | High — blocks the off screen | `initializeLocale` is split behind `startSystems` (found at plan time: it starts lifecycle, work loop and swells today); RED test on the build half with `AudioEngine` un-started; `powerOnSequence` starts the systems and already re-registers audio; any throw is reported as a finding and guarded in the caller, never patched in `src/engine/` |
| The Flip glide fights React's re-render (Task 22) | Medium — a jump instead of a glide | `Flip.getState` in the handler, `Flip.from` in `useLayoutEffect` keyed on the row order; reduced motion skips; a jump is accepted over a dropped store write |
| Deleting a module that still has an importer (Tasks 9, 18, 21) | Medium — a broken build mid-phase | Grep gate before every deletion, recorded in the commit; types + lint at every commit |
| `content.test.ts` rejects placeholder copy or the new `help` field | Medium | Task 10 extends the type and the test together; placeholders are real strings under real keys |
| The 640–767 band regresses (phone shell with the larger cabinet tier) | Low | `useShell` is the one switch; Checkpoint A's dev look includes 700 px; the 320 px CSS test (Task 28) |
| The header overflows at 320 px beside the power corner (Task 6) | Medium | CSS test on the header's widths at `SHELL_MIN_WIDTH`; mute-only on the phone shell |
| `WorldView` mounted while off costs idle paint (Task 26) | Medium — the perf gate | The off world is still (no lifecycle, no LFOs); Task 29 measures the off screen explicitly |
| The `--halo` custom property collides with Phase 41's halo element (Task 24) | Low | Different element and class; the CSS test asserts both coexist on a selected robot |
| Help copy drifts in voice or length (Tasks 10, 12b) | Low | Written against `copy-tone-guide.md`'s human examples; Crawford reads it at Checkpoint B |
| The Companies parent and Probes parent both open the roster, confusing the breadcrumb | Low | `breadcrumbPath` names the branch that was clicked (`expandedTopLevelBranch`), not the screen |

## Open Questions

All seven spec questions are resolved (spec §7, Crawford 2026-10-09) and carried into the
Architecture Decisions above: branch forked now; the 640–767 band is the phone shell; the phone meta
box shows the latest selection and a tap cycles; presets are `SessionPayload` constants in
`src/data/transmissionPresets.ts`; the off world is still; `activeHubTile` stays the view switch; the
help popover goes on every control with a description, missing ones written in the copy-tone guide's
human voice at the existing length.

Two plan-level items for Crawford at the checkpoints, not blockers:

1. **Checkpoint B:** the help copy's voice — he reads a sample before Task 12b's batch.
2. **Checkpoint D:** the three preset names and payloads are placeholders; curating them is his and
   can land as a follow-up commit on the branch any time before the PR.
