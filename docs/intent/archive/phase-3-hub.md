# Intent: Hub (Roadmap Phase 3)

Confirmed via `/interview-me` on `review/layout`, 2026-08-22. This is the "why" and the
resolved decisions behind Phase 3's scope in
[docs/todo/roadmap.md](../todo/roadmap.md#3-hub) — read that first for the roadmap's
own framing; this doc resolves the decisions its prose left open, informed by a
`/context-engineering` prep pass against the current repo state.

**Amendment (2026-08-22, after initial implementation shipped on `feature/hub`):**
Crawford asked, mid-branch, to fold the `robotOptions` tile into a nested list+detail flow
instead of leaving it a standalone spawn-config screen. Two questions resolved directly
with Crawford (not just inferred):
- **Back-button nesting:** from a selected robot's editor, Back returns to the robot list
  (not straight to the grid) — a second nesting level inside the tile, not a flat one.
- **Spawn controls' fate:** the min/max robot count slider and auto-spawn toggle are
  dropped outright (Phase 7 removes them anyway once the Battery/Docking/Job lifecycle
  creates every robot once). Only "+ New Robot" survives, moved into the new list view.

**Revised shape:** the hub tile named "Robot Options" (`robotOptions`) becomes "Robots"
(`robots`) — clicking it shows a list of every robot in the active locale plus a
"+ New Robot" action, not a spawn-config panel. Clicking a robot in that list shows its
existing editor (today's `RobotEditorTab`, reused as-is — **not** a new build; Phase 9's
"Robot Options" rebuild with four schema-driven drawers is unrelated future work and out
of scope here). The standalone `robotEditor` hub tile is retired — it's no longer directly
selectable from the grid, only reachable by first going through the robot list.
`HubTile` shrinks from four values to three: `robots`, `audioRig`, `settings`.
`selectedRobotId` (already in `uiStore`) doubles as the list/detail switch within the
`robots` tile — no new store field needed: `null` shows the list, set shows the editor.

This does **not** pull Phase 8 (Robot Selection) forward — that phase's richer list
(avatar SVG, job title, audio status, battery status per card) depends on data
(Battery/Job) that Phase 7 hasn't built yet. The list built here is a minimal stand-in
(robot name + click), not Phase 8's real card UI. Phase 8 still has real work to do later;
this just gives the hub a working, non-flat path to an individual robot's editor now
instead of a dead-end spawn-config tile.

## Outcome

Replace `ConsoleNavigation` (the Radix `Tabs.Root` bar) with a real tile grid, `HubNav`,
driven by a new `src/data/hubNavConfig.ts` — button titles/subtitles live in that data
file, not inline JSX. Selecting a tile does a full-screen takeover of the hub-nav area,
with a back button returning to the grid; the grid itself is what's new about this phase,
not an animated transition between the two states.

**Removed outright:**
- The Session and Composition tabs, their `uiStore.ConsoleTab` entries, and their
  placeholder stub content — deleted, not parked. Session's job is absorbed by Session
  Storage's background persistence engine (Phase 12), so there's nothing left for a tile
  to do; Composition is deferred to a future version.
- `ConsoleNavigation`'s `Tabs.Root`/`Tabs.List`/`Tabs.Trigger` structure and its hardcoded
  `TABS` label array.

**Rebuilt:**
- `HubNav`: a grid of tiles read from `hubNavConfig.ts`. Each entry supplies a lore title,
  a human subtitle, and a target tile identifier — no hardcoded labels, no inline routing
  logic.
- Each tile button is rendered with the **existing `Button` primitive**
  (`src/components/ui/controls/Button.tsx`, `ButtonSchema`) — not a new 14th
  `ControlSchema` variant. `hubNavConfig.ts` entries carry a `ButtonSchema`-shaped
  lore/human label pair plus a Hub-specific `target` field layered on top; there is no
  `HubNavButtonSchema` in `src/types/controls.ts`.
- `uiStore.ts`: `ConsoleTab`/`activeConsoleTab` gets renamed/reshaped to drop `session`
  and `composition`, leaving four tile values (`robotOptions`, `robotEditor`, `audioRig`,
  `settings`). The field defaults to `null` (grid view) rather than pre-selecting a tile —
  first load shows the grid so the user decides what to see.

**Tile content this phase (four tiles remain):**
- `robotOptions` / `robotEditor` — selecting these still drops into the real, already
  working `RobotOptionsTab`/`RobotEditorTab` components, unchanged. They're not due for
  removal/replacement until Phases 7–9; nothing about this phase should regress or
  re-stub working functionality.
- `audioRig` / `settings` — these get the same "not built yet" placeholder content that
  exists today, just reached through the new full-screen-takeover shell instead of the old
  tab switch-in-place. Their real content is Phases 4/5's job.

**Explicitly not animated:** the grid↔tile transition is a plain conditional-render swap.
No GSAP timeline, no `timelineMap` entry, no `prefers-reduced-motion` handling — that
pattern (used by `AccordionContainer`/`PowerRockerSwitch`) isn't in scope for this phase's
navigation shell.

## User

Crawford, building solo. `HubNav` is the primary navigation surface for the whole console
going forward — every later phase (Audio Rig, Sector Settings, Robot Selection) builds its
real content behind a tile this phase creates.

## Why now

Phase 2 (Layout) explicitly stopped `ConsoleNavigation` from rendering but left its code,
`uiStore.activeConsoleTab`, and its tab content untouched, deferring "the real teardown and
tile-based `HubNav` rebuild" to this phase (see
[docs/intent/phase-2-layout.md](phase-2-layout.md)). Phase 3 is next in the roadmap
sequence.

## Success

- `ConsoleNavigation`'s tab bar is gone; `HubNav` renders a grid of tiles from
  `hubNavConfig.ts`, defaulting to the grid view (no tile pre-selected) on load.
- Session and Composition are fully gone — no tab, no tile, no stub, no `uiStore` entry.
- Selecting `robotOptions` or `robotEditor` full-screens the real, unmodified
  `RobotOptionsTab`/`RobotEditorTab`; a back button returns to the grid.
- Selecting `audioRig` or `settings` full-screens today's placeholder stub content; a back
  button returns to the grid.
- No `ControlSchema` variant was added — tile buttons render via the existing `Button`
  primitive.
- `docs/UI_SHELL.md`'s "Planned Replacement: Hub Tiles" section is folded into "Console
  Navigation" (renamed) for the tab→tile, surviving-tiles, and Session/Composition-dropped
  points, with "not yet implemented" framing removed for those points specifically. The
  `robotOptions`/`robotEditor` points stay under "planned" framing until Phases 7 and 9
  land, since this phase doesn't touch their internals.

## Constraint

Stays inside the repo's existing non-negotiable guardrails
([CLAUDE.md](../../CLAUDE.md)):
- All interactive UI (the grid, every tile, the back button) stays inside `ScreenViewport`
  — none of this touches `SleeveContainer`.
- State stays serializable — `uiStore`'s reshaped tile-tracking field is still a plain
  string-or-null union, no new runtime-only values.
- No timers or `requestAnimationFrame` for the grid↔tile switch — it's a synchronous
  conditional render, not an animated or scheduled transition.

## Out of scope (this phase)

- Any real content for the Audio Rig or Sector Settings tiles — Phases 4 and 5.
- Any change to `robotOptions`/`robotEditor`'s internals, or their eventual
  removal/replacement — Phases 7–9.
- Any GSAP-animated transition between the grid and a full-screen tile.
- Session Storage's background persistence engine — Phase 12. This phase only deletes the
  Session tab stub; it builds none of what replaces its job.
- A `HubNavButtonSchema`/14th `ControlSchema` variant — the existing `Button` primitive
  covers this need.
