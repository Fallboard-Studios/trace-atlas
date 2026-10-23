# UI Shell Guide

Rewritten from the shipped code for the layout rework ([Roadmap Phase 45](todo/roadmap.md), [spec](specs/LAYOUT_REWORK.md), [plan](tasks/LAYOUT_REWORK.md)). The nav tree and the stacked, scroll-synced accordion screens are gone; this guide describes what replaced them, not the history.

## Overview

Trace Atlas's UI is a "Sleeve & Glass" tablet shell. `Tablet.tsx` composes two decorative `SleeveContainer`s flanking a single `ScreenViewport`:

```typescript
<SleeveContainer hasPowerSwitch={true} />
<ScreenViewport isPoweredOn={isPoweredOn} />
<SleeveContainer />
```

- `SleeveContainer` (`src/components/panels/physical/`) is decorative housing: a logo mark and the `PowerRockerSwitch` when `hasPowerSwitch` is set. Nothing interactive lives there but the power switch.
- `ScreenViewport` (`src/components/panels/physical/`) is the interactive surface. `WorldView` is mounted in **both** power states: the world is built before power-on and is the off screen's backdrop (its systems start on the rocker, see [SESSION_STORAGE.md](SESSION_STORAGE.md)). Powered off it adds `OffScreen`; powered on it adds `Header`, `NavPanel`, `ContentPane`, `NavBreadcrumb` and `PhoneBar` (all under `src/components/panels/screen/`). It stamps `data-shell="desk" | "phone"` on its root, from `useShell()`, so a stylesheet reads the shell without a media query of its own.

**Guardrail** (see [CLAUDE.md](../CLAUDE.md)): all interactive UI — transport, navigation, controls — lives inside `ScreenViewport` only, never in `SleeveContainer`. Portalled UI (the help popover, the Move panel) portals into `ScreenViewport` itself, never `document.body`.

## Two shells, one switch

`useShell()` (`src/components/panels/screen/useShell.ts`) returns `'desk' | 'phone'` from one `matchMedia` query on `NAV_PANEL_DOCK_MIN_WIDTH` (768 px). Everything that differs by shell reads this hook and nothing else: the panel against the sheet, the header's contents, the lane titles, the `LfoLink` row, the meta box's lines. The 640–767 px band takes the phone shell with the larger cabinet tier. `useCabinetTier` (639 px) keeps sizing controls and is **not** a shell switch. `SHELL_MIN_WIDTH` (320 px) is the narrowest viewport the phone shell must hold; a CSS test walks every shell piece at that width.

| | Desk (768 px and up) | Phone (below 768 px) |
|---|---|---|
| Nav | `NavPanel`, a rail on the left edge | the same `NavPanel` in a modal sheet, opened from `PhoneBar`'s menu |
| Header | mute and the master volume slider, beside the power corner | mute and a ▾ box that opens the slider in a pop-out |
| Where am I | `NavBreadcrumb` along the bottom-left of the content surface | `NavBreadcrumb` in `PhoneBar`'s well |
| World line | `MetaBox`, top of the Deck | `PhoneBar`'s well, on the Deck |

## The nav panel

`NavPanel` (`nav/NavPanel.tsx`) is one panel of five parent boxes in the order Deck, Fleet Params, Probes, Companies, Settings, each in its branch's trait colour, in the panel's static popped cabinet facade; the open branch's box is popped out. A box is a `NavBox`. Probes and Companies **expand in place**: while `uiStore.expandedTopLevelBranch` is that branch, `NavEntityList` lists its entities under the box (All Probes, then the robots in their identity colours; or + New Company, then the companies) and the panel widens. The width is `--nav-panel-width` on `#screen-viewport`, derived in `NavPanel.css` from a rest and a wide size and an expand factor `--nav-panel-expand` that `NavPanel` tweens in a `timelineMap` timeline (`nav-panel-width`; the first value is set at once and so is every change under reduced motion). `ContentPane`'s left edge reads the same variable, so the panel and the content edge move together. Fleet Params and Settings are leaves: no list.

On the phone shell the same panel renders inside a modal Radix `Dialog` whose open flag is `isNavPanelOpen`, with a scrim, a focus trap and Escape. It is not in the DOM while shut, it has no `Dialog.Portal` (it renders inside `ScreenViewport`), and a pick closes it. `PhoneBar` owns the menu `Toggle` (☰ and ✕, the facade holding the larger glyph so the box never resizes) and a well beside it.

### `navActions.ts` — selection in one place

`nav/navActions.ts` is the one module that changes what is selected. The panel, its entity list, the breadcrumb, the roster board and the company screen all call it; no component derives a path itself.

- `selectBranch(branch)` opens a parent box's own page. Every action starts from a clean slate (no entity, no section on any branch, Fleet Params on its default tab, Settings on its first, the phone sheet shut) and then sets only what it opens.
- `selectEntity(entity)` opens a robot, a company or `'all'` (All Probes) with the list collapsed, so the entity's screen gets the panel's rest width.
- `pressBranchBox(branch)` is what a box press calls: on a branch's own page, Probes and Companies toggle their list in place; anywhere else it is `selectBranch`.
- `goHome()` is the Deck: no tile, nothing expanded, no entity.
- `breadcrumbTrail(state, roster)` returns the segments (each knows how to go back). `FLEET_PARAMS_SUBSECTIONS` and `SETTINGS_LEAVES` are the one table each of the Fleet Params sub-tabs and the Settings tabs, read by the screen and the breadcrumb alike, so they always name the same tab.

`NavBreadcrumb` is a passive "where am I" readout (a recessed well, `inBar` on the phone) built from `breadcrumbTrail`; reads `Root / branch / entity / section` (Root is left out on the phone), every ancestor a button that calls the matching navAction and the last segment plain text; it renders nothing on the Deck. `useEntityRoster` (`nav/useEntityRoster.ts`) is the narrow robots/companies subscription both the entity list and the breadcrumb share.

## The header

`Header` is one cabinet row beside the power corner, in the static popped facade: a Mute `Toggle` (🔇/🔊 swapped on `isMuted`) and the master volume `SliderLinear` bound to `audioStore.volume`. On the phone shell the slider sits behind a ▾ box in a Radix `Popover` pop-out (inside the header, not portalled). Volume lives here only (Settings has no copy of it), so it stays reachable beside mute and is never gated behind a nav selection. `Header` writes its measured height (`--header-height`) and the row's width (`--header-width`) to the document root, which the content surface and the meta box read.

## The content surface and the world

`ContentPane` (`console/ContentPane.tsx`) is the single area a selection opens into. At the Deck (`activeHubTile === null`) it renders only a small collapsible Welcome card (`.content-pane__home`, sized to its content, so `Robot.tsx`'s click-to-select reaches the world). Once a branch is open it renders `ConsolePanel` on an opaque plate, `--content-surface` (`src/index.css`): flat, no glass, right of the nav panel (`--nav-panel-width`) on the desk and edge to edge above `PhoneBar` on the phone. `WorldView` dims under it via a `data-dimmed` attribute on its root, set while a branch is open; panels inside keep the static popped `CabinetBox` facade in trait colour.

`ConsolePanel` routes by `activeHubTile` through a `Record<HubTile, …>` (a missing tile is a compile error): `robots` → `RobotScreen` when a robot is selected, `CompanyScreen` for All Probes, else `RosterBoard`; `companies` → `CompanyScreen` when a company is selected, else the same `RosterBoard`; `audioRig` → `FleetParamsScreen`; `settings` → `SettingsScreen`.

### The meta box

`MetaBox` (`worldView/MetaBox.tsx`) is the glow-glass well at the top of the Deck, desk shell only. It carries the `WorldLine` — clock and temperature, robots emitting against the Audio Load budget's cap, and the current Attenuation Style with its coordinates. On the phone, `PhoneBar` shows the same `WorldLine` in its well on the Deck. A selection reads as a halo, not as text: `Robot.tsx` sets `--halo` inline, the robot's own identity colour when selected, its company's when a member.

## The screens

Every screen below is a stateless view over the existing stores; the controls are the same schema-driven primitives ([COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md)). A screen's sections are `SectionTabs` — one section in the DOM at a time, no `forceMount` — so an inactive section's controls never exist (this carries roadmap 17.2.2's lazy mount forward).

| Screen | Content | Open tab |
|---|---|---|
| `FleetParamsScreen` | an intro, then five section tabs — Pacing, LFO Bank, EQ & Filters, Time & Space, Output — with a nested sub-tab row for the four lanes and the effect leaves | `fleetParamsSection` / `fleetParamsSubsection` |
| `SettingsScreen` | an intro, then three tabs — Audio Quality (`AudioLoadPanel`), Seeds (`SectorSettingsDrawer`), Save & Share (`SessionsPanel`, [SESSION_STORAGE.md](SESSION_STORAGE.md)) | `selectedSettingsLeaf`, resolved by `activeSettingsLeaf` |
| `RosterBoard` | the Probes and Companies pages: the head (All Probes, + New Company disclosing the staged `CompanyCreateForm`), then one row per group from `rosterRows()` — the companies, then Freelance — of `RosterTile`s with a Move chip ([COMPANIES.md](COMPANIES.md)) | — |
| `RobotScreen` | on the desk a fixed avatar column (the gem, the name, read-only meta, the battery and the company radio) beside `SectionTabs` over `ROBOT_SECTIONS_CONFIG`, Source with a sub-tab per oscillator; on the phone the column is a small sticky band | `selectedSection` / `selectedSubsection` |
| `CompanyScreen` | the robot screen with a company column (name, share and signal wells, member tiles, Rename / Delete) over the same four sections, edited through `useCompanyOptions`; the All form is the whole fleet | `selectedSection` / `selectedSubsection` |

Each section's panel opens with its group's intro as an expander that starts collapsed with its headline showing.

## The off screen

`OffScreen` (`screens/OffScreen.tsx`) is what shows before power-on, over the dimmed, still `WorldView`: an etched label, the power hint, and the **Transmission** row — the `TRANSMISSION_PRESETS` (`src/data/transmissionPresets.ts`), a divider, then the user's saved sessions — as a `RadioButton` with `appearance: 'muted'` (nothing comes off the plate while the power is off) and a well naming the pick. Picking retransmits the faint world through `applySessionPayload` and never starts audio; only the power switch does. A save pick also names the session after the save, so a later Save overwrites it. See [SESSION_STORAGE.md](SESSION_STORAGE.md).

## uiStore

UI-only, JSON-serializable state (`src/stores/uiStore.ts`): `isPoweredOn`, `activeLocaleLocalTime` (the wall-clock hour, 0–24), `activeLocaleTemperature` (decorative, read by the world line and the header), and the selection fields below. No Tone nodes, GSAP timelines or DOM refs.

| Field | Meaning |
|---|---|
| `activeHubTile` | which branch is open (`null` = the Deck); the branch's box in the nav panel is `branchOfTile(activeHubTile)` |
| `selectedRobotId`, `selectedCompanyId` | the open robot or company; independent of each other |
| `allRobotsSelected` | the "no company" state (the default); mutually exclusive with `selectedCompanyId` |
| `allProbesSelected` | the All Probes form (a bulk edit over the whole fleet); distinguishes it from the Probes roster, both of which read `selectedRobotId === null` |
| `selectedSection`, `selectedSubsection` | the open robot/company tab and sub-tab, resolved by `robotSubsectionConfig`'s helpers |
| `fleetParamsSection`, `fleetParamsSubsection` | the open Fleet Params tab and sub-tab; setting the section clears the sub-tab |
| `selectedSettingsLeaf` | the open Settings tab (`null` = Audio Quality) |
| `expandedTopLevelBranch` | which of Probes/Companies lists its entities in the panel |
| `isNavPanelOpen` | the phone sheet's open flag; the desk panel ignores it |
| `movePanelRobotId` | the robot whose Move panel is open on the roster board (at most one) |

## Radix Primitives in Use

Installed and in use: `react-alert-dialog`, `react-dialog`, `react-popover`, `react-slider`, `react-switch`, `react-tabs`, `react-toggle`, `react-toggle-group`, `react-visually-hidden`. Radix owns ARIA roles, focus trapping and keyboard contracts; project design tokens own visual styling — don't install `@radix-ui/themes`. The two sheets on the phone (nav and Move) are `Dialog`s; the help "?" and the desk Move panel are `Popover`s; `SectionTabs` is `Tabs`.

## Forbidden Patterns

- Rendering any interactive control (buttons, inputs, nav) inside `SleeveContainer`.
- Portalling UI out to `document.body`; portal into `ScreenViewport`.
- Branching on the viewport anywhere but `useShell()` (or `useCabinetTier()` for control sizing).
- Deriving a breadcrumb or a selection in a component; go through `navActions.ts`.
- Storing GSAP timelines, DOM refs or computed UI props in `uiStore` — only plain, serializable UI state.
