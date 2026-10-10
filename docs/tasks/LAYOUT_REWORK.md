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

**Estimated scope:** M (two components) + L deletions

## Task 22: The Move chip, its popover and sheet, and the glide

**Description:** `RosterTile` gains the "⇄ Move" chip (`CabinetBox`, 22 px, frame style): desk shell
hidden until `:hover` / `:focus-within` on the tile, phone shell a small always-on glyph plus a 500 ms
press on the tile. The chip is a Radix `Popover.Trigger` (desk) or `Dialog.Trigger` (phone) opening the
company `RadioButton` (`buildCompanyAssignmentSchema`, title from `probe.roster.moveTitle`); the open tile
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
