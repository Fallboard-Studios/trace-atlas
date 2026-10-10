# Phase Spec: Layout Rework

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (Vitest; `npx vitest run <path>` for one file)
> - Sketch render check: `node docs/sketches/tools/smoke-layout-rework.cjs` (must end `bad = 0`)
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle --throttle 1 --only none --port 9301 --url <pinned ?session= link>` (PERFORMANCE.md)
> - Dev server: `npm run dev`

Roadmap Phase 45 (entry written with the plan). Intent:
[docs/intent/layout-rework.md](../intent/layout-rework.md) (confirmed 2026-10-09; where the intent and
this spec differ, the intent wins). Sketch: [docs/sketches/layout-rework.html](../sketches/layout-rework.html)
— every view tab approved; its header comment is the running record (D1–D4, Q1–Q11 with verdicts, the
per-view entries and their amendments). Branch: `feature/layout-rework` (see §6).

The app's shell and every screen are rebuilt to the approved sketch, as four sub-phases on one branch:
(1) the shell and the one-panel nav, with the existing screens dropped in unchanged; (2) section tabs on
Fleet Params and the robot screen, retiring the stacked scroll; (3) the roster board and the Company
detail; (4) the off screen last. Nothing below the UI changes: the session payload, the share link and the
audio path are untouched.

Every file, function, constant and store field named below was checked against the working tree on
2026-10-09 (`feature/world-gem` at `ced07eb5`, `main` at `6802c8b4`); the "Verified against the code"
notes record where the code differs from the intent or the sketch.

## Assumptions (confirmed by Crawford, 2026-10-09 — see §7)

1. **Two shells, split at the nav dock width, not three.** The intent's "1024 px tier" does not exist in
   code: the only layout constants are the cabinet tier boundary (`useCabinetTier`, 639 px,
   `useCabinetBoxHeight.ts:75`) and `NAV_PANEL_DOCK_MIN_WIDTH = 768` (`useNavPanelSlideAway.ts:14`);
   the CSS breakpoints are 480 / 600 / 48em. The **desk shell** (the sketch's 1600 × 900 frame: side
   panel, slim header, breadcrumb well) applies from 768 px up; the **phone shell** (the sketch's
   375 × 812 frame: top bar, bottom bar, sheets) applies below. The 640–767 band takes the phone shell
   with the larger cabinet tier, exactly as today's slide-away band does. The phone shell must hold
   down to **320 px** (Crawford: "I do want to handle down to 320"). The three `64em` (1024 px) queries
   added along the way (`Header.css:166`, `:193`, `RobotDisplaySection.css:98`) are not required and
   leave with their files.
2. **Company colour already exists** — `Company.color` (`src/types/Company.ts:38`, seeded by
   `generateCompanyIdentityColor`, random on create), so headers, halos and the company column use it
   with **no payload change**. The selection halo in the world changes from the fixed cyan
   `drop-shadow` (`OceanScene.css:44–47`, shared by `.selected` and `.isCompanyMember`) to the robot's
   `identityColor` for a robot and `Company.color` for a company, through one CSS custom property set
   on the `.robot` element.
3. **Radix does the keyboard work.** `@radix-ui/react-tabs`, `react-popover` and `react-dialog` are
   installed (package.json) and `react-tabs` and `react-popover` are not yet imported anywhere.
   Section tabs are Radix `Tabs` (tablist, arrow keys, Home / End, one panel mounted); the Move panel is
   a Radix `Popover` (Escape, click-outside, focus return); the phone's nav sheet and move sheet are a
   Radix `Dialog` (scrim, focus trap, Escape). The triggers render as `CabinetBox`es. No new dependency.
4. **The view switch stays `activeHubTile`.** `ConsolePanel.tsx`'s `TILE_CONTENT` (`robots` /
   `audioRig` / `settings` / `companies`, `null` = Deck) remains the one place a branch maps to its
   content. Which entity is open stays `selectedRobotId` / `selectedCompanyId` / `allProbesSelected`.
   The panel's "which branch is expanded in place" is `expandedTopLevelBranch`. Fields that only served
   the tree — `expandedProbeId`, `expandedCompanyId`, `selectedFleetParamsEffect` — are retired (§1.10).
5. **The world is built before power-on and stands still until the rocker.** `WorldView` mounts in both
   power states; the mount effect that calls `initializeLocale` and consumes a `?session=` payload
   (`OceanScene.tsx:263`) runs on mount regardless of power. `powerController.start()` is unchanged:
   `AudioEngine.start()` then `reRegisterAllRobotsAudio` (`powerController.ts:18–21`), which already
   registers a world that was loaded before audio existed. Off, the world is a still frame: no robot
   lifecycle, no work loop, no LFOs; the hour's lighting only. Powering off keeps the world where it is
   (today `shutdown()` empties `actors`; §1.9 says what changes).
6. **A transmission preset is a `SessionPayload` constant**, three of them in
   `src/data/transmissionPresets.ts`, loaded through the same `applySessionPayload` the Save & Share
   list uses (`sessionDiff.ts:439`), with `skipLocaleRebuild: false` so the faint world retransmits.
   The payload type (`src/types/session.ts:50`) does not change. The three payloads ship as placeholders
   (a copy of today's defaults under three names) until Crawford curates them.
7. **One section mounted at a time** means Radix `Tabs` with no `forceMount`: an inactive section's
   controls, LFO link rows and help popovers do not exist in the DOM. The stores hold every value, so
   nothing is lost on switch; roadmap 17.2.2's lazy-mount is carried forward by construction.
8. **The tile glide is a GSAP Flip** (`gsap/Flip`, bundled with gsap 3, no new dependency): record the
   roster's tile rects, call `assignRobotToCompany`, let React re-render the rows, then `Flip.from` the
   recorded state. The timeline is registered in `timelineMap`; reduced motion skips it.
9. **Off-screen copy is placeholder** under new `home.off.*` content keys until Crawford writes it; the
   lore names the sketch draws that do not exist in `src/content/` today are placeholders too.

## 1. Overview & Claude Explanation

The sketch is the picture; this section is what it means in code. Read the sketch header's D1–D4 first:
option A (content covers a dimmed world), depth means something (out = act, flat = structure, in = read),
no hardware keys, build on the existing components.

### 1.1 Shell (`Tablet.tsx`, `SleeveContainer`, `ScreenViewport`, `Header`)

- `Tablet.tsx` keeps its composition — top `SleeveContainer` (power switch) · `ScreenViewport` · bottom
  `SleeveContainer`. The sleeve strips are the sketch's tactile strips and are already always present;
  the power corner is already part of the top strip. **Nothing new goes in a sleeve** (UI Shell guardrail).
- `ScreenViewport` renders `WorldView` in **both** power states. When powered on it renders the shell
  pieces as today (`Header`, `NavPanel`, `ContentPane`, `NavBreadcrumb`, and `NavToggleButton` on the
  phone shell only); when off it renders `OffScreen` (§1.9) over the dimmed world.
- `Header` becomes slim: the mute `Toggle` and the master-volume `SliderLinear` it already composes
  (`MUTE_SCHEMA` / `MASTER_VOLUME_SCHEMA`, `Header.tsx:57` and `:65`), in one cabinet row beside the
  power corner; its nav-clearance slide and the
  `HEADER_NAV_CLEARANCE_*` constants go (the panel never overlaps the header). On the phone shell the
  header holds mute and power only, and volume flies out of a ▾ box beside mute (a `Popover` with
  the slider). Crawford, 2026-10-09, chose "Volume box beside mute": mute stays one press.
- **Phone bottom bar** (new, `PhoneBar.tsx`): the menu `Button` (opens the nav sheet) and the breadcrumb
  or telemetry well. It owns its band: `ContentPane` scrolls between the top bar and the bottom bar, never
  under either. `NavToggleButton`'s floating hamburger is deleted; the bar is its replacement.
- **Material** (Crawford, 2026-10-09: "i still want the static cabinetry effect with the trait colors
  used … the new components should be styled to match the existing ones"): every panel, section frame
  and the nav panel keeps the **permanently popped, non-animating `CabinetBox` facade in its trait
  colour**, exactly as `NavPanel`, `DirectionalPanel` and `Header` draw it today (`popped` +
  `skipMountAnimation` + `autoHeight`). The one new flat surface is the content surface over the dimmed
  world (`--content-surface`, §1.3); readouts are wells (`--well-*`: inner top/left shadow, the existing
  glow-glass look). No faceplate or silkscreen tokens. New components — `SectionTabs` triggers, the
  roster rows and Move chip, the company column, `PhoneBar`, `HelpPopover` — are composed from
  `CabinetBox` and the existing control CSS so they read as the same family as what is there.

### 1.2 Nav (`NavPanel`, replaces `NavTree` / `NavTreeNode` / `NavCabinetRow` / `useNavTree`)

- One panel, five parent boxes (`CabinetBox` with lore + human from `nav.*` content), 124 px at rest. The
  Probes and Companies boxes expand **in place**: the panel widens to 200 px (a GSAP timeline on
  `width`, key `nav-panel-width`), the branch's entities list under the active box, and the content
  surface's left edge moves with it (`--nav-panel-width` custom property, read by `ContentPane`).
  Deck, Fleet Params and Settings are leaves and never change the panel's shape. **Amended
  2026-10-10 (Crawford, at Task 16):** the sketch's 96 / 260 px became 124 / 200 px, with a nav box's
  side padding cut to 4 px. Rest went to "about 20 px wider", 116, then 124 so that "TIMBRE & COLOR"
  and "UNITY & VARIETY" fit on one line. The wide boxes had had ~60 px of empty side space for
  56–99 px names. While a list is open the plate keeps 16 px on its right, so the boxes clear the
  list's scrollbar by 12 px.
- **Collapse** (Crawford, 2026-10-09, "back, then collapse"): the list shows while
  `expandedTopLevelBranch` is the open branch. Pressing the open Probes / Companies box on an entity
  goes back to the branch's page with the list open (picking a parent clears the entity); on the
  branch's own page it collapses the list, and pressing it again reopens it. A collapse changes
  nothing but the list. `navActions.pressBranchBox` holds this; `selectBranch` never toggles.
- **An entity pick collapses the list** (Crawford, 2026-10-10: "collapse the nav when a probe or
  company is selected"): `selectEntity` (a robot, a company, or All Probes, from the list, the
  breadcrumb or the world) opens its branch at the panel's rest width, so the entity's screen gets
  the room. The parent box brings the list back. An accordion opened on a screen no longer writes the
  nav (the tree-era `expandNavAncestorsForId` is gone), so it cannot reopen the list.
- Entities: Probes = "All Probes" then the twelve robots (identity colour per box); Companies =
  "+ New Company" then each company (company colour). Picking an entity sets `selectedRobotId` /
  `selectedCompanyId` / `allProbesSelected` and `activeHubTile`; picking a parent sets `activeHubTile`
  and `expandedTopLevelBranch`.
- The nav tree's four-level ARIA tree, `NAV_TREE_CONFIG` / `NAV_TREE_SCHEMA` (`navTreeConfig.ts`),
  `useNavTree`, `isAutoExpandTier`, `useNavPanelSlideAway`, `NavStatusBlock` and `NavToggleButton` are
  deleted. The panel is a `role="navigation"` list of buttons; the expanded entity list is a nested
  list. Sections live only in the content's tab row (§1.3).
- **Phone:** the same panel renders inside a Radix `Dialog` sheet (300 px, left edge, scrim) opened by
  the bottom bar's menu button; picking closes it. `isNavPanelOpen` is the sheet's open flag.
- **Breadcrumb** (`NavBreadcrumb`): keeps its job, restyled as a well; reads `Root / <branch> /
  <entity> / <section>` from the store fields above instead of `useNavTree().selectedPath`.

### 1.3 Content surface and section tabs (`ContentPane`, `ConsolePanel`, `SectionTabs`)

- `ContentPane` is an **opaque content surface** (`--content-surface`) filling the area right of the
  panel and between the strips; the world dims under it (`WorldView` gets `data-dimmed` → `filter: brightness(.42)
  blur(2px)` on the static layers, the sketch's values). `ConsolePanel.css`'s header / nav clearances
  and `.console-panel__content`'s translucent glass are removed. The Deck (`activeHubTile === null`)
  renders no content surface: the world stays bright and the meta box is the only overlay (§1.7).
- **One collapsible intro per screen**: a single `AccordionContainer` + `IntroPanel` row at the top of
  each branch's content (today's `home.root` welcome stays the Deck's). The second stacked intro panel
  per section is removed.
- **`SectionTabs`** (new, `src/components/ui/controls/SectionTabs.tsx`, a `ControlSchema` consumer):
  Radix `Tabs.Root` whose `Tabs.Trigger`s are `CabinetBox`es (popped = active, trait colour from the
  section's `trait`), with an optional second row of sub-tabs. Fleet Params tabs are the five
  `FleetParamsGroup`s (Pacing, LFO Bank, EQ & Filters, Time & Space, Output) with sub-tabs for the four
  lanes and the EQ / HPF / LPF, Reverb / Delay, Compressor / Limiter leaves; the robot and company
  screens' tabs are `ROBOT_SECTIONS_CONFIG` (Levels, Composition, Envelope, Source) with sub-tabs from
  its subsections. Settings' tabs are the three `SettingsLeaf`s.
- Retired with the stacked scroll: `useAccordionOpenState`, `useSectionObserver`,
  `RobotSectionAccordionStack`, `src/utils/accordionSync.ts`, `src/utils/sectionRefs.ts`,
  `src/utils/viewFade.ts`'s scroll-fade, and every `openAccordionFromNav` /
  `expandNavAncestorsForId` / `scrollToSection` call in `FleetParamsContent`, `SettingsContent`,
  `ProbesContent`, `CompaniesContent`, `RobotOptionsTab`, `CompanyOptionsSection`, `AudioLoadPanel`,
  `SectorSettingsDrawer`. The section components themselves (`AudioRigEffectPanel`,
  `LfoBankLanePanel`, `AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`,
  `SignatureArrayDrawer`, `AudioLoadPanel`, `SectorSettingsDrawer`, `SessionsPanel`) are kept and
  rendered as tab panels.

### 1.4 Fleet Params and the robot screen

- **Single-line radios:** `RadioButton` loses its two-line (lore over human) option face; each option is
  one line of the human label, and the lore name moves into the control's help popover. This is the
  Component Library's `RadioButton` rendering, changed once for every consumer (Shape, Anchoring,
  Audio Mode, the preset radio, company assignment).
- **Help popover** (new, `HelpPopover.tsx`): a focusable "?" on a control's label opens a well with the
  human description, the lore name and the lore description — `ControlSchema` gains an optional
  `help?: { human: string; lore: string }` filled from the content entry. **Every control whose content
  entry has a description gets it**; where a control's entry lacks a description, the implementer writes
  one in the human voice of `docs/reference/copy-tone-guide.md`, at the general length of the existing
  ones, in the same content file (Crawford, 2026-10-09). Closes backlog item 4.
- **Lane titles:** the four LFO Bank sub-tabs and lane panels read "Core LFO (LFO A)" … on the desk
  shell and "LFO A" … on the phone shell. The content entries `fleet.lfoBank.laneA–D` gain a `short`
  form (`LFO A`); a `laneTitle(lane, shell)` helper in `src/data/lfoConfig.ts` composes them. **Full
  lane names appear wherever the desk shell has room**; the letter form is the phone's.
- **Compact `LfoLink`:** the lane row becomes a single-line `RadioButton` (Off · Core LFO (A) · … on
  desk; Off · A · B · C · D on phone) plus a short depth `VoxelTrack`, in place of the five-box
  two-line picker. Same `LfoLink` value shape, same `onChange`. **Amended 2026-10-10 (Crawford, at
  Task 14):**
  - **App sizes, wrap.** At the app's control sizes (tier boxes, the 44 px touch floor), the sketch's
    one-row link would need ~543 px in a 343 px phone pane, and ~1,100 px on desk with full names. So
    the lane row and the 8-box strip share a line only where both fit, and the strip wraps under the
    lanes where they do not.
  - **Lane + Depth label rows kept.** Each half keeps its own label row and "?", not the sketch's single
    "Signature Lane · Gain Link" row.
- **Robot screen** (`RobotOptionsTab` → `RobotScreen.tsx`): a fixed **avatar column** (400 px: the gem
  via the existing avatar render context, name, the read-only meta of `RobotDisplaySection` — job,
  docking, phase, emission — as wells in two columns, the battery `VoxelTrack` read-only, and the
  company `RadioButton` from `buildCompanyAssignmentSchema`) beside the scrolling controls column with
  `SectionTabs`. On the phone the avatar is a **sticky band in its small form** (72 × 58 gem, name,
  one status line); the expanded band is rejected. Voxel rows run edge to edge on the phone.
  **Amended 2026-10-10 (Crawford, at Task 16): "the robot detail page at 1024 needs to reserve more
  space for the right column with the attributes".**
  - The controls get first claim on 560 px.
  - The column takes the rest, between 200 px and the sketch's 400: 203 px at 1024 px, 400 px from
    about 1160 px.
  - The meta wells sit two to a row where the column has room for two 120 px wells, and one to a row
    where it does not.

### 1.5 Roster board (`RosterBoard.tsx`, replaces `ProbesContent` + `RobotsTab` and `CompaniesContent`)

- One row per group, `MAX_COMPANIES` (6) companies plus Freelance at most: the leading cell is the
  company's name `CabinetBox` (company colour; Freelance in the companies trait colour, frame style)
  and its count; the members follow as **row-tiles** (`RosterTile.tsx`: the gem, name, one status line
  from `AudioStatusBadge`'s state + the job, a thin battery `VoxelTrack`), flowing right and wrapping.
  The phone lists the same rows in one column and scrolls.
- The head holds "All Probes — edit the whole fleet" (sets `allProbesSelected`, opens the Company detail
  in its All form) and "+ New company" (opens `CompanyCreateForm`'s staged draft inline). **No filter**:
  `filterRobotsByCompanyFocus` (`robotListFilter.ts`) and the filter UI are deleted.
- A company's name box opens its Company detail. Headers carry no Edit / Rename / Delete.
- **Reassignment:** each tile has a "⇄ Move" chip (`CabinetBox`, 22 px, frame style) — on the desk
  shell visible on hover and on keyboard focus only (`:hover`, `:focus-within`); on the phone a small
  always-on glyph, with a 500 ms press on the tile as a shortcut. The chip is a Radix `Popover.Trigger`
  (desk) or `Dialog.Trigger` (phone) opening the company `RadioButton` from
  `buildCompanyAssignmentSchema`, labelled "Move <name> to". Picking calls
  `assignRobotToCompany(localeId, robotId, companyId | null)` — the one store transition the app
  already has — closes the popover, and the tile glides to its new row (Assumption 8); group counts
  update with the store. The chip is a nested interactive element on a clickable tile, so it stops
  propagation exactly as `RobotSelectionCard`'s company row does today.
- `RobotSelectionCard` and `robotSelectionConfig.ts` are deleted with the list (the status badge
  survives as the tile's status line).

### 1.6 Company detail (`CompanyScreen.tsx`, new)

- The robot screen with the column swapped. **Company column:** the name as a popped `CabinetBox` in
  `Company.color`, the member count and share ("4 of 12 probes"), the members as small gem tiles that
  select that robot, a well stating once that edits reach every member as a broadcast and never a link
  (content key `company.broadcastNote`, `fill`ed with the count), and `CompanyRenameDeleteForm`
  (Rename staged draft + Delete) at the bottom.
- **Controls column:** `SectionTabs` over `ROBOT_SECTIONS_CONFIG`, rendering exactly the four sections
  `CompanyOptionsSection` renders today (`AudioSettingSection`, `PingControlsDrawer`,
  `PingContourDrawer`, `SignatureArrayDrawer`) with their `value` / `onChange` / `disabled` contract,
  values from `resolveCompanyOptions`, each change broadcast through `robotOptionsActions` once per
  member (COMPANIES.md "Broadcast, Not Link"; unchanged).
- **All form** (`allProbesSelected`): the same screen for the whole fleet — "All Probes", twelve tiles,
  no colour (the deck trait colour), no Rename / Delete, no halo.
- Reached from the nav's Companies entity, the roster's company header, and "All Probes".

### 1.7 Deck: meta box and halos (`WorldView`, `OceanScene`, `Robot.tsx`)

- Robots carry no text box in the world. The **meta box** (the existing glow-glass well bottom-left,
  `WorldView`) reads the world line, plus a selected robot's line (name · job · state) and / or a
  selected company's line (name · count), the latest selection on top. In the phone's 56 px bottom bar
  only the latest selection's line shows; tapping the bar cycles to the other (Crawford, 2026-10-09).
- Selection is a **halo only**: `.robot.selected` uses `--halo: <identityColor>`,
  `.robot.isCompanyMember` uses `--halo: <Company.color>` (Assumption 2). "All Probes" halos nothing
  (`isCompanyMember` is already false for everyone under All). Phase 41's mysterious-light halo is a
  different element and is untouched.

### 1.8 Settings (`SettingsContent` → `SettingsScreen.tsx`)

- `SectionTabs` over the three `SettingsLeaf`s with the content layer's titles — Audio Quality
  (`settings.quality`: the preset `RadioButton`, Voice Limit and Effects Limit sliders, the limits
  readout as a well), Seeds (`settings.seeds`: Attenuation Style, `CoordsInput`, Retransmit / Share),
  Save & Share (`settings.sessions`: name `TextInput`, Save, Share live, the `SessionListItem` rows).
  The panels are today's `AudioLoadPanel`, `SectorSettingsDrawer`, `SessionsPanel`, unchanged inside —
  except Save & Share. **Amended 2026-10-10** (Crawford: "I thought the save/load session buttons would
  get a once over"; then "Save & Share only" and "the sketch's copy"):
  - **Layout:** Save & Share takes the sketch's layout. The name, Save Session and Share live sit in
    one row. A Saved Sessions label row (lore Stored Traces) sits over one-line rows: name · time ·
    Load · Share · Delete, with a divider under each. A Factory Reset label row sits over a full-width
    Reset to Factory Settings.
  - **Button faces:** the panel's buttons use `Button`'s opt-in single-line face (`face="single"`).
    Every other Button keeps lore over human until Checkpoint B decides.
  - **Accessible names:** a row's buttons keep their session in their accessible name (`accessibleName`).
  - **Copy:** `session.shareLive` "Share live" is the live share, `session.share` "Share" a row's.
    `session.clearStorage` is the label row and `session.clearStorage.action` the button.
  - **Dialogs:** both confirm dialogs portal into `#screen-viewport` (the UI Shell guardrail).

### 1.9 Off screen (`OffScreen.tsx`, new; `powerController`)

- Rendered by `ScreenViewport` when `!isPoweredOn`, over the dimmed still world: the etched label
  (`home.off.label`), the line that says pressing power will play sound (`home.off.powerHint`; backlog
  item 2), and one picker row, **Transmission**: the three presets (`transmissionPresets.ts`), a
  divider, then the user's saves from `listSessions()` if any. A well under the row names the pick.
- **Nothing on the off screen pops.** The picker is a `RadioButton` in a new `muted` rendering: the
  selected option has a monochrome fill in the box's own shape and size, no walls, no glow (the sketch's
  `.cab.sel`). The option is a `RadioButton` prop (`appearance: 'cabinet' | 'muted'`), not a new
  primitive.
- Picking retransmits the faint world silently: `applySessionPayload(payload)` (preset) or
  `applySessionPayload(loadSession(name))` (save) with no `AudioEngine` call. `initializeLocale` and
  `retransmitWorld` must therefore run with the audio context absent — Assumption 5; the plan verifies
  `spawnSystem`'s registration guards before sub-phase 4 starts.
- **`initializeLocale` is split in two** (found at plan time, 2026-10-09): today it builds the world
  (`placeDistrict`, `spawnInitialRoster`, `spawnInitialCompanies`) **and** starts its systems
  (`startRobotLifecycle`, `startWorkLoop`, `startAudioSwells`, `worldTransition.ts:111–118`), so a
  world built before power-on would start ticking. The build half runs on `WorldView`'s mount and on
  every retransmit as now; the start half moves behind a flag (`initializeLocale(localeId, {
  startSystems })`) that `powerController.powerOnSequence()` turns on and a powered-off boot or
  retransmit leaves off. Powered on, a retransmit still does both. This is the one `src/systems/`
  change beyond `powerController.ts` the scope rule (§3) allows.
- `powerController.shutdown()` stops lifecycle, work loop and audio as today but **no longer empties
  `actors`**: the world stays as the off screen's backdrop. `powerOnSequence()` additionally starts the
  locale's systems for a world that was built while off.
- The Theme row is not built (intent, out of scope). The sketch keeps it behind an option for the themes
  phase, under the same no-pop rule.

### 1.10 Store model (`uiStore.ts`)

| Field | Fate |
|---|---|
| `activeHubTile`, `selectedRobotId`, `selectedCompanyId`, `allRobotsSelected`, `allProbesSelected`, `expandedTopLevelBranch`, `selectedSection`, `selectedSubsection`, `selectedSettingsLeaf`, `isPoweredOn`, `isNavPanelOpen` | kept (`isNavPanelOpen` = the phone nav sheet) |
| `fleetParamsSection: FleetParamsGroup` (new), `fleetParamsSubsection: SelectedFleetParamsEffect \| null` (new) | the Fleet Params tab and sub-tab |
| `movePanelRobotId: string \| null` (new) | which tile's Move popover / sheet is open |
| `expandedProbeId`, `expandedCompanyId`, `selectedFleetParamsEffect`, `selectedSettingsSubsection` | retired with the tree and the stacked scroll |

Everything stays JSON-serialisable; no timeline, ref or element enters the store.

### 1.11 What is deleted, what does not change

- **Deleted:** `NavTree`, `NavTreeNode`, `NavCabinetRow`, `NavStatusBlock`, `NavToggleButton`,
  `useNavTree`, `useNavPanelSlideAway`, `navTreeConfig.ts`, `RobotSectionAccordionStack`,
  `useAccordionOpenState`, `useSectionObserver`, `accordionSync.ts`, `sectionRefs.ts`,
  `RobotsTab`, `RobotSelectionCard`, `robotSelectionConfig.ts`, `robotListFilter.ts`,
  `ProbesContent`, `CompaniesContent`, `FleetParamsContent`, `SettingsContent` (their section
  components survive as tab panels), `AccordionContainer`'s nav-sync props. Each deletion takes its
  tests and CSS with it. Nothing stays behind a flag.
- **Unchanged:** every store below `uiStore` (`localeStore`, `audioStore`, `sessionStore`), the
  session payload and `sessionShareUtils`, `AudioEngine` and everything in `src/engine/`,
  `src/systems/` except the two `powerController` lines in §1.9, the world renderers except the halo
  colour, the 14 control primitives' behaviour (only `RadioButton`'s face and `LfoLink`'s composition
  change), the content layer's helpers.

**Verified against the code.** (a) The intent's "1024 px tier" is not in the code; see Assumption 1.
(b) COMPANIES.md still describes a `CompanyManager` / `CompanyButtonRow`; both were deleted by the
Nav & Layout Rewrite (UI_SHELL.md records it) — the doc is corrected in the docs task. (c) The
company colour the sketch assumed is real (`Company.color`). (d) The halo today is one fixed cyan for
both robot and company selection; the sketch's per-colour halo is a change (§1.7). (e) Radix Tabs and
Popover are installed but unused; Dialog has one user, `PowerRockerSwitch.tsx`, which is untouched —
the sheets are new `Dialog` instances. (f) `CompanyCreateForm` and `CompanyRenameDeleteForm` are
exports of `CompanyCrudControls.tsx`, not files of their own. (g) `gsap` is 3.14 and `gsap/Flip.js` is
present in `node_modules`, so the glide needs no new dependency. (h) The intent said no 1024 px tier
exists; three `64em` queries do (Header.css, RobotDisplaySection.css) — Crawford confirmed they are not
required by the rewrite. (i) `initializeLocale` (`worldTransition.ts:101–118`) starts the robot
lifecycle, the work loop and the audio swells as well as building the world; Assumption 5's "still
world" therefore needs the build/start split in §1.9, not just a mount-order change.

## 2. Target File Structure

```
src/components/panels/physical/ScreenViewport.tsx     CHANGED — WorldView in both power states; OffScreen when off
src/components/panels/screen/Header.tsx / .css         CHANGED — slim; nav-clearance slide removed
src/components/panels/screen/PhoneBar.tsx / .css       NEW — phone bottom bar (menu + breadcrumb/telemetry well)
src/components/panels/screen/nav/NavPanel.tsx / .css   CHANGED — one panel, five boxes, expands in place; phone sheet
src/components/panels/screen/nav/NavBreadcrumb.tsx     CHANGED — reads the store fields, rendered as a well
src/components/panels/screen/nav/NavEntityList.tsx     NEW — the Probes / Companies entity list under the active box
src/components/panels/screen/console/ContentPane.tsx   CHANGED — opaque content surface, offset by --nav-panel-width
src/components/panels/screen/console/ConsolePanel.tsx  CHANGED — TILE_CONTENT routes to the four screens below
src/components/panels/screen/screens/FleetParamsScreen.tsx   NEW — intro + SectionTabs over the five groups
src/components/panels/screen/screens/RobotScreen.tsx         NEW — avatar column + SectionTabs (from RobotOptionsTab)
src/components/panels/screen/screens/CompanyScreen.tsx       NEW — company column + the same SectionTabs
src/components/panels/screen/screens/RosterBoard.tsx         NEW — rows per group, head, Move chip
src/components/panels/screen/screens/RosterTile.tsx          NEW — row-tile + Move popover / sheet
src/components/panels/screen/screens/SettingsScreen.tsx      NEW — SectionTabs over the three leaves
src/components/panels/screen/screens/OffScreen.tsx           NEW — label, power hint, Transmission picker
src/components/ui/controls/SectionTabs.tsx / .css      NEW — Radix Tabs with CabinetBox triggers (ControlSchema consumer)
src/components/ui/controls/HelpPopover.tsx / .css      NEW — the "?" well on a control label
src/components/ui/controls/RadioButton.tsx / .css      CHANGED — single-line options; `appearance: 'muted'`
src/components/ui/controls/LfoLink.tsx / .css          CHANGED — single-line lane row + short depth strip
src/components/ui/controls/CabinetBox.tsx              UNCHANGED (reused everywhere)
src/components/robot/Robot.tsx, worldView/OceanScene.css   CHANGED — --halo per robot / company
src/components/panels/screen/worldView/WorldView.tsx   CHANGED — meta box lines; data-dimmed
src/stores/uiStore.ts                                   CHANGED — §1.10
src/systems/powerController.ts                          CHANGED — shutdown keeps actors; powerOnSequence starts the locale's systems
src/systems/worldTransition.ts                          CHANGED — initializeLocale split: build the world vs start its systems (§1.9)
src/data/transmissionPresets.ts                         NEW — three SessionPayload constants
src/data/lfoConfig.ts                                   CHANGED — laneTitle(lane, shell)
src/data/companyConfig.ts                               UNCHANGED — buildCompanyAssignmentSchema reused
src/types/controls.ts                                   CHANGED — ControlSchema.help?, RadioButtonSchema.appearance?
src/content/copy/nav.ts, probe.ts, company.ts, home.ts, fleet.ts   CHANGED — new keys (§4), lane `short` forms
src/index.css                                           CHANGED — --content-surface, --well-* tokens; the 40em/48em/64em Header queries leave with Header.css
docs/UI_SHELL.md, COMPONENT_LIBRARY.md, COMPANIES.md, SESSION_STORAGE.md, ANIMATION_SYSTEM.md, todo/roadmap.md, todo/backlog.md   CHANGED (docs task)
```

Deleted files: §1.11. Tests are colocated with every new or changed file.

## 3. Implementation Boundaries & Constraints

- **Strict scope:** touch only the files above (and the deletions in §1.11). Anything in `src/engine/`,
  `src/systems/` beyond `powerController.ts` and the one `worldTransition.ts` change named in §1.9,
  `src/types/session.ts`, `sessionShareUtils.ts` or `sessionDiff.ts` is off limits — a need to touch
  one is a spec change, not a task.
- **UI only.** The session payload, the share link's wire format and the audio path do not change.
  Every existing save and `?session=` link must load as before (a parity test, §5).
- **No new dependency.** Radix Tabs / Popover / Dialog and gsap's Flip are already installed.
- **Build on the existing components.** No new widget set: the 14 primitives, `CabinetBox`,
  `ControlSchema`, `RadioButton` for every company pick, the section components as they are. Sliders
  keep their pop-out boxes; nav boxes are cabinetry; gem material never touches UI.
- **Depth means something, as amended 2026-10-09.** Interactive things are animated cabinetry
  (`CabinetBox`, pop and glow on act); panels and frames keep today's static popped facade in their
  trait colour; the content surface over the world is the one flat plate; readouts are wells. The gem
  material never touches UI.
- **Zero hardcoded strings:** every label, lore name, hint and intro comes from `src/content/` via
  `labels` / `options` / `intro` / `introProps` / `fill` (CONTENT_LAYER.md; the ESLint rule and
  `content.test.ts` enforce it). New keys are added one entry per concept.
- **State stays JSON-serialisable.** Timelines live in `timelineMap`; refs in the ref registry; no
  element or timeline in `uiStore`.
- **Animation is GSAP** (panel widen, tile glide, sheets) with `prefers-reduced-motion` honoured as
  `Header` and `NavPanel` honour it today; a timeline only triggers semantic state, never audio.
- **Controls hold their largest content size:** a box whose label flips (mute, the Move chip, the
  intro's +/−) is sized for its largest label.
- **Accessibility:** tabs are a Radix tablist; the Move chip is reachable by keyboard (visible on
  `:focus-within`); popovers and sheets trap focus and close on Escape; every `CabinetBox` keeps its
  accessible name (`accessibleName.ts`); touch targets stay ≥ `--touch-target-size` on the phone shell.
- **Protected paths:** never modify `.env*`, `node_modules/`, `public/` build assets.

## 4. Code Style & Architecture Conventions

```typescript
// SectionTabs: a ControlSchema consumer over Radix Tabs; triggers are CabinetBoxes, one panel mounted.
import * as Tabs from '@radix-ui/react-tabs';
import { CabinetBox } from '@/components/ui/controls/CabinetBox';
import { labels } from '@/content';
import type { Trait } from '@/types/traits';
import './SectionTabs.css';

export interface SectionTabItem<Id extends string> {
  id: Id;
  content: ContentKey;   // one entry per section: human + lore labels
  trait: Trait;          // the popped trigger's accent
  render: () => ReactNode;
}

interface SectionTabsProps<Id extends string> {
  items: readonly SectionTabItem<Id>[];
  value: Id;
  onValueChange: (id: Id) => void;
}

export function SectionTabs<Id extends string>({ items, value, onValueChange }: SectionTabsProps<Id>) {
  return (
    <Tabs.Root value={value} onValueChange={(v) => onValueChange(v as Id)} className="section-tabs">
      <Tabs.List className="section-tabs__list">
        {items.map((item) => (
          <Tabs.Trigger key={item.id} value={item.id} asChild>
            <span className="section-tabs__trigger" style={getTraitColorStyle(item.trait)}>
              <CabinetBox popped={item.id === value} timelineKey={`section-tab-${item.id}`} autoHeight>
                {labels(item.content).humanLabel}
              </CabinetBox>
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {items.map((item) => (
        <Tabs.Content key={item.id} value={item.id} className="section-tabs__panel">
          {item.id === value ? item.render() : null}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
```

- **Naming:** components PascalCase (`RosterBoard.tsx`), data configs camelCase
  (`transmissionPresets.ts`), types PascalCase. Screens live in `panels/screen/screens/`; primitives in
  `ui/controls/`.
- **Formatting:** plain named function exports, explicit prop interfaces, co-located plain CSS per
  component, CSS custom properties for every size that the sketch fixed by eye (`--nav-panel-rest:
  96px`, `--nav-panel-wide: 260px`, `--roster-tile-width: 250px`, `--avatar-column-width: 400px`,
  `--move-chip-height: 22px`), never a magic number in JSX.
- **Content keys to add** (one entry per concept, `human` + `lore`, descriptions where the help popover
  shows them): `nav.panel.*` (the five boxes keep `nav.*`), `nav.entity.allProbes`,
  `nav.entity.newCompany`; `probe.roster.*` (head, group count, status line, move chip, move title);
  `company.detail.*` (share, signal, broadcastNote, allForm); `home.off.label`,
  `home.off.powerHint`, `home.off.transmission`, `home.off.presets.{1,2,3}`; `fleet.lfoBank.laneA–D`
  gain `short`; `ui.help` (the "?" accessible name). `settings.*` titles are already right.
- **Memo boundaries:** screens follow COMPONENT_LIBRARY.md's `React.memo` rule for the primitives they
  compose; the roster subscribes to a narrow `{ id, name, companyId, identityColor }` roster slice, not
  full `Robot` objects (the re-render discipline `RobotsTab` already has, backlog item 27).

## 5. Testing & Verification Requirements

- **Framework:** Vitest + React Testing Library; tests colocated; CSS contracts tested the way
  `DualLabel.css.test.ts` and `LfoLink.css.test.ts` do (parse the stylesheet, assert the rule).
- **Per sub-phase, before its checkpoint:** `npm run build:types`, `npm run lint`, `npm test`,
  `npm run build` all clean; the content test green with the new keys.
- **Unit coverage that must exist:**
  - `uiStore`: the new fields and the retired ones gone; `expandedTopLevelBranch` + entity selection
    produce the breadcrumb path.
  - `NavPanel`: five boxes; Probes / Companies widen and list entities; leaves don't; the phone sheet
    opens from the bar and closes on pick; keyboard order.
  - `SectionTabs`: one panel mounted at a time (the inactive section's controls are absent from the
    DOM); arrow-key movement; the active trigger is the popped `CabinetBox`.
  - `RadioButton`: single-line face; `appearance: 'muted'` renders no cabinet walls and no glow.
  - `LfoLink`: desk shell shows full lane names, phone shell letters; value round-trips unchanged.
  - `laneTitle`: "Core LFO (LFO A)" on desk, "LFO A" on phone, for all four lanes.
  - `RosterBoard`: rows per group with Freelance last; six companies + Freelance = seven rows; counts;
    no filter; the Move chip hidden until hover / focus on desk, always on phone; picking calls
    `assignRobotToCompany` once with the right ids and closes the popover; the tile ends up in the new
    row; reduced motion skips the Flip.
  - `CompanyScreen`: the four sections render from `resolveCompanyOptions`; a change broadcasts to every
    member; the All form has no Rename / Delete and no colour; the broadcast note shows the count.
  - Halo: `.robot.selected` carries the robot's identity colour, `.isCompanyMember` the company's; All
    halos nothing.
  - `OffScreen`: renders only when off; three presets then saves; nothing has the popped class; a pick
    calls `applySessionPayload` and never `AudioEngine.start`; `WorldView` is mounted while off.
  - `powerController.shutdown` keeps `actors`.
  - **Parity:** a saved session and a `?session=` link captured on `main` load to the same
    `buildSessionPayload()` on the branch (fixtures seeded with non-default values).
- **Sketch harness:** `node docs/sketches/tools/smoke-layout-rework.cjs` stays green whenever the
  sketch is edited during the build (it is the design record, not app coverage).
- **Success check (Crawford):** the original twelve desktop and six phone screenshots retaken on the
  finished branch, every complaint in the intent's problem statement gone; the phone shell also checked
  at 320 px wide. No listening check.
- **Perf gate:** the idle-paint harness against `main` on the pinned `?session=` world, in the Phase 44
  gate's shape; idle busy and paint within the noise band. The off screen is measured too (the still
  world must not cost a frame loop).
- **Manual a11y pass per sub-phase:** keyboard-only walk of the panel, the tabs, the Move popover and
  the phone sheets; reduced-motion on.

## 6. Git & Workflow Context

- **Branch:** `feature/layout-rework`, forked from `feature/world-gem` at `ced07eb5` on 2026-10-09
  (Crawford: "let's do it now"). Phase 44 is unmerged beneath it (PR pending); when it merges, the
  layout branch takes `main` (merge or rebase, Crawford's call at the time). The intent, this spec and
  the sketch's power-off and material amendments are the branch's first commit.
- **One branch, four sub-phases, merged once.** Each sub-phase gets its own task block in
  `docs/tasks/LAYOUT_REWORK.md` (TDD, one commit per task, mutation-check gates, stop and report at the
  gates) and ends in a Crawford checkpoint on the dev server before the next starts. The app is not
  expected to ship between sub-phases.
- **Order:** (1) shell + nav, existing screens dropped in; (2) section tabs, Fleet Params and robot
  screen, stacked scroll retired; (3) roster board + Company detail; (4) off screen.
- **Commits:** the human operator reviews; the agent commits one task at a time with the repo's
  attribution line, never amends, never skips hooks.
- **Docs when it ships:** UI_SHELL.md rewritten for the shell; COMPONENT_LIBRARY.md for `SectionTabs`,
  `HelpPopover`, `RadioButton`'s face and `appearance`, `LfoLink`'s composition; COMPANIES.md for where
  reassignment and the bulk edit live (and the stale `CompanyManager` paragraph); SESSION_STORAGE.md
  for presets; ANIMATION_SYSTEM.md for the new timelines; the roadmap entry (Phase 45); backlog items 2
  and 4 archived.

## 7. Open Questions — all resolved (Crawford, 2026-10-09)

1. **Branch base** — "let's do it now": `feature/layout-rework` forks from `feature/world-gem` at
   `ced07eb5` today; Phase 44 merges beneath it and the branch takes `main` when it does (§6).
2. **The 640–767 band** — the phone shell ("let's stick with phone"). Assumption 1 stands.
3. **Phone meta box with both a robot and a company selected** — latest selection only in the 56 px bar,
   the other reachable by tapping the bar (§1.7).
4. **Preset storage** — three `SessionPayload` constants in `src/data/transmissionPresets.ts`, names as
   content keys (Assumption 6 stands).
5. **The still world while off** — still: no lifecycle, no work loop, hour lighting only (Assumption 5
   stands).
6. **`activeHubTile` survives as the view switch** — "it's fine" (Assumption 4 stands).
7. **Help popover scope** — every control whose content entry has a description. Where a control lacks
   one, the implementer writes it in the human voice of
   [docs/reference/copy-tone-guide.md](../reference/copy-tone-guide.md), matching the general length of
   the existing descriptions (§1.4).
