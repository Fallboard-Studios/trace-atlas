# Intent: Robot Selection (Roadmap Phase 8)

> **Note (added when committing, after the fact):** written and confirmed before Phase 9 existed —
> "Robot Options (Phase 9) does not exist yet" and references to `RobotEditorTab` below describe
> routing as it stood at the time, on `feature/robot-selection`. Phase 9 has since shipped;
> `RobotEditorTab.tsx` was renamed to `RobotOptionsTab.tsx`, and robot selection now routes there
> instead. Left otherwise unedited as a historical planning record — see
> [docs/todo/roadmap.md §§ 8-9](../todo/roadmap.md) for what actually shipped.

Confirmed via `/interview-me` on `feature/robot-selection`, 2026-08-26. Covers
[Roadmap Phase 8](../todo/roadmap.md#8-robot-selection) — replacing `RobotsTab`'s bare
button-list with a real card-based Robot Selection hub tile, plus the day/night-invariant avatar
restructure and world-view click-through the roadmap's About section calls for.

Robot Options (Phase 9) does not exist yet. Selecting a card in this phase routes to the same
place today's list already routes to — `RobotEditorTab` — not a placeholder Phase 9 screen.

## Outcome

`RobotsTab.tsx`'s list view is replaced by a grid of `RobotSelectionCard`s (new,
`src/components/selection/`), one per robot in the active locale, backed by
`src/data/robotSelectionConfig.ts`. Each card is a single native clickable element (not the
`Button` primitive — it has no children-slot to hold a card's worth of content) showing:

- **Avatar** — the existing `RobotBody` SVG, restructured so its day/night `lightnessMultiplier`
  is always neutral regardless of the active locale's time of day. The separate, non-audio
  battery-dim overlay (`computeBatteryDimOpacity`) is **kept** — a low-battery robot's thumbnail
  still visibly dims its windows/lights, reinforcing the battery % shown next to it.
- **Robot Name / Job Data / Battery Data (text %) / Docked Status** — `DualLabel` rows using the
  exact lore/human pairs already in `docs/reference/ROBOT_DATA_GRID.md`.
- **Audio Status** — a new `AudioStatusBadge` component: a colored dot (off=purple, mute=red,
  solo=green, highlight=amber), not text. Colors come from `colorTheme.json` via the existing
  `hslToString()` helper (`realWorldGradient.ts`'s established pattern) — off→`vent`,
  mute→`alert.powered`, solo→`indicator.powered`, highlight→`strut.base`. In the same pass,
  `AccordionContainer.css`'s hardcoded `#8b1a14`/`#1a8f40` and `PowerRockerSwitch.css`'s matching
  literals (the pair `AccordionContainer` explicitly mirrors) are refactored onto
  `colorTheme.json`'s `alert`/`indicator` too, so there's one color source instead of three
  duplicated hex pairs.

`docs/reference/ROBOT_DATA_GRID.md` gets new rows appended at the bottom with best-guess lore
labels for values the grid doesn't currently cover at all — per-job-type names (Vent Extraction,
Acoustic Survey, Structural Inspection, Fluid Monitoring), per-docking-state values (Docked,
Docking, Departing, Active), and per-audio-mode values (Off, Mute, Solo, Highlight) — flagged for
Crawford's review/edit, not treated as final.

World-view robot selection is wired to match: `Robot.tsx`'s click handler already calls
`selectRobot(id)` unconditionally, but nothing currently routes that into the tile. This phase
also calls `setActiveHubTile('robots')` on that same click, and — the actual root cause of "it
used to work" — fixes the CSS `pointer-events` issue where the current hub nav layout blocks
clicks from reaching world-view robots underneath. Once *any* tile besides the main hub grid is
active, world-view robots become non-clickable entirely (the user is already where they meant to
go; they're not trying to reach Robot Options from Audio Rig or Settings).

## User

Crawford (solo dev), continuing straight off Phase 7 (Robot Systems Engine) — this is the first UI
surface to actually read Battery/Docking/Job data that phase produced.

## Why now

Phase 8 is next in the roadmap sequence. Phase 7 shipped Battery/Docking/Job with no UI consumer;
Phase 9 (Robot Options) needs Phase 8's selection flow to exist before it has anywhere to route
into.

## Success

- `RobotsTab.tsx` (or its replacement) renders one `RobotSelectionCard` per robot, each showing a
  time-of-day-invariant (but still battery-dimmed) avatar, and `DualLabel`-driven Name/Job/Battery
  %/Docking rows plus an `AudioStatusBadge` dot.
- Clicking a card, or clicking a robot in the world view while the main hub grid is showing, both
  land on `RobotEditorTab` scoped to that robot; a back button returns to the card list.
- Clicking a robot in the world view does nothing while any other tile (`audioRig`, `settings`, or
  the `robots` tile's own detail view) is active.
- `AudioStatusBadge`'s four dot colors, plus `AccordionContainer`'s and `PowerRockerSwitch`'s
  status lights, all resolve through `colorTheme.json` — no hardcoded hex duplicated across the
  three.
- `docs/reference/ROBOT_DATA_GRID.md` has new draft rows for job-type/docking-state/audio-mode
  value labels, awaiting Crawford's review.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean.

## Constraint

- Reuse existing primitives/patterns wherever they fit: `DualLabel` for every label pair,
  `colorTheme.json` + `hslToString()` for every color, the existing `RobotBody`/
  `computeBatteryDimOpacity` visual pipeline for the avatar. A new component
  (`RobotSelectionCard`, `AudioStatusBadge`) is justified only where an existing primitive's
  contract can't do the job (`Button` takes no children).
- No battery gauge/visual widget — text percentage only, to save room on the card. A real gauge is
  Phase 9's Robot Display drawer's job.
- Robot visuals still map strictly to audio attributes per `ROBOT_DESIGN.md` — the day/night
  suppression is a rendering-context override for the card thumbnail, not a change to what
  `audioAttributes` produce, and it doesn't touch the live in-world robots' day/night behavior.
- No `setTimeout`/`setInterval`/`requestAnimationFrame` for anything — CSS/pointer-events and React
  state changes only.

## Out of scope

- Building Robot Options itself (Phase 9) — card selection continues routing to `RobotEditorTab`.
- A battery gauge widget, battery warning threshold editing, transducer pressure ratio, or any
  other Phase 9 Robot Display field.
- Treating the new `ROBOT_DATA_GRID.md` rows as final — they're best-guess drafts for Crawford to
  edit.
- Any change to `WorldView`/robot day-night behavior for robots rendered in-world (only the
  selection-card thumbnail rendering path ignores time of day).
