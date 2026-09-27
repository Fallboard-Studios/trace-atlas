# Intent: Oblique Cabinetry — Foundation & Button (Roadmap Phase 11.1.1)

Confirmed via `/interview-me` on `docs/cabinets-rework`, 2026-09-07. Scopes the first item of the
[11.1.1–11.1.5 Oblique Cabinetry series](../todo/roadmap.md#1111-oblique-cabinetry-foundation--button),
itself split out of the original single "Oblique Cabinetry UI" roadmap item (too much surface area for
one phase — all 7 Design System primitives plus the voxel-track slider system at once) into one item
per component. This is the foundation item: the shared cabinet-box mechanism, proved out on `Button`
before `Toggle` (11.1.2) and the sliders (11.1.3–11.1.5) build on it.

## Outcome

Ship the shared cabinet-box rendering mechanism — SVG geometry, the fixed 2:1 projection vector, the
GSAP pop/morph timeline pattern, and a face-shading helper deriving Top/Left Face fill from the real
static "Ballast" tokens (`--color-accent`/`--color-surface`, not the seed-driven tokens Phase 11 shipped
and then cut) — plus a new, simple viewport-width breakpoint system: mobile ≤640px, tablet 641–1024px,
desktop >1024px, implemented as plain CSS (no JS/`ResizeObserver` — nothing else in this app needs
runtime breakpoint detection yet). Every existing `Button` in the app is wired through both at once,
since `Button` is a single shared component with no variant prop.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of the
console already leans on; Cabinetry gives every interactive primitive a consistent flat-at-rest,
extrudes-when-active physical identity.

## Why this scope first

`Button` is the simplest possible consumer of the shared mechanism: one box per control, a binary
flat/popped state, no voxel-track, and — uniquely among the 7 original primitives — a label that's
already the button's own nested content rather than an externally-composed `DualLabel` row. Building
and proving the mechanism here, on the least complex primitive, is deliberately cheaper than discovering
mid-`Toggle`-or-slider that the shared geometry doesn't actually generalize.

## Success

- Box height comes from the new breakpoint tiers (32px mobile / 40px tablet / 48px desktop); box width
  is variable, sized to the button's own content.
- The pop vector's magnitude scales 2:1 with box height (2×height right / 1×height down), consistent
  across all three breakpoints — e.g. +96px/+48px at the 48px desktop height.
- Hover, focus, and press/click are all treated as one "pop" trigger — full pop on any of them, no
  distinct click bounce, no partial-pop intermediate state. Off state is fully flat (0px offset, side
  walls collapsed).
- The button's own label (`DualLabel`, currently nested inside the `<button>` as its content per
  `Button.tsx`) visually travels with the popping front face, since it *is* the box's content — not
  duplicated into raw SVG `<text>` for its own sake. Whether that's implemented via `foreignObject` or a
  CSS-transformed DOM layer sharing the same GSAP timeline is left to the spec pass, not decided here.
- Disabled buttons stay permanently flat — no reaction to hover or focus, since there's nothing to
  react to. No third (disabled-but-reactive) extrusion state.
- `prefers-reduced-motion` snaps the pop/flat transition instantly instead of tweening, built in this
  item rather than deferred to 11.2 — same pattern `PowerRockerSwitch.css`/`AccordionContainer` already
  use elsewhere in this codebase.
- The clickable/touchable hit area covers the full popped-out footprint, not just the flat-state box, so
  the target never effectively shrinks.
- Every real `Button` call site in the app renders through the new cabinet box the moment this ships —
  no flag, no partial rollout, since `Button`'s internals change once for every consumer.

## Constraint

- The real `<button>` element keeps 100% of the actual interaction — click, keyboard, focus ring, ARIA
  state. The SVG cabinet box is a `pointer-events: none` cosmetic overlay reading the button's own state
  as props, never owning a hit-area itself (the "stationary hit box" rule — the front face slides as a
  pure visual, the real element underneath never moves, which is what prevents hover flutter).
- Per CLAUDE.md's Strict Separation guardrail: the GSAP timeline drives only the cosmetic pop/morph and
  never calls `AudioEngine`; `onClick` still fires straight from the native `<button>`'s own handler.
- Every cabinet pop/collapse and wall-polygon morph is a GSAP timeline registered in `timelineMap`
  (`setTimeline`/`killTimeline`), following `AccordionContainer`'s existing pattern — no timeline state
  in Zustand or React state.

## Out of scope

- `Toggle` and all 3 sliders (`SliderLinear`/`SliderLog`/`SliderCenteredZero`) — 11.1.2–11.1.5.
- `Stepper`/`StepperWithToggle` — dropped from Cabinetry scope entirely (no live consumer since Phase
  10.2 moved their former use cases to `SliderLinear`).
- Every other primitive's *externally*-composed `DualLabel` row — the box-riding label treatment is
  specific to `Button`, whose label is uniquely its own nested content; no other primitive's label moves
  with its box.
- The actual per-row/per-slider box-count layout question — deferred to a later, not-yet-numbered
  layout-rebuild phase.
- WorldView/terrain/sky styling (deferred to v2), robot visuals (locked to audio attributes per
  CLAUDE.md's Visual Mapping guardrail), the power rocker switch and the rest of the Sleeve casing (see
  `docs/CONSOLE_THEMING.md`).
- Accessibility/performance verification (keyboard walkthroughs, screen-reader pass, focus-ring
  visibility against a popped box, GSAP timeline load) — that's 11.2's job, once every 11.1.x item has
  shipped, not this item's.

## Forward Note

`docs/todo/roadmap.md`'s 11.1.1 section already carries this scope as its Create/Restructure/About
content (confirmed accurate against this intent during the interview, not rewritten by it). The
breakpoint system introduced here (mobile/tablet/desktop CSS tiers) is new to the codebase — nothing
else in `src/` uses viewport-width media queries today — and is exposed as reusable tokens so 11.1.2
onward can reference the same tiers rather than re-deriving them.
