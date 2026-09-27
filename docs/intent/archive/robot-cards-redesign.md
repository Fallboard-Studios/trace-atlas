# Intent: Redesign — Robot Cards

Confirmed via `/interview-me`, 2026-09-13. Covers [Roadmap Phase 15.2](../todo/roadmap.md#152-redesign-robot-cards) — the list-card half of the original Phase 15 (Redesign: Robot Cards), split from 15.1/15.3 once Crawford's written notes made clear the three redesigns had separate scopes. Targets `RobotSelectionCard.tsx`, rendered in `RobotsTab.tsx`'s list. Builds directly on [Roadmap Phase 15.1](../specs/SLIDER_LINEAR_READ_ONLY.md) (the read-only `SliderLinear`, already shipped and already consumed by `RobotDisplaySection`) and the Color Scheme work (Roadmap Phase 14, already on `main`).

## Outcome

`RobotSelectionCard` restructures from today's single clickable `<li>` into two sibling regions:

- **Top wrapper** — takes over the activation contract the `<li>` currently holds (`role="button"`, `tabIndex`, `onClick`/`onKeyDown` calling `selectRobot`, `aria-label={displayName}`). Contains two rows:
  - **Row 1 — meta row, two columns.** Column A: the existing day/night-invariant avatar (`RobotBody` with `ignoreDaylight`, unchanged). Column B: three bare text lines, none wrapped in `DualLabel` (no lore/human caption pairs — just the raw value):
    - Name — visually distinct from the other two lines (heavier weight/larger, reads as the card's title).
    - Job.
    - A combined "Docking · Status" line, e.g. "Active · Emitting" — one line, middle-dot separator, not two stacked rows. Status is "Emitting" or "Disabled", driven by true audibility (see Constraint below), not just this robot's own `audioMode`.
  - **Row 2 — Battery, as the read-only `SliderLinear`.** Reuses `BATTERY_READOUT_SCHEMA` (`src/data/robotSelectionConfig.ts`) exactly as already wired into `RobotDisplaySection` — **the label is kept** ("Battery Data"/"POWER CELL STATUS"), unlike Row 1's bare text: a percent-fill bar with no caption at all wouldn't read as battery. This is the one row on this card that still shows a `DualLabel` pair, via `SliderLinear`'s own internally-composed one.
- **Bottom wrapper** — a plain sibling `<div>`, no click handling of any kind, holding only the company-assignment `RadioButton` (unchanged: same schema, same `assignRobotToCompany` wiring, same "Company" label).
- The outer `<li>` becomes a non-interactive container — just the list-item semantics, no `role`/`tabIndex`/handlers of its own.
- `stopBubble` is removed entirely, from both the `.tsx` and its doc comment. It existed only to stop the company row's clicks from also firing the whole card's `onClick`; once the company row is a sibling of the top wrapper rather than a descendant of anything clickable, there's nothing left to guard against.
- The existing `AudioStatusBadge` dot is dropped from this card entirely — replaced by the Status text in Row 1's combined line. Battery itself is **not** dropped (a correction mid-interview to the original roadmap draft, which had assumed it moved to 15.3 alone) — it now renders here too, as the slider instead of plain text.

## User

Crawford (solo dev), browsing/selecting robots from the Robots hub tile's card grid.

## Why now

Phase 15.2 next in sequence once its two dependencies shipped: Phase 14 (Color Scheme, on `main`) so the redesign works from the real palette, and Phase 15.1 (read-only `SliderLinear`, shipped on `features/read-only-slider`) so Battery can render as the same slider visual `RobotDisplaySection` already uses instead of new bespoke markup.

## Success

- Clicking or keyboard-activating anywhere across both of the top wrapper's rows — avatar, any of the three text lines, or the battery slider — selects the robot exactly as today.
- Clicking the company `RadioButton` never triggers card selection, with no `stopBubble` guard anywhere in the file.
- The card shows: avatar, bare Name/Job/"Docking · Status" text (no captions), a labeled read-only battery slider, and the company `RadioButton` — in that order, top wrapper then bottom wrapper.
- The `AudioStatusBadge` component has no remaining consumer in this file (component itself untouched — no other file is asserted to use it, but this phase doesn't need to delete it if something else still does; confirm at spec time).
- The audibility predicate behind Status ("Emitting"/"Disabled") is extracted into one shared, exported function that both `AudioEngine.ts`'s `triggerWithCap` and this card's Status text call — not re-derived a second time.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean.

## Constraint

- **Status is true audibility, not just this robot's own `audioMode`** (confirmed 2026-09-13, carried over from the roadmap's own pre-interview note): "Disabled" when this robot's own `audioMode` is `mute`, OR when any other robot in the same locale is `solo` and this one isn't. That predicate exists today only inlined in `AudioEngine.ts`'s `triggerWithCap` (~lines 312-323) — extract it into one shared function, not a second inline copy (same class of issue as the open `docs/DUPLICATE_VALUE_AUDIT.md` items).
- Reuses existing primitives/schemas as-is: `RobotBody`, `RadioButton`, `SliderLinear` + the already-shipped `BATTERY_READOUT_SCHEMA`. No new primitive component.
- No `setTimeout`/`setInterval`/`requestAnimationFrame` — this is markup/CSS restructuring plus a pure derived-value extraction, no new timing behavior.
- Robot visuals still map strictly to audio attributes per `ROBOT_DESIGN.md` — unaffected by this phase, which only touches card chrome around the avatar, not the avatar's own rendering.

## Out of scope

- `RobotDisplaySection.tsx` (Roadmap 15.3) — already has its own read-only battery slider from Phase 15.1; this phase doesn't touch it further.
- `CompanyManager.tsx` (Roadmap 16) — separate component, separate redesign.
- The company `RadioButton`'s own labeling, options, or change behavior — reused exactly as-is.
- Exact avatar sizing, column proportions, and spacing in the new 2-column meta row — implementation details resolved at spec/implementation time, not fixed here.
- Deleting `AudioStatusBadge` itself, unless spec-time investigation confirms this card was its only consumer.
