# Intent: Oblique Cabinetry — AccordionContainer (Roadmap Phase 11.1.7)

Confirmed via `/interview-me`, 2026-09-10. Scopes
[11.1.7](../todo/roadmap.md#1117-oblique-cabinetry-accordioncontainer), wiring `AccordionContainer`'s
trigger into the shared cabinet-box mechanism [11.1.1](oblique-cabinetry-foundation.md) built. Diverges
from the roadmap draft's original one-box/state-keyed-pop framing (11.1.2's/[11.1.6](oblique-cabinetry-radio-button.md)'s
precedent) — surfaced and corrected during the interview, see Outcome below.

## Outcome

The trigger splits into two separate cabinet elements, not one:

1. **A static, permanently-popped `CabinetBox`** wraps just the trigger row (the indicator's position
   plus `DualLabel`) — full row width, giving it the Oblique Cabinetry facade look with **zero animation
   ever tied to it**. Rendered once at `popped={1}` with `skipMountAnimation` so it positions directly at
   the fully-popped geometry on mount and never transitions again — no `timelineMap` entry needed, since
   `poppedT` never changes. Height comes from a **new small tuned fixed-pixel constant** sized to the
   row's own content (indicator + label + padding) — "row-natural," not `Button`'s breakpoint-driven
   32/40/48px tiers, since a full-width trigger bar reads as a bar, not a square hub tile. No accent tint —
   stays on `CabinetBox.css`'s plain `--color-surface` default.
2. **The `+`/`−` indicator itself becomes its own small, genuinely-animated `CabinetBox`**, in its current
   position (left of the label) — popped when the section is open, flat when closed, reusing
   [Toggle](oblique-cabinetry-toggle.md)'s exact state-keyed (not hover/focus/press) pop precedent and its
   `CABINET_TOGGLE_BOX_SIZE = 32` constant as-is, rather than a new tuned size. Keeps showing the `+`/`−`
   glyph as its content (pop *and* glyph both signal state, redundantly) — not a bare textless box. No
   accent tint, matching `Toggle`'s own restrained no-extra-color-cue precedent. This is the only part of
   the trigger that actually animates, and the only new `timelineMap` entry this item adds.

The content panel (`Accordion.Content`, its existing GSAP height tween) is untouched and stays visually
continuous with the static facade's surface (same background color, no border) rather than being nested
inside a box whose geometry would need to resize as the content opens/closes — nothing in Cabinetry
currently tracks live *height* changes, and this item doesn't add that.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of the console
leans on.

## Scope: every real consumer

Four real call sites, all closed by default (`defaultOpen` unused everywhere today): `PingControlsDrawer`,
`PingContourDrawer`, `SignatureArrayDrawer`, and `AudioRigDrawer` (4 accordion instances — the Transport/
Composition section plus the 3 mapped `AUDIO_RIG_ACCORDION_GROUPS`). Stacked accordions in the same drawer
already get real spacing from each drawer's own flex `gap` (e.g. `AudioRigDrawer.css`'s `gap: 12px`), not
from `.sc-accordion`'s own border — so removing that border shouldn't make adjacent sections visually run
together.

## Success

- **Outer chrome removed entirely**: today's `.sc-accordion` wrapper (border, 4px `border-radius`,
  `overflow: hidden`) and `.sc-accordion__trigger`'s own `background-color` both go away — the static
  popped facade becomes the section's only visible edge. `.sc-accordion__content`'s own separate
  `overflow: hidden` (needed for the height tween) is unaffected and stays.
- The animated toggle box is **purely visual/decorative**, like `Toggle`'s own box — the real
  `Accordion.Trigger` click target is unchanged and still spans the whole row; the toggle box does not
  become a second independent interactive element.
- Two `timelineMap` entries per instance once this ships: the existing content-height tween
  (`accordion-${schema.id}`) and a new one for the small toggle's pop (e.g.
  `cabinet-accordion-toggle-${schema.id}`) — the static outer facade registers no timeline at all.
- Same `schema`/`children`/`defaultOpen` contract as today; `handleValueChange`/`animateTo` (the content
  tween) are unchanged.
- Same fixed 2:1 vector, `CABINET_POP_DISTANCE`, and sharp (no `border-radius`) front-face corners as every
  prior item on both boxes — inherited for free from the shared `CabinetBox` primitive.
- Every real call site renders through the new rendering the moment this ships — no flag, no partial
  rollout, matching every prior 11.1.x item's own rollout.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: the toggle box's GSAP pop timeline drives only its own
  cosmetic pop/glow and never calls `AudioEngine`; `onValueChange` still fires the real open-state change
  directly, never from a cabinet timeline.
- The toggle box's pop/collapse is a GSAP timeline registered in `timelineMap`
  (`setTimeline`/`killTimeline`); no timeline state in Zustand or React state.
- `prefers-reduced-motion` snaps the toggle box's pop/flat transition instantly instead of tweening —
  inherited for free from `CabinetBox`/`cabinetAnimation.ts`.

## Out of scope

- Any hover/focus partial-pop on either box — both stay state-keyed only (open vs. closed for the toggle
  box; permanently popped for the static facade), same as `Toggle`'s flat/popped-only precedent.
- Exact pixel value for the new static-facade height constant, and any spacing/`zIndex` fine-tuning between
  the two boxes — left to this item's own spec-driven-development pass, the same way 11.1.1–11.1.6 each
  left their own fine geometry to their spec rather than the roadmap/interview level.
- Nesting the content panel inside the static facade's own resizing geometry — explicitly rejected during
  the interview; the content panel stays a visually-matched but structurally separate element.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely — see 11.1.1), WorldView/terrain/sky
  styling, robot visuals, the power rocker switch, and the rest of the Sleeve casing — same exclusions as
  every prior item.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has shipped.
- `Select`, `TextInput`/`CoordsInput` — 11.1.8–11.1.9, not this item.

## Forward Note

The roadmap draft's own 11.1.7 section (written before this interview) describes a single state-keyed
`CabinetBox` for the whole trigger row, generalizing 11.1.2's precedent the same way 11.1.6 did — this
intent supersedes that framing. The real design has two elements at two different "always on"/"state-keyed"
points on the same spectrum: a facade that's permanently at one extreme (always popped, no transition) and
a small control that's genuinely bistable (popped/flat, animated) — worth flagging in this item's own spec
pass as a new pattern for the series, since 11.1.1–11.1.6 only ever had boxes that were either always
interactive-state-keyed or always momentary, never one of each coexisting in the same control.
