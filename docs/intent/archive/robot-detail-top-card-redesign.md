# Intent: Redesign — Robot Detail Top Card

Confirmed via `/interview-me`, 2026-09-16. Covers [Roadmap Phase 15.3](../todo/roadmap.md#153-redesign-robot-detail-top-card) — the detail-page half of the original Phase 15 (Redesign: Robot Cards), split from 15.1/15.2 once Crawford's written notes made clear the three redesigns had separate scopes. Targets `RobotDisplaySection.tsx`, the avatar/meta-data card at the top of the Robot Options screen. Builds on [Roadmap Phase 15.1](../specs/SLIDER_LINEAR_READ_ONLY.md) (read-only `SliderLinear`, already shipped and already consumed here) and [Roadmap Phase 15.2](robot-cards-redesign.md) (Robot Cards, shipped — the sibling redesign this one was originally drafted to visually match, though several specifics below diverge from that match on Crawford's call, not by omission).

## Outcome

`RobotDisplaySection` restructures from today's vertical stack of rows into:

- **A centered avatar** (`RobotBody` with `ignoreDaylight`, unchanged) with a **2×2 grid of fields arranged around it** — a loose grid framing, not a literal circular/orbital arrangement:
  - Top-left: Name
  - Top-right: Job
  - Bottom-left: Docking
  - Bottom-right: Status — true audibility ("Emitting"/"Disabled"), reusing [15.2](robot-cards-redesign.md)'s shared `isRobotAudible` predicate, kept as its own quadrant rather than combined with Docking the way 15.2's card combines them into one "Docking · Status" line — this card has four distinct slots to fill, 15.2's list card doesn't.
  - **All four fields keep their `DualLabel` lore/human caption pairs** — this is a deliberate divergence from the original roadmap draft (which called for unlabeled values matching 15.2) and from 15.2's own shipped unlabeled style. Confirmed directly: keep the labels now, since removing them later is easy and the reverse isn't as cheap. Status needs a new `DualLabel` row schema (lore/human pair) in `robotSelectionConfig.ts` — none exists yet, since 15.2 never gave it one.
- **Beneath the grid, the Battery reading** as the existing read-only `SliderLinear` (15.1), reusing `BATTERY_READOUT_SCHEMA` exactly as already wired in — **label stays "Battery Data"/"POWER CELL STATUS"**, matching 15.2's card. This is a divergence from the original roadmap draft, which called for relabeling it "Power" specifically for this card; Crawford's call mid-interview was to match the list card's existing copy instead, so the schema's shared label is untouched, not forked per-consumer.
- **Beneath that, a Company section**: the existing company-assignment `RadioButton`, now wrapped in its own `DualLabel` row (same pattern as the four grid fields), rather than today's bare, unlabeled row.

## User

Crawford (solo dev), viewing/editing a robot's detail card while working in Robot Options.

## Why now

Phase 15.3 next in sequence once its two dependencies shipped: Phase 15.1 (read-only `SliderLinear`) and Phase 15.2 (Robot Cards, the sibling redesign whose shipped shape this item was drafted against) — revisited now that 15.2's actual shipped behavior (unlabeled fields, combined Docking · Status, "Battery Data" copy) gives this item something concrete to compare against and deliberately diverge from where noted above, rather than working from the original pre-15.2 draft alone.

## Success

- Card shows: centered avatar, a 2×2 grid of labeled Name/Job/Docking/Status fields around it, a labeled read-only Battery slider below, and a labeled Company section below that — in that order.
- Every field on this card (grid + Battery + Company) carries a `DualLabel` lore/human caption pair — none are bare/unlabeled.
- Status reads "Emitting"/"Disabled" via the same shared `isRobotAudible` predicate 15.2 already extracted — not re-derived.
- Battery's label reads "Battery Data" (unchanged from `BATTERY_READOUT_SCHEMA`), not "Power."
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean.

## Constraint

- Reuses existing primitives/schemas as-is: `RobotBody`, `RadioButton`, `SliderLinear` + `BATTERY_READOUT_SCHEMA`. No new primitive component.
- Status's new `DualLabel` row schema follows the same lore/human convention every other field in `robotSelectionConfig.ts` already uses (e.g. `docking`'s `loreLabel: 'DOCKING STATE'` / `humanLabel: 'Docked Status'`) — resolved at spec time, not fixed here.
- No `setTimeout`/`setInterval`/`requestAnimationFrame` — this is markup/CSS restructuring plus one new label schema entry, no new timing behavior.
- Robot visuals still map strictly to audio attributes per `ROBOT_DESIGN.md` — unaffected by this phase, which only touches card chrome around the avatar, not the avatar's own rendering.

## Out of scope

- `RobotSelectionCard.tsx` (Roadmap 15.2) — already shipped with its own unlabeled fields and combined Docking · Status line; this phase doesn't revisit or reconcile that card's own copy/layout.
- `CompanyManager.tsx` (Roadmap 16) — separate component, separate redesign.
- The company `RadioButton`'s own options or change behavior — reused exactly as-is; only its wrapping (a new `DualLabel` row) changes.
- A literal circular/orbital layout — explicitly rejected; this is a grid framing, not a ring.
- Exact grid sizing, avatar proportions, and spacing — implementation details resolved at spec/implementation time, not fixed here.
- `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer` — already live outside `RobotDisplaySection` (extracted in earlier work) and untouched by this phase.
