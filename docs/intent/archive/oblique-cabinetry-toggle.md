# Intent: Oblique Cabinetry — Toggle (Roadmap Phase 11.1.2)

Confirmed via `/interview-me`, 2026-09-07. Scopes the second item of the
[11.1.1–11.1.5 Oblique Cabinetry series](../todo/roadmap.md#1112-oblique-cabinetry-toggle),
wiring `Toggle` into the shared cabinet-box mechanism
[11.1.1](oblique-cabinetry-foundation.md) built on `Button`.

## Outcome

`Toggle`'s current pill-track-and-sliding-thumb switch is fully replaced by a single bare,
textless `CabinetBox` standing in for the whole switch — flat at rest (off), fully popped (on) —
reusing the exact same `CABINET_POP_DISTANCE` protrusion and pop-proportional glow `Button`
already gets for free from the shared primitive. Nothing about the mechanism itself is new; this
item proves it generalizes to a second, differently-shaped consumer.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of the
console leans on. Where Button's cabinet box responds to momentary interaction, Toggle's responds
to a resting on/off state — the second and last single-box (non-voxel-track) consumer of the
mechanism.

## Why this scope first

`Toggle` is the natural next step after `Button`: still a single box, still a binary state, but
keyed off `checked` instead of a momentary hover/press, and — unlike `Button` — with no label
content of its own to carry inside the box. Confirming the mechanism holds up under a different
state source and a bare (contentless) box is the actual test this item runs; the sliders
(11.1.3–11.1.5) are a bigger step (voxel-track) that comes after.

## Success

- The pill+thumb visual is gone entirely, replaced by `CabinetBox` as the whole switch — not an
  overlay added on top of the still-sliding pill.
- `CabinetBox` is fixed at **32×32px**, not scaled by breakpoint — a toggle sits inline next to a
  label row rather than filling a hub tile, so it doesn't need the 32/40/48px tiers Button's
  content-driven box uses.
- Popped-out is the resting **on** state; flat is **off**. `popped` is driven purely by `checked`
  — never by hover, focus, or press.
- The box pops the same `CABINET_POP_DISTANCE` fixed magnitude as Button's, along the same 2:1
  vector, and carries the same pop-proportional `--cabinet-glow` — both inherited for free from
  the shared `CabinetBox` primitive, nothing Toggle-specific to build for either.
- `DualLabel` stays exactly where it is today — external to the switch, unchanged. It was never
  the switch's own content (unlike Button's nested label), so there's no reason to relocate it
  into the box now.
- Hovering or focusing a flat (off) toggle does nothing visually beyond Radix's existing
  `:focus-visible` outline — no partial-pop, no hover glow. `CabinetBox` only exposes a binary
  `popped` prop with no intermediate state (11.1.1 deliberately ruled that out even for Button),
  and this item isn't scoped to invent one.
- `Switch.Root` keeps 100% of the real interaction — role, `aria-checked`, keyboard, disabled
  state, focus ring — with `CabinetBox` rendered inside it as pure visual, replacing
  `Switch.Thumb`. The "stationary hit box" rule from 11.1.1 applies unchanged: the box is a visual
  read of state, never its own hit target.
- The existing `isActive` CSS hook and the `schema`/`value`/`onChange` contract are unchanged —
  `onChange` still fires straight from Radix's `onCheckedChange`, never from the cabinet timeline.
- Every real `Toggle` call site in the app renders through the new cabinet box the moment this
  ships — no flag, no partial rollout, matching 11.1.1's own rollout for `Button`.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: the GSAP timeline drives only the cosmetic
  pop/morph and never calls `AudioEngine`; `onChange` still fires straight from Radix's
  `Switch.Root`.
- Every cabinet pop/collapse and wall-polygon morph is a GSAP timeline registered in
  `timelineMap` (`setTimeline`/`killTimeline`), same as 11.1.1 — no timeline state in Zustand or
  React state.
- `prefers-reduced-motion` snaps the pop/flat transition instantly instead of tweening — inherited
  for free from `CabinetBox`/`cabinetAnimation.ts`, nothing new to build.

## Out of scope

- Every slider (`SliderLinear`/`SliderLog`/`SliderCenteredZero`) — 11.1.3–11.1.5.
- Any new hover/partial-pop mechanism — flat toggles stay fully inert except for the existing
  focus-visible outline.
- Repositioning `DualLabel` — it stays external to the switch, exactly as today.
- Breakpoint-based sizing for this box — fixed 32×32px regardless of viewport, unlike Button's
  content-driven, breakpoint-scaled box.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely — see 11.1.1), WorldView/
  terrain/sky styling, robot visuals, the power rocker switch and the rest of the Sleeve casing —
  same exclusions as 11.1.1.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has shipped.

## Forward Note

`docs/todo/roadmap.md`'s 11.1.2 section already carries this scope as its Create/Restructure/
About content, confirmed accurate against this intent during the interview. With this item
shipped, 11.1.3 (`SliderLinear`) starts the genuinely different voxel-track rendering shape — the
last two single-box consumers (Button, Toggle) will be done.
