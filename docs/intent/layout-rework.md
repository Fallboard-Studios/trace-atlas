# Intent: Layout Rework

> **Intent confirmed 2026-10-09.** Sketch
> [docs/sketches/layout-rework.html](../sketches/layout-rework.html) — every view tab approved, its header
> comment is the running record (D1–D4, Q1–Q11 with verdicts, the per-view entries and their amendments).
> Headless render check: `node docs/sketches/tools/smoke-layout-rework.cjs` from the repo root (must end
> `bad = 0`). Sibling records: `layout-rework-option-b.html` (option B, not chosen), `gem-controls.html`
> (gem containers and controls, tried and rejected), `punch-card-session.html` (the Atlas card, parked for
> v2), `docs/ideas/themes.md` (a later phase). Where this file and the sketch header differ, this file wins.
> **Built 2026-10-09 to 2026-10-10** on `feature/layout-rework`; roadmap entry: [Phase 45](../todo/roadmap.md#45-layout-rework-shell-nav-section-tabs-roster-off-screen).
> Task 30 (Crawford's screenshot check) is still owed.

Confirmed via `interview-me` on 2026-10-09, ahead of a `spec-driven-development` pass.

## Outcome

The app's shell and every screen are rebuilt to the approved sketch: the tablet's two tactile strips and a
slim header, one nav panel on the left edge that expands in place, content on an opaque surface over the
dimmed world, section tabs with single-line radios on Fleet Params and the robot screen, the Probes list and
Companies index merged into one roster board (a row per company plus a Freelance row, with a quiet Move
chip), a Company detail screen that is the robot screen with a company column, and a powered-off screen
that explains itself and carries a Transmission picker. Nothing below the UI changes: the session payload,
the share link and the audio path are untouched.

The problem it solves (Crawford, 2026-10-08, from twelve desktop and six phone screenshots): the off screen
says nothing about what the switch does; the header and the permanently docked nav crowd every screen; the
world shows through a 75 % glass under every control; the same information is stated three times per
screen (nav tree depth, accordion headers, two stacked intro panels); every radio option is a two-line
cabinet box; the Probes list is twelve identical cards that are mostly company radios; the robot detail's
avatar is a fixed background with viewport-unit margins; on phones the fixed header hides scrolled content
and the hamburger floats mid-screen.

## Behavior

**Shell (every tier, every screen)**

- Two tactile strips run along the top and bottom of the screen at all times (`Tablet.tsx`'s sleeve strips,
  12 px and 32 px), and the power corner is part of the top strip. The phone keeps its power switch, with
  the light in the button.
- The header is slim: mute with a small volume strip beside the power corner. On the phone the top holds
  mute and power only; a bottom bar holds the menu and the breadcrumb or telemetry, and the header owns its
  band so content never scrolls under it.
- **Option A:** content covers the world, which dims under an opaque surface. The only exception is the
  Deck, where the world stays bright and the one overlay is the meta box, a glow-glass well bottom-left.
- **Depth means something** (D2, amended 2026-10-09 at spec review): animated cabinetry only on things
  you act on (sliders, toggles, buttons, radios, nav boxes, tabs); panels, section frames and the nav panel
  keep today's permanently popped, non-animating cabinetry facade in their trait colour ("i still want the
  static cabinetry effect with the trait colors used"); the content surface over the dimmed world and the
  labels are the flat parts; value readouts, telemetry, the breadcrumb and the help popover are recessed
  wells. New components are styled to match the existing ones. The gem material stays on the world and the
  robots, never on UI.
- No hardware key beyond the power rocker (D3).

**Nav**

- One panel: five parent boxes (Deck, Fleet Params, Probes, Companies, Settings) in a 96 px side panel.
  Probes and Companies expand in place — the panel widens to 260 px, the branch's entities list under the
  active box, content shifts right. Deck, Fleet Params and Settings are leaves and never change shape.
- The nav tree is cut to branch + entity. Sections live only in the content's tab row. The Probes branch
  lists "All Probes" then the twelve robots; the Companies branch lists "+ New Company" then each company.
- The phone's menu opens the same panel as a sheet over a scrim; picking closes it.

**Fleet Params and the robot screen**

- Sections are a tab row, **one section mounted at a time**, with sub-tabs where a section has lanes or
  layers (the four LFO lanes; Core / Companion / Accent oscillators). This reverses the 2026-09-24
  stacked-scroll call and retires accordionSync, scrollspy and the section refs.
- One collapsible intro per screen, not two stacked panels.
- Radio options are single-line; the lore name moves into the control's help popover (which also closes
  backlog item 4).
- LFO lane titles carry their letter — "Core LFO (LFO A)" … "Overtone LFO (LFO D)" — and on desktop the
  full lane name is shown wherever possible. The letter form ("LFO A", and a letter row in LfoLink) is the
  phone form.
- The LfoLink is compact: a single-line lane row (full names on desktop, letters on the phone) plus a short
  depth strip, in place of the five-box two-line picker.
- Robot detail: a fixed avatar column (big gem, meta as wells in two columns, battery, the company radio)
  beside a scrolling controls column with the same tab row as Fleet Params. On the phone the sticky avatar
  band is the **small** form; the expanded band is rejected.

**Roster board (replaces the Probes list and the Companies index)**

- One row per group: the company's name box and member count as a leading cell, the members as compact
  row-tiles (gem, name, one status line, battery strip) flowing right and wrapping if a company is large.
  Freelance is the last row. Up to `MAX_COMPANIES` (6) companies plus Freelance, seven rows, fit the desktop
  content area. The phone lists the same rows in one column and scrolls.
- The head holds "All Probes — edit the whole fleet" and "+ New company". There is no filter: the board is
  grouped by company already, so the flat list's one-company filter has nothing left to do.
- A company's name box opens its Company detail. The headers carry no Edit / Rename / Delete of their own.
- **Reassignment:** a quiet "⇄ Move" chip on a tile — on desktop it appears on hover only; on the phone it
  is a small always-on glyph, with tap-hold on the tile as a shortcut — opens the same company radio the
  robot screen's avatar column carries: a small flat panel under the tile on desktop, a bottom sheet over a
  scrim on the phone, listing Freelance plus every company. Picking closes it and the tile glides to its new
  group (a GSAP flip; the group counts tick). The robot screen stays the second place to reassign, as the
  app has two today, both through `assignRobotToCompany`.
- Selecting a company halos every member in the company colour in the world; "All Probes" halos nothing.

**Company detail (new screen)**

- The robot screen with the avatar column swapped for a company column: the name as a popped box in the
  company colour, member count, the members as small gem tiles that open each robot, a recessed well stating
  once that edits reach every member as a broadcast and never a link, and Rename / Delete.
- The controls column is the robot's, unchanged: the same four section tabs (Levels, Composition, Envelope,
  Source) and the same controls. Values come from the company's last edit falling back per field to its
  first member (`resolveCompanyOptions`); every edit broadcasts once to every current member
  (COMPANIES.md). No per-field "own versus inherited" marker.
- Reached from the nav's Companies entity and the roster's company header. "All Probes" is the same screen
  for the whole fleet: no colour, no Rename / Delete, no halo.

**Deck**

- Robots carry no text box. A selected robot's line, and a selected company's name and line, read out in the
  meta box with the world line. In the world a selection is a halo only: identity colour for a robot, the
  company colour on every member for a company.

**Settings**

- Three section tabs named from the content layer: Audio Quality (the two load sliders, their preset radio,
  the limits readout as a well), Seeds (Attenuation Style, locale coordinates, Retransmit / Share), Save &
  Share (name, save, share, the saved list with Load / Share / Delete per row).

**Off screen**

- The powered-off screen shows the world faintly behind the glass, an etched label, and the line that says
  pressing power will play sound (backlog item 2). The world is therefore built before power-on; power stays
  the only thing that starts sound.
- Under the label, one picker row — **Transmission**: three presets, a divider, then the user's saves if any
  (a preset is a curated session shipped as content; a save is one of the user's own). Picking one
  retransmits the faint world as a silent preview.
- **Nothing on the off screen pops.** The power is off, so the splash's selected option gets at most a
  monochrome background in the radio box's own shape and size — no walls, no glow (amendment of 2026-10-09).
- The Theme row is not built in this phase (see Out of scope).

## Style / constraint

- **Build on the existing components.** The rework recomposes the 14 primitives in
  `src/components/ui/controls/`, `CabinetBox` and the `ControlSchema` contract (COMPONENT_LIBRARY.md), the
  `RadioButton` company picker and the existing section components (which already take `value` /
  `onChange` with no robot prop). No new widget set. Sliders definitely keep their pop-out boxes; the nav
  boxes stay cabinetry (a gem-style nav was floated and not pursued).
- **UI only.** The session payload (SESSION_STORAGE.md) and the share link (Phase 21) do not change, so every
  existing save and link keeps meaning what it meant. No audio path is touched. No new dependency.
  `uiStore` may gain what the new shell needs (nav branch + entity, the mounted section, the open Move
  panel), all JSON-serialisable.
- **Every new string goes through `src/content/`** (CONTENT_LAYER.md). Copy on the off screen is placeholder
  until Crawford writes it; lore names drawn in the sketch are the app's where one exists, placeholder
  otherwise.
- **One branch, several sub-phases, merged once at the end**, in this order: (1) shell and nav — the strips,
  the slim header, the one panel, the content surface over the dimmed world, with the existing screens
  dropped in unchanged; (2) section tabs on Fleet Params and the robot screen, retiring the stacked
  scroll; (3) the roster board and the Company detail; (4) the off screen last. Each sub-phase has its own
  spec checkpoints; the app is not expected to ship in a half-converted state.
- **Success:** the original twelve desktop and six phone screenshots, retaken on the finished branch, with
  every complaint in the problem statement gone; and the idle-paint perf harness (`npm run perf`,
  PERFORMANCE.md) holding against main. **No listening check** — nothing here touches audio.
- **The three transmission presets** are in scope as a mechanism (a curated session shipped as content,
  loaded like a save). Choosing and tuning the three sessions is Crawford's, not the implementer's.
- **Motion stays on GSAP timelines in `timelineMap`** (ANIMATION_SYSTEM.md): the nav panel's widen, the
  tile's glide between groups, the phone sheets. A timeline only triggers semantic state; the Move chip's
  pick calls `assignRobotToCompany` and the glide follows the state change.
- **Controls hold their largest content size** (Crawford's rule): a box whose label changes never resizes on
  flip.

## Out of scope

- **The theme engine and the Theme row** — `docs/ideas/themes.md` is its own phase after this one, with its
  own interview. The sketch draws the row behind an option for that phase, under the same no-pop rule.
- **The Atlas card, sleeve transport keys, a desk, and any hardware key** beyond the power rocker — parked
  for v2 (`punch-card-session.html`); soft keys were sketched and rejected.
- **Drag between roster groups** — a new mechanism with no component behind it, needs a keyboard fallback,
  and drag in a scrolling board is bad on phones. The Move chip is the reassignment.
- **A per-field "own versus inherited" marker on the Company detail** — the app has none today.
- **Any gem material on UI chrome or controls** — tried in `gem-controls.html`, rejected.
- **A roster filter** — removed; if narrowing ever returns it would be by state or job, a new feature.
- **Option B** (`layout-rework-option-b.html`), the rail + tree drawer and the rail + entity flyout nav cuts,
  the tile grid and the group-columns roster cuts — all rejected on the way and recorded in the sketch.
- **Changes to the payload, the share link, the audio path, or the Audio Load Budget.**
- **Curating the three presets, and the off-screen copy** — Crawford's.

## Known implementation note (not yet spec'd)

- **Only two frames are sketched.** The sketch draws a 1600 × 900 desktop frame and a 375 × 812 phone.
  The app's real breakpoints are the 639 px cabinet tier and the 768 px nav dock; a few 64em queries exist
  and are not required (Crawford, 2026-10-09). The spec says which shell applies between 640 and 767 px,
  and the phone shell must hold down to 320 px.
- **What the shell replaces:** `Header.tsx`, the `nav/` tree (`NavPanel`, `NavTree`, `NavTreeNode`,
  `NavCabinetRow`, `NavStatusBlock`, `NavToggleButton`, `useNavTree`, `useNavPanelSlideAway`), the
  stacked-scroll machinery (`RobotSectionAccordionStack`, `useAccordionOpenState`, `useSectionObserver`,
  and the accordionSync / scrollspy readers in `FleetParamsContent`, `SettingsContent`,
  `RobotOptionsTab`, `CompanyOptionsSection`, `AudioLoadPanel`, `SectorSettingsDrawer`), and the Probes /
  Companies nav content (`ProbesContent` + `RobotsTab`, the list; `CompaniesContent` + `CompanyCrudControls`,
  the button row, CRUD and options section — the roster board and Company detail take their place; note
  COMPANIES.md still describes a `CompanyManager` that the Nav/Layout Rewrite's Task 20 removed). The spec
  names what is deleted and what is kept; nothing stays behind a flag.
- **One section mounted at a time** carries roadmap 17.2.2's lazy-mount forward: a section's controls (and
  its LFO lanes) exist only while its tab is active. The spec should say what state an unmounted section's
  controls keep (the store already holds the values; only the DOM goes).
- **The world before power-on:** `initializeLocale` must run without the audio context (the autoplay rule
  stays: no AudioEngine start until the rocker). A Transmission pick on the off screen is a session load
  with no audio start; the spec decides how a preset is stored (a session payload in `src/data/` or
  `src/content/`) and how the splash reaches `?session=` links.
- **The Move panel and the phone sheets are popovers:** Escape and click-outside close them; the roster
  tile is itself clickable, so the chip needs the nested-interactive guard `RobotSelectionCard` already
  uses. Reduced-motion users get no glide.
- **Phone meta box when a robot AND a company are both selected** — three lines in a 56 px bar: grow it, or
  show only the latest? Open for the spec.
- **Nav widths (96 / 260 px), the chip (22 px), the row-tile (250 px) and the company column (400 px)**
  are sketch values at 1600 px, judged by eye; the spec turns them into tokens, not magic numbers.
- **Section tabs need the tablist keyboard pattern** (arrow keys, Home / End) and the help popover needs a
  focusable trigger; the sketch does not draw focus states.
- **Docs to update when it ships:** UI_SHELL.md (the whole shell), COMPONENT_LIBRARY.md (any primitive
  gained or retired), COMPANIES.md (where reassignment and the bulk edit now live), SESSION_STORAGE.md
  (presets), ANIMATION_SYSTEM.md (the new timelines), CONTENT_LAYER.md if a new helper is needed, the
  roadmap entry, and the backlog items 2 and 4 this closes.
